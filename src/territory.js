import * as THREE from 'three';
import { isLand, latLonToVec, R0 } from './geo.js';

// Territorio: grilla equirectangular con el dueño de cada celda de tierra.
// 0 = libre, 1..250 = id de la selva, ASH = ceniza, FIRE = fuego.
export const TW = 1024, TH = 512;
export const ASH = 253, FIRE = 254;
export const grid = new Uint8Array(TW * TH);
const landG = new Uint8Array(TW * TH);
const cellA = new Float32Array(TH); // área de una celda por fila (unidades² a R0)
export const area = new Float32Array(256); // área por dueño
export let LAND_TOTAL = 1;

export const tex = new THREE.DataTexture(grid, TW, TH, THREE.RedFormat, THREE.UnsignedByteType);
tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
tex.wrapS = THREE.RepeatWrapping;

// paleta: color de cada dueño
const palData = new Uint8Array(256 * 4);
export const palette = new THREE.DataTexture(palData, 256, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
palette.magFilter = THREE.NearestFilter; palette.minFilter = THREE.NearestFilter;
export function setColor(id, color) {
  palData[id * 4] = color.r * 255; palData[id * 4 + 1] = color.g * 255; palData[id * 4 + 2] = color.b * 255; palData[id * 4 + 3] = 255;
  palette.needsUpdate = true;
}

let dirty = true;
export function initTerritory() {
  const v = new THREE.Vector3();
  LAND_TOTAL = 0;
  for (let j = 0; j < TH; j++) {
    const lat = -90 + ((j + 0.5) * 180) / TH;
    cellA[j] = ((Math.PI / TH) * R0) * ((2 * Math.PI / TW) * R0 * Math.cos(lat * Math.PI / 180));
    for (let i = 0; i < TW; i++) {
      const lon = -180 + ((i + 0.5) * 360) / TW;
      if (isLand(latLonToVec(lat, lon, v))) { landG[j * TW + i] = 1; LAND_TOTAL += cellA[j]; }
    }
  }
  tex.needsUpdate = true;
}

export function idxOf(p) {
  const lat = Math.asin(Math.max(-1, Math.min(1, p.y))), lon = Math.atan2(-p.z, p.x);
  const j = Math.min(TH - 1, Math.max(0, Math.floor(((lat + Math.PI / 2) / Math.PI) * TH)));
  const i = ((Math.floor(((lon + Math.PI) / (2 * Math.PI)) * TW) % TW) + TW) % TW;
  return j * TW + i;
}
export const ownerAt = (p) => grid[idxOf(p)];
export const isLandCell = (idx) => landG[idx] === 1;

function setCell(idx, j, v) {
  const prev = grid[idx];
  if (prev === v) return false;
  if (prev > 0 && prev < ASH) area[prev] -= cellA[j];
  if (v > 0 && v < ASH) area[v] += cellA[j];
  grid[idx] = v;
  return true;
}

/**
 * Pinta un disco de radio `rad` (unidades, con el radio actual Rnow) para `owner`.
 * Solo pinta tierra. Si `only` está definido, solo cambia celdas que tengan ese dueño.
 * Devuelve {n: celdas cambiadas, fire: fuegos apagados}.
 */
const res = { n: 0, fire: 0 };
export function paint(p, rad, owner, Rnow, only = -1, protect = null) {
  res.n = 0; res.fire = 0;
  const lat = Math.asin(Math.max(-1, Math.min(1, p.y))), lon = Math.atan2(-p.z, p.x);
  const ang = rad / Rnow;
  if (ang <= 0) return res;
  const cosA = Math.cos(ang), sLat = Math.sin(lat), cLat = Math.cos(lat);
  const j0 = Math.max(0, Math.floor(((lat - ang + Math.PI / 2) / Math.PI) * TH));
  const j1 = Math.min(TH - 1, Math.floor(((lat + ang + Math.PI / 2) / Math.PI) * TH));
  for (let j = j0; j <= j1; j++) {
    const lc = -Math.PI / 2 + ((j + 0.5) * Math.PI) / TH;
    const c = cLat * Math.cos(lc), s = sLat * Math.sin(lc);
    let dl;
    if (c < 1e-6) { if (s < cosA) continue; dl = Math.PI; }
    else {
      const k = (cosA - s) / c;
      if (k > 1) continue;
      dl = k < -1 ? Math.PI : Math.acos(k);
    }
    const i0 = Math.floor(((lon - dl + Math.PI) / (2 * Math.PI)) * TW);
    const i1 = Math.floor(((lon + dl + Math.PI) / (2 * Math.PI)) * TW);
    const row = j * TW;
    for (let ii = i0; ii <= Math.min(i1, i0 + TW - 1); ii++) {
      const idx = row + (((ii % TW) + TW) % TW);
      if (!landG[idx]) continue;
      const prev = grid[idx];
      if (only >= 0 && prev !== only) continue;
      if (protect && protect.indexOf(prev) >= 0) continue;
      if (setCell(idx, j, owner)) { res.n++; if (prev === FIRE) res.fire++; }
    }
  }
  if (res.n) dirty = true;
  return res;
}

/** Todo el territorio de `from`: lo que quede a menos de `rad` de `center` pasa a `to`; el resto se libera */
export function transfer(from, to, center, rad, Rnow) {
  const cosR = center ? Math.cos(Math.min(Math.PI, rad / Rnow)) : 2;
  for (let j = 0; j < TH; j++) {
    const lc = -Math.PI / 2 + ((j + 0.5) * Math.PI) / TH;
    const y = Math.sin(lc), cl = Math.cos(lc);
    const row = j * TW;
    for (let i = 0; i < TW; i++) {
      const idx = row + i;
      if (grid[idx] !== from) continue;
      let v = 0;
      if (center && to) {
        const lon = -Math.PI + ((i + 0.5) * 2 * Math.PI) / TW;
        const dot = cl * Math.cos(lon) * center.x + y * center.y - cl * Math.sin(lon) * center.z;
        if (dot > cosR) v = to;
      }
      setCell(idx, j, v);
    }
  }
  dirty = true;
}

// ---------- fuego ----------
let fires = [], ashes = [];
export const fireCount = () => fires.length;
export function ignite(idx) {
  const v = grid[idx];
  if (!(v > 0 && v < ASH)) return false;
  setCell(idx, Math.floor(idx / TW), FIRE);
  fires.push({ idx, t: 0 });
  dirty = true;
  return true;
}
export function fireStep(dt, now, spreadMul = 1) {
  if (!fires.length && !ashes.length) return;
  const next = [];
  for (const f of fires) {
    if (grid[f.idx] !== FIRE) continue; // la apagaron
    f.t += dt;
    if (f.t > 1.6) { setCell(f.idx, Math.floor(f.idx / TW), ASH); ashes.push({ idx: f.idx, at: now + 22 }); dirty = true; continue; }
    next.push(f);
    if (fires.length > 5000) continue;
    const j = Math.floor(f.idx / TW), i = f.idx % TW;
    const nb = [j > 0 ? f.idx - TW : -1, j < TH - 1 ? f.idx + TW : -1, j * TW + ((i + 1) % TW), j * TW + ((i + TW - 1) % TW)];
    for (const n of nb) {
      if (n < 0) continue;
      const v = grid[n];
      if (v > 0 && v < ASH && Math.random() < 0.55 * dt * 4 * spreadMul) { setCell(n, Math.floor(n / TW), FIRE); next.push({ idx: n, t: 0 }); dirty = true; }
    }
  }
  fires = next;
  if (ashes.length && ashes[0].at < now) {
    const keep = [];
    for (const a of ashes) {
      if (a.at < now) { if (grid[a.idx] === ASH) { setCell(a.idx, Math.floor(a.idx / TW), 0); dirty = true; } }
      else keep.push(a);
    }
    ashes = keep;
  }
}
/** Apaga el fuego en un disco (lluvia) */
export function douse(p, rad, Rnow) { paint(p, rad, 0, Rnow, FIRE); }

let upT = 0;
export function upload(dt, every) {
  upT -= dt;
  if (!dirty || upT > 0) return;
  upT = every; dirty = false;
  tex.needsUpdate = true;
}
/** Elige una celda al azar que sea de `owner`, buscando cerca de p */
export function sampleOwned(p, rad, owner, Rnow, tries = 24) {
  const out = new THREE.Vector3();
  for (let t = 0; t < tries; t++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * rad / Rnow;
    // punto a distancia angular d en dirección a
    const n = p;
    const t1 = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    t1.addScaledVector(n, -t1.dot(n)).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);
    out.copy(n).multiplyScalar(Math.cos(d)).addScaledVector(t1, Math.sin(d) * Math.cos(a)).addScaledVector(t2, Math.sin(d) * Math.sin(a)).normalize();
    const v = grid[idxOf(out)];
    if (owner === -1 ? v > 0 && v < ASH : v === owner) return out;
  }
  return null;
}
