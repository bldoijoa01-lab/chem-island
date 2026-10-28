// 화학 계산 모듈: 게임 규칙에 쓰이는 모든 식과 상수는 여기에만 둔다.
// (수업 아이템 번호는 주석의 [#번호]로 표시)
(function (root) {
  const C = {
    R: 0.082,          // atm·L/(mol·K)            [#6 기체 상수]
    KB: 0.512,         // ℃·kg/mol, 물의 몰랄 오름 상수      [#34]
    KF: 1.86,          // ℃·kg/mol, 물의 몰랄 내림 상수      [#37, #39]
    MW_W: 18.015,
    MW_NACL: 58.44,
    MW_SUC: 342.3,
    C_W: 4.18,         // J/(g·K) 물의 비열                 [#25]
    C_ICE: 2.1,        // J/(g·K) 얼음의 비열
    LF: 334,           // J/g 얼음의 융해열                  [#21]
    PBURST: 3.0,       // atm, 장치가 견디는 한계압력
  };

  // 물의 증기압력 곡선(kPa): 수업의 '증기압력 곡선'을 표로 읽는다. 0~150 ℃, 5 ℃ 간격(증기표 값, IAPWS).   [#19, #20]
  // 100 ℃는 1 atm(= 101.325 kPa)에서 끓는다는 학교 관례로 맞췄다(증기표 값 101.42 kPa와 0.1 % 차이). 표 사이는 직선으로 읽는다.
  const PSAT = [[0, 0.611], [5, 0.873], [10, 1.228], [15, 1.706], [20, 2.339], [25, 3.170], [30, 4.247], [35, 5.629], [40, 7.385], [45, 9.595],
    [50, 12.352], [55, 15.763], [60, 19.947], [65, 25.043], [70, 31.202], [75, 38.597], [80, 47.416], [85, 57.868], [90, 70.183], [95, 84.609],
    [100, 101.325], [105, 120.902], [110, 143.377], [115, 169.180], [120, 198.671], [125, 232.234], [130, 270.275], [135, 313.224], [140, 361.533],
    [145, 415.679], [150, 476.159]].map(([T, kPa]) => [T, kPa / 101.325]);   // → atm
  const seg = (arr, k, v) => { let i = 1; while (i < arr.length - 1 && arr[i][k] < v) i++; return i; };   // v가 들어가는 구간 (i−1, i). 표 밖은 끝 구간을 연장해 읽는다
  C.pStar = (Tc) => { const i = seg(PSAT, 0, Tc), [T0, p0] = PSAT[i - 1], [T1, p1] = PSAT[i]; return Math.max(1e-4, p0 + (p1 - p0) * (Tc - T0) / (T1 - T0)); };

  // 용매(물)의 몰분율 x_w. w: 물의 질량(g), np: 용해된 입자의 총 몰수(mol)   [#12]
  C.xw = (w, np) => { const nw = w / C.MW_W; return nw / (nw + np); };

  // 용액의 증기압 = x_w · P*(T)  (라울의 법칙, 비휘발성 용질)              [#4 연결, #30]
  C.pSol = (Tc, xw) => xw * C.pStar(Tc);

  // 외부 압력 P(atm)에서 용액의 끓는점(℃): 증기압력 = 외부 압력일 때 끓는다 → x_w·P*(Tb) = P 가 되는 Tb를 증기압력 곡선 표에서 거꾸로 읽는다   [#18, #19, #34]
  C.tb = (P, xw = 1) => { const t = P / xw, i = seg(PSAT, 1, t), [T0, p0] = PSAT[i - 1], [T1, p1] = PSAT[i]; return T0 + (T1 - T0) * (t - p0) / (p1 - p0); };

  // 묽은 용액의 근사식 ΔTb = i·Kb·m (검산용)                               [#31, #34]
  C.dTbApprox = (i, m) => i * C.KB * m;

  // 몰랄농도 m = 용질 mol / 용매 kg                                         [#31]
  C.molality = (nSolute, wGram) => nSolute / (wGram / 1000);

  // 소금-얼음 한제의 평형 온도(℃). 어는점 내림 ΔTf = i·Kf·m (하한 없음 — 소금 투입량 상한은 게임 설정)   [#37, #39]
  C.coolTemp = (iceG, saltG, i = 2) => {
    if (iceG <= 0 || saltG <= 0) return 0;
    const m = saltG / C.MW_NACL / (iceG / 1000);
    return -i * C.KF * m;
  };

  // 이상 기체: n = PV/RT                                                    [#4, #6, #8]
  C.moles = (P, V, Tc) => (P * V) / (C.R * (Tc + 273.15));
  // 분압 P_i = n_i RT / V  (= x_i · P_total)                                 [#9, #10, #11]
  C.partial = (n, V, TK) => (n * C.R * TK) / V;

  // 공기의 조성(몰분율)                                                       [#12]
  C.AIR = { N2: 0.7808, O2: 0.2095, Ar: 0.0097 };

  // 열량 혼합: 같은 비열일 때 mA·TA + mB·TB 의 가중 평균                       [#25]
  C.mixT = (mA, TA, mB, TB) => (mA * TA + mB * TB) / (mA + mB);

  // 한제 팩(얼음 Mi g, 온도 Tp<0)을 물 M g(온도 T)에 넣은 뒤의 평형 온도(℃)
  C.packMix = (M, T, Mi, Tp) => {
    const Qneed = Mi * (C.C_ICE * Math.abs(Tp) + C.LF);       // 얼음을 0℃ 물로 만드는 열
    const Tf = (M * C.C_W * T - Qneed) / (M * C.C_W + Mi * C.C_W);
    return Math.max(Tf, 0);
  };

  // 외기 온도(℃): 하루를 사인 곡선으로 근사. 오후 3시 최고, 새벽 3시 최저          // 가정(임의값): 최고 28, 최저 −15 ℃
  C.T_DAY_MAX = 28; C.T_NIGHT_MIN = -15;
  C.airTemp = (min) => (C.T_DAY_MAX + C.T_NIGHT_MIN) / 2 + (C.T_DAY_MAX - C.T_NIGHT_MIN) / 2 * Math.sin(2 * Math.PI * (min - 540) / 1440);

  // 소금이 녹이는 얼음의 질량(g): 기온 Tc(℃)에서 얼음-소금물이 평형이 될 때의 몰랄농도 m_eq = |Tc|/(i·Kf)   [#37, #39, #21]
  // 소금 n mol 이 m_eq 의 용액을 만들려면 물이 n/m_eq kg 필요 → 그만큼의 얼음이 녹는다.
  // 기온이 0 ℃ 이상이면 소금이 필요 없으므로 0(얼음은 소금 없이도 녹는다). 기온이 낮을수록 m_eq가 커서 같은 소금이 녹이는 얼음은 적다.
  C.iceMeltBySalt = (Tc, saltG, i = 2) => {
    if (!(Tc < 0) || saltG <= 0) return 0;
    const meq = -Tc / (i * C.KF);
    return (saltG / C.MW_NACL) / meq * 1000;
  };
  // 위의 역: 얼음 iceG(g)를 모두 녹이는 데 필요한 소금(g)
  C.saltForIce = (Tc, iceG, i = 2) => {
    if (!(Tc < 0) || iceG <= 0) return Infinity;
    return (-Tc / (i * C.KF)) * (iceG / 1000) * C.MW_NACL;
  };
  // 열량 Q(J)가 녹이는 0 ℃ 얼음의 질량(g) = Q / 융해열                              [#21]
  C.iceMeltByHeat = (qJ) => Math.max(0, qJ) / C.LF;

  // ==========================================================================================================
  // 18단계 칸 시뮬레이션(cells.js가 쓴다): 추가 개념 A 열 전도 · B 기체 확산 · C 밀도에 따른 층    (DESIGN.md 0절, §4-28)
  // 단위: 온도 ℃(에너지 계산은 K), 기체 mol, 압력 atm, 열 J, 열용량 J/K, 시간 게임 초, 길이 m.
  // 아래 숫자는 DESIGN 0절 표의 값(V_CELL, FLOW_MAX, 몰 질량, R)을 빼면 모두 "가정(임의값)"이다. 새 개념(증발열·용해도·상변화)은 넣지 않는다.
  // ==========================================================================================================
  C.R_J = C.R * 101.325;                    // J/(mol·K): 같은 기체 상수를 1 atm·L = 101.325 J로 환산                       [#6]
  C.V_CELL = 100;                           // L, 칸 하나의 부피(표 그대로). 1 atm·20 ℃ 공기 = 4.16 mol(표의 "약 4.2 mol")   [#4 #6]
  C.L_CELL = Math.cbrt(C.V_CELL / 1000);    // m, 칸 한 변(파생). 이웃 칸 중심 거리 L, 접촉 면적 L²
  C.FLOW_MAX = 0.2;                         // 한 걸음에 한 경계로 옮기는 양의 상한(평형량 대비, 표 그대로). cells.js가 시작할 때 ≤ 0.2를 검사한다
  C.GASES = ['N2', 'O2', 'He', 'H2O'];      // 칸이 가지는 기체. H2O는 수증기 기체일 뿐 증발·응축은 하지 않는다(증발열 연결은 사용자 확인 뒤)
  C.MOLAR_MASS = { N2: 28, O2: 32, He: 4, H2O: 18 };   // g/mol(표 그대로)                                                 [#12]
  // 몰 열용량 Cv(J/(mol·K)): 이상 기체의 자유도로 환산(진동 자유도 무시). 단원자 3/2·R, 이원자 5/2·R, 비선형 다원자 3·R     // 가정(임의값)   [#4 #25]
  C.CV_GAS = { N2: 2.5 * C.R_J, O2: 2.5 * C.R_J, He: 1.5 * C.R_J, H2O: 3 * C.R_J };
  C.K_GAS = 0.026;                          // W/(m·K), 공기의 열전도율(기체 칸은 조성과 무관하게 같은 값)                        // 가정(임의값)
  // 고체·액체 칸의 재료 표: 밀도 rho(g/cm³) · 비열 c(J/(g·K)) · 열전도율 k(W/(m·K)). 대표값을 반올림한 가정이다.      [#21 #25 #26 #27]
  // 얼음·물의 비열은 기존 C_ICE·C_W를 쓴다. 철(METAL)은 비열이 낮다(#27). 칸은 이 재료로 꽉 찬 100 L 덩어리로 본다.
  C.MATERIAL = {
    ROCK: { rho: 2.7, c: 0.84, k: 2.5 }, DIRT: { rho: 1.5, c: 0.90, k: 1.0 }, SAND: { rho: 1.6, c: 0.80, k: 0.3 },
    ICE: { rho: 0.92, c: C.C_ICE, k: 2.2 }, METAL: { rho: 7.87, c: 0.45, k: 80 }, WATER: { rho: 1.0, c: C.C_W, k: 0.6 },
  };
  // 확산 계수 D_GAS(mol·√(g/mol)/(atm·s)): 공기 중 N₂ 상호 확산 계수 D_AB = 2×10⁻⁵ m²/s, 칸 L_CELL, 293.15 K에서 환산한 값.      // 가정(임의값)
  //   Δn = (D_AB·L/(R_J·T))·Δp[Pa] 와 같아지도록 N₂(M = 28)에서 맞췄다. 실제 확산은 느려서 눈에 보이게 하려면 호출하는 쪽이 dt를 키운다.
  C.D_AB_AIR = 2e-5;
  C.D_GAS = C.D_AB_AIR * C.L_CELL * Math.sqrt(28) / (C.R_J * 293.15) * 101325;
  C.LAYER_RATE = 0.05;                      // 1/s, 밀도층이 서로 바꾸는 기체 비율의 시간당 크기(게임 설정, 가정(임의값)). 한 걸음 비율은 FLOW_MAX로 자른다

  // 고체·액체 한 칸의 열용량(J/K) = 질량(g) × 비열. 질량 = ρ(g/cm³) × 부피(L) × 1000 cm³/L                                   [#25]
  C.solidHeatCap = (name) => { const m = C.MATERIAL[name]; return m.rho * C.V_CELL * 1000 * m.c; };
  // 기체 한 칸의 열용량(J/K) = Σ n_i·Cv_i. nArr[i]는 C.GASES 순서의 몰수
  C.gasHeatCap = (nArr) => { let s = 0; for (let i = 0; i < C.GASES.length; i++) s += nArr[i] * C.CV_GAS[C.GASES[i]]; return s; };
  // 평균 몰 질량 M̄ = Σ n_i·M_i / Σ n_i (g/mol). 기체가 없으면 0                                                            [#12]
  C.meanMolarMass = (nArr) => { let n = 0, m = 0; for (let i = 0; i < C.GASES.length; i++) { n += nArr[i]; m += nArr[i] * C.MOLAR_MASS[C.GASES[i]]; } return n > 0 ? m / n : 0; };

  // ---- A. 열 전도 ----                                                                                                       [#25 #26 #27 #21]
  // 이웃한 두 칸 사이 전도도 K(W/K) = L_CELL × (두 칸 열전도율의 조화 평균). 칸 한 변 L, 접촉 면적 L², 중심 거리 L이면 k·A/L = k·L이고,
  // 서로 다른 두 재료가 직렬이면 저항이 더해져 조화 평균 2·ka·kb/(ka+kb)가 된다(표의 "조화 평균"에 W/(m·K) → W/K 환산 인자 L을 곱한 것).
  C.condK = (ka, kb) => (ka > 0 && kb > 0 ? C.L_CELL * 2 * ka * kb / (ka + kb) : 0);
  // 한 걸음(dt 초)에 칸 a(온도 Ta, 열용량 Ca)에서 칸 b로 옮기는 열량 Q(J). 높은 쪽 → 낮은 쪽만, 부호는 Ta − Tb를 따른다.
  // Q_raw = K·(Ta − Tb)·dt 를 두 칸이 한 걸음에 완전히 평형이 되는 열량 Q_eq = Ca·Cb/(Ca + Cb)·(Ta − Tb)의 FLOW_MAX배로 자른다.
  // (온도 변화를 양쪽에 같게 자르면 Ca ≠ Cb일 때 에너지가 보존되지 않으므로 열량 Q를 자르고 온도는 Q ÷ C로 구한다.) 열용량이 무한대(고정 칸)면 상대 칸의 열용량이 Q_eq의 열용량이다.
  C.heatFlow = (K, Ta, Tb, dt, Ca, Cb) => {
    const dT = Ta - Tb;
    if (!(K > 0) || dT === 0 || !(Ca > 0) || !(Cb > 0)) return 0;
    const Ceq = (Number.isFinite(Ca) && Number.isFinite(Cb)) ? Ca * Cb / (Ca + Cb) : Math.min(Ca, Cb);
    if (!Number.isFinite(Ceq)) return 0;                      // 둘 다 고정 칸이면 주고받을 필요 없음
    const qRaw = K * Math.abs(dT) * dt, qEq = Ceq * Math.abs(dT);
    return Math.sign(dT) * Math.min(qRaw, C.FLOW_MAX * qEq);
  };

  // ---- B. 기체 확산 ----                                                                                                     [#9 #10 #11 #12 #3, 그레이엄 법칙]
  // 이웃한 열린 두 칸 사이 기체 i의 이동량 Δn(mol, a → b가 +). Δn_raw = D_GAS·(P_i,a − P_i,b)/√M_i·dt: 분압이 높은 쪽에서 낮은 쪽으로,
  // 같은 T·분압에서 속도 ∝ 1/√M. 두 칸의 분압이 같아지게 옮겨야 하는 몰수 x_eq = (P_a − P_b)·V/(R·(T_a + T_b))(T는 K)의 FLOW_MAX배로 자른다.
  // x_eq < n_a 라서 한 칸에서 4방향으로 나가도 유출 합이 0.8·n_a 미만이다(몰수가 음수가 되지 않는다).
  // 온도가 다른 칸 사이 이동을 분압 차 하나로 근사하는 것은 게임 설정(가정)이다(교과서의 그레이엄 법칙은 같은 T·P에서의 속도 비).
  C.diffFlow = (Pa, Pb, M, Ta, Tb, dt) => {
    const dP = Pa - Pb;
    if (dP === 0) return 0;
    const raw = C.D_GAS * dP / Math.sqrt(M) * dt, xEq = dP * C.V_CELL / (C.R * (Ta + Tb + 546.3));
    return Math.sign(dP) * Math.min(Math.abs(raw), C.FLOW_MAX * Math.abs(xEq));
  };

  // ---- C. 밀도에 따른 층 ----                                                                                                [#4 #6 #12 #2]
  // 기체 밀도 ρ = P·M̄/(R·T) (g/L, P atm, M̄ g/mol, T K). 같은 T·P에서 무거운 기체가 크고, 같은 기체면 뜨거운 쪽이 작다.
  C.gasDensity = (P, Mbar, Tc) => P * Mbar / (C.R * (Tc + 273.15));
  // 위 칸 밀도가 아래 칸보다 클 때 서로 바꾸는 기체의 비율 G = min(FLOW_MAX, LAYER_RATE·dt) × (ρ위 − ρ아래)/ρ위. 밀도 차가 작을수록 덜 바꿔 수렴한다.
  // 실제 기체는 확산으로 결국 섞이므로 층이 영구히 남지 않는다. 이 규칙은 "막 유입된 짧은 시간의 고임"을 보여 주는 게임 설정(가정)이다.
  C.layerFrac = (rhoUp, rhoLow, dt) => (rhoUp > rhoLow && rhoUp > 0 ? Math.min(C.FLOW_MAX, C.LAYER_RATE * dt) * (rhoUp - rhoLow) / rhoUp : 0);

  // ==========================================================================================================
  // 19단계(DESIGN.md §4-29): 칸 시뮬을 게임에 연결하는 게임 설정(가정(임의값)). 새 화학 식은 없다.
  // ==========================================================================================================
  C.CELL_WIN = { w: 96, h: 64 };            // 계산 창(칸). 플레이어 중심, 0절 값
  C.CELL_SCALES = [10, 60, 300];            // 시간 배율 후보: 칸 시뮬 dt = 흐른 게임 초 × 배율. 18단계 측정에서 일곱 칸 압력 균일에 게임 약 375,000초가 걸렸다
  C.CELL_SCALE_DEFAULT = 60;                // 기본(x1 속도에서 일곱 칸 균일 약 52초). D_GAS는 바꾸지 않고 시간만 키운다
  C.CELL_TICK_MS = 250;                     // 칸 시뮬 한 걸음의 실제 주기(4 Hz)
  C.CELL_SECONDS_PER_REAL = 120;            // 게임 속도 x1에서 실제 1초 = 게임 120초(1분이 0.5초)

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.Chem = C;
})(typeof window !== 'undefined' ? window : globalThis);
