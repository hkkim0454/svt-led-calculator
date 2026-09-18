// task-chair.test.js — 상황실 운용자 의자 회귀 테스트. (PHASE 5-a)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 계약이 유일한 치수 기준인가 — 도형 코드가 치수를 다시 적지 않았는가.
//   ② **앞의 세 의자와 다른 의자인가** — 크기만 줄인 축소판이면 실패다.
//   ③ 배치는 **그대로인가** — 이번 단계는 '의자를 그리는 방식'만 바꾼다.
//   ④ 범위가 의자에 머무는가 — 콘솔·모니터·마감·조명·화각·선택칸을 건드리지 않았는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, DIMS, assetFor, assetKey, assetParts,
  createTaskChair, createConferenceErgoChair, createCorporateChair,
  createExecutiveChair, createConferenceChair,
  TASK_BEVEL_MARGIN, TASK_TOP_MARGIN,
} from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS, CONTRACT_STATUS, finishPartFor } from '../src/furniture-contracts.js';
import {
  resolveFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS, isPlanned, designsFor, normalizeDesign } from '../src/room-design.js';
import { MATERIAL_IDS, PART_FINISH, finishForPart } from '../src/materials.js';
import { layoutRoom, defaultOptions, FURNITURE } from '../src/room-presets.js';

const C = FURNITURE_CONTRACTS.taskChair;
const D = C.dimensions;
const parts = createTaskChair();
const kinds = [...new Set(parts.map(p => p.kind))].sort();
const assetsSrc = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');

/** 선언된 부품들이 차지하는 최대 폭·깊이·높이와 바닥 접지(도형 굽기 전 기준). */
function envelope(list) {
  let halfX = 0, halfZ = 0, top = 0, bottom = Infinity;
  for (const p of list) {
    const hw = p.shape === 'star' ? p.reach : (p.w || 0) / 2;
    const hd = p.shape === 'star' ? p.reach : (p.d || 0) / 2;
    halfX = Math.max(halfX, Math.abs(p.dx || 0) + hw);
    halfZ = Math.max(halfZ, Math.abs(p.dz || 0) + hd);
    top = Math.max(top, (p.y || 0) + (p.h || 0) / 2);
    bottom = Math.min(bottom, (p.y || 0) - (p.h || 0) / 2);
  }
  return { w: halfX * 2, d: halfZ * 2, h: top, bottom };
}

/** 상황실 배치 한 벌 — 의자·콘솔·뒤 테이블·단을 갈라서 돌려준다. */
function control(W, D2, H, over = {}) {
  const o = { ...defaultOptions('control'), ...over };
  const res = layoutRoom('control', o, { W, D: D2, H });
  const by = t => res.items.filter(i => i.type === t);
  return { res, chairs: by('chair'), consoles: by('console'), tables: by('table'), risers: by('riser') };
}

/** 축에 나란한 사각형(회전 0/90/180/270만 쓰는 배치라 이걸로 충분하다). */
function rect(x, z, w, d, rotY) {
  const swap = (Math.round(Math.abs(rotY || 0)) % 180) === 90;
  const W = swap ? d : w, D2 = swap ? w : d;
  return { x0: x - W / 2, x1: x + W / 2, z0: z - D2 / 2, z1: z + D2 / 2 };
}
/** 두 사각형의 거리. 0보다 작으면 겹친 것이다. */
function gap(a, b) {
  const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const gz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  return (gx >= 0 || gz >= 0) ? Math.max(gx, gz) : -Math.min(-gx, -gz);
}

// ── A. 등록·계약·라우팅 ─────────────────────────────────────────────────────

test('① 계약이 그대로 있고, 치수가 한 글자도 바뀌지 않았다', () => {
  assert.ok(C, '계약이 사라졌다');
  assert.equal(C.category, 'chair');
  assert.equal(C.family, 'operatorTask');
  assert.equal(C.instancing, 'instanced');
  assert.deepEqual([...C.rooms], ['controlRoom']);
  assert.deepEqual({ ...D }, {
    seatTop: 450, seatW: 470, seatD: 460,
    overallW: 620, overallD: 630, overallH: 1000,
    casterBase: 620, backAboveSeat: 550,
  }, '계약 치수를 말없이 바꿨다');
  assert.deepEqual({ ...C.footprint }, { w: 620, d: 630 });
  assert.deepEqual([...C.parts],
    ['chairFrame', 'chairMesh', 'chairCushion', 'chairArmPad', 'chairColumn', 'chairCaster']);
});

test('② 런타임 카탈로그에 있고, 계약 상태가 **구현됨**으로 바뀌었다', () => {
  const a = FURNITURE_ASSETS.taskChair;
  assert.ok(a, '런타임 카탈로그에 없다');
  assert.equal(a.instanced, true);
  assert.equal(a.sized, false);
  assert.equal(C.status, CONTRACT_STATUS.IMPLEMENTED);
  assert.equal(RUNTIME_CATEGORY.taskChair, 'chair');
  assert.equal(hasRuntimeFurnitureAsset('taskChair'), true);
  assert.equal(assetFor({ type: 'chair', asset: 'taskChair' }), 'taskChair');
  assert.equal(assetKey({ type: 'chair', asset: 'taskChair' }), 'taskChair');
});

test('③ **대신 그리지 않는다** — 상황실 의자가 회의용 의자로 되돌아가지 않는다', () => {
  const r = resolveFurnitureForDesign({ type: 'chair' }, 'controlRoom');
  assert.equal(r.requestedAsset, 'taskChair');
  assert.equal(r.runtimeAsset, 'taskChair', '아직 다른 의자로 대신 그린다');
  assert.notEqual(r.runtimeAsset, 'conferenceChair');
  assert.equal(r.implemented, true);
  assert.equal(r.fallbackUsed, false, '대체가 일어났다');
  assert.equal(r.renderable, true);
  assert.equal(r.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
  // 디자인 선언에서도 planned 껍데기가 벗겨졌다.
  assert.equal(ROOM_DESIGNS.controlRoom.furniture.chair, 'taskChair');
  assert.equal(isPlanned(ROOM_DESIGNS.controlRoom.furniture.chair), false);
});

test('④ 치수의 기준은 **계약 하나**다 — 도형 코드가 치수를 다시 적지 않았다', () => {
  assert.deepEqual({ ...DIMS.taskChair }, { ...D }, '치수를 두 곳에 적었다');
  assert.match(assetsSrc, /taskChair: FURNITURE_CONTRACTS\.taskChair\.dimensions,/,
    'DIMS 가 계약을 직접 읽지 않는다');
  const body = assetsSrc.match(/export function createTaskChair[\s\S]*?\n}\n/)[0];
  for (const v of [470, 460, 620, 630, 1000, 550]) {
    assert.ok(!new RegExp(`[^.\\w]${v}[^.\\w\\d]`).test(body.replace(/\/\/.*$/gm, '')),
      `도형 코드에 계약 치수 ${v} 가 그대로 적혀 있다 — 계약을 읽어야 한다`);
  }
  assert.match(body, /DIMS\.taskChair/);
});

// ── B. 형상 ─────────────────────────────────────────────────────────────────

test('⑤ 선언 치수가 계약 봉투 안에 들어온다', () => {
  const e = envelope(parts);
  assert.ok(e.w <= D.overallW, `폭 ${e.w} > 계약 ${D.overallW}`);
  assert.ok(e.d <= D.overallD, `깊이 ${e.d} > 계약 ${D.overallD}`);
  assert.ok(e.h <= D.overallH, `높이 ${e.h} > 계약 ${D.overallH}`);
  assert.ok(TASK_BEVEL_MARGIN > 0 && TASK_TOP_MARGIN > 0, '여유는 의도된 값이다');
  assert.equal(Math.round(e.w), D.overallW - TASK_BEVEL_MARGIN * 2, '폭 여유가 선언과 다르다');
  // 계약보다 **너무** 작아도 안 된다 — 그러면 다른 의자로 보인다.
  assert.ok(e.w >= D.overallW - 60, `폭 ${e.w} 가 계약보다 너무 작다`);
  assert.ok(e.h >= D.overallH - 30, `높이 ${e.h} 가 계약보다 너무 낮다`);
});

test('⑥ 바닥 접지 — 의자 자신의 바닥은 정확히 0이다(뜨지도 파고들지도 않는다)', () => {
  const e = envelope(parts);
  assert.equal(e.bottom, 0, `의자 밑면이 ${e.bottom} — 배치가 주는 단 높이에 그대로 얹혀야 한다`);
  const star = parts.find(p => p.shape === 'star');
  assert.equal(star.y, star.h / 2, '받침이 바닥에 놓이지 않았다');
});

test('⑦ 좌판 윗면이 계약 좌석고와 같다', () => {
  const seat = parts.find(p => p.kind === 'chairCushion');
  assert.equal(seat.w, D.seatW);
  assert.equal(seat.d, D.seatD);
  assert.equal(seat.y + seat.h / 2, D.seatTop, '좌판 윗면이 좌석고와 다르다');
  assert.ok(seat.h <= 64, `좌판 두께 ${seat.h}mm — 두꺼우면 라운지 의자가 된다`);
});

test('⑧ **헤드레스트가 없다** — 운용자 의자는 하이백이 아니다', () => {
  assert.ok(!kinds.includes('chairHeadrest'), '헤드레스트가 생겼다');
  assert.equal(D.headrestH, undefined, '계약에 헤드레스트가 생겼다');
  assert.ok(!C.parts.includes('chairHeadrest'));
  assert.equal(finishPartFor('taskChair', 'chairHeadrest'), null);
  // 임원 의자는 반대로 헤드레스트가 있어야 한다(동결 확인).
  assert.ok(createExecutiveChair().some(p => p.kind === 'chairHeadrest'));
});

test('⑨ 5발 캐스터 받침 + 가스 실린더 — 사무용 회전의자의 실루엣이다', () => {
  const star = parts.find(p => p.shape === 'star');
  assert.ok(star, '5발 받침이 없다');
  assert.equal(star.kind, 'chairCaster');
  assert.equal(star.legs, 5, '다섯 발이 아니다');
  assert.ok(star.casterR > 0 && star.casterH > 0, '바퀴가 없다');
  assert.ok(star.reach * 2 <= D.casterBase, `받침 ${star.reach * 2} > 계약 ${D.casterBase}`);
  assert.ok(star.reach * 2 >= D.casterBase - TASK_BEVEL_MARGIN * 2 - 1,
    '받침이 계약보다 지나치게 작다');
  const col = parts.find(p => p.shape === 'cyl' && p.kind === 'chairColumn');
  assert.ok(col, '가스 실린더가 없다');
  assert.ok(col.r < 40, `기둥 반지름 ${col.r} — 굵으면 사무 의자로 안 보인다`);
});

test('⑩ 네 의자가 **크기만 다른 같은 의자가 아니다** — 등받이를 세우는 방식이 다르다', () => {
  const sagOf = list => list.filter(p => p.sag).map(p => p.kind).sort();
  // 운용자: 휜 판은 **메시 하나뿐**이다(뒤판·어깨 가로대·허리받침이 없다).
  assert.deepEqual(sagOf(parts), ['chairMesh'], `휜 판 구성: ${sagOf(parts)}`);
  assert.deepEqual(sagOf(createConferenceErgoChair()), ['chairFrame', 'chairMesh']);
  assert.ok(sagOf(createCorporateChair()).length >= 3, '대기업 의자 구성이 바뀌었다');
  assert.ok(createExecutiveChair().some(p => p.shape === 'taper'), '임원 의자 구성이 바뀌었다');
  // 운용자만 **가운데 척추 하나**로 등받이를 세운다 — 옆 레일(대회의)이 없다.
  const spine = parts.filter(p => p.kind === 'chairFrame' && !p.sag && !p.r && p.tiltX && !p.dx);
  assert.equal(spine.length, 1, '가운데 척추가 하나가 아니다');
  assert.ok(spine[0].h > 300, '척추가 등받이를 세울 만큼 길지 않다');
  const sideRails = parts.filter(p => p.kind === 'chairFrame' && !p.sag && !p.r && p.dx && p.h > 300);
  assert.equal(sideRails.length, 0, '옆 레일이 생겼다 — 그것은 대회의실 의자의 정체성이다');
  assert.equal(createConferenceErgoChair()
    .filter(p => p.kind === 'chairFrame' && !p.sag && !p.r && p.dx && p.h > 300).length, 2,
  '대회의실 의자의 세로 레일이 사라졌다');
  // 부품 수가 넷 중 가장 적다 — 좁은 열이 여러 줄 겹치는 공간이기 때문이다.
  assert.ok(parts.length < createConferenceErgoChair().length, '대회의실 의자보다 부품이 많다');
  assert.ok(parts.length < createCorporateChair().length);
  assert.ok(parts.length < createExecutiveChair().length);
});

test('⑪ 네 의자의 치수가 뚜렷하게 갈린다 — 운용자 의자가 가장 작다', () => {
  const T = id => FURNITURE_CONTRACTS[id].dimensions;
  const task = T('taskChair'), conf = T('conferenceErgoChair');
  const corp = T('corporateChair'), exec = T('executiveChair');
  assert.ok(task.overallH < conf.overallH && conf.overallH < corp.overallH
    && corp.overallH < exec.overallH, '높이 순서가 깨졌다');
  assert.ok(task.overallW < conf.overallW && conf.overallW < corp.overallW
    && corp.overallW < exec.overallW, '폭 순서가 깨졌다');
  assert.ok(task.backAboveSeat < conf.backAboveSeat, '등받이가 대회의실 의자보다 높다');
  // 화면에서 잰 봉투로도 가장 작아야 한다(계약만 작고 도형은 큰 일이 없게).
  const e = id => envelope({ taskChair: parts, conferenceErgoChair: createConferenceErgoChair(),
    corporateChair: createCorporateChair(), executiveChair: createExecutiveChair() }[id]);
  assert.ok(e('taskChair').w < e('conferenceErgoChair').w);
  assert.ok(e('taskChair').h < e('conferenceErgoChair').h);
});

test('⑫ 팔걸이가 콘솔 상판(730mm) 밑으로 들어간다 — 콘솔에 붙어 앉을 수 있다', () => {
  const padTop = Math.max(...parts.filter(p => p.kind === 'chairArmPad').map(p => p.y + p.h / 2));
  assert.ok(padTop < DIMS.controlConsole.surfaceY,
    `팔걸이 윗면 ${padTop} ≥ 콘솔 상판 ${DIMS.controlConsole.surfaceY}`);
  // 대회의실 의자보다도 낮다 — 상황실은 더 바짝 붙어 앉는다.
  const ergoPad = Math.max(...createConferenceErgoChair()
    .filter(p => p.kind === 'chairArmPad').map(p => p.y + p.h / 2));
  assert.ok(padTop < ergoPad, '팔걸이가 대회의실 의자보다 높다');
});

// ── C. 배치 동결 ────────────────────────────────────────────────────────────

test('⑬ 소형(10×3.4×8m) — 콘솔 4대 / 의자 12석, 좌표 그대로', () => {
  const { chairs, consoles } = control(10000, 8000, 3400);
  assert.equal(consoles.length, 4);
  assert.equal(chairs.length, 12);
  assert.deepEqual(consoles.map(c => [c.x, c.z]),
    [[2000, 4050], [4000, 4050], [6000, 4050], [8000, 4050]].map(([x]) => [x, 3050]));
  assert.deepEqual(chairs.slice(0, 4).map(c => [c.x, c.z]),
    [[2000, 4050], [4000, 4050], [6000, 4050], [8000, 4050]]);
  for (const c of chairs) assert.equal(c.y || 0, 0, '단이 없는 방인데 의자가 떴다');
});

test('⑭ 중형(12×3.6×10m) — 콘솔 4대 / 의자 12석', () => {
  const { chairs, consoles } = control(12000, 10000, 3600);
  assert.equal(consoles.length, 4);
  assert.equal(chairs.length, 12);
  assert.deepEqual(chairs.slice(0, 4).map(c => c.x), [3000, 5000, 7000, 9000]);
});

test('⑮ 대형(16×3.9×14m) — 콘솔 8대 / 의자 16석', () => {
  const { chairs, consoles } = control(16000, 14000, 3900);
  assert.equal(consoles.length, 8);
  assert.equal(chairs.length, 16);
  assert.deepEqual([...new Set(consoles.map(c => c.z))], [3050, 5550]);
  assert.deepEqual([...new Set(chairs.map(c => c.z))].sort((a, b) => a - b), [4050, 6550, 12850]);
});

test('⑯ 단이 있는 방 — 의자 y 가 배치가 준 값 그대로다(두 번 더하지 않는다)', () => {
  for (const tiers of [1, 2, 3]) {
    const { chairs, consoles } = control(16000, 14000, 3900, { tiers });
    const chairY = [...new Set(chairs.map(c => c.y || 0))].sort((a, b) => a - b);
    const consoleY = [...new Set(consoles.map(c => c.y || 0))].sort((a, b) => a - b);
    assert.deepEqual(chairY, tiers === 1 ? [0] : [0, 200], `tiers=${tiers}: 의자 높이`);
    assert.deepEqual(consoleY, chairY, `tiers=${tiers}: 의자가 콘솔과 다른 단에 앉았다`);
    // 자산 자체는 바닥이 0이므로, 화면 높이 = 배치 y + 0 이다.
    assert.equal(envelope(parts).bottom, 0);
  }
});

test('⑰ 배치 규칙이 그대로다 — 콘솔 크기·간격·뒤 테이블을 건드리지 않았다', () => {
  assert.equal(FURNITURE.consoleW, 1800);
  assert.equal(FURNITURE.consoleD, 900);
  assert.equal(FURNITURE.consolePitchZ, 2500);
  const { consoles, tables } = control(16000, 14000, 3900);
  for (const c of consoles) {
    assert.equal(c.w, 1800); assert.equal(c.d, 900); assert.equal(c.rotY, 0);
  }
  assert.equal(tables.length, 1, '뒤 테이블이 사라졌거나 늘었다');
  assert.equal(tables[0].w, 6000);
  assert.equal(tables[0].d, 1200);
  assert.equal(tables[0].z, 11600);
});

test('⑱ 겹침이 없다 — 콘솔·이웃 의자·뒤 테이블·벽', () => {
  const fp = C.footprint;                       // 계약 발자국(선언 봉투보다 크다 = 보수적)
  for (const [W, D2, H, ov] of [[10000, 8000, 3400, {}], [12000, 10000, 3600, {}],
    [16000, 14000, 3900, {}], [16000, 14000, 3900, { tiers: 2 }], [16000, 14000, 3900, { tiers: 3 }]]) {
    const { chairs, consoles, tables } = control(W, D2, H, ov);
    const boxes = chairs.map(c => rect(c.x, c.z, fp.w, fp.d, c.rotY));
    for (let i = 0; i < boxes.length; i++) {
      for (const c of consoles) {
        assert.ok(gap(boxes[i], rect(c.x, c.z, c.w, c.d, c.rotY)) > 0, `${W}×${D2}: 의자가 콘솔과 겹친다`);
      }
      for (let j = i + 1; j < boxes.length; j++) {
        assert.ok(gap(boxes[i], boxes[j]) > 0, `${W}×${D2}: 의자끼리 겹친다`);
      }
      for (const t of tables) {
        assert.ok(gap(boxes[i], rect(t.x, t.z, t.w, t.d, t.rotY)) > 0, `${W}×${D2}: 의자가 뒤 테이블과 겹친다`);
      }
      assert.ok(boxes[i].x0 > 0 && boxes[i].z0 > 0 && boxes[i].x1 < W && boxes[i].z1 < D2,
        `${W}×${D2}: 의자가 벽을 뚫었다`);
    }
  }
});

// ── D. 성능·재질 ────────────────────────────────────────────────────────────

test('⑲ 인스턴싱 — 의자가 몇 석이든 부품 종류 수만큼만 묶인다', () => {
  const p1 = assetParts({ type: 'chair', asset: 'taskChair' });
  const p2 = assetParts({ type: 'chair', asset: 'taskChair' });
  assert.deepEqual(p1, p2, '같은 자산인데 부품 목록이 다르다');
  const keys = [12, 16, 24, 40].map(() => assetKey({ type: 'chair', asset: 'taskChair' }));
  assert.equal(new Set(keys).size, 1, '좌석 수에 따라 묶음 열쇠가 갈렸다');
  assert.equal(FURNITURE_ASSETS.taskChair.sized, false, '크기가 열쇠에 섞이면 묶음이 쪼개진다');
  // 부품 종류 = InstancedMesh 덩어리 수. 넷 중 가장 적어야 한다.
  assert.equal(parts.length, 10);
  assert.equal(kinds.length, 6, `부품 종류 ${kinds}`);
});

test('⑳ 정식 재질 13종 그대로 — 새 부품 이름도, 새 재질도 만들지 않았다', () => {
  assert.equal(MATERIAL_IDS.length, 13, `정식 재질이 ${MATERIAL_IDS.length}종이 됐다`);
  for (const k of kinds) {
    assert.ok(PART_FINISH[k], `${k}: 마감표에 없는 부품 이름을 새로 만들었다`);
    assert.ok(finishForPart(k), `${k}: 마감이 풀리지 않는다`);
    assert.equal(finishPartFor('taskChair', k), k, `${k}: 계약 마감이 자기 이름을 가리키지 않는다`);
  }
  // 계약이 적은 6종이 곧 도형이 쓰는 이름의 상위집합이다(빠뜨린 부품이 없게).
  for (const k of kinds) assert.ok(C.parts.includes(k), `${k}: 계약에 없는 부품`);
});

// ── E. 범위 ─────────────────────────────────────────────────────────────────

test('㉑ 상황실은 **의자만** 정했다 — 콘솔·AV·마감·조명·화각은 그대로 planned 다', () => {
  const d = ROOM_DESIGNS.controlRoom;
  assert.equal(d.status, 'planned', '릴리스 판정은 PHASE 5-e 의 몫이다');
  assert.ok(isPlanned(d.furniture.console), '곡선 콘솔을 건드렸다 (PHASE 5-b)');
  for (const a of d.furniture.av) assert.ok(isPlanned(a), '콘솔 AV 를 건드렸다 (PHASE 5-c)');
  assert.ok(isPlanned(d.palette), '마감을 건드렸다 (PHASE 5-d.1)');
  for (const m of Object.values(d.materials)) assert.ok(isPlanned(m));
  assert.ok(isPlanned(d.wallTreatment), '벽 구성을 건드렸다 (PHASE 5-d.2)');
  assert.ok(isPlanned(d.lighting), '조명을 건드렸다 (PHASE 5-d.3)');
  assert.ok(isPlanned(d.camera), '화각을 건드렸다 (PHASE 5-d.4)');
  assert.ok(isPlanned(d.accessories));
  for (const id of ['curvedConsole', 'consoleMonitor', 'keyboard']) {
    assert.equal(FURNITURE_CONTRACTS[id].status, CONTRACT_STATUS.CONTRACT_READY, id);
    assert.equal(hasRuntimeFurnitureAsset(id), false, `${id}: 이번 단계에서 만들었다`);
  }
});

test('㉒ 상황실 디자인 선택칸을 새로 노출하지 않았다 — 디자인은 여전히 1종이다', () => {
  assert.deepEqual(designsFor('control').map(d => d.id), ['controlRoom']);
  // 생산 경로: roomType=control 이면 저장값이 무엇이든 controlRoom 으로 떨어진다.
  for (const saved of [undefined, null, '', '없는디자인', 'corporateMeeting', 'largeConference']) {
    assert.equal(normalizeDesign(saved, 'control'), 'controlRoom', `저장값 ${String(saved)}`);
  }
  assert.equal(normalizeDesign('controlRoom', 'control'), 'controlRoom');
});

test('㉓ 앞선 세 공간의 의자가 그대로다 — 동결 확인', () => {
  for (const [design, want] of [['corporateMeeting', 'corporateChair'],
    ['executiveBoardroom', 'executiveChair'], ['largeConference', 'conferenceErgoChair']]) {
    const r = resolveFurnitureForDesign({ type: 'chair' }, design);
    assert.equal(r.runtimeAsset, want, `${design}: 의자가 바뀌었다`);
    assert.equal(r.fallbackUsed, false);
  }
  // 도형 자체도 그대로다(부품 수·좌석고).
  assert.equal(createCorporateChair().length, 12);
  assert.equal(createExecutiveChair().length, 12);
  assert.equal(createConferenceErgoChair().length, 13);
  assert.equal(createConferenceChair().length, 9);
  for (const [fn, y] of [[createCorporateChair, 450], [createExecutiveChair, 460],
    [createConferenceErgoChair, 450]]) {
    const s = fn().find(p => p.kind === 'chairCushion');
    assert.equal(s.y + s.h / 2, y);
  }
});

test('㉔ 다른 공간의 배치는 손대지 않았다 — 의자 자산도 그대로다', () => {
  for (const [type, room] of [['meeting', 'meeting'], ['classroom', 'classroom'],
    ['hall_m', 'hall_m'], ['ideation', 'ideation']]) {
    const res = layoutRoom(room, defaultOptions(room), { W: 12000, D: 10000, H: 3600 });
    for (const it of res.items.filter(i => i.type === 'chair' || i.type === 'seat')) {
      assert.notEqual(assetFor(it), 'taskChair', `${type}: 운용자 의자가 새어 들어갔다`);
    }
  }
  // 이름을 주지 않은 의자는 여전히 기존 회의용 의자다.
  assert.equal(assetFor({ type: 'chair' }), 'conferenceChair');
});
