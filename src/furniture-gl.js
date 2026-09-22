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
import { u } from './gl-model.js?v=447';
import { createMaterialLibrary } from './materials-gl.js?v=447';
import { PART_MATERIAL, PART_FINISH, PART_FINISH_ALIASES, finishForPart } from './materials.js?v=447';
import { GRADE_COLORS } from './viewangle.js?v=447';
import { createGeometryCache } from './geometry-gl.js?v=447';
import { resolveFurnitureForDesign } from './furniture-routing.js?v=447';
import {
  credenzaFinishForDesign,
  avFinishForDesign,
  floorPartFinishForDesign,
  tablePartFinishForDesign,
  consoleFinishForDesign,
  trainingFinishForDesign,
} from './design-finish.js?v=447';
import {
  FURNITURE_COLORS, DIMS, FURNITURE_ASSETS,
  assetFor, assetParts, assetKey, createConferenceTable, createCorporateTable, fitsCorporateTable,
  createBoardroomTable,
  createLargeUTable,
} from './furniture-assets.js?v=447';

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
  // 5발 받침 — 조각 11개를 한 덩어리로 구워 온다(그리기 호출 1개).
  if (part.shape === 'star') {
    return geoCache.star({
      legs: part.legs, reach: u(part.reach), hubR: u(part.hubR), hubH: u(part.hubH),
      legW: u(part.legW), legH: u(part.legH), casterR: u(part.casterR), casterH: u(part.casterH),
    }, { detail });
  }
  if (part.shape === 'cyl') return geoCache.cyl(u(part.r), u(part.r), u(part.h), { detail });
  if (part.shape === 'sph') return geoCache.sph(u(part.r), { detail });
  const w = u(part.w), h = u(part.h), d = u(part.d);
  // 살짝 휜 판(등받이) → 모서리가 둥근 판 → 각진 상자 순으로 고른다.
  // 위로 갈수록 좁아지는 휜 판(하이백 등받이) — 폭이 높이에 따라 변하므로 전용 도형을 쓴다.
  // 곡선 콘솔 상판(PHASE 5-b) — 평면 윤곽이 휘므로 전용 도형을 쓴다.
  if (part.shape === 'curvedTop') {
    return geoCache.curvedTop(w, d, h, { sag: u(part.sag || 0), detail });
  }
  if (part.shape === 'taper') {
    return geoCache.taperedBack(u(part.wBottom), u(part.wTop), u(part.h), u(part.thk),
      { sag: u(part.sag || 0), detail });
  }
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

/**
 * 대기업 회의 테이블 (PHASE 2-b) — 얇은 상판 + T형 받침 + 얇은 보강대.
 * 치수·받침 위치는 전부 순수 명세(createCorporateTable)가 정한다. 여기서는 세우기만 한다.
 * 상판 마감만 새 마감 표(corporateTop)를 쓰고, 받침·보강대는 기존 재질 경로 그대로다.
 */
function corporateTableMesh(item, mat, geoCache) {
  const S = createCorporateTable(item);
  const g = new THREE.Group();

  // 상판 — 윗면이 정확히 surfaceY 에 오도록 놓는다. 두께는 계약대로 25mm.
  const top = S.shape === 'boat'
    ? new THREE.Mesh(geoCache.boatTop(u(S.w), u(S.d), u(S.topThk), { bulge: u(S.bulge) }), mat.corporateTop)
    : new THREE.Mesh(
      geoCache.slab(u(S.w), u(S.topThk), u(S.d), { mode: 'plan', r: u(S.topRadius) }), mat.corporateTop);
  top.position.y = u(S.topBottom + S.topThk / 2);   // 윗면 = surfaceY
  top.name = 'corporateTop';
  g.add(top);

  // T형 받침 — 가는 기둥 + 눕힌 바닥 발. 식탁 다리 넷과 다른 실루엣이고 무릎 공간이 넓다.
  for (const sp of S.supports) {
    const h = sp.post.y1 - sp.post.y0;
    const post = new THREE.Mesh(
      geoCache.slab(u(sp.post.w), u(h), u(sp.post.d), { mode: 'face', r: u(14) }), mat.tableBase);
    post.position.set(u(sp.dx), u(sp.post.y0 + h / 2), 0);
    post.name = 'tableBase';
    const foot = new THREE.Mesh(
      geoCache.slab(u(sp.foot.w), u(sp.foot.h), u(sp.foot.d), { mode: 'plan', r: u(12) }), mat.tableBase);
    foot.position.set(u(sp.dx), u(sp.foot.h / 2), 0);
    foot.name = 'tableBase';
    g.add(post, foot);
  }

  // 보강대 — 상판이 공중에 떠 보이지 않게만. 실내 시점에서는 거의 안 보이는 두께다.
  if (S.beam) {
    const beam = new THREE.Mesh(
      geoCache.slab(u(S.beam.w), u(S.beam.h), u(S.beam.d), { mode: 'face', r: u(14) }), mat.tableBeam);
    beam.position.y = u(S.beam.y);
    beam.name = 'tableBeam';
    g.add(beam);
  }
  return g;
}

/**
 * 경사(bevel)를 준 **눕힌 판**을 정확한 치수로.
 *   ExtrudeGeometry의 경사는 윤곽을 사방으로 넓힌다 — 눕힌 판에서는 가로·세로만 커지고
 *   높이는 그대로다. 그래서 가로·세로를 미리 줄여서 굽는다.
 *   (하이백 헤드레스트가 62mm 설계에 151mm로 나왔던 함정이 이것이다 — 얇은 부품일수록 크게 티가 난다.)
 */
function exactPlanSlab(geoCache, w, h, d, r, bevel) {
  const b = Math.max(0.5, Math.min(bevel, w / 2 - 1, d / 2 - 1, h / 2 - 1));
  return geoCache.slab(u(w - b * 2), u(h), u(d - b * 2),
    { mode: 'plan', r: u(Math.max(0, r - b)), bevel: u(b) });
}

/**
 * 임원 회의실 대형 U 테이블 (PHASE 3-b) — 이음매 없는 U자 상판 + 판형 블레이드 하부 구조.
 *
 * **조각 하나가 아니라 테이블 조각 전체를 받는다.** 배치는 U자를 직사각형 세 장으로 주는데,
 *   세 장을 따로 세우면 이음매 세 줄이 그대로 보인다(계약이 금지한 모습).
 *   치수·좌표는 전부 순수 명세(createBoardroomTable)가 정한다. 여기서는 세우기만 한다.
 * 만들 수 없는 모양이면 **null**을 돌려준다 — 부르는 쪽이 기존 테이블로 되돌린다.
 */
function boardroomTableMesh(items, mat, geoCache) {
  const S = createBoardroomTable(items);
  if (!S) return null;
  const g = new THREE.Group();

  // 상판 — 한 덩어리. 윗면이 정확히 surfaceY 에 오도록 놓는다.
  const top = new THREE.Mesh(
    geoCache.uTop(u(S.outerW), u(S.outerD), u(S.segW), u(S.topThk), {
      frontR: u(S.frontR), rearR: u(S.rearR), innerR: u(S.innerR), bevel: u(S.topBevel),
    }), mat.boardroomTop);
  top.position.y = u(S.topBottom + S.topThk / 2);
  top.name = 'boardroomTop';
  g.add(top);

  // 판형 블레이드 — 상판 밑면에서 bodyDrop 만큼 내려온 얇은 세로 판.
  //   통짜 받침대가 아니라 **띄운 판**이라 아래가 비어 보인다(임원 테이블의 가벼운 인상).
  const bladeH = S.topBottom - S.panelBottom;
  for (const sp of S.supports) {
    const blade = new THREE.Mesh(exactPlanSlab(geoCache, sp.w, bladeH, sp.d, 20, 6), mat.boardroomBase);
    blade.position.set(u(sp.dx), u(S.panelBottom + bladeH / 2), u(sp.dz));
    blade.name = 'boardroomBase';
    g.add(blade);
    // 굽 — 블레이드보다 양 끝이 들어가 있어 판이 바닥에서 떠 보인다.
    if (S.panelBottom > 0) {
      const cut = S.toeInset * 2;
      const tw = sp.along === 'x' ? Math.max(120, sp.w - cut) : sp.w;
      const td = sp.along === 'z' ? Math.max(120, sp.d - cut) : sp.d;
      const toe = new THREE.Mesh(
        exactPlanSlab(geoCache, tw, S.panelBottom, td, 10, 4), mat.boardroomBase);
      toe.position.set(u(sp.dx), u(S.panelBottom / 2), u(sp.dz));
      toe.name = 'boardroomBase';
      g.add(toe);
    }
  }
  // 세 조각의 **합쳐진 중심**에 놓는다 — 조각 하나의 좌표가 아니다.
  g.position.set(u(S.cx), 0, u(S.cz));
  return orientUTable(g, S);
}

// U자 덩어리를 세울 때 돌린다. 도형·받침 좌표는 전부 **기준 방향(LED 쪽으로 열림)**으로
//   만들어지므로, 방향이 다르면 다 만든 덩어리를 통째로 돌리기만 하면 된다.
//   부호는 다른 가구와 같은 규칙이다(rotY = 0 이면 -Z 를 본다).
function orientUTable(g, S) {
  if (S.rotY) g.rotation.y = -S.rotY * DEG;
  return g;
}

/**
 * 대회의실 대형 U 테이블 (PHASE 4-b) — 얇은 U자 상판 + 가는 기둥 + 긴 보.
 *
 * 임원 테이블과 같은 순서로 세우지만 **하부 구조가 다르다.** 임원은 판형 블레이드,
 *   여기는 기둥과 보다 — 좌석이 훨씬 많고 좌석마다 개인 모니터가 놓일 자리를 비워야 한다.
 * 기둥·굽은 수가 많고 크기가 모두 같으므로 **InstancedMesh 두 덩어리**로 묶는다
 *   (테이블이 아무리 길어져도 그리기 호출이 늘지 않는다).
 * 치수·좌표는 전부 순수 명세(createLargeUTable)가 정한다. 여기서는 세우기만 한다.
 */
function largeUTableMesh(items, mat, geoCache) {
  const S = createLargeUTable(items);
  if (!S) return null;
  const g = new THREE.Group();

  // 상판 — 한 덩어리. 윗면이 정확히 surfaceY 에 오도록 놓는다.
  const top = new THREE.Mesh(
    geoCache.uTop(u(S.outerW), u(S.outerD), u(S.segW), u(S.topThk), {
      frontR: u(S.frontR), rearR: u(S.rearR), innerR: u(S.innerR), bevel: u(S.topBevel),
    }), mat.conferenceTop);
  top.position.y = u(S.topBottom + S.topThk / 2);
  top.name = 'conferenceTop';
  g.add(top);

  // 긴 보 — 상판 바로 아래에서 기둥을 잇는다. 길이가 다르므로 하나씩 세운다(3줄뿐이다).
  for (const b of S.beams) {
    const along = b.along === 'x';
    const beam = new THREE.Mesh(
      geoCache.box(u(along ? b.len : S.beam.w), u(S.beam.h), u(along ? S.beam.w : b.len)),
      mat.conferenceBase);
    beam.position.set(u(b.dx), u(S.beam.y), u(b.dz));
    beam.name = 'conferenceBase';
    g.add(beam);
  }

  // 기둥과 굽 — 크기가 모두 같다. 방향(띠를 따라 눕는 쪽)만 인스턴스 행렬로 돌린다.
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  for (const [name, box, y] of [
    ['post', { w: S.post.w, h: S.post.h, d: S.post.d }, S.post.y],
    ['foot', { w: S.foot.w, h: S.foot.h, d: S.foot.d }, S.foot.y],
  ]) {
    const im = new THREE.InstancedMesh(
      geoCache.slab(u(box.w), u(box.h), u(box.d), { mode: 'plan', r: u(12), bevel: u(4) }),
      mat.conferenceBase, S.supports.length);
    im.name = `conferenceBase:${name}`;
    for (let i = 0; i < S.supports.length; i++) {
      const sp = S.supports[i];
      qt.setFromAxisAngle(yAxis, sp.along === 'z' ? Math.PI / 2 : 0);
      im.setMatrixAt(i, m4.compose(pos.set(u(sp.dx), u(y), u(sp.dz)), qt, sc));
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    g.add(im);
  }

  g.position.set(u(S.cx), 0, u(S.cz));
  return orientUTable(g, S);
}

function plantMesh(mat, geoCache) {
  const S = DIMS.plant;
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    geoCache.cyl(u(S.potR), u(S.potR * 0.78), u(S.potH)), mat.plantPot);
  pot.position.y = u(S.potH / 2);
  // 부품에 이름을 붙인다(PHASE 6-a) — 화분은 Group 이라 **바깥 Group 만** `plant` 이름을 받고
  //   속 부품 둘은 무명이었다. 그러면 화면 검사·충돌 검사·수명주기 검사가 화분을 셀 수 없다
  //   (PHASE 6-0 감사에서 실제로 '화분 없음'으로 잘못 읽혔다). 이름은 다른 직접 제작 가구
  //   (`rug`·`riserTop`)와 같은 방식으로 **부품 종류 이름 그대로** 쓴다. 그리기에는 영향이 없다.
  pot.name = 'plantPot';
  g.add(pot);
  // 둥글게 뭉친 잎 — 아래→위 지름 곡선을 돌려 만든다(막대를 쌓으면 기계 부품처럼 보인다).
  const profile = [0.42, 0.88, 1.12, 1.15, 0.98, 0.58, 0.12];
  const pts = profile.map((f, i) => new THREE.Vector2(
    Math.max(0.001, u(S.potR * 1.15 * f)),
    u(S.potH - 40 + (i * S.leafH) / (profile.length - 1)),
  ));
  const leaf = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat.plantLeaf);
  leaf.name = 'plantLeaf';
  g.add(leaf);
  return g;
}

/**
 * 배치 목록 → Three.js 가구 Group.
 * @param items room-presets.layoutRoom()의 items (무대는 방 구조 쪽에서 그리므로 제외)
 * @returns THREE.Group  (호출한 쪽이 scene에 넣고, 버릴 때 disposeFurniture로 정리한다)
 */
/**
 * 배치 항목 하나를 **그 공간 디자인의 눈으로** 다시 본다(PHASE 2-a).
 *   디자인이 없으면 손대지 않는다 → 기존 화면이 그대로다.
 *   디자인이 요청한 가구가 실제로 있으면 그 이름을 자산 힌트로 갈아 끼운다.
 *   판단은 전부 furniture-routing.js가 한다 — 여기서 규칙을 다시 쓰지 않는다.
 */
function routeItem(item, designId) {
  if (!designId) return item;
  const r = resolveFurnitureForDesign(item, designId);
  // 그릴 것이 없다고 나오면 **기존 선택을 그대로 쓴다** — 화면에서 가구가 사라지는 편이
  //   잘못 그리는 것보다 나은 상황은 아직 없다(미구현 AV 장비는 배치에 등장하지 않는다).
  if (!r.runtimeAsset || r.runtimeAsset === assetFor(item)) return item;
  return { ...item, asset: r.runtimeAsset };
}

/**
 * U자 상판을 **한 덩어리로** 세우는 자산들. 이름 한 줄을 더하면 그 자산이 U자를 맡는다.
 *   각 함수는 맡을 수 없는 모양이면 null을 돌려주고, 그때는 기존 테이블이 조각마다 선다.
 */
const U_TABLE_MESH = Object.freeze({
  boardroomTable: boardroomTableMesh,
  largeUTable: largeUTableMesh,
});

export function buildFurnitureGroup(items, opts = {}) {
  const g = new THREE.Group();
  g.name = 'furniture';
  if (!items || !items.length) return g;

  // 색은 팔레트에서, 질감(거칠기·금속성·요철)은 재질 라이브러리에서 가져온다.
  //   부품 종류 → 재질 프리셋 대응표는 materials.js(PART_MATERIAL)에 있다.
  //   같은 프리셋 + 같은 색이면 재질 하나를 돌려 쓰므로 그리기 호출이 늘지 않는다.
  const lib = createMaterialLibrary({ textureScale: opts.textureScale ?? 1 });
  const designId = opts.designId || null;
  const mat = {};
  for (const [k, c] of Object.entries(FURNITURE_COLORS)) {
    const token = PART_MATERIAL[k];
    if (token) { mat[k] = lib.get(token, c); continue; }
    // 7종 프리셋에 없는 것 — 화면(모니터·이동식 디스플레이)과 잎은 여기서 직접 만든다.
    //   화면은 실내 마감재가 아니라서 재질 라이브러리에 두지 않는다(LED와 같은 이유).
    const screen = k === 'monitor' || k === 'standPanel' || k === 'screen';
    mat[k] = new THREE.MeshStandardMaterial({
      color: c, roughness: screen ? 0.35 : 0.9, metalness: screen ? 0.1 : 0,
    });
  }
  // ── 새 마감 표(PART_FINISH)를 타는 부품 ──
  //   기업 AV 디자인 시스템 가구(대기업 회의 의자 등)는 색·거칠기·금속성을 마감 표가 정한다.
  //   **기존 가구는 영향을 받지 않는다** — 마감 표의 부품 이름은 기존 부품 이름과 겹치지 않는다
  //   (materials.js에서 그렇게 지었고 테스트가 지킨다).
  //   별칭도 함께 돈다 — 헤드레스트처럼 **기존 마감을 그대로 쓰는 부품**은 마감 표에 제 줄이 없다.
  //   빠뜨리면 그 부품만 재질이 없어 **하얗게** 뜬다(임원 의자 첫 검수에서 실제로 그랬다).
  for (const kind of [...Object.keys(PART_FINISH), ...Object.keys(PART_FINISH_ALIASES)]) {
    const fin = finishForPart(kind);
    if (!fin || !fin.color) continue;          // 색이 없는 항목은 아직 쓰이지 않는다
    const extra = {};
    if (typeof fin.roughness === 'number') extra.roughness = fin.roughness;
    if (typeof fin.metalness === 'number') extra.metalness = fin.metalness;
    mat[kind] = lib.get(fin.material, fin.color, Object.keys(extra).length ? extra : undefined);
  }

  // ── 공간 디자인이 정한 마감으로 갈아 끼우는 부품 ──
  //   **형상은 그대로 두고 마감만 바꾼다.** AV 수납장은 여러 공간이 함께 쓰는 자산이라
  //   자산 자체의 색을 바꾸면 그 공간들이 전부 같이 바뀐다. 디자인이 정한 공간에서만 갈아 끼운다.
  //   디자인이 마감을 정하지 않았으면 null이므로 아무 일도 일어나지 않는다.
  for (const fin of [credenzaFinishForDesign(designId), floorPartFinishForDesign(designId),
    tablePartFinishForDesign(designId), avFinishForDesign(designId),
    consoleFinishForDesign(designId), trainingFinishForDesign(designId)]) {
    if (!fin) continue;
    for (const [part, f] of Object.entries(fin)) {
      // 거칠기·금속성은 **부품 마감표가 정한 값을 그대로 나른다**(design-finish가 실어 보낸다).
      //   여기서 빠뜨리면 디자인을 켜는 순간 그 부품만 조용히 반질반질해진다.
      const extra = {};
      if (typeof f.roughness === 'number') extra.roughness = f.roughness;
      if (typeof f.metalness === 'number') extra.metalness = f.metalness;
      mat[part] = lib.get(f.material, f.color, Object.keys(extra).length ? extra : undefined);
    }
  }

  // ── 반복 가구는 InstancedMesh 로 묶는다 ──
  const buckets = new Map();
  const singles = [];
  // 디자인이 있으면 먼저 가구를 갈아 끼운다 — 그래야 '어떤 테이블인가'를 한 번에 판단할 수 있다.
  const routed = [];
  for (const raw of items) {
    if (raw.type === 'stage') continue;         // 무대는 방 구조와 함께 그린다
    routed.push(routeItem(raw, designId));
  }
  const tableItems = routed.filter(x => x.type === 'table');
  // 이 배치에 테이블이 몇 조각인가. 한 조각이면 '가운데 회의 테이블', 여러 조각이면 U자형 등이다.
  const oneTable = tableItems.length === 1;
  // U자 전용 테이블 — 조각 전체가 **같은 U자 자산 하나**로 읽힐 때만. 아니면 null =
  //   기존 테이블이 조각마다 선다(화면에서 테이블이 사라지지 않게).
  const uTableId = (tableItems.length > 0 && U_TABLE_MESH[assetFor(tableItems[0])]
    && tableItems.every(x => assetFor(x) === assetFor(tableItems[0]))) ? assetFor(tableItems[0]) : null;
  for (const it of routed) {
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

  // 임원 U 테이블은 **조각마다가 아니라 한 번에** 세운다. 세울 수 없으면 null이고,
  //   그때는 아래 반복문이 기존 테이블로 조각마다 그린다(화면에서 테이블이 사라지지 않게).
  const uTableMesh = uTableId ? U_TABLE_MESH[uTableId](tableItems, mat, geoCache) : null;

  // ── 하나씩 놓는 가구 ──
  for (const it of singles) {
    let obj = null;
    // 어떤 테이블 자산을 세울지는 **라우터가 이미 정했다**(routeItem). 여기서는 고르기만 한다.
    //   다만 대기업 테이블이 맡는 것은 **가운데 한 덩어리로 놓인 회의 테이블**뿐이다.
    //   U자형처럼 여러 조각으로 나뉜 배치에서는 조각마다 마감이 달라져 이음매가 드러난다 —
    //   그런 배치는 전용 변형(executive-u)이 생길 때까지 기존 테이블이 통째로 맡는다.
    if (it.type === 'table') {
      if (uTableMesh) continue;                 // U자는 조각마다가 아니라 따로 **한 번에** 세운다
      const useCorporate = assetFor(it) === 'corporateTable' && oneTable && fitsCorporateTable(it);
      obj = useCorporate ? corporateTableMesh(it, mat, geoCache) : tableMesh(it, mat, geoCache);
    }
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

  // ── U자 테이블 — 조각이 아니라 한 덩어리로 딱 하나 ──
  if (uTableMesh) { uTableMesh.name = uTableId; g.add(uTableMesh); }

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
