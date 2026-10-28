// 칸 시뮬레이션 코어 (18단계, DESIGN.md §4-28): 열 전도(A) · 기체 확산(B) · 밀도에 따른 층(C).
// window·DOM·캔버스·난수를 쓰지 않는다(같은 입력이면 같은 결과, Node에서도 같다). 화학 식과 상수는 모두 chem.js(Chem)에서 부르고 여기서 새로 만들지 않는다.
// 화면에는 아직 연결하지 않는다(19단계). index.html도 이 파일을 불러오지 않는다.
// 한 걸음 `step(dt)` = ① 열 전도 → ② 기체 확산 → ③ 밀도층. 각 단계는 그 시점의 스냅샷에서 모든 경계의 이동량을 먼저 구한 뒤 한꺼번에 적용한다(순서 의존 없음).
(function (root) {
  const C = (typeof module !== 'undefined' && module.exports) ? require('./chem.js') : root.Chem;
  // 안정 조건: 한 걸음에 한 경계로 옮기는 양은 평형량의 FLOW_MAX배 이하 → 한 칸의 이웃 4개를 합쳐도 0.8 이하라 dt가 아무리 커도 터지지 않는다
  if (!(C.FLOW_MAX > 0 && C.FLOW_MAX <= 0.2)) throw new Error('안정 조건 위반: Chem.FLOW_MAX는 0.2 이하여야 합니다.');

  const KIND = { AIR: 0, ROCK: 1, DIRT: 2, SAND: 3, ICE: 4, METAL: 5, WATER: 6, SKY: 7, SOURCE: 8 };
  const NAMES = Object.keys(KIND);
  const G = C.GASES, NG = G.length, MM = G.map(g => C.MOLAR_MASS[g]), CV = G.map(g => C.CV_GAS[g]);
  // 종류별 성질: k 열전도율(W/(m·K)), open 기체가 있을 수 있는 칸, fixed 값이 바뀌지 않는 고정 칸(외기 저수조·열원), cap 고체·액체 칸의 열용량(J/K)
  const PROP = [];
  PROP[KIND.AIR] = { k: C.K_GAS, open: true, fixed: false, cap: 0 };
  for (const name of ['ROCK', 'DIRT', 'SAND', 'ICE', 'METAL', 'WATER']) PROP[KIND[name]] = { k: C.MATERIAL[name].k, open: false, fixed: false, cap: C.solidHeatCap(name) };
  PROP[KIND.SKY] = { k: C.K_GAS, open: true, fixed: true, cap: Infinity };            // 외기 경계: 온도·기체가 변하지 않는 무한 저수조(열린 경계라 보존 계산에서 뺀다)
  PROP[KIND.SOURCE] = { k: C.MATERIAL.METAL.k, open: false, fixed: true, cap: Infinity };   // 고정 온도 열원 칸(화덕용)

  // 공기 조성: Chem.AIR에서 아르곤을 빼고 N₂·O₂만 다시 몰분율로 맞춘다(가정: 아르곤 무시)
  const AIR_MIX = { N2: C.AIR.N2 / (C.AIR.N2 + C.AIR.O2), O2: C.AIR.O2 / (C.AIR.N2 + C.AIR.O2) };
  // 압력 P(atm)·온도 T(℃)에서 한 칸(V_CELL)에 든 기체의 몰수 객체. mix는 몰분율 {N2, O2, He, H2O}(합이 1이 아니어도 비율만 쓴다)
  function airMoles(P, T, mix = AIR_MIX) {
    const tot = C.moles(P, C.V_CELL, T); let s = 0; for (const g of G) s += mix[g] || 0;
    const o = {}; for (const g of G) o[g] = tot * (mix[g] || 0) / s; return o;
  }

  // 화면(19단계)에 그대로 쓰는 문구. 밀도층 문구는 0절 "화면 표시 문구"와 같다.
  const NOTES = {
    layer: '게임 설정(가정): 기체는 충분한 시간이 지나면 확산으로 균일하게 섞여 평형에서 층이 영구히 나뉘지 않는다. 막 유입·생성된 짧은 시간에는 밀도 차에 의한 이동이 확산보다 빨라 무거운 기체는 아래에 고이고 가벼운 기체는 위로 뜬다. 이동 비율 G는 게임 설정(가정).',
    heat: '열은 온도가 높은 칸에서 낮은 칸으로만 흐르고 에너지 합은 보존된다. 전도도 K = 칸 한 변 × 두 칸 열전도율의 조화 평균, 재료 상수는 게임 설정(가정).',
    diffusion: '기체는 분압이 높은 칸에서 낮은 칸으로 이동하고 같은 온도·분압에서는 가벼운 기체가 빠르다(∝ 1/√M, 그레이엄 법칙). 확산 계수의 크기와 온도가 다른 칸 사이를 분압 차로 근사하는 것은 게임 설정(가정)이고, 실제 공기 중 확산은 훨씬 느리다.',
    scope: '칸 시뮬은 열 전도·기체 확산·밀도층 세 가지만 계산한다. 증발·응축·녹음 같은 상변화와 증발열은 계산하지 않는다(수증기는 이동만 한다).',
  };

  class Grid {
    constructor(w, h) {
      this.w = w; this.h = h; this.N = w * h;
      this.kind = new Uint8Array(this.N);                 // 칸 종류(KIND). 처음은 모두 AIR(빈 칸, 기체 0)
      this.T = new Float64Array(this.N).fill(20);         // 온도 ℃
      this.n = new Float64Array(this.N * NG);             // 기체 몰수(칸마다 C.GASES 순서)
      this.dE = new Float64Array(this.N);                 // 한 단계에서 받은 열량(J) 누적(스냅샷 방식)
      this.dU = new Float64Array(this.N);                 // 한 단계에서 기체가 옮긴 내부 에너지(J) 누적
      this.dn = new Float64Array(this.N * NG);            // 한 단계에서 기체가 옮긴 몰수 누적
      this.opts = { conduction: true, diffusion: true, layers: true };   // 시험용 스위치(끄면 그 단계를 건너뜀)
      this.time = 0; this.steps = 0;
    }
    idx(x, y) { return y * this.w + x; }
    // 칸 하나 설정. gas는 {N2, O2, He, H2O}(mol). 기체 없는 종류에는 무시한다
    set(x, y, kind, T = 20, gas) {
      const i = this.idx(x, y); this.kind[i] = KIND[kind] !== undefined ? KIND[kind] : kind; this.T[i] = T;
      for (let s = 0; s < NG; s++) this.n[i * NG + s] = (PROP[this.kind[i]].open && gas && gas[G[s]]) || 0;
      return i;
    }
    fill(x0, y0, w, h, kind, T, gas) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, kind, T, gas); }
    // ---- 조회 ----
    nTot(i) { let s = 0; for (let k = 0; k < NG; k++) s += this.n[i * NG + k]; return s; }
    cap(i) {                                              // 열용량(J/K)
      const p = PROP[this.kind[i]]; if (!p.open) return p.cap; if (p.fixed) return Infinity;
      let s = 0; for (let k = 0; k < NG; k++) s += this.n[i * NG + k] * CV[k]; return s;
    }
    partial(i, gas) { const k = typeof gas === 'number' ? gas : G.indexOf(gas); return C.partial(this.n[i * NG + k], C.V_CELL, this.T[i] + 273.15); }
    pressure(i) { let s = 0; for (let k = 0; k < NG; k++) s += this.partial(i, k); return s; }
    meanMass(i) { let n = 0, m = 0; for (let k = 0; k < NG; k++) { n += this.n[i * NG + k]; m += this.n[i * NG + k] * MM[k]; } return n > 0 ? m / n : 0; }
    density(i) { const n = this.nTot(i); return n > 0 ? C.gasDensity(this.pressure(i), this.meanMass(i), this.T[i]) : 0; }
    // 보존량(고정 칸 제외): 총 몰수(gas 이름을 주면 그 기체만), 총 열에너지 Σ C·T(K)
    moles(gas) { let s = 0; for (let i = 0; i < this.N; i++) { const p = PROP[this.kind[i]]; if (!p.open || p.fixed) continue; if (gas === undefined) s += this.nTot(i); else s += this.n[i * NG + G.indexOf(gas)]; } return s; }
    energy() { let s = 0; for (let i = 0; i < this.N; i++) { if (PROP[this.kind[i]].fixed) continue; s += this.cap(i) * (this.T[i] + 273.15); } return s; }
    // 비트 단위 비교용 복사본(결정성 시험)
    state() { return { kind: this.kind.slice(), T: this.T.slice(), n: this.n.slice() }; }

    // ---- 한 걸음 ----
    step(dt) {
      if (!(Number.isFinite(dt) && dt > 0)) throw new Error('dt는 유한한 양수여야 합니다.');
      if (this.opts.conduction) this._conduct(dt);
      if (this.opts.diffusion) this._diffuse(dt);
      if (this.opts.layers) this._layers(dt);
      this.time += dt; this.steps++;
    }
    run(dt, steps) { for (let s = 0; s < steps; s++) this.step(dt); }
    // 오른쪽·아래 이웃과의 경계를 한 번씩만 돈다(각 경계는 양쪽 칸에 짝으로 +Q, −Q)
    _edges(fn) {
      const w = this.w, h = this.h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x + 1 < w) fn(i, i + 1, false); if (y + 1 < h) fn(i, i + w, true); }
    }
    // A. 열 전도: 모든 경계의 Q를 같은 스냅샷에서 구한 뒤 한꺼번에 적용 → 에너지 합 보존
    _conduct(dt) {
      const dE = this.dE;
      this._edges((i, j) => {
        const ci = this.cap(i), cj = this.cap(j);
        const K = C.condK(PROP[this.kind[i]].k, PROP[this.kind[j]].k);
        const Q = C.heatFlow(K, this.T[i], this.T[j], dt, ci, cj);      // i → j가 +
        if (Q !== 0) { dE[i] -= Q; dE[j] += Q; }
      });
      for (let i = 0; i < this.N; i++) {
        if (dE[i] !== 0) { const c = this.cap(i); if (!PROP[this.kind[i]].fixed && c > 0 && Number.isFinite(c)) this.T[i] += dE[i] / c; dE[i] = 0; }
      }
    }
    // 기체가 f(mol)만큼 칸 a → b로 갈 때 쌓는 몰수와 그 몰수가 가진 내부 에너지 f·Cv·T(K)(주는 칸의 온도)
    _carry(a, b, s, f) {
      this.dn[a * NG + s] -= f; this.dn[b * NG + s] += f;
      const e = f * CV[s] * (this.T[a] + 273.15); this.dU[a] -= e; this.dU[b] += e;
    }
    // 쌓인 몰수·에너지를 한꺼번에 적용: 새 온도 = (원래 에너지 + 받은 에너지)/(새 열용량) = 열용량 가중 평균. 고정 칸은 바뀌지 않는다
    _applyGas() {
      for (let i = 0; i < this.N; i++) {
        const p = PROP[this.kind[i]]; if (!p.open || p.fixed) continue;
        let touched = this.dU[i] !== 0, Cold = 0, Cnew = 0;
        for (let s = 0; s < NG; s++) if (this.dn[i * NG + s] !== 0) touched = true;
        if (!touched) continue;
        for (let s = 0; s < NG; s++) {
          const o = this.n[i * NG + s]; Cold += o * CV[s];
          let v = o + this.dn[i * NG + s];
          if (v < 0) { if (v > -1e-9 * (1 + o)) v = 0; else throw new Error(`칸 ${i}의 ${G[s]} 몰수가 음수가 됨: ${v}`); }   // 안정 조건이 지켜지면 일어나지 않는다
          this.n[i * NG + s] = v; this.dn[i * NG + s] = 0; Cnew += v * CV[s];
        }
        const Eold = Cold * (this.T[i] + 273.15), Enew = Eold + this.dU[i]; this.dU[i] = 0;
        if (Cnew > 0) this.T[i] = Enew / Cnew - 273.15;       // 기체가 없어진 칸은 온도를 그대로 둔다
      }
      // 고정 칸이 주는 쪽/받는 쪽일 때 그 칸의 누적은 버린다(저수조는 변하지 않는다)
      for (let i = 0; i < this.N; i++) if (PROP[this.kind[i]].fixed) { this.dU[i] = 0; for (let s = 0; s < NG; s++) this.dn[i * NG + s] = 0; }
    }
    // B. 기체 확산: 이웃한 열린 칸 사이, 기체마다 분압 차로
    _diffuse(dt) {
      this._edges((i, j) => {
        const pi = PROP[this.kind[i]], pj = PROP[this.kind[j]];
        if (!pi.open || !pj.open || (pi.fixed && pj.fixed)) return;
        for (let s = 0; s < NG; s++) {
          const Pa = this.n[i * NG + s] > 0 ? this.partial(i, s) : 0, Pb = this.n[j * NG + s] > 0 ? this.partial(j, s) : 0;
          const f = C.diffFlow(Pa, Pb, MM[s], this.T[i], this.T[j], dt);   // i → j가 +
          if (f > 0) this._carry(i, j, s, f); else if (f < 0) this._carry(j, i, s, -f);
        }
      });
      this._applyGas();
    }
    // C. 밀도층: 위 칸(i) 밀도가 아래 칸(j = i + w)보다 크면 서로 기체의 일부 G를 바꾼다(고정 칸과는 바꾸지 않는다)
    _layers(dt) {
      const w = this.w, rho = new Float64Array(this.N);
      for (let i = 0; i < this.N; i++) rho[i] = PROP[this.kind[i]].open ? this.density(i) : 0;
      this._edges((i, j, vertical) => {
        if (!vertical) return;
        const pi = PROP[this.kind[i]], pj = PROP[this.kind[j]];
        if (!pi.open || !pj.open || pi.fixed || pj.fixed) return;
        const g = C.layerFrac(rho[i], rho[j], dt); if (g <= 0) return;
        const upN = new Float64Array(NG), lowN = new Float64Array(NG);
        for (let s = 0; s < NG; s++) { upN[s] = g * this.n[i * NG + s]; lowN[s] = g * this.n[j * NG + s]; }
        for (let s = 0; s < NG; s++) { if (upN[s] > 0) this._carry(i, j, s, upN[s]); if (lowN[s] > 0) this._carry(j, i, s, lowN[s]); }
      });
      this._applyGas();
    }
  }

  const Cells = { Grid, KIND, NAMES, PROP, NOTES, AIR_MIX, airMoles };
  if (typeof module !== 'undefined' && module.exports) module.exports = Cells;
  root.Cells = Cells;
})(typeof window !== 'undefined' ? window : globalThis);
