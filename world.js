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
  pickaxe: ['pickaxe', '곡괭이', '개'], shaker: ['shaker', '소금 뿌리개', '개'], thermo: ['thermo', '온도계', '개'],
};
const ICE_TILE_G = 100;   // 가정(임의값) 얼음·눈 타일 1칸의 질량(g) = 얼음 아이템 1개
  const SHAKE_G = 10;       // 가정(임의값) 소금 뿌리개로 한 번에 뿌리는 소금(g)
  const UNDER_T = 12;       // 가정(임의값) 지하 온도(℃): 깊이와 상관없이 일정하다고 가정

  // ---------- 월드 (단면 타일맵) ----------
  const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, SNOWTOP = 5, ICE = 6, WATER = 7, RAFT = 8;
  const SOLID = [0, 1, 1, 1, 1, 1, 1, 0, 1];
  // 행성 맵 하나(16단계): 현재 불러온 행성의 크기 dim, 타일 MAP, 열별 지표 높이 GY, 자원 OBJS. 행성이 바뀌면 applyDug가 같은 배열을 제자리에서 다시 채운다(다른 모듈이 GY·OBJS를 잡고 있다).
  const dim = { W: 120, H: 56 };
  let MAP = new Uint8Array(dim.W * dim.H), BASE = MAP, loaded = '';
  const GY = [], OBJS = [];
  const tileAt = (x, y) => (y < 0 ? AIR : (x < 0 || x >= dim.W || y >= dim.H) ? STONE : MAP[y * dim.W + x]);
  const solidAt = (x, y) => SOLID[tileAt(x, y)] === 1;
  const isOpen = (x, y) => { const t = tileAt(x, y); return t === AIR || t === WATER; };
  // 행성 지형 생성: 크기(W, H)를 인자로 받는다. off = 옛 월드 x 창의 시작(옛 지형 식을 그대로 옮겨 쓰는 데 필요). 17단계에서 불시착 행성은 800 × 110 새 생성기로 바꾼다.
  // 지형 식은 그 행성의 옛 x 범위에서만 적용하고 나머지는 물(바다 바닥 높이 30)이다. 오브젝트 id는 옛 월드 x를 그대로 쓴다(하루 채집 기록 S.nodes가 깨지지 않게).
  const SPAN = { start: [0, 112], plaza: [118, 202], alpine: [213, 286], polar: [303, 376] };
  const OBJ_SPEC = {
    start: [['tree', [29, 32, 35, 68, 77, 80, 85, 98]], ['cane', [26, 27]], ['wheat', [36, 37, 38]], ['sandpile', [24, 25, 106]], ['icecrystal', [86, 89, 95, 97, 100]], ['harbor', [102]], ['fragment', [104]]],
    plaza: [['tree', [143, 146]], ['wheat', [147, 148]], ['cane', [149]], ['harbor', [129]], ['box', [133]], ['board', [137]], ['altar', [140]]],
    alpine: [['harbor', [223]], ['tree', [226, 231, 236, 252, 262, 270]], ['rocksalt', [241, 255, 267]]],
    polar: [['harbor', [313]], ['icecrystal', [316, 319, 323, 327, 346, 350, 354, 358]]],
  };
  function genPlanet(name, W, H, off) {
    const map = new Uint8Array(W * H), gy = [], objs = [], [s0, s1] = SPAN[name];
    for (let x = 0; x < W; x++) {
      const gx = x + off;
      let g = 30;                                                                       // 바다 밑바닥
      if (gx >= s0 && gx <= s1) {
        if (name === 'start') {
          if (gx <= 13) g = 30; else if (gx <= 27) g = Math.round(30 - 6 * (gx - 13) / 14); else if (gx <= 34) g = 24 - Math.round(1.2 * Math.sin((gx - 28) / 2.5)); else if (gx <= 66) g = 24;
          else if (gx <= 70) g = 24 - (gx - 66); else if (gx <= 74) g = 20; else if (gx <= 78) g = 20 + (gx - 74); else if (gx <= 82) g = 24;
          else if (gx <= 105) g = 24 - Math.round(1.5 * Math.sin((gx - 83) / 3)); else g = Math.round(24 + 6 * (gx - 105) / 7);
        } else if (name === 'plaza') {
          if (gx <= 125) g = Math.round(24 + 6 * (125 - gx) / 7);                        // 허브 서쪽 접안 구역
          else if (gx <= 194) g = 24; else g = Math.round(24 + 6 * (gx - 195) / 7);
        } else if (name === 'alpine') {
          if (gx <= 220) g = Math.round(24 + 6 * (220 - gx) / 7);                        // 고원 서쪽 접안 구역
          else if (gx <= 278) g = 24 - Math.round(2 * Math.abs(Math.sin((gx - 221) / 4)));   // 위로만 솟은 완만한 언덕(물웅덩이가 생기지 않게)
          else g = Math.round(24 + 6 * (gx - 279) / 7);
        } else {
          if (gx <= 310) g = Math.round(24 + 6 * (310 - gx) / 7);                        // 얼음 위성 서쪽 접안 구역
          else if (gx <= 368) g = 24; else g = Math.round(24 + 6 * (gx - 369) / 7);
        }
      }
      gy[x] = g;
      const plaza = name === 'plaza', alpine = name === 'alpine', polar = name === 'polar';
      const beach = (name === 'start' && (gx <= 27 || gx >= 106)) || (plaza && (gx <= 126 || gx >= 194)) || (alpine && (gx <= 220 || gx >= 279)),
        snow = (name === 'start' && gx >= 83 && gx <= 105) || polar, pond = (name === 'start' && gx >= 90 && gx <= 94) || (polar && gx >= 330 && gx <= 340);
      for (let y = g; y < H; y++) {
        const d = y - g;
        map[y * W + x] = d === 0 ? (pond ? ICE : beach ? SAND : snow ? SNOWTOP : GRASS)
          : d <= (alpine ? 1 : 4) ? (pond && d <= 1 ? ICE : beach ? SAND : DIRT) : STONE;   // 고원은 흙이 얇고 바위가 많다
      }
      for (let y = 25; y < g; y++) map[y * W + x] = WATER;
    }
    if (name === 'plaza') for (let gx = 152; gx <= 191; gx++) { const x = gx - off; map[24 * W + x] = AIR; for (let y = 25; y <= 27; y++) map[y * W + x] = WATER; map[28 * W + x] = SAND; }   // 허브의 정박 구역(다른 사람의 탐사정이 떠 있는 곳): 윗줄은 비우고 물을 채운다
    if (name === 'start') for (const [gcx, cy, r] of [[50, 37, 5], [70, 41, 6], [92, 38, 5], [30, 45, 6], [60, 48, 4]]) {
      for (let y = cy - r; y <= cy + r; y++) for (let x = gcx - r * 2; x <= gcx + r * 2; x++) {
        if (((x - gcx) / 2) ** 2 + (y - cy) ** 2 <= r * r) map[y * W + x - off] = AIR;
      }
    }
    for (const [type, xs] of OBJ_SPEC[name]) for (const gx of xs) objs.push({ id: type[0] + type[1] + gx, type, x: gx - off, gx, y: gy[gx - off] });
    return { map, gy, objs };
  }
  function loadPlanet(name) {
    const P = Sim.ISLANDS[name], g = genPlanet(name, P.W, P.H, P.off);
    dim.W = P.W; dim.H = P.H; MAP = g.map; BASE = g.map.slice(); loaded = name;
    GY.length = 0; GY.push(...g.gy); OBJS.length = 0; OBJS.push(...g.objs);
  }
  // 땅 파기/놓기로 바뀐 타일만 S.dug(키 `행성id:y*W+x` → 새 종류)에 저장한다. S가 바뀔 때마다 기본 지형 위에 다시 입힌다.
  const DK = (k) => loaded + ':' + k;
  function applyDug(S) {
    const here = Sim.dockOf(S).island;
    if (here !== loaded) loadPlanet(here); else MAP.set(BASE);
    const pre = loaded + ':';
    for (const k in S.dug) { if (!k.startsWith(pre)) continue; const v = S.dug[k], i = +k.slice(pre.length); if (v != null && i >= 0 && i < MAP.length) MAP[i] = v; }
    Sim.syncRaft(S);   // 탐사정 바닥 타일: 접안 쪽 끝에서 바깥쪽으로 cells칸 (저장하지 않고 S.raft에서 계산)
    for (const x of Sim.raftXs(S)) MAP[Sim.RAFT.ROW * dim.W + x] = RAFT;
  }
  // 종류별 [얻는 아이템, 1회 양, 하루 횟수, 이름, 중심 y 오프셋(위로 몇 px)]
  const NODE = {
    tree: ['stick', 2, 2, '나무', 16], cane: ['sugar', 50, 2, '사탕수수', 8], wheat: ['noodle', 1, 2, '밀', 8],
    sandpile: ['sand', 2, 4, '모래 더미', 4], icecrystal: ['ice', 1, 3, '얼음 결정', 10],
    rocksalt: ['salt', 30, 2, '암염', 8],   // NaCl 결정(이온 결정이라 녹는점이 높아 곡괭이로 캔다)   [#24]
  };

  // ---------- 땅 파기 · 블록 놓기 ----------
  // 타일별 [얻는 아이템, 파는 데 걸리는 시간(초, 꾹 누르기)]. 시간은 모두 가정(임의값): 흙·모래 짧게, 눈·얼음 중간, 돌은 곡괭이가 필요하고 오래
  const DIG = {
    [GRASS]: { item: 'dirt', t: 0.5 }, [DIRT]: { item: 'dirt', t: 0.5 }, [SAND]: { item: 'sand', t: 0.4 },
    [SNOWTOP]: { item: 'ice', t: 0.8 }, [ICE]: { item: 'ice', t: 1.0 },
    [STONE]: { item: 'stone', t: 2.0, tool: 'pickaxe' },
  };
  const BLOCK = { dirt: DIRT, stone: STONE, sand: SAND };   // 가방에서 꺼내 놓을 수 있는 블록
  const TOOL = { shaker: 'salt', thermo: 'thermo' };        // 가방 슬롯을 누르면 켜지는 도구 모드
  const dig = { on: false, tx: -1, ty: -1, p: 0, need: 0 };
  const inReach = (S, tx, ty) => Math.hypot(tx * T + T / 2 - (S.px + PW / 2), ty * T + T / 2 - (S.py + PH / 2)) <= REACH;
  // 장치·오브젝트가 서 있는 바로 아래 땅은 파지 못한다
  function holdsThing(S, tx, ty) {
    if (S.placed.some(d => ty === d.y + 2 && (tx === d.x || tx === d.x + 1))) return true;
    return OBJS.some(o => ty === o.y && (tx === o.x || (o.type === 'altar' && tx === o.x + 1)));
  }
  function digCheck(S, tx, ty) {
    const id = tileAt(tx, ty);
    if (!DIG[id]) return { ok: false, msg: id === WATER ? '물은 팔 수 없습니다.' : '' };
    if (ty >= dim.H - 1) return { ok: false, msg: '맨 아래는 팔 수 없습니다.' };
    if (!inReach(S, tx, ty)) return { ok: false, msg: '' };
    if (holdsThing(S, tx, ty)) return { ok: false, msg: '장치나 자원 바로 아래 땅은 팔 수 없습니다.' };
    const def = DIG[id];
    if (def.tool && !(S.inv[def.tool] > 0)) return { ok: false, msg: '돌은 곡괭이가 있어야 팔 수 있어요.' };
    return { ok: true, def };
  }
  function setTile(S, tx, ty, id) {
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
    const id = tileAt(tx, ty);
    setTile(S, tx, ty, AIR); S.inv[c.def.item] = (S.inv[c.def.item] || 0) + 1; dig.p = 0;
    Sim.emit({ t: 'puff', x: tx * T + 8, y: ty * T + 8, col: id === STONE ? '#8b919c' : id === SAND ? '#f6e7b0' : id === ICE || id === SNOWTOP ? '#d8f3ff' : '#8a5a35', n: 6 });
    say(`${ITEM[c.def.item][1]} +1`);
  }
  // 블록 놓기. 놓기 모드를 끝내야 하면 true(가방에 없을 때·다 썼을 때)
  function placeBlock(S, item, tx, ty) {
    if (!(S.inv[item] >= 1)) { say(`${ITEM[item][1]}이(가) 없습니다.`); return true; }
    if (tileAt(tx, ty) !== AIR || ty >= dim.H || tx < 0 || tx >= dim.W) { say('빈 공간에만 놓을 수 있습니다.'); return false; }
    if (!inReach(S, tx, ty)) { say('너무 멉니다.'); return false; }
    if (tx * T < S.px + PW && tx * T + T > S.px && ty * T < S.py + PH && ty * T + T > S.py) { say('내가 서 있는 자리에는 놓을 수 없습니다.'); return false; }
    if (S.placed.some(d => tx >= d.x && tx <= d.x + 1 && ty >= d.y && ty <= d.y + 1) || OBJS.some(o => ty >= o.y - 3 && ty < o.y && tx >= o.x - 1 && tx <= o.x + 2)) { say('장치나 자원 자리에는 놓을 수 없습니다.'); return false; }
    if (!(solidAt(tx - 1, ty) || solidAt(tx + 1, ty) || solidAt(tx, ty - 1) || solidAt(tx, ty + 1))) { say('땅에 닿은 곳에만 놓을 수 있습니다.'); return false; }
    S.inv[item]--; setTile(S, tx, ty, BLOCK[item]);
    return S.inv[item] < 1;
  }

  // ---------- 도구: 소금 뿌리개 · 온도계 (곡괭이는 돌을 팔 때 자동으로 쓰인다) ----------
  const tileTemp = (S, tx, ty) => (tx >= 0 && tx < dim.W && ty > GY[tx] ? UNDER_T : Sim.airTemp(S));
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
      const under = tx >= 0 && tx < dim.W && ty > GY[tx];
      val = tileTemp(S, tx, ty); name = under ? `지하 (${tx}, ${ty})` : `외기 (${tx}, ${ty})`;
      note = under ? `가정: 지하는 깊이와 상관없이 ${UNDER_T} ℃로 일정` : '시각에 따라 변하는 외기 온도';
    }
    say(`온도계: ${name} ${fmt(val, 1)} ℃ — ${note}`);
    logEv(S, '온도 측정', `${name} ${fmt(val, 1)}℃ (${note})`);
  }
  // sel = { wolf } (서리 늑대) 또는 { tx, ty } (칸)
  function useShaker(S, sel) {
    if (S.inv.salt < 1) return say('소금이 없습니다.');
    const T0 = Sim.airTemp(S), s = Math.min(SHAKE_G, S.inv.salt);
    if (sel.wolf) return Sim.act.saltOnWolf(S, sel.wolf, s);
    const { tx, ty } = sel, id = tileAt(tx, ty);
    if (id !== ICE && id !== SNOWTOP) return say('얼음·눈 타일이나 서리 늑대에게 뿌리세요.');
    if (!inReach(S, tx, ty)) return say('너무 멉니다.');
    const k = DK(ty * dim.W + tx), had = S.melt[k] || 0, left = ICE_TILE_G - had, melt = C.iceMeltBySalt(T0, s);
    if (melt <= 0) return say('기온이 0 ℃ 이상이라 소금이 필요 없어요.');
    const used = melt >= left ? Math.min(s, C.saltForIce(T0, left)) : s, done = Math.min(melt, left);
    S.inv.salt -= used; S.melt[k] = had + done;
    logEv(S, '소금 뿌림(얼음 타일)', `기온 ${fmt(T0, 1)}℃ (m_eq=${fmt(-T0 / (2 * C.KF), 2)} mol/kg), 소금 ${fmt(used, 1)} g → 얼음 ${fmt(done, 0)} g 융해 (타일 ${fmt(had + done, 0)}/${ICE_TILE_G} g)`);
    Sim.emit({ t: 'puff', x: tx * T + 8, y: ty * T + 8, col: '#d8f3ff', n: 8 });
    if (had + done >= ICE_TILE_G - 1e-6) { setTile(S, tx, ty, WATER); say('얼음이 모두 녹아 물이 되었습니다.'); if (Sim.dockOf(S).island === 'polar') S.f.polarMelt = true; }
    else say(`얼음 ${fmt(done, 0)} g 융해 (타일 ${fmt(had + done, 0)}/${ICE_TILE_G} g). 소금 ${fmt(used, 1)} g 사용`);
  }

  // ---------- 상호작용 대상 (플레이어 주변에서 E/클릭으로 누를 수 있는 것) ----------
  const objCenter = o => o.type === 'altar' ? [o.x * T + 16, o.y * T - 16] : [o.x * T + 8, o.y * T - (NODE[o.type] ? NODE[o.type][4] : o.type === 'harbor' || o.type === 'board' ? 14 : 8)];
  function nearWater(S) {
    const tx = Math.floor((S.px + PW / 2) / T), ty = Math.floor((S.py + PH / 2) / T);
    for (let x = tx - 1; x <= tx + 1; x++) for (let y = ty - 1; y <= ty + 2; y++) if (tileAt(x, y) === WATER) return true;   // 뗏목 위에서는 바로 아래 물까지
    return false;
  }
  const wolfPos = m => [m.dx * T + (m.id % 2 ? 44 : -12), m.dy * T + 26];   // 장치 옆 땅 위
  function targets(S) {
    const cx = S.px + PW / 2, cy = S.py + PH / 2, out = [];
    const add = (kind, ref, x, y, label) => { const d = Math.hypot(x - cx, (y - cy) * 0.7); if (d <= REACH) out.push({ kind, ref, x, y, d, label }); };
    for (const o of OBJS) {
      if (o.type === 'fragment' && S.f.raft) continue;   // 고친 뒤에는 파편이 사라진다
      const [x, y] = objCenter(o), n = NODE[o.type];
      const label = { box: '광장 보급 상자', altar: '솥 골렘 제단', harbor: '항구 표지판 (항해)', board: '유리병 편지 게시판', fragment: '뗏목 파편 (수리)' }[o.type];
      add(o.type, o, x, y, n ? `${n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : label);
    }
    for (const d of S.placed) add('dev', d, d.x * T + 16, d.y * T + 16, DEV[d.id].name + (d.s.broken ? ' (파손)' : ''));
    for (const m of S.mobs) { const [x, y] = wolfPos(m); add('wolf', m, x, y, `서리 늑대 ${fmt(m.M, 0)} g`); }
    if (nearWater(S)) add('water', null, cx, cy + 4, '바닷물 뜨기');
    return out.sort((a, b) => a.d - b.d);
  }
  // 장치는 뗏목 위에만 짓는다: 왼쪽 타일 tx → 뗏목의 해안 쪽 끝에서 u칸 떨어진 자리(2칸 폭)
  function ghostCheck(S, id, tx) {
    const def = DEV[id], u = Sim.raftU(S, tx);
    if (u < 0 || u + 2 > S.raft.cells) return { ok: false, tx, msg: '뗏목 위에 지어야 합니다. (뗏목이 모자라면 건설 메뉴에서 넓히세요)' };
    const dev = { x: tx, y: Sim.RAFT.DEV_Y };
    if (S.placed.some(d => Math.abs(d.u - u) < 2)) return { ok: false, tx, msg: '다른 장치와 겹칩니다.' };
    if (Math.abs(tx * T - S.px) > 8 * T) return { ok: false, tx, msg: '너무 멉니다. 가까이 가서 지으세요.' };
    if (def.needFire && !Sim.fireNear(S, dev).length) return { ok: false, tx, msg: `${def.name}은(는) 화덕 바로 옆에 지어야 합니다. (열 전달)` };
    return { ok: true, tx, ty: dev.y, u };
  }
  const deviceAt = (S, wx, wy) => S.placed.find(p => wx >= p.x * T && wx < p.x * T + 32 && wy >= p.y * T && wy < p.y * T + 32);
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
    { const b = Sim.bounds(S), lo = b.L * T, hi = (b.R + 1) * T - PW;   // 섬 사이는 뗏목으로만 건넌다
      if (S.px < lo || S.px > hi) { S.px = Math.max(lo, Math.min(hi, S.px)); st.bound = true; } }
    const ny = S.py + S.vy * dt;
    if (!collides(S.px, ny)) S.py = ny;
    else { if (S.vy > 0) S.py = Math.floor((ny + PH) / T) * T - PH; else S.py = (Math.floor(ny / T) + 1) * T; S.vy = 0; }
    st.onGround = collides(S.px, S.py + 1);
  }

  return {
    T, dim, genPlanet, PW, PH, REACH, ITEM, ICE_TILE_G, SHAKE_G, UNDER_T,
    AIR, GRASS, DIRT, STONE, SAND, SNOWTOP, ICE, WATER, RAFT, SOLID, get MAP() { return MAP; }, GY, OBJS, NODE,
    tileAt, solidAt, isOpen, applyDug, DIG, BLOCK, TOOL, dig, inReach, holdsThing, digCheck, setTile, stepDig, placeBlock,
    tileTemp, useThermo, useShaker, objCenter, nearWater, wolfPos, targets, ghostCheck, deviceAt, collides, stepPlayer,
  };
})();
