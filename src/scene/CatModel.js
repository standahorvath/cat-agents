// Blocky 3D cat with a simple rig. Local forward is +Z, the root sits on the floor.
// Everything that moves is a Group pivot; boxes are leaves so scaling never leaks.

import * as THREE from 'three';
import { COSMETIC_BUILDERS } from './cosmetics.js';
import { BOX, mat } from './voxel.js';
import { COSMETICS } from '../../shared/cats.js';

const PINK = '#EE8B9C';
const DARK = '#1B1420';
const shadeHex = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
};

function leaf(parent, w, h, d, color, x, y, z, opts) {
  const m = new THREE.Mesh(BOX, mat(color, opts));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = 'YXZ';
  parent.add(g);
  return g;
}

export class CatModel {
  constructor(fur, { kitten = false } = {}) {
    this.fur = fur;
    const legColor = fur.points ?? fur.base;
    const pawColor = fur.tuxedo ? fur.belly : fur.points ? shadeHex(fur.points, 1.3) : shadeHex(legColor, 1.12);

    this.root = new THREE.Group();
    this.root.scale.setScalar(kitten ? 0.95 : 1.6);
    this.fat = 0; // 0 slim to 1 round (a full context)
    this.hips = pivot(this.root, 0, 0.215, 0);
    this.torso = pivot(this.hips, 0, 0, 0);

    // Body and its markings
    leaf(this.torso, 0.22, 0.18, 0.42, fur.base, 0, 0, 0);
    leaf(this.torso, 0.226, 0.05, 0.3, fur.belly, 0, -0.068, 0.01);
    const glow = fur.glow ? { basic: true } : undefined;
    if (fur.stripe) for (const z of [-0.13, -0.05, 0.03, 0.11]) leaf(this.torso, 0.228, 0.1, 0.03, fur.stripe, 0, 0.042, z);
    if (fur.stripes) fur.stripes.forEach((color, k) => leaf(this.torso, 0.228, 0.1, 0.03, color, 0, 0.042, -0.13 + k * 0.08, glow));
    if (fur.specks) {
      for (const [x, y, z] of [[0.08, 0.091, -0.12], [-0.05, 0.091, -0.02], [0.04, 0.091, 0.1], [-0.09, 0.091, 0.13], [0.111, 0.02, 0.03], [-0.111, 0.03, -0.09], [0.111, -0.01, -0.15], [-0.111, 0.0, 0.08]]) {
        leaf(this.torso, Math.abs(x) > 0.1 ? 0.01 : 0.045, Math.abs(x) > 0.1 ? 0.045 : 0.01, 0.045, fur.specks, x, y, z);
      }
    }
    if (fur.patches) {
      leaf(this.torso, 0.12, 0.186, 0.15, fur.patches[0], 0.056, 0, -0.08);
      leaf(this.torso, 0.1, 0.186, 0.1, fur.patches[1], -0.066, 0, 0.09);
    }
    if (fur.tuxedo) leaf(this.torso, 0.16, 0.13, 0.02, fur.belly, 0, -0.02, 0.212);
    if (fur.points) leaf(this.torso, 0.228, 0.06, 0.12, shadeHex(fur.base, 0.85), 0, 0.065, -0.14);

    // Head
    this.neck = pivot(this.hips, 0, 0.06, 0.2);
    this.head = pivot(this.neck, 0, 0, 0);
    if (kitten) this.head.scale.setScalar(1.3);
    this.headScale = this.head.scale.x;
    const H = this.head;
    leaf(H, 0.24, 0.2, 0.2, fur.base, 0, 0.08, 0.08);
    if (fur.patches) leaf(H, 0.1, 0.206, 0.206, fur.patches[1], 0.076, 0.08, 0.08);
    if (fur.stripe) for (const dx of [-0.035, 0, 0.035]) leaf(H, 0.02, 0.05, 0.006, fur.stripe, dx, 0.155, 0.181);
    if (fur.specks) for (const [x, y] of [[-0.085, 0.04], [0.09, 0.13], [0.04, 0.165]]) leaf(H, 0.035, 0.035, 0.006, fur.specks, x, y, 0.181);
    if (fur.points) leaf(H, 0.16, 0.12, 0.006, fur.points, 0, 0.055, 0.181);
    leaf(H, 0.12, 0.07, 0.03, fur.points ?? fur.belly, 0, 0.035, 0.192);
    leaf(H, 0.035, 0.025, 0.012, PINK, 0, 0.066, 0.209);
    this.mouth = leaf(H, 0.05, 0.035, 0.012, '#5A1E2A', 0, 0.01, 0.209);

    this.ears = [-1, 1].map((side) => {
      const g = pivot(H, side * 0.075, 0.175, 0.06);
      leaf(g, 0.075, 0.085, 0.05, fur.points ?? fur.base, 0, 0.04, 0);
      leaf(g, 0.04, 0.05, 0.01, fur.ear ?? PINK, 0, 0.035, 0.026);
      return g;
    });

    this.eyes = [-1, 1].map((side) => {
      const g = pivot(H, side * 0.06, 0.112, 0.181);
      if (fur.colorEyes) {
        leaf(g, 0.045, 0.055, 0.01, fur.eye, 0, 0, 0, glow);
        leaf(g, 0.016, 0.05, 0.012, DARK, 0, 0, 0.001);
      } else {
        leaf(g, 0.042, 0.055, 0.01, DARK, 0, 0, 0);
      }
      leaf(g, 0.014, 0.014, 0.014, '#FFFFFF', -side * 0.01, 0.014, 0.002);
      const closed = leaf(H, 0.05, 0.012, 0.012, DARK, side * 0.06, 0.1, 0.182);
      return { open: g, closed };
    });

    // Legs: pivots at the shoulders/hips, the leg hangs down along -Y
    this.legs = {};
    for (const [name, x, z] of [
      ['fl', 0.065, 0.15],
      ['fr', -0.065, 0.15],
      ['bl', 0.065, -0.15],
      ['br', -0.065, -0.15],
    ]) {
      const g = pivot(this.hips, x, -0.06, z);
      leaf(g, 0.06, 0.14, 0.06, legColor, 0, -0.07, 0);
      leaf(g, 0.066, 0.03, 0.075, pawColor, 0, -0.13, 0.007);
      this.legs[name] = g;
    }

    // Tail: a chain of four segments pointing backwards (-Z)
    this.tail = [];
    let parent = this.hips;
    for (let i = 0; i < 4; i++) {
      const g = pivot(parent, 0, i === 0 ? 0.04 : 0, i === 0 ? -0.205 : -0.075);
      let color = fur.points ?? fur.base;
      if (fur.stripe && i % 2 === 1) color = fur.stripe;
      if (fur.stripes) color = fur.stripes[i % fur.stripes.length];
      if (fur.tuxedo && i === 3) color = fur.belly;
      leaf(g, 0.05, 0.05, 0.085, color, 0, 0, -0.04);
      this.tail.push(g);
      parent = g;
    }

    // Props held in front of the chest
    this.propHolder = pivot(this.root, 0, 0.26, 0.3);
    this.props = {
      phone: this.buildPhone(),
      mug: this.buildMug(),
      book: this.buildBook(),
    };
    for (const p of Object.values(this.props)) {
      p.visible = false;
      this.propHolder.add(p);
    }
  }

  buildPhone() {
    const g = new THREE.Group();
    leaf(g, 0.075, 0.13, 0.014, '#222230', 0, 0, 0);
    this.phoneScreen = leaf(g, 0.062, 0.105, 0.018, '#9FE8FF', 0, 0.004, 0, { basic: true });
    g.rotation.x = -0.6;
    g.position.set(0, 0.04, 0);
    return g;
  }

  buildMug() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.075, 8), mat('#F2EEE6'));
    body.castShadow = true;
    g.add(body);
    leaf(g, 0.015, 0.04, 0.015, '#F2EEE6', 0.048, 0, 0);
    leaf(g, 0.06, 0.008, 0.06, '#5A3420', 0, 0.034, 0);
    g.position.set(0, 0.05, 0.01);
    return g;
  }

  buildBook() {
    const g = new THREE.Group();
    const left = leaf(g, 0.1, 0.13, 0.012, '#B8463F', -0.045, 0, 0);
    const right = leaf(g, 0.1, 0.13, 0.012, '#B8463F', 0.045, 0, 0);
    leaf(g, 0.088, 0.115, 0.014, '#F4EEDC', -0.045, 0, 0.002);
    leaf(g, 0.088, 0.115, 0.014, '#F4EEDC', 0.045, 0, 0.002);
    left.rotation.y = 0.35;
    right.rotation.y = -0.35;
    g.rotation.x = -0.5;
    g.position.set(0, 0.06, 0);
    return g;
  }

  // Put on clothes: { head: 'tophat', eyes: 'sunglasses', neck: 'scarf' }.
  setWear(wear = {}) {
    const key = JSON.stringify(wear);
    if (key === this.wearKey) return;
    this.wearKey = key;
    for (const g of this.wearGroups ?? []) g.parent?.remove(g);
    this.wearGroups = [];
    for (const id of Object.values(wear)) {
      const def = COSMETICS[id];
      const build = COSMETIC_BUILDERS[id];
      if (!def || !build) continue;
      const g = new THREE.Group();
      build(g);
      (def.slot === 'neck' ? this.neck : this.head).add(g);
      this.wearGroups.push(g);
    }
  }

  apply(p) {
    this.hips.position.set(0, p.y + (p.bounce ?? 0), p.hz ?? 0);
    this.hips.rotation.set(p.pitch, p.yaw ?? 0, p.roll);
    // A fuller context makes a rounder cat: wider and deeper belly, chubby cheeks.
    const f = this.fat;
    this.torso.scale.set(1 + 0.85 * f, (1 + p.breathe) * (1 + 0.35 * f), 1 + 0.12 * f);
    this.head.scale.x = this.headScale * (1 + 0.16 * f);
    this.neck.rotation.set(p.headPitch, p.headYaw, p.headRoll);
    for (const name of ['fl', 'fr', 'bl', 'br']) {
      const g = this.legs[name];
      g.rotation.x = p[name];
      g.rotation.z = name === 'fl' ? p.flz : name === 'fr' ? p.frz : 0;
      g.scale.y = name[0] === 'f' ? p.fs : p.bs;
    }
    this.tail.forEach((g, i) => {
      g.rotation.x = i === 0 ? p.tailBase : p.tailCurl;
      g.rotation.y = p.tailSway * (i === 0 ? 0.6 : 1);
    });
    const eyes = Math.max(0, p.eyes);
    for (const e of this.eyes) {
      e.open.visible = eyes > 0.25;
      e.closed.visible = eyes <= 0.25;
      const wide = eyes > 1.05 ? Math.min(1.45, eyes) : 1;
      e.open.scale.set(wide, Math.min(1, eyes) * wide, 1);
    }
    this.mouth.visible = p.mouth > 0.08;
    this.mouth.scale.y = 0.035 * (0.6 + p.mouth);
    for (const [i, ear] of this.ears.entries()) {
      ear.rotation.x = -p.ears * 0.7;
      ear.rotation.z = (i === 0 ? 1 : -1) * p.ears * 0.5;
    }
    for (const [name, prop] of Object.entries(this.props)) prop.visible = p.prop === name;
    this.propHolder.position.set(0, p.propY ?? 0.26, p.propZ ?? 0.3);
  }
}
