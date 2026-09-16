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

import { FURNITURE_CONTRACTS } from './furniture-contracts.js?v=402';

// ── 색 ──────────────────────────────────────────────────────────────────────
// 전부 조연이라 채도를 낮춘다. 파랑/흰색 UI 디자인 시스템과 같은 계열.
export const FURNITURE_COLORS = Object.freeze({
  tableTop: '#ece6db', tableBase: '#a9b3c0', tableBeam: '#9ba6b4',
  chairSeat: '#cbdad7', chairBack: '#cbdad7', chairBase: '#aeb8c4', chairArm: '#9ea9b6',
  seatFabric: '#cbdad7', seatFrame: '#aeb8c4', seatArm: '#a3aebb',
  deskTop: '#efeae1', deskLeg: '#b3bcc8', deskPanel: '#e4e9ef', deskRail: '#a9b3c0',
  consoleTop: '#f3f6f9', consoleBase: '#9ba6b4', monitor: '#1b2532', monitorBase: '#8f99a7',
  podium: '#eef2f7', podiumTop: '#efeae1',
  credenzaBody: '#e7ecf2', credenzaDoor: '#dfe5ed', credenzaTop: '#ece6db', credenzaToe: '#b9c1cd',
  // 아이디에이션 공간 — 회의실보다 밝고 가볍게. 채도는 여전히 낮다.
  highTop: '#efe9df', highLeg: '#aeb8c4',
  stoolSeat: '#cfdcd8', stoolBase: '#a9b3c0',
  loungeSeat: '#d5dfe6', loungeBack: '#d5dfe6', loungeLeg: '#b3bcc8',
  collabTop: '#efe9df', collabLeg: '#aeb8c4',
  standBase: '#9ba6b4', standPole: '#aeb8c4', standPanel: '#1b2532',
  // 객석 착석 인원 — 실루엣만 읽히면 되므로 채도를 낮춘다(좌석·LED보다 튀면 안 된다).
  bodySkin: '#d9c3b0', bodyTop: '#8fa0b5', bodyLeg: '#5f6b7d',
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
  // 대기업 회의용 인체공학 의자(PHASE 2-a) — **치수의 기준은 계약이다.**
  //   여기서 다시 적지 않고 `FURNITURE_CONTRACTS.corporateChair.dimensions`를 그대로 읽는다.
  //   두 곳에 적으면 언젠가 어긋나고, 어느 쪽이 맞는지 알 수 없게 된다.
  corporateChair: FURNITURE_CONTRACTS.corporateChair.dimensions,
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
  // AV 수납장 — LED 벽 아래 낮은 수납장. 700 × 450mm(실제 AV 랙 수납장 치수).
  avCredenza: Object.freeze({ h: 700, d: 450, toeH: 80, topThk: 30, doorGap: 20 }),
  // 하이 테이블 — 서서 쓰는 협업 테이블. 상판 1,050mm(스툴 좌석 750에 맞춘 높이).
  highTable: Object.freeze({ surfaceY: 1050, topThk: 40, legW: 70, railY: 220 }),
  // 스툴 — 등받이 없는 하이 체어. 좌석 750mm.
  stool: Object.freeze({ seatTop: 750, seatThk: 60, seatR: 190, baseR: 175, columnR: 32, ringR: 165, ringY: 230 }),
  // 라운지 체어 — 낮고 푹신한 1인용. 좌석 400mm(회의 의자보다 낮다).
  loungeChair: Object.freeze({ seatTop: 400, seatThk: 140, seatW: 640, seatD: 620,
    backH: 420, backThk: 150, backTilt: 18, legH: 260, legW: 55 }),
  // 소형 협업 테이블 — 낮은 원형. 다리 3개(회의 테이블의 가운데 기둥과 다른 실루엣).
  collabTable: Object.freeze({ surfaceY: 700, topThk: 28, dia: 1100, legW: 60 }),
  // 이동식 디스플레이 스탠드 — 바퀴 달린 이동형 화면.
  mobileStand: Object.freeze({ baseW: 760, baseD: 560, baseH: 70, poleW: 110, panelY: 1280,
    panelW: 1150, panelH: 660, panelThk: 65 }),
  // 앉은 사람 — 축척 비교가 아니라 '객석이 찼을 때의 시야'를 보기 위한 것이라 아주 단순하게.
  //   좌판 윗면 기준 앉은키 약 880mm(머리 끝). 눈높이는 viewangle.js의 SEATED_EYE_MM(700)과 맞춘다.
  seatedPerson: Object.freeze({ hip: 60, torsoH: 500, torsoW: 360, torsoD: 240,
    shoulderW: 450, shoulderH: 110, neckR: 55, neckH: 70, headR: 100,
    thighL: 380, legW: 130 }),
  // 부속물
  plant: Object.freeze({ potR: 170, potH: 300, leafH: 520 }),
  rug: Object.freeze({ h: 14 }),
});

// 부품 만들기.
//   opts.r     모서리 반지름(mm). 주면 각진 상자가 아니라 **둥근 판**이 된다.
//   opts.mode  'plan' 눕힌 판(좌판·상판) / 'face' 세운 판(등받이·문)
//   opts.sag   0보다 크면 살짝 휜 판(등받이) — 가운데가 뒤로 물러난다
// 얇은 다리·프레임처럼 둥글려도 안 보이는 곳은 옵션 없이 두어 상자로 남긴다(가장 싸다).
const box = (kind, dx, y, dz, w, h, d, tiltX, opts) => {
  const p = { kind, shape: 'box', dx, y, dz, w, h, d };
  if (tiltX) p.tiltX = tiltX;
  if (opts) Object.assign(p, opts);
  return p;
};
const cyl = (kind, dx, y, dz, r, h) => ({ kind, shape: 'cyl', dx, y, dz, r, h });
// 5발 받침 — 허브·다리·바퀴를 **한 덩어리**로 굽는다(그리기 호출 11 → 1).
//   w/h/d 는 이 덩어리가 차지하는 공간(검사·배치용)이고, 나머지는 도형을 굽는 값이다.
const star = (kind, y, spec) => ({
  kind, shape: 'star', dx: 0, y, dz: 0,
  w: spec.reach * 2, d: spec.reach * 2, h: spec.casterH + spec.hubH,
  ...spec,
});
// 구 — 머리처럼 둥근 것에만 쓴다(저폴리 12×8 분할 하나를 공유한다).
const sph = (kind, dx, y, dz, r) => ({ kind, shape: 'sph', dx, y, dz, r });

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
    // 좌판: 실제 쿠션 두께 70mm. 모서리를 넉넉히 둥글려 쿠션처럼 보이게 한다.
    box('chairSeat', 0, seatBottom + S.seatThk / 2, 0, S.seatW, S.seatThk, S.seatD, 0,
      { r: 60, mode: 'plan' }),
    // 좌판과 등받이를 잇는 지지대 — 등받이가 허공에 뜨지 않게 한다.
    box('chairBase', 0, S.seatTop + 57, S.seatD / 2 - 45, 90, 115, 70),
    // 등받이: 12° 뒤로 젖히고 **몸을 감싸듯 45mm 휜다**. 평평한 판이면 칸막이로 보인다.
    box('chairBack', 0, S.backTopY - S.backH / 2, S.seatD / 2 - 35,
      S.seatW - 40, S.backH, S.backThk, S.backTilt, { sag: 45, r: 75 }),
    // 팔걸이 = 수직 지지대 + 수평 패드 (좌·우).
    box('chairArm', -armDx, (S.seatTop + S.armY) / 2 + 20, 60, 30, S.armY - S.seatTop - 40, 30),
    box('chairArm', armDx, (S.seatTop + S.armY) / 2 + 20, 60, 30, S.armY - S.seatTop - 40, 30),
    box('chairArm', -armDx, S.armY, -10, 55, 22, 250, 0, { r: 11, mode: 'plan' }),
    box('chairArm', armDx, S.armY, -10, 55, 22, 250, 0, { r: 11, mode: 'plan' }),
  ];
}

/**
 * 대기업 회의용 인체공학 의자 (PHASE 2-a).
 * ─────────────────────────────────────────────────────────────────────────
 * 기존 회의 의자(createConferenceChair)는 **그대로 둔다.** 이것은 별도 자산이다.
 *
 * 무엇이 다른가 — 멀리서도 '사무용 회전의자'로 읽히게 하는 세 가지다.
 *   ① **5발 캐스터 받침**  원판 하나가 아니라 바퀴 달린 다섯 발. 이것 하나로 실루엣이 갈린다.
 *   ② **휜 메시 등받이**   평평한 판이 아니라 위아래가 좁아지고 몸을 감싸듯 휜 면.
 *   ③ **등받이 지지 구조** 등받이가 좌판에 바로 붙지 않고 뒤쪽 지지대를 거쳐 올라간다.
 *
 * 촘촘한 그물을 폴리곤으로 짜지 않는다 — 멀리서 보이지도 않고 삼각형만 는다.
 *   실루엣과 어두운 메시 재질로 표현한다(오너 지침 §7).
 *
 * 치수는 전부 계약(FURNITURE_CONTRACTS.corporateChair)에서 온다.
 */
export function createCorporateChair() {
  const S = DIMS.corporateChair;
  const seatBottom = S.seatTop - 75;                 // 좌판 아랫면(좌판 두께 75)
  const baseR = S.casterBase / 2;                    // 받침 반지름 330

  // 5발 받침 — 다리는 낮고 길게. 굵으면 장난감처럼 보인다.
  const base = { legs: 5, reach: baseR, hubR: 62, hubH: 96, legW: 74, legH: 46, casterR: 30, casterH: 58 };
  const baseH = base.casterH + base.hubH;            // 154

  // 등받이 축 — 좌판 뒤에서 위로, 뒤로 14° 기울어 올라간다.
  //   부품은 제 중심에서 기울어지므로, 축 위 거리 L 에 맞춰 중심 좌표를 직접 계산한다.
  const tilt = 14, rad = tilt * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pivotY = S.seatTop + 28, pivotZ = S.seatD / 2 - 65;
  const onAxis = (L, push = 0) => ({          // push: 등받이 면에서 앞쪽으로 밀어내는 양
    y: pivotY + L * cos - push * sin,
    dz: pivotZ + L * sin - push * cos,
  });

  // 등받이 높이는 계약이 정한다 — 좌판 위 590mm(backAboveSeat)에서 꼭대기가 끝나도록 역산한다.
  //   폭은 좌판(500)보다 **좁게** 잡는다 — 메시 등받이는 원래 좌판보다 좁다.
  const frameH = 584, meshH = 524, backW = 440;
  const f = onAxis(frameH / 2 - 10);                 // 등받이 테두리 중심
  const m = onAxis(frameH / 2 - 10, 8);              // 메시는 테두리보다 앞으로 8mm(앞면이 맞닿게)
  const rail = onAxis(frameH - 58, -2);              // 어깨 가로대 — 테두리 안쪽에 들어앉는다
  const armDx = 295;

  return [
    // ① 5발 캐스터 받침 — 조각 11개를 한 덩어리로(그리기 호출 1개).
    star('chairCaster', baseH / 2, base),
    // ② 가스 실린더. 가늘게 — 굵으면 사무 의자로 안 보인다.
    cyl('chairColumn', 0, (baseH + seatBottom) / 2, 0, 38, seatBottom - baseH),
    // ③ 좌판 아래 기구부(틸트 메커니즘). 좌판이 기둥에 바로 꽂힌 것처럼 보이지 않게 한다.
    box('chairFrame', 0, seatBottom - 32, 10, 210, 64, 250, 0, { r: 26, mode: 'plan' }),
    // ④ 좌판 — 모서리를 넉넉히 둥글려 앞쪽 끝이 부드럽게 말린 인체공학 좌판처럼.
    box('chairCushion', 0, seatBottom + 75 / 2, 0, S.seatW, 75, S.seatD, 0, { r: 95, mode: 'plan' }),
    // ⑤ 등받이 지지대 — 좌판 뒤에서 등받이로 이어지는 브래킷. 이것이 없으면 등받이가 허공에 뜬다.
    //    **좌판 뒤쪽 가장자리에 붙여 등받이에 가려지게 둔다** — 앞으로 나오면 좌판에 얹힌
    //    쿠션 덩어리처럼 보인다.
    box('chairFrame', 0, S.seatTop + 6, S.seatD / 2 - 18, 168, 128, 62, tilt, { r: 30, mode: 'face' }),
    // ⑥ 등받이 테두리 — 메시를 감싸는 프레임. 메시보다 조금 크고 두껍다.
    //    **r(모서리 둥글림)은 두께보다 작게 잡는다.** 휜 판의 둥글림은 가장자리를
    //    사방으로 밀어내므로, 두께보다 크면 판이 부풀어 쿠션 덩어리처럼 보인다.
    box('chairFrame', 0, f.y, f.dz, backW + 50, frameH, 34, tilt, { sag: 70, r: 10 }),
    // ⑦ 메시 등받이 — 테두리 안쪽. 휘어 있고 테두리보다 얇고 좁다.
    box('chairMesh', 0, m.y, m.dz, backW, meshH, 18, tilt, { sag: 70, r: 8 }),
    // ⑧ 어깨 가로대 — 등받이 꼭대기를 가로지르는 프레임. 테두리보다 **좁아서**
    //    위로 갈수록 좁아지는 인체공학 실루엣을 만든다(네모난 판으로 읽히지 않게).
    box('chairFrame', 0, rail.y, rail.dz, backW - 60, 74, 40, tilt, { sag: 70, r: 12 }),
    // ⑨⑩ 팔걸이 기둥 — 가늘게. 굵으면 임원 의자처럼 보인다.
    //    28mm 기둥은 둥글려도 화면에서 보이지 않는다 — 상자로 둬 삼각형을 아낀다.
    box('chairFrame', -armDx, S.seatTop + 108, 55, 28, 200, 62),
    box('chairFrame', armDx, S.seatTop + 108, 55, 28, 200, 62),
    // ⑪⑫ 팔걸이 패드 — 얇고 길게.
    box('chairArmPad', -armDx, S.seatTop + 210, -15, 62, 26, 250, 0, { r: 13, mode: 'plan' }),
    box('chairArmPad', armDx, S.seatTop + 210, -15, 62, 26, 250, 0, { r: 13, mode: 'plan' }),
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
    box('seatFabric', 0, seatBottom + S.seatThk / 2, 0, S.seatW, S.seatThk, S.seatD, 0,
      { r: 55, mode: 'plan' }),
    // 좌판 뒤 연결부 — 등받이 아래를 막아 극장 의자처럼 닫힌 형태로 읽히게 한다.
    box('seatFrame', 0, S.seatTop + 45, S.seatD / 2 - 30, S.seatW - 80, 90, 60),
    box('seatFabric', 0, S.backTopY - S.backH / 2, S.seatD / 2 - 25,
      S.seatW - 30, S.backH, S.backThk, S.backTilt, { sag: 42, r: 80 }),
    // 옆 팔걸이 판 — 줄줄이 늘어설 때 좌석 경계를 만들어 준다.
    box('seatArm', -armDx, S.armY, 20, 45, 110, 400, 0, { r: 22, mode: 'plan' }),
    box('seatArm', armDx, S.armY, 20, 45, 110, 400, 0, { r: 22, mode: 'plan' }),
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
  parts.push(box('chairSeat', 0, seatBottom + S.seatThk / 2, 0, S.seatW, S.seatThk, S.seatD, 0,
    { r: 45, mode: 'plan' }));
  // 등받이 지지 기둥 2개 — 좌판 뒤에서 위로 뻗는다.
  for (const sx of [-150, 150]) {
    parts.push(box('seatFrame', sx, S.seatTop + 65, S.seatD / 2 - 40, 40, 130, 40));
  }
  parts.push(box('chairBack', 0, S.backTopY - S.backH / 2, S.seatD / 2 - 25,
    S.seatW - 40, S.backH, S.backThk, S.backTilt, { sag: 32, r: 60 }));
  return parts;
}

/** 강의용 책상 — 얇은 상판 + 각관 다리 4 + 옆 보강대 2 + 앞 가림판. */
export function createTrainingDesk(w = 1400, d = 600) {
  const S = DIMS.trainingDesk;
  const top = S.surfaceY - S.topThk;                 // 상판 아랫면
  const lx = w / 2 - 90, lz = d / 2 - 80;
  const parts = [box('deskTop', 0, top + S.topThk / 2, 0, w, S.topThk, d, 0, { r: 18, mode: 'plan' })];
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
    w - 200, S.panelH, S.panelThk, 0, { r: 12, mode: 'face' }));
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

/**
 * AV 수납장 — 굽(토킥) + 몸통 + 상판 + 여닫이문 2짝. 아주 단순한 형태로 만든다.
 * 장식용 가구가 아니라 공간 현실감을 위한 보조 요소라 여기서 더 꾸미지 않는다.
 */
export function createAvCredenza(w = 1800, d = 450) {
  const S = DIMS.avCredenza;
  const bodyH = S.h - S.toeH - S.topThk;        // 590
  const bodyY = S.toeH + bodyH / 2;
  const doorW = (w - 40 - S.doorGap) / 2;       // 양쪽 20mm씩 들어간 문 2짝
  return [
    // 굽 — 안쪽으로 들여 그림자를 만든다(바닥에 딱 붙은 상자로 보이지 않게).
    box('credenzaToe', 0, S.toeH / 2, 0, w - 120, S.toeH, d - 80),
    box('credenzaBody', 0, bodyY, 0, w, bodyH, d, 0, { r: 14, mode: 'face' }),
    // 문 2짝 — 몸통보다 12mm 앞으로(LED 벽 반대쪽 = -Z가 방 안쪽이다).
    box('credenzaDoor', -(doorW + S.doorGap) / 2, bodyY, -d / 2 - 6, doorW, bodyH - 30, 12, 0, { r: 9, mode: 'face' }),
    box('credenzaDoor', (doorW + S.doorGap) / 2, bodyY, -d / 2 - 6, doorW, bodyH - 30, 12, 0, { r: 9, mode: 'face' }),
    // 상판 — 테이블과 같은 옅은 오크. 사방으로 살짝 내민다.
    box('credenzaTop', 0, S.h - S.topThk / 2, 0, w + 30, S.topThk, d + 20, 0, { r: 12, mode: 'plan' }),
  ];
}

/** 하이 테이블 — 상판 + 얇은 다리 4 + 발 거는 가로대 2. 서서 쓰는 높이. */
export function createHighTable(w = 1800, d = 900) {
  const S = DIMS.highTable;
  const top = S.surfaceY - S.topThk;
  const lx = w / 2 - 110, lz = d / 2 - 110;
  const parts = [box('highTop', 0, top + S.topThk / 2, 0, w, S.topThk, d, 0, { r: 45, mode: 'plan' })];
  for (const sx of [-lx, lx]) {
    for (const sz of [-lz, lz]) parts.push(box('highLeg', sx, top / 2, sz, S.legW, top, S.legW));
    parts.push(box('highLeg', sx, S.railY, 0, S.legW * 0.6, S.legW * 0.6, lz * 2));
  }
  return parts;
}

/** 스툴 — 원형 좌판 + 가는 기둥 + 납작한 받침 + 발 거는 링. 등받이는 없다. */
export function createStool() {
  const S = DIMS.stool;
  const seatBottom = S.seatTop - S.seatThk;
  return [
    cyl('stoolBase', 0, 12, 0, S.baseR, 24),
    cyl('stoolBase', 0, (24 + seatBottom) / 2, 0, S.columnR, seatBottom - 24),
    // 발 거는 링은 얇은 원판으로 대신한다(도넛을 만들면 폴리곤만 는다).
    cyl('stoolBase', 0, S.ringY, 0, S.ringR, 26),
    cyl('stoolSeat', 0, seatBottom + S.seatThk / 2, 0, S.seatR, S.seatThk),
  ];
}

/** 라운지 체어 — 낮고 두툼한 1인용. 회의 의자보다 낮고 넓어 실루엣이 확실히 다르다. */
export function createLoungeChair() {
  const S = DIMS.loungeChair;
  const seatBottom = S.seatTop - S.seatThk;
  const lx = S.seatW / 2 - 70, lz = S.seatD / 2 - 70;
  const parts = [];
  for (const sx of [-lx, lx]) {
    for (const sz of [-lz, lz]) parts.push(box('loungeLeg', sx, seatBottom / 2, sz, S.legW, seatBottom, S.legW));
  }
  parts.push(box('loungeSeat', 0, seatBottom + S.seatThk / 2, 0, S.seatW, S.seatThk, S.seatD, 0,
    { r: 80, mode: 'plan' }));
  parts.push(box('loungeBack', 0, S.seatTop + S.backH / 2, S.seatD / 2 - S.backThk / 2,
    S.seatW, S.backH, S.backThk, S.backTilt, { sag: 70, r: 95 }));
  return parts;
}

/** 소형 협업 테이블 — 낮은 원형 상판 + 다리 3개(삼각 배치). */
export function createCollabTable(dia = 0) {
  const S = DIMS.collabTable;
  const r = (dia || S.dia) / 2;
  const top = S.surfaceY - S.topThk;
  const parts = [cyl('collabTop', 0, top + S.topThk / 2, 0, r, S.topThk)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(box('collabLeg', Math.sin(a) * r * 0.62, top / 2, Math.cos(a) * r * 0.62,
      S.legW, top, S.legW));
  }
  return parts;
}

/** 이동식 디스플레이 스탠드 — 받침 + 기둥 + 화면. 아주 단순하게. */
export function createMobileStand() {
  const S = DIMS.mobileStand;
  return [
    box('standBase', 0, S.baseH / 2, 0, S.baseW, S.baseH, S.baseD),
    box('standPole', 0, S.panelY / 2, 0, S.poleW, S.panelY, S.poleW),
    box('standPanel', 0, S.panelY + S.panelH / 2 - 120, -40, S.panelW, S.panelH, S.panelThk),
  ];
}

/**
 * 앉은 사람 — 허벅지 + 몸통 + 머리 + 정강이. 4~5부품짜리 실루엣이다.
 * 좌석 위(좌판 윗면 = seatTop)에 얹히므로 좌판 높이를 받는다.
 */
export function createSeatedPerson(seatTop = 440) {
  const S = DIMS.seatedPerson;
  const base = seatTop + S.hip;                  // 엉덩이 윗면
  const torsoTop = base + S.torsoH;
  return [
    // 허벅지 — 앞(-Z)으로 뻗는다. 좌석은 rotY=0일 때 -Z(LED)를 바라본다.
    box('bodyLeg', 0, base - 40, -S.thighL / 2 + 60, S.torsoW - 40, 150, S.thighL),
    // 정강이 — 무릎에서 바닥까지. 발이 바닥에 닿아야 떠 보이지 않는다.
    box('bodyLeg', 0, (seatTop + 40) / 2, -S.thighL + 80, S.legW * 2.1, seatTop + 40, S.legW),
    // 몸통 — 등받이에 기대 살짝 젖혀 앉는다.
    box('bodyTop', 0, base + S.torsoH / 2, 40, S.torsoW, S.torsoH, S.torsoD, 8,
      { r: 90, mode: 'face' }),
    // 어깨 — 몸통보다 넓고 납작하게. 이것이 있어야 '통'이 아니라 사람으로 읽힌다.
    box('bodyTop', 0, torsoTop - S.shoulderH / 2 + 20, 55, S.shoulderW, S.shoulderH, S.torsoD - 20, 8,
      { r: 52, mode: 'face' }),
    // 목
    cyl('bodySkin', 0, torsoTop + S.neckH / 2, 70, S.neckR, S.neckH),
    // 머리 — 구. 원기둥으로 만들면 드럼통처럼 보인다.
    sph('bodySkin', 0, torsoTop + S.neckH + S.headR * 0.92, 78, S.headR),
  ];
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
  // PHASE 2-a — 계약만 있던 자산 중 **처음으로 실제 도형이 생긴 것**.
  //   이 한 줄이 등록되는 순간 `hasRuntimeFurnitureAsset('corporateChair')`가 true가 되고,
  //   라우터(furniture-routing.js)는 **고치지 않아도** 이것을 고르기 시작한다.
  corporateChair: { id: 'corporateChair', label: '대기업 회의용 인체공학 의자', instanced: true, sized: false, build: () => createCorporateChair() },
  auditoriumChair: { id: 'auditoriumChair', label: '강당 고정 객석', instanced: true, sized: false, build: () => createAuditoriumChair() },
  trainingChair: { id: 'trainingChair', label: '강의용 의자', instanced: true, sized: false, build: () => createTrainingChair() },
  trainingDesk: { id: 'trainingDesk', label: '강의용 책상', instanced: true, sized: true, build: it => createTrainingDesk(it.w, it.d) },
  controlConsole: { id: 'controlConsole', label: '상황실 콘솔', instanced: true, sized: true, build: it => createControlConsole(it.w, it.d) },
  podium: { id: 'podium', label: '교탁', instanced: true, sized: false, build: () => createPodium() },
  avCredenza: { id: 'avCredenza', label: 'AV 수납장', instanced: true, sized: true, build: it => createAvCredenza(it.w, it.d) },
  highTable: { id: 'highTable', label: '하이 테이블', instanced: true, sized: true, build: it => createHighTable(it.w, it.d) },
  stool: { id: 'stool', label: '스툴', instanced: true, sized: false, build: () => createStool() },
  loungeChair: { id: 'loungeChair', label: '라운지 체어', instanced: true, sized: false, build: () => createLoungeChair() },
  collabTable: { id: 'collabTable', label: '협업 테이블', instanced: true, sized: true, build: it => createCollabTable(it.w) },
  seatedPerson: { id: 'seatedPerson', label: '착석 인원', instanced: true, sized: false, build: () => createSeatedPerson(DIMS.auditoriumChair.seatTop) },
  mobileStand: { id: 'mobileStand', label: '이동식 디스플레이', instanced: true, sized: false, build: () => createMobileStand() },
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
    case 'credenza': return 'avCredenza';
    case 'highTable': return 'highTable';
    case 'stool': return 'stool';
    case 'lounge': return 'loungeChair';
    case 'collabTable': return 'collabTable';
    case 'mobileStand': return 'mobileStand';
    case 'seated': return 'seatedPerson';
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
  const base = a.sized ? `${id}:${Math.round(item.w || 0)}x${Math.round(item.d || 0)}` : id;
  // 시야각 등급이 붙어 있으면 등급별로 나눈다 — 색이 다르면 같은 덩어리로 못 그리기 때문이다.
  return item.grade ? `${base}#${item.grade}` : base;
}
