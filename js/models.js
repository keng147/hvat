// Готовые модели: сторожа и питомцы со скелетом и анимациями, ниже — неподвижные предметы. Лицензия CC0 (см. models/README.txt).
// Модель персонажа грузится, когда впервые понадобилась. Пока её нет (и если загрузка не удалась), на её месте стоит
// прежний вид, собранный кодом: игра сеть не ждёт.
import { THREE } from './engine.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone } from './vendor/SkeletonUtils.js';

// Мультяшная окраска: свет ложится тремя ровными тонами, а не плавным переходом.
const TONES = new THREE.DataTexture(new Uint8Array([165, 222, 255]), 3, 1, THREE.RedFormat);
TONES.minFilter = TONES.magFilter = THREE.NearestFilter;
TONES.needsUpdate = true;
export const toon = (color, emissive = 0, map = null) => new THREE.MeshToonMaterial({ color, emissive, map, gradientMap: TONES });

const INK = 0x23283d;
const OUTLINE_SHARE = 0.018; // толщина обводки в долях высоты модели
const CULL_MARGIN = 1.6;     // запас шара видимости на взмахи крыльев и шаги
export const BRIGHTER = [0, 0.1, 0.2]; // в исходных файлах цвета тёмные и приглушённые: сдвиг насыщенности и светлоты под нашу картинку

// Материал модели в нашем стиле. Белки глаз в файлах серые, чёрные детали осветлять нельзя.
function cartoon(source) {
  const color = source.color.clone();
  if (/Eye_White|^White$/.test(source.name)) color.set(0xf4f6ff);
  else if (!/Black/.test(source.name)) color.offsetHSL(...BRIGHTER);
  const material = toon(color, 0, source.map);
  material.name = source.name;
  return material;
}
// Обводка скелетной сетки: та же сетка, вывернутая наизнанку и раздутая вдоль нормалей на width (в единицах самой сетки).
function outlineMaterial(width) {
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.uWidth = { value: width };
    shader.vertexShader = 'uniform float uWidth;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(objectNormal) * uWidth;');
  };
  return material;
}
// В части файлов веса привязки вершин к костям испорчены конвертацией (не числа). Такая вершина улетает в никуда
// и ломает расчёт размеров, поэтому испорченный вес считается нулём, а вершина без весов целиком идёт за первой костью.
function healWeights(mesh) {
  const weights = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < weights.count; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      if (!Number.isFinite(weights.getComponent(i, k))) weights.setComponent(i, k, 0);
      sum += weights.getComponent(i, k);
    }
    if (sum === 0) weights.setComponent(i, 0, 1);
  }
  mesh.normalizeSkinWeights();
}
// Размеры скелетной сетки верны только после того, как кости заняли свои места.
function pose(root) {
  root.updateMatrixWorld(true);
  root.traverse(node => {
    if (!node.isSkinnedMesh) return;
    node.skeleton.update();
    node.computeBoundingBox();
  });
}

// Приводит загруженный файл к виду, из которого удобно делать копии.
function prepare(gltf) {
  const scene = gltf.scene, materials = new Map(), outlines = new Map(), spheres = new Map(), raw = new THREE.Vector3(), posed = new THREE.Vector3();
  scene.traverse(node => {
    if (!node.isMesh) return;
    if (node.isSkinnedMesh) healWeights(node);
    node.castShadow = true;
    if (!materials.has(node.material)) materials.set(node.material, cartoon(node.material));
    node.material = materials.get(node.material);
  });
  pose(scene);
  const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3());
  // Обводке нужна толщина в единицах самой сетки, а они у каждой сетки свои: сравниваем её исходный размер с размером в позе.
  scene.traverse(node => {
    if (!node.isSkinnedMesh) return;
    node.geometry.computeBoundingBox();
    node.geometry.boundingBox.getSize(raw);
    node.boundingBox.getSize(posed).multiply(node.getWorldScale(new THREE.Vector3()));
    const ratio = Math.max(posed.x, posed.y, posed.z) / Math.max(raw.x, raw.y, raw.z);
    // Шар, по которому решается, видна ли модель. Он считается по одной позе, поэтому берётся с запасом на анимацию:
    // без запаса модель пропадала бы у края экрана, а без шара рисовалась бы всегда, даже за спиной камеры.
    node.computeBoundingSphere();
    node.boundingSphere.radius *= CULL_MARGIN;
    spheres.set(node.name, node.boundingSphere);
    outlines.set(node.name, outlineMaterial(OUTLINE_SHARE * size.y / ratio)); // по имени сетки: при копировании модели ссылки на материалы в самих сетках не переживают
  });
  const clips = {};
  for (const clip of gltf.animations) clips[clip.name.split('|').pop()] = clip; // имена приходят с приставкой скелета: «CharacterArmature|Idle»
  return { scene, clips, outlines, spheres, size, floor: box.min.y, center: box.getCenter(new THREE.Vector3()) };
}

const loader = new GLTFLoader(), library = new Map();
// Файл читается один раз, сколько бы копий модели ни понадобилось.
export function loadModel(file) {
  if (!library.has(file)) library.set(file, new Promise((resolve, reject) => loader.load('models/' + file + '.glb', gltf => resolve(prepare(gltf)), undefined, reject)));
  return library.get(file);
}

// ---------- предметы ----------
// Неподвижные модели без скелета: декор зон и постройки (models/props). Мир строится за один проход, поэтому предметы
// грузятся все разом до старта игры (loadProps), а prop отдаёт копию сразу. Чего загрузить не удалось, то игра рисует кодом.
const PROP_FILES = [
  'barrel', 'bat', 'chest', 'cloud', 'coin', 'column', 'crate', 'crystal', 'cupcake', 'dead-tree', 'donut', 'flag',
  'lilypad', 'mushroom', 'pine-snow', 'pipes', 'pudding', 'rock', 'rock-moss', 'rock-snow', 'star', 'street-light', 'trap', 'tree', 'water-tank',
];
const PROPS_WAIT = 8000; // мс: дольше старт игры предметы не ждёт
const FOOT_SHARE = 0.08; // нижняя доля высоты, по которой ищется точка опоры
const props = new Map();

// Размеры предмета и его точка опоры: середина нижнего среза, а не всей модели.
// У дерева это ствол, у фонаря столб: именно там стоит препятствие, в которое упирается герой.
function measure(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3());
  const foot = new THREE.Box3(), point = new THREE.Vector3(), limit = box.min.y + size.y * FOOT_SHARE;
  scene.traverse(node => {
    if (!node.isMesh) return;
    const points = node.geometry.attributes.position;
    for (let i = 0; i < points.count; i++) if (point.fromBufferAttribute(points, i).applyMatrix4(node.matrixWorld).y <= limit) foot.expandByPoint(point);
  });
  const anchor = foot.getCenter(new THREE.Vector3());
  return { scene, size, floor: box.min.y, x: anchor.x, z: anchor.z };
}
// Загружает все предметы. Не падает: о файле, который не пришёл, остаётся запись в консоли.
export function loadProps() {
  const all = Promise.all(PROP_FILES.map(file => new Promise(resolve => loader.load('models/props/' + file + '.glb', gltf => {
    props.set(file, measure(gltf.scene));
    resolve();
  }, undefined, error => {
    console.warn('Предмет ' + file + ' не загрузился, остаётся нарисованный кодом', error);
    resolve();
  }))));
  return Promise.race([all, new Promise(resolve => setTimeout(resolve, PROPS_WAIT))]);
}
// Копия предмета, стоящая на земле точкой опоры в начале координат, либо null, если файла нет.
// fit: { height } или { width } — рост либо наибольший размер по земле, в метрах. paint(материал из файла) отдаёт материал для детали.
export function prop(file, fit, paint) {
  const source = props.get(file);
  if (!source) return null;
  const root = source.scene.clone(), scale = fit.height ? fit.height / source.size.y : fit.width / Math.max(source.size.x, source.size.z);
  root.scale.multiplyScalar(scale);
  root.position.set(-source.x * scale, -source.floor * scale, -source.z * scale);
  root.traverse(node => {
    if (!node.isMesh) return;
    node.material = paint(node.material);
    node.castShadow = true;
  });
  const holder = new THREE.Group();
  holder.add(root);
  return holder;
}

// ---------- персонажи ----------
// Копия модели нужного размера, стоящая на земле в начале координат.
// options: height — высота в метрах; wide — какая доля ширины тоже должна уложиться в height (для крылатых);
// lift — на сколько приподнять; tint — цвет основного материала; glow — свечение; own — нужен свой основной материал.
function copy(source, options) {
  const root = clone(source.scene), fit = options.height / Math.max(source.size.y, source.size.x * (options.wide || 0));
  root.scale.multiplyScalar(fit);
  root.position.set(-source.center.x * fit, -source.floor * fit + (options.lift || 0), -source.center.z * fit);
  let body = null;
  const changed = options.tint !== undefined || options.glow || options.own, mine = new Map();
  root.traverse(node => {
    if (!node.isMesh) return;
    if (changed) { // перекрашенной копии нужны свои материалы, иначе цвет сменится у всех таких моделей
      if (!mine.has(node.material)) mine.set(node.material, node.material.clone());
      node.material = mine.get(node.material);
      if (options.glow) node.material.emissive.set(options.glow);
    }
    if (!body && /Main$/.test(node.material.name)) body = node.material;
  });
  if (body && options.tint !== undefined) body.color.set(options.tint);
  const shells = [];
  root.traverse(node => { if (node.isSkinnedMesh) shells.push(node); });
  for (const mesh of shells) {
    mesh.boundingSphere = source.spheres.get(mesh.name).clone();
    const shell = new THREE.SkinnedMesh(mesh.geometry, source.outlines.get(mesh.name));
    shell.boundingSphere = mesh.boundingSphere.clone();
    shell.bind(mesh.skeleton, mesh.bindMatrix);
    shell.position.copy(mesh.position);
    shell.quaternion.copy(mesh.quaternion);
    shell.scale.copy(mesh.scale);
    mesh.parent.add(shell);
  }
  return { root, body, materials: [...mine.values()] };
}

// Ставит модель в группу holder вместо того, что в ней было, когда модель загрузится.
// Возвращает пульт: ready — модель на месте; play(names, speed) — включить первую из анимаций, какая есть у модели;
// update(dt) — продвинуть анимацию; body — основной материал (свой у перекрашенной копии); dispose() — убрать за собой.
export function mount(holder, file, options) {
  const control = {
    ready: false, body: null, mixer: null, actions: {}, current: null, materials: [],
    play(names, speed = 1) {
      const name = names.find(candidate => control.actions[candidate]);
      if (!name) return;
      const next = control.actions[name];
      next.timeScale = speed;
      if (control.current === next) return;
      if (control.current) control.current.fadeOut(0.2);
      next.reset().fadeIn(0.2).play();
      control.current = next;
    },
    update(dt) {
      if (control.mixer) control.mixer.update(dt);
    },
    dispose() {
      for (const material of control.materials) material.dispose();
    },
  };
  loadModel(file).then(source => {
    const made = copy(source, options);
    holder.clear();
    holder.add(made.root);
    control.mixer = new THREE.AnimationMixer(made.root);
    for (const name of Object.keys(source.clips)) control.actions[name] = control.mixer.clipAction(source.clips[name]);
    control.body = made.body;
    control.materials = made.materials;
    control.ready = true;
  }, error => console.warn('Модель ' + file + ' не загрузилась, остаётся нарисованная кодом', error));
  return control;
}
