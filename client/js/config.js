export const CONFIG = {
  worldRadius: 100,   // 확장 시설 모서리(±66,-70)가 원 안에 들어오도록 여유
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

  // 손전등 배터리 (용량 20% 인상: 100 → 120)
  battery: {
    max: 120,
    drain: 1.5,        // 켜져 있을 때 초당 소모 (약 80초)
    charge: 24,        // 안전지대 충전 속도 (초당)
    minOn: 10,         // 이 이하로 떨어지면 다시 켤 수 없음
    low: 26            // 경고 임계
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

    hearBase: 22,          // intensity=1 기준 청취 거리 (거리 기반 감지)
    hearMinIntensity: 0.06,

    listenTime: 1.5,       // 소리 방향을 살피는 시간
    investigateTime: 8,
    stalkTime: 9,
    searchTime: 13,
    searchRadius: 18,
    loseTime: 6.5,        // 목격/소음 후 추격 유지 시간 (3.6은 눈길만 돌려도 추격이 즉시 끊겼음)
    suspicionTime: 12,     // 마지막 소음 기억 유지

    attackRange: 2.5,
    attackWindup: 0.5,     // 돌진 전 준비 동작
    attackTime: 2.2,       // 공격 상태 제한 시간
    recoverTime: 1.4,
    inspectRadius: 2.8,    // 은신처 조사 반경
    inspectTime: 2.2,      // 은신처 조사 시간

    stuckTime: 1.1,
    repathInterval: 0.30,
    repathIntervalChase: 0.15,   // 추격 중에는 더 자주 재경로 (walls·모서리에서 끊김 방지)
    roamMin: 6,           // 배회 목표 최소 거리 (활동 반경 하단)
    roamMax: 78,          // 배회 목표 최대 거리 (활동 반경 상단 — 확장된 시설 전체 순찰)

    blind: false,         // 악몽: 시각 인식 완전 차단 — 오직 소리로만 추적
    hideKnownChance: null, // 악몽: 들켜도 숨은 뒤 추적당할 확률 (null = 항상 추적)

    // "들킨 상태" 판정 — 직전 목격/소음 인지가 이 시간 이내이고(가장 최근 인지 지점이
    // 은신처와 가까우면) 은신해도 포기하지 않고 은신처를 뒤져 끝내 찾아낸다.
    hideKnowledgeTime: 2.5,   // 직전 인지 이후 이 시간이 지나면 "모르는 상태"
    hideKnowledgeDist: 5.0,   // 마지막 인지 지점 ↔ 은신처 거리 임계

    // 소리 → 즉시 추격 임계 (거리·세기 결합. 소리만으로는 자동 추격 X)
    loudIntensity: 0.6,
    loudScore: 0.34,
    loudDist: 7,
    // 은신처 발견/조사 확률
    inspectFindChance: 0.55,
    hideInspectChance: 0.45
  },

  // 전투/피격
  combat: {
    invulnTime: 2.2,     // 피격 후 무적 시간
    knockback: 8.5,      // 피격 시 넉백 속도
    knockbackUp: 3.2
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
  low:    { grass: 6000,  pixelRatio: 1.0, shadows: false, grassRadius: 66 },
  medium: { grass: 12000, pixelRatio: 1.0, shadows: true,  grassRadius: 74 },
  high:   { grass: 20000, pixelRatio: 1.5, shadows: true,  grassRadius: 82 }
};

// 난이도 프리셋 — startGame()에서 CONFIG.monster/stamina/battery/assist 를 덮어쓴다.
// 표기되지 않은 값은 config 기본값(=normal 체감)을 유지한다.
export const DIFFICULTY = {
  easy: {
    label: "쉬움",
    hpMax: 3,
    monster: {
      chaseSpeed: 5.0,
      investigateSpeed: 3.8,
      stalkSpeed: 2.5,
      searchSpeed: 2.3,
      sightBase: 11,
      sightChase: 14,
      hearBase: 16,
      senseRadius: 2.6,
      loseTime: 4.0,
      suspicionTime: 8,
      searchTime: 9,
      searchRadius: 14,
      attackWindup: 0.65,
      loudIntensity: 0.72,
      loudScore: 0.42,
      loudDist: 5,
      inspectFindChance: 0.35,
      hideInspectChance: 0.30
    },
    stamina: { drain: 0.8, regen: 1.0 },
    battery: { drain: 1.1 },
    assist: { ambientScareMin: 30, ambientScareMax: 70 }
  },
  normal: {
    label: "보통",
    hpMax: 2,
    monster: {},
    stamina: {},
    battery: {},
    assist: {}
  },
  hard: {
    label: "어려움",
    hpMax: 1,
    monster: {
      chaseSpeed: 6.5,
      investigateSpeed: 5.2,
      stalkSpeed: 3.6,
      searchSpeed: 3.2,
      sightBase: 18,
      sightChase: 23,
      hearBase: 28,
      senseRadius: 4.2,
      loseTime: 6.5,
      suspicionTime: 16,
      searchTime: 16,
      searchRadius: 22,
      attackWindup: 0.4,
      loudIntensity: 0.5,
      loudScore: 0.28,
      loudDist: 9,
      inspectFindChance: 0.75,
      hideInspectChance: 0.60
    },
    stamina: { drain: 1.2, regen: 0.65 },
    battery: { drain: 1.9 },
    assist: { ambientScareMin: 18, ambientScareMax: 40 }
  },
  nightmare: {
    label: "악몽",
    hpMax: 1,
    monster: {
      // 활동 반경 대폭 확대 — 시설 전역을 멀리서부터 배회
      roamMin: 20,
      roamMax: 86,
      chaseSpeed: 7.0,
      investigateSpeed: 5.6,
      stalkSpeed: 4.0,
      searchSpeed: 3.6,
      // 눈을 뜨지 않는다 — 오직 소리로만 추적 (근접 감지도 꺼짐)
      blind: true,
      senseRadius: 0,
      sightBase: 22,
      sightChase: 27,
      hearBase: 46,        // 걸음(0.42)도 약 19m까지 들림
      loseTime: 7.0,
      suspicionTime: 20,
      searchTime: 20,
      searchRadius: 26,
      attackWindup: 0.32,
      loudIntensity: 0.4,
      loudScore: 0.24,
      loudDist: 11,
      // 숨는 순간을 절대 놓치지 않는다 — 은신은 거의 의미 없음
      hideKnowledgeTime: 9999,
      hideKnowledgeDist: 9999,
      hideKnownChance: 0.5, // 단, 들켜도 숨은 뒤 50% 확률로 놓친다
      inspectFindChance: 1.0,
      hideInspectChance: 1.0
    },
    noise: { moveEventThreshold: 0.14, moveEventInterval: 0.22 }, // 앉아서 걸어도 감지
    stamina: { drain: 1.3, regen: 0.6 },
    battery: { drain: 2.2 },
    assist: { ambientScareMin: 14, ambientScareMax: 30 }
  }
};
