(() => {
  const select = id => document.getElementById(id);
  const inputs = { goal: select('goal'), train: select('train'), replay: select('replay'), baseline: select('baseline') };
  const progress = select('progress');
  const status = select('status');
  const number = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
  const format = value => number.format(value);
  const SEED = 10493;
  const ROUNDS = 22;
  const selection = new Set([0, 1, 2]);
  const teams = ['A', 'B'];
  const colors = ['#64ded2', '#ffad72'];
  const attributes = select('attributes');
  let worker = null;
  let animation = 0;
  let learned = null;

  const canvases = [...document.querySelectorAll('canvas')].map(canvas => canvas.getContext('2d'));
  const metric = selector => [...document.querySelectorAll(selector)];
  const heights = metric('[data-peak]');
  const times = metric('[data-time]');

  function draw(ctx, arena, goal, color) {
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = '#1d2b34';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    for (let x = 0; x < WIDTH; x += 22) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FLOOR);
    }
    for (let y = FLOOR; y > 0; y -= SIZE) {
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#344652';
    ctx.beginPath();
    ctx.moveTo(CENTER, 0);
    ctx.lineTo(CENTER, FLOOR);
    ctx.stroke();
    ctx.fillStyle = '#192630';
    ctx.fillRect(0, FLOOR, WIDTH, HEIGHT - FLOOR);
    ctx.strokeStyle = '#58717b';
    ctx.beginPath();
    ctx.moveTo(0, FLOOR);
    ctx.lineTo(WIDTH, FLOOR);
    ctx.stroke();

    const yGoal = FLOOR - goal * SIZE;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(0, yGoal);
    ctx.lineTo(WIDTH, yGoal);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillStyle = '#101820';
    ctx.fillRect(WIDTH - 70, yGoal - 19, 61, 16);
    ctx.fillStyle = color;
    ctx.fillText('META ' + goal, WIDTH - 64, yGoal - 8);

    for (const [x, y, active, stacked] of arena.frame()) {
      ctx.globalAlpha = active || stacked ? 1 : 0.62;
      ctx.fillStyle = color;
      ctx.fillRect(x - SIZE / 2, y - SIZE / 2, SIZE, SIZE);
      ctx.fillStyle = active ? '#13212a' : '#426368';
      ctx.fillRect(x - 4, y - 3, 2, 2);
      ctx.fillRect(x + 2, y - 3, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  const goalValue = () => inputs.goal.validity.valid ? inputs.goal.valueAsNumber : 8;

  function resetView() {
    cancelAnimationFrame(animation);
    const goal = goalValue();
    canvases.forEach((ctx, team) => draw(ctx, createArena(BASE, SEED, goal), goal, colors[team]));
    heights.forEach(node => { node.textContent = '—'; });
    times.forEach(node => { node.textContent = '—'; });
  }

  function invalidate() {
    learned = null;
    inputs.replay.disabled = true;
    inputs.baseline.disabled = true;
    select('results').hidden = true;
    status.textContent = 'Listo para entrenar.';
    resetView();
  }

  for (const [, title, explanation] of ATTRIBUTES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'attribute';
    const copy = document.createElement('span');
    copy.className = 'attr-copy';
    const desc = document.createElement('small');
    desc.textContent = explanation;
    copy.append(title, desc);
    const tag = document.createElement('span');
    button.append(copy, tag);
    const index = attributes.children.length;
    button.addEventListener('click', () => {
      if (selection.has(index)) selection.delete(index);
      else if (selection.size < 3) selection.add(index);
      else {
        status.textContent = 'Quita primero un atributo del equipo A para hacer el intercambio.';
        return;
      }
      invalidate();
      updateControls();
    });
    attributes.append(button);
  }

  function updateControls() {
    [...attributes.children].forEach((button, index) => {
      const isA = selection.has(index);
      const tag = button.lastElementChild;
      tag.className = 'tag ' + (isA ? 'cyan' : 'orange');
      tag.textContent = isA ? 'A' : 'B';
      button.setAttribute('aria-pressed', String(isA));
      button.disabled = worker !== null;
    });
    select('count-a').textContent = 'A ' + selection.size + '/3';
    select('count-b').textContent = 'B ' + (ATTRIBUTES.length - selection.size) + '/3';
    inputs.train.disabled = worker !== null || selection.size !== 3 || !inputs.goal.validity.valid;
    inputs.goal.disabled = worker !== null;
  }

  function showValues(profiles) {
    const rows = ATTRIBUTES.map(([key, title], index) => {
      const row = document.createElement('tr');
      const values = [title, format(BASE[key]), ...profiles.map(({ best }, team) => {
        const trained = selection.has(index) === (team === 0);
        return format(best[key]) + (trained ? '' : ' (fijo)');
      })];
      for (const [column, value] of values.entries()) {
        const cell = document.createElement(column === 0 ? 'th' : 'td');
        if (column === 0) cell.scope = 'row';
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    });
    select('values').replaceChildren(...rows);
    select('results').hidden = false;
  }

  function play(profiles, baseline = false) {
    cancelAnimationFrame(animation);
    const goal = goalValue();
    const arenas = profiles.map(profile => createArena(profile, SEED, goal));
    const summaries = () => arenas.map(arena => arena.result());
    let tick = 0;
    let start;
    status.textContent = baseline ? 'Reproduciendo el intento inicial.' : 'Reproduciendo el intento tras entrenar.';
    function frame(now) {
      start ??= now;
      const targetTick = Math.min(STEPS, Math.floor((now - start) * HZ / 1000));
      while (tick < targetTick) {
        for (const arena of arenas) arena.step();
        tick += 1;
      }
      const scores = summaries();
      canvases.forEach((ctx, team) => {
        draw(ctx, arenas[team], goal, colors[team]);
        heights[team].textContent = format(scores[team].peak);
        times[team].textContent = scores[team].firstGoal === null ? '—' :
          format(scores[team].firstGoal / HZ) + ' s';
      });
      if (tick < STEPS) {
        animation = requestAnimationFrame(frame);
        return;
      }
      const [a, b] = scores;
      if (baseline) {
        status.textContent = 'Intento inicial finalizado.';
      } else if (a.firstGoal !== b.firstGoal && (a.firstGoal !== null || b.firstGoal !== null)) {
        const winner = (a.firstGoal ?? Infinity) < (b.firstGoal ?? Infinity) ? 0 : 1;
        status.textContent = 'El equipo ' + teams[winner] + ' llegó primero a la meta.';
      } else if (a.firstGoal !== null || a.peak === b.peak) {
        status.textContent = 'Empate.';
      } else {
        status.textContent = 'El equipo ' + (a.peak > b.peak ? 'A' : 'B') + ' formó la pila más alta.';
      }
    }
    animation = requestAnimationFrame(frame);
  }

  function startTraining() {
    invalidate();
    const workerCode = ['matter', 'physics'].map(id => select(id).textContent).join('\n') +
      `\n self.onmessage = ({ data: { groups, goal, seed, rounds } }) => {
        const profiles = groups.map((indices, team) =>
          train(indices, goal, seed, rounds, current => postMessage({ done: team * rounds + current })));
        postMessage({ profiles });
      };`;
    const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    try {
      worker = new Worker(url);
    } catch {
      status.textContent = 'El navegador no pudo iniciar el entrenamiento.';
      return;
    } finally {
      URL.revokeObjectURL(url);
    }
    updateControls();
    progress.hidden = false;
    progress.value = 0;
    status.textContent = 'Probando combinaciones en las dos arenas…';
    const groups = [[], []];
    ATTRIBUTES.forEach((_, index) => groups[selection.has(index) ? 0 : 1].push(index));

    function finish() {
      worker.terminate();
      worker = null;
      progress.hidden = true;
      updateControls();
    }
    worker.onerror = () => {
      finish();
      status.textContent = 'El entrenamiento se interrumpió. Puedes volver a iniciarlo.';
    };
    worker.onmessage = ({ data }) => {
      if (!data.profiles) {
        progress.value = data.done;
        return;
      }
      finish();
      learned = data.profiles.map(({ best }) => best);
      inputs.replay.disabled = false;
      inputs.baseline.disabled = false;
      showValues(data.profiles);
      play(learned);
    };
    worker.postMessage({ groups, goal: goalValue(), seed: SEED, rounds: ROUNDS });
  }

  inputs.goal.addEventListener('input', () => { invalidate(); updateControls(); });
  inputs.train.addEventListener('click', startTraining);
  inputs.replay.addEventListener('click', () => play(learned));
  inputs.baseline.addEventListener('click', () => play([BASE, BASE], true));
  updateControls();
  resetView();
})();
