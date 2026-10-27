<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-27 -->

# fp/

**1인칭 3D 클라이언트**(THREE.js, 우주 테마). **동결**: 새 기능을 넣지 않는다(16~21단계 결정, 되살리는 태그 `fp-td-final`, 21단계에서 사용자 확인 뒤 삭제).

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 진입점. `window.CHEM_FP = true`를 먼저 켠 뒤 루트 모듈(`../chem.js` 등)을 읽고 `main.js`를 module로 로드. THREE는 importmap CDN(`three@0.160.0`) |
| `main.js` | 컨트롤러·경사 충돌·시선 대상·채집·공용 UI 연결. 지형·이동·팀은 `../shared/`를 쓴다. `Sim.geo.adjacent`를 격자 인접으로 바꿔 끼운다 |
| `terrain.js` | 높이장을 `STEP_NEAR`(활성 섬)·`STEP_FAR`(먼 섬) 격자로 샘플해 정점 색 메시를 만든다 |
| `models.js` | 외부 모델 없이 기본 도형을 합친 저폴리 모형(장치·나무·바위·탐사정) |
| `stylefp.css` | 1인칭 전용 스타일 |

## 규칙
- 저장 키 `chemisle_fp_v2`, 서버 `/saves3`·`/rafts3`(`window.CHEM_FP`가 정한다). `td/`와 같은 키·경로를 쓰므로 바꾸면 `td/`와 호환이 깨진다.
- 블록 채굴은 없다(7단계). 자원은 노드 채집. 지형은 변하지 않는다.
- 화학은 만들지 않는다(`chem.js`·`sim.js` 호출만). 성능이 모자라면 `terrain.js`의 `STEP_NEAR`, `main.js`의 바다 격자·`VIEW`를 줄이고 `DESIGN.md` §4-15에 기록한다.
- 시험: `node tools/smokefp.js`(CDN이 막히면 `THREE_MODULE=<경로>/three.module.js`, 저장소에 커밋하지 않는다), `smokeparty.js`, `smokeinter.js`, `smokemix.js`.

<!-- MANUAL: Notes below this line are preserved when regenerating -->
