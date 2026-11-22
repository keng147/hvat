// Мир игры: остров-база в центре и пять зон. Расстановка детерминированная, у всех игроков одинаковая.
// Каждая зона описана в своих координатах: вход в точке (0, -25), остров уходит на север. FRAMES поворачивает её в мир.
import { THREE, scene, solids } from './engine.js';
import { EGGS, ZONES, ENTRY, MAX_SLOTS, PREMIUM_PADS } from './data.js';
import {
  mat, makeMushroom, makeTree, makeRock, makeLily, makeLollipop, makeCane, makeGumdrop, makeSweet, makePine, makeCrystal, makeSnowman,
  makeGearTower, makeLamp, makeCrate, makePipes, makeColumn, makePuff, makeRainbow, makeStar, makeCloud,
  makeNest, makePad, makeChest, makeGate, makeBridge, makeFlag, mergeMeshes, compact,
} from './art.js';

export const BASE_RADIUS = 15;
const ISLAND = { z: -64, rx: 21, rz: 42 };
const BRIDGE = { halfWidth: 1.9, from: -13, to: -25.5 };
const RAIL = { half: 0.1, height: 3 }; // перила выше прыжка: с моста в воду не свалиться
const WATER_Y = -1.2;

// Болото на севере, пустыня на западе, хребет на востоке, город на юге. Вершины стоят за болотом.
// Углы кратны 90°, чтобы по мостам можно было бежать и с клавиатуры.
const FRAMES = [
  { angle: 0, ox: 0, oz: 0 },
  { angle: Math.PI / 2, ox: 0, oz: 0 },
  { angle: -Math.PI / 2, ox: 0, oz: 0 },
  { angle: Math.PI, ox: 0, oz: 0 },
  { angle: 0, ox: 0, oz: -91 },
].map(frame => ({ ...frame, cos: Math.cos(frame.angle), sin: Math.sin(frame.angle) }));

export function toWorld(zone, lx, lz) {
  const f = FRAMES[zone];
  return [f.ox + lx * f.cos + lz * f.sin, f.oz - lx * f.sin + lz * f.cos];
}
function toLocal(zone, x, z) {
  const f = FRAMES[zone], dx = x - f.ox, dz = z - f.oz;
  return [dx * f.cos - dz * f.sin, dx * f.sin + dz * f.cos];
}
const onIsland = (lx, lz) => (lx / ISLAND.rx) ** 2 + ((lz - ISLAND.z) / ISLAND.rz) ** 2 < 1;
// Точка внутри зоны, то есть там, где сторожа ещё гонятся.
export function inZone(zone, x, z) {
  const [lx, lz] = toLocal(zone, x, z);
  return lz < ENTRY[1] && onIsland(lx, lz);
}
// Высота земли в точке, либо -Infinity над водой.
export function floorAt(x, z) {
  if (x * x + z * z < BASE_RADIUS * BASE_RADIUS) return 0;
  for (let zone = 0; zone < FRAMES.length; zone++) {
    const [lx, lz] = toLocal(zone, x, z);
    if (onIsland(lx, lz) || (Math.abs(lx) < BRIDGE.halfWidth && lz < BRIDGE.from && lz > BRIDGE.to)) return 0;
  }
  return -Infinity;
}

// ---------- оформление зон ----------
// props: что расставить. solid [полуширина, высота] и shade [радиус, высота] умножаются на масштаб.
// solid делает объект препятствием, shade — полупрозрачным, когда он заслоняет героя. clear: отступ от тропы.
// legs [отступ от центра, полуширина, высота]: ещё два препятствия по бокам вдоль оси x предмета. У радуги это опоры,
// между которыми можно пройти, у трубопровода вместе с solid они закрывают всю его длину.
const CAPS = [0xff5a6e, 0xb06bff, 0xff9a3c, 0x4fd0e0, 0xff7ac8];
const CANDY = [[0xff8fc0, 0xffffff], [0x7fe0c0, 0xffffff], [0xffd23c, 0xff8a4a], [0xb48cff, 0xffe066]];
const THEMES = {
  swamp: {
    top: 0x58b895, side: 0x6a5a7a, patch: 0x4faa8a, stone: 0xe9dcc0, accent: 0xff5a6e,
    grass: { count: 520, hue: [0.42, 0.47], sat: 0.5, light: [0.34, 0.44] },
    ponds: { color: 0x7fd8e6, lilies: true, spots: [[12, -45, 3.6], [-12.5, -70, 4], [10, -84, 3.2]] },
    reserved: [[0, -102, 5]], // здесь начинается мост на облачные вершины
    motes: { rgb: '255,240,140', mode: 'float', count: 70 },
    props: [
      { count: 20, clear: 3.2, scale: [2.4, 4.6], make: (s, i) => makeMushroom(s, CAPS[i % CAPS.length]), solid: [0.2, 0.9], shade: [0.75, 1.4] },
      { count: 10, clear: 3.4, scale: [1.2, 1.7], make: (s, i) => makeTree(s, i % 2 ? 0x3fae9a : 0x57c28a, 0x6b4a5a, i % 3 === 2 ? 'dead-tree' : 'tree'), solid: [0.28, 2], shade: [1.4, 3.8] },
      { count: 12, clear: 3, scale: [0.8, 1.4], make: s => makeRock(s, 0x8d86a8, 'rock-moss'), solid: [0.75, 1.1] },
      { count: 45, clear: 1.3, scale: [0.35, 0.8], make: (s, i) => makeMushroom(s, CAPS[i % CAPS.length]), solid: [0.6, 1.35] },
    ],
  },
  candy: {
    top: 0xffdf9a, side: 0xd99a5a, patch: 0xffeab8, stone: 0xfff6e0, accent: 0xff8fc0,
    grass: { count: 420, hue: [0, 1], sat: 0.85, light: [0.6, 0.7] }, // цветная посыпка
    props: [
      { count: 16, clear: 3.2, scale: [1.3, 2.2], make: (s, i) => makeLollipop(s, ...CANDY[i % CANDY.length]), solid: [0.15, 2.4], shade: [0.9, 3.8] },
      { count: 10, clear: 3.2, scale: [1.2, 1.8], make: s => makeCane(s), solid: [0.18, 2.6], shade: [0.6, 3] },
      { count: 5, clear: 3, scale: [0.8, 1.2], make: s => makeSweet(s, 'cupcake', CAPS[4]), solid: [0.6, 1.6] },
      { count: 5, clear: 3, scale: [0.7, 1.2], make: s => makeSweet(s, 'donut', CAPS[1]), solid: [0.9, 0.65] },
      { count: 6, clear: 3, scale: [0.7, 1.3], make: (s, i) => makeSweet(s, 'pudding', CAPS[i % CAPS.length]), solid: [0.75, 1.1] },
      { count: 40, clear: 1.3, scale: [0.2, 0.4], make: (s, i) => makeGumdrop(s, CAPS[(i + 2) % CAPS.length]), solid: [0.85, 0.9] },
    ],
  },
  ice: {
    top: 0xf2fbff, side: 0x8fb4dc, patch: 0xdcefff, stone: 0xbfd8f0, accent: 0x7fd0ff,
    grass: { count: 300, hue: [0.55, 0.6], sat: 0.5, light: [0.8, 0.9] },
    ponds: { color: 0xbfeaff, lilies: false, spots: [[11, -50, 3.4], [-11, -74, 3.8]] },
    motes: { rgb: '255,255,255', mode: 'fall', count: 110 },
    props: [
      { count: 16, clear: 3.4, scale: [1.1, 1.7], make: s => makePine(s), solid: [0.5, 3], shade: [1.1, 3.4] },
      { count: 12, clear: 3.2, scale: [0.9, 1.4], make: s => makeCrystal(s, 0x9fe6ff), solid: [0.7, 1.8], shade: [0.9, 2] },
      { count: 8, clear: 3, scale: [0.9, 1.2], make: s => makeSnowman(s), solid: [0.55, 2.2] },
      { count: 10, clear: 3, scale: [0.7, 1.2], make: s => makeRock(s, 0xbfe6ff, 'rock-snow'), solid: [0.7, 1.6] },
      { count: 30, clear: 1.3, scale: [0.25, 0.45], make: s => makeCrystal(s, 0xd6f4ff), solid: [0.7, 1.8] },
    ],
  },
  city: {
    top: 0x9aa6b8, side: 0x5a6275, patch: 0x8792a6, stone: 0xd9a441, accent: 0xd9a441,
    grass: { count: 0 },
    motes: { rgb: '255,170,80', mode: 'float', count: 40 },
    props: [
      { count: 10, clear: 3.4, scale: [1, 1.4], make: s => makeGearTower(s), solid: [0.4, 3.2], shade: [1, 3.4] },
      { count: 10, clear: 3.2, scale: [0.9, 1.3], make: s => makePipes(s), solid: [0.4, 0.7], legs: [1.1, 0.4, 0.7] },
      { count: 10, clear: 3, scale: [1, 1.2], make: s => makeLamp(s), solid: [0.1, 3] },
      { count: 18, clear: 3, scale: [0.8, 1.2], make: (s, i) => makeCrate(s, i % 3 ? 'crate' : 'barrel'), solid: [0.5, 1] },
    ],
  },
  sky: {
    top: 0xfdfdff, side: 0xcfe0ff, patch: 0xffeef6, stone: 0xffe9a8, accent: 0xffd23c,
    grass: { count: 200, hue: [0.12, 0.15], sat: 0.8, light: [0.7, 0.8] },
    motes: { rgb: '255,220,120', mode: 'float', count: 60 },
    props: [
      { count: 3, clear: 5, scale: [1, 1.3], make: s => makeRainbow(s), shade: [3.2, 3.2], legs: [2.5, 0.4, 1.5] },
      { count: 14, clear: 3.2, scale: [1, 1.4], make: s => makeColumn(s), solid: [0.45, 3.5], shade: [0.6, 3.6] },
      { count: 12, clear: 3.2, scale: [1.6, 2.4], make: s => makePuff(s), solid: [0.7, 1.2], shade: [1, 1.6] },
      { count: 14, clear: 3, scale: [0.6, 1], make: s => makePuff(s), solid: [0.6, 0.9] },
      { count: 30, clear: 1.3, scale: [0.5, 1], make: s => makeStar(s), solid: [0.28, 0.9] },
    ],
  },
};

// Генератор случайных чисел с зерном (mulberry32), чтобы мир каждый раз получался одним и тем же.
function seeded(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function distanceToPath(x, z, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], dx = path[i][0] - ax, dz = path[i][1] - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

const ISLAND_SHAPE = new THREE.CylinderGeometry(1, 0.86, 4, 56);
const FOAM = new THREE.RingGeometry(0.95, 1.03, 56).rotateX(-Math.PI / 2);
const DISC = new THREE.CylinderGeometry(1, 1, 0.02, 24);
const BLADE = new THREE.ConeGeometry(0.13, 0.55, 4);
const sway = { value: 0 }; // время для покачивания травы, общее на все зоны
const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });

const STEP_OVER = 0.4; // через предметы ниже этого герой перешагивает: упираться в конфету по щиколотку было бы глупо
function solid(x, z, half, height) {
  if (height >= STEP_OVER) solids.push({ x, y: height / 2, z, hx: half, hy: height / 2, hz: half });
}
// Перила моста в координатах зоны. Зоны повёрнуты на четверть оборота, поэтому у половины из них стена идёт вдоль x.
function rail(zone, lx) {
  const [x, z] = toWorld(zone, lx, (BRIDGE.from + BRIDGE.to) / 2), length = (BRIDGE.from - BRIDGE.to) / 2;
  const turned = Math.abs(FRAMES[zone].sin) > 0.5;
  solids.push({ x, y: RAIL.height / 2, z, hx: turned ? length : RAIL.half, hy: RAIL.height / 2, hz: turned ? RAIL.half : length });
}
// Рисунок земли: светлее в середине острова, темнее к берегу, плюс мягкие пятна. Он один на все острова
// и умножается на цвет зоны, поэтому земля перестаёт быть ровной заливкой.
let groundTexture = null;
function ground() {
  if (groundTexture) return groundTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d'), fade = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  fade.addColorStop(0, '#ffffff');
  fade.addColorStop(0.75, '#f1f1f1');
  fade.addColorStop(1, '#cfcfcf');
  g.fillStyle = fade;
  g.fillRect(0, 0, 256, 256);
  const random = seeded(11);
  for (let i = 0; i < 140; i++) {
    const x = random() * 256, y = random() * 256, radius = 6 + random() * 18;
    const spot = g.createRadialGradient(x, y, 0, x, y, radius), tone = random() < 0.5 ? '255,255,255' : '120,120,120';
    spot.addColorStop(0, 'rgba(' + tone + ',0.16)');
    spot.addColorStop(1, 'rgba(' + tone + ',0)');
    g.fillStyle = spot;
    g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  groundTexture = new THREE.CanvasTexture(canvas);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  return groundTexture;
}
// Рисунок воды: светлые разводы на плитке, которая повторяется и медленно плывёт.
function waterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d'), random = seeded(23);
  g.fillStyle = '#45c4dc';
  g.fillRect(0, 0, 256, 256);
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = random() * 256, y = random() * 256, length = 14 + random() * 30;
    g.strokeStyle = 'rgba(255,255,255,' + (0.1 + random() * 0.16) + ')';
    g.lineWidth = 2 + random() * 3;
    // Развод рисуется со сдвигом на размер плитки во все стороны, чтобы на стыках плиток не было швов.
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + length / 2, y + dy - 5, x + dx + length, y + dy);
      g.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(70, 70);
  return texture;
}
const foams = []; // кольца пены вокруг островов: мир их слегка «дышит»
function island(rx, rz, x, z, angle, topColor, sideColor) {
  const side = mat(sideColor, true);
  const land = new THREE.Mesh(ISLAND_SHAPE, [side, new THREE.MeshLambertMaterial({ color: topColor, map: ground() }), side]);
  land.scale.set(rx, 1, rz);
  land.position.set(x, -2, z);
  land.rotation.y = angle;
  land.receiveShadow = true;
  const foam = new THREE.Mesh(FOAM, foamMaterial);
  foam.scale.set(rx, 1, rz);
  foam.position.set(x, WATER_Y + 0.03, z);
  foam.rotation.y = angle;
  foams.push({ foam, rx, rz });
  scene.add(land, foam);
}
function disc(x, z, radius, color, lift) {
  const mesh = new THREE.Mesh(DISC, mat(color));
  mesh.scale.set(radius, 1, radius);
  mesh.position.set(x, lift, z);
  mesh.receiveShadow = true;
  return mesh;
}
// Трава или посыпка: одна сетка на все травинки. spot(i) возвращает мировые [x, z].
function grass(spec, random, spot) {
  if (!spec.count) return;
  const between = (min, max) => min + random() * (max - min);
  const material = new THREE.MeshLambertMaterial({ flatShading: true });
  // Травинки покачиваются: вершина сдвигается тем сильнее, чем она выше, а фаза зависит от места травинки.
  material.onBeforeCompile = shader => {
    shader.uniforms.uSway = sway;
    shader.vertexShader = 'uniform float uSway;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed.x += sin(uSway * 1.7 + instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4) * 0.14 * (position.y + 0.275);');
  };
  const mesh = new THREE.InstancedMesh(BLADE, material, spec.count);
  const blade = new THREE.Object3D(), tint = new THREE.Color();
  for (let i = 0; i < spec.count; i++) {
    const [x, z] = spot(), scale = between(0.6, 1.4);
    blade.position.set(x, 0.27 * scale, z);
    blade.rotation.y = between(0, 3);
    blade.scale.setScalar(scale);
    blade.updateMatrix();
    mesh.setMatrixAt(i, blade.matrix);
    mesh.setColorAt(i, tint.setHSL(between(...spec.hue), spec.sat, between(...spec.light)));
  }
  scene.add(mesh);
}
// Мягкое круглое пятно света для летающих огоньков: без него точки рисуются квадратами.
function glowTexture(rgb) {
  const spot = document.createElement('canvas');
  spot.width = spot.height = 32;
  const g = spot.getContext('2d');
  const gradient = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, 'rgba(' + rgb + ',0.85)');
  gradient.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(spot);
}
// Огоньки над зоной: светлячки парят (float), снег падает (fall). Возвращает функцию анимации.
function motes(zone, spec, random) {
  const home = Array.from({ length: spec.count }, () => {
    const angle = random() * Math.PI * 2, reach = Math.sqrt(random()) * 0.9;
    const [x, z] = toWorld(zone, Math.cos(angle) * reach * ISLAND.rx, ISLAND.z + Math.sin(angle) * reach * ISLAND.rz);
    return [x, 1 + random() * 4, z];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(home.flat()), 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    map: glowTexture(spec.rgb), size: spec.mode === 'fall' ? 0.45 : 0.8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
  const array = geometry.attributes.position.array;
  return time => {
    for (let i = 0; i < spec.count; i++) {
      if (spec.mode === 'fall') array[i * 3 + 1] = 7 - (time * 1.6 + i * 0.37) % 7;
      else {
        array[i * 3] = home[i][0] + Math.cos(time * 0.5 + i * 1.7) * 0.9;
        array[i * 3 + 1] = home[i][1] + Math.sin(time * 1.3 + i) * 0.6;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  };
}

// ---------- склейка мелкого декора ----------
// Копилка мелкого декора. Мир поделён на участки CHUNK на CHUNK метров, у каждого свои сетки:
// так за пределами экрана рисуется не вся зона, а только участки, которые в него попали.
const CHUNK = 24;
function createBatcher() {
  const chunks = new Map();
  return {
    // Объект уже стоит на своём месте в мире, в сцену его добавлять не нужно.
    add(root) {
      root.updateMatrixWorld(true);
      const key = Math.floor(root.position.x / CHUNK) + ':' + Math.floor(root.position.z / CHUNK);
      if (!chunks.has(key)) chunks.set(key, []);
      root.traverse(node => { if (node.isMesh) chunks.get(key).push({ mesh: node, matrix: node.matrixWorld }); });
    },
    build() {
      for (const parts of chunks.values()) {
        for (const merged of mergeMeshes(parts)) {
          merged.matrixAutoUpdate = false;
          scene.add(merged);
        }
      }
    },
  };
}
// Тёмные пятна под предметами: без них декор будто висит над землёй. Все пятна рисуются одной сеткой.
function contactBlobs(spots) {
  const stain = document.createElement('canvas');
  stain.width = stain.height = 64;
  const g = stain.getContext('2d'), gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(24,26,58,0.5)');
  gradient.addColorStop(0.5, 'rgba(24,26,58,0.22)');
  gradient.addColorStop(1, 'rgba(24,26,58,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  const material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(stain), transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), material, spots.length);
  const spot = new THREE.Object3D();
  spots.forEach(([x, z, radius], i) => {
    spot.position.set(x, 0.03, z);
    spot.scale.setScalar(radius);
    spot.updateMatrix();
    mesh.setMatrixAt(i, spot.matrix);
  });
  scene.add(mesh);
}

// Высокие объекты между камерой и героем становятся полупрозрачными, иначе они его закрывают.
// Камера стоит выше героя на up и южнее на back (при масштабе 1). Чем положе, тем лучше видно лицо и силуэт.
export const CAMERA = { up: 13.5, back: 12.5 };
const CAMERA_SLOPE = CAMERA.up / CAMERA.back; // на столько камера поднимается на каждый шаг назад
const ghosts = new Map();
function ghost(material) {
  if (!ghosts.has(material)) {
    const copy = material.clone();
    copy.transparent = true;
    copy.opacity = 0.25;
    copy.depthWrite = false;
    ghosts.set(material, copy);
  }
  return ghosts.get(material);
}
function setFaded(item, faded) {
  if (item.faded === faded) return;
  item.faded = faded;
  item.group.traverse(node => {
    if (!node.isMesh) return;
    node.userData.solid ??= node.material;
    node.material = faded ? ghost(node.userData.solid) : node.userData.solid;
  });
}

export function buildWorld(heroColor) {
  const random = seeded(7);
  const between = (min, max) => min + random() * (max - min);
  const decor = createBatcher(); // сюда уходит всё мелкое и неподвижное
  const tall = [], spinners = [], animations = [], blobs = []; // blobs: тёмные пятна под предметами [x, z, радиус]
  // reach: как далеко на юг от объекта он ещё закрывает героя
  const addTall = (group, x, z, radius, height) => {
    if (!group.userData.spinner) compact(group); // у башни с шестернёй одна деталь вращается, её не склеить
    tall.push({ group, x, z, radius, reach: height / CAMERA_SLOPE + radius, faded: false });
  };

  const waves = waterTexture();
  const water = new THREE.Mesh(new THREE.CircleGeometry(600, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: waves }));
  water.position.y = WATER_Y;
  scene.add(water);

  const zones = ZONES.map((zoneData, zone) => {
    const theme = THEMES[zoneData.id], frame = FRAMES[zone];
    const nests = EGGS.filter(egg => egg.zone === zone).map(egg => egg.nest);
    const path = [ENTRY, ...nests];
    // place ставит объект на место в зоне и отдаёт его мировые [x, z]. put ещё и добавляет в сцену отдельным объектом,
    // bake отправляет в общую склейку: так делается всё, что не двигается и не меняет вид.
    const place = (object, lx, lz, turn = 0, y = 0) => {
      const [x, z] = toWorld(zone, lx, lz);
      object.position.set(x, y, z);
      object.rotation.y = turn + frame.angle;
      return [x, z];
    };
    const put = (object, ...where) => {
      const spot = place(object, ...where);
      scene.add(object);
      return spot;
    };
    const bake = (object, ...where) => {
      const spot = place(object, ...where);
      decor.add(object);
      return spot;
    };
    island(ISLAND.rx, ISLAND.rz, ...toWorld(zone, 0, ISLAND.z), frame.angle, theme.top, theme.side);
    bake(makeBridge(13, BRIDGE.halfWidth * 2), 0, -12.6);
    for (const side of [-1, 1]) rail(zone, side * (BRIDGE.halfWidth + RAIL.half));
    const gate = makeGate(theme.accent);
    addTall(gate, ...put(gate, 0, -26.5), 3.6, 5);
    for (const lx of [-2.9, 2.9]) solid(...toWorld(zone, lx, -26.5), 0.35, 4);

    // Занятые места: туда больше ничего не ставим.
    const taken = nests.map(([x, z]) => ({ x, z: z - 1.5, r: 4.5 })); // гнездо вместе с постом сторожа
    for (const [x, z, r] of theme.reserved || []) taken.push({ x, z, r });
    function freeSpot(clearPath, radius) {
      for (let tries = 0; tries < 40; tries++) {
        const x = between(-ISLAND.rx, ISLAND.rx), z = ISLAND.z + between(-ISLAND.rz, ISLAND.rz);
        if ((x / ISLAND.rx) ** 2 + ((z - ISLAND.z) / ISLAND.rz) ** 2 > 0.8) continue;
        if (distanceToPath(x, z, path) < clearPath) continue;
        if (taken.some(t => Math.hypot(t.x - x, t.z - z) < t.r + radius)) continue;
        taken.push({ x, z, r: radius });
        return [x, z];
      }
      return null;
    }

    // Тропа из светлых камней от входа до дальнего гнезда.
    for (let i = 1; i < path.length; i++) {
      const [ax, az] = path[i - 1], [bx, bz] = path[i], steps = Math.floor(Math.hypot(bx - ax, bz - az) / 2.1);
      for (let s = 1; s < steps; s++) {
        decor.add(disc(...toWorld(zone, ax + (bx - ax) * s / steps + between(-0.4, 0.4), az + (bz - az) * s / steps + between(-0.3, 0.3)), between(0.5, 0.8), theme.stone, 0.012));
      }
    }
    for (const [x, z, radius] of theme.ponds ? theme.ponds.spots : []) {
      decor.add(disc(...toWorld(zone, x, z), radius, theme.ponds.color, 0.012));
      taken.push({ x, z, r: radius });
      for (let i = 0; theme.ponds.lilies && i < 3; i++) bake(makeLily(), x + between(-1, 1) * radius * 0.6, z + between(-1, 1) * radius * 0.6, between(0, 6), 0.03);
    }
    for (let i = 0; i < 18; i++) decor.add(disc(...toWorld(zone, between(-15, 15), ISLAND.z + between(-34, 34)), between(1.5, 3.5), theme.patch, 0.006));
    for (const [x, z] of nests) blobs.push([...bake(makeNest(), x, z), 1.5]);

    for (const prop of theme.props) {
      for (let i = 0; i < prop.count; i++) {
        const scale = between(...prop.scale);
        const spot = freeSpot(prop.clear, prop.shade ? prop.shade[0] * scale * 0.7 : prop.solid ? Math.max(0.5, prop.solid[0] * scale) : 0.5);
        if (!spot) continue;
        // Высокие предметы умеют становиться прозрачными, башни вращают шестерню: они остаются отдельными. Остальное склеивается.
        const group = prop.make(scale, i), turn = between(0, 6), alone = prop.shade || group.userData.spinner;
        const [x, z] = (alone ? put : bake)(group, ...spot, turn);
        if (prop.solid) solid(x, z, prop.solid[0] * scale, prop.solid[1] * scale);
        if (prop.solid) blobs.push([x, z, Math.max(0.35, prop.solid[0] * scale * 1.5)]);
        for (const side of prop.legs ? [-1, 1] : []) {
          const reach = side * prop.legs[0] * scale, angle = turn + frame.angle;
          solid(x + Math.cos(angle) * reach, z - Math.sin(angle) * reach, prop.legs[1] * scale, prop.legs[2] * scale);
        }
        if (prop.shade) addTall(group, x, z, prop.shade[0] * scale, prop.shade[1] * scale);
        if (group.userData.spinner) spinners.push(group.userData.spinner);
      }
    }
    grass(theme.grass, random, () => {
      const angle = between(0, Math.PI * 2), reach = Math.sqrt(random());
      return toWorld(zone, Math.cos(angle) * reach * (ISLAND.rx - 0.8), ISLAND.z + Math.sin(angle) * reach * (ISLAND.rz - 0.8));
    });
    if (theme.motes) animations.push(motes(zone, theme.motes, random));
    for (let i = 0; zoneData.id === 'swamp' && i < 10; i++) {
      const angle = between(0, Math.PI * 2), reach = between(1.08, 1.6);
      bake(makeLily(), Math.cos(angle) * ISLAND.rx * reach, ISLAND.z + Math.sin(angle) * ISLAND.rz * reach, between(0, 6), WATER_Y + 0.05);
    }
    const bridge = [toWorld(zone, 0, BRIDGE.from - 0.5), toWorld(zone, ...ENTRY)]; // начало моста и вход в зону
    return { bridge, approach: bridge, nests: nests.map(([x, z]) => toWorld(zone, x, z)) }; // approach: путь от базы до входа
  });
  // На вершины идут через всё болото.
  zones[4].approach = [...zones[0].approach, ...zones[0].nests, ...zones[4].approach];

  // База: площадки под питомцев, сундук в центре, флаг, деревья между мостами.
  island(BASE_RADIUS, BASE_RADIUS, 0, 0, 0, 0x9be15d, 0xb07a4a);
  // Восемь мест по кругу и четыре во внутреннем. Последние PREMIUM_PADS мест — золотые площадки за звёзды.
  const slots = Array.from({ length: MAX_SLOTS + PREMIUM_PADS }, (_, i) => {
    const inner = i >= 8, angle = inner ? Math.PI / 4 + (i - 8) * Math.PI / 2 : Math.PI / 8 + i * Math.PI / 4;
    return new THREE.Vector3(Math.cos(angle) * (inner ? 4.6 : 8.2), 0, Math.sin(angle) * (inner ? 4.6 : 8.2));
  });
  const pads = new Set();
  const chest = new THREE.Vector3(0, 0, 0);
  const chestModel = makeChest();
  compact(chestModel);
  scene.add(chestModel);
  solid(chest.x, chest.z, 0.8, 1.2);
  blobs.push([chest.x, chest.z, 1.6], [1.7, 1.7, 0.5]);
  const flag = makeFlag(heroColor);
  flag.position.set(1.7, 0, 1.7);
  decor.add(flag);
  solid(1.7, 1.7, 0.1, 4);
  for (const degrees of [45, 135, 225, 315]) {
    const angle = degrees * Math.PI / 180, x = Math.cos(angle) * 12.6, z = Math.sin(angle) * 12.6, scale = between(1.2, 1.5);
    const tree = makeTree(scale, degrees % 180 === 45 ? 0x4cc46a : 0x6fd65a, 0x8a5a3c);
    tree.position.set(x, 0, z);
    scene.add(tree);
    addTall(tree, x, z, 1.4 * scale, 3.8 * scale);
    solid(x, z, 0.4, 3);
    blobs.push([x, z, 1.1]);
  }
  for (let i = 0; i < 9; i++) {
    const angle = between(0, Math.PI * 2), reach = between(10.5, 13.5), scale = between(0.3, 0.6);
    const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
    if (Math.min(Math.abs(x), Math.abs(z)) < BRIDGE.halfWidth + 1) continue; // у входа на мост камень мешал бы бежать
    const rock = makeRock(scale, 0xc9c2b8);
    rock.position.set(x, 0, z);
    decor.add(rock);
    solid(x, z, 0.75 * scale, 1.1 * scale);
  }
  grass({ count: 260, hue: [0.24, 0.3], sat: 0.62, light: [0.42, 0.52] }, random, () => {
    const angle = between(0, Math.PI * 2), reach = Math.sqrt(random()) * (BASE_RADIUS - 0.6);
    return [Math.cos(angle) * reach, Math.sin(angle) * reach];
  });
  const clouds = Array.from({ length: 9 }, () => {
    const cloud = makeCloud(between(4, 7));
    cloud.position.set(between(-120, 120), between(26, 38), between(-200, 110));
    scene.add(cloud);
    return cloud;
  });

  contactBlobs(blobs);
  decor.build();

  return {
    zones, slots, chest, chestModel,
    // Площадка появляется, когда место под питомца куплено.
    showPad(i) {
      if (pads.has(i)) return;
      pads.add(i);
      const pad = makePad(i < MAX_SLOTS ? 0xffe9a8 : 0xffc21a);
      compact(pad);
      pad.position.copy(slots[i]);
      scene.add(pad);
    },
    animate(time, heroX, heroZ) {
      for (const item of tall) {
        const south = item.z - heroZ;
        setFaded(item, south > 0.3 && south < item.reach && Math.abs(item.x - heroX) < item.radius + 0.6);
      }
      sway.value = time;
      waves.offset.set(time * 0.006, time * 0.004);
      for (const { foam, rx, rz } of foams) foam.scale.set(rx * (1 + Math.sin(time * 1.3 + rx) * 0.006), 1, rz * (1 + Math.sin(time * 1.3 + rx) * 0.006));
      for (const cloud of clouds) cloud.position.x = (cloud.position.x + 120.02) % 240 - 120;
      for (const spinner of spinners) spinner.rotation.z = time * 1.5;
      for (const animate of animations) animate(time);
    },
  };
}
