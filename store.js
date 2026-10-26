// 상태 보관·저장: 게임 상태 S(sim.js `newState` 형식)를 localStorage와 서버(Firebase)에 저장·불러온다.
// 2D(index.html)와 3D(3d/index.html)가 같은 키와 형식을 쓰므로 2D에서 한 저장을 3D에서 이어서 할 수 있다.
// S 객체의 자리는 바뀌지 않는다(다른 모듈이 `const S = Store.S`로 잡고 있다): 서버 세이브·초기화는 내용만 갈아 끼운다.
window.Store = (() => {
  const FP = !!window.CHEM_FP;                                   // 1인칭(fp/)은 2D와 다른 키·다른 서버 경로(6-e)를 쓴다
  const KEY = FP ? 'chemisle_fp_v1' : 'chemisle_side_v1';
  const S = (() => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); return j ? Sim.merge(j) : Sim.newState(); } catch { return Sim.newState(); } })();
  const St = { S, KEY, paused: false, onWarn: null, remote: !FP };   // remote: 서버 저장 사용 여부(fp는 6-e에서 켠다)   // paused: 접속 화면이 떠 있는 동안 시간이 흐르지 않게
  St.set = (obj) => { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, obj); return S; };
  St.merge = (raw) => St.set(Sim.merge(raw));   // 서버 세이브를 기본값 위에 합쳐 넣는다(예전 세이브 이전 포함)
  St.reset = () => St.set(Sim.newState());
  let lastRemote = 0, lastRaftSave = 0, remoteWarned = false;
  St.save = (force) => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 저장 불가 */ }
    if (!St.remote || !(window.Net && Net.user) || St.paused) return;
    const now = Date.now();
    if (!force && now - lastRemote < 4000) return;      // 서버 쓰기는 4초에 한 번만
    lastRemote = now;
    const snap = JSON.parse(JSON.stringify(S)); snap.log = snap.log.slice(-60);   // undefined/NaN 제거, 기록은 최근 것만
    if (Net.saveRaft && (force || now - lastRaftSave > 20000)) {   // 광장에 정박한 뗏목 요약(남은 읽기만): 장치 종류·위치·가동 여부 정도만 올린다
      lastRaftSave = now;
      Net.saveRaft({ cells: S.raft.cells, dock: S.raft.dock, t: now, devs: S.placed.filter(d => d.u !== undefined).map(d => ({ id: d.id, u: d.u, run: !!d.s.run, broken: !!d.s.broken })) }).catch(() => {});
    }
    Net.saveSave(snap).catch(() => { if (!remoteWarned) { remoteWarned = true; if (St.onWarn) St.onWarn('서버 저장에 실패했습니다. 인터넷 연결을 확인하세요.'); } });
  };
  return St;
})();
