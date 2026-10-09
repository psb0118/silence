import * as THREE from "three";
import { CONFIG } from "./config.js";
import { clamp, damp, angleLerp, dist2, rand } from "./util.js";

const STATE = { ROAM: "ROAM", INVESTIGATE: "INVESTIGATE", CHASE: "CHASE", SEARCH: "SEARCH" };
export { STATE };

export class Monster {
  constructor(scene, world, audio, noise) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.noise = noise;

    this.radius = 0.55;
    this.x = -14;
    this.z = 8;
    this.y = world.heightAt(this.x, this.z);
    this.yaw = 0;
    this.animPhase = 0;
    this.time = 0;

    this.state = STATE.ROAM;
    this.stateTime = 0;
    this.lastKnown = { x: 0, z: 0 };
    this.lastKnownValid = false;
    this.lostTimer = 0;
    this.moveSpeedActual = 0;
    this.chasing = false;

    this._repathTimer = 0;
    this._path = [];
    this.target = { x: this.x, z: this.z };
    this._stuckTimer = 0;
    this._lastX = this.x;
    this._lastZ = this.z;
    this._wanderBias = 0;
    this._idleTimer = 0;

    this._growlTimer = rand(2, 5);
    this._breathTimer = rand(1, 3);
    this._lastEncounter = 0;

    this.onCatch = null;

    this.grid = new Grid(world, 2.0, this.radius + 0.2);
    this._buildModel();
    this._syncModel();
  }

  /* ================= 모델 ================= */
  _buildModel() {
    const root = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x787e88, roughness: 0.85, metalness: 0.05,
      emissive: 0x14181f, emissiveIntensity: 0.8
    });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 0.5, metalness: 0.6 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff7a4a, emissive: 0xff3418, emissiveIntensity: 3.2, roughness: 0.4 });

    const seg = (len, r1, r2) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, 7), bodyMat);
      m.position.y = -len / 2;
      m.castShadow = true;
      return m;
    };

    // 몸통
    this.torso = new THREE.Group();
    this.torso.position.y = 1.55;
    const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.20, 0.9, 8), bodyMat);
    torsoMesh.position.y = 0.45;
    torsoMesh.castShadow = true;
    this.torso.add(torsoMesh);

    // 목 + 머리
    const head = new THREE.Group();
    head.position.y = 0.95;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.15, 6), bodyMat);
    neck.position.y = -0.05;
    head.add(neck);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bodyMat);
    skull.scale.set(0.85, 1.15, 1.05);
    skull.position.y = 0.12;
    skull.castShadow = true;
    head.add(skull);
    // 눈 (어둠 속에서 빛남)
    for (const ex of [-0.075, 0.075]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), eyeMat);
      eye.position.set(ex, 0.15, 0.14);
      head.add(eye);
    }
    // 어둠 속에서도 눈이 보이도록 붉은 발광 스프라이트
    const eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeEyeGlow(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.9, fog: false
    }));
    eyeGlow.scale.set(0.8, 0.55, 1);
    eyeGlow.position.set(0, 0.15, 0.17);
    head.add(eyeGlow);
    this.eyeGlow = eyeGlow;
    // 머리에 붉은 광원 → 어둠 속에서도 실루엣이 드러남
    this.eyeLight = new THREE.PointLight(0xff3a1e, 16, 16, 1.6);
    this.eyeLight.position.set(0, 0.14, 0.16);
    head.add(this.eyeLight);
    this.head = head;
    this.torso.add(head);

    // 팔 (어깨 → 팔꿈치 → 손/발톱)
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.2 * side, 0.85, 0);
      const upper = seg(0.95, 0.05, 0.045);
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.95;
      const fore = seg(0.9, 0.045, 0.035);
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -0.9;
      for (const cx of [-0.04, 0, 0.04]) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.16, 5), clawMat);
        claw.position.set(cx, -0.06, 0.02);
        claw.rotation.x = Math.PI;
        hand.add(claw);
      }
      elbow.add(hand);
      shoulder.add(elbow);
      this.torso.add(shoulder);
      return { shoulder, elbow };
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);
    this.armL = armL.shoulder;
    this.elbowL = armL.elbow;
    this.armR = armR.shoulder;
    this.elbowR = armR.elbow;

    root.add(this.torso);

    // 다리 (골반 → 무릎 → 발)
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0.13 * side, 1.5, 0);
      const upper = seg(0.85, 0.07, 0.06);
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.y = -0.85;
      const lower = seg(0.85, 0.06, 0.045);
      knee.add(lower);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.28), bodyMat);
      foot.position.set(0, -0.85, 0.06);
      foot.castShadow = true;
      knee.add(foot);
      hip.add(knee);
      root.add(hip);
      return { hip, knee };
    };
    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    this.legL = legL.hip;
    this.kneeL = legL.knee;
    this.legR = legR.hip;
    this.kneeR = legR.knee;

    this.group = root;
    this.scene.add(root);
  }

  _syncModel() {
    this.group.position.set(this.x, this.world.heightAt(this.x, this.z), this.z);
    this.group.rotation.y = this.yaw;
  }

  /* ================= 상태 전환 ================= */
  _setState(s) {
    if (this.state === s) return;
    const wasChasing = this.state === STATE.CHASE;
    this.state = s;
    this.stateTime = 0;
    this._path = [];
    this._repathTimer = 0;
    if (s === STATE.CHASE && !wasChasing) {
      this.chasing = true;
      this.audio.chaseStinger();
      this.audio.screech(0.9);
    }
    if (s === STATE.SEARCH) this._searchTarget = null;
  }

  /* ================= 소음 반응 ================= */
  _consumeNoise() {
    const evs = this.noise.drainEvents();
    const cfg = CONFIG.monster;
    let best = null, bestScore = 0;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.intensity < cfg.hearMinIntensity) continue;
      const d = Math.hypot(e.x - this.x, e.z - this.z);
      const range = cfg.hearBase * e.intensity;   // 클수록 멀리서 들림
      if (d > range) continue;
      const score = e.intensity * (1 - d / range);
      if (score > bestScore) { bestScore = score; best = { e, d, score }; }
    }
    if (!best) return false;

    this.lastKnown = { x: best.e.x, z: best.e.z };
    this.lastKnownValid = true;
    this.lostTimer = 0;

    const loud = best.e.intensity >= 0.6;
    const closeLoud = best.score > 0.45;
    if (this.state === STATE.CHASE) {
      // 추격 유지
    } else if (loud || closeLoud) {
      this._setState(STATE.CHASE);
    } else {
      this._setState(STATE.INVESTIGATE);
    }
    return true;
  }

  _canSee(player) {
    const d = Math.hypot(player.x - this.x, player.z - this.z);
    const sight = this.state === STATE.CHASE ? 16 : 13;
    if (d > sight) return false;
    return !this.world.lineBlocked(this.x, this.z, player.x, player.z);
  }

  /* ================= 업데이트 ================= */
  update(dt, player) {
    this.time += dt;
    this._playerRef = player;
    const cfg = CONFIG.monster;
    this._repathTimer -= dt;

    const heard = this._consumeNoise();
    const dToPlayer = Math.hypot(player.x - this.x, player.z - this.z);
    const sees = this._canSee(player);
    const veryClose = dToPlayer < cfg.senseRadius;

    // 아주 가까우면 조용해도 감지, 시야 확보 시 위치 확정
    if (sees) {
      this.lastKnown = { x: player.x, z: player.z };
      this.lastKnownValid = true;
      this.lostTimer = 0;
      if (this.state !== STATE.CHASE) this._setState(STATE.CHASE);
    } else if (veryClose) {
      this.lastKnown = { x: player.x, z: player.z };
      this.lastKnownValid = true;
      this.lostTimer = 0;
      if (this.state !== STATE.CHASE) this._setState(STATE.CHASE);
    }

    let speed = cfg.roamSpeed;
    let moving = true;

    switch (this.state) {
      case STATE.ROAM: {
        speed = cfg.roamSpeed;
        if (this._idleTimer > 0) {
          this._idleTimer -= dt;
          moving = false;
        } else if (!this._path.length && this._nearTarget()) {
          this._idleTimer = rand(0.6, 2.2);
          this._pickRoamTarget();
        } else if (!this._path.length) {
          this._pickRoamTarget();
        }
        break;
      }
      case STATE.INVESTIGATE: {
        speed = cfg.investigateSpeed;
        this.target = { x: this.lastKnown.x, z: this.lastKnown.z };
        if (this._nearTarget(1.6)) {
          this.stateTime += dt;
          moving = false;
          if (this.stateTime > cfg.investigateTime) this._setState(STATE.SEARCH);
        }
        break;
      }
      case STATE.CHASE: {
        speed = cfg.chaseSpeed;
        this.target = { x: this.lastKnown.x, z: this.lastKnown.z };
        if (!heard && !sees && !veryClose) {
          this.lostTimer += dt;
          if (this.lostTimer > cfg.loseTime) this._setState(STATE.SEARCH);
        } else {
          this.lostTimer = 0;
        }
        break;
      }
      case STATE.SEARCH: {
        speed = cfg.searchSpeed;
        if (!this._searchTarget || this._nearTarget(1.8)) {
          const a = rand(0, Math.PI * 2);
          const r = rand(3, cfg.searchRadius);
          let tx = this.lastKnown.x + Math.cos(a) * r;
          let tz = this.lastKnown.z + Math.sin(a) * r;
          if (this.world.isBlockedPoint(tx, tz, this.radius)) { tx = this.lastKnown.x; tz = this.lastKnown.z; }
          this._searchTarget = { x: tx, z: tz };
        }
        this.target = this._searchTarget;
        this.stateTime += dt;
        if (this.stateTime > cfg.searchTime) {
          this._setState(STATE.ROAM);
          this.lastKnownValid = false;
          this._pickRoamTarget();
        }
        break;
      }
    }

    if (moving && (this.state === STATE.CHASE || this._hadTarget())) {
      this._move(dt, speed);
    } else {
      this.moveSpeedActual = damp(this.moveSpeedActual, 0, 8, dt);
      this._stuckTimer = 0;
    }

    // 잡기 판정
    if (dToPlayer < cfg.catchRadius && this.onCatch) {
      this.onCatch();
    }

    // 애니메이션 + 사운드
    const speed01 = clamp(this.moveSpeedActual / cfg.chaseSpeed, 0, 1);
    this._animate(dt, speed01);
    this._audio(dt, dToPlayer, player, speed01);
    this._syncModel();
  }

  _hadTarget() {
    return this._path.length > 0 || Math.hypot(this.target.x - this.x, this.target.z - this.z) > 0.6;
  }

  _nearTarget(r = 1.0) {
    const t = this.target;
    return Math.hypot(t.x - this.x, t.z - this.z) < r;
  }

  _pickRoamTarget() {
    const p = this._playerRef;
    for (let tries = 0; tries < 16; tries++) {
      let x, z;
      if (p && Math.random() < 0.5) {
        // 절반은 플레이어 주변으로 배회 → 마주칠 확률을 높임
        const a = rand(0, Math.PI * 2);
        const r = rand(12, 26);
        x = p.x + Math.cos(a) * r;
        z = p.z + Math.sin(a) * r;
      } else {
        const a = rand(0, Math.PI * 2);
        const r = rand(6, CONFIG.worldRadius - 8);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      if (!this.world.isBlockedPoint(x, z, this.radius)) {
        this.target = { x, z };
        this._path = [];
        this._repathTimer = 0;
        return;
      }
    }
    this.target = { x: 0, z: 0 };
  }

  _move(dt, speed) {
    const cfg = CONFIG.monster;

    // 목표가 크게 바뀌었거나 주기 도달 시 재탐색
    const targetFar = dist2(this.target.x, this.target.z, this._pathTargetX ?? 1e9, this._pathTargetZ ?? 1e9) > 9;
    if (this._repathTimer <= 0 || this._path.length === 0 || targetFar) {
      this._path = this._findPath(this.x, this.z, this.target.x, this.target.z);
      this._pathTargetX = this.target.x; this._pathTargetZ = this.target.z;
      this._repathTimer = cfg.repathInterval;
    }

    // 다음 웨이포인트
    while (this._path.length && Math.hypot(this._path[0].x - this.x, this._path[0].z - this.z) < 0.7) {
      this._path.shift();
    }
    let wx = this.target.x, wz = this.target.z;
    if (this._path.length) { wx = this._path[0].x; wz = this._path[0].z; }

    let dirx = wx - this.x, dirz = wz - this.z;
    let dl = Math.hypot(dirx, dirz) || 1;
    dirx /= dl; dirz /= dl;

    // 막힘 시 측면 편향
    if (this._wanderBias !== 0) {
      const c = Math.cos(this._wanderBias), s = Math.sin(this._wanderBias);
      const bx = dirx * c - dirz * s;
      const bz = dirx * s + dirz * c;
      dirx = bx; dirz = bz;
    }

    let nx = this.x + dirx * speed * dt;
    let nz = this.z + dirz * speed * dt;
    const c = this.world.collide(nx, nz, this.radius);
    nx = c.x; nz = c.z;

    const moved = Math.hypot(nx - this.x, nz - this.z);
    this.moveSpeedActual = moved / Math.max(dt, 1e-4);

    // 끼임 감지
    if (moved < speed * dt * 0.35) {
      this._stuckTimer += dt;
      if (this._stuckTimer > cfg.stuckTime) {
        this._stuckTimer = 0;
        this._wanderBias = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 3);
        this._path = [];
        this._repathTimer = 0;
        this.target = { x: this.target.x + rand(-4, 4), z: this.target.z + rand(-4, 4) };
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
    const chasing = this.state === STATE.CHASE;
    const p = (this.animPhase += dt * (2.5 + speed01 * 11 + (chasing ? 4 : 0)));
    const swing = 0.32 + speed01 * 0.75;

    this.legL.rotation.x = Math.sin(p) * swing;
    this.legR.rotation.x = Math.sin(p + Math.PI) * swing;
    this.kneeL.rotation.x = Math.max(0, -Math.cos(p)) * (0.5 + speed01 * 0.7);
    this.kneeR.rotation.x = Math.max(0, -Math.cos(p + Math.PI)) * (0.5 + speed01 * 0.7);

    this.armL.rotation.x = -0.25 + Math.sin(p + Math.PI) * swing * 0.7 - (chasing ? 0.5 : 0);
    this.armR.rotation.x = -0.25 + Math.sin(p) * swing * 0.7 - (chasing ? 0.5 : 0);
    this.elbowL.rotation.x = -0.35 - (chasing ? 0.7 : 0.15);
    this.elbowR.rotation.x = -0.35 - (chasing ? 0.7 : 0.15);

    this.torso.rotation.x = -0.06 - speed01 * 0.32 - (chasing ? 0.12 : 0) + Math.sin(p * 2) * 0.02;
    this.torso.rotation.z = Math.sin(p) * 0.05 * (0.3 + speed01);

    if (this.state === STATE.SEARCH || this.state === STATE.INVESTIGATE) {
      this.head.rotation.y = Math.sin(this.time * 2.2) * 0.7;
    } else {
      this.head.rotation.y = Math.sin(p * 0.7) * 0.1;
    }
    this.head.rotation.x = -0.1 - speed01 * 0.15;

    const br = 1 + Math.sin(this.time * 1.6) * 0.012 * (1 - speed01);
    this.torso.scale.set(br, br, br);
  }

  /* ================= 사운드 ================= */
  _audio(dt, dist, player, speed01) {
    const proximity = clamp(1 - dist / 42, 0, 1);
    if (proximity <= 0.06) return;

    // 좌우 패닝
    const dx = this.x - player.x, dz = this.z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dx / len, dz / len);
    const rel = ang - player.yaw;
    const pan = clamp(Math.sin(rel) * Math.cos(player.pitch) + Math.cos(rel) * 0, -1, 1);

    const chasing = this.state === STATE.CHASE;
    const aggression = chasing ? 1 : this.state === STATE.INVESTIGATE || this.state === STATE.SEARCH ? 0.5 : 0.2;

    this._growlTimer -= dt;
    if (this._growlTimer <= 0) {
      this._growlTimer = (chasing ? rand(1.1, 2.0) : rand(5, 11)) * (0.6 + Math.random() * 0.6);
      this.audio.growl(proximity, pan, aggression);
    }
    this._breathTimer -= dt;
    if (this._breathTimer <= 0) {
      this._breathTimer = chasing ? rand(0.5, 0.9) : rand(2.5, 5);
      this.audio.breathe(proximity, pan);
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
    const start = si, goal = ti;
    const gScore = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open = new MinHeap();

    const gx = goal % N, gz = (goal - gx) / N;
    const heur = (id) => {
      const ix = id % N, iz = (id - ix) / N;
      const dx = Math.abs(ix - gx), dz = Math.abs(iz - gz);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    gScore[start] = 0;
    open.push(start, heur(start));
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let best = start;
    let iterations = 0;

    while (open.size > 0) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { best = goal; break; }
      if (heur(cur) < heur(best)) best = cur;
      if (++iterations > 7000) break;

      const cx = cur % N, cz = (cur - cx) / N;
      for (let k = 0; k < 8; k++) {
        const ix = cx + dirs[k][0], iz = cz + dirs[k][1];
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const nid = iz * N + ix;
        if (g.blocked[nid] || closed[nid]) continue;
        if (k >= 4) {
          // 대각선 코너 컷 방지
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

    // 재구성
    const path = [];
    let node = best;
    let guard = 0;
    while (node !== -1 && node !== start && guard++ < total) {
      const cc = g.cellCenter(node);
      path.push(cc);
      node = came[node];
    }
    path.reverse();
    if (path.length === 0) path.push({ x: tx, z: tz });
    else path[path.length - 1] = { x: tx, z: tz };
    return path;
  }

  reset() {
    this.x = -14; this.z = 8;
    this.y = this.world.heightAt(this.x, this.z);
    this.yaw = 0;
    this.state = STATE.ROAM;
    this.stateTime = 0;
    this.lastKnownValid = false;
    this.lostTimer = 0;
    this._path = [];
    this._repathTimer = 0;
    this._stuckTimer = 0;
    this._wanderBias = 0;
    this._idleTimer = 0;
    this._pickRoamTarget();
    this._syncModel();
  }
}

/* ================= 그리드 & 힘 ================= */
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
        if (world.isBlockedPoint(x, z, margin)) this.blocked[j * this.n + i] = 1;
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

/* ================= 발광 텍스처 ================= */
function makeEyeGlow() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,120,70,1)");
  g.addColorStop(0.3, "rgba(255,60,28,0.55)");
  g.addColorStop(1, "rgba(255,40,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
