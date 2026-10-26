// 계산 모듈(sim.js)을 DOM 없이 Node에서 돌려, 분리 전 game.js가 낸 기준값(sim-baseline.json)과 같은지 확인한다.
// 사용: node tools/sim-check.js   (의존성 없음)
// 기준값은 sim.js 분리 직전의 game.js를 브라우저에서 고정 난수로 돌려 저장한 것이다(DESIGN.md §4-5).
const fs = require('fs'), path = require('path');
const Sim = require('../sim.js'), scen = require('./sim-scenarios.js');
if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('sim.js는 DOM 없이 돌아야 합니다');
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'sim-baseline.json'), 'utf8'));
let bad = 0;
for (const [name, fn] of Object.entries(scen)) {
  let a = 12345;   // mulberry32 고정 시드: 서리 늑대 출현이 같은 순서로 일어난다
  Sim.setRng(() => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; });
  const S = Sim.newState();
  const r = fn(S, dm => { Sim.advance(S, dm); Sim.drain(); });
  const same = JSON.stringify(JSON.parse(JSON.stringify(r))) === JSON.stringify(base[name]);
  if (!same) bad++;
  console.log((same ? 'PASS ' : 'FAIL ') + name);
}
console.log(bad ? `실패 ${bad}건` : '모두 통과');
process.exit(bad ? 1 : 0);
