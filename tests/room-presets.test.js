// room-presets.test.js — 공간 타입 프리셋 + 가구 배치 계산 회귀 테스트.
// '방 밖으로 나가지 않는다 / 요청보다 많이 놓지 않는다'가 핵심 규칙이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_TYPES, DEFAULT_ROOM_TYPE, roomType, defaultOptions, normalizeOptions,
  autoDepthForType, layoutRoom, FURNITURE, faceTowards, distributeSeats, personSpot, PERSON_BLOCKING,
} from '../src/room-presets.js';

// 배치된 물건이 모두 방 안(0..W, 0..D)에 있는지 확인한다.
function assertInside(res, W, D, label) {
  for (const it of res.items) {
    const hw = (it.w || 900) / 2, hd = (it.d || 900) / 2;
    assert.ok(it.x - hw >= -400 && it.x + hw <= W + 400, `${label}: ${it.type} x=${it.x} (W=${W})`);
    assert.ok(it.z - hd >= -400 && it.z + hd <= D + 400, `${label}: ${it.type} z=${it.z} (D=${D})`);
  }
}

test('공간 타입 — 6종이 모두 있고 각자 옵션 스키마를 가진다', () => {
  const ids = ROOM_TYPES.map(t => t.id);
  assert.deepEqual(ids, ['meeting', 'classroom', 'hall_s', 'hall_m', 'hall_l', 'control']);
  for (const t of ROOM_TYPES) {
    assert.ok(t.label && t.options.length > 0, t.id);
    for (const o of t.options) {
      assert.ok(['select', 'number', 'toggle'].includes(o.type), `${t.id}.${o.key}`);
      if (o.type === 'select') assert.ok(o.choices.some(c => c.value === o.default));
      if (o.type === 'number') assert.ok(o.default >= o.min && o.default <= o.max);
    }
  }
  assert.equal(roomType('없는타입').id, DEFAULT_ROOM_TYPE);
});

test('옵션 정리 — 없는 값은 기본값, 범위 밖 숫자는 잘린다', () => {
  const d = defaultOptions('meeting');
  assert.equal(d.tableShape, 'boat');
  assert.equal(d.seats, 12);
  const n = normalizeOptions('meeting', { seats: 9999, tableShape: '이상한값', rug: 'yes' });
  assert.equal(n.seats, 60);              // max로 잘림
  assert.equal(n.tableShape, 'boat');     // 잘못된 선택지는 기본값
  assert.equal(n.rug, true);              // 불리언이 아니면 기본값
  assert.deepEqual(normalizeOptions('meeting', null), d);
});

test('자동 깊이 — 강당일수록 깊고, 타입별 최소 깊이가 보장된다', () => {
  assert.ok(autoDepthForType('hall_l', 12000) > autoDepthForType('meeting', 12000));
  assert.equal(autoDepthForType('meeting', 2000), 4000);       // minDepth
  assert.equal(autoDepthForType('hall_l', 4000), 18000);       // minDepth
  assert.equal(autoDepthForType('meeting', 8000), 6800);       // 8000 × 0.85
});

test('회의실 — 요청 좌석이 테이블 둘레를 넘으면 들어가는 만큼만 놓고 알려준다', () => {
  const W = 8000, D = 6800;
  const few = layoutRoom('meeting', { tableShape: 'boat', seats: 8 }, { W, D });
  assert.equal(few.placed.chairs, 8);
  assert.equal(few.notes.length, 0);
  assert.equal(few.items.filter(i => i.type === 'table').length, 1);
  assertInside(few, W, D, '회의실 8석');

  const many = layoutRoom('meeting', { tableShape: 'boat', seats: 60 }, { W, D });
  assert.ok(many.placed.chairs < 60);
  assert.equal(many.placed.chairs, many.capacity);
  assert.ok(many.notes.length > 0);
  assertInside(many, W, D, '회의실 60석');
});

test('회의실 — 좌석이 테이블 양쪽에 균등하게 나뉘고 서로 마주 본다', () => {
  const res = layoutRoom('meeting', { tableShape: 'rect', seats: 8, rug: false, plant: false }, { W: 8000, D: 6800 });
  const chairs = res.items.filter(i => i.type === 'chair');
  assert.equal(chairs.length, 8);
  const facingLed = chairs.filter(c => c.rotY === 0);      // 뒤쪽 줄 — LED·테이블을 바라본다
  const facingBack = chairs.filter(c => c.rotY === 180);   // LED 쪽 줄 — 돌아앉아 테이블을 본다
  const ends = chairs.filter(c => c.rotY === 90 || c.rotY === 270);   // 양 끝(상석)
  assert.equal(facingLed.length, facingBack.length);       // 긴 변 양쪽은 균등
  assert.equal(facingLed.length + facingBack.length + ends.length, 8);
  assert.equal(ends.length, 2);
  // LED를 바라보는 줄이 LED에서 더 먼 쪽(z가 큼)에 있어야 한다
  assert.ok(facingLed[0].z > facingBack[0].z);
  // 끝자리는 테이블 좌우 바깥에 하나씩
  const table = res.items.find(i => i.type === 'table');
  assert.ok(ends.some(c => c.x > table.x) && ends.some(c => c.x < table.x));
});

test('회의실 — 원형 테이블은 의자가 원을 이루고 모두 중심을 본다', () => {
  const W = 9000, D = 8000;
  const res = layoutRoom('meeting', { tableShape: 'round', seats: 10, rug: false, plant: false }, { W, D });
  const table = res.items.find(i => i.type === 'table');
  assert.equal(table.shape, 'round');
  const chairs = res.items.filter(i => i.type === 'chair');
  assert.equal(chairs.length, 10);
  const r0 = Math.hypot(chairs[0].x - table.x, chairs[0].z - table.z);
  for (const c of chairs) {
    assert.ok(Math.abs(Math.hypot(c.x - table.x, c.z - table.z) - r0) < 1);   // 같은 반지름
  }
  assertInside(res, W, D, '원형');
});

test('회의실 — U자형은 상판 3개로 ㄷ 모양을 이룬다', () => {
  const W = 10000, D = 9000;
  const res = layoutRoom('meeting', { tableShape: 'u', seats: 14, rug: false, plant: false }, { W, D });
  assert.equal(res.items.filter(i => i.type === 'table').length, 3);
  assert.ok(res.items.filter(i => i.type === 'chair').length > 0);
  assertInside(res, W, D, 'U자');
});

test('회의실 — 테이블 없음이면 의자만 줄지어 놓인다', () => {
  const res = layoutRoom('meeting', { tableShape: 'none', seats: 12, plant: false }, { W: 9000, D: 7000 });
  assert.equal(res.items.filter(i => i.type === 'table').length, 0);
  assert.equal(res.items.filter(i => i.type === 'chair').length, 12);
});

test('회의실 — 러그·화분 옵션이 켤 때만 나온다', () => {
  const on = layoutRoom('meeting', { tableShape: 'rect', seats: 6, rug: true, plant: true }, { W: 8000, D: 6800 });
  const off = layoutRoom('meeting', { tableShape: 'rect', seats: 6, rug: false, plant: false }, { W: 8000, D: 6800 });
  assert.equal(on.items.filter(i => i.type === 'rug').length, 1);
  assert.equal(on.items.filter(i => i.type === 'plant').length, 1);
  assert.equal(off.items.filter(i => i.type === 'rug').length, 0);
  assert.equal(off.items.filter(i => i.type === 'plant').length, 0);
});

test('강의실 — 책상마다 의자가 뒤에 붙고, 방이 작으면 줄·열이 줄어든다', () => {
  const W = 10000, D = 11000;
  const res = layoutRoom('classroom', { rows: 4, cols: 4, aisle: true, podium: true }, { W, D });
  assert.equal(res.placed.desks, 16);
  assert.equal(res.items.filter(i => i.type === 'desk').length, 16);
  assert.equal(res.items.filter(i => i.type === 'chair').length, 16);
  assert.equal(res.items.filter(i => i.type === 'podium').length, 1);
  for (const c of res.items.filter(i => i.type === 'chair')) assert.equal(c.rotY, 0);   // 모두 LED를 본다
  assertInside(res, W, D, '강의실');

  const small = layoutRoom('classroom', { rows: 20, cols: 20, aisle: true }, { W: 7000, D: 7000 });
  assert.ok(small.placed.cols < 20 && small.placed.rows < 20);
  assert.ok(small.notes.length > 0);
  assertInside(small, 7000, 7000, '작은 강의실');
});

test('강의실 — 가운데 통로를 켜면 좌우 블록 사이가 벌어진다', () => {
  const room = { W: 12000, D: 11000 };
  const xsOf = aisle => {
    const r = layoutRoom('classroom', { rows: 1, cols: 4, aisle, podium: false }, room);
    return r.items.filter(i => i.type === 'desk').map(i => i.x).sort((a, b) => a - b);
  };
  const withA = xsOf(true), without = xsOf(false);
  assert.equal(withA.length, 4);
  // 가운데(2번째→3번째) 간격만 통로폭만큼 더 벌어진다
  assert.ok((withA[2] - withA[1]) - (without[2] - without[1]) >= FURNITURE.aisleW - 1);
  assert.ok(Math.abs((withA[1] - withA[0]) - (without[1] - without[0])) < 1);
});

test('강당 — 좌석이 줄×열로 놓이고 무대가 LED 벽 앞에 선다', () => {
  const W = 20000, D = 24000;
  const res = layoutRoom('hall_m', { rows: 10, seatsPerRow: 16, aisles: '2', stage: true }, { W, D });
  assert.equal(res.placed.seats, 160);
  const stage = res.items.find(i => i.type === 'stage');
  assert.ok(stage && stage.z < 3000);                       // LED 벽 쪽
  const seats = res.items.filter(i => i.type === 'seat');
  assert.ok(seats.every(s => s.z > stage.z));               // 좌석은 무대 뒤
  assertInside(res, W, D, '중강당');
});

test('강당 — 통로 수에 따라 좌석 블록이 나뉜다', () => {
  const room = { W: 20000, D: 24000 };
  const gaps = aisles => {
    const r = layoutRoom('hall_m', { rows: 1, seatsPerRow: 12, aisles, stage: false }, room);
    const xs = r.items.filter(i => i.type === 'seat').map(i => i.x).sort((a, b) => a - b);
    return xs.slice(1).map((x, i) => Math.round(x - xs[i])).filter(g => g > FURNITURE.seatPitchX + 1);
  };
  assert.equal(gaps('0').length, 0);
  assert.equal(gaps('1').length, 1);
  assert.equal(gaps('2').length, 2);
});

test('강당 — 대강당은 방이 작으면 들어가는 만큼만 놓는다', () => {
  const W = 9000, D = 9000;
  const res = layoutRoom('hall_l', { rows: 30, seatsPerRow: 40, aisles: '2', stage: true }, { W, D });
  assert.ok(res.placed.seats > 0);
  assert.ok(res.placed.rows < 30 && res.placed.perRow < 40);
  assert.ok(res.notes.length > 0);
  assertInside(res, W, D, '대강당(좁음)');
});

test('상황실 — 콘솔마다 의자가 붙고 뒤쪽 회의 테이블이 옵션으로 붙는다', () => {
  const W = 12000, D = 12000;
  const res = layoutRoom('control', { consoleRows: 2, perRow: 4, backTable: true }, { W, D });
  assert.equal(res.placed.consoles, 8);
  assert.equal(res.items.filter(i => i.type === 'console').length, 8);
  assert.equal(res.items.filter(i => i.type === 'table').length, 1);
  assertInside(res, W, D, '상황실');

  const noTable = layoutRoom('control', { consoleRows: 2, perRow: 4, backTable: false }, { W, D });
  assert.equal(noTable.items.filter(i => i.type === 'table').length, 0);
});

test('모든 타입 — 기본 옵션으로 방 안에 정상 배치된다(여러 방 크기)', () => {
  for (const t of ROOM_TYPES) {
    for (const W of [6000, 12000, 25000]) {
      const D = autoDepthForType(t.id, W);
      const res = layoutRoom(t.id, defaultOptions(t.id), { W, D });
      assert.ok(res.items.length > 0, `${t.id} ${W}`);
      assertInside(res, W, D, `${t.label} W=${W}`);
      for (const it of res.items) {
        assert.ok(Number.isFinite(it.x) && Number.isFinite(it.z), `${t.id} ${it.type} 좌표`);
        assert.ok(Number.isFinite(it.rotY), `${t.id} ${it.type} 방향`);
      }
    }
  }
});

// ── 의자 방향 불변조건 ───────────────────────────────────────────────────────
// 이 프로젝트의 규칙: 의자는 '맞닿는 테이블(책상·콘솔)'을 바라봐야 한다.
// 테이블이 없는 자리(강당 관람석 등)는 LED 벽(z=0) 쪽을 바라봐야 한다.
// 아래 도우미는 모든 공간 타입·옵션에서 이 규칙을 기계적으로 검사한다.

const SURFACE = new Set(['table', 'desk', 'console']);
const facingVec = rotY => {                       // rotY=0 → -Z(LED 벽) 방향
  const r = (rotY || 0) * Math.PI / 180;
  return [Math.sin(r), -Math.cos(r)];
};
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 의자 → 테이블 방향(단위벡터)과 '테이블 가장자리까지의 틈'.
//   사각·보트형: 상판 사각형의 가장 가까운 지점 기준
//   원형       : 중심 방향 · 반지름을 뺀 거리 기준(중심까지 거리로 재면 멀어 보인다)
function toSurface(chair, t) {
  const w = t.w || 1200, d = t.d || 1200;
  let dx, dz, gap;
  if (t.shape === 'round') {
    dx = t.x - chair.x; dz = t.z - chair.z;
    gap = Math.max(0, Math.hypot(dx, dz) - w / 2);
  } else {
    const tx = clampN(chair.x, t.x - w / 2, t.x + w / 2);
    const tz = clampN(chair.z, t.z - d / 2, t.z + d / 2);
    dx = tx - chair.x; dz = tz - chair.z;
    gap = Math.hypot(dx, dz);
  }
  const len = Math.hypot(dx, dz) || 1;
  return { ux: dx / len, uz: dz / len, gap };
}

function assertChairsFaceTables(res, label) {
  const surfaces = res.items.filter(i => SURFACE.has(i.type));
  const chairs = res.items.filter(i => i.type === 'chair' || i.type === 'seat');
  assert.ok(chairs.length > 0, `${label}: 의자가 하나도 없음`);
  for (const c of chairs) {
    const [fx, fz] = facingVec(c.rotY);
    // 가장 가까운 테이블(1.5m 이내)을 '맞닿는' 테이블로 본다
    let best = null;
    for (const t of surfaces) {
      const v = toSurface(c, t);
      if (!best || v.gap < best.gap) best = v;
    }
    if (best && best.gap <= 1200) {   // 이 정도면 '맞닿아 앉은' 테이블
      const dot = fx * best.ux + fz * best.uz;
      assert.ok(dot > 0.93,
        `${label}: 의자(${Math.round(c.x)},${Math.round(c.z)}, rotY=${c.rotY})가 맞닿는 테이블을 안 봄 (정렬도 ${dot.toFixed(2)})`);
    } else {
      // 테이블이 없으면 LED 벽(z=0) 쪽을 봐야 한다
      assert.ok(fz < -0.99,
        `${label}: 테이블 없는 의자(${Math.round(c.x)},${Math.round(c.z)}, rotY=${c.rotY})가 LED를 안 봄`);
    }
  }
}

test('의자 방향 — 모든 공간 타입·옵션에서 맞닿는 테이블을 바라본다', () => {
  const cases = [];
  for (const shape of ['boat', 'rect', 'round', 'u', 'none']) {
    for (const seats of [2, 6, 12, 20, 40]) {
      cases.push(['meeting', { tableShape: shape, seats, rug: false, plant: false }, `회의실 ${shape} ${seats}석`]);
    }
  }
  for (const rows of [1, 3, 6]) for (const cols of [1, 4, 8]) {
    cases.push(['classroom', { rows, cols, aisle: rows % 2 === 0, podium: true }, `강의실 ${cols}×${rows}`]);
  }
  for (const t of ['hall_s', 'hall_m', 'hall_l']) {
    for (const aisles of ['0', '1', '2']) cases.push([t, { aisles, stage: true }, `${t} 통로${aisles}`]);
  }
  for (const consoleRows of [1, 2, 4]) for (const backTable of [true, false]) {
    cases.push(['control', { consoleRows, perRow: 3, backTable }, `상황실 ${consoleRows}줄 back=${backTable}`]);
  }
  for (const [type, opts, label] of cases) {
    for (const W of [8000, 12000, 20000]) {
      const D = autoDepthForType(type, W);
      const res = layoutRoom(type, opts, { W, D });
      assertChairsFaceTables(res, `${label} (W=${W})`);
      assertInside(res, W, D, label);
    }
  }
});

test('회의실 원형 — 의자가 모두 테이블 중심을 정확히 바라본다', () => {
  const res = layoutRoom('meeting', { tableShape: 'round', seats: 12, rug: false, plant: false }, { W: 9000, D: 8000 });
  const table = res.items.find(i => i.type === 'table');
  for (const c of res.items.filter(i => i.type === 'chair')) {
    const [fx, fz] = facingVec(c.rotY);
    const dx = table.x - c.x, dz = table.z - c.z, len = Math.hypot(dx, dz);
    assert.ok(fx * (dx / len) + fz * (dz / len) > 0.999, `rotY=${c.rotY} 가 중심을 안 봄`);
  }
});

test('회의실 U자형 — 좌석이 뒤·좌·우에 고르게 나뉜다(한쪽 몰림 없음)', () => {
  const W = 10000, D = 10000;
  const res = layoutRoom('meeting', { tableShape: 'u', seats: 12, rug: false, plant: false }, { W, D });
  const chairs = res.items.filter(i => i.type === 'chair');
  assert.equal(chairs.length, 12);
  const tables = res.items.filter(i => i.type === 'table');
  const back = tables.reduce((a, t) => (t.z > a.z ? t : a));           // 뒤쪽 가로 상판
  const armChairs = chairs.filter(c => c.rotY === 90 || c.rotY === 270);
  const backChairs = chairs.filter(c => c.rotY === 0);
  assert.ok(backChairs.length > 0 && armChairs.length > 0, '뒤·옆 모두 배치되어야 함');
  assert.ok(armChairs.length >= 4, `옆쪽 좌석이 너무 적음 (${armChairs.length}석)`);
  assert.ok(backChairs.every(c => c.z > back.z), '뒤쪽 좌석은 상판 바깥(먼 쪽)에 있어야 함');
  // 좌·우 팔이 균형 있게
  const left = armChairs.filter(c => c.x < W / 2).length, right = armChairs.filter(c => c.x > W / 2).length;
  assert.ok(Math.abs(left - right) <= 1, `좌우 불균형 (좌${left} 우${right})`);
});

test('상황실 — 뒤쪽 회의 테이블 좌석이 테이블을 바라본다(등 돌리지 않음)', () => {
  const res = layoutRoom('control', { consoleRows: 2, perRow: 4, backTable: true }, { W: 12000, D: 12000 });
  const table = res.items.find(i => i.type === 'table');
  const backChairs = res.items.filter(i => i.type === 'chair' && i.z > table.z);
  assert.ok(backChairs.length > 0);
  for (const c of backChairs) assert.equal(c.rotY, 0, '테이블 뒤 좌석은 테이블·LED 쪽(0°)을 봐야 함');
});

test('좌석 분배 — 정원을 넘지 않고 비례로 나뉜다', () => {
  assert.deepEqual(distributeSeats(12, [9, 4, 4]), [6, 3, 3]);
  assert.deepEqual(distributeSeats(100, [9, 4, 4]), [9, 4, 4]);   // 정원까지만
  assert.deepEqual(distributeSeats(0, [9, 4, 4]), [0, 0, 0]);
  assert.deepEqual(distributeSeats(5, [0, 0, 0]), [0, 0, 0]);
  for (const n of [1, 3, 7, 13, 17]) {
    const out = distributeSeats(n, [9, 4, 4]);
    assert.equal(out.reduce((a, b) => a + b, 0), Math.min(n, 17));
    out.forEach((v, i) => assert.ok(v <= [9, 4, 4][i]));
  }
});

test('사람 자리 — LED 옆 빈 곳에 서고 가구와 겹치지 않는다', () => {
  const W = 10000, D = 8500;
  const led = { x: 3000, y: 1000, w: 4000, h: 2200, z: 60 };
  const res = layoutRoom('meeting', { tableShape: 'boat', seats: 12, rug: true, plant: true }, { W, D });
  const spot = personSpot({ W, D }, led, res.items);
  assert.ok(spot.x >= 600 && spot.x <= W - 600, `x=${spot.x}`);
  assert.ok(spot.z >= 600 && spot.z <= D - 600, `z=${spot.z}`);
  // 사람을 막는 가구(테이블·의자 등)와 겹치지 않아야 한다
  const blockers = res.items.filter(i => PERSON_BLOCKING.has(i.type));
  for (const it of blockers) {
    const hw = (it.w || 700) / 2 + 450, hd = (it.d || 700) / 2 + 450;
    assert.ok(!(Math.abs(it.x - spot.x) < hw && Math.abs(it.z - spot.z) < hd),
      `${it.type}(${Math.round(it.x)},${Math.round(it.z)})와 겹침`);
  }
});

test('사람 자리 — 방이 가구로 가득해도 방 안의 좌표를 돌려준다', () => {
  const W = 7000, D = 7000;
  const led = { x: 1500, y: 1000, w: 4000, h: 2200, z: 60 };
  const res = layoutRoom('classroom', { rows: 20, cols: 20, aisle: false, podium: true }, { W, D });
  const spot = personSpot({ W, D }, led, res.items);
  assert.ok(Number.isFinite(spot.x) && Number.isFinite(spot.z));
  assert.ok(spot.x >= 600 && spot.x <= W - 600 && spot.z >= 600 && spot.z <= D - 600);
});

test('사람 자리 — 모든 공간 타입에서 방 안에 선다', () => {
  for (const t of ROOM_TYPES) {
    for (const W of [7000, 14000, 24000]) {
      const D = autoDepthForType(t.id, W);
      const led = { x: W * 0.25, y: 1000, w: W * 0.4, h: 2200, z: 60 };
      const res = layoutRoom(t.id, defaultOptions(t.id), { W, D });
      const spot = personSpot({ W, D }, led, res.items);
      assert.ok(spot.x > 0 && spot.x < W, `${t.id} W=${W}: x=${spot.x}`);
      assert.ok(spot.z > 0 && spot.z < D, `${t.id} W=${W}: z=${spot.z}`);
    }
  }
});

test('사람 자리 — 무대 위에 서지 않는다(바닥에 세우므로 발이 묻힘)', () => {
  const W = 18000, D = autoDepthForType('hall_m', W);
  const led = { x: 7000, y: 1000, w: 4000, h: 2200, z: 60 };
  const res = layoutRoom('hall_m', { ...defaultOptions('hall_m'), stage: true }, { W, D });
  const stage = res.items.find(i => i.type === 'stage');
  const spot = personSpot({ W, D }, led, res.items);
  assert.ok(stage, '무대가 있어야 하는 테스트');
  assert.ok(spot.z > stage.z + (stage.d || 2600) / 2, `사람(z=${spot.z})이 무대(z≤${stage.z + (stage.d||2600)/2}) 밖에 서야 함`);
});

// ── 객석 단차(계단식 좌석) ──────────────────────────────────────────────────

test('강당 단차 — 단 수만큼 나누고 뒤로 갈수록 한 단씩 올라간다', () => {
  const lay = layoutRoom('hall_m',
    { rows: 10, seatsPerRow: 16, aisles: '2', stage: true, tiers: 5, riserH: 250, plant: false },
    { W: 18000, D: 24000 });
  const seats = lay.items.filter(i => i.type === 'seat');
  assert.equal(seats.length, 160);
  // 높이는 0 · 250 · 500 · 750 · 1000 다섯 단계, 각 단에 같은 수만큼
  const byY = {};
  for (const s of seats) byY[s.y || 0] = (byY[s.y || 0] || 0) + 1;
  assert.deepEqual(Object.keys(byY).map(Number).sort((a, b) => a - b), [0, 250, 500, 750, 1000]);
  for (const n of Object.values(byY)) assert.equal(n, 32);
  // 앞줄이 더 낮다 — 뒤로 갈수록 올라가야 시야가 확보된다
  const sorted = [...seats].sort((a, b) => a.z - b.z);
  assert.equal(sorted[0].y, 0);
  assert.equal(sorted[sorted.length - 1].y, 1000);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].y >= sorted[i - 1].y, '뒤로 갈수록 낮아지면 안 된다');
  assert.equal(lay.placed.tiers, 5);
  assert.equal(lay.placed.riserH, 250);
  assert.ok(lay.notes.some(n => n.includes('5단')), '단차를 안내해야 한다');
});

test('강당 단차 — 단(플랫폼)이 좌석 높이와 맞물린다', () => {
  const lay = layoutRoom('hall_s',
    { rows: 6, seatsPerRow: 10, aisles: '1', stage: true, tiers: 3, riserH: 200, plant: false },
    { W: 12000, D: 18000 });
  const risers = lay.items.filter(i => i.type === 'riser');
  // 첫 단은 바닥이므로 플랫폼은 (단 수 − 1)개
  assert.equal(risers.length, 2);
  assert.deepEqual(risers.map(r => r.h), [200, 400]);
  // 뒤쪽 단일수록 앞 끝이 더 뒤에 있다(계단 모양)
  assert.ok(risers[1].z - risers[1].d / 2 > risers[0].z - risers[0].d / 2);
  // 각 단의 좌석은 그 단 높이 위에 앉아 있다
  const seats = lay.items.filter(i => i.type === 'seat');
  for (const h of [0, 200, 400]) {
    assert.ok(seats.some(s => (s.y || 0) === h), `${h}mm 단에 좌석이 없다`);
  }
});

test('강당 단차 — 단 수 1이거나 높이 0이면 기존과 똑같이 평평하다', () => {
  for (const o of [{ tiers: 1, riserH: 300 }, { tiers: 5, riserH: 0 }]) {
    const lay = layoutRoom('hall_s',
      { rows: 6, seatsPerRow: 10, aisles: '1', stage: true, plant: false, ...o },
      { W: 12000, D: 18000 });
    assert.equal(lay.items.filter(i => i.type === 'riser').length, 0, JSON.stringify(o));
    for (const s of lay.items.filter(i => i.type === 'seat')) {
      assert.ok(!s.y, `평평해야 하는데 y=${s.y} (${JSON.stringify(o)})`);
    }
  }
});

test('강당 단차 — 요청한 단 수를 정확히 쓴다(줄이 딱 안 나눠떨어져도)', () => {
  // 5줄 4단처럼 나눠떨어지지 않아도 4단이 나와야 한다.
  //   (줄을 올림으로 나누면 마지막 단이 비어 3단만 생긴다)
  for (const [rows, tiers] of [[5, 4], [7, 3], [12, 5], [7, 7]]) {
    const lay = layoutRoom('hall_m',
      { rows, seatsPerRow: 10, aisles: '1', stage: true, tiers, riserH: 250, plant: false },
      { W: 16000, D: 30000 });
    assert.equal(lay.placed.rows, rows, '이 방에는 요청한 줄이 다 들어가야 한다');
    const levels = [...new Set(lay.items.filter(i => i.type === 'seat').map(i => i.y || 0))];
    assert.equal(levels.length, tiers, `${rows}줄 ${tiers}단 → 실제 ${levels.length}단`);
    // 플랫폼은 (단 수 − 1)개 — 첫 단은 바닥이다
    assert.equal(lay.items.filter(i => i.type === 'riser').length, tiers - 1);
  }
});

test('강당 단차 — 단 수가 줄 수보다 많아도 깨지지 않는다', () => {
  const lay = layoutRoom('hall_s',
    { rows: 3, seatsPerRow: 8, aisles: '1', stage: true, tiers: 20, riserH: 200, plant: false },
    { W: 12000, D: 12000 });
  const seats = lay.items.filter(i => i.type === 'seat');
  assert.ok(seats.length > 0);
  // 줄 수보다 많은 단은 만들 수 없다
  assert.ok(lay.placed.tiers <= lay.placed.rows, `단 ${lay.placed.tiers} > 줄 ${lay.placed.rows}`);
  assert.ok(lay.notes.some(n => n.includes('단은 만들 수 없어')), '줄였다고 알려야 한다');
  for (const s of seats) assert.ok(Number.isFinite(s.y || 0), '높이가 숫자가 아니다');
});

test('강당 단차 — 좌석은 단 위에서도 여전히 LED 벽을 바라본다', () => {
  const lay = layoutRoom('hall_l',
    { rows: 12, seatsPerRow: 20, aisles: '2', stage: true, tiers: 6, riserH: 300, plant: false },
    { W: 30000, D: 40000 });
  for (const s of lay.items.filter(i => i.type === 'seat')) {
    assert.equal(s.rotY % 360, 0, `좌석이 LED 벽을 안 본다 (rotY=${s.rotY})`);
  }
});
