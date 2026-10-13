import * as THREE from "three";

/* =========================================================
   협동 멀티플레이 클라이언트
   - ?srv= 로 서버를 지정하면 활성화 (없으면 싱글 전용)
   - 방 코드 로비(최대 4인) + host authority 릴레이
   - 이 모듈은 전송/UI/원격 아바타만 담당한다.
     월드 상태 적용은 main.js 콜백(getSnapshot/onAct/onEvent/onSnapshot)이 수행한다.
========================================================= */

const $ = (s) => document.querySelector(s);
const AV_COLORS = [0x5fd0a0, 0x7fa8ff, 0xffb45c, 0xd98cff];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("socket.io 스크립트를 불러오지 못했다"));
    document.head.appendChild(s);
  });
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function makeNameSprite(name, colorHex) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 64);
  g.font = "bold 30px Consolas, monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 7;
  g.strokeStyle = "rgba(0,0,0,0.9)";
  g.strokeText(name, 128, 32);
  g.fillStyle = "#" + colorHex.toString(16).padStart(6, "0");
  g.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.9, 0.48, 1);
  return sp;
}

export const net = {
  /* --- 연결 상태 --- */
  active: false,        // ?srv= 지정 여부
  srv: null,
  connected: false,
  myId: null,
  roomId: null,
  hostId: null,
  isHost: false,
  state: "idle",        // idle | lobby | playing
  players: [],          // 로비 명단 [{id,name,host}]
  difficulty: "normal",
  ending: false,        // 게임 종료(탈출) 진행 중 — 라비 복귀 알림 억제

  /* --- 전송 --- */
  socket: null,
  queue: [],
  pendingNoise: [],
  pendingEvents: [],
  pendingSnap: null,
  poseAcc: 0,
  snapAcc: 0,

  /* --- 원격 참가자 --- */
  remotes: new Map(),   // id -> {pose, group, body, lamp, sprite, invulnUntil, synth}

  /* --- main.js 가 주입하는 콜백/참조 --- */
  scene: null,
  world: null,
  localHideIdx: -1,
  hooks: {
    toast: null,        // (text, ms) => void
    panel: null,        // (open, lobbyMode) => void  — 시작화면/패널 전환
    noise: null,        // (evs) => void  — host: 노이즈 이벤트 주입
    act: null,          // (from, act) => void  — host: 클라이언트 요청 처리
    event: null,        // (ev) => void
    snapshot: null,     // (snap) => void
    getPose: null,      // () => pose  (client)
    getSnapshot: null,  // () => snap  (host)
    started: null,      // ({difficulty}) => void
    aborted: null       // () => void  — 진행 중 방이 사라졌을 때
  },

  /* ================= 초기화 ================= */
  setup(opts = {}) {
    if (opts.scene) this.scene = opts.scene;
    if (opts.world) this.world = opts.world;
    if (opts.hooks) Object.assign(this.hooks, opts.hooks);
  },

  init() {
    this._wireUI();
    const q = new URLSearchParams(location.search);
    if (!q.has("srv")) {
      this.active = false;
      const note = $("#mp-note");
      if (note) note.textContent = "협동 멀티플레이 — 주소 뒤에 ?srv=서버주소 를 붙이면 켜진다";
      const btn = $("#btn-mp");
      if (btn) btn.disabled = true;
      return false;
    }
    this.active = true;
    this.srv = (q.get("srv") || "").trim() || location.origin;
    this._status("서버에 연결 중…");
    loadScript(this.srv.replace(/\/$/, "") + "/socket.io/socket.io.js")
      .then(() => this._connect())
      .catch((e) => this._status(e.message));
    return true;
  },

  _connect() {
    const io = window.io;
    if (!io) return this._status("socket.io 클라이언트 없음");
    const s = io(this.srv.replace(/\/$/, ""), { transports: ["websocket", "polling"] });
    this.socket = s;

    s.on("connect", () => {
      this.myId = s.id;
      this.connected = true;
      this._status("연결됨 — 방을 만들거나 참가하라");
      this._refreshUI();
    });
    s.on("disconnect", () => {
      this.connected = false;
      this.state = "idle";
      this.isHost = false;
      this.roomId = null;
      this._clearRemotes();
      this._status("연결이 끊겼다 — 새로고침해라");
      this._refreshUI();
    });

    s.on("mp:lobby", (l) => this._onLobby(l));
    s.on("mp:joined", (d) => { this.roomId = d.code; });
    s.on("mp:error", (e) => this._status(e.message || "오류"));
    s.on("mp:started", (d) => {
      this.hostId = d.hostId;
      this.isHost = this.myId === d.hostId;
      this.difficulty = d.difficulty || "normal";
      this.state = "playing";
      this.ending = false;
      this.pendingSnap = null;
      this.pendingEvents.length = 0;
      if (this.hooks.started) this.hooks.started({ difficulty: this.difficulty });
      this._refreshUI();
    });
    s.on("mp:pose", (m) => {
      if (!m || !m.from || m.from === this.myId) return;
      const r = this._ensureRemote(m.from);
      if (!r) return;
      r.pose = m.pose;
      if (Array.isArray(m.evs) && m.evs.length && this.hooks.noise) this.hooks.noise(m.evs);
    });
    s.on("mp:act", (m) => {
      if (m && m.act) this.queue.push({ t: "act", from: m.from, act: m.act });
    });
    s.on("mp:event", (ev) => { if (ev) this.queue.push({ t: "event", ev }); });
    s.on("mp:snap", (snap) => { if (snap) this.queue.push({ t: "snap", snap }); });
  },

  _onLobby(l) {
    this.roomId = l.code;
    this.hostId = l.hostId;
    this.players = l.players || [];
    this.difficulty = l.difficulty || this.difficulty;
    this.isHost = this.myId === l.hostId;

    if (this.state === "playing" && !l.started) {
      // 방이 닫혔거나 재시작 대기로 돌아간 상태
      this.state = "lobby";
      if (!this.ending) {
        this._clearRemotes();
        if (this.hooks.aborted) this.hooks.aborted();
      }
    } else if (this.state === "idle" && l.started) {
      this.state = "playing";
    }
    this._refreshUI();
  },

  /* ================= 방 조작 ================= */
  createRoom(name) {
    if (!this._ready()) return;
    this.socket.emit("mp:create", { name: name || this._nick(), difficulty: this.difficulty });
    this.state = "lobby";
    this._clearRemotes();
    this._refreshUI();
  },

  joinRoom(code, name) {
    if (!this._ready()) return;
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (code.length !== 4) return this._status("방 코드는 4자다");
    this.socket.emit("mp:join", { code, name: name || this._nick() });
    this.state = "lobby";
    this._clearRemotes();
    this._refreshUI();
  },

  leaveRoom() {
    if (this.socket && this.connected) this.socket.emit("mp:leave");
    this.state = "idle";
    this.isHost = false;
    this.ending = false;
    this.roomId = null;
    this.hostId = null;
    this.players = [];
    this._clearRemotes();
    this._refreshUI();
  },

  startRoom(difficulty) {
    if (!this._ready() || !this.isHost || this.state !== "lobby") return;
    if (difficulty) this.difficulty = difficulty;
    this.socket.emit("mp:start", { difficulty: this.difficulty });
  },

  endRoom() {
    if (this.socket && this.connected && this.isHost) this.socket.emit("mp:end");
  },

  pushEvent(ev) {
    if (!this.active || !this.isHost || !this.connected) return;
    this.pendingEvents.push(ev);
  },

  sendAct(act) {
    if (!this.active || this.isHost || !this.connected || this.state !== "playing") return;
    this.socket.emit("mp:act", act);
  },

  queueNoise(evs) {
    if (!this.active || !evs || !evs.length) return;
    for (const e of evs) this.pendingNoise.push(e);
    if (this.pendingNoise.length > 64) this.pendingNoise.splice(0, this.pendingNoise.length - 64);
  },

  _ready() { return this.active && this.connected && !!this.socket; },
  _nick() {
    let n = localStorage.getItem("silence.nick");
    if (!n) { n = "생존자 " + Math.floor(Math.random() * 900 + 100); localStorage.setItem("silence.nick", n); }
    return n;
  },

  /* ================= 프레임 틱 ================= */
  tick(dt) {
    if (!this.active) return;

    // 수신 큐 처리
    if (this.queue.length) {
      const q = this.queue;
      this.queue = [];
      for (const m of q) {
        if (m.t === "act" && this.isHost && this.hooks.act) this.hooks.act(m.from, m.act);
        else if (m.t === "event" && this.hooks.event) this.hooks.event(m.ev);
        else if (m.t === "snap") {
          if (this.state !== "playing") this.pendingSnap = m.snap;
          else if (this.hooks.snapshot) this.hooks.snapshot(m.snap);
        }
      }
    }

    if (this.state === "playing" && this.connected) {
      if (this.isHost) {
        this.snapAcc += dt;
        if (this.snapAcc >= 0.1) {
          this.snapAcc = 0;
          const snap = this.hooks.getSnapshot ? this.hooks.getSnapshot() : null;
          if (snap) {
            this.socket.emit("mp:snap", { snap, evs: this.pendingEvents.splice(0) });
          }
        }
      } else {
        this.poseAcc += dt;
        if (this.poseAcc >= 0.08) {
          this.poseAcc = 0;
          const pose = this.hooks.getPose ? this.hooks.getPose() : null;
          if (pose) {
            const evs = this.pendingNoise.splice(0);
            this.socket.emit("mp:pose", { pose, evs });
          }
        }
      }
    }

    this._updateAvatars(dt);
    this._syncHideOccupancy();
  },

  /* ================= 원격 아바타 ================= */
  _ensureRemote(id) {
    if (id === this.myId) return null;
    let r = this.remotes.get(id);
    if (r) return r;
    const idx = this.remotes.size % AV_COLORS.length;
    const color = AV_COLORS[idx];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, emissive: color, emissiveIntensity: 0.32 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.0, 4, 10), mat);
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9c9b6, roughness: 0.8, emissive: 0x2a2018, emissiveIntensity: 0.6 }));
    head.position.y = 1.78;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
    lamp.position.set(0.27, 1.2, -0.16);
    lamp.visible = false;
    const name = this.players.find((p) => p.id === id);
    const sprite = makeNameSprite((name && name.name) || "생존자", color);
    sprite.position.y = 2.3;
    g.add(body, head, lamp, sprite);
    g.visible = false;
    if (this.scene) this.scene.add(g);
    r = { pose: null, group: g, body, lamp, sprite, invulnUntil: 0, synth: null, name };
    this.remotes.set(id, r);
    return r;
  },

  _clearRemotes() {
    for (const [, r] of this.remotes) {
      if (r.group) {
        if (this.scene) this.scene.remove(r.group);
        r.group.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
      }
    }
    this.remotes.clear();
    this.pendingSnap = null;
    this.queue.length = 0;
  },

  _updateAvatars(dt) {
    if (!this.remotes.size) return;
    const k = Math.min(1, dt * 14);
    for (const [id, r] of this.remotes) {
      const p = r.pose;
      if (!p || id === this.myId) { if (r.group) r.group.visible = false; continue; }
      r.group.position.x += (p.x - r.group.position.x) * k;
      r.group.position.z += (p.z - r.group.position.z) * k;
      const gy = this.world ? this.world.heightAt(r.group.position.x, r.group.position.z) : 0;
      r.group.position.y += (gy - r.group.position.y) * Math.min(1, dt * 10);
      r.group.rotation.y = angleLerp(r.group.rotation.y, p.yaw || 0, k);
      r.body.scale.y = p.crouch ? 0.66 : 1;
      r.body.position.y = p.crouch ? 0.72 : 1.0;
      r.lamp.visible = !!p.flash;
      r.group.visible = !p.hidden && !p.dead;
    }
  },

  _syncHideOccupancy() {
    if (!this.world || !this.world.hidingSpots) return;
    const spots = this.world.hidingSpots;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      let used = false;
      for (const [, r] of this.remotes) {
        const p = r.pose;
        if (p && !p.dead && p.hideIdx === i) { used = true; break; }
      }
      if (i === this.localHideIdx) used = true;
      if (s.occupied !== used) s.occupied = used;
    }
  },

  /* ================= 스냅샷 파서 헬퍼 ================= */
  // main.js 가 사용할 수 있도록 원격 pose 조회
  remotePose(id) {
    const r = this.remotes.get(id);
    return r ? r.pose : null;
  },

  remoteIds() {
    const out = [];
    for (const [id, r] of this.remotes) if (id !== this.myId && r.pose) out.push(id);
    return out;
  },

  // host: 원격 참가자를 몬스터 AI용 '가상 플레이어'로 뷰까지 만든다
  synthFor(id) {
    const r = this.remotes.get(id);
    if (!r) return null;
    if (!r.synth) {
      r.synth = {
        x: 0, z: 0, yaw: 0, pitch: 0, hidden: false, hideSpot: null, inSafeZone: false, dead: false,
        _netId: id,
        exitHide: () => {
          const rr = this.remotes.get(id);
          if (!rr || !rr.synth) return;
          rr.synth.hidden = false;
          if (rr.pose) rr.pose.hidden = false;
          const sp = rr.synth.hideSpot;
          if (sp) sp.occupied = false;
          this.pushEvent({ k: "pull", to: id });
        }
      };
    }
    const p = r.pose;
    const s = r.synth;
    s.x = p.x; s.z = p.z; s.yaw = p.yaw || 0; s.pitch = p.pitch || 0;
    s.hidden = !!p.hidden;
    s.dead = !!p.dead;
    s.inSafeZone = !!p.safe;
    s.hideSpot = (p.hideIdx >= 0 && this.world && this.world.hidingSpots[p.hideIdx])
      ? this.world.hidingSpots[p.hideIdx] : null;
    return s;
  },

  applyPose(from, pose) {
    const r = this._ensureRemote(from);
    if (r) r.pose = pose;
  },

  dropRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    if (r.group) {
      if (this.scene) this.scene.remove(r.group);
      r.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    this.remotes.delete(id);
  },

  /* ================= 로비 UI ================= */
  _wireUI() {
    const panel = $("#mp");
    const open = () => {
      if (this.hooks.panel) this.hooks.panel(true, this.state === "lobby");
      else panel?.classList.remove("hidden");
      this._refreshUI();
    };
    const close = () => {
      if (this.hooks.panel) this.hooks.panel(false);
      else panel?.classList.add("hidden");
    };
    this._closePanel = close;

    const btnMp = $("#btn-mp");
    if (btnMp) btnMp.addEventListener("click", open);

    $("#mp-back")?.addEventListener("click", () => {
      this.leaveRoom();
      close();
    });

    $("#mp-create")?.addEventListener("click", () => {
      this.createRoom($("#mp-name")?.value.trim());
    });
    $("#mp-join")?.addEventListener("click", () => {
      this.joinRoom($("#mp-code")?.value, $("#mp-name")?.value.trim());
    });
    $("#mp-code")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.joinRoom($("#mp-code")?.value, $("#mp-name")?.value.trim());
    });
    $("#mp-start")?.addEventListener("click", () => {
      const d = $("#set-difficulty")?.value || "normal";
      this.startRoom(d);
    });

    const nameIn = $("#mp-name");
    if (nameIn && !nameIn.value) nameIn.value = this._nick();
  },

  openPanel() {
    if (this.hooks.panel) this.hooks.panel(true, this.state === "lobby");
    this._refreshUI();
  },

  _status(msg) {
    const el = $("#mp-status") || $("#mp-status2");
    if (el) el.textContent = msg;
    const el2 = $("#mp-status2");
    if (el2 && el2 !== el) el2.textContent = msg;
    if (this.hooks.toast && msg) this.hooks.toast(msg, 2600);
  },

  _refreshUI() {
    const menu = $("#mp-menu");
    const lobby = $("#mp-lobby");
    const codeEl = $("#mp-roomcode");
    const startBtn = $("#mp-start");
    const roster = $("#mp-roster");
    const inLobby = this.state === "lobby";
    if (menu) menu.classList.toggle("hidden", inLobby);
    if (lobby) lobby.classList.toggle("hidden", !inLobby);
    if (codeEl && inLobby) codeEl.textContent = this.roomId || "----";
    if (startBtn) startBtn.classList.toggle("hidden", !this.isHost);
    if (startBtn) startBtn.disabled = !inLobby;
    if (roster) {
      roster.innerHTML = "";
      for (const p of this.players) {
        const li = document.createElement("li");
        li.className = p.host ? "mp-host" : "";
        li.textContent = p.name + (p.host ? "  ·  호스트" : "") + (p.id === this.myId ? "  (나)" : "");
        roster.appendChild(li);
      }
      if (!this.players.length) {
        const li = document.createElement("li");
        li.className = "mp-empty";
        li.textContent = "아직 아무도 없다";
        roster.appendChild(li);
      }
    }
    const st = $("#mp-status2");
    if (st && inLobby) st.textContent = this.players.length + "명 참가 중 · 최대 4명";
  }
};
