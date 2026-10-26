const Sim = require('../sim.js');   // 시나리오 I가 행동 규칙(Sim.act)을 직접 부른다
// 시나리오: (S, adv) → 결과 스냅샷. 브라우저(분리 전 game.js)와 Node(sim.js)에서 같은 코드를 돌린다.
module.exports = {
  A_distill_3buckets_80min: (S, adv) => {
    S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 2, fuel: 5 } }, { id: 'still', x: 50, y: 22, s: { w: 579, ns: 21 / 58.44, outW: 0, outS: 0, run: true, T: 25 } }];
    adv(30); const mid = { outW: S.placed[1].s.outW, w: S.placed[1].s.w };
    adv(50); const s = S.placed[1].s;
    return { mid, outW: s.outW, outS: s.outS, w: s.w, run: s.run, tb: s.tb, fuel: S.placed[0].s.fuel, min: S.min, log: S.log.map(l => l.type + ':' + l.text) };
  },
  B_cooker_valve2_strongfire: (S, adv) => {
    S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 3, fuel: 20 } }, { id: 'cooker', x: 50, y: 22, s: { run: true, prog: 0, valve: 2, saltG: 10, water: 300, T: 25 } }];
    adv(10); const s = S.placed[1].s;
    return { done: s.done, doneP: s.doneP, run: s.run, prog: s.prog, T: s.T, cs: s.cs, min: S.min, log: S.log.map(l => l.type + ':' + l.text) };
  },
  C_cooker_explode_locked_maxfire: (S, adv) => {
    S.f.raft = true;   // 튜토리얼이 끝난 뒤(뗏목 파편 수리 후)의 규칙: 폭발 켜짐
    S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 4, fuel: 20 } }, { id: 'cooker', x: 50, y: 22, s: { run: true, prog: 0, valve: 4, saltG: 0, water: 300, T: 25 } }];
    adv(3); const s = S.placed[1].s;
    return { broken: s.broken, run: s.run, prog: s.prog, log: S.log.map(l => l.type + ':' + l.text) };
  },
  D_wolves_night_10h_seeded: (S, adv) => {
    S.f.raft = true;   // 튜토리얼이 끝난 뒤: 서리 늑대 켜짐
    S.min = 1300; S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 2, fuel: 5 } }, { id: 'still', x: 50, y: 22, s: { w: 0, ns: 0, outW: 0, outS: 0, run: false, T: 25 } }, { id: 'cooker', x: 56, y: 22, s: { run: false, prog: 0, valve: 2, saltG: 0, water: 300, T: 25 } }];
    adv(600);
    return { day: S.day, min: S.min, mobs: S.mobs.map(m => [m.id, Math.round(m.M * 1000) / 1000, m.M0, m.dx, m.att]), mobId: S.mobId, broken: S.placed.map(d => !!d.s.broken), fuel: S.placed[0].s.fuel, wolf: S.f.wolf, dusk: S.dusk, log: S.log.map(l => l.day + ' ' + l.t + ' ' + l.type + ':' + l.text) };
  },
  E_day_rollover_packs_nodes: (S, adv) => {
    S.packs = [{ T: -10, M: 200, day: 1 }, { T: -8, M: 100, day: 2 }]; S.nodes = { a: 2 }; adv(1440);
    return { day: S.day, min: S.min, packs: S.packs.length, nodes: Object.keys(S.nodes).length, log: S.log.map(l => l.type + ':' + l.text) };
  },
  // 3단계에서 새로 생긴 규칙(분리 전 기준값 없음): 튜토리얼(뗏목 파편 수리 전)에는 서리 늑대와 폭발이 꺼진다
  F_tutorial_no_wolves_no_burst: (S, adv) => {
    S.min = 1300; S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 4, fuel: 40 } }, { id: 'cooker', x: 50, y: 22, s: { run: true, prog: 0, valve: 4, saltG: 0, water: 300, T: 25 } }];
    adv(600); const s = S.placed[1].s;
    return { wolves: S.mobId, broken: s.broken, safeWarned: s.safeWarned, done: s.done, doneP: s.doneP, log: S.log.map(l => l.type + ':' + l.text) };
  },
  // ---- 보완 일괄에서 추가한 경계 시나리오 G~J (분리 전 기준값 없음: 현재 sim.js를 돌려 저장한 값이다) ----
  G_cooker_valve3_strongest_fire_no_burst: (S, adv) => {   // 밸브 2.5 atm(index 3) + 최강불: 터지지 않고 내부 2.5 atm에서 완성
    S.f.raft = true;
    S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 4, fuel: 40 } }, { id: 'cooker', x: 50, y: 22, s: { run: true, prog: 0, valve: 3, saltG: 0, water: 300, T: 25 } }];
    adv(20); const s = S.placed[1].s;
    return { broken: !!s.broken, done: s.done, doneP: s.doneP, Teff: Math.round(s.cs.Teff * 100) / 100 };
  },
  H_still_end_boundary: (S, adv) => {   // 끝나기 직전 경계: 바닷물 1통(물 193 g)에서 남은 물이 끝 기준(10 % = 19.3 g)보다 0.5 g 많을 때 1분 가열하면 0.5 g만 증발해 끝나고 소금 7 g이 남는다
    S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 4, fuel: 40 } }, { id: 'still', x: 50, y: 22, s: { w: 19.3 + 0.5, w0: 193, ns: 7 / 58.44, outW: 0, outS: 0, run: true, T: 25 } }];
    adv(1); const s = S.placed[1].s;
    return { w: Math.round(s.w * 1000) / 1000, ns: s.ns, outW: Math.round(s.outW * 1000) / 1000, outS: Math.round(s.outS * 1000) / 1000, run: s.run };
  },
  I_wolf_5g_salt_10g_at_3am: (S, adv) => {   // 늑대가 5 g뿐이면 필요한 만큼만 쓰고 정화
    S.min = 180; S.inv.salt = 10; S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 0, fuel: 0 } }];
    S.mobs = [{ id: 1, k: 'wolf', M: 5, M0: 5, dx: 47, dy: 22, att: 0 }]; S.mobId = 1;
    Sim.act.saltOnWolf(S, S.mobs[0], 10); Sim.drain();
    return { mobs: S.mobs.length, wolfDone: S.f.wolf, saltLeft: Math.round(S.inv.salt * 1000) / 1000 };
  },
  J_cold_cooker_no_progress: (S, adv) => {   // 화덕이 꺼진 밥솥은 60분 뒤에도 진행도 0 (끓지 않으면 조리되지 않는다)
    S.f.raft = true;
    S.placed = [{ id: 'fire', x: 47, y: 22, s: { level: 0, fuel: 0 } }, { id: 'cooker', x: 50, y: 22, s: { run: true, prog: 0, valve: 2, saltG: 0, water: 300, T: 25 } }];
    adv(60); const s = S.placed[1].s;
    return { prog: s.prog, done: !!s.done, pIn: s.cs.pIn, boil: s.cs.boil };
  },
  // 15단계에서 추가: 수리 재료(증류수 150 g + 소금 20 g)와 증류 기록 조건. 부족 → 실패, 기록만 있고 재료 부족 → 실패, 충분 → 성공 + 재료 차감
  K_repair_needs_distilled_water_and_salt: (S, adv) => {
    S.inv.water = 400; S.inv.salt = 20; const r0 = Sim.act.repairRaft(S);   // 시작 증류수 400 g만 있고 증류 기록이 없으면 실패
    S.f.dW = 200; S.f.dS = 20; S.inv.salt = 19; const r1 = Sim.act.repairRaft(S);   // 기록은 있으나 소금 19 g: 실패
    S.inv.salt = 20; const r2 = Sim.act.repairRaft(S); Sim.drain();
    return { r0, r1, r2, raft: S.f.raft, water: S.inv.water, salt: S.inv.salt, log: S.log.map(l => l.type + ':' + l.text) };
  },
};
