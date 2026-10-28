// How each office look (THEMES in shared/catalog.js) is painted: wallpaper and
// floor patterns, wood and frame colours, curtains, door, neon sign, lamp colour
// and a few decorations of its own (see Office.buildThemeDecor).
//
//   wall   { pattern, base, stripe, dot, accent }   pattern: stripes | panels | cracks | metal | leaves | grid | logs | shoji
//   floor  { pattern, tones[4], seam }              pattern: planks | tiles | grate | neon | bamboo | tatami
//   curtain   colour, or null for bare windows (blinds: slats instead)
//   glowTrim  skirting and cornice glow like neon tubes
//   light     lamp colour, lightScale how bright the lamps are
//   decor     list of extras: bats, pumpkins, cobwebs, vines, lanterns, skis, consoles, plants, stripe

export const THEME_LOOKS = {
  classic: {
    wall: { pattern: 'stripes', base: '#D9B98A', stripe: '#CDA873', dot: '#B98B57', accent: '#E6CDA4' },
    floor: { pattern: 'planks', tones: ['#9A6A43', '#8E613D', '#A47249', '#936641'], seam: '#6E4729' },
    stub: '#B98B57', trim: '#6B3E26', base: '#5A3420', slab: '#2B2236',
    frame: '#EDE3CF', sill: '#E2D6BC', curtain: '#C0502F',
    door: '#8A5A35', doorFrame: '#6B3E26', knob: '#E8C547',
    neon: { text: 'MŇAU', color: '#FF3D9A', glow: '#FFC2DE' },
    light: '#FFD9A0',
    decor: [],
  },
  modern: {
    wall: { pattern: 'panels', base: '#E8ECEF', stripe: '#D5DBE0', dot: '#BFC7CF', accent: '#F7F9FA' },
    floor: { pattern: 'tiles', tones: ['#B9BEC4', '#B2B7BD', '#BFC4CA', '#B5BAC0'], seam: '#9097A0' },
    stub: '#C9CED4', trim: '#2B2F36', base: '#2B2F36', slab: '#1E2229',
    frame: '#2B2F36', sill: '#3A3F47', curtain: null, blinds: '#D5DBE0',
    door: '#F2F4F6', doorFrame: '#2B2F36', knob: '#9AA0AE',
    neon: { text: 'MEOW.IO', color: '#2EC4FF', glow: '#BDEBFF' },
    light: '#F4F8FF',
    decor: ['stripe', 'plants'],
  },
  cabin: {
    wall: { pattern: 'logs', base: '#8A5A35', stripe: '#6E4527', dot: '#4A2E1A', accent: '#A06A40' },
    floor: { pattern: 'planks', tones: ['#6E4A2E', '#674429', '#755034', '#6A472B'], seam: '#3E2818' },
    stub: '#6E4527', trim: '#3E2818', base: '#3E2818', slab: '#22180F',
    frame: '#5A3A22', sill: '#6E4527', curtain: '#B5302E', checked: true,
    door: '#5A3A22', doorFrame: '#3E2818', knob: '#C9A06B',
    neon: { text: 'CHATA', color: '#FFB347', glow: '#FFE4B8' },
    light: '#FFC880',
    decor: ['skis'],
  },
  japan: {
    wall: { pattern: 'shoji', base: '#F2EAD8', stripe: '#5A3A22', dot: '#E8DFC8', accent: '#C0392B' },
    floor: { pattern: 'tatami', tones: ['#C9C08A', '#C2B984', '#CFC690', '#C5BC86'], seam: '#4A5A2E' },
    stub: '#5A3A22', trim: '#3A2418', base: '#3A2418', slab: '#1E1612',
    frame: '#3A2418', sill: '#5A3A22', curtain: null,
    door: '#F2EAD8', doorFrame: '#3A2418', knob: '#3A2418',
    neon: { text: 'NYA', color: '#FF4F4F', glow: '#FFD0D0' },
    light: '#FFE8C8',
    decor: ['lanterns'],
  },
  jungle: {
    wall: { pattern: 'leaves', base: '#3E6B3A', stripe: '#2F5A2E', dot: '#7CBF5A', accent: '#F2C14E' },
    floor: { pattern: 'bamboo', tones: ['#C9A86B', '#BF9E61', '#D1B075', '#C4A366'], seam: '#8E7240' },
    stub: '#2F5A2E', trim: '#6B4A2E', base: '#5A3E26', slab: '#1A2414',
    frame: '#6B4A2E', sill: '#8A6440', curtain: '#7CBF5A',
    door: '#6B4A2E', doorFrame: '#4A3220', knob: '#F2C14E',
    neon: { text: 'MŇAU!', color: '#FFE14F', glow: '#FFF6C8' },
    light: '#FFF0C0',
    decor: ['vines'],
  },
  halloween: {
    wall: { pattern: 'stripes', base: '#3B2450', stripe: '#2E1B40', dot: '#FF8A2A', accent: '#5A3A73' },
    floor: { pattern: 'planks', tones: ['#4A3428', '#3F2C22', '#523A2C', '#46322A'], seam: '#2A1C16' },
    stub: '#2E1B40', trim: '#FF8A2A', base: '#1B1420', slab: '#140E1A',
    frame: '#1B1420', sill: '#2B2236', curtain: '#FF8A2A', torn: true,
    door: '#3A2418', doorFrame: '#1B1420', knob: '#FF8A2A',
    neon: { text: 'BU!', color: '#FF8A2A', glow: '#FFD49A' },
    light: '#FFB066',
    decor: ['bats', 'pumpkins', 'cobwebs'],
  },
  haunted: {
    wall: { pattern: 'cracks', base: '#6E7A6A', stripe: '#5C685A', dot: '#3E463E', accent: '#879480' },
    floor: { pattern: 'planks', tones: ['#5E5A54', '#57534D', '#66625B', '#5A564F'], seam: '#2E2B28' },
    stub: '#4E584C', trim: '#2E302C', base: '#2E302C', slab: '#15171A',
    frame: '#8C8C80', sill: '#6E6E64', curtain: '#4A4E5A', torn: true,
    door: '#4A4038', doorFrame: '#2E302C', knob: '#8C8C80',
    neon: { text: 'BÚÚÚ', color: '#7CFFB0', glow: '#D8FFE8' },
    light: '#B8FFD0', lightScale: 0.75,
    decor: ['cobwebs', 'portraits'],
  },
  cyber: {
    wall: { pattern: 'grid', base: '#1E1030', stripe: '#2A1645', dot: '#FF3D9A', accent: '#4FE0FF' },
    floor: { pattern: 'neon', tones: ['#120A1E', '#140C22', '#100818', '#160E26'], seam: '#B05AFF' },
    stub: '#2A1645', trim: '#FF3D9A', base: '#4FE0FF', slab: '#0A0612', glowTrim: true,
    frame: '#FF3D9A', sill: '#2A1645', curtain: null,
    door: '#2A1645', doorFrame: '#4FE0FF', knob: '#FF3D9A',
    neon: { text: 'NEKO 2077', color: '#4FE0FF', glow: '#D0F8FF', w: 64 },
    light: '#FF7AD0',
    decor: ['consoles'],
  },
  space: {
    wall: { pattern: 'metal', base: '#2E3A52', stripe: '#26314A', dot: '#7C8AA8', accent: '#3A4864' },
    floor: { pattern: 'grate', tones: ['#4A5468', '#434C5E', '#505A6E', '#465063'], seam: '#2A3040' },
    stub: '#26314A', trim: '#4FE0FF', base: '#1B2233', slab: '#0B0F1C', glowTrim: true,
    frame: '#9AA4BC', sill: '#5A6680', curtain: null,
    door: '#5A6680', doorFrame: '#3A4864', knob: '#FF4F4F',
    neon: { text: 'MŇAU-1', color: '#4FE0FF', glow: '#D0F8FF' },
    light: '#CFE3FF',
    decor: ['consoles', 'stripe'],
  },
};

export const themeLook = (id) => THEME_LOOKS[id] ?? THEME_LOOKS.classic;
