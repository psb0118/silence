"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "client");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8"
};

function send(res, code, headers, body) {
  res.writeHead(code, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    return send(res, 400, { "Content-Type": "text/plain" }, "Bad Request");
  }

  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, { "Content-Type": "text/plain" }, "Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "404 Not Found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    // html/js/mjs/css는 항상 재검증 — 새 배포가 브라우저 캐시(구버전 모듈)에 갇히지 않게.
    // (ES모듈 import는 ?v= 진입점과 무관하게 URL 그대로 캐시되므로 max-age 금지)
    const noCache = ext === ".html" || ext === ".js" || ext === ".mjs" || ext === ".css";
    const headers = {
      "Content-Type": type,
      "Cache-Control": noCache ? "no-cache" : "public, max-age=3600"
    };
    send(res, 200, headers, data);
  });
});

/* =========================================================
   협동 멀티플레이 — 방 로비 + 얇은 릴레이
   (월드 시뮬레이션은 host 클라이언트가 소유한다)
========================================================= */
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  serveClient: true
});

const MAX_PLAYERS = 4;
/* 모호한 문자(0/O, 1/I/L) 제외 — 사람이 불러 적기 좋은 4자리 */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOMS = new Map();

function createRoomId() {
  for (let n = 0; n < 500; n++) {
    let id = "";
    for (let i = 0; i < 4; i++) id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!ROOMS.has(id)) return id;
  }
  return "ZZZZ";
}

function lobbyState(room) {
  return {
    code: room.id,
    hostId: room.hostId,
    started: room.started,
    difficulty: room.difficulty,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, host: p.id === room.hostId
    }))
  };
}

function broadcastLobby(room) {
  io.to(room.id).emit("mp:lobby", lobbyState(room));
}

function leaveRoom(socket, reason) {
  const room = ROOMS.get(socket.data.roomId);
  if (!room) {
    socket.data.roomId = null;
    return;
  }
  const idx = room.players.findIndex((p) => p.id === socket.id);
  if (idx >= 0) room.players.splice(idx, 1);
  socket.leave(room.id);
  socket.data.roomId = null;

  if (room.players.length === 0) {
    ROOMS.delete(room.id);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
  }
  broadcastLobby(room);
}

io.on("connection", (socket) => {
  socket.data.roomId = null;

  socket.on("mp:create", (data = {}) => {
    leaveRoom(socket);
    const roomId = createRoomId();
    const room = {
      id: roomId,
      hostId: socket.id,
      players: [],
      started: false,
      difficulty: data.difficulty || "normal",
      createdAt: Date.now()
    };
    room.players.push({ id: socket.id, name: String(data.name || "호스트").slice(0, 12) });
    ROOMS.set(roomId, room);
    socket.data.roomId = roomId;
    socket.join(roomId);
    socket.emit("mp:lobby", lobbyState(room));
  });

  socket.on("mp:join", (data = {}) => {
    const code = String(data.code || "").toUpperCase();
    const room = ROOMS.get(code);
    if (!room) return socket.emit("mp:error", { message: "방을 찾을 수 없다 (코드 확인)" });
    if (room.started) return socket.emit("mp:error", { message: "이미 게임이 시작된 방이다" });
    if (room.players.length >= MAX_PLAYERS) return socket.emit("mp:error", { message: "방이 가득 찼다 (최대 4인)" });
    leaveRoom(socket);
    room.players.push({ id: socket.id, name: String(data.name || `생존자 ${room.players.length + 1}`).slice(0, 12) });
    socket.data.roomId = code;
    socket.join(code);
    broadcastLobby(room);
    socket.emit("mp:joined", { code });
  });

  socket.on("mp:leave", () => leaveRoom(socket, "leave"));

  socket.on("mp:start", (data = {}) => {
    const room = ROOMS.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id || room.started) return;
    if (data.difficulty) room.difficulty = String(data.difficulty);
    room.started = true;
    io.to(room.id).emit("mp:started", {
      difficulty: room.difficulty,
      hostId: room.hostId,
      players: lobbyState(room).players
    });
    broadcastLobby(room);
  });

  socket.on("mp:end", () => {
    const room = ROOMS.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id) return;
    room.started = false;
    broadcastLobby(room);
  });

  socket.on("mp:pose", (data = {}) => {
    const room = ROOMS.get(socket.data.roomId);
    if (!room || socket.id === room.hostId) return;
    io.to(room.hostId).emit("mp:pose", { from: socket.id, pose: data.pose, evs: data.evs });
  });

  socket.on("mp:act", (act) => {
    const room = ROOMS.get(socket.data.roomId);
    if (!room || socket.id === room.hostId) return;
    io.to(room.hostId).emit("mp:act", { from: socket.id, act });
  });

  socket.on("mp:snap", (data = {}) => {
    const room = ROOMS.get(socket.data.roomId);
    if (!room || room.hostId !== socket.id) return;
    socket.to(room.id).emit("mp:snap", data.snap);
    for (const ev of data.evs || []) {
      if (ev && ev.to) io.to(ev.to).emit("mp:event", ev);
      else socket.to(room.id).emit("mp:event", ev);
    }
  });

  socket.on("mp:request", () => {
    const room = ROOMS.get(socket.data.roomId);
    if (room) socket.emit("mp:lobby", lobbyState(room));
  });

  socket.on("disconnect", () => leaveRoom(socket, "disconnect"));
});

server.listen(PORT, () => {
  console.log(`SILENCE server running at http://localhost:${PORT}`);
});
