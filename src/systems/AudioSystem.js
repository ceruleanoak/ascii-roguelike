/**
 * AudioSystem - Web Audio API music system
 *
 * Features:
 * - Single-track mode for title screen (Web Audio API with sample-accurate loop point)
 * - Dual-layer mode for gameplay (Web Audio API for perfect sync)
 * - Gapless looping using AudioBufferSourceNode
 * - Dynamic layer 2 muting based on game state
 * - Handles browser autoplay policies
 *
 * Both modes use Web Audio API exclusively — no HTML5 Audio elements.
 */

export class AudioSystem {
  constructor() {
    // Mode: 'single' (title screen) or 'dual' (gameplay)
    this.mode = null;

    // Shared Web Audio API context
    this.audioContext = null;

    // Single-track mode
    this.singleBuffer = null;
    this.singleSource = null;
    this.singleGain = null;
    this.loopStart = 0;

    // Dual-layer mode
    this.layer1Buffer = null;
    this.layer2Buffer = null;
    this.layer1Source = null;
    this.layer2Source = null;
    this.layer1Gain = null;
    this.layer2Gain = null;
    this.layer2Muted = true;
    this.playbackStartTime = 0;
    this.pendingLayer2State = null;

    // Sound effects
    this.sfxBuffers = {};
    this.sfxGain = null;
    this.sfxVolume = 0.5;
    this.stoppableSources = {};
    // Per-SFX GainNodes created once at loadSFX time, reused across plays.
    // This avoids creating a new GainNode on every playSFX call, which
    // generates GC pressure that compounds over long sessions.
    this.sfxNodeGains = {};
    // Limit concurrent plays of the same one-shot SFX to prevent node storms
    // when many enemies aggro simultaneously.
    this.sfxActiveSources = {}; // name → AudioBufferSourceNode[]
    this.sfxMaxConcurrent = 4;

    // Boss music (sequential playlist mode)
    this.bossBuffers = [];            // AudioBuffer[5] — tracks 1–5
    this.bossLoopBuffer = null;       // AudioBuffer — stinger after boss damage
    this.bossSequenceIndex = 0;       // current track index (0–4)
    this.bossSequenceSource = null;   // current AudioBufferSourceNode
    this.bossLoopPending = false;     // boss took damage — queue stinger next
    this.bossLoopPlaying = false;     // stinger currently playing
    this.bossAnticipationActive = false; // true = mini-loop mode (tracks 0–1 only)
    this.bossSequencePending = false; // true = switch to full 5-track at next boundary

    // Red zone music (sequential 3-part: A/B out of combat, B/C in combat)
    // Out of combat: A → B → A → B …
    // In combat:    B → C → B → C …
    // Transitions happen at the end of the currently playing track.
    this.redBuffers = [];             // AudioBuffer[3] — A=0, B=1, C=2
    this.redSequenceSource = null;    // current AudioBufferSourceNode
    this.redCurrentIndex = 0;         // 0=A, 1=B, 2=C
    this.redCombatActive = false;     // updated by setLayer2Enabled while in red mode

    // Shared state
    this.isPlaying = false;
    this.autoplayBlocked = false;
    this.userInteractionListener = null;
    this.autoResumeListener = null;
    this.visibilityChangeListener = null;
    this.masterVolume = 0.7;

    // Tracks which zone's music is currently loaded (for zone-specific music switching)
    this.currentMusicZone = 'green';
  }

  /**
   * Load single-track music for title screen (Web Audio API with sample-accurate loop point)
   * @param {string} audioPath - Path to audio file
   * @param {number} loopStart - Time in seconds to loop back to (default 0)
   * @param {number} volume - Volume level 0.0 to 1.0 (default 0.7)
   */
  async loadSingleTrack(audioPath, loopStart = 0, volume = 0.7) {
    this.dispose();

    this.mode = 'single';
    this.masterVolume = volume;
    this.loopStart = loopStart;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    this.singleGain = this.audioContext.createGain();
    this.singleGain.gain.value = volume;
    this.singleGain.connect(this.audioContext.destination);

    this.sfxGain = this.audioContext.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.audioContext.destination);

    this.armAutoResume();

    try {
      const audioData = await this.fetchAudioBuffer(audioPath);
      this.singleBuffer = await this.audioContext.decodeAudioData(audioData);
    } catch (error) {
      console.error('[Audio] Failed to load single track:', error);
    }
  }

  /**
   * Register a one-shot listener that resumes the AudioContext on the
   * first user gesture of any kind. Browsers require a user gesture to
   * transition the context from 'suspended' → 'running'; without this,
   * SFX silently no-op until the player clicks the launch button.
   *
   * Idempotent — repeat calls do nothing. The listener removes itself
   * once the context is running.
   */
  armAutoResume() {
    if (this.autoResumeListener || !this.audioContext) return;

    // Kept armed for the full lifetime of the AudioContext. Browsers (Chrome in
    // particular) re-suspend the context when the tab is hidden or backgrounded,
    // so a one-shot listener that disarms on first success will miss future
    // suspensions. The listener is cheap — it only calls resume() when needed.
    const tryResume = () => {
      if (!this.audioContext || this.audioContext.state === 'running') return;
      this.audioContext.resume().catch(() => {});
    };

    // Also resume when the tab becomes visible again (covers browser-initiated
    // suspensions that occur while the page is hidden).
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tryResume();
    };

    this.autoResumeListener = tryResume;
    this.visibilityChangeListener = onVisibilityChange;
    document.addEventListener('pointerdown', tryResume);
    document.addEventListener('keydown', tryResume);
    document.addEventListener('touchstart', tryResume, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  disarmAutoResume() {
    if (this.autoResumeListener) {
      document.removeEventListener('pointerdown', this.autoResumeListener);
      document.removeEventListener('keydown', this.autoResumeListener);
      document.removeEventListener('touchstart', this.autoResumeListener);
      this.autoResumeListener = null;
    }
    if (this.visibilityChangeListener) {
      document.removeEventListener('visibilitychange', this.visibilityChangeListener);
      this.visibilityChangeListener = null;
    }
  }

  /**
   * Load dual-layer music for gameplay (Web Audio API)
   * @param {string} layer1Path - Path to layer 1 (always playing)
   * @param {string} layer2Path - Path to layer 2 (toggled in EXPLORE mode)
   * @param {number} masterVolume - Master volume 0.0 to 1.0 (default 0.7)
   */
  async loadMusic(layer1Path, layer2Path, masterVolume = 0.7) {
    this.dispose();

    this.mode = 'dual';
    this.masterVolume = masterVolume;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // SFX gain is created unconditionally so sound effects work even if music fails to load
    this.sfxGain = this.audioContext.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.audioContext.destination);

    this.armAutoResume();

    try {
      const [layer1Data, layer2Data] = await Promise.all([
        this.fetchAudioBuffer(layer1Path),
        this.fetchAudioBuffer(layer2Path)
      ]);

      [this.layer1Buffer, this.layer2Buffer] = await Promise.all([
        this.audioContext.decodeAudioData(layer1Data),
        this.audioContext.decodeAudioData(layer2Data)
      ]);

      this.layer1Gain = this.audioContext.createGain();
      this.layer2Gain = this.audioContext.createGain();

      this.layer1Gain.connect(this.audioContext.destination);
      this.layer2Gain.connect(this.audioContext.destination);

      this.layer1Gain.gain.value = this.masterVolume;
      this.layer2Gain.gain.value = 0; // Start muted

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
    if (!this.audioContext) {
      console.warn('[Audio] Cannot load SFX - audio context not initialized');
      return false;
    }

    // Placeholder registration: a null path marks the name as known so call
    // sites can ship before the asset exists. playSFX silently no-ops on it.
    if (path === null) {
      this.sfxBuffers[name] = null;
      return true;
    }

    try {
      const audioData = await this.fetchAudioBuffer(path);
      const buffer = await this.audioContext.decodeAudioData(audioData);
      this.sfxBuffers[name] = buffer;

      // Create a persistent GainNode for this SFX name (reused across all plays)
      // so playSFX never has to allocate one at call time.
      if (!this.sfxNodeGains[name]) {
        const g = this.audioContext.createGain();
        g.gain.value = 1.0;
        g.connect(this.sfxGain);
        this.sfxNodeGains[name] = g;
      }

      this.sfxActiveSources[name] = [];
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
    // Registered placeholder (asset not authored yet) — silent no-op.
    if (name in this.sfxBuffers && this.sfxBuffers[name] === null) return;
    if (!this.sfxBuffers[name] || !this.audioContext || !this.sfxGain) {
      console.warn(`[Audio] Cannot play SFX: ${name} (not loaded or context unavailable)`);
      return;
    }
    // Drop SFX while the AudioContext is suspended (autoplay-blocked).
    // start(0) on a suspended context queues the source; when the user
    // finally interacts and the context resumes, every queued source fires
    // at once — producing a burst of stale sounds. Better to silently drop.
    if (this.audioContext.state !== 'running') return;

    try {
      // Evict oldest concurrent instance if at limit, to prevent node storms
      // (e.g. many enemies aggroing in the same frame).
      const active = this.sfxActiveSources[name] || (this.sfxActiveSources[name] = []);
      if (active.length >= this.sfxMaxConcurrent) {
        const oldest = active.shift();
        try { oldest.stop(); } catch (_) {}
        oldest.disconnect();
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = this.sfxBuffers[name];

      // Reuse the persistent per-SFX GainNode instead of allocating a new one.
      // If a non-default volume is requested, adjust it on the shared node
      // (fine because concurrent same-SFX plays at different volumes are not needed).
      const gainNode = this.sfxNodeGains[name];
      if (gainNode && volume !== gainNode.gain.value) {
        gainNode.gain.value = volume;
      }

      if (gainNode) {
        source.connect(gainNode);
      } else {
        // Fallback: direct connect (sfxNodeGains not yet populated for this name)
        source.connect(this.sfxGain);
      }

      active.push(source);
      source.start(0);

      source.onended = () => {
        source.disconnect();
        const idx = active.indexOf(source);
        if (idx !== -1) active.splice(idx, 1);
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
    if (this.audioContext.state !== 'running') return;

    this.stopSFXByName(name);

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.sfxBuffers[name];

      // Reuse the persistent per-SFX GainNode when available.
      // Stoppable SFX are single-instance so sharing the gain node is safe.
      const persistentGain = this.sfxNodeGains[name];
      let gainNode;
      if (persistentGain) {
        persistentGain.gain.value = volume;
        gainNode = persistentGain;
        source.connect(gainNode);
      } else {
        gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(this.sfxGain);
      }

      // Only store the gainNode reference if we created a temporary one (needs cleanup)
      this.stoppableSources[name] = { source, gainNode: persistentGain ? null : gainNode };

      source.onended = () => {
        const entry = this.stoppableSources[name];
        if (entry && entry.source === source) {
          if (entry.gainNode) entry.gainNode.disconnect();
          delete this.stoppableSources[name];
        }
        source.disconnect();
      };

      source.start(0);
    } catch (error) {
      console.error(`[Audio] Error playing stoppable SFX ${name}:`, error);
    }
  }

  /**
   * Stoppable SFX with playbackRate scaled so the sample plays in exactly
   * `targetSeconds`. Pitch shifts with rate (resampling, not time-stretching).
   * Used for charge cues whose length matches gameplay timers.
   */
  playStoppableSFXStretched(name, targetSeconds, volume = 1.0) {
    if (!this.sfxBuffers[name] || !this.audioContext || !this.sfxGain) return;
    if (this.audioContext.state !== 'running') return;
    if (!(targetSeconds > 0)) return;

    this.stopSFXByName(name);

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.sfxBuffers[name];
      source.playbackRate.value = source.buffer.duration / targetSeconds;

      const persistentGain = this.sfxNodeGains[name];
      let gainNode;
      if (persistentGain) {
        persistentGain.gain.value = volume;
        gainNode = persistentGain;
        source.connect(gainNode);
      } else {
        gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(this.sfxGain);
      }

      this.stoppableSources[name] = { source, gainNode: persistentGain ? null : gainNode };

      source.onended = () => {
        const entry = this.stoppableSources[name];
        if (entry && entry.source === source) {
          if (entry.gainNode) entry.gainNode.disconnect();
          delete this.stoppableSources[name];
        }
        source.disconnect();
      };

      source.start(0);
    } catch (error) {
      console.error(`[Audio] Error playing stretched SFX ${name}:`, error);
    }
  }

  /**
   * Stop a named stoppable SFX if it's currently playing.
   * @param {string} name - SFX identifier
   */
  stopSFXByName(name) {
    const entry = this.stoppableSources[name];
    if (entry) {
      try { entry.source.stop(); } catch (_) {}
      // Explicitly disconnect temp gain node immediately rather than waiting for onended
      if (entry.gainNode) {
        try { entry.gainNode.disconnect(); } catch (_) {}
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
   * Play single-track music (Web Audio API)
   */
  playSingleTrack() {
    if (!this.singleBuffer) return;

    const resume = this.audioContext.state === 'suspended'
      ? this.audioContext.resume()
      : Promise.resolve();

    resume.then(() => {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.singleBuffer;
      source.loop = true;
      source.loopStart = this.loopStart;
      source.loopEnd = this.singleBuffer.duration;
      source.connect(this.singleGain);
      source.start(0);

      this.singleSource = source;
      this.isPlaying = true;
      this.autoplayBlocked = false;
    }).catch(() => {
      console.warn('[Audio] Autoplay blocked - will start on first user interaction');
      this.autoplayBlocked = true;
      this.setupAutoplayUnblock();
    });
  }

  /**
   * Play dual-layer music (Web Audio API)
   */
  playDualLayer() {
    if (!this.layer1Buffer || !this.layer2Buffer) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().then(() => {
        this.startDualSources();
      }).catch(() => {
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
    this.layer1Source = this.audioContext.createBufferSource();
    this.layer2Source = this.audioContext.createBufferSource();

    this.layer1Source.buffer = this.layer1Buffer;
    this.layer2Source.buffer = this.layer2Buffer;

    this.layer1Source.loop = true;
    this.layer2Source.loop = true;

    this.layer1Source.connect(this.layer1Gain);
    this.layer2Source.connect(this.layer2Gain);

    // Always start layer 2 silenced — cancel any leftover scheduled ramps
    this.layer2Muted = true;
    this.layer2Gain.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.layer2Gain.gain.value = 0;

    const startTime = this.audioContext.currentTime;
    this.layer1Source.start(startTime);
    this.layer2Source.start(startTime);

    this.playbackStartTime = startTime;
    this.isPlaying = true;
    this.autoplayBlocked = false;

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
    if (this.mode === 'single') {
      if (this.singleSource) {
        try { this.singleSource.stop(); } catch (_) {}
        this.singleSource.disconnect();
        this.singleSource = null;
      }
    } else if (this.mode === 'dual') {
      if (this.layer1Source) {
        try { this.layer1Source.stop(); } catch (_) {}
        this.layer1Source.disconnect();
        this.layer1Source = null;
      }
      if (this.layer2Source) {
        try { this.layer2Source.stop(); } catch (_) {}
        this.layer2Source.disconnect();
        this.layer2Source = null;
      }
    } else if (this.mode === 'sequence') {
      if (this.bossSequenceSource) {
        this.bossSequenceSource.onended = null;
        try { this.bossSequenceSource.stop(); } catch (_) {}
        this.bossSequenceSource.disconnect();
        this.bossSequenceSource = null;
      }
    } else if (this.mode === 'red') {
      if (this.redSequenceSource) {
        this.redSequenceSource.onended = null;
        try { this.redSequenceSource.stop(); } catch (_) {}
        this.redSequenceSource.disconnect();
        this.redSequenceSource = null;
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
    if (this.mode === 'red') {
      this.setRedCombatActive(enabled);
      return;
    }
    if (this.mode !== 'dual' || !this.layer2Gain) return;

    if (!this.isPlaying) {
      this.pendingLayer2State = enabled;
      return;
    }

    this.layer2Muted = !enabled;

    const currentTime = this.audioContext.currentTime;
    const fadeTime = 0.1;
    const loopDuration = this.layer1Buffer.duration;
    const elapsedTime = currentTime - this.playbackStartTime;
    const currentPositionInLoop = elapsedTime % loopDuration;
    const timeUntilLoopEnd = loopDuration - currentPositionInLoop;

    this.layer2Gain.gain.cancelScheduledValues(currentTime);

    if (enabled) {
      const nextLoopStartTime = currentTime + timeUntilLoopEnd;
      this.layer2Gain.gain.setValueAtTime(0, currentTime);
      this.layer2Gain.gain.setValueAtTime(0, nextLoopStartTime);
      this.layer2Gain.gain.linearRampToValueAtTime(this.masterVolume, nextLoopStartTime + fadeTime);
    } else {
      const loopEndTime = currentTime + timeUntilLoopEnd;
      this.layer2Gain.gain.setValueAtTime(this.layer2Gain.gain.value, currentTime);
      this.layer2Gain.gain.setValueAtTime(this.masterVolume, loopEndTime - fadeTime);
      this.layer2Gain.gain.linearRampToValueAtTime(0, loopEndTime);
    }
  }

  /**
   * Mute layer 2 immediately with a short fade, bypassing loop-end scheduling.
   * Use this for sudden state changes (e.g., last enemy killed) where waiting
   * for the loop end would feel wrong. Does not affect the enable path.
   */
  muteLayer2Immediately() {
    if (this.mode === 'red') {
      this.setRedCombatActive(false);
      return;
    }
    if (this.mode !== 'dual' || !this.layer2Gain || this.layer2Muted) return;

    this.layer2Muted = true;
    const currentTime = this.audioContext.currentTime;
    const fadeTime = 0.15;

    this.layer2Gain.gain.cancelScheduledValues(currentTime);
    this.layer2Gain.gain.setValueAtTime(this.layer2Gain.gain.value, currentTime);
    this.layer2Gain.gain.linearRampToValueAtTime(0, currentTime + fadeTime);
  }

  /**
   * Get current layer 2 state
   * @returns {boolean} True if layer 2 is enabled
   */
  isLayer2Enabled() {
    return !this.layer2Muted;
  }

  /**
   * Switch dual-layer music tracks without restarting the audio context.
   * Stops current playback, swaps buffers, and resumes with the same layer 2 state.
   * @param {string} layer1Path - Path to new layer 1
   * @param {string} layer2Path - Path to new layer 2
   */
  async switchMusic(layer1Path, layer2Path) {
    if (this.mode !== 'dual' && this.mode !== 'red') return false;

    // Coming from red mode there is no meaningful layer2 state to preserve —
    // the caller (usually setLayer2Enabled on the next room enter) will set
    // combat layering correctly for the destination zone.
    const wasLayer2Enabled = this.mode === 'dual' && !this.layer2Muted;

    this.stop();
    this.mode = 'dual';

    try {
      const [layer1Data, layer2Data] = await Promise.all([
        this.fetchAudioBuffer(layer1Path),
        this.fetchAudioBuffer(layer2Path)
      ]);
      [this.layer1Buffer, this.layer2Buffer] = await Promise.all([
        this.audioContext.decodeAudioData(layer1Data),
        this.audioContext.decodeAudioData(layer2Data)
      ]);

      this.startDualSources();
      if (wasLayer2Enabled) {
        this.setLayer2Enabled(true);
      }
      return true;
    } catch (error) {
      console.error('[Audio] Failed to switch music:', error);
      return false;
    }
  }

  /**
   * Hard reset to dual-layer mode with layer 2 muted. Used on true game-over
   * so the next run starts from a clean musical state regardless of where the
   * player died (active layer 2, non-green zone buffers, or mid-boss sequence).
   */
  async hardResetDualLayers(layer1Path, layer2Path) {
    if (this.mode === 'sequence') {
      this.stopBossMusic();
    }
    if (this.mode === 'red') {
      this.stopRedSequence();
    }
    this.layer2Muted = true;
    if (this.layer2Gain && this.audioContext) {
      const t = this.audioContext.currentTime;
      this.layer2Gain.gain.cancelScheduledValues(t);
      this.layer2Gain.gain.value = 0;
    }
    return this.switchMusic(layer1Path, layer2Path);
  }

  /**
   * Switch music to match a zone (green/cyan/red), skipping the swap when
   * already on that zone's track. Skipped entirely while boss sequence mode
   * is active (anticipation or full fight).
   * `force` bypasses the currentMusicZone equality checks — used by interior
   * exits (e.g. the maze) to restore zone music after a non-zone override,
   * since currentMusicZone is never touched while inside the interior.
   * @param {string} zone - 'green' | 'cyan' | 'red' (any other value maps to green)
   * @param {string} base - BASE_URL prefix
   * @param {boolean} force - bypass the already-on-this-zone check
   */
  switchZoneMusic(zone, base, force = false) {
    if (this.mode !== 'dual' && this.mode !== 'red') return;
    if (zone === 'red' && (force || this.currentMusicZone !== 'red')) {
      if (this.switchToRedSequence()) {
        this.currentMusicZone = 'red';
      }
    } else if (zone === 'cyan' && (force || this.currentMusicZone !== 'cyan')) {
      this.currentMusicZone = 'cyan';
      this.switchMusic(
        `${base}assets/audio/cyan-layer1.mp3`,
        `${base}assets/audio/cyan-layer2.mp3`
      );
    } else if (zone !== 'cyan' && zone !== 'red'
               && (force || this.currentMusicZone === 'cyan' || this.currentMusicZone === 'red')) {
      this.currentMusicZone = 'green';
      this.switchMusic(
        `${base}assets/audio/layer1.mp3`,
        `${base}assets/audio/layer2.mp3`
      );
    }
  }

  /**
   * Set master volume
   * @param {number} volume - Volume 0.0 to 1.0
   */
  setVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));

    if (this.mode === 'single' && this.singleGain) {
      this.singleGain.gain.value = this.masterVolume;
    } else if (this.mode === 'dual') {
      if (this.layer1Gain) this.layer1Gain.gain.value = this.masterVolume;
      if (this.layer2Gain && !this.layer2Muted) this.layer2Gain.gain.value = this.masterVolume;
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
      if (!this.autoplayBlocked) return;

      if (this.audioContext) {
        this.audioContext.resume().then(() => {
          if (!this.isPlaying) {
            if (this.mode === 'single') this.playSingleTrack();
            else if (this.mode === 'dual') this.startDualSources();
          }
          this.removeAutoplayUnblock();
        }).catch(err => {
          console.error('[Audio] Failed to resume after user interaction:', err);
        });
      }
    };

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
   * Load the full gameplay SFX set. Idempotent — subsequent calls are no-ops
   * so REST entry and arcade-demo entry can both call this without re-fetching.
   * Requires an AudioContext (created by loadSingleTrack or loadMusic).
   * @param {string} base - BASE_URL prefix
   */
  loadGameplaySFX(base) {
    if (!this.audioContext || this.gameplaySFXLoaded) return;
    this.gameplaySFXLoaded = true;
    this.loadSFX('aggro', `${base}assets/audio/sfx-aggro.mp3`);
    this.loadSFX('destroy', `${base}assets/audio/sfx-destroy.mp3`);
    this.loadSFX('roll', `${base}assets/audio/sfx-roll.mp3`);
    this.loadSFX('attack_blade', `${base}assets/audio/sfx-attack-blade.mp3`);
    this.loadSFX('attack_whip', `${base}assets/audio/sfx-attack-whip.mp3`);
    this.loadSFX('charge_bow', `${base}assets/audio/sfx-charge-bow.mp3`);
    this.loadSFX('wand_charge', `${base}assets/audio/sfx-wand-charge.wav`);
    this.loadSFX('player_death', `${base}assets/audio/sfx-player-death.mp3`);
    this.loadSFX('craft_cycle', `${base}assets/audio/sfx-craft-cycle.mp3`);
    this.loadSFX('mag_reload', `${base}assets/audio/sfx-mag-reload.mp3`);
    this.loadSFX('energy_charge', `${base}assets/audio/sfx-energy-charge.wav`);
    this.loadSFX('enemy_hit', `${base}assets/audio/sfx-enemy-hit.wav`);
    this.loadSFX('goo_hit', `${base}assets/audio/sfx-goo-hit.wav`);
    this.loadSFX('goo_death_1', `${base}assets/audio/sfx-goo-death-1.mp3`);
    this.loadSFX('goo_death_2', `${base}assets/audio/sfx-goo-death-2.mp3`);
    this.loadSFX('ghost_spawn', `${base}assets/audio/sfx-ghost-spawn.wav`);
    this.loadSFX('frog', `${base}assets/audio/sfx-frog.wav`);
    this.loadSFX('hut_lower', `${base}assets/audio/sfx-hut-lower.wav`);
    this.loadSFX('polymorph', `${base}assets/audio/sfx-polymorph.wav`);
    this.loadSFX('wave_1', `${base}assets/audio/sfx-wave-01.wav`);
    this.loadSFX('wave_2', `${base}assets/audio/sfx-wave-03.wav`);
    this.loadSFX('wave_3', `${base}assets/audio/sfx-wave-05.wav`);
    this.loadSFX('weapon_pickup', `${base}assets/audio/sfx-weapon-pickup.wav`);
    this.loadSFX('boss_defeat', `${base}assets/audio/sfx-boss-defeat.wav`);
    this.loadSFX('coin_plink', `${base}assets/audio/sfx-coin-plink.wav`);
    // Placeholder ricochet SFX — reusing coin-plink until a dedicated asset exists.
    this.loadSFX('ricochet', `${base}assets/audio/sfx-coin-plink.wav`);
    this.loadSFX('lightning', `${base}assets/audio/sfx-lightning.wav`);
    this.loadSFX('chest_open', `${base}assets/audio/sfx-chest-open.wav`);
    this.loadSFX('crow_takeoff_1', `${base}assets/audio/sfx-crow-1.wav`);
    this.loadSFX('crow_takeoff_2', `${base}assets/audio/sfx-crow-2.wav`);
    this.loadSFX('magic_death', `${base}assets/audio/sfx-magic-death.wav`);
    this.loadSFX('ingredient_pickup', `${base}assets/audio/sfx-ingredient-pickup.wav`);
    this.loadSFX('fairy_pickup', `${base}assets/audio/sfx-fairy-pickup.wav`);
    this.loadSFX('fairy_transform', `${base}assets/audio/sfx-fairy-transform.wav`);
    this.loadSFX('slime_jump', `${base}assets/audio/sfx-slime-jump.wav`);
    this.loadSFX('crow_drop', `${base}assets/audio/sfx-crow-drop.wav`);
    this.loadSFX('crow_attack_1', `${base}assets/audio/sfx-crow-attack-1.wav`);
    this.loadSFX('crow_attack_2', `${base}assets/audio/sfx-crow-attack-2.wav`);
    this.loadSFX('crow_attack_3', `${base}assets/audio/sfx-crow-attack-3.wav`);
    this.loadSFX('goo_split', `${base}assets/audio/sfx-goo-split.wav`);
    this.loadSFX('goo_reabsorb', `${base}assets/audio/sfx-goo-reabsorb.wav`);
    this.loadSFX('beast_hit', `${base}assets/audio/sfx-beast-hit.wav`);
    this.loadSFX('goblin_aggro', `${base}assets/audio/sfx-goblin-aggro.wav`);
    this.loadSFX('slot_swap', `${base}assets/audio/sfx-slot-swap.wav`);
    this.loadSFX('magic_hit', `${base}assets/audio/sfx-magic-hit.wav`);
    // Gray zone — placeholder names, no assets yet (playSFX no-ops on null).
    this.loadSFX('mist_take', null);   // depth-10 mist-out sequence
    this.loadSFX('bone_rise', null);   // Risen reassembling from its bone pile
    // P-room puzzles + key items — placeholder names, no assets yet.
    this.loadSFX('puzzle_pulse', null);  // correct listening-stone strike
    this.loadSFX('puzzle_fizzle', null); // wrong stone — sequence reset
    this.loadSFX('puzzle_solve', null);  // puzzle solved, spirit rises
    this.loadSFX('plank_place', null);   // Platform plank laid over deep water
    this.loadSFX('sword_draw', null);    // § drawn from the islet stone
  }

  /**
   * Load all 6 boss audio tracks (tracks 1–5 + the loop stinger).
   * Must be called after loadMusic() so the AudioContext exists.
   * Fire-and-forget: resolves silently if files are missing.
   * @param {string} base - BASE_URL prefix
   */
  async loadBossTracks(base) {
    if (!this.audioContext) return;
    try {
      const paths = [1, 2, 3, 4, 5].map(n => `${base}assets/audio/boss-${n}.mp3`);
      const [trackDatas, loopData] = await Promise.all([
        Promise.all(paths.map(p => this.fetchAudioBuffer(p))),
        this.fetchAudioBuffer(`${base}assets/audio/boss-loop.mp3`)
      ]);
      this.bossBuffers = await Promise.all(
        trackDatas.map(d => this.audioContext.decodeAudioData(d))
      );
      this.bossLoopBuffer = await this.audioContext.decodeAudioData(loopData);
    } catch (e) {
      console.error('[Audio] Failed to load boss tracks:', e);
    }
  }

  /**
   * Start boss anticipation music: sequential mini-loop of tracks 1→2→1→2→...
   * Stops the current dual-layer playback and enters sequence mode.
   */
  startBossAnticipation() {
    if (!this.bossBuffers.length) {
      console.warn('[Audio] Boss tracks not loaded yet');
      return;
    }
    // Stop current dual-layer sources
    for (const prop of ['layer1Source', 'layer2Source']) {
      if (this[prop]) {
        try { this[prop].stop(); } catch (_) {}
        this[prop].disconnect();
        this[prop] = null;
      }
    }
    this.isPlaying = false;
    this.mode = 'sequence';
    this.bossAnticipationActive = true;
    this.bossSequencePending = false;
    this.bossLoopPending = false;
    this.bossLoopPlaying = false;
    this._startBossTrack(0);
  }

  /**
   * Queue transition from anticipation mini-loop to full 5-track sequence.
   * Transition happens at the next natural track boundary.
   * If not in anticipation mode, starts full sequence immediately.
   */
  scheduleBossSequence() {
    if (this.bossAnticipationActive) {
      this.bossSequencePending = true;
    } else {
      this._beginFullBossSequence();
    }
  }

  /**
   * Start the full 5-track boss sequence immediately (direct entry / cheat menu).
   * If already in sequence mode, restarts from track 0.
   */
  startBossSequence() {
    if (this.mode === 'sequence') {
      this._beginFullBossSequence();
    } else {
      // Stop dual-layer playback and enter sequence mode
      for (const prop of ['layer1Source', 'layer2Source']) {
        if (this[prop]) {
          try { this[prop].stop(); } catch (_) {}
          this[prop].disconnect();
          this[prop] = null;
        }
      }
      this.isPlaying = false;
      this.mode = 'sequence';
      this.bossAnticipationActive = false;
      this.bossSequencePending = false;
      this.bossLoopPending = false;
      this.bossLoopPlaying = false;
      this._startBossTrack(0);
    }
  }

  /**
   * Switch from anticipation mini-loop to full 5-track sequence at track 0.
   */
  _beginFullBossSequence() {
    this.bossAnticipationActive = false;
    this.bossSequencePending = false;
    this._startBossTrack(0);
  }

  /**
   * Play a specific boss track (0-indexed). Sets up onended callback for auto-advance.
   * @param {number} index - Track index (0–4)
   */
  _startBossTrack(index) {
    if (this.bossSequenceSource) {
      this.bossSequenceSource.onended = null;
      try { this.bossSequenceSource.stop(); } catch (_) {}
      this.bossSequenceSource.disconnect();
    }
    this.bossSequenceIndex = index;
    const source = this.audioContext.createBufferSource();
    source.buffer = this.bossBuffers[index];
    source.loop = false;
    source.connect(this.layer1Gain); // reuse existing gain node at masterVolume
    source.onended = () => this._onBossTrackEnded();
    source.start(0);
    this.bossSequenceSource = source;
    this.isPlaying = true;
  }

  /**
   * Called when the current boss track ends. Advances the playlist,
   * handles anticipation→fight transitions, and plays the damage stinger.
   */
  _onBossTrackEnded() {
    if (this.mode !== 'sequence') return;

    // Anticipation → full fight transition (boss room was entered)
    if (this.bossSequencePending) {
      this.bossSequencePending = false;
      this.bossAnticipationActive = false;
      this._startBossTrack(0);
      return;
    }

    // Damage stinger (only in full fight mode, not during anticipation)
    if (this.bossLoopPending && !this.bossAnticipationActive) {
      this.bossLoopPending = false;
      this.bossLoopPlaying = true;
      const source = this.audioContext.createBufferSource();
      source.buffer = this.bossLoopBuffer;
      source.loop = false;
      source.connect(this.layer1Gain);
      source.onended = () => {
        this.bossLoopPlaying = false;
        if (this.mode === 'sequence') this._startBossTrack(0);
      };
      source.start(0);
      this.bossSequenceSource = source;
      return;
    }

    // Normal advancement — mini-loop wraps at 2, full sequence wraps at 5
    const wrapAt = this.bossAnticipationActive ? 2 : this.bossBuffers.length;
    this._startBossTrack((this.bossSequenceIndex + 1) % wrapAt);
  }

  /**
   * Signal that the boss took damage. Queues the loop stinger after the current track.
   * Idempotent — multiple rapid hits don't stack additional stingers.
   */
  onBossDamaged() {
    if (this.mode !== 'sequence' || this.bossAnticipationActive) return;
    this.bossLoopPending = true;
  }

  /**
   * Stop all boss music and reset to idle dual mode so normal music handling
   * can take over (e.g., on death or run reset).
   */
  stopBossMusic() {
    if (this.bossSequenceSource) {
      this.bossSequenceSource.onended = null;
      try { this.bossSequenceSource.stop(); } catch (_) {}
      this.bossSequenceSource.disconnect();
      this.bossSequenceSource = null;
    }
    this.bossAnticipationActive = false;
    this.bossSequencePending = false;
    this.bossLoopPending = false;
    this.bossLoopPlaying = false;
    this.bossSequenceIndex = 0;
    if (this.mode === 'sequence') this.mode = 'dual';
    this.isPlaying = false;
  }

  /**
   * Load the 3 red-zone tracks (A/B/C) for sequential playback.
   * Fire-and-forget — resolves silently if files are missing.
   * @param {string} base - BASE_URL prefix
   */
  async loadRedTracks(base) {
    if (!this.audioContext) return;
    try {
      const paths = ['a', 'b', 'c'].map(l => `${base}assets/audio/red-${l}.mp3`);
      const datas = await Promise.all(paths.map(p => this.fetchAudioBuffer(p)));
      this.redBuffers = await Promise.all(
        datas.map(d => this.audioContext.decodeAudioData(d))
      );
    } catch (e) {
      console.error('[Audio] Failed to load red tracks:', e);
    }
  }

  /**
   * Switch from dual-layer mode to the red zone sequential mode.
   * Stops current dual sources, enters mode='red', starts playback at track A.
   * Requires loadRedTracks() to have completed and a layer1Gain to exist.
   */
  switchToRedSequence() {
    if (!this.redBuffers.length) {
      console.warn('[Audio] Red tracks not loaded yet');
      return false;
    }
    if (!this.layer1Gain) return false;

    // Stop dual sources (mirrors boss-sequence pattern)
    for (const prop of ['layer1Source', 'layer2Source']) {
      if (this[prop]) {
        try { this[prop].stop(); } catch (_) {}
        this[prop].disconnect();
        this[prop] = null;
      }
    }
    this.mode = 'red';
    this.redCombatActive = false;
    this._startRedTrack(0);
    return true;
  }

  /**
   * Stop red sequence playback and revert mode to 'dual' so dual-layer
   * APIs (switchMusic, setLayer2Enabled) can take over again.
   */
  stopRedSequence() {
    if (this.redSequenceSource) {
      this.redSequenceSource.onended = null;
      try { this.redSequenceSource.stop(); } catch (_) {}
      this.redSequenceSource.disconnect();
      this.redSequenceSource = null;
    }
    this.redCombatActive = false;
    if (this.mode === 'red') this.mode = 'dual';
    this.isPlaying = false;
  }

  /**
   * Update the combat-active flag for red sequence routing.
   * Takes effect at the end of the currently playing track (sequential music
   * never cuts mid-track). Out-of-combat oscillates A↔B; in-combat oscillates
   * B↔C; combat-end always queues A next.
   */
  setRedCombatActive(active) {
    if (this.mode !== 'red') return;
    this.redCombatActive = !!active;
  }

  /**
   * Start playing red track at the given index (0=A, 1=B, 2=C).
   * Sets up onended to advance via _onRedTrackEnded().
   */
  _startRedTrack(index) {
    if (this.redSequenceSource) {
      this.redSequenceSource.onended = null;
      try { this.redSequenceSource.stop(); } catch (_) {}
      this.redSequenceSource.disconnect();
    }
    this.redCurrentIndex = index;
    const source = this.audioContext.createBufferSource();
    source.buffer = this.redBuffers[index];
    source.loop = false;
    source.connect(this.layer1Gain);
    source.onended = () => this._onRedTrackEnded();
    source.start(0);
    this.redSequenceSource = source;
    this.isPlaying = true;
  }

  /**
   * Decide and play the next red track at the boundary.
   *   combatActive:  A→B, B→C, C→B
   *   !combatActive: A→B, B→A, C→A
   */
  _onRedTrackEnded() {
    if (this.mode !== 'red') return;
    const curr = this.redCurrentIndex;
    let next;
    if (this.redCombatActive) {
      next = (curr === 0) ? 1 : (curr === 1) ? 2 : 1;
    } else {
      next = (curr === 0) ? 1 : 0;
    }
    this._startRedTrack(next);
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.stop();
    this.removeAutoplayUnblock();
    this.disarmAutoResume();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.singleBuffer = null;
    this.singleGain = null;
    this.layer1Buffer = null;
    this.layer2Buffer = null;
    this.layer1Gain = null;
    this.layer2Gain = null;
    this.sfxGain = null;
    this.sfxBuffers = {};
    this.sfxNodeGains = {};
    this.sfxActiveSources = {};
    // Reset so loadGameplaySFX re-fetches into the new AudioContext.
    // Without this, a demo→title→launch sequence leaves the flag set while
    // dispose() wipes the buffers, so REST entry's loadGameplaySFX short-circuits
    // and the main game runs with no SFX.
    this.gameplaySFXLoaded = false;
    this.bossBuffers = [];
    this.bossLoopBuffer = null;
    this.redBuffers = [];
    this.redSequenceSource = null;
    this.mode = null;
  }
}
