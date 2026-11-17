import * as THREE from 'three';
import { R } from './geo.js';

// Árbol madre: el corazón de cada selva. Es lo que camina; su copa crece con la selva.
const trunkGeo = new THREE.CylinderGeometry(0.1, 0.17, 1, 7); trunkGeo.translate(0, 0.5, 0);
const rootGeo = new THREE.ConeGeometry(0.07, 0.45, 5); rootGeo.rotateZ(Math.PI / 2); rootGeo.translate(0.22, 0.03, 0);
const blobGeo = new THREE.IcosahedronGeometry(1, 1);
const flowerGeo = new THREE.IcosahedronGeometry(0.07, 0);
const potGeo = new THREE.CylinderGeometry(0.36, 0.26, 0.34, 12); potGeo.translate(0, 0.17, 0);
const soilGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.04, 12); soilGeo.translate(0, 0.33, 0);

const _Y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3();

export function makeTree(scene, color) {
  const g = new THREE.Group();
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b3a, flatShading: true, transparent: true });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x46b04a, flatShading: true, transparent: true });
  const barkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c32, transparent: true });
  const flMat = new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.35), transparent: true });
  const potMat = new THREE.MeshLambertMaterial({ color: 0xc0623a, transparent: true });
  const sway = new THREE.Group(); g.add(sway);
  const trunk = new THREE.Mesh(trunkGeo, barkMat); trunk.scale.set(1, 0.75, 1); sway.add(trunk);
  for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(rootGeo, barkMat); r.rotation.y = i * 1.26; g.add(r); }
  const blobs = [[0, 0.98, 0, 0.42, leafMat], [0.26, 0.86, 0.12, 0.3, leafMat2], [-0.24, 0.88, -0.1, 0.31, leafMat2], [0.05, 1.18, -0.16, 0.28, leafMat2], [-0.1, 0.84, 0.27, 0.27, leafMat]];
  for (const [x, y, z, s, m] of blobs) { const b = new THREE.Mesh(blobGeo, m); b.position.set(x, y, z); b.scale.setScalar(s); sway.add(b); }
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(flowerGeo, flMat);
    const a = i * 2.4, rr = 0.3 + (i % 3) * 0.08;
    f.position.set(Math.cos(a) * rr, 0.9 + ((i * 7) % 5) * 0.07, Math.sin(a) * rr);
    sway.add(f);
  }
  const pot = new THREE.Group();
  pot.add(new THREE.Mesh(potGeo, potMat), new THREE.Mesh(soilGeo, new THREE.MeshLambertMaterial({ color: 0x4e342e, transparent: true })));
  g.add(pot);
  scene.add(g);
  const mats = [leafMat, leafMat2, barkMat, flMat, potMat, pot.children[1].material];
  return { g, sway, pot, mats, swayT: Math.random() * 6 };
}

/** Coloca el árbol sobre la selva h */
export function placeTree(t, h, dt, inPot) {
  const vis = h.alive && h.camo !== 'hidden';
  t.g.visible = vis;
  if (!vis) return;
  const a = h.alpha ? h.alpha() : 1;
  for (const m of t.mats) m.opacity = Math.max(0.12, a);
  // alto del árbol: crece con la selva
  const H = Math.max(0.22, h.r * 0.75);
  t.g.position.copy(h.pos).multiplyScalar(R);
  _q.setFromUnitVectors(_Y, h.pos);
  // mirar hacia donde camina
  _ax.copy(h.dir).applyQuaternion(_q2.copy(_q).invert());
  _q2.setFromAxisAngle(_Y, Math.atan2(_ax.x, _ax.z));
  t.g.quaternion.copy(_q).multiply(_q2);
  t.g.scale.setScalar(H);
  t.pot.visible = inPot;
  t.swayT += dt * (2 + h.throttle * 4);
  const lean = 0.06 + h.throttle * 0.12;
  t.sway.rotation.x = lean + Math.sin(t.swayT) * 0.04;
  t.sway.rotation.z = Math.sin(t.swayT * 0.7) * 0.05;
  t.sway.position.y = inPot ? 0.3 : 0;
}

export function dropTree(scene, t) {
  scene.remove(t.g);
  for (const m of t.mats) m.dispose();
}
