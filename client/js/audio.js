import { clamp } from "./util.js";

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.ambientGain = null;
    this.volume = 0.8;
    this.noiseBuffer = null;
    this._heart = 0;
    this._heartTimer = 0;
    this._started = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 1.0;
    this.sfx.connect(this.master);
    this.noiseBuffer = this._makeNoise(2.0);
    this._startWind();
    this._started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  _makeNoise(dur) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    s.loop = true;
    return s;
  }

  _env(gain, t0, peak, attack, decay, release = 0.05) {
    const g = gain.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    g.exponentialRampToValueAtTime(Math.max(peak * 0.3, 0.0002), t0 + attack + decay);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
  }

  /* ---------- 앰비언스 ---------- */
  _startWind() {
    const src = this._noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.Q.value = 0.7;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 60;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.05;
    src.connect(hp).connect(lp).connect(this.ambientGain).connect(this.master);
    src.start();

    // 느린 바람 세기 변화
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(this.ambientGain.gain);
    lfo.start();
  }

  setAmbientMood(fear) {
    if (!this.ambientGain) return;
    // 공포가 높을수록 바람이 조금 커지고 어두워짐
    this.ambientGain.gain.value = 0.045 + fear * 0.05;
  }

  /* ---------- 발소리 ---------- */
  footstep(state) {
    if (!this.ctx) return;
    const t = this.now + Math.random() * 0.005;
    const src = this._noiseSource();
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    const cfg = {
      crouch: { freq: 620, q: 0.8, gain: 0.10, decay: 0.06 },
      walk: { freq: 950, q: 1.0, gain: 0.22, decay: 0.07 },
      sprint: { freq: 1350, q: 1.1, gain: 0.36, decay: 0.08 }
    }[state] || { freq: 950, q: 1.0, gain: 0.22, decay: 0.07 };
    bp.frequency.value = cfg.freq * (0.92 + Math.random() * 0.16);
    bp.Q.value = cfg.q;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const g = this.ctx.createGain();
    this._env(g, t, cfg.gain, 0.004, cfg.decay, 0.03);
    src.connect(bp).connect(lp).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.35);
  }

  jump() {
    if (!this.ctx) return;
    const t = this.now;
    const src = this._noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    this._env(g, t, 0.12, 0.01, 0.09, 0.05);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.3);
  }

  land(intensity) {
    if (!this.ctx) return;
    const t = this.now;
    // 저음 쿵
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const og = this.ctx.createGain();
    this._env(og, t, 0.18 + intensity * 0.35, 0.005, 0.12, 0.08);
    osc.connect(og).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.4);
    // 잡음
    const src = this._noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const g = this.ctx.createGain();
    this._env(g, t, 0.10 + intensity * 0.2, 0.004, 0.08, 0.04);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.3);
  }

  /* ---------- 몬스터 ---------- */
  growl(proximity, pan, aggression) {
    if (!this.ctx) return;
    const t = this.now;
    const dur = 0.8 + Math.random() * 0.5;
    const base = 46 + Math.random() * 10 - aggression * 8;
    const o1 = this.ctx.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = base;
    const o2 = this.ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = base * 1.05;
    const vib = this.ctx.createOscillator(); vib.frequency.value = 5.5 + aggression * 4;
    const vibG = this.ctx.createGain(); vibG.gain.value = 5 + aggression * 6;
    vib.connect(vibG).connect(o1.frequency); vibG.connect(o2.frequency);

    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this._distCurve(8);
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700 + aggression * 500;
    const g = this.ctx.createGain();
    const pan_node = this.ctx.createStereoPanner(); pan_node.pan.value = clamp(pan, -1, 1);
    const vol = clamp(proximity, 0, 1) ** 1.6 * (0.35 + aggression * 0.4);
    this._env(g, t, vol, 0.15, dur, 0.3);
    o1.connect(shaper); o2.connect(shaper); shaper.connect(lp).connect(g).connect(pan_node).connect(this.sfx);
    o1.start(t); o2.start(t); vib.start(t);
    const end = t + 0.15 + dur + 0.3;
    o1.stop(end); o2.stop(end); vib.stop(end);
  }

  breathe(proximity, pan) {
    if (!this.ctx) return;
    const t = this.now;
    const src = this._noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 480; bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    this._env(g, t, clamp(proximity, 0, 1) ** 1.7 * 0.28, 0.12, 0.28, 0.25);
    src.connect(bp).connect(g).connect(p).connect(this.sfx);
    src.start(t); src.stop(t + 0.8);
  }

  // 무거운 발소리 (지면을 긁는 듯한 저음)
  monsterStep(intensity, pan, proximity) {
    if (!this.ctx) return;
    const t = this.now;
    const vol = clamp(proximity, 0, 1) ** 1.4 * (0.25 + intensity * 0.5);
    if (vol < 0.01) return;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    // 저음 쿵
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(88 + Math.random() * 18, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    const og = this.ctx.createGain();
    this._env(og, t, vol, 0.006, 0.1, 0.09);
    osc.connect(og).connect(p).connect(this.sfx);
    osc.start(t); osc.stop(t + 0.35);
    // 긁는 잡음
    const src = this._noiseSource();
    src.playbackRate.value = 0.55 + Math.random() * 0.2;
    const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 320 + Math.random() * 200; bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    this._env(g, t, vol * 0.7, 0.004, 0.11, 0.06);
    src.connect(bp).connect(g).connect(p).connect(this.sfx);
    src.start(t); src.stop(t + 0.3);
  }

  // 속삭임 — 거의 들리지 않을 듯한 음성 대역 잡음
  whisper(proximity, pan) {
    if (!this.ctx) return;
    const t = this.now;
    const vol = clamp(proximity, 0, 1) ** 1.8 * 0.12;
    if (vol < 0.004) return;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    const words = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < words; i++) {
      const st = t + i * (0.14 + Math.random() * 0.1);
      const src = this._noiseSource();
      src.playbackRate.value = 0.8 + Math.random() * 0.5;
      const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass";
      bp.frequency.value = 900 + Math.random() * 1200; bp.Q.value = 4 + Math.random() * 5;
      const g = this.ctx.createGain();
      this._env(g, st, vol, 0.03, 0.08 + Math.random() * 0.06, 0.06);
      src.connect(bp).connect(g).connect(p).connect(this.sfx);
      src.start(st); src.stop(st + 0.3);
    }
  }

  // 킁킁거리는 냄새 맡기
  sniff(proximity, pan) {
    if (!this.ctx) return;
    const t = this.now;
    const vol = clamp(proximity, 0, 1) ** 1.6 * 0.16;
    if (vol < 0.005) return;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    for (let i = 0; i < 2; i++) {
      const st = t + i * 0.13;
      const src = this._noiseSource();
      src.playbackRate.value = 1.1 + Math.random() * 0.3;
      const bp = this.ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 560; bp.Q.value = 1.2;
      const g = this.ctx.createGain();
      this._env(g, st, vol, 0.012, 0.05, 0.05);
      src.connect(bp).connect(g).connect(p).connect(this.sfx);
      src.start(st); src.stop(st + 0.22);
    }
  }

  // 공격 직전의 찢어지는 비명
  attackScreech() {
    if (!this.ctx) return;
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? "sawtooth" : "square";
      const f = 1100 + i * 480 + Math.random() * 240;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.4);
      const g = this.ctx.createGain();
      this._env(g, t, 0.2, 0.004, 0.34, 0.16);
      const shaper = this.ctx.createWaveShaper(); shaper.curve = this._distCurve(11);
      o.connect(shaper).connect(g).connect(this.sfx);
      o.start(t); o.stop(t + 0.9);
    }
    const src = this._noiseSource();
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 800;
    const g = this.ctx.createGain();
    this._env(g, t, 0.28, 0.003, 0.35, 0.2);
    src.connect(hp).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 1.0);
  }

  chaseStinger() {
    if (!this.ctx) return;
    const t = this.now;
    [180, 233, 190.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 1.1);
      const g = this.ctx.createGain();
      this._env(g, t + i * 0.02, 0.16, 0.02, 0.7, 0.4);
      const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
      o.connect(lp).connect(g).connect(this.sfx);
      o.start(t); o.stop(t + 1.6);
    });
  }

  screech(distanceFactor = 1) {
    if (!this.ctx) return;
    const t = this.now;
    const src = this._noiseSource();
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
    const g = this.ctx.createGain();
    this._env(g, t, 0.16 * distanceFactor, 0.01, 0.5, 0.2);
    src.connect(hp).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 1.0);
  }

  /* ---------- 심장 박동 ---------- */
  heartbeat(fear, dt) {
    if (!this.ctx) return;
    this._heartTimer -= dt;
    const interval = 1.05 - fear * 0.55;
    if (this._heartTimer <= 0) {
      this._heartTimer = interval;
      this._thump(this.now, 0.18 + fear * 0.4);
      this._thump(this.now + 0.14, 0.12 + fear * 0.28);
    }
  }

  _thump(t, vol) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const g = this.ctx.createGain();
    this._env(g, t, vol, 0.008, 0.1, 0.05);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + 0.3);
  }

  /* ---------- 점프스케어 ---------- */
  jumpscare() {
    if (!this.ctx) return;
    const t = this.now;
    // 찢어지는 비명
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator();
      o.type = i === 0 ? "sawtooth" : "square";
      const f = 900 + i * 370 + Math.random() * 200;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 0.55);
      const g = this.ctx.createGain();
      this._env(g, t, 0.22, 0.005, 0.45, 0.25);
      const shaper = this.ctx.createWaveShaper(); shaper.curve = this._distCurve(12);
      o.connect(shaper).connect(g).connect(this.master);
      o.start(t); o.stop(t + 1.1);
    }
    const src = this._noiseSource();
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
    const g = this.ctx.createGain();
    this._env(g, t, 0.35, 0.004, 0.5, 0.3);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 1.2);
  }

  blip(freq = 660, vol = 0.15) {
    if (!this.ctx) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    o.type = "triangle"; o.frequency.value = freq;
    const g = this.ctx.createGain();
    this._env(g, t, vol, 0.006, 0.12, 0.06);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + 0.3);
  }

  _distCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }
}
