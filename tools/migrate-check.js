// 옛 저장 읽기 시험(16단계): 폭 380 한 줄 월드 기준의 옛 저장(ver 2)과 폭 120 시절 저장(ver 없음)을 새 행성별 맵 형식으로 읽어
// 땅 파기·얼음 녹임·플레이어 위치·장치 위치가 보존되는지 본다. 사용: node tools/migrate-check.js   (브라우저 없이)
global.window = global; require('../chem.js'); global.Chem = window.Chem;
const Sim = require('../sim.js'); global.Sim = Sim;
require('../world.js');
const W = global.World, P = Sim.ISLANDS;
let fail = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fail++; };
const legacy = (o) => Object.assign(JSON.parse(JSON.stringify(Sim.newState())), { ver: 2 }, o);
const OLD = 380;
// 1. 불시착 행성(옛 창 오프셋 0): 키만 폭 380 → 120으로 다시 매겨진다
{
  const j = legacy({ px: 60 * 16, py: 20 * 16, dug: { [30 * OLD + 60]: 0, [24 * OLD + 92]: 7 }, melt: { [24 * OLD + 92]: 40 } });
  const S = Sim.merge(j);
  ok('불시착: 땅 파기 키 이전', S.dug['start:' + (30 * 120 + 60)] === 0 && S.dug['start:' + (24 * 120 + 92)] === 7 && Object.keys(S.dug).length === 2, JSON.stringify(S.dug));
  ok('불시착: 얼음 녹임 키 이전', S.melt['start:' + (24 * 120 + 92)] === 40 && Object.keys(S.melt).length === 1, JSON.stringify(S.melt));
  ok('불시착: 위치 그대로(오프셋 0)', S.px === 60 * 16 && S.py === 20 * 16 && S.ver === 3);
  W.applyDug(S);
  ok('불시착: 맵에 땅 파기가 입혀짐', W.tileAt(60, 30) === W.AIR && W.tileAt(92, 24) === W.WATER);
}
// 2. 허브(오프셋 106)와 얼음 위성(오프셋 291): 키·위치에서 오프셋을 뺀다. 경계(115 | 116)도 확인
{
  const j = legacy({ raft: { cells: 6, dock: 'plaza' }, px: 140 * 16 + 8, py: 24 * 16 - 18, dug: { [24 * OLD + 135]: 0, [26 * OLD + 115]: 0, [26 * OLD + 116]: 0, [30 * OLD + 335]: 0, [28 * OLD + 214]: 0 }, melt: { [24 * OLD + 335]: 60 } });
  const S = Sim.merge(j);
  ok('허브: 위치에서 오프셋 106칸을 뺌', S.px === (140 - 106) * 16 + 8 && S.py === 24 * 16 - 18, String(S.px));
  ok('허브: 키 이전(x 135 → 29)', S.dug['plaza:' + (24 * 112 + 29)] === 0, JSON.stringify(S.dug));
  ok('경계: x 115는 불시착, 116은 허브(116 → 10)', S.dug['start:' + (26 * 120 + 115)] === 0 && S.dug['plaza:' + (26 * 112 + 10)] === 0);
  ok('얼음 위성: x 335 → 44', S.dug['polar:' + (30 * 102 + 44)] === 0 && S.melt['polar:' + (24 * 102 + 44)] === 60, JSON.stringify([S.dug, S.melt]));
  ok('고원: x 214 → 13', S.dug['alpine:' + (28 * 102 + 13)] === 0);
  ok('이전한 키가 모두 새 형식', Object.keys(S.dug).every(k => /^(start|plaza|alpine|polar):\d+$/.test(k)) && Object.keys(S.dug).length === 5);
  W.applyDug(S);   // 탐사정이 허브에 있으니 허브 맵을 불러온다
  ok('허브 맵에 땅 파기가 입혀짐', W.tileAt(29, 24) === W.AIR && W.dim.W === 112);
}
// 3. 폭 120 시절 저장(ver 없음): 두 번 이전된다(120 → 380 → 행성별), 튜토리얼을 넘긴 저장은 뗏목 파편 수리·목표 번호가 보정된다
{
  const j = legacy({ px: 50 * 16, dug: { [30 * 120 + 50]: 0 }, melt: {}, qDone: 3 }); delete j.ver;
  const S = Sim.merge(j);
  ok('폭 120 시절: 키 이전과 목표 보정', S.dug['start:' + (30 * 120 + 50)] === 0 && S.qDone === 4 && S.f.raft === true && S.ver === 3, JSON.stringify([S.dug, S.qDone]));
}
// 4. 장치 위치(u)와 인벤토리·진행은 그대로, 이미 새 형식인 저장은 다시 이전되지 않는다
{
  const j = legacy({ raft: { cells: 6, dock: 'start' }, placed: [{ id: 'fire', u: 0, x: 107, y: 23, s: { level: 2, fuel: 5 } }, { id: 'still', u: 3, x: 110, y: 23, s: { w: 10, ns: 0, outW: 0, outS: 0, run: false, T: 25 } }], nodes: { tr29: 2 }, qDone: 5, inv: Object.assign(Sim.newState().inv, { stone: 7 }) });
  const S = Sim.merge(j);
  ok('장치·채집 기록·인벤토리 보존', S.placed.length === 2 && S.placed[1].u === 3 && S.nodes.tr29 === 2 && S.qDone === 5 && S.inv.stone === 7);
  const S2 = Sim.merge(JSON.parse(JSON.stringify(S)));
  ok('새 형식 저장은 그대로(두 번 이전되지 않음)', JSON.stringify(S2.dug) === JSON.stringify(S.dug) && S2.px === S.px);
  const S3 = Sim.merge(legacy({ px: 140 * 16, raft: { cells: 4, dock: 'plaza' } })); const S4 = Sim.merge(JSON.parse(JSON.stringify(S3)));
  ok('허브 저장을 다시 읽어도 위치가 변하지 않음', S3.px === 34 * 16 && S4.px === 34 * 16);
}
// 5. 1인칭·탑다운 저장(S.fp)은 이 필드를 쓰지 않으므로 건드리지 않는다
{
  const j = legacy({ fp: { x: 5, y: 12, z: 6, yaw: 0, pitch: 0, melted: {} }, px: 777, melt: { 'iceblock-polar-3': 40 } });
  const S = Sim.merge(j);
  ok('fp 저장: 위치·얼음 녹임 키 그대로', S.px === 777 && S.melt['iceblock-polar-3'] === 40 && S.ver === 3);
}
// 6. 맵 생성 함수는 크기를 인자로 받는다(17단계: 800 × 110)
{
  const g = W.genPlanet('start', 200, 80, 0);
  ok('genPlanet(크기 인자)', g.map.length === 200 * 80 && g.gy.length === 200);
  const a = W.genPlanet('start', P.start.W, P.start.H, P.start.off);
  ok('불시착 맵 크기', a.map.length === 120 * 56 && a.gy[60] === 24);
}
if (fail) { console.error('옛 저장 읽기 점검 실패 ' + fail + '건'); process.exit(1); }
console.log('옛 저장 읽기 점검 통과');
