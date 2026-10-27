// 월드 모듈: 지형(타일맵)·자원 오브젝트·땅 파기/블록/도구 규칙·상호작용 대상. window의 DOM·캔버스를 쓰지 않는다.
// 2D(game.js)가 쓴다. 좌표는 2D 단면 타일맵의 (x, y)와 픽셀(타일 16 px) 그대로이고, 3D의 z는 보이기만 한다.
// 화면에 보여 줄 말·효과는 sim.js의 이벤트 통로(Sim.say / Sim.emit)로 내보낸다.
window.World = (() => {
  const T = 16, PW = 10, PH = 18, REACH = 40;
  const C = Chem;
  const { DEV, FIRE_T, FIRE_NAME } = Sim;
  const say = (t) => Sim.say(t), logEv = (S, type, text) => Sim.logEv(S, type, text);
  const fmt = (v, d = 1) => Number(v).toFixed(d);
// 아이템: [아이콘 키, 이름, 단위]
const ITEM = {
  stick: ['stick', '나뭇가지', '개'], sand: ['sand', '모래', '개'], sea: ['sea', '바닷물(200 g)', '통'],
  ice: ['ice', '얼음(100 g)', '개'], bottle: ['bottle', '유리병', '개'], syringe: ['syringe', '주사기', '개'],
  sugar: ['sugar', '설탕', 'g'], salt: ['salt', '소금', 'g'], water: ['water', '증류수', 'g'],
  noodle: ['noodle', '면', '개'], ramen: ['ramen', '라면', '개'],
  dirt: ['dirt', '흙', '개'], stone: ['stone', '돌', '개'],
  pickaxe: ['pickaxe', '곡괭이', '개'], ironpick: ['ironpick', '철 곡괭이', '개'], iron: ['iron', '철 광석', '개'], gold: ['gold', '금', '개'], rare: ['rare', '희귀 광물', '개'], shaker: ['shaker', '소금 뿌리개', '개'], thermo: ['thermo', '온도계', '개'],
};
const ICE_TILE_G = 100;   // 가정(임의값) 얼음·눈 타일 1칸의 질량(g) = 얼음 아이템 1개
  const SHAKE_G = 10;       // 가정(임의값) 소금 뿌리개로 한 번에 뿌리는 소금(g)
  const UNDER_T = 12;       // 가정(임의값) 지하 온도(℃): 깊이와 상관없이 일정하다고 가정

  // ---------- 월드 (단면 타일맵) ----------
  // 17-a′(DESIGN.md §4-24): 불시착 행성 = 코어가 원점인 **무한 지하 월드**(32×32 덩어리를 시드로 필요할 때 만든다, 모든 팀이 같은 시드).
  // 허브 정거장(plaza)과 원정 행성(alpine·polar)은 옛 방식의 유한 맵(MAP 배열 + S.dug)이다. 모든 크기·확률·좌표는 가정(임의값)이다.
  const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, SNOWTOP = 5, ICE = 6, WATER = 7, RAFT = 8, HULL = 9, HATCH = 10, BEDROCK = 11, HARD = 12, SALT = 13, IRON = 14, GOLD = 15, HOT = 16, RARE = 17;
  // HULL: 코어 선체(단단하고 못 판다) · HATCH: 코어 해치(지나갈 수 있음) · BEDROCK: 천장·가장자리 암반(못 판다) · HARD 경암 · SALT 암염 광맥 · IRON 철 광맥 · GOLD 금 광맥 · HOT 뜨거운 바위 · RARE 희귀 광물
  const SOLID = [0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1];
  // 유한 맵(허브·원정 행성): 크기 dim, 타일 MAP, 자연 지형 BASE, 열별 지표 높이 GY(지하 맵은 0), 자원 OBJS. 행성이 바뀌면 applyDug가 같은 배열을 제자리에서 다시 채운다.
  const dim = { W: 112, H: 56 };
  let MAP = new Uint8Array(dim.W * dim.H), BASE = MAP, loaded = '';
  const GY = [], OBJS = [];
  const CHUNK = 32, LIMIT = 100000, CEIL = -21;   // 덩어리 한 변(칸), 월드 범위 ±LIMIT, y ≤ CEIL은 천장 암반
  const SEED = 20261027;                           // 가정(임의값) 모든 팀이 같은 시드
  const SAVE_CAP = 200000;                         // 가정(임의값) 판 칸 저장 상한: S.world JSON 길이(약 200 KB)
  let inf = false, curS = null, worldRef = null, worldBytes = 0;
  const chunks = new Map();
  const infTile = (x, y) => {
    if (y <= CEIL || y > LIMIT || x < -LIMIT || x > LIMIT) return BEDROCK;
    return getChunk(x >> 5, y >> 5).t[((y & 31) << 5) | (x & 31)];
  };
  const tileAt = (x, y) => inf ? infTile(x, y) : (y < 0 ? AIR : (x < 0 || x >= dim.W || y >= dim.H) ? STONE : MAP[y * dim.W + x]);
  const solidAt = (x, y) => SOLID[tileAt(x, y)] === 1;
  const isOpen = (x, y) => { const t = tileAt(x, y); return t === AIR || t === WATER; };

  // ---- 시드 잡음·해시 ----
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash3 = (a, b, c) => { let h = Math.imul(a ^ SEED, 0x85ebca6b) ^ Math.imul(b + 0x9e3779b9, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const noise = (x, y) => Math.sin(x / 19 + Math.sin(y / 23) * 2) + Math.sin(y / 13 + x / 37) + Math.sin((x + y) / 29);   // −3..3
  // 바닥 암석: D < 50 퇴적토, 50 ≤ D < 140 암반, D ≥ 140 경암(경계는 완만하게 구불거린다). D = y + 20
  function bulk(x, y) {
    const D = y + 20 + Math.round(3 * Math.sin(x / 17) + 2 * Math.sin(x / 7 + 1)), v = noise(x, y);
    return D < 50 ? (v > 1.6 ? STONE : DIRT) : D < 140 ? STONE : HARD;
  }

  // ---- 코어(원점 6 × 4 캡슐) ----
  const CORE = { CW: 6, CH: 4 };
  // 코어 칸 종류: -1 = 코어 밖, 아니면 타일 번호(안쪽 AIR, 해치, 선체)
  function coreTile(c, tx, ty) {
    const dx = tx - c.x, dy = ty - c.y;
    if (dx < 0 || dx >= CORE.CW || dy < 0 || dy >= CORE.CH) return -1;
    if (dx > 0 && dx < CORE.CW - 1 && dy > 0 && dy < CORE.CH - 1) return AIR;
    return dy === CORE.CH - 2 && (dx === 0 || dx === CORE.CW - 1) ? HATCH : HULL;
  }
  const ORIGIN = { x: 0, y: 0 };
  const inCore = (S, tx, ty) => inf && coreTile(ORIGIN, tx, ty) !== -1;

  // ---- 지대와 특징(덩어리당 최대 1개, 덩어리 안쪽 [3, 29]칸) ----
  // 시작 특징: 덩어리 → [종류, 중심 x(월드), 바닥 y(월드), 반폭 rx, 높이 h]. 코어에서 55칸 안에 목표 1~3 자원이 확실히 있게 고정한다
  const STARTERS = {
    '-1,0': ['brine', -16, 18, 12, 6], '1,0': ['tree', 48, 14, 12, 6], '0,1': ['wheat', 16, 52, 12, 6], '-1,1': ['cane', -16, 52, 12, 6],
    '1,1': ['sandpile', 48, 52, 10, 5], '0,2': ['icecrystal', 16, 84, 10, 5], '-2,0': ['rocksalt', -48, 14, 10, 5], '0,0': null,
  };
  // 지대: [이름, 위치 조건(D, ax), 확률, [[종류, 비율]…]]
  const ZONES = [
    ['시작 지대', (D, ax) => D <= 60 && ax <= 96, 0.45, [['brine', .2], ['tree', .25], ['wheat', .2], ['cane', .15], ['sandpile', .15], ['icecrystal', .05]]],
    ['가스 포켓 지대', (D) => D >= 60 && D <= 260, 0.30, [['gas', 1]]],
    ['얼음·한랭 지대', (D) => D >= 80 && D <= 180, 0.30, [['icecrystal', 1]]],
    ['암염·염호 지대', (D, ax) => ax >= 96 && D >= 20 && D <= 300, 0.35, [['saltlake', 1]]],
    ['금속 지대(철)', (D) => D >= 90 && D <= 300, 0.30, [['iron', 1]]],
    ['지열·간헐천 지대', (D) => D >= 140 && D <= 400, 0.25, [['geyser', 1]]],
    ['금속 지대(금)', (D) => D >= 160 && D <= 400, 0.25, [['gold', 1]]],
    ['심층', (D) => D >= 300, 0.25, [['rare', 1]]],
  ];
  function pickFeature(cx, cy) {
    const key = cx + ',' + cy;
    if (key in STARTERS) { const st = STARTERS[key]; return st ? { kind: st[0], cxw: st[1], floor: st[2], rx: st[3], h: st[4] } : null; }
    if (cy < 0) return null;
    const D = cy * CHUNK + 16 + 20, ax = Math.abs(cx * CHUNK + 16), el = ZONES.filter(z => z[1](D, ax));
    if (!el.length) return null;
    const z = el[Math.floor(hash3(cx, cy, 2) * el.length)];
    if (hash3(cx, cy, 3) > z[2]) return null;
    let r = hash3(cx, cy, 4), kind = z[3][z[3].length - 1][0];
    for (const [k, w] of z[3]) { if (r < w) { kind = k; break; } r -= w; }
    const big = kind === 'iron' || kind === 'gold' || kind === 'rare';
    const rx = (big ? 4 : 6) + Math.floor(hash3(cx, cy, 5) * (big ? 6 : 7)), h = 4 + Math.floor(hash3(cx, cy, 6) * 4);
    const lx = rx + 3 + Math.floor(hash3(cx, cy, 7) * (27 - 2 * rx)), floorL = h + 3 + Math.floor(hash3(cx, cy, 8) * (27 - h));
    return { kind, cxw: cx * CHUNK + lx, floor: cy * CHUNK + floorL, rx, h };
  }
  const GAS_MIX = [{ N2: .78, O2: .21, He: .01 }, { N2: .5, O2: .5, He: 0 }, { N2: .2, O2: .05, He: .75 }, { N2: .95, O2: .02, He: .03 }];   // 가정(임의값) 가스 포켓 조성(몰분율), 19단계 칸 시뮬이 읽는다
  const ICE_ZONE_T = -15, HOT_ZONE_T = 45;   // 가정(임의값) 얼음 광맥 방·뜨거운 바위 방의 온도(℃). 칸 시뮬(19단계) 전까지는 구역 상수
  function genChunk(cx, cy) {
    const t = new Uint8Array(CHUNK * CHUNK), objs = [], x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) { const x = x0 + lx, y = y0 + ly; t[(ly << 5) | lx] = y <= CEIL ? BEDROCK : bulk(x, y); }
    const f = pickFeature(cx, cy); let feat = null;
    if (f) {
      const { kind, cxw, floor, rx, h } = f, xa = cxw - rx, xb = cxw + rx;
      const put = (x, y, id) => { const lx = x - x0, ly = y - y0; if (lx >= 0 && lx < CHUNK && ly >= 0 && ly < CHUNK && t[(ly << 5) | lx] !== BEDROCK) t[(ly << 5) | lx] = id; };
      const veins = kind === 'iron' || kind === 'gold' || kind === 'rare';
      if (veins) {   // 광맥: 암반 속의 타원 덩어리(칸마다 70 %)
        const ore = kind === 'iron' ? IRON : kind === 'gold' ? GOLD : RARE, ry = Math.max(3, h);
        for (let y = floor - ry; y <= floor + ry; y++) for (let x = xa; x <= xb; x++) if (((x - cxw) / rx) ** 2 + ((y - floor) / ry) ** 2 <= 1 && hash3(x, y, 9) < 0.7) put(x, y, ore);
      } else {
        const lining = kind === 'icecrystal' ? ICE : kind === 'saltlake' || kind === 'rocksalt' ? SALT : kind === 'geyser' ? HOT : -1;
        for (let x = xa; x <= xb; x++) {
          const hh = Math.max(2, Math.round(h * Math.sqrt(Math.max(0, 1 - ((x - cxw) / rx) ** 2))));
          for (let y = floor - hh; y < floor; y++) put(x, y, AIR);
          put(x, floor, kind === 'sandpile' ? SAND : lining >= 0 ? lining : DIRT);
          if (lining >= 0) { put(x, floor + 1, lining); put(x, floor - hh - 1, lining); }
          if ((kind === 'brine' || kind === 'saltlake') && Math.abs(x - cxw) <= Math.round(rx * 0.6)) for (let y = floor - 3; y < floor; y++) put(x, y, WATER);
          if (kind === 'geyser' && Math.abs(x - cxw) <= 2) for (let y = floor - 2; y < floor; y++) put(x, y, WATER);
        }
        if (lining >= 0) for (let y = floor - h; y <= floor; y++) { put(xa - 1, y, lining); put(xb + 1, y, lining); }
        if (['tree', 'wheat', 'cane', 'sandpile', 'icecrystal', 'rocksalt'].includes(kind)) for (let x = xa + 3; x <= xb - 3; x += 5) { const lx = x - x0; if (lx >= 0 && lx < CHUNK) objs.push({ id: kind.slice(0, 2) + x + 'y' + floor, type: kind, x, gx: x, y: floor, pine: false }); }
      }
      feat = { kind, x0: xa, x1: xb, y0: floor - h, y1: floor, gas: kind === 'gas' ? GAS_MIX[Math.floor(hash3(cx, cy, 10) * GAS_MIX.length)] : undefined };
    }
    if (cx === 0 && cy === 0) {
      for (let y = 0; y < CORE.CH; y++) for (let x = 0; x < CORE.CW; x++) t[(y << 5) | x] = coreTile(ORIGIN, x, y);
      objs.push({ id: 'padcore', type: 'pad', x: 2, gx: 2, y: 3, pine: false });   // 코어 전송 패드(안쪽 바닥)
    }
    return { cx, cy, t, nat: t.slice(), diff: null, objs, feat, canvas: null, dirty: true, used: 0 };
  }
  // ---- 판 칸 저장(DESIGN §4-24): 덩어리별 줄 단위 런 길이 부호화. 값 0 = 자연 그대로, 그 외 = 새 타일 번호 + 1 ----
  const rleEncode = (a) => { const out = []; let v = a[0], n = 1; for (let i = 1; i < a.length; i++) { if (a[i] === v) n++; else { out.push(v + '*' + n); v = a[i]; n = 1; } } out.push(v + '*' + n); return out.join(','); };
  const rleDecode = (s, into) => { let i = 0; for (const part of s.split(',')) { const [v, n] = part.split('*'); const vv = +v, nn = +n; for (let k = 0; k < nn && i < into.length; k++) into[i++] = vv; } return into; };
  const chunkBytes = (key, str) => key.length + str.length + 6;
  function getChunk(cx, cy) {
    const key = cx + ',' + cy; let c = chunks.get(key);
    if (c) { c.used = ++useTick; return c; }
    if (chunks.size > 6000) for (const [k, v] of chunks) { if (!v.diff) chunks.delete(k); }   // 메모리 한계: 자연 그대로인 덩어리는 다시 만들 수 있으니 비운다
    c = genChunk(cx, cy); c.used = ++useTick;
    const saved = curS && curS.world && curS.world[key];
    if (saved) { c.diff = rleDecode(saved, new Uint8Array(CHUNK * CHUNK)); for (let i = 0; i < c.diff.length; i++) if (c.diff[i]) c.t[i] = c.diff[i] - 1; }
    chunks.set(key, c);
    return c;
  }
  let useTick = 0;
  const resetInf = (S) => { chunks.clear(); curS = S; worldRef = S.world; worldBytes = 0; for (const k in S.world) worldBytes += chunkBytes(k, S.world[k]); };
  // 월드 칸 하나를 바꾸고 저장 형식(S.world)에 반영한다
  function setInfTile(S, x, y, id) {
    const c = getChunk(x >> 5, y >> 5), i = ((y & 31) << 5) | (x & 31), key = c.cx + ',' + c.cy;
    c.t[i] = id;
    if (!c.diff) c.diff = new Uint8Array(CHUNK * CHUNK);
    c.diff[i] = c.nat[i] === id ? 0 : id + 1;
    const old = S.world[key]; if (old !== undefined) worldBytes -= chunkBytes(key, old);
    if (c.diff.some(v => v)) { const s = rleEncode(c.diff); S.world[key] = s; worldBytes += chunkBytes(key, s); } else { delete S.world[key]; c.diff = null; }
    c.dirty = true;
    const lx = x & 31, ly = y & 31;   // 가장자리 칸이면 이웃 덩어리의 윤곽도 다시 그린다
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if ((dx < 0 && lx === 0) || (dx > 0 && lx === 31) || (dy < 0 && ly === 0) || (dy > 0 && ly === 31)) { const n = chunks.get((c.cx + dx) + ',' + (c.cy + dy)); if (n) n.dirty = true; }
  }
  // 구역 온도(가정(임의값)): 행성 암반 12 ℃(UNDER_T) + 행성 보정(ENV.dT), 얼음 광맥 방 −15 ℃, 뜨거운 바위 방 45 ℃. d가 없으면 플레이어가 서 있는 자리. 칸 시뮬(19단계)이 오면 칸 온도로 바뀐다
  function ambientAt(S, d, tx, ty) {
    const pl = d ? (d.pl || 'start') : Sim.dockOf(S).island;
    const x = d ? d.x : tx !== undefined ? tx : Math.floor((S.px + PW / 2) / T), y = d ? d.y : ty !== undefined ? ty : Math.floor((S.py + PH / 2) / T);
    if (pl === 'start') { const f = getChunk(x >> 5, y >> 5).feat; if (f && x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1 + 1) { if (f.kind === 'icecrystal') return ICE_ZONE_T; if (f.kind === 'geyser') return HOT_ZONE_T; } }
    else if (pl !== 'plaza') for (const z of FIN_ZONES[pl] || []) if (z.kind === 'icecrystal' && x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1 + 1) return ICE_ZONE_T;
    return UNDER_T + Sim.ENV[pl].dT;
  }
  // 덩어리 안 자원 오브젝트(보이는 범위): (tx0..tx1, ty0..ty1) 칸 범위에 걸친 덩어리들의 것
  function objsIn(tx0, ty0, tx1, ty1) {
    if (!inf) return OBJS;
    const out = [];
    for (let cy = Math.max(0, ty0 >> 5); cy <= (ty1 >> 5); cy++) for (let cx = tx0 >> 5; cx <= (tx1 >> 5); cx++) for (const o of getChunk(cx, cy).objs) out.push(o);
    return out;
  }
  const objsNearTile = (tx, ty) => objsIn(tx - 8, ty - 8, tx + 8, ty + 8);
  const featureAt = (tx, ty) => inf ? getChunk(tx >> 5, ty >> 5).feat : null;

  // ---- 유한 맵: 허브 정거장(plaza)·원정 행성(alpine·polar) ----
  const SPAN = { plaza: [118, 202] };
  const OBJ_SPEC = {   // 허브: [종류, [옛 월드 x(= 맵 x + 106)]]. 재배 선반(나무·밀·사탕수수)·모래 비축·얼음 저장고는 첫 목표를 본부에서 할 수 있게 둔 소량이다
    plaza: [['fragment', [126]], ['harbor', [129]], ['pad', [131]], ['box', [133]], ['tree', [135, 143, 145, 146]], ['board', [137]], ['altar', [140]], ['wheat', [144, 147, 148]], ['cane', [149]], ['sandpile', [150]], ['icecrystal', [151]],
      ['project', [152]], ['trade', [154]], ['reports', [156]], ['boards', [158]], ['signs', [160]]],   // 17-b: 팀 간 교류 시설(평지 x 46~57)
  };
  // 원정 행성(102 × 56): 착륙 캡슐 동굴(전송 패드) + 자원 동굴. [종류, 중심 x, 바닥 y, 반폭 rx, 높이 h]
  const FIN_DEF = {
    alpine: [['landing', 14, 30, 8, 6], ['tree', 45, 38, 9, 5], ['tree', 75, 30, 9, 5], ['rocksalt', 60, 46, 8, 4], ['rocksalt', 88, 24, 7, 4]],
    polar: [['landing', 14, 30, 8, 6], ['icecrystal', 45, 40, 10, 5], ['icecrystal', 75, 28, 10, 5], ['icecrystal', 60, 48, 8, 4]],
  };
  const FIN_ZONES = {};
  function genUnder(name, W, H) {
    const map = new Uint8Array(W * H), objs = [], zones = [], E = 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = noise(x, y);
      map[y * W + x] = (x < E || x >= W - E || y < E || y >= H - E) ? BEDROCK : name === 'alpine' ? (v > 0.2 ? STONE : DIRT) : (v > 0.6 ? ICE : STONE);
    }
    for (const [kind, cx, floor, rx, h] of FIN_DEF[name]) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const hh = Math.max(2, Math.round(h * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2))));
        for (let y = floor - hh; y < floor; y++) map[y * W + x] = AIR;
        map[floor * W + x] = kind === 'icecrystal' ? ICE : kind === 'rocksalt' ? SALT : DIRT;
        if (kind === 'icecrystal') map[(floor + 1) * W + x] = ICE;
      }
      zones.push({ kind, x0: cx - rx, x1: cx + rx, y0: floor - h, y1: floor });
      if (kind === 'landing') continue;
      for (let x = cx - rx + 3; x <= cx + rx - 3; x += 5) objs.push({ id: kind.slice(0, 2) + x + 'y' + floor, type: kind, x, gx: x, y: floor, pine: false });
    }
    FIN_ZONES[name] = zones;
    objs.push({ id: 'pad' + name, type: 'pad', x: 14, gx: 14, y: 30, pine: false });
    return { map, gy: new Array(W).fill(0), objs, zones };
  }
  function genPlanet(name, W, H, off) {   // 유한 맵 생성(시험도 부른다): 크기를 인자로 받는다
    if (name !== 'plaza') return genUnder(name, W, H);
    const map = new Uint8Array(W * H), gy = [], objs = [], [s0, s1] = SPAN[name];
    for (let x = 0; x < W; x++) {
      const gx = x + off;
      let g = 30;                                                                       // 도킹 구역 바닥
      if (gx >= s0 && gx <= s1) {
        if (gx <= 125) g = Math.round(24 + 6 * (125 - gx) / 7);                        // 허브 서쪽 접안 구역
        else if (gx <= 194) g = 24; else g = Math.round(24 + 6 * (gx - 195) / 7);
      }
      gy[x] = g;
      const beach = gx <= 126 || gx >= 194;
      for (let y = g; y < H; y++) { const d = y - g; map[y * W + x] = d === 0 ? (beach ? SAND : GRASS) : d <= 4 ? (beach ? SAND : DIRT) : STONE; }
      for (let y = 25; y < g; y++) map[y * W + x] = WATER;
    }
    for (let gx = 164; gx <= 191; gx++) { const x = gx - off; map[24 * W + x] = AIR; for (let y = 25; y <= 27; y++) map[y * W + x] = WATER; map[28 * W + x] = SAND; }   // 도킹 구역(다른 사람의 탐사정이 떠 있는 곳): 윗줄은 비우고 물을 채운다
    for (const [type, xs] of OBJ_SPEC[name]) for (const gx of xs) objs.push({ id: type[0] + type[1] + gx, type, x: gx - off, gx, y: gy[gx - off], pine: false });
    return { map, gy, objs, zones: [] };
  }
  function loadPlanet(name) {
    const P = Sim.ISLANDS[name], g = genPlanet(name, P.W, P.H, P.off);
    dim.W = P.W; dim.H = P.H; MAP = g.map; BASE = g.map.slice(); loaded = name;
    GY.length = 0; GY.push(...g.gy); OBJS.length = 0; OBJS.push(...g.objs);
  }
  // 땅 파기/놓기로 바뀐 타일: 유한 맵은 S.dug(키 `행성id:y*W+x` → 새 종류), 무한 월드는 S.world(덩어리별 RLE)에 저장한다. S가 바뀔 때마다 기본 지형 위에 다시 입힌다.
  const DK = (k) => loaded + ':' + k;
  function applyDug(S) {
    const here = Sim.dockOf(S).island;
    curS = S;
    if (here === 'start') {
      if (!inf || worldRef !== S.world) resetInf(S);
      inf = true; loaded = 'start'; return;
    }
    inf = false;
    if (here !== loaded) loadPlanet(here); else MAP.set(BASE);
    const pre = loaded + ':';
    for (const k in S.dug) { if (!k.startsWith(pre)) continue; const v = S.dug[k], i = +k.slice(pre.length); if (v != null && i >= 0 && i < MAP.length) MAP[i] = v; }
    Sim.syncRaft(S);   // 탐사정 바닥 타일: 접안 쪽 끝에서 바깥쪽으로 cells칸 (저장하지 않고 S.raft에서 계산)
    if (loaded === 'plaza') for (const x of Sim.raftXs(S)) MAP[Sim.RAFT.ROW * dim.W + x] = RAFT;   // 탐사정은 본부 도킹 구역에만 있다
  }
  // 종류별 [얻는 아이템, 1회 양, 하루 횟수, 이름, 중심 y 오프셋(위로 몇 px)]
  const NODE = {
    tree: ['stick', 2, 2, '나무', 16], cane: ['sugar', 50, 2, '사탕수수', 8], wheat: ['noodle', 1, 2, '밀', 8],
    sandpile: ['sand', 2, 4, '모래 더미', 4], icecrystal: ['ice', 1, 3, '얼음 결정', 10],
    rocksalt: ['salt', 30, 2, '암염', 8],   // NaCl 결정(이온 결정이라 곡괭이로 캔다)   [#24]
  };
  // 옆면 화면의 지하 이름(17-a′, 내부 id·수치는 그대로). fp/·td/는 NODE의 옛 이름을 쓴다
  const UG_NAME = { tree: '결정 줄기 군락', cane: '당 결정', wheat: '균사 군락', sandpile: '모래 층', icecrystal: '얼음 광맥' };

  // ---------- 땅 파기 · 블록 놓기 ----------
  // 타일별 [얻는 아이템, 1회 양, 파는 데 걸리는 시간(초, 꾹 누르기), 필요한 도구 단계]. 시간·단계는 가정(임의값), DESIGN.md §4-24 표.
  // 도구 단계: 0 맨손 · 1 곡괭이 · 2 철 곡괭이(기술 노드 T4가 여는 제작법) · 3 아직 없음
  const DIG = {
    [GRASS]: { item: 'dirt', t: 0.5, tier: 0 }, [DIRT]: { item: 'dirt', t: 0.5, tier: 0 }, [SAND]: { item: 'sand', t: 0.4, tier: 0 },
    [SNOWTOP]: { item: 'ice', t: 0.8, tier: 0 }, [ICE]: { item: 'ice', t: 1.0, tier: 0 },
    [STONE]: { item: 'stone', t: 2.0, tier: 1 }, [SALT]: { item: 'salt', n: 30, t: 2.0, tier: 1 }, [IRON]: { item: 'iron', t: 3.0, tier: 1 },
    [HARD]: { item: 'stone', t: 4.0, tier: 2 }, [GOLD]: { item: 'gold', t: 5.0, tier: 2 }, [HOT]: { item: 'stone', t: 4.0, tier: 2 },
    [RARE]: { item: 'rare', t: 6.0, tier: 3 },
  };
  const toolTier = (S) => S.inv.ironpick > 0 ? 2 : S.inv.pickaxe > 0 ? 1 : 0;
  const BLOCK = { dirt: DIRT, stone: STONE, sand: SAND };   // 가방에서 꺼내 놓을 수 있는 블록
  const TOOL = { shaker: 'salt', thermo: 'thermo' };        // 가방 슬롯을 누르면 켜지는 도구 모드
  const dig = { on: false, tx: -1, ty: -1, p: 0, need: 0 };
  const inReach = (S, tx, ty) => Math.hypot(tx * T + T / 2 - (S.px + PW / 2), ty * T + T / 2 - (S.py + PH / 2)) <= REACH;
  const devHere = (S) => S.placed.filter(d => (d.pl || 'start') === loaded);   // 지금 보이는 행성에 서 있는 장치(17-a′: 장치는 d.pl 행성에 남는다)
  // 장치·오브젝트가 서 있는 바로 아래 땅은 파지 못한다
  function holdsThing(S, tx, ty) {
    if (devHere(S).some(d => ty === d.y + 2 && (tx === d.x || tx === d.x + 1))) return true;
    return objsNearTile(tx, ty).some(o => ty === o.y && (tx === o.x || (o.type === 'altar' && tx === o.x + 1)));
  }
  function digCheck(S, tx, ty) {
    const id = tileAt(tx, ty);
    if (!DIG[id]) return { ok: false, msg: id === WATER ? '물은 팔 수 없습니다.' : id === BEDROCK ? '천장·가장자리 암반은 팔 수 없습니다.' : '' };
    if (!inf && ty >= dim.H - 1) return { ok: false, msg: '맨 아래는 팔 수 없습니다.' };
    if (!inReach(S, tx, ty)) return { ok: false, msg: '' };
    if (holdsThing(S, tx, ty)) return { ok: false, msg: '장치나 자원 바로 아래 땅은 팔 수 없습니다.' };
    const def = DIG[id], tier = toolTier(S);
    if (def.tier > tier) return { ok: false, msg: def.tier === 1 ? '돌은 곡괭이가 있어야 팔 수 있어요.' : def.tier === 2 ? '이 단단함은 철 곡괭이(도구 단계 2)가 있어야 팔 수 있어요.' : '아직 이 단단함을 파는 도구가 없어요.' };
    if (inf && worldBytes >= SAVE_CAP) return { ok: false, msg: `판 칸 저장 크기가 상한(${Math.round(SAVE_CAP / 1000)} KB)에 닿았어요. 칸을 메우거나 기술 트리로 늘리세요.` };
    return { ok: true, def };
  }
  function setTile(S, tx, ty, id) {
    if (inf) { setInfTile(S, tx, ty, id); delete S.melt['start:' + tx + ',' + ty]; return; }
    const k = ty * dim.W + tx;
    MAP[k] = id; delete S.melt[DK(k)];
    if (BASE[k] === id) delete S.dug[DK(k)]; else S.dug[DK(k)] = id;
  }
  // 꾹 누르는 동안 매 프레임 부른다. (tx, ty) = 커서 아래 칸, blocked = 모달·모드가 떠 있어 팔 수 없는 상태
  function stepDig(S, dt, tx, ty, blocked) {
    if (!dig.on) return;
    if (blocked) { dig.p = 0; return; }
    if (tx !== dig.tx || ty !== dig.ty) { dig.tx = tx; dig.ty = ty; dig.p = 0; dig.msg = false; }
    const c = digCheck(S, tx, ty);
    if (!c.ok) { dig.p = 0; if (c.msg && !dig.msg) { dig.msg = true; say(c.msg); } return; }
    dig.need = c.def.t; dig.p += dt;
    if (dig.p < c.def.t) return;
    const id = tileAt(tx, ty), n = c.def.n || 1;
    setTile(S, tx, ty, AIR); S.inv[c.def.item] = (S.inv[c.def.item] || 0) + n; dig.p = 0;
    Sim.emit({ t: 'puff', x: tx * T + 8, y: ty * T + 8, col: id === DIRT || id === GRASS ? '#8a5a35' : id === SAND ? '#f6e7b0' : id === ICE || id === SNOWTOP ? '#d8f3ff' : id === GOLD ? '#f4cc4a' : id === IRON ? '#c0673a' : '#8b919c', n: 6 });
    say(`${ITEM[c.def.item][1]} +${n}`);
  }
  // 블록 놓기. 놓기 모드를 끝내야 하면 true(가방에 없을 때·다 썼을 때)
  function placeBlock(S, item, tx, ty) {
    if (!(S.inv[item] >= 1)) { say(`${ITEM[item][1]}이(가) 없습니다.`); return true; }
    if (tileAt(tx, ty) !== AIR || (!inf && (ty >= dim.H || tx < 0 || tx >= dim.W))) { say('빈 공간에만 놓을 수 있습니다.'); return false; }
    if (!inReach(S, tx, ty)) { say('너무 멉니다.'); return false; }
    if (inCore(S, tx, ty)) { say('코어 자리에는 놓을 수 없습니다.'); return false; }
    if (tx * T < S.px + PW && tx * T + T > S.px && ty * T < S.py + PH && ty * T + T > S.py) { say('내가 서 있는 자리에는 놓을 수 없습니다.'); return false; }
    if (devHere(S).some(d => tx >= d.x && tx <= d.x + 1 && ty >= d.y && ty <= d.y + 1) || objsNearTile(tx, ty).some(o => ty >= o.y - 3 && ty < o.y && tx >= o.x - 1 && tx <= o.x + 2)) { say('장치나 자원 자리에는 놓을 수 없습니다.'); return false; }
    if (!(solidAt(tx - 1, ty) || solidAt(tx + 1, ty) || solidAt(tx, ty - 1) || solidAt(tx, ty + 1))) { say('땅에 닿은 곳에만 놓을 수 있습니다.'); return false; }
    S.inv[item]--; setTile(S, tx, ty, BLOCK[item]);
    return S.inv[item] < 1;
  }

  // ---------- 도구: 소금 뿌리개 · 온도계 (곡괭이는 돌을 팔 때 자동으로 쓰인다) ----------
  const tileTemp = (S, tx, ty) => ambientAt(S, null, tx, ty);
  const meltKey = (tx, ty) => inf ? 'start:' + tx + ',' + ty : DK(ty * dim.W + tx);
  // sel = { dev } (장치) 또는 { tx, ty } (칸)
  function useThermo(S, sel) {
    const airTemp = () => Sim.airTemp(S);
    let name, val, note;
    if (sel.dev) {
      const d = sel.dev; name = DEV[d.id].name;
      if (d.id === 'fire') { const on = d.s.level > 0 && d.s.fuel > 0; val = on ? FIRE_T[d.s.level] : airTemp(); note = on ? `열원 (${FIRE_NAME[d.s.level]})` : '꺼져 있어 외기와 같음'; }
      else if (d.id === 'still' || d.id === 'cooker') { val = Sim.heatOf(S, d); note = '옆 화덕이 주는 열원 온도'; }
      else if (d.id === 'cooler') { const has = S.packs.length > 0; val = has ? Math.min(...S.packs.map(p => p.T)) : airTemp(); note = has ? '가장 찬 한제 팩' : '팩이 없어 외기와 같음'; }
      else { val = airTemp(); note = '외기와 같음'; }
    } else {
      const { tx, ty } = sel;
      if (!inReach(S, tx, ty)) return say('너무 멉니다. 가까이 가서 재세요.');
      val = tileTemp(S, tx, ty); name = `칸 (${tx}, ${ty})`;
      note = val === ICE_ZONE_T ? `가정: 얼음 광맥 방은 ${ICE_ZONE_T} ℃로 일정` : val === HOT_ZONE_T ? `가정: 뜨거운 바위 방은 ${HOT_ZONE_T} ℃로 일정` : `가정: 지하는 낮밤 없이 구역 온도 ${fmt(val, 0)} ℃로 일정(칸 시뮬 전까지)`;
    }
    say(`온도계: ${name} ${fmt(val, 1)} ℃ — ${note}`);
    logEv(S, '온도 측정', `${name} ${fmt(val, 1)}℃ (${note})`);
  }
  // sel = { wolf } (얼음 생물) 또는 { tx, ty } (칸)
  function useShaker(S, sel) {
    if (S.inv.salt < 1) return say('소금이 없습니다.');
    const T0 = Sim.airTemp(S), s = Math.min(SHAKE_G, S.inv.salt);
    if (sel.wolf) return Sim.act.saltOnWolf(S, sel.wolf, s);
    const { tx, ty } = sel, id = tileAt(tx, ty);
    if (id !== ICE && id !== SNOWTOP) return say('얼음·눈 타일이나 얼음 생물에게 뿌리세요.');
    if (!inReach(S, tx, ty)) return say('너무 멉니다.');
    const k = meltKey(tx, ty), had = S.melt[k] || 0, left = ICE_TILE_G - had, melt = C.iceMeltBySalt(T0, s);
    if (melt <= 0) return say('기온이 0 ℃ 이상이라 소금이 필요 없어요.');
    const used = melt >= left ? Math.min(s, C.saltForIce(T0, left)) : s, done = Math.min(melt, left);
    S.inv.salt -= used; S.melt[k] = had + done;
    logEv(S, '소금 뿌림(얼음 타일)', `기온 ${fmt(T0, 1)}℃ (m_eq=${fmt(-T0 / (2 * C.KF), 2)} mol/kg), 소금 ${fmt(used, 1)} g → 얼음 ${fmt(done, 0)} g 융해 (타일 ${fmt(had + done, 0)}/${ICE_TILE_G} g)`);
    Sim.emit({ t: 'puff', x: tx * T + 8, y: ty * T + 8, col: '#d8f3ff', n: 8 });
    if (had + done >= ICE_TILE_G - 1e-6) { setTile(S, tx, ty, WATER); say('얼음이 모두 녹아 물이 되었습니다.'); if (Sim.dockOf(S).island === 'polar') S.f.polarMelt = true; }
    else say(`얼음 ${fmt(done, 0)} g 융해 (타일 ${fmt(had + done, 0)}/${ICE_TILE_G} g). 소금 ${fmt(used, 1)} g 사용`);
  }

  // ---------- 상호작용 대상 (플레이어 주변에서 E/클릭으로 누를 수 있는 것) ----------
  const objCenter = o => o.type === 'altar' ? [o.x * T + 16, o.y * T - 16] : [o.x * T + 8, o.y * T - (NODE[o.type] ? NODE[o.type][4] : o.type === 'harbor' || o.type === 'board' || o.type === 'trade' || o.type === 'reports' || o.type === 'boards' || o.type === 'signs' ? 14 : o.type === 'project' ? 16 : 8)];
  function nearWater(S) {
    const tx = Math.floor((S.px + PW / 2) / T), ty = Math.floor((S.py + PH / 2) / T);
    for (let x = tx - 1; x <= tx + 1; x++) for (let y = ty - 1; y <= ty + 2; y++) if (tileAt(x, y) === WATER) return true;   // 탐사정 위에서는 바로 아래 물까지
    return false;
  }
  const mobHere = (S, m) => { const d = S.placed.find(x => x.x === m.dx && x.y === m.dy); return !!d && (d.pl || 'start') === loaded; };
  const wolfPos = m => [m.dx * T + (m.id % 2 ? 44 : -12), m.dy * T + 26];   // 장치 옆 땅 위
  function targets(S) {
    const cx = S.px + PW / 2, cy = S.py + PH / 2, out = [];
    const add = (kind, ref, x, y, label) => { const d = Math.hypot(x - cx, (y - cy) * 0.7); if (d <= REACH) out.push({ kind, ref, x, y, d, label }); };
    const ptx = Math.floor(cx / T), pty = Math.floor(cy / T);
    for (const o of objsIn(ptx - 4, pty - 4, ptx + 4, pty + 4)) {
      if (o.type === 'fragment' && S.f.raft) continue;   // 고친 뒤에는 파편이 사라진다
      const [x, y] = objCenter(o), n = NODE[o.type];
      const label = { box: '본부 보급 상자', altar: '대기 처리 코어 제단', harbor: '궤도 이동 단말 (궤도 이동)', board: '표류 통신 게시판', fragment: '탐사정 잔해 (수리)', pad: '전송 패드', trade: '교역소', reports: '연구 보고서 게시판', boards: '리더보드', signs: '팀 간판 (방문)', project: '공동 프로젝트: 대기 처리 코어' }[o.type];
      add(o.type, o, x, y, n ? `${UG_NAME[o.type] || n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : label);
    }
    for (const d of devHere(S)) add('dev', d, d.x * T + 16, d.y * T + 16, DEV[d.id].name + (d.s.broken ? ' (파손)' : ''));
    for (const m of S.mobs) { if (!mobHere(S, m)) continue; const [x, y] = wolfPos(m); add('wolf', m, x, y, `얼음 생물 ${fmt(m.M, 0)} g`); }
    if (nearWater(S)) add('water', null, cx, cy + 4, '염수 뜨기 (바닷물)');
    return out.sort((a, b) => a.d - b.d);
  }
  // 장치 건설(17-a′): 월드 안 어디든 2×2칸. (tx, ty) = 왼쪽 위 칸. 네 칸이 비어 있고 바로 아래가 단단해야 한다. 본부에는 짓지 않는다
  function ghostCheck(S, id, tx, ty) {
    const def = DEV[id], bad = (msg) => ({ ok: false, tx, ty, msg });
    if (loaded === 'plaza') return bad('본부는 공용 시설이라 장치를 지을 수 없어요. 내 월드나 원정 부지에 지으세요.');
    for (let x = tx; x < tx + 2; x++) { for (let y = ty; y < ty + 2; y++) if (tileAt(x, y) !== AIR) return bad('빈 공간 2×2칸이 필요합니다.'); if (!solidAt(x, ty + 2)) return bad('바닥이 단단해야 합니다.'); }
    if (inf && [0, 1].some(i => [0, 1].some(j => inCore(S, tx + i, ty + j)))) return bad('코어 안에는 지을 수 없어요.');
    if (devHere(S).some(d => Math.abs(d.x - tx) < 2 && Math.abs(d.y - ty) < 2)) return bad('다른 장치와 겹칩니다.');
    if (Math.hypot((tx + 1) * T - (S.px + PW / 2), (ty + 1) * T - (S.py + PH / 2)) > 8 * T) return bad('너무 멉니다. 가까이 가서 지으세요.');
    const dev = { x: tx, y: ty, pl: loaded };
    if (def.needFire && !Sim.fireNear(S, dev).length) return bad(`${def.name}은(는) 화덕 바로 옆에 지어야 합니다. (열 전달)`);
    return { ok: true, tx, ty };
  }
  const deviceAt = (S, wx, wy) => devHere(S).find(p => wx >= p.x * T && wx < p.x * T + 32 && wy >= p.y * T && wy < p.y * T + 32);
  const collides = (x, y) => {
    const x0 = Math.floor(x / T), x1 = Math.floor((x + PW - 0.01) / T), y0 = Math.floor(y / T), y1 = Math.floor((y + PH - 0.01) / T);
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty)) return true;
    return false;
  };

  const SURF_JUMP = 240;   // 가정(임의값) 수면에서 뛰어오르는 속도(px/s) → 약 32 px(2칸). 수면보다 한 칸 높은 둑에 오르려면 약 25 px 필요. 이전: 자동 오르기가 한 칸 턱을 넘겨 줌
  // 한 프레임 이동(2D·3D 공용: x·y는 단면 규칙 그대로, 3D의 z는 보이기만 한다). input = { ax: -1|0|1, jump }, st = { onGround, bound }
  function stepPlayer(S, dt, input, st) {
    const { ax, jump } = input;
    const inW = tileAt(Math.floor((S.px + PW / 2) / T), Math.floor((S.py + PH / 2) / T)) === WATER;
    S.vx = ax * (inW ? 42 : 72);
    if (ax) S.face = ax;
    if (jump) {
      if (st.onGround) { S.vy = -270; st.onGround = false; }   // 바닥을 딛고 있으면 물속에서도 뛴다(자동 오르기가 없으니 물가 한 칸 턱을 넘으려면 필요)
      else if (inW) {                                          // 떠 있을 때는 헤엄. 수면에서는 물 밖으로 뛰어오른다(물가 한 칸 턱을 넘기 위해)
        const surface = tileAt(Math.floor((S.px + PW / 2) / T), Math.floor((S.py - 2) / T)) !== WATER;
        S.vy = surface ? -SURF_JUMP : Math.max(S.vy - 700 * dt, -60);
      }
    }
    S.vy = Math.min(S.vy + (inW ? 300 : 900) * dt, inW ? 70 : 400);
    const nx = S.px + S.vx * dt;
    st.bound = false;
    if (!collides(nx, S.py)) S.px = nx;
    { const b = Sim.bounds(S), lo = b.L * T, hi = (b.R + 1) * T - PW;   // 행성 사이는 탐사정으로만 건넌다
      if (S.px < lo || S.px > hi) { S.px = Math.max(lo, Math.min(hi, S.px)); st.bound = true; } }
    const ny = S.py + S.vy * dt;
    if (!collides(S.px, ny)) S.py = ny;
    else { if (S.vy > 0) S.py = Math.floor((ny + PH) / T) * T - PH; else S.py = (Math.floor(ny / T) + 1) * T; S.vy = 0; }
    st.onGround = collides(S.px, S.py + 1);
  }

  // 무한 월드 보조(그리기·시험·저장 크기): 덩어리 접근, 오브젝트 범위, 저장 바이트
  // ---- 팀 월드 동기화(17-b): 서버에서 받은 덩어리 RLE 맵으로 내 S.world를 맞추고, 달라진 덩어리 캐시만 비운다 ----
  function applyWorldDelta(S, rw) {
    const changed = [];
    for (const k of new Set([...Object.keys(S.world), ...Object.keys(rw || {})])) {
      const v = rw ? rw[k] : undefined;
      if (S.world[k] === v) continue;
      if (v === undefined || v === null) delete S.world[k]; else S.world[k] = v;
      changed.push(k);
    }
    if (inf && curS === S) {
      for (const k of changed) {
        chunks.delete(k); const [cx, cy] = k.split(',').map(Number);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const n = chunks.get((cx + dx) + ',' + (cy + dy)); if (n) n.dirty = true; }
      }
      worldBytes = 0; for (const k in S.world) worldBytes += chunkBytes(k, S.world[k]);
    }
    return changed;
  }
  function resetWorldState(S) { for (const k in S.world) delete S.world[k]; chunks.clear(); worldBytes = 0; if (curS === S) resetInf(S); }
  // 방문 미리보기용 작은 그림(DESIGN §4-25): 판 덩어리 + 코어를 감싸는 범위를 최대 64×48칸 격자로 줄인다. 글자 . 단단함 · o 빈 곳 · ~ 물 · # 코어 선체
  function thumb(S) {
    const ks = Object.keys(S.world).map(k => k.split(',').map(Number)); ks.push([0, 0]);
    let cx0 = Infinity, cx1 = -Infinity, cy0 = Infinity, cy1 = -Infinity;
    for (const [a, b] of ks) { cx0 = Math.min(cx0, a); cx1 = Math.max(cx1, a); cy0 = Math.min(cy0, b); cy1 = Math.max(cy1, b); }
    cy0 = Math.max(cy0, -1);
    const x0 = cx0 * CHUNK, y0 = cy0 * CHUNK, bw = (cx1 - cx0 + 1) * CHUNK, bh = (cy1 - cy0 + 1) * CHUNK;
    const sc = Math.max(1, Math.ceil(bw / 64), Math.ceil(bh / 48)), w = Math.min(64, Math.ceil(bw / sc)), h = Math.min(48, Math.ceil(bh / sc)), rows = [];
    const saved = inf; if (!inf) inf = true;   // 무한 월드 타일을 읽는다(화면이 다른 행성이어도 같은 S.world를 본다)
    const keepS = curS; if (curS !== S) { curS = S; if (worldRef !== S.world) resetInf(S); }
    for (let j = 0; j < h; j++) {
      let row = '';
      for (let i = 0; i < w; i++) {
        let open = 0, water = 0, hull = 0, n = 0;
        for (let b = 0; b < Math.min(sc, 4); b++) for (let a = 0; a < Math.min(sc, 4); a++) {
          const t = infTile(x0 + i * sc + Math.floor(a * sc / Math.min(sc, 4)), y0 + j * sc + Math.floor(b * sc / Math.min(sc, 4))); n++;
          if (t === AIR || t === HATCH) open++; else if (t === WATER) water++; else if (t === HULL) hull++;
        }
        row += hull * 2 >= n ? '#' : water * 2 >= n ? '~' : open * 4 >= n ? 'o' : '.';
      }
      rows.push(row);
    }
    inf = saved; curS = keepS;
    return { x0, y0, s: sc, w, h, rows };
  }
  const worldSize = () => worldBytes;
  const isInfinite = () => inf;
  const planet = () => loaded;
  return {
    T, dim, genPlanet, PW, PH, REACH, ITEM, ICE_TILE_G, SHAKE_G, UNDER_T, ICE_ZONE_T, HOT_ZONE_T, CHUNK, LIMIT, CEIL, SEED, SAVE_CAP,
    AIR, GRASS, DIRT, STONE, SAND, SNOWTOP, ICE, WATER, RAFT, HULL, HATCH, BEDROCK, HARD, SALT, IRON, GOLD, HOT, RARE, SOLID, get MAP() { return MAP; }, GY, OBJS, NODE,
    tileAt, solidAt, isOpen, applyDug, DIG, BLOCK, TOOL, UG_NAME, dig, inReach, holdsThing, digCheck, setTile, stepDig, placeBlock, toolTier,
    CORE, coreTile, inCore, ambientAt, tileTemp, devHere, mobHere, useThermo, useShaker, objCenter, nearWater, wolfPos, targets, ghostCheck, deviceAt, collides, stepPlayer,
    getChunk, objsIn, featureAt, applyWorldDelta, resetWorldState, thumb, worldSize, isInfinite, planet, rleEncode, rleDecode, pickFeature, ZONES, STARTERS,
  };
})();
