// table-direction.test.js — 테이블 방향(가로/세로) 옵션 회귀 테스트. (오너 요청, 2026-09-17)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 옵션이 **회의실 세 디자인(대기업·임원·대회의실)에만** 있다 — 다른 공간은 화면에
//      나오지도, 적용되지도 않는다. 처음에는 대회의실 전용이었고, 대기업·임원은
//      오너 요청(2026-10-19)으로 넓혔다(아래 F 절).
//   ② 기본값(가로)은 **지금까지와 완전히 같다** — 좌표·AV·프롬퍼터까지.
//   ③ 세로 U자는 **앞쪽 날개에 앉히지 않는다**(LED를 등지는 자리를 만들지 않는다).
//   ④ 세로 U자를 도형 판독기가 읽고, 덩어리를 돌려 세운다.
//   ⑤ 좌석 수가 필요한 세로형 공간에는 보트·사각형 세로가 있다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  layoutRoom, defaultOptions, normalizeOptions, roomType, optionsForDesign,
  wantsTableDir, tableDirOf, TABLE_DIR_DESIGNS, rectTableFit, FURNITURE,
} from '../src/room-presets.js';
import { createLargeUTable, uTableBounds, createBoardroomTable, fitsCorporateTable } from '../src/furniture-assets.js';
import { buildGLModel } from '../src/gl-model.js';
import { cameraPlanForDesign } from '../src/design-camera.js';
import { conferenceAVItems } from '../src/conference-av.js';
import { FURNITURE_CONTRACTS } from '../src/furniture-contracts.js';

const LC = 'largeConference';
const CO = 'corporateMeeting';
const EX = 'executiveBoardroom';
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const glSrc = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');

const opt = (over = {}) => ({ ...defaultOptions('meeting'), tableShape: 'u', seats: 40,
  rug: false, plant: false, credenza: false, ...over });
const lay = (W, D, over = {}, design = LC) =>
  layoutRoom('meeting', opt(over), { W, D, ledBottom: 1000, design });
const of = (r, t) => r.items.filter(i => i.type === t);

// ── A. 옵션 — 회의실 세 디자인 전용, 두 가지뿐 ─────────────────────────────

test('① 옵션이 회의실 세 디자인(대기업·임원·대회의실)에만 노출된다', () => {
  assert.deepEqual([...TABLE_DIR_DESIGNS], [CO, EX, LC]);
  for (const d of [CO, EX, LC]) {
    assert.equal(wantsTableDir(d), true, d);
    assert.ok(optionsForDesign('meeting', d).some(o => o.key === 'tableDir'), `${d}에 옵션이 없다`);
  }
  for (const d of ['controlRoom', 'trainingRoom', null, undefined, '없는것']) {
    assert.equal(wantsTableDir(d), false, String(d));
    assert.ok(!optionsForDesign('meeting', d).some(o => o.key === 'tableDir'), String(d));
  }
  // 화면도 이 목록을 그대로 쓴다(직접 roomType(...).options 를 그리지 않는다).
  //   PHASE 4-d.4 부터는 **사용자가 고른 디자인**(designId)을 넘긴다 — 예전에는 언제나
  //   그 용도의 기본 디자인을 넘겨서, 대회의실을 골라도 테이블 방향 칸이 나오지 않았다.
  assert.match(appSrc, /optionsForDesign\(roomTypeId, designId\)/);
  assert.ok(!/optionsForDesign\(roomTypeId, normalizeDesign\(undefined/.test(appSrc),
    '옵션 목록이 아직 기본 디자인에 묶여 있다');
});

test('② 선택지는 가로(기본)·세로 두 가지뿐 — 자동은 없다', () => {
  const o = roomType('meeting').options.find(x => x.key === 'tableDir');
  assert.ok(o);
  assert.equal(o.default, 'across', '기본값이 가로가 아니다');
  assert.deepEqual(o.choices.map(c => c.value), ['across', 'along']);
  assert.ok(!o.choices.some(c => c.value === 'auto'), '자동은 이번 단계에 넣지 않는다');
  // 화면에 띄우는 목록과 실제로 적용하는 목록이 **같은 상수 하나**다(두 곳에 적지 않는다).
  assert.equal(o.designs, TABLE_DIR_DESIGNS);
  // 값이 없거나 이상하면 가로로 떨어진다.
  for (const v of [undefined, null, 'auto', 'x', 0, {}]) {
    assert.equal(normalizeOptions('meeting', { tableDir: v }).tableDir, 'across', String(v));
    assert.equal(tableDirOf({ design: LC, tableDir: v }), 'across', String(v));
  }
  assert.equal(tableDirOf({ design: LC, tableDir: 'along' }), 'along');
});

// ── B. 기본값(가로)은 지금까지와 완전히 같다 ───────────────────────────────

test('③ 가로 = 옵션이 없던 때와 좌표·AV·프롬퍼터가 완전히 같다', () => {
  for (const shape of ['boat', 'rect', 'round', 'none', 'u']) {
    for (const [W, D] of [[8000, 7000], [11000, 9000], [16000, 12000], [10000, 18000]]) {
      for (const seats of [0, 12, 30]) {
        const base = lay(W, D, { tableShape: shape, seats });          // 기본 = 가로
        const across = lay(W, D, { tableShape: shape, seats, tableDir: 'across' });
        assert.deepEqual(across, base, `${shape} ${W}x${D} ${seats}석`);
      }
    }
  }
});

test('④ 디자인이 없는 회의실은 세로를 골라도 **무시한다**', () => {
  // undefined 는 넣지 않는다 — `lay()` 가 그 자리를 대회의실 기본값으로 채운다(null 이 같은 경우를 다룬다).
  for (const design of [null, 'controlRoom', '없는것']) {
    for (const shape of ['boat', 'rect', 'u']) {
      for (const [W, D] of [[8000, 7000], [11000, 9000], [10000, 18000]]) {
        const a = lay(W, D, { tableShape: shape, seats: 14 }, design);
        const b = lay(W, D, { tableShape: shape, seats: 14, tableDir: 'along' }, design);
        assert.deepEqual(b, a, `${String(design)} ${shape} ${W}x${D}`);
      }
    }
  }
  // 임원 U 테이블은 가로(기본)에서 기준 방향(회전 없음)이다. 세로는 F 절이 지킨다.
  const ex = lay(11000, 9000, { seats: 14 }, EX);
  assert.equal(createBoardroomTable(of(ex, 'table')).rotY, 0);
});

// ── C. 세로 U자 ────────────────────────────────────────────────────────────

test('⑤ 세로 U자 — 앞쪽 날개에는 **한 명도 앉지 않는다**', () => {
  for (const [W, D] of [[10000, 15000], [9000, 14000], [10000, 18000], [8000, 16000]]) {
    const r = lay(W, D, { tableDir: 'along' });
    const t = of(r, 'table');
    assert.equal(t.length, 3, '상판은 세 조각이다');
    // 앞쪽 날개 = z 가 가장 작은 조각. 그 바깥(LED 쪽)에는 의자가 없어야 한다.
    const front = t.reduce((a, b) => (b.z < a.z ? b : a));
    const frontOuterZ = front.z - front.d / 2;
    for (const c of of(r, 'chair')) {
      assert.ok(c.z > frontOuterZ, `LED 쪽에 의자가 생겼다 (z=${c.z} ≤ ${frontOuterZ})`);
    }
    // 앉는 곳은 두 곳뿐이다 — 옆(가로 상판 바깥)과 뒤(뒤쪽 날개 바깥).
    const rots = [...new Set(of(r, 'chair').map(c => c.rotY))].sort((a, b) => a - b);
    assert.deepEqual(rots, [0, 270], `좌석 방향이 ${rots.join('/')} 이다`);
  }
});

test('⑥ 세로 U자 — 정원이 두 변의 합이고, 좌석 간격은 그대로다', () => {
  const F = FURNITURE;
  for (const [W, D] of [[10000, 15000], [10000, 18000]]) {
    const r = lay(W, D, { tableDir: 'along' });
    const chairs = of(r, 'chair');
    assert.equal(chairs.length, r.capacity, '정원만큼 앉지 않았다');
    // 같은 줄끼리 간격이 정확히 700mm 다(숫자만 맞추려고 좁히지 않았다).
    const side = chairs.filter(c => c.rotY === 270).map(c => c.z).sort((a, b) => a - b);
    const rear = chairs.filter(c => c.rotY === 0).map(c => c.x).sort((a, b) => a - b);
    for (const row of [side, rear]) {
      for (let i = 1; i < row.length; i++) {
        assert.equal(Math.round(row[i] - row[i - 1]), F.chairPitch, '좌석 간격이 줄었다');
      }
    }
    assert.ok(side.length > 0 && rear.length > 0, '두 변에 고루 앉지 않았다');
  }
});

test('⑦ 세로 U자 — 판독기가 읽고, 덩어리를 돌려 세운다', () => {
  const r = lay(10000, 18000, { tableDir: 'along' });
  const S = createLargeUTable(of(r, 'table'));
  assert.ok(S, '세로 U자를 못 읽는다');
  assert.equal(S.rotY, 270, '돌리는 각도가 기록되지 않았다');
  // 형상 값은 **기준 방향 그대로**다 — 도형을 새로 깎지 않는다.
  assert.equal(S.surfaceY, 740);
  assert.equal(S.topThk, 25);
  assert.equal(S.frontR, 180);
  assert.equal(S.innerR, 120);
  assert.equal(S.segW, 900);
  assert.equal(S.innerW, S.outerW - S.segW * 2);
  assert.equal(S.innerD, S.outerD - S.segW);
  // 가로 배치는 여전히 각도 0 이다.
  assert.equal(createLargeUTable(of(lay(16000, 12000), 'table')).rotY, 0);
  // 어댑터가 그 각도를 실제로 쓴다(다른 가구와 같은 부호 규칙).
  assert.match(glSrc, /function orientUTable\(g, S\) \{\n  if \(S\.rotY\) g\.rotation\.y = -S\.rotY \* DEG;/);
  assert.equal((glSrc.match(/return orientUTable\(g, S\);/g) || []).length, 2, 'U자 두 자산 모두 거쳐야 한다');
});

test('⑧ 세로 U자 — 모니터는 좌석마다, 프롬퍼터는 가운데 축에 선다', () => {
  for (const [W, D] of [[10000, 15000], [10000, 18000]]) {
    const r = lay(W, D, { tableDir: 'along' });
    const chairs = of(r, 'chair'), mons = of(r, 'monitor'), pro = of(r, 'prompter');
    assert.equal(mons.length, chairs.length, '좌석 수와 모니터 수가 다르다');
    assert.equal(pro.length, 1);
    const S = createLargeUTable(of(r, 'table'));
    // 세로에서는 가로 상판이 옆(+X)에 있으므로 프롬퍼터가 그쪽을 바라본다.
    assert.equal(pro[0].rotY, 90, '프롬퍼터가 상석을 안 본다');
    assert.equal(pro[0].z, S.cz, '긴 축 가운데에서 벗어났다');
    assert.equal(pro[0].y, 0, '바닥에 서지 않는다');
    // 모니터는 전부 그 의자를 되바라본다.
    for (const c of chairs) {
      const m = mons.reduce((a, b) =>
        (Math.hypot(b.x - c.x, b.z - c.z) < Math.hypot(a.x - c.x, a.z - c.z) ? b : a));
      assert.equal(m.rotY, (c.rotY + 180) % 360);
    }
  }
});

test('⑨ 세로 U자 — 방 밖으로 나가지 않는다', () => {
  for (const [W, D] of [[10000, 15000], [9000, 14000], [8000, 16000], [10000, 18000]]) {
    const r = lay(W, D, { tableDir: 'along' });
    for (const it of r.items) {
      if (it.type === 'rug') continue;                 // 러그는 가로 배치에서도 방보다 클 수 있다
      const hw = (it.w || 600) / 2, hd = (it.d || 600) / 2;
      assert.ok(it.x - hw > -1 && it.x + hw < W + 1, `${it.type} 이 좌우 벽을 넘었다`);
      assert.ok(it.z - hd > -1 && it.z + hd < D + 1, `${it.type} 이 앞뒤 벽을 넘었다`);
    }
  }
});

// ── D. 보트·사각형 세로 (좌석 효율) ────────────────────────────────────────

test('⑩ 보트·사각형 세로 — 긴 변이 깊이축으로 서고 좌석이 늘어난다', () => {
  for (const shape of ['boat', 'rect']) {
    const a = lay(10000, 18000, { tableShape: shape, seats: 40 });
    const b = lay(10000, 18000, { tableShape: shape, seats: 40, tableDir: 'along' });
    assert.ok(b.capacity > a.capacity, `${shape}: 세로가 더 많이 앉아야 한다 (${a.capacity} → ${b.capacity})`);
    const t = of(b, 'table')[0];
    assert.equal(t.rotY, 90, '테이블을 세우지 않았다');
    assert.ok(t.w > t.d, '긴 변이 w 여야 도형(보트 불룩함·다리)이 맞는다');
    // 좌석은 좌우(±X)에 늘어서고, 양 끝은 앞뒤(±Z)에 앉는다.
    const sides = of(b, 'chair').filter(c => c.rotY === 90 || c.rotY === 270);
    assert.ok(sides.length >= 2, '긴 변 좌석이 없다');
  }
});

test('⑪ 크기·정원 셈법은 가로·세로가 **같은 함수**를 쓴다', () => {
  const a = rectTableFit(9000, 6000, 20), b = rectTableFit(9000, 6000, 20);
  assert.deepEqual(a, b);
  assert.ok(a.tLong >= 1600 && a.tShort >= 900);
  // 정원은 **이 방에 들어가는 최대 테이블** 기준이고, 실제 테이블은 앉을 사람 수에 맞춰 줄인다.
  //   그래서 `perSide`(실제)는 정원보다 작을 수 있지만, 앉힐 사람은 모두 앉을 수 있어야 한다.
  assert.ok(a.n <= a.capacity, '정원보다 많이 앉힌다');
  assert.ok(a.perSide * 2 + a.ends >= a.n, `실제 테이블에 ${a.n}명이 안 앉는다`);
  assert.equal(rectTableFit(9000, 6000, 999).n, a.capacity, '정원을 넘겨 요청하면 정원까지만 앉는다');
  // 긴 쪽·짧은 쪽을 바꾸면 결과도 바뀐다(축을 실제로 쓰고 있다).
  assert.notDeepEqual(rectTableFit(9000, 6000, 40), rectTableFit(6000, 9000, 40));
});

// ── E. 다른 방 무변경 ──────────────────────────────────────────────────────

test('⑫ 회의실 말고 다른 용도는 옵션이 있든 없든 그대로다', () => {
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'control', 'ideation']) {
    const a = layoutRoom(t, defaultOptions(t), { W: 14000, D: 16000, ledBottom: 1000 });
    const b = layoutRoom(t, { ...defaultOptions(t), tableDir: 'along' },
      { W: 14000, D: 16000, ledBottom: 1000, design: LC });
    assert.deepEqual(b.items, a.items, `${t}: 배치가 달라졌다`);
  }
});

test('⑬ 기준 수치 고정 — 10 × 18m 보트형 가로·세로', () => {
  // 셈법(rectTableFit)의 상한·간격을 건드리면 여기가 먼저 깨진다.
  assert.deepEqual(rectTableFit(15400, 8400, 40),
    { tLong: 8900, tShort: 1500, perSide: 12, ends: 2, capacity: 26, n: 26 });
  const across = lay(10000, 18000, { tableShape: 'boat', seats: 40 });
  const along = lay(10000, 18000, { tableShape: 'boat', seats: 40, tableDir: 'along' });
  assert.equal(across.capacity, 20);
  // 세로는 화면 쪽 끝 자리를 비운다(DEC-181) — 정원이 26 → 25 로 한 자리 준다.
  assert.equal(along.capacity, 25);
  const ta = of(across, 'table')[0], tl = of(along, 'table')[0];
  assert.equal(`${ta.w}x${ta.d}`, '6800x1500');
  assert.equal(ta.rotY, 0);
  assert.equal(`${tl.w}x${tl.d}`, '8900x1500');
  assert.equal(tl.rotY, 90);
});

test('⑭ 기준 수치 고정 — 10 × 18m 세로 U자', () => {
  const r = lay(10000, 18000, { tableDir: 'along' });
  const S = createLargeUTable(of(r, 'table'));
  assert.equal(r.capacity, 23);
  assert.equal(of(r, 'chair').length, 23);
  assert.equal(of(r, 'monitor').length, 23);
  assert.equal(S.outerW, 12000);       // 긴 변(깊이축)
  assert.equal(S.outerD, 6500);        // 짧은 변(가로축)
  assert.equal(S.cx, 5300);
  assert.equal(S.cz, 7800);
  assert.equal(S.supports.length, 11);
  assert.equal(of(r, 'prompter')[0].x, 6450);
  // 판독기가 돌려 읽어도 최소 크기 규칙은 그대로다.
  assert.equal(uTableBounds(of(r, 'table'), 99000, 99000), null);
  assert.equal(FURNITURE_CONTRACTS.largeUTable.dimensions.minWidth, 5000);
});

// ── F. 대기업·임원 회의실로 넓힘 (오너 요청, 2026-10-19) ─────────────────────
// LED를 상석 정면 벽에 거는 방을 그리려고 넓혔다. 이 도구는 LED가 언제나 '앞벽'에 붙으므로,
//   그런 방은 앞벽을 바꿔 입력하고(가로 W ↔ 깊이 D) 테이블을 세로로 세우면 된다.
//   기본값(가로)은 넓히기 전과 **한 자리도 다르지 않아야 한다** — 동결된 컷이 그 위에 서 있다.

test('⑮ 대기업·임원 가로(기본)는 넓히기 전과 한 자리도 다르지 않다', () => {
  // 넓히기 전에는 두 디자인이 세로 값을 무시했다 = 디자인 없는 회의실과 같은 배치였다.
  for (const design of [CO, EX]) {
    for (const shape of ['boat', 'rect', 'round', 'none', 'u']) {
      for (const [W, D] of [[8000, 6800], [10000, 10000], [12000, 10000], [10000, 18000]]) {
        for (const seats of [0, 12, 20]) {
          const before = lay(W, D, { tableShape: shape, seats }, null);
          const base = lay(W, D, { tableShape: shape, seats }, design);
          const across = lay(W, D, { tableShape: shape, seats, tableDir: 'across' }, design);
          assert.deepEqual(base, before, `${design} ${shape} ${W}x${D} ${seats}석: 기본값이 달라졌다`);
          assert.deepEqual(across, before, `${design} ${shape} ${W}x${D} ${seats}석: 가로가 달라졌다`);
        }
      }
    }
  }
});

test('⑯ 대기업 보트·사각형 세로 — 끝자리 상석 한 자리가 LED를 정면으로 본다', () => {
  // 오너 사례: 앞벽 8m 회의실의 오른쪽 벽(6.8m)에 LED를 건다 → W 6.8 · D 8 로 입력한다.
  for (const shape of ['boat', 'rect']) {
    const r = lay(6800, 8000, { tableShape: shape, seats: 12, tableDir: 'along' }, CO);
    const [t] = of(r, 'table');
    assert.equal(t.rotY, 90, `${shape}: 테이블을 세우지 않았다`);
    assert.equal(`${t.w}x${t.d}`, '4000x1500', shape);
    // 대기업 전용 테이블 자산이 그대로 맡는다(세웠다고 기존 테이블로 떨어지지 않는다).
    assert.equal(fitsCorporateTable(t), true, shape);
    const chairs = of(r, 'chair');
    // 화면 쪽 끝 자리를 비우므로(DEC-181) 이 방에는 11석까지 들어가고, 넘친 1석은 안내한다.
    assert.equal(chairs.length, 11, shape);
    assert.ok(r.notes.some(t => t.includes('11석까지')), `${shape}: 정원 안내가 없다`);
    // 화면을 등진 자리(rotY 180 = +Z 를 바라봄)는 하나도 없다.
    assert.equal(chairs.filter(c => c.rotY === 180).length, 0, `${shape}: 화면을 등진 끝자리가 남았다`);
    // rotY 0 = LED 벽(-Z)을 바라본다. 그런 자리는 LED 반대쪽 끝 한 자리뿐이다.
    const head = chairs.filter(c => c.rotY === 0);
    assert.equal(head.length, 1, `${shape}: LED 정면 상석이 ${head.length}자리다`);
    assert.equal(head[0].x, 3400, '상석이 방 가운데 축에서 벗어났다');
    assert.equal(head[0].z, 7150, '상석이 테이블 먼 끝에 있지 않다');
    // 개인 모니터·프롬프터는 여전히 대회의실에만 놓인다.
    assert.equal(of(r, 'monitor').length + of(r, 'prompter').length, 0, `${shape}: 대회의실 AV가 샜다`);
  }
});

test('⑰ 임원 U자 세로 — 일체형 상판을 돌려 세우고 앞쪽 날개는 비운다', () => {
  for (const [W, D] of [[8000, 10000], [6800, 8000], [10000, 15000]]) {
    const r = lay(W, D, { tableShape: 'u', seats: 12, tableDir: 'along' }, EX);
    const t = of(r, 'table');
    const S = createBoardroomTable(t);
    assert.ok(S, `${W}x${D}: 임원 U 테이블이 세로 U자를 못 읽는다`);
    assert.equal(S.rotY, 270, `${W}x${D}: 돌리는 각도가 기록되지 않았다`);
    // 앞쪽 날개(LED 쪽) 바깥에는 아무도 앉지 않는다 — LED를 등지는 자리를 만들지 않는다.
    const front = t.reduce((a, b) => (b.z < a.z ? b : a));
    for (const c of of(r, 'chair')) assert.ok(c.z > front.z - front.d / 2, `${W}x${D}: LED 쪽에 의자가 생겼다`);
    // 뒤쪽 날개 좌석은 LED를 정면으로 본다.
    assert.ok(of(r, 'chair').some(c => c.rotY === 0), `${W}x${D}: LED 정면 좌석이 없다`);
    assert.equal(of(r, 'monitor').length + of(r, 'prompter').length, 0, `${W}x${D}: 대회의실 AV가 샜다`);
    // 방 밖으로 나가지 않는다(러그는 가로 배치에서도 방보다 클 수 있다).
    for (const it of r.items) {
      if (it.type === 'rug') continue;
      const hw = (it.w || 600) / 2, hd = (it.d || 600) / 2;
      assert.ok(it.x - hw > -1 && it.x + hw < W + 1, `${W}x${D}: ${it.type} 이 좌우 벽을 넘었다`);
      assert.ok(it.z - hd > -1 && it.z + hd < D + 1, `${W}x${D}: ${it.type} 이 앞뒤 벽을 넘었다`);
    }
  }
});

test('⑱ 대기업·임원 카메라는 테이블 방향과 상관없이 같은 자리에 선다', () => {
  // 두 디자인의 카메라는 방·LED 치수만 본다. 세로를 골라도 시점이 흔들리지 않는다.
  const modelOf = (design, shape, dir) => buildGLModel({
    space: { W: 6800, H: 3400, D: 8000 },
    led: { w: 3840, h: 2160, marginW: (6800 - 3840) / 2, mount: 911, cols: 4, rows: 4, depth: 79.5 },
    items: lay(6800, 8000, { tableShape: shape, seats: 12, tableDir: dir }, design).items,
    design, roomType: 'meeting',
  });
  for (const [design, shape] of [[CO, 'boat'], [EX, 'u']]) {
    for (const pre of ['interior', 'corner-l', 'corner-r']) {
      const a = cameraPlanForDesign(design, pre, modelOf(design, shape, 'across'));
      const b = cameraPlanForDesign(design, pre, modelOf(design, shape, 'along'));
      assert.ok(a && b, `${design} ${pre}: 카메라가 없다`);
      assert.deepEqual([b.position, b.target, b.fov], [a.position, a.target, a.fov], `${design} ${pre}`);
      assert.equal(b.ledFullyVisible, true, `${design} ${pre}: LED가 화면에서 잘린다`);
    }
  }
});
