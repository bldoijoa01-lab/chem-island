// 옆면(index.html) 팀·본부 교류 연결 (17단계 17-b, DESIGN.md §4-25).
// 공용 모듈(shared/party.js·hub.js·hud.js)을 그대로 불러 쓰고, 옆면에만 있는 것만 여기 있다: 월드 덩어리 동기화 연결, 쓰기 임대 관문,
// 가입 확인 창, 방문 미리보기. ES 모듈이라 file://에서는 브라우저가 막으므로 index.html이 http(s)일 때만 이 파일을 불러온다(그때는 팀 기능만 꺼진다).
import { Party } from './shared/party.js';
import { cfg as hubCfg, tick as hubTick, startWatch } from './shared/hub.js';
import { TeamUI, wrapActions } from './shared/hud.js';
import * as Merge from './merge.js';
const S = Store.S, { DEV } = Sim, esc = UI.esc;
const atHub = () => Sim.dockOf(S).island === 'plaza';

Party.init({
  say: UI.say, isModalOpen: () => UI.isModalOpen(), worldSync: true,
  getWorld: () => S.world, applyWorld: (rw) => World.applyWorldDelta(S, rw), resetWorld: () => World.resetWorldState(S),
  onApplied() { if (window.SideGame) SideGame.applyWorld(); UI.refresh(); UI.publishBase(false); },   // 팀 상태(장치·월드)를 받으면 지도를 다시 맞추고 내 방문 요약을 갱신한다
});
wrapActions();   // 장치 조작은 팀 기록에 남긴다

// 쓰기 관문: 팀이면 땅 파기·블록·건설·장치는 active 임대가 있어야 한다. 없으면 얻는 동안 false를 돌려주고, 연속 동작은 매 프레임 touch()로 임대를 유지한다
let gating = false;
window.Team = {
  inParty: () => Party.inParty(), pid: () => Party.pid, meta: () => Party.meta, members: () => Party.members, holder: () => Party.holder,
  canAdvance: () => Party.canAdvance(), speed: () => Party.speed(), needsLease: (k) => Party.needsLease(k),
  guard: (fn) => Party.guard(fn),
  gate() {
    if (!Party.inParty()) return true;
    Party.touch();
    if (Party.writable()) return true;
    if (!gating) { gating = true; Party.ensureActive().then(ok => { gating = false; if (!ok) UI.say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.'); }); }
    return false;
  },
  stats: () => Party.stats,
  online() { Party.start(); startWatch(); UI.publishBase(true); },
};

// 보고서 화면: 같은 시드라 재현이 공정하다는 한 줄. 간판: 방문 버튼. 탐사정 요약은 옆면에는 의미가 없으므로 최소값(서버 규칙 cells >= 1)
hubCfg.reportNote = '모든 팀이 같은 시드로 만든 월드를 쓰므로, 같은 장치를 같은 조건에 놓으면 결과가 같아야 합니다. 다르게 나오면 "값이 다름"으로 표시하세요.';
hubCfg.shipSummary = () => ({ cells: 1 });
const signs = {};
hubCfg.signAction = (p) => { signs[p.pid] = p; Merge.notePub(p); return `<button onclick="TeamUI.visit('${esc(p.pid)}')">방문</button> ${Merge.signButton(p)}`; };
hubCfg.signExtra = () => Merge.panelHtml();
Merge.install(TeamUI);   // 팀 대 팀 합치기(17-c): 제안·수락·확인 창·합류 실행

// ---------- 가입 확인 창: 잃는 것과 가져가는 것을 먼저 보여 준다 ----------
const refundOf = () => { const r = {}; for (const d of S.placed) for (const k in DEV[d.id].cost) r[k] = (r[k] || 0) + DEV[d.id].cost[k]; return r; };
const itemText = (o) => Object.entries(o).map(([k, v]) => `${World.ITEM[k] ? World.ITEM[k][1] : k} ${v}`).join(', ') || '-';
TeamUI.join = function () {
  const code = String((document.getElementById('tm-code') || {}).value || '').trim().toUpperCase();
  const err = (m) => TeamUI.err(new Error(m));
  if (code.length !== 6) return err('초대 코드는 6자입니다.');
  if (!atHub()) return err('가입은 본부에서만 할 수 있어요(내 월드가 팀 월드로 바뀌므로). 전송 패드로 본부에 먼저 가세요.');
  const chunks = Object.keys(S.world).length, kb = Math.round(World.worldSize() / 100) / 10, bag = Object.values(S.inv).reduce((a, v) => a + Math.floor(v), 0) + S.caps.length + S.packs.length;
  UI.openModal('팀 가입 확인', `<div class="box"><h4>잃는 것</h4>
      <div>내 월드: 판 덩어리 ${chunks}개 (${kb} KB) — 포기하고 팀 월드를 이어받습니다</div>
      <div>내 장치 ${S.placed.length}개 — 철거되어 재료로 환불: ${esc(itemText(refundOf()))}</div>
      <div>내 목표 진행도(목표 ${S.qDone}개) — 팀의 진행도로 바뀝니다</div></div>
    <div class="box"><h4>가져가는 것</h4>
      <div>가방(아이템 ${bag}개, 캡슐·한제 팩 포함) · 개인 기록 · 환불받은 재료 · 연구 포인트(생기면 함께)</div></div>
    <div class="mut">고원·얼음 위성의 지형은 그대로이고 장치만 팀 것이 됩니다. 한 번 들어가면 팀을 나가서 새 월드로 시작할 수는 있지만 지금의 내 월드로 돌아올 수는 없어요.</div>
    <div class="row" style="margin-top:8px"><button class="primary" onclick="TeamUI.joinGo('${esc(code)}')">가입하기</button><button onclick="TeamUI.open()">취소</button></div>`);
};
TeamUI.joinGo = async function (code) {
  try { await Party.join(code); UI.say('팀에 들어갔습니다. 팀의 월드와 장치를 이어받습니다.'); TeamUI.open(); UI.publishBase(true); }
  catch (e) { UI.say(e.message || String(e)); TeamUI.open(); }
};
{ const leave0 = TeamUI.leave;
  TeamUI.leave = function () { if (!atHub()) return UI.say('팀 탈퇴는 본부에서만 할 수 있어요. 전송 패드로 본부에 먼저 가세요.'); return leave0(); }; }

// ---------- 방문: 읽기 전용 단면 미리보기(걸어 들어가기 없음) ----------
const TILE_COLOR = { '.': '#59606b', o: '#161a26', '~': '#2c7cc0', '#': '#9fb4c8' };
function mapHtml(m) {
  if (!m || !m.rows) return '<div class="mut">아직 올라온 그림이 없습니다.</div>';
  const rows = Object.values(m.rows).map(r => { let out = '', cur = '', run = ''; for (const ch of String(r)) { if (ch !== cur) { if (run) out += `<span style="color:${TILE_COLOR[cur] || '#333'}">${run}</span>`; cur = ch; run = ''; } run += '█'; } if (run) out += `<span style="color:${TILE_COLOR[cur] || '#333'}">${run}</span>`; return out; }).join('<br>');
  return `<div style="font:7px/7px monospace;letter-spacing:0;background:#07080d;padding:4px;overflow:auto;max-height:260px">${rows}</div><small class="mut">칸 하나 = ${m.s}x${m.s}칸. 회색 단단한 땅 · 어두운 곳 빈 공간 · 파랑 물 · 밝은 회색 코어 선체 (왼쪽 위 칸 ${m.x0}, ${m.y0})</small>`;
}
TeamUI.visit = async function (id) {
  UI.openModal('방문 (읽기 전용)', '<div class="mut">불러오는 중...</div>');
  let b = null; try { b = await Net.baseGet(id); } catch { /* 오프라인 */ }
  if (!b) return UI.openModal('방문 (읽기 전용)', '<div class="mut">이 팀은 아직 월드 요약을 올리지 않았습니다.</div>');
  const motto = (signs[id] || {}).motto, devs = Object.values(b.devices || {});
  const rows = devs.map(d => `<tr><td>${esc(DEV[d.id] ? DEV[d.id].name : d.id)}</td><td>(${d.x}, ${d.y})</td><td>${d.broken ? '파손' : d.run ? '가동 중' : '멈춤'}</td></tr>`).join('');
  UI.openModal('방문 (읽기 전용)', `<div class="box"><h4><span style="color:${esc(b.color)}">■</span> ${esc(b.name)}</h4>
      <div>팀원: ${esc(Object.values(b.members || {}).join(', '))} · 연구 단계 ${b.tech}</div>
      ${motto ? `<div>한 줄 소개: ${esc(motto)}</div>` : ''}<div class="mut">${esc(b.summary)}</div></div>
    <div class="box"><h4>월드 단면 미리보기</h4>${mapHtml(b.map)}</div>
    <div class="box"><h4>장치 ${devs.length}개</h4><table><tr><th>장치</th><th>코어 기준 칸</th><th>상태</th></tr>${rows || '<tr><td colspan="3" class="mut">장치가 없습니다.</td></tr>'}</table></div>
    <small class="mut">서버가 요약이 실제 월드와 맞는지는 검증하지 못합니다(약속에 기댄 표시). 걸어 들어가거나 고칠 수 없는 읽기 전용입니다.</small>`);
};

setInterval(() => { if (Store.paused) return; Party.tick(); hubTick(); Merge.tick(); }, 1000);
window.Merge = Merge;   // 시험·점검용
if (window.Net && Net.user) window.Team.online();
