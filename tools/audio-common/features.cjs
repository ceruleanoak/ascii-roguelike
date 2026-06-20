// features.cjs — extract a numeric feature vector from a DX7 patch `struct`
// (as produced by syx.cjs voiceToStruct). Used by analyze-library.cjs (clustering)
// and at runtime for "more like this". Features describe the SOUND (synthesis
// structure), never the name. Zero-dependency; CommonJS + browser global.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Features = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Carrier operator indices (OP1..OP6 → 0..5) per DX7 algorithm 1..32.
  var CARRIERS = [
    [0,2],[0,2],[0,3],[0,3],[0,2,4],[0,2,4],[0,2],[0,2],[0,2],[0,3],
    [0,3],[0,2],[0,2],[0,2],[0,2],[0],[0],[0],[0,3,4],[0,1,3],
    [0,1,3,4],[0,2,3,4],[0,1,3,4],[0,1,2,3,4],[0,1,2,3,4],[0,1,3],[0,1,3],[0,2,5],[0,1,2,4],[0,1,2,5],
    [0,1,2,3,4],[0,1,2,3,4,5]
  ];

  var NAMES = ['numCarriers','feedback','fracFixed','modBright','avgModRatio','maxRatio',
    'inharmonic','attack','sustain','release','detuneSpread','lfoVib','lfoTrem','lfoSpeed','register'];

  function ratioOf(op) { return op.oscMode === 'fixed' ? 0 : (op.freqCoarse === 0 ? 0.5 : op.freqCoarse) * (1 + (op.freqFine || 0) / 100); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }

  // → raw feature array in NAMES order.
  function extractRaw(struct) {
    var ops = struct.operators || [];
    var carriers = CARRIERS[(struct.algorithm || 1) - 1] || [0];
    var carrierSet = {}; carriers.forEach(function (i) { carrierSet[i] = true; });
    var carrierOps = ops.filter(function (o, i) { return carrierSet[i]; });
    var modOps = ops.filter(function (o, i) { return !carrierSet[i]; });

    var fixedCount = ops.filter(function (o) { return o.oscMode === 'fixed'; }).length;
    var modRatios = modOps.map(ratioOf);
    var allRatios = ops.map(ratioOf);
    var modBright = mean(modOps.map(function (o) { return ratioOf(o) * (o.outputLevel || 0) / 99; }));
    var inharmCount = ops.filter(function (o) {
      if (o.oscMode === 'fixed') return true;
      var r = ratioOf(o); return Math.abs(r - Math.round(r)) > 0.06;
    }).length;
    var detunes = ops.map(function (o) { return o.detune || 0; });
    var detuneSpread = Math.max.apply(null, detunes) - Math.min.apply(null, detunes);
    var lfo = struct.lfo || {};

    return [
      carriers.length,                                            // numCarriers 1..6
      struct.feedback || 0,                                       // 0..7
      fixedCount / 6,                                             // fracFixed 0..1
      modBright,                                                  // brightness proxy
      mean(modRatios),                                            // avg modulator ratio
      Math.max.apply(null, allRatios.concat([0])),               // max ratio
      inharmCount / 6,                                            // inharmonicity 0..1
      mean(carrierOps.map(function (o) { return o.egRate[0]; })), // attack rate 0..99
      mean(carrierOps.map(function (o) { return o.egLevel[2]; })),// sustain level 0..99
      mean(carrierOps.map(function (o) { return o.egRate[3]; })), // release rate 0..99
      detuneSpread,                                              // detune spread 0..14
      (lfo.pitchModDepth || 0) * ((lfo.pitchModSens || 0) + 1) / 8, // vibrato amount
      lfo.ampModDepth || 0,                                       // tremolo amount
      lfo.speed || 0,                                             // lfo speed 0..99
      (struct.transpose || 0)                                     // register -24..24
    ];
  }

  // Per-patch descriptive flags (thresholds on raw features) — searchable extras.
  function flags(raw) {
    var f = [];
    var numC = raw[0], inharm = raw[6], attack = raw[7], sustain = raw[8], release = raw[9],
        detune = raw[10], vib = raw[11], bright = raw[3], fracFixed = raw[2];
    if (attack > 80 && sustain < 45) f.push('percussive');
    if (sustain > 70) f.push('sustained');
    if (release < 35) f.push('short-release');
    if (inharm > 0.34 || fracFixed > 0.34) f.push('metallic');
    if (bright > 1.2) f.push('bright');
    if (detune > 3) f.push('wide');
    if (vib > 18) f.push('vibrato');
    return f;
  }

  // Rich descriptive flags computed from the synthesis structure — the main
  // searchable "character" facets. Includes the keyboard-tracking flags that
  // explain why a patch may seem not to "play the note you pressed".
  function descriptors(struct) {
    var raw = extractRaw(struct);
    var carr = CARRIERS[(struct.algorithm || 1) - 1] || [0];
    var cops = carr.map(function (i) { return struct.operators[i]; }).filter(Boolean);
    var fixedC = cops.filter(function (o) { return o.oscMode === 'fixed'; }).length;
    var atk = mean(cops.map(function (o) { return o.egRate[0]; }));
    var sus = mean(cops.map(function (o) { return o.egLevel[2]; }));
    var rel = mean(cops.map(function (o) { return o.egRate[3]; }));
    var velMax = Math.max.apply(null, cops.map(function (o) { return o.keyVelSens || 0; }).concat([0]));
    var dts = cops.map(function (o) { return o.detune || 0; });
    var detSpread = Math.max.apply(null, dts) - Math.min.apply(null, dts);
    var subLow = cops.some(function (o) { return o.oscMode === 'fixed' && o.freqCoarse <= 1; });
    var peg = (struct.pitchEG && struct.pitchEG.level) || [0, 0, 0, 0];
    var pegRange = Math.max.apply(null, peg) - Math.min.apply(null, peg);
    var f = [];
    if (fixedC === carr.length) f.push('non-pitched');         // drums/SFX — ignores the key
    else if (fixedC > 0) f.push('fixed-pitch');                // partly ignores the key
    if (atk > 80 && sus < 45) f.push('percussive');
    if (sus > 70) f.push('sustained');
    if (atk < 35) f.push('swell');
    if (rel > 80) f.push('snappy');
    if (raw[6] > 0.34 || raw[2] > 0.34) f.push('metallic');
    if (raw[3] < 0.3) f.push('dark'); else if (raw[3] > 2.5) f.push('bright');
    if (subLow) f.push('sub');
    if ((struct.transpose || 0) <= -12) f.push('bass-register');
    if (velMax >= 4) f.push('dynamic');
    if (raw[12] > 15) f.push('tremolo');
    if (raw[11] > 15) f.push('vibrato');
    if (pegRange > 30) f.push('pitch-sweep');
    if (detSpread >= 4) f.push('lush');
    return f;
  }

  function isBadName(nm) {
    var t = (nm || '').trim(); if (!t) return true;
    var distinct = new Set(t.replace(/\s/g, '').toLowerCase()).size;
    var alnum = (t.match(/[a-z0-9]/gi) || []).length;
    return (distinct <= 2 && t.length >= 3) || alnum < t.length * 0.4;
  }

  // Playability heuristics — why a patch may "not play" in a short audition.
  // silent: carriers have ~no output (init/empty patch). slow: very slow attack.
  function playability(struct) {
    var carr = CARRIERS[(struct.algorithm || 1) - 1] || [0];
    var cops = carr.map(function (i) { return struct.operators[i]; }).filter(Boolean);
    if (!cops.length) return { silent: true, slow: false };
    var maxOut = Math.max.apply(null, cops.map(function (o) { return o.outputLevel || 0; })); // 0..99
    var atk = mean(cops.map(function (o) { return o.egRate[0]; }));
    return { silent: maxOut <= 1, slow: atk < 25 };
  }

  return { extractRaw: extractRaw, flags: flags, descriptors: descriptors, isBadName: isBadName, playability: playability, NAMES: NAMES, CARRIERS: CARRIERS };
});
