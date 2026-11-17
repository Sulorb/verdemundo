import * as THREE from 'three';
import { R, maskCanvas } from './geo.js';
import { tex as terrTex, palette, TW, TH } from './territory.js';

export const MAX_HOLES = 24;

export function createGlobe(scene) {
  const tex = new THREE.CanvasTexture(maskCanvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;

  const holes = [];
  const holeCol = [];
  const holeFx = [];
  for (let i = 0; i < MAX_HOLES; i++) { holes.push(new THREE.Vector4(0, 1, 0, 0)); holeCol.push(new THREE.Vector3(1, 1, 1)); holeFx.push(new THREE.Vector2(1, 0)); }

  const uniforms = {
    map: { value: tex },
    terr: { value: terrTex },
    pal: { value: palette },
    holes: { value: holes },
    holeCol: { value: holeCol },
    holeFx: { value: holeFx },
    holeCount: { value: 0 },
    sunDir: { value: new THREE.Vector3(1, 1, 1).normalize() },
    time: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vObj;
      void main(){
        vObj = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: /* glsl */ `
      #define PI 3.14159265
      #define MAXH ${MAX_HOLES}
      uniform sampler2D map;
      uniform sampler2D terr;
      uniform sampler2D pal;
      uniform vec4 holes[MAXH];
      uniform vec3 holeCol[MAXH];
      uniform vec2 holeFx[MAXH];
      uniform int holeCount;
      uniform vec3 sunDir;
      uniform float time;
      varying vec3 vObj;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec3 x){
        vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main(){
        vec3 p = normalize(vObj);
        float lon = atan(-p.z, p.x);
        float lat = asin(clamp(p.y,-1.0,1.0));
        vec2 uv = vec2(lon/(2.0*PI)+0.5, lat/PI+0.5);
        vec4 m = texture2D(map, uv);
        float land = smoothstep(0.3,0.7,m.r);
        float coast = m.g;
        float n = noise(p*38.0)*0.6 + noise(p*110.0)*0.4;
        float n2 = noise(p*9.0);
        vec3 deep = vec3(0.03,0.16,0.40);
        vec3 shallow = vec3(0.10,0.52,0.72);
        vec3 ocean = mix(deep, shallow, smoothstep(0.0,0.95,coast));
        ocean += 0.03*sin(time*1.5 + n*12.0);
        float alat = abs(lat)*180.0/PI;
        vec3 grass = vec3(0.40,0.66,0.30);
        vec3 forest = vec3(0.20,0.46,0.22);
        vec3 desert = vec3(0.88,0.77,0.50);
        vec3 snow = vec3(0.94,0.97,1.0);
        vec3 lc = mix(grass, forest, smoothstep(0.35,0.75,n));
        float des = smoothstep(10.0,18.0,alat)*(1.0-smoothstep(30.0,38.0,alat))*smoothstep(0.42,0.6,n2);
        lc = mix(lc, desert, des);
        lc = mix(lc, snow, smoothstep(60.0,68.0,alat + n*8.0));
        // territorio de las selvas
        vec2 tx = vec2(1.0/${TW}.0, 1.0/${TH}.0);
        vec2 tuv = uv + (vec2(noise(p*300.0), noise(p*300.0+7.0)) - 0.5) * tx * 1.3;
        float ow = floor(texture2D(terr, tuv).r * 255.0 + 0.5);
        if (ow > 253.5) {
          float f = 0.5 + 0.5*sin(time*16.0 + noise(p*400.0)*20.0);
          lc = mix(vec3(1.0,0.32,0.04), vec3(1.0,0.86,0.25), f) * (1.3 + 0.5*noise(p*900.0 + time*3.0));
        } else if (ow > 252.5) {
          lc = mix(vec3(0.12,0.11,0.10), vec3(0.28,0.25,0.22), noise(p*700.0));
        } else if (ow > 0.5) {
          vec3 oc = texture2D(pal, vec2((ow+0.5)/256.0, 0.5)).rgb;
          float a1 = noise(p*520.0), a2 = noise(p*2100.0);
          vec3 jg = mix(vec3(0.04,0.27,0.07), vec3(0.18,0.55,0.13), a1);
          jg = mix(jg, vec3(0.36,0.74,0.22), smoothstep(0.62,0.9,a2)*0.6);
          jg = mix(jg, oc, 0.10);
          float fl = smoothstep(0.84,0.88, noise(p*1500.0 + ow*3.1));
          jg = mix(jg, oc, fl*0.85);
          float e = 0.0;
          e += step(0.5, abs(floor(texture2D(terr, tuv+vec2(tx.x*0.6,0.0)).r*255.0+0.5) - ow));
          e += step(0.5, abs(floor(texture2D(terr, tuv-vec2(tx.x*0.6,0.0)).r*255.0+0.5) - ow));
          e += step(0.5, abs(floor(texture2D(terr, tuv+vec2(0.0,tx.y*0.6)).r*255.0+0.5) - ow));
          e += step(0.5, abs(floor(texture2D(terr, tuv-vec2(0.0,tx.y*0.6)).r*255.0+0.5) - ow));
          jg = mix(jg, oc, min(1.0, e)*0.6);
          lc = jg;
        }
        vec3 col = mix(ocean, lc, land);
        // playa
        col = mix(col, vec3(0.93,0.86,0.62), land*(1.0-smoothstep(0.55,0.75,coast))*0.0);
        float diff = max(dot(p, sunDir), 0.0);
        col *= 0.45 + 0.75*diff;
        // huecos
        for (int i = 0; i < MAXH; i++) {
          if (i >= holeCount) break;
          vec4 h = holes[i];
          float t = length(p - h.xyz) / (2.0 * sin(h.w * 0.5));
          float al = holeFx[i].x;
          float warn = holeFx[i].y;
          float pulse = warn * (0.5 + 0.5*sin(time*12.0));
          vec3 rimC = mix(holeCol[i]*1.15, vec3(1.0,0.15,0.1), pulse);
          if (t < 1.0) {
            // la selva: manchas de follaje, hojas finas y flores del color del jugador
            vec3 q = (p - h.xyz) / max(2.0 * sin(h.w * 0.5), 1e-6);
            float fi = float(i);
            float n1 = noise(q * 4.0 + fi * 7.0);
            float n2 = noise(p * 2600.0 + fi);
            float n3 = noise(p * 900.0 + 3.0);
            vec3 jungle = mix(vec3(0.04,0.24,0.06), vec3(0.16,0.50,0.11), n1);
            jungle = mix(jungle, vec3(0.30,0.68,0.18), smoothstep(0.6,0.85,n2) * 0.7);
            jungle *= 0.8 + 0.4 * n3;
            float fl = smoothstep(0.80,0.84, noise(q * 18.0 + fi * 3.0));
            jungle = mix(jungle, holeCol[i], fl * 0.95);
            jungle *= 0.72 + 0.38 * t;
            jungle = mix(jungle, vec3(0.02,0.12,0.03), smoothstep(0.82,1.0,t) * 0.55);
            col = mix(col, jungle * (0.55 + 0.6 * diff), al * 0.7);
            if (warn > 0.0 && t > 0.93) col = mix(col, vec3(1.0,0.15,0.1), pulse*0.8);
          } else if (t < 1.10) {
            float k = 1.0 - (t-1.0)/0.10;
            col = mix(col, rimC, k*k*0.95*max(al, pulse));
          }
        }
        gl_FragColor = vec4(col,1.0);
      }`,
  });

  const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 192, 128), mat);
  scene.add(globe);

  // Atmósfera
  const atm = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.06, 96, 64),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(vec3(0.35,0.6,1.0)*f*1.4, f); }`,
    })
  );
  scene.add(atm);

  // Estrellas
  const N = 4000, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 600);
    sp.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false })));

  return {
    globe, atm, uniforms,
    setHoles(list) {
      const n = Math.min(list.length, MAX_HOLES);
      for (let i = 0; i < n; i++) {
        const h = list[i];
        holes[i].set(h.pos.x, h.pos.y, h.pos.z, Math.max(0.0005, h.r / R));
        holeCol[i].set(h.color.r, h.color.g, h.color.b);
        holeFx[i].set(h.fxAlpha ?? 1, h.fxWarn ?? 0);
      }
      uniforms.holeCount.value = n;
    },
  };
}
