// executive-camera.test.js — 임원 회의실 화각·구도 회귀 테스트. (PHASE 3-d.2)
// ─────────────────────────────────────────────────────────────────────────────
// 이 단계가 고친 것은 **화면의 세로 여유를 어디로 흘리는가**다.
//   고치기 전: 뒷벽에서 정면 벽을 보면 세로로 6m가 담기는데 방 높이는 3.8m다.
//     남는 2m가 전부 **위(빈 하늘)** 로 새서 화면 위쪽 80%가 비고 테이블은 0%였다.
//   고친 뒤: 화면 위 가장자리를 천장선에 맞춰 그 여유를 **아래(바닥·테이블)** 로 보낸다.
// 여기서 지키는 것.
//   ① 임원 방만 임원 계열 화각을 쓰는가(대기업으로 새지 않는가).
//   ② 사람 눈높이·광각 금지·시선이 눈높이보다 낮다(조작기가 카메라를 끌어올리지 못하게).
//   ③ 방 크기가 달라져도 규칙이 유지되는가.
//   ④ 이번 단계가 **화각 단계**로 남는가 — 조명·재질·형상을 건드리지 않았는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXECUTIVE_CAMERA_PRESETS, EXECUTIVE_FOV_RANGE, EXECUTIVE_CAMERA_PLANS,
  CORPORATE_CAMERA_PRESETS, CORPORATE_FOV_RANGE, CAMERA_PLANS, EYE_RANGE, WALL_MARGIN,
  POLAR_GAP_PER_DIST, eyeAboveTargetFor,
  executiveCameraPlan, executiveCameraPlanId, executiveCameraPresets,
  corporateCameraPlan, corporateCameraPlanId, corporateCameraPresets, cameraPlanForDesign,
} from '../src/design-camera.js';
import { buildGLModel, CAMERA_PRESETS } from '../src/gl-model.js';
import { ROOM_DESIGNS, DESIGN_IDS } from '../src/room-design.js';
import { LIGHTING_PRESETS, lightingForDesign } from '../src/design-lighting.js';
import { DESIGN_PALETTES, roomFinishForDesign, tablePartFinishForDesign } from '../src/design-finish.js';
import { createExecutiveChair, createBoardroomTable } from '../src/furniture-assets.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';

const EX = 'executiveBoardroom';
const CO = 'corporateMeeting';
const DEG = Math.PI / 180;
const camSrc = readFileSync(new URL('../src/design-camera.js', import.meta.url), 'utf8');

/** 오너 지침 §18 — 소·중·대 세 가지 방으로 검증한다. */
const ROOMS = Object.freeze([
  ['소형', 8000, 3200, 7000, 3840],
  ['중형', 11000, 3800, 9000, 5760],
  ['대형', 14000, 4000, 12000, 5760],
]);

function modelFor(W, H, D, ledW = 5760) {
  const items = layoutRoom('meeting',
    { ...defaultOptions('meeting'), tableShape: 'u', seats: 14, ledBottom: 1000 }, { W, D }).items;
  return buildGLModel({
    space: { W, H, D },
    led: { w: ledW, h: 2160, marginW: (W - ledW) / 2, mount: 1000, cols: 4, rows: 4, depth: 79.5 },
    items, design: EX, roomType: 'meeting',
  });
}
const plansFor = (m, aspect = 1500 / 950) => Object.fromEntries(
  EXECUTIVE_CAMERA_PRESETS.map(p => [p, executiveCameraPlan(m.room, m.led, p, aspect, m.table)]));

// ── A. 어느 공간이 어느 계열을 쓰는가 ───────────────────────────────────────

test('① 임원 회의실만 임원 계열 화각을 쓴다', () => {
  assert.equal(ROOM_DESIGNS[EX].camera, 'executiveProposal');
  for (const pre of EXECUTIVE_CAMERA_PRESETS) {
    assert.equal(executiveCameraPlanId(EX, pre), pre, pre);
    // 대기업 계열로는 절대 풀리지 않는다 — 두 계열이 섞이면 한쪽을 고칠 때 다른 쪽이 흔들린다.
    assert.equal(corporateCameraPlanId(EX, pre), null, `임원이 대기업 계열로 풀렸다: ${pre}`);
  }
  assert.deepEqual([...executiveCameraPresets(EX)], [...EXECUTIVE_CAMERA_PRESETS]);
  for (const id of DESIGN_IDS) {
    if (id === EX) continue;
    assert.deepEqual([...executiveCameraPresets(id)], [], `${id} 에 임원 화각이 붙었다`);
  }
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(executiveCameraPlanId(id, 'interior'), null, String(id));
  }
});

test('② 대기업 화각은 한 값도 바뀌지 않았다', () => {
  assert.equal(ROOM_DESIGNS[CO].camera, 'corporateProposal');
  assert.deepEqual({ ...CAMERA_PLANS.interior }, { eye: 1.65, fov: 41, rearRatio: 0.06, drop: 0.35, xRatio: 0.50 });
  assert.deepEqual({ ...CAMERA_PLANS['corner-l'] }, { eye: 1.75, fov: 44, rearRatio: 0.07, drop: 0.30, xRatio: 0.18 });
  assert.deepEqual({ ...CAMERA_PLANS['corner-r'] }, { eye: 1.75, fov: 44, rearRatio: 0.07, drop: 0.30, xRatio: 0.82 });
  assert.deepEqual({ ...CAMERA_PLANS.rear }, { eye: 1.58, fov: 39, rearRatio: 0.045, drop: 0.30, xRatio: 0.50 });
  assert.deepEqual({ ...CORPORATE_FOV_RANGE }, { min: 36, max: 46 });
  assert.deepEqual([...CORPORATE_CAMERA_PRESETS], ['interior', 'corner-l', 'corner-r', 'rear']);
  // 대기업 계산 결과 자체를 기준값으로 고정한다(임원 작업이 공용 계산기를 건드렸는지 잡는다).
  const m = buildGLModel({
    space: { W: 10000, H: 3500, D: 8500 },
    led: { w: 4800, h: 2160, marginW: 2600, mount: 1000, cols: 4, rows: 4, depth: 79.5 },
    items: [], design: CO, roomType: 'meeting',
  });
  const p = corporateCameraPlan(m.room, m.led, 'interior', 1500 / 950);
  assert.deepEqual({ pos: p.position.map(v => +v.toFixed(4)), tgt: p.target.map(v => +v.toFixed(4)), fov: p.fov },
    { pos: [5, 1.65, 7.99], tgt: [5, 1.4522, 0.0795], fov: 41 });
});

// ── B. 임원 화각의 성격 ─────────────────────────────────────────────────────

test('③ 사람 눈높이 — 실내 1.58~1.68m, 코너 1.65~1.80m(오너 지침 §6·§15)', () => {
  assert.ok(EXECUTIVE_CAMERA_PLANS.interior.eye >= 1.58 && EXECUTIVE_CAMERA_PLANS.interior.eye <= 1.68);
  assert.ok(EXECUTIVE_CAMERA_PLANS.rear.eye >= 1.58 && EXECUTIVE_CAMERA_PLANS.rear.eye <= 1.64);
  for (const p of ['corner-l', 'corner-r']) {
    assert.ok(EXECUTIVE_CAMERA_PLANS[p].eye >= 1.65 && EXECUTIVE_CAMERA_PLANS[p].eye <= 1.80, p);
  }
  // 실제 계산 결과도 눈높이 범위 안이다(방이 낮아도 천장을 뚫지 않는다).
  for (const [name, ...dims] of ROOMS) {
    const plans = plansFor(modelFor(...dims));
    for (const [pre, p] of Object.entries(plans)) {
      assert.ok(p.eye >= EYE_RANGE.min && p.eye <= 1.80, `${name}/${pre}: 눈높이 ${p.eye}`);
      assert.ok(p.position[1] <= dims[1] / 1000 - WALL_MARGIN, `${name}/${pre}: 천장을 뚫었다`);
    }
  }
});

test('④ 광각 금지 — 임원 화각은 언제나 44° 이하다(대기업 46°보다 엄격하다)', () => {
  assert.deepEqual({ ...EXECUTIVE_FOV_RANGE }, { min: 36, max: 44 });
  assert.ok(EXECUTIVE_FOV_RANGE.max < CORPORATE_FOV_RANGE.max, '임원이 대기업보다 넓다');
  for (const p of Object.values(EXECUTIVE_CAMERA_PLANS)) {
    assert.ok(p.fov >= 36 && p.fov <= 43, `기준 화각 ${p.fov} 가 권장 범위 밖`);
  }
  // 아주 넓은 LED·좁은 화면에서도 상한을 넘지 않는다.
  for (const [name, W, H, D] of ROOMS) {
    for (const ledW of [3840, 5760, Math.min(W - 800, 11520)]) {
      const m = modelFor(W, H, D, ledW);
      for (const aspect of [0.85, 1.24, 4 / 3, 16 / 9, 21 / 9]) {
        for (const [pre, p] of Object.entries(plansFor(m, aspect))) {
          assert.ok(p.fov <= EXECUTIVE_FOV_RANGE.max + 1e-9,
            `${name}/${pre}/LED${ledW}/aspect${aspect.toFixed(2)}: 화각 ${p.fov}`);
        }
      }
    }
  }
});

test('⑤ 시선은 언제나 눈높이보다 낮다 — 조작기가 카메라를 끌어올리지 못하게', () => {
  assert.ok(POLAR_GAP_PER_DIST > Math.tan(0.02), '조작기의 극각 한계보다 여유가 커야 한다');
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    for (const aspect of [0.85, 1.24, 16 / 9, 21 / 9]) {
      for (const [pre, p] of Object.entries(plansFor(m, aspect))) {
        const gap = p.position[1] - p.target[1];
        const dist = Math.hypot(p.position[0] - p.target[0], p.position[2] - p.target[2]);
        assert.ok(gap > 0, `${name}/${pre}: 위를 보고 있다`);
        assert.ok(gap >= dist * Math.tan(0.02) - 1e-9,
          `${name}/${pre}: 높이차 ${gap.toFixed(3)} 가 거리 ${dist.toFixed(1)}m 에 비해 부족하다`);
        assert.ok(gap >= eyeAboveTargetFor(dist) - 1e-6 || gap > 0.05, `${name}/${pre}`);
      }
    }
  }
});

test('⑥ 카메라와 시선이 **방 안**에 있다', () => {
  for (const [name, W, H, D, ledW] of ROOMS) {
    const m = modelFor(W, H, D, ledW);
    for (const [pre, p] of Object.entries(plansFor(m))) {
      for (const [v, lim, ax] of [[p.position[0], m.room.W, 'x'], [p.position[2], m.room.D, 'z']]) {
        assert.ok(v >= WALL_MARGIN - 1e-9 && v <= lim - WALL_MARGIN + 1e-9, `${name}/${pre}: 카메라 ${ax}=${v}`);
      }
      assert.ok(p.target[1] >= WALL_MARGIN - 1e-9 && p.target[1] <= m.room.H - WALL_MARGIN,
        `${name}/${pre}: 시선 높이 ${p.target[1]}`);
      assert.ok(p.target[0] >= 0 && p.target[0] <= m.room.W, `${name}/${pre}: 시선 x`);
      assert.ok(p.target[2] >= 0 && p.target[2] <= m.room.D, `${name}/${pre}: 시선 z`);
      // 뒷벽 안쪽 — 카메라는 방 뒤쪽 절반에 선다.
      assert.ok(p.position[2] > m.room.D * 0.5, `${name}/${pre}: 카메라가 방 앞쪽으로 나왔다`);
    }
  }
});

// ── C. 무엇이 화면에 담기는가 ───────────────────────────────────────────────

test('⑦ LED — 세 방·여러 화면비에서 전부 화면 안에 들어온다', () => {
  for (const [name, W, H, D] of ROOMS) {
    for (const ledW of [3840, 5760]) {
      const m = modelFor(W, H, D, ledW);
      for (const aspect of [1.24, 4 / 3, 16 / 9, 21 / 9]) {
        for (const [pre, p] of Object.entries(plansFor(m, aspect))) {
          assert.equal(p.ledFullyVisible, true, `${name}/${pre}/LED${ledW}/aspect${aspect.toFixed(2)}`);
          assert.ok(p.ledTopMargin > 0, `${name}/${pre}: LED 윗변이 잘렸다`);
          assert.ok(p.ledSideMargin > 0, `${name}/${pre}: LED 좌우가 잘렸다`);
        }
      }
    }
  }
});

test('⑧ 아주 넓은 LED + 아주 좁은 화면 — 못 담으면 **조용히 넓히지 않고 말한다**', () => {
  const m = modelFor(11000, 3800, 9000, 10200);
  const p = executiveCameraPlan(m.room, m.led, 'interior', 0.6, m.table);
  assert.ok(p.fov <= EXECUTIVE_FOV_RANGE.max + 1e-9, '상한을 넘겨 억지로 담았다');
  if (!p.ledFullyVisible) assert.equal(p.fovCapped, true, '못 담았는데 화각 상한에 걸리지 않았다');
  // 담을 수 있으면 담는다 — 넉넉한 화면비에서는 전부 보인다.
  assert.equal(executiveCameraPlan(m.room, m.led, 'interior', 21 / 9, m.table).ledFullyVisible, true);
});

test('⑨ U 테이블 — 화면 아래로 잘려 사라지지 않는다(이 단계의 핵심 지표)', () => {
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    assert.ok(m.table, `${name}: 테이블 발자국이 없다`);
    for (const [pre, p] of Object.entries(plansFor(m))) {
      assert.equal(p.tableVisible, true, `${name}/${pre}: 테이블이 화면에 남지 않는다`);
      assert.ok(p.tableDepthVisible >= 0.3,
        `${name}/${pre}: 테이블 깊이의 ${(p.tableDepthVisible * 100).toFixed(0)}% 만 남는다`);
      assert.ok(p.floorNearDist > 0 && p.floorNearDist < 12, `${name}/${pre}: 바닥 근접거리 ${p.floorNearDist}`);
    }
  }
});

test('⑩ 테이블 발자국을 모르면 **모른다고 답한다**(가짜 스펙 금지)', () => {
  const m = modelFor(11000, 3800, 9000);
  const p = executiveCameraPlan(m.room, m.led, 'interior', 1.6, null);
  assert.equal(p.tableVisible, null);
  assert.equal(p.tableDepthVisible, null);
  assert.equal(p.floorNearDist, null);
  // 대기업 계열은 애초에 테이블 발자국을 받지 않는다(기존 동작 그대로).
  assert.equal(corporateCameraPlan(m.room, m.led, 'interior', 1.6).tableVisible, null);
});

test('⑪ 세로 여유를 **아래로** 보낸다 — 화면 위 가장자리가 천장선 근처다', () => {
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    for (const pre of ['interior', 'rear']) {
      const p = executiveCameraPlan(m.room, m.led, pre, 1500 / 950, m.table);
      const dz = p.position[2] - m.led.depth;
      const halfV = p.fov * DEG / 2;
      const down = Math.atan((p.position[1] - p.target[1]) / dz);
      const topAtWall = p.position[1] + dz * Math.tan(halfV - down);
      // 천장선보다 크게 위로 새지 않는다 — 위로 새면 그만큼 빈 하늘이 된다.
      assert.ok(topAtWall <= m.room.H * 1.30,
        `${name}/${pre}: 화면 위 가장자리가 ${topAtWall.toFixed(2)}m — 방 높이 ${m.room.H}m 를 크게 넘는다`);
      // 그렇다고 LED 윗변을 자르지도 않는다.
      assert.ok(topAtWall >= m.led.y + m.led.h, `${name}/${pre}: LED 윗변을 잘랐다`);
    }
  }
});

test('⑫ 코너 — 아이소처럼 올라가지 않고, 시선을 카메라 쪽으로 당겨 가까운 날개를 남긴다', () => {
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    const l = executiveCameraPlan(m.room, m.led, 'corner-l', 1500 / 950, m.table);
    const r = executiveCameraPlan(m.room, m.led, 'corner-r', 1500 / 950, m.table);
    // 좌우 대칭이다.
    assert.ok(Math.abs((l.position[0] - 0) - (m.room.W - r.position[0])) < 1e-9, `${name}: 코너가 대칭이 아니다`);
    assert.ok(Math.abs(l.position[1] - r.position[1]) < 1e-9);
    assert.ok(Math.abs(l.fov - r.fov) < 1e-9);
    // 눈높이지 아이소가 아니다 — 방 높이의 절반을 넘지 않는다.
    assert.ok(l.position[1] < m.room.H * 0.6, `${name}: 코너가 아이소처럼 올라갔다`);
    // 시선 x 가 카메라와 방 중앙 **사이**에 있다(정반대 벽을 보면 가까운 날개가 프레임 밖으로 나간다).
    assert.ok(l.target[0] > l.position[0] && l.target[0] < m.room.W * 0.5 + 1e-9, `${name}: 좌코너 시선 x`);
    assert.ok(r.target[0] < r.position[0] && r.target[0] > m.room.W * 0.5 - 1e-9, `${name}: 우코너 시선 x`);
  }
});

// ── D. 동결 검증 ────────────────────────────────────────────────────────────

test('⑬ 아이소·평면도·정면은 건드리지 않았다', () => {
  // 화면 프리셋 목록 자체가 그대로다(새 버튼을 만들지 않았다 — 오너 지침 §14).
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id),
    ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top']);
  // 계획기는 실내·코너·후방 네 가지만 다룬다. 아이소·평면도·정면은 언제나 null이다.
  for (const pre of ['iso', 'top', 'front', '없는시점']) {
    assert.equal(executiveCameraPlanId(EX, pre), null, pre);
    const m = modelFor(11000, 3800, 9000);
    assert.equal(cameraPlanForDesign(EX, pre, m, 1.6), null, pre);
  }
  assert.deepEqual([...EXECUTIVE_CAMERA_PRESETS], ['interior', 'corner-l', 'corner-r', 'rear']);
});

test('⑭ 조명 동결 — PHASE 3-d.1 결과가 한 값도 안 바뀐다', () => {
  const P = LIGHTING_PRESETS.executiveSoft;
  assert.deepEqual({ ...P.scale }, { hemi: 1.05, ceiling: 0.30, key: 1.00, fill: 2.00, ledSpill: 1.00 });
  assert.deepEqual({ ...P.shadow }, { radius: 10, bias: -0.00035, normalBias: 0.032 });
  assert.equal(P.keyPos, undefined);
  assert.equal(lightingForDesign(EX), P);
  assert.deepEqual({ ...LIGHTING_PRESETS.corporateSoft.scale },
    { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 });
});

test('⑮ 재질 동결 — PHASE 3-c 팔레트가 한 값도 안 바뀐다', () => {
  assert.deepEqual({ ...DESIGN_PALETTES.executiveBright }, {
    id: 'executiveBright', label: '임원 밝은 프리미엄 마감',
    floor: '#c3c1bc', wallFront: '#f4f1ec', wallSide: '#eeeae3', wallAccent: '#e3ded4',
    baseboard: '#e2ddd3', boardroomTop: '#dbcdb6', boardroomBase: '#34383e',
    credenzaBody: '#33373d', credenzaDoor: '#2c3036', credenzaTop: '#3d424a', credenzaToe: '#1e2126',
    rug: '#c7c5bf',
  });
  assert.equal(roomFinishForDesign(EX).wallAccent.canonical, 'acousticPanel');
  assert.equal(tablePartFinishForDesign(EX).boardroomTop.canonical, 'woodTable');
  assert.equal(DESIGN_PALETTES.corporateNeutral.floor, '#b9bab8');
});

test('⑯ 형상·배치 동결 — 의자·U 테이블 치수가 그대로다', () => {
  assert.equal(createExecutiveChair().length, 12);
  const m = modelFor(11000, 3800, 9000);
  const tables = m.items.filter(i => i.type === 'table');
  const S = createBoardroomTable(tables);
  assert.deepEqual({
    outerW: S.outerW, outerD: S.outerD, segW: S.segW, frontR: S.frontR, rearR: S.rearR,
    innerR: S.innerR, surfaceY: S.surfaceY, topThk: S.topThk, supports: S.supports.length,
  }, {
    outerW: 8100, outerD: 4500, segW: 900, frontR: 450, rearR: 162, innerR: 300,
    surfaceY: 745, topThk: 30, supports: 7,
  });
  // 테이블 발자국은 **배치 값을 읽기만 한다** — 새로 계산하지 않는다.
  assert.deepEqual({ ...m.table }, { x0: 1.45, x1: 9.55, z0: 2.75, z1: 7.25 });
  assert.equal(m.items.filter(i => i.type === 'chair').length, 14);
});

// ── E. 순수성 ───────────────────────────────────────────────────────────────

test('⑰ 순수 유지 — 계획기는 Three.js·DOM·조작기를 부르지 않는다', () => {
  const code = camSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/from\s+['"].*three/i.test(code), false, 'Three.js 를 불러왔다');
  assert.equal(/\bdocument\.|\bwindow\.|OrbitControls/.test(code), false, 'DOM·조작기를 만졌다');
  // 공식은 한 곳에만 있다 — 두 계열이 같은 계산기를 쓴다.
  assert.equal((code.match(/function planCamera\(/g) || []).length, 1);
  // 결과는 얼어 있고, 같은 입력이면 같은 결과다.
  const m = modelFor(11000, 3800, 9000);
  const p = executiveCameraPlan(m.room, m.led, 'interior', 1.6, m.table);
  assert.ok(Object.isFrozen(p));
  assert.deepEqual(p, executiveCameraPlan(m.room, m.led, 'interior', 1.6, m.table));
  // 모르는 시점·빈 입력은 null(= 기존 계산 그대로).
  assert.equal(executiveCameraPlan(m.room, m.led, '없는시점', 1.6, m.table), null);
  assert.equal(executiveCameraPlan(null, m.led, 'interior', 1.6, m.table), null);
  assert.equal(executiveCameraPlan(m.room, null, 'interior', 1.6, m.table), null);
});

test('⑱ 기준 수치 고정 — 중형 방(11 × 3.8 × 9m, 와이드 LED)의 임원 카메라', () => {
  const m = modelFor(11000, 3800, 9000);
  const r = Object.fromEntries(Object.entries(plansFor(m)).map(([k, p]) => [k, {
    pos: p.position.map(v => +v.toFixed(3)), tgt: p.target.map(v => +v.toFixed(3)), fov: p.fov,
    led: p.ledFullyVisible, table: p.tableVisible,
  }]));
  assert.deepEqual(r, {
    interior: { pos: [5.5, 1.6, 8.64], tgt: [5.5, 0.763, 0.08], fov: 40, led: true, table: true },
    'corner-l': { pos: [1.1, 1.76, 8.37], tgt: [4.4, 0.988, 1.98], fov: 43, led: true, table: true },
    'corner-r': { pos: [9.9, 1.76, 8.37], tgt: [6.6, 0.988, 1.98], fov: 43, led: true, table: true },
    rear: { pos: [5.5, 1.6, 8.595], tgt: [5.5, 0.928, 0.08], fov: 38, led: true, table: true },
  });
});
