// furniture3d.test.js — 가구 입체 도형 회귀 테스트.
// 좌표가 깨지거나(NaN), 바닥을 뚫거나, 방향(rotY)이 반영되지 않는 것을 잡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnitureQuads, footprint, SIZES } from '../src/furniture3d.js';
import { ROOM_TYPES, defaultOptions, layoutRoom, autoDepthForType } from '../src/room-presets.js';

const bounds = quads => {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const q of quads) for (const [x, y, z] of q.pts) {
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
    b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
  }
  return b;
};

test('의자 — 바닥 위에 서고 등받이가 앉은 사람 뒤(+Z)에 온다', () => {
  const q = furnitureQuads([{ type: 'chair', x: 0, z: 0, rotY: 0 }]);
  assert.ok(q.length > 0);
  const b = bounds(q);
  assert.ok(b.y0 >= 0, '바닥을 뚫지 않는다');
  assert.ok(b.y1 > 900 && b.y1 < 1100, `의자 전체 높이 ${b.y1}`);
  const back = q.filter(x => x.kind === 'chairBack');
  assert.ok(bounds(back).z0 > 0, '등받이는 +Z 쪽');
  const seat = q.filter(x => x.kind === 'chairSeat');
  assert.ok(Math.abs(bounds(seat).y0 - SIZES.chair.seatY) < 1e-6);
});

test('의자 — rotY 180이면 등받이가 반대쪽(-Z)으로 간다', () => {
  const q = furnitureQuads([{ type: 'chair', x: 0, z: 0, rotY: 180 }]);
  const back = q.filter(x => x.kind === 'chairBack');
  assert.ok(bounds(back).z1 < 0, '등받이는 -Z 쪽');
});

test('의자 — 놓인 위치(x·z)를 중심으로 만들어진다', () => {
  const q = furnitureQuads([{ type: 'chair', x: 5000, z: 3000, rotY: 0 }]);
  const b = bounds(q);
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 5000) < 60);
  assert.ok(Math.abs((b.z0 + b.z1) / 2 - 3000) < 200);
});

test('테이블 — 모양별 상판이 모두 같은 높이에 오고 크기를 지킨다', () => {
  for (const shape of ['rect', 'boat', 'round']) {
    const q = furnitureQuads([{ type: 'table', shape, x: 0, z: 0, rotY: 0, w: 2400, d: 1200 }]);
    const top = q.filter(x => x.kind === 'tableTop');
    assert.ok(top.length > 0, shape);
    const b = bounds(top);
    assert.ok(Math.abs(b.y0 - SIZES.table.topY) < 1e-6, `${shape} 상판 높이`);
    assert.ok(b.x1 - b.x0 <= 2400 + 1, `${shape} 가로`);
    assert.ok(bounds(q).y0 >= 0, `${shape} 바닥`);
  }
});

test('테이블 — 보트형은 긴 변이 바깥으로 부풀어 사각형보다 깊다', () => {
  const rect = bounds(furnitureQuads([{ type: 'table', shape: 'rect', x: 0, z: 0, w: 2400, d: 1200 }]));
  const boat = bounds(furnitureQuads([{ type: 'table', shape: 'boat', x: 0, z: 0, w: 2400, d: 1200 }]));
  assert.ok(boat.z1 - boat.z0 > rect.z1 - rect.z0);
  assert.ok(Math.abs((boat.x1 - boat.x0) - (rect.x1 - rect.x0)) < 1);   // 가로는 그대로
});

test('원형 테이블 — 상판이 실제로 둥글다(모서리가 지름 안에 들어온다)', () => {
  const q = furnitureQuads([{ type: 'table', shape: 'round', x: 0, z: 0, w: 2000, d: 2000 }]);
  const top = q.filter(x => x.kind === 'tableTop');
  for (const qd of top) for (const [x, , z] of qd.pts) assert.ok(Math.hypot(x, z) <= 1000 + 1e-6);
});

test('책상·콘솔·교탁·무대·러그·화분 — 모두 바닥 위에서 만들어진다', () => {
  const cases = [
    { type: 'desk', x: 0, z: 0, w: 1400, d: 600 },
    { type: 'console', x: 0, z: 0, w: 1800, d: 900 },
    { type: 'podium', x: 0, z: 0 },
    { type: 'stage', x: 0, z: 1300, w: 8000, d: 2600, h: 450 },
    { type: 'rug', x: 0, z: 0, w: 4000, d: 3000 },
    { type: 'plant', x: 0, z: 0 },
    { type: 'seat', x: 0, z: 0 },
  ];
  for (const c of cases) {
    const q = furnitureQuads([{ rotY: 0, ...c }]);
    assert.ok(q.length > 0, c.type);
    const b = bounds(q);
    assert.ok(b.y0 >= -1e-6, `${c.type} 바닥 아래로 내려감 (${b.y0})`);
    assert.ok(b.y1 > 0, `${c.type} 높이 없음`);
    for (const qd of q) for (const p of qd.pts) for (const v of p) assert.ok(Number.isFinite(v), `${c.type} 좌표 NaN`);
  }
});

test('러그·무대는 바닥에 깔리므로 아주 낮다', () => {
  assert.ok(bounds(furnitureQuads([{ type: 'rug', x: 0, z: 0, w: 3000, d: 2000 }])).y1 < 30);
  assert.ok(bounds(furnitureQuads([{ type: 'stage', x: 0, z: 0, w: 5000, d: 2000, h: 450 }])).y1 === 450);
});

test('알 수 없는 물건은 조용히 무시한다', () => {
  assert.equal(furnitureQuads([{ type: '없는가구', x: 0, z: 0 }]).length, 0);
  assert.equal(furnitureQuads(null).length, 0);
});

test('바닥 그림자 면적 — 세워두는 가구만 값이 나온다', () => {
  assert.ok(footprint({ type: 'chair' }).w > 0);
  assert.ok(footprint({ type: 'table', w: 2400, d: 1200 }).w > 0);
  assert.equal(footprint({ type: 'rug' }), null);
  assert.equal(footprint({ type: 'stage' }), null);
});

test('모든 공간 타입의 기본 배치가 실제 도형으로 만들어진다', () => {
  for (const t of ROOM_TYPES) {
    const W = 12000, D = autoDepthForType(t.id, W);
    const res = layoutRoom(t.id, defaultOptions(t.id), { W, D });
    const q = furnitureQuads(res.items);
    assert.ok(q.length > 0, t.id);
    const b = bounds(q);
    assert.ok(b.y0 >= -1e-6, `${t.id} 바닥 관통`);
    assert.ok(b.y1 < 3000, `${t.id} 가구가 비정상적으로 높음 (${b.y1})`);
    for (const qd of q) for (const p of qd.pts) for (const v of p) assert.ok(Number.isFinite(v), `${t.id} 좌표 NaN`);
  }
});
