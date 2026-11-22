// Данные и баланс игры. Все цифры, которые хочется крутить, собраны здесь.
// Баланс черновой: посчитан формулами, на живых игроках не обкатан.

export const RARITY = [
  { name: 'Обычный', color: '#e3e9f5' },
  { name: 'Необычный', color: '#8dff9a' },
  { name: 'Редкий', color: '#7fd0ff' },
  { name: 'Эпический', color: '#d6a8ff' },
  { name: 'Легендарный', color: '#ffd23c' },
  { name: 'Мифический', color: '#ff8fb0' },
];

// Питомцы по возрастанию ценности. income: монет в секунду.
// look.model: файл готовой модели из папки models. look.fly: крылатый, висит над площадкой.
// Остальное в look (цвета, уши) описывает запасной вид, собранный кодом: он виден, пока модель грузится.
// look.ears: round | long | horns | antenna | wings | crest | halo
export const SPECIES = [
  { id: 'puh',  name: 'Слизик',   rarity: 0, income: 1,     look: { color: 0xffb3c7, belly: 0xffe3ea, ears: 'round',   size: 0.9, model: 'pet01-pink-slime' } },
  { id: 'top',  name: 'Колючка',  rarity: 0, income: 3,     look: { color: 0xa8e06a, belly: 0xe6f7c8, ears: 'antenna', size: 0.9, model: 'pet02-green-blob' } },
  { id: 'ush',  name: 'Грибок',    rarity: 1, income: 7,     look: { color: 0x7fc8ff, belly: 0xdff1ff, ears: 'long',    size: 0.95, model: 'pet03-mushnub' } },
  { id: 'rog',  name: 'Хохлатка',   rarity: 1, income: 16,    look: { color: 0xffb35c, belly: 0xffe6c2, ears: 'horns',   size: 1, model: 'pet04-chicken' } },
  { id: 'isk',  name: 'Гуля',  rarity: 2, income: 40,    look: { color: 0x5ce0d0, belly: 0xd6fff8, ears: 'antenna', size: 1, model: 'pet05-pigeon' } },
  { id: 'kry',  name: 'Мурзик',  rarity: 2, income: 100,   look: { color: 0xb48cff, belly: 0xefe3ff, ears: 'wings',   size: 1.05, model: 'pet06-cat' } },
  { id: 'lun',  name: 'Зубастик',  rarity: 3, income: 250,   look: { color: 0x6a7bff, belly: 0xe0e4ff, ears: 'long',    size: 1.1, model: 'pet07-fish' } },
  { id: 'iris', name: 'Мышан',  rarity: 3, income: 600,   look: { color: 0xe8a25a, belly: 0xfff0d6, ears: 'round',   size: 1.1, model: 'pet08-glub', fly: true } },
  { id: 'led',  name: 'Жужа', rarity: 4, income: 1500,  look: { color: 0xff8fc0, belly: 0xd6fff0, ears: 'crest',   size: 1.15, model: 'pet09-armabee', fly: true } },
  { id: 'snow', name: 'Звездун',  rarity: 4, income: 3800,  look: { color: 0xf4fbff, belly: 0xcfe9ff, ears: 'long',    size: 1.15, model: 'pet10-alpaking', fly: true } },
  { id: 'vint', name: 'Шипогриб',  rarity: 4, income: 9500,  look: { color: 0xb8c4d6, belly: 0xffd27a, ears: 'antenna', size: 1.2, model: 'pet11-mushnub-evolved' } },
  { id: 'obl',  name: 'Шершень', rarity: 5, income: 24000, look: { color: 0xffffff, belly: 0xffe9a8, ears: 'halo',    size: 1.25, model: 'pet12-armabee-evolved', fly: true } },
  { id: 'grom', name: 'Дракоша',  rarity: 5, income: 60000, look: { color: 0xff5c7a, belly: 0xffe08a, ears: 'horns',   size: 1.35, model: 'pet13-dragon', fly: true } },
];
export const speciesById = id => SPECIES.find(s => s.id === id);

// Мутации проверяются по порядку: сначала самая редкая. bonus умножает доход.
export const MUTATIONS = [
  { id: 'rainbow', name: 'Радужный', mark: '🌈', bonus: 10, chance: 0.005 },
  { id: 'shiny',   name: 'Сияющий',  mark: '✨', bonus: 3,  chance: 0.05 },
];
export const mutationById = id => MUTATIONS.find(m => m.id === id);

// side: в какой стороне от базы лежит зона. Камера не вращается, поэтому север всегда вверху экрана.
// Сами места зон задаёт FRAMES в world.js: если двигать зону, поправь и сторону.
export const ZONES = [
  { id: 'swamp', name: 'Грибное болото',      guard: 'toad',  side: 'Север',  arrow: '⬆' },
  { id: 'candy', name: 'Карамельная пустыня', guard: 'crab',  side: 'Запад',  arrow: '⬅' },
  { id: 'ice',   name: 'Ледяной хребет',      guard: 'yak',   side: 'Восток', arrow: '➡' },
  { id: 'city',  name: 'Заводной город',      guard: 'mech',  side: 'Юг',     arrow: '⬇' },
  { id: 'sky',   name: 'Облачные вершины',    guard: 'eagle', side: 'Север, за болотом', arrow: '⏫' },
];

// Яйцо номер e чаще всего даёт питомца номер e, реже e+1, совсем редко e+2.
export const HATCH_WEIGHTS = [75, 21, 4];
// nest: место гнезда в координатах своей зоны (вход в зону в точке 0, -25, зона уходит на север).
// need: очки скорости, с которыми яйцо уносится. hatch: секунд до вылупления.
const NEAR = [5, -46], FAR = [-5, -86];
export const EGGS = [
  { name: 'Пятнистое яйцо',  zone: 0, nest: [-5, -38], need: 26, hatch: 15,
    look: { base: 0xfff1d0, mark: 0x9a7b55, style: 'spots' },                 guard: { size: 1,    color: 0x6fc24a, belly: 0xe8f5b8 } },
  { name: 'Полосатое яйцо',  zone: 0, nest: [6, -62],  need: 32, hatch: 60,
    look: { base: 0xdcc8ff, mark: 0x8a55e0, style: 'stripes' },               guard: { size: 1.3,  color: 0x9a6bd6, belly: 0xe6d6ff } },
  { name: 'Золотистое яйцо', zone: 0, nest: [-3, -92], need: 38, hatch: 180,
    look: { base: 0xffd65c, mark: 0xfff6c8, style: 'spots', glow: 0x4a3600 }, guard: { size: 1.6,  color: 0xe0524a, belly: 0xffd9a8 } },
  { name: 'Карамельное яйцо', zone: 1, nest: NEAR, need: 44, hatch: 480,
    look: { base: 0xe8a25a, mark: 0xfff0d6, style: 'stripes' },               guard: { size: 1.1,  color: 0xff8a4a, belly: 0xffd9b8 } },
  { name: 'Леденцовое яйцо', zone: 1, nest: FAR,  need: 50, hatch: 1200,
    look: { base: 0xff8fc0, mark: 0xffffff, style: 'spots', glow: 0x4a1030 }, guard: { size: 1.5,  color: 0xff4f7a, belly: 0xffc9d6 } },
  { name: 'Снежное яйцо',    zone: 2, nest: NEAR, need: 56, hatch: 2700,
    look: { base: 0xffffff, mark: 0x8fc8ff, style: 'spots' },                 guard: { size: 1.2,  color: 0xf2ead8, belly: 0xb89a7a } },
  { name: 'Ледяное яйцо',    zone: 2, nest: FAR,  need: 62, hatch: 5400,
    look: { base: 0x9fe6ff, mark: 0xffffff, style: 'stripes', glow: 0x103a4a }, guard: { size: 1.6, color: 0xcfe6ff, belly: 0x7a8fb8 } },
  { name: 'Заводное яйцо',   zone: 3, nest: NEAR, need: 68, hatch: 10800,
    look: { base: 0xb8c4d6, mark: 0xd9a441, style: 'stripes' },               guard: { size: 1.1,  color: 0x8f9bb0, belly: 0xd9a441 } },
  { name: 'Латунное яйцо',   zone: 3, nest: FAR,  need: 74, hatch: 21600,
    look: { base: 0xd9a441, mark: 0x5a4a3a, style: 'spots', glow: 0x3a2800 }, guard: { size: 1.5,  color: 0xb5673a, belly: 0xffd27a } },
  { name: 'Облачное яйцо',   zone: 4, nest: NEAR, need: 80, hatch: 36000,
    look: { base: 0xffffff, mark: 0xffd23c, style: 'stripes' },               guard: { size: 1.2,  color: 0x4a5bd6, belly: 0xfff3d6 } },
  { name: 'Грозовое яйцо',   zone: 4, nest: FAR,  need: 88, hatch: 57600,
    look: { base: 0x4a5bd6, mark: 0xffe066, style: 'spots', glow: 0x1a2060 }, guard: { size: 1.6,  color: 0x2a3070, belly: 0xffe066 } },
];

// ---------- скорость ----------
// Игрок видит целые очки скорости. Внутри игры скорость в метрах в секунду вчетверо меньше.
export const START_POINTS = 28, MAX_SPEED_LEVEL = 64;
const POINTS_PER_METER = 4;
export const speedPoints = level => START_POINTS + level;
export const pointsToSpeed = points => points / POINTS_PER_METER;
export const speedCost = level => Math.ceil(25 * 1.26 ** level);

// ---------- погоня ----------
export const ENTRY = [0, -25];    // вход в зону: южнее сторож уже не гонится
export const ALERT_TIME = 0.5;    // сторож просыпается с задержкой
export const POST_OFFSET = 3;     // сторож спит на этом расстоянии за гнездом
const SPEED_MARGIN = 1.15;        // запас: по пути мешает декор, а бежать идеально по прямой никто не умеет
export const catchRadius = egg => 0.8 + 0.5 * egg.guard.size;
const runLength = egg => Math.hypot(egg.nest[0] - ENTRY[0], egg.nest[1] - ENTRY[1]);
// Скорость сторожа подбирается так, чтобы игрок с нужными очками уносил яйцо по прямой с запасом SPEED_MARGIN.
export function guardSpeed(egg) {
  const distance = runLength(egg), heroSpeed = egg.need / POINTS_PER_METER;
  return (distance + POST_OFFSET - catchRadius(egg)) / (distance * SPEED_MARGIN / heroSpeed - ALERT_TIME);
}
// Догонит ли сторож героя, который бежит от гнезда к выходу по прямой с такой скоростью.
function getsCaught(egg, heroSpeed) {
  return guardSpeed(egg) * (runLength(egg) / heroSpeed - ALERT_TIME) >= runLength(egg) + POST_OFFSET - catchRadius(egg);
}

// ---------- база и лавка ----------
export const START_SLOTS = 6, MAX_SLOTS = 10;
export const slotCost = owned => 500 * 6 ** (owned - START_SLOTS);
export const SELL_SECONDS = 30;  // питомец продаётся за свой доход за это время
export const BANK_HOURS = 2;     // сундук копит доход не дольше этого времени
// Бита есть у всех. stun: на сколько секунд оглушает соперника. cost: цена улучшения до этого уровня.
export const BATS = [{ stun: 1.5, cost: 0 }, { stun: 2.2, cost: 300 }, { stun: 3, cost: 5000 }, { stun: 4, cost: 80000 }];
export const MAX_TRAPS_PLACED = 3, MAX_TRAPS_OWNED = 9;
export const TRAP_STUN_BOT = 7, TRAP_STUN_GUARD = 3;
// Ловушка держит сторожа, только если герою не хватает до его яйца не больше TRAP_REACH очков скорости, и не чаще
// раза в TRAP_IMMUNITY секунд. Без этого две ловушки по 10 монет уносили самое дорогое яйцо на стартовой скорости:
// погоня длится секунды, и три секунды остановки заменяли всю прокачку.
export const TRAP_REACH = 6, TRAP_IMMUNITY = 10;
export const trapHolds = (heroPoints, egg) => heroPoints + TRAP_REACH >= egg.need;
// Ловушка дорожает вместе с игроком, иначе на поздних зонах она стоила бы копейки.
export const trapCost = speedLevel => Math.ceil(speedCost(speedLevel) * 0.4);

// ---------- вылупление ----------
// pick: случайное число от 0 до 1.
export function rollPet(eggIndex, pick) {
  let left = pick * HATCH_WEIGHTS.reduce((sum, weight) => sum + weight, 0), step = HATCH_WEIGHTS.length - 1;
  for (let i = 0; i < HATCH_WEIGHTS.length; i++) {
    if (left < HATCH_WEIGHTS[i]) {
      step = i;
      break;
    }
    left -= HATCH_WEIGHTS[i];
  }
  return SPECIES[Math.min(eggIndex + step, SPECIES.length - 1)];
}
// luck: во сколько раз подняты шансы (амулет удачи), обычно 1.
export function rollMutation(pick, luck = 1) {
  let edge = 0;
  for (const mutation of MUTATIONS) {
    edge += mutation.chance * luck;
    if (pick < edge) return mutation.id;
  }
  return '';
}

// ---------- покупки за звёзды ----------
// Что именно продаётся и почём, решает сервер (server/Code.gs). Здесь только сила эффектов.
// Тексты товаров на сервере называют эти числа, меняй их вместе.
export const PREMIUM_PADS = 2;      // золотые площадки сверх обычных
export const BOOST_POINTS = 8;      // прибавка к скорости от ускорителя
export const LUCK_FACTOR = 5;       // амулет удачи умножает шансы мутаций
export const PIGGY_SHARE = 0.1;     // такая доля собранных из сундука монет падает в копилку
const MIN_HOUR_COINS = 500;         // мешок монет даёт хотя бы столько за час, даже если питомцев ещё нет
// Мешок монет: доход всех питомцев за столько часов.
export const hoursToCoins = (hours, rate) => Math.max(hours * MIN_HOUR_COINS, Math.floor(rate * 3600 * hours));
// slot: { pet, m } — вид питомца и мутация.
export const petIncome = slot => speciesById(slot.pet).income * (slot.m ? mutationById(slot.m).bonus : 1);
// Сундук копит до предела. Если предел упал ниже накопленного (питомца продали), накопленное не срезаем.
export const accrue = (bank, rate, seconds, cap) => Math.max(bank, Math.min(cap, bank + rate * seconds));

// ---------- карточка у гнезда ----------
// Кто вылупится из яйца: [{ species, chance }], chance в процентах. Считается так же, как выбирает rollPet.
export function hatchTable(eggIndex) {
  const total = HATCH_WEIGHTS.reduce((sum, weight) => sum + weight, 0), table = [];
  HATCH_WEIGHTS.forEach((weight, step) => {
    const species = SPECIES[Math.min(eggIndex + step, SPECIES.length - 1)], row = table.find(r => r.species === species);
    if (row) row.chance += weight / total * 100;
    else table.push({ species, chance: weight / total * 100 });
  });
  return table;
}

// ---------- коллекция ----------
// Альбом: строка цифр, по одной на вид питомца. Биты цифры: 1 — найден обычный, 2 — сияющий, 4 — радужный.
// Каждая новая находка навсегда прибавляет очки скорости (points), все обычные питомцы одной редкости — ещё SET_POINTS.
// Так у дешёвых яиц остаётся смысл: за сияющим и радужным вариантом приходится ходить много раз.
export const VARIANTS = [
  { id: '', name: 'Обычный', mark: '', points: 1 },
  { id: 'shiny', name: 'Сияющий', mark: '✨', points: 1 },
  { id: 'rainbow', name: 'Радужный', mark: '🌈', points: 2 },
];
export const SET_POINTS = 2;
const variantBit = mutation => 1 << VARIANTS.findIndex(v => v.id === mutation);
// Приводит сохранённый альбом к правильному виду: нужная длина, только допустимые цифры.
export const cleanAlbum = value => SPECIES.map((_, i) => (Number(String(value || '')[i]) & 7) || 0).join('');
export const albumHas = (album, speciesIndex, mutation) => (Number(album[speciesIndex]) & variantBit(mutation)) !== 0;
// Отмечает находку и возвращает альбом. Если такой питомец уже был, альбом не меняется.
export function albumAdd(album, speciesId, mutation) {
  const i = SPECIES.findIndex(s => s.id === speciesId);
  return album.slice(0, i) + (Number(album[i]) | variantBit(mutation)) + album.slice(i + 1);
}
export const setDone = (album, rarity) => SPECIES.every((s, i) => s.rarity !== rarity || albumHas(album, i, ''));
export const albumCount = album => SPECIES.reduce((count, _, i) => count + VARIANTS.filter(v => albumHas(album, i, v.id)).length, 0);
export function albumPoints(album) {
  let points = 0;
  SPECIES.forEach((_, i) => VARIANTS.forEach(v => { if (albumHas(album, i, v.id)) points += v.points; }));
  RARITY.forEach((_, rarity) => { if (setDone(album, rarity)) points += SET_POINTS; });
  return points;
}

// ---------- слияние ----------
// Три одинаковых питомца (вид и вариант) сливаются в одного, вариантом выше: обычные в сияющего, сияющие в радужного.
// Доход при этом не падает (сияющий приносит втрое, радужный вдесятеро), а две площадки освобождаются. Так у повторов
// появляется дело, а у радужного варианта в коллекции — честный путь без удачи.
export const MERGE_COUNT = 3;
// Вариант на ступень выше либо null, если выше некуда.
export function nextVariant(mutation) {
  const next = VARIANTS[VARIANTS.findIndex(v => v.id === mutation) + 1];
  return next ? next.id : null;
}
// Площадки, чьи питомцы сольются с питомцем площадки i, либо null, если сливать нечего.
export function mergeMates(slots, i) {
  const pet = slots[i];
  if (!pet || !pet.pet || nextVariant(pet.m) === null) return null;
  const mates = slots.map((_, j) => j).filter(j => j !== i && slots[j] && slots[j].pet === pet.pet && slots[j].m === pet.m).slice(0, MERGE_COUNT - 1);
  return mates.length === MERGE_COUNT - 1 ? mates : null;
}

// ---------- перерождение ----------
// Когда на базе появился мифический питомец, игру можно начать заново: монеты, скорость, площадки, бита и питомцы
// сбрасываются, а доход навсегда умножается и на старте становится на площадку больше. Коллекция (и её очки скорости),
// покупки за звёзды и запас остаются. Так у игрока, который всё открыл, появляется следующий круг.
export const REBIRTH_RARITY = 5;
export const rebirthFactor = count => 1 + count;
export const startSlots = count => Math.min(MAX_SLOTS, START_SLOTS + count);
export const canRebirth = slots => slots.some(slot => slot && slot.pet && speciesById(slot.pet).rarity >= REBIRTH_RARITY);

// ---------- обогрев ----------
// Яйцо, принесённое на базу, когда площадки заняты, можно пустить на обогрев: каждое зреющее яйцо вылупится раньше
// на WARM_SHARE от времени созревания принесённого. Около двадцати ходок за яйцом того же вида заменяют ожидание,
// а дешёвым яйцом дорогое не согреть. fastHatch: куплен быстрый инкубатор, тогда и греет яйцо вдвое меньше секунд.
export const WARM_SHARE = 0.05;
export const warmSeconds = (egg, fastHatch) => egg.hatch * WARM_SHARE / (fastHatch ? 2 : 1);

// ---------- звёздное яйцо ----------
// Раз в STAR_PERIOD секунд в одном из гнёзд на STAR_LIFE секунд появляется звёздное яйцо. Питомец из него всегда
// хотя бы сияющий. Боты бегут за ним тоже. STAR_FIRST: через сколько секунд после входа в игру появится первое.
export const STAR_PERIOD = 240, STAR_LIFE = 75, STAR_FIRST = 60;

// ---------- час удачи ----------
// Каждый день в LUCK_HOUR_UTC часов по Гринвичу (20:00 по Москве) на час шансы мутаций вырастают в LUCK_HOUR_FACTOR раз.
// Время одно для всех игроков: о начале им пишет бот (server/Code.gs, там то же число часов).
export const LUCK_HOUR_UTC = 17, LUCK_HOUR_FACTOR = 2;
const HOUR = 3600000, DAY = 24 * HOUR;
// Сколько секунд часа удачи осталось в момент time (мс с 1970 года). 0: сейчас он не идёт.
export const luckHourLeft = time => (Math.floor(time % DAY / HOUR) === LUCK_HOUR_UTC ? Math.ceil((HOUR - time % HOUR) / 1000) : 0);
// Когда начнётся ближайший час удачи после момента time, мс с 1970 года.
export const nextLuckHour = time => time - time % DAY + LUCK_HOUR_UTC * HOUR + (time % DAY < LUCK_HOUR_UTC * HOUR ? 0 : DAY);

// ---------- таблица друзей ----------
// Номер недели от 1970 года, неделя начинается в понедельник в 00:00 по Гринвичу. Так же считает сервер (weekOf в server/Code.gs).
export const weekOf = time => Math.floor((time / DAY + 3) / 7);

// ---------- календарь и задания ----------
// Награды записаны так же, как выдачи за звёзды: hours (доход питомцев за столько часов), traps, boost (минут), luck (яиц).
// Календарь не сгорает: пропущенный день ничего не отнимает, следующая награда просто ждёт. После седьмой идёт снова первая.
export const CALENDAR = [{ traps: 1 }, { hours: 0.5 }, { boost: 10 }, { traps: 2 }, { hours: 1 }, { luck: 3 }, { traps: 3, boost: 15, luck: 5 }];
export const QUESTS = [
  { id: 'steal', text: 'Донеси яйца до базы', goal: 5, reward: { hours: 0.25 } },
  { id: 'hatch', text: 'Выведи питомцев', goal: 4, reward: { traps: 1 } },
  { id: 'bat', text: 'Оглуши соперника битой', goal: 2, reward: { boost: 5 } },
  { id: 'trap', text: 'Поймай кого-нибудь в ловушку', goal: 1, reward: { traps: 2 } },
  { id: 'star', text: 'Принеси звёздное яйцо', goal: 1, reward: { luck: 2 } },
  { id: 'warm', text: 'Пусти яйцо на обогрев', goal: 2, reward: { hours: 0.25 } },
  { id: 'sell', text: 'Продай питомцев', goal: 2, reward: { boost: 5 } },
];
export const QUESTS_PER_DAY = 3;
// Задания на день. Выбор зависит только от даты, поэтому в один день у всех игроков они одинаковые.
export function questsFor(date) {
  let seed = 7;
  for (const letter of String(date)) seed = (Math.imul(seed, 31) + letter.charCodeAt(0)) >>> 0;
  const pool = QUESTS.slice(), picked = [];
  while (picked.length < QUESTS_PER_DAY) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    picked.push(pool.splice((seed >>> 16) % pool.length, 1)[0]);
  }
  return picked;
}

(function selfTest() {
  console.assert(hatchTable(0).map(r => r.species.id + r.chance).join() === 'puh75,top21,ush4' && hatchTable(10).reduce((sum, r) => sum + r.chance, 0) === 100, 'карточка гнезда показывает те же шансы, по которым вылупляется питомец');
  const album = albumAdd(albumAdd(cleanAlbum(''), 'puh', ''), 'puh', 'rainbow');
  console.assert(albumPoints(album) === 3 && albumCount(album) === 2 && albumAdd(album, 'puh', '') === album && !albumHas(album, 0, 'shiny'), 'альбом: очки за находки, повтор ничего не даёт');
  console.assert(albumPoints(albumAdd(album, 'top', '')) === 3 + 1 + SET_POINTS && cleanAlbum('9x').length === SPECIES.length && cleanAlbum('9x')[0] === '1', 'альбом: набор редкости даёт бонус, мусор в сохранении чистится');
  console.assert(warmSeconds(EGGS[10], false) === 2880 && warmSeconds(EGGS[0], true) < 1, 'обогрев: двадцать ходок за тем же яйцом, дешёвое яйцо дорогое не греет');
  const trio = [{ pet: 'puh', m: '' }, null, { pet: 'puh', m: '' }, { pet: 'puh', m: 'shiny' }, { pet: 'puh', m: '' }, { pet: 'puh', m: '' }];
  console.assert(mergeMates(trio, 0).join() === '2,4' && mergeMates(trio, 3) === null && mergeMates(trio, 1) === null && mergeMates([{ egg: 0 }, { egg: 0 }, { egg: 0 }], 0) === null, 'слияние: нужны ещё два таких же питомца, яйца и другие варианты не считаются');
  console.assert(nextVariant('') === 'shiny' && nextVariant('shiny') === 'rainbow' && nextVariant('rainbow') === null && mergeMates(Array(3).fill({ pet: 'puh', m: 'rainbow' }), 0) === null, 'слияние: обычный, сияющий, радужный, выше некуда');
  console.assert(!canRebirth(trio) && canRebirth([null, { pet: 'obl', m: '' }]) && rebirthFactor(0) === 1 && rebirthFactor(2) === 3 && startSlots(1) === START_SLOTS + 1 && startSlots(99) === MAX_SLOTS, 'перерождение: нужен мифический питомец, множитель растёт, площадок не больше предела');
  const evening = Date.UTC(2026, 10, 19, LUCK_HOUR_UTC, 15);
  console.assert(luckHourLeft(evening) === 2700 && luckHourLeft(evening - HOUR) === 0 && luckHourLeft(evening + HOUR) === 0, 'час удачи идёт ровно час');
  console.assert(nextLuckHour(evening - HOUR) === evening - 15 * 60000 && nextLuckHour(evening) === evening - 15 * 60000 + DAY, 'следующий час удачи: сегодня, а если он уже начался, то завтра');
  console.assert(weekOf(Date.UTC(2026, 10, 22, 23, 59)) + 1 === weekOf(Date.UTC(2026, 10, 23)) && weekOf(Date.UTC(2026, 10, 23)) === weekOf(Date.UTC(2026, 10, 29, 23, 59)), 'неделя таблицы друзей идёт с понедельника по воскресенье');
  const daily = questsFor('2026-11-18');
  console.assert(daily.length === QUESTS_PER_DAY && new Set(daily).size === QUESTS_PER_DAY && questsFor('2026-11-18').every((quest, i) => quest === daily[i]), 'задания на день: разные и одни и те же при каждом входе');
  console.assert(EGGS.length + HATCH_WEIGHTS.length - 1 === SPECIES.length, 'на каждое яйцо хватает видов питомцев');
  console.assert(rollPet(0, 0).id === 'puh' && rollPet(0, 0.8).id === 'top' && rollPet(0, 0.999).id === 'ush', 'вид выбирается по весам');
  console.assert(rollPet(10, 0.999).id === 'grom', 'последнее яйцо даёт самого ценного питомца');
  console.assert(trapHolds(START_POINTS, EGGS[1]) && !trapHolds(START_POINTS, EGGS[2]) && !trapHolds(START_POINTS, EGGS[10]), 'ловушка помогает унести яйцо на ступень выше своей скорости, но не дальше');
  console.assert(rollMutation(0.001) === 'rainbow' && rollMutation(0.03) === 'shiny' && rollMutation(0.5) === '', 'мутации выпадают по шансам');
  console.assert(rollMutation(0.02, LUCK_FACTOR) === 'rainbow' && rollMutation(0.2, LUCK_FACTOR) === 'shiny' && rollMutation(0.3, LUCK_FACTOR) === '', 'амулет поднимает шансы впятеро');
  console.assert(hoursToCoins(2, 0) === 1000 && hoursToCoins(2, 10) === 72000, 'мешок монет: доход за часы, но не меньше минимума');
  console.assert(petIncome({ pet: 'top', m: 'shiny' }) === 9 && petIncome({ pet: 'top', m: '' }) === 3, 'мутация умножает доход');
  console.assert(accrue(0, 2, 10, 100) === 20 && accrue(90, 2, 10, 100) === 100 && accrue(150, 2, 10, 100) === 150, 'сундук копит до предела и не теряет монеты');
  console.assert(speedCost(0) === 25 && speedCost(1) === 32 && slotCost(6) === 500 && slotCost(7) === 3000, 'цены растут по формулам');
  for (const egg of EGGS) {
    const need = egg.need / POINTS_PER_METER;
    console.assert(guardSpeed(egg) > 0 && !getsCaught(egg, need) && getsCaught(egg, need * 0.8), 'сторож: уносится с нужной скоростью, ловит медленного: ' + egg.name);
  }
  console.assert(EGGS[0].need <= START_POINTS && EGGS[1].need > START_POINTS, 'первое гнездо доступно сразу, второе нет');
})();
