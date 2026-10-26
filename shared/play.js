// 플레이 규칙과 조작 상태(13-d): fp/(1인칭)와 td/(탑다운)가 같이 쓰는 "무엇을 누르면 무엇이 일어나는가". fp/main.js에 있던 것을 그대로 옮겼다.
// 화면에 묶이는 것(대상 찾기·건설 칸 찾기·연기 그리기)은 env로 받는다: env.aimed() 가리키는 대상, env.cell() 건설 칸, env.puff(x, y, z, 색, 개수).
// 화학 계산은 chem.js·sim.js(World·Sim 함수)가 하고 여기서는 식을 만들지 않는다. 숫자·문구는 옮기기 전과 같다(DESIGN.md §4-20).
import { SEA, RX0, RZ0, PAD } from './gen.js';
import { PLOT_OFF } from './ctl.js';
import { Party } from './party.js';
import { HubUI } from './hub.js';

const C = Chem, S = Store.S;
const { ITEM, NODE, DIG, TOOL, STONE, ICE, ICE_TILE_G, SHAKE_G } = World;
const { DEV, FIRE_T, FIRE_NAME } = Sim;
const { fmt, say, flush, refresh, interact } = UI;

// 블록 채굴을 없앤 대신 새로 생긴 자원 노드(fp·td에서만): 2D의 DIG 값(돌: 곡괭이 필요·2.0초, 얼음: 1.0초)을 채집 조건으로 읽는다. [아이템, 1회 양, 하루 상한, 이름, 높이]
if (!NODE.rock) Object.assign(NODE, { rock: ['stone', 1, 4, '바위 (곡괭이 필요)', 8], iceblock: ['ice', 1, 3, '얼음 덩어리', 8] });
export const HOLD = { rock: DIG[STONE], iceblock: DIG[ICE] };   // 꾹 눌러 캐는 노드와 걸리는 시간 {item, t, tool}
// 땅 파기를 전제한 문구는 fp·td에서 보이는 것만 채집으로 바꾼다(2D 문구는 그대로)
Sim.QUESTS[10].t = '극지 섬에서 소금 뿌리개로 얼음 덩어리 1개를 녹이세요';
Sim.RECIPES.find(r => r.id === 'pickaxe').note = '바위·암염을 캘 수 있다 (광장 보급 상자에서 처음 돌을 얻는다)';
Sim.RECIPES.find(r => r.id === 'thermo').note = '장치와 공기의 온도를 읽는다';

export const REACH = 5;                  // 손이 닿는 거리(m, 가정)
export const LINK_MAX = 8;               // 가정(임의값) 연결선 최대 거리(m): DESIGN §4-18
const PIPE_MIN = 10, PIPE_G = 50;        // 배관: 게임 시간 10분마다, 증류기 출력 50 g 이상일 때(가정)
const OBJ_R = { trade: 1.2, reports: 1.2, boards: 1.2, signs: 1.2, project: 1.2, tree: 1.5, altar: 1.6, harbor: 1.0, board: 1.0, box: 1.0, fragment: 1.0, rock: 1.3, iceblock: 1.2 };   // 조준 반지름(m)
const LABELS = { box: '광장 보급 상자', altar: '솥 골렘 제단', harbor: '항구 표지판 (항해)', board: '유리병 편지 게시판', fragment: '뗏목 파편 (수리)', trade: '교역소', reports: '연구 보고서 게시판', boards: '리더보드', signs: '팀 간판', project: '공동 프로젝트 (대기 처리 코어)' };
const LINK_NAME = { heat: '열선(화덕 → 열이 필요한 장치)', water: '배관(증류기 → 밥솥, 증류수)' };

// 설정 오류 안내: 열이 필요한데 열원이 없거나(옆 화덕도 열선도 없음), 밥솥 탱크에 증류수가 들어와 있는 것을 이름표에 보여 준다
export function deviceNote(d) {
  let s = '';
  if (DEV[d.id].needFire && !Sim.fireNear(S, d).length) s += ' (열원 연결 안 됨)';
  if (d.id === 'cooker' && (d.s.tank || 0) > 0) s += ` (탱크 ${fmt(d.s.tank, 0)} g)`;
  return s;
}
// 조작할 수 있는 모든 대상(월드 좌표 포함). 화면 쪽이 가리키는 것을 고른다
export function collectTargets(ctx) {
  const { isl, visible, devWorld, melted, wolfWorld } = ctx, out = [], add = (kind, ref, wx, wy, wz, label, r) => out.push({ kind, ref, wx, wy, wz, label, r, x: wx, y: wy });
  for (const o of isl.objs) {
    if ((o.type === 'fragment' && S.f.raft) || melted(o)) continue;
    const n = NODE[o.type], label = LABELS[o.type];
    add(o.type, o, o.x, o.y + (o.type === 'rock' || o.type === 'iceblock' ? 0.7 : n ? Math.min(2.2, n[4] / 4) : 1), o.z, n ? `${n[3]} (${n[2] - (S.nodes[o.id] || 0)}/${n[2]})` : label, OBJ_R[o.type] || 1.1);
  }
  for (const d of S.placed) {
    if (!visible(d)) continue;
    const [x, y, z] = devWorld(d);
    add('dev', d, x, y + 0.9, z, DEV[d.id].name + (d.s.broken ? ' (파손)' : '') + deviceNote(d), 1.4); out[out.length - 1].gy = y;
  }
  for (const mb of S.mobs) { const [x, y, z] = wolfWorld(mb); add('wolf', mb, x, y + 0.6, z, `서리 늑대 ${fmt(mb.M, 0)} g`, 1.0); }
  return out;
}

export function makePlay(ctx, env) {
  const A = () => env.pickA || '바라보고 우클릭', B = () => env.pickB || '보고 우클릭';   // 화면별 조작 말(fp: 시선 + 우클릭, td: 클릭)
  const pl = { mode: null, sel: null, linkKind: null, linkFrom: null, dig: { on: false, key: '', p: 0, need: 0 }, lastTarget: null };   // mode: 'build:<id>' | 'demolish' · sel: 가방에서 고른 도구 아이템. dig 이름은 이전 버전과 같게 두었다: 꾹 누르기 진행
  let digMsg = false;
  const { visible, devWorld } = ctx;
  const cancel = () => { pl.mode = null; pl.sel = null; pl.linkKind = null; pl.linkFrom = null; };
  pl.cancel = cancel;
  pl.anyMode = () => !!(pl.mode || pl.sel || pl.linkKind);

  // ---------- 노드 채집(꾹 누르기) ----------
  // 바위·얼음 덩어리는 좌클릭을 꾹 눌러 캔다(걸리는 시간과 곡괭이 필요 여부는 2D의 DIG 값). 나머지 자원은 E로 바로 채집한다(2D와 같음)
  pl.stepGather = (dt) => {
    const dig = pl.dig;
    if (!dig.on || pl.mode || UI.isModalOpen() || pl.sel) { dig.p = 0; return; }
    const t = env.aimed();
    if (!t || !HOLD[t.kind]) { dig.p = 0; dig.need = 0; return; }
    const def = HOLD[t.kind], key = t.ref.id;
    if (key !== dig.key) { dig.key = key; dig.p = 0; digMsg = false; }
    if (def.tool && !(S.inv[def.tool] > 0)) { dig.p = 0; if (!digMsg) { digMsg = true; say('바위는 곡괭이가 있어야 캘 수 있어요.'); } return; }
    if ((S.nodes[key] || 0) >= NODE[t.kind][2]) { dig.p = 0; if (!digMsg) { digMsg = true; say('오늘은 더 캘 수 없어요. 내일 다시 자랍니다.'); } return; }
    dig.need = def.t; dig.p += dt;
    if (dig.p < def.t) return;
    dig.p = 0; pl.lastTarget = t; interact(t);
  };

  // ---------- 온도계·소금 뿌리개: 2D(world.js)와 같은 식(Chem)과 상수(ICE_TILE_G, SHAKE_G)를 쓴다 ----------
  pl.useThermo = () => {
    const t = env.aimed(), airTemp = () => Sim.airTemp(S);
    let name, val, note;
    if (t && t.kind === 'dev') {
      const d = t.ref; name = DEV[d.id].name;
      if (d.id === 'fire') { const on = d.s.level > 0 && d.s.fuel > 0; val = on ? FIRE_T[d.s.level] : airTemp(); note = on ? `열원 (${FIRE_NAME[d.s.level]})` : '꺼져 있어 외기와 같음'; }
      else if (d.id === 'still' || d.id === 'cooker') { val = Sim.heatOf(S, d); note = '옆 화덕이 주는 열원 온도'; }
      else if (d.id === 'cooler') { const has = S.packs.length > 0; val = has ? Math.min(...S.packs.map(q => q.T)) : airTemp(); note = has ? '가장 찬 한제 팩' : '팩이 없어 외기와 같음'; }
      else { val = airTemp(); note = '외기와 같음'; }
    } else { val = airTemp(); name = '외기'; note = '시각에 따라 변하는 외기 온도'; }
    say(`온도계: ${name} ${fmt(val, 1)} ℃ — ${note}`);
    Sim.logEv(S, '온도 측정', `${name} ${fmt(val, 1)}℃ (${note})`);
  };
  pl.useShaker = () => {
    if (S.inv.salt < 1) return say('소금이 없습니다.');
    const T0 = Sim.airTemp(S), s = Math.min(SHAKE_G, S.inv.salt), t = env.aimed();
    if (t && t.kind === 'wolf') { Sim.act.saltOnWolf(S, t.ref, s); return; }
    if (!t || (t.kind !== 'iceblock' && t.kind !== 'icecrystal')) return say('얼음 덩어리·얼음 결정이나 서리 늑대에게 뿌리세요.');
    const k = t.ref.id, had = S.melt[k] || 0, left = ICE_TILE_G - had, melt = C.iceMeltBySalt(T0, s);
    if (melt <= 0) return say('기온이 0 ℃ 이상이라 소금이 필요 없어요.');
    const used = melt >= left ? Math.min(s, C.saltForIce(T0, left)) : s, done = Math.min(melt, left);
    S.inv.salt -= used; S.melt[k] = had + done;
    Sim.logEv(S, '소금 뿌림(얼음 덩어리)', `기온 ${fmt(T0, 1)}℃ (m_eq=${fmt(-T0 / (2 * C.KF), 2)} mol/kg), 소금 ${fmt(used, 1)} g → 얼음 ${fmt(done, 0)} g 융해 (덩어리 ${fmt(had + done, 0)}/${ICE_TILE_G} g)`);
    env.puff(t.wx, t.wy, t.wz, '#d8f3ff', 8);
    if (had + done >= ICE_TILE_G - 1e-6) { delete S.melt[k]; S.fp.melted[k] = S.day; say('얼음이 모두 녹아 물이 되었습니다.'); if (ctx.name === 'polar') S.f.polarMelt = true; }
    else say(`얼음 ${fmt(done, 0)} g 융해 (덩어리 ${fmt(had + done, 0)}/${ICE_TILE_G} g). 소금 ${fmt(used, 1)} g 사용`);
  };

  // ---------- 건설(뗏목 격자·행성 부지 위의 2×2) ----------
  const cellWorld = (c) => c.plot ? [PAD.x0 + c.gx + 1, ctx.isl.padH + 0.9, PAD.z0 + c.gz + 1] : [RX0 + c.gx + 1, SEA + 0.9, RZ0 + c.gz + 1];
  pl.cellWorld = cellWorld;
  pl.ghostCheck = (id, c) => {
    const def = DEV[id];
    if (!c) return { ok: false, msg: '탐사정 바닥이나 기지 부지를 바라보세요.' };
    if (c.gx < 0 || c.gz < 0 || c.gx + 2 > c.cx || c.gz + 2 > c.cz) return { ok: false, msg: c.plot ? '기지 부지 안에 지어야 합니다.' : '탐사정 위에 지어야 합니다. (탐사정이 모자라면 건설 메뉴에서 넓히세요)' };
    const off = c.plot ? PLOT_OFF(c.plot) : 0, same = d => (d.plot || null) === c.plot;
    if (S.placed.some(d => same(d) && Math.abs(d.x - off - c.gx) < 2 && Math.abs(d.y - c.gz) < 2)) return { ok: false, msg: '다른 장치와 겹칩니다.' };
    if (def.needFire && !Sim.fireNear(S, { x: off + c.gx, y: c.gz }).length) {
      // 옆에 화덕이 없어도, 같은 부지의 화덕이 연결 거리 안에 있으면 지을 수 있다(지은 뒤 열선을 이어야 한다)
      const [wx, , wz] = cellWorld(c), far = S.placed.some(f => f.id === 'fire' && same(f) && visible(f) && Math.hypot(devWorld(f)[0] - wx, devWorld(f)[2] - wz) <= LINK_MAX);
      if (!far) return { ok: false, msg: `${def.name}은(는) 화덕 바로 옆이나 열선이 닿는 거리(${LINK_MAX} m) 안에 지어야 합니다.` };
      return { ok: true, warn: `${def.name}을(를) 지었습니다. 화덕과 열선을 이으세요 (L 키 → 화덕 → ${def.name}).` };
    }
    return { ok: true };
  };
  function placeAtLook() {
    if (pl.mode.startsWith('build:')) {
      const id = pl.mode.slice(6), c = env.cell(), g = pl.ghostCheck(id, c);
      if (!g.ok) return say(g.msg);
      const off = c.plot ? PLOT_OFF(c.plot) : 0, where = c.plot ? `기지 부지 (${c.gx}, ${c.gz})` : `뗏목 격자 (${c.gx}, ${c.gz})`;
      if (Sim.act.place(S, id, off + c.gx, c.gz, undefined, where)) {
        const dev = S.placed[S.placed.length - 1]; if (c.plot) dev.plot = c.plot; dev.uid = ctx.nextUid();
        pl.mode = null; Party.note('build', `${DEV[id].name} 건설 (${where})`); if (g.warn) say(g.warn);
      }
      flush(); refresh(); return;
    }
    if (pl.mode === 'demolish') {
      const t = env.aimed();
      if (!t || t.kind !== 'dev') return say('철거할 장치를 바라보세요.');
      const dn = DEV[t.ref.id].name, uid = t.ref.uid; Sim.act.demolish(S, t.ref);
      S.links = S.links.filter(l => l.a !== uid && l.b !== uid);   // 그 장치의 연결선도 지운다
      Party.note('demolish', `${dn} 철거(재료 환불)`); flush(); pl.mode = null; refresh();
    }
  }

  // ---------- 연결선(열선·배관, 10단계) ----------
  pl.cycleLink = () => {
    pl.mode = null; pl.sel = null; pl.linkFrom = null;
    pl.linkKind = pl.linkKind === null ? 'heat' : pl.linkKind === 'heat' ? 'water' : null;
    say(pl.linkKind ? `연결 모드: ${LINK_NAME[pl.linkKind]} — 출발 장치를 ${B()} (L: 다음, Q: 취소)` : '연결 모드 끔');
  };
  function linkPick() {
    const t = env.aimed();
    if (!t || t.kind !== 'dev') return say(`연결할 장치를 ${A()}하세요.`);
    const d = t.ref;
    if (!pl.linkFrom) {
      if (pl.linkKind === 'heat' && d.id !== 'fire') return say('열선은 화덕에서 시작합니다.');
      if (pl.linkKind === 'water' && d.id !== 'still') return say('배관은 증류기에서 시작합니다.');
      pl.linkFrom = d; return say(`${DEV[d.id].name}에서 시작합니다. 도착 장치를 ${B()}하세요.`);
    }
    const a = pl.linkFrom; pl.linkFrom = null;
    if (a === d) return say('같은 장치에는 이을 수 없습니다.');
    if ((a.plot || null) !== (d.plot || null)) return say('다른 부지의 장치와는 이을 수 없습니다.');
    if (pl.linkKind === 'heat' && !DEV[d.id].needFire) return say(`${DEV[d.id].name}은(는) 열이 필요하지 않습니다.`);
    if (pl.linkKind === 'water' && d.id !== 'cooker') return say('배관은 밥솥으로 이어집니다.');
    const wa = devWorld(a), wd = devWorld(d), dist = Math.hypot(wa[0] - wd[0], wa[2] - wd[2]);
    if (dist > LINK_MAX) return say(`너무 멉니다. 연결선은 ${LINK_MAX} m 안에서만 닿습니다. (지금 ${fmt(dist, 1)} m)`);
    const i = S.links.findIndex(l => l.a === a.uid && l.b === d.uid && l.kind === pl.linkKind);
    if (i >= 0) { S.links.splice(i, 1); say(`${DEV[a.id].name} → ${DEV[d.id].name} 연결을 풀었습니다.`); Party.note('device', `연결 해제: ${pl.linkKind}`); }
    else { S.links.push({ a: a.uid, b: d.uid, kind: pl.linkKind, t: 0 }); say(`${DEV[a.id].name} → ${DEV[d.id].name} ${pl.linkKind === 'heat' ? '열선' : '배관'}을(를) 이었습니다.`); Party.note('device', `연결: ${pl.linkKind}`); }
    refresh();
  }
  // 배관: 증류기가 낸 증류수를 밥솥 탱크로 흘린다(Sim.act.pipe: 손으로 수거해 넣는 것과 같은 증류수·같은 기록). 게임 시간 10분마다, 증류기 출력 50 g 이상일 때(가정)
  pl.pipeStep = () => {
    const now = S.day * 1440 + S.min;
    for (const l of S.links) {
      if (l.kind !== 'water' || now - (l.t || 0) < PIPE_MIN) continue;
      const a = S.placed.find(x => x.uid === l.a), b = S.placed.find(x => x.uid === l.b);
      if (!a || !b || a.s.outW < PIPE_G) continue;
      l.t = now; Sim.act.pipe(S, a, b);
    }
  };

  // ---------- 우클릭(건설·철거·연결·도구)과 상호작용 ----------
  pl.useAction = () => {   // 우클릭: 연결·건설·철거 모드 > 선택한 도구
    if (UI.isModalOpen()) return;
    if (pl.linkKind) return Party.inParty() ? Party.guard(linkPick) : linkPick();
    if (pl.mode) return Party.inParty() ? Party.guard(placeAtLook) : placeAtLook();   // 팀이면 팀 쓰기 권한(임대)을 먼저 얻는다
    if (!pl.sel) return;
    if (TOOL[pl.sel] === 'salt') { if (Party.inParty()) Party.guard(() => { pl.useShaker(); flush(); }); else { pl.useShaker(); flush(); } return; }
    pl.useThermo(); flush();
  };
  pl.doInteract = async (t) => {
    t = t || env.aimed(); if (!t) return;
    if (['trade', 'reports', 'boards', 'signs', 'project'].includes(t.kind)) return HubUI.open(t.kind);   // 팀 간 교류 시설(11단계): 각 창이 필요할 때 팀 쓰기 권한을 얻는다
    if (Party.needsLease(t.kind) && !(await Party.ensureActive())) return say('동료가 조작 중이에요. 잠시 뒤에 다시 시도하세요.');   // 장치·늑대·바닷물·제단·항구는 팀 필드를 바꾼다
    pl.lastTarget = t; if (t.kind === 'dev') Sim.setDev(t.ref); interact(t);   // 지표 부지 장치의 패널은 그 행성의 환경으로 그린다
  };

  // ---------- 도구 고르기·건설 시작 ----------
  pl.usable = () => Object.entries(S.inv).filter(([k, v]) => v >= 1 && TOOL[k]).map(([k, v]) => ({ k, n: Math.floor(v) }));
  pl.selectItem = (k) => { pl.sel = pl.sel === k ? null : k; pl.mode = null; pl.linkKind = null; pl.linkFrom = null; say(pl.sel ? `${ITEM[pl.sel][1]}: ${A()} (Q 취소)` : '취소'); };
  pl.startBuild = (id) => { pl.mode = 'build:' + id; pl.sel = null; pl.linkKind = null; pl.linkFrom = null; document.getElementById('modal').hidden = true; say(`${DEV[id].name}을(를) 지을 곳을 ${A()}하세요. (Q 취소)`); };
  pl.startDemolish = () => { pl.mode = 'demolish'; pl.sel = null; document.getElementById('modal').hidden = true; say(`철거할 장치를 ${A()}하세요. (Q 취소)`); };
  // 화면 아래 안내 줄(HUD): 모드에 따른 문구. 가리키는 대상이 있으면 [E] 이름
  pl.hintText = (t, idle) => pl.mode && pl.mode.startsWith('build:') ? `${DEV[pl.mode.slice(6)].name} 짓기 — ${env.buildWhere || '탐사정 바닥이나 기지 부지를 보고 우클릭'}, Q 취소`
    : pl.linkKind ? `연결 모드(${pl.linkKind === 'heat' ? '열선' : '배관'}) — ${pl.linkFrom ? '도착' : '출발'} 장치를 ${B()}, L 다음, Q 취소`
    : pl.mode === 'demolish' ? `철거 — 장치를 ${B()}, Q 취소`
    : pl.sel ? `${ITEM[pl.sel][1]} — ${A()}, Q 취소`
    : t ? `[E] ${t.label}` : (pl.dig.on && pl.dig.need ? `캐는 중 ${Math.round(pl.dig.p / pl.dig.need * 100)} %` : idle);
  return pl;
}
