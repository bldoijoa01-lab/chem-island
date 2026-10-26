<!-- Generated: 2026-10-26 -->

# 화학 섬 이야기 (Chem Island)

A Korean-language 2D side-view pixel game where every device is a real chemistry relation computed in code (Raoult's law, Clausius–Clapeyron, freezing-point depression, ideal gas, Dalton's law). It is a school performance-assessment project: **chemistry accuracy, system design, verification/improvement and personal contribution matter more than polish**. Plain static site: no build step, no bundler, no package manager, no tests, no external images.

## Run / deploy
- Open `index.html` in a browser. Multiplayer needs the Firebase CDN scripts; if they fail to load or `firebase-config.js` is missing, the game falls back to single-player (localStorage).
- Deployed as GitHub Pages (`main` / root). Any new file must be a static asset referenced by relative path.
- There is no test or lint tooling. Verify changes by running the game in a browser (Playwright/Chromium is available in cloud sessions) and checking the console.

## Root files
| File | Purpose |
|---|---|
| `index.html` | DOM shell: `#cv` canvas, HUD overlays, `#modal`, `#auth`. **Script load order matters** (see below). |
| `style.css` | All styling (modal, auth, HUD, touch pad). |
| `chem.js` | `window.Chem`: **the only place chemistry formulas/constants live** (`pStar`, `xw`, `pSol`, `tb`, `molality`, `coolTemp`, `moles`, `partial`, `mixT`, `packMix`, `AIR`...). Item numbers from class appear as `[#n]` comments. |
| `sim.js` | `window.Sim` (also `require`-able in Node): state + save migration, time, device/wolf simulation, quests, action rules, raft/islands/docks (`DOCKS`, `ENV` per-island pressure/temperature, `bounds`). **No window/DOM/canvas.** Screen effects leave as events (`Sim.drain()`). Check with `node tools/sim-check.js` (baseline) and `node tools/sim-compare.js` (same devices per island). |
| `store.js` · `world.js` · `ui.js` | 2D·3D가 같이 쓰는 모듈: 상태·저장 / 지형·땅 규칙·이동(`stepPlayer`) / 모달·패널·접속(`UI.init(host)` 훅). `game.js`에서 나눈 것 |
| `shared/` | **fp/와 td/ 공용(13-a)**: `gen.js`(높이장·섬·자원 배치)·`move.js`(이동·충돌 물리 상수와 `stepBody`)·`theme.js`(우주 테마 문구)·`party.js`(팀·임대·공용 창고)·`hub.js`(팀 간 교류). 화면(THREE·캔버스)에 묶이지 않는다. 이동 전 상태는 태그 `fp-before-shared` |
| `fp/` | **1인칭 3D**(6~7단계). `index.html`·`main.js`(컨트롤러·경사 충돌·시선 대상·채집·공용 UI 연결)·`gen.js`(시드 고정 높이 지형 `height(x,z)`, 섬 4개)·`terrain.js`(정점 색 지형 메시)·`models.js`(기본 도형 모형)·`stylefp.css`. 블록 채굴은 없다(7단계). `window.CHEM_FP`로 저장 키 `chemisle_fp_v2`·서버 `/saves3`·`/rafts3`를 쓴다. `Sim.geo.adjacent`를 격자 인접으로 바꿔 끼운다. 이전 복셀 버전은 태그 `fp-voxel-v1`. 시험: `node tools/smokefp.js`, 팀은 `node tools/smokeparty.js`, 팀 간 교류는 `node tools/smokeinter.js`(둘 다 `tools/fakenet.js`)(CDN이 막히면 `THREE_MODULE=`) |
| `3d/` | 3D 시험판(Three.js 0.160.0, CDN importmap). `index.html`·`main.js`·`style3d.css`. 계산은 `sim.js`·`chem.js` 그대로, `S`를 읽어 그리기만 한다. 시험: `node tools/smoke3d.js`(CDN이 막히면 `THREE_MODULE=`) |
| `game.js` | (2D 입력·그리기·HUD만 남음. 아래 설명 중 UI·저장·땅 규칙은 위 모듈로 옮겨짐) IIFE, ~1,200 lines (380-tile world: start island, plaza, alpine, polar; raft, sailing, plaza rafts/bottle board): save, tile world, dig/tools, modal panels, auth flow, input, physics, rendering, HUD, presence ghosts. Calls `Sim.*` and applies its events via `flush()`. Exposes an `api` object to `raid.js`/`notes.js`. |
| `raid.js` | `window.Raid`: 3-phase "솥 골렘" boss puzzle (P1 Raoult, P2 pressure/heat balance, P3 Dalton partial pressure). Opened via `Raid.open(api)`. |
| `notes.js` | `window.Notes`: research-note modal — concept-link table (`LINKS`, with lesson item numbers and implemented ✔/✘) and live calculators. |
| `sprites.js` | `window.Art`: all pixel art drawn procedurally onto canvases (tiles, player, devices, icons, golem, sky/parallax). 16×16 tiles, auto 1px outline. |
| `net.js` | `window.Net`: Firebase layer — guest (anonymous) login, nickname/password upgrade, `/saves`, presence. `Net.init()` returns false when Firebase is unavailable. |
| `firebase-config.js` | Public web-app config (safe to commit; security is enforced by the rules file). |
| `database.rules.json` | Realtime Database security rules (pasted manually into the Firebase console). |
| `DESIGN.md` | Assessment design doc: device↔rule↔lesson-item table, assumptions, verification cases. |
| `MULTIPLAYER.md` | Firebase multiplayer design, data layout, roadmap (M0–M7) and current progress (§11). |
| `.claude/settings.json` | Enables the oh-my-claudecode plugin. `.omc/` is git-ignored. |

## Script load order (index.html)
Firebase SDK (CDN) → `firebase-config.js` → `net.js` → `chem.js` → `sim.js` → `store.js` → `world.js` → `sprites.js` → `ui.js` → `notes.js` → `raid.js` → `game.js` (3D는 마지막에 `3d/main.js`). Modules attach to `window.*`; `game.js` runs last and consumes the others. Adding a script means adding a `<script>` tag in the right position.

## Conventions for AI agents
- **Chemistry only in `chem.js`.** Game files call `Chem.*`; do not inline formulas, constants or magic chemistry numbers elsewhere. If you change a formula or constant, update `DESIGN.md` (tables and verification cases) and the `LINKS` table in `notes.js` to match.
- Keep the assumption/validity notes that are shown on screen (e.g. ideal gas, non-volatile solute, i=2 for NaCl). They are part of the grading.
- **No emoji in game text:** `game.js` strips them via `pix()`; text rendered through `say()`/`logEv()` should be plain Korean.
- All UI text, comments and docs are **Korean**; match that language and the existing terse comment style (a short `//` note, often with `[#item]`).
- Game balance constants are tuned from measured runs (e.g. `SURGE=10` in `raid.js`, with the reasoning in a comment and in `DESIGN.md` §4). Record the before/after numbers when you change one.
- Save format: localStorage key `chemisle_side_v1` (and `/saves/{uid}` remotely). `merge()` in `game.js` fills missing fields from `newState()`, so add new state fields there with defaults to stay backward compatible.
- Multiplayer: trust-the-client design. Any new DB path needs a matching entry in `database.rules.json` (default is deny) and a note in `MULTIPLAYER.md`. Planned `sim.js` extraction (device logic out of `game.js`) is not done yet; do not assume it exists.
- Do not commit secrets. `firebase-config.js` values are public by design; never add service-account keys or passwords.
- No build tooling is expected. Avoid adding dependencies; if one is unavoidable, pin a CDN version.

## Checks to run after a change
- `node --check <file>` does **not** catch a trailing `//` comment that swallows the code after it on the same line (this happened twice). Always also run `node tools/smoke.js` (opens `index.html` in Playwright, start → move, fails on any console/page error) and `node tools/sim-check.js` (6+ headless scenarios against `tools/sim-baseline.json`; regenerate the baseline on purpose when a rule changes and record before/after in `DESIGN.md`). `node tools/sim-compare.js` prints the same devices per island.
- Class scope: game chemistry may only use concepts in `ITEMS.md`; see `DESIGN.md` §4-12 for the classification (item / quantification / game setting / out of scope?).

## Where to look
- Adding/changing a device → `DEV`, `ITEM`, `RECIPES`, `QUESTS` at the top of `game.js`, the sim function in the "장치 시뮬레이션" section, the panel in "장치 패널", the sprite in `sprites.js`.
- Adding a chemistry concept → `chem.js` first, then `notes.js` `LINKS`/calculators, then `DESIGN.md`.
- Boss tuning → constants at the top of `raid.js`.
- Auth / network → `net.js` plus "접속" section in `game.js`.

<!-- MANUAL: Notes below this line are preserved when regenerating -->
