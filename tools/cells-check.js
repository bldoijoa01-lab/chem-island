// 칸 시뮬 코어 검증(18단계, DESIGN.md §4-28): cells.js + chem.js 식 A(열 전도)·B(기체 확산)·C(밀도층). 브라우저 없이 Node만 쓴다.
// 사용: node tools/cells-check.js   (모두 통과하면 종료 코드 0)
const fs = require('fs'), path = require('path');
const C = require('../chem.js'), Cells = require('../cells.js');
const { Grid, KIND } = Cells;
let fail = 0, total = 0;
const ok = (name, cond, extra = '') => { total++; if (cond) console.log('PASS ' + name); else { fail++; console.log('FAIL ' + name + (extra ? '  [' + extra + ']' : '')); } };
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
const air = (P, T, mix) => Cells.airMoles(P, T, mix);
const O2 = { O2: 1 }, HE = { He: 1 }, N2 = { N2: 1 };
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);   // 시험용 결정적 난수(cells.js는 난수를 쓰지 않는다)
const minmaxT = (g, onlyHeld) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < g.N; i++) { if (Cells.PROP[g.kind[i]].fixed) continue; if (Cells.PROP[g.kind[i]].open && g.nTot(i) === 0) continue; lo = Math.min(lo, g.T[i]); hi = Math.max(hi, g.T[i]); } return [lo, hi]; };

// ---------- 식 단위 점검 (chem.js) ----------
{
  const Ca = 1000, Cb = 3000, K = 5, dt = 1e6, Q = C.heatFlow(K, 100, 20, dt, Ca, Cb), Qeq = Ca * Cb / (Ca + Cb) * 80;
  ok('A 식: 열은 뜨거운 쪽 → 찬 쪽(부호), 한 걸음 열량은 평형 열량의 0.2배로 잘림', Q > 0 && Math.abs(Q - 0.2 * Qeq) < 1e-9 && C.heatFlow(K, 20, 100, dt, Cb, Ca) === -Q, `Q=${Q}, 0.2·Qeq=${0.2 * Qeq}`);
  ok('A 식: 작은 dt에서는 잘리지 않고 K·ΔT·dt 그대로, ΔT = 0이거나 열용량 0이면 0', Math.abs(C.heatFlow(K, 100, 20, 1e-3, Ca, Cb) - K * 80 * 1e-3) < 1e-12 && C.heatFlow(K, 5, 5, 10, Ca, Cb) === 0 && C.heatFlow(K, 100, 20, 10, 0, Cb) === 0 && C.heatFlow(K, 100, 20, 10, Ca, 0) === 0);
  ok('A 식: 고정 칸(열용량 ∞)은 상대 칸의 열용량으로 잘리고, 둘 다 고정이면 0, NaN 없음', Math.abs(C.heatFlow(K, 100, 20, 1e9, Infinity, Cb) - 0.2 * Cb * 80) < 1e-6 && C.heatFlow(K, 100, 20, 1e9, Infinity, Infinity) === 0);
  ok('A 식: 전도도 K = L_CELL × 조화 평균, 대칭, 0 이하면 0', Math.abs(C.condK(2.5, 0.026) - C.L_CELL * 2 * 2.5 * 0.026 / 2.526) < 1e-12 && C.condK(2.5, 0.026) === C.condK(0.026, 2.5) && C.condK(0, 1) === 0);
  const f = C.diffFlow(1, 0, 4, 20, 20, 1), g = C.diffFlow(0, 1, 4, 20, 20, 1);
  ok('B 식: 분압이 높은 쪽 → 낮은 쪽(부호), 반대 방향은 같은 크기 반대 부호, 분압 같으면 0', f > 0 && g === -f && C.diffFlow(0.5, 0.5, 4, 20, 90, 100) === 0);
  ok('B 식: 큰 dt에서도 한 걸음 이동량이 분압 평형 몰수 x_eq의 0.2배 이하, x_eq는 주는 칸의 몰수보다 작다', (() => { const Pa = 2, Pb = 0, xeq = (Pa - Pb) * C.V_CELL / (C.R * (293.15 + 293.15)), big = C.diffFlow(Pa, Pb, 4, 20, 20, 1e12); const nA = C.partial; return Math.abs(big - 0.2 * xeq) < 1e-9 && xeq < Pa * C.V_CELL / (C.R * 293.15); })());
  ok('C 식: ρ = P·M̄/(R·T): 1 atm·20 ℃ 공기 ≈ 1.20 g/L, He ≈ 0.166 g/L, 같은 T·P에서 O₂가 He보다 무겁다', Math.abs(C.gasDensity(1, 0.7885 * 28 + 0.2115 * 32, 20) - 1.200) < 0.01 && Math.abs(C.gasDensity(1, 4, 20) - 0.1664) < 0.002 && C.gasDensity(1, 32, 20) > C.gasDensity(1, 4, 20) && C.gasDensity(1, 29, 100) < C.gasDensity(1, 29, 0));
  ok('C 식: 위 칸이 더 가벼우면(안정) 0, 더 무거우면 양수이고 FLOW_MAX(0.2)를 넘지 않는다', C.layerFrac(0.2, 1, 10) === 0 && C.layerFrac(1, 1, 10) === 0 && C.layerFrac(1.2, 0.2, 1e9) <= C.FLOW_MAX && C.layerFrac(1.2, 0.2, 1e9) > 0 && C.layerFrac(1.2, 0.2, 1) < C.layerFrac(1.2, 0.2, 1e9));
}

// ⑬ 단위 확인: 100 L, 1 atm, 20 ℃ 공기
{
  const g = new Grid(1, 1); g.set(0, 0, 'AIR', 20, air(1, 20));
  let sp = 0; for (const gas of C.GASES) sp += g.partial(0, gas);
  ok('⑬ 100 L·1 atm·20 ℃ 공기 = 4.16 mol(표의 약 4.2 mol)이고 분압의 합 = 전체 압력 = 1 atm, n·R·T = P·V', Math.abs(g.nTot(0) - 4.16) < 0.01 && Math.abs(g.nTot(0) - 4.2) < 0.1 && Math.abs(sp - 1) < 1e-12 && Math.abs(g.pressure(0) - 1) < 1e-12 && Math.abs(g.nTot(0) * C.R * 293.15 - 1 * C.V_CELL) < 1e-9, `n=${g.nTot(0)}, P=${g.pressure(0)}`);
  ok('⑬ 공기 밀도 ρ ≈ 1.20 g/L, 열용량 > 0, 평균 몰 질량 28.8~28.9 g/mol', Math.abs(g.density(0) - 1.2) < 0.01 && g.cap(0) > 0 && g.meanMass(0) > 28.8 && g.meanMass(0) < 28.9, `ρ=${g.density(0)}, M=${g.meanMass(0)}`);
  ok('⑬ 칸 한 변 0.464 m, 암석 한 칸 열용량 226.8 kJ/K, 암석–암석 전도도 1.16 W/K', Math.abs(C.L_CELL - 0.4642) < 1e-3 && Math.abs(C.solidHeatCap('ROCK') - 226800) < 1 && Math.abs(C.condK(2.5, 2.5) - 1.1605) < 1e-3);
}

// ① 닫힌 방: 고체·기체·확산·층이 모두 켜진 상태에서 에너지·몰수 보존
{
  const g = new Grid(8, 6);
  g.fill(0, 0, 8, 6, 'ROCK', 12);
  g.fill(1, 1, 6, 4, 'AIR', 20, air(1, 20));
  g.fill(1, 1, 3, 2, 'AIR', 90, air(1, 90, { N2: 0.5, O2: 0.2, He: 0.3 }));     // 뜨거운 구석 + 헬륨 섞인 조성
  g.fill(5, 3, 2, 2, 'AIR', -10, air(2, -10, O2));                              // 차갑고 무거운 O₂ 주머니
  g.set(4, 5, 'METAL', 60); g.set(0, 2, 'SAND', 5); g.set(7, 4, 'ICE', -5); g.set(3, 3, 'WATER', 15);
  const E0 = g.energy(), n0 = {}; for (const x of C.GASES) n0[x] = g.moles(x);
  let maxDrift = 0; for (let s = 0; s < 400; s++) { g.step(50); maxDrift = Math.max(maxDrift, rel(g.energy(), E0)); }
  ok('① 닫힌 방(고체 + 기체, 확산·층 포함) 400걸음 동안 에너지 합 Σ C·T 보존', maxDrift < 1e-9, `최대 상대 오차 ${maxDrift.toExponential(2)}`);
  let nd = 0; for (const x of C.GASES) nd = Math.max(nd, n0[x] === 0 ? Math.abs(g.moles(x)) : rel(g.moles(x), n0[x]));
  ok('① 기체 종류별 몰수도 보존', nd < 1e-9, `최대 상대 오차 ${nd.toExponential(2)}`);
}

// ② 평형 온도
{
  const g = new Grid(2, 1); g.set(0, 0, 'ROCK', 80); g.set(1, 0, 'METAL', 10);
  const Cr = C.solidHeatCap('ROCK'), Cm = C.solidHeatCap('METAL'), Teq = (Cr * 80 + Cm * 10) / (Cr + Cm);
  g.run(1e5, 300);
  ok('② 암석(80 ℃)과 철(10 ℃) 평형 온도 = (m₁c₁T₁ + m₂c₂T₂)/(m₁c₁ + m₂c₂)', Math.abs(g.T[0] - Teq) < 1e-6 && Math.abs(g.T[1] - Teq) < 1e-6, `칸 ${g.T[0]}, ${g.T[1]} / 식 ${Teq}`);
  const w = new Grid(2, 1); w.set(0, 0, 'WATER', 30); w.set(1, 0, 'WATER', 70); w.run(1e5, 300);
  const m = C.MATERIAL.WATER.rho * C.V_CELL * 1000, old = C.mixT(m, 30, m, 70);
  ok('② 물 두 칸의 평형 온도는 기존 열량 계산(Chem.mixT)과 같다(50 ℃)', Math.abs(w.T[0] - old) < 1e-6 && Math.abs(w.T[1] - old) < 1e-6 && Math.abs(old - 50) < 1e-12, `칸 ${w.T[0]}, mixT ${old}`);
  const lowc = new Grid(2, 1); lowc.set(0, 0, 'METAL', 100); lowc.set(1, 0, 'WATER', 20); lowc.run(1e5, 300);
  const cm = C.solidHeatCap('METAL'), cw = C.solidHeatCap('WATER'), te = (cm * 100 + cw * 20) / (cm + cw);
  ok('② 비열이 낮은 철(#27)과 물: 평형은 열용량 가중 평균(철 100 ℃ + 물 20 ℃ → ' + te.toFixed(2) + ' ℃), 비열이 큰 물 쪽이 덜 변함', Math.abs(lowc.T[0] - te) < 1e-6 && (te - 20) < (100 - te));
}

// ③ 칸막이를 열면 두 방 압력이 같아진다
{
  const g = new Grid(7, 1);
  g.fill(0, 0, 3, 1, 'AIR', 20, air(2, 20)); g.set(3, 0, 'ROCK', 20); g.fill(4, 0, 3, 1, 'AIR', 20, air(1, 20));
  const n0 = g.moles(); g.run(1e3, 300);
  ok('③ 칸막이(암석) 동안에는 두 방 압력 차가 그대로(기체가 못 지나감)', Math.abs(g.pressure(0) - 2) < 1e-9 && Math.abs(g.pressure(6) - 1) < 1e-9);
  g.set(3, 0, 'AIR', 20);                                                       // 칸막이를 열어 빈 칸으로 바꿈
  let k = 0; for (; k < 20000; k++) { g.step(1e3); let lo = Infinity, hi = -Infinity; for (let i = 0; i < 7; i++) { const p = g.pressure(i); lo = Math.min(lo, p); hi = Math.max(hi, p); } if ((hi - lo) / hi < 1e-3) break; }
  const ps = [...Array(7).keys()].map(i => g.pressure(i)), lo = Math.min(...ps), hi = Math.max(...ps);
  ok('③ 칸막이를 열면 일곱 칸 압력이 0.1 % 안으로 같아지고 총 몰수 보존, 같은 T라 압력 = 9/7 atm', (hi - lo) / hi < 1e-3 && rel(g.moles(), n0) < 1e-9 && Math.abs(g.pressure(0) - 9 / 7) < 0.01, `걸음 ${k}, 압력 ${lo.toFixed(4)}~${hi.toFixed(4)}, 몰수 오차 ${rel(g.moles(), n0).toExponential(2)}`);
}

// ④ 그레이엄: He 대 O₂ 확산 속도 비
{
  const move = (mix) => { const g = new Grid(2, 1); g.set(0, 0, 'AIR', 20, air(1, 20, mix)); g.set(1, 0, 'AIR', 20); g.opts.layers = false; g.opts.conduction = false; g.step(1); return g.nTot(1); };
  const rHe = move(HE), rO2 = move(O2), rN2 = move(N2), want = Math.sqrt(32 / 4), got = rHe / rO2;
  ok('④ 같은 T·분압에서 He가 O₂보다 √(32/4) = 2.83배 빨리 확산(오차 10 % 이내)', Math.abs(got - want) / want < 0.10, `He/O₂ = ${got.toFixed(3)} (이론 ${want.toFixed(3)})`);
  ok('④ N₂ 대 O₂ 비 √(32/28), 가벼운 기체일수록 빠름(He > N₂ > O₂)', Math.abs(rN2 / rO2 - Math.sqrt(32 / 28)) < 0.02 && rHe > rN2 && rN2 > rO2, `N₂/O₂ = ${(rN2 / rO2).toFixed(4)}`);
}

// ⑤ 밀도층
{
  const col = (up, low, tUp = 20, tLow = 20, layers = true) => { const g = new Grid(1, 2); g.set(0, 0, 'AIR', tUp, air(1, tUp, up)); g.set(0, 1, 'AIR', tLow, air(1, tLow, low)); g.opts.layers = layers; return g; };
  const frac = (g, i, gas) => g.partial(i, gas) / g.pressure(i);
  const on = col(O2, HE), off = col(O2, HE, 20, 20, false); on.run(20, 40); off.run(20, 40);
  ok('⑤ 위 O₂·아래 He(같은 T·P): 층 규칙을 켜면 O₂가 내려가고 He가 올라가 확산만 있을 때보다 더 많이 자리를 바꾼다', frac(on, 1, 'O2') > frac(off, 1, 'O2') && frac(on, 0, 'He') > frac(off, 0, 'He') && frac(on, 1, 'O2') > 0 && frac(on, 0, 'He') > 0, `아래 O₂ 분율 켬 ${frac(on, 1, 'O2').toFixed(3)} / 끔 ${frac(off, 1, 'O2').toFixed(3)}`);
  const s1 = col(HE, O2), s2 = col(HE, O2, 20, 20, false); s1.run(20, 40); s2.run(20, 40);
  const a = s1.state(), b = s2.state();
  ok('⑤ 이미 안정한 배열(위 He·아래 O₂)에서는 층 규칙이 아무것도 바꾸지 않는다(켠 것과 끈 것이 비트까지 같음)', Buffer.compare(Buffer.from(a.n.buffer), Buffer.from(b.n.buffer)) === 0 && Buffer.compare(Buffer.from(a.T.buffer), Buffer.from(b.T.buffer)) === 0);
  const hot = col(N2, N2, 0, 100), hot0 = col(N2, N2, 0, 100, false); hot.opts.conduction = false; hot0.opts.conduction = false; hot.run(20, 40); hot0.run(20, 40);
  ok('⑤ 같은 기체에서 뜨거운 쪽이 아래이면(위가 더 무거움) 뜨거운 공기가 위로: 층 규칙을 켜면 위 칸이 데워진다(전도 끔)', hot.T[0] > hot0.T[0] + 1 && hot.T[1] < hot0.T[1], `위 칸 켬 ${hot.T[0].toFixed(2)} / 끔 ${hot0.T[0].toFixed(2)} ℃`);
  const cold = col(N2, N2, 100, 0); cold.opts.conduction = false; const c0 = cold.state(); cold.run(20, 40);
  ok('⑤ 뜨거운 칸이 위, 찬 칸이 아래(안정)이면 층 규칙으로 온도가 바뀌지 않는다', cold.T[0] === c0.T[0] && cold.T[1] === c0.T[1]);
}

// ⑥ 불을 끈 뒤 방 온도가 외기 쪽으로 단조 감소
{
  const g = new Grid(7, 3);
  g.fill(0, 0, 7, 3, 'ROCK', 20); g.fill(0, 0, 1, 3, 'SKY', 20, air(1, 20)); g.fill(6, 0, 1, 3, 'SKY', 20, air(1, 20));
  g.fill(2, 0, 3, 3, 'AIR', 20, air(1, 20)); g.set(3, 1, 'SOURCE', 150);
  g.run(30, 300);
  const warm = minmaxT(g)[1];
  g.set(3, 1, 'METAL', 150);                                                    // 불을 끔: 열원이 같은 온도의 금속 칸이 된다
  const hi0 = minmaxT(g)[1]; let mono = true, prev = hi0, floorOk = true, eAbove = []; const amb = 20;
  for (let s = 0; s < 800; s++) { g.step(30); const [lo, hi] = minmaxT(g); if (hi > prev + 1e-9) mono = false; prev = hi; if (lo < amb - 1e-9) floorOk = false; if (s % 200 === 0) eAbove.push(g.energy()); }
  ok('⑥ 열원을 켜서 방이 데워졌다(최고 온도 > 외기)', warm > 21, `최고 ${warm.toFixed(2)} ℃`);
  ok('⑥ 불을 끈 뒤 방의 최고 온도가 매 걸음 증가하지 않고(단조 감소) 외기(20 ℃)보다 낮아지지 않는다', mono && floorOk, `단조 ${mono}, 외기 아래로 내려감 ${!floorOk}`);
  ok('⑥ 800걸음 뒤 최고 온도가 처음보다 낮고 방 열에너지(Σ C·T)가 줄어든다', prev < hi0 && eAbove[eAbove.length - 1] < eAbove[0], `최고 ${hi0.toFixed(2)} → ${prev.toFixed(2)} ℃`);
}

// ⑦ 열용량이 매우 다른 칸, 진공
{
  const g = new Grid(4, 1); g.set(0, 0, 'METAL', 100); g.set(1, 0, 'AIR', 0, { N2: 1e-6 }); g.set(2, 0, 'AIR', -50); g.set(3, 0, 'ROCK', 20);
  const E0 = g.energy(); let bad = '', lo = -50, hi = 100;
  for (const dt of [1e3, 1e6, 1e9, 1e12]) for (let s = 0; s < 100; s++) {
    g.step(dt);
    for (let i = 0; i < 4; i++) { if (!Number.isFinite(g.T[i]) || (PROP(g, i).open && g.nTot(i) > 0 && (g.T[i] < lo - 1e-9 || g.T[i] > hi + 1e-9)) || (!PROP(g, i).open && (g.T[i] < lo - 1e-9 || g.T[i] > hi + 1e-9))) bad = `칸 ${i} T=${g.T[i]} dt=${dt}`; for (const gas of C.GASES) { const v = g.n[i * C.GASES.length + C.GASES.indexOf(gas)]; if (!(v >= 0) || !Number.isFinite(v)) bad = `칸 ${i} ${gas}=${v}`; } }
  }
  ok('⑦ 철 ↔ 기체 1e-6 mol ↔ 진공 ↔ 암석을 dt = 1e3~1e12로 오래 돌려도 NaN·음수·온도 오버슈트 없음', bad === '', bad);
  ok('⑦ 그 동안에도 에너지 합이 보존된다', rel(g.energy(), E0) < 1e-9, `오차 ${rel(g.energy(), E0).toExponential(2)}`);
  const v = new Grid(2, 1); v.set(0, 0, 'AIR', 80, air(1, 80, N2)); v.set(1, 0, 'AIR', -50); v.opts.layers = false; v.run(1e3, 400);
  ok('⑦ 진공 칸이 받은 기체는 주는 칸과 같은 온도에서 시작해(열용량 가중 평균) 두 칸이 같은 온도·압력으로 수렴(진공의 처음 온도는 영향 없음)', Math.abs(v.T[0] - 80) < 1e-6 && Math.abs(v.T[1] - 80) < 1e-6 && rel(v.pressure(0), v.pressure(1)) < 1e-3, `T ${v.T[0].toFixed(4)}, ${v.T[1].toFixed(4)}`);
}
function PROP(g, i) { return Cells.PROP[g.kind[i]]; }

// ⑧ 한 칸에서 4방향으로 동시에 빠져나가도 몰수가 음수가 되지 않는다
{
  const g = new Grid(3, 3); g.fill(0, 0, 3, 3, 'ROCK', 20); g.fill(1, 0, 1, 3, 'AIR', 20); g.fill(0, 1, 3, 1, 'AIR', 20);
  g.set(1, 1, 'AIR', 20, air(10, 20, { N2: 0.5, O2: 0.3, He: 0.2 }));
  const n0 = g.moles(), c0 = {}; for (const x of C.GASES) c0[x] = g.n[g.idx(1, 1) * C.GASES.length + C.GASES.indexOf(x)];
  g.opts.layers = false; g.opts.conduction = false; g.step(1e9);
  let minRatio = Infinity; for (const x of C.GASES) if (c0[x] > 0) minRatio = Math.min(minRatio, g.n[g.idx(1, 1) * C.GASES.length + C.GASES.indexOf(x)] / c0[x]);
  ok('⑧ 가운데 칸이 4방향 빈 칸으로 한 걸음(dt = 1e9)에 빠져나가도 남은 몰수 ≥ 20 %(유출 ≤ 0.8)이고 음수 없음', minRatio >= 0.2 - 1e-9 && minRatio <= 1 && g.moles() > 0, `남은 비율 ${minRatio.toFixed(4)}`);
  g.opts.layers = true; g.opts.conduction = true; let neg = false; for (let s = 0; s < 500; s++) { g.step(1e9); for (let k = 0; k < g.n.length; k++) if (!(g.n[k] >= 0)) neg = true; }
  ok('⑧ 계속 돌려도 몰수는 음수가 되지 않고 총 몰수 보존', !neg && rel(g.moles(), n0) < 1e-9, `오차 ${rel(g.moles(), n0).toExponential(2)}`);
}

// ⑨ 온도가 다른 두 칸 사이 확산: 총 몰수와 총 열에너지(내부 에너지)가 함께 보존
{
  const mk = () => { const g = new Grid(2, 1); g.set(0, 0, 'AIR', 0, air(1.5, 0, { N2: 0.6, He: 0.4 })); g.set(1, 0, 'AIR', 100, air(0.5, 100, { N2: 0.3, O2: 0.7 })); return g; };
  const g = mk(); g.opts.conduction = false; g.opts.layers = false;
  const E0 = g.energy(), n0 = g.moles(), by = {}; for (const x of C.GASES) by[x] = g.moles(x);
  let eD = 0, nD = 0; for (let s = 0; s < 300; s++) { g.step(200); eD = Math.max(eD, rel(g.energy(), E0)); nD = Math.max(nD, rel(g.moles(), n0)); }
  let spec = 0; for (const x of C.GASES) spec = Math.max(spec, by[x] === 0 ? Math.abs(g.moles(x)) : rel(g.moles(x), by[x]));
  ok('⑨ 온도가 다른 두 칸(0 ℃ / 100 ℃) 사이 확산에서 총 몰수와 총 내부 에너지가 동시에 보존(전도 끔)', eD < 1e-12 && nD < 1e-12 && spec < 1e-12, `에너지 ${eD.toExponential(2)}, 몰수 ${nD.toExponential(2)}, 종류별 ${spec.toExponential(2)}`);
  const h = mk(); const hE = h.energy(); h.run(200, 300);
  ok('⑨ 전도·층까지 모두 켜도 보존되고, 두 칸이 같은 온도·같은 압력으로 수렴(받은 기체는 열용량 가중 평균 온도)', rel(h.energy(), hE) < 1e-9 && Math.abs(h.T[0] - h.T[1]) < 1e-3 && rel(h.pressure(0), h.pressure(1)) < 1e-3, `T ${h.T[0].toFixed(3)}, ${h.T[1].toFixed(3)}`);
  const m = new Grid(2, 1); m.set(0, 0, 'AIR', 100, air(1, 100, N2)); m.set(1, 0, 'AIR', 0, air(1, 0, N2)); m.opts.conduction = false; m.opts.layers = false;
  const nA = m.nTot(0), nB = m.nTot(1), Ta = 100, Tb = 0; m.step(1); const dn = m.nTot(1) - nB, Tmix = (nB * Tb + dn * Ta) / (nB + dn);
  ok('⑨ 받는 칸의 온도 = (원래 몰수·온도와 들어온 몰수·주는 칸 온도의 열용량 가중 평균)(같은 기체라 Cv가 같다)', Math.abs(m.T[1] - Tmix) < 1e-6 && Math.abs(m.T[0] - 100) < 1e-9, `칸 ${m.T[1]} / 식 ${Tmix}`);
}

// ⑩ 유입을 멈추고 오래 돌리면 층이 사라지고 균일하게 수렴
{
  const g = new Grid(1, 6);
  for (let y = 0; y < 3; y++) g.set(0, y, 'AIR', 20, air(1, 20, O2)); for (let y = 3; y < 6; y++) g.set(0, y, 'AIR', 20, air(1, 20, HE));
  const n0 = g.moles(); let early = null, k = 0, spread = Infinity;
  for (; k < 30000; k++) {
    g.step(100);
    if (k === 20) early = [0, 1, 2].reduce((s, y) => s + g.partial(5 - y, 'O2') / g.pressure(5 - y), 0) / 3;   // 아래 세 칸의 O₂ 분율(초기 0)
    const x = [...Array(6).keys()].map(i => g.partial(i, 'O2') / g.pressure(i)), p = [...Array(6).keys()].map(i => g.pressure(i));
    spread = Math.max(Math.max(...x) - Math.min(...x), (Math.max(...p) - Math.min(...p)) / Math.max(...p));
    if (spread < 1e-3) break;
  }
  ok('⑩ 초기에는 무거운 O₂가 아래로 내려온다(층 규칙, 20걸음 뒤 아래 칸에 O₂가 생김)', early > 0, `20걸음 뒤 아래 세 칸 O₂ 분율 평균 ${early && early.toFixed(4)}`);
  ok('⑩ 오래 돌리면 층이 사라지고 여섯 칸의 조성·압력이 0.1 % 안으로 균일(O₂ 분율 0.5), 총 몰수 보존', spread < 1e-3 && Math.abs(g.partial(0, 'O2') / g.pressure(0) - 0.5) < 2e-3 && rel(g.moles(), n0) < 1e-9, `${k}걸음, 차이 ${spread.toExponential(2)}`);
}

// ⑪ 안정 조건 강제
{
  ok('⑪ 안정 조건: Chem.FLOW_MAX ≤ 0.2', C.FLOW_MAX <= 0.2 && C.FLOW_MAX > 0);
  const g = new Grid(2, 2); let thrown = 0; for (const bad of [0, -1, NaN, Infinity, undefined]) { try { g.step(bad); } catch (e) { thrown++; } }
  ok('⑪ dt가 유한한 양수가 아니면(0·음수·NaN·∞·없음) 거부', thrown === 5);
  seed = 777; let worst = '', lo0 = Infinity, hi0 = -Infinity;
  const mkRand = () => { const r = new Grid(10, 10); for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const v = rnd(); if (v < 0.25) { const kinds = ['ROCK', 'DIRT', 'SAND', 'ICE', 'METAL', 'WATER']; r.set(x, y, kinds[Math.floor(rnd() * 6)], -40 + rnd() * 140); } else { const t = -40 + rnd() * 140, mix = { N2: rnd(), O2: rnd(), He: rnd(), H2O: rnd() }; r.set(x, y, 'AIR', t, air(0.2 + rnd() * 3, t, mix)); } } return r; };
  for (const dt of [1, 1e2, 1e4, 1e6, 1e8]) {
    const r = mkRand(); const [l0, h0] = minmaxT(r); lo0 = l0; hi0 = h0; let prevLo = l0, prevHi = h0;
    try {
      for (let s = 0; s < 60; s++) { r.step(dt); const [l, h] = minmaxT(r); if (!Number.isFinite(l) || !Number.isFinite(h)) worst = `NaN dt=${dt}`; if (h > prevHi + 1e-9) worst = `최고 온도 증가 dt=${dt} ${prevHi}→${h}`; if (l < prevLo - 1e-9) worst = `최저 온도 감소 dt=${dt} ${prevLo}→${l}`; prevHi = h; prevLo = l; }
    } catch (e) { worst = e.message; }
  }
  ok('⑪ 무작위 10×10 칸(고체·기체 섞임)을 dt = 1~1e8로 60걸음씩 돌려도 NaN 없고, 최고 온도는 늘지 않고 최저 온도는 줄지 않는다(오버슈트 없음), 몰수 음수 없음', worst === '', worst);
}

// ⑫ 결정성과 모듈 규칙
{
  const mk = () => { seed = 4242; const r = new Grid(8, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { if (rnd() < 0.3) r.set(x, y, 'ROCK', 10 + rnd() * 50); else { const t = rnd() * 80, mix = { N2: rnd(), O2: rnd(), He: rnd() }; r.set(x, y, 'AIR', t, air(0.5 + rnd() * 2, t, mix)); } } return r; };
  const a = mk(), b = mk(); a.run(75, 120); b.run(75, 120);
  const sa = a.state(), sb = b.state();
  ok('⑫ 같은 입력을 두 번 돌리면 모든 칸 종류·온도·몰수가 비트까지 같다(난수 없음)', Buffer.compare(Buffer.from(sa.T.buffer), Buffer.from(sb.T.buffer)) === 0 && Buffer.compare(Buffer.from(sa.n.buffer), Buffer.from(sb.n.buffer)) === 0 && Buffer.compare(Buffer.from(sa.kind.buffer), Buffer.from(sb.kind.buffer)) === 0);
  const src = fs.readFileSync(path.join(__dirname, '..', 'cells.js'), 'utf8').replace(/\/\/.*$/gm, '');
  ok('⑫ cells.js는 DOM·window·난수·네트워크를 쓰지 않고(주석 제외) 화학 식을 직접 쓰지 않는다(Chem만 호출)', !/Math\.random|document\.|window\.|fetch\(|localStorage|XMLHttpRequest/.test(src) && !/Math\.sqrt|Math\.exp|Math\.log|\*\*\s*\(?1\s*\/\s*3/.test(src));
}

// 19단계 보강 ⑭: 온도 차가 1e-9 K인 두 칸은 오버슈트·진동 없이 단조 수렴한다 (Argon 18단계 지적, 사용자 확인)
{
  const run = (mkA, mkB, label, tol = 1e-15) => {   // tol: 부동소수점 반올림 한계(고체는 온도를 직접 갱신해 1e-15 K, 기체는 E/C−273.15라 약 1e-12 K)
    const g = new Grid(2, 1); mkA(g); mkB(g);
    const E0 = g.energy(); let d = g.T[0] - g.T[1], d0 = d, mono = true, noCross = true, prev = d, hot = g.T[0], cold = g.T[1];
    for (let k = 0; k < 300; k++) {
      g.step(1e5); const dd = g.T[0] - g.T[1];
      if (dd > prev + tol) mono = false;                       // 차이는 늘지 않는다(진동 없음)
      if (dd < -tol) noCross = false;                          // 온도 순서가 뒤집히지 않는다(오버슈트 없음)
      if (g.T[0] > hot + tol || g.T[1] < cold - tol) mono = false;   // 뜨거운 쪽은 오르지 않고 찬 쪽은 내리지 않는다
      hot = g.T[0]; cold = g.T[1]; prev = dd; d = dd;
    }
    ok('⑭ ' + label + ': 온도 차 1e-9 K가 오버슈트·진동 없이 단조 수렴(처음 ' + d0.toExponential(2) + ' → ' + d.toExponential(2) + ' K), 에너지 보존', mono && noCross && Math.abs(d) <= Math.abs(d0) + tol && rel(g.energy(), E0) < 1e-12 && Number.isFinite(g.T[0]) && Number.isFinite(g.T[1]), 'mono ' + mono + ' noCross ' + noCross + ' diff ' + d);
  };
  run(g => g.set(0, 0, 'ROCK', 20 + 1e-9), g => g.set(1, 0, 'ROCK', 20), '고체(암석 두 칸)');
  run(g => g.set(0, 0, 'METAL', 20 + 1e-9), g => g.set(1, 0, 'WATER', 20), '열용량이 다른 고체(철–물)');
  run(g => g.set(0, 0, 'AIR', 20 + 1e-9, air(1, 20 + 1e-9)), g => g.set(1, 0, 'AIR', 20, air(1, 20)), '기체 칸 두 칸(반올림 한계 1e-12 K 안)', 1e-12);
  const gg = new Grid(2, 1); gg.set(0, 0, 'AIR', 20 + 1e-9, air(1, 20 + 1e-9)); gg.set(1, 0, 'AIR', 20, air(1, 20)); const n0 = gg.moles(); gg.run(1e5, 300);
  ok('⑭ 기체 두 칸(1e-9 K 차)에서 확산·층을 포함해도 몰수 보존, 두 칸의 압력 차가 늘지 않음', rel(gg.moles(), n0) < 1e-12 && Math.abs(gg.pressure(0) - gg.pressure(1)) < 1e-9);
}

// 19단계 ⑮: 땅 파기·블록 놓기 편집은 기체 몰수·내부 에너지를 보존하고 변한 양을 장부에 남긴다 (DESIGN §4-29)
{
  const room = () => { const g = new Grid(7, 3); g.fill(0, 0, 7, 3, 'ROCK', 20); g.fill(1, 1, 5, 1, 'AIR', 20, air(1, 20)); return g; };
  // 기체 칸 → 고체(블록 놓기): 열린 이웃 두 칸에 나눠 옮김
  let g = room(), n0 = g.moles(), E0 = g.energy(); const r = g.solidify(3, 1, 'ROCK');
  ok('⑮ 블록 놓기: 가운데 기체 칸이 고체가 되면 기체 몰수가 보존되고(이웃 2칸에 분배) 방출 없음', rel(g.moles(), n0) < 1e-12 && r.receivers === 2 && r.lostMoles === 0 && r.dMoles === 0 && g.released.moles === 0, JSON.stringify(r));
  ok('⑮ 블록 놓기: 총 에너지 변화 = 장부의 고체 에너지 증가(기체의 내부 에너지는 이웃으로 옮겨져 보존)', Math.abs((g.energy() - E0) - r.dSolidE) < 1e-6 * E0, `${g.energy() - E0} / ${r.dSolidE}`);
  ok('⑮ 이웃 두 칸의 압력이 높아진다(같은 몰수가 더 작은 부피에)', g.pressure(g.idx(2, 1)) > 1.2 && g.pressure(g.idx(4, 1)) > 1.2, 'P=' + g.pressure(g.idx(2, 1)).toFixed(3));
  // 갇힌 한 칸(열린 이웃 없음)을 고체로: 외기 방출 장부
  g = new Grid(3, 3); g.fill(0, 0, 3, 3, 'ROCK', 20); g.set(1, 1, 'AIR', 20, air(1, 20));
  n0 = g.moles(); E0 = g.energy(); const t = g.solidify(1, 1, 'ROCK');
  ok('⑮ 갇힌 한 칸을 고체로 만들면 기체가 외기로 방출되고(몰수 4.16 mol) 방출 장부·기록에 남는다', Math.abs(t.lostMoles - n0) < 1e-12 && Math.abs(g.released.moles - n0) < 1e-12 && Math.abs(g.moles()) < 1e-12 && t.dMoles === -n0 && t.lostE > 0 && Math.abs(g.released.energy - t.lostE) < 1e-9, JSON.stringify(t));
  ok('⑮ 방출 때 에너지 변화 = 고체 에너지 증가 − 방출한 기체 내부 에너지(장부와 일치)', Math.abs((g.energy() - E0) - (t.dSolidE - t.lostE)) < 1e-6 * E0);
  // 고체 → 기체 칸(땅 파기): 진공, 몰수 불변, 압력 하락
  g = room(); g.fill(1, 1, 5, 1, 'AIR', 20, air(1, 20)); g.fill(0, 0, 7, 3, 'ROCK', 20); g.fill(1, 1, 5, 1, 'AIR', 20, air(1, 20));
  n0 = g.moles(); E0 = g.energy(); const p0 = g.pressure(g.idx(3, 1)); const e = g.excavate(6, 1, 20);   // 방 끝 벽을 파냄(진공 칸)
  ok('⑮ 땅 파기: 새 기체 칸은 진공(몰수 0)이고 기체 몰수·내부 에너지가 새로 생기지 않는다', g.nTot(g.idx(6, 1)) === 0 && rel(g.moles(), n0) < 1e-15 && e.dMoles === 0 && e.dGasE === 0 && e.type === 'excavate', JSON.stringify(e));
  ok('⑮ 땅 파기: 총 에너지 변화 = 파낸 고체의 열(음수, 장부)', e.dSolidE < 0 && Math.abs((g.energy() - E0) - e.dSolidE) < 1e-6 * E0, `${g.energy() - E0} / ${e.dSolidE}`);
  g.opts.conduction = false; g.opts.layers = false; g.run(1e3, 3000);
  ok('⑮ 땅 파기 뒤 기체가 새 칸까지 퍼져 압력이 보일 법칙대로 내려간다(5칸 → 6칸이라 5/6 atm)', rel(g.moles(), n0) < 1e-9 && Math.abs(g.pressure(g.idx(3, 1)) - 5 / 6 * p0) < 0.01 && Math.abs(g.pressure(g.idx(6, 1)) - 5 / 6 * p0) < 0.01, `P=${g.pressure(g.idx(3, 1)).toFixed(4)} (식 ${(5 / 6 * p0).toFixed(4)})`);
  ok('⑮ 편집 장부가 기록된다(종류·좌표·변한 양)', g.ledger.length === 1 && g.ledger[0].type === 'excavate' && 'dMoles' in g.ledger[0] && 'dSolidE' in g.ledger[0]);
  let bad = ''; try { g.solidify(0, 0, 'ROCK'); } catch (x) { bad = 'throw'; } ok('⑮ 고체 칸에 solidify, 기체 칸에 excavate는 거부', bad === 'throw');
}

// 19단계 ⑯: 고정 온도 칸(화덕 열원)과 열원 입력 장부
{
  const g = new Grid(5, 1); g.fill(0, 0, 5, 1, 'AIR', 20, air(1, 20)); g.pin[0] = 130;
  const E0 = g.energy(); let held = true; for (let k = 0; k < 200; k++) { g.step(100); if (g.T[0] !== 130) held = false; }
  ok('⑯ 고정 온도 칸은 매 걸음 그 온도(130 ℃)를 유지하고 이웃이 데워진다', held && g.T[1] > 21 && g.T[1] < 130 && g.T[4] > 20);
  ok('⑯ 열원 입력 장부: 닫힌 계의 에너지 변화 = heaterJ (보존 + 입력)', g.heaterJ > 0 && Math.abs((g.energy() - E0) - g.heaterJ) < 1e-9 * g.energy(), `${g.energy() - E0} / ${g.heaterJ}`);
  const h = new Grid(5, 1); h.fill(0, 0, 5, 1, 'AIR', 20, air(1, 20)); const he = h.energy(); h.run(100, 200);
  ok('⑯ 고정 칸이 없으면 입력 0이고 에너지 보존', h.heaterJ === 0 && rel(h.energy(), he) < 1e-12);
}

// 문구 데이터(19단계가 화면에 쓴다)
{
  const L = Cells.NOTES.layer;
  ok('밀도층 문구가 데이터(Cells.NOTES.layer)로 export된다: "게임 설정(가정)"·"확산으로 균일하게 섞여"·"영구히 나뉘지 않는다"', typeof L === 'string' && /게임 설정\(가정\)/.test(L) && /확산으로 균일하게 섞여/.test(L) && /영구히 나뉘지 않는다/.test(L) && Object.keys(Cells.NOTES).includes('heat') && Object.keys(Cells.NOTES).includes('diffusion') && Object.keys(Cells.NOTES).includes('scope'));
}

{
  const N = Cells.NOTES;
  ok('NOTES 보강: 분압 차 근사의 한계(diffusion)와 내부 에너지만 이동(energy, 엔탈피·pV)과 편집 규칙(edit: 진공·방출)이 각각 한 줄 있음', /분압 차 하나로 근사한다/.test(N.diffusion) && /엔탈피가 아니라 내부 에너지/.test(N.energy) && /pV/.test(N.energy) && /진공/.test(N.edit) && /방출/.test(N.edit) && /열린 이웃/.test(N.edit));
}

// ---- 12-a 호흡 최소판 (DESIGN §4-32): remove·inject·식·반응열 ----
{
  const air = (T = 20) => Cells.airMoles(1, T);
  const g = new Cells.Grid(2, 1); g.fill(0, 0, 2, 1, 'AIR', 20, air()); g.set(1, 0, 'ROCK', 20);
  const n0 = g.n[1 * 0 + 1], T0 = g.T[0];   // O2는 가스 순서의 둘째
  const took = g.remove(0, 0, 'O2', 0.1), nO2 = g.n[1];
  ok('remove: 열린 칸에서 O₂를 mol만큼 빼고 온도는 그대로, sunk 장부에 쌓인다', Math.abs(took - 0.1) < 1e-15 && Math.abs(n0 - nO2 - 0.1) < 1e-12 && g.T[0] === T0 && Math.abs(g.sunk.O2 - 0.1) < 1e-15);
  ok('remove: 있는 만큼만 뺀다(없으면 0), 고체 칸은 0', Math.abs(g.remove(0, 0, 'O2', 1e6) - nO2) < 1e-12 && g.n[1] === 0 && g.remove(1, 0, 'O2', 1) === 0);
  const h = new Cells.Grid(1, 1); h.set(0, 0, 'AIR', 12, air(12));
  const E0 = h.energy(), mol = Chem.OXY_MOL_O2, heat = Chem.oxyHeatJ(), Cv = Chem.CV_GAS.O2;
  h.inject(0, 0, 'O2', mol, heat);
  const dE = h.energy() - E0, want = mol * Cv * (12 + 273.15) + heat;
  ok('inject: 에너지 변화 = n·Cv·T + 반응열, sourced·chemJ 장부', Math.abs(dE - want) < 1e-6 * want && Math.abs(h.sourced.O2 - mol) < 1e-15 && Math.abs(h.chemJ - heat) < 1e-9, dE + ' vs ' + want);
  ok('inject: 넣은 칸의 온도가 올라가고 O₂ 몰분율이 커진다', h.T[0] > 12 && h.probe(0, 0).frac.O2 > Cells.AIR_MIX.O2);
  ok('산소석 반응열: 2 NaClO₃ → 2 NaCl + 3 O₂, O₂ 1 mol당 30.27 kJ(생성 엔탈피 −365.8·−411.2에서 손계산)', Math.abs(Chem.oxyHeatPerMol() - 30266.667) < 0.01 && Math.abs(Chem.oxyHeatJ() - 0.3 * 30266.667) < 0.01);
  // 닫힌 방(8칸)에 주입 → 전도·확산으로 균일해진 온도 = (처음 에너지 + 넣은 에너지)/(새 열용량)
  const r = new Cells.Grid(4, 2); r.fill(0, 0, 4, 2, 'AIR', 12, air(12));
  const Er0 = r.energy(), n0O = r.moles('O2');
  r.inject(0, 0, 'O2', mol, heat); r.run(1800, 400);
  let mn = 1e9, mx = -1e9, cap = 0; for (let i = 0; i < r.N; i++) { mn = Math.min(mn, r.T[i]); mx = Math.max(mx, r.T[i]); cap += r.cap(i); }
  ok('방에 산소석을 넣으면 열이 퍼져 온도가 균일해지고(최대 − 최소 < 1e-6 K), 에너지는 넣은 만큼만 늘어난다', mx - mn < 1e-6 && Math.abs((r.energy() - Er0) - want) < 1e-6 * want && Math.abs(r.moles('O2') - n0O - mol) < 1e-12, [mx - mn, r.energy() - Er0, want].join(' '));
  // 호흡 소비로 방 평균 P_O₂가 기준 아래로 내려가는 시간 = 식 C.minutesToPO2
  const room = new Cells.Grid(4, 3); room.fill(0, 0, 4, 3, 'AIR', 12, air(12));
  const V = 12 * Chem.V_CELL, nO2Room = room.moles('O2'), tPred = Chem.minutesToPO2(nO2Room, V, 12);
  let minutes = 0, meanP = () => { let n = 0; for (let i = 0; i < room.N; i++) n += room.n[i * 4 + 1]; return Chem.partial(n, V, 12 + 273.15); };
  while (meanP() >= Chem.BREATH_PO2 && minutes < 1000) { room.remove(0, 0, 'O2', Chem.BREATH_O2_MOL_PER_MIN * 0.1); room.step(60 * 0.1 * 60); minutes += 0.1; }
  ok('호흡 소비: 방 평균 P_O₂가 0.16 atm 아래로 내려가는 시간이 식(minutesToPO2)과 1 % 안에서 같다', Math.abs(minutes - tPred) / tPred < 0.01, minutes.toFixed(2) + ' vs ' + tPred.toFixed(2));
  ok('식의 경계: 이미 기준 미만이면 0분, 소비율이 두 배면 시간이 절반', Chem.minutesToPO2(0.5, V, 12) === 0 && Math.abs(Chem.minutesToPO2(nO2Room, V, 12, 0.04) * 2 - tPred) < 1e-9);
}
console.log(`\n${total - fail} / ${total} 통과`);
if (fail) { console.error(`칸 시뮬 점검 실패 ${fail}건`); process.exit(1); }
console.log('칸 시뮬 점검 모두 통과');
