(function () {

  const FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

  const SCORE_API = '/api/scores';
  let _user = null;
  let _ready = false;
  let _onUserChange = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  
  let _cachedAvatarUrl = null; 

  function renderAuthUI(user, firebaseOk) {
    const container = document.getElementById('authContainer');
    if (!container) return;

    if (!firebaseOk) {
      container.innerHTML = `<span style="font-size:11px;color:#ff6b6b;display:flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Firebase error</span>`;
      return;
    }

    if (user) {
      
      const avatarSrc = _cachedAvatarUrl || user.photoURL;
      const avatarHtml = avatarSrc
        ? `<img src="${escHtml(avatarSrc)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;" referrerpolicy="no-referrer">`
        : `<span style="width:30px;height:30px;border-radius:50%;background:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${escHtml((user.displayName||'?')[0].toUpperCase())}</span>`;
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          ${avatarHtml}
          <div style="display:flex;flex-direction:column;gap:1px;min-width:0;">
            <span style="font-size:13px;max-width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(user.displayName||user.email||'ผู้เล่น')}</span>
            <span id="navLevelChip" style="font-size:10px;font-weight:700;color:#b39ddb;letter-spacing:0.04em;">Lv.—</span>
          </div>
          <button class="btn-ghost" id="btnSignOut" style="padding:4px 10px;font-size:12px;">ออก</button>
        </div>`;
      document.getElementById('btnSignOut').addEventListener('click', () => { _cachedAvatarUrl = null; firebase.auth().signOut(); });
    } else {
      container.innerHTML = `
        <button class="btn-ghost" id="btnGoogleSignIn" style="display:flex;align-items:center;gap:7px;padding:6px 14px;font-size:13px;">
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.9C14.7 15.1 19 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.6-3-11.3-7.3l-6.6 4.9C9.7 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.4 4.2-4.4 5.6l6.2 5.2C40.8 35.1 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          เข้าสู่ระบบ
        </button>`;
      document.getElementById('btnGoogleSignIn').addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider).catch(err => {
          console.error('[Auth] login error:', err.code, err.message);
          alert('Login ไม่สำเร็จ: ' + err.message);
        });
      });
    }

    
    const btnProfile = document.getElementById('btnProfile');
    if (btnProfile) btnProfile.style.display = user ? 'block' : 'none';

    
    if (user) {
      const authContainer = document.getElementById('authContainer');
      const imgEl = authContainer ? authContainer.querySelector('img') : null;
      fetchProfileImage(user.uid, 'avatar').then(url => {
        if (!url) return;
        _cachedAvatarUrl = url; 
        const currentImg = authContainer ? authContainer.querySelector('img') : null;
        if (currentImg) {
          currentImg.src = url;
        } else {
          const wrap = authContainer ? authContainer.querySelector('div') : null;
          const span = wrap ? wrap.querySelector('span[style*="border-radius:50%"]') : null;
          if (span) {
            const img = document.createElement('img');
            img.src = url;
            img.style.cssText = 'width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;';
            img.referrerPolicy = 'no-referrer';
            span.replaceWith(img);
          }
        }
      }).catch(() => {});
    }
  }

  
  function refreshHeaderAvatar(uid, dataUrl) {
    _cachedAvatarUrl = dataUrl; 
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;
    const imgEl = authContainer.querySelector('img');
    if (imgEl) {
      imgEl.src = dataUrl;
    } else {
      const wrap = authContainer.querySelector('div');
      const span = wrap ? wrap.querySelector('span[style*="border-radius:50%"]') : null;
      if (span) {
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = 'width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;';
        img.referrerPolicy = 'no-referrer';
        span.replaceWith(img);
      }
    }
  }

  async function initFirebase() {
    
    renderAuthUI(null, true); 

    try {
      await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
      firebase.initializeApp(FIREBASE_CONFIG);
      _ready = true;
      firebase.auth().onAuthStateChanged((user) => {
        _user = user;
        renderAuthUI(user, true);
        if (_onUserChange) _onUserChange(user);
        
        if (user && window.refreshNavLevel) setTimeout(window.refreshNavLevel, 500);
      });
    } catch (err) {
      console.error('[Auth] Firebase โหลดไม่ได้:', err);
      renderAuthUI(null, false);
    }
  }

  
  async function submitScore(scoreData) {
    if (!_user) return { saved: false, reason: 'not_logged_in' };
    try {
      const idToken = await _user.getIdToken();
      const res = await fetch(SCORE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ displayName: _user.displayName || _user.email || 'ไม่ระบุชื่อ', photoURL: _user.photoURL || '', ...scoreData }),
      });
      return await res.json();
    } catch (err) { return { saved: false }; }
  }

  async function fetchLeaderboard(songId) {
    try { return await (await fetch(`${SCORE_API}?songId=${encodeURIComponent(songId)}`)).json(); }
    catch { return []; }
  }

  async function fetchMyScores() {
    if (!_user) return [];
    try { return await (await fetch(`${SCORE_API}?uid=${_user.uid}`)).json(); }
    catch { return []; }
  }

  // ดึงคะแนนของผู้เล่นคนใดก็ได้ (สำหรับดูโปรไฟล์เพื่อน)
  async function fetchScoresForUid(uid) {
    if (!uid) return [];
    try { return await (await fetch(`${SCORE_API}?uid=${encodeURIComponent(uid)}`)).json(); }
    catch { return []; }
  }

  // ดึง lifetimeScore (คะแนนสะสมทุกครั้งที่เล่น แม้ fail) สำหรับคำนวณ Lv. แบบ osu! จริง
  async function fetchLifetimeScore(uid) {
    if (!uid) return 0;
    try {
      const data = await (await fetch(`/api/lifetime-score?uid=${encodeURIComponent(uid)}`)).json();
      return data && typeof data.lifetimeScore === 'number' ? data.lifetimeScore : 0;
    } catch { return 0; }
  }

  
  async function searchPlayers(query) {
    try { return await (await fetch(`/api/players?q=${encodeURIComponent(query || '')}`)).json(); }
    catch { return []; }
  }

  
  async function uploadProfileImage(kind, dataUrl) {
    if (!_user) return { saved: false, reason: 'not_logged_in' };
    try {
      const idToken = await _user.getIdToken();
      const res = await fetch('/api/profile-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ kind, dataUrl }),
      });
      return await res.json();
    } catch (err) { return { saved: false, reason: 'network_error' }; }
  }

  async function fetchProfileImage(uid, kind) {
    if (!uid) return null;
    try {
      const data = await (await fetch(`/api/profile-image?uid=${encodeURIComponent(uid)}&kind=${encodeURIComponent(kind)}`)).json();
      return data && data.url ? data.url : null;
    } catch { return null; }
  }

  
  
  
  const _serverAvatarCache = new Map(); 
  const _serverAvatarPending = new Map(); 

  async function _fetchServerAvatar(uid) {
    if (_serverAvatarCache.has(uid)) return _serverAvatarCache.get(uid);
    if (_serverAvatarPending.has(uid)) return _serverAvatarPending.get(uid);
    const p = fetchProfileImage(uid, 'avatar').then(url => {
      _serverAvatarCache.set(uid, url || null);
      _serverAvatarPending.delete(uid);
      return url || null;
    });
    _serverAvatarPending.set(uid, p);
    return p;
  }

  
  function resolveAvatar(uid, fallback, imgEl) {
    if (imgEl && fallback) imgEl.src = fallback;
    if (!uid) return Promise.resolve(null);
    return _fetchServerAvatar(uid).then(url => {
      if (url && imgEl && imgEl.isConnected) imgEl.src = url;
      return url;
    });
  }

  
  function clearServerAvatarCache(uid) {
    if (uid) { _serverAvatarCache.delete(uid); _serverAvatarPending.delete(uid); }
    else { _serverAvatarCache.clear(); _serverAvatarPending.clear(); }
  }

  
  async function saveSettingsRemote(settingsObj) {
    if (!_user) return { saved: false, reason: 'not_logged_in' };
    try {
      const idToken = await _user.getIdToken();
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(settingsObj),
      });
      return await res.json();
    } catch (err) { return { saved: false, reason: 'network_error' }; }
  }

  async function fetchSettingsRemote() {
    if (!_user) return null;
    try {
      const idToken = await _user.getIdToken();
      const data = await (await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      })).json();
      return data && data.settings ? data.settings : null;
    } catch { return null; }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  window.Auth = {
    get user() { return _user; },
    get ready() { return _ready; },
    onUserChange(fn) { _onUserChange = fn; },
    clearAvatarCache() { _cachedAvatarUrl = null; },
    submitScore, fetchLeaderboard, fetchMyScores, fetchScoresForUid, fetchLifetimeScore, searchPlayers,
    uploadProfileImage, fetchProfileImage, resolveAvatar, clearServerAvatarCache, refreshHeaderAvatar,
    saveSettingsRemote, fetchSettingsRemote,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
  } else {
    initFirebase();
  }
})();
