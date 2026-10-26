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
};
