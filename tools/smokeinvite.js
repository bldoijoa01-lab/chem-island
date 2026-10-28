// 친구 초대 시험(랜서버식, 2026-10-28): 메인 화면 버튼 구성 → 방장이 시작 → 게임 안 [친구 초대](화면 안 HUD 클릭) → 6자리 코드 → 다른 브라우저가 메인 화면 [코드로 들어가기]에서
// 닉네임+코드 입력 → 방장이 접속을 끊은 뒤에도 세 번째 브라우저가 코드로 들어감(월드가 서버에 남는다) → 오류 문구·한계 문구·진행 보호.
// 가짜 서버(tools/fakenet.js)가 database.rules.json의 같은 뜻을 코드로 흉내 낸다. 새 서버 경로·규칙은 없다. 실제 규칙은 Firebase 콘솔 규칙 시뮬레이터로 따로 확인한다(MULTIPLAYER.md §12).
// 사용: node tools/smokeinvite.js   (Playwright, python3 http.server)
const path = require('path'), { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const PORT = 9700 + Math.floor(Math.random() * 200), ROOT = path.resolve(__dirname, '..');
const { server, handle, initScript } = require('./fakenet');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/index.html`)).ok) break; } catch (e) { /* 서버가 아직 안 뜸 */ } await new Promise(r => setTimeout(r, 250)); }   // 서버가 뜰 때까지 기다린다
  const browser = await chromium.launch();
  const errors = [], checks = [];
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const names = new Map(), dialogs = new Map(), dismiss = new Set();
  // anon이면 아직 캐릭터가 없는 브라우저(메인 화면에서 닉네임을 정한다). 시작은 부른 쪽이 한다
  async function open(uid, nick, anon) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 }, permissions: ['clipboard-read', 'clipboard-write'] }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`페이지 에러(${nick}): ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push(`콘솔 에러(${nick}): ` + m.text()); });
    dialogs.set(page, []);
    page.on('dialog', d => { dialogs.get(page).push(d.message()); return dismiss.has(page) ? d.dismiss() : d.accept(); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    server.pages.set(page, new Set()); names.set(page, anon ? null : nick);
    await page.exposeFunction('__rpc', (m, a) => { if (m === 'register') { names.set(page, a[0]); return true; } return handle(page, uid, names.get(page) || nick, m, a); });
    await page.addInitScript(initScript, { uid, nick, anon: !!anon });
    await page.goto(`http://127.0.0.1:${PORT}/index.html?test`); await sleep(800);
    return page;
  }
  const ev = (pg, f, a) => pg.evaluate(f, a);
  const closeM = (pg) => ev(pg, () => { if (!document.getElementById('modal').hidden) document.getElementById('mclose').click(); });
  const title = (pg) => ev(pg, () => (document.getElementById('modal').hidden ? '' : document.getElementById('mtitle').textContent));
  const body = (pg) => ev(pg, () => document.getElementById('mbody').textContent);
  const menuButtons = (pg) => ev(pg, () => [...document.querySelectorAll('#tbox button')].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()));
  // 화면 안 HUD 버튼을 실제 마우스로 누른다(논리 픽셀 → 화면 좌표)
  async function hudClick(pg, label) {
    const p = await ev(pg, (label) => { const r = G.hudRect(label); if (!r) return null; const c = document.getElementById('cv').getBoundingClientRect(); return { x: c.left + (r.x + r.w / 2) / r.vw * c.width, y: c.top + (r.y + r.h / 2) / r.vh * c.height }; }, label);
    if (!p) return false; await pg.mouse.move(p.x, p.y); await pg.mouse.click(p.x, p.y); return true;
  }
  const started = (pg) => ev(pg, () => document.getElementById('title').hidden);
  const joinPanel = async (pg, nick, code) => { await ev(pg, ([n, c]) => { document.getElementById('tj-nick').value = n; document.getElementById('tj-code').value = c; document.getElementById('tj-go').click(); }, [nick, code]); await sleep(1800); };
  const errTxt = (pg) => ev(pg, () => document.getElementById('tj-err').textContent);
  try {
    // ---------- 1. 메인 화면: 버튼은 네 개뿐, "방 만들기"는 없다 ----------
    const H = await open('uHost', '방장');
    const btns = await menuButtons(H), titleTxt = await ev(H, () => document.getElementById('title').innerText);
    ok('메인 화면 버튼: 새로 시작 / 이어하기 / 코드로 들어가기 / 안내 네 개뿐', btns.join('|') === '새로 시작|이어하기|코드로 들어가기|안내', btns.join('|'));
    ok('메인 화면에 "방 만들기"가 없음', !/방 만들기/.test(titleTxt), titleTxt.slice(0, 120));
    await ev(H, () => document.getElementById('t-join').click());
    ok('코드로 들어가기 패널: 닉네임·코드 입력칸과 한계 한 줄(방장이 접속 중이 아니어도 들어올 수 있음)', await ev(H, () => !document.getElementById('t-joinbox').hidden && !!document.getElementById('tj-nick') && !!document.getElementById('tj-code')) && /접속 중이 아니어도/.test(await ev(H, () => document.getElementById('tj-note').textContent)) && /막지 못/.test(await ev(H, () => document.getElementById('tj-note').textContent)));
    await ev(H, () => document.getElementById('t-help').click()); await sleep(200);
    const helpTxt = await body(H);
    ok('안내: 친구 초대 방법과 한계가 적혀 있음', await title(H) === '도움말' || /안내|도움말/.test(await title(H)), await title(H));
    ok('안내 내용: 친구 초대 아이콘·코드로 들어가기·접속 중이 아니어도', /친구 초대/.test(helpTxt) && /코드로 들어가기/.test(helpTxt) && /접속 중이 아니어도/.test(helpTxt));
    await closeM(H);
    // [새로 시작]: 진행이 있으면 확인, 취소하면 그대로 / 승인하면 비움. [이어하기]는 진행을 그대로 쓴다
    const P = await open('uP', '진행자');
    await ev(P, () => { const S = G.debug(); S.day = 3; S.qDone = 2; }); dismiss.add(P);
    await ev(P, () => document.getElementById('t-new').click()); await sleep(300);
    ok('새로 시작(진행 있음): 확인 창이 진행을 알려 주고, 취소하면 그대로이며 메인 화면에 머묾', /3일차/.test(dialogs.get(P)[0] || '') && !(await started(P)) && (await ev(P, () => G.debug().day)) === 3, JSON.stringify(dialogs.get(P)));
    dismiss.delete(P);
    await ev(P, () => document.getElementById('t-new').click()); await sleep(1500);
    ok('새로 시작(승인): 진행이 비워지고 시작됨', await started(P) && (await ev(P, () => G.debug().day)) === 1 && (await ev(P, () => G.debug().qDone)) === 0);
    const P2 = await open('uP2', '이어서');
    await ev(P2, () => { const S = G.debug(); S.day = 4; S.qDone = 3; });
    await ev(P2, () => document.getElementById('t-continue').click()); await sleep(1500);
    ok('이어하기: 진행(4일차·목표 3)을 그대로 쓰고 확인 창 없음', await started(P2) && (await ev(P2, () => G.debug().day)) === 4 && (await ev(P2, () => G.debug().qDone)) === 3 && dialogs.get(P2).length === 0);
    await P.context().close(); await P2.context().close();

    // ---------- 2. 방장: 새로 시작 → 게임 안 [친구 초대] ----------
    await ev(H, () => document.getElementById('t-new').click()); await sleep(1500);
    await closeM(H);
    ok('방장 시작: 메인 화면이 닫히고 아직 팀이 없음', await started(H) && !(await ev(H, () => Team.inParty())));
    // 방장이 내 월드에 방을 파 둔다(팀을 만들 때 이 덩어리들이 팀 월드로 서버에 올라간다)
    ok('방장이 월드에 방 파기(덩어리 생김)', await ev(H, () => { const S = G.debug(); for (let x = -12; x <= -1; x++) for (const y of [5, 6]) World.setTile(S, x, y, World.AIR); return Object.keys(S.world).length > 0; }));
    ok('화면 안 HUD에 [친구 초대] 버튼이 있음', !!(await ev(H, () => G.hudRect('친구 초대'))));
    ok('[친구 초대]를 눌렀다(실제 마우스)', await hudClick(H, '친구 초대'));
    await sleep(1800);
    const code = await ev(H, () => (document.getElementById('iv-code') || {}).textContent || '');
    ok('친구 초대 창이 열리고 6자리 코드가 보임', await title(H) === '친구 초대' && /^[A-Z0-9]{6}$/.test(code), `제목 ${await title(H)}, 코드 ${code}`);
    const pids = Object.keys(server.parties), pa = pids[0];
    ok('팀이 없던 방장이 누르면 팀을 만들고 코드가 서버 코드와 같음', pids.length === 1 && server.parties[pa].code === code && (await ev(H, () => Team.inParty())) && server.parties[pa].name === '방장의 방', JSON.stringify([pids.length, server.parties[pa] && server.parties[pa].code, server.parties[pa] && server.parties[pa].name]));
    const bodyTxt = await body(H);
    ok('창에 한계 한 줄과 들어오는 방법(코드로 들어가기)이 있음', /접속 중이 아니어도/.test(bodyTxt) && /막지 못/.test(bodyTxt) && /코드로 들어가기/.test(bodyTxt));
    await ev(H, () => [...document.querySelectorAll('#mbody button')].find(b => b.textContent === '코드 복사').click()); await sleep(400);
    const msg = await ev(H, () => document.getElementById('iv-msg').textContent), clip = await ev(H, async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR ' + e.message; } });
    ok('코드 복사 버튼: 복사했다는 안내와 클립보드 내용이 코드와 같음', /복사했어요/.test(msg) && clip === code, `${msg} / ${clip}`);
    await ev(H, () => [...document.querySelectorAll('#mbody button')].find(b => b.textContent === '팀 창 열기').click()); await sleep(300);
    ok('팀 창 열기: 팀 창에 같은 코드와 [친구 초대] 버튼이 보임', await title(H) === '팀' && (await body(H)).includes(code) && (await ev(H, () => [...document.querySelectorAll('#mbody button')].some(b => b.textContent === '친구 초대'))));
    await ev(H, () => [...document.querySelectorAll('#mbody button')].find(b => b.textContent === '친구 초대').click()); await sleep(600);
    ok('이미 팀이면 [친구 초대]가 팀을 또 만들지 않고 같은 코드를 다시 보여 줌', Object.keys(server.parties).length === 1 && (await ev(H, () => document.getElementById('iv-code').textContent)) === code);
    await closeM(H);
    await hudClick(H, '친구 초대'); await sleep(800);
    ok('HUD로 다시 눌러도 같은 코드', Object.keys(server.parties).length === 1 && (await ev(H, () => (document.getElementById('iv-code') || {}).textContent)) === code);
    await closeM(H);
    const hostKeys = await ev(H, () => Object.keys(G.debug().world).sort());

    // ---------- 3. 친구: 다른 브라우저가 메인 화면에서 코드 입력 ----------
    const F = await open('uF', '친구', true);
    ok('친구 브라우저: 아직 캐릭터가 없고 메인 화면이 보임', !(await started(F)) && (await menuButtons(F)).join('|') === '새로 시작|이어하기|코드로 들어가기|안내');
    await ev(F, () => document.getElementById('t-join').click());
    await joinPanel(F, '친구', '');
    ok('코드를 비우면 "6자" 안내', /6자/.test(await errTxt(F)) && !(await started(F)), await errTxt(F));
    await joinPanel(F, '친', code);
    ok('닉네임이 1자면 닉네임 규칙 안내', /2~8자/.test(await errTxt(F)) && !(await started(F)), await errTxt(F));
    await joinPanel(F, '친구', 'ZZZZZZ');
    ok('없는 코드면 "없는 초대 코드" 안내', /없는 초대 코드/.test(await errTxt(F)) && !(await started(F)) && !(await ev(F, () => Team.inParty())), await errTxt(F));
    await joinPanel(F, '친구', code.toLowerCase());
    ok('올바른 코드(소문자로 입력해도)로 들어감: 메인 화면이 닫히고 방장의 팀', await started(F) && (await ev(F, () => Team.pid())) === pa && Object.keys(server.parties[pa].members).length === 2, `팀원 ${Object.keys(server.parties[pa].members).length}, pid ${await ev(F, () => Team.pid())}`);
    ok('들어온 친구의 닉네임이 서버 팀원 기록에 있음', Object.values(server.parties[pa].members).some(m => m.nick === '친구'));
    ok('정상 입장에는 확인 창이 없음', dialogs.get(F).length === 0, JSON.stringify(dialogs.get(F)));
    await closeM(F);
    ok('친구가 방장의 월드(덩어리)와 같은 팀 월드를 봄', (await ev(F, () => Object.keys(G.debug().world).sort())).join() === hostKeys.join(), 'F ' + (await ev(F, () => Object.keys(G.debug().world).sort())).join() + ' / H ' + hostKeys.join());
    ok('친구도 팀 창·친구 초대에서 같은 코드를 봄', await (async () => { await ev(F, () => Invite.open()); await sleep(500); return (await ev(F, () => (document.getElementById('iv-code') || {}).textContent)) === code; })());
    await closeM(F);

    // ---------- 4. 방장이 접속 중이 아니어도 코드로 들어간다(월드가 서버에 남는다) ----------
    await H.context().close();
    await sleep(500);
    const G2 = await open('uG', '셋째', true);
    await ev(G2, () => document.getElementById('t-join').click());
    await joinPanel(G2, '셋째', code);
    ok('방장이 접속을 끊은 뒤에도 코드로 들어갈 수 있음(월드가 서버에 남아 있음, 서버가 막지 못함)', await started(G2) && (await ev(G2, () => Team.pid())) === pa && Object.keys(server.parties[pa].members).length === 3 && Object.keys(server.parties[pa].state.world || {}).length > 0, `팀원 ${Object.keys(server.parties[pa].members).length}`);
    ok('셋째도 방장이 없는 동안 서버에 남은 월드(방장이 판 덩어리)를 그대로 봄', (await ev(G2, () => Object.keys(G.debug().world).sort())).join() === hostKeys.join() && hostKeys.length > 0, hostKeys.join());
    await closeM(G2);

    // ---------- 5. 진행이 있는 캐릭터는 들어가기 전에 확인한다 ----------
    const R = await open('uR', '진행자2', true);
    await ev(R, () => { const S = G.debug(); S.day = 3; S.qDone = 2; });
    await ev(R, () => document.getElementById('t-join').click()); dismiss.add(R);
    await joinPanel(R, '진행자2', code);
    ok('진행이 있으면 잃는 것을 알려 주고, 취소하면 팀에 들어가지 않고 내 월드로 시작', /진행이 있습니다/.test(dialogs.get(R)[0] || '') && await started(R) && !(await ev(R, () => Team.inParty())) && Object.keys(server.parties[pa].members).length === 3 && (await ev(R, () => G.debug().day)) === 3, JSON.stringify(dialogs.get(R)));
    await closeM(R);
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('친구 초대 시험 통과');
})();
