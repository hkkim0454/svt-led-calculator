// 3D 눈높이(오너 요청 2026-10-20) — 정면·좌측 코너·우측 코너는 앉은 눈높이(기본 1.2 m)에서 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { presetPose, settledPose, poseAtEye, clampEyeMm, floorUnder, nearestSeat, EYE3D, EYE_PRESET_IDS,
  buildGLModel } from '../src/gl-model.js';
import { CONFIG_DEFAULTS, normalizeConfig } from '../src/config.js';

const model = buildGLModel({
  space: { W: 8000, H: 3400, D: 7000, wallThk: 100 },
  led: { w: 3840, h: 2160, marginW: 2080, mount: 1000, cols: 4, rows: 4, depth: 60 },
  items: [], show: {},
});

test('① 기본값은 앉은 눈높이 1.2 m, 대상 시점은 정면·좌우 코너', () => {
  assert.equal(EYE3D.seated, 1200);
  assert.equal(CONFIG_DEFAULTS.eye3d, 1200);
  assert.deepEqual([...EYE_PRESET_IDS], ['front', 'corner-l', 'corner-r']);
});

test('② 눈높이를 주면 세 시점의 카메라가 그 높이에 서고, 조작기가 끌어올리지 않는다', () => {
  for (const id of EYE_PRESET_IDS) {
    const p = presetPose(id, model, 16 / 9, { eye: 1200 });
    assert.equal(p.position[1], 1.2, id);
    const s = settledPose(p);
    assert.ok(Math.abs(s.position[1] - 1.2) < 1e-9, `${id} 조작기 보정 뒤 ${s.position[1]}`);
  }
});

test('③ 눈높이가 없으면(null) 예전 시점 그대로 — 실내·아이소·평면도는 언제나 그대로', () => {
  for (const id of ['front', 'corner-l', 'corner-r', 'interior', 'iso', 'top']) {
    assert.deepEqual(presetPose(id, model, 16 / 9, {}), presetPose(id, model, 16 / 9, { eye: null }), id);
  }
  for (const id of ['interior', 'iso', 'top']) {
    assert.deepEqual(presetPose(id, model, 16 / 9, { eye: 1200 }), presetPose(id, model, 16 / 9, {}), id);
  }
});

test('④ 값 정리 — 범위로 자르고, 숫자가 아니면 null', () => {
  assert.equal(clampEyeMm(1600), 1600);
  assert.equal(clampEyeMm(100), EYE3D.min);
  assert.equal(clampEyeMm(9999), EYE3D.max);
  for (const bad of [null, undefined, '', 'abc', 0, -5]) assert.equal(clampEyeMm(bad), null, String(bad));
  assert.equal(normalizeConfig({}).eye3d, 1200);
  assert.equal(normalizeConfig({ eye3d: null }).eye3d, null);
  assert.equal(normalizeConfig({ eye3d: '1600' }).eye3d, 1600);
});

test('⑤ 계단식 객석 — 단 위에서는 단 윗면부터 재고, 가까운 객석에 앉는다', () => {
  const items = [
    { type: 'riser', x: 4000, z: 9000, w: 8000, d: 2000, h: 220 },
    { type: 'seat', x: 4000, z: 9400 }, { type: 'chair', x: 4000, z: 9900 },
  ];
  assert.equal(floorUnder(items, 4000, 9400), 220);
  assert.equal(floorUnder(items, 4000, 11000), 0);
  assert.equal(nearestSeat(items, 4000, 10330, 1200)?.z, 9400);   // 회의 의자(chair)로는 옮기지 않는다
  const pose = { ortho: false, position: [4, 1.6, 10.33], target: [4, 1.4, 0.08], up: [0, 1, 0], fov: 40 };
  const p = poseAtEye(pose, 1200, { H: 6 }, items);
  assert.deepEqual(p.position.map(v => +v.toFixed(3)), [4, 1.42, 9.4]);
});

test('⑥ 화면 배선 — 패널 버튼·저장·뷰어 옵션', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /let view3dOpts = \{ fov: FOV_RANGE\.default, topPerspective: true, eye: CONFIG_DEFAULTS\.eye3d \};/);
  assert.match(app, /eye3d: view3dOpts\.eye,/);
  assert.match(app, /data-eye3d=/);
  const gl = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /const eye = 'eye' in next \? clampEyeMm\(next\.eye\) : viewOpts\.eye;/);
});
