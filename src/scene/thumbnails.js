// Small pixel-art pictures of every shop item, rendered once from the same 3D
// models the office uses, in the same isometric view.

import * as THREE from 'three';
import { ITEMS } from '../../shared/catalog.js';
import { buildItem } from './items.js';
import { textTexture } from './textures.js';
import { BOX } from './voxel.js';

const SIZE = 48;
const cache = new Map();

// Just enough of an Office for the builders in preview mode.
const fakeOffice = {
  screenOff: new THREE.MeshBasicMaterial({ color: '#2A3A30' }),
  desks: [],
  daylight: 0.6,
  nav: { tileOf: () => [0, 0] },
  addSpot: () => null,
  addYarn: () => {},
  sign(text, opts, w, h) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, opts), transparent: true }));
  },
};

export function renderThumbnails() {
  if (cache.size) return Object.fromEntries(cache);
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#FFE9C7', '#3A2A40', 1.6));
  const sun = new THREE.DirectionalLight('#FFF1D6', 2);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  for (const type of Object.keys(ITEMS)) {
    const ctx = buildItem(fakeOffice, { type, x: 0, z: 0, rot: 0, uid: type }, { preview: true });
    const group = ctx.group;
    scene.add(group);
    box.setFromObject(group);
    box.getCenter(center);
    box.getSize(size);
    const half = Math.max(size.x, size.z) * 0.5 + size.y * 0.28;
    Object.assign(camera, { left: -half, right: half, top: half, bottom: -half });
    camera.updateProjectionMatrix();
    camera.position.set(center.x + 10, center.y + 7, center.z + 10);
    camera.lookAt(center);
    renderer.render(scene, camera);
    cache.set(type, renderer.domElement.toDataURL());
    scene.remove(group);
    group.traverse((o) => o.geometry && o.geometry !== BOX && o.geometry.dispose());
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return Object.fromEntries(cache);
}
