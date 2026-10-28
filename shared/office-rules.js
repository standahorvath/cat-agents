// Game rules on an office state object: shop, furniture, cat profiles, needs,
// levels and achievements. Used by the server (with saving) and by the browser in
// demo mode (in memory).

import {
  DEFAULT_ITEMS,
  DEFAULT_THEME,
  EARN_CAT,
  EARN_KITTEN,
  GARDEN,
  ITEMS,
  ROOM_LEVELS,
  SELL_RATE,
  START_COINS,
  THEMES,
  blocksPaths,
  layoutOf,
  placementProblem,
} from './catalog.js';
import {
  ACHIEVEMENTS,
  COLLECTIBLES,
  COSMETICS,
  GAME_STATS,
  PAMPER,
  RARE_FURS,
  earnMultiplier,
  levelOf,
  mood,
  newCatProfile,
  applyRelation,
  chemistryDelta,
  driftRelations,
  relationKey,
  relationOf,
  restoreNeeds,
  unlockedFurs,
  updateNeeds,
  xpForLevel,
} from './cats.js';

export const newUid = () => Math.random().toString(36).slice(2, 10);

const emptyStats = () => ({
  maxCats: 0, maxKittens: 0, nightWork: 0, commits: 0, pushes: 0, merges: 0, deploys: 0, testsPass: 0, testsFail: 0, errors: 0,
  pets: 0, treats: 0, compacts: 0, maxFill: 0, fridayPush: 0, nightCommits: 0, fixedTests: 0, mondayFail: 0,
  builds: 0, buildFails: 0, installs: 0, lints: 0, reverts: 0, slows: 0, maxCoins: 0,
  ...Object.fromEntries(GAME_STATS.map((k) => [k, 0])),
});

export function initialState() {
  return {
    coins: START_COINS,
    earned: 0,
    level: 0,
    items: DEFAULT_ITEMS.map((item) => ({ ...item, uid: newUid() })),
    cats: {},
    stats: emptyStats(),
    achievements: {},
    garden: false,
    relations: {},
    relVersion: 2,
    collection: {},
    theme: DEFAULT_THEME,
    themes: [DEFAULT_THEME],
  };
}

// Older saves lack the newer fields.
export function migrate(state) {
  state.cats ??= {};
  state.stats = { ...emptyStats(), ...state.stats };
  state.achievements ??= {};
  state.garden ??= false;
  state.relations ??= {};
  // Version 1 relations only ever grew; start over from each pair's chemistry.
  if ((state.relVersion ?? 1) < 2) {
    state.relations = {};
    state.relVersion = 2;
  }
  state.collection ??= {};
  state.themes ??= [DEFAULT_THEME];
  if (!Object.hasOwn(THEMES, state.theme ?? '')) state.theme = DEFAULT_THEME;
  for (const profile of Object.values(state.cats)) profile.wins ??= 0;
  return state;
}

export const roomSize = (state) => ROOM_LEVELS[state.level].size;
export const layout = (state) => layoutOf(roomSize(state), state.garden);

// The cat profile belongs to the project, so it survives new sessions.
export const catKey = (session) => session.cwd || session.id;

export function catView(profile) {
  const level = levelOf(profile.xp);
  return {
    level,
    xp: Math.floor(profile.xp),
    levelXp: xpForLevel(level),
    nextXp: xpForLevel(level + 1),
    needs: Object.fromEntries(Object.entries(profile.needs).map(([k, v]) => [k, Math.round(v)])),
    mood: Math.round(mood(profile)),
    multiplier: Math.round(earnMultiplier(profile) * 100) / 100,
    earned: Math.floor(profile.earned),
    owned: profile.owned,
    wear: profile.wear,
    fur: profile.fur ?? null,
    wins: profile.wins ?? 0,
  };
}

export function publicView(state) {
  return {
    coins: Math.floor(state.coins),
    earned: Math.floor(state.earned),
    level: state.level,
    size: roomSize(state),
    garden: !!state.garden,
    gardenPrice: GARDEN.price,
    items: state.items,
    nextLevel: ROOM_LEVELS[state.level + 1] ?? null,
    cats: Object.fromEntries(Object.entries(state.cats).map(([key, profile]) => [key, catView(profile)])),
    achievements: state.achievements,
    stats: state.stats,
    relations: Object.fromEntries(Object.entries(state.relations).map(([k, v]) => [k, Math.round(v)])),
    collection: state.collection,
    furs: unlockedFurs(state),
    theme: state.theme,
    themes: state.themes,
  };
}

const countedResults = new Set();
const startedAt = Date.now();
const lastFail = new Map(); // session id -> when its tests last failed

// Stats about when things happened: Friday deploys, midnight commits, quick fixes.
function countResult(state, session, r) {
  const field = {
    commit: 'commits', push: 'pushes', merge: 'merges', deploy: 'deploys', testsPass: 'testsPass', testsFail: 'testsFail', error: 'errors',
    build: 'builds', buildFail: 'buildFails', install: 'installs', lint: 'lints', revert: 'reverts', slow: 'slows',
  }[r.kind];
  if (field) state.stats[field] += 1;
  const at = new Date(r.ts);
  const day = at.getDay();
  const hour = at.getHours();
  if ((r.kind === 'push' || r.kind === 'deploy') && day === 5 && hour >= 15) state.stats.fridayPush += 1;
  if (r.kind === 'commit' && (hour >= 23 || hour < 4)) state.stats.nightCommits += 1;
  if (r.kind === 'testsFail') {
    lastFail.set(session.id, r.ts);
    if (day === 1 && hour < 12) state.stats.mondayFail += 1;
  }
  if (r.kind === 'testsPass' && r.ts - (lastFail.get(session.id) ?? -Infinity) < 600_000) {
    state.stats.fixedTests += 1;
    lastFail.delete(session.id);
  }
}

// One step of the simulation for the last `seconds`: coins, needs, levels, stats
// and achievements. Returns true when anything changed.
export function tick(state, sessions, seconds, watched = true) {
  migrate(state);
  let changed = false;
  let kittens = 0;
  const hour = new Date().getHours();
  for (const s of sessions) {
    const key = catKey(s);
    const cat = (state.cats[key] ??= newCatProfile());
    const working = s.status === 'busy';
    updateNeeds(cat, working, state.items, seconds, watched);
    kittens += s.subagents?.length ?? 0;
    if (working) {
      const coins = (EARN_CAT * earnMultiplier(cat) + (s.subagents?.length ?? 0) * EARN_KITTEN) * seconds;
      state.coins += coins;
      state.earned += coins;
      cat.earned += coins;
      cat.xp += seconds;
      if (hour < 5) state.stats.nightWork += seconds;
    }
    // The fullest context seen and compactions since this server started.
    if (s.context?.fill > state.stats.maxFill) state.stats.maxFill = s.context.fill;
    for (const c of s.compacts ?? []) {
      if (countedResults.has(c.id) || c.ts < startedAt) continue;
      countedResults.add(c.id);
      state.stats.compacts += 1;
    }
    // Results that happened since this server started (older ones were replayed from transcripts).
    for (const r of s.results ?? []) {
      if (countedResults.has(r.id) || r.ts < startedAt) continue;
      countedResults.add(r.id);
      countResult(state, s, r);
    }
    changed = true;
  }
  driftRelations(state.relations, seconds);
  state.stats.maxCats = Math.max(state.stats.maxCats, sessions.length);
  state.stats.maxCoins = Math.max(state.stats.maxCoins, state.coins);
  state.stats.maxKittens = Math.max(state.stats.maxKittens, kittens);
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    if (state.achievements[id] || !a.check(state)) continue;
    state.achievements[id] = Date.now();
    state.coins += a.reward;
    changed = true;
  }
  return changed;
}

export function placementError(state, item, ignoreUid = null) {
  const L = layout(state);
  const problem = placementProblem(state.items, item, L, ignoreUid);
  if (problem) return problem;
  const others = state.items.filter((i) => i.uid !== ignoreUid);
  if (blocksPaths([...others, item], L)) return 'Zatarasil by cestu';
  return null;
}

const rot4 = (rot) => (((rot ?? 0) % 4) + 4) % 4;

export const ACTIONS = {
  buy(state, { type, x, z, rot }) {
    const def = ITEMS[type];
    if (!def) return 'Neznámý předmět';
    if (state.coins < def.price) return 'Málo mincí';
    const item = { type, x: Math.round(x), z: Math.round(z), rot: rot4(rot), uid: newUid() };
    const problem = placementError(state, item);
    if (problem) return problem;
    state.coins -= def.price;
    state.items.push(item);
    return null;
  },

  move(state, { uid, x, z, rot }) {
    const item = state.items.find((i) => i.uid === uid);
    if (!item) return 'Předmět neexistuje';
    const moved = { ...item, x: Math.round(x), z: Math.round(z), rot: rot4(rot) };
    const problem = placementError(state, moved, uid);
    if (problem) return problem;
    Object.assign(item, moved);
    return null;
  },

  sell(state, { uid }) {
    const index = state.items.findIndex((i) => i.uid === uid);
    if (index === -1) return 'Předmět neexistuje';
    const [item] = state.items.splice(index, 1);
    state.coins += Math.floor(ITEMS[item.type].price * SELL_RATE);
    return null;
  },

  expand(state) {
    const next = ROOM_LEVELS[state.level + 1];
    if (!next) return 'Větší kancelář už není';
    if (state.coins < next.price) return 'Málo mincí';
    state.coins -= next.price;
    // The garden sits behind the south wall, so it moves out with it.
    const grow = next.size - roomSize(state);
    if (state.garden) for (const item of state.items) if (ITEMS[item.type]?.outdoor) item.z += grow;
    state.level += 1;
    return null;
  },

  buyGarden(state) {
    if (state.garden) return 'Zahradu už máš';
    if (state.coins < GARDEN.price) return 'Málo mincí';
    state.coins -= GARDEN.price;
    state.garden = true;
    return null;
  },

  // A new look for the office; it is put up straight away.
  buyTheme(state, { id }) {
    if (!Object.hasOwn(THEMES, id ?? '')) return 'Neznámý vzhled';
    if (state.themes.includes(id)) return 'Tenhle vzhled už máš';
    if (state.coins < THEMES[id].price) return 'Málo mincí';
    state.coins -= THEMES[id].price;
    state.themes.push(id);
    state.theme = id;
    return null;
  },

  // Switch between looks the player already owns.
  setTheme(state, { id }) {
    if (!Object.hasOwn(THEMES, id ?? '')) return 'Neznámý vzhled';
    if (!state.themes.includes(id)) return 'Tenhle vzhled ještě nemáš';
    state.theme = id;
    return null;
  },

  // Petting is free, a treat costs a few coins; both cheer the cat up.
  pamper(state, { cat, kind }) {
    const def = PAMPER[kind];
    const profile = state.cats[cat];
    if (!def || !profile) return 'Neznámá kočka';
    if (state.coins < def.price) return 'Málo mincí';
    state.coins -= def.price;
    restoreNeeds(profile, def.gains);
    state.stats[kind === 'pet' ? 'pets' : 'treats'] += 1;
    return null;
  },

  // The browser reports how the cats got along: [{ a, b, delta }].
  relate(state, { changes }) {
    if (!Array.isArray(changes)) return 'Chybí změny';
    for (const { a, b, delta } of changes.slice(0, 50)) {
      const d = Number(delta);
      if (!state.cats[a] || !state.cats[b] || a === b || !Number.isFinite(d)) continue;
      // Making up (a big gesture) counts in full; everything else goes through the chemistry.
      const clamped = Math.max(-30, Math.min(30, d));
      state.relations[relationKey(a, b)] = applyRelation(relationOf(state.relations, a, b), Math.abs(clamped) >= 20 ? clamped : chemistryDelta(a, b, clamped));
    }
    return null;
  },

  // Games and gags the browser saw: { stats: { games: 2 }, wins: { [cat]: 1 } }.
  record(state, { stats, wins }) {
    for (const [name, n] of Object.entries(stats ?? {})) {
      const k = Number(n);
      if (GAME_STATS.includes(name) && Number.isFinite(k) && k > 0) state.stats[name] += Math.min(k, 10);
    }
    for (const [cat, n] of Object.entries(wins ?? {})) {
      const k = Number(n);
      if (state.cats[cat] && Number.isFinite(k) && k > 0) state.cats[cat].wins = (state.cats[cat].wins ?? 0) + Math.min(k, 10);
    }
    return null;
  },

  // Something found or won for the collection.
  collect(state, { id }) {
    if (!Object.hasOwn(COLLECTIBLES, id)) return 'Neznámá věc';
    state.collection[id] = (state.collection[id] ?? 0) + 1;
    return null;
  },

  setFur(state, { cat, fur }) {
    const profile = state.cats[cat];
    if (!profile) return 'Neznámá kočka';
    if (fur && !Object.hasOwn(RARE_FURS, fur)) return 'Neznámá srst';
    if (fur && !RARE_FURS[fur].check(state)) return 'Srst ještě není odemčená';
    profile.fur = fur || null;
    return null;
  },

  // Buy a piece of clothing for one cat; it is put on straight away.
  buyCosmetic(state, { cat, id }) {
    const def = COSMETICS[id];
    const profile = state.cats[cat];
    if (!def || !profile) return 'Neznámá věc';
    if (profile.owned.includes(id)) return 'Už ji má';
    if (levelOf(profile.xp) < def.level) return `Potřebuje ${def.level}. úroveň`;
    if (state.coins < def.price) return 'Málo mincí';
    state.coins -= def.price;
    profile.owned.push(id);
    profile.wear[def.slot] = id;
    return null;
  },

  // The browser reports what a cat ate, slept or played with since the last report.
  restore(state, { cat, gains }) {
    const profile = state.cats[cat];
    if (!profile) return 'Neznámá kočka';
    restoreNeeds(profile, gains);
    return null;
  },

  wear(state, { cat, slot, id }) {
    const profile = state.cats[cat];
    if (!profile) return 'Neznámá kočka';
    if (id && !profile.owned.includes(id)) return 'Tohle nemá';
    if (id) profile.wear[slot] = id;
    else delete profile.wear[slot];
    return null;
  },
};

export function runAction(state, action, payload) {
  migrate(state);
  const fn = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
  if (!fn) return { ok: false, error: 'Neznámá akce' };
  const error = fn(state, payload ?? {});
  return error ? { ok: false, error } : { ok: true, office: publicView(state) };
}
