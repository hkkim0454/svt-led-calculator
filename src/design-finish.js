// design-finish.js — "이 공간 디자인은 바닥·벽·수납장을 어떤 마감으로 보여 주는가". (순수)
// ─────────────────────────────────────────────────────────────────────────────
// 가구는 `furniture-routing.js`가 "무엇을 세울지"를 정했다. 이 파일은 그 옆에서
// **"무엇으로 마감할지"**를 정한다. 구조도 같은 모양이다 — 요청(디자인)과 실제(재질)를 잇되,
// **없는 것을 있는 것처럼 다루지 않는다.**
//
// 세 가지를 분리한다. 섞으면 한 곳을 고칠 때 엉뚱한 공간이 같이 바뀐다.
//   재질(material)  질감 — 얼마나 거칠고, 무늬 간격이 몇 mm인가. materials.js가 주인이다.
//   색(palette)     그 공간 디자인이 고른 색. 여기서 정한다.
//   적용(이 파일)    어느 면에 그 둘을 붙이는가.
//
// **정식 재질(canonical)을 새로 만들지 않는다.** 기존 13종 + 별칭으로만 해결한다.
//   `carpetTileLight`·`paintedWallWhite`는 각각 `carpetTile`·`paintedWall`의 다른 이름이다.
//   같은 질감에 **디자인이 고른 색**을 입히는 것이 이 단계의 방식이다
//   (정식 재질의 수치를 바꾸면 그 재질을 쓰는 **다른 공간이 전부 같이 바뀐다**).
//
// 디자인이 정하지 않았거나(INHERIT) 아직 만들지 않은 값(planned)이면 **null을 돌려준다.**
//   렌더러는 null을 받으면 지금 하던 그대로 그린다 — 그래서 다른 공간이 흔들리지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

import { roomDesign, isPlanned } from './room-design.js?v=413';
import { resolveMaterialId } from './materials.js?v=413';

/**
 * 방 껍데기에서 마감이 붙는 자리.
 *   wallAccent 는 포인트 벽이다. **어느 벽이 포인트인지는 여기서 정하지 않는다** —
 *   그것은 방 좌표가 정하는 일이고(기존 동작), 여기는 '그 벽을 무슨 색으로'만 답한다.
 */
export const ROOM_FINISH_ROLES = Object.freeze([
  'floor', 'wallFront', 'wallSide', 'wallAccent', 'baseboard',
]);

/**
 * 바닥 계열 가구 부품. **러그는 바닥 마감의 일부다** —
 *   기존 대응표에서도 이미 카펫 질감(`PART_MATERIAL.rug = 'carpetTile'`)을 쓴다.
 *   바닥만 바꾸고 러그를 두면, 좌석 주변을 덮는 넓은 면이 옛 색으로 남아
 *   낮은 시점에서는 **바뀐 바닥이 거의 보이지 않는다**(실제로 검수에서 그렇게 나왔다).
 */
export const FLOOR_PARTS = Object.freeze(['rug']);

/** AV 수납장에서 마감이 붙는 부품. 기존 부품 그대로다 — 새 부품을 만들지 않는다. */
export const CREDENZA_PARTS = Object.freeze([
  'credenzaBody', 'credenzaDoor', 'credenzaTop', 'credenzaToe',
]);

/**
 * **디자인이 고른 색.** 재질(질감)과 따로 둔다 —
 *   같은 카펫 질감이라도 대기업 회의실은 중간 회색, 상황실은 짙은 회색이다.
 *
 * 대기업 회의실 색을 고른 기준(오너 제공 실제 설계 이미지):
 *   · 벽은 **푸른 기가 도는 흰색이 아니라 약간 따뜻한 오프화이트**다. 순백(#ffffff)은 쓰지 않는다 —
 *     넓은 면이 하얗게 날아가면 LED가 화면의 주인공 자리를 뺏긴다.
 *   · 바닥은 벽보다 확실히 어두운 **중간 회색**이다. 지금처럼 벽과 밝기가 비슷하면
 *     카펫 요철이 아무리 있어도 '빈 회색 판'으로 읽힌다.
 *   · 수납장은 **AV 장비**다. 의자(그라파이트)와 같은 검정 덩어리로 뭉치지 않도록 더 어둡게,
 *     다만 순수 검정은 아니다 — 새까맣게 칠하면 모서리와 형태가 죽는다.
 */
export const DESIGN_PALETTES = Object.freeze({
  corporateNeutral: Object.freeze({
    id: 'corporateNeutral', label: '대기업 중성 마감',
    floor: '#b9bab8',        // 중간 밝기의 중성 회색 카펫 — 벽과 확실히 갈린다
    wallFront: '#f1efea',    // LED가 붙는 정면 벽. 따뜻한 오프화이트
    wallSide: '#eae7e1',     // 옆벽은 한 단 낮춰 모서리가 읽히게
    wallAccent: '#e5e1da',   // 포인트 벽도 **절제**한다(기업 기본은 강한 악센트를 쓰지 않는다)
    baseboard: '#dedad2',    // 걸레받이 — 벽과 바닥 사이를 잇는 한 줄
    credenzaBody: '#262a30',
    credenzaDoor: '#1f2328',
    credenzaTop: '#343940',  // 상판만 한 단 밝게 — 수평면이 빛을 받아 형태가 살아난다
    credenzaToe: '#15181c',  // 바닥에 닿는 굽은 가장 어둡게(그늘진 자리)
    rug: '#c6c5c1',          // 좌석 구역 러그 — 바닥보다 아주 조금만 밝게(같은 계열, 톤만 다르게)
  }),
});

/** 팔레트 이름 → 색 묶음. 모르는 이름이면 null. */
export function designPalette(id) {
  return (typeof id === 'string' && DESIGN_PALETTES[id]) || null;
}

// `planned('...')`(아직 없음)과 INHERIT(null)을 걸러 **실제 재질 이름만** 남긴다.
//   별칭(`carpetTileLight`)은 그대로 돌려준다 — 정식 id로 바꾸는 일은 어댑터의 몫이고,
//   여기서 미리 바꿔 버리면 "디자인이 무엇을 골랐는지"가 기록에서 사라진다.
function materialName(v) {
  if (isPlanned(v) || typeof v !== 'string' || !v) return null;
  return resolveMaterialId(v) ? v : null;      // 정식 id로 풀리지 않는 이름은 없는 것으로 친다
}

const finish = (material, color) => (material && color
  ? Object.freeze({ material, color, canonical: resolveMaterialId(material) })
  : null);

// 디자인에서 재질·팔레트를 함께 꺼낸다. 둘 중 하나라도 없으면 마감을 적용하지 않는다.
function sourcesOf(designId) {
  const d = roomDesign(designId);
  const pal = designPalette(d.palette);
  if (!pal || !d.materials) return null;
  return { m: d.materials, pal };
}

/**
 * 방 껍데기(바닥·벽·걸레받이)의 마감.
 * @returns {null|Object} 자리 이름 → `{ material, color, canonical }`.
 *   디자인이 마감을 정하지 않았으면 **null** = 지금 그리던 그대로.
 *   정한 자리만 들어 있다 — 없는 자리는 렌더러가 기존 값을 쓴다.
 */
export function roomFinishForDesign(designId) {
  const src = sourcesOf(designId);
  if (!src) return null;
  const floorMat = materialName(src.m.floor);
  const wallMat = materialName(src.m.wall);
  const out = {};
  if (floorMat) {
    const f = finish(floorMat, src.pal.floor);
    if (f) out.floor = f;
  }
  if (wallMat) {
    // 벽 계열은 질감이 하나다 — 도장 벽. 자리마다 다른 것은 **색**뿐이다.
    for (const role of ['wallFront', 'wallSide', 'wallAccent', 'baseboard']) {
      const f = finish(wallMat, src.pal[role]);
      if (f) out[role] = f;
    }
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * AV 수납장의 마감. **형상은 그대로 두고 마감만 갈아 끼운다** —
 *   같은 수납장이 다른 공간에서도 쓰이므로 자산 자체의 색을 바꾸면 그 공간들이 같이 바뀐다.
 *   같은 형상 + 공간별 다른 마감. 임원 회의실도 같은 방식으로 붙일 수 있다.
 * @returns {null|Object} 부품 이름 → `{ material, color, canonical }`.
 */
export function floorPartFinishForDesign(designId) {
  const src = sourcesOf(designId);
  if (!src) return null;
  // 러그는 **바닥과 같은 질감**을 쓴다. 디자인이 바닥을 정했을 때만 함께 따라간다.
  const mat = materialName(src.m.floor);
  if (!mat) return null;
  const out = {};
  for (const part of FLOOR_PARTS) {
    const f = finish(mat, src.pal[part]);
    if (f) out[part] = f;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

export function credenzaFinishForDesign(designId) {
  const src = sourcesOf(designId);
  if (!src) return null;
  const body = materialName(src.m.credenza);
  if (!body) return null;
  // 상판은 한 단 밝은 그라파이트로 둔다 — 전부 같은 검정이면 수평면이 사라져 덩어리로 보인다.
  const byPart = { credenzaBody: body, credenzaDoor: body, credenzaTop: 'darkGraphite', credenzaToe: body };
  const out = {};
  for (const part of CREDENZA_PARTS) {
    const f = finish(materialName(byPart[part]), src.pal[part]);
    if (f) out[part] = f;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/** 그 디자인의 마감 상태 한눈에 보기(검증·디버깅용). */
export function finishStatusForDesign(designId) {
  const room = roomFinishForDesign(designId);
  const credenza = credenzaFinishForDesign(designId);
  const floorParts = floorPartFinishForDesign(designId);
  return Object.freeze({
    palette: roomDesign(designId).palette || null,
    room: room ? Object.freeze(Object.keys(room)) : null,
    credenza: credenza ? Object.freeze(Object.keys(credenza)) : null,
    floorParts: floorParts ? Object.freeze(Object.keys(floorParts)) : null,
  });
}
