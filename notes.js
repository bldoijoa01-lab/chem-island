// 연구 노트: 시스템 연결도(수업 아이템 번호 포함) + 계산기. 게임 안의 화학 규칙을 투명하게 보여 준다.
window.Notes = (() => {
  const C = Chem;
  let A;
  // [A, 관계(원인→변화→결과), B, 성립 조건/가정, 수업 아이템 번호, 게임에서의 역할, 구현 여부]
  const LINKS = [
    ['물', '용질을 녹임', '소금물·설탕물', '용질이 물에 용해되어 용액을 형성', '29, 32', '바닷물(소금물), 라면 스프, 골렘 P1 용액', true],
    ['용질(소금·설탕)', '용질 첨가 → 물의 몰분율 x 감소 → 증기압력 내림 (P = x·P*)', '용액의 증기압력', '비휘발성 용질, 묽거나 이상 용액 가정(라울의 법칙)', '12, 30, 32', '증류기 증발 속도, 골렘 1단계 방어막', true],
    ['증기압력 내림', '같은 외부 압력에서 끓으려면 더 높은 온도 필요', '끓는점 오름', 'ΔTb = i·Kb·m 은 묽은 용액의 근사. 게임은 라울의 법칙에서 직접 계산', '19, 20, 31, 34', '증류가 진행될수록(농축) 더 센 불이 필요', true],
    ['외부 압력', '압력 ↑ → 끓는점 ↑ (증기압력 = 외부 압력일 때 끓음)', '압력 밥솥', '증발열 일정 가정(클라우지우스–클라페이롱)', '3, 18, 19', '밸브 압력별 끓는점 계산', true],
    ['증기 밥솥', '내부 압력 ↑ → 끓는점 ↑ → 더 높은 온도에서 조리', '조리 속도', '속도는 10 ℃당 2배(경험칙, 가정)', '18, 34', '라면을 빨리 익힘. 압력 한계 3 atm에서 폭발', true],
    ['소금', '용질 첨가 → 어는점 내림 ΔTf = i·Kf·m', '얼음-소금 한제', '공융점(−21.1 ℃)이 하한, 얼음 전체 질량 기준 근사', '37, 39 (35 참고)', '냉각 상자: 0 ℃ 이하의 한제 팩', true],
    ['얼음', '열을 흡수하며 융해 (융해열 334 J/g)', '액체 물', '0 ℃ 부근, 한제는 더 낮은 온도에서 시작', '21', '골렘 2단계 냉각(한제 팩)', true],
    ['물', '비열이 큼 → 같은 열량에도 온도 변화가 작음', '온도 완충', '같은 비열로 혼합 온도를 계산(열 손실 무시)', '25', '증류수 투입 시 온도 혼합 계산', true],
    ['온도', '온도 ↑ → 기체 압력 ↑ (부피·양 일정) / 압력·양 일정이면 부피 ↑', '기체', '이상 기체 PV = nRT (R = 0.082)', '2, 4, 6', '골렘 2단계 공기 분압, 포집기의 n = PV/RT', true],
    ['주사기', '피스톤으로 기체의 양·부피를 바꿈', '기체 캡슐', '대기압 1 atm, 외기 온도 기준', '8', '기체 포집기', true],
    ['혼합 기체', '전체 압력 = 분압의 합, P_i = x_i·P', '기체 퍼즐', '서로 반응하지 않는 기체, 같은 T·V', '9, 10, 11, 12', '골렘 3단계 (분압 맞추기)', true],
    ['소금 + 얼음', '소금이 얼음에 닿으면 어는점 내림 → 평형 몰랄농도 m = |T|/(i·Kf)까지 얼음이 녹음', '서리 늑대(얼음 몸)', '공융점(−21.1 ℃) 이하·0 ℃ 이상에서는 불가, 열수지 무시', '21, 37, 39', '밤에 장치를 부수는 늑대를 소금·화덕 열로 정화', true],
    ['삼투 / 판트호프', 'π = cRT', '반투막', '—', '33, 36, 40', '아직 구현하지 않음 (다음 확장 후보)', false],
    ['분산력·쌍극자 힘·수소 결합', '분자 간 힘 ↑ → 끓는점 ↑', '물질별 끓는점', '—', '13~17, 28', '아직 구현하지 않음', false],
  ];

  function linksHtml() {
    return `<table><tr><th>A</th><th>관계 (원인 → 변화 → 결과)</th><th>B</th><th>성립 조건/가정</th><th>아이템</th><th>게임 역할</th><th>구현</th></tr>` +
      LINKS.map(l => `<tr><td>${l[0]}</td><td>${l[1]}</td><td>${l[2]}</td><td>${l[3]}</td><td>${l[4]}</td><td>${l[5]}</td><td class="${l[6] ? 'ok' : 'no'}">${l[6] ? '구현' : '미구현'}</td></tr>`).join('') + `</table>`;
  }
  function calcHtml() {
    return `<div class="grid2">
    <div class="box"><h4>끓는점 계산기</h4>
      <label>용질 <select id="n-sol" onchange="Notes.calc()"><option value="2">소금 NaCl (i=2)</option><option value="1">설탕 (i=1)</option></select></label>
      <label>몰랄농도 m <b id="n-mv"></b> mol/kg<input type="range" id="n-m" min="0" max="6" step="0.1" value="0.6" oninput="Notes.calc()"></label>
      <label>외부 압력 <b id="n-pv"></b> atm<input type="range" id="n-p" min="0.5" max="3" step="0.1" value="1" oninput="Notes.calc()"></label>
      <div class="kv"><span>물의 몰분율 x</span><b id="n-x"></b></div>
      <div class="kv"><span>끓는점 (라울 + 클라우지우스–클라페이롱)</span><b id="n-tb"></b></div>
      <div class="kv"><span>순수한 물의 끓는점</span><b id="n-tb0"></b></div>
      <div class="kv"><span>근사식 100 + i·Kb·m (1 atm)</span><b id="n-ap"></b></div>
      <div class="mut" id="n-warn"></div></div>
    <div class="box"><h4>한제(얼음 + 소금) 계산기</h4>
      <label>얼음 <b id="n-iv"></b> g<input type="range" id="n-i" min="100" max="500" step="100" value="200" oninput="Notes.calc()"></label>
      <label>소금 <b id="n-sv"></b> g<input type="range" id="n-s" min="0" max="150" step="1" value="30" oninput="Notes.calc()"></label>
      <div class="kv"><span>몰랄농도 m</span><b id="n-fm"></b></div>
      <div class="kv"><span>어는점 내림 후 온도</span><b id="n-ft"></b></div>
      <div class="mut" id="n-fw"></div></div></div>`;
  }
  function calc() {
    const i = +document.getElementById('n-sol').value, m = +document.getElementById('n-m').value, P = +document.getElementById('n-p').value;
    const np = i * m, xw = 1000 / C.MW_W / (1000 / C.MW_W + np);
    A.set('n-mv', m.toFixed(1)); A.set('n-pv', P.toFixed(1)); A.set('n-x', xw.toFixed(4));
    A.set('n-tb', C.tb(P, xw).toFixed(2) + ' ℃'); A.set('n-tb0', C.tb(P, 1).toFixed(2) + ' ℃');
    A.set('n-ap', (100 + C.dTbApprox(i, m)).toFixed(2) + ' ℃');
    A.set('n-warn', m > 1.5 ? '농도가 높으면 이상 용액 가정이 어긋나 근사식과 차이가 커집니다. (실제 용액은 더 복잡)' : '묽은 용액: 근사식과 거의 같습니다.');
    const ice = +document.getElementById('n-i').value, salt = +document.getElementById('n-s').value;
    A.set('n-iv', ice); A.set('n-sv', salt);
    const fm = salt / C.MW_NACL / (ice / 1000);
    A.set('n-fm', fm.toFixed(2) + ' mol/kg'); A.set('n-ft', C.coolTemp(ice, salt).toFixed(1) + ' ℃');
    A.set('n-fw', -2 * C.KF * fm < C.EUTECTIC ? '공융점(−21.1 ℃)에서 멈춥니다: 소금을 더 넣어도 더 내려가지 않아요.' : 'ΔTf = i·Kf·m (i=2, Kf=1.86)');
  }
  function open(a) {
    A = a;
    const tabs = { 연결도: linksHtml, 계산기: calcHtml };
    A.openModal('📖 연구 노트', `<div class="tabs">${Object.keys(tabs).map((k, n) => `<button class="${n ? '' : 'on'}" onclick="Notes.tab('${k}',this)">${k}</button>`).join('')}</div>
      <div id="n-body">${linksHtml()}</div>
      <div class="warnbox">‘구현’은 이 게임의 규칙에 실제로 반영되었는지를 뜻합니다. 모든 규칙은 chem.js 한 곳에서 계산됩니다.</div>`);
    Notes._tabs = tabs;
  }
  function tab(k, btn) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b === btn));
    document.getElementById('n-body').innerHTML = Notes._tabs[k]();
    if (k === '계산기') calc();
  }
  const Notes = { open, tab, calc };
  return Notes;
})();
