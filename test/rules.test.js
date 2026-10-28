// Game rules shared by the server and the browser: placement, shop, needs,
// pampering, relationships, the collection and achievements.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GARDEN, ITEMS, THEMES, blocksPaths, layoutOf, placementProblem } from '../shared/catalog.js';
import {
  ACHIEVEMENTS,
  COLLECTIBLES,
  COSMETICS,
  GAME_STATS,
  PAMPER,
  RARE_FURS,
  RIVALS,
  TRAITS,
  applyRelation,
  chemistryDelta,
  driftRelations,
  newCatProfile,
  relationBase,
  relationKey,
  restoreNeeds,
  traitOf,
  updateNeeds,
} from '../shared/cats.js';
import { initialState, migrate, publicView, runAction, tick } from '../shared/office-rules.js';

const rich = () => {
  const s = initialState();
  s.coins = 1_000_000;
  return s;
};
const withCats = (...keys) => {
  const s = rich();
  for (const k of keys) s.cats[k] = newCatProfile();
  return s;
};
const ok = (r) => assert.equal(r.ok, true, r.error);
const fails = (r, msg) => {
  assert.equal(r.ok, false);
  if (msg) assert.equal(r.error, msg);
};

describe('saves', () => {
  it('fills in fields missing in older saves', () => {
    const old = { coins: 10, earned: 0, level: 0, items: [], cats: {}, stats: { maxCats: 2 } };
    migrate(old);
    assert.deepEqual(old.relations, {});
    assert.deepEqual(old.collection, {});
    assert.equal(old.garden, false);
    assert.equal(old.stats.maxCats, 2);
    assert.equal(old.stats.pets, 0);
    assert.deepEqual(old.achievements, {});
  });

  it('old relations that only ever grew start over from the chemistry', () => {
    const old = { coins: 10, earned: 0, level: 0, items: [], cats: { '/a': newCatProfile() }, stats: {}, relations: { '/a|/b': 100 } };
    migrate(old);
    assert.deepEqual(old.relations, {});
    assert.equal(old.relVersion, 2);
    old.relations['/a|/b'] = 50;
    migrate(old);
    assert.equal(old.relations['/a|/b'], 50);
  });

  it('public view carries everything the browser needs', () => {
    const v = publicView(initialState());
    for (const key of ['coins', 'size', 'garden', 'gardenPrice', 'items', 'cats', 'relations', 'collection', 'furs', 'achievements', 'stats']) assert.ok(key in v, key);
  });
});

describe('placement', () => {
  const room = layoutOf(10);
  const garden = layoutOf(10, true);

  it('keeps garden items outside and room items inside', () => {
    assert.equal(placementProblem([], { type: 'pond', x: 3, z: 3, rot: 0 }, room), 'Nejdřív kup zahradu');
    assert.equal(placementProblem([], { type: 'pond', x: 3, z: 3, rot: 0 }, garden), 'Patří na trávník v zahradě');
    assert.equal(placementProblem([], { type: 'pond', x: 3, z: 12, rot: 0 }, garden), null);
    assert.equal(placementProblem([], { type: 'desk', x: 3, z: 12, rot: 0 }, garden), 'Patří dovnitř');
    // The hedge row belongs to nobody.
    assert.equal(placementProblem([], { type: 'gnome', x: 5, z: 9, rot: 0 }, garden), 'Patří na trávník v zahradě');
    assert.equal(placementProblem([], { type: 'plant', x: 5, z: 10, rot: 0 }, garden), 'Patří dovnitř');
  });

  it('rejects items outside the lawn and in front of the door', () => {
    assert.equal(placementProblem([], { type: 'pond', x: 3, z: 15, rot: 0 }, garden), 'Mimo kancelář a zahradu');
    assert.equal(placementProblem([], { type: 'plant', x: 10, z: 3, rot: 0 }, room), 'Mimo místnost');
    assert.equal(placementProblem([], { type: 'plant', x: 8, z: 0, rot: 0 }, room), 'Blokuje dveře');
    assert.equal(placementProblem([], { type: 'rug', x: 7, z: 0, rot: 0 }, room), null);
  });

  it('notices when the garden door gets walled off', () => {
    assert.equal(GARDEN.gap.join(), '1,2');
    assert.equal(blocksPaths([], garden), false);
    // A pond right behind the gap cuts the lawn off; a bit further it doesn't.
    assert.equal(blocksPaths([{ type: 'pond', x: 1, z: 11, rot: 0 }], garden), true);
    assert.equal(blocksPaths([{ type: 'pond', x: 4, z: 12, rot: 0 }], garden), false);
  });

  it('the starting office leaves every tile reachable', () => {
    const s = initialState();
    assert.equal(blocksPaths(s.items, layoutOf(10)), false);
    for (const item of s.items) assert.equal(placementProblem(s.items, item, layoutOf(10), item.uid), null, item.type);
  });
});

describe('shop', () => {
  it('buys, moves, rotates and sells', () => {
    const s = rich();
    const coins = s.coins;
    ok(runAction(s, 'buy', { type: 'plant', x: 0, z: 9, rot: 0 }));
    assert.equal(s.coins, coins - ITEMS.plant.price);
    const uid = s.items.at(-1).uid;
    ok(runAction(s, 'move', { uid, x: 1, z: 9, rot: 1 }));
    assert.equal(s.items.at(-1).rot, 1);
    ok(runAction(s, 'sell', { uid }));
    assert.equal(s.coins, coins - ITEMS.plant.price + Math.floor(ITEMS.plant.price / 2));
  });

  it('buys the garden once and only with enough coins', () => {
    const poor = initialState();
    fails(runAction(poor, 'buyGarden', {}), 'Málo mincí');
    const s = rich();
    ok(runAction(s, 'buyGarden', {}));
    fails(runAction(s, 'buyGarden', {}), 'Zahradu už máš');
    ok(runAction(s, 'buy', { type: 'pond', x: 4, z: 12, rot: 0 }));
  });

  it('moves garden furniture out with the wall when the office grows', () => {
    const s = rich();
    ok(runAction(s, 'buyGarden', {}));
    ok(runAction(s, 'buy', { type: 'gnome', x: 4, z: 12, rot: 0 }));
    ok(runAction(s, 'buy', { type: 'plant', x: 0, z: 9, rot: 0 }));
    ok(runAction(s, 'expand', {}));
    assert.equal(s.items.find((i) => i.type === 'gnome').z, 15);
    assert.equal(s.items.find((i) => i.type === 'plant').z, 9);
  });

  it('ignores unknown and inherited action names', () => {
    const s = rich();
    for (const name of ['nope', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) fails(runAction(s, name, {}), 'Neznámá akce');
  });
});

describe('needs', () => {
  it('work drains, idling only trickles back while someone watches', () => {
    const cat = newCatProfile();
    updateNeeds(cat, true, [], 600);
    const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
    assert.deepEqual(round(cat.needs), { food: 50, energy: 35, fun: 62 });
    const before = { ...cat.needs };
    updateNeeds(cat, false, [{ type: 'bowls' }], 60);
    assert.ok(cat.needs.food < before.food);
  });

  it('refills idle cats from furniture when nobody watches', () => {
    const cat = newCatProfile();
    cat.needs = { food: 10, energy: 10, fun: 10 };
    updateNeeds(cat, false, [{ type: 'bowls' }, { type: 'bed' }, { type: 'yarn' }], 600, false);
    assert.ok(cat.needs.food > 40 && cat.needs.energy > 40 && cat.needs.fun > 10);
  });

  it('restoring caps at 100 and ignores nonsense', () => {
    const cat = newCatProfile();
    restoreNeeds(cat, { food: 500, energy: -20, fun: 'x', bogus: 5 });
    assert.deepEqual(cat.needs, { food: 100, energy: 80, fun: 80 });
  });
});

describe('the player and the cats', () => {
  it('petting is free, a treat costs coins', () => {
    const s = withCats('/a');
    const coins = s.coins;
    s.cats['/a'].needs.fun = 50;
    ok(runAction(s, 'pamper', { cat: '/a', kind: 'pet' }));
    assert.equal(s.cats['/a'].needs.fun, 50 + PAMPER.pet.gains.fun);
    assert.equal(s.coins, coins);
    ok(runAction(s, 'pamper', { cat: '/a', kind: 'treat' }));
    assert.equal(s.coins, coins - PAMPER.treat.price);
    assert.equal(s.stats.pets, 1);
    assert.equal(s.stats.treats, 1);
    fails(runAction(s, 'pamper', { cat: '/nobody', kind: 'pet' }));
    fails(runAction(s, 'pamper', { cat: '/a', kind: 'kick' }));
    s.coins = 3;
    fails(runAction(s, 'pamper', { cat: '/a', kind: 'treat' }), 'Málo mincí');
  });

  it('relationships are symmetric, clamped and get harder to push to the extremes', () => {
    const s = withCats('/a', '/b');
    const key = relationKey('/a', '/b');
    assert.equal(key, relationKey('/b', '/a'));
    const base = relationBase('/a', '/b');
    ok(runAction(s, 'relate', { changes: [{ a: '/b', b: '/a', delta: 999 }] }));
    assert.ok(s.relations[key] > base && s.relations[key] <= base + 30);
    let prev = s.relations[key];
    let lastStep = Infinity;
    for (let k = 0; k < 40; k++) {
      ok(runAction(s, 'relate', { changes: [{ a: '/a', b: '/b', delta: 10 }] }));
      const step = s.relations[key] - prev;
      assert.ok(step > 0 && step <= lastStep + 1e-9, 'smaller and smaller steps');
      lastStep = step;
      prev = s.relations[key];
    }
    assert.ok(s.relations[key] > 90 && s.relations[key] < 100);
    // Bad things count fully again from up there.
    assert.equal(applyRelation(90, -10), 80);
    assert.equal(applyRelation(-90, 10), -80);
    assert.ok(applyRelation(-90, -10) > -100);
    ok(runAction(s, 'relate', { changes: [{ a: '/a', b: '/a', delta: 5 }, { a: '/a', b: '/x', delta: 5 }, { a: '/a', b: '/b', delta: 'NaN' }] }));
    assert.equal(Object.keys(s.relations).length, 1);
    fails(runAction(s, 'relate', { changes: 'nope' }));
  });

  it('every pair has its own chemistry, and about a third of them are no friends', () => {
    const keys = Array.from({ length: 30 }, (_, i) => `/Users/someone/project-${i}`);
    let negative = 0;
    let pairs = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const v = relationBase(keys[i], keys[j]);
        assert.equal(v, relationBase(keys[j], keys[i]));
        assert.ok(v >= -70 && v <= 70);
        pairs++;
        if (v < 0) negative++;
      }
    }
    assert.ok(negative / pairs > 0.25 && negative / pairs < 0.55, String(negative / pairs));
    assert.ok(new Set(keys.map(traitOf)).size >= 6);
    for (const k of keys) assert.ok(TRAITS[traitOf(k)]);
  });

  it('bad chemistry shrugs off nice things and takes nasty ones to heart', () => {
    const keys = Array.from({ length: 30 }, (_, i) => `/p/${i}`);
    const pairs = keys.flatMap((a, i) => keys.slice(i + 1).map((b) => [a, b]));
    const [ca, cb] = pairs.find(([a, b]) => relationBase(a, b) < 0);
    assert.ok(chemistryDelta(ca, cb, 10) < 10);
    assert.ok(chemistryDelta(ca, cb, -10) < -10);
    const [ga, gb] = pairs.find(([a, b]) => relationBase(a, b) > 25);
    assert.ok(chemistryDelta(ga, gb, 10) > 10);
    assert.ok(chemistryDelta(ga, gb, -10) > -10);
    // Making up counts in full even for cats who don't click.
    const s = withCats(ca, cb);
    const before = relationBase(ca, cb);
    ok(runAction(s, 'relate', { changes: [{ a: ca, b: cb, delta: 28 }] }));
    assert.ok(s.relations[relationKey(ca, cb)] - before > 20);
  });

  it('feelings drift back to the chemistry', () => {
    const base = relationBase('/a', '/b');
    const relations = { [relationKey('/a', '/b')]: 100 };
    driftRelations(relations, 2700);
    const after45min = relations[relationKey('/a', '/b')];
    assert.ok(after45min < 100 && after45min > base);
    assert.ok(Math.abs(after45min - base - (100 - base) / 2) < 6, 'about half way in 45 minutes');
    driftRelations(relations, 36_000);
    assert.ok(Math.abs(relations[relationKey('/a', '/b')] - base) < 1);
  });

  it('records games and wins, but only known counters', () => {
    const s = withCats('/a');
    ok(runAction(s, 'record', { stats: { games: 2, chessWins: 1, coins: 999, toString: 1, memes: 999 }, wins: { '/a': 3, '/nobody': 2 } }));
    assert.equal(s.stats.games, 2);
    assert.equal(s.stats.chessWins, 1);
    assert.equal(s.stats.memes, 10, 'at most 10 at once');
    assert.equal(s.stats.coins, undefined);
    assert.equal(s.cats['/a'].wins, 3);
    assert.equal(publicView(s).cats['/a'].wins, 3);
    for (const name of GAME_STATS) assert.equal(typeof s.stats[name], 'number', name);
  });

  it('collects only known things', () => {
    const s = rich();
    ok(runAction(s, 'collect', { id: 'mouse' }));
    ok(runAction(s, 'collect', { id: 'mouse' }));
    assert.equal(s.collection.mouse, 2);
    for (const id of ['nope', '__proto__', 'toString', 'constructor']) fails(runAction(s, 'collect', { id }), 'Neznámá věc');
  });

  it('rare furs need to be unlocked first', () => {
    const s = withCats('/a');
    fails(runAction(s, 'setFur', { cat: '/a', fur: 'gold' }), 'Srst ještě není odemčená');
    fails(runAction(s, 'setFur', { cat: '/a', fur: 'toString' }), 'Neznámá srst');
    ok(runAction(s, 'collect', { id: 'goldenYarn' }));
    assert.deepEqual(publicView(s).furs, ['gold']);
    ok(runAction(s, 'setFur', { cat: '/a', fur: 'gold' }));
    assert.equal(s.cats['/a'].fur, 'gold');
    ok(runAction(s, 'setFur', { cat: '/a', fur: null }));
    assert.equal(s.cats['/a'].fur, null);
  });
});

describe('context', () => {
  it('remembers the fullest context and counts new compactions once', () => {
    const s = initialState();
    const later = Date.now() + 1000;
    const session = { id: 'x', cwd: '/a', status: 'idle', context: { tokens: 800_000, window: 1e6, fill: 0.8 }, compacts: [{ id: 'c1', ts: later, before: 9e5, after: 1e4 }, { id: 'old', ts: 0, before: 1, after: 0 }] };
    tick(s, [session], 1);
    tick(s, [session], 1);
    assert.equal(s.stats.maxFill, 0.8);
    assert.equal(s.stats.compacts, 1);
    assert.ok(s.achievements.chonk);
  });
});

describe('earning and achievements', () => {
  it('pays working cats and kittens', () => {
    const s = initialState();
    const coins = s.coins;
    tick(s, [{ id: 'x', cwd: '/a', status: 'busy', subagents: [{}, {}] }], 10);
    // About 80 % mood gives x1.3 for the cat, kittens at a flat rate; plus the first achievement.
    const rewards = Object.keys(s.achievements).reduce((sum, id) => sum + ACHIEVEMENTS[id].reward, 0);
    assert.ok(Math.abs(s.coins - coins - rewards - (0.1 * 1.3 + 2 * 0.05) * 10) < 0.05, String(s.coins - coins - rewards));
    assert.equal(s.cats['/a'].xp, 10);
  });

  it('pays every achievement once', () => {
    const s = initialState();
    tick(s, [{ id: 'x', cwd: '/a', status: 'idle' }], 1);
    const coins = s.coins;
    assert.ok(s.achievements.firstCat);
    tick(s, [{ id: 'x', cwd: '/a', status: 'idle' }], 1);
    assert.equal(s.coins, coins);
  });

  it('nothing but the basics is unlocked at the start', () => {
    const s = initialState();
    for (const [id, a] of Object.entries(ACHIEVEMENTS)) assert.equal(a.check(s), false, id);
    for (const [id, f] of Object.entries(RARE_FURS)) assert.equal(f.check(s), false, id);
  });

  it('notices Friday deploys, midnight commits, Monday failures and quick fixes', () => {
    const s = initialState();
    const at = (d, h, m = 0) => new Date(2030, 0, 6 + d, h, m).getTime(); // 6 Jan 2030 is a Sunday
    const session = {
      id: 'x', cwd: '/a', status: 'idle',
      results: [
        { id: 'r1', kind: 'push', ts: at(5, 16) },
        { id: 'r2', kind: 'commit', ts: at(2, 1) },
        { id: 'r3', kind: 'testsFail', ts: at(1, 9) },
        { id: 'r4', kind: 'testsPass', ts: at(1, 9, 5) },
        { id: 'r5', kind: 'deploy', ts: at(3, 16) },
      ],
    };
    tick(s, [session], 1);
    assert.equal(s.stats.fridayPush, 1);
    assert.equal(s.stats.nightCommits, 1);
    assert.equal(s.stats.mondayFail, 1);
    assert.equal(s.stats.fixedTests, 1);
    assert.equal(s.stats.deploys, 1);
    for (const id of ['fridayDeploy', 'midnightHacker', 'mondayBlues', 'worksOnMyMachine']) assert.ok(s.achievements[id], id);
  });

  it('office looks are bought once, then switched freely', () => {
    const s = rich();
    assert.equal(s.theme, 'classic');
    fails(runAction(s, 'setTheme', { id: 'space' }), 'Tenhle vzhled ještě nemáš');
    fails(runAction(s, 'buyTheme', { id: 'toString' }), 'Neznámý vzhled');
    const coins = s.coins;
    ok(runAction(s, 'buyTheme', { id: 'space' }));
    assert.equal(s.coins, coins - THEMES.space.price);
    assert.equal(s.theme, 'space');
    fails(runAction(s, 'buyTheme', { id: 'space' }), 'Tenhle vzhled už máš');
    ok(runAction(s, 'setTheme', { id: 'classic' }));
    ok(runAction(s, 'setTheme', { id: 'space' }));
    assert.equal(s.coins, coins - THEMES.space.price, 'switching is free');
    assert.deepEqual(publicView(s).themes, ['classic', 'space']);
    s.coins = 10;
    fails(runAction(s, 'buyTheme', { id: 'cyber' }), 'Málo mincí');
    // Old saves get the default look; a look that no longer exists falls back to it.
    const old = { coins: 10, items: [], cats: {}, stats: {}, theme: 'gone' };
    migrate(old);
    assert.equal(old.theme, 'classic');
    assert.deepEqual(old.themes, ['classic']);
  });

  it('secret achievements are marked', () => {
    const secret = Object.values(ACHIEVEMENTS).filter((a) => a.secret);
    assert.ok(secret.length >= 5);
  });

  it('every achievement and rare fur can be reached', () => {
    const s = rich();
    s.level = 2;
    s.garden = true;
    s.earned = 1e6;
    s.stats = { maxCats: 19, maxKittens: 9, nightWork: 99999, commits: 9999, pushes: 99, merges: 99, testsPass: 999, testsFail: 99, errors: 9, pets: 999, treats: 99, compacts: 99, maxFill: 0.99 };
    for (const name of [...GAME_STATS, 'fridayPush', 'nightCommits', 'fixedTests', 'mondayFail', 'deploys', 'builds', 'buildFails', 'installs', 'lints', 'reverts', 'slows']) s.stats[name] = 999;
    s.items = Object.keys(ITEMS).flatMap((type) => [type, type]).map((type, k) => ({ type, x: 0, z: 0, rot: 0, uid: String(k) }));
    const furs = ['ghost', 'galaxy', 'neon', 'gold', 'silver'];
    for (let k = 0; k < 5; k++) {
      s.cats[`/c${k}`] = { ...newCatProfile(), xp: 1e9, earned: 5000, wins: 30, needs: { food: 100, energy: 100, fun: 100 }, owned: Object.keys(COSMETICS), wear: { head: 'crown', eyes: 'monocle', neck: 'scarf' }, fur: furs[k] };
    }
    s.themes = Object.keys(THEMES);
    s.collection = Object.fromEntries(Object.keys(COLLECTIBLES).map((id) => [id, 30]));
    s.achievements = Object.fromEntries(Array.from({ length: 120 }, (_, k) => [`x${k}`, 1]));
    // Some achievements rule each other out (peace vs. drama, one look at a time).
    const friendly = { [relationKey('/c0', '/c1')]: 95, [relationKey('/c0', '/c2')]: 50, [relationKey('/c0', '/c3')]: 45, [relationKey('/c1', '/c2')]: 60, [relationKey('/c1', '/c3')]: 60, [relationKey('/c2', '/c3')]: 60 };
    const stormy = { ...friendly, 'a|b': -90, 'c|d': RIVALS, 'e|f': -50 };
    const reachable = (check) =>
      Object.keys(THEMES).some((theme) =>
        [friendly, stormy].some((relations) => {
          s.theme = theme;
          s.relations = relations;
          return check(s);
        }),
      );
    for (const [id, a] of Object.entries(ACHIEVEMENTS)) assert.ok(reachable(a.check), id);
    for (const [id, f] of Object.entries(RARE_FURS)) assert.ok(reachable(f.check), id);
  });
});
