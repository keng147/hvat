// «Хвать!»: укради яйцо у сторожа, донеси до базы, выведи питомца. Игра на одного с ботами-соперниками.
import { THREE, scene, camera, solids, lens, init, aimSun, setSky, moveVector, stepBody, label, setText, toScreen, burst, pulse, shake, snapshot, run, crash } from './engine.js';
import { paint, symbol } from './icons.js';
import { loadModel, loadProps } from './models.js';
import { play, isMuted, setMuted } from './sound.js';
import { animateHero, makeGuard, makeEgg, makePet, animatePet, makeTrap } from './art.js';
import { buildWorld, floorAt, inZone, toWorld, BASE_RADIUS, CAMERA } from './world.js';
import {
  RARITY, EGGS, ZONES, speciesById, mutationById, START_SLOTS, MAX_SLOTS, MAX_SPEED_LEVEL, speedPoints, pointsToSpeed, speedCost,
  slotCost, trapCost, BATS, MAX_TRAPS_PLACED, MAX_TRAPS_OWNED, TRAP_STUN_BOT, TRAP_STUN_GUARD, TRAP_REACH, TRAP_IMMUNITY, trapHolds, SELL_SECONDS, BANK_HOURS,
  ALERT_TIME, POST_OFFSET, catchRadius, guardSpeed, rollPet, rollMutation, petIncome, accrue,
  PREMIUM_PADS, BOOST_POINTS, LUCK_FACTOR, PIGGY_SHARE, hoursToCoins,
  SPECIES, MUTATIONS, hatchTable, VARIANTS, SET_POINTS, cleanAlbum, albumHas, albumAdd, setDone, albumCount, albumPoints,
  warmSeconds, STAR_PERIOD, STAR_LIFE, STAR_FIRST, CALENDAR, QUESTS_PER_DAY, questsFor,
  nextVariant, mergeMates, rebirthFactor, startSlots, canRebirth, LUCK_HOUR_FACTOR, luckHourLeft, nextLuckHour, weekOf,
} from './data.js';
import { createActor, createBots, startSwing, stepSwing } from './bots.js';
import { canPay, getCatalog, getInvite, getBoard, sync, buy, plan } from './pay.js';

// ---------- Telegram и сохранение ----------
const $ = id => document.getElementById(id);
const tg = window.Telegram?.WebApp;
const atLeast = version => !!tg?.isVersionAtLeast?.(version);
tg?.ready();
tg?.expand();
if (atLeast('7.7')) tg.disableVerticalSwipes(); // иначе свайп вниз во время игры сворачивает апп
const buzz = style => { if (atLeast('6.1')) tg.HapticFeedback.impactOccurred(style); };

const { format } = new Intl.NumberFormat('ru', { notation: 'compact', maximumFractionDigits: 1 });
const short = n => format(Math.floor(n));
function clock(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = Math.floor(seconds % 60);
  return h ? h + ' ч ' + m + ' мин' : m + ':' + String(s).padStart(2, '0');
}
const clamp = (value, min, max) => THREE.MathUtils.clamp(Math.floor(Number(value) || 0), min, max);

// ponytail: прогресс лежит у игрока (телефон и облако Telegram), время берётся с его часов. Монеты и ускорители
// накрутить можно, улучшения за звёзды нет: их список при каждом входе присылает сервер. Вредит накрутка только
// самому игроку; когда появится таблица лидеров, баланс переедет на сервер.
const SAVE_KEY = 'hvat-save', DEVICE_KEY = 'hvat-device';
// Память страницы на телефоне общая для всех аккаунтов Telegram, поэтому копия прогресса на устройстве своя у каждого игрока.
// Облако Telegram и так у каждого своё. Копия без номера игрока, сделанная до этого, внутри Telegram не читается:
// неизвестно, чья она, а свой прогресс игрок получит из облака.
const player = String(tg?.initDataUnsafe?.user?.id || '');
const LOCAL_KEY = player ? SAVE_KEY + ':' + player : SAVE_KEY;
const CLOUD_LIMIT = 4096, CLOUD_PAUSE = 5000, CLOUD_TIMEOUT = 4000, CLOUD_TRIES = 3, CLOUD_RETRY = 2000;
const cloud = atLeast('6.9') ? tg.CloudStorage : null;
// Метка устройства: по ней узнаём в облаке собственную запись, на которую не дошло подтверждение.
let device = '';
try {
  device = localStorage.getItem(DEVICE_KEY) || Math.random().toString(36).slice(2, 10);
  localStorage.setItem(DEVICE_KEY, device);
} catch {}
// slots: null | { egg, readyAt } | { pet, m }. placed: расставленные ловушки [[x, z], ...].
// Покупки за звёзды: perks (навсегда), boostUntil (до какого времени действует ускоритель), luck (на сколько яиц осталось амулета),
// boostBank (минуты ускорителя в запасе: включает сам игрок), luckOn (амулет включён), piggy (монеты в копилке),
// claimed (номера платежей, уже выданных, но ещё не подтверждённых серверу).
// tut: номер шага обучения, TUT_DONE — пройдено. У сохранений, сделанных до появления обучения, этого поля нет: им оно не нужно.
// offer: окошко с набором делюкс уже показывали.
// rev: номер версии в облаке, на которой стоит этот прогресс. Растёт на единицу с каждой отправкой, часы устройств не участвуют.
// album: коллекция (см. data.js). cal: календарь наград, n — сколько наград забрано, d — день последней.
// q: задания дня, d — день, p — сколько сделано по каждому, c — за какие награда уже забрана.
// Яйцо на площадке со star: true принесено из звёздного гнезда, питомец из него выйдет хотя бы сияющим.
// reb: сколько раз игрок переродился (см. data.js). wk: яйца, принесённые на базу за неделю номер k, для таблицы друзей.
const SLOT_TOTAL = MAX_SLOTS + PREMIUM_PADS, PERKS = ['x2coins', 'x2hatch', 'pads'], TRAPS_LIMIT = 99, TUT_DONE = 99;
const dayCounters = list => Array.from({ length: QUESTS_PER_DAY }, (_, i) => clamp(Array.isArray(list) && list[i], 0, 999));
const save = {
  rev: 0, coins: 0, speedLevel: 0, slotCount: START_SLOTS, slots: Array(SLOT_TOTAL).fill(null), bank: 0, bankAt: Date.now(), traps: 0, placed: [], bat: 0,
  perks: {}, boostUntil: 0, luck: 0, claimed: [], tut: 0, offer: false,
  album: cleanAlbum(''), cal: { n: 0, d: '' }, q: { d: '', p: dayCounters(), c: dayCounters() },
  boostBank: 0, luckOn: false, piggy: 0, reb: 0, wk: { k: 0, n: 0 },
};
// День по часам игрока: по нему меняются задания и выдаётся награда за вход.
function today() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}
// Место доступно, если это купленная за монеты площадка или золотая площадка при купленном улучшении.
const usable = i => i < save.slotCount || (i >= MAX_SLOTS && !!save.perks.pads);

function cleanSlot(slot) {
  if (slot && EGGS[slot.egg] && Number.isFinite(slot.readyAt)) return { egg: slot.egg, readyAt: slot.readyAt, star: !!slot.star };
  if (slot && speciesById(slot.pet)) return { pet: slot.pet, m: mutationById(slot.m) ? slot.m : slot.shiny ? 'shiny' : '' }; // shiny: формат первой версии
  return null;
}
// Разбирает текст сохранения. Мусор и чужие данные дают null.
function readSave(raw) {
  try {
    const s = JSON.parse(raw);
    return s && typeof s === 'object' ? s : null;
  } catch {
    return null;
  }
}
const revOf = s => Math.max(1, Math.floor(Number(s.rev)) || 1); // у сохранений, сделанных до появления версий, она первая
function adopt(s) {
  save.rev = revOf(s);
  save.coins = Math.max(0, Math.floor(Number(s.coins) || 0));
  save.speedLevel = clamp(s.speedLevel, 0, MAX_SPEED_LEVEL);
  save.reb = clamp(s.reb, 0, 999);
  save.slotCount = clamp(s.slotCount, startSlots(save.reb), MAX_SLOTS);
  save.perks = Object.fromEntries(PERKS.map(perk => [perk, !!(s.perks && s.perks[perk])]));
  save.slots = Array.from({ length: SLOT_TOTAL }, (_, i) => cleanSlot(Array.isArray(s.slots) && usable(i) ? s.slots[i] : null));
  save.bank = Math.max(0, Number(s.bank) || 0);
  save.bankAt = Math.min(Date.now(), Number(s.bankAt) || Date.now());
  save.traps = clamp(s.traps, 0, TRAPS_LIMIT);
  save.boostUntil = Number(s.boostUntil) || 0;
  save.luck = clamp(s.luck, 0, 999);
  save.claimed = (Array.isArray(s.claimed) ? s.claimed : []).map(String).slice(-50);
  save.placed = (Array.isArray(s.placed) ? s.placed : []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, MAX_TRAPS_PLACED);
  save.bat = clamp(s.bat, 0, BATS.length - 1);
  save.tut = s.tut === undefined ? TUT_DONE : clamp(s.tut, 0, TUT_DONE);
  save.offer = !!s.offer;
  // У сохранений, сделанных до появления коллекции, она собирается из питомцев, которые стоят на базе.
  save.album = s.album === undefined
    ? save.slots.reduce((album, slot) => (slot && slot.pet ? albumAdd(album, slot.pet, slot.m) : album), cleanAlbum(''))
    : cleanAlbum(s.album);
  save.cal = { n: clamp(s.cal && s.cal.n, 0, 99999), d: String((s.cal && s.cal.d) || '') };
  save.q = { d: String((s.q && s.q.d) || ''), p: dayCounters(s.q && s.q.p), c: dayCounters(s.q && s.q.c) };
  save.boostBank = clamp(s.boostBank, 0, 99999);
  save.luckOn = !!s.luckOn && save.luck > 0;
  save.piggy = Math.max(0, Number(s.piggy) || 0);
  save.wk = { k: clamp(s.wk && s.wk.k, 0, 99999), n: clamp(s.wk && s.wk.n, 0, 99999) };
}
// Счёт яиц за текущую неделю. С новой неделей начинается заново.
function weekEggs() {
  const week = weekOf(Date.now());
  if (save.wk.k !== week) save.wk = { k: week, n: 0 };
  return save.wk;
}

// ---------- облако ----------
// Правило одно: в облако пишем, только прочитав его прямо перед записью. Если там версия новее нашей, значит играли
// на другом устройстве: берём её целиком, а несохранённые секунды с этого устройства теряются. Так игра, забытая
// открытой на компьютере, не затрёт вечерний прогресс с телефона.
let cloudTimer = 0;
let afterAdopt = () => {}; // игра подставляет сюда перестройку сцены под принятое сохранение
function storeLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(save)); } catch {}
}
// Дочитывает облако. Отвечает, удалось ли его прочитать.
function pullCloud() {
  return new Promise(resolve => {
    if (!cloud) return resolve(true);
    const timer = setTimeout(() => resolve(false), CLOUD_TIMEOUT); // бывает, что облако не отвечает вовсе
    cloud.getItem(SAVE_KEY, (error, raw) => {
      clearTimeout(timer);
      const theirs = !error && raw ? readSave(raw) : null;
      if (theirs && revOf(theirs) > save.rev) {
        if (theirs.dev === device) save.rev = revOf(theirs); // наша же запись, подтверждение на которую не дошло
        else {
          adopt(theirs);
          afterAdopt();
        }
        storeLocal();
      }
      resolve(!error);
    });
  });
}
async function pushCloud() {
  if (!(await pullCloud())) return; // не прочитали — не пишем, попробуем при следующем сохранении
  const rev = save.rev + 1, raw = JSON.stringify({ ...save, rev, dev: device });
  if (raw.length > CLOUD_LIMIT) return;
  cloud.setItem(SAVE_KEY, raw, (error, stored) => {
    if (error || !stored) return;
    save.rev = Math.max(save.rev, rev);
    storeLocal();
  });
}
// urgent: отправить в облако сразу, а не через CLOUD_PAUSE. Так сохраняются покупки за звёзды.
function persist(urgent = false) {
  storeLocal();
  if (!cloud || (cloudTimer && !urgent)) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    cloudTimer = 0;
    pushCloud();
  }, urgent ? 0 : CLOUD_PAUSE);
}

// Во сколько раз доход питомцев больше записанного в data.js: двойной доход за звёзды и перерождения.
const incomeFactor = () => (save.perks.x2coins ? 2 : 1) * rebirthFactor(save.reb);
const incomeRate = () => save.slots.reduce((sum, slot) => sum + (slot && slot.pet ? petIncome(slot) : 0), 0) * incomeFactor();
const boosted = () => Date.now() < save.boostUntil;
// Скорость без ускорителя: купленные уровни и очки за коллекцию. По ней же бегают боты.
const basePoints = () => speedPoints(save.speedLevel) + albumPoints(save.album);
const heroPoints = () => basePoints() + (boosted() ? BOOST_POINTS : 0);
function bankNow() {
  const rate = incomeRate();
  return accrue(save.bank, rate, Math.max(0, (Date.now() - save.bankAt) / 1000), rate * BANK_HOURS * 3600);
}
// Фиксирует накопленное. Вызывается перед любым изменением дохода.
function settle() {
  save.bank = bankNow();
  save.bankAt = Date.now();
}
const petTitle = slot => (slot.m ? mutationById(slot.m).mark + ' ' : '') + speciesById(slot.pet).name;

// ---------- мелкий интерфейс ----------
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  paint(el, text);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}
// Всплывающая надпись над точкой мира: «+120».
function pop(text, position) {
  const point = toScreen(position);
  const el = document.createElement('div');
  el.className = 'pop';
  paint(el, text);
  el.style.left = point.x + 'px';
  el.style.top = point.y + 'px';
  el.addEventListener('animationend', () => el.remove());
  $('labels').appendChild(el);
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  paint(node, text);
  return node;
}
// Монеты летят из точки мира в счётчик: награду видно глазами, а не только цифрой.
function flyCoins(position, count) {
  const from = toScreen(position), box = $('coins').getBoundingClientRect();
  const place = (x, y, scale) => 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%) scale(' + scale + ')';
  for (let i = 0; i < count; i++) {
    const coin = el('div', 'fly', '');
    coin.appendChild(symbol('coin'));
    $('labels').appendChild(coin);
    const side = (Math.random() - 0.5) * 120;
    coin.animate([
      { transform: place(from.x, from.y, 0.6) },
      { transform: place(from.x + side, from.y - 60, 1.1), offset: 0.3 },
      { transform: place(box.left + 22, box.top + box.height / 2, 0.7) },
    ], { duration: 520 + i * 70, easing: 'cubic-bezier(.5,0,.4,1)' }).onfinish = () => {
      coin.remove();
      $('coins').classList.remove('bump');
      void $('coins').offsetWidth; // перезапуск анимации счётчика
      $('coins').classList.add('bump');
    };
  }
}
// Меняет надпись, только если она другая: иначе каждый кадр перестраивал бы страницу.
function write(id, text) {
  paint($(id), text);
}
// Строка списка в лавке и на карте мест: значок, заголовок с пояснением и плашка справа.
function rowButton(className, icon, title, text, badge) {
  const button = el('button', className, ''), body = el('div', 'label', '');
  body.append(el('b', '', title), el('span', '', text));
  button.append(...(icon ? [el('u', '', icon)] : []), body, el('i', '', badge));
  return button;
}

// ---------- игра ----------
function start() {
  const HERO_COLOR = 0x3d9bff, WATER_LINE = -1.4;
  // Для отладки: index.html?spawn=x,z ставит героя в нужную точку мира, ?star=секунды задаёт, когда появится первое звёздное яйцо,
  // ?luck=секунды включает час удачи на столько секунд от входа в игру.
  const debug = new URLSearchParams(location.search);
  const debugSpawn = (debug.get('spawn') || '').split(',').map(Number);
  const SPAWN = debugSpawn.length === 2 && debugSpawn.every(Number.isFinite) ? debugSpawn : [0, -4];
  const debugLuckEnd = Date.now() + (Number(debug.get('luck')) || 0) * 1000;
  // Сколько секунд осталось до конца часа удачи, 0 — он не идёт. mutationLuck: во сколько раз сейчас подняты шансы мутаций.
  const luckLeft = () => Math.max(0, Math.ceil((debugLuckEnd - Date.now()) / 1000)) || luckHourLeft(Date.now());
  const mutationLuck = () => (save.luckOn && save.luck > 0 ? LUCK_FACTOR : 1) * (luckLeft() ? LUCK_HOUR_FACTOR : 1);
  const CHEST_PERIOD = 2;   // стоя у сундука, забираем монеты раз в столько секунд
  const NEST_RESPAWN = 4;   // через столько секунд в гнезде появляется новое яйцо
  const LOOSE_SECONDS = 20; // столько яйцо лежит на земле, потом возвращается в гнездо
  const CLUTCH = [[0, -0.38], [-0.36, 0.24], [0.36, 0.24]]; // места яиц в гнезде: кладка, чтобы гнездо не пустовало, пока кто-то уносит одно
  const GRAB_REACH = 2.2;   // с такого расстояния появляется кнопка «Схватить»
  const GUARD_STUN = 1.3, BAT_RANGE = 2.4;
  setSky('#4fc3ff', '#dff6ff');
  const world = buildWorld(HERO_COLOR);
  const hero = createActor(HERO_COLOR, SPAWN[0], SPAWN[1], true, '');
  const above = new THREE.Vector3(); // рабочий вектор для точек над объектами
  let bots = null, chestWait = 0, lastFullWarning = -9;
  let action = null, sellAsk = { slot: -1, from: 0, until: 0 };

  const near = (point, radius) => Math.hypot(hero.body.pos.x - point.x, hero.body.pos.z - point.z) < radius;
  const over = (point, height) => above.set(point.x, height, point.z);
  const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  const nests = EGGS.map((egg, index) => {
    const [x, z] = toWorld(egg.zone, egg.nest[0], egg.nest[1]);
    const [px, pz] = toWorld(egg.zone, egg.nest[0], egg.nest[1] - POST_OFFSET);
    const model = makeGuard(ZONES[egg.zone].guard, egg.guard);
    scene.add(model.group);
    const tag = label('need', 'Нужно ⚡ ' + egg.need, 26);
    tag.pos.set(x, 2.3, z);
    const post = new THREE.Vector3(px, 0, pz);
    return {
      egg, index, zone: egg.zone, order: EGGS.slice(0, index).filter(other => other.zone === egg.zone).length, x, z, tag, eggs: [],
      // trapProof: сколько секунд сторож ещё не попадётся в ловушку. scoff: пауза между его репликами над ловушкой.
      guard: { model, post, pos: post.clone(), facing: Math.atan2(x - px, z - pz), speed: guardSpeed(egg), alert: 0, stun: 0, trapProof: 0, scoff: 0, moving: false, alarm: label('alarm', '!', 60) },
    };
  });
  // Яйца кладок. where: где сейчас яйцо — nest | held | loose | gone.
  const items = nests.flatMap(nest => CLUTCH.map(([dx, dz], order) => {
    const view = makeEgg(nest.egg.look);
    view.group.scale.setScalar(0.8);
    scene.add(view.group);
    const item = { nest, order, x: nest.x + dx, z: nest.z + dz, view, where: 'nest', holder: null, loose: new THREE.Vector3(), looseTimer: 0, respawn: 0 };
    nest.eggs.push(item);
    return item;
  }));
  const free = item => item.where === 'nest' || item.where === 'loose'; // яйцо можно взять
  const gates = ZONES.map((zone, i) => {
    const [x, z] = toWorld(i, 0, -26.5), tag = label('zone', zone.arrow + ' ' + zone.name, 34);
    tag.pos.set(x, 5.6, z);
    return { x, z, tag };
  });

  // ---------- яйцо в руках ----------
  function take(actor, item, fromNest) {
    item.where = 'held';
    item.holder = actor;
    actor.carried = item;
    actor.held = makeEgg(item.nest.egg.look);
    actor.held.group.position.set(0, 1.62, 0.05);
    actor.held.group.scale.setScalar(0.75);
    actor.view.inner.add(actor.held.group);
    item.nest.guard.alert = fromNest ? ALERT_TIME : 0.3; // сторож просыпается не сразу
    if (!actor.isHero) return;
    buzz('medium');
    play('grab');
    pulse(actor.held.group, 0.5);
    bots.heroGrabbed();
  }
  function release(actor) {
    const item = actor.carried;
    actor.view.inner.remove(actor.held.group);
    actor.carried = actor.held = item.holder = null;
    return item;
  }
  // Яйцо возвращается в своё гнездо, у кого бы оно ни было.
  function returnEgg(item) {
    if (item.holder) release(item.holder);
    item.where = 'nest';
  }
  function dropEgg(actor) {
    const item = release(actor);
    item.where = 'nest';
    if (floorAt(actor.body.pos.x, actor.body.pos.z) === -Infinity) return; // над водой яйцо не остаётся: боты тонули бы, пытаясь его подобрать
    item.where = 'loose';
    item.loose.set(actor.body.pos.x, 0.15, actor.body.pos.z);
    item.looseTimer = LOOSE_SECONDS;
  }
  // Яйцо донесли до базы: в гнезде скоро появится новое.
  function consumeEgg(actor) {
    const item = release(actor);
    item.where = 'gone';
    item.respawn = NEST_RESPAWN;
    if (item.star && !actor.isHero) toast(actor.name + ' унёс звёздное яйцо!');
    return item;
  }
  // Оглушить. Если в руках было яйцо, оно падает на землю.
  function knock(actor, seconds) {
    actor.stun = seconds;
    actor.grabBlock = seconds + 1;
    actor.body.vel.y = 6;
    if (actor.carried) dropEgg(actor);
    burst(actor.body.pos.x, actor.body.pos.y + 0.8, actor.body.pos.z, [0xffe066, 0xffffff], 12, 4);
    if (!actor.isHero) return;
    buzz('heavy');
    shake(0.6);
    play('hit');
  }

  const NEWBIE_SLOTS = 2; // пока на базе меньше стольких яиц и питомцев, боты на героя не нападают
  bots = createBots({
    hero, nests, items, zones: world.zones, take, consumeEgg, returnEgg, knock, toast,
    heroSpeed: () => pointsToSpeed(basePoints()), // без ускорителя: купленная за звёзды скорость не должна разгонять и соперников
    star: () => (star && star.where === 'nest' ? star : null),
    shielded: () => save.slots.filter(Boolean).length < NEWBIE_SLOTS,
  });

  // ---------- база ----------
  // block: препятствие на месте питомца или яйца; пока площадка пуста, оно спрятано под землёй.
  const slotViews = world.slots.map(position => {
    const tag = label('slot', '', 13);
    tag.pos.set(position.x, 2, position.z);
    const block = { x: position.x, y: -99, z: position.z, hx: 0.4, hy: 0.5, hz: 0.4 };
    solids.push(block);
    return { kind: '', object: null, tag, block };
  });
  const chestTag = label('chest', '', 22);
  chestTag.pos.set(world.chest.x, 2.3, world.chest.z);

  // Приводит модель на площадке в соответствие с сохранением.
  function syncSlot(i) {
    const slot = save.slots[i], view = slotViews[i];
    const kind = !slot ? '' : slot.pet ? 'pet:' + slot.pet + slot.m : 'egg:' + slot.egg;
    if (view.kind === kind) return;
    if (view.object) {
      scene.remove(view.object.group);
      view.object.rainbow?.dispose();
      view.object.model?.dispose();
    }
    view.kind = kind;
    view.block.y = slot ? view.block.hy : -99;
    view.object =!slot ? null : slot.pet ? makePet(speciesById(slot.pet).look, slot.m) : makeEgg(EGGS[slot.egg].look);
    if (!view.object) return;
    view.object.group.position.set(world.slots[i].x, 0.13, world.slots[i].z);
    view.object.group.rotation.y = Math.atan2(-world.slots[i].x, -world.slots[i].z); // лицом к центру базы
    scene.add(view.object.group);
  }
  // Отмечает питомца в коллекции. Возвращает, сколько очков скорости прибавила находка.
  function found(slot) {
    const before = albumPoints(save.album);
    save.album = albumAdd(save.album, slot.pet, slot.m);
    return albumPoints(save.album) - before;
  }
  function hatch(i, quiet) {
    settle();
    const egg = save.slots[i], species = rollPet(egg.egg, Math.random());
    const lucky = save.luckOn && save.luck > 0; // амулет тратится, только пока игрок его включил
    const mutation = rollMutation(Math.random(), mutationLuck()) || (egg.star ? 'shiny' : ''); // из звёздного яйца питомец хотя бы сияющий
    const slot = save.slots[i] = { pet: species.id, m: mutation };
    if (lucky && --save.luck === 0) save.luckOn = false;
    const gained = found(slot);
    syncSlot(i);
    bump('hatch');
    if (quiet) return;
    burst(world.slots[i].x, 1, world.slots[i].z, [0xffe066, 0xff7ac8, 0x7fd0ff, 0xffffff], 22, 6);
    pulse(slotViews[i].object.group, 0.7);
    play('hatch');
    toast((gained ? 'Новый в коллекции, ⚡ +' + gained + '! ' : '') + petTitle(slot) + ' · ' + RARITY[species.rarity].name + ' · +' + short(petIncome(slot)) + '/с');
    buzz('heavy');
  }
  const incubating = () => save.slots.filter(slot => slot && slot.egg !== undefined);
  const span = seconds => (seconds < 1 ? 'меньше секунды' : clock(seconds));
  function deliver(time) {
    const spot = save.slots.findIndex((slot, i) => usable(i) && !slot);
    if (spot === -1) {
      if (time - lastFullWarning > 6) { // напоминаем, пока герой стоит на базе с яйцом, но не чаще раза в 6 секунд
        toast(incubating().length ? 'Площадки заняты. Пусти яйцо на обогрев кнопкой внизу или продай питомца' : 'Нет свободных площадок. Продай питомца или купи площадку в лавке');
        lastFullWarning = time;
      }
      return;
    }
    const item = consumeEgg(hero), nest = item.nest, seconds = nest.egg.hatch / (save.perks.x2hatch ? 2 : 1);
    save.slots[spot] = { egg: nest.index, readyAt: Date.now() + seconds * 1000, star: !!item.star };
    syncSlot(spot);
    burst(world.slots[spot].x, 0.8, world.slots[spot].z, [0xffffff, 0xffe066], 10, 4);
    pulse(slotViews[spot].object.group, 0.6);
    play('deliver');
    toast((item.star ? '⭐ Звёздное яйцо' : nest.egg.name) + ' на базе! Вылупится через ' + clock(seconds));
    buzz('medium');
    bump('steal');
    weekEggs().n++;
    if (item.star) bump('star');
    persist();
    replan();
  }
  // Обогрев: когда площадки заняты, яйцо из рук ускоряет те, что уже зреют. Так есть чем заняться, пока идут долгие таймеры.
  function warmAction() {
    if (!hero.carried || !near(world.chest, BASE_RADIUS - 2) || !incubating().length || save.slots.some((slot, i) => usable(i) && !slot)) return null;
    const seconds = warmSeconds(hero.carried.nest.egg, save.perks.x2hatch);
    return { text: 'Согреть яйца: каждое вылупится раньше на ' + span(seconds), run: () => warm(seconds) };
  }
  function warm(seconds) {
    if (!hero.carried) return;
    consumeEgg(hero);
    for (const slot of incubating()) slot.readyAt -= seconds * 1000;
    burst(hero.body.pos.x, 1.2, hero.body.pos.z, [0xff9a3c, 0xffe066, 0xffffff], 18, 5);
    toast('Яйца согреты: вылупятся раньше на ' + span(seconds));
    play('deliver');
    buzz('medium');
    bump('warm');
    weekEggs().n++; // яйцо украдено и донесено, хоть и ушло на обогрев
    persist();
    replan();
  }
  // Сообщает серверу, когда боту писать игроку: вылупится ближайшее яйцо, наполнится сундук.
  function replan() {
    const eggs = save.slots.filter(slot => slot && slot.egg !== undefined).map(slot => slot.readyAt);
    const rate = incomeRate(), room = rate * BANK_HOURS * 3600 - bankNow();
    plan(eggs.length ? Math.ceil(Math.min(...eggs) / 1000) : 0, rate > 0 && room > 0 ? Math.ceil(Date.now() / 1000 + room / rate) : 0, weekEggs());
  }

  // ---------- покупки за звёзды ----------
  // Выдача: так записаны и покупки за звёзды, и награды за задания и календарь.
  function applyGrant(grant) {
    if (grant.hours) save.coins += hoursToCoins(grant.hours, incomeRate());
    if (grant.traps) save.traps = Math.min(TRAPS_LIMIT, save.traps + grant.traps);
    if (grant.boost) save.boostBank += grant.boost; // в запас: когда включить ускоритель и амулет, решает игрок
    if (grant.luck) save.luck += grant.luck;
    if (grant.pads) for (let left = grant.pads; left > 0 && save.slotCount < MAX_SLOTS; left--) world.showPad(save.slotCount++);
    if (grant.speed) save.speedLevel = Math.min(MAX_SPEED_LEVEL, save.speedLevel + grant.speed);
    if (grant.rush) for (const slot of incubating()) slot.readyAt -= grant.rush * 3600000;
    if (grant.piggy) {
      save.coins += Math.floor(save.piggy);
      save.piggy = 0;
    }
  }
  const stocked = () => save.boostBank + (save.luckOn ? 0 : save.luck); // сколько всего лежит в запасе и ждёт включения
  const STOCK_HINT = ' Ускоритель и амулет ждут в лавке, в разделе «Запас»';
  // Та же выдача словами, для кнопок наград.
  function grantText(grant) {
    const parts = [];
    if (grant.hours) parts.push('монеты за ' + (grant.hours < 1 ? grant.hours * 60 + ' мин' : grant.hours + ' ч') + ' дохода');
    if (grant.traps) parts.push('ловушки ×' + grant.traps);
    if (grant.boost) parts.push('ускоритель на ' + grant.boost + ' мин');
    if (grant.luck) parts.push('амулет удачи ×' + grant.luck);
    return parts.join(', ');
  }
  // grants: разовые выдачи. perks: полный список улучшений игрока, сервер присылает его при каждом входе.
  // Возвращает true, если игрок что-то получил.
  function applyPurchases(grants, perks) {
    let gained = grants.length > 0, changed = gained;
    grants.forEach(applyGrant);
    const gift = grants.find(grant => grant.friend); // награда за приглашённого друга приходит тем же путём, что и покупки
    if (gift) toast('Награда за друга: ' + grantText(gift) + '.' + STOCK_HINT);
    // Улучшения берутся только из ответа сервера: вписать их себе в сохранение нельзя, а после возврата звёзд они пропадают.
    for (const perk of PERKS) {
      const owned = perks.includes(perk);
      if (!!save.perks[perk] === owned) continue;
      settle(); // доход меняется: сначала фиксируем накопленное по старой ставке
      save.perks[perk] = owned;
      changed = true;
      gained = gained || owned;
      if (owned && perk === 'x2hatch') { // яйцам, которые уже зреют, остаток времени тоже сокращаем вдвое
        for (const slot of save.slots) if (slot && slot.egg !== undefined) slot.readyAt = Date.now() + Math.max(0, slot.readyAt - Date.now()) / 2;
      }
    }
    if (!changed) return false;
    for (let i = 0; i < SLOT_TOTAL; i++) if (usable(i)) world.showPad(i);
    replan();
    if (!gained) return false;
    burst(hero.body.pos.x, 1.2, hero.body.pos.z, [0xffd23c, 0xffffff, 0xff7ac8], 24, 6);
    buzz('heavy');
    return true;
  }
  const payGame = { save, refresh: pullCloud, apply: applyPurchases, persist: () => persist(true), tutored: () => save.tut === TUT_DONE };
  async function buyForStars(product) {
    const before = stocked(), result = await buy(product.id, payGame);
    if (result === 'done') toast('Куплено: ' + product.title + (stocked() > before ? '.' + STOCK_HINT : ''));
    if (result === 'late') toast('Оплата прошла. Покупка придёт через минуту, загляни в лавку');
    if (result === 'error') toast('Не получилось открыть оплату. Попробуй ещё раз');
    renderShop();
  }
  // Окошко с набором делюкс. Показывается один раз, когда у игрока впервые кончились свободные площадки:
  // в наборе как раз площадки, так что предложение приходит по делу. Герой при этом стоит на базе
  // с пустыми руками: посреди погони окошко бы только мешало.
  const OFFER_ID = 'deluxe';
  function stepOffer() {
    if (save.offer || tutorStep() || hero.carried || sheetOpen()) return;
    if (save.slots.some((slot, i) => usable(i) && !slot) || !near(world.chest, BASE_RADIUS)) return;
    const product = (getCatalog() || []).find(item => item.id === OFFER_ID); // каталога нет вне Telegram и пока сервер не ответил
    if (!product || product.owned) return;
    save.offer = true;
    persist();
    write('offer-title', product.title);
    write('offer-text', product.description);
    write('offer-buy', 'Купить за ' + product.stars + ' ⭐');
    $('offer-buy').onclick = () => {
      $('offer').hidden = true;
      buyForStars(product);
    };
    $('offer').hidden = false;
  }
  $('offer-close').addEventListener('click', () => { $('offer').hidden = true; });

  // ---------- панели ----------
  // Открыта всегда одна панель: лавка, список мест, коллекция или задания.
  function openSheet(id, render) {
    for (const sheet of document.querySelectorAll('.sheet')) sheet.hidden = sheet.id !== id;
    render();
  }
  const sheetOpen = () => !!document.querySelector('.sheet:not([hidden])');
  for (const id of ['shop', 'map', 'album', 'tasks']) $('close-' + id).addEventListener('click', () => { $(id).hidden = true; });

  // ---------- задания и календарь ----------
  let quests = [], dayCheck = 0;
  // Наступил новый день: задания меняются, счётчики обнуляются.
  function refreshDay() {
    const date = today();
    if (save.q.d === date && quests.length) return;
    if (save.q.d !== date) save.q = { d: date, p: dayCounters(), c: dayCounters() };
    quests = questsFor(date);
  }
  // Засчитывает действие в задание дня, если такое сегодня есть.
  function bump(id) {
    refreshDay();
    const i = quests.findIndex(quest => quest.id === id);
    if (i === -1 || save.q.p[i] >= quests[i].goal) return;
    if (++save.q.p[i] === quests[i].goal) pop('Задание выполнено!', over(hero.body.pos, 2.6));
  }
  // Есть что забрать: награда за вход или выполненное задание. Тогда на кнопке заданий горит точка.
  const tasksDue = () => save.cal.d !== save.q.d || quests.some((quest, i) => save.q.p[i] >= quest.goal && !save.q.c[i]);
  function give(grant) {
    applyGrant(grant);
    burst(hero.body.pos.x, 1.2, hero.body.pos.z, [0xffd23c, 0xffffff, 0x8dff9a], 20, 6);
    toast('Получено: ' + grantText(grant) + (grant.boost || grant.luck ? '.' + STOCK_HINT : ''));
    play('buy');
    buzz('heavy');
    persist();
    replan();
  }
  // ---------- час удачи ----------
  // Объявляется один раз: когда начался при игроке или когда игрок вошёл посреди него.
  let luckAnnounced = false;
  function stepLuckHour() {
    const left = luckLeft();
    if (left && !luckAnnounced && !tutorStep()) {
      toast('🍀 Час удачи! Ещё ' + clock(left) + ' сияющие и радужные питомцы вылупляются вдвое чаще');
      play('star');
      cardNest = null; // карточка гнезда пересоберётся с новыми шансами
    }
    luckAnnounced = left > 0;
  }
  const luckLine = () => {
    const left = luckLeft(), at = new Date(nextLuckHour(Date.now())).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    return left ? '🍀 Час удачи идёт: ещё ' + clock(left) + ' мутации выпадают вдвое чаще' : '🍀 Час удачи каждый день в ' + at + ': мутации выпадают вдвое чаще. Бот напомнит';
  };
  function renderTasks() {
    refreshDay();
    write('luck-hour', luckLine());
    // Таблица друзей: яйца, принесённые на базу за неделю. Свой счёт берём из сохранения, он свежее серверного.
    const invite = getInvite(), friends = getBoard();
    const places = friends.length ? [...friends, { name: 'Ты', eggs: weekEggs().n, me: true }].sort((a, b) => b.eggs - a.eggs) : [];
    $('board').replaceChildren(...places.map((row, i) => {
      const place = el('div', row.me ? 'place me' : 'place', '');
      place.append(el('span', '', i + 1 + '. ' + row.name), el('b', '', '🥚 ' + row.eggs));
      return place;
    }));
    $('board-note').hidden = !places.length;
    $('invite-title').hidden = !invite && !places.length;
    $('invite').hidden = $('invite-note').hidden = !invite;
    if (invite) write('invite-note', 'Когда друг пройдёт обучение, вы оба получите: ' + grantText(invite.grant) + '. Пришло друзей: ' + invite.friends + ' из ' + invite.limit);
    const ready = save.cal.d !== save.q.d, next = save.cal.n % CALENDAR.length;
    $('calendar').replaceChildren(...CALENDAR.map((_, i) => el('div', 'day' + (i < next ? ' got' : i === next ? ' next' : ''), i < next ? '✓' : String(i + 1))));
    $('calendar-claim').textContent = (ready ? 'Забрать: ' : 'Завтра: ') + grantText(CALENDAR[next]);
    $('calendar-claim').disabled = !ready;
    $('quest-list').replaceChildren(...quests.map((quest, i) => {
      const done = save.q.p[i] >= quest.goal, taken = !!save.q.c[i];
      const button = rowButton('row', taken ? '✅' : '🎯', quest.text + ' · ' + save.q.p[i] + ' из ' + quest.goal, 'Награда: ' + grantText(quest.reward), taken ? 'Получено' : done ? 'Забрать' : 'В деле');
      button.disabled = !done || taken;
      button.onclick = () => {
        save.q.c[i] = 1;
        give(quest.reward);
        renderTasks();
      };
      return button;
    }));
  }
  $('calendar-claim').addEventListener('click', () => {
    refreshDay();
    if (save.cal.d === save.q.d) return; // сегодняшняя награда уже забрана
    const grant = CALENDAR[save.cal.n % CALENDAR.length];
    save.cal = { n: save.cal.n + 1, d: save.q.d };
    give(grant);
    renderTasks();
  });
  $('open-tasks').addEventListener('click', () => {
    openSheet('tasks', renderTasks);
    if (cloudSettled) sync(payGame).then(renderTasks, () => {}); // свежая таблица друзей и счёт приглашённых
  });
  $('invite').addEventListener('click', () => {
    const invite = getInvite();
    if (!invite) return;
    const text = 'Играю в «Хвать!»: краду яйца у сторожей и вывожу питомцев. Заходи, нам обоим дадут подарок';
    tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(invite.link) + '&text=' + encodeURIComponent(text));
  });

  // ---------- коллекция ----------
  const mugs = {}; // снимки питомцев по видам, делаются один раз
  // Ставит в картинку снимок питомца. Модель может ещё грузиться: тогда картинка появится, когда она придёт,
  // а если не придёт вовсе, на снимке будет запасной вид, собранный кодом.
  function portrait(species, image) {
    if (mugs[species.id]) return void (image.src = mugs[species.id]);
    const pet = makePet(species.look, ''), shoot = () => {
      animatePet(pet, 0.3);
      image.src = mugs[species.id] = snapshot(pet.group);
    };
    loadModel(species.look.model).then(shoot, shoot);
  }
  function renderAlbum() {
    write('album-total', albumCount(save.album) + ' из ' + SPECIES.length * VARIANTS.length + ' · ⚡ +' + albumPoints(save.album));
    const rows = [];
    RARITY.forEach((rarity, tier) => {
      rows.push(el('h2', '', 'Редкость «' + rarity.name + '» · ' + (setDone(save.album, tier) ? 'набор собран, ⚡ +' : 'за полный набор ⚡ +') + SET_POINTS));
      SPECIES.forEach((species, i) => {
        if (species.rarity !== tier) return;
        const known = VARIANTS.some(variant => albumHas(save.album, i, variant.id));
        const row = el('div', 'species', ''), name = el('div', '', known ? species.name : '???'), mug = document.createElement('img');
        mug.className = known ? 'mug' : 'mug unknown'; // незнакомый питомец показан тёмным силуэтом
        mug.alt = '';
        portrait(species, mug);
        name.style.color = rarity.color;
        // Вид номер i чаще всего выходит из яйца с тем же номером; последним видам достаётся последнее яйцо.
        name.append(el('small', '', (known ? '+' + short(species.income) + '/с · ' : '') + 'чаще из: ' + EGGS[Math.min(i, EGGS.length - 1)].name.toLowerCase()));
        row.append(mug, name, ...VARIANTS.map(variant => el('span', 'chip' + (albumHas(save.album, i, variant.id) ? ' found' : ''), (variant.mark || '●') + ' ⚡+' + variant.points)));
        rows.push(row);
      });
    });
    $('album-list').replaceChildren(...rows);
  }
  $('open-album').addEventListener('click', () => openSheet('album', renderAlbum));

  // ---------- карточка у гнезда ----------
  // Кто вылупится, с какими шансами и кого из них ещё нет в коллекции. Шансы мутаций показаны с учётом амулета и часа удачи.
  let cardNest = null;
  function stepCard() {
    const nest = (!hero.carried && nests.find(candidate => near(candidate, 8))) || null;
    if (nest === cardNest) return; // содержимое собираем один раз, когда герой подошёл к гнезду
    cardNest = nest;
    $('nest-card').hidden = !nest;
    if (nest) fillCard(nest);
  }
  function fillCard(nest) {
    const luck = mutationLuck(), percent = chance => (chance * 100 * luck).toLocaleString('ru') + '%';
    $('nest-card').replaceChildren(
      el('b', '', nest.egg.name + ' · зреет ' + clock(nest.egg.hatch / (save.perks.x2hatch ? 2 : 1))),
      ...hatchTable(nest.index).flatMap(({ species, chance }) => [
        el('span', '', Math.round(chance) + '% ' + species.name + ' +' + short(species.income) + '/с'),
        ...(albumHas(save.album, SPECIES.indexOf(species), '') ? [] : [el('em', '', ' · новый')]),
        document.createElement('br'),
      ]),
      el('span', '', [...MUTATIONS].reverse().map(mutation => mutation.mark + ' ' + percent(mutation.chance)).join(' · ') + (luckLeft() ? ' · 🍀 час удачи' : '')),
    );
  }

  // ---------- звёздное яйцо ----------
  // Событие по таймеру: в одном из гнёзд, до которых герой дотянется сам или с ловушкой, появляется особое яйцо.
  // За ним бегут и боты. Устроено как обычное яйцо кладки, только не возрождается.
  const starTag = label('star', '', 70);
  starTag.visible = false;
  let star = null, starWait = Number(debug.get('star')) || STAR_FIRST;
  function spawnStar() {
    const reach = nests.filter(nest => trapHolds(heroPoints(), nest.egg));
    const nest = reach[Math.floor(Math.random() * reach.length)];
    const view = makeEgg({ ...nest.egg.look, glow: 0x6a5200 });
    scene.add(view.group);
    star = { nest, order: CLUTCH.length, x: nest.x, z: nest.z, view, where: 'nest', holder: null, loose: new THREE.Vector3(), looseTimer: 0, respawn: 0, star: true, life: STAR_LIFE };
    nest.eggs.push(star);
    items.push(star);
    starTag.pos.set(nest.x, 4.6, nest.z);
    toast('⭐ Звёздное яйцо: ' + ZONES[nest.zone].side.toLowerCase() + '! Питомец из него будет сияющим');
    buzz('heavy');
    play('star');
    bots.starAppeared();
  }
  function removeStar(text) {
    scene.remove(star.view.group);
    star.nest.eggs.splice(star.nest.eggs.indexOf(star), 1);
    items.splice(items.indexOf(star), 1);
    star = null;
    starWait = STAR_PERIOD;
    starTag.visible = false;
    if (text) toast(text);
  }
  function stepStar(dt) {
    if (!star) {
      if (!tutorStep() && (starWait -= dt) <= 0) spawnStar(); // новичка во время обучения событием не отвлекаем
      return;
    }
    if (star.where === 'gone') return removeStar('');
    if (star.where === 'nest' && (star.life -= dt) <= 0) return removeStar('Звёздное яйцо исчезло');
    star.view.group.rotation.y += dt * 2;
    starTag.visible = star.where === 'nest';
    setText(starTag, '⭐ ' + clock(star.life));
  }

  function collect() {
    settle();
    const amount = Math.floor(save.bank);
    if (amount < 1) return;
    save.bank -= amount;
    save.coins += amount;
    save.piggy += amount * PIGGY_SHARE;
    pop('+' + short(amount) + ' 💰', over(world.chest, 2.2));
    flyCoins(over(world.chest, 1.4), Math.min(8, 2 + Math.floor(Math.log10(amount + 1))));
    pulse(world.chestModel, 0.2);
    play('coin');
    burst(world.chest.x, 1.4, world.chest.z, [0xffd23c, 0xffe89a], 16, 5);
    buzz('light');
    persist();
    replan();
  }
  function sell(i) {
    const now = performance.now();
    if (sellAsk.slot !== i || now > sellAsk.until) { // первый тап только спрашивает
      sellAsk = { slot: i, from: now + 500, until: now + 3000 };
      return;
    }
    if (now < sellAsk.from) return; // случайный двойной тап не должен продать питомца
    settle();
    const price = petIncome(save.slots[i]) * SELL_SECONDS;
    save.slots[i] = null;
    save.coins += price;
    sellAsk.slot = -1;
    syncSlot(i);
    bump('sell');
    pop('+' + short(price) + ' 💰', over(world.slots[i], 1.6));
    buzz('medium');
    persist();
  }
  // Кнопка «Схватить» появляется рядом с яйцом: в гнезде или на земле. Само яйцо в руки не прыгает.
  function grabAction() {
    if (hero.carried || hero.stun > 0 || hero.grabBlock > 0) return null;
    let best = null, bestGap = GRAB_REACH;
    for (const item of items) {
      if (!free(item)) continue;
      const gap = apart(hero.body.pos, item.where === 'loose' ? item.loose : item);
      if (gap < bestGap) [best, bestGap] = [item, gap];
    }
    if (!best) return null;
    const need = best.nest.egg.need, name = best.star ? 'звёздное яйцо' : best.nest.egg.name;
    return {
      text: heroPoints() < need ? 'Рискнуть: ' + name + ' · нужно ⚡ ' + need : 'Схватить: ' + name,
      run: () => { if (free(best)) take(hero, best, best.where === 'nest'); }, // за кадр до тапа яйцо мог унести бот
    };
  }
  // Кнопка «Слить» появляется рядом с питомцем, у которого на базе есть ещё два таких же. Она важнее «Продать»:
  // слияние дохода не отнимает, а продать получившегося питомца можно и после.
  const nearPet = () => save.slots.findIndex((slot, index) => slot && slot.pet && near(world.slots[index], 2));
  function mergeAction() {
    const i = nearPet(), pet = save.slots[i];
    if (i === -1 || !mergeMates(save.slots, i)) return null;
    return { text: 'Слить трёх: ' + petTitle(pet) + ' → ' + petTitle({ pet: pet.pet, m: nextVariant(pet.m) }), run: () => merge(i) };
  }
  function merge(i) {
    const mates = mergeMates(save.slots, i);
    if (!mates) return;
    settle();
    for (const j of mates) {
      save.slots[j] = null;
      syncSlot(j);
      burst(world.slots[j].x, 1, world.slots[j].z, [0xffffff, 0xffe066], 10, 4);
    }
    const slot = save.slots[i] = { pet: save.slots[i].pet, m: nextVariant(save.slots[i].m) }, gained = found(slot);
    syncSlot(i);
    burst(world.slots[i].x, 1, world.slots[i].z, [0xffe066, 0xff7ac8, 0x7fd0ff, 0xffffff], 22, 6);
    pulse(slotViews[i].object.group, 0.7);
    play('hatch');
    toast((gained ? 'Новый в коллекции, ⚡ +' + gained + '! ' : '') + petTitle(slot) + ' · +' + short(petIncome(slot) * incomeFactor()) + '/с');
    buzz('heavy');
    persist();
    replan();
  }
  // Кнопка «Продать» появляется, когда герой стоит рядом с питомцем.
  function sellAction() {
    const i = nearPet();
    if (i === -1) return null;
    const asking = sellAsk.slot === i && performance.now() < sellAsk.until;
    const price = short(petIncome(save.slots[i]) * SELL_SECONDS) + ' 💰';
    return { text: asking ? 'Точно продать за ' + price + '?' : 'Продать: ' + petTitle(save.slots[i]) + ' · ' + price, run: () => sell(i) };
  }
  const runAction = () => action && action.run();
  $('action').addEventListener('click', runAction);

  // ---------- ловушки и бита ----------
  const traps = [];
  function addTrap(x, z) {
    const view = makeTrap();
    view.position.set(x, 0.02, z);
    scene.add(view);
    traps.push({ x, z, view });
  }
  function placeTrap() {
    if (hero.stun > 0) return;
    if (save.traps < 1) return toast('Ловушек нет. Они продаются в лавке');
    if (traps.length >= MAX_TRAPS_PLACED) return toast('Больше ' + MAX_TRAPS_PLACED + ' ловушек разом не поставить');
    const { x, z } = hero.body.pos;
    save.traps--;
    save.placed.push([x, z]);
    addTrap(x, z);
    buzz('medium');
    persist();
  }
  function stepTraps() {
    for (let i = traps.length - 1; i >= 0; i--) {
      const trap = traps[i];
      let sprung = false;
      for (const bot of bots.actors) {
        if (bot.stun > 0 || apart(bot.body.pos, trap) > 1.2) continue;
        knock(bot, TRAP_STUN_BOT);
        sprung = true;
      }
      for (const { guard, egg } of nests) {
        if (!guard.moving || apart(guard.pos, trap) > 1.5) continue;
        const weak = !trapHolds(heroPoints(), egg);
        if (weak || guard.trapProof > 0) { // сторож перепрыгивает ловушку и говорит почему
          if (guard.scoff <= 0) pop(weak ? 'Слишком силён: нужно ⚡ ' + (egg.need - TRAP_REACH) : 'Второй раз не попадусь!', over(guard.pos, 3));
          guard.scoff = 2;
          continue;
        }
        guard.stun = TRAP_STUN_GUARD;
        guard.trapProof = TRAP_STUN_GUARD + TRAP_IMMUNITY;
        sprung = true;
      }
      if (!sprung) continue;
      bump('trap');
      play('trap');
      burst(trap.x, 0.5, trap.z, [0xff3b30, 0xffffff], 14, 5);
      scene.remove(trap.view);
      traps.splice(i, 1);
      save.placed.splice(i, 1);
      persist();
    }
  }
  function swingBat() {
    if (hero.stun > 0 || hero.swing > 0 || hero.swingCooldown > 0) return;
    if (hero.carried) return toast('С яйцом в руках биту не достать');
    startSwing(hero);
  }
  function batHit() {
    for (const bot of bots.actors) {
      if (bot.stun > 0 || apart(bot.body.pos, hero.body.pos) > BAT_RANGE) continue;
      knock(bot, BATS[save.bat].stun);
      bump('bat');
      pop('БАМ!', over(bot.body.pos, 2.2));
      shake(0.35);
      play('hit');
      buzz('heavy');
    }
  }
  $('bat').addEventListener('pointerdown', swingBat);
  $('trap').addEventListener('pointerdown', placeTrap);
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'KeyE') swingBat();
    if (e.code === 'KeyQ') placeTrap();
    if (e.code === 'KeyF') runAction();
  });

  // ---------- перерождение ----------
  // ponytail: после сброса страница перезагружается, и сцена строится по новому сохранению. Разбирать её на месте
  // (убирать площадки, питомцев, ловушки) было бы вдесятеро больше кода ради события, которое случается раз в несколько дней.
  const REBORN_KEY = 'hvat-reborn'; // пометка для игры после перезагрузки: поздравить с перерождением
  let rebirthAsk = 0;               // до какого момента второй тап по строке лавки подтверждает перерождение
  function rebirth() {
    if (!canRebirth(save.slots)) return;
    save.reb++;
    Object.assign(save, { coins: 0, speedLevel: 0, slotCount: startSlots(save.reb), slots: Array(SLOT_TOTAL).fill(null), bank: 0, bankAt: Date.now(), bat: 0 });
    storeLocal();
    try { sessionStorage.setItem(REBORN_KEY, '1'); } catch {}
    location.reload();
  }
  try {
    if (sessionStorage.getItem(REBORN_KEY)) {
      sessionStorage.removeItem(REBORN_KEY);
      setTimeout(() => toast('Перерождение ' + save.reb + '! Доход питомцев теперь ×' + rebirthFactor(save.reb) + ' навсегда'), 600);
    }
  } catch {}

  // ---------- лавка ----------
  function shopRows() {
    const level = save.speedLevel, nextBat = BATS[save.bat + 1];
    const reborn = save.reb + 1, extraPad = startSlots(reborn) > startSlots(save.reb), asking = performance.now() < rebirthAsk;
    return [
      { icon: '⚡', title: 'Скорость ' + basePoints() + ' → ' + (basePoints() + 1), text: 'Быстрее бежишь, дальше гнёзда', cost: speedCost(level),
        open: level < MAX_SPEED_LEVEL, buy() { save.speedLevel++; } },
      { icon: '🐣', title: 'Площадка для питомца', text: 'Сейчас ' + save.slotCount + ' из ' + MAX_SLOTS, cost: slotCost(save.slotCount),
        open: save.slotCount < MAX_SLOTS, buy() { world.showPad(save.slotCount++); } },
      { icon: '🕸', title: 'Ловушка', text: 'У тебя ' + save.traps + '. Держит соперника ' + TRAP_STUN_BOT + ' с, а сторожа ' + TRAP_STUN_GUARD + ' с, если до его яйца не хватает не больше ' + TRAP_REACH + ' ⚡', cost: trapCost(level),
        open: save.traps < MAX_TRAPS_OWNED, buy() { save.traps++; } },
      { icon: '🏏', title: nextBat ? 'Бита ур. ' + (save.bat + 2) : 'Бита: максимум', text: 'Оглушает на ' + (nextBat || BATS[save.bat]).stun + ' с', cost: nextBat ? nextBat.cost : 0,
        open: !!nextBat, buy() { save.bat++; } },
      // Перерождение необратимо, поэтому первый тап только спрашивает.
      { icon: '⭐', title: 'Перерождение ' + reborn, cost: 0, open: canRebirth(save.slots),
        text: 'Всё с начала, кроме коллекции и покупок за звёзды. Навсегда: доход ×' + rebirthFactor(reborn) + (extraPad ? ' и +1 площадка' : '') + (canRebirth(save.slots) ? '' : '. Нужен мифический питомец на базе'),
        badge: !canRebirth(save.slots) ? 'Закрыто' : asking ? 'Точно?' : 'Начать',
        buy() { if (asking) rebirth(); else rebirthAsk = performance.now() + 4000; } },
    ];
  }
  let shopButtons = [], starButtons = [];
  function renderShop() {
    shopButtons = shopRows().map(row => {
      const button = rowButton('row', row.icon, row.title, row.text, row.badge || (row.open ? short(row.cost) + ' 💰' : 'Макс.'));
      button.onclick = () => {
        save.coins -= row.cost;
        row.buy();
        buzz('medium');
        play('buy');
        persist();
        renderShop();
      };
      return { button, row };
    });
    $('shop-list').replaceChildren(...shopButtons.map(item => item.button));
    renderStock();
    renderStars();
    refreshShop();
  }
  // Запас: ускоритель и амулет, полученные наградой или купленные. Когда их включить, решает игрок:
  // иначе ускоритель тикал бы с момента покупки, а амулет сгорал на первых попавшихся яйцах.
  function startBoost() {
    save.boostUntil = Math.max(Date.now(), save.boostUntil) + save.boostBank * 60000;
    save.boostBank = 0;
  }
  function renderStock() {
    const rows = [];
    const add = (icon, title, text, badge, enabled, run) => {
      const button = rowButton('row', icon, title, text, badge);
      button.disabled = !enabled;
      button.onclick = () => {
        run();
        buzz('medium');
        persist();
        renderShop();
      };
      rows.push(button);
    };
    if (save.boostBank > 0 || boosted()) {
      const running = boosted() ? 'Работает ещё ' + clock((save.boostUntil - Date.now()) / 1000) + '. ' : '';
      add('⚡', 'Ускоритель: +' + BOOST_POINTS + ' к скорости', running + (save.boostBank > 0 ? 'В запасе ' + save.boostBank + ' мин' : 'Запас пуст'), save.boostBank > 0 ? 'Включить' : 'Идёт', save.boostBank > 0, startBoost);
    }
    if (save.luck > 0) {
      add('🍀', 'Амулет удачи · осталось яиц: ' + save.luck, save.luckOn ? 'Включён: тратится на каждое вылупившееся яйцо' : 'Выключен. Включи перед тем, как вылупятся нужные яйца',
        save.luckOn ? 'Выключить' : 'Включить', true, () => { save.luckOn = !save.luckOn; });
    }
    $('stock-title').hidden = $('stock-list').hidden = !rows.length;
    $('stock-list').replaceChildren(...rows);
  }
  // Когда товар за звёзды бесполезен и что тогда написано на его кнопке.
  const USELESS = {
    eggs: { badge: 'Нет яиц', when: () => !incubating().length },
    piggy: { badge: 'Пусто', when: () => save.piggy < 1 },
    speed: { badge: 'Максимум', when: () => save.speedLevel >= MAX_SPEED_LEVEL },
  };
  // Раздел за звёзды. Список товаров и цены приходят с сервера.
  function renderStars() {
    const catalog = getCatalog(), list = $('stars-list');
    starButtons = [];
    if (!canPay()) return list.replaceChildren(el('p', 'hint', 'Покупки за звёзды работают внутри Telegram, когда подключён бот.'));
    if (!catalog) return list.replaceChildren(el('p', 'hint', 'Загружаю товары…'));
    // Купленное сворачивается в одну строку внизу: наверху остаётся только то, что ещё можно взять.
    const bought = catalog.filter(product => product.owned).map(product => product.title);
    starButtons = catalog.filter(product => !product.owned).map(product => {
      const text = product.description + (product.needs === 'piggy' ? '. Сейчас в ней ' + short(save.piggy) + ' 💰' : '');
      const button = rowButton('row star', product.icon, product.title, text, '');
      if (product.tag) button.querySelector('b').append(el('small', 'mark', product.tag));
      button.onclick = () => buyForStars(product);
      return { button, product };
    });
    list.replaceChildren(
      ...starButtons.map(item => item.button),
      ...(bought.length ? [el('p', 'hint', '✅ Уже куплено: ' + bought.join(', '))] : []),
      el('p', 'hint', 'Оплата только звёздами Telegram. Условия и помощь с платежами: команды /terms и /paysupport в боте.'),
    );
  }
  // Пока лавка открыта, монеты капают. Кнопки не пересоздаём (иначе тап теряется), только включаем и выключаем.
  function refreshShop() {
    write('shop-coins', '💰 ' + short(save.coins));
    for (const { button, row } of shopButtons) button.disabled = !row.open || save.coins < row.cost;
    // Товар за звёзды нельзя купить впустую. needs с сервера говорит, без чего он бесполезен; blocked: набор, часть которого уже куплена.
    for (const { button, product } of starButtons) {
      const idle = USELESS[product.needs] ? USELESS[product.needs].when() : false;
      const badge = product.blocked ? 'Часть уже есть' : idle ? USELESS[product.needs].badge : product.stars + ' ⭐';
      paint(button.querySelector('i'), badge);
      button.disabled = product.blocked || idle;
    }
  }
  $('open-shop').addEventListener('click', () => {
    openSheet('shop', renderShop);
    if (!cloudSettled) return; // товары появятся сами, когда ответит облачное сохранение
    sync(payGame).then(renderShop, error => {
      const expired = error.message === 'auth'; // данные запуска живут сутки: игра, открытая дольше, должна перезапуститься
      if (expired || !getCatalog()) $('stars-list').replaceChildren(el('p', 'hint', expired ? 'Игра открыта слишком давно. Закрой её и открой заново, чтобы лавка заработала.' : 'Товары за звёзды сейчас недоступны. Попробуй позже.'));
    });
  });

  // ---------- обучение ----------
  // Только для новых игроков. Шаг заканчивается сам, когда выполнено done(), а если done нет — кнопкой «Дальше».
  // glow: что подсветить. home: компас ведёт на базу. shop: рассказ о строке лавки (её номер или 'stars').
  // back: условие, при котором шаг откатывается на предыдущий.
  const touch = matchMedia('(pointer: coarse)').matches;
  const TUTORIAL = [
    { text: touch ? 'Привет! Это твоя база. Веди пальцем по экрану, чтобы бежать' : 'Привет! Это твоя база. Беги стрелками или клавишами WASD',
      done: () => !near({ x: SPAWN[0], z: SPAWN[1] }, 3) },
    { text: 'Компас слева показывает дорогу. Беги на север по мосту, к гнезду с яйцами', glow: 'compass', done: () => near(nests[0], 7) || !!hero.carried },
    { text: touch ? 'Подойди к яйцу и нажми «Схватить»' : 'Подойди к яйцу и нажми «Схватить» или клавишу F', glow: 'action', done: () => !!hero.carried },
    { text: 'Сторож проснулся! Неси яйцо на базу: за ворота зоны он не выйдет', done: () => save.slots.some(Boolean), back: () => !hero.carried },
    { text: 'Яйцо зреет на площадке. Скоро из него вылупится питомец и начнёт приносить монеты', home: true, done: () => save.slots.some(slot => slot && slot.pet) },
    { text: 'Монеты питомцев копятся в сундуке. Подойди к нему: он в центре базы', home: true, done: () => save.coins > 0 },
    { text: 'Монеты тратят в лавке. Открой её кнопкой с тележкой', glow: 'open-shop', home: true, done: () => !$('shop').hidden },
    { shop: 0, text: 'Скорость. Над каждым гнездом написано, какая нужна: с меньшей сторож догонит' },
    { shop: 1, text: 'Площадка: место ещё для одного питомца. Больше питомцев, больше монет' },
    { shop: 2, text: 'Ловушка. Поставь её на пути: соперник или сторож застрянет на несколько секунд' },
    { shop: 3, text: 'Бита выбивает яйцо у соперника. Чем она лучше, тем дольше он оглушён' },
    { shop: 'stars', text: 'За звёзды Telegram продаются площадки, скорость и улучшения навсегда. Играть можно и без них' },
    { text: 'Вот и всё. Кради яйца, копи монеты и собирай редких питомцев!', button: 'Играть' },
  ];
  const tutorStep = () => TUTORIAL[save.tut] || null;
  function setTutor(index) {
    save.tut = index < TUTORIAL.length ? index : TUT_DONE;
    persist();
    if (save.tut === TUT_DONE && cloudSettled) sync(payGame).catch(() => {}); // сервер узнаёт, что обучение пройдено: за это положена награда позвавшему другу и самому игроку
  }
  let glowing = null;
  function setGlow(element) {
    if (glowing === element) return;
    glowing?.classList.remove('glow');
    element?.classList.add('glow');
    glowing = element;
  }
  function stepTutorial() {
    let step = tutorStep();
    if (step && step.done && step.done()) setTutor(save.tut + 1);
    else if (step && step.back && step.back()) setTutor(save.tut - 1);
    step = tutorStep();
    $('tutor').hidden = !step;
    if (!step) return setGlow(null);
    const inShop = step.shop !== undefined, closed = inShop && $('shop').hidden; // рассказ о лавке ждёт, пока её откроют
    write('tutor-text', closed ? 'Открой лавку: покажу, что в ней есть' : step.text);
    write('tutor-next', step.button || 'Дальше');
    $('tutor-next').hidden = closed || !!step.done;
    const target = closed ? $('open-shop') : step.shop === 'stars' ? $('stars-title') : inShop ? shopButtons[step.shop]?.button : step.glow ? $(step.glow) : null;
    if (target && target !== glowing && inShop && !closed) target.scrollIntoView({ block: 'nearest' });
    setGlow(target || null);
  }
  $('tutor-next').addEventListener('click', () => setTutor(save.tut + 1));
  $('tutor-skip').addEventListener('click', () => setTutor(TUT_DONE));

  // ---------- компас ----------
  // Камера не вращается, поэтому север всегда вверху экрана. Стрелка компаса показывает дорогу к цели.
  let guide = null, needleTurn = null; // guide: куда ведёт компас. null — выбирает сам, -1 — на базу, иначе номер зоны
  const BASE = { x: 0, z: 0, zone: -1 }, SKY = ZONES.length - 1;
  const asPoint = ([x, z]) => ({ x, z });
  const zoneOf = point => ZONES.findIndex((_, i) => inZone(i, point.x, point.z)); // -1: база и мосты
  // Цель: { x, z, zone, text }. Сам компас ведёт к самому ценному яйцу, которое герою по скорости.
  function destination() {
    if (hero.carried) return { ...BASE, text: 'Неси яйцо на базу' };
    // Пока идёт событие, компас ведёт к звёздному яйцу, если игрок сам не выбрал место.
    if (guide === null && star && star.where === 'nest') return { x: star.x, z: star.z, zone: star.nest.zone, text: '⭐ Звёздное яйцо · ' + ZONES[star.nest.zone].side.toLowerCase() + ' · ' + clock(star.life) };
    if (guide === -1 || tutorStep()?.home) return { ...BASE, text: 'База' };
    const pool = nests.filter(nest => guide === null || nest.zone === guide);
    const nest = pool.filter(nest => nest.egg.need <= heroPoints()).pop() || pool[0];
    return { x: nest.x, z: nest.z, zone: nest.zone, text: nest.egg.name + ' · ' + ZONES[nest.zone].side.toLowerCase() };
  }
  // Куда показывать прямо сейчас: в чужую зону путь лежит через базу и мост, а на вершины ещё и через болото.
  function nextStep(target) {
    const p = hero.body.pos, here = zoneOf(p);
    if (here === target.zone) return target;
    if (here === 0 && target.zone === SKY) return asPoint(world.zones[SKY].bridge[0]);
    if (here !== -1) return asPoint(world.zones[here].bridge[1]); // сначала к выходу из своей зоны
    const viaSwamp = target.zone === SKY && p.z > world.zones[SKY].bridge[0][1];
    const [start, entry] = world.zones[viaSwamp ? 0 : target.zone].bridge.map(asPoint);
    if (apart(p, start) + apart(p, entry) < apart(start, entry) + 1.5) return entry; // уже на нужном мосту
    return Math.hypot(p.x, p.z) < BASE_RADIUS ? start : BASE;
  }
  function stepCompass(target) {
    const p = hero.body.pos, step = nextStep(target);
    const turn = Math.round(Math.atan2(step.x - p.x, p.z - step.z) * 180 / Math.PI);
    if (turn !== needleTurn) $('needle').setAttribute('transform', 'rotate(' + turn + ' 32 33)');
    needleTurn = turn;
  }
  // Список мест: тап по строке говорит компасу, куда вести.
  function renderMap() {
    const rows = [
      { pick: null, icon: '🧭', title: 'Подсказывать самому', text: 'Стрелка ведёт к лучшему яйцу, которое тебе по скорости' },
      { pick: -1, icon: '🏠', title: 'Центр · База', text: 'Сундук с монетами и твои питомцы' },
      ...ZONES.map((zone, i) => {
        const need = Math.min(...nests.filter(nest => nest.zone === i).map(nest => nest.egg.need));
        return { pick: i, icon: zone.arrow, title: zone.side + ' · ' + zone.name, text: 'Яйца от ⚡ ' + need + (heroPoints() >= need ? '. Тебе по силам' : '. Пока не хватает скорости') };
      }),
    ];
    $('map-list').replaceChildren(...rows.map(row => {
      const button = rowButton('row', row.icon, row.title, row.text, guide === row.pick ? '✓' : 'Вести');
      button.onclick = () => {
        guide = row.pick;
        $('map').hidden = true;
      };
      return button;
    }));
  }
  $('compass').addEventListener('click', () => openSheet('map', renderMap));

  // ---------- сторожа ----------
  // Сторож гонится за тем, кто несёт его яйцо по его зоне, либо сам идёт за яйцом, если оно лежит на земле.
  // Из кладки могут унести сразу несколько яиц: сторож бежит за тем вором, который ближе.
  function stepGuard(nest, dt, time) {
    const g = nest.guard;
    const inside = point => inZone(nest.zone, point.x, point.z);
    const stolen = nest.eggs.filter(item => item.where === 'held' && inside(item.holder.body.pos))
      .sort((a, b) => apart(a.holder.body.pos, g.pos) - apart(b.holder.body.pos, g.pos))[0];
    const lying = nest.eggs.find(item => item.where === 'loose' && inside(item.loose));
    const mode = stolen ? 'chase' : lying ? 'fetch' : 'home';
    const afterHero = mode === 'chase' && stolen.holder.isHero;
    g.alert -= dt;
    g.stun -= dt;
    g.trapProof -= dt;
    g.scoff -= dt;
    const target = mode === 'chase' ? stolen.holder.body.pos : mode === 'fetch' ? lying.loose : g.post;
    const dx = target.x - g.pos.x, dz = target.z - g.pos.z, distance = Math.hypot(dx, dz);
    g.moving = false;
    if (g.alert <= 0 && g.stun <= 0) {
      const step = g.speed * (mode === 'home' ? 0.6 : 1) * dt;
      if (mode === 'chase' && distance < catchRadius(nest.egg)) {
        const victim = stolen.holder;
        returnEgg(stolen);
        knock(victim, GUARD_STUN);
        if (victim.isHero) {
          toast('Сторож отобрал яйцо!');
          play('lose');
        }
      } else if (mode === 'fetch' && distance < 1) {
        returnEgg(lying);
      } else if (distance <= step) {
        g.pos.x = target.x;
        g.pos.z = target.z;
        if (mode === 'home') g.model.group.rotation.y = g.facing;
      } else {
        g.pos.x += dx / distance * step;
        g.pos.z += dz / distance * step;
        g.model.group.rotation.y = Math.atan2(dx, dz);
        g.moving = true;
      }
    }
    g.model.group.position.set(g.pos.x, 0, g.pos.z);
    g.model.animate(time, mode !== 'home' || distance > 0.05 || g.stun > 0, g.moving);
    g.alarm.visible = mode === 'chase';
    g.alarm.pos.set(g.pos.x, 2 * nest.egg.guard.size + 1, g.pos.z);
    return afterHero;
  }
  function stepNest(nest, dt, time) {
    for (const item of nest.eggs) {
      if (item.where === 'gone' && (item.respawn -= dt) <= 0) item.where = 'nest';
      if (item.where === 'loose' && (item.looseTimer -= dt) <= 0) item.where = 'nest';
      const lying = item.where === 'loose';
      item.view.group.visible = free(item);
      const rest = item.star ? 0.8 : 0.3; // звёздное яйцо лежит поверх кладки
      item.view.group.position.set(lying ? item.loose.x : item.x, lying ? 0.15 + Math.abs(Math.sin(time * 4)) * 0.15 : rest, lying ? item.loose.z : item.z);
      item.view.inner.rotation.z = Math.sin(time * 3 + nest.index + item.order * 2) * 0.08;
    }
    nest.tag.el.classList.toggle('ok', heroPoints() >= nest.egg.need);
    return stepGuard(nest, dt, time);
  }

  const focus = new THREE.Vector3(SPAWN[0], 0, SPAWN[1]), lead = new THREE.Vector3();
  let airTime = 0, chased = false, shownCoins = save.coins;

  // ---------- звук ----------
  const showMute = () => $('mute').replaceChildren(symbol(isMuted() ? 'silent' : 'sound'));
  showMute();
  $('mute').addEventListener('click', () => {
    setMuted(!isMuted());
    showMute();
  });
  document.addEventListener('click', event => { if (event.target.closest('button')) play('tap'); });

  function tick(dt, time) {
    const speed = pointsToSpeed(heroPoints()), body = hero.body;
    let move = { x: 0, z: 0 };
    hero.grabBlock -= dt;
    if (hero.stun > 0) hero.stun -= dt; else move = moveVector();
    stepBody(body, dt, move.x, move.z, speed, floorAt, true);
    if (body.jumped) {
      body.jumped = false;
      play('jump');
    }
    const grounded = body.sinceGround < 0.05;
    if (grounded && airTime > 0.25) pulse(hero.view.inner, 0.3); // приземление: герой пружинит
    airTime = grounded ? 0 : airTime + dt;
    if (stepSwing(hero, dt)) batHit();
    if (body.pos.y < WATER_LINE) {
      burst(body.pos.x, -1, body.pos.z, [0xffffff, 0xbdf0ff], 16, 5);
      play('splash');
      if (hero.carried) {
        returnEgg(hero.carried);
        toast('Бульк! Яйцо вернулось в гнездо');
      }
      body.pos.set(SPAWN[0], 0.6, SPAWN[1]);
      body.vel.set(0, 0, 0);
      hero.stun = 0;
    }
    const moving = Math.hypot(move.x, move.z);
    if (moving > 0.05) hero.view.group.rotation.y = Math.atan2(move.x, move.z);
    hero.view.group.position.set(body.pos.x, body.pos.y - body.hy, body.pos.z);
    animateHero(hero.view, time, moving, body.sinceGround < 0.05, !!hero.carried, hero.stun > 0, hero.swing);

    if ((dayCheck -= dt) <= 0) { // раз в секунду: не наступил ли новый день и есть ли что забрать в заданиях
      dayCheck = 1;
      refreshDay();
      stepLuckHour();
      $('open-tasks').classList.toggle('due', tasksDue());
    }
    stepStar(dt); // до гнёзд: унесённое звёздное яйцо убирается раньше, чем гнездо успеет его возродить
    let danger = false;
    for (const nest of nests) if (stepNest(nest, dt, time)) danger = true;
    bots.step(dt, time);
    stepTraps();
    $('danger').classList.toggle('on', danger);
    if (danger && !chased) play('alarm'); // сторож погнался за героем
    chased = danger;
    for (const gate of gates) gate.tag.visible = !near(gate, 9); // вблизи вывеска наезжала бы на героя

    if (hero.carried && near(world.chest, BASE_RADIUS - 2)) deliver(time);
    chestWait = near(world.chest, 2.8) ? chestWait - dt : 0;
    if (near(world.chest, 2.8) && chestWait <= 0) {
      collect();
      chestWait = CHEST_PERIOD;
    }
    save.slots.forEach((slot, i) => {
      if (slot && slot.egg !== undefined && Date.now() >= slot.readyAt) {
        hatch(i, false);
        persist();
        replan();
      }
      const current = save.slots[i], view = slotViews[i];
      view.tag.visible = !!current;
      if (!current) return;
      if (current.pet) {
        animatePet(view.object, time);
        view.tag.el.style.color = RARITY[speciesById(current.pet).rarity].color;
        setText(view.tag, petTitle(current) + ' · +' + short(petIncome(current) * incomeFactor()) + '/с');
      } else {
        view.object.inner.rotation.z = Math.sin(time * 5 + i) * 0.06;
        view.tag.el.style.color = '';
        setText(view.tag, (current.star ? '⭐ ' : '🥚 ') + clock(Math.max(0, (current.readyAt - Date.now()) / 1000)));
      }
    });

    action = grabAction() || mergeAction() || sellAction() || warmAction();
    stepCard();
    $('action').hidden = !action;
    if (action) write('action', action.text);
    if (!$('shop').hidden) refreshShop();
    setText(chestTag, '💰 ' + short(bankNow()));
    stepTutorial();
    stepOffer();
    const target = destination();
    stepCompass(target);
    shownCoins += (save.coins - shownCoins) * (1 - Math.exp(-10 * dt)); // цифра докручивается до нового значения
    if (Math.abs(save.coins - shownCoins) < 1) shownCoins = save.coins;
    write('coins', '💰 ' + short(shownCoins));
    write('rate', '+' + short(incomeRate()) + '/с' + (save.reb ? ' · ⭐' + save.reb : ''));
    write('speed', '⚡ ' + heroPoints() + (boosted() ? ' · ' + clock((save.boostUntil - Date.now()) / 1000) : ''));
    write('trap', '🕸 ' + save.traps); // значки постарше: новые эмодзи на Windows 10 рисуются пустым квадратом
    write('goal', hero.stun > 0 || tutorStep() ? '' : '🧭 ' + target.text); // во время обучения дорогу объясняет подсказка
    write('distance', Math.round(apart(body.pos, target)) + ' м');

    // Камера смотрит чуть вперёд по ходу бега, чтобы было видно, куда бежишь.
    const ease = 1 - Math.exp(-3 * dt);
    lead.x += (move.x * 3.5 - lead.x) * ease;
    lead.z += (move.z * 3.5 - lead.z) * ease;
    const follow = 1 - Math.exp(-10 * dt);
    focus.x += (body.pos.x + lead.x - focus.x) * follow;
    focus.z += (body.pos.z + lead.z - focus.z) * follow;
    camera.position.set(focus.x, CAMERA.up * lens.zoom, focus.z + CAMERA.back * lens.zoom);
    camera.lookAt(focus.x, 0.8, focus.z);
    aimSun(body.pos.x, body.pos.z);
    world.animate(time, body.pos.x, body.pos.z);
    return focus;
  }

  // Приводит сцену в соответствие с сохранением. Яйца, созревшие без игрока, вылупляются без фейерверка.
  function catchUp() {
    let hatched = 0;
    save.slots.forEach((slot, i) => {
      if (usable(i)) world.showPad(i);
      if (slot && slot.egg !== undefined && Date.now() >= slot.readyAt) {
        hatch(i, true);
        hatched++;
      }
      syncSlot(i);
    });
    for (const trap of traps.splice(0)) scene.remove(trap.view);
    for (const [x, z] of save.placed) addTrap(x, z);
    if (hatched) {
      toast('Пока тебя не было, вылупилось питомцев: ' + hatched);
      persist();
    }
  }
  catchUp();
  afterAdopt = () => {
    catchUp();
    toast('Прогресс загружен из облака');
  };
  // Покупки ждут, пока облако ответит или пока мы не перестанем его ждать: начислять их надо на свежий прогресс.
  // ponytail: если облако так и не ответило, покупка этой сессии живёт только на устройстве. Потерять её можно,
  // лишь если до следующего входа сыграть ещё и с другого устройства; случится на практике — выдачу надо вести на сервере.
  (async function openCloud() {
    for (let tries = 1; !(await pullCloud()) && tries < CLOUD_TRIES; tries++) await new Promise(resolve => setTimeout(resolve, CLOUD_RETRY));
    cloudSettled = true;
    persist();
    sync(payGame).then(() => { replan(); renderShop(); }, () => {}); // оплаченное, что не успело выдаться в прошлый раз, придёт при входе
  })();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullCloud(); }); // вернулись в игру: вдруг играли на другом устройстве
  run(tick);
}

let cloudSettled = false;
try {
  const local = readSave(localStorage.getItem(LOCAL_KEY));
  if (local) adopt(local);
} catch {}
let ready = true;
try { init(); } catch { ready = false; }
if (!ready) { // нет WebGL: текст об этом уже стоит в разметке
  $('fatal').hidden = false;
  $('loading').hidden = true;
} else loadProps().then(() => { // мир строится сразу с готовыми моделями предметов, поэтому сначала ждём их
  try { start(); } catch (error) { crash(error); }
  $('loading').hidden = true;
});
