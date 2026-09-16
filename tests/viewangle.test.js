// viewangle.test.js — 좌석별 LED 시야 판정 회귀 테스트.
// 핵심 규칙: (1) 가짜 스펙을 쓰지 않는다 (2) 기하가 맞다 (3) 좌석 배치를 건드리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEW_RULES, SEATED_EYE_MM, GRADE_COLORS, GRADE_LABELS,
  seatView, gradeView, annotateSeatViews, isOccupied,
} from '../src/viewangle.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';

const LED = { cx: 5000, cy: 2100, w: 4000, h: 2200 };   // 10m 폭 방 한가운데, 하단 1,000 + 높이 2,200

test('시야 계산 — 정중앙 자리는 이탈각이 0에 가깝다', () => {
  const v = seatView({ x: LED.cx, z: 6000, y: 0 }, LED, { seatTopMm: 440 });
  assert.ok(v.offAxisH < 0.01, `수평 이탈 ${v.offAxisH}`);
  // 눈높이(440 + 700 = 1,140)가 화면 중심(2,100)보다 낮으므로 위를 올려다본다.
  assert.equal(Math.round(v.eyeY), 440 + SEATED_EYE_MM);
  assert.ok(v.offAxisV > 5 && v.offAxisV < 15, `수직 이탈 ${v.offAxisV}`);
  assert.ok(v.dist > 6000 && v.dist < 6200, `거리 ${v.dist}`);
});

test('시야 계산 — 옆으로 갈수록 이탈각이 커지고, 멀수록 화면이 작게 보인다', () => {
  const mid = seatView({ x: LED.cx, z: 6000 }, LED);
  const side = seatView({ x: LED.cx + 5000, z: 6000 }, LED);
  assert.ok(side.offAxisH > mid.offAxisH, '옆자리가 더 벗어난다');
  assert.ok(Math.round(side.offAxisH) === 40, `5m 옆 · 6m 뒤 → 약 40° (${side.offAxisH})`);

  const near = seatView({ x: LED.cx, z: 4000 }, LED);
  const far = seatView({ x: LED.cx, z: 16000 }, LED);
  assert.ok(near.subtendH > far.subtendH, '가까울수록 화면이 크게 보인다');
  assert.ok(far.subtendH < VIEW_RULES.subtendWarnDeg, '16m 뒤는 SMPTE 권장(30°)에 못 미친다');
  // 단차가 있으면 눈높이가 올라가 수직 이탈각이 줄어든다(화면을 덜 올려다본다).
  const flat = seatView({ x: LED.cx, z: 12000, y: 0 }, LED);
  const tiered = seatView({ x: LED.cx, z: 12000, y: 900 }, LED);
  assert.ok(tiered.offAxisV < flat.offAxisV, '단 위가 화면을 더 정면으로 본다');
});

test('등급 — 정면·적당한 거리는 양호, 크게 벗어나면 불량', () => {
  const good = gradeView(seatView({ x: LED.cx, z: 7000 }, LED));
  assert.equal(good.grade, 'good', good.reasons.join(','));

  const wayOff = gradeView(seatView({ x: LED.cx + 9000, z: 3000 }, LED));
  assert.equal(wayOff.grade, 'poor');
  assert.ok(wayOff.reasons.some(r => r.includes('벗어남')));

  const tooFar = gradeView(seatView({ x: LED.cx, z: 30000 }, LED));
  assert.equal(tooFar.grade, 'poor');
  assert.ok(tooFar.reasons.some(r => r.includes('작게')));
});

test('등급 — 최적 시청 거리(모델 스펙)가 없으면 거리 판정을 하지 않는다', () => {
  const v = seatView({ x: LED.cx, z: 2600 }, LED);
  const withOvd = gradeView(v, { ovdMm: 4000 });
  const without = gradeView(v, { ovdMm: null });
  assert.ok(withOvd.reasons.some(r => r.includes('최적 시청 거리')), '스펙이 있으면 본다');
  assert.ok(!without.reasons.some(r => r.includes('최적 시청 거리')), '스펙이 없으면 지어내지 않는다');
});

test('꼬리표 — 좌석 좌표를 건드리지 않고 등급만 더한다', () => {
  const room = { W: 14000, D: 18000 };
  const lay = layoutRoom('hall_s', { ...defaultOptions('hall_s'), rows: 6, seatsPerRow: 10 }, room);
  const before = JSON.stringify(lay.items);
  const { items, summary } = annotateSeatViews(lay.items, LED, { ovdMm: 3000 });

  assert.equal(JSON.stringify(lay.items), before, '원본 배열을 바꾸면 안 된다');
  assert.equal(items.length, lay.items.length);
  for (let i = 0; i < items.length; i++) {
    const a = lay.items[i], b = items[i];
    assert.equal(b.x, a.x); assert.equal(b.z, a.z); assert.equal(b.type, a.type);
    assert.equal(b.rotY, a.rotY); assert.equal(b.y ?? 0, a.y ?? 0);
  }
  const seats = items.filter(i => i.type === 'seat');
  assert.equal(summary.total, seats.length);
  assert.equal(summary.good + summary.warn + summary.poor, summary.total);
  for (const s of seats) assert.ok(GRADE_COLORS[s.grade], `등급 없음: ${s.grade}`);
  // 좌석이 아닌 것에는 꼬리표를 달지 않는다.
  for (const it of items.filter(i => i.type !== 'seat')) assert.equal(it.grade, undefined);
  assert.ok(summary.minDist > 0 && summary.maxDist >= summary.minDist);
});

test('꼬리표 — 좌석이 하나도 없어도 무너지지 않는다', () => {
  const { items, summary } = annotateSeatViews([], LED, {});
  assert.deepEqual(items, []);
  assert.equal(summary.total, 0);
  assert.equal(summary.minDist, 0);
  assert.equal(annotateSeatViews(null, LED).summary.total, 0);
});

test('착석 인원 — 착석률대로 고르고, 같은 입력이면 항상 같은 결과', () => {
  for (const pct of [0, 10, 35, 60, 100]) {
    const n = 200, hit = Array.from({ length: n }, (_, i) => isOccupied(i, pct)).filter(Boolean).length;
    assert.ok(Math.abs(hit / n * 100 - pct) <= 3, `${pct}% 요청 → ${hit / n * 100}%`);
  }
  assert.equal(isOccupied(5, 0), false);
  assert.equal(isOccupied(5, 100), true);
  // 두 번 불러도 같아야 한다(새로고침마다 자리가 바뀌면 안 된다).
  const a = Array.from({ length: 50 }, (_, i) => isOccupied(i, 40));
  const b = Array.from({ length: 50 }, (_, i) => isOccupied(i, 40));
  assert.deepEqual(a, b);
  // 앞뒤로 몰리지 않는다 — 앞 절반과 뒤 절반의 착석 수 차이가 크지 않다.
  const half = a.length / 2;
  const front = a.slice(0, half).filter(Boolean).length, back = a.slice(half).filter(Boolean).length;
  assert.ok(Math.abs(front - back) <= 4, `앞 ${front} 뒤 ${back}`);
});

test('강당 착석률 — 좌석 수는 그대로이고 앉은 사람만 늘어난다', () => {
  const room = { W: 14000, D: 16000 };
  const base = { ...defaultOptions('hall_s'), rows: 6, seatsPerRow: 10 };
  const off = layoutRoom('hall_s', { ...base, occupancy: 0 }, room);
  const on = layoutRoom('hall_s', { ...base, occupancy: 60 }, room);
  const n = t => r => r.items.filter(i => i.type === t).length;
  assert.equal(n('seat')(off), n('seat')(on), '좌석 수는 변하지 않는다');
  assert.equal(n('seated')(off), 0);
  assert.ok(Math.abs(n('seated')(on) / n('seat')(on) * 100 - 60) <= 5);
  // 앉은 사람은 좌석과 같은 자리·같은 방향·같은 단 높이에 놓인다.
  for (const p of on.items.filter(i => i.type === 'seated')) {
    const seat = on.items.find(i => i.type === 'seat' && i.x === p.x && i.z === p.z);
    assert.ok(seat, '대응하는 좌석이 없다');
    assert.equal(p.rotY, seat.rotY);
    assert.equal(p.y ?? 0, seat.y ?? 0);
  }
  assert.ok(on.notes.some(t => t.includes('착석')), '착석 인원 안내가 있어야 한다');
});

test('등급 라벨·색이 세 등급 모두 있다', () => {
  for (const g of ['good', 'warn', 'poor']) {
    assert.ok(GRADE_COLORS[g] && /^#[0-9a-f]{6}$/i.test(GRADE_COLORS[g]), g);
    assert.ok(GRADE_LABELS[g], g);
  }
  assert.ok(VIEW_RULES.offAxisWarnDeg < VIEW_RULES.offAxisBadDeg);
  assert.ok(VIEW_RULES.subtendBadDeg < VIEW_RULES.subtendWarnDeg);
});
