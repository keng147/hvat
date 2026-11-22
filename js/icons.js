// Рисованные значки вместо системных эмодзи: на Android, iOS и Windows эмодзи выглядят по-разному,
// а часть новых вообще рисуется пустым квадратом. В текстах игры по-прежнему пишутся эмодзи,
// а paint подменяет их картинкой при выводе. Сами картинки лежат в index.html, в блоке <svg id="icons">.

// Через пробел после имени идёт поворот значка в градусах: все стрелки нарисованы одной картинкой.
const ICONS = {
  '💰': 'coin', '⚡': 'bolt', '⭐': 'star', '🥚': 'egg', '🕸': 'trap', '🏏': 'bat', '🛒': 'cart', '🎯': 'target', '📖': 'book',
  '🧭': 'compass', '🏠': 'home', '🎁': 'gift', '🍀': 'clover', '🐣': 'paw', '✨': 'sparkle', '🌈': 'rainbow', '✅': 'check',
  '⬆': 'arrow 0', '➡': 'arrow 90', '⬇': 'arrow 180', '⬅': 'arrow 270', '⏫': 'arrows',
};
const PATTERN = new RegExp(Object.keys(ICONS).join('|'), 'gu');
const SVG = 'http://www.w3.org/2000/svg';

// Картинка значка по имени. turn: поворот в градусах.
export function symbol(name, turn = 0) {
  const svg = document.createElementNS(SVG, 'svg'), use = document.createElementNS(SVG, 'use');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (turn) svg.style.transform = 'rotate(' + turn + 'deg)';
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}
function icon(emoji) {
  const [name, turn] = ICONS[emoji].split(' ');
  const svg = symbol(name, Number(turn) || 0);
  // Сам символ остаётся в тексте невидимым: его читают программы экранного доступа и проверки игры.
  const spoken = document.createElement('span');
  spoken.className = 'spoken';
  spoken.textContent = emoji;
  return [svg, spoken];
}

// Пишет текст в элемент, заменяя эмодзи значками. Повторный вызов с тем же текстом ничего не делает,
// поэтому функцию можно звать каждый кадр.
export function paint(node, text) {
  if (node.painted === text) return;
  node.painted = text;
  if (!text.match(PATTERN)) {
    node.textContent = text;
    return;
  }
  const parts = [];
  let from = 0;
  for (const found of text.matchAll(PATTERN)) {
    if (found.index > from) parts.push(text.slice(from, found.index));
    parts.push(...icon(found[0]));
    from = found.index + found[0].length;
  }
  if (from < text.length) parts.push(text.slice(from));
  node.replaceChildren(...parts);
}

(function selfTest() {
  const node = document.createElement('p');
  paint(node, '💰 12 → ⬅ дом');
  console.assert(node.textContent === '💰 12 → ⬅ дом' && node.querySelectorAll('svg').length === 2, 'значки подменяют эмодзи, текст элемента остаётся прежним');
})();
