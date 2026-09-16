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
      { key: 'credenza', label: 'AV 수납장', type: 'toggle', default: true },
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
    options: hallOptions(6, 10, false),
  },
  {
    id: 'hall_m', label: '중강당', depthFactor: 1.35, minDepth: 12000,
    options: hallOptions(10, 16, true),
  },
  {
    id: 'hall_l', label: '대강당', depthFactor: 1.6, minDepth: 18000,
    options: hallOptions(16, 24, true),
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
      { key: 'backTable', label: '뒤쪽 회의 테이블', type: 'toggle', default: true },
      { key: 'plant', label: '화분', type: 'toggle', default: false },
    ],
  },
]);

function hallOptions(rows, perRow, twoAisles) {
  return [
    { key: 'rows', label: '좌석 줄 수', type: 'number', default: rows, min: 1, max: 40 },
    { key: 'seatsPerRow', label: '줄당 좌석 수', type: 'number', default: perRow, min: 2, max: 60 },
    { key: 'aisles', label: '통로', type: 'select', default: twoAisles ? '2' : '1',
      choices: [{ value: '0', label: '없음' }, { value: '1', label: '가운데 1개' }, { value: '2', label: '양쪽 2개' }] },
    { key: 'stage', label: '무대(단상)', type: 'toggle', default: true },
    { key: 'stageStep', label: '무대 계단', type: 'toggle', default: true },
    // 객석 단차(계단식 좌석). 단 수 1 = 평평한 바닥(기존과 동일).
    //   뒷줄로 갈수록 한 단씩 올라가 앞사람 머리에 시야가 가리지 않게 한다.
    { key: 'tiers', label: '객석 단 수', type: 'number', default: 1, min: 1, max: 20 },
    { key: 'riserH', label: '한 단 높이(mm)', type: 'number', default: 200, min: 0, max: 900 },
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
  const o = { ...normalizeOptions(typeId, opts), ledBottom: Number(room.ledBottom) };
  const W = Math.max(1000, room.W), D = Math.max(1000, room.D);
  switch (roomType(typeId).id) {
    case 'classroom': return layoutClassroom(o, W, D);
    case 'hall_s': case 'hall_m': case 'hall_l': return layoutHall(o, W, D);
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

  // 사각형 · 보트형 — 긴 변(X) 양쪽 + 양 끝(Z)에 앉는다.
  //   테이블 길이는 '방 크기'가 아니라 '앉을 사람 수'에 맞춘다(방을 꽉 채우지 않게).
  const maxW = clamp(usableW - F.chairClear * 2, 1600, 9000);    // 이 방에 들어가는 최대 테이블 가로
  const tD = clamp(Math.min(1500, usableD - F.chairClear * 2), 900, 1800);
  const ends = (tD >= 900) ? 2 : 0;
  const capacity = fitCount(maxW - 400, F.chairPitch) * 2 + ends;
  const n = clamp(o.seats, 0, capacity);
  const perSideNeeded = Math.ceil(Math.max(0, n - ends) / 2);
  const tW = clamp(perSideNeeded * F.chairPitch + 500, 1600, maxW);
  const perSide = fitCount(tW - 400, F.chairPitch);
  items.push({ type: 'table', shape: o.tableShape, x: W / 2, z: cz, rotY: 0, w: tW, d: tD });

  // 양쪽 긴 변에 번갈아 채우고, 남으면 양 끝에 앉힌다.
  let left = n;
  const sideN = [Math.min(perSide, Math.ceil(left / 2)), 0];
  sideN[1] = Math.min(perSide, left - sideN[0]);
  left -= sideN[0] + sideN[1];
  for (let s = 0; s < 2; s++) {
    // 테이블 긴 변 양쪽. 방향은 '바로 앞 테이블 면'을 바라보게 계산한다.
    const zc = cz + (s === 0 ? 1 : -1) * (tD / 2 + F.chairClear);
    const span = (sideN[s] - 1) * F.chairPitch;
    for (let i = 0; i < sideN[s]; i++) {
      const x = W / 2 - span / 2 + i * F.chairPitch;
      items.push(chairAt(x, zc, x, cz));
    }
  }
  for (let e = 0; e < Math.min(left, ends); e++) {   // 양 끝(상석)
    const sign = e === 0 ? 1 : -1;
    items.push(chairAt(W / 2 + sign * (tW / 2 + F.chairClear), cz, W / 2, cz));
  }
  if (n < o.seats) notes.push(`이 방 크기에서는 ${capacity}석까지 들어갑니다.`);
  if (o.rug) items.push({ type: 'rug', x: W / 2, z: cz, rotY: 0, w: tW + 2600, d: tD + 2600 });
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { chairs: n }, capacity, notes };
}

// U자형 — LED 벽을 향해 열린 ㄷ 모양. 바깥쪽에 앉는다.
function layoutUTable(o, W, D, cz, seed = []) {
  const F = FURNITURE;
  const items = [...seed], notes = [];   // seed = 이미 놓인 것(AV 수납장 등)
  const tW = clamp(W - F.wallClear * 2 - F.chairClear * 2, 2000, 9000);
  const tD = clamp(Math.min(D - F.frontClear - F.wallClear - F.chairClear * 2, 4500), 1600, 5000);
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
  if (o.rug) items.push({ type: 'rug', x: W / 2, z: cz, rotY: 0, w: tW + 2600, d: tD + 2600 });
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { chairs: n }, capacity, notes };
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
    items.push({ type: 'desk', x: ix, z: F.frontClear * 0.55, rotY: 180, w: 1500, d: 700 });
    items.push({ ...chairAt(ix, F.frontClear * 0.55 - 750, ix, F.frontClear * 0.55), asset: 'trainingChair' });
  }
  if (o.plant) addPlant(items, W, D);
  return {
    items,
    placed: { desks: cols * rows, chairs: cols * rows * perDesk, cols, rows, perDesk },
    capacity: maxCols * maxRows * perDesk,
    notes,
  };
}

// ── 강당(소·중·대) ──────────────────────────────────────────────────────────
function layoutHall(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  const nAisle = int(o.aisles, 1);
  const aisleTotal = nAisle * F.aisleW;
  const stageD = o.stage ? 2600 : 0;
  // 높이는 보이는 값일 뿐 — 좌석 계산은 깊이(stageD)만 쓴다. step은 계단을 붙일지 여부.
  if (o.stage) items.push({ type: 'stage', x: W / 2, z: stageD / 2, rotY: 0, w: W, d: stageD, h: 280, step: o.stageStep !== false });

  const zStart = Math.max(stageD, F.frontClear) + 1600;
  const maxPerRow = Math.max(1, fitCount(W - F.wallClear * 2 - aisleTotal, F.seatPitchX));
  const maxRows = Math.max(1, fitCount(D - zStart - F.wallClear, F.seatPitchZ));
  const perRow = clamp(o.seatsPerRow, 1, maxPerRow), rows = clamp(o.rows, 1, maxRows);
  if (perRow < o.seatsPerRow || rows < o.rows) notes.push(`방 크기에 맞춰 ${perRow}석 × ${rows}줄로 줄였습니다.`);

  // 통로 위치: 좌석을 (통로수+1)개 블록으로 나눈다.
  const blocks = nAisle + 1;
  const per = Math.floor(perRow / blocks), extra = perRow % blocks;
  const counts = Array.from({ length: blocks }, (_, i) => per + (i < extra ? 1 : 0));
  const totalW = perRow * F.seatPitchX + aisleTotal;
  let x = W / 2 - totalW / 2 + F.seatPitchX / 2;
  const xs = [];
  for (const cnt of counts) {
    for (let i = 0; i < cnt; i++) { xs.push(x); x += F.seatPitchX; }
    x += F.aisleW;
  }
  // ── 객석 단차(계단식 좌석) ──
  //   단 수(tiers)만큼 객석을 나누고, 뒤쪽 단일수록 한 단(riserH)씩 올라간다.
  //   첫 단은 바닥(높이 0)이다 — 단 수 1이면 기존과 똑같이 평평하다.
  const tiers = clamp(int(o.tiers, 1), 1, Math.max(1, rows));
  const riserH = Math.max(0, int(o.riserH, 0));
  if (tiers < int(o.tiers, 1)) notes.push(`줄 수(${rows})보다 많은 단은 만들 수 없어 ${tiers}단으로 줄였습니다.`);
  // 줄을 단에 고르게 나눈다. ceil로 나누면 뒷단이 비어 요청한 단 수가 안 나온다
  //   (예: 5줄 4단 → ceil(5/4)=2 → 3단만 생김). 남는 줄은 앞단부터 하나씩 더 준다.
  const tierRows = Array.from({ length: tiers },
    (_, t) => Math.floor(rows / tiers) + (t < rows % tiers ? 1 : 0));
  const tierStart = [];                       // 각 단의 첫 줄 번호
  for (let t = 0, acc = 0; t < tiers; t++) { tierStart.push(acc); acc += tierRows[t]; }
  const tierOf = r => {
    for (let t = tiers - 1; t >= 0; t--) if (r >= tierStart[t]) return t;
    return 0;
  };
  const seatZ = r => zStart + r * F.seatPitchZ;

  // 단(플랫폼) — 뒤쪽 단이 더 높으므로 앞 단을 덮어 계단 모양이 된다.
  //   각 단은 '그 단의 첫 줄 앞'부터 객석 맨 뒤까지 깔린다.
  if (riserH > 0 && tiers > 1) {
    const platW = Math.min(W, perRow * F.seatPitchX + aisleTotal + F.seatPitchX);
    const zBackEdge = seatZ(rows - 1) + F.seatPitchZ * 0.75;
    for (let t = 1; t < tiers; t++) {
      const zFront = seatZ(tierStart[t]) - F.seatPitchZ * 0.55;
      if (zFront >= zBackEdge) break;
      items.push({
        type: 'riser', x: W / 2, z: (zFront + zBackEdge) / 2, rotY: 0,
        w: platW, d: zBackEdge - zFront, h: t * riserH, tier: t,
      });
    }
  }

  for (let r = 0; r < rows; r++) {
    const z = seatZ(r);
    const y = riserH > 0 ? tierOf(r) * riserH : 0;   // 그 줄이 올라앉은 단 높이
    // 무대·LED(z=0) 쪽을 바라본다. y는 좌석이 놓인 바닥 높이(단차).
    for (const sx of xs) items.push({ ...chairAt(sx, z, sx, 0, 'seat'), y });
  }
  if (o.plant) addPlant(items, W, D);
  if (riserH > 0 && tiers > 1) {
    notes.push(`객석 ${tiers}단 · 한 단 ${riserH}mm (맨 뒤 +${(tiers - 1) * riserH}mm)`);
  }
  return {
    items,
    placed: { seats: rows * xs.length, rows, perRow: xs.length, tiers, riserH },
    capacity: maxRows * maxPerRow, notes,
  };
}

// ── 아이디에이션(협업) 공간 ────────────────────────────────────────────────
// 줄·열이 없다. 방을 몇 개의 **구역**으로 나누고 각 구역에 한 덩어리씩 놓는다.
//   비율(0~1)로 자리를 잡은 뒤 벽 여유 안으로 당겨서, 방 크기가 달라져도 구성이 유지된다.
//   목표는 가구를 채우는 것이 아니라 **가운데 바닥을 비워 두는 것**이다.
function layoutIdeation(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  const pad = F.wallClear;
  const front = Math.max(F.frontClear, D * 0.18);           // LED 앞은 비워 둔다
  const px = (t, half = 0) => clamp(W * t, pad + half, W - pad - half);
  const pz = (t, half = 0) => clamp(D * t, front + half, D - pad - half);

  // ① 하이 테이블 구역 — 서서 쓰는 협업 테이블. 스툴을 둘레에 고르게 돌린다.
  const htW = clamp(W * 0.22, 1200, 2200), htD = 900;
  const nHT = clamp(o.highTables, 0, 3);
  const htSpots = [[0.30, 0.42], [0.72, 0.42], [0.50, 0.30]];
  let stools = 0;
  for (let i = 0; i < nHT; i++) {
    const [tx, tz] = htSpots[i];
    const x = px(tx, htW / 2), z = pz(tz, htD / 2 + 700);
    items.push({ type: 'highTable', x, z, rotY: 0, w: htW, d: htD });
    // 스툴은 긴 변(앞뒤)에 반씩. 테이블을 바라보게 둔다.
    const n = clamp(o.stools, 0, 8);
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;                          // 앞줄 / 뒷줄
      const idx = Math.floor(k / 2);
      const perSide = Math.ceil(n / 2);
      const span = (perSide - 1) * 620;
      const sx = x - span / 2 + idx * 620;
      const sz = z + side * (htD / 2 + 430);
      items.push({ ...chairAt(sx, sz, x, z, 'stool') });
      stools++;
    }
  }

  // ② 협업 구역 — 낮은 원형 테이블 + 라운지 체어 3개. 서로 마주 본다.
  const nCT = clamp(o.collabTables, 0, 4);
  const ctSpots = [[0.74, 0.70], [0.28, 0.74], [0.74, 0.30], [0.28, 0.30]];
  const dia = 1100;
  let lounge = 0;
  for (let i = 0; i < nCT; i++) {
    const [tx, tz] = ctSpots[i];
    const x = px(tx, dia / 2 + 700), z = pz(tz, dia / 2 + 700);
    items.push({ type: 'collabTable', x, z, rotY: 0, w: dia, d: dia });
    if (o.lounge) {
      const ring = dia / 2 + 520;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
        items.push(chairAt(x + Math.sin(a) * ring, z + Math.cos(a) * ring, x, z, 'lounge'));
        lounge++;
      }
    }
    if (o.rug && i === 0) {
      items.push({ type: 'rug', x, z, rotY: 0, w: dia + 2800, d: dia + 2800 });
    }
  }

  // ③ 이동식 디스플레이 — LED 벽 옆에 비스듬히. 붙박이 화면과 대비되는 요소다.
  if (o.mobileStand) {
    items.push({ type: 'mobileStand', x: px(0.90, 700), z: pz(0.16, 700), rotY: -35 });
  }
  if (o.plant) addPlant(items, W, D);

  const seats = stools + lounge;
  if (nHT === 0 && nCT === 0) notes.push('가구를 모두 끄면 빈 공간만 보입니다.');
  return {
    items,
    placed: { highTables: nHT, stools, collabTables: nCT, lounge, chairs: seats },
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

  const span = (perRow - 1) * F.consolePitchX;
  for (let r = 0; r < rows; r++) {
    const z = F.frontClear + F.consolePitchZ / 2 + r * F.consolePitchZ;
    for (let c = 0; c < perRow; c++) {
      const x = W / 2 - span / 2 + c * F.consolePitchX;
      items.push({ type: 'console', x, z, rotY: 0, w: F.consoleW, d: F.consoleD });
      items.push(chairAt(x, z + 1000, x, z));   // 콘솔 뒤에 앉아 콘솔(과 LED)을 바라본다
    }
  }
  if (o.backTable) {
    const z = D - F.wallClear - backD / 2;
    const tW = clamp(W - F.wallClear * 2 - F.chairClear * 2, 1600, 6000);
    items.push({ type: 'table', shape: 'rect', x: W / 2, z, rotY: 0, w: tW, d: 1200 });
    const n = fitCount(tW - 400, F.chairPitch);
    const span = (n - 1) * F.chairPitch;
    for (let i = 0; i < n; i++) {
      const cx = W / 2 - span / 2 + i * F.chairPitch;
      items.push(chairAt(cx, z + 1200 / 2 + F.chairClear, cx, z));   // 테이블 바깥에 앉아 테이블을 바라본다
    }
  }
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { consoles: rows * perRow, rows, perRow }, capacity: maxRows * maxPerRow, notes };
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
  'highTable', 'stool', 'lounge', 'collabTable', 'mobileStand']));

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
