// One cat (a session) or kitten (a subagent): walks the office, picks activities
// from the agent's live state and blends between poses.

import * as THREE from 'three';
import { ACTIVITIES, FINDS, RESTORES, WORK_LINES, ambientLine, idleActivity, pick, rnd, thinkActivity, workActivity } from './activities.js';
import { forRole, resolve } from './interactions.js';
import { CatModel } from './CatModel.js';
import { genderize, genderOf } from './identity.js';
import { BOX, mat } from './voxel.js';
import { REST, poseParams } from './poses.js';

const PI = Math.PI;

export const REACTION_LINES = {
  testsPass: ['zelená!', 'testy prošly!', 'všechno zelené', 'ani jedna chyba', 'CI je spokojené'],
  testsFail: ['červená…', 'testy spadly!', 'kdo rozbil testy?', 'to snad ne', 'flaky test?'],
  error: ['ajajaj', 'to nešlo', 'chyba!', 'hmm, error', 'zkusím to jinak', 'stack trace…'],
  commit: ['commit!', 'uloženo do historie', 'commitnuto', 'malý krok pro kočku'],
  push: ['push!', 'letí to na server', 'pushnuto', 'je to venku'],
  merge: ['MERGED!', 'je to venku!', 'mergnuto!', 'do mainu!'],
  build: ['build prošel!', 'zkompilováno', 'build je zelený', 'zabaleno'],
  buildFail: ['build spadl', 'kompilátor mě nemá rád', 'typová chyba… zase', 'kdo psal tyhle typy?'],
  install: ['instaluju půl internetu', 'node_modules rostou', 'další závislost', 'stahuju, stahuju'],
  lint: ['lint je spokojený', 'všechno učesané', 'krásně naformátováno'],
  deploy: ['DEPLOY!', 'letí to do produkce', 'držte mi palce', 'nasazeno!'],
  revert: ['ctrl+z!', 'vracím to', 'tohle se nestalo', 'zpátky na start'],
  slow: ['konečně!', 'to trvalo věčnost', 'už jsem [usínal|usínala]', 'doběhlo to'],
};
const FRIDAY_LINES = ['v pátek… no a?', 'YOLO', 'snad to vydrží do pondělí', 'co by se mohlo pokazit?'];
const REACTION_POSE = {
  testsPass: 'cheer', testsFail: 'hiss', error: 'facepalm', commit: 'cheer', push: 'cheer', merge: 'celebrate',
  build: 'cheer', buildFail: 'facepalm', install: 'think', lint: 'cheer', deploy: 'celebrate', revert: 'facepalm', slow: 'yawn',
  pet: 'purr', treat: 'drink', shake: 'shake', jealous: 'hiss', angry: 'hiss',
};
const SHAKE_SECONDS = 2;

// How round a cat looks for a given context fill: half full is already chubby.
export const fatFor = (fill) => Math.max(0, Math.min(1, (fill - 0.05) / 0.7));
const tokensText = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} M` : `${Math.round(n / 1000)}k`);
const REACTION_BUBBLE = { pet: 'heart', treat: 'heart', jealous: 'broken', angry: 'hiss' };
export const PAMPER_LINES = {
  pet: ['prrr', 'ještě!', 'za ouškem', 'to je ono', 'mňau ♥', 'drbej dál', 'pod bradou taky'],
  treat: ['mňam!', 'pamlsek!', 'ještě jeden?', 'tuňákový!', 'jsi nejlepší', 'křup křup'],
};
const GAITS = {
  walk: { speed: 1.5, cadence: 9.5 },
  trot: { speed: 2.2, cadence: 13 },
  sneak: { speed: 0.85, cadence: 7 },
  run: { speed: 3.2, cadence: 16 },
};

function lerpAngle(a, b, k) {
  let d = ((b - a + PI) % (2 * PI)) - PI;
  if (d < -PI) d += 2 * PI;
  return a + d * k;
}

export class Agent {
  constructor(world, { id, kind, fur, name, parent = null, gender = null }) {
    this.world = world;
    this.office = world.office;
    this.id = id;
    this.kind = kind;
    this.kitten = kind === 'kitten';
    this.visitor = kind === 'visitor';
    this.name = name;
    this.gender = gender ?? (this.kitten ? 'n' : genderOf(name));
    this.parent = parent;
    this.fur = fur;
    this.model = new CatModel(fur, { kitten: this.kitten });
    this.baseScale = this.model.root.scale.x;
    world.scene.add(this.model.root);

    this.seed = Math.random() * 10;
    this.params = { ...REST };
    this.pose = 'stand';
    this.phase = 0;
    this.heading = 0;
    this.lift = 0;
    this.path = [];
    this.moving = false;
    this.gait = 'walk';
    this.act = null;
    this.mode = null;
    this.captions = [];
    this.appear = 0;
    this.gone = false;
    this.leaving = false;
    this.exiting = false;
    this.deskIndex = null;
    this.category = null;
    this.seenEvents = new Set();
    this.lastCaption = 0;

    const door = this.office.spotsOf('door')[0];
    this.pos = new THREE.Vector3(door.x, 0, -0.3);
    this.office.openDoor();
    this.goTo(door.x, 0.6, { direct: true });

    this.laptop = this.buildLaptop();
  }

  buildLaptop() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(BOX, mat('#C9CED6'));
    base.scale.set(0.2, 0.015, 0.14);
    base.position.y = 0.008;
    const lid = new THREE.Mesh(BOX, mat('#C9CED6'));
    lid.scale.set(0.2, 0.13, 0.012);
    lid.position.set(0, 0.075, 0.07);
    lid.rotation.x = 0.25;
    this.laptopScreen = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: '#4CFF7A' }));
    this.laptopScreen.scale.set(0.17, 0.1, 0.004);
    this.laptopScreen.position.set(0, 0.075, 0.062);
    this.laptopScreen.rotation.x = 0.25;
    g.add(base, lid, this.laptopScreen);
    g.scale.setScalar(this.kitten ? 1.4 : 2.1);
    g.visible = false;
    this.world.scene.add(g);
    return g;
  }

  // A new fur means a new model; clothes go back on.
  setFur(fur) {
    if (fur === this.fur) return;
    this.fur = fur;
    const old = this.model;
    this.model = new CatModel(fur, { kitten: this.kitten });
    this.world.scene.remove(old.root);
    this.world.scene.add(this.model.root);
    if (old.wearKey) this.model.setWear(JSON.parse(old.wearKey));
  }

  dispose() {
    this.endActivity();
    this.world.scene.remove(this.model.root);
    if (this.laptop) this.world.scene.remove(this.laptop);
    if (this.deskIndex !== null) this.office.setDeskScreen(this.deskIndex, null);
  }

  // Called when the office is rebuilt (more desks needed).
  moveToOffice(office) {
    this.endActivity();
    this.office = office;
    this.deskIndex = null;
    this.deskKind = undefined;
    const [i, j] = office.nav.nearestFree(...office.nav.tileOf(this.pos.x, this.pos.z));
    this.pos.set(i + 0.5, 0, j + 0.5);
    this.lift = 0;
    this.path = [];
    this.moving = false;
    this.mode = null;
  }

  // Session state

  setSession(session) {
    if (!this.kitten && !this.visitor) this.updateContext(this.session, session);
    this.session = session;
    if (this.kitten) {
      this.category = session.activity?.category ?? 'think';
    }
    for (const ev of session.events ?? []) {
      if (this.seenEvents.has(ev.id)) continue;
      this.seenEvents.add(ev.id);
      // Shop talk only while actually sitting at the work.
      const atWork = this.act?.def.work && this.act.phase === 'do';
      if (this.primed && atWork && this.world.time - this.lastCaption > 4 && Math.random() < 0.5) {
        this.caption(pick(WORK_LINES[ev.category] ?? WORK_LINES.other));
      }
    }
    for (const r of session.results ?? []) {
      if (this.seenResults?.has(r.id)) continue;
      (this.seenResults ??= new Set()).add(r.id);
      if (this.primed) this.react(r.kind);
    }
    this.primed = true;
  }

  // The fuller the context, the rounder the cat. A compaction or /clear (a new
  // session in the same process) makes it shake off the extra fur and slim down.
  updateContext(prev, session) {
    const fill = session.context?.fill ?? 0;
    this.seenCompacts ??= new Set();
    let shed = null;
    for (const c of session.compacts ?? []) {
      if (this.seenCompacts.has(c.id)) continue;
      this.seenCompacts.add(c.id);
      const window = session.context?.window ?? 1e6;
      // Only fresh ones: a resumed session brings old compactions in its history.
      if (this.primed && Date.now() - c.ts < 120_000) shed = { to: fill, dropped: Math.max(0, c.before - c.after), reason: 'compact', from: c.before / window };
    }
    const cleared = this.primed && prev && prev.id !== session.id;
    if (!shed && cleared && fatFor(fill) < (this.fatTarget ?? 0) - 0.03) {
      shed = { to: fill, dropped: Math.max(0, (prev.context?.tokens ?? 0) - (session.context?.tokens ?? 0)), reason: 'clear' };
    }
    if (shed) this.shake(shed);
    else if (!this.shaking) this.fatTarget = fatFor(fill);
    if (this.fat == null) this.fat = this.fatTarget ?? 0;
  }

  shake({ to, dropped, reason }) {
    const t = this.world.time;
    this.shaking = { until: t + SHAKE_SECONDS, to: fatFor(to), dropped, nextTuft: t };
    this.reaction = { kind: 'shake', until: t + SHAKE_SECONDS };
    this.caption(pick(reason === 'compact' ? ['oklepu se', 'brrr!', 'pryč s tím', 'kompaktuju'] : ['nový začátek!', 'čistý štít', 'brrr!', 'pryč s tím']));
    this.world.sound?.play('shake');
  }

  // Tufts fly while shaking; at the end the cat is slimmer.
  updateShake(t) {
    const s = this.shaking;
    if (!s) return;
    if (t < s.until - 0.5 && t >= s.nextTuft) {
      s.nextTuft = t + 0.05;
      const fur = this.fur;
      const colors = [fur.base, fur.base, fur.stripe ?? fur.belly ?? fur.base, fur.belly ?? fur.base];
      const n = 1 + Math.round(Math.min(1, s.dropped / 300_000) * 3);
      for (let k = 0; k < n; k++) this.office.spawnParticle('fur', this.pos.x + rnd(-0.15, 0.15), this.lift + 0.35, this.pos.z + rnd(-0.15, 0.15), pick(colors));
    }
    if (t >= s.until) {
      this.shaking = null;
      this.fatTarget = s.to;
      if (s.dropped > 0) this.caption(`${this.g('zhubl', 'zhubla')} jsem o ${tokensText(s.dropped)} tokenů`);
      else this.caption(pick(['hned je mi líp', 'lehčí!', 'uf']));
    }
  }

  // The player pets the cat or gives it a treat from its card.
  pamper(kind) {
    const t = this.world.time;
    this.reaction = { kind, until: t + (kind === 'treat' ? 3 : 2.5) };
    this.caption(pick(PAMPER_LINES[kind]));
    this.world.sound?.play(kind === 'pet' ? 'purr' : 'meow');
  }

  // Tests, failures and commits get an instant reaction on top of the activity.
  react(kind) {
    if (!REACTION_LINES[kind]) return;
    const t = this.world.time;
    this.reaction = { kind, until: t + (kind === 'merge' || kind === 'deploy' ? 4 : 3) };
    const now = this.office.now?.() ?? new Date();
    const friday = (kind === 'deploy' || kind === 'push') && now.getDay() === 5 && now.getHours() >= 13;
    this.caption(pick(friday ? FRIDAY_LINES : REACTION_LINES[kind]));
    const office = this.office;
    if (['commit', 'push', 'merge', 'deploy'].includes(kind)) {
      const n = kind === 'merge' || kind === 'deploy' ? 40 : 18;
      for (let k = 0; k < n; k++) office.spawnParticle('confetti', this.pos.x + rnd(-0.3, 0.3), this.lift + 0.9, this.pos.z + rnd(-0.3, 0.3));
    }
    const sound = { testsFail: 'fail', error: 'fail', buildFail: 'fail', revert: 'fail', install: 'bleep', slow: 'bleep' }[kind] ?? 'cheer';
    this.world.sound?.play(sound);
    this.world.onResult?.(this, kind);
  }

  // The cat's needs from the server (shared by all sessions of the project).
  profile() {
    return this.kitten ? null : this.world.officeState.cats?.[this.session?.cwd] ?? null;
  }

  computeMode(t) {
    if (this.leaving) return 'leave';
    if (this.kitten) return 'kitten';
    const s = this.session;
    if (!s) return 'idle';
    if (s.status === 'idle') return 'idle';
    if (s.status !== 'busy') return 'alert';
    const raw = s.activity?.category ?? 'think';
    if (raw !== this.rawCategory) {
      this.rawCategory = raw;
      this.rawSince = t;
    }
    if (!this.category || t - this.rawSince > 0.9) this.category = this.rawCategory;
    return this.category === 'think' ? 'think' : `work:${this.category}`;
  }

  // Movement

  goTo(x, z, { run = false, gait = null, lift = 0, approach = null, direct = false } = {}) {
    const nav = this.office.nav;
    this.path = [];
    if (!direct) {
      const tiles = nav.find(nav.tileOf(this.pos.x, this.pos.z), approach ?? nav.tileOf(x, z));
      this.path = tiles.map(([i, j]) => ({ x: i + 0.5, z: j + 0.5 }));
      // Skip a first waypoint that lies behind us.
      if (this.path.length > 1) {
        const [a, b] = this.path;
        if (Math.hypot(b.x - this.pos.x, b.z - this.pos.z) < Math.hypot(b.x - a.x, b.z - a.z)) this.path.shift();
      }
    }
    this.path.push({ x, z, final: true, lift });
    this.gait = run ? 'run' : gait ?? 'walk';
    this.moving = true;
  }

  // Cats don't all walk the same: relaxed ones trot or sneak around now and then.
  pickGait() {
    const r = Math.random();
    if (this.kitten) return r < 0.5 ? 'trot' : 'run';
    if (this.mode === 'idle') return r < 0.15 ? 'sneak' : r < 0.4 ? 'trot' : 'walk';
    if (this.mode?.startsWith('work')) return r < 0.3 ? 'trot' : 'walk';
    return 'walk';
  }

  stop() {
    this.path = [];
    this.moving = false;
  }

  faceTowards(x, z) {
    this.targetHeading = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  cameraHeading() {
    return this.world.azimuth;
  }

  randomPoint(area = null) {
    // Without a named area cats roam everywhere, the garden only in good weather.
    const office = this.office;
    const zone = area ? office.areas[area] : office.garden && !office.outdoorOk ? office.areas.room : null;
    const [i, j] = office.nav.randomFree(Math.random, zone);
    return { x: i + 0.5, z: j + 0.5 };
  }

  nearPoint(radius) {
    const nav = this.office.nav;
    const [ci, cj] = nav.tileOf(this.pos.x, this.pos.z);
    for (let k = 0; k < 30; k++) {
      const i = ci + Math.round(rnd(-radius, radius));
      const j = cj + Math.round(rnd(-radius, radius));
      if (nav.free(i, j) && (i !== ci || j !== cj)) return { x: i + 0.5, z: j + 0.5 };
    }
    return { x: ci + 0.5, z: cj + 0.5 };
  }

  // Other cats push a walker away, which can hold it in place against a seated
  // kitten. When it barely moves for a while it may pass through for a moment.
  trackProgress(dt, speed) {
    const moved = this.lastPos ? Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z) : Infinity;
    this.lastPos = { x: this.pos.x, z: this.pos.z };
    this.stuckFor = moved < speed * dt * 0.3 ? (this.stuckFor ?? 0) + dt : 0;
    if (this.stuckFor > 0.6) {
      this.ghostUntil = this.world.time + 1.5;
      this.stuckFor = 0;
    }
  }

  updateMove(dt) {
    // A shaking cat stands still and carries on afterwards.
    if (!this.moving || this.shaking) {
      return;
    }
    const target = this.path[0];
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const gait = GAITS[this.gait] ?? GAITS.walk;
    const speed = gait.speed * (this.kitten ? 1.1 : 1);
    if (dist < 0.03) {
      this.path.shift();
      if (target.final) {
        this.moving = false;
        this.targetLift = target.lift;
      }
      return;
    }
    const step = Math.min(dist, speed * dt * (1 - 0.3 * (this.fat ?? 0)));
    this.trackProgress(dt, speed);
    this.pos.x += (dx / dist) * step;
    this.pos.z += (dz / dist) * step;
    this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 12));
    this.targetHeading = null;
    this.phase += dt * gait.cadence;
    // Hop onto furniture on the last stretch, hop down when leaving it.
    const finalLeg = target.final;
    this.targetLift = finalLeg && dist < 0.6 ? target.lift : 0;
  }

  // Activities

  startActivity(name) {
    const def = ACTIVITIES[name];
    if (!def) return false;
    this.endActivity();
    const act = { name, def, state: {}, t0: this.world.time, phase: 'go', spot: null, elapsed: 0 };
    if (def.spot) {
      const filter = def.filter?.(this);
      let spot = this.office.reserve(def.spot, this, { filter, near: this.pos });
      if (!spot && def.fallback) spot = this.office.reserve(def.fallback, this, { near: this.parent?.pos ?? this.pos });
      if (!spot) return false;
      act.spot = spot;
    }
    this.act = act;
    const target = def.target ? def.target(this, act) : act.spot;
    act.target = target;
    if (target) {
      this.goTo(target.x, target.z, {
        run: def.run || this.mode === 'alert',
        gait: def.gait ?? this.pickGait(),
        lift: target.lift ?? 0,
        approach: target.approach,
      });
    }
    else this.stop();
    return true;
  }

  endActivity() {
    if (!this.act) return;
    this.act.def.end?.(this, this.act);
    this.reportRestore(this.act);
    this.maybeFind(this.act);
    this.office.release(this.act.spot, this);
    if (this.act.ix && !this.act.ix.finished) this.act.ix.cancel = true;
    this.act = null;
    this.ix = null;
    this.isVibing = false;
  }

  // Idle, awake and settled into something for a few seconds: free to be pulled
  // into an interaction with another cat.
  isInterruptible() {
    const a = this.act;
    return (
      !this.kitten &&
      !this.leaving &&
      this.mode === 'idle' &&
      !this.ix &&
      a?.phase === 'do' &&
      a.elapsed > 4 &&
      !a.def.sleep &&
      !this.moving
    );
  }

  startInteraction(ix, role, target) {
    this.endActivity();
    const spec = ix.spec;
    const world = this.world;
    const partner = () => (role === 'a' ? ix.b : ix.a);
    const def = {
      ix: true,
      pose: () => (ix.started == null ? 'sit' : resolve(forRole(spec.pose, role), ix, ix.elapsed, world, role) ?? 'sit'),
      heading: () => {
        let h = ix.started == null ? null : resolve(forRole(spec.heading, role), ix, ix.elapsed, world, role);
        if (h == null) h = target.heading;
        if (h === 'camera') return this.cameraHeading();
        if (h != null) return h;
        const p = partner();
        return Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      },
      bubble: () => (ix.started == null ? null : resolve(forRole(spec.bubble, role), ix, ix.elapsed, world, role)),
      start: () => {
        ix.ready[role] = true;
      },
    };
    this.act = { name: `ix:${ix.name}`, def, ix, role, state: {}, t0: world.time, phase: 'go', spot: null, elapsed: 0 };
    this.ix = ix;
    this.goTo(target.x, target.z, { lift: target.lift ?? 0, gait: spec.gait ?? 'trot', run: spec.gait === 'run' });
  }

  // What the cat got out of an activity it spent time on goes to its needs.
  reportRestore(act) {
    const rates = RESTORES[act.name];
    const key = this.session?.cwd || this.session?.id;
    if (!rates || !key || this.kitten || act.phase !== 'do') return;
    const seconds = Math.max(0, this.world.time - act.tDo);
    this.world.addRestore(key, Object.fromEntries(Object.entries(rates).map(([need, rate]) => [need, rate * seconds])));
  }

  // Now and then a cat finds something for the collection.
  maybeFind(act) {
    const find = FINDS[act.name];
    if (!find || this.kitten || this.visitor || act.phase !== 'do' || this.world.time - act.tDo < 3) return;
    if (Math.random() < find[1]) this.world.found(this, find[0]);
  }

  // Swap between desk activities without standing up.
  swapInPlace(name) {
    const def = ACTIVITIES[name];
    if (this.act?.def.spot === 'desk' && def.spot === 'desk') {
      this.act.def = def;
      this.act.name = name;
      return true;
    }
    return false;
  }

  chooseActivity() {
    const mode = this.mode;
    if (mode === 'leave') return this.startActivity('leave');
    if (mode === 'kitten') return this.startActivity('kittenWork') || this.startActivity('kittenFloor');
    if (mode === 'alert') return this.startActivity('alert') || this.startActivity('stare');
    if (mode === 'think' || mode.startsWith('work:')) this.claimDesk();
    if (mode === 'think') return this.startActivity(thinkActivity(this.office)) || this.startActivity('pace');
    if (mode.startsWith('work:')) {
      const name = workActivity(mode.slice(5));
      // Cats without a desk work on a laptop: on a bean bag or couch, or on the floor.
      return this.startActivity(name) || this.startActivity('laptopWork') || this.startActivity('laptopFloor');
    }
    // idle
    if (this.justFinishedWork) {
      this.justFinishedWork = false;
      if (this.startActivity('yawnStretch')) return true;
    }
    const since = this.session?.statusSince ?? Date.now();
    const minutes = (Date.now() - since) / 60000;
    for (let k = 0; k < 6; k++) if (this.startActivity(idleActivity(minutes, this.office.daylight ?? 0.5, this.office, this.profile()?.needs, this.trait))) return true;
    return this.startActivity('wander');
  }

  // Desks are shared: a cat takes a free one when it starts working and gives it
  // back when it goes idle.
  claimDesk() {
    if (this.deskIndex === null && !this.kitten) this.deskIndex = this.world.freeDesk();
  }

  releaseDesk() {
    if (this.deskIndex === null) return;
    this.office.setDeskScreen(this.deskIndex, null);
    this.deskIndex = null;
    this.deskKind = undefined;
  }

  onModeChange(prev, mode) {
    if (mode === 'idle' || mode === 'leave') this.releaseDesk();
    if (prev?.startsWith('work') || prev === 'think') this.justFinishedWork = mode === 'idle';
    if (mode.startsWith('work:') && prev?.startsWith('work:') && this.act?.phase === 'do') {
      if (this.swapInPlace(workActivity(mode.slice(5)))) return;
    }
    this.endActivity();
  }

  // Pick the masculine or feminine form, e.g. g('spal', 'spala').
  g(masculine, feminine) {
    return this.gender === 'f' ? feminine : masculine;
  }

  // Lines may contain [m|f] (speaker's gender) and <m|f> (gender of the cat
  // spoken to, by default the partner in the current interaction).
  caption(text, partner = this.ix ? (this.ix.a === this ? this.ix.b : this.ix.a) : null) {
    const line = genderize(text, this, partner);
    this.captions.push({ text: line.toUpperCase(), t0: this.world.time, dx: rnd(-14, 14) });
    if (this.captions.length > 2) this.captions.shift();
    this.lastCaption = this.world.time;
  }

  // Per frame

  update(dt, t) {
    const mode = this.computeMode(t);
    if (mode !== this.mode) {
      const prev = this.mode;
      this.mode = mode;
      this.onModeChange(prev, mode);
    }

    const act = this.act;
    if (act && act.phase === 'do') {
      act.elapsed = t - act.tDo;
      act.def.tick?.(this, act, t, dt);
      if ((act.until && t > act.until) || act.done) {
        if (this.exiting) {
          this.gone = true;
        }
        this.endActivity();
      }
    }
    if (!this.act && !this.gone) {
      if (!this.moving || this.mode === 'leave') this.chooseActivity();
    }

    this.updateMove(dt);

    const a = this.act;
    if (a && a.phase === 'go' && !this.moving) {
      a.phase = 'do';
      a.tDo = t;
      a.elapsed = 0;
      if (a.def.dur) a.until = t + rnd(...a.def.dur);
      a.def.start?.(this, a);
      if (a.def.startLines && Math.random() < 0.7) this.caption(pick(a.def.startLines));
      if (a.def.sound) this.world.sound?.play(a.def.sound);
      if (a.def.meme && !this.kitten) this.world.countMeme?.(a.def.meme);
      this.isVibing = !!a.def.vibing;
      this.nextQuip = t + rnd(10, 20);
    }
    if (this.exiting && !this.moving) this.gone = true;

    // Now and then say something that fits what the cat is doing.
    if (a && a.phase === 'do' && !a.ix && t > (this.nextQuip ?? 0)) {
      this.nextQuip = t + rnd(14, 28);
      if (t - this.lastCaption > 6 && Math.random() < 0.55) {
        const line = ambientLine(this, a);
        if (line) this.caption(line);
      }
    }

    // Pose and facing
    let pose = 'stand';
    if (this.moving) pose = this.gait;
    else if (a && a.phase === 'do') {
      pose = typeof a.def.pose === 'function' ? a.def.pose(this, a, t) : a.def.pose ?? 'stand';
      let h = a.def.heading ? a.def.heading(this, a) : a.def.facesCamera || a.spot?.facesCamera ? this.cameraHeading() : a.spot?.heading;
      if (this.targetHeading != null && !a.spot) h = this.targetHeading;
      if (h != null && pose !== 'run') this.heading = lerpAngle(this.heading, h, Math.min(1, dt * 6));
    }
    if (pose === 'run' && !this.moving && a?.name !== 'tailChase') pose = 'stand';
    if (this.reaction && t < this.reaction.until && !this.moving) pose = REACTION_POSE[this.reaction.kind];
    if (this.reaction && t < this.reaction.until && this.reaction.kind === 'treat' && this.lift > 0.05) pose = 'mug';
    if (this.moving && !GAITS[pose]) pose = this.gait;
    if (this.shaking) pose = 'shake';
    this.pose = pose;

    // Blend rig parameters towards the pose
    const target = poseParams(pose, t, { seed: this.seed, phase: this.phase });
    const k = Math.min(1, dt * (GAITS[pose] ? 16 : 7));
    for (const key in target) {
      if (key === 'prop') continue;
      this.params[key] += (target[key] - this.params[key]) * k;
    }
    this.params.prop = target.prop;
    const blink = this.params.eyes > 0.5 && (t + this.seed) % 4.1 < 0.12;
    this.model.apply(blink ? { ...this.params, eyes: 0 } : this.params);

    this.lift += ((this.targetLift ?? 0) - this.lift) * Math.min(1, dt * 8);
    this.appear += ((this.gone ? 0 : 1) - this.appear) * Math.min(1, dt * 5);
    const root = this.model.root;
    root.position.set(this.pos.x, this.lift, this.pos.z);
    root.rotation.y = this.heading;
    root.scale.setScalar(this.baseScale * Math.max(0.001, this.appear));

    // A little "+1" over working cats, at the rate the server pays coins.
    const earning = this.kitten ? this.parent?.session?.status === 'busy' : this.session?.status === 'busy';
    if (earning && !this.leaving) {
      this.coinTimer = (this.coinTimer ?? Math.random() * 10) + dt;
      const every = this.kitten ? 20 : 10;
      if (this.coinTimer >= every) {
        this.coinTimer -= every;
        this.coinPops = [...(this.coinPops ?? []), t].slice(-3);
        this.world.sound?.play('coin', { throttle: 0.4 });
      }
    }

    // Gaining weight is slow, losing it after a shake is quick.
    this.updateShake(t);
    if (!this.kitten) {
      const target = this.fatTarget ?? 0;
      const rate = target < (this.fat ?? 0) ? 3 : 0.6;
      this.fat = (this.fat ?? 0) + (target - (this.fat ?? 0)) * Math.min(1, dt * rate);
      this.model.fat = this.fat;
    }

    this.updateDesk(a);
    this.updateLaptop(a, t);
  }

  updateDesk(a) {
    if (this.deskIndex === null) return;
    const seated = a && a.phase === 'do' && a.def.screen;
    const kind = seated ? a.def.screen : this.session?.status === 'busy' ? 'think' : null;
    if (kind !== this.deskKind) {
      this.deskKind = kind;
      this.office.setDeskScreen(this.deskIndex, kind);
    }
  }

  updateLaptop(a, t) {
    if (!this.laptop) return;
    const show = a && a.def.laptop && a.phase === 'do';
    this.laptop.visible = !!show;
    if (show) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const reach = this.kitten ? 0.32 : 0.46;
      this.laptop.position.set(this.pos.x + fx * reach, this.lift, this.pos.z + fz * reach);
      this.laptop.rotation.y = this.heading + PI;
      const colors = { shell: '#4CFF7A', write: '#8FB8FF', web: '#FFFFFF', read: '#FFE9B8', mcp: '#5E9CF0', agent: '#7FD8A6', think: '#8888CC' };
      this.laptopScreen.material.color.set(colors[this.category] ?? '#D0D0D0');
      this.laptopScreen.visible = this.category !== 'think' || Math.sin(t * 2) > -0.5;
    }
  }

  // Head position in world space, for labels and bubbles.
  headPosition(out) {
    const s = this.baseScale;
    const up = this.params.y + 0.3 + (this.pose === 'alert' ? 0.2 : 0);
    return out.set(this.pos.x, this.lift + up * s + 0.1, this.pos.z);
  }

  bubble() {
    if (this.reaction && this.world.time < this.reaction.until && REACTION_BUBBLE[this.reaction.kind]) return REACTION_BUBBLE[this.reaction.kind];
    const a = this.act;
    if (!a || a.phase !== 'do') return null;
    const b = typeof a.def.bubble === 'function' ? a.def.bubble(this, a) : a.def.bubble;
    if (b) return b;
    if (a.def.work) return `tool:${a.def.label ?? this.category}`;
    // A low need shows up now and then while slacking.
    const needs = this.profile()?.needs;
    if (needs && !a.def.sleep && (this.world.time + this.seed) % 9 < 3) {
      if (needs.food < 25) return 'hungry';
      if (needs.energy < 25) return 'tired';
      if (needs.fun < 25) return 'bored';
    }
    return null;
  }
}
