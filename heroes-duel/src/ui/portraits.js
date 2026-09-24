// Renders a small 3/4 portrait of each creature model once and caches it as a data URL.
import * as THREE from 'three';
import { CREATURES } from '../data/haven.js';
import { buildCreatureModel } from '../scene/models.js';

const SIZE = 160;
const cache = new Map();
let renderer, scene, camera;

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x5a4a30, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
}

export function portrait(id) {
  if (cache.has(id)) return cache.get(id);
  if (!renderer) setup();
  const model = buildCreatureModel(CREATURES[id]);
  model.rotation.y = 0.55;
  model.userData.idle?.(0.6);
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const h = Math.max(size.y, size.x * 0.8, size.z * 0.8);
  const dist = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(15));
  camera.position.set(center.x + dist * 0.25, center.y + h * 0.18, center.z + dist);
  camera.lookAt(center.x, center.y + h * 0.05, center.z);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(model);
  cache.set(id, url);
  return url;
}
