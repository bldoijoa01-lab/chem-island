// 픽셀 아트: 모든 그림을 코드로 직접 그린다(외부 이미지 없음). 1 타일 = 16x16 픽셀.
// 스프라이트에는 1픽셀 어두운 외곽선을 자동으로 둘러(img.pad = 1) 테라리아 같은 또렷한 느낌을 낸다.
window.Art = (() => {
  const T = 16, OUT = '#16131f';
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const A = { T, tiles: {}, obj: {}, dev: {}, icon: {}, iconURL: {} };
  const painter = (c) => { const x = c.getContext('2d'); return (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); }; };
  function fromMap(rows, pal) {
    const c = mk(rows[0].length, rows.length), x = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); } }));
    return c;
  }
  function outline(c, col = OUT) {
    const w = c.width, h = c.height, o = mk(w + 2, h + 2), ox = o.getContext('2d');
    const src = c.getContext('2d').getImageData(0, 0, w, h).data;
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 40;
    ox.fillStyle = col;
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) { if (op(x, y)) continue; if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) ox.fillRect(x + 1, y + 1, 1, 1); }
    ox.drawImage(c, 1, 1); o.pad = 1; return o;
  }
  A.outline = outline;

  // ---------- 타일 (덩어리 질감 + 하이라이트) ----------
  // 같은 색 2~3픽셀 덩어리를 흩뿌려 '손으로 찍은' 느낌을 낸다
  function clumps(p, r, cols, n, minS = 1, maxS = 3) {
    for (let i = 0; i < n; i++) p((r() * 16) | 0, (r() * 16) | 0, minS + ((r() * (maxS - minS + 1)) | 0), 1 + ((r() * 2) | 0), cols[(r() * cols.length) | 0]);
  }
  const variants = (fn, k = 3) => Array.from({ length: k }, (_, i) => fn(i + 1));
  const dirtBase = (i, p, r) => {
    p(0, 0, 16, 16, '#8a5a35'); clumps(p, r, ['#774a2a', '#6a4025', '#9d6a40', '#a97746'], 22, 2, 4);
    for (let k = 0; k < 3; k++) { const x = (r() * 13) | 0, y = (r() * 13) | 0; p(x, y, 2, 2, '#b3a595'); p(x, y, 1, 1, '#d3c7b8'); }   // 자갈
    p((r() * 10) | 0, 8 + ((r() * 6) | 0), 4, 1, '#5c3a20');                                                                         // 뿌리
  };
  A.tiles.dirt = variants(i => { const c = mk(16, 16), p = painter(c), r = rng(11 * i); dirtBase(i, p, r); return c; });
  // 뗏목 바닥: 나무판자(16x16)
  A.tiles.raft = variants(i => {
    const c = mk(16, 16), p = painter(c), r = rng(41 * i);
    p(0, 0, 16, 16, '#9a6a3a'); p(0, 0, 16, 2, '#c58c4d'); p(0, 15, 16, 1, '#5a3a1c');
    for (let y = 5; y < 16; y += 5) p(0, y, 16, 1, '#6b4423');                                   // 판자 틈
    for (let k = 0; k < 4; k++) { const x = (r() * 12) | 0, y = ((r() * 3) | 0) * 5 + 2; p(x, y, 3, 1, '#b57d44'); p(x + 5, y + 2, 2, 1, '#855628'); }   // 결
    p(1, 3, 1, 1, '#3b2412'); p(14, 8, 1, 1, '#3b2412'); p(1, 13, 1, 1, '#3b2412');           // 못
    return c;
  });
  A.tiles.stone = variants(i => {
    const c = mk(16, 16), p = painter(c), r = rng(23 * i);
    p(0, 0, 16, 16, '#8b919c'); clumps(p, r, ['#777d89', '#6a707c', '#9ca2ae', '#a9afba'], 26, 2, 5);
    const x = (r() * 8) | 0, y = 3 + ((r() * 8) | 0); p(x, y, 3, 1, '#4f555f'); p(x + 3, y + 1, 3, 1, '#4f555f'); p(x + 5, y + 2, 2, 1, '#4f555f');   // 균열
    p(1, 1, 2, 1, '#bcc2cd'); return c;
  });
  A.tiles.sand = variants(i => {
    const c = mk(16, 16), p = painter(c), r = rng(31 * i);
    p(0, 0, 16, 16, '#ead69a'); clumps(p, r, ['#dfc684', '#f3e4b0', '#d3b873'], 18, 1, 3);
    for (let k = 0; k < 3; k++) { const y = 2 + ((r() * 12) | 0), x = (r() * 8) | 0; p(x, y, 5, 1, '#f7ebc0'); p(x + 1, y + 1, 5, 1, '#d6bb77'); }   // 물결 무늬
    return c;
  });
  A.tiles.snow = variants(i => { const c = mk(16, 16), p = painter(c), r = rng(41 * i); p(0, 0, 16, 16, '#eef6fb'); clumps(p, r, ['#d5e6f2', '#c2d9ea', '#ffffff'], 18, 1, 3); return c; });
  A.tiles.snowtop = variants(i => {
    const c = mk(16, 16), p = painter(c), r = rng(71 * i); dirtBase(i, p, r);
    p(0, 0, 16, 4, '#f7fbfe'); p(0, 4, 16, 1, '#dcebf6');
    for (let x = 0; x < 16; x += 2) if (r() < 0.6) p(x, 4, 2, 1 + ((r() * 2) | 0), '#f0f8fd'); clumps(p, r, ['#dcebf6'], 3, 1, 2); p(2, 1, 1, 1, '#ffffff'); p(9, 2, 1, 1, '#ffffff');
    return c;
  });
  A.tiles.ice = variants(i => {
    const c = mk(16, 16), p = painter(c), r = rng(53 * i);
    p(0, 0, 16, 16, '#a9ddf3'); clumps(p, r, ['#92cfea', '#bdeaf9', '#7fc0de'], 18, 2, 5);
    for (let k = 0; k < 2; k++) { const x = (r() * 8) | 0, y = (r() * 10) | 0; p(x, y + 3, 1, 1, '#f4fcff'); p(x + 1, y + 2, 1, 1, '#f4fcff'); p(x + 2, y + 1, 1, 1, '#f4fcff'); p(x + 3, y, 1, 1, '#f4fcff'); }   // 빛줄기
    return c;
  });
  A.tiles.grass = variants(i => {
    const c = mk(16, 16), p = painter(c), r = rng(61 * i); dirtBase(i, p, r);
    p(0, 0, 16, 5, '#58b447'); p(0, 0, 16, 2, '#74d05c'); p(0, 4, 16, 1, '#3f8f35'); p(0, 5, 16, 1, '#3f8f35');
    for (let k = 0; k < 7; k++) { const x = (r() * 16) | 0; p(x, 5, 1, 1 + ((r() * 3) | 0), '#3f8f35'); }                // 늘어진 풀
    for (let k = 0; k < 5; k++) p((r() * 16) | 0, (r() * 4) | 0, 1, 1, '#9be37e');
    return c;
  });
  A.tiles.wall = variants(i => { const c = mk(16, 16), p = painter(c), r = rng(83 * i); p(0, 0, 16, 16, '#43301f'); clumps(p, r, ['#392819', '#4e3924', '#33231a'], 20, 2, 4); return c; });
  A.tiles.sandtop = A.tiles.sand;

  // 장식: 풀 다발, 꽃, 돌
  A.tuft = variants(i => { const c = mk(16, 6), p = painter(c), r = rng(91 * i); for (let k = 0; k < 6; k++) { const x = 1 + ((r() * 13) | 0), h = 2 + ((r() * 4) | 0); p(x, 6 - h, 1, h, k % 2 ? '#4aa43b' : '#67c24f'); p(x - 1, 6 - h, 1, 1, '#8bdc6c'); } return c; });
  A.flower = ['#ff6b6b', '#ffd84a', '#c792ff'].map(col => { const c = mk(5, 7), p = painter(c); p(2, 3, 1, 4, '#3f8f35'); p(1, 2, 3, 1, col); p(2, 1, 1, 3, col); p(2, 2, 1, 1, '#fff2a8'); return c; });
  A.rock = (() => { const c = mk(8, 5), p = painter(c); p(1, 2, 6, 3, '#8b919c'); p(2, 1, 4, 1, '#a9afba'); p(1, 4, 6, 1, '#6a707c'); p(2, 2, 2, 1, '#c3c9d4'); return c; })();

  // ---------- 오브젝트 ----------
  A.obj.tree = (() => {
    const c = mk(32, 48), p = painter(c), r = rng(5);
    p(13, 26, 6, 22, '#7a4f2a'); p(13, 26, 2, 22, '#93602f'); p(17, 26, 2, 22, '#5d3a1c'); p(11, 44, 10, 4, '#7a4f2a'); p(10, 46, 3, 2, '#5d3a1c'); p(19, 46, 3, 2, '#5d3a1c');
    p(14, 30, 1, 3, '#5d3a1c'); p(17, 36, 1, 3, '#4a2e14');
    const dark = '#256f33', mid = '#339b45', light = '#4cc45c', hi = '#7fe08a';
    for (let y = 1; y < 32; y++) { const w = Math.round(10 + 7 * Math.sin((y - 1) / 31 * Math.PI)); const x0 = 16 - w; for (let x = 0; x < w * 2; x += 2) { const v = r(); p(x0 + x, y, 2, 1, v < 0.4 ? mid : v < 0.7 ? dark : light); } }
    for (let i = 0; i < 16; i++) { const x = 5 + ((r() * 22) | 0), y = 4 + ((r() * 22) | 0); p(x, y, 3, 2, light); p(x, y, 2, 1, hi); }
    for (let i = 0; i < 8; i++) p(6 + ((r() * 20) | 0), 18 + ((r() * 12) | 0), 3, 2, dark);
    return outline(c);
  })();
  A.obj.pine = (() => {
    const c = mk(32, 48), p = painter(c);
    p(14, 36, 4, 12, '#6e4423'); p(14, 36, 1, 12, '#8a5a30');
    for (let t = 0; t < 4; t++) { const y0 = 2 + t * 9, w0 = 5 + t * 3; for (let y = 0; y < 13; y++) { const w = Math.round(w0 * (y + 1) / 13); p(16 - w, y0 + y, w * 2, 1, y % 4 === 0 ? '#2f7d4a' : '#256a3d'); p(16 - w, y0 + y, 2, 1, '#3f9a5c'); p(14 + w - 1, y0 + y, 2, 1, '#1d5430'); } p(15, y0 + 1, 2, 2, '#f4fafd'); p(16 - w0 + 1, y0 + 12, w0, 1, '#f4fafd'); }
    return outline(c);
  })();
  A.obj.cane = (() => {
    const c = mk(16, 32), p = painter(c);
    for (const [x, h] of [[3, 26], [7, 32], [11, 22]]) { p(x, 32 - h, 2, h, '#7cc24a'); p(x, 32 - h, 1, h, '#9ad760'); for (let y = 32 - h + 3; y < 32; y += 5) p(x, y, 2, 1, '#4f8f2c'); p(x - 2, 32 - h + 2, 2, 1, '#9ad760'); p(x + 2, 32 - h + 4, 2, 1, '#9ad760'); p(x - 1, 32 - h, 4, 1, '#5aa332'); }
    return outline(c);
  })();
  A.obj.wheat = (() => {
    const c = mk(16, 20), p = painter(c);
    for (const x of [2, 5, 8, 11, 14]) { p(x, 6, 1, 14, '#b9a34a'); p(x - 1, 2, 3, 2, '#f1d052'); p(x, 0, 1, 2, '#f1d052'); p(x - 1, 4, 3, 1, '#d1ac33'); p(x, 1, 1, 1, '#fff0a0'); }
    return outline(c);
  })();
  A.obj.sandpile = (() => {
    const c = mk(16, 8), p = painter(c);
    p(2, 5, 12, 3, '#d9bf6f'); p(4, 3, 8, 2, '#e6d08e'); p(6, 1, 4, 2, '#f0dca2'); p(0, 7, 16, 1, '#cdb35c'); p(5, 4, 1, 1, '#fff2c0'); p(8, 2, 1, 1, '#fff2c0');
    return outline(c);
  })();
  A.obj.icecrystal = (() => {
    const c = mk(16, 24), p = painter(c);
    p(6, 0, 4, 4, '#e8f9ff'); p(4, 4, 8, 6, '#c3ecfb'); p(2, 10, 12, 8, '#9fd8ef'); p(0, 18, 16, 6, '#7fc4e0');
    p(6, 2, 1, 14, '#ffffff'); p(10, 8, 1, 9, '#e8f8ff'); p(3, 12, 1, 8, '#c8ecf9'); p(12, 14, 2, 8, '#6fb2d0'); p(7, 1, 2, 1, '#ffffff');
    return outline(c);
  })();
  A.obj.box = (() => {
    const c = mk(16, 16), p = painter(c);
    p(1, 4, 14, 12, '#b07a3f'); p(1, 4, 14, 2, '#d09858'); p(1, 8, 14, 1, '#7a4f25'); p(1, 13, 14, 1, '#7a4f25');
    p(0, 3, 16, 2, '#7a4f25'); p(6, 7, 4, 4, '#f0d050'); p(7, 8, 2, 2, '#8a6a10'); p(1, 5, 1, 11, '#7a4f25'); p(14, 5, 1, 11, '#7a4f25'); p(2, 3, 12, 1, '#c58c4d');
    return outline(c);
  })();

  // 항구 표지판(16x32), 뗏목 파편(24x12), 유리병 편지 게시판(20x28)
  A.obj.harbor = (() => {
    const c = mk(16, 32), p = painter(c);
    p(7, 4, 3, 28, '#7a4f25'); p(7, 4, 1, 28, '#9a6a3a'); p(2, 5, 13, 8, '#c58c4d'); p(2, 5, 13, 1, '#e0a868'); p(2, 12, 13, 1, '#8a5a2b');
    p(4, 8, 8, 1, '#3b2412'); p(10, 7, 1, 3, '#3b2412'); p(11, 8, 1, 1, '#3b2412'); p(2, 14, 4, 1, '#c9b98a'); p(3, 15, 1, 6, '#c9b98a'); p(2, 21, 4, 1, '#c9b98a');
    return outline(c);
  })();
  A.obj.rocksalt = (() => {   // 암염: 희고 푸른빛이 도는 NaCl 결정 덩어리
    const c = mk(16, 14), p = painter(c);
    p(3, 6, 10, 8, '#c9d4e0'); p(1, 9, 14, 5, '#b6c3d2'); p(5, 2, 6, 6, '#e4ecf6'); p(6, 0, 4, 3, '#ffffff'); p(4, 5, 2, 6, '#ffffff'); p(10, 7, 2, 5, '#a9bbd0'); p(2, 11, 3, 2, '#9fb2c8');
    return outline(c);
  })();
  A.obj.fragment = (() => {
    const c = mk(24, 12), p = painter(c);
    p(0, 7, 20, 3, '#9a6a3a'); p(0, 7, 20, 1, '#c58c4d'); p(2, 4, 16, 3, '#855628'); p(2, 4, 16, 1, '#b57d44'); p(6, 1, 12, 3, '#9a6a3a'); p(6, 1, 12, 1, '#c58c4d');
    p(9, 8, 1, 4, '#5a3a1c'); p(15, 5, 1, 2, '#5a3a1c'); p(19, 9, 4, 2, '#6b4423'); p(1, 9, 1, 1, '#3b2412'); p(12, 2, 1, 1, '#3b2412');
    return outline(c);
  })();
  A.obj.board = (() => {
    const c = mk(20, 28), p = painter(c);
    p(2, 8, 3, 20, '#7a4f25'); p(15, 8, 3, 20, '#7a4f25'); p(0, 2, 20, 14, '#b07a3f'); p(0, 2, 20, 2, '#d09858'); p(0, 15, 20, 1, '#7a4f25');
    for (const [x, col] of [[3, '#6fb7a6'], [9, '#7fc4e6'], [14, '#c4ece0']]) { p(x, 5, 3, 1, '#8b5a2b'); p(x, 6, 3, 7, col); p(x + 1, 6, 1, 5, '#ffffff'); }
    return outline(c);
  })();

  // ---------- 장치 (32x32 = 2x2 타일) ----------
  function dev(fn) { const c = mk(32, 32); fn(painter(c)); return outline(c); }
  A.dev.fire = dev(p => {
    for (const [x, y] of [[2, 24], [7, 26], [12, 27], [17, 27], [22, 26], [26, 24]]) { p(x, y, 5, 5, '#8f949e'); p(x, y, 5, 1, '#b4bac4'); p(x, y + 4, 5, 1, '#5d636b'); p(x + 1, y + 1, 1, 1, '#d6dbe3'); }
    p(6, 22, 20, 3, '#6b4423'); p(8, 20, 16, 3, '#8c5a2b'); p(6, 22, 20, 1, '#b07a3f'); p(5, 21, 3, 3, '#3b2412'); p(24, 21, 3, 3, '#3b2412'); p(10, 21, 2, 1, '#c58c4d');
  });
  A.dev.still = dev(p => {
    p(1, 26, 19, 5, '#7a4f25'); p(1, 26, 19, 1, '#b07a3f'); p(1, 30, 19, 1, '#4a2f14'); p(3, 27, 4, 1, '#93602f');
    p(4, 11, 13, 15, '#c47a38'); p(4, 11, 13, 2, '#e5a566'); p(4, 24, 13, 2, '#8a5424'); p(6, 13, 2, 9, '#f0b87a'); p(14, 14, 2, 10, '#a8622b');
    p(6, 4, 9, 7, '#c47a38'); p(7, 4, 7, 2, '#e5a566'); p(8, 1, 5, 3, '#a8622b'); p(9, 1, 3, 1, '#d9955a');
    p(13, 2, 11, 2, '#d3d6dc'); p(22, 2, 2, 12, '#d3d6dc'); p(21, 13, 4, 2, '#a4a8b0'); p(13, 2, 11, 1, '#f2f4f7');
    p(23, 17, 8, 13, '#c4ece0'); p(23, 17, 8, 2, '#effcf8'); p(25, 22, 4, 7, '#3f9be0'); p(25, 22, 4, 1, '#8cc8f5'); p(24, 30, 6, 1, '#6fb7a6'); p(25, 15, 4, 2, '#8b5a2b');
  });
  A.dev.cooker = dev(p => {
    p(4, 28, 24, 3, '#3a3f47'); p(3, 12, 26, 16, '#b4bac3'); p(3, 12, 26, 2, '#dde1e8'); p(3, 26, 26, 2, '#7f8691'); p(6, 14, 3, 11, '#e4e8ee'); p(24, 14, 3, 11, '#9aa1ac');
    p(2, 9, 28, 4, '#939aa5'); p(2, 9, 28, 1, '#cbd0d8'); p(0, 16, 4, 4, '#3a3f47'); p(28, 16, 4, 4, '#3a3f47'); p(0, 16, 4, 1, '#59606a');
    p(13, 4, 6, 5, '#3a3f47'); p(14, 2, 4, 2, '#22262c'); p(12, 5, 8, 1, '#5b616b'); p(14, 3, 1, 1, '#7a808a');
    p(19, 16, 8, 8, '#f6f8fa'); p(20, 17, 6, 6, '#2c3038'); p(22, 18, 1, 3, '#ff5a4a'); p(21, 21, 3, 1, '#ff5a4a'); p(8, 28, 16, 1, '#6a707a');
  });
  A.dev.cooler = dev(p => {
    p(2, 12, 28, 18, '#2f78c4'); p(2, 12, 28, 2, '#68aef0'); p(2, 28, 28, 2, '#1f5a96'); p(2, 12, 2, 18, '#4590dc'); p(28, 14, 2, 14, '#2767a8');
    p(0, 8, 32, 6, '#eef4fa'); p(0, 8, 32, 1, '#ffffff'); p(0, 13, 32, 1, '#aebdca'); p(12, 5, 8, 3, '#8f9fae'); p(13, 4, 6, 1, '#c3ced8');
    p(15, 17, 2, 9, '#ffffff'); p(11, 21, 10, 1, '#ffffff'); p(12, 18, 1, 1, '#ffffff'); p(19, 18, 1, 1, '#ffffff'); p(12, 24, 1, 1, '#ffffff'); p(19, 24, 1, 1, '#ffffff');
    p(5, 14, 3, 2, '#d8f1fb'); p(24, 16, 2, 2, '#d8f1fb'); p(0, 30, 32, 2, '#c8eefc'); p(4, 31, 3, 1, '#ffffff'); p(20, 31, 5, 1, '#ffffff');
  });
  A.dev.collector = dev(p => {
    p(4, 8, 16, 22, '#d6edf8'); p(4, 8, 16, 2, '#ffffff'); p(6, 10, 12, 18, '#a9d5ec'); p(6, 10, 2, 16, '#e8f6fc'); p(2, 6, 20, 3, '#939faf'); p(4, 29, 16, 2, '#5d7a8f'); p(16, 12, 2, 14, '#8fc2de');
    for (const [x, y] of [[9, 22], [13, 18], [10, 15], [15, 25], [12, 12]]) { p(x, y, 2, 2, '#ffffff'); p(x, y, 1, 1, '#d8f1fb'); }
    p(22, 14, 8, 3, '#e4ecf2'); p(22, 14, 8, 1, '#ffffff'); p(30, 12, 2, 7, '#556270'); p(14, 15, 8, 2, '#b4c2cf'); p(20, 15, 3, 3, '#b4c2cf'); p(22, 17, 6, 1, '#7fc4e6');
  });
  A.dev.altar = dev(p => {
    p(2, 26, 28, 6, '#6b717a'); p(2, 26, 28, 2, '#9399a3'); p(6, 22, 20, 5, '#7d838c'); p(3, 29, 8, 1, '#59606a');
    p(6, 6, 20, 17, '#5d636b'); p(6, 6, 20, 2, '#9aa0a9'); p(4, 10, 24, 10, '#6b717a'); p(4, 10, 24, 1, '#a4aab4'); p(23, 12, 4, 8, '#555b64');
    p(9, 12, 4, 4, '#ffb347'); p(19, 12, 4, 4, '#ffb347'); p(10, 13, 2, 2, '#fff1c0'); p(20, 13, 2, 2, '#fff1c0'); p(11, 19, 10, 2, '#2f3338'); p(12, 19, 1, 1, '#e8e8e8'); p(15, 19, 1, 1, '#e8e8e8'); p(18, 19, 1, 1, '#e8e8e8');
    p(10, 2, 12, 5, '#4a4f56'); p(12, 0, 8, 3, '#3a3f47'); p(10, 2, 12, 1, '#6b717a'); p(0, 12, 4, 6, '#5d636b'); p(28, 12, 4, 6, '#5d636b');
  });

  // ---------- 아이콘 (8x8 + 외곽선) ----------
  const I = (rows, pal) => outline(fromMap(rows, pal));
  A.icon.stick = I(['......bB', '.....bB.', '....bB..', '...bB...', '..bB....', '.bB.....', 'bB......', 'B.......'], { b: '#b9834a', B: '#7a4f25' });
  A.icon.sand = I(['........', '........', '...ss...', '..sSSs..', '.sSSSSs.', 'sSSsSSSs', 'SSSSSSSS', 'dddddddd'], { s: '#f6e7b0', S: '#e0c677', d: '#bda050' });
  A.icon.sea = I(['.hhhhhh.', 'h......h', 'bbbbbbbb', 'bwwwwwwb', 'bwWwwwwb', 'bwwwwWwb', '.bwwwwb.', '..bbbb..'], { b: '#8a9ab3', w: '#3f9be0', W: '#9ad2f8', h: '#5b6b84' });
  A.icon.ice = I(['........', '.cccccc.', 'cCCCCCCc', 'cCwCCCCc', 'cCCCCwCc', 'cCCCCCCc', '.cccccc.', '........'], { c: '#7fc4e6', C: '#c3ecfb', w: '#ffffff' });
  A.icon.bottle = I(['...bb...', '...gg...', '..gGGg..', '.gGGGGg.', '.gGwGGg.', '.gGGGGg.', '.gGGGGg.', '..gggg..'], { g: '#6fb7a6', G: '#c4ece0', w: '#ffffff', b: '#8b5a2b' });
  A.icon.syringe = I(['........', '..k.....', '..kkbbbb', 'kkkgggg.', 'kkkgggg.', '..kkbbbb', '..k.....', '........'], { k: '#667587', g: '#7fc4e6', b: '#e4ecf2' });
  A.icon.sugar = I(['........', '.wwwww..', 'wWWWWWw.', 'wWpWWWw.', 'wWWWpWw.', 'wWWWWWw.', '.wwwwww.', '........'], { w: '#ffffff', W: '#f4f0f5', p: '#f0b6d0' });
  A.icon.salt = I(['........', '...w....', '..wWw...', '.wWWWw.w', 'wWWWWwWw', 'wWWwWWWw', 'wwwwwwww', '........'], { w: '#c9d4e0', W: '#ffffff' });
  A.icon.water = I(['...bb...', '...bb...', '..bbbb..', '.bbwbbb.', '.bwbbbb.', '.bbbbbb.', '..bbbb..', '........'], { b: '#3f9be0', w: '#c8eaff' });
  A.icon.noodle = I(['..yyyy..', '.yYyyYy.', 'yyYyyYyy', '.yyyyyy.', 'yYyyYyyy', '.yyYyyy.', '..yyyy..', '........'], { y: '#f0cc62', Y: '#c19330' });
  A.icon.ramen = I(['.s..s...', '..s..s..', 'yyyyyyyy', 'yYyEyyYy', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...'], { s: '#e4ecf2', y: '#f0cc62', Y: '#c19330', E: '#ffffff', r: '#d24a3a' });
  A.icon.cap = I(['...ww...', '..wWWw..', '.wWWWWw.', '.wppppw.', '.wppppw.', '.wPPPPw.', '..wPPw..', '...ww...'], { w: '#ccd4dc', W: '#eef6fc', p: '#ff6a58', P: '#d24a3a' });
  A.icon.pack = I(['..bbbb..', '.bCCCCb.', 'bCwCCCCb', 'bCCCwCCb', 'bCCCCCCb', 'bCwCCCCb', '.bCCCCb.', '..bbbb..'], { b: '#2f7bc0', C: '#9ad8f8', w: '#ffffff' });
  A.icon.dirt = I(['........', '.dddddd.', 'dDDdDDDd', 'dDdDDdDd', 'dDDDdDDd', 'dDdDDDdd', '.dddddd.', '........'], { d: '#6a4025', D: '#8a5a35' });
  A.icon.stone = I(['........', '..gggg..', '.gGGGGg.', 'gGGhGGGg', 'gGGGGgGg', 'gGgGGGGg', '.gggggg.', '........'], { g: '#6a707c', G: '#8b919c', h: '#bcc2cd' });
  A.icon.pickaxe = I(['..hhhh..', '.hHHHHh.', 'hH.bB.Hh', 'h..bB..h', '...bB...', '...bB...', '...bB...', '...bB...'], { h: '#8f949e', H: '#d0d6e0', b: '#b9834a', B: '#7a4f25' });
  A.icon.shaker = I(['..wwww..', '.wkkkkw.', '..wwww..', '.gGGGGg.', 'gGGwGGGg', 'gGGGGwGg', 'gGGGGGGg', '.gggggg.'], { w: '#e4ecf2', k: '#667587', g: '#6fb7a6', G: '#c4ece0' });
  A.icon.thermo = I(['...ww...', '...wr...', '...wr...', '...wr...', '...wr...', '..wrrw..', '..wrrw..', '...ww...'], { w: '#e8ecf4', r: '#ff5a4a' });
  A.icon.hammer = I(['.hhhh...', 'hHHHHh..', 'hHHHHh.b', '.hhhhbB.', '....bB..', '...bB...', '..bB....', '..B.....'], { h: '#8f949e', H: '#d0d6e0', b: '#b9834a', B: '#7a4f25' });
  A.icon.gear = I(['...gg...', '.g.gg.g.', '..gGGg..', 'ggGggGgg', 'ggGggGgg', '..gGGg..', '.g.gg.g.', '...gg...'], { g: '#9aa3b0', G: '#dde3ec' });
  A.icon.book = I(['.bbbbbb.', 'bBBBBBBb', 'bBwwwwBb', 'bBwkkwBb', 'bBwwwwBb', 'bBwkkwBb', 'bBBBBBBb', '.bbbbbb.'], { b: '#2f5ea8', B: '#4a82d6', w: '#f4f6fa', k: '#8a94a8' });
  A.icon.scroll = I(['.wwwwww.', 'wWWWWWWw', 'wWkkkkWw', 'wWWWWWWw', 'wWkkkWWw', 'wWWWWWWw', 'wWkkkkWw', '.wwwwww.'], { w: '#c9b98a', W: '#efe3bd', k: '#6a5a3a' });
  A.icon.disk = I(['bbbbbbbb', 'bsssssbb', 'bsssssbb', 'bbbbbbbb', 'bwwwwwwb', 'bwkkkkwb', 'bwwwwwwb', 'bbbbbbbb'], { b: '#3a4a7a', s: '#c9d4e8', w: '#e8ecf4', k: '#3a4a7a' });
  A.icon.still = A.dev.still; A.icon.cooker = A.dev.cooker; A.icon.cooler = A.dev.cooler; A.icon.collector = A.dev.collector; A.icon.fire = A.dev.fire;
  for (const k in A.icon) A.iconURL[k] = A.icon[k].toDataURL();

  // ---------- 플레이어 (16x22, 연구원: 흰 가운 + 이마 위 고글) ----------
  A.player = (frame) => {
    const c = mk(16, 22), p = painter(c);
    const sw = frame === 1 ? 1 : frame === 2 ? -1 : 0, up = frame === 3 ? 1 : 0;   // 3: 공중
    p(4, 0, 8, 4, '#6b3f1d'); p(5, 0, 6, 1, '#8a5428'); p(4, 3, 1, 3, '#6b3f1d');                           // 머리카락
    p(4, 4, 8, 6, '#f6d3ab'); p(4, 9, 8, 1, '#e0b88c'); p(5, 6, 2, 2, '#ffffff'); p(9, 6, 2, 2, '#ffffff'); p(6, 7, 1, 1, '#2a3a6a'); p(10, 7, 1, 1, '#2a3a6a'); p(7, 9, 2, 1, '#c98a6a');
    p(3, 3, 10, 2, '#3ec1d3'); p(4, 3, 3, 2, '#d9f7fb'); p(9, 3, 3, 2, '#d9f7fb'); p(3, 3, 10, 1, '#2a8fa0');                                 // 고글
    p(3, 10, 10, 8, '#f7f9fc'); p(3, 10, 10, 1, '#ffffff'); p(7, 11, 2, 7, '#cbd4e0'); p(3, 17, 10, 1, '#cbd4e0'); p(3, 10, 1, 7, '#e3e9f1'); p(12, 10, 1, 7, '#d4dbe6');
    p(5, 10, 2, 1, '#8fa0b8'); p(9, 10, 2, 1, '#8fa0b8'); p(10, 13, 2, 2, '#d6e2f2'); p(4, 12, 2, 1, '#e3e9f1');                              // 옷깃, 주머니
    p(2, 11 + sw, 2, 6, '#f7f9fc'); p(12, 11 - sw, 2, 6, '#f7f9fc'); p(2, 16 + sw, 2, 2, '#f6d3ab'); p(12, 16 - sw, 2, 2, '#f6d3ab');     // 팔
    p(4 + sw, 18 - up, 4, 3, '#34406a'); p(8 - sw, 18 - up, 4, 3, '#34406a'); p(4 + sw, 21 - up, 4, 1, '#4a2f1a'); p(8 - sw, 21 - up, 4, 1, '#4a2f1a');
    return outline(c);
  };
  A.playerFrames = [A.player(0), A.player(1), A.player(2), A.player(3)];

  // ---------- 서리 늑대 (얼음 몸, 22x14) ----------
  A.wolf = [0, 1].map(f => {
    const c = mk(22, 14), p = painter(c), O = '#2b4a6b', L = '#d8f3ff', M = '#9bd6ef', D = '#63aed3';
    p(0, 3, 4, 2, O); p(1, 4, 3, 1, M); p(1, 3, 2, 1, L);                                  // 꼬리
    p(3, 4, 14, 7, O); p(4, 5, 12, 5, M); p(4, 5, 12, 2, L); p(4, 9, 12, 1, D);            // 몸통
    p(7, 2, 1, 2, L); p(10, 1, 1, 3, L); p(13, 2, 1, 2, L);                                // 등의 서리 결정
    p(15, 2, 6, 6, O); p(16, 3, 4, 4, L); p(19, 5, 3, 3, O); p(19, 5, 2, 2, M);            // 머리·주둥이
    p(16, 0, 2, 3, O); p(16, 1, 1, 2, L); p(19, 0, 2, 3, O); p(19, 1, 1, 2, L);            // 귀
    p(18, 4, 1, 1, '#e04040'); p(21, 6, 1, 1, O);                                           // 눈·코
    for (const lx of [4, 7, 12, 15]) { const o = (f && (lx === 7 || lx === 15)) ? 1 : 0; p(lx + o, 11, 2, 3, O); p(lx + o, 11, 1, 2, M); }   // 다리
    return c;
  });

  // ---------- 불꽃 (애니메이션, 세기 1~4) ----------
  A.flame = (ctx, x, y, level, t) => {
    if (level <= 0) return;
    const h = 5 + level * 4, w = 4 + level * 3, f = Math.floor(t * 8) % 2;
    const draw = (col, ww, hh, dx) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x + 16 - ww / 2 + dx), Math.round(y + 22 - hh), ww, hh); };
    draw('#e8541c', w, h, 0); draw('#ff9a2e', w - 3, h - 3, f ? 1 : -1); draw('#ffe066', Math.max(2, w - 7), h - 6, 0); draw('#fffbe0', 2, Math.max(2, h - 10), 0);
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
    if (phase === 1) { for (let i = 0; i < 4; i++) p(14 + i * 12, 0, 6, 3, 'rgba(160,215,255,.8)'); p(6, 8, 52, 3, 'rgba(120,190,255,.55)'); }
    if (phase === 2) { for (let i = 0; i < 5; i++) p(10 + i * 10, 4 - (i % 2) * 3, 4, 8, '#ff7a3d'); p(10, 12, 44, 2, '#ffb347'); }
    if (phase === 3) { for (let i = 0; i < 5; i++) p(4 + i * 12, 55, 5, 5, 'rgba(180,130,255,.85)'); }
    p(4, 62, 56, 2, '#222'); p(4, 62, Math.max(0, Math.round(56 * hp)), 2, '#e74c3c');
  };

  // ---------- 하늘/배경 ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixArr = (c1, c2, t) => { const a = hex(c1), b = hex(c2); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
  // 시각(0~24)에 따른 하늘색을 n개의 가로 띠(픽셀 느낌)로 돌려준다
  A.sky = (hour, n) => {
    const key = [[0, '#070b24', '#1a2860'], [5, '#0a1030', '#33397a'], [6.5, '#5a5fb0', '#ffb36b'], [8, '#2f8fe8', '#b8e4ff'], [17, '#2f8fe8', '#b8e4ff'], [19, '#6a4fa8', '#ff8a4a'], [21, '#0a1030', '#1a2860'], [24, '#070b24', '#1a2860']];
    let top = hex(key[0][1]), bot = hex(key[0][2]);
    for (let i = 0; i < key.length - 1; i++) {
      if (hour >= key[i][0] && hour <= key[i + 1][0]) { const t = (hour - key[i][0]) / (key[i + 1][0] - key[i][0]); top = mixArr(key[i][1], key[i + 1][1], t); bot = mixArr(key[i][2], key[i + 1][2], t); break; }
    }
    return Array.from({ length: n }, (_, i) => { const f = i / (n - 1); return `rgb(${Math.round(lerp(top[0], bot[0], f))},${Math.round(lerp(top[1], bot[1], f))},${Math.round(lerp(top[2], bot[2], f))})`; });
  };
  // 시차 배경 띠 (가로로 이어 붙임)
  function ridge(w, h, base, amp, col, col2, seed, snow) {
    const c = mk(w, h), p = painter(c), r = rng(seed); let y = base;
    for (let x = 0; x < w; x += 2) {
      y += (r() - 0.5) * 3; y += (base - y) * 0.06;
      const top = Math.round(y - amp * Math.sin(x / w * Math.PI * 4) - amp * 0.5 * Math.sin(x / w * Math.PI * 9));
      p(x, top, 2, h - top, col); p(x, top, 2, 2, col2);
      if (snow && top < base - amp * 0.9) p(x, top, 2, 4, '#f4f8ff');
    }
    return c;
  }
  function forest(w, h, col, hi, seed) {
    const c = mk(w, h), p = painter(c), r = rng(seed);
    p(0, h - 10, w, 10, col);
    for (let x = 0; x < w; x += 6 + ((r() * 8) | 0)) {
      const th = 14 + ((r() * 18) | 0), tw = 5 + ((r() * 3) | 0);
      if (r() < 0.5) { for (let y = 0; y < th; y++) { const ww = Math.max(1, Math.round(tw * (y + 1) / th)); p(x - ww, h - 10 - th + y, ww * 2, 1, col); } }
      else { p(x - tw, h - 10 - th + 6, tw * 2, th - 6, col); p(x - tw + 1, h - 10 - th + 3, tw * 2 - 2, 4, col); p(x - 1, h - 10 - th, 3, 3, col); }
      p(x - 1, h - 10 - th + 1, 1, 2, hi);
    }
    return c;
  }
  A.farHills = ridge(512, 150, 100, 34, '#7d95c9', '#a4b9e6', 3, true);
  A.midHills = ridge(512, 120, 74, 16, '#5aa07a', '#7bc296', 9, false);
  A.forest = forest(512, 64, '#2f7048', '#4a9a68', 17);
  A.clouds = [
    (() => { const c = mk(40, 14), p = painter(c); p(8, 5, 26, 7, '#ffffff'); p(3, 7, 12, 6, '#ffffff'); p(14, 1, 12, 7, '#ffffff'); p(25, 3, 11, 7, '#f6fbff'); p(3, 12, 33, 1, '#d6e6f4'); p(10, 6, 6, 1, '#eaf4fc'); return c; })(),
    (() => { const c = mk(28, 10), p = painter(c); p(4, 3, 20, 6, '#ffffff'); p(8, 0, 10, 5, '#ffffff'); p(2, 8, 24, 1, '#d6e6f4'); return c; })(),
    (() => { const c = mk(52, 12), p = painter(c); p(2, 6, 48, 5, '#ffffff'); p(8, 3, 16, 5, '#ffffff'); p(28, 2, 14, 6, '#f6fbff'); p(2, 11, 48, 1, '#d6e6f4'); return c; })(),
  ];
  A.sun = (() => { const c = mk(18, 18), p = painter(c); p(5, 0, 8, 18, '#ffe45a'); p(0, 5, 18, 8, '#ffe45a'); p(2, 2, 14, 14, '#ffe45a'); p(5, 5, 8, 8, '#fff6b0'); p(7, 7, 4, 4, '#ffffff'); return c; })();
  A.moon = (() => { const c = mk(16, 16), p = painter(c); p(4, 0, 8, 16, '#eef1fa'); p(0, 4, 16, 8, '#eef1fa'); p(2, 2, 12, 12, '#eef1fa'); p(9, 3, 3, 3, '#c5cbe0'); p(4, 9, 3, 3, '#c5cbe0'); p(8, 9, 2, 2, '#c5cbe0'); return c; })();
  A.bird = [0, 1].map(f => { const c = mk(7, 4), p = painter(c); if (f) { p(0, 0, 2, 1, '#2a2f45'); p(2, 1, 3, 1, '#2a2f45'); p(5, 0, 2, 1, '#2a2f45'); } else { p(0, 2, 2, 1, '#2a2f45'); p(2, 1, 3, 1, '#2a2f45'); p(5, 2, 2, 1, '#2a2f45'); } return c; });

  return A;
})();
