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

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.Chem = C;
})(typeof window !== 'undefined' ? window : globalThis);
