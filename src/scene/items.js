// Builders for every piece of furniture. Each one draws in its own local frame:
// the footprint is centred on the origin, the front faces +z and the back -z.
// The ItemCtx turns local positions into world ones, so items can be rotated and
// moved freely. Builders also register the spots cats use and little animations.

import * as THREE from 'three';
import { ITEMS, footprintSize, localToWorldTile } from '../../shared/catalog.js';
import { COLLECTIBLES } from '../../shared/cats.js';
import { BOX, StaticBuilder, mat } from './voxel.js';
import { arcadeTexture, rugTexture, tvGameTexture } from './textures.js';

const PI = Math.PI;
const FURNITURE_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function seedOf(text) {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export class ItemCtx {
  constructor(office, item, { preview = false } = {}) {
    this.office = office;
    this.item = item;
    this.def = ITEMS[item.type];
    this.preview = preview;
    const { w, d } = footprintSize(item);
    this.angle = (item.rot * PI) / 2;
    this.group = new THREE.Group();
    this.group.position.set(item.x + w / 2, 0, item.z + d / 2);
    this.group.rotation.y = this.angle;
    this.group.userData.item = item;
    this.group.updateMatrixWorld(true);
    this.b = new StaticBuilder();
    this.updates = [];
    this.rand = rng(seedOf(item.uid ?? item.type));
  }

  world(lx, lz) {
    const { x, z } = this.group.position;
    const a = this.angle;
    return [x + lx * Math.cos(a) + lz * Math.sin(a), z - lx * Math.sin(a) + lz * Math.cos(a)];
  }

  worldPoint(lx, ly, lz) {
    const [x, z] = this.world(lx, lz);
    return new THREE.Vector3(x, ly, z);
  }

  spot(kind, lx, lz, { heading = 0, approach = null, ...extra } = {}) {
    if (this.preview) return null;
    const [x, z] = this.world(lx, lz);
    return this.office.addSpot(kind, x, z, {
      ...extra,
      heading: heading + this.angle,
      approach: approach ? localToWorldTile(this.item, ...approach) : this.office.nav.tileOf(x, z),
      item: this.item,
    });
  }

  add(...objects) {
    this.group.add(...objects);
  }

  light(color, intensity, distance, decay, lx, ly, lz) {
    if (this.preview) return null;
    const l = new THREE.PointLight(color, intensity, distance, decay);
    l.position.set(lx, ly, lz);
    this.group.add(l);
    return l;
  }

  onUpdate(fn) {
    if (!this.preview) this.updates.push(fn);
  }

  finish() {
    if (this.b.geos.length) this.group.add(this.b.build(FURNITURE_MATERIAL));
    return this.group;
  }
}

function dyn(w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(BOX, opts?.material ?? mat(color, opts));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function makeCup() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 8), mat('#F2EEE6'));
  body.position.y = 0.045;
  body.castShadow = true;
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.01, 8), mat('#5A3420'));
  coffee.position.y = 0.086;
  g.add(body, coffee, dyn(0.02, 0.05, 0.02, '#F2EEE6', 0.055, 0.045, 0));
  return g;
}

const occupied = (spots) => spots.some((s) => s?.occupant && s.occupant.act?.phase === 'do' && s.occupant.act.spot === s);

export const BUILDERS = {
  desk(c) {
    const b = c.b.at(0, 0.5);
    b.box(0, 0.33, 0, 1.8, 0.05, 0.8, '#C28A4A');
    b.box(-0.82, 0, -0.33, 0.07, 0.33, 0.07, '#7A4E26');
    b.box(-0.82, 0, 0.33, 0.07, 0.33, 0.07, '#7A4E26');
    b.box(0.58, 0, 0, 0.52, 0.33, 0.74, '#A8723A');
    for (const y of [0.1, 0.22]) b.box(0.58, y, 0.371, 0.42, 0.015, 0.01, '#6E4424');
    b.box(0, 0.38, 0.02, 0.2, 0.03, 0.18, '#B8AB8A');
    b.box(0, 0.41, 0, 0.44, 0.32, 0.34, '#D9CBA8');
    b.box(0, 0.45, 0.22, 0.3, 0.24, 0.12, '#CDBE98');
    b.box(0.17, 0.43, -0.172, 0.03, 0.02, 0.005, '#4CBF55');
    b.box(0, 0.38, -0.28, 0.5, 0.025, 0.15, '#E8DFC6');
    for (const z of [-0.32, -0.28, -0.24]) b.box(0, 0.405, z, 0.44, 0.006, 0.02, '#B9AE92');
    b.box(0.36, 0.38, -0.26, 0.06, 0.025, 0.09, '#E8DFC6');
    const clutter = Math.floor(c.rand() * 4);
    if (clutter === 0) {
      b.box(-0.66, 0.38, 0.15, 0.14, 0.12, 0.14, '#B5502E');
      for (let k = 0; k < 4; k++) b.box(-0.66, 0.5, 0.15, 0.04, 0.16, 0.1, k % 2 ? '#4F8A3A' : '#6FAF4A', { rotY: k * 0.8 });
    } else if (clutter === 1) {
      b.box(-0.6, 0.38, -0.05, 0.26, 0.05, 0.32, '#F4EEDC');
      b.box(-0.6, 0.43, -0.05, 0.24, 0.02, 0.3, '#E8E0C8', { rotY: 0.2 });
    } else if (clutter === 2) {
      b.box(-0.7, 0.38, 0.1, 0.12, 0.03, 0.12, '#2F6B3A');
      b.box(-0.7, 0.41, 0.1, 0.03, 0.22, 0.03, '#C9A54A');
      b.box(-0.62, 0.6, 0.1, 0.22, 0.06, 0.1, '#2F8A4A');
    } else {
      for (let k = 0; k < 3; k++) b.box(-0.62 + k * 0.03, 0.38 + k * 0.012, 0, 0.1, 0.012, 0.1, ['#3A6FD0', '#D04A4A', '#2B2B33'][k]);
    }
    b.box(0, 0, -0.85, 0.4, 0.03, 0.06, '#2A2A30');
    b.box(0, 0, -0.85, 0.06, 0.03, 0.4, '#2A2A30');
    b.box(0, 0.03, -0.85, 0.05, 0.2, 0.05, '#4A4A52');
    b.box(0, 0.23, -0.85, 0.42, 0.06, 0.42, '#C0502F');
    b.box(0, 0.29, -1.08, 0.42, 0.38, 0.06, '#C0502F');

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), c.office.screenOff);
    screen.rotation.y = PI;
    screen.position.set(0, 0.57, 0.5 - 0.172);
    const cup = makeCup();
    cup.position.set(0.72, 0.38, 0.72);
    c.add(screen, cup);
    if (c.preview) return;
    const light = c.light('#4CFF7A', 0, 1.8, 1.4, 0, 0.62, 0);
    const index = c.office.desks.length;
    c.spot('desk', 0, -0.32, { lift: 0.3, approach: [0, 0], desk: index });
    for (const [x, z] of [
      [1.5, 0.5],
      [1.5, -0.5],
      [-0.5, 1.5],
      [0.5, 1.5],
    ]) c.spot('kitten', x, z, { heading: -c.angle, desk: index });
    c.spot('deskTop', -0.45, 0.38, { lift: 0.385, heading: c.rand() * PI * 2, approach: [0, 0], desk: index });
    c.spot('knock', 0.72, 1.22, { heading: PI, approach: [1, 2], desk: index });
    c.office.desks.push({ index, screen, light, kind: null, power: 0, cup: { mesh: cup, state: 'desk', t: 0, home: cup.position.clone() } });
  },

  bookshelf(c) {
    const b = c.b.at(0, -0.76);
    b.box(0, 0, -0.16, 1.8, 1.72, 0.08, '#6B4024');
    for (const x of [-0.86, 0.86]) b.box(x, 0, 0, 0.08, 1.72, 0.42, '#7A4A2A');
    const books = ['#B8463F', '#3A6FD0', '#E39B3D', '#4F8A3A', '#7A4FA0', '#F2E6C9', '#2B2B33', '#C9A54A'];
    for (const y of [0, 0.42, 0.84, 1.26]) {
      b.box(0, y, 0, 1.7, 0.04, 0.4, '#7A4A2A');
      let x = -0.8;
      while (x < 0.75) {
        const w = 0.05 + c.rand() * 0.05;
        const h = 0.22 + c.rand() * 0.14;
        if (c.rand() > 0.12) b.box(x + w / 2, y + 0.04, 0.02, w, h, 0.3, books[Math.floor(c.rand() * books.length)]);
        x += w + 0.008;
      }
    }
    b.box(0, 1.68, 0, 1.8, 0.05, 0.42, '#7A4A2A');
    c.spot('shelf', -0.45, 0.0, { approach: [0, 1] });
    c.spot('shelf', 0.45, 0.0, { approach: [1, 1] });
  },

  rack(c) {
    const b = c.b.at(0, -0.64);
    b.box(0, 0, 0, 0.76, 1.6, 0.66, '#2A2D36');
    for (let y = 0.12; y < 1.5; y += 0.18) b.box(0, y, 0.331, 0.66, 0.13, 0.01, '#3A3F4C');
    const leds = [];
    for (let k = 0; k < 14; k++) {
      const led = dyn(0.03, 0.02, 0.01, null, -0.25 + (k % 2) * 0.08, 0.2 + Math.floor(k / 2) * 0.18, -0.64 + 0.335, {
        material: new THREE.MeshBasicMaterial({ color: k % 3 ? '#4CFF7A' : '#FFB23A' }),
      });
      led.userData.phase = c.rand() * 10;
      leds.push(led);
      c.add(led);
    }
    const spot = c.spot('rack', 0, 0.0, { heading: PI, approach: [0, 1], fx: c.worldPoint(0, 0.8, -0.25) });
    c.onUpdate((t) => {
      const busy = spot?.occupant;
      for (const led of leds) led.visible = Math.sin(t * (busy ? 14 : 3) + led.userData.phase * 7) > -0.3;
    });
  },

  whiteboard(c) {
    const b = c.b.at(0, -0.55);
    for (const x of [-0.42, 0.42]) b.box(x, 0, 0.05, 0.05, 1.4, 0.05, '#8A9099', { rotX: -0.08 });
    b.box(0, 0.55, 0, 1.0, 0.8, 0.05, '#BDBDBD');
    b.box(0, 0.58, 0.028, 0.92, 0.72, 0.01, '#F8F8F4');
    b.box(0, 0.53, 0.05, 0.7, 0.03, 0.07, '#9A9A9A');
    for (const [x, h, col] of [
      [-0.3, 0.15, '#3A6FD0'],
      [-0.18, 0.25, '#3A6FD0'],
      [-0.06, 0.38, '#D04A4A'],
    ]) b.box(x, 0.68, 0.034, 0.08, h, 0.005, col);
    for (let k = 0; k < 4; k++) b.box(0.08 + k * 0.08, 0.8 + Math.sin(k * 1.3) * 0.08 + k * 0.03, 0.034, 0.06, 0.02, 0.005, '#4F8A3A');
    c.spot('board', 0, 0.0, { heading: PI, approach: [0, 1] });
  },

  coffee(c) {
    const b = c.b.at(0, -0.66);
    b.box(0, 0, 0, 1.9, 0.5, 0.6, '#A35C3A');
    for (const x of [-0.48, 0.48]) b.box(x, 0.08, 0.301, 0.86, 0.36, 0.01, '#8E4A2E');
    b.box(0, 0.5, 0.01, 2.0, 0.05, 0.66, '#E8E0D0');
    b.box(-0.5, 0.55, -0.06, 0.34, 0.44, 0.3, '#2B2B33');
    b.box(-0.5, 0.86, 0.095, 0.2, 0.06, 0.01, '#D04A4A');
    b.box(-0.5, 0.7, 0.11, 0.06, 0.05, 0.08, '#4A4A52');
    b.box(-0.5, 0.55, 0.13, 0.14, 0.14, 0.14, '#5A3420');
    b.cyl(0.15, 0.55, 0.1, 0.045, 0.09, '#F2EEE6');
    b.cyl(0.32, 0.55, 0.1, 0.045, 0.09, '#E39B3D');
    b.box(0.62, 0.55, 0, 0.3, 0.18, 0.2, '#C9CED6');
    const spout = c.worldPoint(-0.5, 0.95, -0.65);
    c.spot('coffee', -0.45, 0.05, { heading: PI, approach: [0, 1], spout });
    c.spot('coffee', 0.45, 0.05, { heading: PI, approach: [1, 1], spout });
  },

  bowls(c) {
    const b = c.b.at(0, -0.62);
    b.cyl(-0.18, 0, 0, 0.11, 0.06, '#D04A4A', { segments: 10 });
    b.cyl(-0.18, 0.02, 0, 0.09, 0.05, '#8A5A30', { segments: 10 });
    b.cyl(0.18, 0, 0, 0.11, 0.06, '#3A6FD0', { segments: 10 });
    b.cyl(0.18, 0.02, 0, 0.09, 0.05, '#8FD3F5', { segments: 10 });
    c.spot('food', -0.18, -0.08, { heading: PI, approach: [0, 1] });
    c.spot('water', 0.18, -0.08, { heading: PI, approach: [0, 1] });
  },

  fridge(c) {
    const b = c.b;
    b.box(0, 0, 0, 0.8, 1.38, 0.7, '#A9B94F');
    b.box(0, 0.95, 0.351, 0.78, 0.015, 0.01, '#7E8A3A');
    b.box(0.3, 0.55, 0.37, 0.04, 0.32, 0.04, '#E8E8E8');
    b.box(0.3, 1.05, 0.37, 0.04, 0.2, 0.04, '#E8E8E8');
    for (const [x, y, col] of [
      [-0.2, 1.15, '#D04A4A'],
      [-0.05, 0.75, '#3A6FD0'],
      [-0.25, 0.55, '#F2C94C'],
    ]) b.box(x, y, 0.355, 0.07, 0.07, 0.01, col);
  },

  bed(c) {
    const colors = ['#7A4FA0', '#C0502F', '#3A6FD0', '#4F8A3A'];
    c.b.cyl(0, 0, 0, 0.34, 0.14, colors[Math.floor(c.rand() * colors.length)], { segments: 10 });
    c.b.cyl(0, 0.01, 0, 0.25, 0.09, '#F2E6C9', { segments: 10 });
    c.spot('bed', 0, 0, { lift: 0.1, heading: c.rand() * PI * 2 });
  },

  couch(c) {
    const b = c.b.at(0, -0.45);
    b.box(0, 0.04, 0, 2.6, 0.2, 0.75, '#2F7A73');
    for (const x of [-1.2, 1.2]) for (const z of [-0.3, 0.3]) b.box(x, 0, z, 0.06, 0.05, 0.06, '#3A2A20');
    for (const x of [-0.85, 0, 0.85]) b.box(x, 0.24, 0.05, 0.8, 0.09, 0.6, '#3E9A90');
    b.box(0, 0.04, -0.3, 2.6, 0.62, 0.2, '#2F7A73');
    for (const x of [-1.25, 1.25]) b.box(x, 0.04, 0.02, 0.22, 0.44, 0.78, '#2A6B65');
    b.box(-0.6, 0.33, 0.0, 0.3, 0.22, 0.12, '#E39B3D', { rotY: 0.3 });
    [-0.85, 0, 0.85].forEach((x, k) => c.spot('couch', x, -0.4, { lift: 0.34, approach: [k, 1] }));
  },

  fireplace(c) {
    const b = c.b.at(0, -0.64);
    b.box(0, 0, 0.05, 2.0, 0.06, 0.8, '#5A5560');
    for (const x of [-0.8, 0.8]) {
      b.box(x, 0.06, 0, 0.36, 0.9, 0.56, '#A04A35');
      for (const y of [0.25, 0.5, 0.75]) b.box(x, y, 0.281, 0.36, 0.02, 0.01, '#7A3426');
    }
    b.box(0, 0.06, -0.2, 1.3, 0.8, 0.14, '#24161A');
    b.box(0, 0.86, 0, 2.1, 0.14, 0.64, '#6B3E26');
    b.box(0, 0.96, -0.06, 1.5, 1.5, 0.44, '#A04A35');
    for (const y of [1.2, 1.5, 1.8, 2.1]) b.box(0, y, 0.161, 1.5, 0.02, 0.01, '#7A3426');
    b.box(-0.3, 0.06, -0.05, 0.6, 0.08, 0.1, '#5A3420', { rotY: 0.3 });
    b.box(0.25, 0.06, 0, 0.55, 0.08, 0.1, '#4A2A18', { rotY: -0.4 });
    b.box(-0.75, 1.0, 0.1, 0.05, 0.12, 0.05, '#F2E6C9');
    b.box(-0.62, 1.0, 0.1, 0.05, 0.08, 0.05, '#F2E6C9');
    b.box(0.6, 1.0, 0.05, 0.24, 0.2, 0.04, '#C9A54A');
    b.box(0.6, 1.03, 0.072, 0.18, 0.14, 0.01, '#E8913A');

    const fire = new THREE.Group();
    fire.position.set(0, 0.12, -0.62);
    const flames = ['#FFE27A', '#FFB23A', '#FF7A2A', '#FF5A1F', '#FFD25A', '#FF8A2A', '#FFF2B0'].map((color, k) => {
      const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color }));
      m.userData = { x: (k - 3) * 0.13, z: (c.rand() - 0.5) * 0.12, w: 0.09 + c.rand() * 0.05, h: 0.18 + c.rand() * 0.22, phase: k * 1.7 };
      fire.add(m);
      return m;
    });
    c.add(fire);
    const light = c.light('#FF8A3A', 2, 5, 1.1, 0, 0.5, 0);
    c.spot('fire', -0.5, 0.3, { heading: PI, approach: [0, 1] });
    c.spot('fire', 0.5, 0.3, { heading: PI, approach: [1, 1] });
    c.onUpdate((t) => {
      for (const f of flames) {
        const u = f.userData;
        const n = 0.65 + 0.35 * Math.sin(t * 9 + u.phase) * Math.sin(t * 5.3 + u.phase * 2);
        f.scale.set(u.w, u.h * n, u.w);
        f.position.set(u.x + Math.sin(t * 7 + u.phase) * 0.01, (u.h * n) / 2, u.z);
      }
      light.intensity = (1.7 + (1 - (c.office.daylight ?? 0)) * 1.3) * (0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 7.3));
    });
  },

  hammock(c) {
    const b = c.b.at(0, -0.5);
    for (const x of [-0.95, 0.95]) {
      b.box(x, 0, 0, 0.07, 0.95, 0.07, '#8A5A35');
      b.box(x, 0, 0, 0.3, 0.04, 0.3, '#6B4024');
    }
    const fabric = new THREE.Group();
    fabric.position.set(0, 0.85, -0.5);
    const colors = ['#E39B3D', '#F2E6C9', '#C0502F'];
    for (let k = 0; k < 7; k++) {
      const x = -0.75 + k * 0.25;
      const sag = 0.38 * Math.sin(((k + 0.5) / 7) * PI);
      fabric.add(dyn(0.26, 0.04, 0.42, colors[k % 3], x, -0.05 - sag, 0));
    }
    for (const x of [-0.92, 0.92]) fabric.add(dyn(0.2, 0.02, 0.02, '#F2E6C9', x * 0.95, -0.02, 0));
    c.add(fabric);
    const spot = c.spot('hammock', 0, -0.5, { lift: 0.5, heading: PI / 2, approach: [0, 1] });
    c.onUpdate((t) => {
      fabric.rotation.x = Math.sin(t * 1.2) * (occupied([spot]) ? 0.12 : 0.04);
    });
  },

  heatpad(c) {
    const pad = dyn(0.78, 0.05, 0.78, null, 0, 0.025, 0, { material: new THREE.MeshLambertMaterial({ color: '#E8913A', emissive: '#FF6A1A' }) });
    c.add(pad);
    for (let k = -1; k <= 1; k++) c.b.box(k * 0.24, 0.05, 0, 0.02, 0.005, 0.7, '#C0502F');
    c.b.box(0.36, 0, 0.3, 0.08, 0.04, 0.12, '#2B2B33');
    c.spot('heatpad', 0, 0, { lift: 0.05, heading: c.rand() * PI * 2 });
    c.onUpdate((t) => {
      pad.material.emissiveIntensity = 0.25 + 0.15 * Math.sin(t * 1.5);
    });
  },

  beanbag(c) {
    const colors = ['#E39B3D', '#C0502F', '#9DAE4A', '#7A4FA0'];
    const g = new THREE.SphereGeometry(0.34, 8, 5);
    g.scale(1, 0.55, 1);
    g.translate(0, 0.17, 0);
    c.b.add(g, colors[Math.floor(c.rand() * colors.length)], 0, 0, 0);
    c.spot('beanbag', 0, 0, { lift: 0.22, heading: 0.5 });
  },

  box(c) {
    const b = c.b.at(0, 0, 0.2);
    b.box(0, 0, 0, 0.56, 0.03, 0.5, '#B98B57');
    for (const [x, z, w, d] of [
      [0, -0.24, 0.56, 0.03],
      [0, 0.24, 0.56, 0.03],
      [-0.27, 0, 0.03, 0.5],
      [0.27, 0, 0.03, 0.5],
    ]) b.box(x, 0, z, w, 0.24, d, '#C79A5B');
    b.box(0, 0.24, 0.33, 0.56, 0.02, 0.2, '#B98B57', { rotX: -0.6 });
    b.box(-0.37, 0.24, 0, 0.2, 0.02, 0.5, '#B98B57', { rotZ: 0.6 });
    b.box(0.05, 0.12, 0.256, 0.18, 0.06, 0.005, '#5A4030');
    c.spot('box', 0, 0, { lift: 0.03 });
  },

  catTree(c) {
    const b = c.b.at(-0.5, 0);
    b.box(0, 0, 0, 0.8, 0.06, 0.8, '#C9B48A');
    b.box(0, 0.06, 0, 0.14, 1.0, 0.14, '#D9C08A');
    for (let y = 0.15; y < 1; y += 0.12) b.box(0, y, 0, 0.15, 0.03, 0.15, '#B89A62');
    b.box(-0.1, 0.5, -0.05, 0.55, 0.06, 0.55, '#C9B48A');
    b.box(0, 1.0, 0, 0.66, 0.08, 0.66, '#C9B48A');
    b.box(-0.25, 0.32, -0.25, 0.08, 0.08, 0.08, '#D0384A');
    c.spot('scratch', 0.32, 0, { heading: -PI / 2, approach: [1, 0] });
    c.spot('treeTop', -0.5, 0, { lift: 1.08, approach: [1, 0] });
  },

  yarn(c) {
    c.b.cyl(0, 0, 0, 0.22, 0.2, '#B98B57', { segments: 8 });
    for (const [dx, dz, col] of [
      [-0.07, 0, '#3A6FD0'],
      [0.07, 0.05, '#9DAE4A'],
      [0, -0.08, '#E39B3D'],
    ]) c.b.add(new THREE.IcosahedronGeometry(0.08, 0), col, dx, 0.22, dz);
    if (!c.preview) {
      const [x, z] = c.world(0, 0.8);
      c.office.addYarn(x, z);
    }
  },

  boombox(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 0.62, 0.38, 0.55, '#7A4E2E');
    b.box(0, 0.38, 0, 0.52, 0.22, 0.16, '#C9CED6');
    b.box(0, 0.6, 0, 0.36, 0.03, 0.03, '#8A9099');
    b.box(0, 0.47, 0.081, 0.12, 0.07, 0.01, '#3A3A44');
    const speakers = [-0.17, 0.17].map((x) => {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 10), mat('#2A2A33'));
      sp.rotation.x = PI / 2;
      sp.position.set(x, 0.49, -0.5 + 0.085);
      c.add(sp);
      return sp;
    });
    const spots = [
      c.spot('vibe', -1, -0.5, { heading: PI / 2, approach: [0, 0] }),
      c.spot('vibe', 1, -0.5, { heading: -PI / 2, approach: [2, 0] }),
      c.spot('vibe', 0, 0.45, { heading: PI, approach: [1, 1] }),
    ];
    c.onUpdate((t) => {
      const vibing = spots.some((s) => s?.occupant?.isVibing);
      for (const sp of speakers) sp.scale.setScalar(vibing ? 1 + 0.18 * Math.max(0, Math.sin(t * PI * 4.4)) : 1);
    });
  },

  tunnel(c) {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 1.7, 10, 1, true),
      new THREE.MeshLambertMaterial({ color: '#7A4FA0', side: THREE.DoubleSide }),
    );
    tube.rotation.z = PI / 2;
    tube.position.y = 0.24;
    tube.castShadow = true;
    c.add(tube);
    for (const x of [-0.6, -0.2, 0.2, 0.6]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 10, 1, true), new THREE.MeshLambertMaterial({ color: '#4E2E70', side: THREE.DoubleSide }));
      ring.rotation.z = PI / 2;
      ring.position.set(x, 0.24, 0);
      c.add(ring);
    }
    c.spot('tunnel', 0, 0, { heading: PI / 2 });
  },

  aquarium(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 1.8, 0.45, 0.6, '#3A2A20');
    for (const x of [-0.45, 0.45]) b.box(x, 0.06, 0.301, 0.8, 0.32, 0.01, '#4A3426');
    b.box(0, 0.45, 0, 1.66, 0.06, 0.5, '#E8D49A');
    b.box(-0.55, 0.51, -0.05, 0.12, 0.2, 0.12, '#8A9099');
    b.box(-0.55, 0.71, -0.05, 0.06, 0.06, 0.06, '#D04A4A');
    for (let k = 0; k < 5; k++) b.box(0.2 + k * 0.12, 0.51, -0.12 + (k % 2) * 0.1, 0.04, 0.18 + (k % 3) * 0.08, 0.04, k % 2 ? '#4F8A3A' : '#6FAF4A');
    b.box(0, 1.15, 0, 1.74, 0.05, 0.58, '#2B2B33');
    const glass = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: '#7FC8F0', transparent: true, opacity: 0.32, depthWrite: false }));
    glass.scale.set(1.7, 0.7, 0.54);
    glass.position.set(0, 0.8, -0.5);
    c.add(glass);
    const fish = ['#FF8A2A', '#FFE14F', '#4FE0FF', '#FF4FA3', '#FF8A2A'].map((color, k) => {
      const f = new THREE.Group();
      f.add(dyn(0.09, 0.05, 0.03, color, 0, 0, 0), dyn(0.03, 0.05, 0.02, color, -0.06, 0, 0));
      f.userData = { speed: 0.3 + k * 0.08, phase: k * 1.3, y: 0.6 + k * 0.08, z: -0.65 + (k % 3) * 0.13 };
      c.add(f);
      return f;
    });
    c.light('#6FC8FF', 0.5, 1.6, 1.5, 0, 0.9, 0);
    c.spot('aquarium', -0.45, 0.3, { heading: PI, approach: [0, 1] });
    c.spot('aquarium', 0.45, 0.3, { heading: PI, approach: [1, 1] });
    c.onUpdate((t) => {
      for (const f of fish) {
        const u = f.userData;
        const x = Math.sin(t * u.speed + u.phase) * 0.7;
        f.position.set(x, u.y + Math.sin(t * 2 + u.phase) * 0.03, u.z);
        f.rotation.y = Math.cos(t * u.speed + u.phase) > 0 ? 0 : PI;
      }
    });
  },

  wheel(c) {
    const b = c.b.at(0, -0.5);
    for (const x of [-0.28, 0.28]) {
      b.box(x, 0, -0.25, 0.05, 0.7, 0.05, '#8A5A35', { rotX: 0.35 });
      b.box(x, 0, 0.25, 0.05, 0.7, 0.05, '#8A5A35', { rotX: -0.35 });
      b.box(x, 0, 0, 0.08, 0.04, 0.7, '#6B4024');
    }
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.56, -0.5);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * PI * 2;
      const seg = dyn(0.46, 0.04, 0.19, k % 2 ? '#E8D49A' : '#D9C08A', 0, Math.cos(a) * 0.52, Math.sin(a) * 0.52);
      seg.rotation.x = a;
      wheel.add(seg);
    }
    for (let k = 0; k < 4; k++) {
      const spoke = dyn(0.03, 1.04, 0.04, '#C0502F', 0.24, 0, 0);
      spoke.rotation.x = (k / 4) * PI;
      wheel.add(spoke);
    }
    c.add(wheel);
    const spot = c.spot('wheel', 0, -0.5, { lift: 0.06, heading: 0, approach: [0, 1] });
    c.onUpdate((t, dt) => {
      if (occupied([spot])) wheel.rotation.x -= dt * 4.5;
    });
  },

  tv(c) {
    const b = c.b.at(0, -0.6);
    b.box(0, 0, 0, 1.6, 0.4, 0.5, '#6B4024');
    for (const x of [-0.4, 0.4]) b.box(x, 0.05, 0.251, 0.7, 0.28, 0.01, '#5A3420');
    b.box(0, 0.4, 0, 0.72, 0.56, 0.5, '#3A3A44');
    b.box(0, 0.45, -0.3, 0.5, 0.4, 0.12, '#2E2E36');
    b.box(-0.12, 0.96, -0.05, 0.02, 0.3, 0.02, '#9A9A9A', { rotZ: 0.4 });
    b.box(0.12, 0.96, -0.05, 0.02, 0.3, 0.02, '#9A9A9A', { rotZ: -0.4 });
    b.box(0.6, 0.4, 0.05, 0.3, 0.07, 0.22, '#B9B4C9');
    for (const x of [0.48, 0.72]) b.box(x, 0.4, 0.2, 0.1, 0.03, 0.06, '#5A5A66');
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.42), new THREE.MeshBasicMaterial({ map: tvGameTexture() }));
    screen.position.set(0, 0.68, -0.6 + 0.252);
    c.add(screen);
    const light = c.light('#8FB8FF', 0.4, 1.8, 1.5, 0, 0.7, -0.1);
    c.spot('tv', -0.45, 0.35, { heading: PI, approach: [0, 1] });
    c.spot('tv', 0.45, 0.35, { heading: PI, approach: [1, 1] });
    c.onUpdate((t) => {
      screen.material.map.offset.x = (t * 0.15) % 1;
      if (light) light.intensity = 0.35 + 0.1 * Math.sin(t * 13);
    });
  },

  piano(c) {
    const b = c.b.at(0, -0.7);
    b.box(0, 0, 0, 1.6, 1.0, 0.5, '#3A2018');
    b.box(0, 0.5, 0.33, 1.5, 0.06, 0.25, '#2A1610');
    b.box(0, 0.56, 0.33, 1.42, 0.03, 0.22, '#F4EEDC');
    for (let k = 0; k < 14; k++) if (k % 7 !== 2 && k % 7 !== 6) b.box(-0.66 + k * 0.1, 0.59, 0.28, 0.05, 0.03, 0.12, '#1B1420');
    for (const x of [-0.72, 0.72]) b.box(x, 0, 0.3, 0.08, 0.5, 0.08, '#2A1610');
    b.box(0, 0.85, 0.27, 0.6, 0.25, 0.02, '#2A1610', { rotX: -0.2 });
    b.box(0, 0.88, 0.285, 0.4, 0.18, 0.01, '#F4EEDC', { rotX: -0.2 });
    b.box(0.6, 1.0, 0, 0.06, 0.12, 0.06, '#C9A54A');
    b.box(0.6, 1.12, 0, 0.03, 0.05, 0.03, '#F2E6C9');
    c.spot('piano', 0, -0.37, { lift: 0.58, heading: PI / 2, approach: [0, 1] });
  },

  foosball(c) {
    const b = c.b;
    for (const x of [-0.55, 0.55]) for (const z of [-0.3, 0.3]) b.box(x, 0, z, 0.06, 0.42, 0.06, '#2B2B33');
    b.box(0, 0.42, 0, 1.3, 0.2, 0.75, '#6B4024');
    b.box(0, 0.6, 0, 1.2, 0.01, 0.65, '#3E8C3A');
    b.box(0, 0.605, 0, 0.02, 0.005, 0.65, '#F2F2F2');
    const rods = [-0.42, -0.14, 0.14, 0.42];
    rods.forEach((x, k) => {
      b.box(x, 0.68, 0, 0.025, 0.025, 1.1, '#C9CED6');
      for (const z of k % 2 ? [-0.18, 0.18] : [-0.25, 0, 0.25]) b.box(x, 0.6, z, 0.05, 0.12, 0.05, k < 2 ? '#D04A4A' : '#3A6FD0');
    });
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), mat('#FFFFFF'));
    ball.position.set(0, 0.64, 0);
    c.add(ball);
    const spots = [c.spot('foosball', -1.0, 0, { heading: PI / 2, approach: [0, 0] }), c.spot('foosball', 1.0, 0, { heading: -PI / 2, approach: [2, 0] })];
    c.onUpdate((t) => {
      const active = occupied(spots);
      ball.position.x = active ? Math.sin(t * 2.3) * 0.5 : 0;
      ball.position.z = active ? Math.sin(t * 3.7) * 0.25 : 0;
    });
  },

  pinball(c) {
    const b = c.b.at(0, -0.15);
    for (const z of [-0.45, 0.4]) for (const x of [-0.25, 0.25]) b.box(x, 0, z, 0.05, 0.55, 0.05, '#2B2B33');
    b.box(0, 0.52, 0, 0.62, 0.22, 1.1, '#2A1E4E', { rotX: 0.06 });
    b.box(0, 0.75, 0, 0.56, 0.01, 1.0, '#1A3A6A', { rotX: 0.06 });
    b.box(0, 0.7, -0.6, 0.62, 0.65, 0.12, '#2A1E4E');
    for (const x of [-0.12, 0.12]) b.box(x, 0.74, 0.42, 0.1, 0.02, 0.03, '#E8E8E8', { rotY: x > 0 ? -0.5 : 0.5 });
    const sign = c.office.sign('PINBALL', { color: '#FFE14F', glow: '#FFFFFF', w: 48, h: 12 }, 0.5, 0.14);
    sign.position.set(0, 1.18, -0.68);
    c.add(sign);
    const lights = [];
    for (let k = 0; k < 6; k++) {
      const l = dyn(0.05, 0.02, 0.05, null, -0.18 + (k % 3) * 0.18, 0.78 - k * 0.006, -0.35 + Math.floor(k / 3) * 0.3, {
        material: new THREE.MeshBasicMaterial({ color: ['#FF4FA3', '#4FE0FF', '#FFE14F'][k % 3] }),
      });
      lights.push(l);
      c.add(l);
    }
    const spot = c.spot('pinball', 0, 0.62, { heading: PI, approach: [0, 1] });
    c.onUpdate((t) => {
      const fast = occupied([spot]);
      lights.forEach((l, k) => (l.visible = Math.sin(t * (fast ? 12 : 2) + k * 1.7) > 0));
    });
  },

  arcade(c) {
    const b = c.b.at(0, -0.64);
    b.box(0, 0, 0, 0.7, 0.95, 0.66, '#3A2A6A');
    b.box(0, 0.25, 0.331, 0.5, 0.3, 0.01, '#FF4FA3');
    b.box(0, 0.95, 0.12, 0.7, 0.08, 0.34, '#2A1E4E', { rotX: -0.2 });
    b.box(-0.12, 1.02, 0.18, 0.03, 0.08, 0.03, '#2B2B33');
    b.box(-0.12, 1.1, 0.18, 0.06, 0.05, 0.06, '#D0384A');
    for (const [x, col] of [
      [0.06, '#FFE14F'],
      [0.14, '#4FE0FF'],
      [0.22, '#FF4FA3'],
    ]) b.box(x, 1.02, 0.2, 0.05, 0.03, 0.05, col);
    b.box(0, 1.03, -0.08, 0.7, 0.55, 0.5, '#3A2A6A');
    b.box(0, 1.58, -0.05, 0.72, 0.16, 0.56, '#2A1E4E');
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.4), new THREE.MeshBasicMaterial({ map: arcadeTexture() }));
    screen.position.set(0, 1.31, -0.64 + 0.171);
    screen.rotation.x = -0.12;
    const marquee = c.office.sign('MŇAU-MAN', { color: '#FFB0D8', glow: '#FFFFFF', w: 64, h: 12 }, 0.6, 0.12);
    marquee.position.set(0, 1.66, -0.64 + 0.235);
    c.add(screen, marquee);
    c.light('#B05AFF', 0.8, 1.8, 1.5, 0, 1.2, 0);
    c.spot('arcade', 0, 0.05, { heading: PI, approach: [0, 1] });
    c.onUpdate((t) => {
      screen.material.map.offset.y = (t * 0.4) % 1;
    });
  },

  plant(c) {
    const b = c.b;
    b.box(0, 0, 0, 0.32, 0.3, 0.32, '#B5502E');
    b.box(0, 0.3, 0, 0.36, 0.04, 0.36, '#8E3A22');
    const h = c.rand() > 0.5 ? 0.7 : 0.45;
    for (let k = 0; k < 6; k++) {
      b.box(Math.cos(k) * 0.08, 0.3, Math.sin(k) * 0.08, 0.06, h * (0.7 + (k % 3) * 0.15), 0.22, k % 2 ? '#4F8A3A' : '#6FAF4A', {
        rotY: k * 1.05,
        rotX: 0.25 * (k % 2 ? 1 : -1),
      });
    }
  },

  lamp(c) {
    const b = c.b;
    b.box(0, 0, 0, 0.3, 0.04, 0.3, '#2B2B33');
    b.box(0, 0.04, 0, 0.04, 1.3, 0.04, '#C9A54A');
    b.box(0.15, 1.3, 0, 0.34, 0.04, 0.04, '#C9A54A');
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.18, 8), new THREE.MeshBasicMaterial({ color: '#FFE2A0' }));
    shade.position.set(0.3, 1.25, 0);
    c.add(shade);
    const light = c.light('#FFC870', 1.2, 3.5, 1.2, 0.3, 1.1, 0);
    c.onUpdate(() => {
      if (light) light.intensity = (1.4 - 0.8 * (c.office.daylight ?? 0)) * (c.office.power ?? 1);
    });
  },

  jukebox(c) {
    const b = c.b.at(0, -0.55);
    b.box(0, 0, 0, 0.76, 0.18, 0.6, '#5A2E1E');
    b.box(0, 0.18, 0, 0.7, 0.9, 0.56, '#8A3A2A');
    b.box(0, 0.32, 0.281, 0.46, 0.34, 0.01, '#2A1E1A');
    for (const x of [-0.12, 0, 0.12]) b.box(x, 0.36, 0.287, 0.06, 0.26, 0.01, '#C9A54A');
    b.box(0, 0.75, 0.281, 0.5, 0.2, 0.01, '#F4EEDC');
    b.box(0, 1.08, 0, 0.7, 0.1, 0.56, '#C9A54A');
    // The arch of coloured lights runs through the rainbow.
    const bulbs = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * PI;
      const m = dyn(0.07, 0.07, 0.05, '#FFFFFF', Math.cos(a) * 0.36, 1.14 + Math.sin(a) * 0.26, -0.55 + 0.28, { basic: true, material: new THREE.MeshBasicMaterial({ color: '#FFFFFF' }) });
      c.add(m);
      bulbs.push(m);
    }
    const light = c.light('#FF4FA3', 0.8, 2, 1.5, 0, 1.2, 0.2);
    const spots = [
      c.spot('vibe', -0.22, 0.5, { heading: PI, approach: [0, 1] }),
      c.spot('vibe', 0.22, 0.55, { heading: PI, approach: [0, 1] }),
    ];
    const color = new THREE.Color();
    c.onUpdate((t) => {
      const fast = spots.some((s) => s?.occupant?.isVibing) ? 3 : 1;
      const power = c.office.power ?? 1;
      bulbs.forEach((m, k) => {
        color.setHSL((t * 0.15 * fast + k / 9) % 1, 0.9, 0.6 * (0.3 + 0.7 * power));
        m.material.color.copy(color);
      });
      if (light) {
        light.color.setHSL((t * 0.15 * fast) % 1, 0.9, 0.6);
        light.intensity = 0.8 * power;
      }
    });
  },

  flowerbed(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 1.9, 0.14, 0.8, '#6B4A2E');
    b.box(0, 0.14, 0, 1.8, 0.03, 0.7, '#4A3220');
    const colors = ['#FF4FA3', '#FFE14F', '#F2E6C9', '#B05AFF', '#FF8A2A'];
    for (let k = 0; k < 10; k++) {
      const x = -0.8 + (k % 5) * 0.4 + (c.rand() - 0.5) * 0.1;
      const z = k < 5 ? -0.17 : 0.17;
      const h = 0.18 + c.rand() * 0.14;
      b.box(x, 0.17, z, 0.03, h, 0.03, '#4F8A3A');
      b.box(x, 0.17 + h, z, 0.1, 0.06, 0.1, colors[k % colors.length]);
    }
    const flies = [0, 1].map((k) => {
      const g = new THREE.Group();
      for (const side of [-1, 1]) g.add(dyn(0.06, 0.01, 0.05, k ? '#FFE14F' : '#FFFFFF', side * 0.035, 0, 0));
      c.add(g);
      return g;
    });
    c.spot('butterfly', -0.45, 0.4, { heading: PI, approach: [0, 1] });
    c.spot('butterfly', 0.45, 0.4, { heading: PI, approach: [1, 1] });
    c.onUpdate((t) => {
      flies.forEach((g, k) => {
        const p = t * (0.7 + k * 0.2) + k * 2;
        g.position.set(Math.sin(p) * 0.8, 0.55 + Math.sin(p * 2.7) * 0.15, -0.5 + Math.cos(p * 1.3) * 0.4 + 0.3);
        for (const [i, w] of g.children.entries()) w.rotation.z = (i ? -1 : 1) * Math.abs(Math.sin(t * 18 + k)) * 0.9;
      });
    });
  },

  birdbath(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 0.3, 0.06, 0.3, '#A9A39A');
    b.box(0, 0.06, 0, 0.1, 0.5, 0.1, '#BDB6AC');
    b.cyl(0, 0.56, 0, 0.3, 0.07, '#BDB6AC', { segments: 10 });
    b.cyl(0, 0.6, 0, 0.25, 0.04, '#8FD3F5', { segments: 10 });
    const bird = new THREE.Group();
    bird.add(dyn(0.1, 0.07, 0.14, '#6B8FD0', 0, 0, 0), dyn(0.07, 0.07, 0.07, '#6B8FD0', 0, 0.05, 0.07), dyn(0.03, 0.02, 0.04, '#F2C14E', 0, 0.05, 0.12));
    c.add(bird);
    const spot = c.spot('bird', 0, 0.45, { heading: PI, approach: [0, 1] });
    let away = 0;
    c.onUpdate((t, dt) => {
      // The bird flies off while a cat lurks and comes back later.
      const lurking = spot?.occupant?.act?.phase === 'do' && spot.occupant.act.spot === spot;
      away = Math.max(0, Math.min(1, away + (lurking && (t % 14) > 6 ? dt : -dt * 0.4)));
      const hop = Math.abs(Math.sin(t * 3)) * 0.03;
      bird.position.set(0.18 - away * 0.6, 0.68 + hop + away * 2.2, -0.5 + away * 0.3);
      bird.rotation.y = Math.sin(t * 0.8) * 1.2;
    });
  },

  pond(c) {
    const b = c.b.at(0, -0.5);
    for (const [x, z, w, d] of [
      [0, -0.4, 2, 0.2],
      [0, 0.4, 2, 0.2],
      [-0.9, 0, 0.2, 0.6],
      [0.9, 0, 0.2, 0.6],
    ]) b.box(x, 0, z, w, 0.12, d, '#A9A39A');
    b.box(0, 0, 0, 1.6, 0.04, 0.6, '#2F6E9A');
    b.box(0.6, 0.12, -0.38, 0.14, 0.06, 0.12, '#4F8A3A');
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshLambertMaterial({ color: '#5FA8D8', transparent: true, opacity: 0.75 }));
    water.rotation.x = -PI / 2;
    water.position.set(0, 0.07, -0.5);
    const fish = ['#FF8A2A', '#F2E6C9', '#FF4F4F'].map((color, k) => {
      const f = dyn(0.12, 0.03, 0.05, color, 0, 0.05, -0.5);
      f.userData = { speed: 0.5 + k * 0.17, phase: k * 2.1 };
      c.add(f);
      return f;
    });
    c.add(water);
    c.spot('aquarium', -0.45, 0.35, { heading: PI, approach: [0, 1] });
    c.spot('water', 0.45, 0.35, { heading: PI, approach: [1, 1] });
    c.onUpdate((t) => {
      for (const f of fish) {
        const u = f.userData;
        f.position.set(Math.sin(t * u.speed + u.phase) * 0.6, 0.05, -0.5 + Math.cos(t * u.speed * 1.3 + u.phase) * 0.18);
        f.rotation.y = Math.atan2(Math.cos(t * u.speed + u.phase), -Math.sin(t * u.speed * 1.3 + u.phase) * 0.4);
      }
    });
  },

  gardenTree(c) {
    const b = c.b.at(-0.5, -0.5);
    b.box(0, 0, 0, 0.32, 1.9, 0.32, '#6B4024');
    b.box(0.35, 1.18, 0.1, 0.6, 0.1, 0.16, '#6B4024');
    b.box(0.55, 1.22, 0.1, 0.42, 0.06, 0.42, '#5A3420');
    for (const [x, y, z, s, col] of [
      [0, 1.8, 0, 1.3, '#3F7A34'],
      [0.45, 1.65, 0.3, 0.8, '#4F8F3E'],
      [-0.35, 1.7, 0.35, 0.75, '#4F8F3E'],
      [0.1, 2.25, -0.1, 0.8, '#5E9B3E'],
    ]) b.box(x, y, z, s, s * 0.7, s, col);
    c.spot('treeTop', 0.08, -0.4, { lift: 1.28, approach: [1, 0], heading: PI / 2 });
  },

  deckchair(c) {
    const b = c.b;
    for (const x of [-0.28, 0.28]) {
      b.box(x, 0, -0.6, 0.04, 0.24, 0.04, '#C9A54A');
      b.box(x, 0, 0.6, 0.04, 0.22, 0.04, '#C9A54A');
    }
    for (let k = 0; k < 6; k++) b.box(0, 0.22, -0.55 + k * 0.22, 0.56, 0.03, 0.2, k % 2 ? '#FFFFFF' : '#3A6FD0');
    b.box(0, 0.25, -0.75, 0.56, 0.4, 0.04, '#3A6FD0', { rotX: -0.6 });
    c.spot('sun', 0, 0.05, { lift: 0.25, heading: 0, approach: [0, 1] });
  },

  lantern(c) {
    const b = c.b;
    b.box(0, 0, 0, 0.18, 0.06, 0.18, '#2B2B33');
    b.box(0, 0.06, 0, 0.06, 1.1, 0.06, '#2B2B33');
    b.box(0, 1.16, 0, 0.22, 0.04, 0.22, '#2B2B33');
    b.box(0, 1.42, 0, 0.26, 0.05, 0.26, '#2B2B33');
    const glow = dyn(0.18, 0.22, 0.18, '#FFE2A0', 0, 1.3, 0, { material: new THREE.MeshBasicMaterial({ color: '#FFE2A0' }) });
    c.add(glow);
    const light = c.light('#FFC870', 0, 4, 1.2, 0, 1.3, 0);
    c.onUpdate(() => {
      const on = (1 - (c.office.daylight ?? 0.5)) * (c.office.power ?? 1);
      glow.material.color.set(on > 0.3 ? '#FFE2A0' : '#8A8270');
      if (light) light.intensity = 1.6 * on;
    });
  },

  printer(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 0.5, 0.3, 0.6, '#4A4A52');
    b.box(0, 0.3, 0, 0.66, 0.24, 0.5, '#D9D4C8');
    b.box(0, 0.54, -0.05, 0.58, 0.03, 0.36, '#BDB6AC');
    b.box(0, 0.4, 0.251, 0.44, 0.03, 0.01, '#2B2B33');
    b.box(0.24, 0.48, 0.251, 0.06, 0.04, 0.01, '#4CFF7A');
    const paper = dyn(0.34, 0.01, 0.3, '#FFFFFF', 0, 0.42, -0.5 + 0.2);
    c.add(paper);
    c.spot('printer', 0, -0.05, { lift: 0.56, heading: PI, approach: [0, 1] });
    c.onUpdate((t) => {
      // Now and then a page creeps out.
      const p = (t * 0.12 + c.rand()) % 1;
      paper.position.z = -0.5 + 0.2 + Math.min(1, p * 3) * 0.2;
      paper.visible = p < 0.6;
    });
  },

  fountain(c) {
    const b = c.b.at(0, -0.5);
    b.cyl(0, 0, 0, 0.3, 0.14, '#5FA8D8', { segments: 12 });
    b.cyl(0, 0.14, 0, 0.26, 0.02, '#8FD3F5', { segments: 12 });
    b.cyl(0, 0.14, 0, 0.06, 0.16, '#E8E0D0', { segments: 8 });
    const drops = [0, 1, 2, 3].map((k) => {
      const m = dyn(0.025, 0.025, 0.025, '#BFE6FF', 0, 0.3, -0.5, { material: new THREE.MeshBasicMaterial({ color: '#BFE6FF' }) });
      m.userData.phase = k / 4;
      c.add(m);
      return m;
    });
    c.spot('water', 0, 0.02, { heading: PI, approach: [0, 1] });
    c.onUpdate((t) => {
      for (const m of drops) {
        const p = (t * 0.9 + m.userData.phase) % 1;
        const a = m.userData.phase * PI * 2;
        m.position.set(Math.cos(a) * p * 0.18, 0.32 + p * 0.12 - p * p * 0.3, -0.5 + Math.sin(a) * p * 0.18);
      }
    });
  },

  snackMachine(c) {
    const b = c.b.at(0, -0.58);
    b.box(0, 0, 0, 0.82, 1.7, 0.66, '#C0392B');
    b.box(-0.08, 0.5, 0.331, 0.54, 1.0, 0.01, '#2A2030');
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) b.box(-0.25 + col * 0.17, 0.58 + row * 0.24, 0.32, 0.1, 0.12, 0.04, ['#FFE14F', '#4FE0FF', '#FF8A2A', '#7CFF7A'][(row + col) % 4]);
    }
    b.box(0.3, 0.9, 0.331, 0.14, 0.4, 0.01, '#3A3A44');
    for (let k = 0; k < 6; k++) b.box(0.27 + (k % 2) * 0.06, 1.0 + Math.floor(k / 2) * 0.07, 0.338, 0.04, 0.04, 0.01, '#E8E8E8');
    b.box(-0.08, 0.15, 0.331, 0.5, 0.2, 0.01, '#141018');
    const glass = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: '#BFE6FF', transparent: true, opacity: 0.25, depthWrite: false }));
    glass.scale.set(0.54, 1.0, 0.02);
    glass.position.set(-0.08, 1.0, -0.58 + 0.345);
    c.add(glass);
    c.light('#FFF1D6', 0.5, 1.6, 1.5, 0, 1.2, 0);
    c.spot('food', 0, 0.05, { heading: PI, approach: [0, 1] });
  },

  catCondo(c) {
    const b = c.b.at(0, -0.5);
    b.box(0.5, 0, 0, 0.9, 0.55, 0.9, '#B98B57');
    b.box(0.5, 0.05, 0.451, 0.4, 0.36, 0.01, '#3A2A20');
    b.box(-0.5, 0, 0, 0.16, 1.5, 0.16, '#D9C08A');
    for (let y = 0.1; y < 1.5; y += 0.12) b.box(-0.5, y, 0, 0.17, 0.03, 0.17, '#B89A62');
    b.box(0.5, 0.55, 0, 0.12, 0.5, 0.12, '#D9C08A');
    b.box(0, 1.05, 0, 1.6, 0.06, 0.7, '#C9B48A');
    b.box(-0.5, 1.5, 0, 0.8, 0.07, 0.8, '#C9B48A');
    b.box(-0.5, 1.57, 0, 0.66, 0.06, 0.66, '#8E5AA8');
    c.spot('treeTop', -0.5, -0.5, { lift: 1.63, approach: [0, 1] });
    c.spot('box', 0.5, -0.32, { heading: 0, approach: [1, 1] });
  },

  ballPit(c) {
    const b = c.b.at(0, -0.5);
    for (const [x, z, w, d] of [
      [0, -0.42, 1.9, 0.12],
      [0, 0.42, 1.9, 0.12],
      [-0.9, 0, 0.12, 0.84],
      [0.9, 0, 0.12, 0.84],
    ]) b.box(x, 0, z, w, 0.3, d, '#4FE0FF');
    b.box(0, 0, 0, 1.7, 0.04, 0.74, '#3A6FD0');
    const colors = ['#FF4F4F', '#FFE14F', '#7CFF7A', '#FF4FA3', '#4FA3FF'];
    const balls = [];
    for (let k = 0; k < 26; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), mat(colors[k % colors.length]));
      m.userData = { x: -0.75 + c.rand() * 1.5, z: -0.5 + (c.rand() - 0.5) * 0.6, y: 0.08 + c.rand() * 0.12, phase: c.rand() * 6 };
      m.position.set(m.userData.x, m.userData.y, m.userData.z);
      m.castShadow = true;
      c.add(m);
      balls.push(m);
    }
    const spots = [-0.45, 0.45].map((x, k) => c.spot('ballPit', x, -0.5, { lift: 0.1, heading: PI, approach: [k, 1] }));
    c.onUpdate((t) => {
      const busy = spots.some((s) => s?.occupant?.act?.spot === s && s.occupant.act.phase === 'do');
      for (const m of balls) {
        const u = m.userData;
        m.position.y = u.y + (busy ? Math.max(0, Math.sin(t * 6 + u.phase)) * 0.25 : 0);
      }
    });
  },

  trophyCase(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 1.8, 0.3, 0.6, '#6B4024');
    b.box(0, 1.5, 0, 1.8, 0.08, 0.6, '#6B4024');
    for (const x of [-0.88, 0.88]) b.box(x, 0.3, 0, 0.06, 1.2, 0.6, '#6B4024');
    for (const y of [0.3, 0.7, 1.1]) b.box(0, y, 0, 1.7, 0.03, 0.56, '#E8D49A');
    const glass = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: '#BFE6FF', transparent: true, opacity: 0.18, depthWrite: false }));
    glass.scale.set(1.7, 1.2, 0.02);
    glass.position.set(0, 0.9, -0.5 + 0.29);
    c.add(glass);
    // One little trophy per kind of find; it shows up once the cats have one.
    const colors = ['#9AA0AE', '#D04A4A', '#D9B98A', '#F2E6C9', '#F5C542', '#FFE14F', '#E8E0D0', '#2B2B33', '#4F8A3A', '#B8B0A6', '#FF8A9A', '#FFE14F'];
    const trophies = Object.keys(COLLECTIBLES).map((id, k) => {
      const shelf = Math.floor(k / 4);
      const m = dyn(0.12, 0.14, 0.12, colors[k % colors.length], -0.6 + (k % 4) * 0.4, 0.4 + shelf * 0.4, -0.5);
      m.userData.id = id;
      c.add(m);
      return m;
    });
    c.light('#FFE9A8', 0.4, 1.4, 1.5, 0, 1.3, 0);
    c.spot('trophy', 0, 0.35, { heading: PI, approach: [0, 1] });
    c.onUpdate((t) => {
      const have = c.office.collection ?? {};
      for (const m of trophies) {
        m.visible = (have[m.userData.id] ?? 0) > 0;
        m.rotation.y = t * 0.6;
      }
    });
  },

  catHouse(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 1.4, 0.7, 0.8, '#A9672E');
    b.box(0, 0.05, 0.401, 0.5, 0.5, 0.01, '#2A1E1A');
    b.box(-0.37, 0.7, 0, 0.8, 0.07, 0.95, '#C0392B', { rotZ: 0.55 });
    b.box(0.37, 0.7, 0, 0.8, 0.07, 0.95, '#C0392B', { rotZ: -0.55 });
    b.box(0, 0.98, 0, 0.12, 0.06, 0.95, '#8E2A20');
    b.box(0.45, 0.35, 0.402, 0.3, 0.08, 0.01, '#F2E6C9');
    c.spot('catHouse', 0, -0.4, { heading: 0, approach: [0, 1] });
  },

  gnome(c) {
    const b = c.b.at(0, -0.5);
    b.box(0, 0, 0, 0.26, 0.04, 0.26, '#7A6A5A');
    b.box(0, 0.04, 0, 0.2, 0.22, 0.16, '#3A6FD0');
    b.box(0, 0.26, 0, 0.16, 0.12, 0.14, '#F2C9A8');
    b.box(0, 0.22, 0.07, 0.14, 0.14, 0.04, '#F4F2EE');
    b.cyl(0, 0.38, 0, 0.1, 0.24, '#D0384A', { rTop: 0.005, segments: 6 });
    c.spot('gnome', 0, 0.45, { heading: PI, approach: [0, 1] });
  },

  rug(c) {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshLambertMaterial({ map: rugTexture() }));
    rug.rotation.x = -PI / 2;
    rug.position.y = 0.004;
    rug.receiveShadow = true;
    c.add(rug);
  },
};

export function buildItem(office, item, opts) {
  const ctx = new ItemCtx(office, item, opts);
  BUILDERS[item.type](ctx);
  ctx.finish();
  return ctx;
}

