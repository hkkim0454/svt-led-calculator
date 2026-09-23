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

import { roomDesign, isPlanned } from './room-design.js?v=451';
import { resolveMaterialId, finishForPart } from './materials.js?v=451';

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

/**
 * 테이블에서 **공간 디자인이 마감을 정하는** 부품.
 *   임원 U 테이블 전용 이름이다(PHASE 3-b에서 그렇게 지었다) — 기존 `tableTop`·`tableBase`와
 *   겹치지 않으므로 여기에 색을 붙여도 회의 테이블·강의용 책상은 영향을 받지 않는다.
 */
export const TABLE_PARTS = Object.freeze(['boardroomTop', 'boardroomBase']);

/**
 * 대회의실 U 테이블의 부품(PHASE 4-d.1). 임원과 **이름을 나눠 둔 이유**는 같다 —
 *   이름이 겹치면 한 공간의 마감을 정하는 순간 다른 공간의 테이블까지 따라 바뀐다.
 */
export const CONFERENCE_TABLE_PARTS = Object.freeze(['conferenceTop', 'conferenceBase']);

/** 마감이 붙는 테이블 부품 전부. **어느 공간에 붙는지는 팔레트가 정한다**(색이 없으면 안 붙는다). */
export const ALL_TABLE_PARTS = Object.freeze([...TABLE_PARTS, ...CONFERENCE_TABLE_PARTS]);

/**
 * 상황실 곡선 콘솔의 부품(PHASE 5-d.1). 이름이 다른 공간과 겹치지 않는 것은 같은 이유다 —
 *   겹치면 상황실 마감을 정하는 순간 다른 공간의 가구까지 따라 바뀐다.
 *   **PHASE 5-b 까지 이 두 이름은 어느 마감표에도 없어서** 옛 대응표(woodTable·metalFrame)로 떨어졌다.
 *   그 결과 상판이 거의 흰색(#f3f6f9), 하부가 밝은 청회색 금속(#9ba6b4)이었다 — 실측으로 확인.
 */
export const CONSOLE_PARTS = Object.freeze(['consoleTop', 'consoleBase']);

/**
 * AV 장비에서 마감이 붙는 부품(PHASE 4-d.1).
 *   전부 대회의실 전용 자산(개인 모니터·중앙 프롬프터)의 부품이라 다른 공간과 겹치지 않는다.
 *   그래도 **디자인이 색을 정한 공간에서만** 갈아 끼운다 — 전역 재질을 바꾸지 않는 것이 규칙이다.
 */
export const AV_PARTS = Object.freeze(['monitorBody', 'monitorStand', 'prompterBody', 'screen']);

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

  /**
   * **임원 회의실 — 밝고 절제된 프리미엄.** (PHASE 3-c)
   *
   * 가장 흔한 오해부터 적어 둔다 — **'임원실'이라고 어둡게 만들지 않는다.**
   *   어두운 월넛과 짙은 벽은 20년 전 임원실이다. 오너가 준 실제 대표이사 회의실 사진은
   *   흰 벽 · 밝은 회색 카펫 · 밝은 나무 테이블 · 검정 하이백 의자 · 와이드 LED다.
   *
   * 대기업 회의실(corporateNeutral)과의 관계 — **다른 건물이 아니라 같은 회사의 윗층**이다.
   *   같은 계열을 유지하되 한 단씩만 움직인다: 벽은 조금 더 밝고 따뜻하게,
   *   바닥은 조금 더 밝게, 수납장은 완전한 검정 대신 한 단 밝은 차콜로.
   *   차이를 크게 주면 두 공간이 서로 다른 프로젝트처럼 보인다.
   *
   *   대기업 → 임원 (같은 자리끼리)
   *     바닥   #b9bab8 → #c3c1bc   한 단 밝게, 초록기를 빼고 아주 살짝 따뜻하게
   *     정면벽 #f1efea → #f4f1ec   더 밝은 웜 오프화이트(순백은 아니다 — LED가 주인공이어야 한다)
   *     수납장 #262a30 → #33373d   새까만 장비 상자가 아니라 **프리미엄 AV 가구**로 읽히게
   */
  executiveBright: Object.freeze({
    id: 'executiveBright', label: '임원 밝은 프리미엄 마감',
    floor: '#c3c1bc',        // 밝은 중성 회색 카펫 — 의자·테이블을 받쳐 주되 튀지 않는다
    wallFront: '#f4f1ec',    // LED가 붙는 정면 벽
    wallSide: '#eeeae3',
    wallAccent: '#e3ded4',   // 포인트 벽 — 색이 아니라 **질감**으로만 차이를 준다(아래 wallAccent 재질)
    baseboard: '#e2ddd3',
    // 임원 U 테이블 — 이 두 자리가 이 공간의 인상을 만든다.
    boardroomTop: '#dbcdb6',   // 페일 오크/애시. 채도를 낮춰 **주황·노랑기를 뺀다**(§6)
    boardroomBase: '#34383e',  // 짙은 그라파이트. 순수 검정도, 금속 광택도 아니다(§7)
    // AV 수납장 — 의자(#3a3e44)보다 아주 조금 밝고 더 매트하게. 검은 덩어리로 뭉치지 않게.
    credenzaBody: '#33373d',
    credenzaDoor: '#2c3036',
    credenzaTop: '#3d424a',  // 상판만 한 단 밝게 — 수평면이 빛을 받아 형태가 살아난다
    credenzaToe: '#1e2126',
    // 러그 — 오너가 준 Reference는 **전체 카펫**이고 따로 깔린 러그가 없다.
    //   배치가 주는 러그를 없애지는 않되(형상·크기·위치는 동결), 바닥과 거의 같은 톤으로
    //   낮춰 '파란 판때기'가 좌석 구역을 가르지 않게 한다(§9).
    rug: '#c7c5bf',
  }),

  /**
   * **대회의실 — 밝고 넓은 운영형 AV 공간.** (PHASE 4-d.1)
   *
   * 임원 회의실과 무엇이 다른가 — **재료가 아니라 성격**이다.
   *   임원은 페일 오크 상판 + 흡음 패널 포인트 벽으로 '정제된 프리미엄'을 만든다.
   *   대회의실은 결이 거의 없는 **라이트 애시 작업면** + 평범한 도장 벽이다.
   *   참석자가 30명이고 좌석마다 모니터가 놓이는 방에서는, 마감이 조용할수록 장비가 읽힌다.
   *
   * 대기업 회의실(corporateNeutral)과도 갈린다 — **같은 회사의 큰 방**이다.
   *   벽·바닥을 한 단 밝혀 넓어 보이게 하고, 상판은 대기업 라미네이트보다 살짝 낮춰
   *   **벽이 가장 밝고 상판이 그다음**이 되게 한다(넓은 상판이 벽보다 밝으면 LED가 묻힌다).
   *
   *   대기업 → 대회의실 (같은 자리끼리)
   *     바닥   #b9bab8 → #c0c1c0   한 단 밝게, 중성으로(넓은 바닥에 색기가 돌면 얼룩처럼 보인다)
   *     정면벽 #f1efea → #f3f1ed   더 밝은 중성 오프화이트(순백은 아니다)
   *     상판   #e9e4da → #e2ddd1   **한 단 낮춘다** — 12m 상판은 면적이 커서 같은 값이면 더 밝게 보인다
   */
  conferenceBright: Object.freeze({
    id: 'conferenceBright', label: '대회의실 밝은 운영 마감',
    floor: '#c0c1c0',        // 밝은 중성 회색 카펫. 의자 30개를 받치되 튀지 않는다
    wallFront: '#f3f1ed',    // LED가 붙는 정면 벽 — 화면에서 가장 밝은 면
    wallSide: '#ece9e4',
    wallAccent: '#e4e0d9',   // 포인트 벽도 **색 한 단**만. 질감으로 꾸미지 않는다(임원과 갈리는 지점)
    baseboard: '#e0dcd5',
    // 대형 U 테이블 — 이 두 자리가 '운영형 회의실'의 인상을 만든다.
    conferenceTop: '#e2ddd1',   // 라이트 애시. 임원 오크(#dbcdb6)보다 밝고 노랑기가 없다
    conferenceBase: '#3a3f46',  // 짙은 그라파이트. 순수 검정도, 금속 광택도 아니다
    // AV 장비 — **검은 띠로 뭉치면 실패다.** 전역값보다 한 단 밝혀 모니터 하나하나가 읽히게 한다.
    monitorBody: '#262b31',
    monitorStand: '#2e343b',   // 본체보다 아주 살짝 밝게 — 받침이 본체에 먹히지 않게
    prompterBody: '#262b31',   // 모니터와 같은 계열 = 같은 AV 장비로 읽힌다
    screen: '#181f2a',         // 꺼진 화면. 푸른기가 아주 약간 도는 검정 — **LED보다 어둡게** 유지한다
    // AV 수납장 — LED 아래 낮은 장비 가구. 흰 상자로 남으면 정면이 두 덩어리로 갈린다.
    credenzaBody: '#2b3037',
    credenzaDoor: '#252a30',
    credenzaTop: '#353b43',
    credenzaToe: '#1a1e23',
    // 러그 — Reference는 전체 카펫이다. 바닥과 거의 같은 톤으로 두어 구역을 가르지 않게 한다.
    rug: '#c4c5c3',
  }),

  /**
   * **상황실 — 차분한 테크니컬 그레이.** (PHASE 5-d.1)
   *
   * 회의실 3종과 무엇이 다른가 — **밝기의 방향**이다.
   *   회의실은 벽·바닥·상판이 모두 밝은 오프화이트 계열이고, 장비가 그 위에 얹힌다.
   *   상황실은 **바닥이 확실히 내려간다**(카펫 타일 어두움). 하루 종일 화면을 보는 방이라
   *   바닥이 밝으면 시선이 아래로 끌리고, 무엇보다 **LED와 콘솔 화면이 묻힌다.**
   *
   * 그렇다고 어둡게 만들지 않는다(§6).
   *   · 벽·천장은 여전히 밝다 — 새까만 방은 관제실이 아니라 영화 세트다.
   *   · 바닥도 **검정이 아니라 짙은 회색**이다. 검정으로 내리면 의자 실루엣이 바닥에 먹힌다
   *     (의자 프레임이 #3a3e44 다 — 바닥이 그보다 어두우면 다리가 사라진다).
   *   · 파랑·청록 기를 넣지 않는다. 그 순간 게이밍/네온 NOC 이 된다.
   *
   *   대회의실 → 상황실 (같은 자리끼리)
   *     바닥   #c0c1c0 → #8d9095   **세 단 아래**. 이 한 자리가 상황실의 정체성이다
   *     정면벽 #f3f1ed → #ebedef   웜 오프화이트 → 중성 그레이(따뜻한 기를 뺀다)
   *     상판   #e2ddd1 → #d7dadd   나무결 애시 → **중성 테크니컬 라미네이트**
   *
   * 콘솔 상·하부는 이 공간의 인상을 만드는 두 자리다.
   *   상판은 벽보다 **한 단 어둡게** 둔다 — 1.8m 상판이 8대 깔리므로 벽보다 밝으면 방이 뒤집힌다.
   *   하부는 짙은 그라파이트. 의자와 같은 계열이라 **콘솔과 의자가 한 덩어리로 읽힌다**(§6).
   */
  // ⑤ 교육장 · 트레이닝룸 — PHASE 7-a. **색은 짐작이 아니라 실측에서 나왔다.**
  //   고치기 전 강의실을 재면 바닥 229.1 · 벽 223.4 로 **바닥이 벽보다 밝았다**(차이 5.7).
  //   대기업 회의실은 바닥 183.5 · 벽 194.7 로 바닥이 벽보다 어둡다 — 위계가 거꾸로였다.
  //   책상 상판은 249.6 으로 날아가기 직전(250)이었고, 의자는 민트(#cbdad7) 196.4 라
  //   '기업 교육장'이 아니라 '학교 교실'로 읽혔다.
  //   목표는 **대기업 회의실과 같은 위계, 교육장다운 밝기**다 — 벽보다 바닥을 어둡게,
  //   상판을 날아가는 선에서 확실히 떼어 놓고, 의자에서 색기를 뺀다.
  trainingNeutral: Object.freeze({
    id: 'trainingNeutral', label: '교육장 중성 마감',
    floor: '#b0b2af',        // 중간 밝기 중성 카펫 — 벽보다 어둡다(위계를 바로잡는 자리)
    wallFront: '#e0ddd8',    // LED가 붙는 정면 벽. 푸른 기를 빼고 중성 오프화이트로
    wallSide: '#dedbd5',     // 옆벽은 한 단 낮춰 모서리가 읽히게
    // 포인트 벽을 **쓰지 않는다**(7-a 범위). 옆벽과 같은 색을 줘서 예전 세이지 틴트를 지운다.
    wallAccent: '#dedbd5',
    baseboard: '#cfccc5',
    // 교육용 책상 — 상판은 벽보다 조금 밝되(수평면이라 빛을 받는다) 날아가지 않는다.
    deskTop: '#d7d3cc',
    deskLeg: '#454a51',      // 짙은 그라파이트 다리 — 상판이 떠 보이게 하는 대비
    deskRail: '#454a51',
    deskPanel: '#c0c3c6',    // 가림판은 큰 세로면이라 다리보다 밝게 — 무거워 보이지 않게
    // 교육용 의자 — **민트를 뺀다.** 대기업 의자(49)만큼 어둡게 가지 않는다:
    //   교육장은 밝아야 하고, 의자가 바닥(188)에 묻히지 않을 만큼만 낮춘다.
    chairSeat: '#8f9499',
    chairBack: '#8f9499',
    seatFrame: '#4a4f56',
    // 교탁 — 상판은 책상과 **같은 색**이어야 같은 방의 가구로 읽힌다(§6).
    podium: '#dedbd5',
    podiumTop: '#d7d3cc',
  }),

  controlPalette: Object.freeze({
    id: 'controlPalette', label: '상황실 테크니컬 그레이 마감',
    floor: '#8d9095',        // 짙은 테크니컬 카펫 타일. 검정이 아니다 — 의자 실루엣이 살아야 한다
    wallFront: '#ebedef',    // LED가 붙는 정면 벽. 중성 그레이(회의실의 웜 오프화이트가 아니다)
    wallSide: '#e3e6e9',
    // 왼쪽 벽 안쪽 면 = 흡음(다크) 구역(PHASE 5-d.2). 여기 하나만 어둡게 간다.
    //   콘솔 하부(#343a41)보다는 확실히 밝게 둔다 — 같은 어둠이면 콘솔이 벽에 묻혀
    //   형태가 사라진다(§6 '검정 위 검정' 금지). 바닥(#8d9095)보다는 어두워야
    //   '벽면 흡음 마감'으로 읽힌다.
    wallAccent: '#5a6068',
    baseboard: '#d2d6da',
    // 곡선 콘솔 — 이 두 자리가 '기업 관제실'의 인상을 만든다.
    consoleTop: '#d7dadd',   // 중성 테크니컬 라미네이트. 벽보다 한 단 어둡다
    consoleBase: '#343a41',  // 짙은 그라파이트. 의자와 같은 계열 = 한 덩어리로 읽힌다
    // 러그는 상황실 배치에 없다(layoutControl 이 깔지 않는다) — 색을 두지 않는다.
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

// 부품 마감표(PART_FINISH)가 그 부품의 거칠기·금속성을 이미 정해 두었으면 **그대로 나른다.**
//   디자인이 바꾸는 것은 '무슨 재질에 무슨 색'이지 '얼마나 번들거리는가'가 아니다 —
//   여기서 빠뜨리면 디자인을 켜는 순간 그 부품만 조용히 반질반질해진다.
const finish = (material, color, partId) => {
  if (!material || !color) return null;
  const base = partId ? finishForPart(partId) : null;
  const out = { material, color, canonical: resolveMaterialId(material) };
  if (base && typeof base.roughness === 'number') out.roughness = base.roughness;
  if (base && typeof base.metalness === 'number') out.metalness = base.metalness;
  return Object.freeze(out);
};

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
    // 벽 계열은 기본적으로 질감이 하나다 — 도장 벽. 자리마다 다른 것은 색뿐이다.
    //   **포인트 벽만 예외로 재질을 따로 정할 수 있다**(§11) — 임원 회의실은 색이 아니라
    //   질감(흡음 패널)으로 차이를 준다. 정하지 않은 공간은 지금처럼 도장 벽 그대로다.
    const accentMat = materialName(src.m.wallAccent) || wallMat;
    for (const role of ['wallFront', 'wallSide', 'wallAccent', 'baseboard']) {
      const f = finish(role === 'wallAccent' ? accentMat : wallMat, src.pal[role]);
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
    const f = finish(mat, src.pal[part], part);
    if (f) out[part] = f;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * **범용(폴백) 테이블에도 그 공간의 마감을 입히는 표.**
 *
 * 왜 필요한가 — 전용 테이블 자산은 자기가 아는 모양만 세운다. 대회의실 `largeUTable`은
 *   U자 조각을 읽어 세우고, 보트·사각형이 오면 세우지 못한다. 그때는 **기존 범용 테이블이
 *   대신 선다**(설계된 폴백 — 화면에서 테이블이 사라지지 않게 하는 장치다).
 *   그런데 그 범용 테이블의 부품 이름은 `tableTop`·`tableBase`·`tableBeam` 이라
 *   공간별 마감표(전용 부품 이름만 있다)에 걸리지 않았다. 그래서 **같은 대회의실인데
 *   테이블 모양만 바꾸면 상판 색이 달라졌다**(PHASE 4-d.5에서 실측으로 확인).
 *
 * 어떻게 고치는가 — 그 공간의 **전용 부품 마감을 그대로 빌려** 범용 부품에 입힌다.
 *   새 색도, 새 재질도 고르지 않는다(§8·§10). 거칠기·금속성까지 빌려 온 부품의 값을 따른다.
 *
 * **이 표에 이름이 없는 디자인은 예전 그대로다** — 대기업·임원의 폴백 모습은 한 값도 바뀌지 않는다(§18·§19).
 *   값은 '범용 부품 이름 → 빌려 올 전용 부품 이름'이다.
 */
export const GENERIC_TABLE_FINISH = Object.freeze({
  largeConference: Object.freeze({
    tableTop: 'conferenceTop',
    tableBase: 'conferenceBase',
    tableBeam: 'conferenceBase',   // 받침을 잇는 보. 하부와 같은 계열이어야 한 덩어리로 읽힌다
  }),
  // 상황실 뒤쪽 회의 테이블(PHASE 5-d.1) — 전용 자산이 아니라 **기존 회의 테이블**이 선다.
  //   콘솔 마감을 그대로 빌려 와야 '같은 방의 가구'로 읽힌다. 빌려 오지 않으면
  //   짙은 콘솔 옆에 크림색 나무 상판(#ece6db)이 홀로 남는다(실측으로 확인).
  controlRoom: Object.freeze({
    tableTop: 'consoleTop',
    tableBase: 'consoleBase',
    tableBeam: 'consoleBase',
  }),
});

/** 범용 테이블 부품 이름(폴백 테이블이 쓰는 이름). 테이블 말고는 쓰는 곳이 없다. */
export const GENERIC_TABLE_PARTS = Object.freeze(['tableTop', 'tableBase', 'tableBeam']);

/**
 * 부품 이름 → 그 디자인이 정한 **재질 이름**. 테이블과 콘솔을 한 표로 본다 —
 *   범용(폴백) 테이블이 콘솔 마감을 빌려 쓸 수 있어야 하기 때문이다(상황실이 그렇다).
 */
function partMaterials(src) {
  const top = materialName(src.m.tableTop), base = materialName(src.m.tableBase);
  return {
    boardroomTop: top, boardroomBase: base,
    conferenceTop: top, conferenceBase: base,
    consoleTop: materialName(src.m.consoleTop),
    consoleBase: materialName(src.m.consoleBase),
  };
}

/**
 * 곡선 콘솔(상판·하부)의 마감 (PHASE 5-d.1).
 *   **형상은 그대로 두고 마감만 갈아 끼운다** — 다른 자산과 이름이 겹치지 않으므로
 *   여기에 색을 붙여도 회의실 가구는 한 값도 바뀌지 않는다.
 *   디자인이 재질이나 색을 정하지 않았으면 그 자리는 빠진다(= 지금 그리던 그대로).
 */
export function consoleFinishForDesign(designId) {
  const src = sourcesOf(designId);
  if (!src) return null;
  const byPart = partMaterials(src);
  const out = {};
  for (const part of CONSOLE_PARTS) {
    const f = finish(byPart[part], src.pal[part], part);
    if (f) out[part] = f;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * 테이블 부품(임원 U 테이블 상판·하부)의 마감.
 *   **형상은 그대로 두고 마감만 갈아 끼운다** — 같은 U 테이블을 다른 공간이 쓰게 되어도
 *   그 공간의 팔레트로 마감만 바꾸면 된다.
 * 디자인이 상판·하부 재질이나 색을 정하지 않았으면 그 자리는 빠진다(= 부품 마감표 그대로).
 */
export function tablePartFinishForDesign(designId) {
  const src = sourcesOf(designId);
  if (!src) return null;
  const byPart = partMaterials(src);
  const out = {};
  // **어느 공간에 어떤 부품이 붙는지는 팔레트가 정한다** — 그 공간 팔레트에 그 부품 색이
  //   없으면 `finish()`가 null을 돌려주고 그 자리는 빠진다(대기업은 둘 다 없어서 아무것도 안 붙는다).
  for (const part of ALL_TABLE_PARTS) {
    const f = finish(byPart[part], src.pal[part], part);
    if (f) out[part] = f;
  }
  // 범용(폴백) 테이블 — **이 디자인이 허락한 경우에만** 전용 부품의 마감을 통째로 빌려 온다.
  //   재질·색·거칠기를 전부 빌려 온 부품(`from`) 기준으로 잡는다 — 그래야 같은 공간 안에서
  //   테이블 모양을 바꿔도 상판이 같은 재질로 읽힌다.
  const borrow = GENERIC_TABLE_FINISH[designId];
  if (borrow) {
    for (const [part, from] of Object.entries(borrow)) {
      const f = finish(byPart[from], src.pal[from], from);
      if (f) out[part] = f;
    }
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * 교육장 가구 부품(책상·의자·교탁). (PHASE 7-a)
 *   **부품 이름을 공유하는 자산이 있다** — `seatFrame` 은 강당 의자와, `chairSeat`·`chairBack` 은
 *   기존 회의 의자와 같은 이름을 쓴다. 그래서 전역 색표를 고치면 강당과 회의실이 같이 바뀐다.
 *   디자인 범위 해석기로만 갈아 끼우는 이유가 이것이다 — 교육장에서만 적용된다.
 */
export const TRAINING_PARTS = Object.freeze([
  'deskTop', 'deskLeg', 'deskRail', 'deskPanel',
  'chairSeat', 'chairBack', 'seatFrame',
  'podium', 'podiumTop',
]);

/** 교육장 부품 이름 → 그 디자인이 정한 **재질 이름**. */
function trainingMaterials(src) {
  const top = materialName(src.m.deskTop);
  const base = materialName(src.m.deskBase);
  const panel = materialName(src.m.deskPanel);
  return {
    deskTop: top, deskLeg: base, deskRail: base, deskPanel: panel,
    chairSeat: materialName(src.m.chair), chairBack: materialName(src.m.chair),
    seatFrame: materialName(src.m.chairFrame),
    podium: materialName(src.m.podiumBody), podiumTop: materialName(src.m.podiumTop),
  };
}

/**
 * 교육용 책상·의자·교탁의 마감 (PHASE 7-a).
 *   **형상은 그대로 두고 마감만 갈아 끼운다.** 디자인이 재질이나 색을 정하지 않은 자리는
 *   빠진다(= 지금 그리던 그대로).
 * @returns {null|Object} 부품 이름 → `{ material, color, canonical }`.
 */
export function trainingFinishForDesign(designId) {
  const src = sourcesOf(designId);
  if (!src) return null;
  const byPart = trainingMaterials(src);
  const out = {};
  for (const part of TRAINING_PARTS) {
    const f = finish(byPart[part], src.pal[part], part);
    if (f) out[part] = f;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

/**
 * AV 장비(개인 모니터·중앙 프롬퍼터)의 마감. **형상·자리는 그대로 두고 마감만 갈아 끼운다.**
 *   디자인이 AV 재질(`materials.av`)과 색을 정한 공간에서만 붙는다 —
 *   전역 부품 마감표를 고치면 그 부품을 쓰는 **다른 공간이 전부 같이 바뀐다**.
 */
export function avFinishForDesign(designId) {
  const src = sourcesOf(designId);
  if (!src) return null;
  const mat = materialName(src.m.av);
  if (!mat) return null;
  const out = {};
  for (const part of AV_PARTS) {
    const f = finish(mat, src.pal[part], part);
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
    const f = finish(materialName(byPart[part]), src.pal[part], part);
    if (f) out[part] = f;
  }
  return Object.keys(out).length ? Object.freeze(out) : null;
}

// ── 강당 전면부·객석 단 마감 (PHASE 9-c) ───────────────────────────────────
// **왜 여기에 두는가.** 무대 윗면(`GL_PALETTE.stageTop = '#eef1f5'`)과 객석 단 윗면
//   (`FURNITURE_COLORS.riserTop = '#e6eaf0'`)은 거의 흰색이라 빛을 받으면 그대로 날아갔다
//   (PHASE 9-b 실측 최대 10.14%). 두 값은 렌더러·자산에 박혀 있어 마감 체계의 손이 닿지
//   않았다. 그래서 상황실 콘솔 단(같은 `riser` 물건)과 함께 쓰는 값을 건드리지 않고,
//   **강당 디자인에서만** 갈아 끼우는 표를 여기에 둔다.
//
// **정식 재질을 새로 만들지 않는다**(이 파일의 원칙). 질감은 기존 `stageSurface` 를 그대로
//   쓰고, 색만 강당의 것으로 정한다. 그래서 `MATERIAL_IDS` 는 13종 그대로다.
export const AUDITORIUM_SURFACE_PARTS = Object.freeze([
  'auditoriumStageTop', 'auditoriumStageSide', 'auditoriumStageFascia',
  'auditoriumRiserTop', 'auditoriumRiserSide',
]);

/** 강당 전면부·객석 단 색. 바닥(`#d4d9e1`)보다 어둡고, LED 화면보다 약하게. */
export const AUDITORIUM_SURFACES = Object.freeze({
  // 무대 — 따뜻한 중간 톤. 바닥(차가운 밝은 회색)과 확실히 구분되고 날아가지 않는다.
  auditoriumStageTop: Object.freeze({ material: 'stageSurface', color: '#a89e92', roughness: 0.92 }),
  auditoriumStageSide: Object.freeze({ material: 'stageSurface', color: '#8b8279', roughness: 0.92 }),
  // 전면판은 한 단 더 어둡게 — 무대 높이(단 끝 선)가 또렷하게 읽힌다.
  auditoriumStageFascia: Object.freeze({ material: 'stageSurface', color: '#6b6560', roughness: 0.92 }),
  // 객석 단 — 바닥보다 약간 어두운 구조물. 좌석(밝은 회녹)과도 구분된다.
  auditoriumRiserTop: Object.freeze({ material: 'stageSurface', color: '#b7bdc6', roughness: 0.93 }),
  auditoriumRiserSide: Object.freeze({ material: 'stageSurface', color: '#949ba6', roughness: 0.93 }),
});

/**
 * 강당 전면부·객석 단 마감. **강당 디자인에서만** 값을 돌려준다(그 밖에는 null).
 *   null 이면 렌더러·가구는 지금 하던 그대로 그린다 — 다른 공간이 한 픽셀도 흔들리지 않는 이유다.
 */
export function auditoriumSurfaceFinish(designId) {
  const d = roomDesign(designId);
  if (!d || !String(d.id || '').startsWith('auditorium')) return null;
  return AUDITORIUM_SURFACES;
}

/** 그 디자인의 마감 상태 한눈에 보기(검증·디버깅용). */
export function finishStatusForDesign(designId) {
  const room = roomFinishForDesign(designId);
  const credenza = credenzaFinishForDesign(designId);
  const floorParts = floorPartFinishForDesign(designId);
  const tableParts = tablePartFinishForDesign(designId);
  const av = avFinishForDesign(designId);
  const consoleParts = consoleFinishForDesign(designId);
  return Object.freeze({
    palette: roomDesign(designId).palette || null,
    room: room ? Object.freeze(Object.keys(room)) : null,
    credenza: credenza ? Object.freeze(Object.keys(credenza)) : null,
    floorParts: floorParts ? Object.freeze(Object.keys(floorParts)) : null,
    tableParts: tableParts ? Object.freeze(Object.keys(tableParts)) : null,
    consoleParts: consoleParts ? Object.freeze(Object.keys(consoleParts)) : null,
    av: av ? Object.freeze(Object.keys(av)) : null,
  });
}
