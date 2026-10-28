// Dev page (/poses.html): every pose on a grid, rotating slowly, for tuning the rig.

import * as THREE from 'three';
import { CatModel } from '../scene/CatModel.js';
import { FURS } from '../scene/identity.js';
import { PixelPipeline } from '../scene/pixelPipeline.js';
import { POSE_NAMES, poseParams } from '../scene/poses.js';

const canvas = document.getElementById('c');
const labels = document.getElementById('labels');
const pipeline = new PixelPipeline(canvas);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2A2238');
scene.add(new THREE.HemisphereLight('#FFE9C7', '#3A2A40', 1.6));
const sun = new THREE.DirectionalLight('#FFF1D6', 2.2);
sun.position.set(-4, 8, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
scene.add(sun);

const only = new URLSearchParams(location.search).get('only')?.split(',');
const NAMES = only ?? POSE_NAMES;
const COLS = only ? Math.min(4, NAMES.length) : 9;
const cats = NAMES.map((name, i) => {
  const fur = FURS[i % FURS.length];
  const model = new CatModel(fur, { kitten: i % 11 === 10 });
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  model.root.position.set(col * 1.1, 0, row * 1.1);
  scene.add(model.root);
  const label = document.createElement('span');
  label.textContent = name;
  labels.append(label);
  return { name, model, label, seed: i * 0.7 };
});

const rows = Math.ceil(NAMES.length / COLS);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(COLS * 1.1 + 1, rows * 1.1 + 1), new THREE.MeshLambertMaterial({ color: '#8E613D' }));
floor.rotation.x = -Math.PI / 2;
floor.position.set((COLS - 1) * 0.55, 0, (rows - 1) * 0.55);
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const center = floor.position.clone();
const params = new URLSearchParams(location.search);
const spin = params.has('spin');

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const view = (Math.max(rows, COLS * 0.6) * 1.1 + 1.2) / Number(params.get('zoom') ?? 1);
  camera.left = (-view * w) / h / 2;
  camera.right = (view * w) / h / 2;
  camera.top = view / 2;
  camera.bottom = -view / 2;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h, Number(params.get('px') ?? 3), 99.9);
}
window.addEventListener('resize', resize);
resize();

const start = performance.now();
function loop() {
  const t = (performance.now() - start) / 1000;
  const az = Math.PI / 4 + (spin ? t * 0.3 : Number(params.get('az') ?? 0));
  camera.position.set(center.x + Math.sin(az) * 20, center.y + 12, center.z + Math.cos(az) * 20);
  camera.lookAt(center);
  for (const c of cats) {
    const phase = t * (c.name === 'run' ? 14 : 8);
    c.model.apply(poseParams(c.name, t, { seed: c.seed, phase }));
    const p = c.model.root.position.clone().project(camera);
    c.label.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
    c.label.style.top = `${((1 - p.y) / 2) * window.innerHeight + 18}px`;
  }
  pipeline.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
