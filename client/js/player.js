import * as THREE from "three";
import { CONFIG } from "./config.js";
import { Inventory } from "./inventory.js";
import { damp, lerp, clamp } from "./util.js";

export class Player {
  constructor(camera, world, noise, audio, settings) {
    this.camera = camera;
    this.world = world;
    this.noise = noise;
    this.audio = audio;
    this.settings = settings;

    this.x = world.spawn.x;
    this.z = world.spawn.z;
    this.y = world.heightAt(this.x, this.z);
    this.vx = 0; this.vy = 0; this.vz = 0;

    this.yaw = Math.PI;
    this.pitch = 0;
    this.roll = 0;

    this.onGround = true;
    this.wasAirborne = false;
    this.crouching = false;
    this.sprinting = false;
    this.sprintBlocked = false;
    this.stunT = 0;        // 스턴(충격기/덫) — 이동·점프 불가
    this.sprintLockT = 0;  // 스턴 후 달리기 잠금 (덫)

    this.eyeHeight = CONFIG.eyeHeight;
    this.stamina = CONFIG.stamina.max;
    this._regenDelay = 0;
    this._wasSprinting = false;

    this.battery = CONFIG.battery.max;
    this.charging = false;
    this.flashDead = false;   // 악몽: 배터리 완전 소진 → 손전등 영구 고장

    this.maxHp = 2;
    this.hp = 2;
    this.invuln = 0;

    this.hidden = false;
    this.hideSpot = null;
    this._enterHideT = 0;

    this.bobPhase = 0;
    this._lastStepPhase = 0;
    this._cameraShake = 0;
    this.moveSpeedActual = 0;
    this.inventory = new Inventory(9);

    this.camera.rotation.order = "YXZ";
    this._buildFlashlight();
    this._buildHeldItems();
    this.camera.position.set(this.x, this.y + this.eyeHeight, this.z);
    this.camera.rotation.y = this.yaw;
  }

  _buildFlashlight() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.6, metalness: 0.4 })
    );
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.05, 0.07, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.5, metalness: 0.5 })
    );
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.15;
    group.add(head);

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.062, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2c4 })
    );
    lens.position.z = -0.187;
    group.add(lens);
    this.lens = lens;

    group.position.set(0.26, -0.24, -0.42);
    group.rotation.y = -0.06;
    this.camera.add(group);
    this.flashHand = group;

    this.spot = new THREE.SpotLight(0xfff2d6, 0.0, 58, 0.5, 0.45, 1.15);
    this.spot.position.set(0, 0, 0);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(512, 512);
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = 58;
    this.spot.shadow.bias = -0.0012;
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 0, -1);
    this.camera.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    this.camera.add(this.spot);

    this.flashOn = true;
    this._flashTarget = 380.0;
    this.lens.material.color.setHex(0xfff2c4);

    // 볼륨 라이트 콘 (먼지 낀 빛기둥 느낌) — 손전등과 함께 켜지고 꺼진다
    const beamTex = (() => {
      const c = document.createElement("canvas");
      c.width = 4; c.height = 128;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, "rgba(255,244,214,0.85)");
      g.addColorStop(0.35, "rgba(255,244,214,0.28)");
      g.addColorStop(1, "rgba(255,244,214,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const beamLen = 7.5, beamRad = 2.1;
    const beamGeo = new THREE.ConeGeometry(beamRad, beamLen, 20, 1, true);
    beamGeo.rotateX(Math.PI / 2); // 꼭짓점이 카메라 쪽(+z)을 향하게
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTex, transparent: true, opacity: 0.10,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, fog: false
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 0, -beamLen / 2 - 0.15);
    beam.renderOrder = 5;
    this.camera.add(beam);
    this.beam = beam;
  }

  _updateBeam() {
    if (!this.beam) return;
    const k = this.spot.intensity / 380;
    this.beam.visible = k > 0.02;
    this.beam.material.opacity = 0.10 * k;
  }

  /* 손에 든 아이템 뷰모델 (숫자키로 꺼냈다가 같은 키로 사용) */
  _buildHeldItems() {
    const root = new THREE.Group();
    root.visible = false;

    const sleeve = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.30),
      new THREE.MeshStandardMaterial({ color: 0x363c44, roughness: 0.9 })
    );
    sleeve.rotation.x = -0.5;
    sleeve.position.z = 0.10;
    root.add(sleeve);

    const fist = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xb9a08a, roughness: 0.75 })
    );
    fist.scale.set(1, 0.85, 1.2);
    root.add(fist);

    const make = () => {
      const g = new THREE.Group();
      g.position.set(0, 0.05, -0.10);
      g.visible = false;
      root.add(g);
      return g;
    };

    // 예비 배터리
    const battery = make();
    battery.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.11, 12),
      new THREE.MeshStandardMaterial({ color: 0xf5d76e, roughness: 0.45, metalness: 0.35 })
    ));
    const bCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10),
      new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5, metalness: 0.6 })
    );
    bCap.position.y = 0.06;
    battery.add(bCap);
    battery.rotation.x = -0.6;

    // 구급상자 (붉은 십자)
    const medkit = make();
    medkit.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.095, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xdad4ca, roughness: 0.7 })
    ));
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const ch1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.005), crossMat);
    ch1.position.z = 0.033;
    const ch2 = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.07, 0.005), crossMat);
    ch2.position.z = 0.033;
    medkit.add(ch1, ch2);
    medkit.rotation.x = -0.35;

    // 연막탄
    const smoke = make();
    smoke.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.6, metalness: 0.3 })
    ));
    const sTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12),
      new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.55 })
    );
    sTop.position.y = 0.065;
    smoke.add(sTop);
    smoke.rotation.x = -0.5;

    // 소음장치
    const decoy = make();
    decoy.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.075, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xc9a0ff, roughness: 0.5, metalness: 0.2 })
    ));
    const spk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.01, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 })
    );
    spk.rotation.x = Math.PI / 2;
    spk.position.z = 0.027;
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 3 })
    );
    led.position.set(0.032, 0.024, 0.027);
    decoy.add(spk, led);
    decoy.rotation.x = -0.3;

    // 야전 손전등 (교체품)
    const flashlight = make();
    const fBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: 0x6d7a4f, roughness: 0.5, metalness: 0.4 })
    );
    flashlight.add(fBody);
    const fHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.024, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0x8c8f7a, roughness: 0.4, metalness: 0.55 })
    );
    fHead.position.y = 0.104;
    flashlight.add(fHead);
    const fLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.01, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe9a8, emissiveIntensity: 0.6 })
    );
    fLens.position.y = 0.13;
    flashlight.add(fLens);
    flashlight.rotation.x = -0.55;

    // 열쇠 (창고/저장소)
    const makeKey = (colorHex) => {
      const g = make();
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.012, 0.1),
        new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.7 })
      );
      g.add(shaft);
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.008, 0.018),
        new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.7 })
      );
      tooth.position.set(0.011, 0, -0.034);
      g.add(tooth);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.02, 0.005, 6, 14),
        new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.75 })
      );
      ring.position.z = 0.06;
      g.add(ring);
      g.rotation.x = -0.7;
      return g;
    };
    const key_shed = makeKey(0xd8b64a);      // 창고 열쇠 (금색)
    const key_store = makeKey(0x9fb8d8);     // 저장소 열쇠 (은색)

    // 메모/종이
    const makeNote = (tint) => {
      const g = make();
      const paper = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.14, 0.003),
        new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95 })
      );
      g.add(paper);
      g.rotation.set(-0.9, 0.1, 0.08);
      return g;
    };
    const note_shed = makeNote(0xe8e0cc);
    const note_power = makeNote(0xdcd6c2);

    // 덫 (배치용 스파이크 트랩)
    const trap = make();
    const trapPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.03, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x4b5158, roughness: 0.5, metalness: 0.55 })
    );
    trap.add(trapPlate);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.3, metalness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 5), spikeMat);
      sp.position.set(i < 2 ? -0.05 : 0.05, 0.04, i % 2 ? -0.05 : 0.05);
      trap.add(sp);
    }
    trap.rotation.x = -0.5;

    // 전기 충격기 (스턴 배턴)
    const stun = make();
    const baton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.022, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.5, metalness: 0.4 })
    );
    stun.add(baton);
    const batonHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.024, 0.05, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.6 })
    );
    batonHead.position.y = 0.12;
    stun.add(batonHead);
    const spark1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x54c8ff, emissiveIntensity: 2.4 })
    );
    spark1.position.set(0.012, 0.145, 0);
    const spark2 = spark1.clone();
    spark2.position.x = -0.012;
    stun.add(spark1, spark2);
    stun.rotation.x = -0.6;

    this.heldModels = { battery, medkit, smoke, decoy, flashlight, key_shed, key_store, note_shed, note_power, trap, stun };
    root.position.set(0.24, -0.26, -0.44);
    root.rotation.y = -0.05;
    this.camera.add(root);
    this.heldRoot = root;
    this.heldId = null;
  }

  // id 없이 호출하면 집어넣는다 (손전등 손 모델을 다시 표시)
  setHeldItem(id) {
    this.heldId = (id && this.heldModels && this.heldModels[id]) ? id : null;
    const holding = !!this.heldId;
    this.heldRoot.visible = holding;
    for (const k in this.heldModels) this.heldModels[k].visible = (k === this.heldId);
    if (this.flashHand) this.flashHand.visible = !holding;
    return holding;
  }

  setFlashlight(on) {
    if (on && (this.flashDead || this.battery < CONFIG.battery.minOn)) {
      this.flashOn = false;
      this._flashTarget = 0.0;
      this.lens.material.color.setHex(0x2a2a24);
      return false;
    }
    this.flashOn = on;
    this._flashTarget = on ? 380.0 : 0.0;
    this.lens.material.color.setHex(on ? 0xfff2c4 : 0x2a2a24);
    return true;
  }

  toggleFlashlight() {
    const turningOn = !this.flashOn;
    if (turningOn && this.flashDead) {
      this.audio.blip(140, 0.14);
      return { ok: false, reason: "dead" };
    }
    if (turningOn && this.battery < CONFIG.battery.minOn) {
      this.audio.blip(220, 0.12);
      return { ok: false, reason: "battery" };
    }
    this.setFlashlight(turningOn);
    this.audio.blip(this.flashOn ? 880 : 520, 0.1);
    return { ok: true };
  }

  /* ---------- 배터리 ---------- */
  updateBattery(dt) {
    const B = CONFIG.battery;
    if (this.charging) {
      this.battery = Math.min(B.max, this.battery + B.charge * dt);
    } else if (this.flashOn) {
      this.battery = Math.max(0, this.battery - B.drain * dt);
      if (this.battery <= 0) {
        this.setFlashlight(false);
        this.audio.blip(200, 0.14);
        // 악몽: 충전 불가 + 소진 = 영구 고장 (서랍의 야전 손전등 교체품으로만 회복)
        if (this.settings && this.settings.difficulty === "nightmare") this.flashDead = true;
      }
    }
  }

  get batteryLow() { return this.battery <= CONFIG.battery.low; }
  get inSafeZone() { return this.world.inSafeZone(this.x, this.z); }

  look(dx, dy) {
    const invert = this.settings.invertY ? -1 : 1;
    this.yaw -= dx;
    this.pitch -= dy * invert;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
  }

  get position() { return this; }

  update(dt, input) {
    const w = this.world;
    this.updateBattery(dt);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);
    if (this.sprintLockT > 0) this.sprintLockT = Math.max(0, this.sprintLockT - dt);

    if (this.hidden) { this._updateHidden(dt); return; }

    // 스턴 중: 모든 조작 무시 (카메라 시선은 마우스로 유지)
    const stunned = this.stunT > 0;
    if (stunned) {
      input = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false, jump: false };
      this._cameraShake = Math.max(this._cameraShake, 0.4);
    }

    const groundY = w.heightAt(this.x, this.z);

    const movingInput = input.forward || input.back || input.left || input.right;
    this.crouching = !!input.crouch;
    const S = CONFIG.stamina;
    const canStart = this.stamina >= S.minStart * S.max;
    const wantSprint = !!input.sprint && !this.crouching && movingInput && this.sprintLockT <= 0 &&
      (this.sprinting ? this.stamina > 0.02 : canStart);
    this.sprintBlocked = !!input.sprint && !this.crouching && movingInput && !wantSprint;
    this.sprinting = wantSprint;

    const baseSpeed = this.crouching
      ? CONFIG.crouchSpeed
      : this.sprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed;

    let fx = 0, fz = 0;
    if (input.forward) fz -= 1;
    if (input.back) fz += 1;
    if (input.left) fx -= 1;
    if (input.right) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wishX = fx * cos + fz * sin;
    const wishZ = -fx * sin + fz * cos;

    const control = this.onGround ? 1 : CONFIG.airControl;
    const accel = CONFIG.accel * control;
    this.vx += wishX * baseSpeed * accel * dt;
    this.vz += wishZ * baseSpeed * accel * dt;

    if (len === 0 || !this.onGround) {
      const fr = this.onGround ? CONFIG.friction : CONFIG.friction * 0.4;
      const f = Math.exp(-fr * dt);
      this.vx *= f; this.vz *= f;
    }

    const hs = Math.hypot(this.vx, this.vz);
    const maxS = this.onGround ? baseSpeed * 1.1 : baseSpeed;
    if (hs > maxS) { this.vx = (this.vx / hs) * maxS; this.vz = (this.vz / hs) * maxS; }

    if (input.jump && this.onGround) {
      this.vy = CONFIG.jumpVel;
      this.onGround = false;
      this.wasAirborne = true;
      this.stamina = Math.max(0, this.stamina - S.jumpCost);
      if (!this.crouching) {
        this.noise.addImpulse(CONFIG.noise.jump, this.x, this.z, "jump", this.y);
        this.audio.jump();
      }
    }

    this.vy -= CONFIG.gravity * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;

    const c = w.collide(this.x, this.z, CONFIG.playerRadius, this.y, 1.7);
    this.x = c.x; this.z = c.z;

    const gY2 = w.groundHeightAt(this.x, this.z, this.y);
    if (this.y <= gY2) {
      const impact = -this.vy;
      this.y = gY2;
      if (this.wasAirborne && impact > 1.5) {
        const intensity = clamp((impact - 2.0) / 7.0, 0, 1) * (CONFIG.noise.landMax - CONFIG.noise.landMin) + CONFIG.noise.landMin;
        this.noise.addImpulse(intensity, this.x, this.z, "land", this.y);
        this.audio.land(clamp(intensity, 0, 1));
        this._cameraShake = Math.min(0.5, intensity * 0.35);
      }
      this.vy = 0;
      this.onGround = true;
      this.wasAirborne = false;
    } else {
      this.onGround = false;
    }

    // 스태미나
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - S.drain * dt);
      this._regenDelay = S.regenDelay;
    } else {
      if (this._regenDelay > 0) this._regenDelay -= dt;
      else this.stamina = Math.min(S.max, this.stamina + S.regen * dt);
    }

    this.moveSpeedActual = Math.hypot(this.vx, this.vz);

    // 소음
    let moveNoise = 0;
    if (this.onGround && this.moveSpeedActual > 0.4) {
      const cfgN = CONFIG.noise;
      if (this.crouching) moveNoise = cfgN.crouch;
      else if (this.sprinting) moveNoise = cfgN.sprint;
      else moveNoise = cfgN.walk;
      moveNoise *= clamp(this.moveSpeedActual / baseSpeed, 0.4, 1);
    }
    this.noise.setMovement(moveNoise);
    this.noise.setMicOrigin(this.x, this.z, this.y);

    // 발소리
    if (this.onGround && this.moveSpeedActual > 0.5) {
      this.bobPhase += dt * this.moveSpeedActual * 1.7;
      const stepIndex = Math.floor(this.bobPhase / Math.PI);
      if (stepIndex !== this._lastStepPhase) {
        this._lastStepPhase = stepIndex;
        this._emitStep();
      }
    } else {
      this.bobPhase = Math.round(this.bobPhase / Math.PI) * Math.PI;
      this._lastStepPhase = Math.floor(this.bobPhase / Math.PI);
    }

    // 카메라
    const targetEye = this.crouching ? CONFIG.crouchEye : CONFIG.eyeHeight;
    this.eyeHeight = damp(this.eyeHeight, targetEye, CONFIG.crouchLerp, dt);

    const bobAmp = this.crouching ? 0.012 : this.sprinting ? 0.055 : 0.032;
    const bobY = this.onGround && this.moveSpeedActual > 0.5 ? Math.sin(this.bobPhase * 2) * bobAmp : 0;
    const bobX = this.onGround && this.moveSpeedActual > 0.5 ? Math.cos(this.bobPhase) * bobAmp * 0.5 : 0;

    this._cameraShake = damp(this._cameraShake, 0, 6, dt);
    const shakeX = (Math.random() - 0.5) * this._cameraShake;
    const shakeY = (Math.random() - 0.5) * this._cameraShake;

    this.camera.position.set(
      this.x + bobX + shakeX,
      this.y + this.eyeHeight + bobY + shakeY,
      this.z
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetRoll = -strafe * 0.02 + (this.sprinting ? Math.sin(this.bobPhase) * 0.012 : 0);
    this.roll = damp(this.roll, targetRoll, 8, dt);
    this.camera.rotation.z = this.roll;

    const cur = this.spot.intensity;
    this.spot.intensity = damp(cur, this._flashTarget, 14, dt);
    this._updateBeam();
    if (this.flashHand) {
      this.flashHand.position.x = 0.26 + bobX * 0.4;
      this.flashHand.position.y = -0.24 + bobY * 0.5;
      this.flashHand.rotation.z = Math.sin(this.bobPhase) * 0.02;
    }
    if (this.heldRoot && this.heldRoot.visible) {
      this.heldRoot.position.x = 0.24 + bobX * 0.4;
      this.heldRoot.position.y = -0.26 + bobY * 0.5;
      this.heldRoot.rotation.z = Math.sin(this.bobPhase) * 0.02;
    }
  }

  /* ---------- 은신 ---------- */
  enterHide(spot) {
    if (this.hidden) return false;
    this.hidden = true;
    this.hideSpot = spot;
    spot.occupied = true;
    this._enterHideT = 0;
    this.vx = this.vy = this.vz = 0;
    this.sprinting = false;
    this.crouching = false;
    this.noise.setMovement(0);
    this._lastStepPhase = 0;
    // 바라보는 방향으로 고정
    this.yaw = spot.yaw;
    this.pitch = 0;
    this.audio.blip(300, 0.1);
    return true;
  }

  exitHide() {
    if (!this.hidden) return;
    const spot = this.hideSpot;
    if (spot) spot.occupied = false;
    this.hidden = false;
    this.hideSpot = null;
    // 밖으로 안전하게 배치
    const fx = -Math.sin(spot.yaw), fz = -Math.cos(spot.yaw);
    let px = spot.x + fx * 1.0, pz = spot.z + fz * 1.0;
    const c = this.world.collide(px, pz, CONFIG.playerRadius, spot.y, 1.7);
    px = c.x; pz = c.z;
    this.x = px; this.z = pz;
    this.y = this.world.groundHeightAt(px, pz, spot.y);
    this.vx = this.vy = this.vz = 0;
    this.audio.blip(420, 0.1);
  }

  _updateHidden(dt) {
    this._enterHideT = Math.min(1, this._enterHideT + dt * 3);
    this.eyeHeight = damp(this.eyeHeight, this.hideSpot ? this.hideSpot.eye : CONFIG.hideEye, 8, dt);
    this.noise.setMovement(0);
    this.noise.setMicOrigin(this.x, this.z);

    const spot = this.hideSpot;
    const off = (spot.type === "locker" || spot.type === "cabinet") ? 0.34 : 0.06;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const bx = this.x + fx * off;
    const bz = this.z + fz * off;
    const breathe = Math.sin(this._enterHideT * 6) * 0.004;
    // 들어가는 동안 살짝 이동하는 느낌
    const slide = (1 - this._enterHideT) * 0.0;
    this.camera.position.set(bx, this.y + this.eyeHeight + breathe, bz);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = clamp(this.pitch, -0.7, 0.5);
    this.camera.rotation.z = breathe * 2;

    const cur = this.spot.intensity;
    this.spot.intensity = damp(cur, this._flashTarget, 14, dt);
    this._updateBeam();
    if (this.flashHand) { this.flashHand.position.set(0.26, -0.24, -0.42); }
    if (this.heldRoot) { this.heldRoot.position.set(0.24, -0.26, -0.44); }
  }

  _emitStep() {
    const cfgN = CONFIG.noise;
    let label, imp;
    if (this.crouching) { label = "crouch"; imp = cfgN.stepImpulse.crouch; }
    else if (this.sprinting) { label = "sprint"; imp = cfgN.stepImpulse.sprint; }
    else { label = "walk"; imp = cfgN.stepImpulse.walk; }
    this.noise.addStep(imp, this.x, this.z, label, this.y);
    this.audio.footstep(label);
  }

  addCameraShake(v) { this._cameraShake = Math.max(this._cameraShake, v); }

  /* ---------- 스턴 (충격기·덫) ---------- */
  stun(t) {
    this.stunT = Math.max(this.stunT, t);
    this.sprinting = false;
    this.vx *= 0.15; this.vz *= 0.15;
    this.noise.setMovement(0);
  }
  lockSprint(t) { this.sprintLockT = Math.max(this.sprintLockT, t); }
  get stunned() { return this.stunT > 0; }

  /* ---------- 피격 / 넉백 ---------- */
  setMaxHp(max) {
    this.maxHp = max;
    this.hp = max;
    this.invuln = 0;
  }

  // 넉백 방향·세기는 메인에서 계산해 넣는다 (vx/vz는 이미 충돌 해결된 상태)
  knockback(vx, vz, up = 0) {
    this.vx = vx; this.vz = vz; this.vy = Math.max(this.vy, up);
    this.onGround = false;
    this.wasAirborne = true;
  }

  takeDamage(amount = 1) {
    if (this.invuln > 0) return { ok: false, reason: "invuln" };
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = CONFIG.combat.invulnTime;
    return { ok: true, hp: this.hp, dead: this.hp <= 0 };
  }

  get hpLow() { return this.hp <= 1; }

  respawn() {
    this.x = this.world.spawn.x;
    this.z = this.world.spawn.z;
    this.y = this.world.heightAt(this.x, this.z);
    this.vx = this.vy = this.vz = 0;
    this.yaw = Math.PI;
    this.pitch = 0;
    this.crouching = false;
    this.sprinting = false;
    this.stunT = 0;
    this.sprintLockT = 0;
    this.hidden = false;
    if (this.hideSpot) { this.hideSpot.occupied = false; this.hideSpot = null; }
    this.stamina = CONFIG.stamina.max;
    this.battery = CONFIG.battery.max;
    this.charging = false;
    this.flashDead = false;
    this.hp = this.maxHp;
    this.invuln = 0;
    this.flashOn = true;
    this._flashTarget = 380.0;
    this.lens.material.color.setHex(0xfff2c4);
    this.setHeldItem(null);
    this.camera.position.set(this.x, this.y + CONFIG.eyeHeight, this.z);
    this.camera.rotation.y = this.yaw;
    this.eyeHeight = CONFIG.eyeHeight;
  }
}
