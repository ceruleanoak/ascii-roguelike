// The Zenith summit: the Z room's hand-authored map (ZenithSystem.generateZenithRoom).
//
// A mountain top seen from above, lopsided the way real peaks are. The foot
// cliff rings a grassy terrace; the upper cliff rings the bare, frost-dusted
// summit, which sits high in the north-east of the massif: its north face
// drops almost straight onto the foot cliff (scree below it), while the
// terrace runs long and wide down the south and west. A west gully cuts the
// foot cliff and spills scree onto the slope below. One trail climbs from the
// trailhead under the south steps, across the terrace, up the east side and
// through the east steps onto the summit, where the cairn stands.
//
// The five stations sit along that climb in the order the world gets harder,
// so higher means further from home: the Gold Hero (the one it all started
// with) at the trailhead, Green on the west terrace up a spur of the trail, Yellow on the spur, Red
// on the east terrace below the last climb, and Cyan on the summit itself,
// whose word is Frozen Peaks.
//
// Legend (one character per 16px cell, 30x30, row 0 at the top):
//   ' '  open ground below the mountain (the room's own dressing may grow)
//   ','  terrace, bare          ';'  terrace grass tuft
//   '^'  summit floor, bare     '*'  frost on the summit floor
//   '#'  foot cliff (solid)     '%'  upper cliff (solid)
//   '='  steps cut through a cliff
//   '.'  trail                  ':'  scree
//   'A'  the cairn (solid; the motes meet on it)
//   'h' 'g' 'y' 'r' 'c'  the five stations: the Gold Hero, green, yellow, red, cyan
//
// Everything but ' ' is open except the cliffs and the cairn. The exit lanes
// (three cells in from each exit, cols/rows 14-16) stay ' '.

export const ZENITH_SUMMIT_MAP = [
  '                              ', // 0
  '                              ', // 1
  '           :       :          ', // 2
  '         :: :     : :         ', // 3
  '          ##########          ', // 4
  '         ##,,%%%%%,###        ', // 5
  '        ##;;%%**^%%%;#        ', // 6
  '       ##,,,%^*****%%##       ', // 7
  '       #,,,;%^*^***^%,#       ', // 8
  '      ##;,,,%*^^^A*^%,##      ', // 9
  '     :: #,,,%^*^^^*^=,,#      ', // 10
  '     :::::,,%c......=;,#      ', // 11
  '    : :##;,,%^**^^*^%.;#      ', // 12
  '       ##,,,%%*^^^**%.;#      ', // 13
  '        #,,,,%%%***%%;r#      ', // 14
  '        #;,,;,,%%%%%,.,#      ', // 15
  '       ##;;;,;,;;;;,;.;##     ', // 16
  '      ##,,,;,;,,,;,;.,;,#     ', // 17
  '       #,;g.;;,,;,,,y,,,#     ', // 18
  '       ##,;;..,;....;;,##     ', // 19
  '        ##;;;,..;,;;,,##      ', // 20
  '         ######==######       ', // 21
  '               .              ', // 22
  '               .              ', // 23
  '            h...              ', // 24
  '                              ', // 25
  '                              ', // 26
  '                              ', // 27
  '                              ', // 28
  '                              ', // 29
];

// Map characters that block: the motes' pennant lines skip these cells.
export const ZENITH_SOLID_KEYS = new Set(['#', '%', 'A']);

// Station letter in the map → character type.
export const ZENITH_STATION_KEYS = {
  h: 'default',
  g: 'green',
  y: 'yellow',
  r: 'red',
  c: 'cyan'
};

// Map character → the BACKGROUND_OBJECT_VARIANTS entry and glyph laid there.
// Cells not listed (' ', ',', '^', stations) get no object. Scree alternates
// its two glyphs by cell parity so a field of it never reads as a pattern.
export const ZENITH_SUMMIT_TILES = {
  '#': { typeId: 'zenith_foot_cliff', char: '☷' },
  '%': { typeId: 'zenith_upper_cliff', char: '☷' },
  '=': { typeId: 'zenith_steps', char: '⩸' },
  '.': { typeId: 'zenith_trail', char: '·' },
  ':': { typeId: 'zenith_scree', char: '∴', altChar: '∵' },
  ';': { typeId: 'zenith_grass', char: 'ʷ' },
  '*': { typeId: 'zenith_frost', char: '∙' },
  'A': { typeId: 'zenith_cairn', char: '⧋' }
};

// The cairn's color once the five have gathered there: the run carries the mark.
export const ZENITH_CAIRN_GATHERED_COLOR = '#ffe27a';
