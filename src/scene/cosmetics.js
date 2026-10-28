// Voxel clothing for cats. Head items are built in the head's frame (head box
// centred at (0, 0.08, 0.08), top at y 0.18, face at z 0.18); neck items in the
// neck pivot's frame, just under the chin.

import * as THREE from 'three';
import { BOX, mat } from './voxel.js';

const PI4 = Math.PI / 4;

function box(group, w, h, d, color, x, y, z, rot = {}) {
  const m = new THREE.Mesh(BOX, mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
  m.castShadow = true;
  group.add(m);
  return m;
}

function cyl(group, rTop, rBottom, h, color, x, y, z, segments = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}

export const COSMETIC_BUILDERS = {
  partyHat(g) {
    cyl(g, 0.005, 0.07, 0.17, '#FF4FA3', 0, 0.265, 0.07, 6);
    box(g, 0.13, 0.025, 0.13, '#4FE0FF', 0, 0.2, 0.07);
    box(g, 0.035, 0.035, 0.035, '#FFE14F', 0, 0.36, 0.07);
  },
  beanie(g) {
    box(g, 0.26, 0.08, 0.22, '#C0502F', 0, 0.2, 0.08);
    box(g, 0.27, 0.03, 0.23, '#E8E0D0', 0, 0.165, 0.08);
    box(g, 0.06, 0.06, 0.06, '#E8E0D0', 0, 0.26, 0.08);
  },
  cap(g) {
    box(g, 0.25, 0.06, 0.21, '#3A6FD0', 0, 0.205, 0.07);
    box(g, 0.2, 0.015, 0.11, '#3A6FD0', 0, 0.18, 0.22);
    box(g, 0.03, 0.02, 0.03, '#E8E0D0', 0, 0.24, 0.07);
  },
  bow(g) {
    box(g, 0.07, 0.05, 0.03, '#FF4FA3', 0.07, 0.2, 0.15, { z: 0.4 });
    box(g, 0.07, 0.05, 0.03, '#FF4FA3', 0.13, 0.2, 0.15, { z: -0.4 });
    box(g, 0.03, 0.03, 0.035, '#C0305F', 0.1, 0.2, 0.15);
  },
  tophat(g) {
    cyl(g, 0.13, 0.13, 0.015, '#1B1420', 0, 0.19, 0.07, 10);
    cyl(g, 0.08, 0.08, 0.16, '#1B1420', 0, 0.27, 0.07, 10);
    cyl(g, 0.082, 0.082, 0.03, '#C0502F', 0, 0.215, 0.07, 10);
  },
  crown(g) {
    box(g, 0.18, 0.04, 0.16, '#F5C542', 0, 0.2, 0.08);
    for (const [x, z] of [
      [-0.07, 0.01],
      [0, 0.01],
      [0.07, 0.01],
      [-0.07, 0.15],
      [0.07, 0.15],
    ])
      box(g, 0.035, 0.06, 0.035, '#F5C542', x, 0.245, z);
    box(g, 0.03, 0.03, 0.01, '#FF4FA3', 0, 0.205, 0.165);
  },
  nerdGlasses(g) {
    for (const x of [-0.06, 0.06]) {
      box(g, 0.075, 0.012, 0.01, '#2A2A33', x, 0.145, 0.19);
      box(g, 0.075, 0.012, 0.01, '#2A2A33', x, 0.08, 0.19);
      box(g, 0.012, 0.07, 0.01, '#2A2A33', x - 0.035, 0.112, 0.19);
      box(g, 0.012, 0.07, 0.01, '#2A2A33', x + 0.035, 0.112, 0.19);
    }
    box(g, 0.05, 0.012, 0.01, '#2A2A33', 0, 0.125, 0.19);
  },
  sunglasses(g) {
    for (const x of [-0.06, 0.06]) box(g, 0.08, 0.05, 0.012, '#141018', x, 0.115, 0.19);
    box(g, 0.24, 0.015, 0.012, '#141018', 0, 0.135, 0.19);
  },
  monocle(g) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 10), mat('#F5C542'));
    ring.position.set(0.06, 0.112, 0.19);
    g.add(ring);
    box(g, 0.006, 0.12, 0.006, '#F5C542', 0.09, 0.05, 0.19, { z: 0.3 });
  },
  bellCollar(g) {
    box(g, 0.2, 0.035, 0.12, '#D0384A', 0, -0.03, 0.03);
    box(g, 0.035, 0.035, 0.035, '#F5C542', 0, -0.065, 0.1);
  },
  scarf(g) {
    box(g, 0.22, 0.05, 0.14, '#3E9A90', 0, -0.03, 0.03);
    box(g, 0.05, 0.13, 0.03, '#3E9A90', 0.06, -0.1, 0.1, { z: 0.15 });
    box(g, 0.051, 0.02, 0.031, '#E8E0D0', 0.06, -0.08, 0.1, { z: 0.15 });
  },
  bowtie(g) {
    box(g, 0.05, 0.045, 0.02, '#D0384A', -0.035, -0.04, 0.1, { z: 0.3 });
    box(g, 0.05, 0.045, 0.02, '#D0384A', 0.035, -0.04, 0.1, { z: -0.3 });
    box(g, 0.025, 0.025, 0.025, '#8E1F2E', 0, -0.04, 0.105);
  },
  bandana(g) {
    box(g, 0.2, 0.035, 0.12, '#C0502F', 0, -0.03, 0.03);
    box(g, 0.09, 0.09, 0.015, '#C0502F', 0, -0.07, 0.085, { z: PI4 });
    box(g, 0.02, 0.02, 0.016, '#F2E6C9', 0, -0.07, 0.093);
  },
  headphones(g) {
    box(g, 0.27, 0.025, 0.05, '#2B2B33', 0, 0.2, 0.07);
    for (const side of [-1, 1]) {
      box(g, 0.04, 0.09, 0.08, '#2B2B33', side * 0.13, 0.1, 0.07);
      box(g, 0.042, 0.05, 0.05, '#FF4FA3', side * 0.135, 0.1, 0.07);
    }
  },
  wizardHat(g) {
    cyl(g, 0.15, 0.15, 0.015, '#3A2A6A', 0, 0.19, 0.07, 10);
    cyl(g, 0.005, 0.085, 0.24, '#3A2A6A', 0, 0.31, 0.06, 8);
    for (const [x, y] of [
      [0.04, 0.26],
      [-0.03, 0.33],
      [0.02, 0.38],
    ])
      box(g, 0.025, 0.025, 0.01, '#FFE14F', x, y, 0.1);
  },
  pixelShades(g) {
    box(g, 0.25, 0.02, 0.012, '#141018', 0, 0.14, 0.19);
    for (const x of [-0.06, 0.06]) {
      box(g, 0.09, 0.03, 0.012, '#141018', x, 0.115, 0.19);
      box(g, 0.02, 0.012, 0.014, '#FFFFFF', x - 0.025, 0.125, 0.191);
    }
  },
  tie(g) {
    box(g, 0.2, 0.025, 0.12, '#F4F2EE', 0, -0.03, 0.03);
    box(g, 0.035, 0.03, 0.02, '#3A6FD0', 0, -0.05, 0.1);
    box(g, 0.04, 0.12, 0.015, '#3A6FD0', 0, -0.12, 0.1);
    box(g, 0.041, 0.02, 0.016, '#F2C14E', 0, -0.11, 0.1);
  },
  cape(g) {
    box(g, 0.2, 0.03, 0.1, '#D0384A', 0, -0.02, 0.0);
    box(g, 0.24, 0.02, 0.36, '#D0384A', 0, 0.02, -0.2, { x: -0.25 });
    box(g, 0.05, 0.05, 0.02, '#F5C542', 0, -0.03, 0.06);
  },
  goldChain(g) {
    box(g, 0.2, 0.02, 0.12, '#F5C542', 0, -0.035, 0.03);
    box(g, 0.05, 0.05, 0.012, '#F5C542', 0, -0.08, 0.1);
    box(g, 0.025, 0.025, 0.014, '#C9A54A', 0, -0.08, 0.102);
  },
};

