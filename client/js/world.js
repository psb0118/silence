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
  wallH: 3.0, wallT: 0.45,
  divW: -20, divE: 20                       // 방 분할 (x)
};

const SAFE = CONFIG.safeZone;

export class World {
  constructor(scene, qualityName = "medium") {
    this.scene = scene;
    this.quality = QUALITY[qualityName] || QUALITY.medium;
    this.circles = [];   // {x,z,r}
    this.boxes = [];     // {minX,maxX,minZ,maxZ}
    this.grassMaterials = [];
    this.fuses = [];
    this.hidingSpots = [];
    this.lamps = [];
    this.time = 0;

    this.safeZone = SAFE;
    this.compound = C;

    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildGrass();
    this._buildForest();
    this._buildSafeShelter();
    this._buildCompound();
    this._buildFuses();
    this._buildGate();
  }

  /* ---------- 지형 높이 (결정적 함수) ---------- */
  heightAt(x, z) {
    return (
      0.70 * Math.sin(x * 0.045) * Math.cos(z * 0.050) +
      0.45 * Math.sin(x * 0.110 + 2.1) * Math.cos(z * 0.090 + 0.7) +
      0.22 * Math.sin((x + z) * 0.190 + 0.5)
    );
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

    const tex = makeGlowTexture("#dfe8ff", "#7f93c8");
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false }));
    moon.scale.set(46, 46, 1);
    moon.position.set(-120, 120, -220);
    this.scene.add(moon);
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
    moon.shadow.mapSize.set(1024, 1024);
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

    for (let i = 0; i < 84; i++) {
      const a = rng() * Math.PI * 2;
      const r = 14 + rng() * 48;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 8) continue;
      if (this.inCompound(x, z) || this.inSafeZone(x, z)) continue;
      const y = this.heightAt(x, z);
      this._addTree(x, y, z, 0.8 + rng() * 0.8, rng, trunkMat, leafMat);
    }

    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const r = 8 + rng() * 50;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.inCompound(x, z) || this.inSafeZone(x, z)) continue;
      const y = this.heightAt(x, z);
      const s = 0.5 + rng() * 1.6;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
      rock.position.set(x, y + s * 0.35, z);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.castShadow = true; rock.receiveShadow = true;
      rock.userData.castShadow = true;
      this.scene.add(rock);
      if (s > 0.8) this.circles.push({ x, z, r: s * 0.75 });
    }
  }

  _addTree(x, y, z, scale, rng, trunkMat, leafMat) {
    const g = new THREE.Group();
    const trunkH = 3.2 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, trunkH, 6), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true; trunk.userData.castShadow = true;
    g.add(trunk);

    for (let i = 0; i < 3; i++) {
      const cr = (1.7 - i * 0.35) * scale;
      const ch = (1.9 - i * 0.25) * scale;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(cr, ch, 7), leafMat);
      cone.position.y = trunkH + i * ch * 0.55;
      cone.rotation.y = rng() * 3;
      cone.castShadow = true; cone.userData.castShadow = true;
      g.add(cone);
    }
    g.position.set(x, y, z);
    this.scene.add(g);
    this.circles.push({ x, z, r: 0.5 * scale });
  }

  /* ============================================================
   *  시작 대피소 (안전지대)
   * ============================================================ */
  _buildSafeShelter() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x5b5344, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x33302a, roughness: 1 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a5334, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x59616c, roughness: 0.5, metalness: 0.7 });

    const cx = 0, cz = 44, w = 13, d = 11, h = 3.1;
    // 벽 (북쪽 z- 에 출입구)
    this._roomWalls(cx, cz, w, d, h, C.wallT, wallMat, { N: { center: 0, width: 3.2 } });

    // 지붕
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.3, d + 0.5), roofMat);
    roof.position.set(cx, this.heightAt(cx, cz) + h - 0.3, cz);
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
    this.lamps.push({ light: lamp, mat: bulb.material, base: 26, phase: rand(0, 6), speed: 1.0, flicker: 0.08 });

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
    this.circles.push({ x: sx, z: sz, r: 0.35 });
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
   *  시설 구역 (스파인 복도 + 6개 방)
   * ============================================================ */
  _buildCompound() {
    this.wallMat = new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.95 });
    this.rustMat = new THREE.MeshStandardMaterial({ color: 0x6a4d38, roughness: 0.85, metalness: 0.25 });
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x59616c, roughness: 0.5, metalness: 0.7 });
    this.woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9 });
    this.pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6, metalness: 0.6 });

    const H = C.wallH, T = C.wallT, M = this.wallMat;
    const { OX0, OX1, OZ0, OZ1, spineN, spineS, divW, divE } = C;

    // ---- 외곽 벽 ----
    // 남쪽(z=OZ1): 입구 갭
    this._wallLine("x", OZ1, OX0, OX1, [{ center: 0, width: 5 }], H, T, M);
    // 북쪽(z=OZ0): 출구 쪽 갭
    this._wallLine("x", OZ0, OX0, OX1, [{ center: 0, width: 4 }], H, T, M);
    // 서쪽 / 동쪽
    this._wallLine("z", OX0, OZ0, OZ1, [], H, T, M);
    this._wallLine("z", OX1, OZ0, OZ1, [], H, T, M);

    // ---- 복도 벽 (북쪽 z=spineN, 남쪽 z=spineS) ----
    // 북쪽: N1 / N2(2곳) / N3 로 통하는 문
    this._wallLine("x", spineN, OX0, OX1, [
      { center: -33, width: 4.2 },   // N1 storage
      { center: -9, width: 5 },      // N2 hall
      { center: 9, width: 5 },       // N2 hall
      { center: 33, width: 4.2 }     // N3 office
    ], H, T, M);
    // 남쪽: S1 / S2(넓은 허브) / S3
    this._wallLine("x", spineS, OX0, OX1, [
      { center: -33, width: 4.2 },   // S1 dorm
      { center: 0, width: 7 },       // S2 reception
      { center: 33, width: 4.2 }     // S3 store
    ], H, T, M);

    // ---- 방 분할 벽 ----
    this._wallLine("z", divW, OZ0, spineN, [], H, T, M);  // 북서
    this._wallLine("z", divE, OZ0, spineN, [], H, T, M);  // 북동
    this._wallLine("z", divW, spineS, OZ1, [], H, T, M);  // 남서
    this._wallLine("z", divE, spineS, OZ1, [], H, T, M);  // 남동

    // ---- 지붕 (일부 방만 덮어 어둡게) ----
    this._roof(-33, (OZ0 + spineN) / 2, 26, 46, M); // N1 storage
    this._roof(33, (OZ0 + spineN) / 2, 26, 46, M);  // N3 office
    this._roof(-33, (spineS + OZ1) / 2, 26, 16, M); // S1 dorm
    this._roof(33, (spineS + OZ1) / 2, 26, 16, M);  // S3 store
    this._roof(0, (spineS + OZ1) / 2, 40, 16, M);   // S2 reception

    // ---- 랜드마크 조명 (손전등 없이도 랜드마크만 가늠 가능한 어두운 풀) ----
    this._lamp(-33, -2, 0xffa040, 14, 22);   // 복도 중앙
    this._lamp(0, 8, 0xff6a4a, 16, 20);      // 리셉션 (붉은 비상등)
    this._lamp(0, -30, 0x9fd0ff, 15, 24);    // machine hall
    this._lamp(0, 17, 0xffd0a0, 10, 16);     // 입구

    // ---- 방별 가구/프롭/은신처 ----
    this._furnishStorage(-33, (OZ0 + spineN) / 2, 26, 46);   // N1
    this._furnishMachine(0, (OZ0 + spineN) / 2, 40, 46);     // N2
    this._furnishOffice(33, (OZ0 + spineN) / 2, 26, 46);     // N3
    this._furnishDorm(-33, (spineS + OZ1) / 2, 26, 16);      // S1
    this._furnishReception(0, (spineS + OZ1) / 2, 40, 16);   // S2
    this._furnishStore(33, (spineS + OZ1) / 2, 26, 16);      // S3

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
  _wallLine(axis, fixed, from, to, gaps, h, t, mat) {
    const segs = [];
    let cur = from;
    const gs = (gaps || []).slice().sort((a, b) => a.center - b.center);
    for (const g of gs) {
      const a = g.center - g.width / 2, b = g.center + g.width / 2;
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < to) segs.push([cur, to]);
    for (const [a, b] of segs) {
      if (b - a < 0.15) continue;
      const cx = axis === "x" ? (a + b) / 2 : fixed;
      const cz = axis === "x" ? fixed : (a + b) / 2;
      const w = axis === "x" ? (b - a) : t;
      const dd = axis === "x" ? t : (b - a);
      this._addBox(cx, cz, w, dd, h, mat);
    }
  }

  _addBox(cx, cz, w, d, h, mat) {
    const y = this.heightAt(cx, cz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, y + h / 2 - 0.5, cz);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.castShadow = true;
    this.scene.add(m);
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return m;
  }

  _roof(cx, cz, w, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), mat);
    m.position.set(cx, this.heightAt(cx, cz) + C.wallH - 0.25, cz);
    m.castShadow = true; m.userData.castShadow = true;
    this.scene.add(m);
  }

  _lamp(x, z, color, intensity, dist) {
    const y = this.heightAt(x, z) + 3.0;
    const light = new THREE.PointLight(color, intensity, dist, 1.7);
    light.position.set(x, y, z);
    this.scene.add(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.4 }));
    bulb.position.set(x, y, z);
    this.scene.add(bulb);
    this.lamps.push({ light, mat: bulb.material, base: intensity, phase: rand(0, 6), speed: rand(6, 13), flicker: rand(0.15, 0.4) });
  }

  /* ---------- 방 가구 ---------- */
  _furnishStorage(cx, cz, w, d) {
    const crates = [[-7, -12, 1.2], [-4.5, -13, 0.9], [-7, -2, 1.0], [7, -14, 1.4], [8, 8, 1.1], [4, 12, 1.0]];
    for (const [ox, oz, s] of crates) this._crate(cx + ox, cz + oz, s, this.woodMat);
    this._shelf(cx + 9, cz - 6, -Math.PI / 2, 3.2, this.metalMat);
    this._shelf(cx + 9, cz + 2, -Math.PI / 2, 3.2, this.metalMat);
    // 은신: 사물함
    this._locker(cx + 8, cz - 12, this._yawTo(-1, 0));
    this._locker(cx + 8, cz - 14, this._yawTo(-1, 0));
    this._locker(cx - 8, cz + 6, this._yawTo(1, 0));
    this._barrel(cx - 6, cz + 10);
    this._barrel(cx - 5, cz + 11);
  }

  _furnishMachine(cx, cz, w, d) {
    this._generator(cx - 10, cz + 8);
    this._generator(cx + 10, cz + 8);
    this._generator(cx - 10, cz - 10);
    // 파이프 랙
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 10, 8), this.pipeMat);
      p.rotation.z = Math.PI / 2;
      p.position.set(cx, this.heightAt(cx, cz - 16) + 1.6 + i * 0.35, cz - 16 + i * 0.32);
      p.rotation.x = 0.04;
      p.castShadow = true; p.userData.castShadow = true;
      this.scene.add(p);
    }
    // 큰 개방 공간 → 크레이트 은신 코너
    this._crate(cx - 16, cz + 14, 1.4, this.woodMat);
    this._crate(cx - 14.6, cz + 14, 1.2, this.woodMat);
    this._crate(cx - 15.5, cz + 15.4, 1.0, this.woodMat);
    this._locker(cx - 16.4, cz + 16.6, this._yawTo(1, 1)); // 코너 사물함 은신
    this._barrel(cx + 14, cz - 16);
    this._barrel(cx + 12.6, cz - 16);
  }

  _furnishOffice(cx, cz, w, d) {
    // 책상 (밑 숨기)
    this._deskHide(cx - 6, cz - 10, 0);
    this._deskHide(cx - 6, cz - 4, 0);
    this._deskHide(cx + 5, cz - 12, Math.PI);
    this._deskHide(cx + 5, cz - 6, Math.PI);
    this._desk(cx - 6, cz + 12, 0, this.woodMat, this.metalMat);
    this._chair(cx - 4.4, cz + 12, 1.4, this.woodMat);
    this._shelf(cx + 9, cz + 8, -Math.PI / 2, 3.0, this.metalMat);
    this._cabinet(cx - 9, cz + 2, this._yawTo(1, 0));
    this._crate(cx + 8, cz + 14, 1.0, this.woodMat);
  }

  _furnishDorm(cx, cz, w, d) {
    for (let i = 0; i < 3; i++) this._bed(cx - 9, cz - 4 + i * 4.5, this.woodMat);
    for (let i = 0; i < 3; i++) this._bed(cx + 9, cz - 4 + i * 4.5, this.woodMat);
    this._locker(cx - 4, cz + 5, this._yawTo(0, -1));
    this._locker(cx - 2, cz + 5, this._yawTo(0, -1));
    this._cabinet(cx + 4, cz + 5, this._yawTo(0, -1));
    this._crate(cx + 2, cz - 5, 0.9, this.woodMat);
  }

  _furnishReception(cx, cz, w, d) {
    // 리셉션 카운터
    const counter = this._addBox(cx, cz - 3, 8, 1.0, 1.1, this.woodMat);
    counter.receiveShadow = true;
    // 카운터 밑 은신
    this._registerHide(cx + 2.5, cz - 3.7, Math.PI, "crawl", 0.6);
    this._registerHide(cx - 2.5, cz - 3.7, Math.PI, "crawl", 0.6);
    this._chair(cx - 3, cz + 1, 0.4, this.woodMat);
    this._shelf(cx - 12, cz + 3, -Math.PI / 2, 3.4, this.metalMat);
    this._shelf(cx + 12, cz + 3, Math.PI / 2, 3.4, this.metalMat);
    this._crate(cx - 12, cz - 6, 1.1, this.woodMat);
    this._crate(cx + 12, cz - 6, 1.1, this.woodMat);
    // 안내 표지
    this._sign(cx, cz - 8, 0, 0xff5533);
  }

  _furnishStore(cx, cz, w, d) {
    this._shelf(cx, cz - 6, 0, 9, this.metalMat);
    this._shelf(cx - 6, cz + 3, -Math.PI / 2, 6, this.metalMat);
    this._shelf(cx + 6, cz + 3, Math.PI / 2, 6, this.metalMat);
    this._locker(cx + 10, cz - 6, this._yawTo(-1, 0));
    this._locker(cx + 10, cz - 4, this._yawTo(-1, 0));
    this._locker(cx - 10, cz + 5, this._yawTo(1, 0));
    this._barrel(cx - 3, cz + 2);
    this._barrel(cx - 1.6, cz + 2);
    this._crate(cx + 3, cz + 5, 1.0, this.woodMat);
  }

  /* ---------- 프롭 빌더 ---------- */
  _yawTo(dx, dz) { return Math.atan2(-dx, -dz); }

  _crate(x, z, s, mat) {
    const y = this.heightAt(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
    m.position.set(x, y + s / 2, z);
    m.rotation.y = rand(0, 0.4);
    m.castShadow = true; m.receiveShadow = true; m.userData.castShadow = true;
    this.scene.add(m);
    this.boxes.push({ minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2 });
  }

  _barrel(x, z) {
    const y = this.heightAt(x, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.95, 12), this.rustMat);
    m.position.set(x, y + 0.48, z);
    m.castShadow = true; m.userData.castShadow = true;
    this.scene.add(m);
    this.circles.push({ x, z, r: 0.36 });
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
    this.boxes.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 0.6, maxZ: z + 0.6 });
  }

  _shelf(x, z, yaw, len, mat) {
    const y = this.heightAt(x, z);
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
    this.boxes.push({ minX: x - half, maxX: x + half, minZ: z - halfZ, maxZ: z + halfZ });
  }

  _desk(x, z, yaw, woodMat, metalMat) {
    const y = this.heightAt(x, z);
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
    this.boxes.push({ minX: x - 0.85, maxX: x + 0.85, minZ: z - 0.43, maxZ: z + 0.43 });
  }

  _deskHide(x, z, yaw) {
    this._desk(x, z, yaw, this.woodMat, this.metalMat);
    this._registerHide(x, z, yaw, "desk", 0.62);
  }

  _registerHide(x, z, yaw, type, eye) {
    this.hidingSpots.push({
      id: this.hidingSpots.length, type, x, z, yaw,
      y: this.heightAt(x, z), eye: eye || CONFIG.hideEye, occupied: false
    });
  }

  _locker(x, z, yaw) {
    const y = this.heightAt(x, z);
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
    this.boxes.push({ minX: x - 0.33, maxX: x + 0.33, minZ: z - 0.3, maxZ: z + 0.3 });
    // 은신 위치 = 사물함 중심, 바라보는 방향 = yaw (문 쪽)
    this._registerHide(x, z, yaw, "locker", 1.45);
  }

  _cabinet(x, z, yaw) {
    const y = this.heightAt(x, z);
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
    this.boxes.push({ minX: x - 0.53, maxX: x + 0.53, minZ: z - 0.28, maxZ: z + 0.28 });
    this._registerHide(x, z, yaw, "cabinet", 1.3);
  }

  _chair(x, z, yaw, mat) {
    const y = this.heightAt(x, z);
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
    this.boxes.push({ minX: x - 0.55, maxX: x + 0.55, minZ: z - 1.05, maxZ: z + 1.05 });
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
    this.circles.push({ x, z, r: 0.2 });
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
      this.circles.push({ x: x + ox, z: z + oz, r: 0.25 });
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
    this.lamps.push({ light: null, mat: tip.material, base: 1.6, phase: 0, speed: 1.4, flicker: 1.4 });
    this.circles.push({ x, z, r: 0.3 });
  }

  /* ---------- 퓨즈 ---------- */
  _buildFuses() {
    const spots = [
      { x: -37, z: -26 },   // N1 저장고
      { x: 0, z: -34 },     // N2 기계실
      { x: 37, z: -26 },    // N3 사무실
      { x: -37, z: 10 },    // S1 숙소
      { x: 37, z: 10 }      // S3 창고
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
    gate.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.scene.add(gate);

    this.gate = { x: gx, z: gz, group: gate, door, open: false };
    this.boxes.push({ minX: gx - 2.45, maxX: gx - 1.95, minZ: gz - 0.25, maxZ: gz + 0.25 });
    this.boxes.push({ minX: gx + 1.95, maxX: gx + 2.45, minZ: gz - 0.25, maxZ: gz + 0.25 });
    this._gateDoorBox = { minX: gx - 2.0, maxX: gx + 2.0, minZ: gz - 0.12, maxZ: gz + 0.12 };
    this.boxes.push(this._gateDoorBox);

    this.exit = { x: gx, z: gz + 3 };
  }

  setExitPowered(powered) {
    if (powered) {
      this.exitIndicatorMat.color.setHex(0x66ff99);
      this.exitIndicatorMat.emissive.setHex(0x22cc66);
      this.exitIndicatorMat.emissiveIntensity = 2.0;
      if (this.gate && !this.gate.open) {
        this.gate.open = true;
        this.boxes = this.boxes.filter((b) => b !== this._gateDoorBox);
        this.gate.door.visible = false;
      }
    } else {
      this.exitIndicatorMat.color.setHex(0xff5555);
      this.exitIndicatorMat.emissive.setHex(0x661111);
      this.exitIndicatorMat.emissiveIntensity = 1.2;
    }
  }

  /* ---------- 충돌 ---------- */
  collide(x, z, radius) {
    const B = CONFIG.worldRadius;
    const d = Math.hypot(x, z);
    if (d > B - radius) {
      const s = (B - radius) / (d || 1);
      x *= s; z *= s;
    }
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
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

  isBlockedPoint(x, z, r) {
    if (Math.hypot(x, z) > CONFIG.worldRadius - r) return true;
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      if (dist2(x, z, c.x, c.z) < (c.r + r) * (c.r + r)) return true;
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      const nx = clamp(x, b.minX, b.maxX);
      const nz = clamp(z, b.minZ, b.maxZ);
      if (dist2(x, z, nx, nz) < r * r) return true;
    }
    return false;
  }

  lineBlocked(ax, az, bx, bz) {
    for (let i = 0; i < this.circles.length; i++) {
      const c = this.circles[i];
      if (segCircle(ax, az, bx, bz, c.x, c.z, Math.max(0.1, c.r * 0.85))) return true;
    }
    for (let i = 0; i < this.boxes.length; i++) {
      if (segAABB(ax, az, bx, bz, this.boxes[i])) return true;
    }
    return false;
  }

  update(dt, elapsed) {
    this.time = elapsed;
    for (const m of this.grassMaterials) {
      if (m.userData.shader) m.userData.shader.uniforms.uTime.value = elapsed;
    }
    for (const l of this.lamps) {
      const f = l.flicker;
      if (f === 0) continue;
      const v = 0.5 + 0.5 * Math.sin(elapsed * l.speed + l.phase);
      const k = 1 - f * (0.5 + 0.5 * Math.sin(elapsed * (l.speed * 2.3) + l.phase * 1.7));
      const val = Math.max(0.15, v) * k;
      if (l.light) l.light.intensity = l.base * (0.55 + 0.45 * val);
      if (l.mat && l.mat.emissiveIntensity !== undefined) l.mat.emissiveIntensity = l.base * 0.9 * (0.4 + 0.6 * val);
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

function makeGlowTexture(inner, outer) {
  const c = document.createElement("canvas");
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
