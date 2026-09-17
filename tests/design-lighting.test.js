// design-lighting.test.js — 공간 디자인 조명 회귀 테스트. (PHASE 2-d.1)
// 이 단계에서 움직여도 되는 것은 **빛뿐**이다.
// 그래서 테스트의 절반은 "조명이 맞는가"이고, 나머지 절반은 **"빛 말고는 아무것도 안 움직였는가"**다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIGHTING_PRESETS, LIGHT_ROLES, SCALE_RANGE, MAX_ABS_INTENSITY, MAX_SHADOW_CASTERS,
  lightingPreset, lightingForDesign, applyDesignLighting,
  shadowSettingsForDesign, keyLightPlacementForDesign, keyShareOfLevels,
} from '../src/design-lighting.js';
import { ROOM_DESIGNS, DESIGN_IDS, INHERIT, resolveDesign } from '../src/room-design.js';
import { LIGHTS, CAMERA_PRESETS, presetPose, buildGLModel, FOV_DEG, FOV_RANGE, clampFov } from '../src/gl-model.js';
import { lightLevels, RENDER_MODES } from '../src/render-mode.js';
import { MOODS, MATERIAL_PRESETS, MATERIAL_IDS, PART_FINISH, PART_MATERIAL } from '../src/materials.js';
import { roomFinishForDesign, credenzaFinishForDesign, floorPartFinishForDesign } from '../src/design-finish.js';
import { createCorporateChair, createCorporateTable, createAvCredenza, DIMS, BOAT_BULGE_RATIO } from '../src/furniture-assets.js';

const base = { ...LIGHTS };

// ① 대기업 회의실만 새 조명
test('조명 프리셋 — 대기업 회의실만 새 조명을 쓴다', () => {
  assert.equal(ROOM_DESIGNS.corporateMeeting.lighting, 'corporateSoft');
  assert.ok(lightingForDesign('corporateMeeting'));
  const lv = applyDesignLighting(base, 'corporateMeeting');
  assert.notDeepEqual(lv, base, '세기가 그대로면 조명이 안 걸린 것이다');
});

// ② 조명을 선언하지 않은 공간은 기존 조명 그대로 — 이 단계에서 가장 중요한 테스트
const LIT = new Set(['corporateMeeting', 'executiveBoardroom', 'largeConference']);   // PHASE 2-d.1 · 3-d.1
test('다른 공간 — 조명이 한 값도 바뀌지 않는다', () => {
  for (const id of DESIGN_IDS) {
    if (LIT.has(id)) continue;
    assert.equal(lightingForDesign(id), null, `${id} 에 조명이 붙었다`);
    assert.deepEqual(applyDesignLighting(base, id), base, `${id} 세기가 바뀌었다`);
    assert.equal(shadowSettingsForDesign(id), null, `${id} 그림자 설정이 붙었다`);
    assert.equal(keyLightPlacementForDesign(id, { W: 10, H: 3.5, D: 8.5 }), null, `${id} 주광 자리가 바뀌었다`);
  }
  // 임원 회의실은 조명을 정했지만 **주광 자리는 정하지 않았다** — 그 자리는 기존 그대로다.
  assert.equal(keyLightPlacementForDesign('executiveBoardroom', { W: 10, H: 3.5, D: 8.5 }), null,
    '임원 회의실이 주광 자리를 옮긴다 — 실측에서 고치려던 것과 반대로 움직였다');
  // 디자인이 아예 없는 공간(강의실·강당·아이디에이션)도 마찬가지다.
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(lightingForDesign(id), null, String(id));
    assert.deepEqual(applyDesignLighting(base, id), base, String(id));
    assert.equal(shadowSettingsForDesign(id), null, String(id));
  }
});

// ③ 화면 프리셋 목록·기본 화각 무변경 — 조명 단계가 화각 '구조'를 건드리지 않았다
const CAMERA_DESIGNS = { corporateMeeting: 'corporateProposal', executiveBoardroom: 'executiveProposal',
  largeConference: 'conferenceProposal' };
test('화각 — 프리셋 목록·기본 화각·범위가 그대로다(PHASE 2-d.2 에서도 늘리지 않았다)', () => {
  // 아직 구현 전인 공간은 여전히 화각을 적용하지 않는다(planned = '아직 없음').
  for (const id of DESIGN_IDS) {
    if (CAMERA_DESIGNS[id]) { assert.equal(resolveDesign(id).camera, CAMERA_DESIGNS[id], id); continue; }
    assert.equal(resolveDesign(id).camera, INHERIT, `${id}: 화각을 적용하면 안 된다`);
  }
  assert.equal(ROOM_DESIGNS.corporateMeeting.camera, 'corporateProposal');
  // 프리셋 목록과 기본 화각을 스냅샷으로 고정한다.
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id),
    ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top']);
  assert.equal(FOV_DEG, 40);
  assert.deepEqual({ ...FOV_RANGE }, { min: 24, max: 75, step: 1, default: 40 });
  assert.equal(clampFov(40), 40);
  // 같은 모델에서 같은 시점이 나오는지 — 조명을 바꿔도 카메라 계산은 그대로다.
  const model = buildGLModel({
    space: { W: 10000, H: 3500, D: 8500 }, led: { w: 3840, h: 2160, bottom: 1000 },
    roomType: 'meeting', roomOpts: { tableShape: 'boat', seats: 12, credenza: true },
    design: 'corporateMeeting',
  });
  const pose = presetPose('interior', model, 16 / 9, {});
  assert.deepEqual(pose.position.map(v => +v.toFixed(6)), pose.position.map(v => +v.toFixed(6)));
  assert.equal(typeof pose.fov, 'number');
  assert.ok(pose.fov >= FOV_RANGE.min && pose.fov <= FOV_RANGE.max);
});

// ④⑤⑥ 의자·테이블 동결
test('의자·테이블 동결 — 조명 단계에서 형상·마감이 움직이지 않는다', () => {
  const chair = createCorporateChair();
  assert.equal(chair.length, 12);
  assert.equal(chair.filter(p => p.shape === 'star').length, 1);
  assert.equal(DIMS.corporateChair.seatTop, 450);
  assert.equal(DIMS.corporateChair.overallH, 1040);
  assert.equal(PART_FINISH.chairFrame.color, '#3a3e44');
  assert.equal(PART_FINISH.chairMesh.color, '#454a51');

  const t = createCorporateTable({ shape: 'boat', w: 4000, d: 1500 });
  assert.equal(t.surfaceY, 740);
  assert.equal(t.topThk, 25);
  assert.equal(BOAT_BULGE_RATIO, 0.08);
  assert.equal(t.bulge, 120);
  assert.deepEqual(t.supports.map(s => s.dx), [-1050, 1050]);
  assert.equal(PART_FINISH.corporateTop.color, '#e9e4da');
});

// ⑦⑧ 바닥·벽·수납장·러그 마감 무변경
test('마감 동결 — PHASE 2-c 결과가 한 값도 안 바뀐다(재질로 노출을 보정하지 않았다)', () => {
  const f = roomFinishForDesign('corporateMeeting');
  assert.equal(f.floor.material, 'carpetTileLight');
  assert.equal(f.floor.color, '#b9bab8');
  assert.equal(f.wallFront.color, '#f1efea');
  assert.equal(f.wallSide.color, '#eae7e1');
  const c = credenzaFinishForDesign('corporateMeeting');
  assert.equal(c.credenzaBody.color, '#262a30');
  assert.equal(c.credenzaBody.canonical, 'blackEquipment');
  const r = floorPartFinishForDesign('corporateMeeting');
  assert.equal(r.rug.color, '#c6c5c1');
  assert.equal(PART_MATERIAL.rug, 'carpetTile');
  // 카펫 결을 세게 하지 않았다 — 안 보이면 조명에서 푼다(오너 지침 §12).
  assert.equal(MATERIAL_PRESETS.carpetTile.normalScale, 0.28);
  assert.equal(MATERIAL_PRESETS.carpetTile.tileMm, 500);
  // 상판 색을 어둡게 하지 않았다(오너 지침 §5).
  assert.equal(MATERIAL_PRESETS.neutralLaminate.color, '#e8e4dc');
  assert.equal(MATERIAL_PRESETS.neutralLaminate.roughness, 0.58);
});

// ⑨ LED 무변경
test('LED 동결 — 재질·발광이 그대로이고 스필광 배수도 1.0이다', () => {
  assert.equal(LIGHTING_PRESETS.corporateSoft.scale.ledSpill, 1.0, 'LED 스필을 건드리면 안 된다');
  const lv = applyDesignLighting(base, 'corporateMeeting');
  assert.equal(lv.ledSpill, base.ledSpill, 'LED 스필 세기가 바뀌었다');
  // LED 화면은 실내 마감재가 아니라 재질 라이브러리에 없다 — 그 사실 자체를 고정한다.
  assert.ok(!MATERIAL_IDS.includes('ledPanel'));
});

// ⑩ 정식 재질 13종
test('정식 재질 13종 — 조명 단계에서 재질이 늘지 않는다', () => {
  assert.equal(MATERIAL_IDS.length, 13);
});

// ⑪⑫ 전역 톤매핑·노출 무변경
test('전역 노출·톤매핑 무변경 — 렌더러 설정을 건드리지 않았다', () => {
  const src = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const k of ['toneMapping', 'toneMappingExposure']) {
    assert.ok(!new RegExp(`renderer\\.${k}\\s*=`).test(code),
      `renderer.${k} 을 바꾸면 **모든 공간**이 같이 바뀐다`);
  }
  // 색공간도 그대로여야 한다(감마 꼼수 금지).
  const cs = code.match(/renderer\.outputColorSpace\s*=\s*([^\n;]+)/);
  assert.ok(cs && /SRGBColorSpace/.test(cs[1]), `출력 색공간이 바뀌었다: ${cs && cs[1]}`);
  // 기준 조명값(LIGHTS)도 그대로 — 여기를 바꾸면 전역이다.
  assert.deepEqual({ ...LIGHTS },
    { hemi: 1.85, ceiling: 1.15, key: 1.15, fill: 0.40, ledSpill: 0.55 });
});

// ⑭ 그림자 예산
test('그림자 — 만드는 조명은 하나뿐이고, 더 넓고 부드러워졌다', () => {
  assert.equal(MAX_SHADOW_CASTERS, 1);
  const src = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const casters = [...code.matchAll(/(\w+)\.castShadow\s*=\s*true/g)].map(m => m[1]);
  assert.deepEqual([...new Set(casters)], ['key'], `그림자 조명이 늘었다: ${casters.join(', ')}`);
  // 조명 개수 자체도 그대로 — 새 Light를 만들지 않았다.
  const made = [...code.matchAll(/new THREE\.(\w*Light)\(/g)].map(m => m[1]);
  assert.deepEqual(made.sort(), ['DirectionalLight', 'DirectionalLight', 'DirectionalLight',
    'HemisphereLight', 'PointLight'], `조명 구성이 바뀌었다: ${made.join(', ')}`);

  const sh = shadowSettingsForDesign('corporateMeeting');
  assert.ok(sh.radius > 4, `흐림 반경이 기본(4)보다 커야 부드러워진다 — 지금 ${sh.radius}`);
  assert.ok(sh.radius <= 16, '너무 키우면 접지감이 사라진다');
  assert.ok(sh.bias < 0 && sh.bias > -0.002, `bias ${sh.bias}`);
  assert.ok(sh.normalBias > 0 && sh.normalBias < 0.1, `normalBias ${sh.normalBias}`);
});

// 조명 배수의 안전 범위 + 실제 의도 확인
test('조명 배수 — 안전 범위 안이고, 위를 보는 면을 가장 많이 줄인다', () => {
  for (const p of Object.values(LIGHTING_PRESETS)) {
    for (const role of LIGHT_ROLES) {
      const k = p.scale[role];
      assert.equal(typeof k, 'number', `${p.id}.${role}`);
      assert.ok(k >= SCALE_RANGE.min && k <= SCALE_RANGE.max, `${p.id}.${role} = ${k} 가 범위 밖`);
    }
  }
  const lv = applyDesignLighting(base, 'corporateMeeting');
  for (const role of LIGHT_ROLES) {
    assert.ok(lv[role] <= MAX_ABS_INTENSITY, `${role} 절대 세기 ${lv[role]} 가 상한을 넘는다`);
  }
  // 천장등을 가장 많이 줄였는가 — 상판·바닥만 때리는 유일한 조명이다.
  const s = LIGHTING_PRESETS.corporateSoft.scale;
  assert.ok(s.ceiling < s.hemi && s.ceiling < s.key, '천장등이 가장 많이 줄어야 한다');
  // 전체는 줄이되 너무 어두워지면 '칙칙한 회색 방'이 된다.
  const total = lv.hemi + lv.ceiling + lv.key + lv.fill;
  const before = base.hemi + base.ceiling + base.key + base.fill;
  assert.ok(total < before, '전체 빛이 줄어야 상판이 안 날아간다');
  assert.ok(total / before > 0.6, `너무 많이 줄였다(${(total / before).toFixed(2)}) — 방이 칙칙해진다`);
  // 그림자가 진해지지 않게 주광 비중을 지킨다.
  assert.ok(keyShareOfLevels(lv) < 0.35,
    `주광 비중 ${keyShareOfLevels(lv).toFixed(3)} — 그림자가 검은 얼룩이 된다`);
});

// 표현 방식(심플/실사)·분위기와 함께 곱해져도 순서가 맞는가
test('조명 배수 — 표현 방식·분위기 위에 얹힌다(대체하지 않는다)', () => {
  for (const mode of Object.keys(RENDER_MODES)) {
    const lv0 = lightLevels(LIGHTS, mode, MOODS.office.light);
    const lv1 = applyDesignLighting(lv0, 'corporateMeeting');
    for (const role of LIGHT_ROLES) {
      const k = LIGHTING_PRESETS.corporateSoft.scale[role];
      assert.ok(Math.abs(lv1[role] - lv0[role] * k) < 1e-9, `${mode}/${role}`);
    }
    // 심플 모드에서는 무늬·그림자가 꺼진다 — 그 규칙은 그대로다.
    assert.equal(RENDER_MODES[mode].texture, mode === 'simple' ? 0 : 1);
  }
});

// 주광 자리 — 방 크기에 비례하고, 더 높은 각도다
test('주광 자리 — 방 크기에 비례하고 기본보다 높은 각도다(긴 저녁 그림자 금지)', () => {
  for (const room of [{ W: 6, H: 3, D: 5 }, { W: 10, H: 3.5, D: 8.5 }, { W: 20, H: 4, D: 15 }]) {
    const k = keyLightPlacementForDesign('corporateMeeting', room);
    assert.ok(k, '주광 자리가 없다');
    assert.ok(Math.abs(k.position.x / room.W - 0.36) < 1e-9, '방 크기에 비례해야 한다');
    // 기본은 H×2.2. 더 높아야 그림자가 짧아지고 '사무실 천장 조명'으로 읽힌다.
    assert.ok(k.position.y > room.H * 2.2, `주광 높이 ${k.position.y} 가 기본보다 낮다`);
    // 빛이 방 안쪽을 향해야 한다.
    assert.ok(k.target.y < k.position.y, '주광이 위를 향하고 있다');
  }
});

// 순수 계층 · 불변 데이터 · 모르는 값 처리
test('순수 계층 — Three.js도 DOM도 쓰지 않고, 표는 얼어 있고, 모르는 값은 null이다', () => {
  const src = readFileSync(new URL('../src/design-lighting.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"].*three/i.test(src), 'Three.js 를 불러온다');
  assert.ok(!/\bdocument\.|\bwindow\.|new THREE\./.test(src), 'DOM 또는 THREE 객체를 쓴다');
  const frozen = (v, path) => {
    if (!v || typeof v !== 'object') return;
    assert.ok(Object.isFrozen(v), `${path} 가 얼어 있지 않다`);
    for (const [k, x] of Object.entries(v)) frozen(x, `${path}.${k}`);
  };
  frozen(LIGHTING_PRESETS, 'LIGHTING_PRESETS');
  for (const v of [null, undefined, '없는프리셋', 0, {}, []]) assert.equal(lightingPreset(v), null, String(v));
  // 세기 객체를 넘기지 않아도 터지지 않는다.
  assert.equal(applyDesignLighting(null, 'corporateMeeting'), null);
  assert.equal(keyLightPlacementForDesign('corporateMeeting', null), null);
});

// 어댑터가 실제로 연결되어 있는가(PHASE 2-c 에서 import 누락으로 화면이 죽은 적이 있다)
test('어댑터 — 조명 해석기를 실제로 불러 쓰고, 정하지 않은 공간은 기본값으로 되돌린다', () => {
  const src = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const n of ['applyDesignLighting', 'shadowSettingsForDesign', 'keyLightPlacementForDesign']) {
    assert.ok(new RegExp(`\\b${n}\\s*\\(`).test(code), `${n} 을 쓰지 않는다`);
    assert.ok(new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from`, 's').test(code),
      `${n} 을 import 하지 않는다 — 화면이 죽는다`);
  }
  assert.match(code, /applyDesignLighting\(\s*lightLevels\([^)]*\)\s*,\s*model\.design\s*\)/,
    '디자인 배수가 기존 세기 계산 **위에** 얹히지 않았다');
  // 디자인이 없으면 그림자 기본값으로 되돌아와야 한다(값이 다른 공간으로 새지 않게).
  assert.match(code, /shadowSettingsForDesign\([^)]*\)\s*\|\|\s*SHADOW_DEFAULTS/);
  assert.match(code, /SHADOW_DEFAULTS = Object\.freeze\(\{ radius: 4, bias: -0\.0006, normalBias: 0\.02 \}\)/);
});
