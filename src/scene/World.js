// The whole game scene: pixel renderer, isometric camera, office, cats, and the
// edit mode for placing and moving furniture.

import * as THREE from 'three';
import { footprintSize } from '../../shared/catalog.js';
import { initialState, placementError, publicView } from '../../shared/office-rules.js';
import { COLLECTIBLES, FRIENDS, RIVALS, relationOf, traitOf } from '../../shared/cats.js';
import { Agent } from './Agent.js';
import { EVENTS } from './events.js';
import { GAMES, GAME_DELTA, GAME_TITLES, ROLES } from './games.js';
import { RARE_LOOKS, catFur, catName, furFor } from './identity.js';
import { Office, seasonFor } from './Office.js';
import { INTERACTIONS, RELATION_DELTA, TRAIT_TASTE, idleAwake, prepareInteraction } from './interactions.js';
import { drawOverlay } from './overlay.js';
import { pick, pickWeighted, rnd } from './activities.js';
import { PixelPipeline } from './pixelPipeline.js';
import { Sound } from './sound.js';

const ELEVATION = Math.atan(0.5) + 0.06; // a touch steeper than classic 2:1 pixel iso
const STEP = Math.PI / 2;
const officeKey = (state, preview = null) => JSON.stringify([state.size, state.garden, state.items, preview ?? state.theme]);

const SPECS = { ...INTERACTIONS, ...GAMES };
// Nice things friends do more often, nasty things rivals do more often.
const FRIENDLY = Object.keys(INTERACTIONS).filter((k) => RELATION_DELTA[k] >= 3 && !INTERACTIONS[k].rel && INTERACTIONS[k].kind === 'pair');
const HOSTILE = ['fight', 'hissStandoff', 'blameGame', ...Object.keys(INTERACTIONS).filter((k) => INTERACTIONS[k].rel === 'rival')];
const FOR_FRIENDS = Object.keys(INTERACTIONS).filter((k) => INTERACTIONS[k].rel === 'friend');
const JEALOUS_LINES = [
  (c, best) => `a co já, ${best.name}?`,
  (c, best, other) => `${best.name} a ${other.name}? to snad ne`,
  (c, best) => `to je ${best.g('můj kamarád', 'moje kamarádka')}!`,
  () => 'žárlím. hodně',
  () => 'zrada! hmpf',
  (c, best, other) => `${other.name}, tlapky pryč!`,
];
// What the others say when a cat's tests fail or its deploy goes out.
const BYSTANDER = {
  bad: { friend: ['to dáš!', 'pomůžu ti', 'hlavu vzhůru', 'to se stává'], rival: ['haha, červená!', 'u mě by to prošlo', 'chceš poradit? ne?', 'kdo to rozbil? aha'], neutral: ['zase?', 'au', 'red is the new green'] },
  good: { friend: ['bravo!', 'šikula!', 'tak se to dělá!', 'jsi [můj hrdina|moje hrdinka]'], rival: ['náhoda', 'to prošlo omylem', 'hmpf', 'konečně'], neutral: ['pěkný', 'gratulka', 'nazdar zelená'] },
  friday: ['V PÁTEK?!', 'v pátek se nedeployuje!', 'odvážné…', 'víkend je v háji', 'kdo bude mít službu?'],
  install: ['zase node_modules?', 'kolik to váží?', 'další závislost'],
  slow: ['ještě to běží?', 'mezitím si dám šlofíka', 'kafe?'],
  revert: ['ctrl+z level git', 'co se stalo?', 'jako by se nic nestalo'],
};
const BAD = new Set(['testsFail', 'buildFail', 'error']);
const GOOD = new Set(['testsPass', 'build', 'merge', 'commit', 'push', 'deploy']);
// The profile (needs, fur, relations) belongs to the project.
const profileKey = (agent) => agent.session?.cwd || agent.session?.id;
// A cat belongs to the Claude process: /clear starts a new session in the same
// process and the cat stays (and slims down).
export const sessionKey = (s) => (s.pid ? `pid:${s.pid}` : s.id);

export class World {
  constructor(container, overlayCanvas, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.canvas = container.querySelector('canvas.scene');
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas.getContext('2d');
    this.pipeline = new PixelPipeline(this.canvas);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1A1626');
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.azimuth = Math.PI / 4;
    this.targetAzimuth = this.azimuth;
    this.zoom = 1.15;
    this.pan = new THREE.Vector2();
    this.following = null;
    this.time = 0;
    this.tmp = new THREE.Vector3();
    this.cats = new Map();
    this.kittens = new Map();
    this.visitors = new Map();
    this.pendingRestore = {};
    this.pendingRelations = [];
    this.pendingStats = {};
    this.pendingWins = {};
    this.event = null;
    this.highlight = null;
    this.hovered = null;
    this.interactions = [];
    this.nextInteraction = 6;
    this.edit = { on: false, ghost: null, ghostGroup: null, problem: null, selected: null };
    this.sound = new Sound();
    // Browsers start audio only after a user gesture.
    this.unlockSound = () => this.sound.enabled && this.sound.setMode(this.sound.mode);
    window.addEventListener('pointerdown', this.unlockSound, { once: true });

    this.officeState = publicView(initialState());
    const params = new URLSearchParams(window.location.search);
    const hour = params.get('hour');
    this.officeOptions = { season: params.has('season') ? params.get('season') || null : seasonFor(), weather: null, hour: hour ? Number(hour) : null };
    this.weatherOverride = params.get('weather');
    // ?event=mouse starts that event a few seconds after load, for trying it out.
    this.nextEvent = params.get('event') ? 4 : 150 + Math.random() * 240;
    this.forcedEvent = params.get('event');
    this.office = new Office(this.scene, this.officeState, this.officeOptions);
    this.fetchWeather();
    this.weatherTimer = setInterval(() => this.fetchWeather(), 10 * 60_000);
    this.officeKeyValue = officeKey(this.officeState);
    this.office.setCutaway(this.azimuth);
    document.fonts?.load('16px "Jersey 10"').then(() => this.office.refreshSigns());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.onPointerDown = (e) => this.pointerDown(e);
    this.onPointerUp = (e) => this.pointerUp(e);
    this.onPointerMove = (e) => this.pointerMove(e);
    this.onPointerLeave = () => (this.hovered = null);
    this.onWheel = (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    this.onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'q' || e.key === 'Q') this.rotate(-1);
      if (e.key === 'e' || e.key === 'E') this.rotate(1);
      if (e.key === '+' || e.key === '=') this.zoomBy(1.15);
      if (e.key === '-') this.zoomBy(1 / 1.15);
      if (this.edit.on && (e.key === 'r' || e.key === 'R')) this.rotateItem();
      if (this.edit.on && e.key === 'Escape') this.cancelEdit();
    };
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('pointercancel', this.onPointerUp);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerleave', this.onPointerLeave);
    container.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // Real weather outside the windows (via the server, Open-Meteo), or ?weather=rain.
  async fetchWeather() {
    let weather = this.weatherOverride ? { kind: this.weatherOverride } : null;
    if (!weather) {
      try {
        weather = await (await fetch('/api/weather')).json();
      } catch {
        return;
      }
    }
    this.weather = weather;
    this.office.setWeather(weather);
    this.shelterFromWeather();
  }

  // When it starts to rain or snow, cats out in the garden run inside.
  shelterFromWeather() {
    const office = this.office;
    if (!office.garden || office.outdoorOk) return;
    for (const a of this.allAgents()) {
      if (a.pos.z <= office.D || a.ix || a.leaving) continue;
      a.endActivity();
      a.caption(pick(['prší!', 'brr, mokro', 'honem dovnitř', 'nesnáším vodu']));
      const p = a.randomPoint('room');
      a.goTo(p.x, p.z, { run: true });
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.weatherTimer);
    this.resizeObserver.disconnect();
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointerdown', this.unlockSound);
    this.sound.stopMusic();
    this.sound.ctx?.close();
    for (const a of this.allAgents()) a.dispose();
    this.office.dispose();
    this.pipeline.dispose();
  }

  allAgents() {
    return [...this.cats.values(), ...this.kittens.values(), ...this.visitors.values()];
  }

  rotate(dir) {
    this.targetAzimuth += dir * STEP;
  }

  zoomBy(f) {
    this.zoom = Math.max(0.7, Math.min(3.5, this.zoom * f));
    // While following, the player's zoom wins.
    this.followZoom = this.zoom;
    if (this.zoom < 1.05) this.pan.set(0, 0);
    this.updateProjection();
  }

  // Drag moves the view across the floor, kept inside the room.
  panBy(dx, dy) {
    const perPixel = (this.camera.right - this.camera.left) / this.width;
    const right = [Math.cos(this.azimuth), -Math.sin(this.azimuth)];
    const away = [-Math.sin(this.azimuth), -Math.cos(this.azimuth)];
    const k = perPixel / Math.sin(ELEVATION);
    this.pan.x += -right[0] * dx * perPixel + away[0] * dy * k;
    this.pan.y += -right[1] * dx * perPixel + away[1] * dy * k;
    const { W, totalD: D } = this.office;
    this.pan.x = Math.max(-W / 2, Math.min(W / 2, this.pan.x));
    this.pan.y = Math.max(-D / 2, Math.min(D / 2, this.pan.y));
  }

  // Office state

  setOfficeState(state) {
    this.officeState = state;
    this.office.collection = state.collection ?? {};
    for (const cat of this.cats.values()) this.dressCat(cat);
    const key = officeKey(state, this.themePreview);
    if (key === this.officeKeyValue) return;
    this.officeKeyValue = key;
    this.rebuildOffice(state);
  }

  // Fur (a rare one if chosen) and clothes from the cat's profile.
  dressCat(cat) {
    const profile = this.officeState.cats?.[cat.session?.cwd];
    cat.setFur(RARE_LOOKS[profile?.fur] ?? catFur(cat.identityKey));
    cat.model.setWear(profile?.wear ?? {});
  }

  // Try on an office look from the shop without buying it (null puts back the real one).
  previewTheme(id) {
    if ((id ?? null) === (this.themePreview ?? null)) return;
    this.themePreview = id ?? null;
    this.officeKeyValue = officeKey(this.officeState, this.themePreview);
    this.rebuildOffice(this.officeState);
  }

  rebuildOffice(state) {
    for (const ix of [...this.interactions]) this.finishInteraction(ix);
    if (this.event) this.endEvent();
    this.office.dispose();
    this.office = new Office(this.scene, state, { ...this.officeOptions, weather: this.weather, theme: this.themePreview });
    this.office.setCutaway(this.azimuth);
    this.office.refreshSigns();
    this.office.showGrid(this.edit.on);
    for (const a of this.allAgents()) a.moveToOffice(this.office);
    if (this.edit.selected && !state.items.some((i) => i.uid === this.edit.selected.uid)) this.select(null);
    else if (this.edit.selected) this.select(state.items.find((i) => i.uid === this.edit.selected.uid));
    if (this.edit.ghost) this.refreshGhost();
    this.updateProjection();
  }

  // Edit mode

  setEditMode(on) {
    if (on) this.follow(null);
    else this.previewTheme(null);
    this.edit.on = on;
    this.office.showGrid(on);
    if (!on) this.cancelEdit(true);
  }

  // Start placing a new item from the shop; it follows the pointer.
  startPlacing(type) {
    this.select(null);
    const { w, d } = footprintSize({ type, rot: 0 });
    const c = this.lastFloor ?? { x: this.office.W / 2, z: this.office.D / 2 };
    this.setGhost({ type, rot: 0, x: Math.round(c.x - w / 2), z: Math.round(c.z - d / 2) }, { x: w / 2, z: d / 2 });
  }

  // Pick up a placed item; it follows the pointer until dropped.
  startMoving(item, grab = null) {
    const { w, d } = footprintSize(item);
    this.setGhost({ ...item }, grab ?? { x: w / 2, z: d / 2 });
    const entry = this.office.items.find((i) => i.item.uid === item.uid);
    if (entry) entry.group.visible = false;
  }

  setGhost(item, grab) {
    this.edit.ghost = item;
    this.edit.grab = grab;
    this.refreshGhost();
  }

  refreshGhost() {
    const ghost = this.edit.ghost;
    if (this.edit.ghostGroup) this.scene.remove(this.edit.ghostGroup);
    this.edit.ghostGroup = null;
    if (!ghost) {
      this.office.showFootprint(null);
      this.callbacks.onGhost?.(null);
      return;
    }
    this.edit.problem = placementError(this.officeState, ghost, ghost.uid ?? null);
    this.office.showFootprint(ghost, this.edit.problem ? 'bad' : 'ok');
    this.edit.ghostGroup = this.office.previewItem(ghost);
    this.scene.add(this.edit.ghostGroup);
    this.callbacks.onGhost?.({ item: ghost, problem: this.edit.problem });
  }

  moveGhostTo(point) {
    const ghost = this.edit.ghost;
    const x = Math.round(point.x - this.edit.grab.x);
    const z = Math.round(point.z - this.edit.grab.z);
    if (x === ghost.x && z === ghost.z) return;
    ghost.x = x;
    ghost.z = z;
    this.refreshGhost();
  }

  rotateItem() {
    if (this.edit.ghost) {
      this.edit.ghost.rot = (this.edit.ghost.rot + 1) % 4;
      const { w, d } = footprintSize(this.edit.ghost);
      this.edit.grab = { x: w / 2, z: d / 2 };
      this.refreshGhost();
    } else if (this.edit.selected) {
      const item = this.edit.selected;
      this.commit('move', { uid: item.uid, x: item.x, z: item.z, rot: (item.rot + 1) % 4 });
    }
  }

  async commitGhost() {
    const ghost = this.edit.ghost;
    if (!ghost) return;
    if (this.edit.problem) {
      this.callbacks.onMessage?.(this.edit.problem);
      return;
    }
    const action = ghost.uid ? 'move' : 'buy';
    const payload = ghost.uid ? { uid: ghost.uid, x: ghost.x, z: ghost.z, rot: ghost.rot } : { type: ghost.type, x: ghost.x, z: ghost.z, rot: ghost.rot };
    this.clearGhost();
    await this.commit(action, payload);
  }

  async commit(action, payload) {
    const result = await this.callbacks.onCommit?.(action, payload);
    if (result && !result.ok) {
      this.callbacks.onMessage?.(result.error);
      for (const entry of this.office.items) entry.group.visible = true;
    }
    return result;
  }

  clearGhost() {
    this.edit.ghost = null;
    this.refreshGhost();
  }

  cancelEdit(all = false) {
    if (this.edit.ghost) {
      this.clearGhost();
      for (const entry of this.office.items) entry.group.visible = true;
      if (!all) return;
    }
    this.select(null);
  }

  select(item) {
    this.edit.selected = item ?? null;
    if (!this.edit.ghost) this.office.showFootprint(item ?? null, 'select');
    this.callbacks.onSelect?.(item ?? null);
  }

  // Pointer

  pointerNdc(e) {
    const rect = this.container.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  floorPoint(e) {
    this.raycaster.setFromCamera(this.pointerNdc(e), this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
    if (hit) this.lastFloor = { x: hit.x, z: hit.z };
    return hit;
  }

  itemAt(e) {
    this.raycaster.setFromCamera(this.pointerNdc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.office.itemGroups(), true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && !o.userData.item) o = o.parent;
      if (o?.visible !== false && o?.userData.item) return o.userData.item;
    }
    return null;
  }

  pointerDown(e) {
    if (e.target.closest('button, aside, .panel')) return;
    this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, item: null };
    if (this.edit.on && !this.edit.ghost) this.drag.item = this.itemAt(e);
    this.container.setPointerCapture?.(e.pointerId);
  }

  pointerMove(e) {
    const point = this.edit.on ? this.floorPoint(e) : null;
    if (this.drag) {
      if (Math.hypot(e.clientX - this.drag.sx, e.clientY - this.drag.sy) > 6) this.drag.moved = true;
      if (this.edit.on && this.drag.item && this.drag.moved && !this.edit.ghost && point) {
        const item = this.drag.item;
        const { w, d } = footprintSize(item);
        const grab = { x: Math.min(w - 0.5, Math.max(0.5, point.x - item.x)), z: Math.min(d - 0.5, Math.max(0.5, point.z - item.z)) };
        this.select(null);
        this.startMoving(item, grab);
        this.drag.dragging = true;
      }
      if (this.edit.ghost && point) {
        this.moveGhostTo(point);
        return;
      }
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      // Dragging the view takes the camera back from the followed cat.
      if (this.following && this.drag.moved) this.follow(null);
      this.panBy(dx, dy);
      return;
    }
    if (this.edit.ghost && point) {
      this.moveGhostTo(point);
      return;
    }
    this.pick(e);
  }

  pointerUp(e) {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    if (!this.edit.on) {
      if (!drag.moved && this.hovered) {
        const cat = this.hovered.kitten ? this.hovered.parent : this.hovered;
        if (cat) this.callbacks.onCatClick?.(cat.id);
      }
      return;
    }
    if (this.edit.ghost && (drag.dragging || !drag.moved)) {
      this.commitGhost();
      return;
    }
    if (!drag.moved) this.select(this.itemAt(e));
  }

  // Sessions

  setSessions(sessions) {
    const live = sessions.filter((s) => s.status !== 'gone');
    // A cat belongs to its project; a second session in the same folder gets its own cat.
    const perFolder = new Map();
    const keyOf = new Map();
    for (const s of [...live].sort((a, b) => a.startedAt - b.startedAt)) {
      const n = perFolder.get(s.cwd) ?? 0;
      perFolder.set(s.cwd, n + 1);
      keyOf.set(s.id, n ? `${s.cwd}#${n}` : s.cwd || s.id);
    }
    const ids = new Set();
    for (const s of live) {
      const id = sessionKey(s);
      ids.add(id);
      let cat = this.cats.get(id);
      if (!cat) {
        const key = keyOf.get(s.id);
        cat = new Agent(this, { id, kind: 'cat', fur: catFur(key), name: catName(key) });
        cat.identityKey = key;
        this.cats.set(id, cat);
        if (this.time > 5) setTimeout(() => this.startInteraction('greet', null, cat), 2500);
      }
      cat.leaving = false;
      cat.trait = traitOf(s.cwd || s.id);
      cat.setSession(s);
      this.dressCat(cat);

      const subIds = new Set();
      for (const sub of s.subagents ?? []) {
        subIds.add(sub.id);
        let kitten = this.kittens.get(sub.id);
        if (!kitten) {
          kitten = new Agent(this, { id: sub.id, kind: 'kitten', fur: furFor(sub.id), name: 'kotě', parent: cat });
          this.kittens.set(sub.id, kitten);
        }
        kitten.setSession(sub);
      }
      for (const k of this.kittens.values()) if (k.parent === cat && !subIds.has(k.id)) k.leaving = true;
    }
    for (const cat of this.cats.values()) {
      if (!ids.has(cat.id)) {
        cat.leaving = true;
        cat.releaseDesk();
        for (const k of this.kittens.values()) if (k.parent === cat) k.leaving = true;
      }
    }
  }

  // Interactions between cats

  // A pair or visit between A and B, or a group game for `members` (A first).
  startInteraction(name, a, b, members = null) {
    const spec = SPECS[name];
    if (!spec) return false;
    if (members) [a, b] = members;
    if (!b || b.gone || b.leaving) return false;
    if (!a) {
      const idle = [...this.cats.values()].filter((c) => c !== b && c.isInterruptible());
      if (!idle.length) return false;
      a = idle[Math.floor(Math.random() * idle.length)];
    }
    const ix = prepareInteraction(name, a, b, this);
    ix.spec = spec;
    ix.members = members ?? (spec.kind === 'pair' ? [a, b] : [a]);
    ix.roles = ix.members.map((_, k) => ROLES[k]);
    ix.members.forEach((m, k) => (ix[ROLES[k]] = m));
    const targets = spec.place(this, ix);
    if (!targets) {
      for (const [spot, owner] of ix.spots) this.office.release(spot, owner);
      return false;
    }
    ix.members.forEach((m, k) => m.startInteraction(ix, ROLES[k], targets[ROLES[k]]));
    // Starting the activities released the cats' old spots; claim ours again.
    for (const [spot, owner] of ix.spots) spot.occupant = owner;
    this.interactions.push(ix);
    return true;
  }

  maybeStartInteraction() {
    const cats = [...this.cats.values()];
    const limit = Math.max(1, Math.floor(cats.length / 2));
    if (this.interactions.length >= limit) return;
    const idle = cats.filter((c) => c.isInterruptible());
    if (!idle.length) return;
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = idle[Math.floor(Math.random() * idle.length)];
      // Now and then a game for the whole gang.
      if (idle.length >= 3 && Math.random() < 0.22 && this.startGroupGame(a, idle)) return;
      // What A likes to do, by its personality.
      const taste = TRAIT_TASTE[a.trait] ?? {};
      const weights = {};
      for (const [name, spec] of Object.entries(INTERACTIONS)) if (spec.weight) weights[name] = spec.weight * (taste[name] ?? 1);
      let name = pickWeighted(weights);
      const spec = INTERACTIONS[name];
      const pool = spec.kind === 'visit' ? this.allAgents() : cats;
      const who = spec.who ?? idleAwake;
      const partners = pool.filter((b) => b !== a && !b.ix && who(b, this));
      if (!partners.length) continue;
      // Friends seek each other out for nice things, rivals for trouble.
      const affinity = (b) => {
        const r = this.relation(a, b);
        if (FRIENDLY.includes(name) || spec.rel === 'friend') return 1 + Math.max(0, r) / 20;
        if (HOSTILE.includes(name)) return 1 + Math.max(0, -r) / 15;
        return 1;
      };
      const b = pickWeighted(new Map(partners.map((p) => [p, affinity(p)])));
      name = this.fitToRelation(name, a, b);
      if (name && this.startInteraction(name, a, b)) return;
    }
  }

  // Swap an interaction for one that suits how the two cats get along, or null.
  fitToRelation(name, a, b) {
    const spec = INTERACTIONS[name];
    if (b.kitten || b.visitor || a.visitor) return spec.rel ? null : name;
    const r = this.relation(a, b);
    const swap = (list) => {
      const options = list.filter((n) => INTERACTIONS[n].kind === spec.kind && (!INTERACTIONS[n].who || INTERACTIONS[n].who(b, this)));
      return options.length ? pick(options) : null;
    };
    if (spec.rel === 'friend' && r < FRIENDS) return null;
    if (spec.rel === 'rival' && r > RIVALS) return r < 0 && Math.random() < -r / 40 ? name : null;
    if (r <= RIVALS && FRIENDLY.includes(name) && Math.random() < 0.7) return swap(HOSTILE);
    // The cooler two cats are, the more often a nice moment turns into a jab.
    if (r < 0 && (FRIENDLY.includes(name) || name === 'chat') && Math.random() < -r / 50) return swap(HOSTILE) ?? name;
    if (r >= FRIENDS && HOSTILE.includes(name) && Math.random() < 0.7) return swap([...FRIENDLY, ...FOR_FRIENDS]);
    if (r >= FRIENDS && !spec.rel && Math.random() < 0.3) return swap(FOR_FRIENDS) ?? name;
    if (r <= RIVALS && !spec.rel && Math.random() < 0.3) return swap(HOSTILE) ?? name;
    return name;
  }

  // Picks a game the office and the free cats allow and gathers the players.
  startGroupGame(a, idle) {
    const weights = {};
    for (const [name, g] of Object.entries(GAMES)) if (idle.length >= g.min && (!g.ok || g.ok(this))) weights[name] = g.weight;
    const name = pickWeighted(weights);
    if (!name) return false;
    const g = GAMES[name];
    const others = idle.filter((c) => c !== a).sort((p, q) => p.pos.distanceTo(a.pos) - q.pos.distanceTo(a.pos));
    const size = Math.min(g.max, idle.length, g.min + Math.floor(Math.random() * (g.max - g.min + 1)));
    const members = [a, ...others.slice(0, size - 1)];
    if (members.length < g.min) return false;
    if (!this.startInteraction(name, null, null, members)) return false;
    this.callbacks.onMessage?.(GAME_TITLES[name] ?? name);
    return true;
  }

  // What cat A thinks of cat B, -100..100 (0 for kittens and visitors). Pairs
  // that never met start from their natural chemistry.
  relation(a, b) {
    const ka = profileKey(a);
    const kb = profileKey(b);
    if (!ka || !kb || a.kitten || b.kitten || a.visitor || b.visitor || ka === kb) return 0;
    return relationOf(this.officeState.relations, ka, kb);
  }

  // The cat C likes most among those present, if it likes anyone that much.
  bestFriend(c) {
    let best = null;
    let value = FRIENDS;
    for (const o of this.cats.values()) {
      if (o === c || o.leaving) continue;
      const r = this.relation(c, o);
      if (r >= value) {
        value = r;
        best = o;
      }
    }
    return best;
  }

  updateInteractions(t, dt) {
    if (t > this.nextInteraction) {
      this.nextInteraction = t + rnd(3, 6);
      this.maybeStartInteraction();
    }
    for (const ix of [...this.interactions]) {
      const spec = ix.spec;
      const roles = ix.roles;
      const broken =
        ix.cancel ||
        roles.some((r) => ix[r].act?.ix !== ix) ||
        ix.b.gone ||
        ix.members.some((m) => m.gone || m.leaving) ||
        (ix.started != null && spec.stillValid && !spec.stillValid(ix));
      if (broken) {
        this.finishInteraction(ix);
        continue;
      }
      if (ix.started == null) {
        if (roles.every((r) => ix.ready[r])) {
          ix.started = t;
          ix.elapsed = 0;
          ix.until = t + rnd(...spec.dur);
          spec.start?.(ix, this);
          if (spec.sound) this.sound.play(spec.sound);
        } else if (t - ix.t0 > (spec.kind === 'group' ? 25 : 18)) {
          this.finishInteraction(ix);
        }
        continue;
      }
      ix.elapsed = t - ix.started;
      (spec.script ?? []).forEach(([at, role, lines], k) => {
        if (ix.fired.has(k) || ix.elapsed < at) return;
        ix.fired.add(k);
        const line = lines[Math.floor(Math.random() * lines.length)];
        const partner = role === 'a' ? ix.b : ix.a;
        ix[role].caption(typeof line === 'function' ? line(ix, this) : line, partner);
      });
      spec.tick?.(ix, t, dt, this);
      if (t > ix.until || ix.done) this.finishInteraction(ix);
    }
  }

  finishInteraction(ix) {
    if (ix.finished) return;
    ix.finished = true;
    const spec = ix.spec;
    const played = ix.started != null;
    if (played) this.settle(ix);
    for (const role of ix.roles) {
      const cat = ix[role];
      if (cat?.act?.ix === ix) cat.act.done = true;
      if (cat?.ix === ix) cat.ix = null;
      if (cat) cat.isVibing = false;
    }
    for (const [spot, owner] of ix.spots) this.office.release(spot, owner);
    this.interactions = this.interactions.filter((other) => other !== ix);
    spec.finish?.(ix, this);
  }

  // What came of an interaction: relation changes, stats, wins, jealousy.
  settle(ix) {
    const spec = ix.spec;
    const real = (c) => c && !c.kitten && !c.visitor && profileKey(c);
    const relate = (a, b, delta) => {
      const [ka, kb] = [profileKey(a), profileKey(b)];
      if (delta && real(a) && real(b) && ka !== kb) this.pendingRelations.push({ a: ka, b: kb, delta });
    };
    if (spec.kind === 'group') {
      const d = GAME_DELTA[ix.name] ?? 1;
      for (let i = 0; i < ix.members.length; i++) for (let j = i + 1; j < ix.members.length; j++) relate(ix.members[i], ix.members[j], d);
    } else {
      relate(ix.a, ix.b, spec.delta ? spec.delta(ix, this) : RELATION_DELTA[ix.name]);
    }
    const stats = typeof spec.stat === 'function' ? spec.stat(ix) : spec.stat;
    for (const name of [stats].flat().filter(Boolean)) this.addStat(name);
    if (spec.game) {
      this.addStat('games');
      if (this.office.now().getHours() < 5) this.addStat('nightGames');
    }
    for (const w of [ix.winner, ...(ix.winners ?? [])].filter(real)) this.addWin(w);
    if (spec.kind === 'pair' && RELATION_DELTA[ix.name] >= 2 && !spec.delta) this.maybeJealous(ix);
  }

  // A cat whose best friend just had a lovely time with someone else gets jealous.
  maybeJealous(ix) {
    const pair = [ix.a, ix.b];
    if (pair.some((c) => c.kitten || c.visitor)) return;
    for (const c of this.cats.values()) {
      if (pair.includes(c) || c.leaving || c.appear < 0.5 || this.time - (c.jealousAt ?? -1e9) < 90) continue;
      const best = this.bestFriend(c);
      if (!best || !pair.includes(best) || Math.random() > 0.45) continue;
      const other = best === ix.a ? ix.b : ix.a;
      if (this.relation(c, other) > this.relation(c, best)) continue;
      c.jealousAt = this.time;
      this.pendingRelations.push({ a: profileKey(c), b: profileKey(other), delta: -8 }, { a: profileKey(c), b: profileKey(best), delta: -2 });
      this.addStat('jealousy');
      c.caption(pick(JEALOUS_LINES)(c, best, other));
      c.reaction = { kind: 'jealous', until: this.time + 2.5 };
      return;
    }
  }

  addStat(name, n = 1) {
    this.pendingStats[name] = (this.pendingStats[name] ?? 0) + n;
  }

  addWin(agent) {
    const key = profileKey(agent);
    if (key) this.pendingWins[key] = (this.pendingWins[key] ?? 0) + 1;
  }

  // A crab rave is contagious: idle cats nearby join in.
  recruitDancers(leader) {
    const dancers = () => [...this.cats.values()].filter((c) => c.act?.name === 'crabDance');
    for (const c of this.cats.values()) {
      if (c === leader || !c.isInterruptible() || c.pos.distanceTo(leader.pos) > 4 || Math.random() < 0.35) continue;
      c.endActivity();
      c.startActivity('crabDance');
    }
    // Counted once the dance floor is busy.
    setTimeout(() => {
      if (dancers().length >= 3 && this.time - (this.lastRave ?? -1e9) > 30) {
        this.lastRave = this.time;
        this.addStat('crabRave');
        this.callbacks.onMessage?.('Krabí rave!');
      }
    }, 4000);
  }

  // The other cats comment on someone's tests, builds and deploys.
  onResult(cat, kind) {
    const now = this.office.now();
    const friday = (kind === 'deploy' || kind === 'push') && now.getDay() === 5 && now.getHours() >= 13;
    const others = [...this.cats.values()].filter((c) => c !== cat && !c.leaving && c.appear > 0.5);
    if (!others.length) return;
    const speakers = friday ? others.sort(() => Math.random() - 0.5).slice(0, 2) : Math.random() < 0.5 ? [pick(others)] : [];
    for (const c of speakers) {
      const r = this.relation(c, cat);
      const mood = r >= FRIENDS ? 'friend' : r <= RIVALS ? 'rival' : 'neutral';
      const lines = friday ? BYSTANDER.friday : BAD.has(kind) ? BYSTANDER.bad[mood] : GOOD.has(kind) ? BYSTANDER.good[mood] : BYSTANDER[kind];
      if (!lines) continue;
      setTimeout(() => !c.gone && c.caption(pick(lines), cat), rnd(900, 2200));
    }
  }

  // Memes count for the achievements.
  countMeme(meme) {
    this.addStat('memes');
    if (typeof meme === 'string') this.addStat(meme);
  }

  // Keyboards clatter while cats type, the fire crackles, automats bleep.
  ambientSound(dt) {
    if (!this.sound.enabled) return;
    const typing = this.allAgents().filter((a) => a.pose === 'typing' || a.pose === 'typingFast').length;
    if (typing && Math.random() < dt * typing * 5) this.sound.play('key');
    if (this.office.spots.some((s) => s.kind === 'fire') && Math.random() < dt * 3) this.sound.play('crackle');
    const gaming = this.allAgents().some((a) => a.pose === 'arcade' || a.pose === 'gamepad');
    if (gaming && Math.random() < dt * 0.6) this.sound.play('bleep', { throttle: 1 });
  }

  // Cats walking on the floor gently push apart instead of walking through each other.
  // Cats settled on a spot (desk, bed) stay put; the other one makes way.
  separateCats(dt) {
    const agents = this.allAgents().filter((a) => a.appear > 0.5 && a.lift < 0.05 && !a.ix);
    const free = (a) => a.moving || !a.act?.spot || a.act.phase !== 'do';
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i];
        const b = agents[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.kitten || b.kitten ? 0.32 : 0.45;
        if (d >= min) continue;
        if (d < 1e-4) {
          // Exactly on top of each other (e.g. kittens sent to the same point): nudge apart.
          b.pos.x += 0.02;
          continue;
        }
        const fa = free(a);
        const fb = free(b);
        if (!fa && !fb) continue;
        if (a.ghostUntil > this.time || b.ghostUntil > this.time) continue;
        const push = Math.min(1, dt * 6) * (min - d);
        const share = fa && fb ? 0.5 : 1;
        if (fa) a.pos.set(a.pos.x - (dx / d) * push * share, 0, a.pos.z - (dz / d) * push * share);
        if (fb) b.pos.set(b.pos.x + (dx / d) * push * share, 0, b.pos.z + (dz / d) * push * share);
      }
    }
  }

  // Needs refilled by the cats' activities are sent to the server in batches.
  addRestore(key, gains) {
    const sum = (this.pendingRestore[key] ??= {});
    for (const [need, g] of Object.entries(gains)) sum[need] = (sum[need] ?? 0) + g;
  }

  flushRestore(dt) {
    this.restoreTimer = (this.restoreTimer ?? 0) + dt;
    if (this.restoreTimer < 3) return;
    this.restoreTimer = 0;
    for (const [cat, gains] of Object.entries(this.pendingRestore)) {
      this.callbacks.onCommit?.('restore', { cat, gains: Object.fromEntries(Object.entries(gains).map(([k, v]) => [k, Math.round(v * 10) / 10])) });
    }
    this.pendingRestore = {};
    if (this.pendingRelations.length) this.callbacks.onCommit?.('relate', { changes: this.pendingRelations });
    this.pendingRelations = [];
    if (Object.keys(this.pendingStats).length || Object.keys(this.pendingWins).length) {
      this.callbacks.onCommit?.('record', { stats: this.pendingStats, wins: this.pendingWins });
    }
    this.pendingStats = {};
    this.pendingWins = {};
  }

  // The player and the cats

  // Pet a cat or give it a treat (from its card); the toy is the laser pointer.
  async pamper(catId, kind) {
    const cat = this.cats.get(catId);
    if (!cat || cat.leaving) return;
    if (kind === 'toy') {
      if (cat.mode !== 'idle' || cat.ix) {
        cat.caption(pick(['teď ne, pracuju', 'až potom', 'nerozptyluj mě']));
        return;
      }
      cat.endActivity();
      cat.startActivity('laser');
      return;
    }
    const result = await this.callbacks.onCommit?.('pamper', { cat: profileKey(cat), kind });
    if (result?.ok) cat.pamper(kind);
    else if (result) this.callbacks.onMessage?.(result.error);
  }

  // Something new for the collection: a find during an activity or an event.
  found(agent, id, message = null) {
    const name = COLLECTIBLES[id]?.name;
    if (!name) return;
    if (agent && !message) {
      agent.caption(`${agent.g('našel', 'našla')} jsem: ${name.toLowerCase()}!`);
      for (let k = 0; k < 10; k++) this.office.spawnParticle('spark', agent.pos.x, agent.lift + 0.6, agent.pos.z);
    }
    this.sound.play('find');
    this.callbacks.onMessage?.(message ?? `${agent?.name ?? 'Kočka'} ${agent?.g('našel', 'našla') ?? 'našla'}: ${name}`);
    this.callbacks.onCommit?.('collect', { id });
  }

  // Random events

  addVisitor({ name, gender }, fur) {
    const id = `visitor-${Math.random().toString(36).slice(2, 8)}`;
    const agent = new Agent(this, { id, kind: 'visitor', fur, name, gender });
    this.visitors.set(id, agent);
    return agent;
  }

  triggerEvent(name) {
    const spec = EVENTS[name];
    if (!spec || this.event) return false;
    const ev = { name, spec, t0: this.time, done: false };
    this.event = ev;
    spec.start(this, ev, this.time);
    return true;
  }

  endEvent() {
    const ev = this.event;
    this.event = null;
    ev.spec.end?.(this, ev);
    this.nextEvent = this.time + 180 + Math.random() * 300;
  }

  updateEvent(t, dt) {
    if (this.event) {
      this.event.spec.tick(this, this.event, t, dt);
      if (this.event.done) this.endEvent();
      return;
    }
    if (t < this.nextEvent || this.edit.on) return;
    const present = [...this.cats.values()].filter((c) => !c.leaving && c.appear > 0.5);
    if (!present.length) {
      this.nextEvent = t + 30;
      return;
    }
    const weights = {};
    for (const [name, spec] of Object.entries(EVENTS)) if (!spec.ok || spec.ok(this)) weights[name] = spec.weight;
    const name = this.forcedEvent && EVENTS[this.forcedEvent] ? this.forcedEvent : pickWeighted(weights);
    this.forcedEvent = null;
    if (!this.triggerEvent(name)) this.nextEvent = t + 30;
  }

  freeDesk() {
    const used = new Set([...this.cats.values()].filter((c) => !c.leaving).map((c) => c.deskIndex));
    for (let i = 0; i < this.office.desks.length; i++) if (!used.has(i)) return i;
    return null;
  }

  // Following a cat with the camera

  // Start following a cat (by id) or stop with null. The app hears about it
  // through onFollow, also when the camera lets go by itself.
  follow(catId, message = null) {
    const cat = catId ? this.cats.get(catId) : null;
    const next = cat && !cat.leaving && !cat.gone ? catId : null;
    if (next) this.followZoom = Math.max(this.zoom, 2.2);
    if (next === this.following && !message) return;
    this.following = next;
    this.callbacks.onFollow?.(next);
    if (message) this.callbacks.onMessage?.(message);
  }

  // Glides the view after the followed cat; a cat walking out of the door ends it.
  updateFollow(dt) {
    if (!this.following) return;
    const cat = this.cats.get(this.following);
    if (!cat || cat.leaving || cat.gone) {
      this.follow(null, cat ? `${cat.name} ${cat.g('odešel', 'odešla')}, kamera už nesleduje.` : 'Kočka odešla, kamera už nesleduje.');
      return;
    }
    const k = Math.min(1, dt * 4);
    this.pan.x += (cat.pos.x - this.office.center.x - this.pan.x) * k;
    this.pan.y += (cat.pos.z - this.office.center.z - this.pan.y) * k;
    if (this.zoom < this.followZoom - 0.01) {
      this.zoom += (this.followZoom - this.zoom) * Math.min(1, dt * 3);
      this.updateProjection();
    }
  }

  // View

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const px = Math.max(2, Math.min(4, Math.round(this.width / 560)));
    this.pipeline.setSize(this.width, this.height, px, this.camera.far - this.camera.near);
    const dpr = window.devicePixelRatio || 1;
    this.overlay.width = Math.round(this.width * dpr);
    this.overlay.height = Math.round(this.height * dpr);
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.octx.imageSmoothingEnabled = false;
    this.updateProjection();
  }

  updateProjection() {
    const { W, totalD: D } = this.office;
    const aspect = this.width / this.height;
    const span = Math.SQRT1_2 * (W + D);
    const viewW = span + 1;
    const viewH = span * Math.sin(ELEVATION) + 2.4 * Math.cos(ELEVATION) + 1.4;
    let halfH = viewW / aspect > viewH ? viewW / aspect / 2 : viewH / 2;
    halfH /= this.zoom;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.left = -halfH * aspect;
    this.camera.right = halfH * aspect;
    this.camera.updateProjectionMatrix();
  }

  updateCamera(dt) {
    const prev = this.azimuth;
    this.azimuth += (this.targetAzimuth - this.azimuth) * Math.min(1, dt * 6);
    if (Math.abs(this.targetAzimuth - this.azimuth) < 0.001) this.azimuth = this.targetAzimuth;
    if (Math.abs(prev - this.azimuth) > 1e-5 || !this.cutawayAt || Math.abs(this.cutawayAt - this.azimuth) > 0.3) {
      this.office.setCutaway(this.azimuth);
      this.cutawayAt = this.azimuth;
    }
    const c = { x: this.office.center.x + this.pan.x, z: this.office.center.z + this.pan.y };
    const dist = 40;
    this.camera.position.set(
      c.x + Math.sin(this.azimuth) * Math.cos(ELEVATION) * dist,
      dist * Math.sin(ELEVATION) + 0.6,
      c.z + Math.cos(this.azimuth) * Math.cos(ELEVATION) * dist,
    );
    this.camera.lookAt(c.x, 0.6, c.z);
    this.camera.updateMatrixWorld();
  }

  project(v) {
    const p = v.clone().project(this.camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
  }

  pick(e) {
    const rect = this.container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best = null;
    let bestD = 40;
    for (const a of this.allAgents()) {
      const p = this.project(a.headPosition(this.tmp));
      if (!p) continue;
      const d = Math.hypot(p.x - mx, p.y + 12 - my);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    this.hovered = best;
    this.container.style.cursor = best ? 'pointer' : this.edit.on ? 'grab' : '';
  }

  // Loop

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const t = this.time;

    this.updateFollow(dt);
    this.updateCamera(dt);
    this.office.update(dt, t);
    this.updateInteractions(t, dt);
    for (const [id, a] of this.cats) {
      a.update(dt, t);
      if (a.gone && a.appear < 0.02) {
        a.dispose();
        this.cats.delete(id);
      }
    }
    for (const [id, k] of this.kittens) {
      k.update(dt, t);
      if (k.gone && k.appear < 0.02) {
        k.dispose();
        this.kittens.delete(id);
      }
    }
    for (const [id, v] of this.visitors) {
      v.update(dt, t);
      if (v.gone && v.appear < 0.02) {
        v.dispose();
        this.visitors.delete(id);
      }
    }
    this.updateEvent(t, dt);
    this.separateCats(dt);
    this.flushRestore(dt);
    this.ambientSound(dt);

    this.pipeline.render(this.scene, this.camera);
    this.octx.clearRect(0, 0, this.width, this.height);
    drawOverlay(this.octx, this, (v) => this.project(v), t);
  }
}

