import * as THREE from "three";
import { CONFIG, QUALITY } from "./config.js";
import { clamp, damp, formatTime, rand } from "./util.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { NoiseSystem } from "./noise.js";
import { AudioEngine } from "./audio.js";
import { Monster, STATE } from "./monster.js";
import { UI } from "./ui.js";

/* ================= 설정 ================= */
const settings = Object.assign(
  { sensitivity: 1, invertY: false, volume: 0.8, micSens: 1, quality: "low" },
  JSON.parse(localStorage.getItem("silence.settings") || "{}")
);
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
  lastMonsterState: STATE.ROAM
};
const FUSE_TOTAL = world.fuses.length;

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
    case "KeyM":
      if (down && !e.repeat && game.phase === "playing") toggleMic();
      break;
    case "KeyE":
      if (down && !e.repeat && game.phase === "playing" && player.hidden) {
        player.exitHide();
        ui.hideInteract();
      }
      break;
    case "Escape":
      if (game.phase === "playing") pause();
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
  if (!pointerLocked && game.phase === "playing") pause();
});

/* ================= 시작 / 일시정지 / 사망 ================= */
const startBtn = document.getElementById("btn-start");
const useMicCheckbox = document.getElementById("use-mic");

startBtn.addEventListener("click", () => {
  audio.init();
  audio.resume();
  audio.setVolume(settings.volume);
  noise.micEnabled = useMicCheckbox.checked;
  startGame();
});

function startGame() {
  game.phase = "playing";
  game.elapsed = 0;
  game.encounters = 0;
  game.exitPowered = false;
  game.collected = 0;
  game.batteryWarned = false;
  game.ambientTimer = rand(CONFIG.assist.ambientScareMin, CONFIG.assist.ambientScareMax);
  player.respawn();
  monster.reset();
  resetFuses();
  if (world.chargeStation) world.chargeStation.setActive(false);
  noise.level = 0;
  noise.impulse = 0;
  noise.events = [];
  ui.hide(ui.start);
  ui.hide(ui.pause);
  ui.hide(ui.death);
  ui.hide(ui.win);
  ui.setHudVisible(true);
  ui.setFlashlight(true);
  ui.setObjective("퓨즈를 찾아 전원을 복구하세요", 0, FUSE_TOTAL, null);
  ui.toast("숲이 너를 삼켰다. 조용히 움직여라.", 3200);
  if (noise.micEnabled) noise.attachMic();
  lockPointer();
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
  ui.show(ui.start);
});

function onCaught() {
  if (game.phase !== "playing") return;
  game.phase = "scaring";
  game.scareTimer = 0;
  unlockPointer();
  player.addCameraShake(1.0);
  ui.showJumpscare();
  audio.jumpscare();
  ui.flashDamage();
}

function finishScare() {
  game.phase = "dead";
  ui.hideJumpscare();
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
  document.getElementById("win-noise").textContent = noise.loudCount || noise._id || 0;
  ui.show(ui.win);
  ui.setHudVisible(false);
}

function toggleMic() {
  const on = noise.toggleMic();
  ui.setMic(noise.micState);
  ui.toast(on ? "마이크 켜짐 — 목소리가 괴물을 유인합니다" : "마이크 꺼짐", 2200);
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

  // 상호작용 대상 판정
  let target = null;
  let label = "";

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

  if (nearest && nd < CONFIG.interaction.pickupRange) { target = { type: "fuse", fuse: nearest }; label = "퓨즈 줍기"; }
  const gd = Math.hypot(world.exit.x - player.x, world.exit.z - player.z);
  if (game.exitPowered && gd < CONFIG.interaction.gateRange) { target = { type: "gate" }; label = "철문 열고 탈출"; }

  const holdingE = !!eKeyDown;
  if (target && holdingE) {
    if (!game.interactTarget || game.interactTarget.type !== target.type || game.interactTarget.fuse !== target.fuse || game.interactTarget.hide !== target.hide) {
      game.interactHold = 0;
    }
    game.interactTarget = target;
    const time = target.type === "fuse" ? CONFIG.interaction.pickupTime
      : target.type === "hide" ? CONFIG.interaction.hideTime
      : 1.4;
    game.interactHold += dt / time;
    if (game.interactHold >= 1) {
      if (target.type === "fuse") collectFuse(target.fuse);
      else if (target.type === "hide") { player.enterHide(target.hide); noise.drainEvents(); }
      else winGame();
      game.interactHold = 0;
      game.interactTarget = null;
    }
  } else {
    game.interactHold = 0;
    game.interactTarget = null;
  }

  if (target) ui.showInteract(label, game.interactHold);
  else ui.hideInteract();

  // 목표 텍스트
  if (game.exitPowered) {
    ui.setObjective("출구 철문으로 탈출하라", game.collected, FUSE_TOTAL, null);
  } else {
    ui.setObjective("퓨즈를 찾아 전원을 복구하세요", game.collected, FUSE_TOTAL, nearest ? nd : null);
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
    ui.toast("전원 복구! 남쪽 출구 철문이 열렸다.", 3600);
    ui.setObjective("출구 철문으로 탈출하라", game.collected, FUSE_TOTAL, null);
  } else {
    ui.toast(`퓨즈 ${game.collected}/${FUSE_TOTAL} 획득`, 1600);
  }
}

let eKeyDown = false;
document.addEventListener("keydown", (e) => { if (e.code === "KeyE") eKeyDown = true; });
document.addEventListener("keyup", (e) => { if (e.code === "KeyE") eKeyDown = false; });

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

    // 충전소 배터리 (안전지대에서만)
    const cs = world.chargeStation;
    player.charging = player.inSafeZone && !!cs &&
      Math.hypot(cs.x - player.x, cs.z - player.z) < CONFIG.interaction.chargeRange &&
      player.battery < CONFIG.battery.max;
    if (cs) cs.setActive(player.charging);
    if (player.batteryLow && !game.batteryWarned) {
      game.batteryWarned = true;
      ui.toast("배터리 부족 — 손전등이 곧 꺼집니다", 2600);
    }
    if (!player.batteryLow) game.batteryWarned = false;

    // 몬스터 조우 카운터
    if (monster.state === STATE.CHASE && game.lastMonsterState !== STATE.CHASE) game.encounters++;
    game.lastMonsterState = monster.state;

    updateObjectives(dt);

    // 공포도
    const dist = Math.hypot(monster.x - player.x, monster.z - player.z);
    const proximity = clamp(1 - dist / 26, 0, 1);
    const fearTarget = clamp(Math.max(proximity, noise.level * 0.5, monster.state === STATE.CHASE ? 0.7 : 0), 0, 1);
    fear = damp(fear, fearTarget, 2.2, dt);
    ui.setFear(fear);
    audio.setAmbientMood(fear);
    audio.heartbeat(fear, dt);

    // 경고 배너
    if (monster.state === STATE.CHASE && dist < 34) ui.setAlert("도망쳐 — 그것이 온다");
    else if (monster.state === STATE.INVESTIGATE && dist < 20) ui.setAlert("무언가 소리를 듣고 다가온다");
    else if (monster.state === STATE.SEARCH && dist < 14) ui.setAlert("그것이 주변을 뒤진다");
    else ui.setAlert(null);

    // 환경 공포
    game.ambientTimer -= dt;
    if (game.ambientTimer <= 0) {
      game.ambientTimer = rand(CONFIG.assist.ambientScareMin, CONFIG.assist.ambientScareMax);
      if (dist > 22) triggerAmbientScare();
    }
  } else {
    noise.update(dt);
    if (game.phase === "paused") {
      const d = Math.hypot(monster.x - player.x, monster.z - player.z);
      ui.setAlert(null);
    }
  }

  // 점프스케어 타이머
  if (game.phase === "scaring") {
    game.scareTimer += dt;
    player.addCameraShake(0.5);
    if (game.scareTimer > 1.15) finishScare();
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
    ui.setSafeZone(player.inSafeZone, player.charging);
    ui.setMic(noise.micState);
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

function syncSettingsUI() {
  setSens.value = settings.sensitivity;
  setSensVal.textContent = settings.sensitivity.toFixed(2) + "x";
  setInvy.checked = settings.invertY;
  setVol.value = settings.volume;
  setVolVal.textContent = Math.round(settings.volume * 100) + "%";
  setMicSens.value = settings.micSens;
  setMicSensVal.textContent = settings.micSens.toFixed(1) + "x";
  setQuality.value = settings.quality;
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

// 초기 상태
ui.setMic("off");
ui.setFlashlight(true);
ui.setHudVisible(false);

// 디버그/테스트용 훅
window.__silence = { game, player, monster, noise, world, ui, settings, STATE, input, audio, renderer, camera, scene, THREE };

loop();
