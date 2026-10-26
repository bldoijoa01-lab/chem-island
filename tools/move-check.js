// 이동 점검(자동 오르기 없음): 점프만으로 네 섬의 끝에서 끝까지 걸을 수 있는지, 땅을 파서 만든 구덩이에서 나올 수 있는지 본다.
// 사용: node tools/move-check.js   (브라우저 없이 world.js의 stepPlayer를 직접 돌린다)
global.window = global; require('../chem.js'); global.Chem = window.Chem;
const Sim = require('../sim.js'); global.Sim = Sim;
require('../world.js');
const W = global.World || window.World, S = Sim.newState();
W.applyDug(S);
let fail = 0;
// 걷기 봇: 점프만으로 섬 끝에서 끝까지 갈 수 있는지(자동 오르기 없음)
S.f.raft = true; S.qDone = 11;
for (const dock of Object.keys(Sim.DOCKS)) {
  if (dock !== S.raft.dock) { Sim.act.sail(S, dock); Sim.drain(); }
  W.applyDug(S);
  const b = Sim.bounds(S);
  for (const dir of [1, -1]) {
    S.px = (dir > 0 ? b.L + 1 : b.R - 1) * 16; S.py = 10 * 16; S.vx = S.vy = 0;
    const st = { onGround: false, bound: false }; let t = 0, stuck = 0, lastx = S.px, maxx = S.px, minx = S.px;
    while (t < 240) {
      const ahead = W.collides(S.px + dir * 3, S.py), inW = W.tileAt(Math.floor((S.px + 5) / 16), Math.floor((S.py + 9) / 16)) === W.WATER;
      W.stepPlayer(S, 1 / 60, { ax: dir, jump: (st.onGround && ahead) || inW }, st); t += 1 / 60;
      maxx = Math.max(maxx, S.px); minx = Math.min(minx, S.px);
      if (dir > 0 ? S.px >= (b.R + 1) * 16 - 11 : S.px <= b.L * 16 + 1) break;
    }
    const reached = dir > 0 ? S.px >= (b.R + 1) * 16 - 11 : S.px <= b.L * 16 + 1;
    console.log(dock, dir > 0 ? '→' : '←', reached ? 'OK' : 'STUCK at x=' + (S.px / 16).toFixed(1), t.toFixed(1) + 's'); if (!reached) fail++;
  }
}
// 구덩이: 깊이 1~2칸은 점프로 나오고, 3칸은 못 나온다(블록을 놓아 나온다)

for (const depth of [1,2,3]) {
  Sim.act.sail(S,'start'); Sim.drain(); W.applyDug(S);
  const x = 60, g = W.GY[x]; for (let d = 0; d < depth; d++) W.setTile(S, x, g + d, W.AIR);
  S.px = x*16 + 3; S.py = (g+depth)*16 - 18; S.vx = S.vy = 0; const st={onGround:true,bound:false}; let out=false;
  for (let i=0;i<300;i++){ W.stepPlayer(S,1/60,{ax: i>20?1:0, jump:true},st); if (S.py + 18 <= g*16 + 0.5 && Math.abs(S.px - x*16) > 11) { out=true; break; } }
  console.log('구덩이 깊이', depth, out ? '나옴' : '못 나옴'); if ((depth <= 2) !== out) fail++;
  for (const k in S.dug) delete S.dug[k]; W.applyDug(S);
}

if (fail) { console.error('이동 점검 실패 ' + fail + '건'); process.exit(1); }
console.log('이동 점검 통과');
