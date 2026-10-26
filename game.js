// 화학 섬 이야기 — 횡스크롤(단면 2D) 픽셀 월드, 시간, 장치 로직, UI
// 보스는 raid.js, 연구 노트는 notes.js, 그림은 sprites.js, 화학 식은 chem.js(Chem)만 사용한다.
(() => {
'use strict';
const C = Chem, Art = window.Art;
let VW = 384, VH = 224, K = 3;   // 창 크기에 맞춰 fit()이 정한다
const T = 16, WW = Sim.WORLD.WW, WH = Sim.WORLD.WH, KEY = 'chemisle_side_v1';
const PW = 10, PH = 18, REACH = 40;
const { FIRE_T, FIRE_BURN, FIRE_NAME, DEV, RECIPES, QUESTS, VALVE_NAME, SEA_BUCKET } = Sim;   // 데이터와 계산은 sim.js
// 아이템: [아이콘 키, 이름, 단위]
const ITEM = {
  stick: ['stick', '나뭇가지', '개'], sand: ['sand', '모래', '개'], sea: ['sea', '바닷물(200 g)', '통'],
  ice: ['ice', '얼음(100 g)', '개'], bottle: ['bottle', '유리병', '개'], syringe: ['syringe', '주사기', '개'],
  sugar: ['sugar', '설탕', 'g'], salt: ['salt', '소금', 'g'], water: ['water', '증류수', 'g'],
  noodle: ['noodle', '면', '개'], ramen: ['ramen', '라면', '개'],
  dirt: ['dirt', '흙', '개'], stone: ['stone', '돌', '개'],
  pickaxe: ['pickaxe', '곡괭이', '개'], shaker: ['shaker', '소금 뿌리개', '개'], thermo: ['thermo', '온도계', '개'],
};
const ICE_TILE_G = 100;   // 가정(임의값) 얼음·눈 타일 1칸의 질량(g) = 얼음 아이템 1개
const SHAKE_G = 10;       // 가정(임의값) 소금 뿌리개로 한 번에 뿌리는 소금(g)
const UNDER_T = 12;       // 가정(임의값) 지하 온도(℃): 깊이와 상관없이 일정하다고 가정
// ---------- 상태 ----------
const newState = Sim.newState, merge = Sim.merge;
let S = load() || newState();
function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    return j ? merge(j) : null;
  } catch { return null; }
}
let lastRemote = 0, lastRaftSave = 0, remoteWarned = false;
function save(force) {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 저장 불가 */ }
  if (!(window.Net && Net.user) || paused) return;
  const now = Date.now();
  if (!force && now - lastRemote < 4000) return;      // 서버 쓰기는 4초에 한 번만
  lastRemote = now;
  const snap = JSON.parse(JSON.stringify(S)); snap.log = snap.log.slice(-60);   // undefined/NaN 제거, 기록은 최근 것만
  if (Net.saveRaft && (force || now - lastRaftSave > 20000)) {   // 광장에 정박한 뗏목 요약(남은 읽기만): 장치 종류·위치·가동 여부 정도만 올린다
    lastRaftSave = now;
    Net.saveRaft({ cells: S.raft.cells, dock: S.raft.dock, t: now, devs: S.placed.filter(d => d.u !== undefined).map(d => ({ id: d.id, u: d.u, run: !!d.s.run, broken: !!d.s.broken })) }).catch(() => {});
  }
  Net.saveSave(snap).catch(() => { if (!remoteWarned) { remoteWarned = true; say('서버 저장에 실패했습니다. 인터넷 연결을 확인하세요.'); } });
}
let paused = false;   // 접속 화면이 떠 있는 동안 시간이 흐르지 않게

// ---------- 월드 (단면 타일맵) ----------
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, SNOWTOP = 5, ICE = 6, WATER = 7, RAFT = 8;
const SOLID = [0, 1, 1, 1, 1, 1, 1, 0, 1];
const MAP = new Uint8Array(WW * WH), GY = [];
const tileAt = (x, y) => (y < 0 ? AIR : (x < 0 || x >= WW || y >= WH) ? STONE : MAP[y * WW + x]);
const solidAt = (x, y) => SOLID[tileAt(x, y)] === 1;
const OBJS = [];
(function gen() {
  for (let x = 0; x < WW; x++) {
    let g;
    if (x <= 13) g = 30; else if (x <= 27) g = Math.round(30 - 6 * (x - 13) / 14); else if (x <= 34) g = 24 - Math.round(1.2 * Math.sin((x - 28) / 2.5)); else if (x <= 66) g = 24;
    else if (x <= 70) g = 24 - (x - 66); else if (x <= 74) g = 20; else if (x <= 78) g = 20 + (x - 74); else if (x <= 82) g = 24;
    else if (x <= 105) g = 24 - Math.round(1.5 * Math.sin((x - 83) / 3)); else if (x <= 112) g = Math.round(24 + 6 * (x - 105) / 7);
    else if (x >= 118 && x <= 125) g = Math.round(24 + 6 * (125 - x) / 7);          // 광장섬 서쪽 해안(시작섬 동쪽 해안과 마주 봄: 바다 폭 5칸)
    else if (x >= 126 && x <= 194) g = 24;
    else if (x >= 195 && x <= 202) g = Math.round(24 + 6 * (x - 195) / 7);          // 광장섬 동쪽 해안
    else if (x >= 213 && x <= 220) g = Math.round(24 + 6 * (220 - x) / 7);          // 고산 섬(고원 호수 섬) 서쪽 해안
    else if (x >= 221 && x <= 278) g = 24 - Math.round(2 * Math.abs(Math.sin((x - 221) / 4)));   // 위로만 솟은 완만한 언덕(물웅덩이가 생기지 않게)
    else if (x >= 279 && x <= 286) g = Math.round(24 + 6 * (x - 279) / 7);
    else if (x >= 303 && x <= 310) g = Math.round(24 + 6 * (310 - x) / 7);          // 극지 섬 서쪽 해안
    else if (x >= 311 && x <= 368) g = 24;
    else if (x >= 369 && x <= 376) g = Math.round(24 + 6 * (x - 369) / 7);
    else g = 30;                                                                      // 바다 밑바닥(섬 사이)
    GY[x] = g;
    const plaza = x >= 118 && x <= 202, alpine = x >= 213 && x <= 286, polar = x >= 303 && x <= 376;
    const beach = x <= 27 || (x >= 106 && x <= 117) || (plaza && (x <= 126 || x >= 194)) || (alpine && (x <= 220 || x >= 279)),
      snow = (x >= 83 && x <= 105) || polar, pond = (x >= 90 && x <= 94) || (x >= 330 && x <= 340);
    for (let y = g; y < WH; y++) {
      const d = y - g;
      MAP[y * WW + x] = d === 0 ? (pond ? ICE : beach ? SAND : snow ? SNOWTOP : GRASS)
        : d <= (alpine ? 1 : 4) ? (pond && d <= 1 ? ICE : beach ? SAND : DIRT) : STONE;   // 고산 섬은 흙이 얇고 바위가 많다
    }
    for (let y = 25; y < g; y++) MAP[y * WW + x] = WATER;
  }
  // 광장섬의 항구 연못(정박한 다른 사람의 뗏목이 떠 있는 곳): 윗줄은 비우고 물을 채운다
  for (let x = 152; x <= 191; x++) { MAP[24 * WW + x] = AIR; for (let y = 25; y <= 27; y++) MAP[y * WW + x] = WATER; MAP[28 * WW + x] = SAND; }
  for (const [cx, cy, r] of [[50, 37, 5], [70, 41, 6], [92, 38, 5], [30, 45, 6], [60, 48, 4]]) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r * 2; x <= cx + r * 2; x++) {
      if (((x - cx) / 2) ** 2 + (y - cy) ** 2 <= r * r) MAP[y * WW + x] = AIR;
    }
  }
  const add = (type, x) => OBJS.push({ id: type[0] + type[1] + x, type, x, y: GY[x] });
  [29, 32, 35, 68, 77, 80, 85, 98].forEach(x => add('tree', x));
  [26, 27].forEach(x => add('cane', x));
  [36, 37, 38].forEach(x => add('wheat', x));
  [24, 25, 106].forEach(x => add('sandpile', x));
  [86, 89, 95, 97, 100].forEach(x => add('icecrystal', x));
  add('harbor', 102); add('fragment', 104);                                          // 시작섬: 항구 표지판, 해안의 뗏목 파편
  [143, 146].forEach(x => add('tree', x)); [147, 148].forEach(x => add('wheat', x)); add('cane', 149);   // 광장섬
  add('harbor', 129); add('box', 133); add('board', 137); add('altar', 140);
  // 탐험섬: 고산 섬(저압: 암염과 소나무)과 극지 섬(영하: 얼음, 나무 없음)
  add('harbor', 223); [226, 231, 236, 252, 262, 270].forEach(x => add('tree', x)); [241, 255, 267].forEach(x => add('rocksalt', x));
  add('harbor', 313); [316, 319, 323, 327, 346, 350, 354, 358].forEach(x => add('icecrystal', x));        // 광장섬: 항구 표지판, 보급 상자, 유리병 편지 게시판, 솥 골렘 제단
})();
// 땅 파기/놓기로 바뀐 타일만 S.dug(타일 번호 y*WW+x → 새 종류)에 저장한다. S가 바뀔 때마다 기본 지형 위에 다시 입힌다.
const BASE = MAP.slice();
function applyDug() {
  MAP.set(BASE);
  for (const k in S.dug) { const v = S.dug[k]; if (v != null && k >= 0 && k < MAP.length) MAP[k] = v; }
  Sim.syncRaft(S);   // 뗏목 바닥 타일: 해안 쪽 끝에서 바다 쪽으로 cells칸 (저장하지 않고 S.raft에서 계산)
  for (const x of Sim.raftXs(S)) MAP[Sim.RAFT.ROW * WW + x] = RAFT;
}
applyDug();
// 종류별 [얻는 아이템, 1회 양, 하루 횟수, 이름, 중심 y 오프셋(위로 몇 px)]
const NODE = {
  tree: ['stick', 2, 2, '나무', 16], cane: ['sugar', 50, 2, '사탕수수', 8], wheat: ['noodle', 1, 2, '밀', 8],
  sandpile: ['sand', 2, 4, '모래 더미', 4], icecrystal: ['ice', 1, 3, '얼음 결정', 10],
  rocksalt: ['salt', 30, 2, '암염', 8],   // NaCl 결정(이온 결정이라 녹는점이 높아 곡괭이로 캔다)   [#24]
};

// ---------- 유틸 ----------
const $ = id => document.getElementById(id);
const fmt = (v, d = 1) => Number(v).toFixed(d);
const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;   // 그림 문자는 쓰지 않는다(전부 픽셀 아이콘)
const pix = s => String(s).replace(EMO, '').replace(/^\s+/, '');
const ic = k => `<i class="ic" style="background-image:url(${Art.iconURL[k]})"></i>`;
const clockText = () => `${S.day}일차 ${String(Math.floor(S.min / 60)).padStart(2, '0')}:${String(Math.floor(S.min % 60)).padStart(2, '0')}`;
const airTemp = () => Sim.airTemp(S);   // ℃: chem.js의 시각별 기온 + 섬별 보정(sim.js ENV)
const pAtm = () => Sim.pAtm(S);         // 외기 압력(atm): 섬마다 다르다(고산 섬은 낮음)
let msgTimer;
function say(t) { $('msg').textContent = pix(t); clearTimeout(msgTimer); msgTimer = setTimeout(() => $('msg').textContent = '', 6000); }
function logEv(type, text) { S.log.push({ day: S.day, t: clockText(), type, text: pix(text) }); if (S.log.length > 300) S.log.shift(); }
const has = cost => Sim.has(S, cost);
const pay = cost => Sim.pay(S, cost);
const costText = cost => Object.entries(cost).map(([k, v]) => `${ic(ITEM[k][0])}${ITEM[k][1]} ${v}`).join(' · ');
const unlocked = id => Sim.unlocked(S, id);
// 계산(sim.js)이 쌓은 이벤트를 화면에 반영한다: 말풍선·폭발 연기·늑대 효과·목표 갱신
function flush() {
  for (const e of Sim.drain()) {
    if (e.t === 'say') say(e.text);
    else if (e.t === 'burst') burst(e.d);
    else if (e.t === 'puffWolf') puff(...wolfPos(e.m), '#d8f3ff', 10);
    else if (e.t === 'refresh') refresh();
    else if (e.t === 'moved') { applyDug(); loadPlaza(); }
  }
}
const advance = dm => { Sim.advance(S, dm); flush(); };
const heatOf = d => Sim.heatOf(S, d), fireNear = d => Sim.fireNear(S, d), cookerState = Sim.cookerState;

// ---------- 땅 파기 · 블록 놓기 ----------
// 타일별 [얻는 아이템, 파는 데 걸리는 시간(초, 마우스 꾹 누르기)]. 시간은 모두 가정(임의값): 흙·모래 짧게, 눈·얼음 중간, 돌은 곡괭이가 필요(2단계)하고 오래
const DIG = {
  [GRASS]: { item: 'dirt', t: 0.5 }, [DIRT]: { item: 'dirt', t: 0.5 }, [SAND]: { item: 'sand', t: 0.4 },
  [SNOWTOP]: { item: 'ice', t: 0.8 }, [ICE]: { item: 'ice', t: 1.0 },
  [STONE]: { item: 'stone', t: 2.0, tool: 'pickaxe' },
};
const BLOCK = { dirt: DIRT, stone: STONE, sand: SAND };   // 가방에서 꺼내 놓을 수 있는 블록
const dig = { on: false, tx: -1, ty: -1, p: 0, need: 0 };
const mouseTile = () => [Math.floor((cam.x + mouse.x) / T), Math.floor((cam.y + mouse.y) / T)];
const inReach = (tx, ty) => Math.hypot(tx * T + T / 2 - (S.px + PW / 2), ty * T + T / 2 - (S.py + PH / 2)) <= REACH;
// 장치·오브젝트가 서 있는 바로 아래 땅은 파지 못한다
function holdsThing(tx, ty) {
  if (S.placed.some(d => ty === d.y + 2 && (tx === d.x || tx === d.x + 1))) return true;
  return OBJS.some(o => ty === o.y && (tx === o.x || (o.type === 'altar' && tx === o.x + 1)));
}
function digCheck(tx, ty) {
  const id = tileAt(tx, ty);
  if (!DIG[id]) return { ok: false, msg: id === WATER ? '물은 팔 수 없습니다.' : '' };
  if (ty >= WH - 1) return { ok: false, msg: '맨 아래는 팔 수 없습니다.' };
  if (!inReach(tx, ty)) return { ok: false, msg: '' };
  if (holdsThing(tx, ty)) return { ok: false, msg: '장치나 자원 바로 아래 땅은 팔 수 없습니다.' };
  const def = DIG[id];
  if (def.tool && !(S.inv[def.tool] > 0)) return { ok: false, msg: '돌은 곡괭이가 있어야 팔 수 있어요.' };
  return { ok: true, def };
}
function setTile(tx, ty, id) {
  const k = ty * WW + tx;
  MAP[k] = id; delete S.melt[k];
  if (BASE[k] === id) delete S.dug[k]; else S.dug[k] = id;
}
function stepDig(dt) {
  if (!dig.on) return;
  if (!$('modal').hidden || mode) { dig.p = 0; return; }
  const [tx, ty] = mouseTile();
  if (tx !== dig.tx || ty !== dig.ty) { dig.tx = tx; dig.ty = ty; dig.p = 0; dig.msg = false; }
  const c = digCheck(tx, ty);
  if (!c.ok) { dig.p = 0; if (c.msg && !dig.msg) { dig.msg = true; say(c.msg); } return; }
  dig.need = c.def.t; dig.p += dt;
  if (dig.p < c.def.t) return;
  const id = tileAt(tx, ty);
  setTile(tx, ty, AIR); S.inv[c.def.item] = (S.inv[c.def.item] || 0) + 1; dig.p = 0;
  puff(tx * T + 8, ty * T + 8, id === STONE ? '#8b919c' : id === SAND ? '#f6e7b0' : id === ICE || id === SNOWTOP ? '#d8f3ff' : '#8a5a35', 6);
  say(`${ITEM[c.def.item][1]} +1`);
}
function placeBlock() {
  const item = mode.slice(6), [tx, ty] = mouseTile();
  if (!(S.inv[item] >= 1)) { mode = null; return say(`${ITEM[item][1]}이(가) 없습니다.`); }
  if (tileAt(tx, ty) !== AIR || ty >= WH || tx < 0 || tx >= WW) return say('빈 공간에만 놓을 수 있습니다.');
  if (!inReach(tx, ty)) return say('너무 멉니다.');
  if (tx * T < S.px + PW && tx * T + T > S.px && ty * T < S.py + PH && ty * T + T > S.py) return say('내가 서 있는 자리에는 놓을 수 없습니다.');
  if (S.placed.some(d => tx >= d.x && tx <= d.x + 1 && ty >= d.y && ty <= d.y + 1) || OBJS.some(o => ty >= o.y - 3 && ty < o.y && tx >= o.x - 1 && tx <= o.x + 2)) return say('장치나 자원 자리에는 놓을 수 없습니다.');
  if (!(solidAt(tx - 1, ty) || solidAt(tx + 1, ty) || solidAt(tx, ty - 1) || solidAt(tx, ty + 1))) return say('땅에 닿은 곳에만 놓을 수 있습니다.');
  S.inv[item]--; setTile(tx, ty, BLOCK[item]);
  if (S.inv[item] < 1) mode = null;
}

// ---------- 도구: 소금 뿌리개 · 온도계 (곡괭이는 돌을 팔 때 자동으로 쓰인다) ----------
const TOOL = { shaker: 'salt', thermo: 'thermo' };   // 가방 슬롯을 누르면 켜지는 도구 모드
const tileTemp = (tx, ty) => (tx >= 0 && tx < WW && ty > GY[tx] ? UNDER_T : airTemp());
function useThermo() {
  const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
  const t = targets().find(o => o.kind === 'dev' && Math.hypot(o.x - wx, o.y - wy) < 26);
  let name, val, note;
  if (t) {
    const d = t.ref; name = DEV[d.id].name;
    if (d.id === 'fire') { const on = d.s.level > 0 && d.s.fuel > 0; val = on ? FIRE_T[d.s.level] : airTemp(); note = on ? `열원 (${FIRE_NAME[d.s.level]})` : '꺼져 있어 외기와 같음'; }
    else if (d.id === 'still' || d.id === 'cooker') { val = heatOf(d); note = '옆 화덕이 주는 열원 온도'; }
    else if (d.id === 'cooler') { const has = S.packs.length > 0; val = has ? Math.min(...S.packs.map(p => p.T)) : airTemp(); note = has ? '가장 찬 한제 팩' : '팩이 없어 외기와 같음'; }
    else { val = airTemp(); note = '외기와 같음'; }
  } else {
    const [tx, ty] = mouseTile();
    if (!inReach(tx, ty)) return say('너무 멉니다. 가까이 가서 재세요.');
    const under = tx >= 0 && tx < WW && ty > GY[tx];
    val = tileTemp(tx, ty); name = under ? `지하 (${tx}, ${ty})` : `외기 (${tx}, ${ty})`;
    note = under ? `가정: 지하는 깊이와 상관없이 ${UNDER_T} ℃로 일정` : '시각에 따라 변하는 외기 온도';
  }
  say(`온도계: ${name} ${fmt(val, 1)} ℃ — ${note}`);
  logEv('온도 측정', `${name} ${fmt(val, 1)}℃ (${note})`);
}
function useShaker() {
  if (S.inv.salt < 1) return say('소금이 없습니다.');
  const T = airTemp(), wx = cam.x + mouse.x, wy = cam.y + mouse.y;
  const w = targets().find(o => o.kind === 'wolf' && Math.hypot(o.x - wx, o.y - wy) < 26);
  const s = Math.min(SHAKE_G, S.inv.salt);
  if (w) return saltOnWolf(w.ref, s);
  const [tx, ty] = mouseTile(), id = tileAt(tx, ty);
  if (id !== ICE && id !== SNOWTOP) return say('얼음·눈 타일이나 서리 늑대에게 뿌리세요.');
  if (!inReach(tx, ty)) return say('너무 멉니다.');
  const k = ty * WW + tx, had = S.melt[k] || 0, left = ICE_TILE_G - had, melt = C.iceMeltBySalt(T, s);
  if (melt <= 0) return say(T >= 0 ? '기온이 0 ℃ 이상이라 소금이 필요 없어요.' : `공융점(${C.EUTECTIC} ℃) 이하라 소금이 듣지 않습니다. 기온이 오를 때까지 기다리세요.`);
  const used = melt >= left ? Math.min(s, C.saltForIce(T, left)) : s, done = Math.min(melt, left);
  S.inv.salt -= used; S.melt[k] = had + done;
  logEv('소금 뿌림(얼음 타일)', `기온 ${fmt(T, 1)}℃ (m_eq=${fmt(-T / (2 * C.KF), 2)} mol/kg), 소금 ${fmt(used, 1)} g → 얼음 ${fmt(done, 0)} g 융해 (타일 ${fmt(had + done, 0)}/${ICE_TILE_G} g)`);
  puff(tx * T + 8, ty * T + 8, '#d8f3ff', 8);
  if (had + done >= ICE_TILE_G - 1e-6) { setTile(tx, ty, WATER); say('얼음이 모두 녹아 물이 되었습니다.'); if (Sim.dockOf(S).island === 'polar') S.f.polarMelt = true; }
  else say(`얼음 ${fmt(done, 0)} g 융해 (타일 ${fmt(had + done, 0)}/${ICE_TILE_G} g). 소금 ${fmt(used, 1)} g 사용`);
}

// ---------- 항해: 뗏목 파편 · 항구 표지판 · 유리병 편지 게시판 · 광장의 다른 뗏목 ----------
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function uiFragment() {
  const R = Sim.RAFT;
  openModal('뗏목 파편', `<div class="box"><p>해안에 걸린 뗏목 파편입니다. 고치면 뗏목이 출항할 수 있게 되어 건너편 광장섬으로 갈 수 있어요.</p>
    <div class="kv"><span>필요한 재료</span><b>${costText(R.REPAIR_COST)}</b></div>
    <div class="row" style="margin-top:8px"><button class="primary" ${has(R.REPAIR_COST) ? '' : 'disabled'} onclick="G.repairRaft()">고치기</button></div></div>
    <div class="warnbox">고치면 튜토리얼이 끝납니다: 밤에 서리 늑대가 나타나고, 압력 밥솥은 3 atm을 넘으면 터집니다. (재료·칸 수는 가정(임의값))</div>`);
}
function uiSail() {
  const here = Sim.dockOf(S).island;
  const list = here === 'plaza' ? Sim.HARBORS : [{ dock: 'plaza', label: '귀항', name: '광장섬', open: true }];
  const rows = list.map(h => {
    const need = Sim.UNLOCK[h.dock] || 0, locked = S.qDone < need, env = Sim.ENV[Sim.DOCKS[h.dock] ? Sim.DOCKS[h.dock].island : ''];
    const on = S.f.raft && h.open && Sim.DOCKS[h.dock] && h.dock !== S.raft.dock && !locked;
    const info = env && (env.P !== 1 || env.dT) ? `<div class="mut">외기 ${fmt(env.P, 2)} atm(물 ${fmt(C.tb(env.P), 0)} ℃에서 끓음) · 기온 ${env.dT >= 0 ? '+' : ''}${env.dT} ℃</div>` : '';
    return `<div class="box row between"><div><b>${h.label} — ${h.name}</b> ${h.open ? (locked ? `<span class="no">목표 ${need}개 달성 시 열림</span>` : `<span class="mut">${Sim.SAIL_MIN[h.dock] || 30}분</span>`) : '<span class="no">아직 갈 수 없음</span>'}${info}</div>
      <button ${on ? '' : 'disabled'} onclick="G.sail('${h.dock}')">출항</button></div>`;
  }).join('');
  openModal(`항구 (${Sim.ISLANDS[here].name})`, (S.f.raft ? '' : '<div class="warnbox">뗏목 파편을 먼저 고쳐야 출항할 수 있어요. (시작섬 동쪽 해안)</div>')
    + rows + `<div class="mut">항해 시간은 가정(임의값)이고, 내 뗏목과 그 위의 장치가 함께 옮겨 갑니다. 섬마다 외기 압력·기온이 달라 같은 장치도 다르게 동작합니다.</div>`);
}
const NPC_BOTTLES = [
  { nick: '선배1', text: '증류기는 화덕 옆에! 약불(105 ℃)로는 끝까지 못 끓여요.' },
  { nick: '선배2', text: '한제는 얼음 100 g당 소금 16 g 이상이면 -10 ℃ 아래.' },
  { nick: '선배3', text: '골렘 3단계는 O₂ 캡슐이 4개 필요해요. 하루치로는 모자라요.' },
];
let bottleAt = 0;
function uiBoard() {
  const online = window.Net && Net.user && Net.loadBottles;
  openModal('유리병 편지 게시판', `<div class="box"><div id="b-list" class="mut">불러오는 중...</div></div>
    ${online ? `<div class="row" style="margin-top:8px"><input id="b-text" maxlength="80" placeholder="유리병에 넣을 한마디 (80자, 개인정보는 쓰지 마세요)" style="flex:1 1 200px;min-width:0"><button class="primary" onclick="G.bottle()">띄우기</button></div>`
      : '<div class="warnbox">온라인으로 접속하면 다른 사람이 띄운 편지를 읽고 내 편지도 띄울 수 있어요. (지금은 선배들의 편지만 보입니다)</div>'}`);
  loadBottles();
}
async function loadBottles() {
  let list = NPC_BOTTLES.slice();
  if (window.Net && Net.user && Net.loadBottles) { try { list = (await Net.loadBottles(12)).concat(list); } catch { /* 오프라인 */ } }
  const el = $('b-list'); if (el) el.innerHTML = list.map(b => `<div><b>${esc(b.nick)}</b> ${esc(pix(b.text))}</div>`).join('') || '아직 편지가 없습니다.';
}
// 광장섬: 정박한 다른 사람의 뗏목(읽기 전용). 서버의 /rafts에서 최근 것을 읽어 온다
let plazaRafts = [];
async function loadPlaza() {
  plazaRafts = [];
  if (Sim.dockOf(S).island !== 'plaza' || !(window.Net && Net.user && Net.loadRafts)) return;
  try { plazaRafts = await Net.loadRafts(3); } catch { /* 오프라인 */ }
}
setInterval(() => { if (!paused) loadPlaza(); }, 60000);
function drawPlazaRafts(t) {
  ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
  plazaRafts.slice(0, 3).forEach((r, i) => {
    const x0 = 153 + i * 13, cells = Math.max(2, Math.min(10, r.cells | 0));
    for (let c = 0; c < cells; c++) ctx.drawImage(Art.tiles.raft[c % 3], (x0 + c) * T - cam.x, Sim.RAFT.ROW * T - cam.y);
    for (const d of (r.devs || [])) if (d && Art.dev[d.id] && d.u >= 0 && d.u + 2 <= cells) {
      const sx = (x0 + d.u) * T - cam.x, sy = Sim.RAFT.DEV_Y * T - cam.y;
      blit(Art.dev[d.id], sx, sy);
      if (d.broken) { ctx.fillStyle = '#ff5a4a'; ctx.fillRect(sx + 12, sy + 12, 8, 2); ctx.fillRect(sx + 15, sy + 9, 2, 8); }
    }
    const nx = Math.round((x0 + cells / 2) * T - cam.x), ny = Sim.RAFT.DEV_Y * T - cam.y - 6;
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(pix(r.nick || ''), nx, ny); ctx.fillStyle = '#9fe8ff'; ctx.fillText(pix(r.nick || ''), nx, ny);
  });
  ctx.textAlign = 'left';
}

// ---------- 퀘스트 ----------
function checkQuests() { Sim.checkQuests(S); flush(); }

// ---------- 상호작용 대상 ----------
const objCenter = o => o.type === 'altar' ? [o.x * T + 16, o.y * T - 16] : [o.x * T + 8, o.y * T - (NODE[o.type] ? NODE[o.type][4] : o.type === 'harbor' || o.type === 'board' ? 14 : 8)];
function nearWater() {
  const tx = Math.floor((S.px + PW / 2) / T), ty = Math.floor((S.py + PH / 2) / T);
  for (let x = tx - 1; x <= tx + 1; x++) for (let y = ty - 1; y <= ty + 2; y++) if (tileAt(x, y) === WATER) return true;   // 뗏목 위에서는 바로 아래 물까지
  return false;
}
const wolfPos = m => [m.dx * T + (m.id % 2 ? 44 : -12), m.dy * T + 26];   // 장치 옆 땅 위
function targets() {
  const cx = S.px + PW / 2, cy = S.py + PH / 2, out = [];
  const add = (kind, ref, x, y, label) => { const d = Math.hypot(x - cx, (y - cy) * 0.7); if (d <= REACH) out.push({ kind, ref, x, y, d, label }); };
  for (const o of OBJS) {
    if (o.type === 'fragment' && S.f.raft) continue;   // 고친 뒤에는 파편이 사라진다
    const [x, y] = objCenter(o), n = NODE[o.type];
    const label = { box: '광장 보급 상자', altar: '솥 골렘 제단', harbor: '항구 표지판 (항해)', board: '유리병 편지 게시판', fragment: '뗏목 파편 (수리)' }[o.type];
    add(o.type, o, x, y, n ? `${n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : label);
  }
  for (const d of S.placed) add('dev', d, d.x * T + 16, d.y * T + 16, DEV[d.id].name + (d.s.broken ? ' (파손)' : ''));
  for (const m of S.mobs) { const [x, y] = wolfPos(m); add('wolf', m, x, y, `서리 늑대 ${fmt(m.M, 0)} g`); }
  if (nearWater()) add('water', null, cx, cy + 4, '바닷물 뜨기');
  return out.sort((a, b) => a.d - b.d);
}
function interact(t) {
  if (!t) return;
  if (t.kind === 'wolf') return uiWolf(t.ref);
  if (t.kind === 'dev') return openDevice(t.ref);
  if (t.kind === 'water') { Sim.act.scoop(S); flush(); return refresh(); }
  if (t.kind === 'box') return openBox();
  if (t.kind === 'fragment') return uiFragment();
  if (t.kind === 'harbor') return uiSail();
  if (t.kind === 'board') return uiBoard();
  if (t.kind === 'altar') return window.Raid ? Raid.open(api) : null;
  if (t.kind === 'rocksalt' && !(S.inv.pickaxe > 0)) return say('암염은 단단한 이온 결정이라 곡괭이가 있어야 캘 수 있어요.');
  const n = NODE[t.kind], ok = Sim.act.gather(S, t.ref, n, ITEM[n[0]][1]);
  flush();
  if (ok) { puff(t.x, t.y, '#ffffff', 5); refresh(); }
}
function openBox() { Sim.act.box(S); flush(); refresh(); }

// ---------- 건설 (평평한 땅에 2x2 장치) ----------
let mode = null;   // 'build:<id>' | 'demolish'
const mouse = { x: 0, y: 0 };
const cam = { x: 0, y: 0 };
// 장치는 뗏목 위에만 짓는다: 마우스 아래 칸 → 뗏목의 해안 쪽 끝에서 u칸 떨어진 자리(2칸 폭)
function ghostCheck(id) {
  const wx = cam.x + mouse.x, tx = Math.floor(wx / T - 1 + 0.5), def = DEV[id], u = Sim.raftU(S, tx);
  if (u < 0 || u + 2 > S.raft.cells) return { ok: false, tx, msg: '뗏목 위에 지어야 합니다. (뗏목이 모자라면 건설 메뉴에서 넓히세요)' };
  const dev = { x: tx, y: Sim.RAFT.DEV_Y };
  if (S.placed.some(d => Math.abs(d.u - u) < 2)) return { ok: false, tx, msg: '다른 장치와 겹칩니다.' };
  if (Math.abs(tx * T - S.px) > 8 * T) return { ok: false, tx, msg: '너무 멉니다. 가까이 가서 지으세요.' };
  if (def.needFire && !fireNear(dev).length) return { ok: false, tx, msg: `${def.name}은(는) 화덕 바로 옆에 지어야 합니다. (열 전달)` };
  return { ok: true, tx, ty: dev.y, u };
}
function placeAtMouse() {
  if (mode.startsWith('block:')) return placeBlock();
  if (mode.startsWith('tool:')) return mode === 'tool:salt' ? useShaker() : useThermo();
  if (mode === 'demolish') {
    const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
    const d = S.placed.find(p => wx >= p.x * T && wx < p.x * T + 32 && wy >= p.y * T && wy < p.y * T + 32);
    if (!d) return say('철거할 장치를 클릭하세요.');
    Sim.act.demolish(S, d); flush();
    mode = null; return refresh();
  }
  const id = mode.slice(6), g = ghostCheck(id);
  if (!g.ok) return say(g.msg);
  if (Sim.act.build(S, id, g.u)) mode = null;
  flush(); refresh();
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
  if (d.s.broken && d.id !== 'cooker') return uiBroken(d);   // 압력 밥솥은 자체 화면에서 수리
  ({ fire: uiFire, still: uiStill, cooker: uiCooker, cooler: uiCooler, collector: uiCollector }[d.id])(d);
}
let curDev = null;
window.act = (name, arg) => { ACT[name](curDev, arg); if (modalTick) modalTick(); refresh(); };
const ACT = {};

function uiBroken(d) {
  curDev = d;
  openModal(DEV[d.id].name, `<div class="box"><h4>파손됨</h4><p>서리 늑대가 부숴서 작동하지 않습니다. 나뭇가지 2개로 수리할 수 있어요.</p>
    <div class="row"><button class="primary" onclick="act('repair');G.closeModal()">수리 (나뭇가지 2)</button></div></div>`);
}
// 서리 늑대 화면: 소금 → 얼음이 녹는 양을 어는점 내림 식으로 계산 [#37 #39 #21]
let wolfRef = null;
function uiWolf(m) {
  wolfRef = m;
  const T = airTemp();
  openModal('서리 늑대', `
    <div class="grid2"><div class="box"><h4>늑대</h4>
      <div class="kv"><span>얼음 질량</span><b id="w-m"></b></div>
      <div class="kv"><span>현재 기온</span><b id="w-T"></b></div>
      <div class="kv"><span>평형 몰랄농도 m = |T|/(i·Kf)</span><b id="w-eq"></b></div>
      <div class="kv"><span>모두 녹이는 데 필요한 소금</span><b id="w-need"></b></div>
      <div class="bar"><i id="w-bar"></i></div></div>
    <div class="box"><h4>소금 뿌리기</h4>
      <div class="row"><label>소금 <b id="w-sv"></b> g (보유 <span id="w-have"></span> g)</label></div>
      <input type="range" id="w-s" min="0" max="${Math.max(1, Math.floor(S.inv.salt))}" step="1" value="0">
      <div class="kv"><span>예상 녹는 얼음</span><b id="w-melt"></b></div>
      <div class="kv"><span>실제 쓰는 소금</span><b id="w-use"></b></div>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="G.wolfSalt()">뿌리기</button></div>
      <div id="w-note" class="mut"></div></div></div>
    <div class="warnbox">얼음에 소금이 닿으면 어는점이 내려가 (ΔTf = i·Kf·m, i=2, Kf=1.86) 기온에서 평형이 되는 농도까지 얼음이 녹습니다. 가정: 이상 용액, 녹는 데 필요한 열은 주위에서 충분히 공급됨(열수지 무시). 공융점 ${C.EUTECTIC} ℃ 이하이거나 0 ℃ 이상에서는 얼음-소금물 평형이 성립하지 않아 소금으로 녹일 수 없습니다. 켜진 화덕 근처의 늑대는 열로도 녹습니다(Q = m·융해열 334 J/g).</div>`,
  () => {
    if (!S.mobs.includes(m)) { closeModal(); return; }
    const T = airTemp(), sl = $('w-s'), s = Math.min(+sl.value, S.inv.salt);
    const melt = Math.min(C.iceMeltBySalt(T, s), m.M), need = C.saltForIce(T, m.M);
    const use = melt >= m.M ? Math.min(s, need) : s;
    set('w-m', fmt(m.M, 0) + ' g'); set('w-T', fmt(T, 1) + ' ℃');
    set('w-eq', T < 0 && T > C.EUTECTIC ? fmt(-T / (2 * C.KF), 2) + ' mol/kg' : '—');
    set('w-need', isFinite(need) ? fmt(need, 1) + ' g' : '불가');
    set('w-sv', fmt(s, 0)); set('w-have', fmt(S.inv.salt, 0));
    set('w-melt', fmt(melt, 0) + ' g'); set('w-use', fmt(use, 1) + ' g');
    setw('w-bar', m.M / m.M0 * 100, 'good');
    set('w-note', T >= 0 ? '기온이 0 ℃ 이상이라 소금이 필요 없어요. 곧 녹습니다.' : T <= C.EUTECTIC ? '공융점 이하라 소금이 듣지 않습니다. 화덕으로 녹이세요.' : '');
  });
}
function wolfSalt() {
  const m = wolfRef;
  if (!m || !S.mobs.includes(m)) return;
  const s = Math.min(+$('w-s').value, S.inv.salt);
  if (s <= 0) return say('소금을 뿌릴 양을 정하세요.');
  if (saltOnWolf(m, s)) closeModal(); else uiWolf(m);
}
// 늑대에게 소금 s g을 뿌린다(모달·소금 뿌리개 공용). 늑대가 정화되면 true
function saltOnWolf(m, s) { const r = Sim.act.saltOnWolf(S, m, s); flush(); return r; }

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
ACT.fuel = (d, n) => { Sim.act.fuel(S, d, n); flush(); };
ACT.level = (d, i) => { Sim.act.level(S, d, i); flush(); };

function uiStill(d) {
  curDev = d;
  openModal('증류기', `
    <div class="grid2"><div class="box"><h4>상태</h4>
      <div class="kv"><span>화덕 열원</span><b id="s-T"></b></div>
      <div class="kv"><span>용액 속 물</span><b id="s-w"></b></div>
      <div class="kv"><span>몰랄농도 m</span><b id="s-m"></b></div>
      <div class="kv"><span>물의 몰분율 x</span><b id="s-x"></b></div>
      <div class="kv"><span>외기 압력 · 용액 끓는점</span><b id="s-tb"></b></div>
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
      set('s-tb', fmt(pAtm(), 2) + ' atm · ' + fmt(C.tb(pAtm(), xw), 2) + ' ℃ (순수한 물 ' + fmt(C.tb(pAtm()), 1) + ' ℃ 보다 ΔTb ≈ ' + fmt(C.tb(pAtm(), xw) - C.tb(pAtm()), 2) + ')');
      set('s-pv', fmt(C.pSol(heatOf(d), xw), 3) + ' atm');
    } else { ['s-m', 's-x', 's-tb', 's-pv'].forEach(i => set(i, '-')); }
    set('s-tg', s.run ? '가열 중지' : '가열 시작');
    set('s-st', !s.run ? '대기 중' : (s.w > 0 && C.pSol(heatOf(d), C.xw(s.w, np)) > pAtm() ? '끓는 중 — 증기가 응축되어 증류수가 됩니다' : '열원 온도가 용액의 끓는점보다 낮아 끓지 않습니다 (화덕 세기를 올리세요)'));
  });
}
ACT.load = d => { Sim.act.load(S, d); flush(); };
ACT.toggle = d => { Sim.act.toggle(S, d); };
ACT.collect = d => { Sim.act.collect(S, d); flush(); };

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
    const cs = cookerState(s, T0, pAtm());
    set('c-T', fmt(T0, 0) + ' ℃'); set('c-P', fmt(cs.pIn, 2) + ' atm'); set('c-tb', fmt(cs.Teff, 1) + ' ℃');
    set('c-sp', 'x' + fmt(cs.speed, 2)); setw('c-bar', s.prog / 18 * 100, cs.pIn > 2.7 ? 'bad' : 'good');
    set('c-st', s.broken ? '파손됨 — 수리가 필요합니다' : s.done ? '완성! 꺼내세요' : s.run ? (cs.boil ? `조리 중 (${fmt(s.prog / 18 * 100, 0)} %)` : '열원이 용액의 끓는점보다 낮아 끓지 않습니다 — 조리가 진행되지 않아요') : '대기 중');
  });
}
ACT.cook = d => { Sim.act.cook(S, d, +$('c-salt').value, +$('c-valve').value); flush(); };
ACT.take = d => { Sim.act.take(S, d); flush(); };
ACT.repair = d => { Sim.act.repair(S, d); flush(); };

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
ACT.pack = () => { Sim.act.pack(S, +$('k-ice').value, +$('k-salt').value); flush(); };

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
    set('g-T', fmt(t, 1) + ' ℃ / ' + fmt(pAtm(), 2) + ' atm'); set('g-n', fmt(C.moles(pAtm(), 0.5, t), 4) + ' mol');
    set('g-p', 'N₂ ' + fmt(C.AIR.N2, 3) + ' · O₂ ' + fmt(C.AIR.O2, 3) + ' · Ar ' + fmt(C.AIR.Ar, 3) + ' atm');
    set('g-c', capText());
  });
}
const capCount = k => S.caps.filter(c => c.k === k).length;
const capText = () => ['air', 'N2', 'O2', 'He'].map(k => `${k === 'air' ? '공기' : k} ${capCount(k)}`).join(' · ');
ACT.cap = () => { Sim.act.cap(S); flush(); };

// ---------- 메뉴 ----------
function openBuild() {
  const rows = Object.entries(DEV).map(([id, d]) => {
    const ok = unlocked(id);
    return `<div class="box row between"><div><b>${ic(id)} ${d.name}</b> ${ok ? '' : '<span class="no">잠김 — 목표 ' + d.unlock + '개 달성 시 해금</span>'}
      <div class="mut">${costText(d.cost)}${d.needFire ? ' · 화덕 옆에 설치' : ''}</div></div>
      <button ${ok && has(d.cost) ? '' : 'disabled'} onclick="G.startBuild('${id}')">짓기</button></div>`;
  }).join('');
  const R = Sim.RAFT, full = S.raft.cells >= R.MAX_CELLS;
  openModal('건설', rows + `<div class="mut">장치는 내 뗏목 위에 2x2 칸으로 짓습니다. 지을 곳에 마우스를 두고 클릭하세요.</div>
    <div class="box row between"><div><b>뗏목 넓히기</b> <span class="mut">(${S.raft.cells}/${R.MAX_CELLS}칸, 한 번에 +${R.EXPAND}칸)</span>
      <div class="mut">${costText(R.EXPAND_COST)} · 해안 쪽은 그대로, 바다 쪽으로 늘어납니다</div></div>
      <button ${!full && has(R.EXPAND_COST) ? '' : 'disabled'} onclick="G.expandRaft()">${full ? '최대' : '넓히기'}</button></div>
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
// 처음 접속한 사람에게 한 번 보이는 도움말 (자세한 내용은 GUIDE.md)
const HELP_KEY = 'chemisle_help_v1';
function openHelp() {
  openModal('도움말', `
    <div class="box"><h4>조작</h4>
      <div>A/D 이동 · W/스페이스 점프 · <b>E</b> 또는 클릭으로 상호작용 · ESC 닫기</div>
      <div>오른쪽 위 아이콘: 건설 · 제작 · 연구 노트 · 기록 · 저장/계정 · x1/x3/x10은 시간 속도</div></div>
    <div class="box"><h4>처음 해 볼 것</h4>
      <div>1. 시작섬 동쪽 해안의 뗏목 위에서 바닷물을 뜨고(E), 건설에서 화덕을 뗏목 위에 지으세요. (증류에 쓸 바닷물은 3통까지 모아 두세요)</div>
      <div>2. 나무·모래 더미에서 재료를 모아 증류기를 화덕 옆에 짓고, 화덕을 중불로 켠 뒤 바닷물을 증류하세요.</div>
      <div>3. 해안의 뗏목 파편을 고쳐 출항하면 건너편 광장섬에 갈 수 있어요. 목표를 순서대로 달성하면 장치가 열리고 광장섬의 솥 골렘에 도전합니다.</div></div>
    <div class="warnbox">모든 장치는 수업에서 배운 식(라울의 법칙, 끓는점 오름·어는점 내림, 이상 기체, 돌턴 분압)을 실제로 계산합니다. 밤에는 기온이 영하로 내려가 서리 늑대가 장치를 부수러 오니 소금을 준비하세요. 연구 노트에서 규칙과 계산기를, 기록에서 자동 기록을 볼 수 있습니다. 더 자세한 설명은 저장소의 GUIDE.md를 보세요.</div>`,
  null, () => { try { localStorage.setItem(HELP_KEY, '1'); } catch { /* 저장 불가 */ } });
}
function openSave() {
  const on = window.Net && Net.user;
  const acct = on
    ? `<p>접속 중: <b>${Net.nick}</b> (${Net.guest ? '게스트' : '계정'}) · 진행 상황은 서버에 자동 저장됩니다.</p>` + (Net.guest
      ? `<div class="warnbox">비밀번호를 설정하면 다른 기기에서도 이 캐릭터로 로그인할 수 있어요. 설정하지 않으면 브라우저 데이터를 지울 때 캐릭터를 잃습니다. 비밀번호를 잊으면 복구할 수 없어요.</div>
         <div class="row"><input id="up-pw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="new-password"><button class="primary" onclick="G.upgrade()">내 캐릭터 지키기</button></div>` : '')
      + `<div class="row"><button onclick="G.logout()">로그아웃</button></div>`
    : `<p>혼자 하기 모드: 진행 상황은 이 브라우저에만 저장됩니다.</p>` + (window.Net && Net.ok ? `<div class="row"><button class="primary" onclick="G.showAuth()">온라인으로 접속</button></div>` : '');
  openModal('저장/계정', acct + `<hr><div class="row"><button onclick="G.help()">도움말</button><button onclick="G.save()">지금 저장</button><button class="danger" onclick="G.reset()">처음부터 다시 시작</button></div>`);
}

// ---------- 접속(게스트 입장 / 로그인) ----------
const authErr = (t) => { $('a-err').textContent = t || ''; };
function showAuth() { $('modal').hidden = true; authErr(''); $('auth').hidden = false; paused = true; clearKeys(); }
function applyRemote(r) { S = merge(r); applyDug(); document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', +x.dataset.sp === S.speed)); }
// 신원이 확정된 뒤: 서버 세이브가 있으면 그것으로, 없으면 지금 진행 상황을 서버에 올린다
async function enterWorld() {
  try {
    const r = await Net.loadSave();
    if (r) applyRemote(r);
  } catch { say('서버 세이브를 불러오지 못했습니다. 이 브라우저의 저장으로 시작합니다.'); }
  $('auth').hidden = true; paused = false; lastRemote = 0; save(true); refresh();
  Net.joinMap(MAPID, posPacket());
  say(`${Net.nick}님, 환영합니다!`);
}
async function busy(fn) {
  const btns = [...document.querySelectorAll('#abox button')]; btns.forEach(b => b.disabled = true); authErr('');
  try { await fn(); } catch (e) { authErr(e.message); } finally { btns.forEach(b => b.disabled = false); }
}
$('a-start').onclick = () => busy(async () => { await Net.register($('a-nick').value); await enterWorld(); });
$('a-lgo').onclick = () => busy(async () => { await Net.login($('a-lnick').value, $('a-lpw').value); await enterWorld(); });
$('a-off').onclick = () => { $('auth').hidden = true; paused = false; };
for (const id of ['a-nick', 'a-lnick', 'a-lpw']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $(id === 'a-nick' ? 'a-start' : 'a-lgo').click(); });
async function boot() {
  if (!window.Net || !Net.init()) return;     // Firebase를 쓸 수 없으면 혼자 하기
  paused = true;
  const nick = await Net.restore();
  if (nick) await enterWorld(); else showAuth();
}

// ---------- 공개 API (raid.js, notes.js) ----------
const api = {
  S: () => S, say, logEv, openModal, closeModal, set, setw, fmt, refresh: () => refresh(), save,
  capCount, ITEM, airTemp, advance, Art,
};
window.G = {
  startBuild(id) { mode = 'build:' + id; $('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 곳을 클릭하세요. (ESC 취소)`); },
  repairRaft() { Sim.act.repairRaft(S); flush(); closeModal(); refresh(); },
  sail(dock) { if (Sim.act.sail(S, dock)) { closeModal(); save(true); } flush(); refresh(); },
  async bottle() {
    const el = $('b-text'), text = (el.value || '').trim();
    if (!text) return say('편지 내용을 적어 주세요.');
    if (Date.now() - bottleAt < 10000) return say('유리병은 10초에 한 번만 띄울 수 있어요.');
    bottleAt = Date.now();
    try { await Net.postBottle(pix(text).slice(0, 80)); el.value = ''; say('유리병을 띄웠습니다.'); logEv('유리병', `편지를 띄움: ${pix(text).slice(0, 40)}`); loadBottles(); }
    catch { say('편지를 띄우지 못했습니다. 인터넷 연결을 확인하세요.'); }
  },
  expandRaft() { if (Sim.act.expandRaft(S)) applyDug(); flush(); openBuild(); refresh(); },
  startDemolish() { mode = 'demolish'; $('modal').hidden = true; say('철거할 장치를 클릭하세요. (ESC 취소)'); },
  craft(id) { const r = Sim.act.craft(S, id); if (!r) return; flush(); say(`${ITEM[r.out][1]} 제작`); openCraft(); refresh(); },
  copyLog() { const t = S.log.map(l => `${l.day}일 ${l.t} [${l.type}] ${l.text}`).join('\n'); navigator.clipboard && navigator.clipboard.writeText(t).then(() => say('복사했습니다.'), () => say('복사 권한이 없습니다.')); },
  save() { save(true); say('저장했습니다.'); },
  wolfSalt, closeModal: () => closeModal(),
  advance,   // 시험 플레이/자동 점검용
  showAuth, openSave, help: openHelp,
  async upgrade() {
    const pw = $('up-pw').value;
    if (pw.length < 6) { say('비밀번호는 6자 이상이어야 합니다.'); return; }
    try { await Net.upgrade(pw); say('캐릭터를 지켰습니다! 이제 다른 기기에서도 로그인할 수 있어요.'); openSave(); } catch (e) { say(e.message); }
  },
  async logout() {
    if (Net.guest && !confirm('비밀번호를 설정하지 않은 게스트입니다. 로그아웃하면 이 캐릭터로 다시 들어올 수 없습니다. 계속할까요?')) return;
    save(true); await Net.logout();
    try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
    S = newState(); applyDug(); closeModal(); showAuth();
  },
  debug: () => S,   // 시험 플레이/자동 점검용: 현재 상태 조회
  reset() { if (confirm('모든 진행이 사라집니다. 정말 처음부터 시작할까요?')) { S = newState(); applyDug(); save(true); closeModal(); refresh(); } },
};

// ---------- 목표 텍스트(DOM 오버레이) ----------
function refresh() {
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
  if (!$('title').hidden) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startGame(); } return; }
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) { keys[KEYMAP[k]] = true; e.preventDefault(); }
  else if (k === 'e') interact(targets()[0]);
  else if (k === 'escape' && mode) { mode = null; say('취소'); }
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys[k] = false; });
const cv = $('cv'), ctx = cv.getContext('2d');
function canvasPos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH }; }
cv.addEventListener('mousemove', e => Object.assign(mouse, canvasPos(e)));
// 마우스를 꾹 누르면 그 자리의 땅을 판다(클릭할 대상·HUD·건설 모드가 아닐 때)
cv.addEventListener('pointerdown', e => {
  Object.assign(mouse, canvasPos(e));
  if (e.button > 0 || !$('modal').hidden || mode) return;
  if (HUD.hits.some(h => mouse.x >= h.x && mouse.x < h.x + h.w && mouse.y >= h.y && mouse.y < h.y + h.h) || mouse.y < HUD.bottom) return;
  const wx = cam.x + mouse.x, wy = cam.y + mouse.y;
  if (targets().some(o => Math.hypot(o.x - wx, o.y - wy) < 26)) return;
  dig.on = true; dig.p = 0; dig.tx = dig.ty = -1;
});
cv.addEventListener('pointermove', e => { Object.assign(mouse, canvasPos(e)); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(ev, () => { dig.on = false; dig.p = 0; });
cv.addEventListener('click', e => {
  Object.assign(mouse, canvasPos(e));
  if (!$('modal').hidden) return;
  const hit = HUD.hits.find(h => mouse.x >= h.x && mouse.x < h.x + h.w && mouse.y >= h.y && mouse.y < h.y + h.h);
  if (hit) return hit.fn();
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

// ---------- 물리 ----------
let onGround = false, seaHintAt = 0;
function hintSea() { const n = performance.now(); if (n - seaHintAt > 5000) { seaHintAt = n; say('바다가 거칠어서 헤엄쳐 건널 수 없어요. 뗏목으로 항해하세요 (항구 표지판).'); } }
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
  { const b = Sim.bounds(S), lo = b.L * T, hi = (b.R + 1) * T - PW;   // 섬 사이는 뗏목으로만 건넌다
    if (S.px < lo || S.px > hi) { S.px = Math.max(lo, Math.min(hi, S.px)); hintSea(); } }
  const ny = S.py + S.vy * dt;
  if (!collides(S.px, ny)) S.py = ny;
  else { if (S.vy > 0) S.py = Math.floor((ny + PH) / T) * T - PH; else S.py = (Math.floor(ny / T) + 1) * T; S.vy = 0; }
  onGround = collides(S.px, S.py + 1);
}

// ---------- 파티클·환경 ----------
const parts = [];
function puff(x, y, col, n) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 14, life: 0.6 + Math.random() * 0.5, col, s: 2 }); }
function burst(d) { puff(d.x * T + 16, d.y * T + 8, '#ff7a3d', 14); puff(d.x * T + 16, d.y * T + 8, '#4a4f56', 10); }
const birds = Array.from({ length: 6 }, (_, i) => ({ x: i * 210 + Math.random() * 90, y: 24 * T - 150 - Math.random() * 70, vx: 16 + Math.random() * 12, ph: Math.random() * 6 }));
const flies = Array.from({ length: 22 }, (_, i) => ({ x: 30 * T + i * 52 + Math.random() * 30, y: 24 * T - 14 - Math.random() * 44, ph: Math.random() * 6 }));
function stepParts(dt) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
  if (parts.length > 200) parts.splice(0, 50);
  for (const b of birds) { b.x += b.vx * dt; b.ph += dt * 9; if (b.x > WW * T + 40) b.x = -40; }
}

// ---------- 그리기 ----------
const nightOf = h => h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 7 ? (7 - h) / 2 : 0;
let stars = [];
const makeStars = () => { stars = Array.from({ length: Math.max(30, Math.floor(VW * VH / 1500)) }, (_, i) => [((i * 97.31) % 1000) / 1000, ((i * 53.77) % 1000) / 1000]); };
let last = performance.now(), tt = 0;
// ---------- 다른 플레이어(presence) ----------
const MAPID = 'main';
const posPacket = () => ({ x: Math.round(S.px * 10) / 10, y: Math.round(S.py * 10) / 10, vx: Math.round(S.vx), face: S.face < 0 ? -1 : 1, air: !onGround });
let lastPos = '', lastPosAt = 0;
const ghosts = {};   // uid -> { x, y, face, vx, air, nick, seen } (보간되는 화면 위치)
function netStep(dt, now) {
  if (!(window.Net && Net.user) || paused) return;
  if (now - lastPosAt >= 100) {           // 10 Hz, 변화가 없으면 생략(5초마다 생존 신호)
    const p = posPacket(), k = JSON.stringify(p);
    if (k !== lastPos || now - lastPosAt > 5000) { lastPos = k; lastPosAt = now; Net.sendPos(p); }
  }
  const a = 1 - Math.exp(-dt * 14);
  for (const id in Net.peers) {
    const p = Net.peers[id], g = ghosts[id] || (ghosts[id] = { x: p.x, y: p.y });
    g.x += (p.x - g.x) * a; g.y += (p.y - g.y) * a;
    g.nick = p.nick; g.face = p.face; g.vx = p.vx; g.air = p.air;
  }
  for (const id in ghosts) if (!Net.peers[id]) delete ghosts[id];
}
function drawPeers(t) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '8px sans-serif';
  for (const id in ghosts) {
    const g = ghosts[id], sx = g.x - cam.x, sy = g.y - cam.y;
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    const fr = g.air ? 3 : Math.abs(g.vx) > 1 ? 1 + (Math.floor(t * 8) % 2) : 0, px = sx - 3, py = sy + PH - 22;
    ctx.save(); ctx.globalAlpha = 0.9;
    if (g.face < 0) { ctx.translate(Math.round(px) + 16, 0); ctx.scale(-1, 1); blit(Art.playerFrames[fr], 0, py); } else blit(Art.playerFrames[fr], px, py);
    ctx.restore();
    const nx = Math.round(sx + PW / 2), ny = Math.round(py - 2);
    ctx.lineWidth = 2; ctx.strokeStyle = '#000000'; ctx.strokeText(g.nick || '', nx, ny);
    ctx.fillStyle = '#9fe8ff'; ctx.fillText(g.nick || '', nx, ny);
  }
  ctx.textAlign = 'left';
}
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; tt += dt;   // 첫 프레임은 rAF 시각이 last보다 이를 수 있어 dt 음수 방지
  physics(dt); stepDig(dt); stepParts(dt); netStep(dt, now);
  draw(tt);
  requestAnimationFrame(frame);
}
const blit = (img, x, y) => { const p = img.pad || 0; ctx.drawImage(img, Math.round(x - p), Math.round(y - p)); };
const isOpen = (x, y) => { const t = tileAt(x, y); return t === AIR || t === WATER; };
const hash = (x, y) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
function draw(t) {
  const hour = S.min / 60, night = nightOf(hour);
  cam.x = Math.max(0, Math.min(WW * T - VW, Math.round(S.px + PW / 2 - VW / 2)));
  cam.y = Math.max(0, Math.min(WH * T - VH, Math.round(S.py + PH / 2 - VH * 0.6)));
  // 하늘(띠) + 별 + 해/달
  const bands = Art.sky(hour, 18);
  for (let i = 0; i < bands.length; i++) { ctx.fillStyle = bands[i]; ctx.fillRect(0, Math.floor(i * VH / bands.length), VW, Math.ceil(VH / bands.length) + 1); }
  if (night > 0) for (let i = 0; i < stars.length; i++) { ctx.fillStyle = `rgba(255,255,255,${night * (0.45 + 0.55 * Math.abs(Math.sin(t * 1.5 + i)))})`; ctx.fillRect(Math.floor(stars[i][0] * VW), Math.floor(stars[i][1] * VH * 0.6), 1 + (i % 7 === 0 ? 1 : 0), 1); }
  const sunT = (hour - 6) / 12, moonT = ((hour + 6) % 24) / 12, arcY = Math.max(50, VH * 0.28);
  const sunX = Math.round(sunT * (VW - 18)), sunY = Math.round(arcY + 14 - Math.sin(sunT * Math.PI) * (arcY - 6));
  if (sunT >= 0 && sunT <= 1) {
    for (const [r, a] of [[30, 0.08], [22, 0.12], [15, 0.18]]) { ctx.fillStyle = `rgba(255,240,160,${a})`; ctx.beginPath(); ctx.arc(sunX + 9, sunY + 9, r, 0, 7); ctx.fill(); }
    ctx.drawImage(Art.sun, sunX, sunY);
  }
  if (moonT >= 0 && moonT <= 1) ctx.drawImage(Art.moon, Math.round(moonT * (VW - 16)), Math.round(arcY + 14 - Math.sin(moonT * Math.PI) * (arcY - 6)));
  for (let i = 0; i < 5; i++) {
    const w = VW + 80, cx = ((i * 170 - t * 3 * (1 + i % 3 * 0.4) - cam.x * 0.08) % w + w) % w - 50;
    ctx.globalAlpha = 1 - night * 0.75; ctx.drawImage(Art.clouds[i % 3], Math.round(cx), 14 + (i * 23) % Math.max(30, VH * 0.35)); ctx.globalAlpha = 1;
  }
  // 시차 배경: 먼 산 → 언덕 → 숲
  const horizon = 24 * T - cam.y;
  for (const [img, f, base, sink] of [[Art.farHills, 0.12, 100, 8], [Art.midHills, 0.28, 74, 6], [Art.forest, 0.5, 54, 4]]) {
    const off = -Math.floor((cam.x * f) % 512);
    for (let x = off; x < VW; x += 512) ctx.drawImage(img, x, Math.round(horizon - base + sink));
  }
  if (night > 0) { ctx.fillStyle = `rgba(6,10,40,${night * 0.55})`; ctx.fillRect(0, 0, VW, Math.max(0, horizon + 8)); }
  // 타일
  const x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T), drawW = [];
  for (let ty = y0; ty <= y0 + Math.ceil(VH / T) + 1; ty++) for (let tx = x0; tx <= x0 + Math.ceil(VW / T) + 1; tx++) {
    const id = tileAt(tx, ty), sx = tx * T - cam.x, sy = ty * T - cam.y, v = (tx * 7 + ty * 13) % 3;
    if (id === AIR) { if (tx >= 0 && tx < WW && ty > GY[tx]) { ctx.drawImage(Art.tiles.wall[v], sx, sy); ctx.fillStyle = `rgba(0,0,0,${Math.max(0.2, Math.min(0.55, (ty - 28) * 0.04))})`; ctx.fillRect(sx, sy, T, T); } continue; }
    if (id === WATER) {
      ctx.fillStyle = ty - 25 < 2 ? '#3f9be0' : ty - 25 < 4 ? '#2c7cc0' : '#1f66a4'; ctx.fillRect(sx, sy, T, T);
      drawW.push([sx, sy, tileAt(tx, ty - 1) !== WATER, tx]); continue;
    }
    const tset = id === GRASS ? Art.tiles.grass : id === DIRT ? Art.tiles.dirt : id === STONE ? Art.tiles.stone : id === SAND ? Art.tiles.sand : id === SNOWTOP ? Art.tiles.snowtop : id === RAFT ? Art.tiles.raft : Art.tiles.ice;
    ctx.drawImage(tset[v], sx, sy);
    if (ty > 26) { ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, (ty - 26) * 0.03)})`; ctx.fillRect(sx, sy, T, T); }
    if (isOpen(tx, ty - 1) && id !== GRASS && id !== SNOWTOP) { ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(sx, sy, T, 1); }
    if (isOpen(tx - 1, ty)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx, sy, 1, T); }
    if (isOpen(tx + 1, ty)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx + T - 1, sy, 1, T); }
    if (isOpen(tx, ty + 1)) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx, sy + T - 1, T, 1); }
    if (id === GRASS && tileAt(tx, ty - 1) === AIR) {   // 풀 다발·꽃·돌
      const h = hash(tx, ty);
      if (h % 2 === 0) ctx.drawImage(Art.tuft[h % 3], sx, sy - 5);
      if (h % 9 === 0) ctx.drawImage(Art.flower[(h >>> 3) % 3], sx + (h % 9), sy - 6);
      else if (h % 23 === 1) ctx.drawImage(Art.rock, sx + 4, sy - 4);
    }
  }
  // 오브젝트
  for (const o of OBJS) {
    const sx = o.x * T - cam.x, sy = o.y * T - cam.y, n = NODE[o.type], spent = n && (S.nodes[o.id] || 0) >= n[2];
    if (sx < -48 || sx > VW + 48) continue;
    ctx.globalAlpha = spent ? 0.4 : 1;
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    if (o.type === 'tree') { ctx.fillRect(sx - 4, sy - 1, 24, 2); blit((o.x >= 83 && o.x <= 112) || o.x >= 213 ? Art.obj.pine : Art.obj.tree, sx - 8, sy - 48); }
    else if (o.type === 'cane') blit(Art.obj.cane, sx, sy - 32);
    else if (o.type === 'wheat') blit(Art.obj.wheat, sx, sy - 20);
    else if (o.type === 'sandpile') blit(Art.obj.sandpile, sx, sy - 8);
    else if (o.type === 'icecrystal') blit(Art.obj.icecrystal, sx, sy - 24);
    else if (o.type === 'rocksalt') blit(Art.obj.rocksalt, sx, sy - 14);
    else if (o.type === 'harbor') blit(Art.obj.harbor, sx, sy - 32);
    else if (o.type === 'board') blit(Art.obj.board, sx, sy - 28);
    else if (o.type === 'fragment') { if (!S.f.raft) blit(Art.obj.fragment, sx - 4, sy - 12); }
    else if (o.type === 'box') { ctx.fillRect(sx, sy - 1, 16, 2); blit(Art.obj.box, sx, sy - 16); }
    else if (o.type === 'altar') { ctx.fillRect(sx, sy - 1, 32, 2); blit(Art.dev.altar, sx, sy - 32); if (!S.f.boss) { ctx.fillStyle = `rgba(255,200,120,${0.25 + 0.2 * Math.sin(t * 3)})`; ctx.fillRect(sx + 9, sy - 21, 6, 6); ctx.fillRect(sx + 19, sy - 21, 6, 6); } }
    ctx.globalAlpha = 1;
  }
  // 장치
  const tg = targets()[0];
  for (const d of S.placed) {
    const sx = d.x * T - cam.x, sy = d.y * T - cam.y;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(sx, sy + 31, 32, 2);
    blit(Art.dev[d.id], sx, sy);
    if (d.id === 'fire') Art.flame(ctx, sx, sy, d.s.level, t);
    if (d.id === 'collector') { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) ctx.fillRect(sx + 8 + i * 4, sy + 26 - ((t * 10 + i * 7) % 16), 2, 2); }
    if ((d.id === 'still' || d.id === 'cooker') && d.s.run && Math.random() < 0.25) puff(d.x * T + (d.id === 'still' ? 11 : 16), d.y * T + 2, 'rgba(235,245,255,.85)', 1);
    if (d.s.broken) { ctx.fillStyle = '#ff5a4a'; ctx.fillRect(sx + 12, sy + 12, 8, 2); ctx.fillRect(sx + 15, sy + 9, 2, 8); }
    if (d.id === 'cooker' && d.s.done) { ctx.fillStyle = '#ffe066'; ctx.fillRect(sx + 14, sy - 6 - Math.round(Math.sin(t * 6) * 2), 4, 4); }
    if (d.id === 'fire' && d.s.level > 0 && Math.random() < 0.1 * d.s.level) puff(d.x * T + 16, d.y * T + 10, '#ffb347', 1);
  }
  // 서리 늑대
  for (const m of S.mobs) {
    const [wx, wy] = wolfPos(m), face = (m.id % 2 ? -1 : 1), sx = Math.round(wx - 11 - cam.x), sy = Math.round(wy - 12 - cam.y), fr = Math.floor(t * 3 + m.id) % 2;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(sx + 2, sy + 12, 18, 2);
    ctx.globalAlpha = 0.45 + 0.55 * Math.max(0, m.M / m.M0);
    ctx.save();
    if (face < 0) { ctx.translate(sx + 22, 0); ctx.scale(-1, 1); blit(Art.wolf[fr], 0, sy); } else blit(Art.wolf[fr], sx, sy);
    ctx.restore(); ctx.globalAlpha = 1;
    if (Math.random() < 0.05) puff(wx, wy - 4, '#d8f3ff', 1);
  }
  // 플레이어
  const moving = Math.abs(S.vx) > 1, fr = !onGround ? 3 : moving ? 1 + (Math.floor(t * 8) % 2) : 0;
  const px = S.px - 3, py = S.py + PH - 22 - cam.y;
  ctx.fillStyle = 'rgba(0,0,0,.2)'; if (onGround) ctx.fillRect(Math.round(S.px - cam.x - 1), Math.round(S.py + PH - cam.y), PW + 2, 1);
  ctx.save();
  if (S.face < 0) { ctx.translate(Math.round(px - cam.x) + 16, 0); ctx.scale(-1, 1); blit(Art.playerFrames[fr], 0, py); } else blit(Art.playerFrames[fr], px - cam.x, py);
  ctx.restore();
  drawPeers(t);
  // 새·파티클
  if (hour > 7 && hour < 18) for (const b of birds) ctx.drawImage(Art.bird[Math.floor(b.ph) % 2], Math.round(b.x - cam.x), Math.round(b.y - cam.y + Math.sin(b.ph * 0.4) * 5));
  for (const p of parts) { ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.s, p.s); }
  ctx.globalAlpha = 1;
  // 물 (반투명 + 물결·거품)
  for (const [sx, sy, surf, tx] of drawW) {
    ctx.fillStyle = 'rgba(60,150,225,.42)'; ctx.fillRect(sx, sy, T, T);
    if (surf) {
      const w = Math.round(Math.sin(t * 2 + tx * 0.8) * 2);
      ctx.fillStyle = 'rgba(210,238,255,.95)'; ctx.fillRect(sx, sy, T, 2); ctx.fillRect(sx + 3 + w, sy + 2, 5, 1); ctx.fillRect(sx + 10 - w, sy + 4, 3, 1);
    } else if ((tx * 5 + Math.floor(t)) % 7 === 0) { ctx.fillStyle = 'rgba(210,238,255,.18)'; ctx.fillRect(sx + 5, sy + 6, 1, 4); }
  }
  if (Sim.dockOf(S).island === 'plaza') drawPlazaRafts(t);   // 물 위에 떠 있으니 물 색칠 뒤에 그린다
  // 밤 어둠 + 불빛 + 반딧불
  if (night > 0) {
    ctx.fillStyle = `rgba(8,12,40,${night * 0.5})`; ctx.fillRect(0, 0, VW, VH);
    for (const d of S.placed) if (d.id === 'fire' && d.s.level > 0) {
      const cx = d.x * T + 16 - cam.x, cy = d.y * T + 14 - cam.y;
      for (const [r, a] of [[52, 0.07], [38, 0.09], [24, 0.12]]) { ctx.fillStyle = `rgba(255,170,70,${a * night})`; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); }
    }
    for (const f of flies) {
      const fx = f.x - cam.x + Math.sin(t * 0.8 + f.ph) * 14, fy = f.y - cam.y + Math.cos(t * 0.6 + f.ph * 2) * 8, a = night * (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + f.ph)));
      ctx.fillStyle = `rgba(220,255,120,${a * 0.25})`; ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 4, 4); ctx.fillStyle = `rgba(240,255,170,${a})`; ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
    }
  }
  // 가장자리 어둡게(비네트)
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.45, VW / 2, VH / 2, Math.max(VW, VH) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.32)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  // 파기 표시: 팔 수 있는 타일에 테두리, 파는 중에는 진행 막대
  if ($('modal').hidden && !mode) {
    const [hx, hy] = mouseTile(), c = digCheck(hx, hy);
    if (c.ok) {
      const sx = hx * T - cam.x, sy = hy * T - cam.y;
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, T - 1, T - 1);
      if (dig.on && dig.p > 0) { ctx.fillStyle = '#000'; ctx.fillRect(sx, sy - 4, T, 3); ctx.fillStyle = '#ffd84a'; ctx.fillRect(sx + 1, sy - 3, Math.round((T - 2) * Math.min(1, dig.p / dig.need)), 1); }
    }
  }
  drawHUD(t);
  // 상호작용 표시(픽셀 화살표)
  if (tg && $('modal').hidden) {
    const ax = Math.round(tg.x - cam.x), ay = Math.round(tg.y - cam.y) - 24 + Math.round(Math.sin(t * 6) * 2);
    ctx.fillStyle = '#000'; ctx.fillRect(ax - 4, ay - 1, 9, 3); ctx.fillRect(ax - 3, ay + 2, 7, 2); ctx.fillRect(ax - 1, ay + 4, 3, 2);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax - 2, ay + 2, 5, 1); ctx.fillRect(ax, ay + 4, 1, 1);
  }
  const lbl = $('target'); const want = HUD.tip ? HUD.tip : mode && mode.startsWith('block:') ? `${ITEM[mode.slice(6)][1]} 놓기 — 빈 칸을 클릭, ESC 취소` : mode && mode.startsWith('tool:') ? `${mode === 'tool:salt' ? '소금 뿌리개' : '온도계'} — 대상을 클릭, ESC 취소` : mode ? '건설/철거 모드 — 클릭해서 실행, ESC 취소' : tg ? `[E] ${tg.label}` : '이동: A/D · 점프: W/스페이스 · 상호작용: E 또는 클릭';
  if (lbl.textContent !== want) lbl.textContent = want;
  // 건설 고스트
  if (mode && mode.startsWith('build:')) {
    const id = mode.slice(6), g = ghostCheck(id);
    const gx = g.tx * T - cam.x, gy = Sim.RAFT.DEV_Y * T - cam.y;
    ctx.globalAlpha = 0.65; blit(Art.dev[id], gx, gy); ctx.globalAlpha = 1;
    ctx.strokeStyle = g.ok ? '#4cff7a' : '#ff5a4a'; ctx.lineWidth = 1; ctx.strokeRect(gx + 0.5, gy + 0.5, 31, 31);
  }
}

// ---------- 인게임 HUD (게임 화면 안에 그린다) ----------
const GLYPH = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
  ':': '000010000010000', x: '000101010101000', D: '110101101101110', '.': '000000000000010', '-': '000000111000000', C: '111100100100111', ' ': '000000000000000',
};
const textW = s => s.length * 4 - 1;
function drawText(s, x, y, col = '#ffffff') {
  for (const [pass, c] of [[1, '#000000'], [0, col]]) {
    ctx.fillStyle = c; let cx = x;
    for (const ch of s) {
      const g = GLYPH[ch];
      if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) + pass, y + Math.floor(i / 3) + pass, 1, 1);
      cx += 4;
    }
  }
}
function hudBox(x, y, w, h, on) {
  ctx.fillStyle = '#0a0f1d'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = on ? '#6a5a18' : 'rgba(22,34,66,.88)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = on ? '#ffd84a' : '#4a68b4'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
}
const HUD = { hits: [], tip: '', bottom: 0, quest: -1 };
const hudMenu = [
  ['hammer', '건설', () => openBuild()], ['gear', '제작', () => openCraft()], ['book', '연구 노트', () => window.Notes && Notes.open(api)],
  ['scroll', '기록', () => openLog()], ['disk', '저장/계정', () => openSave()],
];
function drawHUD(t) {
  HUD.hits = []; HUD.tip = '';
  const over = (x, y, w, h) => mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h;
  // 가방: 칸마다 아이콘 + 개수
  const items = Object.entries(S.inv).filter(([, v]) => v >= 1).map(([k, v]) => ({ k, icon: ITEM[k][0], name: ITEM[k][1], n: Math.floor(v) }));
  if (S.caps.length) items.push({ icon: 'cap', name: '기체 캡슐 (' + capText() + ')', n: S.caps.length });
  if (S.packs.length) items.push({ icon: 'pack', name: '한제 팩', n: S.packs.length });
  const SL = 17, per = Math.max(4, Math.floor((VW - 118) / SL)), rows = Math.max(1, Math.ceil(items.length / per));
  items.forEach((it, i) => {
    const x = 4 + (i % per) * SL, y = 4 + Math.floor(i / per) * SL, hov = over(x, y, 16, 16);
    hudBox(x, y, 16, 16, hov); ctx.drawImage(Art.icon[it.icon], x + 3, y + 2);
    const s = String(it.n); drawText(s, x + 15 - textW(s), y + 10);
    if (BLOCK[it.k]) HUD.hits.push({ x, y, w: 16, h: 16, fn: () => { mode = mode === 'block:' + it.k ? null : 'block:' + it.k; say(mode ? `${it.name}을(를) 놓을 곳을 클릭하세요. (ESC 취소)` : '취소'); } });
    if (TOOL[it.k]) HUD.hits.push({ x, y, w: 16, h: 16, fn: () => { const m = 'tool:' + TOOL[it.k]; mode = mode === m ? null : m; say(mode ? `${it.name}: 쓸 대상을 클릭하세요. (ESC 취소)` : '취소'); } });
    if (hov) HUD.tip = `${it.name} ${it.n}` + (BLOCK[it.k] ? ' (클릭: 놓기)' : TOOL[it.k] ? ' (클릭: 사용)' : it.k === 'pickaxe' ? ' (돌을 팔 때 자동 사용)' : '');
  });
  HUD.bottom = 4 + rows * SL;
  // 시계(해/달 아이콘 + 일차 + 시각)
  const hh = String(Math.floor(S.min / 60)).padStart(2, '0'), mm = String(Math.floor(S.min % 60)).padStart(2, '0');
  const ts = `D${S.day} ${hh}:${mm}`, pw = textW(ts) + 20, px = VW - 4 - pw;
  hudBox(px, 4, pw, 14); ctx.drawImage(S.min >= 360 && S.min < 1080 ? Art.sun : Art.moon, px + 3, 6, 9, 9); drawText(ts, px + 16, 9);
  const tempS = Math.round(airTemp()) + 'C';
  if (over(px, 4, pw, 14)) HUD.tip = `${S.day}일차 ${hh}:${mm} · ${Sim.ISLANDS[Sim.dockOf(S).island].name} 외기 ${Math.round(airTemp())}℃ · ${fmt(pAtm(), 2)} atm`;
  // 메뉴 버튼
  hudMenu.forEach(([icon, label, fn], i) => {
    const x = VW - 4 - (5 - i) * 17 + 1, y = 22, hov = over(x, y, 16, 16);
    hudBox(x, y, 16, 16, hov); ctx.drawImage(Art.icon[icon], x + 3, y + 3);
    HUD.hits.push({ x, y, w: 16, h: 16, fn }); if (hov) HUD.tip = label;
  });
  // 시간 배속
  let sx = VW - 4;
  for (const sp of [10, 3, 1]) {
    const s = 'x' + sp, w = textW(s) + 6; sx -= w; const on = S.speed === sp;
    hudBox(sx, 40, w, 11, on); drawText(s, sx + 3, 43, on ? '#ffd84a' : '#ffffff'); sx -= 2;
    HUD.hits.push({ x: sx + 2, y: 40, w, h: 11, fn: () => { S.speed = sp; } }); if (over(sx + 2, 40, w, 11)) HUD.tip = `시간 속도 x${sp}`;
  }
  // 목표 텍스트는 화면 왼쪽 위(가방 아래)에 겹쳐 놓는다
  const qk = HUD.bottom * 1000 + S.qDone;
  if (HUD.quest !== qk) { HUD.quest = qk; const q = $('quest'); q.style.top = (HUD.bottom * K + 8) + 'px'; q.style.left = (4 * K) + 'px'; }
}

// 시계: 1초 = 게임 2분 (x1)
setInterval(() => { if (paused || (window.Raid && Raid.active)) return; advance(S.speed); if (modalTick && !$('modal').hidden) modalTick(); refresh(); }, 500);
setInterval(() => save(), 5000);
window.addEventListener('pagehide', () => save(true));
function fit() {   // 게임 화면이 창 전체를 채운다: 픽셀 배율(정수)은 고정하고 보이는 월드 범위를 창에 맞춘다
  const W = window.innerWidth, H = window.innerHeight;
  const k = Math.max(2, Math.round(Math.min(W / 560, H / 315)));
  K = k; VW = Math.ceil(W / k); VH = Math.ceil(H / k);
  cv.width = VW; cv.height = VH; ctx.imageSmoothingEnabled = false;
  cv.style.width = VW * k + 'px'; cv.style.height = VH * k + 'px';
  makeStars();
}
window.addEventListener('resize', fit);
refresh(); fit(); requestAnimationFrame(frame);
// 메인화면: 접속할 때마다 먼저 보이고, 시작하기를 누를 때까지 시간이 흐르지 않는다. 그다음 접속(로그인) 화면 → 첫 접속 도움말
paused = true;
$('t-info').textContent = S.day > 1 || S.qDone > 0 ? `저장된 진행: ${S.day}일차 · 목표 ${S.qDone}/${QUESTS.length}` : '새 게임';
function startGame() {
  if ($('title').hidden) return;
  $('title').hidden = true; paused = false; loadPlaza();
  boot().then(() => { let seen = false; try { seen = !!localStorage.getItem(HELP_KEY); } catch { /* 무시 */ } if (!seen && $('auth').hidden) openHelp(); });
}
$('t-start').onclick = startGame;
$('t-help').onclick = () => openHelp();
})();
