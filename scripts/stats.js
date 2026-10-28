// How much there is in the game, counted from the code: npm run stats

import fs from 'node:fs';
import { GROUPS, ITEMS, THEMES } from '../shared/catalog.js';
import { ACHIEVEMENTS, COLLECTIBLES, COSMETICS, RARE_FURS, SLOTS, TRAITS } from '../shared/cats.js';

// The scene modules paint textures on a canvas; Node only needs them to load.
const ctx = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => {}) });
globalThis.document ??= { createElement: () => ({ getContext: () => ctx }) };

const { ACTIVITIES, WORK_LINES, THINK_LINES, SLEEP_LINES, ALERT_LINES, IDLE_LINES, TRAIT_LINES, timeLines } = await import('../src/scene/activities.js');
const { INTERACTIONS, CONVERSATIONS } = await import('../src/scene/interactions.js');
const { GAMES } = await import('../src/scene/games.js');
const { EVENTS, VISITORS } = await import('../src/scene/events.js');
const { FURS, RARE_LOOKS } = await import('../src/scene/identity.js');
const { POSE_NAMES } = await import('../src/scene/poses.js');
const { MUSIC_STYLES, EFFECT_NAMES } = await import('../src/scene/sound.js');
const { REACTION_LINES, PAMPER_LINES } = await import('../src/scene/Agent.js');

const read = (file) => fs.readFileSync(new URL(`../src/scene/${file}`, import.meta.url), 'utf8');
const count = (list) => list.length;
const sum = (obj) => Object.values(obj).reduce((s, l) => s + l.length, 0);

// Lines written straight into the code: pick([...]) and say(cat, [...]).
const inline = (file) => [...read(file).matchAll(/(?:pick|say)\((?:\w+,\s*)?\[([^\]]*)\]/g)].reduce((s, m) => s + (m[1].match(/'[^']*'/g) ?? []).length, 0);

const activityLines = Object.values(ACTIVITIES).reduce((s, a) => s + (a.startLines?.length ?? 0) + (a.lines?.length ?? 0), 0);
const scriptLines = Object.values({ ...INTERACTIONS, ...GAMES }).reduce((s, ix) => s + (ix.script ?? []).reduce((n, [, , lines]) => n + lines.length, 0), 0);
// Lines in plain string arrays inside a file (insults, board game moves), minus what is counted elsewhere.
const arrays = (file, name) => (read(file).match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`))?.[1].match(/'[^']*'/g) ?? []).length;
const timely = new Set();
for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) for (const l of timeLines(new Date(2030, 0, 6 + d, h, 30)) ?? []) timely.add(l);
const boardLines = [...read('interactions.js').matchAll(/(?:moves|win|lose|tie): \[([^\]]*)\]/g)].reduce((n, m) => n + (m[1].match(/'[^']*'/g) ?? []).length, 0);
const names = read('identity.js').match(/const NAMES = \[([^\]]*)\]/)[1].match(/'[^']*'/g).length;
const seasons = new Set([...read('Office.js').matchAll(/return '(\w+)';/g)].map((m) => m[1]));

const lines = {
  'work (by tool)': sum(WORK_LINES),
  thinking: count(THINK_LINES),
  sleeping: count(SLEEP_LINES),
  'waiting for permission': count(ALERT_LINES),
  'activities (start and during)': activityLines,
  'interactions and games': scriptLines,
  conversations: Object.values(CONVERSATIONS).flat(2).length,
  'insults and board games': arrays('interactions.js', 'INSULTS') + boardLines,
  'slacking, personalities, day and hour': IDLE_LINES.length + sum(TRAIT_LINES) + timely.size,
  'reactions to tests and commits': sum(REACTION_LINES),
  'petting and treats': sum(PAMPER_LINES),
  'events and other': inline('events.js') + inline('activities.js') + inline('interactions.js') + inline('games.js') + inline('World.js') + inline('Agent.js'),
};

const byGroup = Object.fromEntries(Object.keys(GROUPS).map((g) => [GROUPS[g], Object.values(ITEMS).filter((i) => i.group === g).length]));
const bySlot = Object.fromEntries(Object.entries(SLOTS).map(([slot, name]) => [name, Object.values(COSMETICS).filter((c) => c.slot === slot).length]));
const pairs = Object.values(INTERACTIONS).filter((i) => i.kind === 'pair').length;

const rows = [
  ['Shop items', count(Object.keys(ITEMS)), Object.entries(byGroup).map(([g, n]) => `${g} ${n}`).join(', ')],
  ['Clothes', count(Object.keys(COSMETICS)), Object.entries(bySlot).map(([s, n]) => `${s} ${n}`).join(', ')],
  ['Office looks', count(Object.keys(THEMES)), Object.values(THEMES).map((t) => t.name).join(', ')],
  ['Achievements', count(Object.keys(ACHIEVEMENTS)), `${Object.values(ACHIEVEMENTS).filter((a) => a.secret).length} secret`],
  ['Collection', count(Object.keys(COLLECTIBLES)), ''],
  ['Furs', FURS.length + Object.keys(RARE_LOOKS).length, `${FURS.length} common, ${Object.keys(RARE_FURS).length} rare`],
  ['Cat names', names, `+ ${VISITORS.length} visitors`],
  ['Cat activities', count(Object.keys(ACTIVITIES)), `${Object.values(ACTIVITIES).filter((a) => a.meme).length} memes`],
  ['Personalities', count(Object.keys(TRAITS)), Object.values(TRAITS).map((t) => t.m).join(', ')],
  ['Group games', count(Object.keys(GAMES)), Object.keys(GAMES).join(', ')],
  ['Interactions between cats', count(Object.keys(INTERACTIONS)), `${pairs} pairs, ${Object.keys(INTERACTIONS).length - pairs} visits; ${Object.values(INTERACTIONS).filter((i) => i.rel === 'friend').length} friends only, ${Object.values(INTERACTIONS).filter((i) => i.rel === 'rival').length} rivals only`],
  ['Random events', count(Object.keys(EVENTS)), Object.keys(EVENTS).join(', ')],
  ['Poses', POSE_NAMES.length, ''],
  ['Music styles', count(Object.keys(MUSIC_STYLES)), ''],
  ['Sound effects', EFFECT_NAMES().length, ''],
  ['Seasonal decorations', seasons.size, [...seasons].join(', ')],
  ['Lines', Object.values(lines).reduce((a, b) => a + b, 0), Object.entries(lines).map(([k, v]) => `${k} ${v}`).join(', ')],
];
const w = Math.max(...rows.map((r) => r[0].length));
for (const [label, n, detail] of rows) console.log(`${label.padEnd(w)}  ${String(n).padStart(4)}  ${detail}`);
