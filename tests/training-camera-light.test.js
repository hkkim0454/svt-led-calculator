// training-camera-light.test.js — 교육장 조명·화각. (PHASE 7-b, DEC-128)
// ─────────────────────────────────────────────────────────────────────────────
// 이 단계의 출발점은 PHASE 7-0 이 남긴 숙제였다.
//   **선언한 눈높이(1.75)와 화면의 실제 눈높이(2.03~2.24)가 달랐다.**
//   원인은 조작기(OrbitControls)의 극각 상한이다 — 공용 실내 시점이 눈을 시선보다 낮게
//   잡는 바람에 극각이 90°를 넘고, 조작기가 카메라를 시선 둘레로 위로 돌려 버린다.
//   올라가는 높이는 반지름에 비례해서 **방이 깊을수록 커진다.**
//
// 여기서 지키는 것.
//   ① 원인을 코드로 못박는다 — 상한 상수는 한 곳에만 있고, 순수 함수가 그 결과를 재현한다.
//   ② 교육장 화각은 **선언값이 곧 화면값**이다 — 조작기가 손댈 일이 없다.
//   ③ 조명은 개수·종류를 그대로 두고 세기만 바꾼다.
//   ④ 평면·정면·아이소와 다른 공간은 건드리지 않았다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  presetPose, settledPose, CONTROLS_MAX_POLAR, buildGLModel, CAMERA_PRESETS, FOV_DEG,
} from '../src/gl-model.js';
import {
  TRAINING_CAMERA_PRESETS, TRAINING_CAMERA_PLANS, TRAINING_FOV_RANGE, TRAINING_BAND_MAX,
  TRAINING_STANDOFF, trainingCameraPlanId, trainingCameraPresets, trainingCameraPlan,
  cameraPlanForDesign, EYE_RANGE, eyeAboveTargetFor, POLAR_GAP_PER_DIST,
  CONFERENCE_CAMERA_PLANS, CAMERA_PLANS, EXECUTIVE_CAMERA_PLANS, CONTROL_CAMERA_PLANS,
} from '../src/design-camera.js';
import { LIGHTING_PRESETS, lightingForDesign, shadowSettingsForDesign,
  keyLightPlacementForDesign, fillLightPlacementForDesign } from '../src/design-lighting.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';
import { ROOM_DESIGNS } from '../src/room-design.js';

const TR = 'trainingRoom';
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const code = f => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ASPECTS = [574 / 563, 16 / 9, 4 / 3, 1280 / 900, 21 / 9];
const ROOMS = [['컴팩트', 8000, 3000, 7000, {}], ['기본', 12000, 3400, 10000, {}],
  ['대형', 18000, 3600, 14000, { rows: 6, cols: 6 }], ['깊은 방', 14000, 3400, 18000, {}],
  // 천장이 높은 교육장에서는 내려본 각의 **하한**이 실제로 작동한다. 이 칸이 없으면
  // 하한을 지워도 아무 검사도 깨지지 않는다(역검증에서 확인).
  ['높은 천장', 12000, 5000, 8000, {}]];

function modelOf(W, H, D, opt = {}, design = TR) {
  const lay = layoutRoom('classroom', { ...defaultOptions('classroom'), ...opt }, { W, D, design });
  return buildGLModel({
    space: { W, H, D },
    led: { marginW: (W - 4000) / 2, mount: 1000, w: 4000, h: 2300, depth: 60, cols: 4, rows: 4 },
    items: lay.items, roomType: 'classroom', design,
  });
}

// ── ① 원인을 못박는다 ────────────────────────────────────────────────────────

test('① 조작기 극각 상한은 한 곳에만 있고, 렌더러가 그것을 쓴다', () => {
  assert.equal(CONTROLS_MAX_POLAR, Math.PI / 2 - 0.02);
  const gl = code('render3d-gl.js');
  assert.ok(/maxPolarAngle\s*=\s*CONTROLS_MAX_POLAR/.test(gl), '렌더러가 공용 상한을 쓰지 않는다');
  assert.equal(/maxPolarAngle\s*=\s*Math\.PI/.test(gl), false, '렌더러에 상한 값이 또 적혀 있다');
});

test('② `settledPose()`가 조작기의 보정을 재현한다 — 이것이 화면의 실제 자세다', () => {
  // 눈이 시선보다 **낮으면** 조작기가 위로 돌린다.
  const 낮음 = { id: 'interior', ortho: false, position: [6, 1.75, 9.255], target: [6, 1.85, 0.06],
    up: [0, 1, 0], fov: 42, orthoHeight: null };
  const s1 = settledPose(낮음);
  assert.ok(s1.position[1] > 낮음.position[1], '보정이 일어나지 않았다');
  // 올라간 높이 = 반지름 × cos(상한). 값이 아니라 **식**을 확인한다.
  const r = Math.hypot(6 - 6, 1.75 - 1.85, 9.255 - 0.06);
  assert.ok(Math.abs(s1.position[1] - (1.85 + r * Math.cos(CONTROLS_MAX_POLAR))) < 1e-9);
  // 반지름은 보존된다(조작기는 극각만 자른다).
  const r2 = Math.hypot(s1.position[0] - 6, s1.position[1] - 1.85, s1.position[2] - 0.06);
  assert.ok(Math.abs(r - r2) < 1e-9, '보정이 거리를 바꿨다');
  // 눈이 시선보다 **위**면 손대지 않는다.
  const 높음 = { ...낮음, position: [6, 2.2, 9.0], target: [6, 1.45, 0.06] };
  assert.equal(settledPose(높음), 높음, '걸리지 않아야 할 자세를 건드렸다');
  // 정사투영(평면도)은 대상이 아니다.
  const ortho = { ...낮음, ortho: true };
  assert.equal(settledPose(ortho), ortho);
});

test('③ 디자인이 없는 공간에서는 그 보정이 **여전히 일어난다** — 원인이 사라진 것이 아니다', () => {
  // 강당·아이디에이션은 공용 실내 시점을 그대로 쓴다. 여기서 보정이 사라지면
  //   그 방들의 화면이 바뀐 것이므로, 일어난다는 사실 자체를 고정한다.
  for (const [type, W, H, D] of [['hall_m', 18000, 6000, 20000], ['ideation', 9000, 3200, 8000]]) {
    const lay = layoutRoom(type, defaultOptions(type), { W, D });
    const m = buildGLModel({ space: { W, H, D },
      led: { marginW: (W - 4000) / 2, mount: 1000, w: 4000, h: 2300, depth: 60, cols: 4, rows: 4 },
      items: lay.items, roomType: type });
    const pose = presetPose('interior', m, 574 / 563, { fov: 40, topPerspective: true });
    const settled = settledPose(pose);
    assert.ok(settled.position[1] > pose.position[1] + 0.05,
      `${type}: 공용 실내 시점의 조작기 보정이 사라졌다 — 그 방 화면이 바뀐다`);
  }
});

// ── ② 교육장 화각 — 선언값이 곧 화면값 ──────────────────────────────────────

test('④ 교육장 화각이 붙는 자리 — 실내·좌우 코너 셋뿐이다', () => {
  assert.deepEqual([...TRAINING_CAMERA_PRESETS], ['interior', 'corner-l', 'corner-r']);
  assert.deepEqual([...trainingCameraPresets(TR)], ['interior', 'corner-l', 'corner-r']);
  // 기술 시점은 가져가지 않는다(7-a 에서 동결한 평면·정면, 그리고 아이소).
  for (const v of ['top', 'front', 'iso', 'rear']) {
    assert.equal(trainingCameraPlanId(TR, v), null, `${v}: 교육장 화각이 가로챘다`);
  }
  // 다른 공간은 이 계열을 쓰지 않는다.
  for (const id of ['corporateMeeting', 'executiveBoardroom', 'largeConference', 'controlRoom', null]) {
    assert.deepEqual([...trainingCameraPresets(id)], [], `${id}: 교육장 화각이 새어 나갔다`);
  }
});

test('⑤ **조작기가 교육장 카메라를 끌어올리지 못한다** — 선언한 눈높이가 그대로 화면이다', () => {
  for (const [tag, W, H, D, opt] of ROOMS) {
    const m = modelOf(W, H, D, opt);
    for (const a of ASPECTS) for (const v of TRAINING_CAMERA_PRESETS) {
      const pose = presetPose(v, m, a, { fov: 40, topPerspective: true });
      const settled = settledPose(pose);
      assert.deepEqual(settled.position, pose.position,
        `${tag}/${v}/${a.toFixed(2)}: 조작기가 카메라를 옮긴다 — 선언값과 화면이 갈린다`);
      // 그 이유를 식으로도 확인한다 — 시선이 눈보다 충분히 아래에 있다.
      const dist = Math.hypot(pose.target[0] - pose.position[0], pose.target[2] - pose.position[2]);
      // 허용 오차가 1e-4 인 까닭: 시선점은 소수 넷째 자리로 반올림되어 저장되므로,
      // 안전 여유가 딱 맞게 걸린 칸에서는 최대 5e-5 만큼 값이 깎일 수 있다.
      assert.ok(pose.position[1] - pose.target[1] >= eyeAboveTargetFor(dist) - 1e-4,
        `${tag}/${v}: 시선이 충분히 아래에 있지 않다`);
    }
  }
  // 내려본 각의 하한이 **실제로 쓰이는 칸**이 검사 안에 들어 있다.
  // 천장이 높으면 계산상의 내려본 각이 0 에 가까워져서 하한이 값을 붙잡는다.
  const 높은 = modelOf(12000, 5000, 8000);
  const plan = cameraPlanForDesign(TR, 'interior', 높은, 16 / 9);
  assert.ok(Math.abs(plan.pitchDeg - Math.atan(POLAR_GAP_PER_DIST) * 180 / Math.PI) < 1e-3,
    `천장 높은 교육장에서 하한이 걸리지 않는다(${plan.pitchDeg})`);
});

test('⑥ 사람 눈높이 · 제안 원근 상한 46° · LED 온전', () => {
  assert.deepEqual({ ...TRAINING_FOV_RANGE }, { min: 36, max: 46 });
  assert.ok(TRAINING_FOV_RANGE.max <= 46, '제안 원근의 하드 게이트를 넘겼다');
  for (const [tag, W, H, D, opt] of ROOMS) {
    const m = modelOf(W, H, D, opt);
    for (const a of ASPECTS) for (const v of TRAINING_CAMERA_PRESETS) {
      const plan = cameraPlanForDesign(TR, v, m, a);
      assert.ok(plan, `${tag}/${v}: 계획이 없다`);
      assert.ok(plan.fov <= TRAINING_FOV_RANGE.max + 1e-9, `${tag}/${v}: 화각 ${plan.fov}`);
      assert.ok(plan.fov >= TRAINING_FOV_RANGE.min - 1e-9, `${tag}/${v}: 화각 ${plan.fov}`);
      assert.ok(plan.position[1] >= EYE_RANGE.min && plan.position[1] <= EYE_RANGE.max,
        `${tag}/${v}: 눈높이 ${plan.position[1]} 가 사람 범위 밖이다`);
      assert.ok(plan.target[1] < plan.position[1], `${tag}/${v}: 시선이 눈높이보다 높다`);
      assert.equal(plan.ledFullyVisible, true, `${tag}/${v}: LED 가 잘렸다`);
      assert.equal(plan.ledVisibleShare, 1, `${tag}/${v}: LED 가 온전하지 않다`);
      // 카메라와 시선이 방 안에 있다.
      for (const [i, lim] of [[0, W / 1000], [2, D / 1000]]) {
        assert.ok(plan.position[i] > 0 && plan.position[i] < lim, `${tag}/${v}: 카메라가 방 밖이다`);
        assert.ok(plan.target[i] > 0 && plan.target[i] < lim, `${tag}/${v}: 시선이 방 밖이다`);
      }
      assert.ok(plan.target[1] > 0, `${tag}/${v}: 시선이 바닥 아래다`);
    }
  }
});

test('⑦ 기준값을 고정한다 — 값이 흔들리면 구도가 흔들린다', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(TRAINING_CAMERA_PLANS)), {
    interior: { eye: 1.66, fov: 42, band: 0.14, xRatio: 0.50, aimMix: 0.16 },
    'corner-l': { eye: 1.70, fov: 43, band: 0.12, xRatio: 0.26, aimMix: 0.30 },
    'corner-r': { eye: 1.70, fov: 43, band: 0.12, xRatio: 0.74, aimMix: 0.30 },
  });
  assert.equal(TRAINING_BAND_MAX, 0.18);
  assert.deepEqual({ ...TRAINING_STANDOFF }, { min: 0.90, max: 4.20 });
  // 좌우 코너는 대칭이다.
  assert.ok(Math.abs((1 - TRAINING_CAMERA_PLANS['corner-l'].xRatio)
    - TRAINING_CAMERA_PLANS['corner-r'].xRatio) < 1e-9, '좌우 코너가 대칭이 아니다');
});

test('⑧ 교육장 화각은 **책상 배열**을 읽는다 — 의자 범위만으로는 앞쪽 끝을 알 수 없다', () => {
  const m = modelOf(12000, 3400, 10000);
  assert.ok(m.fields.desks, '책상 범위가 모델에 없다');
  assert.equal(m.fields.desks.count, 17, '책상 수가 달라졌다(강사 책상 포함)');
  assert.deepEqual(
    Object.fromEntries(['x0', 'x1', 'z0', 'z1'].map(k => [k, +m.fields.desks[k].toFixed(3)])),
    { x0: 2.150, x1: 9.850, z0: 0.640, z1: 7.525 }, '책상 묶음의 범위가 달라졌다');

  // 책상 범위는 **구도 계산에 실제로 들어간다** — 의자를 빼고 책상만 넘기면 답이 달라진다.
  const 책상만 = trainingCameraPlan(m.room, m.led, 'interior', 16 / 9,
    { desks: m.fields.desks, seatPoints: m.fields.seatPoints });
  const 의자만 = trainingCameraPlan(m.room, m.led, 'interior', 16 / 9,
    { seats: m.fields.seats, seatPoints: m.fields.seatPoints });
  assert.notEqual(책상만.standOff, 의자만.standOff, '책상 범위가 구도 계산에 닿지 않는다');

  // 다만 이 배치에서는 책상 묶음과 의자 묶음의 중심이 같아서, 둘을 함께 넘긴 결과는
  // 의자만 넘긴 결과와 자리가 같다. 책상이 기여하는 것은 **화면 점유 측정**이다.
  const 함께 = trainingCameraPlan(m.room, m.led, 'interior', 16 / 9,
    { desks: m.fields.desks, seats: m.fields.seats, seatPoints: m.fields.seatPoints });
  assert.equal(의자만.deskShare, null, '책상을 안 넘겼는데 점유율이 나온다');
  assert.ok(함께.deskShare >= 0.65, `책상이 화면에서 밀려났다(${함께.deskShare})`);

  // 방 크기와 시점을 바꿔도 책상 묶음은 계속 화면 안에 남는다.
  // 기준값은 v440 에서 실제로 잰 값이다(책상 최저 0.6939, 의자 최저 0.3846 — 둘 다 천장 5m 칸).
  // 의자 점유율이 책상보다 낮은 까닭은, 뒤에서 보는 실내 시점에서 카메라 바로 앞의
  // 뒷줄 의자가 화면 아래로 빠지기 때문이다. 이것은 뒤에서 보는 구도의 정상적인 모습이다.
  for (const [tag, W, H, D, opt] of ROOMS) {
    const mm = modelOf(W, H, D, opt);
    for (const preset of TRAINING_CAMERA_PRESETS) {
      const plan = trainingCameraPlan(mm.room, mm.led, preset, 16 / 9,
        { desks: mm.fields.desks, seats: mm.fields.seats, seatPoints: mm.fields.seatPoints });
      assert.ok(plan.deskShare >= 0.69,
        `${tag}/${preset}: 책상 점유율이 낮다(${plan.deskShare})`);
      assert.ok(plan.seatsShare >= 0.38,
        `${tag}/${preset}: 의자 점유율이 낮다(${plan.seatsShare})`);
    }
  }

  // **화면이 실제로 쓰는 길**로도 책상 범위가 전달된다. 직접 호출만 검사하면
  // 화각 배분에서 `desks` 를 빼먹어도 아무 검사가 깨지지 않는다(역검증에서 확인).
  // 표는 v440 에서 실제로 잰 값이다. 한 칸이라도 흔들리면 구도가 바뀐 것이다.
  const 점유표 = {
    '컴팩트/interior': 0.8776, '컴팩트/corner-l': 0.9388, '컴팩트/corner-r': 0.9388,
    '기본/interior': 0.8367, '기본/corner-l': 0.8980, '기본/corner-r': 0.8980,
    '대형/interior': 0.8367, '대형/corner-l': 0.8980, '대형/corner-r': 0.8980,
    '깊은 방/interior': 0.9592, '깊은 방/corner-l': 0.9796, '깊은 방/corner-r': 0.9796,
    '높은 천장/interior': 0.6939, '높은 천장/corner-l': 0.8367, '높은 천장/corner-r': 0.8367,
  };
  for (const [tag, W, H, D, opt] of ROOMS) {
    const mm = modelOf(W, H, D, opt);
    for (const preset of TRAINING_CAMERA_PRESETS) {
      const viaDesign = cameraPlanForDesign(TR, preset, mm, 16 / 9);
      assert.notEqual(viaDesign.deskShare, null, `${tag}/${preset}: 화각에 책상 범위가 전달되지 않는다`);
      assert.equal(viaDesign.deskShare, 점유표[`${tag}/${preset}`],
        `${tag}/${preset}: 책상 점유율이 달라졌다(${viaDesign.deskShare})`);
    }
  }

  // 다른 공간에는 `desks` 가 생기지 않는다(강의실 배치에만 desk 항목이 있다).
  for (const [type, W, D] of [['meeting', 10000, 10000], ['hall_m', 18000, 20000], ['control', 16000, 14000]]) {
    const lay = layoutRoom(type, defaultOptions(type), { W, D });
    const mm = buildGLModel({ space: { W, H: 3500, D },
      led: { marginW: 1000, mount: 1000, w: 4000, h: 2300, depth: 60, cols: 4, rows: 4 },
      items: lay.items, roomType: type });
    assert.equal(mm.fields.desks, null, `${type}: 책상 범위가 생겼다`);
  }
});

// ── ③ 조명 ───────────────────────────────────────────────────────────────────

test('⑨ 교육장 조명 — 개수·종류는 그대로, 세기와 그림자만 바뀐다', () => {
  const l = lightingForDesign(TR);
  assert.ok(l, '교육장 조명이 붙지 않았다');
  assert.equal(l.id, 'trainingSoft');
  assert.deepEqual({ ...l.scale }, { hemi: 0.88, ceiling: 1.08, key: 1.05, fill: 1.50, ledSpill: 1.00 });
  assert.deepEqual({ ...shadowSettingsForDesign(TR) },
    { radius: 8, bias: -0.00035, normalBias: 0.030 });
  // **자리는 정하지 않았다** — 임원·대회의실·상황실에서 배운 대로 세기만 바꾼다.
  const ROOM = { W: 12, H: 3.4, D: 10 };
  assert.equal(keyLightPlacementForDesign(TR, ROOM), null, '주광 자리를 옮겼다');
  assert.equal(fillLightPlacementForDesign(TR, ROOM), null, '보조광 자리를 옮겼다');
  // 배수는 **기준값에 곱해질 뿐** 조명 개수를 늘리지 않는다.
  assert.deepEqual(Object.keys(l.scale).sort(), ['ceiling', 'fill', 'hemi', 'key', 'ledSpill']);
});

test('⑩ 조명 프리셋 5벌 — 기존 네 벌은 한 값도 바뀌지 않았다', () => {
  assert.deepEqual(Object.keys(LIGHTING_PRESETS),
    ['corporateSoft', 'executiveSoft', 'conferenceSoft', 'trainingSoft', 'controlTechnical']);
  assert.deepEqual({ ...LIGHTING_PRESETS.corporateSoft.scale },
    { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.executiveSoft.scale },
    { hemi: 1.05, ceiling: 0.30, key: 1.00, fill: 2.00, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.conferenceSoft.scale },
    { hemi: 1.18, ceiling: 0.28, key: 0.92, fill: 1.30, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.controlTechnical.scale },
    { hemi: 0.58, ceiling: 0.22, key: 0.98, fill: 2.00, ledSpill: 1.00 });
});

// ── ④ 건드리지 않은 것 ───────────────────────────────────────────────────────

test('⑪ 평면·정면·아이소는 교육장에서도 기술 시점 그대로다', () => {
  const m = modelOf(12000, 3400, 10000);
  for (const v of ['top', 'front', 'iso']) {
    assert.equal(cameraPlanForDesign(TR, v, m, 16 / 9), null, `${v}: 디자인이 가로챘다`);
    const a = presetPose(v, m, 16 / 9, { fov: 40, topPerspective: true });
    const b = presetPose(v, { ...m, design: 'corporateMeeting' }, 16 / 9, { fov: 40, topPerspective: true });
    assert.deepEqual(a, b, `${v}: 디자인에 따라 달라진다`);
  }
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id),
    ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top']);
  assert.equal(presetPose('top', m, 16 / 9, { fov: 40 }).ortho, true, '평면이 정사투영이 아니다');
  assert.equal(presetPose('top', m, 16 / 9, { fov: 40, topPerspective: true }).ortho, false,
    '평면 원근 전환이 사라졌다');
  assert.equal(presetPose('front', m, 16 / 9, { fov: 40 }).fov, FOV_DEG);
});

test('⑫ 릴리스된 네 공간의 화각 기준값이 그대로다', () => {
  assert.deepEqual({ ...CAMERA_PLANS.interior },
    { eye: 1.65, fov: 41, rearRatio: 0.06, drop: 0.35, xRatio: 0.5 });
  assert.deepEqual({ ...EXECUTIVE_CAMERA_PLANS.interior },
    { aim: 'frameTop', eye: 1.60, fov: 40, rearRatio: 0.04, xRatio: 0.5 });
  assert.equal(CONFERENCE_CAMERA_PLANS.interior.eye, 1.66);
  assert.equal(CONFERENCE_CAMERA_PLANS.interior.fov, 44);
  assert.equal(CONTROL_CAMERA_PLANS.interior.eye, 1.66);
  assert.equal(CONTROL_CAMERA_PLANS.interior.fov, 43);
  assert.equal(POLAR_GAP_PER_DIST, 0.025, '안전 여유를 줄이면 깊은 방에서 카메라가 떠오른다');
  // 교육장 눈높이도 그 범위 안이다(사람 눈높이).
  assert.ok(TRAINING_CAMERA_PLANS.interior.eye >= 1.6 && TRAINING_CAMERA_PLANS.interior.eye <= 1.75);
});

test('⑬ 배치·마감·가구는 이 단계에서 한 값도 바뀌지 않았다', () => {
  // 7-a 가 고친 강사 의자 자리 그대로.
  const lay = layoutRoom('classroom', defaultOptions('classroom'), { W: 12000, D: 10000, design: TR });
  const 강사의자 = lay.items.filter(i => i.type === 'chair').sort((a, b) => a.z - b.z)[0];
  assert.equal(강사의자.z, 325, '7-a 의 강사 의자 보정을 다시 손댔다');
  assert.deepEqual(lay.placed, { desks: 16, chairs: 16, cols: 4, rows: 4, perDesk: 1 });
  // 마감은 7-a 값 그대로.
  assert.equal(ROOM_DESIGNS[TR].palette, 'trainingNeutral');
  assert.equal(ROOM_DESIGNS[TR].materials.floor, 'carpetTile');
  assert.equal(ROOM_DESIGNS[TR].materials.deskTop, 'neutralLaminate');
  // 상태는 아직 planned 다 — 릴리스 판정은 7-c 다.
  assert.equal(ROOM_DESIGNS[TR].status, 'planned');
});
