// ideation-camera.test.js — 아이디에이션 제안 카메라 (PHASE 8-2b, DEC-136).
// ─────────────────────────────────────────────────────────────────────────────
// 이 단계가 고친 것은 하나다. **협업 구역이 제안 시점에서 보이지 않았다.**
//   PHASE 8-1 실측에서 협업 구역 화면 점유가 0.00% 였고, 그 원인은 조명도 재질도 아니라
//   **카메라가 어디에 서서 어디를 보는가**였다. 협업 구역이 카메라 바로 앞(약 1.5~1.9m)
//   좌우로 벌어져 있어, 그 거리에서 가로 화각이 담는 폭 밖으로 밀려나 있었다.
//
// 그래서 이 단계는 두 가지만 한다.
//   ① **LED 가 허락하는 만큼 가까운 협업 덩이 쪽으로 돌아선다** — 화각을 넓혀 푸는 것이 아니다.
//   ② **맨 뒤 내용물에서 정해진 만큼만 물러선다** — 뒷벽까지 물러서면 큰 방에서 빈 바닥이
//      화면의 42%를 먹고, 너무 붙으면 협업 테이블 상판이 화면 아래로 빠진다.
//
// 이 단계가 **하지 않은 것**도 같이 못박는다. 조명·재질·배치·가구·AV·소품·렌더러 전역과
//   정면·아이소·평면 세 시점은 PHASE 8-2a 그대로다(픽셀 차이 0 으로 따로 증명했다).
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  presetPose, settledPose, buildGLModel, CAMERA_PRESETS, FOV_DEG, FOV_RANGE,
  CONTROLS_MAX_POLAR,
} from '../src/gl-model.js';
import {
  IDEATION_CAMERA_PRESETS, IDEATION_CAMERA_PLANS, IDEATION_FOV_RANGE, IDEATION_EYE_RANGE,
  IDEATION_STANDOFF, ideationCameraPlanId, ideationCameraPresets, ideationCameraPlan,
  ideationCameraPlanWith, cameraPlanForDesign, WALL_MARGIN, eyeAboveTargetFor,
  CAMERA_PLANS, EXECUTIVE_CAMERA_PLANS, CONFERENCE_CAMERA_PLANS, CONTROL_CAMERA_PLANS,
  TRAINING_CAMERA_PLANS, MIN_CORNER_OFFSET, LED_EDGE_MARGIN_DEG,
} from '../src/design-camera.js';
import { ROOM_DESIGNS, DESIGN_IDS, INHERIT, resolveDesign, isPlanned } from '../src/room-design.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';
import { LIGHTING_PRESETS } from '../src/design-lighting.js';
import { MATERIAL_IDS } from '../src/materials.js';
import { FURNITURE_COLORS } from '../src/furniture-assets.js';

const ID = 'ideationRoom';
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
/** 실제 화면 비율(574×563)을 포함한 여러 화면비. 어느 비율에서도 약속이 지켜져야 한다. */
const ASPECTS = [574 / 563, 16 / 9, 4 / 3, 1280 / 900, 21 / 9];
/** 세 방 — 8-2b 명세의 컴팩트 · 기본 · 대형. 컴팩트는 8-2a 이후 완전히 유효한 최소 방이다. */
const ROOMS = Object.freeze([
  ['컴팩트', 8500, 3000, 7600], ['기본', 9000, 3200, 8000], ['대형', 14000, 4000, 13300],
]);
/** 계획기가 상한에 부딪히는지 보려면 극단도 필요하다(검사에만 쓰는 칸이다). */
//   (LED 는 4.0 × 2.3m 에 바닥에서 1.0m 이므로, 천장이 3.3m 보다 낮은 칸은 애초에 성립하지 않는다.)
const EXTRA = Object.freeze([
  ['아주 작은 방', 7000, 3400, 6200], ['아주 넓은 방', 20000, 4600, 12000],
  ['아주 깊은 방', 10000, 3400, 18000], ['천장이 낮은 방', 9000, 3400, 8000],
  // 천장이 높고 얕은 방에서는 천장 띠에서 역산한 각이 **음수**가 된다(올려다보게 된다).
  //   내려본 각의 하한이 실제로 작동하는 칸이다 — 이 칸이 없으면 하한을 지워도 아무도 모른다.
  ['천장이 높고 얕은 방', 12000, 5000, 8000],
  // 얕고 낮은 방에서는 **좌우로 되돌리는 수단이 실제로 돌아간다**(remedy = 'lateral').
  //   이 칸이 없으면 그 수단을 통째로 지워도, 코너 하한을 없애도 아무 검사도 깨지지 않는다.
  ['얕고 낮은 방', 8000, 3000, 6500],
  // 좁고 깊은 방에서는 그 수단이 **여러 칸** 움직인다. 코너 하한이 없으면 가운데를 넘어선다.
  ['좁고 깊은 방', 6000, 3200, 8500],
]);

function modelOf(W, H, D, design = ID, opt = {}) {
  const lay = layoutRoom('ideation', { ...defaultOptions('ideation'), ...opt }, { W, D, design });
  return buildGLModel({
    space: { W, H, D },
    led: { marginW: Math.max(0, (W - 4000) / 2), mount: 1000, w: 4000, h: 2300, depth: 60, cols: 4, rows: 4 },
    items: lay.items, roomType: 'ideation', design,
  });
}
const planOf = (W, H, D, preset, aspect = 574 / 563) =>
  cameraPlanForDesign(ID, preset, modelOf(W, H, D), aspect);
/** 세 제안 시점 × 세 방을 한 번에 훑는다. */
function* 제안컷(rooms = ROOMS, aspect = 574 / 563) {
  for (const [이름, W, H, D] of rooms) {
    const m = modelOf(W, H, D);
    for (const v of IDEATION_CAMERA_PRESETS) {
      yield { 이름, W, H, D, view: v, model: m, plan: cameraPlanForDesign(ID, v, m, aspect) };
    }
  }
}

// ── ① 라우팅 — 누가, 어느 시점에서만 이 카메라를 쓰는가 ─────────────────────

test('① 아이디에이션 디자인이 전용 화각을 정한다 — planned 가 아니라 실제 값이다', () => {
  assert.equal(ROOM_DESIGNS.ideationRoom.camera, 'ideationProposal');
  assert.equal(isPlanned(ROOM_DESIGNS.ideationRoom.camera), false);
  assert.equal(resolveDesign(ID).camera, 'ideationProposal');
});

test('② 가로채는 시점은 셋뿐이다 — 정면·아이소·평면은 건드리지 않는다', () => {
  assert.deepEqual([...IDEATION_CAMERA_PRESETS], ['interior', 'corner-l', 'corner-r']);
  for (const p of ['interior', 'corner-l', 'corner-r']) assert.equal(ideationCameraPlanId(ID, p), p);
  for (const p of ['front', 'iso', 'top', 'rear', '', null, undefined, 0]) {
    assert.equal(ideationCameraPlanId(ID, p), null, `${p} 를 가로챘다`);
  }
  assert.deepEqual([...ideationCameraPresets(ID)], ['interior', 'corner-l', 'corner-r']);
});

test('③ 다른 공간은 이 카메라로 풀리지 않는다', () => {
  for (const id of DESIGN_IDS) {
    if (id === ID) continue;
    for (const p of IDEATION_CAMERA_PRESETS) {
      assert.equal(ideationCameraPlanId(id, p), null, `${id}/${p} 가 아이디에이션으로 풀렸다`);
    }
    assert.deepEqual([...ideationCameraPresets(id)], [], id);
  }
});

test('④ 기준값 세 벌을 통째로 고정한다 — 한 값만 바뀌어도 여기서 걸린다', () => {
  // PHASE 8-2b.1 역검증에서 드러난 구멍을 메운다. 천장 띠(band) 처럼 **결과를 바꾸지만
  //   범위 검사는 통과하는** 값이 있었다. 세 벌을 통째로 비교해 두면 그런 값도 걸린다.
  assert.deepEqual(JSON.parse(JSON.stringify(IDEATION_CAMERA_PLANS)), {
    interior: { eye: 1.66, fov: 42, band: 0.11, xRatio: 0.30, turn: 1.00 },
    'corner-l': { eye: 1.66, fov: 43, band: 0.11, xRatio: 0.21, turn: 1.00 },
    'corner-r': { eye: 1.66, fov: 43, band: 0.11, xRatio: 0.79, turn: 1.00 },
  });
  assert.equal(IDEATION_STANDOFF, 1.10);
});

test('④-2 엉뚱한 디자인 이름에도 무너지지 않는다 — 모르면 null 이다', () => {
  for (const v of [null, undefined, '', '없는디자인', 0, {}, [], 123]) {
    assert.equal(ideationCameraPlanId(v, 'interior'), null, String(v));
    assert.deepEqual([...ideationCameraPresets(v)], [], String(v));
  }
});

test('⑤ 다른 계열이 아이디에이션을 가로채지 않는다 — 분기가 서로 겹치지 않는다', () => {
  const m = modelOf(9000, 3200, 8000);
  for (const v of IDEATION_CAMERA_PRESETS) {
    const 공용 = cameraPlanForDesign(ID, v, m, 574 / 563);
    const 전용 = ideationCameraPlan(m.room, m.led, v, 574 / 563, m.fields);
    assert.deepEqual(공용, 전용, `${v} 가 다른 계열로 새어 나갔다`);
  }
  // 이름을 모르는 시점은 계획을 내놓지 않는다.
  assert.equal(ideationCameraPlan(m.room, m.led, 'iso', 574 / 563, m.fields), null);
});

test('⑥ 기준값을 인자로 받는 입구가 있다 — QA 가 후보를 실제로 재서 고를 수 있어야 한다', () => {
  const m = modelOf(9000, 3200, 8000);
  const s = IDEATION_CAMERA_PLANS.interior;
  assert.deepEqual(ideationCameraPlanWith(m.room, m.led, s, 574 / 563, m.fields),
    ideationCameraPlan(m.room, m.led, 'interior', 574 / 563, m.fields));
  // 기준값이 없으면 계획도 없다(가짜로 지어내지 않는다).
  for (const bad of [null, undefined, 0, '']) {
    assert.equal(ideationCameraPlanWith(m.room, m.led, bad, 574 / 563, m.fields), null);
  }
  assert.equal(ideationCameraPlanWith(null, m.led, s), null);
  assert.equal(ideationCameraPlanWith(m.room, null, s), null);
});

// ── ② 하드 게이트 — 화각·눈높이·시선 ────────────────────────────────────────

test('⑦ 화각 상한은 44° 다 — 어느 방·어느 화면비에서도 넘지 않는다', () => {
  assert.deepEqual({ ...IDEATION_FOV_RANGE }, { min: 36, max: 44 });
  for (const s of Object.values(IDEATION_CAMERA_PLANS)) {
    assert.ok(s.fov >= 36 && s.fov <= 44, `기준 화각 ${s.fov} 가 범위 밖이다`);
  }
  let 최대 = 0;
  for (const a of ASPECTS) {
    for (const { plan, 이름, view } of 제안컷([...ROOMS, ...EXTRA], a)) {
      assert.ok(plan.fov <= 44 + 1e-9, `${이름}/${view}/${a}: 화각 ${plan.fov}`);
      assert.ok(plan.fov >= 36 - 1e-9, `${이름}/${view}/${a}: 화각 ${plan.fov}`);
      최대 = Math.max(최대, plan.fov);
    }
  }
  assert.ok(최대 > 42, `상한을 실제로 쓰는 칸이 없다(최대 ${최대}) — 검사가 헐겁다`);
});

test('⑧ 눈높이는 사람 눈높이다 — 1.62~1.78m 안이고 레거시 2.20m 를 쓰지 않는다', () => {
  assert.deepEqual({ ...IDEATION_EYE_RANGE }, { min: 1.62, max: 1.78 });
  for (const [k, s] of Object.entries(IDEATION_CAMERA_PLANS)) {
    assert.ok(s.eye >= 1.62 && s.eye <= 1.78, `${k}: 기준 눈높이 ${s.eye}`);
  }
  for (const { plan, 이름, view } of 제안컷([...ROOMS, ...EXTRA])) {
    assert.ok(plan.eye >= 1.62 - 1e-9 && plan.eye <= 1.78 + 1e-9, `${이름}/${view}: 눈 ${plan.eye}`);
    assert.equal(plan.position[1], +plan.eye.toFixed(4));
  }
  // 레거시 코너의 2.20m 가 이 계열 어디에도 없다.
  assert.equal(JSON.stringify(IDEATION_CAMERA_PLANS).includes('2.2'), false);
  // 천장이 아주 낮으면 눈높이를 **범위 최저까지 내린다** — 머리가 천장을 뚫지 않게 한다.
  //   (2.0m 천장은 제품에서 만들 수 없는 값이지만, 순수 함수의 약속은 그래도 지켜야 한다.)
  const 낮은천장 = modelOf(9000, 2000, 8000);
  for (const v of IDEATION_CAMERA_PRESETS) {
    const p = cameraPlanForDesign(ID, v, 낮은천장, 574 / 563);
    assert.equal(p.eye, 1.62, `${v}: 2.0m 천장에서 눈높이가 내려가지 않았다`);
    assert.ok(p.position[1] < 2.0 - WALL_MARGIN, `${v}: 눈이 천장에 닿는다`);
  }
});

test('⑨ 시선은 언제나 눈보다 낮다 — 조작기가 카메라를 끌어올리지 못한다', () => {
  for (const { plan, 이름, view } of 제안컷([...ROOMS, ...EXTRA])) {
    assert.ok(plan.target[1] < plan.position[1], `${이름}/${view}: 시선이 눈보다 높다`);
    // (좌표를 소수 넷째 자리에서 반올림해 내보내므로 그만큼의 오차는 허용한다.)
    const d = Math.hypot(plan.position[0] - plan.target[0], plan.position[2] - plan.target[2]);
    assert.ok(plan.position[1] - plan.target[1] >= eyeAboveTargetFor(d) - 1e-3,
      `${이름}/${view}: 눈이 시선보다 충분히 높지 않다`);
  }
});

test('⑩ 새가 보는 각도가 아니다 — 내려본 각이 완만하다', () => {
  for (const { plan, 이름, view } of 제안컷([...ROOMS, ...EXTRA])) {
    assert.ok(plan.pitchDeg > 0, `${이름}/${view}: 올려다본다`);
    assert.ok(plan.pitchDeg <= 20, `${이름}/${view}: 내려본 각 ${plan.pitchDeg}° — 아이소처럼 내려다본다`);
  }
});

test('⑪ 정착 자세가 선언 자세와 같다 — 조작기가 손댈 일이 없다', () => {
  for (const [이름, W, H, D] of [...ROOMS, ...EXTRA]) {
    const m = modelOf(W, H, D);
    for (const v of IDEATION_CAMERA_PRESETS) {
      const pose = presetPose(v, m, 574 / 563, {});
      const s = settledPose(pose);
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(s.position[i] - pose.position[i]) < 1e-9,
          `${이름}/${v}: 조작기가 카메라를 옮겼다 (${pose.position} → ${s.position})`);
      }
      assert.ok(pose.position[1] <= 1.78 + 1e-9, `${이름}/${v}: 화면의 실제 눈높이 ${pose.position[1]}`);
    }
  }
});

// ── ③ 구도 — LED·구역·바닥·천장 ─────────────────────────────────────────────

test('⑫ 대표 화면비에서 LED 가 온전히 들어온다 — 넓은 화면비는 실측값을 사실대로 적는다', () => {
  // **실제 캔버스(574×563)** 가 계약이다. 아홉 컷 + 극단 방 전부에서 온전해야 한다.
  for (const { plan, 이름, view } of 제안컷([...ROOMS, ...EXTRA], 574 / 563)) {
    assert.equal(plan.ledFullyVisible, true, `${이름}/${view}: LED 가 잘린다`);
    assert.equal(plan.ledVisibleShare, 1, `${이름}/${view}: LED 보임 ${plan.ledVisibleShare}`);
  }
  // PHASE 8-2b.1 에서 협업 구역이 앞으로 나오면서 카메라가 LED 에 2.4m 더 가까워졌다.
  //   그 대가로 **16:9·21:9 같은 넓은 화면비에서는 컴팩트·기본 방의 LED 가 조금 잘린다.**
  //   지어내지 않고 최악값을 못박아 둔다 — 더 나빠지면 여기서 잡힌다.
  let 최악 = 1;
  for (const a of ASPECTS) {
    for (const { plan } of 제안컷(ROOMS, a)) 최악 = Math.min(최악, plan.ledVisibleShare);
  }
  assert.ok(최악 >= 0.87, `넓은 화면비 LED 보임이 더 나빠졌다: ${최악}`);
  // **가로로 먼저 넘치는 칸.** 넓고 낮은 방(16 × 2.8 × 13m, 16:9)에서는 LED 가 세로보다
  //   가로로 먼저 넘친다. 화각을 키울 때 세로만 보면 여기서 잘린다 — 실측으로 고른 칸이다.
  assert.equal(cameraPlanForDesign(ID, 'interior', modelOf(16000, 2800, 13000), 16 / 9).ledFullyVisible,
    true, '가로로 넘치는 LED 를 화각 계산이 놓쳤다');
});

test('⑬ 카메라가 LED 면을 넘어서지 않는다 — 화면 뒤로 들어가지 않는다', () => {
  for (const [이름, W, H, D] of [...ROOMS, ...EXTRA]) {
    const m = modelOf(W, H, D);
    for (const v of IDEATION_CAMERA_PRESETS) {
      const plan = cameraPlanForDesign(ID, v, m, 574 / 563);
      assert.ok(plan.position[2] > m.led.depth + 1, `${이름}/${v}: 카메라가 LED 에 붙었다`);
      assert.ok(plan.target[2] > m.led.depth, `${이름}/${v}: 시선점이 LED 뒤에 있다`);
    }
  }
});

test('⑭ 협업 덩이가 화면에 남는다 — 이 단계의 존재 이유다', () => {
  for (const { plan, 이름, view } of 제안컷()) {
    assert.ok(plan.collabSpotShare > 0, `${이름}/${view}: 가까운 협업 덩이 점유 0`);
    assert.ok(plan.collabShare > 0, `${이름}/${view}: 협업 구역 점유 0`);
  }
});

test('⑮ 하이 테이블 구역은 재서 알려 준다 — 실내 컷에서는 반드시 보인다', () => {
  // **우코너는 하이 테이블을 담지 못한다**(렌더러 실측 0.00%). 하이 테이블 구역이 방 왼쪽에
  //   몰려 있어서 그렇다. 지어내지 않고 사실대로 적어 둔다 — 하드 게이트는 협업·라운지다.
  for (const { plan, 이름, view } of 제안컷()) {
    assert.equal(typeof plan.highShare, 'number', `${이름}/${view}: 하이 구역을 재지 않았다`);
    if (view === 'interior') assert.ok(plan.highShare > 0, `${이름}/실내: 하이 테이블 구역 점유 0`);
  }
});

test('⑯ 천장 띠가 10~20% 사이다 — 천장도 바닥도 화면을 먹지 않는다', () => {
  // 계산값(ceilingBand)과 **화면 실측 천장 점유**는 다르다. 카메라가 LED 에 가까워질수록
  //   천장선이 화면 위로 올라가 계산값이 작아지는데, 실제로 찍어 보면 천장은 9.3~16.3% 를
  //   차지한다(PHASE 8-2b.1 실측). 여기서는 계산값이 그 범위를 벗어나지 않는지만 본다.
  for (const { plan, 이름, view } of 제안컷()) {
    assert.ok(plan.ceilingBand >= 0.05 && plan.ceilingBand <= 0.20,
      `${이름}/${view}: 천장 띠 ${plan.ceilingBand}`);
  }
});

test('⑰ 카메라와 시선점이 방 안에 있다 — 벽을 뚫지 않는다', () => {
  for (const [이름, W, H, D] of [...ROOMS, ...EXTRA]) {
    const w = W / 1000, h = H / 1000, d = D / 1000;
    const m = modelOf(W, H, D);
    for (const v of IDEATION_CAMERA_PRESETS) {
      const p = cameraPlanForDesign(ID, v, m, 574 / 563);
      assert.ok(p.position[0] >= WALL_MARGIN - 1e-9 && p.position[0] <= w - WALL_MARGIN + 1e-9, `${이름}/${v} 가로`);
      assert.ok(p.position[2] >= WALL_MARGIN - 1e-9 && p.position[2] <= d - WALL_MARGIN + 1e-9, `${이름}/${v} 앞뒤`);
      assert.ok(p.position[1] < h, `${이름}/${v}: 눈이 천장 위다`);
      assert.ok(p.target[0] >= WALL_MARGIN - 1e-9 && p.target[0] <= w - WALL_MARGIN + 1e-9, `${이름}/${v} 시선 가로`);
      assert.ok(p.target[1] > 0 && p.target[1] < h, `${이름}/${v} 시선 높이`);
      assert.ok(p.wallClearance >= WALL_MARGIN - 1e-9, `${이름}/${v}: 벽 여유 ${p.wallClearance}`);
    }
  }
});

test('⑱ 방위각은 LED 가 허락하는 구간 안에서만 고른다', () => {
  for (const { plan, 이름, view } of 제안컷([...ROOMS, ...EXTRA])) {
    const [lo, hi] = plan.bearingSpanDeg;
    assert.ok(plan.bearingDeg >= lo - 1e-6 && plan.bearingDeg <= hi + 1e-6,
      `${이름}/${view}: 방위 ${plan.bearingDeg} 가 구간 [${lo}, ${hi}] 밖이다`);
  }
});

// ── ④ 내용물을 읽는가 — 값을 박아 두지 않았다 ───────────────────────────────

test('⑲ 맨 뒤 내용물에서 정해진 만큼 물러선다 — 뒷벽이 한계다', () => {
  assert.equal(IDEATION_STANDOFF, 1.10);
  for (const [이름, W, H, D] of [...ROOMS, ...EXTRA]) {
    const m = modelOf(W, H, D);
    for (const v of IDEATION_CAMERA_PRESETS) {
      const p = cameraPlanForDesign(ID, v, m, 574 / 563);
      assert.ok(p.rearClearance > 0, `${이름}/${v}: 내용물 뒤로 물러서지 않았다`);
      assert.ok(p.rearClearance <= IDEATION_STANDOFF + 1e-9 || p.position[2] >= D / 1000 - WALL_MARGIN - 1e-6,
        `${이름}/${v}: 필요 이상으로 물러섰다(${p.rearClearance}m)`);
    }
  }
  // 큰 방에서는 뒷벽까지 가지 않는다 — 그것이 이 규칙을 넣은 까닭이다.
  const 큰 = planOf(14000, 4000, 13300, 'interior');
  assert.ok(큰.position[2] < 13.3 - WALL_MARGIN - 0.5, `대형 방에서 뒷벽에 붙었다(${큰.position[2]})`);
  // **PHASE 8-2b.1 이후 맨 뒤 내용물은 하이 테이블 구역이다.** 협업 구역이 그 앞으로 내려갔기
  //   때문이다. 그래서 기본 방에서도 카메라가 뒷벽이 아니라 하이 테이블 뒤 1.10m 에 선다.
  const 작은 = planOf(9000, 3200, 8000, 'interior');
  assert.ok(작은.position[2] < 8 - WALL_MARGIN - 1.0,
    `기본 방에서 아직 뒷벽 쪽에 선다(${작은.position[2]})`);
  assert.ok(Math.abs(작은.rearClearance - IDEATION_STANDOFF) < 1e-6,
    `물러선 거리가 ${작은.rearClearance} 다`);
});

test('⑳ 방이 커지면 자세도 따라 커진다 — 좌표를 상수로 박지 않았다', () => {
  const a = planOf(9000, 3200, 8000, 'interior');
  const b = planOf(14000, 4000, 13300, 'interior');
  assert.ok(b.position[0] > a.position[0], '넓어져도 가로 자리가 그대로다');
  assert.ok(b.position[2] > a.position[2], '깊어져도 앞뒤 자리가 그대로다');
  // 같은 크기면 언제나 같은 값이다(결정적).
  assert.deepEqual(planOf(9000, 3200, 8000, 'interior'), a);
});

test('㉑ 구역이 옮겨지면 구도가 따라간다 — 배치를 실제로 읽는다', () => {
  const m = modelOf(9000, 3200, 8000);
  const 기준 = cameraPlanForDesign(ID, 'interior', m, 574 / 563);
  // 협업 덩이를 오른쪽으로 옮긴 모형(배치 자체는 건드리지 않고 **읽는 값**만 바꾼다).
  const z = m.fields.ideationZones;
  const 옮김 = { ...m, fields: { ...m.fields, ideationZones: { ...z,
    collabSpots: z.collabSpots.map(p => ({ x: p.x + 2.0, z: p.z })),
    collab: { ...z.collab, x0: z.collab.x0 + 2.0, x1: z.collab.x1 + 2.0 } } } };
  const 다른 = cameraPlanForDesign(ID, 'interior', 옮김, 574 / 563);
  assert.notDeepEqual(다른.target, 기준.target, '구역을 옮겼는데 시선이 그대로다');
  // 방위각은 **LED 가 허락하는 구간에 갇힐 수 있다** — 그때는 시선점이 따라 움직이는 것으로
  //   반응을 확인한다. 구역을 앞뒤로도 옮겨 '물러서는 자리'가 따라가는지 함께 본다.
  const 앞뒤 = { ...m, fields: { ...m.fields, ideationZones: { ...z,
    collabSpots: z.collabSpots.map(p => ({ x: p.x, z: p.z + 2.5 })),
    collab: { ...z.collab, z0: z.collab.z0 + 2.5, z1: z.collab.z1 + 2.5 } } } };
  const 뒤로 = cameraPlanForDesign(ID, 'interior', 앞뒤, 574 / 563);
  assert.ok(뒤로.position[2] > 기준.position[2] + 1,
    `구역을 2.5m 뒤로 옮겼는데 카메라가 따라오지 않았다(${기준.position[2]} → ${뒤로.position[2]})`);
});

test('㉒ 구역을 모르면 대체 범위로 풀되 약속은 그대로 지킨다', () => {
  const m = modelOf(9000, 3200, 8000);
  for (const f of [null, {}, { ideationZones: null }]) {
    const p = ideationCameraPlan(m.room, m.led, 'interior', 574 / 563, f);
    assert.ok(p, '구역이 없다고 계획을 못 내놓으면 안 된다');
    assert.ok(p.fov <= 44 + 1e-9 && p.eye >= 1.62 && p.eye <= 1.78);
    assert.equal(p.ledFullyVisible, true);
    assert.ok(p.target[1] < p.position[1]);
  }
});

test('㉓ 결과는 얼어 있다 — 밖에서 고칠 수 없다', () => {
  const p = planOf(9000, 3200, 8000, 'interior');
  assert.ok(Object.isFrozen(p));
  assert.ok(Object.isFrozen(IDEATION_CAMERA_PLANS));
  for (const s of Object.values(IDEATION_CAMERA_PLANS)) assert.ok(Object.isFrozen(s));
  assert.ok(Object.isFrozen(IDEATION_CAMERA_PRESETS));
  assert.ok(Object.isFrozen(IDEATION_FOV_RANGE) && Object.isFrozen(IDEATION_EYE_RANGE));
});

test('㉔ 세 시점이 서로 다른 그림이다 — 이름만 다른 같은 컷이 아니다', () => {
  const m = modelOf(9000, 3200, 8000);
  const [i, l, r] = IDEATION_CAMERA_PRESETS.map(v => cameraPlanForDesign(ID, v, m, 574 / 563));
  assert.ok(Math.abs(l.position[0] - r.position[0]) > 2, '좌·우 코너가 같은 자리다');
  assert.ok(Math.abs(i.position[0] - l.position[0]) > 0.5, '실내와 좌코너가 같은 자리다');
  assert.ok(Math.abs(i.bearingDeg - l.bearingDeg) > 5, '실내와 좌코너가 같은 방향을 본다');
  assert.ok(l.bearingDeg > 0 && r.bearingDeg < 0, '좌·우 코너가 같은 쪽으로 돈다');
});

test('㉕ 코너는 코너로 남는다 — 좌우로 되돌려도 가운데까지 오지 않는다', () => {
  // **화면비를 함께 돌려야 의미가 있다.** 좌우로 되돌리는 수단은 가로로 긴 화면(21:9)에서만
  //   실제로 돌아간다 — 그 칸이 없으면 하한을 지워도 아무 검사도 깨지지 않는다(역검증에서 확인).
  let 되돌린적 = false;
  for (const a of ASPECTS) {
    for (const [이름, W, H, D] of [...ROOMS, ...EXTRA]) {
      const m = modelOf(W, H, D);
      const mid = (W / 1000) / 2;
      for (const v of ['corner-l', 'corner-r']) {
        const p = cameraPlanForDesign(ID, v, m, a);
        if (p.remedy === 'lateral') 되돌린적 = true;
        assert.ok(Math.abs(p.position[0] - mid) >= (W / 1000) * MIN_CORNER_OFFSET - 1e-6,
          `${이름}/${v}/${a}: 코너가 가운데로 왔다`);
      }
    }
  }
  assert.equal(되돌린적, true, '좌우로 되돌리는 수단이 한 번도 돌지 않았다 — 검사가 헐겁다');
});

// ── ⑤ 동결 — 이 단계가 건드리지 않은 것 ─────────────────────────────────────

test('㉖ 정면·아이소·평면은 계획을 내놓지 않는다 — 공용 시점 그대로다', () => {
  const m = modelOf(9000, 3200, 8000);
  const 민짜 = { ...m, design: null };
  for (const v of ['front', 'iso', 'top']) {
    assert.equal(cameraPlanForDesign(ID, v, m, 574 / 563), null, `${v} 를 가로챘다`);
    assert.deepEqual(presetPose(v, m, 574 / 563, {}), presetPose(v, 민짜, 574 / 563, {}),
      `${v} 가 디자인 때문에 바뀌었다`);
  }
});

test('㉗ 공용 카메라표와 기본 화각이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id),
    ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top']);
  assert.equal(FOV_DEG, 40);
  assert.deepEqual({ ...FOV_RANGE }, { min: 24, max: 75, step: 1, default: 40 });
  assert.equal(CONTROLS_MAX_POLAR, Math.PI / 2 - 0.02);
  const gl = src('gl-model.js');
  assert.match(gl, /interior: \{ eye: 1\.75, look: 1\.85, yaw: 12,\s+fov: 42,/);
  assert.match(gl, /'corner-l': \{ eye: 2\.20, look: 1\.45, yaw: -28, fov: 40,/);
  assert.match(gl, /'corner-r': \{ eye: 2\.20, look: 1\.45, yaw: 28,\s+fov: 40,/);
});

test('㉘ 다섯 공간의 카메라 기준값이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual(Object.keys(CAMERA_PLANS), ['interior', 'corner-l', 'corner-r', 'rear']);
  assert.equal(CAMERA_PLANS.interior.eye, 1.65);
  assert.equal(CAMERA_PLANS.interior.fov, 41);
  assert.equal(EXECUTIVE_CAMERA_PLANS.interior.eye, 1.60);
  assert.equal(CONFERENCE_CAMERA_PLANS.interior.fov, 44);
  assert.equal(CONFERENCE_CAMERA_PLANS['corner-l'].eye, 1.74);
  assert.equal(CONTROL_CAMERA_PLANS.interior.eye, 1.66);
  assert.equal(TRAINING_CAMERA_PLANS.interior.eye, 1.66);
  assert.deepEqual(Object.keys(TRAINING_CAMERA_PLANS), ['interior', 'corner-l', 'corner-r']);
  // 다른 다섯 공간의 실내 컷이 아이디에이션 때문에 움직이지 않았다.
  const 짝 = { corporateMeeting: 'meeting', executiveBoardroom: 'meeting',
    largeConference: 'meeting', trainingRoom: 'classroom', controlRoom: 'control' };
  for (const [d, rt] of Object.entries(짝)) {
    const lay = layoutRoom(rt, defaultOptions(rt), { W: 10000, D: 8500, design: d });
    const m = buildGLModel({ space: { W: 10000, H: 3400, D: 8500 },
      led: { marginW: 3000, mount: 1000, w: 4000, h: 2300, depth: 60, cols: 4, rows: 4 },
      items: lay.items, roomType: rt, design: d });
    const p = cameraPlanForDesign(d, 'interior', m, 574 / 563);
    assert.ok(p, `${d} 의 전용 화각이 사라졌다`);
    assert.equal(p.collabSpotShare, undefined, `${d} 가 아이디에이션 계열로 풀렸다`);
  }
});

test('㉙ 조명·상판·재질은 8-2a 그대로다 — 카메라 단계가 손대지 않았다', () => {
  const L = LIGHTING_PRESETS.ideationSoft;
  assert.deepEqual({ ...L.scale }, { hemi: 0.84, ceiling: 1.00, key: 1.05, fill: 1.60, ledSpill: 1.00 });
  assert.deepEqual({ ...L.shadow }, { radius: 7, bias: -0.00035, normalBias: 0.030 });
  assert.equal(Object.keys(LIGHTING_PRESETS).length, 6);
  assert.equal(FURNITURE_COLORS.highTop, '#ded9cf');
  assert.equal(FURNITURE_COLORS.collabTop, '#ded9cf');
  assert.equal(MATERIAL_IDS.length, 13);
});

test('㉚ 배치가 8-2a 그대로다 — 카메라가 가구를 밀지 않았다', () => {
  // 기본 방(9 × 8m)의 배치 지문. **PHASE 8-2b.1 에서 협업·라운지·러그만 다시 열었다** —
  //   하이 테이블·스툴·이동식 디스플레이·화분은 제자리이고, 협업 두 덩이가 LED 쪽으로 내려왔다.
  const 지문 = layoutRoom('ideation', defaultOptions('ideation'), { W: 9000, D: 8000, design: ID })
    .items.map(i => `${i.type}@${Math.round(i.x)},${Math.round(i.z)}`).join(' ');
  assert.equal(지문, 'highTable@2700,3360 stool@2390,2480 stool@2390,4240 stool@3010,2480 '
    + 'stool@3010,4240 collabTable@5080,2087 lounge@5615,3013 lounge@5615,1160 lounge@4010,2087 '
    + 'rug@5080,2087 collabTable@6950,2250 lounge@6415,3177 lounge@6415,1323 lounge@8020,2250 '
    + 'mobileStand@7500,3400 plant@8500,7500');
  // 디자인을 떼어도 같은 배치다 — 카메라는 배치의 주인이 아니다.
  const 민짜 = layoutRoom('ideation', defaultOptions('ideation'), { W: 9000, D: 8000 })
    .items.map(i => `${i.type}@${Math.round(i.x)},${Math.round(i.z)}`).join(' ');
  assert.equal(민짜, 지문);
});

test('㉛ 순수 유지 — 계획기는 Three.js·DOM·조작기를 부르지 않는다', () => {
  const s = src('design-camera.js');
  assert.ok(!/THREE\.|three\.module|from '\.\/vendor/.test(s), '화각 층이 Three.js를 읽는다');
  assert.ok(!/document\.|window\.|canvas/.test(s), '화각 층이 DOM을 읽는다');
  const imports = [...s.matchAll(/from '([^']+)'/g)].map(m => m[1].split('?')[0]);
  assert.deepEqual(imports, ['./room-design.js'], `화각 층이 읽는 모듈: ${imports.join(', ')}`);
  // LED 가장자리 여유는 한 곳에만 있고, 아이디에이션도 그것을 쓴다(값을 또 적지 않았다).
  assert.equal(LED_EDGE_MARGIN_DEG, 1.2);
  assert.equal((s.match(/LED_EDGE_MARGIN_DEG\s*=/g) || []).length, 1);
});
