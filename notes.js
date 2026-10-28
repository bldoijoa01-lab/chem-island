// 연구 노트: 시스템 연결도(수업 아이템 번호 포함) + 계산기. 게임 안의 화학 규칙을 투명하게 보여 준다.
window.Notes = (() => {
  const C = Chem;
  let A;
  // [A, 관계(원인→변화→결과), B, 성립 조건/가정, 수업 아이템 번호, 게임에서의 역할, 구현 여부]
  const LINKS = [
    ['물', '용질을 녹임', '소금물·설탕물', '용질이 물에 용해되어 용액을 형성', '29, 32', '바닷물(소금물), 라면 스프, 대기 처리 코어 P1 용액', true],
    ['용질(소금·설탕)', '용질 첨가 → 물의 몰분율 x 감소 → 증기압력 내림 (P = x·P*)', '용액의 증기압력', '비휘발성 용질 가정(라울의 법칙)', '12, 30, 32', '증류기 증발 속도, 대기 처리 코어 1단계 방어막', true],
    ['증기압력 내림', '같은 외부 압력에서 끓으려면 더 높은 온도 필요', '끓는점 오름', 'ΔTb = i·Kb·m 은 묽은 용액에서 맞는 식. 게임은 라울의 법칙과 증기압력 곡선 표에서 직접 읽음', '19, 20, 31, 34', '증류가 진행될수록(농축) 더 센 불이 필요', true],
    ['외부 압력', '압력 ↑ → 끓는점 ↑ (증기압력 = 외부 압력일 때 끓음)', '압력 밥솥', '증기압력 곡선 표(0~150 ℃)에서 증기압력 = 외부 압력인 온도를 읽음', '3, 18, 19', '밸브 압력별 끓는점 계산', true],
    ['외부 압력 ↓ (저기압 고원 행성 0.65 atm)', '증기압력 = 외부 압력일 때 끓음 → 외부 압력이 낮으면 더 낮은 온도에서 끓음 (물은 약 88 ℃)', '저기압 고원 행성의 증류기·밥솥', '밸브는 해수면 기준 게이지 압력으로 해석(상한 = 외기 + 밸브 − 1)', '3, 18, 19', '같은 증류기는 더 빨리 끝나고, 같은 밸브의 밥솥은 더 느리게 익음(끓는점이 낮아서)', true],
    ['NaCl 결정(이온 결합)', '이온 결정은 녹는점이 매우 높고 단단함 → 화덕으로 못 녹이고 곡괭이로 캠', '암염(저기압 고원 행성)', '화덕 최대 145 ℃로는 녹일 수 없음(게임 설정)', '24', '증류 없이 소금을 얻는 두 번째 경로(1회 30 g)', true],
    ['증기 밥솥', '내부 압력 ↑ → 끓는점 ↑ → 더 높은 온도에서 조리', '조리 속도', '속도는 10 ℃당 2배(경험칙, 가정)', '18, 34', '라면을 빨리 익힘. 압력 한계 3 atm에서 폭발', true],
    ['소금', '용질 첨가 → 어는점 내림 ΔTf = i·Kf·m', '얼음-소금 한제', '얼음 전체 질량 기준. 소금 투입량 상한(얼음 100 g당 30 g)은 게임 설정(가정)', '37, 39 (35 참고)', '냉각 상자: 0 ℃ 이하의 한제 팩', true],
    ['얼음', '열을 흡수하며 융해 (융해열 334 J/g)', '액체 물', '0 ℃ 부근, 한제는 더 낮은 온도에서 시작', '21', '대기 처리 코어 2단계 냉각(한제 팩)', true],
    ['물', '비열이 큼 → 같은 열량에도 온도 변화가 작음', '온도 완충', '같은 비열로 혼합 온도를 계산(열 손실 무시)', '25', '증류수 투입 시 온도 혼합 계산', true],
    ['온도', '온도 ↑ → 기체 압력 ↑ (부피·양 일정) / 압력·양 일정이면 부피 ↑', '기체', '이상 기체 PV = nRT (R = 0.082)', '2, 4, 6', '대기 처리 코어 2단계 공기 분압, 포집기의 n = PV/RT', true],
    ['주사기', '피스톤으로 기체의 양·부피를 바꿈', '기체 캡슐', '대기압 1 atm, 외기 온도 기준', '8', '기체 포집기', true],
    ['혼합 기체', '전체 압력 = 분압의 합, P_i = x_i·P', '기체 퍼즐', '서로 반응하지 않는 기체, 같은 T·V', '9, 10, 11, 12', '대기 처리 코어 3단계 (분압 맞추기)', true],
    ['소금 + 얼음', '소금이 얼음에 닿으면 어는점 내림 → 평형 몰랄농도 m = |T|/(i·Kf)까지 얼음이 녹음', '얼음 생물(얼음 몸)·얼음 타일', '0 ℃ 이상에서는 소금이 필요 없음. 기온이 낮을수록 같은 얼음에 소금이 더 듦. 얼음 타일 1칸 100 g은 가정', '21, 37, 39', '밤에 장치를 부수는 얼음 생물을 소금·화덕 열로 정화, 소금 뿌리개로 얼음 타일을 녹여 물로 만듦', true],
    ['온도 차 (열 전도)', '이웃한 두 칸: 열은 온도가 높은 칸 → 낮은 칸으로 Q = K·ΔT·dt, 받은 칸의 온도 변화 = Q ÷ (질량 × 비열)', '칸의 온도', '에너지 합 보존, 한 걸음 열량은 평형 열량의 0.2배 이하. 전도도 K·재료 상수는 게임 설정(가정)', '25, 26, 27, 21', '칸 시뮬 cells.js(계산 모듈만 있음, 화면 연결은 19단계)', false],
    ['분압 차 (기체 확산)', '이웃한 열린 칸 사이 기체는 분압이 높은 쪽 → 낮은 쪽으로 이동, 같은 T·분압에서 속도 ∝ 1/√M (그레이엄 법칙)', '칸의 기체 조성·압력', '확산 계수의 크기와 온도가 다른 칸 사이를 분압 차로 근사하는 것은 게임 설정(가정). 실제 공기 중 확산은 훨씬 느림', '9, 10, 11, 12, 3', '칸 시뮬 cells.js(계산 모듈만 있음, 화면 연결은 19단계)', false],
    ['밀도 차 (밀도에 따른 층)', '기체 밀도 ρ = P·M̄/(R·T): 위 칸이 아래 칸보다 무거우면 기체 일부가 자리를 바꿈(무거운 기체는 아래, 뜨거운 공기는 위)', '기체의 층', '게임 설정(가정): 실제 기체는 확산으로 결국 섞여 층이 영구히 남지 않음. 짧은 시간의 고임만 보여 줌', '4, 6, 12, 2', '칸 시뮬 cells.js(계산 모듈만 있음, 화면 연결은 19단계)', false],
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
      <div class="kv"><span>끓는점 (라울의 법칙 + 증기압력 곡선)</span><b id="n-tb"></b></div>
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
    A.set('n-warn', m > 1.5 ? '근사식은 묽은 용액에서 맞는 식이라, 진한 용액에서는 증기압력 곡선에서 직접 읽은 값과 차이가 커집니다.' : '묽은 용액: 근사식과 거의 같습니다.');
    const ice = +document.getElementById('n-i').value, salt = +document.getElementById('n-s').value;
    A.set('n-iv', ice); A.set('n-sv', salt);
    const fm = salt / C.MW_NACL / (ice / 1000);
    A.set('n-fm', fm.toFixed(2) + ' mol/kg'); A.set('n-ft', C.coolTemp(ice, salt).toFixed(1) + ' ℃');
    A.set('n-fw', 'ΔTf = i·Kf·m (i=2, Kf=1.86). 이 계산기는 소금 상한 없이 식만 계산합니다(게임의 냉각 상자는 얼음 100 g당 30 g까지).');
  }
  // 재료 도감(19단계): chem.js의 재료 표(MATERIALS)·기체 표(GAS_TABLE)를 그대로 보여 준다. 칸 값 읽기(cellsim.js)와 땅 파기(world.js)도 같은 표를 읽는다. 값은 여기서 다시 계산하지 않는다(밀도는 chem.js 함수)
  function bookHtml() {
    const rows = Object.keys(C.MATERIALS).map(key => { const p = C.matProps(key); return `<tr data-k="${key}"><td>${p.ko}</td><td data-f="rho">${p.rho}</td><td data-f="c">${(+p.c).toFixed(2)}</td><td data-f="k">${p.k}</td><td data-f="t">${p.t === null ? '못 팜' : p.t}</td><td data-f="tier">${p.tier === null ? '—' : C.TIER_NAME[p.tier]}</td><td>${p.cell}${p.from ? ' (물성: ' + C.MATERIALS[p.from].ko + ' 행)' : ''}</td></tr>`; }).join('');
    const gas = C.GASES.map(g => { const t = C.GAS_TABLE[g]; return `<tr data-g="${g}"><td>${t.ko}</td><td data-f="M">${t.M}</td><td data-f="cv">${(t.cv * C.R_J).toFixed(2)}</td><td data-f="rho">${C.gasDensity(1, t.M, 20).toFixed(3)}</td></tr>`; }).join('');
    return `<div class="warnbox">재료·기체의 모든 성질은 chem.js의 표 하나(MATERIALS·GAS_TABLE)에서 나옵니다. 모든 값은 <b>게임 설정(가정)</b>이고, 밀도·비열·열전도율은 대표값을 반올림했어요. '파는 시간'과 '필요한 도구'는 땅 파기 규칙의 값입니다(도구 단계 0 맨손, 1 곡괭이, 2 철 곡괭이, 3 아직 없음).</div>
      <table class="ntab"><tr><th>재료</th><th>밀도 (g/cm³)</th><th>비열 (J/(g·K))</th><th>열전도율 (W/(m·K))</th><th>파는 시간 (초)</th><th>필요한 도구</th><th>칸 시뮬 종류</th></tr>${rows}</table>
      <table class="ntab"><tr><th>기체</th><th>몰 질량 (g/mol)</th><th>몰 열용량 Cv (J/(mol·K))</th><th>밀도 (g/L, 1 atm·20 ℃)</th></tr>${gas}</table>
      <div class="mut">기체 칸의 열전도율은 조성과 무관하게 ${C.K_GAS} W/(m·K), 칸 하나의 부피는 ${C.V_CELL} L입니다(게임 설정, 가정). 몰 열용량은 이상 기체의 자유도로 환산한 값(진동 무시)입니다.</div>`;
  }
  function open(a) {
    A = a;
    const tabs = { 연결도: linksHtml, 계산기: calcHtml, '재료 도감': bookHtml };
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
