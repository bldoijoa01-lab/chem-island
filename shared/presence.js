// 접속 위치 공유(13-e): 허브(광장섬)에서만 서로 보이고, 위치는 10 Hz로 보낸다. fp/main.js에 있던 것을 그대로 옮겼다(화면 쪽은 peers를 읽어 그린다).
// 패킷 {x, y, z, yaw, air}는 fp/와 td/가 같다: td/는 바라보는 방향을 yaw(0 = 화면 위쪽 -z, 앞 = (-sin yaw, -cos yaw))로 채운다.
const PRES_HZ = 100;   // 위치를 서버에 보내는 간격(ms) = 10 Hz
export function makePresence(ctx, packet) {
  const P = { map: null, peers: {} };   // peers: id → { x, y, z, yaw, nick } 부드럽게 따라가는 값
  let lastPos = '', lastPosAt = 0;
  P.join = () => {   // 광장섬에서만 서로 보인다(시작섬은 내 섬)
    if (!(window.Net && Net.user)) return;
    const want = ctx.name === 'plaza' ? 'fp-plaza' : null;
    if (want === P.map) return;
    P.map = want; P.peers = {};
    if (want) Net.joinMap(want, packet()); else Net.leaveMap();
  };
  P.step = (dt, now) => {
    if (!(window.Net && Net.user) || !P.map || Store.paused) return;
    if (now - lastPosAt >= PRES_HZ) { const pk = packet(), k = JSON.stringify(pk); if (k !== lastPos || now - lastPosAt > 5000) { lastPos = k; lastPosAt = now; Net.sendPos(pk); } }
    const a = 1 - Math.exp(-dt * 14);
    for (const id in Net.peers) {
      const q = Net.peers[id]; if (typeof q.x !== 'number' || typeof q.z !== 'number') continue;
      const g = P.peers[id] || (P.peers[id] = { x: q.x, y: q.y, z: q.z, yaw: 0, nick: '', moving: 0 });
      const dx = q.x - g.x, dz = q.z - g.z; g.moving = Math.hypot(dx, dz) > 0.02 ? 1 : 0;
      g.x += dx * a; g.y += (q.y - g.y) * a; g.z += dz * a; g.yaw = q.yaw !== undefined ? q.yaw : 0; g.nick = q.nick || ''; g.air = !!q.air;
    }
    for (const id in P.peers) if (!Net.peers[id]) delete P.peers[id];
  };
  return P;
}
