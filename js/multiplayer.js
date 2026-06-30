(function () {

  
  function stripNum(n) { return (n || '').replace(/^\d+\s+/, ''); }

  // ===== State =====
  let ws = null;
  let myUid = null;
  let myName = null;
  let myAvatar = null;
  let reconnectTimer = null;
  let reconnectCount = 0;

  let currentRoom = null;
  let isHost = false;
  let roomPlayers = [];

  // ===== Helpers =====
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function avatarHtml(name, photoURL, size = 32) {
    if (photoURL) return `<img src="${esc(photoURL)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;" referrerpolicy="no-referrer" onerror="this.style.display='none'">`;
    const initial = esc((name || '?')[0].toUpperCase());
    return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:var(--accent-magenta);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size*0.45)}px;flex-shrink:0;">${initial}</span>`;
  }
  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `mp-toast mp-toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('mp-toast-show'), 10);
    setTimeout(() => { t.classList.remove('mp-toast-show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ===== WebSocket =====
  function connect() {
    if (!myUid) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/multiplayer`);
    ws.onopen = async () => {
      reconnectCount = 0;
      setConnStatus('connected');
      // ดึง Firebase ID token ก่อนส่ง auth — server จะ verify กับ Firebase
      let idToken = '';
      try {
        const user = window.Auth?.user || (window.firebase?.auth?.()?.currentUser);
        if (user) idToken = await user.getIdToken();
      } catch (e) { console.warn('[MP] getIdToken ล้มเหลว:', e); }
      send({ type: 'auth', token: idToken, name: myName, avatar: myAvatar });
    };
    ws.onmessage = (e) => { try { handleMessage(JSON.parse(e.data)); } catch(err) { console.error('[MP]', err); } };
    ws.onclose = () => { setConnStatus('disconnected'); scheduleReconnect(); };
    ws.onerror = () => { setConnStatus('error'); };
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectCount), 16000);
    reconnectCount++;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  }

  function setConnStatus(state) {
    const el = document.getElementById('mp-conn-status');
    if (!el) return;
    const map = {
      connected:     { text: '● เชื่อมต่อแล้ว',        color: '#6ee7e0' },
      disconnected:  { text: '● ขาดการเชื่อมต่อ',       color: '#ff5d8f' },
      reconnecting:  { text: '● กำลังเชื่อมต่อใหม่...', color: '#ffd166' },
      error:         { text: '● เชื่อมต่อไม่ได้',       color: '#ff5d8f' },
    };
    const s = map[state] || map.disconnected;
    el.textContent = s.text;
    el.style.color  = s.color;
  }

  // ===== Helpers: หยุดเกม + กลับหน้าห้อง (ใช้ร่วมกันหลาย case) =====
  function _stopGameAndAudio() {
    // เรียก _stopMPGame ที่ expose จาก app.js ซึ่งเข้าถึง currentGame จริงๆ ได้
    if (window._stopMPGame) {
      window._stopMPGame();
    } else {
      // fallback เผื่อ app.js ยังไม่โหลด
      if (window.currentGame) {
        try { window.currentGame.stopAudio(); } catch(e) {}
        try { window.currentGame.stop(); } catch(e) {}
        window.currentGame = null;
      }
      if (window._stopPreview) window._stopPreview();
      window._isMultiplayerGame = false;
    }
  }
  function _returnToMpRoomView() {
    // _stopMPGame จัดการ screen switching แล้ว แค่ต้อง showRoomView เพิ่ม
    showRoomView();
  }

  // ===== Message Handler =====
  function handleMessage(msg) {
    switch (msg.type) {
      case 'global_chat':
        appendChat('mp-global-chat', msg.uid, msg.name, msg.avatar, msg.text);
        break;
      case 'room_list':
        renderRoomList(msg.rooms);
        break;
      case 'room_joined':
        currentRoom = { id: msg.roomId, name: msg.name, hasPassword: msg.hasPassword, song: msg.song, playing: !!msg.playing };
        isHost = msg.isHost;
        roomPlayers = msg.players || [];
        // Reset preload state เมื่อเข้าห้องใหม่
        _preloadedEntry = null;
        _preloadingSongId = null;
        _readyLockedByDownload = false;
        clearRoomChat();
        showRoomView();
        renderRoomPlayers();
        updateRoomUI();
        appendChat('mp-room-chat', null, null, null, `คุณเข้าห้อง "${msg.name}" แล้ว`);
        if (msg.playing) {
          appendChat('mp-room-chat', null, null, null, '⚠️ ห้องนี้กำลังเล่นอยู่ รอให้ทุกคนเล่นจบก่อน');
        }
        // Non-host ที่เข้าห้องที่มีเพลงเลือกไว้แล้ว → โหลดเพลงทันที
        if (!msg.isHost && msg.song) {
          _autoDownloadSongForRoom(msg.song);
        }
        break;
      case 'room_players':
        roomPlayers = msg.players || [];
        isHost = roomPlayers.some(p => p.uid === myUid && p.isHost);
        if (msg.playing != null && currentRoom) currentRoom.playing = !!msg.playing;
        else if (currentRoom && msg.playing === false) currentRoom.playing = false;
        renderRoomPlayers();
        updateRoomUI();
        break;
      case 'room_chat':
        appendChat('mp-room-chat', msg.uid, msg.name, msg.avatar, msg.text);
        break;
      case 'room_updated':
        if (currentRoom) {
          currentRoom.name = msg.name;
          currentRoom.hasPassword = msg.hasPassword;
          const titleEl = document.getElementById('mp-room-title');
          if (titleEl) titleEl.textContent = msg.name;
          appendChat('mp-room-chat', null, null, null, 'ข้อมูลห้องถูกเปลี่ยน');
        }
        break;
      case 'room_song':
        if (currentRoom) currentRoom.song = msg.song;
        // reset ready ทุกคนใน local state ทันที (ก่อน room_players จะตามมา)
        roomPlayers = roomPlayers.map(p => ({ ...p, ready: false }));
        // ยกเลิก preload เก่า เมื่อเพลงเปลี่ยน
        _preloadedEntry = null;
        _preloadingSongId = null;
        _readyLockedByDownload = false;
        renderRoomSong();
        renderRoomPlayers();
        updateRoomUI();
        appendChat('mp-room-chat', null, null, null, `เพลงใหม่: ${msg.song?.title || '(ล้างเพลง)'}${msg.song?.version ? ' [' + msg.song.version + ']' : ''} — กรุณากด "พร้อม" อีกครั้ง`);
        // ▶ Non-host: โหลดเพลงทันทีหลังได้รับ room_song — ไม่รอให้กดเริ่มเกม
        if (msg.song && !isHost) {
          _autoDownloadSongForRoom(msg.song);
        }
        break;
      case 'room_host':
        isHost = msg.newHostUid === myUid;
        roomPlayers = roomPlayers.map(p => ({ ...p, isHost: p.uid === msg.newHostUid }));
        renderRoomPlayers();
        updateRoomUI();
        appendChat('mp-room-chat', null, null, null, `${esc(msg.newHostName)} เป็นหัวห้องคนใหม่`);
        break;
      case 'kicked':
        appendChat('mp-room-chat', null, null, null, 'คุณถูกเตะออกจากห้อง');
        leaveRoomLocal();
        break;
      case 'host_abort':
        // เก่า: fallback กรณีไม่มี player เหลือเลย
        hideMpScorePanel();
        _stopGameAndAudio();
        showToast('หัวห้องออกระหว่างเล่น — เกมถูกยกเลิก', 'error');
        _returnToMpRoomView();
        if (currentRoom) currentRoom.playing = false;
        renderRoomPlayers();
        updateRoomUI();
        break;

      case 'host_disconnected': {
        // host หลุด (ไม่ตั้งใจ) ระหว่างเล่น → หยุดเกม + โอนหัวห้อง + กลับหน้าห้อง
        hideMpScorePanel();
        _stopGameAndAudio();
        isHost = msg.newHostUid === myUid;
        roomPlayers = roomPlayers.map(p => ({ ...p, isHost: p.uid === msg.newHostUid }));
        if (currentRoom) { currentRoom.playing = false; currentRoom.host = msg.newHostUid; }
        showToast(`${esc(msg.quitterName || 'หัวห้อง')} หลุดออกจากเกม — ${esc(msg.newHostName)} เป็นหัวห้องคนใหม่`, 'warning');
        _returnToMpRoomView();
        appendChat('mp-room-chat', null, null, null, `${esc(msg.quitterName)} หลุด — ${esc(msg.newHostName)} เป็นหัวห้องคนใหม่`);
        renderRoomPlayers();
        updateRoomUI();
        break;
      }

      case 'host_quit_game': {
        // host กด quit ตั้งใจ → หยุดเกม + กลับหน้าห้อง (host ยังเป็นคนเดิม ไม่โอน)
        hideMpScorePanel();
        _stopGameAndAudio();
        isHost = msg.newHostUid === myUid;
        roomPlayers = roomPlayers.map(p => ({ ...p, isHost: p.uid === msg.newHostUid }));
        if (currentRoom) { currentRoom.playing = false; currentRoom.host = msg.newHostUid; }
        showToast(`${esc(msg.quitterName || 'หัวห้อง')} ออกจากเกม`, 'info');
        _returnToMpRoomView();
        appendChat('mp-room-chat', null, null, null, `${esc(msg.quitterName)} ออกจากเกม`);
        renderRoomPlayers();
        updateRoomUI();
        break;
      }
      case 'game_ready_check':
        // server สั่งให้เตรียมโหลดเพลง ส่ง game_loaded กลับเมื่อพร้อม
        handleGameReadyCheck(msg.song);
        break;
      case 'game_loaded_update':
        // อัปเดต progress UI — ไม่แสดงในแชท
        _updateReadyCheckProgress(msg.loaded, msg.total);
        break;
      case 'game_countdown':
        // แสดง overlay นับถอยหลัง — ไม่แสดงในแชท
        _showCountdownOverlay(msg.count);
        break;
      case 'game_start':
        handleGameStart(msg.song);
        break;
      case 'skip_vote_update':
        handleSkipVoteUpdate(msg);
        break;
      case 'live_scores':
        renderLiveScores(msg.players);
        break;
      case 'game_end':
        hideMpScorePanel();
        handleGameEnd(msg.finalScores);
        break;
      case 'error':
        showToast(msg.message || 'เกิดข้อผิดพลาด', 'error');
        break;
      case 'need_password':
        askPasswordAndJoin(msg.roomId, msg.roomName);
        break;
    }
  }

  // ===== Views =====
  function showLobbyView() {
    const lv = document.getElementById('mp-lobby-view');
    const rv = document.getElementById('mp-room-view');
    if (lv) lv.style.display = '';
    if (rv) rv.style.display = 'none';
    send({ type: 'get_rooms' });
  }

  function showRoomView() {
    const lv = document.getElementById('mp-lobby-view');
    const rv = document.getElementById('mp-room-view');
    if (lv) lv.style.display = 'none';
    if (rv) rv.style.display = '';
    renderRoomSong();
  }

  function leaveRoomLocal() {
    stopRoomPreview();
    currentRoom = null;
    isHost = false;
    roomPlayers = [];
    // Reset preload state
    _preloadedEntry = null;
    _preloadingSongId = null;
    _readyLockedByDownload = false;
    _mySkipVoted = false; window._mpSkipVoted = false;
    _pendingGameSong = null;
    _pendingGameEntry = null;
    // Clear meta cache ให้ fresh เมื่อเข้าห้องใหม่
    Object.keys(_playerMetaCache).forEach(k => delete _playerMetaCache[k]);
    showLobbyView();
  }

  function clearRoomChat() {
    const el = document.getElementById('mp-room-chat');
    if (el) el.innerHTML = '';
  }

  // ===== Room List =====
  function renderRoomList(rooms) {
    const el = document.getElementById('mp-room-list');
    if (!el) return;
    // Update online count badge
    const onlineEl = document.getElementById('mp-online-count');
    if (onlineEl) onlineEl.textContent = rooms ? rooms.reduce((s, r) => s + (r.players || 0), 0) : 0;
    if (!rooms || rooms.length === 0) {
      el.innerHTML = `<div class="mp-empty-hero"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><div class="mp-empty-hero-title">ยังไม่มีห้อง</div><div class="mp-empty-hero-sub">กด "+ สร้างห้อง" เพื่อเริ่มห้องใหม่เลย!</div></div>`;
      return;
    }
    el.innerHTML = rooms.map(r => {
      const lockIcon = r.hasPassword
        ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;opacity:0.6;margin-left:4px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` : '';
      const playingBadge = r.playing
        ? `<span style="display:inline-block;font-size:9px;background:rgba(255,93,143,0.18);color:#ff5d8f;border-radius:3px;padding:1px 5px;margin-left:5px;vertical-align:middle;"><svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><polygon points="5,3 19,12 5,21"/></svg> กำลังเล่น</span>` : '';
      const songText = r.song
        ? `${esc(r.song.title)}${r.song.version ? ' [' + esc(r.song.version) + ']' : ''}`
        : 'ยังไม่เลือกเพลง';
      const filledSlots = r.players || 0;
      const maxSlots = r.maxPlayers || 8;
      const slotsBar = Array.from({length: maxSlots}, (_, i) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:2px;background:${i < filledSlots ? 'var(--accent-magenta)' : 'rgba(255,255,255,0.12)'};"></span>`
      ).join('');
      return `
        <div class="mp-room-card" data-id="${esc(r.id)}" data-name="${esc(r.name)}" data-pass="${r.hasPassword?'1':'0'}">
          <div class="mp-room-card-thumb">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div class="mp-room-card-info">
            <div class="mp-room-card-name">${esc(r.name)}${lockIcon}${playingBadge}</div>
            <div class="mp-room-card-sub">${esc(r.host)} · ${songText}</div>
          </div>
          <div class="mp-room-card-count">
            ${slotsBar}
            <span style="margin-left:6px;font-size:11px;color:var(--text-dim);">${filledSlots}/${maxSlots}</span>
          </div>
        </div>`;
    }).join('');
    el.querySelectorAll('.mp-room-card').forEach(card => {
      card.addEventListener('click', () => {
        if (card.dataset.pass === '1') askPasswordAndJoin(card.dataset.id, card.dataset.name);
        else send({ type: 'join_room', roomId: card.dataset.id });
      });
    });
  }

  function askPasswordAndJoin(roomId, roomName) {
    const pw = prompt(`ห้อง "${roomName}" ต้องใช้รหัสผ่าน:`);
    if (pw !== null) send({ type: 'join_room', roomId, password: pw });
  }

  // ===== Room Players =====
  // Cache: uid → { avatarUrl, level, rank }
  const _playerMetaCache = {};

  async function fetchPlayerMeta(uid, fallbackAvatar) {
    if (_playerMetaCache[uid]) return _playerMetaCache[uid];
    const meta = { avatarUrl: fallbackAvatar, level: null, rank: null };
    try {
      // รูปจริงจาก server (เผื่อ user อัปโหลดรูปเองแทน Google)
      if (window.Auth?.fetchProfileImage) {
        const url = await window.Auth.fetchProfileImage(uid, 'avatar');
        if (url) meta.avatarUrl = url;
      }
    } catch(e) {}
    try {
      // Level จาก lifetimeScore
      if (window.Auth?.fetchLifetimeScore && window.GamePP?.levelFromTotalScore) {
        const ls = await window.Auth.fetchLifetimeScore(uid);
        meta.level = window.GamePP.levelFromTotalScore(ls);
      }
    } catch(e) {}
    try {
      // World rank
      const data = await (await fetch(`/api/ranking?uid=${encodeURIComponent(uid)}`)).json();
      if (data?.rank) meta.rank = data.rank;
    } catch(e) {}
    _playerMetaCache[uid] = meta;
    return meta;
  }

  function renderRoomPlayers() {
    const el = document.getElementById('mp-room-slots');
    if (!el) return;
    const MAX = 16;
    let html = '';
    for (let i = 0; i < MAX; i++) {
      const p = roomPlayers[i];
      if (!p) {
        html += `<div class="mp-slot mp-slot-empty"><span>ว่าง</span></div>`;
      } else {
        const isMe = p.uid === myUid;
        const meta = _playerMetaCache[p.uid];
        const avatarSrc = meta?.avatarUrl || p.avatar;
        const lvText  = meta?.level != null ? `Lv.${meta.level}` : '';
        const rkText  = meta?.rank  != null ? `#${meta.rank}` : '';
        html += `
          <div class="mp-slot ${p.ready ? 'mp-slot-ready' : ''} ${isMe ? 'mp-slot-me' : ''}" data-uid="${esc(p.uid)}">
            <div class="mp-slot-avatar">${avatarHtml(p.name, avatarSrc, 36)}</div>
            <div class="mp-slot-info">
              <div class="mp-slot-name">
                <button class="mp-slot-name-btn" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" data-photo="${esc(avatarSrc || '')}">${esc(p.name)}</button>
                ${p.isHost ? '<span class="mp-host-tag">HOST</span>' : ''}
              </div>
              <div class="mp-slot-meta">
                ${lvText ? `<span class="mp-slot-lv">${lvText}</span>` : ''}
                ${rkText ? `<span class="mp-slot-rank"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>${rkText}</span>` : ''}
              </div>
            </div>
            ${isHost && !isMe ? `
              <button class="btn-ghost mp-slot-kick" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" style="padding:3px 9px;font-size:11px;flex-shrink:0;margin-left:auto;">เตะ</button>
              <button class="btn-ghost mp-slot-transfer" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" style="padding:3px 9px;font-size:11px;flex-shrink:0;">โอน</button>
            ` : ''}
            <div class="mp-slot-status" style="${isHost && !isMe ? '' : 'margin-left:auto;'}flex-shrink:0;">
              ${p.finished ? '<span class="mp-ready-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-1px;margin-right:3px"><polyline points="20 6 9 17 4 12"/></svg>เล่นจบแล้ว</span>'
                : (currentRoom?.playing && (p.score > 0 || p.combo > 0 || p.ready)) ? '<span class="mp-slot-playing-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;margin-right:3px"><path d="M8 5v14l11-7z"/></svg>กำลังเล่น</span>'
                : currentRoom?.playing ? '<span class="mp-notready-tag">รอรอบหน้า</span>'
                : p.downloadStatus === 'downloading' ? '<span class="mp-slot-downloading-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:3px"><path d="M12 3v13M6 11l6 6 6-6"/><line x1="3" y1="21" x2="21" y2="21"/></svg>กำลังโหลด</span>'
                : p.ready ? '<span class="mp-ready-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-1px;margin-right:3px"><polyline points="20 6 9 17 4 12"/></svg>พร้อม</span>'
                : '<span class="mp-notready-tag">ยังไม่พร้อม</span>'}
            </div>
          </div>`;
      }
    }
    el.innerHTML = html;

    // Bind events
    el.querySelectorAll('.mp-slot-name-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window._openFriendProfile) {
          window._openFriendProfile(btn.dataset.uid, btn.dataset.name, btn.dataset.photo);
        }
      });
    });
    el.querySelectorAll('.mp-slot-kick').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(`เตะ ${btn.dataset.name} ออก?`)) send({ type: 'kick', targetUid: btn.dataset.uid });
      });
    });
    el.querySelectorAll('.mp-slot-transfer').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(`โอน host ให้ ${btn.dataset.name}?`)) send({ type: 'transfer_host', targetUid: btn.dataset.uid });
      });
    });

    // Fetch meta async for players without cache → re-render when done
    roomPlayers.forEach(p => {
      if (!p || _playerMetaCache[p.uid]) return;
      fetchPlayerMeta(p.uid, p.avatar).then(() => {
        // re-render only if still in this room
        if (currentRoom) renderRoomPlayers();
      });
    });
  }

  function updateRoomUI() {
    if (!currentRoom) return;
    const titleEl = document.getElementById('mp-room-title');
    if (titleEl) titleEl.textContent = currentRoom.name;

    // Show/hide playing banner
    let banner = document.getElementById('mp-room-playing-banner');
    if (currentRoom.playing) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'mp-room-playing-banner';
        banner.className = 'mp-room-playing-banner';
        banner.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:5px;opacity:0.8"><polygon points="5,3 19,12 5,21"/></svg> ห้องนี้กำลังเล่นอยู่ — รอให้ทุกคนเล่นจบก่อน';
        const slots = document.getElementById('mp-room-slots');
        if (slots) slots.parentNode.insertBefore(banner, slots);
      }
    } else {
      if (banner) banner.remove();
    }

    const hostBadge  = document.getElementById('mp-room-host-badge');
    const btnChange  = document.getElementById('btn-mp-change-room');
    const btnStart   = document.getElementById('btn-mp-start-game');
    const btnSong    = document.getElementById('btn-mp-change-song');
    const btnReady   = document.getElementById('btn-mp-ready');

    // Big action panel buttons
    const btnReadyBig  = document.getElementById('btn-mp-ready-big');
    const btnStartBig  = document.getElementById('btn-mp-start-big');
    const waitingLabel = document.getElementById('mp-waiting-label');

    if (hostBadge) hostBadge.style.display = isHost ? '' : 'none';
    if (btnChange)  btnChange.style.display = isHost ? '' : 'none';
    if (btnStart)   btnStart.style.display  = 'none'; // hidden — big panel takes over
    if (btnSong)    btnSong.style.display   = isHost ? '' : 'none';
    if (btnReady)   btnReady.style.display  = 'none'; // hidden — big panel takes over

    const me = roomPlayers.find(p => p.uid === myUid);
    const others = roomPlayers.filter(p => !p.isHost);
    const allReady = others.length > 0 && others.every(p => p.ready);
    // ต้องมีผู้เล่นอย่างน้อย 2 คน (รวมหัวห้อง) ถึงจะเริ่มเกมได้
    const hasEnoughPlayers = roomPlayers.filter(p => p && p.uid).length >= 2;
    const canStart = allReady && hasEnoughPlayers && currentRoom && currentRoom.song;

    if (isHost) {
      if (btnReadyBig) btnReadyBig.style.display = 'none';
      if (btnStartBig) {
        btnStartBig.style.display = '';
        btnStartBig.disabled = !canStart;
      }
      if (waitingLabel) waitingLabel.style.display = (!hasEnoughPlayers || others.length === 0) ? '' : 'none';
    } else {
      if (btnStartBig) btnStartBig.style.display = 'none';
      if (waitingLabel) waitingLabel.style.display = 'none';
      if (btnReadyBig && me) {
        btnReadyBig.style.display = '';
        const isReady = !!me.ready;
        const isDownloading = _readyLockedByDownload;
        // ล็อกปุ่มพร้อมระหว่างกำลังโหลดเพลงอยู่
        btnReadyBig.disabled = isDownloading;
        btnReadyBig.classList.toggle('mp-big-btn-unready', isReady && !isDownloading);
        const lbl = document.getElementById('btn-mp-ready-big-label');
        if (lbl) {
          if (isDownloading) {
            lbl.textContent = 'กำลังโหลดเพลง...';
          } else {
            lbl.textContent = isReady ? 'ยกเลิกพร้อม' : 'พร้อมแล้ว!';
          }
        }
      }
    }

    // Keep hidden original buttons in sync for any other code
    if (btnReady && me) {
      btnReady.textContent = me?.ready ? 'ยกเลิกพร้อม' : 'พร้อม!';
    }

    // Update ready summary panel
    _updateReadySummary();
  }

  function _updateReadySummary() {
    const summary = document.getElementById('mp-ready-summary');
    if (!summary) return;

    const players = roomPlayers.filter(p => p && p.uid);
    const total = players.length;
    const readyCount = players.filter(p => p.ready || p.isHost).length;
    const pct = total > 0 ? (readyCount / total) * 100 : 0;

    const fill = document.getElementById('mp-ready-bar-fill');
    const text = document.getElementById('mp-ready-summary-text');
    const avatars = document.getElementById('mp-ready-avatars');

    if (fill) {
      fill.style.width = pct + '%';
      fill.style.background = pct === 100
        ? 'linear-gradient(90deg, #1ac8b0, #0e9f8a)'
        : 'linear-gradient(90deg, var(--accent-magenta), #e0335c)';
    }
    if (text) {
      text.textContent = readyCount + ' / ' + total + ' พร้อม';
      text.style.color = pct === 100 ? 'var(--accent-teal)' : 'var(--text-dim)';
    }
    if (avatars) {
      avatars.innerHTML = players.map(p => {
        const meta = _playerMetaCache[p.uid];
        const src = meta?.avatarUrl || p.avatar || '';
        const isReady = p.ready || p.isHost;
        const initial = (p.name || '?')[0].toUpperCase();
        const imgTag = src
          ? `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
          : `<span style="font-size:11px;font-weight:700;">${initial}</span>`;
        return `<div class="mp-ready-avatar-dot ${isReady ? 'is-ready' : ''}" title="${p.name}" data-uid="${p.uid}">${imgTag}</div>`;
      }).join('');

      // fetch meta สำหรับ player ที่ยังไม่มี cache แล้ว update รูป
      players.forEach(p => {
        if (_playerMetaCache[p.uid]?.avatarUrl) return;
        fetchPlayerMeta(p.uid, p.avatar).then(meta => {
          if (!meta?.avatarUrl) return;
          const dot = avatars.querySelector(`[data-uid="${p.uid}"]`);
          if (!dot) return;
          dot.innerHTML = `<img src="${meta.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" referrerpolicy="no-referrer">`;
        });
      });
    }
  }

  // ===== Room preview player =====
  let _roomPreviewPlaying = false;  // track สถานะ play/pause ของปุ่มในห้อง

  function _setRoomPreviewBtn(playing) {
    _roomPreviewPlaying = playing;
    const btn  = document.getElementById('btn-mp-room-preview');
    if (!btn) return;
    const iconPlay  = btn.querySelector('.mp-preview-icon-play');
    const iconPause = btn.querySelector('.mp-preview-icon-pause');
    if (playing) {
      btn.classList.add('is-playing');
      if (iconPlay)  iconPlay.style.display  = 'none';
      if (iconPause) iconPause.style.display  = '';
    } else {
      btn.classList.remove('is-playing');
      if (iconPlay)  iconPlay.style.display  = '';
      if (iconPause) iconPause.style.display  = 'none';
    }
  }

  // หา audioUrl จาก library ของ song ที่เลือกในห้องตอนนี้
  async function _getRoomSongAudioUrl(song) {
    if (!song) return null;
    const entries = window._getLibraryEntries ? window._getLibraryEntries() : [];
    let entry = null;
    if (song.entryId) entry = entries.find(e => String(e.id) === String(song.entryId));
    if (!entry && song.songId) {
      const numId = String(song.songId).replace(/\D/g, '');
      if (numId) entry = entries.find(e => String(e.beatmapSetId) === numId);
    }
    if (!entry) return null;
    try {
      const pack = await window.SongLibrary.loadPack(entry);
      if (!pack?.maps) return null;
      const map = song.version
        ? pack.maps.find(m => m.version === song.version) || pack.maps[0]
        : pack.maps[0];
      return map?.audioUrl || null;
    } catch { return null; }
  }

  // เล่น preview ในห้อง (เรียกตอนเพลงเปลี่ยน หรือ user กดปุ่ม play)
  async function startRoomPreview() {
    const song = currentRoom?.song;
    if (!song || !window._playPreview) return;
    const url = await _getRoomSongAudioUrl(song);
    if (!url) return;
    window._playPreview(url, { loop: true });
    _setRoomPreviewBtn(true);
  }

  function stopRoomPreview() {
    if (window._stopPreview) window._stopPreview();
    _setRoomPreviewBtn(false);
  }

  async function renderRoomSong() {
    const el  = document.getElementById('mp-room-song');
    const btn = document.getElementById('btn-mp-room-preview');
    const statsGrid = document.getElementById('mp-room-song-stats');
    if (!el) return;
    const song = currentRoom?.song;

    // หยุด preview เดิมก่อนเสมอ
    stopRoomPreview();

    if (!song) {
      el.className = 'mp-song-banner';
      el.style.backgroundImage = 'none';
      el.innerHTML = `<div class="mp-song-banner-info"><span class="mp-song-banner-title" style="color:var(--text-dim);font-weight:400;font-size:12px;">ยังไม่ได้เลือกเพลง</span></div>`;
      if (btn) btn.style.display = 'none';
      // Reset stats to dashes but keep strip visible
      ['mp-stat-key','mp-stat-bpm','mp-stat-star','mp-stat-dur','mp-stat-od','mp-stat-notes','mp-stat-ln','mp-stat-diff'].forEach(id => {
        const el2 = document.getElementById(id); if (el2) el2.textContent = '—';
      });
      if (statsGrid) statsGrid.style.display = 'flex';
      return;
    }

    // ก่อน resolve — render title/artist ก่อนเพื่อให้เห็นทันที
    el.className = 'mp-song-banner';
    el.style.backgroundImage = song.bgUrl ? `url('${esc(song.bgUrl)}')` : 'none';
    const versionTag = song.version ? `<span class="mp-song-banner-diff">${esc(song.version)}</span>` : '';
    const artistText0 = song.creator ? `${song.artist || ''} · by ${song.creator}` : (song.artist || '');
    el.innerHTML = `
      <div class="mp-song-banner-info">
        <span class="mp-song-banner-title">${esc(song.title)}</span>
        <span class="mp-song-banner-artist">${esc(artistText0)}</span>
        ${versionTag}
      </div>`;
    if (btn) btn.style.display = 'flex';

    
    
    
    
    let s = { ...song };
    {
      try {
        const entries = window._getLibraryEntries ? window._getLibraryEntries() : [];
        let entry = null;
        if (s.entryId) entry = entries.find(e => String(e.id) === String(s.entryId));
        if (!entry && s.songId) {
          const numId = String(s.songId).replace(/\D/g, '');
          if (numId) entry = entries.find(e => String(e.beatmapSetId) === numId);
        }
        if (entry) {
          const pack = await window.SongLibrary.loadPack(entry);
          if (pack?.maps) {
            let map = s.version
              ? pack.maps.find(m => m.version === s.version) || pack.maps[0]
              : pack.maps[0];
            if (map) {
              // ถ้าเป็นแมพที่แปลงจาก std และคนเลือกคีย์ไม่ใช่ค่า default (4K) ที่โหลดมาตอนแรก
              // ต้องแปลงใหม่ให้ตรงกับคีย์ที่ host เลือกจริง ไม่ใช่แค่เปลี่ยนตัวเลขที่แสดง
              // (ไม่งั้น UI จะบอกว่า 7K แต่ตัวโน้ตที่โหลดจริงยังเป็น 4K)
              if (map.convertedFromStandard && s.keyCount != null && s.keyCount !== map.keyCount && map.stdSourceText) {
                try {
                  const reconverted = window.StdToManiaBridge.convertStdOsuToMania(map.stdSourceText, s.keyCount);
                  if (reconverted && reconverted.hitObjects.length > 0) {
                    map.beatmap = reconverted;
                    map.keyCount = reconverted.keyCount;
                    map.noteCount = reconverted.hitObjects.length;
                    map.lnCount = reconverted.hitObjects.filter(h => h.isLongNote).length;
                    map.duration = reconverted.hitObjects.length > 0 ? Math.max(...reconverted.hitObjects.map(h => h.endTime)) : 0;
                    map.stdCurrentColumns = s.keyCount;
                    map._starRating = null;
                  }
                } catch (e) {
                  console.warn('แปลงคีย์ตาม host ไม่สำเร็จ ใช้ค่า default แทน', e);
                }
              }
              const calcStar = window._calcStarRating || (() => null);
              if (map._starRating == null) map._starRating = calcStar(map) ?? null;
              s = {
                ...s,
                bgUrl:      s.bgUrl      || map.backgroundUrl || '',
                keyCount:   s.keyCount   ?? map.keyCount,
                bpm:        s.bpm        ?? map.bpm,
                starRating: s.starRating ?? map._starRating,
                duration:   s.duration   ?? map.duration,
                od:         s.od         ?? map.od,
                noteCount:  s.noteCount  ?? map.noteCount,
                lnCount:    s.lnCount    ?? map.lnCount,
                creator:    s.creator    ?? map.creator,
              };
              // เก็บ pack/entry/map ที่ enrich แล้วไว้ใช้ตอนกดเริ่มเกมจริง (กันโหลดซ้ำ + กันได้ map คนละคีย์)
              window._mpRoomResolvedSong = { pack, entry, map };
              // อัปเดต banner รูปถ้าได้ bgUrl มาใหม่
              if (s.bgUrl && !song.bgUrl) {
                el.style.backgroundImage = `url('${esc(s.bgUrl)}')`;
              }
              // อัปเดตชื่อ/ศิลปิน/ผู้สร้างใน banner ด้วยข้อมูลจาก .osu (แทนชื่อไฟล์ .osz)
              const realTitle  = map.titleUnicode  || map.title  || s.title;
              const realArtist = map.artistUnicode || map.artist || s.artist || '';
              const realArtistText = s.creator ? `${realArtist} · by ${s.creator}` : realArtist;
              const titleEl  = el.querySelector('.mp-song-banner-title');
              const artistEl = el.querySelector('.mp-song-banner-artist');
              if (titleEl && titleEl.textContent !== realTitle) titleEl.textContent = realTitle;
              if (artistEl && artistEl.textContent !== realArtistText) artistEl.textContent = realArtistText;
            }
          }
        }
      } catch(e) {  }
    }

    
    if (statsGrid) {
      const fmtMs = (ms) => {
        if (!ms) return '—';
        const sec = Math.round(ms / 1000);
        return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
      };
      const def = (v, fmt) => (v != null && v !== '') ? (fmt ? fmt(v) : String(v)) : '—';

      document.getElementById('mp-stat-key').textContent   = s.keyCount  ? `${s.keyCount}K` : '—';
      document.getElementById('mp-stat-bpm').textContent   = def(s.bpm, v => Math.round(v));
      document.getElementById('mp-stat-star').textContent  = def(s.starRating, v => window.ManiaStarRating.formatStarRating(Number(v)));
      document.getElementById('mp-stat-dur').textContent   = fmtMs(s.duration);
      document.getElementById('mp-stat-od').textContent    = def(s.od, v => Number(v).toFixed(1));
      document.getElementById('mp-stat-notes').textContent = def(s.noteCount);
      document.getElementById('mp-stat-ln').textContent    = def(s.lnCount);
      document.getElementById('mp-stat-diff').textContent  = s.version || '—';
      document.getElementById('mp-stat-diff').title        = s.version || '';
      statsGrid.style.display = 'flex';
    }

    startRoomPreview();
  }

  
  function appendChat(containerId, uid, name, avatar, text) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const isSystem = !uid;
    const isMe = uid === myUid;
    
    const cachedAvatar = uid && _playerMetaCache[uid]?.avatarUrl;
    const avatarSrc = cachedAvatar || avatar;
    if (isSystem) {
      el.insertAdjacentHTML('beforeend', `<div class="mp-chat-system">${esc(text)}</div>`);
    } else {
      const msgId = `chat-msg-${uid}-${Date.now()}`;
      el.insertAdjacentHTML('beforeend', `<div class="mp-chat-msg ${isMe ? 'mp-chat-me' : ''}" id="${msgId}">
           <div class="mp-chat-avatar">${avatarHtml(name, avatarSrc, 22)}</div>
           <div class="mp-chat-bubble">
             <span class="mp-chat-name">${esc(name)}</span>
             <span class="mp-chat-text">${esc(text)}</span>
           </div>
         </div>`);
      
      if (!cachedAvatar && uid) {
        fetchPlayerMeta(uid, avatar).then(meta => {
          if (!meta?.avatarUrl) return;
          const msgEl = document.getElementById(msgId);
          if (!msgEl) return;
          const avEl = msgEl.querySelector('.mp-chat-avatar');
          if (avEl) avEl.innerHTML = avatarHtml(name, meta.avatarUrl, 22);
        });
      }
    }
    el.scrollTop = el.scrollHeight;
  }

  
  async function handleGameReadyCheck(song) {
    if (!song) return;
    stopRoomPreview();
    if (currentRoom) currentRoom.playing = true;
    updateRoomUI();
    _mySkipVoted = false; window._mpSkipVoted = false; 
    
    _showReadyCheckBar();
    
    let entry = _preloadedEntry || _findEntryForSong(song);
    if (!entry && song.songId) {
      
      const numId = String(song.songId).replace(/\D/g, '');
      if (numId) {
        send({ type: 'song_download_status', status: 'downloading' });
        const progressBar = _showDownloadProgress(song.title || 'เพลง');
        try {
          const resp = await fetch(`/api/beatmap/download/${numId}`);
          if (resp.ok) {
            const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
            const chunks = [];
            const reader = resp.body.getReader();
            let received = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              received += value.length;
              _updateDownloadProgress(progressBar, total > 0 ? Math.round(received/total*100) : -1, received);
            }
            const fileName = `${numId} ${song.title || numId}.osz`.replace(/[\\/:*?"<>|]/g, '_');
            const file = new File([new Blob(chunks)], fileName, { type: 'application/octet-stream' });
            entry = window.SongLibrary.addUploadedFile(file, 'mirror');
            if (entry) {
              entry.beatmapSetId = song.songId;
              if (window._addLibraryEntry) window._addLibraryEntry(entry);
              _preloadedEntry = entry;
            }
            _hideDownloadProgress(progressBar, true);
          } else {
            _hideDownloadProgress(progressBar, false);
          }
        } catch(e) {
          _hideDownloadProgress(progressBar, false);
        }
        send({ type: 'song_download_status', status: 'done' });
      }
    }
    // ยืนยันว่าพร้อม
    send({ type: 'game_loaded' });
    // เก็บ song ไว้รอ game_start
    _pendingGameSong = song;
    _pendingGameEntry = entry;
  }

  // ===== Ready Check Progress Bar (แสดงแทน chat message) =====
  function _showReadyCheckBar() {
    let bar = document.getElementById('mp-ready-check-bar');
    if (bar) { bar.style.display = 'flex'; return; }
    bar = document.createElement('div');
    bar.id = 'mp-ready-check-bar';
    bar.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 14px;background:rgba(255,209,102,0.08);border-bottom:1px solid rgba(255,209,102,0.15);font-size:12px;color:var(--accent-amber);';
    bar.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;animation:spin 1.2s linear infinite">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span id="mp-ready-check-text">กำลังรอผู้เล่นทุกคนโหลดเพลง...</span>
      <div style="flex:1;background:rgba(255,255,255,0.08);border-radius:3px;height:3px;overflow:hidden;">
        <div id="mp-ready-check-fill" style="height:100%;background:var(--accent-amber);width:0%;transition:width 0.3s;"></div>
      </div>`;
    const roomSong = document.getElementById('mp-room-song');
    if (roomSong) roomSong.after(bar);
  }
  function _updateReadyCheckProgress(loaded, total) {
    const fill = document.getElementById('mp-ready-check-fill');
    const text = document.getElementById('mp-ready-check-text');
    if (fill) fill.style.width = (total > 0 ? Math.round(loaded/total*100) : 0) + '%';
    if (text) text.textContent = `ผู้เล่นพร้อม ${loaded}/${total} คน...`;
    if (loaded >= total) {
      // ทุกคนพร้อมแล้ว — ซ่อน bar หลัง countdown จบ
      const bar = document.getElementById('mp-ready-check-bar');
      if (bar) {
        const icon = bar.querySelector('svg');
        if (icon) icon.style.animation = '';
        if (text) text.textContent = `ผู้เล่นพร้อมครบ ${loaded}/${total} คน — กำลังนับถอยหลัง...`;
      }
    }
  }
  function _hideReadyCheckBar() {
    const bar = document.getElementById('mp-ready-check-bar');
    if (bar) bar.remove();
  }

  // ===== Countdown Overlay =====
  function _showCountdownOverlay(count) {
    let overlay = document.getElementById('mp-countdown-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mp-countdown-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;pointer-events:none;';
      overlay.innerHTML = `
        <div id="mp-countdown-inner" style="text-align:center;">
          <div id="mp-countdown-num" style="font-size:clamp(80px,15vw,140px);font-weight:900;font-family:var(--font-display,sans-serif);color:#fff;text-shadow:0 0 40px rgba(110,231,224,0.6),0 4px 20px rgba(0,0,0,0.8);line-height:1;transition:transform 0.15s,opacity 0.15s;"></div>
          <div id="mp-countdown-label" style="font-size:18px;color:rgba(255,255,255,0.6);margin-top:8px;font-family:var(--font-display,sans-serif);letter-spacing:3px;text-transform:uppercase;"></div>
        </div>`;
      document.body.appendChild(overlay);
    }
    const numEl = document.getElementById('mp-countdown-num');
    const labelEl = document.getElementById('mp-countdown-label');
    if (count > 0) {
      numEl.textContent = count;
      numEl.style.color = '#fff';
      numEl.style.textShadow = '0 0 40px rgba(110,231,224,0.6),0 4px 20px rgba(0,0,0,0.8)';
      labelEl.textContent = 'เริ่มใน';
      // pop animation
      numEl.style.transform = 'scale(1.3)';
      numEl.style.opacity = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        numEl.style.transform = 'scale(1)';
      }));
    } else {
      numEl.textContent = 'GO!';
      numEl.style.color = 'var(--accent-teal, #6ee7e0)';
      numEl.style.textShadow = '0 0 60px rgba(110,231,224,0.9),0 4px 30px rgba(0,0,0,0.8)';
      labelEl.textContent = '';
      numEl.style.transform = 'scale(1.4)';
      numEl.style.opacity = '1';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        numEl.style.transform = 'scale(1)';
      }));
      // ซ่อน overlay หลัง 800ms
      setTimeout(() => {
        if (overlay) overlay.remove();
        _hideReadyCheckBar();
      }, 800);
    }

  }

  let _pendingGameSong = null;
  let _pendingGameEntry = null;

  // ===== Skip Vote =====
  let _mySkipVoted = false;
  window._mpSkipVoted = false;

  function handleSkipVoteUpdate(msg) {
    if (msg.doSkip) {
      // ทุกคนโหวตครบแล้ว — skip จริง
      _mySkipVoted = false; window._mpSkipVoted = false;
      window._mpSkipVoted = false;
      const skipBtnLabel = document.getElementById('skipBtnLabel');
      if (skipBtnLabel) skipBtnLabel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:4px"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="4" x2="19" y2="20"/></svg>โหวตข้าม';
      if (window.currentGame) window.currentGame.trySkip(true);
    }
    // ไม่แสดงข้อความในแชท
  }

  // expose สำหรับ app.js ให้เรียกตอนกด skip ใน MP mode
  window.mpVoteSkip = function() {
    if (_mySkipVoted) return;
    _mySkipVoted = true;
    window._mpSkipVoted = true;
    send({ type: 'vote_skip' });
    // อัปเดตปุ่มให้ดูว่า pending รอคนอื่น
    const skipBtnLabel = document.getElementById('skipBtnLabel');
    if (skipBtnLabel) skipBtnLabel.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:4px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>รอผู้เล่นอื่น...';
  };

  // ===== In-Game =====
  async function handleGameStart(song) {
    if (!song) return showToast('ห้องนี้ยังไม่เลือกเพลง', 'error');
    stopRoomPreview();
    _hideReadyCheckBar();
    // Safety net: ล้าง countdown overlay ทันที เผื่อ game_start มาก่อน timeout 800ms ของ "GO!" จะลบมันเอง
    const _cdOverlay = document.getElementById('mp-countdown-overlay');
    if (_cdOverlay) _cdOverlay.remove();
    if (currentRoom) currentRoom.playing = true;
    updateRoomUI();

    // ใช้ entry ที่โหลดไว้ล่วงหน้าก่อน (จาก ready check หรือ _autoDownloadSongForRoom)
    let entry = _pendingGameEntry || _preloadedEntry || _findEntryForSong(song);
    _pendingGameSong = null;
    _pendingGameEntry = null;

    if (!entry && song.songId) {
      // ยังไม่มีเพลงในเครื่อง — โหลดด่วน (กรณีที่ _autoDownloadSongForRoom ไม่ได้ทำงาน)
      send({ type: 'song_download_status', status: 'downloading' });
      const progressBar = _showDownloadProgress(song.title || 'เพลงใหม่');
      try {
        const id = String(song.songId).replace(/\D/g, '');
        if (id) {
          const resp = await fetch(`/api/beatmap/download/${id}`);
          if (resp.ok) {
            const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
            const chunks = [];
            const reader = resp.body.getReader();
            let received = 0;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              received += value.length;
              _updateDownloadProgress(progressBar, total > 0 ? Math.round(received/total*100) : -1, received);
            }
            const fileName = `${id} ${song.title || id}.osz`.replace(/[\\/:*?"<>|]/g, '_');
            const file = new File([new Blob(chunks)], fileName, { type: 'application/octet-stream' });
            entry = window.SongLibrary.addUploadedFile(file, 'mirror');
            if (entry) {
              entry.beatmapSetId = song.songId;
              if (window._addLibraryEntry) window._addLibraryEntry(entry);
            }
            _hideDownloadProgress(progressBar, true);
          } else {
            _hideDownloadProgress(progressBar, false);
          }
        }
      } catch(e) {
        console.warn('[MP] fallback download failed:', e);
        _hideDownloadProgress(progressBar, false);
      }
      send({ type: 'song_download_status', status: 'done' });
    }

    if (window._startMultiplayerGame) window._startMultiplayerGame(song, entry);
    showMpScorePanel();
  }

  // ===== Shared: หา entry ใน local library สำหรับ song object จาก server =====
  function _findEntryForSong(song) {
    const allEntries = window._getLibraryEntries ? window._getLibraryEntries() : [];
    let entry = null;
    if (song.entryId) {
      entry = allEntries.find(e => String(e.id) === String(song.entryId));
    }
    if (!entry && song.songId) {
      const numId = String(song.songId).replace(/\D/g, '');
      if (numId) {
        entry = allEntries.find(e =>
          String(e.beatmapSetId) === numId ||
          (e.source === 'mirror' && (e.name || '').startsWith(numId))
        );
      }
    }
    if (!entry && song.title) {
      const tl = song.title.toLowerCase();
      entry = allEntries.find(e => (e._preview?.title || e.name || '').toLowerCase() === tl);
    }
    return entry;
  }

  // Track entry ที่โหลดเสร็จแล้ว สำหรับ song ที่ห้องเลือกอยู่ตอนนี้
  // key = songId (string), value = entry object หลังโหลดเสร็จ
  let _preloadedEntry = null;       // entry ที่โหลดเสร็จและพร้อมเล่น
  let _preloadingSongId = null;     // songId ที่กำลังโหลดอยู่ (ป้องกัน race condition)
  let _readyLockedByDownload = false; // ล็อกปุ่ม "พร้อม" ระหว่างโหลดอยู่

  // โหลดเพลงทันทีที่ host เลือก (เรียกจาก room_song handler)
  async function _autoDownloadSongForRoom(song) {
    if (!song?.songId) return;
    const songId = String(song.songId);

    // ถ้ามีในเครื่องแล้ว → set preloaded แล้วอนุญาตกดพร้อมได้เลย
    const existing = _findEntryForSong(song);
    if (existing) {
      _preloadedEntry   = existing;
      _preloadingSongId = songId;
      _readyLockedByDownload = false;
      updateRoomUI(); // ปลดล็อกปุ่มพร้อม
      renderRoomSong(); // entry พร้อมแล้ว — ลอง enrich Beatmap panel ใหม่
      return;
    }

    // ไม่มีในเครื่อง → ล็อกปุ่มพร้อม + โหลดอัตโนมัติ
    const numId = songId.replace(/\D/g, '');
    if (!numId) return; // เพลงจากโฟลเดอร์ — ไม่ download ได้
    _preloadedEntry   = null;
    _preloadingSongId = songId;
    _readyLockedByDownload = true;
    updateRoomUI(); // ล็อกปุ่มพร้อม

    send({ type: 'song_download_status', status: 'downloading' });
    const progressBar = _showDownloadProgress(song.title || 'เพลง');

    try {
      const resp = await fetch(`/api/beatmap/download/${numId}`);
      if (!resp.ok) throw new Error(`mirror ตอบ ${resp.status}`);

      const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
      const chunks = [];
      const reader = resp.body.getReader();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // ถ้า song เปลี่ยนระหว่างโหลด → ยกเลิก
        if (_preloadingSongId !== songId) {
          _hideDownloadProgress(progressBar, false);
          return;
        }
        chunks.push(value);
        received += value.length;
        _updateDownloadProgress(progressBar, total > 0 ? Math.round(received/total*100) : -1, received);
      }

      const fileName = `${numId} ${song.title || numId}.osz`.replace(/[\\/:*?"<>|]/g, '_');
      const file = new File([new Blob(chunks)], fileName, { type: 'application/octet-stream' });
      const entry = window.SongLibrary.addUploadedFile(file, 'mirror');
      if (entry) {
        entry.beatmapSetId = song.songId;
        if (window._addLibraryEntry) window._addLibraryEntry(entry);
      }

      _preloadedEntry = entry;
      _hideDownloadProgress(progressBar, true);
      appendChat('mp-room-chat', null, null, null, `โหลด "${song.title}" เสร็จแล้ว — กดพร้อมได้เลย!`);
      renderRoomSong(); 
    } catch (e) {
      console.warn('[MP] auto-download failed:', e);
      _preloadedEntry = null;
      _hideDownloadProgress(progressBar, false);
      appendChat('mp-room-chat', null, null, null, `โหลดเพลงไม่สำเร็จ — ลองเลือกเพลงใหม่`);
    }

    _readyLockedByDownload = false;
    send({ type: 'song_download_status', status: 'done' });
    updateRoomUI(); 
  }

  
  function _showDownloadProgress(title) {
    const el = document.createElement('div');
    el.className = 'mp-dl-progress-bar';
    el.innerHTML = `<span class="mp-dl-label"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="vertical-align:-1px;margin-right:4px"><path d="M12 3v13M6 11l6 6 6-6"/><path d="M3 21h18"/></svg>กำลังโหลด <b>${title}</b></span>
      <div class="mp-dl-track"><div class="mp-dl-fill indeterminate"></div></div>
      <span class="mp-dl-pct"></span>`;
    const roomSong = document.getElementById('mp-room-song');
    if (roomSong) roomSong.after(el);
    return el;
  }
  function _updateDownloadProgress(el, pct, bytes) {
    if (!el) return;
    const fill = el.querySelector('.mp-dl-fill');
    const pctEl = el.querySelector('.mp-dl-pct');
    if (pct >= 0) {
      if (fill) { fill.classList.remove('indeterminate'); fill.style.width = pct + '%'; }
      if (pctEl) pctEl.textContent = pct + '%';
    } else {
      if (fill) fill.classList.add('indeterminate');
      if (pctEl) pctEl.textContent = `${(bytes/1024/1024).toFixed(1)} MB`;
    }
  }
  function _hideDownloadProgress(el, success) {
    if (!el) return;
    if (success) {
      el.innerHTML = `<span style="color:var(--accent-teal);">โหลดเพลงเสร็จแล้ว</span>`;
      setTimeout(() => el.remove(), 3000);
    } else {
      el.innerHTML = `<span style="color:var(--accent-magenta);">โหลดไม่สำเร็จ</span>`;
      setTimeout(() => el.remove(), 4000);
    }
  }

  function showMpScorePanel() {
    const el = document.getElementById('mp-score-panel');
    if (el) el.style.display = '';
  }

  function hideMpScorePanel() {
    const el = document.getElementById('mp-score-panel');
    if (el) el.style.display = 'none';
    _liveScorePrev = {}; 
  }

  
  function handleGameEnd(finalScores) {
    if (currentRoom) currentRoom.playing = false;
    updateRoomUI();
    
    const overlay = document.getElementById('mp-result-overlay');
    if (overlay && overlay.style.display === 'flex') {
      _populateMpResult(finalScores);
    } else {
      
      _pendingFinalScores = finalScores;
    }
  }

  let _pendingFinalScores = null;
  let _mpResultMySnap = null;
  let _mpResultMapTitleUnicode = null; 
  let _mpResultMapVersion = null;      

  
  window.mpShowResultWaiting = function(map, snap) {
    _mpResultMySnap = snap;
    _mpResultMapTitleUnicode = map?.titleUnicode || null;
    _mpResultMapVersion = map?.version || null;
    const overlay = document.getElementById('mp-result-overlay');
    if (!overlay) return;
    
    const songNameEl = document.getElementById('mp-result-song-name');
    if (songNameEl) songNameEl.textContent = (map?.titleUnicode || map?.title || currentRoom?.song?.title || '') + (map?.version ? ` [${map.version}]` : '');
    // Show waiting spinner
    const waitEl = document.getElementById('mp-result-waiting');
    if (waitEl) waitEl.style.display = 'flex';
    
    const listEl = document.getElementById('mp-result-list');
    if (listEl) listEl.innerHTML = '';
    overlay.style.display = 'flex';

    
    if (_pendingFinalScores) {
      _populateMpResult(_pendingFinalScores);
      _pendingFinalScores = null;
    }
  };

  function _populateMpResult(finalScores) {
    const overlay = document.getElementById('mp-result-overlay');
    if (!overlay) return;
    const waitEl = document.getElementById('mp-result-waiting');
    if (waitEl) waitEl.style.display = 'none';
    const listEl = document.getElementById('mp-result-list');
    if (!listEl) return;
    if (!finalScores || !finalScores.length) return;

    
    const trophyEl = document.getElementById('mp-result-trophy');
    if (trophyEl) trophyEl.innerHTML = finalScores.length >= 2
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/><path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;

    
    function computeMpGrade(acc, missCount) {
      missCount = missCount || 0;
      if (missCount === 0 && acc >= 100) return 'X';
      if (missCount === 0 && acc >= 98)  return 'S+';
      if (acc >= 95) return 'S';
      if (acc >= 88) return 'A';
      if (acc >= 75) return 'B';
      if (acc >= 60) return 'C';
      return 'D';
    }

    
    function medalSvg(rank) {
      const colors = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
      const c = colors[rank];
      if (!c) return `<span style="font-size:13px;color:rgba(255,255,255,0.4);font-weight:700;">#${rank}</span>`;
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="6" fill="${c}22"/>
        <path d="M8 14l-2 6 6-2 6 2-2-6"/>
        <text x="12" y="12" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="900" fill="${c}" stroke="none">${rank}</text>
      </svg>`;
    }

    listEl.innerHTML = finalScores.map((p, i) => {
      const isMe = p.uid === myUid;
      const isWinner = p.rank === 1;
      const posClass = p.rank <= 3 ? `pos-${p.rank}` : '';
      const avatarHtmlStr = avatarHtml(p.name, (_playerMetaCache[p.uid]?.avatarUrl || p.avatar), 36);
      const jc = p.judgeCounts || null;
      const missCount = jc ? (jc.MISS || 0) : 0;
      const gradeKey = computeMpGrade(p.acc || 0, missCount);
      const gradeBadge = `<span class="mp-result-grade mp-result-grade-${gradeKey.replace('+','-plus')}">${gradeKey}</span>`;
      const skippedNote = p.skipped ? `<div class="mp-result-skipped"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> หมดเวลา</div>` : '';
      // รายละเอียด judge breakdown — แสดงถ้ามีข้อมูล (ผู้เล่นเก่าที่ไม่ส่ง judgeCounts มาจะไม่มีแถวนี้)
      const judgeDetail = jc ? `
            <div class="mp-result-judges">
              <span class="mp-result-judge mp-result-judge-perfect" title="Perfect">P <b>${jc.PERFECT||0}</b></span>
              <span class="mp-result-judge mp-result-judge-great" title="Great">G <b>${jc.GREAT||0}</b></span>
              <span class="mp-result-judge mp-result-judge-good" title="Good">Gd <b>${jc.GOOD||0}</b></span>
              <span class="mp-result-judge mp-result-judge-bad" title="Bad">B <b>${jc.BAD||0}</b></span>
              <span class="mp-result-judge mp-result-judge-miss" title="Miss">M <b>${jc.MISS||0}</b></span>
              <span class="mp-result-judge mp-result-judge-maxcombo" title="Max Combo">MAX <b>${(p.maxCombo||p.combo||0).toLocaleString()}x</b></span>
            </div>` : '';
      const delay = `animation-delay:${i * 0.07}s`;
      return `
        <div class="mp-result-row ${isMe ? 'mp-result-me' : ''} ${isWinner ? 'mp-result-winner' : ''}" style="${delay}">
          <div class="mp-result-pos ${posClass}">${medalSvg(p.rank)}</div>
          ${avatarHtmlStr}
          <div class="mp-result-info">
            <div class="mp-result-name">${esc(p.name)}${isMe ? ' <span style="font-size:10px;opacity:0.6;">(คุณ)</span>' : ''}</div>
            <div class="mp-result-sub">
              <span class="mp-result-stat-chip">COMBO <b>${(p.combo||0).toLocaleString()}x</b></span>
              <span class="mp-result-stat-chip">ACC <b>${(p.acc||0).toFixed(2)}%</b></span>
              ${gradeBadge}
            </div>
            ${judgeDetail}
            ${skippedNote}
          </div>
          <div class="mp-result-score-col">
            <div class="mp-result-score-val">${(p.score||0).toLocaleString()}</div>
          </div>
        </div>`;
    }).join('');

    // Submit คะแนนของตัวเองขึ้น leaderboard (เหมือนเล่นปกติ)
    const myScore = finalScores.find(p => p.uid === myUid);
    if (myScore && window.Auth?.user && window.Auth?.submitScore) {
      const snap = _mpResultMySnap;
      const song = currentRoom?.song;
      if (snap && song) {
        // สร้าง songId ในรูปแบบเดียวกับ app.js เป๊ะๆ: "${titleUnicode} [${version}]"
        // ใช้ค่าจาก map object โดยตรง (ที่ app.js ส่งมาผ่าน mpShowResultWaiting)
        // ไม่ใช้ song.title (pack name จากชื่อไฟล์) เพราะอาจต่างจาก titleUnicode ใน .osu
        const mpTitleUnicode = _mpResultMapTitleUnicode || song.title;
        const mpVersion = _mpResultMapVersion || song.version;
        const songId = `${mpTitleUnicode}${mpVersion ? ' [' + mpVersion + ']' : ''}`;
        const grade = computeMpGrade(snap.accuracy || myScore.acc || 0, snap.judgeCounts?.MISS || 0);
        window.Auth.submitScore({
          songId,
          beatmapSetId: song.entryId ? null : (song.songId || null),
          score: snap.score || myScore.score || 0,
          accuracy: snap.accuracy || myScore.acc || 0,
          rank: grade,
          judgeCounts: snap.judgeCounts || {},
          maxCombo: snap.maxCombo || myScore.combo || 0,
        }).then(res => {
          if (res?.saved && window.showPPGainToast && window.GamePP) {
            const _scorePP = window.GamePP.calcScorePP?.({ accuracy: snap.accuracy, maxCombo: snap.maxCombo }) || 0;
            setTimeout(() => window.showPPGainToast({
              accuracy: snap.accuracy,
              maxCombo: snap.maxCombo,
              scorePP: _scorePP,
              isBest: res.best && res.best.score === snap.score,
              lifetimeScoreAfter: res.lifetimeScore,
              scoreGained: snap.score,
            }), 600);
          }
        }).catch(() => {});
      }
    }
  }

  function closeMpResult() {
    const overlay = document.getElementById('mp-result-overlay');
    if (overlay) overlay.style.display = 'none';
    _mpResultMySnap = null;
    _mpResultMapTitleUnicode = null;
    _mpResultMapVersion = null;
    _pendingFinalScores = null;
    
    window._isMultiplayerGame = false;
    
    _stopGameAndAudio();
    hideMpScorePanel();
    
    const mpScreen = document.getElementById('screen-multiplayer');
    if (mpScreen) { mpScreen.style.display = 'flex'; mpScreen.classList.add('active'); }
    
    const playScreen = document.getElementById('screen-play');
    if (playScreen) playScreen.classList.remove('active');
    const header = document.querySelector('.stage-header');
    if (header) header.style.display = '';
    renderRoomPlayers();
    updateRoomUI();
    renderRoomSong();
  }

  // Cache previous scores for animation comparison
  let _liveScorePrev = {};

  function renderLiveScores(players) {
    const el = document.getElementById('mp-score-list');
    if (!el) return;
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

    
    const existingRows = {};
    el.querySelectorAll('[data-uid]').forEach(r => { existingRows[r.dataset.uid] = r; });

    sorted.forEach((p, i) => {
      const rank = i + 1;
      const prev = _liveScorePrev[p.uid] || {};
      const scoreChanged = prev.score !== undefined && (p.score || 0) !== prev.score;
      const rankChanged  = prev.rank !== undefined && rank !== prev.rank;
      const rankWentUp   = rankChanged && rank < prev.rank; 

      const isMe = p.uid === myUid;
      const avatarSrc = _playerMetaCache[p.uid]?.avatarUrl || p.avatar;

      let row = existingRows[p.uid];
      if (!row) {
        row = document.createElement('div');
        row.dataset.uid = p.uid;
        row.className = 'mp-live-row' + (isMe ? ' mp-live-me' : '');
        row.innerHTML = `
          <div class="mp-live-rank-wrap">
            <span class="mp-live-rank">#${rank}</span>
          </div>
          <div class="mp-live-av">${avatarHtml(p.name, avatarSrc, 26)}</div>
          <div class="mp-live-info">
            <span class="mp-live-name">${esc(p.name.length > 10 ? p.name.slice(0,9)+'…' : p.name)}</span>
            <span class="mp-live-combo">${(p.combo||0).toLocaleString()}x</span>
          </div>
          <div class="mp-live-score-wrap">
            <span class="mp-live-score">${(p.score||0).toLocaleString()}</span>
            <span class="mp-live-acc">${(p.acc||0).toFixed(1)}%</span>
          </div>
        `;
        el.appendChild(row);
      } else {
        // Update rank with animation when moving up
        const rankEl = row.querySelector('.mp-live-rank');
        if (rankEl && rankEl.textContent !== '#' + rank) {
          rankEl.textContent = '#' + rank;
          if (rankChanged) {
            
            row.classList.remove('mp-live-rank-up', 'mp-live-rank-down');
            void row.offsetWidth;
            row.classList.add(rankWentUp ? 'mp-live-rank-up' : 'mp-live-rank-down');
            
            const rankWrap = row.querySelector('.mp-live-rank-wrap');
            if (rankWrap) {
              rankWrap.classList.remove('mp-rank-flash-up', 'mp-rank-flash-down');
              void rankWrap.offsetWidth;
              rankWrap.classList.add(rankWentUp ? 'mp-rank-flash-up' : 'mp-rank-flash-down');
            }
          }
        }
        
        const scoreEl = row.querySelector('.mp-live-score');
        if (scoreEl) scoreEl.textContent = (p.score||0).toLocaleString();
        
        const comboEl = row.querySelector('.mp-live-combo');
        if (comboEl) {
          const newCombo = (p.combo||0).toLocaleString() + 'x';
          if (comboEl.textContent !== newCombo) {
            comboEl.textContent = newCombo;
            if (p.combo > (prev.combo || 0)) {
              comboEl.classList.remove('mp-combo-pulse');
              void comboEl.offsetWidth;
              comboEl.classList.add('mp-combo-pulse');
            }
          }
        }
        
        const accEl = row.querySelector('.mp-live-acc');
        if (accEl) accEl.textContent = (p.acc||0).toFixed(1) + '%';
      }

      
      const children = [...el.children];
      if (children[i] !== row) {
        el.appendChild(row);
      }
      _liveScorePrev[p.uid] = { score: p.score || 0, rank, combo: p.combo || 0 };
    });

    
    el.querySelectorAll('[data-uid]').forEach(row => {
      if (!sorted.find(p => p.uid === row.dataset.uid)) row.remove();
    });
  }

  
  window.mpSendLiveScore = function(score, acc, combo, judgeCounts, maxCombo) {
    send({ type: 'live_score', score, acc, combo, judgeCounts, maxCombo });
  };
  window.mpSendGameFinish = function(finalSnap) {
    
    if (finalSnap) {
      send({ type: 'live_score', score: finalSnap.score, acc: finalSnap.accuracy, combo: finalSnap.combo, judgeCounts: finalSnap.judgeCounts, maxCombo: finalSnap.maxCombo });
    }
    send({ type: 'game_finish' });
    hideMpScorePanel();
  };
  window.mpSendHostQuitGame = function() {
    
    
    if (isHost) {
      send({ type: 'host_quit_game' });
    } else {
      send({ type: 'game_finish' });
    }
    hideMpScorePanel();
  };

  
  window.showMultiplayerScreen = function() {
    document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
    const mpScreen = document.getElementById('screen-multiplayer');
    if (mpScreen) { mpScreen.style.display = 'flex'; mpScreen.classList.add('active'); }
    const header = document.querySelector('.stage-header');
    if (header) header.style.display = '';
    const btnBack = document.getElementById('btnBackHome');
    if (btnBack) btnBack.style.display = 'block';

    if (!myUid && window.Auth?.user) {
      myUid   = window.Auth.user.uid;
      myName  = window.Auth.user.displayName || window.Auth.user.email || 'ผู้เล่น';
      myAvatar = window.Auth.user.photoURL || '';
    }

    const warn = document.getElementById('mp-login-warn');
    if (warn) warn.style.display = myUid ? 'none' : '';

    if (myUid) connect();
    if (currentRoom) showRoomView();
    else showLobbyView();
  };

  // ===== MP Song Picker =====
  let _mpPickerEntries = []; // cache ของ entries ที่โหลดแล้ว

  // ควบคุมการโหลดเพลงใน picker ให้มีครั้งละหนึ่งเท่านั้น
  let _mpPickerLoadSeq = 0;

  function openMpSongPicker() {
    const modal = document.getElementById('mp-song-picker-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    closeMpDiffPicker(); 
    
    const searchEl = document.getElementById('mp-song-search');
    const libList = document.getElementById('mp-song-picker-list');
    if (libList) libList.style.display = '';
    if (searchEl) { searchEl.style.display = ''; searchEl.value = ''; searchEl.focus(); }
    _mpPickerLoadSeq++; // ยกเลิก load เก่าทุกครั้งที่เปิดใหม่
    _mpFeaturedLoaded = false; // reset featured mirror so it reloads
    loadMpSongList();
  }

  function closeMpSongPicker() {
    const modal = document.getElementById('mp-song-picker-modal');
    if (modal) modal.style.display = 'none';
    closeMpDiffPicker();
    if (window._stopPreview) window._stopPreview();
  }

  async function loadMpSongList() {
    const listEl = document.getElementById('mp-song-picker-list');
    if (!listEl) return;

    const mySeq = _mpPickerLoadSeq; 

    const entries = (window._getLibraryEntries ? window._getLibraryEntries() : []).filter(e => e.source !== 'upload');
    if (entries.length === 0) {
      listEl.innerHTML = `<div class="mp-empty" style="padding:48px 0;">ไม่พบเพลงในคลัง<br><span style="font-size:12px;color:var(--text-dim);">อัปโหลดหรือดาวน์โหลดเพลงก่อนเลือก</span></div>`;
      return;
    }

    
    listEl.innerHTML = entries.map(e => `
      <div class="mp-song-row mp-song-row-loading" data-entry-id="${esc(e.id)}">
        <div class="mp-song-row-cover">
          <svg viewBox="0 0 40 40" fill="none" width="20" height="20" stroke="currentColor" stroke-width="2" opacity="0.3"><path d="M16 30V12l16-4v18"/><circle cx="12" cy="30" r="4"/><circle cx="28" cy="26" r="4"/></svg>
        </div>
        <div class="mp-song-row-info">
          <div class="mp-song-row-title" style="background:var(--bg-panel);height:14px;border-radius:4px;width:60%;"></div>
          <div class="mp-song-row-meta" style="background:var(--bg-panel);height:10px;border-radius:4px;width:40%;margin-top:6px;"></div>
        </div>
      </div>
    `).join('');

    _mpPickerEntries = [];

    // โหลด preview ทีละ entry — หยุดทันทีถ้ามีการเปิด picker ใหม่
    for (const entry of entries) {
      if (_mpPickerLoadSeq !== mySeq) return; // ถูกยกเลิก (เปิด picker ใหม่)

      // ถ้า entry มี _preview อยู่แล้ว ใช้เลย
      const preview = entry._preview || await (window._peekOszPreview ? window._peekOszPreview(entry) : Promise.resolve(null));
      if (_mpPickerLoadSeq !== mySeq) return; // ตรวจอีกครั้งหลัง await
      if (!entry._preview && preview) entry._preview = preview;

      const title  = preview?.title  || entry.name.replace(/^\d+\s+/, '');
      const artist = preview?.artist || '';
      const creator = preview?.creator || '';
      const bgUrl  = preview?.bgUrl  || '';
      const keyModes = preview?.keyModes || [];
      const minStar = preview?.minStar;
      const maxStar = preview?.maxStar;

      const entryData = { entry, title, artist, creator, bgUrl, keyModes, minStar, maxStar };
      _mpPickerEntries.push(entryData);

      // update card ใน DOM
      const card = listEl.querySelector(`[data-entry-id="${CSS.escape(entry.id)}"]`);
      if (card) {
        card.classList.remove('mp-song-row-loading');
        card.innerHTML = buildSongRowHTML(entryData);
        attachSongRowEvents(card, entryData);
      }
    }

    
    if (!document.getElementById('mp-song-search')?.value.trim()) {
      _loadFeaturedMirrorIntoList();
    }

    
    if (_mpMirrorPending) {
      const pq = _mpMirrorPending;
      _mpMirrorPending = null;
      const liveQ = document.getElementById('mp-song-search')?.value.trim().toLowerCase();
      
      if (liveQ === pq) {
        const tokens = pq.split(/\s+/).filter(Boolean);
        const localMatches = _mpPickerEntries.filter(e =>
          tokens.every(t => [e.title, e.artist, e.creator || '', e.entry?.name || '', String(e.entry?.beatmapSetId || '')].join(' ').toLowerCase().includes(t))
        ).length;
        if (localMatches === 0) _mpPickerSearchMirror(pq);
      }
    }
  }

  function buildSongRowHTML({ title, artist, creator, bgUrl, keyModes, minStar, maxStar }) {
    const coverStyle = bgUrl
      ? `background-image:url('${esc(bgUrl)}');background-size:cover;background-position:center;`
      : '';
    const starLabel = (minStar != null && maxStar != null)
      ? (minStar === maxStar ? `★ ${window.ManiaStarRating.formatStarRating(maxStar)}` : `★ ${window.ManiaStarRating.formatStarRating(minStar)}–${window.ManiaStarRating.formatStarRating(maxStar)}`)
      : '';
    const uniqueKeys = [...new Set(keyModes)].sort((a, b) => a - b);
    const keyBadges = (uniqueKeys.length === 2 && uniqueKeys[0] === 4 && uniqueKeys[1] === 7)
      ? `<span class="mp-song-badge">4K-7K</span>`
      : uniqueKeys.map(k => `<span class="mp-song-badge">${k}K</span>`).join('');
    const starBadge = starLabel ? `<span class="mp-song-badge mp-song-badge-star">${esc(starLabel)}</span>` : '';
    const metaText = creator ? `${artist} · by ${creator}` : artist;
    return `
      <div class="mp-song-row-cover" style="${coverStyle}">
        ${!bgUrl ? '<svg viewBox="0 0 40 40" fill="none" width="20" height="20" stroke="currentColor" stroke-width="2" opacity="0.3"><path d="M16 30V12l16-4v18"/><circle cx="12" cy="30" r="4"/><circle cx="28" cy="26" r="4"/></svg>' : ''}
      </div>
      <div class="mp-song-row-info">
        <div class="mp-song-row-title">${esc(title)}</div>
        <div class="mp-song-row-meta">${esc(metaText)}</div>
      </div>
      <div class="mp-song-row-badges">${keyBadges}${starBadge}</div>
    `;
  }

  // Build mirror song row — เหมือนเพลงปกติ มีปก, star, key badges
  function buildMirrorRowHTML(set) {
    const title  = set.title || set.title_unicode || String(set.id);
    const artist = set.artist || set.artist_unicode || '';
    const creator = set.creator || set.creator_name || (set.user && set.user.username) || '';
    // ใช้ ppy.sh assets เหมือนหน้าหลัก (ไม่พึ่ง covers field ที่อาจไม่มี)
    const bgUrl  = set.covers?.card || set.covers?.['card@2x'] || `https://assets.ppy.sh/beatmaps/${set.id}/covers/list.jpg`;
    const coverStyle = `background-image:url('${esc(bgUrl)}');background-size:cover;background-position:center;`;
    
    const maps = set.beatmaps || [];
    const maniaMaps = maps.filter(m => m.mode === 'mania' || m.mode_int === 3);
    const stdMaps = maps.filter(m => m.mode === 'osu' || m.mode_int === 0);
    const hasMania = maniaMaps.length > 0;
    const hasStdOnly = !hasMania && stdMaps.length > 0;

    let keyModes = [];
    let minStar = null, maxStar = null;
    let isStdOnly = false;
    if (hasMania) {
      const stars = maniaMaps.map(m => m.difficulty_rating || 0).filter(v => v > 0);
      keyModes = [...new Set(maniaMaps.map(m => m.cs || m.key_count).filter(Boolean))].sort((a,b)=>a-b);
      minStar = stars.length ? Math.min(...stars) : null;
      maxStar = stars.length ? Math.max(...stars) : null;
    } else if (hasStdOnly) {
      
      
      isStdOnly = true;
    }
    const starLabel = (minStar != null && maxStar != null)
      ? (Math.abs(minStar - maxStar) < 0.005 ? `★ ${window.ManiaStarRating.formatStarRating(maxStar)}` : `★ ${window.ManiaStarRating.formatStarRating(minStar)}–${window.ManiaStarRating.formatStarRating(maxStar)}`)
      : '';
    const keyBadges = isStdOnly
      ? `<span class="mp-song-badge">4K-7K</span>`
      : keyModes.map(k => `<span class="mp-song-badge">${k}K</span>`).join('');
    const starBadge = isStdOnly
      ? `<span class="mp-song-badge mp-song-badge-star">STD</span>`
      : (starLabel ? `<span class="mp-song-badge mp-song-badge-star">${esc(starLabel)}</span>` : '');
    const metaText = creator ? `${artist} · by ${creator}` : artist;
    return `
      <div class="mp-song-row-cover" style="${coverStyle}">

      </div>
      <div class="mp-song-row-info">
        <div class="mp-song-row-title">${esc(title)}</div>
        <div class="mp-song-row-meta">${esc(metaText)}</div>
        <div class="mp-song-row-dl-bar" style="display:none; align-items:center; gap:6px; margin-top:4px;">
          <div class="mp-song-row-dl-bar-track" style="flex:1; background:rgba(255,255,255,0.07); border-radius:2px; height:4px; overflow:hidden;">
            <div class="mp-song-row-dl-fill" style="height:4px; border-radius:2px; background:var(--accent-teal); width:0%; transition:width 0.3s;"></div>
          </div>
          <span class="mp-song-row-dl-txt" style="font-size:10px; color:var(--text-dim); white-space:nowrap;">กำลังโหลด...</span>
        </div>
      </div>
      <div class="mp-song-row-badges">${keyBadges}${starBadge}</div>
    `;
  }

  function attachSongRowEvents(card, { entry, title, artist }) {
    card.addEventListener('mouseenter', () => {
      if (entry._preview?.previewAudioUrl && window._playPreview) {
        window._playPreview(entry._preview.previewAudioUrl);
      }
    });
    card.addEventListener('mouseleave', () => {
      if (window._stopPreview) window._stopPreview();
    });
    card.addEventListener('click', () => {
      openMpDiffPicker(entry, title, artist);
    });
  }

  
  let _mpMirrorSearchTimer = null;
  let _mpMirrorSearchSeq = 0;
  let _mpMirrorPending = null;

  function filterMpSongList(q) {
    const listEl = document.getElementById('mp-song-picker-list');
    if (!listEl) return;

    
    listEl.querySelectorAll('.mp-song-row-mirror, .mp-mirror-divider-mp, .mp-mirror-status-mp').forEach(el => el.remove());
    _mpMirrorSearchSeq++;
    clearTimeout(_mpMirrorSearchTimer);
    _mpMirrorPending = null;

    if (!q) {
      listEl.querySelectorAll('.mp-song-row').forEach(r => r.style.display = '');
      return;
    }
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    let localMatches = 0;
    listEl.querySelectorAll('.mp-song-row:not(.mp-song-row-mirror)').forEach(row => {
      const entryId = row.dataset.entryId;
      const found = _mpPickerEntries.find(e => e.entry.id === entryId);
      // ค้นหาด้วย title, artist, ชื่อไฟล์, entry ID — AND search เหมือนหน้าหลัก
      const searchText = [
        found?.title || '',
        found?.artist || '',
        found?.creator || '',
        found?.entry?.name || '',
        String(found?.entry?.beatmapSetId || ''),
      ].join(' ').toLowerCase();
      const match = tokens.every(t => searchText.includes(t));
      row.style.display = match ? '' : 'none';
      if (match) localMatches++;
    });

    
    
    const allPreviewLoaded = _mpPickerEntries.length > 0;
    if (allPreviewLoaded) {
      _mpMirrorSearchTimer = setTimeout(() => _mpPickerSearchMirror(q), 500);
    } else {
      
      _mpMirrorPending = q;
    }
  }

  async function _mpPickerSearchMirror(q) {
    const seq = ++_mpMirrorSearchSeq;
    const listEl = document.getElementById('mp-song-picker-list');
    if (!listEl) return;
    
    const statusEl = document.createElement('div');
    statusEl.className = 'mp-mirror-status-mp mp-empty';
    statusEl.style.cssText = 'padding:16px 0;font-size:12px;';
    statusEl.textContent = `🔍 กำลังค้นหา "${q}" จาก mirror...`;
    listEl.appendChild(statusEl);
    try {
      
      const isNumericId = /^\d+$/.test(q.trim());
      if (isNumericId) {
        const res = await fetch(`/api/beatmap/info/${q.trim()}`);
        if (seq !== _mpMirrorSearchSeq) return;
        statusEl.remove();
        if (res.ok) {
          const set = await res.json();
          if (set && set.id) {
            const card = document.createElement('div');
            card.className = 'mp-song-row mp-song-row-mirror';
            card.style.cssText = 'cursor:pointer;';
            card.innerHTML = buildMirrorRowHTML(set);
            card.addEventListener('click', () => downloadMirrorForMP(set, card));
            listEl.appendChild(card);
          }
        }
        return;
      }

      
      async function doMirrorSearch(query) {
        const r = await fetch(`/api/beatmap/search?q=${encodeURIComponent(query)}&page=0`);
        if (!r.ok) throw new Error('server error ' + r.status);
        const data = await r.json();
        return Array.isArray(data) ? data : (data.beatmapsets || data.results || []);
      }
      function normStr(s) {
        return (s || '').toLowerCase()
          .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
          .replace(/\s+/g, ' ').trim();
      }
      function filterRelevant(sets, q) {
        const lq = q.toLowerCase();
        const nq = normStr(q);
        return sets.filter(s => {
          const t  = (s.title || '').toLowerCase();
          const tu = (s.title_unicode || '').toLowerCase();
          const nt  = normStr(s.title);
          const ntu = normStr(s.title_unicode);
          const a  = (s.artist || '').toLowerCase();
          const au = (s.artist_unicode || '').toLowerCase();
          return t.includes(lq)  || tu.includes(lq)  ||
                 lq.includes(t)  || lq.includes(tu)  ||
                 nt.includes(nq) || ntu.includes(nq) ||
                 nq.includes(nt) || nq.includes(ntu) ||
                 a.includes(lq)  || au.includes(lq);
        });
      }

      const queryVariants = [q];
      const beforeFeatDot = q.replace(/\s+f(?:eat|t)\.?\s+.+$/gi, ' feat.').trim();
      if (beforeFeatDot !== q) queryVariants.push(beforeFeatDot);
      const noFeat = q
        .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
        .replace(/\s+f(?:eat|t)\.?.*$/gi, '')
        .trim();
      if (noFeat && noFeat !== q && noFeat !== beforeFeatDot) queryVariants.push(noFeat);

      const results = await Promise.all(queryVariants.map(v => doMirrorSearch(v)));
      if (seq !== _mpMirrorSearchSeq) return;
      statusEl.remove();

      // Deduplicate
      const seen = new Set();
      const allSets = [];
      for (const r of results) {
        for (const s of r) {
          if (!seen.has(s.id)) { seen.add(s.id); allSets.push(s); }
        }
      }
      // กรองที่ตรงก่อน ถ้าว่างค่อยใช้ผลดิบ
      let sets = filterRelevant(allSets, q);
      if (!sets.length) sets = allSets;

      if (!sets || !sets.length) return;
      // ต่อผลการค้นหา mirror เข้าไป
      sets.forEach(set => {
        const card = document.createElement('div');
        card.className = 'mp-song-row mp-song-row-mirror';
        card.style.cssText = 'cursor:pointer;';
        card.innerHTML = buildMirrorRowHTML(set);
        card.addEventListener('click', () => downloadMirrorForMP(set, card));
        listEl.appendChild(card);
      });
    } catch(e) {
      if (seq === _mpMirrorSearchSeq) statusEl.remove();
    }
  }

  
  
  let _mpDiffSelectedPack = null;  
  let _mpDiffSelectedMap  = null;  
  let _mpDiffSelectedEntry = null; 

  function _formatMsDuration(ms) {
    const totalSec = Math.round((ms || 0) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function _showMpDiffDetail(pack, map, entry, fallbackTitle, fallbackArtist) {
    _mpDiffSelectedPack  = pack;
    _mpDiffSelectedMap   = map;
    _mpDiffSelectedEntry = entry;

    const panel     = document.getElementById('mp-diff-detail-panel');
    const picker    = document.querySelector('.mp-song-picker');
    if (!panel) return;

    
    panel.style.display = 'flex';
    if (picker) picker.classList.add('mp-diff-expanded');

    
    const title  = pack?.name || fallbackTitle || stripNum(entry?.name) || '—';
    const artist = map.artistUnicode || fallbackArtist || '';
    document.getElementById('mp-diff-detail-cover').style.backgroundImage =
      map.backgroundUrl ? `url('${esc(map.backgroundUrl)}')` : 'none';
    document.getElementById('mp-diff-detail-title').textContent   = title;
    document.getElementById('mp-diff-detail-artist').textContent  = artist;
    document.getElementById('mp-dd-version').textContent  = map.version || '—';
    document.getElementById('mp-dd-bpm').textContent      = map.bpm ? Math.round(map.bpm) : '—';
    document.getElementById('mp-dd-od').textContent       = map.od != null ? map.od.toFixed(1) : '—';
    document.getElementById('mp-dd-key').textContent      = map.keyCount ? `${map.keyCount}K` : '—';
    document.getElementById('mp-dd-notes').textContent    = map.noteCount ?? '—';
    document.getElementById('mp-dd-ln').textContent       = map.lnCount ?? '—';
    document.getElementById('mp-dd-duration').textContent = _formatMsDuration(map.duration);
    _renderMpStdKeyPicker(map, pack, entry);

    
    if (map.audioUrl && window._playPreview) {
      window._playPreview(map.audioUrl, { loop: true });
    }
  }

    function _renderMpStdKeyPicker(map, pack, entry) {
    const wrap = document.getElementById('mpStdKeyPicker');
    const buttonsEl = document.getElementById('mpStdKeyPickerButtons');
    if (!wrap || !buttonsEl) return;

    if (!map.convertedFromStandard || !map.stdSourceText || !map.stdAvailableColumns) {
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'block';
    buttonsEl.innerHTML = '';
    map.stdAvailableColumns.forEach((cols) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'std-key-picker-btn' + (cols === map.stdCurrentColumns ? ' active' : '');
      btn.textContent = `${cols}K`;
      btn.addEventListener('click', () => _switchMpStdMapColumns(map, cols, pack, entry));
      buttonsEl.appendChild(btn);
    });
  }

  function _switchMpStdMapColumns(map, targetColumns, pack, entry) {
    if (map.stdCurrentColumns === targetColumns) return;
    const buttonsEl = document.getElementById('mpStdKeyPickerButtons');
    const buttons = buttonsEl ? Array.from(buttonsEl.querySelectorAll('.std-key-picker-btn')) : [];
    buttons.forEach((b) => { b.disabled = true; });

    let beatmap;
    try {
      beatmap = window.StdToManiaBridge.convertStdOsuToMania(map.stdSourceText, targetColumns);
    } catch (e) {
      console.error('แปลงคีย์ไม่สำเร็จ', e);
      buttons.forEach((b) => { b.disabled = false; });
      return;
    }
    if (!beatmap || beatmap.hitObjects.length === 0) {
      buttons.forEach((b) => { b.disabled = false; });
      return;
    }

    map.beatmap = beatmap;
    map.keyCount = beatmap.keyCount;
    map.noteCount = beatmap.hitObjects.length;
    map.lnCount = beatmap.hitObjects.filter(h => h.isLongNote).length;
    map.duration = beatmap.hitObjects.length > 0 ? Math.max(...beatmap.hitObjects.map(h => h.endTime)) : 0;
    map.stdCurrentColumns = targetColumns;
    const calcStar = window._calcStarRating || (() => null);
    map._starRating = calcStar(map) ?? 0.5;

    
    document.getElementById('mp-dd-key').textContent = `${map.keyCount}K`;
    document.getElementById('mp-dd-notes').textContent = map.noteCount;
    document.getElementById('mp-dd-ln').textContent = map.lnCount;
    document.getElementById('mp-dd-duration').textContent = _formatMsDuration(map.duration);
    _renderMpStdKeyPicker(map, pack, entry);

    
    const diffList = document.getElementById('mp-diff-picker-list');
    const rowEl = diffList ? Array.from(diffList.querySelectorAll('.mp-diff-row')).find((r) => r._map === map) : null;
    if (rowEl) {
      const metaSpans = rowEl.querySelectorAll('.mp-diff-row-meta span');
      
      for (const span of metaSpans) {
        if (/^\d+K$/.test(span.textContent)) { span.textContent = `${map.keyCount}K`; break; }
      }
      const noteSpan = metaSpans[0];
      if (noteSpan) noteSpan.textContent = `${map.noteCount} notes`;
      const starEl = rowEl.querySelector('.mp-diff-row-star');
      if (starEl) starEl.textContent = `★ ${window.ManiaStarRating.formatStarRating(map._starRating)}`;
    }
  }

  async function openMpDiffPicker(entry, fallbackTitle, fallbackArtist) {
    const listView  = document.getElementById('mp-song-picker-list');
    const diffView  = document.getElementById('mp-diff-picker-view');
    const diffList  = document.getElementById('mp-diff-picker-list');
    const diffTitle = document.getElementById('mp-diff-pack-title');
    const detailPanel = document.getElementById('mp-diff-detail-panel');
    const picker    = document.querySelector('.mp-song-picker');
    if (!diffView || !diffList) return;

    if (window._stopPreview) window._stopPreview();

    
    if (detailPanel) detailPanel.style.display = 'none';
    if (picker) picker.classList.remove('mp-diff-expanded');
    _mpDiffSelectedMap = null;

    
    const searchRow = document.getElementById('mp-song-search-header');
    const mirrorTabEl = document.getElementById('mp-mirror-tab');
    if (searchRow) searchRow.style.display = 'none';
    if (listView) listView.style.display = 'none';
    if (mirrorTabEl) mirrorTabEl.style.display = 'none';  
    diffView.style.display = 'flex';
    if (diffTitle) diffTitle.textContent = fallbackTitle || stripNum(entry.name);
    diffList.innerHTML = `<div class="mp-empty" style="padding:48px 0;">กำลังโหลด diff...</div>`;

    try {
      const pack = await window.SongLibrary.loadPack(entry);
      if (!pack || !pack.maps || pack.maps.length === 0) throw new Error('ไม่พบ beatmap ในไฟล์นี้');

      
      const calcStar = window._calcStarRating || (() => null);
      pack.maps.forEach(m => { if (m._starRating == null) m._starRating = calcStar(m) ?? 0.5; });
      const stars = pack.maps.map(m => m._starRating);
      const minStar = Math.min(...stars);
      const maxStar = Math.max(...stars);

      if (diffTitle) diffTitle.textContent = pack.name || fallbackTitle || stripNum(entry.name);

      diffList.innerHTML = '';
      pack.maps.forEach(map => {
        const row = document.createElement('div');
        row.className = 'mp-diff-row';
        const starColor = window._relativeStarColorHex ? window._relativeStarColorHex(map._starRating, minStar, maxStar) : 'var(--accent-amber)';
        const starBg    = window._relativeStarColorBg  ? window._relativeStarColorBg(map._starRating, minStar, maxStar, 0.15) : 'rgba(255,209,102,0.12)';
        row.innerHTML = `
          <div class="mp-diff-row-thumb" style="background-image:url('${esc(map.backgroundUrl || '')}')"></div>
          <div class="mp-diff-row-info">
            <div class="mp-diff-row-name">${esc(map.version)}</div>
            <div class="mp-diff-row-meta">
              <span>${map.noteCount} notes</span>
              ${map.lnCount > 0 ? `<span>${map.lnCount} LN</span>` : ''}
              <span>${map.keyCount}K</span>
            </div>
          </div>
          <div class="mp-diff-row-star" style="color:${starColor};background:${starBg};">★ ${window.ManiaStarRating.formatStarRating(map._starRating)}</div>
        `;
        row.addEventListener('click', () => {
          
          diffList.querySelectorAll('.mp-diff-row').forEach(r => r.classList.remove('mp-diff-row-selected'));
          row.classList.add('mp-diff-row-selected');
          
          _showMpDiffDetail(pack, map, entry, fallbackTitle, fallbackArtist);
        });
        row._map = map;
        diffList.appendChild(row);
      });

      
      if (pack.maps.length === 1) {
        const firstRow = diffList.querySelector('.mp-diff-row');
        if (firstRow) firstRow.click();
      }
    } catch (err) {
      diffList.innerHTML = `<div class="mp-empty" style="padding:48px 0;">โหลด diff ไม่สำเร็จ: ${esc(err.message || '')}</div>`;
    }
  }

  function closeMpDiffPicker() {
    
    if (window._stopPreview) window._stopPreview();
    const diffView    = document.getElementById('mp-diff-picker-view');
    const listView    = document.getElementById('mp-song-picker-list');
    const searchRow   = document.getElementById('mp-song-search-header');
    const detailPanel = document.getElementById('mp-diff-detail-panel');
    const picker      = document.querySelector('.mp-song-picker');
    const mirrorTabEl = document.getElementById('mp-mirror-tab');
    const btnTabMirror = document.getElementById('btn-mp-tab-mirror');
    if (diffView)    diffView.style.display   = 'none';
    if (searchRow)   searchRow.style.display  = 'flex';
    if (detailPanel) detailPanel.style.display = 'none';
    if (picker)      picker.classList.remove('mp-diff-expanded');
    
    if (listView)    listView.style.display = 'flex';
    if (mirrorTabEl) mirrorTabEl.style.display = 'none';
    _mpDiffSelectedMap  = null;
    _mpDiffSelectedPack = null;
  }

  
  let _mpMirrorDownloadController = null;

  async function loadMirrorFeatured() {
    const el = document.getElementById('mp-mirror-results');
    if (!el) return;
    el.innerHTML = `<div class="mp-empty" style="padding:32px 0;">กำลังโหลดเพลงแนะนำ...</div>`;
    try {
      const r = await fetch('/api/beatmap/featured?page=0');
      if (!r.ok) throw new Error('mirror offline');
      const sets = await r.json();
      if (!sets || !sets.length) {
        el.innerHTML = `<div class="mp-empty" style="padding:32px 0; color:var(--text-dim);">ไม่มีเพลงแนะนำ ลองค้นหาด้วยชื่อ</div>`;
        return;
      }
      renderMirrorResults(el, sets);
    } catch(e) {
      el.innerHTML = `<div class="mp-empty" style="padding:32px 0; color:var(--text-dim);">เชื่อมต่อ mirror ไม่ได้ — ลองใหม่ภายหลัง</div>`;
    }
  }

  async function searchMirrorSongs(q) {
    const el = document.getElementById('mp-mirror-results');
    if (!el) return;
    el.innerHTML = `<div class="mp-empty" style="padding:32px 0;">กำลังค้นหา "${esc(q)}"...</div>`;
    try {
      async function doSearch(query) {
        const r = await fetch(`/api/beatmap/search?q=${encodeURIComponent(query)}&page=0`);
        if (!r.ok) throw new Error('ค้นหาไม่ได้');
        const data = await r.json();
        return Array.isArray(data) ? data : (data.beatmapsets || data.results || []);
      }
      function normStr(s) {
        return (s || '').toLowerCase()
          .replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '')
          .replace(/\s+/g, ' ').trim();
      }
      function filterRelevant(sets, q) {
        const lq = q.toLowerCase(), nq = normStr(q);
        return sets.filter(s => {
          const t = (s.title || '').toLowerCase(), tu = (s.title_unicode || '').toLowerCase();
          const nt = normStr(s.title), ntu = normStr(s.title_unicode);
          const a = (s.artist || '').toLowerCase(), au = (s.artist_unicode || '').toLowerCase();
          return t.includes(lq) || tu.includes(lq) || lq.includes(t) || lq.includes(tu) ||
                 nt.includes(nq) || ntu.includes(nq) || nq.includes(nt) || nq.includes(ntu) ||
                 a.includes(lq) || au.includes(lq);
        });
      }
      const queryVariants = [q];
      const beforeFeatDot = q.replace(/\s+f(?:eat|t)\.?\s+.+$/gi, ' feat.').trim();
      if (beforeFeatDot !== q) queryVariants.push(beforeFeatDot);
      const noFeat = q.replace(/\s*[\(\[]f(?:eat|t)\.?[^\)\]]*[\)\]]/gi, '').replace(/\s+f(?:eat|t)\.?.*$/gi, '').trim();
      if (noFeat && noFeat !== q && noFeat !== beforeFeatDot) queryVariants.push(noFeat);

      const results = await Promise.all(queryVariants.map(v => doSearch(v)));
      const seen = new Set();
      const allSets = [];
      for (const r of results) for (const s of r) if (!seen.has(s.id)) { seen.add(s.id); allSets.push(s); }
      let sets = filterRelevant(allSets, q);
      if (!sets.length) sets = allSets;

      if (!sets || !sets.length) {
        el.innerHTML = `<div class="mp-empty" style="padding:32px 0; color:var(--text-dim);">ไม่พบเพลงที่ตรงกับ "${esc(q)}"</div>`;
        return;
      }
      renderMirrorResults(el, sets);
    } catch(e) {
      el.innerHTML = `<div class="mp-empty" style="padding:32px 0; color:var(--text-dim);">ค้นหาไม่สำเร็จ: ${esc(e.message)}</div>`;
    }
  }

  function renderMirrorResults(container, sets) {
    container.innerHTML = '';
    sets.forEach(set => {
      const title = set.title || set.title_unicode || String(set.id);
      const artist = set.artist || set.artist_unicode || '';
      // ใช้ ppy.sh assets เป็น fallback เหมือนหน้าหลัก (ไม่พึ่ง covers field ที่อาจไม่มี)
      const bgUrl = set.covers?.card || set.covers?.['card@2x'] || `https://assets.ppy.sh/beatmaps/${set.id}/covers/list.jpg`;
      const card = document.createElement('div');
      card.className = 'mp-mirror-card';
      card.innerHTML = `
        <div class="mp-mirror-card-cover" style="background-image:url('${esc(bgUrl)}')">
        </div>
        <div class="mp-mirror-card-info">
          <div class="mp-mirror-card-title">${esc(title)}</div>
          <div class="mp-mirror-card-meta">${esc(artist)}</div>
        </div>
        <div class="mp-mirror-card-dl" id="mp-mc-dl-${esc(String(set.id))}">
          <span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:3px"><path d="M12 3v13M6 11l6 6 6-6"/><line x1="3" y1="21" x2="21" y2="21"/></svg>โหลด</span>
          <div class="mp-mirror-dl-progress" id="mp-mc-prog-${esc(String(set.id))}">
            <div class="mp-mirror-dl-bar-track"><div class="mp-mirror-dl-bar-fill" id="mp-mc-fill-${esc(String(set.id))}"></div></div>
            <div class="mp-mirror-dl-text" id="mp-mc-txt-${esc(String(set.id))}">0%</div>
          </div>
        </div>`;
      card.addEventListener('click', () => downloadMirrorForMP(set, card));
      container.appendChild(card);
    });
  }

  async function downloadMirrorForMP(set, card) {
    const id = String(set.id);

    
    if (window._getLibraryEntries) {
      const entries = window._getLibraryEntries();
      const existing = entries.find(e => String(e.beatmapSetId) === id);
      if (existing) {
        const safeTitle = set.title || String(id);
        const safeArtist = set.artist || '';
        // อัพเดต card ให้แสดง "โหลดแล้ว" และเปลี่ยน click เป็น openMpDiffPicker
        const txtEl = card.querySelector('.mp-song-row-dl-txt');
        const barEl = card.querySelector('.mp-song-row-dl-bar');
        const badgeEl = card.querySelector('.mp-song-row-badges');
        if (barEl) { barEl.style.display = 'flex'; if (badgeEl) badgeEl.style.display = 'none'; }
        if (txtEl) txtEl.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-1px;margin-right:3px"><polyline points="20 6 9 17 4 12"></polyline></svg>โหลดแล้ว';
        const fillEl = card.querySelector('.mp-song-row-dl-fill');
        if (fillEl) { fillEl.classList.remove('indeterminate'); fillEl.style.width = '100%'; }
        card.dataset.downloadedEntryId = String(existing.id);
        card.replaceWith(card.cloneNode(true));
        const newCard = document.querySelector(`[data-downloaded-entry-id="${existing.id}"]`);
        if (newCard) newCard.addEventListener('click', () => openMpDiffPicker(existing, safeTitle, safeArtist));
        openMpDiffPicker(existing, safeTitle, safeArtist);
        return;
      }
    }

    if (card.dataset.downloading === '1') return;
    if (_mpMirrorDownloadController) { _mpMirrorDownloadController.abort(); }

    const controller = new AbortController();
    _mpMirrorDownloadController = controller;
    card.dataset.downloading = '1';

    
    const inlineBar  = card.querySelector('.mp-song-row-dl-bar');
    const inlineFill = card.querySelector('.mp-song-row-dl-fill');
    const inlineTxt  = card.querySelector('.mp-song-row-dl-txt');
    const inlineTrack = card.querySelector('.mp-song-row-dl-bar-track');
    const badgeEl    = card.querySelector('.mp-song-row-badges');
    const legDl   = document.getElementById(`mp-mc-dl-${id}`);
    const legProg = document.getElementById(`mp-mc-prog-${id}`);
    const legFill = document.getElementById(`mp-mc-fill-${id}`);
    const legTxt  = document.getElementById(`mp-mc-txt-${id}`);

    if (inlineBar) { inlineBar.style.display = 'flex'; if (badgeEl) badgeEl.style.display = 'none'; }
    if (legDl) legDl.querySelector('span').style.display = 'none';
    if (legProg) legProg.style.display = 'flex';
    if (legFill) legFill.classList.add('indeterminate');
    if (inlineFill) inlineFill.classList.add('indeterminate');
    if (legTxt) legTxt.textContent = 'กำลังโหลด...';

    const setFill = (pct) => {
      if (inlineFill) { inlineFill.classList.remove('indeterminate'); inlineFill.style.width = pct + '%'; }
      if (legFill) { legFill.classList.remove('indeterminate'); legFill.style.width = pct + '%'; }
    };
    const setTxt = (t) => {
      if (inlineTxt) inlineTxt.innerHTML = t;
      if (legTxt) legTxt.innerHTML = t;
    };

    try {
      const resp = await fetch(`/api/beatmap/download/${id}`, { signal: controller.signal });
      if (!resp.ok) throw new Error(`mirror ตอบ ${resp.status}`);
      const total = parseInt(resp.headers.get('Content-Length') || '0', 10);
      const chunks = [];
      const reader = resp.body.getReader();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          setFill(Math.min(100, Math.round(received / total * 100)));
          setTxt(Math.min(100, Math.round(received / total * 100)) + '%');
        } else {
          if (inlineFill) inlineFill.classList.add('indeterminate');
          if (legFill) legFill.classList.add('indeterminate');
          setTxt(`${(received/1024/1024).toFixed(1)} MB`);
        }
      }
      setFill(100);
      setTxt('<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align:-1px;margin-right:3px"><polyline points="20 6 9 17 4 12"></polyline></svg>โหลดแล้ว');
      
      if (inlineFill) inlineFill.classList.add('done');
      if (inlineTxt) inlineTxt.classList.add('done');
      
      if (badgeEl) badgeEl.style.display = '';

      const safeTitle = (set.title || String(id)).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const safeArtist = (set.artist || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
      const fileName = `${safeArtist ? safeArtist + ' - ' : ''}${safeTitle}.osz`;
      const file = new File([new Blob(chunks)], fileName, { type: 'application/octet-stream' });
      const entry = window.SongLibrary.addUploadedFile(file, 'mirror');
      if (entry) {
        entry.beatmapSetId = set.id;
        if (window._addLibraryEntry) window._addLibraryEntry(entry);
      }

      
      if (entry) {
        card.dataset.downloadedEntryId = String(entry.id);
        card.replaceWith(card.cloneNode(true)); 
        const newCard = document.querySelector(`[data-downloaded-entry-id="${entry.id}"]`);
        if (newCard) {
          newCard.style.cursor = 'pointer';
          newCard.addEventListener('click', () => openMpDiffPicker(entry, safeTitle, set.artist || ''));
        }
      }

      // Open diff picker for this song
      showToast(`โหลด "${safeTitle}" สำเร็จ!`, 'info');
      if (entry) openMpDiffPicker(entry, safeTitle, set.artist || '');

    } catch(e) {
      if (e.name === 'AbortError') return;
      if (fillEl) { fillEl.classList.remove('indeterminate'); fillEl.style.width = '0'; }
      if (txtEl) txtEl.textContent = 'ล้มเหลว';
      showToast('โหลดเพลงไม่สำเร็จ', 'error');
    } finally {
      card.dataset.downloading = '0';
      if (_mpMirrorDownloadController === controller) _mpMirrorDownloadController = null;
    }
  }

  
  let _mpFeaturedLoaded = false;
  async function _loadFeaturedMirrorIntoList() {
    if (_mpFeaturedLoaded) return;
    const listEl = document.getElementById('mp-song-picker-list');
    if (!listEl) return;
    try {
      const r = await fetch('/api/beatmap/featured?page=0');
      if (!r.ok) return;
      const sets = await r.json();
      if (!sets || !sets.length) return;
      if (document.getElementById('mp-song-search')?.value.trim()) return;
      
      sets.forEach(set => {
        const card = document.createElement('div');
        card.className = 'mp-song-row mp-song-row-mirror';
        card.style.cssText = 'cursor:pointer;';
        card.innerHTML = buildMirrorRowHTML(set);
        card.addEventListener('click', () => downloadMirrorForMP(set, card));
        listEl.appendChild(card);
      });
      _mpFeaturedLoaded = true;
    } catch(e) {  }
  }

    
  function bindEvents() {
    
    const btnCreateRoom = document.getElementById('btn-mp-create-room');
    if (btnCreateRoom) btnCreateRoom.addEventListener('click', () => {
      if (!myUid) return showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
      const modal = document.getElementById('mp-create-modal');
      if (modal) modal.style.display = 'flex';
    });

    
    const btnRefresh = document.getElementById('btn-mp-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => send({ type: 'get_rooms' }));

    
    const btnCreateCancel = document.getElementById('btn-mp-create-cancel');
    if (btnCreateCancel) btnCreateCancel.addEventListener('click', () => {
      const modal = document.getElementById('mp-create-modal');
      if (modal) modal.style.display = 'none';
    });

    const btnCreateConfirm = document.getElementById('btn-mp-create-confirm');
    if (btnCreateConfirm) btnCreateConfirm.addEventListener('click', () => {
      const nameIn = document.getElementById('mp-room-name-input');
      const passIn = document.getElementById('mp-room-pass-input');
      const name = nameIn?.value.trim() || `ห้องของ ${myName}`;
      const pass = passIn?.value.trim() || '';
      send({ type: 'create_room', name, password: pass });
      const modal = document.getElementById('mp-create-modal');
      if (modal) modal.style.display = 'none';
      if (nameIn) nameIn.value = '';
      if (passIn) passIn.value = '';
    });

    // Global chat
    const globalInput = document.getElementById('mp-global-input');
    const globalSend  = document.getElementById('mp-global-send');
    function sendGlobal() {
      const txt = globalInput?.value.trim();
      if (!txt) return;
      send({ type: 'global_chat', text: txt });
      if (globalInput) globalInput.value = '';
    }
    if (globalSend)  globalSend.addEventListener('click', sendGlobal);
    if (globalInput) globalInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendGlobal(); });

    
    const btnLeave = document.getElementById('btn-mp-leave-room');
    if (btnLeave) btnLeave.addEventListener('click', () => {
      send({ type: 'leave_room' });
      leaveRoomLocal();
    });

    
    const btnReady = document.getElementById('btn-mp-ready');
    if (btnReady) btnReady.addEventListener('click', () => {
      const me = roomPlayers.find(p => p.uid === myUid);
      send({ type: 'ready', ready: !(me?.ready) });
    });
    const btnReadyBig = document.getElementById('btn-mp-ready-big');
    if (btnReadyBig) btnReadyBig.addEventListener('click', () => {
      const me = roomPlayers.find(p => p.uid === myUid);
      send({ type: 'ready', ready: !(me?.ready) });
    });

    
    const btnStart = document.getElementById('btn-mp-start-game');
    if (btnStart) btnStart.addEventListener('click', () => send({ type: 'start_game' }));
    const btnStartBig = document.getElementById('btn-mp-start-big');
    if (btnStartBig) btnStartBig.addEventListener('click', () => send({ type: 'start_game' }));

    
    const btnRoomPreview = document.getElementById('btn-mp-room-preview');
    if (btnRoomPreview) btnRoomPreview.addEventListener('click', () => {
      if (_roomPreviewPlaying) {
        stopRoomPreview();
      } else {
        startRoomPreview();
      }
    });

    
    const btnSong = document.getElementById('btn-mp-change-song');
    if (btnSong) btnSong.addEventListener('click', () => openMpSongPicker());

    
    const btnPickerClose = document.getElementById('btn-mp-song-picker-close');
    if (btnPickerClose) btnPickerClose.addEventListener('click', closeMpSongPicker);

    
    const btnDiffBack = document.getElementById('btn-mp-diff-back');
    if (btnDiffBack) btnDiffBack.addEventListener('click', closeMpDiffPicker);
    const btnDiffClose = document.getElementById('btn-mp-diff-picker-close');
    if (btnDiffClose) btnDiffClose.addEventListener('click', closeMpSongPicker);

    
    const btnDiffConfirm = document.getElementById('btn-mp-diff-confirm');
    if (btnDiffConfirm) btnDiffConfirm.addEventListener('click', () => {
      const map   = _mpDiffSelectedMap;
      const pack  = _mpDiffSelectedPack;
      const entry = _mpDiffSelectedEntry;
      if (!map || !pack || !entry) return;
      roomPlayers = roomPlayers.map(p => ({ ...p, ready: false }));
      
      
      const osuSetId = entry.beatmapSetId ? String(entry.beatmapSetId) : null;
      send({
        type: 'select_song',
        song: {
          title:        map.titleUnicode || map.title || pack.name || stripNum(entry.name),
          artist:       map.artistUnicode || map.artist || '',
          creator:      map.creator || '',
          entryId:      String(entry.id),   // internal ID ให้ host หาใน library
          songId:       osuSetId || String(entry.id),  // osu! set ID สำหรับ download
          version:      map.version,
          bgUrl:        map.backgroundUrl || '',
          keyCount:     map.keyCount,
          bpm:          map.bpm,
          starRating:   map._starRating,
          duration:     map.duration,
          od:           map.od,
          noteCount:    map.noteCount,
          lnCount:      map.lnCount,
        },
      });
      closeMpSongPicker();
    });

    // Song picker: tab switching
    const btnTabLibrary = document.getElementById('btn-mp-tab-library');
    const btnTabMirror = document.getElementById('btn-mp-tab-mirror');
    const libList = document.getElementById('mp-song-picker-list');
    const mirrorTab = document.getElementById('mp-mirror-tab');
    const songSearch = document.getElementById('mp-song-search');

    
    

    
    if (songSearch) {
      songSearch.addEventListener('input', () => filterMpSongList(songSearch.value.trim().toLowerCase()));
    }

    
    const pickerModal = document.getElementById('mp-song-picker-modal');
    if (pickerModal) {
      pickerModal.addEventListener('click', (e) => {
        if (e.target === pickerModal) closeMpSongPicker();
      });
    }

    
    const btnChangeRoom = document.getElementById('btn-mp-change-room');
    if (btnChangeRoom) btnChangeRoom.addEventListener('click', () => {
      const modal    = document.getElementById('mp-change-room-modal');
      const nameIn   = document.getElementById('mp-change-name-input');
      const passIn   = document.getElementById('mp-change-pass-input');
      if (nameIn) nameIn.value = currentRoom?.name || '';
      if (passIn) passIn.value = '';
      if (modal)  modal.style.display = 'flex';
    });

    const btnChangeCancel = document.getElementById('btn-mp-change-cancel');
    if (btnChangeCancel) btnChangeCancel.addEventListener('click', () => {
      const modal = document.getElementById('mp-change-room-modal');
      if (modal) modal.style.display = 'none';
    });

    const btnChangeConfirm = document.getElementById('btn-mp-change-confirm');
    if (btnChangeConfirm) btnChangeConfirm.addEventListener('click', () => {
      const nameIn = document.getElementById('mp-change-name-input');
      const passIn = document.getElementById('mp-change-pass-input');
      const name = nameIn?.value.trim();
      const pass = passIn?.value ?? '';
      if (name) send({ type: 'update_room', name, password: pass });
      const modal = document.getElementById('mp-change-room-modal');
      if (modal) modal.style.display = 'none';
    });

    
    const roomInput = document.getElementById('mp-room-input');
    const roomSend  = document.getElementById('mp-room-send');
    function sendRoomMsg() {
      const txt = roomInput?.value.trim();
      if (!txt) return;
      send({ type: 'room_chat', text: txt });
      if (roomInput) roomInput.value = '';
    }
    if (roomSend)  roomSend.addEventListener('click', sendRoomMsg);
    if (roomInput) roomInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendRoomMsg(); });

    
    const btnMpResultExit = document.getElementById('btn-mp-result-exit');
    if (btnMpResultExit) btnMpResultExit.addEventListener('click', closeMpResult);

    
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      const overlay = document.getElementById('mp-result-overlay');
      if (overlay && overlay.style.display === 'flex') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeMpResult();
      }
    }, { capture: true });

    
    const btnMP = document.getElementById('btnMultiplayer');
    if (btnMP) btnMP.addEventListener('click', () => window.showMultiplayerScreen?.());

    
    const btnBack = document.getElementById('btnBackHome');
    if (btnBack) btnBack.addEventListener('click', () => {
      const mpScreen = document.getElementById('screen-multiplayer');
      if (!mpScreen || !mpScreen.classList.contains('active')) return; 
      mpBackStep(true); 
    });
  }

  
  
  
  
  
  
  
  function mpBackStep(goHomeOnExit) {
    const pickerModal = document.getElementById('mp-song-picker-modal');
    if (pickerModal && pickerModal.style.display === 'flex') {
      const diffView = document.getElementById('mp-diff-picker-view');
      if (diffView && diffView.style.display !== 'none') {
        closeMpDiffPicker(); 
        return 'modal';
      }
      closeMpSongPicker();
      return 'modal';
    }
    const changeRoomModal = document.getElementById('mp-change-room-modal');
    if (changeRoomModal && changeRoomModal.style.display === 'flex') {
      changeRoomModal.style.display = 'none';
      return 'modal';
    }
    if (currentRoom) {
      send({ type: 'leave_room' });
      leaveRoomLocal(); 
      return 'room';
    }
    const mpScreen = document.getElementById('screen-multiplayer');
    if (mpScreen) { mpScreen.style.display = 'none'; mpScreen.classList.remove('active'); }
    
    if (goHomeOnExit && window._showHomeScreen) window._showHomeScreen();
    return 'exit';
  }

  
  
  function exitMpScreen() {
    let step;
    do { step = mpBackStep(false); } while (step !== 'exit');
    return true;
  }
  
  function mpBackStepDirect() {
    return mpBackStep(true);
  }
  window._mpBackStep = mpBackStepDirect;
  window._exitMpScreen = exitMpScreen;
  window._mpInRoom = () => !!currentRoom;

  
  function initAuth() {
    if (window.Auth?.user) {
      myUid    = window.Auth.user.uid;
      myName   = window.Auth.user.displayName || window.Auth.user.email || 'ผู้เล่น';
      myAvatar = window.Auth.user.photoURL || '';
    }
    if (window.Auth?.onUserChange) {
      window.Auth.onUserChange(user => {
        if (user) {
          myUid    = user.uid;
          myName   = user.displayName || user.email || 'ผู้เล่น';
          myAvatar = user.photoURL || '';
          const mpScreen = document.getElementById('screen-multiplayer');
          if (mpScreen?.classList.contains('active')) connect();
        } else {
          myUid = null;
          if (ws) ws.close();
        }
      });
    }
  }

  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindEvents();
      setTimeout(initAuth, 1500);
    });
  } else {
    
    bindEvents();
    setTimeout(initAuth, 1500);
  }

})();