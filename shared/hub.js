// 팀 간 교류(11단계, DESIGN.md §4-19): 허브 정거장의 팀 간판, 교역소(에스크로), 공동 프로젝트, 연구 보고서 게시판, 리더보드, 예측 정확도.
// 모든 서버 데이터는 팀(pid) 단위이고, 서버가 게임 계산을 검증하지 못하므로 약속에 기댄 표시다(MULTIPLAYER.md). 전투는 없다.
// 점수는 게임 계산이 낸 값에서만 만든다(S.f.dW, 목표 달성, 프로젝트 기여, Chem.tb 예측 오차).
import { Party } from './party.js';
const S = Store.S;
const C = Chem;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ITEMS = World.ITEM;
const TRADE_KEYS = ['stick', 'sand', 'sea', 'ice', 'bottle', 'syringe', 'sugar', 'salt', 'water', 'noodle', 'ramen', 'dirt', 'stone', 'pickaxe', 'shaker', 'thermo'];   // 규칙(database.rules.json)의 아이템 목록과 같다
// 가정(임의값): 공동 프로젝트 요구량과 점수 단위, 게시 주기, 판별 한 번 상한(규칙과 같은 값)
export const PROJECT = { need: { water: 3000, salt: 300, ice: 20 }, unit: { water: 100, salt: 10, ice: 1 } };
export const BOARDS = { env: ['환경 정복', '서로 다른 행성에서 푼 목표 수', 3], core: ['대기 처리 코어', '공동 프로젝트 기여 단위', 60], water: ['증류수 공급량', '팀이 증류한 증류수(g)', 2000], predict: ['예측 정확도', '돌리기 전에 계산한 끓는점의 정확도 점수', 30] };
const PUB_MS = 30000;
let projectState = null, lastPub = 0, lastQ = null, projectUnsub = null, seenDone = false;
const PLANET_NAME = { start: '불시착 행성', plaza: '허브 정거장', alpine: '저기압 고원 행성', polar: '얼음 위성' };
const env = () => !!(window.Net && Net.user && Net.pubSet);
const team = () => { if (!S.team) S.team = {}; for (const k of ['envGoals', 'boardLast', 'predicted']) if (!S.team[k]) S.team[k] = {}; return S.team; };
const wh = () => { if (!S.team) S.team = {}; if (!S.team.warehouse) S.team.warehouse = {}; return S.team.warehouse; };
const say = (t) => Party.sayHub(t);
const needTeam = () => { if (!Party.inParty()) { say('팀에 들어가야 쓸 수 있어요. 오른쪽 위 팀 버튼에서 팀을 만들거나 들어가세요.'); return false; } return true; };
const getLease = async () => { if (!(await Party.ensureActive())) { say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.'); return false; } return true; };
const modal = (title, html, tick) => UI.openModal(title, html, tick);
const itemName = (k) => (ITEMS[k] ? ITEMS[k][1] : k);
const listText = (o) => Object.entries(o || {}).map(([k, v]) => `${itemName(k)} ${v}`).join(', ') || '-';
const whOf = (k) => Math.floor(wh()[k] || 0);
const addWh = (k, n) => { const w = wh(); w[k] = (w[k] || 0) + n; if (w[k] <= 0) delete w[k]; };

// ---------- 주기: 탐사정 요약·리더보드 점수 올리기(시계 담당만) ----------
// 화면마다 다른 것: 탐사정 요약(옆면은 장치가 탐사정 위에 있지 않으므로 빈 요약)과 팀 간판 행의 추가 동작(옆면: 방문)
export const cfg = { shipSummary: null, signAction: null, reportNote: '' };   // reportNote: 보고서 화면에 한 줄 더 보여 줄 안내(옆면: 같은 시드라 재현이 공정하다)
function shipSummary() { if (cfg.shipSummary) return cfg.shipSummary(); return { cells: S.raft.cells, devs: S.placed.filter(d => !d.plot).map(d => ({ id: d.id, u: d.x, z: d.y, run: !!d.s.run, broken: !!d.s.broken })) }; }
function scoreOf(board) {
  const t = team();
  if (board === 'env') return Object.keys(t.envGoals).length;
  if (board === 'core') return Math.floor(t.coreUnits || 0);
  if (board === 'water') return Math.floor(S.f.dW || 0);
  if (board === 'predict') return Math.floor(t.predictScore || 0);
  return 0;
}
export function tick() {
  if (!env() || !Party.inParty() || !Party.holder) return;
  const now = Date.now(), t = team();
  // 목표 달성 순간 탐사정이 있던 행성을 기록한다(환경 정복 판의 점수 출처)
  if (lastQ === null) lastQ = S.qDone;
  if (S.qDone > lastQ) { for (let q = lastQ + 1; q <= S.qDone; q++) t.envGoals[q + '@' + Sim.dockOf(S).island] = 1; lastQ = S.qDone; }
  if (now - lastPub < PUB_MS) return;
  lastPub = now;
  const m = Party.meta || {}, members = Object.keys(Party.members).length || 1;
  Net.pubSet(Party.pid, { name: m.name, color: m.color, members, qDone: S.qDone, planet: Sim.dockOf(S).island, ship: shipSummary() }).catch(() => {});
  for (const b of Object.keys(BOARDS)) {   // 값은 줄지 않고 한 번에 오르는 폭에 상한(규칙과 같다)
    const target = scoreOf(b), last = t.boardLast[b] || 0, next = Math.min(target, last + BOARDS[b][2]);
    if (next > last) { t.boardLast[b] = next; Net.boardSet(b, Party.pid, { name: m.name, color: m.color, members, score: next }).catch(() => { t.boardLast[b] = last; }); }
  }
}
export function startWatch() {
  if (projectUnsub || !env() || !Net.projectWatch) return;
  projectUnsub = Net.projectWatch((p) => { projectState = p; if (p && p.done && !seenDone) { seenDone = true; say('모든 팀의 힘으로 허브 대기 처리 코어를 정화했습니다! 새 행성의 신호가 잡혔어요.'); } });
}

// ---------- 허브에 도킹한 다른 팀의 탐사정(읽기 전용) ----------
let pubs = [];
export async function loadPubs() { if (!env()) return pubs; try { pubs = (await Net.pubLoad(8)).filter(p => p.pid !== Party.pid && p.ship && p.planet === 'plaza'); } catch { /* 오프라인 */ } return pubs; }
export const hubShips = () => pubs.slice(0, 3).map(p => ({ nick: p.name, color: p.color, cells: (p.ship && p.ship.cells) || 4, devs: Object.values((p.ship && p.ship.devs) || {}).map(d => ({ id: d.id, u: d.u, z: d.z, run: d.run, broken: d.broken })), team: true }));

// ---------- 창들 ----------
const HubUI = window.HubUI = {
  open(kind) { ({ signs: HubUI.signs, trade: HubUI.trade, reports: HubUI.reports, boards: HubUI.boards, project: HubUI.project })[kind](); },

  // ① 팀 간판: 허브에 있는 팀 목록(읽기 전용)과 우리 팀의 한 줄 소개
  async signs() {
    modal('팀 간판', '<div class="mut">불러오는 중...</div>');
    let list = []; try { list = env() ? await Net.pubLoad(12) : []; } catch { /* 오프라인 */ }
    const rows = list.map(p => `<tr><td><span style="color:${esc(p.color || '#fff')}">■</span> <b>${esc(p.name || '')}</b>${p.pid === Party.pid ? ' (우리 팀)' : ''}</td><td>${esc(p.motto || '')}</td><td>${p.members || 1}명</td><td>목표 ${p.qDone || 0}/11</td><td>${esc(PLANET_NAME[p.planet] || p.planet || '')}</td><td>${(p.ship && p.ship.devs ? Object.keys(p.ship.devs).length : 0)}개 · ${(p.ship && p.ship.cells) || 0}칸</td>${cfg.signAction ? `<td>${cfg.signAction(p)}</td>` : ''}</tr>`).join('');
    const mine = Party.inParty() ? `<div class="row" style="margin-top:8px"><input id="hub-motto" maxlength="30" placeholder="우리 팀 한 줄 소개 (30자)" value="${esc((list.find(p => p.pid === Party.pid) || {}).motto || '')}"><button class="primary" onclick="HubUI.setMotto()">간판에 걸기</button></div>` : '<div class="mut">팀에 들어가면 한 줄 소개를 걸 수 있어요.</div>';
    modal('팀 간판', `<div class="box"><table><tr><th>팀</th><th>한 줄 소개</th><th>인원</th><th>진행</th><th>있는 곳</th><th>탐사정</th>${cfg.signAction ? '<th></th>' : ''}</tr>${rows || '<tr><td colspan="7" class="mut">아직 올라온 팀이 없습니다.</td></tr>'}</table></div>${mine}<small class="mut">허브에 도킹한 다른 팀의 탐사정은 허브 앞 우주 공간에서 구경할 수 있어요(읽기 전용).</small>`);
  },
  async setMotto() { const v = (document.getElementById('hub-motto').value || '').slice(0, 30); try { await Net.pubSet(Party.pid, { motto: v, name: (Party.meta || {}).name, color: (Party.meta || {}).color }); say('간판에 걸었습니다.'); HubUI.signs(); } catch (e) { say('간판에 걸지 못했습니다.'); } },

  // ② 교역소: 올리는 팀이 물품을 먼저 맡기고(에스크로), 수락한 팀이 낸 물품을 올린 팀이 찾아간다
  async trade() {
    modal('교역소', '<div class="mut">불러오는 중...</div>');
    let list = []; try { list = env() ? await Net.tradesLoad(30) : []; } catch { /* 오프라인 */ }
    const pid = Party.pid;
    await claimAll(list, pid);
    const opts = TRADE_KEYS.map(k => `<option value="${k}">${esc(itemName(k))}</option>`).join('');
    const rows = list.filter(t => t.status === 'open' || (t.fromPid === pid && t.status === 'taken')).map(t => {
      const mine = t.fromPid === pid;
      return `<tr><td>${esc(t.fromName)}${mine ? ' (우리)' : ''}</td><td>${esc(listText(t.give))}</td><td>${esc(listText(t.want))}</td><td>${t.status === 'taken' ? '수락됨' : mine ? `<button onclick="HubUI.tradeCancel('${t.tid}')">취소</button>` : `<button class="primary" onclick="HubUI.tradeTake('${t.tid}')">수락</button>`}</td></tr>`;
    }).join('');
    modal('교역소', `<div class="box"><h4>열린 교역</h4><table><tr><th>올린 팀</th><th>줄 것</th><th>원하는 것</th><th></th></tr>${rows || '<tr><td colspan="4" class="mut">열린 교역이 없습니다.</td></tr>'}</table></div>
      <div class="box"><h4>새 교역 올리기</h4><div class="row"><label>줄 것 <select id="tr-gi">${opts}</select> <input id="tr-gn" type="number" min="1" max="99" value="10" style="width:56px"></label>
        <label>원하는 것 <select id="tr-wi">${opts}</select> <input id="tr-wn" type="number" min="1" max="99" value="10" style="width:56px"></label><button class="primary" onclick="HubUI.tradePost()">올리기</button></div>
        <small class="mut">올릴 때 줄 물품이 팀 창고에서 교역소로 옮겨져 맡겨지고(에스크로), 수락한 팀이 낸 물품은 우리 팀이 이 창에서 찾아갑니다. 서버가 수량을 검증하지 못하는 약속 기반 교역입니다.</small></div>`);
  },
  async tradePost() {
    if (!needTeam() || !(await getLease())) return;
    const gi = document.getElementById('tr-gi').value, wi = document.getElementById('tr-wi').value, gn = Math.max(1, Math.min(99, +document.getElementById('tr-gn').value | 0)), wn = Math.max(1, Math.min(99, +document.getElementById('tr-wn').value | 0));
    if (gi === wi) return say('같은 물품끼리는 교환할 수 없어요.');
    if (whOf(gi) < gn) return say(`팀 창고에 ${itemName(gi)}이(가) ${gn}개 없습니다. 팀 창에서 먼저 창고에 넣으세요.`);
    addWh(gi, -gn);   // 먼저 맡긴다
    try { await Net.tradePost({ fromPid: Party.pid, fromName: (Party.meta || {}).name, give: { [gi]: gn }, want: { [wi]: wn } }); Party.note('trade', `교역 올림: ${itemName(gi)} ${gn} ↔ ${itemName(wi)} ${wn}`); say('교역을 올렸습니다.'); }
    catch { addWh(gi, gn); say('교역을 올리지 못했습니다. 맡긴 물품은 돌려받았습니다.'); }
    HubUI.trade();
  },
  async tradeCancel(tid) {
    if (!needTeam() || !(await getLease())) return;
    const t = (await Net.tradesLoad(30)).find(x => x.tid === tid); if (!t) return;
    if (await Net.tradeCancel(tid)) { for (const [k, v] of Object.entries(t.give)) addWh(k, v); Party.note('trade', '교역 취소(맡긴 물품 회수)'); say('교역을 취소하고 물품을 돌려받았습니다.'); }
    HubUI.trade();
  },
  async tradeTake(tid) {
    if (!needTeam() || !(await getLease())) return;
    const t = (await Net.tradesLoad(30)).find(x => x.tid === tid); if (!t || t.status !== 'open') return say('이미 없어진 교역입니다.');
    for (const [k, v] of Object.entries(t.want)) if (whOf(k) < v) return say(`팀 창고에 ${itemName(k)}이(가) ${v}개 필요합니다.`);
    for (const [k, v] of Object.entries(t.want)) addWh(k, -v);   // 낼 물품을 먼저 뺀다
    let ok = false; try { ok = await Net.tradeTake(tid, Party.pid, (Party.meta || {}).name, t.want); } catch { /* 실패 */ }
    if (!ok) { for (const [k, v] of Object.entries(t.want)) addWh(k, v); return say('다른 팀이 먼저 수락했습니다. 낸 물품은 돌려받았습니다.'); }
    for (const [k, v] of Object.entries(t.give)) addWh(k, v);
    Party.note('trade', `교역 수락: ${listText(t.give)} 받음, ${listText(t.want)} 지급`); say('교역이 성사됐습니다. 받은 물품이 팀 창고에 들어왔어요.');
    HubUI.trade();
  },

  // ③ 공동 프로젝트: 허브 대기 처리 코어에 물품을 넣는다. 다 차면 모두에게 새 행성
  project() {
    const p = projectState || { have: {}, byTeam: {} }, done = !!p.done;
    const rows = Object.keys(PROJECT.need).map(k => { const have = Math.floor((p.have || {})[k] || 0), need = PROJECT.need[k], u = PROJECT.unit[k]; return `<tr><td>${esc(itemName(k))}</td><td>${have} / ${need}</td><td><div class="bar"><i style="width:${Math.min(100, have / need * 100)}%"></i></div></td><td><button ${done ? 'disabled' : ''} onclick="HubUI.projectAdd('${k}')">넣기 ${u}</button> <button ${done ? 'disabled' : ''} onclick="HubUI.projectAdd('${k}',5)">${u * 5}</button> <small class="mut">창고 ${whOf(k)}</small></td></tr>`; }).join('');
    const teams = Object.entries(p.byTeam || {}).sort((a, b) => (b[1].n || 0) - (a[1].n || 0)).map(([id, t]) => `<tr><td><span style="color:${esc(t.color || '#fff')}">■</span> ${esc(t.name || '')}${id === Party.pid ? ' (우리 팀)' : ''}</td><td>${Math.floor(t.n || 0)} 단위</td></tr>`).join('');
    modal('공동 프로젝트: 대기 처리 코어', `<div class="box"><div>${done ? '<b>정화 완료!</b> 모든 팀에게 새 행성의 신호가 열렸습니다(행성 자체는 다음 단계에서 열립니다).' : '허브의 대기 처리 코어를 정화하려면 모든 팀이 팀 창고의 물품을 모아야 합니다. 다 차면 모두에게 새 행성이 열려요.'}</div>
      <table style="margin-top:6px"><tr><th>물품</th><th>모은 양</th><th></th><th>팀 창고에서 넣기</th></tr>${rows}</table>
      <small class="mut">점수 단위: 증류수 100 g · 소금 10 g · 얼음 1개 = 1단위</small></div>
      <div class="box"><h4>팀별 기여량</h4><table>${teams || '<tr><td class="mut">아직 기여한 팀이 없습니다.</td></tr>'}</table></div>`);
  },
  async projectAdd(item, times) {
    if (!needTeam() || !(await getLease())) return;
    if (projectState && projectState.done) return;
    const n = PROJECT.unit[item] * (times || 1);
    if (whOf(item) < n) return say(`팀 창고에 ${itemName(item)}이(가) ${n} 필요합니다. 팀 창에서 창고에 넣으세요.`);
    addWh(item, -n);
    let r; try { r = await Net.projectAdd(Party.pid, (Party.meta || {}).name, (Party.meta || {}).color, item, n, PROJECT.need[item]); } catch { addWh(item, n); return say('프로젝트에 넣지 못했습니다. 물품은 돌려받았습니다.'); }
    const added = Math.max(0, r.after - r.before); if (added < n) addWh(item, n - added);   // 요구량을 넘은 만큼은 돌려받는다
    const units = added / PROJECT.unit[item], t = team(); t.coreUnits = (t.coreUnits || 0) + units;
    try { await Net.projectTeam(Party.pid, { name: (Party.meta || {}).name, color: (Party.meta || {}).color, n: Math.floor(t.coreUnits) }); } catch { /* 무시 */ }
    Party.note('project', `프로젝트 기여: ${itemName(item)} ${added}`);
    const p = projectState || { have: {} }; const all = Object.keys(PROJECT.need).every(k => ((k === item ? r.after : (p.have || {})[k]) || 0) >= PROJECT.need[k]);
    if (all) { try { await Net.projectDone(); } catch { /* 규칙이 막으면 다른 팀이 이미 표시 */ } }
    say(`대기 처리 코어에 ${itemName(item)} ${added}을(를) 넣었습니다.`); HubUI.project();
  },

  // ④ 연구 보고서: 내 기록 한 줄을 자동 첨부해 게시하고, 다른 팀이 재현 여부를 표시
  async reports() {
    modal('연구 보고서 게시판', '<div class="mut">불러오는 중...</div>');
    let list = []; try { list = env() ? await Net.reportsLoad(15) : []; } catch { /* 오프라인 */ }
    const pid = Party.pid;
    const rows = list.map(r => {
      const votes = Object.values(r.votes || {}), ok = votes.filter(v => v === 'ok').length, diff = votes.filter(v => v === 'diff').length, mine = r.pid === pid, voted = pid && (r.votes || {})[pid];
      const e = r.env || {};
      return `<div class="box"><b>${esc(r.title)}</b> <span style="color:${esc(r.color || '#fff')}">■ ${esc(r.teamName)}</span> <small class="mut">${esc(r.nick)}</small>
        <div class="mut">${esc(PLANET_NAME[e.planet] || e.planet || '')} · ${e.P} atm · 기온 보정 ${e.dT} ℃</div>
        <div>${esc((r.line || {}).type)}: ${esc((r.line || {}).text)} <small class="mut">(${esc((r.line || {}).clock || '')})</small></div>${r.note ? `<div class="mut">${esc(r.note)}</div>` : ''}
        <div>재현됨 ${ok} · 값이 다름 ${diff} ${mine ? '<small class="mut">(우리 팀 보고서)</small>' : voted ? `<small class="mut">(우리 팀 표시: ${voted === 'ok' ? '재현됨' : '값이 다름'})</small>` : `<button onclick="HubUI.vote('${r.rid}','ok')">재현됨</button> <button onclick="HubUI.vote('${r.rid}','diff')">값이 다름</button>`}</div></div>`;
    }).join('');
    const logs = S.log.slice(-15).map((l, i, a) => `<option value="${S.log.length - a.length + i}">${esc(l.t)} [${esc(l.type)}] ${esc(String(l.text).slice(0, 40))}</option>`).reverse().join('');
    modal('연구 보고서 게시판', `${rows || '<div class="mut">아직 보고서가 없습니다.</div>'}
      ${cfg.reportNote ? `<div class="warnbox">${esc(cfg.reportNote)}</div>` : ''}
      <div class="box"><h4>새 보고서 올리기</h4><div class="row"><select id="rp-log" style="max-width:280px">${logs}</select></div>
        <div class="row" style="margin-top:6px"><input id="rp-title" maxlength="30" placeholder="제목 (30자)"><input id="rp-note" maxlength="100" placeholder="메모: 조건·예상과 달랐던 점 (100자)"><button class="primary" onclick="HubUI.reportPost()">올리기</button></div>
        <small class="mut">고른 기록 한 줄과 그때의 환경(행성·기압·기온 보정)이 자동으로 붙습니다. 다른 팀이 같은 조건으로 따라 해 보고 결과를 표시합니다.</small></div>`);
  },
  async reportPost() {
    if (!needTeam()) return;
    const idx = +document.getElementById('rp-log').value, l = S.log[idx], title = (document.getElementById('rp-title').value || '').trim();
    if (!l) return say('첨부할 기록을 고르세요.'); if (!title) return say('제목을 적어 주세요.');
    const island = Sim.dockOf(S).island, e = Sim.ENV[island];
    try { await Net.reportPost({ pid: Party.pid, teamName: (Party.meta || {}).name, color: (Party.meta || {}).color, title, note: (document.getElementById('rp-note').value || '').slice(0, 100), env: { planet: island, P: e.P, dT: e.dT }, line: { type: String(l.type).slice(0, 20), text: String(l.text).slice(0, 200), day: l.day, clock: String(l.t).slice(0, 12) } }); Party.note('report', `보고서: ${title}`); say('보고서를 올렸습니다.'); }
    catch { say('보고서를 올리지 못했습니다.'); }
    HubUI.reports();
  },
  async vote(rid, v) { if (!needTeam()) return; try { await Net.reportVote(rid, Party.pid, v); say('표시했습니다.'); } catch { say('표시하지 못했습니다(우리 팀 보고서이거나 이미 표시했어요).'); } HubUI.reports(); },

  // ⑤ 리더보드: 판마다 총합과 1인당. 예측 정확도 입력도 여기서
  async boards(which) {
    which = which || 'env';
    modal('리더보드', '<div class="mut">불러오는 중...</div>');
    let list = []; try { list = env() ? await Net.boardLoad(which, 10) : []; } catch { /* 오프라인 */ }
    const tabs = Object.keys(BOARDS).map(b => `<button class="${b === which ? 'on' : ''}" onclick="HubUI.boards('${b}')">${BOARDS[b][0]}</button>`).join('');
    const rows = list.map((e, i) => `<tr><td>${i + 1}</td><td><span style="color:${esc(e.color || '#fff')}">■</span> ${esc(e.name)}${e.pid === Party.pid ? ' (우리 팀)' : ''}</td><td>${Math.floor(e.score)}</td><td>${(e.score / (e.members || 1)).toFixed(1)}</td></tr>`).join('');
    const stills = S.placed.filter(d => d.id === 'still' && d.s.w > 0 && !d.s.run && !team().predicted[d.uid + ':' + Math.round(d.s.w)]);
    const pr = which === 'predict' ? `<div class="box"><h4>예측 등록</h4>${stills.length ? stills.map(d => `<div class="row"><span>증류기 ${d.uid} (물 ${Math.round(d.s.w)} g)</span><input id="pd-${d.uid}" type="number" step="0.1" placeholder="끓는점 예측 ℃" style="width:130px"><button onclick="HubUI.predict('${d.uid}')">등록</button></div>`).join('') : '<div class="mut">바닷물을 넣고 아직 돌리지 않은 증류기가 있어야 합니다. 연구 노트 계산기로 끓는점을 구해 보세요.</div>'}<small class="mut">점수 = max(0, 10 − 5 × |오차 ℃|). 게임 계산(라울의 법칙 + 증기압력 곡선, 그 장치의 환경)과 비교합니다.</small></div>` : '';
    modal('리더보드', `<div class="tabs">${tabs}</div><div class="box"><div class="mut">${esc(BOARDS[which][1])}</div><table><tr><th>순위</th><th>팀</th><th>총합</th><th>1인당</th></tr>${rows || '<tr><td colspan="4" class="mut">아직 점수가 없습니다.</td></tr>'}</table>
      <small class="mut">우리 팀 지금 점수: ${scoreOf(which)}. 점수는 게임 사건에서만 오르고 서버 규칙이 줄지 않게, 한 번에 오르는 폭에 상한을 둡니다.</small></div>${pr}`);
  },
  async predict(uid) {
    if (!needTeam() || !(await getLease())) return;
    const d = S.placed.find(x => x.uid === uid), v = parseFloat(document.getElementById('pd-' + uid).value);
    if (!d || !(d.s.w > 0) || d.s.run) return say('이 증류기는 예측할 수 없는 상태입니다.'); if (!isFinite(v)) return say('예측한 끓는점(℃)을 숫자로 적으세요.');
    Sim.setDev(d); const P = Sim.pAtm(S); Sim.setDev(null);
    const actual = C.tb(P, C.xw(d.s.w, 2 * d.s.ns)), err = Math.abs(v - actual), pts = Math.round(Math.max(0, 10 - 5 * err) * 10) / 10, t = team();
    t.predicted[uid + ':' + Math.round(d.s.w)] = 1; t.predictScore = (t.predictScore || 0) + pts;
    Sim.logEv(S, '예측', `끓는점 예측 ${v.toFixed(1)} ℃ / 게임 계산 ${actual.toFixed(2)} ℃ (외기 ${P} atm, 물 ${Math.round(d.s.w)} g, NaCl ${(d.s.ns).toFixed(2)} mol) → 오차 ${err.toFixed(2)} ℃, ${pts}점`);
    Party.note('report', `예측 정확도 ${pts}점`); say(`게임 계산은 ${actual.toFixed(2)} ℃ (오차 ${err.toFixed(2)} ℃) → ${pts}점`);
    HubUI.boards('predict');
  },
};

async function claimAll(list, pid) {   // 우리 팀 교역 중 수락된 것은 낸 물품을 찾아온다
  for (const t of list) if (t.fromPid === pid && t.status === 'taken') {
    if (!(await Party.ensureActive())) return;
    if (await Net.tradeClaim(t.tid)) { for (const [k, v] of Object.entries(t.paid || {})) addWh(k, v); Party.note('trade', `교역 완료: ${listText(t.paid)} 받음`); say('교역이 완료됐습니다. 상대 팀이 낸 물품을 찾아왔어요.'); t.status = 'done'; }
  }
}
HubUI.forcePub = () => { lastPub = 0; tick(); };   // 시험용: 게시 주기를 건너뛰고 지금 한 번 게시
export { HubUI };
