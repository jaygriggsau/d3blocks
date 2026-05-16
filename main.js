import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const CUBE = 1;
const GRID_SIZE = 32;
const STORAGE_KEY = 'd3blocks.scene.v2';

const PALETTE = [
  '#ff5d5d', '#ffb05d', '#ffe65d', '#7dff5d',
  '#5dffd6', '#5ec8ff', '#7a5dff', '#ff5dd6',
  '#ffffff', '#9aa4b2', '#3a4351', '#111418',
];

// --- Shape geometries -------------------------------------------------------
// All shapes occupy a unit cell of size CUBE centered at (0.5, 0.5, 0.5)
// relative to integer cell origin (x, y, z). Shapes are designed to be
// printable (manifold, watertight).

function slopeGeometry() {
  // Triangular prism: full block at -Z side, sloping down to +Z side.
  // 6 vertices, 8 triangles (2 sides, 2 bottom, 2 back, 2 ramp).
  const g = new THREE.BufferGeometry();
  const v = [
    // bottom-back-left, bottom-back-right, bottom-front-left, bottom-front-right
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,
    // top-back-left, top-back-right
    -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
  ];
  const idx = [
    // bottom
    0, 2, 3,  0, 3, 1,
    // back (full square)
    0, 1, 5,  0, 5, 4,
    // left side (triangle)
    0, 4, 2,
    // right side (triangle)
    1, 3, 5,
    // ramp (top-back-left -> top-back-right -> front)
    4, 5, 3,  4, 3, 2,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function cornerSlopeGeometry() {
  // Tetrahedron-ish wedge: full corner at one vertex sloping to the opposite.
  // 5 verts: bottom square + apex at one back-top corner.
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,
    -0.5,  0.5, -0.5,
  ];
  const idx = [
    // bottom
    0, 2, 3,  0, 3, 1,
    // back-left wall (triangle)
    0, 4, 2,
    // back wall (triangle to apex)
    0, 1, 4,
    // sloped face (apex, br, fr, fl) split
    4, 1, 3,  4, 3, 2,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function slabGeometry() {
  // Half-height cube sitting on the bottom of the cell.
  const g = new THREE.BoxGeometry(1, 0.5, 1);
  g.translate(0, -0.25, 0);
  return g;
}

function pyramidGeometry() {
  // 4-sided pyramid, base = full cell footprint, apex centered at top.
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
     0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
     0.0,  0.5,  0.0, // apex
  ];
  const idx = [
    // base
    0, 2, 1,  0, 3, 2,
    // sides
    0, 1, 4,
    1, 2, 4,
    2, 3, 4,
    3, 0, 4,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SHAPES = {
  cube:     { label: 'Cube',     geom: new THREE.BoxGeometry(1, 1, 1),               offsetY: 0.5,  rotatable: false },
  slab:     { label: 'Slab',     geom: slabGeometry(),                               offsetY: 0.5,  rotatable: false },
  slope:    { label: 'Slope',    geom: slopeGeometry(),                              offsetY: 0.5,  rotatable: true  },
  corner:   { label: 'Corner',   geom: cornerSlopeGeometry(),                        offsetY: 0.5,  rotatable: true  },
  pyramid:  { label: 'Pyramid',  geom: pyramidGeometry(),                            offsetY: 0.5,  rotatable: false },
  cylinder: { label: 'Cylinder', geom: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),  offsetY: 0.5,  rotatable: false },
  cone:     { label: 'Cone',     geom: new THREE.ConeGeometry(0.5, 1, 32),           offsetY: 0.5,  rotatable: false },
  sphere:   { label: 'Sphere',   geom: new THREE.SphereGeometry(0.5, 24, 18),        offsetY: 0.5,  rotatable: false },
  torus:    { label: 'Torus',    geom: (() => {
                const g = new THREE.TorusGeometry(0.32, 0.14, 16, 32);
                g.rotateX(Math.PI / 2);
                return g;
              })(),                                                                  offsetY: 0.18, rotatable: false },
  dome:     { label: 'Dome',     geom: (() => {
                const g = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
                // Cap the bottom so it's watertight for printing.
                // SphereGeometry with thetaLength < PI leaves an open base; we patch with a disk.
                return makeManifoldDome(g);
              })(),                                                                  offsetY: 0,    rotatable: false },
};

function makeManifoldDome(domeGeom) {
  // Build a flat disk at y=0 to seal the open hemisphere base.
  const segs = 24;
  const disk = new THREE.CircleGeometry(0.5, segs);
  disk.rotateX(Math.PI / 2);
  // Merge by appending attributes.
  const merged = mergeGeoms([domeGeom, disk]);
  return merged;
}

function mergeGeoms(list) {
  const positions = [];
  const normals = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position.array;
    const n = ng.attributes.normal?.array;
    for (let i = 0; i < p.length; i++) positions.push(p[i]);
    if (n) for (let i = 0; i < n.length; i++) normals.push(n[i]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) {
    out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  } else {
    out.computeVertexNormals();
  }
  return out;
}

const SHAPE_KEYS = Object.keys(SHAPES);
const edgesByShape = Object.fromEntries(
  SHAPE_KEYS.map(k => [k, new THREE.EdgesGeometry(SHAPES[k].geom, 20)])
);

// --- Renderer / scene -------------------------------------------------------
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

const groundGeom = new THREE.PlaneGeometry(GRID_SIZE * CUBE, GRID_SIZE * CUBE);
const groundMat = new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.95, metalness: 0 });
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(GRID_SIZE * CUBE, GRID_SIZE, 0x3a4658, 0x232c39);
grid.position.y = 0.001;
scene.add(grid);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(GRID_SIZE * 0.5 - 0.1, GRID_SIZE * 0.5, 64),
  new THREE.MeshBasicMaterial({ color: 0x2a3645, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.002;
scene.add(ring);

// --- Block storage ----------------------------------------------------------
// Multiple shapes can stack in one cell (e.g. cube + slope above), but we
// still key by integer cell. Only one block per cell — keeps placement
// predictable and STL clean.
const blocks = new Map(); // key "x,y,z" -> mesh

function keyOf(x, y, z) { return `${x},${y},${z}`; }

function makeMesh(shape, colorHex, rotation = 0) {
  const def = SHAPES[shape];
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.05 });
  const mesh = new THREE.Mesh(def.geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (def.rotatable && rotation) mesh.rotation.y = rotation * Math.PI / 2;

  const line = new THREE.LineSegments(
    edgesByShape[shape],
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
  );
  mesh.add(line);
  return mesh;
}

function addBlock(x, y, z, colorHex, shape, rotation = 0) {
  const k = keyOf(x, y, z);
  if (blocks.has(k)) return false;
  const def = SHAPES[shape];
  if (!def) return false;
  const mesh = makeMesh(shape, colorHex, rotation);
  mesh.position.set(x + 0.5, y + def.offsetY, z + 0.5);
  mesh.userData = { x, y, z, color: colorHex, shape, rotation: def.rotatable ? rotation : 0 };
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

// --- Ghost preview ----------------------------------------------------------
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false });
let ghost = new THREE.Mesh(SHAPES.cube.geom, ghostMat);
ghost.visible = false;
scene.add(ghost);

function rebuildGhost() {
  scene.remove(ghost);
  ghost = new THREE.Mesh(SHAPES[currentShape].geom, ghostMat);
  ghost.visible = false;
  scene.add(ghost);
}

// --- Picking ---------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;
let currentColor = '#5ec8ff';
let currentShape = 'cube';
let currentRotation = 0;

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
  return raycaster.intersectObjects(pickTargets(), false)[0] || null;
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
  // For non-cube shapes the face normal may not be axis-aligned. Use the
  // dominant axis component.
  const n = hit.face.normal.clone();
  // Transform the normal to world space (accounts for shape rotation).
  n.transformDirection(hit.object.matrixWorld);
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  let dx = 0, dy = 0, dz = 0;
  if (ax >= ay && ax >= az) dx = Math.sign(n.x);
  else if (ay >= az) dy = Math.sign(n.y);
  else dz = Math.sign(n.z);
  const nx = x + dx, ny = y + dy, nz = z + dz;
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
    const def = SHAPES[currentShape];
    ghost.position.set(cell.x + 0.5, cell.y + def.offsetY, cell.z + 0.5);
    ghost.rotation.y = def.rotatable ? currentRotation * Math.PI / 2 : 0;
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
  if (moved) return;

  const hit = intersectAt(event);
  if (!hit) return;

  if (shift) {
    if (hit.object !== ground) removeBlock(hit.object);
  } else {
    const cell = snapFromHit(hit, true);
    if (cell) addBlock(cell.x, cell.y, cell.z, currentColor, currentShape, currentRotation);
  }
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointerleave', () => { ghost.visible = false; });

// --- UI: palette + shapes ---------------------------------------------------
const paletteEl = document.getElementById('palette');
const picker = document.getElementById('picker');
const shapesEl = document.getElementById('shapes');

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

function setShape(name) {
  if (!SHAPES[name]) return;
  currentShape = name;
  if (!SHAPES[name].rotatable) currentRotation = 0;
  for (const el of shapesEl.children) {
    el.classList.toggle('active', el.dataset.shape === name);
  }
  rebuildGhost();
}

for (const key of SHAPE_KEYS) {
  const b = document.createElement('div');
  b.className = 'shape';
  b.dataset.shape = key;
  b.textContent = SHAPES[key].label;
  b.addEventListener('click', () => setShape(key));
  shapesEl.appendChild(b);
}
setShape('cube');

// --- Buttons / persistence --------------------------------------------------
const blockCountEl = document.getElementById('blockCount');
function updateCount() { blockCountEl.textContent = blocks.size; }

document.getElementById('clear').addEventListener('click', () => {
  if (blocks.size === 0 || confirm('Clear all blocks?')) clearBlocks();
});

function serialize() {
  return Array.from(blocks.values()).map(m => ({
    x: m.userData.x, y: m.userData.y, z: m.userData.z,
    c: m.userData.color, s: m.userData.shape, r: m.userData.rotation || 0,
  }));
}

function deserialize(arr) {
  clearBlocks();
  for (const b of arr) {
    addBlock(b.x, b.y, b.z, b.c, b.s || 'cube', b.r || 0);
  }
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
  download(blob, 'd3blocks-scene.json');
});

document.getElementById('exportStl').addEventListener('click', () => {
  if (blocks.size === 0) { flash('Nothing to export'); return; }
  const group = new THREE.Group();
  for (const m of blocks.values()) {
    const clone = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial());
    clone.position.copy(m.position);
    clone.rotation.copy(m.rotation);
    clone.scale.copy(m.scale);
    group.add(clone);
  }
  group.updateMatrixWorld(true);
  const stl = new STLExporter().parse(group, { binary: true });
  const blob = new Blob([stl], { type: 'application/octet-stream' });
  download(blob, 'd3blocks.stl');
  flash('STL exported');
});

document.getElementById('toggleGrid').addEventListener('click', () => {
  grid.visible = !grid.visible;
});

document.getElementById('screenshot').addEventListener('click', () => {
  renderer.render(scene, camera);
  canvas.toBlob(b => download(b, 'd3blocks.png'));
});

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Toast ------------------------------------------------------------------
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

// --- Keyboard ---------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    document.getElementById('save').click();
    return;
  }
  if (e.key === 'r' || e.key === 'R') {
    if (SHAPES[currentShape].rotatable) {
      currentRotation = (currentRotation + 1) % 4;
      ghost.rotation.y = currentRotation * Math.PI / 2;
    }
    return;
  }
  if (e.key === ']') {
    const i = SHAPE_KEYS.indexOf(currentShape);
    setShape(SHAPE_KEYS[(i + 1) % SHAPE_KEYS.length]);
  } else if (e.key === '[') {
    const i = SHAPE_KEYS.indexOf(currentShape);
    setShape(SHAPE_KEYS[(i - 1 + SHAPE_KEYS.length) % SHAPE_KEYS.length]);
  }
});

// --- Seed -------------------------------------------------------------------
(function seed() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { deserialize(JSON.parse(raw)); return; } catch {}
  }
  const colors = ['#5ec8ff', '#7a5dff', '#ff5dd6', '#ffe65d'];
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      addBlock(x, 0, z, colors[(Math.abs(x) + Math.abs(z)) % colors.length], 'cube');
    }
  }
  addBlock(0, 1, 0, '#ff5d5d', 'pyramid');
  addBlock(-1, 1, 0, '#ffe65d', 'slope', 0);
  addBlock(1, 1, 0, '#ffe65d', 'slope', 2);
  addBlock(0, 1, -1, '#5dffd6', 'cylinder');
  addBlock(0, 1, 1, '#7a5dff', 'sphere');
})();

// --- Resize / loop ----------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
