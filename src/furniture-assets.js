// furniture-assets.js — 가구 에셋 카탈로그 (Furniture Asset System).
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일은 **순수(pure)** 하다. DOM도, Three.js도 import하지 않는다.
//   "의자는 어떤 부품이 어디에 어떤 크기로 붙는가"라는 **형상 정의**만 담는다.
//   실제 Three.js 입체로 세우는 일은 furniture-gl.js가 한다(어댑터).
//   덕분에 Node에서 치수·비율을 그대로 테스트할 수 있다(tests/furniture-assets.test.js).
//
// 배치(무엇을 어디에)는 room-presets.js가 정한다. 이 파일은 좌표를 만들지 않는다.
//   room-presets → items[{type,x,z,rotY,y,...}] → assetFor() → assetParts() → furniture-gl
//
// 스타일 기준: Semi-realistic / Clean / Architectural visualization.
//   형태 비율은 실제 가구 치수를 따르되, 곡면·베벨·텍스처는 쓰지 않는다.
//   부품은 상자(box)와 기둥(cyl) 두 가지 원시 도형뿐이다 — 폴리곤을 늘리지 않기 위함.
//
// 좌표 규약 (모두 mm, 물건 중심 기준):
//   dx  좌우 치우침(+X = 오른쪽)
//   dz  앞뒤 치우침(+Z = 뒤쪽 = 앉은 사람 등 뒤). rotY=0이면 LED 벽(-Z)을 바라본다.
//   y   부품 **중심**의 바닥으로부터의 높이
//   tiltX  X축 기울기(도). +값이면 위쪽이 뒤(+Z)로 넘어간다 → 등받이 젖힘.
// ─────────────────────────────────────────────────────────────────────────────

// ── 색 ──────────────────────────────────────────────────────────────────────
// 전부 조연이라 채도를 낮춘다. 파랑/흰색 UI 디자인 시스템과 같은 계열.
export const FURNITURE_COLORS = Object.freeze({
  tableTop: '#f5f7fa', tableBase: '#a9b3c0', tableBeam: '#9ba6b4',
  chairSeat: '#cbdad7', chairBack: '#cbdad7', chairBase: '#aeb8c4', chairArm: '#9ea9b6',
  seatFabric: '#cbdad7', seatFrame: '#aeb8c4', seatArm: '#a3aebb',
  deskTop: '#f3f6f9', deskLeg: '#b3bcc8', deskPanel: '#e4e9ef', deskRail: '#a9b3c0',
  consoleTop: '#f3f6f9', consoleBase: '#9ba6b4', monitor: '#1b2532', monitorBase: '#8f99a7',
  podium: '#eef2f7', podiumTop: '#f7f9fc',
  rug: '#c1c9d5',
  // 객석 단(계단). 윗면은 바닥보다 밝게, **옆면(챌판)은 뚜렷하게 어둡게** —
  //   옆면이 바닥색과 비슷하면 단 경계가 안 보여 그냥 평평한 단 하나로 읽힌다.
  riserTop: '#e6eaf0', riserSide: '#b9c1cd',
  plantPot: '#f2f5f9', plantLeaf: '#8fae9c',
});

// ── 실측 기준 치수(mm) ──────────────────────────────────────────────────────
// seatTop = 좌판 **윗면** 높이(사람이 앉는 면). seatThk = 좌판 두께.
export const DIMS = Object.freeze({
  // 회의용 회전의자 — 좌석고 450 / 폭 480 / 깊이 470 (사무용 KS 범위 안)
  conferenceChair: Object.freeze({
    seatTop: 450, seatThk: 70, seatW: 480, seatD: 470,
    backH: 480, backThk: 55, backTilt: 12, backTopY: 1005,
    baseR: 310, baseThk: 22, columnR: 35,
    armY: 660, armSpan: 575,
  }),
  // 강당 고정 객석 — 좌석고 440 / 폭 500 (좌석 피치 550과 맞물린다)
  auditoriumChair: Object.freeze({
    seatTop: 440, seatThk: 75, seatW: 500, seatD: 460,
    backH: 520, backThk: 70, backTilt: 16, backTopY: 1040,
    legW: 60, legD: 90, legSpan: 410,
    armY: 555, armSpan: 545,
  }),
  // 강의용 의자 — 4다리 고정형. 팔걸이 없음, 등받이 아래가 트여 있다.
  trainingChair: Object.freeze({
    seatTop: 450, seatThk: 55, seatW: 470, seatD: 450,
    backH: 370, backThk: 45, backTilt: 10, backTopY: 960,
    legW: 45,
  }),
  // 회의 테이블 — 상판 윗면 740, 두께 30(얇게). 다리는 T형 받침 2개 + 보강대.
  conferenceTable: Object.freeze({
    surfaceY: 740, topThk: 30,
    postW: 110, footH: 40, beamH: 70, beamD: 140,
  }),
  // 강의용 책상 — 상판 윗면 730, 두께 25. 얇은 각관 다리 + 가림판.
  trainingDesk: Object.freeze({
    surfaceY: 730, topThk: 25, legW: 40, railW: 30,
    panelH: 300, panelThk: 18, panelTopGap: 20,
  }),
  // 상황실 콘솔 / 교탁 — 이번 단계에서 형상을 바꾸지 않는다(기존 값 유지).
  controlConsole: Object.freeze({ surfaceY: 730, topThk: 50, monW: 760, monH: 440 }),
  podium: Object.freeze({ w: 700, d: 500, h: 1080 }),
  // 부속물
  plant: Object.freeze({ potR: 170, potH: 300, leafH: 520 }),
  rug: Object.freeze({ h: 14 }),
});

const box = (kind, dx, y, dz, w, h, d, tiltX) => {
  const p = { kind, shape: 'box', dx, y, dz, w, h, d };
  if (tiltX) p.tiltX = tiltX;
  return p;
};
const cyl = (kind, dx, y, dz, r, h) => ({ kind, shape: 'cyl', dx, y, dz, r, h });

// ── FurnitureFactory ────────────────────────────────────────────────────────
// 각 create*()는 '부품 목록'을 돌려준다. 같은 자산의 부품 목록은 항상 같으므로
// 좌석이 2,400개든 1개든 부품 종류 수만큼만 InstancedMesh가 만들어진다.

/** 회의용 회전의자 — 5발 받침 + 가스실린더 + 두툼한 좌판 + 젖혀진 등받이 + 팔걸이. */
export function createConferenceChair() {
  const S = DIMS.conferenceChair;
  const seatBottom = S.seatTop - S.seatThk;          // 380
  const armDx = S.armSpan / 2 - 30;                  // 팔걸이 패드 중심
  return [
    // 납작한 받침판 — 5발 스타베이스를 원판 하나로 압축(폴리곤 절약).
    cyl('chairBase', 0, S.baseThk / 2, 0, S.baseR, S.baseThk),
    // 가스실린더. 지름 70mm — 굵은 기둥이 되지 않게 얇게 유지한다.
    cyl('chairBase', 0, (S.baseThk + seatBottom) / 2, 0, S.columnR, seatBottom - S.baseThk),
    // 좌판: 실제 쿠션 두께 70mm.
    box('chairSeat', 0, seatBottom + S.seatThk / 2, 0, S.seatW, S.seatThk, S.seatD),
    // 좌판과 등받이를 잇는 지지대 — 등받이가 허공에 뜨지 않게 한다.
    box('chairBase', 0, S.seatTop + 57, S.seatD / 2 - 45, 90, 115, 70),
    // 등받이: 12° 뒤로 젖힘.
    box('chairBack', 0, S.backTopY - S.backH / 2, S.seatD / 2 - 35,
      S.seatW - 40, S.backH, S.backThk, S.backTilt),
    // 팔걸이 = 수직 지지대 + 수평 패드 (좌·우).
    box('chairArm', -armDx, (S.seatTop + S.armY) / 2 + 20, 60, 30, S.armY - S.seatTop - 40, 30),
    box('chairArm', armDx, (S.seatTop + S.armY) / 2 + 20, 60, 30, S.armY - S.seatTop - 40, 30),
    box('chairArm', -armDx, S.armY, -10, 55, 22, 250),
    box('chairArm', armDx, S.armY, -10, 55, 22, 250),
  ];
}

/** 강당 고정 객석 — 양옆 다리(스탠더드) + 두툼한 좌판 + 크게 젖혀진 등받이 + 팔걸이판. */
export function createAuditoriumChair() {
  const S = DIMS.auditoriumChair;
  const seatBottom = S.seatTop - S.seatThk;          // 365
  const legDx = S.legSpan / 2;
  const armDx = S.armSpan / 2 - 22;
  return [
    box('seatFrame', -legDx, seatBottom / 2, 0, S.legW, seatBottom, S.legD),
    box('seatFrame', legDx, seatBottom / 2, 0, S.legW, seatBottom, S.legD),
    box('seatFabric', 0, seatBottom + S.seatThk / 2, 0, S.seatW, S.seatThk, S.seatD),
    // 좌판 뒤 연결부 — 등받이 아래를 막아 극장 의자처럼 닫힌 형태로 읽히게 한다.
    box('seatFrame', 0, S.seatTop + 45, S.seatD / 2 - 30, S.seatW - 80, 90, 60),
    box('seatFabric', 0, S.backTopY - S.backH / 2, S.seatD / 2 - 25,
      S.seatW - 30, S.backH, S.backThk, S.backTilt),
    // 옆 팔걸이 판 — 줄줄이 늘어설 때 좌석 경계를 만들어 준다.
    box('seatArm', -armDx, S.armY, 20, 45, 110, 400),
    box('seatArm', armDx, S.armY, 20, 45, 110, 400),
  ];
}

/** 강의용 의자 — 얇은 4다리, 팔걸이 없음, 등받이와 좌판 사이가 트여 있다. */
export function createTrainingChair() {
  const S = DIMS.trainingChair;
  const seatBottom = S.seatTop - S.seatThk;          // 395
  const lx = S.seatW / 2 - 55, lz = S.seatD / 2 - 50;
  const parts = [];
  for (const sx of [-lx, lx]) {
    for (const sz of [-lz, lz]) {
      parts.push(box('seatFrame', sx, seatBottom / 2, sz, S.legW, seatBottom, S.legW));
    }
  }
  parts.push(box('chairSeat', 0, seatBottom + S.seatThk / 2, 0, S.seatW, S.seatThk, S.seatD));
  // 등받이 지지 기둥 2개 — 좌판 뒤에서 위로 뻗는다.
  for (const sx of [-150, 150]) {
    parts.push(box('seatFrame', sx, S.seatTop + 65, S.seatD / 2 - 40, 40, 130, 40));
  }
  parts.push(box('chairBack', 0, S.backTopY - S.backH / 2, S.seatD / 2 - 25,
    S.seatW - 40, S.backH, S.backThk, S.backTilt));
  return parts;
}

/** 강의용 책상 — 얇은 상판 + 각관 다리 4 + 옆 보강대 2 + 앞 가림판. */
export function createTrainingDesk(w = 1400, d = 600) {
  const S = DIMS.trainingDesk;
  const top = S.surfaceY - S.topThk;                 // 상판 아랫면
  const lx = w / 2 - 90, lz = d / 2 - 80;
  const parts = [box('deskTop', 0, top + S.topThk / 2, 0, w, S.topThk, d)];
  for (const sx of [-lx, lx]) {
    for (const sz of [-lz, lz]) {
      parts.push(box('deskLeg', sx, top / 2, sz, S.legW, top, S.legW));
    }
    // 앞뒤 다리를 잇는 낮은 보강대 — 금속 프레임 책상의 특징.
    parts.push(box('deskRail', sx, 120, 0, S.railW, S.railW, lz * 2));
  }
  // 가림판(modesty panel)은 LED 쪽(-Z)에 매달린다. 상판 아래 20mm 띄운다.
  const panelTop = top - S.panelTopGap;
  parts.push(box('deskPanel', 0, panelTop - S.panelH / 2, -d / 2 + 60,
    w - 200, S.panelH, S.panelThk));
  return parts;
}

/**
 * 회의 테이블 — 부품 목록이 아니라 **구성 명세**를 돌려준다.
 * 상판이 원형·보트형이면 상자가 아니라서 Three.js 쪽에서 따로 만들어야 하기 때문이다.
 */
export function createConferenceTable(item = {}) {
  const S = DIMS.conferenceTable;
  const shape = item.shape || 'rect';
  const w = Math.max(400, item.w || 2400);
  const d = Math.max(400, item.d || 1200);
  const topBottom = S.surfaceY - S.topThk;           // 710
  const spec = { shape, w, d, surfaceY: S.surfaceY, topThk: S.topThk, topBottom, legs: [], beam: null, post: null, foot: null };

  if (shape === 'round') {
    const r = Math.min(w, d) / 2;
    spec.post = { r: Math.max(70, r * 0.16), y0: S.footH, y1: topBottom };
    spec.foot = { r: Math.max(220, r * 0.34), h: S.footH };
    return spec;
  }
  // 사각·보트형: T자 받침 2개(기둥 + 바닥 발) + 상판 아래 보강대 1개.
  const postD = Math.max(380, d * 0.36);
  const footD = Math.max(560, d * 0.58);
  for (const sx of [-w * 0.3, w * 0.3]) {
    spec.legs.push({
      dx: sx,
      post: { w: S.postW, d: postD, y0: S.footH, y1: topBottom },
      foot: { w: 170, d: footD, h: S.footH },
    });
  }
  spec.beam = { w: w * 0.6, h: S.beamH, d: S.beamD, y: topBottom - S.beamH / 2 };
  return spec;
}

/** 상황실 콘솔 — 이번 단계에서는 형상 변경 없음(기존 값 그대로). */
export function createControlConsole(w = 1800, d = 900) {
  const S = DIMS.controlConsole;
  const top = S.surfaceY - S.topThk;
  const my = S.surfaceY;
  const parts = [
    box('consoleTop', 0, top + S.topThk / 2, 0, w, S.topThk, d),
    box('consoleBase', 0, (20 + top) / 2, 0, w - 200, top - 20, d - 200),
  ];
  for (const sx of [-S.monW / 2 - 20, S.monW / 2 + 20]) {
    parts.push(box('monitorBase', sx, my + 60, 30, 120, 120, 180));
    parts.push(box('monitor', sx, my + 120 + S.monH / 2, 15, S.monW, S.monH, 50));
  }
  return parts;
}

/** 교탁 — 이번 단계에서는 형상 변경 없음(기존 값 그대로). */
export function createPodium() {
  const S = DIMS.podium;
  return [
    box('podium', 0, S.h / 2, 0, S.w, S.h, S.d),
    box('podiumTop', 0, S.h + 22.5, 0, S.w + 80, 45, S.d + 60),
  ];
}

// ── 카탈로그 ────────────────────────────────────────────────────────────────
// build(item) → 부품 목록(상자·기둥). spec(item) → Three.js가 따로 만들 구성 명세.
// sized: 물건마다 크기가 달라서 크기를 InstancedMesh 묶음 열쇠에 넣어야 하는 자산.
export const FURNITURE_ASSETS = Object.freeze({
  conferenceChair: { id: 'conferenceChair', label: '회의용 회전의자', instanced: true, sized: false, build: () => createConferenceChair() },
  auditoriumChair: { id: 'auditoriumChair', label: '강당 고정 객석', instanced: true, sized: false, build: () => createAuditoriumChair() },
  trainingChair: { id: 'trainingChair', label: '강의용 의자', instanced: true, sized: false, build: () => createTrainingChair() },
  trainingDesk: { id: 'trainingDesk', label: '강의용 책상', instanced: true, sized: true, build: it => createTrainingDesk(it.w, it.d) },
  controlConsole: { id: 'controlConsole', label: '상황실 콘솔', instanced: true, sized: true, build: it => createControlConsole(it.w, it.d) },
  podium: { id: 'podium', label: '교탁', instanced: true, sized: false, build: () => createPodium() },
  conferenceTable: { id: 'conferenceTable', label: '회의 테이블', instanced: false, sized: true, spec: it => createConferenceTable(it) },
});

/** V1에서 준비한 가구 자산 4종 — 보고·테스트용 목록. */
export const V1_ASSET_IDS = Object.freeze([
  'auditoriumChair', 'conferenceChair', 'conferenceTable', 'trainingDesk', 'trainingChair',
]);

/**
 * 배치 항목 → 자산 id.
 * item.asset이 있으면 그것을 우선한다(room-presets가 붙이는 힌트).
 * 없으면 item.type으로 정한다 — 기존 배치 결과를 그대로 쓸 수 있게 하기 위함이다.
 */
export function assetFor(item) {
  if (!item) return null;
  if (item.asset && FURNITURE_ASSETS[item.asset]) return item.asset;
  switch (item.type) {
    case 'seat': return 'auditoriumChair';
    case 'chair': return 'conferenceChair';
    case 'desk': return 'trainingDesk';
    case 'console': return 'controlConsole';
    case 'podium': return 'podium';
    case 'table': return 'conferenceTable';
    default: return null;
  }
}

/** 배치 항목 → 부품 목록(InstancedMesh로 묶을 것). 없으면 null. */
export function assetParts(item) {
  const a = FURNITURE_ASSETS[assetFor(item)];
  return a && a.instanced ? a.build(item) : null;
}

/**
 * InstancedMesh 묶음 열쇠 — 같은 열쇠끼리 한 덩어리로 그린다.
 * 크기가 물건마다 다른 자산(책상·콘솔)은 크기까지 열쇠에 넣어야 한다.
 */
export function assetKey(item) {
  const id = assetFor(item);
  const a = FURNITURE_ASSETS[id];
  if (!a || !a.instanced) return null;
  return a.sized ? `${id}:${Math.round(item.w || 0)}x${Math.round(item.d || 0)}` : id;
}
