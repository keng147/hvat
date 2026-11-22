// 3D-основа игры: рендер с тенями, управление, физика героя, подписи над объектами, искры.
// Three.js r160 лежит рядом с игрой, чтобы запуск не зависел от чужого сервера. Подключён путём к файлу,
// а не через importmap: importmap не работает на iOS младше 16.4.
import * as THREE from './vendor/three.module.min.js';
import { paint } from './icons.js';
export { THREE };

const $ = id => document.getElementById(id);
const canvas = $('cv');
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 260); // дальше 260 всё равно туман
export const solids = []; // препятствия-коробки: { x, y, z, hx, hy, hz }
let renderer = null, sun = null;

// ---------- качество ----------
// Уровни: 0 — всё включено, 1 — меньше точек на экране, 2 — ещё и без теней от солнца (пятна под предметами остаются).
// С какого уровня начать, подсказывает Telegram: на Android он пишет класс устройства в конце User-Agent.
// Дальше игра сама снижает качество, если кадры идут слишком медленно, и запоминает это на устройстве.
// Обратно не поднимает: картинка, которая скачет туда-сюда, хуже ровной.
const QUALITY = [{ pixels: 2, shadows: true }, { pixels: 1.5, shadows: true }, { pixels: 1, shadows: false }];
const QUALITY_KEY = 'hvat-quality', SLOW_FRAME = 1 / 38, SLOW_SECONDS = 2.5;
let quality = 0, slowTime = 0, warmUp = 2; // warmUp: первые секунды не считаем, там грузится мир
function startQuality() {
  const hint = /; LOW\)/.test(navigator.userAgent) ? 2 : /; AVERAGE\)/.test(navigator.userAgent) ? 1 : 0;
  let saved = 0;
  try { saved = Number(localStorage.getItem(QUALITY_KEY)) || 0; } catch {}
  quality = THREE.MathUtils.clamp(Math.max(hint, saved), 0, QUALITY.length - 1);
}
function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[quality].pixels));
  sun.castShadow = QUALITY[quality].shadows;
  resize();
}
// frameTime: настоящее время кадра в секундах. Долгие паузы (вкладку свернули) кадрами не считаются.
function watchSpeed(frameTime) {
  if ((warmUp -= frameTime) > 0 || frameTime > 0.5 || quality === QUALITY.length - 1) return;
  slowTime = frameTime > SLOW_FRAME ? slowTime + frameTime : Math.max(0, slowTime - frameTime * 2);
  if (slowTime < SLOW_SECONDS) return;
  slowTime = 0;
  quality++;
  try { localStorage.setItem(QUALITY_KEY, quality); } catch {}
  applyQuality();
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 62 : 50; // на вертикальном экране обзор шире
  camera.updateProjectionMatrix();
}

// Бросает исключение, если на устройстве нет WebGL.
export function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Сила света подобрана так, чтобы белый снег и светлый песок не выгорали: небо и солнце вместе дают чуть больше единицы.
  // Тональная коррекция (ACES) здесь не годится: она гасит пересвет, но заодно выбеливает мультяшные цвета.
  // Свет снизу синеватый: тени получаются холодными и чистыми, а не грязно-оливковыми.
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x8f9bea, 1.6));
  sun = new THREE.DirectionalLight(0xffedcf, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 100 }); // камера смотрит полого и видит далеко
  scene.add(sun, sun.target);
  addEventListener('resize', resize);
  startQuality();
  applyQuality();
}
// Сколько работы у видеокарты в последнем кадре: число вызовов отрисовки и треугольников. Для замеров.
export const renderStats = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, quality });
// Тени считаются только вокруг героя, поэтому солнце ездит за ним.
export function aimSun(x, z) {
  sun.position.set(x + 14, 32, z + 12);
  sun.target.position.set(x, 0, z);
}
export function setSky(top, bottom) {
  const gradientCanvas = document.createElement('canvas');
  gradientCanvas.width = 2;
  gradientCanvas.height = 256;
  const g = gradientCanvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(gradientCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  scene.background = texture;
  scene.fog = new THREE.Fog(bottom, 55, 170);
}

// ---------- управление ----------
// x, y: стик от -1 до 1 (y вниз). jump: сколько секунд ещё помнить нажатие прыжка.
export const input = { x: 0, y: 0, jump: 0 };
const JUMP_MEMORY = 0.12; // прыжок, нажатый чуть раньше приземления, всё равно сработает
const STICK_RADIUS = 48;
const keys = new Set();
const ring = $('stick'), knob = $('knob');
let stickPointer = null, stickX = 0, stickY = 0;

// ---------- масштаб ----------
// zoom больше 1 — камера дальше. Меняется колесом мыши, щипком двумя пальцами и кнопками, запоминается на устройстве.
const ZOOM_MIN = 0.6, ZOOM_MAX = 1.8, ZOOM_STEP = 1.25, ZOOM_KEY = 'hvat-zoom';
const clampZoom = value => THREE.MathUtils.clamp(Number(value) || 1, ZOOM_MIN, ZOOM_MAX);
export const lens = { zoom: 1 };
try { lens.zoom = clampZoom(localStorage.getItem(ZOOM_KEY)); } catch {}
function zoomBy(factor) {
  lens.zoom = clampZoom(lens.zoom * factor);
  try { localStorage.setItem(ZOOM_KEY, lens.zoom); } catch {}
}
$('zoom-in').addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
$('zoom-out').addEventListener('click', () => zoomBy(ZOOM_STEP));
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomBy(Math.exp(e.deltaY * 0.001));
}, { passive: false });

const fingers = new Map(); // пальцы на игровом поле: номер → [x, y]
let pinch = 0;             // расстояние между двумя пальцами в прошлый раз; 0, пока щипка нет
function spread() {
  const [a, b] = [...fingers.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function releaseStick() {
  stickPointer = null;
  input.x = input.y = 0;
  ring.hidden = true;
}
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); // иначе палец, отпущенный над кнопкой, оставил бы стик зажатым
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (fingers.size > 1) { // второй палец: это щипок, а не бег
    releaseStick();
    pinch = fingers.size === 2 ? spread() : 0;
    return;
  }
  stickPointer = e.pointerId;
  stickX = e.clientX;
  stickY = e.clientY;
  ring.style.left = stickX + 'px';
  ring.style.top = stickY + 'px';
  knob.style.transform = '';
  ring.hidden = false;
});
canvas.addEventListener('pointermove', e => {
  if (!fingers.has(e.pointerId)) return;
  fingers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && fingers.size === 2) {
    const now = spread();
    if (now > 0) zoomBy(pinch / now);
    pinch = now;
    return;
  }
  if (e.pointerId !== stickPointer) return;
  let dx = e.clientX - stickX, dy = e.clientY - stickY;
  const length = Math.hypot(dx, dy);
  if (length > STICK_RADIUS) {
    dx *= STICK_RADIUS / length;
    dy *= STICK_RADIUS / length;
  }
  input.x = dx / STICK_RADIUS;
  input.y = dy / STICK_RADIUS;
  knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
});
for (const type of ['pointerup', 'pointercancel']) {
  canvas.addEventListener(type, e => {
    fingers.delete(e.pointerId);
    pinch = 0;
    if (e.pointerId === stickPointer) releaseStick();
  });
}
$('jump').addEventListener('pointerdown', () => { input.jump = JUMP_MEMORY; });
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Space' && !e.repeat) input.jump = JUMP_MEMORY;
});
addEventListener('keyup', e => keys.delete(e.code));
const held = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);

// Направление движения по стику, длина не больше 1.
export function moveVector() {
  let x = input.x, z = input.y;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  return { x, z };
}

// ---------- физика героя ----------
const GRAVITY = 30, JUMP_SPEED = 10, MAX_FALL = 25;
const COYOTE = 0.1;    // можно прыгнуть чуть позже схода с края
const EPS = 1e-4;      // запас, чтобы касание гранью не считалось столкновением
const EDGE_GRIP = 0.6; // провалившись под край острова глубже этого, назад на него уже не встать

export function createBody(x, y, z) {
  return { pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), hx: 0.35, hy: 0.6, hz: 0.35, sinceGround: 9 };
}
function touches(body, b) {
  const p = body.pos;
  return Math.abs(p.x - b.x) < body.hx + b.hx - EPS
    && Math.abs(p.y - b.y) < body.hy + b.hy - EPS
    && Math.abs(p.z - b.z) < body.hz + b.hz - EPS;
}
// floorAt(x, z) возвращает высоту земли в точке или -Infinity над водой.
// jumps: слушает ли это тело кнопку прыжка (герой да, боты нет).
// Кадр делится на шаги не длиннее MAX_STEP: иначе на большой скорости и слабом телефоне тело проскакивает тонкие стены вроде перил.
const MAX_STEP = 0.3;
export function stepBody(body, dt, moveX, moveZ, speed, floorAt, jumps = false) {
  const steps = Math.max(1, Math.ceil(Math.hypot(moveX, moveZ) * speed * dt / MAX_STEP));
  for (let i = 0; i < steps; i++) moveBody(body, dt / steps, moveX, moveZ, speed, floorAt, jumps);
}
function moveBody(body, dt, moveX, moveZ, speed, floorAt, jumps) {
  const { pos, vel } = body;
  vel.x = moveX * speed;
  vel.z = moveZ * speed;
  vel.y = Math.max(vel.y - GRAVITY * dt, -MAX_FALL);
  body.sinceGround += dt;
  if (jumps && input.jump > 0 && body.sinceGround < COYOTE) {
    vel.y = JUMP_SPEED;
    body.sinceGround = 9;
    body.jumped = true; // игра прочтёт и сбросит: по этому флажку звучит прыжок
    input.jump = 0;
  }
  for (const axis of ['x', 'z', 'y']) {
    const v = vel[axis];
    if (!v) continue;
    pos[axis] += v * dt;
    for (const solid of solids) {
      if (!touches(body, solid)) continue;
      pos[axis] = solid[axis] - Math.sign(v) * (solid['h' + axis] + body['h' + axis]);
      if (axis === 'y') {
        if (v < 0) body.sinceGround = 0;
        vel.y = 0;
      }
    }
  }
  const floor = floorAt(pos.x, pos.z), feet = pos.y - body.hy;
  if (vel.y <= 0 && feet < floor && feet > floor - EDGE_GRIP) {
    pos.y = floor + body.hy;
    vel.y = 0;
    body.sinceGround = 0;
  }
}

// ---------- подписи над объектами ----------
const labels = [];
const projected = new THREE.Vector3();

export function toScreen(position) {
  projected.copy(position).project(camera);
  return { x: (projected.x + 1) / 2 * innerWidth, y: (1 - projected.y) / 2 * innerHeight, front: projected.z < 1 };
}
// range: дальше этого расстояния от фокуса камеры подпись прячется.
export function label(className, text, range = 30) {
  const el = document.createElement('div');
  el.className = 'tag ' + className;
  paint(el, text);
  $('labels').appendChild(el);
  const item = { el, pos: new THREE.Vector3(), visible: true, range };
  labels.push(item);
  return item;
}
export function setText(item, text) {
  paint(item.el, text);
}
function placeLabels(focus) {
  for (const item of labels) {
    const point = toScreen(item.pos);
    const show = item.visible && point.front && item.pos.distanceTo(focus) < item.range;
    item.el.hidden = !show;
    if (show) item.el.style.transform = 'translate(' + point.x + 'px,' + point.y + 'px) translate(-50%,-100%)';
  }
}

// ---------- искры ----------
const sparks = [];
const SPARK = new THREE.SphereGeometry(0.1, 6, 5);
const sparkMaterials = new Map();

export function burst(x, y, z, colors, count = 14, power = 5) {
  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    if (!sparkMaterials.has(color)) sparkMaterials.set(color, new THREE.MeshBasicMaterial({ color }));
    const mesh = new THREE.Mesh(SPARK, sparkMaterials.get(color));
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const angle = Math.random() * Math.PI * 2, spread = (0.4 + Math.random() * 0.6) * power;
    sparks.push({ mesh, vx: Math.cos(angle) * spread, vy: power * (0.6 + Math.random() * 0.8), vz: Math.sin(angle) * spread, life: 0.6 + Math.random() * 0.4 });
  }
}
function stepSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.vy -= 14 * dt;
    s.mesh.position.x += s.vx * dt;
    s.mesh.position.y += s.vy * dt;
    s.mesh.position.z += s.vz * dt;
    s.mesh.scale.setScalar(Math.max(0.01, s.life * 1.6));
    if (s.life <= 0) {
      scene.remove(s.mesh);
      sparks.splice(i, 1);
    }
  }
}

// ---------- снимки для интерфейса ----------
// Рисует предмет в память на прозрачном фоне и отдаёт картинку. Так в коллекции стоят настоящие питомцы, а не значки.
let studio = null;
export function snapshot(object, size = 128) {
  if (!studio) {
    const stage = new THREE.Scene(), lens = new THREE.PerspectiveCamera(30, 1, 0.1, 20), lamp = new THREE.DirectionalLight(0xffffff, 1.9);
    lamp.position.set(2, 4, 3);
    stage.add(new THREE.HemisphereLight(0xffffff, 0x8f9bea, 1.7), lamp);
    lens.position.set(1, 1.5, 3.6);
    lens.lookAt(0, 0.62, 0);
    const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    studio = { stage, lens, target, pixels: new Uint8Array(size * size * 4) };
  }
  studio.stage.add(object);
  renderer.setRenderTarget(studio.target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(studio.stage, studio.lens);
  renderer.readRenderTargetPixels(studio.target, 0, 0, size, size, studio.pixels);
  renderer.setRenderTarget(null);
  renderer.setClearAlpha(1);
  studio.stage.remove(object);
  // Видеокарта отдаёт строки снизу вверх, картинке нужны сверху вниз.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), image = g.createImageData(size, size), row = size * 4;
  for (let y = 0; y < size; y++) image.data.set(studio.pixels.subarray((size - 1 - y) * row, (size - y) * row), y * row);
  g.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

// ---------- отклик ----------
// pulse: предмет пружинит, сплющиваясь и вытягиваясь. Так читаются приземление, хватание, вылупление.
const pulses = [];
export function pulse(object, strength = 0.35) {
  let entry = pulses.find(p => p.object === object);
  if (!entry) pulses.push(entry = { object, base: object.scale.clone() });
  entry.time = 0;
  entry.strength = strength;
}
function stepPulses(dt) {
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.time += dt;
    const wave = Math.sin(p.time * 22) * Math.exp(-p.time * 7) * p.strength; // затухающая пружина
    p.object.scale.set(p.base.x * (1 - wave * 0.6), p.base.y * (1 + wave), p.base.z * (1 - wave * 0.6));
    if (p.time < 0.7) continue;
    p.object.scale.copy(p.base);
    pulses.splice(i, 1);
  }
}
// shake: камера вздрагивает от удара. Сила затухает сама.
let shakePower = 0;
export function shake(power) {
  shakePower = Math.max(shakePower, power);
}
function stepShake(dt) {
  if (shakePower < 0.01) return;
  camera.position.x += (Math.random() - 0.5) * shakePower;
  camera.position.y += (Math.random() - 0.5) * shakePower;
  shakePower *= Math.exp(-dt * 9);
}

// ---------- цикл ----------
// Показывает игроку, что игра сломалась: застывшая картинка без объяснений хуже.
export function crash(error) {
  console.error(error);
  $('fatal').textContent = 'Игра споткнулась. Закрой её и открой заново: прогресс сохранён.';
  $('fatal').hidden = false;
}
// tick(dt, time) двигает игру и возвращает точку, за которой следит камера: вокруг неё показываются подписи.
export function run(tick) {
  let last = performance.now(), time = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    watchSpeed((now - last) / 1000);
    last = now;
    time += dt;
    if (stickPointer === null) {
      input.x = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
      input.y = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
    }
    try {
      const focus = tick(dt, time);
      stepSparks(dt);
      stepPulses(dt);
      stepShake(dt);
      placeLabels(focus);
      renderer.render(scene, camera);
    } catch (error) {
      return crash(error); // цикл останавливаем: одна и та же ошибка повторялась бы каждый кадр
    }
    input.jump = Math.max(0, input.jump - dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
