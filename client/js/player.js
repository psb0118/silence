import * as THREE from "three";
import { CONFIG } from "./config.js";
import { clamp, damp, lerp } from "./util.js";

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

    this.eyeHeight = CONFIG.eyeHeight;
    this.stamina = CONFIG.staminaMax;
    this._regenDelay = 0;

    this.bobPhase = 0;
    this._lastStepPhase = 0;
    this._cameraShake = 0;

    this.moveSpeedActual = 0;

    this.camera.rotation.order = "YXZ";
    this._buildFlashlight();
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

    this.spot = new THREE.SpotLight(0xfff2d6, 0.0, 55, 0.5, 0.45, 1.15);
    this.spot.position.set(0, 0, 0);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = 55;
    this.spot.shadow.bias = -0.0006;
    this.spot.shadow.bias = -0.0012;
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 0, -1);
    this.camera.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    this.camera.add(this.spot);

    this.flashOn = true;
    this.setFlashlight(true);
  }

  setFlashlight(on) {
    this.flashOn = on;
    this._flashTarget = on ? 380.0 : 0.0;
    this.lens.material.color.setHex(on ? 0xfff2c4 : 0x2a2a24);
  }

  toggleFlashlight() {
    this.setFlashlight(!this.flashOn);
    this.audio.blip(this.flashOn ? 880 : 520, 0.1);
    return this.flashOn;
  }

  look(dx, dy) {
    const invert = this.settings.invertY ? -1 : 1;
    this.yaw -= dx;
    this.pitch -= dy * invert;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
  }

  get position() { return this; }

  update(dt, input) {
    const w = this.world;

    // ---- 지상 여부 ----
    const groundY = w.heightAt(this.x, this.z);

    // ---- 상태 결정 (달리기/앉기 동시 불가) ----
    const movingInput = input.forward || input.back || input.left || input.right;
    this.crouching = !!input.crouch;
    const wantSprint = !!input.sprint && !this.crouching && movingInput && this.stamina > 0.06;
    this.sprinting = wantSprint;

    const baseSpeed = this.crouching
      ? CONFIG.crouchSpeed
      : this.sprinting
        ? CONFIG.sprintSpeed
        : CONFIG.walkSpeed;

    // ---- 이동 방향 ----
    let fx = 0, fz = 0;
    if (input.forward) fz -= 1;
    if (input.back) fz += 1;
    if (input.left) fx -= 1;
    if (input.right) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // yaw 기준 로컬→월드 (W=정면, A=좌, S=뒤, D=우)
    const wishX = fx * cos + fz * sin;
    const wishZ = -fx * sin + fz * cos;

    const control = this.onGround ? 1 : CONFIG.airControl;
    const accel = CONFIG.accel * control;
    this.vx += wishX * baseSpeed * accel * dt;
    this.vz += wishZ * baseSpeed * accel * dt;

    // 마찰
    if (len === 0 || !this.onGround) {
      const fr = this.onGround ? CONFIG.friction : CONFIG.friction * 0.4;
      const f = Math.exp(-fr * dt);
      this.vx *= f; this.vz *= f;
    }

    // 최대 속도 제한
    const hs = Math.hypot(this.vx, this.vz);
    const maxS = this.onGround ? baseSpeed * 1.1 : baseSpeed;
    if (hs > maxS) { this.vx = (this.vx / hs) * maxS; this.vz = (this.vz / hs) * maxS; }

    // ---- 점프 ----
    if (input.jump && this.onGround) {
      this.vy = CONFIG.jumpVel;
      this.onGround = false;
      this.wasAirborne = true;
      if (!this.crouching) {
        this.noise.addImpulse(CONFIG.noise.jump, this.x, this.z, "jump");
        this.audio.jump();
      }
    }

    // ---- 중력 / 적분 ----
    this.vy -= CONFIG.gravity * dt;
    const prevY = this.y;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;

    // ---- 충돌 ----
    const c = w.collide(this.x, this.z, CONFIG.playerRadius);
    this.x = c.x; this.z = c.z;

    // ---- 지면 ----
    const gY2 = w.heightAt(this.x, this.z);
    if (this.y <= gY2) {
      const impact = -this.vy;
      this.y = gY2;
      if (this.wasAirborne && impact > 1.5) {
        const intensity = clamp((impact - 2.0) / 7.0, 0, 1) * (CONFIG.noise.landMax - CONFIG.noise.landMin) + CONFIG.noise.landMin;
        this.noise.addImpulse(intensity, this.x, this.z, "land");
        this.audio.land(clamp(intensity, 0, 1));
        this._cameraShake = Math.min(0.5, intensity * 0.35);
      }
      this.vy = 0;
      this.onGround = true;
      this.wasAirborne = false;
    } else {
      this.onGround = false;
    }

    // ---- 스태미나 ----
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - CONFIG.staminaDrain * dt);
      this._regenDelay = CONFIG.staminaRegenDelay;
    } else {
      if (this._regenDelay > 0) this._regenDelay -= dt;
      else this.stamina = Math.min(CONFIG.staminaMax, this.stamina + CONFIG.staminaRegen * dt);
    }

    // ---- 실제 속도 ----
    this.moveSpeedActual = Math.hypot(this.vx, this.vz);

    // ---- 소음 (이동) ----
    let moveNoise = 0;
    if (this.onGround && this.moveSpeedActual > 0.4) {
      const cfgN = CONFIG.noise;
      if (this.crouching) moveNoise = cfgN.crouch;
      else if (this.sprinting) moveNoise = cfgN.sprint;
      else moveNoise = cfgN.walk;
      moveNoise *= clamp(this.moveSpeedActual / baseSpeed, 0.4, 1);
    }
    this.noise.setMovement(moveNoise);
    this.noise.setMicOrigin(this.x, this.z);

    // ---- 발소리 (보행 위상) ----
    if (this.onGround && this.moveSpeedActual > 0.5) {
      this.bobPhase += dt * this.moveSpeedActual * 1.7;
      const stepIndex = Math.floor(this.bobPhase / Math.PI);
      if (stepIndex !== this._lastStepPhase) {
        this._lastStepPhase = stepIndex;
        this._emitStep();
      }
    } else {
      // 멈추면 위상 정렬
      this.bobPhase = Math.round(this.bobPhase / Math.PI) * Math.PI;
      this._lastStepPhase = Math.floor(this.bobPhase / Math.PI);
    }

    // ---- 카메라 (눈높이 + 헤드밥) ----
    const targetEye = this.crouching ? CONFIG.crouchEye : CONFIG.eyeHeight;
    this.eyeHeight = damp(this.eyeHeight, targetEye, CONFIG.crouchLerp, dt);

    const bobAmp = this.crouching ? 0.012 : this.sprinting ? 0.055 : 0.032;
    const bobY = this.onGround && this.moveSpeedActual > 0.5 ? Math.sin(this.bobPhase * 2) * bobAmp : 0;
    const bobX = this.onGround && this.moveSpeedActual > 0.5 ? Math.cos(this.bobPhase) * bobAmp * 0.5 : 0;

    // 카메라 흔들림 (착지/피격)
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
    // 스트레이프 + 걸음에 따른 살짝 기울기
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetRoll = -strafe * 0.02 + (this.sprinting ? Math.sin(this.bobPhase) * 0.012 : 0);
    this.roll = damp(this.roll, targetRoll, 8, dt);
    this.camera.rotation.z = this.roll;

    // 손전등 부드럽게 on/off + 미세 흔들림
    const cur = this.spot.intensity;
    this.spot.intensity = damp(cur, this._flashTarget, 14, dt);
    if (this.flashHand) {
      this.flashHand.position.x = 0.26 + bobX * 0.4;
      this.flashHand.position.y = -0.24 + bobY * 0.5;
      this.flashHand.rotation.z = Math.sin(this.bobPhase) * 0.02;
    }
  }

  _emitStep() {
    const cfgN = CONFIG.noise;
    let label, intensity, imp;
    if (this.crouching) { label = "crouch"; intensity = cfgN.crouch; imp = cfgN.stepImpulse.crouch; }
    else if (this.sprinting) { label = "sprint"; intensity = cfgN.sprint; imp = cfgN.stepImpulse.sprint; }
    else { label = "walk"; intensity = cfgN.walk; imp = cfgN.stepImpulse.walk; }
    this.noise.addStep(imp, this.x, this.z, label);
    this.audio.footstep(label);
  }

  addCameraShake(v) { this._cameraShake = Math.max(this._cameraShake, v); }

  respawn() {
    this.x = this.world.spawn.x;
    this.z = this.world.spawn.z;
    this.y = this.world.heightAt(this.x, this.z);
    this.vx = this.vy = this.vz = 0;
    this.yaw = Math.PI;
    this.pitch = 0;
    this.crouching = false;
    this.sprinting = false;
    this.stamina = CONFIG.staminaMax;
    this.flashOn = true;
    this._flashTarget = 380.0;
    this.lens.material.color.setHex(0xfff2c4);
    this.camera.position.set(this.x, this.y + CONFIG.eyeHeight, this.z);
    this.camera.rotation.y = this.yaw;
    this.eyeHeight = CONFIG.eyeHeight;
  }
}
