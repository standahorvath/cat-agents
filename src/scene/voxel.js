// Helpers for building the blocky world: one merged, vertex-coloured mesh for all the
// static furniture, plus small cached materials for moving parts.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BOX = new THREE.BoxGeometry(1, 1, 1);

const materials = new Map();
export function mat(color, { emissive = null, basic = false, transparent = false, opacity = 1 } = {}) {
  const key = `${color}|${emissive}|${basic}|${transparent}|${opacity}`;
  let m = materials.get(key);
  if (!m) {
    m = basic
      ? new THREE.MeshBasicMaterial({ color, transparent, opacity })
      : new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000', transparent, opacity });
    materials.set(key, m);
  }
  return m;
}

// A box whose bottom-centre sits at (x, y, z). Leaf meshes only: never parent to them.
export function mbox(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(BOX, opts.material ?? mat(color, opts));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  return m;
}

// Collects boxes and other shapes in a local frame (origin + quarter-turn rotation),
// then merges everything into one mesh.
export class StaticBuilder {
  constructor() {
    this.geos = [];
    this.frame = { x: 0, z: 0, rot: 0 };
  }

  at(x, z, rot = 0) {
    this.frame = { x, z, rot };
    return this;
  }

  add(geometry, color, x, y, z, { rotY = 0, rotX = 0, rotZ = 0 } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const m = new THREE.Matrix4();
    const { x: fx, z: fz, rot } = this.frame;
    m.makeTranslation(fx, 0, fz);
    m.multiply(new THREE.Matrix4().makeRotationY(rot));
    m.multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')));
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    this.geos.push(g);
    return this;
  }

  // Box with its bottom-centre at local (x, y, z).
  box(x, y, z, w, h, d, color, opts = {}) {
    const g = BOX.clone();
    g.scale(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(g, color, x, y, z, opts);
  }

  cyl(x, y, z, r, h, color, { segments = 8, rTop = r } = {}) {
    const g = new THREE.CylinderGeometry(rTop, r, h, segments);
    g.translate(0, h / 2, 0);
    return this.add(g, color, x, y, z);
  }

  build(material) {
    if (!this.geos.length) return new THREE.Group();
    const merged = mergeGeometries(
      this.geos.map((g) => {
        // keep only shared attributes so every piece merges
        const clean = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv', 'color']) clean.setAttribute(name, g.attributes[name]);
        return clean;
      }),
    );
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
