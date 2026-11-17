import * as THREE from 'three';
import { R, CITIES, surfDist, dirTo, tangentize, offsetPoint, randomLand, isLand } from './geo.js';
import { grid, idxOf, ASH } from './territory.js';

export const START_R = 0.14;
export const START_A = START_R * START_R;
export const GAIN = 0.05; // área ganada = s² * GAIN * g(tipo)
export const EAT_RATIO = 0.82; // un objeto entra si s < r * EAT_RATIO
export const HOLE_RATIO = 1.12; // un hueco come a otro si r > r2 * HOLE_RATIO
export const MAX_BOMBS = 3;
export const WALL_R = 0.33; // tamaño para romper las paredes de la casa
export const CAMO = { charge: 60, fade: 8, hidden: 30, reveal: 8 };
export const TEAM_MAX = 3;
export const PACK = { touch: 0.5, need: 0.75, time: 2.5 }; // cacería en manada
export const TERR_K = 0.012; // cuánto tamaño da cada unidad² de territorio

export const TITLES = [
  [0, 'Brote'], [0.3, 'Musgo'], [0.6, 'Matorral'], [1.2, 'Huerto'], [2.2, 'Arboleda'], [3.8, 'Bosque'], [6, 'Selva'], [9, 'Jungla Ancestral'], [13, 'Gaia'],
];
export function titleOf(r) { let t = TITLES[0][1]; for (const [min, name] of TITLES) if (r >= min) t = name; return t; }
export function titleIndex(r) { let k = 0; TITLES.forEach(([min], i) => { if (r >= min) k = i; }); return k; }
export function fmtSize(r) { return r < 1 ? `${Math.round(r * 100)} cm` : `${r.toFixed(1)} m`; }

const BOT_NAMES = ['Doña Ceiba', 'Musgo Loco', 'El Guanacaste', 'Hiedra', 'Matapalo', 'Bambú Feroz', 'Enredadera', 'Liana', 'Helecho',
  'Selvita', 'Don Bejuco', 'Manglar', 'Raíz Negra', 'Yuca Brava', 'Orquídea', 'Guarumo', 'Higuerón', 'Ficus 3000',
  'Pochote', 'Chilamate', 'Cactus Kid', 'Doña Mora', 'Bonsái', 'Kudzu', 'Sauce Llorón', 'La Ortiga'];
const BOT_COLORS = [0xff5252, 0xffab40, 0xffee58, 0x69f0ae, 0x40c4ff, 0xb388ff, 0xff80ab, 0x64ffda, 0xeeff41, 0xff6e40, 0x8c9eff, 0xea80fc, 0x18ffff, 0xccff90, 0xffd180, 0xf48fb1, 0x80cbc4, 0xffcc80, 0xb39ddb, 0xa5d6a7, 0xef9a9a, 0x90caf9, 0xfff59d, 0xbcaaa4, 0xff8a80, 0x84ffff];

let nextId = 1;
export class Hole {
  constructor({ name, color, isPlayer = false }) {
    this.id = nextId++;
    this.name = name;
    this.color = new THREE.Color(color);
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3(0, 1, 0);
    this.dir = new THREE.Vector3(1, 0, 0);
    this.alive = false;
    this.score = 0;
    this.kills = 0; this.eaten = 0; this.splits = 0; this.deaths = 0; this.packs = 0;
    this.landmarks = [];
    this.bombs = 0;
    this.bio = 0; this.ep = 0; this.terr = 0; this.trucks = 0; this.outposts = 0;
    this.setArea(START_A);
    this.stun = 0; this.rush = 0; this.boost = false; this.throttle = 1; this.bombCd = 0; this.shield = 0;
    this.combo = 0; this.comboT = 0;
    this.bestR = this.r;
    this.camo = 'none'; this.camoT = 0; this.camoCharge = isPlayer ? 0 : Math.random() * 50;
    this.respawnAt = 0; this.bornAt = 0;
    this.killer = null;
    this.home = null; // casa donde nació (paredes que lo encierran mientras es chico)
    this.team = null; this.truceTeam = null; this.truceUntil = 0;
    this.siege = 0; this.siegeTeam = null;
    this.ai = isPlayer ? null : {
      think: Math.random() * 0.3, desired: new THREE.Vector3(), wander: null, wanderT: 0,
      aggr: 0.3 + Math.random() * 0.7, greed: 0.5 + Math.random() * 0.8, caution: 0.5 + Math.random() * 0.8,
      social: Math.random(), turn: 3 + Math.random() * 3, fleeing: false, pace: 0.72 + Math.random() * 0.22, rejectUntil: 0,
    };
  }
  /** Puede comer y ser comido (fuera del camuflaje o mientras se desvanece) */
  solid() { return this.camo === 'none' || this.camo === 'fade'; }
  alpha() {
    if (this.camo === 'fade') return 1 - this.camoT / CAMO.fade;
    if (this.camo === 'hidden') return 0;
    if (this.camo === 'reveal') return this.camoT / CAMO.reveal;
    return 1;
  }
  setArea(A) { this.A = Math.max(START_A * 0.8, A); this.r = Math.sqrt(this.A); }
  /** El tamaño sale de la biomasa (lo enredado) más el territorio */
  addBio(x) { this.bio = Math.max(0, this.bio + x); }
  recalc(terrArea) { this.terr = terrArea; this.setArea(START_A + this.bio + terrArea * TERR_K); }
  speed() {
    // chiquito = lento en absoluto (pero rápido para su tamaño); grande = lento
    let v = Math.min(9.5 / (1 + 0.075 * this.r), 1.3 + this.r * 6.2);
    // en tus raíces corrés; en las ajenas te enredás; en el mar flotás lento
    const g = grid[idxOf(this.pos)];
    if (g === this.id) v *= 1.2; else if (g > 0 && g < ASH) v *= 0.85; else if (!isLand(this.pos)) v *= 0.85;
    if (this.boost) v *= 1.65;
    if (this.stun > 0) v *= 0.3;
    if (this.rush > 0) v *= 1.35;
    if (this.ai) v *= this.ai.pace;
    if (this.camo === 'hidden') v *= 0.5;
    if (this.camo === 'reveal') v *= 0.3;
    return v;
  }
  spawnAt(p, A = START_A) {
    this.pos.copy(p).normalize();
    this.dir.set(0, 1, 0); tangentize(this.dir, this.pos);
    this.bio = Math.max(0, A - START_A); this.setArea(A); this.alive = true; this.bombs = 0; this.combo = 0; this.stun = 0; this.shield = 3;
    this.camo = 'none'; this.camoT = 0; this.home = null; this.siege = 0; this.siegeTeam = null;
  }
}

/** Aliados: misma manada o tregua recién salidos de una */
export function allied(a, b, now) {
  if (a.team && a.team === b.team) return true;
  if (a.truceTeam && a.truceTeam === b.team && now < a.truceUntil) return true;
  if (b.truceTeam && b.truceTeam === a.team && now < b.truceUntil) return true;
  return false;
}

export function makeBots(n) {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => new Hole({ name: names[i % names.length], color: BOT_COLORS[i % BOT_COLORS.length] }));
}

/** Punto de reaparición lejos de huecos grandes */
export function safeSpawn(holes, preferCity = true) {
  const p = new THREE.Vector3();
  for (let t = 0; t < 30; t++) {
    if (preferCity && Math.random() < 0.8) {
      const c = CITIES[Math.floor(Math.random() * CITIES.length)];
      offsetPoint(c.pos, 2 + Math.random() * 6, Math.random() * 7, p);
      if (!isLand(p)) continue;
    } else randomLand(p);
    let ok = true;
    for (const h of holes) if (h.alive && h.r > 0.6 && surfDist(h.pos, p) < h.r * 3 + 6) { ok = false; break; }
    if (ok) return p;
  }
  return p;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Gira dir hacia desired (ambos tangentes en n) a lo sumo maxAng */
export function steer(dir, desired, n, maxAng) {
  if (desired.lengthSq() < 1e-8) return;
  _a.crossVectors(dir, desired);
  const ang = Math.atan2(_a.dot(n), dir.dot(desired));
  const k = Math.max(-maxAng, Math.min(maxAng, ang));
  _q.setFromAxisAngle(n, k);
  dir.applyQuaternion(_q);
  tangentize(dir, n);
}

/** IA de un hueco */
export function thinkBot(h, game) {
  const ai = h.ai;
  const { holes, world, event, now } = game;
  const des = ai.desired.set(0, 0, 0);
  const flee = _b.set(0, 0, 0);
  let threat = 0;
  let bestScore = 0, bestPos = null, bestHole = null;
  const inHouse = h.home && h.r < WALL_R;

  // ¿cacería en manada?
  let pack = null;
  if (h.team && h.team.members.length > 1) {
    let best = 0;
    for (const o of holes) {
      if (!o.alive || !o.solid() || allied(h, o, now) || o.r <= h.r * HOLE_RATIO) continue;
      const d = surfDist(h.pos, o.pos);
      if (d > 30 + o.r) continue;
      let sum = 0, n = 0;
      for (const m of h.team.members) if (m.alive && m.solid() && surfDist(m.pos, o.pos) < 30 + o.r) { sum += m.A; n++; }
      if (n >= 2 && sum >= o.A * PACK.need * 1.05 && o.A > best) { best = o.A; pack = o; }
    }
  }

  for (const o of holes) {
    if (o === h || !o.alive || o.camo === 'hidden' || allied(h, o, now)) continue;
    const d = surfDist(h.pos, o.pos);
    if (o.camo === 'reveal') {
      if (o.r > h.r * HOLE_RATIO && d < o.r + 2) { threat = 1; flee.addScaledVector(dirTo(h.pos, o.pos, _a), -3); }
      continue;
    }
    if (o === pack) continue;
    if (o.r > h.r * HOLE_RATIO) {
      const danger = o.r * (1.3 + 1.2 * ai.caution) + 1 + h.r * 4;
      if (d < danger) {
        const w = (danger - d) / danger;
        threat = Math.max(threat, w);
        flee.addScaledVector(dirTo(h.pos, o.pos, _a), -w * 2);
      }
      // apuntar como humano: solo si es valiente, está a distancia segura y no está apuntando ya
      if (!ai.aim && h.bombs > 0 && ai.aggr > 0.45 && o.r > Math.max(1.6, h.r * 1.15) && d < 12 + h.r && d > o.r + 3 + h.r
        && Math.random() < 0.2 * ai.aggr + (o === game.leader ? 0.15 : 0)) {
        ai.aim = { o, start: now, until: now + 2.5 };
      }
    } else if (h.r > o.r * HOLE_RATIO * 1.03 && !(o.shield > 0)) {
      if (d < Math.min(16 + h.r * 2, 2 + h.r * 8)) {
        const sc = (o.A * 6 * ai.aggr + (o.isPlayer ? 0.05 : 0)) / (d + 0.5 + h.r);
        if (sc > bestScore) { bestScore = sc; bestPos = o.pos; bestHole = o; }
      }
    }
  }

  const look = Math.min(9 + h.r * 3, 1.2 + h.r * 10);
  world.query(h.pos, look, (o) => {
    if (!o.alive) return;
    if (o.over && o.owner === h) return;
    if (inHouse && surfDist(h.home.pos, o.pos) > h.home.rad - 0.05) return;
    let v;
    if (o.kind === 'seed') { if (h.bombs >= 3) return; v = 0.5 * ai.aggr * Math.min(1, h.r); }
    else {
      if (o.s > h.r * EAT_RATIO) return;
      v = o.s * o.s * (o.kind === 'gold' ? 6 : o.landmark ? 3 : o.kind === 'wall' ? 2 : 1) * ai.greed;
      if (o.over) v *= 0.7; // robarle a otra selva
    }
    const d = surfDist(h.pos, o.pos);
    const sc = v / (d + 0.3 + h.r);
    if (sc > bestScore) { bestScore = sc; bestPos = o.pos; bestHole = null; }
  });

  // leñadores en tu tierra: a enredarlos
  if (h.r > 0.5 && game.trucks) for (const t of game.trucks) {
    if (t.dead) continue;
    const d = surfDist(h.pos, t.pos);
    if (d > look * 1.5) continue;
    const mine = t.target === h.id ? 3 : 1;
    const sc = (0.25 * mine * ai.greed) / (d + 0.3 + h.r);
    if (sc > bestScore) { bestScore = sc; bestPos = t.pos; bestHole = null; }
  }

  if (pack) {
    // rodear el borde de la presa sin meterse
    const d = surfDist(h.pos, pack.pos);
    dirTo(h.pos, pack.pos, des);
    if (d < pack.r + h.r * 0.1) des.negate();
    else if (d < pack.r + h.r * PACK.touch) des.crossVectors(h.pos, des).multiplyScalar(0.6);
  } else if (bestPos) dirTo(h.pos, bestPos, des);
  else {
    const lead = h.team && h.team.members.filter((m) => m.alive && m !== h).sort((a, b) => b.r - a.r)[0];
    if (lead && surfDist(h.pos, lead.pos) > 6 + lead.r * 2) ai.wander = lead.pos;
    else if (event && event.city && surfDist(h.pos, event.city.pos) < R) ai.wander = event.city.pos;
    else if (!ai.wander || now > ai.wanderT || surfDist(h.pos, ai.wander) < 1 + h.r) {
      // buscar tierra que no sea suya para echarle raíces
      let best = null, bs = -1;
      for (let t = 0; t < 10; t++) {
        const q = offsetPoint(h.pos, 3 + h.r * (3 + Math.random() * 6), Math.random() * 7);
        if (!isLand(q)) continue;
        const g = grid[idxOf(q)];
        const sc = (g === h.id ? 0.1 : g > 0 && g < ASH ? 1.3 * ai.aggr + 0.3 : 1) + Math.random() * 0.3;
        if (sc > bs) { bs = sc; best = q; }
      }
      const c = CITIES[Math.floor(Math.random() * CITIES.length)];
      ai.wander = best || (surfDist(h.pos, c.pos) < R * 0.8 && h.r > 0.5 ? c.pos : offsetPoint(h.pos, 3 + h.r * 10, Math.random() * 7));
      ai.wanderT = now + 6 + Math.random() * 6;
    }
    dirTo(h.pos, ai.wander, des);
  }

  if (ai.aim && (now > ai.aim.until || !ai.aim.o.alive || !ai.aim.o.solid() || h.bombs <= 0 || surfDist(h.pos, ai.aim.o.pos) < ai.aim.o.r + 1.5)) ai.aim = null;
  ai.fleeing = threat > 0.15 && !ai.aim;
  if (ai.aim) dirTo(h.pos, ai.aim.o.pos, des); // se da vuelta para encararlo
  else if (ai.fleeing) des.multiplyScalar(0.4).add(flee);
  tangentize(des, h.pos);
  if (h.camo === 'none' && h.camoCharge >= CAMO.charge && h.r > 1.5 && (threat > 0.6 || Math.random() < 0.012 * ai.aggr)) game.startCamo(h);
  h.boost = !ai.aim && h.solid() && h.A > 0.6 && ((threat > 0.45) || (bestHole && surfDist(h.pos, bestHole.pos) < 4 + h.r * 2 && ai.aggr > 0.6) || (pack && surfDist(h.pos, pack.pos) > pack.r + 4));
  void _c;
}
