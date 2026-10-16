/* =========================================================
   모바일 터치 컨트롤
   - 왼쪽 절반: 가상 조이스틱 (이동 + 끝까지 밀면 전력질주)
     조이스틱에서 위로 휙 = 점프, 아래로 휙 = 앉기 토글
   - 오른쪽 절반: 드래그 (시점)
   - 버튼: E(현재 행동 표시) · F=사용 · 지도
   - 인벤토리 슬롯 탭 = 숫자키와 동일 (장착/사용)
   - 모바일 기기에서만 활성화된다. 포인터 잠금은 쓰지 않는다.
   ========================================================= */

export const touchState = { active: false };

export function isTouchDevice() {
  // 1) Chromium UA-CH 모바일 플래그 (가장 정확 — 터치스크린 노트북은 false)
  try {
    const uad = navigator.userAgentData;
    if (uad && typeof uad.mobile === "boolean") return uad.mobile;
  } catch (e) {}
  // 2) 고전 UA 판별 (Safari/Firefox용)
  try {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    // iPadOS (Macintosh로 위장 + 멀티터치)
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
    if (/iPad/i.test(ua)) return true;
  } catch (e) {}
  // 3) 최후 수단: 터치 있음 + coarse 전용 + 호버 불가 (마우스/트랙패드 있으면 제외)
  try {
    const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const hoverNone = window.matchMedia("(hover: none)").matches;
    return !!(touch && coarse && !fine && hoverNone);
  } catch (e) {}
  return false;
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
  let joySX = 0, joySY = 0, joyST = 0;   // 스와이프 판정용 시작점/시각
  let joyLX = 0, joyLY = 0, joyLT = 0;   // 마지막 이동점 (end 누락 대비 폴백)
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
    joySX = t.clientX; joySY = t.clientY; joyST = performance.now();
    setJoy(t.clientX - joyCX, t.clientY - joyCY);
  }, { passive: false });
  zoneL.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      setJoy(t.clientX - joyCX, t.clientY - joyCY);
      joyLX = t.clientX; joyLY = t.clientY; joyLT = performance.now();
    }
  }, { passive: false });
  // 조이스틱에서 휙 올리면 점프, 휙 내리면 앉기 토글 (빠르고 길게, 세로 위주)
  const swipeAt = (ex, ey) => {
    const dt = performance.now() - joyST;
    const dx = ex - joySX, dy = ey - joySY;
    if (dt < 350 && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (dy < 0) api.onSwipeJump();
      else api.onSwipeCrouch();
    }
  };
  const joyEnd = (e) => {
    if (joyId === null) return;
    let ex = null, ey = null;
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { ex = t.clientX; ey = t.clientY; break; }
    }
    if (ex !== null) { swipeAt(ex, ey); clearJoy(); return; }
    // 매칭 터치 없음: 다른 손가락이 떨어진 것이면 무시하고,
    // 리스트 자체가 비어 있으면(비정상) 스와이프 판정 후 리셋한다
    if (e.changedTouches.length === 0) {
      if (performance.now() - joyLT < 500) swipeAt(joyLX, joyLY);
      clearJoy();
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
    if (lookId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === lookId) { lookId = null; return; }
    }
    // 리스트가 비어 있으면 비정상 종료로 보고 해제한다
    if (e.changedTouches.length === 0) lookId = null;
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

// E 버튼 행동 표시 (상호작용 대상이 없으면 숨김 — 레이아웃 유지)
export function setTouchAction(text) {
  if (!touchState.active) return;
  const el = document.getElementById("touch-e");
  if (!el) return;
  if (!text) {
    el.style.visibility = "hidden";
    return;
  }
  el.style.visibility = "visible";
  if (el.textContent !== text) el.textContent = text;
}
