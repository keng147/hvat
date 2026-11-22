// Боты-соперники: бегают за яйцами, уносят их к себе и охотятся на героя, когда он несёт яйцо.
// game — то, что бот может делать в мире: { nests, items, hero, zones, heroSpeed(), shielded(), star(), take, consumeEgg, returnEgg, knock, toast }.
// nests — гнёзда, items — все яйца всех кладок (по несколько на гнездо). star() — звёздное яйцо, пока оно лежит в гнезде.
import { scene, stepBody, createBody, label } from './engine.js';
import { makeHero, animateHero } from './art.js';
import { floorAt, inZone, BASE_RADIUS } from './world.js';
import { ZONES } from './data.js';

// factor: скорость относительно героя. nerve: с какой вероятностью бот решается напасть.
const BOTS = [
  { name: 'Шустрик', color: 0xff7a3c, factor: 0.9, nerve: 0.3, rest: [10.3, 3.8] },
  { name: 'Тихоня',  color: 0x7ad65a, factor: 0.82, nerve: 0.15, rest: [-3.8, 10.3] },
  { name: 'Бублик',  color: 0xc77bff, factor: 1, nerve: 0.5, rest: [-10.3, -3.8] },
];
const ARRIVE = 0.9;        // на таком расстоянии точка маршрута считается пройденной
const REACH = 1.7;         // с этого расстояния бот замахивается
const HIT_RANGE = 2.3;     // и на этом попадает
const HUNT_SECONDS = 8, HUNT_RANGE = 40, HUNT_REST = 30; // после удачной кражи бот какое-то время не нападает
const HERO_STUN = 1.2;
const STAR_GREED = 0.8;    // с такой вероятностью бот бросает всё ради звёздного яйца
const WATER_LINE = -1.4;

export const SWING_TIME = 0.3, SWING_COOLDOWN = 0.9;
export function startSwing(actor) {
  actor.swing = 0.01;
  actor.swingCooldown = SWING_COOLDOWN;
}
// Двигает замах. Возвращает true в тот кадр, когда бита достаёт до цели.
export function stepSwing(actor, dt) {
  actor.swingCooldown -= dt;
  if (actor.swing <= 0) return false;
  const before = actor.swing;
  actor.swing = before + dt / SWING_TIME >= 1 ? 0 : before + dt / SWING_TIME;
  return before < 0.4 && (actor.swing >= 0.4 || actor.swing === 0);
}

// Герой и боты устроены одинаково: модель, тело, яйцо в руках, оглушение, замах.
export function createActor(color, x, z, isHero, name) {
  const actor = {
    isHero, name, view: makeHero(color), body: createBody(x, 0.6, z), carried: null, held: null,
    stun: 0, grabBlock: 0, swing: 0, swingCooldown: 0, spawn: [x, z],
  };
  scene.add(actor.view.group);
  return actor;
}

export function createBots(game) {
  const { hero, nests, items, zones } = game;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // База — безопасная зона: пока герой на своём острове, боты на него не охотятся и выбить яйцо не могут.
  const heroSafe = () => Math.hypot(hero.body.pos.x, hero.body.pos.z) < BASE_RADIUS;

  const bots = BOTS.map(spec => {
    const bot = createActor(spec.color, spec.rest[0], spec.rest[1], false, spec.name);
    return Object.assign(bot, { spec, mode: 'rest', timer: 2 + Math.random() * 5, route: [], target: null, stuck: 0, dodge: 0, dodgeSide: 1, calm: 0, stole: false, tag: label('bot', spec.name, 34) });
  });

  // Маршрут домой: назад по тропе своей зоны, потом к месту отдыха на базе.
  function homeRoute(bot) {
    const p = bot.body.pos;
    const zone = ZONES.findIndex((_, i) => inZone(i, p.x, p.z));
    const back = zone === -1 ? [] : [...zones[zone].approach].reverse();
    return [...back, bot.spec.rest];
  }
  function goHome(bot) {
    bot.mode = 'home';
    bot.route = homeRoute(bot);
    bot.target = null;
  }
  // Отдохнув, бот решает, чем заняться.
  function plan(bot) {
    if (hero.carried && willHunt(bot)) return hunt(bot);
    const loose = items.find(item => item.where === 'loose' && distance(bot.body.pos, item.loose) < 20);
    if (loose) {
      bot.mode = 'pick';
      bot.target = loose;
      return;
    }
    // Бот идёт к гнезду, которое ему по скорости. Чаще к самому ценному из доступных.
    // За звёздным яйцом он бежит почти всегда, даже если сторож там ему не по зубам.
    const points = game.heroSpeed() * 4 * bot.spec.factor;
    const able = nests.filter(nest => nest.egg.need <= points);
    const pool = able.length ? (Math.random() < 0.7 ? able.slice(-2) : able) : [nests[0]];
    const star = game.star();
    const nest = star && Math.random() < STAR_GREED ? star.nest : pool[Math.floor(Math.random() * pool.length)];
    const zone = zones[nest.zone];
    bot.mode = 'go';
    bot.target = nest;
    bot.route = [...zone.approach, ...zone.nests.slice(0, nest.order + 1)]; // order: номер гнезда в своей зоне
  }
  // Новичка боты не трогают (game.shielded), героя на базе тоже, после удачной кражи отдыхают, издалека не бегут.
  function willHunt(bot) {
    return !game.shielded() && !heroSafe() && bot.calm <= 0 && Math.random() < bot.spec.nerve && distance(bot.body.pos, hero.body.pos) < HUNT_RANGE;
  }
  function hunt(bot) {
    bot.mode = 'hunt';
    bot.timer = HUNT_SECONDS;
    bot.target = null;
  }

  // Шаг к точке. Упёршись в препятствие, бот ненадолго уходит вбок.
  function moveTo(bot, x, z, dt) {
    const p = bot.body.pos, dx = x - p.x, dz = z - p.z, length = Math.hypot(dx, dz) || 1;
    let mx = dx / length, mz = dz / length;
    if (bot.dodge > 0) {
      bot.dodge -= dt;
      [mx, mz] = [-mz * bot.dodgeSide + mx * 0.3, mx * bot.dodgeSide + mz * 0.3];
      const norm = Math.hypot(mx, mz);
      mx /= norm;
      mz /= norm;
    }
    const speed = game.heroSpeed() * bot.spec.factor, fromX = p.x, fromZ = p.z;
    stepBody(bot.body, dt, mx, mz, speed, floorAt);
    bot.stuck = Math.hypot(p.x - fromX, p.z - fromZ) < speed * dt * 0.3 ? bot.stuck + dt : 0;
    if (bot.stuck > 0.4) {
      bot.stuck = 0;
      bot.dodge = 0.5;
      bot.dodgeSide = Math.random() < 0.5 ? 1 : -1;
    }
    bot.view.group.rotation.y = Math.atan2(mx, mz);
    return length;
  }
  // Идёт по маршруту. Возвращает true, когда маршрут пройден.
  function follow(bot, dt) {
    if (!bot.route.length) return true;
    if (moveTo(bot, bot.route[0][0], bot.route[0][1], dt) < ARRIVE) bot.route.shift();
    return !bot.route.length;
  }
  function stand(bot, dt) {
    stepBody(bot.body, dt, 0, 0, 0, floorAt);
  }

  function stepBot(bot, dt, time) {
    const p = bot.body.pos;
    bot.grabBlock -= dt;
    bot.calm -= dt;
    let moved = true;

    if (bot.stun > 0) {
      bot.stun -= dt;
      bot.mode = 'stunned';
      stand(bot, dt);
      moved = false;
    } else if (bot.mode === 'stunned') {
      goHome(bot);
    } else if (bot.mode === 'rest') {
      bot.timer -= dt;
      stand(bot, dt);
      moved = false;
      if (bot.timer <= 0) plan(bot);
    } else if (bot.mode === 'go') {
      if (follow(bot, dt)) {
        const here = bot.target.eggs.filter(egg => egg.where === 'nest');
        const item = here.find(egg => egg.star) || here[0];
        if (item) {
          game.take(bot, item, true);
          bot.stole = false;
          bot.mode = 'flee';
          bot.route = homeRoute(bot);
        } else goHome(bot);
      }
    } else if (bot.mode === 'pick') {
      if (bot.target.where !== 'loose') goHome(bot);
      else moveTo(bot, bot.target.loose.x, bot.target.loose.z, dt);
    } else if (bot.mode === 'hunt') {
      bot.timer -= dt;
      if (!hero.carried || bot.timer <= 0 || heroSafe()) goHome(bot);
      else if (moveTo(bot, hero.body.pos.x, hero.body.pos.z, dt) < REACH && bot.swingCooldown <= 0 && bot.swing <= 0) startSwing(bot);
    } else if (follow(bot, dt)) { // flee или home
      bot.mode = 'rest';
      bot.timer = 3 + Math.random() * 6;
    }

    if (stepSwing(bot, dt) && hero.carried && hero.stun <= 0 && !heroSafe() && distance(p, hero.body.pos) < HIT_RANGE) {
      game.knock(hero, HERO_STUN);
      bot.stole = true;
      game.toast(bot.name + ' выбил у тебя яйцо!');
    }
    // Яйцо, лежащее на земле, бот подбирает и уносит.
    if (!bot.carried && bot.stun <= 0 && bot.grabBlock <= 0) {
      const loose = items.find(item => item.where === 'loose' && distance(p, item.loose) < 1.3);
      if (loose) {
        game.take(bot, loose, false);
        bot.mode = 'flee';
        bot.route = homeRoute(bot);
      }
    }
    if (bot.carried && Math.hypot(p.x, p.z) < BASE_RADIUS - 3) { // донёс до базы: яйцо пропадает
      game.consumeEgg(bot);
      if (bot.stole) {
        game.toast(bot.name + ' унёс твоё яйцо!');
        bot.calm = HUNT_REST;
        bot.stole = false;
      }
    }
    if (p.y < WATER_LINE) {
      if (bot.carried) game.returnEgg(bot.carried);
      p.set(bot.spawn[0], 0.6, bot.spawn[1]);
      bot.body.vel.set(0, 0, 0);
      bot.mode = 'rest';
      bot.timer = 3;
    }

    bot.view.group.position.set(p.x, p.y - bot.body.hy, p.z);
    animateHero(bot.view, time + bot.spec.factor * 7, moved ? 1 : 0, bot.body.sinceGround < 0.05, !!bot.carried, bot.stun > 0, bot.swing);
    bot.tag.pos.set(p.x, 2.4, p.z);
    bot.tag.el.classList.toggle('angry', bot.mode === 'hunt');
  }

  return {
    actors: bots,
    step(dt, time) {
      for (const bot of bots) stepBot(bot, dt, time);
    },
    // Появилось звёздное яйцо: отдыхающие боты срываются с места почти сразу.
    starAppeared() {
      for (const bot of bots) if (bot.mode === 'rest') bot.timer = Math.random() * 2;
    },
    // Герой схватил яйцо: кто-то из ботов поблизости может решиться его отобрать.
    heroGrabbed() {
      for (const bot of bots) {
        const free = bot.mode === 'rest' || bot.mode === 'go' || bot.mode === 'home';
        if (free && !bot.carried && willHunt(bot)) hunt(bot);
      }
    },
  };
}
