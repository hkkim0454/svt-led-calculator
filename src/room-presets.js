// room-presets.js — 공간(방) 타입 프리셋과 가구 '배치' 계산 (순수 함수, DOM 없음).
// ─────────────────────────────────────────────────────────────────────────────
// 회의실·강의실·강당·상황실처럼 공간 성격을 고르면, 그 성격에 맞는 가구를 방 크기에
// 맞춰 자동으로 놓는다. 이 파일은 '무엇을 어디에 놓을지'(좌표)만 계산하고,
// 실제 입체 도형은 furniture3d.js, 그리는 일은 render3d.js가 맡는다.
//
// 좌표계는 scene3d.js와 같다 (단위 mm)
//   X : 0 = 방 왼쪽 벽 → W = 오른쪽 벽
//   Z : 0 = LED가 붙은 벽 → D = 방 뒤쪽(열린 쪽)
//   rotY : 가구가 바라보는 방향(도). 0 = LED 벽을 바라봄(정면), 180 = 반대
//
// 배치 결과(item) : { type, x, z, rotY, ...크기 }
//   x·z 는 물건의 '중심' 위치(mm).
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const DEG = Math.PI / 180;

// 몇 개나 들어가는지 = 쓸 수 있는 길이 ÷ 한 칸 간격 (최소 0)
const fitCount = (available, pitch) => Math.max(0, Math.floor(available / pitch));

// ── 의자 방향 ───────────────────────────────────────────────────────────────
// 의자는 rotY = 0 일 때 -Z(LED 벽) 쪽을 바라본다. 아래 함수는 '바라볼 지점'을 주면
// 그 쪽을 향하는 각도를 계산한다.
//
// ※ 규칙: 의자를 놓을 때는 각도를 손으로 적지 말고 반드시 이 함수에
//   '맞닿는 테이블(책상·콘솔)의 중심'을 넘긴다. 손으로 적으면 방향이 뒤집히기 쉽다.
//   (tests/room-presets.test.js 가 모든 의자에 대해 이 규칙을 검사한다.)
export function faceTowards(x, z, targetX, targetZ) {
  const dx = targetX - x, dz = targetZ - z;
  if (!dx && !dz) return 0;
  return (Math.round(Math.atan2(dx, -dz) / DEG) + 360) % 360;
}

// 의자 하나를 만든다. faceX·faceZ 는 이 의자가 바라볼 대상(테이블 중심 등).
const chairAt = (x, z, faceX, faceZ, type = 'chair') => ({ type, x, z, rotY: faceTowards(x, z, faceX, faceZ) });

// 좌석을 여러 구간에 '정원 비례'로 나눈다(한쪽에만 몰리지 않게).
// caps = 구간별 최대 수용 인원. 반환 = 구간별 배정 인원(합계 ≤ total, 각 구간 ≤ cap).
export function distributeSeats(total, caps) {
  const sum = caps.reduce((a, b) => a + b, 0);
  if (sum <= 0) return caps.map(() => 0);
  const n = clamp(Math.round(total), 0, sum);
  const raw = caps.map(c => (n * c) / sum);
  const out = raw.map(v => Math.floor(v));
  let left = n - out.reduce((a, b) => a + b, 0);
  // 남은 자리는 소수점이 큰 구간부터, 같으면 정원이 큰 구간부터
  const order = caps.map((_, i) => i).sort((a, b) => (raw[b] - out[b]) - (raw[a] - out[a]) || caps[b] - caps[a]);
  for (const i of order) { if (left <= 0) break; if (out[i] < caps[i]) { out[i]++; left--; } }
  for (let i = 0; left > 0 && i < out.length; i++) { while (left > 0 && out[i] < caps[i]) { out[i]++; left--; } }
  return out;
}

// ── 가구 기본 치수(mm) ──────────────────────────────────────────────────────
// 실제 사무가구 표준값에 맞춘 기준 치수. 렌더 모양의 기준이자 '몇 명 앉나' 계산의 근거.
import { isOccupied } from './viewangle.js?v=451';
import { conferenceAVItems } from './conference-av.js?v=451';
import { controlAVItems } from './control-av.js?v=451';

export const FURNITURE = Object.freeze({
  chairPitch: 700,        // 회의용 의자 1인 간격
  chairClear: 650,        // 테이블 모서리 ~ 의자 중심 거리
  deskW: 1400, deskD: 600, deskPitchX: 1700, deskPitchZ: 1550,   // 강의실 책상(1인용)
  deskW2: 1800, deskPitchX2: 2150, deskSeatDx: 440,              // 2인용 교육 테이블(한 대에 2명)
  seatPitchX: 550, seatPitchZ: 950,                              // 강당 관람석
  consoleW: 1800, consoleD: 900, consolePitchX: 2000, consolePitchZ: 2500,  // 상황실 콘솔
  aisleW: 1200,           // 통로 폭
  wallClear: 800,         // 벽에서 띄우는 최소 거리
  frontClear: 1800,       // LED 벽 앞 여유(첫 줄까지)
});

// ── 강당 전용 좌석 규칙(PHASE 9-b) ──────────────────────────────────────────
// 소·중·대 강당이 **같은 그림을 확대·축소한 것처럼** 보이던 문제를 푸는 표다. 세 크기가
//   첫 줄 위치(4,200mm) · 줄 간격(950mm) · 좌석 간격(550mm) · 통로 폭(1,200mm)을 모두
//   똑같이 쓰고 있었고, 그래서 방이 커질수록 뒤쪽 바닥만 넓게 비었다(대강당 9,550mm).
//
// **공용 상수(`FURNITURE.seatPitchX/seatPitchZ/aisleW`)는 손대지 않는다.** `aisleW` 는
//   교육장(강의실)이 함께 쓰고, 좌석 간격은 기존 검사가 기준으로 삼고 있다. 강당에서만
//   쓰는 값을 여기에 따로 두어, 강당을 고쳐도 다른 용도가 흔들리지 않게 한다.
//
// 각 값의 뜻:
//   pitchX/pitchZ  좌석 좌우 간격 / 줄 간격(mm). 큰 강당일수록 넉넉하게 준다.
//   aisleW         통로 하나의 폭(mm).
//   firstRowZ      LED 벽에서 첫 줄 좌석 중심까지의 거리(mm). **무대 깊이와 분리돼 있다** —
//                  PHASE 9-c 가 무대 깊이를 크기별로 바꿔도 좌석은 한 자리도 움직이지 않는다.
//   stageClear     무대 뒷면과 첫 줄 사이에 반드시 남기는 통행 거리(mm).
//   rearMin/Max/Aim 맨 뒷줄과 뒤 벽 사이에 남길 거리(mm). Aim 을 목표로 줄 수를 정하고,
//                  Min 보다 좁아지지 않게 한다. 0 으로 만들지 않는다(뒤쪽 통행로).
//   maxSeats       자동으로 놓는 좌석 수 상한. **그리기 예산**을 지키려는 값이다
//                  (대강당 기본 구성이 삼각형 200,000개를 넘지 않아야 한다).
//   centerShare    통로가 둘(블록 셋)일 때 가운데 블록이 가져갈 비율. 0 이면 고르게 나눈다.
//   rowsPerTier    단 하나에 들어갈 줄 수(자동 단 수 계산의 기준).
//   riserH         한 단 높이(mm) 기본값.
export const AUDITORIUM_SEATING = Object.freeze({
  // 소강당 — 아담하게. 단차 없이 평평한 바닥이 어울린다(줄이 적어 시야가 막히지 않는다).
  hall_s: Object.freeze({ pitchX: 570, pitchZ: 950, aisleW: 1200, firstRowZ: 4000, stageClear: 1200,
    rearMin: 1500, rearMax: 3000, rearAim: 2200, maxSeats: 140,
    centerShare: 0, rowsPerTier: 99, riserH: 200 }),
  // 중강당 — 블록 구조가 보이도록 통로를 넓히고, 방 깊이를 적극적으로 쓴다.
  hall_m: Object.freeze({ pitchX: 620, pitchZ: 1000, aisleW: 1400, firstRowZ: 4400, stageClear: 1200,
    rearMin: 2000, rearMax: 4500, rearAim: 3200, maxSeats: 280,
    centerShare: 0.44, rowsPerTier: 4, riserH: 220 }),
  // 대강당 — 좌석을 넉넉하게 벌리고 가운데 블록을 키운다. 뒤로 갈수록 단이 올라간다.
  // 뒤 여유 4,300mm — 실내 시점 카메라가 **맨 뒷줄 뒤에 서도록** 잡은 값이다.
  //   3,250mm 였을 때는 카메라가 마지막 줄 사이에 서서 좌석 하나가 화면 아래 띠의
  //   73.2% 를 덮었다(19.7% 로 내려갔다). 목표 범위(2.5 ~ 5.0m) 안쪽이다.
  hall_l: Object.freeze({ pitchX: 700, pitchZ: 1050, aisleW: 1600, firstRowZ: 4800, stageClear: 1200,
    rearMin: 2500, rearMax: 5000, rearAim: 4300, maxSeats: 430,
    centerShare: 0.44, rowsPerTier: 4, riserH: 250 }),
});

// ── 강당 전용 무대 규칙(PHASE 9-c) ──────────────────────────────────────────
// 무대도 세 크기가 같은 논리를 썼다 — **폭 = 방 폭 100%** · 깊이 2,600 · 높이 280mm.
//   방 폭을 꽉 채운 무대는 벽에서 벽까지 이어진 낮은 턱처럼 보여 '무대'로 읽히지 않고,
//   전면부에 LED·무대·발표 구역의 위계도 생기지 않았다. 크기별 비율로 바꾼다.
//
//   widthRatio     방 폭 대비 무대 폭. 좌우에 벽까지의 여백이 남아 무대가 '무대'로 읽힌다.
//   minSideMargin  무대 옆에서 벽까지 반드시 남기는 거리(mm).
//   depth          무대 깊이(mm). 첫 줄 위치는 이 값과 분리돼 있다(AUDITORIUM_SEATING.firstRowZ).
//   height         무대 높이(mm). LED 하단보다 낮아야 하므로 실제 값은 그때 한 번 더 잘린다.
//   ledMargin      LED 폭 양옆으로 무대가 더 나와 있어야 하는 거리(mm) — 화면이 무대 밖으로
//                  튀어나와 보이지 않게 한다.
export const AUDITORIUM_STAGE = Object.freeze({
  hall_s: Object.freeze({ widthRatio: 0.70, minSideMargin: 800, depth: 2200, height: 300, ledMargin: 800 }),
  hall_m: Object.freeze({ widthRatio: 0.64, minSideMargin: 1200, depth: 2800, height: 450, ledMargin: 1000 }),
  hall_l: Object.freeze({ widthRatio: 0.58, minSideMargin: 1600, depth: 3200, height: 600, ledMargin: 1200 }),
});

/** 무대 윗면과 LED 화면 아래 사이에 남기는 최소 거리(mm). 무대가 화면을 가리지 않게 한다. */
export const AUDITORIUM_STAGE_LED_CLEAR = 200;

/** 그 강당 크기의 무대 규칙. 강당이 아니면 null. */
export function auditoriumStageRule(typeId) {
  return AUDITORIUM_STAGE[typeId] || null;
}

/**
 * 강당 무대의 실제 크기(mm). 방 폭·LED 폭·LED 하단 높이를 보고 한 번에 정한다.
 *
 * @param typeId    hall_s · hall_m · hall_l
 * @param W         방 폭(mm)
 * @param ledW      LED 화면 실폭(mm). 모르면 0 — 그러면 LED 여백 조건을 빼고 정한다.
 * @param ledBottom LED 화면 아래까지의 높이(mm). 무대는 이보다 낮아야 한다.
 * @returns {{w, d, h}} 또는 null(강당이 아닐 때)
 */
export function auditoriumStageSize(typeId, W, ledW = 0, ledBottom = 1000) {
  const R = auditoriumStageRule(typeId);
  if (!R) return null;
  const maxW = Math.max(1000, W - R.minSideMargin * 2);
  // LED 화면보다 좌우로 더 넓어야 한다. 방이 좁아 둘 다 만족할 수 없으면 벽 여백이 이긴다.
  const needW = ledW > 0 ? ledW + R.ledMargin * 2 : 0;
  const w = Math.min(maxW, Math.max(Math.round(W * R.widthRatio / 100) * 100, needW));
  // 높이 — LED 화면 아래를 침범하지 않게 자른다(하단 높이가 낮은 방에서 걸린다).
  const bottom = Number.isFinite(ledBottom) ? ledBottom : 1000;
  const h = clamp(R.height, 120, Math.max(120, bottom - AUDITORIUM_STAGE_LED_CLEAR));
  return { w: Math.max(1000, w), d: R.depth, h };
}

/**
 * 강당 LED 화면의 **권장 설치 크기**(mm). 화면이 이 값을 ②번 칸에 넣으면, 캐비닛 수·전력 같은
 *   산출은 늘 하던 대로 그 크기를 채우는 계산으로 나온다. **여기서 스펙을 지어내지 않는다** —
 *   정하는 것은 '얼마나 큰 화면을 세울지'라는 요청값뿐이다.
 *
 * 근거: 관람용 화면의 통용 기준 — **가장 먼 좌석까지의 거리가 화면 높이의 6배를 넘지 않게** 한다.
 *   강당은 방이 깊을수록 뒷자리가 멀어지는데 기본값(4,000×2,300)은 방 크기를 보지 않아
 *   대강당에서 화면이 벽의 점처럼 보였다(실내 시점 점유 1.55%).
 *
 * @param typeId hall_s · hall_m · hall_l (그 밖이면 null — 다른 용도의 기본값은 건드리지 않는다)
 * @param room   { W, H, D, ledBottom, lastRowZ } — 마지막 줄 위치를 모르면 방 깊이로 대신한다.
 * @returns {{w, h}} 또는 null
 */
export function auditoriumLedSize(typeId, { W, H, D, ledBottom = 1000, lastRowZ = 0 } = {}) {
  if (!auditoriumStageRule(typeId)) return null;
  const R = auditoriumStageRule(typeId);
  const far = Math.max(0, lastRowZ > 0 ? lastRowZ + 300 : D * 0.85);
  // 필요한 화면 높이 — 가장 먼 좌석 거리 ÷ 6. 화면비는 16:9 로 잡는다.
  let h = far / 6;
  let w = h * (16 / 9);
  // 벽 안에 들어와야 한다. 폭이 걸리면 폭을 기준으로 높이를 다시 잡는다(화면비 유지).
  const maxW = Math.max(1000, W - R.minSideMargin * 2);
  const maxH = Math.max(600, H - Math.max(0, ledBottom) - AUDITORIUM_LED_TOP_CLEAR);
  if (w > maxW) { w = maxW; h = w * (9 / 16); }
  if (h > maxH) { h = maxH; w = h * (16 / 9); }
  const round100 = v => Math.max(100, Math.round(v / 100) * 100);
  const size = { w: round100(Math.min(w, maxW)), h: round100(Math.min(h, maxH)) };
  // **제품 기본값(4,000×2,300)보다 작게 제안하지 않는다.** 공간 타입을 바꿨다는 이유로
  //   오너가 세우려던 화면이 줄어들면 안 된다(캐비닛 수·전력 산출이 함께 줄어든다).
  //   벽이 그보다 좁으면 화면의 기존 제한(`clampLedInputs`)이 마지막에 잘라 준다.
  if (size.w <= AUDITORIUM_LED_MIN.w || size.h <= AUDITORIUM_LED_MIN.h) {
    return { w: AUDITORIUM_LED_MIN.w, h: AUDITORIUM_LED_MIN.h };
  }
  return size;
}

/** 강당 LED 권장 크기의 하한 — 제품 기본값(4,000×2,300)보다 작게 제안하지 않는다. */
export const AUDITORIUM_LED_MIN = Object.freeze({ w: 4000, h: 2300 });
/** LED 화면 위쪽으로 남기는 최소 여유(mm). */
export const AUDITORIUM_LED_TOP_CLEAR = 300;

/** 한 단이 올라갈 수 있는 최대 높이(mm) — 강당에만 적용한다(상황실 콘솔 단은 그대로다). */
export const AUDITORIUM_MAX_RISER = 450;

/** 통로가 통로 구실을 하려면 적어도 이만큼은 비어야 한다(mm). 사람이 지나다니는 폭이다. */
export const AUDITORIUM_MIN_AISLE = 900;

/** 그 강당 크기의 좌석 규칙. 강당이 아닌 용도를 물으면 소강당 규칙을 돌려준다. */
export function auditoriumSeating(typeId) {
  return AUDITORIUM_SEATING[typeId] || AUDITORIUM_SEATING.hall_s;
}

// ── U자 테이블의 크기 상한 ───────────────────────────────────────────────────
// U자 배치는 **방이 아무리 커도** 테이블을 무한정 키우지 않는다. 상한이 곧 좌석 정원이다.
//   기본값(9,000 × 4,500)에서는 뒤 12석 + 날개 4석씩 = **정확히 20석**이 한계다 —
//   대회의실에서 "방을 키워도 20석에서 막힌다"는 현상의 원인이 바로 이 두 숫자다.
//
// 상한을 **전역으로** 올리면 임원 회의실(같은 U자 배치)의 테이블 크기까지 같이 변한다.
//   그래서 올리지 않고, **공간 디자인별 상한표**를 둔다. 여기에 이름이 없는 디자인은
//   `default`를 그대로 쓰므로 기존 화면(임원 회의실 포함)은 숫자 하나도 달라지지 않는다.
export const U_TABLE_LIMITS = Object.freeze({
  // 기존 값. **바꾸지 않는다** — 임원 회의실(executive-u)이 이 값 위에 서 있다.
  default: Object.freeze({ maxTableW: 9000, maxTableD: 4500 }),
  // 대회의실 전용. 24~30석급 장면을 만들 수 있는 최소한으로만 올린다(PHASE 4-b).
  //   12,000 × 6,500 → 뒤 16석 + 날개 7석씩 = 최대 30석.
  largeConference: Object.freeze({ maxTableW: 12000, maxTableD: 6500 }),
});

/** 그 공간 디자인의 U자 테이블 상한. 적어 두지 않은 디자인은 기본값 그대로다. */
export function uTableLimits(designId) {
  return U_TABLE_LIMITS[designId] || U_TABLE_LIMITS.default;
}

// 좌석마다 개인 모니터를, 가운데에 프롬프터를 놓는 공간(PHASE 4-c).
//   **여기 없는 디자인에는 AV 항목이 하나도 생기지 않는다** — 다른 공간은 그대로다.
export const U_TABLE_AV_DESIGNS = Object.freeze(['largeConference']);
export function wantsConferenceAV(designId) {
  return U_TABLE_AV_DESIGNS.includes(designId);
}

// ── 테이블 방향 옵션 ────────────────────────────────────────────────────────
// **대회의실에만** 있는 옵션이다. 다른 공간에서는 화면에 나오지도, 적용되지도 않는다 —
//   대기업·임원 회의실은 옵션 값이 저장돼 있더라도 **가로 배치 그대로**다.
// 콘솔마다 운용 모니터 2대 + 키보드 1개를 놓는 공간(PHASE 5-c).
//   **여기 없는 디자인에는 AV 항목이 하나도 생기지 않는다** — 다른 공간은 그대로다.
export const CONSOLE_AV_DESIGNS = Object.freeze(['controlRoom']);
export function wantsControlAV(designId) {
  return CONSOLE_AV_DESIGNS.includes(designId);
}

export const TABLE_DIR_DESIGNS = Object.freeze(['largeConference']);
export function wantsTableDir(designId) {
  return TABLE_DIR_DESIGNS.includes(designId);
}
/** 실제로 적용할 방향. 그 디자인에 옵션이 없으면 언제나 'across'(지금까지의 배치)다. */
export function tableDirOf(o = {}) {
  return (wantsTableDir(o.design) && o.tableDir === 'along') ? 'along' : 'across';
}
/**
 * 그 공간 디자인에서 **화면에 보여 줄** 옵션 목록.
 *   `designs`가 적힌 옵션은 거기 이름이 있는 디자인에서만 나온다(그 외에는 숨긴다).
 */
export function optionsForDesign(typeId, designId) {
  return roomType(typeId).options.filter(o => !o.designs || o.designs.includes(designId));
}

// ── 공간 타입 ───────────────────────────────────────────────────────────────
// depthFactor : '공간 깊이 D'를 비워뒀을 때 가로(W)에 곱해 쓰는 기본 비율.
//               강당처럼 깊은 공간은 자동값도 깊어야 한다.
// options     : 화면에 띄울 옵션 목록(키·라벨·형식·기본값).
export const ROOM_TYPES = Object.freeze([
  {
    id: 'meeting', label: '회의실', depthFactor: 0.85, minDepth: 4000,
    options: [
      { key: 'tableShape', label: '테이블 모양', type: 'select', default: 'boat',
        choices: [
          { value: 'boat', label: '보트형(회의용)' },
          { value: 'rect', label: '사각형' },
          { value: 'round', label: '원형' },
          { value: 'u', label: 'U자형' },
          { value: 'none', label: '없음' },
        ] },
      { key: 'seats', label: '좌석 수', type: 'number', default: 12, min: 0, max: 60 },
      // **대회의실 전용 옵션**(designs). 다른 공간 디자인에서는 화면에 나오지도, 적용되지도 않는다.
      //   가로 = 지금까지의 배치. 세로 = 깊이축이 긴 변이 되는 배치(세로로 긴 실제 도면 대응).
      { key: 'tableDir', label: '테이블 방향', type: 'select', default: 'across',
        designs: Object.freeze(['largeConference']),
        choices: [
          { value: 'across', label: '가로(권장)' },
          { value: 'along', label: '세로' },
        ] },
      { key: 'credenza', label: 'AV 수납장', type: 'toggle', default: true },
      // 아래 둘은 '가구 배치'가 아니라 정면 벽에 거는 화면이라 layoutMeeting이 쓰지 않는다.
      //   화면(app.js)이 이 값을 읽어 LED 옆에 모니터를 건다.
      { key: 'sideMonitor', label: 'LED 옆 모니터', type: 'select', default: 'none',
        choices: [
          { value: 'none', label: '없음' },
          { value: 'left', label: '왼쪽' },
          { value: 'right', label: '오른쪽' },
          { value: 'both', label: '양쪽' },
        ] },
      { key: 'sideMonitorIn', label: '모니터 인치', type: 'select', default: '55',
        choices: [43, 49, 55, 65, 75, 85, 98].map(n => ({ value: String(n), label: `${n}인치` })) },
      { key: 'rug', label: '러그', type: 'toggle', default: true },
      { key: 'plant', label: '화분', type: 'toggle', default: true },
    ],
  },
  {
    id: 'classroom', label: '강의실', depthFactor: 1.1, minDepth: 6000,
    options: [
      { key: 'deskType', label: '책상 형태', type: 'select', default: 'single',
        choices: [
          { value: 'single', label: '1인용 (1,400mm)' },
          { value: 'double', label: '2인용 테이블 (1,800mm)' },
        ] },
      { key: 'rows', label: '책상 줄 수', type: 'number', default: 4, min: 1, max: 20 },
      { key: 'cols', label: '줄당 책상 수', type: 'number', default: 4, min: 1, max: 20 },
      { key: 'aisle', label: '가운데 통로', type: 'toggle', default: true },
      { key: 'podium', label: '강사 영역(교탁·강사석)', type: 'toggle', default: true },
      { key: 'plant', label: '화분', type: 'toggle', default: false },
    ],
  },
  {
    id: 'hall_s', label: '소강당', depthFactor: 1.2, minDepth: 8000,
    options: hallOptions('hall_s', false),
  },
  {
    id: 'hall_m', label: '중강당', depthFactor: 1.35, minDepth: 12000,
    options: hallOptions('hall_m', true),
  },
  {
    id: 'hall_l', label: '대강당', depthFactor: 1.6, minDepth: 18000,
    options: hallOptions('hall_l', true),
  },
  {
    // 아이디에이션(협업) 공간 — 줄 맞춘 좌석이 아니라 '구역'으로 흩어 놓는다.
    //   가구를 많이 넣는 것이 목표가 아니라 **비워 둔 바닥이 보이는 것**이 목표다.
    id: 'ideation', label: '아이디에이션', depthFactor: 0.95, minDepth: 5000,
    options: [
      { key: 'highTables', label: '하이 테이블 수', type: 'number', default: 1, min: 0, max: 3 },
      { key: 'stools', label: '테이블당 스툴 수', type: 'number', default: 4, min: 0, max: 8 },
      { key: 'collabTables', label: '협업 테이블 수', type: 'number', default: 2, min: 0, max: 4 },
      { key: 'lounge', label: '라운지 좌석', type: 'toggle', default: true },
      { key: 'mobileStand', label: '이동식 디스플레이', type: 'toggle', default: true },
      { key: 'rug', label: '러그', type: 'toggle', default: true },
      { key: 'plant', label: '화분', type: 'toggle', default: true },
    ],
  },
  {
    id: 'control', label: '상황실', depthFactor: 1.0, minDepth: 6000,
    options: [
      { key: 'consoleRows', label: '콘솔 줄 수', type: 'number', default: 2, min: 1, max: 8 },
      { key: 'perRow', label: '줄당 콘솔 수', type: 'number', default: 4, min: 1, max: 12 },
      { key: 'tiers', label: '콘솔 단 수', type: 'number', default: 1, min: 1, max: 8 },
      { key: 'riserH', label: '한 단 높이(mm)', type: 'number', default: 200, min: 0, max: 900 },
      { key: 'tierStartRow', label: '단 시작 줄 (0=자동)', type: 'number', default: 0, min: 0, max: 8 },
      { key: 'backTable', label: '뒤쪽 회의 테이블', type: 'toggle', default: true },
      { key: 'plant', label: '화분', type: 'toggle', default: false },
    ],
  },
]);

function hallOptions(size, twoAisles) {
  const P = AUDITORIUM_SEATING[size];
  return [
    // 줄 수·줄당 좌석 수의 기본값은 **0 = 자동**이다(PHASE 9-b). 방 깊이·폭을 보고
    //   크기별 규칙(AUDITORIUM_SEATING)대로 채운다. 숫자를 직접 넣으면 그 값을 쓴다.
    { key: 'rows', label: '좌석 줄 수 (0=자동)', type: 'number', default: 0, min: 0, max: 40 },
    { key: 'seatsPerRow', label: '줄당 좌석 수 (0=자동)', type: 'number', default: 0, min: 0, max: 60 },
    { key: 'aisles', label: '통로', type: 'select', default: twoAisles ? '2' : '1',
      choices: [{ value: '0', label: '없음' }, { value: '1', label: '가운데 1개' }, { value: '2', label: '양쪽 2개' }] },
    { key: 'stage', label: '무대(단상)', type: 'toggle', default: true },
    { key: 'stageStep', label: '무대 계단', type: 'toggle', default: true },
    // 객석 단차(계단식 좌석). 단 수 1 = 평평한 바닥, **0 = 자동**(줄 수에 맞춰 정한다).
    //   뒷줄로 갈수록 한 단씩 올라가 앞사람 머리에 시야가 가리지 않게 한다.
    { key: 'tiers', label: '객석 단 수 (0=자동)', type: 'number', default: 0, min: 0, max: 20 },
    { key: 'riserH', label: '한 단 높이(mm)', type: 'number', default: P.riserH, min: 0, max: 900 },
    { key: 'tierStartRow', label: '단 시작 줄 (0=자동)', type: 'number', default: 0, min: 0, max: 40 },
    { key: 'occupancy', label: '착석률 (%)', type: 'number', default: 0, min: 0, max: 100 },
    { key: 'plant', label: '화분', type: 'toggle', default: false },
  ];
}

export const DEFAULT_ROOM_TYPE = 'meeting';

export function roomType(id) {
  return ROOM_TYPES.find(t => t.id === id) || ROOM_TYPES.find(t => t.id === DEFAULT_ROOM_TYPE);
}

// 타입의 기본 옵션값 묶음.
export function defaultOptions(typeId) {
  const out = {};
  for (const o of roomType(typeId).options) out[o.key] = o.default;
  return out;
}

// 저장·복원된 옵션을 타입 스키마에 맞게 안전하게 정리한다(없는 값은 기본값, 범위는 clamp).
export function normalizeOptions(typeId, raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const o of roomType(typeId).options) {
    const v = r[o.key];
    if (o.type === 'toggle') out[o.key] = (typeof v === 'boolean') ? v : o.default;
    else if (o.type === 'number') out[o.key] = clamp(int(v, o.default), o.min, o.max);
    else out[o.key] = o.choices.some(c => c.value === v) ? v : o.default;
  }
  return out;
}

// '공간 깊이 D'를 비워뒀을 때 쓸 자동 깊이(mm) — 공간 타입에 맞춰 달라진다.
export function autoDepthForType(typeId, spaceWmm) {
  const t = roomType(typeId);
  return Math.max(t.minDepth, Math.round(spaceWmm * t.depthFactor));
}

// ── 배치 계산 ───────────────────────────────────────────────────────────────
/**
 * 방 크기와 옵션에 맞춰 가구를 놓는다.
 * @param {string} typeId  공간 타입 id
 * @param {object} opts    옵션값(normalizeOptions 통과본)
 * @param {object} room    { W, D }  (mm)
 * @returns {{items:Array, placed:object, capacity:number, notes:string[]}}
 *   items    : 배치된 물건들
 *   placed   : 실제로 놓인 개수(요청보다 적을 수 있음 — 방에 안 들어가면 줄인다)
 *   capacity : 이 방에 최대 몇 석까지 들어가는지
 *   notes    : 사용자에게 알릴 말(요청보다 줄었을 때 등)
 */
export function layoutRoom(typeId, opts, room) {
  // LED 하단 높이는 옵션이 아니라 계산값이다 — 화면이 넘겨주면 배치가 참고한다
  //   (지금은 AV 수납장이 LED와 부딪히는지 판단하는 데만 쓴다).
  // 공간 디자인 id — **배치를 바꾸라는 뜻이 아니다.** U자 테이블의 크기 상한처럼
  //   디자인마다 다를 수밖에 없는 값 하나를 고르는 데만 쓴다. 없으면 전부 기본값이다.
  const o = { ...normalizeOptions(typeId, opts), ledBottom: Number(room.ledBottom),
    // LED 화면 실폭(mm) — 강당 무대가 화면보다 좁아지지 않게 하는 데만 쓴다(PHASE 9-c).
    ledW: Number(room.ledW) || 0,
    design: (typeof room.design === 'string' && room.design) ? room.design : null };
  const W = Math.max(1000, room.W), D = Math.max(1000, room.D);
  switch (roomType(typeId).id) {
    case 'classroom': return layoutClassroom(o, W, D);
    // 강당 셋은 한 배치 함수를 쓰되, **어느 크기인지**를 넘겨 크기별 좌석 규칙을 고른다.
    case 'hall_s': case 'hall_m': case 'hall_l': return layoutHall(o, W, D, roomType(typeId).id);
    case 'control': return layoutControl(o, W, D);
    case 'ideation': return layoutIdeation(o, W, D);
    case 'meeting': default: return layoutMeeting(o, W, D);
  }
}

// ── 회의실 ──────────────────────────────────────────────────────────────────
// AV 수납장 — LED 벽 아래에 붙이는 낮은 수납장(신호 분배기·앰프가 들어가는 자리).
//   장식이 아니라 공간의 현실감을 위한 보조 요소라 아주 단순하게, 방 폭에 맞춰 놓는다.
//   LED 하단이 낮으면(수납장 높이 + 여유보다 낮으면) 부딪히므로 놓지 않는다.
const CREDENZA = Object.freeze({ h: 700, d: 450, minW: 1200, maxW: 2400, clearMm: 150 });
function addCredenza(items, W, ledBottom) {
  if (Number.isFinite(ledBottom) && ledBottom < CREDENZA.h + CREDENZA.clearMm) return false;
  const w = clamp(W * 0.34, CREDENZA.minW, CREDENZA.maxW);
  items.push({ type: 'credenza', x: W / 2, z: CREDENZA.d / 2 + 30, rotY: 0, w, d: CREDENZA.d });
  return true;
}

function layoutMeeting(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  // LED 벽 아래 AV 수납장 — 테이블 모양과 무관하게 같은 자리다.
  if (o.credenza) addCredenza(items, W, o.ledBottom);
  const usableW = W - F.wallClear * 2;
  const usableD = D - F.frontClear - F.wallClear;
  const cz = F.frontClear + usableD / 2;                       // 테이블 중심 깊이

  if (o.tableShape === 'none') {
    const seats = layoutLooseChairs(o.seats, W, D, items);
    if (o.plant) addPlant(items, W, D);
    return { items, placed: { chairs: seats }, capacity: seats, notes };
  }

  if (o.tableShape === 'round') {
    const dia = clamp(Math.min(usableW, usableD) - F.chairClear * 2, 1000, 2600);
    const ring = dia / 2 + F.chairClear;
    const capacity = Math.max(2, Math.floor((2 * Math.PI * ring) / F.chairPitch));
    const n = clamp(o.seats, 0, capacity);
    items.push({ type: 'table', shape: 'round', x: W / 2, z: cz, rotY: 0, w: dia, d: dia });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // 원 둘레에 놓고, 방향은 '테이블 중심'을 바라보도록 계산한다(각도를 직접 적지 않는다).
      items.push(chairAt(W / 2 + Math.sin(a) * ring, cz + Math.cos(a) * ring, W / 2, cz));
    }
    if (n < o.seats) notes.push(`원형 테이블 둘레상 ${capacity}석까지 들어갑니다.`);
    if (o.rug) items.push({ type: 'rug', x: W / 2, z: cz, rotY: 0, w: dia + 3000, d: dia + 3000 });
    if (o.plant) addPlant(items, W, D);
    return { items, placed: { chairs: n }, capacity, notes };
  }

  if (o.tableShape === 'u') return layoutUTable(o, W, D, cz, items);

  // 사각형 · 보트형 — 긴 변 양쪽 + 양 끝에 앉는다.
  //   테이블 길이는 '방 크기'가 아니라 '앉을 사람 수'에 맞춘다(방을 꽉 채우지 않게).
  //   셈법은 **가로·세로가 똑같다** — 어느 쪽이 긴 변인지만 다르다(rectTableFit 하나로 푼다).
  const along = tableDirOf(o) === 'along';
  const fit = rectTableFit(along ? usableD : usableW, along ? usableW : usableD, o.seats);
  const { tLong, tShort, perSide, ends, capacity, n } = fit;
  // 세로면 테이블을 90° 돌려 세운다 — 긴 변이 깊이축(Z)으로 간다.
  //   상판 도형(보트의 불룩함·다리 자리)은 제 좌표계에서 만들어지므로 돌리기만 하면 된다.
  items.push({ type: 'table', shape: o.tableShape, x: W / 2, z: cz, rotY: along ? 90 : 0,
    w: tLong, d: tShort });

  // 양쪽 긴 변에 번갈아 채우고, 남으면 양 끝에 앉힌다.
  let left = n;
  const sideN = [Math.min(perSide, Math.ceil(left / 2)), 0];
  sideN[1] = Math.min(perSide, left - sideN[0]);
  left -= sideN[0] + sideN[1];
  for (let s = 0; s < 2; s++) {
    // 테이블 긴 변 양쪽. 방향은 '바로 앞 테이블 면'을 바라보게 계산한다.
    const off = (s === 0 ? 1 : -1) * (tShort / 2 + F.chairClear);
    const span = (sideN[s] - 1) * F.chairPitch;
    for (let i = 0; i < sideN[s]; i++) {
      const d = -span / 2 + i * F.chairPitch;
      // 가로: 긴 변이 X → 좌석은 X로 늘어서고 Z로 비켜 앉는다. 세로는 그 반대다.
      if (along) items.push(chairAt(W / 2 + off, cz + d, W / 2, cz + d));
      else items.push(chairAt(W / 2 + d, cz + off, W / 2 + d, cz));
    }
  }
  for (let e = 0; e < Math.min(left, ends); e++) {   // 양 끝(상석)
    const sign = e === 0 ? 1 : -1;
    const far = sign * (tLong / 2 + F.chairClear);
    if (along) items.push(chairAt(W / 2, cz + far, W / 2, cz));
    else items.push(chairAt(W / 2 + far, cz, W / 2, cz));
  }
  if (n < o.seats) notes.push(`이 방 크기에서는 ${capacity}석까지 들어갑니다.`);
  const rugW = (along ? tShort : tLong) + 2600, rugD = (along ? tLong : tShort) + 2600;
  if (o.rug) items.push({ type: 'rug', x: W / 2, z: cz, rotY: 0, w: rugW, d: rugD });
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { chairs: n }, capacity, notes };
}

/**
 * 사각·보트형 테이블의 크기와 정원. **긴 변이 어느 축인지는 여기서 모른다** —
 *   부르는 쪽이 '긴 쪽으로 쓸 수 있는 길이'와 '짧은 쪽'을 넘긴다. 가로·세로가 같은 셈법을 쓴다.
 */
export function rectTableFit(longAvail, shortAvail, seats) {
  const F = FURNITURE;
  const maxLong = clamp(longAvail - F.chairClear * 2, 1600, 9000);
  const tShort = clamp(Math.min(1500, shortAvail - F.chairClear * 2), 900, 1800);
  const ends = (tShort >= 900) ? 2 : 0;
  const capacity = fitCount(maxLong - 400, F.chairPitch) * 2 + ends;
  const n = clamp(seats, 0, capacity);
  const perSideNeeded = Math.ceil(Math.max(0, n - ends) / 2);
  const tLong = clamp(perSideNeeded * F.chairPitch + 500, 1600, maxLong);
  return { tLong, tShort, perSide: fitCount(tLong - 400, F.chairPitch), ends, capacity, n };
}

// U자형 — LED 벽을 향해 열린 ㄷ 모양. 바깥쪽에 앉는다.
//   **세로**를 고르면(대회의실 전용) 가로 상판이 옆벽에 서고 U자가 옆으로 열린다 → layoutUTableAlong.
function layoutUTable(o, W, D, cz, seed = []) {
  const F = FURNITURE;
  if (tableDirOf(o) === 'along') return layoutUTableAlong(o, W, D, seed);
  const items = [...seed], notes = [];   // seed = 이미 놓인 것(AV 수납장 등)
  // 상한은 공간 디자인이 정한다(§U_TABLE_LIMITS). 기본값이면 기존과 **완전히 같은 수**다 —
  //   예전 코드의 `clamp(min(x, 4500), 1600, 5000)`은 4500 < 5000 이라 `clamp(x, 1600, 4500)`과 같다.
  const L = uTableLimits(o.design);
  const tW = clamp(W - F.wallClear * 2 - F.chairClear * 2, 2000, L.maxTableW);
  const tD = clamp(D - F.frontClear - F.wallClear - F.chairClear * 2, 1600, L.maxTableD);
  const seg = 900;                                    // 상판 폭
  const zBack = cz + tD / 2 - seg / 2;                // 뒤쪽 가로 상판
  items.push({ type: 'table', shape: 'rect', x: W / 2, z: zBack, rotY: 0, w: tW, d: seg });
  items.push({ type: 'table', shape: 'rect', x: W / 2 - tW / 2 + seg / 2, z: cz - seg / 2, rotY: 0, w: seg, d: tD - seg });
  items.push({ type: 'table', shape: 'rect', x: W / 2 + tW / 2 - seg / 2, z: cz - seg / 2, rotY: 0, w: seg, d: tD - seg });

  const backN = fitCount(tW - 400, F.chairPitch);
  const armN = fitCount(tD - seg - 400, F.chairPitch);
  const capacity = backN + armN * 2;
  const n = clamp(o.seats, 0, capacity);
  // 뒤·좌·우 세 구간에 정원 비례로 나눠, 한쪽에만 몰리지 않게 한다.
  const [nb, naL, naR] = distributeSeats(n, [backN, armN, armN]);

  // 뒤쪽 가로 상판 — 상판 바깥(LED에서 먼 쪽)에 앉아 상판을 바라본다.
  const spanB = (nb - 1) * F.chairPitch;
  for (let i = 0; i < nb; i++) {
    const x = W / 2 - spanB / 2 + i * F.chairPitch;
    items.push(chairAt(x, zBack + seg / 2 + F.chairClear, x, zBack));
  }
  // 좌·우 세로 상판 — 상판 바깥쪽에 앉아 상판을 바라본다.
  const zMid = cz - seg / 2;
  for (const [cnt, sign] of [[naL, -1], [naR, 1]]) {
    const armX = W / 2 + sign * (tW / 2 - seg / 2);          // 상판(팔) 중심 x
    const span = (cnt - 1) * F.chairPitch;
    for (let i = 0; i < cnt; i++) {
      const z = zMid - span / 2 + i * F.chairPitch;
      items.push(chairAt(armX + sign * F.chairClear, z, armX, z));
    }
  }
  if (n < o.seats) notes.push(`U자 배치에서는 ${capacity}석까지 들어갑니다.`);
  // AV 장비(개인 모니터·중앙 프롬프터) — **의자·테이블을 한 자리도 바꾸지 않고 덧붙이기만 한다.**
  //   자리 계산은 전부 conference-av.js(순수)가 하고, 여기서는 넘겨주고 받아 담기만 한다.
  let avCount = 0;
  if (wantsConferenceAV(o.design)) {
    const av = conferenceAVItems({
      chairs: items.filter(i => i.type === 'chair'),
      table: { cx: W / 2, cz, outerW: tW, outerD: tD, segW: seg, dir: 'across' },
      chairClear: F.chairClear,
    });
    items.push(...av.items);
    avCount = av.monitors.length;
  }
  if (o.rug) items.push({ type: 'rug', x: W / 2, z: cz, rotY: 0, w: tW + 2600, d: tD + 2600 });
  if (o.plant) addPlant(items, W, D);
  const placed = { chairs: n };
  if (avCount) { placed.monitors = avCount; placed.prompters = 1; }
  return { items, placed, capacity, notes };
}

/**
 * U자형 **세로** — 가로 상판(긴 띠)이 **오른쪽 옆벽**에 서고, U자가 왼쪽으로 열린다.
 * ─────────────────────────────────────────────────────────────────────────
 * 세로로 긴 실제 도면에 대응하고, 가운데 동선·AV 자리를 넓게 쓰기 위한 배치다(오너 결정).
 *   **좌석 수를 늘리려는 배치가 아니다** — 앞쪽 날개(LED 쪽)에는 **앉히지 않는다.**
 *   그 자리에 앉으면 LED를 등지게 되기 때문이다. 좌석 수가 목적이면 보트형·사각형 세로를 쓴다.
 *
 * 앉는 곳은 두 곳뿐이다.
 *   ① 가로 상판 바깥(오른쪽) — 방을 가로질러 본다
 *   ② 뒤쪽 날개 바깥(뒤) — LED를 정면으로 본다
 */
function layoutUTableAlong(o, W, D, seed = []) {
  const F = FURNITURE;
  const items = [...seed], notes = [];
  const L = uTableLimits(o.design);
  const seg = 900;                                   // 상판 폭
  // 깊이축이 긴 변이다. 앞은 LED 여유, 뒤는 뒷 날개 좌석 자리까지 비운다.
  const tLong = clamp(D - F.frontClear - F.wallClear - F.chairClear, 1600, L.maxTableW);
  // 가로축이 짧은 변이다. 오른쪽은 가로 상판 좌석 자리, 왼쪽은 열린 쪽이라 벽 여유만 있으면 된다.
  const tShort = clamp(W - F.wallClear * 2 - F.chairClear, 1600, L.maxTableD);
  const cx = W - F.wallClear - F.chairClear - tShort / 2;
  const cz = F.frontClear + tLong / 2;
  const headX = cx + tShort / 2 - seg / 2;           // 가로 상판(긴 띠) 중심 x
  const rearZ = cz + tLong / 2 - seg / 2;            // 뒤쪽 날개 — 여기 앉는다
  const frontZ = cz - tLong / 2 + seg / 2;           // 앞쪽 날개 — **비운다**
  items.push({ type: 'table', shape: 'rect', x: headX, z: cz, rotY: 0, w: seg, d: tLong });
  items.push({ type: 'table', shape: 'rect', x: cx - seg / 2, z: rearZ, rotY: 0, w: tShort - seg, d: seg });
  items.push({ type: 'table', shape: 'rect', x: cx - seg / 2, z: frontZ, rotY: 0, w: tShort - seg, d: seg });

  const headN = fitCount(tLong - 400, F.chairPitch);
  const wingN = fitCount(tShort - seg - 400, F.chairPitch);
  const capacity = headN + wingN;                    // 앞쪽 날개는 정원에 넣지 않는다
  const n = clamp(o.seats, 0, capacity);
  const [nh, nw] = distributeSeats(n, [headN, wingN]);

  // ① 가로 상판 바깥(오른쪽) — 상판을 바라본다.
  const spanH = (nh - 1) * F.chairPitch;
  for (let i = 0; i < nh; i++) {
    const z = cz - spanH / 2 + i * F.chairPitch;
    items.push(chairAt(headX + seg / 2 + F.chairClear, z, headX, z));
  }
  // ② 뒤쪽 날개 바깥(뒤) — 상판을 바라본다(= LED를 정면으로 본다).
  const wingCx = cx - seg / 2;
  const spanW = (nw - 1) * F.chairPitch;
  for (let i = 0; i < nw; i++) {
    const x = wingCx - spanW / 2 + i * F.chairPitch;
    items.push(chairAt(x, rearZ + seg / 2 + F.chairClear, x, rearZ));
  }
  if (n < o.seats) notes.push(`세로 U자 배치에서는 ${capacity}석까지 들어갑니다(앞쪽 날개는 비웁니다).`);

  let avCount = 0;
  if (wantsConferenceAV(o.design)) {
    const av = conferenceAVItems({
      chairs: items.filter(i => i.type === 'chair'),
      table: { cx, cz, outerW: tShort, outerD: tLong, segW: seg, dir: 'along' },
      chairClear: F.chairClear,
    });
    items.push(...av.items);
    avCount = av.monitors.length;
  }
  if (o.rug) items.push({ type: 'rug', x: cx, z: cz, rotY: 0, w: tShort + 2600, d: tLong + 2600 });
  if (o.plant) addPlant(items, W, D);
  const placed = { chairs: n };
  if (avCount) { placed.monitors = avCount; placed.prompters = 1; }
  return { items, placed, capacity, notes };
}

// 테이블 없이 의자만(간이 배치) — 줄 맞춰 놓는다.
function layoutLooseChairs(seats, W, D, items) {
  const F = FURNITURE;
  const perRow = Math.max(1, fitCount(W - F.wallClear * 2, F.chairPitch));
  const maxRows = Math.max(1, fitCount(D - F.frontClear - F.wallClear, 900));
  const n = clamp(seats, 0, perRow * maxRows);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow), c = i % perRow;
    const inRow = Math.min(perRow, n - r * perRow);
    const span = (inRow - 1) * F.chairPitch;
    const x = W / 2 - span / 2 + c * F.chairPitch, z = F.frontClear + 600 + r * 900;
    items.push(chairAt(x, z, x, 0));   // 테이블이 없으므로 LED 벽(z=0)을 바라본다
  }
  return n;
}

// ── 강의실 ──────────────────────────────────────────────────────────────────
function layoutClassroom(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  const aisle = o.aisle ? F.aisleW : 0;
  // 2인용 테이블은 책상 한 대에 두 명이 앉는다 — 폭과 간격만 달라지고 셈법은 같다.
  const twin = o.deskType === 'double';
  const deskW = twin ? F.deskW2 : F.deskW;
  const pitchX = twin ? F.deskPitchX2 : F.deskPitchX;
  const perDesk = twin ? 2 : 1;

  const maxCols = Math.max(1, fitCount(W - F.wallClear * 2 - aisle, pitchX));
  const maxRows = Math.max(1, fitCount(D - F.frontClear - F.wallClear, F.deskPitchZ));
  const cols = clamp(o.cols, 1, maxCols), rows = clamp(o.rows, 1, maxRows);
  if (cols < o.cols || rows < o.rows) notes.push(`방 크기에 맞춰 ${cols}열 × ${rows}줄로 줄였습니다.`);

  const blockW = cols * pitchX + aisle;
  const x0 = W / 2 - blockW / 2 + pitchX / 2;
  const half = Math.ceil(cols / 2);
  for (let r = 0; r < rows; r++) {
    const z = F.frontClear + F.deskPitchZ / 2 + r * F.deskPitchZ;
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * pitchX + (o.aisle && c >= half ? aisle : 0);
      items.push({ type: 'desk', x, z, rotY: 0, w: deskW, d: F.deskD });
      // 강의용 의자 — 가구 자산만 지정한다(좌표·개수 계산은 그대로).
      //   2인용이면 책상 한 대 뒤에 두 자리를 좌우로 벌려 앉힌다.
      const seats = twin ? [-F.deskSeatDx, F.deskSeatDx] : [0];
      for (const dx of seats) items.push({ ...chairAt(x + dx, z + 750, x + dx, z), asset: 'trainingChair' });
    }
  }
  // 강사 영역 — 교탁 + 강사석. 둘 다 수강생을 바라본다(rotY 180).
  if (o.podium) {
    items.push({ type: 'podium', x: clamp(W * 0.22, 900, W - 900), z: F.frontClear * 0.6, rotY: 180 });
    const ix = clamp(W * 0.74, 1600, W - 1600);
    const iz = F.frontClear * 0.55;
    // 강사 의자는 강사 책상과 LED 벽 **사이**에 앉는다. 학생 의자와 같은 750 을 그대로 빼면
    //   중심이 z=240 이 되어 의자 뒤판이 LED 벽을 25mm 파고든다(PHASE 7-0 실측).
    //   그래서 **벽에서 최소 `chairClear`의 절반만큼 띄운다** — 방 전체에 새 여유를 도입하지
    //   않고, 좁아졌을 때만 걸리는 하한이다(LED 앞 여유가 넓어지면 750 규칙이 그대로 산다).
    const icz = Math.max(F.chairClear / 2, iz - 750);
    items.push({ type: 'desk', x: ix, z: iz, rotY: 180, w: 1500, d: 700 });
    items.push({ ...chairAt(ix, icz, ix, iz), asset: 'trainingChair' });
  }
  if (o.plant) addPlant(items, W, D);
  return {
    items,
    placed: { desks: cols * rows, chairs: cols * rows * perDesk, cols, rows, perDesk },
    capacity: maxCols * maxRows * perDesk,
    notes,
  };
}

/**
 * 계단식 단 계획 — 줄을 단에 나눈다. (순수 계산, 강당·상황실 공용)
 *
 * @param rows      전체 줄 수
 * @param tiersReq  요청 단 수
 * @param riserReq  한 단 높이(mm)
 * @param startRow  **단이 올라가기 시작하는 줄 번호(1부터)**. 0이면 줄을 단에 고르게 나눈다.
 *                  예: 6줄 2단에 startRow=4 → 1~3줄은 바닥, 4~6줄이 한 단 위.
 * @returns {{tiers, riserH, tierRows, tierStart, tierOf, notes}}
 */
export function tierPlan(rows, tiersReq, riserReq, startRow = 0) {
  const notes = [];
  const want = Math.max(1, int(tiersReq, 1));
  const tiers = clamp(want, 1, Math.max(1, rows));
  const riserH = Math.max(0, int(riserReq, 0));
  if (tiers < want) notes.push(`줄 수(${rows})보다 많은 단은 만들 수 없어 ${tiers}단으로 줄였습니다.`);

  let tierRows;
  const askStart = clamp(int(startRow, 0), 0, rows);
  if (tiers > 1 && askStart > 0) {
    // 첫 단(바닥)이 몇 줄인가 = 시작 줄 − 1. 뒤 단들이 최소 한 줄씩은 가져야 하므로 그만큼 남긴다.
    const first = clamp(askStart - 1, 1, rows - (tiers - 1));
    const rest = rows - first;
    tierRows = [first, ...Array.from({ length: tiers - 1 },
      (_, t) => Math.floor(rest / (tiers - 1)) + (t < rest % (tiers - 1) ? 1 : 0))];
    if (first !== askStart - 1) {
      notes.push(`단 시작 줄을 ${first + 1}줄로 조정했습니다(뒤 단마다 최소 1줄이 필요).`);
    }
  } else {
    // 줄을 단에 고르게 나눈다. ceil로 나누면 뒷단이 비어 요청한 단 수가 안 나온다
    //   (예: 5줄 4단 → ceil(5/4)=2 → 3단만 생김). 남는 줄은 앞단부터 하나씩 더 준다.
    tierRows = Array.from({ length: tiers },
      (_, t) => Math.floor(rows / tiers) + (t < rows % tiers ? 1 : 0));
  }
  const tierStart = [];                       // 각 단의 첫 줄 번호
  for (let t = 0, acc = 0; t < tiers; t++) { tierStart.push(acc); acc += tierRows[t]; }
  const tierOf = r => {
    for (let t = tiers - 1; t >= 0; t--) if (r >= tierStart[t]) return t;
    return 0;
  };
  return { tiers, riserH, tierRows, tierStart, tierOf, notes };
}

/**
 * 단(플랫폼) 상자를 items에 넣는다. 뒤쪽 단이 더 높아 앞 단을 덮으면서 계단 모양이 된다.
 * 각 단은 '그 단의 첫 줄 앞'부터 맨 뒤 줄 뒤까지 깔린다.
 */
function addRisers(items, { W, plan, rows, rowZ, pitchZ, platW }) {
  const { tiers, riserH, tierStart } = plan;
  if (!(riserH > 0 && tiers > 1 && rows > 0)) return;
  const zBackEdge = rowZ(rows - 1) + pitchZ * 0.75;
  for (let t = 1; t < tiers; t++) {
    const zFront = rowZ(tierStart[t]) - pitchZ * 0.55;
    if (zFront >= zBackEdge) break;
    items.push({
      type: 'riser', x: W / 2, z: (zFront + zBackEdge) / 2, rotY: 0,
      w: platW, d: zBackEdge - zFront, h: t * riserH, tier: t,
    });
  }
}

/**
 * 자동 줄 수 — 맨 뒷줄과 뒤 벽 사이에 **목표한 여유(rearAim)** 가 남을 때까지 줄을 늘린다.
 *   목표에 닿기 전이라도 최소 여유(rearMin)보다 좁아지면 멈춘다. 뒤쪽 통행로를 0 으로
 *   만들지 않는 것이 이 함수의 목적이다(PHASE 9-b §8).
 */
function auditoriumRowCount(P, D, zStart, maxRows) {
  let rows = 1;
  for (let r = 1; r <= maxRows; r++) {
    const rear = D - (zStart + (r - 1) * P.pitchZ);
    if (rear < P.rearMin) break;
    rows = r;
    if (rear <= P.rearAim) break;
  }
  return rows;
}

/**
 * 좌석을 블록으로 나눈다. 통로가 둘(블록 셋)이고 `centerShare` 가 있으면 가운데 블록을
 *   키운다 — 실제 강당처럼 가운데가 넓고 양옆이 좁은 모양이 된다. 좌우는 항상 같은 수다.
 */
function auditoriumBlocks(perRow, blocks, centerShare) {
  if (blocks === 3) {
    // 양옆을 같은 수로 맞추고 남는 좌석은 가운데가 가져간다 — 좌우 대칭이 된다.
    const 기본옆 = (centerShare > 0 && perRow >= 6)
      ? Math.round(perRow * (1 - centerShare) / 2) : Math.floor(perRow / 3);
    const side = clamp(기본옆, 1, Math.floor((perRow - 1) / 2));
    return [side, perRow - side * 2, side];
  }
  const per = Math.floor(perRow / blocks), extra = perRow % blocks;
  return Array.from({ length: blocks }, (_, i) => per + (i < extra ? 1 : 0));
}

/**
 * 강당 객석의 단 계획. **공용 `tierPlan` 을 부르기만 한다** — 상황실 콘솔 단이 같은
 *   함수를 쓰므로 그 안을 고치지 않는다(PHASE 9-b §6·§14). 강당에만 필요한 두 가지를
 *   여기서 더한다: 단 수 자동(0 = 줄 수를 `rowsPerTier` 로 나눈다)과 한 단 높이 상한.
 */
export function auditoriumTierPlan(rows, o, P) {
  const notes = [];
  const askTiers = int(o.tiers, 0);
  const tiers = askTiers > 0 ? askTiers : clamp(Math.ceil(rows / P.rowsPerTier), 1, Math.max(1, rows));
  let riserH = Math.max(0, int(o.riserH, P.riserH));
  if (riserH > AUDITORIUM_MAX_RISER) {
    notes.push(`한 단 높이를 ${AUDITORIUM_MAX_RISER}mm로 낮췄습니다(객석 단이 너무 높으면 오르내리기 어렵습니다).`);
    riserH = AUDITORIUM_MAX_RISER;
  }
  const plan = tierPlan(rows, tiers, riserH, o.tierStartRow);
  return { ...plan, notes: [...notes, ...plan.notes] };
}

/**
 * 강당 객석 단(플랫폼) 상자. 공용 `addRisers` 와 모양 규칙은 같지만 **따로 둔 함수**다 —
 *   상황실과 한 함수를 나눠 쓰면 강당을 손볼 때마다 상황실이 함께 움직이기 때문이다
 *   (PHASE 9-b §6). 각 단은 그 단의 첫 줄 앞에서 맨 뒷줄 뒤까지 깔리고, 뒤쪽 단일수록
 *   높아 계단 모양이 된다.
 */
function addAuditoriumRisers(items, { W, plan, rows, rowZ, pitchZ, platW }) {
  const { tiers, riserH, tierStart } = plan;
  if (!(riserH > 0 && tiers > 1 && rows > 0)) return;
  const zBackEdge = rowZ(rows - 1) + pitchZ * 0.75;
  for (let t = 1; t < tiers; t++) {
    const zFront = rowZ(tierStart[t]) - pitchZ * 0.55;
    if (zFront >= zBackEdge) break;
    items.push({
      type: 'riser', x: W / 2, z: (zFront + zBackEdge) / 2, rotY: 0,
      w: platW, d: zBackEdge - zFront, h: t * riserH, tier: t,
      // 재질을 상황실 콘솔 단과 나누기 위한 표식이다(PHASE 9-c). 기하는 한 값도 다르지 않다.
      variant: 'auditorium',
    });
  }
}

// ── 강당(소·중·대) ──────────────────────────────────────────────────────────
// 좌석 간격·통로 폭·첫 줄 위치·단 수는 **크기별 표**(AUDITORIUM_SEATING)에서 가져온다.
//   세 강당이 한 함수를 쓰지만 같은 숫자를 쓰지는 않는다(PHASE 9-b).
function layoutHall(o, W, D, typeId = 'hall_s') {
  const F = FURNITURE;
  const P = auditoriumSeating(typeId);
  const items = [], notes = [];
  const nAisle = int(o.aisles, 1);
  const aisleTotal = nAisle * P.aisleW;
  // 무대 — 크기별 규칙(AUDITORIUM_STAGE)이 폭·깊이·높이를 정한다(PHASE 9-c).
  //   폭은 더 이상 방 폭 100% 가 아니고, 높이는 LED 화면 아래를 침범하지 않게 잘린다.
  const 무대 = o.stage ? auditoriumStageSize(typeId, W, Math.max(0, int(o.ledW, 0)), int(o.ledBottom, 1000)) : null;
  const stageD = 무대 ? 무대.d : 0;
  // 좌석 계산은 깊이(stageD)만 쓴다. step은 계단을 붙일지 여부.
  if (무대) {
    items.push({ type: 'stage', x: W / 2, z: 무대.d / 2, rotY: 0, w: 무대.w, d: 무대.d, h: 무대.h,
      step: o.stageStep !== false, variant: 'auditorium' });
  }

  // 첫 줄은 크기별 고정값이다. 무대가 깊어지면 '무대 뒷면 + 통행 거리'가 그 값을 밀어낼 때만
  //   뒤로 물러난다(기본 구성에서는 밀리지 않는다 — PHASE 9-b 좌석 위치가 그대로다).
  const zStart = Math.max(P.firstRowZ, stageD + P.stageClear);
  const maxPerRow = Math.max(1, fitCount(W - F.wallClear * 2 - aisleTotal, P.pitchX));
  const maxRows = Math.max(1, fitCount(D - zStart - F.wallClear, P.pitchZ));
  // 0 = 자동. 줄 수는 뒤 여유 목표로, 줄당 좌석 수는 '자동 좌석 상한 ÷ 줄 수'로 정한다.
  const autoRows = auditoriumRowCount(P, D, zStart, maxRows);
  const askRows = int(o.rows, 0) > 0 ? int(o.rows, 0) : autoRows;
  const rows = clamp(askRows, 1, maxRows);
  const autoPerRow = clamp(Math.floor(P.maxSeats / rows), 1, maxPerRow);
  const askPerRow = int(o.seatsPerRow, 0) > 0 ? int(o.seatsPerRow, 0) : autoPerRow;
  const perRow = clamp(askPerRow, 1, maxPerRow);
  if (perRow < askPerRow || rows < askRows) notes.push(`방 크기에 맞춰 ${perRow}석 × ${rows}줄로 줄였습니다.`);

  // 통로 위치: 좌석을 (통로수+1)개 블록으로 나눈다. 블록 셋이면 가운데를 넓게 잡는다.
  const blocks = nAisle + 1;
  const counts = auditoriumBlocks(perRow, blocks, P.centerShare);
  const totalW = perRow * P.pitchX + aisleTotal;
  let x = W / 2 - totalW / 2 + P.pitchX / 2;
  const xs = [];
  for (const cnt of counts) {
    for (let i = 0; i < cnt; i++) { xs.push(x); x += P.pitchX; }
    x += P.aisleW;
  }
  // ── 객석 단차(계단식 좌석) ──
  //   단 수(tiers)만큼 객석을 나누고, 뒤쪽 단일수록 한 단(riserH)씩 올라간다.
  //   첫 단은 바닥(높이 0)이다 — 단 수 1이면 평평하다. 0이면 줄 수를 보고 자동으로 정한다.
  //   '단 시작 줄'을 주면 그 줄부터 올라간다(0이면 고르게 나눈다).
  const plan = auditoriumTierPlan(rows, o, P);
  const { tiers, riserH, tierStart, tierOf } = plan;
  notes.push(...plan.notes);
  const seatZ = r => zStart + r * P.pitchZ;

  addAuditoriumRisers(items, {
    W, plan, rows, rowZ: seatZ, pitchZ: P.pitchZ,
    platW: Math.min(W, perRow * P.pitchX + aisleTotal + P.pitchX),
  });

  // 착석 인원 — 좌석 위에 앉은 사람을 얹는다. 좌석 계산에는 전혀 끼어들지 않는다
  //   (좌석을 먼저 다 놓고, 그 자리 중에서 고르기만 한다).
  const occ = clamp(int(o.occupancy, 0), 0, 100);
  const seated = [];
  let seatIdx = 0;
  for (let r = 0; r < rows; r++) {
    const z = seatZ(r);
    const y = riserH > 0 ? tierOf(r) * riserH : 0;   // 그 줄이 올라앉은 단 높이
    // 무대·LED(z=0) 쪽을 바라본다. y는 좌석이 놓인 바닥 높이(단차).
    for (const sx of xs) {
      const seat = { ...chairAt(sx, z, sx, 0, 'seat'), y };
      items.push(seat);
      if (occ > 0 && isOccupied(seatIdx, occ)) {
        seated.push({ ...seat, type: 'seated' });
      }
      seatIdx++;
    }
  }
  items.push(...seated);
  if (occ > 0) notes.push(`착석 ${seated.length}명 / ${seatIdx}석 (${occ}%)`);
  if (o.plant) addPlant(items, W, D);
  if (riserH > 0 && tiers > 1) {
    notes.push(`객석 ${tiers}단 · 한 단 ${riserH}mm (맨 뒤 +${(tiers - 1) * riserH}mm)`);
  }
  const rearEmpty = D - seatZ(rows - 1);
  notes.push(`블록 ${counts.join('·')}석 · 통로 ${nAisle}개(${P.aisleW}mm) · 뒤 여유 ${rearEmpty}mm`);
  // ── 세는 수를 넷으로 나눠 적는다(PHASE 9-b §12) ──
  //   geometricCapacity  방에 **기하학적으로** 들어갈 수 있는 최대(간격만 보고 센 수)
  //   plannedSeatCount   놓으려고 정한 수(자동이든 사용자가 넣은 값이든)
  //   placedSeatCount    실제로 자리를 잡은 수
  //   renderedSeatCount  화면에 좌석으로 그린 수 — placed 와 달라지면 조용히 사라진 것이다
  const seatCount = items.filter(i => i.type === 'seat').length;
  return {
    items,
    placed: { seats: rows * xs.length, rows, perRow: xs.length, tiers, riserH,
      blocks: counts, aisleW: P.aisleW, pitchX: P.pitchX, pitchZ: P.pitchZ,
      firstRowZ: zStart, rearEmpty,
      geometricCapacity: maxRows * maxPerRow,
      plannedSeatCount: askRows * askPerRow,
      placedSeatCount: rows * xs.length,
      renderedSeatCount: seatCount },
    capacity: maxRows * maxPerRow, notes,
  };
}

// ── 아이디에이션(협업) 공간 ────────────────────────────────────────────────
// 줄·열이 없다. 방을 몇 개의 **구역**으로 나누고 각 구역에 한 덩어리씩 놓는다.
//   비율(0~1)로 자리를 잡은 뒤 벽 여유 안으로 당겨서, 방 크기가 달라져도 구성이 유지된다.
//   목표는 가구를 채우는 것이 아니라 **가운데 바닥을 비워 두는 것**이다.
//
// 구역이 차지하는 자리 — 실제 자산 치수(furniture-assets.js 의 `DIMS`)에서 잰 값이다.
//   둥근 것은 원으로, 네모난 것은 **돌아간 사각형**으로 본다. 둘을 섞어 쓰는 까닭은 정확도다.
//   전부 원으로 보면 라운지 의자처럼 길쭉하고 뒤로 치우친 물건을 41mm 만큼 넉넉하게 잡아
//   9m 기본 방까지 건드리게 되고, 반대로 좌석 치수만 보고 어림잡으면 7m 방에서 9mm 를
//   놓친다. 둘 다 PHASE 8-2a 에서 실제로 겪은 일이라 부품을 재서 모양까지 맞춘다.
//
//   스툴      좌석 반지름 190 의 원
// **PHASE 8-2b.1 HOLD-2 — 이 표를 화면에서 직접 재서 다시 썼다.**
//   예전 값은 자산 부품표의 '이름값'(w × d)을 그대로 옮긴 것이었는데, 렌더러는 둥근 모서리를
//   `ExtrudeGeometry` 의 경사(bevel)로 만들고 **그 경사가 윤곽을 사방으로 넓힌다.** 그래서
//   화면에 그려지는 물건이 부품표보다 조금 크다. 아래 값은 실제로 그려진 꼭짓점을 바닥에
//   눕혀 잰 것이다(부품표 값이 아니라 화면 실측이다).
//
//   스툴         좌판 기둥 반지름 190 의 원 — 부품표와 같다
//   협업 테이블   상판 기둥 반지름 550 의 원 — 부품표와 같다
//   화분         잎 최대 반지름 224.8 의 원(기둥 반지름 170 × 1.15 × 1.15)
//   라운지 의자   실측 830 × 789(x ±415 · z −340.8~448). 등받이 둥글림이 95mm 씩 넓힌다.
//                뒤쪽으로 치우친 양은 54mm 다.
//   이동식 스탠드 1,150 × 560 — 부품표와 같다
//   하이 테이블   상판 폭 + 17.6 × 917.6. 상판 둥글림이 8.8mm 씩 넓힌다.
const IDEATION_SHAPE = Object.freeze({
  stool: { disc: 190 },
  collabTable: { disc: 550 },
  plant: { disc: 225 },
  lounge: { hw: 415, hd: 395, dz: 54 },
  mobileStand: { hw: 575, hd: 280 },
});
/** 하이 테이블 상판 둥글림이 사방으로 넓히는 양(mm). 화면 실측. */
const IDEATION_HIGH_BEVEL = 8.8;

/** 배치 항목 → 자리 판정용 도형(세계 좌표). */
function ideationShape(it) {
  if (it.type === 'highTable') {
    return { x: it.x, z: it.z, hw: it.w / 2 + IDEATION_HIGH_BEVEL,
      hd: it.d / 2 + IDEATION_HIGH_BEVEL, rot: 0 };
  }
  const s = IDEATION_SHAPE[it.type];
  if (!s) return { x: it.x, z: it.z, disc: 250 };
  if (s.disc) return { x: it.x, z: it.z, disc: s.disc };
  // **돌리는 방향은 렌더러와 같아야 한다.** furniture-gl.js 는 `rotation.y = -rotY` 를 쓰므로
  //   물건 기준 (lx, lz) 는 세계에서 (lx·cos − lz·sin, lx·sin + lz·cos) 자리에 놓인다.
  //   PHASE 8-2b.1 HOLD-2 이전에는 여기서 **반대로** 돌려, 화면에 그려진 것과 좌우가 뒤집힌
  //   도형으로 자리를 판정했다. 등받이처럼 한쪽으로 치우친 물건에서는 판정이 통째로 어긋난다.
  const a = (it.rotY || 0) * Math.PI / 180, dz = s.dz || 0;
  return { x: it.x - dz * Math.sin(a), z: it.z + dz * Math.cos(a), hw: s.hw, hd: s.hd, rot: a };
}

/** 사각형을 제 방향으로 돌려세운 좌표계에서 본 점(위 규칙의 역변환). */
function toLocal(shape, x, z) {
  const dx = x - shape.x, dz = z - shape.z, c = Math.cos(shape.rot), sn = Math.sin(shape.rot);
  return [dx * c + dz * sn, -dx * sn + dz * c];
}

/** 두 도형이 실제로 겹치는가. 원·원, 원·사각형, 사각형·사각형을 각각 맞게 본다. */
function ideationHits(A, B) {
  if (A.disc && B.disc) return Math.hypot(A.x - B.x, A.z - B.z) < A.disc + B.disc;
  if (A.disc || B.disc) {
    const [c, r] = A.disc ? [B, A] : [A, B];           // c = 사각형, r = 원
    const [lx, lz] = toLocal(c, r.x, r.z);
    const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
    return Math.hypot(lx - qx, lz - qz) < r.disc;
  }
  // 사각형끼리 — 분리축 정리. 네 변의 법선 중 하나라도 틈이 있으면 떨어져 있다.
  const corners = S => {
    const c = Math.cos(S.rot), sn = Math.sin(S.rot), out = [];
    for (const sx of [-S.hw, S.hw]) for (const sz of [-S.hd, S.hd]) {
      out.push([S.x + sx * c - sz * sn, S.z + sx * sn + sz * c]);
    }
    return out;
  };
  const pa = corners(A), pb = corners(B);
  for (const S of [A, B]) {
    const c = Math.cos(S.rot), sn = Math.sin(S.rot);
    // 분리축 = 사각형의 두 변에 수직한 방향. 위 corners 와 같은 회전 규칙을 써야 한다.
    for (const [ux, uz] of [[c, sn], [-sn, c]]) {
      const span = pts => pts.reduce((r, p) => {
        const v = p[0] * ux + p[1] * uz;
        return [Math.min(r[0], v), Math.max(r[1], v)];
      }, [Infinity, -Infinity]);
      const [a0, a1] = span(pa), [b0, b1] = span(pb);
      if (Math.min(a1, b1) - Math.max(a0, b0) <= 0) return false;
    }
  }
  return true;
}

/**
 * 구역 하나를 놓는다.
 *
 * **왜 필요한가.** 자리를 비율로 잡고 벽 안으로 당기기만 하면, 방이 작을수록 여러 구역이
 *   같은 자리로 밀려 서로 파고든다(가로 8.5m 미만에서 실제로 그랬다). 방이 작다고 가구가
 *   서로 뚫고 지나가면 제안서 그림으로 쓸 수 없다.
 *
 * **어떻게 고치나.** 제자리가 막혔으면 **먼저 띄워 본다.** 허용 범위 안에서 제자리와 가장
 *   가까운 빈자리를 찾아 구역을 통째로 옮긴다. 그래도 놓을 자리가 없으면 그 구역을 **뺀다**
 *   (강의실·강당이 "방 크기에 맞춰 줄였습니다"로 줄 수를 줄이는 것과 같은 방식이다).
 *   가구 치수를 줄이거나 벽을 넘기지 않는다.
 *
 * 자리가 넉넉하면 첫 시도가 바로 통과하므로 **기존 배치가 한 값도 달라지지 않는다.**
 *
 * @param placed 이미 놓인 것들 `{x, z, r}`
 * @param build  `(x, z) => 그 자리에 놓을 물건들`
 * @param x0,z0  제자리
 * @param bx,bz  옮겨도 되는 범위 `[최소, 최대]`
 * @returns 놓았으면 물건 배열, 놓을 자리가 없으면 `null`
 */
function placeIdeationZone(placed, build, x0, z0, bx, bz) {
  const 빈자리인가 = (x, z) => {
    const mem = build(x, z);
    for (const m of mem) {
      const c = ideationShape(m);
      for (const p of placed) if (ideationHits(c, p)) return null;
    }
    return mem;
  };
  const 제자리 = 빈자리인가(x0, z0);
  if (제자리) return 제자리;

  // 제자리가 막혔다 — 100mm 격자에서 제자리와 가장 가까운 빈자리를 찾는다(결정적).
  const STEP = 100;
  let best = null, bestD = Infinity;
  for (let x = bx[0]; x <= bx[1] + 1; x += STEP) {
    for (let z = bz[0]; z <= bz[1] + 1; z += STEP) {
      const d = Math.hypot(x - x0, z - z0);
      if (d >= bestD) continue;
      const mem = 빈자리인가(x, z);
      if (mem) { best = mem; bestD = d; }
    }
  }
  return best;
}

function layoutIdeation(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  const pad = F.wallClear;
  const front = Math.max(F.frontClear, D * 0.18);           // LED 앞은 비워 둔다
  const px = (t, half = 0) => clamp(W * t, pad + half, W - pad - half);
  const pz = (t, half = 0) => clamp(D * t, front + half, D - pad - half);
  // 이미 놓인 것들. 구역을 놓을 때마다 여기에 쌓아 두고 다음 구역이 이것을 피한다.
  const placed = [];
  const 자리잡음 = mem => {
    for (const m of mem) { items.push(m); placed.push(ideationShape(m)); }
  };
  let 옮김 = 0, 뺌 = 0;

  // ① 하이 테이블 구역 — 서서 쓰는 협업 테이블. 스툴을 둘레에 고르게 돌린다.
  const htW = clamp(W * 0.22, 1200, 2200), htD = 900;
  const nHT = clamp(o.highTables, 0, 3);
  // **하이 테이블 자리 — PHASE 8-2c.1 에서 다시 잡았다(전경 가림 교정).**
  //
  //   제안 카메라는 '맨 뒤 내용물 뒤 1.10m' 에 선다(PHASE 8-2b). 그리고 실내 시점이 서는
  //   가로 비율이 **0.30**, 왼쪽 코너가 **0.21** 이다. 예전 첫 하이 테이블 자리가 바로 그
  //   0.30 이어서, 카메라가 하이 테이블 **바로 뒤·같은 좌우 선상**에 섰다. 그 결과 폭 2m
  //   짜리 상판이 1.7m 앞에서 화면 아래 1/4 띠의 **53.5~81.6%** 를 덮었다(PHASE 8-2c 실측).
  //   무늬 없는 판이 전경을 가려 제안서로 쓸 수 없는 그림이 됐다.
  //
  //   그래서 두 가지를 바꾼다.
  //     ① 첫 자리를 **방 가운데(0.50)** 로 옮겨 카메라 정면을 비운다.
  //     ② 깊이가 넉넉하면 둘째·셋째를 **LED 쪽 앞줄(0.30)** 로 내린다. 카메라는 맨 뒤를
  //        따라가므로 앞줄로 내려간 테이블은 그만큼 멀어진다.
  //   깊이가 모자라면 예전처럼 한 줄에 세우되 **양 끝부터** 놓는다. 가운데를 먼저 놓으면
  //   좁은 방에서 양옆이 가운데 것과 부딪혀 둘 다 빠지고 정원이 준다(6m 방 16 → 8).
  const htHalfZ0 = htD / 2 + 700;
  const 두줄 = (D - pad - front) >= htHalfZ0 * 4;
  const htSpots = 두줄
    ? [[0.50, 0.42], [0.20, 0.30], [0.80, 0.30]]
    : [[0.20, 0.42], [0.80, 0.42], [0.50, 0.42]];
  const nStool = clamp(o.stools, 0, 8);
  let stools = 0, putHT = 0;
  const htHalfX = htW / 2, htHalfZ = htHalfZ0;
  for (let i = 0; i < nHT; i++) {
    const [tx, tz] = htSpots[i];
    const x0 = px(tx, htHalfX), z0 = pz(tz, htHalfZ);
    const build = (x, z) => {
      const mem = [{ type: 'highTable', x, z, rotY: 0, w: htW, d: htD }];
      // 스툴은 긴 변(앞뒤)에 반씩. 테이블을 바라보게 둔다.
      for (let k = 0; k < nStool; k++) {
        const side = k % 2 ? 1 : -1;                        // 앞줄 / 뒷줄
        const idx = Math.floor(k / 2);
        const perSide = Math.ceil(nStool / 2);
        const span = (perSide - 1) * 620;
        mem.push({ ...chairAt(x - span / 2 + idx * 620, z + side * (htD / 2 + 430), x, z, 'stool') });
      }
      return mem;
    };
    const mem = placeIdeationZone(placed, build, x0, z0,
      [pad + htHalfX, W - pad - htHalfX], [front + htHalfZ, D - pad - htHalfZ]);
    if (!mem) { 뺌++; continue; }
    if (mem[0].x !== x0 || mem[0].z !== z0) 옮김++;
    자리잡음(mem);
    stools += nStool; putHT++;
  }

  // ② 협업 구역 — 낮은 원형 테이블 + 라운지 체어 3개.
  //
  // **왜 하이 테이블보다 앞(LED 쪽)에 두는가.** PHASE 8-2c 릴리스 게이트가 잡은 P1 두 건이
  //   여기서 나왔다. 협업 구역이 방 뒤쪽(깊이 비율 0.70·0.74)에 있으면, 제안 카메라가
  //   '맨 뒤 내용물 뒤 1.10m'에 서는 규칙(PHASE 8-2b) 때문에 언제나 협업 테이블 **2m 앞**에
  //   서게 된다. 그 거리에서 상판(바닥에서 0.70m)은 내려본 각 25°가 넘어 화면 맨 아래로
  //   밀리고, 제안 9컷 전부에서 협업 화소의 98.6~100%가 아래 1/4 띠에 갇혔다.
  //   하이 테이블은 상판이 1.05m 라 같은 거리에서도 잘리지 않는다. 그래서 **맨 뒤는 하이
  //   테이블이 맡고, 협업 구역은 그 앞으로 내려온다.** 카메라는 하이 테이블을 기준으로 서므로
  //   협업 테이블까지의 거리가 2m → 3m 대로 늘고, LED 까지의 거리도 줄어 LED 가 커진다.
  //
  // 자리는 비율로 박지 않고 **하이 테이블 구역이 실제로 차지한 범위에서 계산**한다.
  //   방 크기와 하이 테이블 개수가 달라져도 규칙이 그대로 성립해야 하기 때문이다.
  const nCT = clamp(o.collabTables, 0, 4);
  const dia = 1100;
  // 라운지 의자가 도는 반지름 — **그대로 둔다(520).** 기본 9m 방에서 두 협업 덩이를
  //   같은 줄에 세우려고 480 으로 40mm 좁혀 봤더니, 실제 자산 발자국으로 재는 검사에서
  //   6.5~8m 방에 협업 테이블↔라운지 18~25mm 겹침이 생겼다. PHASE 8-2a 가 맞춰 놓은
  //   겹침 판정 도형이 이 값에 맞춰져 있다 — 40mm 를 아끼려다 안전 규칙을 깨뜨린다.
  const ring = dia / 2 + 520;
  const ctHalf = dia / 2 + 700;                     // 벽 여유를 볼 때 쓰는 반지름(그대로)
  const 의자반 = 320;                                // 라운지 의자 발자국 반폭
  const ctHalfX = ring + 의자반, ctHalfZ = ring * 0.866 + 360;
  // 하이 테이블 구역이 실제로 차지한 범위. 없으면(하이 테이블 0개) 방 뒤쪽을 그대로 쓴다.
  const htItems = items.filter(i => i.type === 'highTable' || i.type === 'stool');
  const htX0 = htItems.length ? Math.min(...htItems.map(i => i.x - (i.w > 0 ? i.w / 2 : 250))) : null;
  const htX1 = htItems.length ? Math.max(...htItems.map(i => i.x + (i.w > 0 ? i.w / 2 : 250))) : null;
  const htZ1 = htItems.length ? Math.max(...htItems.map(i => i.z + (i.d > 0 ? i.d / 2 : 250))) : null;
  // 협업 구역의 **라운지 뒤끝이 하이 테이블 구역 뒤끝보다 앞**이어야 카메라가 하이 테이블을
  //   기준으로 선다. 그 조건과 벽 여유를 함께 만족하는 깊이 구간의 가운데를 고른다.
  const czLo = pad + ctHalfZ;
  const czHi = htItems.length ? Math.min(D - pad - ctHalfZ, htZ1 - ring * 0.866 - 1)
    : D - pad - ctHalfZ;
  // 구간 안에서 **가장 LED 쪽**에 붙인다. 카메라에서 멀어질수록 협업 테이블이 화면
  //   위쪽으로 올라오기 때문이다(거리 2.0m → 올림각 25.6°, 4.0m → 13.5°).
  const cz = clamp(czLo, czLo, Math.max(czLo, czHi));
  // 좌우로는 하이 테이블 구역을 비켜 간다. 넓은 쪽 띠에 필요한 만큼 고르게 편다.
  const 띠 = htItems.length
    ? [[pad + ctHalfX, Math.min(htX0 - 의자반, W - pad - ctHalfX)],
       [Math.max(htX1 + ctHalfX, pad + ctHalfX), W - pad - ctHalfX]]
      .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]
    : [pad + ctHalfX, W - pad - ctHalfX];
  const 폭 = Math.max(0, 띠[1] - 띠[0]);
  const ctSpots = [];
  for (let i = 0; i < nCT; i++) {
    const t = nCT === 1 ? 0.5 : i / (nCT - 1);
    ctSpots.push([띠[0] + 폭 * t, cz]);
  }
  // **이동식 디스플레이 자리를 미리 비워 두지는 않는다.** 그렇게 해 봤더니 기본 방에서
  //   둘째 협업 덩이가 하이 테이블보다 뒤(z 3.45)로 밀려, 카메라가 다시 그 덩이를 기준으로
  //   서면서 이 단계가 고치려던 문제가 그대로 돌아왔다. 협업 구역이 먼저이고, 이동식
  //   디스플레이는 기존 안전 규칙대로 0.9m 뒤로 비켜선다(같은 모서리에 그대로 남는다).
  let lounge = 0, putCT = 0;
  for (let i = 0; i < nCT; i++) {
    const [x0raw, z0] = ctSpots[i];
    const x0 = clamp(x0raw, pad + ctHalf, Math.max(pad + ctHalf, W - pad - ctHalf));
    // 라운지 의자 셋 중 **혼자 있는 쪽을 띠 바깥으로** 돌린다. 두 구역이 마주 보는 면에는
    //   의자가 하나씩만 오므로, 같은 띠 안에서 필요한 간격이 2.25m → 1.71m 로 줄어든다.
    //   (의자 개수·모양은 그대로다 — 어느 방향으로 도느냐만 바뀐다.)
    const 바깥 = nCT > 1 && i >= nCT / 2 ? -1 : 1;
    const build = (x, z) => {
      const mem = [{ type: 'collabTable', x, z, rotY: 0, w: dia, d: dia }];
      if (o.lounge) {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
          mem.push(chairAt(x + 바깥 * Math.sin(a) * ring, z + Math.cos(a) * ring, x, z, 'lounge'));
        }
      }
      return mem;
    };
    // 앞뒤 허용 범위도 'LED 앞 여유'가 아니라 **벽 여유**로 잡는다 — 협업 구역은 앉아서 쓰는
    //   낮은 자리라 LED 앞 첫 줄 규칙(frontClear)의 대상이 아니고, 그 규칙을 그대로 쓰면
    //   이 방 깊이에서는 하이 테이블 앞에 들어갈 자리가 아예 없다.
    //   **먼저 앞쪽 띠 안에서만 찾는다.** 거기서 못 찾을 때만 방 전체로 넓힌다 — 그래야
    //   좁은 방에서도 협업 구역이 카메라 뒤쪽으로 되돌아가지 않는다.
    const mem = placeIdeationZone(placed, build, x0, z0,
        [pad + ctHalf, W - pad - ctHalf], [pad + ctHalf, Math.max(pad + ctHalf, czHi)])
      || placeIdeationZone(placed, build, x0, z0,
        [pad + ctHalf, W - pad - ctHalf], [pad + ctHalf, D - pad - ctHalf]);
    if (!mem) { 뺌++; continue; }
    if (mem[0].x !== x0 || mem[0].z !== z0) 옮김++;
    자리잡음(mem);
    if (o.lounge) lounge += 3;
    // 러그는 첫 협업 구역 아래에 깔린다. 바닥에 눕는 것이라 겹침 판정에서 뺀다.
    if (o.rug && putCT === 0) {
      items.push({ type: 'rug', x: mem[0].x, z: mem[0].z, rotY: 0, w: dia + 2800, d: dia + 2800 });
    }
    putCT++;
  }

  // ③ 이동식 디스플레이 — LED 벽 옆에 비스듬히. 붙박이 화면과 대비되는 요소다.
  if (o.mobileStand) {
    const mem = placeIdeationZone(placed,
      (x, z) => [{ type: 'mobileStand', x, z, rotY: -35 }],
      px(0.90, 700), pz(0.16, 700), [pad + 700, W - pad - 700],
      // **이동식 디스플레이는 방 앞쪽 절반 안에만 선다.** 화면을 보여 주는 물건이라 LED 벽
      //   가까이 두는 것이 실제 쓰임이고, 뒤로 밀리면 제안 카메라 바로 앞에서 2.15m 짜리
      //   검은 판이 되어 LED 를 가린다(PHASE 8-2c.1 시험에서 컴팩트 우코너가 그랬다).
      //   앞쪽에 자리가 없으면 놓지 않고 안내에 남긴다.
      [front + 700, Math.max(front + 700, D * 0.45)]);
    if (mem) { if (mem[0].x !== px(0.90, 700) || mem[0].z !== pz(0.16, 700)) 옮김++; 자리잡음(mem); }
    else 뺌++;
  }
  if (o.plant) {
    const x0 = W - F.wallClear / 1.6, z0 = D - F.wallClear / 1.6;
    const mem = placeIdeationZone(placed, (x, z) => [{ type: 'plant', x, z, rotY: 0 }],
      x0, z0, [pad, W - pad], [front, D - pad]);
    if (mem) { if (mem[0].x !== x0 || mem[0].z !== z0) 옮김++; 자리잡음(mem); }
    else 뺌++;
  }

  const seats = stools + lounge;
  if (nHT === 0 && nCT === 0) notes.push('가구를 모두 끈 상태라 빈 공간만 보입니다.');
  if (옮김 > 0) notes.push(`가구가 겹치지 않도록 ${옮김}개 구역의 자리를 옮겼습니다.`);
  if (뺌 > 0) notes.push(`방이 좁아 ${뺌}개 구역은 놓지 못했습니다(하이 테이블 ${putHT}개 · 협업 구역 ${putCT}개).`);
  return {
    items,
    placed: { highTables: putHT, stools, collabTables: putCT, lounge, chairs: seats },
    capacity: seats,
    notes,
  };
}

// ── 상황실 ──────────────────────────────────────────────────────────────────
function layoutControl(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  const maxPerRow = Math.max(1, fitCount(W - F.wallClear * 2, F.consolePitchX));
  const backD = o.backTable ? 3200 : 0;
  const maxRows = Math.max(1, fitCount(D - F.frontClear - F.wallClear - backD, F.consolePitchZ));
  const perRow = clamp(o.perRow, 1, maxPerRow), rows = clamp(o.consoleRows, 1, maxRows);
  if (perRow < o.perRow || rows < o.consoleRows) notes.push(`방 크기에 맞춰 콘솔 ${perRow}대 × ${rows}줄로 줄였습니다.`);

  // ── 콘솔 단차 ── 강당 객석과 같은 규칙(tierPlan)을 쓴다.
  //   뒷줄 운용자가 앞줄 너머로 대형 화면을 봐야 해서 실제 상황실에도 단이 흔하다.
  const plan = tierPlan(rows, o.tiers, o.riserH, o.tierStartRow);
  const { riserH, tierOf } = plan;
  notes.push(...plan.notes);
  const span = (perRow - 1) * F.consolePitchX;
  const rowZ = r => F.frontClear + F.consolePitchZ / 2 + r * F.consolePitchZ;

  addRisers(items, {
    W, plan, rows, rowZ, pitchZ: F.consolePitchZ,
    platW: Math.min(W, perRow * F.consolePitchX + F.consolePitchX * 0.6),
  });

  for (let r = 0; r < rows; r++) {
    const z = rowZ(r);
    const y = riserH > 0 ? tierOf(r) * riserH : 0;   // 그 줄이 올라앉은 단 높이
    for (let c = 0; c < perRow; c++) {
      const x = W / 2 - span / 2 + c * F.consolePitchX;
      items.push({ type: 'console', x, z, rotY: 0, w: F.consoleW, d: F.consoleD, y });
      items.push({ ...chairAt(x, z + 1000, x, z), y });   // 콘솔 뒤에 앉아 콘솔(과 LED)을 바라본다
    }
  }
  if (o.backTable) {
    const z = D - F.wallClear - backD / 2;
    // 뒤쪽 테이블은 단 바깥(맨 뒤)이라 바닥 높이를 그대로 쓴다 — 단은 콘솔 구역까지만 깔린다.
    const tW = clamp(W - F.wallClear * 2 - F.chairClear * 2, 1600, 6000);
    items.push({ type: 'table', shape: 'rect', x: W / 2, z, rotY: 0, w: tW, d: 1200 });
    const n = fitCount(tW - 400, F.chairPitch);
    const span = (n - 1) * F.chairPitch;
    for (let i = 0; i < n; i++) {
      const cx = W / 2 - span / 2 + i * F.chairPitch;
      items.push(chairAt(cx, z + 1200 / 2 + F.chairClear, cx, z));   // 테이블 바깥에 앉아 테이블을 바라본다
    }
  }
  // 콘솔 AV(운용 모니터·키보드) — **콘솔을 한 자리도 바꾸지 않고 덧붙이기만 한다.**
  //   자리 계산은 전부 control-av.js(순수)가 하고, 여기서는 넘겨주고 받아 담기만 한다.
  const placed = { consoles: rows * perRow, rows, perRow };
  if (wantsControlAV(o.design)) {
    const av = controlAVItems({ consoles: items.filter(i => i.type === 'console') });
    items.push(...av.items);
    placed.monitors = av.monitors.length;
    placed.keyboards = av.keyboards.length;
  }
  if (o.plant) addPlant(items, W, D);
  return { items, placed, capacity: maxRows * maxPerRow, notes };
}

// 화분은 방 뒤쪽 구석(LED에서 먼 쪽)에 둔다 — 시야를 가리지 않게.
function addPlant(items, W, D) {
  items.push({ type: 'plant', x: W - FURNITURE.wallClear / 1.6, z: D - FURNITURE.wallClear / 1.6, rotY: 0 });
}

// ── 사람이 설 자리 ──────────────────────────────────────────────────────────
// 3D 뷰에 축척 비교용으로 사람을 세울 위치를 고른다.
//   · LED 옆에 서야 화면 크기를 눈으로 가늠할 수 있다(LED를 가리지 않게 옆쪽).
//   · 테이블·의자와 겹치면 사람이 가구를 뚫고 선 것처럼 보이므로 빈 곳을 찾는다.
// 무대(stage)도 피한다 — 사람은 바닥(y=0)에 세우므로 단상 위에 두면 발이 묻힌다.
export const PERSON_BLOCKING = Object.freeze(new Set(['table', 'desk', 'console', 'chair', 'seat', 'podium', 'plant', 'stage', 'credenza',
  'highTable', 'stool', 'lounge', 'collabTable', 'mobileStand', 'seated']));

export function personSpot(room, led, items = []) {
  const W = Math.max(2000, room.W), D = Math.max(2000, room.D);
  const margin = 600;
  const blocked = (x, z) => (items || []).some(it => {
    if (!PERSON_BLOCKING.has(it.type)) return false;           // 러그 위에는 설 수 있다
    const hw = (it.w || 700) / 2 + 450, hd = (it.d || 700) / 2 + 450;
    return Math.abs(it.x - x) < hw && Math.abs(it.z - z) < hd;
  });
  // LED 좌·우 바깥쪽을 먼저, 벽에서 조금씩 떨어뜨려 가며 빈 곳을 찾는다.
  //   벽에 너무 붙이면 화면에서 치수선·치수 라벨과 겹치므로 적당히 띄운다.
  //   LED 오른쪽을 먼저 본다 — 왼쪽에는 '하단 높이' 치수선이 내려와 사람과 겹친다.
  const xs = [led.x + led.w + 1400, led.x - 1400, led.x + led.w + 2300, led.x - 2300];
  const zs = [2200, 2800, 1500, 3400];   // 벽에서 2.2 m쯤 떨어져 서면 치수 라벨과 겹치지 않는다
  for (const z of zs) {
    for (const x of xs) {
      const cx = clamp(x, margin, W - margin), cz = clamp(z, margin, D - margin);
      if (!blocked(cx, cz)) return { x: cx, z: cz };
    }
  }
  return { x: clamp(xs[0], margin, W - margin), z: clamp(zs[0], margin, D - margin) };
}
