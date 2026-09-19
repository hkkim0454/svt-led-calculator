// executive-lighting.test.js — 임원 회의실 조명·그림자 회귀 테스트. (PHASE 3-d.1)
// ─────────────────────────────────────────────────────────────────────────────
// 이 단계가 고친 것은 밝기가 아니라 **면의 순서**다.
//   고치기 전(실측): 바닥 215.2 > 정면벽 214.0, 옆벽 178.4
//   실제 방에서는 벽이 바닥보다 밝다. 그 순서를 조명 배분으로 되돌린 것이 전부다.
// 그래서 여기서 지키는 것도 세 가지다.
//   ① 임원 방만 새 조명을 쓰는가(다른 공간으로 새지 않는가).
//   ② 그 조명이 **의도한 방향**으로 배분되는가 — 천장등을 줄이고 보조광을 올린다.
//   ③ 이번 단계가 **조명 단계**로 남는가 — 재질·형상·화각·전역 노출을 건드리지 않았는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIGHTING_PRESETS, LIGHT_ROLES, SCALE_RANGE, MAX_ABS_INTENSITY, MAX_SHADOW_CASTERS,
  lightingPreset, lightingForDesign, applyDesignLighting, shadowSettingsForDesign,
  keyLightPlacementForDesign, keyShareOfLevels,
} from '../src/design-lighting.js';
import { LIGHTS } from '../src/gl-model.js';
import { ROOM_DESIGNS, DESIGN_IDS } from '../src/room-design.js';
import { MATERIAL_IDS, PART_FINISH } from '../src/materials.js';
import {
  DESIGN_PALETTES, roomFinishForDesign, tablePartFinishForDesign, credenzaFinishForDesign,
  floorPartFinishForDesign,
} from '../src/design-finish.js';
import { cameraPlanForDesign, CAMERA_PLANS } from '../src/design-camera.js';
import { createExecutiveChair, createBoardroomTable } from '../src/furniture-assets.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';

const EX = 'executiveBoardroom';
const CO = 'corporateMeeting';
const P = LIGHTING_PRESETS.executiveSoft;
const glSrc = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── A. 프리셋이 붙는 곳 ─────────────────────────────────────────────────────

test('① 임원 회의실만 executiveSoft 를 쓴다', () => {
  assert.equal(ROOM_DESIGNS[EX].lighting, 'executiveSoft');
  assert.ok(P, 'executiveSoft 프리셋이 없다');
  assert.equal(lightingForDesign(EX), P);
  assert.equal(lightingPreset('executiveSoft'), P);
  // 이 프리셋을 쓰는 공간은 임원 회의실 하나뿐이다.
  const users = DESIGN_IDS.filter(id => ROOM_DESIGNS[id].lighting === 'executiveSoft');
  assert.deepEqual(users, [EX], `executiveSoft 가 다른 공간으로 샜다: ${users.join(', ')}`);
});

test('② 대기업 조명(corporateSoft)은 한 값도 바뀌지 않았다', () => {
  const c = LIGHTING_PRESETS.corporateSoft;
  assert.deepEqual({ ...c.scale }, { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 });
  assert.deepEqual({ ...c.shadow }, { radius: 9, bias: -0.0004, normalBias: 0.035 });
  assert.deepEqual({ ...c.keyPos }, { x: 0.36, y: 2.9, z: 0.95 });
  assert.deepEqual({ ...c.keyTarget }, { x: 0.5, y: 0.15, z: 0.42 });
  assert.equal(ROOM_DESIGNS[CO].lighting, 'corporateSoft');
});

test('③ 조명을 선언하지 않은 공간은 여전히 전부 null 이다', () => {
  for (const id of DESIGN_IDS) {
    // 대회의실은 PHASE 4-d.2 에서 제 조명을 갖게 됐다(임원 것을 물려받은 것이 아니다).
    // 상황실도 PHASE 5-d.3 에서 제 조명을 갖게 됐다.
    // 교육장도 PHASE 7-b 에서, 아이디에이션도 PHASE 8-2a 에서 제 조명을 갖게 됐다.
    if (id === CO || id === EX || id === 'largeConference' || id === 'controlRoom'
      || id === 'trainingRoom' || id === 'ideationRoom') continue;
    assert.equal(lightingForDesign(id), null, `${id} 에 조명이 붙었다`);
    assert.equal(shadowSettingsForDesign(id), null, id);
    assert.equal(keyLightPlacementForDesign(id, { W: 10, H: 3.5, D: 8.5 }), null, id);
  }
  // 대회의실도 **주광 자리는 정하지 않는다** — 임원과 같은 이유(실측에서 반대로 움직였다).
  assert.equal(keyLightPlacementForDesign('largeConference', { W: 16, H: 3.9, D: 12 }), null);
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(lightingForDesign(id), null, String(id));
    assert.equal(shadowSettingsForDesign(id), null, String(id));
  }
});

// ── B. 배분의 의도 ──────────────────────────────────────────────────────────

test('④ 배분 — **천장등을 가장 많이 줄이고 보조광을 가장 많이 올린다**', () => {
  const s = P.scale;
  // 위를 보는 면(바닥·상판)만 때리는 천장등이 가장 많이 줄어야 한다.
  assert.ok(s.ceiling < 0.5, `천장등 배수 ${s.ceiling} — 충분히 줄이지 않으면 바닥이 벽보다 밝다`);
  assert.equal(s.ceiling, Math.min(...LIGHT_ROLES.map(r => s[r])), '가장 많이 줄인 자리가 천장등이 아니다');
  // 세워진 면(벽)을 밝히는 보조광이 가장 많이 올라야 한다.
  assert.ok(s.fill > 1.5, `보조광 배수 ${s.fill} — 올리지 않으면 옆벽이 어둡게 남는다`);
  assert.equal(s.fill, Math.max(...LIGHT_ROLES.map(r => s[r])), '가장 많이 올린 자리가 보조광이 아니다');
  // 대기업보다 천장등을 더 줄인다 — 임원 바닥 색이 한 단 더 밝기 때문이다.
  assert.ok(s.ceiling < LIGHTING_PRESETS.corporateSoft.scale.ceiling,
    '임원 바닥이 더 밝은데 천장등을 덜 줄였다');
  // LED 는 건드리지 않는다.
  assert.equal(s.ledSpill, 1.00, 'LED 스필을 만졌다 — LED 는 동결이다');
});

test('⑤ 배수가 안전 범위 안이고, 절대 세기가 상한을 넘지 않는다', () => {
  for (const role of LIGHT_ROLES) {
    const k = P.scale[role];
    assert.equal(typeof k, 'number', role);
    assert.ok(k >= SCALE_RANGE.min && k <= SCALE_RANGE.max, `${role} = ${k} 가 안전 범위 밖`);
  }
  const lv = applyDesignLighting({ ...LIGHTS }, EX);
  for (const role of LIGHT_ROLES) {
    assert.ok(lv[role] <= MAX_ABS_INTENSITY, `${role} 절대 세기 ${lv[role]} 가 상한을 넘는다`);
    assert.ok(lv[role] > 0, `${role} 이 꺼졌다`);
  }
  // 배수가 커도 절대값은 작다 — 보조광 기준값이 0.40이기 때문이다.
  assert.ok(lv.fill < lv.key, `보조광(${lv.fill})이 주광(${lv.key})보다 세면 방향감이 사라진다`);
});

test('⑥ 임원 방이 대기업 회의실보다 **밝다**(Reference 가 그렇다)', () => {
  const ex = applyDesignLighting({ ...LIGHTS }, EX);
  const co = applyDesignLighting({ ...LIGHTS }, CO);
  const sum = l => l.hemi + l.ceiling + l.key + l.fill;
  assert.ok(sum(ex) > sum(co), `임원 총량 ${sum(ex).toFixed(2)} ≤ 대기업 ${sum(co).toFixed(2)}`);
  // 그렇다고 기본 조명보다 총량이 크면 안 된다 — 고치려는 것은 밝기가 아니라 배분이다.
  assert.ok(sum(ex) < sum(LIGHTS), `임원 총량 ${sum(ex).toFixed(2)} 이 기본(${sum(LIGHTS).toFixed(2)})보다 크다`);
  // 그림자 비중(주광 ÷ 전체)이 과하게 오르지 않는다 — 오르면 그림자가 진해진다.
  assert.ok(keyShareOfLevels(ex) < 0.32, `주광 비중 ${keyShareOfLevels(ex).toFixed(3)} 가 너무 크다`);
});

test('⑦ 주광 자리는 **정하지 않는다** — 옮기면 고치려던 것과 반대로 움직인다', () => {
  assert.equal(P.keyPos, undefined, '임원 프리셋이 주광 자리를 정했다');
  assert.equal(P.keyTarget, undefined);
  assert.equal(keyLightPlacementForDesign(EX, { W: 11, H: 3.8, D: 9 }), null,
    '임원 주광 자리가 기존과 달라졌다');
  // 대기업은 반대로 자리를 정한다 — 그 동작이 살아 있어야 한다.
  const kp = keyLightPlacementForDesign(CO, { W: 10, H: 3.5, D: 8.5 });
  assert.ok(kp && kp.position && kp.target, '대기업 주광 자리가 사라졌다');
});

// ── C. 그림자 ───────────────────────────────────────────────────────────────

test('⑧ 그림자 — 넓고 부드럽고 얕게. 만드는 조명은 여전히 하나뿐이다', () => {
  assert.equal(MAX_SHADOW_CASTERS, 1);
  const sh = shadowSettingsForDesign(EX);
  assert.ok(sh, '임원 그림자 설정이 없다');
  assert.ok(sh.radius > 4, `흐림 반경 ${sh.radius} — 기본(4)보다 커야 '얼룩'이 아니라 '그늘'이 된다`);
  assert.ok(sh.radius <= 16, `흐림 반경 ${sh.radius} — 너무 키우면 접지감이 사라진다`);
  // 얇은 상판(30mm)·블레이드에서 줄무늬와 뜬 그림자가 생기지 않는 범위.
  assert.ok(sh.bias < 0 && sh.bias > -0.002, `bias ${sh.bias}`);
  assert.ok(sh.normalBias > 0 && sh.normalBias < 0.1, `normalBias ${sh.normalBias}`);
  // 그림자 조명은 주광 하나뿐이다(소스로 확인).
  const casters = [...new Set([...noComments(glSrc).matchAll(/(\w+)\.castShadow\s*=\s*true/g)].map(m => m[1]))];
  assert.deepEqual(casters, ['key'], `그림자 조명이 늘었다: ${casters.join(', ')}`);
});

test('⑨ 조명 구성 자체는 그대로다 — 새 Light 를 만들지 않았다', () => {
  const made = [...noComments(glSrc).matchAll(/new THREE\.(\w*Light)\(/g)].map(m => m[1]).sort();
  assert.deepEqual(made, ['DirectionalLight', 'DirectionalLight', 'DirectionalLight',
    'HemisphereLight', 'PointLight'], `조명 구성이 바뀌었다: ${made.join(', ')}`);
  assert.deepEqual([...LIGHT_ROLES], ['hemi', 'ceiling', 'key', 'fill', 'ledSpill']);
});

// ── D. 전역 안전장치 ────────────────────────────────────────────────────────

test('⑩ 전역 노출·톤매핑·기준 조명값을 건드리지 않았다', () => {
  const code = noComments(glSrc);
  for (const k of ['toneMapping', 'toneMappingExposure']) {
    assert.ok(!new RegExp(`renderer\\.${k}\\s*=`).test(code),
      `renderer.${k} 을 바꾸면 **모든 공간**이 같이 바뀐다`);
  }
  const cs = code.match(/renderer\.outputColorSpace\s*=\s*([^\n;]+)/);
  assert.ok(cs && /SRGBColorSpace/.test(cs[1]), `출력 색공간이 바뀌었다: ${cs && cs[1]}`);
  assert.deepEqual({ ...LIGHTS },
    { hemi: 1.85, ceiling: 1.15, key: 1.15, fill: 0.40, ledSpill: 0.55 });
});

test('⑪ 그림자 기본값이 살아 있다 — 조명을 정하지 않은 공간이 되돌아갈 자리', () => {
  const m = noComments(glSrc).match(/SHADOW_DEFAULTS = Object\.freeze\((\{[^}]+\})\)/);
  assert.ok(m, '그림자 기본값이 사라졌다');
  assert.match(m[1], /radius:\s*4/);
  // 디자인이 정하지 않았으면 기본값으로 **되돌린다**(다른 공간으로 새지 않게).
  assert.match(noComments(glSrc), /shadowSettingsForDesign\(model\?\.design\) \|\| SHADOW_DEFAULTS/);
});

// ── E. 동결 검증 ────────────────────────────────────────────────────────────

test('⑫ 재질 동결 — 조명 문제를 재질로 보정하지 않았다', () => {
  assert.equal(MATERIAL_IDS.length, 13);
  assert.deepEqual({ ...DESIGN_PALETTES.executiveBright }, {
    id: 'executiveBright', label: '임원 밝은 프리미엄 마감',
    floor: '#c3c1bc', wallFront: '#f4f1ec', wallSide: '#eeeae3', wallAccent: '#e3ded4',
    baseboard: '#e2ddd3',
    boardroomTop: '#dbcdb6', boardroomBase: '#34383e',
    credenzaBody: '#33373d', credenzaDoor: '#2c3036', credenzaTop: '#3d424a', credenzaToe: '#1e2126',
    rug: '#c7c5bf',
  });
  const f = roomFinishForDesign(EX);
  assert.equal(f.floor.canonical, 'carpetTile');
  assert.equal(f.wallFront.canonical, 'paintedWall');
  assert.equal(f.wallAccent.canonical, 'acousticPanel');
  const t = tablePartFinishForDesign(EX);
  assert.equal(t.boardroomTop.canonical, 'woodTable');
  assert.equal(t.boardroomBase.canonical, 'darkGraphite');
  assert.equal(t.boardroomBase.roughness, 0.72);
  assert.equal(credenzaFinishForDesign(EX).credenzaBody.canonical, 'darkGraphite');
  assert.equal(floorPartFinishForDesign(EX).rug.color, '#c7c5bf');
  // 대기업 팔레트도 그대로다.
  assert.equal(DESIGN_PALETTES.corporateNeutral.floor, '#b9bab8');
  assert.equal(DESIGN_PALETTES.corporateNeutral.wallFront, '#f1efea');
});

test('⑬ 임원 의자 동결 — 마감도 부품도 그대로다', () => {
  assert.deepEqual([PART_FINISH.chairFrame.material, PART_FINISH.chairFrame.color], ['darkGraphite', '#3a3e44']);
  assert.deepEqual([PART_FINISH.chairCushion.material, PART_FINISH.chairCushion.color], ['fabricChair', '#3d4147']);
  assert.equal(createExecutiveChair().length, 12);
});

test('⑭ 임원 테이블 형상 동결 — 치수가 한 값도 안 바뀌었다', () => {
  const tables = layoutRoom('meeting',
    { ...defaultOptions('meeting'), tableShape: 'u', seats: 14, ledBottom: 1000 }, { W: 11000, D: 9000 })
    .items.filter(i => i.type === 'table');
  const S = createBoardroomTable(tables);
  assert.deepEqual({
    outerW: S.outerW, outerD: S.outerD, segW: S.segW, frontR: S.frontR, rearR: S.rearR,
    innerR: S.innerR, surfaceY: S.surfaceY, topThk: S.topThk, panelBottom: S.panelBottom,
    supports: S.supports.length,
  }, {
    outerW: 8100, outerD: 4500, segW: 900, frontR: 450, rearR: 162, innerR: 300,
    surfaceY: 745, topThk: 30, panelBottom: 95, supports: 7,
  });
});

test('⑮ 대기업 화각 값이 그대로다 — 임원 화각(3-d.2)이 대기업을 건드리지 않았다', () => {
  assert.deepEqual({ ...CAMERA_PLANS.interior },
    { eye: 1.65, fov: 41, rearRatio: 0.06, drop: 0.35, xRatio: 0.50 });
  // 조명 프리셋은 화각을 하나도 정하지 않는다(두 관심사가 섞이면 한쪽을 고칠 때 다른 쪽이 흔들린다).
  for (const k of ['eye', 'fov', 'position', 'target']) assert.equal(P[k], undefined, k);
});

test('⑯ LED 동결 — 조명 프리셋이 LED 를 건드리지 않는다', () => {
  assert.equal(P.scale.ledSpill, 1.00);
  assert.equal(applyDesignLighting({ ...LIGHTS }, EX).ledSpill, LIGHTS.ledSpill);
  // LED 화면은 조명을 받지 않는 자체발광이다 — 그 구성이 그대로인지 소스로 확인.
  assert.match(noComments(glSrc), /new THREE\.PointLight\(/, 'LED 스필 조명이 사라졌다');
});

// ── F. 순수성 ───────────────────────────────────────────────────────────────

test('⑰ 순수 유지 — 조명 계산기는 Three.js·DOM 없이 돈다', () => {
  const src = readFileSync(new URL('../src/design-lighting.js', import.meta.url), 'utf8');
  const code = noComments(src);
  assert.equal(/from\s+['"].*three/i.test(code), false, 'Three.js 를 불러왔다');
  assert.equal(/\bdocument\.|\bwindow\./.test(code), false, 'DOM 을 만졌다');
  // 받은 값을 고치지 않는다.
  const src0 = { ...LIGHTS };
  applyDesignLighting(src0, EX);
  assert.deepEqual(src0, { ...LIGHTS }, '입력을 건드렸다');
});

test('⑱ 기준 수치 고정 — 임원 조명의 최종 절대 세기', () => {
  const lv = applyDesignLighting({ ...LIGHTS }, EX);
  assert.deepEqual({
    hemi: +lv.hemi.toFixed(4), ceiling: +lv.ceiling.toFixed(4), key: +lv.key.toFixed(4),
    fill: +lv.fill.toFixed(4), ledSpill: +lv.ledSpill.toFixed(4),
  }, { hemi: 1.9425, ceiling: 0.345, key: 1.15, fill: 0.8, ledSpill: 0.55 });
});
