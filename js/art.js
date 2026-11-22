// Графика игры: герой, сторожа, яйца, питомцы, декор зон, постройки. Что-то собрано кодом из общих заготовок,
// что-то берётся готовой моделью (model), а собранный кодом вид остаётся запасным на случай, если файл не загрузился.
// Каждая функция make* возвращает группу (или объект с группой) с началом координат на земле.
import { THREE } from './engine.js';
import { toon, mount, prop, BRIGHTER } from './models.js';

// Персонажи красятся по-мультяшному (см. toon в models.js). Пока cartoon включён, mat отдаёт такие материалы;
// включает его character на время сборки персонажа.
let cartoon = false;

const materials = new Map();
export function mat(color, flat = false, emissive = 0) {
  const key = color + '|' + flat + '|' + emissive + '|' + cartoon;
  if (!materials.has(key)) materials.set(key, cartoon ? toon(color, emissive) : new THREE.MeshLambertMaterial({ color, flatShading: flat, emissive }));
  return materials.get(key);
}

const SPHERE = new THREE.SphereGeometry(1, 20, 14);
const DOME = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const DOT = new THREE.SphereGeometry(1, 8, 6); // мелкие пятнышки и крошки: им хватает грубой сферы
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const ROCK = new THREE.IcosahedronGeometry(1, 0);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2); // ось вдоль x
const DISK = new THREE.CylinderGeometry(1, 1, 1, 20).rotateX(Math.PI / 2);  // ось вдоль z
const TRUNK = new THREE.CylinderGeometry(0.7, 1, 1, 7);
const CONE = new THREE.ConeGeometry(1, 1, 10);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.TorusGeometry(1, 0.3, 6, 14).rotateX(Math.PI / 2);
const HOOP = new THREE.TorusGeometry(1, 0.05, 6, 28).rotateX(Math.PI / 2);
const SWIRL = new THREE.TorusGeometry(1, 0.1, 6, 24);                  // кольцо стоймя
const ARC = new THREE.TorusGeometry(1, 0.06, 6, 24, Math.PI);          // полукольцо стоймя
const HOOK = new THREE.TorusGeometry(0.4, 0.16, 6, 12, Math.PI);
const BAT = new THREE.CylinderGeometry(0.09, 0.05, 1, 8).translate(0, 0.5, 0);
// Дуга рта: лежит горизонтально и смотрит вперёд, вдоль +z.
const MOUTH = new THREE.TorusGeometry(1, 0.035, 5, 14, 0.9).rotateZ(Math.PI / 2 - 0.45).rotateX(Math.PI / 2);
// Профиль яйца: низ шире верха. Высота 1, начало координат в нижней точке.
const eggRadius = a => Math.sin(a) * (0.4 + 0.06 * Math.cos(a));
const eggHeight = a => 0.5 - Math.cos(a) * 0.5;
const EGG = new THREE.LatheGeometry(
  Array.from({ length: 17 }, (_, i) => new THREE.Vector2(eggRadius(i / 16 * Math.PI), eggHeight(i / 16 * Math.PI))), 22,
);

const WHITE = 0xffffff, INK = 0x23283d, GOLD = 0xffc94d, STEEL = 0xb8c4d6;

function part(parent, geometry, material, x, y, z, sx = 1, sy = sx, sz = sx) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function rig() {
  const group = new THREE.Group(), inner = new THREE.Group();
  group.add(inner);
  return { group, inner };
}
function scaled(group, scale) {
  group.scale.setScalar(scale);
  return group;
}

// ---------- склейка ----------
// Декор стоит на месте, поэтому его детали сливаются в большие сетки: одна на материал. Видеокарте почти всё равно,
// сколько в сетке треугольников, а вот каждая отдельная сетка стоит времени, и на слабом телефоне это главное узкое место.
// parts: [{ mesh, matrix }] — деталь и её место в системе координат будущей сетки.
export function mergeMeshes(parts) {
  const groups = new Map();
  for (const item of parts) {
    const { mesh } = item, key = mesh.material.uuid + '|' + mesh.castShadow + '|' + mesh.receiveShadow;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const vertex = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  return [...groups.values()].map(group => {
    const corners = group.reduce((sum, { mesh }) => sum + mesh.geometry.attributes.position.count, 0);
    const position = new Float32Array(corners * 3), normal = new Float32Array(corners * 3), index = [];
    const uv = group[0].mesh.material.map ? new Float32Array(corners * 2) : null; // развёртка нужна только деталям с рисунком
    let offset = 0;
    for (const { mesh, matrix } of group) {
      const source = mesh.geometry, points = source.attributes.position, normals = source.attributes.normal, spots = source.attributes.uv;
      normalMatrix.getNormalMatrix(matrix);
      for (let i = 0; i < points.count; i++) {
        vertex.fromBufferAttribute(points, i).applyMatrix4(matrix).toArray(position, (offset + i) * 3);
        vertex.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize().toArray(normal, (offset + i) * 3);
        if (uv) uv.set([spots.getX(i), spots.getY(i)], (offset + i) * 2);
      }
      if (source.index) for (let i = 0; i < source.index.count; i++) index.push(offset + source.index.getX(i));
      else for (let i = 0; i < points.count; i++) index.push(offset + i);
      offset += points.count;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(index);
    const merged = new THREE.Mesh(geometry, group[0].mesh.material);
    merged.castShadow = group[0].mesh.castShadow;
    merged.receiveShadow = group[0].mesh.receiveShadow;
    return merged;
  });
}
// Сливает детали внутри одной группы. Группа остаётся отдельным объектом: её можно двигать, прятать и делать прозрачной.
export function compact(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), parts = [];
  group.traverse(node => { if (node.isMesh) parts.push({ mesh: node, matrix: inverse.clone().multiply(node.matrixWorld) }); });
  group.clear();
  group.add(...mergeMeshes(parts));
}

// ---------- готовые модели предметов ----------
const textured = new Map(), shade = new THREE.Color(), hsl = {};
// Цвет из файла, подтянутый под нашу яркую картинку: тёмное светлеет заметно, светлое почти нет.
// Чисто серому насыщенность не добавляется, иначе он розовеет.
function brighter(color) {
  shade.copy(color).getHSL(hsl);
  return shade.setHSL(hsl.h, hsl.s && Math.min(1, hsl.s + BRIGHTER[1]), hsl.l + BRIGHTER[2] * (1 - hsl.l) ** 2).getHex();
}
// Предмет из папки models/props либо null, если файл не загрузился: тогда make* рисует его кодом.
// fit: { height } или { width } в метрах. tints: { имя материала в файле: цвет или [цвет, свечение] };
// остальные детали берут цвет (или рисунок) из файла.
function model(file, fit, tints = {}) {
  return prop(file, fit, source => {
    const tint = tints[source.name];
    if (tint !== undefined) return Array.isArray(tint) ? mat(tint[0], false, tint[1]) : mat(tint);
    if (!source.map) return mat(brighter(source.color));
    if (!textured.has(source)) textured.set(source, new THREE.MeshLambertMaterial({ map: source.map }));
    return textured.get(source);
  });
}

// ---------- мультяшные персонажи ----------
// Тёмная обводка: позади каждой крупной округлой детали рисуется она же, чуть больше и вывернутая наизнанку.
const OUTLINE = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
const OUTLINED = new Set([SPHERE, DOME, BLOB, CYL, CONE, BOX, ROCK, TRUNK]);
const OUTLINE_WIDTH = 0.035, OUTLINE_MIN = 0.09; // деталям тоньше OUTLINE_MIN обводка не нужна: глаза, усики, козырёк
function outline(root) {
  const parts = [];
  root.traverse(node => { if (node.isMesh && OUTLINED.has(node.geometry) && Math.min(node.scale.x, node.scale.y, node.scale.z) >= OUTLINE_MIN) parts.push(node); });
  for (const mesh of parts) {
    const shell = new THREE.Mesh(mesh.geometry, OUTLINE);
    shell.scale.set(1 + OUTLINE_WIDTH / mesh.scale.x, 1 + OUTLINE_WIDTH / mesh.scale.y, 1 + OUTLINE_WIDTH / mesh.scale.z); // толщина одна и та же у детали любого размера
    mesh.add(shell);
  }
}
// Собирает персонажа в мультяшных материалах. outlined: добавить ли обводку.
function character(build, outlined = true) {
  cartoon = true;
  try {
    const made = build();
    if (outlined) outline(made.group);
    return made;
  } finally {
    cartoon = false;
  }
}
export const makeHero = color => character(() => buildHero(color));
// Сторожа и питомцы — готовые модели с анимацией. Собранный кодом вид стоит на их месте, пока модель грузится,
// и остаётся насовсем, если она не загрузилась.
// height: рост в метрах у сторожа размера 1. Лягушка стоит на двух ногах и тонкая, поэтому она выше остальных.
const GUARD_MODELS = {
  toad: { file: 'guard-frog', height: 2.3 }, crab: { file: 'guard-crab', height: 1.6 }, yak: { file: 'guard-yeti', height: 2 },
  mech: { file: 'guard-mech', height: 2.2 }, eagle: { file: 'guard-birb', height: 1.9 },
};
const WALK = ['Run', 'Walk', 'Fast_Flying'], CALM = ['Idle', 'Flying_Idle'];
// Сколько секунд прошло с прошлого кадра этого персонажа. Долгие паузы (персонаж был за экраном) анимацию не дёргают.
function elapsed(owner, time) {
  const dt = Math.min(0.1, Math.max(0, time - (owner.seen || 0)));
  owner.seen = time;
  return dt;
}
export function makeGuard(kind, look) {
  const guard = character(() => buildGuard(kind, look)), drawn = guard.animate;
  const model = mount(guard.group, GUARD_MODELS[kind].file, { height: GUARD_MODELS[kind].height * look.size, tint: look.color });
  // awake: сторож не спит. moving: бежит.
  guard.animate = (time, awake, moving) => {
    if (!model.ready) return drawn(time, awake, moving);
    model.play(moving ? WALK : CALM, moving ? 1.5 : awake ? 1 : 0.35);
    model.update(elapsed(guard, time));
  };
  return guard;
}
// look.model: файл модели. look.fly: крылатый питомец висит над площадкой.
export function makePet(look, mutation) {
  const pet = character(() => buildPet(look, mutation));
  pet.hue = mutation === 'rainbow';
  pet.model = mount(pet.group, look.model, { height: look.size * 1.1, wide: 0.5, lift: look.fly ? 0.35 : 0, glow: mutation === 'shiny' ? SHINY_GLOW : 0, own: pet.hue });
  return pet;
}
export const makeEgg = look => character(() => buildEgg(look), false); // яйцо склеено в одну сетку, обводка ему не подходит

// ---------- герой и соперники ----------
function buildHero(color) {
  const { group, inner } = rig();
  const skin = mat(0xffd9b3), outfit = mat(color);
  part(inner, SPHERE, outfit, 0, 0.52, 0, 0.36, 0.4, 0.32);
  part(inner, SPHERE, skin, 0, 1.08, 0, 0.37);
  part(inner, DOME, outfit, 0, 1.15, 0, 0.39, 0.36, 0.39);       // кепка
  part(inner, CYL, outfit, 0, 1.19, 0.32, 0.24, 0.05, 0.2);      // козырёк
  for (const side of [-1, 1]) {
    part(inner, SPHERE, mat(WHITE), side * 0.14, 1.07, 0.31, 0.1, 0.12, 0.06);
    part(inner, SPHERE, mat(INK), side * 0.14, 1.06, 0.355, 0.055, 0.07, 0.03);
  }
  const hands = [-1, 1].map(side => part(inner, SPHERE, skin, side * 0.45, 0.55, 0, 0.11));
  const feet = [-1, 1].map(side => part(inner, SPHERE, mat(INK), side * 0.17, 0.1, 0.03, 0.14, 0.1, 0.19));
  const bat = model('bat', { height: 1.2 }, { M_PCL_Flat_Grey_Lighter: 0xc98d4f, M_PCL_Flat_Black: INK }) || new THREE.Mesh(BAT, mat(0xa9622d));
  if (bat.isGroup) bat.scale.set(2.2, 1, 2.2); // в файле бита тонкая: с высоты нашей камеры её не разглядеть
  bat.position.set(0.45, 0.6, 0.12);
  bat.visible = false;
  inner.add(bat);
  return { group, inner, hands, feet, bat };
}
// moving: 0..1, насколько быстро бежит. swing: 0..1, прогресс удара битой (0 значит не бьёт).
export function animateHero(hero, time, moving, grounded, carrying, stunned, swing = 0) {
  const { inner, hands, feet, bat } = hero, phase = time * 13;
  inner.rotation.x = stunned ? -Math.PI / 2 : 0.2 * moving;
  inner.position.y = stunned ? 0.35 : Math.abs(Math.sin(phase)) * 0.07 * moving;
  feet.forEach((foot, i) => {
    const step = phase + i * Math.PI;
    foot.position.z = 0.03 + Math.sin(step) * 0.26 * moving;
    foot.position.y = grounded ? 0.1 + Math.max(0, Math.cos(step)) * 0.16 * moving : 0.24;
  });
  hands.forEach((hand, i) => {
    const side = i ? 1 : -1;
    if (carrying) hand.position.set(side * 0.3, 1.58, 0.05);
    else hand.position.set(side * 0.45, 0.55, -Math.sin(phase + i * Math.PI) * 0.28 * moving);
  });
  bat.visible = swing > 0;
  if (swing > 0) {
    bat.rotation.set(-0.7 + swing * 2.5, 0, -0.4);
    hands[1].position.set(0.45, 0.62, 0.12);
  }
}

// ---------- сторожа ----------
// Каждый сторож: { group, size, animate(time, awake, moving) }.
function guardEyes(inner, skin, x, y, z, r) {
  const lids = [];
  for (const side of [-1, 1]) {
    part(inner, SPHERE, mat(WHITE), side * x, y, z, r);
    part(inner, SPHERE, mat(INK), side * x, y, z + r * 0.85, r * 0.45, r * 0.58, r * 0.25);
    lids.push(part(inner, SPHERE, skin, side * x, y + r * 0.05, z + r * 0.1, r * 1.1)); // во сне веко закрывает глаз
  }
  return lids;
}
function makeToad(size, color, belly) {
  const { group, inner } = rig();
  const skin = mat(color);
  part(inner, SPHERE, skin, 0, 0.62, 0, 0.9, 0.62, 1);
  part(inner, SPHERE, mat(belly), 0, 0.5, 0.22, 0.74, 0.5, 0.86);
  part(inner, MOUTH, mat(0x4a2233), 0, 0.74, 0, 0.9, 1, 1);
  for (const side of [-1, 1]) {
    part(inner, SPHERE, skin, side * 0.42, 1.1, 0.36, 0.31);
    part(inner, SPHERE, skin, side * 0.78, 0.2, 0.52, 0.26, 0.18, 0.34);
    part(inner, SPHERE, skin, side * 0.82, 0.24, -0.5, 0.36, 0.26, 0.46);
  }
  const lids = guardEyes(inner, skin, 0.42, 1.15, 0.5, 0.23);
  for (let i = 0; i < 5; i++) { // бородавки на спине
    const angle = i * 2.4, reach = 0.3 + (i % 3) * 0.16;
    part(inner, SPHERE, mat(belly), Math.cos(angle) * reach * 0.8, 1.14 - reach * 0.35, -0.2 + Math.sin(angle) * reach * 0.6, 0.09, 0.05, 0.09);
  }
  part(inner, DOME, mat(0x97a3b8), 0, 1.08, -0.1, 0.42, 0.36, 0.42); // шлем сторожа
  part(inner, CONE, mat(GOLD), 0, 1.56, -0.1, 0.09, 0.26, 0.09);
  return { group, size, animate(time, awake, moving) {
    for (const lid of lids) lid.visible = !awake;
    const up = moving ? Math.abs(Math.sin(time * 10)) : 0;
    inner.position.y = up * 0.9 * size;
    inner.scale.set(size * (1.08 - up * 0.12), size * (moving ? 0.86 + up * 0.22 : 1 + Math.sin(time * 2) * 0.04), size * (1.08 - up * 0.12));
  } };
}
function makeCrab(size, color, belly) {
  const { group, inner } = rig();
  const shell = mat(color);
  part(inner, SPHERE, shell, 0, 0.58, 0, 1.05, 0.5, 0.8);
  part(inner, SPHERE, mat(belly), 0, 0.46, 0.1, 0.9, 0.36, 0.7);
  part(inner, MOUTH, mat(0x4a2233), 0, 0.5, 0, 0.6, 1, 0.82);
  for (const side of [-1, 1]) part(inner, CYL, shell, side * 0.3, 1.02, 0.45, 0.05, 0.4, 0.05);
  const lids = guardEyes(inner, shell, 0.3, 1.3, 0.45, 0.17);
  const claws = [-1, 1].map(side => {
    const claw = new THREE.Group();
    claw.position.set(side * 0.95, 0.55, 0.5);
    part(claw, SPHERE, shell, side * 0.12, 0, 0.1, 0.18, 0.18, 0.34);
    part(claw, SPHERE, shell, side * 0.2, 0.08, 0.55, 0.34, 0.27, 0.42);
    part(claw, CONE, mat(belly), side * 0.12, 0.2, 0.95, 0.11, 0.4, 0.11).rotation.x = Math.PI / 2;
    inner.add(claw);
    for (let i = 0; i < 3; i++) part(inner, SPHERE, shell, side * 0.98, 0.22, -0.05 - i * 0.28, 0.1, 0.28, 0.1).rotation.z = side * 0.6;
    return claw;
  });
  inner.scale.setScalar(size);
  return { group, size, animate(time, awake, moving) {
    for (const lid of lids) lid.visible = !awake;
    const step = Math.sin(time * 16);
    inner.position.y = moving ? Math.abs(step) * 0.14 * size : 0;
    inner.rotation.z = moving ? step * 0.09 : 0;
    claws.forEach((claw, i) => { claw.rotation.x = awake ? -0.5 - Math.abs(Math.sin(time * 8 + i * 1.5)) * 0.5 : 0; });
  } };
}
function makeYak(size, color, belly) {
  const { group, inner } = rig();
  const fur = mat(color), dark = mat(belly);
  part(inner, SPHERE, fur, 0, 0.98, 0, 0.95, 0.85, 1.25);
  part(inner, BLOB, mat(color, true), 0, 0.72, -0.05, 1.02, 0.6, 1.3);   // лохматая юбка
  part(inner, SPHERE, dark, 0, 1.05, 1.15, 0.52, 0.48, 0.5);
  part(inner, SPHERE, mat(INK), 0, 0.9, 1.58, 0.28, 0.2, 0.18);
  part(inner, SPHERE, fur, 0, 1.5, 1.05, 0.42, 0.26, 0.32);              // чёлка
  for (const side of [-1, 1]) {
    part(inner, CONE, mat(0xfff3d6), side * 0.62, 1.5, 1.05, 0.12, 0.62, 0.12).rotation.z = -side * 0.9;
    for (const z of [-0.7, 0.7]) part(inner, CYL, dark, side * 0.5, 0.3, z, 0.2, 0.6, 0.2);
  }
  const lids = guardEyes(inner, dark, 0.24, 1.2, 1.52, 0.1);
  inner.scale.setScalar(size);
  return { group, size, animate(time, awake, moving) {
    for (const lid of lids) lid.visible = !awake;
    inner.position.y = moving ? Math.abs(Math.sin(time * 9)) * 0.35 * size : 0;
    inner.rotation.x = moving ? 0.14 : Math.sin(time * 1.5) * 0.02;
  } };
}
function makeMech(size, color, accent) {
  const { group, inner } = rig();
  const plate = mat(color), brass = mat(accent);
  for (const side of [-1, 1]) {
    part(inner, WHEEL, mat(INK), side * 0.68, 0.36, 0, 0.26, 0.36, 0.36);
    part(inner, BOX, plate, side * 0.8, 1.1, 0, 0.26, 0.8, 0.26);
    part(inner, SPHERE, brass, side * 0.8, 0.6, 0.08, 0.2);
  }
  part(inner, BOX, plate, 0, 1.08, 0, 1.2, 1, 0.9);
  part(inner, BOX, brass, 0, 1.08, 0.47, 0.7, 0.5, 0.05);
  part(inner, BOX, plate, 0, 1.96, 0, 0.92, 0.6, 0.72);
  const eyeOff = part(inner, BOX, mat(INK), 0, 2, 0.37, 0.7, 0.18, 0.05);
  const eyeOn = part(inner, BOX, mat(0xff3b30, false, 0xff2010), 0, 2, 0.38, 0.7, 0.18, 0.05);
  part(inner, CYL, mat(INK), 0, 2.45, 0, 0.03, 0.4, 0.03);
  part(inner, SPHERE, mat(0xffe066, false, 0x8a6a00), 0, 2.68, 0, 0.09);
  const gear = makeGear(0.42, accent);
  gear.position.set(0, 1.15, -0.52);
  inner.add(gear);
  inner.scale.setScalar(size);
  return { group, size, animate(time, awake, moving) {
    eyeOn.visible = awake;
    eyeOff.visible = !awake;
    inner.position.y = moving ? Math.abs(Math.sin(time * 22)) * 0.05 * size : 0;
    inner.rotation.x = moving ? 0.12 : 0;
    if (awake) gear.rotation.z = time * (moving ? 9 : 2);
  } };
}
function makeEagle(size, color, belly) {
  const { group, inner } = rig();
  const feather = mat(color);
  part(inner, SPHERE, feather, 0, 1.2, 0, 0.6, 0.55, 0.95);
  part(inner, SPHERE, mat(belly), 0, 1.1, 0.4, 0.45, 0.4, 0.5);
  part(inner, SPHERE, mat(WHITE), 0, 1.75, 0.7, 0.4);
  part(inner, CONE, mat(GOLD), 0, 1.7, 1.15, 0.14, 0.4, 0.14).rotation.x = Math.PI / 2;
  part(inner, SPHERE, feather, 0, 1.15, -1, 0.35, 0.08, 0.5);
  for (const side of [-1, 1]) {
    part(inner, BOX, mat(INK), side * 0.2, 1.95, 1.02, 0.24, 0.05, 0.05).rotation.z = side * 0.45; // сердитые брови
    part(inner, SPHERE, mat(GOLD), side * 0.2, 0.62, 0.1, 0.1, 0.14, 0.16);
  }
  const lids = guardEyes(inner, mat(WHITE), 0.19, 1.82, 0.98, 0.08);
  const wings = [-1, 1].map(side => {
    const wing = new THREE.Group();
    wing.position.set(side * 0.5, 1.4, 0);
    part(wing, SPHERE, feather, side * 0.9, 0, 0, 0.95, 0.09, 0.5);
    part(wing, SPHERE, mat(belly), side * 1.5, -0.02, -0.1, 0.4, 0.06, 0.32);
    inner.add(wing);
    return wing;
  });
  inner.scale.setScalar(size);
  return { group, size, animate(time, awake, moving) {
    for (const lid of lids) lid.visible = !awake;
    inner.position.y = awake ? (0.7 + Math.sin(time * 6) * 0.15) * size : -0.5 * size; // спит на земле, проснувшись парит
    inner.rotation.x = moving ? 0.25 : 0;
    wings.forEach((wing, i) => { wing.rotation.z = (i ? -1 : 1) * (awake ? Math.sin(time * 12) * 0.6 : 1.1); });
  } };
}
const GUARDS = { toad: makeToad, crab: makeCrab, yak: makeYak, mech: makeMech, eagle: makeEagle };
const buildGuard = (kind, look) => GUARDS[kind](look.size, look.color, look.belly);

// ---------- яйца ----------
// look: { base, mark, style: 'spots' | 'stripes', glow }
function buildEgg(look) {
  const { group, inner } = rig();
  part(inner, EGG, mat(look.base, false, look.glow || 0), 0, 0, 0);
  const marks = mat(look.mark);
  if (look.style === 'stripes') {
    for (const a of [1.0, 1.6, 2.2]) part(inner, HOOP, marks, 0, eggHeight(a), 0, eggRadius(a) + 0.005, 0.7, eggRadius(a) + 0.005);
  } else {
    for (let i = 0; i < 10; i++) {
      const a = 0.6 + (i * 0.37 % 1) * 1.9, turn = i * 2.4, r = eggRadius(a);
      part(inner, SPHERE, marks, Math.cos(turn) * r, eggHeight(a), Math.sin(turn) * r, 0.05 + (i % 3) * 0.02);
    }
  }
  compact(inner); // яйцо с пятнами рисуется двумя сетками вместо одиннадцати
  return { group, inner };
}

// ---------- питомцы ----------
// look: { color, belly, ears, size }. mutation: '' | 'shiny' | 'rainbow'.
const SHINY_GLOW = 0x6b5200;
function buildPet(look, mutation) {
  const { group, inner } = rig();
  // Радужному нужен свой материал: его цвет меняется каждый кадр.
  const rainbow = mutation === 'rainbow' ? toon(look.color, 0x333333) : null;
  const fur = rainbow || mat(look.color, false, mutation === 'shiny' ? SHINY_GLOW : 0), dark = mat(INK);
  part(inner, SPHERE, fur, 0, 0.5, 0, 0.5, 0.46, 0.48);
  part(inner, SPHERE, mat(look.belly), 0, 0.42, 0.16, 0.36, 0.32, 0.36);
  part(inner, SPHERE, fur, 0, 0.36, -0.46, 0.1); // хвост
  for (const side of [-1, 1]) {
    part(inner, SPHERE, mat(WHITE), side * 0.17, 0.62, 0.39, 0.12, 0.14, 0.08);
    part(inner, SPHERE, dark, side * 0.17, 0.61, 0.45, 0.07, 0.09, 0.04);
    part(inner, SPHERE, mat(WHITE), side * 0.17 + 0.03, 0.66, 0.48, 0.025);
    part(inner, SPHERE, mat(0xff9db5), side * 0.31, 0.5, 0.35, 0.07, 0.05, 0.03);
    part(inner, SPHERE, dark, side * 0.2, 0.06, 0.1, 0.14, 0.08, 0.18);
    if (look.ears === 'round') part(inner, SPHERE, fur, side * 0.3, 0.93, 0, 0.16);
    if (look.ears === 'long') part(inner, SPHERE, fur, side * 0.22, 1.12, -0.02, 0.09, 0.32, 0.07).rotation.z = -side * 0.25;
    if (look.ears === 'horns') part(inner, CONE, mat(0xfff3d6), side * 0.22, 1.02, 0, 0.09, 0.3, 0.09).rotation.z = -side * 0.3;
    if (look.ears === 'wings') part(inner, SPHERE, mat(look.belly), side * 0.52, 0.62, -0.1, 0.22, 0.3, 0.06).rotation.z = -side * 0.6;
  }
  if (look.ears === 'antenna') {
    part(inner, CYL, dark, 0, 1.08, 0, 0.02, 0.3, 0.02);
    part(inner, SPHERE, mat(0xffe066, false, 0x665200), 0, 1.27, 0, 0.08);
  }
  if (look.ears === 'crest') for (const z of [-0.2, 0, 0.2]) part(inner, CONE, mat(look.belly), 0, 1.02 - Math.abs(z) * 0.4, z, 0.08, 0.26, 0.08);
  if (look.ears === 'halo') part(inner, HOOP, mat(GOLD, false, 0x6b5200), 0, 1.14, 0, 0.3, 1.4, 0.3);
  return { group, inner, size: look.size, phase: Math.random() * 6, rainbow };
}
export function animatePet(pet, time) {
  if (pet.model.ready) {
    pet.model.play(CALM);
    pet.model.update(elapsed(pet, time));
    if (pet.hue && pet.model.body) pet.model.body.color.setHSL((time * 0.25 + pet.phase) % 1, 0.85, 0.62); // радужный переливается
    return;
  }
  const up = Math.abs(Math.sin(time * 4 + pet.phase)), s = pet.size;
  pet.inner.position.y = up * 0.22;
  pet.inner.scale.set(s * (1.06 - up * 0.06), s * (0.94 + up * 0.1), s * (1.06 - up * 0.06));
  pet.inner.rotation.y = Math.sin(time * 0.7 + pet.phase) * 0.7;
  if (pet.rainbow) pet.rainbow.color.setHSL((time * 0.25 + pet.phase) % 1, 0.85, 0.62);
}

// ---------- декор: болото ----------
export function makeMushroom(scale, capColor) {
  const ready = model('mushroom', { height: 1.37 }, { LightRed: capColor });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group();
  part(group, CYL, mat(0xfff1dd), 0, 0.45, 0, 0.2, 0.9, 0.2);
  part(group, CYL, mat(0xffe3c2), 0, 0.82, 0, 0.7, 0.05, 0.7);
  part(group, DOME, mat(capColor), 0, 0.82, 0, 0.75, 0.55, 0.75);
  for (let i = 0; i < 5; i++) { // пятна на шляпке
    const turn = i * 2.4, tilt = 0.35 + (i % 3) * 0.33;
    part(group, DOT, mat(WHITE), Math.sin(tilt) * Math.cos(turn) * 0.75, 0.82 + Math.cos(tilt) * 0.55, Math.sin(tilt) * Math.sin(turn) * 0.75, 0.1, 0.05, 0.1);
  }
  return scaled(group, scale);
}
// file: 'tree' — лиственное, 'dead-tree' — сухое болотное (оно раскрашено рисунком, цвета на него не действуют).
export function makeTree(scale, crownColor, trunkColor, file = 'tree') {
  const ready = model(file, { height: 3.8 }, { Tree_Green: crownColor, Tree_Wood: trunkColor });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group(), crown = mat(crownColor, true);
  part(group, TRUNK, mat(trunkColor, true), 0, 1, 0, 0.3, 2, 0.3);
  part(group, BLOB, crown, 0, 2.5, 0, 1.05);
  part(group, BLOB, crown, 0.65, 2.05, 0.3, 0.72);
  part(group, BLOB, crown, -0.55, 2.15, -0.3, 0.78);
  part(group, BLOB, crown, 0.1, 3.2, 0, 0.62);
  return scaled(group, scale);
}
// file: 'rock', 'rock-moss' (со мхом) или 'rock-snow' (в снегу).
export function makeRock(scale, color, file = 'rock') {
  const ready = model(file, { width: 1.6 }, { Rock_Grey: color, Rock: color, 'Rock.001': color, 'Snow.001': WHITE });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group();
  part(group, ROCK, mat(color, true), 0, 0.45, 0, 1, 0.7, 0.85);
  part(group, ROCK, mat(color, true), 0.7, 0.25, 0.3, 0.5, 0.4, 0.45);
  return scaled(group, scale);
}
export function makeLily() {
  const ready = model('lilypad', { width: 1.6 });
  if (ready) return ready;
  const group = new THREE.Group();
  part(group, CYL, mat(0x5fc46a), 0, 0, 0, 0.8, 0.05, 0.8).castShadow = false;
  part(group, SPHERE, mat(0xff8fc0), 0.15, 0.14, 0.1, 0.18, 0.14, 0.18).castShadow = false;
  return group;
}

// ---------- декор: карамельная пустыня ----------
export function makeLollipop(scale, candyColor, swirlColor) {
  const group = new THREE.Group();
  part(group, CYL, mat(WHITE), 0, 1.2, 0, 0.08, 2.4, 0.08);
  part(group, DISK, mat(candyColor), 0, 2.9, 0, 0.9, 0.9, 0.22);
  for (const z of [-0.12, 0.12]) {
    part(group, SWIRL, mat(swirlColor), 0, 2.9, z, 0.6, 0.6, 0.4);
    part(group, SPHERE, mat(swirlColor), 0, 2.9, z, 0.2, 0.2, 0.06);
  }
  return scaled(group, scale);
}
export function makeCane(scale) {
  const group = new THREE.Group();
  for (let i = 0; i < 6; i++) part(group, CYL, mat(i % 2 ? WHITE : 0xff4f6a), 0, 0.21 + i * 0.42, 0, 0.16, 0.42, 0.16);
  part(group, HOOK, mat(0xff4f6a), 0.4, 2.52, 0);
  return scaled(group, scale);
}
export function makeGumdrop(scale, color) {
  const group = new THREE.Group();
  part(group, DOME, mat(color, false, 0x1a1a1a), 0, 0, 0, 1, 0.95, 1);
  for (let i = 0; i < 6; i++) { // сахарная крошка
    const turn = i * 2.4, tilt = 0.4 + (i % 3) * 0.3;
    part(group, DOT, mat(WHITE), Math.sin(tilt) * Math.cos(turn), Math.cos(tilt) * 0.95, Math.sin(tilt) * Math.sin(turn), 0.06);
  }
  return scaled(group, scale);
}

// Крупные сладости: 'cupcake', 'donut' или 'pudding' (желе цвета color). Без файла на этом месте стоит мармеладка.
const SWEET_WIDTH = { cupcake: 1.3, donut: 2, pudding: 1.7 };
export function makeSweet(scale, file, color) {
  const ready = model(file, { width: SWEET_WIDTH[file] }, file === 'pudding' ? { brownLight: color } : {});
  return ready ? scaled(ready, scale) : makeGumdrop(scale, color);
}

// ---------- декор: ледяной хребет ----------
export function makePine(scale) {
  const ready = model('pine-snow', { height: 3.6 }, { Wood: 0x7a5a4a, Snow: WHITE, Green: 0x3f9a8a });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group(), needles = mat(0x3f9a8a, true), snow = mat(WHITE, true);
  part(group, TRUNK, mat(0x7a5a4a, true), 0, 0.4, 0, 0.2, 0.8, 0.2);
  [[1.1, 1.3], [0.85, 2.1], [0.6, 2.85]].forEach(([radius, y]) => {
    part(group, CONE, needles, 0, y, 0, radius, 1.2, radius);
    part(group, CONE, snow, 0, y + 0.32, 0, radius * 0.62, 0.7, radius * 0.62);
  });
  return scaled(group, scale);
}
export function makeCrystal(scale, color) {
  const ready = model('crystal', { height: 1.9 }, { Atlas: [color, 0x1a3a4a] });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group(), ice = mat(color, true, 0x1a3a4a);
  part(group, ROCK, ice, 0, 1.2, 0, 0.5, 1.8, 0.5);
  part(group, ROCK, ice, 0.5, 0.6, 0.2, 0.3, 0.9, 0.3).rotation.z = -0.4;
  part(group, ROCK, ice, -0.45, 0.5, -0.1, 0.25, 0.8, 0.25).rotation.z = 0.5;
  return scaled(group, scale);
}
export function makeSnowman(scale) {
  const group = new THREE.Group(), snow = mat(WHITE);
  part(group, SPHERE, snow, 0, 0.55, 0, 0.6);
  part(group, SPHERE, snow, 0, 1.35, 0, 0.45);
  part(group, SPHERE, snow, 0, 1.98, 0, 0.32);
  part(group, HOOP, mat(0xff4f6a), 0, 1.68, 0, 0.36, 3, 0.36); // шарф
  part(group, CONE, mat(0xff9a3c), 0, 1.98, 0.42, 0.06, 0.3, 0.06).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) part(group, SPHERE, mat(INK), side * 0.12, 2.07, 0.28, 0.04);
  return scaled(group, scale);
}

// ---------- декор: заводной город ----------
function makeGear(radius, color) {
  const gear = new THREE.Group(), metal = mat(color);
  part(gear, DISK, metal, 0, 0, 0, radius, radius, 0.18);
  part(gear, DISK, mat(INK), 0, 0, 0, radius * 0.3, radius * 0.3, 0.22);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    part(gear, BOX, metal, Math.cos(a) * radius, Math.sin(a) * radius, 0, radius * 0.34, radius * 0.24, 0.18).rotation.z = a;
  }
  return gear;
}
// userData.spinner: шестерня, которую мир крутит каждый кадр.
export function makeGearTower(scale) {
  const tank = model('water-tank', { height: 3.3 }, { Grey: 0x8f9bb0, Grey2: 0x5a6275, White: 0xd9a441 }), group = tank || new THREE.Group();
  if (!tank) {
    part(group, BOX, mat(0x8f9bb0), 0, 1.6, 0, 0.8, 3.2, 0.8);
    part(group, BOX, mat(0xd9a441), 0, 3.3, 0, 1, 0.2, 1);
  }
  const gear = makeGear(tank ? 0.6 : 0.9, 0xd9a441);
  gear.position.set(0, tank ? 3.75 : 2.3, tank ? 0 : 0.52); // на цистерне шестерня стоит гребнем на крыше
  group.add(gear);
  group.userData.spinner = gear;
  return scaled(group, scale);
}
export function makeLamp(scale) {
  const ready = model('street-light', { height: 3.2 }, { Grey: 0x4a5368, Light: [0xffe89a, 0xcc9a20] });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group();
  part(group, CYL, mat(INK), 0, 1.5, 0, 0.07, 3, 0.07);
  part(group, BOX, mat(INK), 0.25, 2.95, 0, 0.6, 0.07, 0.07);
  part(group, SPHERE, mat(0xffe89a, false, 0xcc9a20), 0.5, 2.75, 0, 0.24);
  return scaled(group, scale);
}
// file: 'crate' — ящик, 'barrel' — бочка.
export function makeCrate(scale, file = 'crate') {
  const ready = model(file, { height: 1 });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group();
  part(group, BOX, mat(0xb5673a), 0, 0.5, 0, 1, 1, 1);
  for (const y of [0.2, 0.8]) part(group, BOX, mat(0xd9a441), 0, y, 0, 1.06, 0.12, 1.06);
  return scaled(group, scale);
}
// Трубопровод лежит вдоль оси x: по ней же мир ставит ему препятствия.
export function makePipes(scale) {
  const group = new THREE.Group(), run = model('pipes', { width: 3.2 }, { Grey: 0xb5673a, Grey2: 0xd9a441 });
  if (run) {
    run.rotation.y = Math.PI / 2; // в файле трубы идут вдоль z
    group.add(run);
  } else {
    part(group, WHEEL, mat(0xb5673a), 0, 0.35, 0, 3.2, 0.3, 0.3);
    for (const x of [-1.5, 1.5]) part(group, WHEEL, mat(0xd9a441), x, 0.35, 0, 0.14, 0.38, 0.38);
  }
  return scaled(group, scale);
}

// ---------- декор: облачные вершины ----------
export function makeColumn(scale) {
  const ready = model('column', { height: 3.6 }, { Grey_Floor: 0xf7f3ea, DarkGrey_Floor: [GOLD, 0x4a3500] });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group(), marble = mat(0xf7f3ea);
  part(group, BOX, marble, 0, 0.15, 0, 1, 0.3, 1);
  part(group, CYL, marble, 0, 1.85, 0, 0.36, 3.1, 0.36);
  part(group, BOX, mat(GOLD, false, 0x4a3500), 0, 3.5, 0, 1, 0.26, 1);
  return scaled(group, scale);
}
export function makePuff(scale) {
  const ready = model('cloud', { width: 2.7 }, { Cloud: [WHITE, 0x444444] });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group(), fluff = mat(WHITE, false, 0x444444);
  for (const [x, y, z, s] of [[0, 0.55, 0, 0.75], [0.7, 0.4, 0.2, 0.55], [-0.7, 0.42, -0.1, 0.58], [0.1, 1, 0, 0.5]]) part(group, SPHERE, fluff, x, y, z, s);
  return scaled(group, scale);
}
export function makeRainbow(scale) {
  const group = new THREE.Group();
  [0xff5a6e, 0xffb35c, 0xffe066, 0x6fe07a, 0x5cb8ff, 0xb48cff].forEach((color, i) => {
    part(group, ARC, mat(color, false, 0x222222), 0, 0, 0, 3 - i * 0.2, 3 - i * 0.2, 3);
  });
  return scaled(group, scale);
}
export function makeStar(scale) {
  const ready = model('star', { height: 0.9 }, { Yellow: [0xffe066, 0x8a6a00] });
  if (ready) return scaled(ready, scale);
  const group = new THREE.Group();
  part(group, ROCK, mat(0xffe066, true, 0x8a6a00), 0, 0.5, 0, 0.3, 0.45, 0.3);
  return scaled(group, scale);
}
export function makeCloud(scale) {
  const ready = model('cloud', { width: 3.75 }, { Cloud: [WHITE, 0x555555] });
  if (ready) {
    ready.traverse(node => { node.castShadow = false; }); // иначе облака бросали бы тень на острова
    return scaled(ready, scale);
  }
  const group = new THREE.Group(), fluff = mat(WHITE, false, 0x555555);
  for (const [x, y, z, s] of [[0, 0, 0, 1], [1.1, -0.1, 0.2, 0.75], [-1.1, -0.15, -0.1, 0.8], [0.3, 0.5, 0, 0.7]]) {
    part(group, SPHERE, fluff, x, y, z, s, s * 0.7, s).castShadow = false;
  }
  return scaled(group, scale);
}

// ---------- постройки и предметы ----------
export function makeNest() {
  const group = new THREE.Group();
  part(group, RING, mat(0xc99b55, true), 0, 0.22, 0, 0.95, 0.9, 0.95);
  part(group, CYL, mat(0x9a7340), 0, 0.08, 0, 0.9, 0.16, 0.9);
  return group;
}
export function makePad(color) {
  const group = new THREE.Group();
  part(group, CYL, mat(color), 0, 0.06, 0, 1.2, 0.12, 1.2).receiveShadow = true;
  part(group, HOOP, mat(WHITE), 0, 0.13, 0, 1.15, 1, 1.15);
  return group;
}
export function makeChest() {
  const chest = model('chest', { height: 1.3 }, { Metal: [GOLD, 0x4a3500], Wood: 0xa9622d, DarkWood: 0x8a4c22 });
  if (chest) {
    // Монеты прислонены к сундуку спереди: без них он выглядит просто ящиком.
    for (const [x, turn] of [[-0.55, 0.4], [0.05, -0.2], [0.6, 0.3]]) {
      const coin = model('coin', { height: 0.5 }, { Yellow: [GOLD, 0x4a3500], DarkYellow: 0xd9a441 });
      if (!coin) break;
      coin.position.set(x, 0, 0.78);
      coin.rotation.set(-0.4, turn, 0);
      chest.add(coin);
    }
    return chest;
  }
  const group = new THREE.Group(), wood = mat(0xa9622d), gold = mat(GOLD, false, 0x4a3500);
  part(group, BOX, wood, 0, 0.45, 0, 1.7, 0.9, 1.1);
  part(group, BOX, mat(0x8a4c22), 0, 1.02, 0, 1.8, 0.28, 1.2);
  for (const x of [-0.6, 0.6]) part(group, BOX, gold, x, 0.6, 0, 0.14, 1.24, 1.24);
  part(group, BOX, gold, 0, 0.8, 0.58, 0.3, 0.34, 0.1);
  for (let i = 0; i < 6; i++) part(group, CYL, gold, -0.5 + i * 0.2, 1.2 + (i % 2) * 0.07, (i % 3 - 1) * 0.25, 0.2, 0.06, 0.2);
  return group;
}
// Ворота зоны: столбы, перекладина и светящиеся шары цвета зоны.
export function makeGate(color) {
  const group = new THREE.Group(), wood = mat(0x8a5a3c, true);
  for (const x of [-2.9, 2.9]) {
    part(group, TRUNK, wood, x, 2, 0, 0.32, 4, 0.32);
    part(group, SPHERE, mat(color, false, 0x333333), x, 4.6, 0, 0.55);
  }
  part(group, BOX, wood, 0, 4, 0, 6.6, 0.45, 0.45);
  part(group, BOX, mat(color), 0, 3.3, 0, 2.6, 0.9, 0.1);
  return group;
}
// Мост вдоль оси z: доски и верёвочные перила.
export function makeBridge(length, width) {
  const group = new THREE.Group(), plank = mat(0xc98d4f, true), rope = mat(0x7a5230);
  for (let i = 0; i < length; i++) {
    part(group, BOX, plank, 0, -0.05, -i - 0.5, width, 0.16, 0.82).rotation.y = (i % 3 - 1) * 0.03;
  }
  for (const x of [-width / 2, width / 2]) {
    for (let z = 0; z <= length; z += 3) part(group, CYL, rope, x, 0.5, -z, 0.09, 1.1, 0.09);
    part(group, BOX, rope, x, 0.95, -length / 2, 0.06, 0.06, length);
  }
  for (const child of group.children) child.receiveShadow = true;
  return group;
}
export function makeFlag(color) {
  const ready = model('flag', { height: 4.1 }, { LightRed: color });
  if (ready) return ready;
  const group = new THREE.Group();
  part(group, CYL, mat(0xe8eefc), 0, 2, 0, 0.07, 4, 0.07);
  part(group, BOX, mat(color), 0.75, 3.5, 0, 1.4, 0.85, 0.05);
  part(group, SPHERE, mat(GOLD), 0, 4.05, 0, 0.14);
  return group;
}
export function makeTrap() {
  const group = model('trap', { width: 1.5 }, { Grey: STEEL }) || new THREE.Group(), jaws = group.children.length > 0;
  part(group, HOOP, mat(0xff3b30), 0, 0.1, 0, 0.66, 1.5, 0.66); // красный обод: серый капкан на серой земле не разглядеть
  if (jaws) return group;
  part(group, CYL, mat(INK), 0, 0.04, 0, 0.7, 0.08, 0.7);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    part(group, CONE, mat(STEEL), Math.cos(a) * 0.42, 0.2, Math.sin(a) * 0.42, 0.07, 0.28, 0.07);
  }
  part(group, SPHERE, mat(0xff3b30, false, 0xcc1a10), 0, 0.14, 0, 0.1);
  return group;
}
