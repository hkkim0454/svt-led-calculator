// furniture-gl.js — 배치 결과(room-presets.js) → Three.js 가구 입체.
// ─────────────────────────────────────────────────────────────────────────────
// 계산은 하지 않는다. room-presets.js가 정한 '무엇을 어디에 어느 방향으로'를 받아
// 그대로 입체로 세운다. 치수는 furniture3d.js(기존 Canvas 뷰)와 같은 값을 쓴다
// — 두 뷰의 가구 크기가 달라 보이면 안 되기 때문이다.
//
// 방향 규칙: 가구는 rotY = 0 일 때 LED 벽(-Z)을 바라보도록 만든다.
//   room-presets의 faceTowards()가 주는 rotY는 '+X쪽으로 sin, -Z쪽으로 cos'인 좌표계라
//   Three.js의 Y축 회전과 부호가 반대다 → rotation.y = -rotY.
//
// 성능: 같은 물건이 수십~수백 개 반복되므로(강당 좌석 등) InstancedMesh로 묶는다.
//   캐비닛 518장짜리 미디어월처럼 큰 건에서도 그리기 호출이 폭발하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from './vendor/three/three.module.min.js';
import { u } from './gl-model.js?v=374';

const DEG = Math.PI / 180;

// 가구 색. 기존 3D 뷰(render3d.js PALETTE)와 같은 값 — 전부 조연이라 채도를 낮춘다.
export const FURNITURE_COLORS = Object.freeze({
  tableTop: '#f5f7fa', tableBase: '#a9b3c0',
  chairSeat: '#cbdad7', chairBack: '#cbdad7', chairBase: '#aeb8c4',
  seatFabric: '#cbdad7', seatFrame: '#aeb8c4',
  deskTop: '#f3f6f9', deskLeg: '#b3bcc8', deskPanel: '#e4e9ef',
  consoleTop: '#f3f6f9', consoleBase: '#9ba6b4', monitor: '#1b2532', monitorBase: '#8f99a7',
  podium: '#eef2f7', podiumTop: '#f7f9fc',
  rug: '#c1c9d5',
  // 객석 단(계단). 윗면은 바닥보다 밝게, **옆면(챌판)은 뚜렷하게 어둡게** —
  //   옆면이 바닥색과 비슷하면 단 경계가 안 보여 그냥 평평한 단 하나로 읽힌다.
  riserTop: '#e6eaf0', riserSide: '#b9c1cd',
  plantPot: '#f2f5f9', plantLeaf: '#8fae9c',
});

// 가구 기준 치수(mm) — furniture3d.js의 SIZES와 같은 값.
export const SIZES = Object.freeze({
  chair: { seatW: 470, seatD: 460, seatY: 430, seatH: 55, backH: 400, backD: 45, baseR: 195 },
  seat: { w: 500, d: 450, seatY: 420, seatH: 50, backH: 480, backD: 45 },
  table: { topY: 720, topH: 55 },
  desk: { topY: 720, topH: 40 },
  console: { topY: 730, topH: 50, monW: 760, monH: 440 },
  podium: { w: 700, d: 500, h: 1080 },
  plant: { potR: 170, potH: 300, leafH: 520 },
  rug: { h: 14 },
});

// ── 반복되는 가구의 '부품 목록' ─────────────────────────────────────────────
// 각 부품은 물건 중심(0,0) 기준 상자다. dx·dz = 가로·앞뒤 치우침, y = 부품 중심 높이. (mm)
// 이 목록 하나가 InstancedMesh 하나가 된다.

const chairParts = () => {
  const S = SIZES.chair;
  return [
    // 납작한 받침(원기둥) + 가는 기둥 — 덩어리감을 줄인다.
    { kind: 'chairBase', shape: 'cyl', dx: 0, dz: 0, r: S.baseR, y: 37.5, h: 35 },
    { kind: 'chairBase', dx: 0, dz: 0, y: (55 + S.seatY) / 2, w: 68, h: S.seatY - 55, d: 68 },
    { kind: 'chairSeat', dx: 0, dz: 0, y: S.seatY + S.seatH / 2, w: S.seatW, h: S.seatH, d: S.seatD },
    // 등받이는 앉은 사람 뒤(+Z)
    { kind: 'chairBack', dx: 0, dz: S.seatD / 2 - S.backD / 2, y: S.seatY + S.seatH + 40 + S.backH / 2,
      w: S.seatW - 60, h: S.backH, d: S.backD },
  ];
};

const seatParts = () => {
  const S = SIZES.seat;
  return [
    { kind: 'seatFabric', dx: 0, dz: 0, y: S.seatY + S.seatH / 2, w: S.w, h: S.seatH, d: S.d },
    { kind: 'seatFabric', dx: 0, dz: S.d / 2 - S.backD / 2, y: S.seatY + S.seatH + S.backH / 2,
      w: S.w - 40, h: S.backH, d: S.backD },
    // 다리는 가운데 하나 — 줄줄이 늘어설 때 시각적 잡음을 줄인다.
    { kind: 'seatFrame', dx: 0, dz: 0, y: S.seatY / 2, w: 90, h: S.seatY, d: 90 },
  ];
};

const deskParts = (w, d) => {
  const S = SIZES.desk;
  const parts = [{ kind: 'deskTop', dx: 0, dz: 0, y: S.topY + S.topH / 2, w, h: S.topH, d }];
  for (const sx of [-w / 2 + 85, w / 2 - 85]) {
    for (const sz of [-d / 2 + 85, d / 2 - 85]) {
      parts.push({ kind: 'deskLeg', dx: sx, dz: sz, y: S.topY / 2, w: 50, h: S.topY, d: 50 });
    }
  }
  // 앞을 가리는 가림판(-Z 쪽)
  parts.push({ kind: 'deskPanel', dx: 0, dz: -d / 2 + 65, y: 340 + 175, w: w - 160, h: 350, d: 30 });
  return parts;
};

const consoleParts = (w, d) => {
  const S = SIZES.console;
  const my = S.topY + S.topH;
  const parts = [
    { kind: 'consoleTop', dx: 0, dz: 0, y: S.topY + S.topH / 2, w, h: S.topH, d },
    { kind: 'consoleBase', dx: 0, dz: 0, y: (20 + S.topY) / 2, w: w - 200, h: S.topY - 20, d: d - 200 },
  ];
  // 모니터 2대를 상판 위에 나란히
  for (const sx of [-S.monW / 2 - 20, S.monW / 2 + 20]) {
    parts.push({ kind: 'monitorBase', dx: sx, dz: 30, y: my + 60, w: 120, h: 120, d: 180 });
    parts.push({ kind: 'monitor', dx: sx, dz: 15, y: my + 120 + S.monH / 2, w: S.monW, h: S.monH, d: 50 });
  }
  return parts;
};

const podiumParts = () => {
  const S = SIZES.podium;
  return [
    { kind: 'podium', dx: 0, dz: 0, y: S.h / 2, w: S.w, h: S.h, d: S.d },
    { kind: 'podiumTop', dx: 0, dz: 0, y: S.h + 22.5, w: S.w + 80, h: 45, d: S.d + 60 },
  ];
};

// 물건 하나 → 부품 목록. 크기가 물건마다 다른 것(책상·콘솔)은 크기를 넘겨 만든다.
function partsOf(item) {
  switch (item.type) {
    case 'chair': return chairParts();
    case 'seat': return seatParts();
    case 'desk': return deskParts(item.w || 1400, item.d || 600);
    case 'console': return consoleParts(item.w || 1800, item.d || 900);
    case 'podium': return podiumParts();
    default: return null;
  }
}

// 반복 가구를 묶을 때 쓰는 열쇠 — 크기가 같아야 같은 InstancedMesh에 들어갈 수 있다.
function groupKey(item) {
  switch (item.type) {
    case 'chair': case 'seat': case 'podium': return item.type;
    case 'desk': case 'console': return `${item.type}:${Math.round(item.w || 0)}x${Math.round(item.d || 0)}`;
    default: return null;
  }
}

// ── 행렬 ────────────────────────────────────────────────────────────────────
// 물건 중심에서 회전시킨 뒤 부품 자리로 옮긴다(부품 자기 중심에서 돌리면 안 된다).
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _s = new THREE.Matrix4();

function partMatrix(item, part, out) {
  // item.y = 그 물건이 올라앉은 바닥 높이(계단식 객석의 단차). 없으면 0.
  _t.makeTranslation(u(item.x), u(item.y || 0), u(item.z));
  _r.makeRotationY(-(item.rotY || 0) * DEG);   // faceTowards와 부호가 반대 — 파일 머리말 참고
  _m.multiplyMatrices(_t, _r);
  _t.makeTranslation(u(part.dx || 0), u(part.y), u(part.dz || 0));
  _m.multiply(_t);
  if (part.shape === 'cyl') _s.makeScale(u(part.r) * 2, u(part.h), u(part.r) * 2);
  else _s.makeScale(u(part.w), u(part.h), u(part.d));
  return out.multiplyMatrices(_m, _s);
}

// ── 모양 만들기 ─────────────────────────────────────────────────────────────

// 보트형 상판 윤곽 — 긴 변이 바깥으로 살짝 부푼다(furniture3d.js와 같은 곡선).
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

function tableMesh(item, mat) {
  const S = SIZES.table;
  const g = new THREE.Group();
  const w = Math.max(400, item.w || 2400), d = Math.max(400, item.d || 1200);

  let top;
  if (item.shape === 'round') {
    const r = u(Math.min(w, d) / 2);
    top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, u(S.topH), 40), mat.tableTop);
  } else if (item.shape === 'boat') {
    const geo = new THREE.ExtrudeGeometry(boatShape(w, d), { depth: u(S.topH), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);          // XY 평면에 만든 뒤 눕힌다
    geo.translate(0, u(S.topH), 0);     // 두께만큼 올려 윗면이 topY + topH 가 되게
    top = new THREE.Mesh(geo, mat.tableTop);
  } else {
    top = new THREE.Mesh(new THREE.BoxGeometry(u(w), u(S.topH), u(d)), mat.tableTop);
  }
  top.position.y = u(S.topY + (item.shape === 'boat' ? 0 : S.topH / 2));
  g.add(top);

  if (item.shape === 'round') {
    const r1 = u(Math.min(w, d) * 0.17), r2 = u(Math.min(w, d) * 0.3);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r1, r1, u(S.topY - 60), 16), mat.tableBase);
    post.position.y = u((60 + S.topY) / 2);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r2, r2, u(40), 16), mat.tableBase);
    foot.position.y = u(40);
    g.add(post, foot);
  } else {
    // 상판을 받치는 얇은 받침 2개. 가로대를 두면 옆에서 볼 때 회색 덩어리로 뭉친다.
    const pw = Math.max(90, w * 0.035), pd = Math.max(160, d * 0.42);
    for (const sx of [-w * 0.28 + pw / 2, w * 0.28 - pw / 2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(u(pw), u(S.topY - 15), u(pd)), mat.tableBase);
      leg.position.set(u(sx), u((15 + S.topY) / 2), 0);
      g.add(leg);
    }
  }
  return g;
}

function plantMesh(mat) {
  const S = SIZES.plant;
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(u(S.potR), u(S.potR * 0.78), u(S.potH), 14), mat.plantPot);
  pot.position.y = u(S.potH / 2);
  g.add(pot);
  // 둥글게 뭉친 잎 — 아래→위 지름 곡선을 돌려 만든다(막대를 쌓으면 기계 부품처럼 보인다).
  const profile = [0.42, 0.88, 1.12, 1.15, 0.98, 0.58, 0.12];
  const pts = profile.map((f, i) => new THREE.Vector2(
    Math.max(0.001, u(S.potR * 1.15 * f)),
    u(S.potH - 40 + (i * S.leafH) / (profile.length - 1)),
  ));
  const leaf = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), mat.plantLeaf);
  g.add(leaf);
  return g;
}

/**
 * 배치 목록 → Three.js 가구 Group.
 * @param items room-presets.layoutRoom()의 items (무대는 방 구조 쪽에서 그리므로 제외)
 * @returns THREE.Group  (호출한 쪽이 scene에 넣고, 버릴 때 disposeFurniture로 정리한다)
 */
export function buildFurnitureGroup(items) {
  const g = new THREE.Group();
  g.name = 'furniture';
  if (!items || !items.length) return g;

  // 색마다 재질 하나. 같은 색을 쓰는 부품은 재질을 공유한다.
  const mat = {};
  for (const [k, c] of Object.entries(FURNITURE_COLORS)) {
    mat[k] = new THREE.MeshStandardMaterial({ color: c, roughness: k === 'monitor' ? 0.4 : 0.9, metalness: 0 });
  }

  // ── 반복 가구는 InstancedMesh 로 묶는다 ──
  const buckets = new Map();
  const singles = [];
  for (const it of items) {
    if (it.type === 'stage') continue;          // 무대는 방 구조와 함께 그린다
    const key = groupKey(it);
    if (key) {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    } else singles.push(it);
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const m4 = new THREE.Matrix4();

  for (const list of buckets.values()) {
    const parts = partsOf(list[0]);
    if (!parts) continue;
    for (const part of parts) {
      const geo = part.shape === 'cyl' ? cylGeo : boxGeo;
      const im = new THREE.InstancedMesh(geo, mat[part.kind] || mat.chairSeat, list.length);
      im.name = `${list[0].type}:${part.kind}`;
      for (let i = 0; i < list.length; i++) im.setMatrixAt(i, partMatrix(list[i], part, m4));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;   // 인스턴스 전체 경계가 부정확해 통째로 사라지는 것을 막는다
      g.add(im);
    }
  }

  // ── 하나씩 놓는 가구 ──
  for (const it of singles) {
    let obj = null;
    if (it.type === 'table') obj = tableMesh(it, mat);
    else if (it.type === 'plant') obj = plantMesh(mat);
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
        new THREE.BoxGeometry(u(it.w || 4000), u(SIZES.rug.h), u(it.d || 3000)), mat.rug);
      obj.position.y = u(SIZES.rug.h / 2);
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
  g.userData.shared = { boxGeo, cylGeo, materials: Object.values(mat) };
  return g;
}

/** buildFurnitureGroup()이 만든 Group의 GPU 자원을 반납한다. */
export function disposeFurniture(g) {
  if (!g) return;
  g.traverse(o => { if (o.isInstancedMesh) o.dispose?.(); else o.geometry?.dispose?.(); });
  const sh = g.userData.shared;
  if (sh) {
    sh.boxGeo.dispose(); sh.cylGeo.dispose();
    for (const m of sh.materials) m.dispose();
  }
}
