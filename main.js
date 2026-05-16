import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const GRID_SIZE = 32;
const STORAGE_KEY = 'd3blocks.scene.v3';

const PALETTE = [
  '#ff5d5d', '#ffb05d', '#ffe65d', '#7dff5d',
  '#5dffd6', '#5ec8ff', '#7a5dff', '#ff5dd6',
  '#ffffff', '#9aa4b2', '#3a4351', '#111418',
];

// --- Shape geometries (unit-cell, centered at origin) -----------------------
function slopeGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,
    -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
  ];
  const idx = [
    0, 2, 3,  0, 3, 1,
    0, 1, 5,  0, 5, 4,
    0, 4, 2,
    1, 3, 5,
    4, 5, 3,  4, 3, 2,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function cornerSlopeGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,
    -0.5,  0.5, -0.5,
  ];
  const idx = [
    0, 2, 3,  0, 3, 1,
    0, 4, 2,
    0, 1, 4,
    4, 1, 3,  4, 3, 2,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function slabGeometry() {
  const g = new THREE.BoxGeometry(1, 0.5, 1);
  g.translate(0, -0.25, 0);
  return g;
}

function pyramidGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,
     0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
     0.0,  0.5,  0.0,
  ];
  const idx = [0, 2, 1,  0, 3, 2,  0, 1, 4,  1, 2, 4,  2, 3, 4,  3, 0, 4];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function mergeGeoms(list) {
  const positions = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position.array;
    for (let i = 0; i < p.length; i++) positions.push(p[i]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.computeVertexNormals();
  return out;
}

function domeGeometry() {
  // Half sphere (radius 0.5) sealed with a flat disk so the result is
  // watertight/manifold. Sits with base at cell floor (y = -0.5).
  const dome = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const disk = new THREE.CircleGeometry(0.5, 24);
  disk.rotateX(Math.PI / 2);
  // Flip the disk so its outward normal points down (away from the dome interior).
  const merged = mergeGeoms([dome, disk]);
  merged.translate(0, -0.5, 0);
  return merged;
}

const SHAPES = {
  cube:     { label: 'Cube',     geom: new THREE.BoxGeometry(1, 1, 1) },
  slab:     { label: 'Slab',     geom: slabGeometry() },
  slope:    { label: 'Slope',    geom: slopeGeometry() },
  corner:   { label: 'Corner',   geom: cornerSlopeGeometry() },
  pyramid:  { label: 'Pyramid',  geom: pyramidGeometry() },
  cylinder: { label: 'Cylinder', geom: new THREE.CylinderGeometry(0.5, 0.5, 1, 32) },
  cone:     { label: 'Cone',     geom: new THREE.ConeGeometry(0.5, 1, 32) },
  sphere:   { label: 'Sphere',   geom: new THREE.SphereGeometry(0.5, 24, 18) },
  torus:    { label: 'Torus',    geom: (() => { const g = new THREE.TorusGeometry(0.32, 0.14, 16, 32); g.rotateX(Math.PI / 2); return g; })() },
  dome:     { label: 'Dome',     geom: domeGeometry() },
};

const SHAPE_KEYS = Object.keys(SHAPES);
const edgesByShape = Object.fromEntries(SHAPE_KEYS.map(k => [k, new THREE.EdgesGeometry(SHAPES[k].geom, 20)]));

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

const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(0.85);
scene.add(transform);

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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
  new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x3a4658, 0x232c39);
grid.position.y = 0.001;
scene.add(grid);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(GRID_SIZE * 0.5 - 0.1, GRID_SIZE * 0.5, 64),
  new THREE.MeshBasicMaterial({ color: 0x2a3645, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.002;
scene.add(ring);

// --- Object store -----------------------------------------------------------
// Free-form objects: each has id, shape, color, position, rotation, scale.
const objects = new Map(); // id -> mesh
let nextId = 1;

function genId() { return `o${nextId++}`; }

function createMesh(shape, colorHex, profile) {
  let geom, edges, ownsGeom = false;
  if (shape === 'extrusion') {
    geom = buildExtrudeGeometry(profile);
    edges = new THREE.EdgesGeometry(geom, 20);
    ownsGeom = true;
  } else {
    geom = SHAPES[shape].geom;
    edges = edgesByShape[shape];
  }
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.05 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
  );
  mesh.add(line);
  mesh.userData.ownsGeom = ownsGeom;
  mesh.userData.ownsEdges = ownsGeom;
  return mesh;
}

function buildExtrudeGeometry(profile) {
  let pts2d;
  if (profile.type === 'rect') {
    const [a, b] = profile.points;
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    const z1 = Math.min(a.z, b.z), z2 = Math.max(a.z, b.z);
    pts2d = [[x1, z1], [x2, z1], [x2, z2], [x1, z2]];
  } else if (profile.type === 'circle') {
    const c = profile.points[0];
    const r = profile.radius;
    const segs = 48;
    pts2d = [];
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2;
      pts2d.push([c.x + Math.cos(a) * r, c.z + Math.sin(a) * r]);
    }
  } else {
    pts2d = profile.points.map(p => [p.x, p.z]);
  }
  // Shape lives in conventional XY plane; we map world (x, z) → shape (x, -z)
  // so a -PI/2 rotation about X lands the profile back on the world XZ ground
  // with the extrusion rising in +Y.
  let shapePts = pts2d.map(([x, z]) => new THREE.Vector2(x, -z));
  if (THREE.ShapeUtils.isClockWise(shapePts)) shapePts = shapePts.slice().reverse();
  const shape = new THREE.Shape(shapePts);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: profile.height, bevelEnabled: false, curveSegments: 32,
  });
  geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

function addObject(data) {
  // data: {id, shape, color, position:[x,y,z], rotation:[x,y,z], scale:[x,y,z]}
  const id = data.id || genId();
  if (data.id) {
    const n = parseInt(data.id.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n >= nextId) nextId = n + 1;
  }
  const mesh = createMesh(data.shape, data.color, data.profile);
  mesh.position.fromArray(data.position);
  mesh.rotation.fromArray(data.rotation || [0, 0, 0]);
  mesh.scale.fromArray(data.scale || [1, 1, 1]);
  const owns = mesh.userData.ownsGeom;
  mesh.userData = {
    id, shape: data.shape, color: data.color,
    profile: data.profile ? JSON.parse(JSON.stringify(data.profile)) : undefined,
    ownsGeom: owns, ownsEdges: owns,
  };
  scene.add(mesh);
  objects.set(id, mesh);
  updateCount();
  return mesh;
}

function deleteObject(id) {
  const mesh = objects.get(id);
  if (!mesh) return null;
  const snap = snapshotMesh(mesh);
  if (transform.object === mesh) transform.detach();
  selection.delete(id);
  scene.remove(mesh);
  mesh.material.dispose();
  if (mesh.userData.ownsGeom) mesh.geometry.dispose();
  if (mesh.userData.ownsEdges && mesh.children[0]?.geometry) mesh.children[0].geometry.dispose();
  objects.delete(id);
  updateCount();
  updateSelectionVisuals();
  return snap;
}

function snapshotMesh(mesh) {
  const s = {
    id: mesh.userData.id,
    shape: mesh.userData.shape,
    color: mesh.userData.color,
    position: mesh.position.toArray(),
    rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
    scale: mesh.scale.toArray(),
  };
  if (mesh.userData.profile) s.profile = JSON.parse(JSON.stringify(mesh.userData.profile));
  return s;
}

function clearAll() {
  for (const id of [...objects.keys()]) deleteObject(id);
}

// --- Selection --------------------------------------------------------------
const selection = new Set(); // ids

function setEmissive(mesh, on) {
  const m = mesh.material;
  if (on) {
    if (m.userData.origEmissive === undefined) {
      m.userData.origEmissive = m.emissive.getHex();
      m.userData.origEmissiveIntensity = m.emissiveIntensity;
    }
    m.emissive.set(0x5ec8ff);
    m.emissiveIntensity = 0.45;
  } else if (m.userData.origEmissive !== undefined) {
    m.emissive.setHex(m.userData.origEmissive);
    m.emissiveIntensity = m.userData.origEmissiveIntensity;
  }
}

function updateSelectionVisuals() {
  for (const [id, mesh] of objects) setEmissive(mesh, selection.has(id));
  if (selection.size === 1) {
    const id = [...selection][0];
    transform.attach(objects.get(id));
  } else {
    transform.detach();
  }
  selCountEl.textContent = selection.size;
}

function selectOnly(id) {
  selection.clear();
  if (id) selection.add(id);
  updateSelectionVisuals();
}

function toggleSelect(id) {
  if (selection.has(id)) selection.delete(id);
  else selection.add(id);
  updateSelectionVisuals();
}

// --- Undo / redo ------------------------------------------------------------
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 200;

function pushUndo(cmd) {
  undoStack.push(cmd);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return;
  applyInverse(cmd);
  redoStack.push(cmd);
}

function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return;
  applyForward(cmd);
  undoStack.push(cmd);
}

function applyForward(cmd) {
  switch (cmd.type) {
    case 'create':
      addObject(cmd.snap);
      selectOnly(cmd.snap.id);
      break;
    case 'createMany':
      for (const snap of cmd.snaps) addObject(snap);
      break;
    case 'delete':
      for (const snap of cmd.snaps) deleteObject(snap.id);
      break;
    case 'transform':
      for (const t of cmd.changes) {
        const m = objects.get(t.id);
        if (!m) continue;
        m.position.fromArray(t.to.position);
        m.rotation.fromArray(t.to.rotation);
        m.scale.fromArray(t.to.scale);
      }
      break;
  }
}

function applyInverse(cmd) {
  switch (cmd.type) {
    case 'create':
      deleteObject(cmd.snap.id);
      break;
    case 'createMany':
      for (const snap of cmd.snaps) deleteObject(snap.id);
      break;
    case 'delete':
      for (const snap of cmd.snaps) addObject(snap);
      break;
    case 'transform':
      for (const t of cmd.changes) {
        const m = objects.get(t.id);
        if (!m) continue;
        m.position.fromArray(t.from.position);
        m.rotation.fromArray(t.from.rotation);
        m.scale.fromArray(t.from.scale);
      }
      break;
  }
}

// --- Picking / pointer ------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;
let currentColor = '#5ec8ff';
let currentShape = 'cube';
let tool = 'select';
let snapEnabled = true;

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function intersectAt(event) {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const targets = [ground, ...objects.values()];
  return raycaster.intersectObjects(targets, false)[0] || null;
}

function snapToGrid(v) {
  return snapEnabled ? Math.round(v * 2) / 2 : v;
}

function placementCellFromHit(hit) {
  if (!hit) return null;
  if (hit.object === ground) {
    const x = Math.floor(hit.point.x);
    const z = Math.floor(hit.point.z);
    if (Math.abs(x) >= GRID_SIZE / 2 || Math.abs(z) >= GRID_SIZE / 2) return null;
    return [x + 0.5, 0.5, z + 0.5];
  }
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  let dx = 0, dy = 0, dz = 0;
  if (ax >= ay && ax >= az) dx = Math.sign(n.x);
  else if (ay >= az) dy = Math.sign(n.y);
  else dz = Math.sign(n.z);
  const p = hit.object.position;
  // Use the nearest grid cell to the impact point plus the face direction.
  const cx = Math.round(p.x - 0.5) + 0.5 + dx;
  const cy = Math.round(p.y - 0.5) + 0.5 + dy;
  const cz = Math.round(p.z - 0.5) + 0.5 + dz;
  if (cy < 0.5) return null;
  return [cx, cy, cz];
}

function onPointerDown(event) {
  if (transform.dragging) return;
  pointerDown = { x: event.clientX, y: event.clientY, shift: event.shiftKey, button: event.button };
}

function onPointerUp(event) {
  if (!pointerDown) return;
  const dx = event.clientX - pointerDown.x;
  const dy = event.clientY - pointerDown.y;
  const moved = Math.hypot(dx, dy) > 4;
  const shift = pointerDown.shift || event.shiftKey;
  pointerDown = null;
  if (moved) return;
  if (event.button !== 0) return;

  const hit = intersectAt(event);

  if (tool === 'sketch') {
    if (sketch.closed) return;
    const p = projectToGround(event);
    if (!p) return;
    if (sketch.tool === 'rect') {
      sketch.points.push(p);
      if (sketch.points.length === 2) finalizeSketch();
      else rebuildSketchPreview();
    } else if (sketch.tool === 'circle') {
      sketch.points.push(p);
      if (sketch.points.length === 2) finalizeSketch();
      else rebuildSketchPreview();
    } else if (sketch.tool === 'poly') {
      // Close if clicking near first point.
      if (sketch.points.length >= 2) {
        const a = sketch.points[0];
        if (Math.hypot(p.x - a.x, p.z - a.z) < 0.25) {
          finalizeSketch();
          return;
        }
      }
      sketch.points.push(p);
      rebuildSketchPreview();
    }
    return;
  }

  if (tool === 'select') {
    if (!hit || hit.object === ground) {
      if (!shift) selectOnly(null);
      return;
    }
    const id = hit.object.userData.id;
    if (shift) toggleSelect(id);
    else selectOnly(id);
  } else if (tool === 'place') {
    if (shift && hit && hit.object !== ground) {
      const snap = snapshotMesh(hit.object);
      deleteObject(snap.id);
      pushUndo({ type: 'delete', snaps: [snap] });
      return;
    }
    if (!hit) return;
    const pos = placementCellFromHit(hit);
    if (!pos) return;
    const mesh = addObject({
      shape: currentShape, color: currentColor,
      position: pos, rotation: [0, 0, 0], scale: [1, 1, 1],
    });
    pushUndo({ type: 'create', snap: snapshotMesh(mesh) });
    selectOnly(mesh.userData.id);
  }
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);

// --- Transform gizmo wiring -------------------------------------------------
let dragStartSnaps = null;

transform.addEventListener('dragging-changed', (e) => {
  controls.enabled = !e.value;
  if (e.value) {
    dragStartSnaps = transform.object ? [snapshotMesh(transform.object)] : null;
  } else if (dragStartSnaps) {
    const changes = [];
    for (const from of dragStartSnaps) {
      const mesh = objects.get(from.id);
      if (!mesh) continue;
      const to = snapshotMesh(mesh);
      if (
        from.position.some((v, i) => v !== to.position[i]) ||
        from.rotation.some((v, i) => v !== to.rotation[i]) ||
        from.scale.some((v, i) => v !== to.scale[i])
      ) {
        changes.push({ id: from.id, from, to });
      }
    }
    if (changes.length) pushUndo({ type: 'transform', changes });
    dragStartSnaps = null;
  }
});

transform.addEventListener('objectChange', () => {
  if (!snapEnabled) return;
  const m = transform.object;
  if (!m) return;
  if (transform.mode === 'translate') {
    m.position.x = snapToGrid(m.position.x);
    m.position.y = snapToGrid(m.position.y);
    m.position.z = snapToGrid(m.position.z);
  } else if (transform.mode === 'rotate') {
    const step = Math.PI / 12; // 15°
    m.rotation.x = Math.round(m.rotation.x / step) * step;
    m.rotation.y = Math.round(m.rotation.y / step) * step;
    m.rotation.z = Math.round(m.rotation.z / step) * step;
  } else if (transform.mode === 'scale') {
    const step = 0.25;
    m.scale.x = Math.max(step, Math.round(m.scale.x / step) * step);
    m.scale.y = Math.max(step, Math.round(m.scale.y / step) * step);
    m.scale.z = Math.max(step, Math.round(m.scale.z / step) * step);
  }
});

function setTransformMode(mode) {
  transform.setMode(mode);
  for (const el of document.querySelectorAll('#transformModes .tool')) {
    el.classList.toggle('active', el.dataset.mode === mode);
  }
}
setTransformMode('translate');

// --- UI ---------------------------------------------------------------------
const paletteEl = document.getElementById('palette');
const picker = document.getElementById('picker');
const shapesEl = document.getElementById('shapes');
const toolsEl = document.getElementById('tools');
const transformModesEl = document.getElementById('transformModes');
const blockCountEl = document.getElementById('blockCount');
const selCountEl = document.getElementById('selCount');
const snapEl = document.getElementById('snap');

function updateCount() { blockCountEl.textContent = objects.size; }

function setColor(hex, fromPicker = false) {
  currentColor = hex;
  for (const el of paletteEl.children) {
    el.classList.toggle('active', el.dataset.color?.toLowerCase() === hex.toLowerCase());
  }
  if (!fromPicker) picker.value = hex;
  // Apply color to selected objects.
  if (selection.size > 0) {
    const changes = [];
    for (const id of selection) {
      const m = objects.get(id);
      const from = snapshotMesh(m);
      m.material.color.set(hex);
      m.userData.color = hex;
      const to = snapshotMesh(m);
      changes.push({ id, from, to });
    }
    // Note: color changes are not on the transform undo path; keep simple for now.
  }
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
  for (const el of shapesEl.children) el.classList.toggle('active', el.dataset.shape === name);
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

function setTool(name) {
  tool = name;
  for (const el of toolsEl.children) el.classList.toggle('active', el.dataset.tool === name);
  canvas.style.cursor = (name === 'place' || name === 'sketch') ? 'crosshair' : 'default';
  if (name !== 'select') transform.detach();
  else updateSelectionVisuals();

  const sketchRow = document.getElementById('sketchRow');
  if (sketchRow) sketchRow.classList.toggle('hidden', name !== 'sketch');
  if (name !== 'sketch') {
    if (typeof resetSketch === 'function') resetSketch();
  }
}

for (const el of toolsEl.children) {
  el.addEventListener('click', () => setTool(el.dataset.tool));
}

// --- Sketch session ---------------------------------------------------------
// Active only when tool === 'sketch'. Draws on the world XZ ground plane.
const sketch = {
  tool: 'rect',        // 'rect' | 'circle' | 'poly'
  points: [],          // array of {x, z}
  hover: null,         // current cursor position on plane
  preview: null,       // THREE.Line group for the in-progress sketch
  closed: false,       // becomes true when a profile is finished
  profile: null,       // {type, points, height?, radius?} once closed
};

const sketchGroup = new THREE.Group();
scene.add(sketchGroup);

const sketchMat = new THREE.LineBasicMaterial({ color: 0x5ec8ff, linewidth: 2 });
const sketchMatGhost = new THREE.LineBasicMaterial({ color: 0x5ec8ff, transparent: true, opacity: 0.45 });

function clearSketchPreview() {
  while (sketchGroup.children.length) {
    const c = sketchGroup.children.pop();
    c.geometry?.dispose();
  }
}

function rebuildSketchPreview() {
  clearSketchPreview();
  if (sketch.points.length === 0 && !sketch.hover) return;

  if (sketch.tool === 'rect') {
    const a = sketch.points[0];
    const b = sketch.points[1] || sketch.hover;
    if (!a || !b) return;
    addRectPreview(a, b, sketch.points.length === 2);
  } else if (sketch.tool === 'circle') {
    const c = sketch.points[0];
    const edge = sketch.points[1] || sketch.hover;
    if (!c || !edge) return;
    const r = Math.hypot(edge.x - c.x, edge.z - c.z);
    addCirclePreview(c, r, sketch.points.length === 2);
  } else if (sketch.tool === 'poly') {
    addPolyPreview(sketch.points, sketch.hover, sketch.closed);
  }

  // dots at vertices
  for (const p of sketch.points) addDot(p);
}

function addRectPreview(a, b, solid) {
  const x1 = a.x, x2 = b.x, z1 = a.z, z2 = b.z;
  const pts = [
    new THREE.Vector3(x1, 0.01, z1),
    new THREE.Vector3(x2, 0.01, z1),
    new THREE.Vector3(x2, 0.01, z2),
    new THREE.Vector3(x1, 0.01, z2),
    new THREE.Vector3(x1, 0.01, z1),
  ];
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  sketchGroup.add(new THREE.Line(g, solid ? sketchMat : sketchMatGhost));
}

function addCirclePreview(c, r, solid) {
  const segs = 64;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = i / segs * Math.PI * 2;
    pts.push(new THREE.Vector3(c.x + Math.cos(a) * r, 0.01, c.z + Math.sin(a) * r));
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  sketchGroup.add(new THREE.Line(g, solid ? sketchMat : sketchMatGhost));
}

function addPolyPreview(points, hover, closed) {
  if (points.length === 0) return;
  const v3 = points.map(p => new THREE.Vector3(p.x, 0.01, p.z));
  if (!closed && hover) v3.push(new THREE.Vector3(hover.x, 0.01, hover.z));
  if (closed) v3.push(v3[0].clone());
  const g = new THREE.BufferGeometry().setFromPoints(v3);
  sketchGroup.add(new THREE.Line(g, closed ? sketchMat : sketchMatGhost));
}

function addDot(p) {
  const g = new THREE.SphereGeometry(0.06, 8, 8);
  const m = new THREE.MeshBasicMaterial({ color: 0x5ec8ff });
  const dot = new THREE.Mesh(g, m);
  dot.position.set(p.x, 0.02, p.z);
  sketchGroup.add(dot);
}

function snapPoint(p) {
  if (!snapEnabled) return p;
  return { x: Math.round(p.x * 2) / 2, z: Math.round(p.z * 2) / 2 };
}

function projectToGround(event) {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(ground, false)[0];
  if (!hit) return null;
  return snapPoint({ x: hit.point.x, z: hit.point.z });
}

function resetSketch(keepTool = true) {
  sketch.points = [];
  sketch.hover = null;
  sketch.closed = false;
  sketch.profile = null;
  if (!keepTool) sketch.tool = 'rect';
  clearSketchPreview();
  document.getElementById('extrudeBtn').disabled = true;
}

function finalizeSketch() {
  if (sketch.tool === 'rect' && sketch.points.length === 2) {
    sketch.closed = true;
    sketch.profile = { type: 'rect', points: sketch.points.slice() };
  } else if (sketch.tool === 'circle' && sketch.points.length === 2) {
    const c = sketch.points[0];
    const e = sketch.points[1];
    const r = Math.hypot(e.x - c.x, e.z - c.z);
    if (r < 0.05) return false;
    sketch.closed = true;
    sketch.profile = { type: 'circle', points: [c], radius: r };
  } else if (sketch.tool === 'poly' && sketch.points.length >= 3) {
    sketch.closed = true;
    sketch.profile = { type: 'poly', points: sketch.points.slice() };
  } else {
    return false;
  }
  document.getElementById('extrudeBtn').disabled = false;
  rebuildSketchPreview();
  return true;
}

function extrudeFromSketch() {
  if (!sketch.profile) return;
  const height = Math.max(0.05, parseFloat(document.getElementById('extrudeHeight').value) || 1);
  const profile = { ...sketch.profile, height };
  // Compute centroid so the mesh's origin is its centroid (good for transforms).
  let cx = 0, cz = 0, n = 0;
  if (profile.type === 'circle') {
    cx = profile.points[0].x; cz = profile.points[0].z; n = 1;
  } else {
    for (const p of profile.points) { cx += p.x; cz += p.z; n++; }
    cx /= n; cz /= n;
  }
  // Re-anchor profile points relative to centroid, place mesh at (cx, 0, cz).
  const localProfile = { ...profile };
  if (localProfile.type === 'circle') {
    localProfile.points = [{ x: 0, z: 0 }];
  } else {
    localProfile.points = profile.points.map(p => ({ x: p.x - cx, z: p.z - cz }));
  }

  const mesh = addObject({
    shape: 'extrusion', color: currentColor, profile: localProfile,
    position: [cx, 0, cz], rotation: [0, 0, 0], scale: [1, 1, 1],
  });
  pushUndo({ type: 'create', snap: snapshotMesh(mesh) });
  selectOnly(mesh.userData.id);
  resetSketch();
  setTool('select');
}

function setSketchTool(name) {
  sketch.tool = name;
  resetSketch();
  for (const el of document.querySelectorAll('#sketchTools .tool')) {
    el.classList.toggle('active', el.dataset.stool === name);
  }
}

for (const el of document.querySelectorAll('#sketchTools .tool')) {
  el.addEventListener('click', () => setSketchTool(el.dataset.stool));
}
setSketchTool('rect');

document.getElementById('extrudeBtn').addEventListener('click', extrudeFromSketch);
document.getElementById('finishPoly').addEventListener('click', () => {
  if (sketch.tool === 'poly') finalizeSketch();
});
document.getElementById('cancelSketch').addEventListener('click', () => {
  resetSketch();
  setTool('select');
});

canvas.addEventListener('pointermove', (event) => {
  if (tool !== 'sketch' || sketch.closed) return;
  sketch.hover = projectToGround(event);
  rebuildSketchPreview();
});

canvas.addEventListener('dblclick', () => {
  if (tool === 'sketch' && sketch.tool === 'poly') finalizeSketch();
});

setTool('select');

for (const el of transformModesEl.children) {
  el.addEventListener('click', () => setTransformMode(el.dataset.mode));
}

snapEl.addEventListener('change', () => { snapEnabled = snapEl.checked; });

// --- Buttons ----------------------------------------------------------------
document.getElementById('clear').addEventListener('click', () => {
  if (objects.size === 0) return;
  if (!confirm('Clear all objects?')) return;
  const snaps = [...objects.values()].map(snapshotMesh);
  clearAll();
  pushUndo({ type: 'delete', snaps });
});

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
  if (objects.size === 0) { flash('Nothing to export'); return; }
  const group = new THREE.Group();
  for (const m of objects.values()) {
    const clone = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial());
    clone.position.copy(m.position);
    clone.rotation.copy(m.rotation);
    clone.scale.copy(m.scale);
    group.add(clone);
  }
  group.updateMatrixWorld(true);
  const stl = new STLExporter().parse(group, { binary: true });
  download(new Blob([stl], { type: 'application/octet-stream' }), 'd3blocks.stl');
  flash('STL exported');
});

document.getElementById('toggleGrid').addEventListener('click', () => {
  grid.visible = !grid.visible;
});

document.getElementById('screenshot').addEventListener('click', () => {
  renderer.render(scene, camera);
  canvas.toBlob(b => download(b, 'd3blocks.png'));
});

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('duplicate').addEventListener('click', duplicateSelection);
document.getElementById('deleteBtn').addEventListener('click', deleteSelection);

function duplicateSelection() {
  if (selection.size === 0) return;
  const newIds = [];
  const snaps = [];
  for (const id of selection) {
    const m = objects.get(id);
    const s = snapshotMesh(m);
    s.id = genId();
    s.position[0] += 1;
    const mesh = addObject(s);
    newIds.push(mesh.userData.id);
    snaps.push(snapshotMesh(mesh));
  }
  selection.clear();
  for (const id of newIds) selection.add(id);
  updateSelectionVisuals();
  if (snaps.length === 1) pushUndo({ type: 'create', snap: snaps[0] });
  else pushUndo({ type: 'createMany', snaps });
}

function deleteSelection() {
  if (selection.size === 0) return;
  const snaps = [];
  for (const id of [...selection]) {
    const m = objects.get(id);
    if (m) snaps.push(snapshotMesh(m));
    deleteObject(id);
  }
  if (snaps.length) pushUndo({ type: 'delete', snaps });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Persistence ------------------------------------------------------------
function serialize() {
  return [...objects.values()].map(m => snapshotMesh(m));
}

function deserialize(arr) {
  clearAll();
  // Detect v2 (uses x/y/z/c/s fields)
  if (arr.length && arr[0].x !== undefined && arr[0].position === undefined) {
    for (const o of arr) {
      addObject({
        shape: o.s || 'cube',
        color: o.c,
        position: [o.x + 0.5, o.y + 0.5, o.z + 0.5],
        rotation: [0, (o.r || 0) * Math.PI / 2, 0],
        scale: [1, 1, 1],
      });
    }
  } else {
    for (const o of arr) addObject(o);
  }
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
  if (e.target instanceof HTMLInputElement) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); document.getElementById('save').click(); return; }
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
  if (mod && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selection.clear();
    for (const id of objects.keys()) selection.add(id);
    updateSelectionVisuals();
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return; }
  if (e.key === 'Escape') {
    if (tool === 'sketch') { resetSketch(); setTool('select'); return; }
    selectOnly(null);
    return;
  }
  if (e.key === 'Enter') {
    if (tool === 'sketch' && sketch.tool === 'poly') finalizeSketch();
    return;
  }
  if (e.key === 'v' || e.key === 'V') { setTool('select'); return; }
  if (e.key === 'b' || e.key === 'B') { setTool('place'); return; }
  if (e.key === 'k' || e.key === 'K') { setTool('sketch'); return; }
  if (e.key === 'w' || e.key === 'W') { setTransformMode('translate'); return; }
  if (e.key === 'e' || e.key === 'E') { setTransformMode('rotate'); return; }
  if (e.key === 'r' || e.key === 'R') { setTransformMode('scale'); return; }
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
  // Migrate from v2 if present
  const v2 = localStorage.getItem('d3blocks.scene.v2');
  if (v2) {
    try { deserialize(JSON.parse(v2)); return; } catch {}
  }
  const colors = ['#5ec8ff', '#7a5dff', '#ff5dd6', '#ffe65d'];
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      addObject({
        shape: 'cube', color: colors[(Math.abs(x) + Math.abs(z)) % colors.length],
        position: [x + 0.5, 0.5, z + 0.5], rotation: [0, 0, 0], scale: [1, 1, 1],
      });
    }
  }
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
