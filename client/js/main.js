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

/* ================= 설정 ================= */
const settings = Object.assign(
  { sensitivity: 1, invertY: false, volume: 0.8, micSens: 1, quality: "low", difficulty: "normal" },
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
monster.onCatch = onCaught;
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
  noteEscapedAt: -1e9, // 메모 닫기 Esc 시각 (포인터 잠금 해제 재잠금용)
  relockT: null,
  notesRead: {}   // 읽은 메모 id → true
};
const FUSE_TOTAL = world.fuses.length;

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
      if (down && !e.repeat) toggleFlashlightUI();
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
      if (down && !e.repeat && game.phase === "playing") handleDigit(parseInt(c.slice(5), 10) - 1);
      break;
    case "Escape":
      // 메모(단서)가 떠 있으면 닫기만 하고 게임은 멈추지 않는다
      if (ui.isNoteOpen()) {
        ui.hideNote();
        game.noteEscapedAt = performance.now();
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

// 마우스 왼쪽 클릭으로도 손전등을 켜고 끈다
renderer.domElement.addEventListener("mousedown", (e) => {
  if (e.button === 0 && pointerLocked) toggleFlashlightUI();
});

function toggleFlashlightUI() {
  if (game.phase !== "playing") return;
  // 아이템을 들고 있으면 집어넣고 손전등으로 복귀
  if (game.heldSlot >= 0) stowHeld();
  player.toggleFlashlight();
  ui.setFlashlight(player.flashOn);
}

function lockPointer() {
  const el = renderer.domElement;
  if (el.requestPointerLock) el.requestPointerLock();
}
function unlockPointer() {
  if (document.exitPointerLock) document.exitPointerLock();
}
document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && game.phase === "playing") {
    // 메모 닫기 Esc는 브라우저가 포인터 잠금을 해제한다 → 일시정지 대신 재잠금
    const since = performance.now() - game.noteEscapedAt;
    if (since < 1600) {
      clearTimeout(game.relockT);
      game.relockT = setTimeout(() => {
        if (game.phase === "playing" && !pointerLocked) lockPointer();
      }, Math.max(0, 1700 - since));
      return;
    }
    pause();
  }
});
// 잠금이 풀린 상태에서 캔버스를 클릭하면 다시 잠금
renderer.domElement.addEventListener("click", () => {
  if (game.phase === "playing" && !pointerLocked) lockPointer();
});

/* ================= 시작 / 일시정지 / 사망 ================= */
const startBtn = document.getElementById("btn-start");
const useMicCheckbox = document.getElementById("use-mic");
const runTimerEl = document.getElementById("run-timer");

startBtn.addEventListener("click", () => {
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
  showAlert(null);
  game.notesRead = {};
  ui.hideNote();
  ui.hideInvDetail();
  game.ambientTimer = rand(CONFIG.assist.ambientScareMin, CONFIG.assist.ambientScareMax);
  clearEffects();
  player.respawn();
  monster.reset();
  resetFuses();
  player.inventory.clear();
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
  ui.setHudVisible(true);
  mapOn = false;
  ui.toggleMinimap(false);
  ui.setFlashlight(true);
  ui.setHp(player.hp, player.maxHp);
  ui.setObjective(`차단기 ${FUSE_TOTAL}개를 찾아 전원을 복구하세요`, 0, FUSE_TOTAL, null);
  ui.toast(`[${DIFFICULTY[settings.difficulty]?.label || "보통"}] 괴물이 너의 숨을 느꼈다. 조용히 움직여라.`, 3400);
  if (settings.difficulty === "nightmare") {
    ui.toast("악몽: 지도 없음 · 충전소 없음 · 괴물 2마리 — 손전등이 유일한 빛", 4200);
  }
  if (noise.micEnabled) {
    ui.setMic("pending");
    noise.attachMic().then(() => micFeedback(true));
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
  } else if (s === "error") {
    ui.toast("마이크 오류 — 다른 앱이 점유 중일 수 있다. V키로 다시 시도", 4600);
  } else if (s === "off" && !onTurnOn) {
    ui.toast("마이크 꺼짐", 1600);
  }
}

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

function onCaught() {
  if (game.phase !== "playing") return;
  // 무적 시간 중 재접촉 무시 (몬스터의 _caught 플래그도 되돌린다)
  if (player.invuln > 0) {
    monster._caught = false;
    return;
  }
  const res = player.takeDamage(1);
  if (!res.ok) { monster._caught = false; return; }

  if (!res.dead) {
    // 비치명 피격: 넉백 + 잠시 추적자와 분리
    const dx = player.x - monster.x, dz = player.z - monster.z;
    const len = Math.hypot(dx, dz) || 1;
    const kb = CONFIG.combat.knockback;
    player.knockback((dx / len) * kb, (dz / len) * kb, CONFIG.combat.knockbackUp);
    player.addCameraShake(0.9);
    monster.forceRecover();
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
  startGame();
});

document.getElementById("btn-again").addEventListener("click", () => {
  ui.hide(ui.win);
  startGame();
});

function winGame() {
  game.phase = "win";
  unlockPointer();
  document.getElementById("win-time").textContent = formatTime(game.elapsed);
  document.getElementById("win-noise").textContent = noise.loudCount || 0;
  ui.show(ui.win);
  ui.setHudVisible(false);
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
      if (target.type === "fuse") collectFuse(target.fuse);
      else if (target.type === "hide") { player.enterHide(target.hide); noise.drainEvents(); }
      else if (target.type === "drawer") handleDrawer(target.drawer, target.phase);
      else if (target.type === "lockedDoor") tryOpenDoor(target.door);
      else winGame();
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
  f.collected = true;
  f.mesh.visible = false;
  f.glow.visible = false;
  game.collected++;
  audio.blip(1040, 0.16);
  noise.addImpulse(0.2, player.x, player.z, "pickup");
  if (game.collected >= FUSE_TOTAL) {
    game.exitPowered = true;
    world.setExitPowered(true);
    ui.toast("전원 복구 — 격리 철문의 잠금이 풀렸다", 3600);
    ui.setObjective("격리 철문으로 탈출하라", game.collected, FUSE_TOTAL, null);
  } else {
    ui.toast(`차단기 ${game.collected}/${FUSE_TOTAL} 재기동`, 1600);
  }
}

let eKeyDown = false;
document.addEventListener("keydown", (e) => { if (e.code === "KeyE") eKeyDown = true; });
document.addEventListener("keyup", (e) => {
  if (e.code === "KeyE") { eKeyDown = false; game.eConsumed = false; } // 재누르면 다음 동작 허용
});

/* ================= 서랍 처리 ================= */
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
  if (!player.inventory.hasKey(door.keyId)) {
    const keyDef = getItemDef(door.keyId);
    ui.toast(`이 문에 맞는 열쇠가 필요하다. (${keyDef ? keyDef.name : "특정 열쇠"})`, 2400);
    audio.blip(240, 0.14);
    return;
  }
  // 열쇠는 소모하지 않음 — 문 개방만
  world.openLockedDoor(door);
  monster.rebuildGrid();
  noise.addImpulse(0.9, player.x, player.z, "door");
  ui.setInventory(player.inventory);
  ui.toast(`${door.label} 잠금 해제`, 2000);
  audio.blip(660, 0.2);
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
  if (def && def.kind === "use") {
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
  ui.toast(`${def ? def.name : slot.name} 준비 — 같은 숫자키로 사용`, 2400);
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
    if (player.battery >= B.max - 0.5) { ui.toast("손전등이 이미 새것과 같다", 1600); return; }
    player.battery = B.max;
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
  } else if (slot.id === "decoy") {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const x = player.x + fx * 4.5, z = player.z + fz * 4.5;
    spawnDecoy(x, z);
    inv.takeAt(i);
    noise.addImpulse(0.6, x, z, "throw");
    audio.blip(660, 0.12);
    ui.toast("소음장치 가동 — 괴물을 다른 곳으로 유인한다", 2200);
  } else if (def && def.kind === "note") {
    // 메모: 소모하지 않고 다시 읽는다
    game.notesRead[slot.id] = true;
    audio.blip(700, 0.1);
    ui.showNote(def);
    ui.toast(`읽음: ${def.name}`, 1600);
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

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.phase === "playing") {
    game.elapsed += dt;

    player.update(dt, input);
    input.jump = false; // 점프는 1프레임 펄스
    noise.update(dt);
    monster.update(dt, player);
    updateEffects(dt);

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
    const st = monster.state;
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

    // 공포도
    const dist = Math.hypot(monster.x - player.x, monster.z - player.z);
    const proximity = clamp(1 - dist / 26, 0, 1);
    const fearTarget = clamp(Math.max(proximity, noise.level * 0.5, monster.state === STATE.CHASE ? 0.7 : 0), 0, 1);
    fear = damp(fear, fearTarget, 2.2, dt);
    ui.setFear(fear);
    audio.setAmbientMood(fear);
    audio.heartbeat(fear, dt);

    // 괴물이 다가오면 조명이 '텔타'처럼 붉게 번져간다
    world.distress = (monster.state === STATE.CHASE || monster.state === STATE.ATTACK)
      ? { x: monster.x, z: monster.z }
      : null;

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
  }

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

  renderer.render(scene, camera);
}

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
window.__silence = { game, player, monster, noise, world, ui, settings, STATE, input, audio, renderer, camera, scene, THREE, DIFFICULTY, applyDifficulty, smokes, decoys };

loop();
