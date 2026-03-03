/**
 * AudioSystem - Hybrid music system with Web Audio API
 *
 * Features:
 * - Single-track mode for title screen (HTML5 Audio with custom loop points)
 * - Dual-layer mode for gameplay (Web Audio API for perfect sync)
 * - Gapless looping using Web Audio API
 * - Dynamic layer 2 muting based on game state
 * - Handles browser autoplay policies
 *
 * Best practices based on 2026 standards:
 * - Uses AudioContext + AudioBufferSourceNode for sample-accurate playback
 * - GainNodes for smooth volume control
 * - Preloads entire tracks into memory for zero-gap looping
 */

export class AudioSystem {
  constructor() {
    // Mode: 'single' (title screen) or 'dual' (gameplay)
    this.mode = null;

    // Single-track mode (HTML5 Audio for title screen)
    this.audioElement = null;
    this.loopStartTime = 0;

    // Dual-layer mode (Web Audio API for gameplay)
    this.audioContext = null;
    this.layer1Buffer = null;
    this.layer2Buffer = null;
    this.layer1Source = null;
    this.layer2Source = null;
    this.layer1Gain = null;
    this.layer2Gain = null;
    this.layer2Muted = true; // Start muted
    this.playbackStartTime = 0; // Track when playback started (for loop sync)
    this.pendingLayer2State = null; // Desired layer 2 state if music not playing yet

    // Sound effects (Web Audio API)
    this.sfxBuffers = {}; // Map of SFX name -> AudioBuffer
    this.sfxGain = null;
    this.sfxVolume = 0.5; // SFX volume (0.0 to 1.0)
    this.stoppableSources = {}; // Map of SFX name -> { source, gainNode } for stoppable playback

    // Shared state
    this.isPlaying = false;
    this.autoplayBlocked = false;
    this.userInteractionListener = null;
    this.masterVolume = 0.7;
  }

  /**
   * Load single-track music for title screen (HTML5 Audio with custom loop point)
   * @param {string} audioPath - Path to audio file
   * @param {number} loopStartTime - Time in seconds to loop back to (default 0)
   * @param {number} volume - Volume level 0.0 to 1.0 (default 0.7)
   */
  loadSingleTrack(audioPath, loopStartTime = 0, volume = 0.7) {
    // Clean up any existing audio
    this.dispose();

    this.mode = 'single';
    this.masterVolume = volume;
    this.loopStartTime = loopStartTime;

    // Create audio element
    this.audioElement = new Audio(audioPath);
    this.audioElement.volume = volume;

    // Monitor playback for custom loop point
    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement && this.isPlaying && this.audioElement.duration) {
        // Loop back 0.5 seconds before the end
        if (this.audioElement.currentTime >= this.audioElement.duration - 0.5) {
          this.audioElement.currentTime = this.loopStartTime;
        }
      }
    });

    // Fallback for 'ended' event
    this.audioElement.addEventListener('ended', () => {
      if (this.isPlaying) {
        this.audioElement.currentTime = this.loopStartTime;
        this.audioElement.play();
      }
    });

    // Log metadata
    this.audioElement.addEventListener('loadedmetadata', () => {
      // Metadata loaded successfully
    });

    // Error handling
    this.audioElement.addEventListener('error', (e) => {
      console.error('[Audio] Loading error:', e);
      console.error('[Audio] Failed to load:', audioPath);
    });

    return this;
  }

  /**
   * Load dual-layer music for gameplay (Web Audio API)
   * @param {string} layer1Path - Path to layer 1 (always playing)
   * @param {string} layer2Path - Path to layer 2 (toggled in EXPLORE mode)
   * @param {number} masterVolume - Master volume 0.0 to 1.0 (default 0.7)
   */
  async loadMusic(layer1Path, layer2Path, masterVolume = 0.7) {
    // Clean up any existing audio
    this.dispose();

    this.mode = 'dual';
    this.masterVolume = masterVolume;

    // Create audio context (suspended until user interaction)
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    try {
      // Load both layers in parallel
      const [layer1Data, layer2Data] = await Promise.all([
        this.fetchAudioBuffer(layer1Path),
        this.fetchAudioBuffer(layer2Path)
      ]);

      // Decode audio data into buffers
      [this.layer1Buffer, this.layer2Buffer] = await Promise.all([
        this.audioContext.decodeAudioData(layer1Data),
        this.audioContext.decodeAudioData(layer2Data)
      ]);

      // Create gain nodes for volume control
      this.layer1Gain = this.audioContext.createGain();
      this.layer2Gain = this.audioContext.createGain();
      this.sfxGain = this.audioContext.createGain();

      // Connect gain nodes to output
      this.layer1Gain.connect(this.audioContext.destination);
      this.layer2Gain.connect(this.audioContext.destination);
      this.sfxGain.connect(this.audioContext.destination);

      // Set initial volumes
      this.layer1Gain.gain.value = this.masterVolume;
      this.layer2Gain.gain.value = 0; // Start muted
      this.sfxGain.gain.value = this.sfxVolume;

      return true;
    } catch (error) {
      console.error('[Audio] Failed to load dual-layer music:', error);
      return false;
    }
  }

  /**
   * Fetch audio file as ArrayBuffer
   * @param {string} path - Path to audio file
   * @returns {Promise<ArrayBuffer>}
   */
  async fetchAudioBuffer(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${path}`);
    }
    return await response.arrayBuffer();
  }

  /**
   * Load a sound effect
   * @param {string} name - SFX identifier (e.g., 'aggro', 'destroy')
   * @param {string} path - Path to SFX file
   */
  async loadSFX(name, path) {
    // Ensure we have an audio context
    if (!this.audioContext) {
      console.warn('[Audio] Cannot load SFX - audio context not initialized');
      return false;
    }

    try {
      const audioData = await this.fetchAudioBuffer(path);
      const buffer = await this.audioContext.decodeAudioData(audioData);
      this.sfxBuffers[name] = buffer;
      return true;
    } catch (error) {
      console.error(`[Audio] Failed to load SFX ${name}:`, error);
      return false;
    }
  }

  /**
   * Play a sound effect (one-shot, allows multiple overlapping instances)
   * @param {string} name - SFX identifier
   * @param {number} volume - Volume multiplier 0.0 to 1.0 (default 1.0)
   */
  playSFX(name, volume = 1.0) {
    if (!this.sfxBuffers[name] || !this.audioContext || !this.sfxGain) {
      console.warn(`[Audio] Cannot play SFX: ${name} (not loaded or context unavailable)`);
      return;
    }

    try {
      // Create a new source node for this SFX instance
      const source = this.audioContext.createBufferSource();
      source.buffer = this.sfxBuffers[name];

      // Create a gain node for this specific instance
      const instanceGain = this.audioContext.createGain();
      instanceGain.gain.value = volume;

      // Connect: source -> instance gain -> sfx master gain -> output
      source.connect(instanceGain);
      instanceGain.connect(this.sfxGain);

      // Play the sound (one-shot, will auto-disconnect when finished)
      source.start(0);

      // Clean up after playback
      source.onended = () => {
        source.disconnect();
        instanceGain.disconnect();
      };
    } catch (error) {
      console.error(`[Audio] Error playing SFX ${name}:`, error);
    }
  }

  /**
   * Play a sound effect that can be stopped before it finishes.
   * Stops any previous instance of the same name before playing.
   * @param {string} name - SFX identifier
   * @param {number} volume - Volume multiplier 0.0 to 1.0 (default 1.0)
   */
  playStoppableSFX(name, volume = 1.0) {
    if (!this.sfxBuffers[name] || !this.audioContext || !this.sfxGain) return;

    // Stop any existing instance of this SFX
    this.stopSFXByName(name);

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.sfxBuffers[name];

      const instanceGain = this.audioContext.createGain();
      instanceGain.gain.value = volume;

      source.connect(instanceGain);
      instanceGain.connect(this.sfxGain);

      this.stoppableSources[name] = { source, gainNode: instanceGain };

      source.onended = () => {
        if (this.stoppableSources[name] && this.stoppableSources[name].source === source) {
          delete this.stoppableSources[name];
        }
        source.disconnect();
        instanceGain.disconnect();
      };

      source.start(0);
    } catch (error) {
      console.error(`[Audio] Error playing stoppable SFX ${name}:`, error);
    }
  }

  /**
   * Stop a named stoppable SFX if it's currently playing.
   * @param {string} name - SFX identifier
   */
  stopSFXByName(name) {
    const entry = this.stoppableSources[name];
    if (entry) {
      try {
        entry.source.stop();
      } catch (_) {
        // Already stopped
      }
      delete this.stoppableSources[name];
    }
  }

  /**
   * Set SFX master volume
   * @param {number} volume - Volume 0.0 to 1.0
   */
  setSFXVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  /**
   * Start playing music (handles both single and dual modes)
   */
  play() {
    if (this.isPlaying) return;

    if (this.mode === 'single') {
      this.playSingleTrack();
    } else if (this.mode === 'dual') {
      this.playDualLayer();
    }
  }

  /**
   * Play single-track music (HTML5 Audio)
   */
  playSingleTrack() {
    if (!this.audioElement) return;

    const playPromise = this.audioElement.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
          this.autoplayBlocked = false;
        })
        .catch(error => {
          console.warn('[Audio] Autoplay blocked - will start on first user interaction');
          this.autoplayBlocked = true;
          this.setupAutoplayUnblock();
        });
    }
  }

  /**
   * Play dual-layer music (Web Audio API)
   */
  playDualLayer() {
    if (!this.layer1Buffer || !this.layer2Buffer) return;

    // Resume audio context (required by browser autoplay policies)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        this.startDualSources();
      }).catch(error => {
        console.warn('[Audio] Autoplay blocked - will start on first user interaction');
        this.autoplayBlocked = true;
        this.setupAutoplayUnblock();
      });
    } else {
      this.startDualSources();
    }
  }

  /**
   * Create and start dual audio source nodes simultaneously
   */
  startDualSources() {
    // Create source nodes for both layers
    this.layer1Source = this.audioContext.createBufferSource();
    this.layer2Source = this.audioContext.createBufferSource();

    // Assign buffers
    this.layer1Source.buffer = this.layer1Buffer;
    this.layer2Source.buffer = this.layer2Buffer;

    // Enable gapless looping
    this.layer1Source.loop = true;
    this.layer2Source.loop = true;

    // Connect to gain nodes
    this.layer1Source.connect(this.layer1Gain);
    this.layer2Source.connect(this.layer2Gain);

    // Start both sources at the EXACT same time (sample-accurate sync)
    const startTime = this.audioContext.currentTime;
    this.layer1Source.start(startTime);
    this.layer2Source.start(startTime);

    // Track playback start time for loop synchronization
    this.playbackStartTime = startTime;

    this.isPlaying = true;
    this.autoplayBlocked = false;

    // Apply pending layer 2 state if one was requested before playback started
    if (this.pendingLayer2State !== null) {
      const pendingState = this.pendingLayer2State;
      this.pendingLayer2State = null;
      this.setLayer2Enabled(pendingState);
    }
  }

  /**
   * Stop music and clean up sources
   */
  stop() {
    if (this.mode === 'single' && this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    } else if (this.mode === 'dual') {
      if (this.layer1Source) {
        this.layer1Source.stop();
        this.layer1Source.disconnect();
        this.layer1Source = null;
      }
      if (this.layer2Source) {
        this.layer2Source.stop();
        this.layer2Source.disconnect();
        this.layer2Source = null;
      }
    }
    this.isPlaying = false;
    this.removeAutoplayUnblock();
  }

  /**
   * Toggle layer 2 (bassline) on/off (dual mode only)
   * When enabling, waits until the next loop start for perfect sync
   * When disabling, waits until the current loop ends for smooth musical transition
   * @param {boolean} enabled - True to unmute layer 2, false to mute
   */
  setLayer2Enabled(enabled) {
    if (this.mode !== 'dual' || !this.layer2Gain) return;

    // If music isn't playing yet, store the desired state to apply when playback starts
    if (!this.isPlaying) {
      this.pendingLayer2State = enabled;
      return;
    }

    this.layer2Muted = !enabled;

    const currentTime = this.audioContext.currentTime;
    const fadeTime = 0.1; // 100ms fade
    const loopDuration = this.layer1Buffer.duration;
    const elapsedTime = currentTime - this.playbackStartTime;
    const currentPositionInLoop = elapsedTime % loopDuration;
    const timeUntilLoopEnd = loopDuration - currentPositionInLoop;

    this.layer2Gain.gain.cancelScheduledValues(currentTime);

    if (enabled) {
      // When enabling, wait until the next loop start for perfect sync
      const nextLoopStartTime = currentTime + timeUntilLoopEnd;

      this.layer2Gain.gain.setValueAtTime(0, currentTime);
      this.layer2Gain.gain.setValueAtTime(0, nextLoopStartTime);
      this.layer2Gain.gain.linearRampToValueAtTime(
        this.masterVolume,
        nextLoopStartTime + fadeTime
      );
    } else {
      // When disabling, wait until the current loop ends for smooth transition
      const loopEndTime = currentTime + timeUntilLoopEnd;

      this.layer2Gain.gain.setValueAtTime(this.layer2Gain.gain.value, currentTime);
      this.layer2Gain.gain.setValueAtTime(this.masterVolume, loopEndTime - fadeTime);
      this.layer2Gain.gain.linearRampToValueAtTime(0, loopEndTime);
    }
  }

  /**
   * Get current layer 2 state
   * @returns {boolean} True if layer 2 is enabled
   */
  isLayer2Enabled() {
    return !this.layer2Muted;
  }

  /**
   * Set master volume
   * @param {number} volume - Volume 0.0 to 1.0
   */
  setVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));

    if (this.mode === 'single' && this.audioElement) {
      this.audioElement.volume = this.masterVolume;
    } else if (this.mode === 'dual') {
      if (this.layer1Gain) {
        this.layer1Gain.gain.value = this.masterVolume;
      }
      if (this.layer2Gain && !this.layer2Muted) {
        this.layer2Gain.gain.value = this.masterVolume;
      }
    }
  }

  /**
   * Get current master volume
   * @returns {number} Volume level 0.0 to 1.0
   */
  getVolume() {
    return this.masterVolume;
  }

  /**
   * Set up listener to start music on first user interaction
   */
  setupAutoplayUnblock() {
    if (this.userInteractionListener) return;

    this.userInteractionListener = () => {
      if (this.autoplayBlocked) {
        if (this.mode === 'single' && this.audioElement) {
          this.audioElement.play()
            .then(() => {
              this.isPlaying = true;
              this.autoplayBlocked = false;
              this.removeAutoplayUnblock();
            })
            .catch(err => {
              console.error('[Audio] Failed to play after user interaction:', err);
            });
        } else if (this.mode === 'dual' && this.audioContext) {
          this.audioContext.resume().then(() => {
            if (!this.isPlaying) {
              this.startDualSources();
            }
            this.removeAutoplayUnblock();
          }).catch(err => {
            console.error('[Audio] Failed to resume after user interaction:', err);
          });
        }
      }
    };

    // Listen for any user interaction
    document.addEventListener('keydown', this.userInteractionListener, { once: true });
    document.addEventListener('click', this.userInteractionListener, { once: true });
  }

  /**
   * Remove autoplay unblock listeners
   */
  removeAutoplayUnblock() {
    if (this.userInteractionListener) {
      document.removeEventListener('keydown', this.userInteractionListener);
      document.removeEventListener('click', this.userInteractionListener);
      this.userInteractionListener = null;
    }
  }

  /**
   * Check if music is currently playing
   * @returns {boolean}
   */
  isCurrentlyPlaying() {
    return this.isPlaying;
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.stop();
    this.removeAutoplayUnblock();

    // Clean up single-track resources
    if (this.audioElement) {
      this.audioElement.src = '';
      this.audioElement = null;
    }

    // Clean up dual-layer resources
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.layer1Buffer = null;
    this.layer2Buffer = null;
    this.layer1Gain = null;
    this.layer2Gain = null;
    this.mode = null;
  }
}
