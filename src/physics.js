const COUNT = 20;
const WIDTH = 440;
const HEIGHT = 346;
const FLOOR = 316;
const SIZE = 15;
const CENTER = WIDTH / 2;
const STEPS = 840;
const HZ = 60;
const TRACE_INTERVAL = 7;
const ATTRIBUTES = [
  ['jump', 'Impulso de salto', 'Velocidad inicial al saltar desde un apoyo.', 2.5, 6.5, 3.7],
  ['drive', 'Empuje lateral', 'Aceleración al acercarse a la torre.', 0.11, 0.65, 0.26],
  ['grip', 'Agarre al trepar', 'Fuerza del único impulso en el aire junto a la torre.', 0.26, 0.88, 0.42],
  ['brake', 'Frenado', 'Cuánto se reduce la velocidad cerca del punto de aterrizaje.', 0.10, 0.64, 0.27],
  ['balance', 'Estabilidad', 'Fuerza con que los cuadrados ya apilados corrigen su posición.', 0.018, 0.13, 0.045],
  ['recovery', 'Recuperación', 'Pausa en fotogramas entre saltos.', 7, 30, 19],
];
const BASE = Object.fromEntries(ATTRIBUTES.map(([key,,,,,value]) => [key,value]));
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createArena(settings, seed, goal) {
  const { Engine, Bodies, Body, Composite, Query } = Matter;
  const random = rng(seed);
  const engine = Engine.create({ positionIterations: 7, velocityIterations: 5 });
  engine.gravity.y = 0.82;
  const terrain = [
    Bodies.rectangle(CENTER, FLOOR + 12, WIDTH, 24, { isStatic: true }),
    Bodies.rectangle(-10, FLOOR / 2, 20, FLOOR * 2, { isStatic: true }),
    Bodies.rectangle(WIDTH + 10, FLOOR / 2, 20, FLOOR * 2, { isStatic: true }),
  ];
  const units = Array.from({ length: COUNT }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const x = i === 0 ? CENTER - 2 : CENTER + side * (31 + Math.floor((i - 1) / 2) * 17 + random() * 2);
    const body = Bodies.rectangle(x, FLOOR - SIZE / 2 - 0.5, SIZE, SIZE, {
      friction: 0.22, frictionAir: 0.077, restitution: 0.025,
    });
    Body.setMass(body, 0.3);
    Body.setInertia(body, Infinity);
    return { body, side, stacked: i === 0, lastJump: -60, boostAvailable: false, stable: 0 };
  });
  const bodies = units.map(unit => unit.body);
  Composite.add(engine.world, [...terrain, ...bodies]);
  let tick = 0;
  let peak = 1;
  let supportHeight = 1;
  let firstGoal = null;
  let totalHeight = 0;

  function move(body, desiredX, strength, maxVelocity) {
    const delta = desiredX - body.position.x;
    const desiredVelocity = clamp(delta * settings.brake, -maxVelocity, maxVelocity);
    const acceleration = clamp(desiredVelocity - body.velocity.x, -strength, strength);
    Body.applyForce(body, body.position, { x: acceleration * body.mass / 277.78, y: 0 });
  }

  function step() {
    const stacked = units.filter(unit => unit.stacked);
    const top = stacked.reduce((highest, unit) => unit.body.position.y < highest.body.position.y ? unit : highest);
    const target = top.body.position;
    for (const unit of stacked) move(unit.body, CENTER, settings.balance, 1.25);

    for (const climber of units) {
      if (climber.stacked) continue;
      const { body, side } = climber;
      const { x, y } = body.position;
      const above = y < target.y - SIZE - 0.7;
      const edge = CENTER + side * (SIZE + 0.4);
      const landing = above || (Math.abs(x - target.x) < SIZE - 1.4 && y < target.y - SIZE * 0.8);
      move(body, landing ? target.x : edge, settings.drive, 4.1);
      const foot = { x, y: y + SIZE / 2 + 1.8 };
      const grounded = body.velocity.y >= -0.05 && body.velocity.y < 0.75 &&
        (foot.y >= FLOOR || Query.point(bodies, foot).length > 0);
      const adjacent = stacked.some(unit => {
        const dx = Math.abs(x - unit.body.position.x);
        return dx >= SIZE - 1.5 && dx < SIZE + 3 && Math.abs(y - unit.body.position.y) < SIZE * 0.82;
      });
      if (grounded) climber.boostAvailable = false;
      if (grounded && !landing && Math.abs(x - edge) < 30 && tick - climber.lastJump >= settings.recovery) {
        Body.setVelocity(body, { x: body.velocity.x, y: -settings.jump });
        climber.lastJump = tick;
        climber.boostAvailable = true;
      } else if (!grounded && climber.boostAvailable && adjacent && !landing && body.velocity.y > -4.3) {
        Body.setVelocity(body, { x: body.velocity.x, y: -(4 + 25 * settings.grip) });
        climber.boostAvailable = false;
      }
    }

    Engine.update(engine, 1000 / HZ);
    tick += 1;
    // Confirm a continuous stack with a path of physical supports down to the floor.
    const order = [...units].sort((a, b) => b.body.position.y - a.body.position.y);
    const supported = [];
    let current = 1;
    for (const unit of order) {
      const { body } = unit;
      const { x, y } = body.position;
      if (unit !== units[0] && (Math.abs(x - CENTER) > SIZE / 2 || y > FLOOR - SIZE)) unit.stacked = false;
      const previousStable = unit.stable;
      unit.stable = 0;
      if (Math.abs(body.velocity.y) >= 0.7) continue;
      let level = FLOOR - y < SIZE / 2 + 2 ? 1 : 0;
      for (const other of supported) {
        if (Math.abs(x - other.x) < SIZE - 1 && Math.abs(other.y - y - SIZE) < 2.2) {
          level = Math.max(level, other.level + 1);
        }
      }
      if (level === 0) continue;
      supported.push({ x, y, level });
      current = Math.max(current, level);
      if (level >= 2 && Math.abs(x - CENTER) < 3.2) {
        unit.stable = previousStable + 1;
        if (unit.stable >= 10) unit.stacked = true;
      }
    }
    // Require two consecutive observations before recording the top height.
    const confirmed = Math.min(current, supportHeight);
    supportHeight = current;
    peak = Math.max(peak, confirmed);
    totalHeight += confirmed;
    if (firstGoal === null && confirmed >= goal) firstGoal = tick;
  }

  function result() {
    return { peak, firstGoal, reward: peak * 3 + totalHeight / STEPS + (firstGoal === null ? 0 : 10 + 4 * (1 - firstGoal / STEPS)) };
  }

  return {
    step, result,
    frame: () => units.map(({ body, stacked }) => [body.position.x, body.position.y, !stacked, stacked]),
  };
}

function episode(settings, seed, goal, frames) {
  const arena = createArena(settings, seed, goal);
  if (frames) frames.push({ squares: arena.frame(), score: arena.result() });
  for (let tick = 1; tick <= STEPS; tick += 1) {
    arena.step();
    if (frames && (tick % TRACE_INTERVAL === 0 || tick === STEPS)) {
      frames.push({ squares: arena.frame(), score: arena.result() });
    }
  }
  return arena.result();
}

// Episodic reinforcement learning via direct policy search. Only selected
// dimensions of the shared controller are explored. Every trial uses the same seeds.
function* train(indices, goal, seed, rounds) {
  const evolve = rng(seed ^ 0x715ac3);
  const scenarios = [seed ^ 341, seed ^ 793];
  function evaluate(parameters) {
    const frames = [];
    const shown = episode(parameters, scenarios[0], goal, frames);
    const other = episode(parameters, scenarios[1], goal);
    return { frames, reward: (shown.reward + other.reward) / 2 };
  }
  let best = { ...BASE };
  const initial = evaluate(best);
  let bestReward = initial.reward;
  yield initial.frames;
  for (let run = 1; run <= rounds; run += 1) {
    const candidate = { ...best };
    const global = run % 5 === 0 || run < 5;
    const radius = 0.45 * (1 - run / rounds) + 0.07;
    for (const index of indices) {
      const [key,,, min, max] = ATTRIBUTES[index];
      const value = global ? min + (max - min) * evolve() :
        best[key] + (evolve() * 2 - 1) * (max - min) * radius;
      candidate[key] = clamp(value, min, max);
    }
    const { frames, reward } = evaluate(candidate);
    if (reward > bestReward) {
      best = candidate;
      bestReward = reward;
    }
    yield frames;
  }
  return { best };
}
