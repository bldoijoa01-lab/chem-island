// 팀 대 팀 기지 합치기 (17단계 17-c, DESIGN.md §4-26). team.js가 불러오는 옆면 전용 모듈.
// 17-b의 코드 가입(한 사람이 팀에 들어가기)을 팀 단위로 일반화한다: 제안(/merges) → 수락 → 게스트 팀원 전원 확인 → 한 명씩 호스트 팀에 들어감(장부로 중간 끊김 복구).
// 호스트 월드는 한 번도 건드리지 않고, 게스트 월드는 이어 붙이지 않고 버린다. 화학 계산은 없다. 서버가 검증하지 못하는 것은 MULTIPLAYER.md의 17-c 항목(약속에 기댄 표시).
import { Party, TEAM_MAX } from './shared/party.js';
const S = Store.S, { DEV } = Sim, esc = UI.esc;
export const OFFER_MS = 10 * 60000, EXEC_MS = 30 * 60000;   // 가정(임의값): 제안 유효 10분, 수락 뒤 합류 마감 30분
const me = () => (window.Net && Net.user ? Net.user.uid : null);
const say = (t) => UI.say(t);
const atHub = () => Sim.dockOf(S).island === 'plaza';
const myN = () => Object.keys(Party.members).length || 1;
// 호스트 선정: 인원이 더 많은 팀, 같으면 먼저 만든 팀. pid는 Firebase push id라 앞부분이 생성 시각이므로 (길이, 사전순)으로 비교한다
export const pidOrder = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
export const hostOf = (A, B) => (A.n !== B.n ? (A.n > B.n ? A : B) : (pidOrder(A.pid, B.pid) <= 0 ? A : B));

// ---------- 서버 기록 감시 ----------
let inbox = {}, outDoc = null, watchedPid = null, watchedTo = null, unsubIn = null, unsubOut = null;
const pubs = {};   // 간판에서 본 다른 팀 { pid: {name, members, q...} }
function rewatch() {
  const pid = Party.pid, to = Party.mergeInfo ? Party.mergeInfo.to : null;
  if (pid !== watchedPid) { if (unsubIn) unsubIn(); unsubIn = null; inbox = {}; watchedPid = pid; if (pid && Net.mergeWatchIn) unsubIn = Net.mergeWatchIn(pid, (d) => { inbox = d || {}; }); }
  const wantTo = pid && to ? to : null;
  if (wantTo !== watchedTo || (!wantTo && unsubOut)) { if (unsubOut) unsubOut(); unsubOut = null; outDoc = null; watchedTo = wantTo; if (wantTo && Net.mergeWatch) unsubOut = Net.mergeWatch(wantTo, pid, (d) => { outDoc = d; }); }
}
// 합의 기록 하나를 읽기 쉬운 모양으로 (제안 시각 o가 맞는 응답만 인정)
function view(to, from, doc) {
  if (!doc || !doc.offer) return null;
  const o = doc.offer, ans = doc.answer && doc.answer.o === o.t ? doc.answer : null, grant = doc.grant && doc.grant.o === o.t ? doc.grant : null;
  const cnt = (m) => Object.values(m || {}).filter(v => v === o.t).length;
  const host = o.host, guest = host === from ? to : from, guestN = host === from ? (ans ? ans.n : 0) : o.n, hostN = host === from ? o.n : (ans ? ans.n : 0);
  const v = { to, from, offer: o, answer: ans, grant, host, guest, guestN, hostN, ready: Object.entries(doc.ready || {}).filter(([, x]) => x === o.t).map(([u]) => u).sort(), moved: cnt(doc.moved), now: Date.now() };
  v.hostQ = host === from ? o.q : (ans ? ans.q : 0);
  v.state = ans ? (ans.res === 'reject' ? 'rejected' : v.moved >= guestN && guestN > 0 ? 'done' : v.now > ans.t + EXEC_MS ? 'void' : 'accepted') : (v.now > o.exp ? 'expired' : 'open');
  return v;
}
function mine() {   // 내 팀이 관여한 합의 기록들(내가 낸 것 + 받은 것)
  const pid = Party.pid, out = [];
  if (!pid) return out;
  if (outDoc && Party.mergeInfo) { const v = view(Party.mergeInfo.to, pid, outDoc); if (v) out.push(v); }
  for (const from of Object.keys(inbox)) { const v = view(pid, from, inbox[from]); if (v) out.push(v); }
  return out;
}
const live = (v) => v.state === 'open' || v.state === 'accepted';

// ---------- 확인 창에 보여 줄 내 팀의 잃는 것·가져가는 것 ----------
const refundOf = () => { const r = {}; for (const d of S.placed) for (const k in DEV[d.id].cost) r[k] = (r[k] || 0) + DEV[d.id].cost[k]; return r; };
const itemText = (o) => Object.entries(o).filter(([, v]) => v > 0).map(([k, v]) => `${World.ITEM[k] ? World.ITEM[k][1] : k} ${Math.floor(v)}`).join(', ') || '-';
const sumItems = (a, b) => { const r = Object.assign({}, a); for (const k in b) r[k] = (r[k] || 0) + b[k]; return r; };
async function openTradeBlock(pid) {   // 열려 있거나 수락 뒤 회수 안 한 교역이 있으면 나간 뒤 회수 권한이 없어진다
  try { const list = await Net.tradesLoad(50); return list.some(t => t.fromPid === pid && (t.status === 'open' || t.status === 'taken')); } catch { return false; }
}

// ---------- 행동: 제안·취소·수락·거절 ----------
async function offer(toPid) {
  const p = pubs[toPid];
  if (!window.Net || !Net.user || !Net.mergeOffer) return say('온라인 접속과 웹 주소(http)가 필요합니다.');
  if (!Party.inParty()) return say('팀이 있어야 제안할 수 있어요. 혼자라면 초대 코드로 들어가세요(팀 버튼).');
  if (!p || toPid === Party.pid) return;
  if (mine().some(v => live(v) && v.from === Party.pid)) return say('이미 보낸 제안이 있어요. 먼저 취소하세요.');
  const n = myN(), nTo = p.members || 1;
  if (n + nTo > TEAM_MAX) return say(`합치면 ${n + nTo}명이라 ${TEAM_MAX}명 상한을 넘어요.`);
  if (await openTradeBlock(Party.pid)) return say('열려 있거나 아직 회수하지 않은 교역이 있어요. 교역소에서 먼저 정리하세요.');
  if (!(await Party.ensureActive())) return say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.');
  const host = hostOf({ pid: Party.pid, n }, { pid: toPid, n: nTo }), t = Date.now();
  try {
    await Net.mergeOffer(toPid, Party.pid, { fromName: Party.meta.name, toName: p.name, color: Party.meta.color, n, q: S.qDone, host: host.pid, t, exp: t + OFFER_MS });
    say(`${p.name} 팀에 합치기를 제안했어요. 호스트는 ${host.pid === Party.pid ? '우리 팀' : p.name + ' 팀'}입니다.`);
  } catch { say('제안을 보내지 못했어요.'); }
  HubUI().signs();
}
async function cancel() {
  const v = mine().find(v => v.from === Party.pid), to = v ? v.to : (Party.mergeInfo ? Party.mergeInfo.to : null);   // 기록을 아직 못 받았어도 팀 표시(parties/{from}/merge)로 상대를 안다
  if (!to) return;
  try { await Net.mergeCancel(to, Party.pid); } catch { /* 이미 지워짐 */ }
  HubUI().signs();
}
function acceptWindow(from) {
  const v = mine().find(v => v.from === from && v.to === Party.pid && v.state === 'open'); if (!v) return say('이 제안은 더는 유효하지 않아요.');
  const n = myN(), hostIsMe = v.host === Party.pid, re = hostOf({ pid: from, n: v.offer.n }, { pid: Party.pid, n }).pid;
  if (n + v.offer.n > TEAM_MAX) return say(`합치면 ${n + v.offer.n}명이라 ${TEAM_MAX}명 상한을 넘어요.`);
  if (re !== v.host) return say('그 사이 인원이 바뀌어 호스트가 달라져요. 상대 팀이 다시 제안해야 합니다.');
  UI.openModal('합치기 수락 확인', `<div class="box"><h4>${esc(v.offer.fromName)} 팀 (${v.offer.n}명, 목표 ${v.offer.q}개) + 우리 팀 (${n}명, 목표 ${S.qDone}개)</h4>
      <div>호스트(월드가 남는 팀): <b>${hostIsMe ? '우리 팀' : esc(v.offer.fromName) + ' 팀'}</b> — 인원이 더 많은 팀, 같으면 먼저 만든 팀</div>
      <div>합친 인원: ${n + v.offer.n}명 (상한 ${TEAM_MAX}명)</div></div>
    <div class="box"><h4>${hostIsMe ? '우리 팀이 받는 것(잃는 것 없음)' : '우리 팀이 잃는 것'}</h4>
      ${hostIsMe ? `<div>${esc(v.offer.fromName)} 팀원 ${v.offer.n}명이 들어오고, 그 팀의 창고·장치 환불 재료·기여 기록·점수 보정이 우리 팀에 합쳐집니다. 우리 월드와 장치는 그대로입니다.</div>`
        : `<div>우리 월드(판 덩어리 ${Object.keys(S.world).length}개)는 포기하고 상대 월드를 씁니다. 장치 ${S.placed.length}개는 철거되어 재료로 환불(${esc(itemText(refundOf()))})되어 합쳐진 팀 창고로 갑니다. 목표 진행도(우리 ${S.qDone}개)는 상대 팀 것(${v.offer.q}개)으로 바뀝니다. 팀원은 각자 확인 창에서 한 번 더 확인합니다.</div>`}</div>
    <div class="warnbox">합치기는 <b>되돌릴 수 없습니다.</b> 두 월드는 이어 붙이지 않고 호스트 월드 하나만 남습니다. 이미 올린 보고서·교역은 그대로 둡니다.</div>
    <div class="row" style="margin-top:8px"><button class="primary" onclick="TeamUI.mergeAcceptGo('${esc(from)}')">수락하기</button><button onclick="HubUI.signs()">닫기</button></div>`);
}
async function accept(from) {
  const v = mine().find(v => v.from === from && v.to === Party.pid && v.state === 'open'); if (!v) return say('이 제안은 더는 유효하지 않아요.');
  if (!(await Party.ensureActive())) return say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.');
  if (await openTradeBlock(Party.pid) && v.guest === Party.pid) return say('열려 있거나 아직 회수하지 않은 교역이 있어요. 교역소에서 먼저 정리하세요.');
  const t = Date.now();
  try {
    await Net.mergeAnswer(Party.pid, from, { res: 'accept', n: myN(), q: S.qDone, o: v.offer.t, t });
    if (v.host === Party.pid) await Net.mergeGrant(Party.pid, from, { code: Party.meta.code, o: v.offer.t, t });
    say('합치기를 수락했어요. 합류하는 팀원들이 확인하면 시작됩니다.');
  } catch { say('수락을 올리지 못했어요.'); }
  HubUI().signs();
}
async function reject(from) {
  const v = mine().find(v => v.from === from && v.to === Party.pid && v.state === 'open'); if (!v) return;
  try { await Net.mergeAnswer(Party.pid, from, { res: 'reject', n: myN(), q: S.qDone, o: v.offer.t, t: Date.now() }); say('제안을 거절했어요.'); } catch { say('거절을 올리지 못했어요.'); }
  HubUI().signs();
}

// ---------- 게스트 팀원 확인 창 ----------
function readyWindow() {
  const v = mine().find(v => v.state === 'accepted' && v.guest === Party.pid); if (!v) return say('확인할 합치기가 없어요.');
  if (!atHub()) return say('본부에서 확인할 수 있어요. 전송 패드로 본부에 가세요.');
  const w = S.team.warehouse || {}, ref = refundOf(), hostName = v.host === v.from ? v.offer.fromName : v.offer.toName, rp = S.team.rp || 0;
  UI.openModal('합치기 합류 확인', `<div class="box"><h4>${esc(hostName)} 팀 (호스트)에 합류합니다 — 합친 인원 ${v.guestN + v.hostN}명</h4>
      <div class="mut">우리 팀 ${v.guestN}명 <b>전원</b>이 확인해야 시작됩니다. 지금 확인: ${v.ready.length}/${v.guestN}명</div></div>
    <div class="box"><h4>잃는 것 (되돌릴 수 없음)</h4>
      <div>우리 월드: 판 덩어리 ${Object.keys(S.world).length}개 (${Math.round(World.worldSize() / 100) / 10} KB)를 포기하고 ${esc(hostName)} 팀 월드를 씁니다. 두 월드는 이어 붙이지 않습니다.</div>
      <div>장치 ${S.placed.length}개: 철거되어 재료로 환불(${esc(itemText(ref))}) — 개인이 아니라 팀 소유라 환불은 팀 창고로 합쳐집니다.</div>
      <div>목표 진행도: 우리 팀 ${S.qDone}개 → ${esc(hostName)} 팀 ${v.hostQ}개로 바뀝니다.</div></div>
    <div class="box"><h4>가져가는 것</h4>
      <div>가방(인벤토리·캡슐·한제 팩)과 개인 기록은 각자 그대로 가져갑니다.</div>
      <div>팀 창고(${esc(itemText(w))}) + 장치 환불 재료는 합쳐진 팀 창고로 한 명(짐꾼)이 옮깁니다. 기여 기록, 연구 포인트(${rp}점, 20단계 전에는 0), 리더보드 점수 보정도 함께 갑니다.</div></div>
    <div class="warnbox">보고서·교역·공동 프로젝트 기록은 그대로 남습니다. 합치기가 끝나기 전에는 우리 팀을 떠나지 마세요(인원이 달라지면 무효).</div>
    <div class="row" style="margin-top:8px"><button class="primary" onclick="TeamUI.mergeReadyGo()">합류하기</button><button onclick="HubUI.signs()">나중에</button></div>`);
}
async function readyGo() {
  const v = mine().find(v => v.state === 'accepted' && v.guest === Party.pid); if (!v) return;
  if (myN() !== v.guestN) return say(`팀 인원이 합의한 ${v.guestN}명과 달라요. 합치기를 다시 제안해야 합니다.`);
  if (await openTradeBlock(Party.pid)) return say('열려 있거나 아직 회수하지 않은 교역이 있어요. 교역소에서 먼저 정리하세요.');
  try { await Net.mergeReady(v.to, v.from, v.offer.t); say('합류를 확인했어요. 팀원 전원이 확인하면 시작됩니다.'); } catch { say('확인을 올리지 못했어요.'); }
  HubUI().signs();
}

// ---------- 실행(게스트 팀원 각자) + 장부 복구 ----------
// S.mergeJob = { from, to, host, guest, code, carrier, carry, phase: 'join' | 'switch' | 'deposit' | 'leave' | 'done', o }
let running = false;
const job = () => S.mergeJob;
const persist = () => Store.save(true);
const stopHere = (ph) => window.__mergeStop === ph;   // 시험용: 끊김(탭 닫힘)을 흉내 내려고 장부가 그 단계에 이르면 멈춘다(실제 게임에서는 쓰지 않는다)
function makeCarry(v) {   // 짐꾼이 호스트로 옮길 팀 몫(창고 + 장치 환불 + 기여 + 점수 보정 + 연구 포인트)
  const t = S.team;
  return JSON.parse(JSON.stringify({ guestName: v.host === v.from ? v.offer.toName : v.offer.fromName, color: Party.meta ? Party.meta.color : '#888888', wh: sumItems(t.warehouse || {}, refundOf()), contrib: t.contrib || {}, envGoals: t.envGoals || {}, coreUnits: t.coreUnits || 0, predictScore: t.predictScore || 0, predicted: t.predicted || {}, bonusWater: Math.floor((S.f.dW || 0) + ((t.bonus && t.bonus.water) || 0)), rp: t.rp || 0 }));
}
async function exec(v) {
  if (running) return; running = true;
  try {
    const J = job();
    if (!J) {   // ① 장부를 먼저 쓴다(되돌릴 수 있는 쪽): 짐꾼이면 지금의 게스트 상태에서 carry를 만든다
      const carrier = v.ready[0] === me();
      S.mergeJob = { from: v.from, to: v.to, host: v.host, guest: v.guest, code: v.grant.code, carrier, carry: carrier ? makeCarry(v) : null, phase: 'join', o: v.offer.t, guestN: v.guestN };
      persist();
    }
    await step();
  } finally { running = false; }
}
async function step() {   // 장부의 단계를 이어서 한다. 각 단계는 몇 번 해도 같은 결과(멱등)다
  let J = job();
  if (!J || J.phase === 'done') return;
  if (J.phase === 'join' && !stopHere('join')) {   // ② 호스트 쪽 기록 = 커밋 지점
    if (!atHub()) return;     // 월드가 바뀌는 단계는 본부에서만(플레이어가 땅속에 끼지 않도록)
    try { await Party.mergeJoin(J.code); await Net.mergeMoved(J.to, J.from, J.o); } catch { say('호스트 팀에 들어가지 못했어요. 잠시 뒤 다시 시도합니다.'); return; }
    J.phase = 'switch'; persist();
  }
  if (J.phase === 'switch' && !stopHere('switch')) {   // ④ 로컬 전환: 게스트 월드를 버리고 호스트 상태·월드를 받는다
    if (Party.pid !== J.host) Party.switchTo(J.host);
    J.phase = J.carrier ? 'deposit' : 'leave'; persist();
  }
  if (J.phase === 'deposit' && !stopHere('deposit')) {   // ⑤ 짐꾼만: 호스트 상태에 한 번만 더한다(더하는 쓰기와 merged 표시가 같은 쓰기)
    if (!Party.ready) return;
    if (!(await Party.ensureActive())) return;
    const t = S.team, c = J.carry; t.merged = t.merged || {};
    if (!t.merged[J.from + ':' + J.o]) {
      t.warehouse = t.warehouse || {}; for (const k in c.wh) t.warehouse[k] = (t.warehouse[k] || 0) + c.wh[k];
      t.contrib = t.contrib || {}; for (const u in c.contrib) { const a = t.contrib[u]; if (!a) t.contrib[u] = c.contrib[u]; else for (const k in c.contrib[u]) if (typeof c.contrib[u][k] === 'number') a[k] = (a[k] || 0) + c.contrib[u][k]; }
      t.envGoals = Object.assign({}, t.envGoals, c.envGoals); t.predicted = Object.assign({}, t.predicted, c.predicted);
      t.coreUnits = (t.coreUnits || 0) + c.coreUnits; t.predictScore = (t.predictScore || 0) + c.predictScore;
      t.bonus = t.bonus || {}; t.bonus.water = (t.bonus.water || 0) + c.bonusWater;
      t.rp = (t.rp || 0) + c.rp;
      t.merged[J.from + ':' + J.o] = Date.now();
      Party.note('deposit', `합치기: ${c.guestName} 팀의 창고·기록을 가져왔습니다`);
    }
    // 서버에 반영될 때까지 기다린다(반영 전에 게스트 팀을 떠나면 두 번째 시도가 불가능해진다)
    const until = Date.now() + 8000; while (Party.dirty() && Date.now() < until) await new Promise(r => setTimeout(r, 300));
    if (!(S.team.merged && S.team.merged[J.from + ':' + J.o]) || Party.dirty()) return;
    J.phase = 'leave'; persist();
  }
  if (J.phase === 'leave' && !stopHere('leave')) {   // ⑥ 정리: 짐꾼은 게스트 간판을 닫고, 모두 게스트 팀에서 나간다
    try {
      if (J.carrier) { await Net.pubSet(J.guest, { name: J.carry.guestName, color: J.carry.color, motto: '합쳐짐', members: 0, qDone: 0, planet: 'plaza' }).catch(() => {}); if (J.guest === J.from) { const d = view(J.to, J.from, outDoc); if (d && d.state === 'done') await Net.mergeClear(J.from).catch(() => {}); } }
      await Net.partyLeave(J.guest);
    } catch { return; }
    delete S.mergeJob; persist(); say('합치기가 끝났어요. 이제 호스트 팀의 월드와 장치를 같이 씁니다.');
  }
}

// 1초마다: 감시 연결, 새 제안 알림, 호스트 쪽 허가(grant), 게스트 쪽 실행·복구
let lastNote = '';
export function tick() {
  if (!window.Net || !Net.user || !Net.mergeWatch || Store.paused) return;
  rewatch();
  const J = job();
  if (J && J.phase !== 'done' && !running) { running = true; step().catch(() => {}).finally(() => { running = false; }); return; }   // 끊긴 합류는 장부로 이어서 끝낸다
  for (const v of mine()) {
    const key = v.offer.t + ':' + v.state + ':' + v.ready.length + ':' + v.moved;
    if (v.state === 'open' && v.to === Party.pid && lastNote !== key) { lastNote = key; say(`${v.offer.fromName} 팀이 합치기를 제안했어요. 본부 팀 간판에서 확인하세요.`); }
    if (v.state === 'rejected' && v.from === Party.pid && lastNote !== key) { lastNote = key; say(`${v.offer.toName} 팀이 합치기를 거절했어요.`); }
    if (v.state === 'accepted') {
      if (v.host === Party.pid && !v.grant && Party.holder && v.host === v.from && v.answer && v.answer.res === 'accept' && Party.meta) { Net.mergeGrant(v.to, v.from, { code: Party.meta.code, o: v.offer.t, t: Date.now() }).catch(() => {}); }   // 호스트가 제안한 쪽이면 수락을 본 뒤에 코드를 내준다
      if (v.guest === Party.pid && lastNote !== key) { lastNote = key; if (!v.ready.includes(me())) say('합치기가 수락됐어요. 본부 팀 간판에서 합류를 확인하세요.'); }
      if (v.guest === Party.pid && v.grant && v.ready.includes(me()) && v.ready.length >= v.guestN && atHub() && !job()) exec(v).catch(() => {});
    }
    if (v.state === 'done' && v.host === Party.pid && v.host === v.from && Party.holder && Party.meta && Party.mergeInfo) Net.mergeClear(v.from).catch(() => {});   // 호스트가 제안한 쪽이면 끝난 제안 표시를 지운다
  }
}

// ---------- 간판 창 맨 위 칸과 버튼 ----------
const HubUI = () => window.HubUI;
export function notePub(p) { pubs[p.pid] = p; }
export function signButton(p) {
  if (!Party.inParty() || p.pid === Party.pid) return '';
  return `<button onclick="TeamUI.mergeOffer('${esc(p.pid)}')">합치기 제안</button>`;
}
export function panelHtml() {
  if (!Party.inParty()) return '';
  const rows = [], now = Date.now();
  for (const v of mine()) {
    const left = Math.max(0, Math.ceil((v.offer.exp - now) / 60000)), other = v.from === Party.pid ? v.offer.toName : v.offer.fromName;
    if (v.state === 'open' && v.to === Party.pid) rows.push(`<div class="row"><b>${esc(v.offer.fromName)}</b> 팀(${v.offer.n}명, 목표 ${v.offer.q}개)이 합치기를 제안 — 호스트 ${v.host === Party.pid ? '우리 팀' : esc(v.offer.fromName)} · 남은 ${left}분 <button class="primary" onclick="TeamUI.mergeAccept('${esc(v.from)}')">수락</button><button onclick="TeamUI.mergeReject('${esc(v.from)}')">거절</button></div>`);
    else if (v.state === 'open') rows.push(`<div class="row"><b>${esc(other)}</b> 팀에 합치기 제안 중 — 호스트 ${v.host === Party.pid ? '우리 팀' : esc(other)} · 남은 ${left}분 <button onclick="TeamUI.mergeCancel()">취소</button></div>`);
    else if (v.state === 'rejected' && v.from === Party.pid) rows.push(`<div class="row"><b>${esc(other)}</b> 팀이 거절했어요. <button onclick="TeamUI.mergeCancel()">확인</button></div>`);
    else if (v.state === 'accepted') {
      const guestMe = v.guest === Party.pid, J = job();
      rows.push(`<div class="row"><b>합치기 진행</b>: 호스트 ${esc(v.host === v.from ? v.offer.fromName : v.offer.toName)} · 게스트 ${esc(v.host === v.from ? v.offer.toName : v.offer.fromName)} · 확인 ${v.ready.length}/${v.guestN} · 이동 ${v.moved}/${v.guestN}${J && J.phase !== 'done' ? ` · 내 단계 ${esc(J.phase)}` : ''}${guestMe && !v.ready.includes(me()) ? ' <button class="primary" onclick="TeamUI.mergeConfirm()">합류 확인 창 열기</button>' : ''}${guestMe && v.ready.includes(me()) && !J ? ' <span class="mut">다른 팀원의 확인을 기다리는 중</span>' : ''}</div>`);
    }
  }
  if (!rows.length) return '';
  return `<div class="box"><h4>팀 합치기</h4>${rows.join('')}<small class="mut">인원이 더 많은 팀의 월드가 합친 팀의 월드가 되고, 합류하는 팀의 장치는 철거 환불·판 땅은 포기, 되돌릴 수 없습니다(약속에 기댄 표시, MULTIPLAYER.md).</small></div>`;
}
export function install(TeamUI) {
  Object.assign(TeamUI, {
    mergeOffer: (pid) => offer(pid), mergeCancel: () => cancel(), mergeAccept: (from) => acceptWindow(from), mergeAcceptGo: (from) => accept(from),
    mergeReject: (from) => reject(from), mergeConfirm: () => readyWindow(), mergeReadyGo: () => readyGo(),
  });
}
export const debug = { view, mine, job };
