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

  // ── 여기부터 Corporate AV Design System 재질(PHASE 1-b 신규 6종) ──────────
  // 위 7종과 달리 **기준 색(color)을 함께 들고 다닌다.**
  //   위 7종은 색을 쓰는 쪽(GL_PALETTE·FURNITURE_COLORS)이 정하는 '질감 전용' 프리셋이라
  //   지금 구조를 유지한다(id·수치 불변이 호환성 계약이다).
  //   아래 6종은 '어두운 그라파이트'처럼 **색이 곧 재질의 정체성**이라 함께 둔다.
  //
  // **이번 단계에서는 어떤 것도 화면에 연결하지 않는다.** 선언만 한다.

  // ⑧ 어두운 카펫 타일 — 상황실/관제실. 규격은 밝은 카펫과 같은 500mm.
  //    Reference A의 업무시설용 카펫처럼 **어둡고 무늬가 거의 안 보이는** 쪽으로 잡는다
  //    (밝은 카펫보다 요철을 더 낮춘다 — 어두운 면에서 무늬가 세면 얼룩처럼 읽힌다).
  carpetTileDark: Object.freeze({
    id: 'carpetTileDark', label: '카펫 타일(어두움)', color: '#4a4f56',
    roughness: 0.92, metalness: 0, normalScale: 0.24, tileMm: 500, texture: 'carpet',
  }),
  // ⑨ 중성 라미네이트 상판 — 일반 기업 회의 테이블.
  //    순백 플라스틱도, 짙은 원목도 아니다. 목재 상판보다 결을 절반으로 낮춰
  //    '무늬가 아니라 면'으로 읽히게 한다(functional corporate furniture).
  neutralLaminate: Object.freeze({
    id: 'neutralLaminate', label: '중성 라미네이트', color: '#e8e4dc',
    roughness: 0.58, metalness: 0, normalScale: 0.05, tileMm: 1200, texture: 'speckle',
  }),
  // ⑩ 다크 그라파이트 — 의자 프레임·팔걸이·캐스터, AV 가구 구조물.
  //    **금속이 아니다.** 분체도장/엔지니어링 폴리머라 금속성을 아주 낮게 잡는다
  //    (금속 프레임 0.35 → 0.10). 번들거리면 Aeron이 아니라 게이밍 체어가 된다.
  darkGraphite: Object.freeze({
    id: 'darkGraphite', label: '다크 그라파이트', color: '#3a3e44',
    roughness: 0.68, metalness: 0.10, normalScale: 0, tileMm: 0, texture: null,
  }),
  // ⑪ 블랙 AV 장비 — 모니터·프롬프터·키보드·스탠드.
  //    **순수 검정(#000000)을 쓰지 않는다** — 새까맣게 칠하면 모서리와 형태가 전부 죽어
  //    화면에서 '검은 구멍'이 된다. 빛을 받았을 때 면이 약하게 갈리는 정도의 밝기를 남긴다.
  //    광택도 낮게 — 반들거리는 검정은 게이밍 장비처럼 보인다.
  blackEquipment: Object.freeze({
    id: 'blackEquipment', label: '블랙 AV 장비', color: '#1a1d21',
    roughness: 0.52, metalness: 0.18, normalScale: 0, tileMm: 0, texture: null,
  }),
  // ⑫ 유리 파티션 — 상황실 유리벽. **이번 단계에서는 선언만 한다.**
  //    투명 재질은 그리기 순서가 꼬이고 그림자를 이상하게 만들어 따로 다뤄야 하므로,
  //    '어떻게 다뤄야 하는지'를 아래 semantic 값으로 적어 둔다.
  //    이 값들은 전부 **평범한 숫자·불리언**이다 — Three.js 객체를 여기서 만들지 않는다.
  //    실제 재질 생성은 materials-gl.js(어댑터)의 몫이다.
  glassPartition: Object.freeze({
    id: 'glassPartition', label: '유리 파티션', color: '#cfd8e0',
    roughness: 0.08, metalness: 0, normalScale: 0, tileMm: 0, texture: null,
    transparent: true,        // 어댑터가 transparent:true 로 만든다
    opacity: 0.16,            // 거의 비치는 유리. 파티션 너머가 보여야 한다
    castsShadow: false,       // 유리가 바닥에 시커먼 그늘을 드리우면 안 된다
    receivesShadow: false,
    doubleSided: true,        // 양쪽에서 다 보인다
    renderClass: 'transparent',   // 불투명한 것들을 다 그린 뒤에 그린다
    renderOrderHint: 2,
  }),
  // ⑬ 흡음 패널 — 회의실·임원실·대회의실 벽체 마감.
  //    직물이라 아주 거칠고, 무늬는 패브릭 의자보다도 약하게 잡는다.
  //    벽은 면적이 넓어서 무늬가 조금만 세도 LED보다 먼저 눈에 들어온다.
  acousticPanel: Object.freeze({
    id: 'acousticPanel', label: '흡음 패널', color: '#d7d3cb',
    roughness: 0.95, metalness: 0, normalScale: 0.16, tileMm: 600, texture: 'carpet',
  }),
});

/**
 * **호환성 보호 대상 7종.** 기존 렌더러가 이 id로 재질을 찾는다.
 * id·수치를 바꾸거나 이름을 갈면 화면이 바뀐다 — 절대 건드리지 않는다(오너 지침 2026-09-16).
 * 값이 그대로인지는 `tests/materials.test.js`가 스냅샷으로 고정한다.
 */
export const LEGACY_MATERIAL_IDS = Object.freeze([
  'paintedWall', 'carpetTile', 'vinylFloor', 'woodTable',
  'metalFrame', 'fabricChair', 'stageSurface',
]);

/** PHASE 1-b에서 더한 Corporate AV Design System 재질 6종. 아직 화면에 연결되지 않았다. */
export const DESIGN_MATERIAL_IDS = Object.freeze([
  'carpetTileDark', 'neutralLaminate', 'darkGraphite',
  'blackEquipment', 'glassPartition', 'acousticPanel',
]);

/** 정식(canonical) 재질 전체 = 기존 7 + 신규 6 = 13종. 별칭은 여기에 세지 않는다. */
export const MATERIAL_IDS = Object.freeze([...LEGACY_MATERIAL_IDS, ...DESIGN_MATERIAL_IDS]);

/** 공간 타입 → 바닥 마감. 강의실·아이디에이션은 비닐, 나머지는 카펫. */
export function floorFinishFor(roomTypeId) {
  return (roomTypeId === 'classroom' || roomTypeId === 'ideation') ? 'vinylFloor' : 'carpetTile';
}

/**
 * 공간 분위기 — 같은 조명 구성을 쓰되 밝기와 벽 색만 조금 다르게 한다.
 *   light   조명 세기에 곱하는 값
 *   wallMix 벽·천장 색을 흰색 쪽으로 섞는 비율(0 = 그대로)
 * 조명 '구성'은 건드리지 않는다 — 방마다 조명 개수가 달라지면 관리가 안 된다.
 */
export const MOODS = Object.freeze({
  office: Object.freeze({ id: 'office', label: '사무 표준', light: 1.00, wallMix: 0 }),
  bright: Object.freeze({ id: 'bright', label: '밝고 개방적', light: 1.14, wallMix: 0.45 }),
  dim: Object.freeze({ id: 'dim', label: '어둡게(화면 강조)', light: 0.82, wallMix: 0 }),
});

/** 공간 타입 → 분위기. 아이디에이션 공간만 더 밝고 가볍게. */
export function moodFor(roomTypeId) {
  return roomTypeId === 'ideation' ? 'bright' : 'office';
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

// ── 의미 이름(별칭) ─────────────────────────────────────────────────────────
// 디자인 프리셋에서는 `carpetTile`보다 `carpetTileLight`가, `woodTable`보다 `lightOak`가
// 읽기 쉽다. 그렇다고 **기존 id를 갈면 렌더러가 찾지 못한다**(호환성 계약).
// 그래서 이름만 이어 준다 — **재질을 복제하지 않는다.** 별칭을 따라가면 같은 프리셋 객체 하나가 나온다.
//
// 별칭은 정식 재질이 아니다 — 재질 개수를 셀 때 포함하지 않는다(13종 그대로).
export const MATERIAL_ALIASES = Object.freeze({
  carpetTileLight: 'carpetTile',    // 밝은 회색 카펫 = 지금 쓰는 카펫
  lightOak: 'woodTable',            // 라이트 오크 = 지금 쓰는 목재 상판
  // 흰 도장 벽 — **새 물성이 아니다.** 도장 벽의 질감을 그대로 쓰고,
  //   흰색/오프화이트라는 것은 색이므로 앞으로 팔레트·디자인 층이 정한다.
  //   재질을 하나 더 만들면 같은 질감이 두 벌이 되어 재질 캐시가 갈라진다.
  paintedWallWhite: 'paintedWall',
});

/**
 * 이름 → 정식 재질 id. 별칭이면 원본 id로, 정식 id면 그대로, 모르는 이름이면 null.
 * @returns {string|null}
 */
export function resolveMaterialId(name) {
  if (typeof name !== 'string' || !name) return null;
  if (MATERIAL_PRESETS[name]) return name;
  const target = MATERIAL_ALIASES[name];
  return (target && MATERIAL_PRESETS[target]) ? target : null;
}

/**
 * 이름(정식 id 또는 별칭) → 재질 프리셋. 모르면 null.
 * **새 객체를 만들지 않는다** — 늘 같은 프리셋 하나를 돌려준다(그리기 호출이 쪼개지지 않게).
 */
export function materialPreset(name) {
  const id = resolveMaterialId(name);
  return id ? MATERIAL_PRESETS[id] : null;
}

/** 이 재질이 투명한가(유리처럼 따로 다뤄야 하는가). */
export function isTransparentMaterial(name) {
  return materialPreset(name)?.transparent === true;
}

/**
 * 무늬 한 장의 **실제 크기**(mm). 무늬가 없으면 0.
 * 반복 횟수는 `tileRepeat()`이 이 값으로 계산한다 — 10 m 방과 20 m 방에서
 * 카펫 한 장의 크기가 똑같이 500mm로 보이는 이유가 이것이다.
 * (실제 치수 metadata를 새 필드로 또 만들지 않는다 — 기준이 둘이 되면 어긋난다.)
 */
export function realWorldTileMm(name) {
  return materialPreset(name)?.tileMm || 0;
}

// ── 어댑터 계약 ─────────────────────────────────────────────────────────────
// Three.js 재질을 만드는 일은 materials-gl.js(어댑터)가 한다. 다만 **무엇을 넘겨야 하는지**는
// 여기서 정한다 — 그래야 Node에서 검사할 수 있고, 어댑터가 프리셋을 제멋대로 해석하지 못한다.
//
// **재질 값과 메시 의미를 섞지 않는다.**
//   재질 값   roughness·metalness·transparent·opacity·doubleSided
//             → Three.js 재질(Material) 객체의 속성이다.
//   메시 의미  castsShadow·receivesShadow·renderClass·renderOrderHint
//             → **재질이 아니라 그 재질을 입은 물체(Mesh)** 의 성질이다.
//             Material 객체에 억지로 넣으면 Three.js가 무시하는 유령 속성만 생기고,
//             나중에 "왜 그림자가 안 꺼지지"를 엉뚱한 곳에서 찾게 된다.

/** Three.js 재질 객체에 그대로 넘겨도 되는 값. */
export const MATERIAL_PARAM_KEYS = Object.freeze([
  'roughness', 'metalness', 'transparent', 'opacity', 'doubleSided',
]);

/** 재질이 아니라 **물체**의 성질. 절대 Material 객체에 넣지 않는다. */
export const MESH_SEMANTIC_KEYS = Object.freeze([
  'castsShadow', 'receivesShadow', 'renderClass', 'renderOrderHint',
]);

/** 아무 표시가 없는 재질의 기본 물체 성질 — 지금 렌더러가 하던 그대로. */
export const DEFAULT_RENDER_SEMANTICS = Object.freeze({
  castsShadow: true, receivesShadow: true, renderClass: 'opaque', renderOrderHint: 0,
});

/**
 * 재질 값만 뽑는다(이름은 정식 id든 별칭이든 된다). 모르는 이름이면 null.
 * `transparent`·`opacity`·`doubleSided`는 **그렇게 표시된 재질에만** 실린다 —
 * 표시가 없으면 아예 넣지 않아 Three.js 기본값(불투명·앞면)이 그대로 쓰인다.
 * 덕분에 기존 재질의 결과가 한 톨도 달라지지 않는다.
 */
export function materialParams(name) {
  const p = materialPreset(name);
  if (!p) return null;
  const out = { roughness: p.roughness, metalness: p.metalness };
  if (p.transparent === true) {
    out.transparent = true;
    out.opacity = (typeof p.opacity === 'number') ? p.opacity : 1;
  }
  if (p.doubleSided === true) out.doubleSided = true;
  return Object.freeze(out);
}

/**
 * 이 재질을 입은 **물체**를 어떻게 다뤄야 하는가. 표시가 없으면 지금 하던 대로.
 * 어댑터는 이 값을 Mesh(그림자 플래그·renderOrder)에 쓴다 — Material에 넣지 않는다.
 */
export function renderSemantics(name) {
  const p = materialPreset(name);
  const d = DEFAULT_RENDER_SEMANTICS;
  if (!p) return d;
  return Object.freeze({
    castsShadow: typeof p.castsShadow === 'boolean' ? p.castsShadow : d.castsShadow,
    receivesShadow: typeof p.receivesShadow === 'boolean' ? p.receivesShadow : d.receivesShadow,
    renderClass: p.renderClass || d.renderClass,
    renderOrderHint: typeof p.renderOrderHint === 'number' ? p.renderOrderHint : d.renderOrderHint,
  });
}

// ── 재질 역할(role) ─────────────────────────────────────────────────────────
// 디자인 프리셋이 "이 공간의 바닥은 무엇" 같은 식으로 고를 수 있게 **어휘만** 정해 둔다.
// 이번 단계에서는 Room Design과 연결하지 않는다.
export const MATERIAL_ROLES = Object.freeze([
  'floor', 'wall', 'ceiling', 'tableTop', 'chairFrame', 'chairSeat',
  'equipment', 'partition', 'acoustic', 'stage',
]);

/**
 * 역할별로 고를 수 있는 재질 후보.
 * 프리셋 안에 `roles` 필드를 넣지 않고 **밖에 따로 둔다** — 기존 7종에 필드를 더하는 것도
 * '기존 재질 변경'이기 때문이다(호환성 계약). 여기는 조회용 표일 뿐이다.
 */
export const ROLE_CANDIDATES = Object.freeze({
  floor: Object.freeze(['carpetTile', 'carpetTileDark', 'vinylFloor']),
  wall: Object.freeze(['paintedWall', 'acousticPanel']),
  ceiling: Object.freeze(['paintedWall']),
  tableTop: Object.freeze(['woodTable', 'neutralLaminate']),
  chairFrame: Object.freeze(['darkGraphite', 'metalFrame']),
  chairSeat: Object.freeze(['fabricChair']),
  equipment: Object.freeze(['blackEquipment']),
  partition: Object.freeze(['glassPartition']),
  acoustic: Object.freeze(['acousticPanel']),
  stage: Object.freeze(['stageSurface']),
});

// ── 부품별 마감(PART_FINISH) ────────────────────────────────────────────────
// 왜 필요한가: 지금은 의자 프레임·책상 각관·금속 부속이 전부 `metalFrame` 하나를 쓴다.
//   그래서 Aeron 계열 의자 프레임을 만들어도 **번들거리는 금속**으로 보인다.
//   부품마다 어떤 재질을 쓰고, 필요하면 거칠기·금속성을 얼마나 조정할지 여기에 적는다.
//
// **이번 단계에서는 화면에 연결하지 않는다.**
//   · 여기 적힌 부품 이름(chairFrame·monitorBody…)은 **지금 쓰는 부품 이름(PART_MATERIAL의
//     chairSeat·monitorBase…)과 하나도 겹치지 않는다.** 그래서 나중에 누가 이 표를 아무 생각 없이
//     연결해도 기존 가구의 재질이 바뀌지 않는다(테스트로 고정).
//   · 모르는 부품이 들어오면 null을 돌려준다 = 지금 하던 대로 하라는 뜻.
export const PART_FINISH = Object.freeze({
  // 오피스 체어 — 프레임 계열은 금속이 아니라 그라파이트 폴리머다.
  //   색은 전부 그라파이트·차콜 계열이되 **완전한 검정 하나로 칠하지 않는다** —
  //   새까맣게 칠하면 곡면과 부품 경계가 죽어 덩어리 하나로 보인다.
  //   프레임 · 메시 · 방석 사이에 아주 미세한 명도 차만 준다(오너 지침 §14).
  chairFrame: Object.freeze({ material: 'darkGraphite', color: '#3a3e44' }),
  chairArmPad: Object.freeze({ material: 'darkGraphite', color: '#33373d', roughness: 0.74 }),
  chairCaster: Object.freeze({ material: 'darkGraphite', color: '#2e3238', roughness: 0.60 }),
  chairColumn: Object.freeze({ material: 'darkGraphite', color: '#41464d', metalness: 0.14 }),
  chairMesh: Object.freeze({ material: 'fabricChair', color: '#454a51' }),
  chairCushion: Object.freeze({ material: 'fabricChair', color: '#3d4147' }),
  // AV 장비 — 전부 near-black. 스탠드만 살짝 금속성을 준다.
  monitorBody: Object.freeze({ material: 'blackEquipment' }),
  monitorStand: Object.freeze({ material: 'blackEquipment', metalness: 0.24 }),
  prompterBody: Object.freeze({ material: 'blackEquipment' }),
  keyboardBody: Object.freeze({ material: 'blackEquipment', roughness: 0.60 }),
  // 건축 마감
  glassWall: Object.freeze({ material: 'glassPartition' }),
  acousticWall: Object.freeze({ material: 'acousticPanel' }),
  boardroomTop: Object.freeze({ material: 'lightOak' }),        // 별칭으로도 적을 수 있다
  // 대기업 회의 테이블 상판 — 따뜻한 밝은 중성색. **순백은 쓰지 않는다**:
  //   새하얀 상판은 3D에서 플라스틱 판처럼 보이고, 어두운 의자와 대비가 과해진다.
  corporateTop: Object.freeze({ material: 'neutralLaminate', color: '#e9e4da' }),
});

/**
 * **같은 마감을 쓰는 부품의 다른 이름.** 새 마감을 만들지 않고 기존 것을 가리킨다.
 *   헤드레스트는 실제 의자에서도 방석·등받이와 같은 마감이다 — 계약(finishParts)이 그렇게 적어 두었고,
 *   여기서 그 선언을 그대로 따른다. 새 항목을 만들면 두 곳이 언젠가 어긋난다.
 */
export const PART_FINISH_ALIASES = Object.freeze({
  chairHeadrest: 'chairCushion',
});

/**
 * 부품 → 마감. **모르는 부품이면 null**(= 지금 동작 그대로).
 * 돌려주는 값은 정식 재질 id로 풀어 둔 것이라, 받는 쪽이 별칭을 또 해석할 필요가 없다.
 * @returns {{material:string, roughness?:number, metalness?:number}|null}
 */
export function finishForPart(partId) {
  const f = PART_FINISH[partId] || PART_FINISH[PART_FINISH_ALIASES[partId]];
  if (!f) return null;
  const material = resolveMaterialId(f.material);
  if (!material) return null;   // 없는 재질을 가리키면 없는 것으로 친다(가짜 스펙 금지)
  return Object.freeze({ ...f, material });
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
  highTop: 'woodTable', highLeg: 'metalFrame',
  stoolSeat: 'fabricChair', stoolBase: 'metalFrame',
  loungeSeat: 'fabricChair', loungeBack: 'fabricChair', loungeLeg: 'metalFrame',
  collabTop: 'woodTable', collabLeg: 'metalFrame',
  standBase: 'metalFrame', standPole: 'metalFrame',
  bodySkin: 'paintedWall', bodyTop: 'fabricChair', bodyLeg: 'fabricChair',
  rug: 'carpetTile',
  riserTop: 'stageSurface', riserSide: 'stageSurface',
  plantPot: 'paintedWall',
});
