import * as THREE from "three";
import { CONFIG, QUALITY, DIFFICULTY } from "./config.js";
import { clamp, damp, formatTime, rand } from "./util.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { NoiseSystem } from "./noise.js";
import { AudioEngine } from "./audio.js";
import { Monster, STATE } from "./monster.js";
import { UI } from "./ui.js";
import { getItemDef } from "./inventory.js";
import { net } from "./net.js";

/* ================= 설정 ================= */
const settings = Object.assign(
  { sensitivity: 1, invertY: false, volume: 0.8, micSens: 1, quality: "medium", difficulty: "normal" },
  JSON.parse(localStorage.getItem("silence.settings") || "{}")
);
if (!DIFFICULTY[settings.difficulty]) settings.difficulty = "normal";
function saveSettings() {
  localStorage.setItem("silence.settings", JSON.stringify(settings));
}

/* ================= 렌더러 / 씬 ================= */
const app = document.getElementById("app");
const CAPTURE = new URLSearchParams(location.search).has("capture");
const renderer = new THREE.WebGLRenderer({
  antialias: settings.quality === "high",
  powerPreference: "high-performance",
  preserveDrawingBuffer: CAPTURE
});
const MAX_PIXEL_RATIO = 1.5;
const applyPixelRatio = (pr) => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pr, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
};
applyPixelRatio(QUALITY[settings.quality].pixelRatio);
renderer.shadowMap.enabled = QUALITY[settings.quality].shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.5;
app.appendChild(renderer.domElement);

// 그래픽 컨텍스트 손실(검은 화면/크래시) 대응
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  showFatal("그래픽 컨텍스트가 손실되었습니다. 페이지를 새로고침(Ctrl+F5)하면 복구됩니다.");
}, false);
renderer.domElement.addEventListener("webglcontextrestored", () => {
  applyPixelRatio(1.0);
  if (world) world.setShadows(false);
  renderer.shadowMap.enabled = false;
}, false);

// 검은 화면 대신 오류를 보여준다
function showFatal(msg) {
  let el = document.getElementById("fatal");
  if (!el) {
    el = document.createElement("div");
    el.id = "fatal";
    el.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0a0f18;color:#ffc0c0;" +
      "font:13px/1.6 'Consolas',monospace;padding:28px;white-space:pre-wrap;overflow:auto";
    document.body.appendChild(el);
  }
  el.textContent = "게임을 계속할 수 없습니다.\n\n" + msg + "\n\n페이지를 새로고침(Ctrl+F5)해 주세요.";
}
window.addEventListener("error", (e) => showFatal((e.message || "오류") + "\n" + (e.filename || "") + ":" + (e.lineno || "")));
window.addEventListener("unhandledrejection", (e) => showFatal("" + ((e.reason && e.reason.message) || e.reason || "알 수 없는 오류")));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 500);
scene.add(camera); // 손전등(SpotLight)이 카메라의 자식이므로 씬에 포함되어야 조명이 적용됨

/* ================= 시스템 ================= */
const world = new World(scene, settings.quality);
const audio = new AudioEngine();
const noise = new NoiseSystem(audio);
const player = new Player(camera, world, noise, audio, settings);
const monster = new Monster(scene, world, audio, noise);
monster.onCatch = () => onMonsterCatch(monster);
// 악몽 난이도 전용: 두 번째 괴물
let monster2 = null;
let monster2Active = false;
const ui = new UI();
ui.attach(world, player, monster);

noise.setMicSensitivity(settings.micSens);

/* ================= 게임 상태 ================= */
const game = {
  phase: "menu",       // menu | playing | paused | scaring | dead | win
  elapsed: 0,
  encounters: 0,
  scareTimer: 0,
  ambientTimer: rand(CONFIG.assist.ambientScareMin, CONFIG.assist.ambientScareMax),
  exitPowered: false,
  collected: 0,
  interactHold: 0,
  interactTarget: null,
  batteryWarned: false,
  lastMonsterState: STATE.ROAM,
  alertTimer: 0,
  alertText: null,
  lastSeenHide: null,
  eConsumed: false,  // 한 번의 E 누름 = 한 동작만 (재누를 때까지 대기)
  heldSlot: -1,      // 손에 들고 있는 소모품 슬롯 번호 (-1 = 맨손)
  notesRead: {},     // 읽은 메모 id → true
  keypad: null,      // 열려 있는 비밀번호 키패드 { door, buf }
  batonReadyAt: 0    // 충격기 재사용 가능 시각 (performance.now 기준 ms)
};
const FUSE_TOTAL = world.fuses.length;

/* ================= 협동 멀티플레이 =================
   ?srv= 를 지정하면 켜진다. host = 월드 시뮬레이션 소유자,
   클라이언트는 자기 이동만 로컬로 계산하고 나머지는 스냅샷/이벤트로 받는다. */
const mpClient = () => net.active && !net.isHost && net.state === "playing";
const mpHost = () => net.active && net.isHost && net.state === "playing";

function mpAct(act) { net.sendAct(act); }
function mpEvent(ev) { net.pushEvent(ev); }   // host 전용 (내부 가드)

function trapKey(x, z) { return x.toFixed(2) + "," + z.toFixed(2); }
const trapGone = new Set();       // 내가 밟아서 발동시켰지만 호스트 확인 대기 중인 덫
let trapPlaceLock = false;        // 덫 배치 중복 전송 방지

function trapExists(x, z) {
  const k = trapKey(x, z);
  return world.traps.some((t) => trapKey(t.x, t.z) === k);
}
function removeTrapAt(x, z) {
  const k = trapKey(x, z);
  for (let i = world.traps.length - 1; i >= 0; i--) {
    if (trapKey(world.traps[i].x, world.traps[i].z) === k) { world.removeTrap(i); break; }
  }
  trapGone.delete(k);
}
function nearestMonsterTo(px, pz) {
  let best = null, bd = Infinity;
  for (const m of activeMonsters()) {
    const d = Math.hypot(m.x - px, m.z - pz);
    if (d < bd) { bd = d; best = m; }
  }
  return best || monster;
}

/* --- 공유 월드 상태 적용 (idempotent) --- */
function applyFuse(f) {
  if (!f || f.collected) return false;
  f.collected = true;
  f.mesh.visible = false;
  f.glow.visible = false;
  game.collected++;
  audio.blip(1040, 0.16);
  if (game.collected >= FUSE_TOTAL) {
    game.exitPowered = true;
    world.setExitPowered(true);
    ui.toast("전원 복구 — 격리 철문의 잠금이 풀렸다", 3600);
    ui.setObjective("격리 철문으로 탈출하라", game.collected, FUSE_TOTAL, null);
  } else {
    ui.toast(`차단기 ${game.collected}/${FUSE_TOTAL} 재기동`, 1600);
  }
  return true;
}

function applyDoorOpen(door) {
  if (!door || door.open) return false;
  world.openLockedDoor(door);
  monster.rebuildGrid();
  if (monster2) monster2.rebuildGrid();
  ui.setInventory(player.inventory);
  ui.toast(`${door.label} 잠금 해제`, 2000);
  audio.blip(660, 0.2);
  return true;
}

function spawnFx(type, x, z) {
  if (type === "decoy") spawnDecoy(x, z);
  else spawnSmoke(x, z);
}

// 연막/소음장치 — 협동에서는 내 눈엔 즉시, 다른 쪽엔 이벤트로
function shareFx(type, x, z) {
  if (!net.active) return;
  const ev = { k: "fx", type, x, z, from: net.myId };
  if (mpClient()) mpAct(ev);
  else mpEvent(ev);
}

/* --- 호스트: 클라이언트 요청 처리 --- */
function handleRemoteAct(from, act) {
  if (!act || !mpHost()) return;
  switch (act.k) {
    case "fuse": {
      const f = world.fuses[act.i];
      if (f && applyFuse(f)) mpEvent({ k: "fuse", i: act.i });
      break;
    }
    case "drawer": {
      const d = world.drawers[act.i];
      if (!d || d.busy) break;
      const open = !!act.open;
      if (d.opened === open) break;
      world.setDrawer(d, open);
      audio.blip(open ? 520 : 380, 0.1);
      mpEvent({ k: "drawer", i: act.i, open });
      break;
    }
    case "take": {
      const d = world.drawers[act.i];
      if (!d || !d.opened || d.looted || !d.lootId) break;
      if (!world.lootDrawer(d)) break;
      mpEvent({ k: "loot", to: from, i: act.i, id: d.lootId, name: d.lootName });
      break;
    }
    case "door": {
      const door = world.lockedDoors[act.i];
      if (door && applyDoorOpen(door)) mpEvent({ k: "door", i: act.i });
      break;
    }
    case "gate": {
      const p = net.remotePose(from);
      if (!p || !game.exitPowered) break;
      if (Math.hypot(world.exit.x - p.x, world.exit.z - p.z) > CONFIG.interaction.gateRange) break;
      winGame();
      break;
    }
    case "trap": {
      if (world.traps.length >= CONFIG.trap.maxPlaced) break;
      if (trapExists(act.x, act.z)) break;
      world.addTrap(act.x, act.z);
      mpEvent({ k: "trap", x: act.x, z: act.z });
      break;
    }
    case "trapgo": {
      if (!removeTrapAt(act.x, act.z)) break;
      mpEvent({ k: "trapgo", x: act.x, z: act.z });
      break;
    }
    case "stun": {
      let hit = null;
      for (const m of activeMonsters()) {
        if (m.stunT > 0) continue;
        const d = Math.hypot(m.x - act.x, m.z - act.z);
        if (d <= CONFIG.stun.range && !world.lineBlocked(act.x, act.z, m.x, m.z)) { hit = m; break; }
      }
      if (hit) hit.stun(CONFIG.stun.duration);
      mpEvent({ k: "stunres", to: from, hit: !!hit });
      break;
    }
    case "fx": {
      spawnFx(act.type, act.x, act.z);
      mpEvent({ k: "fx", type: act.type, x: act.x, z: act.z, from: act.from || from });
      break;
    }
  }
}

/* --- 클라이언트: 호스트가 보내온 이벤트 --- */
function handleNetEvent(ev) {
  if (!ev) return;
  switch (ev.k) {
    case "fuse": { const f = world.fuses[ev.i]; if (f) applyFuse(f); break; }
    case "door": { const d = world.lockedDoors[ev.i]; if (d) applyDoorOpen(d); break; }
    case "drawer": {
      const d = world.drawers[ev.i];
      if (d) { audio.blip(ev.open ? 520 : 380, 0.1); world.setDrawer(d, ev.open); }
      break;
    }
    case "loot": {
      if (ev.to !== net.myId) break;
      const d = world.drawers[ev.i];
      if (d) d.looted = true;
      const def = getItemDef(ev.id);
      const res = player.inventory.add(ev.id, ev.name, 1);
      ui.setInventory(player.inventory, game.heldSlot >= 0 ? game.heldSlot : -1);
      if (res.ok) {
        audio.blip(ev.id.startsWith("key_") ? 1320 : 980, 0.16);
        ui.showItemDetail(def);
        if (ev.id === "key_shed") ui.toast("획득: 창고 열쇠 — 잠긴 창고 문에 사용한다", 3000);
        else if (ev.id === "key_store") ui.toast("획득: 저장고 열쇠 — 잠긴 저장고 문에 사용한다", 3000);
        else ui.toast(`획득: ${def ? def.name : ev.name}`, 1800);
      } else ui.showInvEmpty();
      break;
    }
    case "trap": if (!trapExists(ev.x, ev.z)) world.addTrap(ev.x, ev.z); break;
    case "trapgo": removeTrapAt(ev.x, ev.z); break;
    case "stunres": {
      if (ev.to !== net.myId) break;
      if (ev.hit) {
        const m = nearestMonsterTo(player.x, player.z);
        if (m) m.stun(CONFIG.stun.duration);
        player.addCameraShake(0.18);
        audio.blip(1400, 0.12);
        ui.toast("충격 적중 — 괴물이 3초간 경직", 2400);
      } else {
        ui.toast("방전 — 범위(3m) 안에 표적이 없다", 1800);
      }
      break;
    }
    case "fx": if (ev.from !== net.myId) spawnFx(ev.type, ev.x, ev.z); break;
    case "caught": if (ev.to === net.myId) localCaught(); break;
    case "pull": if (ev.to === net.myId) localPull(); break;
    case "win": winGame(); break;
  }
}

/* --- 클라이언트가 받은 스냅샷 적용 --- */
function applySnapshot(s) {
  if (!s) return;
  // 원격 플레이어
  const seen = new Set();
  for (const p of s.players || []) {
    if (!p || !p.id || p.id === net.myId) continue;
    seen.add(p.id);
    net.applyPose(p.id, p);
  }
  for (const id of Array.from(net.remotes.keys())) {
    if (id !== net.myId && !seen.has(id)) net.dropRemote(id);
  }
  // 괴물 (고스트)
  const mons = s.monsters || [];
  syncGhost(monster, mons[0]);
  if (monster2Active && monster2) syncGhost(monster2, mons[1]);
  // 퓨즈
  const fs = s.fuses || [];
  for (let i = 0; i < world.fuses.length; i++) if (fs[i]) applyFuse(world.fuses[i]);
  // 잠긴 문
  const ds = s.doors || [];
  for (let i = 0; i < world.lockedDoors.length; i++) if (ds[i]) applyDoorOpen(world.lockedDoors[i]);
  // 서랍
  const dr = s.drawers || [];
  for (let i = 0; i < world.drawers.length; i++) {
    const d = world.drawers[i];
    const v = dr[i] | 0;
    const open = !!(v & 1), looted = !!(v & 2);
    if (d.opened !== open) world.setDrawer(d, open);
    if (looted) d.looted = true;
  }
  // 덫
  const want = new Set((s.traps || []).map((t) => trapKey(t[0], t[1])));
  for (let i = world.traps.length - 1; i >= 0; i--) {
    const k = trapKey(world.traps[i].x, world.traps[i].z);
    if (!want.has(k)) { trapGone.delete(k); world.removeTrap(i); }
  }
  for (const t of s.traps || []) if (!trapExists(t[0], t[1])) world.addTrap(t[0], t[1]);
  // 출구 전원
  const powered = !!s.exit;
  if (powered !== game.exitPowered) {
    game.exitPowered = powered;
    world.setExitPowered(powered);
    if (powered) ui.toast("전원 복구 — 격리 철문의 잠금이 풀렸다", 3600);
  }
}

function syncGhost(m, data) {
  if (!m) return;
  m.ghost = true;
  if (!data) { m.group.visible = false; return; }
  m.group.visible = true;
  m.setNetTarget(data.x, data.z, data.yaw);
  const wasStunned = m.stunT > 0;
  m.stunT = data.stunT || 0;
  m.slowT = data.slowT || 0;
  if (!wasStunned && m.stunT > 0) { audio.blip(1200, 0.14); player.addCameraShake(0.1); }
  m.setNetState(data.st);
}

/* --- 호스트: 몬스터 AI 대상(자기 자신 또는 가장 가까운 원격 플레이어) --- */
function hostTargetFor(m) {
  let bestId = null, bestD = Infinity;
  if (game.phase === "playing") bestD = Math.hypot(m.x - player.x, m.z - player.z);
  for (const id of net.remotes.keys()) {
    const p = net.remotePose(id);
    if (!p || p.dead) continue;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (d < bestD) { bestD = d; bestId = id; }
  }
  if (bestId === null) {
    return game.phase === "playing" ? { p: player, id: null } : { p: null, id: null };
  }
  const synth = net.synthFor(bestId);
  return synth ? { p: synth, id: bestId } : { p: player, id: null };
}

function handleRemoteCaught(id, m) {
  const r = net.remotes.get(id);
  const p = net.remotePose(id);
  if (!p) { m._caught = false; return; }
  const now = performance.now();
  if (p.hidden || p.safe || p.dead || (r && r.invulnUntil > now)) { m._caught = false; return; }
  if (r) r.invulnUntil = now + 3000;
  m.forceRecover();
  noise.addImpulse(0.35, m.x, m.z, "hurt");
  mpEvent({ k: "caught", to: id });
}

function onMonsterCatch(m) {
  const id = m._catchId || null;
  if (id) { handleRemoteCaught(id, m); return; }
  onCaught(m);
}

function localCaught() {
  if (game.phase !== "playing") return;
  if (player.invuln > 0) return;
  onCaught(nearestMonsterTo(player.x, player.z));
}

function localPull() {
  if (game.phase !== "playing" || !player.hidden) return;
  player.exitHide();
  ui.hideInteract();
  audio.attackScreech();
  ui.toast("무언가가 너를 은신처에서 끌어냈다!", 2800);
}

/* --- 포즈 / 스냅샷 빌드 --- */
function buildPose() {
  return {
    x: +player.x.toFixed(3), z: +player.z.toFixed(3),
    yaw: player.yaw, pitch: player.pitch,
    hidden: !!player.hidden,
    hideIdx: player.hideSpot ? world.hidingSpots.indexOf(player.hideSpot) : -1,
    hp: player.hp,
    safe: !!player.inSafeZone,
    flash: !!player.flashOn,
    crouch: !!player.crouching,
    sprint: !!player.sprinting,
    dead: game.phase === "scaring" || game.phase === "dead" || game.phase === "win" || game.phase === "menu"
  };
}

function buildSnapshot() {
  const players = [];
  // 호스트 자신의 포즈를 넣는다 — 그래야 클라이언트가 호스트 아바타를 볼 수 있다.
  // (applySnapshot은 자기 자신의 id는 건너뛰므로 호스트에게는 되돌아오지 않는다)
  players.push(Object.assign({ id: net.myId }, buildPose()));
  for (const [id, r] of net.remotes) {
    if (id === net.myId || !r.pose) continue;
    players.push(Object.assign({ id }, r.pose));
  }
  const monsters = [];
  for (const m of activeMonsters()) {
    monsters.push({ x: +m.x.toFixed(3), z: +m.z.toFixed(3), yaw: m.yaw, st: m.state, stunT: +m.stunT.toFixed(2), slowT: +m.slowT.toFixed(2) });
  }
  return {
    t: game.elapsed,
    players,
    monsters,
    fuses: world.fuses.map((f) => (f.collected ? 1 : 0)),
    doors: world.lockedDoors.map((d) => (d.open ? 1 : 0)),
    drawers: world.drawers.map((d) => ((d.opened ? 1 : 0) | (d.looted ? 2 : 0))),
    traps: world.traps.map((t) => [+t.x.toFixed(2), +t.z.toFixed(2)]),
    exit: game.exitPowered ? 1 : 0
  };
}

net.setup({
  scene, world,
  hooks: {
    toast: (t, ms) => ui.toast(t, ms),
    panel: (open) => {
      const panel = document.getElementById("mp");
      if (!panel) return;
      if (open) { ui.hide(ui.start); panel.classList.remove("hidden"); }
      else { panel.classList.add("hidden"); if (game.phase === "menu") ui.show(ui.start); }
    },
    noise: (evs) => {
      for (const e of evs) if (e) noise._pushEvent(e.intensity, e.x, e.z, e.source);
    },
    act: (from, act) => handleRemoteAct(from, act),
    event: (ev) => handleNetEvent(ev),
    snapshot: (s) => applySnapshot(s),
    getPose: () => buildPose(),
    getSnapshot: () => buildSnapshot(),
    started: (d) => {
      if (d && d.difficulty) settings.difficulty = d.difficulty;
      net.ending = false;
      net.closePanel();
      // 원격 시작(제스처 없음) 대비: 오디오를 여기서도 깨운다
      try { audio.init(); } catch (e) {}
      try { audio.resume(); } catch (e) {}
      startGame();
    },
    aborted: () => {
      const wasPlaying = game.phase === "playing" || game.phase === "paused" || game.phase === "scaring";
      if (wasPlaying) {
        game.phase = "menu";
        unlockPointer();
        clearEffects();
        ui.hideJumpscare();
        ui.hide(ui.pause);
        ui.hide(ui.death);
        ui.hide(ui.win);
        ui.setHudVisible(false);
        ui.show(ui.start);
      }
      ui.toast("방이 사라졌다", 2600);
      net.openPanel();
    }
  }
});
net.init();

/* ================= 난이도 적용 ================= */
const _CFG_BASE = {
  monster: { ...CONFIG.monster },
  stamina: { ...CONFIG.stamina },
  battery: { ...CONFIG.battery },
  assist: { ...CONFIG.assist },
  noise: { ...CONFIG.noise }
};

function applyDifficulty(key) {
  const d = DIFFICULTY[key] || DIFFICULTY.normal;
  Object.assign(CONFIG.monster, _CFG_BASE.monster, d.monster || {});
  Object.assign(CONFIG.stamina, _CFG_BASE.stamina, d.stamina || {});
  Object.assign(CONFIG.battery, _CFG_BASE.battery, d.battery || {});
  Object.assign(CONFIG.assist, _CFG_BASE.assist, d.assist || {});
  Object.assign(CONFIG.noise, _CFG_BASE.noise, d.noise || {});
  player.setMaxHp(d.hpMax || 2);
  return d;
}

/* ================= 입력 ================= */
const input = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false, jump: false };
let pointerLocked = false;

function onKey(e, down) {
  const c = e.code;
  switch (c) {
    case "KeyW": case "ArrowUp": input.forward = down; break;
    case "KeyS": case "ArrowDown": input.back = down; break;
    case "KeyA": case "ArrowLeft": input.left = down; break;
    case "KeyD": case "ArrowRight": input.right = down; break;
    case "ShiftLeft": case "ShiftRight": input.sprint = down; break;
    case "KeyC": input.crouch = down; e.preventDefault(); break;
    case "Space":
      if (down && !e.repeat) input.jump = true;
      if (!down) input.jump = false;
      break;
    case "KeyF":
      // 상황대응 F: 소모품/충격기/덫를 들고 있으면 사용, 그 외(맨손/열쇠/메모)는 손전등
      if (down && !e.repeat && game.phase === "playing" && !game.keypad) situationF();
      break;
    case "KeyV":
      if (down && !e.repeat && game.phase === "playing") toggleMic();
      break;
    case "KeyM":
      if (down && !e.repeat && game.phase === "playing") toggleMinimap();
      break;
    case "KeyE":
      if (down && !e.repeat && game.phase === "playing" && player.hidden) {
        player.exitHide();
        ui.hideInteract();
      }
      break;
    case "Digit1": case "Digit2": case "Digit3": case "Digit4": case "Digit5":
    case "Digit6": case "Digit7": case "Digit8": case "Digit9":
      if (down && !e.repeat && game.phase === "playing") {
        const n = parseInt(c.slice(5), 10);
        if (game.keypad) keypadPress(n >= 1 && n <= 9 ? String(n) : ""); // 1-9
        else handleDigit(n - 1);
      }
      break;
    case "Digit0":
      if (down && !e.repeat && game.phase === "playing" && game.keypad) keypadPress("0");
      break;
    case "Escape":
      // 키패드 → 메모 → 일시정지 순으로 닫는다. 포인터 재잠금은 클릭(유저 제스처)으로만 한다.
      // (keydown에서만 동작 — keyup 재실행 시 바로 일시정지되는 버그 방지)
      if (!down || e.repeat) break;
      if (game.keypad) {
        closeKeypad();
      } else if (ui.isNoteOpen()) {
        ui.hideNote();
        ui.toast("메모 닫힘 — 화면을 클릭해 계속", 2400);
      } else if (document.getElementById("mp") && !document.getElementById("mp").classList.contains("hidden") && game.phase === "menu") {
        // 멀티 패널이 떠 있으면 ESC로 닫기 (방에 있으면 나가지는 않는다)
        net.closePanel();
      } else if (game.phase === "playing") pause();
      break;
  }
}
document.addEventListener("keydown", (e) => onKey(e, true));
document.addEventListener("keyup", (e) => onKey(e, false));

document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || game.phase !== "playing") return;
  const s = 0.0022 * settings.sensitivity;
  player.look(e.movementX * s, e.movementY * s);
});

renderer.domElement.addEventListener("click", () => {
  if (game.phase === "playing" && !pointerLocked) lockPointer();
});

// 마우스 왼쪽 = 기본 동작: 맨손이면 손전등 토글, 아이템을 들고 있으면 그 아이템 사용(연막투척 등)
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 0 && pointerLocked) primaryAction();
});

function primaryAction() {
  situationF();   // 좌클릭 = F와 동일 (상황대응)
}

// 상황대응 F: 사용 아이템(소모품/충격기/덫)을 들고 있으면 사용,
// 그 외(맨손/열쇠/메모)는 집어넣고 손전등 토글
function situationF() {
  if (game.phase !== "playing") return;
  if (game.heldSlot >= 0) {
    const slot = player.inventory.slots[game.heldSlot];
    const def = slot && slot.count > 0 ? getItemDef(slot.id) : null;
    if (def && (def.kind === "use" || def.kind === "trap" || def.kind === "stun")) {
      useSlot(game.heldSlot);
      return;
    }
  }
  toggleFlashlightUI();   // 내부에서 들고 있던 것 집어넣고 토글
}

function toggleFlashlightUI() {
  if (game.phase !== "playing") return;
  // 아이템을 들고 있으면 집어넣고 손전등으로 복귀
  if (game.heldSlot >= 0) stowHeld();
  const r = player.toggleFlashlight();
  if (!r.ok && r.reason === "dead") {
    ui.toast("손전등이 영구 고장 났다 — 야전 손전등으로 교체해야 한다", 2800);
  }
  ui.setFlashlight(player.flashOn);
}

function lockPointer() {
  const el = renderer.domElement;
  if (!el.requestPointerLock) return;
  try {
    const p = el.requestPointerLock();
    // 일부 브라우저는 promise를 반환한다 — 거부(untrusted 제스처 등) 시 조용히 무시
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) { /* ignore */ }
}
function unlockPointer() {
  if (document.exitPointerLock) document.exitPointerLock();
}
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && game.phase === "playing") {
    // 메모/키패드를 여는 중 해제 → 일시정지/재잠금 없음 (닫기는 클릭 또는 ESC)
    if (ui.isNoteOpen() || game.keypad) return;
    pause();
  }
});
document.addEventListener("pointerlockerror", () => {
  if (game.phase === "playing" && !pointerLocked) {
    ui.toast("화면을 클릭해 포인터를 잠가라", 2400);
  }
});
// 메모 클릭 닫기 — 클릭은 유저 제스처이므로 그때 재잠금한다
const _noteModalEl = document.getElementById("note-modal");
if (_noteModalEl) {
  _noteModalEl.addEventListener("click", () => {
    if (game.phase === "playing" && !pointerLocked) lockPointer();
  });
}
// 잠금이 풀린 상태에서 캔버스를 클릭하면 다시 잠금
renderer.domElement.addEventListener("click", () => {
  if (game.phase === "playing" && !pointerLocked) lockPointer();
});

/* ================= 시작 / 일시정지 / 사망 ================= */
const startBtn = document.getElementById("btn-start");
const useMicCheckbox = document.getElementById("use-mic");
const runTimerEl = document.getElementById("run-timer");

startBtn.addEventListener("click", () => {
  if (net.active && net.state === "lobby") {
    ui.toast("방에 참가 중이다 — 멀티플레이 화면에서 나가거나 시작하라", 3200);
    net.openPanel();
    return;
  }
  if (net.active && net.state === "playing") {
    ui.toast("협동 게임이 진행 중이다 — 멀티플레이 화면을 확인해라", 3000);
    net.openPanel();
    return;
  }
  audio.init();
  audio.resume();
  audio.setVolume(settings.volume);
  noise.micEnabled = useMicCheckbox.checked;
  startGame();
});

function startGame() {
  applyDifficulty(settings.difficulty);
  world.setMood(settings.difficulty === "nightmare");
  game.phase = "playing";
  game.elapsed = 0;
  game.encounters = 0;
  game.exitPowered = false;
  game.collected = 0;
  game.batteryWarned = false;
  game.lastMonsterState = STATE.ROAM;
  game.eConsumed = false;
  game.heldSlot = -1;
  game.keypad = null;
  game.batonReadyAt = 0;
  ui.hideKeypad();
  showAlert(null);
  game.notesRead = {};
  ui.hideNote();
  ui.hideInvDetail();
  game.ambientTimer = rand(CONFIG.assist.ambientScareMin, CONFIG.assist.ambientScareMax);
  clearEffects();
  player.respawn();
  monster.reset();
  // 악몽: 두 번째 괴물 (남서 구석에서 시작 — 괴물1·플레이어와 분리)
  monster2Active = settings.difficulty === "nightmare";
  if (monster2Active) {
    if (!monster2) {
      monster2 = new Monster(scene, world, audio, noise);
      monster2.onCatch = () => onMonsterCatch(monster2);
    }
    monster2.reset({ x: -46, z: -40 });
    monster2.rebuildGrid();
  }
  if (monster2) monster2.group.visible = monster2Active;
  resetFuses();
  player.inventory.clear();
  // 시작 지급: 전기 충격기(재사용) + 덫 5개
  player.inventory.add("stun", "전기 충격기", 1);
  player.inventory.add("trap", "덫", CONFIG.trap.startCount);
  world.resetInteractive();
  world.setNightmareLoot(settings.difficulty === "nightmare");
  monster.rebuildGrid();
  ui.setInventory(player.inventory, -1);
  if (world.chargeStation) world.chargeStation.setActive(false);
  noise.level = 0;
  noise.impulse = 0;
  noise.events = [];
  ui.hide(ui.start);
  ui.hide(ui.pause);
  ui.hide(ui.death);
  ui.hide(ui.win);
  // 멀티 로비 패널이 떠 있으면 게임 화면을 가리므로 반드시 닫는다
  document.getElementById("mp")?.classList.add("hidden");
  ui.setHudVisible(true);
  mapOn = false;
  ui.toggleMinimap(false);
  ui.setFlashlight(true);
  ui.setHp(player.hp, player.maxHp);
  ui.setObjective(`차단기 ${FUSE_TOTAL}개를 찾아 전원을 복구하세요`, 0, FUSE_TOTAL, null);
  ui.toast(`[${DIFFICULTY[settings.difficulty]?.label || "보통"}] 괴물이 너의 숨을 느꼈다. 조용히 움직여라.`, 3400);
  if (settings.difficulty === "nightmare") {
    ui.toast("악몽: 지도 없음 · 충전소 없음 · 괴물 2마리 — 손전등이 소진되면 영구 고장", 4200);
  }
  if (noise.micEnabled) {
    ui.setMic("pending");
    noise.attachMic().then(() => micFeedback(true));
  }
  // 멀티: 방장이 보낸 마지막 스냅샷을 리셋 직후에 덮어써 즉시 동기화한다
  if (net.active && net.pendingSnap) {
    const s = net.pendingSnap;
    net.pendingSnap = null;
    applySnapshot(s);
  }
  lockPointer();
}

// 마이크 연결 결과를 화면 안내로 표시
function micFeedback(onTurnOn) {
  ui.setMic(noise.micState);
  const s = noise.micState;
  if (s === "active") {
    if (onTurnOn) ui.toast("마이크 ON — 네 목소리도 괴물을 부른다 (V로 끄기)", 3000);
  } else if (s === "denied") {
    ui.toast("마이크 권한 거부됨 — 주소창 자물쇠 → 마이크 허용 후 V키로 다시 켜세요", 5600);
  } else if (s === "unsupported") {
    ui.toast("이 주소에서는 마이크를 쓸 수 없다. http://localhost 로 접속해라", 5600);
  } else if (s === "none") {
    ui.toast("마이크 장치를 찾을 수 없다 — 연결 후 V키로 다시 켜세요", 4600);
  } else if (s === "busy") {
    ui.toast("다른 앱이 마이크를 쓰고 있다 — 그 앱을 끄고 V키로 다시 시도", 4600);
  } else if (s === "error") {
    ui.toast("마이크 오류 — V키로 다시 시도", 4600);
  } else if (s === "off" && !onTurnOn) {
    ui.toast("마이크 꺼짐", 1600);
  }
}

// 브라우저 자동재생 정책: 첫 사용자 제스처에 오디오를 깨운다.
// (원격 시작으로 제스처 없이 시작된 경우 AudioContext가 suspended로 stuck되는 문제 방지)
let _audioUnlocked = false;
function unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  try { audio.init(); } catch (e) {}
  try { audio.resume(); } catch (e) {}
}
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

function resetFuses() {
  world.setExitPowered(false);
  for (const f of world.fuses) {
    f.collected = false;
    f.mesh.visible = true;
    f.glow.visible = true;
  }
}

function pause() {
  if (game.phase !== "playing") return;
  game.phase = "paused";
  unlockPointer();
  ui.hideNote();
  ui.show(ui.pause);
  ui.setMic(noise.micState);
}

function resume() {
  ui.hide(ui.pause);
  game.phase = "playing";
  audio.resume();
  lockPointer();
}

document.getElementById("btn-resume").addEventListener("click", resume);
document.getElementById("btn-quit").addEventListener("click", () => {
  ui.hide(ui.pause);
  ui.setHudVisible(false);
  game.phase = "menu";
  clearEffects();
  ui.show(ui.start);
});

function onCaught(m) {
  m = m || monster;
  if (game.phase !== "playing") return;
  // 무적 시간 중 재접촉 무시 (몬스터의 _caught 플래그도 되돌린다)
  if (player.invuln > 0) {
    m._caught = false;
    return;
  }
  const res = player.takeDamage(1);
  if (!res.ok) { m._caught = false; return; }

  if (!res.dead) {
    // 비치명 피격: 넉백 + 잠시 추적자와 분리
    const dx = player.x - m.x, dz = player.z - m.z;
    const len = Math.hypot(dx, dz) || 1;
    const kb = CONFIG.combat.knockback;
    player.knockback((dx / len) * kb, (dz / len) * kb, CONFIG.combat.knockbackUp);
    player.addCameraShake(0.9);
    m.forceRecover();
    // 도망 기회를 주기 위해 즉시 추격을 유발하는 큰 소리는 내지 않는다
    noise.addImpulse(0.35, player.x, player.z, "hurt");
    audio.attackScreech();
    ui.flashDamage();
    ui.setHp(player.hp, player.maxHp);
    ui.toast(`피격 — 남은 체력 ${player.hp}/${player.maxHp}`, 2400);
    return;
  }

  // 사망
  game.phase = "scaring";
  game.scareTimer = 0;
  unlockPointer();
  player.addCameraShake(1.5);
  ui.showJumpscare();
  audio.jumpscare();
  ui.flashDamage();
}

function finishScare() {
  game.phase = "dead";
  ui.hideJumpscare();
  clearEffects();
  document.getElementById("stat-time").textContent = formatTime(game.elapsed);
  document.getElementById("stat-fuse").textContent = `${game.collected}/${FUSE_TOTAL}`;
  ui.show(ui.death);
}

document.getElementById("btn-respawn").addEventListener("click", () => {
  ui.hide(ui.death);
  if (net.active && net.state === "playing") respawnLocal();
  else startGame();
});

document.getElementById("btn-again").addEventListener("click", () => {
  ui.hide(ui.win);
  if (net.active && net.state !== "idle") {
    // 협동: 대기실로 돌아가 방장이 재시작하기를 기다린다
    net.ending = false;
    net.openPanel();
  } else startGame();
});

/* 협동에서의 리스폰 — 월드는 그대로 두고 자기 상태만 복구한다 */
function respawnLocal() {
  game.phase = "playing";
  game.heldSlot = -1;
  game.eConsumed = false;
  game.keypad = null;
  game.interactHold = 0;
  game.interactTarget = null;
  ui.hideKeypad();
  player.setHeldItem(null);
  player.respawn();
  player.hp = player.maxHp;
  player.invuln = 3;
  ui.setInventory(player.inventory, -1);
  ui.setHp(player.hp, player.maxHp);
  ui.setFlashlight(player.flashOn);
  showAlert(null);
  ui.setHudVisible(true);
  lockPointer();
  ui.toast("다시 돌아왔다 — 팀원은 아직 싸우고 있다", 2600);
}

function winGame() {
  if (game.phase === "win") return;
  game.phase = "win";
  unlockPointer();
  document.getElementById("win-time").textContent = formatTime(game.elapsed);
  document.getElementById("win-noise").textContent = noise.loudCount || 0;
  ui.show(ui.win);
  ui.setHudVisible(false);
  if (net.active) {
    net.ending = true;
    if (net.isHost) {
      // 이벤트가 스냅샷에 실려 나간 뒤에 방을 닫는다 (클라이언트가 패널로 튕기지 않게)
      mpEvent({ k: "win" });
      setTimeout(() => { net.state = "lobby"; net.endRoom(); net.ending = false; }, 800);
    }
  }
}

function toggleMic() {
  const on = noise.toggleMic();
  ui.setMic(noise.micState);
  if (!on) {
    ui.toast("마이크 꺼짐", 1600);
    return;
  }
  ui.setMic("pending");
  // attachMic는 async — 결과가 나오면 안내 표시
  Promise.resolve(noise.attachMic()).then(() => micFeedback(false));
}

let mapOn = false;
function toggleMinimap() {
  if (game.phase !== "playing") return;
  // 악몽 난이도: 미니맵 자체가 없다
  if (settings.difficulty === "nightmare") {
    ui.toast("악몽 난이도 — 지도는 쓸 수 없다", 2200);
    return;
  }
  mapOn = !mapOn;
  ui.toggleMinimap(mapOn);
  ui.toast(mapOn ? "지도 열기 (M으로 닫기)" : "지도 닫기", 1200);
}

/* ================= 경고 배너 (상황 발생 시에만, 시간 제한) ================= */
function showAlert(text, duration = 2.8) {
  if (!text) {
    game.alertText = null;
    game.alertTimer = 0;
    ui.setAlert(null);
    return;
  }
  // 같은 문구가 아직 떠 있으면 연장만
  if (game.alertText === text && game.alertTimer > 0.4) {
    game.alertTimer = Math.max(game.alertTimer, duration * 0.5);
    return;
  }
  game.alertText = text;
  game.alertTimer = duration;
  ui.setAlert(text);
}

function tickAlert(dt) {
  if (game.alertTimer > 0) {
    game.alertTimer -= dt;
    if (game.alertTimer <= 0) {
      game.alertText = null;
      ui.setAlert(null);
    }
  }
}

/* ================= 목표 / 상호작용 ================= */
function updateObjectives(dt) {
  // 가장 가까운 퓨즈
  let nearest = null, nd = Infinity;
  for (const f of world.fuses) {
    if (f.collected) continue;
    const d = Math.hypot(f.x - player.x, f.z - player.z);
    if (d < nd) { nd = d; nearest = f; }
  }

  // 상호작용 대상 — 우선순위(높을수록 나중에 덮어씀): 서랍 < 은신처 < 잠긴 문 < 퓨즈(목표물) < 게이트
  let target = null;
  let label = "";

  // 서랍 (닫힘→열기 / 열림+아이템→줍기 / 열림+빈 or 획득완료→닫기)
  let nearDrawer = null, drD = Infinity;
  for (const dr of world.drawers) {
    const d = Math.hypot(dr.x - player.x, dr.z - player.z);
    if (d < drD) { drD = d; nearDrawer = dr; }
  }
  if (nearDrawer && drD < CONFIG.interaction.pickupRange && !nearDrawer.busy) {
    if (!nearDrawer.opened) {
      target = { type: "drawer", drawer: nearDrawer, phase: "open" };
      label = "서랍 열기";
    } else if (nearDrawer.lootId && !nearDrawer.looted) {
      target = { type: "drawer", drawer: nearDrawer, phase: "take" };
      const def = getItemDef(nearDrawer.lootId);
      label = `${def ? def.name : nearDrawer.lootName} 획득`;
    } else {
      target = { type: "drawer", drawer: nearDrawer, phase: "close" };
      label = "서랍 닫기";
    }
  }

  // 은신처
  let hideSpot = null, hd = Infinity;
  if (!player.hidden) {
    for (const s of world.hidingSpots) {
      if (s.occupied) continue;
      const d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d < hd) { hd = d; hideSpot = s; }
    }
    if (hideSpot && hd < CONFIG.interaction.hideRange) {
      target = { type: "hide", hide: hideSpot };
      label = hideSpot.type === "locker" ? "사물함에 숨기"
        : hideSpot.type === "cabinet" ? "수납장에 숨기"
        : hideSpot.type === "desk" ? "책상 밑에 숨기"
        : hideSpot.type === "crawl" ? "기어들어 숨기"
        : "숨기";
    }
  }

  // 잠긴 문 — 열쇠 ID 검사 (은신처보다 우선)
  let nearDoor = null, doorD = Infinity;
  for (const door of world.lockedDoors) {
    if (door.open) continue;
    const d = Math.hypot(door.x - player.x, door.z - player.z);
    if (d < doorD) { doorD = d; nearDoor = door; }
  }
  if (nearDoor && doorD < CONFIG.interaction.gateRange) {
    const keyDef = getItemDef(nearDoor.keyId);
    const keyName = keyDef ? keyDef.name : "열쇠";
    target = { type: "lockedDoor", door: nearDoor };
    label = player.inventory.hasKey(nearDoor.keyId)
      ? `${nearDoor.label} 열기 (${keyName})`
      : `${nearDoor.label} — 잠김`;
  }

  // 퓨즈(목표물) — 은신처·잠긴 문이 겹쳐도 반드시 회수 가능해야 함
  if (nearest && nd < CONFIG.interaction.pickupRange) {
    target = { type: "fuse", fuse: nearest };
    label = "차단기 회수";
  }

  // 게이트
  const gd = Math.hypot(world.exit.x - player.x, world.exit.z - player.z);
  if (game.exitPowered && gd < CONFIG.interaction.gateRange) {
    target = { type: "gate" };
    label = "철문 열고 탈출";
  }

  const holdingE = !!eKeyDown && !game.eConsumed;
  if (target && holdingE) {
    const same = game.interactTarget &&
      game.interactTarget.type === target.type &&
      game.interactTarget.fuse === target.fuse &&
      game.interactTarget.hide === target.hide &&
      game.interactTarget.drawer === target.drawer &&
      game.interactTarget.door === target.door &&
      game.interactTarget.phase === target.phase;
    if (!same) game.interactHold = 0;
    game.interactTarget = target;
    const time =
      target.type === "fuse" ? CONFIG.interaction.pickupTime
      : target.type === "hide" ? CONFIG.interaction.hideTime
      : target.type === "drawer" ? (target.phase === "take" ? 0.45 : 0.7)
      : target.type === "lockedDoor" ? 0.8
      : 1.4;
    game.interactHold += dt / time;
    if (game.interactHold >= 1) {
      if (target.type === "fuse") {
        if (mpClient()) {
          noise.addImpulse(0.2, player.x, player.z, "pickup");
          mpAct({ k: "fuse", i: world.fuses.indexOf(target.fuse) });
        } else collectFuse(target.fuse);
      }
      else if (target.type === "hide") { player.enterHide(target.hide); noise.drainEvents(); }
      else if (target.type === "drawer") {
        if (mpClient()) requestDrawer(target.drawer, target.phase);
        else handleDrawer(target.drawer, target.phase);
      }
      else if (target.type === "lockedDoor") {
        tryOpenDoor(target.door);
      }
      else {
        if (mpClient()) mpAct({ k: "gate" });
        else winGame();
      }
      game.interactHold = 0;
      game.interactTarget = null;
      game.eConsumed = true;   // 한 번의 E = 한 동작 (연쇄 방지)
    }
  } else {
    if (!eKeyDown) game.interactHold = 0;
    game.interactTarget = null;
  }

  if (player.hidden) ui.showInteract("숨기에서 나오기 (E)", 0);
  else if (target) ui.showInteract(label, game.interactHold);
  else ui.hideInteract();

  // 목표 텍스트
  if (game.exitPowered) {
    ui.setObjective("격리 철문으로 탈출하라", game.collected, FUSE_TOTAL, null);
  } else {
    ui.setObjective(`차단기 ${FUSE_TOTAL}개를 찾아 전원을 복구하세요`, game.collected, FUSE_TOTAL, nearest ? nd : null);
  }
}

function collectFuse(f) {
  noise.addImpulse(0.2, player.x, player.z, "pickup");
  if (applyFuse(f)) mpEvent({ k: "fuse", i: world.fuses.indexOf(f) });
}

let eKeyDown = false;
document.addEventListener("keydown", (e) => { if (e.code === "KeyE") eKeyDown = true; });
document.addEventListener("keyup", (e) => {
  if (e.code === "KeyE") { eKeyDown = false; game.eConsumed = false; } // 재누르면 다음 동작 허용
});

/* ================= 서랍 처리 ================= */
// 클라이언트: 월드를 건드리지 않고 호스트에 요청만 보낸다
function requestDrawer(d, phase) {
  if (!d) return;
  const i = world.drawers.indexOf(d);
  if (phase === "take") {
    if (!d.opened || d.looted || !d.lootId) return;
    if (!player.inventory.canAdd(d.lootId)) { audio.blip(200, 0.12); ui.showInvEmpty(); return; }
    noise.addImpulse(0.28, player.x, player.z, "search");
    mpAct({ k: "take", i });
    ui.toast(`${d.lootName} 집기 요청…`, 1200);
    return;
  }
  if (phase === "open" ? d.opened : !d.opened) return;
  noise.addImpulse(0.16, player.x, player.z, "search");
  if (phase === "open" && !d.lootId) ui.toast("서랍이 비어 있다", 1400);
  mpAct({ k: "drawer", i, open: phase === "open" });
}

// phase: "open" | "take" | "close"
function handleDrawer(d, phase) {
  if (!d) return;
  if (phase === "open") {
    if (d.opened || d.busy) return;
    world.toggleDrawer(d);
    audio.blip(520, 0.1);
    noise.addImpulse(0.16, player.x, player.z, "search");
    if (!d.lootId) ui.toast("서랍이 비어 있다", 1400);
    return;
  }
  if (phase === "take") {
    if (!d.opened || d.looted || !d.lootId) return;
    const res = player.inventory.add(d.lootId, d.lootName, 1);
    if (!res.ok) {
      audio.blip(200, 0.12);
      ui.showInvEmpty();
      return;
    }
    // 인벤토리 추가 성공 후에만 월드 상태 변경
    world.lootDrawer(d);
    const def = getItemDef(d.lootId);
    audio.blip(d.lootId.startsWith("key_") ? 1320 : 980, 0.16);
    noise.addImpulse(0.28, player.x, player.z, "search");
    ui.setInventory(player.inventory);
    ui.showItemDetail(def);
    if (d.lootId === "key_shed") ui.toast("획득: 창고 열쇠 — 잠긴 창고 문에 사용한다", 3000);
    else if (d.lootId === "key_store") ui.toast("획득: 저장고 열쇠 — 잠긴 저장고 문에 사용한다", 3000);
    else if (def && def.kind === "note") ui.toast(`획득: ${def.name} — 숫자키로 다시 읽기`, 2600);
    else ui.toast(`획득: ${def ? def.name : d.lootName}`, 1800);
    return;
  }
  if (phase === "close") {
    if (!d.opened || d.busy) return;
    world.toggleDrawer(d);
    audio.blip(380, 0.08);
    return;
  }
}

/* ================= 잠긴 문 ================= */
function tryOpenDoor(door) {
  if (!door || door.open) return;
  if (player.inventory.hasKey(door.keyId)) {
    // 열쇠는 소모하지 않음 — 문 개방만
    openDoor(door);
    return;
  }
  const keyDef = getItemDef(door.keyId);
  if (door.code) {
    // 열쇠 없음 → 비밀번호 키패드 (NOTE_SHED에 힌트)
    ui.toast(`열쇠 없음 — 비밀번호를 입력하라 (${keyDef ? keyDef.name : "특정 열쇠"})`, 2600);
    openKeypad(door);
    return;
  }
  ui.toast(`이 문에 맞는 열쇠가 필요하다. (${keyDef ? keyDef.name : "특정 열쇠"})`, 2400);
  audio.blip(240, 0.14);
}

// 문 개방 확정 요청 — 협동에서는 호스트가 대신 연다
function openDoor(door) {
  if (!door || door.open) return;
  if (mpClient()) {
    noise.addImpulse(0.9, player.x, player.z, "door");
    mpAct({ k: "door", i: world.lockedDoors.indexOf(door) });
    ui.toast(`${door.label} 열기 요청…`, 1300);
    return;
  }
  finishOpenDoor(door);
}

function finishOpenDoor(door) {
  noise.addImpulse(0.9, player.x, player.z, "door");
  if (applyDoorOpen(door)) mpEvent({ k: "door", i: world.lockedDoors.indexOf(door) });
}

/* ================= 비밀번호 키패드 ================= */
function openKeypad(door) {
  if (!door || !door.code || door.open) return;
  game.keypad = { door, buf: "" };
  unlockPointer();          // 커서 보이게 (버튼 클릭·시선 입력용)
  ui.showKeypad(door.label);
  ui.keypadSet("");
  audio.blip(760, 0.1);
}

function closeKeypad() {
  if (!game.keypad) return;
  game.keypad = null;
  ui.hideKeypad();
  // 게임 진행 중이면 클릭으로 재잠금 안내
  if (game.phase === "playing" && !pointerLocked) {
    ui.toast("화면을 클릭해 계속", 2000);
  }
}

function keypadPress(k) {
  const kp = game.keypad;
  if (!kp) return;
  if (k === "x") { closeKeypad(); return; }
  if (k === "c") { kp.buf = kp.buf.slice(0, -1); ui.keypadSet(kp.buf); audio.blip(320, 0.06); return; }
  if (!k || k.length !== 1 || kp.buf.length >= 4) return;
  kp.buf += k;
  ui.keypadSet(kp.buf);
  audio.blip(900, 0.05);
  if (kp.buf.length === 4) {
    if (kp.buf === kp.door.code) {
      const door = kp.door;
      closeKeypad();
      openDoor(door);
    } else {
      ui.keypadError();
      audio.blip(180, 0.2);
      ui.toast("비밀번호 불일치", 1600);
      kp.buf = "";
      ui.keypadSet("");
    }
  }
}
ui.onKeypadKey = keypadPress;   // 키패드 버튼 클릭 → 숫자/지움/취소 처리

/* ================= 덫 발동 ================= */
// 플레이어/괴물 모두 같은 규칙: 밟으면 스턴 + 부가 효과, 덫은1회 소멸
function updateTraps() {
  if (!world.traps.length) return;
  const T = CONFIG.trap;
  const remote = mpClient();   // 제거 판정과 괴물 발동은 호스트만
  for (let i = world.traps.length - 1; i >= 0; i--) {
    const t = world.traps[i];
    const key = trapKey(t.x, t.z);
    if (trapGone.has(key)) continue;
    if (!player.hidden && !player.inSafeZone &&
        Math.hypot(t.x - player.x, t.z - player.z) < T.triggerR) {
      // 내 발동: 효과는 즉시, 제거는 호스트가 확인한 뒤
      if (remote) trapGone.add(key);
      else { world.removeTrap(i); mpEvent({ k: "trapgo", x: t.x, z: t.z }); }
      player.stun(T.playerStun);
      player.lockSprint(T.playerSprintLock);
      audio.blip(200, 0.25);
      noise.addImpulse(0.6, t.x, t.z, "trap");
      showAlert("덫에 걸렸다!", 2.4);
      ui.toast(`덫 발동 — ${T.playerStun}초 스턴 · 달리기 ${T.playerSprintLock}초 잠금`, 3200);
      if (remote) mpAct({ k: "trapgo", x: t.x, z: t.z });
      continue;
    }
    if (remote) continue;
    for (const m of activeMonsters()) {
      if (m.stunT > 0) continue;
      if (Math.hypot(t.x - m.x, t.z - m.z) < T.monsterR) {
        world.removeTrap(i);
        mpEvent({ k: "trapgo", x: t.x, z: t.z });
        m.stun(T.monsterStun);
        m.slowT = T.monsterSlow;
        audio.blip(1200, 0.15);
        noise.addImpulse(0.5, t.x, t.z, "trap");
        ui.toast(`괴물이 덫에 걸렸다 — ${T.monsterStun}초 스턴`, 2600);
        break;
      }
    }
  }
}

/* ================= 연막 / 소음장치 이펙트 ================= */
const smokes = [];   // {x,z,r,ttl,maxTtl,mesh}
const decoys = [];   // {x,z,ttl,interval,timer}
world.smokes = smokes; // 괴물 시야 차단용 참조

function clearEffects() {
  for (const s of smokes) {
    scene.remove(s.mesh);
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
  }
  smokes.length = 0;
  decoys.length = 0;
  world.smokes = smokes;
}

function spawnSmoke(x, z) {
  const r = 4.6, maxTtl = 9;
  const geo = new THREE.SphereGeometry(r, 14, 10);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xb8c4cc, transparent: true, opacity: 0.34, depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  const y = world.heightAt(x, z) + 1.2;
  mesh.position.set(x, y, z);
  mesh.scale.set(1, 0.65, 1);
  scene.add(mesh);
  smokes.push({ x, z, r, ttl: maxTtl, maxTtl, mesh });
}

function spawnDecoy(x, z) {
  decoys.push({ x, z, ttl: 6.5, interval: 0.45, timer: 0 });
}

function updateEffects(dt) {
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i];
    s.ttl -= dt;
    const k = Math.max(0, s.ttl / s.maxTtl);
    s.mesh.material.opacity = 0.34 * k;
    const grow = 1 + (1 - k) * 0.45;
    s.mesh.scale.set(grow, 0.65 * grow, grow);
    if (s.ttl <= 0) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
      smokes.splice(i, 1);
    }
  }
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i];
    d.ttl -= dt;
    d.timer -= dt;
    if (d.timer <= 0) {
      d.timer = d.interval;
      noise.addImpulse(0.72, d.x, d.z, "decoy");
      audio.blip(760 + Math.random() * 240, 0.07);
    }
    if (d.ttl <= 0) decoys.splice(i, 1);
  }
}

/* ================= 인벤토리 사용 ================= */
// 숫자키: 소모품은 1회=꺼내기(손전등 off), 같은 키 재누르기=사용. 열쇠/메모는 즉시 안내·열람.
function handleDigit(i) {
  const slot = player.inventory.slots[i];
  if (!slot || slot.count <= 0) return;
  const def = getItemDef(slot.id);
  if (def && (def.kind === "use" || def.kind === "trap" || def.kind === "stun")) {
    if (game.heldSlot === i) useSlot(i);
    else equipSlot(i);
  } else {
    useSlot(i);
  }
}

function equipSlot(i) {
  const slot = player.inventory.slots[i];
  if (!slot || slot.count <= 0) return;
  const def = getItemDef(slot.id);
  game.heldSlot = i;
  player.setHeldItem(slot.id);
  if (player.flashOn) player.setFlashlight(false);
  ui.setFlashlight(false);
  ui.setInventory(player.inventory, game.heldSlot);
  ui.toast(`${def ? def.name : slot.name} 준비 — F 또는 같은 숫자키로 사용`, 2400);
}

function stowHeld() {
  if (game.heldSlot < 0) return false;
  game.heldSlot = -1;
  player.setHeldItem(null);
  ui.setInventory(player.inventory, -1);
  return true;
}

// 소모로 인벤토리가 비면 들고 있던 손 모델도 집어넣는다
function syncHeld() {
  if (game.heldSlot < 0) return;
  const s = player.inventory.slots[game.heldSlot];
  if (!s || s.count <= 0) stowHeld();
}

function useSlot(i) {
  const inv = player.inventory;
  const slot = inv.slots[i];
  if (!slot || slot.count <= 0) return;
  const def = getItemDef(slot.id);
  if (slot.id === "battery") {
    const B = CONFIG.battery;
    if (player.battery >= B.max - 0.5) { ui.toast("배터리가 이미 가득 찼습니다", 1600); return; }
    player.battery = Math.min(B.max, player.battery + 40);
    inv.takeAt(i);
    audio.blip(1180, 0.14);
    ui.toast("배터리 보급 — 손전등 충전", 1600);
  } else if (slot.id === "flashlight") {
    const B = CONFIG.battery;
    if (player.battery >= B.max - 0.5 && !player.flashDead) { ui.toast("손전등이 이미 새것과 같다", 1600); return; }
    player.battery = B.max;
    player.flashDead = false;   // 악몽 영구 고장 회복 — 새 손전등으로 교체
    inv.takeAt(i);
    audio.blip(1320, 0.16);
    ui.toast("새 손전등으로 교체 — 배터리 100%", 1800);
  } else if (slot.id && slot.id.startsWith("key_")) {
    ui.toast(`${def ? def.name : "열쇠"} — 잠긴 문 앞에서 E를 눌러 사용한다`, 2200);
  } else if (slot.id === "medkit") {
    if (player.hp >= player.maxHp) { ui.toast("체력이 이미 가득 찼습니다", 1600); return; }
    player.hp = Math.min(player.maxHp, player.hp + 1);
    inv.takeAt(i);
    audio.blip(980, 0.16);
    ui.setHp(player.hp, player.maxHp);
    ui.toast(`구급상자 사용 — 체력 ${player.hp}/${player.maxHp}`, 1800);
  } else if (slot.id === "smoke") {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const x = player.x + fx * 2.6, z = player.z + fz * 2.6;
    spawnSmoke(x, z);
    inv.takeAt(i);
    noise.addImpulse(0.45, x, z, "smoke");
    audio.blip(420, 0.18);
    ui.toast("연막 터짐 — 괴물의 시야를 가렸다", 2000);
    shareFx("smoke", x, z);
  } else if (slot.id === "decoy") {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const x = player.x + fx * 4.5, z = player.z + fz * 4.5;
    spawnDecoy(x, z);
    inv.takeAt(i);
    noise.addImpulse(0.6, x, z, "throw");
    audio.blip(660, 0.12);
    ui.toast("소음장치 가동 — 괴물을 다른 곳으로 유인한다", 2200);
    shareFx("decoy", x, z);
  } else if (def && def.kind === "stun") {
    // 전기 충격기 — 소모품 아님, 쿨다운만 있는 재사용 장비
    const now = performance.now();
    if (now < game.batonReadyAt) {
      const left = (game.batonReadyAt - now) / 1000;
      ui.toast(`충격기 재충전 중 — ${left.toFixed(1)}초`, 1500);
      return;
    }
    game.batonReadyAt = now + CONFIG.stun.cooldown * 1000;
    audio.blip(1600, 0.08);
    setTimeout(() => audio.blip(1900, 0.06), 60);
    noise.addImpulse(0.35, player.x, player.z, "zap");
    if (mpClient()) {
      // 판정은 호스트가 한다 — 결과는 stunres 이벤트로 돌아온다
      mpAct({ k: "stun", x: player.x, z: player.z });
      ui.toast("충격기 발동", 1400);
      return;
    }
    const targets = activeMonsters();
    let hit = null;
    for (const m of targets) {
      if (m.stunT > 0) continue;
      const d = Math.hypot(m.x - player.x, m.z - player.z);
      if (d <= CONFIG.stun.range && !world.lineBlocked(player.x, player.z, m.x, m.z)) { hit = m; break; }
    }
    if (hit) {
      hit.stun(CONFIG.stun.duration);
      player.addCameraShake(0.18);
      ui.toast("충격 적중 — 괴물이3초간 경직", 2400);
    } else {
      ui.toast("방전 — 범위(3m) 안에 표적이 없다", 1800);
    }
    return;   // 소모품 아님: syncHeld 생략 (손에 계속 든 채)
  } else if (def && def.kind === "trap") {
    // 덫 배치 — 전방 바닥, 배치 즉시 소모
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    let x = player.x + fx * 1.4, z = player.z + fz * 1.4;
    const c = world.collide(x, z, 0.28);
    x = c.x; z = c.z;
    if (world.traps.length >= CONFIG.trap.maxPlaced) {
      ui.toast("더 이상 배치할 수 없다 (최대 12개)", 1800);
      return;
    }
    if (mpClient() && trapPlaceLock) return;
    inv.takeAt(i);
    audio.blip(500, 0.1);
    noise.addImpulse(0.25, x, z, "search");
    ui.toast("덫 배치 — 밟으면3초 스턴(+5초 잠금)", 2200);
    if (mpClient()) {
      trapPlaceLock = true;
      setTimeout(() => { trapPlaceLock = false; }, 600);
      mpAct({ k: "trap", x, z });
    } else {
      world.addTrap(x, z);
      mpEvent({ k: "trap", x, z });
    }
  } else if (def && def.kind === "note") {
    // 메모: 소모하지 않고 다시 읽는다. 모달을 보려면 포인터를 해제한다.
    game.notesRead[slot.id] = true;
    audio.blip(700, 0.1);
    unlockPointer();
    ui.showNote(def);
    ui.toast(`읽음: ${def.name} — 클릭 또는 ESC로 닫기`, 1800);
  } else {
    return;
  }
  syncHeld();
  ui.setInventory(player.inventory, game.heldSlot >= 0 ? game.heldSlot : -1);
}

/* ================= 환경 공포 연출 ================= */
const shadowTex = makeShadowFigure();
function triggerAmbientScare() {
  const roll = Math.random();
  if (roll < 0.4) {
    audio.screech(0.35);
    audio.growl(0.3, rand(-1, 1), 0.4);
  } else if (roll < 0.7) {
    audio.land(0.3);
    audio.breathe(0.35, rand(-1, 1));
  } else {
    flashShadowFigure();
  }
  player.addCameraShake(0.08);
}

let shadowSprite = null, shadowTimer = 0;
function flashShadowFigure() {
  if (shadowSprite) return;
  const dir = player.yaw + rand(-0.9, 0.9);
  const dist = rand(9, 16);
  const x = player.x + Math.sin(dir) * dist;
  const z = player.z + Math.cos(dir) * dist;
  const y = world.heightAt(x, z) + 1.6;
  shadowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.92 }));
  shadowSprite.scale.set(1.6, 3.0, 1);
  shadowSprite.position.set(x, y, z);
  scene.add(shadowSprite);
  shadowTimer = 0.34;
  audio.screech(0.5);
}

function makeShadowFigure() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 256);
  ctx.fillStyle = "#000";
  // 머리
  ctx.beginPath(); ctx.arc(64, 40, 22, 0, Math.PI * 2); ctx.fill();
  // 몸통
  ctx.beginPath();
  ctx.moveTo(48, 58); ctx.lineTo(80, 58); ctx.lineTo(92, 150); ctx.lineTo(36, 150); ctx.closePath(); ctx.fill();
  // 팔
  ctx.beginPath(); ctx.moveTo(48, 62); ctx.lineTo(30, 150); ctx.lineTo(40, 154); ctx.lineTo(56, 70); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(80, 62); ctx.lineTo(98, 150); ctx.lineTo(88, 154); ctx.lineTo(72, 70); ctx.closePath(); ctx.fill();
  // 다리
  ctx.beginPath(); ctx.moveTo(46, 150); ctx.lineTo(58, 240); ctx.lineTo(48, 240); ctx.lineTo(38, 152); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(82, 150); ctx.lineTo(90, 240); ctx.lineTo(80, 240); ctx.lineTo(70, 152); ctx.closePath(); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ================= 메인 루프 ================= */
const clock = new THREE.Clock();
let fpsAcc = 0, fpsTimer = 0;

/* 두 괴물 중 '더 위험한 쪽' 기준으로 경고/공포도를 계산한다 (악몽 전용) */
const ST_RANK = { ROAM: 0, LISTEN: 1, RECOVER: 1, STALK: 1, INVESTIGATE: 2, SEARCH: 2, CHASE: 3, ATTACK: 4 };
function threatState() {
  if (!monster2Active || !monster2) return monster.state;
  return (ST_RANK[monster2.state] || 0) > (ST_RANK[monster.state] || 0) ? monster2.state : monster.state;
}
function threatDist(px, pz) {
  let d = Math.hypot(monster.x - px, monster.z - pz);
  if (monster2Active && monster2) d = Math.min(d, Math.hypot(monster2.x - px, monster2.z - pz));
  return d;
}
function activeMonsters() {
  return monster2Active && monster2 ? [monster, monster2] : [monster];
}

/* 몬스터 시뮬레이션 — 싱글/호스트는 AI, 클라이언트는 스냅샷 고스트 */
function monsterSim(dt) {
  // 방에 참가해 '플레이 중'일 때만 호스트/클라이언트 역할이 갈린다.
  // 서버에 연결만 하고 방에 없을 때(싱글플레이)는 로컬 AI를 돌려야 한다.
  const playing = net.active && net.state === "playing";
  const ghost = playing && !net.isHost;
  monster.ghost = ghost;
  if (monster2) monster2.ghost = ghost;

  if (ghost) {
    // 클라이언트: 소음 이벤트를 모아 호스트 포즈에 실어 보낸다
    net.queueNoise(noise.drainEvents());
    monster._catchId = null;
    monster.update(dt, player);
    if (monster2Active && monster2) { monster2._catchId = null; monster2.update(dt, player); }
    return;
  }

  const evs = noise.drainEvents();
  if (playing && net.isHost) {
    // host authority: 가장 가까운 생존 플레이어를 몬스터의 목표로 삼는다
    const t1 = hostTargetFor(monster);
    monster._catchId = t1.id;
    if (t1.p) monster.update(dt, t1.p, evs);
    else monster._animate(dt, 0);
    if (monster2Active && monster2) {
      const t2 = hostTargetFor(monster2);
      monster2._catchId = t2.id;
      if (t2.p) monster2.update(dt, t2.p, evs);
      else monster2._animate(dt, 0);
    }
    return;
  }

  if (monster2Active && monster2) {
    monster.update(dt, player, evs);
    monster2.update(dt, player, evs);
  } else {
    monster.update(dt, player, evs);
  }
}

/* host가 죽어도 월드는 계속 굴러간다 (원격 팀원을 위해) */
function hostSim(dt) {
  return net.active && net.isHost && net.state === "playing" && game.phase !== "paused";
}

function step(dt) {
  if (game.phase === "playing") {
    game.elapsed += dt;

    player.update(dt, input);
    input.jump = false; // 점프는 1프레임 펄스
    net.localHideIdx = player.hideSpot ? world.hidingSpots.indexOf(player.hideSpot) : -1;
    noise.update(dt);
    monsterSim(dt);
    updateEffects(dt);
    updateTraps();
    // 키패드: 문에서 멀어지면 자동 닫힘
    if (game.keypad) {
      const kd = Math.hypot(game.keypad.door.x - player.x, game.keypad.door.z - player.z);
      if (kd > CONFIG.interaction.gateRange + 1.2 || game.keypad.door.open) closeKeypad();
    }

    // 충전소 배터리 (안전지대에서만 · 악몽에서는 충전소 자체가 없다)
    const cs = world.chargeStation;
    player.charging = player.inSafeZone && !!cs &&
      settings.difficulty !== "nightmare" &&
      Math.hypot(cs.x - player.x, cs.z - player.z) < CONFIG.interaction.chargeRange &&
      player.battery < CONFIG.battery.max;
    if (cs) cs.setActive(player.charging);
    if (player.batteryLow && !game.batteryWarned) {
      game.batteryWarned = true;
      showAlert("손전등 배터리가 부족하다.", 3.0);
      ui.toast("배터리 부족 — 손전등이 곧 꺼집니다", 2600);
    }
    if (!player.batteryLow) game.batteryWarned = false;

    // 몬스터 조우 카운터 + 상태 전이 시에만 경고 문구 갱신
    const prevSt = game.lastMonsterState;
    const st = threatState();
    if (st === STATE.CHASE && prevSt !== STATE.CHASE) game.encounters++;
    if (st !== prevSt) {
      if (st === STATE.CHASE) showAlert("괴물이 온다!", 3.0);
      else if (st === STATE.ATTACK) showAlert("들켰다!", 2.2);
      else if (st === STATE.INVESTIGATE) showAlert("무언가 소리를 들었다.", 2.6);
      else if (st === STATE.LISTEN || st === STATE.SEARCH) showAlert("주변을 확인하는 소리가 들린다.", 2.6);
      else if (prevSt === STATE.CHASE || prevSt === STATE.ATTACK) showAlert("찾지 못한 모양이다. 조용히 해라.", 2.6);
    }
    game.lastMonsterState = st;

    updateObjectives(dt);
    tickAlert(dt);

    // 공포도 (가장 가까운 괴물 기준)
    const dist = threatDist(player.x, player.z);
    const proximity = clamp(1 - dist / 26, 0, 1);
    const fearTarget = clamp(Math.max(proximity, noise.level * 0.5,
      st === STATE.CHASE || st === STATE.ATTACK ? 0.7 : 0), 0, 1);
    fear = damp(fear, fearTarget, 2.2, dt);
    ui.setFear(fear);
    audio.setAmbientMood(fear);
    audio.heartbeat(fear, dt);

    // 괴물이 다가오면 조명이 '텔타'처럼 붉게 번져간다 (악몽: 추적 중인 괴물 우선)
    const chasers = activeMonsters();
    const threat = chasers.find((m) => m.state === STATE.ATTACK)
      || chasers.find((m) => m.state === STATE.CHASE);
    world.distress = threat ? { x: threat.x, z: threat.z } : null;

    // 환경 공포
    game.ambientTimer -= dt;
    if (game.ambientTimer <= 0) {
      game.ambientTimer = rand(CONFIG.assist.ambientScareMin, CONFIG.assist.ambientScareMax);
      if (dist > 22) triggerAmbientScare();
    }
  } else {
    noise.update(dt);
    if (game.phase === "paused") {
      showAlert(null);
    }
    // host가 죽었거나 승리 화면이어도 월드는 계속 시뮬레이션한다
    if (hostSim(dt)) {
      monsterSim(dt);
      updateEffects(dt);
      updateTraps();
    }
  }

  net.tick(dt);

  // 점프스케어 타이머
  if (game.phase === "scaring") {
    game.scareTimer += dt;
    player.addCameraShake(0.65);
    if (game.scareTimer > 1.45) finishScare();
  }

  // 그림자 연출 타이머
  if (shadowSprite) {
    shadowTimer -= dt;
    shadowSprite.material.opacity = clamp(shadowTimer / 0.34, 0, 1) * 0.92;
    if (shadowTimer <= 0) { scene.remove(shadowSprite); shadowSprite.material.map.dispose(); shadowSprite.material.dispose(); shadowSprite = null; }
  }

  perfTick(dt);
  world.update(dt, game.elapsed);
  ui.update(dt);

  // HUD 동기화
  if (game.phase === "playing" || game.phase === "paused") {
    ui.setNoise(noise.level);
    ui.setStamina(player.stamina / CONFIG.stamina.max);
    ui.setBattery(player.battery / CONFIG.battery.max);
    ui.setHp(player.hp, player.maxHp);
    ui.setSafeZone(player.inSafeZone, player.charging);
    ui.setMic(noise.micState);
    // 스피드런 타이머 — game.elapsed은 playing일 때만 흐른다(ESC 일시정지 = 타이머 정지)
    if (runTimerEl) runTimerEl.textContent = formatTime(game.elapsed);
  }

  if (!document.hidden) renderer.render(scene, camera);
}

function loop() {
  requestAnimationFrame(loop);
  step(Math.min(clock.getDelta(), 0.05));
}

/* 탭이 백그라운드로 가면 requestAnimationFrame이 멈춘다.
   호스트가 멈추면 방 전체가 멈추므로, 백그라운드에서도 타이머로 시뮬레이션을 굴린다.
   방에 참가하기 전에 숨겨진 탭일 수도 있으니 조건은 타이머 안에서 다시 본다. */
let bgTimer = 0;
function bgStep() {
  if (!document.hidden) { clearInterval(bgTimer); bgTimer = 0; return; }
  if (net.active || game.phase === "playing") step(1 / 20);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (!bgTimer) bgTimer = setInterval(bgStep, 50);
  } else if (bgTimer) {
    clearInterval(bgTimer); bgTimer = 0;
    clock.getDelta();   // 백그라운드 동안 쌓인 시간을 버려서 점프를 막는다
  }
});
// 로드 시 이미 숨겨져 있으면 visibilitychange가 한 번도 오지 않는다
if (document.hidden) bgTimer = setInterval(bgStep, 50);

let fear = 0;

/* ================= 성능 자동 조절 ================= */
let perfAcc = 0, perfFrames = 0, perfLevel = 0;
function perfTick(dt) {
  perfAcc += dt; perfFrames++;
  if (perfAcc < 1.5) return;
  const fps = perfFrames / perfAcc;
  perfAcc = 0; perfFrames = 0;
  if (fps < 28 && perfLevel < 2) {
    perfLevel++;
    if (perfLevel === 1) {
      renderer.shadowMap.enabled = false;
      world.setShadows(false);
      applyPixelRatio(1.0);
      ui.toast("원활한 플레이를 위해 그래픽을 낮췄습니다", 2600);
    } else {
      if (world.grass) world.grass.visible = false;
      ui.toast("원활한 플레이를 위해 잔디를 숨겼습니다", 2600);
    }
  }
}

/* ================= 리사이즈 ================= */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================= 설정 UI ================= */
const setSens = document.getElementById("set-sens");
const setSensVal = document.getElementById("set-sens-val");
const setInvy = document.getElementById("set-invy");
const setVol = document.getElementById("set-vol");
const setVolVal = document.getElementById("set-vol-val");
const setMicSens = document.getElementById("set-micsens");
const setMicSensVal = document.getElementById("set-micsens-val");
const setQuality = document.getElementById("set-quality");
const setDifficulty = document.getElementById("set-difficulty");

function syncSettingsUI() {
  setSens.value = settings.sensitivity;
  setSensVal.textContent = settings.sensitivity.toFixed(2) + "x";
  setInvy.checked = settings.invertY;
  setVol.value = settings.volume;
  setVolVal.textContent = Math.round(settings.volume * 100) + "%";
  setMicSens.value = settings.micSens;
  setMicSensVal.textContent = settings.micSens.toFixed(1) + "x";
  setQuality.value = settings.quality;
  if (setDifficulty) setDifficulty.value = settings.difficulty;
}
syncSettingsUI();

setSens.addEventListener("input", () => { settings.sensitivity = parseFloat(setSens.value); setSensVal.textContent = settings.sensitivity.toFixed(2) + "x"; saveSettings(); });
setInvy.addEventListener("change", () => { settings.invertY = setInvy.checked; saveSettings(); });
setVol.addEventListener("input", () => { settings.volume = parseFloat(setVol.value); setVolVal.textContent = Math.round(settings.volume * 100) + "%"; audio.setVolume(settings.volume); saveSettings(); });
setMicSens.addEventListener("input", () => { settings.micSens = parseFloat(setMicSens.value); setMicSensVal.textContent = settings.micSens.toFixed(1) + "x"; noise.setMicSensitivity(settings.micSens); saveSettings(); });
setQuality.addEventListener("change", () => {
  settings.quality = setQuality.value;
  saveSettings();
  ui.toast("화질은 다음 시작 시 적용됩니다", 2400);
});
if (setDifficulty) {
  setDifficulty.addEventListener("change", () => {
    settings.difficulty = setDifficulty.value;
    saveSettings();
    ui.toast("난이도는 다음 시작 시 적용됩니다", 2400);
  });
}

// 초기 상태
ui.setMic("off");
ui.setFlashlight(true);
ui.setHudVisible(false);

// 디버그/테스트용 훅
  window.__silence = { game, player, monster, get monster2() { return monster2; }, get monster2Active() { return monster2Active; }, startGame, winGame, noise, world, ui, settings, STATE, input, audio, renderer, camera, scene, THREE, DIFFICULTY, CONFIG, applyDifficulty, smokes, decoys, primaryAction, situationF, handleDigit, stowHeld, equipSlot, useSlot, keypadPress, openKeypad, closeKeypad, updateTraps, net, respawnLocal, applySnapshot, buildSnapshot, buildPose, handleNetEvent, handleRemoteAct, trapGone };

loop();
