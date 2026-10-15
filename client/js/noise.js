import { CONFIG } from "./config.js";
import { clamp, damp } from "./util.js";

// 모든 소음원을 하나로 통합하는 시스템.
// - 연속 소음(이동)과 순간 소음(발소리/점프/착지/마이크)을 하나의 미터로 계산
// - 몬스터 AI가 소비할 소음 "이벤트"를 발행
export class NoiseSystem {
  constructor(audio) {
    this.audio = audio;
    this.movement = 0;      // 플레이어 이동 소음 (0..1)
    this.micLevel = 0;      // 마이크 처리된 소음 (0..1)
    this.micRaw = 0;
    this.impulse = 0;       // 순간 소음 감쇠값
    this.level = 0;         // 최종 미터 값 (0..1)
    this.events = [];       // {id, time, x, z, intensity, source}
    this._id = 0;
    this.loudCount = 0;
    this._prevMic = 0;
    this._micEventTimer = 0;
    this._moveEventTimer = 0;
    this._micEventX = 0;
    this._micEventZ = 0;

    // 마이크 상태
    this.micState = "off";  // off | pending | active | denied | unsupported | none | busy | error
    this.micStream = null;
    this.micSource = null;
    this.micAnalyser = null;
    this._micBuf = null;
    this.micEnabled = true; // 사용자 설정 (허용 시)
    this.micSensitivity = 1.0;
  }

  /* ---------- 소음 발생 ---------- */
  setMovement(level) {
    this.movement = clamp(level, 0, 1);
  }

  addStep(intensity, x, z, label, y = undefined) {
    this.impulse = Math.max(this.impulse, clamp(intensity, 0, 1));
    this._pushEvent(intensity, x, z, label, y);
  }

  addImpulse(intensity, x, z, source, y = undefined) {
    this.impulse = Math.max(this.impulse, clamp(intensity, 0, 1));
    this._pushEvent(intensity, x, z, source, y);
  }

  _pushEvent(intensity, x, z, source, y = undefined) {
    if (intensity >= 0.5) this.loudCount++;
    this.events.push({
      id: this._id++,
      time: performance.now() * 0.001,
      x, z,
      y,
      intensity: clamp(intensity, 0, 1),
      source
    });
    // 이벤트 큐 상한
    if (this.events.length > 64) this.events.shift();
  }

  /* ---------- 몬스터가 소비 ---------- */
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /* ---------- 프레임 업데이트 ---------- */
  update(dt) {
    // 순간 소음 감쇠
    this.impulse *= Math.exp(-CONFIG.noise.impulseDecay * dt);
    if (this.impulse < 0.001) this.impulse = 0;

    this._updateMic(dt);

    // 연속 이동 소음 → 괴물이 들을 수 있는 이벤트로 발행
    this._moveEventTimer -= dt;
    if (this.movement >= CONFIG.noise.moveEventThreshold && this._moveEventTimer <= 0) {
      this._moveEventTimer = CONFIG.noise.moveEventInterval;
      this._pushEvent(this.movement, this._micEventX, this._micEventZ, "move");
    }

    const continuous = Math.max(this.movement, this.micLevel);
    let target = Math.max(continuous, this.impulse);
    target = clamp(target, 0, 1);
    if (target < CONFIG.noise.meterFloor) target = 0;

    const rate = target > this.level ? CONFIG.noise.attack : CONFIG.noise.release;
    this.level = damp(this.level, target, rate, dt);
    if (this.level < CONFIG.noise.meterFloor) this.level = 0;
  }

  /* ---------- 마이크 ---------- */
  async attachMic() {
    if (!this.micEnabled) { this.micState = "off"; return; }
    if (this.micState === "active") return;
    // 권한 팝업을 무시하고 오래 방치하면 pending에 고착되므로, 8초가 지나면 재시도 허용
    if (this.micState === "pending") {
      if (this._micPendingAt && performance.now() - this._micPendingAt < 8000) return;
      this.micState = "off";
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.micState = "unsupported";
      return;
    }
    // 오디오가 아직 초기화되지 않았으면 여기서 만든다 (unsupported 오분류 방지)
    if (!this.audio.ctx) {
      try { this.audio.init(); } catch (e) {}
      try { this.audio.resume(); } catch (e) {}
      if (!this.audio.ctx) { this.micState = "unsupported"; return; }
    } else {
      try { this.audio.resume(); } catch (e) {}
    }

    this.micState = "pending";
    this._micPendingAt = performance.now();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      this.micStream = stream;
      this.micSource = this.audio.ctx.createMediaStreamSource(stream);
      this.micAnalyser = this.audio.ctx.createAnalyser();
      this.micAnalyser.fftSize = 1024;
      this.micAnalyser.smoothingTimeConstant = 0.5;
      this.micSource.connect(this.micAnalyser);
      this._micBuf = new Float32Array(this.micAnalyser.fftSize);
      this.micState = "active";
      this._micPendingAt = 0;
    } catch (err) {
      const n = err && err.name;
      this.micState = n === "NotAllowedError" ? "denied"
        : n === "NotFoundError" || n === "DevicesNotFoundError" ? "none"
        : n === "NotReadableError" || n === "TrackStartError" ? "busy"
        : "error";
      this.micStream = null;
      this._micPendingAt = 0;
    }
  }

  toggleMic() {
    this.micEnabled = !this.micEnabled;
    if (!this.micEnabled) {
      this.stopMic();
      this.micState = "off";
    } else {
      try { this.audio.resume(); } catch (e) {}
      this.attachMic();
    }
    return this.micEnabled;
  }

  stopMic() {
    if (this.micAnalyser) { try { this.micAnalyser.disconnect(); } catch (e) {} }
    if (this.micSource) { try { this.micSource.disconnect(); } catch (e) {} }
    if (this.micStream) { this.micStream.getTracks().forEach((t) => t.stop()); }
    this.micAnalyser = null;
    this.micSource = null;
    this.micStream = null;
    this.micLevel = 0;
    // 상태 유지 (off)
  }

  setMicSensitivity(v) { this.micSensitivity = clamp(v, 0.2, 3); }

  _updateMic(dt) {
    if (this.micState !== "active" || !this.micAnalyser) {
      this.micLevel = damp(this.micLevel, 0, 6, dt);
      return;
    }
    const buf = this._micBuf;
    this.micAnalyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    this.micRaw = rms;

    const gate = CONFIG.mic.gate;
    let norm = rms < gate ? 0 : (rms - gate) / 0.25;
    norm = clamp(norm * this.micSensitivity, 0, 1);
    // 부드럽게 (flicker 방지)
    this.micLevel = damp(this.micLevel, norm, 1 / Math.max(CONFIG.mic.smooth, 0.02), dt);

    // 갑작스러운 큰 소리 → 즉시 스파이크
    if (this.micLevel - this._prevMic > 0.14) {
      this.impulse = Math.max(this.impulse, clamp(this.micLevel, 0, 1));
    }
    this._prevMic = this.micLevel;

    // 주기적으로 이벤트 발행 (몬스터 유인)
    this._micEventTimer -= dt;
    if (this.micLevel > 0.12 && this._micEventTimer <= 0) {
      this._micEventTimer = 0.16;
      this._pushEvent(this.micLevel, this._micEventX, this._micEventZ, "mic", this._micEventY);
    }
  }

  // 몬스터가 마이크 이벤트 위치로 쓸 현재 플레이어 위치를 주입
  setMicOrigin(x, z, y = undefined) { this._micEventX = x; this._micEventZ = z; this._micEventY = y; }
}
