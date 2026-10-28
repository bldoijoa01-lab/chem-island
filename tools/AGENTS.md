<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-27 -->

# tools/

Node 점검·시험 스크립트(의존성 없음, 브라우저 시험은 Playwright 필요). 모두 저장소 루트에서 `node tools/<파일>`로 실행한다.

## 계산(브라우저 없음)
| 파일 | 역할 |
|---|---|
| `sim-check.js` | `sim.js` 시나리오 10개를 `sim-baseline.json`과 비교. **항상 통과해야 한다** |
| `sim-scenarios.js` | 시나리오 정의(브라우저와 Node가 같은 코드를 돌린다) |
| `sim-baseline.json` | 기준 로그. 규칙을 일부러 바꿀 때만 다시 만들고 전후 수치를 `DESIGN.md`에 쓴다 |
| `sim-rebase.js` | 문구만 바뀐 시나리오의 기준 로그 갱신. 숫자 필드가 다르면 거부 |
| `sim-compare.js` | 같은 장치를 행성(환경)마다 돌려 비교(`DESIGN.md` §4-8) |
| `move-check.js` | 점프만으로 섬 끝에서 끝까지, 구덩이 탈출이 되는지 |
| `migrate-check.js` | 옛 저장(ver 2, 폭 380·120)을 행성별 맵 형식으로 읽는 시험(16단계) |

## 브라우저(Playwright)
| 파일 | 대상 |
|---|---|
| `smoke.js` | 옆면 `index.html` 시작(코어 캡슐) → 이동 → 패드 3초 → 본부 → 턱 점프, 콘솔 에러 0 |
| `smoketut.js` | 옆면 튜토리얼 목표 1~11을 무한 지하에서 끝까지(도구 단계·건설·증류·보스·원정 행성) |
| `smokebase.js` | 내 월드: 같은 시드, 패드, 건설, 도구 단계, RLE 저장, 저장 상한, `/bases` 요약(`fakenet.js`) |
| `rules-check.js` | `database.rules.json` JSON 문법 + 규칙 식에 쓴 메서드·이름이 Firebase 규칙 언어에 있는 것뿐인지(실제 평가는 콘솔 시뮬레이터) |
| `smoketeam.js` | 옆면 팀·교류(17-b): 팀 만들기·가입 확인 창·월드 덩어리 공유·쓰기 임대·동시 쓰기 충돌·델타 크기와 빈도 측정·본부 시설·방문 미리보기·탈퇴(`fakenet.js`, 로컬 `http.server`, `QUICK=1`이면 20초 측정 구간 생략) |
| `smokeinvite.js` | 랜서버식 친구 초대(2026-10-28): 메인 화면 버튼 4개·새로 시작/이어하기, 방장 HUD [친구 초대] → 6자 코드·복사·팀 창 연결, 다른 브라우저의 [코드로 들어가기](닉네임+코드), 방장이 접속을 끊은 뒤에도 입장, 오류 문구·진행 보호(`fakenet.js`의 `anon`, 로컬 `http.server`) |
| `smokemerge.js` | 팀 대 팀 합치기(17-c): 제안·수락·거절·만료, 호스트 선정, 6명 상한, 확인 창, 환불·창고·기여 이전, 끊김 3곳 복구(장부), 입금 한 번, 리더보드 합산(`fakenet.js`, 로컬 `http.server`, 약 3분) |
| `ui-check.js` | 옆면 UI 점검(증류·밥솥·한제·캡슐·골렘·땅 파기·늑대 등) |
| `smokefp.js` | `fp/` (CDN이 막히면 `THREE_MODULE=`) |
| `smoketd.js` | `td/` |
| `smokeparty.js` · `smokeinter.js` · `smokemix.js` | 팀 / 팀 간 교류 / 탑다운 + 1인칭 혼합 접속. `fakenet.js`(가짜 Firebase, 규칙의 의미만 흉내)를 쓴다 |

## 규칙
- 변경 뒤 최소 `node tools/sim-check.js`와 `node tools/smoke.js`. `node --check`는 "주석이 뒤따르는 코드를 삼키는" 실수를 못 잡는다.
- `fakenet.js`는 실제 규칙이 아니다. 서버 규칙은 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(`MULTIPLAYER.md`).
- 기준 로그를 바꾸면 이유를 커밋 메시지와 `DESIGN.md`에 남긴다. 새 시험은 에러를 숨기지 말고 실패로 끝낸다.

<!-- MANUAL: Notes below this line are preserved when regenerating -->
