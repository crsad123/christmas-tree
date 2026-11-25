import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer, EffectPass, RenderPass, BloomEffect, VignetteEffect } from "postprocessing";
import "./style.css";

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

varying vec3 vColor;
varying float vAlpha;
varying float vKind;

void main() {
  float form = smoothstep(aDelay, aDelay + 0.22, uAssemble);
  vec3 treePos = position;
  float rad = length(treePos.xz);
  float ribbon = step(0.15, aKind) * (1.0 - step(0.45, aKind));
  if (rad > 0.001) {
    float ang = atan(treePos.z, treePos.x) + uTime * mix(0.72, 1.85, ribbon);
    treePos.x = cos(ang) * rad;
    treePos.z = sin(ang) * rad;
  }
  vec3 settled = mix(treePos, aAlt, uOpen);
  float scatter = sin(clamp(uOpen, 0.0, 1.0) * 3.14159265);
  float letterish = step(1.5, aAltKind);
  float spin = uTime * 2.4 + aPhase * 6.28318;
  vec3 boom = aChaos;
  float swirl = scatter * (2.4 + aPhase * 3.2) * (1.0 - letterish * 0.7);
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
  pos += heartDir * uBurst * (0.28 + aPhase * 0.9);

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
  scaleNow *= 1.0 + scatter * 0.35 * (1.0 - step(1.5, shown));
  vec3 colNow = mix(aColor, aAltColor, uOpen);
  if (shown > 1.5) {
    gl_PointSize = clamp(scaleNow * (360.0 / max(1.0, -mv.z)), 3.2, 15.0);
  } else {
    gl_PointSize = clamp(scaleNow * (0.9 + blink * 0.2) * (255.0 / max(1.0, -mv.z)), 1.7, 28.0);
  }
  vColor = colNow * blink * uGain;
  vAlpha = shown > 1.5 ? 1.0 : 0.9;
  float isLetter = step(1.5, shown);
  float field = smoothstep(0.3, 0.85, uOpen) * (1.0 - isLetter);
  vColor *= mix(1.0, 0.2, field);
  gl_PointSize *= mix(1.0, 0.5, field);
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
renderer.setClearColor(0x07111f, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07111f);
scene.fog = new THREE.FogExp2(0x07111f, 0.011);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 90);
const narrow0 = window.innerWidth < window.innerHeight;
const camFrom = new THREE.Vector3(3.6, 7.4, narrow0 ? 24 : 18);
const camTo = new THREE.Vector3(narrow0 ? 0.04 : 0.06, narrow0 ? 5.45 : 5.25, narrow0 ? 21.2 : 18.6);
camera.position.copy(reduceMotion ? camTo : camFrom);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 5.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.22;
controls.minDistance = 6.5;
controls.maxDistance = 22;
controls.minPolarAngle = 0.72;
controls.maxPolarAngle = 1.45;
controls.enabled = reduceMotion;
controls.update();

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
pmrem.dispose();

scene.add(new THREE.AmbientLight(0xc9d8ea, 0.42));
const hemi = new THREE.HemisphereLight(0xf5f8ff, 0x0b1828, 0.62);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xe7eef8, 0.85);
sun.position.set(-4, 8, 6);
scene.add(sun);

const treeLamp = new THREE.PointLight(0xd5e6ff, 8, 10, 2);
treeLamp.position.set(0.15, 3.2, 0.4);
scene.add(treeLamp);
const starLamp = new THREE.PointLight(0xfff4dd, 26, 7, 2);
starLamp.position.set(0, 6.58, 0.2);
scene.add(starLamp);

const uniforms = {
  uTime: { value: 0 },
  uAssemble: { value: reduceMotion ? 1 : 0 },
  uBurst: { value: 0 },
  uPointer: { value: new THREE.Vector3(0, 2.4, 20) },
  uPointerAmt: { value: 0 },
  uGain: { value: 1 },
  uOpen: { value: 0 },
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
  const y = (1 - t) * 6.15 + 0.22;
  const envelope = 0.05 + Math.pow(t, 1.06) * 2.42;
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
  const rad = 7 + Math.pow(Math.random(), 0.45) * 18;
  const y = (Math.random() - 0.42) * 18;
  return [Math.cos(ang) * rad, y, Math.sin(ang) * rad * 0.72];
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
  buf.delay[i] = Math.random() * 0.18 + (1 - (p.t || 0)) * 0.06;
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

// 没被写成字母的粒子，张开手时散成满天星
function putStar(buf, i) {
  const ang = Math.random() * Math.PI * 2;
  const rad = 7.2 + Math.random() * 11;
  const o = i * 3;
  buf.alt[o] = Math.cos(ang) * rad;
  buf.alt[o + 1] = -1.4 + Math.random() * 12.5;
  buf.alt[o + 2] = Math.sin(ang) * rad * (0.6 + Math.random() * 0.7);
  const warm = Math.random() < 0.18;
  const col = new THREE.Color(warm ? 0xf2d7a6 : 0xf4f7fb);
  const gain = warm ? 1.7 : 1.05;
  buf.altColor[o] = col.r * gain;
  buf.altColor[o + 1] = col.g * gain;
  buf.altColor[o + 2] = col.b * gain;
  buf.altScale[i] = 0.16 + Math.random() * (warm ? 0.7 : 0.42);
  buf.altKind[i] = 0;
}

function fillStars(buf) {
  const n = buf.altScale.length;
  for (let i = 0; i < n; i++) putStar(buf, i);
}

const foliageN = 20000;
const foliage = alloc(foliageN);
const iceIn = [0xb7c9db, 0xc9d8e8, 0xd5e2ef];
const iceOut = [0xeef4fb, 0xf7fbff, 0xffffff];

for (let i = 0; i < foliageN; i++) {
  const p = branchSample();
  let color = iceIn[i % 3];
  let scale = 0.22 + Math.random() * 0.28;
  if (p.radial > 0.62) {
    color = iceOut[i % 3];
    scale = 0.32 + Math.random() * 0.4;
  }
  if (Math.random() < 0.045) color = 0xf4e4c0;
  pushPoint(foliage, i, p, color, scale, 0);
  const o = i * 3;
  const gain = p.radial > 0.75 ? 1.85 : 1.45;
  foliage.color[o] *= gain;
  foliage.color[o + 1] *= gain;
  foliage.color[o + 2] *= gain;
}

const lightN = 520;
const lights = alloc(lightN);
const bulbs = [0xfff8ee, 0xf0d59a, 0xd7ebff, 0xffffff];
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

// 三股银丝绕着锥面走，kind 0.25 用来转得更快
const ribbonCount = 3;
const perRibbon = 1700;
const tinselN = ribbonCount * perRibbon;
const tinsel = alloc(tinselN);
for (let r = 0; r < ribbonCount; r++) {
  for (let i = 0; i < perRibbon; i++) {
    const t = i / (perRibbon - 1);
    const ang = t * 4.6 * Math.PI * 2 + (r / ribbonCount) * Math.PI * 2;
    const envelope = 0.08 + Math.pow(t, 1.04) * 2.52;
    const radius = envelope + (Math.random() - 0.5) * 0.07;
    const p = {
      x: Math.cos(ang) * radius,
      y: (1 - t) * 6.15 + 0.22 + (Math.random() - 0.5) * 0.05,
      z: Math.sin(ang) * radius,
      t,
    };
    const idx = r * perRibbon + i;
    const color = r === 1 ? 0xfff6e2 : 0xf4f8ff;
    pushPoint(tinsel, idx, p, color, 0.28 + Math.random() * 0.22, 0.25);
    const o = idx * 3;
    tinsel.color[o] *= 2.35;
    tinsel.color[o + 1] *= 2.35;
    tinsel.color[o + 2] *= 2.35;
  }
}

fillStars(foliage);
fillStars(lights);
fillStars(tinsel);

const tree = new THREE.Group();
scene.add(tree);
const foliagePts = new THREE.Points(toGeo(foliage), foliageMat);
const lightPts = new THREE.Points(toGeo(lights), lightMat);
const tinselPts = new THREE.Points(toGeo(tinsel), tinselMat);
tree.add(foliagePts);
tree.add(lightPts);
tree.add(tinselPts);

function touchPts(pts) {
  const g = pts.geometry;
  g.getAttribute("aAlt").needsUpdate = true;
  g.getAttribute("aAltColor").needsUpdate = true;
  g.getAttribute("aAltScale").needsUpdate = true;
  g.getAttribute("aAltKind").needsUpdate = true;
}

// 衬线笔画上均匀撒点，每格只留一颗，字才站得住
async function stampWords() {
  try {
    await Promise.race([
      document.fonts.ready.then(() => document.fonts.load('italic 280px "Cormorant Garamond"')),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (err) {
    console.error(err);
  }
  const c = document.createElement("canvas");
  c.width = 2400;
  c.height = 980;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const family = '"Cormorant Garamond", Palatino, Georgia, serif';
  let size = 300;
  g.font = "italic " + size + "px " + family;
  if ("letterSpacing" in g) g.letterSpacing = "8px";
  while (g.measureText("leaned toward you").width > 2140 && size > 150) {
    size -= 6;
    g.font = "italic " + size + "px " + family;
  }
  const lines = [
    ["Every light", c.height * 0.36],
    ["leaned toward you", c.height * 0.68],
  ];
  for (let i = 0; i < lines.length; i++) {
    g.fillText(lines[i][0], c.width / 2, lines[i][1]);
  }
  const img = g.getImageData(0, 0, c.width, c.height).data;
  const cell = 2;
  const ink = [];
  for (let y = 0; y < c.height; y += cell) {
    for (let x = 0; x < c.width; x += cell) {
      const px = Math.min(c.width - 1, x + 1);
      const py = Math.min(c.height - 1, y + 1);
      if (img[(py * c.width + px) * 4 + 3] > 150) ink.push(px, py);
    }
  }
  const pairs = ink.length / 2;
  if (!pairs) {
    console.log("文字没采到");
    return;
  }
  const col = new THREE.Color(0xf7fbff);
  const cap = 7200;
  const budget = Math.min(cap, pairs, foliage.altScale.length);
  const stride = pairs / budget;
  for (let i = 0; i < budget; i++) {
    const id = Math.min(pairs - 1, Math.floor(i * stride));
    const x = ink[id * 2];
    const y = ink[id * 2 + 1];
    const o = i * 3;
    foliage.alt[o] = (x / c.width - 0.5) * 10.4;
    foliage.alt[o + 1] = (0.5 - y / c.height) * 3.85 + 2.35;
    foliage.alt[o + 2] = 0;
    foliage.altColor[o] = col.r;
    foliage.altColor[o + 1] = col.g;
    foliage.altColor[o + 2] = col.b;
    foliage.altScale[i] = 0.34;
    foliage.altKind[i] = 2;
  }
  touchPts(foliagePts);
  touchPts(lightPts);
  touchPts(tinselPts);
  console.log("文字采样", pairs, "用了", budget, "字号", size);
}
stampWords();

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
  color: 0xf8e2a8,
  emissive: 0xfff0c8,
  emissiveIntensity: 0.55,
  metalness: 0.92,
  roughness: 0.18,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
});
const starPivot = new THREE.Group();
starPivot.position.y = 6.58;
const star = new THREE.Mesh(makeStarShape(), starMat);
star.scale.setScalar(1.22);
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
  core.addColorStop(0, "rgba(255,252,240,0.95)");
  core.addColorStop(0.45, "rgba(255,214,140,0.28)");
  core.addColorStop(1, "rgba(255,214,140,0)");
  g.fillStyle = core;
  g.fillRect(-256, -256, 512, 512);
  const rays = 10;
  for (let i = 0; i < rays; i++) {
    g.save();
    g.rotate((i / rays) * Math.PI);
    const long = i % 2 === 0;
    const len = long ? 228 : 128;
    const grad = g.createLinearGradient(-len, 0, len, 0);
    grad.addColorStop(0, "rgba(255,220,150,0)");
    grad.addColorStop(0.38, long ? "rgba(255,236,190,0.9)" : "rgba(255,214,150,0.4)");
    grad.addColorStop(0.5, "rgba(255,252,244,1)");
    grad.addColorStop(0.62, long ? "rgba(255,236,190,0.9)" : "rgba(255,214,150,0.4)");
    grad.addColorStop(1, "rgba(255,220,150,0)");
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
    color: 0xffe2a8,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0.95,
  })
);
starGlow.position.y = 6.58;
starGlow.scale.set(3.55, 3.55, 1);
starGlow.renderOrder = 4;
tree.add(starGlow);

const starHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: circleTex(),
    color: 0xffd98a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 0.42,
  })
);
starHalo.position.y = 6.58;
starHalo.scale.set(0.85, 0.85, 1);
starHalo.renderOrder = 3;
tree.add(starHalo);

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

const snowN = 1600;
const snowPos = new Float32Array(snowN * 3);
const snowSpeed = new Float32Array(snowN);
for (let i = 0; i < snowN; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 16;
  snowPos[i * 3 + 1] = Math.random() * 9;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
  snowSpeed[i] = 0.65 + Math.random() * 1.15;
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
scene.add(new THREE.Points(snowGeo, snowMat));

// 远处的星，不跟着雪落
const skyN = 1600;
const skyPos = new Float32Array(skyN * 3);
for (let i = 0; i < skyN; i++) {
  const ang = Math.random() * Math.PI * 2;
  const elev = Math.random() * Math.PI * 0.55 + 0.15;
  const rad = 16 + Math.random() * 18;
  skyPos[i * 3] = Math.cos(ang) * Math.sin(elev) * rad;
  skyPos[i * 3 + 1] = Math.cos(elev) * rad * 0.45 + 2;
  skyPos[i * 3 + 2] = Math.sin(ang) * Math.sin(elev) * rad;
}
const skyGeo = new THREE.BufferGeometry();
skyGeo.setAttribute("position", new THREE.BufferAttribute(skyPos, 3));
const skyMat = snowMat.clone();
skyMat.size = 0.07;
skyMat.opacity = 0.75;
skyMat.blending = THREE.AdditiveBlending;
scene.add(new THREE.Points(skyGeo, skyMat));

// 树脚几圈光环，整圈一起转
const ringN = 5400;
const ringPos = new Float32Array(ringN * 3);
const ringCol = new Float32Array(ringN * 3);
const ringRadii = [2.25, 3.45, 4.85, 6.35];
for (let i = 0; i < ringN; i++) {
  const ring = i % ringRadii.length;
  const ang = Math.random() * Math.PI * 2;
  const rad = ringRadii[ring] + (Math.random() - 0.5) * (0.16 + ring * 0.06);
  ringPos[i * 3] = Math.cos(ang) * rad;
  ringPos[i * 3 + 1] = 0.03 + Math.random() * 0.28;
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
  const rad = Math.pow(Math.random(), 0.55) * 4.4;
  groundPos[i * 3] = Math.cos(ang) * rad;
  groundPos[i * 3 + 1] = 0.02 + Math.random() * 0.05;
  groundPos[i * 3 + 2] = Math.sin(ang) * rad;
}
const groundGeo = new THREE.BufferGeometry();
groundGeo.setAttribute("position", new THREE.BufferAttribute(groundPos, 3));
const groundSnow = new THREE.Points(groundGeo, snowMat.clone());
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
  new THREE.CircleGeometry(7.5, 64),
  new THREE.MeshBasicMaterial({ map: groundDisc(), transparent: true, depthWrite: false })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.01;
scene.add(floor);

const fwN = 640;
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
    size: 0.09,
    map: snowTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
);
scene.add(fwPoints);

let fwCursor = 0;
const fwPalette = [0xffe7a8, 0xff3148, 0xfff8ea, 0x8dffb4, 0x9fd4ff, 0xffb03a];

function spawnBurst(origin) {
  const batch = 220;
  for (let i = 0; i < batch; i++) {
    const idx = (fwCursor + i) % fwN;
    const o = idx * 3;
    fwPos[o] = origin.x;
    fwPos[o + 1] = origin.y;
    fwPos[o + 2] = origin.z;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 1.4 + Math.random() * 4.4;
    fwVel[idx].set(
      Math.sin(phi) * Math.cos(theta) * speed,
      Math.abs(Math.cos(phi)) * speed * 0.85 + 0.4,
      Math.sin(phi) * Math.sin(theta) * speed
    );
    fwLife[idx] = 0.7 + Math.random() * 0.7;
    const col = new THREE.Color(fwPalette[idx % fwPalette.length]);
    fwColor[o] = col.r * 2.2;
    fwColor[o + 1] = col.g * 2.2;
    fwColor[o + 2] = col.b * 2.2;
  }
  fwCursor = (fwCursor + batch) % fwN;
  fwGeo.attributes.position.needsUpdate = true;
  fwGeo.attributes.color.needsUpdate = true;
  uniforms.uBurst.value = 1;
  if (soundOn) ting();
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const pointerWorld = new THREE.Vector3();
const treeHeart = new THREE.Vector3(0, 2.6, 0);
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
    raycaster.setFromCamera(pointerNdc, camera);
    raycaster.ray.closestPointToPoint(treeHeart, pointerWorld);
    pointerWorld.lerp(treeHeart, 0.28);
    spawnBurst(pointerWorld);
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

const composer = new EffectComposer(renderer, {
  multisampling: 4,
  frameBufferType: THREE.HalfFloatType,
});
composer.addPass(new RenderPass(scene, camera));
const bloom = new BloomEffect({
  intensity: 1.05,
  luminanceThreshold: 0.74,
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
let openScore = 0;
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

// 指尖离指根比中间关节更远，就算这根手指伸直了
function fingerOpen(lm, tip, pip, mcp) {
  return handDist(lm[tip], lm[mcp]) > handDist(lm[pip], lm[mcp]) * 1.15;
}

function openFingers(lm) {
  const ids = [
    [8, 6, 5],
    [12, 10, 9],
    [16, 14, 13],
    [20, 18, 17],
  ];
  let n = 0;
  for (let i = 0; i < ids.length; i++) {
    if (fingerOpen(lm, ids[i][0], ids[i][1], ids[i][2])) n++;
  }
  return n;
}

function noteHand(open) {
  if (open) openScore = Math.min(1, openScore + 0.45);
  else openScore = Math.max(0, openScore - 0.45);
  if (openScore > 0.55) openTarget = 1;
  else if (openScore < 0.45) openTarget = 0;
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
  const lm = (res.worldLandmarks && res.worldLandmarks[0]) || (res.landmarks && res.landmarks[0]);
  let want = null;
  if (top && top.categoryName && top.categoryName !== "None" && top.score > 0.4) {
    if (top.categoryName === "Open_Palm" || top.categoryName === "Victory" || top.categoryName === "ILoveYou") want = true;
    else if (top.categoryName === "Closed_Fist") want = false;
  }
  if (lm && lm.length >= 21) {
    const n = openFingers(lm);
    if (n >= 3) want = true;
    else if (n <= 1) want = false;
  }
  if (want === true) noteHand(true);
  else if (want === false) noteHand(false);
}

async function makeGesture(vision, delegate) {
  const { GestureRecognizer } = await import("@mediapipe/tasks-vision");
  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
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
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm"
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
    intro = Math.min(1, intro + dt / 2.3);
    const k = 1 - Math.pow(1 - intro, 3);
    camera.position.lerpVectors(camFrom, camTo, k);
    camera.lookAt(controls.target);
    if (intro >= 1) {
      controls.enabled = true;
      controls.update();
    }
  } else {
    controls.update();
  }

  const asmTarget = 1;
  assemble += (asmTarget - assemble) * (1 - Math.exp(-dt * 1.55));
  uniforms.uAssemble.value = assemble;
  uniforms.uBurst.value *= Math.exp(-dt * 2.4);
  readHand();
  openAmt += (openTarget - openAmt) * (1 - Math.exp(-dt * 2.6));
  uniforms.uOpen.value = openAmt;
  titleEl.style.opacity = openAmt > 0.42 ? "0" : String(1 - openAmt / 0.42);
  scene.fog.density = 0.011 * (1 - openAmt * 0.45);
  bloom.intensity = 1.05 - openAmt * 0.9;

  if (intro >= 1 && openAmt > 0.04 && !pressing) {
    framingWords = true;
    controls.autoRotate = false;
    const k = 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(camFront, k);
    controls.target.lerp(wordTarget, k);
  } else if (intro >= 1 && framingWords && openTarget < 0.5 && !pressing) {
    const k = 1 - Math.exp(-dt * 1.8);
    camera.position.lerp(camHome, k);
    controls.target.lerp(treeLook, k);
    controls.autoRotate = !reduceMotion;
    if (camera.position.distanceTo(camHome) < 0.06) framingWords = false;
  } else if (intro >= 1 && !reduceMotion && openTarget < 0.5 && !pressing) {
    controls.autoRotate = true;
  }

  const born = reduceMotion ? 1 : Math.min(1, Math.max(0, (assemble - 0.72) / 0.22));
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
  starLamp.intensity = 14 * treeFade;
  starPivot.lookAt(camera.position);
  star.rotation.z = time * 0.18;
  starGlow.material.opacity = (0.88 + Math.sin(time * 2.2) * 0.08) * treeFade;
  starHalo.material.opacity = (0.38 + Math.sin(time * 1.6) * 0.08) * treeFade;
  ringPts.rotation.y = time * 0.55;
  ringMat.opacity = 0.92 * treeFade;

  const posAttr = snowGeo.attributes.position;
  for (let i = 0; i < snowN; i++) {
    let y = snowPos[i * 3 + 1] - snowSpeed[i] * dt;
    let x = snowPos[i * 3] + Math.sin(time * 1.3 + i) * 0.22 * dt;
    if (y < -0.2) {
      y = 8.2;
      x = (Math.random() - 0.5) * 16;
      snowPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    snowPos[i * 3] = x;
    snowPos[i * 3 + 1] = y;
  }
  posAttr.needsUpdate = true;

  let fwDirty = false;
  for (let i = 0; i < fwN; i++) {
    if (fwLife[i] <= 0) continue;
    fwLife[i] -= dt;
    fwVel[i].y -= 2.8 * dt;
    const o = i * 3;
    fwPos[o] += fwVel[i].x * dt;
    fwPos[o + 1] += fwVel[i].y * dt;
    fwPos[o + 2] += fwVel[i].z * dt;
    const fade = Math.max(0, fwLife[i]);
    fwColor[o] *= 0.985;
    fwColor[o + 1] *= 0.985;
    fwColor[o + 2] *= 0.985;
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
