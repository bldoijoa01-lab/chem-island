// 팀(파티, 9단계): 탐사정·장치·목표 진행도·공용 창고를 팀이 공동 소유하고, 인벤토리·자원 노드는 개인이다. (DESIGN.md §4-17)
// 팀 필드는 한 번에 한 명(lease를 가진 사람)만 서버에 쓰고, 서버 규칙이 state.ver가 +1일 때만 받는다. 나머지 팀원은 받아서 덮어쓴다.
// 화학 계산은 한 줄도 바꾸지 않는다(Sim이 한 S를 도는 것은 그대로). 이 파일은 "누가 S의 팀 필드를 쓰는가"만 정한다.
const S = Store.S;
const TEAM_KEYS = ['placed', 'raft', 'f', 'qDone', 'mobs', 'mobId', 'dusk', 'day', 'min', 'links'];   // 팀 필드(나머지 inv·caps·packs·nodes·melt·boxDay·log·fp는 개인)
const LEASE_ACTIVE_MS = 6000, LEASE_PASSIVE_MS = 15000, PUBLISH_MS = 1000, BEAT_MS = 10000, ONLINE_MS = 30000;   // 가정(임의값)
export const TEAM_MAX = 4, LOG_SHOW = 20;
export const KINDS = { build: '건설', demolish: '철거', device: '장치 조작', deposit: '창고에 넣음', withdraw: '창고에서 꺼냄' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const me = () => (window.Net && Net.user ? Net.user.uid : null);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const P = { pid: null, meta: null, members: {}, lease: null, ver: 0, holder: false, active: false, log: [], unsub: [], lastAction: 0, lastPub: 0, lastHash: '', lastBeat: 0, publishing: false, prevQ: 0, onApplied: null, say: () => {}, isModalOpen: () => false };

function ensureTeam() {
  if (!S.team) S.team = {};
  if (!S.team.warehouse) S.team.warehouse = {};
  if (!S.team.contrib) S.team.contrib = {};
  return S.team;
}
const contribOf = (uid, nick) => { const c = ensureTeam().contrib; if (!c[uid]) c[uid] = { nick: nick || '', build: 0, demolish: 0, device: 0, deposit: 0, withdraw: 0, goals: [] }; if (nick) c[uid].nick = nick; if (!c[uid].goals) c[uid].goals = []; return c[uid]; };
const teamOf = () => { ensureTeam(); const o = {}; for (const k of TEAM_KEYS) o[k] = S[k]; o.team = S.team; return JSON.parse(JSON.stringify(o)); };

// 서버의 팀 상태를 내 S의 팀 필드에 덮어쓴다(Firebase는 빈 배열을 지우므로 Sim.merge로 기본 형태를 복구한다)
function applyRemote(state) {
  const m = Sim.merge(Object.assign({ fp: {} }, state));   // fp를 넣어 2D 뗏목 이전(migrateRaft)을 건너뛴다
  const oldDay = S.day;
  for (const k of TEAM_KEYS) S[k] = m[k];
  S.links = Array.isArray(state.links) ? state.links : Object.values(state.links || {});   // Firebase는 빈 배열을 지우고 배열을 객체로 돌려주기도 한다
  S.team = state.team || {}; ensureTeam(); for (const u in S.team.contrib) { const c = S.team.contrib[u]; if (!Array.isArray(c.goals)) c.goals = c.goals ? Object.values(c.goals) : []; }
  if (S.day !== oldDay) { S.nodes = {}; S.packs = S.packs.filter(p => p.day >= S.day); }   // 하루가 바뀌면 개인 자원 노드가 다시 자란다(Sim의 newDay와 같은 개인 부분)
  P.ver = state.ver; P.prevQ = S.qDone; P.lastHash = JSON.stringify(teamOf());
  if (P.onApplied) P.onApplied();
}

function onSnap(snap) {
  if (!snap) { stop(true); return; }   // 팀이 없어졌거나 내가 더는 팀원이 아니다
  P.meta = snap.meta; P.members = snap.members; P.lease = snap.lease;
  const L = snap.lease, now = Date.now(), id = me();
  P.holder = !!(L && L.uid === id && L.exp > now); P.active = P.holder && !!L.active;
  const st = snap.state;
  if (st && st.ver > P.ver && !(P.holder && st.by === id)) applyRemote(st);   // 내가 올린 것은 다시 받지 않는다
  else if (st && st.ver > P.ver) P.ver = st.ver;
}

export const Party = {
  init(opts) { Object.assign(P, opts || {}); },
  get pid() { return P.pid; },
  get meta() { return P.meta; },
  get members() { return P.members; },
  get log() { return P.log; },
  get holder() { return P.holder; },
  inParty() { return !!P.pid; },
  online() { const now = Date.now(); return Object.values(P.members).filter(m => m && now - m.t < ONLINE_MS).length || (P.pid ? 1 : 0); },
  canAdvance() { return !P.pid || P.holder; },                     // 시간은 시계 담당(lease를 가진 사람)만 흘린다
  speed() { return P.pid && Party.online() > 1 ? 1 : S.speed; },    // 접속한 팀원이 2명 이상이면 x1 고정
  needsLease(kind) { return !!P.pid && ['dev', 'wolf', 'water', 'altar', 'fragment', 'harbor'].includes(kind); },

  // 시작: 저장된 팀 소속(S.party)이 있으면 서버를 듣기 시작한다
  start() {
    if (P.pid || !S.party || !S.party.pid || !window.Net || !Net.user || !Net.partyWatch) return;
    watch(S.party.pid);
  },
  async create(name, color) {
    if (!window.Net || !Net.user) throw new Error('온라인 접속이 필요합니다(저장/계정에서 접속).');
    if (P.pid) throw new Error('이미 팀에 있습니다.');
    name = String(name || '').trim(); if (name.length < 2 || name.length > 10) throw new Error('팀 이름은 2~10자입니다.');
    ensureTeam(); contribOf(me(), Net.nick);
    const { pid, code } = await Net.partyCreate(name, color || '#4a9ad8');
    S.party = { pid };
    const r = await Net.partyPublish(pid, 0, teamOf());   // 만든 사람의 탐사정·장치가 팀의 처음 상태가 된다
    if (!r.ok) throw new Error('팀 상태를 만들지 못했습니다.');
    P.ver = r.ver; watch(pid); Store.save(true);
    return { pid, code };
  },
  // 가입: 내 개인 장치는 철거해 재료로 돌려받고(확인은 호출한 쪽이), 팀의 탐사정·장치·진행도를 이어받는다
  async join(code) {
    if (!window.Net || !Net.user) throw new Error('온라인 접속이 필요합니다(저장/계정에서 접속).');
    if (P.pid) throw new Error('이미 팀에 있습니다.');
    const pid = await Net.partyJoin(code);
    for (const d of S.placed.slice()) Sim.act.demolish(S, d);   // 재료 환불(Sim.act.demolish와 같은 규칙)
    S.mobs = [];
    S.party = { pid }; P.ver = 0; watch(pid); Store.save(true);
    return pid;
  },
  async leave() {
    if (!P.pid) return;
    const pid = P.pid; await Net.partyLeave(pid).catch(() => {});
    stop(false);
    const fresh = Sim.newState();   // 내 몫의 새 탐사정: 팀 필드를 처음 상태로(인벤토리·개인 기록은 가져간다)
    for (const k of TEAM_KEYS) S[k] = fresh[k];
    S.links = [];
    S.team = {}; ensureTeam(); delete S.party; if (P.onApplied) P.onApplied(); Store.save(true);
  },

  // 팀 필드를 바꾸는 행동 전에 부른다. 팀이 없으면 바로 통과. 못 얻으면 false(동료가 조작 중)
  async ensureActive() {
    if (!P.pid) return true;
    const now = Date.now();
    if (P.holder && P.active && P.lease && P.lease.exp > now + 1500) { P.lastAction = now; return true; }
    for (let i = 0; i < 3; i++) {
      if (await Net.partyLease(P.pid, true, LEASE_ACTIVE_MS)) {
        P.holder = true; P.active = true; P.lastAction = Date.now(); P.lease = { uid: me(), active: true, exp: Date.now() + LEASE_ACTIVE_MS };
        await sleep(150);   // 직전 임대자가 올린 마지막 상태를 받을 틈
        return true;
      }
      await sleep(700);
    }
    return false;
  },
  async guard(fn) { if (!(await Party.ensureActive())) { P.say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.'); return false; } fn(); return true; },

  // 행동 기록: 개인 기여 횟수와 팀 기록. 팀 상태에 들어가 모두가 같은 값을 본다
  note(kind, text) {
    if (!P.pid) return;
    const id = me(), c = contribOf(id, Net.nick); c[kind] = (c[kind] || 0) + 1;
    ensureTeam().last = { uid: id, nick: Net.nick, t: Date.now() };
    P.lastAction = Date.now(); P.lastPub = 0;
    if (Net.partyLog) Net.partyLog(P.pid, { kind: KINDS[kind] ? kind : 'device', text: String(text).slice(0, 120) }).catch(() => {});
  },
  async transfer(item, n) {   // n > 0: 창고에 넣기, n < 0: 꺼내기
    if (!(await Party.ensureActive())) return P.say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.');
    const w = ensureTeam().warehouse, have = S.inv[item] || 0, inW = w[item] || 0;
    if (n > 0) { n = Math.min(n, Math.floor(have)); if (n < 1) return; S.inv[item] = have - n; w[item] = inW + n; Party.note('deposit', `${item} ${n} 창고에 넣음`); }
    else { n = Math.min(-n, Math.floor(inW)); if (n < 1) return; w[item] = inW - n; if (w[item] <= 0) delete w[item]; S.inv[item] = have + n; Party.note('withdraw', `${item} ${n} 창고에서 꺼냄`); }
  },

  // 1초마다: 심박, 임대 유지, 목표 달성 기여 기록, 팀 상태 올리기(시계 담당만)
  tick() {
    if (!P.pid || !window.Net || !Net.user) return;
    const now = Date.now(), L = P.lease, valid = !!(L && L.exp > now);
    if (now - P.lastBeat > BEAT_MS) { P.lastBeat = now; Net.partyBeat(P.pid).catch(() => {}); }
    if (P.holder) {
      const renewIn = L ? L.exp - now : 0;
      if (P.active && P.isModalOpen() && renewIn < 4000) { Net.partyLease(P.pid, true, LEASE_ACTIVE_MS).then(ok => { if (ok) { P.lastAction = Date.now(); if (P.lease) P.lease.exp = Date.now() + LEASE_ACTIVE_MS; } }); }
      else if (P.active && now - P.lastAction > LEASE_ACTIVE_MS - 500) { P.active = false; Net.partyLease(P.pid, false, LEASE_PASSIVE_MS).then(ok => { if (ok && P.lease) { P.lease.active = false; P.lease.exp = Date.now() + LEASE_PASSIVE_MS; } }); }   // 행동이 없으면 시계 담당(passive)으로 내려간다
      else if (!P.active && renewIn < LEASE_PASSIVE_MS - 5000) { Net.partyLease(P.pid, false, LEASE_PASSIVE_MS).then(ok => { if (ok && P.lease) P.lease.exp = Date.now() + LEASE_PASSIVE_MS; }); }
    } else if (!valid) {
      Net.partyLease(P.pid, false, LEASE_PASSIVE_MS).then(ok => { if (ok) { P.holder = true; P.active = false; P.lease = { uid: me(), active: false, exp: Date.now() + LEASE_PASSIVE_MS }; } });
    }
    if (!P.holder || P.publishing || now - P.lastPub < PUBLISH_MS) return;
    // 목표 달성 기여: 달성 순간 마지막으로 행동한 사람에게 기록한다(60초 안, 아니면 시계 담당)
    if (S.qDone > P.prevQ) {
      const last = ensureTeam().last, who = last && now - last.t < 60000 ? last : { uid: me(), nick: Net.nick };
      const c = contribOf(who.uid, who.nick); for (let q = P.prevQ; q < S.qDone; q++) { if (!c.goals.includes(q + 1)) c.goals.push(q + 1); if (Net.partyLog && who.uid === me()) Net.partyLog(P.pid, { kind: 'goal', text: `목표 ${q + 1} 달성` }).catch(() => {}); }
      P.prevQ = S.qDone;
    }
    const st = teamOf(), h = JSON.stringify(st);
    if (h === P.lastHash) { P.lastPub = now; return; }
    P.publishing = true;
    Net.partyPublish(P.pid, P.ver, st).then(r => { if (r.ok) { P.ver = r.ver; P.lastHash = h; } else { P.holder = false; P.active = false; } })   // 엇갈렸으면 서버 상태를 받아 팔로어가 된다
      .catch(() => {}).finally(() => { P.publishing = false; P.lastPub = Date.now(); });
  },

  // ---------- 팀 창과 창고 창(공용 UI의 openModal에 HTML을 넣는다) ----------
  panelHtml() {
    const m = P.meta || {}, now = Date.now(), id = me();
    const rows = Object.entries(P.members).map(([uid, mem]) => {
      const c = ensureTeam().contrib[uid] || { build: 0, demolish: 0, device: 0, deposit: 0, withdraw: 0, goals: [] }, on = now - mem.t < ONLINE_MS, hold = P.lease && P.lease.uid === uid && P.lease.exp > now;
      return `<tr><td>${on ? '●' : '○'} ${esc(mem.nick)}${uid === id ? ' (나)' : ''}${hold ? ' <small class="mut">시계</small>' : ''}</td><td>${c.build || 0}</td><td>${c.demolish || 0}</td><td>${c.device || 0}</td><td>${c.deposit || 0} / ${c.withdraw || 0}</td><td>${(c.goals || []).sort((a, b) => a - b).join(', ') || '-'}</td></tr>`;
    }).join('');
    const logs = (P.log || []).slice().reverse().map(l => `<div class="mut">${new Date(l.t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} <b>${esc(l.nick)}</b> ${esc(l.text)}</div>`).join('') || '<div class="mut">아직 기록이 없습니다.</div>';
    return `<div class="box"><h4><span style="color:${esc(m.color || '#fff')}">■</span> ${esc(m.name || '')}</h4>
      <div>초대 코드: <b style="letter-spacing:2px">${esc(m.code || '')}</b> <small class="mut">(팀원 ${Object.keys(P.members).length}/${TEAM_MAX}명, 접속 ${Party.online()}명)</small></div>
      <div class="mut">탐사정·장치·목표 진행도·공용 창고는 팀이 같이 씁니다. 인벤토리와 자원 노드는 개인입니다.${Party.online() > 1 ? ' 접속한 팀원이 2명 이상이라 시간 속도는 x1로 고정됩니다.' : ''}</div></div>
      <div class="box"><h4>개인 기여</h4><table><tr><th>팀원</th><th>건설</th><th>철거</th><th>장치 조작</th><th>창고 넣기/꺼내기</th><th>기여한 목표</th></tr>${rows}</table>
        <small class="mut">목표 기여는 달성하는 순간 마지막으로 행동한 팀원에게 기록됩니다. 서버가 게임 계산을 검증하지 못하므로 약속에 기댄 표시입니다.</small></div>
      <div class="row"><button class="primary" onclick="TeamUI.warehouse()">공용 창고</button><button class="danger" onclick="TeamUI.leave()">팀 나가기</button></div>
      <div class="box"><h4>팀 기록</h4>${logs}</div>`;
  },
  noPartyHtml() {
    const on = !!(window.Net && Net.user);
    return `<div class="box"><h4>팀(파티)</h4><div class="mut">2~4명이 탐사정과 장치를 함께 쓰는 팀입니다. 혼자 팀을 만들어도 지금처럼 플레이할 수 있어요.${on ? '' : ' <b>온라인 접속이 필요합니다</b>(저장/계정에서 접속).'}</div></div>
      <div class="box"><h4>팀 만들기</h4><div class="row"><input id="tm-name" maxlength="10" placeholder="팀 이름 (2~10자)" autocomplete="off"><input id="tm-color" type="color" value="#4a9ad8" title="팀 색"><button class="primary" onclick="TeamUI.create()" ${on ? '' : 'disabled'}>만들기</button></div></div>
      <div class="box"><h4>초대 코드로 들어가기</h4><div class="row"><input id="tm-code" maxlength="6" placeholder="초대 코드 6자" autocomplete="off"><button onclick="TeamUI.join()" ${on ? '' : 'disabled'}>들어가기</button></div>
        <small class="mut">들어가면 내 장치는 철거되어 재료로 돌려받고, 팀의 탐사정과 진행도를 이어받습니다.</small></div><div id="tm-err" class="mut"></div>`;
  },
  warehouseHtml(items) {
    const w = ensureTeam().warehouse, keys = Object.keys(items).filter(k => (S.inv[k] || 0) >= 1 || (w[k] || 0) >= 1);
    const rows = keys.map(k => `<tr><td>${esc(items[k][1])}</td><td>${Math.floor(S.inv[k] || 0)}</td><td>${Math.floor(w[k] || 0)}</td><td><button onclick="TeamUI.xfer('${k}',1)">넣기 1</button> <button onclick="TeamUI.xfer('${k}',10)">10</button> <button onclick="TeamUI.xfer('${k}',-1)">꺼내기 1</button> <button onclick="TeamUI.xfer('${k}',-10)">10</button></td></tr>`).join('');
    return `<div class="box"><table><tr><th>아이템</th><th>내 가방</th><th>팀 창고</th><th></th></tr>${rows || '<tr><td colspan="4" class="mut">옮길 아이템이 없습니다.</td></tr>'}</table></div><small class="mut">창고에 넣고 꺼내려면 팀 쓰기 권한(임대)이 필요합니다. 동료가 조작 중이면 잠시 뒤에 다시 시도하세요.</small>`;
  },
};

function watch(pid) {
  P.pid = pid; P.lastAction = 0; P.lastPub = 0; P.prevQ = S.qDone; ensureTeam();
  P.unsub.push(Net.partyWatch(pid, onSnap));
  if (Net.partyWatchLog) P.unsub.push(Net.partyWatchLog(pid, (list) => { P.log = list; }));
}
function stop(lost) {
  for (const f of P.unsub) { try { f(); } catch { /* 무시 */ } }
  P.unsub = []; P.pid = null; P.meta = null; P.members = {}; P.lease = null; P.ver = 0; P.holder = false; P.active = false; P.log = []; P.lastHash = '';
  if (lost) { delete S.party; P.say('팀에서 나왔습니다.'); }
}
