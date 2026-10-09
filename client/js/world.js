import * as THREE from "three";
import { CONFIG, QUALITY } from "./config.js";
import { rand, makeRng, clamp, dist2 } from "./util.js";

export class World {
  constructor(scene, qualityName = "medium") {
    this.scene = scene;
    this.quality = QUALITY[qualityName] || QUALITY.medium;
    this.circles = [];   // {x,z,r}
    this.boxes = [];     // {minX,maxX,minZ,maxZ}
    this.grassMaterials = [];
    this.fuses = [];
    this.time = 0;

    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildGrass();
    this._buildProps();
    this._buildStructures();
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

  /* ---------- 하늘 ---------- */
  _buildSky() {
    this.scene.background = new THREE.Color(0x0a0f18);
    this.scene.fog = new THREE.FogExp2(0x0e1626, 0.018);

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

    // 달 (부드러운 글로우 스프라이트)
    const tex = makeGlowTexture("#dfe8ff", "#7f93c8");
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, transparent: true, depthWrite: false }));
    moon.scale.set(46, 46, 1);
    moon.position.set(-120, 120, -220);
    this.scene.add(moon);
  }

  /* ---------- 조명 ---------- */
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0x4e6e9a, 0x223022, 1.7);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0x415a86, 2.2);
    this.scene.add(this.ambient);

    const moon = new THREE.DirectionalLight(0xb0c8f2, 2.6);
    moon.position.set(-60, 90, -80);
    moon.castShadow = this.quality.shadows;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 260;
    const s = 90;
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

    const mat = new THREE.MeshStandardMaterial({
      color: 0x5a6b46,
      map: groundTex,
      roughness: 1.0,
      metalness: 0.0
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    ground.userData.castShadow = false;
    this.scene.add(ground);
  }

  /* ---------- 잔디 (인스턴스) ---------- */
  _buildGrass() {
    const count = this.quality.grass;
    const radius = this.quality.grassRadius;
    const bladeTex = makeGrassTexture();

    const geo = makeTuftGeometry(0.55, 0.42, 3);
    const mat = new THREE.MeshStandardMaterial({
      map: bladeTex,
      color: 0xffffff,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0
    });
    // 잔디는 위쪽에서 부드럽게 조명되도록 노멀을 위로 고정
    const normals = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) { normals[i * 3 + 1] = 1; }
    geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

    // 바람
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

    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.y = rng() * Math.PI * 2;
      const s = 0.7 + rng() * 0.8;
      dummy.scale.set(s, s * (0.8 + rng() * 0.6), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      const hue = 0.24 + rng() * 0.09;
      const light = 0.22 + rng() * 0.20;
      color.setHSL(hue, 0.5, light);
      inst.setColorAt(i, color);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

    this.scene.add(inst);
    this.grass = inst;
    this.grassMaterials.push(mat);
  }

  /* ---------- 나무 / 바위 / 잔해 ---------- */
  _buildProps() {
    const rng = makeRng(1337);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x463a26, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f4a37, roughness: 1 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5d646e, roughness: 0.95, metalness: 0.05 });

    // 나무
    const treeCount = 64;
    for (let i = 0; i < treeCount; i++) {
      const a = rng() * Math.PI * 2;
      const edge = rng() < 0.45;
      const r = edge ? 46 + rng() * 15 : 12 + rng() * 40;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 6) continue;
      const y = this.heightAt(x, z);
      const scale = 0.8 + rng() * 0.8;
      this._addTree(x, y, z, scale, rng, trunkMat, leafMat);
    }

    // 바위
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const r = 8 + rng() * 50;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      const s = 0.5 + rng() * 1.6;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
      rock.position.set(x, y + s * 0.35, z);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.userData.castShadow = true;
      this.scene.add(rock);
      if (s > 0.8) this.circles.push({ x, z, r: s * 0.75 });
    }

    // 썩은 통나무 / 묘비 / 잔해
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2f1e, roughness: 1 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4c525a, roughness: 1 });
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2;
      const r = 10 + rng() * 46;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.heightAt(x, z);
      if (rng() < 0.5) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.2, 6), woodMat);
        log.position.set(x, y + 0.22, z);
        log.rotation.set(Math.PI / 2, 0, rng() * 3);
        log.castShadow = true;
        log.userData.castShadow = true;
        this.scene.add(log);
      } else {
        const grav = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.16), stoneMat);
        grav.position.set(x, y + 0.5, z);
        grav.rotation.y = rng() * 3;
        grav.castShadow = true;
        grav.userData.castShadow = true;
        this.scene.add(grav);
      }
    }
  }

  _addTree(x, y, z, scale, rng, trunkMat, leafMat) {
    const g = new THREE.Group();
    const trunkH = 3.2 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.28 * scale, trunkH, 6), trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    trunk.userData.castShadow = true;
    g.add(trunk);

    const layers = 3;
    for (let i = 0; i < layers; i++) {
      const cr = (1.7 - i * 0.35) * scale;
      const ch = (1.9 - i * 0.25) * scale;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(cr, ch, 7), leafMat);
      cone.position.y = trunkH + i * ch * 0.55;
      cone.rotation.y = rng() * 3;
      cone.castShadow = true;
      cone.userData.castShadow = true;
      g.add(cone);
    }
    g.position.set(x, y, z);
    this.scene.add(g);
    this.circles.push({ x, z, r: 0.5 * scale });
  }

  /* ---------- 구조물 (폐가, 창고, 전망대, 울타리) ---------- */
  _buildStructures() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4e57, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x303239, roughness: 1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x59616c, roughness: 0.5, metalness: 0.7 });

    // 폐가
    this._room(-30, 20, 9, 7, 2.7, wallMat, roofMat, "x+");
    // 창고
    this._room(32, -24, 7, 6, 2.4, wallMat, roofMat, "z-");
    // 작은 오두막
    this._room(6, 44, 6, 5, 2.3, wallMat, roofMat, "x-");

    // 전망대 기둥
    const towerX = -14, towerZ = -40;
    for (const [ox, oz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      const tx = towerX + ox, tz = towerZ + oz;
      const ty = this.heightAt(tx, tz);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.5, 0.28), metalMat);
      post.position.set(tx, ty + 2.75, tz);
      post.castShadow = true;
      post.userData.castShadow = true;
      this.scene.add(post);
      this.circles.push({ x: tx, z: tz, r: 0.35 });
    }
    const platY = this.heightAt(towerX, towerZ) + 5.4;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 4.4), metalMat);
    plat.position.set(towerX, platY, towerZ);
    plat.castShadow = true;
    plat.userData.castShadow = true;
    this.scene.add(plat);

    // 부서진 목책 (일부만)
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3c2f1e, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI - Math.PI / 2;
      const r = 52;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      if (Math.abs(x) < 6) continue; // 출구 쪽은 비워둠
      const y = this.heightAt(x, z);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 0.16), fenceMat);
      post.position.set(x, y + 0.7, z);
      post.castShadow = true;
      post.userData.castShadow = true;
      this.scene.add(post);
    }
  }

  _room(cx, cz, w, d, h, wallMat, roofMat, doorSide) {
    const t = 0.3;
    const baseY = this.heightAt(cx, cz);
    const addWall = (x, z, ww, dd) => {
      const y = this.heightAt(x, z);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, h, dd), wallMat);
      wall.position.set(x, y + h / 2 - 0.4, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.userData.castShadow = true;
      this.scene.add(wall);
      this.boxes.push({ minX: x - ww / 2, maxX: x + ww / 2, minZ: z - dd / 2, maxZ: z + dd / 2 });
    };
    // 위/아래 변 (x방향 벽)
    const gap = 1.6;
    if (doorSide === "z-" ) {
      addWall(cx, cz - d / 2, w, t);
    } else {
      addWall(cx, cz - d / 2, w, t);
    }
    if (doorSide === "z+") {
      addWall(cx, cz + d / 2, w, t);
    } else {
      addWall(cx, cz + d / 2, w, t);
    }
    // 좌/우 변 (z방향 벽) — 한쪽에 문
    const half = w / 2 - gap / 2;
    if (doorSide === "x+") {
      addWall(cx - w / 2, cz, t, d);
      addWall(cx + w / 2, cz - (d / 2 - gap / 2), t, gap);
      addWall(cx + w / 2, cz + (d / 2 - gap / 2), t, gap);
    } else if (doorSide === "x-") {
      addWall(cx + w / 2, cz, t, d);
      addWall(cx - w / 2, cz - (d / 2 - gap / 2), t, gap);
      addWall(cx - w / 2, cz + (d / 2 - gap / 2), t, gap);
    } else {
      addWall(cx - w / 2, cz, t, d);
      addWall(cx + w / 2, cz, t, d);
    }
    // 지붕
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4), roofMat);
    roof.position.set(cx, baseY + h - 0.3, cz);
    roof.castShadow = true;
    roof.userData.castShadow = true;
    this.scene.add(roof);
  }

  /* ---------- 퓨즈 ---------- */
  _buildFuses() {
    const spots = [
      { x: -30, z: 20 },   // 폐가 내부
      { x: 32, z: -24 },   // 창고 내부
      { x: 6, z: 44 },     // 오두막
      { x: -46, z: -12 },  // 서쪽 숲
      { x: 48, z: 30 }     // 동쪽 숲
    ];
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7fe6c8, emissive: 0x2fd0a0, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.3
    });
    for (const s of spots) {
      const y = this.heightAt(s.x, s.z);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8), mat);
      mesh.position.set(s.x, y + 0.55, s.z);
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
    const gx = 0, gz = -56;
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
    this.boxes.push({ minX: gx - 2.0, maxX: gx + 2.0, minZ: gz - 0.12, maxZ: gz + 0.12 });

    this.spawn = { x: 0, z: 40 };
    this.exit = { x: gx, z: gz + 3 };
  }

  setExitPowered(powered) {
    if (powered) {
      this.exitIndicatorMat.color.setHex(0x66ff99);
      this.exitIndicatorMat.emissive.setHex(0x22cc66);
      this.exitIndicatorMat.emissiveIntensity = 2.0;
      if (this.gate && !this.gate.open) {
        this.gate.open = true;
        // 문 콜라이더 제거
        this.boxes = this.boxes.filter((b) => !(b.minX === this.gate.x - 2.0));
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
  }
}

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

/* ================= 텍스처 생성 ================= */

function makeGrassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 64, 64);
  const blades = 8;
  for (let i = 0; i < blades; i++) {
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
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = Math.random();
    ctx.fillStyle = v < 0.5 ? "rgba(40,50,24,0.5)" : "rgba(84,96,58,0.5)";
    ctx.fillRect(x, y, 2, 2);
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
