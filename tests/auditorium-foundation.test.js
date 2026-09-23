// auditorium-foundation.test.js — 강당 V1 기반 (PHASE 9-a, DEC-141).
//
// **이 단계는 강당을 멋있게 만드는 단계가 아니다.** 강당을 앞으로 안전하게 손볼 수 있도록
// ① 전용 디자인 층을 등록하고 ② 지금 상태를 숫자로 못박고 ③ 동결된 여섯 공간을 지킬
// 안전망을 세우는 것이 전부다. 그래서 이 파일이 고정하는 값 중 상당수는 **'좋은 값'이
// 아니라 '지금 값'** 이다. 고칠 것은 뒤 단계에서 고치고, 그때 이 숫자를 의도적으로 바꾼다.
//
// 앞으로 PHASE 9-b ~ 9-f 의 강당 계약은 전부 이 파일에 모은다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_DESIGNS, DESIGN_IDS, DESIGN_STATUS, DESIGN_FIELDS, INHERIT, NEUTRAL_DESIGN,
  DEFAULT_DESIGN_BY_ROOM_TYPE, defaultDesignFor, designsFor, normalizeDesign, resolveDesign,
  roomDesign, layoutPlan, layoutVariant, isPlanned,
} from '../src/room-design.js';
import { layoutRoom, defaultOptions, roomType, ROOM_TYPES, FURNITURE, tierPlan,
  AUDITORIUM_SEATING, AUDITORIUM_MAX_RISER, AUDITORIUM_MIN_AISLE, auditoriumSeating, auditoriumTierPlan,
  AUDITORIUM_STAGE, AUDITORIUM_STAGE_LED_CLEAR, AUDITORIUM_LED_TOP_CLEAR, AUDITORIUM_LED_MIN,
  auditoriumStageSize, auditoriumLedSize } from '../src/room-presets.js';
import { DIMS, FURNITURE_COLORS } from '../src/furniture-assets.js';
import { auditoriumSurfaceFinish, AUDITORIUM_SURFACE_PARTS } from '../src/design-finish.js';
import { buildGLModel, presetPose, FOV_DEG } from '../src/gl-model.js';
import { cameraPlanForDesign } from '../src/design-camera.js';
import { LIGHTING_PRESETS } from '../src/design-lighting.js';
import { MATERIAL_IDS } from '../src/materials.js';

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

/** 강당 세 크기 — 용도 id · 디자인 id · 배치 변형 id. */
const 강당 = Object.freeze([
  ['hall_s', 'auditoriumSmall', 'auditorium-rows-s', '소강당'],
  ['hall_m', 'auditoriumMedium', 'auditorium-rows-m', '중강당'],
  ['hall_l', 'auditoriumLarge', 'auditorium-rows-l', '대강당'],
]);
/** 릴리스를 마친 여섯 공간 — 이 단계가 한 값도 건드리면 안 되는 곳이다. */
const 동결 = Object.freeze(['corporateMeeting', 'executiveBoardroom', 'largeConference',
  'controlRoom', 'trainingRoom', 'ideationRoom']);

// ── ① 디자인 층 등록 ────────────────────────────────────────────────────────

test('① 강당 세 크기에 전용 디자인이 하나씩 붙었다', () => {
  for (const [t, id, variant, label] of 강당) {
    assert.equal(DEFAULT_DESIGN_BY_ROOM_TYPE[t], id, `${t}: 기본 디자인이 다르다`);
    assert.equal(defaultDesignFor(t), id, t);
    const d = ROOM_DESIGNS[id];
    assert.ok(d, `${id} 가 없다`);
    assert.equal(d.roomType, t, `${id}: 붙은 용도가 다르다`);
    assert.equal(d.label, label, `${id}: 라벨이 다르다`);
    assert.equal(d.layoutVariant, variant, `${id}: 배치 변형 이름이 다르다`);
    assert.equal(d.phase, 9, `${id}: 구현 단계가 9 가 아니다`);
    for (const f of DESIGN_FIELDS) assert.ok(f in d, `${id}: '${f}' 항목이 빠졌다`);
    assert.ok(Object.isFrozen(d), `${id}: 얼려 두지 않았다`);
    // 고를 것이 하나뿐이라 화면은 선택칸을 그리지 않는다(상황실·교육장·아이디에이션과 같다).
    assert.deepEqual(designsFor(t).map(x => x.id), [id], t);
  }
});

test('② 저장값이 엉뚱해도 그 크기의 강당 디자인으로 떨어진다', () => {
  for (const [t, id] of 강당) {
    for (const v of [undefined, null, '', 0, false, {}, [], '없는디자인',
      'corporateMeeting', 'controlRoom', 'ideationRoom', 'auditoriumSmall', 'auditoriumLarge']) {
      const got = normalizeDesign(v, t);
      assert.equal(got, id, `${t}: 저장값 ${String(v)} 이 ${got} 로 떨어졌다`);
    }
  }
  // 반대 방향 — 강당 디자인이 남의 방에 붙으면 안 된다.
  for (const [, id] of 강당) {
    assert.equal(normalizeDesign(id, 'meeting'), 'corporateMeeting', id);
    assert.equal(normalizeDesign(id, 'classroom'), 'trainingRoom', id);
    assert.equal(normalizeDesign(id, 'control'), 'controlRoom', id);
    assert.equal(normalizeDesign(id, 'ideation'), 'ideationRoom', id);
  }
});

test('③ 상태는 planned 다 — 릴리스 게이트(PHASE 9-f) 전에는 ready 로 올리지 않는다', () => {
  for (const [, id] of 강당) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.PLANNED, `${id}: 상태가 planned 가 아니다`);
  }
  // 릴리스를 마친 여섯 공간만 ready 다.
  const ready = DESIGN_IDS.filter(id => ROOM_DESIGNS[id].status === DESIGN_STATUS.READY);
  assert.deepEqual(ready.sort(), [...동결].sort(), 'ready 인 공간 목록이 달라졌다');
});

// ── ② 이 단계의 핵심 안전장치 — 붙였지만 화면에는 아무 값도 도달하지 않는다 ──

test('④ 강당 디자인은 화면에 값을 하나도 보내지 않는다(전부 INHERIT/planned)', () => {
  // 이것이 PHASE 9-a 의 전부다. 여기서 한 항목이라도 실제 값으로 바뀌면 강당 그림이
  //   조용히 달라지고, 그 변화가 어느 단계의 것인지 따질 수 없게 된다.
  const 표현항목 = ['furniture', 'palette', 'materials', 'wallTreatment', 'lighting',
    'camera', 'accessories'];
  for (const [, id] of 강당) {
    const 해석 = resolveDesign(id);
    for (const f of 표현항목) {
      assert.equal(해석[f], NEUTRAL_DESIGN[f],
        `${id}.${f} 가 화면에 값을 보낸다 — PHASE 9-a 의 범위를 넘었다`);
    }
    // 선언 쪽도 확인한다 — 조명·화각만 `planned(...)` 로 예약해 두고 나머지는 INHERIT 다.
    const d = ROOM_DESIGNS[id];
    for (const f of ['furniture', 'palette', 'materials', 'wallTreatment', 'accessories']) {
      assert.equal(d[f], INHERIT, `${id}.${f} 는 INHERIT 여야 한다`);
    }
    assert.deepEqual(d.lighting, { planned: 'auditoriumStage' }, `${id}: 조명 예약 이름`);
    assert.deepEqual(d.camera, { planned: 'auditoriumProposal' }, `${id}: 화각 예약 이름`);
    assert.ok(isPlanned(d.lighting) && isPlanned(d.camera), `${id}: 예약 표시가 아니다`);
  }
  // 아직 강당 전용 조명 프리셋을 만들지 않았다(PHASE 9-d.1 의 몫).
  assert.deepEqual(Object.keys(LIGHTING_PRESETS),
    ['corporateSoft', 'executiveSoft', 'conferenceSoft', 'trainingSoft', 'controlTechnical',
      'ideationSoft']);
  // 정식 재질도 13종 그대로다(PHASE 9-c 가 늘릴 수 있다).
  assert.equal(MATERIAL_IDS.length, 13);
});

test('⑤ 배치는 여전히 용도의 것이다 — 변형 이름은 이름표일 뿐이다', () => {
  for (const [t, id, variant] of 강당) {
    const p = layoutPlan(id, t);
    assert.equal(p.roomType, t, `${t}: 용도가 바뀌었다`);
    assert.equal(p.variant, variant, `${t}: 변형 이름이 다르다`);
    assert.equal(p.base, t, `${t}: 기존 배치 분기가 아니다`);
    assert.equal(p.useBaseLayout, true, `${t}: 배치를 가로챘다`);
    assert.equal(layoutVariant(variant).base, t, `${variant}: base 가 다르다`);
  }
  // 강당 셋은 배치 함수 하나(`layoutHall`)를 같이 쓴다. PHASE 9-b 가 **어느 크기인지**를
  //   함께 넘기게 바꿨을 뿐, 배치 함수를 크기별로 쪼개지는 않았다.
  assert.match(src('room-presets.js'),
    /case 'hall_s': case 'hall_m': case 'hall_l': return layoutHall\(o, W, D, roomType\(typeId\)\.id\);/);
});

// ── ③ 레거시 기준선 — '승인'이 아니라 '지금 값' 이다 ────────────────────────

test('⑥ 강당 기본값 스냅샷 — 세 크기가 각자의 구성을 가진다 (PHASE 9-b 에서 갱신)', () => {
  // **바뀐 이유.** PHASE 9-a 는 레거시(소 6×10 · 중 10×16 · 대 16×24, 첫 줄 4,200 ·
  //   줄 간격 950 공통)를 '지금 값'으로 못박아 두었을 뿐, 좋다고 인정한 것이 아니었다.
  //   PHASE 9-b 가 그 숙제를 풀어 크기별 좌석 규칙(AUDITORIUM_SEATING)을 세웠으므로
  //   여기 숫자도 의도적으로 갱신한다. 줄 수·줄당 좌석 수는 이제 **0 = 자동**이고,
  //   방 깊이를 보고 뒤 여유 목표에 맞춰 스스로 정한다.
  const 기대 = {
    hall_s: { rows: 7, perRow: 12, aisles: '1', seats: 84, capacity: 84, blocks: [6, 6],
      firstRowZ: 4000, pitchZ: 950, pitchX: 570, tiers: 1, W: 10000, D: 12000,
      stage: { w: 7000, d: 2200, h: 300 }, led: { w: 4000, h: 2300 } },
    hall_m: { rows: 14, perRow: 20, aisles: '2', seats: 280, capacity: 294, blocks: [6, 8, 6],
      firstRowZ: 4400, pitchZ: 1000, pitchX: 620, tiers: 4, W: 18000, D: 20000,
      stage: { w: 11500, d: 2800, h: 450 }, led: { w: 5200, h: 3000 } },
    hall_l: { rows: 19, perRow: 22, aisles: '2', seats: 418, capacity: 567, blocks: [6, 10, 6],
      firstRowZ: 4800, pitchZ: 1050, pitchX: 700, tiers: 5, W: 24000, D: 28000,
      stage: { w: 13900, d: 3200, h: 600 }, led: { w: 7100, h: 4000 } },
  };
  for (const [t] of 강당) {
    const e = 기대[t], o = defaultOptions(t);
    assert.equal(o.rows, 0, `${t}: 줄 수 기본값은 0(자동)이다`);
    assert.equal(o.seatsPerRow, 0, `${t}: 줄당 좌석 수 기본값은 0(자동)이다`);
    assert.equal(o.tiers, 0, `${t}: 객석 단 수 기본값은 0(자동)이다`);
    assert.equal(o.aisles, e.aisles, `${t}: 기본 통로 수`);
    assert.equal(o.stage, true, `${t}: 무대 기본값`);
    assert.equal(o.riserH, AUDITORIUM_SEATING[t].riserH, `${t}: 한 단 높이 기본값`);
    const r = layoutRoom(t, o, { W: e.W, D: e.D });
    const seats = r.items.filter(i => i.type === 'seat');
    // **§12 — 네 수를 구분해서 기록한다.** 뜻이 다른 값이므로 한 칸에 몰아 담지 않는다.
    const { geometricCapacity, plannedSeatCount, placedSeatCount, renderedSeatCount } = r.placed;
    assert.equal(renderedSeatCount, e.seats, `${t}: 그린 좌석 수`);
    assert.equal(seats.length, e.seats, `${t}: 실제 좌석 물건 수`);
    assert.equal(placedSeatCount, e.seats, `${t}: 놓았다고 센 수`);
    assert.equal(plannedSeatCount, e.seats, `${t}: 놓으려던 수(자동이면 그대로 놓인다)`);
    assert.equal(geometricCapacity, e.capacity, `${t}: 기하학적 최대`);
    assert.equal(r.capacity, e.capacity, `${t}: 예전 이름(capacity)도 같은 값을 준다`);
    assert.ok(geometricCapacity >= renderedSeatCount, `${t}: 정원보다 많이 놓았다`);
    assert.equal(r.placed.rows, e.rows, `${t}: 줄 수`);
    assert.equal(r.placed.perRow, e.perRow, `${t}: 줄당 좌석 수`);
    assert.deepEqual(r.placed.blocks, e.blocks, `${t}: 좌석 블록 구성`);
    assert.equal(r.placed.tiers, e.tiers, `${t}: 객석 단 수`);
    // 크기마다 첫 줄 위치·줄 간격·좌석 간격이 다르다 — 더 이상 같은 값을 쓰지 않는다.
    const zs = [...new Set(seats.map(i => Math.round(i.z)))].sort((a, b) => a - b);
    assert.equal(zs[0], e.firstRowZ, `${t}: 첫 줄 위치`);
    assert.equal(zs[1] - zs[0], e.pitchZ, `${t}: 줄 간격`);
    const xs = [...new Set(seats.map(i => Math.round(i.x)))].sort((a, b) => a - b);
    assert.equal(xs[1] - xs[0], e.pitchX, `${t}: 좌석 간격`);
    // 무대 — PHASE 9-c 가 크기별 비율로 바꿨다(그전에는 셋 다 방 폭 100% · 2,600 × 280).
    const stage = r.items.find(i => i.type === 'stage');
    assert.equal(stage.w, e.stage.w, `${t}: 무대 폭`);
    assert.equal(stage.d, e.stage.d, `${t}: 무대 깊이`);
    assert.equal(stage.h, e.stage.h, `${t}: 무대 높이`);
    assert.ok(stage.w < e.W, `${t}: 무대가 아직 방 폭을 꽉 채운다`);
  }
  // 세 크기의 첫 줄·간격이 서로 다르다(단순 확대·축소가 아니다).
  const 첫줄 = 강당.map(([t]) => 기대[t].firstRowZ);
  assert.equal(new Set(첫줄).size, 3, '세 크기의 첫 줄 위치가 여전히 같다');
  assert.equal(new Set(강당.map(([t]) => 기대[t].pitchZ)).size, 3, '세 크기의 줄 간격이 여전히 같다');
  // **공용 상수는 그대로다.** 교육장이 함께 쓰는 값이라 강당 때문에 움직이면 안 된다.
  assert.equal(FURNITURE.seatPitchX, 550);
  assert.equal(FURNITURE.seatPitchZ, 950);
  assert.equal(FURNITURE.aisleW, 1200);
});

test('⑦ 물리 기준선 — 좌석이 겹치거나 방을 넘지 않는다', () => {
  // 줄 간격·통로·단차를 손볼 때 이 검사가 먼저 깨져야 한다.
  const S = DIMS.auditoriumChair, hw = S.seatW / 2, hd = S.seatD / 2;
  for (const [t] of 강당) {
    const { W, D } = { hall_s: { W: 10000, D: 12000 }, hall_m: { W: 18000, D: 20000 },
      hall_l: { W: 24000, D: 28000 } }[t];
    const r = layoutRoom(t, defaultOptions(t), { W, D });
    const seats = r.items.filter(i => i.type === 'seat');
    const stage = r.items.find(i => i.type === 'stage');
    let 겹침 = 0, 최소여유 = Infinity;
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const dx = Math.abs(seats[i].x - seats[j].x) - 2 * hw;
        const dz = Math.abs(seats[i].z - seats[j].z) - 2 * hd;
        if (dx < 0 && dz < 0) 겹침++;
        else 최소여유 = Math.min(최소여유, Math.max(dx, dz));
      }
    }
    assert.equal(겹침, 0, `${t}: 좌석이 겹친다`);
    // 가장 가까운 두 좌석 사이 = 좌석 간격 − 좌석 폭. 크기마다 다르다(소 70 · 중 120 · 대 200mm).
    assert.equal(Math.round(최소여유), auditoriumSeating(t).pitchX - S.seatW,
      `${t}: 좌석 최소 여유가 좌석 간격 표와 어긋난다`);
    assert.equal(seats.filter(s => s.x - hw < 0 || s.x + hw > W).length, 0, `${t}: 좌우 벽을 넘는다`);
    assert.equal(seats.filter(s => s.z - hd < 0 || s.z + hd > D).length, 0, `${t}: 앞뒤 벽을 넘는다`);
    // 무대 위에 좌석이 올라가 있지 않다.
    assert.equal(seats.filter(s => s.z - hd < stage.z + stage.d / 2).length, 0, `${t}: 좌석이 무대를 침범한다`);
    // 무대 앞면은 LED 벽에 딱 붙는다(z = 0). LED 는 바닥에서 1,000mm 에 걸리고 무대는
    //   280mm 라 실제로 부딪히지는 않는다 — 뒤 단계에서 무대를 높이면 이 관계가 깨진다.
    assert.equal(stage.z - stage.d / 2, 0, `${t}: 무대 앞면이 LED 벽에서 떨어졌다`);
    assert.ok(stage.h < 1000, `${t}: 무대가 LED 하단(1,000mm)보다 높아졌다`);
  }
});

// ── ④ 알려진 기준선 결함 — 이번 단계에서 고치지 않는다 ─────────────────────

test('⑧ 알려진 결함 ①: 무대 상판이 하얗게 날아간다 — 원인이 되는 상수가 그대로 있다', () => {
  // PHASE 9-0 실측 — 무대를 켜면 날림 픽셀이 0.13 ~ **6.89%**, 무대를 끄면 **전 컷 0.00%**.
  //   동결 여섯 공간의 최대치는 1.44% 다. 원인은 이 값 하나이고, 마감·재질 체계를 타지
  //   않아 거칠기·톤 제어를 받지 못한다. **PHASE 9-c 에서 고친다.**
  assert.match(src('render3d-gl.js'), /stageTop: '#eef1f5',/);
  // 그때까지는 강당 디자인의 재질 칸이 비어 있다는 사실도 함께 고정한다.
  for (const [, id] of 강당) assert.equal(ROOM_DESIGNS[id].materials, INHERIT, id);
});

test('⑨ 알려진 결함 ②: 큰 방일수록 LED 가 작아진다 — 방 크기와 무관하게 고정이다', () => {
  // PHASE 9-0 실측 — 대강당 실내 컷에서 LED 화면이 화면의 **2.4%** 뿐이다(정면 벽은 38.6%).
  //   동결 여섯 공간은 11.9 ~ 32.6% 다. LED 크기는 방 크기를 전혀 보지 않는다.
  //   **PHASE 9-c 에서 최소 점유 규칙을 세운다.** 여기서는 '방 크기를 안 본다'는 사실만
  //   고정한다 — 강당 옵션 어디에도 LED 관련 항목이 없다.
  for (const [t] of 강당) {
    const keys = roomType(t).options.map(o => o.key);
    assert.deepEqual(keys, ['rows', 'seatsPerRow', 'aisles', 'stage', 'stageStep',
      'tiers', 'riserH', 'tierStartRow', 'occupancy', 'plant'], `${t}: 옵션 목록이 달라졌다`);
    assert.equal(keys.some(k => /led/i.test(k)), false, `${t}: LED 옵션이 생겼다`);
  }
});

test('⑩ 해결됨 — 뒤쪽 빈 바닥이 크기별 목표 범위 안으로 들어왔다 (PHASE 9-b)', () => {
  // **바뀐 이유.** PHASE 9-0 감사가 찾은 결함(소 3,050 → 중 7,250 → 대 **9,550mm**)을
  //   PHASE 9-b 가 고쳤다. 이제 맨 뒷줄과 뒤 벽 사이는 크기별 목표 범위 안에 있고,
  //   0 이 되지도 않는다(뒤쪽 통행로는 남겨 둔다).
  const 기대 = { hall_s: 2300, hall_m: 2600, hall_l: 4300 };
  for (const [t] of 강당) {
    const { W, D } = { hall_s: { W: 10000, D: 12000 }, hall_m: { W: 18000, D: 20000 },
      hall_l: { W: 24000, D: 28000 } }[t];
    const P = auditoriumSeating(t);
    const r = layoutRoom(t, defaultOptions(t), { W, D });
    const seats = r.items.filter(i => i.type === 'seat');
    const 뒤끝 = Math.max(...seats.map(i => i.z));
    assert.equal(D - 뒤끝, 기대[t], `${t}: 뒤쪽 빈 깊이가 달라졌다`);
    assert.equal(r.placed.rearEmpty, 기대[t], `${t}: 배치가 적어 준 뒤 여유가 실측과 다르다`);
    assert.ok(D - 뒤끝 >= P.rearMin, `${t}: 뒤 여유가 최소치(${P.rearMin}mm)보다 좁다`);
    assert.ok(D - 뒤끝 <= P.rearMax, `${t}: 뒤 여유가 최대치(${P.rearMax}mm)보다 넓다`);
  }
  // 대강당이 다시 7m 이상 비면 실패다(PHASE 9-b §8).
  assert.ok(기대.hall_l < 7000, '대강당 뒤쪽이 다시 7m 이상 비었다');
});

// ── ⑤ 동결 보호 ────────────────────────────────────────────────────────────

test('⑪ 동결된 여섯 공간의 디자인 연결이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(DEFAULT_DESIGN_BY_ROOM_TYPE).filter(([t]) => !t.startsWith('hall'))),
    { meeting: 'corporateMeeting', classroom: 'trainingRoom', control: 'controlRoom',
      ideation: 'ideationRoom' },
    '강당 아닌 용도의 기본 디자인이 바뀌었다');
  for (const id of 동결) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.READY, `${id}: 상태가 바뀌었다`);
    // 강당 디자인이 남의 목록에 섞이지 않았다.
    const t = ROOM_DESIGNS[id].roomType;
    assert.equal(designsFor(t).some(d => d.id.startsWith('auditorium')), false,
      `${t}: 고를 수 있는 목록에 강당 디자인이 들어갔다`);
  }
  assert.equal(ROOM_TYPES.length, 7, '공간 타입 수가 달라졌다');
});

test('⑫ 상황실 단차 보호 — 강당과 같은 헬퍼를 쓰므로 여기서 함께 고정한다', () => {
  // `tierPlan` · `addRisers` 는 `layoutHall` 과 `layoutControl` 이 **같이 쓴다**(PHASE 9-0
  //   감사의 유일한 HIGH 위험). PHASE 9-a 는 두 함수를 읽기만 하고 고치지 않았다.
  //   앞으로 객석 단차를 손볼 때 이 검사가 먼저 깨져서 상황실이 함께 움직인 것을 알린다.
  const s = src('room-presets.js');
  assert.match(s, /const plan = tierPlan\(rows, o\.tiers, o\.riserH, o\.tierStartRow\);/);
  // **PHASE 9-b 에서 바뀐 점.** 강당은 이제 자기 것(`auditoriumTierPlan` ·
  //   `addAuditoriumRisers`)을 쓴다. 그래서 공용 `addRisers` 는 선언 1 + 상황실 1 = **2** 곳뿐이다.
  //   수가 3 으로 돌아가면 강당이 다시 공용 함수를 붙잡았다는 뜻이므로 여기서 걸린다.
  assert.equal((s.match(/addRisers\(items, \{/g) || []).length, 2,
    '공용 단 만들기를 선언하거나 부르는 곳의 수가 달라졌다');
  assert.match(s, /function addRisers\(items, \{ W, plan, rows, rowZ, pitchZ, platW \}\)/,
    '공용 addRisers 의 모양이 바뀌었다');
  // 상황실 배치가 부르는 곳은 그대로 남아 있다.
  assert.match(s.split('function layoutControl')[1] || '', /addRisers\(items, \{/,
    '상황실이 공용 단 만들기를 놓쳤다');
  // 강당은 공용 `addRisers` 를 부르지 않는다.
  const 강당본문 = s.split('function layoutHall')[1].split('function layoutControl')[0];
  assert.equal(/addRisers\(items, \{/.test(강당본문), false, '강당이 다시 공용 단 만들기를 부른다');
  assert.match(강당본문, /addAuditoriumRisers\(items, \{/, '강당 전용 단 만들기가 사라졌다');
  assert.match(s, /^function addRisers\(items, \{/m, '단 만들기 함수 선언이 사라졌다');

  const r = layoutRoom('control', { ...defaultOptions('control'), tiers: 3, riserH: 250 },
    { W: 16000, D: 14000 });
  const risers = r.items.filter(i => i.type === 'riser');
  assert.deepEqual(risers.map(i => ({ x: Math.round(i.x), z: Math.round(i.z), w: i.w, d: i.d, h: i.h })),
    [{ x: 8000, z: 5800, w: 9200, d: 3250, h: 250 }], '상황실 단이 달라졌다');
  // 콘솔이 단 높이에 맞춰 올라앉는다(0 · 250 두 층).
  assert.deepEqual([...new Set(r.items.filter(i => i.type === 'console').map(i => i.y || 0))].sort(),
    [0, 250], '콘솔과 단의 높이가 어긋났다');
  assert.ok(r.notes.some(n => n.includes('2단으로 줄였습니다')), '단 수 안내가 사라졌다');
});

test('⑬ 카메라·조명은 이 단계의 범위 밖이다', () => {
  const s = src('room-presets.js');
  // **PHASE 9-c 에서 바뀐 것.** 무대는 이제 크기별 규칙이 정한다(그전에는 2,600 × 280 고정).
  assert.match(s, /const 무대 = o\.stage \? auditoriumStageSize\(typeId, W, Math\.max\(0, int\(o\.ledW, 0\)\), int\(o\.ledBottom, 1000\)\) : null;/);
  assert.match(s, /step: o\.stageStep !== false, variant: 'auditorium'/);
  // 첫 줄 위치는 **무대 깊이와 분리**돼 있다 — 무대가 깊어져도 좌석이 밀리지 않는다.
  assert.match(s, /const zStart = Math\.max\(P\.firstRowZ, stageD \+ P\.stageClear\);/);
  // 카메라 계획표에 강당이 아직 없다(PHASE 9-d.2 의 몫).
  assert.equal(/hall/i.test(src('design-camera.js')), false, '카메라 층에 강당이 들어갔다');
  assert.equal(/hall/i.test(src('design-lighting.js')), false, '조명 층에 강당이 들어갔다');
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 9-b — 좌석 · 통로 · 단차 계약 (DEC-142)
// ─────────────────────────────────────────────────────────────────────────────
// 여기부터는 '지금 값을 못박는' 검사가 아니라 **지켜야 할 약속**이다. 방 크기를 바꿔
// 가며 훑어 어떤 조합에서도 좌석이 겹치거나, 벽·무대·통로를 넘거나, 조용히 사라지지
// 않는지 본다. 한 크기만 보면 '그 크기에서만 맞는 값'을 약속으로 착각하게 된다.

/** 훑어볼 방 크기 — 작은 방부터 아주 큰 방까지. (폭 mm, 깊이 mm) */
const 방행렬 = Object.freeze([
  [8000, 8000], [10000, 12000], [12000, 14000], [14000, 18000],
  [18000, 20000], [20000, 24000], [24000, 28000], [28000, 34000],
]);
const 좌석 = DIMS.auditoriumChair;

/** 그 배치의 물리 위반 건수를 모두 센다. 하나라도 0 이 아니면 그 조합이 깨진 것이다. */
function 물리검사(t, W, D, opts) {
  const P = auditoriumSeating(t);
  const r = layoutRoom(t, { ...defaultOptions(t), ...opts }, { W, D });
  const seats = r.items.filter(i => i.type === 'seat');
  const risers = r.items.filter(i => i.type === 'riser');
  const stage = r.items.find(i => i.type === 'stage');
  const hw = 좌석.seatW / 2, hd = 좌석.seatD / 2;
  const 결과 = { 겹침: 0, 벽넘침: 0, 무대침범: 0, LED침범: 0, 통로침범: 0, 좁은통로: 0, 단밖: 0, 단무대침범: 0,
    좌석수: seats.length, placed: r.placed.placedSeatCount, rendered: r.placed.renderedSeatCount,
    rearEmpty: r.placed.rearEmpty, r };
  // 같은 단(같은 높이)에 있는 좌석끼리만 겹침을 본다 — 높이가 다르면 부딪히지 않는다.
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      if ((seats[i].y || 0) !== (seats[j].y || 0)) continue;
      if (Math.abs(seats[i].x - seats[j].x) < 2 * hw && Math.abs(seats[i].z - seats[j].z) < 2 * hd) 결과.겹침++;
    }
  }
  for (const s of seats) {
    if (s.x - hw < 0 || s.x + hw > W || s.z - hd < 0 || s.z + hd > D) 결과.벽넘침++;
    if (stage && s.z - hd < stage.z + stage.d / 2) 결과.무대침범++;
    // LED 벽(z = 0) 앞에는 최소한 무대 깊이만큼, 무대가 없으면 LED 앞 여유만큼 비운다.
    if (s.z - hd < (stage ? stage.d : FURNITURE.frontClear)) 결과.LED침범++;
  }
  // 통로 — 블록과 블록 사이는 통로 폭만큼 실제로 비어 있어야 한다.
  const xs = [...new Set(seats.map(s => Math.round(s.x)))].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) {
    const 간격 = xs[i] - xs[i - 1];
    if (간격 <= P.pitchX + 1) continue;                    // 같은 블록 안
    if (간격 - 좌석.seatW < P.aisleW) 결과.통로침범++;      // 통로인데 표에 적힌 폭에 못 미친다
    if (간격 - 좌석.seatW < AUDITORIUM_MIN_AISLE) 결과.좁은통로++;   // 사람이 지나갈 수 없다
  }
  // 단(riser) — 올라앉은 좌석은 제 높이의 단 안에 온전히 들어가야 한다.
  for (const s of seats) {
    const y = s.y || 0;
    if (y === 0) continue;
    const 단 = risers.find(v => v.h === y);
    if (!단 || s.x - hw < 단.x - 단.w / 2 || s.x + hw > 단.x + 단.w / 2
      || s.z - hd < 단.z - 단.d / 2 || s.z + hd > 단.z + 단.d / 2) 결과.단밖++;
  }
  for (const v of risers) if (stage && v.z - v.d / 2 < stage.z + stage.d / 2) 결과.단무대침범++;
  return 결과;
}

test('⑭ 좌석 물리 안전 — 방 크기를 바꿔 가며 훑어도 겹침·벽·무대·LED 침범이 없다', () => {
  for (const [t] of 강당) {
    for (const [W, D] of 방행렬) {
      const g = 물리검사(t, W, D, {});
      assert.ok(g.좌석수 > 0, `${t} ${W}×${D}: 좌석이 하나도 없다`);
      assert.equal(g.겹침, 0, `${t} ${W}×${D}: 좌석이 겹친다`);
      assert.equal(g.벽넘침, 0, `${t} ${W}×${D}: 좌석이 벽을 넘는다`);
      assert.equal(g.무대침범, 0, `${t} ${W}×${D}: 좌석이 무대를 침범한다`);
      assert.equal(g.LED침범, 0, `${t} ${W}×${D}: 좌석이 LED 벽 앞 여유를 침범한다`);
    }
  }
});

test('⑮ 통로 계약 — 블록 사이가 통로 폭만큼 실제로 비고, 좌우 블록이 대칭이다', () => {
  for (const [t] of 강당) {
    const P = auditoriumSeating(t);
    for (const [W, D] of 방행렬) {
      for (const aisles of ['0', '1', '2']) {
        const g = 물리검사(t, W, D, { aisles });
        assert.equal(g.통로침범, 0, `${t} ${W}×${D} 통로 ${aisles}: 통로가 좁다`);
        // 표에 적힌 통로 폭 자체가 사람이 지나다닐 수 있는 최소치를 지킨다.
        assert.ok(P.aisleW >= AUDITORIUM_MIN_AISLE, `${t}: 통로 폭 ${P.aisleW}mm 가 최소치보다 좁다`);
        assert.equal(g.좁은통로, 0, `${t} ${W}×${D} 통로 ${aisles}: 통로가 ${AUDITORIUM_MIN_AISLE}mm 보다 좁다`);
        const blocks = g.r.placed.blocks;
        assert.equal(blocks.length, Number(aisles) + 1, `${t} ${W}×${D}: 블록 수`);
        assert.equal(blocks.reduce((a, b) => a + b, 0), g.r.placed.perRow, `${t}: 블록 합이 줄당 좌석과 다르다`);
        // 좌우 블록은 같은 수다. 블록이 둘이고 좌석이 홀수일 때만 한 자리 차이를 허용한다.
        const 차이 = Math.abs(blocks[0] - blocks[blocks.length - 1]);
        assert.ok(차이 <= (blocks.length === 2 ? 1 : 0), `${t} ${W}×${D}: 좌우 블록이 대칭이 아니다 (${blocks})`);
      }
      // 통로가 둘이면 가운데 블록이 양옆보다 넓다(대·중강당의 자리 구조). 줄이 아주 짧으면
      //   (좁은 방) 세 블록이 같아질 수 있으므로, 그때는 '작지 않다'까지만 요구한다.
      const g2 = 물리검사(t, W, D, { aisles: '2' }), b = g2.r.placed.blocks;
      assert.ok(b[1] >= b[0], `${t} ${W}×${D}: 가운데 블록이 양옆보다 좁다 (${b})`);
      if (P.centerShare > 0 && g2.r.placed.perRow >= 10) {
        assert.ok(b[1] > b[0], `${t} ${W}×${D}: 가운데 블록이 크지 않다 (${b})`);
      }
    }
  }
});

test('⑯ 놓은 수 = 그린 수 — 조용히 사라지는 좌석이 없다', () => {
  for (const [t] of 강당) {
    for (const [W, D] of 방행렬) {
      for (const o of [{}, { aisles: '0' }, { stage: false }, { occupancy: 60 },
        { rows: 40, seatsPerRow: 60 }, { rows: 3, seatsPerRow: 5 }, { tiers: 8, riserH: 300 }]) {
        const g = 물리검사(t, W, D, o);
        assert.equal(g.placed, g.rendered, `${t} ${W}×${D} ${JSON.stringify(o)}: 놓은 수와 그린 수가 다르다`);
        assert.equal(g.rendered, g.좌석수, `${t} ${W}×${D} ${JSON.stringify(o)}: 센 수와 실제 물건 수가 다르다`);
        assert.ok(g.r.placed.geometricCapacity >= g.placed, `${t} ${W}×${D}: 정원보다 많이 놓았다`);
        // 앉은 사람은 좌석 위에만 올라간다 — 좌석 수를 넘지 않는다.
        const 앉은이 = g.r.items.filter(i => i.type === 'seated');
        assert.ok(앉은이.length <= g.좌석수, `${t} ${W}×${D}: 좌석보다 사람이 많다`);
      }
    }
  }
});

test('⑰ 뒤 여유 계약 — 어떤 방 깊이에서도 목표 범위 안이고 0 이 되지 않는다', () => {
  for (const [t] of 강당) {
    const P = auditoriumSeating(t);
    for (const [W, D] of 방행렬) {
      const g = 물리검사(t, W, D, {});
      assert.ok(g.rearEmpty > 0, `${t} ${W}×${D}: 뒤쪽 통행로가 사라졌다`);
      // 방이 아주 얕아 한 줄밖에 못 놓는 경우가 아니면 최소 여유를 지킨다.
      if (g.r.placed.rows > 1) {
        assert.ok(g.rearEmpty >= P.rearMin, `${t} ${W}×${D}: 뒤 여유 ${g.rearEmpty} < ${P.rearMin}`);
      }
      // 방이 깊어도 뒤쪽을 목표 이상으로 비워 두지 않는다(줄을 더 놓을 수 있으면 놓는다).
      if (g.r.placed.rows < g.r.placed.geometricCapacity / g.r.placed.perRow) {
        assert.ok(g.rearEmpty <= P.rearMax, `${t} ${W}×${D}: 뒤 여유 ${g.rearEmpty} > ${P.rearMax}`);
      }
    }
  }
});

test('⑱ 단차 안전 — 단이 낮은 곳에서 높은 곳으로만 가고, 좌석이 단 위에 온전히 앉는다', () => {
  for (const [t] of 강당) {
    const P = auditoriumSeating(t);
    for (const [W, D] of 방행렬) {
      for (const o of [{}, { tiers: 8, riserH: 300 }, { tiers: 3, riserH: 900 }]) {
        const g = 물리검사(t, W, D, o);
        const risers = g.r.items.filter(i => i.type === 'riser').sort((a, b) => a.z - b.z);
        assert.equal(g.단밖, 0, `${t} ${W}×${D} ${JSON.stringify(o)}: 좌석이 단 밖으로 나갔다`);
        assert.equal(g.단무대침범, 0, `${t} ${W}×${D}: 단이 무대를 침범한다`);
        // 뒤로 갈수록 높아진다(같은 높이가 두 번 나오지 않는다).
        for (let i = 1; i < risers.length; i++) {
          assert.ok(risers[i].h > risers[i - 1].h, `${t} ${W}×${D}: 단 높이가 뒤로 가며 낮아진다`);
        }
        // 한 단 높이는 상한을 넘지 않는다 — 900mm 를 넣어도 강당에서는 잘린다.
        const step = g.r.placed.riserH;
        assert.ok(step <= AUDITORIUM_MAX_RISER, `${t}: 한 단이 ${step}mm 로 너무 높다`);
        // 좌석이 실제로 단 위에 올라앉는다 — 단은 있는데 좌석은 바닥에 있으면 잡는다.
        const 높이집합 = new Set(g.r.items.filter(i => i.type === 'seat').map(s => s.y || 0));
        if (g.r.placed.riserH > 0 && g.r.placed.tiers > 1) {
          assert.equal(높이집합.size, g.r.placed.tiers,
            `${t} ${W}×${D} ${JSON.stringify(o)}: 좌석 높이 종류(${높이집합.size})가 단 수(${g.r.placed.tiers})와 다르다`);
          for (const v of risers) {
            assert.ok(높이집합.has(v.h), `${t} ${W}×${D}: ${v.h}mm 단 위에 앉은 좌석이 없다`);
          }
        }
        // 좌석 눈높이가 뒷줄로 가며 낮아지지 않는다.
        const 줄별y = new Map();
        for (const s of g.r.items.filter(i => i.type === 'seat')) 줄별y.set(Math.round(s.z), s.y || 0);
        const 줄 = [...줄별y.entries()].sort((a, b) => a[0] - b[0]).map(v => v[1]);
        for (let i = 1; i < 줄.length; i++) assert.ok(줄[i] >= 줄[i - 1], `${t} ${W}×${D}: 뒷줄이 더 낮다`);
      }
      // 자동 단 수 — 한 단에 몰리는 평평한 줄이 규칙(rowsPerTier)보다 많아지지 않는다.
      const auto = 물리검사(t, W, D, {}).r.placed;
      if (auto.tiers > 1) {
        assert.ok(Math.ceil(auto.rows / auto.tiers) <= P.rowsPerTier,
          `${t} ${W}×${D}: 한 단에 평평한 줄이 ${Math.ceil(auto.rows / auto.tiers)}줄이나 있다`);
      }
    }
  }
});

test('⑲ 성능 예산 — 자동 배치가 좌석 상한을 넘지 않는다', () => {
  // 좌석 하나가 그리기 삼각형 약 452개를 쓴다(PHASE 9-b 실측). 대강당 기본 구성이
  //   삼각형 200,000개를 넘지 않게 하려면 자동으로 놓는 좌석이 430석을 넘으면 안 된다.
  for (const [t] of 강당) {
    const P = auditoriumSeating(t);
    for (const [W, D] of 방행렬) {
      const g = 물리검사(t, W, D, {});
      assert.ok(g.좌석수 <= P.maxSeats, `${t} ${W}×${D}: 자동으로 ${g.좌석수}석을 놓았다(상한 ${P.maxSeats})`);
    }
  }
  assert.equal(AUDITORIUM_SEATING.hall_l.maxSeats, 430, '대강당 자동 좌석 상한이 바뀌었다');
  const 대 = layoutRoom('hall_l', defaultOptions('hall_l'), { W: 24000, D: 28000 });
  assert.ok(대.placed.seats * 452 < 200000, `대강당 기본 구성이 삼각형 예산을 넘는다`);
});

test('⑳ 결정성 — 같은 입력을 세 번 계산하면 한 값도 다르지 않다', () => {
  const 지문 = (t, W, D, o) => JSON.stringify(layoutRoom(t, { ...defaultOptions(t), ...o }, { W, D })
    .items.map(i => [i.type, Math.round(i.x), Math.round(i.z), Math.round(i.y || 0), i.w || 0, i.d || 0, i.h || 0]));
  for (const [t] of 강당) {
    for (const [W, D] of 방행렬) {
      const a = 지문(t, W, D, {}), b = 지문(t, W, D, {}), c = 지문(t, W, D, {});
      assert.equal(a, b, `${t} ${W}×${D}: 두 번째 계산이 다르다`);
      assert.equal(b, c, `${t} ${W}×${D}: 세 번째 계산이 다르다`);
    }
  }
});

test('㉑ 크기별 차별화 — 소·중·대가 같은 숫자를 쓰지 않는다', () => {
  const keys = ['pitchX', 'pitchZ', 'aisleW', 'firstRowZ', 'rearAim', 'maxSeats'];
  for (const k of keys) {
    const 값 = 강당.map(([t]) => AUDITORIUM_SEATING[t][k]);
    assert.equal(new Set(값).size, 3, `${k}: 세 크기가 같은 값을 쓴다`);
    assert.ok(값[0] < 값[1] && 값[1] < 값[2], `${k}: 크기 순서대로 커지지 않는다`);
  }
  // 소강당은 평평하고(단 1), 중·대강당은 단이 생긴다.
  assert.equal(layoutRoom('hall_s', defaultOptions('hall_s'), { W: 10000, D: 12000 }).placed.tiers, 1);
  assert.ok(layoutRoom('hall_m', defaultOptions('hall_m'), { W: 18000, D: 20000 }).placed.tiers > 1);
  assert.ok(layoutRoom('hall_l', defaultOptions('hall_l'), { W: 24000, D: 28000 }).placed.tiers > 1);
});

test('㉒ 직접 넣은 값이 자동보다 앞선다 — 방보다 크면 줄이고 알린다', () => {
  for (const [t] of 강당) {
    const 요청 = layoutRoom(t, { ...defaultOptions(t), rows: 5, seatsPerRow: 8 }, { W: 24000, D: 28000 });
    assert.equal(요청.placed.rows, 5, `${t}: 직접 넣은 줄 수가 무시됐다`);
    assert.equal(요청.placed.perRow, 8, `${t}: 직접 넣은 줄당 좌석이 무시됐다`);
    assert.equal(요청.placed.plannedSeatCount, 40, `${t}: 놓으려던 수가 40이 아니다`);
    assert.equal(요청.placed.placedSeatCount, 40, `${t}: 실제로 놓은 수가 다르다`);
    // 방보다 크게 요청하면 줄여 놓고 **말해 준다**(조용히 줄이지 않는다).
    const 과다 = layoutRoom(t, { ...defaultOptions(t), rows: 40, seatsPerRow: 60 }, { W: 9000, D: 9000 });
    assert.ok(과다.placed.rows < 40 && 과다.placed.perRow < 60, `${t}: 좁은 방인데 줄이지 않았다`);
    assert.ok(과다.notes.some(n => n.includes('줄였습니다')), `${t}: 줄였다는 안내가 없다`);
    assert.ok(과다.placed.plannedSeatCount > 과다.placed.placedSeatCount, `${t}: 놓으려던 수와 놓은 수가 같다`);
  }
});

test('㉓ 강당 전용 단 계획은 공용 tierPlan 의 결과를 바꾸지 않는다', () => {
  // 같은 요청을 공용 함수와 강당 함수에 각각 넣어 본다. 강당 쪽이 더 얹는 것은
  //   ① 단 수 자동(0) ② 한 단 높이 상한뿐이고, 그 밖에는 공용 결과 그대로여야 한다.
  const P = auditoriumSeating('hall_l');
  for (const rows of [3, 6, 10, 20]) {
    for (const tiers of [1, 2, 4]) {
      const 공용 = tierPlan(rows, tiers, 250, 0);
      const 강당것 = auditoriumTierPlan(rows, { tiers, riserH: 250, tierStartRow: 0 }, P);
      assert.deepEqual(강당것.tierRows, 공용.tierRows, `${rows}줄 ${tiers}단: 단에 나눈 줄이 다르다`);
      assert.deepEqual(강당것.tierStart, 공용.tierStart, `${rows}줄 ${tiers}단: 단 시작 줄이 다르다`);
      assert.equal(강당것.riserH, 공용.riserH, `${rows}줄 ${tiers}단: 한 단 높이가 다르다`);
    }
  }
  // 상한을 넘겨 넣으면 강당에서만 잘린다 — 상황실(공용)은 그대로 900mm 를 쓴다.
  assert.equal(tierPlan(6, 3, 900, 0).riserH, 900, '공용 단 높이가 잘렸다');
  assert.equal(auditoriumTierPlan(6, { tiers: 3, riserH: 900, tierStartRow: 0 }, P).riserH, AUDITORIUM_MAX_RISER);
});

test('㉔ 전경 가림 — 좌석이나 단 하나가 화면 아래 띠를 독점하지 않는다', () => {
  // PHASE 8 에서 세운 **물건을 가리지 않는** 잣대를 강당에 그대로 쓴다(§18). 카메라는
  //   손대지 않았다 — 강당 전용 화각은 PHASE 9-d.2 의 몫이라, 지금은 공용 계획을 쓴다.
  //   좌석을 앞으로 당기거나 단을 높이면 맨 앞 물건이 화면 아래를 덮게 되는데, 그때
  //   이 검사가 걸린다.
  const aspect = 574 / 563;
  /** 바닥 위 상자 하나가 화면 **아래 25% 띠**를 덮는 넓이 비율(%). */
  const 아래띠점유 = (plan, 상자) => {
    const [cx, cy, cz] = plan.position, [tx, ty, tz] = plan.target;
    const fx = tx - cx, fy = ty - cy, fz = tz - cz, fl = Math.hypot(fx, fy, fz);
    const f = [fx / fl, fy / fl, fz / fl];
    const rl = Math.hypot(-f[2], f[0]) || 1;
    const r = [-f[2] / rl, 0, f[0] / rl];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const tV = Math.tan(plan.fov * Math.PI / 360), tH = tV * aspect;
    const 점 = [];
    for (const [px, pz] of 상자.pts) for (const py of [상자.y, 상자.y + 상자.h]) {
      const dx = px - cx, dy = py - cy, dz = pz - cz;
      const fwd = dx * f[0] + dy * f[1] + dz * f[2];
      if (fwd <= 1e-6) continue;
      점.push([(dx * r[0] + dy * r[1] + dz * r[2]) / fwd / tH, (dx * u[0] + dy * u[1] + dz * u[2]) / fwd / tV]);
    }
    if (점.length < 3) return 0;
    const p0 = [...점].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const 반 = s => { const h = [];
      for (const q of s) { while (h.length >= 2 && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }
      h.pop(); return h; };
    let poly = [...반(p0), ...반([...p0].reverse())];
    for (const [nx, ny, d] of [[1, 0, 1], [-1, 0, 1], [0, 1, -0.5], [0, -1, 1]]) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = d - (a[0] * nx + a[1] * ny), db = d - (b[0] * nx + b[1] * ny);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      poly = out; if (!poly.length) return 0;
    }
    let A = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; }
    return Math.min(100, Math.abs(A / 2) / (2 * 0.5) * 100);
  };
  /** 좌석을 바닥 위 상자로 바꾼다(단위 m). 좌석 등받이 높이 0.95m.
   *  **단(riser)은 세지 않는다** — 단은 물건이 아니라 카메라가 딛고 선 바닥이라,
   *  '앞을 가리는 물건'으로 재면 언제나 화면 아래를 가득 채운 것으로 나온다. */
  const 상자 = it => {
    if (it.type === 'seat') {
      const w = DIMS.auditoriumChair.seatW / 1000, d = DIMS.auditoriumChair.seatD / 1000;
      return { pts: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) =>
        [(it.x + sx * w * 500) / 1000, (it.z + sz * d * 500) / 1000]), y: (it.y || 0) / 1000, h: 0.95 };
    }
    return null;
  };
  let 최악 = { v: 0, 이름: '', type: '' };
  for (const [t, id] of 강당) {
    const { W, H, D } = { hall_s: { W: 10000, H: 4000, D: 12000 },
      hall_m: { W: 18000, H: 6000, D: 20000 }, hall_l: { W: 24000, H: 8000, D: 28000 } }[t];
    const lay = layoutRoom(t, defaultOptions(t), { W, D, design: id });
    const model = buildGLModel({
      space: { W, H, D },
      led: { marginW: Math.max(0, (W - 4000) / 2), mount: 1000, w: 4000, h: 2300, depth: 60, cols: 4, rows: 4 },
      items: lay.items, roomType: t, design: id,
    });
    for (const view of ['interior', 'corner-l', 'corner-r', 'front', 'iso', 'top']) {
      // 강당 전용 화각은 아직 없다(PHASE 9-d.2). 공용 시점 자세를 그대로 쓴다.
      const pose = cameraPlanForDesign(id, view, model, aspect) || presetPose(view, model, aspect);
      const plan = { position: pose.position, target: pose.target, fov: pose.fov || FOV_DEG };
      for (const it of lay.items) {
        const b = 상자(it); if (!b) continue;
        const v = 아래띠점유(plan, b);
        if (v > 최악.v) 최악 = { v: +v.toFixed(1), 이름: `${t}/${view}`, type: it.type };
      }
    }
  }
  // 아이디에이션 계약(56%)보다 엄격하게 **35%** 로 둔다 — 강당에는 앞을 막을 만큼 큰
  //   상판 가구가 없고, 좌석 하나가 화면 아래를 3분의 1 넘게 덮으면 좌석이 카메라에
  //   붙었다는 뜻이기 때문이다.
  assert.ok(최악.v <= 35,
    `${최악.이름}: ${최악.type} 하나가 화면 아래 띠의 ${최악.v}% 를 덮는다`);
  // 잣대가 헛돌지 않는다는 확인 — 실제로 잰 값이 0 이 아니다.
  assert.ok(최악.v > 3, `가장 큰 전경 물건이 ${최악.v}% 뿐이다 — 재는 방법이 잘못됐을 수 있다`);
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 9-c — 무대 · 전면부 · LED 크기 · 밝은 면 재질 계약 (DEC-143)
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 9-b 가 좌석을 정리했고, 여기서는 **전면부**를 정리한다. 세 가지가 목표다.
//   ① 무대가 방 폭 100% 인 '낮은 턱'에서 크기별 비율을 가진 무대로
//   ② 무대 윗면·객석 단 윗면이 하얗게 날아가던 문제를 마감 체계로 해결
//   ③ 방이 커져도 LED 가 그대로이던 문제를 **권장 설치 크기**로 해결

test('㉕ 무대 비율 — 방 폭을 꽉 채우지 않고, 좌우 여백과 LED 여백을 지킨다', () => {
  for (const [t] of 강당) {
    const R = AUDITORIUM_STAGE[t];
    for (const [W, D] of 방행렬) {
      for (const ledW of [0, 3226, 6451, 12000]) {
        const r = layoutRoom(t, defaultOptions(t), { W, D, ledW, ledBottom: 1000 });
        const stage = r.items.find(i => i.type === 'stage');
        assert.ok(stage, `${t} ${W}×${D}: 무대가 없다`);
        assert.ok(stage.w < W, `${t} ${W}×${D}: 무대가 방 폭을 꽉 채운다(${stage.w}/${W})`);
        // 좌우 벽까지 여백. 방이 아주 좁으면 최소 폭(1,000mm)이 이기므로 그때는 건너뛴다.
        if (stage.w > 1000) {
          assert.ok((W - stage.w) / 2 >= R.minSideMargin - 1,
            `${t} ${W}×${D}: 무대 옆 여백 ${(W - stage.w) / 2}mm < ${R.minSideMargin}mm`);
        }
        // LED 화면보다 좌우로 더 넓다(방이 좁아 둘 다 못 지키면 벽 여백이 이긴다).
        if (ledW > 0 && ledW + R.ledMargin * 2 <= W - R.minSideMargin * 2) {
          assert.ok(stage.w >= ledW + R.ledMargin * 2,
            `${t} ${W}×${D}: 무대(${stage.w})가 LED(${ledW}) + 여백보다 좁다`);
        }
        assert.equal(stage.d, R.depth, `${t} ${W}×${D}: 무대 깊이`);
        assert.equal(stage.variant, 'auditorium', `${t}: 무대에 강당 표식이 없다`);
        // 무대 앞면은 LED 벽에 붙어 있다(PHASE 9-a 부터의 관계).
        assert.equal(stage.z - stage.d / 2, 0, `${t} ${W}×${D}: 무대 앞면이 LED 벽에서 떨어졌다`);
      }
    }
  }
  // 세 크기의 무대 비율·깊이·높이가 서로 다르다(더 이상 한 값이 아니다).
  for (const k of ['widthRatio', 'depth', 'height', 'minSideMargin']) {
    const 값 = 강당.map(([t]) => AUDITORIUM_STAGE[t][k]);
    assert.equal(new Set(값).size, 3, `${k}: 세 크기가 같은 값을 쓴다`);
  }
  // 큰 강당일수록 무대 폭 **비율**은 작아진다(방이 커진다고 벽까지 채우지 않는다).
  assert.ok(AUDITORIUM_STAGE.hall_s.widthRatio > AUDITORIUM_STAGE.hall_m.widthRatio);
  assert.ok(AUDITORIUM_STAGE.hall_m.widthRatio > AUDITORIUM_STAGE.hall_l.widthRatio);
});

test('㉖ 무대와 첫 줄 사이에 통행 거리가 남는다 — 좌석은 한 자리도 밀리지 않는다', () => {
  const hd = DIMS.auditoriumChair.seatD / 2;
  for (const [t] of 강당) {
    const P = auditoriumSeating(t);
    for (const [W, D] of 방행렬) {
      const r = layoutRoom(t, defaultOptions(t), { W, D, ledBottom: 1000 });
      const stage = r.items.find(i => i.type === 'stage');
      const 첫줄 = Math.min(...r.items.filter(i => i.type === 'seat').map(i => i.z));
      assert.ok(첫줄 - hd - (stage.z + stage.d / 2) >= P.stageClear - hd - 1,
        `${t} ${W}×${D}: 무대 뒤 통행 거리가 모자라다`);
      // 무대 깊이가 바뀌어도 첫 줄은 크기별 고정값 그대로다(PHASE 9-b 동결).
      if (D - P.firstRowZ > 3000) {
        assert.equal(첫줄, P.firstRowZ, `${t} ${W}×${D}: 첫 줄이 ${P.firstRowZ} 에서 밀렸다`);
      }
    }
  }
});

test('㉗ 무대 높이 — LED 화면 아래를 침범하지 않는다', () => {
  for (const [t] of 강당) {
    const R = AUDITORIUM_STAGE[t];
    for (const ledBottom of [1000, 900, 700, 500, 300]) {
      const r = layoutRoom(t, defaultOptions(t), { W: 20000, D: 24000, ledBottom });
      const stage = r.items.find(i => i.type === 'stage');
      assert.ok(stage.h + AUDITORIUM_STAGE_LED_CLEAR <= ledBottom || stage.h === 120,
        `${t} 하단 ${ledBottom}: 무대(${stage.h})가 LED 화면 아래를 침범한다`);
      assert.ok(stage.h <= R.height, `${t}: 무대가 표보다 높아졌다`);
      assert.ok(stage.h >= 120, `${t}: 무대가 사라졌다`);
      assert.ok(stage.h < 1000, `${t}: 무대 높이가 비현실적이다`);
    }
    // 하단 높이가 넉넉하면 표의 값을 그대로 쓴다.
    const 기본 = layoutRoom(t, defaultOptions(t), { W: 20000, D: 24000, ledBottom: 1500 });
    assert.equal(기본.items.find(i => i.type === 'stage').h, R.height, `${t}: 기본 무대 높이`);
  }
});

test('㉘ LED 권장 설치 크기 — 강당만, 방 안에, 작은 강당은 그대로', () => {
  // 이 함수는 **요청값(얼마나 큰 화면을 세울지)** 을 돌려줄 뿐이다. 캐비닛 수·전력 같은
  //   산출은 늘 하던 계산이 그 요청값을 채우며 나온다 — 여기서 스펙을 지어내지 않는다.
  for (const t of ['meeting', 'classroom', 'control', 'ideation', '없는용도']) {
    assert.equal(auditoriumLedSize(t, { W: 12000, H: 4000, D: 14000 }), null,
      `${t}: 강당이 아닌 용도에 권장 크기가 생겼다`);
  }
  const 기대 = {
    hall_s: { W: 10000, H: 4000, D: 12000, lastRowZ: 9700, w: 4000, h: 2300 },
    hall_m: { W: 18000, H: 6000, D: 20000, lastRowZ: 17400, w: 5200, h: 3000 },
    hall_l: { W: 24000, H: 8000, D: 28000, lastRowZ: 23700, w: 7100, h: 4000 },
  };
  for (const [t] of 강당) {
    const e = 기대[t];
    const got = auditoriumLedSize(t, { W: e.W, H: e.H, D: e.D, ledBottom: 1000, lastRowZ: e.lastRowZ });
    assert.deepEqual(got, { w: e.w, h: e.h }, `${t}: 권장 크기`);
    // 소강당은 제품 기본값(4,000×2,300) 그대로 — 작은 방에서 화면을 억지로 키우지 않는다.
    if (t === 'hall_s') assert.deepEqual(got, { w: 4000, h: 2300 }, '소강당은 기본값 그대로다');
  }
  // 방이 깊을수록 커진다(줄지 않는다).
  let 앞 = 0;
  for (const D of [12000, 16000, 20000, 24000, 28000, 34000]) {
    const s = auditoriumLedSize('hall_l', { W: 30000, H: 9000, D, ledBottom: 1000, lastRowZ: D - 4000 });
    assert.ok(s.h >= 앞, `깊이 ${D}: 화면이 더 작아졌다`);
    앞 = s.h;
  }
  // 벽·천장을 넘지 않는다. **제품 기본값으로 떨어진 경우는 뺀다** — 그때는 화면의 기존
  //   제한(`clampLedInputs`)이 마지막에 벽 크기로 잘라 주고, 여기서 줄이지 않는 것이 규칙이다.
  for (const [W, H, ledBottom] of [[9000, 8000, 1000], [24000, 5000, 1000], [24000, 8000, 3000]]) {
    const s = auditoriumLedSize('hall_l', { W, H, D: 30000, ledBottom, lastRowZ: 26000 });
    assert.ok(s.w <= W - AUDITORIUM_STAGE.hall_l.minSideMargin * 2 + 1, `${W}×${H}: 화면이 벽을 넘는다`);
    assert.ok(s.h + ledBottom + AUDITORIUM_LED_TOP_CLEAR <= H + 1, `${W}×${H}: 화면이 천장을 넘는다`);
    assert.ok(Math.abs(s.w / s.h - 16 / 9) < 0.35, `${W}×${H}: 화면비가 크게 어긋났다`);
  }
  // 방이 작아 권장값이 기본값보다 작아지는 경우 — **줄이지 않고 기본값 그대로 둔다.**
  for (const [W, H, ledBottom] of [[6000, 3000, 800], [8000, 3400, 1000], [7000, 3000, 1000]]) {
    assert.deepEqual(auditoriumLedSize('hall_l', { W, H, D: 18000, ledBottom, lastRowZ: 14000 }),
      { w: AUDITORIUM_LED_MIN.w, h: AUDITORIUM_LED_MIN.h },
      `${W}×${H}: 공간 타입을 바꿨다고 화면이 줄었다`);
  }
  // 같은 입력이면 같은 값이다(결정적).
  const a = auditoriumLedSize('hall_m', { W: 18000, H: 6000, D: 20000, ledBottom: 1000, lastRowZ: 17400 });
  const b = auditoriumLedSize('hall_m', { W: 18000, H: 6000, D: 20000, ledBottom: 1000, lastRowZ: 17400 });
  assert.deepEqual(a, b);
});

test('㉙ 밝은 면 마감 — 강당에서만 갈아 끼우고, 더 이상 흰색이 아니다', () => {
  // 날림(흰색으로 타 버리는 면)의 원인은 거의 흰색이던 두 값이었다.
  //   무대 윗면 `#eef1f5`(밝기 0.94) · 객석 단 윗면 `#e6eaf0`(0.91).
  const 밝기 = hex => {
    const n = parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) * 0.2126 + ((n >> 8) & 255) * 0.7152 + (n & 255) * 0.0722) / 255;
  };
  for (const [, id] of 강당) {
    const fin = auditoriumSurfaceFinish(id);
    assert.ok(fin, `${id}: 강당 마감이 없다`);
    for (const part of AUDITORIUM_SURFACE_PARTS) {
      const f = fin[part];
      assert.ok(f && f.color && f.material, `${id}.${part}: 마감이 비었다`);
      // 정식 재질을 새로 만들지 않는다 — 기존 13종 안에서 고른다.
      assert.ok(MATERIAL_IDS.includes(f.material), `${id}.${part}: 모르는 재질 ${f.material}`);
      assert.ok(밝기(f.color) <= 0.80, `${id}.${part}: 아직 너무 밝다(${f.color})`);
      // 바닥(#d4d9e1)보다 어둡거나 비슷해야 구조물로 읽힌다.
      assert.ok(밝기(f.color) <= 밝기('#d4d9e1'), `${id}.${part}: 바닥보다 밝다`);
    }
    // 예전 흰색 두 값이 그대로 돌아오지 않았다.
    assert.notEqual(fin.auditoriumStageTop.color.toLowerCase(), '#eef1f5');
    assert.notEqual(fin.auditoriumRiserTop.color.toLowerCase(), '#e6eaf0');
    // 무대와 객석 단은 서로 다른 색이다(뭉개지지 않는다).
    assert.notEqual(fin.auditoriumStageTop.color, fin.auditoriumRiserTop.color);
    // 전면판은 윗면보다 어둡다(무대 높이가 읽힌다).
    assert.ok(밝기(fin.auditoriumStageFascia.color) < 밝기(fin.auditoriumStageTop.color));
  }
  // 강당이 아닌 공간에는 붙지 않는다 — 여기서 null 이 아니면 동결 공간이 함께 바뀐다.
  for (const id of [...동결, null, undefined, '없는디자인']) {
    assert.equal(auditoriumSurfaceFinish(id), null, `${id}: 강당 마감이 새어 나갔다`);
  }
  // 공용 값(상황실 콘솔 단·렌더러 무대 색)은 그대로 남아 있다.
  assert.equal(FURNITURE_COLORS.riserTop, '#e6eaf0', '공용 단 색이 바뀌었다');
  assert.equal(FURNITURE_COLORS.riserSide, '#b9c1cd', '공용 단 옆면 색이 바뀌었다');
  assert.match(src('render3d-gl.js'), /stageTop: '#eef1f5',/);
});

test('㉚ 강당 단에만 표식이 붙는다 — 상황실 콘솔 단은 예전 마감 그대로다', () => {
  const 강당단 = layoutRoom('hall_l', defaultOptions('hall_l'), { W: 24000, D: 28000 })
    .items.filter(i => i.type === 'riser');
  assert.ok(강당단.length > 0, '강당 단이 없다');
  for (const v of 강당단) assert.equal(v.variant, 'auditorium', '강당 단에 표식이 없다');
  const 상황실 = layoutRoom('control', { ...defaultOptions('control'), tiers: 3, riserH: 250 },
    { W: 16000, D: 14000 });
  const 상황실단 = 상황실.items.filter(i => i.type === 'riser');
  assert.equal(상황실단.length, 1, '상황실 단 수가 달라졌다');
  assert.equal(상황실단[0].variant, undefined, '상황실 단에 강당 표식이 붙었다');
  // 기하 기준값도 그대로다(PHASE 9-a 부터의 값).
  assert.deepEqual(상황실단.map(i => ({ x: i.x, z: i.z, w: i.w, d: i.d, h: i.h })),
    [{ x: 8000, z: 5800, w: 9200, d: 3250, h: 250 }], '상황실 단이 달라졌다');
  // 그리는 쪽도 표식으로만 갈라진다.
  assert.match(src('furniture-gl.js'), /const aud = it\.variant === 'auditorium' && mat\.auditoriumRiserTop;/);
});

test('㉛ PHASE 9-b 좌석·단차가 한 값도 바뀌지 않았다 (무대·LED 변경의 부작용 확인)', () => {
  const 기대 = {
    hall_s: { W: 10000, D: 12000, seats: 84, rows: 7, perRow: 12, first: 4000, rear: 2300, tiers: 1, risers: [] },
    hall_m: { W: 18000, D: 20000, seats: 280, rows: 14, perRow: 20, first: 4400, rear: 2600, tiers: 4,
      risers: [220, 440, 660] },
    hall_l: { W: 24000, D: 28000, seats: 418, rows: 19, perRow: 22, first: 4800, rear: 4300, tiers: 5,
      risers: [250, 500, 750, 1000] },
  };
  for (const [t] of 강당) {
    const e = 기대[t];
    const r = layoutRoom(t, defaultOptions(t), { W: e.W, D: e.D, ledBottom: 1000 });
    assert.equal(r.placed.seats, e.seats, `${t}: 좌석 수`);
    assert.equal(r.placed.rows, e.rows, `${t}: 줄 수`);
    assert.equal(r.placed.perRow, e.perRow, `${t}: 줄당 좌석`);
    assert.equal(r.placed.firstRowZ, e.first, `${t}: 첫 줄`);
    assert.equal(r.placed.rearEmpty, e.rear, `${t}: 뒤 여유`);
    assert.equal(r.placed.tiers, e.tiers, `${t}: 단 수`);
    assert.deepEqual(r.items.filter(i => i.type === 'riser').map(i => i.h), e.risers, `${t}: 단 높이`);
  }
});
