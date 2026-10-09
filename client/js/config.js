export const CONFIG = {
  worldRadius: 64,
  eyeHeight: 1.68,
  crouchEye: 1.05,
  crouchLerp: 8,

  playerRadius: 0.42,
  walkSpeed: 3.6,
  sprintSpeed: 6.6,
  crouchSpeed: 1.7,
  accel: 16,
  friction: 13,
  airControl: 0.35,
  jumpVel: 6.3,
  gravity: 20,

  // 스태미나
  staminaMax: 5.0,
  staminaDrain: 1.0,
  staminaRegen: 0.62,
  staminaRegenDelay: 1.1,

  // 노이즈 세기 (0..1)
  noise: {
    crouch: 0.16,
    walk: 0.42,
    sprint: 0.92,
    jump: 0.38,
    landMin: 0.5,
    landMax: 1.0,
    mic: 1.0,
    stepImpulse: { crouch: 0.12, walk: 0.28, sprint: 0.55 },
    attack: 12,    // 소리 상승 속도 (초당 지수)
    release: 3.2,  // 소리 감쇠 속도
    impulseDecay: 2.6,
    meterFloor: 0.02
  },

  mic: {
    threshold: 0.055,    // 이 이하 배경음은 무시
    gate: 0.02,
    smooth: 0.12
  },

  // 몬스터
  monster: {
    roamSpeed: 1.9,
    investigateSpeed: 4.2,
    chaseSpeed: 9.2,
    searchSpeed: 2.6,
    turnLerp: 5.5,
    catchRadius: 1.35,
    senseRadius: 4.2,          // 조용해도 아주 가까우면 감지
    hearBase: 26,              // intensity=1 기준 청취 거리
    hearMinIntensity: 0.12,    // 이 이하 소리는 무시
    investigateTime: 7,
    searchTime: 11,
    searchRadius: 16,
    loseTime: 4.2,             // 추격 중 소리 끊기면 마지막 지점으로
    stuckTime: 1.1,
    repathInterval: 0.22
  },

  interaction: {
    pickupRange: 2.6,
    pickupTime: 1.1,
    gateRange: 3.2
  },

  // 유도(도움) 설정
  assist: {
    showNearestDistance: true,
    ambientScareMin: 26,   // 초
    ambientScareMax: 62
  }
};

export const QUALITY = {
  low:    { grass: 9000,  pixelRatio: 1.0, shadows: false, grassRadius: 46 },
  medium: { grass: 20000, pixelRatio: 1.25, shadows: true,  grassRadius: 56 },
  high:   { grass: 34000, pixelRatio: 1.75, shadows: true,  grassRadius: 66 }
};
