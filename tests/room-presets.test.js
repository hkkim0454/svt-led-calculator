// room-presets.test.js — 공간 타입 프리셋 + 가구 배치 계산 회귀 테스트.
// '방 밖으로 나가지 않는다 / 요청보다 많이 놓지 않는다'가 핵심 규칙이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_TYPES, DEFAULT_ROOM_TYPE, roomType, defaultOptions, normalizeOptions,
  autoDepthForType, layoutRoom, FURNITURE,
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
