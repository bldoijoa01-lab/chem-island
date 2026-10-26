// 우주 테마(8단계): 표시 이름·문구만 바꾼다. 규칙·수치·내부 id(start/plaza/alpine/polar, 장치 id, 세이브 키)는 그대로다.
// 공용 sim.js·ui.js·notes.js·raid.js의 기본 문구(섬 테마)와 2D는 건드리지 않고, fp 페이지에서만 화면의 글자를 아래 치환표로 덮어쓴다.
// 치환은 DOM의 글자(말풍선·창·목표·이름표·툴팁)에만 일어나므로 저장된 기록(S.log)과 계산에는 영향이 없다.
export const GAME_TITLE = '화학 우주 이야기';   // 가칭: 최종 이름은 사용자가 정한다(후보: 화학 우주 이야기 / 분자 표류기 / 증류 항로)

// [원래 표현, 우주 표현]. 긴 표현이 먼저 오도록 아래에서 정렬한다. 이름 대응은 DESIGN.md 0절 "우주 개편" 표를 따른다
export const TERMS = [
  ['화학 섬 이야기', GAME_TITLE],
  ['시작섬', '불시착 행성'], ['광장섬', '허브 정거장'], ['고산 섬', '저기압 고원 행성'], ['극지 섬', '얼음 위성'], ['화산 섬', '후속 행성'], ['탐험섬', '탐사 행성'],
  ['광장', '허브'],
  ['솥 골렘', '대기 처리 코어'], ['골렘', '대기 처리 코어'],   // 허브 정거장의 코어라는 뜻은 앞의 장소 이름이 이미 말해 준다
  ['서리 늑대', '얼음 생물'],
  ['뗏목 파편', '탐사정 잔해'], ['뗏목', '탐사정'],
  ['항구 표지판', '궤도 이동 단말'], ['항구', '궤도 관문'],
  ['서항', '서쪽 관문'], ['동항', '동쪽 관문'], ['북항', '북쪽 관문'], ['남항', '남쪽 관문'],
  ['항해', '궤도 이동'], ['출항', '이륙'], ['정박', '도킹'],
  ['섬', '행성'],   // 위에서 처리하지 못한 일반 표현("섬마다", "섬 사이")
];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sorted = TERMS.slice().sort((a, b) => b[0].length - a[0].length);
const MAP = new Map(sorted);
const PART = { '이': 0, '가': 0, '을': 1, '를': 1, '은': 2, '는': 2, '과': 3, '와': 3, '으로': 4, '로': 4 };
const PAIRS = [['이', '가'], ['을', '를'], ['은', '는'], ['과', '와'], ['으로', '로']];
const RE = new RegExp('(' + sorted.map(t => esc(t[0])).join('|') + ')(?:(으로|이|가|을|를|은|는|과|와|로)(?![가-힣]))?', 'g');
const code = ch => ch.charCodeAt(0) - 0xAC00;
const hasBatchim = ch => { const c = code(ch); return c >= 0 && c < 11172 ? c % 28 !== 0 : false; };
const isRieul = ch => code(ch) % 28 === 8;
// 바뀐 말의 마지막 글자 받침에 맞게 조사를 고른다(이/가, 을/를, 은/는, 과/와, 으로/로)
function pickParticle(p, last) {
  const [withB, noB] = PAIRS[PART[p]];
  if (withB === '으로') return hasBatchim(last) && !isRieul(last) ? '으로' : '로';
  return hasBatchim(last) ? withB : noB;
}
export function themed(text) {
  if (!text || !/[섬뗏항골늑정광]/.test(text) && text.indexOf('화학') < 0) return text;
  return text.replace(RE, (m, term, p) => { const to = MAP.get(term); return p ? to + pickParticle(p, to[to.length - 1]) : to; });
}

// 화면의 글자(텍스트 노드·title·placeholder)를 치환한다. 바뀐 글은 치환 대상 말을 다시 포함하지 않으므로 무한히 되풀이되지 않는다
export function installTheme(root) {
  const fixNode = (n) => { if (n.nodeType === 3) { const t = themed(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; } else if (n.nodeType === 1) { const tag = n.tagName; if (tag === 'SCRIPT' || tag === 'STYLE') return; for (const a of ['title', 'placeholder']) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = themed(v); if (t !== v) n.setAttribute(a, t); } n.childNodes.forEach(fixNode); } };
  fixNode(root);
  new MutationObserver(list => { for (const r of list) { if (r.type === 'characterData') fixNode(r.target); else if (r.type === 'attributes') fixNode(r.target); else r.addedNodes.forEach(fixNode); } })
    .observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
  document.title = themed(document.title);
}

// 행성별 하늘·바다 표현(보이기만, fp/와 td/ 공용): atm = 대기 두께(0이면 진공), 바다 색·불투명도·파도 크기 배율, 하늘 색조. 모두 가정(임의값)
export const PLANET = {
  start: { atm: 1, sea: 0x2f86c8, seaOp: 0.8, wave: 1, tint: 0 },         // 불시착 행성: 바다가 있는 지구형
  plaza: { atm: 0, sea: 0x070b1c, seaOp: 0.96, wave: 0, tint: 0 },        // 허브 정거장: 진공, 발밑 너머는 어두운 공간
  alpine: { atm: 0.6, sea: 0x6b5a9c, seaOp: 0.88, wave: 0.5, tint: 0x7a5fb0 },   // 저기압 고원 행성: 옅은 보랏빛 대기
  polar: { atm: 0.45, sea: 0xa8dcec, seaOp: 0.97, wave: 0.15, tint: 0x9fd0e8 },  // 얼음 위성: 얼어붙은 바다
};

// 시작 이야기(첫 실행에 한 번). 문구는 이 파일의 치환표가 이름을 맞춘다
export const STORY_HTML = `
    <div class="box"><h4>연구선 신호 두절</h4>
      <div>항성 사이를 도약하던 연구선이 사고로 부서졌다. 살아남은 것은 탐사정 한 척과 실험 장비 몇 개뿐이다.</div>
      <div>탐사정은 푸른 바다가 있는 낯선 행성의 해안에 불시착했다. 잔해를 고치면 궤도 이동으로 다른 행성과 허브 정거장에 갈 수 있다.</div>
      <div>이곳 대기와 바닷물로 살아남아야 한다. 먼저 바닷물을 증류해 마실 물과 소금을 얻자.</div></div>`;
