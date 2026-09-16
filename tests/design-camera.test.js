// design-camera.test.js — 공간 디자인 카메라 회귀 테스트. (PHASE 2-d.2)
// 이번 단계에서 움직여도 되는 것은 **카메라뿐**이다.
// 그래서 절반은 "구도가 맞는가"이고, 나머지 절반은 **"카메라 말고는 아무것도 안 움직였는가"**다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CORPORATE_CAMERA_PRESETS, CAMERA_PLANS, EYE_RANGE, CORPORATE_FOV_RANGE, WALL_MARGIN,
  LED_TOP_MARGIN_RATIO,
  POLAR_GAP_PER_DIST, MIN_EYE_ABOVE_TARGET, eyeAboveTargetFor,
  corporateCameraPlan, corporateCameraPlanId, cameraPlanForDesign, corporateCameraPresets,
} from '../src/design-camera.js';
import {
  buildGLModel, presetPose, CAMERA_PRESETS, FOV_DEG, FOV_RANGE, TOP_PITCH_DEG, LIGHTS,
} from '../src/gl-model.js';
import { ROOM_DESIGNS, DESIGN_IDS, INHERIT, resolveDesign } from '../src/room-design.js';
import { layoutRoom } from '../src/room-presets.js';
import { LIGHTING_PRESETS, applyDesignLighting, shadowSettingsForDesign } from '../src/design-lighting.js';
import { roomFinishForDesign, credenzaFinishForDesign, floorPartFinishForDesign } from '../src/design-finish.js';
import { createCorporateChair, createCorporateTable, BOAT_BULGE_RATIO, DIMS } from '../src/furniture-assets.js';
import { PART_FINISH, MATERIAL_PRESETS, MATERIAL_IDS } from '../src/materials.js';

// 검증용 방 3종 + LED 변형 2종. **모두 같은 규칙으로 만든다**(10m 전용 상수가 없다는 것을 보이기 위해).
const ROOMS = [
  ['Small', 6000, 3000, 5500, 2400, 1350],
  ['Medium', 10000, 3500, 8500, 3840, 2160],
  ['Large', 14000, 4000, 12000, 5000, 2810],
  ['WideLED', 10000, 3500, 8500, 7680, 2160],
  ['TallLED', 10000, 3500, 8500, 3840, 3000],
];
const modelFor = (W, H, D, lw, lh) => {
  const lay = layoutRoom('meeting', { tableShape: 'boat', seats: 12, credenza: true },
    { W, D, ledBottom: 1000 });
  return buildGLModel({
    space: { W, H, D },
    led: { w: lw, h: lh, mount: 1000, marginW: (W - lw) / 2, depth: 60, cols: 1, rows: 1 },
    items: lay.items || lay, roomType: 'meeting', design: 'corporateMeeting',
  });
};
const ASPECTS = [16 / 9, 1.24, 4 / 3, 21 / 9, 0.85];   // 와이드 · 실제 캔버스 · 노트북 · 초와이드 · 좁은 화면

// ①②③ 눈높이·화각·시선 높이
test('실내 시점 — 사람 눈높이, 안정된 화각, 시선은 LED 중심보다 낮다', () => {
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    const ledCenterY = m.led.y + m.led.h / 2;
    for (const pre of CORPORATE_CAMERA_PRESETS) {
      const p = corporateCameraPlan(m.room, m.led, pre, 1.24);
      assert.ok(p, `${name}/${pre}: 계획이 없다`);
      assert.ok(p.position[1] >= EYE_RANGE.min && p.position[1] <= EYE_RANGE.max,
        `${name}/${pre}: 눈높이 ${p.position[1]} — 사람 키 범위 밖(미니어처 시점)`);
      assert.ok(p.position[1] <= 2.0, `${name}/${pre}: 2m 넘는 시점은 내려다보는 그림이 된다`);
      assert.ok(p.fov >= CORPORATE_FOV_RANGE.min && p.fov <= CORPORATE_FOV_RANGE.max,
        `${name}/${pre}: 화각 ${p.fov} — 광각 왜곡 또는 답답한 망원`);
      assert.ok(p.target[1] < ledCenterY,
        `${name}/${pre}: 시선(${p.target[1]})이 LED 중심(${ledCenterY})보다 낮아야 테이블이 보인다`);
    }
  }
});

// 시선이 눈높이 위로 올라가지 않는다 — OrbitControls 구조 제약
test('시선 — 눈높이보다 항상 낮다(조작기가 카메라를 끌어올리지 못하게)', () => {
  assert.ok(POLAR_GAP_PER_DIST > Math.tan(0.02), '조작기의 극각 한계보다 여유가 커야 한다');
  assert.equal(eyeAboveTargetFor(0), MIN_EYE_ABOVE_TARGET);
  assert.ok(eyeAboveTargetFor(12) > eyeAboveTargetFor(6), '거리가 멀수록 더 큰 높이차가 필요하다');
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    for (const pre of CORPORATE_CAMERA_PRESETS) {
      const p = corporateCameraPlan(m.room, m.led, pre, 1.24);
      const dz = p.position[2] - m.led.depth;
      const gap = p.position[1] - p.target[1];
      assert.ok(gap > 0, `${name}/${pre}: 위를 보고 있다(조작기가 카메라를 끌어올린다)`);
      assert.ok(gap >= dz * Math.tan(0.02),
        `${name}/${pre}: 높이차 ${gap.toFixed(3)} 가 거리 ${dz.toFixed(1)}m 에 비해 부족하다`);
    }
  }
});

// ④⑤ 카메라·시선이 방 안에 있다
test('안전 — 카메라와 시선이 방 밖·바닥 아래·천장 위로 나가지 않는다', () => {
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    const { W, H, D } = m.room;
    for (const pre of CORPORATE_CAMERA_PRESETS) {
      const p = corporateCameraPlan(m.room, m.led, pre, 1.24);
      const [x, y, z] = p.position;
      assert.ok(x >= WALL_MARGIN && x <= W - WALL_MARGIN, `${name}/${pre}: 좌우 벽 밖 (x=${x})`);
      assert.ok(y >= WALL_MARGIN && y <= H - WALL_MARGIN, `${name}/${pre}: 바닥/천장 밖 (y=${y})`);
      assert.ok(z >= WALL_MARGIN && z <= D - WALL_MARGIN, `${name}/${pre}: 앞뒤 벽 밖 (z=${z})`);
      const [tx, ty, tz] = p.target;
      assert.ok(tx >= 0 && tx <= W, `${name}/${pre}: 시선 좌우 (x=${tx})`);
      assert.ok(ty >= WALL_MARGIN && ty <= H - WALL_MARGIN, `${name}/${pre}: 시선 높이 (y=${ty})`);
      assert.ok(tz >= 0 && tz <= D, `${name}/${pre}: 시선 앞뒤 (z=${tz})`);
      // 카메라는 뒷벽 쪽에 선다 — 앞쪽 절반에 서면 '뒤에서 보는 구도'가 아니다.
      assert.ok(z > D * 0.5, `${name}/${pre}: 카메라가 방 앞쪽에 있다 (z=${z}/${D})`);
      // 뒷벽에서 300~700mm 안쪽(오너 지침 §5).
      const inset = D - z;
      assert.ok(inset >= 0.30 && inset <= 0.75, `${name}/${pre}: 뒷벽 여유 ${inset.toFixed(2)}m`);
    }
  }
});

// ⑥⑦⑧ 방 크기 3종 · ⑨ LED 가시성 · ⑮ LED 변형
test('LED 가시성 — 작은 방·큰 방·아주 넓은 LED에서도 화면 안에 들어온다', () => {
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    // 실제로 쓰는 화면 비율(가로가 세로보다 넓은 경우)에서는 **언제나** 다 보여야 한다.
    for (const a of ASPECTS.filter(v => v >= 1)) {
      for (const pre of CORPORATE_CAMERA_PRESETS) {
        const p = corporateCameraPlan(m.room, m.led, pre, a);
        assert.ok(p.ledTopMargin > 0,
          `${name}/${pre}/비율${a.toFixed(2)}: LED 윗변이 잘린다 (여유 ${p.ledTopMargin})`);
        assert.ok(p.ledSideMargin > 0,
          `${name}/${pre}/비율${a.toFixed(2)}: LED 좌우가 잘린다 (여유 ${p.ledSideMargin})`);
        assert.equal(p.ledFullyVisible, true, `${name}/${pre}/비율${a.toFixed(2)}`);
      }
    }
  }
});

test('LED 가시성 — 담지 못하면 화각을 몰래 넓히지 않고 **못 담았다고 말한다**', () => {
  // 아주 넓은 LED(7.68m) + 세로로 긴 화면(0.85)은 화각 상한 안에서 담을 수 없다.
  //   여기서 화각을 더 넓히면 광각 왜곡이 생긴다(오너 지침 §15) — 늘리지 않고 알린다.
  const m = modelFor(...ROOMS.find(r => r[0] === 'WideLED').slice(1));
  const tight = corporateCameraPlan(m.room, m.led, 'interior', 0.85);
  assert.equal(tight.ledFullyVisible, false, '못 담는데 담았다고 답하면 안 된다');
  assert.equal(tight.fovCapped, true, '화각이 상한에서 멈춰야 한다');
  assert.ok(tight.fov <= CORPORATE_FOV_RANGE.max, `화각 ${tight.fov} 가 상한을 넘었다`);
  // 넉넉한 화면에서는 같은 LED도 다 담긴다.
  assert.equal(corporateCameraPlan(m.room, m.led, 'interior', 1.24).ledFullyVisible, true);
  // 보통 크기 LED는 좁은 화면에서도 담긴다.
  const med = modelFor(...ROOMS.find(r => r[0] === 'Medium').slice(1));
  assert.equal(corporateCameraPlan(med.room, med.led, 'interior', 0.85).ledFullyVisible, true);
});

// ⑩ 테이블 가시성 — 이번 단계의 핵심
test('테이블 가시성 — 시선이 테이블 쪽으로 충분히 내려온다(화면 하단에 자리가 생긴다)', () => {
  for (const [name, ...dims] of ROOMS) {
    const m = modelFor(...dims);
    const p = corporateCameraPlan(m.room, m.led, 'interior', 1.24);
    const dz = p.position[2] - m.led.depth;
    const halfV = dz * Math.tan(p.fov * Math.PI / 360);
    // 화면 아래 절반이 담는 세계 — 시선 높이에서 아래로 halfV 만큼.
    //   테이블 상판(0.74m)이 그 안에 들어와야 화면에 나타난다.
    const bottomAtLedPlane = p.target[1] - halfV;
    assert.ok(bottomAtLedPlane < 0.74,
      `${name}: 화면 아래 끝(${bottomAtLedPlane.toFixed(2)}m)이 상판(0.74m)보다 높다 — 테이블이 안 보인다`);
    // 바닥까지 보여야 앞쪽에 여유가 생긴다.
    assert.ok(bottomAtLedPlane < 0.2, `${name}: 바닥이 거의 안 보인다`);
    // 그렇다고 시선이 바닥을 향하면 LED가 위로 밀려난다.
    assert.ok(p.target[1] > 0.5, `${name}: 시선이 너무 낮다 (${p.target[1]})`);
  }
});

// ⑫ 화면 비율이 바뀌어도 안전
test('화면 비율 — 좁은 화면부터 초와이드까지 LED가 잘리지 않는다', () => {
  const m = modelFor(...ROOMS[1].slice(1));
  for (const a of ASPECTS) {
    const p = corporateCameraPlan(m.room, m.led, 'interior', a);
    assert.ok(p.ledTopMargin > 0 && p.ledSideMargin > 0, `비율 ${a.toFixed(2)}`);
    assert.ok(p.fov <= CORPORATE_FOV_RANGE.max, `비율 ${a.toFixed(2)}: 화각 ${p.fov}`);
  }
  // 좁은 화면일수록 가로가 부족하므로 화각이 넓어져야 한다(자동으로 따라오는지).
  const narrow = corporateCameraPlan(m.room, m.led, 'interior', 0.85);
  const wide = corporateCameraPlan(m.room, m.led, 'interior', 21 / 9);
  assert.ok(narrow.fov >= wide.fov, '좁은 화면에서 화각이 더 좁아지면 LED가 잘린다');
});

// ⑬⑭ 아이소·평면도 동결
test('아이소·평면도 동결 — 이 계획이 손대지 않는다', () => {
  assert.ok(!CORPORATE_CAMERA_PRESETS.includes('iso'));
  assert.ok(!CORPORATE_CAMERA_PRESETS.includes('top'));
  assert.equal(corporateCameraPlanId('corporateMeeting', 'iso'), null);
  assert.equal(corporateCameraPlanId('corporateMeeting', 'top'), null);
  assert.equal(corporateCameraPlan({ W: 10, H: 3.5, D: 8.5 }, { x: 3, y: 1, w: 3.8, h: 2.2, depth: 0.06 }, 'iso'), null);
  // 프리셋 목록·평면도 기울기·화각 상수는 그대로다.
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id),
    ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top']);
  assert.equal(FOV_DEG, 40);
  assert.equal(TOP_PITCH_DEG, 58);
  assert.deepEqual({ ...FOV_RANGE }, { min: 24, max: 75, step: 1, default: 40 });
  // 실제 계산 결과도 대조한다 — 아이소·평면도는 디자인이 있든 없든 같아야 한다.
  const m = modelFor(...ROOMS[1].slice(1));
  const plain = buildGLModel({
    space: { W: 10000, H: 3500, D: 8500 },
    led: { w: 3840, h: 2160, mount: 1000, marginW: 3080, depth: 60, cols: 1, rows: 1 },
    items: m.items, roomType: 'meeting', design: null,
  });
  for (const id of ['iso', 'top']) {
    assert.deepEqual(presetPose(id, m, 1.24, {}), presetPose(id, plain, 1.24, {}),
      `${id} 가 디자인 때문에 바뀌었다`);
  }
  // '정면(front)'도 이번 단계에서 다루지 않는다.
  assert.deepEqual(presetPose('front', m, 1.24, {}), presetPose('front', plain, 1.24, {}));
});

// ⑱ 다른 공간은 그대로
test('다른 공간 — 카메라가 한 값도 바뀌지 않는다', () => {
  for (const id of DESIGN_IDS) {
    if (id === 'corporateMeeting') continue;
    assert.equal(resolveDesign(id).camera, INHERIT, `${id}: 화각을 적용하면 안 된다`);
    for (const pre of CORPORATE_CAMERA_PRESETS) {
      assert.equal(corporateCameraPlanId(id, pre), null, `${id}/${pre}`);
    }
    assert.deepEqual([...corporateCameraPresets(id)], []);
  }
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(corporateCameraPlanId(id, 'interior'), null, String(id));
    assert.equal(cameraPlanForDesign(id, 'interior', modelFor(...ROOMS[1].slice(1)), 1.24), null, String(id));
  }
  // 디자인이 없는 모델은 기존 계산(INSIDE 표)을 그대로 쓴다.
  const m = modelFor(...ROOMS[1].slice(1));
  const plain = buildGLModel({
    space: { W: 10000, H: 3500, D: 8500 },
    led: { w: 3840, h: 2160, mount: 1000, marginW: 3080, depth: 60, cols: 1, rows: 1 },
    items: m.items, roomType: 'meeting', design: null,
  });
  const before = presetPose('interior', plain, 1.24, {});
  assert.equal(before.position[1], 1.75, '기존 실내 눈높이(1.75)가 그대로여야 한다');
  assert.equal(before.fov, 42, '기존 실내 화각(42)이 그대로여야 한다');
  assert.notDeepEqual(presetPose('interior', m, 1.24, {}), before, '대기업 회의실은 달라져야 한다');
});

// ⑮⑯⑰ 조명·재질·형상·배치 동결
test('조명 동결 — PHASE 2-d.1 결과가 한 값도 안 바뀐다', () => {
  const s = LIGHTING_PRESETS.corporateSoft.scale;
  assert.deepEqual({ ...s }, { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 });
  assert.deepEqual({ ...shadowSettingsForDesign('corporateMeeting') },
    { radius: 9, bias: -0.0004, normalBias: 0.035 });
  assert.deepEqual({ ...LIGHTS }, { hemi: 1.85, ceiling: 1.15, key: 1.15, fill: 0.40, ledSpill: 0.55 });
  const lv = applyDesignLighting(LIGHTS, 'corporateMeeting');
  assert.ok(Math.abs(lv.ceiling - 0.414) < 1e-9 && Math.abs(lv.fill - 0.76) < 1e-9);
});

test('재질·형상·배치 동결 — 카메라만 바뀌어야 한다', () => {
  const f = roomFinishForDesign('corporateMeeting');
  assert.equal(f.floor.color, '#b9bab8');
  assert.equal(f.wallFront.color, '#f1efea');
  assert.equal(credenzaFinishForDesign('corporateMeeting').credenzaBody.color, '#262a30');
  assert.equal(floorPartFinishForDesign('corporateMeeting').rug.color, '#c6c5c1');
  assert.equal(MATERIAL_IDS.length, 13);
  assert.equal(MATERIAL_PRESETS.neutralLaminate.color, '#e8e4dc');
  assert.equal(MATERIAL_PRESETS.carpetTile.normalScale, 0.28);
  assert.equal(PART_FINISH.chairFrame.color, '#3a3e44');

  assert.equal(createCorporateChair().length, 12);
  assert.equal(DIMS.corporateChair.overallH, 1040);
  const t = createCorporateTable({ shape: 'boat', w: 4000, d: 1500 });
  assert.equal(t.surfaceY, 740);
  assert.equal(t.topThk, 25);
  assert.equal(BOAT_BULGE_RATIO, 0.08);
  assert.equal(t.bulge, 120);

  // 배치도 그대로 — 카메라 단계가 좌석 수나 좌표를 건드리면 안 된다.
  const lay = layoutRoom('meeting', { tableShape: 'boat', seats: 12, credenza: true },
    { W: 10000, D: 8500, ledBottom: 1000 });
  const items = lay.items || lay;
  assert.equal(items.filter(i => i.type === 'chair').length, 12);
  assert.equal(items.filter(i => i.type === 'table').length, 1);
});

// ⑳㉑㉒ 순수 계층 · 불변 · 모르는 값
test('순수 계층 — Three.js도 DOM도 없고, 결과는 얼어 있고, 모르는 값은 null이다', () => {
  const src = readFileSync(new URL('../src/design-camera.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"].*three/i.test(src), 'Three.js 를 불러온다');
  assert.ok(!/\bdocument\.|\bwindow\.|new THREE\./.test(src), 'DOM 또는 THREE 객체를 쓴다');
  const m = modelFor(...ROOMS[1].slice(1));
  const p = corporateCameraPlan(m.room, m.led, 'interior', 1.24);
  assert.ok(Object.isFrozen(p));
  for (const bad of ['없는시점', null, undefined, '', 0, {}]) {
    assert.equal(corporateCameraPlan(m.room, m.led, bad, 1.24), null, String(bad));
  }
  assert.equal(corporateCameraPlan(null, m.led, 'interior'), null);
  assert.equal(corporateCameraPlan(m.room, null, 'interior'), null);
  // 대기업 회의실이 쓰는 시점 목록.
  assert.deepEqual([...corporateCameraPresets('corporateMeeting')],
    ['interior', 'corner-l', 'corner-r', 'rear']);
});

// 어댑터 연결 — PHASE 2-c 에서 import 누락으로 화면이 죽은 적이 있다
test('연결 — presetPose 가 계획을 실제로 불러 쓰고, 없으면 기존 계산으로 돌아간다', () => {
  const src = readFileSync(new URL('../src/gl-model.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/import\s*\{[^}]*\bcameraPlanForDesign\b[^}]*\}\s*from/.test(code),
    'cameraPlanForDesign 을 import 하지 않는다 — 화면이 죽는다');
  assert.match(code, /cameraPlanForDesign\(model\.design,\s*p\.id,\s*model,\s*a\)/);
  // 계획이 없으면 기존 INSIDE 표로 내려가야 한다.
  assert.match(code, /const s = INSIDE\[p\.id\] \|\| INSIDE\.interior;/);
  // 'rear'는 계산만 준비하고 화면 프리셋 목록에는 넣지 않았다(오너 지침 §10).
  assert.ok(!CAMERA_PRESETS.some(p => p.id === 'rear'), 'rear 를 화면 프리셋에 넣지 않았다');
});

// 선언값 자체를 고정한다 — 안전 clamp 가 잡아 주더라도 **의도가 바뀌면 알아야 한다.**
//   (clamp 만 믿으면 "눈높이 2.3m로 바꿨는데 테스트가 통과"하는 일이 생긴다.)
test('시점 선언값 — 사람 눈높이·안정된 화각·아래를 보는 시선으로 적혀 있다', () => {
  for (const [id, s] of Object.entries(CAMERA_PLANS)) {
    assert.ok(s.eye >= 1.55 && s.eye <= 1.80, `${id}: 선언된 눈높이 ${s.eye} — 사람이 서서 보는 높이가 아니다`);
    assert.ok(s.fov >= 38 && s.fov <= 46, `${id}: 선언된 화각 ${s.fov} — 광각 왜곡 또는 망원`);
    assert.ok(s.drop > 0, `${id}: drop ${s.drop} — 시선이 LED 중심보다 위를 향한다(테이블이 안 보인다)`);
    assert.ok(s.drop <= 0.60, `${id}: drop ${s.drop} — 너무 내리면 LED가 위로 밀린다`);
    assert.ok(s.rearRatio > 0 && s.rearRatio <= 0.12, `${id}: rearRatio ${s.rearRatio}`);
    assert.ok(s.xRatio >= 0.10 && s.xRatio <= 0.90, `${id}: xRatio ${s.xRatio}`);
  }
  // 기본 실내는 방 가운데에 선다.
  assert.equal(CAMERA_PLANS.interior.xRatio, 0.50);
  // 코너는 좌우 대칭이어야 한다.
  assert.ok(Math.abs(CAMERA_PLANS['corner-l'].xRatio + CAMERA_PLANS['corner-r'].xRatio - 1) < 1e-9);
  // LED 윗변 여유는 양수여야 한다 — 0 이하면 윗변이 화면 가장자리에 붙는다.
  assert.ok(LED_TOP_MARGIN_RATIO > 0 && LED_TOP_MARGIN_RATIO <= 0.25);
});

// 아이소·평면도의 **실제 숫자**를 스냅샷으로 고정한다.
//   디자인 유무 비교만으로는 두 쪽이 함께 바뀌면 못 잡는다(공용 상수를 고치는 경우).
test('아이소·평면도 — 실제 좌표·화각이 PHASE 2-d.1 과 똑같다', () => {
  const m = modelFor(...ROOMS[1].slice(1));
  const iso = presetPose('iso', m, 1.24, {});
  assert.equal(iso.fov, 30);
  assert.deepEqual(iso.position.map(v => +v.toFixed(3)), [18.47, 15.132, 23.795]);
  assert.deepEqual(iso.target.map(v => +v.toFixed(3)), [5, 1.225, 3.825]);
  const top = presetPose('top', m, 1.24, {});
  assert.equal(top.ortho, true);
  assert.deepEqual(top.target.map(v => +v.toFixed(3)), [5, 1.75, 4.25]);
  assert.equal(+top.orthoHeight.toFixed(3), 9.969);
});
