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
  N.loadSave = async () => (await db.ref('saves/' + N.user.uid).once('value')).val();
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
  N.saveSave = (obj) => db.ref('saves/' + N.user.uid).set(obj);
  // ---- 광장: 정박한 뗏목(남은 읽기만)과 유리병 편지 ----
  N.saveRaft = (sum) => db.ref('rafts/' + N.user.uid).set(Object.assign({ nick: N.nick }, sum));
  N.loadRafts = async (n) => {
    const out = [], snap = await db.ref('rafts').orderByChild('t').limitToLast((n || 3) + 1).once('value');
    snap.forEach((c) => { if (c.key !== N.user.uid) out.push(c.val()); });
    return out.reverse().slice(0, n || 3);
  };
  N.postBottle = (text) => db.ref('bottles').push({ uid: N.user.uid, nick: N.nick, text: String(text).slice(0, 80), t: firebase.database.ServerValue.TIMESTAMP });
  N.loadBottles = async (n) => {
    const out = [], snap = await db.ref('bottles').orderByChild('t').limitToLast(n || 12).once('value');
    snap.forEach((c) => { const v = c.val(); if (v && v.text) out.push({ nick: v.nick, text: v.text }); });
    return out.reverse();
  };
  return N;
})();
