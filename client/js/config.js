export const CONFIG = {
  worldRadius: 64,
  eyeHeight: 1.68,
  crouchEye: 1.05,
  hideEye: 1.18,
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

  // 스태미나 (달리기 시간 제한)
  stamina: {
    max: 6.0,
    drain: 1.0,        // 달리는 동안 초당 소모
    regen: 0.78,       // 회복 속도
    regenDelay: 1.0,   // 소모 후 회복 시작까지 지연
    minStart: 0.14,    // 이 비율 이하로는 달리기 시작 불가
    jumpCost: 0.35,    // 점프 소모
    low: 0.25          // 위험 표시 임계
  },

  // 손전등 배터리
  battery: {
    max: 100,
    drain: 1.5,        // 켜져 있을 때 초당 소모 (약 66초)
    charge: 24,        // 안전지대 충전 속도 (초당)
    minOn: 8,          // 이 이하로 떨어지면 다시 켤 수 없음
    low: 22            // 경고 임계
  },

  // 노이즈 세기 (0..1)
  noise: {
    crouch: 0.15,
    walk: 0.42,
    sprint: 0.95,
    jump: 0.38,
    landMin: 0.5,
    landMax: 1.0,
    mic: 1.0,
    stepImpulse: { crouch: 0.1, walk: 0.28, sprint: 0.58 },
    attack: 12,    // 소리 상승 속도 (초당 지수)
    release: 3.2,  // 소리 감쇠 속도
    impulseDecay: 2.6,
    meterFloor: 0.02,
    moveEventInterval: 0.30,   // 연속 이동 소음이 괴물에게 도달하는 주기
    moveEventThreshold: 0.22   // 이 이상의 이동 소음만 '들림' (앉기는 조용)
  },

  mic: {
    threshold: 0.055,
    gate: 0.02,
    smooth: 0.12
  },

  // 몬스터
  monster: {
    roamSpeed: 2.3,
    investigateSpeed: 4.6,
    stalkSpeed: 3.1,
    searchSpeed: 2.8,
    chaseSpeed: 6.1,       // 플레이어 달리기(6.6)의 약 92%
    attackSpeed: 8.8,      // 돌진(짧은 순간)
    turnLerp: 5.0,
    catchRadius: 1.5,

    senseRadius: 3.4,      // 조용해도 아주 가까우면 감지
    sightBase: 15,         // 기본 시야 거리
    sightChase: 19,        // 추격 중 시야
    sightFov: 0.72,        // 시야각(코사인 임계) — 정면 위주

    hearBase: 28,          // intensity=1 기준 청취 거리
    hearMinIntensity: 0.06,

    listenTime: 1.5,       // 소리 방향을 살피는 시간
    investigateTime: 8,
    stalkTime: 9,
    searchTime: 13,
    searchRadius: 18,
    loseTime: 3.6,
    suspicionTime: 12,     // 마지막 소음 기억 유지

    attackRange: 2.5,
    attackWindup: 0.5,     // 돌진 전 준비 동작
    attackTime: 2.2,       // 공격 상태 제한 시간
    recoverTime: 1.4,
    inspectRadius: 2.8,    // 은신처 조사 반경
    inspectTime: 2.2,      // 은신처 조사 시간

    stuckTime: 1.1,
    repathInterval: 0.30
  },

  interaction: {
    pickupRange: 2.6,
    pickupTime: 1.1,
    gateRange: 3.4,
    hideRange: 2.4,
    hideTime: 0.55,
    chargeRange: 3.0
  },

  // 안전지대 (시작 대피소)
  safeZone: {
    minX: -9.5, maxX: 9.5,
    minZ: 33.0, maxZ: 52.0
  },

  assist: {
    showNearestDistance: true,
    ambientScareMin: 24,
    ambientScareMax: 58
  }
};

export const QUALITY = {
  low:    { grass: 6000,  pixelRatio: 1.0, shadows: false, grassRadius: 42 },
  medium: { grass: 12000, pixelRatio: 1.0, shadows: true,  grassRadius: 50 },
  high:   { grass: 20000, pixelRatio: 1.5, shadows: true,  grassRadius: 58 }
};
