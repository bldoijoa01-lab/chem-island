// 혼합 접속 시험(13-e): 한 사람은 탑다운 2D(td/), 다른 사람은 1인칭 3D(fp/)로 같은 팀·같은 서버(가짜 서버 tools/fakenet.js)에 접속해
// 팀 만들기·가입, 장치 공유, 허브에서 서로 보임(접속 표시), 팀 간 교류 창이 같은 상태로 열리는지 본다.
// 사용: THREE_MODULE=<three.module.js 경로> node tools/smokemix.js
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright를 찾을 수 없습니다.'); process.exit(2); }
const path = require('path'), { spawn } = require('child_process');
const PORT = 9400 + Math.floor(Math.random() * 300), ROOT = path.resolve(__dirname, '..');
const { server, handle, initScript } = require('./fakenet');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [], checks = [], mod = process.env.THREE_MODULE;
  const ok = (name, cond, extra = '') => { checks.push(name + (cond ? ' ✔' : ' ✘')); if (!cond) errors.push(`점검 실패: ${name} ${extra}`); };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function open(uid, nick, url) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`페이지 에러(${nick}): ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) errors.push(`콘솔 에러(${nick}): ` + m.text()); });
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => (mod && /three\.module\.js/.test(r.request().url())) ? r.fulfill({ path: mod, contentType: 'text/javascript' }) : r.abort());
    server.pages.set(page, new Set());
    await page.exposeFunction('__rpc', (m, a) => handle(page, uid, nick, m, a));
    await page.addInitScript(initScript, { uid, nick });
    await page.goto(`http://127.0.0.1:${PORT}${url}?test`); await sleep(1500);
    await page.click('#t-start'); await sleep(1500);
    if (await page.evaluate(() => !document.getElementById('modal').hidden)) await page.click('#mclose');
    return page;
  }
  try {
    const A = await open('uA', '에이', '/td/index.html'), B = await open('uB', '비이', '/fp/index.html');
    const ev = (pg, f, a) => pg.evaluate(f, a);
    // 1. A(td)가 팀을 만들고 B(fp)가 초대 코드로 들어간다
    await A.click('#teambtn'); await sleep(300);
    await A.fill('#tm-name', '혼합팀'); await A.click('#mbody button.primary'); await sleep(1200);
    const a1 = await ev(A, () => ({ pid: __td.party.pid, code: (__td.party.meta || {}).code }));
    ok('td: 팀 만들기', !!a1.pid && !!a1.code, JSON.stringify(a1));
    await A.click('#mclose'); await sleep(200);
    await B.click('#teambtn'); await sleep(300);
    await B.fill('#tm-code', a1.code); await B.click('#mbody .box:nth-of-type(3) button'); await sleep(2500);
    ok('fp: 같은 팀에 가입', await ev(B, () => __fp.party.pid) === a1.pid && await ev(B, () => Object.keys(__fp.party.members).length) === 2);
    // 2. td가 클릭으로 화덕을 지으면 fp가 본다
    await ev(A, () => { const S = __td.S; for (const k of ['stick', 'sand']) S.inv[k] = 40; __td.pl.startBuild('fire'); });
    await ev(A, () => { __td.p.x = 55; __td.p.z = 33; __td.p.y = 10; }); await sleep(300);
    const sc = await ev(A, () => { const v = __td.view(), c = __td.cam; return [((54 - c.x) * 16 + v.VW / 2) * v.Z, ((32 - c.z) * 16 + v.VH / 2) * v.Z]; });
    await A.mouse.move(sc[0], sc[1]); await sleep(150); await A.mouse.click(sc[0], sc[1]); await sleep(2500);
    ok('td: 클릭으로 화덕 건설', await ev(A, () => __td.S.placed.length) === 1, String(await ev(A, () => document.getElementById('msg').textContent)));
    ok('fp: td가 지은 화덕이 보임(공유 상태)', await ev(B, () => __fp.S.placed.map(d => d.id).join()) === 'fire');
    // 3. 둘 다 허브로: 서로 보인다(td는 스프라이트, fp는 모형). 팀 상태가 같이 옮겨진다
    await ev(A, async () => { await __td.party.ensureActive(); const S = __td.S; S.f.raft = true; S.qDone = 11; G.sail('plaza'); }); await sleep(5000);
    ok('두 화면 모두 허브에 있음', await ev(A, () => __td.islName()) === 'plaza' && await ev(B, () => __fp.islName()) === 'plaza', await ev(A, () => __td.islName()) + '/' + await ev(B, () => __fp.islName()));
    await sleep(1500);
    const pa = await ev(A, () => Object.values(__td.pres.peers).map(q => q.nick)), pb = await ev(B, () => Object.values(__fp.pres.peers).map(q => q.nick));
    ok('td가 fp 사용자를 본다(접속 표시)', pa.includes('비이'), JSON.stringify(pa));
    ok('fp가 td 사용자를 본다(접속 표시)', pb.includes('에이'), JSON.stringify(pb));
    // 4. 팀 간 교류 창은 같은 코드: td에서 간판, fp에서 교역소
    await ev(A, () => HubUI.signs()); await sleep(600);
    ok('td: 팀 간판 창', /팀 간판/.test(await ev(A, () => document.getElementById('mtitle').textContent)));
    await ev(A, () => document.getElementById('mclose').click());
    await ev(B, () => HubUI.trade()); await sleep(600);
    ok('fp: 교역소 창', /교역소/.test(await ev(B, () => document.getElementById('mtitle').textContent)));
    // 5. td에서 허브 시설을 클릭하면 창이 열린다
    await ev(B, () => document.getElementById('mclose').click());
    const t = await ev(A, () => { const o = __td.island().objs.find(o => o.type === 'trade'); __td.p.x = o.x + 1.2; __td.p.z = o.z + 1.2; __td.p.y = __td.ctx.groundAt(__td.p.x, __td.p.z); return { x: o.x, z: o.z }; }); await sleep(300);
    const s2 = await ev(A, ([x, z]) => { const v = __td.view(), c = __td.cam; return [((x - c.x) * 16 + v.VW / 2) * v.Z, ((z - 0.8 - c.z) * 16 + v.VH / 2) * v.Z]; }, [t.x, t.z]);
    await A.mouse.move(s2[0], s2[1]); await sleep(150); await A.mouse.click(s2[0], s2[1]); await sleep(700);
    ok('td: 교역소를 클릭하면 교역소 창이 열린다', /교역소/.test(await ev(A, () => document.getElementById('mtitle').textContent)), await ev(A, () => document.getElementById('mtitle').textContent));
  } finally { await browser.close(); srv.kill(); }
  console.log(checks.join('\n'));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('혼합 접속 시험 통과');
})();
