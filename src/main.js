import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer, EffectPass, RenderPass, BloomEffect, VignetteEffect } from "postprocessing";
import "./style.css";
import "@fontsource/noto-serif-sc/chinese-simplified-500.css";
import "@fontsource/noto-serif-sc/chinese-simplified-600.css";
import "@fontsource/ma-shan-zheng/chinese-simplified-400.css";
import "@fontsource/great-vibes/400.css";

const vert = `
attribute vec3 aChaos;
attribute vec3 aColor;
attribute float aScale;
attribute float aDelay;
attribute float aPhase;
attribute float aKind;

uniform float uTime;
uniform float uAssemble;
uniform float uBurst;
uniform vec3 uPointer;
attribute vec3 aAlt;
attribute vec3 aAltColor;
attribute float aAltScale;
attribute float aAltKind;

uniform float uPointerAmt;
uniform float uGain;
uniform float uOpen;
uniform float uHeartPulse;

varying vec3 vColor;
varying float vAlpha;
varying float vKind;

void main() {
  float form = smoothstep(aDelay, aDelay + 0.28, uAssemble);
  vec3 treePos = position;
  float rad = length(treePos.xz);
  float ribbon = step(0.15, aKind) * (1.0 - step(0.45, aKind));
  if (rad > 0.001) {
    float ang = atan(treePos.z, treePos.x) + uTime * mix(0.15, 0.42, ribbon);
    treePos.x = cos(ang) * rad;
    treePos.z = sin(ang) * rad;
  }
  vec3 settled = mix(treePos, aAlt, uOpen);
  if (uOpen > 0.72 && aAltKind < 1.5) {
    vec3 heartC = vec3(0.0, 3.4, 0.0);
    settled = heartC + (settled - heartC) * uHeartPulse;
  }
  float scatter = sin(clamp(uOpen, 0.0, 1.0) * 3.14159265);
  float letterish = step(1.5, aAltKind);
  float spin = uTime * 2.4 + aPhase * 6.28318;
  vec3 boom = aChaos;
  float swirl = scatter * (5.2 + aPhase * 4.8) * (1.0 - letterish * 0.45);
  boom.x += cos(spin) * swirl;
  boom.z += sin(spin) * swirl;
  boom.y += sin(spin * 0.8 + aPhase) * swirl * 0.35;
  vec3 goal = mix(settled, boom, scatter * (1.0 - letterish * 0.62));
  vec3 pos = mix(aChaos, goal, form);

  float treeFeel = (1.0 - uOpen) * (1.0 - scatter);
  float sway = sin(uTime * 1.35 + position.y * 1.6 + aPhase) * 0.018 * form * treeFeel;
  pos.x += sway;
  pos.z += cos(uTime * 1.05 + position.y * 1.2) * 0.018 * form * treeFeel;
  pos.y += sin(uTime * 0.9 + aPhase * 9.0) * 0.04 * uOpen * (1.0 - letterish);

  vec3 heart = pos - vec3(0.0, 2.5, 0.0);
  float heartLen = length(heart);
  vec3 heartDir = heartLen > 0.001 ? heart / heartLen : vec3(0.0, 1.0, 0.0);
  // 烟花不要把圣诞树粒子撑开
  if (uOpen > 0.7) pos += heartDir * uBurst * (0.22 + aPhase * 0.55);

  vec3 away = pos - uPointer;
  float dist = length(away);
  float push = smoothstep(2.15, 0.0, dist) * uPointerAmt;
  if (dist > 0.001) pos += (away / dist) * push * 0.9 * treeFeel;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  float shown = uOpen > 0.62 ? aAltKind : aKind;
  float blink;
  if (shown > 1.5) blink = 1.0;
  else if (shown > 0.5) blink = 0.35 + 0.65 * smoothstep(-0.15, 1.0, sin(uTime * 5.4 - aPhase * 6.28318));
  else blink = 0.62 + 0.38 * pow(0.5 + 0.5 * sin(uTime * 4.2 + aPhase * 18.0), 2.0);

  float scaleNow = mix(aScale, aAltScale, uOpen);
  float treePart = 1.0 - step(0.5, aKind);
  scaleNow *= 1.0 + scatter * 0.35 * (1.0 - step(1.5, shown)) * (1.0 - treePart);
  if (uOpen > 0.72 && aAltKind < 1.5) scaleNow *= uHeartPulse;
  vec3 colNow = mix(aColor, aAltColor, uOpen);
  float sizeBlink = blink;
  if (shown < 0.5 || (shown > 0.5 && shown < 1.5)) {
    /* 彩灯可以继续闪 */
  } else if (uOpen < 0.08) {
    sizeBlink = 1.0;
  } else if (uOpen > 0.72 && aAltKind < 1.5) {
    sizeBlink = 1.0;
  }
  if (shown > 1.5) {
    gl_PointSize = clamp(scaleNow * (360.0 / max(1.0, -mv.z)), 3.2, 15.0);
  } else {
    gl_PointSize = clamp(scaleNow * (0.9 + sizeBlink * 0.2) * (255.0 / max(1.0, -mv.z)), 1.7, 28.0);
  }
  float treeFoliage = (1.0 - step(0.5, aKind)) * (1.0 - step(0.55, uOpen));
  float showBlink = mix(blink, 1.0, treeFoliage);
  vColor = colNow * showBlink * uGain;
  vAlpha = shown > 1.5 ? 1.0 : 0.92;
  vKind = shown;
}
`;

const frag = `
varying vec3 vColor;
varying float vAlpha;
varying float vKind;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float d = length(p);
  if (d > 0.5) discard;
  float light = step(0.5, vKind) * (1.0 - step(1.5, vKind));
  float letter = step(1.5, vKind);
  if (letter > 0.5) {
    float rim = smoothstep(0.5, 0.34, d);
    gl_FragColor = vec4(vColor, rim * vAlpha);
    return;
  }
  float rim = mix(smoothstep(0.5, 0.05, d), smoothstep(0.5, 0.28, d), light);
  float core = smoothstep(0.14, 0.0, d);
  vec3 col = vColor * mix(0.55 + core * 0.9, 0.25 + core * 2.2, light);
  gl_FragColor = vec4(col, rim * vAlpha);
}
`;

const canvas = document.querySelector("#view");
const veil = document.querySelector("#veil");
const soundBtn = document.querySelector("#sound");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
} catch (err) {
  console.error(err);
  veil.outerHTML = "<p class='err'>This night needs a browser that can draw.</p>";
  throw err;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.setClearColor(0x06101c, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06101c);
scene.fog = new THREE.FogExp2(0x06101c, 0.011);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
const narrow0 = window.innerWidth < window.innerHeight;
const camFrom = new THREE.Vector3(0.15, 4.6, narrow0 ? 32 : 24.2);
const camTo = new THREE.Vector3(narrow0 ? 0 : 0.04, narrow0 ? 4.85 : 4.35, narrow0 ? 33 : 23.4);
camera.position.copy(reduceMotion ? camTo : camFrom);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 3.55, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.14;
controls.minDistance = 10;
controls.maxDistance = 34;
controls.minPolarAngle = 0.82;
controls.maxPolarAngle = 1.62;
controls.enabled = reduceMotion;
controls.update();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
pmrem.dispose();

scene.add(new THREE.AmbientLight(0xb9cfe6, 0.36));
const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x07111e, 0.52);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xd5e6f8, 0.62);
sun.position.set(-4, 8, 6);
scene.add(sun);

const treeLamp = new THREE.PointLight(0x8eb8ee, 7, 13, 2);
treeLamp.position.set(0.12, 3.8, 0.35);
scene.add(treeLamp);
const starLamp = new THREE.PointLight(0xd7e8ff, 12, 9, 2);
starLamp.position.set(0, 8.05, 0.2);
scene.add(starLamp);

const uniforms = {
  uTime: { value: 0 },
  uAssemble: { value: reduceMotion ? 1 : 0 },
  uBurst: { value: 0 },
  uPointer: { value: new THREE.Vector3(0, 2.4, 20) },
  uPointerAmt: { value: 0 },
  uGain: { value: 1 },
  uOpen: { value: 0 },
  uHeartPulse: { value: 1 },
};

function makeMat(blending, gain) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uAssemble: uniforms.uAssemble,
      uBurst: uniforms.uBurst,
      uPointer: uniforms.uPointer,
      uPointerAmt: uniforms.uPointerAmt,
      uGain: { value: gain },
      uOpen: uniforms.uOpen,
      uHeartPulse: uniforms.uHeartPulse,
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending,
  });
}

const foliageMat = makeMat(THREE.AdditiveBlending, 1);
const lightMat = makeMat(THREE.AdditiveBlending, 1);
const tinselMat = makeMat(THREE.AdditiveBlending, 1);

// 银白光锥，外圈密一点，轮廓干净
function branchSample() {
  const t = Math.random();
  const y = (1 - t) * 7.5 + 0.16;
  const envelope = 0.06 + Math.pow(t, 1.04) * 3.12;
  const radial = Math.pow(Math.random(), 0.48);
  const ang = Math.random() * Math.PI * 2;
  const wobble = 1 + Math.sin(ang * 4.0 + t * 20.0) * 0.03;
  const r = envelope * (0.18 + 0.82 * radial) * wobble;
  return {
    x: Math.cos(ang) * r,
    y,
    z: Math.sin(ang) * r,
    t,
    flare: radial,
    radial,
    li: 0,
  };
}

function chaosOf() {
  const ang = Math.random() * Math.PI * 2;
  const rad = 0.15 + Math.random() * 1.55;
  const y = -3.4 - Math.random() * 4.6;
  return [Math.cos(ang) * rad, y, Math.sin(ang) * rad];
}

function pushPoint(buf, i, p, color, scale, kind) {
  const o = i * 3;
  buf.pos[o] = p.x;
  buf.pos[o + 1] = p.y;
  buf.pos[o + 2] = p.z;
  const c = chaosOf();
  buf.chaos[o] = c[0];
  buf.chaos[o + 1] = c[1];
  buf.chaos[o + 2] = c[2];
  const col = new THREE.Color(color);
  buf.color[o] = col.r;
  buf.color[o + 1] = col.g;
  buf.color[o + 2] = col.b;
  buf.scale[i] = scale;
  // 树尖晚点到，看起来是从下往上长
  buf.delay[i] = Math.random() * 0.08 + (1 - (p.t || 0)) * 0.46;
  buf.phase[i] = Math.random();
  buf.kind[i] = kind;
}

function alloc(n) {
  return {
    pos: new Float32Array(n * 3),
    chaos: new Float32Array(n * 3),
    color: new Float32Array(n * 3),
    scale: new Float32Array(n),
    delay: new Float32Array(n),
    phase: new Float32Array(n),
    kind: new Float32Array(n),
    alt: new Float32Array(n * 3),
    altColor: new Float32Array(n * 3),
    altScale: new Float32Array(n),
    altKind: new Float32Array(n),
  };
}

function toGeo(buf) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf.pos, 3));
  geo.setAttribute("aChaos", new THREE.BufferAttribute(buf.chaos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(buf.color, 3));
  geo.setAttribute("aScale", new THREE.BufferAttribute(buf.scale, 1));
  geo.setAttribute("aDelay", new THREE.BufferAttribute(buf.delay, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(buf.phase, 1));
  geo.setAttribute("aKind", new THREE.BufferAttribute(buf.kind, 1));
  geo.setAttribute("aAlt", new THREE.BufferAttribute(buf.alt, 3));
  geo.setAttribute("aAltColor", new THREE.BufferAttribute(buf.altColor, 3));
  geo.setAttribute("aAltScale", new THREE.BufferAttribute(buf.altScale, 1));
  geo.setAttribute("aAltKind", new THREE.BufferAttribute(buf.altKind, 1));
  return geo;
}

const heartS = 3.55;
const heartY = 3.4;
const TREE_SIZE = 1.32;
const TREE_REST_Y = -1.15;

function heartInside(x, y) {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0.02;
}

function heartFill() {
  for (let n = 0; n < 40; n++) {
    const x = Math.random() * 2.4 - 1.2;
    const y = Math.random() * 2.6 - 1.3;
    if (heartInside(x, y)) {
      return [x * heartS, y * heartS + heartY, (Math.random() - 0.5) * 0.5];
    }
  }
  return [0, heartY, 0];
}

function heartShell() {
  const t = Math.random() * Math.PI * 2;
  const x = Math.pow(Math.sin(t), 3) * 16;
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  const yTop = 1.24 * heartS + heartY;
  const yBot = -1.13 * heartS + heartY;
  return [
    (x / 16) * 1.15 * heartS + (Math.random() - 0.5) * 0.06,
    ((y + 17) / 28.92) * (yTop - yBot) + yBot + (Math.random() - 0.5) * 0.06,
    (Math.random() - 0.5) * 0.16,
  ];
}

function putHeart(buf, i, shell) {
  const p = shell ? heartShell() : heartFill();
  const o = i * 3;
  buf.alt[o] = p[0];
  buf.alt[o + 1] = p[1];
  buf.alt[o + 2] = p[2];
  const cols = shell
    ? [0x8ec6ff, 0xf0d29a, 0xd7e8ff, 0xf6e2b4, 0x6eb4f2]
    : [0x1d6ec8, 0x3c92ea, 0x67b4f5, 0xe8d2a4, 0x4d96ea];
  const col = new THREE.Color(cols[i % cols.length]);
  const gain = shell ? 1.55 : 1.22;
  buf.altColor[o] = col.r * gain;
  buf.altColor[o + 1] = col.g * gain;
  buf.altColor[o + 2] = col.b * gain;
  buf.altScale[i] = shell ? 0.22 + Math.random() * 0.24 : 0.34 + Math.random() * 0.22;
  buf.altKind[i] = shell ? 1 : 0;
}

function fillHeart(buf, shell) {
  const n = buf.altScale.length;
  for (let i = 0; i < n; i++) putHeart(buf, i, shell);
}

const foliageN = 20000;
const foliage = alloc(foliageN);
const iceIn = [0x145fb8, 0x1c74d4, 0x207edc, 0x1868c8];
const iceOut = [0x3d96ee, 0x58aaef, 0x2f82dc, 0x6eb4f2];

for (let i = 0; i < foliageN; i++) {
  const p = branchSample();
  let color = iceIn[i % 3];
  let scale = 0.22 + Math.random() * 0.28;
  if (p.radial > 0.62) {
    color = iceOut[i % 3];
    scale = 0.32 + Math.random() * 0.4;
  }
  if (Math.random() < 0.045) color = 0xf0d09a;
  else if (Math.random() < 0.1) color = iceOut[(i + 2) % iceOut.length];
  pushPoint(foliage, i, p, color, scale, 0);
  const o = i * 3;
  const gain = p.radial > 0.75 ? 1.45 : 1.22;
  foliage.color[o] *= gain;
  foliage.color[o + 1] *= gain;
  foliage.color[o + 2] *= gain;
}

const lightN = 520;
const lights = alloc(lightN);
const bulbs = [0x7ec4ff, 0x4d96ea, 0xd6ecff, 0x9fd4ff, 0x6eb4f2, 0xf0d29a];
for (let i = 0; i < lightN; i++) {
  let p = branchSample();
  let guard = 0;
  while (p.radial < 0.78 && guard < 8) {
    p = branchSample();
    guard++;
  }
  const color = bulbs[i % bulbs.length];
  pushPoint(lights, i, p, color, 0.34 + Math.random() * 0.28, 1);
  const o = i * 3;
  lights.color[o] *= 2.15;
  lights.color[o + 1] *= 2.15;
  lights.color[o + 2] *= 2.15;
}

// 三股彩带绕着锥面走，kind 0.25 用来转得更快
const ribbonCount = 3;
const perRibbon = 1700;
const tinselN = ribbonCount * perRibbon;
const tinsel = alloc(tinselN);
for (let r = 0; r < ribbonCount; r++) {
  for (let i = 0; i < perRibbon; i++) {
    const t = i / (perRibbon - 1);
    const ang = t * 4.6 * Math.PI * 2 + (r / ribbonCount) * Math.PI * 2;
    const envelope = 0.1 + Math.pow(t, 1.04) * 3.22;
    const radius = envelope + (Math.random() - 0.5) * 0.07;
    const p = {
      x: Math.cos(ang) * radius,
      y: (1 - t) * 7.5 + 0.16 + (Math.random() - 0.5) * 0.05,
      z: Math.sin(ang) * radius,
      t,
    };
    const idx = r * perRibbon + i;
    const ribbonCol = [0x8ec8f8, 0x5aa6ef, 0xe8d09a];
    const color = ribbonCol[r % ribbonCol.length];
    pushPoint(tinsel, idx, p, color, 0.28 + Math.random() * 0.22, 0.25);
    const o = idx * 3;
    tinsel.color[o] *= 2.35;
    tinsel.color[o + 1] *= 2.35;
    tinsel.color[o + 2] *= 2.35;
  }
}

fillHeart(foliage, false);
fillHeart(lights, true);
fillHeart(tinsel, true);

const tree = new THREE.Group();
scene.add(tree);
const foliagePts = new THREE.Points(toGeo(foliage), foliageMat);
const lightPts = new THREE.Points(toGeo(lights), lightMat);
const tinselPts = new THREE.Points(toGeo(tinsel), tinselMat);
tree.add(foliagePts);
tree.add(lightPts);
tree.add(tinselPts);
tree.scale.setScalar(TREE_SIZE);
if (!reduceMotion) {
  tree.position.y = -11.4 * TREE_SIZE;
  tree.rotation.y = Math.PI * 2.7;
}

// 张开是爱心，字写在页面上

function makeStarShape() {
  const shape = new THREE.Shape();
  const spikes = 5;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 0.52 : 0.2;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.016,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

// 薄金星，每帧正对镜头，轮廓才不会侧没
const starMat = new THREE.MeshPhysicalMaterial({
  color: 0xfff3dc,
  emissive: 0xf0d4a4,
  emissiveIntensity: 0.45,
  metalness: 0.88,
  roughness: 0.16,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
});
const starPivot = new THREE.Group();
starPivot.position.y = 8.05;
const star = new THREE.Mesh(makeStarShape(), starMat);
star.scale.setScalar(0.95);
star.renderOrder = 6;
starPivot.add(star);
tree.add(starPivot);

function circleTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.75)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function flareTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.translate(256, 256);
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 36);
  core.addColorStop(0, "rgba(244,250,255,0.95)");
  core.addColorStop(0.45, "rgba(158,196,240,0.3)");
  core.addColorStop(1, "rgba(158,196,240,0)");
  g.fillStyle = core;
  g.fillRect(-256, -256, 512, 512);
  const rays = 10;
  for (let i = 0; i < rays; i++) {
    g.save();
    g.rotate((i / rays) * Math.PI);
    const long = i % 2 === 0;
    const len = long ? 228 : 128;
    const grad = g.createLinearGradient(-len, 0, len, 0);
    grad.addColorStop(0, "rgba(190,220,255,0)");
    grad.addColorStop(0.38, long ? "rgba(226,240,255,0.92)" : "rgba(170,206,245,0.42)");
    grad.addColorStop(0.5, "rgba(248,252,255,1)");
    grad.addColorStop(0.62, long ? "rgba(226,240,255,0.92)" : "rgba(170,206,245,0.42)");
    grad.addColorStop(1, "rgba(190,220,255,0)");
    g.strokeStyle = grad;
    g.lineWidth = long ? 3.2 : 1.4;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-len, 0);
    g.lineTo(len, 0);
    g.stroke();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const starGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: flareTex(),
    color: 0xffe6c0,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.95,
  })
);
starGlow.position.y = 8.05;
starGlow.scale.set(1.75, 1.75, 1);
starGlow.renderOrder = 4;
tree.add(starGlow);

const starHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: circleTex(),
    color: 0x9ec8ff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.42,
  })
);
starHalo.position.y = 8.05;
starHalo.scale.set(0.58, 0.58, 1);
starHalo.renderOrder = 3;
tree.add(starHalo);

// 礼物和照片在树里、在球里都绕着转
const cluster = new THREE.Group();
scene.add(cluster);
const orbits = [];
const orbitHome = new THREE.Vector3();
const orbitDest = new THREE.Vector3();
const orbitScale = new THREE.Vector3();
let held = null;
let prevHeld = null;
let hoverPhoto = null;
let prevHover = null;
function orbitItem(obj, kind) {
  obj.userData.kind = kind;
  obj.userData.ang = Math.random() * Math.PI * 2;
  obj.userData.spin = 0.45 + Math.random() * 0.85;
  obj.userData.rad = 1.05 + Math.random() * 1.45;
  obj.userData.y0 = 1.15 + Math.random() * 4.15;
  obj.userData.phase = Math.random() * 6.28;
  obj.userData.home = obj.scale.x || 1;
  cluster.add(obj);
  orbits.push(obj);
}

function makeGift(wrap, ribbon) {
  const g = new THREE.Group();
  const boxMat = new THREE.MeshStandardMaterial({ color: wrap, roughness: 0.45, metalness: 0.08 });
  const ribMat = new THREE.MeshStandardMaterial({
    color: ribbon,
    roughness: 0.3,
    metalness: 0.22,
    emissive: ribbon,
    emissiveIntensity: 0.18,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.42), boxMat);
  const bandV = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.44), ribMat);
  const bandH = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.12), ribMat);
  g.add(box, bandV, bandH);
  g.scale.setScalar(0.72);
  return g;
}

function paintCard(hue, label) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 640;
  const g = c.getContext("2d");
  g.fillStyle = "#f6f0e6";
  g.fillRect(0, 0, 512, 640);
  const grd = g.createLinearGradient(36, 36, 476, 476);
  grd.addColorStop(0, "hsl(" + hue + " 70% 58%)");
  grd.addColorStop(1, "hsl(" + ((hue + 36) % 360) + " 65% 42%)");
  g.fillStyle = grd;
  g.fillRect(36, 36, 440, 440);
  g.fillStyle = "rgba(255,248,236,0.92)";
  g.beginPath();
  g.arc(256, 230, 78, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3a2a22";
  g.font = "28px Georgia";
  g.textAlign = "center";
  g.fillText(label, 256, 560);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sizePhotoFrame(g, tex) {
  const img = tex.image;
  if (!img?.width) return;
  const ar = img.width / img.height;
  const face = g.userData.face;
  const paper = g.userData.paper;
  const cap = 0.7;
  let faceW;
  let faceH;
  if (ar >= 1) {
    faceW = cap;
    faceH = cap / ar;
  } else {
    faceH = cap;
    faceW = cap * ar;
  }
  face.geometry.dispose();
  face.geometry = new THREE.PlaneGeometry(faceW, faceH);
  const side = 0.055;
  const bottom = 0.11;
  const pw = faceW + side * 2;
  const ph = faceH + side + bottom;
  paper.geometry.dispose();
  paper.geometry = new THREE.PlaneGeometry(pw, ph);
  face.position.set(0, (bottom - side) * 0.35, 0.024);
  // 竖图字多，捏合时放得更大
  if (ar < 0.72) g.userData.heldMul = 3.38;
  else if (ar > 1.25) g.userData.heldMul = 2.95;
  else g.userData.heldMul = 3.22;
  g.userData.hoverMul = 0.72;
}

function makePhoto(tex) {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.98),
    new THREE.MeshStandardMaterial({
      color: 0xe7f1fb,
      roughness: 0.7,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.64),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  );
  g.userData.face = face;
  g.userData.paper = paper;
  g.add(paper, face);
  g.scale.setScalar(1.05);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  tex.anisotropy = aniso > 4 ? 8 : aniso;
  sizePhotoFrame(g, tex);
  return g;
}

function layoutPhotoRing() {
  const lined = photosOnly();
  for (let i = 0; i < lined.length; i++) {
    lined[i].userData.ang = (i / lined.length) * Math.PI * 2;
    lined[i].userData.spin = 0.32;
  }
}

const giftColors = [
  [0x123a62, 0xe8d09a],
  [0x1a4e7c, 0xd5e6f6],
  [0x0e2744, 0xf4e2b0],
  [0xc5d8ee, 0x2c6298],
  [0x163e6c, 0xe8d09a],
  [0x6a96c6, 0xf4f9ff],
];
for (let i = 0; i < giftColors.length; i++) {
  orbitItem(makeGift(giftColors[i][0], giftColors[i][1]), "gift");
}
// 1-18 按文件名顺序，和 public/photos 里一致
const photoFiles = [
  "1.jpg", "2.jpg", "3.jpg", "4.png", "5.png", "6.png", "7.png", "8.jpg", "9.jpg", "10.png",
  "11.png", "12.png", "13.png", "14.png", "15.png", "16.png", "17.png", "18.jpg",
];
const localPhotos = photoFiles.map((name) => `/photos/${name}`);
const photoLoader = new THREE.TextureLoader();
for (let i = 0; i < localPhotos.length; i++) {
  const url = localPhotos[i];
  photoLoader.load(
    url,
    (tex) => {
      const obj = makePhoto(tex);
      orbitItem(obj, "photo");
      if (!reduceMotion) obj.scale.setScalar(0.001);
      layoutPhotoRing();
      console.log("照片好了", url);
    },
    undefined,
    (err) => console.error("照片挂了", url, err)
  );
}
if (!reduceMotion) {
  for (let i = 0; i < orbits.length; i++) orbits[i].scale.setScalar(0.001);
}

function photosOnly() {
  const list = [];
  for (let i = 0; i < orbits.length; i++) {
    if (orbits[i].userData.kind === "photo") list.push(orbits[i]);
  }
  return list;
}

const snowTex = circleTex();
const snowMat = new THREE.PointsMaterial({
  size: 0.045,
  map: snowTex,
  color: 0xf7fbff,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.NormalBlending,
  sizeAttenuation: true,
});

// 树脚几圈光环，整圈一起转
const ringN = 5400;
const ringPos = new Float32Array(ringN * 3);
const ringCol = new Float32Array(ringN * 3);
const ringRadii = [2.4, 3.95, 5.65, 7.45];
for (let i = 0; i < ringN; i++) {
  const ring = i % ringRadii.length;
  const ang = Math.random() * Math.PI * 2;
  const rad = ringRadii[ring] + (Math.random() - 0.5) * (0.22 + ring * 0.05);
  ringPos[i * 3] = Math.cos(ang) * rad;
  ringPos[i * 3 + 1] = TREE_REST_Y + 0.04 + Math.random() * 0.22;
  ringPos[i * 3 + 2] = Math.sin(ang) * rad;
  const c = new THREE.Color(Math.random() < 0.14 ? 0xfff3d8 : 0xe8f1fb);
  const g = 0.45 + Math.random() * 1.15;
  ringCol[i * 3] = c.r * g;
  ringCol[i * 3 + 1] = c.g * g;
  ringCol[i * 3 + 2] = c.b * g;
}
const ringGeo = new THREE.BufferGeometry();
ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
ringGeo.setAttribute("color", new THREE.BufferAttribute(ringCol, 3));
const ringMat = new THREE.PointsMaterial({
  size: 0.055,
  map: snowTex,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 0.92,
  sizeAttenuation: true,
});
const ringPts = new THREE.Points(ringGeo, ringMat);
scene.add(ringPts);

const groundN = 900;
const groundPos = new Float32Array(groundN * 3);
for (let i = 0; i < groundN; i++) {
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.pow(Math.random(), 0.55) * 4.6;
  groundPos[i * 3] = Math.cos(ang) * rad;
  groundPos[i * 3 + 1] = TREE_REST_Y + 0.02 + Math.random() * 0.05;
  groundPos[i * 3 + 2] = Math.sin(ang) * rad;
}
const groundGeo = new THREE.BufferGeometry();
groundGeo.setAttribute("position", new THREE.BufferAttribute(groundPos, 3));
const groundSnow = new THREE.Points(groundGeo, snowMat.clone());
groundSnow.material.vertexColors = false;
groundSnow.material.color.set(0xf7fbff);
groundSnow.material.sizeAttenuation = true;
groundSnow.material.size = 0.055;
groundSnow.material.opacity = 0.7;
scene.add(groundSnow);

function groundDisc() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(256, 256, 20, 256, 256, 250);
  grd.addColorStop(0, "rgba(150, 176, 204, 0.16)");
  grd.addColorStop(0.42, "rgba(10, 22, 40, 0.18)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(8.6, 64),
  new THREE.MeshBasicMaterial({ map: groundDisc(), transparent: true, depthWrite: false })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = TREE_REST_Y + 0.02;
scene.add(floor);

const fwN = 4800;
const fwPos = new Float32Array(fwN * 3);
const fwColor = new Float32Array(fwN * 3);
const fwVel = [];
const fwLife = new Float32Array(fwN);
for (let i = 0; i < fwN; i++) {
  fwPos[i * 3 + 1] = -20;
  fwVel.push(new THREE.Vector3());
}
const fwGeo = new THREE.BufferGeometry();
fwGeo.setAttribute("position", new THREE.BufferAttribute(fwPos, 3));
fwGeo.setAttribute("color", new THREE.BufferAttribute(fwColor, 3));
const fwPoints = new THREE.Points(
  fwGeo,
  new THREE.PointsMaterial({
    size: 0.26,
    map: snowTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
);
fwPoints.frustumCulled = false;
scene.add(fwPoints);

let fwCursor = 0;
const fwPalette = [0xfff6e8, 0xf5e6c4, 0xffefc8, 0xe8d4a0, 0xfff9f0, 0xd9bc7a];

function spawnBurst(origin) {
  const batch = 460;
  for (let i = 0; i < batch; i++) {
    const idx = (fwCursor + i) % fwN;
    const o = idx * 3;
    fwPos[o] = origin.x;
    fwPos[o + 1] = origin.y;
    fwPos[o + 2] = origin.z;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const tail = Math.random() < 0.28;
    const speed = tail ? 0.25 + Math.random() * 0.45 : 1.35 + Math.random() * 1.05;
    fwVel[idx].set(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.cos(phi) * speed,
      Math.sin(phi) * Math.sin(theta) * speed
    );
    fwLife[idx] = tail ? 2.1 + Math.random() * 1.0 : 1.45 + Math.random() * 0.75;
    const col = new THREE.Color(fwPalette[idx % fwPalette.length]);
    const lit = tail ? 1.35 : 1.65;
    fwColor[o] = col.r * lit;
    fwColor[o + 1] = col.g * lit;
    fwColor[o + 2] = col.b * lit;
  }
  fwCursor = (fwCursor + batch) % fwN;
  fwGeo.attributes.position.needsUpdate = true;
  fwGeo.attributes.color.needsUpdate = true;
  if (openAmt > 0.7) uniforms.uBurst.value = 1;
  if (soundOn) ting();
}

const fwNdc = new THREE.Vector3();
const fwOrigin = new THREE.Vector3();

function burstOnScreen(ndcX, ndcY) {
  // 跟镜头走，左右固定在画面内侧，不贴边、不乱跳
  fwNdc.set(ndcX, ndcY, 0.5);
  fwNdc.unproject(camera);
  fwOrigin.copy(fwNdc).sub(camera.position);
  const dist = camera.position.distanceTo(controls.target);
  fwOrigin.normalize().multiplyScalar(dist).add(camera.position);
  spawnBurst(fwOrigin);
}

function bothSides() {
  // 左右上方固定，再往两侧靠，不贴死屏幕边
  burstOnScreen(-0.78, 0.62);
  burstOnScreen(0.78, 0.62);
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointerWorld = new THREE.Vector3();
const treeHeart = new THREE.Vector3(0, 3.8, 0);
let pointerOn = false;
let pointerTarget = 0;
let downX = 0;
let downY = 0;
let pressing = false;

canvas.addEventListener("pointermove", (e) => {
  pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerOn = true;
});
canvas.addEventListener("pointerleave", () => {
  pointerOn = false;
});
canvas.addEventListener("pointerdown", (e) => {
  pressing = true;
  downX = e.clientX;
  downY = e.clientY;
  controls.autoRotate = false;
});
window.addEventListener("pointerup", (e) => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (pressing && moved < 7) {
    pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    bothSides();
  }
  pressing = false;
  if (!reduceMotion) controls.autoRotate = true;
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    spawnBurst(treeHeart.clone());
  }
  if (e.key === "m" || e.key === "M") toggleSound();
});

let audioCtx = null;
let soundOn = false;

function ctxOrNull() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function tone(freq, when, dur, type, gainVal) {
  const ac = ctxOrNull();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(gainVal, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function chime() {
  const ac = ctxOrNull();
  const notes = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < notes.length; i++) {
    tone(notes[i], ac.currentTime + i * 0.14, 1.15, "sine", 0.05);
  }
}

function ting() {
  const ac = ctxOrNull();
  tone(1568, ac.currentTime, 0.35, "sine", 0.04);
  tone(2093, ac.currentTime + 0.05, 0.28, "triangle", 0.02);
}

function toggleSound() {
  soundOn = !soundOn;
  soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  if (soundOn) {
    const ac = ctxOrNull();
    if (ac.state === "suspended") ac.resume();
    chime();
  }
}
soundBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSound();
});

const letterOpen = document.querySelector("#letter-open");
const letterBox = document.querySelector("#letter");
const letterClose = document.querySelector("#letter-close");
const letterSky = document.querySelector("#letter-sky");
let skyRun = 0;
let skyDrops = [];

function sizeSky() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  letterSky.width = Math.floor(window.innerWidth * dpr);
  letterSky.height = Math.floor(window.innerHeight * dpr);
  const ctx = letterSky.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function seedDrops() {
  skyDrops = [];
  for (let i = 0; i < 680; i++) {
    skyDrops.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      v: 70 + Math.random() * 200,
      len: 8 + Math.random() * 18,
      gold: Math.random() < 0.22,
    });
  }
}

function skyTick() {
  if (!skyRun) return;
  const ctx = letterSky.getContext("2d");
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dt = 0.016;
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < skyDrops.length; i++) {
    const p = skyDrops[i];
    p.y += p.v * dt;
    if (p.y > h + 20) {
      p.y = -20;
      p.x = Math.random() * w;
    }
    ctx.strokeStyle = p.gold ? "rgba(240,215,164,0.55)" : "rgba(150,196,255,0.42)";
    ctx.lineWidth = p.gold ? 1.2 : 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + p.len);
    ctx.stroke();
  }
  requestAnimationFrame(skyTick);
}

function openLetter() {
  letterBox.classList.add("on");
  letterBox.setAttribute("aria-hidden", "false");
  sizeSky();
  if (!skyDrops.length) seedDrops();
  if (!skyRun) {
    skyRun = 1;
    requestAnimationFrame(skyTick);
  }
  console.log("打开信");
}

function shutLetter() {
  letterBox.classList.remove("on");
  letterBox.setAttribute("aria-hidden", "true");
  skyRun = 0;
}

letterOpen.addEventListener("click", (e) => {
  e.stopPropagation();
  openLetter();
});
letterClose.addEventListener("click", (e) => {
  e.stopPropagation();
  shutLetter();
});
letterBox.addEventListener("click", (e) => {
  if (e.target === letterBox || e.target === letterSky) shutLetter();
});
window.addEventListener("resize", () => {
  if (letterBox.classList.contains("on")) sizeSky();
});

const composer = new EffectComposer(renderer, {
  multisampling: 4,
  frameBufferType: THREE.HalfFloatType,
});
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({
  intensity: 1.05,
  luminanceThreshold: 0.82,
  luminanceSmoothing: 0.16,
  mipmapBlur: true,
  radius: 0.4,
});
const vignette = new VignetteEffect({ darkness: 0.58, offset: 0.28 });
composer.addPass(new EffectPass(camera, bloom, vignette));

function resize() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  // 竖屏横向视野窄，把相机拉远，树才不会被切掉
  if (w < h) {
    const offset = camera.position.clone().sub(controls.target);
    if (offset.length() < 11.2) {
      camera.position.copy(controls.target).add(offset.setLength(12.4));
      controls.update();
    }
  }
}
window.addEventListener("resize", resize);

const titleEl = document.querySelector("h1");
const cam = document.querySelector("#cam");
const camAsk = document.querySelector("#cam-ask");
const propMats = [];
tree.traverse((obj) => {
  if (obj.isPoints || !obj.material) return;
  const list = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (let i = 0; i < list.length; i++) {
    list[i].transparent = true;
    list[i].userData.baseOpacity = list[i].opacity == null ? 1 : list[i].opacity;
    propMats.push(list[i]);
  }
});
floor.material.transparent = true;
floor.material.userData.baseOpacity = floor.material.opacity == null ? 1 : floor.material.opacity;
propMats.push(floor.material);

let openAmt = 0;
let openTarget = 0;
let fistHold = 0;
let palmHold = 0;
let pinchHold = false;
let pinchWarm = 0;
let pinchReady = true;
let photoAt = 0;
let handMiss = 0;
let gesture = null;
let seenTime = -1;
let handTs = 0;
const camFront = new THREE.Vector3(0, 2.45, 12.4);
const wordTarget = new THREE.Vector3(0, 2.45, 0);
const treeLook = controls.target.clone();
const camHome = camTo.clone();
let framingWords = false;

function handDist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isStraight(lm, tip, pip, mcp) {
  const wrist = lm[0];
  return (
    handDist(lm[tip], wrist) > handDist(lm[pip], wrist) * 1.12 &&
    handDist(lm[tip], wrist) > handDist(lm[mcp], wrist) * 1.28
  );
}

function isCurled(lm, tip, pip, mcp) {
  return handDist(lm[tip], lm[0]) < handDist(lm[mcp], lm[0]) * 1.12;
}

function tipGap(img, world, a, b) {
  return {
    id: Math.hypot(img[a].x - img[b].x, img[a].y - img[b].y),
    wd: world && world.length >= 21 ? handDist(world[a], world[b]) : 99,
  };
}

function readHand() {
  if (!gesture || cam.readyState < 2 || !cam.videoWidth) return;
  if (cam.currentTime === seenTime) return;
  seenTime = cam.currentTime;
  handTs += 40;
  let res;
  try {
    res = gesture.recognizeForVideo(cam, handTs);
  } catch (err) {
    console.error(err);
    handTs += 500;
    return;
  }
  const top = res.gestures && res.gestures[0] && res.gestures[0][0];
  const world = res.worldLandmarks && res.worldLandmarks[0];
  const img = res.landmarks && res.landmarks[0];
  if (!img || img.length < 21) {
    handMiss++;
    if (handMiss < 8 && pinchHold) return;
    held = null;
    pinchHold = false;
    pinchWarm = 0;
    pinchReady = true;
    fistHold = 0;
    palmHold = 0;
    return;
  }
  handMiss = 0;
  const lm = world && world.length >= 21 ? world : img;
  const idx = isStraight(lm, 8, 6, 5);
  const mid = isStraight(lm, 12, 10, 9);
  const ring = isStraight(lm, 16, 14, 13);
  const pinky = isStraight(lm, 20, 18, 17);
  const curls = [
    isCurled(lm, 8, 6, 5),
    isCurled(lm, 12, 10, 9),
    isCurled(lm, 16, 14, 13),
    isCurled(lm, 20, 18, 17),
  ];
  let nStraight = 0;
  let nCurl = 0;
  if (idx) nStraight++;
  if (mid) nStraight++;
  if (ring) nStraight++;
  if (pinky) nStraight++;
  for (let i = 0; i < curls.length; i++) if (curls[i]) nCurl++;
  const named = top && top.categoryName && top.score > 0.55 ? top.categoryName : "";
  // 四指伸直并且识别成掌，才算张开；四指蜷起并且识别成拳，才算握住
  const palmOk = nStraight === 4 && named === "Open_Palm";
  const fistOk = nCurl === 4 && named === "Closed_Fist";
  if (palmOk) {
    palmHold++;
    fistHold = 0;
  } else if (fistOk) {
    fistHold++;
    palmHold = 0;
  } else {
    palmHold = 0;
    fistHold = 0;
  }
  if (palmHold === 8) {
    openTarget = 1;
    held = null;
    pinchHold = false;
    console.log("张开，爱心");
  }
  if (fistHold === 8) {
    openTarget = 0;
    held = null;
    pinchHold = false;
    console.log("握拳，树");
  }

  const ti = tipGap(img, world, 4, 8);
  const midGap = tipGap(img, world, 8, 12);
  // 食指拇指要明显比旁边更近，连续几帧才放大，避免还没捏上就跳
  const pinched = !fistOk && ti.id < 0.055 && ti.id < midGap.id * 0.62;
  const opened = ti.id > 0.12;

  if (opened) pinchReady = true;

  if (pinchHold) {
    if (ti.id < 0.09) return;
    pinchHold = false;
    pinchWarm = 0;
    pinchReady = false;
    held = null;
    console.log("松开，照片回去");
    return;
  }

  if (pinched && pinchReady) {
    pinchWarm++;
    if (pinchWarm >= 5) {
      const photos = photosOnly();
      if (photos.length) {
        held = photos[photoAt % photos.length];
        photoAt++;
        pinchHold = true;
        pinchReady = false;
        console.log("捏合，第", photoAt, "张");
      }
    }
    return;
  }
  pinchWarm = 0;
}

async function makeGesture(vision, delegate) {
  const { GestureRecognizer } = await import("@mediapipe/tasks-vision");
  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/mediapipe/gesture_recognizer.task",
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.25,
    minHandPresenceConfidence: 0.25,
    minTrackingConfidence: 0.25,
  });
}

async function startHand() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    cam.srcObject = stream;
    await cam.play();
    camAsk.hidden = true;
    const { FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "/mediapipe/wasm"
    );
    try {
      gesture = await makeGesture(vision, "GPU");
    } catch (err) {
      console.error(err);
      gesture = await makeGesture(vision, "CPU");
    }
    console.log("手势开始听");
  } catch (err) {
    console.error(err);
    camAsk.hidden = false;
  }
}

camAsk.addEventListener("click", (e) => {
  e.stopPropagation();
  startHand();
});
startHand();

let intro = reduceMotion ? 1 : 0;
let assemble = reduceMotion ? 1 : 0;
let clock = performance.now();
let revealed = false;
let nextFw = 0;

function frame(now) {
  frameBody(now);
  requestAnimationFrame(frame);
}

function frameBody(now) {
  const dt = Math.min(0.033, (now - clock) / 1000);
  clock = now;
  const time = now / 1000;
  uniforms.uTime.value = time;

  if (intro < 1) {
    intro = Math.min(1, intro + dt / 4.8);
    const k = 1 - Math.pow(1 - intro, 3);
    tree.position.y = (1 - k) * -11.4 * TREE_SIZE + k * TREE_REST_Y;
    tree.rotation.y = (1 - k) * Math.PI * 2.7;
    camera.position.lerpVectors(camFrom, camTo, k);
    camera.lookAt(controls.target);
    if (intro >= 1) {
      tree.position.y = TREE_REST_Y;
      tree.rotation.y = 0;
      controls.enabled = true;
      controls.update();
    }
  } else {
    controls.update();
  }

  assemble += (1 - assemble) * (1 - Math.exp(-dt * 0.85));
  uniforms.uAssemble.value = assemble;
  uniforms.uBurst.value *= Math.exp(-dt * 2.4);
  readHand();
  if (held !== prevHeld) {
    if (prevHeld?.userData.kind === "photo") prevHeld.userData.snapBack = 1.2;
    prevHeld = held;
  }
  openAmt += (openTarget - openAmt) * (1 - Math.exp(-dt * 2.2));
  uniforms.uOpen.value = openAmt;
  let pulse = 1;
  if (openAmt > 0.58) {
    const beatT = time * 0.95;
    const dub = Math.pow(Math.max(0, Math.sin(beatT * Math.PI * 2)), 2.8);
    const dub2 = Math.pow(Math.max(0, Math.sin(beatT * Math.PI * 2 - 0.38)), 2.8);
    pulse = 1 + dub * 0.09 + dub2 * 0.06;
  }
  uniforms.uHeartPulse.value = pulse;
  scene.fog.density = 0.011 * (1 - openAmt * 0.35);
  bloom.intensity = 0.62 - openAmt * 0.08;

  hoverPhoto = null;
  if (pointerOn && !held && !pinchHold) {
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(orbits, true);
    for (let h = 0; h < hits.length; h++) {
      let root = hits[h].object;
      while (root && root.userData.kind !== "photo") root = root.parent;
      if (root?.userData.kind === "photo") {
        hoverPhoto = root;
        break;
      }
    }
  }

  if (hoverPhoto !== prevHover) {
    if (prevHover && prevHover !== held) prevHover.userData.snapBack = 1.2;
    prevHover = hoverPhoto;
  }
  titleEl.style.opacity = held || hoverPhoto ? "0.55" : "1";

  if (intro >= 1 && !reduceMotion && !pressing && !held && !hoverPhoto) {
    controls.autoRotate = true;
  }

  const ball = openAmt;
  const born = reduceMotion ? 1 : Math.min(1, Math.max(0, (assemble - 0.58) / 0.28));
  for (let i = 0; i < orbits.length; i++) {
    const obj = orbits[i];
    const photo = obj.userData.kind === "photo";
    obj.userData.ang += dt * (photo ? 0.32 : obj.userData.spin * 0.75);
    const ang = obj.userData.ang;
    if (photo) {
      // 握拳时绕着树，张开时改到爱心外面
      const tx = Math.cos(ang) * 6.5;
      const tz = Math.sin(ang) * 6.5;
      const ty = 1.55 + (Math.sin(ang) * 0.5 + 0.5) * 4.6;
      const hx = Math.cos(ang) * 8.1;
      const hy = heartY + Math.sin(ang) * 5.05;
      orbitHome.set(tx + (hx - tx) * ball, ty + (hy - ty) * ball, tz + (1.4 - tz) * ball);
    } else {
      orbitHome.set(Math.cos(ang) * obj.userData.rad, obj.userData.y0, Math.sin(ang) * obj.userData.rad);
    }
    obj.visible = photo ? true : ball < 0.4;
    const focus = obj === held || (photo && obj === hoverPhoto);
    if (focus) {
      if (obj === hoverPhoto && obj !== held) {
        raycaster.setFromCamera(pointerNdc, camera);
        orbitDest.copy(raycaster.ray.direction).multiplyScalar(7.6).add(camera.position);
      } else {
        camera.getWorldDirection(orbitDest);
        orbitDest.multiplyScalar(7.6).add(camera.position);
      }
      obj.position.lerp(orbitDest, 1 - Math.exp(-dt * 7));
      obj.lookAt(camera.position);
      const big = obj.userData.home * (obj.userData.heldMul || 3.22);
      orbitScale.set(big, big, big);
      obj.scale.lerp(orbitScale, 1 - Math.exp(-dt * 8));
    } else {
      const backFast = photo && (obj.userData.snapBack || 0) > 0;
      if (backFast) obj.userData.snapBack -= dt * 2.8;
      const posK = backFast ? 14 : 4.5;
      obj.position.lerp(orbitHome, 1 - Math.exp(-dt * posK));
      if (photo) obj.lookAt(camera.position);
      else {
        obj.rotation.y = ang + time * 0.4;
        obj.rotation.z = Math.sin(time * 0.7 + obj.userData.phase) * 0.12;
      }
      let s = obj.userData.home;
      if (photo) s *= (0.99 + ball * 0.22) * Math.max(born, ball * 0.85 + 0.12);
      else s *= (1 - ball) * born;
      if ((held || hoverPhoto) && photo && obj !== hoverPhoto) s *= 0.72;
      orbitScale.set(s, s, s);
      const scaleK = backFast ? 16 : 5;
      obj.scale.lerp(orbitScale, 1 - Math.exp(-dt * scaleK));
    }
  }

  const treeFade = (1 - openAmt) * born;
  for (let i = 0; i < propMats.length; i++) {
    const m = propMats[i];
    if (m === starGlow.material || m === starHalo.material) continue;
    m.opacity = m.userData.baseOpacity * treeFade;
  }

  pointerTarget = pointerOn ? 1 : 0;
  uniforms.uPointerAmt.value += (pointerTarget - uniforms.uPointerAmt.value) * (1 - Math.exp(-dt * 6));
  if (pointerOn) {
    raycaster.setFromCamera(pointerNdc, camera);
    raycaster.ray.closestPointToPoint(treeHeart, pointerWorld);
    uniforms.uPointer.value.copy(pointerWorld);
  }

  treeLamp.intensity = (7 + Math.sin(time * 2.4) * 1.4) * treeFade;
  starLamp.intensity = 9 * treeFade;
  starPivot.lookAt(camera.position);
  star.rotation.z = time * 0.18;
  starGlow.material.opacity = (0.88 + Math.sin(time * 2.2) * 0.08) * treeFade;
  starHalo.material.opacity = (0.38 + Math.sin(time * 1.6) * 0.08) * treeFade;
  ringPts.rotation.y = time * 0.55;
  ringMat.opacity = 0.92 * treeFade;

  // 一进来就放，左右接着放，间隔短一点
  if (!reduceMotion && time >= nextFw) {
    bothSides();
    nextFw = time + 1.05 + Math.random() * 0.4;
  }

  let fwDirty = false;
  for (let i = 0; i < fwN; i++) {
    if (fwLife[i] <= 0) continue;
    fwLife[i] -= dt;
    fwVel[i].y -= 0.62 * dt;
    const o = i * 3;
    fwPos[o] += fwVel[i].x * dt;
    fwPos[o + 1] += fwVel[i].y * dt;
    fwPos[o + 2] += fwVel[i].z * dt;
    const fade = Math.max(0, fwLife[i]);
    fwColor[o] *= 0.994;
    fwColor[o + 1] *= 0.994;
    fwColor[o + 2] *= 0.994;
    if (fwLife[i] <= 0) {
      fwPos[o + 1] = -30;
      fwColor[o] = 0;
      fwColor[o + 1] = 0;
      fwColor[o + 2] = 0;
    } else if (fade < 0.2) {
      fwColor[o] *= 0.9;
    }
    fwDirty = true;
  }
  if (fwDirty) {
    fwGeo.attributes.position.needsUpdate = true;
    fwGeo.attributes.color.needsUpdate = true;
  }

  composer.render(dt);

  if (!revealed) {
    revealed = true;
    veil.classList.add("off");
    console.log("树长好了", { foliage: foliageN, lights: lightN, tinsel: tinselN });
  }
}

requestAnimationFrame(frame);
console.log("圣诞树场景启动");
