// boardroom-table.test.js — 임원 회의실 대형 U 테이블 (PHASE 3-b) 회귀 테스트.
// ─────────────────────────────────────────────────────────────────────────────
// 이 테스트가 지키는 것은 '모양이 예쁜가'가 아니라 **말과 숫자가 어긋나지 않는가**이다.
//   · 계약이 적어 둔 치수를 코드가 다시 만들어 내지 않는가
//   · 배치가 준 좌표를 그대로 쓰는가(배치를 다시 계산하지 않는가)
//   · '한 덩어리'라고 적어 놓고 조각 세 개를 세우고 있지 않은가
//   · 받침이 앉은 사람 무릎·의자 자리와 겹치지 않는가
//   · 새 마감이 기존 가구를 건드리지 않는가
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, createBoardroomTable, fitsBoardroomTable, boardroomUBounds,
  BOARDROOM_KNEE_CLEAR, BOARDROOM_MAX_SPAN, BOARDROOM_SEAT_PITCH,
} from '../src/furniture-assets.js';
import {
  FURNITURE_CONTRACTS, CONTRACT_STATUS, finishPartFor,
} from '../src/furniture-contracts.js';
import { PART_FINISH, PART_MATERIAL, finishForPart, resolveMaterialId } from '../src/materials.js';
import {
  resolveFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS } from '../src/room-design.js';
import { layoutRoom, FURNITURE, defaultOptions } from '../src/room-presets.js';

const C = FURNITURE_CONTRACTS.boardroomTable.dimensions;
const EXEC = FURNITURE_CONTRACTS.executiveChair;
const glSrc = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
const geoSrc = readFileSync(new URL('../src/geometry-gl.js', import.meta.url), 'utf8');

/** 실제 배치(room-presets의 U자 분기)에서 테이블 조각과 의자를 뽑아 온다. */
function uRoom(W, D, seats = 14) {
  const res = layoutRoom('meeting',
    { ...defaultOptions('meeting'), tableShape: 'u', seats, ledBottom: 1000 }, { W, D });
  return {
    tables: res.items.filter(i => i.type === 'table'),
    chairs: res.items.filter(i => i.type === 'chair'),
  };
}
const ROOMS = [[9000, 7500], [11000, 9000], [14000, 11000]];

// 두 사각형(중심 x,z · 폭 w · 깊이 d)이 겹치지 않는 최소 거리. 겹치면 음수.
function rectGap(a, b) {
  const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
  const dz = Math.abs(a.z - b.z) - (a.d + b.d) / 2;
  if (dx >= 0 && dz >= 0) return Math.hypot(dx, dz);
  if (dx >= 0) return dx;
  if (dz >= 0) return dz;
  return Math.max(dx, dz);                       // 둘 다 음수 = 겹침
}

// ── A. 계약 ─────────────────────────────────────────────────────────────────

test('계약 — 임원 U 테이블이 구현됨으로 바뀌었고 **치수는 하나도 바뀌지 않았다**', () => {
  const c = FURNITURE_CONTRACTS.boardroomTable;
  assert.equal(c.status, CONTRACT_STATUS.IMPLEMENTED);
  assert.equal(c.category, 'table');
  assert.equal(c.instancing, 'custom');
  assert.deepEqual({ ...c.dimensions }, {
    surfaceY: 745, topThk: 30, minWidth: 3600, minDepth: 2400, frontCornerR: 450, bodyDrop: 620,
  }, '계약 치수가 바뀌었다 — 이 값이 이 자산의 유일한 기준이다');
  assert.deepEqual([...c.shapes], ['u']);
  assert.deepEqual([...c.rooms], ['executiveBoardroom']);
});

test('계약 — 하부 구조 부품이 **기존 가구 부품 이름을 가로채지 않는다**', () => {
  const c = FURNITURE_CONTRACTS.boardroomTable;
  assert.deepEqual([...c.parts], ['boardroomTop', 'boardroomBase']);
  // tableBase 는 회의 테이블·강의용 책상이 이미 쓰는 이름이다. 여기에 새 마감을 붙이면
  //   그 가구들의 재질까지 같이 바뀐다 — 그래서 제 이름을 쓴다.
  assert.ok(PART_MATERIAL.tableBase, '기존 부품 이름 전제가 깨졌다');
  assert.equal(PART_MATERIAL.boardroomBase, undefined, '새 부품 이름이 기존 표와 겹친다');
  assert.equal(PART_MATERIAL.boardroomTop, undefined);
  assert.equal(finishPartFor('boardroomTable', 'boardroomTop'), 'boardroomTop');
  assert.equal(finishPartFor('boardroomTable', 'boardroomBase'), 'boardroomBase');
});

// ── B. 마감 ─────────────────────────────────────────────────────────────────

test('마감 — 상판은 밝은 오크(기존 목재 재질의 별칭)이고 **색이 반드시 있다**', () => {
  const f = PART_FINISH.boardroomTop;
  assert.equal(f.material, 'lightOak', '정식 재질을 새로 만들지 않는다 — 별칭으로 쓴다');
  assert.equal(resolveMaterialId('lightOak'), 'woodTable');
  // 색이 없으면 렌더러의 마감 반복문이 건너뛰어 **부품이 하얗게 뜬다**(임원 의자에서 실제로 그랬다).
  assert.match(f.color, /^#[0-9a-f]{6}$/i, '상판 색이 없다 — 화면에서 하얗게 뜬다');
  assert.equal(finishForPart('boardroomTop').material, 'woodTable');
});

test('마감 — 하부 구조는 짙은 그라파이트이고 상판과 확실히 갈린다', () => {
  const f = PART_FINISH.boardroomBase;
  assert.equal(f.material, 'darkGraphite');
  assert.match(f.color, /^#[0-9a-f]{6}$/i);
  const lum = hex => { const n = parseInt(hex.slice(1), 16);
    return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
  const top = lum(PART_FINISH.boardroomTop.color), base = lum(f.color);
  assert.ok(top - base > 80, `상판(${top.toFixed(0)})과 하부(${base.toFixed(0)}) 명도 차가 작다 — 한 덩어리로 뭉친다`);
  // 의자 프레임과 **같은 색이 아니어야** 한다 — 같으면 테이블 다리와 의자가 붙어 보인다.
  assert.notEqual(f.color, PART_FINISH.chairFrame.color);
});

// ── C. 등록·라우팅 ──────────────────────────────────────────────────────────

test('런타임 등록 — 카탈로그에 있고 갈래가 테이블이다', () => {
  const a = FURNITURE_ASSETS.boardroomTable;
  assert.ok(a, '런타임 카탈로그에 없다');
  assert.equal(a.instanced, false, 'U 테이블은 한 덩어리라 인스턴싱 대상이 아니다');
  assert.equal(typeof a.spec, 'function');
  assert.equal(RUNTIME_CATEGORY.boardroomTable, 'table');
  assert.equal(hasRuntimeFurnitureAsset('boardroomTable'), true);
});

test('라우터 — 임원 회의실 테이블이 **대체품 없이** 제 자산으로 해석된다', () => {
  assert.equal(ROOM_DESIGNS.executiveBoardroom.furniture.table, 'boardroomTable');
  const r = resolveFurnitureForDesign({ type: 'table' }, 'executiveBoardroom');
  assert.equal(r.requestedAsset, 'boardroomTable');
  assert.equal(r.runtimeAsset, 'boardroomTable');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false);
  // 다른 공간은 그대로다 — 대기업 회의실은 여전히 제 테이블을 쓴다.
  assert.equal(resolveFurnitureForDesign({ type: 'table' }, 'corporateMeeting').runtimeAsset, 'corporateTable');
});

// ── D. 배치 판별 ────────────────────────────────────────────────────────────

test('배치 판별 — 실제 U 배치(조각 3개)를 맡는다', () => {
  for (const [W, D] of ROOMS) {
    const { tables } = uRoom(W, D);
    assert.equal(tables.length, 3, `${W}×${D}: U 배치가 조각 3개가 아니다`);
    assert.equal(fitsBoardroomTable(tables), true, `${W}×${D}: U 배치를 맡지 못한다`);
  }
});

test('배치 판별 — 모르는 모양이면 **맡지 않는다**(추측해서 맞추지 않는다)', () => {
  const { tables } = uRoom(11000, 9000);
  const bad = [
    [[], '빈 목록'],
    [tables.slice(0, 2), '조각 2개'],
    [[...tables, { ...tables[0] }], '조각 4개'],
    [tables.map((t, i) => (i === 1 ? { ...t, rotY: 90 } : t)), '돌아간 조각'],
    [tables.map((t, i) => (i === 1 ? { ...t, shape: 'boat' } : t)), '사각이 아닌 조각'],
    [tables.map((t, i) => (i === 1 ? { ...t, x: t.x + 300 } : t)), '날개가 바깥면에 안 붙음'],
    [tables.map((t, i) => (i === 1 ? { ...t, d: t.d - 400 } : t)), '날개 길이가 안 맞음'],
    [tables.map((t, i) => (i === 0 ? { ...t, d: 400 } : t)), '띠 폭이 날개 폭과 다름'],
    [tables.map(t => ({ ...t, type: 'desk' })), '테이블이 아닌 항목'],
  ];
  for (const [items, why] of bad) {
    assert.equal(boardroomUBounds(items), null, `${why}: 맡으면 안 되는데 맡았다`);
    assert.equal(createBoardroomTable(items), null, `${why}: 명세를 만들면 안 된다`);
  }
});

test('배치 판별 — 계약 최소 치수보다 작으면 맡지 않는다', () => {
  const small = [
    { type: 'table', shape: 'rect', x: 1500, z: 2000, rotY: 0, w: 3000, d: 600 },
    { type: 'table', shape: 'rect', x: 300, z: 1400, rotY: 0, w: 600, d: 600 },
    { type: 'table', shape: 'rect', x: 2700, z: 1400, rotY: 0, w: 600, d: 600 },
  ];
  assert.ok(3000 < C.minWidth || 1800 < C.minDepth);
  assert.equal(fitsBoardroomTable(small), false);
});

test('배치 판별 — 뒤 상판이 **LED 쪽(앞)** 에 있으면 맡지 않는다', () => {
  const { tables } = uRoom(11000, 9000);
  const minZ = Math.min(...tables.map(t => t.z - t.d / 2));
  const maxZ = Math.max(...tables.map(t => t.z + t.d / 2));
  const flipped = tables.map(t => ({ ...t, z: minZ + maxZ - t.z }));   // 앞뒤 뒤집기
  assert.equal(boardroomUBounds(flipped), null, 'U자가 LED를 등지고 열려도 맡아 버린다');
});

// ── E. 치수 ─────────────────────────────────────────────────────────────────

test('치수 — 합쳐진 바깥 크기가 **배치 조각의 테두리와 정확히 같다**(배치를 다시 계산하지 않는다)', () => {
  for (const [W, D] of ROOMS) {
    const { tables } = uRoom(W, D);
    const S = createBoardroomTable(tables);
    const minX = Math.min(...tables.map(t => t.x - t.w / 2));
    const maxX = Math.max(...tables.map(t => t.x + t.w / 2));
    const minZ = Math.min(...tables.map(t => t.z - t.d / 2));
    const maxZ = Math.max(...tables.map(t => t.z + t.d / 2));
    assert.equal(S.outerW, Math.round(maxX - minX), `${W}×${D}: 바깥 가로가 배치와 다르다`);
    assert.equal(S.outerD, Math.round(maxZ - minZ), `${W}×${D}: 바깥 세로가 배치와 다르다`);
    assert.equal(S.cx, Math.round((minX + maxX) / 2));
    assert.equal(S.cz, Math.round((minZ + maxZ) / 2));
    assert.equal(S.segW, Math.round(tables.find(t => t.w === S.outerW).d), '띠 폭이 배치와 다르다');
    assert.equal(S.innerW, S.outerW - S.segW * 2);
    assert.equal(S.innerD, S.outerD - S.segW);
  }
});

test('치수 — 상판 윗면·두께가 계약값 그대로다', () => {
  const S = createBoardroomTable(uRoom(11000, 9000).tables);
  assert.equal(S.surfaceY, C.surfaceY);
  assert.equal(S.topThk, C.topThk);
  assert.equal(S.topBottom, C.surfaceY - C.topThk);
  // 두꺼운 슬래브 금지 — 30mm 그대로다.
  assert.ok(S.topThk <= 30, `상판이 ${S.topThk}mm 로 두껍다`);
  assert.equal(S.shape, 'u');
});

// ── F. 모서리 ───────────────────────────────────────────────────────────────

test('모서리 — 앞 끝 반지름이 계약값이고 띠 폭의 절반을 넘지 않는다', () => {
  for (const [W, D] of ROOMS) {
    const S = createBoardroomTable(uRoom(W, D).tables);
    assert.equal(S.frontR, Math.min(C.frontCornerR, S.segW / 2),
      '앞 모서리 반지름이 계약값(또는 안전 한계)과 다르다');
    assert.ok(S.frontR <= S.segW / 2 + 1e-9, '앞 모서리가 띠 폭의 절반을 넘는다 — 도형이 깨진다');
    assert.ok(S.frontR > 0);
  }
});

test('모서리 — 안쪽 오목 모서리에 **실제 값**이 있다(직사각형 세 장으로 읽히지 않게)', () => {
  const S = createBoardroomTable(uRoom(11000, 9000).tables);
  assert.ok(S.innerR >= 150, `안쪽 모서리 ${S.innerR}mm — 너무 작으면 이음매가 드러난다`);
  assert.ok(S.innerR <= S.innerW / 2 && S.innerR <= S.innerD / 2, '안쪽 모서리가 구멍보다 크다');
  assert.ok(S.rearR > 0 && S.rearR < S.frontR, '뒤 바깥 모서리는 앞보다 약하게만 둥글린다');
});

// ── G. 하부 구조 ────────────────────────────────────────────────────────────

test('하부 구조 — 통짜 받침대가 아니라 **얇은 판**이다', () => {
  const S = createBoardroomTable(uRoom(11000, 9000).tables);
  const bladeH = S.topBottom - S.panelBottom;
  for (const sp of S.supports) {
    const long = Math.max(sp.w, sp.d), thin = Math.min(sp.w, sp.d);
    assert.ok(thin <= 120, `블레이드 두께 ${thin}mm — 두꺼우면 기둥이 된다`);
    assert.ok(long / bladeH <= 0.7,
      `블레이드 가로/세로 ${(long / bladeH).toFixed(2)} — 정사각에 가까우면 통짜 받침대로 읽힌다`);
    assert.ok(long >= 250, `블레이드 길이 ${long}mm — 너무 짧으면 가느다란 막대가 된다`);
  }
});

test('하부 구조 — 상판 밑면에서 계약이 정한 만큼 내려오고 바닥에는 굽이 따로 닿는다', () => {
  const S = createBoardroomTable(uRoom(11000, 9000).tables);
  assert.equal(S.bodyDrop, C.bodyDrop);
  assert.equal(S.panelBottom, S.topBottom - C.bodyDrop);
  assert.ok(S.panelBottom > 0, '판이 바닥까지 내려오면 굽(들어간 단)이 생기지 않는다');
  assert.ok(S.toeInset > 0, '굽이 들어가 있지 않으면 판이 그냥 바닥에 붙어 보인다');
});

// ── H. 받침 위치 ────────────────────────────────────────────────────────────

test('받침 위치 — 앉는 모서리에서 **무릎 여유만큼** 안으로 물려 있다', () => {
  for (const [W, D] of ROOMS) {
    const S = createBoardroomTable(uRoom(W, D).tables);
    for (const sp of S.supports) {
      // 앉는 모서리까지의 거리 = 띠 바깥면 ~ 블레이드 앞면.
      const across = sp.along === 'x' ? S.outerD / 2 - sp.dz : S.outerW / 2 - Math.abs(sp.dx);
      const thin = sp.along === 'x' ? sp.d : sp.w;
      const knee = across - thin / 2;
      assert.ok(knee >= BOARDROOM_KNEE_CLEAR - 1,
        `${W}×${D}: 무릎 여유 ${Math.round(knee)}mm < ${BOARDROOM_KNEE_CLEAR}mm`);
      // 띠 안쪽으로도 튀어나오면 안 된다.
      assert.ok(across + thin / 2 <= S.segW + 1,
        `${W}×${D}: 블레이드가 상판 띠(${S.segW}mm) 밖으로 나갔다`);
    }
  }
});

test('받침 위치 — 임원 의자 자리(710 × 720)와 **겹치지 않는다**', () => {
  assert.deepEqual({ ...EXEC.footprint }, { w: 710, d: 720 }, '임원 의자 자리 전제가 바뀌었다');
  for (const [W, D] of ROOMS) {
    const { tables, chairs } = uRoom(W, D);
    const S = createBoardroomTable(tables);
    assert.ok(chairs.length > 0);
    for (const sp of S.supports) {
      const blade = { x: S.cx + sp.dx, z: S.cz + sp.dz, w: sp.w, d: sp.d };
      for (const ch of chairs) {
        // 의자는 rotY 0/90/270 로만 놓인다 — 90·270 이면 가로·세로가 바뀐다.
        const turned = Math.round((ch.rotY || 0)) % 180 !== 0;
        const seat = { x: ch.x, z: ch.z,
          w: turned ? EXEC.footprint.d : EXEC.footprint.w,
          d: turned ? EXEC.footprint.w : EXEC.footprint.d };
        assert.ok(rectGap(blade, seat) > 0,
          `${W}×${D}: 받침(${blade.x},${blade.z})이 의자 자리(${ch.x},${ch.z})와 겹친다`);
      }
    }
  }
});

test('받침 개수 — 받침 없이 건너뛰는 거리가 한계 이하다', () => {
  for (const [W, D] of ROOMS) {
    const S = createBoardroomTable(uRoom(W, D).tables);
    // 뒤 상판: 두 날개 사이 구간을 블레이드가 나눈다.
    const headerXs = S.supports.filter(s => s.along === 'x').map(s => s.dx).sort((a, b) => a - b);
    const zone = S.innerW;
    const stops = [-zone / 2, ...headerXs, zone / 2];
    for (let i = 1; i < stops.length; i++) {
      assert.ok(stops[i] - stops[i - 1] <= BOARDROOM_MAX_SPAN + 1,
        `${W}×${D}: 뒤 상판이 ${Math.round(stops[i] - stops[i - 1])}mm 를 받침 없이 건넌다`);
    }
    // 날개 한쪽.
    const wingZs = S.supports.filter(s => s.along === 'z' && s.dx < 0).map(s => s.dz).sort((a, b) => a - b);
    const wStops = [-S.outerD / 2, ...wingZs, S.outerD / 2 - S.segW];
    for (let i = 1; i < wStops.length; i++) {
      assert.ok(wStops[i] - wStops[i - 1] <= BOARDROOM_MAX_SPAN + 1,
        `${W}×${D}: 날개가 ${Math.round(wStops[i] - wStops[i - 1])}mm 를 받침 없이 건넌다`);
    }
  }
});

test('받침 — 좌우 대칭이다(한쪽으로 쏠리면 테이블이 기울어 보인다)', () => {
  for (const [W, D] of ROOMS) {
    const S = createBoardroomTable(uRoom(W, D).tables);
    const key = s => `${s.along}|${s.dz}|${s.w}|${s.d}`;
    const left = S.supports.filter(s => s.dx < 0).map(s => `${key(s)}|${-s.dx}`).sort();
    const right = S.supports.filter(s => s.dx > 0).map(s => `${key(s)}|${s.dx}`).sort();
    assert.deepEqual(left, right, `${W}×${D}: 받침이 좌우 대칭이 아니다`);
    assert.ok(S.supports.length >= 6, '받침이 너무 적다');
  }
});

test('좌석 간격 상수 — 배치가 쓰는 chairPitch 와 같은 값이다', () => {
  assert.equal(BOARDROOM_SEAT_PITCH, FURNITURE.chairPitch,
    '받침 길이의 근거가 되는 좌석 간격이 배치와 어긋났다');
});

// ── I. 어댑터(화면 조립) ────────────────────────────────────────────────────

test('어댑터 — U자를 조각마다가 아니라 **한 번만** 세운다', () => {
  assert.match(glSrc, /const boardroomU = \(tableItems\.length > 0/, 'U자 판별이 없다');
  assert.match(glSrc, /tableItems\.every\(x => assetFor\(x\) === 'boardroomTable'\)/,
    '테이블 조각 전체가 임원 U 테이블인지 확인하지 않는다');
  assert.match(glSrc, /&& fitsBoardroomTable\(tableItems\)/, '맡을 수 있는 모양인지 확인하지 않는다');
  assert.match(glSrc, /if \(boardroomMesh\) continue;/, '조각마다 그리는 길을 막지 않았다');
  // 세우는 곳은 딱 한 군데여야 한다.
  assert.equal((glSrc.match(/boardroomTableMesh\(/g) || []).length, 2,
    'U자를 세우는 자리가 정의 1 + 호출 1 이 아니다');
});

test('어댑터 — 쓰는 부품 이름이 전부 마감 표에 있다(하얗게 뜨지 않게)', () => {
  const body = glSrc.match(/function boardroomTableMesh[\s\S]*?\n}\n/)[0];
  const used = [...body.matchAll(/mat\.([A-Za-z]+)/g)].map(m => m[1]);
  assert.ok(used.length >= 2);
  for (const k of new Set(used)) {
    assert.ok(finishForPart(k) && finishForPart(k).color,
      `${k}: 마감(색)이 없다 — 재질 없는 메시는 화면에서 하얗게 뜬다`);
    assert.ok(FURNITURE_CONTRACTS.boardroomTable.parts.includes(k),
      `${k}: 계약에 없는 부품을 쓴다`);
  }
});

// ── J. 도형 캐시 ────────────────────────────────────────────────────────────

test('도형 캐시 — U자를 결정하는 값이 **전부** 열쇠에 들어간다', () => {
  const m = geoSrc.match(/uTop\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/);
  assert.ok(m, 'uTop 도형 캐시가 없다');
  for (const v of ['outerW', 'outerD', 'segW', 'thk', 'frontR', 'rearR', 'innerR']) {
    assert.ok(m[1].includes('${' + v + '}'), `캐시 열쇠에 ${v} 가 빠졌다: ${m[1]}`);
  }
});

test('도형 캐시 — 다른 도형과 열쇠 머리글자가 겹치지 않는다', () => {
  const head = re => geoSrc.match(re)[1].split('|')[0];
  const heads = {
    slab: head(/slab\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/),
    boatTop: head(/boatTop\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/),
    arc: head(/arc\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/),
    taperedBack: head(/taperedBack\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/),
    uTop: head(/uTop\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/),
  };
  const seen = new Set();
  for (const [name, h] of Object.entries(heads)) {
    assert.equal(seen.has(h), false, `${name} 이 머리글자 '${h}' 를 다른 도형과 나눠 쓴다`);
    seen.add(h);
  }
});

// ── K. 순수성 ───────────────────────────────────────────────────────────────

test('순수 유지 — U 테이블 명세는 Three.js·DOM 없이 돈다', () => {
  const src = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.equal(/from\s+['"].*three/i.test(code), false, 'Three.js 를 불러왔다');
  assert.equal(/\bdocument\.|\bwindow\./.test(code), false, 'DOM 을 만졌다');
  // 같은 입력이면 같은 결과이고, 받은 배치 항목을 **고치지 않는다**.
  const { tables } = uRoom(11000, 9000);
  const snapshot = JSON.stringify(tables);
  assert.deepEqual(createBoardroomTable(tables), createBoardroomTable(tables));
  assert.equal(JSON.stringify(tables), snapshot, '배치 항목을 건드렸다');
});

test('기준 수치 고정 — 11 × 9m 방의 U 테이블', () => {
  const S = createBoardroomTable(uRoom(11000, 9000).tables);
  assert.deepEqual({
    outerW: S.outerW, outerD: S.outerD, segW: S.segW, innerW: S.innerW, innerD: S.innerD,
    cx: S.cx, cz: S.cz, frontR: S.frontR, rearR: S.rearR, innerR: S.innerR,
    surfaceY: S.surfaceY, topThk: S.topThk, panelBottom: S.panelBottom, supports: S.supports.length,
  }, {
    outerW: 8100, outerD: 4500, segW: 900, innerW: 6300, innerD: 3600,
    cx: 5500, cz: 5000, frontR: 450, rearR: 162, innerR: 300,
    surfaceY: 745, topThk: 30, panelBottom: 95, supports: 7,
  });
});
