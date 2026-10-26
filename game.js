// 화학 섬 이야기 — 횡스크롤(단면 2D) 픽셀 월드, 시간, 장치 로직, UI
// 보스는 raid.js, 연구 노트는 notes.js, 그림은 sprites.js, 화학 식은 chem.js(Chem)만 사용한다.
(() => {
'use strict';
const C = Chem, Art = window.Art;
const T = 16, WW = 120, WH = 56, VW = 384, VH = 224, KEY = 'chemisle_side_v1';
const PW = 10, PH = 18, REACH = 40;
const FIRE_T = [25, 105, 115, 130, 145];       // 화덕 세기별 열원 온도(℃)
const FIRE_BURN = [0, 0.5, 1, 2, 3];           // 세기별 나뭇가지 소모(개/시간)
const FIRE_NAME = ['꺼짐', '약불', '중불', '강불', '최강'];
const SEA_BUCKET = { water: 193, nacl: 7 };    // 바닷물 1통 = 200 g (NaCl 3.5 %)
const DEV = {
  fire:      { name: '화덕',        cost: { stick: 6, sand: 4 },              unlock: 0, needFire: false },
  still:     { name: '증류기',      cost: { bottle: 2, stick: 4 },             unlock: 0, needFire: true },
  cooker:    { name: '압력 밥솥',   cost: { bottle: 3, stick: 4, sand: 2 },    unlock: 3, needFire: true },
  cooler:    { name: '냉각 상자',   cost: { ice: 3, salt: 20 },                unlock: 4, needFire: false },
  collector: { name: '기체 포집기', cost: { bottle: 2, syringe: 1 },           unlock: 5, needFire: false },
};
// 아이템: [아이콘 키, 이름, 단위]
const ITEM = {
  stick: ['stick', '나뭇가지', '개'], sand: ['sand', '모래', '개'], sea: ['sea', '바닷물(200 g)', '통'],
  ice: ['ice', '얼음(100 g)', '개'], bottle: ['bottle', '유리병', '개'], syringe: ['syringe', '주사기', '개'],
  sugar: ['sugar', '설탕', 'g'], salt: ['salt', '소금', 'g'], water: ['water', '증류수', 'g'],
  noodle: ['noodle', '면', '개'], ramen: ['ramen', '라면', '개'],
};
const RECIPES = [
  { id: 'bottle', out: 'bottle', n: 1, cost: { sand: 3, stick: 1 }, note: '모래를 가열해 유리로' },
  { id: 'syringe', out: 'syringe', n: 1, cost: { bottle: 1, stick: 2 }, note: '피스톤으로 기체의 양을 조절 [#8]' },
];
const QUESTS = [
  { t: '바닷물 1통을 뜨고, 화덕을 설치하세요', ok: f => f.sea && f.fire, hint: '건설 → 화덕. 바닷가에서 E로 바닷물 뜨기' },
  { t: '증류기로 증류수 200 g을 얻으세요', ok: f => f.dW >= 200, hint: '증류기는 화덕 바로 옆에. 바닷물을 넣고 가열 시작' },
  { t: '증류에서 소금 20 g을 모으세요', ok: f => f.dS >= 20, hint: '바닷물이 농축되면 NaCl 결정이 남아요' },
  { t: '압력 밥솥으로 2기압 이상에서 라면을 끓이세요', ok: f => f.ramenP >= 2, hint: '면 1개 + 증류수 300 g. 화덕 세기를 올려야 할 수도 있어요' },
  { t: '−10 ℃ 이하의 한제 팩을 만드세요', ok: f => f.packT <= -10, hint: '얼음은 오른쪽 설원에서. 소금을 섞으면 어는점이 내려가요' },
  { t: '공기 캡슐 4개를 만드세요', ok: f => f.caps >= 4, hint: '기체 포집기에서 주사기로 공기를 모아요' },
  { t: '언덕 위 제단의 솥 골렘을 정화하세요', ok: f => f.boss, hint: '소금·증류수·한제 팩·캡슐을 챙기세요' },
];

// ---------- 상태 ----------
function newState() {
  return {
    day: 1, min: 360, px: 48 * T, py: 24 * T - PH, vx: 0, vy: 0, face: 1, speed: 1,
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
    const d = newState();
    return Object.assign(d, j, { inv: Object.assign(d.inv, j.inv), f: Object.assign(d.f, j.f) });
  } catch { return null; }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 저장 불가 */ } }

// ---------- 월드 (단면 타일맵) ----------
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, SNOWTOP = 5, ICE = 6, WATER = 7;
const SOLID = [0, 1, 1, 1, 1, 1, 1, 0];
const MAP = new Uint8Array(WW * WH), GY = [];
const tileAt = (x, y) => (y < 0 ? AIR : (x < 0 || x >= WW || y >= WH) ? STONE : MAP[y * WW + x]);
const solidAt = (x, y) => SOLID[tileAt(x, y)] === 1;
const OBJS = [];
(function gen() {
  for (let x = 0; x < WW; x++) {
    let g;
    if (x <= 13) g = 30; else if (x <= 27) g = Math.round(30 - 6 * (x - 13) / 14); else if (x <= 66) g = 24;
    else if (x <= 70) g = 24 - (x - 66); else if (x <= 74) g = 20; else if (x <= 78) g = 20 + (x - 74); else if (x <= 82) g = 24;
    else if (x <= 105) g = 24 - Math.round(1.5 * Math.sin((x - 83) / 3)); else if (x <= 112) g = Math.round(24 + 6 * (x - 105) / 7); else g = 30;
    GY[x] = g;
    const beach = x <= 27 || x >= 106, snow = x >= 83 && x <= 105, pond = x >= 90 && x <= 94;
    for (let y = g; y < WH; y++) {
      const d = y - g;
      MAP[y * WW + x] = d === 0 ? (pond ? ICE : beach ? SAND : snow ? SNOWTOP : GRASS)
        : d <= 4 ? (pond && d <= 1 ? ICE : beach ? SAND : DIRT) : STONE;
    }
    for (let y = 25; y < g; y++) MAP[y * WW + x] = WATER;
  }
  for (const [cx, cy, r] of [[50, 37, 5], [70, 41, 6], [92, 38, 5], [30, 45, 6], [60, 48, 4]]) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r * 2; x <= cx + r * 2; x++) {
      if (((x - cx) / 2) ** 2 + (y - cy) ** 2 <= r * r) MAP[y * WW + x] = AIR;
    }
  }
  const add = (type, x) => OBJS.push({ id: type[0] + type[1] + x, type, x, y: GY[x] });
  [29, 32, 35, 68, 77, 80, 85, 101].forEach(x => add('tree', x));
  [26, 27].forEach(x => add('cane', x));
  [36, 37, 38].forEach(x => add('wheat', x));
  [24, 25, 106].forEach(x => add('sandpile', x));
  [86, 89, 96, 99, 103].forEach(x => add('icecrystal', x));
  add('box', 44); add('altar', 72);
})();
// 종류별 [얻는 아이템, 1회 양, 하루 횟수, 이름, 중심 y 오프셋(위로 몇 px)]
const NODE = {
  tree: ['stick', 2, 2, '나무', 16], cane: ['sugar', 50, 2, '사탕수수', 8], wheat: ['noodle', 1, 2, '밀', 8],
  sandpile: ['sand', 2, 4, '모래 더미', 4], icecrystal: ['ice', 1, 3, '얼음 결정', 10],
};

// ---------- 유틸 ----------
const $ = id => document.getElementById(id);
const fmt = (v, d = 1) => Number(v).toFixed(d);
const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;   // 그림 문자는 쓰지 않는다(전부 픽셀 아이콘)
const pix = s => String(s).replace(EMO, '').replace(/^\s+/, '');
const ic = k => `<i class="ic" style="background-image:url(${Art.iconURL[k]})"></i>`;
const clockText = () => `${S.day}일차 ${String(Math.floor(S.min / 60)).padStart(2, '0')}:${String(Math.floor(S.min % 60)).padStart(2, '0')}`;
const airTemp = () => 22 + 6 * Math.sin(2 * Math.PI * (S.min - 540) / 1440);   // ℃, 오후 3시가 가장 따뜻함
let msgTimer;
function say(t) { $('msg').textContent = pix(t); clearTimeout(msgTimer); msgTimer = setTimeout(() => $('msg').textContent = '', 6000); }
function logEv(type, text) { S.log.push({ day: S.day, t: clockText(), type, text: pix(text) }); if (S.log.length > 300) S.log.shift(); }
const has = cost => Object.entries(cost).every(([k, v]) => (S.inv[k] || 0) >= v);
const pay = cost => { for (const k in cost) S.inv[k] -= cost[k]; };
const costText = cost => Object.entries(cost).map(([k, v]) => `${ic(ITEM[k][0])}${ITEM[k][1]} ${v}`).join(' · ');
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
  else say(`${S.day}일차 — 자원이 다시 자랐습니다.`);
}

// ---------- 장치 시뮬레이션 (1분 단위) ----------
const adjacentTo = (a, b) => a !== b && Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 1;   // 2x2 장치끼리 한 칸 이내
const fireNear = d => S.placed.filter(f => f.id === 'fire' && adjacentTo(f, d));
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
  let t = 25;
  for (const f of fireNear(d)) if (f.s.level > 0 && f.s.fuel > 0) t = Math.max(t, FIRE_T[f.s.level]);
  return t;
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
  return { xw, pHeat, pIn, Teff, speed: Math.pow(2, (Math.min(Teff, Theat) - 100) / 10) };
}
function stepCooker(d) {
  const s = d.s;
  s.T = heatOf(d);
  if (s.broken || !s.run) return;
  const cs = cookerState(s, s.T);
  s.cs = cs;
  if (cs.pIn > C.PBURST) {
    s.broken = true; s.run = false; s.prog = 0;
    say('압력 밥솥이 터졌습니다! 재료를 잃었어요.');
    logEv('폭발', `압력 밥솥: 밸브 ${VALVE_NAME[s.valve]}, 열원 ${s.T}℃ → 내부 압력 ${fmt(cs.pIn, 2)} atm > ${C.PBURST} atm`);
    burst(d);
    return;
  }
  s.prog += cs.speed;
  if (s.prog >= 18) {
    s.run = false; s.done = true; s.doneP = cs.pIn;
    say('라면이 완성되었습니다!');
    logEv('조리 완료', `내부 압력 ${fmt(cs.pIn, 2)} atm, 끓는점 ${fmt(cs.Teff, 1)}℃, 속도 x${fmt(cs.speed, 2)}`);
  }
}

// ---------- 퀘스트 ----------
function checkQuests() {
  while (S.qDone < QUESTS.length && QUESTS[S.qDone].ok(S.f)) {
    say(`목표 달성! ${QUESTS[S.qDone].t}`);
    logEv('목표', QUESTS[S.qDone].t);
    S.qDone++;
    if (S.qDone === 3) say('압력 밥솥을 건설할 수 있게 되었습니다.');
    if (S.qDone === 4) say('냉각 상자를 건설할 수 있게 되었습니다.');
    if (S.qDone === 5) say('기체 포집기를 건설할 수 있게 되었습니다.');
  }
}

// ---------- 상호작용 대상 ----------
const objCenter = o => o.type === 'altar' ? [o.x * T + 16, o.y * T - 16] : [o.x * T + 8, o.y * T - (NODE[o.type] ? NODE[o.type][4] : 8)];
function nearWater() {
  const tx = Math.floor((S.px + PW / 2) / T), ty = Math.floor((S.py + PH / 2) / T);
  for (let x = tx - 1; x <= tx + 1; x++) for (let y = ty - 1; y <= ty + 1; y++) if (tileAt(x, y) === WATER) return true;
  return false;
}
function targets() {
  const cx = S.px + PW / 2, cy = S.py + PH / 2, out = [];
  const add = (kind, ref, x, y, label) => { const d = Math.hypot(x - cx, (y - cy) * 0.7); if (d <= REACH) out.push({ kind, ref, x, y, d, label }); };
  for (const o of OBJS) {
    const [x, y] = objCenter(o), n = NODE[o.type];
    add(o.type, o, x, y, n ? `${n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : o.type === 'box' ? '광장 보급 상자' : '솥 골렘 제단');
  }
  for (const d of S.placed) add('dev', d, d.x * T + 16, d.y * T + 16, DEV[d.id].name);
  if (nearWater()) add('water', null, cx, cy + 4, '바닷물 뜨기');
  return out.sort((a, b) => a.d - b.d);
}
function interact(t) {
  if (!t) return;
  if (t.kind === 'dev') return openDevice(t.ref);
  if (t.kind === 'water') { S.inv.sea++; S.f.sea = true; advance(5); say('바닷물 1통(200 g)을 떴습니다.'); return refresh(); }
  if (t.kind === 'box') return openBox();
  if (t.kind === 'altar') return window.Raid ? Raid.open(api) : null;
  const n = NODE[t.kind], o = t.ref, used = S.nodes[o.id] || 0;
  if (used >= n[2]) return say('오늘은 더 얻을 수 없습니다. (내일 다시 자랍니다)');
  S.nodes[o.id] = used + 1; S.inv[n[0]] += n[1]; advance(5);
  say(`${ITEM[n[0]][1]} +${n[1]}`);
  puff(t.x, t.y, '#ffffff', 5);
  refresh();
}
function openBox() {
  if (S.boxDay === S.day) return say('오늘의 보급품은 이미 받았습니다.');
  S.boxDay = S.day;
  const nAir = C.moles(1, 0.5, 25);
  for (const k of ['N2', 'N2', 'N2', 'O2', 'O2', 'O2', 'He']) S.caps.push({ k, n: nAir });
  S.inv.sugar += 100; S.inv.salt += 10;
  say('광장 보급품: 질소·산소 캡슐 3개씩, 헬륨 캡슐 1개, 설탕 100 g, 소금 10 g');
  refresh();
}

// ---------- 건설 (평평한 땅에 2x2 장치) ----------
let mode = null;   // 'build:<id>' | 'demolish'
const mouse = { x: 0, y: 0 };
const cam = { x: 0, y: 0 };
function ghostCheck(id) {
  const wx = cam.x + mouse.x, tx = Math.floor(wx / T - 1 + 0.5), def = DEV[id];
  if (tx < 1 || tx + 2 >= WW) return { ok: false, tx, msg: '여기에는 지을 수 없습니다.' };
  const g = GY[tx];
  const top = [tileAt(tx, g), tileAt(tx + 1, g)];
  if (g !== GY[tx + 1] || g > 25 || !top.every(t => t === GRASS || t === SAND || t === SNOWTOP)) return { ok: false, tx, msg: '평평한 땅에 지어야 합니다.' };
  const dev = { x: tx, y: g - 2 };
  if (S.placed.some(d => Math.abs(d.x - tx) < 2)) return { ok: false, tx, msg: '다른 장치와 겹칩니다.' };
  if (OBJS.some(o => o.type === 'tree' ? (o.x >= tx - 1 && o.x <= tx + 2) : (o.x >= tx - (o.type === 'altar' ? 1 : 0) && o.x <= tx + 1))) return { ok: false, tx, msg: '자원 오브젝트와 겹칩니다.' };
  if (Math.abs(tx * T - S.px) > 8 * T) return { ok: false, tx, msg: '너무 멉니다. 가까이 가서 지으세요.' };
  if (def.needFire && !fireNear(dev).length) return { ok: false, tx, msg: `${def.name}은(는) 화덕 바로 옆에 지어야 합니다. (열 전달)` };
  return { ok: true, tx, ty: g - 2 };
}
function placeAtMouse() {
  if (mode === 'demolish') {
    const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
    const d = S.placed.find(p => wx >= p.x * T && wx < p.x * T + 32 && wy >= p.y * T && wy < p.y * T + 32);
    if (!d) return say('철거할 장치를 클릭하세요.');
    for (const k in DEV[d.id].cost) S.inv[k] += DEV[d.id].cost[k];
    S.placed.splice(S.placed.indexOf(d), 1);
    say(`${DEV[d.id].name}을(를) 철거하고 재료를 돌려받았습니다.`);
    mode = null; return refresh();
  }
  const id = mode.slice(6), def = DEV[id], g = ghostCheck(id);
  if (!g.ok) return say(g.msg);
  if (!has(def.cost)) return say('재료가 부족합니다.');
  pay(def.cost);
  const s = { fire: { level: 0, fuel: 0 },
    still: { w: 0, ns: 0, outW: 0, outS: 0, run: false, T: 25 },
    cooker: { run: false, prog: 0, valve: 2, saltG: 0, water: 300, T: 25 },
    cooler: {}, collector: {} }[id];
  S.placed.push({ id, x: g.tx, y: g.ty, s });
  if (id === 'fire') S.f.fire = true;
  say(`${def.name}을(를) 지었습니다.`);
  logEv('건설', `${def.name} (${g.tx})`);
  mode = null; refresh();
}

// ---------- 모달 ----------
let modalTick = null, modalCloseHook = null;
const TITLE_ICON = { '화덕': 'fire', '증류기': 'still', '압력 밥솥': 'cooker', '냉각 상자': 'cooler', '기체 포집기': 'collector' };
function openModal(title, html, tick, onClose) {
  const t = pix(title);
  const key = Object.keys(TITLE_ICON).find(k => t.includes(k));
  $('mtitle').innerHTML = (key ? ic(TITLE_ICON[key]) : '') + t;
  $('mbody').innerHTML = pix(html);
  $('modal').hidden = false; modalTick = tick || null; modalCloseHook = onClose || null;
  clearKeys();
  if (modalTick) modalTick();
}
function closeModal() { $('modal').hidden = true; if (modalCloseHook) modalCloseHook(); modalTick = null; modalCloseHook = null; save(); refresh(); }
$('mclose').onclick = closeModal;
$('modal').addEventListener('mousedown', e => { if (e.target === $('modal')) closeModal(); });
const set = (id, t) => { const e = $(id); if (e) e.textContent = pix(t); };
const setw = (id, pct, cls) => { const e = $(id); if (e) { e.style.width = Math.max(0, Math.min(100, pct)) + '%'; if (cls !== undefined) e.parentElement.className = 'bar ' + cls; } };

// ---------- 장치 패널 ----------
function openDevice(d) {
  ({ fire: uiFire, still: uiStill, cooker: uiCooker, cooler: uiCooler, collector: uiCollector }[d.id])(d);
}
let curDev = null;
window.act = (name, arg) => { ACT[name](curDev, arg); if (modalTick) modalTick(); refresh(); };
const ACT = {};

function uiFire(d) {
  curDev = d;
  openModal('화덕', `
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
  openModal('증류기', `
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
  openModal('압력 밥솥', `
    <div class="grid2"><div class="box"><h4>재료 투입</h4>
      <div class="kv"><span>필요</span><span>증류수 300 g + 면 1개</span></div>
      <div class="row"><label>소금(스프) <input type="number" id="c-salt" min="0" max="30" step="5" value="${d.s.saltG}" style="width:64px"> g</label></div>
      <div class="row" style="margin-top:6px"><label>추 / 밸브 <select id="c-valve">${VALVE_NAME.map((n, i) => `<option value="${i}" ${i === d.s.valve ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="act('cook')">넣고 조리 시작</button>
      <button onclick="act('take')">라면 꺼내기</button><button onclick="act('repair')">수리(나뭇가지 2)</button></div></div>
    <div class="box"><h4>내부 상태</h4>
      <div class="kv"><span>화덕 열원</span><b id="c-T"></b></div>
      <div class="kv"><span>내부 압력</span><b id="c-P"></b></div>
      <div class="kv"><span>그 압력의 끓는점</span><b id="c-tb"></b></div>
      <div class="kv"><span>조리 속도</span><b id="c-sp"></b></div>
      <div class="bar"><i id="c-bar"></i></div><div id="c-st" class="mut"></div></div></div>
    <div class="warnbox">압력이 높을수록 끓는점이 높아져 같은 라면이 더 빨리 익습니다. 조리 속도는 온도가 10 ℃ 오를 때마다 2배(경험칙 가정). 압력이 ${C.PBURST} atm을 넘으면 터집니다. 열원이 끓는점보다 낮으면 그 압력까지 도달하지 못합니다.</div>`,
  () => {
    const s = d.s, T0 = heatOf(d);
    s.valve = +($('c-valve') ? $('c-valve').value : s.valve);
    s.saltG = s.run ? s.saltG : +($('c-salt') ? $('c-salt').value : s.saltG);
    const cs = cookerState(s, T0);
    set('c-T', fmt(T0, 0) + ' ℃'); set('c-P', fmt(cs.pIn, 2) + ' atm'); set('c-tb', fmt(cs.Teff, 1) + ' ℃');
    set('c-sp', 'x' + fmt(cs.speed, 2)); setw('c-bar', s.prog / 18 * 100, cs.pIn > 2.7 ? 'bad' : 'good');
    set('c-st', s.broken ? '파손됨 — 수리가 필요합니다' : s.done ? '완성! 꺼내세요' : s.run ? `조리 중 (${fmt(s.prog / 18 * 100, 0)} %)` : '대기 중');
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
ACT.take = d => { if (!d.s.done) return say('아직 완성되지 않았습니다.'); d.s.done = false; S.inv.ramen++; S.f.ramenP = Math.max(S.f.ramenP, d.s.doneP); say('라면 1개를 얻었습니다.'); };
ACT.repair = d => { if (!d.s.broken) return; if (S.inv.stick < 2) return say('나뭇가지 2개가 필요합니다.'); S.inv.stick -= 2; d.s.broken = false; };

function uiCooler(d) {
  curDev = d;
  openModal('냉각 상자', `
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
  const t = C.coolTemp(iceN * 100, salt);
  S.packs.push({ T: t, M: iceN * 100, day: S.day });
  S.f.packT = Math.min(S.f.packT, t);
  logEv('한제 팩', `얼음 ${iceN * 100} g + 소금 ${salt} g → ${fmt(t, 1)} ℃`);
  advance(30); say(`${fmt(t, 1)} ℃ 한제 팩을 만들었습니다.`);
};

function uiCollector(d) {
  curDev = d;
  openModal('기체 포집기', `
    <div class="box">
      <div class="kv"><span>주사기 부피 V</span><b>0.5 L</b></div>
      <div class="kv"><span>외기 온도 / 압력</span><b id="g-T"></b></div>
      <div class="kv"><span>모이는 기체의 양 n = PV/RT</span><b id="g-n"></b></div>
      <div class="kv"><span>조성(몰분율)</span><b>N₂ 0.781 · O₂ 0.210 · Ar 0.010</b></div>
      <div class="kv"><span>기체 분압 (P_i = x_i·P)</span><b id="g-p"></b></div>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="act('cap')">공기 캡슐 만들기 (모래 1, 10분)</button></div>
      <div class="kv"><span>보유 캡슐</span><b id="g-c"></b></div></div>
    <div class="warnbox">공기는 반응하지 않는 기체의 혼합물이라 전체 압력은 분압의 합입니다(돌턴). 같은 압력·부피라도 온도가 낮을수록 더 많은 기체가 모입니다. 질소·산소·헬륨 캡슐은 광장 보급 상자에서 얻습니다. (공기에서 성분을 분리하려면 분별증류 등이 필요 — 이 섬에는 없음)</div>`,
  () => {
    const t = airTemp();
    set('g-T', fmt(t, 1) + ' ℃ / 1 atm'); set('g-n', fmt(C.moles(1, 0.5, t), 4) + ' mol');
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
  say('공기 캡슐 1개를 만들었습니다.');
};

// ---------- 메뉴 ----------
function openBuild() {
  const rows = Object.entries(DEV).map(([id, d]) => {
    const ok = unlocked(id);
    return `<div class="box row between"><div><b>${ic(id)} ${d.name}</b> ${ok ? '' : '<span class="no">잠김 — 목표 ' + d.unlock + '개 달성 시 해금</span>'}
      <div class="mut">${costText(d.cost)}${d.needFire ? ' · 화덕 옆에 설치' : ''}</div></div>
      <button ${ok && has(d.cost) ? '' : 'disabled'} onclick="G.startBuild('${id}')">짓기</button></div>`;
  }).join('');
  openModal('건설', rows + `<div class="mut">평평한 땅(풀·모래·눈)에 2x2 칸으로 짓습니다. 지을 곳에 마우스를 두고 클릭하세요.</div>
    <div class="row" style="margin-top:6px"><button class="danger" onclick="G.startDemolish()">철거 모드 (재료 환급)</button></div>`);
}
function openCraft() {
  openModal('제작', RECIPES.map(r => `<div class="box row between"><div><b>${ic(ITEM[r.out][0])} ${ITEM[r.out][1]}</b>
    <div class="mut">${costText(r.cost)} — ${r.note}</div></div><button ${has(r.cost) ? '' : 'disabled'} onclick="G.craft('${r.id}')">만들기</button></div>`).join(''));
}
function openLog() {
  const rows = S.log.slice().reverse().map(l => `<div><span class="mut">${l.day}일 ${l.t}</span> <b>[${l.type}]</b> ${l.text}</div>`).join('') || '<span class="mut">아직 기록이 없습니다.</span>';
  openModal('자동 기록', `<div class="warnbox">시험 플레이에서 일어난 일(폭발·수거·목표 등)이 자동으로 쌓입니다. 개발 기록의 ‘문제 발견 → 원인 → 수정 → 화학적 근거 → 결과 비교’를 쓸 때 증빙으로 사용하세요.</div>
    <textarea id="memo" placeholder="내가 발견한 문제·가설 메모">${S.memo}</textarea>
    <div class="row" style="margin:6px 0"><button onclick="G.copyLog()">기록 복사</button></div>
    <div class="log">${rows}</div>`, null, () => { const m = $('memo'); if (m) S.memo = m.value; });
}
function openSave() {
  openModal('저장/초기화', `<p>진행 상황은 이 브라우저에 자동 저장됩니다.</p>
    <div class="row"><button onclick="G.save()">지금 저장</button><button class="danger" onclick="G.reset()">처음부터 다시 시작</button></div>`);
}

// ---------- 공개 API (raid.js, notes.js) ----------
const api = {
  S: () => S, say, logEv, openModal, closeModal, set, setw, fmt, refresh: () => refresh(), save,
  capCount, ITEM, airTemp, advance, Art,
};
window.G = {
  startBuild(id) { mode = 'build:' + id; $('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 곳을 클릭하세요. (ESC 취소)`); },
  startDemolish() { mode = 'demolish'; $('modal').hidden = true; say('철거할 장치를 클릭하세요. (ESC 취소)'); },
  craft(id) { const r = RECIPES.find(x => x.id === id); if (!has(r.cost)) return; pay(r.cost); S.inv[r.out] += r.n; advance(10); say(`${ITEM[r.out][1]} 제작`); openCraft(); refresh(); },
  copyLog() { const t = S.log.map(l => `${l.day}일 ${l.t} [${l.type}] ${l.text}`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(t).then(() => say('복사했습니다.'), () => say('복사 권한이 없습니다.')); },
  save() { save(); say('저장했습니다.'); },
  debug: () => S,   // 시험 플레이/자동 점검용: 현재 상태 조회
  reset() { if (confirm('모든 진행이 사라집니다. 정말 처음부터 시작할까요?')) { S = newState(); save(); closeModal(); refresh(); } },
};

// ---------- HUD (DOM) ----------
function refresh() {
  $('clock').textContent = clockText() + ` · ${fmt(airTemp(), 0)}℃`;
  const slot = (icon, name, n) => `<div class="slot" title="${name}"><i class="ic" style="background-image:url(${Art.iconURL[icon]})"></i><b>${n}</b></div>`;
  $('inv').innerHTML = Object.entries(S.inv).filter(([, v]) => v >= 1)
    .map(([k, v]) => slot(ITEM[k][0], ITEM[k][1], Math.floor(v))).join('')
    + (S.caps.length ? slot('cap', '기체 캡슐 (' + capText() + ')', S.caps.length) : '') + (S.packs.length ? slot('pack', '한제 팩', S.packs.length) : '');
  checkQuests();
  const q = QUESTS[S.qDone];
  $('quest').innerHTML = QUESTS.slice(0, S.qDone).map(x => `<div class="q done">${x.t}</div>`).join('')
    + (q ? `<div class="q"><b>${q.t}</b><small>${q.hint}</small></div>` : '<div class="q done">모든 목표 달성! 계속 실험해 보세요.</div>');
}

// ---------- 입력 ----------
const keys = { left: false, right: false, jump: false };
function clearKeys() { keys.left = keys.right = keys.jump = false; }
const KEYMAP = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'jump', arrowup: 'jump', ' ': 'jump' };
window.addEventListener('keydown', e => {
  if (!$('modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) { keys[KEYMAP[k]] = true; e.preventDefault(); }
  else if (k === 'e') interact(targets()[0]);
  else if (k === 'escape' && mode) { mode = null; say('취소'); }
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys[k] = false; });
const cv = $('cv'), ctx = cv.getContext('2d');
cv.width = VW; cv.height = VH; ctx.imageSmoothingEnabled = false;
function canvasPos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH }; }
cv.addEventListener('mousemove', e => Object.assign(mouse, canvasPos(e)));
cv.addEventListener('click', e => {
  Object.assign(mouse, canvasPos(e));
  if (!$('modal').hidden) return;
  if (mode) return placeAtMouse();
  const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
  const t = targets().filter(o => Math.hypot(o.x - wx, o.y - wy) < 26).sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
  if (t) interact(t);
});
// 화면 터치 패드
document.querySelectorAll('#pad button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); if (k === 'e') interact(targets()[0]); else keys[k] = true; };
  const off = e => { e.preventDefault(); if (k !== 'e') keys[k] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
document.querySelectorAll('.speed button').forEach(b => b.onclick = () => {
  S.speed = +b.dataset.sp; document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', x === b));
});
$('b-build').onclick = openBuild; $('b-craft').onclick = openCraft; $('b-log').onclick = openLog; $('b-save').onclick = openSave;
$('b-notes').onclick = () => window.Notes && Notes.open(api);

// ---------- 물리 ----------
let onGround = false;
const collides = (x, y) => {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + PW - 0.01) / T), y0 = Math.floor(y / T), y1 = Math.floor((y + PH - 0.01) / T);
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) return true;
  return false;
};
function physics(dt) {
  const modalOpen = !$('modal').hidden;
  const inW = tileAt(Math.floor((S.px + PW / 2) / T), Math.floor((S.py + PH / 2) / T)) === WATER;
  const ax = modalOpen ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  S.vx = ax * (inW ? 42 : 72);
  if (ax) S.face = ax;
  if (!modalOpen && keys.jump) {
    if (inW) S.vy = Math.max(S.vy - 700 * dt, -60);
    else if (onGround) { S.vy = -270; onGround = false; }
  }
  S.vy = Math.min(S.vy + (inW ? 300 : 900) * dt, inW ? 70 : 400);
  const nx = S.px + S.vx * dt;
  if (!collides(nx, S.py)) S.px = nx;
  else if (onGround && ax && !collides(nx, S.py - T)) { S.px = nx; S.py -= T; }   // 한 칸 턱은 자동으로 오름
  S.px = Math.max(0, Math.min(WW * T - PW, S.px));
  const ny = S.py + S.vy * dt;
  if (!collides(S.px, ny)) S.py = ny;
  else { if (S.vy > 0) S.py = Math.floor((ny + PH) / T) * T - PH; else S.py = (Math.floor(ny / T) + 1) * T; S.vy = 0; }
  onGround = collides(S.px, S.py + 1);
}

// ---------- 파티클 ----------
const parts = [];
function puff(x, y, col, n) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 14, life: 0.6 + Math.random() * 0.5, col, s: 2 }); }
function burst(d) { puff(d.x * T + 16, d.y * T + 8, '#ff7a3d', 14); puff(d.x * T + 16, d.y * T + 8, '#4a4f56', 10); }
function stepParts(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
  if (parts.length > 200) parts.splice(0, 50);
}

// ---------- 그리기 ----------
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;
const stars = Array.from({ length: 40 }, (_, i) => [(i * 97) % VW, (i * 53) % 120]);
let last = performance.now(), tt = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; tt += dt;
  physics(dt); stepParts(dt);
  draw(tt);
  requestAnimationFrame(frame);
}
function draw(t) {
  const hour = S.min / 60, night = nightOf(hour);
  cam.x = Math.max(0, Math.min(WW * T - VW, Math.round(S.px + PW / 2 - VW / 2)));
  cam.y = Math.max(0, Math.min(WH * T - VH, Math.round(S.py + PH / 2 - VH / 2 - 12)));
  // 하늘(띠) + 별 + 해/달
  const bands = Art.sky(hour, 9);
  for (let i = 0; i < bands.length; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(0, Math.floor(i * VH / bands.length), VW, Math.ceil(VH / bands.length) + 1); }
  if (night > 0) { ctx.fillStyle = `rgba(255,255,255,${night * 0.8})`; for (const [x, y] of stars) ctx.fillRect(x, y, 1, 1); }
  const sunT = (hour - 6) / 12, moonT = ((hour + 6) % 24) / 12;
  if (sunT >= 0 && sunT <= 1) ctx.drawImage(Art.sun, Math.round(sunT * (VW - 16)), Math.round(60 - Math.sin(sunT * Math.PI) * 46));
  if (moonT >= 0 && moonT <= 1) ctx.drawImage(Art.moon, Math.round(moonT * (VW - 16)), Math.round(60 - Math.sin(moonT * Math.PI) * 46));
  for (let i = 0; i < 4; i++) { const cx = ((i * 140 - t * 4 - cam.x * 0.1) % (VW + 64) + VW + 64) % (VW + 64) - 32; ctx.globalAlpha = 1 - night * 0.7; ctx.drawImage(Art.cloud, Math.round(cx), 18 + (i % 2) * 22); ctx.globalAlpha = 1; }
  // 먼 산·언덕 (시차)
  const horizon = 24 * T - cam.y;
  for (const [img, f, dy] of [[Art.farHills, 0.2, 96], [Art.nearHills, 0.45, 70]]) {
    const off = -Math.floor((cam.x * f) % 512);
    for (let x = off; x < VW; x += 512) ctx.drawImage(img, x, horizon - dy);
  }
  if (night > 0) { ctx.fillStyle = `rgba(8,12,40,${night * 0.55})`; ctx.fillRect(0, 0, VW, Math.max(0, horizon + 6)); }
  // 지하 배경
  const caveY = 31 * T - cam.y; if (caveY < VH) { ctx.fillStyle = '#2a1c12'; ctx.fillRect(0, Math.max(0, caveY), VW, VH); }
  // 타일
  const x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T);
  const drawW = [];
  for (let ty = y0; ty <= y0 + VH / T + 1; ty++) for (let tx = x0; tx <= x0 + VW / T + 1; tx++) {
    const id = tileAt(tx, ty); if (id === AIR) continue;
    const sx = tx * T - cam.x, sy = ty * T - cam.y;
    if (id === WATER) {
      ctx.fillStyle = ty - 25 < 2 ? '#3a8fd0' : ty - 25 < 4 ? '#2c78b8' : '#1f64a0'; ctx.fillRect(sx, sy, T, T);
      drawW.push([sx, sy, tileAt(tx, ty - 1) !== WATER]); continue;
    }
    const v = (tx * 7 + ty * 13) % 3;
    const set = id === GRASS ? Art.tiles.grass : id === DIRT ? Art.tiles.dirt : id === STONE ? Art.tiles.stone : id === SAND ? Art.tiles.sand : id === SNOWTOP ? Art.tiles.snowtop : Art.tiles.ice;
    ctx.drawImage(set[v], sx, sy);
    if (ty > 26) { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, (ty - 26) * 0.03)})`; ctx.fillRect(sx, sy, T, T); }
  }
  // 오브젝트
  for (const o of OBJS) {
    const sx = o.x * T - cam.x, sy = o.y * T - cam.y, n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    if (sx < -48 || sx > VW + 48) continue;
    ctx.globalAlpha = spent ? 0.4 : 1;
    if (o.type === 'tree') ctx.drawImage(Art.obj.tree, sx - 8, sy - 48);
    else if (o.type === 'cane') ctx.drawImage(Art.obj.cane, sx, sy - 32);
    else if (o.type === 'wheat') ctx.drawImage(Art.obj.wheat, sx, sy - 20);
    else if (o.type === 'sandpile') ctx.drawImage(Art.obj.sandpile, sx, sy - 8);
    else if (o.type === 'icecrystal') ctx.drawImage(Art.obj.icecrystal, sx, sy - 24);
    else if (o.type === 'box') ctx.drawImage(Art.obj.box, sx, sy - 16);
    else if (o.type === 'altar') { ctx.drawImage(Art.dev.altar, sx, sy - 32); if (!S.f.boss && Math.floor(t * 2) % 2) { ctx.fillStyle = '#fff1c0'; ctx.fillRect(sx + 10, sy - 18, 2, 2); ctx.fillRect(sx + 20, sy - 18, 2, 2); } }
    ctx.globalAlpha = 1;
  }
  // 장치
  const tg = targets()[0];
  for (const d of S.placed) {
    const sx = d.x * T - cam.x, sy = d.y * T - cam.y;
    ctx.drawImage(Art.dev[d.id], sx, sy);
    if (d.id === 'fire') Art.flame(ctx, sx, sy, d.s.level, t);
    if (d.id === 'collector') { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) ctx.fillRect(sx + 8 + i * 4, sy + 26 - ((t * 10 + i * 7) % 16), 2, 2); }
    if ((d.id === 'still' || d.id === 'cooker') && d.s.run && Math.random() < 0.25) puff(d.x * T + (d.id === 'still' ? 11 : 16), d.y * T + 2, 'rgba(235,245,255,.85)', 1);
    if (d.id === 'cooker' && d.s.broken) { ctx.fillStyle = '#e74c3c'; ctx.fillRect(sx + 12, sy + 12, 8, 2); ctx.fillRect(sx + 15, sy + 9, 2, 8); }
    if (d.id === 'cooker' && d.s.done) { ctx.fillStyle = '#ffe066'; ctx.fillRect(sx + 14, sy - 6 - Math.round(Math.sin(t * 6) * 2), 4, 4); }
    if (d.id === 'fire' && d.s.level > 0 && Math.random() < 0.1 * d.s.level) puff(d.x * T + 16, d.y * T + 10, '#ffb347', 1);
  }
  // 플레이어
  const moving = Math.abs(S.vx) > 1, fr = !onGround ? 1 : moving ? 1 + (Math.floor(t * 8) % 2) : 0;
  ctx.save();
  const px = Math.round(S.px - 3 - cam.x), py = Math.round(S.py - 2 - cam.y);
  if (S.face < 0) { ctx.translate(px + 16, py); ctx.scale(-1, 1); ctx.drawImage(Art.playerFrames[fr], 0, 0); } else ctx.drawImage(Art.playerFrames[fr], px, py);
  ctx.restore();
  // 파티클
  for (const p of parts) { ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.s, p.s); }
  ctx.globalAlpha = 1;
  // 물 (반투명 + 물결)
  for (const [sx, sy, surf] of drawW) {
    ctx.fillStyle = 'rgba(40,120,205,.58)'; ctx.fillRect(sx, sy, T, T);
    if (surf) { ctx.fillStyle = 'rgba(190,230,255,.9)'; const w = Math.floor(Math.sin(t * 2 + sx * 0.3) * 2); ctx.fillRect(sx, sy, T, 2); ctx.fillRect(sx + 4 + w, sy + 2, 4, 1); }
  }
  // 밤 어둠 + 불빛
  if (night > 0) {
    ctx.fillStyle = `rgba(8,12,40,${night * 0.5})`; ctx.fillRect(0, 0, VW, VH);
    for (const d of S.placed) if (d.id === 'fire' && d.s.level > 0) {
      const cx = d.x * T + 16 - cam.x, cy = d.y * T + 14 - cam.y;
      for (const [r, a] of [[46, 0.07], [32, 0.09], [20, 0.12]]) { ctx.fillStyle = `rgba(255,170,70,${a * night})`; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); }
    }
  }
  // 상호작용 표시(픽셀 화살표)
  if (tg && $('modal').hidden) {
    const ax = Math.round(tg.x - cam.x), ay = Math.round(tg.y - cam.y) - 24 + Math.round(Math.sin(t * 6) * 2);
    ctx.fillStyle = '#000'; ctx.fillRect(ax - 4, ay - 1, 9, 3); ctx.fillRect(ax - 3, ay + 2, 7, 2); ctx.fillRect(ax - 1, ay + 4, 3, 2);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax - 2, ay + 2, 5, 1); ctx.fillRect(ax, ay + 4, 1, 1);
  }
  const lbl = $('target'); const want = mode ? '건설/철거 모드 — 클릭해서 실행, ESC 취소' : tg ? `[E] ${tg.label}` : '이동: A/D · 점프: W/스페이스 · 상호작용: E 또는 클릭';
  if (lbl.textContent !== want) lbl.textContent = want;
  // 건설 고스트
  if (mode && mode.startsWith('build:')) {
    const id = mode.slice(6), g = ghostCheck(id);
    const gx = g.tx * T - cam.x, gy = (g.ok ? g.ty : GY[Math.max(0, Math.min(WW - 1, g.tx))] - 2) * T - cam.y;
    ctx.globalAlpha = 0.65; ctx.drawImage(Art.dev[id], gx, gy); ctx.globalAlpha = 1;
    ctx.strokeStyle = g.ok ? '#4cff7a' : '#ff5a4a'; ctx.lineWidth = 1; ctx.strokeRect(gx + 0.5, gy + 0.5, 31, 31);
  }
}

// 시계: 1초 = 게임 2분 (x1)
setInterval(() => { if (window.Raid && Raid.active) return; advance(S.speed); if (modalTick && !$('modal').hidden) modalTick(); refresh(); }, 500);
setInterval(save, 5000);
function fit() {   // 정수 배율로 크게(픽셀이 뭉개지지 않게)
  const w = $('left').clientWidth, k = Math.max(1, Math.floor(w / VW));
  cv.style.width = (w >= VW ? VW * k : w) + 'px';
}
window.addEventListener('resize', fit);
document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', +x.dataset.sp === S.speed));
refresh(); fit(); requestAnimationFrame(frame);
})();
