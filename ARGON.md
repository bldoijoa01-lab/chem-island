# Gemini 4 Argon 보조 가이드 (검증·분석용)

Argon은 **읽고 제안만 하는 검증 보조**다(비용 때문에 Flash 모델을 써도 된다. 아래 요청은 모델과 무관하게 쓴다. 토큰을 아끼려면 저장소 전체 대신 `chem.js`·`DESIGN.md`·`notes.js` 같은 필요한 파일만 붙인다). 저장소를 직접 고치지 않는다(같은 파일을 두 AI가 동시에 고치면 같은 기능이 두 번 만들어진다). 구현은 이 저장소의 개발 세션이 하고, 사용자가 Argon의 결과를 **직접 확인한 뒤** 개발 세션에 반영을 요청한다.
화학 설명은 AI가 틀릴 수 있다. 반드시 교과서·수업 자료와 대조하고, 수행평가 규칙 7(화학 원리와 수정 이유를 학생이 설명할 수 있어야 함)에 맞게 **본인 말로 설명할 수 있는 것만** 반영한다.

## 사용법
1. 아래 요청 중 하나를 복사한다. 필요한 파일(`chem.js`, `game.js`, `DESIGN.md`, `notes.js` 등, 컨텍스트가 크므로 저장소 전체도 가능)을 같이 붙인다.
2. Argon의 답을 읽고, 의심되는 부분을 교과서·수업 자료로 확인한다.
3. 맞는 것만 개발 세션에 "ARGON 결과 반영: …"으로 전달한다.
4. 맨 아래 **결과 기록**에 한 줄 남긴다. 이 기록은 개발 기록·AI 활용 근거로 쓴다.

## 상시 요청 (고정)
**A. 화학 교차 검증**
> 이 저장소는 고등학교 화학 수업(기체의 성질, 액체와 고체, 용액의 끓는점·어는점) 개념을 계산하는 게임이다. `chem.js`의 식·상수·단위, `DESIGN.md`의 표와 검증 사례, `notes.js`의 `LINKS`가 화학적으로 맞는지 점검해 줘. 틀렸거나 근사·가정이 빠진 곳을 파일·줄과 함께 목록으로 주고, 각 항목에 (1) 무엇이 문제인지 (2) 맞는 서술 (3) 확신 정도(높음/중간/낮음)를 적어 줘. 모르면 모른다고 써 줘. **`ITEMS.md`(수업 아이템 #1~#40)에 없는 개념(클라우지우스–클라페이롱, 선형 근사 유도, 용해도·공융 평형, 열수지, 비이상 용액 등)은 지적하지 말고, 필요하면 "범위 밖"이라고만 표시해 줘. `ITEMS.md`도 같이 붙여서 보낸다.**

**B. 경계값 검증 케이스**
> `chem.js`의 각 함수(`tb`, `pSol`, `coolTemp`, `moles`, `partial`, `packMix`, `iceMeltBySalt` 등)에 대해 경계에서 결과가 어떻게 나와야 하는지(폭발 한계 3 atm, NaCl 포화 6.1 mol/kg, 공융점 −21.1 ℃, x_w→1 등) 입력과 기대값을 계산 과정과 함께 표로 줘. 코드는 고치지 마.

**C. 변경 전후 diff 리뷰** (큰 리팩터링 뒤)
> 아래 diff는 동작을 바꾸지 않는 리팩터링이어야 한다. 전후로 결과가 달라질 수 있는 곳, 빠진 상태 필드, 저장 호환(`merge()`)이 깨질 곳을 찾아 줘. 확실한 것과 의심되는 것을 나눠서 알려 줘.

**D. 시험 플레이 영상 분석** (사용자가 화면 녹화를 올릴 때)
> 이 영상은 게임 시험 플레이다. 막히거나 이상한 동작, 화면에 보이는 수치가 이상한 순간을 시각 순서대로 후보로 뽑아 줘(시각, 무슨 일, 의심 원인). 원인을 단정하지 말고 후보로만 줘. 이 후보는 내가 직접 다시 확인한 뒤 개발 기록에 내 말로 쓴다.

## 단계별 요청 (개발 세션이 단계를 끝낼 때 여기에 추가한다)
형식:
```
### [날짜] [단계 이름]
- 맡길 일: (한 줄)
- 같이 붙일 파일: (경로)
- 질문: (Argon에게 그대로 복사해 쓸 문장)
- 사람이 확인할 방법: (교과서 단원, 직접 플레이로 재현 등)
```

### [2026-10-26] 1단계: 계산과 그리기 분리 (sim.js)
- 맡길 일: 동작을 바꾸지 않아야 하는 리팩터링의 diff 리뷰와 경계 시나리오 제안
- 같이 붙일 파일: `sim.js`, `game.js`, `tools/sim-scenarios.js`, `tools/sim-baseline.json`, 분리 전 커밋 `0725829`의 `game.js`
- 질문: 위의 "C. 변경 전후 diff 리뷰"를 쓰되, `0725829`의 `game.js`와 현재 `sim.js`+`game.js`를 비교해서 (1) 분리 때 빠진 상태 필드나 계산, (2) `Sim.drain()` 이벤트 순서가 바뀌어 화면 말풍선·폭발 연기가 달라질 곳, (3) `tools/sim-scenarios.js`에 더해야 할 경계 시나리오(밥솥 3 atm 경계, 증류 포화, 늑대 질량 0 근처)를 알려 줘.
- 사람이 확인할 방법: `node tools/sim-check.js`로 시나리오 5개 통과 확인, 직접 플레이해 증류·밥솥·한제·늑대가 전과 같은지 확인

### [2026-10-26] 2단계: 뗏목(장치 위치 전환, 세이브 이전, 서버 규칙)
- 맡길 일: 세이브 이전 로직 리뷰와 Firebase 보안 규칙 검토
- 같이 붙일 파일: `sim.js`(`RAFT`, `migrateRaft`, `devX`), `database.rules.json`(`rafts`), `MULTIPLAYER.md`, `DESIGN.md` §4-6
- 질문: 옛 세이브(장치에 `u` 없음, 땅 위 좌표)를 뗏목으로 옮기는 `migrateRaft`가 장치 인접 관계(화덕 열 전달 |dx|≤3, |dy|≤1)를 바꿔 결과가 달라질 수 있는 입력을 찾아 줘. 그리고 `database.rules.json`의 `rafts` 규칙으로 (1) 남의 뗏목을 쓸 수 있는지, (2) 범위를 벗어난 값(cells 99, u 음수)이 들어가는지, (3) 규칙이 막지 못하는 부정(칸 수 부풀리기)이 무엇인지 알려 줘.
- 사람이 확인할 방법: Firebase 콘솔 규칙 시뮬레이터로 다른 uid로 쓰기 시도, 옛 세이브 JSON을 `localStorage`에 넣고 불러오기

### [2026-10-26] 3단계: 시작섬·광장섬·항해·튜토리얼
- 맡길 일: 튜토리얼 안전장치(밥솥 압력 제한)의 화학적 서술 검토, Firebase 규칙(`/bottles`, `/rafts`) 보안 검토
- 같이 붙일 파일: `sim.js`(`stepCooker`, `tutorial`, `migrateWorld`), `database.rules.json`, `net.js`, `game.js`의 `uiBoard`·`drawPlazaRafts`, `DESIGN.md` §4-7, `tools/sim-scenarios.js`(F)
- 질문: (1) 튜토리얼에서 압력이 3 atm에서 멈출 때 표시되는 끓는점(`C.tb(3, x_w)`)과 조리 속도 2^((T−100)/10)가 화학적으로 일관되는지, (2) `/bottles` 규칙으로 남의 글을 고치거나 지울 수 있는지, 도배·스크립트 삽입이 가능한지, (3) `migrateWorld`가 옛 `S.dug` 타일 번호를 새 폭(380)으로 바꾸는 식(y·380+x)이 맞는지 경계(맨 오른쪽 열 x=119)에서 확인해 줘.
- 사람이 확인할 방법: Firebase 콘솔 규칙 시뮬레이터, 옛 세이브 JSON을 `localStorage`에 넣고 땅을 판 자리가 그대로인지 확인

### [2026-10-26] 4단계: 탐험섬(고산·극지) 환경과 협동 보스
- 맡길 일: 압력 일반화 식의 화학 검증, 협동 보스 서버 규칙 검토
- 같이 붙일 파일: `sim.js`(`ENV`, `stepStill`, `cookerState`, `stepCooker`), `chem.js`, `DESIGN.md` §4-8·§4-9, `tools/sim-compare.js` 출력, `database.rules.json`(`raid`), `raid.js`(협동), `net.js`
- 질문: (1) 외기 압력 P를 매개변수로 한 증류(증발 속도 ∝ 증기압 − P), 밥솥(상한 = P + 밸브 − 1, 폭발 한계 = P + 2), 포집기(n = PV/RT)의 일반화가 화학적으로 타당한지, 고산 섬 0.65 atm에서 물의 끓는점 88.1 ℃가 `Chem.tb`로 맞는지(수업의 클라우지우스–클라페이롱 식 기준), (2) `/raid/golem` 규칙으로 참가자가 아닌 사람이 탱크를 바꿀 수 있는지, 한 사람이 두 역할을 동시에 할 수 있는지, (3) 환경 비교 표의 [5]에서 극지 섬 소금 뿌리개가 듣는 기온 구간(−21.1 ℃~0 ℃)이 맞는지 확인해 줘.
- 사람이 확인할 방법: 교과서의 압력–끓는점 그래프와 대조, Firebase 규칙 시뮬레이터, 실제 두 사람이 동시에 접속해 협동 한 번 해 보기

### [2026-10-26] 수업 범위 정리 (증기압력 곡선 표, 공융점·포화 제거)
- 맡길 일: 증기압력 곡선 표 값의 정확성 검증과 `DESIGN.md` §4-12 분류 점검
- 같이 붙일 파일: `ITEMS.md`, `chem.js`(`PSAT`, `pStar`, `tb`), `sim.js`(`STILL`, `COOLER`, `cookerState`), `DESIGN.md` §4-11·§4-12
- 질문: (1) `chem.js`의 `PSAT` 표(0~150 ℃, 5 ℃ 간격, kPa를 atm으로 환산)가 물의 포화 증기압 표와 맞는지, 100 ℃ 값을 101.325 kPa로 맞춘 것이 수업 관례와 어긋나지 않는지, (2) 5 ℃ 간격 직선 보간이 만드는 오차(예: 102.5 ℃)가 게임 수치에 영향이 있는지, (3) `DESIGN.md` §4-12의 분류(A 아이템 / B 정량화 / C 게임 설정 / D 범위 밖?)에서 **ITEMS.md에 없는 개념을 쓴 항목**이 더 있는지 — 모르면 "범위 밖?"으로만 표시해 줘.
- 사람이 확인할 방법: 교과서의 물의 증기압력 곡선 표와 `PSAT` 대조, 4-12의 "범위 밖?" 항목을 수업 자료로 판단

(이 아래에 단계가 끝날 때마다 추가)

## 결과 반영 위치 (제안을 어디에 고치는가)
사용자가 확인한 뒤 개발 세션에 "ARGON 결과 반영: …"으로 전달하면, 종류별로 아래에 반영한다.

| 찾은 것 | 반영 위치 | 비고 |
|---|---|---|
| 화학 식·상수·단위 오류 | `chem.js`를 고치고, `DESIGN.md`의 표·검증 사례와 `notes.js`의 `LINKS`를 같이 고친다 | 커밋 메시지에 어느 개념·식 때문인지 한 줄 근거와 전후 수치 |
| 화면의 성립 조건·가정 문구 누락 | 해당 장치 패널(`game.js`)·`notes.js` | 지우지 말고 보강한다 |
| 경계값 케이스 | `DESIGN.md` 4절 "검증 사례"에 추가하고 헤드리스로 실제 값을 확인한다 | 기대값과 실제 값이 다르면 그 차이를 먼저 분석한다 |
| 아이템 보관함(시트)의 틀린 서술 | **시트**(사용자가 직접). 지우지 말고 상태를 '수정 필요'로 두고 수정 이유를 적는다(보관함 규칙 4). `DESIGN.md` 5절에도 한 줄 | 개발 세션은 시트를 고치지 않는다 |
| 시험 플레이 영상의 문제 후보 | 사용자가 직접 재현해 확인 → 시트 `04_게임개발기록`에 **본인 말로**(문제 → 원인 → 수정 → 화학적 근거 → 전후 비교). 코드 수정이 필요하면 개발 세션에 요청 | AI 문장을 그대로 붙이지 않는다 |
| 리팩터링 diff의 동작 변화 | 개발 세션이 해당 커밋을 고치고, 같은 입력으로 전후 값을 다시 비교 | |
| 결과 자체 | 이 파일 맨 아래 "결과 기록" 표에 한 줄 | 어느 모델(Argon/Flash)이었는지도 적는다 |

반영하지 않기로 한 제안도 "결과 기록"에 이유와 함께 남긴다(교과서와 대조한 결과 틀렸을 때 등).

## 결과 기록 (사용자가 채운다)
| 날짜 | 모델 | 요청 | 결과 요약 | 사람이 확인했나 | 반영했나(커밋 또는 안 한 이유) |
|---|---|---|---|---|---|
| 2026-10-26 | Flash | A·B 화학 교차 검증, 1단계(sim.js 분리) diff 리뷰 | `DESIGN.md` 조건 보완(4.02/2.60 atm, 600/579 g, 0 ℃ 온도차, 저장 키), 찬 밥솥 내부 압력 0.037 atm·조리 진행, 경계 시나리오 3종 제안. 개발 세션이 `chem.js`·`sim.js`를 다시 돌려 B표 수치와 시나리오 기대값이 일치함을 확인. 교과서 범위 밖 설명(선형 근사·포화·공융·열수지·비이상성)은 반영하지 않기로 함 | 수치는 확인됨, 화학 설명은 교과서 대조 예정 | 반영 완료: 찬 밥솥·`merge` 복구·시나리오 G~J·`tools/smoke.js` = `ec4914f`, 문서 조건(DESIGN) 보완 = `ec4914f`. (수업 범위 밖 설명은 반영하지 않음) |
| 2026-10-27 | Flash | 칸 시뮬 설계의 과학적 정확성(추가 개념 A·B·C) + 16단계 세이브 이전 | (A) 밀도층을 '짧은 시간의 고임'으로 쓴 서술은 적절. 그레이엄 성립 조건 보강, 열량 Q(J)를 잘라 옮겨야 에너지가 보존됨, 기체 이동 때 열도 함께 이동, 시험 ⑦~⑩ 제안. (B) 채팅의 저장소 첨부가 오래된 커밋(04d547c)에 고정되어 실제 `sim.js`·`tools/migrate-check.js`를 보지 못했고, 옛 맵 가로를 120으로 가정(실제 옛 `WW` = 380, 키 = y·380 + x)해 예시 키·범위(6720)가 틀림 | 사용자가 전달(2026-10-27) | (A) `DESIGN.md` 0절 칸 시뮬 표에 반영. (B) 구체 반례는 틀린 전제라 반영 안 함. 일반 점검 항목(빈·부분 저장, 두 번 이전, 비정상 키, 바다였던 칸)만 개발 세션이 시험에 있는지 확인 |
| 2026-10-28 | (Argon/Flash, 모델 미확인) | 17-a′ 검증(덩어리 결정성, 저장 RLE 왕복, `sim.js` 고리, `/bases` 규칙) | 파일을 실제로 읽지 않고 **새로 지어낸 코드**를 "핵심 내용"으로 제시함: `export` 모듈 문법의 `getChunkSeed`·`compressChunk`(바이트 배열 RLE, 255 제한)·`ChunkSimulator`, `db.ref().transaction` 기반 `installBase`, `owner·cx·cy·w·h·created` 필드의 `/bases` 규칙. 실제 저장소와 다름: `world.js`는 `hash3` 시드 + `v*n` 문자열 RLE(`rleEncode`·`rleDecode`)이고, `/bases/{id}`는 `name·color·members·tech·summary·t`(+`devices`·`map`) 요약이며, 5분 취소·`cx/cy/w/h`는 17-a′에서 폐지됨. 결정성·왕복 "검증 결과"는 없고 명세 되풀이뿐 | 사용자가 전달(2026-10-28). 개발 세션 확인 안 함(코드가 실제 저장소 것이 아님을 `world.js`·`database.rules.json`과 대조해 확인) | 반영 안 함: 실제 파일을 보지 않은 가짜 코드·폐지된 설계를 근거로 했기 때문. 다시 요청할 때는 파일을 채팅에 **직접 첨부**하고(저장소 연결 말고) "추측하지 말고 첨부 파일의 실제 줄만 인용"하게 한다 |

### [2026-10-26] 5-a단계: 공용 UI 분리 (store.js · world.js · ui.js)
- 맡길 일: 동작을 바꾸지 않아야 하는 분리(`game.js` → `store.js`/`world.js`/`ui.js`)의 diff 리뷰
- 같이 붙일 파일: `store.js`, `world.js`, `ui.js`, `game.js`, 분리 전 커밋 `4a54346^`의 `game.js`, `tools/ui-check.js`
- 질문: 위의 "C. 변경 전후 diff 리뷰"를 쓰되, 분리 전 `game.js`와 현재 `store.js`+`world.js`+`ui.js`+`game.js`를 비교해서 (1) 분리 때 빠진 상태 필드나 계산, (2) `UI.init(host)` 훅(`puff`, `burst`, `startBuild` 등)이 호출되지 않는 경로, (3) `Store.set`이 객체 내용을 바꿔치기할 때 `game.js`가 옛 참조를 잡고 있을 곳을 알려 줘.
- 사람이 확인할 방법: `node tools/sim-check.js`(전부 통과), `node tools/ui-check.js`(20/20), 2D를 직접 플레이해 모달·건설·땅 파기가 전과 같은지 확인

### [2026-10-26] 5단계: 3D 시험판 (3d/ — 14-a에서 삭제됨, 태그 island-3d-diorama-final)
- 맡길 일: 3D 시험판이 2D와 같은 상태·규칙을 쓰는지(동등성) 리뷰, 두께 z가 규칙에 새어 들어가지 않았는지 점검
- 같이 붙일 파일: `3d/main.js`, `world.js`(`stepPlayer`), `game.js`, `ui.js`, `store.js`, `tools/smoke3d.js`, `DESIGN.md` §4-13
- 질문: (1) `3d/main.js`에서 `S`를 **쓰는**(대입·`Sim.act.*` 호출 아닌 직접 변경) 코드가 있는지, 있다면 2D(`game.js`)에는 없는 변경인지, (2) 마우스 클릭을 칸으로 바꾸는 방식(지형 앞면 평면 z=5 교점)이 카메라가 비스듬해서 2D의 "커서 아래 칸"과 다르게 집히는 경계(절벽 가장자리·물 위)를 알려 줘, (3) `World.stepPlayer`로 옮긴 이동이 옛 `physics`와 달라진 입력 조합(점프+벽, 물속 점프)이 있는지 diff로 확인해 줘.
- 사람이 확인할 방법: 2D·3D에서 같은 세이브로 목표 1~3을 해 보고 상태(일차·가방·장치)가 같은지, `node tools/smoke3d.js`(CDN이 막히면 `THREE_MODULE=` 지정), 직접 플레이하며 땅 파기·건설이 마우스 위치와 맞는지

### [2026-10-26] 6단계: 1인칭 3D (fp/) — sim.js 교체 고리와 서버 규칙
- 맡길 일: (1) `sim.js` 교체 고리(`Sim.geo.adjacent`, `S.fp`일 때 `syncRaft`·`migrateRaft` 건너뛰기, `act.place`) diff 리뷰, (2) `database.rules.json`의 새 경로 보안 검토
- 같이 붙일 파일: `sim.js`(변경 전 커밋 `5c91368`과 현재), `fp/main.js`, `fp/gen.js`, `store.js`, `net.js`, `database.rules.json`, `MULTIPLAYER.md` 11절, `tools/sim-check.js`
- 질문: (1) `5c91368`의 `sim.js`와 현재를 비교해서 **2D 계산이 달라질 수 있는 경로**(특히 `act.build`가 `act.place`를 거치며 장치 객체의 필드 순서·`u` 유무가 바뀐 곳, `adjacentTo`가 `geo.adjacent`로 바뀐 곳)가 있는지, (2) 1인칭 장치의 `x, y`(격자 칸)가 `sim.js`의 서리 늑대 위치 비교(`m.dx === d.x && m.dy === d.y`)·`fireNear`와 충돌하는 입력이 있는지, (3) `/saves3`·`/rafts3`·`presence/fp-plaza`의 새 필드(`fp`, `z`, `yaw`)로 남의 데이터를 읽거나 고치는 길이 있는지, 범위를 벗어난 값이 들어가는지, `fp.mods`(파낸 복셀 키)로 데이터 크기를 부풀리는 부정이 가능한지 알려 줘.
- 사람이 확인할 방법: `node tools/sim-check.js`(10개 기준값 그대로), Firebase 콘솔 규칙 시뮬레이터로 다른 uid로 `/saves3/{남의 uid}` 쓰기 시도, 2D와 1인칭 세이브를 각각 만들어 서로 안 섞이는지(`chemisle_side_v1` / `chemisle_fp_v1`)

### [2026-10-26] 6단계: 1인칭 이동·충돌과 지형(동등성)
- 맡길 일: 자동 오르기 없는 이동 규칙(바닥 딛고 물속 점프, 수면 점프)이 2D·1인칭에서 같은 의미인지, 지형에서 점프로 못 가는 곳이 있는지 점검
- 같이 붙일 파일: `world.js`(`stepPlayer`, `SURF_JUMP`), `fp/main.js`(`stepPlayer`, `hitsBody`), `fp/gen.js`, `tools/move-check.js`, `tools/smokefp.js`, `DESIGN.md` §4-14·§4-15
- 질문: (1) 2D `stepPlayer`와 1인칭 `stepPlayer`가 같은 상수·순서로 같은 결과를 내는지(점프+벽, 물속, 수면, 낙하 상한), (2) `fp/gen.js`가 만든 지형에서 부두~뗏목~섬 안쪽 사이에 점프로 못 넘는 3칸 이상 턱이나 갇히는 구덩이가 생기는 좌표가 있는지(시드 11·23·37·51) 알려 줘.
- 사람이 확인할 방법: `node tools/move-check.js`, `node tools/smokefp.js`(섬 통과 4개), 직접 걸어 다니며 막히는 곳이 없는지

### [2026-10-26] 7단계: 경사 한계·충돌 diff 리뷰 (fp 부드러운 지형)
- 맡길 일: 높이 지형의 경사 한계·충돌 규칙에 허점(끼임·통과·무한 점프)이 있는지 리뷰
- 같이 붙일 파일: `fp/main.js`(`groundAt`, `tryMove`, `stepPlayer`, `blocked`), `fp/gen.js`(`height`, 기울기 상한), `tools/smokefp.js`(경사·턱·섬 통과), 구 복셀 버전 `fp-voxel-v1` 태그의 `fp/main.js`
- 질문: (1) `tryMove`가 `SLOPE_TAN`(40°)과 `SNAP_DOWN`(0.5 m)으로 걷는 높이 변화를 제한하는데, 프레임 간격(dt)이 바뀌면 같은 비탈이 오를 수 있었다가 못 오르게 되는 경계가 있는지(예: 한 걸음 거리 d가 매우 작을 때 `1e-4` 허용 오차), (2) 뗏목 칸 경계(수면과 같은 높이 평면)에서 물 쪽에서 오를 때 수면 점프(16.5 m/s)만으로 되는지와 틈에 끼이는 경우, (3) 자원 원기둥(높이 2.2 m)·장치 상자 충돌 때문에 부두 길(z 29~43)이 막히거나 갇히는 배치가 시드 4개에서 생기는지 알려 줘.
- 사람이 확인할 방법: `node tools/smokefp.js`의 경사 30°·35°·45°·턱 점검과 섬 통과 4개, 직접 걸어서 뗏목에 오르내리기

### [2026-10-26] 7단계: fp에서 바뀐 목표 문구와 채집 규칙 확인
- 맡길 일: 땅 파기를 없애면서 바뀐 보이는 문구(목표 11·곡괭이·온도계 설명)와 자원 채집 대체가 수업 개념을 해치지 않는지 확인
- 같이 붙일 파일: `fp/main.js`(상단 `NODE`·`Sim.QUESTS[10]`·`Sim.RECIPES` 수정부, `useShaker`), `DESIGN.md` §4-15-7, `ITEMS.md`
- 질문: (1) 목표 11 "얼음 타일 1칸" → "얼음 덩어리 1개"로 바꿔도 #21(융해)·#37·#39(어는점 내림) 개념 설명이 그대로인지, (2) 소금 뿌리개가 얼음 덩어리(100 g)·얼음 결정에 쓰이는 규칙(`iceMeltBySalt`, `saltForIce`, `S.melt`)이 2D의 얼음 타일과 같은 식·같은 상수인지 diff로 확인해 줘, (3) 지하 온도(12 ℃)를 fp에서 잴 수 없게 된 것이 "게임 설정(가정)" 표시나 연구 노트 문구와 어긋나는지.
- 사람이 확인할 방법: 1인칭에서 극지 섬 얼음 덩어리에 소금 뿌리개를 써서 `기록`의 "소금 뿌림" 줄(기온·m_eq·소금·융해 g)을 2D의 같은 줄과 비교

### [2026-10-26] 8단계: 우주 테마 문구 치환 diff (fp/theme.js)
- 맡길 일: 문구 치환이 규칙·수치 설명을 틀리게 만든 곳이 없는지, 조사 교정이 어색한 곳이 없는지 점검
- 같이 붙일 파일: `fp/theme.js`(`TERMS`, `themed`), `fp/main.js`(`fpHelp`, `maybeStory`), `ui.js`·`sim.js`·`notes.js`·`raid.js`의 화면 문구, `tools/smokefp.js`(테마 점검 3개)
- 질문: (1) `TERMS`로 바뀐 말이 화학 설명 문장(예: "섬 → 행성"으로 일반 치환된 곳, "광장 → 허브")에서 뜻을 해치는지, (2) 조사 교정(`pickParticle`)이 틀리는 입력(받침 없는 말 뒤 "으로", 괄호 조사 "을(를)")이 있는지, (3) 규칙 문구(성립 조건·가정)가 치환 때문에 사라지거나 바뀐 곳이 있는지 알려 줘.
- 사람이 확인할 방법: `fp/index.html`에서 연구 노트·기록·장치 패널을 열어 성립 조건 문구가 그대로인지, 궤도 이동 단말 창 문구

### [2026-10-26] 9단계: 팀 서버 규칙과 공유 상태 충돌
- 맡길 일: 새 서버 규칙(`/parties`, `/partyCodes`)의 보안 검토와 "쓰기 임대 + `ver` 검사" 설계의 충돌 시나리오 찾기
- 같이 붙일 파일: `database.rules.json`(parties·partyCodes), `net.js`(party* 함수), `fp/party.js`, `fp/main.js`(`doInteract`, `useAction`, 팀 창), `DESIGN.md` §4-17, `MULTIPLAYER.md`, `tools/smokeparty.js`
- 질문: (1) 규칙으로 남의 팀에 들어가거나(코드 추측, 5번째 가입), 남의 `lease`·`state`를 가로채거나, `ver`를 건너뛰어 쓰는 길이 있는지, (2) 임대 구조에서 두 사람이 동시에 장치를 바꾸거나 시계를 흘려 상태가 어긋나는 시나리오(임대 만료 직전 쓰기, 두 passive 동시 획득, 클라이언트 시계 차이)와 그때 어떤 값이 사라지는지, (3) 팀 기록·기여 표를 부풀리는 방법이 규칙으로 막히는지 알려 줘.
- 사람이 확인할 방법: Firebase 콘솔 규칙 시뮬레이터(다른 uid로 `state` 쓰기, `ver` 건너뛰기, 5번째 가입), 브라우저 두 개로 같은 팀에 들어가 동시에 장치 조작해 보기, `node tools/smokeparty.js`

### [2026-10-26] 10단계: 환경·열원 교체 고리와 연결선 diff 리뷰
- 맡길 일: `sim.js`에 넣은 교체 고리(`geo.island`, `geo.heatSources`, `curDev`, `act.pipe`, `act.cook`의 탱크)가 2D 계산을 바꾸지 않는지, 연결선이 화학 결과를 왜곡하지 않는지 리뷰
- 같이 붙일 파일: `sim.js`(직전 커밋 `f53067e`와 현재), `fp/main.js`(연결선·부지·`pipeStep`), `fp/gen.js`(`PAD`), `tools/smokefp.js`(10단계 점검), `DESIGN.md` §4-18
- 질문: (1) `envOf`가 `curDev`에 따라 바뀌는 경로에서, `stepDevices` 밖(예: 서리 늑대·`act.collect`·`act.cap`)이 의도치 않게 장치 환경을 쓰거나 `curDev`가 남아 있는 곳이 있는지, (2) `act.pipe`가 `act.collect`와 같은 증류수 질량·`f.dW`·`alpineW` 집계를 하는지(손으로 수거해 넣는 것과 합이 같은지), 소금 질량 보존, (3) 열선으로 연결된 화덕이 `heatOf`의 "최고 온도" 규칙을 바꾸지 않는지, 한 장치에 화덕 여러 개가 연결될 때 값, (4) 지표 부지 장치가 다른 행성에 있을 때 서리 늑대(탐사정 행성의 기온)와 어긋나는 서술이 있는지 알려 줘.
- 사람이 확인할 방법: `node tools/sim-check.js` 10개 기준값 그대로, 불시착 행성 부지에서 증류기를 돌리고 고원 행성으로 이동한 뒤 기록의 끓는점(1 atm)을 확인, 같은 장치를 고원 행성 부지에 지어 끓는점(약 88 ℃)을 비교

### [2026-10-26] 11단계: 팀 간 교류의 서버 규칙·에스크로·점수 조작 길
- 맡길 일: 교역소(에스크로), 공동 프로젝트, 보고서 표시, 리더보드(줄지 않음·상한)의 서버 규칙과 클라이언트 흐름에서 부정·충돌 시나리오 찾기, 예측 정확도 점수식 검증
- 같이 붙일 파일: `database.rules.json`(partyPub·trades·world/project·reports·boards), `net.js`(pubSet~boardLoad), `fp/hub.js`, `tools/fakenet.js`, `tools/smokeinter.js`, `DESIGN.md` §4-19, `MULTIPLAYER.md`
- 질문: (1) 에스크로 흐름(올림 → 수락 → 찾아감)에서 두 팀이 동시에 수락하거나, 수락 직후 올린 팀이 취소해 물품이 복제·소실되는 순서가 있는지, (2) 규칙의 상태 전이(open → taken/cancelled, taken → done)를 우회하는 쓰기, (3) 리더보드 점수를 규칙 안에서 부풀리는 길(상한만큼 반복 게시)과 완화책, (4) 예측 점수 `max(0, 10 - 5 x |오차|)`가 `Chem.tb(P, x_w)`(라울의 법칙, 증기압력 곡선, #36 #40 범위)와 같은 조건에서 계산되는지
- 사람이 확인할 방법: Firebase 콘솔 규칙 시뮬레이터(다른 팀 uid로 `trades/{id}` 상태 변경, `boards/*/{pid}` 점수 감소·상한 초과, `reports/*/votes`에 남의 칸 쓰기), 브라우저 두 개를 서로 다른 팀으로 만들어 교역·프로젝트 기여 후 새로고침해 일치하는지 확인

### [2026-10-27] 13-a: shared/ 이동 diff와 이동 물리 추출 리뷰
- 맡길 일: `fp/main.js`에서 `shared/move.js`로 뺀 이동·충돌 물리가 동작을 바꾸지 않았는지 줄 단위로 대조
- 같이 붙일 파일: `git diff fp-before-shared -- fp/main.js shared/move.js`, `tools/move-check.js`, `tools/smokefp.js`(경사·턱·점프 점검)
- 질문: (1) `stepBody`가 원래 `stepPlayer`와 계산 순서(입력 정규화 → 점프 → 중력 → x축 이동 → z축 이동 → 경계 → 바닥 처리)가 같은지, (2) `blockedByObjs`의 `skip`(녹은 얼음) 조건이 원래 `blocked`와 같은지, (3) 경계에서 `onEdge`가 한 틱에 한 번만 불리는지
- 사람이 확인할 방법: `fp/`에서 경사 30°·35° 오르기, 45° 못 오름, 1.5 m 턱은 점프로만, 물에서 헤엄·수면 점프로 뗏목 오르기가 이전과 같은지

### [2026-10-27] 13단계: shared/ 추출 전체 diff와 td/ 입력·대상 판정 리뷰
- 맡길 일: `fp/main.js`에서 `shared/`로 옮긴 모든 조각(이동 물리 `move.js`, 월드 질의 `ctl.js`, 플레이 규칙 `play.js`, HUD·팀 창 `hud.js`, 접속 `presence.js`)이 옮기기 전과 같은 동작인지, `td/`의 대상 판정·건설 칸·꾹 캐기가 fp와 같은 규칙(닿는 거리, 겹침, 열선 거리)을 지키는지 대조
- 같이 붙일 파일: `git diff fp-before-shared -- fp/main.js shared/ td/main.js`, `tools/smokefp.js`, `tools/smoketd.js`, `tools/smokemix.js`, `DESIGN.md` §4-20
- 질문: (1) `play.js`의 `pl.ghostCheck`·`useAction`·`doInteract`가 옛 fp 함수와 같은 분기·같은 문구인가, (2) `td/`에서 클릭 한 번이 두 번 동작하거나(좌클릭 + E) 팀 쓰기 권한(`Party.guard`)을 건너뛰는 길이 있는가, (3) 스프라이트 상자 판정이 겹친 대상(장치 뒤의 나무)에서 엉뚱한 대상을 고르는 경우가 있는가
- 사람이 확인할 방법: `td/`와 `fp/`로 같은 계정에서 같은 장치를 짓고 철거해 보고(재료 환불·연결선 삭제 동일), 같은 팀에서 한 명은 `td/`, 한 명은 `fp/`로 교역·프로젝트 기여를 해 서로 같은 숫자가 보이는지 확인

### [2026-10-27] 15단계: 탐사정 수리 재료·조건의 화학 연결
- 맡길 일: 수리 재료(증류수 150 g + 소금 20 g)와 조건(직접 증류한 `f.dW` ≥ 200 g, `f.dS` ≥ 20 g)이 튜토리얼 흐름(목표 2~5)과 맞물려 막힘이 없는지, 증류수·소금 수지가 질량 보존에 맞는지 점검
- 같이 붙일 파일: `sim.js`(`RAFT.REPAIR_COST`, `REPAIR_NEED`, `repairRaft`), `ui.js`(`uiFragment`), `tools/sim-scenarios.js`(K), `DESIGN.md` §4-21, `ITEMS.md`(#24, #29~#32)
- 질문: (1) 증류 한 번(바닷물 200 g 안팎)에서 얻는 소금이 평균 몇 g이라 소금 20 g을 모으려면 몇 번 증류해야 하는지(목표 3 이후 소금을 더 쓰는 경로가 있어 수리 때 20 g이 모자라지 않는지), (2) 증류 없이 수리되는 우회 경로가 남았는지(광장 보급 상자 등)
- 사람이 확인할 방법: 새 게임에서 목표 1~3만 달성한 뒤 파편에서 E → 재료와 기록이 표시되는지, 증류 전에는 "고치기"가 비활성인지


### [2026-10-27] 16단계: 세이브 ver 2→3 이전과 행성별 맵 분할 diff 리뷰
- 맡길 일: 옛 저장(키 = y·380 + x, 섬 한 줄 380칸)이 행성별 맵(`행성id:y*W+x`)으로 바르게 옮겨지는지, 두 번 이전해도 안전한지 검토
- 같이 붙일 파일(**채팅의 저장소 첨부는 오래된 커밋에 고정되니 파일을 직접 첨부**): `sim.js`(세이브 이전 부분), `tools/migrate-check.js`, `DESIGN.md` §4-22
- 질문: (1) 행성 창 오프셋을 빼는 계산이 모든 행성 경계에서 맞는지(경계 열 2개씩), 어느 행성에도 속하지 않는 바다 구간의 키는 버려지는지, (2) 이미 `행성id:번호` 키인 항목에 다시 이전이 돌 때 `NaN` 키가 생기지 않는지, (3) 빈 저장 `{}`, `dug`·`melt`가 없거나 null·배열인 저장, 음수·소수·범위 밖 키가 오염을 일으키지 않는지, (4) 시험이 빠뜨린 입력. 코드는 고치지 말고 문제가 되는 입력 예를 적어 줘.
- 사람이 확인할 방법: 옛 저장이 있는 브라우저에서 `index.html`을 열어 위치·판 땅·녹인 얼음이 그대로인지 보기, `node tools/migrate-check.js`

### [2026-10-27] 17-a: 기지 코어 서버 규칙과 겹침 검사, 동시 설치 시나리오
- 맡길 일: `/bases`·`/baseClaims` 보안 규칙이 의도대로 동작하는지(동시 설치에서 한쪽만 성공, 남의 기록·선점 칸을 못 건드림, 5분 뒤 지우기 거절) 규칙 문장을 줄 단위로 검토하고, 깨지는 시나리오를 만들어 보기
- 같이 붙일 파일(**채팅의 저장소 첨부는 오래된 커밋에 고정되니 파일을 직접 첨부**): `database.rules.json`(`bases`·`baseClaims` 부분), `net.js`(`baseClaim`·`baseRelease`), `world.js`(`areaOf`·`claimCells`·`coreCheck`), `tools/fakenet.js`(`baseClaim`·`baseRelease`), `tools/smokebase.js`, `MULTIPLAYER.md`, `DESIGN.md` §4-23
- 질문: (1) `.write`와 `.validate`의 `newData.parent().parent().child('baseClaims').child(newData.child('cell').val())`가 `ref().update()` 다중 경로 쓰기에서 "쓰기 뒤의 상태"를 읽는지(`root`는 쓰기 전), 아니면 `bases`와 `baseClaims`를 함께 쓸 때 거절될 수 있는지, (2) 선점 칸 지우기 규칙(`!newData.parent().parent().child('bases').child(data.val()).exists()`)과 만들기 규칙(`...child(newData.val()).exists()`)이 서로 순환하지 않는지, 빈 칸 몇 개만 먼저 선점해 남의 자리를 막는 "쓰레기 선점"이 가능한지, (3) 영역을 4칸 격자에 맞추고 영역 + 사방 4칸을 선점하면 "영역 사이 간격 ≥ 8칸"과 정확히 같은 조건인지(경계값: 간격 7·8·9칸, 음수 인덱스 `-1`을 +1 해서 만든 키), (4) 서버가 검증하지 못하는 항목(지형·깊이·추락 지점 간격)을 속이면 어떤 피해가 나는지
- 사람이 확인할 방법: Firebase 콘솔 규칙 시뮬레이터에서 (a) 다른 uid로 `/bases/{남}` 쓰기, (b) 이미 있는 `/baseClaims/{칸}`에 쓰기, (c) 만든 지 5분 뒤 `/bases/{내 id}` 지우기, (d) `w`·`h`가 범위 밖인 값, (e) 두 브라우저에서 같은 자리에 동시에 설치해 보기. 그리고 `node tools/smokebase.js`

### [2026-10-27] 17-a′: 무한 지하 월드 — 저장 RLE·덩어리 생성·`sim.js` 고리 diff 리뷰와 `/bases` 규칙
- 맡길 일: (1) 덩어리 생성이 **결정적**(같은 시드 → 같은 칸, 덩어리 경계에서 끊김 없음, 특징이 덩어리 안쪽 [3, 29]를 벗어나 이웃 덩어리를 침범하지 않음)인지, (2) 판 칸 저장(RLE `값*길이`, 값 0 = 자연 그대로)의 왕복·경계값(전부 같은 값 한 덩어리, 1,024칸 모두 다른 값, 되돌려 메운 덩어리가 저장에서 삭제되는지), (3) `sim.js` 교체 고리(`geo.ambient`, `geo.island`의 `d.pl`, `geo.adjacent`, 얼음 생물 출현의 장치 자리 온도)가 고리가 없을 때 옛 동작과 **완전히 같은지**, (4) `/bases` 규칙(본인·팀 id만 쓰기, `$other` 거절)
- 같이 붙일 파일(**채팅의 저장소 첨부는 오래된 커밋에 고정되니 파일을 직접 첨부**): `world.js`(`hash3`, `pickFeature`, `genChunk`, `rleEncode/rleDecode`, `getChunk`, `setInfTile`, `ambientAt`), `sim.js`(`geo`, `airTemp`, `stepMobs`, `teleport`, `placeFree`, `migrateUnderground`), `database.rules.json`(`bases`), `tools/smokebase.js`, `tools/smoketut.js`, `tools/migrate-check.js`, `DESIGN.md` §4-24, `MULTIPLAYER.md`
- 질문: (1) `hash3`(32비트 곱·시프트 혼합)가 서로 이웃한 덩어리 `(cx, cy)`에서 상관이 크거나 `(cx, cy, k)` 사이에 충돌이 많은 패턴은 없는지, (2) `bulk()`의 깊이 경계 구불거림(`3·sin(x/17) + 2·sin(x/7 + 1)`)이 덩어리 경계에서 연속인지(월드 좌표로 계산하므로 연속이어야 함), (3) `stepMobs`에서 `curDev`를 바꿔 `airTemp`를 부르는 `tOf`가 `curDev`를 `null`로 되돌려 다른 계산(`stepDevices` 등)에 새지 않는지, (4) 얼음 생물이 붙은 장치를 철거·이전할 때 `S.mobs`의 `dx, dy`가 어느 행성 것인지(`mobHere`) 모호해지는 경우가 있는지, (5) `/bases`에서 `members`에 다른 uid를 넣어 남을 팀원으로 올릴 수 있는지(17-b 팀 규칙과의 상호작용)
- 사람이 확인할 방법: `node tools/smokebase.js`(같은 시드 해시, RLE 왕복, 저장 상한), `node tools/smoketut.js`(목표 1~11), `node tools/sim-check.js`(10개 그대로), 두 브라우저에서 새 게임을 시작해 코어 둘레 같은 동굴이 같은 자리에 있는지, Firebase 콘솔 규칙 시뮬레이터로 `/bases/{남의 uid}` 쓰기 시도

### [2026-10-27] 17-b: 팀 가입 순서 충돌·쓰기 임대·덩어리 동기화 충돌 검토
- 맡길 일: (1) **팀 가입 순서**: `Party.join`이 `Net.partyJoin(code)`(서버 가입) → 장치 철거 환불 → `watch` → 첫 스냅샷 `applyRemote` 순서로 도는데, 가입과 첫 스냅샷 사이에 `tick()`이 임대를 얻어 `partyPublishDelta(…, base 0, …)`로 **내 옛 월드를 팀 상태 위에 덮어쓸 수 있는 틈**이 있는지, (2) **쓰기 임대**: 팀원이 임대 없이 `World.setTile`을 부르는 경로(`stepDig`·`placeBlock`·건설·철거·장치)가 모두 `Team.gate()`/`Team.guard()`를 지나는지, 임대가 active → passive로 내려가는 6초 창에서 마지막 변경이 유실되지 않는지, (3) **덩어리 동기화 충돌**: `partyPublishDelta`의 `update()`가 `ver`가 +1일 때만 받아지는 것(`state/.write`·`state/ver .validate`)이 자식 경로(`state/world/{cx,cy}`)를 같이 쓸 때도 한 번에 원자적으로 평가되는지, 두 사람이 같은 `ver`로 동시에 올릴 때 진 쪽이 `holder=false`가 되어 서버 상태를 받는 처리(`applyRemote`의 `applyWorldDelta`)가 로컬의 아직 안 올린 변경을 안전하게 버리는지.
- 같이 붙일 파일(**채팅의 저장소 첨부는 오래된 커밋에 고정되니 파일을 직접 첨부**): `shared/party.js`(`join`·`tick`·`applyRemote`·`onSnap`), `net.js`(`partyPublishDelta`), `database.rules.json`(`parties` 전체), `world.js`(`applyWorldDelta`·`resetWorldState`·`thumb`), `team.js`, `game.js`(`stepDig`·`placeAtMouse`·`doInteract`), `tools/fakenet.js`(`publishDelta`), `tools/smoketeam.js`, `MULTIPLAYER.md`, `DESIGN.md` §4-25
- 질문: (a) Firebase `update({ver: n+1, by, 'world/0,0': …, placed: …})`가 `state/.validate`(전체 쓰기용)를 건너뛰고 `state/ver`의 `.validate`(`newData.val() === data.val() + 1`)만 평가한다는 해석이 맞는지, 맞다면 `world` 자식에는 형식 검증이 없어 팀원이 임의 문자열을 쓸 수 있다는 한계(`MULTIPLAYER.md`)가 전부인지, (b) `onSnap`이 `st.ver > P.ver && !(P.holder && st.by === id)`일 때만 `applyRemote`를 부르는데, 내가 올린 직후 다른 팀원이 `ver+1`을 올리고 내 스냅샷이 둘 다 합쳐져 도착하면 내 `lastWorld`가 서버와 어긋나 다음 델타가 틀린 덩어리를 `null`로 지우지 않는지, (c) 가입 직후 `S.world`(옛 개인 월드)가 비어 있지 않은 채 `getWorld()`가 첫 틱에서 호출되면 옛 덩어리가 팀에 올라가는 경로가 없는지.
- 사람이 확인할 방법: `node tools/smoketeam.js`(가짜 서버), 두 브라우저로 같은 팀에 들어가 A가 파는 동안 B에서 땅이 보이는지·B가 파려 하면 "동료가 조작 중이에요"가 뜨는지, Firebase 콘솔 규칙 시뮬레이터에서 `parties/{pid}/state`에 `ver` 건너뛰기·팀원이 아닌 사람 쓰기 거부 확인

### [2026-10-28] 18단계: 칸 시뮬 코어 — 식 A(열 전도)·B(기체 확산)·C(밀도층)의 과학적 정확성·단위·경계값
- 맡길 일(추가 개념이라 정확성 검증이 필요하다. 시트에 없는 개념이므로 `CLAUDE.md`의 "추가 개념 세 가지" 범위 안인지도 함께): (1) **A 열 전도**: 칸 사이 전도도 `K = L_CELL × 2·ka·kb/(ka+kb)`(칸 한 변 L, 접촉 면적 L², 중심 거리 L의 직렬 저항)의 유도와 단위(W/K), 한 걸음 열량을 두 칸 평형 열량 `Q_eq = Ca·Cb/(Ca+Cb)·ΔT`의 0.2배로 자르는 것이 에너지 보존과 "온도가 이웃의 최고·최저를 넘지 않는다"(최대 원리)를 지키는지, 재료 표(암석 2.7·0.84·2.5, 흙 1.5·0.90·1.0, 모래 1.6·0.80·0.3, 얼음 0.92·2.1·2.2, 철 7.87·0.45·80, 물 1.0·4.18·0.6, 공기 k 0.026)가 대표값으로 적절한지. (2) **B 기체 확산**: 속도 ∝ (분압 차)/√M(그레이엄 법칙은 같은 T·P에서의 속도 비)을 온도가 다른 칸 사이에 분압 차 하나로 근사하는 것의 한계, 분압 평형 몰수 `x_eq = (Pa − Pb)·V/(R·(Ta + Tb))`의 유도, 이동하는 기체가 내부 에너지 `n·Cv·T`를 옮기고 유동 일(pV)을 무시하는 단순화, `Cv = f/2·R`(단원자 3/2, 이원자 5/2, 물 증기 3)과 `D_GAS` 환산(단위 mol·√(g/mol)/(atm·s))이 맞는지. (3) **C 밀도층**: `ρ = P·M̄/(R·T)`의 단위(g/L), 칸 높이 0.46 m의 정수압(약 5×10⁻⁵ atm) 무시 근거, 화면 문구 "충분한 시간이 지나면 확산으로 균일하게 섞여 평형에서 층이 영구히 나뉘지 않는다. 막 유입된 짧은 시간에는 밀도 차에 의한 이동이 확산보다 빠르다"가 과학적으로 오해 없는지.
- 경계값 케이스를 제안해 주세요: 극저온(−200 ℃) 기체 칸, 100 atm 칸, 몰수 1e-12 이하, ΔT ≈ 0, 분압이 같고 온도만 다른 두 칸(이동이 없어야 함), 열용량 비가 1e6 이상인 칸 쌍, 부피를 바꾸는 입력이 없다는 가정에서 빠뜨린 경우.
- 같이 붙일 파일(직접 첨부): `chem.js`(맨 아래 18단계 블록), `cells.js`, `tools/cells-check.js`, `DESIGN.md` §4-28
- 사람이 확인할 방법: `node tools/cells-check.js`(43개 통과). 마음에 안 드는 값은 `chem.js`의 상수 하나만 바꾸면 되고(재료 표·`D_GAS`·`LAYER_RATE`), 바꾼 뒤 시험을 다시 돌려 `DESIGN.md` §4-28의 표에 전후 값을 적는다. 결과는 사용자가 확인한 것만 `DESIGN.md`·`notes.js` `LINKS`에 반영한다.

### [2026-10-28] 접속 방식(랜서버식 친구 초대): 방장 접속과 무관한 코드 가입의 한계 확인 (규칙 변경 없음)
- 맡길 일: 메인 화면 [코드로 들어가기](`ui.js` `joinWithCode`)와 게임 안 [친구 초대](`team.js` `Invite`)가 **새 서버 경로·규칙 없이** 기존 `Net.partyCreate`·`Net.partyJoin`만 쓰는지, 그리고 `MULTIPLAYER.md` §12의 한계(방장 접속과 무관하게 코드만으로 가입 가능, 서버가 막지 못함, 코드 시도 횟수 제한 없음, 6명 상한은 클라이언트 약속)가 `database.rules.json`과 맞는지 검토.
- 같이 붙일 파일(직접 첨부): `database.rules.json`, `ui.js`(`joinWithCode`·`enterWorld`), `team.js`(`Invite`), `net.js`(`partyCreate`·`partyJoin`), `MULTIPLAYER.md` §12
- 질문: (a) `/partyCodes/{code}`의 읽기가 로그인만 요구한다면 **로그인한 사람이 임의의 코드를 하나씩 조회**할 수 있는데, 이것이 코드 추측을 쉽게 하는가(32자 6자리 ≈ 10억 가지)? (b) 방장이 오프라인이어도 `members/{uid}` 쓰기가 허용되는 것이 규칙상 맞는가(방장의 접속 여부를 규칙이 볼 수 없다는 설명이 정확한가)? (c) 코드를 알면 7번째 이후도 일단 가입되고 클라이언트가 스스로 나가는 방식의 위험(그 사이 팀 상태 쓰기 가능)?
- 사람이 확인할 방법: `node tools/smokeinvite.js`(가짜 서버), 콘솔 규칙 시뮬레이터에서 방장 uid 없이 다른 uid로 `parties/{pid}/members/{uid}`에 올바른 `code`로 쓰기 → 허용, 틀린 `code`로 쓰기 → 거부(아래 "규칙 시뮬레이터 점검 항목" 3번과 같은 항목).

### 규칙 시뮬레이터 점검 항목 (`database.rules.json`을 바꿀 때마다 — 고정 요청)
- **원칙**: Firebase 규칙 언어에 없는 함수는 쓰지 않는다(`indexOf`·`toString`·`Math`·화살표 함수 등은 JavaScript 문법이라 규칙에서 쓸 수 없다). 지금 쓰는 것은 `val`·`child`·`exists`·`hasChildren`·`isString`·`isNumber`·`isBoolean`·`matches`뿐이다. 규칙을 바꾸면 **JSON 문법만이 아니라 함수 사용도** `node tools/rules-check.js`로 확인한다(허용 목록 밖의 메서드·이름·JS 문법이면 실패). 이 점검은 문법·이름 수준이고 의미(누가 쓸 수 있나)는 가짜 서버 시험도 흉내일 뿐이므로 아래를 **콘솔 시뮬레이터에서 직접** 확인한다.
- 맡길 일(Argon): `database.rules.json`의 모든 `.read/.write/.validate` 식이 Realtime Database 규칙 언어로 유효한지(없는 메서드, 문자열 `length` 사용, `newData`/`data`/`root` 구분 오용, `$변수` 범위), 그리고 아래 허용/거부 사례가 의도대로 판정되는지.
- 같이 붙일 파일(직접 첨부): `database.rules.json`, `tools/rules-check.js`, `tools/fakenet.js`, `MULTIPLAYER.md`
- 사람이 콘솔 시뮬레이터에서 확인할 항목 (규칙 편집기 → 규칙 시뮬레이터, 위치·인증 uid를 바꿔 가며):
  1. **17-b 팀 상태**: 팀원 uid로 `parties/{pid}/state`에 `update({ver: 기존+1, by, 'world/0,0': '…'})` → 허용 / `ver`를 건너뛰어(+2) 쓰기 → 거부 / 팀원이 아닌 uid로 쓰기 → 거부.
  2. **`/bases/{id}`**: 본인 uid 또는 속한 팀 pid로 쓰기 → 허용 / 남의 uid → 거부 / `devices` 41개 → 거부 / `map.w` 65 → 거부 / `rows` 한 줄 65자 → 거부 / `map`에 `$other` 필드 추가 → 거부 / `tech` 7 → 거부 / 코어 위치(`x`·`cx`) 필드 → 거부.
  3. **9단계 임대·가입**: 만료 전 다른 uid가 임대 가져가기 → 거부, 5번째 팀원 가입 → 거부, 틀린 코드로 가입 → 거부.
  4. **11단계 교류**: 자기 팀 교역 수락 → 거부, 점수 줄이기 → 거부, 상한 초과 → 거부, 남의 팀 점수 쓰기 → 거부.
  5. 규칙 게시 직후 앱에서 로그인 → 저장 → 팀 만들기 → 본부 간판 보기가 에러 없이 되는지(브라우저 콘솔의 `PERMISSION_DENIED` 확인).

### [2026-10-27] 17-c: 팀 대 팀 합치기 — 순서 충돌·끊김 복구·호스트 선정·`/merges` 규칙 검토
- 맡길 일: (1) **합치기 순서 충돌**: 게스트 팀원 여럿이 동시에 `Party.mergeJoin` → `moved` → `switchTo` → 입금 → `partyLeave` 하는 동안, 호스트 상태에 `team.merged[from:o]`를 한 번만 넣는 짐꾼 입금(`merge.js` `step`의 `deposit`)이 두 번 입금되거나 한 번도 입금되지 않을 틈이 있는지, 짐꾼이 게스트 팀을 떠난 뒤 다른 게스트 팀원이 `view`를 못 얻어 멈추는 경로가 있는지, (2) **끊김 복구**: 장부(`S.mergeJob`, `phase` join → switch → deposit → leave → done) 각 단계가 멱등인지, 특히 deposit에서 `t.merged` 표시와 창고 가산이 **같은 한 번의 `ver` 검사 쓰기**로 서버에 가는지(`Party.dirty()` 대기 8초 뒤 `partyLeave`), 쓰기가 엇갈려 거절되면 다음 틱에 서버 상태로 덮인 뒤 다시 입금하는지, (3) **호스트 선정**: `hostOf`(인원 → 같으면 `pidOrder`: 길이 후 사전순)가 Firebase push id(20자, 앞 8자가 시각)에서 먼저 만든 팀을 맞게 고르는지, 인원이 제안 뒤에 바뀌었을 때의 처리(수락 때 호스트 재계산, 확인 때 `guestN` 비교), (4) **`/merges` 규칙**: `.write`를 `offer`·`answer`·`grant`·`ready/$uid`·`moved/$uid`에만 두고 `$from` 수준에는 두지 않은 것이 상위 `.write` 캐스케이드를 피하는지, `grant`가 두 팀원 모두에게 쓰기를 주는 한계, `/parties/$pid/merge` 추가가 기존 `$other: false`와 충돌하지 않는지.
- 같이 붙일 파일(**채팅의 저장소 첨부는 오래된 커밋에 고정되니 파일을 직접 첨부**): `merge.js`, `shared/party.js`(`join`·`mergeJoin`·`switchTo`·`dirty`·`waitFirst`), `shared/hub.js`(`scoreOf`·`signs`), `net.js`(`merge*`), `database.rules.json`(`merges`·`parties/$pid/merge`·`partyPub`·`boards`), `tools/fakenet.js`(`merge*`), `tools/smokemerge.js`, `MULTIPLAYER.md`, `DESIGN.md` §4-26
- 질문: (a) 장부 기반 재개에서 `Net.partyJoin`이 이미 멤버일 때 `members/{uid}`를 같은 `code`로 다시 `set` 해도 규칙(`data.exists()` 허용)이 통과하고 `t`만 갱신되는지, (b) 점수 합산(`team.bonus.water`, `envGoals` 합집합, `coreUnits` 덧셈)이 `scoreOf`와 리더보드 상한(`env` 3·`core` 60·`water` 2000·`predict` 30)을 지키며 줄지 않게 따라 오르는지, (c) 두 팀이 서로에게 동시에 제안하면(`/merges/B/A`와 `/merges/A/B`) 어떻게 되는지(현재는 각자 자기 제안과 받은 제안을 따로 처리 — 막지 않음).
- 사람이 확인할 방법: `node tools/smokemerge.js`(가짜 서버), 두 팀을 실제 Firebase로 만들어 제안→수락→확인→합류를 해 보고 중간에 탭을 닫았다 다시 열어 이어지는지, 콘솔 규칙 시뮬레이터 점검(아래)

### 규칙 시뮬레이터 점검 항목 — 17-c 추가분
  1. **`/merges/{to}/{from}/offer`**: `from` 팀원 uid로 쓰기 → 허용 / `to` 팀원이 쓰기 → 거부 / `n` 7 → 거부 / `exp`가 `now`+1시간 초과 → 거부 / 필드 누락·`$other` 추가 → 거부.
  2. **`answer`**: `to` 팀원 → 허용 / `from` 팀원 → 거부 / `res`가 `accept`·`reject` 밖 → 거부.
  3. **`grant`**: 두 팀원 → 허용, 둘 다 아닌 uid → 거부, `code` 5자 → 거부.
  4. **`ready/$uid`·`moved/$uid`**: 본인 uid + 두 팀 중 한 팀원 → 허용 / 다른 사람 uid로 쓰기 → 거부 / 아무 팀도 아닌 uid → 거부.
  5. **읽기**: `/merges/{to}`를 `to` 팀원으로 읽기 → 허용, `from` 팀원 → 거부(`/merges/{to}/{from}`은 허용), 팀이 아닌 uid → 거부.
  6. **`/parties/{pid}/merge`**: 팀원 쓰기 → 허용 / 남 → 거부 / `to`·`t` 누락 → 거부.
  7. **상한 변경**: `/partyPub/{pid}/members` 6 → 허용, 7 → 거부. `/boards/{board}/{pid}/members` 6 → 허용, 7 → 거부. (팀 인원 상한 자체는 규칙이 셀 수 없음 — 허용되는 것이 정상)
  8. 규칙 게시 직후 앱에서 팀 만들기 → 간판 → 합치기 제안이 `PERMISSION_DENIED` 없이 되는지.

### [2026-10-28] 본부 배제·튜토리얼 보강: 저장 이전 diff 리뷰와 목표 문구 치환 검토 (서버 규칙 변경 없음)
- 맡길 일: (1) `sim.js`의 `migrateHubless`(본부에 있던 저장 → 내 월드 보급 모듈)가 재료·장치·목표·채집 기록을 잃지 않고 **두 번 실행돼도 같은 결과**인지 diff 리뷰. (2) 목표 1·4·6·8·10·11의 문구·힌트를 "본부" → "보급 모듈"로 바꾼 치환에서 **화학 설명(증류수 150 g + 소금 20 g, 한제 −10 ℃ 등)이 달라지지 않았는지**와 옛 표현이 남은 곳이 없는지 검토. (3) `game.js`의 팀 월드 위치 공유가 `x`에 +10000을 더해 규칙 범위(0..20000 px)를 지키는지.
- 같이 붙일 파일(직접 첨부): `sim.js`, `world.js`(`MODULE_OBJS`·`moduleTile`), `game.js`(`mapNow`·`posPacket`), `tutorial.js`, `DESIGN.md` §4-30, `database.rules.json`(변경 없음)
- 사람이 확인할 방법: `node tools/migrate-check.js`, `node tools/smokenew.js`(실제 키·마우스 입력으로 첫 목표까지), `node tools/smokeinvite.js`(team-{pid} 채널), `node tools/sim-check.js`(11개 그대로).
