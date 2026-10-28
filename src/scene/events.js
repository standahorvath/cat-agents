// Random events that shake up the office every few minutes: a mouse, a power
// cut, a pizza delivery, a stray cat on a visit. The world runs one at a time.
//
// Each event:
//   weight      how often it is picked
//   ok(world)   whether it can happen now (optional)
//   start(world, ev, t)
//   tick(world, ev, t, dt)   sets ev.done when it is over
//   end(world, ev)

import { FURS } from './identity.js';
import { pick, rnd } from './activities.js';

export const VISITORS = [
  { name: 'Toulavý Fred', gender: 'm' },
  { name: 'Kmotra Líza', gender: 'f' },
  { name: 'Paní Mňoukalová', gender: 'f' },
  { name: 'Kocour v botách', gender: 'm' },
  { name: 'Sousedka Micinka', gender: 'f' },
  { name: 'Pan Fousáč', gender: 'm' },
];
const STRAY_FUR = [
  { id: 'stray', base: '#7A6A5A', stripe: '#4A3E34', belly: '#B8A890', ear: '#C79A9A', eye: '#C9D94F' },
  ...FURS,
];

const cats = (w) => [...w.cats.values()].filter((c) => !c.leaving && !c.gone && c.appear > 0.5);
const idleCats = (w) => cats(w).filter((c) => c.mode === 'idle' && !c.ix);
const say = (cat, lines, delay = 0) => setTimeout(() => !cat.gone && cat.caption(pick(lines)), delay);

export const EVENTS = {
  mouse: {
    weight: 3,
    start(w, ev) {
      const office = w.office;
      const [i, j] = office.nav.randomFree(Math.random, office.areas.room);
      ev.mouse = { x: i + 0.5, z: j + 0.5, mesh: office.spawnMouse(i + 0.5, j + 0.5), path: [], nextTurn: 0 };
      ev.until = ev.t0 + rnd(12, 16);
      w.callbacks.onMessage?.('V kanceláři je myš!');
      w.sound.play('squeak');
      for (const cat of idleCats(w)) {
        cat.endActivity();
        cat.startActivity('chaseMouse');
      }
      for (const cat of cats(w).filter((c) => c.mode !== 'idle')) if (Math.random() < 0.5) say(cat, ['myš!', 'teď nemůžu, pracuju', 'chyťte ji!'], rnd(200, 1200));
    },
    tick(w, ev, t, dt) {
      const m = ev.mouse;
      const nav = w.office.nav;
      // Darts from point to point, changing its mind now and then.
      if (!m.path.length || t > m.nextTurn) {
        m.nextTurn = t + rnd(1.2, 2.6);
        const [i, j] = nav.randomFree(Math.random, w.office.areas.room);
        m.path = nav.find(nav.tileOf(m.x, m.z), [i, j]).map(([a, b]) => ({ x: a + 0.5, z: b + 0.5 }));
      }
      const target = m.path[0];
      const dx = target.x - m.x;
      const dz = target.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) m.path.shift();
      else {
        const step = Math.min(d, 2.5 * dt);
        m.x += (dx / d) * step;
        m.z += (dz / d) * step;
        m.mesh.rotation.y = Math.atan2(dx, dz);
      }
      m.mesh.position.set(m.x, 0, m.z);
      if (Math.random() < dt * 0.6) w.sound.play('squeak', { throttle: 1 });

      const hunter = cats(w).find((c) => Math.hypot(c.pos.x - m.x, c.pos.z - m.z) < 0.32);
      if (hunter && t - ev.t0 > 2.5) {
        ev.catcher = hunter;
        ev.done = true;
      } else if (t > ev.until) ev.done = true;
    },
    end(w, ev) {
      w.office.removeMesh(ev.mouse.mesh);
      ev.mouse = null;
      const catcher = ev.catcher;
      if (catcher) {
        catcher.caption(catcher.g('chytil jsem ji!', 'chytila jsem ji!'));
        for (let k = 0; k < 16; k++) w.office.spawnParticle('confetti', catcher.pos.x + rnd(-0.3, 0.3), 0.9, catcher.pos.z + rnd(-0.3, 0.3));
        w.found(catcher, 'mouse', `${catcher.name} ${catcher.g('chytil', 'chytila')} myš!`);
        for (const c of cats(w)) if (c !== catcher && Math.random() < 0.5) say(c, ['dobrá práce!', 'lovec!', 'to byla moje myš', 'bravo!'], rnd(600, 1600));
      } else {
        const c = pick(cats(w));
        if (c) c.caption(pick(['utekla!', 'kam zmizela?', 'příště ji dostanu']));
        w.callbacks.onMessage?.('Myš utekla.');
      }
      for (const c of cats(w)) if (c.act?.name === 'chaseMouse') c.act.done = true;
    },
  },

  blackout: {
    weight: 2,
    start(w, ev, t) {
      w.office.startBlackout(8, t);
      ev.until = t + 9.4;
      w.callbacks.onMessage?.('Výpadek proudu!');
      w.sound.play('powerDown');
      for (const cat of cats(w)) {
        const working = cat.mode !== 'idle';
        say(cat, working ? ['neuložil jsem to!', 'můj kód!', 'kdo vypnul server?', 'ctrl+s! pozdě'] : ['tma!', 'kdo zhasnul?', 'nic nevidím', 'bojím se tmy'], rnd(150, 1500));
      }
      for (const k of w.kittens.values()) if (Math.random() < 0.6) say(k, ['mami!', 'tma!', 'mňííí'], rnd(300, 1500));
    },
    tick(w, ev, t) {
      if (!ev.lightsBack && t > ev.until - 1.4) {
        ev.lightsBack = true;
        w.sound.play('powerUp');
      }
      if (t > ev.until) ev.done = true;
    },
    end(w) {
      const c = pick(cats(w));
      if (c) c.caption(pick(['světlo!', 'uf', 'zase to jede', 'kdo zapojil konvici?']));
      w.found(c, 'fuse', 'Proud je zpátky. Spálená pojistka jde do sbírky.');
    },
  },

  pizza: {
    weight: 2,
    ok: (w) => idleCats(w).length > 0,
    start(w, ev, t) {
      const office = w.office;
      office.openDoor(3);
      const door = office.spotsOf('door')[0];
      ev.pizza = { x: door.x, z: 1.5, mesh: office.spawnPizza(door.x, 1.5) };
      ev.until = t + 22;
      ev.nextCall = t + 4;
      w.callbacks.onMessage?.('Kurýr přinesl pizzu!');
      w.sound.play('doorbell');
      for (const cat of idleCats(w)) {
        cat.endActivity();
        cat.startActivity('eatPizza');
      }
    },
    tick(w, ev, t) {
      // Cats who finish their work smell it too.
      if (t > ev.nextCall) {
        ev.nextCall = t + 4;
        for (const cat of idleCats(w)) if (cat.act?.name !== 'eatPizza' && Math.random() < 0.5) {
          cat.endActivity();
          cat.startActivity('eatPizza');
        }
      }
      if (t > ev.until) ev.done = true;
    },
    end(w, ev) {
      w.office.removeMesh(ev.pizza.mesh);
      ev.pizza = null;
      for (const c of cats(w)) if (c.act?.name === 'eatPizza') c.act.done = true;
      w.found(null, 'pizzaBox', 'Pizza je snědená. Krabice jde do sbírky.');
    },
  },

  // A robot vacuum tours the office; one brave cat rides it, the others keep away.
  vacuum: {
    weight: 2,
    start(w, ev, t) {
      const office = w.office;
      const [i, j] = office.nav.randomFree(Math.random, office.areas.room);
      ev.vacuum = { x: i + 0.5, z: j + 0.5, heading: 0, mesh: office.spawnVacuum(i + 0.5, j + 0.5), path: [] };
      ev.until = t + rnd(20, 28);
      ev.boardAt = t + 3;
      w.callbacks.onMessage?.('Vyjel robotický vysavač!');
      w.sound.play('vacuum');
      for (const cat of cats(w)) if (Math.random() < 0.6) say(cat, ['co to je?!', 'příšera!', 'hsss!', 'zase on'], rnd(300, 1800));
    },
    tick(w, ev, t, dt) {
      const v = ev.vacuum;
      const nav = w.office.nav;
      if (!v.path.length) {
        const [i, j] = nav.randomFree(Math.random, w.office.areas.room);
        v.path = nav.find(nav.tileOf(v.x, v.z), [i, j]).map(([a, b]) => ({ x: a + 0.5, z: b + 0.5 }));
      }
      const target = v.path[0];
      const dx = target.x - v.x;
      const dz = target.z - v.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) v.path.shift();
      else {
        const step = Math.min(d, 0.9 * dt);
        v.x += (dx / d) * step;
        v.z += (dz / d) * step;
        v.heading = Math.atan2(dx, dz);
      }
      v.mesh.position.set(v.x, 0, v.z);
      v.mesh.rotation.y = v.heading;
      if (Math.random() < dt * 2) w.office.spawnParticle('dust', v.x, 0.05, v.z);
      if (ev.boardAt && t > ev.boardAt) {
        // Even a sleeping cat wakes up for a ride.
        const rider = idleCats(w).filter((c) => !c.moving || c.act?.phase === 'do').sort((a, b) => Math.hypot(a.pos.x - v.x, a.pos.z - v.z) - Math.hypot(b.pos.x - v.x, b.pos.z - v.z))[0];
        if (rider) {
          ev.boardAt = null;
          ev.rider = rider;
          rider.endActivity();
          rider.startActivity('rideVacuum');
        } else ev.boardAt = t + 2;
      }
      if (t > ev.until) ev.done = true;
    },
    end(w, ev) {
      w.office.removeMesh(ev.vacuum.mesh);
      ev.vacuum = null;
      const rider = ev.rider;
      if (rider && rider.act?.name === 'rideVacuum') rider.act.done = true;
      if (rider) {
        rider.targetLift = 0;
        rider.caption(pick(['to byla jízda!', 'zase zítra', 'točí se mi hlava']));
      }
      w.found(null, 'dustBunny', 'Vysavač dojel. Chomáč prachu jde do sbírky.');
    },
  },

  visitor: {
    weight: 2,
    start(w, ev, t) {
      const guest = pick(VISITORS);
      ev.guest = w.addVisitor(guest, pick(STRAY_FUR));
      ev.until = t + rnd(50, 75);
      ev.meetAt = t + rnd(5, 9);
      w.callbacks.onMessage?.(`Na návštěvu ${guest.gender === 'f' ? 'přišla' : 'přišel'} ${guest.name}.`);
      setTimeout(() => !ev.guest.gone && ev.guest.caption(pick(['ahoj, kočky!', 'mňau, je tu někdo?', 'jen se ohřeju', 'máte tu granule?'])), 2500);
    },
    tick(w, ev, t) {
      const guest = ev.guest;
      if (ev.meetAt && t > ev.meetAt && guest.mode === 'idle') {
        // Somebody comes to say hello as soon as a cat is free.
        const host = idleCats(w).filter((c) => c.isInterruptible());
        if (host.length && w.startInteraction(pick(['sniff', 'boop', 'hissStandoff', 'headRub', 'gossip']), pick(host), guest)) ev.meetAt = null;
        else ev.meetAt = t + 3;
      }
      if (t > ev.until && !guest.leaving) {
        guest.leaving = true;
        guest.caption(pick(['tak já jdu', 'díky za pohoštění', 'zase někdy!', 'mňau, ahoj']));
      }
      if (guest.gone) ev.done = true;
    },
    end(w, ev) {
      w.found(null, 'feather', `${ev.guest.name} ${ev.guest.g('odešel', 'odešla')} a nechal${ev.guest.gender === 'f' ? 'a' : ''} tu pírko.`);
    },
  },
};
