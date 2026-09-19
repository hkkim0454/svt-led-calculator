// control-walls.js — 상황실 '벽 구성'(유리 파티션 + 흡음 구역) 계획. 순수 함수, DOM·Three.js 없음.
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 답하는 질문은 하나다. **"상황실에서 유리 파티션을 어디에, 얼마나 크게 세우는가."**
// 그리기는 render3d-gl.js가 하고, 여기서는 '의미 있는 서술'(descriptor)만 돌려준다.
//
// 왜 따로 두는가 (PHASE 5 로드맵 §0.2)
//   · 유리 파티션은 **방 껍데기(벽)를 대신하는 물건이 아니다.** 방 안에 따로 서는 물건이다.
//     그래서 기본으로 꺼져 있는 오른쪽 벽(`wallRight`)을 억지로 켜서 대신 쓰지 않는다.
//   · 자리와 치수를 화면(DOM) 코드나 가구 배치에 섞지 않는다. 섞으면 Node에서 검사할 수 없고,
//     나중에 배치를 손볼 때 파티션이 조용히 따라 움직인다.
//
// 좌표계는 room-presets.js와 같다 (단위 mm)
//   X : 0 = 방 왼쪽 벽 → W = 오른쪽 벽
//   Z : 0 = LED가 붙은 정면 벽 → D = 방 뒤쪽
//
// ── 오너 결정(2026-09-18, DEC-122) ──────────────────────────────────────────
//   유리 파티션은 **오른쪽(x = W 쪽)**, 흡음 마감은 **왼쪽 벽(x = 0)의 방 안쪽 면**이다.
//   참고 이미지는 '유리 파티션과 어두운 흡음 벽이 있다'는 사실까지만 말해 주고,
//   **어느 쪽이 유리이고 어느 쪽이 흡음인지는 확정해 주지 않는다.** 위 좌우 배치는
//   V1을 위한 오너 승인 설계 결정이지 이미지에서 읽어낸 사실이 아니다.
// ─────────────────────────────────────────────────────────────────────────────

import { roomDesign, isPlanned } from './room-design.js?v=443';
import { FURNITURE } from './room-presets.js?v=443';
import { FURNITURE_CONTRACTS } from './furniture-contracts.js?v=443';
import { consoleMonitorSize, keyboardSize } from './control-av.js?v=443';

/**
 * 이 파일이 만드는 벽 구성 계획의 이름.
 *   **어느 공간이 이 계획을 쓰는지는 여기서 정하지 않는다** — 공간 디자인이 자기
 *   `wallTreatment` 에 이 이름을 적어 고른다(`room-design.js`가 단일 출처다).
 *   두 곳에 적어 두면 한쪽만 고쳤을 때 조용히 어긋난다.
 */
export const CONTROL_WALL_PLAN = 'controlWalls';

/** 실재하는 벽 구성 계획 전부. 디자인이 적은 이름이 여기에 없으면 '가짜 스펙'이다. */
export const WALL_PLAN_IDS = Object.freeze([CONTROL_WALL_PLAN]);

/** 이 디자인이 상황실 벽 구성을 쓰는가. */
export function wantsControlWalls(designId) {
  const d = roomDesign(designId);
  return !isPlanned(d?.wallTreatment) && d?.wallTreatment === CONTROL_WALL_PLAN;
}

/**
 * 유리 파티션의 두께(mm). 실제 사무용 강화유리 파티션 규격이다(10~12mm).
 * **화면에서 잘 보이게 하려고 부풀리지 않는다**(오너 지침 §5).
 */
export const GLASS_THK = 12;

/**
 * 유리를 잡아 주는 **프레임**(mm). 실제 사무용 시스템 파티션의 구성 그대로다.
 *   바닥 트랙 · 상부 헤드레일 · 열린 쪽 끝을 마감하는 수직 포스트 세 가지다.
 *
 * 왜 필요한가 — 프레임 없이 유리만 세우면 **화면에서 읽히지 않는다.** 실측하면
 *   아이소메트릭 시점에서 유리가 바꾸는 픽셀이 전체의 4%인데, 투명도 0.16에
 *   밝은 벽을 배경으로 두어 눈으로는 구분되지 않았다. 유리를 진하게 만들거나
 *   자리를 안쪽으로 당기면 읽히기야 하겠지만, 그것은 오너가 금지한 '과장'이다
 *   (오너 지침 §5·§6). 실제 파티션에 있는 프레임을 세우는 쪽이 정직하다.
 *
 * 마감은 콘솔 하부와 같은 계열(짙은 그라파이트)이다. 실제 제품도 애노다이즈드
 *   블랙 알루미늄이 표준이고, 방 안에서 콘솔과 한 덩어리로 읽혀야 튀지 않는다.
 */
export const FRAME = Object.freeze({
  material: 'darkGraphite',
  finishRole: 'consoleBase',   // 색은 그 공간 팔레트의 콘솔 하부 색을 따라간다
  railH: 60,                   // 바닥 트랙 · 상부 헤드레일의 높이
  railW: 40,                   // 그 폭(유리 두께보다 조금 넓다)
  postW: 50,                   // 열린 쪽 끝 수직 포스트의 한 변
});

/**
 * 파티션 오른쪽에 남는 '브리핑 구역'의 폭 한계(mm).
 *   최소 = 통로 폭(`FURNITURE.aisleW`, 1,200mm). 사람이 지나갈 수 있는 최소 폭이다.
 *          이보다 좁으면 구역이 아니라 벽과 유리 사이의 틈일 뿐이라 파티션을 세우지 않는다.
 *   최대 = 그 두 배(2,400mm). 브리핑용 의자·스탠딩 테이블이 들어가는 폭이고,
 *          여기서 더 키우면 파티션이 운용 구역 쪽으로 필요 이상 들어온다.
 * 두 값 모두 **기존 상수에서 끌어온다** — 새 장식 치수를 만들지 않는다.
 */
export const BRIEF_ZONE_MIN = FURNITURE.aisleW;
export const BRIEF_ZONE_MAX = FURNITURE.aisleW * 2;

/**
 * 운용 구역(콘솔·의자·AV·뒤 테이블)과 유리 사이에 반드시 두는 여유(mm).
 * 벽에서 가구를 띄우는 기존 기준(`FURNITURE.wallClear`)을 그대로 쓴다 —
 * 운용자에게 유리는 벽과 같은 것이라 여유도 같아야 한다.
 */
export const OPERATOR_CLEAR = FURNITURE.wallClear;

/**
 * 파티션이 시작하는 깊이(mm). LED 벽 앞 여유(`FURNITURE.frontClear`)와 같은 자리다.
 *   · LED 벽과 그 앞 여유 구역에는 **아무것도 세우지 않는다**(오너 지침 §3 — LED가 주인공).
 *   · 끝은 뒷벽(z = D)이다. 한쪽 끝이 벽에 닿아야 떠 있는 판으로 보이지 않는다.
 */
export const GLASS_Z_FROM = FURNITURE.frontClear;

/** 이보다 짧으면 구역을 나누는 구실을 못 하므로 세우지 않는다. 콘솔 줄 간격 한 칸이 기준이다. */
export const GLASS_MIN_LENGTH = FURNITURE.consolePitchZ;

/**
 * 배치 항목의 **반폭**(mm). `w`를 들고 다니는 항목은 그 값을 쓰고,
 * 들고 다니지 않는 항목(의자·모니터·키보드)은 **계약에 적힌 실제 치수**를 쓴다.
 * 여기에 없는 항목은 폭을 모른다는 뜻이라 `null`을 돌려준다(추정값을 지어내지 않는다).
 */
export function halfWidthOf(item) {
  if (!item) return null;
  if (Number.isFinite(item.w) && item.w > 0) return item.w / 2;
  switch (item.type) {
    case 'chair': return FURNITURE_CONTRACTS.taskChair.dimensions.overallW / 2;
    case 'monitor': return consoleMonitorSize().panelW / 2;   // 베젤까지 포함한 실제 폭
    case 'keyboard': return keyboardSize().w / 2;
    default: return null;
  }
}

/**
 * 운용 구역으로 세지 **않는** 항목. 장식이라 파티션 너머(브리핑 구역)에 있어도 된다.
 *   러그는 바닥 마감이고, 화분은 방 뒤 구석 장식이다.
 */
export const NON_OPERATION_TYPES = Object.freeze(['rug', 'plant']);

/**
 * 운용 구역의 오른쪽 끝(mm). 콘솔·의자·AV·뒤 테이블·단(riser)을 모두 포함한 실제 값이다.
 * @returns {{ right:number, unknown:string[] }} unknown = 폭을 모르는 항목 종류.
 */
export function operatorZoneRight(items = []) {
  let right = 0;
  const unknown = new Set();
  for (const it of items || []) {
    if (!it || !Number.isFinite(it.x)) continue;
    if (NON_OPERATION_TYPES.includes(it.type)) continue;
    const half = halfWidthOf(it);
    if (half === null) { unknown.add(String(it.type)); continue; }
    right = Math.max(right, it.x + half);
  }
  return { right, unknown: Object.freeze([...unknown]) };
}

/**
 * 상황실 벽 구성 계획.
 *
 * @param W,D,H 방 안쪽 치수(mm)
 * @param design 공간 디자인 id. 상황실이 아니면 **아무것도 만들지 않는다**(null 계획).
 * @param items  room-presets가 만든 배치 결과. **읽기만 한다** — 한 자리도 바꾸지 않는다.
 * @returns {{ designId, glass, partitions, acousticSide, zone, operatorRight, notes }}
 *   glass      null이거나 파티션 서술 하나 `{ id, role, material, x, z, y, w, d, h, axis }`
 *   partitions 파티션 서술 목록(지금은 유리 하나. 앞으로 늘어날 수 있어 목록으로 둔다)
 *   zone       유리 오른쪽에 생기는 브리핑 구역의 범위(검증·보고용)
 *   notes      세우지 못했으면 그 이유를 사람이 읽을 수 있게 적는다
 */
export function controlWallPlan({ W, D, H, design, items = [] } = {}) {
  const none = (notes = []) => Object.freeze({
    designId: design || null, glass: null, frames: Object.freeze([]), partitions: Object.freeze([]),
    acousticSide: wantsControlWalls(design) ? ACOUSTIC_WALL_SIDE : null,
    zone: null, operatorRight: null, notes: Object.freeze(notes),
  });
  if (!wantsControlWalls(design)) return none();
  if (!(W > 0 && D > 0 && H > 0)) return none(['방 치수를 알 수 없어 파티션을 세우지 않았습니다.']);

  const notes = [];
  const { right, unknown } = operatorZoneRight(items);
  if (unknown.length) notes.push(`폭을 알 수 없는 배치 항목이 있어 계산에서 뺐습니다: ${unknown.join(', ')}`);

  // 오른쪽 벽까지 남은 폭에서 운용 구역 여유를 뺀 만큼이 브리핑 구역이 될 수 있다.
  const free = W - right;
  const strip = Math.min(BRIEF_ZONE_MAX, free - OPERATOR_CLEAR);
  if (!(strip >= BRIEF_ZONE_MIN)) {
    notes.push(`오른쪽에 남는 폭이 ${Math.max(0, Math.round(free))}mm뿐이라 유리 파티션을 세우지 않았습니다.`);
    return none(notes);
  }
  const length = D - GLASS_Z_FROM;
  if (!(length >= GLASS_MIN_LENGTH)) {
    notes.push(`방 깊이가 ${Math.round(D)}mm로 짧아 유리 파티션을 세우지 않았습니다.`);
    return none(notes);
  }

  // `strip` 은 **유리의 운용 구역 쪽 표면**에서 오른쪽 벽까지의 폭이다.
  //   중심선이 아니라 표면을 기준으로 잡아야 '가구에서 800mm 떨어졌다'가 실제로 성립한다.
  const xFace = W - strip;
  const x = xFace + GLASS_THK / 2;           // 서술은 중심 좌표로 준다(배치 항목과 같은 규약)
  const glass = Object.freeze({
    id: 'controlGlassPartition',
    role: 'partition',
    material: 'glassPartition',
    axis: 'z',                               // 방 깊이 방향으로 이어진다
    x, z: GLASS_Z_FROM + length / 2, y: 0,   // y = 0 = 바닥에서 시작한다
    w: GLASS_THK, d: length, h: H,           // 두께(X) · 길이(Z) · 높이(Y)
  });
  // 프레임 — 유리와 **같은 자리**에 선다. 자리를 따로 정하지 않으므로 유리를 옮겨도 따라온다.
  const frame = (id, y, w, d, h, dz = 0) => Object.freeze({
    id, role: 'partitionFrame', material: FRAME.material, finishRole: FRAME.finishRole,
    axis: 'z', x, z: glass.z + dz, y, w, d, h,
  });
  const frames = [
    frame('controlGlassTrack', 0, FRAME.railW, length, FRAME.railH),                  // 바닥 트랙
    frame('controlGlassHead', H - FRAME.railH, FRAME.railW, length, FRAME.railH),     // 상부 헤드레일
    // 열린 쪽(LED 쪽) 끝을 마감하는 수직 포스트. 여기가 브리핑 구역의 출입구가 된다.
    frame('controlGlassPost', 0, FRAME.postW, FRAME.postW, H, -(length - FRAME.postW) / 2),
  ];
  return Object.freeze({
    designId: design,
    glass,
    frames: Object.freeze(frames),
    partitions: Object.freeze([glass, ...frames]),
    acousticSide: ACOUSTIC_WALL_SIDE,
    zone: Object.freeze({ xFrom: xFace + GLASS_THK, xTo: W, zFrom: GLASS_Z_FROM, zTo: D, w: strip - GLASS_THK }),
    operatorRight: right,
    notes: Object.freeze(notes),
  });
}

/**
 * 흡음(다크) 마감을 입히는 벽. **왼쪽 벽의 방 안쪽 면**이다(오너 결정 §2).
 *   새 벽 형상을 만들지 않고, 이미 있는 '포인트 벽' 자리를 그대로 쓴다.
 *   포인트 벽이 왼쪽이라는 사실 자체는 기존 동작(`ACCENT_WALL_SIDE`)이고 여기서 바꾸지 않는다.
 */
export const ACOUSTIC_WALL_SIDE = 'left';

/**
 * 파티션과 배치 항목 사이의 **최소 X 거리**(mm). 검증·보고용이다.
 *   0보다 작으면 파고든 것이고, 여기서는 그런 계획을 만들지 않는다.
 * @returns {null|{ gap:number, item:Object }} 파티션이 없으면 null.
 */
export function partitionClearance(plan, items = []) {
  const g = plan?.glass;
  if (!g) return null;
  let best = null;
  for (const it of items || []) {
    if (!it || !Number.isFinite(it.x)) continue;
    if (NON_OPERATION_TYPES.includes(it.type)) continue;
    const half = halfWidthOf(it);
    if (half === null) continue;
    const gap = Math.abs(it.x - g.x) - half - g.w / 2;
    if (!best || gap < best.gap) best = { gap, item: it };
  }
  return best;
}
