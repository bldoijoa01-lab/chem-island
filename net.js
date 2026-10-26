// 네트워크 계층(Firebase): 게스트 입장 · 닉네임/비밀번호 계정 · 서버 세이브.
// Firebase 설정이나 SDK를 불러오지 못하면 Net.init()이 false를 돌려주고 게임은 혼자 하기(localStorage)로 동작한다.
window.Net = (() => {
  const N = { ok: false, user: null, nick: null, guest: true };
  let auth, db;
  const NICK_RE = /^[a-z0-9가-힣]{2,8}$/;
  const keyOf = (n) => String(n).trim().toLowerCase();
  const hex = (s) => [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2, '0')).join('');
  // 사용자에게는 보이지 않는 내부용 이메일(Firebase 이메일/비밀번호 인증용). 한글 닉네임도 안전하게 hex로 변환
  const emailOf = (n) => 'u' + hex(keyOf(n)) + '@chemisle.example';
  const errText = (e) => {
    const c = e && e.code || '';
    if (c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials') return '닉네임 또는 비밀번호가 틀렸습니다.';
    if (c === 'auth/weak-password') return '비밀번호는 6자 이상이어야 합니다.';
    if (c === 'auth/network-request-failed') return '네트워크에 연결할 수 없습니다.';
    if (c === 'auth/operation-not-allowed') return 'Firebase에서 해당 로그인 방식이 아직 켜져 있지 않습니다.';
    if (c === 'auth/too-many-requests') return '시도가 너무 많습니다. 잠시 후 다시 해 주세요.';
    return (e && e.message) || '알 수 없는 오류';
  };

  N.validNick = (n) => NICK_RE.test(keyOf(n));
  N.init = () => {
    const cfg = window.FIREBASE_CONFIG;
    if (N.ok) return true;
    if (!cfg || !window.firebase) return false;
    try { firebase.initializeApp(cfg); auth = firebase.auth(); db = firebase.database(); N.ok = true; } catch (e) { console.warn(e); }
    return N.ok;
  };
  async function loadProfile(u) {
    const snap = await db.ref('profiles/' + u.uid).once('value');
    const p = snap.val();
    if (!p || !p.nick) return false;
    N.user = u; N.nick = p.nick; N.guest = u.isAnonymous;
    return true;
  }
  // 새로고침해도 로그인 유지: 저장된 세션이 있으면 닉네임을 돌려준다
  N.restore = () => new Promise((resolve) => {
    const off = auth.onAuthStateChanged(async (u) => {
      off();
      try {
        if (!u) return resolve(null);
        if (await loadProfile(u)) return resolve(N.nick);
        await u.delete().catch(() => auth.signOut());   // 가입이 중간에 끊긴 계정 정리
        resolve(null);
      } catch (e) { console.warn(e); resolve(null); }
    });
  });
  // 게스트로 시작: 익명 로그인 → 닉네임 선점(보안 규칙이 중복을 거부) → 프로필 기록
  N.register = async (nick) => {
    nick = String(nick).trim();
    if (!N.validNick(nick)) throw new Error('닉네임은 2~8자의 한글·영문·숫자만 쓸 수 있습니다.');
    let cred;
    try { cred = await auth.signInAnonymously(); } catch (e) { throw new Error(errText(e)); }
    const u = cred.user;
    try { await db.ref('nicks/' + keyOf(nick)).set(u.uid); }
    catch (e) { await u.delete().catch(() => auth.signOut()); throw new Error('이미 사용 중인 닉네임입니다.'); }
    await db.ref('profiles/' + u.uid).set({ nick, createdAt: firebase.database.ServerValue.TIMESTAMP });
    N.user = u; N.nick = nick; N.guest = true;
  };
  // 게스트 → 닉네임+비밀번호 계정으로 업그레이드 (같은 uid, 같은 캐릭터)
  N.upgrade = async (pw) => {
    try {
      const cred = firebase.auth.EmailAuthProvider.credential(emailOf(N.nick), pw);
      await auth.currentUser.linkWithCredential(cred);
      N.guest = false;
    } catch (e) { throw new Error(errText(e)); }
  };
  N.login = async (nick, pw) => {
    try {
      const cred = await auth.signInWithEmailAndPassword(emailOf(nick), pw);
      if (!(await loadProfile(cred.user))) throw new Error('캐릭터 정보를 찾을 수 없습니다.');
    } catch (e) { throw new Error(e.code ? errText(e) : e.message); }
  };
  N.logout = async () => { N.leaveMap(); await auth.signOut(); N.user = null; N.nick = null; N.guest = true; };
  const SAVES = window.CHEM_FP ? 'saves3' : 'saves', RAFTS = window.CHEM_FP ? 'rafts3' : 'rafts';   // 1인칭(fp/)은 2D와 다른 경로를 쓴다
  N.loadSave = async () => (await db.ref(SAVES + '/' + N.user.uid).once('value')).val();
  // ---- presence: 같은 맵의 다른 플레이어 ----
  let pref = null, pOff = [];
  N.peers = {};   // uid -> { nick, x, y, vx, face, anim, t }
  N.joinMap = (map, first) => {
    N.leaveMap();
    pref = db.ref('presence/' + map);
    const me = pref.child(N.user.uid);
    me.onDisconnect().remove();
    me.set(Object.assign({ nick: N.nick }, first));
    const put = (s) => { if (s.key !== N.user.uid) N.peers[s.key] = s.val(); };
    const del = (s) => { delete N.peers[s.key]; };
    pref.on('child_added', put); pref.on('child_changed', put); pref.on('child_removed', del);
    pOff = [['child_added', put], ['child_changed', put], ['child_removed', del]];
  };
  N.sendPos = (p) => { if (pref && N.user) pref.child(N.user.uid).update(p).catch(() => {}); };
  N.leaveMap = () => {
    if (pref) {
      pOff.forEach(([ev, fn]) => pref.off(ev, fn));
      if (N.user) { const me = pref.child(N.user.uid); me.onDisconnect().cancel(); me.remove().catch(() => {}); }
    }
    pref = null; pOff = []; N.peers = {};
  };
  N.saveSave = (obj) => db.ref(SAVES + '/' + N.user.uid).set(obj);
  // ---- 협동 보스(솥 골렘 3단계): 같은 탱크(/raid/golem)에 두 사람이 역할(O2 / N2)을 나눠 캡슐을 넣는다 ----
  let rref = null, rHandler = null;
  N.raidJoin = async (role, cb, init) => {
    N.raidLeave();
    rref = db.ref('raid/golem');
    const me = rref.child('players/' + N.user.uid);
    me.onDisconnect().remove();
    await me.set({ nick: N.nick, role, t: firebase.database.ServerValue.TIMESTAMP });
    await rref.child('n').transaction((v) => v || init);          // 처음 들어온 사람이 처음 탱크를 만든다
    rHandler = (snap) => cb(snap.val() || {});
    rref.on('value', rHandler);
  };
  N.raidAdd = (k, dn) => rref.child('n/' + k).transaction((v) => (v || 0) + dn);
  N.raidVent = () => rref.child('n').transaction((v) => { if (!v) return v; const o = {}; for (const k in v) o[k] = v[k] * 0.9; return o; });
  N.raidReset = (init, round) => rref.update({ n: init, round: round, doneRound: null });
  N.raidDone = (round) => rref.update({ doneRound: round });
  N.raidLeave = () => {
    if (rref && rHandler) rref.off('value', rHandler);
    if (rref && N.user) { const me = rref.child('players/' + N.user.uid); me.onDisconnect().cancel(); me.remove().catch(() => {}); }
    rref = null; rHandler = null;
  };
  // ---- 광장: 정박한 뗏목(남은 읽기만)과 유리병 편지 ----
  N.saveRaft = (sum) => db.ref(RAFTS + '/' + N.user.uid).set(Object.assign({ nick: N.nick }, sum));
  N.loadRafts = async (n) => {
    const out = [], snap = await db.ref(RAFTS).orderByChild('t').limitToLast((n || 3) + 1).once('value');
    snap.forEach((c) => { if (c.key !== N.user.uid) out.push(c.val()); });
    return out.reverse().slice(0, n || 3);
  };
  N.postBottle = (text) => db.ref('bottles').push({ uid: N.user.uid, nick: N.nick, text: String(text).slice(0, 80), t: firebase.database.ServerValue.TIMESTAMP });
  N.loadBottles = async (n) => {
    const out = [], snap = await db.ref('bottles').orderByChild('t').limitToLast(n || 12).once('value');
    snap.forEach((c) => { const v = c.val(); if (v && v.text) out.push({ nick: v.nick, text: v.text }); });
    return out.reverse();
  };
  // ---- 팀(파티, 9단계: fp/ 전용): /parties/{pid}, /partyCodes/{code} ----
  // 팀 상태는 한 번에 한 명(lease를 가진 사람)만 쓰고, 서버 규칙이 state.ver가 +1일 때만 받는다(MULTIPLAYER.md, DESIGN.md §4-17)
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 문자(I, O, 0, 1) 제외
  const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  N.partyCreate = async (name, color) => {
    const pid = db.ref('parties').push().key;
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      const taken = (await db.ref('partyCodes/' + code).once('value')).exists();
      if (taken) continue;
      const t = firebase.database.ServerValue.TIMESTAMP, up = {};
      up['parties/' + pid] = { code, name, color, owner: N.user.uid, members: { [N.user.uid]: { nick: N.nick, t, code } } };
      up['partyCodes/' + code] = pid;
      await db.ref().update(up);
      return { pid, code };
    }
    throw new Error('초대 코드를 만들지 못했습니다. 다시 시도하세요.');
  };
  N.partyJoin = async (code) => {
    code = String(code || '').trim().toUpperCase();
    const pid = (await db.ref('partyCodes/' + code).once('value')).val();
    if (!pid) throw new Error('없는 초대 코드입니다.');
    try { await db.ref('parties/' + pid + '/members/' + N.user.uid).set({ nick: N.nick, t: firebase.database.ServerValue.TIMESTAMP, code }); }
    catch { throw new Error('팀에 들어갈 수 없습니다(인원이 가득 찼거나 코드가 맞지 않습니다).'); }
    return pid;
  };
  N.partyLeave = (pid) => db.ref('parties/' + pid + '/members/' + N.user.uid).remove();
  // cb({ meta:{name,color,code,owner}, members, state, lease })를 값이 바뀔 때마다 부른다. 반환값은 구독 해제 함수
  N.partyWatch = (pid, cb) => {
    const ref = db.ref('parties/' + pid), fn = (s) => { const v = s.val(); if (!v) return cb(null); cb({ meta: { name: v.name, color: v.color, code: v.code, owner: v.owner }, members: v.members || {}, state: v.state || null, lease: v.lease || null }); };
    ref.on('value', fn, () => cb(null));
    return () => ref.off('value', fn);
  };
  N.partyWatchLog = (pid, cb) => {
    const ref = db.ref('parties/' + pid + '/log').orderByChild('t').limitToLast(20), fn = (s) => { const out = []; s.forEach(c => { out.push(c.val()); }); cb(out); };
    ref.on('value', fn); return () => ref.off('value', fn);
  };
  // lease: 본인이거나 만료됐거나 passive일 때만 가져간다(규칙이 검사). 성공하면 true
  N.partyLease = async (pid, active, ms) => {
    const exp = Date.now() + ms;
    const r = await db.ref('parties/' + pid + '/lease').transaction((cur) => {
      if (cur && cur.uid !== N.user.uid && cur.active && cur.exp > Date.now()) return;   // 다른 사람의 유효한 active 임대
      return { uid: N.user.uid, nick: N.nick, active: !!active, exp };
    }, undefined, false);
    return !!r.committed;
  };
  // 팀 상태 올리기: base 버전일 때만(낙관적 동시성). 성공하면 { ok: true, ver }
  N.partyPublish = async (pid, base, state) => {
    const r = await db.ref('parties/' + pid + '/state').transaction((cur) => {
      const curVer = cur ? cur.ver : 0;
      if (curVer !== base) return;
      return Object.assign({}, state, { ver: base + 1, by: N.user.uid });
    }, undefined, false);
    return { ok: !!r.committed, ver: base + 1 };
  };
  N.partyLog = (pid, entry) => db.ref('parties/' + pid + '/log').push(Object.assign({ uid: N.user.uid, nick: N.nick, t: firebase.database.ServerValue.TIMESTAMP }, entry));
  N.partyBeat = (pid) => db.ref('parties/' + pid + '/members/' + N.user.uid + '/t').set(firebase.database.ServerValue.TIMESTAMP);
  N.partyMeta = (pid, meta) => db.ref('parties/' + pid).update(meta);
  return N;
})();
