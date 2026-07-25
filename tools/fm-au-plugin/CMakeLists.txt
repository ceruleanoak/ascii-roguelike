# FMVoice — DX7 FM synthesis as an Audio Unit instrument, built without Xcode.app.
#
# Deliberately NOT using the Xcode generator. JUCE was ruled out because its CMake
# AU target shells out to `xcodebuild`, which only ships with the full Xcode.app;
# Apple's AudioUnitSDK ships only an .xcodeproj but explicitly sanctions compiling
# its sources directly as part of your own target, which is what we do here. The
# .component bundle is then assembled by hand, since there is no Xcode packaging
# step to do it for us.
#
#   cmake -B build && cmake --build build      # produces build/FMVoice.component
#   cmake --build build --target install-au    # copies it to ~/Library/Audio/Plug-Ins/Components
#   cmake --build build --target validate      # runs auval

cmake_minimum_required(VERSION 3.24)
project(FMVoice CXX)

if(CMAKE_GENERATOR STREQUAL "Xcode")
  message(FATAL_ERROR
    "The Xcode generator needs Xcode.app, which this project exists to avoid. "
    "Configure with the default generator: cmake -B build")
endif()

set(CMAKE_CXX_STANDARD 23)          # AudioUnitSDK 1.4.0 uses std::expected
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)   # only AUSDK_EXPORT'd symbols escape

# The plugin's 4-character Audio Unit identity. These must stay in sync with the
# AudioComponents array in Info.plist; `validate` reuses them for auval.
set(AU_TYPE aumu)
set(AU_SUBTYPE Fmv1)
set(AU_MANUFACTURER Cok1)

# ---- libc++ header fallback -------------------------------------------------
# This machine's Command Line Tools install is partial: the toolchain's own
# include/c++/v1 directory exists but contains only __cxx_version, so clang finds
# it, stops searching, and never falls back to the SDK's real libc++ headers.
# Detect that and point at the SDK copy rather than silently failing on <cmath>.
include(CheckIncludeFileCXX)
check_include_file_cxx(bitset HAVE_WORKING_LIBCXX)
if(NOT HAVE_WORKING_LIBCXX)
  execute_process(COMMAND xcrun --show-sdk-path
                  OUTPUT_VARIABLE MACOS_SDK_PATH
                  OUTPUT_STRIP_TRAILING_WHITESPACE)
  set(LIBCXX_FALLBACK_INCLUDE "${MACOS_SDK_PATH}/usr/include/c++/v1")
  if(NOT EXISTS "${LIBCXX_FALLBACK_INCLUDE}/bitset")
    message(FATAL_ERROR
      "No usable libc++ headers: not in the toolchain, and not at "
      "${LIBCXX_FALLBACK_INCLUDE}. Try: xcode-select --install")
  endif()
  message(STATUS "libc++ headers missing from toolchain; falling back to ${LIBCXX_FALLBACK_INCLUDE}")
endif()

# ---- Apple AudioUnitSDK (fetched, not committed) ----------------------------
include(FetchContent)
FetchContent_Declare(AudioUnitSDK
  GIT_REPOSITORY https://github.com/apple/AudioUnitSDK.git
  GIT_TAG        AudioUnitSDK-1.4.0
  GIT_SHALLOW    TRUE
  SOURCE_DIR     ${CMAKE_CURRENT_SOURCE_DIR}/vendor/AudioUnitSDK)
# The SDK has no CMakeLists.txt, so this only populates the source tree.
FetchContent_MakeAvailable(AudioUnitSDK)

set(AUSDK_DIR ${CMAKE_CURRENT_SOURCE_DIR}/vendor/AudioUnitSDK)
set(AUSDK_SOURCES
  ${AUSDK_DIR}/src/AudioUnitSDK/AUBase.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUBuffer.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUBufferAllocator.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUEffectBase.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUInputElement.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUMIDIBase.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUMIDIEffectBase.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUOutputElement.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUPlugInDispatch.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/AUScopeElement.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/ComponentBase.cpp
  ${AUSDK_DIR}/src/AudioUnitSDK/MusicDeviceBase.cpp)

# ---- the plugin binary ------------------------------------------------------
# MODULE gives us an MH_BUNDLE, which is what an AU component's executable is.
add_library(FMVoice MODULE
  Source/DX7Voice.cpp
  Source/DX7Patch.cpp
  Source/PluginEntry.cpp
  ${AUSDK_SOURCES})

set_target_properties(FMVoice PROPERTIES
  OUTPUT_NAME FMVoice
  PREFIX ""
  SUFFIX "")

target_include_directories(FMVoice PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/Source
  ${AUSDK_DIR}/include)

if(LIBCXX_FALLBACK_INCLUDE)
  target_include_directories(FMVoice SYSTEM PRIVATE ${LIBCXX_FALLBACK_INCLUDE})
endif()

target_compile_options(FMVoice PRIVATE -Wall -Wextra -Wno-unused-parameter)

target_link_libraries(FMVoice PRIVATE
  "-framework AudioToolbox"
  "-framework AudioUnit"
  "-framework CoreAudio"
  "-framework CoreFoundation")

# ---- bundle assembly --------------------------------------------------------
# No Xcode packaging step exists here, so lay out the classic AU bundle by hand:
#   FMVoice.component/Contents/{Info.plist,PkgInfo,MacOS/FMVoice,Resources/}
# then ad-hoc sign it, which macOS requires before it will load the component.
set(BUNDLE_DIR ${CMAKE_BINARY_DIR}/FMVoice.component)
set(PKGINFO ${CMAKE_BINARY_DIR}/PkgInfo)
file(WRITE ${PKGINFO} "BNDL????")

add_custom_command(TARGET FMVoice POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E rm -rf ${BUNDLE_DIR}
  COMMAND ${CMAKE_COMMAND} -E make_directory ${BUNDLE_DIR}/Contents/MacOS
  COMMAND ${CMAKE_COMMAND} -E make_directory ${BUNDLE_DIR}/Contents/Resources
  COMMAND ${CMAKE_COMMAND} -E copy ${CMAKE_CURRENT_SOURCE_DIR}/Info.plist
          ${BUNDLE_DIR}/Contents/Info.plist
  COMMAND ${CMAKE_COMMAND} -E copy ${PKGINFO} ${BUNDLE_DIR}/Contents/PkgInfo
  COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:FMVoice> ${BUNDLE_DIR}/Contents/MacOS/FMVoice
  COMMAND codesign --force --sign - ${BUNDLE_DIR}
  COMMENT "Assembling and ad-hoc signing FMVoice.component"
  VERBATIM)

# ---- parity harness ---------------------------------------------------------
# Renders a patch through the ported engine alone (no AU, no CoreAudio) so
# scripts/parity-check.cjs can diff it against the JS reference sample for sample.
add_executable(parity-render EXCLUDE_FROM_ALL
  tests/parity-render.cpp
  Source/DX7Voice.cpp
  Source/DX7Patch.cpp)
target_include_directories(parity-render PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/Source)
if(LIBCXX_FALLBACK_INCLUDE)
  target_include_directories(parity-render SYSTEM PRIVATE ${LIBCXX_FALLBACK_INCLUDE})
endif()

# Drives the *installed* component through the real AudioUnit C API, to establish
# whether a patch-loading path works in the plugin before blaming a host for it.
add_executable(host-test EXCLUDE_FROM_ALL tests/host-test.cpp)
target_link_libraries(host-test PRIVATE
  "-framework AudioToolbox" "-framework AudioUnit" "-framework CoreFoundation")
if(LIBCXX_FALLBACK_INCLUDE)
  target_include_directories(host-test SYSTEM PRIVATE ${LIBCXX_FALLBACK_INCLUDE})
endif()

# ---- install / validate -----------------------------------------------------
set(AU_INSTALL_DIR $ENV{HOME}/Library/Audio/Plug-Ins/Components)

add_custom_target(install-au
  COMMAND ${CMAKE_COMMAND} -E make_directory ${AU_INSTALL_DIR}
  COMMAND ${CMAKE_COMMAND} -E rm -rf ${AU_INSTALL_DIR}/FMVoice.component
  COMMAND ${CMAKE_COMMAND} -E copy_directory ${BUNDLE_DIR}
          ${AU_INSTALL_DIR}/FMVoice.component
  DEPENDS FMVoice
  COMMENT "Installing FMVoice.component to ${AU_INSTALL_DIR}"
  VERBATIM)

# auval is the real gate on the hand-written Info.plist and entry-point wiring.
# It lives at /usr/bin/auval and does NOT require Xcode.app.
add_custom_target(validate
  COMMAND auval -v ${AU_TYPE} ${AU_SUBTYPE} ${AU_MANUFACTURER}
  DEPENDS install-au
  COMMENT "Validating with auval -v ${AU_TYPE} ${AU_SUBTYPE} ${AU_MANUFACTURER}"
  VERBATIM)
