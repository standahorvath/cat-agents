// Pose library. Every pose returns rig parameters for time t; the agent blends
// between them so switching is smooth. Angles in radians:
//   pitch > 0 noses down, leg rotation < 0 swings the paw forward,
//   tailBase > 0 lifts the tail.

const { sin, cos, abs, max, PI } = Math;
// Props are drawn in front of the chest; poses that hold one use HOLD (below).

export const REST = {
  y: 0.215,
  hz: 0,
  pitch: 0,
  roll: 0,
  yaw: 0,
  bounce: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  fl: 0,
  fr: 0,
  bl: 0,
  br: 0,
  flz: 0,
  frz: 0,
  fs: 1,
  bs: 1,
  tailBase: 0.9,
  tailCurl: 0.15,
  tailSway: 0,
  eyes: 1,
  mouth: 0,
  breathe: 0,
  ears: 0,
  prop: null,
};

// Sitting on the haunches: back legs fold flat, front legs stay vertical.
// Geometry: with pitch -0.8 the rump touches the floor at y = 0.215, the shoulders
// sit ~0.28 up (front legs stretched to reach) and the back legs lie along the floor.
const SIT = {
  y: 0.215,
  pitch: -0.8,
  fl: 0.72,
  fr: 0.72,
  fs: 1.8,
  bl: -0.77,
  br: -0.77,
  headPitch: 0.65,
  tailBase: 0.72,
  tailCurl: 0.05,
  tailSway: 0.55,
};

// Front paws held together in front of the chest (props sit at y 0.26, z 0.3).
const HOLD = { fl: -0.6, fr: -0.6, flz: -0.32, frz: 0.32, fs: 1 };

// Standing on the hind legs, body almost upright.
const UP = {
  y: 0.31,
  pitch: -1.25,
  bl: 1.25,
  br: 1.25,
  fl: -0.15,
  fr: -0.15,
  headPitch: 1.12,
  tailBase: 1.0,
  tailCurl: 0.2,
};

const LOAF = {
  y: 0.115,
  fs: 0.3,
  bs: 0.3,
  fl: -0.2,
  fr: -0.2,
  bl: 0.3,
  br: 0.3,
  headPitch: 0.12,
  tailBase: -0.25,
  tailCurl: 0,
  tailSway: 0.45,
};

const breath = (t, a = 0.025) => a * sin(t * 1.5);

export const POSES = {
  stand: (t, c) => ({ tailSway: 0.25 * sin(t * 1.5 + c.seed), headYaw: 0.3 * sin(t * 0.4 + c.seed) }),

  walk: (t, c) => {
    const s = sin(c.phase);
    return {
      fl: 0.55 * s,
      br: 0.55 * s,
      fr: -0.55 * s,
      bl: -0.55 * s,
      y: 0.215 + 0.012 * abs(cos(c.phase)),
      headPitch: 0.06 + 0.04 * sin(2 * c.phase),
      tailBase: 1.05,
      tailSway: 0.3 * sin(c.phase),
    };
  },

  trot: (t, c) => {
    const s = sin(c.phase);
    return {
      fl: 0.75 * s,
      br: 0.75 * s,
      fr: -0.75 * s,
      bl: -0.75 * s,
      bounce: 0.035 * abs(sin(c.phase)),
      headPitch: -0.05,
      tailBase: 1.3,
      tailCurl: 0.35,
      tailSway: 0.2 * sin(c.phase),
      ears: -0.2,
    };
  },

  sneak: (t, c) => {
    const s = sin(c.phase);
    return {
      y: 0.16,
      pitch: 0.06,
      fl: 0.4 * s - 0.2,
      br: 0.4 * s - 0.5,
      fr: -0.4 * s - 0.2,
      bl: -0.4 * s - 0.5,
      fs: 0.85,
      bs: 0.8,
      headPitch: 0.12,
      tailBase: 0.05,
      tailCurl: 0,
      tailSway: 0.25 * sin(t * 3),
      ears: 0.6,
      eyes: 1.3,
    };
  },

  run: (t, c) => {
    const f = sin(c.phase);
    const b = sin(c.phase + 2.2);
    return {
      fl: 0.95 * f,
      fr: 0.85 * f,
      bl: 0.95 * b,
      br: 0.85 * b,
      pitch: 0.12 * sin(c.phase + 1),
      y: 0.22 + 0.035 * abs(sin(c.phase)),
      tailBase: 0.25,
      tailCurl: 0,
      ears: 1,
      headPitch: -0.05,
    };
  },

  sit: (t, c) => ({ ...SIT, tailSway: 0.55 + 0.15 * sin(t * 1.2 + c.seed), headYaw: 0.35 * sin(t * 0.35 + c.seed) }),

  stare: (t) => ({ ...SIT, headPitch: 0.5, eyes: 1.45, tailSway: 0.55 + 0.1 * sin(t) }),

  meow: (t) => ({ ...SIT, headPitch: 0.2, mouth: sin(t * 3) > 0.55 ? 0.9 : 0 }),

  yawn: (t) => {
    const m = max(0, sin(t * 0.9)) ** 2;
    return { ...SIT, headPitch: 0.45 - 0.7 * m, mouth: m, eyes: 1 - m, ears: 0.5 * m };
  },

  lookWindow: (t, c) => ({ ...SIT, headPitch: 0.15, headYaw: 0.25 * sin(t * 0.3 + c.seed), tailSway: 0.6 + 0.35 * sin(t * 2) }),

  vibe: (t) => {
    const beat = sin(t * PI * 2.2) ** 2;
    return { ...SIT, headPitch: 0.3 + 0.35 * beat, headRoll: 0.15 * sin(t * PI * 1.1), tailSway: 0.6 * sin(t * PI * 2.2), eyes: 0.35 };
  },

  groom: (t) => {
    const lick = sin(t * 7);
    return { ...SIT, fl: -1.35 + 0.15 * lick, fs: 1, headPitch: 0.95, headYaw: -0.35, headRoll: 0.2, eyes: 0, mouth: lick > 0 ? 0.35 : 0 };
  },

  think: (t) => ({ ...SIT, fr: -1.05, frz: 0.25, headRoll: 0.2 * sin(t * 0.8), headPitch: 0.45, headYaw: 0.3 * sin(t * 0.5) }),

  typing: (t) => ({
    ...SIT,
    fl: -0.3 + 0.14 * sin(t * 9),
    fr: -0.3 + 0.14 * sin(t * 9 + PI),
    fs: 1.35,
    headPitch: 0.8,
  }),

  typingFast: (t) => ({
    ...SIT,
    fl: -0.3 + 0.18 * sin(t * 19),
    fr: -0.3 + 0.18 * sin(t * 19 + PI),
    fs: 1.35,
    headPitch: 0.75 + 0.06 * sin(t * 9.5),
    ears: 0.3,
    eyes: 0.7,
  }),

  phone: (t) => ({
    ...SIT,
    ...HOLD,
    fl: -0.6 + 0.06 * sin(t * 6),
    fr: -0.6 + 0.06 * sin(t * 6 + 1.5),
    headPitch: 1.15,
    prop: 'phone',
  }),

  mug: (t) => ({
    ...SIT,
    ...HOLD,
    headPitch: 0.6 + 0.45 * max(0, sin(t * 0.8)),
    eyes: 0.6,
    prop: 'mug',
  }),

  read: (t) => ({
    ...SIT,
    ...HOLD,
    headPitch: 1.1,
    headYaw: 0.12 * sin(t * 0.4),
    prop: 'book',
  }),

  scratch: (t) => ({ ...UP, fl: -0.2 + 0.35 * sin(t * 11), fr: -0.2 + 0.35 * sin(t * 11 + PI), ears: 0.4 }),

  fiddle: (t) => ({ ...UP, fl: -0.35 + 0.15 * sin(t * 5), fr: -0.7 + 0.25 * sin(t * 3.7), headPitch: 1.0 + 0.1 * sin(t) }),

  arcade: (t) => ({ ...UP, fl: -0.4 + 0.14 * sin(t * 14), fr: -0.4 + 0.14 * sin(t * 11.3), headPitch: 1.2, eyes: 1.3 }),

  coffeeMake: (t) => ({ ...UP, fl: -0.3, fr: -0.3 + 0.12 * sin(t * 3), headPitch: 1.15 }),

  present: (t) => ({ ...UP, fr: -1.05 + 0.12 * sin(t * 2), fl: 0.1, headYaw: 0.6 * sin(t * 0.7), mouth: sin(t * 5) > 0 ? 0.5 : 0 }),

  alert: (t) => ({
    ...UP,
    fl: -1.4 + 0.45 * sin(t * 10),
    fr: -1.4 + 0.45 * sin(t * 10 + PI),
    eyes: 1.5,
    mouth: 0.8,
    headPitch: 1.15,
    bounce: abs(sin(t * 6)) * 0.08,
  }),

  // Poses for cat-to-cat interactions
  // A wet-dog shake from nose to tail, eyes squeezed shut.
  shake: (t) => ({
    roll: 0.35 * sin(t * 38),
    headRoll: -0.5 * sin(t * 38 + 0.6),
    headYaw: 0.3 * sin(t * 19),
    eyes: 0,
    ears: 0.6,
    tailSway: 0.9 * sin(t * 30),
    bounce: 0.015 * abs(sin(t * 38)),
  }),
  boop: (t) => ({ headPitch: 0.3, hz: 0.03, eyes: 0.25, tailBase: 1.25, tailCurl: 0.4, bounce: 0.01 * abs(sin(t * 4)) }),

  sniff: (t) => ({ pitch: 0.12, headPitch: 0.65, headYaw: 0.25 * sin(t * 3), fl: -0.2, fr: -0.2, tailBase: 0.7 }),

  hiss: (t) => ({
    y: 0.25,
    fl: 0.12,
    fr: 0.12,
    bl: -0.12,
    br: -0.12,
    headPitch: -0.1,
    tailBase: 1.55,
    tailCurl: 0,
    tailSway: 0.08 * sin(t * 20),
    ears: 1,
    mouth: 0.9,
    eyes: 1.4,
    breathe: 0.1,
  }),

  highFive: (t) => ({ ...UP, fr: -2.5 + 0.1 * sin(t * 6), fl: -0.25, headPitch: 1.0, eyes: 0.3, mouth: 0.4 }),

  purr: (t) => ({ ...SIT, eyes: 0.15, headPitch: 0.75 + 0.03 * sin(t * 22), headRoll: 0.15, tailSway: 0.4 + 0.2 * sin(t) }),

  wrestle: (t) => ({
    y: 0.14,
    roll: 1.1 + 0.45 * sin(t * 5),
    fl: -0.8 + 0.6 * sin(t * 9),
    fr: -0.8 + 0.6 * sin(t * 9 + 1.5),
    bl: 0.3 + 0.4 * sin(t * 7),
    br: 0.3 + 0.4 * sin(t * 7 + 2),
    headPitch: 0.2,
    eyes: 1.4,
    mouth: sin(t * 6) > 0 ? 0.5 : 0,
    tailSway: 0.6 * sin(t * 8),
  }),

  cheer: (t) => ({
    ...SIT,
    fl: -2.0 + 0.35 * sin(t * 8),
    fr: -2.0 + 0.35 * sin(t * 8 + PI),
    fs: 1,
    mouth: 0.6,
    eyes: 1.3,
    bounce: abs(sin(t * 8)) * 0.03,
  }),

  headRub: (t) => ({ headRoll: 0.55 * sin(t * 2.5), headYaw: 0.4, headPitch: 0.2, eyes: 0.2, tailBase: 1.35, tailCurl: 0.45 }),

  gamepad: (t) => ({ ...SIT, ...HOLD, fl: -0.6 + 0.05 * sin(t * 11), fr: -0.6 + 0.05 * sin(t * 9 + 1), headPitch: 0.55, eyes: 1.3, ears: 0.2 }),

  // Games and gags
  // Crab rave: up on the hind legs, claws in the air, swaying side to side.
  crab: (t) => ({
    ...UP,
    fl: -2.3 + 0.35 * sin(t * 8),
    fr: -2.3 + 0.35 * sin(t * 8 + PI),
    flz: 0.45,
    frz: -0.45,
    roll: 0.18 * sin(t * 4),
    headRoll: 0.3 * sin(t * 4),
    mouth: 0.5,
    eyes: 0.3,
    bounce: abs(sin(t * 8)) * 0.03,
  }),
  // Leaning far back in slow motion, like dodging bullets.
  matrix: (t) => ({
    ...UP,
    y: 0.27,
    pitch: -1.85 - 0.08 * sin(t * 0.8),
    bl: 1.85,
    br: 1.85,
    fl: -1.2 + 0.25 * sin(t * 1.3),
    fr: -2.0 + 0.25 * sin(t * 1.1 + 1),
    headPitch: 1.5,
    eyes: 1.5,
    tailBase: 0.2,
  }),
  // Stuck mid-step with a twitch now and then: the cat stopped responding.
  frozen: (t) => ({ fl: -0.35, br: 0.3, headYaw: 0.35, eyes: 1.5, mouth: 0.4, tailBase: 1.4, hz: Math.floor(t * 9) % 7 === 0 ? 0.035 : 0 }),
  // Tug of war: leaning back with the front paws on the rope.
  pull: (t) => ({ y: 0.17, pitch: -0.35, fl: -1.0, fr: -1.0, fs: 1.1, bl: -0.6, br: -0.6, headPitch: 0.3, eyes: 1.3, ears: 0.6, roll: 0.05 * sin(t * 14), tailSway: 0.3 * sin(t * 9) }),
  // Leaps into the air with everything stuck out.
  startle: (t) => ({ ...UP, fl: -1.5, fr: -1.5, flz: 0.4, frz: -0.4, bl: 0.6, br: 0.6, tailBase: 1.6, tailCurl: 0, tailSway: 0.15 * sin(t * 30), eyes: 1.7, mouth: 0.9, ears: 1 }),
  laugh: (t) => ({ ...SIT, fl: -0.9, fs: 1.1, mouth: 0.55 + 0.35 * sin(t * 14), eyes: 0.1, headPitch: 0.3 + 0.12 * sin(t * 10), bounce: abs(sin(t * 10)) * 0.025, tailSway: 0.6 * sin(t * 6) }),
  whisper: (t) => ({ ...SIT, headRoll: 0.4, headYaw: 0.5, headPitch: 0.5, fr: -1.0, frz: 0.2, fs: 1.1, mouth: sin(t * 9) > 0.3 ? 0.3 : 0, eyes: 0.6 }),
  // Paws over the eyes, counting for hide and seek.
  peek: (t) => ({ ...SIT, fl: -1.55, fr: -1.55, fs: 1.05, headPitch: 1.0 + 0.04 * sin(t * 3), eyes: 0, mouth: sin(t * 4) > 0 ? 0.3 : 0 }),
  // Upright and spinning (the heading turns in the activity).
  spin: (t) => ({ ...UP, fl: -0.4, fr: -0.4, eyes: 1.4, mouth: 0.7 + 0.2 * sin(t * 12), tailSway: 0 }),

  // Reactions to results
  celebrate: (t) => ({ ...UP, fl: -2.4 + 0.4 * sin(t * 12), fr: -2.4 + 0.4 * sin(t * 12 + PI), eyes: 0.3, mouth: 0.8, bounce: abs(sin(t * 7)) * 0.07 }),
  facepalm: (t) => ({ ...SIT, fl: -1.55, fs: 1.05, headPitch: 1.05 + 0.05 * sin(t * 2), eyes: 0, ears: 0.8, tailSway: 0.2 }),

  pawPat: (t) => ({ ...SIT, fr: -0.75 + 0.3 * max(0, sin(t * 6)), fs: 1.2, headPitch: 0.8, eyes: 0.4 }),

  stretch: (t) => ({
    y: 0.19,
    pitch: 0.3,
    fl: -1.5,
    fr: -1.5,
    fs: 1.3,
    bl: -0.3,
    br: -0.3,
    headPitch: -0.45,
    tailBase: 1.3,
    tailCurl: 0.3,
    mouth: max(0, sin(t * 1.6)),
    eyes: 0.15,
  }),

  bat: (t, c) => ({
    y: 0.18,
    pitch: 0.15,
    bl: -0.3,
    br: -0.3,
    fl: -0.6 - 0.95 * max(0, sin(t * 6)),
    fr: -0.2,
    headPitch: 0.35,
    headYaw: c.look ?? 0,
    tailBase: 0.4,
    tailSway: 0.5 * sin(t * 4),
    eyes: 1.4,
  }),

  crouch: (t) => ({
    y: 0.15,
    pitch: 0.1,
    roll: 0.08 * sin(t * 12),
    fl: -0.5,
    fr: -0.5,
    bl: -0.65,
    br: -0.65,
    fs: 0.9,
    bs: 0.8,
    headPitch: 0.1,
    eyes: 1.5,
    tailBase: 0.3,
    tailSway: 0.35 * sin(t * 8),
  }),

  drink: (t) => ({ pitch: 0.15, fl: -0.25, fr: -0.25, headPitch: 1.0 + 0.08 * sin(t * 8), eyes: 0, mouth: sin(t * 8) > 0.5 ? 0.3 : 0 }),

  knock: (t) => ({ fr: -1.0 - 0.35 * (0.5 + 0.5 * sin(t * 1.5)), fs: 1.1, headPitch: 0.15, eyes: 1.2 }),

  loaf: (t, c) => ({ ...LOAF, eyes: (t + c.seed) % 6 < 3 ? 0.55 : 0.3, breathe: breath(t) }),

  warmFire: (t) => ({ ...LOAF, eyes: 0.22, headPitch: 0.2, breathe: breath(t), tailSway: 0.5 + 0.1 * sin(t * 0.7) }),

  sleepCurl: (t) => ({
    ...LOAF,
    roll: 0.15,
    headYaw: 0.9,
    headPitch: 0.55,
    headRoll: 0.3,
    tailSway: 0.75,
    eyes: 0,
    breathe: breath(t, 0.035),
  }),

  knead: (t) => ({
    y: 0.17,
    pitch: -0.15,
    fl: -0.4 + 0.28 * sin(t * 5),
    fr: -0.4 + 0.28 * sin(t * 5 + PI),
    bl: -0.4,
    br: -0.4,
    eyes: 0.2,
    headPitch: 0.25,
    tailSway: 0.4 * sin(t * 1.5),
  }),

  lieSide: (t) => ({
    y: 0.125,
    roll: 1.45,
    fl: -0.5,
    fr: -0.35,
    bl: 0.45,
    br: 0.3,
    headPitch: -0.1,
    tailBase: 0,
    tailCurl: 0,
    tailSway: 0.25 + 0.1 * sin(t * 0.8),
    eyes: 0,
    breathe: breath(t, 0.03),
  }),

  bellyUp: (t) => ({
    y: 0.13,
    roll: 3.0,
    fl: -0.6 + 0.25 * sin(t * 3),
    fr: -0.6 - 0.25 * sin(t * 3),
    bl: 0.5 + 0.15 * sin(t * 2),
    br: 0.5,
    fs: 0.85,
    bs: 0.85,
    headPitch: -0.4,
    eyes: 0,
    tailBase: 0,
    tailSway: 0.2,
    breathe: breath(t),
  }),
};

export const POSE_NAMES = Object.keys(POSES);

export function poseParams(name, t, ctx) {
  return { ...REST, ...(POSES[name] ?? POSES.stand)(t, ctx) };
}
