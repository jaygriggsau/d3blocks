import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CUBE = 1;
const GRID_SIZE = 32;
const STORAGE_KEY = 'd3blocks.scene.v1';

const PALETTE = [
  '#ff5d5d', '#ffb05d', '#ffe65d', '#7dff5d',
  '#5dffd6', '#5ec8ff', '#7a5dff', '#ff5dd6',
  '#ffffff', '#9aa4b2', '#3a4351', '#111418',
];

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0f15');
scene.fog = new THREE.Fog('#0b0f15', 40, 120);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(18, 16, 22);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 100;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

// Lighting
scene.add(new THREE.HemisphereLight('#cfe7ff', '#1a1f29', 0.55));
const sun = new THREE.DirectionalLight('#ffffff', 1.1);
sun.position.set(20, 30, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
scene.add(sun);

// Ground plane (invisible collider) + visible floor
const groundGeom = new THREE.PlaneGeometry(GRID_SIZE * CUBE, GRID_SIZE * CUBE);
const groundMat = new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.95, metalness: 0 });
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Grid helper
const grid = new THREE.GridHelper(GRID_SIZE * CUBE, GRID_SIZE, 0x3a4658, 0x232c39);
grid.position.y = 0.001;
scene.add(grid);

// Axes ring (subtle)
const ringGeom = new THREE.RingGeometry(GRID_SIZE * 0.5 - 0.1, GRID_SIZE * 0.5, 64);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x2a3645, side: THREE.DoubleSide });
const ring = new THREE.Mesh(ringGeom, ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.002;
scene.add(ring);

// Block storage: key "x,y,z" -> mesh
const blocks = new Map();
const blockGeom = new THREE.BoxGeometry(CUBE, CUBE, CUBE);

// Edges for placed blocks (one material reused via cloned line segments)
const edgesGeom = new THREE.EdgesGeometry(blockGeom);

function keyOf(x, y, z) { return `${x},${y},${z}`; }

function addBlock(x, y, z, colorHex) {
  const k = keyOf(x, y, z);
  if (blocks.has(k)) return false;
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.05 });
  const mesh = new THREE.Mesh(blockGeom, mat);
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { x, y, z, color: colorHex };

  const line = new THREE.LineSegments(edgesGeom, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
  mesh.add(line);

  scene.add(mesh);
  blocks.set(k, mesh);
  updateCount();
  return true;
}

function removeBlock(mesh) {
  const { x, y, z } = mesh.userData;
  scene.remove(mesh);
  mesh.material.dispose();
  blocks.delete(keyOf(x, y, z));
  updateCount();
}

function clearBlocks() {
  for (const mesh of blocks.values()) {
    scene.remove(mesh);
    mesh.material.dispose();
  }
  blocks.clear();
  updateCount();
}

// Ghost preview block
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false });
const ghost = new THREE.Mesh(blockGeom, ghostMat);
ghost.visible = false;
scene.add(ghost);

// Picking
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;
let currentColor = '#5ec8ff';

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickTargets() {
  return [ground, ...blocks.values()];
}

function intersectAt(event) {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickTargets(), false);
  return hits[0] || null;
}

function snapFromHit(hit, forPlacement) {
  if (!hit) return null;
  if (hit.object === ground) {
    const p = hit.point;
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    if (Math.abs(x) >= GRID_SIZE / 2 || Math.abs(z) >= GRID_SIZE / 2) return null;
    return { x, y: 0, z };
  }
  const { x, y, z } = hit.object.userData;
  if (!forPlacement) return { x, y, z };
  const n = hit.face.normal;
  const nx = x + Math.round(n.x);
  const ny = y + Math.round(n.y);
  const nz = z + Math.round(n.z);
  if (ny < 0) return null;
  if (Math.abs(nx) >= GRID_SIZE / 2 || Math.abs(nz) >= GRID_SIZE / 2) return null;
  if (ny >= GRID_SIZE) return null;
  return { x: nx, y: ny, z: nz };
}

function onPointerMove(event) {
  const hit = intersectAt(event);
  const cell = snapFromHit(hit, true);
  if (cell && !blocks.has(keyOf(cell.x, cell.y, cell.z))) {
    ghost.visible = true;
    ghost.material.color.set(currentColor);
    ghost.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
  } else {
    ghost.visible = false;
  }
}

function onPointerDown(event) {
  pointerDown = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
}

function onPointerUp(event) {
  if (!pointerDown) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  const moved = Math.hypot(dx, dy) > 4;
  const shift = pointerDown.shift || event.shiftKey;
  pointerDown = null;
  if (moved) return; // it was a drag (orbit)

  const hit = intersectAt(event);
  if (!hit) return;

  if (shift) {
    if (hit.object !== ground) removeBlock(hit.object);
  } else {
    const cell = snapFromHit(hit, true);
    if (cell) addBlock(cell.x, cell.y, cell.z, currentColor);
  }
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointerleave', () => { ghost.visible = false; });

// Palette UI
const paletteEl = document.getElementById('palette');
const picker = document.getElementById('picker');

function setColor(hex, fromPicker = false) {
  currentColor = hex;
  for (const el of paletteEl.children) {
    el.classList.toggle('active', el.dataset.color?.toLowerCase() === hex.toLowerCase());
  }
  if (!fromPicker) picker.value = hex;
}

for (const c of PALETTE) {
  const s = document.createElement('div');
  s.className = 'swatch';
  s.style.background = c;
  s.dataset.color = c;
  s.addEventListener('click', () => setColor(c));
  paletteEl.appendChild(s);
}
picker.addEventListener('input', () => setColor(picker.value, true));
setColor(currentColor);

// Buttons
const blockCountEl = document.getElementById('blockCount');
function updateCount() { blockCountEl.textContent = blocks.size; }

document.getElementById('clear').addEventListener('click', () => {
  if (blocks.size === 0 || confirm('Clear all blocks?')) clearBlocks();
});

function serialize() {
  return Array.from(blocks.values()).map(m => ({
    x: m.userData.x, y: m.userData.y, z: m.userData.z, c: m.userData.color,
  }));
}

function deserialize(arr) {
  clearBlocks();
  for (const b of arr) addBlock(b.x, b.y, b.z, b.c);
}

document.getElementById('save').addEventListener('click', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
  flash('Saved');
});

document.getElementById('load').addEventListener('click', () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { flash('Nothing saved'); return; }
  try { deserialize(JSON.parse(raw)); flash('Loaded'); }
  catch { flash('Load failed'); }
});

document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'd3blocks-scene.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('toggleGrid').addEventListener('click', () => {
  grid.visible = !grid.visible;
});

document.getElementById('screenshot').addEventListener('click', () => {
  renderer.render(scene, camera);
  canvas.toBlob(b => {
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'd3blocks.png';
    a.click();
    URL.revokeObjectURL(url);
  });
});

// Tiny ephemeral toast
let toastTimer = null;
function flash(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    Object.assign(el.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(17,22,30,0.92)', color: '#e6edf3', padding: '8px 14px',
      borderRadius: '8px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.08)',
      pointerEvents: 'none', zIndex: 20, transition: 'opacity 0.2s', opacity: '0',
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1400);
}

// Keyboard: Esc deselects ghost; Ctrl+S save
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    document.getElementById('save').click();
  }
});

// Seed scene with a small starter pattern so first-time visitors see something
(function seed() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { deserialize(JSON.parse(raw)); return; } catch {}
  }
  const colors = ['#5ec8ff', '#7a5dff', '#ff5dd6', '#ffe65d'];
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      addBlock(x, 0, z, colors[(Math.abs(x) + Math.abs(z)) % colors.length]);
    }
  }
  addBlock(0, 1, 0, '#ff5d5d');
})();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// Loop
function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
