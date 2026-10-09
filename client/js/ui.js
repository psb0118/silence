const $ = (s) => document.querySelector(s);

export class UI {
  constructor() {
    this.hud = $("#hud");
    this.noiseFill = $("#noise-fill");
    this.noisePct = $("#noise-pct");
    this.noiseWrap = $("#noise-wrap");
    this.staminaFill = $("#stamina-fill");
    this.objMain = $("#obj-main");
    this.objSub = $("#obj-sub");
    this.fuseCount = $("#fuse-count");
    this.fuseTotal = $("#fuse-total");
    this.fuseDist = $("#fuse-dist");
    this.flashChip = $("#flashlight-status");
    this.flashText = $("#flash-text");
    this.micChip = $("#mic-status");
    this.micText = $("#mic-text");
    this.interact = $("#interact");
    this.interactText = $("#interact-text");
    this.interactFill = $("#interact-fill");
    this.alert = $("#alert-banner");
    this.damageFlash = $("#damage-flash");
    this.fearVignette = $("#fear-vignette");
    this.jumpscare = $("#jumpscare");
    this.scareCanvas = $("#scare-canvas");
    this.hintToast = $("#hint-toast");

    this.start = $("#start");
    this.pause = $("#pause");
    this.death = $("#death");
    this.win = $("#win");

    this._damageTimer = 0;
    this._micLabel = "확인 중…";
    this._micClass = "";
    this._drawScareFace();
  }

  show(el) { el?.classList.remove("hidden"); }
  hide(el) { el?.classList.add("hidden"); }

  setHudVisible(v) { this.hud.classList.toggle("hidden", !v); }

  /* ---------- 노이즈 미터 ---------- */
  setNoise(level) {
    const pct = Math.round(level * 100);
    this.noiseFill.style.width = pct + "%";
    this.noisePct.textContent = pct + "%";

    let grad;
    if (level < 0.3) grad = "linear-gradient(90deg,#41586a,#6ee7a8)";
    else if (level < 0.55) grad = "linear-gradient(90deg,#7a7a3a,#f5d76e)";
    else if (level < 0.78) grad = "linear-gradient(90deg,#9a6a2a,#f0954a)";
    else grad = "linear-gradient(90deg,#8a2b2b,#ef4444)";
    this.noiseFill.style.background = grad;

    if (level > 0.6) {
      const g = (level - 0.6) / 0.4;
      this.noiseFill.style.boxShadow = `0 0 ${8 + g * 16}px rgba(${level > 0.78 ? "239,68,68" : "240,149,74"},${0.4 + g * 0.5})`;
      this.noiseWrap.style.boxShadow = `0 6px 24px rgba(0,0,0,0.45), 0 0 ${10 + g * 18}px rgba(${level > 0.78 ? "239,68,68" : "240,149,74"},0.25)`;
    } else {
      this.noiseFill.style.boxShadow = "none";
      this.noiseWrap.style.boxShadow = "0 6px 24px rgba(0,0,0,0.45)";
    }
  }

  setStamina(ratio) {
    this.staminaFill.style.width = Math.round(ratio * 100) + "%";
    this.staminaFill.style.background = ratio < 0.25
      ? "linear-gradient(90deg,#7a3a3a,#d86a6a)"
      : "linear-gradient(90deg,#3f6b8a,#7fb2d8)";
  }

  setObjective(main, collected, total, nearestDist) {
    if (main) this.objMain.textContent = main;
    this.fuseCount.textContent = collected;
    this.fuseTotal.textContent = total;
    this.fuseDist.textContent = nearestDist == null ? "--" : Math.round(nearestDist);
  }

  setFlashlight(on) {
    this.flashChip.classList.toggle("on", on);
    this.flashChip.classList.toggle("off", !on);
    this.flashText.textContent = on ? "ON" : "OFF";
  }

  setMic(state) {
    const map = {
      off: ["OFF", "off"],
      pending: ["허용 대기…", "warn"],
      active: ["ON", "on"],
      denied: ["거부됨", "warn"],
      unsupported: ["지원 안 됨", "warn"],
      error: ["오류", "warn"]
    };
    const [label, cls] = map[state] || ["—", ""];
    this.micText.textContent = label;
    this.micChip.classList.remove("on", "off", "warn");
    if (cls) this.micChip.classList.add(cls);
  }

  /* ---------- 상호작용 ---------- */
  showInteract(text, progress = 0) {
    this.interact.classList.remove("hidden");
    if (text) this.interactText.textContent = text;
    this.interactFill.style.width = Math.round(progress * 100) + "%";
  }
  hideInteract() { this.interact.classList.add("hidden"); }

  /* ---------- 경고 ---------- */
  setAlert(text) {
    if (text) {
      this.alert.textContent = text;
      this.alert.classList.remove("hidden");
      this.alert.classList.add("show");
    } else {
      this.alert.classList.remove("show");
      this.alert.classList.add("hidden");
    }
  }

  /* ---------- 피해/공포 연출 ---------- */
  flashDamage() {
    this.damageFlash.style.opacity = "1";
    this._damageTimer = 0.35;
  }

  setFear(fear) {
    this.fearVignette.style.opacity = (fear * 0.9).toFixed(3);
  }

  update(dt) {
    if (this._damageTimer > 0) {
      this._damageTimer -= dt;
      if (this._damageTimer <= 0) this.damageFlash.style.opacity = "0";
    }
  }

  /* ---------- 점프스케어 ---------- */
  _drawScareFace() {
    const c = this.scareCanvas;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    // 배경
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
    bg.addColorStop(0, "#2a0202");
    bg.addColorStop(1, "#000");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 창백한 얼굴
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const faceGrad = ctx.createRadialGradient(0, -60, 30, 0, 0, 480);
    faceGrad.addColorStop(0, "#d9d2c8");
    faceGrad.addColorStop(0.7, "#8f867c");
    faceGrad.addColorStop(1, "#3a352f");
    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    // 불규칙한 얼굴 윤곽
    const pts = 40;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
      const rr = 1 + Math.sin(i * 2.7) * 0.06 + Math.sin(i * 5.1) * 0.03;
      const rx = 300 * rr;
      const ry = 400 * rr;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry - 40;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // 그림자/음영 크랙
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      let x = (Math.random() - 0.5) * 460;
      let y = (Math.random() - 0.5) * 640 - 40;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 70;
        y += (Math.random() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 눈 (텅 빈 검은 구멍 + 작은 흰 점)
    for (const ex of [-115, 115]) {
      ctx.fillStyle = "#050505";
      ctx.beginPath();
      ctx.ellipse(ex, -60, 78, 96, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(200,220,255,0.85)";
      ctx.beginPath();
      ctx.arc(ex + (ex < 0 ? 12 : -12), -50, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    // 눈 밑 검은 번짐
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    for (const ex of [-115, 115]) {
      ctx.beginPath();
      ctx.moveTo(ex - 40, 30);
      ctx.quadraticCurveTo(ex, 60, ex + 40, 30);
      ctx.quadraticCurveTo(ex, 90, ex - 40, 30);
      ctx.fill();
    }

    // 벌어진 입
    ctx.fillStyle = "#070000";
    ctx.beginPath();
    ctx.ellipse(0, 200, 120, 175, 0, 0, Math.PI * 2);
    ctx.fill();
    // 이빨
    ctx.fillStyle = "#c9c2b6";
    for (let i = -4; i <= 4; i++) {
      const tx = i * 24;
      const th = 30 + Math.random() * 26;
      ctx.beginPath();
      ctx.moveTo(tx - 10, 60);
      ctx.lineTo(tx + 10, 60);
      ctx.lineTo(tx, 60 + th);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - 10, 350);
      ctx.lineTo(tx + 10, 350);
      ctx.lineTo(tx, 350 - th);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 정적 노이즈
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 46;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  showJumpscare() {
    this._drawScareFace();
    this.jumpscare.classList.remove("hidden");
  }
  hideJumpscare() { this.jumpscare.classList.add("hidden"); }

  /* ---------- 토스트 ---------- */
  toast(text, ms = 2600) {
    this.hintToast.textContent = text;
    this.hintToast.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.hintToast.classList.remove("show"), ms);
  }
}
