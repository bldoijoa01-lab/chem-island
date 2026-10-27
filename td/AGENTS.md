<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-27 -->

# td/

**탑다운 2D 클라이언트**(13단계, 캔버스 2D 픽셀 아트 3/4 시점, 우주 테마). **동결**(21단계에서 사용자 확인 뒤 삭제, 되살리는 태그 `fp-td-final`). 월드·이동·팀·교류는 `../shared/`를 `fp/`와 같이 쓴다. THREE 불필요.

## 파일
| 파일 | 역할 |
|---|---|
| `index.html` | 진입점. `window.CHEM_FP = true`(fp와 같은 저장 키·서버 경로), 루트 모듈 → `main.js` module |
| `main.js` | 캔버스 그리기(y 정렬 스프라이트·그림자)·입력(WASD·마우스 대상 지정·건설 미리보기)·시간/저장 연결 |
| `ground.js` | 높이장을 위에서 본 픽셀 아트 땅 한 장으로 굽는다(섬이 바뀔 때만). 1 m = 16 px |
| `styletd.css` | 탑다운 전용 스타일 |

## 규칙
- 새 아이콘·스프라이트는 `../sprites.js`에서 그린다. 외부 이미지는 사용자가 직접 준 것만 `td/assets/`에 둔다(지금은 없음).
- 서버 데이터를 따로 만들지 않는다. 접속 패킷의 `yaw`는 바라보는 방향으로 채운다.
- 60 fps 목표. 미달이면 `ground.js`·`main.js`의 그리기 범위를 줄이고 `DESIGN.md` §4-20에 기록한다.
- 시험: `node tools/smoketd.js`(Playwright, three 불필요), 혼합 접속은 `node tools/smokemix.js`.

<!-- MANUAL: Notes below this line are preserved when regenerating -->
