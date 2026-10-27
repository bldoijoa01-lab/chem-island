<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-27 -->

# shared/

`fp/`(1인칭 3D)와 `td/`(탑다운 2D)가 **같이 import 하는** ES 모듈(13-a에서 `fp/`에서 옮김, 태그 `fp-before-shared`). 화면(THREE·캔버스)에 묶이지 않고, 옛 옆면 `index.html`은 쓰지 않는다. `fp/`·`td/`는 동결 상태(16~21단계 결정)이고 21단계에서 사용자 확인 뒤 지운다. 지울 때 여기서 쓰지 않는 조각도 같이 정리한다(옆면이 `party.js`·`hub.js`·`theme.js`·`presence.js`를 import 할 예정이므로 그 넷은 남는다).

## 파일
| 파일 | 역할 |
|---|---|
| `gen.js` | 시드 고정 높이장 `height(x, z)`, 섬 4개(`ISLANDS`, `OFFSET`), 부지 `PAD`, 자원 배치, `Island` 클래스. 화학과 무관 |
| `move.js` | 이동·충돌 물리 상수와 `stepBody`(경사 한계·점프·헤엄). `tools/move-check.js`가 검증 |
| `ctl.js` | 월드 질의 `makeCtx(S)`: 지면 높이, 장치 좌표(`PLOT_OFF`), 충돌, uid, `Sim.geo` 교체 고리 |
| `play.js` | 채집·건설·연결·도구·상호작용 규칙과 조작 상태 `makePlay`. 화면에 묶이는 것(대상 찾기, 건설 칸, 연기)은 `env`로 받는다 |
| `hud.js` | 가방·메뉴·시계·속도·팀 창 HUD(같은 DOM id를 두 클라이언트가 공유) |
| `presence.js` | 접속 위치 공유(허브에서만, 10 Hz). 패킷 `{x, y, z, yaw, air}` |
| `theme.js` | 우주 테마 문구 치환표(`GAME_TITLE` 포함). 규칙·수치·내부 id는 그대로 |
| `party.js` | 팀(파티): 공동 소유, 쓰기 임대(lease), `state.ver` +1 규칙, 공용 창고 |
| `hub.js` | 팀 간 교류: 간판, 교역소(에스크로), 공동 프로젝트, 보고서, 리더보드 |

## 규칙 (AI 에이전트용)
- **복사하지 말고 여기서 고친다.** `fp/main.js`·`td/main.js`에 같은 로직을 다시 만들지 않는다. 바꾸면 두 클라이언트가 같이 따라가야 한다.
- 이 폴더를 바꾼 뒤에는 `node tools/smokefp.js`, `smoketd.js`, `smokeparty.js`, `smokeinter.js`, `smokemix.js`, `move-check.js`, `sim-check.js`를 모두 통과시킨다. 동작이 바뀌는 이동(리팩터링)은 하지 않는다.
- 모든 크기·시드·한계는 "가정(임의값)" 주석과 `DESIGN.md` 표에 남긴다. 화학 식·상수는 `chem.js`에만 둔다.
- 서버 경로를 바꾸면 `database.rules.json`·`MULTIPLAYER.md`를 고치고 사용자에게 Firebase 콘솔 재게시를 알린다. 서버가 검증하지 못하는 것은 "약속에 기댄 표시"로 적는다.
- 게임 글에 이모지를 쓰지 않는다. 주석과 문서는 한국어.

<!-- MANUAL: Notes below this line are preserved when regenerating -->
