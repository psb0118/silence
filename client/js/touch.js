/* =========================================================
   모바일 터치 컨트롤
   - 왼쪽 절반: 가상 조이스틱 (이동 + 끝까지 밀면 전력질주)
   - 오른쪽 절반: 드래그 (시점)
   - 버튼: E(길게=홀드) · F(사용/손전등) · 지도 · 점프 · 앉기
   - 인벤토리 슬롯 탭 = 숫자키와 동일 (장착/사용)
   - 터치 기기에서만 활성화된다. 포인터 잠금은 쓰지 않는다.
   ========================================================= */

export const touchState = { active: false };

export function isTouchDevice() {
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  // 정밀 포인터(마우스)가 있으면 터치 UI를 켜지 않는다 (터치스크린 노트북 보호)
  const fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  return coarse && touch && !fine;
}

export function setupTouch(api) {
  // api: { input, settings, getPlayer, onE(down), onF, onMap, onJump, onCrouchToggle, onSlot(i), isPlaying }
  if (!isTouchDevice()) return false;
  touchState.active = true;
  window.__touchMode = true;
  document.body.classList.add("touch-mode");

  const pad = (el) => { if (el) el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false }); };

  /* ---------- 조이스틱 ---------- */
  const stick = document.getElementById("touch-stick");
  const nub = document.getElementById("touch-nub");
  const zoneL = document.getElementById("touch-left");
  let joyId = null, joyCX = 0, joyCY = 0;
  const JR = 52;

  const setJoy = (dx, dy) => {
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(1, Math.hypot(dx, dy) / JR);
    const nx = dx / len, ny = dy / len;
    nub.style.transform = `translate(${nx * JR * cl}px, ${ny * JR * cl}px)`;
    const dead = 0.22;
    const fx = cl < dead ? 0 : -ny, fz = cl < dead ? 0 : nx;
    api.input.forward = fx > 0.25;
    api.input.back = fx < -0.25;
    api.input.left = fz < -0.25;
    api.input.right = fz > 0.25;
    api.input.sprint = cl > 0.88;
  };
  const clearJoy = () => {
    joyId = null;
    nub.style.transform = "translate(0px,0px)";
    api.input.forward = api.input.back = api.input.left = api.input.right = false;
    api.input.sprint = false;
  };

  zoneL.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (joyId !== null) return;
    const t = e.changedTouches[0];
    joyId = t.identifier;
    const r = stick.getBoundingClientRect();
    joyCX = r.left + r.width / 2; joyCY = r.top + r.height / 2;
    setJoy(t.clientX - joyCX, t.clientY - joyCY);
  }, { passive: false });
  zoneL.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) setJoy(t.clientX - joyCX, t.clientY - joyCY);
    }
  }, { passive: false });
  const joyEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) clearJoy();
    }
  };
  zoneL.addEventListener("touchend", joyEnd);
  zoneL.addEventListener("touchcancel", joyEnd);

  /* ---------- 시점 드래그 ---------- */
  const zoneR = document.getElementById("touch-right");
  let lookId = null, lookX = 0, lookY = 0;
  zoneR.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
  }, { passive: false });
  zoneR.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      const s = 0.0042 * (api.settings.sensitivity || 1);
      const p = api.getPlayer();
      if (p && api.isPlaying()) p.look((t.clientX - lookX) * s, (t.clientY - lookY) * s);
      lookX = t.clientX; lookY = t.clientY;
    }
  }, { passive: false });
  const lookEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) lookId = null;
    }
  };
  zoneR.addEventListener("touchend", lookEnd);
  zoneR.addEventListener("touchcancel", lookEnd);

  /* ---------- 버튼 ---------- */
  const holdBtn = (id, down, up) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("touchstart", (e) => { e.preventDefault(); down(); }, { passive: false });
    const end = (e) => { e.preventDefault(); if (up) up(); };
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
  };
  holdBtn("touch-e", () => api.onE(true), () => api.onE(false));
  holdBtn("touch-f", () => api.onF(), null);
  holdBtn("touch-map", () => api.onMap(), null);
  holdBtn("touch-jump", () => api.onJump(), null);
  holdBtn("touch-crouch", () => api.onCrouchToggle(), null);

  /* ---------- 인벤토리 탭 = 숫자키 ---------- */
  const bar = document.getElementById("inventory-bar");
  if (bar) bar.addEventListener("click", (e) => {
    const slots = Array.from(bar.children);
    const idx = slots.indexOf(e.target.closest(".inv-slot"));
    if (idx >= 0) api.onSlot(idx);
  });

  // 기본 스크롤/줌 제스처 방지
  pad(document.getElementById("touch-ui"));
  return true;
}
