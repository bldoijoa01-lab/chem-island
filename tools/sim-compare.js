// 같은 장치·같은 입력을 섬(환경)마다 돌려 결과를 비교한다. 사용: node tools/sim-compare.js   (의존성 없음)
// 환경은 sim.js의 ENV(가정(임의값)): 외기 압력 P(atm)와 기온 보정 dT(℃). 결과는 DESIGN.md §4-8에 붙여 두었다.
const Sim = require('../sim.js'), C = require('../chem.js');
const run = (island, fn) => { const S = Sim.newState(); S.f.raft = true; S.qDone = 9; S.raft.dock = island === 'start' ? 'start' : island; return fn(S, dm => { Sim.advance(S, dm); Sim.drain(); }); };
const row = (cells) => cells.map(c => String(c).padEnd(14)).join('');
const islands = ['start', 'alpine', 'polar'];

console.log('\n[1] 증류기: 바닷물 3통(579 g, 소금 21 g), 약불(105 ℃) 옆에서 끝까지');
console.log(row(['섬', '외기 atm', '물 끓는점℃', '끝난 시간(분)', '증류수 g']));
for (const isl of islands) run(isl, (S, adv) => {
  S.placed = [{ id: 'fire', x: 1, y: 23, s: { level: 1, fuel: 99 } }, { id: 'still', x: 4, y: 23, s: { w: 579, ns: 21 / 58.44, outW: 0, outS: 0, run: true, T: 25 } }];
  let m = 0; const d = S.placed[1].s; while (d.run && m < 3000) { adv(1); m++; }
  console.log(row([Sim.ENV[Sim.dockOf(S).island].name, Sim.pAtm(S), C.tb(Sim.pAtm(S)).toFixed(1), d.run ? '끝나지 않음' : m, d.outW.toFixed(1)]));
});

console.log('\n[2] 압력 밥솥: 강불(130 ℃), 밸브 2.0, 소금 10 g');
console.log(row(['섬', '내부 atm', '끓는점℃', '속도', '완성 시간(분)']));
for (const isl of islands) run(isl, (S, adv) => {
  S.placed = [{ id: 'fire', x: 1, y: 23, s: { level: 3, fuel: 99 } }, { id: 'cooker', x: 4, y: 23, s: { run: true, prog: 0, valve: 2, saltG: 10, water: 300, T: 25 } }];
  let m = 0; const d = S.placed[1].s; while (d.run && m < 500) { adv(1); m++; }
  console.log(row([Sim.ENV[Sim.dockOf(S).island].name, d.doneP ? d.doneP.toFixed(2) : '-', d.cs ? d.cs.Teff.toFixed(1) : '-', d.cs ? d.cs.speed.toFixed(2) : '-', d.done ? m : (d.broken ? '폭발' : '-')]));
});

console.log('\n[3] 밥솥 잠금 + 최강불(145 ℃): 터지는가 (한계 = 외기 + 게이지 2 atm)');
console.log(row(['섬', '한계 atm', '결과']));
for (const isl of islands) run(isl, (S, adv) => {
  S.placed = [{ id: 'fire', x: 1, y: 23, s: { level: 4, fuel: 99 } }, { id: 'cooker', x: 4, y: 23, s: { run: true, prog: 0, valve: 4, saltG: 0, water: 300, T: 25 } }];
  adv(3); const d = S.placed[1].s;
  console.log(row([Sim.ENV[Sim.dockOf(S).island].name, (Sim.pAtm(S) + C.PBURST - 1).toFixed(2), d.broken ? '폭발' : '안 터짐']));
});

console.log('\n[4] 기체 포집기: 주사기 0.5 L, 오후 3시(시작섬 28 ℃)에 모이는 기체의 양 n = PV/RT');
console.log(row(['섬', '외기 atm', '기온℃', 'n (mol)']));
for (const isl of islands) run(isl, (S) => {
  S.min = 900; S.inv.sand = 5; Sim.act.cap(S); Sim.drain();   // 캡슐 만드는 10분 뒤 시각으로 계산된다
  const c = S.caps[S.caps.length - 1];
  console.log(row([Sim.ENV[Sim.dockOf(S).island].name, Sim.pAtm(S), Sim.airTemp(S).toFixed(1), c.n.toFixed(4)]));
});

console.log('\n[5] 소금 뿌리개: 소금 10 g이 녹이는 얼음(g) — 새벽 3시와 오후 3시 (공융점 −21.1 ℃, 0 ℃ 이상은 필요 없음)');
console.log(row(['섬', '새벽 기온℃', '새벽 녹는 얼음 g', '오후 기온℃', '오후 녹는 얼음 g']));
for (const isl of ['start', 'alpine', 'polar']) run(isl, (S) => {
  const at = (m) => { S.min = m; return Sim.airTemp(S); };
  const tn = at(180), td = at(900);
  console.log(row([Sim.ENV[Sim.dockOf(S).island].name, tn.toFixed(1), C.iceMeltBySalt(tn, 10).toFixed(1), td.toFixed(1), C.iceMeltBySalt(td, 10).toFixed(1)]));
});
