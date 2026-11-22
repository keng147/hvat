// Покупки за звёзды и уведомления: общение с сервером (server/Code.gs).

// Адрес веб-приложения Apps Script, заканчивается на /exec. Пока пусто, покупки и уведомления выключены.
const API_URL = 'https://script.google.com/macros/s/AKfycbwQez1WMflwul8KPDSrGEDrSFuxikqQkapaXucgqNWvrr7gHx-Jnfi2kIjbU2wWbG2l/exec';
const SYNC_TRIES = 6, SYNC_PAUSE = 1500;
const PLAN_PAUSE = 60000; // план уведомлений уходит не чаще раза в минуту: сервер у всех игроков один

const tg = window.Telegram?.WebApp;
export const canPay = () => !!API_URL && !!tg?.initData && !!tg.isVersionAtLeast?.('6.1'); // окно оплаты появилось в Telegram 6.1
let catalog = null, invite = null, board = [];
export const getCatalog = () => catalog; // товары с сервера: [{ id, title, description, stars, owned }]
export const getBoard = () => board;     // таблица друзей: [{ name, eggs }], яйца за эту неделю
export const getInvite = () => invite;   // приглашение друга: { link, grant, friends, limit } либо null, если сервер его не даёт

// keepalive: запрос доживёт, даже если игру закрыли сразу после отправки.
function request(action, extra, keepalive = false) {
  return fetch(API_URL, { method: 'POST', keepalive, body: JSON.stringify(Object.assign({ action, initData: tg.initData }, extra)) });
}
// Ошибки сервера приходят словом: auth (сеанс устарел), slow (слишком часто), server.
async function api(action, extra) {
  const data = await (await request(action, extra)).json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

// Отбирает оплаченное, что ещё не выдано, и запоминает номера платежей в claimed.
// Сервер может прислать тот же платёж повторно (подтверждение потерялось): второй раз он ничего не даёт.
export function newGrants(claimed, pending) {
  const fresh = [];
  for (const purchase of pending) {
    if (claimed.includes(purchase.id)) continue;
    claimed.push(purchase.id);
    fresh.push(purchase.grant);
  }
  return fresh;
}
(function selfTest() {
  const claimed = [], pending = [{ id: 'a', grant: { hours: 2 } }, { id: 'b', grant: { traps: 5 } }];
  console.assert(newGrants(claimed, pending).length === 2 && newGrants(claimed, pending).length === 0, 'повторный ответ сервера не выдаёт покупку дважды');
})();

// game: { save, refresh(), apply(grants, perks), persist(), tutored() }. apply возвращает true, если что-то изменилось.
// tutored: пройдено ли обучение. По нему сервер засчитывает приглашённого друга.
// Одновременно идёт только одна синхронизация: две подряд выдали бы одну покупку дважды
// (вторая получила бы список неподтверждённого уже после того, как первая очистила claimed).
let running = null;
export function sync(game) {
  if (!canPay()) return Promise.resolve(false);
  if (!running) running = runSync(game).finally(() => { running = null; });
  return running;
}
async function runSync(game) {
  const data = await api('sync', { tutored: game.tutored() });
  catalog = data.catalog;
  invite = data.invite || null;
  board = data.board || [];
  await game.refresh(); // покупку начисляем на свежий прогресс из облака, иначе её затрёт сохранение с другого устройства
  const changed = game.apply(newGrants(game.save.claimed, data.pending), data.owned);
  game.persist(); // сначала сохраняем выданное у игрока, потом подтверждаем серверу
  if (!data.pending.length) return changed;
  const ids = data.pending.map(purchase => purchase.id);
  try {
    await api('ack', { ids });
    game.save.claimed = game.save.claimed.filter(id => !ids.includes(id));
    game.persist();
  } catch {
    // Подтверждение не дошло. Покупка уже у игрока, claimed её помнит: подтвердим при следующей синхронизации.
  }
  return changed;
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Открывает оплату товара. Итог: 'done' | 'late' (оплачено, сервер ещё не записал) | 'cancelled' | 'error'.
export async function buy(productId, game) {
  let link;
  try {
    link = (await api('invoice', { product: productId })).link;
  } catch {
    return 'error';
  }
  const status = await new Promise(resolve => tg.openInvoice(link, resolve));
  if (status !== 'paid') return 'cancelled';
  // Telegram закрывает счёт раньше, чем сервер успевает записать платёж, поэтому спрашиваем несколько раз.
  for (let attempt = 0; attempt < SYNC_TRIES; attempt++) {
    if (await sync(game).catch(() => false)) return 'done';
    await pause(SYNC_PAUSE);
  }
  return 'late';
}

// Просит бота написать, когда вылупится яйцо и наполнится сундук. Время в секундах, 0 значит «не надо».
// week: { k: номер недели, n: яиц принесено за неё } — счёт для таблицы друзей, едет тем же запросом.
// Запросы склеиваются: на сервер уходит только последнее состояние и только если оно изменилось.
let planTimer = 0, planned = null, sent = '';
function sendPlan() {
  clearTimeout(planTimer);
  planTimer = 0;
  const body = JSON.stringify(planned);
  if (!planned || body === sent) return;
  sent = body;
  request('plan', planned, true).catch(() => {});
}
export function plan(hatchAt, chestAt, week) {
  if (!canPay()) return;
  planned = { hatchAt, chestAt, week: week.k, eggs: week.n };
  if (!planTimer) planTimer = setTimeout(sendPlan, PLAN_PAUSE);
}
// Уходя из игры, отправляем сразу: уведомление нужно как раз тогда, когда игрока нет.
document.addEventListener('visibilitychange', () => { if (document.hidden) sendPlan(); });
addEventListener('pagehide', sendPlan);
