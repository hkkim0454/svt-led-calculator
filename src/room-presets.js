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

// 몇 개나 들어가는지 = 쓸 수 있는 길이 ÷ 한 칸 간격 (최소 0)
const fitCount = (available, pitch) => Math.max(0, Math.floor(available / pitch));

// ── 가구 기본 치수(mm) ──────────────────────────────────────────────────────
// 실제 사무가구 표준값에 맞춘 기준 치수. 렌더 모양의 기준이자 '몇 명 앉나' 계산의 근거.
export const FURNITURE = Object.freeze({
  chairPitch: 700,        // 회의용 의자 1인 간격
  chairClear: 650,        // 테이블 모서리 ~ 의자 중심 거리
  deskW: 1400, deskD: 600, deskPitchX: 1700, deskPitchZ: 1550,   // 강의실 책상
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
      { key: 'rug', label: '러그', type: 'toggle', default: true },
      { key: 'plant', label: '화분', type: 'toggle', default: true },
    ],
  },
  {
    id: 'classroom', label: '강의실', depthFactor: 1.1, minDepth: 6000,
    options: [
      { key: 'rows', label: '책상 줄 수', type: 'number', default: 4, min: 1, max: 20 },
      { key: 'cols', label: '줄당 책상 수', type: 'number', default: 4, min: 1, max: 20 },
      { key: 'aisle', label: '가운데 통로', type: 'toggle', default: true },
      { key: 'podium', label: '교탁', type: 'toggle', default: true },
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
  const o = normalizeOptions(typeId, opts);
  const W = Math.max(1000, room.W), D = Math.max(1000, room.D);
  switch (roomType(typeId).id) {
    case 'classroom': return layoutClassroom(o, W, D);
    case 'hall_s': case 'hall_m': case 'hall_l': return layoutHall(o, W, D);
    case 'control': return layoutControl(o, W, D);
    case 'meeting': default: return layoutMeeting(o, W, D);
  }
}

// ── 회의실 ──────────────────────────────────────────────────────────────────
function layoutMeeting(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
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
      items.push({
        type: 'chair', x: W / 2 + Math.sin(a) * ring, z: cz + Math.cos(a) * ring,
        rotY: (a / Math.PI) * 180 + 180,     // 항상 테이블 중심을 바라보게
      });
    }
    if (n < o.seats) notes.push(`원형 테이블 둘레상 ${capacity}석까지 들어갑니다.`);
    if (o.rug) items.push({ type: 'rug', x: W / 2, z: cz, rotY: 0, w: dia + 3000, d: dia + 3000 });
    if (o.plant) addPlant(items, W, D);
    return { items, placed: { chairs: n }, capacity, notes };
  }

  if (o.tableShape === 'u') return layoutUTable(o, W, D, cz);

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
    // s=0 : 테이블 뒤쪽(LED에서 먼 쪽) → LED·테이블을 바라본다(rotY 0)
    // s=1 : 테이블 앞쪽(LED 쪽)       → 뒤돌아 테이블을 바라본다(rotY 180)
    const zc = cz + (s === 0 ? 1 : -1) * (tD / 2 + F.chairClear);
    const span = (sideN[s] - 1) * F.chairPitch;
    for (let i = 0; i < sideN[s]; i++) {
      items.push({ type: 'chair', x: W / 2 - span / 2 + i * F.chairPitch, z: zc, rotY: s === 0 ? 0 : 180 });
    }
  }
  for (let e = 0; e < Math.min(left, ends); e++) {
    const sign = e === 0 ? 1 : -1;
    items.push({ type: 'chair', x: W / 2 + sign * (tW / 2 + F.chairClear), z: cz, rotY: sign > 0 ? 270 : 90 });
  }
  if (n < o.seats) notes.push(`이 방 크기에서는 ${capacity}석까지 들어갑니다.`);
  if (o.rug) items.push({ type: 'rug', x: W / 2, z: cz, rotY: 0, w: tW + 2600, d: tD + 2600 });
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { chairs: n }, capacity, notes };
}

// U자형 — LED 벽을 향해 열린 ㄷ 모양. 바깥쪽에 앉는다.
function layoutUTable(o, W, D, cz) {
  const F = FURNITURE;
  const items = [], notes = [];
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
  let left = n;
  const nb = Math.min(backN, left); left -= nb;
  const na = Math.min(armN, Math.ceil(left / 2)); left -= na;
  const nb2 = Math.min(armN, left);

  const spanB = (nb - 1) * F.chairPitch;
  for (let i = 0; i < nb; i++) items.push({ type: 'chair', x: W / 2 - spanB / 2 + i * F.chairPitch, z: zBack + seg / 2 + F.chairClear, rotY: 180 });
  for (const [cnt, sign] of [[na, -1], [nb2, 1]]) {
    const span = (cnt - 1) * F.chairPitch;
    const zMid = cz - seg / 2;
    for (let i = 0; i < cnt; i++) {
      items.push({
        type: 'chair', x: W / 2 + sign * (tW / 2 - seg / 2 + F.chairClear),
        z: zMid - span / 2 + i * F.chairPitch, rotY: sign < 0 ? 90 : 270,
      });
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
    items.push({ type: 'chair', x: W / 2 - span / 2 + c * F.chairPitch, z: F.frontClear + 600 + r * 900, rotY: 0 });
  }
  return n;
}

// ── 강의실 ──────────────────────────────────────────────────────────────────
function layoutClassroom(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  const aisle = o.aisle ? F.aisleW : 0;
  const maxCols = Math.max(1, fitCount(W - F.wallClear * 2 - aisle, F.deskPitchX));
  const maxRows = Math.max(1, fitCount(D - F.frontClear - F.wallClear, F.deskPitchZ));
  const cols = clamp(o.cols, 1, maxCols), rows = clamp(o.rows, 1, maxRows);
  if (cols < o.cols || rows < o.rows) notes.push(`방 크기에 맞춰 ${cols}열 × ${rows}줄로 줄였습니다.`);

  const blockW = cols * F.deskPitchX + aisle;
  const x0 = W / 2 - blockW / 2 + F.deskPitchX / 2;
  const half = Math.ceil(cols / 2);
  for (let r = 0; r < rows; r++) {
    const z = F.frontClear + F.deskPitchZ / 2 + r * F.deskPitchZ;
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * F.deskPitchX + (o.aisle && c >= half ? aisle : 0);
      items.push({ type: 'desk', x, z, rotY: 0, w: F.deskW, d: F.deskD });
      items.push({ type: 'chair', x, z: z + 750, rotY: 0 });
    }
  }
  if (o.podium) items.push({ type: 'podium', x: clamp(W * 0.22, 900, W - 900), z: F.frontClear * 0.6, rotY: 180 });
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { desks: cols * rows, chairs: cols * rows, cols, rows }, capacity: maxCols * maxRows, notes };
}

// ── 강당(소·중·대) ──────────────────────────────────────────────────────────
function layoutHall(o, W, D) {
  const F = FURNITURE;
  const items = [], notes = [];
  const nAisle = int(o.aisles, 1);
  const aisleTotal = nAisle * F.aisleW;
  const stageD = o.stage ? 2600 : 0;
  if (o.stage) items.push({ type: 'stage', x: W / 2, z: stageD / 2, rotY: 0, w: W, d: stageD, h: 450 });

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
  for (let r = 0; r < rows; r++) {
    const z = zStart + r * F.seatPitchZ;
    for (const sx of xs) items.push({ type: 'seat', x: sx, z, rotY: 0 });
  }
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { seats: rows * xs.length, rows, perRow: xs.length }, capacity: maxRows * maxPerRow, notes };
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
      items.push({ type: 'chair', x, z: z + 1000, rotY: 0 });
    }
  }
  if (o.backTable) {
    const z = D - F.wallClear - backD / 2;
    const tW = clamp(W - F.wallClear * 2 - F.chairClear * 2, 1600, 6000);
    items.push({ type: 'table', shape: 'rect', x: W / 2, z, rotY: 0, w: tW, d: 1200 });
    const n = fitCount(tW - 400, F.chairPitch);
    const s = (n - 1) * F.chairPitch;
    for (let i = 0; i < n; i++) items.push({ type: 'chair', x: W / 2 - s / 2 + i * F.chairPitch, z: z + 1200 / 2 + F.chairClear, rotY: 180 });
  }
  if (o.plant) addPlant(items, W, D);
  return { items, placed: { consoles: rows * perRow, rows, perRow }, capacity: maxRows * maxPerRow, notes };
}

// 화분은 방 뒤쪽 구석(LED에서 먼 쪽)에 둔다 — 시야를 가리지 않게.
function addPlant(items, W, D) {
  items.push({ type: 'plant', x: W - FURNITURE.wallClear / 1.6, z: D - FURNITURE.wallClear / 1.6, rotY: 0 });
}
