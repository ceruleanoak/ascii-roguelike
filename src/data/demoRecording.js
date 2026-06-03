// Pre-recorded input sequences for the arcade attract-mode demo.
//
// Each entry plays back in EXPLORE on a deterministic room spawned from
// the recorded room spec (zone/depth/boss). The seed re-seeds Math.random
// so AI choices stay aligned; startState restores the player loadout used
// during recording; enemies is the snapshot of room.enemies captured at
// record time and is replayed on top of the regenerated room.
//
// To record a new entry: enter the room you want the demo to start in
// (warp through the cheat menu if needed), open the cheat menu (\), select
// TOGGLES → RECORD DEMO, play through the sequence, then re-open the cheat
// menu and toggle it off. The full JSON payload prints to the browser
// console — paste it into this array.
//
// Event shape: { f: frameNumber, type: 'keydown'|'keyup', key: '<KeyboardEvent.key value>' }
// Frames are 60 Hz (the GameLoop fixed timestep).

export const DEMO_RECORDINGS = [
  {
    "name": "recorded-mprd9725",
  "seed": 42095714,
  "durationFrames": 991,
  "startState": {
    "characterType": "default",
    "hp": 10,
    "quickSlots": [
      "⫯",
      null,
      null
    ],
    "activeSlotIndex": 0,
    "position": {
      "x": 234.22613638475414,
      "y": 439.13782464722135
    }
  },
  "room": {
    "zone": "green",
    "depth": 2,
    "boss": false
  },
  "enemies": [
    {
      "char": "r",
      "x": 80,
      "y": 336,
      "hp": 2
    },
    {
      "char": "o",
      "x": 272,
      "y": 112,
      "hp": 3
    }
  ],
  "events": [
    {
      "f": 145,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 175,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 180,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 181,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 211,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 214,
      "type": "keyup",
      "key": "w"
    },
    {
      "f": 216,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 220,
      "type": "keyup",
      "key": "a"
    },
    {
      "f": 226,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 256,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 261,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 266,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 271,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 276,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 279,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 291,
      "type": "keyup",
      "key": "w"
    },
    {
      "f": 294,
      "type": "keydown",
      "key": " "
    },
    {
      "f": 297,
      "type": "keyup",
      "key": "a"
    },
    {
      "f": 300,
      "type": "keyup",
      "key": " "
    },
    {
      "f": 352,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 361,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 391,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 393,
      "type": "keydown",
      "key": " "
    },
    {
      "f": 402,
      "type": "keyup",
      "key": " "
    },
    {
      "f": 431,
      "type": "keyup",
      "key": "d"
    },
    {
      "f": 532,
      "type": "keyup",
      "key": "w"
    },
    {
      "f": 554,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 567,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 586,
      "type": "keydown",
      "key": "ArrowRight"
    },
    {
      "f": 588,
      "type": "keydown",
      "key": "ArrowUp"
    },
    {
      "f": 599,
      "type": "keyup",
      "key": "ArrowRight"
    },
    {
      "f": 599,
      "type": "keyup",
      "key": "ArrowUp"
    },
    {
      "f": 621,
      "type": "keyup",
      "key": "w"
    },
    {
      "f": 628,
      "type": "keydown",
      "key": " "
    },
    {
      "f": 630,
      "type": "keyup",
      "key": "d"
    },
    {
      "f": 637,
      "type": "keyup",
      "key": " "
    },
    {
      "f": 672,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 681,
      "type": "keydown",
      "key": " "
    },
    {
      "f": 689,
      "type": "keyup",
      "key": "s"
    },
    {
      "f": 690,
      "type": "keyup",
      "key": " "
    },
    {
      "f": 738,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 768,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 773,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 778,
      "type": "keyup",
      "key": "a"
    }
  ]
  },
  {
  "name": "recorded-mpw1ph1u",
  "seed": 451566275,
  "durationFrames": 952,
  "startState": {
    "characterType": "default",
    "hp": 9,
    "quickSlots": [
      "↑",
      null,
      null
    ],
    "activeSlotIndex": 0,
    "position": {
      "x": 23.846127314711268,
      "y": 173.84257846755546
    }
  },
  "room": {
    "zone": "green",
    "depth": 1,
    "boss": false
  },
  "enemies": [
    {
      "char": "o",
      "x": 240,
      "y": 160,
      "hp": 3
    }
  ],
  "events": [
    {
      "f": 86,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 107,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 112,
      "type": "keyup",
      "key": "d"
    },
    {
      "f": 137,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 142,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 148,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 153,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 158,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 163,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 167,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 171,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 176,
      "type": "keyup",
      "key": "s"
    },
    {
      "f": 184,
      "type": "keyup",
      "key": "d"
    },
    {
      "f": 232,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 262,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 267,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 272,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 277,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 282,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 287,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 292,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 297,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 302,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 307,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 312,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 317,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 322,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 327,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 332,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 337,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 340,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 342,
      "type": "keyup",
      "key": "d"
    },
    {
      "f": 348,
      "type": "keydown",
      "key": "Shift"
    },
    {
      "f": 351,
      "type": "keyup",
      "key": "W"
    },
    {
      "f": 355,
      "type": "keydown",
      "key": "W"
    },
    {
      "f": 378,
      "type": "keyup",
      "key": "W"
    },
    {
      "f": 384,
      "type": "keyup",
      "key": "Shift"
    },
    {
      "f": 441,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 451,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 452,
      "type": "keyup",
      "key": "w"
    },
    {
      "f": 472,
      "type": "keydown",
      "key": "w"
    },
    {
      "f": 475,
      "type": "keyup",
      "key": "a"
    },
    {
      "f": 495,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 503,
      "type": "keyup",
      "key": "w"
    },
    {
      "f": 525,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 530,
      "type": "keydown",
      "key": "d"
    },
    {
      "f": 534,
      "type": "keydown",
      "key": " "
    },
    {
      "f": 542,
      "type": "keyup",
      "key": "d"
    },
    {
      "f": 545,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 549,
      "type": "keyup",
      "key": " "
    },
    {
      "f": 564,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 566,
      "type": "keyup",
      "key": "s"
    },
    {
      "f": 585,
      "type": "keydown",
      "key": "s"
    },
    {
      "f": 586,
      "type": "keydown",
      "key": " "
    },
    {
      "f": 587,
      "type": "keyup",
      "key": "s"
    },
    {
      "f": 591,
      "type": "keyup",
      "key": "a"
    },
    {
      "f": 593,
      "type": "keyup",
      "key": " "
    },
    {
      "f": 594,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 598,
      "type": "keyup",
      "key": "a"
    },
    {
      "f": 627,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 657,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 662,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 667,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 673,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 678,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 683,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 688,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 693,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 698,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 703,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 708,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 713,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 718,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 723,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 728,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 733,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 738,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 743,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 748,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 753,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 758,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 763,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 768,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 773,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 778,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 783,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 788,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 793,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 798,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 803,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 808,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 813,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 818,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 823,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 828,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 833,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 838,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 843,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 848,
      "type": "keydown",
      "key": "a"
    },
    {
      "f": 850,
      "type": "keydown",
      "key": " "
    },
    {
      "f": 861,
      "type": "keyup",
      "key": " "
    },
    {
      "f": 865,
      "type": "keyup",
      "key": "a"
    }
  ]
  },
];
