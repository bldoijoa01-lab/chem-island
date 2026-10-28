// 공용 UI 모듈: 말풍선·기록·모달·장치 패널·메뉴·접속(로그인)·목표 표시·궤도 관문·게시판. DOM을 다루고, 계산은 sim.js, 상태는 store.js, 지형은 world.js에 있다.
// 2D(game.js)와 fp/·td/가 같이 쓴다. 화면마다 다른 것(연기 효과, 건설 모드, 키 초기화, 접속 뒤 처리)은 `UI.init(host)`로 받는다.
window.UI = (() => {
'use strict';
const C = Chem, Art = window.Art, S = Store.S;
const { ITEM, NODE } = World;
const { FIRE_T, FIRE_BURN, FIRE_NAME, DEV, RECIPES, QUESTS, VALVE_NAME, SEA_BUCKET } = Sim;
const save = Store.save;
// 화면별 훅(기본은 아무 일도 하지 않는다): puff(x,y,색,개수) · burst(장치) · clearKeys() · startBuild(id) · startDemolish() · joinMap() · applyWorld()
let H = { puff() {}, burst() {}, clearKeys() {}, startBuild() {}, startDemolish() {}, joinMap() {}, applyWorld() {} };
Store.onWarn = (m) => say(m);

// ---------- 유틸 ----------
const $ = id => document.getElementById(id);
const fmt = (v, d = 1) => Number(v).toFixed(d);
const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;   // 그림 문자는 쓰지 않는다(전부 픽셀 아이콘)
const pix = s => String(s).replace(EMO, '').replace(/^\s+/, '');
const ic = k => `<i class="ic" style="background-image:url(${Art.iconURL[k]})"></i>`;
const clockText = () => `${S.day}일차 ${String(Math.floor(S.min / 60)).padStart(2, '0')}:${String(Math.floor(S.min % 60)).padStart(2, '0')}`;
const airTemp = () => Sim.airTemp(S);   // ℃: chem.js의 시각별 기온 + 행성별 보정(sim.js ENV)
const pAtm = () => Sim.pAtm(S);         // 외기 압력(atm): 행성마다 다르다(저기압 고원 행성은 낮음)
let msgTimer;
function say(t) { $('msg').textContent = pix(t); clearTimeout(msgTimer); msgTimer = setTimeout(() => $('msg').textContent = '', 6000); }
function logEv(type, text) { S.log.push({ day: S.day, t: clockText(), type, text: pix(text) }); if (S.log.length > 300) S.log.shift(); }
const has = cost => Sim.has(S, cost);
const pay = cost => Sim.pay(S, cost);
const costText = cost => Object.entries(cost).map(([k, v]) => `${ic(ITEM[k][0])}${ITEM[k][1]} ${v}`).join(' · ');
const unlocked = id => Sim.unlocked(S, id);
// 계산(sim.js)이 쌓은 이벤트를 화면에 반영한다: 말풍선·폭발 연기·얼음 생물 효과·목표 갱신
function flush() {
  for (const e of Sim.drain()) {
    if (e.t === 'say') say(e.text);
    else if (e.t === 'burst') H.burst(e.d);
    else if (e.t === 'puff') H.puff(e.x, e.y, e.col, e.n);
    else if (e.t === 'puffWolf') H.puff(...World.wolfPos(e.m), '#d8f3ff', 10);
    else if (e.t === 'refresh') refresh();
    else if (e.t === 'moved') { H.applyWorld(); loadPlaza(); }
  }
}
const advance = dm => { Sim.advance(S, dm); flush(); };
const heatOf = d => Sim.heatOf(S, d), fireNear = d => Sim.fireNear(S, d), cookerState = Sim.cookerState;


// ---------- 궤도 이동: 탐사정 잔해 · 궤도 이동 단말 · 표류 통신 게시판 · 허브의 다른 탐사정 ----------
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function uiFragment() {
  const R = Sim.RAFT;
  openModal('탐사정 잔해', `<div class="box"><p>${Sim.hubOn() ? '본부 도킹 구역에 놓인' : '보급 모듈 끝에 놓인'} 탐사정 잔해입니다. 고치면 탐사정이 이륙할 수 있게 되어 다른 행성(저기압 고원 행성·얼음 위성)으로 갈 수 있어요. 냉각계에 증류수와 소금을 채우는 설정이라, 직접 증류해 얻은 물과 소금이어야 합니다.</p>
    <div class="kv"><span>필요한 재료</span><b>${costText(R.REPAIR_COST)}</b></div>
    <div class="kv"><span>증류 기록 (직접 얻은 양)</span><b>증류수 ${Math.floor(S.f.dW)} / ${R.REPAIR_NEED.dW} g · 소금 ${Math.floor(S.f.dS)} / ${R.REPAIR_NEED.dS} g</b></div>
    <div class="row" style="margin-top:8px"><button class="primary" ${has(R.REPAIR_COST) && S.f.dW >= R.REPAIR_NEED.dW && S.f.dS >= R.REPAIR_NEED.dS ? '' : 'disabled'} onclick="G.repairRaft()">고치기</button></div></div>
    <div class="warnbox">고치면 튜토리얼이 끝납니다: 온도가 0 ℃ 미만인 자리의 장치에 얼음 생물이 나타나고, 압력 밥솥은 3 atm을 넘으면 터집니다. (재료·조건·칸 수는 가정(임의값))</div>`);
}
function uiSail() {
  const here = Sim.dockOf(S).island;
  const atTerminal = Sim.hubOn() ? here === 'plaza' : here === 'start';   // 본부 배제(§4-30): 궤도 이동 단말은 본부 대신 내 월드의 보급 모듈에 있다
  const list = atTerminal ? Sim.HARBORS : [{ dock: Sim.hubOn() ? 'plaza' : 'start', label: Sim.hubOn() ? '허브 귀환' : '기지 귀환', name: Sim.hubOn() ? '허브 정거장' : '내 월드(보급 모듈)', open: true }];
  const rows = list.map(h => {
    const need = Sim.UNLOCK[h.dock] || 0, locked = S.qDone < need, env = Sim.ENV[Sim.DOCKS[h.dock] ? Sim.DOCKS[h.dock].island : ''];
    const on = S.f.raft && h.open && Sim.DOCKS[h.dock] && h.dock !== S.raft.dock && !locked;
    const info = env && (env.P !== 1 || env.dT) ? `<div class="mut">외기 ${fmt(env.P, 2)} atm(물 ${fmt(C.tb(env.P), 0)} ℃에서 끓음) · 기온 ${env.dT >= 0 ? '+' : ''}${env.dT} ℃</div>` : '';
    return `<div class="box row between"><div><b>${h.label} — ${h.name}</b> ${h.open ? (locked ? `<span class="no">목표 ${need}개 달성 시 열림</span>` : `<span class="mut">${Sim.SAIL_MIN[h.dock] || 30}분</span>`) : '<span class="no">아직 갈 수 없음</span>'}${info}</div>
      <button ${on ? '' : 'disabled'} onclick="G.sail('${h.dock}')">이륙</button></div>`;
  }).join('');
  openModal(`궤도 관문 (${Sim.ISLANDS[here].name})`, (S.f.raft ? '' : `<div class="warnbox">${Sim.hubOn() ? '본부의 탐사정 잔해를 먼저 고쳐야 이륙할 수 있어요. (도킹 구역 옆)' : '보급 모듈의 탐사정 잔해를 먼저 고쳐야 이륙할 수 있어요.'}</div>`)
    + rows + `<div class="mut">궤도 이동 시간은 가정(임의값)이고, 도착하면 착륙 캡슐에서 시작하고 전송 패드로 ${Sim.hubOn() ? '본부' : '기지(보급 모듈)'}에 돌아옵니다. 행성마다 외기 압력·구역 온도가 달라 같은 장치도 다르게 동작합니다.</div>`);
}
const NPC_BOTTLES = [
  { nick: '선배1', text: '증류기는 화덕 옆에! 약불(105 ℃)로는 끝까지 못 끓여요.' },
  { nick: '선배2', text: '한제는 얼음 100 g당 소금 16 g 이상이면 -10 ℃ 아래.' },
  { nick: '선배3', text: '대기 처리 코어 3단계는 O₂ 캡슐이 4개 필요해요. 하루치로는 모자라요.' },
];
let bottleAt = 0;
function uiBoard() {
  const online = window.Net && Net.user && Net.loadBottles;
  openModal('표류 통신 게시판', `<div class="box"><div id="b-list" class="mut">불러오는 중...</div></div>
    ${online ? `<div class="row" style="margin-top:8px"><input id="b-text" maxlength="80" placeholder="유리병에 넣을 한마디 (80자, 개인정보는 쓰지 마세요)" style="flex:1 1 200px;min-width:0"><button class="primary" onclick="G.bottle()">띄우기</button></div>`
      : '<div class="warnbox">온라인으로 접속하면 다른 사람이 띄운 편지를 읽고 내 편지도 띄울 수 있어요. (지금은 선배들의 편지만 보입니다)</div>'}`);
  loadBottles();
}
async function loadBottles() {
  let list = NPC_BOTTLES.slice();
  if (window.Net && Net.user && Net.loadBottles) { try { list = (await Net.loadBottles(12)).concat(list); } catch { /* 오프라인 */ } }
  const el = $('b-list'); if (el) el.innerHTML = list.map(b => `<div><b>${esc(b.nick)}</b> ${esc(pix(b.text))}</div>`).join('') || '아직 편지가 없습니다.';
}
// 허브 정거장: 도킹한 다른 사람의 탐사정(읽기 전용). 서버의 /rafts에서 최근 것을 읽어 온다
let plazaRafts = [];
async function loadPlaza() {
  plazaRafts = [];
  if (Sim.dockOf(S).island !== 'plaza' || !(window.Net && Net.user && Net.loadRafts)) return;
  try { plazaRafts = await Net.loadRafts(3); } catch { /* 오프라인 */ }
}
setInterval(() => { if (!Store.paused) loadPlaza(); }, 60000);

// ---------- 전송 패드 · 내 월드 (17-a′, DESIGN.md §4-24) ----------
// 코어 패드(내 월드) ↔ 본부 패드. E → 목적지 → 3초 대기(창을 닫으면 취소) → 이동. 시간은 흐르지 않는다.
let padWait = null;   // { to, at(ms) }
const PAD_MS = 3000;  // 가정(임의값) 전송 대기
function openPad() {
  const here = Sim.dockOf(S).island, hub = Sim.hubOn(), to = !hub ? 'start' : here === 'start' ? 'plaza' : here === 'plaza' ? 'start' : 'plaza';
  const toName = to === 'start' ? (hub ? '내 월드 (기지 코어)' : '내 기지 (보급 모듈)') : '본부 (허브 정거장)';
  padWait = null;
  openModal('전송 패드', `<div class="box"><p>${here === 'plaza' ? '본부' : here === 'start' ? '내 월드' : Sim.ISLANDS[here].name}의 전송 패드입니다. ${hub ? '본부와 내 월드를 무료로 오갑니다.' : '내 기지(보급 모듈)로 돌아갑니다.'} 전송 중에는 창을 닫지 마세요(닫으면 취소).</p>
    <div class="row"><button class="primary" onclick="G.padGo('${to}')">${toName}로 전송 (${PAD_MS / 1000}초)</button></div><div id="pad-st" class="mut"></div></div>
    <div class="warnbox">${hub ? '내 월드는 팀(혼자면 1인 팀)마다 따로 있어서 다른 사람은 들어올 수 없습니다. 본부에서만 서로 만나고 교류합니다.' : '내 월드는 팀(혼자면 1인 팀)마다 따로 있습니다. 친구는 게임 안 [친구 초대]의 코드로 들어옵니다.'} (전송 시간은 게임 설정, 가정)</div>`, padTick, () => { padWait = null; });
}
function padTick() {
  if (!padWait) return;
  const left = padWait.at - Date.now();
  if (left <= 0) { const to = padWait.to; padWait = null; if (Sim.act.teleport(S, to)) { closeModal(); save(true); } flush(); refresh(); return; }
  set('pad-st', `전송 중... ${Math.ceil(left / 1000)}초`);
}
// 방문 미리보기용 공개 요약(/bases/{id}, 17-b): 이름·색·팀원·연구 단계·한 줄 + 장치 목록(40개) + 판 칸을 줄인 작은 그림. 코어 위치 말고는 올리지 않고, 걸어 들어갈 수는 없다(읽기 전용)
// 팀이면 id는 팀 id(pid)이고 임대 보유자만 올린다. 혼자면 내 uid. 값이 그대로면 쓰지 않고 10분마다 한 번은 시각을 갱신한다
const COLORS = ['#ff8a5b', '#5bc0ff', '#9be564', '#e0a3ff', '#ffd84a', '#ff6b9a', '#6fe0c8', '#c0c8d8'];
let lastPub = '', lastPubAt = 0;
function publishBase(force) {
  if (!Sim.hubOn()) return;   // 본부 배제(§4-30): 방문 미리보기는 꺼져 있어 공개 요약을 올리지 않는다
  if (!(window.Net && Net.user && Net.basePublish)) return;
  const T = window.Team, team = !!(T && T.inParty());
  if (team && !T.holder()) return;
  const uid = Net.user.uid, id = team ? T.pid() : uid, meta = team ? (T.meta() || {}) : null;
  const members = {}; if (team) { for (const u in T.members()) members[u] = String((T.members()[u] || {}).nick || '').slice(0, 8); } else members[uid] = String(Net.nick || '').slice(0, 8);
  const devices = S.placed.filter(d => (d.pl || 'start') === 'start').slice(0, 40).map(d => ({ id: String(d.id).slice(0, 12), x: d.x, y: d.y, run: !!(d.s && d.s.run), broken: !!(d.s && d.s.broken) }));
  let map = null; try { map = World.thumb(S); } catch { /* 그림 없이 올린다 */ }
  const summary = `장치 ${S.placed.length}개 · 목표 ${S.qDone}/${QUESTS.length} · 판 칸 ${Math.round(World.worldSize() / 1000)} KB`.slice(0, 200);
  const rec = { name: team ? meta.name : ((Net.nick || '내') + ' 월드').slice(0, 10), color: team ? meta.color : COLORS[[...uid].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length], members, tech: 0, summary, devices };
  if (map) rec.map = map;
  const k = JSON.stringify(rec), now = Date.now();
  if (!force && ((k === lastPub && now - lastPubAt < 600000) || now - lastPubAt < 25000)) return;
  lastPub = k; lastPubAt = now;
  Net.basePublish(id, rec).catch(() => {});
}
setInterval(() => { if (!Store.paused) publishBase(false); }, 30000);

// ---------- 퀘스트 ----------
function checkQuests() { Sim.checkQuests(S); flush(); }

// ---------- 상호작용 대상 ----------
const HUB_FACILITY = { trade: 'trade', reports: 'reports', boards: 'boards', signs: 'signs', project: 'project' };   // 17-b 본부 교류 시설 → shared/hub.js 창
function interact(t) {
  if (!t) return;
  if (t.kind === 'wolf') return uiWolf(t.ref);
  if (t.kind === 'dev') return openDevice(t.ref);
  if (t.kind === 'water') { Sim.act.scoop(S); flush(); return refresh(); }
  if (t.kind === 'box') return openBox();
  if (t.kind === 'fragment') return uiFragment();
  if (t.kind === 'pad') return openPad();
  if (t.kind === 'harbor') return uiSail();
  if (t.kind === 'board') return uiBoard();
  if (HUB_FACILITY[t.kind]) return window.HubUI ? window.HubUI[HUB_FACILITY[t.kind]]() : say('팀·교류 시설은 웹 주소(http)로 접속해야 쓸 수 있어요. 파일로 연 화면에서는 꺼져 있습니다.');
  if (t.kind === 'altar') return window.Raid ? Raid.open(api) : null;
  if (t.kind === 'rocksalt' && !(S.inv.pickaxe > 0)) return say('암염은 단단한 이온 결정이라 곡괭이가 있어야 캘 수 있어요.');
  const n = NODE[t.kind], ok = Sim.act.gather(S, t.ref, n, ITEM[n[0]][1]);
  flush();
  if (ok) { H.puff(t.x, t.y, '#ffffff', 5); refresh(); }
}
function openBox() { Sim.act.box(S); flush(); refresh(); }


// ---------- 모달 ----------
let modalTick = null, modalCloseHook = null;
const TITLE_ICON = { '화덕': 'fire', '증류기': 'still', '압력 밥솥': 'cooker', '냉각 상자': 'cooler', '기체 포집기': 'collector' };
function openModal(title, html, tick, onClose) {
  const t = pix(title);
  const key = Object.keys(TITLE_ICON).find(k => t.includes(k));
  $('mtitle').innerHTML = (key ? ic(TITLE_ICON[key]) : '') + t;
  $('mbody').innerHTML = pix(html);
  $('modal').hidden = false; modalTick = tick || null; modalCloseHook = onClose || null;
  H.clearKeys();
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
  openModal(DEV[d.id].name, `<div class="box"><h4>파손됨</h4><p>얼음 생물이 부숴서 작동하지 않습니다. 나뭇가지 2개로 수리할 수 있어요.</p>
    <div class="row"><button class="primary" onclick="act('repair');G.closeModal()">수리 (나뭇가지 2)</button></div></div>`);
}
// 얼음 생물 화면: 소금 → 얼음이 녹는 양을 어는점 내림 식으로 계산 [#37 #39 #21]
let wolfRef = null;
function uiWolf(m) {
  wolfRef = m;
  const T = airTemp();
  openModal('얼음 생물', `
    <div class="grid2"><div class="box"><h4>얼음 생물</h4>
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
    <div class="warnbox">얼음에 소금이 닿으면 어는점이 내려가 (ΔTf = i·Kf·m, i=2, Kf=1.86) 기온 T에서 평형이 되는 몰랄농도 m_eq = |T|/(i·Kf)까지 얼음이 녹습니다. 기온이 낮을수록 같은 얼음을 녹이는 데 소금이 더 많이 필요합니다. 0 ℃ 이상에서는 소금이 필요 없어요. (화덕 열로도 녹일 수 있습니다: Q = m·융해열)</div>`,
  () => {
    if (!S.mobs.includes(m)) { closeModal(); return; }
    const T = airTemp(), sl = $('w-s'), s = Math.min(+sl.value, S.inv.salt);
    const melt = Math.min(C.iceMeltBySalt(T, s), m.M), need = C.saltForIce(T, m.M);
    const use = melt >= m.M ? Math.min(s, need) : s;
    set('w-m', fmt(m.M, 0) + ' g'); set('w-T', fmt(T, 1) + ' ℃');
    set('w-eq', T < 0 ? fmt(-T / (2 * C.KF), 2) + ' mol/kg' : '—');
    set('w-need', isFinite(need) ? fmt(need, 1) + ' g' : '불가');
    set('w-sv', fmt(s, 0)); set('w-have', fmt(S.inv.salt, 0));
    set('w-melt', fmt(melt, 0) + ' g'); set('w-use', fmt(use, 1) + ' g');
    setw('w-bar', m.M / m.M0 * 100, 'good');
    set('w-note', T >= 0 ? '기온이 0 ℃ 이상이라 소금이 필요 없어요. 곧 녹습니다.' : '기온이 낮을수록 같은 얼음을 녹이는 데 소금이 더 듭니다.');
  });
}
function wolfSalt() {
  const m = wolfRef;
  if (!m || !S.mobs.includes(m)) return;
  const s = Math.min(+$('w-s').value, S.inv.salt);
  if (s <= 0) return say('소금을 뿌릴 양을 정하세요.');
  if (saltOnWolf(m, s)) closeModal(); else uiWolf(m);
}
// 얼음 생물에게 소금 s g을 뿌린다(모달·소금 뿌리개 공용). 얼음 생물이 정화되면 true
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
    <div class="warnbox">용질(소금)이 녹으면 증기압이 내려가 끓는점이 오릅니다. 증발할수록 용매(물)의 질량이 줄어 몰랄 농도가 올라가고 점점 더 높은 열원이 필요합니다. 처음 물의 10 %가 남으면 증류가 끝나고 소금이 남습니다(끝나는 기준과 증발 속도는 게임 설정(가정)). (비휘발성 용질, 라울의 법칙, NaCl 완전 해리 i=2 가정)</div>`,
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
      <label>소금 <input type="number" id="k-salt" min="0" max="60" value="0" style="width:64px"> g</label></div>
      <div class="kv"><span>몰랄농도 m</span><b id="k-m"></b></div>
      <div class="kv"><span>한제 온도</span><b id="k-T"></b></div>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="act('pack')">한제 팩 만들기 (30분)</button></div>
      <div class="kv"><span>오늘의 팩</span><b id="k-n"></b></div></div>
    <div class="warnbox">소금이 녹은 물은 어는점이 내려가 0 ℃ 이하에서도 얼음과 함께 있을 수 있습니다: ΔTf = i·Kf·m (Kf=1.86, NaCl i=2). 소금은 얼음 100 g당 30 g까지만 넣을 수 있게 했고(게임 설정, 가정(임의값)), 팩은 당일에 녹습니다. (얼음 전체 질량 기준)</div>`,
  () => {
    $('k-salt').max = +$('k-ice').value * Sim.COOLER.SALT_PER_100G;   // 게임 설정(가정): 얼음 100 g당 소금 상한
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
    <div class="warnbox">공기는 반응하지 않는 기체의 혼합물이라 전체 압력은 분압의 합입니다(돌턴). 같은 압력·부피라도 온도가 낮을수록 더 많은 기체가 모입니다. 질소·산소·헬륨 캡슐은 허브 보급 상자에서 얻습니다. (공기에서 성분을 분리하려면 분별증류 등이 필요 — 이 행성에는 없음)</div>`,
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
  openModal('건설', rows + `<div class="mut">장치는 내 월드(또는 원정 부지)의 빈 공간 2x2칸에 짓습니다. 아래가 단단해야 하고, 지을 곳에 마우스를 두고 클릭하세요. 본부에는 지을 수 없어요.</div>
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
      <div>A/D 이동 · W/스페이스 점프 · <b>E</b> 또는 클릭으로 상호작용 · ESC 닫기 · 땅을 꾹 눌러 파기</div>
      <div>오른쪽 위 아이콘: 건설 · 제작 · 연구 노트 · 기록 · 저장/계정 · x1/x3/x10은 시간 속도</div></div>
    <div class="box"><h4>처음 해 볼 것</h4>
      <div>1. ${Sim.hubOn() ? '코어 캡슐에서 시작합니다. 전송 패드(E)로 본부에 가서 도킹 구역 물가에서 바닷물을 뜨고(E), 재배 선반에서 재료를 모으세요. 내 월드의 평평한 바닥에 화덕을 지으세요. (코어 벽의 해치 너머를 파고 나가 결정 줄기·균사·당 결정 동굴을 찾을 수도 있어요)' : '코어 캡슐에서 시작합니다. 코어 오른쪽 해치 밖은 단단한 땅이에요. 마우스를 꾹 눌러 파면 보급 모듈이 나옵니다. 모듈의 물웅덩이 옆에서 바닷물을 뜨고(E), 재배 선반에서 재료를 모은 뒤 평평한 바닥에 화덕을 지으세요. (코어 반대쪽 땅을 파고 나가 결정 줄기·균사·당 결정 동굴을 찾을 수도 있어요)'}</div>
      <div>2. 결정 줄기 군락·모래 층에서 재료를 모아 증류기를 화덕 옆에 짓고, 화덕을 중불로 켠 뒤 바닷물을 증류하세요.</div>
      <div>3. ${Sim.hubOn() ? '본부의' : '보급 모듈의'} 탐사정 잔해를 고쳐 이륙하면 다른 행성에 갈 수 있어요. 목표를 순서대로 달성하면 장치가 열리고 ${Sim.hubOn() ? '본부의' : '보급 모듈의'} 대기 처리 코어에 도전합니다.</div></div>
    <div class="box"><h4>친구와 함께 (랜서버 방식)</h4>
      <div>방장은 평소처럼 시작한 뒤 게임 안 오른쪽 위 <b>친구 초대</b> 아이콘을 누르면 6자리 코드가 나오고(복사 버튼), 친구는 처음 화면의 <b>코드로 들어가기</b>에 닉네임과 코드를 넣습니다. 팀은 최대 6명입니다.</div>
      <div class="mut">${INVITE_NOTE}</div></div>
    ${window.Tutorial && !Sim.hubOn() ? `<div class="box"><h4>첫 5분 안내</h4><div>이동 → 점프 → 땅 파기 → 염수 → 화덕 → 증류기 순서로 화면 아래에 안내가 나와요. 지금: <b>${Tutorial.isOff() ? '꺼짐' : '켜짐'}</b></div><div class="row" style="margin-top:6px"><button onclick="Tutorial.setOff(${!Tutorial.isOff()});G.help()">안내 ${Tutorial.isOff() ? '켜기' : '끄기'}</button><button onclick="Tutorial.reset();G.closeModal()">처음부터 다시 보기</button></div></div>` : ''}
    <div class="warnbox">모든 장치는 수업에서 배운 식(라울의 법칙, 끓는점 오름·어는점 내림, 이상 기체, 돌턴 분압)을 실제로 계산합니다. 온도가 0 ℃ 미만인 자리(얼음 광맥 동굴·얼음 위성)에 장치를 지으면 얼음 생물이 부수러 오니 소금을 준비하세요. 연구 노트에서 규칙과 계산기를, 기록에서 자동 기록을 볼 수 있습니다. 더 자세한 설명은 저장소의 GUIDE.md를 보세요.</div>`,
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
function showAuth() { $('modal').hidden = true; authErr(''); $('auth').hidden = false; Store.paused = true; H.clearKeys(); }
function applyRemote(r) { Store.merge(r); H.applyWorld(); document.querySelectorAll('.speed button').forEach(x => x.classList.toggle('on', +x.dataset.sp === S.speed)); }
// 신원이 확정된 뒤: 서버 세이브가 있으면 그것으로, 없으면 지금 진행 상황을 서버에 올린다
// 메인 화면 [새로 시작]: 이 브라우저의 진행을 비우고, 서버에 저장된 진행이 있으면 덮어쓸지 한 번 더 묻는다(enterWorld에서)
let freshStart = false;
function startFresh() { Store.reset(); H.applyWorld(); save(true); freshStart = true; }
async function enterWorld() {
  const fresh = freshStart; freshStart = false;
  try {
    const r = Store.remote ? await Net.loadSave() : null;   // fp는 2D 서버 세이브를 읽지 않는다
    if (r && (!fresh || ((r.qDone > 0 || r.day > 1) && !confirm(`서버에 저장된 진행(${r.day}일차, 목표 ${r.qDone}개)이 있습니다. 새 게임으로 덮어쓸까요?\n(취소하면 저장된 진행을 이어서 합니다)`)))) applyRemote(r);
  } catch { say('서버 세이브를 불러오지 못했습니다. 이 브라우저의 저장으로 시작합니다.'); }
  $('auth').hidden = true; Store.paused = false; Store.forceNext(); save(true); refresh();
  H.joinMap(); publishBase(true);
  say(`${Net.nick}님, 환영합니다!`);
}
async function busy(fn) {
  const btns = [...document.querySelectorAll('#abox button')]; btns.forEach(b => b.disabled = true); authErr('');
  try { await fn(); } catch (e) { authErr(e.message); } finally { btns.forEach(b => b.disabled = false); }
}
$('a-start').onclick = () => busy(async () => { await Net.register($('a-nick').value); await enterWorld(); });
$('a-lgo').onclick = () => busy(async () => { await Net.login($('a-lnick').value, $('a-lpw').value); await enterWorld(); });
$('a-off').onclick = () => { $('auth').hidden = true; Store.paused = false; };
for (const id of ['a-nick', 'a-lnick', 'a-lpw']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $(id === 'a-nick' ? 'a-start' : 'a-lgo').click(); });
// ---------- 랜서버식 초대(2026-10-28): 메인 화면 [코드로 들어가기] ----------
// 방장은 게임 안 [친구 초대](team.js의 Invite)로 6자리 코드를 만들고, 친구는 메인 화면에서 닉네임과 코드를 넣는다. 새 서버 경로·규칙은 없다(팀 코드 가입을 그대로 쓴다).
// 한계(MULTIPLAYER.md §12): 월드는 서버(/parties/{pid}/state)에 남으므로 방장이 접속 중이 아니어도 코드로 들어갈 수 있고, 서버 규칙은 이를 막지 못한다.
const INVITE_NOTE = '방장이 접속 중이 아니어도 코드만 알면 들어올 수 있어요(월드가 서버에 남아 있어요). 서버가 이를 막지 못하니 코드는 믿는 친구에게만 알려 주세요.';
// 돌려주는 값: 'joined'(팀에 들어감) | 'declined'(내 진행을 잃는 게 싫어 취소 — 내 월드로 시작). 코드·접속 오류는 던진다
async function joinWithCode(nick, code) {
  code = String(code || '').trim().toUpperCase(); nick = String(nick || '').trim();
  if (code.length !== 6) throw new Error('초대 코드는 6자입니다.');
  if (!window.Net || !Net.init()) throw new Error('온라인 접속이 필요해요. 웹 주소(http)로 접속했는지 확인하세요.');
  if (!window.Invite) throw new Error('팀 기능을 아직 불러오지 못했어요. 잠시 뒤 다시 시도하세요.');
  Store.paused = true;
  const me = await Net.restore();                          // 이 브라우저에 이미 캐릭터가 있으면 그 이름으로 들어간다
  if (me) { if (nick && nick.toLowerCase() !== me.toLowerCase()) throw new Error(`이 브라우저에는 이미 '${me}' 캐릭터가 있어요. 닉네임 칸을 '${me}'로 쓰거나 비워 두세요.`); }
  else await Net.register(nick);
  await enterWorld();                                      // 서버에 내 저장이 있으면 불러온다
  Store.paused = true;                                     // 아직 메인 화면 뒤: 입장이 끝날 때까지 시간을 멈춘다
  if ((S.day > 1 || S.qDone > 0 || S.placed.length) && !confirm(`이 캐릭터에 진행이 있습니다(${S.day}일차, 목표 ${S.qDone}개, 장치 ${S.placed.length}개).\n코드로 들어가면 내 월드는 팀 월드로 바뀌고 장치는 철거되어 재료로 돌려받습니다(가방은 가져갑니다). 들어갈까요?`)) return 'declined';
  await Invite.join(code);
  return 'joined';
}
async function boot() {
  if (!window.Net || !Net.init()) return;     // Firebase를 쓸 수 없으면 혼자 하기
  Store.paused = true;
  const nick = await Net.restore();
  if (nick) await enterWorld(); else showAuth();
}

// ---------- 공개 API (raid.js, notes.js) ----------
const api = {
  S: () => S, say, logEv, openModal, closeModal, set, setw, fmt, refresh: () => refresh(), save,
  capCount, ITEM, airTemp, advance, Art,
};
window.G = {
  startBuild(id) { H.startBuild(id); },
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
  expandRaft() { if (Sim.act.expandRaft(S)) H.applyWorld(); flush(); openBuild(); refresh(); },
  startDemolish() { H.startDemolish(); },
  padGo(to) { padWait = { to, at: Date.now() + PAD_MS }; padTick(); },
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
    try { localStorage.removeItem(Store.KEY); } catch { /* 무시 */ }
    Store.reset(); H.applyWorld(); closeModal(); showAuth();
  },
  debug: () => S,   // 시험 플레이/자동 점검용: 현재 상태 조회
  reset() { if (confirm('모든 진행이 사라집니다. 정말 처음부터 시작할까요?')) { Store.reset(); H.applyWorld(); save(true); closeModal(); refresh(); } },
};

// ---------- 목표 텍스트(DOM 오버레이) ----------
function refresh() {
  checkQuests();
  const q = QUESTS[S.qDone];
  $('quest').innerHTML = QUESTS.slice(0, S.qDone).map(x => `<div class="q done">${x.t}</div>`).join('')
    + (q ? `<div class="q"><b>${q.t}</b><small>${q.hint}</small></div>` : '<div class="q done">모든 목표 달성! 계속 실험해 보세요.</div>');
}


return {
  init(host) { H = Object.assign(H, host); },
  $, fmt, pix, ic, esc, say, logEv, flush, advance, has, pay, costText, unlocked, heatOf, fireNear,
  set, setw, openModal, closeModal, refresh, checkQuests, interact, openBox, openDevice, capCount, capText,
  openBuild, openCraft, openLog, openHelp, openSave, showAuth, boot, loadPlaza, plazaRafts: () => plazaRafts, api,
  startFresh, joinWithCode, INVITE_NOTE,
  openPad, publishBase,
  isModalOpen: () => !$('modal').hidden,
  tick() { if (modalTick && !$('modal').hidden) modalTick(); },   // 열린 패널을 주기적으로 다시 그린다
  pAtm, HELP_KEY, targets: () => World.targets(S),
};
})();
