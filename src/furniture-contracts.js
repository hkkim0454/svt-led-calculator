// furniture-contracts.js — 기업 AV 가구·장비 '계약'. (순수 — DOM도 Three.js도, 다른 모듈도 쓰지 않는다)
// ─────────────────────────────────────────────────────────────────────────────
// 이것은 **도형이 아니다.** "앞으로 만들 가구가 무엇이고, 어느 공간에서 쓰이고,
// 실제로 얼마만 하고, 어떤 부품으로 이루어지는가"를 적어 둔 **명세**다.
//
// 왜 도형보다 명세를 먼저 쓰는가
//   의자 하나를 잘 만드는 것보다, **네 공간의 가구가 서로 다르다는 사실**을 구조에
//   먼저 새기는 것이 중요하다. 지금 이름을 확정해 두면 PHASE 2에서 도형을 붙일 때
//   배치·재질·디자인이 이미 그 이름을 알고 있다.
//
// **런타임 카탈로그와 섞지 않는다** — 이것이 이 파일을 따로 둔 가장 큰 이유다.
//   FURNITURE_ASSETS(furniture-assets.js)  = **지금 실제로 세울 수 있는** 가구
//   FURNITURE_CONTRACTS(이 파일)           = **앞으로 만들** 가구의 명세
//   `build: null` 같은 항목을 런타임 카탈로그에 끼워 넣으면, 배치가 그 이름을 가리켰을 때
//   렌더러가 '있는 자산'으로 오해해 조용히 빈 가구나 엉뚱한 가구를 그린다.
//   그래서 두 목록은 **끝까지 분리한다.** 겹치는 id가 없는지 테스트가 지킨다.
//
// 단위는 전부 **mm**다(furniture-assets.js와 같은 규칙). Three.js 단위 환산은 어댑터의 몫이다.
//
// 디자인 방향 한 줄
//   사진 같은 제품 렌더가 아니라 **기업 AV 제안용 시각화**다. 가구 하나가 멋진 것보다
//   실제 회의실·중역회의실·대회의실·상황실에 **설치될 법한 비례**가 먼저다.
//   의자는 인체공학 메시 오피스 체어 계열을 참고하되, 특정 제품의 복제도 브랜드 종속도 아니다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 계약의 상태. **없는 도형을 있는 것처럼 적지 않는다**(CLAUDE.md 규칙 2).
 *   EXISTING        계약보다 **먼저 있던** 자산을 그대로 재사용한다(치수도 그쪽이 기준).
 *   IMPLEMENTED     이 계약대로 도형을 **만들었다.** 런타임 카탈로그에 있다.
 *   CONTRACT_READY  명세는 확정됐고 도형은 아직 없다.
 * 셋 다 '설명'일 뿐이고, **실제 구현 여부의 진실은 언제나 FURNITURE_ASSETS**다
 * (furniture-routing.js의 hasRuntimeFurnitureAsset). 두 값이 어긋나면 테스트가 잡는다.
 */
export const CONTRACT_STATUS = Object.freeze({
  EXISTING: 'existing',
  IMPLEMENTED: 'implemented',
  CONTRACT_READY: 'contract_ready',
});

/** 가구 갈래. 배치·카메라가 "이건 앉는 것/작업면/장비"를 구분할 때 쓴다. */
export const CONTRACT_CATEGORIES = Object.freeze(['chair', 'table', 'console', 'av']);

/**
 * 반복 렌더링 성격.
 *   instanced  같은 것이 여러 개 깔린다 → InstancedMesh 한 덩어리로 묶는다.
 *   sized      물건마다 크기가 다르다 → 크기까지 묶음 열쇠에 넣는다(책상·콘솔).
 *   custom     방에 한두 개뿐이고 모양도 제각각이다 → 그때그때 만든다(대형 U 테이블).
 */
export const INSTANCING_MODES = Object.freeze(['instanced', 'sized', 'custom']);

/** 이 계약을 쓰는 공간 디자인(room-design.js의 id). */
export const CONTRACT_ROOMS = Object.freeze([
  'corporateMeeting', 'executiveBoardroom', 'largeConference', 'controlRoom',
]);

/**
 * 부품 → 새 마감 표(`PART_FINISH`, materials.js)의 열쇠.
 *   · 자기 이름이 그대로 마감 이름인 부품은 자기 자신을 가리킨다.
 *   · 마감 표에 없는 부품은 **어느 부품의 마감을 빌려 쓸지** 적는다(예: 헤드레스트 → 방석).
 *     새 재질을 만들지 않고 기존 마감을 빌리는 것이 규칙이다.
 *   · `null` = **새 마감 표를 타지 않는다**(= 지금 하던 대로). 두 경우가 여기 해당한다.
 *       ① 이미 기존 대응표(`PART_MATERIAL`)가 다루는 부품 — 테이블 다리·콘솔 상판 등
 *       ② 실내 마감재가 아닌 것 — 화면(디스플레이 면). LED와 같은 이유로 재질 라이브러리 밖에서 다룬다.
 */
const SELF = name => name;

// ── 계약 ────────────────────────────────────────────────────────────────────

export const FURNITURE_CONTRACTS = Object.freeze({

  // ══ 의자 4종 ══════════════════════════════════════════════════════════════
  // 네 공간의 의자를 **하나로 합치지 않는다.** 지금은 비슷해 보여도, 고객 요구에 따라
  // 공간마다 다른 의자가 되는 것이 정상이다. 도형 일부(기둥·캐스터)를 나눠 쓰는 것은
  // 나중에 허용하되, **이름은 처음부터 따로** 둔다.

  corporateChair: Object.freeze({
    id: 'corporateChair',
    label: '대기업 회의용 인체공학 의자',
    category: 'chair',
    family: 'ergonomicMesh',
    status: CONTRACT_STATUS.IMPLEMENTED,   // PHASE 2-a — 이 계약대로 도형을 만들었다
    phase: 2,
    rooms: Object.freeze(['corporateMeeting']),
    instancing: 'instanced',
    // 인체공학 메시 오피스 체어 계열의 실루엣. 헤드레스트는 없다(중간 등받이).
    //   멀리서 봐도 '각진 상자 의자'가 아니라 '사무용 회전의자'로 읽히는 것이 목표다.
    dimensions: Object.freeze({
      seatTop: 450, seatW: 500, seatD: 480,
      overallW: 670, overallD: 670, overallH: 1040,
      casterBase: 660, backAboveSeat: 590,
    }),
    footprint: Object.freeze({ w: 670, d: 670 }),
    parts: Object.freeze([
      'chairFrame', 'chairMesh', 'chairCushion', 'chairArmPad', 'chairColumn', 'chairCaster',
    ]),
    finishParts: Object.freeze({
      chairFrame: SELF('chairFrame'), chairMesh: SELF('chairMesh'),
      chairCushion: SELF('chairCushion'), chairArmPad: SELF('chairArmPad'),
      chairColumn: SELF('chairColumn'), chairCaster: SELF('chairCaster'),
    }),
    note: '헤드레스트 없음. 그라파이트 프레임 + 차콜 메시 등받이.',
  }),

  executiveChair: Object.freeze({
    id: 'executiveChair',
    label: '임원 회의용 하이백 의자',
    category: 'chair',
    family: 'executiveHighBack',
    // PHASE 3-a — 실제 도형이 생겼다. 등록 여부는 런타임 목록이 답하지만, 계약도 함께 갱신한다.
    status: CONTRACT_STATUS.IMPLEMENTED,
    phase: 3,
    rooms: Object.freeze(['executiveBoardroom']),
    instancing: 'instanced',
    // 회의용 의자와 **확실히 달라야 한다.** 구분되는 지점은 부품 수가 아니라 실루엣이다 —
    //   등받이 위에 헤드레스트가 하나 더 얹혀 세로로 200mm 더 길다. 멀리서도 이것으로 갈린다.
    dimensions: Object.freeze({
      seatTop: 460, seatW: 530, seatD: 500,
      overallW: 710, overallD: 720, overallH: 1240,
      casterBase: 700, backAboveSeat: 780, headrestH: 190,
    }),
    footprint: Object.freeze({ w: 710, d: 720 }),
    parts: Object.freeze([
      'chairFrame', 'chairMesh', 'chairCushion', 'chairArmPad', 'chairColumn', 'chairCaster',
      'chairHeadrest',
    ]),
    // 헤드레스트는 마감 표에 없다 — **새 재질을 만들지 않고 방석 마감을 따라간다.**
    //   실제 하이백 의자도 헤드레스트는 등받이·방석과 같은 마감이다.
    finishParts: Object.freeze({
      chairFrame: SELF('chairFrame'), chairMesh: SELF('chairMesh'),
      chairCushion: SELF('chairCushion'), chairArmPad: SELF('chairArmPad'),
      chairColumn: SELF('chairColumn'), chairCaster: SELF('chairCaster'),
      chairHeadrest: 'chairCushion',
    }),
    note: '하이백 + 헤드레스트. 회의용보다 등받이가 190mm 더 높다.',
  }),

  conferenceErgoChair: Object.freeze({
    id: 'conferenceErgoChair',
    label: '대회의실용 인체공학 의자',
    category: 'chair',
    family: 'ergonomicMesh',
    // PHASE 4-a — 실제 도형이 생겼다.
    status: CONTRACT_STATUS.IMPLEMENTED,
    phase: 4,
    rooms: Object.freeze(['largeConference']),
    instancing: 'instanced',
    // 회의용 의자와 같은 계열이지만 **같은 도형이라고 가정하지 않는다.**
    //   다자회의는 좌석 간격이 빡빡해 폭이 조금 좁고, 개인 모니터를 보느라 등받이가 낮다.
    dimensions: Object.freeze({
      seatTop: 450, seatW: 490, seatD: 470,
      overallW: 650, overallD: 660, overallH: 1010,
      casterBase: 650, backAboveSeat: 560,
    }),
    footprint: Object.freeze({ w: 650, d: 660 }),
    parts: Object.freeze([
      'chairFrame', 'chairMesh', 'chairCushion', 'chairArmPad', 'chairColumn', 'chairCaster',
    ]),
    finishParts: Object.freeze({
      chairFrame: SELF('chairFrame'), chairMesh: SELF('chairMesh'),
      chairCushion: SELF('chairCushion'), chairArmPad: SELF('chairArmPad'),
      chairColumn: SELF('chairColumn'), chairCaster: SELF('chairCaster'),
    }),
    note: '좌석 간격이 빡빡한 다자회의용. 회의용보다 폭이 좁고 등받이가 낮다.',
  }),

  taskChair: Object.freeze({
    id: 'taskChair',
    label: '상황실 운용자 의자',
    category: 'chair',
    family: 'operatorTask',
    status: CONTRACT_STATUS.CONTRACT_READY,
    phase: 5,
    rooms: Object.freeze(['controlRoom']),
    instancing: 'instanced',
    // 장시간 근무용. 콘솔에 바짝 붙어 앉으므로 **작고 단단한 실루엣**이다.
    dimensions: Object.freeze({
      seatTop: 450, seatW: 470, seatD: 460,
      overallW: 620, overallD: 630, overallH: 1000,
      casterBase: 620, backAboveSeat: 550,
    }),
    footprint: Object.freeze({ w: 620, d: 630 }),
    parts: Object.freeze([
      'chairFrame', 'chairMesh', 'chairCushion', 'chairArmPad', 'chairColumn', 'chairCaster',
    ]),
    finishParts: Object.freeze({
      chairFrame: SELF('chairFrame'), chairMesh: SELF('chairMesh'),
      chairCushion: SELF('chairCushion'), chairArmPad: SELF('chairArmPad'),
      chairColumn: SELF('chairColumn'), chairCaster: SELF('chairCaster'),
    }),
    note: '콘솔에 붙어 앉는 운용자용. 네 의자 중 가장 작다.',
  }),

  // ══ 테이블 · 콘솔 4종 ══════════════════════════════════════════════════════
  // 전부 **크기가 방에 따라 정해진다.** 그래서 고정 발자국 대신 최소 치수를 적는다.
  // 실제 가로·세로는 배치 계산(room-presets)이 정한다 — 여기서 정하지 않는다.

  corporateTable: Object.freeze({
    id: 'corporateTable',
    label: '대기업 회의 테이블',
    category: 'table',
    family: 'conferenceTable',
    status: CONTRACT_STATUS.IMPLEMENTED,   // PHASE 2-b — 이 계약대로 도형을 만들었다
    phase: 2,
    rooms: Object.freeze(['corporateMeeting']),
    instancing: 'sized',
    // 작업면 높이는 의자와 맞물린다 — 좌석 450 위로 290mm(사무가구 표준 범위 250~330).
    //   상판은 얇게. 두꺼운 상판은 도마처럼 보인다.
    dimensions: Object.freeze({
      surfaceY: 740, topThk: 25,
      minWidth: 1800, minDepth: 900,
    }),
    footprint: null,             // 크기는 방이 정한다
    shapes: Object.freeze(['rect', 'boat']),
    parts: Object.freeze(['corporateTop', 'tableBase', 'tableBeam']),
    // 상판만 새 마감(중성 라미네이트)을 쓰고, 다리·보강대는 **기존 마감을 그대로** 쓴다.
    finishParts: Object.freeze({
      corporateTop: SELF('corporateTop'), tableBase: null, tableBeam: null,
    }),
    note: '사각·보트형. 얇은 상판 + 실제 비례의 T형 받침.',
  }),

  boardroomTable: Object.freeze({
    id: 'boardroomTable',
    label: '임원 회의실 대형 테이블',
    category: 'table',
    family: 'boardroomTable',
    // PHASE 3-b — 실제 도형이 생겼다.
    status: CONTRACT_STATUS.IMPLEMENTED,
    phase: 3,
    rooms: Object.freeze(['executiveBoardroom']),
    instancing: 'custom',
    // **회의 테이블을 크게 늘린 것이 아니다.** U자 상판을 직사각 세 장으로 이어 붙이면
    //   이음매가 보인다. 앞 모서리가 둥근 **한 덩어리**여야 한다(현재 U자 배치의 한계).
    dimensions: Object.freeze({
      surfaceY: 745, topThk: 30,
      minWidth: 3600, minDepth: 2400,
      frontCornerR: 450,          // 앞 모서리 둥글림 — 임원 테이블의 핵심 인상
      bodyDrop: 620,              // 상판 아래 몸통 높이(속이 빈 다리가 아니라 판형 몸통)
    }),
    footprint: null,
    shapes: Object.freeze(['u']),
    // PHASE 3-b — 하부 구조 부품 이름을 `tableBase`에서 `boardroomBase`로 바꿨다.
    //   `tableBase`는 **기존 가구가 쓰는 부품 이름**이라 새 마감을 붙일 수 없다
    //   (붙이면 회의 테이블·강의용 책상의 재질까지 같이 바뀐다 — 그래서 테스트가 막고 있다).
    //   계약이 요구하는 '짙은 그라파이트 판형 하부 구조'를 표현하려면 제 이름이 필요하다.
    //   치수(dimensions)는 하나도 바꾸지 않았다.
    parts: Object.freeze(['boardroomTop', 'boardroomBase']),
    finishParts: Object.freeze({ boardroomTop: SELF('boardroomTop'), boardroomBase: SELF('boardroomBase') }),
    note: '라이트 오크. 앞 모서리 둥근 일체형 U. layoutVariant executive-u 와 짝을 이룬다.',
  }),

  largeUTable: Object.freeze({
    id: 'largeUTable',
    label: '대회의실 대형 U 테이블',
    category: 'table',
    family: 'conferenceTable',
    status: CONTRACT_STATUS.CONTRACT_READY,
    phase: 4,
    rooms: Object.freeze(['largeConference']),
    instancing: 'custom',
    // 임원 테이블과 다르다 — **참석 인원이 훨씬 많고 좌석마다 개인 모니터가 붙는다.**
    //   그래서 상판 폭이 넓고(모니터 자리), 한 변이 훨씬 길다.
    dimensions: Object.freeze({
      surfaceY: 740, topThk: 25,
      minWidth: 5000, minDepth: 3000,
      segmentW: 900,              // U 한 변의 상판 폭 — 개인 모니터가 놓일 자리를 포함한다
      seatPitch: 700,             // 참석자 1인 간격(기존 chairPitch와 같은 값)
    }),
    footprint: null,
    shapes: Object.freeze(['u']),
    parts: Object.freeze(['corporateTop', 'tableBase']),
    finishParts: Object.freeze({ corporateTop: SELF('corporateTop'), tableBase: null }),
    note: '개인 모니터·중앙 프롬프터가 얹힌다. 임원 테이블보다 밀도가 높다.',
  }),

  curvedConsole: Object.freeze({
    id: 'curvedConsole',
    label: '상황실 곡선 콘솔 데스크',
    category: 'console',
    family: 'consoleDesk',
    status: CONTRACT_STATUS.CONTRACT_READY,
    phase: 5,
    rooms: Object.freeze(['controlRoom']),
    instancing: 'sized',
    // 기존 `controlConsole`(직선 상자)과 **별개 자산**이다. 기존 것은 그대로 남는다.
    //   실제 관제실 콘솔은 운용자를 감싸듯 휘어 있어 여러 대를 줄로 놓으면 호가 생긴다.
    dimensions: Object.freeze({
      surfaceY: 730, topThk: 40,
      minWidth: 1800, minDepth: 900,
      curveSagitta: 180,          // 한 대의 상판이 휜 깊이(가운데가 운용자 쪽으로 나온다)
      monitorRow: 2,              // 한 대에 놓이는 모니터 수(공칭)
    }),
    footprint: null,
    profile: 'curved',
    parts: Object.freeze(['consoleTop', 'consoleBase']),
    // 콘솔 상판·몸통은 **기존 마감을 그대로** 쓴다(새 마감을 만들지 않는다).
    finishParts: Object.freeze({ consoleTop: null, consoleBase: null }),
    note: '2열 배치. 기존 controlConsole 은 그대로 두고 별도 자산으로 만든다.',
  }),

  // ══ AV 장비 5종 ═══════════════════════════════════════════════════════════

  avCredenza: Object.freeze({
    id: 'avCredenza',
    label: 'AV 수납장',
    category: 'av',
    family: 'storage',
    // **이미 만들어져 있다.** 새로 만들지 않고 런타임 자산을 그대로 쓴다.
    status: CONTRACT_STATUS.EXISTING,
    phase: 1,
    sourceAsset: 'avCredenza',
    rooms: Object.freeze(['corporateMeeting', 'executiveBoardroom', 'largeConference']),
    instancing: 'sized',
    // **치수를 여기에 다시 적지 않는다.** `DIMS.avCredenza`가 유일한 기준이다 —
    //   두 곳에 적으면 언젠가 어긋나고, 어느 쪽이 맞는지 알 수 없게 된다.
    dimensions: null,
    footprint: null,
    parts: null,                  // 기존 createAvCredenza() 가 정한다
    finishParts: null,
    note: '기존 자산 재사용. DIMS.avCredenza · createAvCredenza() 를 그대로 쓴다.',
  }),

  personalMonitor: Object.freeze({
    id: 'personalMonitor',
    label: '참석자 개인 모니터',
    category: 'av',
    family: 'displayDevice',
    status: CONTRACT_STATUS.CONTRACT_READY,
    phase: 4,
    rooms: Object.freeze(['largeConference']),
    instancing: 'instanced',
    // **화면 크기를 지어내지 않는다.** 인치만 적고 실제 가로·세로는 `panelSize()`(monitors.js)가
    //   낸다 — LED 옆 모니터와 같은 순수 기하를 쓴다(기준이 둘로 갈라지지 않게).
    dimensions: Object.freeze({
      nominalInches: 24, depth: 55, standH: 130, tiltDeg: 12,
    }),
    footprint: Object.freeze({ w: 560, d: 200 }),
    parts: Object.freeze(['monitorBody', 'monitorStand', 'screen']),
    // 화면은 실내 마감재가 아니다 — LED와 같은 이유로 재질 라이브러리 밖에서 다룬다.
    finishParts: Object.freeze({
      monitorBody: SELF('monitorBody'), monitorStand: SELF('monitorStand'), screen: null,
    }),
    note: '좌석마다 한 대. 수십 개가 깔리므로 반드시 InstancedMesh 로 묶는다.',
  }),

  prompter: Object.freeze({
    id: 'prompter',
    label: '중앙 프롬프터',
    category: 'av',
    family: 'displayDevice',
    status: CONTRACT_STATUS.CONTRACT_READY,
    phase: 4,
    rooms: Object.freeze(['largeConference']),
    instancing: 'instanced',
    dimensions: Object.freeze({
      nominalInches: 22, depth: 60, standH: 90, tiltDeg: 22,
    }),
    footprint: Object.freeze({ w: 520, d: 260 }),
    parts: Object.freeze(['prompterBody', 'screen']),
    finishParts: Object.freeze({ prompterBody: SELF('prompterBody'), screen: null }),
    note: 'U자 가운데를 향해 마주 보게 2대. 영상 재생 기능은 범위 밖이다.',
  }),

  consoleMonitor: Object.freeze({
    id: 'consoleMonitor',
    label: '상황실 운용 모니터',
    category: 'av',
    family: 'displayDevice',
    status: CONTRACT_STATUS.CONTRACT_READY,
    phase: 5,
    rooms: Object.freeze(['controlRoom']),
    instancing: 'instanced',
    // 개인 모니터와 **논리적으로 별개**다(콘솔용은 더 크고 스탠드가 높다).
    //   다만 부품 구성이 같아 도형을 나눠 쓸 수 있게 계약을 맞춰 둔다.
    dimensions: Object.freeze({
      nominalInches: 27, depth: 60, standH: 160, tiltDeg: 10,
    }),
    footprint: Object.freeze({ w: 630, d: 220 }),
    parts: Object.freeze(['monitorBody', 'monitorStand', 'screen']),
    finishParts: Object.freeze({
      monitorBody: SELF('monitorBody'), monitorStand: SELF('monitorStand'), screen: null,
    }),
    note: '콘솔 한 대에 2~3대. 개인 모니터와 부품 구성이 같아 도형을 나눠 쓸 수 있다.',
  }),

  keyboard: Object.freeze({
    id: 'keyboard',
    label: '키보드',
    category: 'av',
    family: 'inputDevice',
    status: CONTRACT_STATUS.CONTRACT_READY,
    phase: 5,
    rooms: Object.freeze(['controlRoom']),
    instancing: 'instanced',
    // 아주 작은 물건이다. **부품을 나누지 않는다** — 콘솔 수십 대에 하나씩 깔리는데
    //   부품을 둘로 쪼개면 그리기 호출이 그대로 두 배가 된다. 한 덩어리 판 하나면 충분하다.
    dimensions: Object.freeze({ w: 440, d: 150, h: 22 }),
    footprint: Object.freeze({ w: 440, d: 150 }),
    parts: Object.freeze(['keyboardBody']),
    finishParts: Object.freeze({ keyboardBody: SELF('keyboardBody') }),
    note: '부품 1종 고정. 멀리서 보는 물건이라 자판을 새기지 않는다(그리기 호출 절약).',
  }),
});

export const CONTRACT_IDS = Object.freeze(Object.keys(FURNITURE_CONTRACTS));

// ── 조회 ────────────────────────────────────────────────────────────────────

/** 계약 id → 명세. 없으면 null. **런타임 자산 존재 여부와는 별개다.** */
export function furnitureContract(id) {
  return FURNITURE_CONTRACTS[id] || null;
}

/** 이 이름의 '앞으로 만들 가구' 명세가 있는가. */
export function hasFurnitureContract(id) {
  return !!FURNITURE_CONTRACTS[id];
}

/** 계약 id 전체. */
export function contractAssetIds() {
  return CONTRACT_IDS;
}

/** 그 공간 디자인이 쓰는 계약 목록. */
export function contractsForRoom(designId) {
  return Object.freeze(CONTRACT_IDS
    .map(k => FURNITURE_CONTRACTS[k])
    .filter(c => c.rooms.includes(designId)));
}

/**
 * 부품 → 마감 이름. 계약이 정한 대로 풀어 준다.
 *   · 마감 표에 있는 부품이면 그 이름
 *   · 헤드레스트처럼 빌려 쓰는 부품이면 빌려 올 부품 이름
 *   · 화면처럼 실내 마감재가 아니면 null
 * 계약이나 부품을 모르면 null(= 지금 하던 대로).
 */
export function finishPartFor(assetId, partName) {
  const c = FURNITURE_CONTRACTS[assetId];
  if (!c || !c.finishParts) return null;
  return Object.prototype.hasOwnProperty.call(c.finishParts, partName)
    ? c.finishParts[partName] : null;
}
