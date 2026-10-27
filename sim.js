// 화학 우주 이야기 — 계산 모듈(상태·시간·장치·얼음 생물·행동 규칙).
// window·DOM·캔버스를 쓰지 않는다. 화면(game.js)은 이 모듈이 바꾼 상태 S와 `Sim.drain()`이 돌려주는 이벤트만 읽는다.
// 화학 식·상수는 chem.js(Chem)에 있고, 여기서는 그 식을 장치 규칙으로 엮는다. 헤드리스(Node)에서도 같은 결과가 나온다.
(function (root) {
  const C = (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./chem.js') : root.Chem;

  const FIRE_T = [25, 105, 115, 130, 145];       // 화덕 세기별 열원 온도(℃)
  const FIRE_BURN = [0, 0.5, 1, 2, 3];           // 세기별 나뭇가지 소모(개/시간)
  const FIRE_NAME = ['꺼짐', '약불', '중불', '강불', '최강'];
  // 얼음 생물(얼음 몸): 질량 M(g)이 곧 체력. 아래 값은 모두 가정(임의값) — 플레이 테스트로 조정하고 DESIGN.md에 이력을 남긴다
  const WOLF = {
    MIN_M: 100, MAX_M: 300,   // 가정(임의값) 출현 질량 범위(g)
    SPAWN_P: 0.02,            // 가정(임의값) 영하의 밤 동안 1분마다 출현할 확률
    MAX: 3,                   // 가정(임의값) 동시에 있을 수 있는 얼음 생물 수(장치 수도 넘지 않음)
    ATTACK_MIN: 60,           // 가정(임의값) 한 장치에 붙어 있다가 파손시키는 데 걸리는 시간(분)
    K_FIRE: 7,                // 가정(임의값) 켜진 화덕이 얼음 생물에게 전하는 열: K_FIRE·(열원 온도) J/분
    K_AIR: 40,                // 가정(임의값) 0 ℃ 이상의 공기가 얼음 생물에게 전하는 열: K_AIR·(기온) J/분
  };
  const NIGHT_FROM = 20, NIGHT_TO = 5;           // 몬스터가 나오는 밤(시)
  const SEA_BUCKET = { water: 193, nacl: 7 };    // 바닷물 1통 = 200 g (NaCl 3.5 %)
  const DEV = {
    fire:      { name: '화덕',        cost: { stick: 6, sand: 4 },              unlock: 0, needFire: false },
    still:     { name: '증류기',      cost: { bottle: 2, stick: 4 },             unlock: 0, needFire: true },
    cooker:    { name: '압력 밥솥',   cost: { bottle: 3, stick: 4, sand: 2 },    unlock: 3, needFire: true },
    cooler:    { name: '냉각 상자',   cost: { ice: 3, salt: 20 },                unlock: 5, needFire: false },
    collector: { name: '기체 포집기', cost: { bottle: 2, syringe: 1 },           unlock: 6, needFire: false },
  };
  const RECIPES = [
    { id: 'bottle', out: 'bottle', n: 1, cost: { sand: 3, stick: 1 }, note: '모래를 가열해 유리로' },
    { id: 'syringe', out: 'syringe', n: 1, cost: { bottle: 1, stick: 2 }, note: '피스톤으로 기체의 양을 조절 [#8]' },
    { id: 'pickaxe', out: 'pickaxe', n: 1, cost: { stick: 2, stone: 2 }, note: '돌을 팔 수 있다 (허브 보급 상자에서 처음 돌을 얻는다)' },
    { id: 'shaker', out: 'shaker', n: 1, cost: { bottle: 1, stick: 1 }, note: '소금을 얼음·얼음 생물에 뿌린다 — 어는점 내림 [#37 #39]' },
    { id: 'thermo', out: 'thermo', n: 1, cost: { bottle: 1, sand: 2 }, note: '장치·땅·공기의 온도를 읽는다' },
  ];
  const QUESTS = [
    { t: '바닷물 1통을 뜨고, 화덕을 설치하세요', ok: f => f.sea && f.fire, hint: '건설 → 화덕. 바닷가에서 E로 바닷물 뜨기' },
    { t: '증류기로 증류수 200 g을 얻으세요', ok: f => f.dW >= 200, hint: '증류기는 화덕 바로 옆에. 바닷물을 넣고 가열 시작' },
    { t: '증류에서 소금 20 g을 모으세요', ok: f => f.dS >= 20, hint: '바닷물이 농축되면 NaCl 결정이 남아요' },
    { t: '해안의 탐사정 잔해를 수리해 이륙하세요', ok: f => f.raft, hint: '동쪽 해안의 탐사정 잔해에서 E. 냉각계를 채울 증류수 150 g + 소금 20 g이 필요해요(직접 증류해 얻은 것이어야 해요). 이륙하면 허브 정거장의 신호가 잡혀요' },
    { t: '압력 밥솥으로 2기압 이상에서 라면을 끓이세요', ok: f => f.ramenP >= 2, hint: '면 1개 + 증류수 300 g. 화덕 세기를 올려야 할 수도 있어요' },
    { t: '−10 ℃ 이하의 한제 팩을 만드세요', ok: f => f.packT <= -10, hint: '얼음은 불시착 행성 설원이나 얼음 위성에서. 소금을 섞으면 어는점이 내려가요' },
    { t: '공기 캡슐 4개를 만드세요', ok: f => f.caps >= 4, hint: '기체 포집기에서 주사기로 공기를 모아요' },
    { t: '허브 정거장의 대기 처리 코어를 정화하세요', ok: f => f.boss, hint: '허브 정거장의 제단. 소금·증류수·한제 팩·캡슐(허브 보급 상자)을 챙기세요' },
    { t: '얼음 생물 1마리를 정화하세요', ok: f => f.wolf >= 1, hint: '밤에 기온이 영하로 내려가면 얼음 생물이 장치에 붙어요. 소금을 뿌리면 얼음이 녹고, 화덕 열로도 녹일 수 있어요' },
    { t: '저기압 고원 행성에서 증류수 100 g을 얻으세요', ok: f => f.alpineW >= 100, hint: '허브 정거장 동쪽 관문에서 이륙(라면 목표 뒤). 같은 증류기가 낮은 기압에서 어떻게 달라지는지 기록에 남아요' },
    { t: '얼음 위성에서 소금 뿌리개로 얼음 타일 1칸을 녹이세요', ok: f => f.polarMelt, hint: '허브 정거장 북쪽 관문(한제 목표 뒤). 기온이 낮을수록 같은 얼음을 녹이는 데 소금이 더 들어요. 온도계로 재 보세요' },
  ];
  // 월드(16단계): 행성마다 단면 맵 하나. W × H는 칸 수(타일 16 px), off는 옛 한 줄 월드(폭 380)에서 이 행성 창이 시작하던 x(세이브 이전과 지형 생성에 쓴다).
  // 맵 크기는 가정(임의값)이고 17단계에서 불시착 행성을 800 × 110으로 키운다(DESIGN.md §4-22). L..R은 걸을 수 있는 범위(맵 안 타일 x, 접안 쪽 여유 포함).
  // 탐사정이 더 멀리 뻗으면 그만큼 넓어진다. 행성 사이는 걸어서 건널 수 없고 궤도 이동으로만 간다.
  const ISLANDS = {
    start: { name: '불시착 행성', W: 800, H: 110, off: 0, L: 13, R: 798 },   // 17-a: 가로 800 × 세로 110. 옛 120칸 영역(x 0..119)은 좌표 그대로 "추락 반도"가 되고 동쪽에 만과 대륙이 이어진다(DESIGN.md §4-23)
    plaza: { name: '허브 정거장', W: 112, H: 56, off: 106, L: 12, R: 96 },
    alpine: { name: '저기압 고원 행성', W: 102, H: 56, off: 201, L: 12, R: 86 },
    polar: { name: '얼음 위성', W: 102, H: 56, off: 291, L: 12, R: 86 },
  };
  const LEGACY_W = 380, LEGACY_CUT = [[116, 'start'], [208, 'plaza'], [297, 'alpine']];   // 옛 월드(폭 380)의 x를 행성으로 나누는 경계: < 116 불시착 · < 208 허브 · < 297 고원 · 그 이상 얼음 위성
  // 행성별 환경(가정(임의값)): 같은 장치를 다른 조건에서 돌려 비교한다. P = 외기 압력(atm), dT = 기온 보정(℃, C.airTemp에 더함)
  const ENV = {
    start: { name: '불시착 행성', P: 1.0, dT: 0 },
    plaza: { name: '허브 정거장', P: 1.0, dT: 0 },
    alpine: { name: '저기압 고원 행성', P: 0.65, dT: -10 },   // 높은 곳의 고원 호수 행성: 외기 압력이 낮다는 설정(0.65 atm, 가정), 기온은 10 ℃ 낮게   [#18 #19]
    polar: { name: '얼음 위성', P: 1.0, dT: -20 },       // 기온 20 ℃ 낮게: 밤 −35 ℃에서는 같은 얼음을 녹이는 데 소금이 크게 더 든다(m_eq = |T|/(i·Kf))   [#37 #39]
  };
  // 탐사정(개인 자산): 장치는 항상 탐사정 위에 짓는다. 위치는 탐사정의 해안 쪽 끝에서 떨어진 칸 수 u로 저장한다(탐사정이 옮겨 가도 유지).
  // 아래 값은 모두 가정(임의값): 시작 칸 수, 최대 칸 수, 확장 단위·재료, 궤도 이동 시간, 파편 수리 재료. DESIGN.md §4-6·§4-7에 근거와 조정 이력을 적는다.
  const RAFT = {
    BASE_CELLS: 4,                        // 가정(임의값) 처음 탐사정 칸 수(화덕 1 + 장치 1)
    MAX_CELLS: 12,                        // 가정(임의값) 탐사정 최대 칸 수
    EXPAND: 2, EXPAND_COST: { stick: 10, sand: 4 },   // 가정(임의값) 한 번에 넓히는 칸 수와 재료
    REPAIR_COST: { water: 150, salt: 20 },  // 가정(임의값) 15단계: 파편을 고쳐 이륙 가능하게 하는 재료 = 냉각계를 채우는 증류수 150 g + 소금 20 g(이전: 나뭇가지 8 + 모래 4)
    REPAIR_NEED: { dW: 200, dS: 20 },    // 가정(임의값) 수리 조건: 직접 증류로 얻은 증류수·소금 누적(f.dW, f.dS). 시작 증류수 400 g만으로 증류 없이 고쳐지지 않게 한다(= 목표 2·3 달성)
    ROW: 25,                              // 탐사정 바닥이 놓이는 타일 줄(바다 표면)
    DEV_Y: 23,                            // 장치(2x2)의 위쪽 타일 줄 = ROW − 2
  };
  // 행성별 탐사정 도킹 자리: anchor = 해안 쪽 끝 타일 x, dir = 바다 쪽 방향(+1 오른쪽, −1 왼쪽)
  const DOCKS = {
    start: { island: 'start', anchor: 107, dir: 1 },    // 불시착 행성 동쪽 접안 구역(맵 안 좌표)
    plaza: { island: 'plaza', anchor: 17, dir: -1 },    // 허브 정거장 서쪽 접안 구역(옛 월드 x 123 − 오프셋 106)
    alpine: { island: 'alpine', anchor: 17, dir: -1 },  // 저기압 고원 행성 서쪽 접안 구역(옛 218 − 201)
    polar: { island: 'polar', anchor: 17, dir: -1 },    // 얼음 위성 서쪽 접안 구역(옛 308 − 291)
  };
  const SAIL_MIN = { start: 30, plaza: 30, alpine: 60, polar: 60 };   // 가정(임의값) 도착지별 궤도 이동 시간(게임 분)
  const UNLOCK = { alpine: 5, polar: 6 };                              // 가정(임의값) 해금 순서: 라면(목표 5) 뒤 저기압 고원 행성, 한제(목표 6) 뒤 얼음 위성
  // 허브 정거장의 사방 궤도 관문: 행선지(4단계에서 탐사 행성을 연다)
  const HARBORS = [
    { dock: 'start', label: '서쪽 관문', name: '불시착 행성', open: true },
    { dock: 'alpine', label: '동쪽 관문', name: '저기압 고원 행성', open: true },
    { dock: 'polar', label: '북쪽 관문', name: '얼음 위성', open: true },
    { dock: 'volcano', label: '남쪽 관문', name: '후속 행성', open: false },
  ];
  const dockOf = (S) => DOCKS[S.raft.dock];
  const raftAnchor = (S) => dockOf(S).anchor;
  const raftXs = (S) => { const { anchor, dir } = dockOf(S), xs = []; for (let i = 0; i < S.raft.cells; i++) xs.push(anchor + dir * i); return xs; };
  const devX = (S, u) => { const { anchor, dir } = dockOf(S); return dir > 0 ? anchor + u : anchor - u - 1; };   // 장치(2칸 폭)의 왼쪽 타일 x
  const raftU = (S, tx) => { const { anchor, dir } = dockOf(S); return dir > 0 ? tx - anchor : anchor - tx - 1; };   // 위의 역
  const bounds = (S) => { const isl = ISLANDS[dockOf(S).island], xs = raftXs(S); return { L: Math.min(isl.L, Math.min(...xs) - 1), R: Math.max(isl.R, Math.max(...xs) + 1) }; };
  // 탐사정이 옮겨 가거나 넓어진 뒤 장치의 세계 좌표를 u에서 다시 계산한다
  function syncRaft(S) { if (S.fp) return; for (const d of S.placed) if (d.u !== undefined) { d.x = devX(S, d.u); d.y = RAFT.DEV_Y; } }
  // 냉각 상자 게임 설정(가정(임의값)): 얼음 100 g에 넣을 수 있는 소금의 상한(g). 어는점 내림 식에는 하한이 없어서 투입량을 제한한다(30 g → 약 −19 ℃)
  const COOLER = { SALT_PER_100G: 30 };
  // 증류기 게임 설정(가정(임의값)): 증발 속도 계수(g/분 per atm)와 끝나는 기준(처음 물의 몇 %가 남으면 끝)
  const STILL = { RATE: 12, END_FRAC: 0.10 };
  const VALVE = [1.0, 1.5, 2.0, 2.5, Infinity];
  const VALVE_NAME = ['1.0 atm (열림)', '1.5 atm', '2.0 atm', '2.5 atm', '잠금(막힘)'];

  // ---------- 이벤트·난수 ----------
  // 계산은 화면을 부르지 않고 이벤트만 쌓는다: {t:'say', text} · {t:'burst', d} · {t:'puffWolf', m} · {t:'refresh'}
  let queue = [];
  const emit = (e) => { queue.push(e); };
  const say = (text) => emit({ t: 'say', text });
  const drain = () => { const q = queue; queue = []; return q; };
  let rngFn = null;                              // 시험용으로 setRng로 바꿀 수 있다(헤드리스 비교). 없으면 그때그때의 Math.random
  const rng = () => (rngFn || Math.random)();
  const fmt = (v, d = 1) => Number(v).toFixed(d);
  const clockText = (S) => `${S.day}일차 ${String(Math.floor(S.min / 60)).padStart(2, '0')}:${String(Math.floor(S.min % 60)).padStart(2, '0')}`;
  function logEv(S, type, text) { S.log.push({ day: S.day, t: clockText(S), type, text: String(text) }); if (S.log.length > 300) S.log.shift(); }

  // ---------- 상태 ----------
  function newState() {
    return {
      day: 1, min: 360, px: 104 * 16, py: 18 * 16,   // 시작 위치는 땅 위 허공에서 떨어져 내려앉는다(지형 높이가 칸마다 달라서)
      vx: 0, vy: 0, face: 1, speed: 1,
      inv: { stick: 8, sand: 6, sea: 0, ice: 0, bottle: 0, syringe: 0, sugar: 0, salt: 0, water: 400, noodle: 1, ramen: 0, dirt: 0, stone: 0, pickaxe: 0, shaker: 0, thermo: 0 },
      caps: [], packs: [], placed: [], nodes: {}, boxDay: 0, mobs: [], mobId: 0, dusk: 0, dug: {}, melt: {}, stoneGift: false,
      f: { sea: false, fire: false, dW: 0, dS: 0, ramenP: 0, packT: 0, caps: 0, boss: false, wolf: 0, raft: false, alpineW: 0, polarMelt: false },
      qDone: 0, log: [], memo: '', ver: 4, base: null,   // base: 기지 코어 { x, y, at(설치 시각 ms), id } — 17-a. 설치 전에는 null
      raft: { cells: RAFT.BASE_CELLS, dock: 'start' },
    };
  }
  // 서버(Firebase)는 빈 배열을 지우고, 구멍 난 배열을 객체로 돌려주기도 한다 → 배열·객체 필드를 기본 형태로 복구한다
  const asArray = (v, def) => Array.isArray(v) ? v.filter(x => x != null) : (v && typeof v === 'object') ? Object.values(v).filter(x => x != null) : def;
  const asObject = (v, def) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : def;
  function merge(j) {
    const d = newState(), S = Object.assign(d, j, { inv: Object.assign(d.inv, asObject(j.inv, {})), f: Object.assign(d.f, asObject(j.f, {})), raft: Object.assign(d.raft, asObject(j.raft, {})) });
    for (const k of ['caps', 'packs', 'placed', 'mobs', 'log']) S[k] = asArray(S[k], []);
    for (const k of ['nodes', 'dug', 'melt']) S[k] = asObject(S[k], {});
    migrateWorld(S, j); migrateRaft(S); return S;
  }
  // 월드가 넓어지고(120 → 380칸) 목표가 하나 늘었고(ver 2), 월드가 행성별 맵으로 나뉘었다(ver 3, 16단계):
  // ver < 2: 땅 파기 기록의 타일 번호(y·120+x)를 폭 380으로 다시 매기고, 튜토리얼(목표 1~3)을 넘긴 세이브는 탐사정 잔해를 이미 고친 것으로 보며 qDone을 새 목록에 맞춘다.
  // ver < 3: 땅 파기·얼음 녹임 키(y·380+x)를 행성별 키 `행성id:y·W+x'`로 옮기고, 플레이어 위치 S.px에서 행성 창의 오프셋을 뺀다. 그 밖의 필드는 그대로다.
  // ver 4(17단계): 불시착 행성이 가로 120 → 800칸이 되어 ver 3 저장의 `start:` 키(y·120+x)를 y·800+x로 다시 매긴다. 다른 행성·위치·장치는 그대로다.
  const START_W_V3 = 120;
  function migrateWorld(S, raw) {
    if (!raw || raw.ver >= 4) return;
    if (raw.ver === 3) {
      if (!S.fp) {
        const W = ISLANDS.start.W, re = (m) => { const o = {}; for (const k in m) { const mm = /^start:(\d+)$/.exec(k); if (!mm) { o[k] = m[k]; continue; } const i = +mm[1], y = Math.floor(i / START_W_V3), x = i % START_W_V3; o['start:' + (y * W + x)] = m[k]; } return o; };
        S.dug = re(S.dug || {}); S.melt = re(S.melt || {});
      }
      S.ver = 4; return;
    }
    if (raw.ver === undefined || raw.ver < 2) {
      const OLD_W = 120, re = (m) => { const o = {}; for (const k in m) { const y = Math.floor(k / OLD_W), x = k % OLD_W; o[y * LEGACY_W + x] = m[k]; } return o; };
      S.dug = re(S.dug || {}); S.melt = re(S.melt || {});
      if (S.qDone >= 3) { S.f.raft = true; S.qDone += 1; }
    }
    if (!S.fp) {   // 1인칭·탑다운 저장은 이 필드를 쓰지 않는다
      const planetOf = (gx) => { for (const [cut, id] of LEGACY_CUT) if (gx < cut) return id; return 'polar'; };
      const conv = (m) => { const o = {}; for (const k in m) { if (!/^\d+$/.test(k)) { o[k] = m[k]; continue; } const y = Math.floor(k / LEGACY_W), gx = k % LEGACY_W, p = planetOf(gx), P = ISLANDS[p], x = gx - P.off; if (x >= 0 && x < P.W && y < P.H) o[p + ':' + (y * P.W + x)] = m[k]; } return o; };
      S.dug = conv(S.dug || {}); S.melt = conv(S.melt || {});
      const dk = S.raft && DOCKS[S.raft.dock] ? S.raft.dock : 'start'; S.px = (S.px || 0) - ISLANDS[dk].off * 16;
    }
    S.ver = 4;
  }
  // 예전 세이브(장치가 땅 위, u 없음) → 탐사정 위로 옮긴다: 왼쪽에서부터 순서와 붙어 있던 관계를 지키며 해안 쪽부터 놓는다.
  // 옛 세이브는 칸 수 제한을 넘을 수 있으므로 필요한 만큼 탐사정을 넓혀 준다(제한은 새로 넓힐 때만 적용).
  function migrateRaft(S) {
    if (S.fp) return;   // 1인칭 세이브: 장치 위치는 격자 칸(x, y)이라 2D 탐사정(u)으로 옮기지 않는다
    const old = S.placed.filter(d => d.u === undefined);
    if (!old.length) return;
    const dir = dockOf(S).dir;
    old.sort((a, b) => (a.x - b.x) * dir);               // 해안 쪽(탐사정이 시작하는 쪽)에 가까운 것부터: dir>0이면 왼쪽부터
    let u = 0, prev = old[0];
    // 붙어 있던 것(간격 3칸 이하)은 그대로 붙여 두고, 떨어져 있던 것은 떨어진 채로 둔다(화덕 열이 새로 닿지 않게)
    for (const d of old) {
      if (d !== prev) { const gap = Math.abs(prev.x - d.x); u += gap <= 3 ? Math.max(2, gap) : 4; }
      d.u = u; prev = d;
    }
    S.raft.cells = Math.max(S.raft.cells, u + 2);
    S.mobs = []; syncRaft(S);                            // 얼음 생물은 장치 위치에 붙어 있었으므로 새로 나타나게 한다
    S.log.push({ day: S.day, t: clockText(S), type: '탐사정', text: `예전 세이브: 장치 ${old.length}개를 탐사정(${S.raft.cells}칸) 위로 옮겼습니다.` });
  }
  let curDev = null;   // 지금 계산·표시 중인 장치(환경을 장치마다 다르게 정하는 고리용). 기본(2D)은 항상 탐사정/탐사정이 있는 행성
  const envOf = (S) => ENV[geo.island(S, curDev)];
  const pAtm = (S) => envOf(S).P;
  const airTemp = (S) => C.airTemp(S.min) + envOf(S).dT;   // ℃, 불시착 행성 기준 오후 3시 최고(28) · 새벽 3시 최저(−15) + 행성별 보정

  // ---------- 시간 ----------
  function advance(S, dm) {
    for (let i = 0; i < dm; i++) {
      S.min += 1;
      stepDevices(S);
      stepMobs(S);
      if (S.min === 19 * 60 && S.dusk !== S.day && S.placed.length) { S.dusk = S.day; say('해가 지고 있습니다. 밤에는 기온이 영하로 내려가 얼음 생물이 나타나요.'); }
      if (S.min >= 1440) { S.min -= 1440; S.day += 1; newDay(S); }
    }
  }
  function newDay(S) {
    S.nodes = {};
    const before = S.packs.length;
    S.packs = S.packs.filter(p => p.day >= S.day);
    if (before > S.packs.length) { say('한제 팩이 밤새 녹았습니다. 팩은 당일에만 쓸 수 있어요.'); logEv(S, '팩 녹음', '한제 팩이 하루가 지나 녹음(얼음의 융해).'); }
    else say(`${S.day}일차 — 자원이 다시 자랐습니다.`);
  }

  // ---------- 장치 시뮬레이션 (1분 단위) ----------
  // 교체 고리: "두 장치가 붙어 있는가"만 위치 모델에 따라 다르다. 기본은 2D(탐사정 한 줄: 2x2 장치끼리 한 칸 이내).
  // 1인칭(fp/)은 격자 바닥이라 fp/main.js가 geo.adjacent를 격자 간격 판정으로 바꿔 끼운다(x, y = 격자 칸). 화학 계산은 그대로다.
  // island(S, d): 장치 d의 환경을 정하는 행성(기본: 탐사정/탐사정이 있는 행성). heatSources(S, d): d를 데우는 화덕들(기본: 옆 화덕).
  // 1인칭(fp/)은 행성 지표 부지 장치에 그 행성을, 열선으로 연결된 화덕에 열원 자격을 주도록 바꿔 끼운다(10단계). 화학 계산은 그대로다.
  const geo = { adjacent: (a, b) => Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 1, island: (S, d) => dockOf(S).island };
  const adjacentTo = (a, b) => a !== b && geo.adjacent(a, b);
  geo.heatSources = (S, d) => S.placed.filter(f => f.id === 'fire' && adjacentTo(f, d));
  const fireNear = (S, d) => geo.heatSources(S, d);
  function stepDevices(S) {
    for (const d of S.placed) {
      curDev = d;   // 이 장치의 환경(geo.island)으로 계산한다
      const s = d.s;
      if (s.broken && d.id !== 'cooker') { if (d.id === 'fire') s.level = 0; continue; }   // 파손: 수리 전에는 작동하지 않음
      if (d.id === 'fire') {
        if (s.level > 0) {
          s.fuel -= FIRE_BURN[s.level] / 60;
          if (s.fuel <= 0) { s.fuel = 0; s.level = 0; say('화덕의 연료가 떨어졌습니다.'); }
        }
      } else if (d.id === 'still') stepStill(S, d);
      else if (d.id === 'cooker') stepCooker(S, d);
    }
    curDev = null;
  }
  function heatOf(S, d) {
    let t = 25;
    for (const f of fireNear(S, d)) if (!f.s.broken && f.s.level > 0 && f.s.fuel > 0) t = Math.max(t, FIRE_T[f.s.level]);
    return t;
  }

  // 증류기: 증발 속도 ∝ (용액 증기압 − 외부 압력)   [#19 #30 #34]
  function stepStill(S, d) {
    const s = d.s;
    s.T = heatOf(S, d);
    if (s.broken || !s.run || s.w <= 0) return;
    const np = 2 * s.ns;                       // NaCl → Na⁺ + Cl⁻ (i = 2 가정)
    const xw = C.xw(s.w, np);
    const P = pAtm(S);                         // 외기 압력: 증기압이 이보다 커야 끓는다(저기압 고원 행성은 낮아 더 낮은 온도에서 끓음)
    s.xw = xw; s.tb = C.tb(P, xw);
    const pv = C.pSol(s.T, xw);
    s.pv = pv;
    if (pv > P) {
      // 게임 설정(가정(임의값)): 처음 넣은 물의 STILL.END_FRAC만 남으면 증류가 끝나고 소금이 남는다(질량 보존). 물이 거의 없을 때 끓는점이 무한히 커지는 것도 막는다.
      if (!s.w0) s.w0 = s.w;
      const wmin = STILL.END_FRAC * s.w0;
      const ev = Math.min(STILL.RATE * (pv - P), s.w - wmin);   // 증발 속도 ∝ (증기압 − 외부 압력): 게임 설정(경험칙, 가정)
      s.w -= ev; s.outW += ev;
      if (s.w - wmin < 1e-6) {
        s.outS += s.ns * C.MW_NACL; s.ns = 0; s.w = 0; s.w0 = 0; s.run = false;
        say('증류기: 물이 거의 다 증발해 소금이 남았습니다.');
        logEv(S, '증류 완료', `남은 물이 처음의 ${STILL.END_FRAC * 100} %(게임 설정)가 되어 종료 — 소금이 남음(몰랄 농도 ${fmt(C.molality(s.outS / C.MW_NACL, wmin), 1)} mol/kg)`);
      }
    }
  }

  // 압력 밥솥: 압력 P → 끓는점 Tb(P) → 조리 속도 2^((T−100)/10)   [#5 #18 #34]
  // 밸브 숫자는 (해수면 기준) 게이지 압력의 감각: 상한 = 외기 압력 + (밸브 − 1). 폭발 한계(3 atm)도 게이지 기준으로 P + 2 atm
  function cookerState(s, Theat, P = 1) {
    const np = 2 * s.saltG / C.MW_NACL;
    const xw = C.xw(s.water || 300, np);
    const pHeat = C.pSol(Theat, xw);
    const cap = VALVE[s.valve] + P - 1;
    const pIn = Math.max(P, Math.min(cap, pHeat));       // 내부 압력은 외기 압력보다 낮아지지 않는다(밀폐 용기가 진공이 될 수는 없다)
    const boil = Theat >= C.tb(P, xw);                   // 열원이 용액의 끓는점(외기 압력 기준)에 닿아야 끓고, 끓어야 조리가 진행된다
    const Teff = pIn === cap ? C.tb(cap, xw) : Theat;
    // 조리 속도 2^((T−100)/10)는 게임 설정(경험칙, 가정)이며 끓는 100 ℃ 부근에서만 쓴다: 끓지 않으면 0
    return { xw, pHeat, pIn, Teff, boil, speed: boil ? Math.pow(2, (Math.min(Teff, Theat) - 100) / 10) : 0 };
  }
  function stepCooker(S, d) {
    const s = d.s;
    s.T = heatOf(S, d);
    if (s.broken || !s.run) return;
    const P = pAtm(S), cs = cookerState(s, s.T, P), limit = P + C.PBURST - 1;   // 한계 압력(절대): 해수면 3 atm = 게이지 2 atm
    s.cs = cs;
    if (cs.pIn > limit && tutorial(S)) {   // 튜토리얼 안전장치: 한계 압력에서 멈추고 터지지 않는다
      cs.pIn = limit; cs.Teff = C.tb(limit, cs.xw);
      if (!s.safeWarned) { s.safeWarned = true; say('튜토리얼 안전장치: 압력이 한계에 닿아 멈췄습니다. 이륙 뒤에는 터집니다!'); logEv(S, '안전장치', `튜토리얼 중 밥솥 압력이 ${fmt(limit, 2)} atm에 닿아 폭발하지 않고 제한됨(밸브 ${VALVE_NAME[s.valve]}, 열원 ${s.T}℃)`); }
    } else if (cs.pIn > limit) {
      s.broken = true; s.run = false; s.prog = 0;
      say('압력 밥솥이 터졌습니다! 재료를 잃었어요.');
      logEv(S, '폭발', `압력 밥솥: 밸브 ${VALVE_NAME[s.valve]}, 열원 ${s.T}℃ → 내부 압력 ${fmt(cs.pIn, 2)} atm > 한계 ${fmt(limit, 2)} atm (${envOf(S).name}, 외기 ${P} atm)`);
      emit({ t: 'burst', d });
      return;
    }
    s.prog += cs.speed;
    if (s.prog >= 18) {
      s.run = false; s.done = true; s.doneP = cs.pIn;
      say('라면이 완성되었습니다!');
      logEv(S, '조리 완료', `내부 압력 ${fmt(cs.pIn, 2)} atm, 끓는점 ${fmt(cs.Teff, 1)}℃, 속도 x${fmt(cs.speed, 2)} [${envOf(S).name}: 외기 ${P} atm]`);
    }
  }

  // ---------- 얼음 생물 ----------
  const devAt = (S, m) => S.placed.find(d => d.x === m.dx && d.y === m.dy);
  const isNightHour = h => h >= NIGHT_FROM || h < NIGHT_TO;
  function wolfHeat(S, d) {   // 이 장치 자리의 얼음 생물이 받는 열(J/분): 켜진 화덕(자기 자신 또는 이웃). Q = K·T(열원)
    const fires = d.id === 'fire' ? [d] : fireNear(S, d);
    let q = 0;
    for (const f of fires) if (!f.s.broken && f.s.level > 0 && f.s.fuel > 0) q += WOLF.K_FIRE * FIRE_T[f.s.level];
    return q;
  }
  function spawnWolf(S, T) {
    const d = S.placed[Math.floor(rng() * S.placed.length)];
    const M = Math.round(WOLF.MIN_M + rng() * (WOLF.MAX_M - WOLF.MIN_M));
    S.mobs.push({ id: ++S.mobId, k: 'wolf', M, M0: M, dx: d.x, dy: d.y, att: 0 });
    say('얼음 생물이 나타났습니다!');
    logEv(S, '얼음 생물 출현', `기온 ${fmt(T, 1)}℃, 질량 ${M} g, 위치: ${DEV[d.id].name}(${d.x})`);
  }
  function removeWolf(S, m, how, extra) {
    S.mobs.splice(S.mobs.indexOf(m), 1);
    if (how === 'ambient') { logEv(S, '얼음 생물 융해', `기온 ${fmt(airTemp(S), 1)}℃ 공기의 열로 모두 녹음`); return; }
    if (how === 'gone') { logEv(S, '얼음 생물 이탈', '장치가 철거되어 얼음 생물이 흩어짐'); return; }
    S.f.wolf++; say('얼음 생물을 정화했습니다!');
    logEv(S, '얼음 생물 정화', `${how === 'salt' ? '소금으로' : '화덕 열로'} ${fmt(m.M0, 0)} g 모두 녹임${extra ? ' · ' + extra : ''}`);
    emit({ t: 'refresh' });
  }
  const repairRecord = (S) => S.f.dW >= RAFT.REPAIR_NEED.dW && S.f.dS >= RAFT.REPAIR_NEED.dS;   // 15단계: 증류 기록 조건
  const tutorial = (S) => !S.f.raft;   // 탐사정 잔해를 고치기 전까지는 튜토리얼: 얼음 생물과 폭발을 끈다
  function stepMobs(S) {
    const T = airTemp(S), h = S.min / 60;
    if (!tutorial(S) && T < 0 && isNightHour(h) && S.placed.length && S.mobs.length < Math.min(WOLF.MAX, S.placed.length) && rng() < WOLF.SPAWN_P) spawnWolf(S, T);
    for (const m of S.mobs.slice()) {
      let d = devAt(S, m);
      if (!d || (d.s.broken && S.placed.some(x => !x.s.broken))) {   // 철거됐거나 이미 부서진 장치 → 다른 장치로
        d = S.placed.find(x => !x.s.broken && !S.mobs.some(o => o !== m && o.dx === x.x && o.dy === x.y)) || S.placed.find(x => !x.s.broken);
        if (!d) { if (!devAt(S, m)) { removeWolf(S, m, 'gone'); } continue; }
        m.dx = d.x; m.dy = d.y; m.att = 0;
      }
      // 열: 공기(0 ℃ 이상일 때) + 켜진 화덕.  녹는 얼음 = Q / 융해열 [#21]
      const qAir = T > 0 ? WOLF.K_AIR * T : 0, qFire = wolfHeat(S, d);
      m.M -= C.iceMeltByHeat(qAir + qFire);
      if (m.M <= 0) { removeWolf(S, m, qFire > 0 ? 'fire' : 'ambient'); continue; }
      // 공격: 붙어 있는 동안 시간이 쌓여 장치를 파손
      if (!d.s.broken && ++m.att >= WOLF.ATTACK_MIN) {
        m.att = 0; d.s.broken = true; d.s.run = false;
        say(`얼음 생물이 ${DEV[d.id].name}을(를) 부쉈습니다! 수리가 필요해요.`);
        logEv(S, '장치 파손', `${DEV[d.id].name}: 얼음 생물(남은 ${fmt(m.M, 0)} g)가 ${WOLF.ATTACK_MIN}분 붙어 파손`);
      }
    }
  }
  // 얼음 생물에게 소금 s g을 뿌린다(모달·소금 뿌리개 공용). 얼음 생물이 정화되면 true
  function saltOnWolf(S, m, s) {
    const T = airTemp(S), melt = C.iceMeltBySalt(T, s);
    if (melt <= 0) { say('기온이 0 ℃ 이상이라 소금이 필요 없어요.'); return false; }
    const used = melt >= m.M ? Math.min(s, C.saltForIce(T, m.M)) : s, done = Math.min(melt, m.M);
    S.inv.salt -= used; m.M -= done;
    logEv(S, '소금 뿌림', `기온 ${fmt(T, 1)}℃, 소금 ${fmt(used, 1)} g → 얼음 ${fmt(done, 0)} g 융해 (m_eq=${fmt(-T / (2 * C.KF), 2)} mol/kg)`);
    emit({ t: 'puffWolf', m });
    if (m.M <= 1e-6) { removeWolf(S, m, 'salt', `소금 ${fmt(used, 1)} g, 기온 ${fmt(T, 1)}℃`); return true; }
    say(`얼음 ${fmt(done, 0)} g가 녹았습니다. 남은 질량 ${fmt(m.M, 0)} g`);
    return false;
  }

  // ---------- 퀘스트 ----------
  function checkQuests(S) {
    while (S.qDone < QUESTS.length && QUESTS[S.qDone].ok(S.f)) {
      say(`목표 달성! ${QUESTS[S.qDone].t}`);
      logEv(S, '목표', QUESTS[S.qDone].t);
      S.qDone++;
      if (S.qDone === 3) say('압력 밥솥을 건설할 수 있게 되었습니다.');
      if (S.qDone === 4) say('탐사정이 이륙할 수 있게 되었습니다! 이제 얼음 생물과 폭발 위험도 시작됩니다.');
      if (S.qDone === 5) say('냉각 상자를 건설할 수 있게 되었습니다.');
      if (S.qDone === 6) say('기체 포집기를 건설할 수 있게 되었습니다.');
    }
  }

  // ---------- 행동 규칙 (화면에서 값을 받아 상태만 바꾼다) ----------
  const has = (S, cost) => Object.entries(cost).every(([k, v]) => (S.inv[k] || 0) >= v);
  const pay = (S, cost) => { for (const k in cost) S.inv[k] -= cost[k]; };
  const unlocked = (S, id) => S.qDone >= DEV[id].unlock;
  const act = {
    fuel(S, d, n) { n = Math.min(n, S.inv.stick); if (n <= 0) return say('나뭇가지가 없습니다.'); S.inv.stick -= n; d.s.fuel += n; },
    level(S, d, i) { if (i > 0 && d.s.fuel <= 0) return say('연료를 먼저 넣으세요.'); d.s.level = i; },
    load(S, d) {
      if (S.inv.sea < 1) return say('바닷물이 없습니다. 바닷가에서 E.');
      if (d.s.w + SEA_BUCKET.water > 650) return say('증류기가 가득 찼습니다.');
      if (d.s.w <= 0) d.s.w0 = 0;   // 비었던 증류기에 새로 채우면 끝나는 기준도 새로
      S.inv.sea--; d.s.w += SEA_BUCKET.water; d.s.w0 = (d.s.w0 || 0) + SEA_BUCKET.water; d.s.ns += SEA_BUCKET.nacl / C.MW_NACL;
    },
    toggle(S, d) { d.s.run = !d.s.run; },
    collect(S, d) {
      const w = d.s.outW, s = d.s.outS;
      S.inv.water += w; S.inv.salt += s; S.f.dW += w; S.f.dS += s;
      if (dockOf(S).island === 'alpine') S.f.alpineW += w;
      if (w > 0 || s > 0) logEv(S, '증류 수거', `증류수 ${fmt(w, 1)} g, 소금 ${fmt(s, 1)} g [${envOf(S).name}: 외기 ${pAtm(S)} atm, 순수한 물의 끓는점 ${fmt(C.tb(pAtm(S)), 1)}℃]`);
      d.s.outW = 0; d.s.outS = 0;
    },
    cook(S, d, salt, valve) {
      const s = d.s;
      if (s.broken) return say('먼저 수리하세요.');
      if (s.run || s.done) return say('이미 사용 중입니다.');
      const tank = s.tank || 0;   // 배관으로 들어온 증류수(10단계). 없으면 0이라 지금과 같다
      if (S.inv.water + tank < 300 || S.inv.noodle < 1) return say('증류수 300 g과 면 1개가 필요합니다.');
      if (salt > S.inv.salt) return say('소금이 부족합니다.');
      const fromTank = Math.min(tank, 300); s.tank = tank - fromTank;
      S.inv.water -= 300 - fromTank; S.inv.noodle--; S.inv.salt -= salt;
      s.saltG = salt; s.valve = valve; s.prog = 0; s.run = true;
    },
    // 배관(10단계): 증류기 출력(outW)을 밥솥 탱크로 옮긴다. 손으로 `collect` 후 넣는 것과 같은 증류수이고 같은 기록·목표 집계(f.dW)를 한다. 소금은 증류기에 남는다
    pipe(S, still, cooker) {
      const TANK_MAX = 650, w = Math.min(still.s.outW, TANK_MAX - (cooker.s.tank || 0));
      if (!(w > 0)) return 0;
      still.s.outW -= w; cooker.s.tank = (cooker.s.tank || 0) + w; S.f.dW += w;
      if (geo.island(S, still) === 'alpine') S.f.alpineW += w;
      curDev = still; logEv(S, '증류수 배관', `증류수 ${fmt(w, 1)} g → 밥솥 탱크 (${fmt(cooker.s.tank, 0)} g) [${envOf(S).name}: 외기 ${pAtm(S)} atm]`); curDev = null;
      return w;
    },
    take(S, d) { if (!d.s.done) return say('아직 완성되지 않았습니다.'); d.s.done = false; S.inv.ramen++; S.f.ramenP = Math.max(S.f.ramenP, d.s.doneP); say('라면 1개를 얻었습니다.'); },
    repair(S, d) {
      if (!d.s.broken) return;
      if (S.inv.stick < 2) return say('나뭇가지 2개가 필요합니다.');
      S.inv.stick -= 2; d.s.broken = false; logEv(S, '수리', `${DEV[d.id].name} 수리(나뭇가지 2개)`);
    },
    pack(S, iceN, salt) {
      if (salt > iceN * COOLER.SALT_PER_100G) return say(`소금은 얼음 100 g당 ${COOLER.SALT_PER_100G} g까지 넣을 수 있어요. (게임 설정)`), false;
      if (S.inv.ice < iceN || S.inv.salt < salt) return say('얼음이나 소금이 부족합니다.');
      if (salt <= 0) return say('소금을 넣어야 0 ℃ 아래로 내려갑니다.');
      S.inv.ice -= iceN; S.inv.salt -= salt;
      const t = C.coolTemp(iceN * 100, salt);
      S.packs.push({ T: t, M: iceN * 100, day: S.day });
      S.f.packT = Math.min(S.f.packT, t);
      logEv(S, '한제 팩', `얼음 ${iceN * 100} g + 소금 ${salt} g → ${fmt(t, 1)} ℃`);
      advance(S, 30); say(`${fmt(t, 1)} ℃ 한제 팩을 만들었습니다.`);
    },
    cap(S) {
      if (S.inv.sand < 1) return say('모래가 필요합니다.');
      S.inv.sand--; advance(S, 10);
      const n = C.moles(pAtm(S), 0.5, airTemp(S));   // 외기 압력이 낮은 행성에서는 같은 주사기에 모이는 기체가 적다   [#4 #6]
      S.caps.push({ k: 'air', n });
      S.f.caps++;
      logEv(S, '공기 캡슐', `n = ${fmt(n, 4)} mol [${envOf(S).name}: ${pAtm(S)} atm, ${fmt(airTemp(S), 1)}℃]`);
      say('공기 캡슐 1개를 만들었습니다.');
    },
    // 바닷가에서 바닷물 뜨기 / 자원 오브젝트 채집 (n: [아이템, 1회 양, 하루 횟수, 이름])
    scoop(S) { S.inv.sea++; S.f.sea = true; advance(S, 5); say('바닷물 1통(200 g)을 떴습니다.'); },
    gather(S, o, n, itemName) {
      const used = S.nodes[o.id] || 0;
      if (used >= n[2]) return say('오늘은 더 얻을 수 없습니다. (내일 다시 자랍니다)'), false;
      S.nodes[o.id] = used + 1; S.inv[n[0]] += n[1]; advance(S, 5);
      say(`${itemName} +${n[1]}`);
      return true;
    },
    box(S) {
      if (S.boxDay === S.day) return say('오늘의 보급품은 이미 받았습니다.');
      S.boxDay = S.day;
      const nAir = C.moles(1, 0.5, 25);
      for (const k of ['N2', 'N2', 'N2', 'O2', 'O2', 'O2', 'He']) S.caps.push({ k, n: nAir });
      S.inv.sugar += 100; S.inv.salt += 10;
      const gift = !S.stoneGift; if (gift) { S.stoneGift = true; S.inv.stone += 3; }
      say('허브 보급품: 질소·산소 캡슐 3개씩, 헬륨 캡슐 1개, 설탕 100 g, 소금 10 g' + (gift ? ', 돌 3개(곡괭이 재료, 처음 한 번)' : ''));
    },
    craft(S, id) {
      const r = RECIPES.find(x => x.id === id);
      if (!has(S, r.cost)) return false;
      pay(S, r.cost); S.inv[r.out] += r.n; advance(S, 10); return r;
    },
    // 장치 건설: 위치 검사는 화면(지형)이 하고, 재료·상태 생성은 여기서 한다
    build(S, id, u) { return act.place(S, id, devX(S, u), RAFT.DEV_Y, u, `탐사정 ${u}번 칸`); },
    // 위치와 무관한 장치 생성(재료·상태). 2D는 build가, 1인칭은 격자 칸 (x, y)로 직접 부른다. u가 없으면 탐사정 좌표를 쓰지 않는다
    place(S, id, tx, ty, u, where) {
      const def = DEV[id];
      if (!has(S, def.cost)) return say('재료가 부족합니다.'), false;
      pay(S, def.cost);
      const s = { fire: { level: 0, fuel: 0 },
        still: { w: 0, ns: 0, outW: 0, outS: 0, run: false, T: 25 },
        cooker: { run: false, prog: 0, valve: 2, saltG: 0, water: 300, T: 25 },
        cooler: {}, collector: {} }[id];
      const dev = { id, x: tx, y: ty, s }; if (u !== undefined) dev.u = u;
      S.placed.push(dev);
      if (id === 'fire') S.f.fire = true;
      say(`${def.name}을(를) 지었습니다.`);
      logEv(S, '건설', `${def.name} (${where})`);
      return true;
    },
    demolish(S, d) {
      for (const k in DEV[d.id].cost) S.inv[k] += DEV[d.id].cost[k];
      S.placed.splice(S.placed.indexOf(d), 1);
      say(`${DEV[d.id].name}을(를) 철거하고 재료를 돌려받았습니다.`);
    },
    saltOnWolf,
    // 탐사정 잔해 수리: 이륙 가능(허브 정거장 해금). 튜토리얼이 끝난다(얼음 생물·폭발이 켜진다)
    repairRaft(S) {
      if (S.f.raft) return say('탐사정은 이미 고쳤습니다.'), false;
      if (!repairRecord(S)) return say(`냉각계를 채우려면 직접 증류한 증류수 ${RAFT.REPAIR_NEED.dW} g와 소금 ${RAFT.REPAIR_NEED.dS} g의 기록이 필요합니다. (지금 증류수 ${Math.floor(S.f.dW)} g · 소금 ${Math.floor(S.f.dS)} g)`), false;
      if (!has(S, RAFT.REPAIR_COST)) return say('재료가 부족합니다.'), false;
      pay(S, RAFT.REPAIR_COST); S.f.raft = true;
      say('탐사정을 고쳤습니다! 이제 궤도 이동 단말에서 이륙할 수 있어요.'); logEv(S, '탐사정', `파편 수리 완료(재료 ${Object.entries(RAFT.REPAIR_COST).map(([k, v]) => k + ' ' + v).join(', ')}) — 튜토리얼 종료`);
      return true;
    },
    // 궤도 이동: 탐사정(과 장치)이 다른 행성의 도킹 자리로 옮겨 간다. 시간이 SAIL_MIN분 흐른다
    sail(S, dock) {
      if (!S.f.raft) return say('탐사정 잔해를 먼저 고치세요.'), false;
      if (!DOCKS[dock]) return say('아직 갈 수 없는 곳입니다.'), false;
      if (dock === S.raft.dock) return say('이미 이 행성에 있습니다.'), false;
      if (UNLOCK[dock] && S.qDone < UNLOCK[dock]) return say(`아직 갈 수 없습니다. (목표 ${UNLOCK[dock]}개를 달성하면 열립니다)`), false;
      const from = ISLANDS[dockOf(S).island].name;
      S.raft.dock = dock; syncRaft(S);
      const d = dockOf(S); S.px = (d.anchor + d.dir) * 16; S.py = RAFT.ROW * 16 - 18; S.vx = S.vy = 0;
      const mins = SAIL_MIN[dock] || 30;
      advance(S, mins);
      say(`${ISLANDS[d.island].name}에 도착했습니다. (궤도 이동 ${mins}분)`); logEv(S, '궤도 이동', `${from} → ${ISLANDS[d.island].name} (${mins}분, 탐사정 ${S.raft.cells}칸·장치 ${S.placed.length}개)`);
      const env = ENV[d.island]; if (env.P !== 1 || env.dT !== 0) logEv(S, '환경', `${env.name}: 외기 ${env.P} atm → 순수한 물의 끓는점 ${fmt(C.tb(env.P), 1)}℃, 기온 보정 ${env.dT} ℃`);
      emit({ t: 'moved' });
      return true;
    },
    // 탐사정 넓히기: 칸 수 제한과 재료는 가정(임의값). 오른쪽(해안) 끝은 고정이고 바다 쪽으로 늘어난다
    expandRaft(S) {
      if (S.raft.cells >= RAFT.MAX_CELLS) return say(`탐사정은 최대 ${RAFT.MAX_CELLS}칸까지입니다.`), false;
      if (!has(S, RAFT.EXPAND_COST)) return say('재료가 부족합니다.'), false;
      pay(S, RAFT.EXPAND_COST);
      S.raft.cells = Math.min(RAFT.MAX_CELLS, S.raft.cells + RAFT.EXPAND);
      syncRaft(S);
      say(`탐사정을 ${S.raft.cells}칸으로 넓혔습니다.`); logEv(S, '탐사정', `${S.raft.cells}칸으로 확장 (재료 ${Object.entries(RAFT.EXPAND_COST).map(([k, v]) => k + ' ' + v).join(', ')})`);
      return true;
    },
  };

  const Sim = {
    FIRE_T, FIRE_BURN, FIRE_NAME, WOLF, NIGHT_FROM, NIGHT_TO, SEA_BUCKET, DEV, RECIPES, QUESTS, VALVE, VALVE_NAME,
    STILL, COOLER, ISLANDS, ENV, DOCKS, HARBORS, RAFT, SAIL_MIN, UNLOCK, envOf, pAtm, dockOf, bounds, tutorial, raftAnchor, raftXs, devX, raftU, syncRaft, newState, merge, advance, checkQuests, heatOf, fireNear, geo, cookerState, airTemp, isNightHour, has, pay, unlocked, act,
    drain, emit, say, logEv, clockText,   // 화면 모듈(world.js·ui.js)이 같은 이벤트·기록 통로를 쓰도록 노출(계산은 바뀌지 않음)
    setRng(fn) { rngFn = fn || null; },
    setDev(d) { curDev = d || null; },   // 패널을 그릴 때 그 장치의 환경을 쓰게 한다(fp 10단계)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
