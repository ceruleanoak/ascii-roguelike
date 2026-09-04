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

// Zones with a dedicated REST-mode track. A zone with no entry here falls
// back to the existing behavior: REST keeps the zone's EXPLORE dual-layer
// track loaded and mutes layer 2, so layer 1 alone serves as the "peaceful"
// fallback (see AudioSystem.switchRestMusic / enterRestState in main.js).
const REST_MUSIC_PATHS = {
  green: 'assets/audio/rest-green.mp3',
  cyan: 'assets/audio/rest-cyan.mp3'
};

// Zones whose EXPLORE music is a sequence of whole tracks rather than a
// dual-layer stem pair. Sequential music never cuts mid-track: the combat
// flag only decides which track plays *next*, at the current one's end.
//
//   calmNext[i]   — track to play after track i while no enemies are engaged
//   combatNext[i] — track to play after track i while combat is active
//
// Red is a three-part set (A/B out of combat, B/C in combat); yellow is the
// two-part form (A alone out of combat, B alone in combat).
const SEQUENCE_MUSIC = {
  red: {
    tracks: ['assets/audio/red-a.mp3', 'assets/audio/red-b.mp3', 'assets/audio/red-c.mp3'],
    calmNext:   [1, 0, 0], // A→B, B→A, C→A
    combatNext: [1, 2, 1]  // A→B, B→C, C→B
  },
  yellow: {
    tracks: ['assets/audio/yellow-a.mp3', 'assets/audio/yellow-b.mp3'],
    calmNext:   [0, 0], // A→A, B→A
    combatNext: [1, 1]  // A→B, B→B
  }
};

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

    // Sequential zone music (see SEQUENCE_MUSIC) — whole tracks chained at
    // their own boundaries instead of dual-layer stems mixed live.
    this.zoneSequenceBuffers = {};    // zone → AudioBuffer[], one per track
    this.zoneSequenceSource = null;   // current AudioBufferSourceNode
    this.zoneSequenceIndex = 0;       // index into the active zone's tracks
    this.sequenceZone = null;         // zone whose sequence is playing
    this.zoneCombatActive = false;    // updated by setLayer2Enabled while sequential

    // Shared state
    this.isPlaying = false;
    this.autoplayBlocked = false;
    this.userInteractionListener = null;
    this.autoResumeListener = null;
    this.visibilityChangeListener = null;
    this.masterVolume = 0.7;

    // Auto-resume throttle — see armAutoResume for why both guards exist.
    this._resumeInFlight = false;
    this._lastResumeAttempt = 0;

    // Wedged-context watchdog — see armStallWatchdog.
    this._stallWatchdogTimer = null;
    this._lastWatchdogTime = -1;
    this._stallReported = false;

    // Tracks which zone's music is currently loaded (for zone-specific music switching)
    this.currentMusicZone = 'green';

    // True when the currently loaded dual-layer buffers are a dedicated
    // REST track (rather than the zone's EXPLORE track). Lets switchZoneMusic
    // know to force a reload back to the EXPLORE track even when the zone
    // itself hasn't changed (e.g. green REST → green EXPLORE).
    this.inRestMode = false;

    // Generation counter claimed by switchMusic/switchMusicAtLoopEnd before
    // their async fetch+decode. Two of these can be issued back-to-back
    // (e.g. the death/restart path fires hardResetDualLayers, then
    // enterRestState synchronously fires a second switch before the first
    // has resolved) — without this guard, whichever call resolves later
    // calls startDualSources() on top of the other's still-playing sources
    // instead of replacing them, producing doubled/overlapping music.
    // Each call captures the post-increment value and checks it again after
    // its await; a mismatch means a newer call has taken over, so it bails
    // out before touching the audio graph.
    this._musicLoadId = 0;
  }

  /**
   * Path to a zone's dedicated REST track, or undefined if the zone has no
   * dedicated REST music (caller should keep the EXPLORE-track fallback).
   * @param {string} zone - 'green' | 'cyan' | 'red'
   */
  getRestMusicPath(zone) {
    return REST_MUSIC_PATHS[zone];
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
    this.armStallWatchdog();

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
    // Throttled: at most one resume() attempt per RESUME_RETRY_MS, and never a
    // second while the first is still pending. Both guards matter because the
    // listener is bound to keydown — keyboard auto-repeat fires ~30 events/sec
    // while a movement key is held, so a context that gets suspended mid-session
    // (device change, power event) would otherwise receive an unbounded stream
    // of concurrent resume() calls against the very stream we're trying to
    // recover, for as long as the player keeps holding a key.
    const RESUME_RETRY_MS = 1000;
    const tryResume = () => {
      if (!this.audioContext || this.audioContext.state === 'running') return;
      if (this._resumeInFlight) return;

      const now = performance.now();
      if (now - this._lastResumeAttempt < RESUME_RETRY_MS) return;
      this._lastResumeAttempt = now;
      this._resumeInFlight = true;

      this.audioContext.resume()
        .then(() => { this._resumeInFlight = false; })
        .catch(() => { this._resumeInFlight = false; });
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

  /**
   * Watchdog for a wedged AudioContext.
   *
   * Chrome can leave a tab's audio output dead for the rest of the tab's life:
   * a faint click, then silence for both music and SFX, not restored by a
   * reload — only a new window brings audio back. Because a reload builds a
   * brand-new document *and* a brand-new AudioContext and still comes up
   * silent, the broken state lives below the page (renderer process / audio
   * stream), not in anything this class holds.
   *
   * The failure is invisible from JS: the context keeps reporting
   * state === 'running' while its clock stops advancing, so every call site
   * here goes on happily scheduling sources into a stream nobody hears. This
   * samples currentTime on a slow interval and logs one diagnostic line the
   * first time the clock stalls, so the next occurrence leaves evidence
   * (frozen clock vs. suspended state vs. graph problem) instead of a
   * mystery. No recovery is attempted: a reload is a stronger reset than
   * anything this class could do in-page and it doesn't help, so rebuilding
   * the context here would be re-decoding every buffer for no known gain.
   */
  armStallWatchdog() {
    if (this._stallWatchdogTimer || !this.audioContext) return;

    // Long enough that a sample is never confused with a normal render hiccup;
    // short enough to land within a few seconds of the player noticing.
    const SAMPLE_MS = 4000;

    this._lastWatchdogTime = this.audioContext.currentTime;
    this._stallWatchdogTimer = setInterval(() => {
      const ctx = this.audioContext;
      if (!ctx) return;

      const now = ctx.currentTime;
      const stalled = ctx.state === 'running' && now === this._lastWatchdogTime;
      this._lastWatchdogTime = now;

      if (!stalled) {
        // Clock is advancing again (or the context is legitimately suspended) —
        // re-arm the report so a second stall in the same session is also logged.
        this._stallReported = false;
        return;
      }

      if (this._stallReported) return;
      this._stallReported = true;
      console.error(
        '[Audio] AudioContext clock has stalled while state === "running" — ' +
        'tab audio is wedged below the page. Diagnostics:',
        {
          currentTime: now,
          sampleRate: ctx.sampleRate,
          // Chrome reports 0 output latency once the output stream is gone.
          outputLatency: ctx.outputLatency,
          baseLatency: ctx.baseLatency,
          mode: this.mode,
          isPlaying: this.isPlaying,
          uptimeMinutes: +(performance.now() / 60000).toFixed(1)
        }
      );
    }, SAMPLE_MS);
  }

  disarmStallWatchdog() {
    if (this._stallWatchdogTimer) {
      clearInterval(this._stallWatchdogTimer);
      this._stallWatchdogTimer = null;
    }
    this._lastWatchdogTime = -1;
    this._stallReported = false;
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
    this.armStallWatchdog();

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
   * Play a looping sound effect (e.g. a proximity buzz). Loops until
   * stopSFXByName(name) is called. Restarts the loop if it's already
   * playing — call this once to start, then use setLoopingSFXVolume for
   * per-frame volume updates without retriggering playback.
   * @param {string} name - SFX identifier
   * @param {number} volume - Volume multiplier 0.0 to 1.0 (default 1.0)
   */
  playLoopingSFX(name, volume = 1.0) {
    if (!this.sfxBuffers[name] || !this.audioContext || !this.sfxGain) return;
    if (this.audioContext.state !== 'running') return;

    this.stopSFXByName(name);

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = this.sfxBuffers[name];
      source.loop = true;

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
      console.error(`[Audio] Error playing looping SFX ${name}:`, error);
    }
  }

  /**
   * Adjust the live volume of an active looping SFX without retriggering
   * playback. No-ops if the loop isn't currently running under this name.
   * @param {string} name - SFX identifier
   * @param {number} volume - Volume multiplier 0.0 to 1.0
   */
  setLoopingSFXVolume(name, volume) {
    const entry = this.stoppableSources[name];
    if (!entry) return;
    const gainNode = this.sfxNodeGains[name] || entry.gainNode;
    if (gainNode) gainNode.gain.value = volume;
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
    } else if (this.mode === 'zoneSequence') {
      // The sequence's zone and combat flag die with its source, so a later
      // switchMusic() back to dual-layer can't leave them pointing at a
      // sequence that is no longer playing. Nothing resumes a sequence from
      // stop() — play() only restores 'single'/'dual' — so there is no state
      // here worth preserving.
      this._stopZoneSequenceSource();
      this.sequenceZone = null;
      this.zoneCombatActive = false;
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
    if (this.mode === 'zoneSequence') {
      this.setZoneCombatActive(enabled);
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
    if (this.mode === 'zoneSequence') {
      this.setZoneCombatActive(false);
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
    if (!this.isZoneMusicActive()) return false;

    // Coming from a sequential zone there is no meaningful layer2 state to
    // preserve — the caller (usually setLayer2Enabled on the next room enter)
    // will set combat layering correctly for the destination zone.
    const wasLayer2Enabled = this.mode === 'dual' && !this.layer2Muted;

    this.stop();
    this.mode = 'dual';

    // Claim this load — see _musicLoadId in the constructor for why.
    const loadId = ++this._musicLoadId;

    try {
      const [layer1Data, layer2Data] = await Promise.all([
        this.fetchAudioBuffer(layer1Path),
        this.fetchAudioBuffer(layer2Path)
      ]);
      const [newLayer1Buffer, newLayer2Buffer] = await Promise.all([
        this.audioContext.decodeAudioData(layer1Data),
        this.audioContext.decodeAudioData(layer2Data)
      ]);

      // Superseded by a newer switchMusic/switchMusicAtLoopEnd call while we
      // were fetching/decoding — let that call own playback instead of
      // stacking a second pair of sources on top of it.
      if (loadId !== this._musicLoadId) return false;

      this.layer1Buffer = newLayer1Buffer;
      this.layer2Buffer = newLayer2Buffer;

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
    if (this.mode === 'zoneSequence') {
      this.stopZoneSequence();
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
   * Switch music to match a zone, skipping the swap when already on that
   * zone's track. Skipped entirely while boss sequence mode is active
   * (anticipation or full fight).
   * `force` bypasses the currentMusicZone equality checks — used by interior
   * exits (e.g. the maze) to restore zone music after a non-zone override,
   * since currentMusicZone is never touched while inside the interior.
   * @param {string} zone - a SEQUENCE_MUSIC zone, 'cyan', or anything else
   *                        (which maps to the green dual-layer track)
   * @param {string} base - BASE_URL prefix
   * @param {boolean} force - bypass the already-on-this-zone check
   */
  switchZoneMusic(zone, base, force = false) {
    if (!this.isZoneMusicActive()) return;
    // Leaving a dedicated REST track always requires a reload, even when the
    // zone itself didn't change (green REST → green EXPLORE both report
    // currentMusicZone === 'green', so the equality checks below would
    // otherwise skip the swap back to the EXPLORE track). That swap rides
    // switchMusicAtLoopEnd so it lands on the REST track's loop boundary
    // instead of cutting it off mid-loop.
    const cameFromRest = this.inRestMode;
    if (cameFromRest) {
      this.inRestMode = false;
      force = true;
    }
    const swap = (l1, l2) => cameFromRest ? this.switchMusicAtLoopEnd(l1, l2) : this.switchMusic(l1, l2);
    if (SEQUENCE_MUSIC[zone] && (force || this.currentMusicZone !== zone)) {
      if (this.switchToZoneSequence(zone)) {
        this.currentMusicZone = zone;
      }
    } else if (zone === 'cyan' && (force || this.currentMusicZone !== 'cyan')) {
      this.currentMusicZone = 'cyan';
      swap(`${base}assets/audio/cyan-layer1.mp3`, `${base}assets/audio/cyan-layer2.mp3`);
    } else if (zone !== 'cyan' && !SEQUENCE_MUSIC[zone]
               && (force || this.currentMusicZone === 'cyan'
                   || SEQUENCE_MUSIC[this.currentMusicZone])) {
      this.currentMusicZone = 'green';
      swap(`${base}assets/audio/layer1.mp3`, `${base}assets/audio/layer2.mp3`);
    }
  }

  /**
   * Seamlessly swap the currently playing dual-layer track for another,
   * scheduling the old sources to stop and the new ones to start exactly at
   * the current track's loop boundary rather than cutting it off mid-loop.
   * Falls back to an immediate switchMusic() when nothing is currently
   * playing to synchronize against.
   * @param {string} layer1Path
   * @param {string} layer2Path
   */
  async switchMusicAtLoopEnd(layer1Path, layer2Path) {
    if (this.mode !== 'dual' || !this.layer1Buffer || !this.isPlaying) {
      return this.switchMusic(layer1Path, layer2Path);
    }

    const loopDuration = this.layer1Buffer.duration;
    const currentTime = this.audioContext.currentTime;
    const elapsed = currentTime - this.playbackStartTime;
    const posInLoop = ((elapsed % loopDuration) + loopDuration) % loopDuration;
    const swapTime = currentTime + (loopDuration - posInLoop);

    // Claim this load — see _musicLoadId in the constructor for why.
    const loadId = ++this._musicLoadId;

    try {
      const [layer1Data, layer2Data] = await Promise.all([
        this.fetchAudioBuffer(layer1Path),
        this.fetchAudioBuffer(layer2Path)
      ]);
      const [newLayer1Buffer, newLayer2Buffer] = await Promise.all([
        this.audioContext.decodeAudioData(layer1Data),
        this.audioContext.decodeAudioData(layer2Data)
      ]);

      // Superseded while fetching/decoding (see switchMusic) — bail out
      // before scheduling stops/starts against a graph a newer call now owns.
      if (loadId !== this._musicLoadId) return false;

      // Land on the boundary computed above unless decoding overran it, in
      // which case start immediately rather than scheduling into the past.
      const startAt = Math.max(swapTime, this.audioContext.currentTime);

      const oldLayer1Source = this.layer1Source;
      const oldLayer2Source = this.layer2Source;
      if (oldLayer1Source) {
        oldLayer1Source.onended = () => oldLayer1Source.disconnect();
        try { oldLayer1Source.stop(startAt); } catch (_) {}
      }
      if (oldLayer2Source) {
        oldLayer2Source.onended = () => oldLayer2Source.disconnect();
        try { oldLayer2Source.stop(startAt); } catch (_) {}
      }

      this.layer1Buffer = newLayer1Buffer;
      this.layer2Buffer = newLayer2Buffer;

      this.layer1Source = this.audioContext.createBufferSource();
      this.layer2Source = this.audioContext.createBufferSource();
      this.layer1Source.buffer = newLayer1Buffer;
      this.layer2Source.buffer = newLayer2Buffer;
      this.layer1Source.loop = true;
      this.layer2Source.loop = true;
      this.layer1Source.connect(this.layer1Gain);
      this.layer2Source.connect(this.layer2Gain);
      this.layer1Source.start(startAt);
      this.layer2Source.start(startAt);

      this.playbackStartTime = startAt;
      return true;
    } catch (error) {
      console.error('[Audio] Failed to switch music at loop end:', error);
      return false;
    }
  }

  /**
   * Resolve a zone's dual-layer buffer paths for REST: its dedicated REST
   * track (used for both layers — layer 2 stays muted) if one exists,
   * otherwise the zone's EXPLORE track as the "peaceful" fallback. Sets
   * inRestMode accordingly and switches to it immediately (used only for the
   * boss-retreat path, where the prior 'sequence' mode has no loop position
   * to synchronize against).
   * @param {string} zone
   * @param {string} base - BASE_URL prefix
   */
  loadRestBuffers(zone, base) {
    const restPath = this.getRestMusicPath(zone);
    this.inRestMode = !!restPath;
    const [l1, l2] = restPath
      ? [`${base}${restPath}`, `${base}${restPath}`]
      : [`${base}assets/audio/layer1.mp3`, `${base}assets/audio/layer2.mp3`];
    return this.switchMusic(l1, l2);
  }

  /**
   * Switch to a zone's dedicated REST track, if one exists, waiting for the
   * currently playing EXPLORE track to finish its loop before cutting over
   * (via switchMusicAtLoopEnd). No-ops (leaving the current EXPLORE buffers
   * with layer 2 muted as the fallback) when the zone has no REST track —
   * see REST_MUSIC_PATHS. Layer 2 muting is left to the caller's existing
   * setLayer2Enabled(false) (enterRestState), which — called synchronously
   * right after this, before the swap's fetch/decode resolves — schedules
   * against the still-current EXPLORE buffer and lands on the same boundary.
   * @param {string} zone - 'green' | 'cyan' | 'red'
   * @param {string} base - BASE_URL prefix
   */
  switchRestMusic(zone, base) {
    if (this.mode !== 'dual') return;
    const restPath = this.getRestMusicPath(zone);
    if (!restPath || (this.inRestMode && this.currentMusicZone === zone)) return;
    this.inRestMode = true;
    this.currentMusicZone = zone;
    this.switchMusicAtLoopEnd(`${base}${restPath}`, `${base}${restPath}`);
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
    this.loadSFX('coin_pickup', `${base}assets/audio/sfx-coin-pickup.wav`);
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
    this.loadSFX('bomb_ripen', `${base}assets/audio/sfx-bomb-ripen.wav`);
    // Gray zone — placeholder names, no assets yet (playSFX no-ops on null).
    this.loadSFX('mist_take', null);   // depth-10 mist-out sequence
    this.loadSFX('bone_rise', null);   // Risen reassembling from its bone pile
    // P-room puzzles + key items — placeholder names, no assets yet.
    this.loadSFX('puzzle_pulse', null);  // correct listening-stone strike
    this.loadSFX('puzzle_fizzle', null); // wrong stone — sequence reset
    this.loadSFX('puzzle_solve', null);  // puzzle solved, spirit rises
    this.loadSFX('plank_place', null);   // Platform plank laid over deep water
    this.loadSFX('sword_draw', null);    // § drawn from the islet stone
    // Hoardmaw (green dungeon boss) — placeholder names, no assets yet. Every
    // beat of the encounter is already wired to these, so authoring the audio
    // later is a drop-in with no code change: grep loadSFX(.*null.
    this.loadSFX('boss_roar', null);       // ambush wake / phase-3 pile heaved back out
    this.loadSFX('boss_slam', null);       // lid slam impact, ambush snap, swallow spit
    this.loadSFX('boss_breath', null);     // Gold Breath curse lands (phase-2 entry)
    this.loadSFX('boss_hit', null);        // bribe refused / pile struck home
    this.loadSFX('armor_break', null);     // coin scale chipped loose, or re-absorbed
    this.loadSFX('scale_ricochet', null);  // a hit the armor turned away; grab broken
    // Dungeon 6-floor rework — placeholder names, no assets yet.
    this.loadSFX('dungeon_key_pickup', null); // Skull destroyed, key obtained
    this.loadSFX('dungeon_key_use', null);    // Key consumed at the Vault door
    // K room Vault Key — held, not equipped (same "held, not equipped"
    // pattern as the dungeon key above; see InteractionSystem.canUnlockVault).
    this.loadSFX('vault_key_pickup', null);   // Key-dropping object destroyed
    this.loadSFX('vault_key_use', null);      // Key consumed unlocking the vault door
    this.loadSFX('compass_beep', null);       // Compass ping (item present on floor)
    this.loadSFX('pyramid_fill', null);       // Legend of Three slot filled
    this.loadSFX('pyramid_solve', null);      // All 3 slots filled
    // Shop — placeholder name, no asset yet. Purchase-confirm reuses 'coin_plink'.
    this.loadSFX('shop_error', null);         // barter toggle rejected (can't afford/don't own)
    this.loadSFX('chi_buzz', null);           // proximity buzz — hidden χ in the X room
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
   * Load every sequential zone's tracks (see SEQUENCE_MUSIC) for playback.
   * Fire-and-forget — a zone whose files are missing is simply left unloaded
   * and falls back to the green dual-layer track via switchToZoneSequence.
   * @param {string} base - BASE_URL prefix
   */
  async loadZoneTracks(base) {
    if (!this.audioContext) return;
    await Promise.all(Object.entries(SEQUENCE_MUSIC).map(async ([zone, spec]) => {
      try {
        const datas = await Promise.all(
          spec.tracks.map(path => this.fetchAudioBuffer(`${base}${path}`))
        );
        this.zoneSequenceBuffers[zone] = await Promise.all(
          datas.map(d => this.audioContext.decodeAudioData(d))
        );
      } catch (e) {
        console.error(`[Audio] Failed to load ${zone} tracks:`, e);
      }
    }));
  }

  /**
   * Switch to a zone's sequential music, starting at its first track (A).
   * Stops whatever is currently playing — dual-layer sources or another
   * zone's sequence — and enters mode='zoneSequence'.
   * Requires loadZoneTracks() to have completed and a layer1Gain to exist.
   * @param {string} zone - a key of SEQUENCE_MUSIC
   * @returns {boolean} True if the sequence started
   */
  switchToZoneSequence(zone) {
    const buffers = this.zoneSequenceBuffers[zone];
    if (!buffers?.length) {
      console.warn(`[Audio] ${zone} tracks not loaded yet`);
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
    // …and any sequence already running, when crossing between two
    // sequential zones (red ↔ yellow) without passing through dual mode.
    this._stopZoneSequenceSource();

    this.mode = 'zoneSequence';
    this.sequenceZone = zone;
    this.zoneCombatActive = false;
    this._startZoneTrack(0);
    return true;
  }

  /**
   * Stop sequential playback and revert mode to 'dual' so dual-layer
   * APIs (switchMusic, setLayer2Enabled) can take over again.
   */
  stopZoneSequence() {
    this.stop();
    if (this.mode === 'zoneSequence') this.mode = 'dual';
  }

  /**
   * True while zone music owns playback — dual-layer or sequential, as
   * opposed to the title screen ('single') or a boss fight ('sequence').
   * Callers that swap zone music must check this first.
   */
  isZoneMusicActive() {
    return this.mode === 'dual' || this.mode === 'zoneSequence';
  }

  /**
   * Update the combat-active flag for sequential routing.
   * Takes effect at the end of the currently playing track (sequential music
   * never cuts mid-track); the per-zone calmNext/combatNext tables in
   * SEQUENCE_MUSIC decide where each boundary leads.
   */
  setZoneCombatActive(active) {
    if (this.mode !== 'zoneSequence') return;
    this.zoneCombatActive = !!active;
  }

  /**
   * Tear down the current sequence source without touching mode or flags.
   * Clearing onended first keeps the teardown from advancing the sequence.
   */
  _stopZoneSequenceSource() {
    if (!this.zoneSequenceSource) return;
    this.zoneSequenceSource.onended = null;
    try { this.zoneSequenceSource.stop(); } catch (_) {}
    this.zoneSequenceSource.disconnect();
    this.zoneSequenceSource = null;
  }

  /**
   * Start playing the active zone's track at the given index.
   * Sets up onended to advance via _onZoneTrackEnded().
   */
  _startZoneTrack(index) {
    this._stopZoneSequenceSource();
    this.zoneSequenceIndex = index;
    const source = this.audioContext.createBufferSource();
    source.buffer = this.zoneSequenceBuffers[this.sequenceZone][index];
    source.loop = false;
    source.connect(this.layer1Gain);
    source.onended = () => this._onZoneTrackEnded();
    source.start(0);
    this.zoneSequenceSource = source;
    this.isPlaying = true;
  }

  /**
   * Decide and play the next track at the boundary, per the active zone's
   * calmNext/combatNext table.
   */
  _onZoneTrackEnded() {
    if (this.mode !== 'zoneSequence') return;
    const spec = SEQUENCE_MUSIC[this.sequenceZone];
    if (!spec) return;
    const table = this.zoneCombatActive ? spec.combatNext : spec.calmNext;
    this._startZoneTrack(table[this.zoneSequenceIndex]);
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.stop();
    this.removeAutoplayUnblock();
    this.disarmAutoResume();
    this.disarmStallWatchdog();
    this._resumeInFlight = false;
    this._lastResumeAttempt = 0;
    // Invalidate any in-flight switchMusic/switchMusicAtLoopEnd load so its
    // resolution (against a context we're about to close) is a no-op.
    this._musicLoadId++;

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
    this.zoneSequenceBuffers = {};
    this.zoneSequenceSource = null;
    this.sequenceZone = null;
    this.mode = null;
  }
}
