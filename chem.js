// 화학 계산 모듈: 게임 규칙에 쓰이는 모든 식과 상수는 여기에만 둔다.
// (수업 아이템 번호는 주석의 [#번호]로 표시)
(function (root) {
  const C = {
    R: 0.082,          // atm·L/(mol·K)            [#6 기체 상수]
    Rj: 8.314,         // J/(mol·K)
    DHVAP: 40700,      // J/mol, 물의 증발열(100℃ 부근, 일정하다고 가정)
    TB0: 373.15,       // K, 1 atm에서 물의 끓는점
    KB: 0.512,         // ℃·kg/mol, 물의 몰랄 오름 상수      [#34]
    KF: 1.86,          // ℃·kg/mol, 물의 몰랄 내림 상수      [#37, #39]
    MW_W: 18.015,
    MW_NACL: 58.44,
    MW_SUC: 342.3,
    NACL_SAT: 6.1,     // mol/kg, 20℃ 근처 NaCl 포화 몰랄농도
    EUTECTIC: -21.1,   // ℃, NaCl-물 공융점
    C_W: 4.18,         // J/(g·K) 물의 비열                 [#25]
    C_ICE: 2.1,        // J/(g·K) 얼음의 비열
    LF: 334,           // J/g 얼음의 융해열                  [#21]
    PBURST: 3.0,       // atm, 장치가 견디는 한계압력
  };

  // 포화 증기압(atm): 클라우지우스–클라페이롱 식, 100℃에서 1 atm 기준      [#19, #20]
  C.pStar = (Tc) => Math.exp(-(C.DHVAP / C.Rj) * (1 / (Tc + 273.15) - 1 / C.TB0));

  // 용매(물)의 몰분율 x_w. w: 물의 질량(g), np: 용해된 입자의 총 몰수(mol)   [#12]
  C.xw = (w, np) => { const nw = w / C.MW_W; return nw / (nw + np); };

  // 용액의 증기압 = x_w · P*(T)  (라울의 법칙, 비휘발성 용질)              [#4 연결, #30]
  C.pSol = (Tc, xw) => xw * C.pStar(Tc);

  // 외부 압력 P(atm)에서 용액의 끓는점(℃): x_w·P*(Tb) = P 를 Tb에 대해 푼 해   [#5, #7, #34]
  C.tb = (P, xw = 1) => 1 / (1 / C.TB0 - (C.Rj * Math.log(P / xw)) / C.DHVAP) - 273.15;

  // 묽은 용액의 근사식 ΔTb = i·Kb·m (검산용)                               [#31, #34]
  C.dTbApprox = (i, m) => i * C.KB * m;

  // 몰랄농도 m = 용질 mol / 용매 kg                                         [#31]
  C.molality = (nSolute, wGram) => nSolute / (wGram / 1000);

  // 소금-얼음 한제의 평형 온도(℃). ΔTf = i·Kf·m, 공융점에서 하한                [#39]
  C.coolTemp = (iceG, saltG, i = 2) => {
    if (iceG <= 0 || saltG <= 0) return 0;
    const m = saltG / C.MW_NACL / (iceG / 1000);
    return Math.max(-i * C.KF * m, C.EUTECTIC);
  };

  // 소금 s(g)가 기온 T(℃, 0 미만)의 얼음을 녹이는 양(g).                       [#37, #39, #21]
  // 평형: 녹은 물의 몰랄농도가 m_eq = |T|/(i·Kf)가 될 때까지 얼음이 녹는다 → 녹은 물 w = n_소금/m_eq.
  // 공융점 이하(T ≤ −21.1 ℃)에서는 소금물이 얼음과 평형을 이룰 수 없어 0. iceG를 주면 그 질량을 넘지 못한다.
  C.iceMeltBySalt = (Tc, saltG, iceG = Infinity, i = 2) => {
    if (!(Tc < 0) || Tc <= C.EUTECTIC || saltG <= 0) return 0;
    const meq = -Tc / (i * C.KF);
    return Math.min(saltG / C.MW_NACL / meq * 1000, iceG);
  };
  // 위의 역: 얼음 iceG(g)를 모두 녹이는 데 필요한 소금(g). 불가능(T ≥ 0 또는 공융점 이하)하면 Infinity
  C.saltForMelt = (Tc, iceG, i = 2) => {
    if (!(Tc < 0) || Tc <= C.EUTECTIC) return Infinity;
    return iceG / 1000 * (-Tc / (i * C.KF)) * C.MW_NACL;
  };
  // 열 Q(J)가 녹이는 얼음 질량(g) = Q / 융해열 (0 ℃ 얼음 기준)                  [#21]
  C.iceMeltByHeat = (QJ) => Math.max(0, QJ) / C.LF;

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

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.Chem = C;
})(typeof window !== 'undefined' ? window : globalThis);
