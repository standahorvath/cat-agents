// Games for three or more cats: hide and seek, tag, tug of war, football, a
// heist on the food bowls and a little tournament. They run as interactions of
// kind 'group' (see interactions.js for the fields): every member gets a role
// a, b, c, ... and `pose.all` / `heading.all` answer for all of them.
//
// Extra fields:
//   min, max   how many cats play
//   ok(world)  whether the game fits the office right now
//   ix.winners cats that get a win on the leaderboard

import { pick, rnd } from './activities.js';

const PI = Math.PI;
export const ROLES = ['a', 'b', 'c', 'd', 'e', 'f'];

const members = (ix) => ix.members;
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const face = (cat, p) => Math.atan2(p.x - cat.pos.x, p.z - cat.pos.z);
const say = (cat, lines, ms = 0) => setTimeout(() => !cat.gone && cat.caption(pick(lines)), ms);
const tile = (nav, x, z) => {
  const [i, j] = nav.nearestFree(...nav.tileOf(x, z));
  return { x: i + 0.5, z: j + 0.5 };
};

// The area to play in: the garden in good weather, otherwise the room.
const pitch = (office) => (office.garden && office.outdoorOk && Math.random() < 0.6 ? office.areas.garden : office.areas.room);

// Places around a free point in a ring, all facing the middle.
function ring(w, ix, radius) {
  const nav = w.office.nav;
  for (let attempt = 0; attempt < 8; attempt++) {
    const [ci, cj] = nav.randomFree(Math.random, w.office.areas.lounge);
    const c = { x: ci + 0.5, z: cj + 0.5 };
    const n = ix.members.length;
    const spots = ix.members.map((_, k) => {
      const ang = (k / n) * PI * 2 + 0.4;
      return { x: c.x + Math.sin(ang) * radius, z: c.z + Math.cos(ang) * radius };
    });
    if (spots.every((p) => nav.free(...nav.tileOf(p.x, p.z)))) {
      ix.state.center = c;
      return Object.fromEntries(spots.map((p, k) => [ROLES[k], { ...p, heading: face({ pos: p }, c) }]));
    }
  }
  return null;
}

export const GAMES = {
  // One counts with its paws over its eyes, the others hide, then it goes looking.
  hideAndSeek: {
    kind: 'group',
    game: true,
    min: 3,
    max: 5,
    weight: 2,
    gait: 'run',
    stat: 'hideSeek',
    dur: [40, 40],
    place(w, ix) {
      const nav = w.office.nav;
      const seeker = ix.a;
      const targets = { a: { x: seeker.pos.x, z: seeker.pos.z, heading: 'camera' } };
      ix.members.slice(1).forEach((cat, k) => {
        let best = null;
        for (let n = 0; n < 12; n++) {
          const [i, j] = nav.randomFree(Math.random, w.office.areas.room);
          const p = { x: i + 0.5, z: j + 0.5 };
          if (!best || dist(p, seeker.pos) > dist(best, seeker.pos)) best = p;
        }
        targets[ROLES[k + 1]] = best;
      });
      return targets;
    },
    start(ix) {
      ix.state.queue = [...ix.members.slice(1)].sort(() => Math.random() - 0.5);
      ix.state.found = new Set();
      ix.state.count = 0;
    },
    pose: {
      all(ix, e, w, role) {
        const cat = ix[role];
        if (role === 'a') return e < 6 ? 'peek' : ix.state.over ? 'celebrate' : 'sniff';
        if (ix.state.found.has(cat)) return ix.state.last === cat && ix.state.over ? 'cheer' : 'sit';
        return 'crouch';
      },
    },
    heading: { a: (ix, e) => (e < 6 ? 'camera' : null) },
    bubble: { all: (ix, e, w, role) => (role !== 'a' && ix.state.target === ix[role] ? '!' : null) },
    tick(ix, t) {
      const seeker = ix.a;
      const e = ix.elapsed;
      if (e < 6) {
        const n = Math.floor(e / 1.1);
        if (n > ix.state.count - 1 && n < 5) {
          ix.state.count = n + 1;
          seeker.caption(`${n + 1}…`);
        }
        return;
      }
      if (!ix.state.go) {
        ix.state.go = true;
        seeker.caption(pick(['kdo není schovaný, hoří!', 'jdu hledat!', 'připravte se!']));
      }
      if (ix.state.over) return;
      const target = ix.state.target;
      if (!target) {
        const next = ix.state.queue.shift();
        if (!next) {
          ix.state.over = true;
          ix.winners = [ix.state.last];
          say(ix.state.last, ['jsem [mistr|mistryně] schovávané!', 'mě nikdo nenajde!', 'poslední!'], 300);
          ix.until = t + 3;
          return;
        }
        ix.state.target = next;
        seeker.goTo(next.pos.x, next.pos.z, { gait: 'trot' });
        return;
      }
      if (!seeker.moving || dist(seeker.pos, target.pos) < 0.6) {
        seeker.stop();
        ix.state.found.add(target);
        ix.state.last = target;
        ix.state.target = null;
        seeker.caption(pick(['našel jsem tě!', 'mám tě!', 'tady jsi!', 'vidím ocas!']));
        if (ix.state.queue.length) say(target, ['sakra!', 'jak jsi mě <našel|našla>?', 'to byl ocas, že jo', 'příště líp'], 700);
      }
    },
  },

  // Tag: whoever is "it" chases the nearest cat; the others scatter.
  tag: {
    kind: 'group',
    game: true,
    min: 3,
    max: 5,
    weight: 2,
    dur: [18, 22],
    place: (w, ix) => ring(w, ix, 0.8),
    start(ix) {
      ix.state.it = pick(ix.members);
      ix.state.frozenUntil = 0;
      ix.state.it.caption(pick(['já honím!', 'baba je na mně!', 'utíkejte!']));
    },
    pose: { all: (ix, e, w, role) => (ix.state.over ? (ix.state.it === ix[role] ? 'facepalm' : 'cheer') : ix.state.it === ix[role] ? 'crouch' : 'stand') },
    bubble: { all: (ix, e, w, role) => (ix.state.it === ix[role] && !ix.state.over ? '!' : null) },
    tick(ix, t) {
      if (ix.state.over) return;
      const it = ix.state.it;
      const others = members(ix).filter((c) => c !== it);
      if (t > ix.until - 2.5) {
        ix.state.over = true;
        for (const c of members(ix)) c.stop();
        ix.winners = others;
        it.caption(pick(['příště vyhraju', 'to nebylo fér', 'jsem [unavený|unavená]']));
        return;
      }
      for (const c of others) {
        if (c.moving && t < (c.fleeUntil ?? 0)) continue;
        // Run somewhere away from whoever is it.
        let best = null;
        for (let n = 0; n < 4; n++) {
          const p = c.randomPoint('room');
          if (!best || dist(p, it.pos) > dist(best, it.pos)) best = p;
        }
        c.fleeUntil = t + rnd(1.5, 3);
        c.goTo(best.x, best.z, { run: true });
      }
      if (t < ix.state.frozenUntil) return;
      const prey = others.sort((p, q) => dist(p.pos, it.pos) - dist(q.pos, it.pos))[0];
      if (t > (ix.state.repath ?? 0)) {
        ix.state.repath = t + 0.35;
        it.goTo(prey.pos.x, prey.pos.z, { run: true });
      }
      if (dist(prey.pos, it.pos) < 0.42) {
        it.caption(pick(['baba!', 'máš to!', '[chytil|chytila] jsem tě!']));
        prey.caption(pick(['nééé!', 'sakra!', 'to se nepočítá!']));
        it.fleeUntil = 0;
        ix.state.it = prey;
        ix.state.frozenUntil = t + 1.2;
        prey.stop();
      }
    },
  },

  // Two teams on a rope; the stronger (or luckier) side drags the other over.
  tugOfWar: {
    kind: 'group',
    game: true,
    min: 3,
    max: 4,
    weight: 1.5,
    dur: [11, 13],
    place(w, ix) {
      const nav = w.office.nav;
      const n = ix.members.length;
      const left = Math.ceil(n / 2);
      for (let attempt = 0; attempt < 10; attempt++) {
        const [ci, cj] = nav.randomFree(Math.random, w.office.areas.lounge);
        const c = { x: ci + 0.5, z: cj + 0.5 };
        const axis = Math.random() < 0.5 ? { x: 1, z: 0 } : { x: 0, z: 1 };
        const spots = ix.members.map((_, k) => {
          const side = k < left ? -1 : 1;
          const rank = k < left ? k : k - left;
          const d = side * (0.6 + rank * 0.65);
          return { x: c.x + axis.x * d, z: c.z + axis.z * d, side };
        });
        if (spots.every((p) => nav.free(...nav.tileOf(p.x, p.z)))) {
          ix.state.center = c;
          ix.state.axis = axis;
          ix.state.base = spots;
          ix.state.length = 2 * (0.6 + (left - 1) * 0.65) + 0.5;
          return Object.fromEntries(spots.map((p, k) => [ROLES[k], { x: p.x, z: p.z, heading: face({ pos: p }, c) }]));
        }
      }
      return null;
    },
    start(ix, w) {
      const { center: c, axis } = ix.state;
      ix.state.rope = w.office.spawnProp('rope', c.x, c.z, { rot: axis.x ? 0 : PI / 2, length: ix.state.length });
      ix.state.shift = 0;
      // A bigger team pulls harder, but luck decides a lot.
      const n = ix.members.length;
      ix.state.bias = (n - Math.ceil(n / 2) - Math.ceil(n / 2)) * 0.06 + rnd(-0.12, 0.12);
      say(ix.a, ['tááhni!', 'hej rup!', 'na tři!']);
    },
    pose: {
      all(ix, e, w, role) {
        if (!ix.state.over) return 'pull';
        const k = ROLES.indexOf(role);
        return ix.state.base[k].side === ix.state.winSide ? 'cheer' : 'lieSide';
      },
    },
    heading: { all: (ix, e, w, role) => face(ix[role], ix.state.center) },
    tick(ix, t, dt, w) {
      const st = ix.state;
      if (st.over) return;
      st.shift += (st.bias + Math.sin(t * 2.3) * 0.25 + rnd(-0.2, 0.2)) * dt * 0.45;
      if (Math.random() < dt * 0.8) say(pick(ix.members), ['táhni!', 'hej rup!', 'ještě!', 'nepouštět!', 'uf!']);
      const { axis, center } = st;
      ix.members.forEach((cat, k) => {
        const b = st.base[k];
        cat.pos.set(b.x + axis.x * st.shift, 0, b.z + axis.z * st.shift);
      });
      st.rope.position.set(center.x + axis.x * st.shift, 0, center.z + axis.z * st.shift);
      if (Math.abs(st.shift) > 0.4 || t > ix.until - 2.5) {
        st.over = true;
        st.winSide = st.shift < 0 ? -1 : 1;
        ix.winners = ix.members.filter((_, k) => st.base[k].side === st.winSide);
        w.sound.play('whistle');
        for (const cat of ix.winners) say(cat, ['vyhráli jsme!', 'síla!', 'jsme silnější!'], rnd(0, 600));
        ix.until = t + 2.5;
      }
    },
    finish(ix, w) {
      w.office.removeMesh(ix.state.rope);
    },
  },

  // Two teams kick a ball into each other's goal.
  football: {
    kind: 'group',
    game: true,
    min: 4,
    max: 6,
    weight: 1.5,
    ok: (w) => w.office.W >= 6,
    dur: [30, 34],
    place(w, ix) {
      const area = pitch(w.office);
      const nav = w.office.nav;
      const field = { x0: area.i0 + 0.6, x1: area.i1 - 0.6, z0: area.j0 + 0.6, z1: area.j1 - 0.6 };
      field.mx = (field.x0 + field.x1) / 2;
      field.mz = (field.z0 + field.z1) / 2;
      ix.state.field = field;
      ix.state.area = area;
      const half = Math.ceil(ix.members.length / 2);
      ix.state.team = ix.members.map((_, k) => (k < half ? 0 : 1));
      return Object.fromEntries(
        ix.members.map((_, k) => {
          const team = ix.state.team[k];
          const rank = team ? k - half : k;
          const x = team ? field.mx + 1 + (rank % 2) * 0.8 : field.mx - 1 - (rank % 2) * 0.8;
          const z = field.mz + (rank - 1) * 0.9;
          return [ROLES[k], tile(nav, x, z)];
        }),
      );
    },
    start(ix, w) {
      const f = ix.state.field;
      ix.state.ball = { x: f.mx, z: f.mz, vx: 0, vz: 0, mesh: w.office.spawnProp('ball', f.mx, f.mz) };
      ix.state.goals = [w.office.spawnProp('goal', f.x0, f.mz, { rot: 0 }), w.office.spawnProp('goal', f.x1, f.mz, { rot: PI })];
      ix.state.score = [0, 0];
      w.sound.play('whistle');
      say(ix.a, ['výkop!', 'hrajeme!', 'levá proti pravé!']);
    },
    pose: {
      all(ix, e, w, role) {
        const k = ROLES.indexOf(role);
        if (ix.state.over) return ix.state.winTeam == null ? 'sit' : ix.state.team[k] === ix.state.winTeam ? 'celebrate' : 'facepalm';
        return ix.state.celebrating === ix[role] ? 'celebrate' : 'crouch';
      },
    },
    heading: { all: (ix, e, w, role) => face(ix[role], ix.state.ball) },
    tick(ix, t, dt, w) {
      const st = ix.state;
      const f = st.field;
      const ball = st.ball;
      const nav = w.office.nav;
      if (st.over) return;
      // Ball physics: roll, slow down, bounce off the edges and furniture.
      ball.x += ball.vx * dt;
      ball.z += ball.vz * dt;
      if (ball.z < f.z0 || ball.z > f.z1 || !nav.free(...nav.tileOf(ball.x, ball.z))) {
        ball.x -= ball.vx * dt;
        ball.z -= ball.vz * dt;
        ball.vz *= -0.7;
        ball.vx *= 0.8;
      }
      const fr = Math.exp(-dt * 1.4);
      ball.vx *= fr;
      ball.vz *= fr;
      ball.mesh.position.set(ball.x, 0, ball.z);
      ball.mesh.children[0].rotation.x += ball.vz * dt * 10;
      ball.mesh.children[0].rotation.z -= ball.vx * dt * 10;

      // Goal at either end.
      if (!st.resetAt && (ball.x < f.x0 + 0.1 || ball.x > f.x1 - 0.1)) {
        const scorerTeam = ball.x < f.mx ? 1 : 0;
        if (Math.abs(ball.z - f.mz) < 1.1) {
          st.score[scorerTeam] += 1;
          const scorer = st.lastKick && st.team[ix.members.indexOf(st.lastKick)] === scorerTeam ? st.lastKick : ix.members.find((_, k) => st.team[k] === scorerTeam);
          scorer.caption(`GÓÓÓL! ${st.score[0]}:${st.score[1]}`);
          st.celebrating = scorer;
          w.sound.play('whistle');
          for (let n = 0; n < 20; n++) w.office.spawnParticle('confetti', ball.x, 0.4, ball.z);
          w.addStat?.('goals');
        }
        st.resetAt = t + 1.6;
        ball.vx = 0;
        ball.vz = 0;
      }
      if (st.resetAt && t > st.resetAt) {
        st.resetAt = null;
        st.celebrating = null;
        ball.x = f.mx;
        ball.z = f.mz;
      }
      ball.x = Math.max(f.x0, Math.min(f.x1, ball.x));

      if (t > ix.until - 3) {
        st.over = true;
        w.sound.play('whistle');
        const [s0, s1] = st.score;
        st.winTeam = s0 === s1 ? null : s0 > s1 ? 0 : 1;
        ix.winners = st.winTeam == null ? [] : ix.members.filter((_, k) => st.team[k] === st.winTeam);
        for (const c of ix.members) c.stop();
        say(ix.a, st.winTeam == null ? [`remíza ${s0}:${s1}`, 'nerozhodně!'] : [`konec! ${s0}:${s1}`, 'hvizd! konec zápasu']);
        return;
      }
      if (st.resetAt) return;

      // The closest player of each team goes for the ball; the rest keep their places.
      for (const team of [0, 1]) {
        const players = ix.members.filter((_, k) => st.team[k] === team);
        const chaser = players.sort((p, q) => dist(p.pos, ball) - dist(q.pos, ball))[0];
        const goalX = team ? f.x0 : f.x1;
        for (const p of players) {
          if (p === chaser) {
            if (dist(p.pos, ball) < 0.38 && t > (p.kickAt ?? 0)) {
              p.kickAt = t + 0.8;
              const dx = goalX - ball.x;
              const dz = f.mz + rnd(-0.8, 0.8) - ball.z;
              const len = Math.hypot(dx, dz) || 1;
              const power = rnd(2.2, 3.4);
              ball.vx = (dx / len) * power;
              ball.vz = (dz / len) * power;
              st.lastKick = p;
              if (Math.random() < 0.15) p.caption(pick(['střela!', 'pac!', 'přihrávka!', 'na bránu!']));
            } else if (t > (p.repath ?? 0)) {
              p.repath = t + 0.3;
              // Come at the ball from behind, facing the goal.
              const back = team ? 0.25 : -0.25;
              p.goTo(ball.x + back, ball.z, { run: true });
            }
          } else if (!p.moving && t > (p.repath ?? 0)) {
            p.repath = t + rnd(1, 2);
            const homeX = team ? f.mx + rnd(0.5, 2) : f.mx - rnd(0.5, 2);
            const spot = tile(nav, homeX, f.mz + rnd(-1.2, 1.2));
            p.goTo(spot.x, spot.z, { gait: 'trot' });
          }
        }
      }
    },
    finish(ix, w) {
      w.office.removeMesh(ix.state.ball?.mesh);
      for (const g of ix.state.goals ?? []) w.office.removeMesh(g);
    },
  },

  // Three cats rob the food bowls: one keeps watch, one makes a scene, one steals.
  heist: {
    kind: 'group',
    game: true,
    min: 3,
    max: 3,
    weight: 1.2,
    ok: (w) => w.office.has('food'),
    // Ends when the loot is eaten or the boss shows up (each sets ix.until).
    dur: [60, 60],
    place(w, ix) {
      const office = w.office;
      const food = office.spotsOf('food')[0];
      const door = office.spotsOf('door')[0];
      const nav = office.nav;
      let hideout = null;
      for (let n = 0; n < 10; n++) {
        const p = ix.c.randomPoint('room');
        if (!hideout || dist(p, food) > dist(hideout, food)) hideout = p;
      }
      ix.state.food = food;
      ix.state.hideout = hideout;
      return {
        a: { ...tile(nav, door.x, door.z + 1.2), heading: 'camera' },
        b: { ...tile(nav, office.W / 2, office.D / 2), heading: 'camera' },
        c: hideout,
      };
    },
    start(ix) {
      ix.state.caught = Math.random() < 0.25;
      ix.state.stage = 'plan';
    },
    pose: {
      a: (ix) => (ix.state.stage === 'feast' ? 'drink' : ix.state.stage === 'busted' ? 'alert' : 'stare'),
      b: (ix) => (ix.state.stage === 'feast' ? 'drink' : ix.state.stage === 'plan' ? 'sit' : ix.state.stage === 'busted' ? 'alert' : 'crab'),
      c: (ix) => (ix.state.stage === 'feast' ? 'drink' : ix.state.stage === 'steal' ? 'fiddle' : ix.state.stage === 'busted' ? 'alert' : 'crouch'),
    },
    heading: { c: (ix) => (ix.state.stage === 'steal' ? face(ix.c, ix.state.food) : null) },
    bubble: { a: (ix) => (ix.state.stage === 'busted' ? '!' : null), b: (ix) => (ix.state.stage === 'distract' ? 'note' : null) },
    script: [
      [0.3, 'c', ['plán je jasný', 'dneska to vyjde', 'na pozice']],
      [1.6, 'a', ['hlídám dveře', 'vzduch je čistý', 'oči na stopkách']],
      [2.9, 'b', ['já odvedu pozornost', 'jdu na to', 'divadlo začíná']],
    ],
    tick(ix, t, dt, w) {
      const st = ix.state;
      const { a, b, c } = ix;
      if (st.stage === 'plan' && ix.elapsed > 4) {
        st.stage = 'distract';
        b.caption(pick(['MŇAU! koukejte sem!', 'hele, ptáček!', 'tancuju!', 'kdo chce vidět trik?']));
        c.goTo(st.food.x + 0.35, st.food.z + 0.35, { gait: 'sneak' });
      }
      if (st.stage === 'distract') {
        if (Math.random() < dt * 0.5) b.caption(pick(['MŇAU!', 'koukejte!', 'tadá!', 'jsem hvězda!']));
        if (!c.moving) {
          st.stage = 'steal';
          st.stealUntil = t + 4;
          c.caption(pick(['křup křup', 'granule!', 'beru všechno']));
        }
      }
      if (st.stage === 'steal') {
        if (Math.random() < dt * 0.5) a.caption(pick(['čistý vzduch', 'pospěš si!', 'nikdo nejde']));
        if (st.caught && t > st.stealUntil - 2) {
          st.stage = 'busted';
          w.callbacks.onMessage?.('Šéf: KDO JE V GRANULÍCH?!');
          w.sound.play('fail');
          a.caption(pick(['ŠÉF!', 'pozor!', 'průšvih!']));
          say(c, ['UTÍKEJTE!', '[to jsem nebyl já|to jsem nebyla já]!', '[nic jsem nevzal|nic jsem nevzala]!'], 500);
          for (const cat of ix.members) {
            const p = cat.randomPoint('room');
            cat.goTo(p.x, p.z, { run: true });
          }
          ix.until = t + 3;
        } else if (t > st.stealUntil) {
          st.stage = 'escape';
          c.goTo(st.hideout.x, st.hideout.z, { run: true });
          a.goTo(st.hideout.x + 0.5, st.hideout.z, { run: true });
          b.goTo(st.hideout.x, st.hideout.z + 0.5, { run: true });
        }
      }
      if (st.stage === 'escape' && !a.moving && !b.moving && !c.moving) {
        st.stage = 'feast';
        ix.winners = ix.members;
        c.caption(pick(['dokonalá loupež!', 'kořist je naše', 'hostina!']));
        say(a, ['nikdo nic neviděl', 'mňam', 'jsme profíci'], 900);
        w.sound.play('cheer');
        ix.until = t + 5;
      }
    },
    stat: (ix) => (ix.state.stage === 'feast' ? ['heists'] : []),
  },

  // A knockout tournament of paw tic-tac-toe; the winner gets a crown and confetti.
  tournament: {
    kind: 'group',
    game: true,
    min: 3,
    max: 4,
    weight: 1.2,
    dur: [40, 40],
    place: (w, ix) => ring(w, ix, 0.75),
    start(ix, w) {
      const c = ix.state.center;
      ix.state.board = w.office.spawnProp('tictactoe', c.x, c.z);
      const players = [...ix.members].sort(() => Math.random() - 0.5);
      ix.state.round = players;
      ix.state.next = [];
      ix.state.matchEnd = 0;
      ix.a.caption(pick(['turnaj začíná!', 'kdo bude šampion?', 'losujeme dvojice']));
    },
    pose: {
      all(ix, e, w, role) {
        const cat = ix[role];
        if (ix.state.champion) return ix.state.champion === cat ? 'celebrate' : 'cheer';
        if (ix.state.match?.includes(cat)) return Math.floor(e / 0.9) % 2 === ix.state.match.indexOf(cat) ? 'pawPat' : 'think';
        return ix.state.out?.has(cat) ? 'sit' : 'cheer';
      },
    },
    heading: { all: (ix, e, w, role) => face(ix[role], ix.state.center) },
    bubble: { all: (ix, e, w, role) => (ix.state.champion === ix[role] ? 'crown' : null) },
    tick(ix, t, dt, w) {
      const st = ix.state;
      st.out ??= new Set();
      if (st.champion || t < st.matchEnd) return;
      // Settle the match that just ended.
      if (st.match) {
        const [p, q] = st.match;
        const edge = (cat) => (cat.trait === 'gamer' ? 0.2 : 0);
        const winner = Math.random() < 0.5 + edge(p) - edge(q) ? p : q;
        const loser = winner === p ? q : p;
        st.out.add(loser);
        st.next.push(winner);
        winner.caption(pick(['vítězství!', 'postupuju!', 'tři v řadě!']));
        say(loser, ['hmpf', 'to nebylo fér', 'gg'], 800);
        st.match = null;
        st.matchEnd = t + 1.5;
        return;
      }
      // Next pair, a bye for an odd one out, or the next round.
      if (st.round.length >= 2) {
        st.match = st.round.splice(0, 2);
        st.matchEnd = t + 5;
        st.match[0].caption(pick(['zápas!', 'jdeme na to', 'připrav se']));
        w.sound.play('whistle');
        return;
      }
      st.next.push(...st.round);
      st.round = st.next;
      st.next = [];
      if (st.round.length === 1) {
        const champ = st.round[0];
        st.champion = champ;
        ix.winners = [champ, champ];
        champ.caption(pick(['ŠAMPION!', 'jsem nejlepší!', 'pohár je můj!']));
        w.callbacks.onMessage?.(`${champ.name} ${champ.g('vyhrál', 'vyhrála')} turnaj!`);
        w.sound.play('fanfare');
        for (let n = 0; n < 30; n++) w.office.spawnParticle('confetti', champ.pos.x, 0.9, champ.pos.z);
        ix.until = t + 4;
      }
    },
    finish(ix, w) {
      w.office.removeMesh(ix.state.board);
    },
    stat: (ix) => (ix.state.champion ? ['tournaments'] : []),
  },
};

export const GAME_TITLES = {
  hideAndSeek: 'Kočky hrají schovávanou',
  tag: 'Kočky hrají na babu',
  tugOfWar: 'Přetahovaná!',
  football: 'Kočičí fotbal!',
  heist: 'Kočky něco kují…',
  tournament: 'Turnaj v piškvorkách!',
};

// Playing together brings every pair of players a little closer.
export const GAME_DELTA = { hideAndSeek: 2, tag: 1, tugOfWar: 1, football: 1, heist: 4, tournament: 1 };
