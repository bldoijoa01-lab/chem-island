// 튜토리얼 첫 5분 안내 (DESIGN.md §4-30 6절): 이동 → 점프 → 코어 문 밖 땅 파기 → 보급 모듈에서 염수 뜨기 → 화덕 → 증류기.
// 상태는 브라우저 설정(localStorage)에만 두고 저장 데이터 S에는 넣지 않는다(끄고 켜기·다시 보기도 같다). 본부가 켜져 있는 모드(HUB_ENABLED)에는 보급 모듈이 없어 쓰지 않는다.
// 화면 연결: game.js의 draw()가 Tutorial.draw(ctx, cam, t)를 부른다(해치 화살표·해치 표지판 위치 갱신). 모든 시간(초)·자리는 가정(임의값)이다.
(() => {
  const KEY = 'chemisle_tut_v1', S = Store.S;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 저장 불가 */ } };
  let st = load();   // { off, moved, jumped, done, started }
  let pos0 = null;
  const HATCH = { x: 5, y: 1 };   // 코어 동쪽 해치 칸(연결 굴이 바로 바깥 x 6..9)
  const STEPS = [
    { id: 'move', est: 10, text: 'A·D(또는 ← →)로 걸어 보세요.', done: () => !!st.moved },
    { id: 'jump', est: 10, text: 'W·스페이스(또는 ↑)로 점프해 보세요.', done: () => !!st.jumped },
    { id: 'dig', est: 30, text: '코어 오른쪽 해치 밖은 단단한 땅이에요. 해치 앞에서 마우스를 꾹 눌러 파세요. (흙은 맨손으로 팔 수 있어요)', done: () => World.tileAt(6, 1) === World.AIR && World.tileAt(6, 2) === World.AIR },
    { id: 'brine', est: 40, text: '판 굴을 따라 보급 모듈로 가세요. 모듈의 물웅덩이 옆에서 E를 눌러 염수를 뜨세요.', done: () => !!S.f.sea },
    { id: 'fire', est: 60, text: '오른쪽 위 망치(건설) 아이콘 → 화덕을 모듈의 평평한 바닥에 지으세요.', done: () => !!S.f.fire },
    { id: 'still', est: 120, text: '화덕 바로 옆에 증류기를 짓고, 증류기를 열어 염수를 넣고 가열하세요. 재료가 모자라면 모듈의 재배 선반(나무)·모래 층에서 E로 모으고, 제작 메뉴에서 유리병(모래 3 + 나뭇가지 1)을 만드세요.', done: () => S.placed.some(d => d.id === 'still') },
  ];
  const active = () => !Sim.hubOn() && Sim.dockOf(S).island === 'start';
  const cur = () => { for (let i = 0; i < STEPS.length; i++) if (!STEPS[i].done()) return i; return STEPS.length; };

  // ---- DOM ----
  const box = document.createElement('div'); box.id = 'tut'; box.hidden = true;
  const chip = document.createElement('button'); chip.id = 'tut-chip'; chip.textContent = '안내'; chip.title = '첫 5분 안내 켜기'; chip.hidden = true;
  const sign = document.createElement('div'); sign.id = 'hatch-sign'; sign.hidden = true; sign.textContent = '문 밖은 단단한 땅 — 마우스를 꾹 눌러 파세요';
  document.body.append(box, chip, sign);
  chip.onclick = () => { st.off = false; st.done = false; delete st.finishedAt; persist(); render(true); };
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'off') { st.off = true; persist(); render(true); }
    if (b.dataset.a === 'again') { reset(); }
  });
  function reset() { st = { off: false, moved: false, jumped: false, done: false, started: true }; pos0 = null; persist(); render(true); }   // 이미 한 일(굴 파기·염수·화덕 등)은 상태로 판단하므로 해당 단계는 바로 넘어간다

  // ---- 입력 관찰(점프) ----
  window.addEventListener('keydown', e => {
    if (!document.getElementById('modal').hidden || !document.getElementById('title').hidden) return;
    if (['w', 'arrowup', ' '].includes(e.key.toLowerCase()) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) { if (!st.jumped) { st.jumped = true; persist(); } }
  });

  let lastHtml = '';
  function render(force) {
    const hidden = !active() || !document.getElementById('title').hidden || !document.getElementById('auth').hidden;
    if (hidden) { box.hidden = chip.hidden = sign.hidden = true; return; }
    const i = cur();
    if (st.off || st.done) { box.hidden = true; chip.hidden = !st.off; return; }
    chip.hidden = true;
    let html;
    if (i >= STEPS.length) {
      html = '<b>첫 5분 안내를 마쳤어요!</b> 이제 화면 왼쪽 위 목표 목록을 따라가세요. <span class="mut">(도움말에서 다시 볼 수 있어요)</span><div class="row"><button data-a="off">닫기</button><button data-a="again">처음부터 다시 보기</button></div>';
      if (!st.finishedAt) { st.finishedAt = Date.now(); persist(); }
      if (Date.now() - st.finishedAt > 12000) { st.done = true; persist(); box.hidden = true; return; }
    } else {
      const dots = STEPS.map((s, k) => `<i class="${k < i ? 'ok' : k === i ? 'now' : ''}"></i>`).join('');
      html = `<div class="dots">${dots}</div><b>${i + 1}/${STEPS.length}</b> ${STEPS[i].text}<div class="row"><button data-a="off">안내 끄기</button><button data-a="again">처음부터 다시 보기</button></div>`;
    }
    if (force || html !== lastHtml) { box.innerHTML = html; lastHtml = html; }
    box.hidden = false;
  }

  // 화면: 해치 화살표·표지판(월드 좌표 → 화면 좌표). game.js draw()가 매 프레임 부른다
  function draw(ctx, cam, t) {
    if (!active()) { sign.hidden = true; return; }
    if (pos0 === null) pos0 = S.px;
    if (!st.moved && Math.abs(S.px - pos0) >= 48) { st.moved = true; persist(); }
    if (!st.started) { st.started = true; if (S.qDone > 0 || S.f.sea || S.f.fire || S.placed.length) { st.off = true; st.done = true; } persist(); }   // 이미 시작한 저장은 안내를 켜지 않는다
    const needSign = World.tileAt(6, 1) !== World.AIR && !st.off;   // 연결 굴을 파기 전
    const near = Math.hypot(S.px / 16 - HATCH.x, S.py / 16 - HATCH.y) < 9;
    if (needSign && near && SideGame.cam) {
      const c = SideGame.cam(), k = SideGame.scale();
      sign.style.left = Math.round(((HATCH.x + 1) * 16 - c.x) * k) + 'px'; sign.style.top = Math.round((HATCH.y * 16 - 8 - c.y) * k) + 'px'; sign.hidden = false;
    } else sign.hidden = true;
    if (!st.off && !st.done && cur() === 2) {   // 3단계(땅 파기): 해치 바깥 칸 위에 화살표
      const ax = Math.round((HATCH.x + 1) * 16 + 8 - cam.x), ay = Math.round(HATCH.y * 16 - 4 - cam.y + Math.sin(t * 6) * 2);
      ctx.fillStyle = '#000'; ctx.fillRect(ax - 4, ay - 1, 9, 3); ctx.fillRect(ax - 3, ay + 2, 7, 2); ctx.fillRect(ax - 1, ay + 4, 3, 2);
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(ax - 3, ay, 7, 1); ctx.fillRect(ax - 2, ay + 2, 5, 1); ctx.fillRect(ax, ay + 4, 1, 1);
    }
  }
  setInterval(() => render(false), 500);

  window.Tutorial = {
    draw, reset, STEPS, cur,
    isOff: () => !!st.off, setOff(v) { st.off = !!v; if (!v) st.done = false; persist(); render(true); },
    state: () => Object.assign({}, st),
  };
})();
