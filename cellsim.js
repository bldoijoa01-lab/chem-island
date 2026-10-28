// 칸 시뮬 연결 (19단계, DESIGN.md §4-29): cells.js(열 전도·기체 확산·밀도층)를 옆면 게임의 땅·장치·화면에 잇는다.
// 하는 일: ① 플레이어 둘레 96×64칸 창을 환경 값으로 시작해 계산(4 Hz) ② 땅 파기·블록·문 편집을 기체 몰수·에너지 보존 규칙으로 반영(Grid.convert)
// ③ 장치가 읽는 외기 기온·압력·조성을 칸에서 받는 고리(World.cellHooks.temp, Sim.geo.pressure·airMix) ④ 온도·압력·분압 지도 겹쳐 보기, 눈금자, 칸 값 읽기 말풍선.
// 기본은 꺼짐(선택 기능): 꺼져 있으면 모든 고리가 undefined를 돌려줘 옛 계산 그대로다. 칸 상태는 저장하지 않고 서버에도 보내지 않는다(시계 담당 팀원 한 명만 계산).
// 값(온도·압력·분압·재료 성질)은 화면에서 새로 계산하지 않고 cells.js(Grid.probe)와 chem.js(MATERIALS·GAS_TABLE)에서만 읽는다. 모든 수치·범위는 가정(임의값)이다.
window.CellSim = (() => {
  const C = Chem, K = Cells.KIND, G = C.GASES, T16 = 16;
  const W = 96, H = 64, MARGIN = 14, SNAP = 16;   // 가정(임의값): 계산 창 96×64칸, 플레이어가 가장자리 14칸 안으로 오면 16칸 단위로 창을 옮긴다
  const STEP_MS = 250, SUBSTEP_MAX = 6, SUBSTEP_S = 1800;   // 4 Hz, 한 번에 최대 6걸음(걸음당 시뮬 시간 약 1800초 이하로 쪼갬)
  const SCALES = [10, 60, 300];   // 시간 배율 후보(DESIGN §4-29): 사실적 / 기본 / 빠름. D_GAS는 그대로고 시간만 키운다
  const RANGES = {   // 눈금자 범위(가정(임의값)): 색 눈금의 양 끝
    temp: { min: -20, max: 100, unit: '℃', label: '온도' },
    press: { min: 0, max: 3, unit: 'atm', label: '총압' },
    gas: { min: 0, max: 1.5, unit: 'atm', label: '분압' },
    po2: { min: 0, max: 0.3, unit: 'atm', label: 'O₂ 분압(호흡)', mark: C.BREATH_PO2 },   // 12-a: 눈금 0~0.30 atm(가정), 호흡 기준 0.16 atm에 표시선
  };
  const STOPS = [[0, [43, 92, 255]], [0.25, [43, 208, 255]], [0.5, [91, 227, 122]], [0.75, [255, 216, 74]], [1, [255, 74, 43]]];   // 파랑 → 하늘 → 초록 → 노랑 → 빨강
  const rampRgb = (u) => {
    u = Math.max(0, Math.min(1, u));
    for (let i = 1; i < STOPS.length; i++) if (u <= STOPS[i][0]) { const [u0, a] = STOPS[i - 1], [u1, b] = STOPS[i], f = (u - u0) / (u1 - u0); return a.map((v, k) => Math.round(v + (b[k] - v) * f)); }
    return STOPS[STOPS.length - 1][1];
  };
  const PO2_STOPS = [[0, [200, 40, 40]], [0.35, [255, 140, 60]], [C.BREATH_PO2 / 0.3, [255, 216, 74]], [0.7, [91, 227, 122]], [1, [43, 208, 255]]];   // 12-a: 기준 미만은 붉은 쪽, 이상은 초록 쪽(가정)
  const rampOf = (stops, u) => { u = Math.max(0, Math.min(1, u)); for (let i = 1; i < stops.length; i++) if (u <= stops[i][0]) { const [u0, a] = stops[i - 1], [u1, b] = stops[i], f = (u - u0) / (u1 - u0); return a.map((v, k) => Math.round(v + (b[k] - v) * f)); } return stops[stops.length - 1][1]; };
  const lutOf = (stops) => Array.from({ length: 65 }, (_, i) => { const c = rampOf(stops, i / 64); return `rgb(${c[0]},${c[1]},${c[2]})`; });
  const LUT = lutOf(STOPS), LUT_PO2 = lutOf(PO2_STOPS);
  const GAS_KO = { N2: 'N₂', O2: 'O₂', He: 'He', H2O: '수증기' };
  const KEY = 'chemisle_cells_v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: st.on, mode: st.mode, gas: st.gas, scale: st.scale, breath: st.breath })); } catch { /* 저장 불가 */ } };
  const st = Object.assign({ on: false, mode: 'normal', gas: 'O2', scale: C.CELL_SCALE_DEFAULT, breath: true }, load());
  if (!['normal', 'temp', 'press', 'gas', 'po2'].includes(st.mode)) st.mode = 'normal';
  if (!SCALES.includes(st.scale)) st.scale = C.CELL_SCALE_DEFAULT;
  if (!G.includes(st.gas)) st.gas = 'O2';
  st.on = false;   // 꺼진 채로 시작한다(켜는 것은 이번 접속에서 사람이 한다)

  const breath = { po2: null, ok: true };   // 12-a: 플레이어가 선 칸의 O₂ 분압과 숨 쉴 수 있는지(칸 시뮬이 켜져 있고 호흡이 켜져 있을 때 갱신)
  let quiz = null;
  let grid = null, ox = 0, oy = 0, lastMin = null, tickN = 0, lastEditSay = 0, lastEditLog = 0, status = '';
  const stats = { stepMs: 0, drawMs: 0, steps: 0, rebuilds: 0, mismatches: 0 };
  const S = () => Store.S, T = () => World.T;

  // ---- 타일 → 칸 종류 (DESIGN §4-29 표) ----
  function kindOf(id) {
    if (id === World.AIR || id === World.HATCH || id === World.VENT || id === World.DOOR_OPEN) return 'AIR';
    if (id === World.WATER) return 'WATER';
    if (id === World.DIRT || id === World.GRASS) return 'DIRT';
    if (id === World.SAND) return 'SAND';
    if (id === World.ICE || id === World.SNOWTOP) return 'ICE';
    if (id === World.IRON || id === World.GOLD || id === World.HULL || id === World.DOOR) return 'METAL';
    return 'ROCK';
  }
  let building = false;   // 환경 시작값을 만드는 동안 World.ambientAt이 칸 온도를 다시 부르지 않게 한다
  const ambient = (x, y) => { building = true; try { return World.ambientAt(S(), null, x, y); } finally { building = false; } };
  const envMix = (x, y) => { const f = World.getChunk(x >> 5, y >> 5).feat; return f && f.kind === 'gas' && f.gas && x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1 + 1 ? f.gas : Cells.AIR_MIX; };
  // 칸 (x, y)(월드 칸 좌표)를 환경 값으로 채운다
  function initCell(g, lx, ly, bx, by) {
    const x = bx + lx, y = by + ly, id = World.tileAt(x, y), k = kindOf(id), Tc = ambient(x, y);
    g.set(lx, ly, k, Tc, k === 'AIR' ? Cells.airMoles(Sim.ENV.start.P, Tc, envMix(x, y)) : undefined);
  }
  function build(nox, noy) {
    const g = new Cells.Grid(W, H), old = grid;
    for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++) {
      const wx = nox + lx, wy = noy + ly, olx = wx - ox, oly = wy - oy;
      if (old && olx >= 0 && oly >= 0 && olx < W && oly < H) {   // 겹치는 칸은 상태를 그대로 옮긴다(창 밖으로 나간 칸만 버려진다)
        const a = old.idx(olx, oly), b = g.idx(lx, ly);
        g.kind[b] = old.kind[a]; g.T[b] = old.T[a]; g.pin[b] = old.pin[a];
        for (let s = 0; s < G.length; s++) g.n[b * G.length + s] = old.n[a * G.length + s];
      } else initCell(g, lx, ly, nox, noy);
    }
    if (old) { g.heaterJ = old.heaterJ; g.ledger = old.ledger; g.released = old.released; g.time = old.time; g.steps = old.steps; }
    ox = nox; oy = noy; grid = g; stats.rebuilds++;
  }
  const playerTile = () => [Math.floor((S().px + World.PW / 2) / T16), Math.floor((S().py + World.PH / 2) / T16)];
  const snap = (v) => Math.floor(v / SNAP) * SNAP;
  function placeWindow() {
    const [px, py] = playerTile();
    if (!grid) return build(snap(px - W / 2), snap(py - H / 2));
    const lx = px - ox, ly = py - oy;
    if (lx < MARGIN || ly < MARGIN || lx >= W - MARGIN || ly >= H - MARGIN) build(snap(px - W / 2), snap(py - H / 2));
  }
  const inWin = (x, y) => grid && x >= ox && y >= oy && x < ox + W && y < oy + H;
  const here = () => Sim.dockOf(S()).island === 'start' && World.isInfinite();

  // ---- 편집 (땅 파기·블록 놓기·문 열고 닫기): 기체 몰수·내부 에너지 보존, 갇힌 칸은 방출 장부 ----
  function say(text) { Sim.say(text); }
  function applyEdit(lx, ly, newId) {
    const nk = kindOf(newId); if (grid.kind[grid.idx(lx, ly)] === K[nk]) return null;
    const rec = grid.convert(lx, ly, nk), now = Date.now();
    if (rec.type === 'solidify' && rec.lostMoles > 0) say(`갇힌 기체 ${rec.lostMoles.toFixed(2)} mol이 빠져나갔어요(게임 설정, 가정).`);
    else if (rec.type === 'excavate' && now - lastEditSay > 8000) { lastEditSay = now; say('땅을 파서 빈 칸이 늘면 같은 기체가 더 넓게 퍼져 압력이 내려갑니다. 기체를 보충하려면 기체가 있는 빈 공간(가스 포켓)과 이으세요.'); }
    if ((rec.receivers > 0 || rec.lostMoles > 0) && now - lastEditLog > 3000) {
      lastEditLog = now;
      Sim.logEv(S(), '칸 시뮬', rec.type === 'solidify' ? (rec.lostMoles > 0 ? `갇힌 칸이 막혀 기체 ${rec.lostMoles.toFixed(2)} mol이 외기로 빠짐(방출 장부)` : `막힌 칸의 기체를 이웃 ${rec.receivers}칸에 나눠 옮김(몰수·에너지 보존)`) : '빈 칸 +1: 진공(몰수 불변, 같은 기체가 더 넓게 퍼져 압력 하락)');
    }
    return rec;
  }
  function onEdit(x, y, oldId, newId) { if (!st.on || !grid || !inWin(x, y)) return; applyEdit(x - ox, y - oy, newId); }
  // 다른 팀원이 바꾼 땅·불러오기로 창과 월드가 어긋나면 1초마다 맞춘다(많이 어긋나면 환경에서 다시 시작)
  function resync() {
    let bad = 0;
    for (let ly = 0; ly < H; ly++) for (let lx = 0; lx < W; lx++) {
      const want = K[kindOf(World.tileAt(ox + lx, oy + ly))];
      if (grid.kind[grid.idx(lx, ly)] !== want) { bad++; if (bad <= 200) applyEdit(lx, ly, World.tileAt(ox + lx, oy + ly)); }
    }
    stats.mismatches = bad;
    if (bad > 200) { grid = null; placeWindow(); }
  }

  // ---- 화덕 열원: 불이 타는 동안 화덕 아래 두 칸을 고정 온도 칸으로(열원 입력 장부) ----
  function setPins() {
    grid.pin.fill(NaN);
    for (const d of S().placed) {
      if (d.id !== 'fire' || (d.pl || 'start') !== 'start' || !d.s || d.s.broken || !(d.s.level > 0) || !(d.s.fuel > 0)) continue;
      for (const x of [d.x, d.x + 1]) if (inWin(x, d.y + 2)) { const i = grid.idx(x - ox, d.y + 2 - oy); if (!Cells.PROP[grid.kind[i]].open) grid.pin[i] = Sim.FIRE_T[d.s.level]; }
    }
  }

  // ---- 시계 담당: 혼자면 나, 팀이면 쓰기 임대를 가진 사람만 계산한다 ----
  const canCompute = () => !(window.Team && Team.inParty() && !Team.canAdvance());

  function tick() {
    if (!st.on) return;
    if (!here()) { status = '칸 시뮬은 내 월드에서만 켜져요.'; return; }
    if (!canCompute()) { status = '시계 담당 팀원이 계산해요.'; return; }
    status = '';
    if (Store.paused) return;
    placeWindow();
    if (tickN++ % 4 === 0) { resync(); }
    setPins();
    const min = S().day * 1440 + S().min;
    if (lastMin === null) { lastMin = min; return; }
    const game = (min - lastMin) * 60; lastMin = min;
    if (!(game > 0)) { updateBreath(); refreshTip(); refreshUI(); return; }
    const dt = game * st.scale, n = Math.min(SUBSTEP_MAX, Math.max(1, Math.ceil(dt / SUBSTEP_S))), t0 = performance.now();
    const [btx, bty] = playerTile(), gameMin = game / 60;
    for (let i = 0; i < n; i++) {
      if (st.breath && inWin(btx, bty)) grid.remove(btx - ox, bty - oy, 'O2', C.BREATH_O2_MOL_PER_MIN * gameMin / n);   // 호흡: 게임 시간 기준(칸 시뮬 시간 배율은 곱하지 않는다)
      grid.step(dt / n);
    }
    stats.stepMs = performance.now() - t0; stats.steps++;
    updateBreath(); if (quiz && quiz.status === 'running') checkQuiz(min);
    refreshTip(); refreshUI();
  }
  setInterval(tick, STEP_MS);

  // ---- 읽기: 칸 값(말풍선·시험이 같이 쓴다) ----
  function probe(tx, ty) {
    const id = World.tileAt(tx, ty), key = World.TILE_KEY[id] || null, o = { tx, ty, id, key, props: key ? C.matProps(key) : null, inWindow: false, cell: null };
    if (st.on && grid && inWin(tx, ty)) { o.inWindow = true; o.cell = grid.probe(tx - ox, ty - oy); }
    return o;
  }
  const f3 = (v) => v.toFixed(3), f1 = (v) => v.toFixed(1);
  function tipLines(o) {
    const nm = o.props ? o.props.ko : (o.id === World.HATCH ? '코어 해치' : '빈 칸(공기)');
    const lines = [`<b>${nm}</b>${o.cell ? ' · ' + (o.cell.open ? '열린 칸(기체가 있을 수 있음)' : '닫힌 칸(고체·액체)') : ''}`];
    if (!o.cell) { lines.push('<span class="mut">칸 시뮬 계산 범위 밖이에요(옛 구역 값을 씁니다).</span>'); return lines; }
    lines.push(`온도 ${f1(o.cell.T)} ℃`);
    if (o.cell.open) {
      lines.push(`총압 ${f3(o.cell.P)} atm` + (o.cell.n === 0 ? ' (진공)' : ''));
      if (st.breath && o.cell.n > 0) lines.push(C.breathable(o.cell.partial.O2) ? `호흡: 숨 쉴 수 있음 (P_O₂ ≥ ${C.BREATH_PO2} atm, 게임 설정(가정))` : `<span class="warn">호흡: 숨이 차요 (P_O₂ < ${C.BREATH_PO2} atm, 게임 설정(가정))</span>`);
      if (o.cell.n > 0) lines.push(G.map(g => `${GAS_KO[g]} ${f3(o.cell.partial[g])} atm (${f1(o.cell.frac[g] * 100)} %)`).join('<br>'));
    } else if (o.props) lines.push(`밀도 ${o.props.rho} g/cm³ · 비열 ${(+o.props.c).toFixed(2)} J/(g·K) · 열전도율 ${o.props.k} W/(m·K)`);
    return lines;
  }

  // ---- 장치·온도계가 읽는 고리 ----
  const cellAt = (d) => {   // d = 장치(있으면 그 자리) 아니면 플레이어 자리의 열린 기체 칸 probe, 없으면 null
    if (!st.on || !grid || !here() || (d && (d.pl || 'start') !== 'start')) return null;
    const [x, y] = d ? [d.x, d.y] : playerTile();
    if (!inWin(x, y)) return null;
    const p = grid.probe(x - ox, y - oy); return p.open && p.n > 0 ? p : null;
  };
  function install() {
    World.cellHooks.temp = (x, y) => { if (building || !st.on || !grid || !inWin(x, y) || !here()) return undefined; const p = grid.probe(x - ox, y - oy); return p.open && p.n > 0 ? p.T : undefined; };
    World.cellHooks.edit = onEdit;
    World.cellHooks.speed = () => (st.on && st.breath && grid && !breath.ok && here()) ? C.BREATH_SLOW : 1;   // 12-a: 기준 미만이면 걷는 속도 ×0.5
    Sim.geo.pressure = (S_, d) => { const p = cellAt(d); return p && p.P >= 0.01 ? p.P : undefined; };   // 0.01 atm 미만(막 판 진공)은 장치 계산을 보호하려고 옛 값을 쓴다(가정)
    Sim.geo.airMix = (S_, d) => { const p = cellAt(d); return p && p.P >= 0.01 ? Object.assign({}, p.frac) : undefined; };
  }
  function uninstall() { World.cellHooks.temp = null; World.cellHooks.edit = null; World.cellHooks.speed = null; Sim.geo.pressure = undefined; Sim.geo.airMix = undefined; }

  // ---- 켜고 끄기 ----
  function setOn(v) {
    v = !!v; if (v === st.on) return; st.on = v; save();
    if (v) { grid = null; lastMin = null; tickN = 0; install(); if (here()) placeWindow(); if (!S().f.oxyGift) { S().f.oxyGift = true; S().inv.oxystone = (S().inv.oxystone || 0) + C.OXY_GIFT; say(`산소석 ${C.OXY_GIFT}개를 받았어요(게임 설정, 가정). 가방의 산소석을 누르면 O₂가 나와요.`); } say('칸 지도를 켰어요. 열·기체가 칸마다 계산됩니다(게임 설정, 시간 배율 ×' + st.scale + ').'); }
    else { uninstall(); grid = null; lastMin = null; quiz = null; breath.po2 = null; breath.ok = true; say('칸 지도를 껐어요. 장치는 옛 구역 값으로 계산합니다.'); }
    refreshUI(); refreshTip();
  }
  function setBreath(v) { st.breath = !!v; save(); if (!st.breath) { breath.ok = true; quiz = null; } refreshUI(); }
  function setMode(m, gas) { if (!['normal', 'temp', 'press', 'gas', 'po2'].includes(m)) return; st.mode = m; if (gas && G.includes(gas)) st.gas = gas; save(); refreshUI(); }
  function setScale(v) { if (SCALES.includes(+v)) { st.scale = +v; save(); refreshUI(); } }

  // ---- 그리기: 지도 색 덧칠(보이는 칸만) ----
  const valueOf = (p) => st.mode === 'temp' ? p.T : st.mode === 'press' ? p.P : st.mode === 'po2' ? p.partial.O2 : p.partial[st.gas];
  function draw(ctx, cam, VW, VH, t) {
    if (!st.on || !grid || !here()) return;
    const t0 = performance.now(), R = RANGES[st.mode === 'normal' ? 'temp' : st.mode];
    const x0 = Math.max(ox, Math.floor(cam.x / T16)), y0 = Math.max(oy, Math.floor(cam.y / T16)), x1 = Math.min(ox + W - 1, Math.floor((cam.x + VW) / T16)), y1 = Math.min(oy + H - 1, Math.floor((cam.y + VH) / T16));
    if (st.mode !== 'normal') {
      ctx.globalAlpha = 0.52;
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const i = grid.idx(tx - ox, ty - oy), open = Cells.PROP[grid.kind[i]].open;
        if (st.mode !== 'temp' && !open) continue;
        const p = grid.probe(tx - ox, ty - oy), u = (valueOf(p) - R.min) / (R.max - R.min);
        ctx.fillStyle = (st.mode === 'po2' ? LUT_PO2 : LUT)[Math.max(0, Math.min(64, Math.round(u * 64)))]; ctx.fillRect(tx * T16 - cam.x, ty * T16 - cam.y, T16, T16);
      }
      ctx.globalAlpha = 1;
    }
    // 창 가장자리(계산 범위)를 옅게 표시
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([4, 4]); ctx.strokeRect(ox * T16 - cam.x + 0.5, oy * T16 - cam.y + 0.5, W * T16 - 1, H * T16 - 1); ctx.setLineDash([]);
    const m = window.SideGame && SideGame.mouseTile ? SideGame.mouseTile() : null;
    if (m && inWin(m[0], m[1])) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1; ctx.strokeRect(m[0] * T16 - cam.x + 0.5, m[1] * T16 - cam.y + 0.5, T16 - 1, T16 - 1); }
    stats.drawMs = performance.now() - t0;
  }

  // ---- DOM: 모드 단추 줄, 색 눈금자(범례) + 문구, 칸 값 말풍선 ----
  const $ = (id) => document.getElementById(id);
  const bar = document.createElement('div'); bar.id = 'cells-modes'; bar.hidden = true;
  const legend = document.createElement('div'); legend.id = 'cells-legend'; legend.hidden = true;
  const tip = document.createElement('div'); tip.id = 'cells-tip'; tip.hidden = true;
  document.body.append(bar, legend, tip);
  bar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; setMode(b.dataset.m, b.dataset.g); });
  const rangeText = (R, v) => (R.unit === '℃' ? v : v.toFixed(1)) + ' ' + R.unit;
  function refreshUI() {
    const show = st.on && $('title').hidden && here();
    bar.hidden = !show; legend.hidden = !show || st.mode === 'normal';
    if (!show) { tip.hidden = true; return; }
    const modes = [['normal', '일반'], ['temp', '온도'], ['press', '압력'], ['gas', '기체(분압)'], ['po2', 'O₂(호흡)']];
    const po2 = st.breath && breath.po2 !== null ? `<span class="po2 ${breath.ok ? 'ok' : 'bad'}">P_O₂ ${breath.po2.toFixed(3)} atm ${breath.ok ? '' : '— 숨이 차요(기준 ' + C.BREATH_PO2 + ' atm 미만, 이동 느려짐)'}</span>` : '';
    bar.innerHTML = '<span class="mut">칸 지도</span>' + modes.map(([m, n]) => `<button data-m="${m}" class="${st.mode === m ? 'on' : ''}">${n}</button>`).join('')
      + (st.mode === 'gas' ? '<span class="sep"></span>' + G.map(g => `<button data-m="gas" data-g="${g}" class="${st.gas === g ? 'on' : ''}">${GAS_KO[g]}</button>`).join('') : '')
      + po2 + (quiz && quiz.status === 'running' ? '<span class="mut">예측 퀴즈 진행 중</span>' : '')
      + `<span class="mut st">${status || '시간 배율 ×' + st.scale + ' (게임 설정, 가정)'}</span>`;
    if (st.mode === 'normal') return;
    const R = RANGES[st.mode], title = st.mode === 'gas' ? `${GAS_KO[st.gas]} 분압 (${R.unit})` : `${R.label} (${R.unit})`;
    const ticks = [1, 0.75, 0.5, 0.25, 0].map(u => `<span>${rangeText(R, R.min + (R.max - R.min) * u)}</span>`).join('');
    const stops = st.mode === 'po2' ? PO2_STOPS : STOPS;
    const grad = `linear-gradient(to top, ${stops.map(([u, c]) => `rgb(${c.join(',')}) ${u * 100}%`).join(', ')})`;
    const mark = R.mark !== undefined ? `<b class="mark" style="bottom:${(R.mark - R.min) / (R.max - R.min) * 100}%">◀ 호흡 기준 ${R.mark} atm</b>` : '';
    const N = Cells.NOTES;
    legend.innerHTML = `<b>${title}</b><div class="ruler"><i style="background:${grad}"></i><div class="ticks">${ticks}</div>${mark}</div>`
      + `<div class="cnote">눈금 범위 ${rangeText(R, R.min)} ~ ${rangeText(R, R.max)}는 게임 설정(가정)이에요. 범위 밖은 양 끝 색으로 보입니다.</div>`
      + (st.mode === 'po2' ? `<div class="cnote">${BREATH_NOTE}</div>` : '')
      + `<div class="cnote"><b>밀도층</b> ${N.layer}</div><div class="cnote">${N.scope}</div>`;
  }
  function refreshTip() {
    if (!st.on || !$('title').hidden || !$('modal').hidden || !here() || !window.SideGame || !SideGame.mouseTile) { tip.hidden = true; return; }
    if (!hover.in) { tip.hidden = true; return; }
    const [tx, ty] = SideGame.mouseTile(), o = probe(tx, ty);
    tip.innerHTML = tipLines(o).join('<br>') + '<br><span class="mut">값은 칸 시뮬 계산(게임 설정, 가정)</span>';
    tip.hidden = false;
    const r = tip.getBoundingClientRect(); let x = hover.x + 14, y = hover.y + 14;
    if (x + r.width > window.innerWidth - 4) x = hover.x - r.width - 14; if (y + r.height > window.innerHeight - 4) y = hover.y - r.height - 14;
    tip.style.left = Math.max(2, x) + 'px'; tip.style.top = Math.max(2, y) + 'px';
  }
  const hover = { x: 0, y: 0, in: false };
  const cv = $('cv');
  if (cv) {
    cv.addEventListener('mousemove', (e) => { hover.x = e.clientX; hover.y = e.clientY; hover.in = true; if (st.on) refreshTip(); });
    cv.addEventListener('mouseleave', () => { hover.in = false; tip.hidden = true; });
  }

  // ---- 12-a 호흡: 판정·방 찾기·산소석·예측 퀴즈 (DESIGN §4-32) ----
  const BREATH_NOTE = `호흡 기준 P_O₂ ≥ ${C.BREATH_PO2} atm(해수면 0.21 atm), 한 사람이 게임 1분에 O₂ ${C.BREATH_O2_MOL_PER_MIN} mol을 쓰는 것은 모두 게임 설정(가정)이에요. 12-a에서는 호흡이 O₂만 줄이고 생기는 CO₂는 아직 세지 않아 총압이 조금 내려갑니다(한계). 팀에서는 시계 담당의 호흡만 계산해요.`;
  function updateBreath() {
    const [x, y] = playerTile(); if (!st.on || !grid || !inWin(x, y)) return;
    const p = grid.probe(x - ox, y - oy); breath.po2 = p.open ? p.partial.O2 : 0; breath.ok = !st.breath || C.breathable(breath.po2);
  }
  // 플레이어가 선 칸과 이어진 열린 칸(방) 덩어리: 칸 수, O₂·전체 몰수, 평균 온도, 창 가장자리에 닿으면 closed = false
  function roomInfo() {
    if (!st.on || !grid) return null;
    const [px, py] = playerTile(); if (!inWin(px, py)) return null;
    const start = grid.idx(px - ox, py - oy); if (!Cells.PROP[grid.kind[start]].open) return null;
    const seen = new Uint8Array(grid.N), stack = [start]; seen[start] = 1;
    let cells = 0, nO2 = 0, nTot = 0, edge = false, tSum = 0, tW = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i - x) / W; cells++;
      nO2 += grid.n[i * G.length + G.indexOf('O2')]; const nt = grid.nTot(i); nTot += nt; tSum += grid.T[i] * nt; tW += nt;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !seen[j]) { const p = Cells.PROP[grid.kind[j]]; if (p.open && !p.fixed) { seen[j] = 1; stack.push(j); } }
    }
    const Tc = tW > 0 ? tSum / tW : 12, V = cells * C.V_CELL;
    return { cells, V, nO2, nTot, Tc, closed: !edge, po2: C.poO2(nO2, V, Tc), pred: C.minutesToPO2(nO2, V, Tc) };
  }
  // 산소석: 플레이어 칸에 O₂와 반응열을 넣는다
  function useOxystone() {
    if (!st.on || !grid || !here()) { say('산소석은 칸 지도를 켠 뒤에 쓸 수 있어요(O₂가 방의 칸에 퍼집니다).'); return false; }
    if (!((S().inv.oxystone || 0) >= 1)) { say('산소석이 없어요.'); return false; }
    const [px, py] = playerTile(); if (!inWin(px, py) || !grid.inject(px - ox, py - oy, 'O2', C.OXY_MOL_O2, C.oxyHeatJ())) { say('열린 칸에서만 쓸 수 있어요.'); return false; }
    S().inv.oxystone--;
    Sim.logEv(S(), '산소석', `O₂ ${C.OXY_MOL_O2} mol 방출, 반응열 ${(C.oxyHeatJ() / 1000).toFixed(1)} kJ (2 NaClO₃ → 2 NaCl + 3 O₂)`);
    say(`산소석을 썼어요: O₂ ${C.OXY_MOL_O2} mol과 열 ${(C.oxyHeatJ() / 1000).toFixed(1)} kJ가 이 칸에 나왔어요(게임 설정, 가정). 곧 방으로 퍼집니다.`);
    updateBreath(); return true;
  }
  // 예측 퀴즈: 방 평균 P_O₂가 0.16 atm 아래로 내려가는 데 걸리는 게임 시간(분)을 맞힌다
  function startQuiz(guessMin) {
    const r = roomInfo(); guessMin = +guessMin;
    if (!st.on || !st.breath) return { ok: false, msg: '칸 지도와 호흡이 켜져 있어야 해요.' };
    if (!r) return { ok: false, msg: '열린 칸에 서 있어야 해요.' };
    if (!r.closed) return { ok: false, msg: '닫힌 방이 아니에요(창 가장자리까지 열려 있어요). 문·블록으로 방을 막아 보세요.' };
    if (!(guessMin > 0)) return { ok: false, msg: '분 단위의 양수를 적어 주세요.' };
    if (r.po2 < C.BREATH_PO2) return { ok: false, msg: `이 방은 이미 P_O₂ ${r.po2.toFixed(3)} atm으로 기준 미만이에요. 산소석을 쓰고 다시 해 보세요.` };
    quiz = { guess: guessMin, startMin: S().day * 1440 + S().min, room: r, status: 'running', prev: { t: S().day * 1440 + S().min, p: r.po2 }, result: null };
    refreshUI(); return { ok: true, msg: `예측 ${guessMin} 분을 기록했어요. 시간이 흘러 방 평균 P_O₂가 ${C.BREATH_PO2} atm 아래로 내려가면 맞혔는지 알려 줘요.`, pred: r.pred };
  }
  function checkQuiz(min) {
    const r = roomInfo(); if (!r) return;
    const p = r.po2, prev = quiz.prev;
    if (p < C.BREATH_PO2) {
      const f = prev.p > p ? (prev.p - C.BREATH_PO2) / (prev.p - p) : 1, t = prev.t + (min - prev.t) * f, el = t - quiz.startMin, err = Math.abs(el - quiz.guess) / el;
      quiz.status = 'done'; quiz.result = { elapsed: el, err, ok: err <= C.QUIZ_TOL, pred: quiz.room.pred, changed: Math.abs(r.V - quiz.room.V) > 1e-6 || r.nO2 > quiz.room.nO2 };
      if (quiz.result.ok) { S().inv.oxystone = (S().inv.oxystone || 0) + C.OXY_QUIZ_REWARD; }
      const txt = `예측 퀴즈: 예측 ${quiz.guess} 분, 실제 ${el.toFixed(1)} 분(오차 ${(err * 100).toFixed(1)} %, 식 값 ${quiz.room.pred.toFixed(1)} 분). ${quiz.result.ok ? '오차 ' + C.QUIZ_TOL * 100 + ' % 이하 — 맞혔어요! 산소석 ' + C.OXY_QUIZ_REWARD + '개(게임 설정, 가정)' : '아쉬워요' + (quiz.result.changed ? ' — 도중에 방의 부피나 O₂가 바뀌어 식 값과 달라졌어요' : '')}`;
      Sim.logEv(S(), '예측 퀴즈', txt); say(txt); refreshUI(); return;
    }
    quiz.prev = { t: min, p };
    if (min - quiz.startMin > 3000) { quiz.status = 'expired'; say('예측 퀴즈가 끝났어요: 방 평균 P_O₂가 기준 아래로 내려가지 않았어요(방이 열렸거나 O₂가 보충됐어요).'); refreshUI(); }
  }

  // ---- 칸 지도 창(HUD [칸 지도]) ----
  function open() {
    const ledger = grid ? grid.ledger.slice(-5).reverse().map(r => `<li>${r.type === 'solidify' ? '막음' : r.type === 'excavate' ? '팜' : '바뀜'} (${r.x + ox}, ${r.y + oy}): 기체 ${r.dMoles.toFixed(3)} mol, 고체 에너지 ${r.dSolidE.toFixed(0)} J${r.lostMoles ? `, 방출 ${r.lostMoles.toFixed(3)} mol` : ''}</li>`).join('') : '';
    const N = Cells.NOTES, spec = World.SPECIAL;
    UI.openModal('칸 지도 (열·기체 시뮬레이션)', `<div class="box">
      <p>땅을 파고 방을 만들면 <b>열(전도)</b>과 <b>기체(확산·밀도층)</b>가 칸마다 계산됩니다. 화덕을 피우면 아래 두 칸이 열원이 되어 방이 데워지고, 환기구·문으로 방을 잇거나 막을 수 있어요.</p>
      <div class="row"><button id="cs-on">${st.on ? '칸 지도 끄기' : '칸 지도 켜기'}</button><span class="mut"> ${st.on ? (status || '계산 중 (96×64칸 창, 4 Hz)') : '꺼짐: 장치는 옛 구역 값으로 계산해요.'}</span></div>
      <p>지도: ${[['normal', '일반'], ['temp', '온도'], ['press', '압력'], ['gas', '기체(분압)'], ['po2', 'O₂(호흡)']].map(([m, n]) => `<button class="cs-m ${st.mode === m ? 'on' : ''}" data-m="${m}">${n}</button>`).join(' ')}</p>
      <p>시간 배율: ${SCALES.map(v => `<button class="cs-s ${st.scale === v ? 'on' : ''}" data-s="${v}">×${v}${v === 10 ? ' 사실적' : v === 60 ? ' 기본' : ' 빠름'}</button>`).join(' ')} <span class="mut">(게임 설정, 가정: 흐른 게임 시간 × 배율만큼 시뮬레이션. 확산 계수는 그대로)</span></p>
      <div class="warnbox"><b>호흡 (12-a)</b> <button id="cs-breath">${st.breath ? '호흡 끄기' : '호흡 켜기'}</button> ${BREATH_NOTE}
        ${(() => { const r = roomInfo(); return r ? `<p>내 방: ${r.closed ? '닫힌 방' : '<b>닫힌 방이 아니에요(창 가장자리까지 열림)</b>'} · 부피 ${r.V.toFixed(0)} L · O₂ ${r.nO2.toFixed(2)} mol · 평균 ${r.Tc.toFixed(1)} ℃ · 방 평균 P_O₂ ${r.po2.toFixed(3)} atm</p>` : '<p class="mut">열린 칸에 서 있으면 방 정보가 나와요.</p>'; })()}
        <p><b>산소 예측 퀴즈</b>: 방 평균 P_O₂가 ${C.BREATH_PO2} atm 아래로 내려가기까지 게임 시간으로 몇 분 걸릴까요? (식: t = (n_O₂ − 기준 몰수)/소비율, 오차 ${C.QUIZ_TOL * 100} % 이하면 성공) <input id="cs-guess" type="number" min="1" step="1" style="width:70px"> 분 <button id="cs-quiz">예측 확인</button> <span id="cs-quizmsg" class="mut">${quiz ? (quiz.status === 'running' ? '진행 중(예측 ' + quiz.guess + ' 분)' : quiz.result ? '지난 결과: 예측 ' + quiz.guess + ' 분, 실제 ' + quiz.result.elapsed.toFixed(1) + ' 분, ' + (quiz.result.ok ? '성공' : '실패') : '') : ''}</span></p>
        <p class="mut">산소석 ${Math.floor(S().inv.oxystone || 0)}개 보유(가방의 산소석 칸을 누르면 사용)</p></div>
      <p>놓기: <button id="cs-vent">환기구 (${Object.entries(spec.vent.cost).map(([k, v]) => World.ITEM[k][1] + ' ' + v).join(' + ')})</button> <button id="cs-door">문 (${Object.entries(spec.door.cost).map(([k, v]) => World.ITEM[k][1] + ' ' + v).join(' + ')})</button> <span class="mut">땅에 닿은 빈 칸을 클릭. 문은 클릭해서 열고 닫아요.</span></p>
      <div class="warnbox"><b>밀도층</b> ${N.layer}<br><b>열 전도</b> ${N.heat}<br><b>확산</b> ${N.diffusion}<br>${N.energy}<br><b>편집</b> ${N.edit}<br>${N.scope}<br>한계: 칸 시뮬은 저장하지 않고(켤 때마다 환경에서 시작), 창 밖은 계산하지 않으며, 팀에서는 시계 담당 한 명만 계산해요.</div>
      ${grid ? `<p class="mut">열원 입력 장부 ${grid.heaterJ.toFixed(0)} J · 방출 장부 ${grid.released.moles.toFixed(3)} mol</p><ul>${ledger}</ul>` : ''}</div>`);
    $('cs-on').onclick = () => { setOn(!st.on); open(); };
    document.querySelectorAll('.cs-m').forEach(b => b.onclick = () => { setMode(b.dataset.m); open(); });
    document.querySelectorAll('.cs-s').forEach(b => b.onclick = () => { setScale(b.dataset.s); open(); });
    $('cs-breath').onclick = () => { setBreath(!st.breath); open(); };
    $('cs-quiz').onclick = () => { const r = startQuiz($('cs-guess').value); open(); $('cs-quizmsg').textContent = r.msg + (r.pred !== undefined ? '' : ''); };
    $('cs-vent').onclick = () => arm('vent'); $('cs-door').onclick = () => arm('door');
  }
  function arm(kind) { if (!st.on) setOn(true); if (window.SideGame && SideGame.setMode) SideGame.setMode('special:' + kind, `${World.SPECIAL[kind].name}을(를) 놓을 땅에 닿은 빈 칸을 클릭하세요. (ESC 취소)`); }

  setInterval(refreshUI, 1000);
  return {
    st, stats, breath, roomInfo, useOxystone, startQuiz, quiz: () => quiz, setBreath, BREATH_NOTE, RANGES, SCALES, GAS_KO, open, setOn, setMode, setScale, draw, probe, tipLines, tick, resync,
    kindOf, valueOf, win: () => ({ ox, oy, W, H }), grid: () => grid, active: () => !!(st.on && grid),
  };
})();
