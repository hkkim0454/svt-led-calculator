// executive-chair.test.js — 임원 회의용 하이백 의자 회귀 테스트. (PHASE 3-a)
// 두 가지를 지킨다.
//   ① 임원 의자가 **계약대로** 만들어졌고 회의용 의자와 **실루엣으로 갈리는가.**
//   ② 승인된 대기업 회의실 기준선이 **한 값도 안 흔들렸는가** — 이쪽이 더 중요하다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, DIMS, assetFor, assetKey, assetParts,
  createExecutiveChair, createCorporateChair, createConferenceChair, BOAT_BULGE_RATIO,
  createCorporateTable,
} from '../src/furniture-assets.js';
import {
  FURNITURE_CONTRACTS, CONTRACT_STATUS, furnitureContract, hasFurnitureContract,
} from '../src/furniture-contracts.js';
import {
  resolveFurnitureForDesign, requestedFurnitureForDesign, hasRuntimeFurnitureAsset, RUNTIME_CATEGORY,
} from '../src/furniture-routing.js';
import { ROOM_DESIGNS, DESIGN_IDS } from '../src/room-design.js';
import { PART_FINISH, PART_FINISH_ALIASES, finishForPart, MATERIAL_IDS } from '../src/materials.js';
import { MODELS } from '../src/models.js';
import { computeConfig } from '../src/engine.js';

// 부품이 차지하는 공간 — 기울어진 부품은 회전 후 크기로 잰다.
const extentOf = parts => {
  let ylo = 1e9, yhi = -1e9, zlo = 1e9, zhi = -1e9, xw = 0;
  for (const p of parts) {
    const a = Math.abs((p.tiltX || 0) * Math.PI / 180);
    const d0 = p.shape === 'cyl' ? p.r * 2 : p.shape === 'sph' ? p.r * 2 : p.d;
    const h = p.shape === 'sph' ? p.r * 2 : p.h;
    const hh = (h * Math.cos(a) + d0 * Math.sin(a)) / 2;
    const dd = (d0 * Math.cos(a) + h * Math.sin(a)) / 2;
    ylo = Math.min(ylo, p.y - hh); yhi = Math.max(yhi, p.y + hh);
    zlo = Math.min(zlo, p.dz - dd); zhi = Math.max(zhi, p.dz + dd);
    xw = Math.max(xw, Math.abs(p.dx) + (p.shape === 'cyl' || p.shape === 'sph' ? p.r : p.w / 2));
  }
  return { bottom: ylo, height: yhi, width: xw * 2, depth: zhi - zlo };
};

// ①② 런타임 등록 + 계약 상태
test('임원 의자 — 런타임 자산으로 등록되고 계약이 IMPLEMENTED 로 바뀌었다', () => {
  const a = FURNITURE_ASSETS.executiveChair;
  assert.ok(a, '런타임 자산이 없다');
  assert.equal(a.id, 'executiveChair');
  assert.equal(a.instanced, true, '반복 배치되므로 묶어 그려야 한다');
  assert.equal(a.sized, false, '의자는 크기가 하나뿐이다');
  assert.equal(typeof a.build, 'function');
  assert.equal(FURNITURE_CONTRACTS.executiveChair.status, CONTRACT_STATUS.IMPLEMENTED);
  // 계약과 런타임이 어긋나지 않는다 — 한쪽만 바뀌면 조용히 틀린다.
  for (const id of Object.keys(FURNITURE_CONTRACTS)) {
    const built = [CONTRACT_STATUS.EXISTING, CONTRACT_STATUS.IMPLEMENTED]
      .includes(FURNITURE_CONTRACTS[id].status);
    assert.equal(!!FURNITURE_ASSETS[id], built, `${id}: 계약 상태와 런타임 등록이 어긋난다`);
  }
});

// ③④⑤⑥ 치수가 계약과 일치
test('임원 의자 — 실제 도형이 계약 치수 안에 들어가고 바닥에 닿는다', () => {
  const C = FURNITURE_CONTRACTS.executiveChair.dimensions;
  // 치수를 두 번 적지 않았다 — 계약 객체를 그대로 읽는다.
  assert.deepEqual({ ...DIMS.executiveChair }, { ...C });
  const src = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');
  assert.match(src, /executiveChair: FURNITURE_CONTRACTS\.executiveChair\.dimensions/,
    '계약을 읽지 않고 숫자를 베껴 적었다');

  const e = extentOf(createExecutiveChair());
  assert.equal(C.seatTop, 460);
  assert.ok(Math.abs(e.height - C.overallH) <= 1, `전체 높이 ${e.height} ≠ 계약 ${C.overallH}`);
  assert.ok(e.width <= C.overallW, `폭 ${e.width} > 계약 ${C.overallW}`);
  assert.ok(e.depth <= C.overallD, `깊이 ${e.depth} > 계약 ${C.overallD}`);
  assert.ok(e.width >= C.overallW - 40, `폭 ${e.width} 가 계약보다 너무 작다`);
  // 발자국 — 계약이 적어 둔 값과 같은 기준이어야 한다.
  assert.deepEqual({ ...FURNITURE_CONTRACTS.executiveChair.footprint }, { w: 710, d: 720 });
  // 바닥에 닿고 뚫지 않는다.
  assert.ok(Math.abs(e.bottom) < 1, `바닥 접지 ${e.bottom}mm — 뜨거나 뚫렸다`);
  // 좌판 윗면이 정확히 계약 높이다.
  const seat = createExecutiveChair().find(p => p.kind === 'chairCushion');
  assert.equal(seat.y + seat.h / 2, C.seatTop, '좌판 윗면이 계약과 다르다');
  assert.equal(seat.w, C.seatW);
  assert.equal(seat.d, C.seatD);
});

// ⑦⑧ 헤드레스트 + 부품 semantic
test('임원 의자 — 헤드레스트가 있고 부품이 계약의 semantic 과 정확히 일치한다', () => {
  const parts = createExecutiveChair();
  const kinds = [...new Set(parts.map(p => p.kind))].sort();
  assert.deepEqual(kinds, [...FURNITURE_CONTRACTS.executiveChair.parts].sort(),
    '계약이 적은 부품과 실제 부품이 다르다');
  // 헤드레스트는 **반드시** 있다 — 회의용 의자와 가르는 핵심이다.
  const head = parts.filter(p => p.kind === 'chairHeadrest');
  assert.equal(head.length, 1, '헤드레스트가 하나여야 한다');
  const C = FURNITURE_CONTRACTS.executiveChair.dimensions;
  assert.equal(head[0].h, C.headrestH, '헤드레스트 높이는 계약이 정한다');
  // 등받이 어깨선보다 **좁고 얇다** — 게이밍 체어 베개가 되면 안 된다.
  const backTop = Math.max(...parts.filter(p => p.shape === 'taper').map(p => p.wTop));
  assert.ok(head[0].w < backTop, `헤드레스트 폭 ${head[0].w} 이 어깨 폭 ${backTop} 보다 넓다`);
  assert.ok(head[0].d <= 70, `헤드레스트 두께 ${head[0].d} — 자동차 헤드레스트처럼 두껍다`);
  assert.ok(head[0].sag > 0, '살짝 휘어야 목을 받치는 모양이 된다');
  // 5발 캐스터 받침 — 계약의 700mm.
  const star = parts.find(p => p.shape === 'star');
  assert.ok(star, '5발 받침이 없다');
  assert.equal(star.legs, 5);
  assert.equal(star.reach * 2, C.casterBase);
});

// ⑨⑩ 회의용 의자와의 차이
test('임원 의자 ≠ 회의용 의자 — 실루엣이 확실히 갈린다', () => {
  const E = extentOf(createExecutiveChair());
  const K = extentOf(createCorporateChair());
  assert.ok(E.height - K.height >= 150,
    `높이 차 ${(E.height - K.height).toFixed(1)}mm — 150mm 이상이어야 멀리서도 갈린다`);
  assert.ok(E.width >= K.width, `폭 ${E.width} < 회의용 ${K.width}`);
  assert.ok(E.depth >= K.depth, `깊이 ${E.depth} < 회의용 ${K.depth}`);
  // 헤드레스트는 임원 의자에만 있다.
  assert.ok(createExecutiveChair().some(p => p.kind === 'chairHeadrest'));
  assert.ok(!createCorporateChair().some(p => p.kind === 'chairHeadrest'),
    '회의용 의자에 헤드레스트가 생겼다 — 두 의자가 같아진다');
  // 등받이 구조 자체가 다르다 — 임원은 연속으로 좁아지는 판(taper), 회의용은 폭이 일정한 휜 판.
  assert.ok(createExecutiveChair().some(p => p.shape === 'taper'), '임원 등받이가 좁아지지 않는다');
  assert.ok(!createCorporateChair().some(p => p.shape === 'taper'),
    '회의용 의자 등받이 구조가 바뀌었다');
  // 자산 id·도형 생성 함수가 별개다.
  assert.notEqual(FURNITURE_ASSETS.executiveChair.id, FURNITURE_ASSETS.corporateChair.id);
  assert.notDeepEqual(createExecutiveChair(), createCorporateChair());
});

// 등받이 taper — 위로 갈수록 실제로 좁아지는가
test('임원 등받이 — 허리에서 어깨까지 연속으로 좁아진다(단이 지지 않는다)', () => {
  const tapers = createExecutiveChair().filter(p => p.shape === 'taper');
  assert.equal(tapers.length, 2, '테두리 + 메시 두 겹');
  for (const t of tapers) {
    assert.ok(t.wTop < t.wBottom, `위(${t.wTop})가 아래(${t.wBottom})보다 좁아야 한다`);
    const ratio = t.wTop / t.wBottom;
    assert.ok(ratio > 0.65 && ratio < 0.95, `좁아지는 비율 ${ratio.toFixed(2)} — 과하거나 미미하다`);
    assert.ok(t.thk > 0 && t.h > 0 && t.sag > 0);
  }
  // 메시는 테두리 안에 들어간다.
  const [frame, mesh] = tapers;
  assert.ok(mesh.wBottom < frame.wBottom && mesh.wTop < frame.wTop, '메시가 테두리보다 넓다');
  assert.ok(mesh.thk < frame.thk, '메시가 테두리보다 두껍다');
});

// ⑪⑫⑬ 라우터
test('라우터 — 임원 회의실은 임원 의자와 임원 U 테이블을 쓴다', () => {
  const chair = resolveFurnitureForDesign({ type: 'chair' }, 'executiveBoardroom');
  assert.equal(chair.requestedAsset, 'executiveChair');
  assert.equal(chair.runtimeAsset, 'executiveChair');
  assert.equal(chair.implemented, true);
  assert.equal(chair.fallbackUsed, false);
  assert.equal(chair.contractStatus, CONTRACT_STATUS.IMPLEMENTED);
  // 테이블은 PHASE 3-b 에서 만들었다 — 더 이상 대체품을 쓰지 않는다.
  const table = resolveFurnitureForDesign({ type: 'table' }, 'executiveBoardroom');
  assert.equal(table.requestedAsset, 'boardroomTable');
  assert.equal(table.implemented, true);
  assert.equal(table.fallbackUsed, false);
  assert.equal(table.runtimeAsset, 'boardroomTable');
  assert.equal(hasRuntimeFurnitureAsset('boardroomTable'), true);
  assert.equal(FURNITURE_CONTRACTS.boardroomTable.status, CONTRACT_STATUS.IMPLEMENTED);
  // 디자인 선언 — 의자·테이블 모두 맨 문자열이다(실제로 만들었다는 뜻).
  assert.equal(ROOM_DESIGNS.executiveBoardroom.furniture.chair, 'executiveChair');
  assert.equal(ROOM_DESIGNS.executiveBoardroom.furniture.table, 'boardroomTable');
  // 라우터 갈래 표에 한 줄만 늘었다(로직은 그대로).
  assert.equal(RUNTIME_CATEGORY.executiveChair, 'chair');
});

// ⑯ 다른 공간은 그대로
test('다른 공간 — 임원 의자가 새지 않는다', () => {
  for (const d of DESIGN_IDS) {
    if (d === 'executiveBoardroom') continue;
    const r = resolveFurnitureForDesign({ type: 'chair' }, d);
    assert.notEqual(r.runtimeAsset, 'executiveChair', `${d} 에 임원 의자가 들어갔다`);
  }
  // 디자인이 없는 공간(강의실·강당·아이디에이션)도 마찬가지다.
  for (const d of [null, undefined, '없는디자인']) {
    assert.equal(resolveFurnitureForDesign({ type: 'chair' }, d).runtimeAsset, 'conferenceChair');
    assert.equal(resolveFurnitureForDesign({ type: 'seat' }, d).runtimeAsset, 'auditoriumChair');
  }
  assert.equal(requestedFurnitureForDesign('corporateMeeting').chair, 'corporateChair');
});

// ⑭ 회의용 의자 완전 동결 — 이번 단계에서 가장 중요한 조건
test('대기업 회의 의자 동결 — 부품·치수·마감이 한 값도 안 바뀐다', () => {
  const parts = createCorporateChair();
  assert.equal(parts.length, 12);
  assert.deepEqual(parts.map(p => p.kind), [
    'chairCaster', 'chairColumn', 'chairFrame', 'chairCushion', 'chairFrame', 'chairFrame',
    'chairMesh', 'chairFrame', 'chairFrame', 'chairFrame', 'chairArmPad', 'chairArmPad',
  ]);
  const e = extentOf(parts);
  assert.ok(Math.abs(e.height - 1039.1) < 0.2, `전체 높이 ${e.height}`);
  assert.equal(e.width, 660);
  assert.ok(Math.abs(e.depth - 662.5) < 0.2, `깊이 ${e.depth}`);
  assert.equal(DIMS.corporateChair.seatTop, 450);
  assert.equal(DIMS.corporateChair.overallH, 1040);
  // 마감도 그대로 — 새 부품(헤드레스트)이 기존 마감을 건드리지 않았다.
  assert.deepEqual(Object.fromEntries(
    ['chairFrame', 'chairArmPad', 'chairCaster', 'chairColumn', 'chairMesh', 'chairCushion']
      .map(k => [k, [PART_FINISH[k].material, PART_FINISH[k].color]])), {
    chairFrame: ['darkGraphite', '#3a3e44'],
    chairArmPad: ['darkGraphite', '#33373d'],
    chairCaster: ['darkGraphite', '#2e3238'],
    chairColumn: ['darkGraphite', '#41464d'],
    chairMesh: ['fabricChair', '#454a51'],
    chairCushion: ['fabricChair', '#3d4147'],
  });
  // 대기업 테이블도 그대로.
  const t = createCorporateTable({ shape: 'boat', w: 4000, d: 1500 });
  assert.equal(t.surfaceY, 740);
  assert.equal(t.topThk, 25);
  assert.equal(BOAT_BULGE_RATIO, 0.08);
  // 기존 회의용 의자(다른 공간이 쓰는 것)도 그대로.
  assert.equal(createConferenceChair().length, 9);
  assert.equal(DIMS.conferenceChair.seatTop, 450);
});

// 재질 — 새 정식 재질을 만들지 않았다
test('재질 — 헤드레스트는 방석 마감을 그대로 쓰고, 정식 재질은 13종 그대로다', () => {
  assert.equal(MATERIAL_IDS.length, 13, '새 정식 재질을 만들면 안 된다');
  assert.equal(PART_FINISH.chairHeadrest, undefined, '헤드레스트용 마감을 새로 만들지 않았다');
  assert.equal(PART_FINISH_ALIASES.chairHeadrest, 'chairCushion');
  assert.deepEqual(finishForPart('chairHeadrest'), finishForPart('chairCushion'));
  // 계약도 같은 말을 한다 — 두 곳이 어긋나면 안 된다.
  assert.equal(FURNITURE_CONTRACTS.executiveChair.finishParts.chairHeadrest, 'chairCushion');
  // 임원 의자의 모든 부품에 마감이 있다(색 없는 부품이 남으면 회색으로 뜬다).
  for (const p of createExecutiveChair()) {
    assert.ok(finishForPart(p.kind)?.color, `${p.kind}: 마감이 없다`);
  }
});

// ⑰ 인스턴싱
test('인스턴싱 — 좌석 수가 늘어도 그리기 묶음은 부품 종류 수만큼이다', () => {
  assert.equal(assetFor({ type: 'chair', asset: 'executiveChair' }), 'executiveChair');
  // 자리마다 좌표가 달라도 **같은 묶음 열쇠**다 = 한 번에 그린다.
  assert.equal(assetKey({ type: 'chair', asset: 'executiveChair', x: 0, z: 0 }), 'executiveChair');
  assert.equal(assetKey({ type: 'chair', asset: 'executiveChair', x: 9, z: 7 }), 'executiveChair');
  assert.equal(assetParts({ type: 'chair', asset: 'executiveChair' }).length, 12);
  // 부품 종류 수 = InstancedMesh 수. 좌석 수와 무관하다.
  const kinds = new Set(createExecutiveChair().map(p => p.kind));
  assert.equal(kinds.size, 7);
  // 5발 받침은 조각 11개를 한 덩어리로 굽는다(따로 그리면 그리기 호출이 10 늘어난다).
  assert.equal(createExecutiveChair().filter(p => p.shape === 'star').length, 1);
});

// ⑱ 순수 계층
test('순수 계층 — 계약·라우터에 Three.js 도 DOM 도 없다', () => {
  for (const f of ['furniture-contracts.js', 'furniture-routing.js', 'furniture-assets.js', 'room-design.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/from ['"].*three/i.test(src), `${f} 가 Three.js 를 불러온다`);
    assert.ok(!/\bdocument\.|\bwindow\.|new THREE\./.test(src), `${f} 가 DOM 을 쓴다`);
  }
  // 새 도형(taper)은 어댑터가 실제로 불러 쓴다 — 빠뜨리면 등받이가 통째로 사라진다.
  const gl = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /part\.shape === 'taper'/);
  assert.match(gl, /geoCache\.taperedBack\(/);
  const geo = readFileSync(new URL('../src/geometry-gl.js', import.meta.url), 'utf8');
  assert.match(geo, /taperedBack\(wBottom, wTop, h, thk/);
  // 캐시 열쇠가 휜 판(arc)과 섞이지 않는다.
  const head = re => geo.match(re)[1].split('|')[0];
  assert.notEqual(head(/taperedBack\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/),
    head(/arc\([^)]*\)\s*\{[\s\S]*?const key = `([^`]+)`/));
});

// ⑲ 계산기 무변경
test('계산기 무변경 — 삼성 MP012F 기준값이 그대로다', () => {
  const MP012F = MODELS.find(m => m.id === 'MP012F');
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.resW, 4480);
  assert.equal(r.resH, 2160);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.heatMaxBTU - 20916) < 20);
});

// 어댑터가 **별칭 부품까지** 재질을 만드는가.
//   PART_FINISH 키만 돌면 헤드레스트는 재질이 없어 하얗게 뜬다(첫 검수에서 실제로 그랬다).
//   Three.js가 필요한 파일이라 Node 에서 실행할 수 없다 — 소스에서 대조한다.
test('어댑터 — 마감 별칭 부품도 재질을 받는다(헤드레스트가 하얗게 뜨지 않는다)', () => {
  const gl = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
  const code = gl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(code, /import\s*\{[^}]*\bPART_FINISH_ALIASES\b[^}]*\}\s*from/,
    'PART_FINISH_ALIASES 를 import 하지 않는다');
  assert.match(code, /Object\.keys\(PART_FINISH\)[\s\S]{0,60}Object\.keys\(PART_FINISH_ALIASES\)/,
    '마감 표만 돌고 별칭을 빠뜨렸다 — 그 부품은 재질 없이 하얗게 뜬다');
  // 임원 의자의 모든 부품 이름이 둘 중 한 곳에는 있어야 한다.
  const covered = new Set([...Object.keys(PART_FINISH), ...Object.keys(PART_FINISH_ALIASES)]);
  for (const p of createExecutiveChair()) {
    assert.ok(covered.has(p.kind), `${p.kind}: 마감 표에도 별칭에도 없다`);
  }
});
