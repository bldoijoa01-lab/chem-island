// 화학 섬 이야기 — 계산 모듈(상태·시간·장치·서리 늑대·행동 규칙).
// window·DOM·캔버스를 쓰지 않는다. 화면(game.js)은 이 모듈이 바꾼 상태 S와 `Sim.drain()`이 돌려주는 이벤트만 읽는다.
// 화학 식·상수는 chem.js(Chem)에 있고, 여기서는 그 식을 장치 규칙으로 엮는다. 헤드리스(Node)에서도 같은 결과가 나온다.
(function (root) {
  const C = (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./chem.js') : root.Chem;

  const FIRE_T = [25, 105, 115, 130, 145];       // 화덕 세기별 열원 온도(℃)
  const FIRE_BURN = [0, 0.5, 1, 2, 3];           // 세기별 나뭇가지 소모(개/시간)
  const FIRE_NAME = ['꺼짐', '약불', '중불', '강불', '최강'];
  // 서리 늑대(얼음 몸): 질량 M(g)이 곧 체력. 아래 값은 모두 가정(임의값) — 플레이 테스트로 조정하고 DESIGN.md에 이력을 남긴다
  const WOLF = {
    MIN_M: 100, MAX_M: 300,   // 가정(임의값) 출현 질량 범위(g)
    SPAWN_P: 0.02,            // 가정(임의값) 영하의 밤 동안 1분마다 출현할 확률
    MAX: 3,                   // 가정(임의값) 동시에 있을 수 있는 늑대 수(장치 수도 넘지 않음)
    ATTACK_MIN: 60,           // 가정(임의값) 한 장치에 붙어 있다가 파손시키는 데 걸리는 시간(분)
    K_FIRE: 7,                // 가정(임의값) 켜진 화덕이 늑대에게 전하는 열: K_FIRE·(열원 온도) J/분
    K_AIR: 40,                // 가정(임의값) 0 ℃ 이상의 공기가 늑대에게 전하는 열: K_AIR·(기온) J/분
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
    { id: 'pickaxe', out: 'pickaxe', n: 1, cost: { stick: 2, stone: 2 }, note: '돌을 팔 수 있다 (광장 보급 상자에서 처음 돌을 얻는다)' },
    { id: 'shaker', out: 'shaker', n: 1, cost: { bottle: 1, stick: 1 }, note: '소금을 얼음·늑대에 뿌린다 — 어는점 내림 [#37 #39]' },
    { id: 'thermo', out: 'thermo', n: 1, cost: { bottle: 1, sand: 2 }, note: '장치·땅·공기의 온도를 읽는다' },
  ];
  const QUESTS = [
    { t: '바닷물 1통을 뜨고, 화덕을 설치하세요', ok: f => f.sea && f.fire, hint: '건설 → 화덕. 바닷가에서 E로 바닷물 뜨기' },
    { t: '증류기로 증류수 200 g을 얻으세요', ok: f => f.dW >= 200, hint: '증류기는 화덕 바로 옆에. 바닷물을 넣고 가열 시작' },
    { t: '증류에서 소금 20 g을 모으세요', ok: f => f.dS >= 20, hint: '바닷물이 농축되면 NaCl 결정이 남아요' },
    { t: '해안의 뗏목 파편을 수리해 출항하세요', ok: f => f.raft, hint: '동쪽 해안의 뗏목 파편에서 E. 나뭇가지와 모래가 필요해요. 건너편 광장섬이 보여요' },
    { t: '압력 밥솥으로 2기압 이상에서 라면을 끓이세요', ok: f => f.ramenP >= 2, hint: '면 1개 + 증류수 300 g. 화덕 세기를 올려야 할 수도 있어요' },
    { t: '−10 ℃ 이하의 한제 팩을 만드세요', ok: f => f.packT <= -10, hint: '얼음은 시작섬 설원이나 극지 섬에서. 소금을 섞으면 어는점이 내려가요' },
    { t: '공기 캡슐 4개를 만드세요', ok: f => f.caps >= 4, hint: '기체 포집기에서 주사기로 공기를 모아요' },
    { t: '광장섬의 솥 골렘을 정화하세요', ok: f => f.boss, hint: '광장섬의 제단. 소금·증류수·한제 팩·캡슐(광장 보급 상자)을 챙기세요' },
    { t: '서리 늑대 1마리를 정화하세요', ok: f => f.wolf >= 1, hint: '밤에 기온이 영하로 내려가면 늑대가 장치에 붙어요. 소금을 뿌리면 얼음이 녹고, 화덕 열로도 녹일 수 있어요' },
    { t: '고산 섬에서 증류수 100 g을 얻으세요', ok: f => f.alpineW >= 100, hint: '광장섬 동항에서 출항(라면 목표 뒤). 같은 증류기가 낮은 기압에서 어떻게 달라지는지 기록에 남아요' },
    { t: '극지 섬에서 소금 뿌리개로 얼음 타일 1칸을 녹이세요', ok: f => f.polarMelt, hint: '광장섬 북항(한제 목표 뒤). 공융점(−21.1 ℃) 아래에서는 소금이 듣지 않아요. 온도계로 재 보세요' },
  ];
  // 월드: 한 줄로 이어진 바다 위에 섬들이 놓인다. 시작섬(0~119) → 건너편 광장섬 → (4단계) 탐험섬. 타일 크기 16 px, 높이 56줄.
  const WORLD = { WW: 380, WH: 56 };
  // 섬의 걸을 수 있는 범위(타일 x, 바다 쪽 여유 포함). 뗏목이 더 멀리 뻗으면 그만큼 넓어진다. 섬 사이는 헤엄쳐 건널 수 없고 뗏목으로만 간다.
  const ISLANDS = {
    start: { name: '시작섬', L: 13, R: 112 },
    plaza: { name: '광장섬', L: 118, R: 202 },
    alpine: { name: '고산 섬', L: 213, R: 287 },
    polar: { name: '극지 섬', L: 303, R: 377 },
  };
  // 섬별 환경(가정(임의값)): 같은 장치를 다른 조건에서 돌려 비교한다. P = 외기 압력(atm), dT = 기온 보정(℃, C.airTemp에 더함)
  const ENV = {
    start: { name: '시작섬', P: 1.0, dT: 0 },
    plaza: { name: '광장섬', P: 1.0, dT: 0 },
    alpine: { name: '고산 섬', P: 0.65, dT: -10 },   // 해발 약 3.6 km 고원 호수: 기압 ≈ exp(−h/8.4 km) = 0.65 atm, 기온은 약 10 ℃ 낮게   [#18 #19]
    polar: { name: '극지 섬', P: 1.0, dT: -20 },       // 기온 20 ℃ 낮게: 밤에 공융점(−21.1 ℃) 아래까지 내려가 소금이 듣지 않는다   [#37 #39]
  };
  // 뗏목(개인 자산): 장치는 항상 뗏목 위에 짓는다. 위치는 뗏목의 해안 쪽 끝에서 떨어진 칸 수 u로 저장한다(뗏목이 옮겨 가도 유지).
  // 아래 값은 모두 가정(임의값): 시작 칸 수, 최대 칸 수, 확장 단위·재료, 항해 시간, 파편 수리 재료. DESIGN.md §4-6·§4-7에 근거와 조정 이력을 적는다.
  const RAFT = {
    BASE_CELLS: 4,                        // 가정(임의값) 처음 뗏목 칸 수(화덕 1 + 장치 1)
    MAX_CELLS: 12,                        // 가정(임의값) 뗏목 최대 칸 수
    EXPAND: 2, EXPAND_COST: { stick: 10, sand: 4 },   // 가정(임의값) 한 번에 넓히는 칸 수와 재료
    REPAIR_COST: { stick: 8, sand: 4 },  // 가정(임의값) 뗏목 파편을 고쳐 출항 가능하게 하는 재료
    ROW: 25,                              // 뗏목 바닥이 놓이는 타일 줄(바다 표면)
    DEV_Y: 23,                            // 장치(2x2)의 위쪽 타일 줄 = ROW − 2
  };
  // 섬별 뗏목 정박 자리: anchor = 해안 쪽 끝 타일 x, dir = 바다 쪽 방향(+1 오른쪽, −1 왼쪽)
  const DOCKS = {
    start: { island: 'start', anchor: 107, dir: 1 },    // 시작섬 동쪽 해안. 건너편에 광장섬이 보인다
    plaza: { island: 'plaza', anchor: 123, dir: -1 },   // 광장섬 서쪽 해안
    alpine: { island: 'alpine', anchor: 218, dir: -1 }, // 고산 섬 서쪽 해안
    polar: { island: 'polar', anchor: 308, dir: -1 },   // 극지 섬 서쪽 해안
  };
  const SAIL_MIN = { start: 30, plaza: 30, alpine: 60, polar: 60 };   // 가정(임의값) 도착지별 항해 시간(게임 분)
  const UNLOCK = { alpine: 5, polar: 6 };                              // 가정(임의값) 해금 순서: 라면(목표 5) 뒤 고산 섬, 한제(목표 6) 뒤 극지 섬
  // 광장섬의 사방 항구: 행선지(4단계에서 탐험섬을 연다)
  const HARBORS = [
    { dock: 'start', label: '서항', name: '시작섬', open: true },
    { dock: 'alpine', label: '동항', name: '고산 섬', open: true },
    { dock: 'polar', label: '북항', name: '극지 섬', open: true },
    { dock: 'volcano', label: '남항', name: '화산 섬', open: false },
  ];
  const dockOf = (S) => DOCKS[S.raft.dock];
  const raftAnchor = (S) => dockOf(S).anchor;
  const raftXs = (S) => { const { anchor, dir } = dockOf(S), xs = []; for (let i = 0; i < S.raft.cells; i++) xs.push(anchor + dir * i); return xs; };
  const devX = (S, u) => { const { anchor, dir } = dockOf(S); return dir > 0 ? anchor + u : anchor - u - 1; };   // 장치(2칸 폭)의 왼쪽 타일 x
  const raftU = (S, tx) => { const { anchor, dir } = dockOf(S); return dir > 0 ? tx - anchor : anchor - tx - 1; };   // 위의 역
  const bounds = (S) => { const isl = ISLANDS[dockOf(S).island], xs = raftXs(S); return { L: Math.min(isl.L, Math.min(...xs) - 1), R: Math.max(isl.R, Math.max(...xs) + 1) }; };
  // 뗏목이 옮겨 가거나 넓어진 뒤 장치의 세계 좌표를 u에서 다시 계산한다
  function syncRaft(S) { for (const d of S.placed) if (d.u !== undefined) { d.x = devX(S, d.u); d.y = RAFT.DEV_Y; } }
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
      qDone: 0, log: [], memo: '', ver: 2,
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
  // 월드가 넓어지고(120 → 380칸) 목표가 하나 늘었다: 예전 세이브의 땅 파기 기록(타일 번호 y·WW+x)을 새 폭으로 다시 매기고,
  // 튜토리얼(목표 1~3)을 넘긴 세이브는 뗏목 파편을 이미 고친 것으로 보며 목표 진행(qDone)을 새 목록에 맞춘다.
  function migrateWorld(S, raw) {
    if (!raw || raw.ver >= 2) return;
    const OLD_W = 120, W = WORLD.WW, re = (m) => { const o = {}; for (const k in m) { const y = Math.floor(k / OLD_W), x = k % OLD_W; o[y * W + x] = m[k]; } return o; };
    S.dug = re(S.dug || {}); S.melt = re(S.melt || {});
    if (S.qDone >= 3) { S.f.raft = true; S.qDone += 1; }
    S.ver = 2;
  }
  // 예전 세이브(장치가 땅 위, u 없음) → 뗏목 위로 옮긴다: 왼쪽에서부터 순서와 붙어 있던 관계를 지키며 해안 쪽부터 놓는다.
  // 옛 세이브는 칸 수 제한을 넘을 수 있으므로 필요한 만큼 뗏목을 넓혀 준다(제한은 새로 넓힐 때만 적용).
  function migrateRaft(S) {
    const old = S.placed.filter(d => d.u === undefined);
    if (!old.length) return;
    const dir = dockOf(S).dir;
    old.sort((a, b) => (a.x - b.x) * dir);               // 해안 쪽(뗏목이 시작하는 쪽)에 가까운 것부터: dir>0이면 왼쪽부터
    let u = 0, prev = old[0];
    // 붙어 있던 것(간격 3칸 이하)은 그대로 붙여 두고, 떨어져 있던 것은 떨어진 채로 둔다(화덕 열이 새로 닿지 않게)
    for (const d of old) {
      if (d !== prev) { const gap = Math.abs(prev.x - d.x); u += gap <= 3 ? Math.max(2, gap) : 4; }
      d.u = u; prev = d;
    }
    S.raft.cells = Math.max(S.raft.cells, u + 2);
    S.mobs = []; syncRaft(S);                            // 늑대는 장치 위치에 붙어 있었으므로 새로 나타나게 한다
    S.log.push({ day: S.day, t: clockText(S), type: '뗏목', text: `예전 세이브: 장치 ${old.length}개를 뗏목(${S.raft.cells}칸) 위로 옮겼습니다.` });
  }
  const envOf = (S) => ENV[dockOf(S).island];
  const pAtm = (S) => envOf(S).P;
  const airTemp = (S) => C.airTemp(S.min) + envOf(S).dT;   // ℃, 시작섬 기준 오후 3시 최고(28) · 새벽 3시 최저(−15) + 섬별 보정

  // ---------- 시간 ----------
  function advance(S, dm) {
    for (let i = 0; i < dm; i++) {
      S.min += 1;
      stepDevices(S);
      stepMobs(S);
      if (S.min === 19 * 60 && S.dusk !== S.day && S.placed.length) { S.dusk = S.day; say('해가 지고 있습니다. 밤에는 기온이 영하로 내려가 서리 늑대가 나타나요.'); }
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
  const adjacentTo = (a, b) => a !== b && Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 1;   // 2x2 장치끼리 한 칸 이내
  const fireNear = (S, d) => S.placed.filter(f => f.id === 'fire' && adjacentTo(f, d));
  function stepDevices(S) {
    for (const d of S.placed) {
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
    const P = pAtm(S);                         // 외기 압력: 증기압이 이보다 커야 끓는다(고산 섬은 낮아 더 낮은 온도에서 끓음)
    s.xw = xw; s.tb = C.tb(P, xw);
    const pv = C.pSol(s.T, xw);
    s.pv = pv;
    if (pv > P) {
      const wmin = s.ns / C.NACL_SAT * 1000;   // 포화 몰랄농도에 이르면 결정 석출
      const ev = Math.min(12 * (pv - P), s.w - wmin);
      s.w -= ev; s.outW += ev;
      if (s.w - wmin < 1e-6) {
        s.outS += s.ns * C.MW_NACL; s.ns = 0; s.w = 0; s.run = false;
        say('증류기: 소금이 포화되어 결정으로 석출되었습니다.');
        logEv(S, '증류 완료', `포화(${C.NACL_SAT} mol/kg)에서 NaCl 결정 석출`);
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
      if (!s.safeWarned) { s.safeWarned = true; say('튜토리얼 안전장치: 압력이 한계에 닿아 멈췄습니다. 출항 뒤에는 터집니다!'); logEv(S, '안전장치', `튜토리얼 중 밥솥 압력이 ${fmt(limit, 2)} atm에 닿아 폭발하지 않고 제한됨(밸브 ${VALVE_NAME[s.valve]}, 열원 ${s.T}℃)`); }
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

  // ---------- 서리 늑대 ----------
  const devAt = (S, m) => S.placed.find(d => d.x === m.dx && d.y === m.dy);
  const isNightHour = h => h >= NIGHT_FROM || h < NIGHT_TO;
  function wolfHeat(S, d) {   // 이 장치 자리의 늑대가 받는 열(J/분): 켜진 화덕(자기 자신 또는 이웃). Q = K·T(열원)
    const fires = d.id === 'fire' ? [d] : fireNear(S, d);
    let q = 0;
    for (const f of fires) if (!f.s.broken && f.s.level > 0 && f.s.fuel > 0) q += WOLF.K_FIRE * FIRE_T[f.s.level];
    return q;
  }
  function spawnWolf(S, T) {
    const d = S.placed[Math.floor(rng() * S.placed.length)];
    const M = Math.round(WOLF.MIN_M + rng() * (WOLF.MAX_M - WOLF.MIN_M));
    S.mobs.push({ id: ++S.mobId, k: 'wolf', M, M0: M, dx: d.x, dy: d.y, att: 0 });
    say('서리 늑대가 나타났습니다!');
    logEv(S, '서리 늑대 출현', `기온 ${fmt(T, 1)}℃, 질량 ${M} g, 위치: ${DEV[d.id].name}(${d.x})`);
  }
  function removeWolf(S, m, how, extra) {
    S.mobs.splice(S.mobs.indexOf(m), 1);
    if (how === 'ambient') { logEv(S, '서리 늑대 융해', `기온 ${fmt(airTemp(S), 1)}℃ 공기의 열로 모두 녹음`); return; }
    if (how === 'gone') { logEv(S, '서리 늑대 이탈', '장치가 철거되어 늑대가 흩어짐'); return; }
    S.f.wolf++; say('서리 늑대를 정화했습니다!');
    logEv(S, '서리 늑대 정화', `${how === 'salt' ? '소금으로' : '화덕 열로'} ${fmt(m.M0, 0)} g 모두 녹임${extra ? ' · ' + extra : ''}`);
    emit({ t: 'refresh' });
  }
  const tutorial = (S) => !S.f.raft;   // 뗏목 파편을 고치기 전까지는 튜토리얼: 서리 늑대와 폭발을 끈다
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
        say(`서리 늑대가 ${DEV[d.id].name}을(를) 부쉈습니다! 수리가 필요해요.`);
        logEv(S, '장치 파손', `${DEV[d.id].name}: 서리 늑대(남은 ${fmt(m.M, 0)} g)가 ${WOLF.ATTACK_MIN}분 붙어 파손`);
      }
    }
  }
  // 늑대에게 소금 s g을 뿌린다(모달·소금 뿌리개 공용). 늑대가 정화되면 true
  function saltOnWolf(S, m, s) {
    const T = airTemp(S), melt = C.iceMeltBySalt(T, s);
    if (melt <= 0) { say(T >= 0 ? '기온이 0 ℃ 이상이라 소금이 필요 없어요.' : '공융점 이하라 소금으로 녹일 수 없습니다.'); return false; }
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
      if (S.qDone === 4) say('뗏목이 출항할 수 있게 되었습니다! 이제 서리 늑대와 폭발 위험도 시작됩니다.');
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
      S.inv.sea--; d.s.w += SEA_BUCKET.water; d.s.ns += SEA_BUCKET.nacl / C.MW_NACL;
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
      if (S.inv.water < 300 || S.inv.noodle < 1) return say('증류수 300 g과 면 1개가 필요합니다.');
      if (salt > S.inv.salt) return say('소금이 부족합니다.');
      S.inv.water -= 300; S.inv.noodle--; S.inv.salt -= salt;
      s.saltG = salt; s.valve = valve; s.prog = 0; s.run = true;
    },
    take(S, d) { if (!d.s.done) return say('아직 완성되지 않았습니다.'); d.s.done = false; S.inv.ramen++; S.f.ramenP = Math.max(S.f.ramenP, d.s.doneP); say('라면 1개를 얻었습니다.'); },
    repair(S, d) {
      if (!d.s.broken) return;
      if (S.inv.stick < 2) return say('나뭇가지 2개가 필요합니다.');
      S.inv.stick -= 2; d.s.broken = false; logEv(S, '수리', `${DEV[d.id].name} 수리(나뭇가지 2개)`);
    },
    pack(S, iceN, salt) {
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
      const n = C.moles(pAtm(S), 0.5, airTemp(S));   // 외기 압력이 낮은 섬에서는 같은 주사기에 모이는 기체가 적다   [#4 #6]
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
      say('광장 보급품: 질소·산소 캡슐 3개씩, 헬륨 캡슐 1개, 설탕 100 g, 소금 10 g' + (gift ? ', 돌 3개(곡괭이 재료, 처음 한 번)' : ''));
    },
    craft(S, id) {
      const r = RECIPES.find(x => x.id === id);
      if (!has(S, r.cost)) return false;
      pay(S, r.cost); S.inv[r.out] += r.n; advance(S, 10); return r;
    },
    // 장치 건설: 위치 검사는 화면(지형)이 하고, 재료·상태 생성은 여기서 한다
    build(S, id, u) {
      const def = DEV[id], tx = devX(S, u), ty = RAFT.DEV_Y;
      if (!has(S, def.cost)) return say('재료가 부족합니다.'), false;
      pay(S, def.cost);
      const s = { fire: { level: 0, fuel: 0 },
        still: { w: 0, ns: 0, outW: 0, outS: 0, run: false, T: 25 },
        cooker: { run: false, prog: 0, valve: 2, saltG: 0, water: 300, T: 25 },
        cooler: {}, collector: {} }[id];
      S.placed.push({ id, x: tx, y: ty, u, s });
      if (id === 'fire') S.f.fire = true;
      say(`${def.name}을(를) 지었습니다.`);
      logEv(S, '건설', `${def.name} (뗏목 ${u}번 칸)`);
      return true;
    },
    demolish(S, d) {
      for (const k in DEV[d.id].cost) S.inv[k] += DEV[d.id].cost[k];
      S.placed.splice(S.placed.indexOf(d), 1);
      say(`${DEV[d.id].name}을(를) 철거하고 재료를 돌려받았습니다.`);
    },
    saltOnWolf,
    // 뗏목 파편 수리: 출항 가능(광장섬 해금). 튜토리얼이 끝난다(서리 늑대·폭발이 켜진다)
    repairRaft(S) {
      if (S.f.raft) return say('뗏목은 이미 고쳤습니다.'), false;
      if (!has(S, RAFT.REPAIR_COST)) return say('재료가 부족합니다.'), false;
      pay(S, RAFT.REPAIR_COST); S.f.raft = true;
      say('뗏목을 고쳤습니다! 이제 항구 표지판에서 출항할 수 있어요.'); logEv(S, '뗏목', `파편 수리 완료(재료 ${Object.entries(RAFT.REPAIR_COST).map(([k, v]) => k + ' ' + v).join(', ')}) — 튜토리얼 종료`);
      return true;
    },
    // 항해: 뗏목(과 장치)이 다른 섬의 정박 자리로 옮겨 간다. 시간이 SAIL_MIN분 흐른다
    sail(S, dock) {
      if (!S.f.raft) return say('뗏목 파편을 먼저 고치세요.'), false;
      if (!DOCKS[dock]) return say('아직 갈 수 없는 곳입니다.'), false;
      if (dock === S.raft.dock) return say('이미 이 섬에 있습니다.'), false;
      if (UNLOCK[dock] && S.qDone < UNLOCK[dock]) return say(`아직 갈 수 없습니다. (목표 ${UNLOCK[dock]}개를 달성하면 열립니다)`), false;
      const from = ISLANDS[dockOf(S).island].name;
      S.raft.dock = dock; syncRaft(S);
      const d = dockOf(S); S.px = (d.anchor + d.dir) * 16; S.py = RAFT.ROW * 16 - 18; S.vx = S.vy = 0;
      const mins = SAIL_MIN[dock] || 30;
      advance(S, mins);
      say(`${ISLANDS[d.island].name}에 도착했습니다. (항해 ${mins}분)`); logEv(S, '항해', `${from} → ${ISLANDS[d.island].name} (${mins}분, 뗏목 ${S.raft.cells}칸·장치 ${S.placed.length}개)`);
      const env = ENV[d.island]; if (env.P !== 1 || env.dT !== 0) logEv(S, '환경', `${env.name}: 외기 ${env.P} atm → 순수한 물의 끓는점 ${fmt(C.tb(env.P), 1)}℃, 기온 보정 ${env.dT} ℃`);
      emit({ t: 'moved' });
      return true;
    },
    // 뗏목 넓히기: 칸 수 제한과 재료는 가정(임의값). 오른쪽(해안) 끝은 고정이고 바다 쪽으로 늘어난다
    expandRaft(S) {
      if (S.raft.cells >= RAFT.MAX_CELLS) return say(`뗏목은 최대 ${RAFT.MAX_CELLS}칸까지입니다.`), false;
      if (!has(S, RAFT.EXPAND_COST)) return say('재료가 부족합니다.'), false;
      pay(S, RAFT.EXPAND_COST);
      S.raft.cells = Math.min(RAFT.MAX_CELLS, S.raft.cells + RAFT.EXPAND);
      syncRaft(S);
      say(`뗏목을 ${S.raft.cells}칸으로 넓혔습니다.`); logEv(S, '뗏목', `${S.raft.cells}칸으로 확장 (재료 ${Object.entries(RAFT.EXPAND_COST).map(([k, v]) => k + ' ' + v).join(', ')})`);
      return true;
    },
  };

  const Sim = {
    FIRE_T, FIRE_BURN, FIRE_NAME, WOLF, NIGHT_FROM, NIGHT_TO, SEA_BUCKET, DEV, RECIPES, QUESTS, VALVE, VALVE_NAME,
    WORLD, ISLANDS, ENV, DOCKS, HARBORS, RAFT, SAIL_MIN, UNLOCK, envOf, pAtm, dockOf, bounds, tutorial, raftAnchor, raftXs, devX, raftU, syncRaft, newState, merge, advance, checkQuests, heatOf, fireNear, cookerState, airTemp, isNightHour, has, pay, unlocked, act,
    drain, setRng(fn) { rngFn = fn || null; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
