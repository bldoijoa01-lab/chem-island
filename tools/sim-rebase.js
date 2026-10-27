// 기준 로그 갱신 도구(16단계): 문구만 달라진 시나리오를 새 결과로 바꿔 쓴다. 숫자 필드(log 제외)가 하나라도 다르면 갱신하지 않고 실패한다.
// 사용: node tools/sim-rebase.js   (사람이 diff를 확인한 뒤 커밋한다. DESIGN.md §4-22에 이유를 적는다)
const fs = require('fs'), path = require('path'), Sim = require('../sim.js'), scen = require('./sim-scenarios.js');
const file = path.join(__dirname, 'sim-baseline.json'), base = JSON.parse(fs.readFileSync(file, 'utf8'));
const strip = (o) => Array.isArray(o) ? o.map(strip) : (o && typeof o === 'object') ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'log').map(([k, v]) => [k, strip(v)])) : o;
let bad = 0, changed = 0;
for (const [n, fn] of Object.entries(scen)) {
  let a = 12345; Sim.setRng(() => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; });
  const S = Sim.newState(), r = JSON.parse(JSON.stringify(fn(S, dm => { Sim.advance(S, dm); Sim.drain(); })));
  if (JSON.stringify(r) === JSON.stringify(base[n])) continue;
  if (JSON.stringify(strip(r)) !== JSON.stringify(strip(base[n]))) { console.error('숫자 필드가 다릅니다: ' + n); bad++; continue; }
  base[n] = r; changed++; console.log('로그만 갱신: ' + n);
}
if (bad) process.exit(1);
fs.writeFileSync(file, JSON.stringify(base, null, 1) + '\n'); console.log('갱신 ' + changed + '건');
