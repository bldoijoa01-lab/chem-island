// 상태 보관·저장: 게임 상태 S(sim.js `newState` 형식)를 localStorage와 서버(Firebase)에 저장·불러온다.
// 옆면 2D(index.html)와 1인칭 3D(fp/)·탑다운(td/)은 키가 다르다(fp/·td/는 chemisle_fp_v2).
// S 객체의 자리는 바뀌지 않는다(다른 모듈이 `const S = Store.S`로 잡고 있다): 서버 세이브·초기화는 내용만 갈아 끼운다.
window.Store = (() => {
  const FP = !!window.CHEM_FP;                                   // 1인칭(fp/)은 2D와 다른 키·다른 서버 경로(6-e)를 쓴다
  const KEY = FP ? 'chemisle_fp_v2' : 'chemisle_side_v1';
  const S = (() => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j ? Sim.merge(j) : Sim.newState(); } catch { return Sim.newState(); } })();
  const St = { S, KEY, paused: false, onWarn: null, remote: true };   // remote: 서버 저장 사용 여부(fp는 /saves3·/rafts3 경로를 쓴다: net.js)   // paused: 접속 화면이 떠 있는 동안 시간이 흐르지 않게
  St.set = (obj) => { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, obj); return S; };
  St.merge = (raw) => St.set(Sim.merge(raw));   // 서버 세이브를 기본값 위에 합쳐 넣는다(예전 세이브 이전 포함)
  St.reset = () => St.set(Sim.newState());
  let lastRemote = 0, lastRaftSave = 0, remoteWarned = false;
  St.forceNext = () => { lastRemote = 0; };   // 다음 save가 서버 쓰기 간격(4초)에 걸리지 않게 한다(접속 직후)
  St.save = (force) => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 저장 불가 */ }
    if (!St.remote || !(window.Net && Net.user) || St.paused) return;
    const now = Date.now();
    if (!force && now - lastRemote < 4000) return;      // 서버 쓰기는 4초에 한 번만
    lastRemote = now;
    const snap = JSON.parse(JSON.stringify(S)); snap.log = snap.log.slice(-60);   // undefined/NaN 제거, 기록은 최근 것만
    if (S.party && S.party.pid) delete snap.world;   // 17-b: 팀원의 월드는 팀 상태(/parties/{pid}/state/world)가 진본이라 개인 저장에 반복해 올리지 않는다(로컬에는 사본이 남는다)
    if (Net.saveRaft && (force || now - lastRaftSave > 20000)) {   // 광장에 정박한 뗏목 요약(남은 읽기만): 장치 종류·위치·가동 여부 정도만 올린다
      lastRaftSave = now;
      Net.saveRaft({ cells: S.raft.cells, dock: S.raft.dock, t: now, devs: FP ? S.placed.map(d => ({ id: d.id, u: d.x, z: d.y, run: !!d.s.run, broken: !!d.s.broken })) : S.placed.filter(d => d.u !== undefined).map(d => ({ id: d.id, u: d.u, run: !!d.s.run, broken: !!d.s.broken })) }).catch(() => {});
    }
    Net.saveSave(snap).catch(() => { if (!remoteWarned) { remoteWarned = true; if (St.onWarn) St.onWarn('서버 저장에 실패했습니다. 인터넷 연결을 확인하세요.'); } });
  };
  return St;
})();
