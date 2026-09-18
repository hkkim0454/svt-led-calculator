// control-camera.test.js — 상황실 제안용 화각 회귀 테스트. (PHASE 5-d.4)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① **그 공간에만 붙는가** — 회의실 3종의 화각이 한 값도 달라지지 않는가.
//   ② **LED 가 먼저인가** — 벽을 보여 주려다 LED 를 자르지 않는가.
//   ③ **벽이 실제로 읽히는가** — 이 단계가 풀려는 문제를 실제로 풀었는가.
//   ④ **배치·마감·조명·벽을 건드리지 않았는가** — 이번 단계는 카메라만 옮긴다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONTROL_CAMERA_PRESETS, CONTROL_CAMERA_PLANS, CONTROL_FOV_RANGE, CONTROL_BAND_MAX,
  CONTROL_STANDOFF, CAMERA_GLASS_CLEAR, controlCameraPlanId, controlCameraPresets,
  controlCameraPlan, controlFeaturePoints, cameraPlanForDesign,
  CONFERENCE_CAMERA_PLANS, CONFERENCE_FOV_RANGE, CAMERA_PLANS, EXECUTIVE_CAMERA_PLANS,
  EYE_RANGE,
} from '../src/design-camera.js';
import { ROOM_DESIGNS, DESIGN_IDS, isPlanned, resolveDesign } from '../src/room-design.js';
import { buildGLModel } from '../src/gl-model.js';
import { layoutRoom } from '../src/room-presets.js';
import { LIGHTING_PRESETS } from '../src/design-lighting.js';
import { DESIGN_PALETTES } from '../src/design-finish.js';
import { controlWallPlan } from '../src/control-walls.js';
import { MATERIAL_IDS } from '../src/materials.js';

const CR = 'controlRoom';
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const A = 1280 / 900;
const BASE = { consoleRows: 2, perRow: 4, tiers: 1, riserH: 200, tierStartRow: 0, backTable: true, plant: false };

function makeModel(W, H, D, extra = {}) {
  const lay = layoutRoom('control', { ...BASE, ...extra }, { W, D, design: CR });
  return buildGLModel({
    space: { W, H, D },
    led: { marginW: (W - 6000) / 2, mount: 1000, w: 6000, h: 2160, depth: 60, cols: 4, rows: 4 },
    items: lay.items, design: CR, roomType: 'control',
  });
}
const ROOMS = [['대형', 16000, 3900, 14000], ['중형', 12000, 3600, 10000], ['컴팩트', 10000, 3400, 8000]];
const plans = (extra = {}) => ROOMS.map(([n, W, H, D]) => {
  const m = makeModel(W, H, D, extra);
  return [n, m, Object.fromEntries(CONTROL_CAMERA_PRESETS.map(p => [p, cameraPlanForDesign(CR, p, m, A)]))];
});

// ── ① 붙는 자리 ────────────────────────────────────────────────────────────

test('① 상황실이 controlProposal 로 풀린다', () => {
  assert.equal(ROOM_DESIGNS[CR].camera, 'controlProposal');
  assert.equal(isPlanned(ROOM_DESIGNS[CR].camera), false);
  assert.deepEqual([...controlCameraPresets(CR)], [...CONTROL_CAMERA_PRESETS]);
  for (const p of CONTROL_CAMERA_PRESETS) assert.equal(controlCameraPlanId(CR, p), p);
});

test('② 다른 공간은 이 계열로 풀리지 않는다', () => {
  for (const id of DESIGN_IDS) {
    if (id === CR) continue;
    assert.deepEqual([...controlCameraPresets(id)], [], id);
    for (const p of CONTROL_CAMERA_PRESETS) assert.equal(controlCameraPlanId(id, p), null, `${id}/${p}`);
  }
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(controlCameraPlanId(id, 'interior'), null, String(id));
  }
});

test('③ 아이소·평면도·정면은 이 계열이 건드리지 않는다', () => {
  for (const p of ['iso', 'top', 'front']) {
    assert.equal(controlCameraPlanId(CR, p), null, p);
    assert.equal(cameraPlanForDesign(CR, p, makeModel(16000, 3900, 14000), A), null, p);
  }
});

// ── ② 기준값 ──────────────────────────────────────────────────────────────

test('④ 시점 기준값이 고정돼 있다', () => {
  assert.deepEqual(Object.keys(CONTROL_CAMERA_PLANS), ['interior', 'corner-l', 'corner-r', 'rear']);
  assert.deepEqual({ ...CONTROL_CAMERA_PLANS.interior },
    { eye: 1.66, fov: 43, band: 0.10, xRatio: 0.34, feature: 'glass', featureMix: 0.30 });
  assert.deepEqual({ ...CONTROL_CAMERA_PLANS['corner-l'] },
    { eye: 1.72, fov: 44, band: 0.12, xRatio: 0.15, feature: 'glass', featureMix: 0.42 });
  assert.deepEqual({ ...CONTROL_CAMERA_PLANS['corner-r'] },
    { eye: 1.72, fov: 44, band: 0.12, xRatio: 0.85, feature: 'acoustic', featureMix: 0.42 });
  assert.deepEqual({ ...CONTROL_CAMERA_PLANS.rear },
    { eye: 1.62, fov: 41, band: 0.09, xRatio: 0.50, feature: null, featureMix: 0 });
  assert.deepEqual({ ...CONTROL_FOV_RANGE }, { min: 38, max: 50 });
  assert.equal(CONTROL_BAND_MAX, 0.18);
  assert.equal(CAMERA_GLASS_CLEAR, 1.1);
});

test('⑤ 좌·우 코너가 서로 다른 벽을 맡는다 — 한 시점이 양쪽을 맡지 않는다', () => {
  assert.equal(CONTROL_CAMERA_PLANS['corner-l'].feature, 'glass');
  assert.equal(CONTROL_CAMERA_PLANS['corner-r'].feature, 'acoustic');
  // 왼쪽 벽(흡음)을 맡은 시점은 **오른쪽에 선다**. 벽을 보려면 반대편에 서야 하기 때문이다.
  assert.ok(CONTROL_CAMERA_PLANS['corner-r'].xRatio > 0.5);
  assert.ok(CONTROL_CAMERA_PLANS['corner-l'].xRatio < 0.5);
});

// ── ③ LED 가 먼저다 ────────────────────────────────────────────────────────

test('⑥ 방 3종 × 4시점 전부에서 LED 가 온전히 담긴다', () => {
  for (const [name, , ps] of plans()) {
    for (const [v, p] of Object.entries(ps)) {
      assert.ok(p, `${name}/${v}: 계획이 없다`);
      assert.equal(p.ledFullyVisible, true, `${name}/${v}: LED 가 잘렸다(${p.ledVisibleShare})`);
      assert.equal(p.ledVisibleShare, 1, `${name}/${v}`);
    }
  }
});

test('⑦ 단이 있어도, 콘솔을 최대로 채워도 LED 가 잘리지 않는다', () => {
  for (const extra of [{ tiers: 2 }, { tiers: 3, riserH: 300 }, { perRow: 12, consoleRows: 8 }, { backTable: false }]) {
    for (const [name, , ps] of plans(extra)) {
      for (const [v, p] of Object.entries(ps)) {
        assert.equal(p.ledFullyVisible, true, `${name}/${v}/${JSON.stringify(extra)}`);
      }
    }
  }
});

test('⑧ 화각·눈높이가 허용 범위 안이다', () => {
  for (const [name, , ps] of plans()) {
    for (const [v, p] of Object.entries(ps)) {
      assert.ok(p.fov >= CONTROL_FOV_RANGE.min && p.fov <= CONTROL_FOV_RANGE.max,
        `${name}/${v}: 화각 ${p.fov}`);
      assert.ok(p.eye >= EYE_RANGE.min && p.eye <= EYE_RANGE.max, `${name}/${v}: 눈높이 ${p.eye}`);
      assert.ok(p.ceilingBand >= 0 && p.ceilingBand <= CONTROL_BAND_MAX + 1e-6, `${name}/${v}`);
    }
  }
});

test('⑨ 카메라와 시선이 언제나 방 안에 있다', () => {
  for (const [name, m, ps] of plans()) {
    const { W, H, D } = m.room;
    for (const [v, p] of Object.entries(ps)) {
      const [x, y, z] = p.position;
      assert.ok(x > 0 && x < W, `${name}/${v}: x=${x}`);
      assert.ok(z > 0 && z < D, `${name}/${v}: z=${z}`);
      assert.ok(y > 0 && y < H, `${name}/${v}: y=${y}`);
      const [tx, ty, tz] = p.target;
      assert.ok(tx >= 0 && tx <= W && tz >= 0 && tz <= D && ty >= 0 && ty <= H, `${name}/${v}: 시선점`);
      // 시선은 **언제나 눈높이보다 낮다** — 조작기가 카메라를 끌어올리지 못하게.
      assert.ok(ty < y, `${name}/${v}: 시선이 눈높이보다 높다`);
    }
  }
});

// ── ④ 벽이 읽히는가 ────────────────────────────────────────────────────────

test('⑩ 담당 벽이 실제로 화면에 남는다 — 이 단계가 풀려는 문제다', () => {
  for (const [name, m, ps] of plans()) {
    const glass = controlWallPlan({ W: m.room.W * 1000, D: m.room.D * 1000, H: m.room.H * 1000,
      design: CR, items: layoutRoom('control', BASE, { W: m.room.W * 1000, D: m.room.D * 1000, design: CR }).items }).glass;
    for (const [v, p] of Object.entries(ps)) {
      const s = CONTROL_CAMERA_PLANS[v];
      if (!s.feature) { assert.equal(p.featureVisibleShare, null, `${name}/${v}: 맡지 않은 벽을 쟀다`); continue; }
      // 유리를 세우지 못한 방(좁은 방)이면 맡을 벽 자체가 없다 — 그때는 null 이 정답이다.
      if (s.feature === 'glass' && !glass) { assert.equal(p.featureVisibleShare, null, `${name}/${v}`); continue; }
      assert.ok(p.featureVisibleShare > 0, `${name}/${v}: 담당 벽이 하나도 안 보인다`);
      assert.equal(p.featureVisible, true, `${name}/${v}`);
    }
  }
});

test('⑪ 좁은 방에는 유리가 없으므로 맡을 벽도 없다고 정직하게 말한다', () => {
  const m = makeModel(10000, 3400, 8000);
  assert.deepEqual([...m.partitions], [], '좁은 방에 유리가 생겼다');
  const p = cameraPlanForDesign(CR, 'corner-l', m, A);
  assert.equal(p.feature, 'glass', '맡기로 한 벽 이름은 그대로다');
  assert.equal(p.featureVisibleShare, null, '없는 벽을 보인다고 하면 안 된다');
  // 흡음 벽은 방 껍데기라 언제나 있다.
  assert.ok(cameraPlanForDesign(CR, 'corner-r', m, A).featureVisibleShare > 0);
});

test('⑫ 벽 대표점은 계획이 세운 유리에서 읽는다 — 카메라가 자리를 정하지 않는다', () => {
  const room = { W: 16, H: 3.9, D: 14 };
  const parts = [{ role: 'partition', x: 13.606, z: 7.9, d: 12.2, w: 0.012, h: 3.9 }];
  const pts = controlFeaturePoints('glass', room, parts);
  assert.equal(pts.length, 3);
  for (const q of pts) assert.equal(q[0], 13.606, '유리 x 를 카메라가 다시 정했다');
  // 유리를 옮기면 대표점도 따라 옮겨진다.
  const moved = controlFeaturePoints('glass', room, [{ ...parts[0], x: 10 }]);
  for (const q of moved) assert.equal(q[0], 10);
  assert.equal(controlFeaturePoints('glass', room, []), null, '없는 유리를 지어냈다');
  assert.equal(controlFeaturePoints(null, room, parts), null);
  // 흡음 벽은 왼쪽 벽면(x≈0)이다.
  for (const q of controlFeaturePoints('acoustic', room, null)) assert.ok(q[0] < 0.1);
});

test('⑬ 카메라가 유리 파티션 안에 서지 않는다', () => {
  for (const [name, m, ps] of plans()) {
    const g = (m.partitions || []).find(q => q.role === 'partition');
    if (!g) continue;
    for (const [v, p] of Object.entries(ps)) {
      assert.ok(p.position[0] <= g.x - CAMERA_GLASS_CLEAR + 1e-9,
        `${name}/${v}: 카메라 x=${p.position[0]} 가 유리(x=${g.x})에 붙었다`);
    }
  }
});

test('⑭ 빈 바닥이 화면을 먹지 않는다 — 필요 이상 물러나지 않는다', () => {
  for (const [name, , ps] of plans()) {
    for (const [v, p] of Object.entries(ps)) {
      assert.ok(p.emptyFloor <= 2.6, `${name}/${v}: 빈 바닥 ${p.emptyFloor}m`);
      assert.ok(p.standOff >= CONTROL_STANDOFF.min - 1e-9, `${name}/${v}`);
    }
  }
});

// ── ⑤ 다른 계열 동결 ───────────────────────────────────────────────────────

test('⑮ 회의실 3종의 화각 기준값이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual({ ...CAMERA_PLANS.interior },
    { eye: 1.65, fov: 41, rearRatio: 0.06, drop: 0.35, xRatio: 0.50 });
  assert.deepEqual({ ...CONFERENCE_CAMERA_PLANS.interior },
    { eye: 1.66, fov: 44, band: 0.09, xRatio: 0.26, aimMix: 0.62, followX: 0.45, minOffset: 0 });
  assert.deepEqual({ ...CONFERENCE_FOV_RANGE }, { min: 36, max: 46 });
  assert.ok(EXECUTIVE_CAMERA_PLANS.interior, '임원 계열이 사라졌다');
  // 상황실 계열이 회의실 계열 함수를 고쳐 쓰지 않았다(대회의실 함수는 동결).
  const code = src('design-camera.js');
  assert.ok(/export function conferenceCameraPlan\(/.test(code));
  assert.ok(/export function controlCameraPlan\(/.test(code));
  assert.equal(/CAMERA_GLASS_CLEAR/.test(code.slice(0, code.indexOf('상황실 카메라 (PHASE 5-d.4)'))), false,
    '상황실 전용 규칙이 앞선 계열 함수에 섞였다');
});

test('⑯ 회의실 3종의 화각이 그대로 자기 계열로 풀린다', () => {
  const CAM = { corporateMeeting: 'corporateProposal', executiveBoardroom: 'executiveProposal',
    largeConference: 'conferenceProposal' };
  for (const [id, want] of Object.entries(CAM)) {
    assert.equal(resolveDesign(id).camera, want, id);
    assert.equal(controlCameraPlanId(id, 'interior'), null, `${id} 가 상황실 계열로 샜다`);
  }
});

// ── ⑥ 앞 단계 동결 ─────────────────────────────────────────────────────────

test('⑰ 조명·마감·벽 구성이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual({ ...LIGHTING_PRESETS.controlTechnical.scale },
    { hemi: 0.58, ceiling: 0.22, key: 0.98, fill: 2.00, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.controlTechnical.shadow },
    { radius: 11, bias: -0.00035, normalBias: 0.030 });
  const P = DESIGN_PALETTES.controlPalette;
  assert.equal(P.floor, '#8d9095');
  assert.equal(P.wallAccent, '#5a6068');
  assert.equal(P.consoleTop, '#d7dadd');
  assert.equal(ROOM_DESIGNS[CR].wallTreatment, 'controlWalls');
  assert.equal(ROOM_DESIGNS[CR].lighting, 'controlTechnical');
  assert.equal(MATERIAL_IDS.length, 13);
});

test('⑱ 배치·AV·단 높이가 한 자리도 바뀌지 않았다', () => {
  const lay = layoutRoom('control', BASE, { W: 16000, D: 14000, design: CR });
  const n = t => lay.items.filter(i => i.type === t).length;
  assert.equal(n('console'), 8);
  assert.equal(n('chair'), 16);
  assert.equal(n('monitor'), 16);
  assert.equal(n('keyboard'), 8);
  const c0 = lay.items.find(i => i.type === 'console');
  assert.deepEqual({ x: c0.x, z: c0.z, w: c0.w, d: c0.d }, { x: 5000, z: 3050, w: 1800, d: 900 });
  const tier = layoutRoom('control', { ...BASE, tiers: 2 }, { W: 16000, D: 14000, design: CR });
  assert.deepEqual([...new Set(tier.items.filter(i => i.type === 'console').map(i => i.y))].sort((a, b) => a - b), [0, 200]);
  // 유리 파티션 자리도 그대로다.
  const plan = controlWallPlan({ W: 16000, D: 14000, H: 3900, design: CR, items: lay.items });
  assert.equal(plan.glass.x, 13606);
  assert.equal(plan.glass.d, 12200);
});

test('⑲ 카메라는 배치를 읽기만 한다 — 같은 입력이면 같은 결과다', () => {
  const m = makeModel(16000, 3900, 14000);
  const before = JSON.stringify({ items: m.items, partitions: m.partitions });
  const a = cameraPlanForDesign(CR, 'corner-l', m, A);
  const b = cameraPlanForDesign(CR, 'corner-l', m, A);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(JSON.stringify({ items: m.items, partitions: m.partitions }), before, '배치가 바뀌었다');
});

test('⑳ 소품만 남았다 — 상태는 승급하지 않았다', () => {
  const d = ROOM_DESIGNS[CR];
  assert.ok(isPlanned(d.accessories), '소품을 건드렸다');
  assert.equal(d.status, 'planned', '릴리스 판정은 PHASE 5-e 의 몫이다');
});
