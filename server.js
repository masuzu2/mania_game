
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');



let WebSocketServer = null;
try { WebSocketServer = require('ws').WebSocketServer; } catch(e) {
  console.warn('[MP] ⚠️  ไม่พบ module "ws" — ระบบ multiplayer จะปิดอยู่');
  console.warn('[MP]    รัน: npm install ws  เพื่อเปิดใช้งาน');
}



const mpClients = new Map();

const mpRooms = new Map();
let mpRoomCounter = 0;


const MAX_CONN_PER_IP = 5;   
const MAX_ROOMS_TOTAL = 200; 

function mpBroadcast(data, excludeWs = null) {
  const str = JSON.stringify(data);
  for (const [ws] of mpClients) {
    if (ws !== excludeWs && ws.readyState === 1) ws.send(str);
  }
}

function mpSendTo(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

function mpBroadcastRoom(roomId, data, excludeWs = null) {
  const room = mpRooms.get(roomId);
  if (!room) return;
  const str = JSON.stringify(data);
  for (const [, p] of room.players) {
    if (p.ws !== excludeWs && p.ws.readyState === 1) p.ws.send(str);
  }
}

function mpRoomSummary(room) {
  const hostEntry = [...room.players.values()].find(p => p.uid === room.host);
  return {
    id: room.id,
    name: room.name,
    hasPassword: !!room.password,
    host: hostEntry?.name || '?',
    hostUid: room.host,
    players: room.players.size,
    maxPlayers: 16,
    song: room.song || null,
    playing: !!room.playing,
  };
}

function mpRoomPlayersArr(room) {
  return [...room.players.values()].map(p => ({
    uid: p.uid, name: p.name, avatar: p.avatar,
    ready: p.ready, isHost: p.uid === room.host,
    score: p.score, acc: p.acc, combo: p.combo,
    downloadStatus: p.downloadStatus || null,
    finished: !!p.finished,
    skipped: !!p.skipped,
  }));
}


function mpBroadcastRoomPlayers(room, excludeWs) {
  mpBroadcastRoom(room.id, { type: 'room_players', players: mpRoomPlayersArr(room), playing: !!room.playing }, excludeWs);
}

function _broadcastFinalScores(room) {
  if (room._finishTimer) { clearTimeout(room._finishTimer); room._finishTimer = null; }
  const players = [...room.players.values()];
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
  const finalScores = sorted.map((p, i) => ({
    uid: p.uid, name: p.name, avatar: p.avatar,
    score: p.score || 0, acc: p.acc || 0, combo: p.combo || 0,
    judgeCounts: p.judgeCounts || null, maxCombo: p.maxCombo || p.combo || 0,
    rank: i + 1, skipped: !!p.skipped,
  }));
  
  room.playing = false;
  for (const [, pl] of room.players) {
    pl.finished = false; pl.skipped = false; pl.ready = false; pl.downloadStatus = null;
  }
  mpBroadcastRoom(room.id, { type: 'game_end', finalScores });
  
  mpBroadcastRoomPlayers(room);
  mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
}

function mpGetRoomList() {
  return [...mpRooms.values()].map(mpRoomSummary);
}

async function mpHandleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  const client = mpClients.get(ws);
  if (!client) return;

  switch (msg.type) {

    case 'auth': {
      
      
      
      
      let decoded = null;
      const tokenStr = String(msg.token || '');
      if (firebaseAdminReady && tokenStr) {
        try {
          decoded = await admin.auth().verifyIdToken(tokenStr);
        } catch (e) {
          console.warn('[MP Auth] verifyIdToken ล้มเหลว:', e.code || e.message);
          mpSendTo(ws, { type: 'error', message: 'token ไม่ถูกต้อง — กรุณา login ใหม่' });
          ws.close();
          return;
        }
      } else if (firebaseAdminReady && !tokenStr) {
        
        mpSendTo(ws, { type: 'error', message: 'กรุณา login ก่อนเข้าเล่น Multiplayer' });
        ws.close();
        return;
      }
      
      if (!firebaseAdminReady) {
        console.warn('[MP Auth] ⚠️  Dev mode — ไม่มี serviceAccountKey.json ใช้ uid จาก client ตรงๆ (ไม่ปลอดภัยสำหรับ production)');
      }
      client.uid    = decoded ? decoded.uid : (String(msg.uid || '').slice(0, 64) || 'guest_' + Date.now());
      client.name   = String(msg.name || 'ผู้เล่น').slice(0, 40);
      client.avatar = String(msg.avatar || '').slice(0, 300);
      // ส่งรายการห้องทันทีหลัง auth เสร็จ — client ไม่ต้องกดรีเฟรชเอง
      mpSendTo(ws, { type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'global_chat': {
      const text = String(msg.text || '').trim().slice(0, 300);
      if (!text) return;
      mpBroadcast({ type: 'global_chat', uid: client.uid, name: client.name, avatar: client.avatar, text, ts: Date.now() });
      break;
    }

    case 'get_rooms': {
      mpSendTo(ws, { type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'create_room': {
      if (client.roomId) return mpSendTo(ws, { type: 'error', message: 'ออกจากห้องเดิมก่อน' });
      
      if (mpRooms.size >= MAX_ROOMS_TOTAL) return mpSendTo(ws, { type: 'error', message: 'server เต็ม ไม่สามารถสร้างห้องใหม่ได้' });
      const roomId = 'room_' + (++mpRoomCounter);
      const name = String(msg.name || `ห้องของ ${client.name}`).slice(0, 50);
      const password = String(msg.password || '').slice(0, 30);
      const room = { id: roomId, name, password, host: client.uid, players: new Map(), song: null, started: false };
      room.players.set(client.uid, { ws, uid: client.uid, name: client.name, avatar: client.avatar, ready: false, score: 0, acc: 100, combo: 0 });
      mpRooms.set(roomId, room);
      client.roomId = roomId;
      mpSendTo(ws, { type: 'room_joined', roomId, name: room.name, hasPassword: !!password, isHost: true, players: mpRoomPlayersArr(room), song: room.song });
      
      mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'join_room': {
      if (client.roomId) return mpSendTo(ws, { type: 'error', message: 'ออกจากห้องเดิมก่อน' });
      const room = mpRooms.get(msg.roomId);
      if (!room) return mpSendTo(ws, { type: 'error', message: 'ไม่พบห้องนี้' });
      if (room.players.size >= 16) return mpSendTo(ws, { type: 'error', message: 'ห้องเต็มแล้ว' });
      if (room.password && room.password !== (msg.password || '')) {
        return mpSendTo(ws, { type: 'need_password', roomId: room.id, roomName: room.name });
      }
      room.players.set(client.uid, { ws, uid: client.uid, name: client.name, avatar: client.avatar, ready: false, score: 0, acc: 100, combo: 0 });
      client.roomId = room.id;
      mpSendTo(ws, { type: 'room_joined', roomId: room.id, name: room.name, hasPassword: !!room.password, isHost: false, players: mpRoomPlayersArr(room), song: room.song, playing: !!room.playing });
      mpBroadcastRoomPlayers(room, ws);
      mpBroadcastRoom(room.id, { type: 'room_chat', text: `${client.name} เข้าร่วมห้อง` });
      mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'leave_room': {
      mpLeaveRoom(ws, client);
      break;
    }

    case 'host_quit_game': {
      
      
      const room = mpRooms.get(client.roomId);
      if (!room) break;
      if (room._finishTimer) { clearTimeout(room._finishTimer); room._finishTimer = null; }
      if (room._countdownTimer) { clearInterval(room._countdownTimer); room._countdownTimer = null; }
      if (room._readyCheckTimeout) { clearTimeout(room._readyCheckTimeout); room._readyCheckTimeout = null; }
      room._readyCheckAcks = null;
      room.playing = false;
      
      mpBroadcastRoom(room.id, {
        type: 'host_quit_game',
        newHostUid: client.uid,   
        newHostName: client.name,
        quitterName: client.name,
      });
      mpBroadcastRoomPlayers(room);
      mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'ready': {
      const room = mpRooms.get(client.roomId);
      if (!room) return;
      const p = room.players.get(client.uid);
      if (p) p.ready = !!msg.ready;
      mpBroadcastRoomPlayers(room);
      break;
    }

    case 'room_chat': {
      const room = mpRooms.get(client.roomId);
      if (!room) return;
      const text = String(msg.text || '').trim().slice(0, 300);
      if (!text) return;
      mpBroadcastRoom(room.id, { type: 'room_chat', uid: client.uid, name: client.name, avatar: client.avatar, text, ts: Date.now() });
      break;
    }

    case 'select_song': {
      const room = mpRooms.get(client.roomId);
      if (!room || room.host !== client.uid) return;
      room.song = msg.song ? { title: String(msg.song.title || '').slice(0, 100), artist: String(msg.song.artist || '').slice(0, 80), creator: String(msg.song.creator || '').slice(0, 80), songId: msg.song.songId, entryId: msg.song.entryId, version: msg.song.version ? String(msg.song.version).slice(0, 80) : null, keyCount: Number.isFinite(msg.song.keyCount) ? msg.song.keyCount : null } : null;
      // reset ready ทุกคนเมื่อเพลงเปลี่ยน
      for (const [, p] of room.players) p.ready = false;
      mpBroadcastRoom(room.id, { type: 'room_song', song: room.song });
      mpBroadcastRoomPlayers(room);
      mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'update_room': {
      const room = mpRooms.get(client.roomId);
      if (!room || room.host !== client.uid) return;
      if (msg.name) room.name = String(msg.name).slice(0, 50);
      if (typeof msg.password === 'string') room.password = msg.password.slice(0, 30);
      mpBroadcastRoom(room.id, { type: 'room_updated', name: room.name, hasPassword: !!room.password });
      mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'kick': {
      const room = mpRooms.get(client.roomId);
      if (!room || room.host !== client.uid) return;
      const targetP = room.players.get(msg.targetUid);
      if (!targetP || msg.targetUid === client.uid) return;
      mpSendTo(targetP.ws, { type: 'kicked' });
      room.players.delete(msg.targetUid);
      const tc = mpClients.get(targetP.ws);
      if (tc) tc.roomId = null;
      mpBroadcastRoomPlayers(room);
      mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'transfer_host': {
      const room = mpRooms.get(client.roomId);
      if (!room || room.host !== client.uid) return;
      const newHost = room.players.get(msg.targetUid);
      if (!newHost) return;
      room.host = msg.targetUid;
      mpBroadcastRoom(room.id, { type: 'room_host', newHostUid: msg.targetUid, newHostName: newHost.name });
      mpBroadcastRoomPlayers(room);
      break;
    }

    case 'start_game': {
      const room = mpRooms.get(client.roomId);
      if (!room || room.host !== client.uid || !room.song) return;
      if (room._countdownTimer) break; 
      
      for (const [, p] of room.players) { p.score = 0; p.acc = 100; p.combo = 0; p.finished = false; p.judgeCounts = null; p.maxCombo = 0; }
      room._skipVotes = null;
      
      room._readyCheckAcks = new Set(); 
      room._readyCheckTimeout = null;
      
      mpBroadcastRoom(room.id, { type: 'game_ready_check', song: room.song });
      
      function _startCountdown() {
        if (room._readyCheckTimeout) { clearTimeout(room._readyCheckTimeout); room._readyCheckTimeout = null; }
        if (room._countdownTimer) return;
        room.playing = true;
        room.playStartedAt = Date.now();
        for (const [, p] of room.players) p.ready = false;
        
        let count = 3;
        mpBroadcastRoom(room.id, { type: 'game_countdown', count });
        room._countdownTimer = setInterval(() => {
          count--;
          if (count > 0) {
            mpBroadcastRoom(room.id, { type: 'game_countdown', count });
          } else if (count === 0) {
            
            mpBroadcastRoom(room.id, { type: 'game_countdown', count });
          } else {
            clearInterval(room._countdownTimer);
            room._countdownTimer = null;
            mpBroadcastRoom(room.id, { type: 'game_start', song: room.song });
            mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
          }
        }, 1000);
      }
      room._startCountdownFn = _startCountdown;
      
      room._readyCheckTimeout = setTimeout(() => {
        room._readyCheckTimeout = null;
        _startCountdown();
      }, 15000);
      mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
      break;
    }

    case 'game_loaded': {
      
      const room = mpRooms.get(client.roomId);
      if (!room || !room._readyCheckAcks) break;
      room._readyCheckAcks.add(client.uid);
      
      mpBroadcastRoom(room.id, {
        type: 'game_loaded_update',
        loaded: room._readyCheckAcks.size,
        total: room.players.size,
        name: client.name,
      });
      
      if (room._readyCheckAcks.size >= room.players.size) {
        if (room._startCountdownFn) room._startCountdownFn();
      }
      break;
    }

    case 'vote_skip': {
      
      const room = mpRooms.get(client.roomId);
      if (!room || !room.playing) break;
      if (!room._skipVotes) room._skipVotes = new Set();
      room._skipVotes.add(client.uid);
      const total = room.players.size;
      const votes = room._skipVotes.size;
      
      mpBroadcastRoom(room.id, {
        type: 'skip_vote_update',
        votes,
        total,
        voterName: client.name,
        doSkip: votes >= total,
      });
      if (votes >= total) {
        room._skipVotes = null; 
      }
      break;
    }

    case 'live_score': {
      const room = mpRooms.get(client.roomId);
      if (!room) return;
      const p = room.players.get(client.uid);
      if (p) {
        p.score = msg.score || 0; p.acc = msg.acc || 0; p.combo = msg.combo || 0;
        if (msg.judgeCounts) p.judgeCounts = msg.judgeCounts;
        if (msg.maxCombo != null) p.maxCombo = msg.maxCombo;
      }
      mpBroadcastRoom(room.id, { type: 'live_scores', players: mpRoomPlayersArr(room) });
      break;
    }

    case 'song_download_status': {
      
      const room = mpRooms.get(client.roomId);
      if (!room) return;
      const p = room.players.get(client.uid);
      if (!p) return;
      
      p.downloadStatus = msg.status || 'done';
      if (msg.status === 'done') p.ready = false; 
      mpBroadcastRoomPlayers(room);
      break;
    }

    case 'game_finish': {
      const room = mpRooms.get(client.roomId);
      if (!room) return;
      const p = room.players.get(client.uid);
      if (p) p.finished = true;

      
      const allPlayers = [...room.players.values()];
      const allDone = allPlayers.every(pl => pl.finished);

      if (allDone) {
        _broadcastFinalScores(room);
      } else {
        
        if (!room._finishTimer) {
          room._finishTimer = setTimeout(() => {
            room._finishTimer = null;
            
            for (const [, pl] of room.players) {
              if (!pl.finished) pl.skipped = true;
            }
            _broadcastFinalScores(room);
          }, 30000);
        }
        
        mpBroadcastRoom(room.id, { type: 'live_scores', players: mpRoomPlayersArr(room) });
      }
      break;
    }
  }
}

function mpLeaveRoom(ws, client) {
  if (!client.roomId) return;
  const room = mpRooms.get(client.roomId);
  client.roomId = null;
  if (!room) return;
  room.players.delete(client.uid);
  if (room.players.size === 0) {
    mpRooms.delete(room.id);
  } else {
    if (room.host === client.uid && room.playing) {
      
      if (room._finishTimer) { clearTimeout(room._finishTimer); room._finishTimer = null; }
      if (room._countdownTimer) { clearInterval(room._countdownTimer); room._countdownTimer = null; }
      if (room._readyCheckTimeout) { clearTimeout(room._readyCheckTimeout); room._readyCheckTimeout = null; }
      room._readyCheckAcks = null;
      room.playing = false;
      const first = room.players.values().next().value;
      if (first) {
        room.host = first.uid;
        mpBroadcastRoom(room.id, {
          type: 'host_disconnected',
          newHostUid: first.uid,
          newHostName: first.name,
          quitterName: client.name,
        });
        mpBroadcastRoomPlayers(room);
      } else {
        mpBroadcastRoom(room.id, { type: 'host_abort' });
        mpRooms.delete(room.id);
      }
    } else if (room.host === client.uid) {
      
      const first = room.players.values().next().value;
      if (first) {
        room.host = first.uid;
        mpBroadcastRoom(room.id, { type: 'room_host', newHostUid: first.uid, newHostName: first.name });
        mpBroadcastRoom(room.id, { type: 'room_chat', text: `${client.name} (หัวห้อง) ออกจากห้อง — ${first.name} เป็นหัวห้องคนใหม่` });
      }
      mpBroadcastRoomPlayers(room);
    } else {
      mpBroadcastRoom(room.id, { type: 'room_chat', text: `${client.name} ออกจากห้อง` });
      mpBroadcastRoomPlayers(room);
    }
  }
  mpBroadcast({ type: 'room_list', rooms: mpGetRoomList() });
}

function mpSetupWebSocket(server) {
  if (!WebSocketServer) return;
  const wss = new WebSocketServer({
    server,
    path: '/multiplayer',
    maxPayload: 64 * 1024, 
  });

  
  
  const WS_RATE_WINDOW_MS = 10 * 1000;
  const WS_RATE_MAX       = 30;

  function wsIsRateLimited(ws) {
    const now = Date.now();
    if (!ws._msgTs) ws._msgTs = [];
    while (ws._msgTs.length && now - ws._msgTs[0] > WS_RATE_WINDOW_MS) ws._msgTs.shift();
    if (ws._msgTs.length >= WS_RATE_MAX) return true;
    ws._msgTs.push(now);
    return false;
  }

  
  

  
  const HEARTBEAT_INTERVAL = 25000; 
  wss.on('connection', (ws, req) => {
    
    const CLOUDFLARE_IP_RANGES = [
      /^103\.21\.244\./, /^103\.22\.200\./, /^103\.31\.4\./,
      /^104\.1[6-9]\./, /^104\.2[0-5]\./, /^108\.162\.192\./,
      /^131\.0\.72\./, /^141\.101\.64\./, /^162\.158\./,
      /^172\.6[4-7]\./, /^173\.245\.48\./, /^188\.114\.96\./,
      /^190\.93\.240\./, /^197\.234\.240\./,
    ];
    const sockIp = (req.socket.remoteAddress || 'unknown').toString();
    const isCF   = CLOUDFLARE_IP_RANGES.some(re => re.test(sockIp));
    const wsIp   = (isCF && req.headers['cf-connecting-ip'])
      ? req.headers['cf-connecting-ip'].toString()
      : sockIp;
    ws._clientIp = wsIp;

    const connFromIp = [...wss.clients].filter(c => c._clientIp === wsIp).length;
    if (connFromIp > MAX_CONN_PER_IP) {
      ws.close(1008, 'too many connections from your IP');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; }); 

    mpClients.set(ws, { uid: null, name: 'guest', avatar: '', roomId: null });
    ws.on('message', (raw) => {
      ws.isAlive = true; 
      
      
      
      const rawStr = raw.toString();
      
      
      const GAMEPLAY_EXEMPT = new Set(['live_score','game_finish','game_loaded','song_download_status','vote_skip','ready']);
      let msgType = '';
      try { msgType = JSON.parse(rawStr).type || ''; } catch {}
      if (!GAMEPLAY_EXEMPT.has(msgType) && wsIsRateLimited(ws)) {
        return; // silent drop — ไม่ขึ้น error message ให้ผู้เล่นเห็น
      }
      mpHandleMessage(ws, rawStr);
    });
    ws.on('close', () => {
      const client = mpClients.get(ws);
      if (client) mpLeaveRoom(ws, client);
      mpClients.delete(ws);
    });
    ws.on('error', () => {});
  });

  
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch(e) {}
    }
  }, HEARTBEAT_INTERVAL);

  
  wss.on('close', () => clearInterval(heartbeatTimer));

  console.log('[MP] ✅  WebSocket multiplayer พร้อมใช้งานที่ /multiplayer (heartbeat ทุก ' + (HEARTBEAT_INTERVAL/1000) + 'วิ)');
}

const PORT = 8000;
const ROOT = __dirname;



const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  `https://rhythmgame.zpln.xyz`,
]);






const admin = require('firebase-admin');
let firebaseAdminReady = false;
try {
  const serviceAccountPath = path.join(ROOT, 'serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
    firebaseAdminReady = true;
    console.log('[Auth] Firebase Admin พร้อมใช้งาน — token verification เปิดอยู่');
  } else {
    console.warn('[Auth] ⚠️  ไม่พบ serviceAccountKey.json — token verification จะถูกปฏิเสธทุกคำขอที่ต้อง login');
    console.warn('[Auth] ดูวิธีตั้งค่าใน README.md หัวข้อ "การตั้งค่า Firebase Admin"');
  }
} catch (err) {
  console.error('[Auth] โหลด firebase-admin ไม่สำเร็จ:', err.message);
  console.error('[Auth] รัน "npm install firebase-admin" แล้วลองใหม่');
}


async function verifyIdToken(req) {
  if (!firebaseAdminReady) return null;
  const authHeader = req.headers['authorization'] || '';
  const m = /^Bearer (.+)$/.exec(authHeader);
  if (!m) return null;
  try {
    return await admin.auth().verifyIdToken(m[1]);
  } catch (err) {
    console.error('[Auth] verifyIdToken ล้มเหลว:', err.code, '-', err.message);
    return null;
  }
}

// ===== Rate limiting แบบง่าย (กัน spam/flood ใส่ API ที่เขียนข้อมูล) =====
// จำกัดต่อ IP: ไม่เกิน RATE_LIMIT_MAX ครั้ง ภายใน RATE_LIMIT_WINDOW_MS
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  let arr = rateBuckets.get(ip);
  if (!arr) { arr = []; rateBuckets.set(ip, arr); }
  // ทิ้ง timestamp ที่หมดอายุ
  while (arr.length && now - arr[0] > RATE_LIMIT_WINDOW_MS) arr.shift();
  if (arr.length >= RATE_LIMIT_MAX) return true;
  arr.push(now);
  return false;
}
// เก็บกวาด bucket เก่าเป็นระยะ กัน memory leak จาก IP ที่ไม่กลับมาอีก
setInterval(() => {
  const now = Date.now();
  for (const [ip, arr] of rateBuckets) {
    while (arr.length && now - arr[0] > RATE_LIMIT_WINDOW_MS) arr.shift();
    if (arr.length === 0) rateBuckets.delete(ip);
  }
}, 5 * 60 * 1000).unref();

// ===== Profile images (avatar/banner) =====
// เก็บเป็นไฟล์รูปจริงบนดิสก์ (ไม่ใช่ localStorage) ตั้งชื่อไฟล์ตาม uid + ประเภท
// เพื่อให้คนอื่น/อุปกรณ์อื่นเห็นรูปเดียวกันเสมอ ไม่ต้องพึ่ง browser storage
const PROFILE_IMAGES_DIR = path.join(ROOT, 'profile-images');
if (!fs.existsSync(PROFILE_IMAGES_DIR)) fs.mkdirSync(PROFILE_IMAGES_DIR, { recursive: true });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; 

const IMAGE_EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};


function parseDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1];
  if (!IMAGE_EXT_BY_MIME[mime]) return null;
  return { mime, buffer: Buffer.from(m[2], 'base64') };
}


function findProfileImageFile(uid, kind) {
  const safeUid = sanitizeUid(uid);
  if (!safeUid) return null;
  const prefix = `${safeUid}-${kind}`;
  const files = fs.readdirSync(PROFILE_IMAGES_DIR);
  const found = files.find(f => f.startsWith(prefix + '.'));
  return found ? path.join(PROFILE_IMAGES_DIR, found) : null;
}

function escHtmlServer(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizeUid(uid) {
  // กัน path traversal เผื่อ uid มีอักขระแปลกๆ — เหลือไว้แค่ตัวอักษร/ตัวเลข/_-
  // ใช้ pattern เดียวกับ sanitizeUidForFile เพื่อความสม่ำเสมอ
  return String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function removeExistingProfileImage(uid, kind) {
  const existing = findProfileImageFile(uid, kind);
  if (existing) { try { fs.unlinkSync(existing); } catch {} }
}

// scores stored in memory เป็น flat map "uid::songId" -> record (โค้ดส่วนอื่นของไฟล์นี้ใช้รูปแบบนี้เหมือนเดิมทุกจุด)



const SCORES_DIR = path.join(ROOT, 'scores');


if (!fs.existsSync(SCORES_DIR)) fs.mkdirSync(SCORES_DIR, { recursive: true });


function sanitizeUidForFile(uid) {
  return String(uid || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function scoreFileForUid(uid) {
  return path.join(SCORES_DIR, `${sanitizeUidForFile(uid)}.json`);
}


function loadUserScoreFile(uid) {
  const flat = {};
  try {
    const raw = JSON.parse(fs.readFileSync(scoreFileForUid(uid), 'utf8'));
    const userScores = raw.scores || {};
    for (const songId of Object.keys(userScores)) {
      const s = userScores[songId] || {};
      flat[`${uid}::${songId}`] = {
        uid,
        displayName: raw.displayName || '',
        photoURL: raw.photoURL || '',
        songId,
        beatmapSetId: s.beatmapSetId || null,
        score: s.score,
        accuracy: s.accuracy,
        rank: s.rank,
        judgeCounts: s.judgeCounts,
        maxCombo: s.maxCombo,
        ts: s.ts,
      };
    }
  } catch { /* ไฟล์ยังไม่มี หรืออ่านไม่ได้ — ข้ามไป */ }
  return flat;
}

function loadScores() {
  const flat = {};

  // โหลดจากโฟลเดอร์ scores/ (รูปแบบใหม่: แยกไฟล์ต่อ user)
  let scoreFiles = [];
  try { scoreFiles = fs.readdirSync(SCORES_DIR).filter(f => f.endsWith('.json')); } catch {}
  for (const file of scoreFiles) {
    
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(SCORES_DIR, file), 'utf8'));
      const uid = raw.uid; 
      if (!uid) continue;
      const userScores = raw.scores || {};
      for (const songId of Object.keys(userScores)) {
        const s = userScores[songId] || {};
        flat[`${uid}::${songId}`] = {
          uid,
          displayName: raw.displayName || '',
          photoURL: raw.photoURL || '',
          songId,
          beatmapSetId: s.beatmapSetId || null,
          score: s.score,
          accuracy: s.accuracy,
          rank: s.rank,
          judgeCounts: s.judgeCounts,
          maxCombo: s.maxCombo,
          ts: s.ts,
        };
      }
    } catch {}
  }

  // migrate จาก scores.json เก่า (รูปแบบเดิม) — โหลดครั้งเดียว แล้ว saveScores() จะเขียนใหม่เป็นรูปแบบใหม่
  const legacyFile = path.join(ROOT, 'scores.json');
  if (fs.existsSync(legacyFile)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      if (legacy && legacy.users && typeof legacy.users === 'object') {
        for (const uid of Object.keys(legacy.users)) {
          const u = legacy.users[uid] || {};
          const userScores = u.scores || {};
          for (const songId of Object.keys(userScores)) {
            const key = `${uid}::${songId}`;
            if (flat[key]) continue; 
            const s = userScores[songId] || {};
            flat[key] = {
              uid, displayName: u.displayName || '', photoURL: u.photoURL || '',
              songId, score: s.score, accuracy: s.accuracy, rank: s.rank,
              judgeCounts: s.judgeCounts, maxCombo: s.maxCombo, ts: s.ts,
            };
          }
        }
      } else if (legacy && typeof legacy === 'object') {
        for (const key of Object.keys(legacy)) {
          const s = legacy[key];
          if (s && s.uid && s.songId && !flat[key]) flat[key] = s;
        }
      }
      
      console.log('[Scores] migrating scores.json → scores/{uid}.json ...');
    } catch {}
  }

  return flat;
}



function loadLifetimeScores() {
  const out = {};
  let scoreFiles = [];
  try { scoreFiles = fs.readdirSync(SCORES_DIR).filter(f => f.endsWith('.json')); } catch {}
  for (const file of scoreFiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(SCORES_DIR, file), 'utf8'));
      if (!raw.uid) continue;
      if (typeof raw.lifetimeScore === 'number') {
        out[raw.uid] = raw.lifetimeScore;
      } else {
        
        
        const userScores = raw.scores || {};
        const backfill = Object.values(userScores).reduce((sum, s) => sum + (s?.score || 0), 0);
        out[raw.uid] = backfill;
      }
    } catch {}
  }
  return out;
}

let scores = loadScores();
let lifetimeScores = loadLifetimeScores();



const SETTINGS_DIR = path.join(ROOT, 'settings');
if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });

function settingsFileForUid(uid) {
  return path.join(SETTINGS_DIR, `${sanitizeUidForFile(uid)}.json`);
}


function saveScoreForUid(uid) {
  
  const userEntries = Object.values(scores).filter(s => s && s.uid === uid);
  if (!userEntries.length) return;

  
  let latestTs = -1, displayName = '', photoURL = '';
  for (const s of userEntries) {
    if ((s.ts || 0) >= latestTs) {
      latestTs = s.ts || 0;
      displayName = s.displayName || displayName;
      photoURL = s.photoURL || photoURL;
    }
  }

  // เรียงเพลงตามตัวอักษร
  const sortedSongIds = userEntries.map(s => s.songId).sort((a, b) => a.localeCompare(b, 'th'));
  const songScores = {};
  for (const songId of sortedSongIds) {
    const s = scores[`${uid}::${songId}`];
    if (!s) continue;
    songScores[songId] = {
      ...(s.beatmapSetId != null ? { beatmapSetId: s.beatmapSetId } : {}),
      score: s.score, accuracy: s.accuracy, rank: s.rank,
      judgeCounts: s.judgeCounts, maxCombo: s.maxCombo, ts: s.ts,
    };
  }

  const out = { uid, displayName, photoURL, lifetimeScore: lifetimeScores[uid] || 0, scores: songScores };
  fs.writeFileSync(scoreFileForUid(uid), JSON.stringify(out, null, 2));
}


function saveScores() {
  const uids = [...new Set(Object.values(scores).filter(s => s && s.uid).map(s => s.uid))];
  for (const uid of uids) saveScoreForUid(uid);
}


{
  const legacyFile = path.join(ROOT, 'scores.json');
  if (fs.existsSync(legacyFile) && Object.keys(scores).length > 0) {
    saveScores(); 
    try {
      fs.renameSync(legacyFile, path.join(ROOT, 'scores.json.bak'));
      console.log('[Scores] migration done — scores.json renamed to scores.json.bak');
    } catch {}
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.osz':  'application/octet-stream',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ogg':  'audio/ogg',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
};





const STATIC_DENY_FILENAMES = new Set([
  'serviceaccountkey.json',
  'server.js',
  'scores.json',
  'package.json',
  'package-lock.json',
  '.env',
]);
function isStaticDenied(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (STATIC_DENY_FILENAMES.has(base)) return true;
  if (base.startsWith('.')) return true; 
  if (base.endsWith('.json') && base.includes('key')) return true; 
  
  const rel = path.relative(ROOT, filePath);
  const parts = rel.split(path.sep);
  if (parts[0] === 'node_modules' || parts[0] === '.git' || parts[0] === 'scores' || parts[0] === 'settings') return true;
  return false;
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let buf = '';
    let bytes = 0;
    let rejected = false;
    req.on('data', c => {
      if (rejected) return;
      bytes += c.length;
      if (maxBytes && bytes > maxBytes) {
        rejected = true;
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      buf += c;
    });
    req.on('end', () => { if (!rejected) resolve(buf); });
    req.on('error', (err) => { if (!rejected) reject(err); });
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);
  
  
  
  const CLOUDFLARE_IP_RANGES = [
    /^103\.21\.244\./,  /^103\.22\.200\./,  /^103\.31\.4\./,
    /^104\.16\./,       /^104\.17\./,       /^104\.18\./,       /^104\.19\./,
    /^104\.20\./,       /^104\.21\./,       /^104\.22\./,       /^104\.23\./,
    /^104\.24\./,       /^104\.25\./,       /^108\.162\.192\./,
    /^131\.0\.72\./,    /^141\.101\.64\./,  /^162\.158\./,
    /^172\.64\./,       /^172\.65\./,       /^172\.66\./,       /^172\.67\./,
    /^173\.245\.48\./,  /^188\.114\.96\./,  /^190\.93\.240\./,
    /^197\.234\.240\./,
  ];
  const socketIp = (req.socket.remoteAddress || 'unknown').toString();
  const isFromCloudflare = CLOUDFLARE_IP_RANGES.some(re => re.test(socketIp));
  const clientIp = (isFromCloudflare && req.headers['cf-connecting-ip'])
    ? req.headers['cf-connecting-ip'].toString()
    : socketIp;

  
  
  const reqOrigin = req.headers['origin'] || '';
  const allowedOrigin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : '';
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  
  if (req.method === 'POST' && isRateLimited(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ saved: false, reason: 'rate_limited' }));
    return;
  }

  
  
  
  
  

  const https = require('https');

  function httpsGet(urlStr, headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const opts = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...headers,
        },
        timeout: 15000,
      };
      const req = https.request(opts, resolve);
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  }

  
  function httpsFollow(urlStr, headers = {}, maxRedirects = 5) {
    return new Promise(async (resolve, reject) => {
      let current = urlStr;
      for (let i = 0; i <= maxRedirects; i++) {
        try {
          const r = await httpsGet(current, headers);
          if ((r.statusCode === 301 || r.statusCode === 302 || r.statusCode === 307 || r.statusCode === 308) && r.headers.location) {
            current = r.headers.location.startsWith('http') ? r.headers.location : new URL(r.headers.location, current).href;
            r.resume(); 
            continue;
          }
          resolve(r);
          return;
        } catch (e) { reject(e); return; }
      }
      reject(new Error('too many redirects'));
    });
  }

  
  const DOWNLOAD_MIRRORS = [
    id => `https://api.nerinyan.moe/d/${id}`,
    id => `https://catboy.best/d/${id}`,
    id => `https://chimu.moe/d/${id}`,
    id => `https://beatconnect.io/b/${id}`,
  ];

  
  
  
  if (pathname.startsWith('/api/beatmap/featured') && req.method === 'GET') {
    
    const modes = ['3', '0'];
    const startPage = parseInt(parsed.query.page, 10) || 0;
    const PAGES_PER_MODE = 6;   
    const PAGE_SIZE = 50;       
    try {
      
      const fetchPromises = [];
      for (const mode of modes) {
        for (let i = 0; i < PAGES_PER_MODE; i++) {
          const pageNum = startPage * PAGES_PER_MODE + i;
          const featuredUrl = `https://api.nerinyan.moe/search?m=${mode}&p=${pageNum}&s=Ranked,Loved,Qualified&ps=${PAGE_SIZE}&sort=updated_desc`;
          fetchPromises.push((async () => {
            try {
              const r = await httpsFollow(featuredUrl);
              let body = '';
              r.on('data', d => body += d);
              await new Promise(ok => r.on('end', ok));
              if (r.statusCode !== 200) return [];
              const data = JSON.parse(body);
              return Array.isArray(data) ? data : (data.beatmapSets || data.data || []);
            } catch { return []; }
          })());
        }
      }
      const results = await Promise.all(fetchPromises);

      
      const seen = new Set();
      const merged = [];
      for (const sets of results) {
        for (const set of sets) {
          const sid = String(set.id ?? set.SetID ?? '');
          if (!sid || seen.has(sid)) continue;
          seen.add(sid);
          merged.push(set);
        }
      }

      // สลับลำดับแบบสุ่มเล็กน้อย กันไม่ให้ผลลัพธ์จาก mode/หน้าเดียวกันเรียงติดกันเป็นกลุ่มยาวๆ
      for (let i = merged.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [merged[i], merged[j]] = [merged[j], merged[i]];
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(merged));
    } catch (e) {
      res.writeHead(502); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  
  
  if (pathname.startsWith('/api/beatmap/info/') && req.method === 'GET') {
    const id = pathname.replace('/api/beatmap/info/', '').replace(/[^0-9]/g, '');
    if (!id) { res.writeHead(400); res.end(JSON.stringify({ error: 'bad id' })); return; }

    async function fetchSetJSON(url) {
      try {
        const r = await httpsFollow(url);
        let body = '';
        r.on('data', d => body += d);
        await new Promise(ok => r.on('end', ok));
        if (r.statusCode !== 200) return null;
        return JSON.parse(body);
      } catch { return null; }
    }

    try {
      
      const nerinyanUrl = `https://api.nerinyan.moe/search?q=${id}&ps=5`;
      const catboyUrl   = `https://catboy.best/api/v2/s/${id}`;

      let set = null;

      
      const nerinyanData = await fetchSetJSON(nerinyanUrl);
      if (nerinyanData) {
        const arr = Array.isArray(nerinyanData) ? nerinyanData : [];
        set = arr.find(s => String(s.id) === String(id)) || null;
      }

      
      if (!set) {
        const catboySet = await fetchSetJSON(catboyUrl);
        if (catboySet && catboySet.id) {
          set = {
            ...catboySet,
            id: catboySet.id ?? catboySet.SetID,
            title: catboySet.title ?? catboySet.Title,
            artist: catboySet.artist ?? catboySet.Artist,
            creator: catboySet.creator ?? catboySet.Creator,
            beatmaps: catboySet.beatmaps ?? catboySet.ChildrenBeatmaps ?? [],
          };
        }
      }

      if (!set) { res.writeHead(404); res.end(JSON.stringify({ error: 'not found' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(set));
    } catch (e) {
      res.writeHead(502); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/beatmap/search') && req.method === 'GET') {
    const q    = (parsed.query.q || '').trim();
    // ค้นหาทั้ง osu!mania (3) และ osu!standard (0) — แมพ std จะถูกแปลงเป็น mania
    // อัตโนมัติฝั่ง client ตอนโหลด (ดู js/stdToManiaBridge.js)
    const modes = ['3', '0'];
    const page = parsed.query.page || '0';
    if (!q) { res.writeHead(400); res.end(JSON.stringify({ error: 'missing q' })); return; }

    
    async function fetchSearchJSON(url) {
      try {
        const r = await httpsFollow(url);
        let body = '';
        r.on('data', d => body += d);
        await new Promise(ok => r.on('end', ok));
        if (r.statusCode !== 200) return [];
        const data = JSON.parse(body);
        return Array.isArray(data) ? data : (data.beatmapSets || data.data || []);
      } catch { return []; }
    }

    
    function normCatboy(set) {
      return {
        ...set,
        id: set.id ?? set.SetID,
        title: set.title ?? set.Title,
        artist: set.artist ?? set.Artist,
        creator: set.creator ?? set.Creator,
        beatmaps: set.beatmaps ?? set.ChildrenBeatmaps ?? [],
      };
    }

    try {
      
      const fetchPromises = [];
      for (const mode of modes) {
        const nerinyanUrl = `https://api.nerinyan.moe/search?q=${encodeURIComponent(q)}&m=${mode}&p=${page}&s=Ranked,Loved,Qualified,Pending&ps=20`;
        const catboyUrl   = `https://catboy.best/api/v2/search?q=${encodeURIComponent(q)}&m=${mode}&limit=20`;
        fetchPromises.push(fetchSearchJSON(nerinyanUrl));
        fetchPromises.push(fetchSearchJSON(catboyUrl).then(raw => raw.map(normCatboy)));
      }
      const results = await Promise.all(fetchPromises);

      
      const seen = new Set();
      const merged = [];
      for (const sets of results) {
        for (const set of sets) {
          const sid = String(set.id ?? set.SetID ?? '');
          if (!sid || seen.has(sid)) continue;
          seen.add(sid);
          merged.push(set);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(merged));
    } catch (e) {
      res.writeHead(502); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname.startsWith('/api/beatmap/download/') && req.method === 'GET') {
    const id = pathname.replace('/api/beatmap/download/', '').replace(/[^0-9]/g, '');
    if (!id) { res.writeHead(400); res.end('bad id'); return; }

    
    
    
    const MAX_DL_BYTES = 200 * 1024 * 1024; 
    let sent = false;
    for (const mirror of DOWNLOAD_MIRRORS) {
      try {
        const r = await httpsFollow(mirror(id), {}, 8);
        if (r.statusCode !== 200) { r.resume(); continue; }

        
        const contentLen = parseInt(r.headers['content-length'] || '0', 10);
        if (contentLen > MAX_DL_BYTES) { r.resume(); continue; }

        const chunks = [];
        let totalBytes = 0;
        let tooBig = false;
        await new Promise((resolve, reject) => {
          r.on('data', chunk => {
            totalBytes += chunk.length;
            if (totalBytes > MAX_DL_BYTES) {
              tooBig = true;
              r.destroy(); 
              resolve();
              return;
            }
            chunks.push(chunk);
          });
          r.on('end', resolve);
          r.on('error', reject);
        });
        if (tooBig) continue; 

        const fileBuffer = Buffer.concat(chunks);

        
        if (fileBuffer.length < 4 ||
            fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4B ||
            fileBuffer[2] !== 0x03 || fileBuffer[3] !== 0x04) {
          continue;
        }

        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${id}.osz"`,
          'Content-Length': fileBuffer.length,
          'Cache-Control': 'no-cache',
        });
        res.end(fileBuffer);
        sent = true;
        break;
      } catch (e) {  }
    }
    if (!sent) {
      if (!res.headersSent) { res.writeHead(502); res.end('all mirrors failed'); }
    }
    return;
  }

  
  
  
  if (pathname === '/api/hitsounds' && req.method === 'GET') {
    const AUDIO_EXT = new Set(['.wav', '.mp3', '.ogg']);
    const hsBase = path.join(ROOT, 'hitsounds');
    const result = {};
    for (const type of ['N', 'LN', 'Miss']) {
      const dir = path.join(hsBase, type);
      try {
        result[type] = fs.existsSync(dir)
          ? fs.readdirSync(dir).filter(f => AUDIO_EXT.has(path.extname(f).toLowerCase()))
          : [];
      } catch { result[type] = []; }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(result));
    return;
  }

  
  if (pathname === '/api/scores' && req.method === 'POST') {
    const decoded = await verifyIdToken(req);
    if (!decoded) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'unauthorized' }));
      return;
    }
    let body;
    try {
      
      body = JSON.parse(await readBody(req, 64 * 1024));
    } catch (err) {
      const code = err.message === 'payload_too_large' ? 413 : 400;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: err.message === 'payload_too_large' ? 'payload_too_large' : 'bad_request' }));
      return;
    }
    
    
    if (typeof body.songId !== 'string' || !body.songId || typeof body.score !== 'number' || !Number.isFinite(body.score)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'bad_request' }));
      return;
    }
    const uid = decoded.uid;
    const key = `${uid}::${body.songId}`;
    const prev = scores[key];
    
    lifetimeScores[uid] = (lifetimeScores[uid] || 0) + body.score;
    if (!prev || body.score > prev.score) {
      scores[key] = { ...body, uid, ts: Date.now() };
    }
    saveScoreForUid(uid); 
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ saved: true, best: scores[key], lifetimeScore: lifetimeScores[uid] }));
    return;
  }

  
  if (pathname === '/api/lifetime-score' && req.method === 'GET') {
    const uid = parsed.query.uid;
    if (!uid) { res.writeHead(400); res.end('need uid'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ uid, lifetimeScore: lifetimeScores[uid] || 0 }));
    return;
  }

  if (pathname === '/api/scores' && req.method === 'GET') {
    const songId = parsed.query.songId;
    const uid    = parsed.query.uid;
    if (songId) {
      
      const board = Object.values(scores)
        .filter(s => s.songId === songId)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(board));
      return;
    }
    if (uid) {
      
      const userScores = Object.values(scores).filter(s => s.uid === uid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(userScores));
      return;
    }
    res.writeHead(400); res.end('need songId or uid');
    return;
  }

  
  if (pathname === '/api/settings' && req.method === 'POST') {
    const decoded = await verifyIdToken(req);
    if (!decoded) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'unauthorized' }));
      return;
    }
    let body;
    try {
      
      body = JSON.parse(await readBody(req, 64 * 1024));
    } catch (err) {
      const code = err.message === 'payload_too_large' ? 413 : 400;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: err.message === 'payload_too_large' ? 'payload_too_large' : 'bad_request' }));
      return;
    }
    const uid = decoded.uid;
    try {
      fs.writeFileSync(settingsFileForUid(uid), JSON.stringify({ uid, settings: body, ts: Date.now() }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'write_failed' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ saved: true }));
    return;
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    
    const decoded = await verifyIdToken(req);
    if (!decoded) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ settings: null, reason: 'unauthorized' }));
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(settingsFileForUid(decoded.uid), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ settings: raw.settings || null }));
    } catch {
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ settings: null }));
    }
    return;
  }

  
  
  if (pathname === '/api/profile-image' && req.method === 'POST') {
    const decoded = await verifyIdToken(req);
    if (!decoded) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'unauthorized' }));
      return;
    }
    let body;
    try {
      body = JSON.parse(await readBody(req, MAX_IMAGE_BYTES * 2)); 
    } catch (err) {
      const code = err.message === 'payload_too_large' ? 413 : 400;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: err.message === 'payload_too_large' ? 'image_too_large' : 'bad_request' }));
      return;
    }
    
    const uid = decoded.uid;
    const { kind, dataUrl } = body || {};
    const safeUid = sanitizeUid(uid);
    if (!safeUid || (kind !== 'avatar' && kind !== 'banner') || !dataUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'bad_request' }));
      return;
    }
    const parsed_img = parseDataUrl(dataUrl);
    if (!parsed_img) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'unsupported_image_type' }));
      return;
    }
    if (parsed_img.buffer.length > MAX_IMAGE_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: false, reason: 'image_too_large' }));
      return;
    }
    removeExistingProfileImage(safeUid, kind); 
    const ext = IMAGE_EXT_BY_MIME[parsed_img.mime];
    const fileName = `${safeUid}-${kind}${ext}`;
    fs.writeFileSync(path.join(PROFILE_IMAGES_DIR, fileName), parsed_img.buffer);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ saved: true, url: `/profile-images/${fileName}?t=${Date.now()}` }));
    return;
  }

  if (pathname === '/api/profile-image' && req.method === 'GET') {
    const uid  = parsed.query.uid;
    const kind = parsed.query.kind;
    if (!uid || (kind !== 'avatar' && kind !== 'banner')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: null }));
      return;
    }
    const file = findProfileImageFile(uid, kind);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: file ? `/profile-images/${path.basename(file)}` : null }));
    return;
  }

  
  if (pathname.startsWith('/profile-images/') && req.method === 'GET') {
    const fileName = path.basename(decodeURIComponent(pathname)); 
    const filePath = path.join(PROFILE_IMAGES_DIR, fileName);
    if (!filePath.startsWith(PROFILE_IMAGES_DIR) || !fs.existsSync(filePath)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  
  
  if (pathname === '/api/ranking' && req.method === 'GET') {
    
    function calcScorePP(s) {
      const acc   = (s.accuracy || 0) / 100;
      const combo = s.maxCombo || 1;
      return Math.round(Math.pow(acc, 6) * Math.pow(combo, 0.5) * 1.0);
    }
    function calcTotalPP(userScores) {
      const sorted = userScores.map(calcScorePP).sort((a, b) => b - a);
      return Math.round(sorted.reduce((sum, pp, i) => sum + pp * Math.pow(0.95, i), 0));
    }
    
    function osuRawScore(lv) {
      return (5000 / 3) * (4 * lv ** 3 - 3 * lv ** 2 - lv) + 1.25 * Math.pow(1.8, lv - 60);
    }
    const RAW_SCORE_100 = osuRawScore(100);
    
    
    const LEVEL_100_SCORE = 1_000_000_000;
    function scoreForLevel(lv) {
      if (lv <= 1) return 0;
      return LEVEL_100_SCORE * (osuRawScore(lv) / RAW_SCORE_100);
    }
    function levelFromTotalScore(totalScore) {
      let lv = 1;
      while (lv < 100 && totalScore >= scoreForLevel(lv + 1)) lv++;
      return lv;
    }

    
    const byUid = {};
    for (const s of Object.values(scores)) {
      if (!s.uid) continue;
      if (!byUid[s.uid]) byUid[s.uid] = { uid: s.uid, displayName: s.displayName || '?', photoURL: s.photoURL || '', scores: [] };
      byUid[s.uid].scores.push(s);
    }

    let ranking = Object.values(byUid).map(u => {
      const uploadedAvatar = findProfileImageFile(u.uid, 'avatar');
      const avatarUrl = uploadedAvatar ? `/profile-images/${path.basename(uploadedAvatar)}` : u.photoURL;
      const totalPP   = calcTotalPP(u.scores);
      const totalScore = u.scores.reduce((s, x) => s + (x.score || 0), 0);
      const lifetimeScore = lifetimeScores[u.uid] || 0;
      const avgAcc    = u.scores.length ? u.scores.reduce((s, x) => s + (x.accuracy || 0), 0) / u.scores.length : 0;
      const level     = levelFromTotalScore(lifetimeScore);
      return { uid: u.uid, displayName: u.displayName, photoURL: avatarUrl, totalPP, totalScore, lifetimeScore, avgAcc: +avgAcc.toFixed(2), plays: u.scores.length, level };
    });

    ranking.sort((a, b) => b.totalPP - a.totalPP);
    ranking = ranking.map((r, i) => ({ ...r, rank: i + 1 }));

    
    const targetUid = parsed.query.uid;
    if (targetUid) {
      const found = ranking.find(r => r.uid === targetUid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(found || null));
      return;
    }

    const limit = Math.min(parseInt(parsed.query.limit || '50', 10), 100);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ranking.slice(0, limit)));
    return;
  }

  if (pathname === '/api/players' && req.method === 'GET') {
    const q = (parsed.query.q || '').toString().trim().toLowerCase();
    const byUid = {};
    for (const s of Object.values(scores)) {
      if (!s.uid) continue;
      if (!byUid[s.uid] || s.ts > byUid[s.uid].ts) byUid[s.uid] = s;
    }
    let players = Object.values(byUid).map(s => {
      // ใช้รูปที่ upload ไว้บน server ก่อน (ถ้ามี) แทน photoURL จาก Firebase/Google
      const uploadedAvatar = findProfileImageFile(s.uid, 'avatar');
      const avatarUrl = uploadedAvatar
        ? `/profile-images/${path.basename(uploadedAvatar)}`
        : (s.photoURL || '');
      return { uid: s.uid, displayName: s.displayName || 'ไม่ระบุชื่อ', photoURL: avatarUrl };
    });
    if (q) {
      players = players.filter(p => p.displayName.toLowerCase().includes(q));
    }
    players.sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(players.slice(0, 30)));
    return;
  }

  
  
  
  const requestedPath = pathname === '/' ? 'index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, requestedPath));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  
  if (pathname === '/songs/' || pathname === '/songs') {
    const songsDir = path.join(ROOT, 'songs');
    if (!fs.existsSync(songsDir)) { res.writeHead(404); res.end('Not found'); return; }
    const files = fs.readdirSync(songsDir);
    const links = files.map(f =>
      `<a href="/songs/${encodeURIComponent(f)}">${escHtmlServer(f)}</a>`
    ).join('\n');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<html><body>${links}</body></html>`);
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }

  if (isStaticDenied(filePath)) {
    res.writeHead(404); res.end('Not found'); return; 
  }

  const ext = path.extname(filePath).toLowerCase();
  const ct  = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': ct });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n🎵  KeyStream is running at  http://localhost:${PORT}\n`);
  mpSetupWebSocket(server);
});