import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { R, R0, CITIES, LANDMARKS, latLonToVec, vecToLatLon, isLand, randomLand, randomCoastalOcean, offsetPoint, surfDist, tangentize } from './geo.js';

// ---------- Geometrías (huella radio ~1, base en y=0) ----------
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };

function geoTree() {
  return mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6), 0, 0.4, 0), 0x6b4a2b),
    colored(at(new THREE.ConeGeometry(0.95, 1.6, 7), 0, 1.5, 0), 0x2f8a3a),
    colored(at(new THREE.ConeGeometry(0.7, 1.2, 7), 0, 2.2, 0), 0x3aa046),
  ]);
}
function geoPalm() {
  return mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.1, 0.16, 2.2, 5), 0, 1.1, 0), 0x8a6a3b),
    colored(at(new THREE.SphereGeometry(0.8, 7, 4), 0, 2.3, 0).scale(1, 0.45, 1), 0x4cae3c),
  ]);
}
function geoHouse() {
  const roof = new THREE.ConeGeometry(1.05, 0.7, 4); roof.rotateY(Math.PI / 4);
  return mergeGeometries([
    colored(at(new THREE.BoxGeometry(1.3, 0.9, 1.3), 0, 0.45, 0), 0xffffff),
    colored(at(roof, 0, 1.25, 0), 0xb5523b),
  ]);
}
function geoBuilding() {
  return mergeGeometries([
    colored(at(new THREE.BoxGeometry(1.35, 2.6, 1.35), 0, 1.3, 0), 0xffffff),
    colored(at(new THREE.BoxGeometry(1.0, 0.3, 1.0), 0, 2.75, 0), 0x666b73),
  ]);
}
function geoTower() {
  return mergeGeometries([
    colored(at(new THREE.BoxGeometry(1.3, 3.4, 1.3), 0, 1.7, 0), 0xffffff),
    colored(at(new THREE.BoxGeometry(0.9, 0.9, 0.9), 0, 3.85, 0), 0xffffff),
    colored(at(new THREE.CylinderGeometry(0.04, 0.06, 1.0, 4), 0, 4.8, 0), 0xdddddd),
  ]);
}
function geoCar() {
  return mergeGeometries([
    colored(at(new THREE.BoxGeometry(0.9, 0.45, 1.8), 0, 0.35, 0), 0xffffff),
    colored(at(new THREE.BoxGeometry(0.8, 0.4, 0.9), 0, 0.75, -0.1), 0x9fd3ff),
  ]);
}
function geoBoat() {
  return mergeGeometries([
    colored(at(new THREE.BoxGeometry(0.8, 0.4, 1.9), 0, 0.15, 0), 0xffffff),
    colored(at(new THREE.BoxGeometry(0.6, 0.5, 0.7), 0, 0.6, -0.3), 0xe8e8e8),
  ]);
}
function geoGold() {
  // gota de agua
  return mergeGeometries([colored(at(new THREE.SphereGeometry(0.6, 12, 10), 0, 0.9, 0), 0x4fc3f7), colored(at(new THREE.ConeGeometry(0.42, 0.9, 12), 0, 1.75, 0), 0x4fc3f7)]);
}
function geoBomb() {
  // chispa / brasa
  return mergeGeometries([
    colored(at(new THREE.ConeGeometry(0.7, 1.8, 7), 0, 0.9, 0), 0xff5a1a),
    colored(at(new THREE.ConeGeometry(0.4, 1.2, 7), 0, 0.75, 0.15), 0xffd23a),
    colored(at(new THREE.DodecahedronGeometry(0.45, 0), 0, 0.3, 0), 0x3b2a20),
  ]);
}
function geoDebris() {
  return colored(at(new THREE.IcosahedronGeometry(0.7, 0), 0, 0.6, 0), 0xffffff);
}

// ---- cositas chiquitas (adentro de la casa y en la calle) ----
const legs = (w, d, h, c) => [[-w, -d], [w, -d], [-w, d], [w, d]].map(([x, z]) => colored(at(new THREE.BoxGeometry(0.12, h, 0.12), x, h / 2, z), c));
function geoCup() { return mergeGeometries([colored(at(new THREE.CylinderGeometry(0.8, 0.65, 1.4, 10), 0, 0.7, 0), 0xffffff), colored(at(new THREE.TorusGeometry(0.35, 0.1, 5, 10), 0.85, 0.75, 0), 0xffffff)]); }
function geoBook() { return mergeGeometries([colored(at(new THREE.BoxGeometry(1.3, 0.45, 1.8), 0, 0.22, 0), 0xffffff), colored(at(new THREE.BoxGeometry(1.2, 0.36, 1.82), 0.06, 0.22, 0), 0xf5f0e0)]); }
function geoChair() { return mergeGeometries([colored(at(new THREE.BoxGeometry(1.2, 0.18, 1.2), 0, 0.75, 0), 0xffffff), colored(at(new THREE.BoxGeometry(1.2, 1.1, 0.16), 0, 1.35, -0.52), 0xffffff), ...legs(0.5, 0.5, 0.7, 0x5d4037)]); }
function geoLamp() { return mergeGeometries([colored(at(new THREE.CylinderGeometry(0.5, 0.6, 0.15, 10), 0, 0.07, 0), 0x444444), colored(at(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), 0, 1.0, 0), 0x888888), colored(at(new THREE.CylinderGeometry(0.4, 0.8, 0.7, 10, 1, true), 0, 1.9, 0), 0xfff1b8)]); }
function geoTable() { return mergeGeometries([colored(at(new THREE.BoxGeometry(1.9, 0.14, 1.3), 0, 0.85, 0), 0xffffff), ...legs(0.8, 0.5, 0.8, 0x6d4c41)]); }
function geoSofa() { return mergeGeometries([colored(at(new THREE.BoxGeometry(1.9, 0.55, 1.0), 0, 0.35, 0), 0xffffff), colored(at(new THREE.BoxGeometry(1.9, 0.7, 0.3), 0, 0.85, -0.35), 0xffffff), colored(at(new THREE.BoxGeometry(0.25, 0.4, 1.0), -0.85, 0.8, 0), 0xffffff), colored(at(new THREE.BoxGeometry(0.25, 0.4, 1.0), 0.85, 0.8, 0), 0xffffff)]); }
function geoBed() { return mergeGeometries([colored(at(new THREE.BoxGeometry(1.3, 0.5, 1.9), 0, 0.3, 0), 0xffffff), colored(at(new THREE.BoxGeometry(1.0, 0.18, 0.4), 0, 0.62, -0.65), 0xfafafa), colored(at(new THREE.BoxGeometry(1.3, 0.8, 0.12), 0, 0.5, -0.95), 0x6d4c41)]); }
function geoWall() { return mergeGeometries([colored(at(new THREE.BoxGeometry(2.05, 1.7, 0.3), 0, 0.85, 0), 0xf3e5d0), colored(at(new THREE.BoxGeometry(2.1, 0.12, 0.38), 0, 1.72, 0), 0xb08968)]); }
function geoPerson() { return mergeGeometries([colored(at(new THREE.CylinderGeometry(0.45, 0.5, 1.4, 8), 0, 0.7, 0), 0xffffff), colored(at(new THREE.SphereGeometry(0.42, 8, 6), 0, 1.75, 0), 0xf1c27d)]); }
function geoCone() { return mergeGeometries([colored(at(new THREE.ConeGeometry(0.75, 1.9, 8), 0, 0.95, 0), 0xff7a1a), colored(at(new THREE.CylinderGeometry(0.47, 0.55, 0.3, 8), 0, 0.85, 0), 0xffffff), colored(at(new THREE.BoxGeometry(1.5, 0.12, 1.5), 0, 0.06, 0), 0xff7a1a)]); }
function geoBin() { return mergeGeometries([colored(at(new THREE.CylinderGeometry(0.75, 0.62, 1.6, 10), 0, 0.8, 0), 0xffffff), colored(at(new THREE.CylinderGeometry(0.82, 0.82, 0.15, 10), 0, 1.65, 0), 0x333333)]); }
function geoHydrant() { return mergeGeometries([colored(at(new THREE.CylinderGeometry(0.45, 0.55, 1.4, 8), 0, 0.7, 0), 0xe53935), colored(at(new THREE.SphereGeometry(0.45, 8, 6), 0, 1.45, 0), 0xe53935), colored(at(new THREE.CylinderGeometry(0.18, 0.18, 1.3, 6).rotateZ(Math.PI / 2), 0, 0.95, 0), 0xb71c1c)]); }
function geoBike() {
  const w1 = new THREE.TorusGeometry(0.5, 0.08, 5, 12); const w2 = w1.clone();
  return mergeGeometries([colored(at(w1, 0, 0.55, -0.75).rotateY(Math.PI / 2), 0x222222), colored(at(w2, 0, 0.55, 0.75).rotateY(Math.PI / 2), 0x222222), colored(at(new THREE.BoxGeometry(0.1, 0.1, 1.5), 0, 0.95, 0), 0xffffff), colored(at(new THREE.BoxGeometry(0.1, 0.6, 0.1), 0, 1.2, 0.6), 0xffffff)]);
}
function geoBench() { return mergeGeometries([colored(at(new THREE.BoxGeometry(2.0, 0.12, 0.6), 0, 0.55, 0), 0xa1887f), colored(at(new THREE.BoxGeometry(2.0, 0.5, 0.1), 0, 0.95, -0.28), 0xa1887f), ...legs(0.85, 0.22, 0.5, 0x37474f)]); }
function geoDog() { return mergeGeometries([colored(at(new THREE.BoxGeometry(0.6, 0.55, 1.3), 0, 0.65, 0), 0xffffff), colored(at(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0, 1.0, 0.75), 0xffffff), ...legs(0.2, 0.45, 0.4, 0x5d4037)]); }

function geoLandmark(shape, hex) {
  const c = new THREE.Color(hex);
  const dark = c.clone().multiplyScalar(0.7).getHex();
  const parts = [];
  switch (shape) {
    case 'spire':
      parts.push(colored(at(new THREE.CylinderGeometry(0.1, 1.0, 2.2, 4), 0, 1.1, 0), hex));
      parts.push(colored(at(new THREE.CylinderGeometry(0.02, 0.35, 3.2, 4), 0, 3.8, 0), hex));
      parts.push(colored(at(new THREE.BoxGeometry(0.9, 0.12, 0.9), 0, 2.2, 0), dark));
      break;
    case 'pyramid': {
      const p1 = new THREE.ConeGeometry(1.0, 1.3, 4); p1.rotateY(Math.PI / 4);
      const p2 = new THREE.ConeGeometry(0.55, 0.75, 4); p2.rotateY(Math.PI / 4);
      parts.push(colored(at(p1, 0, 0.65, 0), hex), colored(at(p2, 0.75, 0.37, 0.6), dark));
      break;
    }
    case 'statue':
      parts.push(colored(at(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0, 0.4, 0), 0x9a9a9a));
      parts.push(colored(at(new THREE.CylinderGeometry(0.3, 0.42, 2.2, 8), 0, 1.9, 0), hex));
      parts.push(colored(at(new THREE.SphereGeometry(0.28, 8, 6), 0, 3.25, 0), hex));
      parts.push(colored(at(new THREE.BoxGeometry(2.0, 0.22, 0.25), 0, 2.6, 0), hex));
      break;
    case 'tower':
      parts.push(colored(at(new THREE.CylinderGeometry(0.35, 0.6, 4.6, 8), 0, 2.3, 0), hex));
      parts.push(colored(at(new THREE.SphereGeometry(0.55, 10, 8), 0, 4.4, 0), dark));
      parts.push(colored(at(new THREE.CylinderGeometry(0.02, 0.1, 1.4, 4), 0, 5.6, 0), hex));
      break;
    case 'mountain':
      parts.push(colored(at(new THREE.ConeGeometry(1.0, 1.6, 9), 0, 0.8, 0), hex));
      parts.push(colored(at(new THREE.ConeGeometry(0.42, 0.68, 9), 0, 1.27, 0), 0xffffff));
      break;
    case 'dome':
      parts.push(colored(at(new THREE.BoxGeometry(1.6, 0.8, 1.6), 0, 0.4, 0), hex));
      parts.push(colored(at(new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.8, 0), hex));
      for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]])
        parts.push(colored(at(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), x, 0.8, z), dark));
      break;
    case 'temple':
      parts.push(colored(at(new THREE.CylinderGeometry(1.0, 1.0, 1.1, 18, 1, true), 0, 0.55, 0), hex));
      parts.push(colored(at(new THREE.CylinderGeometry(0.7, 0.7, 0.2, 18), 0, 0.1, 0), dark));
      break;
    case 'wall':
      for (let i = -3; i <= 3; i++) {
        parts.push(colored(at(new THREE.BoxGeometry(0.4, 0.5, 0.32), i * 0.32, 0.25 + Math.sin(i) * 0.08, Math.sin(i * 0.9) * 0.4), hex));
        parts.push(colored(at(new THREE.BoxGeometry(0.22, 0.75, 0.22), i * 0.32, 0.37, Math.sin(i * 0.9) * 0.4), dark));
      }
      break;
    case 'bridge':
      parts.push(colored(at(new THREE.BoxGeometry(0.25, 0.12, 2.0), 0, 0.5, 0), hex));
      parts.push(colored(at(new THREE.BoxGeometry(0.3, 1.8, 0.18), 0, 0.9, -0.55), hex));
      parts.push(colored(at(new THREE.BoxGeometry(0.3, 1.8, 0.18), 0, 0.9, 0.55), hex));
      break;
  }
  return mergeGeometries(parts);
}

export const MOBILE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const CAPK = MOBILE ? 0.6 : 1;

// ---------- Tipos ----------
// s = radio de huella, cap = capacidad máxima, colors = paleta de tinte
export const KINDS = {
  cup: { s: 0.045, g: 6, geo: geoCup, cap: 900, colors: [0xffffff, 0xff8a80, 0x80d8ff, 0xffe57f], indoor: true },
  book: { s: 0.06, g: 6, geo: geoBook, cap: 900, colors: [0xc62828, 0x1565c0, 0x2e7d32, 0x6a1b9a, 0xef6c00], indoor: true },
  lamp: { s: 0.09, g: 6, geo: geoLamp, cap: 500, colors: [0xffffff], indoor: true },
  chair: { s: 0.11, g: 6, geo: geoChair, cap: 1100, colors: [0x8d6e63, 0xa1887f, 0x6d4c41, 0xffffff], indoor: true },
  table: { s: 0.17, g: 6, geo: geoTable, cap: 600, colors: [0x8d6e63, 0xbcaaa4, 0x795548], indoor: true },
  sofa: { s: 0.23, g: 6, geo: geoSofa, cap: 450, colors: [0x5c6bc0, 0xef5350, 0x26a69a, 0x8d6e63], indoor: true },
  bed: { s: 0.27, g: 6, geo: geoBed, cap: 350, colors: [0x90caf9, 0xf48fb1, 0xa5d6a7, 0xfff59d], indoor: true },
  wall: { s: 0.27, g: 5, geo: geoWall, cap: 1600, colors: [0xffffff, 0xfff3e0, 0xe3f2fd], indoor: true },
  person: { s: 0.07, g: 6, geo: geoPerson, cap: 3600, colors: [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa, 0xfb8c00, 0xeceff1, 0x212121] },
  cone: { s: 0.055, g: 6, geo: geoCone, cap: 1300, colors: [0xffffff] },
  bin: { s: 0.09, g: 6, geo: geoBin, cap: 1300, colors: [0x2e7d32, 0x1565c0, 0x616161] },
  hydrant: { s: 0.065, g: 6, geo: geoHydrant, cap: 900, colors: [0xffffff, 0xfff176] },
  bike: { s: 0.13, g: 6, geo: geoBike, cap: 1100, colors: [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835] },
  bench: { s: 0.17, g: 6, geo: geoBench, cap: 1000, colors: [0xffffff] },
  dog: { s: 0.075, g: 6, geo: geoDog, cap: 900, colors: [0xd7a86e, 0x3e2723, 0xffffff, 0x8d6e63] },
  tree: { s: 0.38, geo: geoTree, cap: 13000, colors: [0xffffff, 0xd8ffd8, 0xe8f5c8] },
  palm: { s: 0.4, geo: geoPalm, cap: 1300, colors: [0xffffff] },
  car: { s: 0.27, geo: geoCar, cap: 3800, colors: [0xe53935, 0x1e88e5, 0xfdd835, 0xffffff, 0x43a047, 0x212121, 0xfb8c00] },
  house: { s: 0.62, geo: geoHouse, cap: 6000, colors: [0xfff3e0, 0xffe0b2, 0xe1f5fe, 0xf8bbd0, 0xdcedc8, 0xfff9c4] },
  building: { s: 1.15, geo: geoBuilding, cap: 2800, colors: [0x90a4ae, 0xb0bec5, 0xcfd8dc, 0xa1887f, 0x9fa8da, 0xffcc80] },
  tower: { s: 2.0, geo: geoTower, cap: 760, colors: [0x6fa8dc, 0x9fc5e8, 0x7f8c9a, 0xb4c7d6, 0x5d7b96] },
  boat: { s: 0.55, geo: geoBoat, cap: 650, colors: [0xffffff, 0xff7043, 0x4fc3f7] },
  gold: { s: 0.5, geo: geoGold, cap: 300, colors: [0xffffff], emissive: 0x0a3a5a },
  bomb: { s: 0.45, geo: geoBomb, cap: 240, colors: [0xffffff], emissive: 0x8a2a00 },
  debris: { s: 0.4, geo: geoDebris, cap: 900, colors: [0xa1887f, 0x8d6e63, 0xc5e1a5, 0xffcc80], emissive: 0x1a2a00 },
};
for (const k in KINDS) KINDS[k].cap = Math.round(KINDS[k].cap * CAPK);

const CELL = 3; // grados
const ROWS = 180 / CELL, COLS = 360 / CELL;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _col = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3(), _v = new THREE.Vector3();

export class World {
  constructor(scene) {
    this.scene = scene;
    this.objs = []; // {kind, s, pos, yaw, alive, inst, cell, pts, landmark, falling, respawnAt, base}
    this.meshes = {};
    this.free = {};
    this.grid = Array.from({ length: ROWS * COLS }, () => []);
    this.falling = [];
    this.landmarkObjs = [];
    this.respawnQueue = [];
    this.dirty = new Set();
    this.count = {}; this.base = {}; this.hi = {}; this.factor = 1;

    for (const [k, def] of Object.entries(KINDS)) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: def.emissive || 0x000000 });
      const mesh = new THREE.InstancedMesh(def.geo(), mat, def.cap);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      _m.makeScale(0, 0, 0);
      const col = new THREE.Color();
      for (let i = 0; i < def.cap; i++) {
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, col.setHex(def.colors[i % def.colors.length]));
      }
      scene.add(mesh);
      this.meshes[k] = mesh;
      this.free[k] = []; this.count[k] = 0; this.hi[k] = 0; mesh.count = 0;
      for (let i = def.cap - 1; i >= 0; i--) this.free[k].push(i);
    }
  }

  // ---------- grilla ----------
  cellOf(v) {
    const { lat, lon } = vecToLatLon(v);
    const r = Math.min(ROWS - 1, Math.floor((lat + 90) / CELL));
    const c = Math.min(COLS - 1, Math.floor((lon + 180) / CELL));
    return r * COLS + c;
  }
  addToGrid(o) { o.cell = this.cellOf(o.pos); this.grid[o.cell].push(o); }
  removeFromGrid(o) {
    const a = this.grid[o.cell]; const i = a.indexOf(o);
    if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
    o.cell = -1;
  }
  /** Llama fn(o) para cada objeto vivo a menos de radius (unidades) de pos */
  query(pos, radius, fn) {
    const { lat, lon } = vecToLatLon(pos);
    const ad = ((radius + 10) / R) * 180 / Math.PI; // margen para objetos grandes
    const lat0 = Math.max(-90, lat - ad), lat1 = Math.min(90, lat + ad);
    const r0 = Math.max(0, Math.floor((lat0 + 90) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((lat1 + 90) / CELL));
    const maxLat = Math.max(Math.abs(lat0), Math.abs(lat1));
    const cosm = Math.cos(Math.min(89.5, maxLat) * Math.PI / 180);
    const lonHalf = ad / Math.max(cosm, 0.01);
    const cosLim = Math.cos(Math.min(Math.PI, (radius + 9) / R));
    const visit = (cellIdx) => {
      const a = this.grid[cellIdx];
      for (let i = 0; i < a.length; i++) { const o = a[i]; if (o.pos.dot(pos) > cosLim) fn(o); }
    };
    for (let r = r0; r <= r1; r++) {
      if (lonHalf >= 180) { for (let c = 0; c < COLS; c++) visit(r * COLS + c); continue; }
      const c0 = Math.floor((lon - lonHalf + 180) / CELL), c1 = Math.floor((lon + lonHalf + 180) / CELL);
      for (let c = c0; c <= c1; c++) visit(r * COLS + ((c % COLS) + COLS) % COLS);
    }
  }

  // ---------- spawn ----------
  writeMatrix(o, extra) {
    if (o.landmark) {
      if (!extra) { o.mesh.position.copy(o.pos).multiplyScalar(R); o.mesh.quaternion.setFromUnitVectors(_Y, o.pos).multiply(_q2.setFromAxisAngle(_Y, o.yaw)); o.mesh.scale.setScalar(o.s); }
      o.mesh.visible = o.alive || !!extra;
      return;
    }
    const mesh = this.meshes[o.kind];
    if (!o.alive && !extra) { _m.makeScale(0, 0, 0); }
    else if (extra) { _m.compose(extra.p, extra.q, _s.setScalar(extra.sc)); }
    else {
      _q.setFromUnitVectors(_Y, o.pos).multiply(_q2.setFromAxisAngle(_Y, o.yaw));
      _m.compose(_p.copy(o.pos).multiplyScalar(R), _q, _s.setScalar(o.s));
    }
    mesh.setMatrixAt(o.inst, _m);
    this.dirty.add(mesh);
  }

  spawn(kind, pos, opts = {}) {
    const def = KINDS[kind];
    const inst = this.free[kind].pop();
    if (inst === undefined) return null;
    const s = def.s * (opts.scale ?? (0.85 + Math.random() * 0.35));
    const o = { kind, s, pos: pos.clone().normalize(), yaw: opts.yaw ?? Math.random() * Math.PI * 2, g: def.g ?? 1, alive: true, inst, cell: -1, home: opts.home || null, pts: opts.pts ?? Math.ceil(s * s * 10), area: opts.area ?? null, respawn: opts.respawn ?? true };
    this.objs.push(o);
    this.tint(o, false);
    this.count[kind]++;
    if (inst + 1 > this.hi[kind]) { this.hi[kind] = inst + 1; this.meshes[kind].count = this.hi[kind]; }
    this.addToGrid(o);
    this.writeMatrix(o);
    return o;
  }

  spawnLandmark(L) {
    const mesh = new THREE.Mesh(geoLandmark(L.shape, L.color), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(mesh);
    // brillo en la base para que se note desde lejos
    const o = { kind: 'landmark', landmark: L, mesh, s: L.s, pos: L.pos.clone(), yaw: Math.random() * 6, alive: true, cell: -1, pts: Math.ceil(L.s * L.s * 25), respawn: true };
    this.objs.push(o); this.landmarkObjs.push(o);
    this.addToGrid(o); this.writeMatrix(o);
  }

  populate() {
    // ciudades
    for (const c of CITIES) this.populateCity(c, 1);
    // campo: bosques y pueblos
    const p = new THREE.Vector3();
    let guard = 0;
    while (this.count.tree < KINDS.tree.cap * 0.62 && guard++ < 5000) {
      randomLand(p);
      const n = 8 + Math.floor(Math.random() * 25), rad = 1 + Math.random() * 3;
      for (let i = 0; i < n; i++) { const q = offsetPoint(p, Math.sqrt(Math.random()) * rad, Math.random() * 7); if (isLand(q)) this.spawn('tree', q, { home: 'land' }); }
    }
    guard = 0;
    while (this.count.house < KINDS.house.cap * 0.62 && guard++ < 3000) {
      randomLand(p);
      const n = 3 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) { const q = offsetPoint(p, Math.random() * 1.8, Math.random() * 7); if (isLand(q)) this.spawn('house', q, { home: 'land' }); }
      if (Math.random() < 0.6) this.spawn('car', offsetPoint(p, Math.random() * 2, Math.random() * 7), { home: 'land' });
      for (let i = 0; i < 3; i++) this.spawn(Math.random() < 0.7 ? 'person' : 'dog', offsetPoint(p, Math.random() * 2, Math.random() * 7), { home: 'land' });
    }
    guard = 0;
    while (this.count.palm < KINDS.palm.cap * 0.62 && guard++ < 3000) {
      randomLand(p, 30);
      if (Math.abs(p.y) > 0.45) continue;
      for (let i = 0; i < 5; i++) { const q = offsetPoint(p, Math.random() * 1.5, Math.random() * 7); if (isLand(q)) this.spawn('palm', q, { home: 'tropic' }); }
    }
    for (let i = 0; i < Math.round(380 * CAPK); i++) this.spawn('boat', randomCoastalOcean(p), { home: 'sea' });
    for (let i = 0; i < Math.round(130 * CAPK); i++) this.spawn('bomb', randomLand(p), { home: 'land', scale: 1, pts: 0 });
    for (let i = 0; i < 40; i++) this.spawn('gold', randomLand(p), { home: 'land', scale: 1, pts: 60 });
    for (const L of LANDMARKS) this.spawnLandmark(L);
    for (const k in KINDS) this.base[k] = this.count[k];
  }

  populateCity(c, mult) {
    const rad = 2.2 + c.w * 1.6;
    const p = new THREE.Vector3();
    const put = (kind, n, r0, r1) => {
      for (let i = 0; i < n; i++) {
        for (let t = 0; t < 4; t++) {
          offsetPoint(c.pos, r0 + Math.pow(Math.random(), 0.8) * (r1 - r0), Math.random() * 7, p);
          if (isLand(p) || t === 3) { this.spawn(kind, p, { home: c }); break; }
        }
      }
    };
    put('tower', Math.round(4 * c.w * mult), 0, rad * 0.35);
    put('building', Math.round(14 * c.w * mult), 0, rad * 0.65);
    put('house', Math.round(26 * c.w * mult), rad * 0.3, rad);
    put('car', Math.round(30 * c.w * mult), 0, rad * 0.9);
    put('tree', Math.round(20 * c.w * mult), rad * 0.4, rad * 1.3);
    const t = MOBILE ? 0.6 : 1;
    put('person', Math.round(20 * c.w * mult * t), 0, rad * 1.1);
    put('cone', Math.round(7 * c.w * mult * t), 0, rad);
    put('bin', Math.round(7 * c.w * mult * t), 0, rad);
    put('hydrant', Math.round(5 * c.w * mult * t), 0, rad);
    put('bike', Math.round(6 * c.w * mult * t), 0, rad);
    put('bench', Math.round(6 * c.w * mult * t), rad * 0.2, rad * 1.1);
    put('dog', Math.round(5 * c.w * mult * t), rad * 0.2, rad * 1.2);
  }

  /** Busca un lugar para reaparecer que no esté encima de ningún hueco */
  findSpawn(o, holes) {
    const p = new THREE.Vector3();
    for (let t = 0; t < 12; t++) {
      if (o.landmark) p.copy(o.landmark.pos);
      else if (o.home === 'sea') randomCoastalOcean(p);
      else if (o.home === 'land' || o.home === 'tropic') {
        if (o.home === 'tropic') { randomLand(p, 26); } else randomLand(p);
      } else if (o.home && o.home.pos) {
        const rad = 2.2 + o.home.w * 1.6;
        offsetPoint(o.home.pos, Math.random() * rad, Math.random() * 7, p);
      } else randomLand(p);
      let ok = true;
      for (const h of holes) { if (h.alive && surfDist(h.pos, p) < h.r + o.s + 3) { ok = false; break; } }
      if (ok) return p;
      if (o.landmark) return null;
    }
    return null;
  }

  kill(o, hole) {
    o.alive = false;
    this.tint(o, true);
    this.removeFromGrid(o);
    this.falling.push({ o, hole, t: 0, start: o.pos.clone(), dur: o.landmark ? 1.4 : 0.55 + Math.min(0.6, o.s * 0.15), spin: (Math.random() - 0.5) * 3 });
  }

  update(dt, now, holes) {
    // animación de caída
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const o = f.o;
      // se arrastra hacia el centro del hueco
      _v.copy(f.start).lerp(f.hole.pos, Math.min(1, k * 0.9)).normalize();
      const sink = k * k * (o.s * 7 + 2);
      _p.copy(_v).multiplyScalar(R - sink);
      _ax.copy(f.hole.pos).sub(f.start); _ax.crossVectors(_v, _ax);
      if (_ax.lengthSq() < 1e-10) _ax.set(1, 0, 0).cross(_v);
      _ax.normalize();
      _q.setFromUnitVectors(_Y, _v).multiply(_q2.setFromAxisAngle(_Y, o.yaw));
      _q2.setFromAxisAngle(_ax, k * k * 1.6 + f.spin * k);
      _q.premultiply(_q2);
      if (o.landmark) {
        o.mesh.visible = true;
        o.mesh.position.copy(_p); o.mesh.quaternion.copy(_q); o.mesh.scale.setScalar(o.s * (1 - k * 0.3));
      } else this.writeMatrix(o, { p: _p, q: _q, sc: o.s * (1 - k * 0.35) });
      if (k >= 1) {
        this.falling.splice(i, 1);
        if (o.landmark) o.mesh.visible = false; else this.writeMatrix(o);
        if (o.respawn) this.respawnQueue.push({ o, at: now + (o.landmark ? 70 : o.kind === 'gold' ? 25 : 12 + Math.random() * 25) });
        else this.release(o);
      }
    }
    // reapariciones (escalonadas)
    let budget = 40;
    for (let i = this.respawnQueue.length - 1; i >= 0 && budget > 0; i--) {
      const r = this.respawnQueue[i];
      if (now < r.at) continue;
      budget--;
      if (!r.o.landmark && this.base[r.o.kind] && this.count[r.o.kind] > Math.round(this.base[r.o.kind] * this.factor)) { this.respawnQueue.splice(i, 1); this.release(r.o); continue; }
      const p = this.findSpawn(r.o, holes);
      if (!p) { r.at = now + 3; continue; }
      this.respawnQueue.splice(i, 1);
      const o = r.o;
      o.pos.copy(p); o.alive = true; o.yaw = Math.random() * 7;
      this.tint(o, false);
      this.addToGrid(o); this.writeMatrix(o);
      o.bornAt = now;
    }
    // girar oro, bombas y escombros para que brillen
    const spinK = ['gold', 'bomb', 'debris'];
    for (const o of this.objs) {
      if (!o.alive || o.landmark || !spinK.includes(o.kind)) continue;
      o.yaw += dt * 2.2;
      this.writeMatrix(o);
    }
    for (const m of this.dirty) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }

  release(o) {
    this.count[o.kind]--;
    this.free[o.kind].push(o.inst);
    const i = this.objs.indexOf(o);
    if (i >= 0) { this.objs[i] = this.objs[this.objs.length - 1]; this.objs.pop(); }
  }

  /** Reescribe todas las matrices (cuando cambia el radio del planeta) */
  rebuild() {
    for (const o of this.objs) if (o.alive) this.writeMatrix(o);
  }

  /** Agrega objetos hasta la densidad que pide el tamaño actual del planeta */
  topUp(holes) {
    let budget = 120;
    for (const k of ['tree', 'palm', 'car', 'house', 'building', 'tower', 'boat', 'bomb', 'gold', 'person', 'cone', 'bin', 'hydrant', 'bike', 'bench', 'dog']) {
      const want = Math.min(KINDS[k].cap, Math.round(this.base[k] * this.factor));
      while (this.count[k] < want && budget-- > 0) {
        const home = k === 'boat' ? 'sea' : k === 'palm' ? 'tropic' : ['car', 'building', 'tower', 'person', 'cone', 'bin', 'hydrant', 'bike', 'bench'].includes(k) ? CITIES[Math.floor(Math.random() * CITIES.length)] : 'land';
        const p = this.findSpawn({ kind: k, s: KINDS[k].s, home }, holes);
        if (!p) break;
        this.spawn(k, p, { home, ...(k === 'bomb' ? { scale: 1, pts: 0 } : k === 'gold' ? { scale: 1, pts: 60 } : {}) });
      }
    }
  }

  /** Verde cuando la selva lo cubre; su color original cuando vuelve */
  tint(o, green) {
    if (o.landmark) { o.mesh.material.color.set(green ? 0x4caf50 : 0xffffff); return; }
    const def = KINDS[o.kind], mesh = this.meshes[o.kind];
    _col.setHex(green ? 0x3f9b35 : def.colors[o.inst % def.colors.length]);
    mesh.setColorAt(o.inst, _col);
    mesh.instanceColor.needsUpdate = true;
  }

  /** Saca lo que haya en un área (para construir una casa nueva encima) */
  clearArea(center, rad, now) {
    const list = [];
    this.query(center, rad, (o) => { if (o.alive && !o.landmark && surfDist(center, o.pos) < rad + o.s) list.push(o); });
    for (const o of list) {
      o.alive = false; this.removeFromGrid(o); this.writeMatrix(o);
      if (o.respawn) this.respawnQueue.push({ o, at: now + 15 + Math.random() * 20 }); else this.release(o);
    }
  }

  /** Casa donde nace un hueco: paredes en anillo + muebles adentro */
  buildHome(center, now) {
    const rad = 1.0;
    this.clearArea(center, rad + 0.35, now);
    const t1 = tangentize(new THREE.Vector3(0, 1, 0), center);
    const t2 = new THREE.Vector3().crossVectors(center, t1);
    const n = 12;
    const wq = new THREE.Quaternion(), x0 = new THREE.Vector3(), tg = new THREE.Vector3(), cr = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = offsetPoint(center, rad, a);
      tg.copy(t1).multiplyScalar(-Math.sin(a)).addScaledVector(t2, Math.cos(a)); tangentize(tg, p);
      x0.set(1, 0, 0).applyQuaternion(wq.setFromUnitVectors(_Y, p));
      cr.crossVectors(x0, tg);
      const yaw = Math.atan2(cr.dot(p), x0.dot(tg));
      this.spawn('wall', p, { yaw, scale: 1, respawn: false, pts: 3 });
    }
    const mix = ['cup', 'cup', 'cup', 'cup', 'book', 'book', 'book', 'book', 'book', 'chair', 'chair', 'chair', 'chair', 'chair', 'chair',
      'lamp', 'lamp', 'lamp', 'table', 'table', 'table', 'sofa', 'sofa', 'bed', 'dog', 'cup', 'book', 'chair', 'person', 'person', 'cup', 'book', 'lamp', 'chair'];
    for (const k of mix) {
      const p = offsetPoint(center, 0.18 + Math.sqrt(Math.random()) * (rad - 0.3), Math.random() * 7);
      this.spawn(k, p, { respawn: false, scale: 0.85 + Math.random() * 0.3, pts: 1 });
    }
    return { pos: center.clone(), rad };
  }

  /** Escombros que suelta un hueco partido por una bomba */
  scatterDebris(center, rInner, totalArea, count) {
    const per = totalArea / count;
    for (let i = 0; i < count; i++) {
      const p = offsetPoint(center, rInner * (1.15 + Math.random() * 1.3), Math.random() * Math.PI * 2);
      const o = this.spawn('debris', p, { respawn: false, area: per, pts: Math.ceil(per * 12), scale: 0.9 + Math.random() * 0.6 });
      if (!o) break;
    }
  }

  goldRain(city, n) {
    for (let i = 0; i < n; i++) {
      const p = offsetPoint(city.pos, Math.random() * (2 + city.w * 2), Math.random() * 7);
      this.spawn('gold', p, { respawn: false, scale: 1, pts: 60 });
    }
  }
}
