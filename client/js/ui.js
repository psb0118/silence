const $ = (s) => document.querySelector(s);

export class UI {
  constructor() {
    this.hud = $("#hud");
    this.noiseFill = $("#noise-fill");
    this.noisePct = $("#noise-pct");
    this.noiseWrap = $("#noise-wrap");
    this.staminaFill = $("#stamina-fill");
    this.batteryFill = $("#battery-fill");
    this.hpFill = $("#hp-fill");
    this.hpText = $("#hp-text");
    this.safeZoneChip = $("#safezone-status");
    this.safeZoneText = $("#safezone-text");
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
    this.invBar = $("#inventory-bar");
    this.invEmpty = $("#inv-empty");
    this.invDetail = $("#inv-detail");
    this.invDetailText = $("#inv-detail-text");
    this.noteModal = $("#note-modal");
    this.noteTitle = $("#note-title");
    this.noteBody = $("#note-body");
    this.keypadModal = $("#keypad-modal");
    this.keypadTitle = $("#keypad-title");
    this.keypadDisplay = $("#keypad-display");
    this.onKeypadKey = null;   // main에서 keypadPress로 설정
    this.minimap = $("#minimap");
    this.minimapCtx = this.minimap && this.minimap.getContext("2d");
    this.mapVisible = false;
    this._w = null; this._p = null; this._m = null;

    this.start = $("#start");
    this.pause = $("#pause");
    this.death = $("#death");
    this.win = $("#win");

    this._damageTimer = 0;
    this._micLabel = "확인 중…";
    this._micClass = "";
    this._detailT = null;
    this._noteT = null;
    if (this.noteModal) {
      this.noteModal.addEventListener("click", () => this.hideNote());
    }
    if (this.keypadModal) {
      this.keypadModal.querySelectorAll("#keypad-keys button").forEach((b) => {
        b.addEventListener("click", () => {
          if (this.onKeypadKey) this.onKeypadKey(b.dataset.k);
        });
      });
    }
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

  setBattery(ratio) {
    this.batteryFill.style.width = Math.round(Math.max(0, Math.min(1, ratio)) * 100) + "%";
    this.batteryFill.style.background = ratio < 0.22
      ? "linear-gradient(90deg,#8a3a3a,#e0604a)"
      : ratio < 0.5
        ? "linear-gradient(90deg,#8a7a3a,#f5d76e)"
        : "linear-gradient(90deg,#8a7a3a,#f5e06e)";
  }

  setHp(hp, maxHp) {
    if (!this.hpFill) return;
    const ratio = Math.max(0, Math.min(1, maxHp ? hp / maxHp : 0));
    this.hpFill.style.width = Math.round(ratio * 100) + "%";
    this.hpFill.style.background = hp <= 1
      ? "linear-gradient(90deg,#7a2a2a,#e04040)"
      : "linear-gradient(90deg,#8a3a50,#e06080)";
    if (this.hpText) this.hpText.textContent = `${hp}/${maxHp}`;
  }

  setSafeZone(inSafe, charging) {
    this.safeZoneChip.classList.toggle("hidden", !inSafe);
    this.safeZoneChip.classList.toggle("safe", inSafe);
    this.safeZoneText.textContent = inSafe ? (charging ? "충전 중" : "안전") : "밖";
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
    if (this.mapVisible) this._drawMinimap();
  }

  /* ---------- 미니맵 ---------- */
  attach(world, player, monster) {
    this._w = world; this._p = player; this._m = monster;
  }

  toggleMinimap(show) {
    this.mapVisible = show;
    if (this.minimap) this.minimap.classList.toggle("hidden", !show);
  }

  _drawMinimap() {
    const w = this._w, p = this._p, m = this._m, c = this.minimapCtx;
    if (!c || !this.minimap || !w || !p) return;
    const W = this.minimap.width, H = this.minimap.height, PAD = 14;
    // 확장된 시설 전체를 담는 경계 (게이트 북쪽 포함)
    const X0 = -70, X1 = 70, Z0 = -84, Z1 = 54;
    const sx = (W - PAD * 2) / (X1 - X0);
    const sy = (H - PAD * 2) / (Z1 - Z0);
    const mx = (x) => PAD + (x - X0) * sx;
    const mz = (z) => PAD + (z - Z0) * sy;

    // 배경
    c.fillStyle = "rgba(5,10,16,0.86)";
    c.fillRect(0, 0, W, H);
    c.strokeStyle = "#2a3f55"; c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, W - 1, H - 1);

    // 맵 구조만 표시: 외곽 마당 밴드 + 방 + 벽 + 플레이어
    // (아이템·미션·괴물·출구 등은 표시하지 않는다 — 명세: 자신의 모습과 맵의 구조만)

    // 시설 외곽(마당) 영역
    c.fillStyle = "rgba(50,70,92,0.14)";
    c.fillRect(mx(w.compound.OX0), mz(w.compound.OZ0),
      mx(w.compound.OX1) - mx(w.compound.OX0), mz(w.compound.OZ1) - mz(w.compound.OZ0));

    // 동서 복도 밴드 (개방 구역)
    c.fillStyle = "rgba(84,116,150,0.10)";
    c.fillRect(mx(w.compound.OX0), mz(-30), mx(w.compound.OX1) - mx(w.compound.OX0), mz(-26) - mz(-30));
    c.fillRect(mx(w.compound.OX0), mz(-4), mx(w.compound.OX1) - mx(w.compound.OX0), mz(0) - mz(-4));

    // 방
    if (w.rooms) for (const r of w.rooms) {
      const x0 = mx(r.x - r.w / 2), y0 = mz(r.z - r.d / 2);
      const x1 = mx(r.x + r.w / 2), y1 = mz(r.z + r.d / 2);
      c.fillStyle = "rgba(18,30,44,0.92)";
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = "#2b4258"; c.lineWidth = 1;
      c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    }

    // 벽
    c.strokeStyle = "#55758f"; c.lineWidth = 2; c.beginPath();
    if (w.walls) for (const wall of w.walls) {
      c.moveTo(mx(wall.x0), mz(wall.z0));
      c.lineTo(mx(wall.x1), mz(wall.z1));
    }
    c.stroke();

    // 플레이어 (전방 화살표)
    if (p) {
      const cxp = mx(p.x), czp = mz(p.z);
      const ax = cxp + Math.sin(p.yaw) * sx * 2.0;
      const az = czp - Math.cos(p.yaw) * sy * 2.0;
      c.strokeStyle = "#8fd8ff"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cxp, czp); c.lineTo(ax, az); c.stroke();
      c.fillStyle = "#8fd8ff";
      c.beginPath(); c.arc(cxp, czp, 3, 0, Math.PI * 2); c.fill();
    }

    // 북쪽 + 범례
    c.fillStyle = "#6b8ba6"; c.font = "9px sans-serif";
    c.fillText("N", mx(0) - 3, mz(w.compound.OZ0) - 5);
    c.fillStyle = "#4a6b86";
    c.fillText("M - 닫기", W - 58, H - 8);
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

    // 창백한 얼굴 (더 크게, 더 무너진 윤곽)
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.sin(Date.now() * 0.05) * 0.04);
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
      const rr = 1 + Math.sin(i * 2.7) * 0.09 + Math.sin(i * 5.1) * 0.045;
      const rx = 340 * rr;
      const ry = 450 * rr;
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

    // 눈 (텅 빈 검은 구멍 + 잔불 한 점)
    for (const ex of [-115, 115]) {
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(ex, -60, 84, 104, 0, 0, Math.PI * 2);
      ctx.fill();
      const ember = ctx.createRadialGradient(ex, -50, 2, ex, -50, 34);
      ember.addColorStop(0, "rgba(255,210,120,0.95)");
      ember.addColorStop(0.35, "rgba(255,90,30,0.7)");
      ember.addColorStop(1, "rgba(120,10,10,0)");
      ctx.fillStyle = ember;
      ctx.beginPath();
      ctx.arc(ex, -50, 34, 0, Math.PI * 2);
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

    // 벌어진 입 (붉게 달아오른 심연)
    const gap = 200;
    const mouthGlow = ctx.createRadialGradient(0, gap, 8, 0, gap, 190);
    mouthGlow.addColorStop(0, "#ff2a08");
    mouthGlow.addColorStop(0.55, "#5a0606");
    mouthGlow.addColorStop(1, "#000");
    ctx.fillStyle = mouthGlow;
    ctx.beginPath();
    ctx.ellipse(0, gap, 128, 188, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,60,20,0.8)";
    ctx.lineWidth = 6;
    ctx.stroke();
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
      const n = (Math.random() - 0.5) * 70;
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

  setInventory(inv, held) {
    if (!this.invBar) return;
    if (held !== undefined) this._held = held;
    if (this._held === undefined) this._held = -1;
    this.invBar.innerHTML = '';
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      const el = document.createElement('div');
      el.className = 'inv-slot' + (slot.count > 0 ? ' filled' : '');
      if (i === this._held && slot.count > 0) el.classList.add('held');
      if (slot.count > 0 && slot.id && slot.id.startsWith('key_')) {
        el.classList.add('key-slot');
        el.dataset.key = slot.id;
      }
      let html = '<span class="keynum">' + (i + 1) + '</span>';
      if (slot.count > 0) {
        html += '<span>' + slot.name + '</span><span class="count">' + slot.count + '</span>';
      }
      el.innerHTML = html;
      this.invBar.appendChild(el);
    }
  }

  /* 획득 직후 짧은 아이템 설명 (자동 소멸) */
  showItemDetail(def, ms = 3400) {
    if (!this.invDetail || !def) return;
    this.invDetailText.textContent = def.desc || def.name;
    this.invDetail.classList.remove('hidden');
    clearTimeout(this._detailT);
    this._detailT = setTimeout(() => this.invDetail.classList.add('hidden'), ms);
  }

  hideInvDetail() {
    if (this.invDetail) this.invDetail.classList.add('hidden');
    clearTimeout(this._detailT);
  }

  /* 메모/단서 — 클릭 또는 ESC로 닫기 */
  showNote(def) {
    if (!this.noteModal || !def) return;
    this.noteTitle.textContent = def.name;
    this.noteBody.textContent = def.text || def.desc || "";
    this.noteModal.classList.remove('hidden');
  }
  hideNote() {
    if (this.noteModal) this.noteModal.classList.add('hidden');
  }
  isNoteOpen() {
    return !!this.noteModal && !this.noteModal.classList.contains("hidden");
  }

  /* 비밀번호 키패드 */
  showKeypad(label) {
    if (!this.keypadModal) return;
    if (this.keypadTitle) this.keypadTitle.textContent = (label || "잠긴 문") + " — 비밀번호";
    this.keypadModal.classList.remove("hidden");
  }
  hideKeypad() {
    if (!this.keypadModal) return;
    this.keypadModal.classList.add("hidden");
    this.keypadModal.classList.remove("kp-error");
  }
  isKeypadOpen() {
    return !!this.keypadModal && !this.keypadModal.classList.contains("hidden");
  }
  keypadSet(buf) {
    if (!this.keypadDisplay) return;
    const chars = [];
    for (let i = 0; i < 4; i++) chars.push(i < buf.length ? buf[i] : "–");
    this.keypadDisplay.textContent = chars.join(" ");
    if (buf.length) this.keypadDisplay.classList.add("kp-filled");
    else this.keypadDisplay.classList.remove("kp-filled");
  }
  keypadError() {
    if (!this.keypadModal) return;
    this.keypadModal.classList.remove("kp-error");
    // reflow로 애니메이션 재시작
    void this.keypadModal.offsetWidth;
    this.keypadModal.classList.add("kp-error");
    setTimeout(() => this.keypadModal && this.keypadModal.classList.remove("kp-error"), 500);
  }

  showInvEmpty(ms = 1200) {
    if (!this.invEmpty) return;
    this.invEmpty.classList.remove('hidden');
    clearTimeout(this._invT);
    this._invT = setTimeout(() => this.invEmpty.classList.add('hidden'), ms);
  }
}
