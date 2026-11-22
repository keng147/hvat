// Звуки игры, собранные из простых волн прямо в браузере: звуковых файлов нет, грузить нечего.

const MUTE_KEY = 'hvat-mute';
let context = null, muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch {}
}

// Браузер разрешает звук только после касания или нажатия клавиши, поэтому звук просыпается на первом из них.
function wake() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!context && Audio) context = new Audio();
  if (context && context.state === 'suspended') context.resume();
}
for (const type of ['pointerdown', 'keydown']) addEventListener(type, wake, { passive: true });

// Нота: волна вида type, частота плавно идёт от from до to герц за duration секунд. delay: через сколько секунд начать.
function tone(type, from, to, duration, volume, delay = 0) {
  const start = context.currentTime + delay, wave = context.createOscillator(), gain = context.createGain();
  wave.type = type;
  wave.frequency.setValueAtTime(from, start);
  wave.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  wave.connect(gain).connect(context.destination);
  wave.start(start);
  wave.stop(start + duration);
}
// Шум: для ударов и всплесков.
function noise(duration, volume) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(context.destination);
  source.start();
}
const chord = (notes, type, length, volume, gap) => notes.forEach((note, i) => tone(type, note, note, length, volume, i * gap));

const SOUNDS = {
  tap: () => tone('triangle', 520, 380, 0.06, 0.1),
  jump: () => tone('sine', 300, 520, 0.1, 0.07),
  grab: () => { tone('square', 300, 620, 0.09, 0.08); tone('triangle', 620, 880, 0.08, 0.08, 0.07); },
  deliver: () => chord([523, 659, 784], 'triangle', 0.14, 0.14, 0.08),
  hatch: () => chord([523, 659, 784, 1047], 'triangle', 0.22, 0.16, 0.09),
  coin: () => { tone('square', 988, 988, 0.05, 0.05); tone('square', 1319, 1319, 0.14, 0.05, 0.05); },
  buy: () => chord([659, 880, 1175], 'triangle', 0.12, 0.13, 0.06),
  star: () => chord([784, 988, 1175, 1568], 'sine', 0.3, 0.14, 0.1),
  alarm: () => { tone('sawtooth', 440, 660, 0.12, 0.07); tone('sawtooth', 440, 660, 0.12, 0.07, 0.16); },
  hit: () => { noise(0.12, 0.22); tone('sine', 160, 60, 0.15, 0.22); },
  trap: () => { noise(0.06, 0.18); tone('square', 900, 300, 0.08, 0.07); },
  lose: () => tone('sawtooth', 400, 120, 0.35, 0.1),
  splash: () => noise(0.3, 0.16),
};

// Играет звук по имени. Молчит, если звук выключен или браузер ещё не разрешил его.
export function play(name) {
  if (!muted && context && context.state === 'running') SOUNDS[name]();
}
