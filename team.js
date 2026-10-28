// 옆면(index.html) 팀·본부 교류 연결 (17단계 17-b, DESIGN.md §4-25).
// 공용 모듈(shared/party.js·hub.js·hud.js)을 그대로 불러 쓰고, 옆면에만 있는 것만 여기 있다: 월드 덩어리 동기화 연결, 쓰기 임대 관문,
// 가입 확인 창, 방문 미리보기. ES 모듈이라 file://에서는 브라우저가 막으므로 index.html이 http(s)일 때만 이 파일을 불러온다(그때는 팀 기능만 꺼진다).
import { Party, TEAM_MAX } from './shared/party.js';
import { cfg as hubCfg, tick as hubTick, startWatch } from './shared/hub.js';
import { TeamUI, wrapActions } from './shared/hud.js';
import * as Merge from './merge.js';
const S = Store.S, { DEV } = Sim, esc = UI.esc;
const atHub = () => !Sim.hubOn() || Sim.dockOf(S).island === 'plaza';   // 본부 배제(§4-30): 본부가 꺼져 있으면 팀 가입·탈퇴는 어디서나 한다

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
  online() { Party.start(); if (Sim.hubOn()) startWatch(); UI.publishBase(true); },   // 팀 간 교류 감시는 본부가 켜져 있을 때만
};

// ---------- 친구 초대(랜서버식, 2026-10-28) ----------
// 방장이 게임 안 [친구 초대]를 누르면: 팀이 없으면 팀(방)을 만들고, 이미 팀이면 그대로, 6자리 코드를 보여 준다(복사 버튼, 팀 창으로 가는 버튼).
// 친구는 메인 화면 [코드로 들어가기](ui.js joinWithCode)에서 닉네임·코드를 넣고 Invite.join으로 팀에 들어온다. 새 서버 경로·규칙 변경은 없다(팀 만들기·코드 가입을 그대로 쓴다).
// 한계(MULTIPLAYER.md §12): 월드는 서버(/parties/{pid}/state)에 남아 방장이 접속 중이 아니어도 코드로 들어갈 수 있고, 서버 규칙은 이를 막지 못한다.
let creating = false, lastCode = '';
const codeNow = () => (Party.meta && Party.meta.code) || lastCode;
const infoNow = () => { const m = Party.meta || {}; return `${m.name || '팀'} · 팀원 ${Object.keys(Party.members).length || 1}/${TEAM_MAX}명 · 접속 ${Party.online()}명`; };
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { /* 권한 없음 → 아래 방법 */ }
  const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* 무시 */ } ta.remove(); return ok;
}
function showInvite() {
  UI.openModal('친구 초대', `<div class="box"><h4>친구 초대 코드</h4>
      <div id="iv-code" style="font-size:34px;letter-spacing:6px;font-weight:700">${esc(codeNow() || '...')}</div>
      <div class="row" style="margin-top:6px"><button class="primary" onclick="Invite.copy()">코드 복사</button><button onclick="TeamUI.open()">팀 창 열기</button></div>
      <div id="iv-msg" class="mut"></div><div id="iv-info" class="mut">${esc(infoNow())}</div></div>
    <div class="box"><h4>친구가 들어오는 방법</h4><div>친구는 게임 처음 화면의 <b>코드로 들어가기</b>에 닉네임과 이 코드 6자를 넣습니다. 팀은 최대 ${TEAM_MAX}명입니다(서버가 인원을 세지 못해 클라이언트의 약속입니다).</div></div>
    <div class="warnbox">${esc(UI.INVITE_NOTE)}</div>
    <small class="mut">내 월드와 장치는 팀의 월드가 되어 팀원 모두가 같이 씁니다.</small>`,
  () => { if (document.getElementById('mtitle').textContent !== '친구 초대') return; const c = document.getElementById('iv-code'), i = document.getElementById('iv-info'); if (c && codeNow() && c.textContent !== codeNow()) c.textContent = codeNow(); if (i) i.textContent = infoNow(); });
}
window.Invite = {
  code: codeNow,
  async open() {
    if (!(window.Net && Net.user)) return UI.openModal('친구 초대', `<div class="box">친구 초대는 온라인 접속이 필요해요. 접속하면 팀(방)을 만들고 6자리 코드를 보여 줘요.</div><div class="row"><button class="primary" onclick="G.showAuth()">온라인으로 접속</button></div><div class="warnbox">${esc(UI.INVITE_NOTE)}</div>`);
    if (!Party.inParty()) {
      if (creating) return;
      creating = true; UI.openModal('친구 초대', '<div class="mut">팀(방)을 만드는 중...</div>');
      try { const r = await Party.create(((Net.nick || '내') + '의 방').slice(0, 10), '#4a9ad8'); lastCode = r.code; UI.say('팀을 만들었습니다. 초대 코드를 친구에게 알려 주세요.'); UI.publishBase(true); }
      catch (e) { creating = false; return UI.openModal('친구 초대', `<div class="warnbox">${esc(e.message || String(e))}</div>`); }
      creating = false;
    }
    showInvite();
  },
  async copy() { const ok = await copyText(codeNow()), m = document.getElementById('iv-msg'); if (m) m.textContent = ok ? '코드를 복사했어요. 친구에게 보내 주세요.' : '복사하지 못했어요. 코드를 직접 적어 주세요.'; },
  async join(code) { await Party.join(code); UI.publishBase(true); },   // 메인 화면 [코드로 들어가기]에서 부른다(확인은 부른 쪽이 이미 받았다)
};

// 보고서 화면: 같은 시드라 재현이 공정하다는 한 줄. 간판: 방문 버튼. 탐사정 요약은 옆면에는 의미가 없으므로 최소값(서버 규칙 cells >= 1)
hubCfg.reportNote = '모든 팀이 같은 시드로 만든 월드를 쓰므로, 같은 장치를 같은 조건에 놓으면 결과가 같아야 합니다. 다르게 나오면 "값이 다름"으로 표시하세요.';
hubCfg.shipSummary = () => ({ cells: 1 });
const signs = {};
hubCfg.signAction = (p) => { signs[p.pid] = p; Merge.notePub(p); return `<button onclick="TeamUI.visit('${esc(p.pid)}')">방문</button> ${Merge.signButton(p)}`; };
hubCfg.signExtra = () => Merge.panelHtml();
if (Sim.hubOn()) Merge.install(TeamUI);   // 팀 대 팀 합치기(17-c): 제안·수락·확인 창·합류 실행 — 본부 배제(§4-30)로 꺼져 있을 때는 설치하지 않는다

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

setInterval(() => { if (Store.paused) return; Party.tick(); if (Sim.hubOn()) { hubTick(); Merge.tick(); } }, 1000);
window.Merge = Merge;   // 시험·점검용
if (window.Net && Net.user) window.Team.online();
