// furniture-gl.js — 가구 에셋 카탈로그 → Three.js 입체 (어댑터).
// ─────────────────────────────────────────────────────────────────────────────
// 계산도, 형상 정의도 하지 않는다.
//   · 무엇을 어디에 놓을지 = room-presets.js
//   · 어떤 부품이 어떤 크기로 붙는지 = furniture-assets.js  (순수, Node 테스트 대상)
//   · 그것을 Three.js 메시로 세우는 일 = 이 파일
//
// 방향 규칙: 가구는 rotY = 0 일 때 LED 벽(-Z)을 바라보도록 만든다.
//   room-presets의 faceTowards()가 주는 rotY는 '+X쪽으로 sin, -Z쪽으로 cos'인 좌표계라
//   Three.js의 Y축 회전과 부호가 반대다 → rotation.y = -rotY.
//
// 성능: 같은 물건이 수십~수백 개 반복되므로(강당 좌석 등) InstancedMesh로 묶는다.
//   그리기 호출 수는 **좌석 개수가 아니라 부품 종류 수**에 비례한다.
//   지오메트리는 단위 상자/기둥 2개만 만들어 전부 공유하고, 크기는 행렬로 준다.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from './vendor/three/three.module.min.js';
import { u } from './gl-model.js?v=391';
import { createMaterialLibrary } from './materials-gl.js?v=391';
import { PART_MATERIAL } from './materials.js?v=391';
import { GRADE_COLORS } from './viewangle.js?v=391';
import { createGeometryCache } from './geometry-gl.js?v=391';
import {
  FURNITURE_COLORS, DIMS, FURNITURE_ASSETS,
  assetFor, assetParts, assetKey, createConferenceTable,
} from './furniture-assets.js?v=391';

const DEG = Math.PI / 180;

export { FURNITURE_COLORS, DIMS, FURNITURE_ASSETS };

// ── 행렬 ────────────────────────────────────────────────────────────────────
// 물건 중심에서 회전시킨 뒤 부품 자리로 옮기고, 거기서 부품을 기울인다.
//   T(물건) · Ry(물건 방향) · T(부품 위치) · Rx(부품 기울기) · S(부품 크기)
// 부품을 '자기 중심에서' 돌려야 등받이가 좌판을 뚫고 나가지 않는다.
const _r = new THREE.Matrix4(), _t = new THREE.Matrix4();

function partMatrix(item, part, out) {
  // item.y = 그 물건이 올라앉은 바닥 높이(계단식 객석의 단차). 없으면 0.
  _t.makeTranslation(u(item.x), u(item.y || 0), u(item.z));
  _r.makeRotationY(-(item.rotY || 0) * DEG);   // faceTowards와 부호가 반대 — 파일 머리말 참고
  out.multiplyMatrices(_t, _r);
  _t.makeTranslation(u(part.dx || 0), u(part.y), u(part.dz || 0));
  out.multiply(_t);
  if (part.tiltX) { _r.makeRotationX(part.tiltX * DEG); out.multiply(_r); }
  // 크기는 곱하지 않는다 — 도형을 **실제 치수로 구워** 쓰기 때문이다(geometry-gl.js).
  //   단위 도형을 늘려 쓰면 가로로 긴 부품에서 모서리 반지름까지 늘어나 한쪽만 뭉툭해진다.
  return out;
}

/**
 * 부품 하나의 도형. 모양·치수가 같으면 캐시에서 같은 것을 돌려받는다.
 * @param detail 'high' 가까이서 보는 가구 / 'low' 수백 개가 깔리는 객석(삼각형 절약)
 */
function partGeometry(geoCache, part, detail) {
  if (part.shape === 'cyl') return geoCache.cyl(u(part.r), u(part.r), u(part.h), { detail });
  if (part.shape === 'sph') return geoCache.sph(u(part.r), { detail });
  const w = u(part.w), h = u(part.h), d = u(part.d);
  // 살짝 휜 판(등받이) → 모서리가 둥근 판 → 각진 상자 순으로 고른다.
  if (part.sag > 0) return geoCache.arc(w, h, d, { sag: u(part.sag), r: u(part.r || 0), detail });
  if (part.r > 0) return geoCache.slab(w, h, d, { mode: part.mode || 'plan', r: u(part.r), detail });
  return geoCache.box(w, h, d);
}

// ── 회의 테이블 ─────────────────────────────────────────────────────────────
// 크기·모양이 물건마다 달라 InstancedMesh로 묶지 않는다(방에 1~3개뿐).

// 보트형 상판 윤곽 — 긴 변이 바깥으로 살짝 부푼다.
function boatShape(w, d) {
  const n = 14, bulge = d * 0.16;
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = -w / 2 + w * t, y = -d / 2 - Math.sin(t * Math.PI) * bulge;
    if (i === 0) s.moveTo(u(x), u(y)); else s.lineTo(u(x), u(y));
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    s.lineTo(u(w / 2 - w * t), u(d / 2 + Math.sin(t * Math.PI) * bulge));
  }
  s.closePath();
  return s;
}

function tableMesh(item, mat, geoCache) {
  const S = createConferenceTable(item);
  const g = new THREE.Group();

  // 상판 — 두께 30mm로 얇게. 윗면이 정확히 surfaceY에 오도록 놓는다.
  let top;
  if (S.shape === 'round') {
    const r = u(Math.min(S.w, S.d) / 2);
    top = new THREE.Mesh(geoCache.cyl(r, r, u(S.topThk)), mat.tableTop);
    top.position.y = u(S.topBottom + S.topThk / 2);
  } else if (S.shape === 'boat') {
    // 가장자리에 작은 경사를 준다 — 날카로운 판때기가 아니라 상판처럼 보이게.
    const bev = u(6);
    const geo = new THREE.ExtrudeGeometry(boatShape(S.w, S.d), {
      depth: u(S.topThk) - bev * 2, bevelEnabled: true,
      bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 6,
    });
    geo.rotateX(-Math.PI / 2);            // XY 평면에 만든 뒤 눕힌다
    geo.translate(0, u(S.topThk) - bev, 0);   // 윗면이 surfaceY가 되게
    top = new THREE.Mesh(geo, mat.tableTop);
    top.position.y = u(S.topBottom);
  } else {
    // 사각 상판도 모서리를 둥글린다 — 실제 회의 테이블은 각지지 않는다.
    top = new THREE.Mesh(
      geoCache.slab(u(S.w), u(S.topThk), u(S.d), { mode: 'plan', r: u(90) }), mat.tableTop);
    top.position.y = u(S.topBottom + S.topThk / 2);
  }
  g.add(top);

  if (S.post && S.foot) {
    // 원형 테이블: 가운데 기둥 + 원판 발.
    const h = S.post.y1 - S.post.y0;
    const post = new THREE.Mesh(geoCache.cyl(u(S.post.r), u(S.post.r), u(h)), mat.tableBase);
    post.position.y = u(S.post.y0 + h / 2);
    const foot = new THREE.Mesh(geoCache.cyl(u(S.foot.r), u(S.foot.r), u(S.foot.h)), mat.tableBase);
    foot.position.y = u(S.foot.h / 2);
    g.add(post, foot);
  } else {
    // 사각·보트형: T자 받침 2개(기둥 + 바닥 발).
    for (const leg of S.legs) {
      const h = leg.post.y1 - leg.post.y0;
      const post = new THREE.Mesh(
        geoCache.slab(u(leg.post.w), u(h), u(leg.post.d), { mode: 'face', r: u(16) }), mat.tableBase);
      post.position.set(u(leg.dx), u(leg.post.y0 + h / 2), 0);
      const foot = new THREE.Mesh(
        geoCache.slab(u(leg.foot.w), u(leg.foot.h), u(leg.foot.d), { mode: 'plan', r: u(18) }), mat.tableBase);
      foot.position.set(u(leg.dx), u(leg.foot.h / 2), 0);
      g.add(post, foot);
    }
    if (S.beam) {
      // 상판 아래 보강대 — 다리 2개가 허공에 떠 보이지 않게 이어 준다.
      const beam = new THREE.Mesh(
        geoCache.slab(u(S.beam.w), u(S.beam.h), u(S.beam.d), { mode: 'face', r: u(20) }), mat.tableBeam);
      beam.position.y = u(S.beam.y);
      g.add(beam);
    }
  }
  return g;
}

function plantMesh(mat, geoCache) {
  const S = DIMS.plant;
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    geoCache.cyl(u(S.potR), u(S.potR * 0.78), u(S.potH)), mat.plantPot);
  pot.position.y = u(S.potH / 2);
  g.add(pot);
  // 둥글게 뭉친 잎 — 아래→위 지름 곡선을 돌려 만든다(막대를 쌓으면 기계 부품처럼 보인다).
  const profile = [0.42, 0.88, 1.12, 1.15, 0.98, 0.58, 0.12];
  const pts = profile.map((f, i) => new THREE.Vector2(
    Math.max(0.001, u(S.potR * 1.15 * f)),
    u(S.potH - 40 + (i * S.leafH) / (profile.length - 1)),
  ));
  const leaf = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat.plantLeaf);
  g.add(leaf);
  return g;
}

/**
 * 배치 목록 → Three.js 가구 Group.
 * @param items room-presets.layoutRoom()의 items (무대는 방 구조 쪽에서 그리므로 제외)
 * @returns THREE.Group  (호출한 쪽이 scene에 넣고, 버릴 때 disposeFurniture로 정리한다)
 */
export function buildFurnitureGroup(items, opts = {}) {
  const g = new THREE.Group();
  g.name = 'furniture';
  if (!items || !items.length) return g;

  // 색은 팔레트에서, 질감(거칠기·금속성·요철)은 재질 라이브러리에서 가져온다.
  //   부품 종류 → 재질 프리셋 대응표는 materials.js(PART_MATERIAL)에 있다.
  //   같은 프리셋 + 같은 색이면 재질 하나를 돌려 쓰므로 그리기 호출이 늘지 않는다.
  const lib = createMaterialLibrary({ textureScale: opts.textureScale ?? 1 });
  const mat = {};
  for (const [k, c] of Object.entries(FURNITURE_COLORS)) {
    const token = PART_MATERIAL[k];
    if (token) { mat[k] = lib.get(token, c); continue; }
    // 7종 프리셋에 없는 것 — 화면(모니터·이동식 디스플레이)과 잎은 여기서 직접 만든다.
    //   화면은 실내 마감재가 아니라서 재질 라이브러리에 두지 않는다(LED와 같은 이유).
    const screen = k === 'monitor' || k === 'standPanel';
    mat[k] = new THREE.MeshStandardMaterial({
      color: c, roughness: screen ? 0.35 : 0.9, metalness: screen ? 0.1 : 0,
    });
  }

  // ── 반복 가구는 InstancedMesh 로 묶는다 ──
  const buckets = new Map();
  const singles = [];
  for (const it of items) {
    if (it.type === 'stage') continue;          // 무대는 방 구조와 함께 그린다
    const key = assetKey(it);
    if (key) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    } else singles.push(it);
  }

  // 도형은 치수·모양이 같으면 하나를 돌려 쓴다. 좌석이 수백 개여도 도형은 한 벌이다.
  const geoCache = createGeometryCache();
  const m4 = new THREE.Matrix4();

  for (const list of buckets.values()) {
    const parts = assetParts(list[0]);
    if (!parts) continue;
    const id = assetFor(list[0]);
    // 시야각 판정이 붙어 있으면 앉는 면 색을 등급 색으로 바꾼다(양호·주의·불량).
    //   같은 등급끼리 이미 한 묶음이므로(assetKey에 등급이 들어간다) 재질 하나면 된다.
    const grade = list[0].grade;   // 바깥 g(Group)를 가리지 않도록 이름을 따로 쓴다
    const gradeMat = grade && GRADE_COLORS[grade] ? lib.get('fabricChair', GRADE_COLORS[grade]) : null;
    const FABRIC = new Set(['seatFabric', 'chairSeat', 'chairBack']);
    // 수백 개가 깔리는 자산(강당 객석)은 분할 수를 낮춘다 — 멀리서 보므로 티가 나지 않는다.
    const detail = list.length > 120 ? 'low' : 'high';
    for (const part of parts) {
      const geo = partGeometry(geoCache, part, detail);
      const pm = (gradeMat && FABRIC.has(part.kind)) ? gradeMat : (mat[part.kind] || mat.chairSeat);
      const im = new THREE.InstancedMesh(geo, pm, list.length);
      im.name = `${id}:${part.kind}${grade ? ':' + grade : ''}`;
      for (let i = 0; i < list.length; i++) im.setMatrixAt(i, partMatrix(list[i], part, m4));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;   // 인스턴스 전체 경계가 부정확해 통째로 사라지는 것을 막는다
      g.add(im);
    }
  }

  // ── 하나씩 놓는 가구 ──
  for (const it of singles) {
    let obj = null;
    if (it.type === 'table') obj = tableMesh(it, mat, geoCache);
    else if (it.type === 'plant') obj = plantMesh(mat, geoCache);
    else if (it.type === 'riser') {
      // 객석 단 — 윗면과 옆면 색을 나눠 낮고 얇은 단으로 읽히게 한다.
      const h = u(it.h || 200);
      obj = new THREE.Mesh(
        new THREE.BoxGeometry(u(it.w || 6000), h, u(it.d || 2000)),
        [mat.riserSide, mat.riserSide, mat.riserTop, mat.riserSide, mat.riserSide, mat.riserSide],
      );
      obj.position.y = h / 2;
      obj.renderOrder = -1;   // 좌석보다 먼저 — 단 위에 앉은 좌석이 묻히지 않게
    }
    else if (it.type === 'rug') {
      obj = new THREE.Mesh(
        geoCache.slab(u(it.w || 4000), u(DIMS.rug.h), u(it.d || 3000), { mode: 'plan', r: u(70) }), mat.rug);
      obj.position.y = u(DIMS.rug.h / 2);
    }
    if (!obj) continue;
    obj.position.x += u(it.x);
    obj.position.y += u(it.y || 0);
    obj.position.z += u(it.z);
    obj.rotation.y = -(it.rotY || 0) * DEG;
    obj.name = it.type;
    g.add(obj);
  }

  // 공용 자원은 Group에 매달아 두었다가 버릴 때 함께 반납한다.
  g.userData.shared = { geoCache, materials: Object.values(mat), lib };
  return g;
}

/** buildFurnitureGroup()이 만든 Group의 GPU 자원을 반납한다. */
export function disposeFurniture(g) {
  if (!g) return;
  // 캐시가 소유한 도형(userData.cached)은 여기서 없애지 않는다 — 여러 부품이 나눠 쓰고,
  //   캐시가 한 번에 반납한다. 보트 상판·잎처럼 그 자리에서 만든 것만 개별로 버린다.
  g.traverse(o => {
    if (o.isInstancedMesh) { o.dispose?.(); return; }
    if (o.geometry && !o.geometry.userData?.cached) o.geometry.dispose();
  });
  const sh = g.userData.shared;
  if (sh) {
    sh.geoCache?.dispose();
    for (const m of sh.materials) m.dispose();
    sh.lib?.dispose();   // 재질 라이브러리가 만든 무늬(normal map)까지 반납
  }
}
