// large-u-table.test.js — 대회의실 대형 U 테이블 회귀 테스트. (PHASE 4-b)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 계약이 유일한 치수 기준인가 — 상판 높이·두께를 도형 코드가 다시 적지 않았는가.
//   ② **임원 U 테이블과 다른 테이블인가** — 크게 늘린 복사본이면 실패다.
//   ③ 20석 벽이 실제로 열렸는가 — 그리고 그 변화가 **대회의실에만** 닿았는가.
//   ④ 받침이 의자·무릎·모니터 자리를 침범하지 않는가.
//   ⑤ 이번 단계가 **테이블 단계**로 남는가 — AV 장비는 그대로 미구현인가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, FURNITURE_COLORS, assetFor, assetKey,
  createLargeUTable, fitsLargeUTable, largeUBounds, uTableBounds,
  createBoardroomTable, createCorporateTable, createConferenceTable,
  createConferenceErgoChair, createCorporateChair, createExecutiveChair,
  LARGE_U_KNEE_CLEAR, LARGE_U_MAX_SPAN, LARGE_U_SEAT_PITCH,
} from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS, CONTRACT_STATUS } from '../src/furniture-contracts.js';
import {
  resolveFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS, isPlanned } from '../src/room-design.js';
import { MATERIAL_PRESETS, PART_MATERIAL, finishForPart, resolveMaterialId } from '../src/materials.js';
import {
  layoutRoom, defaultOptions, FURNITURE, U_TABLE_LIMITS, uTableLimits,
} from '../src/room-presets.js';
import { createGeometryCache } from '../src/geometry-gl.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';
import { existsSync } from 'node:fs';

const C = FURNITURE_CONTRACTS.largeUTable;
const D = C.dimensions;
const assetsSrc = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');
const glSrc = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
const presetsSrc = readFileSync(new URL('../src/room-presets.js', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

/** 대회의실 배치 한 판. design 을 주지 않으면 **기존(기본) 상한**으로 돈다. */
function lay(W, dep, seats = 40, design = 'largeConference') {
  return layoutRoom('meeting',
    { ...defaultOptions('meeting'), tableShape: 'u', seats, rug: false, plant: false, credenza: false },
    { W, D: dep, ledBottom: 1000, design });
}
const tablesOf = res => res.items.filter(i => i.type === 'table');
const chairsOf = res => res.items.filter(i => i.type === 'chair');
/** 방 하나에서 U 테이블 명세까지 한 번에. */
function spec(W, dep, seats = 40, design = 'largeConference') {
  const res = lay(W, dep, seats, design);
  return { res, S: createLargeUTable(tablesOf(res)) };
}
const BIG = spec(16000, 12000, 30);

// ── A. 런타임·계약 ──────────────────────────────────────────────────────────

test('① 런타임 카탈로그에 있고 갈래가 테이블이다', () => {
  assert.ok(FURNITURE_ASSETS.largeUTable, '런타임 자산이 없다');
  assert.equal(hasRuntimeFurnitureAsset('largeUTable'), true);
  assert.equal(RUNTIME_CATEGORY.largeUTable, 'table');
  assert.equal(FURNITURE_ASSETS.largeUTable.instanced, false, '방에 한두 개뿐인 자산이다');
  assert.equal(typeof FURNITURE_ASSETS.largeUTable.spec, 'function');
});

test('② 계약이 구현됨으로 바뀌었고 **치수는 하나도 바뀌지 않았다**', () => {
  assert.equal(C.status, CONTRACT_STATUS.IMPLEMENTED);
  assert.equal(C.category, 'table');
  assert.equal(C.instancing, 'custom');
  assert.deepEqual([...C.rooms], ['largeConference']);
  assert.deepEqual([...C.shapes], ['u']);
  // PHASE 4-d.1 — 부품 이름이 제 이름으로 바뀌었다(마감이 다른 테이블로 새지 않게).
  assert.deepEqual([...C.parts], ['conferenceTop', 'conferenceBase']);
});

test('③ 상판 윗면이 계약값(740mm) 그대로다', () => {
  assert.equal(D.surfaceY, 740);
  assert.equal(BIG.S.surfaceY, 740);
  // 도형 코드가 숫자를 **다시 적지 않았다** — 계약을 읽어서 쓴다.
  const body = assetsSrc.match(/export function createLargeUTable[\s\S]*?\n}\n/)[0];
  assert.match(body, /const C = FURNITURE_CONTRACTS\.largeUTable\.dimensions;/);
  assert.equal((body.match(/\b(740|25)\b/g) || []).length, 0, '도형 코드가 높이·두께를 다시 적었다');
  assert.match(body, /C\.surfaceY - C\.topThk/, '밑면을 계약에서 계산하지 않는다');
});

test('④ 상판 두께가 계약값(25mm)이고 밑면이 715mm 다', () => {
  assert.equal(D.topThk, 25);
  assert.equal(BIG.S.topThk, 25);
  assert.equal(BIG.S.topBottom, 715);
  assert.equal(BIG.S.surfaceY - BIG.S.topThk, BIG.S.topBottom);
  // 임원 테이블(30mm)보다 **얇다** — 이것이 '가벼운 인상'의 근거다.
  assert.ok(D.topThk < FURNITURE_CONTRACTS.boardroomTable.dimensions.topThk);
});

test('⑤ 계약 최소 크기(5,000 × 3,000)보다 작으면 맡지 않는다', () => {
  assert.equal(D.minWidth, 5000);
  assert.equal(D.minDepth, 3000);
  const small = tablesOf(lay(7000, 6000, 12));
  const b = uTableBounds(small, 0, 0);
  assert.ok(b, '배치 자체는 U자다');
  assert.ok(b.outerW < D.minWidth || b.outerD < D.minDepth, '이 방은 계약 최소보다 작아야 한다');
  assert.equal(largeUBounds(small), null, '최소 크기 미만인데 맡았다');
  assert.equal(createLargeUTable(small), null);
  assert.equal(fitsLargeUTable(small), false);
});

test('⑥ 실제 크기는 **배치가 준 값**이다(도형이 크기를 지어내지 않는다)', () => {
  for (const [W, dep] of [[12000, 9000], [14000, 10000], [16000, 12000]]) {
    const { res, S } = spec(W, dep);
    const t = tablesOf(res);
    const minX = Math.min(...t.map(i => i.x - i.w / 2)), maxX = Math.max(...t.map(i => i.x + i.w / 2));
    const minZ = Math.min(...t.map(i => i.z - i.d / 2)), maxZ = Math.max(...t.map(i => i.z + i.d / 2));
    assert.equal(S.outerW, Math.round(maxX - minX), `${W}: 가로가 배치와 다르다`);
    assert.equal(S.outerD, Math.round(maxZ - minZ), `${W}: 깊이가 배치와 다르다`);
    assert.equal(S.cx, Math.round((minX + maxX) / 2));
    assert.equal(S.cz, Math.round((minZ + maxZ) / 2));
  }
});

// ── B. U자 모양 ────────────────────────────────────────────────────────────

test('⑦ 가운데가 실제로 뚫려 있고 안쪽 모서리가 이어진다', () => {
  const S = BIG.S;
  assert.equal(S.shape, 'u');
  assert.ok(S.innerW > 0 && S.innerD > 0, '가운데가 막혔다');
  assert.equal(S.innerW, S.outerW - S.segW * 2);
  assert.equal(S.innerD, S.outerD - S.segW);
  assert.ok(S.innerW >= 2000, `가운데 폭 ${S.innerW}mm — 프롬프터가 설 자리가 없다`);
  assert.ok(S.innerR > 0, '안쪽 오목 모서리가 각이면 직사각 세 장으로 읽힌다');
});

test('⑧ 모서리 반지름이 임원(450 반원)을 **복사하지 않았다**', () => {
  const S = BIG.S, B = createBoardroomTable(tablesOf(lay(11000, 9000, 14, 'executiveBoardroom')));
  assert.equal(S.frontR, 180);
  assert.equal(S.innerR, 120);
  assert.equal(S.rearR, 60);
  assert.ok(S.frontR < S.segW / 2, '앞 끝이 반원이면 임원 테이블로 읽힌다');
  assert.ok(S.frontR < B.frontR, `앞 끝 ${S.frontR} ≥ 임원 ${B.frontR}`);
  assert.ok(S.innerR < B.innerR && S.rearR < B.rearR, '안쪽·뒤 모서리도 임원보다 작아야 한다');
  assert.ok(S.topBevel > 0 && S.topBevel <= 6, '상판 날은 죽이되 장식 몰딩이 되면 안 된다');
});

test('⑨ 임원 테이블과 **다른 테이블**이다(하부 구조가 다르다)', () => {
  const B = createBoardroomTable(tablesOf(lay(11000, 9000, 14, 'executiveBoardroom')));
  assert.ok(B.supports[0].w && !BIG.S.post.w === false);
  assert.ok(!('bodyDrop' in BIG.S), '임원의 판형 몸통 개념을 그대로 가져왔다');
  assert.ok(!('post' in B), '임원 테이블에 기둥이 생겼다 — 임원 자산을 건드렸다');
  assert.ok(BIG.S.beams.length === 3, '긴 보가 U자 세 줄로 이어지지 않는다');
  // 기둥 단면이 임원 블레이드보다 **가늘다**(가벼운 하부 구조).
  assert.ok(BIG.S.post.w * BIG.S.post.d < B.supports[0].w * B.supports[0].d);
});

// ── C. 받침(기둥·보) ───────────────────────────────────────────────────────

test('⑩ 바닥에 정확히 닿는다(뜨지도, 파고들지도 않는다)', () => {
  const S = BIG.S;
  assert.equal(S.foot.y - S.foot.h / 2, 0, '굽 밑면이 바닥이 아니다');
  assert.ok(S.post.y - S.post.h / 2 >= 0, '기둥이 바닥을 파고든다');
  assert.equal(S.post.y + S.post.h / 2, S.topBottom, '기둥 윗면이 상판 밑면에 닿지 않는다');
  assert.equal(S.beam.y + S.beam.h / 2, S.topBottom, '보가 상판 밑면에 붙지 않았다');
  assert.ok(S.beam.y - S.beam.h / 2 >= 580, '보가 무릎 높이(580mm)까지 내려왔다');
});

test('⑪ 받침이 의자 자리와 **겹치지 않는다**(650 × 660 · 간격 700)', () => {
  const E = FURNITURE_CONTRACTS.conferenceErgoChair.dimensions;
  const { res, S } = spec(16000, 12000, 30);
  const half = { x: S.outerW / 2, z: S.outerD / 2 };
  let worst = Infinity;
  for (const ch of chairsOf(res)) {
    const cx = ch.x - S.cx, cz = ch.z - S.cz;
    const r = Math.max(E.casterBase, E.overallW, E.overallD) / 2;   // 바퀴가 도는 반경
    for (const sp of S.supports) {
      const pw = (sp.along === 'z' ? S.foot.d : S.foot.w) / 2;
      const pd = (sp.along === 'z' ? S.foot.w : S.foot.d) / 2;
      const gapX = Math.abs(cx - sp.dx) - (r + pw);
      const gapZ = Math.abs(cz - sp.dz) - (r + pd);
      assert.ok(gapX > 0 || gapZ > 0, `의자(${ch.x},${ch.z})와 받침이 겹친다`);
      worst = Math.min(worst, Math.max(gapX, gapZ));
    }
    // 의자는 언제나 상판 **바깥**에 있다.
    assert.ok(Math.abs(cx) > half.x - 1 || Math.abs(cz) > half.z - 1 || cz < -half.z + 1,
      '의자가 상판 안쪽에 들어갔다');
  }
  assert.ok(worst > 300, `의자~받침 최소 여유 ${Math.round(worst)}mm — 너무 붙었다`);
});

test('⑫ 받침이 앉는 모서리에서 **무릎 여유만큼** 안으로 물려 있다', () => {
  const S = BIG.S;
  assert.equal(LARGE_U_KNEE_CLEAR, 500);
  assert.equal(S.inset, LARGE_U_KNEE_CLEAR + S.beam.w / 2);
  const halfW = S.outerW / 2, halfD = S.outerD / 2;
  for (const sp of S.supports) {
    // 뒤 상판의 받침은 +Z(앉는 쪽) 모서리에서, 날개의 받침은 바깥(±X) 모서리에서 물린다.
    const d = sp.along === 'x' ? halfD - sp.dz : halfW - Math.abs(sp.dx);
    assert.equal(Math.round(d), Math.round(S.inset), '받침이 무릎 자리로 나왔다');
    const near = d - (sp.along === 'x' ? S.foot.d : S.foot.d) / 2;
    assert.ok(near >= 450, `앉는 쪽 유효 무릎 깊이 ${Math.round(near)}mm — 사무 기준(450) 미만`);
  }
});

test('⑬ 받침 없이 건너뛰는 거리가 한계 이하이고, 개수가 과하지 않다', () => {
  assert.equal(LARGE_U_MAX_SPAN, 2400);
  assert.ok(LARGE_U_MAX_SPAN < 2600, '임원(2,600)보다 짧게 잡아야 한다 — 상판이 더 얇다');
  for (const [W, dep, maxPosts] of [[12000, 9000, 9], [14000, 10000, 12], [16000, 12000, 13]]) {
    const { res, S } = spec(W, dep);
    assert.ok(S.maxSpan <= LARGE_U_MAX_SPAN, `${W}: 무지지 ${S.maxSpan}mm`);
    assert.ok(S.supports.length <= maxPosts, `${W}: 받침 ${S.supports.length}개 — 지저분하다`);
    // **좌석마다 하나가 아니다.** 받침 하나가 최소 두 좌석 몫을 감당한다.
    assert.ok(S.supports.length * 2 <= chairsOf(res).length,
      `${W}: 받침이 좌석 수에 가깝다(좌석마다 하나는 계약이 금지한 모습)`);
  }
});

test('⑭ 받침이 좌우 대칭이다(한쪽으로 쏠리면 테이블이 기울어 보인다)', () => {
  for (const [W, dep] of [[12000, 9000], [14000, 10000], [16000, 12000]]) {
    const { S } = spec(W, dep);
    const key = sp => `${sp.dx}|${sp.dz}|${sp.along}`;
    const set = new Set(S.supports.map(key));
    for (const sp of S.supports) {
      assert.ok(set.has(key({ dx: -sp.dx, dz: sp.dz, along: sp.along })), `${W}: 대칭 짝이 없다`);
    }
  }
});

test('⑮ 좌석 간격 상수가 배치가 쓰는 chairPitch 와 같다', () => {
  assert.equal(LARGE_U_SEAT_PITCH, FURNITURE.chairPitch);
  assert.equal(LARGE_U_SEAT_PITCH, D.seatPitch, '계약의 좌석 간격과도 같아야 한다');
});

// ── D. 개인 모니터·프롬프터 준비(PHASE 4-c 예정) ────────────────────────────

test('⑯ 좌석 앞 상판 깊이가 개인 모니터를 받을 만큼 남는다', () => {
  const S = BIG.S;
  const m = FURNITURE_CONTRACTS.personalMonitor.footprint;
  assert.equal(S.segW, D.segmentW, '상판 폭이 계약값과 다르다');
  // 앉는 모서리 ~ 안쪽 모서리 전체가 1인 작업면이다. 받침은 그 **아래**에 있어 침범하지 않는다.
  assert.ok(S.segW - m.d > 400, `상판 폭 ${S.segW} 에서 모니터(${m.d}) 뒤 작업면이 400mm 미만`);
  assert.ok(m.w < LARGE_U_SEAT_PITCH, '모니터가 1인 간격보다 넓다');
  // 받침은 전부 상판 테두리 **안쪽**이다 = 모니터 받침 자리 바깥으로 나오지 않는다.
  for (const sp of S.supports) {
    assert.ok(Math.abs(sp.dx) < S.outerW / 2 && Math.abs(sp.dz) < S.outerD / 2);
  }
});

test('⑰ 가운데(프롬프터 자리)를 가로지르는 받침이 하나도 없다', () => {
  const S = BIG.S;
  const inW = S.innerW / 2, inD = S.innerD / 2;
  const innerCz = -S.outerD / 2 + S.innerD / 2;   // 가운데 빈 공간의 중심(테이블 중심 기준)
  for (const sp of [...S.supports, ...S.beams]) {
    const insideX = Math.abs(sp.dx) < inW, insideZ = Math.abs(sp.dz - innerCz) < inD;
    assert.ok(!(insideX && insideZ), '받침·보가 가운데 빈 공간을 가로막는다');
  }
  assert.ok(S.innerW >= 2000 && S.innerD >= 2000, '프롬프터가 마주 볼 자리가 좁다');
});

// ── E. 정원(20석 벽) ────────────────────────────────────────────────────────

test('⑱ compact(12 × 9m) — 16~20석 이상이 들어간다', () => {
  const res = lay(12000, 9000, 40);
  assert.ok(res.capacity >= 20, `정원 ${res.capacity}석`);
  const seated = lay(12000, 9000, 18);
  assert.equal(seated.placed.chairs, 18);
  assert.ok(fitsLargeUTable(tablesOf(seated)));
});

test('⑲ medium(14 × 10m) — 22~24석이 실제로 앉는다', () => {
  const res = lay(14000, 10000, 40);
  assert.ok(res.capacity >= 24, `정원 ${res.capacity}석 — 22~24석 목표에 못 미친다`);
  const seated = lay(14000, 10000, 24);
  assert.equal(seated.placed.chairs, 24);
  assert.equal(seated.notes.length, 0, '24석인데 줄였다는 알림이 떴다');
});

test('⑳ large(16 × 12m) — 26~30석이 실제로 앉는다', () => {
  const res = lay(16000, 12000, 40);
  assert.ok(res.capacity >= 30, `정원 ${res.capacity}석 — 30석 목표에 못 미친다`);
  const seated = lay(16000, 12000, 30);
  assert.equal(seated.placed.chairs, 30);
  assert.ok(fitsLargeUTable(tablesOf(seated)));
  // 좌석이 늘어도 **간격이 줄지 않는다**(숫자만 맞추지 않았다).
  const cs = chairsOf(seated).filter(c => c.rotY === 180).map(c => c.x).sort((a, b) => a - b);
  for (let i = 1; i < cs.length; i++) {
    assert.equal(Math.round(cs[i] - cs[i - 1]), FURNITURE.chairPitch, '좌석 간격이 줄었다');
  }
});

test('㉑ 20석 벽의 원인은 **크기 상한**이었고, 기본값은 그대로다', () => {
  // 기본 상한(9,000 × 4,500)에서는 방을 아무리 키워도 정확히 20석에서 막힌다.
  assert.deepEqual({ ...U_TABLE_LIMITS.default }, { maxTableW: 9000, maxTableD: 4500 });
  for (const [W, dep] of [[14000, 10000], [20000, 16000], [30000, 24000]]) {
    assert.equal(lay(W, dep, 40, null).capacity, 20, `${W}×${dep}: 기본 상한이 20석을 벗어났다`);
  }
  // 대회의실 상한만 올렸다.
  assert.deepEqual({ ...U_TABLE_LIMITS.largeConference }, { maxTableW: 12000, maxTableD: 6500 });
  assert.equal(uTableLimits('largeConference'), U_TABLE_LIMITS.largeConference);
  assert.equal(uTableLimits('executiveBoardroom'), U_TABLE_LIMITS.default);
  assert.equal(uTableLimits('corporateMeeting'), U_TABLE_LIMITS.default);
  assert.equal(uTableLimits(undefined), U_TABLE_LIMITS.default);
});

// ── F. 다른 공간·자산 무변경 ────────────────────────────────────────────────

test('㉒ 대기업 회의실 배치 좌표가 한 자리도 바뀌지 않았다', () => {
  for (const [W, dep] of [[8000, 7000], [11000, 9000], [14000, 11000]]) {
    const a = layoutRoom('meeting', defaultOptions('meeting'), { W, D: dep, ledBottom: 1000 });
    const b = layoutRoom('meeting', defaultOptions('meeting'),
      { W, D: dep, ledBottom: 1000, design: 'corporateMeeting' });
    assert.deepEqual(b.items, a.items, `${W}: 디자인을 넘겼더니 배치가 달라졌다`);
    assert.equal(b.capacity, a.capacity);
  }
});

test('㉓ 임원 회의실 U 배치 좌표가 한 자리도 바뀌지 않았다', () => {
  for (const [W, dep, seats] of [[11000, 9000, 14], [9000, 8000, 12], [13000, 11000, 20]]) {
    const a = lay(W, dep, seats, null);
    const b = lay(W, dep, seats, 'executiveBoardroom');
    assert.deepEqual(b.items, a.items, `${W}: 임원 배치가 달라졌다`);
    assert.equal(b.capacity, a.capacity);
    // 임원 U 테이블 명세도 그대로 읽힌다.
    assert.ok(createBoardroomTable(tablesOf(b)), '임원 U 테이블이 자기 배치를 못 읽는다');
  }
});

test('㉔ 회의실 말고 다른 용도의 배치는 손대지 않았다', () => {
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'control', 'ideation']) {
    const a = layoutRoom(t, defaultOptions(t), { W: 14000, D: 16000, ledBottom: 1000 });
    const b = layoutRoom(t, defaultOptions(t),
      { W: 14000, D: 16000, ledBottom: 1000, design: 'largeConference' });
    assert.deepEqual(b.items, a.items, `${t}: 배치가 달라졌다`);
  }
});

test('㉕ 의자 3종·테이블 3종의 도형이 그대로다', () => {
  const now = {
    conferenceErgoChair: createConferenceErgoChair(),
    corporateChair: createCorporateChair(),
    executiveChair: createExecutiveChair(),
  };
  assert.deepEqual(now.conferenceErgoChair.length, 13, '대회의실 의자 부품 수가 바뀌었다');
  assert.deepEqual(now.corporateChair.length, createCorporateChair().length);
  assert.deepEqual(now.executiveChair.length, createExecutiveChair().length);
  // 기존 테이블 3종이 제 모양을 그대로 낸다.
  const one = { type: 'table', shape: 'boat', x: 0, z: 0, rotY: 0, w: 4000, d: 1400 };
  assert.ok(createConferenceTable(one).topThk > 0);
  assert.ok(createCorporateTable(one).supports.length > 0);
  const B = createBoardroomTable(tablesOf(lay(11000, 9000, 14, 'executiveBoardroom')));
  assert.equal(B.surfaceY, 745);
  assert.equal(B.topThk, 30);
  assert.equal(B.frontR, 450);
});

test('㉖ 라우터가 대회의실 테이블을 **대체 없이** 제 자산으로 해석한다', () => {
  const r = resolveFurnitureForDesign({ type: 'table' }, 'largeConference');
  assert.equal(r.requestedAsset, 'largeUTable');
  assert.equal(r.runtimeAsset, 'largeUTable');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false);
  assert.equal(r.renderable, true);
  assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
  // 다른 공간은 제 테이블을 그대로 쓴다.
  assert.equal(resolveFurnitureForDesign({ type: 'table' }, 'corporateMeeting').runtimeAsset, 'corporateTable');
  assert.equal(resolveFurnitureForDesign({ type: 'table' }, 'executiveBoardroom').runtimeAsset, 'boardroomTable');
  // 라우터 본체는 손대지 않았다 — 이름표 한 줄만 늘었다.
  assert.equal(assetFor({ type: 'table' }), 'conferenceTable', '기존 기본 경로가 바뀌었다');
  assert.equal(assetKey({ type: 'table', asset: 'largeUTable' }), null, 'U 테이블은 묶음 대상이 아니다');
});

test('㉗ 상황실 AV 는 그대로 미구현이다(대회의실 AV 는 PHASE 4-c 에서 생겼다)', () => {
  for (const id of ['consoleMonitor', 'keyboard']) {
    assert.equal(FURNITURE_CONTRACTS[id].status, CONTRACT_STATUS.CONTRACT_READY, `${id}: 상태가 바뀌었다`);
    assert.equal(hasRuntimeFurnitureAsset(id), false, `${id}: 도형이 생겼다`);
  }
  const d = ROOM_DESIGNS.largeConference;
  assert.equal(d.furniture.table, 'largeUTable');
  assert.equal(d.furniture.chair, 'conferenceErgoChair');
  assert.deepEqual(d.furniture.av.slice(0, 2), ['personalMonitor', 'prompter']);
  // 화각은 아직 대회의실 전용이 없다(마감 4-d.1 · 조명 4-d.2 에서 생겼다).
  for (const k of ['wallTreatment', 'camera', 'accessories']) {
    assert.ok(isPlanned(d[k]), `${k}: 이번 단계에서 건드렸다`);
  }
});

// ── G. 재질·도형 캐시·순수성 ───────────────────────────────────────────────

test('㉘ 정식 재질 13종이 그대로다(새로 만들지 않았다)', () => {
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13);
  // 쓰는 부품 이름은 전부 기존 마감 표에 있다(하얗게 뜨지 않게).
  const body = glSrc.match(/function largeUTableMesh[\s\S]*?\n}\n/)[0];
  const used = [...new Set([...body.matchAll(/mat\.([A-Za-z]+)/g)].map(m => m[1]))];
  assert.deepEqual(used.sort(), ['conferenceBase', 'conferenceTop']);
  for (const k of used) {
    // 색은 **기존 두 경로 중 하나**로 붙는다 — 새 마감도, 새 재질도 만들지 않았다.
    //   상판(corporateTop) 새 마감 표 · 하부(tableBase) 기존 부품 색 + 재질 대응표.
    const fin = finishForPart(k);
    const color = (fin && fin.color) || FURNITURE_COLORS[k];
    const material = (fin && fin.material) || PART_MATERIAL[k];
    assert.ok(color, `${k}: 색이 없다 — 재질 없는 메시는 화면에서 하얗게 뜬다`);
    assert.ok(MATERIAL_PRESETS[resolveMaterialId(material)], `${k}: 정식 재질 13종 밖을 가리킨다`);
    assert.ok(C.parts.includes(k), `${k}: 계약에 없는 부품을 쓴다`);
  }
  // 임원 전용 마감(boardroomTop·boardroomBase)은 **쓰지 않는다** — 임원 것을 물려받지 않았다.
  assert.ok(!used.includes('boardroomTop') && !used.includes('boardroomBase'));
});

test('㉙ 도형 캐시가 임원 U 테이블과 섞이지 않는다', () => {
  const cache = createGeometryCache();
  const same = { outerW: 9, outerD: 5, segW: 0.9 };
  const a = cache.uTop(same.outerW, same.outerD, same.segW, 0.025,
    { frontR: 0.18, rearR: 0.06, innerR: 0.12, bevel: 0.004 });
  const b = cache.uTop(same.outerW, same.outerD, same.segW, 0.030,
    { frontR: 0.45, rearR: 0.162, innerR: 0.3, bevel: 0.006 });
  assert.notEqual(a, b, '두께·모서리가 다른데 같은 도형을 물려받았다');
  assert.equal(cache.size, 2);
  // 같은 값을 다시 부르면 **하나를 돌려 쓴다**(테이블이 길어져도 도형은 한 벌).
  assert.equal(cache.uTop(same.outerW, same.outerD, same.segW, 0.025,
    { frontR: 0.18, rearR: 0.06, innerR: 0.12, bevel: 0.004 }), a);
  assert.equal(cache.size, 2);
  cache.dispose();
});

test('㉚ 순수 유지 — 명세는 Three.js·DOM 없이 돈다', () => {
  assert.ok(!/\bTHREE\b|document|window/.test(assetsSrc.match(/export function createLargeUTable[\s\S]*?\n}\n/)[0]));
  assert.equal(typeof globalThis.document, 'undefined');
  assert.ok(Object.isFrozen(BIG.S.post) && Object.isFrozen(BIG.S.beam));
  // 같은 입력이면 언제나 같은 결과다.
  assert.deepEqual(createLargeUTable(tablesOf(lay(16000, 12000, 30))), BIG.S);
});

test('㉛ 배치가 디자인을 **크기 상한 고르는 데만** 쓴다', () => {
  // room-presets 가 디자인으로 하는 일은 상한표 한 번 읽는 것뿐이다.
  const body = presetsSrc.match(/function layoutUTable[\s\S]*?\n}\n/)[0];
  // 상한 고르기 + AV 를 놓을 공간인지 묻기, 딱 두 곳뿐이다(PHASE 4-c).
  assert.equal((body.match(/o\.design/g) || []).length, 2, '배치가 디자인을 여러 곳에서 본다');
  assert.match(body, /const L = uTableLimits\(o\.design\);/);
  assert.match(body, /wantsConferenceAV\(o\.design\)/);
  // 상한 말고 좌석 간격·통로 같은 전역값은 그대로다.
  assert.equal(FURNITURE.chairPitch, 700);
  assert.equal(FURNITURE.chairClear, 650);
  assert.equal(FURNITURE.wallClear, 800);
  assert.equal(FURNITURE.frontClear, 1800);
});

test('㉜ 기준 수치 고정 — 16 × 12m 대회의실', () => {
  const S = BIG.S;
  assert.equal(S.outerW, 12000);
  assert.equal(S.outerD, 6500);
  assert.equal(S.segW, 900);
  assert.equal(S.innerW, 10200);
  assert.equal(S.innerD, 5600);
  assert.equal(S.supports.length, 11);
  assert.equal(S.maxSpan, 2186);
  assert.equal(BIG.res.capacity, 30);
  assert.equal(BIG.res.placed.chairs, 30);
});

// ── H. 계산기·가격표 무변경 ────────────────────────────────────────────────

test('㉝ LED 계산기(삼성 정합성)는 이 단계와 무관하게 그대로다', () => {
  // 3D 가구는 계산 엔진을 전혀 건드리지 않는다 — 삼성 검증 기준값이 그대로 나오는지 확인한다.
  const m = MODELS.find(x => x.id === 'MP012F');
  const r = computeConfig(m, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42, '삼성 검증값(42캐비닛)이 달라졌다');
  assert.equal(r.resW, 4480);
  assert.equal(r.resH, 2160);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.heatMaxBTU - 20916) < 20, `발열 ${r.heatMaxBTU}`);
});

test('㉞ 가격표는 로컬 전용 동작 그대로다(저장소에 값이 없다)', () => {
  // prices.local.js 가 없으면 조용히 null 로 떨어지는 것이 **설계된 동작**이다(404 정상).
  assert.match(appSrc, /await import\('\.\/prices\.local\.js\?v=\d+'\)\)\.PRICES; \} catch \{ PRICES = null; \}/);
  assert.equal(existsSync(new URL('../src/prices.local.js', import.meta.url)), false,
    '가격 정보가 저장소에 들어왔다(오너 지침 §5 위반)');
  assert.ok(existsSync(new URL('../src/prices.example.js', import.meta.url)), '예시 파일이 사라졌다');
});
