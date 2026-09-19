// control-lighting.test.js — 상황실 기술 조명 회귀 테스트. (PHASE 5-d.3)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① **그 공간에만 붙는가** — 회의실 3종의 조명이 한 값도 달라지지 않는가.
//   ② **조명 구성이 늘지 않았는가** — 그림자를 만드는 조명은 여전히 하나뿐인가.
//   ③ **렌더러 전역을 건드리지 않았는가** — 노출·톤매핑·색공간은 조명의 일이 아니다.
//   ④ **형상·마감·벽·화각이 그대로인가** — 이번 단계는 빛만 바꾼다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LIGHTING_PRESETS, LIGHT_ROLES, SCALE_RANGE, MAX_ABS_INTENSITY, MAX_SHADOW_CASTERS,
  lightingPreset, lightingForDesign, applyDesignLighting, shadowSettingsForDesign,
  keyLightPlacementForDesign, fillLightPlacementForDesign, keyShareOfLevels,
} from '../src/design-lighting.js';
import { ROOM_DESIGNS, DESIGN_IDS, isPlanned, resolveDesign } from '../src/room-design.js';
import { LIGHTS, buildGLModel } from '../src/gl-model.js';
import { MATERIAL_IDS, materialParams, renderSemantics } from '../src/materials.js';
import { DESIGN_PALETTES, roomFinishForDesign } from '../src/design-finish.js';
import { controlWallPlan } from '../src/control-walls.js';
import { layoutRoom, FURNITURE } from '../src/room-presets.js';
import { FURNITURE_CONTRACTS } from '../src/furniture-contracts.js';
import { createTaskChair, createCurvedConsole } from '../src/furniture-assets.js';
import { controlAVItems } from '../src/control-av.js';

const CR = 'controlRoom';
const P = LIGHTING_PRESETS.controlTechnical;
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const ROOM = { W: 16, H: 3.9, D: 14 };
const BASE = { consoleRows: 2, perRow: 4, tiers: 1, riserH: 200, tierStartRow: 0, backTable: true, plant: false };
const layControl = (W = 16000, D = 14000, extra = {}) =>
  layoutRoom('control', { ...BASE, ...extra }, { W, D, design: CR });

// ── ① 프리셋이 있고, 상황실이 그것을 쓴다 ──────────────────────────────────

test('① controlTechnical 프리셋이 실재한다', () => {
  assert.ok(P, '프리셋이 없다');
  assert.equal(P.id, 'controlTechnical');
  assert.equal(lightingPreset('controlTechnical'), P);
  assert.equal(typeof P.label, 'string');
});

test('② 상황실이 이 프리셋으로 풀린다', () => {
  assert.equal(ROOM_DESIGNS[CR].lighting, 'controlTechnical');
  assert.equal(isPlanned(ROOM_DESIGNS[CR].lighting), false);
  assert.equal(lightingForDesign(CR), P);
  assert.equal(resolveDesign(CR).lighting, 'controlTechnical');
});

test('③ 다른 공간은 이 프리셋으로 풀리지 않는다', () => {
  for (const id of DESIGN_IDS) {
    if (id === CR) continue;
    assert.notEqual(lightingForDesign(id), P, `${id} 가 상황실 조명을 쓴다`);
  }
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.notEqual(lightingForDesign(id), P, String(id));
  }
});

// ── ② 프리셋 값이 결정적이다 ───────────────────────────────────────────────

test('④ 세기 배수가 정확히 고정돼 있다', () => {
  assert.deepEqual({ ...P.scale },
    { hemi: 0.58, ceiling: 0.22, key: 0.98, fill: 2.00, ledSpill: 1.00 });
  // 조명 **자리**는 전부 있어야 한다. 하나라도 빠지면 그 조명만 기준값으로 남아 어긋난다.
  for (const r of LIGHT_ROLES) assert.equal(typeof P.scale[r], 'number', r);
});

test('⑤ 그림자 설정이 정확히 고정돼 있다', () => {
  assert.deepEqual({ ...P.shadow }, { radius: 11, bias: -0.00035, normalBias: 0.030 });
});

test('⑥ 조명 자리는 옮기지 않는다 — 렌더러가 기존 자리를 그대로 쓴다', () => {
  assert.equal(P.keyPos, undefined, '주광 자리를 옮겼다');
  assert.equal(P.fillPos, undefined, '보조광 자리를 옮겼다');
  assert.equal(keyLightPlacementForDesign(CR, ROOM), null);
  assert.equal(fillLightPlacementForDesign(CR, ROOM), null);
});

test('⑦ 최종 세기가 안전 범위 안이다 — 어느 조명도 면을 하얗게 날리지 않는다', () => {
  for (const r of LIGHT_ROLES) {
    const k = P.scale[r];
    assert.ok(k >= SCALE_RANGE.min && k <= SCALE_RANGE.max, `${r} 배수 ${k} 가 범위 밖이다`);
  }
  const lv = applyDesignLighting({ ...LIGHTS }, CR);
  assert.deepEqual(Object.keys(lv).sort(), [...LIGHT_ROLES].sort());
  for (const r of LIGHT_ROLES) {
    assert.ok(lv[r] <= MAX_ABS_INTENSITY, `${r} 절대 세기 ${lv[r]} 가 상한을 넘었다`);
    assert.ok(lv[r] > 0, `${r} 가 꺼졌다`);
  }
  // 실제 값(회귀 고정).
  assert.equal(+lv.hemi.toFixed(4), 1.073);
  assert.equal(+lv.ceiling.toFixed(4), 0.253);
  assert.equal(+lv.key.toFixed(4), 1.127);
  assert.equal(+lv.fill.toFixed(4), 0.8);
  assert.equal(lv.ledSpill, 0.55, 'LED 번짐을 건드렸다');
});

test('⑧ 회의실보다 어둡다 — 환경광·천장등이 세 공간 모두보다 낮다', () => {
  const mine = applyDesignLighting({ ...LIGHTS }, CR);
  for (const other of ['corporateMeeting', 'executiveBoardroom', 'largeConference']) {
    const lv = applyDesignLighting({ ...LIGHTS }, other);
    assert.ok(mine.hemi < lv.hemi, `${other} 보다 환경광이 밝다`);
    assert.ok(mine.ceiling < lv.ceiling, `${other} 보다 천장등이 밝다`);
  }
});

test('⑨ 그림자가 진해진 만큼 더 부드럽게 만든다', () => {
  const before = keyShareOfLevels(LIGHTS);
  const after = keyShareOfLevels(applyDesignLighting({ ...LIGHTS }, CR));
  assert.ok(after > before, '주광 비중이 오르지 않았다(계산이 어긋났다)');
  assert.equal(+after.toFixed(3), 0.346);
  // 물건이 많은 방이라 대기업·임원보다 더 뭉갠다.
  assert.ok(P.shadow.radius > LIGHTING_PRESETS.corporateSoft.shadow.radius);
  assert.ok(P.shadow.radius > LIGHTING_PRESETS.executiveSoft.shadow.radius);
});

// ── ③ 그림자를 만드는 조명은 하나뿐이다 ────────────────────────────────────

test('⑩ 그림자를 만드는 조명을 늘리지 않았다', () => {
  assert.equal(MAX_SHADOW_CASTERS, 1);
  // 프리셋은 **세기와 그림자 설정만** 말한다. 조명을 새로 만드는 열쇠가 없어야 한다.
  for (const k of Object.keys(P)) {
    assert.ok(['id', 'label', 'scale', 'shadow'].includes(k), `프리셋에 낯선 열쇠가 생겼다: ${k}`);
  }
  // 렌더러도 그림자를 켜는 자리가 한 곳뿐이다.
  const code = src('render3d-gl.js').replace(/\/\/.*$/gm, '');
  assert.equal((code.match(/\.castShadow = true/g) || []).length, 1,
    '그림자를 만드는 조명을 켜는 자리가 여러 곳이다');
  assert.ok(/key\.castShadow = true/.test(code), '주광이 그림자를 만들지 않는다');
});

test('⑪ 조명 개수·종류가 그대로다 — 새 광원을 만들지 않았다', () => {
  const code = src('render3d-gl.js').replace(/\/\/.*$/gm, '');
  const count = re => (code.match(re) || []).length;
  assert.equal(count(/new THREE\.HemisphereLight/g), 1);
  assert.equal(count(/new THREE\.DirectionalLight/g), 3);   // 천장등 · 주광 · 보조광
  assert.equal(count(/new THREE\.PointLight/g), 1);         // LED 번짐
  assert.equal(count(/new THREE\.SpotLight/g), 0, '스포트라이트를 새로 만들었다');
  assert.equal(count(/new THREE\.RectAreaLight/g), 0);
  assert.equal(count(/new THREE\.AmbientLight/g), 0);
});

// ── ④ 렌더러 전역은 건드리지 않았다 ────────────────────────────────────────

test('⑫ 노출·톤매핑·색공간·그림자 방식을 바꾸지 않았다', () => {
  const code = src('render3d-gl.js').replace(/\/\/.*$/gm, '');
  assert.equal(/toneMapping/.test(code), false, '톤매핑을 건드렸다');
  assert.equal(/toneMappingExposure/.test(code), false, '노출을 건드렸다');
  assert.ok(/renderer\.outputColorSpace = THREE\.SRGBColorSpace/.test(code), '색공간이 바뀌었다');
  assert.equal((code.match(/outputColorSpace/g) || []).length, 1, '색공간을 여러 번 건드린다');
  assert.ok(/shadowMap\.type = THREE\.PCFSoftShadowMap/.test(code), '그림자 방식이 바뀌었다');
  assert.ok(/shadowMap\.autoUpdate = false/.test(code));
  assert.equal(/useLegacyLights|physicallyCorrectLights/.test(code), false, '광원 해석 방식을 건드렸다');
  // 조명 파일도 렌더러 전역을 모른다(순수 명세다).
  //   **주석을 걷어낸 실제 코드만 본다** — 설명 문장에 단어가 나오는 것은 동작이 아니다.
  const lit = src('design-lighting.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/toneMapping|outputColorSpace|renderer/.test(lit), false, '조명 명세가 렌더러를 안다');
  assert.equal(/\bTHREE\b/.test(lit), false, '조명 명세가 Three.js 를 끌어들였다');
});

// ── ⑤ 유리는 조명 단계에서 한 값도 달라지지 않는다 ─────────────────────────

test('⑬ 유리 정책이 그대로다 — 그림자 없음 · 깊이 기록 없음 · 불투명도 0.16', () => {
  const p = materialParams('glassPartition');
  assert.equal(p.transparent, true);
  assert.equal(p.opacity, 0.16);
  assert.equal(p.depthWrite, false);
  assert.equal(p.roughness, 0.08);
  const sem = renderSemantics('glassPartition');
  assert.equal(sem.castsShadow, false, '유리가 그림자를 만들게 됐다');
  assert.equal(sem.receivesShadow, false, '유리가 그림자를 받게 됐다');
  assert.equal(sem.renderClass, 'transparent');
  assert.equal(sem.renderOrderHint, 2);
  // 가짜 발광을 붙이지 않았다.
  assert.equal(/glass[\s\S]{0,80}emissive/i.test(src('render3d-gl.js')), false, '유리에 발광을 붙였다');
});

// ── ⑥ 형상·마감·벽·화각 동결 ───────────────────────────────────────────────

test('⑭ 마감(controlPalette)이 한 값도 바뀌지 않았다', () => {
  const pal = DESIGN_PALETTES.controlPalette;
  assert.deepEqual({ ...pal }, {
    id: 'controlPalette', label: '상황실 테크니컬 그레이 마감',
    floor: '#8d9095', wallFront: '#ebedef', wallSide: '#e3e6e9', wallAccent: '#5a6068',
    baseboard: '#d2d6da', consoleTop: '#d7dadd', consoleBase: '#343a41',
  });
  const room = roomFinishForDesign(CR);
  assert.equal(room.floor.canonical, 'carpetTileDark');
  assert.equal(room.wallAccent.canonical, 'acousticPanel');
  assert.equal(MATERIAL_IDS.length, 13, '정식 재질이 늘었다');
});

test('⑮ 벽 구성(controlWalls)이 한 값도 바뀌지 않았다', () => {
  assert.equal(ROOM_DESIGNS[CR].wallTreatment, 'controlWalls');
  const lay = layControl();
  const plan = controlWallPlan({ W: 16000, D: 14000, H: 3900, design: CR, items: lay.items });
  assert.equal(plan.glass.x, 13606);
  assert.equal(plan.glass.d, 12200);
  assert.equal(plan.glass.w, 12);
  assert.equal(plan.glass.h, 3900);
  assert.deepEqual(plan.frames.map(f => f.id),
    ['controlGlassTrack', 'controlGlassHead', 'controlGlassPost']);
  assert.equal(plan.acousticSide, 'left');
});

test('⑯ 가구·AV 형상과 수가 한 자리도 바뀌지 않았다', () => {
  assert.equal(createTaskChair().length, 10);
  assert.equal(createCurvedConsole(1800, 900).length, 4);
  const lay = layControl();
  const n = t => lay.items.filter(i => i.type === t).length;
  assert.equal(n('console'), 8);
  assert.equal(n('chair'), 16);
  assert.equal(n('monitor'), 16);
  assert.equal(n('keyboard'), 8);
  const c0 = lay.items.find(i => i.type === 'console');
  assert.deepEqual({ x: c0.x, z: c0.z, w: c0.w, d: c0.d }, { x: 5000, z: 3050, w: 1800, d: 900 });
  const av = controlAVItems({ consoles: lay.items.filter(i => i.type === 'console') });
  assert.equal(av.monitors.length, 16);
  assert.equal(av.keyboards.length, 8);
});

test('⑰ 단 높이(tier Y)가 그대로다', () => {
  const lay = layControl(16000, 14000, { tiers: 2 });
  const ys = [...new Set(lay.items.filter(i => i.type === 'console').map(i => i.y))].sort((a, b) => a - b);
  assert.deepEqual(ys, [0, 200], '콘솔이 올라앉은 단 높이가 달라졌다');
  for (const it of lay.items.filter(i => i.type === 'monitor' || i.type === 'keyboard')) {
    assert.ok(it.y >= FURNITURE_CONTRACTS.curvedConsole.dimensions.surfaceY, 'AV 가 상판 아래로 내려갔다');
  }
});

test('⑱ 소품만 남았다 — 상태는 PHASE 5-e 에서 ready 로 올랐다', () => {
  const d = ROOM_DESIGNS[CR];
  assert.equal(d.camera, 'controlProposal', '화각은 PHASE 5-d.4 에서 생겼다');
  assert.ok(isPlanned(d.accessories));
  assert.equal(d.status, 'ready', 'PHASE 5-e 릴리스 게이트를 통과했다(DEC-125)');
});

test('⑲ 배치(layoutControl)를 조명이 건드리지 않았다', () => {
  // 조명 파일은 배치를 아예 모른다.
  const lit = src('design-lighting.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/layoutControl|room-presets/.test(lit), false, '조명 명세가 배치를 안다');
  assert.equal(/FURNITURE\./.test(lit), false);
  assert.equal(FURNITURE.consolePitchX, 2000);
  assert.equal(FURNITURE.consolePitchZ, 2500);
});

// ── ⑦ 다른 공간의 조명 동결 ────────────────────────────────────────────────

test('⑳ 회의실 3종의 조명이 한 값도 바뀌지 않았다', () => {
  const fixed = {
    corporateSoft: { scale: { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 },
      shadow: { radius: 9, bias: -0.0004, normalBias: 0.035 } },
    executiveSoft: { scale: { hemi: 1.05, ceiling: 0.30, key: 1.00, fill: 2.00, ledSpill: 1.00 },
      shadow: { radius: 10, bias: -0.00035, normalBias: 0.032 } },
    conferenceSoft: { scale: { hemi: 1.18, ceiling: 0.28, key: 0.92, fill: 1.30, ledSpill: 1.00 },
      shadow: { radius: 12, bias: -0.00035, normalBias: 0.030 } },
  };
  for (const [id, want] of Object.entries(fixed)) {
    const pr = LIGHTING_PRESETS[id];
    assert.deepEqual({ ...pr.scale }, want.scale, `${id} 세기`);
    assert.deepEqual({ ...pr.shadow }, want.shadow, `${id} 그림자`);
  }
  // 대기업은 주광 자리를, 대회의실은 보조광 자리를 정한다 — 그대로여야 한다.
  assert.deepEqual({ ...LIGHTING_PRESETS.corporateSoft.keyPos }, { x: 0.36, y: 2.9, z: 0.95 });
  assert.deepEqual({ ...LIGHTING_PRESETS.conferenceSoft.fillPos }, { x: 1.45, y: 0.62, z: 0.55 });
  assert.equal(LIGHTING_PRESETS.executiveSoft.keyPos, undefined);
});

test('㉑ 조명 프리셋은 6벌이고, 디자인이 없는 공간은 여전히 기준값 그대로다', () => {
  assert.deepEqual(Object.keys(LIGHTING_PRESETS),
    ['corporateSoft', 'executiveSoft', 'conferenceSoft', 'trainingSoft', 'controlTechnical',
      'ideationSoft']);
  const base = { hemi: 1, ceiling: 1, key: 1, fill: 1, ledSpill: 1 };
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.deepEqual(applyDesignLighting(base, id), base, String(id));
    assert.equal(shadowSettingsForDesign(id), null, String(id));
  }
});

test('㉒ 기준 세기(LIGHTS)를 바꾸지 않았다 — 바꾸면 모든 공간이 함께 움직인다', () => {
  assert.deepEqual({ ...LIGHTS },
    { hemi: 1.85, ceiling: 1.15, key: 1.15, fill: 0.40, ledSpill: 0.55 });
});

// ── ⑧ 모델 경로 ────────────────────────────────────────────────────────────

test('㉓ 3D 모델이 상황실 디자인을 그대로 나른다 — 조명이 형상을 바꾸지 않는다', () => {
  const lay = layControl();
  const led = { marginW: 1000, mount: 1000, w: 6000, h: 2000, depth: 60, cols: 4, rows: 4 };
  const m = buildGLModel({ space: { W: 16000, H: 3900, D: 14000 }, led, items: lay.items,
    design: CR, roomType: 'control' });
  assert.equal(m.design, CR);
  assert.equal(m.partitions.length, 4);
  assert.equal(m.items.length, lay.items.length);
  assert.equal(m.finish.mood, 'office', '분위기를 바꿨다 — 조명 프리셋으로 풀 일이다');
  assert.equal(m.finish.floor, 'carpetTile');
});
