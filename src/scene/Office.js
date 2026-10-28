// The cat office: the room shell (floor, walls, windows, door, lights) plus the
// furniture the player owns. Furniture comes from the saved office state and
// brings its own spots, blocked tiles and animations (see items.js).

import * as THREE from 'three';
import { GARDEN, ITEMS, blockedTiles, footprintSize, hedgeTiles, layoutOf } from '../../shared/catalog.js';
import { buildItem } from './items.js';
import { NavGrid } from './nav.js';
import { themeLook } from './themes.js';
import { BOX, StaticBuilder, mat } from './voxel.js';
import {
  floorTexture,
  grassTexture,
  moonPhase,
  nightSkyTexture,
  posterTexture,
  screenTexture,
  textTexture,
  wallpaperTexture,
  weatherTexture,
} from './textures.js';

const PI = Math.PI;
const WALL_H = 2.4;
export const HEADING = { N: PI, S: 0, E: PI / 2, W: -PI / 2 };

const SCREEN_KINDS = ['shell', 'write', 'read', 'web', 'agent', 'mcp', 'other', 'think'];
const SCREEN_LIGHT = {
  shell: '#4CFF7A',
  write: '#8FB8FF',
  read: '#FFE9B8',
  web: '#FFFFFF',
  agent: '#7FD8A6',
  mcp: '#5E9CF0',
  other: '#D0D0D0',
  think: '#8888CC',
};
const SCROLL = { shell: 0.9, write: 0.35, web: 0.25, mcp: 0.5, agent: 0.3, other: 0.3, read: 0.1, think: 0.02 };

function toWorld(fx, fz, rot, x, z) {
  return [fx + x * Math.cos(rot) + z * Math.sin(rot), fz - x * Math.sin(rot) + z * Math.cos(rot)];
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Easter Sunday (anonymous Gregorian algorithm).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Decorations by date: Christmas, Halloween, Easter and the cat days (17 Feb, 8 Aug).
export function seasonFor(date = new Date()) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const easter = easterSunday(date.getFullYear());
  const fromEaster = Math.round((new Date(date.getFullYear(), m - 1, d) - easter) / 86_400_000);
  if (fromEaster >= -3 && fromEaster <= 1) return 'easter';
  if ((m === 12) || (m === 1 && d <= 6)) return 'christmas';
  if ((m === 10 && d >= 15) || (m === 11 && d <= 2)) return 'halloween';
  if ((m === 2 && d === 17) || (m === 8 && d === 8)) return 'catDay';
  return null;
}

const WEATHER_SKY = { cloudy: '#8A97A8', rain: '#5E6B7C', storm: '#3A4252', fog: '#B8BEC6', snow: '#C9D2DC' };
const WEATHER_SUN = { clear: 1, cloudy: 0.6, rain: 0.45, storm: 0.35, fog: 0.5, snow: 0.7 };
// How many stars get through the clouds.
const WEATHER_STARS = { clear: 1, cloudy: 0.35, fog: 0.15, snow: 0.2 };
// Cats stay inside when it rains or snows.
const BAD_WEATHER = new Set(['rain', 'storm', 'snow']);

export class Office {
  constructor(scene, state, { season = seasonFor(), weather = null, hour = null, theme = null } = {}) {
    const size = state.size;
    // The office look: bought in the shop, or tried on from it (`theme`).
    this.themeId = theme ?? state.theme ?? 'classic';
    this.look = themeLook(this.themeId);
    this.layout = layoutOf(size, !!state.garden);
    this.W = size;
    this.D = size;
    this.totalD = this.layout.d;
    this.garden = this.layout.garden;
    this.hour = hour;
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.nav = new NavGrid(this.W, this.totalD);
    for (const [i, j] of hedgeTiles(this.layout)) this.nav.block(i, j);
    this.center = new THREE.Vector3(size / 2, 0, this.totalD / 2);
    this.spots = [];
    this.desks = [];
    this.walls = [];
    this.particles = [];
    this.glass = [];
    this.panes = [];
    this.weather = { kind: 'clear' };
    this.season = season;
    this.blinkers = [];
    this.swingers = [];
    this.sunbeams = [];
    this.signs = [];
    this.toys = [];
    this.yarns = [];
    this.items = [];
    this.nightPanes = [];
    this.power = 1;
    this.blackout = null;
    this.outdoorOk = true;
    this.collection = state.collection ?? {};
    this.areas = { lounge: { i0: 0, i1: size, j0: 1, j1: this.totalD }, room: { i0: 0, i1: size, j0: 0, j1: size } };
    if (this.garden) this.areas.garden = { i0: 0, i1: size, j0: size + 1, j1: this.totalD };
    this.screenTex = Object.fromEntries(SCREEN_KINDS.map((k) => [k, screenTexture(k)]));
    this.screenOff = new THREE.MeshBasicMaterial({ color: '#1C2420' });

    this.buildShell();
    this.buildLights();
    this.buildWallDecor();
    this.buildThemeDecor();
    if (weather) this.setWeather(weather);
    for (const item of state.items) this.addItem(item);
    this.buildSeasonal();
    if (this.garden) this.buildGarden();
    this.buildGrid();
    this.updateEnvironment(true);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry && o.geometry !== BOX) o.geometry.dispose();
    });
  }

  // Furniture

  addItem(item) {
    if (!ITEMS[item.type]) return;
    const ctx = buildItem(this, item);
    this.group.add(ctx.group);
    for (const [i, j] of blockedTiles(item)) this.nav.block(i, j);
    this.items.push({ item, group: ctx.group, updates: ctx.updates });
  }

  // A see-through copy of an item for placing or moving it in edit mode.
  previewItem(item) {
    const ctx = buildItem(this, item, { preview: true });
    ctx.group.traverse((o) => {
      if (o.isMesh) {
        o.material = this.ghostMaterial;
        o.castShadow = false;
      }
    });
    return ctx.group;
  }

  itemGroups() {
    return this.items.map((i) => i.group);
  }

  addYarn(x, z) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), mat('#D0384A'));
    mesh.castShadow = true;
    mesh.position.set(x, 0.075, z);
    this.group.add(mesh);
    const yarn = { mesh, x, z, vx: 0, vz: 0 };
    this.yarns.push(yarn);
    this.yarn ??= yarn;
  }

  kickYarn(dirX, dirZ, power = 1.6) {
    if (!this.yarn) return;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.yarn.vx += (dirX / len) * power;
    this.yarn.vz += (dirZ / len) * power;
  }

  // Spots

  addSpot(kind, x, z, extra = {}) {
    const spot = { kind, x, z, lift: 0, heading: 0, approach: this.nav.tileOf(x, z), occupant: null, outdoor: this.garden && z >= this.D, ...extra };
    this.spots.push(spot);
    return spot;
  }

  spotsOf(kind) {
    return this.spots.filter((s) => s.kind === kind);
  }

  // Garden spots are off limits in rain and snow.
  usable(spot) {
    return this.outdoorOk || !spot.outdoor;
  }

  has(kind) {
    return this.spots.some((s) => s.kind === kind && this.usable(s));
  }

  reserve(kind, agent, { filter = null, near = null } = {}) {
    let free = this.spots.filter((s) => s.kind === kind && this.usable(s) && (!s.occupant || s.occupant === agent));
    if (filter) free = free.filter(filter);
    if (!free.length) return null;
    let spot;
    if (near) {
      free.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));
      spot = free[0];
    } else {
      spot = free[Math.floor(Math.random() * free.length)];
    }
    spot.occupant = agent;
    return spot;
  }

  release(spot, agent) {
    if (spot && spot.occupant === agent) spot.occupant = null;
  }

  // Desks

  setDeskScreen(index, kind) {
    const desk = this.desks[index];
    if (!desk) return;
    desk.kind = kind;
    if (!kind) {
      desk.screen.material = this.screenOff;
      return;
    }
    desk.materials ??= {};
    desk.materials[kind] ??= new THREE.MeshBasicMaterial({ map: this.screenTex[kind] });
    desk.screen.material = desk.materials[kind];
    desk.light?.color.set(SCREEN_LIGHT[kind]);
  }

  knockCup(index) {
    const cup = this.desks[index]?.cup;
    if (!cup || cup.state !== 'desk') return false;
    cup.state = 'fall';
    cup.t = 0;
    cup.vz = 0.9;
    cup.vy = 0.4;
    return true;
  }

  cupOnDesk(index) {
    return this.desks[index]?.cup.state === 'desk';
  }

  // Room shell

  buildShell() {
    const { W, D } = this;
    const look = this.look;
    // Neon looks have glowing skirting and cornices.
    const trimMat = (color) => mat(color, { basic: !!look.glowTrim });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: floorTexture(W, D, look.floor) }));
    floor.rotation.x = -PI / 2;
    floor.position.set(W / 2, 0, D / 2);
    floor.receiveShadow = true;
    this.floor = floor;
    this.group.add(floor);

    // The room sits on a dark slab like a diorama.
    const slab = new THREE.Mesh(BOX, mat(look.slab));
    slab.scale.set(W + 0.6, 0.35, this.totalD + 0.6);
    slab.position.set(W / 2, -0.176, this.totalD / 2);
    this.group.add(slab);

    const wallDefs = [
      { id: 'N', len: W, pos: [W / 2, -0.075], size: [W + 0.3, 0.15], normal: [0, -1] },
      { id: 'W', len: D, pos: [-0.075, D / 2], size: [0.15, D + 0.3], normal: [-1, 0] },
      { id: 'S', len: W, pos: [W / 2, D + 0.075], size: [W + 0.3, 0.15], normal: [0, 1] },
      { id: 'E', len: D, pos: [W + 0.075, D / 2], size: [0.15, D + 0.3], normal: [1, 0] },
    ];
    // With a garden the south wall has a door in it: the wall is built in pieces
    // along x, skipping the door, plus a lintel above it.
    const [g0, g1] = [GARDEN.gap[0], GARDEN.gap[GARDEN.gap.length - 1] + 1];
    const pieces = (def) =>
      def.id === 'S' && this.garden
        ? [
            [-0.15, g0 - 0.05, 0, WALL_H],
            [g1 + 0.05, W + 0.15, 0, WALL_H],
            [g0 - 0.05, g1 + 0.05, 1.9, WALL_H],
          ]
        : null;
    for (const def of wallDefs) {
      const split = pieces(def);
      let full;
      let stub;
      if (split) {
        full = new THREE.Group();
        stub = new THREE.Group();
        for (const [x0, x1, y0, y1] of split) {
          const m = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: wallpaperTexture(x1 - x0, y1 - y0, look.wall) }));
          m.scale.set(x1 - x0, y1 - y0, def.size[1]);
          m.position.set((x0 + x1) / 2, (y0 + y1) / 2, def.pos[1]);
          m.receiveShadow = true;
          full.add(m);
          if (y0 > 0) continue;
          const s = new THREE.Mesh(BOX, mat(look.stub));
          s.scale.set(x1 - x0, 0.22, def.size[1]);
          s.position.set((x0 + x1) / 2, 0.11, def.pos[1]);
          stub.add(s);
        }
        const frame = new StaticBuilder();
        for (const x of [g0 - 0.04, g1 + 0.04]) frame.box(x, 0, D + 0.075, 0.08, 1.9, 0.2, look.doorFrame);
        frame.box((g0 + g1) / 2, 1.86, D + 0.075, g1 - g0 + 0.16, 0.08, 0.2, look.doorFrame);
        full.add(frame.build(new THREE.MeshLambertMaterial({ vertexColors: true })));
      } else {
        full = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ map: wallpaperTexture(def.len, WALL_H, look.wall) }));
        full.scale.set(def.size[0], WALL_H, def.size[1]);
        full.position.set(def.pos[0], WALL_H / 2, def.pos[1]);
        full.receiveShadow = true;
        stub = new THREE.Mesh(BOX, mat(look.stub));
        stub.scale.set(def.size[0], 0.22, def.size[1]);
        stub.position.set(def.pos[0], 0.11, def.pos[1]);
      }
      const decor = new THREE.Group();
      const trim = new THREE.Mesh(BOX, trimMat(look.trim));
      trim.scale.set(def.size[0], 0.06, def.size[1] + 0.02);
      trim.position.set(def.pos[0], WALL_H, def.pos[1]);
      decor.add(trim);
      const base = new THREE.Mesh(BOX, trimMat(look.base));
      if (def.id === 'N' || def.id === 'S') base.scale.set(def.len, 0.12, 0.04);
      else base.scale.set(0.04, 0.12, def.len);
      const inset = def.id === 'N' ? [W / 2, 0.02] : def.id === 'S' ? [W / 2, D - 0.02] : def.id === 'W' ? [0.02, D / 2] : [W - 0.02, D / 2];
      base.position.set(inset[0], 0.06, inset[1]);
      if (!split) decor.add(base);
      this.group.add(full, stub, decor);
      this.walls.push({ ...def, full, stub, decor });
    }

    // Laser pointer dot
    const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), new THREE.MeshBasicMaterial({ color: '#FF2A2A' }));
    dot.rotation.x = -PI / 2;
    dot.visible = false;
    this.group.add(dot);
    this.laser = { mesh: dot, active: false, x: 2, z: 5, tx: 2, tz: 5, until: 0 };

    // Spots that belong to the room itself
    for (const dx of [0, -1.2, 1.2, -2.4, 2.4]) this.addSpot('front', W / 2 + dx, D - 0.7, { facesCamera: true });
  }

  wall(id) {
    return this.walls.find((w) => w.id === id);
  }

  setCutaway(azimuth) {
    const cx = Math.sin(azimuth);
    const cz = Math.cos(azimuth);
    for (const w of this.walls) {
      const near = w.normal[0] * cx + w.normal[1] * cz > 0.05;
      w.full.visible = !near;
      w.decor.visible = !near;
      w.stub.visible = near;
    }
  }

  buildLights() {
    const { W, D } = this;
    this.hemi = new THREE.HemisphereLight('#FFE2B8', '#3A2A40', 1);
    this.sun = new THREE.DirectionalLight('#FFF1D6', 1.6);
    this.sun.position.set(W / 2 - 6, 10, D / 2 - 4.5);
    this.sun.target.position.copy(this.center);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const r = Math.max(W, D) * 0.8;
    Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 40 });
    this.sun.shadow.bias = -0.0008;
    this.group.add(this.hemi, this.sun, this.sun.target);
    this.roomLights = [W * 0.3, W * 0.72].map((x) => {
      // Lights hang in the room, the garden only gets their glow through the door.
      const l = new THREE.PointLight(this.look.light, 1, Math.max(W, D) * 0.9, 1);
      l.position.set(x, 2.4, D * 0.5);
      this.group.add(l);
      return l;
    });
  }

  windowAt(wallId, along, { sunbeam = false } = {}) {
    const wall = this.wall(wallId);
    const rot = wallId === 'N' ? 0 : PI / 2;
    const [fx, fz] = wallId === 'N' ? [along, 0] : [0, along];
    const look = this.look;
    const deco = new StaticBuilder().at(fx, fz, rot);
    deco.box(0, 0.78, 0.02, 1.5, 1.08, 0.06, look.frame);
    deco.box(0, 0.8, 0.055, 0.04, 1.0, 0.01, look.frame);
    deco.box(0, 1.29, 0.055, 1.38, 0.04, 0.01, look.frame);
    deco.box(0, 0.76, 0.16, 1.62, 0.05, 0.3, look.sill);
    if (look.curtain) {
      // Torn curtains hang short and ragged; checked ones get a pale stripe.
      const [y, h] = look.torn ? [1.05, 0.95] : [0.68, 1.3];
      for (const x of [-0.86, 0.86]) {
        deco.box(x, y, 0.06, 0.24, h, 0.04, look.curtain);
        if (look.torn) deco.box(x + 0.06, y - 0.18, 0.06, 0.08, 0.18, 0.04, look.curtain);
        if (look.checked) for (const k of [0.3, 0.7, 1.1]) deco.box(x, y + k, 0.065, 0.25, 0.05, 0.04, '#F2E6C9');
      }
    } else if (look.blinds) {
      for (let k = 0; k < 4; k++) deco.box(0, 1.72 - k * 0.07, 0.07, 1.4, 0.03, 0.02, look.blinds);
    }
    wall.decor.add(deco.build(new THREE.MeshLambertMaterial({ vertexColors: true })));

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.94), new THREE.MeshBasicMaterial({ color: '#8FD3F5' }));
    const [gx, gz] = toWorld(fx, fz, rot, 0, 0.051);
    glass.position.set(gx, 1.32, gz);
    glass.rotation.y = rot;
    wall.decor.add(glass);
    this.glass.push(glass);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.94), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    const [px, pz] = toWorld(fx, fz, rot, 0, 0.054);
    pane.position.set(px, 1.32, pz);
    pane.rotation.y = rot;
    pane.visible = false;
    wall.decor.add(pane);
    this.panes.push(pane);
    // Stars (and on the first window the moon) shine through at night.
    const first = !this.nightPanes.length;
    const night = new THREE.Mesh(
      new THREE.PlaneGeometry(1.36, 0.94),
      new THREE.MeshBasicMaterial({ map: nightSkyTexture(31 + this.nightPanes.length * 7, first ? moonPhase(this.now()) : null), transparent: true, opacity: 0, depthWrite: false }),
    );
    const [nx, nz] = toWorld(fx, fz, rot, 0, 0.0525);
    night.position.set(nx, 1.32, nz);
    night.rotation.y = rot;
    wall.decor.add(night);
    this.nightPanes.push(night);
    this.sills = [...(this.sills ?? []), { wall, fx, fz, rot }];

    const [sx, sz] = toWorld(fx, fz, rot, 0.2, 0.2);
    const [ax, az] = toWorld(fx, fz, rot, 0, 0.7);
    this.addSpot('sill', sx, sz, { lift: 0.82, heading: rot + PI, approach: this.nav.tileOf(ax, az) });

    if (sunbeam) {
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 2.2),
        new THREE.MeshBasicMaterial({ color: '#FFE9A8', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      const [bx, bz] = toWorld(fx, fz, rot, 0.25, 1.5);
      beam.position.set(bx, 0.008, bz);
      beam.rotation.set(-PI / 2, 0, rot + 0.25);
      this.group.add(beam);
      this.sunbeams.push(beam);
      for (const dz of [1.1, 1.9]) {
        const [px, pz] = toWorld(fx, fz, rot, 0.2, dz);
        this.addSpot('sun', px, pz, { heading: rot + PI / 2 });
      }
    }
  }

  buildWallDecor() {
    const { W, D } = this;
    const north = this.wall('N');
    this.windowAt('N', 5.5);
    if (W >= 13) this.windowAt('N', W - 4.5);
    this.windowAt('W', D - 2.6, { sunbeam: true });
    if (D >= 13) this.windowAt('W', 3.5);

    // Door
    const dx = W - 1.5;
    const frame = new StaticBuilder().at(dx, 0, 0);
    const look = this.look;
    frame.box(-0.52, 0, 0.03, 0.08, 1.85, 0.08, look.doorFrame);
    frame.box(0.52, 0, 0.03, 0.08, 1.85, 0.08, look.doorFrame);
    frame.box(0, 1.8, 0.03, 1.12, 0.08, 0.08, look.doorFrame);
    frame.box(0, 0, 0.005, 0.98, 1.8, 0.01, '#1A1420');
    north.decor.add(frame.build(new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(dx - 0.47, 0, 0.04);
    const panel = new THREE.Mesh(BOX, mat(look.door));
    panel.scale.set(0.92, 1.76, 0.05);
    panel.position.set(0.46, 0.88, 0);
    panel.castShadow = true;
    const knob = new THREE.Mesh(BOX, mat(look.knob));
    knob.scale.set(0.06, 0.06, 0.08);
    knob.position.set(0.8, 0.88, 0.03);
    this.doorPivot.add(panel, knob);
    north.decor.add(this.doorPivot);
    this.door = { openUntil: 0, angle: 0 };
    this.addSpot('door', dx, 0.35, { approach: [W - 2, 0] });

    this.clock = this.makeClock(2, 1.75, 0.02);
    north.decor.add(this.clock.group);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.64), new THREE.MeshLambertMaterial({ map: posterTexture() }));
    poster.position.set(3.5, 1.82, 0.012);
    north.decor.add(poster);
    const sign = look.neon;
    const wide = (sign.w ?? 48) / 48;
    const neon = this.sign(sign.text, { color: sign.color, glow: sign.glow, w: sign.w ?? 48, h: 16 }, 1.4 * wide, 0.4);
    neon.position.set(W - 3.6, 2.05, 0.02);
    north.decor.add(neon);
    const neonLight = new THREE.PointLight(sign.color, 0.7, 2.6, 1.5);
    neonLight.position.set(W - 3.6, 2.0, 0.5);
    north.decor.add(neonLight);
    this.neon = { mesh: neon, light: neonLight };
  }

  // Extras that come with an office look: bats, cobwebs, lanterns (themes.js).
  buildThemeDecor() {
    const { W, D } = this;
    const look = this.look;
    const north = this.wall('N');
    const west = this.wall('W');
    const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true });
    const build = (wall, fn) => {
      const b = new StaticBuilder();
      fn(b);
      wall.decor.add(b.build(lambert()));
    };
    const has = (kind) => look.decor.includes(kind);
    // Free stretches of the north wall (no window, clock, poster or door).
    const northSpots = [0.9, 4.4, W - 2.6].filter((x) => x > 0.5 && x < W - 0.5);

    if (has('stripe')) {
      const color = look.stripeColor ?? look.trim;
      const band = mat(color, { basic: !!look.glowTrim });
      for (const [wall, w, d, x, z] of [[north, W, 0.012, W / 2, 0.006], [west, 0.012, D, 0.006, D / 2]]) {
        const m = new THREE.Mesh(BOX, band);
        m.scale.set(w, 0.06, d);
        m.position.set(x, 1.0, z);
        wall.decor.add(m);
      }
    }
    if (has('bats')) {
      const bat = (b, x, y, z, alongX) => {
        const [sx, sz] = alongX ? [1, 0] : [0, 1];
        b.box(x, y, z, alongX ? 0.08 : 0.02, 0.07, alongX ? 0.02 : 0.08, '#1B1420');
        for (const side of [-1, 1]) b.box(x + sx * side * 0.09, y + 0.03, z + sz * side * 0.09, alongX ? 0.12 : 0.02, 0.04, alongX ? 0.02 : 0.12, '#1B1420');
      };
      build(north, (b) => [[1.2, 2.05], [1.6, 2.2], [4.8, 2.1], [W - 2.2, 1.95]].forEach(([x, y]) => bat(b, x, y, 0.012, true)));
      build(west, (b) => [[1.4, 2.1], [2.0, 1.9], [4.2, 2.15]].forEach(([z, y]) => bat(b, 0.012, y, z, false)));
    }
    if (has('pumpkins')) {
      for (const sill of this.sills ?? []) {
        const b = new StaticBuilder().at(sill.fx, sill.fz, sill.rot);
        for (const [x, size] of [[-0.5, 0.2], [0.55, 0.15]]) {
          b.box(x, 0.785, 0.17, size, size * 0.8, size, '#E8742A');
          b.box(x, 0.785 + size * 0.8, 0.17, 0.03, 0.05, 0.03, '#4A6B2A');
          for (const ex of [-0.04, 0.04]) b.box(x + ex, 0.785 + size * 0.45, 0.17 + size / 2, 0.03, 0.03, 0.01, '#FFE14F');
          b.box(x, 0.785 + size * 0.2, 0.17 + size / 2, size * 0.5, 0.02, 0.01, '#FFE14F');
        }
        sill.wall.decor.add(b.build(lambert()));
      }
    }
    if (has('cobwebs')) {
      // A web in a top corner: threads fanning out of the corner, joined by rings.
      // Points are (along the wall, down from the ceiling); `dir` is +1 or -1 along it.
      const web = (wall, cornerAlong, depth, alongX, dir) =>
        build(wall, (b) => {
          const at = (along, down) => (alongX ? [cornerAlong + dir * along, WALL_H - down, depth] : [depth, WALL_H - down, cornerAlong + dir * along]);
          const thread = (p, q) => {
            const [x1, y1, z1] = at(...p);
            const [x2, y2, z2] = at(...q);
            const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
            const tilt = Math.atan2(y2 - y1, alongX ? x2 - x1 : z2 - z1);
            const [mx, my, mz] = [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2];
            if (alongX) b.box(mx, my, mz, len, 0.012, 0.01, '#DADADA', { rotZ: tilt });
            else b.box(mx, my, mz, 0.01, 0.012, len, '#DADADA', { rotX: -tilt });
          };
          const angles = [0.08, 0.5, 0.95, 1.45];
          for (const a of angles) thread([0, 0], [Math.cos(a) * 0.6, Math.sin(a) * 0.6]);
          for (const r of [0.2, 0.4]) {
            for (let k = 0; k < angles.length - 1; k++) thread([Math.cos(angles[k]) * r, Math.sin(angles[k]) * r], [Math.cos(angles[k + 1]) * r, Math.sin(angles[k + 1]) * r]);
          }
        });
      web(north, 0.02, 0.02, true, 1);
      web(north, W - 0.02, 0.02, true, -1);
      web(west, D - 0.02, 0.02, false, -1);
    }
    if (has('portraits')) {
      build(west, (b) => {
        for (const z of [1.6, 3.6]) {
          b.box(0.02, 1.2, z, 0.04, 0.7, 0.55, '#8C6A2E');
          b.box(0.03, 1.25, z, 0.03, 0.6, 0.45, '#2A2A30');
          b.box(0.035, 1.6, z, 0.03, 0.12, 0.2, '#4A4A52');
        }
      });
      // The eyes glow in the dark.
      for (const z of [1.6, 3.6]) {
        for (const dz of [-0.06, 0.06]) {
          const eye = new THREE.Mesh(BOX, mat('#7CFFB0', { basic: true }));
          eye.scale.set(0.01, 0.03, 0.04);
          eye.position.set(0.052, 1.55, z + dz);
          west.decor.add(eye);
        }
      }
    }
    if (has('vines')) {
      const strand = (b, x, z, len, alongX) => {
        b.box(x, WALL_H - len, z, alongX ? 0.03 : 0.02, len, alongX ? 0.02 : 0.03, '#2F6B2A');
        for (let y = WALL_H - 0.15; y > WALL_H - len; y -= 0.18) {
          const off = (Math.round(y * 10) % 2 ? 1 : -1) * 0.05;
          b.box(x + (alongX ? off : 0.01), y, z + (alongX ? 0.01 : off), alongX ? 0.08 : 0.02, 0.05, alongX ? 0.02 : 0.08, '#5FAE47');
        }
      };
      build(north, (b) => {
        for (let x = 0.4; x < W - 0.3; x += 0.55) strand(b, x, 0.02, 0.25 + (Math.sin(x * 3.7) + 1) * 0.3, true);
      });
      build(west, (b) => {
        for (let z = 0.4; z < D - 0.3; z += 0.55) strand(b, 0.02, z, 0.25 + (Math.sin(z * 2.9) + 1) * 0.3, false);
      });
    }
    if (has('lanterns')) {
      const glow = mat('#FF5A3A', { emissive: '#8A2010' });
      for (const [wall, x, z] of [...northSpots.map((x) => [north, x, 0.35]), [west, 0.35, 2.2], [west, 0.35, 4.2]]) {
        const string = new THREE.Mesh(BOX, mat('#1B1420'));
        string.scale.set(0.01, 0.3, 0.01);
        string.position.set(x, WALL_H - 0.15, z);
        const body = new THREE.Mesh(BOX, glow);
        body.scale.set(0.22, 0.28, 0.22);
        body.position.set(x, WALL_H - 0.46, z);
        const caps = new StaticBuilder();
        caps.box(x, WALL_H - 0.33, z, 0.16, 0.03, 0.16, '#1B1420');
        caps.box(x, WALL_H - 0.63, z, 0.16, 0.03, 0.16, '#1B1420');
        wall.decor.add(string, body, caps.build(lambert()));
      }
    }
    if (has('skis')) {
      build(west, (b) => {
        for (const [z, color] of [[1.1, '#D93A2E'], [1.3, '#F2E6C9']]) {
          b.box(0.03, 0.15, z, 0.03, 1.8, 0.09, color);
          b.box(0.05, 1.9, z, 0.04, 0.08, 0.09, color);
        }
        for (const z of [1.55, 1.65]) b.box(0.03, 0.2, z, 0.02, 1.3, 0.02, '#4A4A52');
      });
    }
    if (has('plants')) {
      build(north, (b) => {
        for (const x of northSpots.slice(0, 2)) {
          b.box(x, 1.95, 0.12, 0.26, 0.2, 0.2, '#F2F4F6');
          for (const [dx, h] of [[-0.08, 0.35], [0.0, 0.5], [0.08, 0.3]]) b.box(x + dx, 1.95 - h + 0.05, 0.2, 0.05, h, 0.04, '#4F9A45');
          b.box(x, 2.15, 0.12, 0.2, 0.08, 0.16, '#5FAE47');
        }
      });
    }
    if (has('consoles')) {
      build(west, (b) => {
        b.box(0.04, 0.9, 2, 0.08, 0.7, 1.8, '#1B2233');
        b.box(0.085, 0.95, 2, 0.01, 0.6, 1.7, '#26314A');
      });
      const colors = ['#4FE0FF', '#FF4F4F', '#7CFF7A', '#FFE14F'];
      for (let k = 0; k < 12; k++) {
        const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: colors[k % 4] }));
        m.scale.setScalar(0.05);
        m.position.set(0.095, 1.05 + (k % 3) * 0.16, 1.3 + Math.floor(k / 3) * 0.45);
        m.userData.phase = k * 1.7;
        west.decor.add(m);
        this.blinkers.push(m);
      }
    }
  }

  sign(text, opts, w, h) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, opts), transparent: true }));
    this.signs.push({ mesh, text, opts });
    return mesh;
  }

  // Text textures are drawn with the pixel font; redraw once it has loaded.
  refreshSigns() {
    for (const s of this.signs) {
      s.mesh.material.map.dispose();
      s.mesh.material.map = textTexture(s.text, s.opts);
      s.mesh.material.needsUpdate = true;
    }
  }

  makeClock(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), mat('#F4EEDC'));
    face.rotation.x = PI / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 12), mat('#C0502F'));
    rim.rotation.x = PI / 2;
    rim.position.z = -0.01;
    group.add(rim, face);
    const hand = (len, w, color) => {
      const p = new THREE.Group();
      p.position.z = 0.02;
      const m = new THREE.Mesh(BOX, mat(color));
      m.scale.set(w, len, 0.01);
      m.position.y = len / 2;
      p.add(m);
      group.add(p);
      return p;
    };
    return { group, hour: hand(0.1, 0.03, '#2B2B33'), minute: hand(0.16, 0.02, '#2B2B33') };
  }

  // Edit mode helpers

  buildGrid() {
    const { W, totalD: D } = this;
    const points = [];
    for (let i = 0; i <= W; i++) points.push(i, 0.012, 0, i, 0.012, D);
    for (let j = 0; j <= D; j++) points.push(0, 0.012, j, W, 0.012, j);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#F2E6C9', transparent: true, opacity: 0.35 }));
    this.grid.visible = false;
    this.group.add(this.grid);

    this.ghostMaterial = new THREE.MeshBasicMaterial({ color: '#7CFF7A', transparent: true, opacity: 0.45, depthWrite: false });
    this.footprint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#7CFF7A', transparent: true, opacity: 0.3, depthWrite: false }));
    this.footprint.rotation.x = -PI / 2;
    this.footprint.visible = false;
    this.group.add(this.footprint);
  }

  showGrid(on) {
    this.grid.visible = on;
  }

  // Shade the tiles an item covers: green when it fits, red when it doesn't,
  // yellow for the selected item.
  showFootprint(item, state = 'ok') {
    if (!item) {
      this.footprint.visible = false;
      return;
    }
    const { w, d } = footprintSize(item);
    this.footprint.visible = true;
    this.footprint.scale.set(w, d, 1);
    this.footprint.position.set(item.x + w / 2, 0.015, item.z + d / 2);
    const color = { ok: '#7CFF7A', bad: '#FF5A5A', select: '#F2C14E' }[state];
    this.footprint.material.color.set(color);
    this.ghostMaterial.color.set(color);
  }

  // Moving things

  // A plush toy mouse, a gift from one cat to another. Disappears after a while.
  spawnToy(x, z) {
    const g = this.mouseMesh('#9AA0AE');
    g.position.set(x, 0, z);
    g.rotation.y = Math.random() * PI * 2;
    this.group.add(g);
    this.toys.push({ mesh: g, until: performance.now() / 1000 + 30 });
  }

  // A real (grey-brown) mouse for the mouse event; the event moves and removes it.
  spawnMouse(x, z) {
    const g = this.mouseMesh('#8A7A6A');
    g.position.set(x, 0, z);
    this.group.add(g);
    return g;
  }

  // An open pizza box by the door.
  spawnPizza(x, z) {
    const g = new THREE.Group();
    const b = new StaticBuilder();
    b.box(0, 0, 0, 0.5, 0.04, 0.5, '#D9B98A');
    b.box(0, 0.04, -0.25, 0.5, 0.42, 0.02, '#D9B98A', { rotX: -0.3 });
    b.cyl(0, 0.04, 0, 0.21, 0.02, '#E8A33A', { segments: 12 });
    b.cyl(0, 0.055, 0, 0.18, 0.01, '#F2D16B', { segments: 12 });
    for (const [px, pz] of [[0.08, 0.05], [-0.09, 0.07], [0.02, -0.1], [-0.06, -0.04], [0.11, -0.07]]) b.cyl(px, 0.062, pz, 0.03, 0.01, '#C0392B', { segments: 6 });
    g.add(b.build(new THREE.MeshLambertMaterial({ vertexColors: true })));
    g.position.set(x, 0, z);
    g.rotation.y = PI;
    this.group.add(g);
    return g;
  }

  // A round robot vacuum with a blinking light.
  spawnVacuum(x, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.09, 14), mat('#2B2B33'));
    body.position.y = 0.055;
    body.castShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), mat('#4A4A52'));
    top.position.y = 0.105;
    const led = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: '#4FE0FF' }));
    led.scale.set(0.06, 0.02, 0.03);
    led.position.set(0, 0.12, 0.15);
    g.add(body, top, led);
    g.position.set(x, 0, z);
    this.group.add(g);
    return g;
  }

  // Small things for games and gags, standing on the floor at (x, z). The caller
  // removes them again with removeMesh.
  spawnProp(kind, x, z, { rot = 0, length = 1.6, seconds = null } = {}) {
    const b = new StaticBuilder();
    if (kind === 'chess' || kind === 'checkers') {
      b.box(0, 0, 0, 0.44, 0.03, 0.44, '#6B4A2E');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) b.box(-0.15 + i * 0.1, 0.03, -0.15 + j * 0.1, 0.1, 0.005, 0.1, (i + j) % 2 ? '#3A2A20' : '#F2E6C9');
      const pieces = [[-0.15, -0.15], [0.05, -0.15], [-0.05, -0.05], [0.15, 0.15], [-0.05, 0.15], [0.05, 0.05]];
      pieces.forEach(([px, pz], k) => {
        const color = k < 3 ? '#FFFFFF' : '#1B1420';
        if (kind === 'chess') {
          b.box(px, 0.035, pz, 0.05, 0.05, 0.05, color);
          b.box(px, 0.085, pz, 0.03, 0.03, 0.03, color);
        } else b.cyl(px, 0.035, pz, 0.035, 0.02, color, { segments: 8 });
      });
    } else if (kind === 'tictactoe') {
      b.box(0, 0, 0, 0.36, 0.01, 0.36, '#FFFFFF');
      for (const k of [-0.06, 0.06]) {
        b.box(k, 0.01, 0, 0.012, 0.004, 0.32, '#1B1420');
        b.box(0, 0.01, k, 0.32, 0.004, 0.012, '#1B1420');
      }
      for (const [i, j, c] of [[-1, -1, '#E8303A'], [0, 0, '#3A6FD0'], [1, -1, '#E8303A'], [1, 1, '#3A6FD0']]) b.box(i * 0.12, 0.012, j * 0.12, 0.06, 0.006, 0.06, c);
    } else if (kind === 'cards') {
      b.box(-0.12, 0, 0, 0.1, 0.04, 0.14, '#C0392B');
      b.box(0.12, 0, 0, 0.1, 0.02, 0.14, '#F4F2EE');
      for (const [px, pz, r] of [[0, -0.08, 0.3], [0.02, 0.06, -0.5], [-0.03, 0.12, 1.1]]) b.box(px, 0.005, pz, 0.1, 0.004, 0.14, '#F4F2EE', { rotY: r });
      b.box(0.12, 0.02, 0, 0.03, 0.003, 0.03, '#E8303A');
    } else if (kind === 'rope') {
      b.box(0, 0.17, 0, length, 0.04, 0.04, '#C9A06B');
      b.box(0, 0.12, 0, 0.05, 0.12, 0.05, '#E8303A');
      b.box(0, 0, 0, 0.06, 0.01, 0.4, '#FFFFFF');
    } else if (kind === 'goal') {
      for (const s of [-1, 1]) b.box(0, 0, s * 0.4, 0.05, 0.45, 0.05, '#FFFFFF');
      b.box(0, 0.42, 0, 0.05, 0.05, 0.85, '#FFFFFF');
      b.box(-0.18, 0, 0, 0.02, 0.4, 0.8, '#D8DEE6', { rotZ: 0.4 });
    } else if (kind === 'ball') {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat('#F4F4F4'));
      mesh.castShadow = true;
      const spots = new THREE.Mesh(new THREE.IcosahedronGeometry(0.092, 0), new THREE.MeshLambertMaterial({ color: '#1B1420', wireframe: true }));
      const g = new THREE.Group();
      mesh.add(spots);
      mesh.position.y = 0.09;
      g.add(mesh);
      g.position.set(x, 0, z);
      this.group.add(g);
      return g;
    } else if (kind === 'cucumber') {
      b.box(0, 0, 0, 0.07, 0.07, 0.3, '#3E8E41');
      for (const k of [-0.1, 0, 0.1]) b.box(0, 0.07, k, 0.03, 0.006, 0.04, '#6CC070');
      b.box(0, 0.01, 0.15, 0.05, 0.05, 0.01, '#A8D99A');
    } else if (kind === 'tinyBox') {
      b.box(0, 0, 0, 0.2, 0.02, 0.17, '#B98A55');
      for (const s of [-1, 1]) {
        b.box(s * 0.1, 0, 0, 0.015, 0.11, 0.17, '#C9A06B');
        b.box(0, 0, s * 0.085, 0.2, 0.11, 0.015, '#C9A06B');
      }
    } else if (kind === 'duck') {
      b.box(0, 0, 0, 0.12, 0.08, 0.16, '#FFD93B');
      b.box(0, 0.08, 0.04, 0.08, 0.08, 0.08, '#FFD93B');
      b.box(0, 0.1, 0.1, 0.05, 0.025, 0.04, '#FF8A2A');
      for (const s of [-1, 1]) b.box(s * 0.025, 0.13, 0.08, 0.015, 0.015, 0.01, '#1B1420');
    } else if (kind === 'note') {
      b.box(0, 0, 0, 0.12, 0.006, 0.12, '#FFE14F', { rotY: 0.3 });
      b.box(0, 0.006, -0.02, 0.08, 0.002, 0.012, '#1B1420', { rotY: 0.3 });
      b.box(0, 0.006, 0.02, 0.06, 0.002, 0.012, '#1B1420', { rotY: 0.3 });
    }
    const g = new THREE.Group();
    g.add(b.build(new THREE.MeshLambertMaterial({ vertexColors: true })));
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.group.add(g);
    // Left lying around for a while, then tidied up.
    if (seconds) this.toys.push({ mesh: g, until: performance.now() / 1000 + seconds });
    return g;
  }

  removeMesh(mesh) {
    if (mesh) this.group.remove(mesh);
  }

  mouseMesh(fur) {
    const g = new THREE.Group();
    const part = (w, h, d, color, px, py, pz) => {
      const m = new THREE.Mesh(BOX, mat(color));
      m.scale.set(w, h, d);
      m.position.set(px, py, pz);
      m.castShadow = true;
      g.add(m);
    };
    part(0.09, 0.06, 0.13, fur, 0, 0.03, 0);
    part(0.06, 0.05, 0.05, fur, 0, 0.03, 0.08);
    part(0.02, 0.02, 0.02, '#EE8B9C', 0, 0.035, 0.11);
    part(0.012, 0.012, 0.12, '#EE8B9C', 0, 0.015, -0.12);
    for (const side of [-1, 1]) part(0.03, 0.03, 0.01, '#EE8B9C', side * 0.025, 0.065, 0.07);
    return g;
  }

  startLaser(seconds) {
    const l = this.laser;
    l.active = true;
    l.until = performance.now() / 1000 + seconds;
    l.mesh.visible = true;
  }

  openDoor(seconds = 1.6) {
    this.door.openUntil = performance.now() / 1000 + seconds;
  }

  spawnParticle(kind, x, y, z, color = null) {
    const confetti = ['#FF4FA3', '#4FE0FF', '#FFE14F', '#7CFF7A', '#FF8A2A', '#B05AFF'];
    const colors = { steam: '#F4F4F4', spark: '#FFE14F', puff: '#FFFFFF', crumb: '#5A3420', dust: '#E2D3B4', fur: color ?? '#D8D0C4', confetti: confetti[Math.floor(Math.random() * confetti.length)] };
    const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: colors[kind] }));
    const size = kind === 'dust' ? 0.12 + Math.random() * 0.1 : kind === 'steam' ? 0.035 : kind === 'confetti' || kind === 'fur' ? 0.04 : 0.025;
    m.scale.setScalar(size);
    m.position.set(x, y, z);
    this.group.add(m);
    const r = Math.random;
    const v =
      kind === 'fur'
        ? [(r() - 0.5) * 2.2, 0.6 + r() * 1.1, (r() - 0.5) * 2.2]
        : kind === 'confetti'
        ? [(r() - 0.5) * 1.6, 1.2 + r() * 1.2, (r() - 0.5) * 1.6]
        : kind === 'dust'
        ? [(r() - 0.5) * 1.4, 0.3 + r() * 0.4, (r() - 0.5) * 1.4]
        : kind === 'spark'
          ? [(r() - 0.5) * 1.2, 1 + r(), (r() - 0.5) * 1.2]
          : kind === 'puff'
            ? [(r() - 0.5) * 0.6, 0.4, (r() - 0.5) * 0.6]
            : [(r() - 0.5) * 0.05, 0.25, (r() - 0.5) * 0.05];
    this.particles.push({ mesh: m, kind, v, life: kind === 'steam' ? 1.6 : kind === 'dust' ? 0.6 : kind === 'confetti' ? 1.8 : kind === 'fur' ? 3.5 : 0.7, age: 0, size });
  }

  // The real time, or a fixed hour from ?hour=22 for trying out the night.
  now() {
    const now = new Date();
    if (this.hour != null) now.setHours(Math.floor(this.hour), Math.round((this.hour % 1) * 60), 0, 0);
    return now;
  }

  updateEnvironment(force = false) {
    const now = this.now();
    const minute = now.getHours() * 60 + now.getMinutes();
    if (!force && minute === this.lastMinute) return;
    this.lastMinute = minute;
    const h = minute / 60;
    const day = smooth(5.5, 7.5, h) * (1 - smooth(18.5, 20.5, h));
    const dusk = Math.max(smooth(5, 7, h) * (1 - smooth(7, 9, h)), smooth(17.5, 19.5, h) * (1 - smooth(19.5, 21, h)));
    const sky = new THREE.Color('#1B2350').lerp(new THREE.Color('#8FD3F5'), day).lerp(new THREE.Color('#F2A65A'), dusk * 0.6);
    const kind = this.weather.kind;
    if (WEATHER_SKY[kind]) sky.lerp(new THREE.Color(WEATHER_SKY[kind]).multiplyScalar(0.25 + 0.75 * day), 0.6);
    this.skyColor = sky;
    for (const g of this.glass) g.material.color.copy(sky);
    const sunFactor = WEATHER_SUN[kind] ?? 1;
    // Night is moonlight from outside and warm lamps inside.
    this.sun.intensity = (0.3 + 1.55 * day) * (0.6 + 0.4 * sunFactor);
    this.sun.color.set('#7E97E8').lerp(new THREE.Color('#FFF1D6'), day);
    this.env = { hemi: 0.55 + 0.75 * day, room: 1.9 - 1.2 * day };
    this.daylight = day;
    for (const beam of this.sunbeams) beam.material.opacity = (0.06 + 0.24 * day) * sunFactor;
    const stars = (1 - smooth(0, 0.6, day)) * (WEATHER_STARS[kind] ?? 0);
    for (const p of this.nightPanes) p.material.opacity = stars;
    if (this.grass) this.grass.material.color.set(kind === 'snow' ? '#E8EEF4' : '#FFFFFF');
    this.applyPower();
    this.clock.hour.rotation.z = -((h % 12) / 12) * PI * 2;
    this.clock.minute.rotation.z = -((minute % 60) / 60) * PI * 2;
  }

  // Lights follow the time of day and the power (a blackout turns it off).
  applyPower() {
    const p = this.power;
    const env = this.env ?? { hemi: 1, room: 1 };
    this.hemi.intensity = env.hemi * (0.7 + 0.3 * p);
    for (const l of this.roomLights) l.intensity = env.room * p * (this.look.lightScale ?? 1);
    if (this.neon) {
      this.neon.mesh.visible = p > 0.5;
      this.neon.light.intensity = 0.7 * p;
    }
  }

  // Power cut for a few seconds; the lights flicker back on at the end.
  startBlackout(seconds, t) {
    this.blackout = { until: t + seconds, flickerUntil: t + seconds + 1.2 };
  }

  updatePower(t) {
    const b = this.blackout;
    let power = 1;
    if (b) {
      if (t < b.until) power = 0;
      else if (t < b.flickerUntil) power = Math.random() < 0.55 ? 1 : 0.1;
      else this.blackout = null;
    }
    if (power === this.power) return;
    this.power = power;
    this.applyPower();
  }

  // Garden

  buildGarden() {
    const { W, D, totalD } = this;
    const depth = totalD - D;
    this.grass = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), new THREE.MeshLambertMaterial({ map: grassTexture(W, depth) }));
    this.grass.rotation.x = -PI / 2;
    this.grass.position.set(W / 2, 0.001, D + depth / 2);
    this.grass.receiveShadow = true;
    this.group.add(this.grass);

    const b = new StaticBuilder();
    // Hedge along the house, with a stone path through the gap to the door.
    for (const [i] of hedgeTiles(this.layout)) {
      b.box(i + 0.5, 0, D + 0.5, 0.96, 0.42, 0.8, '#3F7A34');
      b.box(i + 0.5, 0.42, D + 0.5, 0.8, 0.12, 0.64, '#4F8F3E');
    }
    for (const i of GARDEN.gap) {
      for (const dz of [0.25, 0.75]) b.box(i + 0.5 + (dz > 0.5 ? 0.12 : -0.12), 0, D + dz, 0.5, 0.025, 0.36, '#A9A39A');
    }
    // A low picket fence round the lawn.
    const post = (x, z) => b.box(x, 0, z, 0.07, 0.5, 0.07, '#EDE3CF');
    for (let x = 0; x <= W; x += 0.5) post(x, totalD);
    for (let z = D + 1; z <= totalD; z += 0.5) {
      post(0, z);
      post(W, z);
    }
    b.box(W / 2, 0.32, totalD, W, 0.05, 0.04, '#E2D6BC');
    b.box(0, 0.32, (D + 1 + totalD) / 2, 0.04, 0.05, totalD - D - 1, '#E2D6BC');
    b.box(W, 0.32, (D + 1 + totalD) / 2, 0.04, 0.05, totalD - D - 1, '#E2D6BC');
    this.group.add(b.build(new THREE.MeshLambertMaterial({ vertexColors: true })));

    // Sunny patches on the lawn for sunbathing.
    for (const [i, j] of [
      [W - 2, D + 2],
      [3, totalD - 2],
      [W - 4, totalD - 1],
    ]) {
      if (this.nav.free(i, j)) this.addSpot('sun', i + 0.5, j + 0.5, { heading: PI / 2 });
    }
    this.rainMaterial = new THREE.MeshBasicMaterial({ color: '#BFD8F2', transparent: true, opacity: 0.7 });
    this.snowMaterial = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  }

  // Rain and snow fall on the garden (inside the windows show it).
  updateGardenWeather(dt) {
    const kind = this.weather.kind;
    const falling = kind === 'rain' || kind === 'storm' ? 'rain' : kind === 'snow' ? 'snow' : null;
    if (!falling) return;
    const rate = (falling === 'rain' ? 70 : 25) * dt;
    const count = Math.min(8, Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0));
    for (let k = 0; k < count; k++) {
      const m = new THREE.Mesh(BOX, falling === 'rain' ? this.rainMaterial : this.snowMaterial);
      const size = falling === 'rain' ? [0.015, 0.22, 0.015] : [0.04, 0.04, 0.04];
      m.scale.set(...size);
      m.position.set(Math.random() * this.W, 2.6, this.D + 0.2 + Math.random() * (this.totalD - this.D - 0.2));
      this.group.add(m);
      const v = falling === 'rain' ? [0.3, -7, 0] : [(Math.random() - 0.5) * 0.3, -0.7, 0];
      this.particles.push({ mesh: m, kind: falling, v, life: falling === 'rain' ? 0.45 : 4, age: 0, size: null, shared: true });
    }
  }

  setWeather(weather) {
    if (!weather || weather.kind === this.weather.kind) return;
    this.weather = weather;
    const kind = weather.kind;
    this.outdoorOk = !BAD_WEATHER.has(kind);
    this.areas.lounge.j1 = this.outdoorOk ? this.totalD : this.D;
    const texture = kind === 'rain' || kind === 'storm' ? weatherTexture('rain') : kind === 'snow' ? weatherTexture('snow') : null;
    for (const pane of this.panes) {
      pane.visible = !!texture;
      pane.material.map = texture;
      pane.material.needsUpdate = true;
    }
    this.updateEnvironment(true);
  }

  updateWeather(dt, t) {
    const kind = this.weather.kind;
    const map = this.panes[0]?.material.map;
    if (map) {
      map.offset.y = (map.offset.y + dt * (kind === 'snow' ? 0.15 : 1.4)) % 1;
      if (kind === 'snow') map.offset.x = Math.sin(t * 0.7) * 0.05;
    }
    if (kind === 'storm') {
      if (!this.flashUntil && Math.random() < dt * 0.08) this.flashUntil = t + 0.15;
      const flash = this.flashUntil && t < this.flashUntil;
      for (const g of this.glass) g.material.color.set(flash ? '#FFFFFF' : this.skyColor);
      this.hemi.intensity = flash ? 2.6 : this.env.hemi * (0.7 + 0.3 * this.power);
      if (this.flashUntil && t >= this.flashUntil) this.flashUntil = null;
    }
  }

  // Seasonal decorations

  buildSeasonal() {
    const north = this.wall('N');
    const west = this.wall('W');
    const { W, D } = this;
    const deco = (wall) => {
      const b = new StaticBuilder();
      return { b, done: () => wall.decor.add(b.build(new THREE.MeshLambertMaterial({ vertexColors: true }))) };
    };
    const bulb = (wall, x, y, z, color) => {
      const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color }));
      m.scale.setScalar(0.05);
      m.position.set(x, y, z);
      m.userData.phase = Math.random() * 6;
      wall.decor.add(m);
      this.blinkers.push(m);
    };
    if (this.season === 'christmas') {
      const n = deco(north);
      const w = deco(west);
      for (let x = 0.3; x < W - 0.2; x += 0.35) n.b.box(x, 2.18 - Math.abs(Math.sin(x * 1.8)) * 0.1, 0.05, 0.36, 0.08, 0.08, '#2F6B3A');
      for (let z = 0.3; z < D - 0.2; z += 0.35) w.b.box(0.05, 2.18 - Math.abs(Math.sin(z * 1.8)) * 0.1, z, 0.08, 0.08, 0.36, '#2F6B3A');
      const colors = ['#FF4F4F', '#FFE14F', '#4FE0FF', '#7CFF7A'];
      for (let x = 0.5, k = 0; x < W - 0.3; x += 0.7, k++) bulb(north, x, 2.1, 0.1, colors[k % 4]);
      for (let z = 0.5, k = 0; z < D - 0.3; z += 0.7, k++) bulb(west, 0.1, 2.1, z, colors[k % 4]);
      for (const s of this.sills ?? []) {
        const b = new StaticBuilder().at(s.fx, s.fz, s.rot);
        b.box(0, 0.8, 0.16, 1.6, 0.04, 0.28, '#FFFFFF');
        b.box(0, 1.84, 0.05, 1.5, 0.05, 0.1, '#FFFFFF');
        s.wall.decor.add(b.build(new THREE.MeshLambertMaterial({ vertexColors: true })));
      }
      // Wreath on the door
      const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 6, 12), mat('#2F6B3A'));
      wreath.position.set(W - 1.5, 1.35, 0.1);
      north.decor.add(wreath);
      const bow = new THREE.Mesh(BOX, mat('#D0384A'));
      bow.scale.set(0.12, 0.08, 0.04);
      bow.position.set(W - 1.5, 1.17, 0.14);
      north.decor.add(bow);
      n.done();
      w.done();
    } else if (this.season === 'halloween') {
      for (const s of this.sills ?? []) {
        for (const dx of [-0.55, 0.55]) {
          const [x, z] = toWorld(s.fx, s.fz, s.rot, dx, 0.18);
          const pumpkin = new THREE.Mesh(BOX, mat('#E8761E'));
          pumpkin.scale.set(0.2, 0.16, 0.2);
          pumpkin.position.set(x, 0.86, z);
          pumpkin.rotation.y = s.rot;
          const face = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: '#FFD25A' }));
          face.scale.set(0.1, 0.05, 0.01);
          const [fx2, fz2] = toWorld(s.fx, s.fz, s.rot, dx, 0.285);
          face.position.set(fx2, 0.87, fz2);
          face.rotation.y = s.rot;
          s.wall.decor.add(pumpkin, face);
        }
      }
      for (const [wall, x, z] of [
        [north, 2.5, 0.25],
        [north, W - 4, 0.25],
        [west, 0.25, 3],
        [west, 0.25, D - 5],
      ]) {
        const bat = new THREE.Group();
        const body = new THREE.Mesh(BOX, mat('#1B1420'));
        body.scale.set(0.08, 0.08, 0.06);
        bat.add(body);
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(BOX, mat('#2A2030'));
          wing.scale.set(0.14, 0.02, 0.08);
          wing.position.set(side * 0.1, 0.02, 0);
          wing.rotation.z = side * 0.4;
          bat.add(wing);
        }
        bat.position.set(x, 2.0, z);
        bat.userData.phase = Math.random() * 6;
        wall.decor.add(bat);
        this.swingers.push(bat);
      }
      for (let x = 0.5, k = 0; x < W - 0.3; x += 0.9, k++) bulb(north, x, 2.15, 0.1, k % 2 ? '#B05AFF' : '#FF8A2A');
    } else if (this.season === 'easter') {
      // Painted eggs on the sills and a pastel garland.
      const colors = ['#FF9AC8', '#9AD8FF', '#FFE48A', '#A8F0A0', '#D2A8FF'];
      for (const s of this.sills ?? []) {
        for (let k = 0; k < 4; k++) {
          const [x, z] = toWorld(s.fx, s.fz, s.rot, -0.5 + k * 0.33, 0.18);
          const egg = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(colors[(k + s.fx) % colors.length | 0]));
          egg.scale.set(1, 1.3, 1);
          egg.position.set(x, 0.86, z);
          s.wall.decor.add(egg);
        }
      }
      for (let x = 0.5, k = 0; x < W - 0.3; x += 0.7, k++) bulb(north, x, 2.15, 0.1, colors[k % colors.length]);
      // On the west wall, between its windows; the north wall is full.
      const banner = this.sign('VESELÉ VELIKONOCE', { color: '#FF7AB8', glow: '#FFFFFF', w: 96, h: 14 }, 2.8, 0.42);
      banner.position.set(0.03, 1.95, D >= 13 ? D / 2 + 0.4 : 3.2);
      banner.rotation.y = PI / 2;
      west.decor.add(banner);
    } else if (this.season === 'catDay') {
      const banner = this.sign('DEN KOČEK', { color: '#FF3D9A', glow: '#FFFFFF', w: 64, h: 14 }, 2.4, 0.5);
      banner.position.set(W / 2 - 1, 1.95, 0.03);
      north.decor.add(banner);
      for (const [x, color] of [
        [0.6, '#FF4FA3'],
        [1.0, '#4FE0FF'],
        [0.8, '#FFE14F'],
      ]) {
        const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(color));
        balloon.position.set(x, 1.7 + Math.random() * 0.3, 0.4);
        balloon.userData.phase = Math.random() * 6;
        balloon.userData.y = balloon.position.y;
        north.decor.add(balloon);
        this.swingers.push(balloon);
      }
    }
  }

  update(dt, t) {
    this.updateEnvironment();
    this.updateWeather(dt, t);
    this.updatePower(t);
    if (this.garden) this.updateGardenWeather(dt);
    for (const b of this.blinkers) b.visible = Math.sin(t * 2.5 + b.userData.phase) > -0.2;
    for (const s of this.swingers) {
      s.rotation.z = Math.sin(t * 2 + s.userData.phase) * 0.25;
      if (s.userData.y) s.position.y = s.userData.y + Math.sin(t + s.userData.phase) * 0.05;
    }
    for (const item of this.items) for (const fn of item.updates) fn(t, dt);

    // Desk screens scroll and glow, knocked cups fall
    for (const kind of SCREEN_KINDS) this.screenTex[kind].offset.y = (t * SCROLL[kind]) % 1;
    for (const d of this.desks) {
      const on = d.kind && this.power > 0.5;
      d.screen.material = on ? d.materials?.[d.kind] ?? this.screenOff : this.screenOff;
      d.power += ((on ? 1 : 0) - d.power) * Math.min(1, dt * 3);
      if (d.light) d.light.intensity = d.power * (d.kind === 'think' ? 0.25 : 0.7) * (0.92 + 0.08 * Math.sin(t * 30 + d.index));
      this.updateCup(d, dt);
    }

    // Door
    const open = t < this.door.openUntil ? 1 : 0;
    this.door.angle += (open * -1.3 - this.door.angle) * Math.min(1, dt * 6);
    this.doorPivot.rotation.y = this.door.angle;

    // Yarn balls roll and bounce
    for (const y of this.yarns) {
      y.x += y.vx * dt;
      y.z += y.vz * dt;
      const [ti, tj] = [Math.floor(y.x), Math.floor(y.z)];
      if (!this.nav.free(ti, tj) || y.x < 0.2 || y.z < 0.2 || y.x > this.W - 0.2 || y.z > this.D - 0.2) {
        y.x -= y.vx * dt * 1.5;
        y.z -= y.vz * dt * 1.5;
        if (!this.nav.free(Math.floor(y.x + y.vx * 0.05), tj)) y.vx *= -0.6;
        if (!this.nav.free(ti, Math.floor(y.z + y.vz * 0.05))) y.vz *= -0.6;
        y.x = Math.max(0.2, Math.min(this.W - 0.2, y.x));
        y.z = Math.max(0.2, Math.min(this.D - 0.2, y.z));
      }
      const fr = Math.exp(-dt * 1.6);
      y.vx *= fr;
      y.vz *= fr;
      y.mesh.position.set(y.x, 0.075, y.z);
      y.mesh.rotation.x += y.vz * dt * 12;
      y.mesh.rotation.z -= y.vx * dt * 12;
    }

    // Laser dot darts around the room
    const l = this.laser;
    if (l.active) {
      if (t > l.until) {
        l.active = false;
        l.mesh.visible = false;
      } else {
        if (Math.hypot(l.tx - l.x, l.tz - l.z) < 0.1 || Math.random() < dt * 0.8) {
          const [i, j] = this.nav.randomFree(Math.random, this.areas.lounge);
          l.tx = i + Math.random();
          l.tz = j + Math.random();
        }
        l.x += (l.tx - l.x) * Math.min(1, dt * 4);
        l.z += (l.tz - l.z) * Math.min(1, dt * 4);
        l.mesh.position.set(l.x + Math.sin(t * 40) * 0.01, 0.012, l.z);
      }
    }

    const now = performance.now() / 1000;
    for (const toy of this.toys) if (now > toy.until) this.group.remove(toy.mesh);
    this.toys = this.toys.filter((toy) => now <= toy.until);

    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.age += dt;
      if (p.kind === 'spark' || p.kind === 'crumb') p.v[1] -= 4 * dt;
      if (p.kind === 'fur') {
        // Tufts drift down, then lie on the floor until they fade.
        p.v[1] -= 2.2 * dt;
        p.v[0] *= 0.96;
        p.v[2] *= 0.96;
        if (p.mesh.position.y <= 0.012) p.v = [0, 0, 0];
        else p.mesh.rotation.z += dt * 5;
      }
      if (p.kind === 'confetti') {
        p.v[1] -= 2.2 * dt;
        p.mesh.rotation.x += dt * 8;
        p.mesh.rotation.z += dt * 6;
      }
      p.mesh.position.x += p.v[0] * dt;
      p.mesh.position.y = Math.max(0.01, p.mesh.position.y + p.v[1] * dt);
      p.mesh.position.z += p.v[2] * dt;
      if (p.kind === 'fur') p.mesh.scale.set(p.size, p.size * 0.35, p.size * 0.7).multiplyScalar(Math.min(1, (p.life - p.age) * 2));
      else if (p.size) p.mesh.scale.setScalar(p.size * Math.max(0.05, 1 - p.age / p.life));
      if (p.age >= p.life || (p.shared && p.mesh.position.y <= 0.011)) {
        this.group.remove(p.mesh);
        if (!p.shared) p.mesh.material.dispose();
        this.particles.splice(k, 1);
      }
    }
  }

  updateCup(desk, dt) {
    const cup = desk.cup;
    if (cup.state === 'fall') {
      cup.t += dt;
      const m = cup.mesh;
      m.position.z += cup.vz * dt;
      cup.vy -= 5 * dt;
      m.position.y += cup.vy * dt;
      m.rotation.x += dt * 9;
      if (m.position.y <= 0.05) {
        m.position.y = 0.05;
        m.rotation.set(PI / 2, 0, 0.4);
        cup.state = 'floor';
        cup.t = 0;
        const p = m.getWorldPosition(new THREE.Vector3());
        for (let k = 0; k < 8; k++) this.spawnParticle(k % 2 ? 'puff' : 'crumb', p.x, 0.08, p.z);
      }
    } else if (cup.state === 'floor') {
      cup.t += dt;
      if (cup.t > 25) {
        cup.state = 'desk';
        cup.mesh.position.copy(cup.home);
        cup.mesh.rotation.set(0, 0, 0);
      }
    }
  }
}
