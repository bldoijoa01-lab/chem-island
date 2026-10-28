// 칸 시뮬레이션 코어 (18단계, DESIGN.md §4-28): 열 전도(A) · 기체 확산(B) · 밀도에 따른 층(C).
// window·DOM·캔버스·난수를 쓰지 않는다(같은 입력이면 같은 결과, Node에서도 같다). 화학 식과 상수는 모두 chem.js(Chem)에서 부르고 여기서 새로 만들지 않는다.
// 화면 연결은 cellsim.js(19단계)가 한다. 이 파일은 DOM 없이 Node에서도 돈다.
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
    diffusion: '기체는 분압이 높은 칸에서 낮은 칸으로 이동하고 같은 온도·분압에서는 가벼운 기체가 빠르다(∝ 1/√M, 그레이엄 법칙). 한계: 온도가 다른 칸 사이의 이동을 분압 차 하나로 근사한다(교과서의 그레이엄 법칙은 같은 T·P에서의 속도 비). 확산 계수의 크기는 게임 설정(가정)이고, 실제 공기 중 확산은 훨씬 느리다.',
    energy: '한계(단순화): 이동하는 기체는 엔탈피가 아니라 내부 에너지(n·Cv·T)만 옮긴다(유동 일 pV 무시). 몰 열용량은 이상 기체의 자유도로 환산한 게임 설정(가정)이다.',
    edit: '땅 파기·블록 놓기: 기체가 고체가 되면 그 칸의 기체(몰수와 내부 에너지)를 열린 이웃 칸에 나눠 옮기고, 이웃이 없으면 외기로 방출한 것으로 기록한다. 고체가 파여 빈 칸이 되면 진공(몰수 0)이라 이웃 기체가 퍼지며 압력이 내려간다(보일 법칙). 기체는 새로 생기지 않는다(게임 설정).',
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
      this.pin = new Float64Array(this.N).fill(NaN);      // 고정 온도 칸(화덕 열원 등): 값이 있으면 매 걸음 끝에 그 온도로 되돌리고 필요한 열을 heaterJ에 쌓는다
      this.heaterJ = 0;                                    // 고정 온도 칸이 받아 간 누적 열량(J, 열원 입력 장부). 닫힌 계의 에너지 변화 = heaterJ + 편집 장부
      this.ledger = [];                                    // 편집 장부(최근 100개)
      this.sunk = {}; this.sourced = {}; this.chemJ = 0;   // 12-a 장부: 호흡으로 뺀 기체, 산소석 등이 넣은 기체(mol), 화학 반응열(J)
      this.released = { moles: 0, energy: 0 };             // 갇힌 칸이 고체가 될 때 외기로 방출된 누적 기체(mol)와 내부 에너지(J)
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
    // 칸 하나를 읽는다(19단계 칸 값 읽기·지도 색이 모두 이 함수를 거친다): 종류, 열린 칸 여부, 온도 ℃, 총압 atm, 기체별 분압 atm·몰분율, 총 몰수
    probe(x, y) {
      const i = this.idx(x, y), p = PROP[this.kind[i]], o = { kind: NAMES[this.kind[i]], open: p.open, fixed: p.fixed, T: this.T[i], P: 0, n: 0, partial: {}, frac: {} };
      if (p.open) { o.n = this.nTot(i); o.P = this.pressure(i); for (let k = 0; k < NG; k++) { o.partial[G[k]] = this.partial(i, k); o.frac[G[k]] = o.n > 0 ? this.n[i * NG + k] / o.n : 0; } }
      return o;
    }
    // 12-a 호흡·산소석(DESIGN §4-32): 열린 칸에서 기체를 mol만큼 뺀다(온도는 그대로, 있는 만큼만). 뺀 몰수를 돌려주고 sunk 장부에 쌓는다
    remove(x, y, gas, mol) {
      const i = this.idx(x, y), s = G.indexOf(gas); if (s < 0 || !PROP[this.kind[i]].open || PROP[this.kind[i]].fixed || !(mol > 0)) return 0;
      const take = Math.min(mol, this.n[i * NG + s]); this.n[i * NG + s] -= take; this.sunk[gas] = (this.sunk[gas] || 0) + take; return take;
    }
    // 열린 칸에 기체 mol(그 칸의 온도)과 화학 반응열 heatJ(J)를 넣는다. 새 온도 = (원래 에너지 + 넣은 기체의 내부 에너지 + 반응열)/(새 열용량). sourced·chemJ 장부에 기록
    inject(x, y, gas, mol, heatJ = 0) {
      const i = this.idx(x, y), s = G.indexOf(gas); if (s < 0 || !PROP[this.kind[i]].open || PROP[this.kind[i]].fixed || !(mol > 0)) return false;
      const nArr = new Float64Array(NG); nArr[s] = mol;
      this._addGas(i, nArr, mol * CV[s] * (this.T[i] + 273.15) + heatJ);
      this.sourced[gas] = (this.sourced[gas] || 0) + mol; this.chemJ += heatJ; return true;
    }
    // 비트 단위 비교용 복사본(결정성 시험)
    state() { return { kind: this.kind.slice(), T: this.T.slice(), n: this.n.slice() }; }

    // 열린 칸 j에 기체 nArr(종류별 mol)와 내부 에너지 e(J)를 더한다: 새 온도 = (원래 에너지 + e)/(새 열용량)
    _addGas(j, nArr, e) {
      const old = this.cap(j) * (this.T[j] + 273.15); let cn = 0;
      for (let s = 0; s < NG; s++) { this.n[j * NG + s] += nArr[s]; cn += this.n[j * NG + s] * CV[s]; }
      if (cn > 0) this.T[j] = (old + e) / cn - 273.15;
    }
    // 칸 하나의 종류를 바꾼다(땅 파기·블록 놓기·문 열고 닫기, DESIGN §4-29). 기체 몰수·내부 에너지를 보존한다:
    //  기체 칸 → 고체: 기체와 내부 에너지를 열린(고정 아닌) 이웃에 같은 양씩 나눠 옮긴다. 이웃이 없으면 외기로 방출(released 장부).
    //  고체 → 기체 칸: 진공(몰수 0). 기체는 새로 생기지 않는다. 고체가 가진 열(질량 × 비열 × T)은 고체 에너지 장부로만 변한다.
    // 돌려주는 기록: { type, dMoles(총 기체 변화), dGasE(총 기체 내부 에너지 변화), dSolidE(고체 에너지 변화), lostMoles, lostE, to(받은 이웃 수) }
    convert(x, y, kindName, T) {
      const i = this.idx(x, y), oldK = this.kind[i], newK = KIND[kindName], po = PROP[oldK], pn = PROP[newK];
      if (po.fixed || pn.fixed) throw new Error('고정 칸은 편집하지 않습니다.');
      const rec = { type: po.open && !pn.open ? 'solidify' : !po.open && pn.open ? 'excavate' : 'swap', x, y, from: NAMES[oldK], to: kindName, dMoles: 0, dGasE: 0, dSolidE: 0, lostMoles: 0, lostE: 0, receivers: 0 };
      const Tc = T === undefined ? this.T[i] : T;
      const eOld = po.open ? 0 : po.cap * (this.T[i] + 273.15);                   // 사라지는 고체의 열(열린 칸이면 0)
      if (po.open) {
        const nArr = new Float64Array(NG); let n = 0, eGas = 0;
        for (let s = 0; s < NG; s++) { nArr[s] = this.n[i * NG + s]; n += nArr[s]; eGas += nArr[s] * CV[s] * (this.T[i] + 273.15); }
        if (!pn.open && n > 0) {                                                  // 기체 → 고체: 열린 이웃에 나눠 옮김
          const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < this.w && b < this.h && PROP[this.kind[this.idx(a, b)]].open && !PROP[this.kind[this.idx(a, b)]].fixed);
          if (nb.length) { const part = new Float64Array(NG); for (let s = 0; s < NG; s++) part[s] = nArr[s] / nb.length; for (const [a, b] of nb) this._addGas(this.idx(a, b), part, eGas / nb.length); rec.receivers = nb.length; }
          else { rec.lostMoles = n; rec.lostE = eGas; this.released.moles += n; this.released.energy += eGas; rec.dMoles = -n; rec.dGasE = -eGas; }
        }
        for (let s = 0; s < NG; s++) this.n[i * NG + s] = 0;
      }
      this.kind[i] = newK; this.T[i] = Tc; this.pin[i] = NaN;
      if (pn.open) for (let s = 0; s < NG; s++) this.n[i * NG + s] = 0;           // 새 기체 칸은 진공
      rec.dSolidE = (pn.open ? 0 : pn.cap * (Tc + 273.15)) - eOld;
      this.ledger.push(rec); if (this.ledger.length > 100) this.ledger.shift();
      return rec;
    }
    solidify(x, y, kindName, T) { if (!PROP[this.kind[this.idx(x, y)]].open) throw new Error('기체 칸이 아닙니다.'); return this.convert(x, y, kindName, T); }
    excavate(x, y, T) { if (PROP[this.kind[this.idx(x, y)]].open) throw new Error('이미 기체 칸입니다.'); return this.convert(x, y, 'AIR', T); }
    // 고정 온도 칸: 걸음 끝에 그 온도로 되돌리고 필요했던 열(J)을 장부에 쌓는다
    _pins() {
      for (let i = 0; i < this.N; i++) {
        const p = this.pin[i]; if (!(p === p)) continue;                          // NaN이면 건너뜀
        const c = this.cap(i); if (!(c > 0) || !Number.isFinite(c)) continue;
        this.heaterJ += c * (p - this.T[i]); this.T[i] = p;
      }
    }

    // ---- 한 걸음 ----
    step(dt) {
      if (!(Number.isFinite(dt) && dt > 0)) throw new Error('dt는 유한한 양수여야 합니다.');
      if (this.opts.conduction) this._conduct(dt);
      if (this.opts.diffusion) this._diffuse(dt);
      if (this.opts.layers) this._layers(dt);
      this._pins();
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
