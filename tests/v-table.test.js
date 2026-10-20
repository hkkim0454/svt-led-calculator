// 회의실 V자형 테이블(오너 요청 2026-10-20, DEC-181).
//   I형 테이블 두 개가 LED 쪽으로 벌어지고, 꼭짓점 뒤 상석 1석이 화면을 본다. 나머지는 바깥쪽에만 앉는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoom, defaultOptions, roomType, V_TABLE } from '../src/room-presets.js';

const lay = (W, D, o, design = 'corporateMeeting') =>
  layoutRoom('meeting', { ...defaultOptions('meeting'), ...o }, { W, D, ledBottom: 1000, design });
const of = (r, t) => r.items.filter(i => i.type === t);

test('① 테이블 모양에 V자형이 있다', () => {
  const opt = roomType('meeting').options.find(o => o.key === 'tableShape');
  assert.ok(opt.choices.some(c => c.value === 'v' && c.label === 'V자형'));
});

test('② 12석 — 상석 1 + 좌우 바깥쪽 11, 두 I형 테이블이 LED 쪽으로 벌어진다', () => {
  const W = 9000, D = 9000;
  const r = lay(W, D, { tableShape: 'v', seats: 12 });
  const tables = of(r, 'table');
  assert.equal(tables.length, 2);
  assert.deepEqual(tables.map(t => t.rotY).sort(), [90 - V_TABLE.halfAngle, 90 + V_TABLE.halfAngle].sort());
  for (const t of tables) { assert.equal(t.shape, 'rect'); assert.equal(t.d, V_TABLE.tw); }
  // 오른쪽 테이블은 오른쪽, 왼쪽 테이블은 왼쪽에 — 화면 쪽(앞)으로 갈수록 벌어진다.
  const [lt, rt] = [...tables].sort((a, b) => a.x - b.x);
  assert.ok(lt.x < W / 2 && rt.x > W / 2);
  const chairs = of(r, 'chair');
  assert.equal(chairs.length, 12);
  assert.equal(r.placed.chairs, 12);
  // 상석: 가운데 축, 가장 뒤, 화면(-Z)을 본다.
  const head = chairs.filter(c => c.rotY === 0);
  assert.equal(head.length, 1);
  assert.equal(head[0].x, W / 2);
  assert.ok(chairs.every(c => c.z <= head[0].z), '상석이 가장 뒤가 아니다');
  // 나머지는 바깥쪽 — 오른쪽 의자는 왼쪽 아래(테이블)를, 왼쪽 의자는 오른쪽 아래를 본다.
  const right = chairs.filter(c => c.x > W / 2), left = chairs.filter(c => c.x < W / 2);
  assert.equal(right.length + left.length, 11);
  assert.ok(Math.abs(right.length - left.length) <= 1);
  assert.ok(right.every(c => c.rotY === 270 + V_TABLE.halfAngle), `오른쪽 의자 방향 ${right.map(c => c.rotY)}`);
  assert.ok(left.every(c => c.rotY === 90 - V_TABLE.halfAngle), `왼쪽 의자 방향 ${left.map(c => c.rotY)}`);
  // 화면을 등진 자리는 없다.
  assert.equal(chairs.filter(c => c.rotY === 180).length, 0);
});

test('③ V 안쪽은 비어 있다 — 의자는 모두 자기 테이블보다 바깥에 있다', () => {
  const W = 9000, D = 9000;
  const r = lay(W, D, { tableShape: 'v', seats: 14 });
  const [lt, rt] = of(r, 'table').sort((a, b) => a.x - b.x);
  const th = V_TABLE.halfAngle * Math.PI / 180;
  for (const c of of(r, 'chair').filter(c => c.rotY !== 0)) {
    const s = c.x > W / 2 ? 1 : -1, t = s > 0 ? rt : lt;
    const out = [s * Math.cos(th), Math.sin(th)];          // 그 테이블의 바깥쪽 방향
    const side = (c.x - t.x) * out[0] + (c.z - t.z) * out[1];
    assert.ok(side > V_TABLE.tw / 2, `의자(${c.x},${c.z})가 V 안쪽에 있다`);
  }
});

test('④ 모든 가구가 방 안 — 작은 방은 정원까지만 앉히고 알린다', () => {
  for (const [W, D] of [[6000, 5000], [8000, 7000], [12000, 10000]]) {
    const r = lay(W, D, { tableShape: 'v', seats: 60 });
    for (const it of r.items) {
      if (it.type === 'rug') continue;
      assert.ok(it.x > 0 && it.x < W && it.z > 0 && it.z < D, `${W}x${D}: ${it.type}(${it.x},${it.z}) 방 밖`);
    }
    assert.equal(of(r, 'chair').length, r.capacity);
    assert.ok(r.notes.some(t => t.includes('V자형')), `${W}x${D}: 정원 안내가 없다`);
  }
});

test('⑤ 세 회의실 디자인에서 같은 배치, 테이블 방향 옵션은 영향이 없다', () => {
  const base = lay(8000, 7000, { tableShape: 'v', seats: 10 });
  for (const d of ['corporateMeeting', 'executiveBoardroom', 'largeConference']) {
    const a = lay(8000, 7000, { tableShape: 'v', seats: 10 }, d);
    const b = lay(8000, 7000, { tableShape: 'v', seats: 10, tableDir: 'along' }, d);
    assert.deepEqual(of(a, 'table'), of(base, 'table'), d);
    assert.deepEqual(of(b, 'chair'), of(a, 'chair'), d);
  }
});
