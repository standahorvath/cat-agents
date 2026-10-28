// The office jukebox: songs composed on the fly and played with Web Audio
// synthesisers (no samples).
//
// generateTrack() writes a whole song as plain data: key, chord progressions,
// song form, a motif-based melody, bass, comping, arpeggios and drums.
// MusicPlayer plays it through its own small mixer with per-style effects.

export const MUSIC_STYLES = {
  auto: { name: 'Náhodně', desc: 'Každá skladba v jiném stylu' },
  lofi: { name: 'Lo-fi', desc: 'Rhodes, líné bicí a praskání desky' },
  jazz: { name: 'Jazz', desc: 'Vibrafon, swing a chodící basa' },
  bossa: { name: 'Bossa nova', desc: 'Kytara, flétna a šumítko' },
  chiptune: { name: 'Chiptune', desc: 'Osmibitové melodie s ozvěnou' },
  synthwave: { name: 'Synthwave', desc: 'Neonová osmdesátá, pumpující plochy' },
  ambient: { name: 'Ambient', desc: 'Zvonky a plochy na soustředění' },
};

// Randomness

// Seeded when a seed is given (tests, rendering), otherwise Math.random.
function makeRng(seed) {
  if (seed == null) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Harmony

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const MODE_NAMES = { major: 'dur', minor: 'moll', dorian: 'dórská', lydian: 'lydická' };
const NOTE_NAMES = ['C', 'C#', 'D', 'Es', 'E', 'F', 'F#', 'G', 'As', 'A', 'B', 'H'];

// Progressions in Roman numerals (upper case major, lower case minor, b = flat).
const HARMONY = {
  pop: { scale: 'major', prog: ['I V vi IV', 'I vi IV V', 'vi IV I V', 'IV V iii vi', 'I IV vi V', 'I iii IV V', 'IV I V vi', 'ii IV I V', 'I V IV IV', 'vi V IV V'] },
  popMinor: { scale: 'minor', prog: ['i bVI bIII bVII', 'i bVII bVI bVII', 'i iv bVII bIII', 'bVI bVII i i', 'i bIII bVII iv', 'iv bVI bVII i', 'i bVI iv bVII', 'bVI bIII bVII i'] },
  jazzy: { scale: 'major', prog: ['ii7 V7 Imaj7 VI7', 'Imaj7 vi7 ii7 V7', 'IVmaj7 iii7 ii7 Imaj7', 'iii7 VI7 ii7 V7', 'Imaj7 IVmaj7 iii7 vi7', 'IVmaj7 V7 iii7 vi7', 'Imaj7 I7 IVmaj7 iv7', 'ii7 V7 iii7 VI7', 'IVmaj7 iv7 iii7 VI7'] },
  jazzyMinor: { scale: 'dorian', prog: ['i7 IV7 i7 IV7', 'i7 bVIImaj7 bIIImaj7 IV7', 'ii7 v7 i7 i7', 'bIIImaj7 IV7 i7 bVIImaj7', 'i7 ii7 bIIImaj7 IV7', 'i7 v7 bVIImaj7 IV7'] },
  bossa: { scale: 'major', prog: ['Imaj7 II7 ii7 V7', 'Imaj7 vi7 ii7 V7', 'ii7 V7 Imaj7 Imaj7', 'Imaj7 IVmaj7 iii7 VI7', 'IVmaj7 iv7 Imaj7 VI7', 'iii7 VI7 ii7 V7'] },
  dreamy: { scale: 'lydian', prog: ['Imaj7 II Imaj7 II', 'Imaj7 II vi7 iii7', 'vi7 II Imaj7 Imaj7', 'Imaj7 V vi7 II'] },
  calm: { scale: 'major', prog: ['Imaj7 IVmaj7 Imaj7 IVmaj7', 'Imaj7 vi7 IVmaj7 Imaj7', 'vi7 IVmaj7 Imaj7 V', 'IVmaj7 Imaj7 vi7 V'] },
  calmMinor: { scale: 'minor', prog: ['i7 bVImaj7 bIIImaj7 bVII', 'i7 iv7 bVImaj7 bVII', 'bVImaj7 bVII i7 i7', 'i7 bIIImaj7 bVImaj7 iv7'] },
};

const QUALITY = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
};
const NUMERAL = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };

export function parseChord(symbol) {
  const m = /^([b#]?)(vii|vi|v|iv|iii|ii|i)(maj7|7|ø|o|sus4|add9)?$/i.exec(symbol);
  if (!m) throw new Error(`Neznámý akord ${symbol}`);
  const major = m[2] === m[2].toUpperCase();
  const root = (NUMERAL[m[2].toLowerCase()] + (m[1] === 'b' ? 11 : m[1] === '#' ? 1 : 0)) % 12;
  const quality = { maj7: 'maj7', 7: major ? 'dom7' : 'm7', ø: 'm7b5', o: 'dim', sus4: 'sus4', add9: major ? 'add9' : 'madd9' }[m[3]] ?? (major ? 'maj' : 'min');
  return { symbol, root, tones: QUALITY[quality] };
}

// Styles

// Drum rows, one character per sixteenth: X accent, x normal, g ghost.
// k kick, s snare, c clap, h hat, o open hat, r ride, p pedal hat, b brush,
// sh shaker, rim rim click, t1/t2 toms.
const GROOVES = {
  lofi: {
    intro: [{ h: 'x.x.x.x.x.x.x.x.' }],
    verse: [
      { k: 'X.........X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      { k: 'X......x..X.....', s: '....X.......X..g', h: 'x.x.x.x.x.x.xxx.' },
      { k: 'X.........X..x..', s: '....X..g....X...', h: 'x.x.x.x.x.x.x.x.' },
    ],
    chorus: [
      { k: 'X.........X.....', s: '....X.......X...', h: 'x.xxx.x.x.xxx.x.', o: '..............x.' },
      { k: 'X......x..X..x..', s: '....X..g....X...', h: 'xxx.x.xxx.x.x.x.', o: '......x.........' },
    ],
    bridge: [{ k: 'X.........x.....', s: '............X...', h: 'x...x...x...x...' }],
    fill: [
      { k: 'X.........X.....', s: '....X.......XgXg', h: 'x.x.x.x.x.x.....' },
      { k: 'X.......', s: '....X...', h: 'x.x.x.x.' },
    ],
  },
  jazz: {
    intro: [{ r: 'x...x.x.x...x.x.', p: '....x.......x...' }],
    verse: [
      { r: 'X...x.x.X...x.x.', p: '....x.......x...', b: '....x.......x...', k: 'g...............' },
      { r: 'X...x.x.X...x.x.', p: '....x.......x...', b: '....x.......x...', s: '..........g.....' },
    ],
    chorus: [
      { r: 'X...x.x.X...x.x.', p: '....x.......x...', b: '....x..g....x..g', k: 'g.......g.......' },
      { r: 'X...x.x.X...x.xx', p: '....x.......x...', b: '....x.......x...', s: '......g.......g.' },
    ],
    bridge: [{ r: 'X...x.x.X...x.x.', p: '....x.......x...', b: '....x.......x...' }],
    fill: [
      { r: 'X...x.x.X.......', p: '....x...', s: '........x..xx.X.', k: '..............X.' },
      { r: 'X...x.x.X...x...', p: '....x...', s: '......g...x.x.xX' },
    ],
  },
  bossa: {
    intro: [{ sh: 'xgxgxgxgxgxgxgxg' }],
    verse: [
      { k: 'X..x....X..x....', rim: 'x..x..x...x..x..', sh: 'xgxgxgxgxgxgxgxg' },
      { k: 'X..x....X..x....', rim: '..x..x...x..x...', sh: 'xgxgxgxgxgxgxgxg' },
    ],
    chorus: [{ k: 'X..x....X..x....', rim: 'x..x..x...x..x..', sh: 'xgxgxgxgxgxgxgxg', h: '..x...x...x...x.' }],
    bridge: [{ k: 'X.......X.......', sh: 'xgxgxgxgxgxgxgxg', rim: '....x.......x...' }],
    fill: [
      { k: 'X..x....X.......', sh: 'xgxgxgxgxgxg', t1: '........x.x.....', t2: '............x.x.' },
      { k: 'X..x....X..x....', rim: 'x..x..x...xxxxxx', sh: 'xgxgxgxgxgxgxgxg' },
    ],
  },
  chiptune: {
    intro: [{ h: 'x.x.x.x.x.x.x.x.' }],
    verse: [
      { k: 'X.......X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      { k: 'X.....x.X.......', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
    ],
    chorus: [
      { k: 'X.....x.X.x.....', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx' },
      { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx' },
    ],
    bridge: [{ k: 'X.......X.......', s: '............X...', h: 'x...x...x...x...' }],
    fill: [
      { k: 'X.......X.......', s: '....X...XxXxXXXX' },
      { k: 'X.......', s: '....X...', t1: '........X.X.....', t2: '............X.X.' },
    ],
  },
  synthwave: {
    intro: [{ k: 'X...X...X...X...' }],
    verse: [
      { k: 'X.......X.x.....', s: '....X.......X...', h: '..x...x...x...x.' },
      { k: 'X...X...X...X...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
    ],
    chorus: [
      { k: 'X...X...X...X...', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
      { k: 'X...X...X...X..x', s: '....X.......X...', h: 'x.xxx.xxx.xxx.xx', o: '..x.......x.....' },
    ],
    bridge: [{ k: 'X.......X.......', s: '............X...', h: '..x...x...x...x.' }],
    fill: [
      { k: 'X...X...X...X...', s: '....X...', t1: '........X.X.....', t2: '............X.X.' },
      { k: 'X...X...', s: '....X...XxXxXXXX' },
    ],
  },
  ambient: {
    intro: [{}],
    verse: [{}],
    chorus: [{ sh: 'x...g...x...g...' }, { sh: 'x.g.x...x.g.x...' }],
    bridge: [{}],
    fill: [{}],
  },
};

// Bass patterns: [step, note, length]. R root, F fifth, O octave, A approach
// to the next chord's root.
const BASS = {
  lofi: [
    [[0, 'R', 10], [10, 'R', 6]],
    [[0, 'R', 6], [7, 'R', 3], [10, 'F', 4], [14, 'A', 2]],
    [[0, 'R', 14], [14, 'A', 2]],
    [[0, 'R', 3], [3, 'R', 5], [10, 'O', 3], [13, 'F', 3]],
  ],
  bossa: [
    [[0, 'R', 5], [6, 'F', 2], [8, 'F', 5], [14, 'R', 2]],
    [[0, 'R', 6], [6, 'F', 2], [8, 'F', 6], [14, 'A', 2]],
  ],
  chiptune: [
    [[0, 'R', 2], [2, 'O', 2], [4, 'R', 2], [6, 'O', 2], [8, 'R', 2], [10, 'O', 2], [12, 'R', 2], [14, 'O', 2]],
    [[0, 'R', 3], [3, 'R', 3], [6, 'F', 2], [8, 'R', 3], [11, 'O', 3], [14, 'F', 2]],
    [[0, 'R', 2], [2, 'R', 2], [4, 'O', 2], [6, 'R', 2], [8, 'F', 2], [10, 'F', 2], [12, 'O', 2], [14, 'A', 2]],
  ],
  synthwave: [
    [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, 'R', 2], [14, 'O', 2]],
    [[0, 'R', 1], [2, 'R', 1], [3, 'R', 1], [4, 'R', 1], [6, 'R', 1], [7, 'R', 1], [8, 'R', 1], [10, 'R', 1], [11, 'R', 1], [12, 'O', 1], [14, 'R', 1], [15, 'R', 1]],
    [[0, 'R', 2], [2, 'O', 2], [4, 'R', 2], [6, 'O', 2], [8, 'R', 2], [10, 'O', 2], [12, 'R', 2], [14, 'O', 2]],
  ],
  ambient: [[[0, 'R', 16]], [[0, 'R', 12], [12, 'F', 4]]],
};

// Comping rhythms: [step, length].
const COMP = {
  lofi: [[[0, 14]], [[0, 6], [6, 10]], [[0, 3], [3, 13]], [[0, 8], [10, 6]], [[0, 6], [10, 4], [14, 2]]],
  jazz: [[[0, 2], [6, 4]], [[2, 2], [10, 4]], [[0, 3], [7, 3], [12, 2]], [[4, 2], [10, 3]], [[0, 2], [6, 2], [14, 2]]],
  bossa: [[[0, 2], [3, 2], [6, 3], [10, 2], [12, 3]], [[0, 3], [3, 2], [6, 2], [10, 3], [13, 3]]],
  chiptune: [[[2, 1], [6, 1], [10, 1], [14, 1]], [[2, 1], [4, 1], [10, 1], [12, 1]]],
  synthwave: [[[0, 16]]],
  ambient: [[[0, 16]]],
};

// Melody rhythm cells, one beat each, with weights.
const CELLS = {
  sparse: [['x...', 4], ['....', 3], ['..x.', 1], ['x.x.', 1]],
  medium: [['x...', 3], ['x.x.', 4], ['..x.', 2], ['x..x', 1], ['....', 1.5], ['x.xx', 1], ['.x.x', 0.5]],
  dense: [['x.x.', 3], ['xxxx', 2], ['x.xx', 2], ['xx.x', 1], ['x...', 1], ['..x.', 1]],
  eighths: [['x.x.', 4], ['x...', 3], ['..x.', 2], ['....', 1]],
  solo: [['x.x.', 6], ['xxx.', 1], ['x...', 1], ['..x.', 1], ['.xxx', 0.5]],
};
const CADENCES = ['x.......x.......', 'x...x...x.......', 'x.x.x...........', 'x...............', '..x.x...x.......'];

const FORMS = {
  short: [
    [['intro', 4], ['A', 8], ['B', 8], ['A', 8], ['B', 8], ['outro', 4]],
    [['intro', 4], ['A', 8], ['B', 8], ['C', 8], ['B', 8], ['outro', 4]],
    [['intro', 2], ['A', 8], ['A', 8], ['B', 8], ['C', 4], ['B', 8], ['outro', 4]],
  ],
  long: [
    [['intro', 4], ['A', 8], ['B', 8], ['A', 8], ['B', 8], ['C', 8], ['B', 8], ['outro', 4]],
    [['intro', 4], ['A', 8], ['A', 8], ['B', 8], ['C', 8], ['B', 8], ['B', 8], ['outro', 4]],
  ],
  slow: [
    [['intro', 4], ['A', 8], ['B', 8], ['A', 8], ['outro', 4]],
    [['intro', 4], ['A', 8], ['B', 8], ['C', 8], ['B', 8], ['outro', 4]],
  ],
};

// Mixer channels: [level, pan, reverb send, echo send].
const CHANNELS = {
  lead: [0.95, 0.06, 0.22, 0.14],
  counter: [0.32, -0.4, 0.3, 0.1],
  comp: [0.42, -0.18, 0.2, 0],
  pad: [0.3, 0.12, 0.4, 0],
  arp: [0.26, 0.35, 0.25, 0.25],
  bass: [0.62, 0, 0.02, 0],
  kick: [0.8, 0, 0.03, 0],
  snare: [0.5, 0.04, 0.2, 0],
  hat: [0.22, 0.3, 0.06, 0],
  perc: [0.3, -0.32, 0.14, 0],
  cym: [0.2, -0.2, 0.25, 0],
};

const STYLES = {
  lofi: {
    bpm: [70, 84],
    swing: 0.55,
    swingUnit: 16,
    humanize: 0.012,
    harmony: ['jazzy', 'jazzy', 'jazzyMinor'],
    ninths: 0.5,
    forms: FORMS.short,
    chordBars: 1,
    melody: { A: 'medium', B: 'medium', C: 'sparse' },
    bridge: 'motif',
    inst: { lead: ['rhodesLead', 'softSquare', 'flute'], comp: ['rhodes'], pad: ['warmPad'], bass: ['sub'] },
    pad: ['B'],
    harmonize: true,
    fx: { reverb: 1.8, wet: 0.9, echo: 3, feedback: 0.3, tone: 3400, crackle: true, wobble: 9 },
    mix: { snare: [0.42, 0.04, 0.16, 0], bass: [0.5, 0, 0.02, 0] },
    gap: [4, 8],
  },
  jazz: {
    bpm: [108, 132],
    swing: 0.8,
    swingUnit: 8,
    humanize: 0.008,
    harmony: ['jazzy', 'jazzy', 'jazzyMinor'],
    ninths: 0.7,
    rootless: true,
    forms: FORMS.short,
    chordBars: 1,
    melody: { A: 'eighths', B: 'eighths', C: 'solo' },
    bridge: 'solo',
    walk: true,
    inst: { lead: ['vibes', 'rhodesLead'], comp: ['rhodes'], bass: ['upright'] },
    harmonize: true,
    fx: { reverb: 1.5, wet: 0.8, echo: 2, feedback: 0.2, tone: 9000, tremolo: true },
    mix: { comp: [0.34, -0.25, 0.2, 0], bass: [0.5, 0, 0.02, 0], snare: [0.75, 0.1, 0.2, 0], hat: [0.3, 0.25, 0.08, 0], cym: [0.45, -0.3, 0.22, 0] },
    gap: [4, 8],
  },
  bossa: {
    bpm: [120, 140],
    swing: 0,
    swingUnit: 16,
    humanize: 0.008,
    harmony: ['bossa', 'bossa', 'jazzy'],
    ninths: 0.6,
    forms: FORMS.short,
    chordBars: 1,
    melody: { A: 'medium', B: 'medium', C: 'sparse' },
    bridge: 'motif',
    inst: { lead: ['flute', 'vibes'], comp: ['nylon'], bass: ['upright'] },
    harmonize: true,
    fx: { reverb: 1.6, wet: 0.8, echo: 3, feedback: 0.22, tone: 9000 },
    mix: { comp: [0.5, -0.3, 0.18, 0], bass: [0.5, 0, 0.02, 0], perc: [0.28, 0.35, 0.12, 0] },
    gap: [4, 8],
  },
  chiptune: {
    bpm: [128, 150],
    swing: 0,
    swingUnit: 16,
    humanize: 0,
    harmony: ['pop', 'pop', 'popMinor'],
    ninths: 0,
    forms: FORMS.long,
    chordBars: 1,
    melody: { A: 'medium', B: 'dense', C: 'medium' },
    bridge: 'motif',
    inst: { lead: ['pulse25', 'pulse50'], comp: ['pulse12'], arp: ['pulse12'], bass: ['chipTri'], counter: ['pulse12'] },
    arp: { sections: ['A', 'B', 'C'], rate: 1 },
    echoLead: true,
    keyChange: 0.5,
    riser: true,
    fx: { reverb: 1, wet: 0.35, echo: 3, feedback: 0.25, tone: 12000 },
    mix: { lead: [1.2, 0.06, 0.12, 0.12], counter: [0.8, -0.4, 0.12, 0.1], comp: [0.6, -0.3, 0.1, 0], arp: [0.55, 0.35, 0.12, 0.15] },
    gap: [3, 6],
  },
  synthwave: {
    bpm: [96, 114],
    swing: 0,
    swingUnit: 16,
    humanize: 0,
    harmony: ['popMinor', 'popMinor', 'pop'],
    ninths: 0,
    forms: FORMS.long,
    chordBars: 1,
    melody: { A: 'medium', B: 'medium', C: 'sparse' },
    bridge: 'rest',
    inst: { lead: ['sawLead', 'squareLead'], comp: ['superPad'], arp: ['pluck'], bass: ['synthBass'], counter: ['sawLead'] },
    arp: { sections: ['B', 'C', 'outro'], rate: 1 },
    octaveDouble: true,
    keyChange: 0.5,
    riser: true,
    sidechain: true,
    fx: { reverb: 2.8, wet: 1, echo: 3, feedback: 0.4, tone: 11000 },
    mix: { lead: [1.2, 0.06, 0.25, 0.18], snare: [0.45, 0, 0.5, 0], kick: [0.65, 0, 0.03, 0], comp: [0.55, 0, 0.35, 0], arp: [0.7, 0.35, 0.3, 0.3] },
    gap: [3, 6],
  },
  ambient: {
    bpm: [58, 68],
    swing: 0,
    swingUnit: 16,
    humanize: 0.01,
    harmony: ['dreamy', 'calm', 'calmMinor'],
    ninths: 0.6,
    forms: FORMS.slow,
    chordBars: 2,
    melody: { A: 'sparse', B: 'sparse', C: 'sparse' },
    bridge: 'motif',
    inst: { lead: ['bell', 'flute'], comp: ['warmPad'], arp: ['bell'], bass: ['sub'] },
    arp: { sections: ['B'], rate: 2 },
    fx: { reverb: 4.5, wet: 1.2, echo: 3, feedback: 0.45, tone: 8000 },
    mix: { lead: [0.85, 0.1, 0.5, 0.35], arp: [0.3, -0.35, 0.5, 0.3], bass: [0.26, 0, 0.1, 0], comp: [0.45, 0, 0.45, 0] },
    gap: [5, 10],
  },
};

export const STYLE_NAMES = Object.keys(STYLES);

// Funny titles shown in the jukebox.
const TITLE_A = ['Ospalý', 'Půlnoční', 'Líný', 'Neonový', 'Krabicový', 'Vrnivý', 'Tajný', 'Ranní', 'Deštivý', 'Kosmický', 'Mňoukavý', 'Páteční', 'Ztracený', 'Hebký'];
const TITLE_B = ['ocásek', 'polštář', 'tuňák', 'merge', 'commit', 'paprsek', 'kocour', 'deploy', 'fousek', 'radiátor', 'bug', 'parapet', 'čumáček', 'build'];
const TITLE_C = ['blues', 'valčík', 'groove', 'serenáda', 'boogie', 'ukolébavka', 'odysea', 'swing', 'rapsodie', 'nokturno'];

// Composing

export function generateTrack(style = 'auto', seed) {
  const rng = makeRng(seed);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const chance = (p) => rng() < p;
  const weighted = (pairs) => {
    let r = rng() * pairs.reduce((sum, [, w]) => sum + w, 0);
    for (const [value, w] of pairs) if ((r -= w) <= 0) return value;
    return pairs[0][0];
  };
  if (!STYLES[style]) style = pick(STYLE_NAMES);
  const S = STYLES[style];

  const bpm = Math.round(S.bpm[0] + rng() * (S.bpm[1] - S.bpm[0]));
  const harmony = HARMONY[pick(S.harmony)];
  const scale = SCALES[harmony.scale];
  const tonic = Math.floor(rng() * 12);
  const base = 60 + tonic - (tonic > 8 ? 12 : 0); // melody tonic, A3..G#4
  const progs = [];
  while (progs.length < 3) {
    const p = pick(harmony.prog);
    if (!progs.includes(p) || progs.length >= harmony.prog.length) progs.push(p);
  }
  const chordsOf = (prog) =>
    prog.split(' ').map((symbol) => {
      const chord = parseChord(symbol);
      // Seventh chords may grow a ninth.
      if (chord.tones.length === 4 && chord.tones[3] !== 6 && chance(S.ninths)) return { ...chord, tones: [...chord.tones, 14] };
      return chord;
    });
  const progA = chordsOf(progs[0]);
  const progB = chordsOf(progs[1]);
  const progC = chordsOf(progs[2]);
  // The outro lands on the tonic chord.
  const home = parseChord(harmony.scale === 'major' || harmony.scale === 'lydian' ? (S.ninths ? 'Imaj7' : 'I') : S.ninths ? 'i7' : 'i');

  const inst = Object.fromEntries(Object.entries(S.inst).map(([ch, list]) => [ch, pick(list)]));
  if (!inst.counter) inst.counter = inst.lead;
  const form = pick(S.forms);
  const keyChange = S.keyChange && chance(S.keyChange) ? pick([1, 2, 2]) : 0;

  // Bars and sections
  const bars = [];
  const sections = [];
  const seen = {};
  const lastB = form.map(([n]) => n).lastIndexOf('B');
  form.forEach(([name, length], index) => {
    const occurrence = (seen[name] = (seen[name] ?? -1) + 1);
    const prog = name === 'B' ? progB : name === 'C' ? progC : progA;
    const lift = keyChange && index >= lastB ? keyChange : 0;
    const section = { name, length, occurrence, start: bars.length, lift, last: index === form.length - 1 };
    sections.push(section);
    for (let i = 0; i < length; i++) {
      let chord = prog[Math.floor(i / S.chordBars) % prog.length];
      if (name === 'outro' && i >= length - S.chordBars) chord = home;
      const vol = { intro: 0.72, A: 0.84, B: 1, C: 0.8, outro: 0.8 - (i / length) * 0.25 }[name];
      bars.push({ section: name, chord, lift, vol, stretch: name === 'outro' && i === length - 1 ? 1.25 : name === 'outro' && i === length - 2 ? 1.08 : 1, events: [] });
    }
  });
  const totalSteps = bars.length * 16;
  const add = (abs, ev) => {
    const bar = bars[Math.floor(abs / 16)];
    if (bar) bar.events.push({ ...ev, step: abs % 16 });
  };
  const vel = (v, bar) => Math.min(1, v * bar.vol * (0.92 + rng() * 0.12));
  const pcs = (chord) => chord.tones.map((t) => (tonic + chord.root + t) % 12);

  // Melody
  const degPitch = (deg) => base + Math.floor(deg / 7) * 12 + scale[((deg % 7) + 7) % 7];
  const chordDegs = (chord) => {
    const set = new Set(pcs({ ...chord, tones: chord.tones.filter((t) => t < 12) }));
    return (deg) => set.has(((degPitch(deg) % 12) + 12) % 12);
  };
  const nearestChordDeg = (chord, deg, lo = -7, hi = 16) => {
    const isTone = chordDegs(chord);
    for (let d = 0; d < 7; d++) {
      for (const cand of d ? [deg - d, deg + d] : [deg]) if (cand >= lo && cand <= hi && isTone(cand)) return cand;
    }
    return deg;
  };
  const rhythmBar = (density) => {
    let r = '';
    for (let c = 0; c < 4; c++) r += weighted(CELLS[density]);
    return r;
  };
  const makeMotif = (density) => {
    let r0 = rhythmBar(density);
    while ((r0.match(/x/g) ?? []).length < 2) r0 = rhythmBar(density);
    if (r0[0] !== 'x' && r0[2] !== 'x') r0 = 'x' + r0.slice(1);
    const r1 = rhythmBar(density).slice(0, 12) + pick(['x...', '....', '....']);
    const notes = (r0 + r1).match(/x/g).length;
    const intervals = [];
    let last = 0;
    for (let i = 0; i < notes; i++) {
      // Mostly steps; a leap is followed by a step back.
      let iv = Math.abs(last) >= 3 ? -Math.sign(last) * pick([1, 2]) : weighted([[0, 1], [1, 4], [-1, 4], [2, 2], [-2, 2], [3, 0.8], [-3, 0.8], [4, 0.4], [-4, 0.5]]);
      intervals.push(iv);
      last = iv;
    }
    return { rhythm: [r0, r1], intervals };
  };
  const varyMotif = (motif, amount, density) => ({
    rhythm: motif.rhythm.map((r) => {
      if (!chance(amount)) return r;
      const cell = Math.floor(rng() * 3);
      return r.slice(0, cell * 4) + weighted(CELLS[density]) + r.slice(cell * 4 + 4);
    }),
    intervals: motif.intervals.map((iv) => (chance(amount) ? iv + pick([-1, 1]) : iv)),
  });
  const maxLen = { sparse: 16, medium: 8, dense: 6, eighths: 6, solo: 4 };
  const melodyNotes = [];
  // Four bars: the motif, its repeat over new chords, and a cadence.
  const writePhrase = (motif, startBar, { lo, hi, center, full, density }) => {
    const rhythms = [motif.rhythm[0], motif.rhythm[1], motif.rhythm[0], pick(CADENCES)];
    let deg = nearestChordDeg(bars[startBar].chord, center, lo, hi);
    let k = 0;
    for (let b = 0; b < 4; b++) {
      const bar = bars[startBar + b];
      if (!bar) return;
      const r = rhythms[b];
      const onsets = [...r].map((c, i) => (c === 'x' ? i : -1)).filter((i) => i >= 0);
      if (b === 2) {
        k = 0;
        deg = nearestChordDeg(bar.chord, deg, lo, hi);
      }
      let target = 0;
      if (b === 3) {
        // Land on the tonic (full) or somewhere open (half), approached by step.
        const goal = full ? (Math.abs(deg - 7) < Math.abs(deg) ? 7 : 0) : deg + pick([-1, 1, 2]);
        target = nearestChordDeg(bar.chord, Math.max(lo, Math.min(hi, goal)), lo, hi);
      }
      onsets.forEach((step, n) => {
        const next = onsets[n + 1] ?? 16;
        const len = Math.min(next - step, maxLen[density] ?? 8);
        let d;
        if (b === 3) d = target + (onsets.length - 1 - n) * (deg >= target ? 1 : -1);
        else if ((b === 0 || b === 2) && n === 0) d = deg;
        else d = deg + (motif.intervals[k] ?? 0);
        k++;
        if (d > hi) d = 2 * hi - d;
        if (d < lo) d = 2 * lo - d;
        if (step % 8 === 0 || len >= 3) d = nearestChordDeg(bar.chord, d, lo, hi);
        melodyNotes.push({ abs: (startBar + b) * 16 + step, deg: d, len, bar });
        if (b !== 3) deg = d;
      });
    }
  };
  // Jazz bridge: improvised eighths with chromatic approach notes.
  const writeSolo = (startBar, length) => {
    let deg = 4;
    for (let b = 0; b < length; b++) {
      const bar = bars[startBar + b];
      const r = rhythmBar('solo');
      for (let step = 0; step < 16; step++) {
        if (r[step] !== 'x') continue;
        deg += weighted([[1, 3], [-1, 3], [2, 1.5], [-2, 1.5], [3, 0.5], [-4, 0.5]]);
        if (deg > 11) deg -= 3;
        if (deg < 0) deg += 3;
        if (step % 4 === 0) deg = nearestChordDeg(bar.chord, deg, 0, 11);
        melodyNotes.push({ abs: (startBar + b) * 16 + step, deg, len: 2, bar, solo: true });
      }
    }
  };
  const motifA = makeMotif(S.melody.A);
  const motifB = makeMotif(S.melody.B);
  const motifC = makeMotif(S.melody.C);
  for (const sec of sections) {
    const { name, start, length, occurrence } = sec;
    if (name === 'A' || name === 'B' || (name === 'C' && S.bridge === 'motif')) {
      const density = S.melody[name];
      const motif = name === 'A' ? motifA : name === 'B' ? motifB : motifC;
      const range = name === 'B' ? { lo: 2, hi: 11, center: 6 } : name === 'C' ? { lo: 0, hi: 8, center: 3 } : { lo: 0, hi: 9, center: 3 };
      for (let p = 0; p < length; p += 4) {
        const amount = occurrence * 0.18 + (p ? 0.12 : 0);
        writePhrase(amount ? varyMotif(motif, amount, density) : motif, start + p, { ...range, full: p + 4 >= length, density });
      }
    } else if (name === 'C' && S.bridge === 'solo') writeSolo(start, length);
    else if (name === 'outro') {
      writePhrase(motifA, start, { lo: 0, hi: 9, center: 3, full: true, density: S.melody.A });
    }
  }
  // The outro's last bars only hold the final chord.
  const outro = sections.find((s) => s.name === 'outro');
  for (let i = melodyNotes.length - 1; i >= 0; i--) {
    if (outro && melodyNotes[i].abs >= (outro.start + 3) * 16) melodyNotes.splice(i, 1);
  }
  if (outro) melodyNotes.push({ abs: (outro.start + Math.min(3, outro.length - 1)) * 16, deg: chance(0.5) ? 7 : 0, len: 24, bar: bars[outro.start + Math.min(3, outro.length - 1)] });

  melodyNotes.forEach((note, i) => {
    let n = degPitch(note.deg) + note.bar.lift;
    // Chromatic approach into the next beat.
    const next = melodyNotes[i + 1];
    if (note.solo && next && next.abs - note.abs === 2 && note.abs % 4 === 2 && chance(0.35)) n = degPitch(next.deg) + next.bar.lift - 1;
    const strong = note.abs % 16 === 0 ? 1 : note.abs % 4 === 0 ? 0.9 : 0.78;
    const v = vel(strong, note.bar);
    add(note.abs, { ch: 'lead', n, len: note.len, v });
    const sec = note.bar.section;
    if (S.echoLead && note.abs + 3 < totalSteps) add(note.abs + 3, { ch: 'counter', n, len: Math.min(note.len, 3), v: v * 0.45 });
    if (S.octaveDouble && sec === 'B') add(note.abs, { ch: 'counter', n: n - 12, len: note.len, v: v * 0.7 });
    if (S.harmonize && sec === 'B' && sections.filter((s) => s.name === 'B').at(-1).start <= note.abs / 16) {
      add(note.abs, { ch: 'counter', n: degPitch(note.deg - 2) + note.bar.lift, len: note.len, v: v * 0.6 });
    }
  });

  // Chords: comping, pads, arpeggios
  const voiceChord = (chord, prev, center, rootless) => {
    let tones = chord.tones.map((t) => (tonic + chord.root + t) % 12);
    if (rootless && tones.length >= 4) tones = tones.slice(1);
    if (tones.length > 4) tones = [tones[0], tones[1], tones[3], tones[4]];
    let best = null;
    // Close position: every inversion, the other tones within an octave above.
    for (const bottom of tones) {
      let low = center - 7;
      while (low % 12 !== bottom) low++;
      const notes = [low, ...tones.filter((pc) => pc !== bottom).map((pc) => low + ((pc - bottom + 12) % 12))].sort((a, b) => a - b);
      const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
      const score = prev && prev.length === notes.length ? notes.reduce((s, x, i) => s + Math.abs(x - prev[i]), 0) + Math.abs(mean - center) * 0.5 : Math.abs(mean - center);
      if (!best || score < best.score) best = { notes, score };
    }
    return best.notes;
  };
  const sectionPick = {};
  const choose = (sec, key, list) => (sectionPick[`${sec.start}:${key}`] ??= pick(list));
  let prevVoicing = null;
  let prevPad = null;
  for (const sec of sections) {
    for (let i = 0; i < sec.length; i++) {
      const barIndex = sec.start + i;
      const bar = bars[barIndex];
      const abs0 = barIndex * 16;
      const newChord = i % S.chordBars === 0;
      const voicing = voiceChord(bar.chord, prevVoicing, 62, S.rootless).map((n) => n + bar.lift);
      prevVoicing = voicing.map((n) => n - bar.lift);
      const final = sec.last && i === sec.length - 1;
      // Comping (or the pad that replaces it).
      if (newChord && !(sec.name === 'intro' && i === 0 && style === 'chiptune')) {
        const pattern = final ? [[0, 16 * S.chordBars + 8]] : choose(sec, 'comp', COMP[style] ?? COMP.lofi);
        for (const [step, len] of pattern) {
          if (step >= 16 * S.chordBars) continue;
          add(abs0 + step, { ch: 'comp', n: voicing, len: !final && S.chordBars > 1 && pattern.length === 1 ? len * S.chordBars : len, v: vel(step % 4 ? 0.7 : 0.85, bar), strum: style === 'bossa' || style === 'lofi' ? 0.012 : 0 });
        }
      }
      if (S.pad?.includes(sec.name) && newChord) {
        const pad = voiceChord(bar.chord, prevPad, 60, false).map((n) => n + bar.lift);
        prevPad = pad.map((n) => n - bar.lift);
        add(abs0, { ch: 'pad', n: pad, len: 16 * S.chordBars, v: vel(0.7, bar) });
      }
      // Arpeggios over the chord.
      if (S.arp?.sections.includes(sec.name) && !final) {
        const notes = [...voicing.slice(0, 3).map((n) => n + 12), voicing[0] + 24];
        const order = choose(sec, 'arp', [
          [0, 1, 2, 3],
          [0, 1, 2, 3, 2, 1],
          [0, 2, 1, 3],
          [3, 2, 1, 0],
        ]);
        const rate = S.arp.rate;
        for (let s = 0, k = 0; s < 16; s += rate, k++) {
          if (rate > 1 && chance(0.2)) continue;
          add(abs0 + s, { ch: 'arp', n: notes[order[k % order.length]], len: rate, v: vel(s % 4 ? 0.6 : 0.8, bar) });
        }
      }
    }
  }

  // Bass
  const bassRoot = (chord, lift) => 36 + ((tonic + chord.root) % 12) + lift;
  for (const sec of sections) {
    for (let i = 0; i < sec.length; i++) {
      const barIndex = sec.start + i;
      const bar = bars[barIndex];
      // The bass comes in halfway through the intro.
      if (sec.name === 'intro' && i < sec.length / 2) continue;
      const next = bars[barIndex + 1] ?? bar;
      const R = bassRoot(bar.chord, bar.lift);
      const nextR = bassRoot(next.chord, next.lift);
      const final = sec.last && i === sec.length - 1;
      if (final) {
        add(barIndex * 16, { ch: 'bass', n: R, len: 20, v: vel(0.9, bar) });
        continue;
      }
      if (S.walk) {
        // Walking quarters: root, chord tones, then a half step into the next root.
        const third = R + bar.chord.tones[1];
        const fifth = R + bar.chord.tones[2];
        const line = [R, pick([third, R + 2, fifth]), pick([fifth, third, R + 12 - 3]), nextR + (chance(0.5) ? -1 : 1)];
        line.forEach((n, beat) => add(barIndex * 16 + beat * 4, { ch: 'bass', n, len: 4, v: vel(beat ? 0.8 : 0.95, bar) }));
        continue;
      }
      if (S.chordBars > 1 && i % S.chordBars) continue;
      const pattern = sec.name === 'C' || sec.name === 'intro' ? BASS[style]?.[0] : choose(sec, 'bass', BASS[style] ?? BASS.lofi);
      for (const [step, sym, len] of pattern ?? BASS.lofi[0]) {
        const n = { R, F: R + 7, O: R + 12, A: nextR === R ? R + 7 : nextR + (nextR > R ? -1 : 1) }[sym];
        add(barIndex * 16 + step, { ch: 'bass', n, len: len * (S.chordBars > 1 ? S.chordBars : 1), v: vel(step % 4 ? 0.75 : 0.95, bar) });
      }
    }
  }

  // Drums
  const kit = GROOVES[style];
  const ROW_VOL = { X: 1, x: 0.72, g: 0.32 };
  const drumBar = (barIndex, groove) => {
    const bar = bars[barIndex];
    for (const [piece, row] of Object.entries(groove)) {
      for (let s = 0; s < row.length; s++) {
        if (ROW_VOL[row[s]]) add(barIndex * 16 + s, { ch: 'drum', d: piece, v: vel(ROW_VOL[row[s]], bar) });
      }
    }
  };
  for (const [index, sec] of sections.entries()) {
    const nextSec = sections[index + 1];
    const type = { intro: 'intro', A: 'verse', B: 'chorus', C: 'bridge', outro: 'verse' }[sec.name];
    const variants = kit[type];
    for (let i = 0; i < sec.length; i++) {
      const barIndex = sec.start + i;
      const lastBar = i === sec.length - 1;
      if (sec.name === 'intro' && i < sec.length / 2) continue;
      if (sec.last && lastBar) {
        if (style !== 'ambient') add(barIndex * 16, { ch: 'drum', d: style === 'jazz' ? 'r' : 'k', v: 0.8 });
        if (style !== 'ambient') add(barIndex * 16, { ch: 'drum', d: 'cr', v: 0.7 });
        continue;
      }
      if (lastBar && nextSec && sec.name !== 'intro') drumBar(barIndex, choose(sec, 'fill', kit.fill));
      else if (sec.name === 'A' && i % 4 === 3 && i < sec.length - 1 && style === 'lofi' && chance(0.3)) drumBar(barIndex, kit.fill[1]);
      else drumBar(barIndex, variants[(Math.floor(i / 4) + sec.occurrence) % variants.length]);
      if (i === 0 && (sec.name === 'B' || (sec.name === 'A' && sec.occurrence === 0)) && style !== 'ambient') add(barIndex * 16, { ch: 'drum', d: 'cr', v: vel(0.85, bars[barIndex]) });
      if (lastBar && nextSec?.name === 'B' && S.riser) add(barIndex * 16, { ch: 'riser', len: 16, v: 0.7 });
    }
  }

  for (const bar of bars) bar.events.sort((a, b) => a.step - b.step);
  const mode = harmony.scale;
  return {
    style,
    title: `${pick(TITLE_A)} ${pick(TITLE_B)} ${pick(TITLE_C)}`,
    key: `${NOTE_NAMES[tonic]} ${MODE_NAMES[mode]}`,
    tonic,
    bpm,
    step: 60 / bpm / 4,
    swing: S.swing,
    swingUnit: S.swingUnit,
    humanize: S.humanize,
    inst,
    fx: S.fx,
    mix: { ...CHANNELS, ...S.mix },
    sidechain: !!S.sidechain,
    form: form.map(([name, length]) => `${name}${length}`).join(' '),
    bars,
    gap: S.gap,
  };
}

// Instruments

// osc: [wave, ratio, detune, level]; wave is an oscillator type or a pulse duty.
// fm: a sine modulator on the oscillators' frequency (electric piano bark).
// partials: extra sines [ratio, level, decay] that fade on their own.
// noise: a breath or pick at the start of the note.
const INSTRUMENTS = {
  rhodes: { osc: [['sine']], fm: { ratio: 1, index: 1.4, rest: 0.2, decay: 0.6 }, partials: [[4, 0.1, 0.2]], attack: 0.004, decay: 1.6, sustain: 0.3, release: 0.35, level: 0.3, wobble: true },
  rhodesLead: { osc: [['sine']], fm: { ratio: 1, index: 2, rest: 0.3, decay: 0.5 }, partials: [[4, 0.12, 0.2]], attack: 0.004, decay: 1.2, sustain: 0.45, release: 0.3, level: 0.36, wobble: true },
  softSquare: { osc: [['square', 1, -5], ['square', 1, 5]], cutoff: 700, keytrack: 0.9, env: 1.5, fdecay: 0.25, attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.18, vibrato: 14, vibDelay: 0.2, level: 0.13, wobble: true },
  flute: { osc: [['sine'], ['triangle', 1, 0, 0.25], ['sine', 2, 0, 0.06]], noise: { level: 0.12, ratio: 2, q: 1.5, decay: 0.15 }, attack: 0.05, decay: 0.3, sustain: 0.85, release: 0.12, vibrato: 16, vibDelay: 0.25, level: 0.34 },
  vibes: { osc: [['sine']], partials: [[4, 0.25, 0.3], [10, 0.04, 0.08]], attack: 0.002, decay: 2.4, sustain: 0, release: 0.7, level: 0.38, minDur: 0.6 },
  bell: { osc: [['sine']], partials: [[2.756, 0.32, 1.6], [5.404, 0.16, 0.5], [8.93, 0.05, 0.2]], attack: 0.002, decay: 3.2, sustain: 0, release: 1.5, level: 0.26, minDur: 1.6 },
  pulse25: { osc: [[0.25]], attack: 0.003, decay: 0.25, sustain: 0.75, release: 0.04, vibrato: 22, vibDelay: 0.18, level: 0.15, gate: 0.9 },
  pulse50: { osc: [[0.5]], attack: 0.003, decay: 0.25, sustain: 0.75, release: 0.04, vibrato: 20, vibDelay: 0.18, level: 0.13, gate: 0.9 },
  pulse12: { osc: [[0.125]], attack: 0.002, decay: 0.12, sustain: 0.55, release: 0.03, level: 0.2, gate: 0.85 },
  chipTri: { osc: [['triangle']], attack: 0.002, decay: 0.1, sustain: 0.9, release: 0.02, level: 0.38, gate: 0.9 },
  sawLead: { osc: [['sawtooth', 1, -7], ['sawtooth', 1, 7], ['square', 0.5, 0, 0.3]], cutoff: 1400, keytrack: 1, env: 1.2, fdecay: 0.35, q: 1.5, attack: 0.01, decay: 0.3, sustain: 0.75, release: 0.2, vibrato: 16, vibDelay: 0.25, level: 0.12 },
  squareLead: { osc: [['square', 1, -6], ['square', 1, 6]], cutoff: 1800, keytrack: 0.6, env: 0.8, fdecay: 0.3, attack: 0.008, decay: 0.3, sustain: 0.7, release: 0.18, vibrato: 14, vibDelay: 0.2, level: 0.11 },
  superPad: { osc: [['sawtooth', 1, -14], ['sawtooth', 1, 0], ['sawtooth', 1, 14]], cutoff: 900, env: 0.8, fdecay: 1.5, q: 0.8, attack: 0.3, decay: 1, sustain: 0.8, release: 0.9, level: 0.09 },
  warmPad: { osc: [['triangle', 1, -8], ['triangle', 1, 8], ['sine', 2, 0, 0.2]], cutoff: 1500, attack: 1.2, decay: 1.5, sustain: 0.85, release: 2.2, level: 0.12, wobble: true },
  pluck: { osc: [['sawtooth']], cutoff: 500, keytrack: 0.6, env: 7, fdecay: 0.16, q: 2, attack: 0.002, decay: 0.3, sustain: 0, release: 0.12, level: 0.3 },
  nylon: { osc: [['triangle'], ['sawtooth', 1, 0, 0.3]], cutoff: 600, keytrack: 0.5, env: 4, fdecay: 0.12, attack: 0.002, decay: 1.1, sustain: 0, release: 0.2, level: 0.3 },
  sub: { osc: [['sine'], ['triangle', 1, 0, 0.35]], cutoff: 500, attack: 0.012, decay: 0.6, sustain: 0.7, release: 0.12, level: 0.5 },
  upright: { osc: [['triangle'], ['sine', 1, 0, 0.6]], cutoff: 350, keytrack: 1.2, env: 2.5, fdecay: 0.1, attack: 0.004, decay: 0.7, sustain: 0.25, release: 0.08, level: 0.62, thump: 0.04 },
  synthBass: { osc: [['sawtooth', 1, -4], ['sawtooth', 1, 4]], cutoff: 220, keytrack: 1, env: 5, fdecay: 0.16, q: 3, attack: 0.003, decay: 0.25, sustain: 0.6, release: 0.06, level: 0.4 },
};

export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);

const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);

function playVoice(m, out, n, t, dur, v, s) {
  const ctx = m.ctx;
  const f = midiHz(n);
  const d = Math.max(dur * (s.gate ?? 1), s.minDur ?? 0, 0.03);
  const attack = s.attack ?? 0.005;
  const end = t + Math.max(d, attack);
  const release = s.release ?? 0.15;
  const stop = end + release * 1.6 + 0.05;
  const peak = v * (s.level ?? 0.3);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.setTargetAtTime(peak * (s.sustain ?? 0.7), t + attack, Math.max(0.005, (s.decay ?? 0.3) / 3));
  amp.gain.setTargetAtTime(0, end, release / 3);
  amp.connect(out);

  let input = amp;
  if (s.cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = s.q ?? 0.7;
    const cutoff = Math.min(16000, s.cutoff + (s.keytrack ?? 0) * f);
    filter.frequency.setValueAtTime(Math.min(16000, cutoff * (1 + (s.env ?? 0) * v)), t);
    filter.frequency.setTargetAtTime(cutoff, t + 0.002, Math.max(0.01, (s.fdecay ?? 0.3) / 3));
    filter.connect(amp);
    input = filter;
  }

  const oscs = [];
  let fm = null;
  if (s.fm) {
    const mod = ctx.createOscillator();
    mod.frequency.value = f * s.fm.ratio;
    fm = ctx.createGain();
    fm.gain.setValueAtTime(f * s.fm.index * (0.6 + v * 0.6), t);
    fm.gain.setTargetAtTime(f * s.fm.index * s.fm.rest, t, s.fm.decay / 3);
    mod.connect(fm);
    oscs.push(mod);
  }
  let vib = null;
  if (s.vibrato && d > (s.vibDelay ?? 0.2)) {
    vib = ctx.createGain();
    vib.gain.setValueAtTime(0, t);
    vib.gain.setValueAtTime(0, t + (s.vibDelay ?? 0.2));
    vib.gain.linearRampToValueAtTime(s.vibrato, t + (s.vibDelay ?? 0.2) + 0.25);
    m.vibrato.connect(vib);
  }
  const wobble = s.wobble && m.wobble;
  for (const [wave, ratio = 1, detune = 0, level = 1] of s.osc) {
    const osc = ctx.createOscillator();
    if (typeof wave === 'number') osc.setPeriodicWave(m.pulse(wave));
    else osc.type = wave;
    const hz = f * ratio;
    if (s.thump) {
      osc.frequency.setValueAtTime(hz * (1 + s.thump), t);
      osc.frequency.setTargetAtTime(hz, t, 0.012);
    } else osc.frequency.value = hz;
    osc.detune.value = detune;
    if (fm) fm.connect(osc.frequency);
    if (vib) vib.connect(osc.detune);
    if (wobble) wobble.connect(osc.detune);
    if (level === 1) osc.connect(input);
    else {
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(input);
    }
    oscs.push(osc);
  }
  for (const [ratio, level, decay] of s.partials ?? []) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * (0.5 + v * 0.7), t);
    g.gain.setTargetAtTime(0, t, decay / 3);
    osc.connect(g).connect(input);
    oscs.push(osc);
  }
  if (s.noise) {
    const src = ctx.createBufferSource();
    src.buffer = m.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(12000, f * s.noise.ratio);
    bp.Q.value = s.noise.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(s.noise.level * v, t);
    g.gain.setTargetAtTime(s.noise.level * v * 0.15, t + 0.02, s.noise.decay / 3);
    g.gain.setTargetAtTime(0, end, release / 3);
    src.connect(bp).connect(g).connect(input);
    src.start(t, Math.random() * 0.5);
    src.stop(stop);
  }
  for (const osc of oscs) {
    osc.start(t);
    osc.stop(stop);
  }
  // Let go of the shared LFOs once the note is over.
  const last = oscs.at(-1);
  if (vib || wobble) {
    last.onended = () => {
      try {
        if (vib) m.vibrato.disconnect(vib);
        if (wobble) for (const osc of oscs) wobble.disconnect(osc.detune);
      } catch {
        // already gone with the song's mixer
      }
    };
  }
}

// Drums

function noiseHit(m, out, t, { vol, decay, type = 'highpass', freq, q = 0.7, attack = 0.001, to = null }) {
  const ctx = m.ctx;
  const src = ctx.createBufferSource();
  src.buffer = m.noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setTargetAtTime(0, t + attack, decay / 3);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 0.8);
  src.stop(t + attack + decay * 1.8 + 0.02);
}

function toneHit(m, out, t, { type = 'sine', from, to, vol, decay, bend = 0.08 }) {
  const ctx = m.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + bend);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.002);
  g.gain.setTargetAtTime(0, t + 0.002, decay / 3);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + decay * 1.8 + 0.02);
}

// Each kit piece per style flavour: soft (lo-fi, jazz, bossa), chip, punchy (synthwave).
const DRUMS = {
  k(m, t, v, flavour) {
    const out = m.ch.kick.input;
    if (flavour === 'chip') return toneHit(m, out, t, { type: 'triangle', from: 220, to: 45, vol: v * 0.9, decay: 0.12, bend: 0.06 });
    toneHit(m, out, t, { from: flavour === 'punchy' ? 170 : 120, to: 46, vol: v, decay: flavour === 'punchy' ? 0.42 : 0.3, bend: 0.1 });
    if (flavour === 'punchy') noiseHit(m, out, t, { vol: v * 0.25, decay: 0.012, freq: 3500 });
    if (m.sidechain) m.duck(t);
  },
  s(m, t, v, flavour) {
    const out = m.ch.snare.input;
    if (flavour === 'chip') return noiseHit(m, out, t, { vol: v * 0.5, decay: 0.12, freq: 1200 });
    noiseHit(m, out, t, { vol: v * 0.45, decay: flavour === 'punchy' ? 0.22 : 0.15, type: 'bandpass', freq: flavour === 'soft' ? 1500 : 2200, q: 0.7 });
    toneHit(m, out, t, { type: 'triangle', from: 220, to: 170, vol: v * 0.35, decay: 0.08, bend: 0.05 });
  },
  c(m, t, v) {
    const out = m.ch.snare.input;
    for (let k = 0; k < 3; k++) noiseHit(m, out, t + k * 0.011, { vol: v * 0.35, decay: k === 2 ? 0.18 : 0.01, type: 'bandpass', freq: 1400, q: 1.2 });
  },
  h(m, t, v, flavour) {
    noiseHit(m, m.ch.hat.input, t, { vol: v * 0.35, decay: flavour === 'chip' ? 0.025 : 0.035, freq: flavour === 'soft' ? 6500 : 8000 });
  },
  o(m, t, v) {
    noiseHit(m, m.ch.hat.input, t, { vol: v * 0.28, decay: 0.22, freq: 7500 });
  },
  r(m, t, v) {
    const out = m.ch.cym.input;
    noiseHit(m, out, t, { vol: v * 0.22, decay: 0.45, type: 'bandpass', freq: 6500, q: 0.6 });
    toneHit(m, out, t, { from: 3640, to: 3600, vol: v * 0.05, decay: 0.35, bend: 0.3 });
  },
  p(m, t, v) {
    noiseHit(m, m.ch.hat.input, t, { vol: v * 0.2, decay: 0.03, freq: 6000 });
  },
  b(m, t, v) {
    noiseHit(m, m.ch.snare.input, t, { vol: v * 0.22, decay: 0.12, type: 'bandpass', freq: 2600, q: 0.5, attack: 0.02 });
  },
  sh(m, t, v) {
    noiseHit(m, m.ch.perc.input, t, { vol: v * 0.22, decay: 0.05, freq: 5500, attack: 0.008 });
  },
  rim(m, t, v) {
    const out = m.ch.perc.input;
    toneHit(m, out, t, { from: 1750, to: 1700, vol: v * 0.22, decay: 0.03 });
    toneHit(m, out, t, { type: 'triangle', from: 520, to: 500, vol: v * 0.18, decay: 0.025 });
  },
  t1(m, t, v, flavour) {
    toneHit(m, m.ch.kick.input, t, { type: flavour === 'chip' ? 'triangle' : 'sine', from: 210, to: 140, vol: v * 0.6, decay: 0.25, bend: 0.2 });
  },
  t2(m, t, v, flavour) {
    toneHit(m, m.ch.kick.input, t, { type: flavour === 'chip' ? 'triangle' : 'sine', from: 160, to: 100, vol: v * 0.6, decay: 0.3, bend: 0.2 });
  },
  cr(m, t, v) {
    noiseHit(m, m.ch.cym.input, t, { vol: v * 0.3, decay: 1.6, freq: 4500 });
  },
};
export const DRUM_NAMES = Object.keys(DRUMS);
const DRUM_FLAVOUR = { lofi: 'soft', jazz: 'soft', bossa: 'soft', chiptune: 'chip', synthwave: 'punchy', ambient: 'soft' };

// The mixer

// A stereo room: noise that fades away and gets darker as it does.
function impulse(ctx, seconds) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const x = i / length;
      const k = 0.85 - 0.7 * x;
      low += k * (Math.random() * 2 - 1 - low);
      data[i] = low * Math.exp(-6.9 * x) * Math.min(1, i / (rate * 0.006));
    }
  }
  return buffer;
}

function buildMixer(ctx, dest, track, noise, pulse) {
  const nodes = [];
  const sources = [];
  const node = (n) => (nodes.push(n), n);
  const gain = (value) => {
    const g = node(ctx.createGain());
    g.gain.value = value;
    return g;
  };
  const out = gain(1);
  const tone = node(ctx.createBiquadFilter());
  tone.type = 'lowpass';
  tone.frequency.value = track.fx.tone;
  out.connect(tone).connect(dest);

  const reverb = node(ctx.createConvolver());
  reverb.buffer = impulse(ctx, track.fx.reverb);
  const reverbIn = gain(track.fx.wet);
  reverbIn.connect(reverb).connect(out);

  // Ping-pong echo, darker on every repeat.
  const echoIn = gain(1);
  const lowCut = node(ctx.createBiquadFilter());
  lowCut.type = 'highpass';
  lowCut.frequency.value = 300;
  const left = node(ctx.createDelay(2));
  const right = node(ctx.createDelay(2));
  left.delayTime.value = right.delayTime.value = Math.min(1.9, track.step * track.fx.echo);
  const panL = node(ctx.createStereoPanner());
  const panR = node(ctx.createStereoPanner());
  panL.pan.value = -0.7;
  panR.pan.value = 0.7;
  const dark = node(ctx.createBiquadFilter());
  dark.type = 'lowpass';
  dark.frequency.value = 2600;
  const feedback = gain(track.fx.feedback);
  echoIn.connect(lowCut).connect(left);
  left.connect(panL).connect(out);
  left.connect(right);
  right.connect(panR).connect(out);
  right.connect(dark).connect(feedback).connect(left);

  const ch = {};
  const ducked = [];
  for (const [name, [level, pan, rev, echo]] of Object.entries(track.mix)) {
    const input = gain(1);
    const fader = gain(level);
    const panner = node(ctx.createStereoPanner());
    panner.pan.value = pan;
    input.connect(fader).connect(panner).connect(out);
    if (rev) fader.connect(gain(rev)).connect(reverbIn);
    if (echo) fader.connect(gain(echo)).connect(echoIn);
    ch[name] = { input, fader };
    if (track.sidechain && ['comp', 'pad', 'arp', 'bass'].includes(name)) ducked.push(input);
  }

  const lfo = (hz) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    osc.start();
    sources.push(osc);
    return osc;
  };
  const vibrato = lfo(5.4);
  let wobble = null;
  if (track.fx.wobble) {
    wobble = gain(track.fx.wobble);
    lfo(0.55).connect(wobble);
  }
  if (track.fx.tremolo) {
    const depth = gain(0.25);
    lfo(5.2).connect(depth).connect(ch.lead.input.gain);
    ch.lead.input.gain.value = 0.75;
  }
  if (track.fx.crackle) {
    // A few seconds of record surface: hiss and random pops, looped.
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, rate * 3, rate);
    const data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      low += 0.05 * (Math.random() * 2 - 1 - low);
      data[i] = low * 0.25;
      if (Math.random() < 6 / rate) {
        const amp = 0.2 + Math.random() * 0.6;
        for (let k = 0; k < 40 && i + k < data.length; k++) data[i + k] += amp * Math.exp(-k / 6) * (k % 2 ? -1 : 1);
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const level = gain(0.035);
    src.connect(level).connect(out);
    src.start();
    sources.push(src);
  }

  const mixer = {
    ctx,
    out,
    ch,
    noise,
    pulse,
    vibrato,
    wobble,
    sidechain: ducked.length > 0,
    duck(t) {
      for (const g of ducked) {
        g.gain.setValueAtTime(0.35, t);
        g.gain.setTargetAtTime(1, t + 0.02, 0.09);
      }
    },
    fadeOut(at, seconds) {
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(out.gain.value, at);
      out.gain.linearRampToValueAtTime(0, at + seconds);
    },
    dispose(at) {
      for (const src of sources) {
        try {
          src.stop(at);
        } catch {
          // already stopped
        }
      }
      return () => {
        for (const n of nodes) n.disconnect();
      };
    },
  };
  return mixer;
}

// The player

export class MusicPlayer {
  constructor(ctx, dest, noise) {
    this.ctx = ctx;
    this.dest = dest;
    this.noise = noise;
    this.song = null;
    this.retired = [];
    this.waves = new Map();
  }

  // Pulse waves for the chiptune instruments, by duty cycle.
  pulse(duty) {
    if (!this.waves.has(duty)) {
      const n = 64;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      this.waves.set(duty, this.ctx.createPeriodicWave(real, imag));
    }
    return this.waves.get(duty);
  }

  get track() {
    return this.song?.track ?? null;
  }

  get finished() {
    return !!this.song?.done;
  }

  get endTime() {
    return this.song?.end ?? 0;
  }

  play(track, at) {
    if (this.song && !this.song.done) this.stop(at, 0.05);
    const mixer = buildMixer(this.ctx, this.dest, track, this.noise, (duty) => this.pulse(duty));
    this.song = { track, mixer, bar: 0, time: at, done: false, end: at };
  }

  // Fade the current song out (it may still have notes scheduled ahead).
  stop(at = this.ctx.currentTime, fade = 0.6) {
    const song = this.song;
    if (!song) return;
    this.song = null;
    song.mixer.fadeOut(at, fade);
    this.retire(song.mixer, at + fade + 0.1);
  }

  retire(mixer, at) {
    this.retired.push({ at: at + 0.5, disconnect: mixer.dispose(at) });
  }

  // Schedule every step that starts before `until`.
  schedule(until) {
    const now = this.ctx.currentTime;
    this.retired = this.retired.filter((r) => {
      if (r.at > now) return true;
      r.disconnect();
      return false;
    });
    const song = this.song;
    if (!song || song.done) return;
    const { track, mixer } = song;
    while (song.time < until) {
      const bar = track.bars[song.bar];
      if (!bar) {
        song.done = true;
        song.end = song.time;
        // Let the reverb and the last chord ring out before tearing down.
        this.retire(mixer, song.time + 8);
        return;
      }
      const step = track.step * bar.stretch;
      this.playBar(track, mixer, bar, song.time, step);
      song.time += step * 16;
      song.bar++;
    }
  }

  playBar(track, m, bar, start, step) {
    const flavour = DRUM_FLAVOUR[track.style] ?? 'soft';
    const swingAt = (s) => {
      if (!track.swing) return 0;
      if (track.swingUnit === 8) return s % 4 === 2 ? track.swing * 0.667 * step : 0;
      return s % 2 === 1 ? track.swing * 0.333 * step : 0;
    };
    for (const ev of bar.events) {
      const t = start + ev.step * step + swingAt(ev.step) + (track.humanize ? (Math.random() - 0.5) * 2 * track.humanize : 0);
      if (t < this.ctx.currentTime) continue;
      if (ev.ch === 'drum') {
        DRUMS[ev.d]?.(m, t, ev.v, flavour);
        continue;
      }
      if (ev.ch === 'riser') {
        noiseHit(m, m.ch.cym.input, t, { vol: ev.v * 0.25, decay: 0.05, attack: ev.len * step, type: 'bandpass', freq: 500, to: 7000, q: 1.5 });
        continue;
      }
      const spec = INSTRUMENTS[track.inst[ev.ch]];
      const out = m.ch[ev.ch]?.input;
      if (!spec || !out) continue;
      const dur = ev.len * step;
      if (Array.isArray(ev.n)) ev.n.forEach((n, i) => playVoice(m, out, n, t + i * (ev.strum ?? 0), dur, ev.v, spec));
      else playVoice(m, out, ev.n, t, dur, ev.v, spec);
    }
  }
}
