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
import { layoutRoom, defaultOptions, roomType, ROOM_TYPES, FURNITURE } from '../src/room-presets.js';
import { DIMS } from '../src/furniture-assets.js';
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
  // 강당 셋은 배치 함수 하나(`layoutHall`)를 같이 쓴다 — 이 단계가 나누지 않았다.
  assert.match(src('room-presets.js'), /case 'hall_s': case 'hall_m': case 'hall_l': return layoutHall\(o, W, D\);/);
});

// ── ③ 레거시 기준선 — '승인'이 아니라 '지금 값' 이다 ────────────────────────

test('⑥ 강당 기본값 스냅샷 — 뒤 단계가 의도적으로 바꿀 때만 이 수가 움직인다', () => {
  // **이 값들을 좋다고 인정하는 것이 아니다.** PHASE 9-0 감사가 찾아낸 그대로이고,
  //   세 크기가 사실상 같은 값을 쓴다는 것(첫 줄 4,200 · 줄 간격 950 · 무대 2,600×280)이
  //   PHASE 9-b·9-c 가 풀어야 할 숙제다. 여기서는 바꾸지 않고 못박기만 한다.
  const 기대 = {
    hall_s: { rows: 6, seatsPerRow: 10, aisles: '1', seats: 60, capacity: 91, W: 10000, D: 12000 },
    hall_m: { rows: 10, seatsPerRow: 16, aisles: '2', seats: 160, capacity: 375, W: 18000, D: 20000 },
    hall_l: { rows: 16, seatsPerRow: 24, aisles: '2', seats: 384, capacity: 864, W: 24000, D: 28000 },
  };
  for (const [t] of 강당) {
    const e = 기대[t], o = defaultOptions(t);
    assert.equal(o.rows, e.rows, `${t}: 기본 줄 수`);
    assert.equal(o.seatsPerRow, e.seatsPerRow, `${t}: 기본 줄당 좌석`);
    assert.equal(o.aisles, e.aisles, `${t}: 기본 통로 수`);
    assert.equal(o.stage, true, `${t}: 무대 기본값`);
    assert.equal(o.tiers, 1, `${t}: 객석 단 기본값(1 = 평평한 바닥)`);
    const r = layoutRoom(t, o, { W: e.W, D: e.D });
    const seats = r.items.filter(i => i.type === 'seat');
    // **§18 — 두 수를 구분해서 기록한다.** `capacity` 는 방에 들어갈 수 있는 기하학적
    //   최대이고, 실제로 놓인 좌석 수와 다르다(아이디에이션은 둘이 같아서 뜻이 어긋난다).
    const geometricCapacity = r.capacity, renderedSeatCount = seats.length;
    assert.equal(renderedSeatCount, e.seats, `${t}: 그린 좌석 수`);
    assert.equal(r.placed.seats, e.seats, `${t}: 놓았다고 센 수`);
    assert.equal(geometricCapacity, e.capacity, `${t}: 기하학적 최대`);
    assert.ok(geometricCapacity > renderedSeatCount,
      `${t}: 두 수가 같아졌다 — 뜻이 다른 값이라는 사실이 흐려진다`);
    // 세 크기가 같은 값을 쓰는 지점(= PHASE 9-b 의 숙제).
    const zs = [...new Set(seats.map(i => Math.round(i.z)))].sort((a, b) => a - b);
    assert.equal(zs[0], 4200, `${t}: 첫 줄 위치가 세 크기 공통 4,200 이 아니다`);
    assert.equal(zs[1] - zs[0], FURNITURE.seatPitchZ, `${t}: 줄 간격`);
    const stage = r.items.find(i => i.type === 'stage');
    assert.equal(stage.w, e.W, `${t}: 무대 폭이 방 폭 100% 가 아니다`);
    assert.equal(stage.d, 2600, `${t}: 무대 깊이`);
    assert.equal(stage.h, 280, `${t}: 무대 높이`);
  }
  // 좌석 간격 상수도 세 크기 공통이다.
  assert.equal(FURNITURE.seatPitchX, 550);
  assert.equal(FURNITURE.seatPitchZ, 950);
  assert.equal(FURNITURE.aisleW, 1200);
});

test('⑦ 물리 기준선 — 지금도 좌석이 겹치거나 방을 넘지 않는다', () => {
  // 뒤 단계에서 줄 간격·통로·단차를 손볼 때 이 검사가 먼저 깨져야 한다.
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
    assert.equal(Math.round(최소여유), 50, `${t}: 좌석 최소 여유가 50mm 에서 달라졌다`);
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

test('⑩ 알려진 결함 ③: 방이 커질수록 뒤쪽 빈 바닥이 넓어진다', () => {
  // 소 3,050 → 중 7,250 → 대 **9,550mm**. 좌석은 방 폭의 59 ~ 63% 만 쓴다.
  //   PHASE 9-b 가 줄 수·간격을 다시 잡을 때 이 수가 줄어야 한다.
  const 기대 = { hall_s: 3050, hall_m: 7250, hall_l: 9550 };
  for (const [t] of 강당) {
    const { W, D } = { hall_s: { W: 10000, D: 12000 }, hall_m: { W: 18000, D: 20000 },
      hall_l: { W: 24000, D: 28000 } }[t];
    const r = layoutRoom(t, defaultOptions(t), { W, D });
    const seats = r.items.filter(i => i.type === 'seat');
    const 뒤끝 = Math.max(...seats.map(i => i.z));
    assert.equal(D - 뒤끝, 기대[t], `${t}: 뒤쪽 빈 깊이가 달라졌다`);
  }
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
  // 선언 1 + 부르는 곳 2(강당·상황실) = 3. 부르는 곳이 늘거나 줄면 여기서 걸린다.
  assert.equal((s.match(/addRisers\(items, \{/g) || []).length, 3,
    '단 만들기를 선언하거나 부르는 곳의 수가 달라졌다');
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

test('⑬ 이 단계는 배치·렌더러·카메라·조명 파일을 건드리지 않았다', () => {
  // 강당 배치 함수의 핵심 줄이 그대로인지 — 좌석·통로·무대 계산.
  const s = src('room-presets.js');
  assert.match(s, /const stageD = o\.stage \? 2600 : 0;/);
  assert.match(s, /const zStart = Math\.max\(stageD, F\.frontClear\) \+ 1600;/);
  assert.match(s, /h: 280, step: o\.stageStep !== false/);
  // 카메라 계획표에 강당이 아직 없다(PHASE 9-d.2 의 몫).
  assert.equal(/hall/i.test(src('design-camera.js')), false, '카메라 층에 강당이 들어갔다');
  assert.equal(/hall/i.test(src('design-lighting.js')), false, '조명 층에 강당이 들어갔다');
});
