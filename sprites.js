// 픽셀 아트: 모든 그림을 코드로 직접 그린다(외부 이미지 없음). 1 타일 = 16x16 픽셀.
window.Art = (() => {
  const T = 16;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const A = { T, tiles: {}, obj: {}, dev: {}, icon: {}, iconURL: {} };

  // 문자 지도 → 캔버스 (8x8 아이콘 등)
  function fromMap(rows, pal) {
    const c = mk(rows[0].length, rows.length), x = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); } }));
    return c;
  }
  // 사각형으로 그리는 작은 도구
  const painter = (c) => { const x = c.getContext('2d'); return (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); }; };

  // ---------- 타일 (노이즈 질감) ----------
  function noiseTile(base, specks, seed, n = 26) {
    const c = mk(T, T), p = painter(c), r = rng(seed);
    p(0, 0, T, T, base);
    for (let i = 0; i < n; i++) p((r() * T) | 0, (r() * T) | 0, 1 + ((r() * 2) | 0), 1, specks[(r() * specks.length) | 0]);
    return c;
  }
  const variants = (fn, k = 3) => Array.from({ length: k }, (_, i) => fn(i + 1));
  A.tiles.dirt = variants(i => noiseTile('#7b5233', ['#6a4328', '#8c5f3a', '#5e3b22'], 11 * i));
  A.tiles.stone = variants(i => { const c = noiseTile('#7d838c', ['#6b717a', '#8f959e', '#5d636b'], 23 * i, 30); const p = painter(c); p(3, 5, 2, 1, '#565c64'); p(10, 11, 3, 1, '#565c64'); return c; });
  A.tiles.sand = variants(i => noiseTile('#e6d08e', ['#d9bf6f', '#f0dca2', '#cdb35c'], 31 * i));
  A.tiles.snow = variants(i => { const c = noiseTile('#e9f2f8', ['#d3e3ee', '#ffffff'], 41 * i, 14); return c; });
  A.tiles.ice = variants(i => { const c = noiseTile('#9fd8ef', ['#c8ecf9', '#82c4e0', '#ffffff'], 53 * i, 20); const p = painter(c); p(2, 3, 5, 1, '#e8f8ff'); p(9, 9, 4, 1, '#e8f8ff'); return c; });
  A.tiles.grass = variants(i => {
    const c = noiseTile('#7b5233', ['#6a4328', '#8c5f3a'], 61 * i, 16), p = painter(c), r = rng(7 * i);
    p(0, 0, T, 4, '#4caa3c'); p(0, 3, T, 1, '#3a8a2e');
    for (let k = 0; k < 6; k++) { const x = (r() * T) | 0; p(x, 4, 1, 1 + ((r() * 2) | 0), '#3a8a2e'); }
    for (let k = 0; k < 4; k++) p((r() * T) | 0, (r() * 3) | 0, 1, 1, '#6cd05a');
    return c;
  });
  A.tiles.snowtop = variants(i => { const c = noiseTile('#7b5233', ['#6a4328'], 71 * i, 10), p = painter(c); p(0, 0, T, 4, '#f4fafd'); p(0, 3, T, 1, '#cfe2ee'); return c; });
  A.tiles.sandtop = A.tiles.sand;

  // ---------- 오브젝트 (자원 노드) ----------
  A.obj.tree = (() => {
    const c = mk(32, 48), p = painter(c), r = rng(5);
    p(13, 24, 6, 24, '#6b4423'); p(13, 24, 2, 24, '#7d5230'); p(17, 24, 2, 24, '#593818'); p(11, 44, 10, 4, '#6b4423');
    const leaf = ['#2f8f3a', '#3da64a', '#277a31'];
    for (let y = 2; y < 30; y++) { const w = Math.round(10 + 7 * Math.sin((y - 2) / 28 * Math.PI)); const x0 = 16 - w; for (let x = 0; x < w * 2; x += 2) p(x0 + x, y, 2, 1, leaf[(r() * 3) | 0]); }
    for (let i = 0; i < 12; i++) p(6 + ((r() * 20) | 0), 6 + ((r() * 20) | 0), 2, 2, '#58c25f');
    return c;
  })();
  A.obj.cane = (() => {
    const c = mk(16, 32), p = painter(c);
    for (const [x, h] of [[3, 26], [7, 32], [11, 22]]) { p(x, 32 - h, 2, h, '#7cc24a'); for (let y = 32 - h + 3; y < 32; y += 5) p(x, y, 2, 1, '#4f8f2c'); p(x - 2, 32 - h + 2, 2, 1, '#9ad760'); p(x + 2, 32 - h + 4, 2, 1, '#9ad760'); }
    return c;
  })();
  A.obj.wheat = (() => {
    const c = mk(16, 20), p = painter(c);
    for (const x of [2, 5, 8, 11, 14]) { p(x, 6, 1, 14, '#b9a34a'); p(x - 1, 2, 3, 2, '#e8c64a'); p(x, 0, 1, 2, '#e8c64a'); p(x - 1, 4, 3, 1, '#d1ac33'); }
    return c;
  })();
  A.obj.sandpile = (() => {
    const c = mk(16, 8), p = painter(c);
    p(2, 5, 12, 3, '#d9bf6f'); p(4, 3, 8, 2, '#e6d08e'); p(6, 1, 4, 2, '#f0dca2'); p(0, 7, 16, 1, '#cdb35c'); p(5, 4, 1, 1, '#fff2c0');
    return c;
  })();
  A.obj.icecrystal = (() => {
    const c = mk(16, 24), p = painter(c);
    p(6, 0, 4, 4, '#dff6ff'); p(4, 4, 8, 6, '#bfe9fa'); p(2, 10, 12, 8, '#9fd8ef'); p(0, 18, 16, 6, '#82c4e0');
    p(6, 2, 1, 14, '#ffffff'); p(10, 8, 1, 9, '#e8f8ff'); p(3, 12, 1, 8, '#c8ecf9');
    return c;
  })();
  A.obj.box = (() => {
    const c = mk(16, 16), p = painter(c);
    p(1, 4, 14, 12, '#a9743b'); p(1, 4, 14, 2, '#c58c4d'); p(1, 8, 14, 1, '#7a4f25'); p(1, 13, 14, 1, '#7a4f25');
    p(0, 3, 16, 2, '#6e4720'); p(6, 7, 4, 4, '#e8c64a'); p(7, 8, 2, 2, '#8a6a10'); p(1, 5, 1, 11, '#7a4f25'); p(14, 5, 1, 11, '#7a4f25');
    return c;
  })();

  // ---------- 장치 (32x32 = 2x2 타일) ----------
  function dev(fn) { const c = mk(32, 32); fn(painter(c)); return c; }
  A.dev.fire = dev(p => {      // 모닥불(화덕): 돌 + 장작. 불꽃은 따로 애니메이션
    for (const [x, y] of [[2, 24], [7, 26], [12, 27], [17, 27], [22, 26], [26, 24]]) { p(x, y, 5, 5, '#8a8f99'); p(x, y, 5, 1, '#aab0ba'); p(x, y + 4, 5, 1, '#5d636b'); }
    p(6, 22, 20, 3, '#6b4423'); p(8, 20, 16, 3, '#8c5a2b'); p(6, 22, 20, 1, '#a9743b');
    p(5, 21, 3, 3, '#3b2412'); p(24, 21, 3, 3, '#3b2412');
  });
  A.dev.still = dev(p => {     // 증류기: 화로 받침 + 구리 플라스크 + 응축관 + 수집병
    p(1, 26, 19, 5, '#7a4f25'); p(1, 26, 19, 1, '#a9743b'); p(1, 30, 19, 1, '#4a2f14');
    p(4, 11, 13, 15, '#b87333'); p(4, 11, 13, 2, '#d9955a'); p(4, 24, 13, 2, '#8a5424'); p(6, 13, 2, 9, '#e0a46a');
    p(6, 4, 9, 7, '#b87333'); p(7, 4, 7, 2, '#d9955a'); p(8, 1, 5, 3, '#9a6128');
    p(13, 2, 11, 2, '#c9ccd2'); p(22, 2, 2, 12, '#c9ccd2'); p(21, 13, 4, 2, '#9ea2aa');
    p(23, 17, 8, 13, '#bfe8dd'); p(23, 17, 8, 2, '#e8fbf5'); p(25, 22, 4, 7, '#4aa3df'); p(24, 30, 6, 1, '#6fb7a6'); p(25, 15, 4, 2, '#8b5a2b');
  });
  A.dev.cooker = dev(p => {    // 압력 밥솥: 몸통 + 뚜껑 + 손잡이 + 추 + 압력계
    p(4, 28, 24, 3, '#3a3f47'); p(3, 12, 26, 16, '#aeb4bd'); p(3, 12, 26, 2, '#d3d8df'); p(3, 26, 26, 2, '#7f8691'); p(6, 14, 3, 11, '#d3d8df');
    p(2, 9, 28, 4, '#8f96a1'); p(2, 9, 28, 1, '#c3c9d1'); p(0, 16, 4, 4, '#3a3f47'); p(28, 16, 4, 4, '#3a3f47');
    p(13, 4, 6, 5, '#3a3f47'); p(14, 2, 4, 2, '#1f2329'); p(12, 5, 8, 1, '#5b616b');
    p(19, 16, 8, 8, '#f4f6f8'); p(20, 17, 6, 6, '#2c3038'); p(22, 18, 1, 3, '#e74c3c'); p(21, 21, 3, 1, '#e74c3c');
    p(8, 28, 16, 1, '#6a707a');
  });
  A.dev.cooler = dev(p => {    // 냉각 상자: 파란 상자 + 흰 뚜껑 + 눈꽃 + 서리
    p(2, 12, 28, 18, '#2f78c4'); p(2, 12, 28, 2, '#5da3e8'); p(2, 28, 28, 2, '#1f5a96'); p(2, 12, 2, 18, '#3f8ad6');
    p(0, 8, 32, 6, '#e8f0f7'); p(0, 8, 32, 1, '#ffffff'); p(0, 13, 32, 1, '#aebdca'); p(12, 5, 8, 3, '#8f9fae'); p(13, 4, 6, 1, '#c3ced8');
    p(15, 17, 2, 9, '#ffffff'); p(11, 21, 10, 1, '#ffffff'); p(12, 18, 1, 1, '#ffffff'); p(19, 18, 1, 1, '#ffffff'); p(12, 24, 1, 1, '#ffffff'); p(19, 24, 1, 1, '#ffffff');
    p(5, 14, 3, 2, '#cfeaf8'); p(24, 16, 2, 2, '#cfeaf8'); p(0, 30, 32, 2, '#bfe9fa');
  });
  A.dev.collector = dev(p => { // 기체 포집기: 유리 단지 + 거품 + 주사기
    p(4, 8, 16, 22, '#cfe9f5'); p(4, 8, 16, 2, '#ffffff'); p(6, 10, 12, 18, '#a9d5ec'); p(6, 10, 2, 16, '#e1f3fb'); p(2, 6, 20, 3, '#8f9fae'); p(4, 29, 16, 2, '#5d7a8f');
    for (const [x, y] of [[9, 22], [13, 18], [10, 15], [15, 25], [12, 12]]) p(x, y, 2, 2, '#ffffff');
    p(22, 14, 8, 3, '#dfe8ef'); p(22, 14, 8, 1, '#ffffff'); p(30, 12, 2, 7, '#556270'); p(14, 15, 8, 2, '#aebdca'); p(20, 15, 3, 3, '#aebdca'); p(22, 17, 6, 1, '#7fc4e6');
    p(0, 31, 32, 1, '#3a3f47');
  });
  A.dev.altar = dev(p => {     // 솥 골렘 제단(조각상)
    p(2, 26, 28, 6, '#6b717a'); p(2, 26, 28, 2, '#8f959e'); p(6, 22, 20, 5, '#7d838c');
    p(6, 6, 20, 17, '#5d636b'); p(6, 6, 20, 2, '#8f959e'); p(4, 10, 24, 10, '#6b717a'); p(4, 10, 24, 1, '#9aa0a9');
    p(9, 12, 4, 4, '#ffb347'); p(19, 12, 4, 4, '#ffb347'); p(10, 13, 2, 2, '#fff1c0'); p(20, 13, 2, 2, '#fff1c0'); p(11, 19, 10, 2, '#2f3338');
    p(10, 2, 12, 5, '#4a4f56'); p(12, 0, 8, 3, '#3a3f47'); p(0, 12, 4, 6, '#5d636b'); p(28, 12, 4, 6, '#5d636b');
  });

  // ---------- 아이콘 (8x8) ----------
  const I = (rows, pal) => fromMap(rows, pal);
  A.icon.stick = I(['......bB', '.....bB.', '....bB..', '...bB...', '..bB....', '.bB.....', 'bB......', 'B.......'], { b: '#a9743b', B: '#6e4720' });
  A.icon.sand = I(['........', '........', '...ss...', '..sSSs..', '.sSSSSs.', 'sSSsSSSs', 'SSSSSSSS', 'dddddddd'], { s: '#f0dc9a', S: '#d9bf6f', d: '#b89a4c' });
  A.icon.sea = I(['.hhhhhh.', 'h......h', 'bbbbbbbb', 'bwwwwwwb', 'bwWwwwwb', 'bwwwwWwb', '.bwwwwb.', '..bbbb..'], { b: '#7a8aa3', w: '#3b8fd4', W: '#8cc8f5', h: '#5b6b84' });
  A.icon.ice = I(['........', '.cccccc.', 'cCCCCCCc', 'cCwCCCCc', 'cCCCCwCc', 'cCCCCCCc', '.cccccc.', '........'], { c: '#7fc4e6', C: '#bfe9fa', w: '#ffffff' });
  A.icon.bottle = I(['...bb...', '...gg...', '..gGGg..', '.gGGGGg.', '.gGwGGg.', '.gGGGGg.', '.gGGGGg.', '..gggg..'], { g: '#6fb7a6', G: '#bfe8dd', w: '#ffffff', b: '#8b5a2b' });
  A.icon.syringe = I(['........', '..k.....', '..kkbbbb', 'kkkgggg.', 'kkkgggg.', '..kkbbbb', '..k.....', '........'], { k: '#556270', g: '#7fc4e6', b: '#dfe8ef' });
  A.icon.sugar = I(['........', '.wwwww..', 'wWWWWWw.', 'wWpWWWw.', 'wWWWpWw.', 'wWWWWWw.', '.wwwwww.', '........'], { w: '#ffffff', W: '#f4f0f5', p: '#f0b6d0' });
  A.icon.salt = I(['........', '...w....', '..wWw...', '.wWWWw.w', 'wWWWWwWw', 'wWWwWWWw', 'wwwwwwww', '........'], { w: '#c9d4e0', W: '#ffffff' });
  A.icon.water = I(['...bb...', '...bb...', '..bbbb..', '.bbwbbb.', '.bwbbbb.', '.bbbbbb.', '..bbbb..', '........'], { b: '#3b8fd4', w: '#bfe6ff' });
  A.icon.noodle = I(['..yyyy..', '.yYyyYy.', 'yyYyyYyy', '.yyyyyy.', 'yYyyYyyy', '.yyYyyy.', '..yyyy..', '........'], { y: '#e8c25a', Y: '#b58a2a' });
  A.icon.ramen = I(['.s..s...', '..s..s..', 'yyyyyyyy', 'yYyEyyYy', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...'], { s: '#dfe8ef', y: '#e8c25a', Y: '#b58a2a', E: '#ffffff', r: '#c0392b' });
  A.icon.cap = I(['...ww...', '..wWWw..', '.wWWWWw.', '.wppppw.', '.wppppw.', '.wPPPPw.', '..wPPw..', '...ww...'], { w: '#ccd4dc', W: '#e8f4fb', p: '#e74c3c', P: '#c0392b' });
  A.icon.pack = I(['..bbbb..', '.bCCCCb.', 'bCwCCCCb', 'bCCCwCCb', 'bCCCCCCb', 'bCwCCCCb', '.bCCCCb.', '..bbbb..'], { b: '#2a6fb0', C: '#8fd0f5', w: '#ffffff' });
  A.icon.fire = I(['...r....', '..rr..r.', '..rOr.rr', '.rOOrrOr', '.rOYOOOr', 'rOYYYOOr', 'rOYYYYOr', '.rrOOrr.'], { r: '#e8541c', O: '#ff9a2e', Y: '#ffe066' });
  A.icon.still = A.dev.still; A.icon.cooker = A.dev.cooker; A.icon.cooler = A.dev.cooler; A.icon.collector = A.dev.collector;
  for (const k in A.icon) A.iconURL[k] = A.icon[k].toDataURL();

  // ---------- 플레이어 (연구원: 흰 가운 + 고글) ----------
  A.player = (frame) => {
    const c = mk(16, 20), p = painter(c);
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    p(4, 0, 8, 3, '#5a3a22'); p(4, 3, 8, 5, '#f2c9a0'); p(4, 2, 8, 1, '#5a3a22');
    p(4, 3, 8, 2, '#3ec1d3'); p(5, 3, 2, 2, '#d9f7fb'); p(9, 3, 2, 2, '#d9f7fb'); p(8, 4, 1, 1, '#1f6e78');   // 고글
    p(3, 8, 10, 7, '#f4f6f8'); p(3, 8, 10, 1, '#ffffff'); p(7, 9, 2, 6, '#c9d2dc'); p(3, 14, 10, 1, '#c9d2dc');
    p(2, 9, 2, 5, '#f4f6f8'); p(12, 9, 2, 5, '#f4f6f8'); p(2, 13, 2, 2, '#f2c9a0'); p(12, 13, 2, 2, '#f2c9a0');
    p(5 + step, 15, 3, 4, '#3b4a6b'); p(8 - step, 15, 3, 4, '#3b4a6b'); p(5 + step, 19, 3, 1, '#2a2f3a'); p(8 - step, 19, 3, 1, '#2a2f3a');
    return c;
  };
  A.playerFrames = [A.player(0), A.player(1), A.player(2)];

  // ---------- 불꽃 (애니메이션, 세기 1~4) ----------
  A.flame = (ctx, x, y, level, t) => {
    if (level <= 0) return;
    const h = 5 + level * 4, w = 4 + level * 3, f = Math.floor(t * 8) % 2;
    const draw = (col, ww, hh, dx) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x + 16 - ww / 2 + dx), Math.round(y + 22 - hh), ww, hh); };
    draw('#e8541c', w, h, 0); draw('#ff9a2e', w - 3, h - 3, f ? 1 : -1); draw('#ffe066', Math.max(2, w - 7), h - 6, 0);
    ctx.fillStyle = '#ff9a2e'; ctx.fillRect(Math.round(x + 14 + (f ? 3 : -3)), Math.round(y + 22 - h - 3), 2, 2);
  };

  // ---------- 골렘 (보스 화면용, 64x64 픽셀) ----------
  A.drawGolem = (canvas, phase, hp = 1) => {
    canvas.width = 64; canvas.height = 64;
    const x = canvas.getContext('2d'), p = painter(canvas); x.clearRect(0, 0, 64, 64);
    const eye = phase === 1 ? '#7fd1ff' : phase === 2 ? '#ff7a3d' : '#b57aff';
    p(6, 50, 52, 12, '#4a4f56'); p(8, 48, 48, 4, '#6b717a');
    p(8, 14, 48, 38, '#5d636b'); p(8, 14, 48, 3, '#9aa0a9'); p(4, 22, 56, 24, '#6b717a'); p(4, 22, 56, 2, '#9aa0a9'); p(8, 44, 48, 4, '#4a4f56');
    p(16, 26, 10, 10, eye); p(38, 26, 10, 10, eye); p(19, 29, 4, 4, '#ffffff'); p(41, 29, 4, 4, '#ffffff');
    p(20, 40, 24, 3, '#2f3338'); for (let i = 0; i < 6; i++) p(22 + i * 4, 40, 2, 3, '#e8e8e8');
    p(18, 6, 28, 9, '#3a3f47'); p(22, 2, 20, 5, '#2f3338'); p(0, 26, 6, 14, '#5d636b'); p(58, 26, 6, 14, '#5d636b');
    if (phase === 1) { for (let i = 0; i < 4; i++) { p(14 + i * 12, 0, 6, 3, 'rgba(160,215,255,.8)'); } p(6, 8, 52, 3, 'rgba(120,190,255,.55)'); }   // 증기 방어막
    if (phase === 2) { for (let i = 0; i < 5; i++) p(10 + i * 10, 4 - (i % 2) * 3, 4, 8, '#ff7a3d'); p(10, 12, 44, 2, '#ffb347'); }              // 끓어 넘침
    if (phase === 3) { for (let i = 0; i < 5; i++) p(4 + i * 12, 55, 5, 5, 'rgba(180,130,255,.85)'); }                                              // 가스
    p(8, 56, 48, 2, '#2f3338');
    p(8, 62, 48, 2, '#2f3338');
    // 체력 바(픽셀)
    p(4, 62, 56, 2, '#222'); p(4, 62, Math.max(0, Math.round(56 * hp)), 2, '#e74c3c');
  };

  // ---------- 하늘/배경 ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixArr = (c1, c2, t) => { const a = hex(c1), b = hex(c2); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
  // 시각(0~24)에 따른 하늘색을 n개의 가로 띠(픽셀 느낌)로 돌려준다
  A.sky = (hour, n) => {
    const key = [[0, '#0a1030', '#1b2a5a'], [5, '#0a1030', '#2a2f6a'], [6.5, '#e0764a', '#f7c97a'], [8, '#4aa8e8', '#bfe6ff'], [17, '#4aa8e8', '#bfe6ff'], [19, '#d9603c', '#f5a65b'], [21, '#0a1030', '#1b2a5a'], [24, '#0a1030', '#1b2a5a']];
    let top = hex(key[0][1]), bot = hex(key[0][2]);
    for (let i = 0; i < key.length - 1; i++) {
      if (hour >= key[i][0] && hour <= key[i + 1][0]) { const t = (hour - key[i][0]) / (key[i + 1][0] - key[i][0]); top = mixArr(key[i][1], key[i + 1][1], t); bot = mixArr(key[i][2], key[i + 1][2], t); break; }
    }
    return Array.from({ length: n }, (_, i) => { const f = i / (n - 1); return `rgb(${Math.round(lerp(top[0], bot[0], f))},${Math.round(lerp(top[1], bot[1], f))},${Math.round(lerp(top[2], bot[2], f))})`; });
  };
  // 먼 산/가까운 언덕 띠 (가로로 이어 붙임)
  function ridge(w, h, base, amp, col, col2, seed) {
    const c = mk(w, h), p = painter(c), r = rng(seed); let y = base;
    for (let x = 0; x < w; x += 2) { y += (r() - 0.5) * 3; y += (base - y) * 0.06; const top = Math.round(y - amp * Math.sin(x / w * Math.PI * 4)); p(x, top, 2, h - top, col); p(x, top, 2, 2, col2); }
    return c;
  }
  A.farHills = ridge(512, 120, 70, 22, '#6f9fb8', '#8fb9cf', 3);
  A.nearHills = ridge(512, 120, 84, 12, '#4f8f5c', '#6fb274', 9);
  A.cloud = (() => { const c = mk(32, 12), p = painter(c); p(6, 4, 22, 6, '#ffffff'); p(2, 6, 10, 5, '#ffffff'); p(12, 1, 10, 6, '#ffffff'); p(20, 3, 10, 6, '#f4faff'); p(2, 10, 28, 1, '#dbe9f4'); return c; })();
  A.sun = (() => { const c = mk(16, 16), p = painter(c); p(4, 0, 8, 16, '#ffe066'); p(0, 4, 16, 8, '#ffe066'); p(2, 2, 12, 12, '#ffe066'); p(5, 5, 6, 6, '#fff3a8'); return c; })();
  A.moon = (() => { const c = mk(16, 16), p = painter(c); p(4, 0, 8, 16, '#e8ecf5'); p(0, 4, 16, 8, '#e8ecf5'); p(2, 2, 12, 12, '#e8ecf5'); p(9, 3, 3, 3, '#c5cbe0'); p(4, 9, 3, 3, '#c5cbe0'); p(8, 9, 2, 2, '#c5cbe0'); return c; })();

  return A;
})();
