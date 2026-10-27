// 대기 처리 코어 레이드. 기지에서 만든 물질로 3단계 화학 퍼즐을 푼다(혼자 하기). 온라인에서는 3단계 분압을 두 사람이 나눠 맞추는 협동도 있다.
// P1 증기 방어막: 증기압력 내림(라울)   P2 끓어 넘침: 압력·끓는점·열 평형   P3 가스 과압: 돌턴 분압·이상 기체
window.Raid = (() => {
  const C = Chem;
  const P1_WATER = 500, P1_GOAL = 0.95;                  // 대기 처리 코어 솥의 물(g), 방어막이 깨지는 증기압(atm, 100 ℃)
  const P2_WIN = [2.0, 2.8], P2_DMG = 4, SURGE = 10;     // 안전 압력대(atm), 초당 피해, 불길 1회의 온도 상승(℃)
  // SURGE=18일 때는 능숙한 조작으로도 폭발(시뮬레이션 4/4), 10일 때 4/4 클리어·무조작은 폭발 → 10으로 조정
  const TANK_V = 10, TANK_T = 300, GOAL_P = 2.0, GOAL_O2 = 0.40;
  let A, R, timer = null;
  const api = { active: false };

  function fresh() {
    const n = (P) => P * TANK_V / (C.R * TANK_T);
    return {
      phase: 1, salt: 0, sugar: 0,
      // P2
      hp: 100, T: 60, M: 500, airN: 1.0, dial: 0, valve: 0, running: false, surgeIn: 8, warn: 0, inWin: 0,
      // P3
      n: { N2: n(1.40), O2: n(0.20), He: 0, Ar: 0 },
    };
  }
  const $ = id => document.getElementById(id);
  const S = () => A.S();

  function soloOpen(a) {
    A = a;
    if (S().f.boss) { A.say('대기 처리 코어는 이미 정화되었습니다. 다시 도전해 볼 수도 있어요.'); }
    R = fresh(); api.active = true;
    render();
  }
  // 온라인이면 혼자/협동을 고른다
  api.open = (a) => {
    A = a;
    const net = window.Net;
    if (!(net && net.user && net.raidJoin)) return soloOpen(a);
    A.openModal('대기 처리 코어 제단', `<div class="box"><p>혼자서 1~3단계를 모두 풀거나, 온라인 친구와 <b>3단계(분압)</b>를 분업해 풀 수 있어요.</p>
      <div class="row"><button class="primary" onclick="Raid.solo()">혼자 도전 (1~3단계)</button></div>
      <div class="row" style="margin-top:6px"><button onclick="Raid.coop('O2')">협동: 산소(O₂) 담당</button><button onclick="Raid.coop('N2')">협동: 질소·헬륨(N₂·He) 담당</button></div></div>
      <div class="warnbox">협동은 같은 탱크를 두 사람이 함께 보며, 각자 맡은 기체의 캡슐만 넣을 수 있습니다. 돌턴의 분압 법칙: 전체 압력 = 분압의 합.</div>`);
  };
  api.solo = () => { A.closeModal(); soloOpen(A); };

  // ---------- 협동 (온라인): O₂ 담당 / N₂·He 담당이 같은 탱크(서버 /raid/golem)에 캡슐을 넣어 분압을 맞춘다 ----------
  let coop = null;
  const ROLE_KEYS = { O2: ['O2'], N2: ['N2', 'He'] };
  const ROLE_NAME = { O2: '산소(O₂) 담당', N2: '질소·헬륨(N₂·He) 담당' };
  const tankOf = (st) => (st && st.n) || fresh().n;
  const coopP = (st) => { const n = tankOf(st), o = {}; let tot = 0; for (const k in n) { o[k] = C.partial(n[k] || 0, TANK_V, TANK_T); tot += o[k]; } return { o, tot }; };
  function coopClose() { const net = window.Net; if (coop) { coop = null; if (net && net.raidLeave) net.raidLeave(); } api.active = false; }
  api.coop = async (role) => {
    A.closeModal(); coop = { role, st: {}, done: false }; api.active = true;
    const keys = ROLE_KEYS[role];
    A.openModal(`협동 — ${ROLE_NAME[role]}`, `<p>탱크(${TANK_V} L, ${TANK_T} K)를 <b>전체 ${GOAL_P} atm</b>, <b>산소 분압 ${GOAL_O2} atm</b>으로 맞추세요. 나는 <b>${ROLE_NAME[role]}</b>이라 ${keys.map(k => k === 'O2' ? 'O₂' : k === 'N2' ? 'N₂' : k).join('·')} 캡슐만 넣을 수 있어요. 다른 역할의 친구가 필요합니다.</p>
      <div class="grid2"><div class="box"><h4>공유 탱크</h4>
        <div class="kv"><span>N₂ 분압</span><b id="c-N2"></b></div><div class="kv"><span>O₂ 분압</span><b id="c-O2"></b></div>
        <div class="kv"><span>He 분압</span><b id="c-He"></b></div><div class="kv"><span>전체 압력</span><b id="c-P"></b></div>
        <div class="bar"><i id="c-bar"></i></div><div id="c-st" class="mut"></div></div>
      <div class="box"><h4>참가자</h4><div id="c-players" class="mut"></div>
        <h4 style="margin-top:8px">내 캡슐</h4><div id="c-btns"></div>
        <div class="row" style="margin-top:8px"><button onclick="Raid.coopVent()">배기 (10 %)</button><button class="primary" onclick="Raid.coopCheck()">안정화 확인</button></div>
        <div class="row" style="margin-top:6px"><button class="danger" onclick="Raid.coopReset()">탱크 처음으로</button></div></div></div>
      <div class="warnbox">반응하지 않는 기체의 전체 압력은 분압의 합입니다(P_i = n_i·R·T/V). O₂ 분압 0.40 atm에 맞추려면 O₂ 쪽이, 전체 2.0 atm에 맞추려면 N₂·He 쪽이 양을 조절해야 합니다. 전체가 ${C.PBURST} atm을 넘으면 터져 처음으로 돌아갑니다. (친구가 같은 시간에 접속해 있어야 합니다)</div>`, null, coopClose);
    try { await window.Net.raidJoin(role, (st) => { if (coop) { coop.st = st; coopUpdate(); } }, fresh().n); }
    catch { A.say('협동 방에 들어가지 못했습니다. 인터넷 연결을 확인하세요.'); A.closeModal(); }
  };
  function coopUpdate() {
    if (!coop || !$('c-P')) return;
    const st = coop.st, { o, tot } = coopP(st), pl = Object.values(st.players || {});
    for (const k of ['N2', 'O2', 'He']) A.set('c-' + k, A.fmt(o[k] || 0, 3) + ' atm');
    A.set('c-P', A.fmt(tot, 3) + ' atm'); A.setw('c-bar', tot / 3.2 * 100, tot > 2.8 ? 'bad' : '');
    const okP = Math.abs(tot - GOAL_P) <= 0.04, okO = Math.abs(o.O2 - GOAL_O2) <= 0.03;
    A.set('c-st', okP && okO ? '목표 범위입니다. 안정화 확인을 누르세요' : `전체 ${okP ? 'OK' : (tot < GOAL_P ? '낮음' : '높음')} · O₂ ${okO ? 'OK' : (o.O2 < GOAL_O2 ? '낮음' : '높음')}`);
    $('c-players').innerHTML = pl.map(p => `<div>${String(p.nick || '').replace(/[<>&]/g, '')} — ${ROLE_NAME[p.role] || ''}</div>`).join('') || '없음';
    const have = (k) => A.capCount(k);
    $('c-btns').innerHTML = ROLE_KEYS[coop.role].map(k => `<div class="row" style="margin-bottom:4px"><button ${have(k) ? '' : 'disabled'} onclick="Raid.coopAdd('${k}')">${k === 'O2' ? 'O₂' : k === 'N2' ? 'N₂' : k} 캡슐 넣기</button><span class="mut">보유 ${have(k)}</span></div>`).join('');
    if (!coop.done && st.doneRound != null && st.doneRound === (st.round || 0)) coopSuccess('친구가 안정화에 성공했습니다');
  }
  api.coopAdd = async (k) => {
    if (!coop || !ROLE_KEYS[coop.role].includes(k)) return A.say('내 역할의 기체가 아닙니다.');
    const caps = S().caps, i = caps.findIndex(c => c.k === k); if (i < 0) return;
    const c = caps.splice(i, 1)[0], { tot } = coopP(coop.st), add = C.partial(c.n, TANK_V, TANK_T);
    if (tot + add > C.PBURST) {
      A.logEv('대기 처리 코어 협동 폭발', `전체 ${A.fmt(tot + add, 2)} atm > ${C.PBURST} atm (${ROLE_NAME[coop.role]}가 ${k} 캡슐을 넣음)`);
      A.say('탱크가 폭발했습니다! 처음으로 돌아갑니다.');
      try { await window.Net.raidReset(fresh().n, (coop.st.round || 0) + 1); } catch { /* 무시 */ }
    } else { try { await window.Net.raidAdd(k, c.n); } catch { A.say('서버에 반영하지 못했습니다.'); } }
    A.refresh(); coopUpdate();
  };
  api.coopVent = async () => { try { await window.Net.raidVent(); } catch { /* 무시 */ } };
  api.coopReset = async () => { try { await window.Net.raidReset(fresh().n, (coop.st.round || 0) + 1); } catch { /* 무시 */ } };
  api.coopCheck = async () => {
    const st = coop.st, { o, tot } = coopP(st), roles = new Set(Object.values(st.players || {}).map(p => p.role));
    if (!(roles.has('O2') && roles.has('N2'))) return A.say('O₂ 담당과 N₂·He 담당, 두 사람이 모두 있어야 합니다.');
    const okP = Math.abs(tot - GOAL_P) <= 0.04, okO = Math.abs(o.O2 - GOAL_O2) <= 0.03;
    A.logEv('대기 처리 코어 협동 확인', `전체 ${A.fmt(tot, 3)} atm, O₂ 분압 ${A.fmt(o.O2, 3)} atm → ${okP && okO ? '성공' : '실패'}`);
    if (!okP || !okO) return A.say(`${okP ? '' : '전체 압력이 맞지 않습니다. '}${okO ? '' : '산소 분압이 맞지 않습니다.'}`);
    try { await window.Net.raidDone(st.round || 0); } catch { /* 무시 */ }
    coopSuccess('협동으로 안정화에 성공했습니다');
  };
  function coopSuccess(why) {
    if (!coop || coop.done) return; coop.done = true;
    S().f.boss = true; A.logEv('대기 처리 코어 협동 성공', why); A.say('대기 처리 코어가 정화되었습니다!'); A.refresh();
    A.openModal('대기 처리 코어 정화 완료 (협동)', `<p>${S().day}일차에 친구와 함께 대기 처리 코어를 정화했습니다.</p>
      <div class="box">돌턴의 분압 법칙: 전체 압력 = <b>분압의 합</b>. 두 사람이 O₂·N₂ 분압을 나눠 맞췄습니다.</div>`, null, coopClose);
  }
  function close() { clearInterval(timer); timer = null; api.active = false; }

  function render() {
    clearInterval(timer);
    const title = ['', '1단계 — 증기 방어막', '2단계 — 끓어 넘치는 솥', '3단계 — 가스 과압'][R.phase];
    const html = [null, p1(), p2(), p3()][R.phase];
    A.openModal(title, html, null, close);
    document.getElementById('mbody').insertAdjacentHTML('afterbegin', '<canvas id="golem" class="golem"></canvas>');
    A.Art.drawGolem($('golem'), R.phase, R.phase === 2 ? R.hp / 100 : 1);
    if (R.phase === 1) p1Update();
    if (R.phase === 2) p2Update();
    if (R.phase === 3) p3Update();
  }

  // ---------- P1 ----------
  function p1() {
    const s = S().inv;
    return `<p>대기 처리 코어의 솥(물 ${P1_WATER} g, 100 ℃)이 증기로 방어막을 만들고 있습니다. 증기압력이 <b>${P1_GOAL} atm</b> 이하로 내려가면 방어막이 깨집니다. 비휘발성 용질을 녹여 증기압력을 내리세요.</p>
    <div class="grid2"><div class="box">
      <label>소금 <b id="r-sv"></b> g (보유 ${Math.floor(s.salt)})<input type="range" id="r-salt" min="0" max="${Math.floor(s.salt)}" value="0" oninput="Raid.p1Update()"></label>
      <label>설탕 <b id="r-ugv"></b> g (보유 ${Math.floor(s.sugar)})<input type="range" id="r-sugar" min="0" max="${Math.floor(s.sugar)}" value="0" oninput="Raid.p1Update()"></label>
      <div class="row" style="margin-top:8px"><button class="primary" onclick="Raid.p1Add()">투입</button></div></div>
    <div class="box"><div class="kv"><span>이미 녹은 용질</span><b id="r-have"></b></div>
      <div class="kv"><span>용질 입자(mol)</span><b id="r-np"></b></div>
      <div class="kv"><span>물의 몰분율 x</span><b id="r-x"></b></div>
      <div class="kv"><span>용액 증기압(100 ℃)</span><b id="r-p"></b></div>
      <div class="bar"><i id="r-bar"></i></div><div id="r-st" class="mut"></div></div></div>
    <div class="warnbox">소금(NaCl)은 Na⁺·Cl⁻ 두 입자로 해리(i=2)하고 설탕은 분자 그대로(i=1)입니다. 같은 질량이라면 몰질량이 작고 해리하는 소금이 증기압을 훨씬 더 낮춥니다.</div>`;
  }
  function p1Calc(extraSalt = 0, extraSugar = 0) {
    const np = 2 * (R.salt + extraSalt) / C.MW_NACL + (R.sugar + extraSugar) / C.MW_SUC;
    const xw = C.xw(P1_WATER, np);
    return { np, xw, p: C.pSol(100, xw) };
  }
  function p1Update() {
    const a = +$('r-salt').value, b = +$('r-sugar').value, c = p1Calc(a, b);
    A.set('r-sv', a); A.set('r-ugv', b);
    A.set('r-have', `소금 ${A.fmt(R.salt, 0)} g · 설탕 ${A.fmt(R.sugar, 0)} g`);
    A.set('r-np', A.fmt(c.np, 3)); A.set('r-x', A.fmt(c.xw, 4)); A.set('r-p', A.fmt(c.p, 3) + ' atm  (투입 시 예상)');
    A.setw('r-bar', (1 - c.p) / (1 - P1_GOAL) * 100, c.p <= P1_GOAL ? 'good' : '');
    A.set('r-st', c.p <= P1_GOAL ? '✅ 방어막이 깨질 만큼 내려갑니다' : `방어막 유지 중 (목표까지 ${A.fmt(c.p - P1_GOAL, 3)} atm)`);
  }
  function p1Add() {
    const a = +$('r-salt').value, b = +$('r-sugar').value, s = S().inv;
    if (a > s.salt || b > s.sugar) return A.say('재료가 부족합니다.');
    s.salt -= a; s.sugar -= b; R.salt += a; R.sugar += b;
    const c = p1Calc();
    A.logEv('대기 처리 코어 P1', `소금 ${R.salt} g, 설탕 ${R.sugar} g 투입 → 증기압 ${A.fmt(c.p, 3)} atm`);
    if (c.p <= P1_GOAL) { A.say('🛡️ 증기 방어막이 깨졌습니다!'); R.phase = 2; render(); }
    else { A.say('아직 방어막이 남아 있습니다. 더 녹이세요.'); render(); }
    A.refresh();
  }

  // ---------- P2 ----------
  function p2() {
    return `<p>방어막이 깨지자 솥이 밀폐되며 가열됩니다. 내부 압력을 <b>${P2_WIN[0]}~${P2_WIN[1]} atm</b>에 유지하면 대기 처리 코어가 약해집니다. <b>${C.PBURST} atm</b>을 넘으면 폭발합니다!</p>
    <div class="grid2"><div class="box">
      <label>가열 세기 <b id="r-dv"></b>/10<input type="range" id="r-dial" min="0" max="10" value="0" oninput="Raid.p2In()"></label>
      <label>배기 밸브 <b id="r-vv"></b>/5<input type="range" id="r-valve" min="0" max="5" value="0" oninput="Raid.p2In()"></label>
      <div class="row" style="margin-top:6px"><button onclick="Raid.p2Water()">증류수 200 g (25℃)</button><button onclick="Raid.p2Pack()">한제 팩 투입</button></div>
      <div class="row" style="margin-top:6px"><button class="primary" id="r-go" onclick="Raid.p2Go()">시작</button></div>
      <div class="mut" id="r-have2"></div></div>
    <div class="box">
      <div class="kv"><span>물 온도</span><b id="r-T"></b></div>
      <div class="kv"><span>공기 분압</span><b id="r-pa"></b></div>
      <div class="kv"><span>수증기압 P*(T)</span><b id="r-pv"></b></div>
      <div class="kv"><span>전체 압력</span><b id="r-pt"></b></div>
      <div class="bar"><i id="r-pbar"></i></div>
      <div class="kv"><span>대기 처리 코어 체력</span><b id="r-hp"></b></div>
      <div class="bar bad"><i id="r-hbar"></i></div><div id="r-st" class="mut"></div></div></div>
    <div class="warnbox">밀폐 용기의 전체 압력 = 공기 분압(부피·양이 일정하면 온도에 비례, 이상 기체 방정식) + 수증기압(온도가 오를수록 가파르게 증가). 배기하면 공기부터 빠지고, 공기가 없어지면 증기를 내보내 열을 잃습니다. 증류수·얼음(융해열 334 J/g)은 열을 빼앗아 온도를 낮춥니다. 대기 처리 코어의 불길이 주기적으로 온도를 올립니다. (게임 단순화: 2단계의 수증기압은 순수한 물 기준이며 1단계에 넣은 용질은 반영하지 않습니다.)</div>`;
  }
  const pTotal = () => R.airN * (R.T + 273.15) / 298.15 + C.pStar(R.T);
  function p2In() { R.dial = +$('r-dial').value; R.valve = +$('r-valve').value; A.set('r-dv', R.dial); A.set('r-vv', R.valve); }
  function p2Go() { R.running = !R.running; $('r-go').textContent = R.running ? '일시정지' : '계속'; }
  function p2Water() {
    const s = S().inv; if (s.water < 200) return A.say('증류수가 200 g 필요합니다.');
    s.water -= 200; R.T = C.mixT(R.M, R.T, 200, 25); R.M += 200; A.logEv('대기 처리 코어 P2', `증류수 200 g 투입 → 물 온도 ${A.fmt(R.T, 1)} ℃`); A.refresh();
  }
  function p2Pack() {
    const packs = S().packs; if (!packs.length) return A.say('한제 팩이 없습니다. (냉각 상자, 당일 사용)');
    const p = packs.sort((x, y) => x.T - y.T).shift();
    const before = R.T; R.T = C.packMix(R.M, R.T, p.M, p.T); R.M += p.M;
    A.logEv('대기 처리 코어 P2', `한제 팩(${A.fmt(p.T, 1)}℃, 얼음 ${p.M} g) 투입: ${A.fmt(before, 1)} → ${A.fmt(R.T, 1)} ℃`); A.refresh();
  }
  function p2Update() {
    if (!$('r-dial')) return;
    p2In();
    const pt = pTotal(), pa = pt - C.pStar(R.T);
    A.set('r-T', A.fmt(R.T, 1) + ' ℃'); A.set('r-pa', A.fmt(pa, 2) + ' atm'); A.set('r-pv', A.fmt(C.pStar(R.T), 2) + ' atm');
    A.set('r-pt', A.fmt(pt, 2) + ' atm'); A.setw('r-pbar', pt / 3.2 * 100, pt >= P2_WIN[0] && pt <= P2_WIN[1] ? 'good' : (pt > P2_WIN[1] ? 'bad' : ''));
    A.set('r-hp', A.fmt(R.hp, 0) + ' / 100'); A.setw('r-hbar', R.hp);
    if ($('golem')) A.Art.drawGolem($('golem'), 2, Math.max(0, R.hp) / 100);
    A.set('r-have2', `증류수 ${A.fmt(S().inv.water, 0)} g · 한제 팩 ${S().packs.length}개`);
    A.set('r-st', R.warn > 0 ? '대기 처리 코어가 불을 뿜으려 합니다! (온도 상승 임박)' : (R.running ? (pt >= P2_WIN[0] && pt <= P2_WIN[1] ? '안전 압력대 — 대기 처리 코어가 약해지는 중' : '압력대 밖') : '대기 중'));
  }
  function p2Tick() {
    if (!R.running) return p2Update();
    const dt = 0.1, Ch = R.M * C.C_W + 300;
    R.T += (R.dial * 300 - 8 * (R.T - 25)) * dt / Ch;
    let pt = pTotal();
    if (R.valve > 0 && pt > 1.0) {
      if (R.airN > 0.002) R.airN *= 1 - 0.08 * R.valve * dt;
      else R.T -= 0.6 * R.valve * dt;                 // 증기를 내보내며 열을 잃어 냉각
    }
    R.surgeIn -= dt;
    if (R.surgeIn <= 2 && R.warn === 0) R.warn = 2;
    if (R.surgeIn <= 0) { R.T += SURGE; R.surgeIn = 10 + Math.random() * 4; R.warn = 0; A.logEv('대기 처리 코어 P2', `불길: 온도 +${SURGE} ℃ → ${A.fmt(R.T, 1)} ℃`); }
    pt = pTotal();
    if (pt >= P2_WIN[0] && pt <= P2_WIN[1]) R.hp -= P2_DMG * dt;
    if (pt > C.PBURST) {
      A.logEv('대기 처리 코어 P2 폭발', `전체 압력 ${A.fmt(pt, 2)} atm > ${C.PBURST} atm (T=${A.fmt(R.T, 1)}℃, 공기 ${A.fmt(R.airN, 2)})`);
      A.say('💥 솥이 폭발했습니다! 2단계를 다시 시작합니다.');
      const salt = R.salt, sugar = R.sugar;
      R = fresh(); R.phase = 2; R.salt = salt; R.sugar = sugar; render(); return;
    }
    if (R.hp <= 0) { A.logEv('대기 처리 코어 P2', '안전 압력대 유지에 성공'); A.say('대기 처리 코어가 약해졌습니다!'); R.phase = 3; render(); return; }
    p2Update();
  }

  // ---------- P3 ----------
  function p3() {
    return `<p>대기 처리 코어의 탱크(${TANK_V} L, ${TANK_T} K)가 불안정한 혼합 기체로 차 있습니다. 캡슐을 넣어 <b>전체 압력 ${GOAL_P} atm</b>, <b>산소 분압 ${GOAL_O2} atm</b>으로 맞추세요. (허용 오차 ±0.04 / ±0.03) ${C.PBURST} atm을 넘으면 폭발합니다.</p>
    <div class="grid2"><div class="box"><h4>탱크 안</h4>
      <div class="kv"><span>N₂ 분압</span><b id="t-N2"></b></div><div class="kv"><span>O₂ 분압</span><b id="t-O2"></b></div>
      <div class="kv"><span>Ar 분압</span><b id="t-Ar"></b></div><div class="kv"><span>He 분압</span><b id="t-He"></b></div>
      <div class="kv"><span>전체 압력</span><b id="t-P"></b></div><div class="kv"><span>O₂ 몰분율</span><b id="t-x"></b></div>
      <div class="bar"><i id="t-bar"></i></div><div id="t-st" class="mut"></div></div>
    <div class="box"><h4>캡슐 넣기 (1개 ≈ n 0.02 mol)</h4><div id="t-btns"></div>
      <div class="row" style="margin-top:8px"><button onclick="Raid.p3Vent()">배기 (전체의 10 %)</button><button class="primary" onclick="Raid.p3Check()">안정화 확인</button></div></div></div>
    <div class="warnbox">반응하지 않는 기체는 각자 따로 있는 것처럼 행동하여 전체 압력은 분압의 합입니다(P_i = n_i·R·T/V = x_i·P). 배기는 조성을 바꾸지 않고 양만 줄입니다. 헬륨은 공기 성분이 아니지만 압력은 올립니다.</div>`;
  }
  function p3P() {
    const o = {}; let tot = 0;
    for (const k in R.n) { o[k] = C.partial(R.n[k], TANK_V, TANK_T); tot += o[k]; }
    return { o, tot };
  }
  function p3Update() {
    const { o, tot } = p3P();
    for (const k of ['N2', 'O2', 'Ar', 'He']) A.set('t-' + k, A.fmt(o[k], 3) + ' atm');
    A.set('t-P', A.fmt(tot, 3) + ' atm'); A.set('t-x', A.fmt(o.O2 / tot, 3));
    A.setw('t-bar', tot / 3.2 * 100, tot > 2.8 ? 'bad' : '');
    A.set('t-st', Math.abs(tot - GOAL_P) <= 0.04 && Math.abs(o.O2 - GOAL_O2) <= 0.03 ? '✅ 목표 범위입니다. 안정화 확인을 누르세요' : '조정 중');
    const kinds = [['N2', 'N₂'], ['O2', 'O₂'], ['He', 'He'], ['air', '공기']];
    $('t-btns').innerHTML = kinds.map(([k, n]) => `<div class="row" style="margin-bottom:4px"><button ${A.capCount(k) ? '' : 'disabled'} onclick="Raid.p3Add('${k}')">${n} 캡슐 넣기</button><span class="mut">보유 ${A.capCount(k)}</span></div>`).join('');
  }
  function p3Add(k) {
    const caps = S().caps, i = caps.findIndex(c => c.k === k); if (i < 0) return;
    const c = caps.splice(i, 1)[0];
    if (k === 'air') for (const g in C.AIR) R.n[g] += c.n * C.AIR[g]; else R.n[k] += c.n;
    const { tot } = p3P();
    if (tot > C.PBURST) {
      A.logEv('대기 처리 코어 P3 폭발', `전체 압력 ${A.fmt(tot, 2)} atm > ${C.PBURST} atm`);
      A.say('💥 탱크가 폭발했습니다! 기체 조성이 처음으로 돌아갑니다.');
      const f = fresh(); R.n = f.n; render(); return;
    }
    p3Update(); A.refresh();
  }
  function p3Vent() { for (const k in R.n) R.n[k] *= 0.9; p3Update(); }
  function p3Check() {
    const { o, tot } = p3P();
    const okP = Math.abs(tot - GOAL_P) <= 0.04, okO = Math.abs(o.O2 - GOAL_O2) <= 0.03;
    A.logEv('대기 처리 코어 P3 확인', `전체 ${A.fmt(tot, 3)} atm, O₂ 분압 ${A.fmt(o.O2, 3)} atm → ${okP && okO ? '성공' : '실패'}`);
    if (!okP || !okO) return A.say(`${okP ? '' : '전체 압력이 맞지 않습니다. '}${okO ? '' : '산소 분압이 맞지 않습니다.'}`);
    S().f.boss = true; A.say('대기 처리 코어가 정화되었습니다!'); A.refresh();
    A.openModal('대기 처리 코어 정화 완료', `<p>${S().day}일차에 대기 처리 코어를 정화했습니다.</p>
      <div class="box">1단계: 소금·설탕이 만든 <b>증기압력 내림</b><br>2단계: 압력과 <b>끓는점</b>, 열 평형(비열·융해열)<br>3단계: <b>돌턴의 분압 법칙</b>과 이상 기체 방정식</div>
      <p class="mut">‘📝 기록’의 자동 기록을 개발 기록(시험 플레이 증빙)에 활용하세요.</p>`, null, close);
  }

  api.p1Update = p1Update; api.p1Add = p1Add; api.p2In = p2In; api.p2Go = p2Go; api.p2Water = p2Water; api.p2Pack = p2Pack;
  api.debugGoto = (n) => { R.phase = n; render(); };   // 시험 플레이용: 단계로 바로 이동
  api.p3Add = p3Add; api.p3Vent = p3Vent; api.p3Check = p3Check;
  api.debugCoop = () => ({ coop });   // 시험용
  // 2단계 렌더 후 타이머 시작
  const _render = render;
  render = function () { _render(); if (R.phase === 2) timer = setInterval(p2Tick, 100); };
  return api;
})();
