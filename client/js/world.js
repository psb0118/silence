import * as THREE from "three";
import { CONFIG, QUALITY } from "./config.js";
import { rand, makeRng, clamp, dist2 } from "./util.js";

/*
 * 세계 구성
 *  - 밤의 숲 + 폐쇄된 연구소 구역(COMPOUND)을 결합한 오픈 에어 시설
 *  - 남쪽 시작 대피소(안전지대) → 중앙 시설 → 북쪽 출구 철문
 *  - 시설은 스파인 복도 + 6개의 개성 있는 방으로 구성, 은신처/충전소/랜드마크 포함
 */

// 구역 좌표 (오픈 에어 시설)
const C = {
  OX0: -46, OX1: 46, OZ0: -50, OZ1: 18,   // 외곽
  spineN: -4, spineS: 2,                    // 복도 벽 (z)
  wallH: 4.4, wallT: 0.45,                  // 점프 눈 apex 2.672·머리 높이 위로 확실히 (눈 위 엿보기 차단)
  headBottom: 3.2,                          // 문 상단 린텔 하단 (머리 높이보다 높게)
  divW: -20, divE: 20                       // 방 분할 (x)
};

const SAFE = CONFIG.safeZone;
const _RED = new THREE.Color(0xdd2233);   // 괴물이 가까우면 조명에 스며드는 붉은 색

// 남측 감시탑 (2층 별관): 1층 창고+계단실, 2층 관측실+비상 해치
const TOWER = {
  x0: 14, x1: 26, z0: 21, z1: 31,     // 외곽 footprint
  deckY: 4.2,                          // 2층 바닥
  wallTop: 7.2,                         // 2층 벽 상단
  stairX0: 14.3, stairX1: 17.7,        // 계단 폭 (홀 내벽 가득 — 추락 방지)
  stairZ0: 22.0, stairZ1: 29.5,        // 계단 경사 구간
  landZ0: 29.5, landZ1: 31.0,          // 상부 평탄 착륙
  divX: 18,                            // 계단실 | 창고·2층홀 경계벽
  doorZ0: 28, doorZ1: 31,              // 상부 출입문 (z 범위, 격자 통과폭 확보)
  stepRise: 0.55,                      // 오를 수 있는 최대 단차
};

export class World {
  constructor(scene, qualityName = "medium") {
    this.scene = scene;
    this.quality = QUALITY[qualityName] || QUALITY.medium;
    this.circles = [];   // {x,z,r}
    this.boxes = [];     // {minX,maxX,minZ,maxZ}
    this.floorSlabs = [];  // 2층 바닥/착륙 {x0,x1,z0,z1,topY} (충돌 없음, 지면 함수용)
    this.grassMaterials = [];
    this.fuses = [];
    this.hidingSpots = [];
    this.drawers = [];
    this.lockedDoors = [];
    this.traps = [];  // 배치된 덫 {x, z, mesh}
    this.missionSpots = [];  // 부가 미션 (관측/테이프/비콘) {kind, x, z, done, mesh}
    this.lamps = [];
    this.walls = [];  // 미니맵용 벽 선분
    this.rooms = [];  // 미니맵용 방 목록
    this.mists = [];
    this.smokes = []; // 연막탄 구름 {x,z,r,ttl,...} — 괴물 시야 차단용
    this.time = 0;
    this.distress = null;   // 괴물의 위치 (조명 붉은 스트로브 연출용)

    this.safeZone = SAFE;
    this.compound = C;

    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildGrass();
    this._buildForest();
    this._buildSafeShelter();
    this._buildCompound();
    this._buildFog();
    this._buildFuses();
    this._buildDoorsAndLoot();
    this._buildMissions();
    this._buildGate();
    this._buildTower();
    this._buildProps();
    this._buildWeather();
  }

  /* ---------- 지형 높이 (결정적 함수) ---------- */
  heightAt(x, z) {
    return (
      0.70 * Math.sin(x * 0.045) * Math.cos(z * 0.050) +
      0.45 * Math.sin(x * 0.110 + 2.1) * Math.cos(z * 0.090 + 0.7) +
      0.22 * Math.sin((x + z) * 0.190 + 0.5)
    );
  }

  // 타워 부지 판정 (수목/바위 배치 제외용)
  _inTowerSite(x, z, pad = 1.5) {
    return x > TOWER.x0 - pad && x < TOWER.x1 + pad && z > TOWER.z0 - pad && z < TOWER.z1 + pad;
  }

  // 계단 경사면 높이 (계단 XZ 범위 안에서만 유효, 그 밖은 -Infinity)
  _stairHeightAt(x, z) {
    const T = TOWER;
    if (x < T.stairX0 || x > T.stairX1 || z < T.stairZ0 || z > T.landZ1) return -Infinity;
    const yBase = this.heightAt((T.stairX0 + T.stairX1) / 2, T.stairZ0);
    if (z >= T.landZ0) return T.deckY;  // 상부 평탄 착륙
    const t = (z - T.stairZ0) / (T.landZ0 - T.stairZ0);
    return yBase + (T.deckY - yBase) * t;
  }

  /* ---------- 실효 지면 높이 (지형 + 2층 슬래브 + 계단) ----------
   * topY가 현재 y + 오름 허용치 안에 있는 면만 밟는다.
   * 아래에서 점프로 뚫고 올라가는 일 없음. 내려갈 때는 낙하. */
  groundHeightAt(x, z, y) {
    let g = this.heightAt(x, z);
    const maxUp = (y === null || y === undefined) ? Infinity : y + TOWER.stepRise;
    for (let i = 0; i < this.floorSlabs.length; i++) {
      const s = this.floorSlabs[i];
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && s.topY <= maxUp && s.topY > g) {
        g = s.topY;
      }
    }
    const st = this._stairHeightAt(x, z);
    if (st > g && st <= maxUp) g = st;
    return g;
  }

  // 층 판정: 0 = 1층, 1 = 2층 (경계 2.5m)
  static levelOf(y) {
    return y >= 2.5 ? 1 : 0;
  }

  /* ---------- 안전지대 / 구역 판정 ---------- */
  inSafeZone(x, z) {
    return x >= SAFE.minX && x <= SAFE.maxX && z >= SAFE.minZ && z <= SAFE.maxZ;
  }
  // 안전지대 밖으로 밀어내는 좌표 반환 (가장 가까운 밖 지점)
  clampOutOfSafeZone(x, z, pad = 1.2) {
    if (!this.inSafeZone(x, z)) return { x, z };
    const cand = [
      { x: SAFE.minX - pad, z },
      { x: SAFE.maxX + pad, z },
      { x, z: SAFE.minZ - pad },
      { x, z: SAFE.maxZ + pad }
    ];
    let best = cand[0], bd = Infinity;
    for (const c of cand) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  inCompound(x, z) {
    return x > C.OX0 - 2 && x < C.OX1 + 2 && z > C.OZ0 - 2 && z < C.OZ1 + 2;
  }

  /* ---------- 하늘 ---------- */
  _buildSky() {
    this.scene.background = new THREE.Color(0x070b12);
    this.scene.fog = new THREE.FogExp2(0x0a111e, 0.024);

    const starGeo = new THREE.BufferGeometry();
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 320;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(rand(0.02, 0.98));
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) + 40;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xaebfda, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })
    );
    this.scene.add(stars);
    this.stars = stars;

    const tex = makeGlowTexture("#dfe8ff", "#7f93c8");
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false }));
    moon.scale.set(46, 46, 1);
    moon.position.set(-120, 120, -220);
    this.scene.add(moon);
    this.moonSprite = moon;

    // 오로라 커튼 (3겹, 밤하늘을 가로지름)
    this.auroras = [];
    const aurTex = makeAuroraTexture();
    const aurCols = [0x39ffc8, 0x4da6ff, 0xb46bff];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(420, 60 + i * 22),
        new THREE.MeshBasicMaterial({
          map: aurTex, transparent: true, opacity: 0.16 - i * 0.03,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
          color: aurCols[i]
        })
      );
      const a = -0.5 + i * 0.55;
      m.position.set(Math.cos(a) * 240, 150 + i * 26, Math.sin(a) * 240);
      m.lookAt(0, 60, 0);
      m.renderOrder = 1;
      this.scene.add(m);
      this.auroras.push({ mesh: m, phase: i * 2.1, speed: 0.05 + i * 0.02 });
    }

    // 지평선 산 실루엣 링
    {
      const mMat = new THREE.MeshBasicMaterial({ color: 0x0a1220, fog: false });
      const rng = makeRng(4242);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rng() * 0.3;
        const r = 200 + rng() * 60;
        const h = 42 + rng() * 55;
        const w = 60 + rng() * 70;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(w / 2, h, 5), mMat);
        cone.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
        cone.rotation.y = rng() * Math.PI;
        this.scene.add(cone);
      }
    }
  }

  /* ---------- 난이도별 무드 (조명/안개) ---------- */
  // 악몽: 손전등이 없으면 거의 완전한 암흑 — 달·별도 숨긴다
  setMood(nightmare) {
    if (!this.hemi) return;
    this._nightmare = !!nightmare;
    if (nightmare) {
      this.hemi.intensity = 0.010;
      this.ambient.intensity = 0.003;
      if (this.moonLight) this.moonLight.intensity = 0.015;
      if (this.scene.fog) { this.scene.fog.color.setHex(0x02040a); this.scene.fog.density = 0.05; }
      this.scene.background = new THREE.Color(0x010204);
      if (this.stars) this.stars.visible = false;
      if (this.moonSprite) this.moonSprite.visible = false;
      if (this.auroras) for (const a of this.auroras) a.mesh.visible = false;
      this._hemiBase = 0.010;
      this._moonBase = 0.015;
    } else {
      this.hemi.intensity = 0.22;
      this.ambient.intensity = 0.06;
      if (this.moonLight) this.moonLight.intensity = 0.32;
      if (this.scene.fog) { this.scene.fog.color.setHex(0x0a111e); this.scene.fog.density = 0.024; }
      this.scene.background = new THREE.Color(0x070b12);
      if (this.stars) this.stars.visible = true;
      if (this.moonSprite) this.moonSprite.visible = true;
      if (this.auroras) for (const a of this.auroras) a.mesh.visible = true;
      this._hemiBase = 0.22;
      this._moonBase = 0.32;
    }
  }

  /* ---------- 조명 ---------- */
  _buildLights() {
    // 손전등 없이는 거의 아무것도 보이지 않는 밤.
    this.hemi = new THREE.HemisphereLight(0x3a5678, 0x0c1810, 0.22);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x232f45, 0.06);
    this.scene.add(this.ambient);

    const moon = new THREE.DirectionalLight(0x7d93c2, 0.32);
    moon.position.set(-60, 90, -80);
    moon.castShadow = this.quality.shadows;
    moon.shadow.mapSize.set(512, 512);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 300;
    const s = 110;
    moon.shadow.camera.left = -s;
    moon.shadow.camera.right = s;
    moon.shadow.camera.top = s;
    moon.shadow.camera.bottom = -s;
    moon.shadow.bias = -0.0009;
    this.scene.add(moon);
    this.moonLight = moon;
  }

  setShadows(enabled) {
    this.moonLight.castShadow = enabled;
    this.scene.traverse((o) => {
      if (o.isMesh && o.userData.castShadow !== undefined) o.castShadow = enabled ? o.userData.castShadow : false;
    });
  }

  /* ---------- 지면 ---------- */
  _buildTerrain() {
    const size = 400;
    const geo = new THREE.PlaneGeometry(size, size, 160, 160);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, this.heightAt(x, z));
    }
    geo.computeVertexNormals();

    const groundTex = makeGroundTexture();
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(60, 60);

    const mat = new THREE.MeshStandardMaterial({ color: 0x5a6b46, map: groundTex, roughness: 1.0, metalness: 0.0 });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.userData.castShadow = false;
    this.scene.add(ground);

    // 시설 바닥(자갈/콘크리트) 느낌의 패치
    const concrete = makeConcreteTexture();
    concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
    concrete.repeat.set(14, 14);
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(C.OX1 - C.OX0 + 6, C.OZ1 - C.OZ0 + 6, 40, 40),
      new THREE.MeshStandardMaterial({ color: 0x6b6f6a, map: concrete, roughness: 1 })
    );
    slab.rotation.x = -Math.PI / 2;
    const scx = (C.OX0 + C.OX1) / 2, scz = (C.OZ0 + C.OZ1) / 2;
    const sp = slab.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const lx = sp.getX(i), lz = sp.getZ(i);
      sp.setY(i, this.heightAt(scx + lx, scz - lz));
    }
    slab.geometry.computeVertexNormals();
    slab.position.set(scx, 0.03, scz);
    slab.receiveShadow = true;
    slab.userData.castShadow = false;
    this.scene.add(slab);
  }

  /* ---------- 잔디 ---------- */
  _buildGrass() {
    const count = this.quality.grass;
    const radius = this.quality.grassRadius;
    const bladeTex = makeGrassTexture();

    const geo = makeTuftGeometry(0.55, 0.42, 3);
    const mat = new THREE.MeshStandardMaterial({
      map: bladeTex, color: 0xffffff, alphaTest: 0.42,
      side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0
    });
    const normals = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) { normals[i * 3 + 1] = 1; }
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           vec3 iw = (instanceMatrix * vec4(transformed, 1.0)).xyz;
         #else
           vec3 iw = transformed;
         #endif
         float bend = transformed.y;
         float sway = sin(uTime * 1.6 + iw.x * 0.40 + iw.z * 0.33) * 0.085
                    + sin(uTime * 3.3 + iw.x * 1.10 + iw.z * 0.90) * 0.030;
         transformed.x += sway * bend;
         transformed.z += sway * 0.7 * bend;`
      );
      mat.userData.shader = shader;
    };

    const inst = new THREE.InstancedMesh(geo, mat, count);
    inst.frustumCulled = false;
    inst.receiveShadow = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const rng = makeRng(90210);

    let placed = 0, guard = 0;
    while (placed < count && guard < count * 4) {
      guard++;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.inCompound(x, z) || this.inSafeZone(x, z)) continue;
      const y = this.heightAt(x, z);
      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.y = rng() * Math.PI * 2;
      const s = 0.7 + rng() * 0.8;
      dummy.scale.set(s, s * (0.8 + rng() * 0.6), s);
      dummy.updateMatrix();
      inst.setMatrixAt(placed, dummy.matrix);
      const hue = 0.24 + rng() * 0.09;
      const light = 0.22 + rng() * 0.20;
      color.setHSL(hue, 0.5, light);
      inst.setColorAt(placed, color);
      placed++;
    }
    // 남은 슬롯은 지하로 숨김
    for (let i = placed; i < count; i++) {
      dummy.position.set(0, -50, 0); dummy.scale.set(0.001, 0.001, 0.001);
      dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

    this.scene.add(inst);
    this.grass = inst;
    this.grassMaterials.push(mat);
  }

  /* ---------- 숲 (시설 바깥) ---------- */
  _buildForest() {
    const rng = makeRng(1337);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x463a26, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f4a37, roughness: 1 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5d646e, roughness: 0.95, metalness: 0.05 });

    // 종류별 InstancedMesh로 합쳐 그리기 호출을 줄인다 (렉 최적화)
    const N = 84;
    const trunkGeo = new THREE.CylinderGeometry(1, 1.75, 1, 6);
    const coneGeo = new THREE.ConeGeometry(1, 1, 7);   // 3단 원뿔 + 로컬 스케일
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const dm = new THREE.Object3D();
    const make = (geo, mat, count) => { const im = new THREE.InstancedMesh(geo, mat, count); im.castShadow = true; im.receiveShadow = true; return im; };
    const trunks = make(trunkGeo, trunkMat, N);
    const coneA = make(coneGeo, leafMat, N), coneB = make(coneGeo, leafMat, N), coneC = make(coneGeo, leafMat, N);
    const rocks = make(rockGeo, rockMat, 34);
    let ci = 0, ri = 0;

    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2;
      const r = 14 + rng() * 48;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 8) continue;
      if (this.inCompound(x, z) || this.inSafeZone(x, z) || this._inTowerSite(x, z)) continue;
      const y = this.heightAt(x, z);
      const scale = 0.8 + rng() * 0.8;
      const trunkH = 3.2 * scale;
      const rot = rng() * Math.PI * 2;

      dm.position.set(x, y + trunkH / 2, z); dm.scale.set(0.16 * scale, trunkH, 0.16 * scale); dm.rotation.set(0, rot, 0);
      dm.updateMatrix(); trunks.setMatrixAt(i, dm.matrix);
      const coneDefs = [
        [(1.7 * scale * 2), (1.9 * scale), 0, 0],
        [(1.35 * scale * 2), (1.65 * scale), trunkH + (1.9 * scale) * 0.55, 0],
        [(1.0 * scale * 2), (1.4 * scale), trunkH + (1.9 * scale) * 0.55 + (1.65 * scale) * 0.55, 0]
      ];
      for (let k = 0; k < 3; k++) {
        const [cw, ch, oy] = coneDefs[k];
        dm.position.set(x, y + oy + ch / 2, z); dm.scale.set(cw / 2, ch, cw / 2); dm.rotation.set(0, rot, 0);
        dm.updateMatrix();
        (k === 0 ? coneA : k === 1 ? coneB : coneC).setMatrixAt(i, dm.matrix);
      }
      this.circles.push({ x, z, r: 0.5 * scale, y0: y - 1, y1: y + 9 });
      ci++;
    }

    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const r = 8 + rng() * 50;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.inCompound(x, z) || this.inSafeZone(x, z) || this._inTowerSite(x, z)) continue;
      const y = this.heightAt(x, z);
      const s = 0.5 + rng() * 1.6;
      dm.position.set(x, y + s * 0.35, z); dm.scale.setScalar(s); dm.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dm.updateMatrix(); rocks.setMatrixAt(ri, dm.matrix);
      if (s > 0.8) this.circles.push({ x, z, r: s * 0.75, y0: y - 1, y1: y + s });
      ri++;
    }
    const park = (im, n) => { for (let i = n; i < im.count; i++) { dm.position.set(0, -50, 0); dm.scale.setScalar(0.001); dm.rotation.set(0, 0, 0); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); } im.instanceMatrix.needsUpdate = true; };
    park(trunks, ci); park(coneA, ci); park(coneB, ci); park(coneC, ci); park(rocks, ri);
    this.scene.add(trunks, coneA, coneB, coneC, rocks);
    this.forest = { trunks, coneA, coneB, coneC, rocks };
  }

  /* ---------- 바닥에 드리운 낮은 안개 ---------- */
  _buildFog() {
    const geo = new THREE.PlaneGeometry(72, 36, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const spots = [
      [-33, -2], [0, 8], [0, -30], [0, 17],
      [-33, -27], [33, -27], [-33, 1], [33, 1]
    ];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const mat = new THREE.MeshBasicMaterial({
        color: 0x7d92b2, transparent: true,
        opacity: 0.045 + Math.sin(i * 2.7) * 0.012,
        depthWrite: false, fog: false, side: THREE.DoubleSide
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, this.heightAt(x, z) + 0.22, z);
      m.rotation.z = (i * 1.7) % (Math.PI * 2);
      m.scale.set(0.8 + ((i * 31) % 10) / 10, 1, 0.8 + ((i * 13) % 10) / 10);
      this.scene.add(m);
      this.mists.push(m);
    }
  }

  /* ============================================================
   *  시작 대피소 (안전지대)
   * ============================================================ */
  _buildSafeShelter() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5b5344, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x33302a, roughness: 1 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a5334, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x59616c, roughness: 0.5, metalness: 0.7 });

    const cx = 0, cz = 44, w = 13, d = 11, h = 4.4;
    // 벽 (북쪽 z- 에 출입구)
    this._roomWalls(cx, cz, w, d, h, C.wallT, wallMat, { N: { center: 0, width: 3.2 } });

    // 지붕 (벽 상단과 겹치게 → 머리 관통·이음새 틈 차단)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), roofMat);
    roof.position.set(cx, this.heightAt(cx, cz) + h - 0.7, cz);
    roof.castShadow = true; roof.userData.castShadow = true;
    this.scene.add(roof);

    this.spawn = { x: 0, z: 45 };

    // 실내 조명 (따뜻한 색 → 바깥보다 안전해 보이게)
    const lamp = new THREE.PointLight(0xffd9a0, 22, 24, 1.6);
    lamp.position.set(cx, this.heightAt(cx, cz) + 2.6, cz);
    this.scene.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 2.4 }));
    bulb.position.copy(lamp.position);
    this.scene.add(bulb);
    this.lamps.push({ light: lamp, mat: bulb.material, base: 22, phase: rand(0, 6), speed: 1.0, flicker: 0.08, color: new THREE.Color(0xffd9a0), x: cx, z: cz });

    // 작업대 + 의자
    this._desk(cx - 3.4, cz - 3.2, 0, woodMat, metalMat);
    this._chair(cx - 1.6, cz - 3.2, -1.1, woodMat);
    this._crate(cx + 4.4, cz + 3.0, 1.1, woodMat);
    this._crate(cx + 4.4, cz + 1.4, 0.9, woodMat);

    // ---- 손전등 충전소 ----
    const station = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.25, 10), metalMat);
    post.position.y = 0.62;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.35), metalMat);
    head.position.y = 1.35;
    station.add(post, head);
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.6, metalness: 0.4 }));
    cradle.position.y = 1.66;
    station.add(cradle);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x76ffd0, emissive: 0x22ffb0, emissiveIntensity: 2 }));
    led.position.set(0, 1.5, 0.2);
    station.add(led);
    const sl = new THREE.PointLight(0x53ffc0, 6, 6, 2);
    sl.position.set(0, 1.6, 0.2);
    station.add(sl);
    const sx = cx + 4.6, sz = cz - 3.4;
    station.position.set(sx, this.heightAt(sx, sz), sz);
    station.rotation.y = -Math.PI / 2;
    station.traverse((o) => { o.castShadow = false; });
    this.scene.add(station);
    this.circles.push({ x: sx, z: sz, r: 0.35, y0: this.heightAt(sx, sz) - 0.5, y1: this.heightAt(sx, sz) + 1.7 });
    this.chargeStation = {
      x: sx, z: sz, y: this.heightAt(sx, sz),
      led, light: sl, group: station,
      setActive(on) {
        led.material.emissiveIntensity = on ? 3.2 : 1.2;
        sl.intensity = on ? 10 : 5;
      }
    };
  }

  /* ============================================================
   *  시설 구역 (링 복도 + 허브 + 데드엔드 구조)
   *  - 순환 링: S/W/E/N 복도가 중앙 블록(로비·휴게실·저장소·사무실)을 감싸고
   *    코너가 모두 열려 있어 도는 동선(Loop)을 형성 — 괴물 추격 회피의 핵심
   *  - 허브: 남쪽 외벽 입구 → 현관 → (0,10) → S복도 (허브-스포크 시작점)
   *  - 데드엔드: 서측/동측 폐창고(붉은 등 유인) · 숙소 · 보급실 · 북측 방 5개
   *  - 숏컷: 잠긴 문 2개(열쇠 또는 비밀번호)가 링을 자르는 지름길
   *  - 저천장: 출구 통로·좁은 중앙 복도 일부(머리 위 압박)
   *  - 북쪽 외벽(중앙, 출구통로) → 출구 철문
   * ============================================================ */
  _buildCompound() {
    this.walls = [];      // 미니맵용 벽 선분
    this.rooms = [];      // 미니맵용 방 정보
    this.wallMat = new THREE.MeshStandardMaterial({ color: 0xe8ebee, map: makeWallTexture(), roughness: 0.95, metalness: 0.1 });
    this.rustMat = new THREE.MeshStandardMaterial({ color: 0x75452f, roughness: 0.85, metalness: 0.25 });
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x59616c, roughness: 0.5, metalness: 0.7 });
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9 });
    this.pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6, metalness: 0.6 });

    const H = C.wallH, T = C.wallT, M = this.wallMat;
    const { OX0, OX1, OZ0, OZ1 } = C;
    const door = (c, w) => ({ center: c, width: w });

    /* =====================================================
     * [재설계] 순환 링 복도 + 중앙 블록 + 북측 선형 위험 구역
     *  - 허브: 남쪽 현관(입구) → S복도 (허브-스포크 시작점)
     *  - 링: S/W/E/N 복도가 중앙 블록을 감싸는 완전 순환 동선
     *  - 좁은 중앙 복도(x±1.5): 블록을 관통하는 압박 숏컷
     *  - 숏컷: 잠긴 문 2개(열쇠or비밀번호)가 링을 자르는 지름길
     *  - 데드엔드: 서/동측 폐창고 (붉은 등으로 유인, 안에서 방향 전환)
     *  - 눈먼 코너: 블록 코너 연장 벽 + 90° 회전 링
     *  - 저천장: 출구 통로·중앙 복도 일부(2.8m)
     * ===================================================== */

    // ---- 외곽 벽 ----
    this._wallLine("x", OZ1, OX0, OX1, [door(0, 5)], H, T, M);      // 남쪽: 입구 → 현관
    this._wallLine("x", OZ0, OX0, OX1, [door(0, 4)], H, T, M);      // 북쪽: 출구 → 철문
    this._wallLine("z", OX0, OZ0, OZ1, [], H, T, M);
    this._wallLine("z", OX1, OZ0, OZ1, [], H, T, M);

    // ---- 남쪽 밴드 (z 10..18): 숙소 | 현관(허브) | 보급실 ----
    this._wallLine("x", 10, OX0, OX1, [door(-24, 3.2), door(0, 4), door(24, 3.2)], H, T, M);

    // ---- 중앙 블록 남벽 (z=6, S복도와 경계) ----
    this._wallLine("x", 6, -30, 30, [door(-20, 3.2), door(0, 3), door(16, 3.2)], H, T, M);

    // ---- 남쪽 밴드 내부 분할: 숙소 | 현관 | 보급실 (각각 고립 데드엔드) ----
    this._wallLine("z", -12, 10, 18, [], H, T, M);
    this._wallLine("z", 12, 10, 18, [], H, T, M);

    // ---- 링 복도 서/동 경계벽 (x=±34: 방 ↔ 복도) ----
    this._wallLine("z", -34, -34, 10, [door(-20, 3.2), door(0, 4)], H, T, M);  // 통신실·서측 폐창고 동벽
    this._wallLine("z", 34, -34, 10, [door(-20, 3.2), door(0, 4)], H, T, M);   // 저장동·동측 폐창고 서벽

    // ---- 중앙 블록 외곽 (x=±30) — 코너 눈먼참을 위한 연장 벽 포함 ----
    //  잠긴 숏컷 문: A(저장소) 3.5 · B(사무실) 4.0 — 벽 갭 폭과 문 폭 일치
    this._wallLine("z", -30, -31.8, 7.8, [door(-20, 3.2), door(-2, 3.2)], H, T, M);
    this._wallLine("z", 30, -31.8, 7.8, [door(-22, 3.5), door(-4, 4.0)], H, T, M);

    // ---- 중앙 블록 북벽 (z=-30, N복도와 경계) ----
    this._wallLine("x", -30, -30, 30, [door(-14, 3.2), door(0, 3), door(20, 3.2)], H, T, M);

    // ---- 북측 밴드 남벽 (z=-34, N복도 ↔ 위험 구역) ----
    this._wallLine("x", -34, OX0, OX1,
      [door(-40, 3.2), door(-10, 3.2), door(0, 3), door(10, 3.2), door(34, 3.2)], H, T, M);

    // ---- 서측 구역 분할 (x -46..-34): 통신실(z -34..-6) / 서측 폐창고(z -6..10) ----
    this._wallLine("x", -6, -46, -34, [], H, T, M);
    // ---- 동측 구역 분할: 저장동 / 동측 폐창고 ----
    this._wallLine("x", -6, 34, 46, [], H, T, M);

    // ---- 북측 밴드 내부 (z -50..-34): 기계창고 | 서기록실 | 출구통로 | 동기록실 | 발전기실 ----
    this._wallLine("z", -20, OZ0, -34, [door(-42, 3.2)], H, T, M);
    this._wallLine("z", -3, OZ0, -34, [door(-44, 2.8)], H, T, M);
    this._wallLine("z", 3, OZ0, -34, [door(-44, 2.8)], H, T, M);
    this._wallLine("z", 20, OZ0, -34, [door(-42, 3.2)], H, T, M);

    // ---- 중앙 블록 내부: 좁은 중앙 복도(x±1.5) + 방 분할 ----
    this._wallLine("z", -1.5, -30, 6, [door(-20, 2.8), door(-2, 2.8)], H, T, M);
    this._wallLine("z", 1.5, -30, 6, [door(-22, 2.8), door(-4, 2.8)], H, T, M);
    this._wallLine("x", -12, -30, -1.5, [door(-14, 3.2)], H, T, M);  // 로비 | 휴게실
    this._wallLine("x", -14, 1.5, 30, [door(16, 3.2)], H, T, M);     // 저장소 | 사무실

    // ---- 지붕 (방만 덮고 복도/좁은 복도/출구통로는 밤하늘 개방) ----
    this._roof(-33, -42, 26, 16, M);     // 기계창고
    this._roof(-11.5, -42, 17, 16, M);   // 서기록실
    this._roof(11.5, -42, 17, 16, M);    // 동기록실
    this._roof(33, -42, 26, 16, M);      // 발전기실
    this._roof(-40, -20, 12, 28, M);     // 통신실
    this._roof(-40, 2, 12, 16, M);       // 서측 폐창고
    this._roof(40, -20, 12, 28, M);      // 저장동
    this._roof(40, 2, 12, 16, M);        // 동측 폐창고
    this._roof(-29, 14, 34, 8, M);       // 숙소
    this._roof(0, 14, 24, 8, M);         // 현관
    this._roof(29, 14, 34, 8, M);        // 보급실
    this._roof(-15.75, -21, 28.5, 18, M); // 로비
    this._roof(-15.75, -3, 28.5, 18, M);  // 휴게실
    this._roof(15.75, -22, 28.5, 16, M);  // 저장소
    this._roof(15.75, -4, 28.5, 20, M);   // 사무실

    // ---- 낮은 천장 (압박감: 눈높이 위·점프 apex 아래) ----
    this._lowCeiling(-3, -46, 3, -36);      // 출구 통로
    this._lowCeiling(-1.5, -14, 1.5, -6);   // 좁은 중앙 복도

    // ---- 랜드마크 조명 (발광 전용 — 렉 최적화) ----
    this._lamp(0, 10.8, 0xd7263d, 11, 16);   // 현관 붉은 등 (입구 강제투시 초점)
    this._lamp(-14, 8, 0xffa040, 12, 16);    // S복도 서
    this._lamp(14, 8, 0xffa040, 12, 16);     // S복도 동
    this._lamp(-32, -4, 0xffa040, 12, 16);   // W복도
    this._lamp(-32, -24, 0xffa040, 12, 16);
    this._lamp(32, -4, 0xffa040, 12, 16);    // E복도
    this._lamp(32, -24, 0xffa040, 12, 16);
    this._lamp(-20, -32, 0xffd0a0, 13, 16);  // N복도
    this._lamp(20, -32, 0xffd0a0, 13, 16);
    this._lamp(0, -8, 0x7fe6c8, 10, 12);     // 좁은 복도 (녹색 유도)
    this._lamp(0, -24, 0x7fe6c8, 10, 12);
    this._lamp(0, -40, 0x9fd0ff, 13, 18);    // 출구 통로 (차가운 유도등)
    this._lamp(-42, 8, 0xd7263d, 10, 15);    // 서측 폐창고 끝 (붉은 유인등)
    this._lamp(42, 8, 0xd7263d, 10, 15);     // 동측 폐창고 끝
    this._lamp(-40, -28, 0x9fd0ff, 11, 16);  // 통신실
    this._lamp(40, -28, 0xffb060, 11, 16);   // 저장동
    this._lamp(-15, -21, 0xffd9a0, 13, 18);  // 로비
    this._lamp(-15, -3, 0xffd9a0, 13, 18);   // 휴게실
    this._lamp(15, -22, 0xd7263d, 11, 16);   // 저장소
    this._lamp(15, -4, 0xffb060, 12, 17);    // 사무실
    this._lamp(-33, -42, 0x9fd0ff, 12, 17);  // 기계창고
    this._lamp(33, -42, 0xffb060, 12, 17);   // 발전기실
    this._lamp(-11, -46, 0x9fd0ff, 10, 14);  // 서기록실
    this._lamp(11, -46, 0x9fd0ff, 10, 14);   // 동기록실
    this._lamp(-29, 14, 0xffd9a0, 13, 17);   // 숙소
    this._lamp(29, 14, 0xffd0a0, 13, 17);    // 보급실

    // ---- 방별 가구/프롭/은신처 (좌표 여백 검증 완료) ----
    // 기계창고 (R1)
    this._crate(-38, -46, 1.2, this.woodMat);
    this._crate(-36, -45, 1.0, this.woodMat);
    this._shelf(-28, -47, 0, 4, this.metalMat);
    this._shelf(-44, -38, Math.PI / 2, 4, this.metalMat);
    this._locker(-24, -46, this._yawTo(-1, 0));
    this._locker(-42, -36, this._yawTo(0, -1));
    this._barrel(-30, -37);
    this._generator(-40, -42);
    // 발전기실 (R2)
    this._generator(29, -46);
    this._generator(37, -46);
    this._shelf(33, -37, 0, 6, this.metalMat);
    this._crate(27, -38, 1.1, this.woodMat);
    this._locker(42, -37, this._yawTo(-1, 0));
    this._barrel(42, -46);
    // 서기록실 (WingA)
    this._deskHide(-15, -46, 0);
    this._deskHide(-8, -46, 0);
    this._shelf(-11.5, -37, 0, 5, this.metalMat);
    this._locker(-17, -37, this._yawTo(1, 0));
    this._crate(-6, -38, 1.0, this.woodMat);
    // 동기록실 (WingB)
    this._shelf(11.5, -47, 0, 6, this.metalMat);
    this._deskHide(7, -37, Math.PI);
    this._deskHide(14, -37, Math.PI);
    this._locker(17, -46, this._yawTo(-1, 0));
    this._crate(6, -46, 1.0, this.woodMat);
    // 통신실
    this._shelf(-44, -26, Math.PI / 2, 5, this.metalMat);
    this._shelf(-44, -14, Math.PI / 2, 5, this.metalMat);
    this._shelf(-36, -26, -Math.PI / 2, 5, this.metalMat);
    this._shelf(-36, -12, -Math.PI / 2, 5, this.metalMat);
    this._cabinet(-40, -30, Math.PI);
    this._locker(-40, -9, 0);
    this._deskHide(-40, -17, 0);
    this._crate(-36, -8, 1.0, this.woodMat);
    // 서측 폐창고 (데드엔드)
    this._crate(-44, 6, 1.2, this.woodMat);
    this._crate(-44, 4.5, 1.0, this.woodMat);
    this._shelf(-40, -3, 0, 5, this.metalMat);
    this._deskHide(-42, -2, 0);
    this._barrel(-36, 6);
    this._locker(-36, 8, Math.PI);
    // 저장동
    this._shelf(44, -26, Math.PI / 2, 5, this.metalMat);
    this._shelf(44, -14, Math.PI / 2, 5, this.metalMat);
    this._shelf(36, -26, -Math.PI / 2, 5, this.metalMat);
    this._shelf(36, -12, -Math.PI / 2, 5, this.metalMat);
    this._cabinet(40, -30, Math.PI);
    this._locker(40, -9, 0);
    this._deskHide(40, -17, 0);
    this._crate(43, -8, 1.0, this.woodMat);
    // 동측 폐창고 (데드엔드)
    this._crate(44, 6, 1.2, this.woodMat);
    this._crate(44, 4.5, 1.0, this.woodMat);
    this._shelf(40, -3, 0, 5, this.metalMat);
    this._deskHide(42, -2, 0);
    this._barrel(36, 6);
    this._locker(36, 8, Math.PI);
    // 숙소 (좁은 방: 침대 2열 + 캐비닛)
    for (let i = 0; i < 3; i++) {
      this._bed(-43 + i * 1.6, 12.5, this.woodMat);
      this._bed(-43 + i * 1.6, 15.5, this.woodMat);
    }
    this._locker(-30, 17, Math.PI);
    this._locker(-28.6, 17, Math.PI);
    this._cabinet(-24, 17, Math.PI);
    this._deskHide(-16, 13, 0);
    this._crate(-34, 17, 1.0, this.woodMat);
    // 현관 (허브 — 입구에서 붉은 등로 강제 투시)
    this._addBox(-4, 16.5, 3, 1.0, 1.1, this.woodMat);
    this._registerHide(-4, 16.5, Math.PI, "crawl", 0.6);
    this._shelf(8, 17, 0, 4, this.metalMat);
    this._deskHide(10, 12.5, Math.PI);
    this._chair(3, 14.5, 0.4, this.woodMat);
    this._crate(-9, 12.5, 1.1, this.woodMat);
    this._sign(3, 12.5, 0, 0xff5533);
    // 보급실
    this._shelf(29, 17, 0, 6, this.metalMat);
    this._shelf(20, 17, 0, 6, this.metalMat);
    this._locker(36, 17, Math.PI);
    this._locker(37.4, 17, Math.PI);
    this._deskHide(41, 12.5, Math.PI);
    this._crate(22, 12.5, 1.1, this.woodMat);
    this._crate(24, 13.5, 1.0, this.woodMat);
    this._barrel(18, 13);
    // 로비 (리셉션)
    this._furnishReception(-15.75, -21);
    // 휴게실
    this._addBox(-17, 2, 5, 1.0, 1.1, this.woodMat);
    this._cabinet(-23, 2, this._yawTo(0, -1));
    this._cabinet(-13, 2, this._yawTo(0, -1));
    this._shelf(-8, -8, Math.PI / 2, 5, this.metalMat);
    this._chair(-17, -2, 0.4, this.woodMat);
    this._chair(-15, -4, 0, this.woodMat);
    this._crate(-26, -8, 1.0, this.woodMat);
    this._barrel(-4, 4);
    this._deskHide(-24, -8, 0);
    // 저장소
    this._furnishStore(15.75, -22);
    // 사무실
    this._furnishOffice(15.75, -4);

    // ---- 방 레지스트리 (미니맵) ----
    this.rooms = [
      { x: -33, z: -42, w: 26, d: 16, name: "기계창고" },
      { x: -11.5, z: -42, w: 17, d: 16, name: "서기록실" },
      { x: 11.5, z: -42, w: 17, d: 16, name: "동기록실" },
      { x: 33, z: -42, w: 26, d: 16, name: "발전기실" },
      { x: -40, z: -20, w: 12, d: 28, name: "통신실" },
      { x: -40, z: 2, w: 12, d: 16, name: "서측 폐창고" },
      { x: 40, z: -20, w: 12, d: 28, name: "저장동" },
      { x: 40, z: 2, w: 12, d: 16, name: "동측 폐창고" },
      { x: -29, z: 14, w: 34, d: 8, name: "숙소" },
      { x: 0, z: 14, w: 24, d: 8, name: "현관" },
      { x: 29, z: 14, w: 34, d: 8, name: "보급실" },
      { x: -15.75, z: -21, w: 28.5, d: 18, name: "로비" },
      { x: -15.75, z: -3, w: 28.5, d: 18, name: "휴게실" },
      { x: 15.75, z: -22, w: 28.5, d: 16, name: "저장소" },
      { x: 15.75, z: -4, w: 28.5, d: 20, name: "사무실" }
    ];

    // ---- 물탱크 / 안테나 (외부 랜드마크) ----
    this._waterTower(38, 34);
    this._antenna(-40, 30);
  }

  /* ---------- 벽/지붕/조명 헬퍼 ---------- */
  _roomWalls(cx, cz, w, d, h, t, mat, doors = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    // N(z0) / S(z1) walls run along x
    this._wallLine("x", z0, x0, x1, doors.N ? [{ center: cx + (doors.N.center || 0), width: doors.N.width }] : [], h, t, mat);
    this._wallLine("x", z1, x0, x1, doors.S ? [{ center: cx + (doors.S.center || 0), width: doors.S.width }] : [], h, t, mat);
    // W(x0) / E(x1) run along z
    this._wallLine("z", x0, z0, z1, doors.W ? [{ center: cz + (doors.W.center || 0), width: doors.W.width }] : [], h, t, mat);
    this._wallLine("z", x1, z0, z1, doors.E ? [{ center: cz + (doors.E.center || 0), width: doors.E.width }] : [], h, t, mat);
  }

  // axis 'x': z=fixed, x in [from,to] / axis 'z': x=fixed, z in [from,to]
  // yBase: 절대 높이 기준(2층 벽용). null이면 지형 기준(기존 동작).
  _wallLine(axis, fixed, from, to, gaps, h, t, mat, yBase = null) {
    const segs = [];
    let cur = from;
    const gs = (gaps || []).slice().sort((a, b) => a.center - b.center);
    for (const g of gs) {
      const a = g.center - g.width / 2, b = g.center + g.width / 2;
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < to) segs.push([cur, to]);
    // 문(갭) 위 린텔 헤더 — 머리 높이 위 문틈으로 방 안이 엿보이지 않도록 벽을 채운다.
    // (충돌·미니맵에는 넣지 않는다: 문은 통과/개방으로 유지)
    const lintelBottom = C.headBottom;
    const lintelTop = h - 0.5;               // 벽 상단 (_addBox 오프셋 -0.5 기준)
    if (lintelTop - lintelBottom > 0.1) {
      const mh = lintelTop - lintelBottom;
      for (const g of gs) {
        const gx = axis === "x" ? g.center : fixed;
        const gz = axis === "x" ? fixed : g.center;
        const gw = axis === "x" ? g.width : t;
        const gd = axis === "x" ? t : g.width;
        const m = new THREE.Mesh(new THREE.BoxGeometry(gw, mh, gd), mat);
        const ly = yBase !== null ? yBase + 0.5 : this.heightAt(gx, gz);
        m.position.set(gx, ly + lintelBottom + mh / 2, gz);
        m.castShadow = true; m.receiveShadow = true;
        m.userData.castShadow = true;
        this.scene.add(m);
      }
    }
    for (const [a, b] of segs) {
      if (b - a < 0.15) continue;
      const cx = axis === "x" ? (a + b) / 2 : fixed;
      const cz = axis === "x" ? fixed : (a + b) / 2;
      const w = axis === "x" ? (b - a) : t;
      const dd = axis === "x" ? t : (b - a);
      this._addBox(cx, cz, w, dd, h, mat, yBase);
      // 미니맵용 벽 선분 (중심선 + 층 태그)
      const wy0 = yBase !== null ? yBase : -3, wy1 = yBase !== null ? yBase + h : 6;
      if (axis === "x") this.walls.push({ x0: a, z0: fixed, x1: b, z1: fixed, y0: wy0, y1: wy1 });
      else this.walls.push({ x0: fixed, z0: a, x1: fixed, z1: b, y0: wy0, y1: wy1 });
    }
  }

  _addBox(cx, cz, w, d, h, mat, yBase = null) {
    const y = yBase !== null ? yBase + 0.5 : this.heightAt(cx, cz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, y + h / 2 - 0.5, cz);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.castShadow = true;
    this.scene.add(m);
    // Y-태그: 1층 벽이 2층 이동을 막지 않도록 수직 범위를 기록
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
      y0: y - 1.5, y1: y - 0.5 + h });
    return m;
  }

  // 절대 높이 기준 박스 (2층 벽·기둥용) — mesh 중심 = yBase + h/2
  _addBoxY(cx, cz, w, d, h, mat, yBase) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, yBase + h / 2, cz);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.castShadow = true;
    this.scene.add(m);
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2,
      y0: yBase, y1: yBase + h });
    return m;
  }

  _roof(cx, cz, w, d, mat) {
    // 0.6 두께·벽 상단과 겹치는 위치 → 천장 관통(머리 pokes)·이음새 틈 차단
    const m = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, d + 0.6), mat);
    m.position.set(cx, this.heightAt(cx, cz) + C.wallH - 0.7, cz);
    m.castShadow = true; m.userData.castShadow = true;
    this.scene.add(m);
  }

  // 낮은 천장 (머리 위로 낮게 눌러 답답함/압박감 — 눈높이 1.67·점프 apex 2.67 위)
  _lowCeiling(x0, z0, x1, z1, y = 2.8) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.16, z1 - z0), this.wallMat);
    m.position.set(cx, this.heightAt(cx, cz) + y, cz);
    m.castShadow = true; m.userData.castShadow = true;
    this.scene.add(m);
  }

  _lamp(x, z, color, intensity, dist, yBase = null) {
    // 최적화: 정적 등은 실광원(PointLight) 대신 발광(emissive) 구로만 렌더링한다.
    // 중첩되는 실광원이 많으면 셰이더 비용이 급증해 렉이 심해진다.
    const y = (yBase !== null ? yBase : this.heightAt(x, z)) + 2.5;
    const lc = new THREE.Color(color);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: lc.clone(), emissiveIntensity: 2.4 }));
    bulb.position.set(x, y, z);
    this.scene.add(bulb);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture("#ffffff", "#000000"), transparent: true, depthWrite: false,
      color: lc.clone(), opacity: 0.24, fog: false
    }));
    glow.scale.set(1.8, 1.8, 1);
    glow.position.copy(bulb.position);
    this.scene.add(glow);
    this.lamps.push({ light: null, mat: bulb.material, glow, base: intensity, phase: rand(0, 6), speed: rand(6, 13), flicker: rand(0.15, 0.4), color: lc, x, z });
  }

  /* ---------- 방 가구 (줄맞춤: 32×20/28×16 실 크기에 맞춘 콤팩트 배치) ---------- */
  _furnishStorage(cx, cz) {
    const crates = [[-5, -4, 1.2], [-7, 2, 1.0], [-6, 7, 1.1], [5, -6, 1.1], [6, 3, 1.0]];
    for (const [ox, oz, s] of crates) this._crate(cx + ox, cz + oz, s, this.woodMat);
    this._shelf(cx - 7, cz - 4, Math.PI / 2, 3.2, this.metalMat);
    this._shelf(cx + 7, cz + 5, -Math.PI / 2, 3.2, this.metalMat);
    // 은신: 사물함
    this._locker(cx + 8, cz - 7, this._yawTo(-1, 0));
    this._locker(cx - 8, cz - 8, this._yawTo(1, 0));
    this._barrel(cx - 5, cz + 8);
    this._barrel(cx + 8, cz + 8);
  }

  _furnishMachine(cx, cz) {
    this._generator(cx - 6, cz + 6);
    this._generator(cx + 6, cz + 6);
    this._generator(cx - 6, cz - 6);
    // 파이프 랙
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 8, 8), this.pipeMat);
      p.rotation.z = Math.PI / 2;
      p.position.set(cx, this.heightAt(cx, cz - 6) + 1.6 + i * 0.35, cz - 6 + i * 0.32);
      p.rotation.x = 0.04;
      p.castShadow = true; p.userData.castShadow = true;
      this.scene.add(p);
    }
    // 크레이트 은신 코너
    this._crate(cx - 7, cz + 8, 1.4, this.woodMat);
    this._crate(cx - 5.6, cz + 8, 1.2, this.woodMat);
    this._locker(cx - 8, cz + 8, this._yawTo(1, 1)); // 코너 사물함 은신
    this._barrel(cx + 8, cz - 8);
    this._barrel(cx + 6.6, cz - 8);
  }

  _furnishOffice(cx, cz) {
    // 책상 (밑 숨기)
    this._deskHide(cx - 6, cz - 6, 0);
    this._deskHide(cx - 6, cz + 2, 0);
    this._deskHide(cx + 5, cz - 6, Math.PI);
    this._deskHide(cx + 5, cz + 2, Math.PI);
    this._desk(cx - 6, cz + 7, 0, this.woodMat, this.metalMat);
    this._chair(cx - 4.4, cz + 7, 1.4, this.woodMat);
    this._shelf(cx + 8, cz + 7, -Math.PI / 2, 3.0, this.metalMat);
    this._cabinet(cx - 9, cz + 7, this._yawTo(1, 0));
    this._crate(cx + 9, cz - 8, 1.0, this.woodMat);
  }

  _furnishServer(cx, cz) {
    // 서버 랙(선반) 2열 + 벽 캐비닛
    this._shelf(cx - 7, cz - 6, -Math.PI / 2, 5, this.metalMat);
    this._shelf(cx + 7, cz - 6, Math.PI / 2, 5, this.metalMat);
    this._shelf(cx - 7, cz + 4, -Math.PI / 2, 5, this.metalMat);
    this._shelf(cx + 7, cz + 4, Math.PI / 2, 5, this.metalMat);
    this._cabinet(cx + 9, cz - 7, this._yawTo(-1, 0));
    this._locker(cx - 9, cz + 7, this._yawTo(1, 0)); // 은신
    this._crate(cx - 5, cz + 7, 1.0, this.woodMat);
    this._barrel(cx + 5, cz + 7);
    this._crate(cx + 9, cz + 8, 0.9, this.woodMat);
  }

  _furnishKitchen(cx, cz) {
    // 주방: 긴 카운터 + 캐비닛 은신
    this._addBox(cx - 2, cz + 5, 6, 1.2, 1.1, this.woodMat);
    this._cabinet(cx - 8, cz + 5, this._yawTo(0, -1));   // 은신
    this._cabinet(cx - 4, cz + 5, this._yawTo(0, -1));
    this._shelf(cx + 8, cz + 1, Math.PI / 2, 5, this.metalMat);
    this._chair(cx - 3, cz, 0.4, this.woodMat);
    this._chair(cx + 4, cz, 0, this.woodMat);
    this._crate(cx - 8, cz - 4, 1.0, this.woodMat);
    this._barrel(cx + 6, cz - 4);
  }

  _furnishDorm(cx, cz) {
    for (let i = 0; i < 3; i++) this._bed(cx - 7, cz - 4 + i * 4.5, this.woodMat);
    for (let i = 0; i < 3; i++) this._bed(cx + 7, cz - 4 + i * 4.5, this.woodMat);
    this._locker(cx - 4, cz + 5, this._yawTo(0, -1));
    this._locker(cx - 2, cz + 5, this._yawTo(0, -1));
    this._cabinet(cx + 4, cz + 5, this._yawTo(0, -1));
    this._crate(cx + 2, cz - 5, 0.9, this.woodMat);
  }

  _furnishReception(cx, cz) {
    // 리셉션 카운터
    const counter = this._addBox(cx, cz - 3, 8, 1.0, 1.1, this.woodMat);
    counter.receiveShadow = true;
    // 카운터 밑 은신
    this._registerHide(cx + 2.5, cz - 3.7, Math.PI, "crawl", 0.6);
    this._registerHide(cx - 2.5, cz - 3.7, Math.PI, "crawl", 0.6);
    this._chair(cx - 3, cz + 1, 0.4, this.woodMat);
    this._shelf(cx - 11, cz + 3, -Math.PI / 2, 3.4, this.metalMat);
    this._shelf(cx + 11, cz + 3, Math.PI / 2, 3.4, this.metalMat);
    this._crate(cx - 11, cz - 6, 1.1, this.woodMat);
    this._crate(cx + 11, cz - 6, 1.1, this.woodMat);
    // 안내 표지
    this._sign(cx, cz - 8, 0, 0xff5533);
  }

  _furnishStore(cx, cz) {
    this._shelf(cx, cz - 6, 0, 9, this.metalMat);
    this._shelf(cx - 6, cz + 3, -Math.PI / 2, 6, this.metalMat);
    this._shelf(cx + 6, cz + 3, Math.PI / 2, 6, this.metalMat);
    this._locker(cx + 9, cz - 6, this._yawTo(-1, 0));
    this._locker(cx + 9, cz - 4, this._yawTo(-1, 0));
    this._locker(cx - 9, cz + 5, this._yawTo(1, 0));
    this._barrel(cx - 3, cz + 2);
    this._barrel(cx - 1.6, cz + 2);
    this._crate(cx + 3, cz + 5, 1.0, this.woodMat);
  }

  /* ---------- 프롭 빌더 ---------- */
  _yawTo(dx, dz) { return Math.atan2(-dx, -dz); }

  _crate(x, z, s, mat, yBase = null) {
    const y = yBase !== null ? yBase : this.heightAt(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
    m.position.set(x, y + s / 2, z);
    m.rotation.y = rand(0, 0.4);
    m.castShadow = true; m.receiveShadow = true; m.userData.castShadow = true;
    this.scene.add(m);
    this.boxes.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2, y0: y - 0.5, y1: y + s });
  }

  _barrel(x, z) {
    const y = this.heightAt(x, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 12), this.rustMat);
    m.position.set(x, y + 0.48, z);
    m.castShadow = true; m.userData.castShadow = true;
    this.scene.add(m);
    this.circles.push({ x, z, r: 0.36, y0: y - 0.5, y1: y + 0.95 });
  }

  _generator(x, z) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 1.2), this.metalMat);
    body.castShadow = true; body.userData.castShadow = true;
    g.add(body);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), this.pipeMat);
    pipe.position.set(0.7, 1.3, 0); pipe.castShadow = true;
    g.add(pipe);
    g.position.set(x, y + 0.75, z);
    this.scene.add(g);
    this.boxes.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.6, maxZ: z + 0.6, y0: y - 0.5, y1: y + 2.9 });
  }

  _shelf(x, z, yaw, len, mat, yBase = null) {
    const y = yBase !== null ? yBase : this.heightAt(x, z);
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.5), mat);
      b.position.y = 0.5 + i * 0.6;
      b.castShadow = true; b.userData.castShadow = true;
      g.add(b);
    }
    for (const sx of [-len / 2 + 0.1, len / 2 - 0.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.5), mat);
      post.position.set(sx, 0.9, 0); g.add(post);
    }
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
    const half = Math.abs(Math.cos(yaw)) > 0.5 ? len / 2 : 0.3;
    const halfZ = Math.abs(Math.cos(yaw)) > 0.5 ? 0.3 : len / 2;
    this.boxes.push({ minX: x - half, maxX: x + half, minZ: z - halfZ, maxZ: z + halfZ, y0: y - 0.5, y1: y + 1.8 });
  }

  _desk(x, z, yaw, woodMat, metalMat, yBase = null) {
    const y = yBase !== null ? yBase : this.heightAt(x, z);
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.85), woodMat);
    top.position.y = 0.78; top.castShadow = true; top.userData.castShadow = true;
    g.add(top);
    for (const [sx, sz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.78, 0.08), metalMat);
      leg.position.set(sx, 0.39, sz);
      g.add(leg);
    }
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
    this.boxes.push({ minX: x - 0.85, maxX: x + 0.85, minZ: z - 0.43, maxZ: z + 0.43, y0: y - 0.5, y1: y + 0.9 });
  }

  _deskHide(x, z, yaw, yBase = null) {
    this._desk(x, z, yaw, this.woodMat, this.metalMat, yBase);
    this._registerHide(x, z, yaw, "desk", 0.62, yBase);
  }

  _registerHide(x, z, yaw, type, eye, yBase = null) {
    this.hidingSpots.push({
      id: this.hidingSpots.length, type, x, z, yaw,
      y: yBase !== null ? yBase : this.heightAt(x, z), eye: eye || CONFIG.hideEye, occupied: false
    });
  }

  _locker(x, z, yaw, yBase = null) {
    const y = yBase !== null ? yBase : this.heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.95, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x3f4a52, roughness: 0.55, metalness: 0.5 }));
    body.position.y = 0.98; body.castShadow = true; body.userData.castShadow = true;
    g.add(body);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.8, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x4a565f, roughness: 0.5, metalness: 0.55 }));
    door.position.set(0, 0.98, 0.28); g.add(door);
    // 슬랫 (안이 살짝 보이도록)
    const slatMat = new THREE.MeshStandardMaterial({ color: 0x1a1f24, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.02), slatMat);
      sl.position.set(0, 1.5 + i * 0.1, 0.31); g.add(sl);
    }
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
    this.boxes.push({ minX: x - 0.33, maxX: x + 0.33, minZ: z - 0.3, maxZ: z + 0.3, y0: y - 0.5, y1: y + 2.0 });
    // 은신 위치 = 사물함 중심, 바라보는 방향 = yaw (문 쪽)
    this._registerHide(x, z, yaw, "locker", 1.45, yBase);
  }

  _cabinet(x, z, yaw, yBase = null) {
    const y = yBase !== null ? yBase : this.heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.7 }));
    body.position.y = 0.85; body.castShadow = true; body.userData.castShadow = true;
    g.add(body);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.55, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x554c40, roughness: 0.7 }));
    door.position.set(0, 0.85, 0.25); g.add(door);
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
    this.boxes.push({ minX: x - 0.53, maxX: x + 0.53, minZ: z - 0.28, maxZ: z + 0.28, y0: y - 0.5, y1: y + 1.7 });
    this._registerHide(x, z, yaw, "cabinet", 1.3, yBase);
  }

  _chair(x, z, yaw, mat, yBase = null) {
    const y = yBase !== null ? yBase : this.heightAt(x, z);
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), mat);
    seat.position.y = 0.5; seat.castShadow = true; seat.userData.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), mat);
    back.position.set(0, 0.78, -0.21); g.add(back);
    for (const [sx, sz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), this.metalMat);
      leg.position.set(sx, 0.25, sz); g.add(leg);
    }
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
  }

  _bed(x, z, mat) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 2.1), mat);
    frame.position.y = 0.25; frame.castShadow = true; frame.userData.castShadow = true;
    g.add(frame);
    const mat2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x40484f, roughness: 1 }));
    mat2.position.y = 0.48; g.add(mat2);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.boxes.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 1.05, maxZ: z + 1.05, y0: y - 0.5, y1: y + 0.6 });
  }

  _sign(x, z, yaw, color) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), this.metalMat);
    post.position.y = 1.3; g.add(post);
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: color, emissiveIntensity: 0.5, roughness: 0.6 }));
    face.position.y = 2.4; g.add(face);
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);
    this.circles.push({ x, z, r: 0.2, y0: y - 0.5, y1: y + 2.9 });
  }

  _waterTower(x, z) {
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.0, 14), this.rustMat);
    tank.position.y = 6.5; tank.castShadow = true; tank.userData.castShadow = true;
    g.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.0, 14), this.metalMat);
    cap.position.y = 8.5; g.add(cap);
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.0, 6), this.metalMat);
      leg.position.set(ox, 2.5, oz); g.add(leg);
      this.circles.push({ x: x + ox, z: z + oz, r: 0.25, y0: y - 0.5, y1: y + 5 });
    }
    g.position.set(x, y, z);
    this.scene.add(g);
  }

  _antenna(x, z) {
    const y = this.heightAt(x, z);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 6), this.metalMat);
    mast.position.set(x, y + 4.5, z);
    mast.castShadow = true; mast.userData.castShadow = true;
    this.scene.add(mast);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 1.6 }));
    tip.position.set(x, y + 9.1, z);
    this.scene.add(tip);
    this.lamps.push({ light: null, mat: tip.material, base: 1.6, phase: 0, speed: 1.4, flicker: 1.4, color: new THREE.Color(0xff2222), x, z });
    this.circles.push({ x, z, r: 0.3, y0: y - 0.5, y1: y + 9.2 });
  }

  /* ---------- 퓨즈 ---------- */
  _buildFuses() {
    const spots = [
      { x: -31, z: -46 },   // 기계창고 (R1)
      { x: 25, z: -46 },    // 발전기실 (R2)
      { x: 11.5, z: -42 },  // 동기록실 (WingB)
      { x: -40, z: -20 },   // 통신실
      { x: -15, z: -25 },   // 로비
      { x: -24, z: 14 },    // 숙소
      { x: -40, z: 7 }      // 서측 폐창고 (데드엔드)
    ];
    const mat = new THREE.MeshStandardMaterial({ color: 0x7fe6c8, emissive: 0x2fd0a0, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.3 });
    for (const s of spots) {
      const y = this.heightAt(s.x, s.z);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8), mat);
      mesh.position.set(s.x, y + 0.9, s.z);
      mesh.userData.castShadow = false;
      this.scene.add(mesh);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture("#8ffedd", "#0d5f4a"), transparent: true, depthWrite: false, opacity: 0.55 }));
      glow.scale.set(1.6, 1.6, 1);
      glow.position.copy(mesh.position);
      this.scene.add(glow);
      this.fuses.push({ x: s.x, z: s.z, y, mesh, glow, collected: false });
    }
  }

  /* ---------- 부가 미션 (관측 5 + 테이프 5 + 비콘 3 = 13) ---------- */
  _buildMissions() {
    this.missionSpots = [];
    const cands = [
      // 관측 기록대 (5)
      { kind: "scout", x: -38, z: -40 },  // 기계창고
      { kind: "scout", x: 33, z: -42 },   // 발전기실
      { kind: "scout", x: -29, z: 14 },   // 숙소
      { kind: "scout", x: -40, z: 2 },    // 서측 폐창고
      { kind: "scout", x: 40, z: 2 },     // 동측 폐창고
      // 현장 테이프 (5)
      { kind: "tape", x: -11.5, z: -42 }, // 서기록실
      { kind: "tape", x: -15.75, z: -17 },// 로비
      { kind: "tape", x: 15.75, z: -4 },  // 사무실
      { kind: "tape", x: 0, z: 14 },      // 현관
      { kind: "tape", x: 40, z: -20 },    // 저장동
      // 경보 비콘 (3)
      { kind: "beacon", x: -40, z: -12 }, // 통신실 북쪽
      { kind: "beacon", x: 40, z: -12 },  // 저장동 북쪽
      { kind: "beacon", x: 29, z: 14 }    // 보급실
    ];
    for (const cand of cands) {
      let x = cand.x, z = cand.z;
      // 차단 지점이면 결정적 나선 탐색으로 이동
      for (let r = 1.5; r <= 6.1 && this.isBlockedPoint(x, z, 0.35); r += 1.5) {
        const a = (r * 2.4 + this.missionSpots.length * 1.7) % (Math.PI * 2);
        x = cand.x + Math.cos(a) * r;
        z = cand.z + Math.sin(a) * r;
      }
      if (this.inSafeZone(x, z) || this.isBlockedPoint(x, z, 0.35)) continue;
      const y = this.heightAt(x, z);
      const g = new THREE.Group();
      if (cand.kind === "scout") {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a4550, roughness: 0.6, metalness: 0.4 }));
        post.position.y = 0.45;
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0x5ad0ff, emissive: 0x3399ff, emissiveIntensity: 2.2 }));
        lamp.material.fog = false;
        lamp.position.y = 0.95;
        g.add(post, lamp);
      } else if (cand.kind === "beacon") {
        // 경보 비콘 — 붉은 혈통 + 발밑 테이프 링 (E 홉으로 정지)
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.1, 8),
          new THREE.MeshStandardMaterial({ color: 0x4a3236, roughness: 0.55, metalness: 0.5 }));
        post.position.y = 0.55;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
          new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xcc1111, emissiveIntensity: 3.0 }));
        bulb.material.fog = false;
        bulb.position.y = 1.18;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 14),
          new THREE.MeshStandardMaterial({ color: 0x662222, emissive: 0x881111, emissiveIntensity: 1.2 }));
        ring.material.fog = false;
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        g.add(post, bulb, ring);
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.16),
          new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.55 }));
        box.position.y = 0.07;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8800, emissiveIntensity: 2.5 }));
        dot.material.fog = false;
        dot.position.set(0, 0.16, 0.06);
        g.add(box, dot);
      }
      g.position.set(x, y, z);
      g.traverse(o => { o.castShadow = true; });
      this.scene.add(g);
      this.missionSpots.push({ kind: cand.kind, x, z, done: false, mesh: g });
    }
  }

  resetMissions() {
    for (const s of this.missionSpots) {
      s.done = false;
      if (s.mesh) s.mesh.visible = true;
    }
  }

  /* ---------- 서랍 / 잠긴 문 / 전리품 ---------- */
  _buildDoorsAndLoot() {
    // 서랍: lootId는 Inventory ITEM id와 일치. 열기/닫기/획득은 독립 상태.
    // 1. 시작 대피소: 파란 창고 열쇠
    this._drawer(2.6, 40.6, Math.PI, "key_shed", "창고 열쇠");
    // 2. 열쇠 (잠긴 숏컷 문 2개)
    this._drawer(40, 4, -Math.PI / 2, "key_store", "저장고 열쇠");    // 동측 폐창고 (데드엔드)

    // 3. 배터리 4개
    this._drawer(-16, 12, 0, "battery", "예비 배터리");               // 숙소
    this._drawer(-26, -15, Math.PI / 2, "battery", "예비 배터리");    // 로비
    this._drawer(26, 2, -Math.PI / 2, "battery", "예비 배터리");      // 사무실
    this._drawer(-40, -24, Math.PI / 2, "battery", "예비 배터리");    // 통신실

    // 4. 단서 (비밀번호 일지 2장 — CONFIG.doorCodes와 연동)
    this._drawer(-44, -44, Math.PI / 2, "note_shed", "찢긴 메모");     // 기계창고 (창고 4172)
    this._drawer(15.5, -49, 0, "note_power", "작업 일지");            // 동기록실 (저장소 9260)

    // 5. 소모품 / 장비
    this._drawer(40, -46, 0, "smoke", "연막탄");                      // 발전기실
    this._drawer(36, -8, 0, "smoke", "연막탄");                       // 저장동
    this._drawer(-8, -2, 0, "medkit", "구급상자");                    // 휴게실
    this._drawer(5, 13, 0, "medkit", "구급상자");                     // 현관
    this._drawer(-40, 2, 0, "decoy", "소음장치");                     // 서측 폐창고 (데드엔드)
    this._drawer(-6, -40, 0, "decoy", "소음장치");                    // 서기록실
    this._drawer(-42, 17, Math.PI, "trap", "덫");                     // 숙소
    this._drawer(10, -26, 0, "trap", "덫");                           // 저장소
    this._drawer(-30, -44, 0, "trap", "덫");                          // 기계창고

    // 잠긴 숏컷 문: 각각 고유 열쇠 또는 비밀번호 (CONFIG.doorCodes)
    this._lockedDoor(30, -22, "z", 3.5, "key_shed", "잠긴 창고 문");    // E복도 ↔ 저장소
    this._lockedDoor(30, -4, "z", 4.0, "key_store", "잠긴 저장고 문");  // E복도 ↔ 사무실
  }

  _drawer(x, z, yaw, lootId, lootName, yBase = null) {
    const y = yBase !== null ? yBase : this.heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x50463a, roughness: 0.85 }));
    body.position.y = 0.6; body.castShadow = true; body.userData.castShadow = true;
    g.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.34, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x5c5142, roughness: 0.75 }));
    face.position.set(0, 0.76, 0.28);
    face.castShadow = true; face.userData.castShadow = true;
    g.add(face);
    // 열쇠가 든 서랍은 손잡이에 색상 표시
    let handleColor = 0x59616c;
    if (lootId === "key_shed") handleColor = 0x3a7bd5;
    else if (lootId === "key_store") handleColor = 0xd53a3a;
    else if (lootId === "trap") handleColor = 0x8fa0b0;
    else if (lootId === "stun") handleColor = 0x7ad7ff;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.45, metalness: 0.65 }));
    handle.position.set(0, 0.76, 0.33);
    g.add(handle);
    g.position.set(x, y, z); g.rotation.y = yaw;
    this.scene.add(g);

    const box = { minX: x - 0.48, maxX: x + 0.48, minZ: z - 0.3, maxZ: z + 0.3, y0: y - 0.5, y1: y + 1.1 };
    this.boxes.push(box);
    const rec = {
      id: "drawer_" + this.drawers.length,
      x, z, yaw, group: g, face, handle, box,
      lootId, lootName,
      opened: false,   // 논리적 열림 상태
      anim: 0,         // 0 닫힘 → 1 열림 (애니메이션 진행도)
      looted: false,   // 아이템 획득 여부 (opened와 독립)
      busy: false      // 열기/닫기 애니메이션 중 상호작용 차단
    };
    this.drawers.push(rec);
    return rec;
  }

  // 열기/닫기 전환. 애니메이션 중이면 무시.
  toggleDrawer(d) {
    if (!d || d.busy) return false;
    d.opened = !d.opened;
    d.busy = true;
    return true;
  }

  // 네트워크 동기화용: 토글이 아니라 목표 상태를 지정한다.
  setDrawer(d, open) {
    if (!d || d.opened === !!open) return false;
    d.opened = !!open;
    d.busy = true;
    return true;
  }

  // 애니메이션 진행 (world.update에서 호출)
  _updateDrawers(dt) {
    for (const dr of this.drawers) {
      const target = dr.opened ? 1 : 0;
      const speed = 6;
      if (dr.anim < target) dr.anim = Math.min(target, dr.anim + dt * speed);
      else if (dr.anim > target) dr.anim = Math.max(target, dr.anim - dt * speed);
      else dr.busy = false;
      dr.face.position.z = 0.28 + dr.anim * 0.16;
    }
  }

  // 아이템 획득: 인벤토리 추가 성공 시에만 looted 처리
  lootDrawer(d) {
    if (!d || !d.opened || d.looted || !d.lootId) return false;
    d.looted = true;
    return true;
  }

  /* ---------- 덫 (배치형 — 플레이어/괴물 모두 밟으면 발동·소멸) ---------- */
  addTrap(x, z) {
    if (this.traps.length >= CONFIG.trap.maxPlaced) return null;
    const y = this.heightAt(x, z);
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.5, metalness: 0.5 }));
    plate.position.y = 0.03;
    g.add(plate);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.3, metalness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), spikeMat);
      const a = (i / 6) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15);
      g.add(sp);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff3020, emissiveIntensity: 2 }));
    led.position.set(0.2, 0.06, 0.2);
    g.add(led);
    g.position.set(x, y, z);
    this.scene.add(g);
    const t = { x, z, mesh: g };
    this.traps.push(t);
    return t;
  }

  removeTrap(i) {
    const t = this.traps[i];
    if (!t) return null;
    this.scene.remove(t.mesh);
    if (t.mesh.geometry) t.mesh.geometry.dispose();
    this.traps.splice(i, 1);
    return t;
  }

  clearTraps() {
    for (let i = this.traps.length - 1; i >= 0; i--) this.removeTrap(i);
  }

  _lockedDoor(x, z, axis, width, keyId, label) {
    const y = this.heightAt(x, z);
    const h = 3.2;                           // 린텔 하단(C.headBottom)까지 — 문 위 틈으로 안이 보이지 않게
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x2f363d, roughness: 0.5, metalness: 0.7 }));
    mesh.position.set(x, y + h / 2 + 0.02, z);
    if (axis === "z") mesh.rotation.y = Math.PI / 2;   // 세로 벽(축 z)에 맞춰 회전
    mesh.castShadow = true; mesh.userData.castShadow = true;
    this.scene.add(mesh);

    const ind = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x660000, emissiveIntensity: 1.4 }));
    // 린텔에 파묻히지 않도록 문 앞면(머리 높이 위)에 표시
    ind.position.set(axis === "x" ? x : x + 0.16, y + h - 0.3, axis === "x" ? z + 0.16 : z);
    this.scene.add(ind);

    const w = axis === "x" ? width : 0.24;
    const dd = axis === "x" ? 0.24 : width;
    const box = { minX: x - w / 2, maxX: x + w / 2, minZ: z - dd / 2, maxZ: z + dd / 2, y0: y - 0.5, y1: y + h + 0.1 };
    this.boxes.push(box);

    const rec = { x, z, axis, width, mesh, box, indicator: ind, keyId, label, open: false,
      code: CONFIG.doorCodes[keyId] || null };
    this.lockedDoors.push(rec);
    return rec;
  }

  openLockedDoor(door) {
    if (!door || door.open) return false;
    door.open = true;
    door.mesh.visible = false;
    if (door.indicator) {
      door.indicator.material.color.setHex(0x66ff99);
      door.indicator.material.emissive.setHex(0x22cc66);
      door.indicator.material.emissiveIntensity = 2.0;
    }
    this.boxes = this.boxes.filter((b) => b !== door.box);
    return true;
  }

  // 악몽: 예비 배터리 서랍을 야전 손전등(100% 충전)으로 교체 — 충전소가 없으므로
  setNightmareLoot(on) {
    for (const d of this.drawers) {
      if (d.lootBaseId === undefined) {
        d.lootBaseId = d.lootId;
        d.lootBaseName = d.lootName;
      }
      if (on && d.lootBaseId === "battery") {
        d.lootId = "flashlight";
        d.lootName = "야전 손전등";
      } else {
        d.lootId = d.lootBaseId;
        d.lootName = d.lootBaseName;
      }
    }
  }

  // 서랍 랜덤 전리품 — 열쇠/단서 노트/덫는 고정, 소모품만 매 게임 무작위
  randomizeDrawerLoot() {
    const FIXED = new Set(["key_shed", "key_store", "note_shed", "note_power", "trap"]);
    const POOL = [
      ["battery", "예비 배터리"], ["battery", "예비 배터리"], ["battery", "예비 배터리"], ["battery", "예비 배터리"],
      ["medkit", "구급상자"], ["medkit", "구급상자"],
      ["smoke", "연막탄"], ["smoke", "연막탄"],
      ["decoy", "소음장치"], ["decoy", "소음장치"],
    ];
    for (const d of this.drawers) {
      // lootBaseId는 항상 '원래 전리품'으로 보존한다. setNightmareLoot()가
      // 충전소 판정에 lootBaseId를 쓰므로 랜덤 결과로 덮어쓰면 안 된다.
      if (d.lootBaseId === undefined) {
        d.lootBaseId = d.lootId;
        d.lootBaseName = d.lootName;
      }
      if (FIXED.has(d.lootBaseId)) continue;
      const [id, name] = POOL[(Math.random() * POOL.length) | 0];
      d.lootId = id; d.lootName = name;
    }
  }

  // 새 게임을 시작할 때 퍼즐/전리품 상태를 초기화
  resetInteractive() {
    this.clearTraps();
    this.randomizeDrawerLoot();
    this.resetMissions();
    for (const d of this.drawers) {
      d.opened = false;
      d.anim = 0;
      d.looted = false;
      d.busy = false;
      d.face.position.z = 0.28;
    }
    for (const door of this.lockedDoors) {
      if (door.open) {
        door.open = false;
        door.mesh.visible = true;
        door.box && this.boxes.push(door.box);
      }
      if (door.indicator) {
        door.indicator.material.color.setHex(0xff4444);
        door.indicator.material.emissive.setHex(0x660000);
        door.indicator.material.emissiveIntensity = 1.4;
      }
    }
  }

  /* ---------- 출구 철문 ---------- */
  _buildGate() {
    const gx = 0, gz = -60;
    const gy = this.heightAt(gx, gz);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.5, metalness: 0.75 });

    const gate = new THREE.Group();
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), metalMat);
    postL.position.set(gx - 2.2, gy + 2.1, gz);
    const postR = postL.clone();
    postR.position.x = gx + 2.2;
    gate.add(postL, postR);
    const door = new THREE.Mesh(new THREE.BoxGeometry(4.0, 3.2, 0.18), metalMat);
    door.position.set(gx, gy + 1.7, gz);
    gate.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 0.3), metalMat);
    bar.position.set(gx, gy + 3.85, gz);
    gate.add(bar);
    this.exitIndicatorMat = new THREE.MeshStandardMaterial({ color: 0xff5555, emissive: 0x661111, emissiveIntensity: 1.2, roughness: 0.4 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), this.exitIndicatorMat);
    lamp.position.set(gx + 2.2, gy + 4.3, gz);
    gate.add(lamp);
    // 탈출구 간판 (전원에 따라 빨강→초록으로 다시 그림)
    this._exitSignCanvas = document.createElement("canvas");
    this._exitSignCanvas.width = 256; this._exitSignCanvas.height = 64;
    this._exitSignTex = new THREE.CanvasTexture(this._exitSignCanvas);
    this._exitSignTex.colorSpace = THREE.SRGBColorSpace;
    this._drawExitSign(false);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 0.75),
      new THREE.MeshBasicMaterial({ map: this._exitSignTex, transparent: true, fog: false })
    );
    sign.position.set(gx, gy + 4.65, gz + 0.16);
    gate.add(sign);
    // 멀리서도 보이는 탈출 빔 기둥 (전원 전에는 붉고 희미, 전원 후 초록빛으로 타오름)
    this.exitBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff4444, transparent: true, opacity: 0.10,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 42, 12, 1, true), this.exitBeamMat);
    beam.position.set(gx, gy + 21, gz);
    beam.renderOrder = 4;
    this.scene.add(beam);
    this.exitBeam = beam;
    gate.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.scene.add(gate);

    this.gate = { x: gx, z: gz, group: gate, door, open: false };
    const gy0 = gy - 0.5, gy1 = gy + 4.2;
    this.boxes.push({ minX: gx - 2.45, maxX: gx - 1.95, minZ: gz - 0.25, maxZ: gz + 0.25, y0: gy0, y1: gy1 });
    this.boxes.push({ minX: gx + 1.95, maxX: gx + 2.45, minZ: gz - 0.25, maxZ: gz + 0.25, y0: gy0, y1: gy1 });
    this._gateDoorBox = { minX: gx - 2.0, maxX: gx + 2.0, minZ: gz - 0.12, maxZ: gz + 0.12, y0: gy0, y1: gy1 };
    this.boxes.push(this._gateDoorBox);

    this.exit = { x: gx, z: gz + 3 };
  }

  /* ---------- 남측 감시탑 (2층 별관) ----------
   * 1층: 창고 + 계단실 / 2층: 관측실 + 숨겨진 비상 해치(최종 탈출구)
   * 벽은 절대 높이 기준(yBase)으로 쌓는다. TBY = 부지 지형 - 0.5 */
  _buildTower() {
    const T = TOWER;
    const H = C.wallH, TT = C.wallT, M = this.wallMat;
    const door = (c, w) => ({ center: c, width: w });
    const TBY = this.heightAt(20, 26) - 0.5;
    const DT = T.deckY, WT = T.wallTop;

    // ---- 외벽 (풀 높이) ----
    this._wallLine("z", T.x0, T.z0, T.z1, [], H, TT, M, TBY);                    // 서 (x=14)
    this._wallLine("z", T.x1, T.z0, T.z1, [], H, TT, M, TBY);                    // 동 (x=26)
    this._wallLine("x", T.z1, T.x0, T.x1, [], H, TT, M, TBY);                    // 남 (z=31)
    // 북 (z=21): 하부는 출입문 2개, 상부는 막힘
    this._wallLine("x", T.z0, T.x0, T.x1, [door(16, 2.4), door(22, 2.4)], DT - TBY, TT, M, TBY);
    this._wallLine("x", T.z0, T.x0, T.x1, [], WT - DT, TT, M, DT);
    // 경계벽 (x=18): 하부는 막힘, 상부는 2층 출입문
    this._wallLine("z", T.divX, T.z0, T.z1, [], DT - TBY, TT, M, TBY);
    this._wallLine("z", T.divX, T.z0, T.z1, [door(29.5, 3)], WT - DT, TT, M, DT);

    // ---- 2층 바닥 데크 (시각 + 지면 등록) ----
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.8, metalness: 0.3 });
    const deckHall = new THREE.Mesh(new THREE.BoxGeometry(T.x1 - T.divX, 0.3, T.z1 - T.z0), deckMat);
    deckHall.position.set((T.divX + T.x1) / 2, DT - 0.15, (T.z0 + T.z1) / 2);
    deckHall.castShadow = true; deckHall.receiveShadow = true;
    this.scene.add(deckHall);
    this.floorSlabs.push({ x0: T.divX, x1: T.x1, z0: T.z0, z1: T.z1, topY: DT });
    const deckLand = new THREE.Mesh(new THREE.BoxGeometry(T.divX - T.x0, 0.3, T.landZ1 - T.landZ0), deckMat);
    deckLand.position.set((T.x0 + T.divX) / 2, DT - 0.15, (T.landZ0 + T.landZ1) / 2);
    deckLand.castShadow = true; deckLand.receiveShadow = true;
    this.scene.add(deckLand);
    this.floorSlabs.push({ x0: T.x0, x1: T.divX, z0: T.landZ0, z1: T.landZ1, topY: DT });

    // ---- 계단 디딤돌 (시각 전용 — 보행은 지면 함수가 담당) ----
    const SB = this.heightAt((T.stairX0 + T.stairX1) / 2, T.stairZ0);
    const NSTEPS = 15, runLen = (T.landZ0 - T.stairZ0) / NSTEPS;
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x464e56, roughness: 0.85, metalness: 0.2 });
    for (let i = 0; i < NSTEPS; i++) {
      const topY = SB + (DT - SB) * ((i + 1) / NSTEPS);
      const st = new THREE.Mesh(new THREE.BoxGeometry(T.stairX1 - T.stairX0, 0.25, runLen + 0.06), stepMat);
      st.position.set((T.stairX0 + T.stairX1) / 2, topY - 0.125, T.stairZ0 + (i + 0.5) * runLen);
      st.castShadow = true; st.receiveShadow = true;
      this.scene.add(st);
    }

    // ---- 2층 지붕 (관측실 위만 — 계단실은 밤하늘 개방) ----
    const roof = new THREE.Mesh(new THREE.BoxGeometry(T.x1 - T.divX + 0.8, 0.4, T.z1 - T.z0 + 0.8), M);
    roof.position.set((T.divX + T.x1) / 2, WT - 0.2, (T.z0 + T.z1) / 2);
    roof.castShadow = true; roof.userData.castShadow = true;
    this.scene.add(roof);

    // ---- 1층 창고 가구 ----
    this._shelf(24.5, 25, Math.PI / 2, 4, this.metalMat);
    this._shelf(24.5, 28.5, Math.PI / 2, 3, this.metalMat);
    this._crate(20, 29, 1.0, this.woodMat);
    this._crate(21.2, 29.2, 0.8, this.woodMat);
    this._lamp(22, 26, 0xffd9a0, 12, 16);
    this._drawer(19.5, 25, 0, "medkit", "구급상자");
    this._drawer(24.5, 22.5, -Math.PI / 2, "battery", "예비 배터리");

    // ---- 계단실 조명 ----
    this._lamp(16, 26, 0xffa040, 11, 15);

    // ---- 2층 관측실 가구 (바닥 DT 기준 — 문→중앙 통로 x18~22 비움) ----
    this._deskHide(24.5, 27, Math.PI, DT);
    this._locker(19.2, 22.2, 0, DT);              // 2층 은신처
    this._shelf(25.5, 24, Math.PI, 4, this.metalMat, DT);
    this._drawer(23.5, 25, Math.PI, "battery", "예비 배터리", DT);
    this._drawer(21.8, 28.5, 0, "smoke", "연막탄", DT);
    this._lamp(22, 26, 0x9fd0ff, 12, 17, DT);

    // ---- 비상 해치 (동벽 앞 위장 캐비닛 + 상태 램프 + 안내판 + 케이블) ----
    const hx = 25.2, hz = 22.5;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x39424a, roughness: 0.5, metalness: 0.6 }));
    cab.position.set(hx, DT + 1.0, hz);
    cab.castShadow = true; cab.receiveShadow = true;
    this.scene.add(cab);
    this.boxes.push({ minX: hx - 0.5, maxX: hx + 0.5, minZ: hz - 0.4, maxZ: hz + 0.4, y0: DT, y1: DT + 2.0 });
    // 상태 램프 (빨강=잠김 / 초록=개방)
    this.hatchLampMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xaa1111, emissiveIntensity: 2.0 });
    const hlamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), this.hatchLampMat);
    hlamp.position.set(hx - 0.3, DT + 2.25, hz);
    this.scene.add(hlamp);
    // 케이블 덕트 (바닥→해치 수직 + 벽 하단 수평 — 환경 단서)
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.7, metalness: 0.4 });
    const cableV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), cableMat);
    cableV.position.set(hx + 0.55, DT + 1.1, hz);
    this.scene.add(cableV);
    const cableH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 6.5), cableMat);
    cableH.position.set(hx + 0.55, DT + 0.15, hz + 3.4);
    this.scene.add(cableH);
    // 안내판
    const pc = document.createElement("canvas");
    pc.width = 256; pc.height = 64;
    const pg = pc.getContext("2d");
    pg.fillStyle = "#10151b"; pg.fillRect(0, 0, 256, 64);
    pg.strokeStyle = "#ffb347"; pg.lineWidth = 4; pg.strokeRect(3, 3, 250, 58);
    pg.fillStyle = "#ffb347"; pg.font = "bold 26px sans-serif"; pg.textAlign = "center"; pg.textBaseline = "middle";
    pg.fillText("비상 탈출 해치", 128, 32);
    const ptex = new THREE.CanvasTexture(pc);
    ptex.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4),
      new THREE.MeshBasicMaterial({ map: ptex, transparent: true, fog: false }));
    plaque.position.set(hx - 0.62, DT + 1.5, hz);
    plaque.rotation.y = -Math.PI / 2;
    this.scene.add(plaque);
    // 탈출 빔 기둥 (전원 후 초록빛)
    this.hatchBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff4444, transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 9, 12, 1, true), this.hatchBeamMat);
    beam.position.set(hx - 0.6, DT + 4.5, hz);
    beam.renderOrder = 4;
    this.scene.add(beam);
    this.hatch = { x: hx - 0.9, z: hz };

    // ---- 미니맵 등록 (2층 홀 + 계단실 + 1층 창고) ----
    this.rooms.push({ x: (T.divX + T.x1) / 2, z: (T.z0 + T.z1) / 2, w: T.x1 - T.divX, d: T.z1 - T.z0, name: "2층 관측실", y: DT });
    this.rooms.push({ x: (T.x0 + T.divX) / 2, z: (T.z0 + T.z1) / 2, w: T.divX - T.x0, d: T.z1 - T.z0, name: "계단실", y: 0, both: true });
    this.rooms.push({ x: (T.divX + T.x1) / 2, z: (T.z0 + T.z1) / 2, w: T.x1 - T.divX, d: T.z1 - T.z0, name: "탑 창고", y: 0 });
  }

  /* ---------- 야외 소품 (외벽에 붙여 배치 — 시야를 새로 가리지 않음) ---------- */
  _buildProps() {
    const wood = this.woodMat;
    const rust = this.rustMat;
    const dark = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.8, metalness: 0.3 });

    const crate = (x, z, s, ry) => {
      const y = this.heightAt(x, z);
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), wood);
      box.position.y = s / 2;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(s * 1.04, s * 0.12, s * 1.04), dark);
      lid.position.y = s * 0.94;
      const band = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.1, s * 1.02), rust);
      band.position.y = s * 0.32;
      g.add(box, lid, band);
      g.position.set(x, y, z);
      g.rotation.y = ry;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      this.circles.push({ x, z, r: s * 0.72, y0: y - 0.5, y1: y + s });
    };
    const barrel = (x, z) => {
      const y = this.heightAt(x, z);
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), rust);
      body.position.y = 0.55;
      const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 6, 14), dark);
      hoop1.rotation.x = Math.PI / 2; hoop1.position.y = 0.85;
      const hoop2 = hoop1.clone(); hoop2.position.y = 0.28;
      g.add(body, hoop1, hoop2);
      g.position.set(x, y, z);
      g.rotation.y = Math.random() * Math.PI;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      this.circles.push({ x, z, r: 0.55, y0: y - 0.5, y1: y + 1.1 });
    };

    // 남쪽 외벽 바깥 (z=18) — 통로 중앙(x=0)은 비운다
    crate(-30, 19.7, 1.3, 0.2); crate(-28.3, 19.7, 1.1, -0.15);
    barrel(28, 19.7); barrel(30, 19.6);
    // 서쪽 외벽 바깥 (x=-46)
    crate(-47.7, -10, 1.2, 0.1); barrel(-47.7, -8);
    // 동쪽 외벽 바깥 (x=46)
    barrel(47.7, -12); crate(47.7, 5, 1.25, -0.2); crate(47.7, 6.9, 1.0, 0.3);
    // 북쪽 외벽 바깥 (z=-50) — 탈출로(x=0)는 비운다
    barrel(-20, -51.7); barrel(22, -51.7);
    crate(-8, -56, 1.2, 0.4); barrel(-10.2, -55.6);
    crate(9, -54, 1.1, -0.3);

    // 통신 안테나 (남동쪽 랜드마크) + 항공 비콘
    {
      const ax = 30, az = 30, ay = this.heightAt(ax, az);
      const g = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 17, 8), this.metalMat);
      mast.position.y = 8.5;
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 0.18), this.metalMat);
      cross1.position.y = 13.5;
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.6), this.metalMat);
      cross2.position.y = 11.2;
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8, 0, Math.PI * 2, 0, Math.PI / 3), this.rustMat);
      dish.position.set(0.8, 9.4, 0); dish.rotation.z = -1.1;
      this.antennaMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.3 });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), this.antennaMat);
      beacon.position.y = 17.2;
      g.add(mast, cross1, cross2, dish, beacon);
      g.position.set(ax, ay, az);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(g);
      this.circles.push({ x: ax, z: az, r: 0.9, y0: ay - 0.5, y1: ay + 17.4 });
    }

    // 반딧불 (숲 가장자리 drift)
    {
      const N = 130;
      const pos = new Float32Array(N * 3);
      const seed = new Float32Array(N);
      const rng = makeRng(777);
      for (let i = 0; i < N; i++) {
        const a = rng() * Math.PI * 2;
        const r = 12 + rng() * 46;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        pos[i * 3] = x;
        pos[i * 3 + 1] = this.heightAt(x, z) + 0.6 + rng() * 2.2;
        pos[i * 3 + 2] = z;
        seed[i] = rng();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xaaffcc, size: 0.14, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
      });
      const pts = new THREE.Points(geo, mat);
      pts.userData.seed = seed;
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.fireflies = pts;
    }
  }

  _drawExitSign(powered) {
    const c = this._exitSignCanvas;
    if (!c) return;
    const ctx = c.getContext("2d");
    const col = powered ? "#39ff88" : "#ff4444";
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "rgba(4,6,10,0.85)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = col;
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("탈출구 EXIT", 128, 34);
    if (this._exitSignTex) this._exitSignTex.needsUpdate = true;
  }

  setExitPowered(powered) {
    // 북문 철문은 고장 — 전원이 들어와도 열리지 않는다 (장식·붉은 경고 유지).
    // 진짜 탈출구는 2층 비상 해치 (초록 램프 + 빔).
    if (this.hatchLampMat) {
      if (powered) {
        this.hatchLampMat.color.setHex(0x66ff99);
        this.hatchLampMat.emissive.setHex(0x22cc66);
        this.hatchLampMat.emissiveIntensity = 2.4;
      } else {
        this.hatchLampMat.color.setHex(0xff4444);
        this.hatchLampMat.emissive.setHex(0xaa1111);
        this.hatchLampMat.emissiveIntensity = 2.0;
      }
    }
    if (this.hatchBeamMat) {
      if (powered) {
        this.hatchBeamMat.color.setHex(0x44ff88);
        this.hatchBeamMat.opacity = 0.22;
      } else {
        this.hatchBeamMat.color.setHex(0xff4444);
        this.hatchBeamMat.opacity = 0.08;
      }
    }
    // 북문 게이트는 항상 닫힘 유지 (재시작 복원 포함)
    if (this.gate && this.gate.open) {
      this.gate.open = false;
      this.gate.door.visible = true;
      if (this._gateDoorBox && !this.boxes.includes(this._gateDoorBox)) {
        this.boxes.push(this._gateDoorBox);
      }
    }
  }

  /* ---------- 충돌 ---------- */
  // Y-인식: y=null이면 기존 동작(모든 박스와 충돌). y를 주면 수직 범위가
  // [y, y+h]와 겹치는 박스하고만 충돌한다 (1층 벽이 2층 이동을 막지 않게).
  static yOverlap(a0, a1, b0, b1) {
    if (a0 === undefined || a0 === null) a0 = -Infinity;
    if (a1 === undefined || a1 === null) a1 = Infinity;
    if (b0 === undefined || b0 === null) b0 = -Infinity;
    if (b1 === undefined || b1 === null) b1 = Infinity;
    return a0 < b1 && b0 < a1;
  }
  collide(x, z, radius, y = null, h = 1.7) {
    const B = CONFIG.worldRadius;
    const d = Math.hypot(x, z);
    if (d > B - radius) {
      const s = (B - radius) / (d || 1);
      x *= s; z *= s;
    }
    const checkY = (y !== null && y !== undefined);
    const y0 = y, y1 = checkY ? y + h : y;
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      if (checkY && !World.yOverlap(y0, y1, c.y0, c.y1)) continue;
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + radius;
      const dd = dx * dx + dz * dz;
      if (dd < rr * rr && dd > 1e-6) {
        const dist = Math.sqrt(dd);
        const push = (rr - dist) / dist;
        x += dx * push; z += dz * push;
      }
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (checkY && !World.yOverlap(y0, y1, b.y0, b.y1)) continue;
      const nx = clamp(x, b.minX, b.maxX);
      const nz = clamp(z, b.minZ, b.maxZ);
      const dx = x - nx, dz = z - nz;
      const dd = dx * dx + dz * dz;
      if (dd < radius * radius) {
        if (dd > 1e-6) {
          const dist = Math.sqrt(dd);
          x = nx + (dx / dist) * radius;
          z = nz + (dz / dist) * radius;
        } else {
          const left = x - b.minX, right = b.maxX - x, top = z - b.minZ, bot = b.maxZ - z;
          const m = Math.min(left, right, top, bot);
          if (m === left) x = b.minX - radius;
          else if (m === right) x = b.maxX + radius;
          else if (m === top) z = b.minZ - radius;
          else z = b.maxZ + radius;
        }
      }
    }
    return { x, z };
  }

  isBlockedPoint(x, z, r, y0 = -Infinity, y1 = Infinity) {
    if (Math.hypot(x, z) > CONFIG.worldRadius - r) return true;
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      if (!World.yOverlap(y0, y1, c.y0, c.y1)) continue;
      if (dist2(x, z, c.x, c.z) < (c.r + r) * (c.r + r)) return true;
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!World.yOverlap(y0, y1, b.y0, b.y1)) continue;
      const nx = clamp(x, b.minX, b.maxX);
      const nz = clamp(z, b.minZ, b.maxZ);
      if (dist2(x, z, nx, nz) < r * r) return true;
    }
    return false;
  }

  // 3D 시야 차단: ya/yb는 양 끝 눈높이. 기본 1.0(지상 눈높이) — 기존 호출과 호환.
  lineBlocked(ax, az, bx, bz, ya = 1.0, yb = 1.0) {
    const segY0 = Math.min(ya, yb), segY1 = Math.max(ya, yb);
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      if (!World.yOverlap(segY0, segY1, c.y0, c.y1)) continue;
      if (segCircle(ax, az, bx, bz, c.x, c.z, Math.max(0.1, c.r * 0.85))) return true;
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!World.yOverlap(segY0, segY1, b.y0, b.y1)) continue;
      if (segAABB(ax, az, bx, bz, b)) return true;
    }
    return false;
  }

  update(dt, elapsed) {
    this.time = elapsed;
    for (const m of this.grassMaterials) {
      if (m.userData.shader) m.userData.shader.uniforms.uTime.value = elapsed;
    }
    // 낮게 드리운 안개가 천천히 흘러간다
    const mist = this.mists;
    for (let i = 0; i < mist.length; i++) {
      mist[i].position.x += Math.sin(elapsed * 0.22 + i * 1.7) * dt * 0.5;
      mist[i].position.z += Math.cos(elapsed * 0.17 + i * 2.3) * dt * 0.35;
    }
    // 탈출구 비콘 펄스 (전원 ON이면 빠르고 밝게)
    if (this.exitIndicatorMat) {
      const powered = !!(this.gate && this.gate.open);
      const base = powered ? 2.0 : 1.2;
      const rate = powered ? 6 : 2.2;
      this.exitIndicatorMat.emissiveIntensity = base * (0.75 + 0.25 * Math.sin(elapsed * rate));
    }    // 탈출 빔 기둥: 전원에 따라 색·밝기 전환
    if (this.exitBeamMat) {
      const powered = !!(this.gate && this.gate.open);
      this.exitBeamMat.color.setHex(powered ? 0x44ff88 : 0xff4444);
      this.exitBeamMat.opacity = (powered ? 0.22 : 0.08) * (0.8 + 0.2 * Math.sin(elapsed * (powered ? 5 : 1.6)));
    }
    // 안테나 항공 비콘 점멸
    if (this.antennaMat) {
      const b = (Math.sin(elapsed * 2.4) > 0.55) ? 3.2 : 0.25;
      this.antennaMat.emissiveIntensity = b;
    }
    // 반딧불 drift
    if (this.fireflies) {
      const p = this.fireflies.geometry.attributes.position;
      const seed = this.fireflies.userData.seed;
      for (let i = 0; i < p.count; i++) {
        const s = seed[i];
        p.array[i * 3] += Math.sin(elapsed * 0.5 + s * 6.28) * dt * 0.6;
        p.array[i * 3 + 1] += Math.cos(elapsed * 0.4 + s * 6.28) * dt * 0.35;
        p.array[i * 3 + 2] += Math.cos(elapsed * 0.45 + s * 6.28) * dt * 0.6;
      }
      p.needsUpdate = true;
      this.fireflies.material.opacity = 0.55 + 0.25 * Math.sin(elapsed * 1.3);
    }
    // 오로라 커튼이 천천히 흐른다
    if (this.auroras) {
      for (const a of this.auroras) {
        a.mesh.material.opacity = 0.10 + 0.07 * (0.5 + 0.5 * Math.sin(elapsed * a.speed * 3 + a.phase));
        a.mesh.position.x += Math.sin(elapsed * a.speed + a.phase) * dt * 1.2;
      }
    }
    // 램프 플리커 + 서랍 애니메이션
    const red = _RED;
    const dd = this.distress;
    this._updateDrawers(dt);
    for (const l of this.lamps) {
      let distress = 0;
      if (dd) {
        distress = clamp(1 - Math.hypot(l.x - dd.x, l.z - dd.z) / 20, 0, 1);
      }
      const f = l.flicker;
      const v = 0.5 + 0.5 * Math.sin(elapsed * l.speed + l.phase);
      const k = 1 - f * (0.5 + 0.5 * Math.sin(elapsed * (l.speed * 2.3) + l.phase * 1.7));
      let val = Math.max(0.15, v) * k;
      if (distress > 0) val *= 0.35 + 0.65 * Math.sin(elapsed * 27); // 붉은 스트로브
      if (l.mat && l.mat.emissiveIntensity !== undefined) l.mat.emissiveIntensity = l.base * 0.9 * (0.4 + 0.6 * val);
      if (l.mat.emissive) {
        if (distress > 0.01) l.mat.emissive.copy(l.color).lerp(red, 0.15 + 0.6 * distress);
        else l.mat.emissive.copy(l.color); // 괴물이 떠나면 원래 색으로 복귀
      }
      if (l.glow && l.glow.material) {
        const cm = l.glow.material;
        if (distress > 0.01) { cm.color.copy(l.color).lerp(red, 0.4 + 0.5 * distress); cm.opacity = 0.24 + 0.1 * Math.sin(elapsed * 27); }
        else { cm.color.copy(l.color); cm.opacity = 0.24; }
      }
    }
    // 비 + 번개
    this._updateWeather(dt, elapsed);
  }

  _buildWeather() {
    // 빗줄기 (원점 기준 160m 박스 — 전역을 커버, y 순환)
    const N = 700;
    const pos = new Float32Array(N * 3);
    const rng = makeRng(9001);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rng() - 0.5) * 160;
      pos[i * 3 + 1] = rng() * 40;
      pos[i * 3 + 2] = (rng() - 0.5) * 160;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8fb4d8, size: 0.09, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    });
    const rain = new THREE.Points(geo, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 6;
    this.scene.add(rain);
    this.rain = rain;
    this._bolt = 0;
    this._boltSecond = 0;
    this._boltNext = 9 + Math.random() * 14;
    this._nightmare = false;
    this._boltBg = new THREE.Color(0x4a5a78);
  }

  _updateWeather(dt, elapsed) {
    if (this.rain) {
      const p = this.rain.geometry.attributes.position;
      const arr = p.array;
      for (let i = 0; i < p.count; i++) {
        arr[i * 3 + 1] -= dt * 26;
        arr[i * 3] += dt * 2.2; // 바람
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3 + 1] = 34 + Math.random() * 6;
          arr[i * 3] = (Math.random() - 0.5) * 160;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 160;
        }
      }
      p.needsUpdate = true;
    }
    // 번개: 랜덤 간격으로 밤을 찢는다 (빛만, 소리 없음) — 절대값 설정 (누적 금지)
    this._boltNext -= dt;
    if (this._boltNext <= 0) {
      this._bolt = 0.22 + Math.random() * 0.15;
      this._boltNext = 8 + Math.random() * 18;
      if (Math.random() < 0.35) this._boltSecond = 0.5; // 겹번개 예고
    }
    if (this._boltSecond > 0) {
      this._boltSecond -= dt;
      if (this._boltSecond <= 0) this._bolt = 0.18;
    }
    const flash = this._bolt > 0 ? Math.max(0, this._bolt) * 14 : 0;
    if (this._bolt > 0) this._bolt -= dt;
    if (this.hemi) this.hemi.intensity = (this._hemiBase ?? 0.22) + flash * 0.35;
    if (this.moonLight) this.moonLight.intensity = (this._moonBase ?? 0.32) + flash * 0.8;
    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.setHex(this._nightmare ? 0x010204 : 0x070b12);
      if (flash > 0) this.scene.background.lerp(this._boltBg, Math.min(0.5, flash * 0.12));
    }
  }
}

/* ---------- 유틸 ---------- */
function segCircle(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az;
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return (fx * fx + fz * fz) < r * r;
  let t = -(fx * dx + fz * dz) / a;
  t = clamp(t, 0, 1);
  const px = ax + dx * t, pz = az + dz * t;
  return dist2(px, pz, cx, cz) < r * r;
}

function segAABB(ax, az, bx, bz, b) {
  let tmin = 0, tmax = 1;
  const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, b.minX, b.maxX], [az, dz, b.minZ, b.maxZ]]) {
    if (Math.abs(d) < 1e-8) {
      if (p < lo || p > hi) return false;
    } else {
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/* ---------- 텍스처 생성 ---------- */
function makeGrassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    const x0 = 6 + Math.random() * 52;
    const w = 3 + Math.random() * 3;
    const h = 34 + Math.random() * 26;
    const bend = (Math.random() - 0.5) * 26;
    const g = ctx.createLinearGradient(0, 64, 0, 64 - h);
    const hue = 100 + Math.random() * 30;
    const light = 22 + Math.random() * 22;
    g.addColorStop(0, `hsl(${hue}, 45%, ${light * 0.5}%)`);
    g.addColorStop(1, `hsl(${hue}, 40%, ${light}%)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - w, 64);
    ctx.quadraticCurveTo(x0 - w * 0.5 + bend * 0.5, 64 - h * 0.5, x0 + bend, 64 - h);
    ctx.quadraticCurveTo(x0 + w * 0.5 + bend * 0.5, 64 - h * 0.5, x0 + w, 64);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeGroundTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#46552f";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(40,50,24,0.5)" : "rgba(84,96,58,0.5)";
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeConcreteTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#54565a";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    ctx.fillStyle = v < 0.5 ? "rgba(30,32,34,0.35)" : "rgba(120,122,126,0.28)";
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // 균열
  ctx.strokeStyle = "rgba(20,20,22,0.5)";
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeWallTexture() {
  // 시설 벽면: 금속 패널 + 리벳 + 녹물/그을음 (타일링용, 강한 선 없이 은은하게)
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3a3f45";
  ctx.fillRect(0, 0, 256, 256);
  // 패널 결 (세로 4분할)
  for (let p = 0; p <= 4; p++) {
    const x = p * 64;
    ctx.fillStyle = "rgba(12,14,16,0.55)";
    ctx.fillRect(x - 1, 0, 2, 256);
    ctx.fillStyle = "rgba(150,160,170,0.10)";
    ctx.fillRect(x + 1, 0, 1, 256);
    // 리벳
    for (let y = 12; y < 256; y += 56) {
      ctx.fillStyle = "rgba(16,18,20,0.7)";
      ctx.beginPath(); ctx.arc(x + 6, y, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(170,180,190,0.25)";
      ctx.beginPath(); ctx.arc(x + 5.4, y - 0.8, 1, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 가로 보강대
  ctx.fillStyle = "rgba(12,14,16,0.4)";
  ctx.fillRect(0, 84, 256, 3);
  ctx.fillRect(0, 172, 256, 3);
  // 녹물/그을음 얼룩
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 200;
    const w = 3 + Math.random() * 9, h = 12 + Math.random() * 46;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    const rust = Math.random() < 0.4;
    g.addColorStop(0, rust ? "rgba(117,69,47,0.34)" : "rgba(10,12,14,0.30)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  // 노이즈
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.25)" : "rgba(160,170,180,0.12)";
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeAuroraTexture() {
  // 세로로 흐르는 커튼 줄무늬 (wavy bands)
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 128);
  for (let x = 0; x < 512; x += 3) {
    const w = 0.5 + 0.5 * Math.sin(x * 0.045) * Math.sin(x * 0.013 + 2);
    const h = 40 + 60 * w;
    const g = ctx.createLinearGradient(0, 128, 0, 128 - h);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.55, `rgba(255,255,255,${0.25 + 0.5 * w})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 128 - h, 3, h);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeGlowTexture(inner, outer) {  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, inner);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTuftGeometry(w, h, segs) {
  const positions = [], uvs = [], indices = [];
  const planes = [0, Math.PI / 2];
  let vOffset = 0;
  for (const rot of planes) {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for (let i = 0; i <= segs; i++) {
      const y = (i / segs) * h;
      for (const sx of [-1, 1]) {
        const lx = sx * w * 0.5;
        positions.push(lx * cos, y, lx * sin);
        uvs.push((sx + 1) / 2, i / segs);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = vOffset + i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      indices.push(a, c2, b, b, c2, d);
    }
    vOffset += (segs + 1) * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
