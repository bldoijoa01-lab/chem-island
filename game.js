// 화학 섬 이야기 — 핵심 게임 로직 (지도, 시간, 장치, UI)
// 보스는 raid.js, 연구 노트는 notes.js. 화학 식은 모두 chem.js(Chem)만 사용한다.
(() => {
'use strict';
const C = Chem;
const TILE = 32, W = 22, H = 14, KEY = 'chemisle_base_v1';
const FIRE_T = [25, 105, 115, 130, 145];       // 화덕 세기별 열원 온도(℃)
const FIRE_BURN = [0, 0.5, 1, 2, 3];           // 세기별 나뭇가지 소모(개/시간)
const FIRE_NAME = ['꺼짐', '약불', '중불', '강불', '최강'];
const SEA_BUCKET = { water: 193, nacl: 7 };    // 바닷물 1통 = 200 g (NaCl 3.5 %)
const DEV = {
  fire:      { name: '화덕',        ico: '🔥', cost: { stick: 6, sand: 4 },              unlock: 0, needFire: false },
  still:     { name: '증류기',      ico: '⚗️', cost: { bottle: 2, stick: 4 },             unlock: 0, needFire: true },
  cooker:    { name: '압력 밥솥',   ico: '🍲', cost: { bottle: 3, stick: 4, sand: 2 },    unlock: 3, needFire: true },
  cooler:    { name: '냉각 상자',   ico: '🧊', cost: { ice: 3, salt: 20 },                unlock: 4, needFire: false },
  collector: { name: '기체 포집기', ico: '🫧', cost: { bottle: 2, syringe: 1 },           unlock: 5, needFire: false },
};
const ITEM = {
  stick: ['🪵', '나뭇가지', '개'], sand: ['🏖️', '모래', '개'], sea: ['🌊', '바닷물(200 g)', '통'],
  ice: ['🧊', '얼음(100 g)', '개'], bottle: ['🍶', '유리병', '개'], syringe: ['💉', '주사기', '개'],
  sugar: ['🍬', '설탕', 'g'], salt: ['🧂', '소금', 'g'], water: ['💧', '증류수', 'g'],
  noodle: ['🍜', '면', '개'], ramen: ['🥣', '라면', '개'],
};
const RECIPES = [
  { id: 'bottle', out: 'bottle', n: 1, cost: { sand: 3, stick: 1 }, note: '모래를 가열해 유리로' },
  { id: 'syringe', out: 'syringe', n: 1, cost: { bottle: 1, stick: 2 }, note: '피스톤으로 기체의 양을 조절 [#8]' },
];
const QUESTS = [
  { t: '바닷물 1통을 뜨고, 화덕을 설치하세요', ok: f => f.sea && f.fire, hint: '🔨 건설 → 화덕. 바다 옆에서 E' },
  { t: '증류기로 증류수 200 g을 얻으세요', ok: f => f.dW >= 200, hint: '증류기는 화덕 옆(8방향)에. 바닷물을 넣고 시작' },
  { t: '증류에서 소금 20 g을 모으세요', ok: f => f.dS >= 20, hint: '바닷물이 농축되면 NaCl 결정이 남아요' },
  { t: '압력 밥솥으로 2기압 이상에서 라면을 끓이세요', ok: f => f.ramenP >= 2, hint: '면 1개 + 증류수 300 g. 화덕 세기를 올려야 할 수도 있어요' },
  { t: '−10 ℃ 이하의 한제 팩을 만드세요', ok: f => f.packT <= -10, hint: '얼음에 소금을 섞으면 어는점이 내려가요' },
  { t: '공기 캡슐 4개를 만드세요', ok: f => f.caps >= 4, hint: '기체 포집기에서 주사기로 공기를 모아요' },
  { t: '광장의 솥 골렘을 정화하세요', ok: f => f.boss, hint: '제단(🗿)에서 도전. 소금·증류수·한제 팩·캡슐을 챙기세요' },
];

// ---------- 상태 ----------
function newState() {
  return {
    day: 1, min: 360, px: 5, py: 6, speed: 1,
    inv: { stick: 8, sand: 6, sea: 0, ice: 0, bottle: 0, syringe: 0, sugar: 0, salt: 0, water: 400, noodle: 1, ramen: 0 },
    caps: [], packs: [], placed: [], nodes: {}, boxDay: 0,
    f: { sea: false, fire: false, dW: 0, dS: 0, ramenP: 0, packT: 0, caps: 0, boss: false },
    qDone: 0, log: [], memo: '',
  };
}
let S = load() || newState();
function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!j) return null;
    return Object.assign(newState(), j, { inv: Object.assign(newState().inv, j.inv), f: Object.assign(newState().f, j.f) });
  } catch { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 저장 불가 */ } }

// ---------- 지도 ----------
const TER = [], OBJ = [];
(function buildMap() {
  for (let y = 0; y < H; y++) {
    TER.push([]); OBJ.push([]);
    for (let x = 0; x < W; x++) {
      let t = 'g';
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) t = '~';
      else if (x === 2 || y === 2 || x === W - 3 || y === H - 3) t = 's';
      TER[y].push(t); OBJ[y].push('');
    }
  }
  [[16, 3], [17, 3], [18, 3], [16, 4], [17, 4], [18, 4]].forEach(([x, y]) => TER[y][x] = 'i');
  [[5, 4], [7, 4], [6, 7], [9, 5], [10, 9], [12, 5], [13, 9], [8, 8]].forEach(([x, y]) => OBJ[y][x] = 'T');
  [[15, 7], [16, 7], [15, 8]].forEach(([x, y]) => OBJ[y][x] = 'C');
  [[12, 7], [13, 7], [12, 8]].forEach(([x, y]) => OBJ[y][x] = 'W');
  OBJ[5][4] = 'B';      // 광장 보급 상자
  OBJ[9][17] = 'A';     // 솥 골렘 제단
})();
const devAt = (x, y) => S.placed.find(d => d.x === x && d.y === y);
const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && 'gsi'.includes(TER[y][x]) && !OBJ[y][x] && !devAt(x, y);
const adj8 = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
const fireNear = d => S.placed.filter(f => f.id === 'fire' && adj8(f, d));

// ---------- 유틸 ----------
const $ = id => document.getElementById(id);
const fmt = (v, d = 1) => Number(v).toFixed(d);
const clockText = () => `${S.day}일차 ${String(Math.floor(S.min / 60)).padStart(2, '0')}:${String(Math.floor(S.min % 60)).padStart(2, '0')}`;
const airTemp = () => 22 + 6 * Math.sin(2 * Math.PI * (S.min - 540) / 1440);   // ℃, 오후 3시가 가장 따뜻함
let msgTimer;
function say(t) { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => $('msg').textContent = '', 6000); }
function logEv(type, text) { S.log.push({ day: S.day, t: clockText(), type, text }); if (S.log.length > 300) S.log.shift(); }
function has(cost) { return Object.entries(cost).every(([k, v]) => (S.inv[k] || 0) >= v); }
function pay(cost) { for (const k in cost) S.inv[k] -= cost[k]; }
function costText(cost) { return Object.entries(cost).map(([k, v]) => `${ITEM[k][0]}${ITEM[k][1]} ${v}`).join(' · '); }
const unlocked = id => S.qDone >= DEV[id].unlock;

// ---------- 시간 ----------
function advance(dm) {
  for (let i = 0; i < dm; i++) {
    S.min += 1;
    stepDevices();
    if (S.min >= 1440) { S.min -= 1440; S.day += 1; newDay(); }
  }
}
function newDay() {
  S.nodes = {};
  const before = S.packs.length;
  S.packs = S.packs.filter(p => p.day >= S.day);
  if (before > S.packs.length) { say('한제 팩이 밤새 녹았습니다. 팩은 당일에만 쓸 수 있어요.'); logEv('팩 녹음', '한제 팩이 하루가 지나 녹음(얼음의 융해).'); }
  say(`${S.day}일차 — 자원이 다시 자랐습니다.`);
}

// ---------- 장치 시뮬레이션 (1분 단위) ----------
function stepDevices() {
  for (const d of S.placed) {
    const s = d.s;
    if (d.id === 'fire') {
      if (s.level > 0) {
        s.fuel -= FIRE_BURN[s.level] / 60;
        if (s.fuel <= 0) { s.fuel = 0; s.level = 0; say('화덕의 연료가 떨어졌습니다.'); }
      }
    } else if (d.id === 'still') stepStill(d);
    else if (d.id === 'cooker') stepCooker(d);
  }
}
function heatOf(d) {
  let T = 25;
  for (const f of fireNear(d)) if (f.s.level > 0 && f.s.fuel > 0) T = Math.max(T, FIRE_T[f.s.level]);
  return T;
}

// 증류기: 증발 속도 ∝ (용액 증기압 − 외부 압력)   [#19 #30 #34]
function stepStill(d) {
  const s = d.s;
  s.T = heatOf(d);
  if (!s.run || s.w <= 0) return;
  const np = 2 * s.ns;                       // NaCl → Na⁺ + Cl⁻ (i = 2 가정)
  const xw = C.xw(s.w, np);
  s.xw = xw; s.tb = C.tb(1, xw);
  const pv = C.pSol(s.T, xw);
  s.pv = pv;
  if (pv > 1) {
    const wmin = s.ns / C.NACL_SAT * 1000;   // 포화 몰랄농도에 이르면 결정 석출
    const ev = Math.min(12 * (pv - 1), s.w - wmin);
    s.w -= ev; s.outW += ev;
    if (s.w - wmin < 1e-6) {
      s.outS += s.ns * C.MW_NACL; s.ns = 0; s.w = 0; s.run = false;
      say('증류기: 소금이 포화되어 결정으로 석출되었습니다.');
      logEv('증류 완료', `포화(${C.NACL_SAT} mol/kg)에서 NaCl 결정 석출`);
    }
  }
}

// 압력 밥솥: 압력 P → 끓는점 Tb(P) → 조리 속도 2^((T−100)/10)   [#5 #18 #34]
const VALVE = [1.0, 1.5, 2.0, 2.5, Infinity];
const VALVE_NAME = ['1.0 atm (열림)', '1.5 atm', '2.0 atm', '2.5 atm', '잠금(막힘)'];
function cookerState(s, Theat) {
  const np = 2 * s.saltG / C.MW_NACL;
  const xw = C.xw(s.water || 300, np);
  const pHeat = C.pSol(Theat, xw);
  const cap = VALVE[s.valve];
  const pIn = Math.min(cap, pHeat);
  const Teff = pIn === cap ? C.tb(cap, xw) : Theat;
  return { xw, pHeat, pIn, Teff, tbHere: C.tb(Math.min(cap, 10), xw), speed: Math.pow(2, (Math.min(Teff, Theat) - 100) / 10) };
}
function stepCooker(d) {
  const s = d.s;
  s.T = heatOf(d);
  if (s.broken || !s.run) return;
  const cs = cookerState(s, s.T);
  s.cs = cs;
  if (cs.pIn > C.PBURST) {
    s.broken = true; s.run = false; s.prog = 0;
    say('💥 압력 밥솥이 터졌습니다! 재료를 잃었어요.');
    logEv('폭발', `압력 밥솥: 밸브 ${VALVE_NAME[s.valve]}, 열원 ${s.T}℃ → 내부 압력 ${fmt(cs.pIn, 2)} atm > ${C.PBURST} atm`);
    return;
  }
  s.prog += cs.speed;
  s.lastP = cs.pIn;
  if (s.prog >= 18) {
    s.run = false; s.done = true; s.doneP = cs.pIn;
    say('라면이 완성되었습니다!');
    logEv('조리 완료', `내부 압력 ${fmt(cs.pIn, 2)} atm, 끓는점 ${fmt(cs.Teff, 1)}℃, 속도 x${fmt(cs.speed, 2)}`);
  }
}

// ---------- 퀘스트 ----------
function checkQuests() {
  while (S.qDone < QUESTS.length && QUESTS[S.qDone].ok(S.f)) {
    say(`🎯 목표 달성! ${QUESTS[S.qDone].t}`);
    logEv('목표', QUESTS[S.qDone].t);
    S.qDone++;
    if (S.qDone === 3) say('🍲 압력 밥솥을 건설할 수 있게 되었습니다.');
    if (S.qDone === 4) say('🧊 냉각 상자를 건설할 수 있게 되었습니다.');
    if (S.qDone === 5) say('🫧 기체 포집기를 건설할 수 있게 되었습니다.');
  }
}

// ---------- 월드 상호작용 ----------
const NODE = { T: ['stick', 2, 2, '나뭇가지'], C: ['sugar', 50, 2, '설탕(g)'], W: ['noodle', 1, 2, '면'], s: ['sand', 2, 4, '모래'], i: ['ice', 1, 3, '얼음'] };
function kindAt(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  if (devAt(x, y)) return 'dev';
  const o = OBJ[y][x];
  if (o) return o;
  return TER[y][x];
}
function interact(x, y) {
  const k = kindAt(x, y);
  if (k === 'dev') return openDevice(devAt(x, y));
  if (k === '~') { S.inv.sea++; S.f.sea = true; advance(5); say('🌊 바닷물 1통(200 g)을 떴습니다.'); return refresh(); }
  if (k === 'B') return openBox();
  if (k === 'A') return window.Raid ? Raid.open(api) : null;
  const n = NODE[k];
  if (n) {
    const key = x + ',' + y, used = S.nodes[key] || 0;
    if (used >= n[2]) return say('오늘은 더 얻을 수 없습니다. (내일 다시 자랍니다)');
    S.nodes[key] = used + 1; S.inv[n[0]] += n[1]; advance(5);
    say(`${ITEM[n[0]][0]} ${n[3]} +${n[1]}`);
    return refresh();
  }
}
function openBox() {
  if (S.boxDay === S.day) return say('오늘의 보급품은 이미 받았습니다.');
  S.boxDay = S.day;
  const nAir = C.moles(1, 0.5, 25);
  for (const k of ['N2', 'N2', 'N2', 'O2', 'O2', 'O2', 'He']) S.caps.push({ k, n: nAir });
  S.inv.sugar += 100; S.inv.salt += 10;
  say('📦 광장 보급품: 질소·산소 캡슐 3개씩, 헬륨 캡슐 1개, 설탕 100 g, 소금 10 g');
  refresh();
}

// ---------- 건설 ----------
let mode = null;   // 'build:<id>' | 'demolish'
function placeAt(x, y) {
  if (mode === 'demolish') {
    const d = devAt(x, y);
    if (!d) return say('철거할 장치가 없습니다.');
    for (const k in DEV[d.id].cost) S.inv[k] += DEV[d.id].cost[k];
    S.placed.splice(S.placed.indexOf(d), 1);
    say(`${DEV[d.id].name}을(를) 철거하고 재료를 돌려받았습니다.`);
    mode = null; return refresh();
  }
  const id = mode.slice(6), def = DEV[id];
  if (!walkable(x, y) || TER[y][x] === 'i') return say('여기에는 지을 수 없습니다.');
  if (S.px === x && S.py === y) return say('서 있는 자리에는 지을 수 없습니다.');
  if (def.needFire && !fireNear({ x, y }).length) return say(`${def.name}은(는) 화덕 바로 옆(8방향)에 지어야 합니다. (열 전달)`);
  if (!has(def.cost)) return say('재료가 부족합니다.');
  pay(def.cost);
  const s = { fire: { level: 0, fuel: 0 },
    still: { w: 0, ns: 0, outW: 0, outS: 0, run: false, T: 25 },
    cooker: { run: false, prog: 0, valve: 2, saltG: 0, water: 300, T: 25 },
    cooler: {}, collector: {} }[id];
  S.placed.push({ id, x, y, s });
  if (id === 'fire') S.f.fire = true;
  say(`${def.ico} ${def.name}을(를) 지었습니다.`);
  logEv('건설', `${def.name} (${x},${y})`);
  mode = null; refresh();
}

// ---------- 모달 ----------
let modalTick = null, modalCloseHook = null;
function openModal(title, html, tick, onClose) {
  $('mtitle').textContent = title; $('mbody').innerHTML = html;
  $('modal').hidden = false; modalTick = tick || null; modalCloseHook = onClose || null;
  if (modalTick) modalTick();
}
function closeModal() { $('modal').hidden = true; if (modalCloseHook) modalCloseHook(); modalTick = null; modalCloseHook = null; save(); refresh(); }
$('mclose').onclick = closeModal;
$('modal').addEventListener('mousedown', e => { if (e.target === $('modal')) closeModal(); });
const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const setw = (id, pct, cls) => { const e = $(id); if (e) { e.style.width = Math.max(0, Math.min(100, pct)) + '%'; if (cls !== undefined) e.parentElement.className = 'bar ' + cls; } };

// ---------- 장치 패널 ----------
function openDevice(d) {
  const fn = { fire: uiFire, still: uiStill, cooker: uiCooker, cooler: uiCooler, collector: uiCollector }[d.id];
  fn(d);
}
let curDev = null;
window.act = (name, arg) => { ACT[name](curDev, arg); if (modalTick) modalTick(); refresh(); };
const ACT = {};

function uiFire(d) {
  curDev = d;
  openModal('🔥 화덕', `
    <div class="box"><div class="kv"><span>세기</span><b id="f-lv"></b></div>
    <div class="kv"><span>열원 온도</span><b id="f-t"></b></div>
    <div class="kv"><span>연료</span><b id="f-fuel"></b></div>
    <div class="kv"><span>소모 속도</span><b id="f-burn"></b></div></div>
    <div class="row" id="f-btns"></div>
    <div class="row" style="margin-top:8px"><button onclick="act('fuel',1)">나뭇가지 +1</button><button onclick="act('fuel',5)">+5</button></div>
    <div class="warnbox">옆에 지은 증류기·밥솥은 이 화덕의 열원 온도까지만 가열됩니다. 센 불일수록 연료가 빨리 닳습니다.</div>`,
  () => {
    set('f-lv', FIRE_NAME[d.s.level]); set('f-t', FIRE_T[d.s.level] + ' ℃');
    set('f-fuel', fmt(d.s.fuel, 1) + ' 개'); set('f-burn', FIRE_BURN[d.s.level] + ' 개/시간');
    $('f-btns').innerHTML = FIRE_NAME.map((n, i) => `<button class="${i === d.s.level ? 'on' : ''}" onclick="act('level',${i})">${n}</button>`).join('');
  });
}
ACT.fuel = (d, n) => { n = Math.min(n, S.inv.stick); if (n <= 0) return say('나뭇가지가 없습니다.'); S.inv.stick -= n; d.s.fuel += n; };
ACT.level = (d, i) => { if (i > 0 && d.s.fuel <= 0) return say('연료를 먼저 넣으세요.'); d.s.level = i; };

function uiStill(d) {
  curDev = d;
  openModal('⚗️ 증류기', `
    <div class="grid2"><div class="box"><h4>상태</h4>
      <div class="kv"><span>화덕 열원</span><b id="s-T"></b></div>
      <div class="kv"><span>용액 속 물</span><b id="s-w"></b></div>
      <div class="kv"><span>몰랄농도 m</span><b id="s-m"></b></div>
      <div class="kv"><span>물의 몰분율 x</span><b id="s-x"></b></div>
      <div class="kv"><span>용액 끓는점(1 atm)</span><b id="s-tb"></b></div>
      <div class="kv"><span>열원에서 용액 증기압</span><b id="s-pv"></b></div>
      <div id="s-st" class="mut"></div></div>
    <div class="box"><h4>산출물</h4>
      <div class="kv"><span>증류수</span><b id="s-ow"></b></div>
      <div class="kv"><span>소금 결정</span><b id="s-os"></b></div>
      <div class="row" style="margin-top:6px"><button onclick="act('collect')">수거</button></div></div></div>
    <div class="row"><button onclick="act('load')">바닷물 1통 넣기</button>
      <button class="primary" onclick="act('toggle')" id="s-tg">가열 시작</button></div>
    <div class="warnbox">용질(소금)이 녹으면 증기압이 내려가 끓는점이 오릅니다. 증발할수록 농도가 올라 점점 더 높은 열원이 필요하고, 포화 몰랄농도(6.1 mol/kg)에서 소금이 결정으로 남습니다. (비휘발성 용질, 라울의 법칙, NaCl 완전 해리 i=2 가정)</div>`,
  () => {
    const s = d.s, np = 2 * s.ns;
    set('s-T', fmt(heatOf(d), 0) + ' ℃');
    set('s-w', fmt(s.w, 1) + ' g'); set('s-ow', fmt(s.outW, 1) + ' g'); set('s-os', fmt(s.outS, 1) + ' g');
    if (s.w > 0) {
      const xw = C.xw(s.w, np);
      set('s-m', fmt(C.molality(s.ns, s.w), 2) + ' mol/kg'); set('s-x', fmt(xw, 4));
      set('s-tb', fmt(C.tb(1, xw), 2) + ' ℃ (ΔTb ≈ ' + fmt(C.tb(1, xw) - 100, 2) + ')');
      set('s-pv', fmt(C.pSol(heatOf(d), xw), 3) + ' atm');
    } else { ['s-m', 's-x', 's-tb', 's-pv'].forEach(i => set(i, '-')); }
    set('s-tg', s.run ? '가열 중지' : '가열 시작');
    set('s-st', !s.run ? '대기 중' : (s.w > 0 && C.pSol(heatOf(d), C.xw(s.w, np)) > 1 ? '끓는 중 — 증기가 응축되어 증류수가 됩니다' : '열원 온도가 용액의 끓는점보다 낮아 끓지 않습니다 (화덕 세기를 올리세요)'));
  });
}
ACT.load = d => {
  if (S.inv.sea < 1) return say('바닷물이 없습니다. 바닷가에서 E.');
  if (d.s.w + SEA_BUCKET.water > 650) return say('증류기가 가득 찼습니다.');
  S.inv.sea--; d.s.w += SEA_BUCKET.water; d.s.ns += SEA_BUCKET.nacl / C.MW_NACL;
};
ACT.toggle = d => { d.s.run = !d.s.run; };
ACT.collect = d => {
  const w = d.s.outW, s = d.s.outS;
  S.inv.water += w; S.inv.salt += s; S.f.dW += w; S.f.dS += s;
  if (w > 0 || s > 0) logEv('증류 수거', `증류수 ${fmt(w, 1)} g, 소금 ${fmt(s, 1)} g`);
  d.s.outW = 0; d.s.outS = 0;
};

function uiCooker(d) {
  curDev = d;
  openModal('🍲 압력 밥솥', `
    <div class="grid2"><div class="box"><h4>재료 투입</h4>
      <div class="kv"><span>필요</span><span>증류수 300 g + 면 1개</span></div>
      <div class="row"><label>소금(스프) <input type="number" id="c-salt" min="0" max="30" step="5" value="${d.s.saltG}" style="width:64px"> g</label></div>
      <div class="row" style="margin-top:6px"><label>추 / 밸브 <select id="c-valve">${VALVE_NAME.map((n, i) => `<option value="${i}" ${i === d.s.valve ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="act('cook')">넣고 조리 시작</button>
      <button onclick="act('take')">라면 꺼내기</button><button onclick="act('repair')">수리(🪵2)</button></div></div>
    <div class="box"><h4>내부 상태</h4>
      <div class="kv"><span>화덕 열원</span><b id="c-T"></b></div>
      <div class="kv"><span>내부 압력</span><b id="c-P"></b></div>
      <div class="kv"><span>그 압력의 끓는점</span><b id="c-tb"></b></div>
      <div class="kv"><span>조리 속도</span><b id="c-sp"></b></div>
      <div class="bar"><i id="c-bar"></i></div><div id="c-st" class="mut"></div></div></div>
    <div class="warnbox">외부(내부) 압력이 높을수록 끓는점이 높아져 같은 라면이 더 빨리 익습니다. 조리 속도는 온도가 10 ℃ 오를 때마다 2배(경험칙 가정). 압력이 ${C.PBURST} atm을 넘으면 터집니다. 열원이 끓는점보다 낮으면 그 압력까지 도달하지 못합니다.</div>`,
  () => {
    const s = d.s, T = heatOf(d);
    s.valve = +($('c-valve') ? $('c-valve').value : s.valve);
    s.saltG = s.run ? s.saltG : +($('c-salt') ? $('c-salt').value : s.saltG);
    const cs = cookerState(s, T);
    set('c-T', fmt(T, 0) + ' ℃'); set('c-P', fmt(cs.pIn, 2) + ' atm'); set('c-tb', fmt(cs.Teff, 1) + ' ℃');
    set('c-sp', 'x' + fmt(cs.speed, 2)); setw('c-bar', s.prog / 18 * 100, cs.pIn > 2.7 ? 'bad' : 'good');
    set('c-st', s.broken ? '💥 파손됨 — 수리가 필요합니다' : s.done ? '✅ 완성! 꺼내세요' : s.run ? `조리 중 (${fmt(s.prog / 18 * 100, 0)} %)` : '대기 중');
  });
}
ACT.cook = d => {
  const s = d.s;
  if (s.broken) return say('먼저 수리하세요.');
  if (s.run || s.done) return say('이미 사용 중입니다.');
  if (S.inv.water < 300 || S.inv.noodle < 1) return say('증류수 300 g과 면 1개가 필요합니다.');
  const salt = +$('c-salt').value;
  if (salt > S.inv.salt) return say('소금이 부족합니다.');
  S.inv.water -= 300; S.inv.noodle--; S.inv.salt -= salt;
  s.saltG = salt; s.valve = +$('c-valve').value; s.prog = 0; s.run = true;
};
ACT.take = d => { if (!d.s.done) return say('아직 완성되지 않았습니다.'); d.s.done = false; S.inv.ramen++; S.f.ramenP = Math.max(S.f.ramenP, d.s.doneP); say('🥣 라면 1개를 얻었습니다.'); };
ACT.repair = d => { if (!d.s.broken) return; if (S.inv.stick < 2) return say('나뭇가지 2개가 필요합니다.'); S.inv.stick -= 2; d.s.broken = false; };

function uiCooler(d) {
  curDev = d;
  openModal('🧊 냉각 상자', `
    <div class="box">
      <div class="row"><label>얼음 <input type="number" id="k-ice" min="1" max="5" value="2" style="width:56px"> 개(100 g)</label>
      <label>소금 <input type="number" id="k-salt" min="0" max="120" value="0" style="width:64px"> g</label></div>
      <div class="kv"><span>몰랄농도 m</span><b id="k-m"></b></div>
      <div class="kv"><span>한제 온도</span><b id="k-T"></b></div>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="act('pack')">한제 팩 만들기 (30분)</button></div>
      <div class="kv"><span>오늘의 팩</span><b id="k-n"></b></div></div>
    <div class="warnbox">소금이 녹은 물은 어는점이 내려가 0 ℃ 이하에서도 얼음과 평형을 이룹니다: ΔTf = i·Kf·m (Kf=1.86, NaCl i=2). 공융점 −21.1 ℃보다 낮아지지 않으며, 팩은 당일에 녹습니다. (얼음 전체 질량 기준 근사)</div>`,
  () => {
    const ice = +$('k-ice').value * 100, salt = +$('k-salt').value;
    set('k-m', fmt(salt / C.MW_NACL / (ice / 1000), 2) + ' mol/kg'); set('k-T', fmt(C.coolTemp(ice, salt), 1) + ' ℃');
    set('k-n', S.packs.map(p => fmt(p.T, 1) + '℃').join(', ') || '없음');
  });
}
ACT.pack = () => {
  const iceN = +$('k-ice').value, salt = +$('k-salt').value;
  if (S.inv.ice < iceN || S.inv.salt < salt) return say('얼음이나 소금이 부족합니다.');
  if (salt <= 0) return say('소금을 넣어야 0 ℃ 아래로 내려갑니다.');
  S.inv.ice -= iceN; S.inv.salt -= salt;
  const T = C.coolTemp(iceN * 100, salt);
  S.packs.push({ T, M: iceN * 100, day: S.day });
  S.f.packT = Math.min(S.f.packT, T);
  logEv('한제 팩', `얼음 ${iceN * 100} g + 소금 ${salt} g → ${fmt(T, 1)} ℃`);
  advance(30); say(`🧊 ${fmt(T, 1)} ℃ 한제 팩을 만들었습니다.`);
};

function uiCollector(d) {
  curDev = d;
  openModal('🫧 기체 포집기', `
    <div class="box">
      <div class="kv"><span>주사기 부피 V</span><b>0.5 L</b></div>
      <div class="kv"><span>외기 온도 / 압력</span><b id="g-T"></b></div>
      <div class="kv"><span>모이는 기체의 양 n = PV/RT</span><b id="g-n"></b></div>
      <div class="kv"><span>조성(몰분율)</span><b>N₂ 0.781 · O₂ 0.210 · Ar 0.010</b></div>
      <div class="kv"><span>기체 분압 (P_i = x_i·P)</span><b id="g-p"></b></div>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="act('cap')">공기 캡슐 만들기 (🏖️1, 10분)</button></div>
      <div class="kv"><span>보유 캡슐</span><b id="g-c"></b></div></div>
    <div class="warnbox">공기는 반응하지 않는 기체의 혼합물이라 전체 압력은 분압의 합입니다(돌턴). 같은 압력·부피라도 온도가 낮을수록 더 많은 기체가 모입니다. 질소·산소·헬륨 캡슐은 광장 보급 상자에서 얻습니다. (공기에서 성분을 분리하려면 분별증류 등이 필요 — 이 섬에는 없음)</div>`,
  () => {
    const T = airTemp();
    set('g-T', fmt(T, 1) + ' ℃ / 1 atm'); set('g-n', fmt(C.moles(1, 0.5, T), 4) + ' mol');
    set('g-p', 'N₂ ' + fmt(C.AIR.N2, 3) + ' · O₂ ' + fmt(C.AIR.O2, 3) + ' · Ar ' + fmt(C.AIR.Ar, 3) + ' atm');
    set('g-c', capText());
  });
}
const capCount = k => S.caps.filter(c => c.k === k).length;
const capText = () => ['air', 'N2', 'O2', 'He'].map(k => `${k === 'air' ? '공기' : k} ${capCount(k)}`).join(' · ');
ACT.cap = () => {
  if (S.inv.sand < 1) return say('모래가 필요합니다.');
  S.inv.sand--; advance(10);
  S.caps.push({ k: 'air', n: C.moles(1, 0.5, airTemp()) });
  S.f.caps++;
  say('🫧 공기 캡슐 1개를 만들었습니다.');
};

// ---------- 건설/제작/기록/저장 메뉴 ----------
function openBuild() {
  const rows = Object.entries(DEV).map(([id, d]) => {
    const ok = unlocked(id);
    return `<div class="box row between"><div><b>${d.ico} ${d.name}</b> ${ok ? '' : '<span class="no">🔒 목표 ' + d.unlock + ' 달성 시 해금</span>'}
      <div class="mut">${costText(d.cost)}${d.needFire ? ' · 화덕 옆에 설치' : ''}</div></div>
      <button ${ok && has(d.cost) ? '' : 'disabled'} onclick="G.startBuild('${id}')">짓기</button></div>`;
  }).join('');
  openModal('🔨 건설', rows + `<div class="row"><button class="danger" onclick="G.startDemolish()">철거 모드 (재료 환급)</button></div>`);
}
function openCraft() {
  openModal('🧰 제작', RECIPES.map(r => `<div class="box row between"><div><b>${ITEM[r.out][0]} ${ITEM[r.out][1]}</b>
    <div class="mut">${costText(r.cost)} — ${r.note}</div></div><button ${has(r.cost) ? '' : 'disabled'} onclick="G.craft('${r.id}')">만들기</button></div>`).join(''));
}
function openLog() {
  const rows = S.log.slice().reverse().map(l => `<div><span class="mut">${l.day}일 ${l.t}</span> <b>[${l.type}]</b> ${l.text}</div>`).join('') || '<span class="mut">아직 기록이 없습니다.</span>';
  openModal('📝 자동 기록', `<div class="warnbox">시험 플레이에서 일어난 일(폭발·수거·목표 등)이 자동으로 쌓입니다. 개발 기록의 ‘문제 발견 → 원인 → 수정 → 화학적 근거 → 결과 비교’를 쓸 때 증빙으로 사용하세요.</div>
    <textarea id="memo" placeholder="내가 발견한 문제·가설 메모">${S.memo}</textarea>
    <div class="row" style="margin:6px 0"><button onclick="G.copyLog()">기록 복사</button></div>
    <div class="log">${rows}</div>`, null, () => { const m = $('memo'); if (m) S.memo = m.value; });
}
function openSave() {
  openModal('💾 저장/초기화', `<p>진행 상황은 이 브라우저에 자동 저장됩니다.</p>
    <div class="row"><button onclick="G.save()">지금 저장</button><button class="danger" onclick="G.reset()">처음부터 다시 시작</button></div>`);
}

// ---------- 공개 API (raid.js 등에서 사용) ----------
const api = {
  S: () => S, say, logEv, openModal, closeModal, set, setw, fmt, refresh: () => refresh(), save,
  capCount, ITEM, airTemp, advance,
};
window.G = {
  startBuild(id) { mode = 'build:' + id; $('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 타일을 클릭하세요.`); },
  startDemolish() { mode = 'demolish'; $('modal').hidden = true; say('철거할 장치를 클릭하세요.'); },
  craft(id) { const r = RECIPES.find(x => x.id === id); if (!has(r.cost)) return; pay(r.cost); S.inv[r.out] += r.n; advance(10); say(`${ITEM[r.out][1]} 제작`); openCraft(); refresh(); },
  copyLog() { const t = S.log.map(l => `${l.day}일 ${l.t} [${l.type}] ${l.text}`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(t).then(() => say('복사했습니다.'), () => say('복사 권한이 없습니다.')); },
  save() { save(); say('저장했습니다.'); },
  debug: () => S,   // 시험 플레이/자동 점검용: 현재 상태 조회
  reset() { if (confirm('모든 진행이 사라집니다. 정말 처음부터 시작할까요?')) { S = newState(); save(); closeModal(); refresh(); } },
};

// ---------- 화면 ----------
function refresh() {
  $('clock').textContent = clockText() + ` · ${fmt(airTemp(), 0)}℃`;
  $('inv').innerHTML = Object.entries(S.inv).filter(([, v]) => v > 0)
    .map(([k, v]) => `<span>${ITEM[k][0]} ${ITEM[k][1]} <b>${k === 'water' || k === 'salt' || k === 'sugar' ? fmt(v, 0) : v}</b></span>`).join('')
    + (S.caps.length ? `<span>🫧 캡슐 <b>${S.caps.length}</b></span>` : '') + (S.packs.length ? `<span>❄️ 한제 팩 <b>${S.packs.length}</b></span>` : '');
  checkQuests();
  const q = QUESTS[S.qDone];
  $('quest').innerHTML = QUESTS.slice(0, S.qDone).map(x => `<div class="q done">✔ ${x.t}</div>`).join('')
    + (q ? `<div class="q"><b>▶ ${q.t}</b><small>${q.hint}</small></div>` : '<div class="q done">🎉 모든 목표 달성! 계속 실험해 보세요.</div>');
}

const cv = $('cv'), ctx = cv.getContext('2d');
const COL = { '~': '#1d5f9c', s: '#e8d39a', g: '#4d9a4a', i: '#bfe7f5' };
function draw() {
  const h = S.min / 60;
  const night = h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;   // 0~1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = COL[TER[y][x]]; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    if (TER[y][x] === '~' && (x + y + Math.floor(Date.now() / 600)) % 3 === 0) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x * TILE + 6, y * TILE + 14, 14, 2); }
  }
  ctx.font = '24px "Segoe UI Emoji","Apple Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const em = (t, x, y, a = 1) => { ctx.globalAlpha = a; ctx.fillText(t, x * TILE + TILE / 2, y * TILE + TILE / 2 + 1); ctx.globalAlpha = 1; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = OBJ[y][x], spent = (S.nodes[x + ',' + y] || 0);
    if (o) { const n = NODE[o]; em({ T: '🌴', C: '🎋', W: '🌾', B: '📦', A: '🗿' }[o], x, y, n && spent >= n[2] ? .35 : 1); }
    else if (TER[y][x] === 'i') { if ((S.nodes[x + ',' + y] || 0) < 3) em('🧊', x, y, .85); }
  }
  for (const d of S.placed) {
    em(DEV[d.id].ico, d.x, d.y);
    ctx.font = '12px sans-serif';
    if (d.id === 'fire' && d.s.level > 0) ctx.fillText('♨'.repeat(d.s.level), d.x * TILE + 16, d.y * TILE - 2);
    if ((d.id === 'still' && d.s.run) || (d.id === 'cooker' && d.s.run)) ctx.fillText('…', d.x * TILE + 16, d.y * TILE - 2);
    if (d.id === 'cooker' && d.s.broken) ctx.fillText('💥', d.x * TILE + 16, d.y * TILE - 2);
    ctx.font = '24px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
  }
  em('🧑‍🔬', S.px, S.py);
  if (night > 0) { ctx.fillStyle = `rgba(5,10,40,${night * 0.45})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  if (mode) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.strokeRect(hover.x * TILE + 1, hover.y * TILE + 1, TILE - 2, TILE - 2); }
  requestAnimationFrame(draw);
}
let hover = { x: 0, y: 0 };

// ---------- 이동/입력 ----------
let walk = null;
function bfs(sx, sy, goal) {
  const q = [[sx, sy]], prev = { [sx + ',' + sy]: null };
  while (q.length) {
    const [x, y] = q.shift();
    if (goal(x, y)) { const p = []; let k = x + ',' + y; while (prev[k]) { p.unshift(k.split(',').map(Number)); k = prev[k]; } return p; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = nx + ',' + ny;
      if (!(nk in prev) && walkable(nx, ny)) { prev[nk] = x + ',' + y; q.push([nx, ny]); }
    }
  }
  return null;
}
const near4 = (x, y) => Math.abs(S.px - x) + Math.abs(S.py - y) === 1;
function clickTile(x, y) {
  if ($('modal').hidden === false) return;
  if (mode) return placeAt(x, y);
  const k = kindAt(x, y);
  const standOn = (k === 's' || k === 'i') && walkable(x, y);
  if (standOn || k === 'g') {
    const p = bfs(S.px, S.py, (a, b) => a === x && b === y);
    if (p) walk = { p, then: standOn ? [x, y] : null };
    return;
  }
  if (!k || k === 'g') return;
  if (near4(x, y)) return interact(x, y);
  const p = bfs(S.px, S.py, (a, b) => Math.abs(a - x) + Math.abs(b - y) === 1);
  if (p) walk = { p, then: [x, y] };
}
setInterval(() => {
  if (!walk) return;
  if (walk.p.length) { [S.px, S.py] = walk.p.shift(); }
  else { const t = walk.then; walk = null; if (t) interact(t[0], t[1]); }
}, 110);
cv.addEventListener('click', e => {
  const r = cv.getBoundingClientRect();
  clickTile(Math.floor((e.clientX - r.left) / r.width * W), Math.floor((e.clientY - r.top) / r.height * H));
});
cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  hover = { x: Math.floor((e.clientX - r.left) / r.width * W), y: Math.floor((e.clientY - r.top) / r.height * H) };
});
window.addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  const dir = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
  if (dir) { e.preventDefault(); walk = null; const nx = S.px + dir[0], ny = S.py + dir[1]; if (walkable(nx, ny)) { S.px = nx; S.py = ny; } S.face = dir; return; }
  if (k === 'escape') { mode = null; say('취소'); }
  if (k === 'e' || k === ' ') {
    const f = S.face || [0, 1];
    const cand = [[S.px + f[0], S.py + f[1]], [S.px, S.py + 1], [S.px, S.py - 1], [S.px + 1, S.py], [S.px - 1, S.py], [S.px, S.py]];
    for (const [x, y] of cand) { const kk = kindAt(x, y); if (kk && kk !== 'g' && (kk !== 's' && kk !== 'i' || (x === S.px && y === S.py))) return interact(x, y); }
  }
});
document.querySelectorAll('.speed button').forEach(b => b.onclick = () => {
  S.speed = +b.dataset.sp; document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', x === b));
});
$('b-build').onclick = openBuild; $('b-craft').onclick = openCraft; $('b-log').onclick = openLog; $('b-save').onclick = openSave;
$('b-notes').onclick = () => window.Notes && Notes.open(api);

// 시계: 1초 = 게임 2분 (x1)
setInterval(() => { if (window.Raid && Raid.active) return; advance(S.speed); if (modalTick && !$('modal').hidden) modalTick(); refresh(); }, 500);
setInterval(save, 5000);
document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', +x.dataset.sp === S.speed));
refresh(); draw();
})();
