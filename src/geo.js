import * as THREE from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land50 from 'world-atlas/land-50m.json';

export const R0 = 120; // radio base del planeta
export let R = R0; // crece con la cantidad de jugadores
export function setR(v) { R = v; }
const D2R = Math.PI / 180;

export function latLonToVec(lat, lon, out = new THREE.Vector3()) {
  const la = lat * D2R, lo = lon * D2R;
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

export function vecToLatLon(v) {
  return { lat: Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)) / D2R, lon: Math.atan2(-v.z, v.x) / D2R };
}

/** Distancia sobre la superficie (unidades) entre dos vectores unitarios */
export function surfDist(a, b) {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * R;
}

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3();
/** Mueve pos (unitario) en dirección dir (tangente unitaria) una distancia; transporta dir */
export function moveOnSphere(pos, dir, dist) {
  if (dist === 0) return;
  _ax.crossVectors(pos, dir);
  if (_ax.lengthSq() < 1e-10) return;
  _ax.normalize();
  _q.setFromAxisAngle(_ax, dist / R);
  pos.applyQuaternion(_q).normalize();
  dir.applyQuaternion(_q);
  tangentize(dir, pos);
}

/** Proyecta v al plano tangente en n y normaliza */
export function tangentize(v, n) {
  v.addScaledVector(n, -v.dot(n));
  const l = v.length();
  if (l < 1e-8) {
    v.set(0, 1, 0).addScaledVector(n, -n.y);
    if (v.lengthSq() < 1e-6) v.set(1, 0, 0).addScaledVector(n, -n.x);
  }
  return v.normalize();
}

/** Dirección tangente en a que apunta hacia b */
export function dirTo(a, b, out = new THREE.Vector3()) {
  out.copy(b).addScaledVector(a, -a.dot(b));
  if (out.lengthSq() < 1e-12) return out.set(0, 0, 0);
  return out.normalize();
}

/** Punto a distancia dist (unidades) desde pos en ángulo aleatorio */
export function offsetPoint(pos, dist, angle, out = new THREE.Vector3()) {
  const t1 = tangentize(new THREE.Vector3(0, 1, 0), pos);
  const t2 = new THREE.Vector3().crossVectors(pos, t1);
  const d = t1.multiplyScalar(Math.cos(angle)).addScaledVector(t2, Math.sin(angle));
  out.copy(pos);
  moveOnSphere(out, d, dist);
  return out;
}

export function randomUnit(out = new THREE.Vector3()) {
  const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(t), u, s * Math.sin(t));
}

// ---------- Máscara de tierra ----------
const MW = 2048, MH = 1024;
let maskData = null;
export let maskCanvas = null;

export function buildLand() {
  const land = feature(land50, land50.objects.land);
  const c = document.createElement('canvas');
  c.width = MW; c.height = MH;
  const ctx = c.getContext('2d');
  const proj = geoEquirectangular().scale(MW / (2 * Math.PI)).translate([MW / 2, MH / 2]);
  const path = geoPath(proj, ctx);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MW, MH);
  // G: cercanía a la costa (difuminado)
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = 'rgb(0,255,0)';
  ctx.beginPath(); path(land); ctx.fill();
  ctx.filter = 'none';
  // R: tierra exacta
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.beginPath(); path(land); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  maskData = ctx.getImageData(0, 0, MW, MH).data;
  maskCanvas = c;
  return c;
}

export function isLand(v) {
  const { lat, lon } = vecToLatLon(v);
  const x = Math.min(MW - 1, Math.max(0, Math.floor((lon + 180) / 360 * MW)));
  const y = Math.min(MH - 1, Math.max(0, Math.floor((90 - lat) / 180 * MH)));
  return maskData[(y * MW + x) * 4] > 128;
}

/** Cercanía a costa 0..1 (para barcos) */
export function coastNear(v) {
  const { lat, lon } = vecToLatLon(v);
  const x = Math.min(MW - 1, Math.max(0, Math.floor((lon + 180) / 360 * MW)));
  const y = Math.min(MH - 1, Math.max(0, Math.floor((90 - lat) / 180 * MH)));
  return maskData[(y * MW + x) * 4 + 1] / 255;
}

export function randomLand(out = new THREE.Vector3(), maxAbsLat = 72) {
  for (let i = 0; i < 400; i++) {
    randomUnit(out);
    if (Math.abs(out.y) > Math.sin(maxAbsLat * D2R)) continue;
    if (isLand(out)) return out;
  }
  return out;
}

export function randomCoastalOcean(out = new THREE.Vector3()) {
  for (let i = 0; i < 600; i++) {
    randomUnit(out);
    if (Math.abs(out.y) > 0.85) continue;
    if (!isLand(out)) { const c = coastNear(out); if (c > 0.08 && c < 0.6) return out; }
  }
  return out;
}

// ---------- Ciudades (peso ~ tamaño) ----------
export const CITIES = [
  ['Tokio', 35.68, 139.69, 3], ['Delhi', 28.61, 77.21, 2.6], ['Shanghái', 31.23, 121.47, 2.6], ['São Paulo', -23.55, -46.63, 2.4],
  ['Ciudad de México', 19.43, -99.13, 2.5], ['El Cairo', 30.04, 31.24, 2.1], ['Bombay', 19.08, 72.88, 2.3], ['Pekín', 39.9, 116.4, 2.3],
  ['Daca', 23.81, 90.41, 1.8], ['Osaka', 34.69, 135.5, 1.8], ['Nueva York', 40.71, -74.0, 2.6], ['Karachi', 24.86, 67.0, 1.8],
  ['Buenos Aires', -34.6, -58.38, 2.1], ['Estambul', 41.01, 28.98, 2.0], ['Calcuta', 22.57, 88.36, 1.7], ['Manila', 14.6, 120.98, 1.8],
  ['Lagos', 6.52, 3.38, 1.9], ['Río de Janeiro', -22.91, -43.17, 1.9], ['Moscú', 55.76, 37.62, 2.1], ['Los Ángeles', 34.05, -118.24, 2.3],
  ['París', 48.86, 2.35, 2.1], ['Londres', 51.51, -0.13, 2.2], ['Bogotá', 4.71, -74.07, 1.7], ['Lima', -12.05, -77.04, 1.7],
  ['Yakarta', -6.2, 106.85, 2.0], ['Seúl', 37.57, 126.98, 2.0], ['Bangkok', 13.76, 100.5, 1.9], ['Chicago', 41.88, -87.63, 1.9],
  ['Teherán', 35.69, 51.39, 1.7], ['Hong Kong', 22.32, 114.17, 1.9], ['Madrid', 40.42, -3.7, 1.7], ['Santiago', -33.45, -70.67, 1.6],
  ['Toronto', 43.65, -79.38, 1.7], ['Dubái', 25.2, 55.27, 1.8], ['Sídney', -33.87, 151.21, 1.8], ['Singapur', 1.35, 103.82, 1.7],
  ['Johannesburgo', -26.2, 28.05, 1.6], ['Nairobi', -1.29, 36.82, 1.4], ['Kinsasa', -4.44, 15.27, 1.5], ['Berlín', 52.52, 13.4, 1.7],
  ['Roma', 41.9, 12.5, 1.6], ['Barcelona', 41.39, 2.17, 1.5], ['Miami', 25.76, -80.19, 1.6], ['San Francisco', 37.77, -122.42, 1.6],
  ['Vancouver', 49.28, -123.12, 1.4], ['Melbourne', -37.81, 144.96, 1.6], ['San José', 9.93, -84.08, 1.5], ['La Paz', -16.5, -68.15, 1.3],
  ['Santa Cruz', -17.78, -63.18, 1.3], ['Caracas', 10.48, -66.9, 1.4], ['Quito', -0.18, -78.47, 1.3], ['La Habana', 23.11, -82.37, 1.3],
  ['Panamá', 8.98, -79.52, 1.3], ['Guatemala', 14.63, -90.51, 1.3], ['Montevideo', -34.9, -56.16, 1.3], ['Asunción', -25.26, -57.58, 1.2],
  ['Lisboa', 38.72, -9.14, 1.4], ['Ámsterdam', 52.37, 4.9, 1.4], ['Estocolmo', 59.33, 18.07, 1.3], ['Varsovia', 52.23, 21.01, 1.3],
  ['Atenas', 37.98, 23.73, 1.3], ['Kiev', 50.45, 30.52, 1.4], ['Riad', 24.71, 46.68, 1.6], ['Casablanca', 33.57, -7.59, 1.4],
  ['Addis Abeba', 9.03, 38.74, 1.4], ['Accra', 5.6, -0.19, 1.3], ['Dakar', 14.72, -17.47, 1.2], ['Ciudad del Cabo', -33.92, 18.42, 1.4],
  ['Kuala Lumpur', 3.14, 101.69, 1.6], ['Taipéi', 25.03, 121.57, 1.6], ['Hanói', 21.03, 105.85, 1.5], ['Chengdú', 30.57, 104.07, 1.8],
  ['Novosibirsk', 55.01, 82.93, 1.2], ['Anchorage', 61.22, -149.9, 1.0], ['Reikiavik', 64.15, -21.94, 1.0], ['Auckland', -36.85, 174.76, 1.3],
  ['Perth', -31.95, 115.86, 1.2], ['Houston', 29.76, -95.37, 1.7], ['Montreal', 45.5, -73.57, 1.5], ['Monterrey', 25.69, -100.32, 1.5],
  ['Medellín', 6.24, -75.58, 1.4], ['Brasilia', -15.79, -47.88, 1.3], ['Manaos', -3.12, -60.02, 1.1], ['Lahore', 31.55, 74.34, 1.7],
].map(([name, lat, lon, w]) => ({ name, lat, lon, w, pos: latLonToVec(lat, lon) }));

// ---------- Monumentos ----------
// shape: spire | pyramid | statue | tower | mountain | dome | wall | bridge | temple
export const LANDMARKS = [
  { name: 'la Torre Eiffel', lat: 48.858, lon: 2.294, s: 4.2, shape: 'spire', color: 0x8a6d4b },
  { name: 'las Pirámides de Guiza', lat: 29.979, lon: 31.134, s: 5.5, shape: 'pyramid', color: 0xd9b96a },
  { name: 'la Estatua de la Libertad', lat: 40.689, lon: -74.044, s: 3.6, shape: 'statue', color: 0x6fbf9f },
  { name: 'el Cristo Redentor', lat: -22.951, lon: -43.21, s: 3.6, shape: 'statue', color: 0xe6e2d8 },
  { name: 'el Burj Khalifa', lat: 25.197, lon: 55.274, s: 4.6, shape: 'spire', color: 0xb8c9d9 },
  { name: 'el Taj Mahal', lat: 27.175, lon: 78.042, s: 4.4, shape: 'dome', color: 0xf3efe6 },
  { name: 'el Coliseo', lat: 41.89, lon: 12.492, s: 4.0, shape: 'temple', color: 0xc9a77a },
  { name: 'el Big Ben', lat: 51.5007, lon: -0.1246, s: 3.4, shape: 'tower', color: 0xc2a36b },
  { name: 'la Ópera de Sídney', lat: -33.857, lon: 151.215, s: 4.0, shape: 'dome', color: 0xffffff },
  { name: 'el Monte Fuji', lat: 35.36, lon: 138.73, s: 7.5, shape: 'mountain', color: 0x5f6f7f },
  { name: 'la Gran Muralla', lat: 40.43, lon: 116.57, s: 5.0, shape: 'wall', color: 0xa89a7a },
  { name: 'Chichén Itzá', lat: 20.684, lon: -88.568, s: 4.4, shape: 'pyramid', color: 0xbfae8a },
  { name: 'Machu Picchu', lat: -13.163, lon: -72.545, s: 5.0, shape: 'temple', color: 0x8f9a7a },
  { name: 'la Torre CN', lat: 43.642, lon: -79.387, s: 4.0, shape: 'tower', color: 0xd0d0d0 },
  { name: 'el Golden Gate', lat: 37.82, lon: -122.478, s: 5.0, shape: 'bridge', color: 0xc0362c },
  { name: 'San Basilio', lat: 55.752, lon: 37.623, s: 3.8, shape: 'dome', color: 0xd94a3a },
  { name: 'la Sagrada Familia', lat: 41.4036, lon: 2.1744, s: 3.8, shape: 'spire', color: 0xc9b08a },
  { name: 'el Volcán Arenal', lat: 10.463, lon: -84.703, s: 6.5, shape: 'mountain', color: 0x4f5a45 },
  { name: 'las Torres Petronas', lat: 3.158, lon: 101.712, s: 4.2, shape: 'tower', color: 0xc8d0d8 },
  { name: 'los Moáis', lat: -27.12, lon: -109.35, s: 3.0, shape: 'statue', color: 0x6b6258 },
  { name: 'el Salar de Uyuni', lat: -20.13, lon: -67.49, s: 6.0, shape: 'mountain', color: 0xe8eef2 },
  { name: 'el Kilimanjaro', lat: -3.07, lon: 37.35, s: 8.0, shape: 'mountain', color: 0x5d5a50 },
  { name: 'el Everest', lat: 27.99, lon: 86.93, s: 9.0, shape: 'mountain', color: 0x6a6f78 },
  { name: 'la Torre de Pisa', lat: 43.723, lon: 10.396, s: 3.0, shape: 'tower', color: 0xeeeae0 },
].map((l) => ({ ...l, pos: latLonToVec(l.lat, l.lon) }));
