// 3D 의자 고르기·지우기(오너 요청 2026-10-19) — 그림에서만 빼고 배치는 그대로 둔다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seatKey, isSeatItem, seatLayoutSig, removeSeats, reconcileSeatEdit, removedSeatCount } from '../src/seat-edit.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';
import { normalizeConfig } from '../src/config.js';

const meeting = () => layoutRoom('meeting', defaultOptions('meeting'), { W: 8000, D: 6800, ledBottom: 1000, design: 'corporateMeeting', ledW: 3840 }).items;

test('① 지운 것이 없으면 같은 배열을 그대로 돌려준다(기본 화면 무변화)', () => {
  const items = meeting();
  assert.equal(removeSeats(items, []), items);
  assert.equal(removeSeats(items, new Set()), items);
  assert.equal(removeSeats(items, undefined), items);
});

test('② 고른 의자만 빠지고 테이블·수납장 등은 그대로다', () => {
  const items = meeting();
  const chairs = items.filter(isSeatItem);
  assert.ok(chairs.length >= 4);
  const gone = [seatKey(chairs[0]), seatKey(chairs[1])];
  const out = removeSeats(items, gone);
  assert.equal(out.length, items.length - 2);
  assert.equal(out.filter(isSeatItem).length, chairs.length - 2);
  assert.deepEqual(out.filter(x => !isSeatItem(x)), items.filter(x => !isSeatItem(x)));
  assert.equal(removedSeatCount(items, gone), 2);
});

test('③ 같은 자리의 앉은 사람(seated)도 함께 빠지고, 수는 의자만 센다', () => {
  const items = [
    { type: 'seat', x: 1000, z: 3000 }, { type: 'seated', x: 1000, z: 3000 },
    { type: 'seat', x: 1550, z: 3000 }, { type: 'stage', x: 4000, z: 1000 },
  ];
  const out = removeSeats(items, ['1000:3000']);
  assert.deepEqual(out.map(x => x.type), ['seat', 'stage']);
  assert.equal(removedSeatCount(items, ['1000:3000']), 1);
});

test('④ 배치 지문 — 같은 배치는 같은 값, 좌석 수나 방 크기가 바뀌면 다른 값', () => {
  const a = seatLayoutSig(meeting()), b = seatLayoutSig(meeting());
  assert.equal(a, b);
  const fewer = layoutRoom('meeting', { ...defaultOptions('meeting'), seats: 8 }, { W: 8000, D: 6800, ledBottom: 1000, design: 'corporateMeeting', ledW: 3840 }).items;
  assert.notEqual(seatLayoutSig(fewer), a);
  const wider = layoutRoom('meeting', defaultOptions('meeting'), { W: 9000, D: 6800, ledBottom: 1000, design: 'corporateMeeting', ledW: 3840 }).items;
  assert.notEqual(seatLayoutSig(wider), a);
});

test('⑤ 배치가 바뀌면 지운 기록을 버리고, 같으면 지킨다', () => {
  const items = meeting();
  const k = seatKey(items.find(isSeatItem));
  const sig = seatLayoutSig(items);
  assert.deepEqual(reconcileSeatEdit({ sig, removed: [k] }, items), { sig, removed: [k] });
  assert.deepEqual(reconcileSeatEdit({ sig: 'other', removed: [k] }, items), { sig, removed: [] });
  assert.deepEqual(reconcileSeatEdit(null, items), { sig, removed: [] });
  // 지금 배치에 없는 자리는 버린다
  assert.deepEqual(reconcileSeatEdit({ sig, removed: [k, '1:1'] }, items).removed, [k]);
});

test('⑥ 구성 저장 — 형태가 맞을 때만 되살린다', () => {
  assert.equal(normalizeConfig({}).seatEdit, null);
  assert.deepEqual(normalizeConfig({ seatEdit: { sig: 's', removed: ['1:2', 3] } }).seatEdit, { sig: 's', removed: ['1:2'] });
  assert.equal(normalizeConfig({ seatEdit: { removed: ['1:2'] } }).seatEdit, null);
  assert.equal(normalizeConfig({ seatEdit: 'x' }).seatEdit, null);
});

test('⑦ 화면 배선 — 지우기는 그림 목록에서만, 끌기는 고르기로 치지 않는다', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /seatEdit = reconcileSeatEdit\(seatEdit, lay\.items\);/);
  assert.match(app, /let items = removeSeats\(lay\.items, seatEdit\.removed\)/);
  assert.match(app, /onPick: onSeatPick,/);
  assert.match(app, /seatEdit: \{ sig: seatEdit\.sig, removed: \[\.\.\.seatEdit\.removed\] \},/);
  const gl = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /Math\.hypot\(e\.clientX - d\.x, e\.clientY - d\.y\) > 5/);
  assert.match(gl, /setSelection\(points\)/);
  const fg = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
  assert.match(fg, /im\.userData\.items = list;/);
});
