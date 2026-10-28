// Everything the game lists must exist where it is used: every shop item has a
// model and its activities have spots, every pose is known, every find can be
// found, every interaction changes relationships, and so on.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { before, describe, it } from 'node:test';
import * as THREE from 'three';
import { DEFAULT_ITEMS, GROUPS, ITEMS } from '../shared/catalog.js';
import { ACHIEVEMENTS, COLLECTIBLES, COSMETICS, NEEDS, RARE_FURS, SLOTS } from '../shared/cats.js';

// Textures paint on a canvas; in Node any drawing call simply does nothing.
before(() => {
  const ctx = new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => {}) });
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

const scene = async () => ({
  activities: await import('../src/scene/activities.js'),
  items: await import('../src/scene/items.js'),
  cosmetics: await import('../src/scene/cosmetics.js'),
  interactions: await import('../src/scene/interactions.js'),
  events: await import('../src/scene/events.js'),
  games: await import('../src/scene/games.js'),
  identity: await import('../src/scene/identity.js'),
  poses: await import('../src/scene/poses.js'),
  sound: await import('../src/scene/sound.js'),
  office: await import('../src/scene/Office.js'),
});

// Build every item with a stand-in office and note which spots it offers.
async function spotKindsOfItems() {
  const { items } = await scene();
  const kinds = new Map();
  const office = {
    screenOff: new THREE.MeshBasicMaterial(),
    desks: [],
    daylight: 0.5,
    collection: {},
    nav: { tileOf: (x, z) => [Math.floor(x), Math.floor(z)] },
    addSpot(kind, x, z, extra) {
      (kinds.get(kind) ?? kinds.set(kind, []).get(kind)).push({ x, z, ...extra });
      return { kind, x, z, ...extra };
    },
    addYarn: () => {},
    sign: (text, opts, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h)),
  };
  const byType = {};
  for (const type of Object.keys(ITEMS)) {
    const before = new Set([...kinds.entries()].flatMap(([k, list]) => list.map((s) => `${k}:${s.x}:${s.z}`)));
    items.buildItem(office, { type, x: 2, z: 2, rot: 0, uid: type });
    byType[type] = [...kinds.entries()].flatMap(([k, list]) => list.filter((s) => !before.has(`${k}:${s.x}:${s.z}`)).map(() => k));
  }
  return { kinds: new Set(kinds.keys()), byType };
}

// Spots the room itself provides (Office.js), not furniture.
const ROOM_SPOTS = ['front', 'door', 'sill', 'sun'];

describe('shop items', () => {
  it('every item has a model and the other way round', async () => {
    const { items } = await scene();
    assert.deepEqual(Object.keys(items.BUILDERS).sort(), Object.keys(ITEMS).sort());
  });

  it('items are well formed', () => {
    for (const [type, def] of Object.entries(ITEMS)) {
      assert.ok(GROUPS[def.group], `${type}: group`);
      assert.ok(def.price > 0 && def.w > 0 && def.d > 0, `${type}: size/price`);
      assert.ok(def.name && def.desc, `${type}: texts`);
      assert.equal(!!def.outdoor, def.group === 'garden', `${type}: garden items are outdoor`);
      for (const [i, j] of def.blocks ?? []) assert.ok(i >= 0 && j >= 0 && i < def.w && j < def.d, `${type}: block inside footprint`);
    }
    for (const item of DEFAULT_ITEMS) assert.ok(ITEMS[item.type]);
  });

  it('every item that refills a need is in the shop', () => {
    for (const def of Object.values(NEEDS)) for (const type of def.items) assert.ok(ITEMS[type], type);
  });

  it('models build without errors and offer spots', async () => {
    const { byType } = await spotKindsOfItems();
    // Decorations, and the yarn basket whose ball rolls around instead.
    const decorative = ['plant', 'lamp', 'rug', 'fridge', 'lantern', 'yarn'];
    for (const [type, spots] of Object.entries(byType)) {
      if (!decorative.includes(type)) assert.ok(spots.length > 0, `${type} has no spots for the cats`);
    }
  });
});

describe('activities', () => {
  it('every spot an activity needs exists somewhere', async () => {
    const { activities } = await scene();
    const { kinds } = await spotKindsOfItems();
    for (const k of ROOM_SPOTS) kinds.add(k);
    for (const [name, def] of Object.entries(activities.ACTIVITIES)) {
      if (def.spot) assert.ok(kinds.has(def.spot), `${name}: no '${def.spot}' spot anywhere`);
      if (def.fallback) assert.ok(kinds.has(def.fallback), `${name}: no '${def.fallback}' fallback spot`);
    }
  });

  it('spots used by interactions exist', async () => {
    const { kinds } = await spotKindsOfItems();
    for (const k of ROOM_SPOTS) kinds.add(k);
    const source = fs.readFileSync(new URL('../src/scene/interactions.js', import.meta.url), 'utf8');
    for (const [, kind] of source.matchAll(/(?:reserve|twoSpots)\([^'"\n]*['"](\w+)['"]/g)) assert.ok(kinds.has(kind), kind);
    for (const kind of ['fire', 'couch']) assert.ok(kinds.has(kind), kind);
  });

  it('all poses are known', async () => {
    const { activities, poses } = await scene();
    const known = new Set(poses.POSE_NAMES);
    const agent = { category: 'think', world: { event: null }, pos: { x: 0, z: 0 }, office: { laser: { x: 0, z: 0 } } };
    for (const [name, def] of Object.entries(activities.ACTIVITIES)) {
      // Some activities pick their pose when they start.
      const state = {};
      try {
        def.start?.({ ...agent, caption: () => {}, office: { ...agent.office, startLaser: () => {}, openDoor: () => {} }, goTo: () => {} }, { state, spot: {} });
      } catch {
        // starts that need the real scene are covered in the browser
      }
      const results = typeof def.pose === 'function' ? [0, 1, 2, 3, 4.5, 6, 9].map((elapsed) => def.pose(agent, { elapsed, state }, 0)) : [def.pose ?? 'stand'];
      for (const p of results) assert.ok(known.has(p), `${name}: unknown pose ${p}`);
    }
  });

  it('refills, finds and weights point at real activities', async () => {
    const { activities } = await scene();
    const { ACTIVITIES, RESTORES, FINDS } = activities;
    for (const name of Object.keys(RESTORES)) assert.ok(ACTIVITIES[name], name);
    for (const [name, [id, chance]] of Object.entries(FINDS)) {
      assert.ok(ACTIVITIES[name], name);
      assert.ok(COLLECTIBLES[id], id);
      assert.ok(chance > 0 && chance < 0.5);
    }
    // Every slacking choice exists, by day and by night, with or without needs.
    const office = { has: () => true, yarn: true, garden: true, outdoorOk: true };
    for (const daylight of [0, 1]) {
      for (let k = 0; k < 400; k++) {
        const name = activities.idleActivity(k % 30, daylight, office, k % 2 ? { food: 10, energy: 10, fun: 10 } : null);
        assert.ok(ACTIVITIES[name], name);
      }
    }
  });

  it('garden activities stay inside in bad weather', async () => {
    const { activities } = await scene();
    const office = { has: () => true, yarn: true, garden: true, outdoorOk: false };
    for (let k = 0; k < 500; k++) assert.ok(!activities.ACTIVITIES[activities.idleActivity(1, 1, office, null)].outdoor);
  });
});

describe('cats', () => {
  it('every piece of clothing has a model', async () => {
    const { cosmetics } = await scene();
    assert.deepEqual(Object.keys(cosmetics.COSMETIC_BUILDERS).sort(), Object.keys(COSMETICS).sort());
    for (const [id, def] of Object.entries(COSMETICS)) {
      assert.ok(SLOTS[def.slot], id);
      const g = new THREE.Group();
      cosmetics.COSMETIC_BUILDERS[id](g);
      assert.ok(g.children.length > 0, id);
    }
  });

  it('every rare fur has a look', async () => {
    const { identity } = await scene();
    assert.deepEqual(Object.keys(identity.RARE_LOOKS).sort(), Object.keys(RARE_FURS).sort());
  });

  it('existing cats keep their names and furs', async () => {
    const { identity } = await scene();
    // The original lists and algorithm, before new names and furs were added.
    const oldNames = ['Mourek', 'Micka', 'Šmudla', 'Tlapka', 'Fousek', 'Mikeš', 'Líza', 'Bublina', 'Pepík', 'Zrzek', 'Mína', 'Čenda', 'Bertík', 'Kulička', 'Sněhurka', 'Rambo'];
    const oldFurs = identity.FURS.slice(0, 8).map((f) => f.id);
    const taken = { names: new Set(), furs: new Set() };
    const free = (list, start, used) => {
      for (let i = 0; i < list.length; i++) if (!used.has(list[(start + i) % list.length])) return list[(start + i) % list.length];
      return list[start % list.length];
    };
    for (const id of ['/Users/a/project', '/srv/api', '/home/x/web', 'abc', '/tmp/demo', '/w/eshop']) {
      const name = free(oldNames, identity.hash(`${id}:name`), taken.names);
      const fur = free(oldFurs, identity.hash(id), taken.furs);
      taken.names.add(name);
      taken.furs.add(fur);
      assert.equal(identity.catName(id), name, id);
      assert.equal(identity.catFur(id).id, fur, id);
    }
  });

  it('every interaction changes (or knowingly keeps) relationships and uses known poses', async () => {
    const { interactions, poses } = await scene();
    const known = new Set(poses.POSE_NAMES);
    assert.deepEqual(Object.keys(interactions.RELATION_DELTA).sort(), Object.keys(interactions.INTERACTIONS).sort());
    const ix = { state: { loser: 'a', near: {}, blinkAt: 3 }, a: {}, b: {} };
    for (const [name, spec] of Object.entries(interactions.INTERACTIONS)) {
      for (const role of ['a', 'b']) {
        const pose = spec.pose?.[role];
        if (!pose) continue;
        for (const e of [0, 1, 2, 3, 5, 8]) {
          const p = typeof pose === 'function' ? pose(ix, e) : pose;
          assert.ok(known.has(p), `${name}.${role}: unknown pose ${p}`);
        }
      }
      for (const [, role, lines] of spec.script ?? []) {
        assert.ok(['a', 'b'].includes(role));
        assert.ok(lines.length > 0, name);
      }
    }
  });
});

describe('office looks', () => {
  it('every look in the shop has a complete style with known patterns and decorations', async () => {
    const { THEMES } = await import('../shared/catalog.js');
    const { THEME_LOOKS } = await import('../src/scene/themes.js');
    const textures = await import('../src/scene/textures.js');
    assert.deepEqual(Object.keys(THEME_LOOKS).sort(), Object.keys(THEMES).sort());
    const office = fs.readFileSync(new URL('../src/scene/Office.js', import.meta.url), 'utf8');
    for (const [id, look] of Object.entries(THEME_LOOKS)) {
      assert.ok(textures.WALL_PATTERNS.includes(look.wall.pattern), `${id}: wall ${look.wall.pattern}`);
      assert.ok(textures.FLOOR_PATTERNS.includes(look.floor.pattern), `${id}: floor ${look.floor.pattern}`);
      assert.equal(look.floor.tones.length, 4, id);
      for (const key of ['stub', 'trim', 'base', 'slab', 'frame', 'sill', 'door', 'doorFrame', 'knob', 'light']) assert.match(look[key], /^#[0-9A-F]{6}$/i, `${id}.${key}`);
      assert.ok(look.neon.text && look.neon.color, id);
      for (const kind of look.decor) assert.ok(office.includes(`has('${kind}')`), `${id}: decoration ${kind}`);
      textures.wallpaperTexture(2, 2, look.wall);
      textures.floorTexture(2, 2, look.floor);
      assert.ok(THEMES[id].name && THEMES[id].desc && THEMES[id].price >= 0, id);
    }
    assert.equal(THEMES.classic.price, 0);
  });
});

describe('games and gags', () => {
  it('every group game is complete and uses known poses for every role', async () => {
    const { games, poses, interactions } = await scene();
    const known = new Set(poses.POSE_NAMES);
    assert.deepEqual(Object.keys(games.GAME_DELTA).sort(), Object.keys(games.GAMES).sort());
    assert.deepEqual(Object.keys(games.GAME_TITLES).sort(), Object.keys(games.GAMES).sort());
    for (const [name, g] of Object.entries(games.GAMES)) {
      assert.equal(g.kind, 'group', name);
      assert.ok(g.min >= 3 && g.max >= g.min && g.max <= games.ROLES.length, `${name}: players`);
      assert.ok(!interactions.INTERACTIONS[name], `${name}: clashes with a pair interaction`);
      for (const fn of ['place', 'tick']) assert.equal(typeof g[fn], 'function', `${name}.${fn}`);
      const cats = games.ROLES.slice(0, g.max).map((r) => ({ name: r, pos: { x: 1, z: 1 }, trait: 'calm' }));
      const states = [
        { found: new Set(), out: new Set(), base: cats.map((_, k) => ({ side: k % 2 ? 1 : -1 })), team: cats.map((_, k) => k % 2), stage: 'plan', center: { x: 0, z: 0 }, ball: { x: 0, z: 0 } },
        { found: new Set(cats), out: new Set(cats), over: true, winSide: 1, winTeam: 0, base: cats.map((_, k) => ({ side: k % 2 ? 1 : -1 })), team: cats.map((_, k) => k % 2), stage: 'feast', champion: cats[0], match: [cats[0], cats[1]], center: { x: 0, z: 0 }, ball: { x: 0, z: 0 } },
        { found: new Set(), out: new Set(), stage: 'steal', base: cats.map(() => ({ side: 1 })), team: cats.map(() => 0), center: { x: 0, z: 0 }, ball: { x: 0, z: 0 } },
        { found: new Set(), out: new Set(), stage: 'busted', base: cats.map(() => ({ side: 1 })), team: cats.map(() => 0), center: { x: 0, z: 0 }, ball: { x: 0, z: 0 } },
      ];
      for (const state of states) {
        const ix = { state, members: cats, ...Object.fromEntries(cats.map((c, k) => [games.ROLES[k], c])) };
        for (const role of games.ROLES.slice(0, g.max)) {
          const pose = interactions.forRole(g.pose, role);
          if (!pose) continue;
          for (const e of [0, 3, 7, 12]) {
            const p = typeof pose === 'function' ? pose(ix, e, {}, role) : pose;
            assert.ok(known.has(p), `${name}.${role}: unknown pose ${p}`);
          }
        }
      }
      for (const [, role] of g.script ?? []) assert.ok(games.ROLES.slice(0, g.min).includes(role), `${name}: script role ${role}`);
    }
  });

  it('special interactions fit the relationship they are for', async () => {
    const { interactions } = await scene();
    const all = Object.entries(interactions.INTERACTIONS);
    const friends = all.filter(([, s]) => s.rel === 'friend');
    const rivals = all.filter(([, s]) => s.rel === 'rival');
    assert.ok(friends.length >= 7 && rivals.length >= 7);
    for (const [name] of friends) assert.ok(interactions.RELATION_DELTA[name] > 0, name);
    for (const [name, s] of rivals) if (!s.delta) assert.ok(interactions.RELATION_DELTA[name] < 0, name);
    for (const [mood, list] of Object.entries(interactions.CONVERSATIONS)) {
      assert.ok(list.length >= 10, mood);
      for (const lines of list) assert.ok(lines.length >= 3 && lines.length <= 5, lines.join(' / '));
    }
    for (const [trait, taste] of Object.entries(interactions.TRAIT_TASTE)) {
      for (const name of Object.keys(taste)) assert.ok(interactions.INTERACTIONS[name], `${trait}: ${name}`);
    }
  });

  it('memes count for the achievements and props exist', async () => {
    const { activities } = await scene();
    const memes = Object.entries(activities.ACTIVITIES).filter(([, d]) => d.meme);
    assert.ok(memes.length >= 10);
    const counted = new Set(['memes', 'spins', 'cucumbers', 'freezes', 'duckDebug']);
    for (const [name, d] of memes) if (typeof d.meme === 'string') assert.ok(counted.has(d.meme), name);
    const office = fs.readFileSync(new URL('../src/scene/Office.js', import.meta.url), 'utf8');
    const used = fs.readFileSync(new URL('../src/scene/activities.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/scene/games.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/scene/interactions.js', import.meta.url), 'utf8');
    for (const [, kind] of used.matchAll(/spawnProp\(['"](\w+)['"]/g)) assert.ok(office.includes(`kind === '${kind}'`), `prop ${kind}`);
    for (const [, kind] of used.matchAll(/spawnProp\((\w+),/g)) assert.ok(['prop'].includes(kind), kind);
  });

  it('every sound the game plays exists', async () => {
    const { sound } = await scene();
    const names = new Set(sound.EFFECT_NAMES());
    const files = ['activities.js', 'interactions.js', 'games.js', 'events.js', 'Agent.js', 'World.js'].map((f) => fs.readFileSync(new URL(`../src/scene/${f}`, import.meta.url), 'utf8')).join('\n');
    for (const [, name] of files.matchAll(/sound\??\.play\(['"](\w+)['"]/g)) assert.ok(names.has(name), name);
    for (const [, name] of files.matchAll(/sound: ['"](\w+)['"]/g)) assert.ok(names.has(name), name);
  });

  it('time-of-day lines cover the week', async () => {
    const { activities } = await scene();
    const at = (d, h) => new Date(2030, 0, 6 + d, h);
    assert.ok(activities.timeLines(at(5, 16)).some((l) => l.includes('pátek')));
    assert.ok(activities.timeLines(at(1, 9)).some((l) => l.includes('pondělí')));
    assert.ok(activities.timeLines(at(3, 2)));
    assert.ok(activities.timeLines(at(6, 14)));
  });
});

describe('events, collection, music, seasons', () => {
  it('every event can start and end', async () => {
    const { events } = await scene();
    for (const [name, ev] of Object.entries(events.EVENTS)) {
      assert.ok(ev.weight > 0, name);
      for (const fn of ['start', 'tick', 'end']) assert.equal(typeof ev[fn], 'function', `${name}.${fn}`);
    }
  });

  it('every collectible can be found', async () => {
    const { activities } = await scene();
    const source = fs.readFileSync(new URL('../src/scene/events.js', import.meta.url), 'utf8');
    const fromEvents = new Set([...source.matchAll(/found\([^,]+,\s*'(\w+)'/g)].map((m) => m[1]));
    const fromFinds = new Set(Object.values(activities.FINDS).map(([id]) => id));
    for (const id of Object.keys(COLLECTIBLES)) assert.ok(fromEvents.has(id) || fromFinds.has(id), `${id} cannot be found`);
  });

  it('achievements have names, texts and rewards', () => {
    for (const [id, a] of Object.entries(ACHIEVEMENTS)) assert.ok(a.name && a.desc && a.reward > 0 && typeof a.check === 'function', id);
  });

  it('every music style makes a whole song', async () => {
    const music = await import('../src/scene/music.js');
    for (const style of [...music.STYLE_NAMES, 'auto']) {
      for (let seed = 1; seed <= 40; seed++) {
        const track = music.generateTrack(style, seed);
        const seconds = track.bars.reduce((s, b) => s + 16 * track.step * b.stretch, 0);
        assert.ok(seconds > 60 && seconds < 240, `${style}/${seed}: ${seconds} s`);
        assert.ok(['intro', 'A', 'B', 'outro'].every((name) => track.bars.some((b) => b.section === name)), `${style}: form`);
        for (const ch of Object.values(track.inst)) assert.ok(music.INSTRUMENT_NAMES.includes(ch), `${style}: ${ch}`);
        const events = track.bars.flatMap((b) => b.events);
        for (const ev of events) {
          assert.ok(ev.step >= 0 && ev.step < 16, `${style}: step`);
          if (ev.ch === 'drum') assert.ok(music.DRUM_NAMES.includes(ev.d), `${style}: drum ${ev.d}`);
          for (const n of [].concat(ev.n ?? [])) assert.ok(Number.isInteger(n) && n >= 30 && n <= 100, `${style}/${seed}: ${ev.ch} note ${n}`);
          if (ev.v != null) assert.ok(ev.v > 0 && ev.v <= 1, `${style}: velocity`);
        }
        assert.ok(events.filter((e) => e.ch === 'lead').length > 20, `${style}: melody`);
      }
    }
  });

  it('songs differ and the same seed gives the same song', async () => {
    const music = await import('../src/scene/music.js');
    assert.deepEqual(music.generateTrack('jazz', 5), music.generateTrack('jazz', 5));
    const songs = Array.from({ length: 30 }, (_, i) => music.generateTrack('lofi', i + 100));
    assert.ok(new Set(songs.map((t) => t.key)).size >= 6, 'keys');
    assert.ok(new Set(songs.map((t) => t.title)).size >= 20, 'titles');
    assert.ok(new Set(songs.map((t) => t.bars.map((b) => b.chord.symbol).join())).size >= 25, 'chords');
    assert.ok(new Set(songs.map((t) => t.inst.lead)).size >= 2, 'instruments');
  });

  it('long melody notes sit on the chord', async () => {
    const music = await import('../src/scene/music.js');
    for (const style of music.STYLE_NAMES) {
      let long = 0;
      let inChord = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const track = music.generateTrack(style, seed);
        for (const bar of track.bars) {
          if (bar.section === 'C') continue;
          const pcs = new Set(bar.chord.tones.map((t) => (track.tonic + bar.chord.root + t + bar.lift) % 12));
          for (const e of bar.events) {
            if (e.ch !== 'lead' || e.len < 4) continue;
            long++;
            if (pcs.has(e.n % 12)) inChord++;
          }
        }
      }
      assert.ok(inChord / long > 0.85, `${style}: ${inChord}/${long}`);
    }
  });

  it('every progression parses', async () => {
    const music = await import('../src/scene/music.js');
    assert.deepEqual(music.parseChord('ii7').tones, [0, 3, 7, 10]);
    assert.deepEqual(music.parseChord('V7').tones, [0, 4, 7, 10]);
    assert.equal(music.parseChord('bVII').root, 10);
    assert.equal(music.parseChord('#iv').root, 6);
    assert.throws(() => music.parseChord('X9'));
  });

  it('seasons fall on the right days', async () => {
    const { office } = await scene();
    const on = (y, m, d) => office.seasonFor(new Date(y, m - 1, d));
    assert.equal(on(2026, 4, 2), 'easter');
    assert.equal(on(2026, 4, 6), 'easter');
    assert.equal(on(2026, 4, 7), null);
    assert.equal(on(2025, 4, 20), 'easter');
    assert.equal(on(2026, 12, 24), 'christmas');
    assert.equal(on(2026, 10, 31), 'halloween');
    assert.equal(on(2026, 8, 8), 'catDay');
    assert.equal(on(2026, 6, 1), null);
  });
});
