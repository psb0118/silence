import * as THREE from "three";
import { CONFIG } from "./config.js";
import { clamp, damp, angleLerp, dist2, rand } from "./util.js";

const STATE = {
  ROAM: "ROAM", LISTEN: "LISTEN", INVESTIGATE: "INVESTIGATE",
  STALK: "STALK", SEARCH: "SEARCH", CHASE: "CHASE",
  ATTACK: "ATTACK", RECOVER: "RECOVER", AMBUSH: "AMBUSH"
};
export { STATE };

export class Monster {
  constructor(scene, world, audio, noise) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.noise = noise;

    this.radius = 0.5;
    this.x = 0;
    this.z = -2;
    this.y = world.heightAt(this.x, this.z);
    this.yaw = 0;
    this.animPhase = 0;
    this.time = 0;

    this.state = STATE.ROAM;
    this.stateTime = 0;
    this.lastKnown = { x: this.x, z: this.z };
    this.lastKnownValid = false;
    this.lastKnownTime = -1e9;
    this.lostTimer = 0;
    this.suspicion = 0;
    this.moveSpeedActual = 0;
    this.chasing = false;

    this._repathTimer = 0;
    this._path = [];
    this.target = { x: this.x, z: this.z };
    this._stuckTimer = 0;
    this._wanderBias = 0;
    this._idleTimer = 0;

    // 은신 관련
    this.seenHide = null;        // { spot, time } 목격한 은신처
    this.inspectSpot = null;     // 현재 조사 중인 은신처
    this._inspectTimer = 0;
    this.knownHide = null;       // "들킨 상태"의 은신처 — 반드시 뒤져 찾아낸다
    this.sawPlayerTime = -1e9;   // 플레이어를 실제로 목격한 시각

    // 매복(암부시)
    this._ambushSpot = null;
    this._ambushTimer = 0;
    this._ambushCooldown = 8;    // 게임 시작 직후에는 바로 매복하지 않음
    this._ambushRollT = 3;       // 수색 중 매복 재롤 간격
    this._lastCatchTime = -1e9;  // 처치 직후에는 매복하지 않고 사냥을 이어간다
    this.lurking = false;        // 매복 자세 (눈 dim + 웅크림)

    // 공격
    this._attackPhase = 0;
    this._caught = false;
    this._grace = 0;
    this.attackAnim = 0;

    // 스턴(충격기·덫) / 스턴 후 둔화(덫)
    this.stunT = 0;
    this.slowT = 0;

    // 사운드 타이머
    this._snd = { growl: rand(1, 3), breathe: rand(0.5, 2), whisper: rand(3, 8), step: 0, sniff: rand(2, 5) };

    this.onCatch = null;

    this.grid = new Grid(world, 1.8, this.radius + 0.2);
    this._buildModel();
    this._syncModel();
  }

  // 월드 구조(예: 잠긴 문 개방)가 바뀌면 경로 탐색 격자를 다시 만든다
  rebuildGrid() {
    this.grid = new Grid(this.world, 1.8, this.radius + 0.2);
    this._path = [];
    this._repathTimer = 0;
  }

  /* ================= 모델 ================= */
  _buildModel() {
    const root = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xadb3ba, roughness: 0.72, metalness: 0.02,
      emissive: 0x303642, emissiveIntensity: 1.35
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6, metalness: 0.2 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.4, metalness: 0.5 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x2a0606, emissive: 0x8a1508, emissiveIntensity: 1.6, roughness: 0.7 });
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xcfc7b6, roughness: 0.5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff7a45, emissive: 0xff2a10, emissiveIntensity: 4.4, roughness: 0.4 });

    const bone = (len, r1, r2, mat) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 6), mat);
      m.position.y = -len / 2;
      // 사지 뼈대는 그림자 생략 (캐스터 축소: chest/belly/skull만)
      m.castShadow = false; m.userData.castShadow = false;
      return m;
    };
    const joint = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // 몸통 (구부정한 자세)
    this.torso = new THREE.Group();
    this.torso.position.y = 1.5;
    this.torso.rotation.x = 0.42; // 앞으로 숙임
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.7, 8), skinMat);
    chest.position.y = 0.34; chest.castShadow = true; chest.userData.castShadow = true;
    this.torso.add(chest);
    const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.5, 8), skinMat);
    belly.position.y = -0.28; belly.castShadow = true; belly.userData.castShadow = true;
    this.torso.add(belly);
    // 갈비뼈 같은 능선
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.01, 0.02, 4, 8, Math.PI), darkMat);
      rib.rotation.z = Math.PI; rib.rotation.x = Math.PI / 2; rib.position.set(0, 0.5 - i * 0.16, 0.14);
      this.torso.add(rib);
    }

    // 목 + 머리 (긴 두개골, 이빨 많은 세로 입)
    this.neck = joint(this.torso, 0, 0.68, 0.02);
    const neckMesh = bone(0.34, 0.06, 0.08, skinMat);
    neckMesh.scale.y = 1; this.neck.add(neckMesh);

    this.head = joint(this.neck, 0, -0.34, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skinMat);
    skull.scale.set(0.8, 1.35, 1.0);
    skull.position.y = 0.16; skull.castShadow = true; skull.userData.castShadow = true;
    this.head.add(skull);
    // 턱뼈
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.2), skinMat);
    jaw.position.set(0, 0.05, 0.1);
    this.head.add(jaw);
    this.jaw = jaw;
    // 세로로 갈라진 입
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), mouthMat);
    mouth.position.set(0, 0.12, 0.16);
    this.head.add(mouth);
    // 끝이 갈라진 상아(위턱)
    for (let i = 0; i < 7; i++) {
      for (const s of [-1, 1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.09, 4), toothMat);
        tooth.position.set(s * 0.03, 0.03 + i * 0.032, 0.175);
        tooth.rotation.z = s * -0.5;
        this.head.add(tooth);
      }
    }
    // 아래턱의 끝이 갈라진 이빨 (위쪽으로 돋아남)
    for (let i = 0; i < 5; i++) {
      for (const s of [-1, 1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.07, 4), toothMat);
        tooth.position.set(s * 0.03, 0.0 - i * 0.024, 0.17);
        this.head.add(tooth);
      }
    }
    // 짧고 구부러진 뿔 (뒤로 젖힌)
    for (const hx of [-0.12, 0.12]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.18, 5), darkMat);
      horn.position.set(hx, 0.38, -0.01);
      horn.rotation.x = -0.5;
      horn.rotation.z = -hx * 10;
      this.head.add(horn);
      const nub = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), darkMat);
      nub.position.set(hx, 0.33, 0.05);
      this.head.add(nub);
    }
    // 눈썹 능선 — 깊은 잔불 위
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.035, 0.08), darkMat);
    brow.position.set(0, 0.26, 0.13);
    brow.rotation.x = -0.22;
    this.head.add(brow);
    // 깊은 눈구멍 속의 잔불
    for (const ex of [-0.07, 0.07]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), darkMat);
      socket.position.set(ex, 0.2, 0.12);
      this.head.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeMat);
      eye.position.set(ex, 0.2, 0.15);
      this.head.add(eye);
    }
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.72, fog: false
    }));
    eyeGlow.scale.set(0.6, 0.42, 1);
    eyeGlow.position.set(0, 0.2, 0.18);
    this.head.add(eyeGlow);
    this.eyeGlow = eyeGlow;
    this.eyeMat = eyeMat;
    this.eyeLight = new THREE.PointLight(0xff3a1e, 9, 14, 1.8);
    this.eyeLight.position.set(0, 0.2, 0.2);
    this.head.add(this.eyeLight);
    this.mouthMat = mouthMat;

    // 몸에서 피어오르는 어두운 안개 후광
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlow(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.14, fog: false,
      color: 0x55121f
    }));
    aura.scale.set(1.7, 1.4, 1);
    aura.position.set(0, 1.25, 0);
    root.add(aura);
    this.aura = aura;

    // 팔 (과도하게 긴, 손이 지면 근처까지)
    const makeArm = (side) => {
      const shoulder = joint(this.torso, 0.26 * side, 0.5, 0);
      shoulder.rotation.z = side * 0.18;
      shoulder.add(bone(0.72, 0.055, 0.05, skinMat));
      const elbow = joint(shoulder, 0, -0.72, 0);
      elbow.add(bone(0.66, 0.045, 0.035, skinMat));
      const wrist = joint(elbow, 0, -0.66, 0);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), skinMat);
      palm.position.y = -0.07; palm.castShadow = false; palm.userData.castShadow = false;
      wrist.add(palm);
      for (let i = 0; i < 4; i++) {
        const cl = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.2, 4), clawMat);
        cl.position.set(-0.045 + i * 0.03, -0.2, 0.02);
        cl.rotation.x = Math.PI;
        wrist.add(cl);
      }
      return { shoulder, elbow, wrist };
    };
    const aL = makeArm(-1), aR = makeArm(1);
    this.armL = aL.shoulder; this.elbowL = aL.elbow; this.handL = aL.wrist;
    this.armR = aR.shoulder; this.elbowR = aR.elbow; this.handR = aR.wrist;

    root.add(this.torso);

    // 다리 (역관절)
    const makeLeg = (side) => {
      const hip = joint(root, 0.16 * side, 1.42, 0);
      hip.add(bone(0.75, 0.075, 0.06, skinMat));
      const knee = joint(hip, 0, -0.75, 0);
      knee.rotation.x = -0.5; // 역관절
      knee.add(bone(0.7, 0.055, 0.045, skinMat));
      const ankle = joint(knee, 0, -0.7, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.3), darkMat);
      foot.position.set(0, -0.02, 0.08); foot.castShadow = false; foot.userData.castShadow = false;
      ankle.add(foot);
      for (let i = 0; i < 3; i++) {
        const cl = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.12, 4), clawMat);
        cl.position.set(-0.04 + i * 0.04, -0.02, 0.24); cl.rotation.x = Math.PI / 2;
        ankle.add(cl);
      }
      return { hip, knee, ankle };
    };
    const lL = makeLeg(-1), lR = makeLeg(1);
    this.legL = lL.hip; this.kneeL = lL.knee; this.ankleL = lL.ankle;
    this.legR = lR.hip; this.kneeR = lR.knee; this.ankleR = lR.ankle;

    this.group = root;
    this.scene.add(root);
    this._baseTorsoY = 1.5;
  }

  _syncModel() {
    this.group.position.set(this.x, this.world.heightAt(this.x, this.z), this.z);
    this.group.rotation.y = this.yaw;
  }

  /* ================= 상태 전환 ================= */
  _setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    const wasChase = prev === STATE.CHASE || prev === STATE.ATTACK;
    this.state = s;
    this.stateTime = 0;
    this._path = [];
    this._repathTimer = 0;
    if (s === STATE.CHASE && !wasChase) {
      this.chasing = true;
      this.audio.chaseStinger();
      this.audio.screech(0.9);
    }
    if (s === STATE.ATTACK) {
      this._attackPhase = 0;
      this._caught = false;
      this.audio.attackScreech();
    }
    if (s === STATE.SEARCH) { this._searchTarget = null; }
    if (s === STATE.AMBUSH) {
      // 매복 시작: 살짝 킁킁거려 근처 플레이어에게 공평한 단서를 준다
      try { this.audio.sniff(0.7, 0); } catch (e) {}
    }
    if (prev === STATE.AMBUSH && s !== STATE.AMBUSH) {
      // 매복 종료: 자세 복귀 + 다음 매복까지 쿨다운
      this.lurking = false;
      this._ambushSpot = null;
      this._ambushCooldown = CONFIG.monster.ambushCooldown ?? 25;
    }
    if (s !== STATE.CHASE && s !== STATE.ATTACK) this.chasing = false;
  }

  /* ================= 인지 ================= */
  _seen(player) {
    // 악몽: 눈을 뜨지 않는다 — 오직 소리로만 추적
    if (CONFIG.monster.blind) return false;
    // 안전 구역: 시각 인식 완전 차단
    if (player.inSafeZone) return false;
    if (player.hidden) return false;
    const d = Math.hypot(player.x - this.x, player.z - this.z);
    const chasing = this.state === STATE.CHASE || this.state === STATE.ATTACK;
    const sight = chasing ? CONFIG.monster.sightChase : CONFIG.monster.sightBase;
    if (d > sight) return false;
    // 시야각 (추격/공격 중에는 생략 — 고개를 돌렸다고 목표를 잃지 않는다.
    //  벽·연막 차단은 아래에서 계속 적용 → 커버로만 끊길 수 있다)
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const nx = (player.x - this.x) / (d || 1), nz = (player.z - this.z) / (d || 1);
    const facing = fx * nx + fz * nz;
    if (d > 3 && !chasing && facing < CONFIG.monster.sightFov) return false;
    if (this._smokeBlocks(this.x, this.z, player.x, player.z)) return false;
    return !this.world.lineBlocked(this.x, this.z, player.x, player.z);
  }

  // 벽+연막 없이 바로 보이는가 (근접 감지용)
  _clearLOS(x0, z0, x1, z1) {
    if (this._smokeBlocks(x0, z0, x1, z1)) return false;
    return !this.world.lineBlocked(x0, z0, x1, z1);
  }

  _inSmoke(x, z) {
    const smokes = this.world.smokes;
    if (!smokes || !smokes.length) return false;
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i];
      if (Math.hypot(x - s.x, z - s.z) < s.r) return true;
    }
    return false;
  }

  // 시선(괴물↔플레이어)이 연막 구름을 관통하면 시야 차단
  _smokeBlocks(x0, z0, x1, z1) {
    const smokes = this.world.smokes;
    if (!smokes || !smokes.length) return false;
    const dx = x1 - x0, dz = z1 - z0;
    const len2 = dx * dx + dz * dz || 1;
    for (const s of smokes) {
      let t = ((s.x - x0) * dx + (s.z - z0) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = x0 + dx * t, pz = z0 + dz * t;
      const dist = Math.hypot(s.x - px, s.z - pz);
      if (dist < s.r) return true;
    }
    return false;
  }

  // 비치명 피격 후: 추적자를 수색으로 돌려 플레이어가 도망칠 시간을 준다
  forceRecover() {
    this._caught = false;
    this._attackPhase = 0;
    this.lostTimer = 0;
    this.suspicion = Math.min(this.suspicion, 0.6);
    this._grace = 2.4; // 이 시간 동안은 목격/소음으로도 즉시 추격하지 않음
    this._setState(STATE.RECOVER);
  }

  // 거리 기반 청취: 세기가 클수록 멀리서 들리고, 가까울수록 작은 소리에도 반응한다.
  // 안전 구역에서 발생한 소음은 감지 대상에서 제외한다.
  // shared: 괴물 2마리가 같은 소음 이벤트를 함께 받도록 사전에 drain된 배열
  _consumeNoise(shared = null) {
    const evs = shared || this.noise.drainEvents();
    const cfg = CONFIG.monster;
    let best = null, bestScore = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.intensity < cfg.hearMinIntensity) continue;
      // 안전 구역 소음 무시
      if (this.world.inSafeZone(e.x, e.z)) continue;
      // 연막 소음 마스킹: 소음이 연막 안에서 났는데 괴물이 연막 밖이면 못 들음
      if (this._inSmoke(e.x, e.z) && !this._inSmoke(this.x, this.z)) continue;
      const d = Math.hypot(e.x - this.x, e.z - this.z);
      const range = cfg.hearBase * e.intensity;
      if (d > range) continue;
      // 벽/문 뒤면 감쇠 (완전 음향 시뮬레이션은 아님)
      // 옆 방 소리도 어느 정도는 듣는다 (0.45 → 0.6)
      let atten = 1;
      if (this.world.lineBlocked(this.x, this.z, e.x, e.z)) atten = 0.6;
      const score = e.intensity * (1 - d / range) * atten;
      if (score > bestScore) { bestScore = score; best = { e, d, score }; }
    }
    if (!best) return null;
    return best;
  }

  _reactToNoise(best) {
    const cfg = CONFIG.monster;
    // 조사 목표는 '소리가 난 지점' (플레이어가 이미 이동했을 수 있음)
    this.lastKnown = { x: best.e.x, z: best.e.z };
    this.lastKnownValid = true;
    this.lastKnownTime = this.time;
    this.lostTimer = 0;
    this.suspicion = clamp(this.suspicion + best.score * 0.9 + (best.e.intensity > 0.6 ? 0.3 : 0.08), 0, 1.4);

    // 은신 중 소음 → 의심
    const p = this._playerRef;
    if (p && p.hidden && !p.inSafeZone) {
      this.suspicion = clamp(this.suspicion + 0.5, 0, 1.6);
      if (!this.seenHide) this._assignNearestHide(p.x, p.z);
    }

    const st = this.state;
    if (st === STATE.CHASE || st === STATE.ATTACK) return;
    // 피격 직후 유예 시간: 즉시 추격하지 않고 수색으로 전환
    if (this._grace > 0) {
      if (st !== STATE.SEARCH) this._setState(STATE.SEARCH);
      this._searchTarget = { x: best.e.x, z: best.e.z };
      return;
    }
    // 소리만으로는 자동 추격하지 않는다.
    // 가까운 강한 소리 또는 매우 높은 점수(가까움×세기)일 때만 CHASE.
    const closeAndLoud = best.d < cfg.loudDist && best.e.intensity >= 0.45;
    const strongScore = best.score > cfg.loudScore;
    if (closeAndLoud || strongScore) {
      this._setState(STATE.CHASE);
    } else if (st === STATE.SEARCH) {
      this.inspectSpot = null;
      this._searchTarget = { x: best.e.x, z: best.e.z };
    } else if (st === STATE.AMBUSH) {
      // 매복 중 먼 곳에서 큰 소리가 나면 매복을 풀고 확인하러 간다
      if (best.d > 12) this._setState(STATE.INVESTIGATE);
    } else if (st === STATE.STALK) {
      // 스토킹 중에도 큰 소리가 나면 즉시 반응한다 (이전에는 무시됐다)
      if (best.score > 0.18) this._setState(STATE.INVESTIGATE);
    } else if ((st === STATE.ROAM || st === STATE.LISTEN) && best.score > 0.10) {
      this._setState(STATE.INVESTIGATE);
    } else if (st === STATE.INVESTIGATE && best.score > 0.18) {
      // 계속 시끄러우면 한 단계 격상한다
      this._setState(STATE.STALK);
    }
  }

  _assignNearestHide(x, z) {
    let best = null, bd = Infinity;
    for (const s of this.world.hidingSpots) {
      const d = dist2(s.x, s.z, x, z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) this.seenHide = { spot: best, time: this.time };
  }

  // 매복 시도: 마지막 인지 지점 근처 은신처에 숨어 기습을 노린다
  _maybeAmbush() {
    const cfg = CONFIG.monster;
    if (this._ambushCooldown > 0) return false;
    // 처치 직후 15초는 매복하지 않고 남은 생존자를 사냥한다
    if (this.time - this._lastCatchTime < 15) return false;
    if (!this.lastKnownValid) return false;
    if (this.suspicion < 0.25 || this.suspicion > 1.1) return false;
    if (Math.random() > (cfg.ambushChance ?? 0.35)) return false;
    const spots = this.world.hidingSpots;
    if (!spots || !spots.length) return false;
    let best = null, bd = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - this.lastKnown.x, s.z - this.lastKnown.z);
      if (d < (cfg.ambushMinD ?? 5) || d > (cfg.ambushMaxD ?? 18)) continue;
      if (this.world.inSafeZone(s.x, s.z)) continue;
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    this._ambushSpot = best;
    this._ambushTimer = 0;
    this._setState(STATE.AMBUSH);
    return true;
  }

  // 매복 기습: 가까이 온 플레이어에게 덮친다
  _pounce(player) {
    const cfg = CONFIG.monster;
    this.lastKnown = { x: player.x, z: player.z };
    this.lastKnownValid = true;
    this.lastKnownTime = this.time;
    this.sawPlayerTime = this.time;
    this.suspicion = 1.4;
    this.lostTimer = 0;
    this._setState(STATE.ATTACK);
    this._attackPhase = cfg.attackWindup * 0.4;
    try { this.audio.chaseStinger(); } catch (e) {}
    try { this.audio.screech(1); } catch (e) {}
  }

  // 은신 직전에 괴물이 플레이어의 위치를 파악하고 있었는가 → "들킨 상태"
  _hideKnowledge(player) {
    if (player.inSafeZone || !player.hideSpot) return false;
    const cfg = CONFIG.monster;
    // 방금 목격했으면 (숨은 지점과 무관하게) 무조건 인지 상태
    if (this.time - this.sawPlayerTime < cfg.hideKnowledgeTime) return true;
    // 최근 소음/목격 인지 지점이 은신처 근처면 그 자리를 쫓는 상태
    if (!this.lastKnownValid || this.time - this.lastKnownTime >= cfg.hideKnowledgeTime) return false;
    const d = Math.hypot(this.lastKnown.x - player.hideSpot.x, this.lastKnown.z - player.hideSpot.z);
    return d < cfg.hideKnowledgeDist;
  }

  /* ================= 업데이트 ================= */
  update(dt, player, sharedEvents = null) {
    if (this.ghost) { this._ghostUpdate(dt, player); return; }
    this.time += dt;
    this._playerRef = player;
    const cfg = CONFIG.monster;
    this._repathTimer -= dt;
    this.stateTime += dt;
    if (this._grace > 0) this._grace -= dt;
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dt);
    if (this._ambushCooldown > 0) this._ambushCooldown -= dt;

    // 스턴 중: AI·이동 정지 (어지러움 흔들림 + 연출만 유지)
    if (this.stunT > 0) {
      this.stunT = Math.max(0, this.stunT - dt);
      this._caught = false;
      this.moveSpeedActual = damp(this.moveSpeedActual, 0, 10, dt);
      this.yaw += Math.sin(this.time * 22) * 0.09;
      this._stuckTimer = 0;
      this._animate(dt, 0);
      this._syncModel();
      if (this.stunT <= 0) this._repathTimer = 0;
      return;
    }
    this.suspicion = clamp(this.suspicion - dt / cfg.suspicionTime, 0, 1.6);

    // 플레이어 은신 진입 판정
    // "들킨 상태"(목격/위치 인지 직후)였으면 → 은신처를 확실히 알고 끝까지 뒤져 찾는다.
    // 눈치채지 못하고 숨었으면 → knownHide가 비어 있어 조사해도 못 찾는다(못찾은 판정).
    if (player.hidden && (!this._wasHidden)) {
      let spot = this._hideKnowledge(player) ? player.hideSpot : null;
      // 악몽: 들켜도 숨은 뒤 확률적으로 놓친다 (hideKnownChance = 0.5 → 50:50)
      if (spot && cfg.hideKnownChance != null && Math.random() >= cfg.hideKnownChance) {
        spot = null;
      }
      this.knownHide = spot;
      if (this.knownHide) {
        const spot = player.hideSpot;
        this.seenHide = { spot, time: this.time };
        this.inspectSpot = null;
        this._inspectTimer = 0;
        this.lastKnown = { x: spot.x, z: spot.z };
        this.lastKnownValid = true;
        this.lastKnownTime = this.time;
        this.suspicion = 1.6;
        this.lostTimer = 0;
        if (this.state !== STATE.SEARCH) this._setState(STATE.SEARCH);
      }
    }
    this._wasHidden = player.hidden;
    if (!player.hidden && this.knownHide) this.knownHide = null;

    const playerSafe = player.inSafeZone;

    // 안전 구역 진입: 추격·공격 즉시 중단, 안전 구역 내부 lastKnown 무효화
    if (playerSafe && (this.state === STATE.CHASE || this.state === STATE.ATTACK)) {
      this._caught = false;
      this._attackPhase = 0;
      this.suspicion = Math.min(this.suspicion, 0.4);
      if (this.lastKnownValid && this.world.inSafeZone(this.lastKnown.x, this.lastKnown.z)) {
        this.lastKnownValid = false;
      }
      this._setState(STATE.SEARCH);
    }

    const hearBest = playerSafe ? null : this._consumeNoise(sharedEvents);
    const sees = playerSafe ? false : this._seen(player);
    const dToPlayer = Math.hypot(player.x - this.x, player.z - this.z);
    // 근접 감지: 벽/연막 뒤(다른 방)에서는 느끼지 못한다
    const veryClose = !player.hidden && !playerSafe && dToPlayer < cfg.senseRadius &&
      this._clearLOS(this.x, this.z, player.x, player.z);

    if (hearBest) this._reactToNoise(hearBest);

    // 직접 목격 (안전 구역에서는 절대 실행되지 않음)
    if (sees || veryClose) {
      this.lastKnown = { x: player.x, z: player.z };
      this.lastKnownValid = true;
      this.lastKnownTime = this.time;
      this.sawPlayerTime = this.time;
      this.lostTimer = 0;
      this.suspicion = 1.4;
      if (this._grace > 0) {
        if (this.state !== STATE.SEARCH) this._setState(STATE.SEARCH);
      } else if (this.state !== STATE.CHASE && this.state !== STATE.ATTACK) this._setState(STATE.CHASE);
    }

    let speed = cfg.roamSpeed;
    let moving = true;
    let faceTarget = null;

    switch (this.state) {
      case STATE.ROAM: {
        speed = cfg.roamSpeed;
        if (this._idleTimer > 0) {
          this._idleTimer -= dt;
          moving = false;
        } else if (!this._path.length && this._nearTarget()) {
          this._idleTimer = rand(0.8, 2.6);
          this._pickRoamTarget();
        } else if (!this._path.length) {
          this._pickRoamTarget();
        }
        // 약한 소음 → 방향 응시
        if (hearBest && hearBest.e.intensity < 0.5) { this._setState(STATE.LISTEN); }
        break;
      }
      case STATE.LISTEN: {
        speed = 0;
        this.target = { x: this.lastKnown.x, z: this.lastKnown.z };
        faceTarget = this.lastKnown;
        this._idleTimer = 0;
        if (this.stateTime > cfg.listenTime) {
          this._setState(this.suspicion > 0.7 ? STATE.STALK : STATE.INVESTIGATE);
        }
        break;
      }
      case STATE.INVESTIGATE: {
        speed = cfg.investigateSpeed;
        this.target = { x: this.lastKnown.x, z: this.lastKnown.z };
        if (this._nearTarget(1.8)) {
          faceTarget = this.lastKnown;
          if (this.stateTime > cfg.investigateTime) {
            this._setState(this.suspicion > 0.6 ? STATE.STALK : STATE.SEARCH);
          }
        }
        break;
      }
      case STATE.STALK: {
        speed = cfg.stalkSpeed;
        this.target = { x: this.lastKnown.x, z: this.lastKnown.z };
        if (sees) { this._setState(STATE.CHASE); }
        else if (this.stateTime > cfg.stalkTime) { this._setState(STATE.SEARCH); }
        break;
      }
      case STATE.SEARCH: {
        speed = cfg.searchSpeed;
        // 조사할 은신처가 있으면 그쪽으로 (알고 있는 은신처가 최우선)
        const insp = this.inspectSpot || this.knownHide ||
          (this.seenHide && (this.time - this.seenHide.time < 25) ? this.seenHide.spot : null);
        if (insp) {
          this.target = { x: insp.x, z: insp.z };
          if (Math.hypot(insp.x - this.x, insp.z - this.z) < cfg.inspectRadius) {
            moving = false;
            faceTarget = { x: insp.x, z: insp.z };
            this._inspectTimer += dt;
            if (this._inspectTimer > cfg.inspectTime) {
              this._resolveInspect(insp, player);
            }
          }
        } else {
          if (!this._searchTarget || this._nearTarget(1.8)) {
            // 새로 뒤질 곳을 정하기 전에 매복을 노려본다 (성공하면 이번 프레임은 여기서 끝)
            if (this._maybeAmbush()) break;
            this._pickSearchTarget();
            this._ambushRollT = 3;
          } else {
            // 수색이 길어지면 주기적으로 매복을 노려본다
            this._ambushRollT = (this._ambushRollT ?? 3) - dt;
            if (this._ambushRollT <= 0) {
              this._ambushRollT = 3;
              if (this._maybeAmbush()) break;
            }
          }
          this.target = this._searchTarget;
        }
        if (sees) { this._setState(STATE.CHASE); }
        else if (!this.knownHide && this.suspicion < 0.08 && this.stateTime > cfg.searchTime) {
          this._setState(STATE.ROAM);
          this.lastKnownValid = false;
          this.seenHide = null;
          this._pickRoamTarget();
        }
        break;
      }
      case STATE.AMBUSH: {
        speed = cfg.stalkSpeed;
        const spot = this._ambushSpot;
        if (!spot) { this._setState(STATE.SEARCH); break; }
        const dSpot = Math.hypot(spot.x - this.x, spot.z - this.z);
        if (!this.lurking) {
          // 매복 지점으로 조용히 이동
          this.target = { x: spot.x, z: spot.z };
          if (dSpot < 1.4) {
            this.lurking = true;
            this._ambushTimer = 0;
          }
        } else {
          // 웅크리고 대기 — 기습 타이밍을 노린다
          moving = false;
          this._ambushTimer += dt;
          faceTarget = { x: this.lastKnown.x, z: this.lastKnown.z };
          const dP = Math.hypot(player.x - this.x, player.z - this.z);
          const clearPounce = !player.hidden && !playerSafe &&
            dP < (cfg.ambushRadius ?? 6) &&
            !this.world.lineBlocked(this.x, this.z, player.x, player.z);
          if (clearPounce) {
            this._pounce(player);
            break;
          }
          if (this._ambushTimer > (cfg.ambushTime ?? 11) || playerSafe) {
            this._setState(STATE.SEARCH);
            break;
          }
        }
        if (sees) { this._setState(STATE.CHASE); }
        break;
      }
      case STATE.CHASE: {
        speed = cfg.chaseSpeed;
        this.target = { x: this.lastKnown.x, z: this.lastKnown.z };

        // 안전지대로 도망 → 경계에서 배회
        if (playerSafe) {
          this._lurkBoundary(dt, player);
          speed = cfg.stalkSpeed;
          this.target = this._boundaryTarget || this.target;
          break;
        }
        // 공격 가능?
        const clear = !player.hidden && !this.world.lineBlocked(this.x, this.z, player.x, player.z);
        if (dToPlayer < cfg.attackRange && clear && !playerSafe) {
          this._setState(STATE.ATTACK);
          break;
        }
        if (!sees && !veryClose && !hearBest) {
          this.lostTimer += dt;
          if (this.lostTimer > cfg.loseTime) this._setState(STATE.SEARCH);
        } else {
          this.lostTimer = 0;
        }
        break;
      }
      case STATE.ATTACK: {
        this._updateAttack(dt, player, dToPlayer, playerSafe);
        moving = false;
        faceTarget = { x: this.lastKnown.x, z: this.lastKnown.z };
        break;
      }
      case STATE.RECOVER: {
        speed = 0;
        faceTarget = this.lastKnownValid ? this.lastKnown : null;
        if (this.stateTime > cfg.recoverTime) {
          this._setState(sees ? STATE.CHASE : STATE.SEARCH);
        }
        break;
      }
    }

    // 안전지대 경계 상시 준수
    this.target = this._safeTarget(this.target);

    // 덫 스턴 후 둔화: 잠시 느리게 이동
    if (this.slowT > 0) speed *= 0.5;

    if (moving && this.state !== STATE.ATTACK) {
      if (this.state === STATE.CHASE ? true : this._hadTarget()) this._move(dt, speed);
      else { this.moveSpeedActual = damp(this.moveSpeedActual, 0, 8, dt); this._stuckTimer = 0; }
    } else if (this.state !== STATE.ATTACK) {
      this.moveSpeedActual = damp(this.moveSpeedActual, 0, 8, dt);
      this._stuckTimer = 0;
    }

    // 응시(고개 돌리기)
    if (faceTarget) {
      const desired = Math.atan2(-(faceTarget.x - this.x), -(faceTarget.z - this.z));
      this.yaw = angleLerp(this.yaw, desired, clamp(cfg.turnLerp * 0.6 * dt, 0, 1));
    }

    // 잡기 판정 (안전지대 밖, 은신 중 아닌 경우에만 즉시) — 벽 너머(다른 방)에서는 못 잡음
    if (!playerSafe && !player.hidden && !this._caught && dToPlayer < cfg.catchRadius &&
        !this.world.lineBlocked(this.x, this.z, player.x, player.z) && this.onCatch) {
      this._caught = true;
      this._lastCatchTime = this.time;
      this.onCatch();
    }

    const speed01 = clamp(this.moveSpeedActual / cfg.chaseSpeed, 0, 1);
    this._animate(dt, speed01);
    this._audio(dt, dToPlayer, player, speed01);
    this._syncModel();
  }

  /* 네트워크 고스트 — host가 보낸 스냅샷(netTarget/netState/stunT)만 반복한다.
     AI·경로탐색·포획 판정은 host 전용. 클라이언트는 여기서 애니메이션/오디오만 돌린다. */
  _ghostUpdate(dt, player) {
    this.time += dt;
    this._playerRef = player;
    const cfg = CONFIG.monster;
    const t = this.netTarget;
    if (t) {
      const k = Math.min(1, dt * 14);
      const dx = t.x - this.x, dz = t.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.002) {
        this.x += dx * k;
        this.z += dz * k;
        this.yaw = angleLerp(this.yaw, t.yaw, Math.min(1, dt * 8));
        this.moveSpeedActual = dist * k / Math.max(dt, 1e-4);
      } else {
        this.x = t.x; this.z = t.z;
        this.yaw = t.yaw;
        this.moveSpeedActual = damp(this.moveSpeedActual, 0, 8, dt);
      }
    } else {
      this.moveSpeedActual = damp(this.moveSpeedActual, 0, 8, dt);
    }

    if (this.state === STATE.ATTACK) this._attackPhase += dt;
    else this._attackPhase = 0;

    if (this.stunT > 0) {
      this.stunT = Math.max(0, this.stunT - dt);
      this.yaw += Math.sin(this.time * 22) * 0.09;
      this._animate(dt, 0);
      this._syncModel();
      return;
    }
    if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dt);

    const speed01 = clamp(this.moveSpeedActual / cfg.chaseSpeed, 0, 1);
    this._animate(dt, speed01);
    const dToPlayer = Math.hypot(player.x - this.x, player.z - this.z);
    this._audio(dt, dToPlayer, player, speed01);
    this._syncModel();
  }

  // host → client 상태 동기화 훅
  setNetTarget(x, z, yaw) {
    if (this.netTarget) { this.netTarget.x = x; this.netTarget.z = z; this.netTarget.yaw = yaw; }
    else this.netTarget = { x, z, yaw };
  }

  setNetState(s) { if (s && s !== this.state) this._setState(s); }

  _resolveInspect(spot, player) {
    const cfg = CONFIG.monster;
    this._inspectTimer = 0;
    const occupied = player.hidden && player.hideSpot === spot;
    // "들킨 상태"의 은신처 → 끝내 찾아내어 밖으로 끌어내고 공격
    if (occupied && this.knownHide === spot) {
      this.lastKnown = { x: spot.x, z: spot.z };
      this.lastKnownValid = true;
      this.lastKnownTime = this.time;
      if (this.seenHide && this.seenHide.spot === spot) this.seenHide = null;
      this.knownHide = null;
      player.exitHide();
      this._setState(STATE.ATTACK);
      this._attackPhase = cfg.attackWindup * 0.4;
      return;
    }
    // 못 찾은 판정 — 인지하지 못한 은신처는 확률 없이 그냥 비어 있는 셈이다
    if (!occupied && this.knownHide === spot) this.knownHide = null;
    if (this.seenHide && this.seenHide.spot === spot) this.seenHide = null;
    this.inspectSpot = null;
    this._pickSearchTarget();
  }

  _lurkBoundary(dt, player) {
    // 안전지대 경계 바깥에서 배회 + 위협적 소리
    const c = this.world.clampOutOfSafeZone(player.x, player.z, 3.0);
    const a = Math.atan2(c.z - player.z, c.x - player.x) + Math.sin(this.time * 0.7) * 0.6;
    if (!this._boundaryTarget || dist2(this._boundaryTarget.x, this._boundaryTarget.z, this.x, this.z) < 4 || this._repathTimer <= 0) {
      this._boundaryTarget = { x: c.x + Math.cos(a) * rand(2, 6), z: c.z + Math.sin(a) * rand(2, 6) };
    }
    this._boundaryTarget = this._safeTarget(this._boundaryTarget);
    if (this.stateTime > 6 && Math.random() < dt * 0.4) this._setState(STATE.SEARCH);
  }

  _updateAttack(dt, player, d, playerSafe) {
    const cfg = CONFIG.monster;
    this._attackPhase += dt;
    this.attackAnim = 1;
    if (this._attackPhase < cfg.attackWindup) {
      // 준비 (뒤로 젖힘)
      this.moveSpeedActual = 0;
    } else if (this._attackPhase < cfg.attackWindup + 0.36) {
      // 돌진 — 벽에 막히면 헛스윙으로 끝낸다 (벽이랑 싸우지 않음)
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      let nx = this.x + fx * cfg.attackSpeed * dt;
      let nz = this.z + fz * cfg.attackSpeed * dt;
      const c = this.world.collide(nx, nz, this.radius);
      nx = c.x; nz = c.z;
      const dashMoved = Math.hypot(nx - this.x, nz - this.z);
      if (dashMoved < cfg.attackSpeed * dt * 0.25) {
        // 벽에 박힘: 돌진을 접고 회복으로
        this._attackPhase = cfg.attackTime;
        this.moveSpeedActual = 0;
      } else {
        if (!this.world.inSafeZone(nx, nz)) { this.x = nx; this.z = nz; }
        this.moveSpeedActual = cfg.attackSpeed;
      }
    } else {
      this.moveSpeedActual = 0;
    }
    if (!playerSafe && !player.hidden && !this._caught && d < cfg.catchRadius && this._attackPhase > cfg.attackWindup &&
        !this.world.lineBlocked(this.x, this.z, player.x, player.z) && this.onCatch) {
      this._caught = true;
      this._lastCatchTime = this.time;
      this.onCatch();
    }
    if (this._attackPhase > cfg.attackTime) this._setState(STATE.RECOVER);
  }

  _safeTarget(t) {
    if (!t) return t;
    if (this.world.inSafeZone(t.x, t.z)) {
      const c = this.world.clampOutOfSafeZone(t.x, t.z, 1.5);
      return { x: c.x, z: c.z };
    }
    return t;
  }

  _hadTarget() {
    return this._path.length > 0 || Math.hypot(this.target.x - this.x, this.target.z - this.z) > 0.6;
  }

  _nearTarget(r = 1.0) {
    const t = this.target;
    return Math.hypot(t.x - this.x, t.z - this.z) < r;
  }

  _pickRoamTarget() {
    const cfg = CONFIG.monster;
    const K = this.world.compound;
    const rMin = cfg.roamMin !== undefined ? cfg.roamMin : 6;
    const rMax = cfg.roamMax !== undefined ? cfg.roamMax : CONFIG.worldRadius - 10;
    const rEdge = CONFIG.worldRadius - 4;
    for (let tries = 0; tries < 24; tries++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(rMin, rMax);
      let x, z;
      // 절반은 시설 안쪽으로 (자기 위치 기준 최소 활동 반경 밖만)
      if (Math.random() < 0.55) {
        x = rand(K.OX0 + 4, K.OX1 - 4);
        z = rand(K.OZ0 + 4, K.OZ1 - 4);
        const dSelf = Math.hypot(x - this.x, z - this.z);
        if (dSelf < rMin || dSelf > rMax) continue;
      } else {
        // 나머지는 자기 위치에서 roamMin~roamMax 사이 원환 (지도 경계 준수)
        x = this.x + Math.cos(a) * r;
        z = this.z + Math.sin(a) * r;
        if (Math.hypot(x, z) > rEdge) continue;
      }
      if (this.world.inSafeZone(x, z)) continue;
      if (!this.world.isBlockedPoint(x, z, this.radius)) {
        this.target = { x, z };
        this._path = []; this._repathTimer = 0;
        return;
      }
    }
    // 폴백: 자기 위치 기준 활동 반경 원환 (지도 안쪽으로 축소하며 재시도)
    const a = rand(0, Math.PI * 2);
    let r = rand(rMin, rMax);
    let x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
    while (Math.hypot(x, z) > rEdge && r > 4) {
      r *= 0.7;
      x = this.x + Math.cos(a) * r; z = this.z + Math.sin(a) * r;
    }
    this.target = { x, z };
    this._path = []; this._repathTimer = 0;
  }

  _pickSearchTarget() {
    const cfg = CONFIG.monster;
    // 가끔 은신처를 조사
    if (Math.random() < cfg.hideInspectChance && this.world.hidingSpots.length) {
      const near = this.world.hidingSpots
        .map((s) => ({ s, d: dist2(s.x, s.z, this.lastKnown.x, this.lastKnown.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 4);
      const pick = near[Math.floor(Math.random() * near.length)].s;
      this.inspectSpot = pick;
      this._searchTarget = { x: pick.x, z: pick.z };
      return;
    }
    this.inspectSpot = null;
    for (let tries = 0; tries < 16; tries++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(3, cfg.searchRadius);
      let tx = this.lastKnown.x + Math.cos(a) * r;
      let tz = this.lastKnown.z + Math.sin(a) * r;
      if (this.world.inSafeZone(tx, tz)) continue;
      if (this.world.isBlockedPoint(tx, tz, this.radius)) { tx = this.lastKnown.x; tz = this.lastKnown.z; }
      this._searchTarget = { x: tx, z: tz };
      return;
    }
    this._searchTarget = { x: this.lastKnown.x, z: this.lastKnown.z };
  }

  _move(dt, speed) {
    const cfg = CONFIG.monster;

    const targetFar = dist2(this.target.x, this.target.z, this._pathTargetX ?? 1e9, this._pathTargetZ ?? 1e9) > 9;
    if (this._repathTimer <= 0 || this._path.length === 0 || targetFar) {
      this._path = this._findPath(this.x, this.z, this.target.x, this.target.z);
      this._pathTargetX = this.target.x; this._pathTargetZ = this.target.z;
      const chasing = this.state === STATE.CHASE || this.state === STATE.ATTACK;
      this._repathTimer = chasing ? cfg.repathIntervalChase : cfg.repathInterval;
    }

    while (this._path.length && Math.hypot(this._path[0].x - this.x, this._path[0].z - this.z) < 0.7) {
      this._path.shift();
    }
    let wx = this.target.x, wz = this.target.z;
    if (this._path.length) { wx = this._path[0].x; wz = this._path[0].z; }

    let dirx = wx - this.x, dirz = wz - this.z;
    let dl = Math.hypot(dirx, dirz) || 1;
    dirx /= dl; dirz /= dl;

    if (this._wanderBias !== 0) {
      const c2 = Math.cos(this._wanderBias), s2 = Math.sin(this._wanderBias);
      const bx = dirx * c2 - dirz * s2;
      const bz = dirx * s2 + dirz * c2;
      dirx = bx; dirz = bz;
    }

    let nx = this.x + dirx * speed * dt;
    let nz = this.z + dirz * speed * dt;
    const c = this.world.collide(nx, nz, this.radius);
    nx = c.x; nz = c.z;

    // 안전지대 진입 금지
    if (this.world.inSafeZone(nx, nz)) { nx = this.x; nz = this.z; }

    let moved = Math.hypot(nx - this.x, nz - this.z);
    // 축 분리 슬라이딩: 대각선으로 벽에 박히면 X·Z축 각각으로 미끄러지듯 이동을 시도한다.
    // (collide는 밀어내기만 하고 슬라이딩을 안 하므로 여기서 보정)
    if (moved < speed * dt * 0.35) {
      const tryX = this.world.collide(this.x + dirx * speed * dt, this.z, this.radius);
      const mx = Math.hypot(tryX.x - this.x, tryX.z - this.z);
      const tryZ = this.world.collide(this.x, this.z + dirz * speed * dt, this.radius);
      const mz = Math.hypot(tryZ.x - this.x, tryZ.z - this.z);
      if (mx > moved && mx >= mz) {
        nx = tryX.x; nz = tryZ.z;
        if (!this.world.inSafeZone(nx, nz)) moved = mx;
        else { nx = this.x; nz = this.z; moved = 0; }
      } else if (mz > moved) {
        nx = tryZ.x; nz = tryZ.z;
        if (!this.world.inSafeZone(nx, nz)) moved = mz;
        else { nx = this.x; nz = this.z; moved = 0; }
      }
    }
    this.moveSpeedActual = moved / Math.max(dt, 1e-4);

    // 스턱 회복: 한 방향으로 버티지 않고 여러 각도를 순환하며 탈출을 시도한다.
    // 추격 중에는 더 빨리(0.7s) 반응해 벽 앞에서 멈칫거리는 시간을 줄인다.
    const stuckLimit = (this.state === STATE.CHASE || this.state === STATE.ATTACK) ? 0.7 : cfg.stuckTime;
    if (moved < speed * dt * 0.35) {
      this._stuckTimer += dt;
      if (this._stuckTimer > stuckLimit) {
        this._stuckTimer = 0;
        this._stuckStep = ((this._stuckStep || 0) + 1) % 4;
        // ±60° → ±120° → 뒤돌기 순환 + 약간의 무작위
        const base = [Math.PI / 3, -Math.PI * 2 / 3, Math.PI * 2 / 3, Math.PI][this._stuckStep];
        this._wanderBias = base + rand(-0.2, 0.2);
        this._path = [];
        this._repathTimer = 0;
        // 추격 중에는 lastKnown를 벗어난 목표로 흔들지 않는다 (매 프레임 lastKnown에서 다시 세팅됨)
        if (this.state !== STATE.CHASE && this.state !== STATE.ATTACK) {
          this.target = { x: this.target.x + rand(-4, 4), z: this.target.z + rand(-4, 4) };
        }
      }
    } else {
      this._stuckTimer = 0;
      this._wanderBias = damp(this._wanderBias, 0, 3, dt);
    }

    this.x = nx; this.z = nz;

    if (moved > 1e-4) {
      const desiredYaw = Math.atan2(dirx, dirz);
      this.yaw = angleLerp(this.yaw, desiredYaw, clamp(cfg.turnLerp * dt, 0, 1));
    }
  }

  /* ================= 애니메이션 ================= */
  _animate(dt, speed01) {
    const st = this.state;
    const chasing = st === STATE.CHASE;
    const attacking = st === STATE.ATTACK;
    const lurking = this.lurking && st === STATE.AMBUSH;
    const stalking = st === STATE.STALK || st === STATE.INVESTIGATE || st === STATE.SEARCH || st === STATE.LISTEN || st === STATE.AMBUSH;

    const rate = 1.4 + speed01 * 9 + (chasing ? 3 : 0);
    const p = (this.animPhase += dt * rate);

    const hunch = clamp(0.45 + speed01 * 0.5 + (stalking ? 0.24 : 0) + (attacking ? 0.2 : 0), 0.4, 1.3);
    const swing = 0.22 + speed01 * 0.85;

    // 다리
    this.legL.rotation.x = Math.sin(p) * swing;
    this.legR.rotation.x = Math.sin(p + Math.PI) * swing;
    this.kneeL.rotation.x = -0.5 + Math.max(0, -Math.cos(p)) * (0.6 + speed01 * 0.8);
    this.kneeR.rotation.x = -0.5 + Math.max(0, -Math.cos(p + Math.PI)) * (0.6 + speed01 * 0.8);
    this.ankleL.rotation.x = -Math.sin(p) * 0.3 * (0.4 + speed01);
    this.ankleR.rotation.x = -Math.sin(p + Math.PI) * 0.3 * (0.4 + speed01);

    // 팔 — 추격 시 앞으로 뻗음, 배회 시 축 늘어짐
    const reach = chasing ? 1.0 : (stalking ? 0.4 : 0.1);
    const armSwing = swing * (chasing ? 0.5 : 0.85);
    this.armL.rotation.x = (chasing ? -1.3 : -0.2) + Math.sin(p + Math.PI) * armSwing;
    this.armR.rotation.x = (chasing ? -1.3 : -0.2) + Math.sin(p) * armSwing;
    this.armL.rotation.z = -0.25 - reach * 0.2 + Math.sin(p * 2) * 0.03;
    this.armR.rotation.z = 0.25 + reach * 0.2 - Math.sin(p * 2) * 0.03;
    this.elbowL.rotation.x = -(chasing ? 0.5 : 0.7) - Math.max(0, Math.sin(p)) * 0.4;
    this.elbowR.rotation.x = -(chasing ? 0.5 : 0.7) - Math.max(0, Math.sin(p + Math.PI)) * 0.4;

    // 몸통 — 구부정, 추격 시 낮게, 매복 시 바짝 웅크림
    this.torso.rotation.x = hunch + (lurking ? 0.35 : 0);
    this.torso.position.y = this._baseTorsoY - speed01 * 0.15 - (chasing ? 0.1 : 0) - (lurking ? 0.35 : 0);
    this.torso.rotation.z = Math.sin(p) * 0.06 * (0.3 + speed01);

    // 목/머리 — 흔들림, 스캔
    if (attacking) {
      const wind = this._attackPhase < CONFIG.monster.attackWindup ? 1 : -1;
      this.head.rotation.x = -0.3 + wind * 0.5;
      this.neck.rotation.x = wind * 0.4;
      this.jaw.position.y = 0.05 - Math.max(0, -wind) * 0.06;
    } else if (this.state === STATE.SEARCH || this.state === STATE.INVESTIGATE || this.state === STATE.LISTEN) {
      this.head.rotation.y = Math.sin(this.time * 2.4) * 0.85;
      this.head.rotation.x = -0.1 - speed01 * 0.15;
      this.neck.rotation.x = -hunch * 0.3;
    } else {
      this.head.rotation.y = Math.sin(p * 0.6 + this.time * 0.5) * 0.16 + (Math.random() < 0.01 ? rand(-0.5, 0.5) : 0);
      this.head.rotation.x = -0.05 - speed01 * 0.2;
      this.neck.rotation.x = -hunch * 0.35;
    }

    // 호흡/경련
    const br = 1 + Math.sin(this.time * 1.7) * 0.012 * (1 - speed01);
    this.torso.scale.set(br, br, br);

    if (attacking) this.attackAnim = clamp((this._attackPhase - CONFIG.monster.attackWindup) / 0.3, 0, 1);
    else this.attackAnim = damp(this.attackAnim, 0, 6, dt);

    // 추격/공격 — 눈의 잔불이 스트로브처럼 번쩍이고 입이 붉게 달아오른다
    // 매복 중에는 눈을 감춰 기척을 숨긴다
    const frenzy = chasing || attacking;
    const eyeDim = lurking ? 0.12 : 1;
    if (this.eyeLight) this.eyeLight.intensity = (frenzy ? 9 + Math.sin(this.time * 27) * 7 : 8) * eyeDim;
    if (this.eyeMat) this.eyeMat.emissiveIntensity = 4.4 * eyeDim * (frenzy ? 1.15 : 1);
    if (this.eyeGlow) {
      this.eyeGlow.material.opacity = (frenzy ? 0.55 + 0.35 * Math.sin(this.time * 27) : 0.45) * eyeDim;
      const es = 1 + (frenzy ? 0.3 + 0.2 * Math.sin(this.time * 23) : 0);
      this.eyeGlow.scale.set(0.6 * es, 0.42 * es, 1);
    }
    if (this.mouthMat) this.mouthMat.emissiveIntensity = frenzy ? 1.9 + Math.sin(this.time * 24) * 0.9 : 1.6;
    if (this.aura) {
      this.aura.material.opacity = 0.13 + (frenzy ? 0.06 : 0) + Math.sin(this.time * 2.3) * 0.04;
      this.aura.scale.set(1.7 + Math.sin(this.time * 1.9) * 0.12, 1.4 + Math.sin(this.time * 1.9 + 1) * 0.09, 1);
    }
  }

  /* ================= 사운드 ================= */
  _audio(dt, dist, player, speed01) {
    const cfg = CONFIG.monster;
    const proximity = clamp(1 - dist / 46, 0, 1);
    const dx = this.x - player.x, dz = this.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dx / len, dz / len);
    const rel = ang - player.yaw;
    const pan = clamp(Math.sin(rel) * Math.cos(player.pitch), -1, 1);

    const chasing = this.state === STATE.CHASE || this.state === STATE.ATTACK;
    const searching = this.state === STATE.SEARCH || this.state === STATE.STALK || this.state === STATE.INVESTIGATE;
    const aggression = chasing ? 1 : searching ? 0.5 : 0.22;

    if (proximity <= 0.03 && !chasing) return;

    // 발소리 (무거운 발걸음) — 이동 중 위상에 맞춰
    if (this.moveSpeedActual > 0.6) {
      const stepIndex = Math.floor(this.animPhase / Math.PI);
      if (stepIndex !== this._lastStep) {
        this._lastStep = stepIndex;
        this.audio.monsterStep(clamp(this.moveSpeedActual / cfg.chaseSpeed, 0.2, 1), pan, proximity);
      }
    }

    this._snd.growl -= dt;
    if (this._snd.growl <= 0) {
      this._snd.growl = (chasing ? rand(0.9, 1.8) : rand(6, 13));
      if (proximity > 0.1 || chasing) this.audio.growl(proximity, pan, aggression);
    }
    this._snd.breathe -= dt;
    if (this._snd.breathe <= 0) {
      this._snd.breathe = chasing ? rand(0.45, 0.85) : rand(2.2, 4.5);
      this.audio.breathe(proximity, pan);
    }
    this._snd.whisper -= dt;
    if (this._snd.whisper <= 0) {
      this._snd.whisper = rand(5, 13);
      if (!chasing) this.audio.whisper(proximity, pan);
    }
    this._snd.sniff -= dt;
    if (this._snd.sniff <= 0) {
      this._snd.sniff = rand(2.5, 6);
      if (searching) this.audio.sniff(proximity, pan);
    }
  }

  /* ================= 경로 탐색 ================= */
  _findPath(sx, sz, tx, tz) {
    const g = this.grid;
    let si = g.idx(sx, sz);
    let ti = g.idx(tx, tz);
    if (si < 0) si = g.nearestWalkable(g.idx(clamp(sx, -63, 63), clamp(sz, -63, 63)));
    if (ti < 0 || g.blocked[ti]) ti = g.nearestWalkable(ti >= 0 ? ti : g.idx(clamp(tx, -63, 63), clamp(tz, -63, 63)));
    if (si < 0 || ti < 0) return [];
    if (si === ti) return [{ x: tx, z: tz }];

    const N = g.n;
    const total = N * N;
    const gScore = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open = new MinHeap();

    const gx = ti % N, gz = (ti - gx) / N;
    const heur = (id) => {
      const ix = id % N, iz = (id - ix) / N;
      const dx = Math.abs(ix - gx), dz = Math.abs(iz - gz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    gScore[si] = 0;
    open.push(si, heur(si));
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let best = si, iterations = 0;

    while (open.size > 0) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === ti) { best = ti; break; }
      if (heur(cur) < heur(best)) best = cur;
      if (++iterations > 7000) break;

      const cx = cur % N, cz = (cur - cx) / N;
      for (let k = 0; k < 8; k++) {
        const ix = cx + dirs[k][0], iz = cz + dirs[k][1];
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const nid = iz * N + ix;
        if (g.blocked[nid] || closed[nid]) continue;
        if (k >= 4) {
          if (g.blocked[cz * N + ix] || g.blocked[iz * N + cx]) continue;
        }
        const step = k >= 4 ? Math.SQRT2 : 1;
        const tentative = gScore[cur] + step;
        if (tentative < gScore[nid]) {
          gScore[nid] = tentative;
          came[nid] = cur;
          open.push(nid, tentative + heur(nid));
        }
      }
    }

    const path = [];
    let node = best, guard = 0;
    while (node !== -1 && node !== si && guard++ < total) {
      path.push(g.cellCenter(node));
      node = came[node];
    }
    path.reverse();
    if (path.length === 0) path.push({ x: tx, z: tz });
    else path[path.length - 1] = { x: tx, z: tz };
    return path;
  }

  reset(spawn = null) {
    this.x = spawn ? spawn.x : 0;
    this.z = spawn ? spawn.z : -2;
    this.y = this.world.heightAt(this.x, this.z);
    this.yaw = 0;
    this.state = STATE.ROAM;
    this.stateTime = 0;
    this.lastKnownValid = false;
    this.lastKnownTime = -1e9;
    this.lostTimer = 0;
    this.suspicion = 0;
    this._path = [];
    this._repathTimer = 0;
    this._stuckTimer = 0;
    this._wanderBias = 0;
    this._idleTimer = 0;
    this.seenHide = null;
    this.inspectSpot = null;
    this._inspectTimer = 0;
    this.knownHide = null;
    this.sawPlayerTime = -1e9;
    this._ambushSpot = null;
    this._ambushTimer = 0;
    this._ambushCooldown = 8;
    this._ambushRollT = 3;
    this._lastCatchTime = -1e9;
    this.lurking = false;
    this._caught = false;
    this._boundaryTarget = null;
    this._wasHidden = false;
    this._grace = 0;
    this.chasing = false;
    this.attackAnim = 0;
    this._lastStep = -1;
    this._searchTarget = null;
    this.stunT = 0;
    this.slowT = 0;
    this._pickRoamTarget();
    this._syncModel();
  }

  // 스턴(충격기·덫): AI·이동 정지, 어지러움 흔들림
  stun(t) {
    this.stunT = Math.max(this.stunT, t);
    this._caught = false;
    this._attackPhase = 0;
    this._path = [];
    this.moveSpeedActual = 0;
  }
}

/* ================= 그리드 & 힙 ================= */
class Grid {
  constructor(world, cell, margin) {
    this.cell = cell;
    this.margin = margin;
    this.range = CONFIG.worldRadius + 2;
    this.n = Math.ceil((this.range * 2) / cell);
    this.ox = -this.range;
    this.oz = -this.range;
    this.blocked = new Uint8Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = this.ox + (i + 0.5) * cell;
        const z = this.oz + (j + 0.5) * cell;
        if (world.isBlockedPoint(x, z, margin) || world.inSafeZone(x, z)) this.blocked[j * this.n + i] = 1;
      }
    }
  }
  idx(x, z) {
    const i = Math.floor((x - this.ox) / this.cell);
    const j = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }
  cellCenter(id) {
    const i = id % this.n;
    const j = (id - i) / this.n;
    return { x: this.ox + (i + 0.5) * this.cell, z: this.oz + (j + 0.5) * this.cell };
  }
  nearestWalkable(id) {
    if (id < 0) return -1;
    if (!this.blocked[id]) return id;
    const startX = id % this.n, startZ = (id - startX) / this.n;
    for (let r = 1; r < 30; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const ix = startX + dx, iz = startZ + dz;
          if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) continue;
          const nid = iz * this.n + ix;
          if (!this.blocked[nid]) return nid;
        }
      }
    }
    return -1;
  }
}

class MinHeap {
  constructor() { this.ids = []; this.pri = []; }
  get size() { return this.ids.length; }
  push(id, pri) {
    this.ids.push(id); this.pri.push(pri);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.pri[p] <= this.pri[i]) break;
      this._swap(i, p); i = p;
    }
  }
  pop() {
    const top = this.ids[0];
    const lastId = this.ids.pop();
    const lastPri = this.pri.pop();
    if (this.ids.length > 0) {
      this.ids[0] = lastId; this.pri[0] = lastPri;
      let i = 0;
      const n = this.ids.length;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < n && this.pri[l] < this.pri[s]) s = l;
        if (r < n && this.pri[r] < this.pri[s]) s = r;
        if (s === i) break;
        this._swap(i, s); i = s;
      }
    }
    return top;
  }
  _swap(a, b) {
    const ti = this.ids[a]; this.ids[a] = this.ids[b]; this.ids[b] = ti;
    const tp = this.pri[a]; this.pri[a] = this.pri[b]; this.pri[b] = tp;
  }
}

function makeGlow() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,110,60,1)");
  g.addColorStop(0.3, "rgba(255,50,24,0.5)");
  g.addColorStop(1, "rgba(255,40,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
