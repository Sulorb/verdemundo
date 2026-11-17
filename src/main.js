import * as THREE from 'three';
import './style.css';
import { R, R0, setR, CITIES, LANDMARKS, buildLand, surfDist, dirTo, moveOnSphere, tangentize, offsetPoint, isLand } from './geo.js';
import { createGlobe, MAX_HOLES } from './globe.js';
import { World, MOBILE, KINDS, geoTruck, geoSapling } from './objects.js';
import { initTerritory, paint, transfer, area, grid, idxOf, setColor, ignite, fireStep, douse, upload, sampleOwned, LAND_TOTAL, ASH, FIRE, fireCount, isLandCell } from './territory.js';
import { makeTree, placeTree, dropTree } from './trees.js';
import {
  Hole, makeBots, safeSpawn, thinkBot, steer, allied, START_A, GAIN, EAT_RATIO, HOLE_RATIO, MAX_BOMBS, CAMO, WALL_R, TEAM_MAX, PACK,
  titleOf, titleIndex, fmtSize, TITLES, TERR_K,
} from './holes.js';
import { initAudio, sfx } from './audio.js';

const BOT_POOL = 26; // bots que pueden "conectarse"
const $ = (id) => document.getElementById(id);
const TINY = new Set(Object.keys(KINDS).filter((k) => KINDS[k].s < 0.3 && k !== 'seed'));

// ---------- Escena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03040a);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.02, 5000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a5a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
scene.add(sun, sun.target);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

buildLand();
initTerritory();
const globe = createGlobe(scene);
const world = new World(scene);
world.populate();
$('loading').classList.add('hidden');

// ---------- Huecos ----------
const player = new Hole({ name: 'Vos', color: 0xb4ff3a, isPlayer: true });
const offline = makeBots(BOT_POOL);
const holes = [player]; // conectados (el jugador siempre está, vivo o no)
const byId = [];
for (const h of [player, ...offline]) { byId[h.id] = h; setColor(h.id, h.color); }
const landPct = (h) => (area[h.id] / LAND_TOTAL) * 100;
const fmtPct = (x) => (x < 10 ? x.toFixed(1) : Math.round(x)).toString().replace('.', ',') + ' %';
const bioOf = (o) => o.area ?? o.s * o.s * GAIN * (o.g || 1);

const game = {
  holes, world, now: 0, event: null, leader: null, state: 'menu', frenzyUntil: 0, nextEvent: 40,
  throwBomb, startCamo, popTarget: 16, popT: 0, popChange: 0, trucks: [], cleanups: [],
};
const frenzy = () => game.now < game.frenzyUntil;

// ---------- Guardado ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('tm_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tm_' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
const coleccion = new Set(store.get('coleccion', []));
function showRecords() {
  $('records').innerHTML = `Mejor vida: <b>${store.get('best', 0).toLocaleString('es')}</b> pts · Máximo: <b>${titleOf(store.get('bestR', 0))}</b> (${fmtSize(store.get('bestR', 0.14))})<br>Monumentos: <b>${coleccion.size}/${LANDMARKS.length}</b> · Misiones: <b>${store.get('missions', 0)}</b>`;
}
showRecords();
$('name').value = store.get('name', '');
$('city').innerHTML = '<option value="-1">🎲 Nacer en una ciudad al azar</option>' +
  CITIES.map((c, i) => [c, i]).sort((a, b) => a[0].name.localeCompare(b[0].name)).map(([c, i]) => `<option value="${i}">${c.name}</option>`).join('');
$('city').value = store.get('city', '-1');

// ---------- Casas ----------
function homeSpot(city) {
  const p = new THREE.Vector3();
  for (let t = 0; t < 40; t++) {
    const c = city || CITIES[Math.floor(Math.random() * CITIES.length)];
    const rad = 2.2 + c.w * 1.6;
    offsetPoint(c.pos, rad * (0.55 + Math.random() * 0.7), Math.random() * 7, p);
    if (!isLand(p)) continue;
    let ok = true;
    for (const h of holes) if (h.alive && surfDist(h.pos, p) < h.r * 2 + 2.5) { ok = false; break; }
    if (ok) return p;
  }
  return safeSpawn(holes);
}
function spawnInHome(h, city) {
  const p = homeSpot(city);
  h.spawnAt(p);
  h.home = world.buildHome(p, game.now);
  h.bornAt = game.now;
}
/** Distribución de tamaños como en un servidor que ya está andando */
function randomLiveArea() {
  const x = Math.random();
  const r = x < 0.45 ? 0.15 + Math.random() * 0.5 : x < 0.8 ? 0.6 + Math.random() * 1.6 : x < 0.95 ? 2.2 + Math.random() * 3 : 5 + Math.random() * 4;
  return r * r;
}

// ---------- Conexiones simuladas ----------
function connectBot(silent, live = false) {
  if (!offline.length) return;
  const b = offline.splice(Math.floor(Math.random() * offline.length), 1)[0];
  b.score = 0; b.kills = 0; b.eaten = 0; b.splits = 0; b.landmarks = []; b.bestR = 0;
  if (live) { b.spawnAt(safeSpawn(holes), randomLiveArea()); b.score = Math.round(b.A * 400); b.shield = 0; }
  else spawnInHome(b);
  b.camoCharge = Math.random() * 50;
  holes.push(b);
  if (!silent) feed(`🟢 <b style="color:${css(b)}">${b.name}</b> se conectó`);
}
function disconnectBot() {
  const cands = holes.filter((h) => h !== player && h.camo === 'none' && h.team !== player.team);
  if (!cands.length) return;
  const b = cands[Math.floor(Math.random() * cands.length)];
  leaveTeam(b, true);
  holes.splice(holes.indexOf(b), 1);
  b.alive = false;
  witherHole(b);
  offline.push(b);
  const el = labelEls.get(b); if (el) { el.remove(); labelEls.delete(b); }
  feed(`⚪ <b style="color:${css(b)}">${b.name}</b> se desconectó`);
}
function population(dt) {
  game.popT -= dt;
  if (game.popT > 0) return;
  game.popT = 4 + Math.random() * 7;
  if (game.now > game.popChange) { game.popTarget = 9 + Math.floor(Math.random() * 15); game.popChange = game.now + 50 + Math.random() * 60; }
  const n = holes.length - 1;
  if (n < game.popTarget) connectBot(); else if (n > game.popTarget) disconnectBot();
}
let socialT = 0;

// ---------- Territorio ----------
/** La selva muere o se va: su tierra pasa al que la mató (cerca) o queda libre */
function witherHole(h, killer) {
  if (h.home) { game.cleanups.push({ objs: h.home.objs, at: game.now + 20 }); h.home = null; }
  h.ep++;
  transfer(h.id, killer ? killer.id : 0, killer ? killer.pos : null, killer ? killer.r * 3 + 8 : 0, R);
  h.bio = 0;
}
let paintT = 0, fireMis = 0;
function paintAll(dt) {
  paintT -= dt;
  if (paintT > 0) return;
  paintT = 0.1;
  for (const h of holes) {
    if (!h.alive || h.camo === 'hidden') continue;
    const prot = h.team ? h.team.members.filter((m) => m !== h).map((m) => m.id) : null;
    const r = paint(h.pos, h.r * 0.92, h.id, R, -1, prot);
    if (h === player && r.fire) { fireMis += r.fire; if (fireMis > 25) { mission('fire'); fireMis = 0; } }
  }
}
/** Lo enredado cambia de dueño si cambia el dueño de la tierra (por partes, cada cuadro) */
let sweepI = 0;
function sweep() {
  const objs = world.objs;
  const n = Math.min(objs.length, MOBILE ? 1500 : 3000);
  for (let k = 0; k < n; k++) {
    if (sweepI >= objs.length) sweepI = 0;
    const o = objs[sweepI++];
    if (!o.over || !o.alive) continue;
    const g = grid[o.tidx], own = o.owner;
    if (own && own.alive && o.ep === own.ep && (g === own.id || !isLandCell(o.tidx))) continue;
    if (own && o.ep === own.ep) own.addBio(-bioOf(o));
    const nw = byId[g];
    if (nw && nw.alive && nw.r * EAT_RATIO > o.s) { world.overgrow(o, nw); nw.addBio(bioOf(o)); }
    else world.unover(o);
  }
}

// ---------- Leñadores: las ciudades se defienden ----------
const truckMesh = new THREE.InstancedMesh(geoTruck(), new THREE.MeshLambertMaterial({ vertexColors: true }), 40);
truckMesh.frustumCulled = false; truckMesh.count = 40;
const truckFree = [];
const VINE_GREEN = new THREE.Color(0x3f9b35);
const _tm = new THREE.Matrix4(), _tx = new THREE.Vector3(), _tz = new THREE.Vector3(), _ts = new THREE.Vector3(), _tq = new THREE.Quaternion(), _tc = new THREE.Color();
for (let i = 39; i >= 0; i--) { truckFree.push(i); truckMesh.setMatrixAt(i, _tm.makeScale(0, 0, 0)); truckMesh.setColorAt(i, _tc.setHex(0xffffff)); }
scene.add(truckMesh);
const trucks = game.trucks;
let truckT = 3;
function cityRad(c) { return 2.2 + c.w * 1.6; }
function spawnTruck(c, goal, target) {
  const inst = truckFree.pop(); if (inst === undefined) return;
  const pos = offsetPoint(c.pos, Math.random() * cityRad(c) * 0.5, Math.random() * 7);
  const t = { pos, dir: dirTo(pos, goal, new THREE.Vector3()), goal, target, city: c, inst, prog: 0, cutT: 0, life: 0, re: 14, miss: 0 };
  trucks.push(t);
  if (target === player.id && game.state === 'play' && (c.warned || 0) < game.now) {
    c.warned = game.now + 60;
    feed(`🚜 <b>${c.name}</b> manda leñadores contra tu selva`);
    banner(`🚜 ${c.name} manda leñadores: ¡enredalos!`);
  }
}
function removeTruck(t) {
  t.dead = true;
  truckMesh.setMatrixAt(t.inst, _tm.makeScale(0, 0, 0)); truckMesh.instanceMatrix.needsUpdate = true;
  truckFree.push(t.inst);
  trucks.splice(trucks.indexOf(t), 1);
}
function humans(dt) {
  // a los brotes chiquitos y a los que siguen en la maceta no los molestan
  const prot = holes.filter((h) => h.alive && (h.r < 1 || h.home)).map((h) => h.id);
  truckT -= dt;
  if (truckT <= 0) {
    truckT = 2.2;
    const cap = Math.min(40, 8 + holes.length);
    if (trucks.length < cap) {
      const c = CITIES[Math.floor(Math.random() * CITIES.length)];
      if (trucks.filter((t) => t.city === c).length < 2) {
        const q = sampleOwned(c.pos, cityRad(c) * 1.8, -1, R, 14);
        if (q && !prot.includes(grid[idxOf(q)])) spawnTruck(c, q, grid[idxOf(q)]);
      }
    }
  }
  for (let i = trucks.length - 1; i >= 0; i--) {
    const t = trucks[i];
    t.life += dt;
    steer(t.dir, dirTo(t.pos, t.goal, _v2), t.pos, 2.5 * dt);
    moveOnSphere(t.pos, t.dir, 2.3 * dt);
    t.cutT -= dt;
    if (t.cutT <= 0) { t.cutT = 0.25; paint(t.pos, 0.8, 0, R, -1, prot); }
    if (surfDist(t.pos, t.goal) < 0.6 || t.life > t.re) {
      const q = sampleOwned(t.pos, 7, -1, R, 16);
      t.re = t.life + 12;
      if (q && !prot.includes(grid[idxOf(q)])) { t.goal = q; t.target = grid[idxOf(q)]; t.miss = 0; }
      else if (++t.miss > 2 && surfDist(t.pos, t.city.pos) < 1.5) { removeTruck(t); continue; }
      else t.goal = t.city.pos;
    }
    // la selva lo enreda si lo tapa con su copa
    let by = null;
    for (const h of holes) if (h.alive && h.solid() && h.r >= 0.45 && surfDist(h.pos, t.pos) < h.r) { by = h; break; }
    if (by) t.prog += dt; else t.prog = Math.max(0, t.prog - dt);
    if (t.prog > 0.7) {
      by.addBio(0.12 + by.r * 0.01); by.score += 150; by.trucks++;
      ring(t.pos, 2.5, 0x7dff5a, 0.5);
      if (by === player) { popup(t.pos, '🚜 +150', '#ffd23a', 24); sfx.gold(); mission('truck'); }
      removeTruck(t); continue;
    }
    _ts.copy(t.pos);
    _tx.crossVectors(_ts, t.dir).normalize(); // derecha
    _tz.copy(t.dir);
    _tm.makeBasis(_tx, _ts, _tz).scale(_v1.setScalar(0.42)).setPosition(_v3.copy(t.pos).multiplyScalar(R));
    truckMesh.setMatrixAt(t.inst, _tm);
    truckMesh.setColorAt(t.inst, _tc.setHex(0xffffff).lerp(VINE_GREEN, Math.min(1, t.prog / 0.7)));
  }
  truckMesh.instanceMatrix.needsUpdate = true;
  if (truckMesh.instanceColor) truckMesh.instanceColor.needsUpdate = true;
}

// ---------- Brotes (semillas plantadas) ----------
const SAP_CAP = 160;
const sapMesh = new THREE.InstancedMesh(geoSapling(), new THREE.MeshLambertMaterial({ vertexColors: true }), SAP_CAP);
sapMesh.frustumCulled = false; sapMesh.count = SAP_CAP;
const sapFree = [];
for (let i = SAP_CAP - 1; i >= 0; i--) { sapFree.push(i); sapMesh.setMatrixAt(i, _tm.makeScale(0, 0, 0)); sapMesh.setColorAt(i, _tc.setHex(0xffffff)); }
scene.add(sapMesh);
const outposts = [];
let sapT = 0;
function plantOutpost(h, pos) {
  const mine = outposts.filter((b) => b.h === h);
  if (mine.length >= 5) removeOutpost(mine[0]);
  const inst = sapFree.pop(); if (inst === undefined) return;
  const b = { h, ep: h.ep, pos: pos.clone(), rad: 0.9, max: 2 + h.r * 0.7, inst, yaw: Math.random() * 7 };
  outposts.push(b);
  paint(b.pos, b.rad, h.id, R);
  h.outposts++;
  sapMesh.setColorAt(inst, _tc.copy(h.color)); sapMesh.instanceColor.needsUpdate = true;
  ring(pos, 2, h.color.getHex(), 0.5);
  if (h === player) { sfx.landmark(); popup(pos, '🌱', '#7dff5a', 26); mission('outpost'); }
}
function removeOutpost(b) {
  sapMesh.setMatrixAt(b.inst, _tm.makeScale(0, 0, 0)); sapMesh.instanceMatrix.needsUpdate = true;
  sapFree.push(b.inst);
  outposts.splice(outposts.indexOf(b), 1);
}
function updateOutposts(dt) {
  sapT -= dt;
  if (sapT > 0) return;
  sapT = 0.4;
  for (let i = outposts.length - 1; i >= 0; i--) {
    const b = outposts[i];
    if (!b.h.alive || b.ep !== b.h.ep || grid[idxOf(b.pos)] !== b.h.id) {
      if (b.h === player && game.state === 'play') feed('🪓 Te cortaron un brote');
      removeOutpost(b); continue;
    }
    b.rad = Math.min(b.max, b.rad + 0.1);
    paint(b.pos, b.rad, b.h.id, R);
    _tq.setFromUnitVectors(_Y, b.pos);
    _tm.compose(_v3.copy(b.pos).multiplyScalar(R), _tq, _v1.setScalar(0.35 + b.rad * 0.22));
    sapMesh.setMatrixAt(b.inst, _tm);
  }
  sapMesh.instanceMatrix.needsUpdate = true;
}
const _Y = new THREE.Vector3(0, 1, 0);

// ---------- Árboles madre ----------
const treeOf = new Map();
function trees(dt) {
  for (const h of byId) {
    if (!h) continue;
    let t = treeOf.get(h);
    const show = h.alive && holes.includes(h);
    if (!t) { if (!show) continue; t = makeTree(scene, h.color); treeOf.set(h, t); }
    if (!show) { t.g.visible = false; continue; }
    placeTree(t, h, dt, !!(h.home && h.r < WALL_R));
  }
}

// ---------- Casas abandonadas ----------
function cleanups() {
  for (let i = game.cleanups.length - 1; i >= 0; i--) {
    const c = game.cleanups[i];
    if (game.now < c.at) continue;
    world.removeObjs(c.objs);
    game.cleanups.splice(i, 1);
  }
  for (const o of world.partial) {
    if (game.now - (o.progT || 0) > 1.2) { world.paintColor(o, o.over ? 1 : 0); o.prog = 0; world.partial.delete(o); }
  }
}

// ---------- El planeta crece con los jugadores ----------
let builtR = R, topT = 0;
function worldScale(dt) {
  const target = R0 * Math.min(1.45, Math.max(0.75, Math.sqrt(holes.length / 16)));
  setR(R + (target - R) * Math.min(1, dt * 0.15));
  if (Math.abs(R - builtR) > 0.25) {
    builtR = R;
    globe.globe.scale.setScalar(R / R0); globe.atm.scale.setScalar(R / R0);
    world.factor = (R / R0) ** 2;
    world.rebuild();
  }
  topT -= dt;
  if (topT <= 0) { topT = 1; world.topUp(holes); }
}

// ---------- Manadas ----------
const TEAM_ICONS = ['🔷', '🔶', '⭐', '💠', '🍀', '🔥', '🌙', '⚡', '🎯', '🌸', '🦈', '🐺'];
let teamSeq = 0;
const teams = new Set();
function makeTeam(members) {
  const t = { id: ++teamSeq, icon: TEAM_ICONS[teamSeq % TEAM_ICONS.length], members: [] };
  teams.add(t);
  for (const m of members) joinTeam(m, t);
  return t;
}
function joinTeam(h, t) {
  if (h.team === t) return;
  if (h.team) leaveTeam(h, true);
  t.members.push(h); h.team = t;
  if (h === player) mission('team');
}
function leaveTeam(h, silent) {
  const t = h.team; if (!t) return;
  t.members.splice(t.members.indexOf(h), 1);
  h.team = null; h.truceTeam = t; h.truceUntil = game.now + 5;
  if (!silent && t.members.includes(player)) feed(`💔 <b style="color:${css(h)}">${h.name}</b> dejó tu alianza (5 s de tregua)`);
  if (t.members.length <= 1) {
    for (const m of t.members) { m.team = null; m.truceTeam = t; m.truceUntil = game.now + 5; }
    if (t.members.includes(player) && !silent) feed('Tu alianza se disolvió');
    t.members = []; teams.delete(t);
  }
}
const inviteRange = (b) => 4 + player.r * 4 + b.r;
function canTeam(a, b) {
  if (allied(a, b, game.now) || !b.alive || !a.alive) return false;
  const roomA = a.team ? a.team.members.length < TEAM_MAX : true;
  const roomB = b.team ? b.team.members.length < TEAM_MAX : true;
  if (a.team && b.team) return false;
  return (a.team ? roomA : true) && (b.team ? roomB : true);
}
function nearestInvitable() {
  let best = null, bd = Infinity;
  for (const b of holes) {
    if (b === player || !b.solid() || !canTeam(player, b) || b.ai.rejectUntil > game.now) continue;
    const d = surfDist(player.pos, b.pos);
    if (d < inviteRange(b) && d < bd) { bd = d; best = b; }
  }
  return best;
}
function teamUp(a, b) {
  if (a.team) joinTeam(b, a.team);
  else if (b.team) joinTeam(a, b.team);
  else makeTeam([a, b]);
}
let asking = null; // invitación del jugador esperando respuesta
function playerTeamAction() {
  if (game.state !== 'play' || !player.alive) return;
  if (game.incoming && game.incoming.until > game.now && canTeam(player, game.incoming.b)) {
    const b = game.incoming.b; game.incoming = null;
    teamUp(b, player);
    banner(`🤝 Te uniste con ${b.name} ${player.team.icon}`); sfx.level();
    return;
  }
  const b = nearestInvitable();
  if (!b) { banner('🤝 Acercate a una selva para invitarla'); return; }
  if (asking) return;
  asking = { b, at: game.now + 0.9 };
  popup(b.pos, '🤝?', '#4da3ff', 22);
}
function resolveAsk() {
  if (!asking || game.now < asking.at) return;
  const b = asking.b; asking = null;
  if (!canTeam(player, b)) return;
  const ratio = b.r / player.r;
  let p = ratio > 2.2 ? 0.12 : ratio > 1.5 ? 0.35 : 0.72;
  if (b.ai.fleeing) p += 0.2;
  if (b.team) p *= 0.8;
  p *= 0.6 + b.ai.social * 0.6;
  if (Math.random() < p) {
    teamUp(player, b);
    banner(`🤝 ${b.name} se unió a tu alianza ${player.team.icon}`); sfx.level();
  } else {
    b.ai.rejectUntil = game.now + 20;
    banner(`🙅 ${b.name} no quiso`);
  }
}
/** Los bots arman y rompen manadas solos, y a veces te invitan */
function botSocial() {
  const bots = holes.filter((h) => h !== player && h.alive && h.solid());
  if (bots.length > 1 && teams.size < 5 && Math.random() < 0.5) {
    const a = bots[Math.floor(Math.random() * bots.length)];
    for (const b of bots) {
      if (a === b || !canTeam(a, b)) continue;
      const ratio = Math.max(a.r, b.r) / Math.min(a.r, b.r);
      if (ratio < 2.2 && surfDist(a.pos, b.pos) < 60 + a.r * 4 && a.ai.social + b.ai.social > 0.7) {
        teamUp(a, b);
        if (nearPlayer(a.pos, 40)) feed(`🤝 <b style="color:${css(a)}">${a.name}</b> y <b style="color:${css(b)}">${b.name}</b> armaron alianza ${a.team.icon}`);
        break;
      }
    }
  }
  // traiciones (raras)
  if (Math.random() < 0.03) {
    const inTeam = bots.filter((b) => b.team && b.ai.social < 0.4);
    if (inTeam.length) leaveTeam(inTeam[Math.floor(Math.random() * inTeam.length)]);
  }
  // un bot te invita
  if (game.state === 'play' && player.alive && !game.incoming && !player.home && Math.random() < 0.25) {
    for (const b of bots) {
      if (!canTeam(player, b) || b.ai.social < 0.45) continue;
      const ratio = Math.max(b.r, player.r) / Math.min(b.r, player.r);
      if (ratio < 1.7 && surfDist(player.pos, b.pos) < 10 + player.r * 6) {
        game.incoming = { b, until: game.now + 9 };
        sfx.event();
        break;
      }
    }
  }
}

// ---------- Cacería en manada ----------
const touching = [];
function packHunt(dt) {
  for (const T of holes) {
    if (!T.alive || !T.solid()) { T.siege = 0; continue; }
    let best = null, bestSum = 0;
    for (const t of teams) {
      if (t === T.team) continue;
      let sum = 0, n = 0;
      for (const m of t.members) {
        if (!m.alive || !m.solid() || allied(m, T, game.now)) continue;
        if (surfDist(m.pos, T.pos) < T.r + m.r * PACK.touch) { sum += m.A; n++; }
      }
      if (n >= 2 && sum >= T.A * PACK.need && sum > bestSum) { best = t; bestSum = sum; }
    }
    if (best) {
      if (T.siegeTeam !== best) { T.siegeTeam = best; T.siege = 0; if (T === player) { banner('🌿 ¡Una alianza te está enredando! ¡Escapá!'); sfx.warn(); } }
      T.siege += dt;
      if (T.siege >= PACK.time) packEat(best, T);
    } else {
      T.siege = Math.max(0, T.siege - dt * 0.6);
      if (T.siege === 0) T.siegeTeam = null;
    }
  }
}
function packEat(t, T) {
  touching.length = 0;
  for (const m of t.members) if (m.alive && m.solid() && surfDist(m.pos, T.pos) < T.r + m.r * PACK.touch) touching.push(m);
  const sum = touching.reduce((s, m) => s + m.A, 0) || 1;
  const pts = (300 + Math.round(T.A * 40)) * (frenzy() ? 2 : 1);
  for (const m of touching) {
    const k = m.A / sum;
    m.addBio(T.A * 0.45 * k);
    m.score += Math.round(pts * k); m.kills++; m.packs++;
    if (m === player) { popup(m.pos, `🌿 +${Math.round(pts * k)}`, '#4da3ff', 30); mission('pack'); mission('kill'); }
  }
  T.siege = 0; T.siegeTeam = null;
  killHole(T, touching[0], `🌿 La alianza ${t.icon} (${touching.map((m) => m.name).join(', ')}) enredó a <b style="color:${css(T)}">${T.name}</b>`);
  if (touching.includes(player)) { banner(`🌿 ¡ENREDADERA EN ALIANZA! Cayó ${T.name}`); sfx.landmark(); shake = 0.6; }
}

// ---------- Camuflaje ----------
function startCamo(h) {
  if (!h.alive || h.camo !== 'none' || h.camoCharge < CAMO.charge) return;
  h.camo = 'fade'; h.camoT = 0; h.boost = false;
  if (h === player) { banner('🌱 Echando raíces… (todavía te pueden absorber)'); sfx.camo(); }
}
function updateCamo(h, dt) {
  if (h.camo === 'none') { h.camoCharge = Math.min(CAMO.charge, h.camoCharge + dt); return; }
  h.camoT += dt;
  if (h.camo === 'fade' && h.camoT >= CAMO.fade) { h.camo = 'hidden'; h.camoT = 0; if (h === player) banner('🌱 ¡Bajo tierra! Esperá a tus presas'); }
  else if (h.camo === 'hidden' && h.camoT >= CAMO.hidden) {
    h.camo = 'reveal'; h.camoT = 0;
    if (h === player) { banner('⚠️ Brotando… ¡todos te ven venir!'); sfx.warn(); }
    else if (nearPlayer(h.pos, h.r + 25)) { feed('⚠️ Algo está por brotar cerca'); sfx.warn(); }
  } else if (h.camo === 'reveal' && h.camoT >= CAMO.reveal) {
    h.camo = 'none'; h.camoCharge = 0;
    ring(h.pos, h.r * 2.5 + 1, 0xff3b2f, 0.6);
    if (nearPlayer(h.pos, h.r + 30)) { sfx.hole(); shake = Math.max(shake, 0.4); }
  }
}

// ---------- Misiones ----------
const MISSION_POOL = [
  { id: 'tiny', txt: 'Enredá {n} cositas', type: 'eat', f: (k) => TINY.has(k), n: [40, 80] },
  { id: 'car', txt: 'Enredá {n} carros', type: 'eat', f: (k) => k === 'car', n: [15, 30] },
  { id: 'person', txt: 'Enredá {n} personas', type: 'eat', f: (k) => k === 'person', n: [20, 40] },
  { id: 'house', txt: 'Enredá {n} casas', type: 'eat', f: (k) => k === 'house', n: [10, 25], minR: 0.6 },
  { id: 'building', txt: 'Enredá {n} edificios', type: 'eat', f: (k) => k === 'building', n: [8, 16], minR: 1 },
  { id: 'tower', txt: 'Enredá {n} rascacielos', type: 'eat', f: (k) => k === 'tower', n: [3, 6], minR: 1.8 },
  { id: 'gold', txt: 'Juntá {n} gotas 💧', type: 'eat', f: (k) => k === 'gold', n: [5, 10] },
  { id: 'kill', txt: 'Absorbé {n} selva(s)', type: 'kill', n: [1, 2] },
  { id: 'split', txt: 'Pegale una semilla a una selva 🌰', type: 'split', n: [1, 1], minR: 0.4 },
  { id: 'outpost', txt: 'Plantá {n} brotes 🌱', type: 'outpost', n: [2, 4], minR: 0.4 },
  { id: 'truck', txt: 'Enredá {n} leñadores 🚜', type: 'truck', n: [1, 3], minR: 0.5 },
  { id: 'fire', txt: 'Apagá un incendio 🔥', type: 'fire', n: [1, 1], minR: 0.6 },
  { id: 'terr', txt: 'Cubrí el {p} del planeta', type: 'terr' },
  { id: 'landmark', txt: 'Enredá un monumento 🏛️', type: 'landmark', n: [1, 1], minR: 3 },
  { id: 'team', txt: 'Armá una alianza 🤝', type: 'team', n: [1, 1] },
  { id: 'pack', txt: 'Enredá en alianza 🌿', type: 'pack', n: [1, 1], minR: 0.4 },
  { id: 'combo', txt: 'Hacé un combo de {n}', type: 'combo', n: [25, 50] },
  { id: 'size', txt: 'Llegá a {t}', type: 'size' },
];
const missions = [];
function newMission() {
  const used = new Set(missions.map((m) => m.id));
  const cands = MISSION_POOL.filter((m) => !used.has(m.id) && (!m.minR || player.r >= m.minR * 0.7));
  const t = cands[Math.floor(Math.random() * cands.length)];
  if (t.type === 'terr') {
    const goal = Math.max(0.3, Math.ceil(landPct(player) * 1.6 * 10 + 1) / 10);
    return { ...t, goal, txt: t.txt.replace('{p}', fmtPct(goal)), prog: 0 };
  }
  if (t.type === 'size') {
    const ti = Math.min(TITLES.length - 1, titleIndex(player.r) + 1);
    return { ...t, goal: TITLES[ti][0], txt: t.txt.replace('{t}', TITLES[ti][1]), prog: 0 };
  }
  const goal = t.n[0] + Math.floor(Math.random() * (t.n[1] - t.n[0] + 1));
  return { ...t, goal, txt: t.txt.replace('{n}', goal), prog: 0 };
}
function resetMissions() { missions.length = 0; for (let i = 0; i < 3; i++) missions.push(newMission()); }
function mission(type, kind, n = 1) {
  if (game.state !== 'play') return;
  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    if (m.type !== type) continue;
    if (type === 'eat' && !m.f(kind)) continue;
    if (type === 'combo' || type === 'size' || type === 'terr') m.prog = Math.max(m.prog, n); else m.prog += n;
    if (m.prog >= m.goal) {
      const reward = 250 + Math.round(player.A * 60);
      player.score += reward;
      player.addBio(player.A * 0.1);
      banner(`✅ ${m.txt}  +${reward} y +10 % tamaño`); sfx.level();
      store.set('missions', store.get('missions', 0) + 1);
      missions[i] = newMission();
    }
  }
}

// ---------- Bombas ----------
const projectiles = [];
const bombGeo = new THREE.SphereGeometry(0.5, 12, 10);
const bombMat = new THREE.MeshLambertMaterial({ color: 0xb5651d, emissive: 0x3a1a00 });
const rings = [];
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);

function throwBomb(h, dir) {
  if (h.bombs <= 0 || h.bombCd > game.now || !h.alive || !h.solid()) return;
  h.bombs--; h.bombCd = game.now + 0.5;
  const p = { owner: h, pos: h.pos.clone(), dir: dir.clone(), travelled: 0, max: 14 + h.r * 2.5, mesh: new THREE.Mesh(bombGeo, bombMat) };
  tangentize(p.dir, p.pos);
  moveOnSphere(p.pos, p.dir, h.r * 0.9 + 0.2);
  p.mesh.scale.setScalar(0.35 + Math.min(1.2, h.r * 0.15));
  scene.add(p.mesh);
  projectiles.push(p);
  if (nearPlayer(h.pos, 30)) sfx.throw();
}

function ring(pos, size, color, dur = 0.7) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.position.copy(pos).multiplyScalar(R + 0.03);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos);
  scene.add(m);
  rings.push({ m, t: 0, dur, size });
}

function explode(p, target) {
  const o = p.owner;
  ring(p.pos, 2 + (target ? target.r * 2 : 0), o.color.getHex());
  if (nearPlayer(p.pos, 40)) { sfx.boom(); shake = Math.max(shake, 0.3); }
  if (!target) { if (isLand(p.pos) && o.alive) plantOutpost(o, p.pos); return; }
  // la semilla brota encima de la otra selva: la enreda y le roba raíces alrededor de su copa.
  // todo depende del tamaño del que la tira: un brote apenas le hace cosquillas a una jungla
  target.stun = 0.4 + Math.min(1, o.r / target.r);
  const frac = Math.max(0.02, Math.min(0.25, 0.25 * (o.r / target.r) * 1.5));
  const lost = target.bio * frac;
  target.addBio(-lost); o.addBio(lost * 0.5);
  paint(target.pos, target.r + 1 + o.r * 0.8, o.id, R, target.id);
  target.splits++; o.splits++;
  const pts = 100 + Math.round(lost * 25);
  o.score += pts;
  feed(`🌰 <b style="color:${css(o)}">${o.name}</b> enredó a <b style="color:${css(target)}">${target.name}</b>`);
  if (o === player) { popup(player.pos, `🌰 +${pts}`, '#c8ff5a'); banner(`🌰 ¡Le robaste ${Math.round(frac * 100)} % a ${target.name}!`); mission('split'); }
  if (target === player) banner(`🌰 ${o.name} te robó ${Math.round(frac * 100)} %`);
}

// ---------- Input ----------
const input = { mx: innerWidth / 2, my: innerHeight / 2 - 80, keys: new Set(), boostBtn: false, rmb: false };
const joy = { id: null, bx: 0, by: 0, x: 0, y: 0 };
const JOY_R = 55;
function joyShow() {
  $('joy').style.display = joy.id === null ? 'none' : 'block';
  $('joy').style.left = joy.bx + 'px'; $('joy').style.top = joy.by + 'px';
  $('knob').style.transform = `translate(${joy.x}px, ${joy.y}px)`;
}
addEventListener('pointermove', (e) => {
  input.mx = e.clientX; input.my = e.clientY;
  if (e.pointerId !== joy.id) return;
  let x = e.clientX - joy.bx, y = e.clientY - joy.by; const l = Math.hypot(x, y);
  if (l > JOY_R) { x *= JOY_R / l; y *= JOY_R / l; }
  joy.x = x; joy.y = y; joyShow();
});
const joyEnd = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyShow(); } if (e.button === 2) input.rmb = false; };
addEventListener('pointerup', joyEnd); addEventListener('pointercancel', joyEnd);
renderer.domElement.addEventListener('pointerdown', (e) => {
  input.mx = e.clientX; input.my = e.clientY;
  if (e.pointerType === 'touch') { if (joy.id === null) { joy.id = e.pointerId; joy.bx = e.clientX; joy.by = e.clientY; joy.x = joy.y = 0; joyShow(); } return; }
  if (e.button === 0 && game.state === 'play') throwBomb(player, playerAimDir());
  if (e.button === 2) input.rmb = true;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  input.keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    if (game.state === 'play') throwBomb(player, playerAimDir());
    else if (game.state === 'dead') revive(false);
  }
  if (e.code === 'KeyE' && game.state === 'play') startCamo(player);
  if (e.code === 'KeyT') playerTeamAction();
  if (e.code === 'KeyQ' && player.team) { leaveTeam(player); banner('Saliste de la alianza (5 s de tregua)'); }
});
addEventListener('keyup', (e) => input.keys.delete(e.code));
const tapBtn = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
tapBtn('btnBomb', () => game.state === 'play' && throwBomb(player, playerAimDir()));
tapBtn('btnCamo', () => game.state === 'play' && startCamo(player));
tapBtn('btnTeam', playerTeamAction);
tapBtn('teamLeave', () => { if (player.team) { leaveTeam(player); banner('Saliste de la alianza (5 s de tregua)'); } });
tapBtn('inviteBox', playerTeamAction);
tapBtn('btnBoost', () => { input.boostBtn = true; });
$('btnBoost').addEventListener('pointerup', () => { input.boostBtn = false; });
$('btnBoost').addEventListener('pointerleave', () => { input.boostBtn = false; });

const camF = new THREE.Vector3(0, 1, 0);
let camH = 3, shake = 0;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _cr = new THREE.Vector3(), _cu = new THREE.Vector3();
const _proj = new THREE.Vector3();

function toScreen(v, out = { x: 0, y: 0, ok: false }) {
  _proj.copy(v).project(camera);
  out.x = (_proj.x * 0.5 + 0.5) * innerWidth;
  out.y = (-_proj.y * 0.5 + 0.5) * innerHeight;
  out.ok = _proj.z < 1;
  return out;
}
function screenToWorldDir(dx, dy, out) {
  _cr.setFromMatrixColumn(camera.matrixWorld, 0);
  _cu.setFromMatrixColumn(camera.matrixWorld, 1);
  out.copy(_cr).multiplyScalar(dx).addScaledVector(_cu, -dy);
  return tangentize(out, player.pos);
}
const aim = new THREE.Vector3();
function playerAimDir() { return aim.lengthSq() > 0 ? aim : player.dir; }

function readPlayerInput() {
  let dx = 0, dy = 0, kb = false;
  const k = input.keys;
  if (k.has('KeyW') || k.has('ArrowUp')) { dy -= 1; kb = true; }
  if (k.has('KeyS') || k.has('ArrowDown')) { dy += 1; kb = true; }
  if (k.has('KeyA') || k.has('ArrowLeft')) { dx -= 1; kb = true; }
  if (k.has('KeyD') || k.has('ArrowRight')) { dx += 1; kb = true; }
  let throttle = 1;
  if (!kb) {
    if (MOBILE || joy.id !== null) {
      dx = joy.x; dy = joy.y;
      throttle = joy.id === null ? 0 : Math.min(1, Math.hypot(dx, dy) / (JOY_R * 0.8));
    } else {
      const s = toScreen(_v1.copy(player.pos).multiplyScalar(R));
      dx = input.mx - s.x; dy = input.my - s.y;
      const len = Math.hypot(dx, dy);
      throttle = Math.min(1, Math.max(0, (len - 12) / (Math.min(innerWidth, innerHeight) * 0.16)));
    }
  }
  if (dx === 0 && dy === 0) { player.throttle = 0; return; }
  screenToWorldDir(dx, dy, aim);
  if (throttle > 0.02) steer(player.dir, aim, player.pos, 0.6);
  player.throttle = throttle;
  player.boost = (k.has('ShiftLeft') || k.has('ShiftRight') || input.rmb || input.boostBtn) && player.A > 0.36;
}

// ---------- HUD ----------
const css = (h) => '#' + h.color.getHexString();
const tag = (h) => (h.team ? h.team.icon + ' ' : '');
const labelEls = new Map();
function labelFor(h) {
  let el = labelEls.get(h);
  if (!el) { el = document.createElement('div'); el.className = 'lbl'; $('labels').appendChild(el); labelEls.set(h, el); }
  return el;
}
const arrowEls = [];
function arrowEl(i) {
  while (arrowEls.length <= i) { const a = document.createElement('div'); a.className = 'arw'; a.innerHTML = '<span></span>'; $('arrows').appendChild(a); arrowEls.push(a); }
  return arrowEls[i];
}
function feed(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  const f = $('feed'); f.prepend(d);
  while (f.children.length > 6) f.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
function popup(pos, text, color = '#fff', size = 20) {
  const s = toScreen(_v3.copy(pos).multiplyScalar(R));
  const d = document.createElement('div');
  d.className = 'pop'; d.textContent = text; d.style.color = color; d.style.fontSize = size + 'px';
  d.style.left = (s.x + (Math.random() - 0.5) * 60) + 'px'; d.style.top = (s.y - 30) + 'px';
  $('popups').appendChild(d);
  setTimeout(() => d.remove(), 900);
}
let bannerQ = [], bannerBusy = 0;
function banner(text) { bannerQ.push(text); if (bannerQ.length > 3) bannerQ.shift(); }
function bannerTick(dt) {
  bannerBusy -= dt;
  if (bannerBusy > 0 || !bannerQ.length) return;
  const b = $('banner'); b.textContent = bannerQ.shift(); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  bannerBusy = 1.4;
}
let pending = 0, pendingT = 0;

function updateBoard() {
  const list = holes.filter((h) => h.alive).sort((a, b) => b.A - a.A);
  const rows = list.slice(0, MOBILE ? 4 : 8);
  if (player.alive && !rows.includes(player)) rows.push(player);
  $('board').innerHTML = rows.map((h) => {
    const pos = list.indexOf(h) + 1;
    const mate = h !== player && player.team && h.team === player.team;
    return `<div class="row ${h === player ? 'me' : mate ? 'mate' : ''}"><span>${pos}.</span><span class="dot" style="background:${css(h)}"></span><span class="nm">${h === game.leader ? '👑 ' : ''}${tag(h)}${h.name}</span><span class="pt">${fmtPct(landPct(h))}</span></div>`;
  }).join('');
  $('missions').innerHTML = missions.map((m) => {
    const p = m.type === 'size' ? Math.min(1, player.r / m.goal) : Math.min(1, m.prog / m.goal);
    const txt = m.type === 'size' || m.type === 'terr' ? '' : ` ${Math.min(m.prog, m.goal)}/${m.goal}`;
    return `<div class="mis"><span>${m.txt}${txt}</span><i style="width:${p * 100}%"></i></div>`;
  }).join('');
}

function fmtTime(t) { return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; }

function updateMeHud() {
  $('score').textContent = Math.round(player.score).toLocaleString('es');
  const mult = comboMult(player);
  const c = $('combo');
  c.textContent = player.combo >= 3 ? `COMBO ${player.combo}${mult > 1 ? `  ×${mult}` : ''}` : '';
  c.classList.toggle('hot', mult >= 3);
  $('mons').textContent = `🌍 ${fmtPct(landPct(player))} del planeta · 🏛️ ${coleccion.size}/${LANDMARKS.length}`;
  const ti = titleIndex(player.r);
  $('title').textContent = `${TITLES[ti][1]} · ${fmtSize(player.r)}`;
  const lo = TITLES[ti][0], hi = TITLES[ti + 1] ? TITLES[ti + 1][0] : lo * 1.5 + 5;
  $('barFill').style.width = Math.min(100, ((player.r - lo) / (hi - lo)) * 100) + '%';
  const ready = player.camo === 'none' && player.camoCharge >= CAMO.charge;
  const camoTxt = player.camo !== 'none' ? '🌱 activo' : ready ? `🌱 LISTO${MOBILE ? '' : ' (E)'}` : `🌱 ${Math.ceil(CAMO.charge - player.camoCharge)} s`;
  $('bombs').textContent = '🌰'.repeat(player.bombs) + '◦'.repeat(MAX_BOMBS - player.bombs) + '   ' + camoTxt;
  const bc = $('btnCamo');
  bc.classList.toggle('ready', ready);
  bc.style.setProperty('--p', player.camo !== 'none' ? 100 : (player.camoCharge / CAMO.charge) * 100);
  $('btnBomb').dataset.n = player.bombs;
  const cs = $('camoState');
  let st = '';
  if (player.home && player.r < WALL_R) st = `🪴 Enredá los muebles para crecer (${fmtSize(player.r)} / ${fmtSize(WALL_R)})`;
  else if (player.home) st = '🌿 ¡Tus raíces ya rompen las paredes! Salí a la calle';
  else if (player.siege > 0) st = `🌿 ¡Te están enredando! ${Math.round((player.siege / PACK.time) * 100)}%`;
  else if (player.camo !== 'none') st = player.camo === 'fade' ? `🌱 Echando raíces… ${Math.ceil(CAMO.fade - player.camoT)}`
    : player.camo === 'hidden' ? `🌱 Bajo tierra · ${Math.ceil(CAMO.hidden - player.camoT)} s` : `⚠️ Brotás en ${Math.ceil(CAMO.reveal - player.camoT)}`;
  cs.classList.toggle('hidden', !st || !player.alive);
  cs.classList.toggle('warn', player.camo === 'reveal' || player.siege > 0);
  cs.textContent = st;
  $('pop').textContent = `🌍 ${holes.length} jugando · ⌀ ${Math.round(12742 * R / R0).toLocaleString('es')} km`;
  $('timer').textContent = player.alive ? `⏱️ ${fmtTime(game.now - player.bornAt)}` : '';
  $('frenzy').classList.toggle('hidden', !frenzy());
  if (frenzy()) $('frenzy').textContent = `🌸 PRIMAVERA ×2 · ${Math.ceil(game.frenzyUntil - game.now)} s`;
  // manada
  const tp = $('team');
  if (player.team) {
    tp.classList.remove('hidden');
    $('teamList').innerHTML = `<b>${player.team.icon} Tu alianza</b>` + player.team.members.map((m) =>
      `<div><span class="dot" style="background:${css(m)}"></span>${m === player ? 'Vos' : m.name} · ${m.alive ? fmtSize(m.r) : '💀'}</div>`).join('');
  } else tp.classList.add('hidden');
  // invitación
  const ib = $('inviteBox');
  const inc = game.incoming && game.incoming.until > game.now && canTeam(player, game.incoming.b) ? game.incoming.b : null;
  const near = !inc && nearestInvitable();
  if (inc) { ib.innerHTML = `🤝 <b style="color:${css(inc)}">${inc.name}</b> te invita a su alianza · <u>${MOBILE ? 'tocá aquí' : 'T'}</u> (${Math.ceil(game.incoming.until - game.now)})`; ib.className = 'hot'; }
  else if (near) { ib.innerHTML = `🤝 Invitar a <b style="color:${css(near)}">${near.name}</b> · <u>${MOBILE ? 'tocá aquí' : 'T'}</u>`; ib.className = ''; }
  else ib.className = 'hidden';
  $('btnTeam').classList.toggle('ready', !!(inc || near));
}

function comboMult(h) { return Math.min(5, 1 + Math.floor(h.combo / 8)) * (frenzy() ? 2 : 1); }

// ---------- Enredar ----------
const toEat = [], toGrow = [];
let lastTitle = 0;
function eatObjects(h, dt) {
  toEat.length = 0; toGrow.length = 0;
  world.query(h.pos, h.r + 1, (o) => {
    if (!o.alive) return;
    const d = surfDist(h.pos, o.pos);
    if (o.kind === 'seed') { if (d < h.r + 0.15 && h.bombs < MAX_BOMBS) toEat.push(o); return; }
    if (o.kind === 'gold') { if (d < h.r + 0.15) toEat.push(o); return; }
    if (o.over && o.owner === h) return;
    if (o.s < h.r * EAT_RATIO && d + o.s * 0.4 < h.r) toGrow.push(o);
  });
  for (const o of toEat) {
    if (!o.alive) continue;
    world.kill(o, h);
    if (o.kind === 'seed') { h.bombs++; if (h === player) { sfx.bombPick(); popup(h.pos, '🌰', '#d9a066', 26); } continue; }
    h.addBio(o.s * o.s * GAIN * 4); h.rush = 3;
    const pts = o.pts * comboMult(h); h.score += pts;
    if (h === player) { sfx.gold(); popup(h.pos, `💧 +${pts}`, '#6ec6ff', 26); mission('eat', o.kind); }
  }
  const sp = frenzy() ? 2 : 1;
  for (const o of toGrow) {
    if (o.progOwner !== h || game.now - (o.progT || 0) > 1.2) { o.prog = 0; o.progOwner = h; }
    o.progT = game.now;
    o.prog += (dt * sp) / (0.1 + o.s * 0.45);
    if (o.prog < 1) { world.progress(o, o.prog); continue; }
    claim(o, h);
  }
  if (h === player) {
    const ti = titleIndex(h.r);
    if (ti > lastTitle) { banner(`¡Ahora sos ${TITLES[ti][1].toUpperCase()}!`); sfx.level(); }
    lastTitle = Math.max(lastTitle, ti);
    mission('size', null, h.r);
    mission('terr', null, landPct(h));
  }
}
function claim(o, h) {
  if (o.over && o.owner && o.ep === o.owner.ep) o.owner.addBio(-bioOf(o));
  if (isLandCell(o.tidx)) paint(o.pos, 0.3 + o.s * 0.5, h.id, R);
  world.overgrow(o, h);
  h.addBio(bioOf(o));
  h.combo = h.comboT > 0 ? h.combo + 1 : 1;
  h.comboT = 1.6;
  const pts = o.pts * comboMult(h);
  h.score += pts; h.eaten++;
  if (o.landmark) {
    h.landmarks.push(o.landmark.name);
    feed(`🏛️ <b style="color:${css(h)}">${h.name}</b> enredó ${o.landmark.name}`);
  }
  if (h === player) {
    pending += pts;
    sfx.eat(h.combo, o.s * 3);
    mission('eat', o.kind); mission('combo', null, h.combo);
    if (o.kind === 'wall' && h.home) shake = 0.15;
    if (o.landmark) {
      sfx.landmark(); shake = 0.5; mission('landmark');
      const nuevo = !coleccion.has(o.landmark.name);
      coleccion.add(o.landmark.name); store.set('coleccion', [...coleccion]);
      banner(`¡${o.landmark.name} es tuyo! +${pts}${nuevo ? '  ⭐ NUEVO' : ''}`);
    }
  }
}

function killHole(small, killer, msg) {
  small.alive = false; small.deaths++; small.killer = killer;
  witherHole(small, killer);
  small.respawnAt = game.now + 3 + Math.random() * 3;
  small.siege = 0;
  ring(small.pos, small.r * 3 + 1, small.color.getHex(), 0.6);
  feed(msg);
  if (small === player) die(killer);
}
function eatHole(big, small) {
  const bonus = small === game.leader ? 500 : 0;
  const pts = (150 + Math.round(small.A * 30) + bonus) * (frenzy() ? 2 : 1);
  big.addBio(small.A * 0.35);
  big.score += pts; big.kills++;
  if (big === player) { sfx.hole(); popup(big.pos, `🌳 +${pts}`, '#5dff8f', 28); mission('kill'); if (bonus) banner(`👑 ¡Absorbiste a la líder ${small.name}!`); }
  killHole(small, big, `🌳 <b style="color:${css(big)}">${tag(big)}${big.name}</b> absorbió a <b style="color:${css(small)}">${small.name}</b>${bonus ? ' 👑' : ''}`);
}

// ---------- Estados ----------
function startGame() {
  resetMissions();
  spawnPlayer(+$('city').value);
  game.state = 'play';
  $('hud').classList.remove('hidden');
  ['start', 'dead'].forEach((id) => $(id).classList.add('hidden'));
  banner('🪴 Brotaste en una maceta. ¡Enredá todo!');
}

function spawnPlayer(cityIdx, nearMate) {
  const score = player.score;
  if (nearMate) {
    const p = offsetPoint(nearMate.pos, nearMate.r + 4 + Math.random() * 3, Math.random() * 7);
    player.spawnAt(p);
    player.home = world.buildHome(p, game.now);
  } else spawnInHome(player, cityIdx >= 0 ? CITIES[cityIdx] : null);
  player.bornAt = game.now;
  player.score = score;
  lastTitle = 0;
  camF.set(0, 1, 0); tangentize(camF, player.pos);
  player.dir.copy(camF);
  camH = 2.5;
}

function die(killer) {
  game.state = 'dead';
  sfx.death();
  const life = game.now - player.bornAt;
  const best = store.get('best', 0);
  const record = player.score > best;
  if (record) store.set('best', Math.round(player.score));
  if (player.bestR > store.get('bestR', 0)) store.set('bestR', player.bestR);
  $('killer').textContent = killer ? killer.name : '?';
  $('killer').style.color = killer ? css(killer) : '#fff';
  $('deadStats').innerHTML = `${record ? '⭐ <b>¡Récord!</b><br>' : ''}Duraste <b>${fmtTime(life)}</b> · Llegaste a <b>${titleOf(player.bestR)}</b> (${fmtSize(player.bestR)}) · <b>${fmtPct(player.bestT || 0)}</b> del planeta<br>${Math.round(player.score).toLocaleString('es')} pts · ${player.eaten} cosas enredadas · ${player.kills} selvas · ${player.trucks} leñadores · ${player.landmarks.length} monumentos`;
  const mate = player.team && player.team.members.find((m) => m !== player && m.alive);
  $('reviveMate').classList.toggle('hidden', !mate);
  if (mate) $('reviveMate').textContent = `Nacer junto a ${mate.name} ${player.team.icon}`;
  $('dead').classList.remove('hidden');
  game.incoming = null;
}
function revive(withMate) {
  if (game.state !== 'dead') return;
  $('dead').classList.add('hidden');
  // cada vida nueva arranca de cero en puntos
  player.score = 0; player.eaten = 0; player.kills = 0; player.landmarks = []; player.bestR = 0; player.bestT = 0; player.trucks = 0;
  const mate = withMate && player.team && player.team.members.find((m) => m !== player && m.alive);
  spawnPlayer(+$('city').value, mate || null);
  game.state = 'play';
}

$('play').addEventListener('click', () => {
  initAudio();
  player.name = ($('name').value.trim() || 'Vos').slice(0, 14);
  store.set('name', $('name').value.trim()); store.set('city', $('city').value);
  startGame();
});
$('revive').addEventListener('click', () => revive(false));
$('reviveMate').addEventListener('click', () => revive(true));

// ---------- Eventos del mundo (sin fin) ----------
function pickCity() {
  let total = CITIES.reduce((s, c) => s + c.w, 0), r = Math.random() * total;
  for (const c of CITIES) { r -= c.w; if (r <= 0) return c; }
  return CITIES[0];
}
function worldEvents() {
  if (game.now < game.nextEvent) return;
  game.nextEvent = game.now + 55 + Math.random() * 40;
  const k = Math.random();
  // la selva con más territorio atrae los incendios
  let big = null;
  for (const h of holes) if (h.alive && (!big || area[h.id] > area[big.id])) big = h;
  if (k < 0.3) {
    const city = pickCity();
    world.goldRain(city, 34);
    douse(city.pos, 12 + city.w * 6, R);
    game.event = { pos: city.pos, name: city.name, kind: 'gold', until: game.now + 40 };
    feed(`⛈️💧 ¡Tormenta en <b>${city.name}</b>!`); banner(`⛈️💧 Tormenta en ${city.name}: ¡a beber!`);
  } else if (k < 0.55) {
    game.frenzyUntil = game.now + 25;
    feed('🌸 ¡PRIMAVERA! Se enreda el doble de rápido 25 s'); banner('🌸 ¡PRIMAVERA ×2!');
  } else if (k < 0.82 && big && area[big.id] > 150) {
    let lit = 0, at = null;
    for (let t = 0; t < 30 && lit < 5; t++) {
      const q = sampleOwned(big.pos, 14 + big.r * 5, big.id, R, 8);
      if (!q || surfDist(q, big.pos) < big.r * 1.3) continue;
      if (ignite(idxOf(q))) { lit++; at = at || q; }
    }
    if (at) {
      game.event = { pos: at, name: big.name, kind: 'fire', until: game.now + 35 };
      feed(`🔥 ¡Incendio forestal en la selva de <b style="color:${css(big)}">${big.name}</b>!`);
      banner(big === player ? '🔥 ¡Se quema tu selva! Pasá por encima del fuego' : `🔥 Se quema la selva de ${big.name}: ¡a robarle tierra!`);
    }
  } else {
    const city = pickCity();
    for (let i = 0; i < 22; i++) world.spawn('seed', offsetPoint(city.pos, Math.random() * (2 + city.w * 2), Math.random() * 7), { respawn: false, scale: 1, pts: 0 });
    game.event = { pos: city.pos, name: city.name, kind: 'seed', until: game.now + 40 };
    feed(`🌰 ¡Lluvia de semillas en <b>${city.name}</b>!`); banner(`🌰 Lluvia de semillas en ${city.name}`);
  }
  if (game.state === 'play') sfx.event();
}

function nearPlayer(pos, d) { return player.alive && game.state === 'play' && surfDist(pos, player.pos) < d + player.r; }

// ---------- Casa: paredes que encierran mientras sos chico ----------
function houseRules(h) {
  if (!h.home) return;
  const d = surfDist(h.home.pos, h.pos);
  if (h.r < WALL_R) {
    h.shield = Math.max(h.shield, 0.5);
    const max = h.home.rad - 0.1 - h.r * 0.6;
    if (d > max) moveOnSphere(h.pos, dirTo(h.pos, h.home.pos, _v2), d - max);
  } else if (d > h.home.rad + h.r + 0.2) {
    game.cleanups.push({ objs: h.home.objs, at: game.now + 25 });
    h.home = null; h.shield = 2.5;
    if (h === player) { banner('🌆 ¡Libre! Ahora a cubrir la ciudad de selva'); sfx.level(); }
  }
}

// ---------- Bucle ----------
const clock = new THREE.Timer();
let boardT = 0, menuAng = 0;

function tick() {
  clock.update(); const dt = Math.min(0.05, clock.getDelta());
  game.now += dt;
  const playing = game.state === 'play';

  if (playing && player.alive) readPlayerInput();
  population(dt);
  paintAll(dt);
  sweep();
  humans(dt);
  updateOutposts(dt);
  fireStep(dt, game.now);
  upload(dt, MOBILE ? 0.2 : 0.1);
  cleanups();
  worldScale(dt);
  resolveAsk();
  socialT -= dt; if (socialT <= 0) { socialT = 2.5; botSocial(); }
  if (game.incoming && (game.incoming.until < game.now || !canTeam(player, game.incoming.b))) game.incoming = null;

  for (const h of holes) {
    if (h === player) continue;
    if (!h.alive) {
      if (game.now > h.respawnAt) {
        h.score = 0;
        const mate = h.team && h.team.members.find((m) => m !== h && m.alive && !m.home);
        if (mate) { h.spawnAt(offsetPoint(mate.pos, mate.r + 4, Math.random() * 7)); h.home = world.buildHome(h.pos, game.now); }
        else spawnInHome(h);
      }
      continue;
    }
    h.ai.think -= dt;
    if (h.ai.think <= 0) { h.ai.think = 0.22 + Math.random() * 0.15; thinkBot(h, game); }
    steer(h.dir, h.ai.desired, h.pos, h.ai.turn * dt);
    h.throttle = 1;
    // tira la bomba recién cuando ya lo tiene de frente (y con un poco de error)
    const aimT = h.ai.aim;
    if (aimT && game.now - aimT.start > 0.5 && aimT.o.alive) {
      const want = dirTo(h.pos, aimT.o.pos, _v2);
      if (h.dir.dot(want) > Math.cos(0.3)) {
        const err = (Math.random() - 0.5) * 0.25;
        throwBomb(h, _v3.copy(h.dir).applyAxisAngle(h.pos, err));
        h.ai.aim = null;
      }
    }
    // plantar brotes en tierra ajena o libre
    if (!h.ai.aim && !h.ai.fleeing && h.bombs > 0 && h.r > 0.4 && !h.home && Math.random() < dt * 0.06) throwBomb(h, h.dir);
  }

  let leader = null;
  for (const h of holes) {
    if (!h.alive) continue;
    updateCamo(h, dt);
    if (!h.solid()) h.boost = false;
    if (h.boost && h.A > 0.36 && h.bio > 0.05) h.addBio(-h.A * 0.03 * dt); else h.boost = false;
    h.recalc(area[h.id]);
    h.score += dt * area[h.id] * 0.05;
    if (h === player) player.bestT = Math.max(player.bestT || 0, landPct(player));
    h.stun = Math.max(0, h.stun - dt); h.shield = Math.max(0, h.shield - dt); h.rush = Math.max(0, h.rush - dt);
    h.comboT -= dt; if (h.comboT <= 0) h.combo = 0;
    const sv = h.siege > 0 ? 0.75 : 1;
    moveOnSphere(h.pos, h.dir, h.speed() * h.throttle * sv * dt);
    houseRules(h);
    if (h.solid()) eatObjects(h, dt);
    h.bestR = Math.max(h.bestR, h.r);
    if (!leader || h.r > leader.r) leader = h;
  }
  game.leader = leader;
  for (let i = 0; i < holes.length; i++) {
    const a = holes[i]; if (!a.alive) continue;
    for (let j = i + 1; j < holes.length; j++) {
      const b = holes[j]; if (!b.alive || !a.alive) continue;
      if (!a.solid() || !b.solid() || allied(a, b, game.now)) continue;
      const big = a.r >= b.r ? a : b, small = big === a ? b : a;
      if (!(small.shield > 0) && big.r > small.r * HOLE_RATIO && surfDist(big.pos, small.pos) < big.r - small.r * 0.4) eatHole(big, small);
    }
  }
  packHunt(dt);

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    const step = 30 * dt;
    moveOnSphere(p.pos, p.dir, step); p.travelled += step;
    const hop = 0.2 + Math.abs(Math.sin(p.travelled * 0.6)) * (0.5 + p.owner.r * 0.6);
    p.mesh.position.copy(p.pos).multiplyScalar(R + hop);
    let hit = null;
    for (const h of holes) if (h !== p.owner && h.alive && h.solid() && !allied(h, p.owner, game.now) && surfDist(p.pos, h.pos) < h.r + 0.2) { hit = h; break; }
    if (hit || p.travelled > p.max) { explode(p, hit); scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const k = r.t / r.dur;
    r.m.scale.setScalar(0.3 + k * r.size); r.m.material.opacity = 1 - k;
    if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
  }

  worldEvents();
  if (game.event && game.now > game.event.until) game.event = null;
  world.update(dt, game.now, holes);

  const vis = holes.filter((h) => h.alive && (h.camo !== 'hidden' || h === player)).sort((a, b) => b.r - a.r).slice(0, MAX_HOLES);
  for (const h of vis) { h.fxAlpha = h === player ? Math.max(0.22, h.alpha()) : h.alpha(); h.fxWarn = h.camo === 'reveal' || h.siege > 0 ? 1 : 0; }
  globe.setHoles(vis);
  trees(dt);
  globe.uniforms.time.value = game.now;

  updateCamera(dt);
  sun.position.copy(camera.position).add(_v1.set(30, 60, 20)); sun.target.position.set(0, 0, 0);
  globe.uniforms.sunDir.value.copy(sun.position).normalize();

  renderer.render(scene, camera);
  updateLabels();
  bannerTick(dt);

  if (playing || game.state === 'dead') {
    pendingT -= dt;
    if (pending > 0 && pendingT <= 0) { popup(player.pos, '+' + pending, player.combo >= 12 ? '#ffd23a' : '#fff', 16 + Math.min(14, Math.log2(pending + 1) * 2)); pending = 0; pendingT = 0.18; }
    updateMeHud();
    boardT -= dt;
    if (boardT <= 0) { boardT = 0.3; updateBoard(); }
  }
  requestAnimationFrame(tick);
}

function updateCamera(dt) {
  if (game.state === 'menu') {
    menuAng += dt * 0.04;
    camera.up.set(0, 1, 0);
    camera.position.set(Math.cos(menuAng) * R * 2.9, R * 0.9, Math.sin(menuAng) * R * 2.9);
    camera.lookAt(0, 0, 0);
    return;
  }
  const n = player.pos;
  tangentize(camF, n);
  const target = Math.min(220, 1.6 + player.r * 5.4 + (player.boost ? 0.5 + player.r : 0));
  camH += (target - camH) * Math.min(1, dt * 2.5);
  const H = camH;
  const base = _v1.copy(n).multiplyScalar(R);
  camera.position.copy(base).addScaledVector(n, H).addScaledVector(camF, -H * 0.4);
  if (shake > 0) { shake = Math.max(0, shake - dt * 1.5); camera.position.add(_v2.randomDirection().multiplyScalar(shake * (0.05 + H * 0.02))); }
  camera.up.copy(n);
  camera.lookAt(_v2.copy(base).addScaledVector(camF, H * 0.08));
  camera.updateMatrixWorld();
}

const _s = { x: 0, y: 0, ok: false }, _s2 = { x: 0, y: 0, ok: false };
const tanHalf = () => Math.tan((camera.fov * Math.PI) / 360);
function updateLabels() {
  for (const h of holes) {
    const el = labelFor(h);
    const w = _v1.copy(h.pos).multiplyScalar(R);
    const visible = h.alive && (h.camo !== 'hidden' || h === player) && h.pos.dot(camera.position) > R * 1.0 && game.state !== 'menu';
    if (!visible) { el.style.display = 'none'; continue; }
    toScreen(w, _s);
    if (!_s.ok || _s.x < -50 || _s.y < -50 || _s.x > innerWidth + 50 || _s.y > innerHeight + 50) { el.style.display = 'none'; continue; }
    const dist = camera.position.distanceTo(w);
    const pxR = (h.r / (dist * tanHalf())) * (innerHeight / 2);
    if (pxR < 4) { el.style.display = 'none'; continue; }
    el.style.display = 'block';
    el.style.left = _s.x + 'px'; el.style.top = _s.y + 'px';
    el.style.fontSize = Math.max(10, Math.min(30, pxR * 0.42)) + 'px';
    const mate = h !== player && player.team && h.team === player.team;
    el.style.color = h.camo === 'reveal' || h.siege > 0 ? '#ff4d4d' : h === player ? '#fff' : mate ? '#7fc4ff' : css(h);
    el.style.opacity = h === player || h.camo === 'reveal' ? 1 : Math.max(0.15, h.alpha());
    const extra = h.siege > 0 ? `<span class="crown">🌿 ${Math.round((h.siege / PACK.time) * 100)}%</span>`
      : h.camo === 'reveal' ? `<span class="crown">⚠️ ${Math.ceil(CAMO.reveal - h.camoT)}</span>` : h === game.leader ? '<span class="crown">👑</span>' : '';
    el.innerHTML = extra + (h.shield > 0 && !h.home ? '🛡️ ' : '') + (h === player && !h.solid() ? '🌱 ' : '') + tag(h) + h.name;
  }
  let ai = 0;
  if (game.state === 'play' && player.alive) {
    const cx = innerWidth / 2, cy = innerHeight / 2, rx = innerWidth / 2 - 40, ry = innerHeight / 2 - 60;
    const pw = _v3.copy(player.pos).multiplyScalar(R);
    toScreen(pw, _s2);
    const addArrow = (pos, color, label) => {
      const dir = dirTo(player.pos, pos, _v2);
      const t = toScreen(_v1.copy(player.pos).addScaledVector(dir, 0.002).normalize().multiplyScalar(R), _s);
      let dx = t.x - _s2.x, dy = t.y - _s2.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const k = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
      const a = arrowEl(ai++);
      a.style.display = 'block';
      a.style.left = cx + dx * k + 'px'; a.style.top = cy + dy * k + 'px';
      a.style.color = color;
      a.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
      a.firstChild.textContent = label;
      a.firstChild.style.transform = `translateX(-50%) rotate(${-(Math.atan2(dy, dx) + Math.PI / 2)}rad)`;
    };
    for (const h of holes) {
      if (h === player || !h.alive || h.camo === 'hidden' || (h.camo === 'fade' && h.alpha() < 0.3)) continue;
      const mate = player.team && h.team === player.team;
      const d = surfDist(player.pos, h.pos);
      if (!mate && d > 8 + player.r * 12 + h.r * 2) continue;
      toScreen(_v1.copy(h.pos).multiplyScalar(R), _s);
      const onScreen = h.pos.dot(camera.position) > R && _s.ok && _s.x > 0 && _s.y > 0 && _s.x < innerWidth && _s.y < innerHeight;
      if (onScreen) continue;
      const color = mate ? '#4da3ff' : h.r > player.r * HOLE_RATIO ? '#ff4d4d' : player.r > h.r * HOLE_RATIO ? '#5dff8f' : '#ffffff';
      addArrow(h.pos, h.camo === 'reveal' ? '#ff4d4d' : color, `${mate ? h.name + ' ' : h.camo === 'reveal' ? '⚠️ ' : ''}${Math.round(d)} m`);
    }
    if (game.event && game.event.pos) {
      const e = game.event, d = surfDist(player.pos, e.pos);
      const ic = e.kind === 'fire' ? '🔥' : e.kind === 'seed' ? '🌰' : '💧';
      if (d > 6) addArrow(e.pos, e.kind === 'fire' ? '#ff7a2f' : e.kind === 'seed' ? '#e0b070' : '#6ec6ff', `${ic} ${e.name} ${Math.round(d)} m`);
    }
  }
  for (let i = ai; i < arrowEls.length; i++) arrowEls[i].style.display = 'none';
}

requestAnimationFrame(tick);
for (let i = 0; i < 16; i++) connectBot(true, true);
window.__tm = { game, player, holes, world, teams, teamUp, T: { sampleOwned, ignite, idxOf } };
window.__proj = (p) => { const v = new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(R); return toScreen(v); };
