// room-design.js — 공간 '디자인 프리셋' 선언. (순수 — DOM도 Three.js도, 다른 모듈도 쓰지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
// 왜 필요한가
//   지금까지 `roomType`(회의실·강의실·강당·상황실…) 하나가 **용도와 디자인을 겸했다**.
//   그래서 '대기업 회의실'과 '대표이사 회의실'과 '대회의실'이 전부 `meeting` 하나에 얹혀
//   같은 가구·같은 색·같은 화각으로 나왔다.
//
//   이 파일은 그 위에 **디자인 층**을 하나 더 얹는다.
//     roomType  = 무엇을 계산하는가 (좌석 수·배치 좌표·옵션 스키마)  ← 건드리지 않는다
//     design    = 어떻게 보이는가   (가구 종류·색·마감·조명·화각)    ← 여기서 정한다
//
//   배치 계산(room-presets.js)과 LED 계산(engine.js)은 **이 파일을 전혀 모른다.**
//   그래서 디자인을 아무리 늘려도 기존 산출값이 흔들리지 않는다.
//
// 이 단계(PHASE 1-a)에서 하는 일 — **선언뿐이다. 화면은 하나도 바뀌지 않는다.**
//   · 디자인 4종의 뼈대를 만든다.
//   · 아직 만들지 않은 가구·재질은 `planned('이름')`으로 **'아직 없음'이라고 표시**한다.
//     해석기(resolveDesign)가 그것을 전부 INHERIT로 떨어뜨리므로 **절대 화면에 적용되지 않는다.**
//     (CLAUDE.md 규칙 2 '가짜 스펙 금지' — 없는 값을 있는 척 적지 않는다.)
//   · `corporateMeeting`은 PHASE 2-a에서 **의자만** 실제 자산으로 올라갔다(그 외는 여전히 INHERIT).
//
// 용어 한 줄 설명
//   INHERIT(null)  "지금 동작 그대로". 용도(roomType)와 기존 상수가 정하던 값을 그대로 쓴다.
//   planned(id)    "PHASE 2 이후에 만들 것". 지금은 INHERIT와 똑같이 취급된다.
//   layoutVariant  같은 용도 안에서의 **배치 전략 이름**. 지금은 이름표일 뿐이고,
//                  실제 배치는 전부 기존 layoutRoom() 결과를 그대로 쓴다.
// ─────────────────────────────────────────────────────────────────────────────

/** "지금 동작 그대로" — 디자인이 값을 정하지 않는다는 뜻. */
export const INHERIT = null;

/** "아직 만들지 않았다" 표시. 해석기가 INHERIT로 떨어뜨리므로 화면에 적용되지 않는다. */
export function planned(id) {
  return Object.freeze({ planned: String(id) });
}

/** 값이 '아직 만들지 않은 것'인가. */
export function isPlanned(v) {
  return !!v && typeof v === 'object' && typeof v.planned === 'string';
}

/**
 * 디자인 완성 상태.
 *   ready   지금 쓸 수 있다
 *   planned 구조만 있고 아직 구현 전
 *   neutral 디자인이 붙지 않은 공간(= 전부 INHERIT). NEUTRAL_DESIGN 전용.
 */
export const DESIGN_STATUS = Object.freeze({ READY: 'ready', PLANNED: 'planned', NEUTRAL: 'neutral' });

/** 디자인 한 벌이 반드시 가지는 항목. 빠진 항목이 없는지 테스트가 검사한다. */
export const DESIGN_FIELDS = Object.freeze([
  'id', 'label', 'roomType', 'layoutVariant', 'status', 'phase',
  'furniture', 'palette', 'materials', 'wallTreatment', 'lighting', 'camera', 'accessories',
]);

// ── 배치 변형(layoutVariant) ────────────────────────────────────────────────
// 같은 용도 안에서도 배치 전략이 달라질 수 있다는 것을 **처음부터** 구조에 남겨 둔다
// (오너 지침 2026-09-16). 지금은 전부 `base`(기존 layoutRoom 분기) 결과를 그대로 쓴다 —
// 실제로 분기하는 것은 PHASE 2 이후다.
//
//   base : 지금 이 변형이 의지하는 기존 배치 계산(room-presets.js의 분기 id)
export const LAYOUT_VARIANTS = Object.freeze({
  'corporate-standard': Object.freeze({
    id: 'corporate-standard', label: '대기업 회의실 표준', roomType: 'meeting', base: 'meeting',
    note: '사각·보트형 테이블 한 개 + 둘레 좌석. 지금 회의실 배치와 같다.',
  }),
  'executive-u': Object.freeze({
    id: 'executive-u', label: '임원 회의실 U자', roomType: 'meeting', base: 'meeting',
    note: 'U자 상판을 이어 붙이지 않고 한 덩어리로(앞 모서리 둥글게) — PHASE 3.',
  }),
  'large-conference': Object.freeze({
    id: 'large-conference', label: '대회의실 다자회의', roomType: 'meeting', base: 'meeting',
    note: '대형 U + 좌석마다 개인 모니터 + 중앙 프롬프터 + 벽면 배석 — PHASE 4.',
  }),
  'curved-console': Object.freeze({
    id: 'curved-console', label: '곡선 콘솔 상황실', roomType: 'control', base: 'control',
    note: '직선 콘솔 대신 곡선 콘솔 데스크 2열 + 유리 파티션 — PHASE 5.',
  }),
});

/** 변형 id → 정의. 모르는 값이면 null(=기존 배치 그대로). */
export function layoutVariant(id) {
  return LAYOUT_VARIANTS[id] || null;
}

// ── 디자인 프리셋 ───────────────────────────────────────────────────────────

export const ROOM_DESIGNS = Object.freeze({

  // ① 대기업 회의실 — **지금 화면 그 자체**. 기준점이자 안전망이다.
  //    모든 항목이 INHERIT이므로 이 디자인을 적용해도 바뀌는 것이 하나도 없다.
  //    INHERIT가 지금 실제로 무엇을 쓰는지(참고):
  //      바닥   floorFinishFor(roomType)      — 강의실·아이디에이션만 비닐, 나머지 카펫
  //      분위기 moodFor(roomType)             — 아이디에이션만 bright, 나머지 office
  //      가구   assetFor(item)                — 배치가 붙인 자산 힌트를 그대로
  //      색     GL_PALETTE / FURNITURE_COLORS — 방 껍데기 / 가구
  //      벽     정면·좌·우·뒤 전부 도장, 포인트 벽은 좌측 고정(ACCENT_WALL_SIDE)
  //      조명   LIGHTS 기준값 × 표현 방식(심플/실사) 배수
  //      화각   presetPose()의 프리셋별 기본값(실내 42°)
  corporateMeeting: Object.freeze({
    id: 'corporateMeeting',
    label: '대기업 회의실',
    roomType: 'meeting',
    layoutVariant: 'corporate-standard',
    status: DESIGN_STATUS.READY,
    phase: 2,
    // PHASE 2-a·2-b — 의자와 테이블을 새 자산으로 올렸다.
    //   `planned(...)`가 아니라 **맨 문자열**이라는 점이 중요하다 — 실제로 만들었다는 뜻이다.
    furniture: Object.freeze({ chair: 'corporateChair', table: 'corporateTable' }),
    // PHASE 2-c — 바닥·벽·AV 수납장 마감을 켠다.
    //   이름은 전부 **기존 13종 또는 그 별칭**이다(정식 재질을 새로 만들지 않았다).
    //   색은 팔레트가 따로 정한다 — 같은 질감에 공간마다 다른 색을 입히는 방식이다.
    //   조명·화각·벽 구성은 여전히 INHERIT다(PHASE 2-d).
    palette: 'corporateNeutral',
    materials: Object.freeze({
      floor: 'carpetTileLight',     // → carpetTile (별칭)
      wall: 'paintedWallWhite',     // → paintedWall (별칭)
      tableTop: 'neutralLaminate',  // PHASE 2-b에서 이미 상판에 붙어 있다(기록용)
      chair: 'darkGraphite',        // PHASE 2-a에서 이미 의자에 붙어 있다(기록용)
      credenza: 'blackEquipment',
    }),
    wallTreatment: INHERIT,
    // PHASE 2-d.1 — 조명. PHASE 2-d.2 — 화각(실내·좌우 코너. 아이소·평면도는 건드리지 않는다).
    lighting: 'corporateSoft',
    camera: 'corporateProposal',
    accessories: INHERIT,
  }),

  // ② 대표이사 / 임원 회의실 — Reference D·E 기준.
  //    **밝고 절제된 프리미엄**이다. 어둡고 월넛이 가득한 옛날식 임원실이 아니다.
  executiveBoardroom: Object.freeze({
    id: 'executiveBoardroom',
    label: '임원 회의실',
    roomType: 'meeting',
    layoutVariant: 'executive-u',
    status: DESIGN_STATUS.PLANNED,
    phase: 3,
    furniture: Object.freeze({
      // PHASE 3-a — 의자만 실제로 만들었다. `planned(...)`가 아니라 **맨 문자열**이라는 점이 중요하다.
      chair: 'executiveChair',              // 하이백 + 헤드레스트. 회의용보다 실루엣이 크다
      // PHASE 3-b — 대형 U, 앞 모서리 둥근 **일체형**. 맨 문자열 = 실제로 만들었다는 뜻이다.
      table: 'boardroomTable',
      av: Object.freeze([planned('avCredenza')]),
    }),
    // PHASE 3-c — 마감을 켠다. 이름은 전부 **기존 13종 또는 그 별칭**이다(정식 재질을 새로 만들지 않았다).
    //   색은 팔레트가 따로 정한다 — 같은 질감에 공간마다 다른 색을 입히는 방식이다.
    //   조명·화각은 여전히 planned 다(PHASE 3-d).
    palette: 'executiveBright',
    materials: Object.freeze({
      floor: 'carpetTileLight',     // → carpetTile (별칭). 라이트 그레이 프리미엄 카펫
      wall: 'paintedWallWhite',     // → paintedWall (별칭)
      // 포인트 벽만 **색이 아니라 질감**으로 차이를 준다 — 흡음 패널.
      //   임원 회의실이 대기업 회의실보다 한 단 정제돼 보이는 지점이고,
      //   새 형상을 만들지 않고 기존 벽면에 재질만 바꾸는 방법이다(§11).
      wallAccent: 'acousticPanel',
      tableTop: 'lightOak',         // → woodTable (별칭). PHASE 3-b 상판에 실제로 붙는다
      tableBase: 'darkGraphite',    // PHASE 3-b 하부(boardroomBase)에 실제로 붙는다
      chair: 'darkGraphite',        // PHASE 3-a 에서 이미 의자에 붙어 있다(기록용 — 건드리지 않는다)
      credenza: 'darkGraphite',     // 새까만 장비가 아니라 프리미엄 AV 가구로 읽히게
    }),
    wallTreatment: planned('executiveWalls'),
    // PHASE 3-d.1 — 조명. 천장등을 줄이고 보조광을 올려 **벽이 바닥보다 밝은** 자연스러운
    //   순서를 만든다. 화각은 여전히 planned 다(PHASE 3-d.2).
    lighting: 'executiveSoft',
    // PHASE 3-d.2 — 화각. 뒤 눈높이에서 LED와 U 테이블을 함께 담는 제안서 구도.
    //   아이소·평면도·정면은 건드리지 않는다(기존 역할 유지).
    camera: 'executiveProposal',
    accessories: planned('executiveAccessories'),
  }),

  // ③ 대회의실 / 다자회의실 — Reference B·C 기준.
  //    회의실을 그냥 크게 늘린 것이 아니라 **독립 프리셋**이다(개인 모니터·프롬프터·벽면 배석).
  largeConference: Object.freeze({
    id: 'largeConference',
    label: '대회의실',
    roomType: 'meeting',
    layoutVariant: 'large-conference',
    status: DESIGN_STATUS.PLANNED,
    phase: 4,
    furniture: Object.freeze({
      // PHASE 4-a — 의자만 실제로 만들었다. 맨 문자열 = 실제로 있다는 뜻이다.
      chair: 'conferenceErgoChair',
      // PHASE 4-b — 대형 U 테이블. 맨 문자열 = 실제로 만들었다는 뜻이다.
      table: 'largeUTable',
      // PHASE 4-c — 개인 모니터·중앙 프롬프터. 맨 문자열 = 실제로 만들었다는 뜻이다.
      av: Object.freeze(['personalMonitor', 'prompter', planned('avCredenza')]),
    }),
    // PHASE 4-d.1 — 마감을 켠다. 이름은 전부 **기존 13종 또는 그 별칭**이다(정식 재질을 새로 만들지 않았다).
    //   임원과 갈리는 지점: 포인트 벽을 **질감(흡음 패널)으로 꾸미지 않는다** — 도장 벽에 색 한 단만.
    //   참석자 30명·모니터 30대가 깔리는 방이라 마감이 조용할수록 장비가 읽힌다.
    palette: 'conferenceBright',
    materials: Object.freeze({
      floor: 'carpetTileLight',     // → carpetTile (별칭). 밝은 중성 회색 카펫
      wall: 'paintedWallWhite',     // → paintedWall (별칭). 포인트 벽도 같은 도장 벽이다
      tableTop: 'lightAsh',         // → neutralLaminate (별칭). 결이 거의 없는 작업면
      tableBase: 'darkGraphite',    // 대형 U 테이블 하부(conferenceBase)에 실제로 붙는다
      chair: 'darkGraphite',        // PHASE 4-a 에서 이미 의자에 붙어 있다(기록용 — 건드리지 않는다)
      av: 'blackEquipment',         // 개인 모니터·중앙 프롬프터. 꺼진 화면도 이 질감을 쓴다
      credenza: 'darkGraphite',     // LED 아래 낮은 AV 가구. 흰 상자로 남지 않게
    }),
    wallTreatment: planned('largeConferenceWalls'),
    // PHASE 4-d.2 — 조명. 천장등을 크게 줄여 상판·바닥을 내리고, 보조광·환경광을 올려
    //   옆벽을 끌어올린다. 어느 조명이 어느 면에 닿는지 실측해서 고른 배수다(design-lighting.js).
    lighting: 'conferenceSoft',
    // PHASE 4-d.3 — 화각. 뒷쪽 눈높이에서 LED·대형 테이블·의자/모니터 밀도·프롬프터를
    //   한 화면에 담는 제안서 구도. 서는 자리를 **놓인 것에서 계산**한다(design-camera.js).
    //   아이소·평면도·정면은 건드리지 않는다(기존 역할 유지).
    camera: 'conferenceProposal',
    accessories: planned('largeConferenceAccessories'),
  }),

  // ④ 상황실 / 관제실 / 운영실 — Reference A 기준.
  //    회의실과 **완전히 다른 가구·배치 체계**를 쓴다(곡선 콘솔·다중 모니터·유리 파티션).
  controlRoom: Object.freeze({
    id: 'controlRoom',
    label: '상황실 · 관제실',
    roomType: 'control',
    layoutVariant: 'curved-console',
    status: DESIGN_STATUS.PLANNED,
    phase: 5,
    furniture: Object.freeze({
      chair: planned('taskChair'),
      console: planned('curvedConsole'),
      av: Object.freeze([planned('consoleMonitor'), planned('keyboard')]),
    }),
    palette: planned('controlPalette'),
    materials: Object.freeze({
      floor: planned('carpetTileDark'),
      wall: planned('acousticPanel'),
      console: planned('neutralLaminate'),
      equipment: planned('blackEquipment'),
    }),
    wallTreatment: planned('controlWalls'),   // 한쪽 유리 파티션 + 한쪽 다크 패널
    lighting: planned('controlTechnical'),
    camera: planned('controlCamera'),
    accessories: planned('controlAccessories'),
  }),
});

export const DESIGN_IDS = Object.freeze(Object.keys(ROOM_DESIGNS));

/**
 * **디자인이 붙지 않은 공간** — 모든 항목이 INHERIT다(= 지금 동작 그대로).
 *
 * 왜 필요한가: 예전에는 값이 없으면 무조건 `corporateMeeting`으로 떨어졌다.
 *   지금은 그것이 전부 INHERIT라 티가 나지 않지만, PHASE 2에서 대기업 회의실에
 *   실제 의자·테이블·카펫·조명이 들어가는 순간 **강당·강의실·아이디에이션 공간에
 *   회의실 디자인이 잘못 입혀진다.** `corporateMeeting`은 '모든 공간의 기본'이 아니라
 *   '**meeting 용도의** 기본'이어야 한다(오너 지침 2026-09-16).
 *   그래서 '아무 디자인도 아님'을 가리키는 자리를 따로 만든다.
 */
export const NEUTRAL_DESIGN = Object.freeze({
  id: null,
  label: '기본(디자인 없음)',
  roomType: null,
  layoutVariant: null,
  status: DESIGN_STATUS.NEUTRAL,
  phase: 0,
  furniture: INHERIT, palette: INHERIT, materials: INHERIT,
  wallTreatment: INHERIT, lighting: INHERIT, camera: INHERIT, accessories: INHERIT,
});

/**
 * **용도별 기본 디자인.** 여기에 없는 용도는 디자인이 없다(NEUTRAL_DESIGN).
 *   Corporate AV Design System이 아직 다루지 않는 공간(강의실·소/중/대강당·아이디에이션)에
 *   억지로 회의실 디자인을 붙이지 않는다.
 * 새 공간을 지원하게 되면 여기에 한 줄을 더한다 — 기본값이 흩어지지 않게 한곳에 모아 둔다.
 */
export const DEFAULT_DESIGN_BY_ROOM_TYPE = Object.freeze({
  meeting: 'corporateMeeting',
  control: 'controlRoom',
});

/** 그 용도의 기본 디자인 id. 지원하지 않는 용도면 null(= 디자인 없음). */
export function defaultDesignFor(roomTypeId) {
  return DEFAULT_DESIGN_BY_ROOM_TYPE[roomTypeId] || null;
}

/**
 * 디자인 id → 정의.
 * 모르는 값·빈 값이면 **NEUTRAL_DESIGN**(전부 INHERIT)이다 — 특정 공간의 디자인이 아니다.
 * 용도에 맞는 기본값이 필요하면 `normalizeDesign(id, roomTypeId)`을 먼저 거친다.
 */
export function roomDesign(id) {
  return ROOM_DESIGNS[id] || NEUTRAL_DESIGN;
}

/**
 * 그 용도에서 고를 수 있는 디자인 목록.
 * 아직 디자인이 붙지 않은 용도는 **빈 목록**이다 — 화면은 그때 디자인 선택칸을 아예 그리지 않는다.
 * (예전처럼 회의실 디자인 하나를 억지로 끼워 넣으면 강당에 '대기업 회의실'이 뜬다.)
 */
export function designsFor(roomTypeId) {
  return Object.freeze(DESIGN_IDS.map(k => ROOM_DESIGNS[k]).filter(d => d.roomType === roomTypeId));
}

/**
 * 저장해 둔 값을 안전하게 정리한다. **되돌아가는 곳은 언제나 '그 용도의' 기본 디자인이다.**
 *   · 그 용도의 디자인이면            → 그대로
 *   · 값이 없거나(예전 세션)·모르거나·용도가 안 맞으면 → defaultDesignFor(용도)
 *   · 그 용도에 기본 디자인이 없으면  → null (디자인 없음 = 지금 동작 그대로)
 *
 * **예전 세션은 design 값이 아예 없다.** 그때
 *   회의실 → corporateMeeting · 상황실 → controlRoom ·
 *   강의실/강당/아이디에이션 → null
 * 로 떨어지는 것이 이 함수의 가장 중요한 역할이다.
 * 여기서 용도를 무시하고 회의실 디자인으로 떨어뜨리면, PHASE 2에서 회의실에 실제 값이
 * 들어가는 순간 강당·강의실 화면이 회의실처럼 바뀐다.
 *
 * @returns 디자인 id 또는 null(디자인 없음)
 */
export function normalizeDesign(id, roomTypeId) {
  const d = ROOM_DESIGNS[id];
  if (d && d.roomType === roomTypeId) return d.id;
  return defaultDesignFor(roomTypeId);
}

/**
 * 배치 계획 — **배치의 주인은 언제나 용도(roomType)다.** 디자인은 변형 '이름'만 얹는다.
 *   useBaseLayout이 true인 동안에는 기존 layoutRoom() 결과를 그대로 쓴다.
 *   PHASE 2 이후 변형별로 배치를 나눌 때 이 값이 false가 되는 변형이 생긴다.
 *
 * @returns {{roomType, variant, base, useBaseLayout}}
 *   variant : 이 용도에 실제로 걸리는 변형 id(안 맞으면 null = 기존 배치 그대로)
 */
export function layoutPlan(designId, roomTypeId) {
  const d = roomDesign(designId);
  const matched = d.roomType === roomTypeId ? layoutVariant(d.layoutVariant) : null;
  return Object.freeze({
    roomType: roomTypeId,
    variant: matched ? matched.id : null,
    base: matched ? matched.base : roomTypeId,
    useBaseLayout: true,   // PHASE 1-a — 아직 어떤 변형도 배치를 바꾸지 않는다
  });
}

// 아직 만들지 않은 값(planned)과 모르는 값을 전부 INHERIT로 떨어뜨린다.
//   객체는 속마다 같은 규칙을 적용하고, 남는 것이 하나도 없으면 통째로 INHERIT가 된다.
function settle(v) {
  if (v === undefined || v === null || isPlanned(v)) return INHERIT;
  if (Array.isArray(v)) {
    const out = v.map(settle).filter(x => x !== INHERIT);
    return out.length ? Object.freeze(out) : INHERIT;
  }
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const s = settle(val);
      if (s !== INHERIT) out[k] = s;
    }
    return Object.keys(out).length ? Object.freeze(out) : INHERIT;
  }
  return v;
}

/**
 * 화면이 실제로 쓸 '해석된' 디자인.
 *   **아직 만들지 않은 것(planned)은 전부 INHERIT로 바뀐다** — 그래서 이 결과를 그대로
 *   적용해도 지금 동작에서 벗어날 수 없다. PHASE 2에서 자산을 만들면 `planned('x')`를
 *   `'x'`로 바꾸기만 하면 그때부터 적용된다.
 *
 * INHERIT(null)을 받은 쪽은 **자기가 원래 쓰던 값을 그대로 쓴다**:
 *   materials.floor === null → floorFinishFor(roomType)
 *   lighting === null        → LIGHTS 기준값
 *   camera === null          → presetPose()의 프리셋별 기본값
 */
export function resolveDesign(id) {
  const d = roomDesign(id);
  return Object.freeze({
    id: d.id, label: d.label, roomType: d.roomType,
    layoutVariant: d.layoutVariant, status: d.status, phase: d.phase,
    furniture: settle(d.furniture),
    palette: settle(d.palette),
    materials: settle(d.materials),
    wallTreatment: settle(d.wallTreatment),
    lighting: settle(d.lighting),
    camera: settle(d.camera),
    accessories: settle(d.accessories),
  });
}

/** 지금 화면에 적용해도 아무것도 바뀌지 않는 디자인인가(= 모든 항목이 INHERIT). */
export function isNeutralDesign(id) {
  const r = resolveDesign(id);
  return ['furniture', 'palette', 'materials', 'wallTreatment', 'lighting', 'camera', 'accessories']
    .every(k => r[k] === INHERIT);
}
