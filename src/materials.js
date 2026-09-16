// materials.js — 재질 라이브러리 '명세'. (순수 — THREE도 DOM도 쓰지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
// 여기에는 "이 재질은 얼마나 거칠고(roughness), 금속성이 있고(metalness),
// 무늬를 몇 mm 간격으로 반복하는가"만 적는다. 실제 Three.js 재질을 만드는 일은
// materials-gl.js가 한다. 나누는 이유는 가구 에셋과 같다 — 수치를 Node에서 검사하기 위해서다.
//
// 목표는 사진 같은 재현이 아니라 **Semi-realistic 건축 시각화**다.
//   · 무늬는 "있는지 없는지 겨우 알 정도"까지만 넣는다.
//   · 반사는 거의 없다 — 반짝이는 순간 LED보다 바닥·테이블이 먼저 눈에 들어온다.
//   · 무늬 반복 간격은 실제 마감재 규격을 쓴다(카펫 타일 500mm, 비닐 타일 600mm 등).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 재질 프리셋.
 *   roughness   0 = 거울, 1 = 완전 무광
 *   metalness   금속성. 실내 마감재는 사실상 전부 0이다.
 *   normalScale 요철 무늬의 세기. 0이면 무늬 없음. 0.3을 넘기지 않는다.
 *   tileMm      무늬 한 장의 실제 크기(mm). 0이면 무늬를 반복하지 않는다.
 *   texture     materials-gl이 만들 절차적 무늬의 종류(null이면 무늬 없음)
 */
export const MATERIAL_PRESETS = Object.freeze({
  // ① 도장 벽 — 아주 거칠고 반사가 없다. 미세한 요철만 준다.
  paintedWall: Object.freeze({
    id: 'paintedWall', label: '도장 벽',
    roughness: 0.96, metalness: 0, normalScale: 0.05, tileMm: 1500, texture: 'speckle',
  }),
  // ② 카펫 타일 — 회의실·강당 기본 바닥. 실제 규격 500 × 500mm.
  carpetTile: Object.freeze({
    id: 'carpetTile', label: '카펫 타일',
    roughness: 0.92, metalness: 0, normalScale: 0.28, tileMm: 500, texture: 'carpet',
  }),
  // ③ 비닐(장판) 바닥 — 강의실용. 카펫보다 조금 매끈하지만 플라스틱처럼 번들거리면 안 된다.
  vinylFloor: Object.freeze({
    id: 'vinylFloor', label: '비닐 바닥',
    roughness: 0.78, metalness: 0, normalScale: 0.08, tileMm: 600, texture: 'speckle',
  }),
  // ④ 목재 상판 — 결은 아주 옅게. 고급 가구 사진 같은 강한 결은 넣지 않는다.
  woodTable: Object.freeze({
    id: 'woodTable', label: '목재 상판',
    roughness: 0.62, metalness: 0, normalScale: 0.10, tileMm: 1400, texture: 'wood',
  }),
  // ⑤ 금속 프레임 — 의자 다리·책상 각관. 무광 분체도장이라 금속성은 낮게 잡는다.
  metalFrame: Object.freeze({
    id: 'metalFrame', label: '금속 프레임',
    roughness: 0.45, metalness: 0.35, normalScale: 0, tileMm: 0, texture: null,
  }),
  // ⑥ 패브릭 의자 — 직물. 요철은 있되 결이 보일 만큼은 아니다.
  fabricChair: Object.freeze({
    id: 'fabricChair', label: '패브릭 의자',
    roughness: 0.94, metalness: 0, normalScale: 0.18, tileMm: 220, texture: 'carpet',
  }),
  // ⑦ 무대 마감 — 무광 합판/카펫. 발밑이라 반사가 있으면 어색하다.
  stageSurface: Object.freeze({
    id: 'stageSurface', label: '무대 마감',
    roughness: 0.90, metalness: 0, normalScale: 0.12, tileMm: 900, texture: 'speckle',
  }),
});

/** STEP 3에서 준비한 재질 7종 — 보고·테스트용 목록. */
export const MATERIAL_IDS = Object.freeze([
  'paintedWall', 'carpetTile', 'vinylFloor', 'woodTable',
  'metalFrame', 'fabricChair', 'stageSurface',
]);

/** 공간 타입 → 바닥 마감. 강의실만 비닐, 나머지는 카펫. */
export function floorFinishFor(roomTypeId) {
  return roomTypeId === 'classroom' ? 'vinylFloor' : 'carpetTile';
}

/**
 * 무늬 반복 횟수 — 면의 실제 크기(unit)와 타일 크기(mm)로 정한다.
 * 화면 픽셀이 아니라 **실제 치수**를 기준으로 하므로, 방이 커지면 무늬도 그만큼 늘어난다
 * (확대되어 흐려지거나 반대로 촘촘해지지 않는다).
 */
export function tileRepeat(preset, widthUnits, depthUnits, mmPerUnit = 1000) {
  if (!preset || !preset.tileMm) return null;
  const t = preset.tileMm / mmPerUnit;
  return [Math.max(1, widthUnits / t), Math.max(1, depthUnits / t)];
}

/** 가구 부품 색 이름(kind) → 재질 프리셋 id. 색은 그대로 두고 질감만 입힌다. */
export const PART_MATERIAL = Object.freeze({
  tableTop: 'woodTable', tableBase: 'metalFrame', tableBeam: 'metalFrame',
  chairSeat: 'fabricChair', chairBack: 'fabricChair', chairBase: 'metalFrame', chairArm: 'metalFrame',
  seatFabric: 'fabricChair', seatFrame: 'metalFrame', seatArm: 'metalFrame',
  deskTop: 'woodTable', deskLeg: 'metalFrame', deskPanel: 'paintedWall', deskRail: 'metalFrame',
  consoleTop: 'woodTable', consoleBase: 'metalFrame', monitorBase: 'metalFrame',
  podium: 'paintedWall', podiumTop: 'woodTable',
  credenzaBody: 'paintedWall', credenzaDoor: 'paintedWall', credenzaTop: 'woodTable', credenzaToe: 'metalFrame',
  rug: 'carpetTile',
  riserTop: 'stageSurface', riserSide: 'stageSurface',
  plantPot: 'paintedWall',
});
