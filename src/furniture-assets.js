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

import { FURNITURE_CONTRACTS } from './furniture-contracts.js?v=453';
import { personalMonitorSize, prompterSize, PROMPTER_FLOOR_RISE } from './conference-av.js?v=453';
import { consoleMonitorSize, keyboardSize, consoleSag, CONSOLE_MIN_BAND_DEPTH } from './control-av.js?v=453';

// ── 색 ──────────────────────────────────────────────────────────────────────
// 전부 조연이라 채도를 낮춘다. 파랑/흰색 UI 디자인 시스템과 같은 계열.
export const FURNITURE_COLORS = Object.freeze({
  tableTop: '#ece6db', tableBase: '#a9b3c0', tableBeam: '#9ba6b4',
  chairSeat: '#cbdad7', chairBack: '#cbdad7', chairBase: '#aeb8c4', chairArm: '#9ea9b6',
  seatFabric: '#cbdad7', seatFrame: '#aeb8c4', seatArm: '#a3aebb',
  deskTop: '#efeae1', deskLeg: '#b3bcc8', deskPanel: '#e4e9ef', deskRail: '#a9b3c0',
  consoleTop: '#f3f6f9', consoleBase: '#9ba6b4', monitor: '#1b2532', monitorBase: '#8f99a7',
  // PHASE 4-c — 개인 모니터·프롬프터의 **꺼진 화면**. 밝게 빛나면 LED가 주인공 자리를 잃는다.
  screen: '#151d28',
  podium: '#eef2f7', podiumTop: '#efeae1',
  credenzaBody: '#e7ecf2', credenzaDoor: '#dfe5ed', credenzaTop: '#ece6db', credenzaToe: '#b9c1cd',
  // 아이디에이션 공간 — 회의실보다 밝고 가볍게. 채도는 여전히 낮다.
  // 상판 두 값은 PHASE 8-2a 에서 #efe9df 에서 내렸다. 조명을 고친 뒤에도 하이 테이블 상판이
  //   좁은 방 코너 시점에서 72%, 협업 상판이 평면 시점에서 98% 잘렸다 — 조명이 아니라
  //   **재질 자체가 밝아서** 생긴 문제라 색만 한 단 낮춘다(측정: 최대 98.33% → 3.33%).
  //   더 어둡게 해도 남는 3.33%는 줄지 않는다(평면 시점 협업 상판의 반사) — 여기가 최소값이다.
  //   이 두 값은 아이디에이션 전용이다(`createHighTable`·`createCollabTable` 만 읽고,
  //   그 자산은 `layoutIdeation` 만 세운다). 다른 방의 상판은 한 값도 건드리지 않는다.
  highTop: '#ded9cf', highLeg: '#aeb8c4',
  stoolSeat: '#cfdcd8', stoolBase: '#a9b3c0',
  loungeSeat: '#d5dfe6', loungeBack: '#d5dfe6', loungeLeg: '#b3bcc8',
  collabTop: '#ded9cf', collabLeg: '#aeb8c4',
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
  // 임원 회의용 하이백 의자(PHASE 3-a) — 여기서도 **치수의 기준은 계약**이다.
  executiveChair: FURNITURE_CONTRACTS.executiveChair.dimensions,
  // 대회의실용 인체공학 의자(PHASE 4-a) — 여기서도 **치수의 기준은 계약**이다.
  conferenceErgoChair: FURNITURE_CONTRACTS.conferenceErgoChair.dimensions,
  // 상황실 운용자 의자(PHASE 5-a) — 여기서도 **치수의 기준은 계약**이다.
  taskChair: FURNITURE_CONTRACTS.taskChair.dimensions,
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
  // 상황실 곡선 콘솔(PHASE 5-b) — **치수의 기준은 계약**이다. 여기서 다시 적지 않는다.
  curvedConsole: FURNITURE_CONTRACTS.curvedConsole.dimensions,
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
// 위로 갈수록 좁아지는 휜 판 — 하이백 등받이 전용(PHASE 3-a).
//   `box`+`sag`(휜 판)는 높이 어디서나 폭이 같다. 이것은 아래 폭에서 위 폭까지 **연속으로** 줄어든다.
const taper = (kind, dx, y, dz, wBottom, wTop, h, thk, tiltX, sag) => {
  const p = { kind, shape: 'taper', dx, y, dz, wBottom, wTop, h, thk, sag,
    w: Math.max(wBottom, wTop), d: thk + sag };   // w/d 는 차지하는 공간(검사·배치용)
  if (tiltX) p.tiltX = tiltX;
  return p;
};
// 휜 평면의 판 — 곡선 콘솔 상판(PHASE 5-b). `sag`는 **평면에서** 가운데가 물러나는 깊이다
//   (등받이의 `sag`는 세운 판이 휘는 양이라 방향이 다르다 — 그래서 shape 이름을 따로 둔다).
const curvedTop = (kind, y, w, h, d, sag) => ({ kind, shape: 'curvedTop', dx: 0, y, dz: 0, w, h, d, sag });
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

/**
 * 임원 회의용 하이백 의자(PHASE 3-a) — 회의용 의자와 **실루엣으로** 갈린다.
 *
 * 무엇이 다른가. 크기만 키운 것이 아니다.
 *   ① **등받이가 연속으로 좁아진다.** 회의용 의자는 폭이 일정한 판 위에 좁은 가로대를 얹어
 *      '위가 좁아 보이게' 했다 — 가까이서 보면 단이 진다(PHASE 2-a의 알려진 문제).
 *      여기서는 허리에서 어깨까지 **한 덩어리로** 줄어드는 껍데기를 쓴다(`taper`).
 *   ② **헤드레스트가 있다.** 좌판 위 780mm까지 올라가는 하이백의 마지막 마디다.
 *      등받이 어깨선보다 좁고 얇게 — 게이밍 체어의 베개나 자동차 헤드레스트가 되면 안 된다.
 *   ③ 좌판이 조금 넓고(530×500), 받침이 조금 크다(700). 다만 **가죽 임원 의자로 가지 않는다** —
 *      두툼한 쿠션·묵직한 팔걸이는 오래된 중역실 언어다. 목표는 '밝고 절제된 현대 임원실'이다.
 *
 * 치수는 전부 계약(FURNITURE_CONTRACTS.executiveChair.dimensions)에서 읽는다.
 */
export function createExecutiveChair() {
  const S = DIMS.executiveChair;
  const seatThk = 80;                                 // 회의용(75)보다 아주 조금만 — 소파가 되면 안 된다
  const seatBottom = S.seatTop - seatThk;             // 380
  const baseR = S.casterBase / 2;                     // 350

  // 5발 받침 — 회의용과 같은 방식을 그대로 쓰되(§13 재사용 허용) 계약의 700mm에 맞춘다.
  const base = { legs: 5, reach: baseR, hubR: 66, hubH: 100, legW: 78, legH: 48, casterR: 32, casterH: 60 };
  const baseH = base.casterH + base.hubH;             // 160

  // 등받이 축 — 좌판 뒤에서 위로, 뒤로 13° 기울어 올라간다.
  //   기울기는 **깊이 계약(720mm)이 정한다.** 더 젖히면 하이백 꼭대기가 뒤로 많이 나가
  //   의자가 계약 발자국을 벗어난다(15°로 잡았더니 깊이가 757mm로 넘쳤다).
  const tilt = 13, rad = tilt * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pivotY = S.seatTop + 30, pivotZ = S.seatD / 2 - 85;
  const onAxis = (L, push = 0) => ({
    y: pivotY + L * cos - push * sin,
    dz: pivotZ + L * sin - push * cos,
  });

  // 꼭대기는 계약이 정한다 — 좌판 위 780mm(backAboveSeat)에서 **실제로** 끝나야 한다.
  //   기울어진 상자는 모서리가 중심보다 높으므로, 그 모서리까지 계산에 넣어 축 길이를 역산한다.
  //   (넣지 않으면 계약보다 6~7mm 높게 끝난다 — 계약은 '대략'이 아니다.)
  const headH = S.headrestH;                          // 190
  // 두께는 **휨(sag)과 모서리 둥글림까지 합친 값이 실제 두께**다.
  //   처음에 thk 62 · sag 54 · r 14 로 두었더니 화면에서 151mm로 부풀어 베개가 됐다
  //   (휜 판의 둥글림은 도형을 사방으로 밀어낸다 — PHASE 2-a에서 등받이로 한 번 겪은 함정).
  //   42 + 22 + 둥글림 ≈ 85mm. 실제 헤드레스트 두께와 같은 범위다.
  const headThk = 42, headSag = 22, headPush = 4;
  const headL = (S.seatTop + S.backAboveSeat - pivotY + headPush * sin
    - (headH * cos + headThk * sin) / 2) / cos;
  const gap = 34;                                     // 등받이와 헤드레스트 사이 목 트임
  const backH = headL - headH / 2 - gap;              // 등받이 높이(축 위)
  const backL = backH / 2;                            // 등받이 중심

  // 폭 — 허리에서 어깨로 갈수록 좁아진다. 좌판(530)보다 좁게 시작한다.
  // 좁아지는 정도 — 470 → 340(0.72). 0.79로 두었더니 등받이 아래의 브래킷(178)에서
  //   등받이(470)로 벌어지는 변화가 훨씬 커서 **좁아지는 것이 눈에 띄지 않았다.**
  const backWBottom = 470, backWTop = 340;
  const meshInset = 46;                               // 메시는 테두리보다 이만큼 좁다
  const armDx = S.overallW / 2 - 35;                  // 팔걸이 기둥 중심(폭 계약 안에 들어오게)

  const b = onAxis(backL);
  const mesh = onAxis(backL, 9);                      // 메시는 테두리보다 9mm 앞
  const head = onAxis(headL, headPush);

  return [
    // ① 5발 캐스터 받침 — 조각 11개를 한 덩어리로(그리기 호출 1개).
    star('chairCaster', baseH / 2, base),
    // ② 가스 실린더.
    cyl('chairColumn', 0, (baseH + seatBottom) / 2, 0, 40, seatBottom - baseH),
    // ③ 좌판 아래 기구부.
    box('chairFrame', 0, seatBottom - 34, 10, 230, 68, 270, 0, { r: 28, mode: 'plan' }),
    // ④ 좌판 — 회의용보다 넓지만 두께는 거의 그대로. 앞쪽 끝이 부드럽게 말린 인체공학 좌판.
    box('chairCushion', 0, seatBottom + seatThk / 2, 0, S.seatW, seatThk, S.seatD, 0, { r: 100, mode: 'plan' }),
    // ⑤ 등받이 지지 브래킷 — 좌판 뒤에 붙여 등받이에 가려지게 둔다.
    box('chairFrame', 0, S.seatTop + 8, S.seatD / 2 - 20, 178, 136, 66, tilt, { r: 32, mode: 'face' }),
    // ⑥ 등받이 테두리 — **위로 갈수록 좁아진다.** 이 한 덩어리가 회의용 의자와 가장 크게 갈리는 곳이다.
    taper('chairFrame', 0, b.y, b.dz, backWBottom, backWTop, backH, 36, tilt, 72),
    // ⑦ 메시 등받이 — 테두리 안쪽에서 같은 비율로 좁아진다.
    taper('chairMesh', 0, mesh.y, mesh.dz,
      backWBottom - meshInset, backWTop - meshInset, backH - 44, 18, tilt, 72),
    // ⑧ 헤드레스트 — 어깨선보다 **좁고 얇게**. 살짝 휘어 목을 받친다.
    //    베개처럼 두꺼워지면 게이밍 체어가 된다(오너 지침 §11).
    box('chairHeadrest', 0, head.y, head.dz, backWTop - 58, headH, headThk, tilt, { sag: headSag, r: 10 }),
    // ⑨⑩ 팔걸이 기둥 — 가늘게. 임원 의자라고 굵어지면 안 된다.
    box('chairFrame', -armDx, S.seatTop + 116, 58, 30, 216, 66),
    box('chairFrame', armDx, S.seatTop + 116, 58, 30, 216, 66),
    // ⑪⑫ 팔걸이 패드 — 얇고 길게.
    box('chairArmPad', -armDx, S.seatTop + 226, -16, 66, 28, 264, 0, { r: 14, mode: 'plan' }),
    box('chairArmPad', armDx, S.seatTop + 226, -16, 66, 28, 264, 0, { r: 14, mode: 'plan' }),
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
 * 대기업 회의 테이블 (PHASE 2-b).
 * ─────────────────────────────────────────────────────────────────────────
 * 기존 회의 테이블(createConferenceTable)은 **그대로 둔다.** 별도 자산이다.
 *
 * 중역 테이블이 아니다 — 두껍고 무거운 일체형 몸통을 만들지 않는다.
 *   얇은 상판(25mm) + 날씬한 T형 받침 + 거의 안 보이는 보강대.
 *
 * **다리 위치가 이 자산의 숨은 핵심이다.**
 *   회의실 좌석은 테이블 중심에서 **700mm 간격**으로 놓인다(FURNITURE.chairPitch).
 *   받침을 700의 배수 자리에 두면 앉은 사람 무릎이 정확히 기둥에 부딪힌다.
 *   그래서 받침은 언제나 **350의 홀수 배수**(350·1050·1750…) — 좌석과 좌석 **사이**다.
 *   같은 이유로 받침 수는 짝수만 쓴다(홀수면 한 개가 정중앙 = 좌석 자리에 온다).
 *
 * 치수는 전부 계약(FURNITURE_CONTRACTS.corporateTable)에서 온다.
 * 실제 가로·세로는 **배치 계산이 준 값**을 쓴다 — 여기서 방 크기를 다시 재지 않는다.
 */
// 보트형 상판이 가운데에서 넓어지는 비율(깊이 대비, 편측).
//   절제된 기업 회의 테이블의 기준선이다 — 올리면 타원 식탁, 내리면 사각형으로 읽힌다.
export const BOAT_BULGE_RATIO = 0.08;

const SUPPORT_HALF_PITCH = 350;   // 좌석 간격 700의 절반

// 목표 위치에 가장 가까운 '350의 홀수 배수'. 상판 밖으로 나가지 않게 줄여 가며 맞춘다.
function oddSupportX(target, maxAbs) {
  let k = Math.max(1, Math.round((target / SUPPORT_HALF_PITCH - 1) / 2) * 2 + 1);
  while (k > 1 && k * SUPPORT_HALF_PITCH > maxAbs) k -= 2;
  return k * SUPPORT_HALF_PITCH;
}

/** 상판 폭 → 받침 x 위치들. 긴 테이블은 4개, 그 외는 2개(언제나 짝수·좌우 대칭). */
export function corporateSupportXs(w) {
  const maxAbs = Math.max(SUPPORT_HALF_PITCH, w / 2 - 200);   // 끝에서 최소 200mm 안쪽
  if (w > 4200) {
    const outer = oddSupportX(w * 0.36, maxAbs);
    let inner = oddSupportX(w * 0.12, maxAbs);
    if (inner >= outer) inner = Math.max(SUPPORT_HALF_PITCH, outer - SUPPORT_HALF_PITCH * 2);
    return [-outer, -inner, inner, outer];
  }
  const x = oddSupportX(w * 0.28, maxAbs);
  return [-x, x];
}

/**
 * 구성 명세를 돌려준다(도형은 furniture-gl이 만든다 — 보트형 상판이 상자가 아니기 때문).
 * @param item 배치 계산이 준 항목 { shape, w, d }
 */
/**
 * 이 배치 항목이 **대기업 테이블이 맡을 수 있는 것인가.**
 *   모양: 사각·보트만(원형·U자 등은 이 자산의 몫이 아니다).
 *   크기: 계약이 정한 최소 치수 이상. 그보다 작은 조각(U자형의 옆날개 등)은 맡지 않는다 —
 *     **작다고 키우면 배치가 바뀐다.** 배치는 이 단계에서 절대 건드리지 않기로 한 것이다.
 */
export function fitsCorporateTable(item = {}) {
  const C = FURNITURE_CONTRACTS.corporateTable.dimensions;
  if (item.shape && item.shape !== 'rect' && item.shape !== 'boat') return false;
  return Math.round(item.w || 0) >= C.minWidth && Math.round(item.d || 0) >= C.minDepth;
}

export function createCorporateTable(item = {}) {
  const C = FURNITURE_CONTRACTS.corporateTable.dimensions;
  // 계약이 다루는 모양은 사각·보트 둘뿐이다. 그 밖(원형 등)은 이 자산의 몫이 아니다.
  const shape = item.shape === 'boat' ? 'boat' : 'rect';
  // **배치가 준 값을 그대로 쓴다.** 최소 치수는 값이 아예 없을 때의 기본값일 뿐,
  //   배치가 준 크기를 키우는 데 쓰지 않는다(키우면 테이블이 배치 밖으로 삐져나간다).
  const w = Math.round(item.w) || C.minWidth;
  const d = Math.round(item.d) || C.minDepth;
  const topBottom = C.surfaceY - C.topThk;

  // T형 받침 — 바닥 발(가로로 눕힌 판) + 가는 기둥. 식탁 다리 넷과 확실히 다른 실루엣이다.
  const footH = 28;
  const supports = corporateSupportXs(w).map(dx => ({
    dx,
    post: { w: 90, d: Math.max(320, Math.round(d * 0.30)), y0: footH, y1: topBottom - 30 },
    foot: { w: 120, d: Math.max(500, Math.round(d * 0.52)), h: footH },
  }));
  // 보강대 — 받침 사이를 잇는다. 상판이 공중에 뜬 느낌만 없애면 되므로 아주 얇게.
  const span = Math.max(...supports.map(s => s.dx)) * 2;
  return {
    shape, w, d,
    surfaceY: C.surfaceY, topThk: C.topThk, topBottom,
    topRadius: 26,                                   // 상판 모서리 — 아주 약하게만
    // 보트형: **가운데만** 깊이의 8%만큼 넓어진다(양 끝 폭은 그대로 — 끝을 좁히지 않는다).
    //   6%는 멀리서 보면 사각형과 구분이 안 됐고, 기존 회의 테이블의 16%는 타원 식탁처럼 읽혔다.
    bulge: shape === 'boat' ? Math.round(d * BOAT_BULGE_RATIO) : 0,
    supports,
    beam: span > 0 ? { w: span, h: 48, d: 70, y: topBottom - 54 } : null,
  };
}

/**
 * 대회의실용 인체공학 의자 (PHASE 4-a).
 * ─────────────────────────────────────────────────────────────────────────
 * **셋 중 가장 가볍고 낮은 의자다.** 앞의 두 의자와 크기만 다른 것이 아니라
 *   등받이를 **만드는 방식**이 다르다 — 그래야 멀리서도 다른 의자로 읽힌다(오너 지침 §4).
 *
 *   대기업(2-a) 두꺼운 테두리 판 + 메시 + 어깨 가로대 = 판 세 장이 겹쳐 올라간다.
 *   임원(3-a)   위로 갈수록 좁아지는 한 덩어리 껍데기 + 헤드레스트.
 *   대회의(여기) **뒤판이 없다.** 가는 세로 레일 두 개가 메시를 양쪽에서 잡고,
 *               허리 높이에 가로대 하나가 지나간다. 뒤가 비어 있어 시각적으로 가볍다.
 *
 * 왜 그렇게 만드는가 — 대회의실은 **좌석이 20석 넘게 한 화면에 들어온다.**
 *   의자 하나가 조금만 무거워도 화면이 검은 덩어리로 뭉친다(오너 지침 §7·§18).
 *   그래서 헤드레스트도, 어깨 가로대도, 두꺼운 뒤판도 두지 않는다.
 *
 * 치수는 전부 계약(FURNITURE_CONTRACTS.conferenceErgoChair)에서 온다.
 */
// 팔걸이·받침이 계약 폭(650) 안에 들어오도록 빼 두는 여유(mm).
//   둥글림(bevel)이 도형을 사방으로 밀어내기 때문에, 선언 치수 그대로 두면 계약을 넘는다
//   — 임원 의자에서 실제로 그렇게 됐다(선언 710, 화면 실측 718.3).
//   여기서는 **화면에서 잰 폭이 계약 안에 들어오도록** 미리 뺀다.
export const ERGO_BEVEL_MARGIN = 14;
// 같은 이유로 **위쪽**에도 여유를 둔다. 기울어 있으면 두께의 일부가 높이로 바뀐다.
export const ERGO_TOP_MARGIN = 6;

export function createConferenceErgoChair() {
  const S = DIMS.conferenceErgoChair;
  const seatThk = 68;                                 // 대기업 75보다 얇다 — 가벼운 인상
  const seatBottom = S.seatTop - seatThk;             // 382
  const halfW = S.overallW / 2;                       // 325 — 이 선을 넘는 부품이 없어야 한다
  const baseR = halfW - ERGO_BEVEL_MARGIN;            // 311

  // 5발 받침 — 대기업(330)·임원(350)보다 작다. 다리도 한 단 가늘다.
  const base = { legs: 5, reach: baseR, hubR: 56, hubH: 88, legW: 64, legH: 40, casterR: 27, casterH: 52 };
  const baseH = base.casterH + base.hubH;             // 140

  // 등받이 축 — 좌판 뒤에서 12° 뒤로. 대기업(14°)보다 세워 둔다:
  //   개인 모니터를 보는 자세라 더 곧추앉는다.
  const tilt = 12, rad = tilt * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pivotY = S.seatTop + 26, pivotZ = S.seatD / 2 - 60;
  const onAxis = (L, push = 0) => ({
    y: pivotY + L * cos - push * sin,
    dz: pivotZ + L * sin - push * cos,
  });
  // 등받이 꼭대기는 계약이 정한다 — 좌판 위 560mm(backAboveSeat)에서 끝나도록 역산한다.
  const topL = (S.seatTop + S.backAboveSeat - ERGO_TOP_MARGIN - pivotY) / cos;   // 축 위 거리

  const meshW = 400;                                  // 좌판(490)보다 좁다 — 메시 등받이는 원래 좁다
  const railW = 30, railDx = meshW / 2 + 16;          // 세로 레일은 메시 **바깥**을 잡는다
  const railH = topL - 20;                            // 레일이 등받이 꼭대기까지 그대로 올라간다
  const rail = onAxis(20 + railH / 2);
  const meshH = railH - 34;                           // 메시는 레일 안쪽에 걸린다
  const mesh = onAxis(20 + 17 + meshH / 2, 6);        // 메시는 레일보다 6mm 앞
  const lumbar = onAxis(110, -10);                    // 허리 받침 — 메시보다 10mm 뒤(뒤에서 받친다)
  const armDx = 262;

  return [
    // ① 5발 캐스터 받침 — 조각 11개를 한 덩어리로(그리기 호출 1개).
    star('chairCaster', baseH / 2, base),
    // ② 가스 실린더.
    cyl('chairColumn', 0, (baseH + seatBottom) / 2, 0, 34, seatBottom - baseH),
    // ③ 좌판 아래 기구부 — 좌판이 기둥에 바로 꽂힌 것처럼 보이지 않게.
    box('chairFrame', 0, seatBottom - 28, 8, 184, 56, 224, 0, { r: 22, mode: 'plan' }),
    // ④ 좌판 — 얇고 앞쪽 끝이 부드럽게 말린 인체공학 좌판.
    box('chairCushion', 0, seatBottom + seatThk / 2, 0, S.seatW, seatThk, S.seatD, 0, { r: 88, mode: 'plan' }),
    // ⑤ 등받이 브래킷 — 좌판 뒤에서 등받이로 이어진다. 등받이에 가려지도록 뒤쪽 가장자리에.
    box('chairFrame', 0, S.seatTop + 2, S.seatD / 2 - 16, 150, 124, 54, tilt, { r: 24, mode: 'face' }),
    // ⑥⑦ **세로 레일 두 개** — 이 의자의 정체성. 뒤판 대신 메시를 양쪽에서 잡는다.
    //     가늘어서 멀리서는 선 두 줄로 읽히고, 그 사이가 비어 보여 화면이 가벼워진다.
    //     **휘지도 둥글리지도 않는다** — 메시가 휘는 곡선의 양 끝(휨 0인 자리)에 서 있고,
    //     30mm 각재는 둥글려도 화면에서 보이지 않는다(삼각형만 는다).
    box('chairFrame', -railDx, rail.y, rail.dz, railW, railH, 26, tilt),
    box('chairFrame', railDx, rail.y, rail.dz, railW, railH, 26, tilt),
    // ⑧ 메시 등받이 — 레일 사이에 걸린 얇은 면. **위에 가로대를 얹지 않는다** —
    //    어깨 가로대는 대기업 의자의 특징이고, 여기서는 그것이 없어야 가볍게 읽힌다.
    //    메시 윗변을 넉넉히 둥글려 잘린 판이 아니라 마감된 등받이로 보이게 한다.
    box('chairMesh', 0, mesh.y, mesh.dz, meshW, meshH, 14, tilt, { sag: 58, r: 26 }),
    // ⑨ 허리 받침 — 메시 **뒤**에서 받치는 가로대. 인체공학 의자의 허리 곡선이 여기서 읽힌다.
    box('chairFrame', 0, lumbar.y, lumbar.dz, meshW - 70, 62, 22, tilt, { sag: 58, r: 8 }),
    // ⑩⑪ 팔걸이 기둥 — 가늘게. 좌석이 빼곡해서 팔걸이가 두꺼우면 화면이 지저분해진다.
    box('chairFrame', -armDx, S.seatTop + 96, 48, 24, 178, 54),
    box('chairFrame', armDx, S.seatTop + 96, 48, 24, 178, 54),
    // ⑫⑬ 팔걸이 패드 — 얇고 짧게. 계약 폭(650) 안에 들어오도록 기둥과 폭을 맞춘다.
    box('chairArmPad', -armDx, S.seatTop + 186, -12, 54, 22, 220, 0, { r: 11, mode: 'plan' }),
    box('chairArmPad', armDx, S.seatTop + 186, -12, 54, 22, 220, 0, { r: 11, mode: 'plan' }),
  ];
}

/**
 * 상황실 운용자 의자 (PHASE 5-a).
 * ─────────────────────────────────────────────────────────────────────────
 * 앞의 세 의자를 줄여 놓은 것이 아니다. **등받이를 세우는 방식이 다르다.**
 *   대기업(2-a) 메시를 사방에서 감싸는 테두리 판 + 어깨 가로대.
 *   임원(3-a)   위로 갈수록 좁아지는 한 덩어리 껍데기 + 헤드레스트.
 *   대회의(4-a) 가는 세로 레일 **두 개**가 메시를 양쪽에서 잡는다.
 *   상황실(여기) **가운데 척추 하나**가 좌판 뒤에서 곧게 올라가고, 그 앞에 작은 메시가 걸린다.
 *               옆이 트여 있고 뒤에서 보면 기둥 한 줄만 보인다 — 넷 중 가장 단순한 실루엣.
 *
 * 왜 그렇게 만드는가 — 상황실은 **콘솔에 바짝 붙어 앉는 좁은 열**이 여러 줄 겹친다.
 *   뒤 열에서 보면 앞 열 의자의 등받이만 계속 보이므로, 등받이가 넓으면 화면이 막힌다.
 *   그래서 뒤판도, 어깨 가로대도, 옆 레일도 두지 않는다. 부품 10개로 넷 중 가장 적다.
 *
 * 팔걸이는 **낮게** 둔다 — 콘솔 상판(DIMS.controlConsole.surfaceY = 730mm) 밑으로
 *   들어가야 의자가 콘솔에 붙는다. 대회의(패드 윗면 647)보다 더 낮춘다.
 *
 * 치수는 전부 계약(FURNITURE_CONTRACTS.taskChair)에서 온다.
 */
// 대회의실 의자와 같은 이유의 여유(mm) — 둥글림이 도형을 사방·위로 밀어내므로 미리 뺀다.
//   값을 따로 두는 것은 이 의자의 계약 봉투(620×630×1000)가 더 좁기 때문이다.
//   위쪽 여유는 **짐작이 아니라 실측으로 정했다** — 6으로 두었더니 화면에서 1,007.2mm 로
//   계약(1,000)을 7.2mm 넘었다(휜 메시의 둥글림이 위로도 밀어낸다). 14로 올려 999.2mm.
export const TASK_BEVEL_MARGIN = 14;
export const TASK_TOP_MARGIN = 14;

export function createTaskChair() {
  const S = DIMS.taskChair;
  const seatThk = 62;                                 // 대회의(68)보다 얇다 — 단단한 업무용 좌판
  const seatBottom = S.seatTop - seatThk;             // 388
  const halfW = S.overallW / 2;                       // 310 — 이 선을 넘는 부품이 없어야 한다
  const baseR = halfW - TASK_BEVEL_MARGIN;            // 296

  // 5발 받침 — 대회의(311)보다 한 단 더 작고 다리도 가늘다.
  const base = { legs: 5, reach: baseR, hubR: 52, hubH: 84, legW: 60, legH: 38, casterR: 25, casterH: 48 };
  const baseH = base.casterH + base.hubH;             // 132

  // 등받이 축 — 대회의(12°)보다 더 세운다. 콘솔 화면을 가까이서 보는 자세라 곧추앉는다.
  const tilt = 11, rad = tilt * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pivotY = S.seatTop + 22, pivotZ = S.seatD / 2 - 52;
  const onAxis = (L, push = 0) => ({
    y: pivotY + L * cos - push * sin,
    dz: pivotZ + L * sin - push * cos,
  });
  // 꼭대기는 계약이 정한다 — 좌판 위 550mm(backAboveSeat)에서 끝나도록 역산한다.
  const topL = (S.seatTop + S.backAboveSeat - TASK_TOP_MARGIN - pivotY) / cos;

  // **가운데 척추** — 좌판 속(축 위 -30)에서 시작해 등받이 꼭대기 조금 아래까지 곧게 올라간다.
  //   좌판에 묻혀 시작하므로 등받이가 허공에 뜨지 않는다(별도 브래킷이 필요 없다).
  const spineBottomL = -30, spineTopL = topL - 30;
  const spineH = spineTopL - spineBottomL;
  const spine = onAxis((spineBottomL + spineTopL) / 2);

  const meshW = 380;                                  // 좌판(470)보다 좁다 — 작은 메시 등받이
  const meshBottomL = 96;                             // 허리 아래는 비운다(옆이 트여 보이게)
  const meshH = topL - meshBottomL;
  const mesh = onAxis(meshBottomL + meshH / 2, 12);    // 척추보다 12mm 앞

  const armDx = 248;

  return [
    // ① 5발 캐스터 받침 — 조각 11개를 한 덩어리로(그리기 호출 1개).
    star('chairCaster', baseH / 2, base),
    // ② 가스 실린더. 네 의자 중 가장 가늘다.
    cyl('chairColumn', 0, (baseH + seatBottom) / 2, 0, 32, seatBottom - baseH),
    // ③ 좌판 아래 기구부 — 좌판이 기둥에 바로 꽂힌 것처럼 보이지 않게.
    box('chairFrame', 0, seatBottom - 26, 6, 168, 50, 206, 0, { r: 20, mode: 'plan' }),
    // ④ 좌판 — 얇고 작다. 앞쪽 끝만 부드럽게 말린다.
    box('chairCushion', 0, seatBottom + seatThk / 2, 0, S.seatW, seatThk, S.seatD, 0, { r: 80, mode: 'plan' }),
    // ⑤ **가운데 척추** — 이 의자의 정체성. 휘지도 둥글리지도 않는 각재 한 줄이다.
    //    옆 레일(대회의)도 테두리 판(대기업)도 없어서, 등받이 양옆이 그대로 뚫려 보인다.
    box('chairFrame', 0, spine.y, spine.dz, 92, spineH, 30, tilt),
    // ⑥ 메시 등받이 — 척추 앞에 걸린 얇고 휜 면. **위에 가로대를 얹지 않는다.**
    //    윗변을 넉넉히 둥글려 잘린 판이 아니라 마감된 등받이로 보이게 한다.
    box('chairMesh', 0, mesh.y, mesh.dz, meshW, meshH, 14, tilt, { sag: 52, r: 22 }),
    // ⑦⑧ 팔걸이 기둥 — 가늘고 짧게. 좁은 열에 여러 줄이 겹치므로 두꺼우면 화면이 막힌다.
    box('chairFrame', -armDx, S.seatTop + 88, 44, 22, 164, 50),
    box('chairFrame', armDx, S.seatTop + 88, 44, 22, 164, 50),
    // ⑨⑩ 팔걸이 패드 — **콘솔 상판(730) 밑으로 들어가도록 낮게 둔다.**
    box('chairArmPad', -armDx, S.seatTop + 170, -10, 50, 20, 206, 0, { r: 10, mode: 'plan' }),
    box('chairArmPad', armDx, S.seatTop + 170, -10, 50, 20, 206, 0, { r: 10, mode: 'plan' }),
  ];
}

/**
 * 임원 회의실 대형 U 테이블 (PHASE 3-b).
 * ─────────────────────────────────────────────────────────────────────────
 * **배치를 다시 계산하지 않는다.** 배치(room-presets의 U자 분기)는 상판을
 *   직사각형 **세 조각**으로 준다 — 뒤 가로 상판 1 + 좌·우 날개 2.
 *   그 세 조각을 그대로 세우면 이음매 세 줄이 그대로 보인다(계약이 금지한 모습).
 *   그래서 여기서는 세 조각의 **합쳐진 테두리만 읽어** U자 한 덩어리를 만든다.
 *   좌표·크기는 배치가 준 값 그대로다. 의자는 손대지 않는다.
 *
 * 하부 구조는 **판형 블레이드**다. 회의 테이블의 T형 받침을 크게 늘린 것이 아니다 —
 *   임원 테이블은 사람이 **바깥쪽에만** 앉으므로, 받침을 피해야 할 방향이 다르다.
 *   회의 테이블: 좌우(가로) 위치를 좌석 사이로 피한다(양쪽에 앉으므로).
 *   임원 U 테이블: 띠의 **안쪽으로 물려** 피한다(한쪽에만 앉으므로 무릎이 들어오는 깊이가 정해진다).
 */
// 상판 폭 900 띠 안에서 무릎이 들어오는 깊이. 사무 인간공학 기준(무릎 높이 유효깊이 ≥ 450)에
//   임원 의자(깊이 720·팔걸이 있는 하이백)를 감안해 여유를 더 둔 값이다.
export const BOARDROOM_KNEE_CLEAR = 520;
// 상판이 받침 없이 건너뛰는 최대 거리. 30mm 얇은 상판의 인상을 지키려면 이 이상 벌리지 않는다.
export const BOARDROOM_MAX_SPAN = 2600;
// 블레이드 한 장이 감당하는 상판 길이 = 좌석 1인 간격. room-presets의 FURNITURE.chairPitch 와
//   같은 값이며, 어긋나지 않는지 테스트가 지킨다(모듈 순환 참조를 피하려고 값을 여기 둔다).
export const BOARDROOM_SEAT_PITCH = 700;

const BOARDROOM_TOL = 1;   // 배치 좌표 비교 허용 오차(mm)
const near = (a, b) => Math.abs(a - b) <= BOARDROOM_TOL;

/**
 * 배치가 준 테이블 조각들이 **이 자산이 맡을 수 있는 U자인가.**
 * 맞으면 합쳐진 치수를, 아니면 null을 돌려준다. **추측해서 맞추지 않는다** —
 *   모르는 모양이면 null을 돌려주고 기존 테이블이 조각마다 그려지게 둔다(가짜 스펙 금지).
 */
export function boardroomUBounds(items = []) {
  const C = FURNITURE_CONTRACTS.boardroomTable.dimensions;
  return uTableBounds(items, C.minWidth, C.minDepth);
}

/**
 * 배치가 준 테이블 조각들의 **합쳐진 U자 테두리**. 맞지 않으면 null.
 * 임원 U 테이블과 대회의실 U 테이블이 **같은 배치 모양**(뒤 가로 상판 + 날개 2)을 받으므로
 *   읽는 법을 한 곳에만 둔다 — 두 곳에 적으면 언젠가 서로 다른 U자를 읽게 된다.
 * 최소 크기만 자산마다 다르다(각자의 계약이 정한다).
 */
export function uTableBounds(items = [], minWidth = 0, minDepth = 0) {
  // ① 기준 방향 — LED 쪽(-Z)으로 열린 U자. 지금까지 유일했던 모양이다.
  const across = readUAcross(items, minWidth, minDepth);
  if (across) return Object.freeze({ ...across, rotY: 0 });
  // ② 세로 — 옆으로 열린 U자(테이블 방향 옵션). **판독기를 새로 쓰지 않는다** —
  //    조각들을 기준 방향으로 -90° 돌려 같은 판독기에 넣고, 중심만 실제 좌표로 되돌린다.
  //    (x, z) → (-z, x). 축이 바뀌므로 가로·세로 값도 서로 바꾼다.
  const turned = items.map(it => (it && typeof it === 'object'
    ? { ...it, x: -it.z, z: it.x, w: it.d, d: it.w } : it));
  const along = readUAcross(turned, minWidth, minDepth);
  if (!along) return null;
  // 되돌리기 (x, z) → (z, -x). 나머지 값은 전부 **중심 기준 로컬**이라 그대로 둔다.
  return Object.freeze({ ...along, cx: along.cz, cz: -along.cx, rotY: 270 });
}

// LED 쪽(-Z)으로 열린 U자만 읽는다. 다른 방향은 위 `uTableBounds`가 돌려서 넣어 준다.
function readUAcross(items = [], minWidth = 0, minDepth = 0) {
  if (!Array.isArray(items) || items.length !== 3) return null;
  for (const it of items) {
    if (!it || it.type !== 'table') return null;
    if (it.shape && it.shape !== 'rect') return null;
    if (it.rotY) return null;                                  // 돌아간 조각은 다루지 않는다
    if (!(it.w > 0) || !(it.d > 0)) return null;
    if (!Number.isFinite(it.x) || !Number.isFinite(it.z)) return null;
  }
  const minX = Math.min(...items.map(i => i.x - i.w / 2));
  const maxX = Math.max(...items.map(i => i.x + i.w / 2));
  const minZ = Math.min(...items.map(i => i.z - i.d / 2));
  const maxZ = Math.max(...items.map(i => i.z + i.d / 2));
  const outerW = Math.round(maxX - minX), outerD = Math.round(maxZ - minZ);
  if (outerW < minWidth || outerD < minDepth) return null;

  // 뒤 가로 상판 = 바깥 가로를 통째로 차지하는 조각. 나머지 둘이 날개다.
  const header = items.find(i => near(i.w, outerW));
  const wings = items.filter(i => i !== header);
  if (!header || wings.length !== 2) return null;
  const segW = Math.round(header.d);
  if (!(segW > 0) || segW * 2 >= outerW || segW >= outerD) return null;
  // 가로 상판은 U자의 **한쪽 끝**에 붙어 있고, 날개 둘이 그 반대쪽으로 뻗는다.
  const atRear = near(header.z + header.d / 2, maxZ);
  const atFront = near(header.z - header.d / 2, minZ);
  if (!atRear && !atFront) return null;
  const joint = atRear ? header.z - header.d / 2 : header.z + header.d / 2;   // 날개가 붙는 면
  const tip = atRear ? minZ : maxZ;                                          // 날개 끝
  for (const w of wings) {
    if (!near(w.w, segW)) return null;                          // 날개 폭 = 띠 폭
    if (!near(atRear ? w.z + w.d / 2 : w.z - w.d / 2, joint)) return null;   // 날개가 가로 상판에 붙는다
    if (!near(atRear ? w.z - w.d / 2 : w.z + w.d / 2, tip)) return null;     // 날개 끝이 U자의 끝
    const outerEdge = near(w.x - w.w / 2, minX) ? minX : (near(w.x + w.w / 2, maxX) ? maxX : null);
    if (outerEdge === null) return null;                        // 날개 바깥면이 U자 바깥면과 같아야 한다
  }
  // **LED를 향해(-Z) 열려야 한다.** 반대로 열린 U자는 도형도 받침 자리도 전부 뒤집혀야 하는데,
  //   지금 배치가 그런 U자를 만들지 않으므로 **만들 수 있는 척하지 않는다**(가짜 스펙 금지).
  if (!atRear) return null;
  if (near(wings[0].x, wings[1].x)) return null;                // 같은 쪽에 두 개일 수 없다
  return Object.freeze({
    outerW, outerD, segW,
    innerW: outerW - segW * 2,
    innerD: outerD - segW,
    cx: Math.round((minX + maxX) / 2),
    cz: Math.round((minZ + maxZ) / 2),
  });
}

/** 이 테이블 조각들을 임원 U 테이블이 맡을 수 있는가. */
export function fitsBoardroomTable(items = []) {
  return boardroomUBounds(items) !== null;
}

// 길이 zoneLen 인 구간을 받침 없이 BOARDROOM_MAX_SPAN 이상 건너뛰지 않게 나눈 자리들.
//   구간을 n등분하고 각 칸의 가운데에 한 장씩 둔다 — 좌우 대칭이 저절로 지켜진다.
function bladeStops(zoneLen, zoneCenter) {
  const n = Math.max(1, Math.min(4, Math.ceil(zoneLen / BOARDROOM_MAX_SPAN)));
  const step = zoneLen / n;
  return Array.from({ length: n }, (_, i) => Math.round(zoneCenter + (i - (n - 1) / 2) * step));
}

/**
 * @param items 배치가 준 테이블 조각 3개(뒤 상판 + 날개 2). 좌표는 방 좌표계(mm).
 * @returns 구성 명세, 또는 맡을 수 없는 모양이면 null.
 */
export function createBoardroomTable(items = []) {
  const B = boardroomUBounds(items);
  if (!B) return null;
  const C = FURNITURE_CONTRACTS.boardroomTable.dimensions;
  const topBottom = C.surfaceY - C.topThk;

  // 모서리 반지름 — 세 자리의 성격이 다르다.
  //   앞 끝  계약값(450) 그대로. 띠 폭의 절반이라 **날개 끝이 정확한 반원**이 된다(임원 테이블의 인상).
  //   뒤 바깥 사람이 앉지 않는 쪽. 날카로워 보이지만 않으면 된다.
  //   안쪽   오목한 자리를 메우는 곡면. 이것이 있어야 '직사각형 세 장'이 아니라 한 덩어리로 읽힌다.
  const frontR = Math.max(0, Math.min(C.frontCornerR, B.segW / 2, B.outerD / 2, B.outerW / 2));
  const rearR = Math.max(0, Math.min(Math.round(B.segW * 0.18), B.segW / 2));
  const innerR = Math.max(0, Math.min(Math.round(B.segW / 3), B.innerW / 2, B.innerD / 2));

  // 블레이드는 띠의 **안쪽**으로 물린다. 앉는 쪽 모서리에서 무릎 여유 + 두께 절반.
  const bladeThk = 100;
  // 블레이드 **길이**가 이 자산의 인상을 가른다. 좌석 간격(700)만큼 길게 잡았더니
  //   정면에서 620 높이와 거의 정사각이 되어 **통짜 받침대**로 읽혔다(계약이 금지한 모습).
  //   좌석 간격의 절반으로 줄여 세로로 선 얇은 판(지느러미)이 되게 한다.
  const bladeL = Math.round(BOARDROOM_SEAT_PITCH / 2);
  const inset = BOARDROOM_KNEE_CLEAR + bladeThk / 2;      // 앉는 모서리 ~ 블레이드 중심
  const panelBottom = Math.max(0, topBottom - C.bodyDrop);

  const supports = [];
  // 뒤 가로 상판 — 띠가 X 방향으로 달린다. 앉는 쪽은 +Z(LED 반대편).
  //   받침을 둘 구간은 두 날개 **사이**(innerW)다. 날개 위는 날개가 스스로 받친다.
  const headerZ = B.cz + B.outerD / 2 - B.segW / 2;       // 뒤 상판 띠 중심
  for (const dx of bladeStops(B.innerW, B.cx)) {
    supports.push({
      dx: dx - B.cx, dz: Math.round(headerZ + B.segW / 2 - inset) - B.cz,
      w: bladeL, d: bladeThk, along: 'x',
    });
  }
  // 좌·우 날개 — 띠가 Z 방향으로 달린다. 앉는 쪽은 바깥(±X).
  const wingZoneLen = B.innerD;                           // 앞 끝 ~ 뒤 상판 앞면
  const wingZoneCenter = B.cz - B.segW / 2;
  for (const sign of [-1, 1]) {
    const wingX = B.cx + sign * (B.outerW / 2 - B.segW / 2);
    for (const dz of bladeStops(wingZoneLen, wingZoneCenter)) {
      supports.push({
        dx: Math.round(wingX + sign * (B.segW / 2 - inset)) - B.cx, dz: dz - B.cz,
        w: bladeThk, d: bladeL, along: 'z',
      });
    }
  }

  return {
    shape: 'u',
    outerW: B.outerW, outerD: B.outerD, segW: B.segW, innerW: B.innerW, innerD: B.innerD,
    cx: B.cx, cz: B.cz,
    // 이 덩어리를 세울 때 돌려야 하는 각도. 0 = LED 쪽으로 열린 기준 방향.
    rotY: B.rotY || 0,
    surfaceY: C.surfaceY, topThk: C.topThk, topBottom,
    frontR, rearR, innerR,
    topBevel: Math.round(C.topThk * 0.2),   // 상판 가장자리 살짝 죽임(30mm 판의 날을 없앤다)
    bodyDrop: C.bodyDrop, panelBottom,
    // 블레이드는 바닥에서 떠 있고, 그 아래를 **한 단 들어간 굽**이 받친다.
    //   굽이 없으면 판이 공중에 뜨고, 굽이 같은 크기면 통짜 받침대(계약이 금지한 모습)가 된다.
    toeInset: 70,
    supports,
  };
}

/**
 * 대회의실 대형 U 테이블 (PHASE 4-b).
 * ─────────────────────────────────────────────────────────────────────────
 * 임원 U 테이블을 크게 늘린 것이 **아니다.** 성격이 다르다.
 *   임원  적은 인원 · 두꺼운 상판 · 앞 끝 반원(반지름 450) · 판형 블레이드 하부
 *   대회의 많은 인원 · 얇은 상판(25) · 모서리만 살짝 죽인 각진 U ·
 *          **가는 기둥 + 긴 보(beam)** 하부 — 좌석마다 개인 모니터가 놓일 자리를 비워 둔다.
 *
 * 배치는 여기서도 직사각형 세 조각으로 온다. 세 조각을 따로 세우면 이음매가 보이므로
 *   합쳐진 테두리만 읽어 **한 덩어리** U자를 만든다(읽는 법은 uTableBounds 하나뿐이다).
 */
// 앉는 모서리에서 다리·보를 비워 두는 깊이. 무릎이 들어오는 자리이자, 앞으로 개인 모니터
//   받침이 놓일 자리이기도 하다(PHASE 4-c). 사무 인간공학 기준(유효깊이 ≥ 450)에 여유를 더했다.
export const LARGE_U_KNEE_CLEAR = 500;
// 상판이 받침 없이 건너뛰는 최대 거리. 25mm 얇은 상판이므로 임원(2,600)보다 짧게 잡는다.
export const LARGE_U_MAX_SPAN = 2400;
// 참석자 1인 간격 — room-presets의 FURNITURE.chairPitch 와 같은 값이다(테스트가 지킨다).
export const LARGE_U_SEAT_PITCH = 700;
// 날개 앞 끝에서 보를 물리는 양. 보가 상판 끝까지 나오면 앞에서 훤히 보인다.
const LARGE_U_BEAM_END_INSET = 220;
// 가는 사각 기둥 + 낮은 굽. **좌석마다 하나가 아니라** 몇 좌석마다 하나다(계약이 금지한 모습).
const LARGE_U_POST = Object.freeze({ w: 160, d: 70, footGrow: 120, footH: 18 });
// 기둥을 잇는 긴 보 — 이것이 있어야 '조각 세 장'이 아니라 **짜인 구조물**로 읽힌다.
const LARGE_U_BEAM = Object.freeze({ w: 70, h: 90 });

/** 이 테이블 조각들을 대회의실 U 테이블이 맡을 수 있는가. */
export function fitsLargeUTable(items = []) {
  return largeUBounds(items) !== null;
}

/** 대회의실 U 테이블이 읽어 낸 합쳐진 테두리. 맡을 수 없는 모양이면 null. */
export function largeUBounds(items = []) {
  const C = FURNITURE_CONTRACTS.largeUTable.dimensions;
  return uTableBounds(items, C.minWidth, C.minDepth);
}

// 길이 len 인 구간을 받침 없이 LARGE_U_MAX_SPAN 이상 건너뛰지 않게 나눈 자리들(구간 가운데마다 하나).
function postStops(len, center) {
  const n = Math.max(1, Math.ceil(len / LARGE_U_MAX_SPAN));
  const step = len / n;
  return Array.from({ length: n }, (_, i) => Math.round(center + (i - (n - 1) / 2) * step));
}

/**
 * @param items 배치가 준 테이블 조각 3개(뒤 상판 + 날개 2). 좌표는 방 좌표계(mm).
 * @returns 구성 명세, 또는 맡을 수 없는 모양이면 null. 좌표는 **테이블 중심 기준**(dx·dz)이다.
 */
export function createLargeUTable(items = []) {
  const B = largeUBounds(items);
  if (!B) return null;
  const C = FURNITURE_CONTRACTS.largeUTable.dimensions;
  const topBottom = C.surfaceY - C.topThk;

  // 모서리 — 임원(450 반원)을 **복사하지 않는다.** 계약에 그런 규칙이 없고, 성격도 다르다.
  //   앞 끝  살짝 죽인 정도. 반원이 되면 임원 테이블로 읽힌다.
  //   안쪽   오목한 자리를 잇는 최소 곡면. 이것이 없으면 직각으로 꺾여 세 장처럼 보인다.
  //   뒤     거의 각. 사람이 앉지 않는 쪽이라 날카로워 보이지만 않으면 된다.
  const frontR = Math.max(0, Math.min(180, B.segW / 2, B.outerD / 2, B.outerW / 2));
  const innerR = Math.max(0, Math.min(120, B.innerW / 2, B.innerD / 2));
  const rearR = Math.max(0, Math.min(60, B.segW / 2));

  // 기둥·보는 앉는 모서리에서 무릎 깊이만큼 **안으로 물린다**(한쪽에만 앉으므로 방향이 정해진다).
  const inset = LARGE_U_KNEE_CLEAR + LARGE_U_BEAM.w / 2;
  const halfW = B.outerW / 2, halfD = B.outerD / 2;
  const beamZ = Math.round(halfD - inset);            // 뒤 가로 상판의 보 — X 방향으로 달린다
  const beamX = Math.round(halfW - inset);            // 좌·우 날개의 보 — Z 방향으로 달린다
  const beamEndZ = Math.round(-halfD + LARGE_U_BEAM_END_INSET);

  // 보 3줄이 **서로 만나** ㄷ자 한 줄이 된다(끊긴 세 도막으로 보이지 않게 모서리를 겹친다).
  const beams = [
    { dx: 0, dz: beamZ, len: beamX * 2 + LARGE_U_BEAM.w, along: 'x' },
    { dx: -beamX, dz: Math.round((beamZ + beamEndZ) / 2), len: beamZ - beamEndZ, along: 'z' },
    { dx: beamX, dz: Math.round((beamZ + beamEndZ) / 2), len: beamZ - beamEndZ, along: 'z' },
  ];

  const supports = [];
  for (const dx of postStops(beamX * 2, 0)) supports.push({ dx, dz: beamZ, along: 'x' });
  for (const sign of [-1, 1]) {
    for (const dz of postStops(beamZ - beamEndZ, (beamZ + beamEndZ) / 2)) {
      supports.push({ dx: sign * beamX, dz, along: 'z' });
    }
  }
  // 실제로 받침 없이 건너뛰는 가장 먼 거리(보고용) — 기둥 사이 간격 중 최댓값이다.
  const gap = (len, n) => (n > 0 ? Math.round(len / n) : 0);
  const maxSpan = Math.max(
    gap(beamX * 2, postStops(beamX * 2, 0).length),
    gap(beamZ - beamEndZ, postStops(beamZ - beamEndZ, 0).length),
  );

  return {
    shape: 'u',
    outerW: B.outerW, outerD: B.outerD, segW: B.segW, innerW: B.innerW, innerD: B.innerD,
    cx: B.cx, cz: B.cz,
    // 이 덩어리를 세울 때 돌려야 하는 각도. 0 = LED 쪽으로 열린 기준 방향.
    rotY: B.rotY || 0,
    surfaceY: C.surfaceY, topThk: C.topThk, topBottom,
    frontR, rearR, innerR,
    topBevel: Math.round(C.topThk * 0.16),   // 얇은 상판의 날만 없앤다(장식 몰딩이 아니다)
    kneeClear: LARGE_U_KNEE_CLEAR, inset,
    post: Object.freeze({
      w: LARGE_U_POST.w, d: LARGE_U_POST.d,
      h: topBottom - LARGE_U_POST.footH, y: LARGE_U_POST.footH + (topBottom - LARGE_U_POST.footH) / 2,
    }),
    foot: Object.freeze({
      w: LARGE_U_POST.w + LARGE_U_POST.footGrow, d: LARGE_U_POST.d,
      h: LARGE_U_POST.footH, y: LARGE_U_POST.footH / 2,
    }),
    beam: Object.freeze({ w: LARGE_U_BEAM.w, h: LARGE_U_BEAM.h, y: topBottom - LARGE_U_BEAM.h / 2 }),
    beams, supports, maxSpan,
  };
}

/**
 * 참석자 개인 모니터 (PHASE 4-c).
 * ─────────────────────────────────────────────────────────────────────────
 * **크기를 지어내지 않는다.** 24인치라는 계약값만 받아 `panelSize()`(monitors.js)가
 *   16:9 순수 기하로 가로·세로를 낸다 — LED 옆 보조 모니터와 **같은 함수**다.
 *   베젤 두께·본체 깊이·받침 높이도 전부 계약이 정한 값이다.
 *
 * 놓이는 자리는 **상판 위**다. 그래서 y는 바닥이 아니라 **상판 윗면 기준**이고,
 *   배치가 만든 항목의 `y`(= 740)가 렌더러에서 더해진다.
 * rotY = 0 일 때 화면은 -Z 를 본다(다른 가구와 같은 규칙).
 */
// 받침 판·목. 계약에 없는 **보이기 위한 최소값**이다(특정 제품 스펙이 아니다).
const MONITOR_BASE = Object.freeze({ w: 240, d: 200, h: 16, neckW: 64, neckD: 24 });
const SCREEN_THK = 4;          // 화면 판 두께 — 본체 앞면에서 살짝 나온다
const SCREEN_GAP = 2;          // 본체 앞면 ~ 화면 판 사이

// 기울어진 본체 앞에 화면을 붙일 때, **기운 뒤의** 자리를 미리 계산한다.
//   부품마다 제 중심에서 돌기 때문에, 안 돌린 좌표로 붙이면 화면이 본체에서 떠 버린다.
function tiltedFront(centerY, offset, tiltDeg) {
  const t = tiltDeg * Math.PI / 180;
  return { y: centerY + offset * Math.sin(t), dz: -offset * Math.cos(t) };
}

export function createPersonalMonitor() {
  const S = personalMonitorSize();
  const B = MONITOR_BASE;
  const bodyY = S.standH + S.panelH / 2;
  const scr = tiltedFront(bodyY, S.depth / 2 + SCREEN_GAP + SCREEN_THK / 2, S.tiltDeg);
  return [
    // ① 받침 판 — 상판 위에 놓인다(y = 0 이 상판 윗면이다).
    box('monitorStand', 0, B.h / 2, 0, B.w, B.h, B.d, 0, { r: 8, mode: 'plan' }),
    // ② 받침 목 — 가늘게. 두꺼우면 게이밍 스탠드처럼 보인다(계약이 금지한 인상).
    box('monitorStand', 0, B.h + (S.standH - B.h) / 2, 0, B.neckW, S.standH - B.h, B.neckD),
    // ③ 본체 — 계약이 정한 기울기만큼 뒤로 눕는다.
    box('monitorBody', 0, bodyY, 0, S.panelW, S.panelH, S.depth, S.tiltDeg, { r: 10, mode: 'face' }),
    // ④ 화면 — 꺼진 화면이다. 밝게 빛나면 LED가 주인공 자리를 잃는다(오너 지침 §11).
    box('screen', 0, scr.y, scr.dz, S.screenW, S.screenH, SCREEN_THK, S.tiltDeg),
  ];
}

/**
 * 상황실 운용 모니터 (PHASE 5-c).
 * ─────────────────────────────────────────────────────────────────────────
 * 개인 모니터(4-c)와 **부품 구성이 같다** — 계약이 그렇게 맞춰 두었다(받침판·받침목·본체·화면).
 *   그래서 두 번째 모니터 틀을 만들지 않고 같은 방식을 그대로 쓴다. 다른 것은 숫자뿐이다:
 *   27인치(개인용 22) · 받침 160(개인용은 더 낮다) · 기울기 10°.
 *
 * **상판 위에 놓이는 물건이다** — 자산의 y = 0 이 콘솔 상판 윗면이다.
 *   단(tier) 높이는 여기 넣지 않는다. 그것은 배치가 주는 item.y 의 몫이다.
 */
export function createConsoleMonitor() {
  const S = consoleMonitorSize();
  const B = CONSOLE_MONITOR_BASE;
  const bodyY = S.standH + S.panelH / 2;
  const scr = tiltedFront(bodyY, S.depth / 2 + SCREEN_GAP + SCREEN_THK / 2, S.tiltDeg);
  return [
    // ① 받침 판 — 상판 위에 놓인다(y = 0 이 상판 윗면이다).
    box('monitorStand', 0, B.h / 2, 0, B.w, B.h, B.d, 0, { r: 8, mode: 'plan' }),
    // ② 받침 목 — 가늘게. 두꺼우면 게이밍 스탠드처럼 보인다(계약이 금지한 인상).
    box('monitorStand', 0, B.h + (S.standH - B.h) / 2, 0, B.neckW, S.standH - B.h, B.neckD),
    // ③ 본체 — 계약이 정한 10° 만큼 뒤로 눕는다.
    //    **둥글림을 개인 모니터(10)보다 작게 잡는다.** 27인치 패널(625.7)은 계약 발자국(630)에
    //    여유가 4.3mm 뿐이라, 10으로 두면 둥글림이 사방으로 밀어내 화면 실측이 634.7 로 넘친다.
    //    패널 크기를 줄여 맞추는 것은 가짜 스펙이므로, 줄이는 것은 **둥글림 쪽**이다.
    box('monitorBody', 0, bodyY, 0, S.panelW, S.panelH, S.depth, S.tiltDeg, { r: 4, mode: 'face' }),
    // ④ 화면 — 꺼진 화면이다. 밝게 빛나면 LED가 주인공 자리를 잃는다(오너 지침 §11).
    box('screen', 0, scr.y, scr.dz, S.screenW, S.screenH, SCREEN_THK, S.tiltDeg),
  ];
}
// 운용 모니터 받침 — 개인 모니터(240×200)보다 조금 크다. 27인치를 받치는 크기다.
const CONSOLE_MONITOR_BASE = Object.freeze({ w: 260, d: 200, h: 18, neckW: 72, neckD: 28 });

/**
 * 키보드 (PHASE 5-c).
 * ─────────────────────────────────────────────────────────────────────────
 * **부품 하나짜리 판이다.** 계약이 그렇게 정했다 — 콘솔 수십 대에 하나씩 깔리는데
 *   부품을 둘로 쪼개면 그리기 호출이 그대로 두 배가 된다. 자판도 새기지 않는다
 *   (제안서 거리에서는 보이지도 않고 삼각형만 는다).
 * 상판 위에 놓이므로 자산의 y = 0 이 상판 윗면이다.
 */
export function createKeyboard() {
  const S = keyboardSize();
  // **둥글리지 않는다.** 계약 치수(440×150)가 곧 발자국이라 여유가 0이고, 둥글림은 도형을
  //   사방으로 밀어내 계약을 넘긴다(실측 445.4). 게다가 제안서 거리에서는 보이지도 않으면서
  //   삼각형만 236개로 늘어난다 — 각진 판 하나면 12개다.
  return [box('keyboardBody', 0, S.h / 2, 0, S.w, S.h, S.d)];
}

/**
 * 중앙 프롬프터 / 컨피던스 모니터 (PHASE 4-c).
 * ─────────────────────────────────────────────────────────────────────────
 * U자 **가운데 빈 공간**에 선다 — 그 자리에는 상판이 없으므로 **바닥에 서는 기둥형**이다.
 *   계약이 정한 것: 22인치 · 기울기 22° · 본체 깊이 60 · 받침 높이 90.
 *   계약이 정하지 않은 것: 바닥에서 들어 올리는 높이 → `PROMPTER_FLOOR_RISE`(자산 전용, 보고서에 명시).
 *   화면 윗변이 약 950mm에 머물러 **앉은 사람의 LED 시선을 가로막지 않는다.**
 */
const PROMPTER_BASE = Object.freeze({ w: 420, d: 300, h: 26, colW: 100, colD: 80 });

export function createPrompter() {
  const S = prompterSize();
  const B = PROMPTER_BASE;
  const bodyBottom = PROMPTER_FLOOR_RISE + S.standH;
  const bodyY = bodyBottom + S.panelH / 2;
  const colH = bodyBottom - B.h;
  const scr = tiltedFront(bodyY, S.depth / 2 + SCREEN_GAP + SCREEN_THK / 2, S.tiltDeg);
  return [
    // ① 바닥 판 — 넓고 낮게. 기둥형이 넘어져 보이지 않게 하는 최소 크기다.
    box('prompterBody', 0, B.h / 2, 0, B.w, B.h, B.d, 0, { r: 12, mode: 'plan' }),
    // ② 기둥 — 가늘게. 가운데 빈 공간을 시각적으로 막지 않아야 한다.
    box('prompterBody', 0, B.h + colH / 2, 0, B.colW, colH, B.colD),
    // ③ 본체 — 계약이 정한 22° 만큼 뒤로 눕는다.
    box('prompterBody', 0, bodyY, 0, S.panelW, S.panelH, S.depth, S.tiltDeg, { r: 10, mode: 'face' }),
    // ④ 화면 — 개인 모니터와 같은 꺼진 화면이다.
    box('screen', 0, scr.y, scr.dz, S.screenW, S.screenH, SCREEN_THK, S.tiltDeg),
  ];
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

/**
 * 상황실 곡선 콘솔 데스크 (PHASE 5-b).
 * ─────────────────────────────────────────────────────────────────────────
 * 기존 `createControlConsole`(직선 상자 + 모니터 2대)은 **그대로 둔다.** 이것은 별도 자산이다.
 *
 * 무엇이 다른가 — 세 가지다.
 *   ① **상판이 휜다.** 평면에서 운용자를 감싸듯 휘어, 여러 대를 줄로 놓으면 호가 읽힌다.
 *   ② **무릎 자리가 열린다.** 기존 콘솔은 1600×700 짜리 큰 통이 아래를 다 막고 있었다.
 *      여기서는 얇은 옆 판 두 장 + 낮은 뒤 보뿐이라, 앉는 쪽이 그대로 뚫려 있다.
 *   ③ **모니터가 들어 있지 않다.** 기존 콘솔은 모니터 2대가 형상에 박혀 있었다 —
 *      콘솔은 가구이고 모니터는 AV 장비다. 콘솔 모니터·키보드는 PHASE 5-c 가 따로 놓는다.
 *      그래서 이 단계 직후 상황실 모니터 수가 잠시 0이 되는 것은 **의도된 상태**다.
 *
 * 휘는 방향 — **양 끝(날개)이 운용자 쪽으로 나오고 가운데가 물러난다.**
 *   계약의 정체성 문장("운용자를 감싸듯 휘어 있어")을 따른 것이다. 감싼다는 것은
 *   날개가 사람 쪽으로 돌아온다는 뜻이고, 그래야 의자와의 여유도 줄지 않는다
 *   (의자는 콘솔 **가운데** 뒤에 앉으므로, 가운데가 물러나면 여유가 늘어난다).
 *
 * 발자국 — 휜 뒤의 전체 깊이가 **정확히 배치가 준 깊이**다(1800 × 900).
 *   상판을 900 깊이로 만든 뒤 180 더 부풀리면 발자국이 조용히 1,080이 된다.
 *   배치(layoutControl)는 이 단계에서 동결이므로, 휨은 **발자국 안에서** 쓴다.
 *
 * 치수는 전부 계약(FURNITURE_CONTRACTS.curvedConsole)에서 온다.
 */
// 휨 규칙(그 깊이에서 실제로 쓸 수 있는 휨)은 **control-av.js 하나가 정한다** —
//   AV 자리 계산이 같은 곡선을 읽어야 하므로 두 곳에 적으면 언젠가 어긋난다.
export { CONSOLE_MIN_BAND_DEPTH };

export function createCurvedConsole(w = 1800, d = 900) {
  const S = DIMS.curvedConsole;
  const under = S.surfaceY - S.topThk;                 // 상판 아랫면 = 690
  const sag = consoleSag(d);
  // 옆 판 — 상판 밑에 완전히 가려지는 자리에 세운다. 날개 쪽은 상판이 얕아지므로
  //   판을 너무 바깥에 두면 상판 밖으로 발이 삐져나온다.
  const panelDx = w / 2 - 140, panelD = d - 340, panelThk = 60;
  return [
    // ① 휜 상판 — 이음매 없는 한 덩어리. 윗면이 계약의 730mm 에 정확히 온다.
    curvedTop('consoleTop', S.surfaceY - S.topThk / 2, w, S.topThk, d, sag),
    // ②③ 옆 판 두 장 — 얇은 기술 패널. 서랍장이 아니라 판이라 아래가 비어 보인다.
    box('consoleBase', -panelDx, under / 2, 20, panelThk, under, panelD),
    box('consoleBase', panelDx, under / 2, 20, panelThk, under, panelD),
    // ④ 뒤 배선 보 — 낮게. LED 쪽(−Z)에 붙여 두어 운용자 발 자리를 비운다.
    //    상판의 뒤 모서리는 날개에서 가장 앞(−d/2+sag)이므로 그 안쪽에 둔다.
    box('consoleBase', 0, 150, -(d / 2 - sag) - 55, w - 340, 90, 110),
  ];
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
  // PHASE 3-a — 임원 회의용 하이백 의자. 이 한 줄이 등록되는 순간 라우터가 저절로 이것을 고른다.
  executiveChair: { id: 'executiveChair', label: '임원 회의용 하이백 의자', instanced: true, sized: false, build: () => createExecutiveChair() },
  // PHASE 4-a — 대회의실용 인체공학 의자. 등록 한 줄로 라우터가 저절로 이것을 고른다.
  conferenceErgoChair: { id: 'conferenceErgoChair', label: '대회의실용 인체공학 의자', instanced: true, sized: false, build: () => createConferenceErgoChair() },
  // PHASE 5-a — 상황실 운용자 의자. 등록 한 줄로 라우터가 저절로 이것을 고른다
  //   (지금까지는 계약만 있어 기존 회의용 의자로 대신 그려졌다).
  taskChair: { id: 'taskChair', label: '상황실 운용자 의자', instanced: true, sized: false, build: () => createTaskChair() },
  auditoriumChair: { id: 'auditoriumChair', label: '강당 고정 객석', instanced: true, sized: false, build: () => createAuditoriumChair() },
  trainingChair: { id: 'trainingChair', label: '강의용 의자', instanced: true, sized: false, build: () => createTrainingChair() },
  trainingDesk: { id: 'trainingDesk', label: '강의용 책상', instanced: true, sized: true, build: it => createTrainingDesk(it.w, it.d) },
  controlConsole: { id: 'controlConsole', label: '상황실 콘솔', instanced: true, sized: true, build: it => createControlConsole(it.w, it.d) },
  // PHASE 5-b — 상황실 곡선 콘솔. 기존 직선 콘솔은 그대로 남는다(디자인이 없는 경로가 쓴다).
  //   이 한 줄이 등록되는 순간 라우터는 고치지 않아도 상황실에서 이것을 고른다.
  curvedConsole: { id: 'curvedConsole', label: '상황실 곡선 콘솔 데스크', instanced: true, sized: true, build: it => createCurvedConsole(it.w, it.d) },
  podium: { id: 'podium', label: '교탁', instanced: true, sized: false, build: () => createPodium() },
  avCredenza: { id: 'avCredenza', label: 'AV 수납장', instanced: true, sized: true, build: it => createAvCredenza(it.w, it.d) },
  highTable: { id: 'highTable', label: '하이 테이블', instanced: true, sized: true, build: it => createHighTable(it.w, it.d) },
  stool: { id: 'stool', label: '스툴', instanced: true, sized: false, build: () => createStool() },
  loungeChair: { id: 'loungeChair', label: '라운지 체어', instanced: true, sized: false, build: () => createLoungeChair() },
  collabTable: { id: 'collabTable', label: '협업 테이블', instanced: true, sized: true, build: it => createCollabTable(it.w) },
  seatedPerson: { id: 'seatedPerson', label: '착석 인원', instanced: true, sized: false, build: () => createSeatedPerson(DIMS.auditoriumChair.seatTop) },
  mobileStand: { id: 'mobileStand', label: '이동식 디스플레이', instanced: true, sized: false, build: () => createMobileStand() },
  conferenceTable: { id: 'conferenceTable', label: '회의 테이블', instanced: false, sized: true, spec: it => createConferenceTable(it) },
  // PHASE 2-b — 대기업 회의실 전용 테이블. 기존 회의 테이블은 그대로 남는다.
  corporateTable: { id: 'corporateTable', label: '대기업 회의 테이블', instanced: false, sized: true, spec: it => createCorporateTable(it) },
  // PHASE 3-b — 임원 회의실 대형 U 테이블. 조각 하나가 아니라 **테이블 조각 전체**를 받는다.
  boardroomTable: { id: 'boardroomTable', label: '임원 회의실 대형 U 테이블', instanced: false, sized: true, spec: items => createBoardroomTable(items) },
  // PHASE 4-b — 대회의실 대형 U 테이블. 임원 것과 같은 배치(조각 3장)를 받지만 **다른 자산**이다.
  //   이 한 줄이 등록되는 순간 라우터는 고치지 않아도 이것을 고른다.
  largeUTable: { id: 'largeUTable', label: '대회의실 대형 U 테이블', instanced: false, sized: true, spec: items => createLargeUTable(items) },
  // PHASE 4-c — 좌석마다 한 대씩 깔리므로 **반드시 InstancedMesh**로 묶는다(계약의 요구).
  personalMonitor: { id: 'personalMonitor', label: '참석자 개인 모니터', instanced: true, sized: false, build: () => createPersonalMonitor() },
  prompter: { id: 'prompter', label: '중앙 프롬프터', instanced: true, sized: false, build: () => createPrompter() },
  // PHASE 5-c — 상황실 콘솔 AV. 콘솔 한 대에 모니터 2대 + 키보드 1개가 깔리므로
  //   **반드시 InstancedMesh**로 묶는다(계약의 요구).
  consoleMonitor: { id: 'consoleMonitor', label: '상황실 운용 모니터', instanced: true, sized: false, build: () => createConsoleMonitor() },
  keyboard: { id: 'keyboard', label: '키보드', instanced: true, sized: false, build: () => createKeyboard() },
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
