// conference-lighting.test.js — 대회의실 전용 조명·그림자 회귀 테스트. (PHASE 4-d.2)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① 조명이 **그 공간에만** 붙는가 — 대기업·임원·다른 방이 한 값도 안 움직이는가.
//   ② 그림자를 만드는 조명이 여전히 **하나뿐**인가.
//   ③ 전역 렌더러(톤 매핑·노출·색공간)를 건드리지 않았는가.
//   ④ 재질·형상·배치·화각이 한 값도 안 바뀌었는가 — 이번 단계는 **빛만** 바꾸는 단계다.
//   ⑤ 배수가 안전 범위·절대 상한 안에 있는가(면이 하얗게 날아가지 않는 선).
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  LIGHTING_PRESETS, LIGHT_ROLES, SCALE_RANGE, MAX_ABS_INTENSITY, MAX_SHADOW_CASTERS,
  lightingPreset, lightingForDesign, applyDesignLighting, shadowSettingsForDesign,
  keyLightPlacementForDesign, fillLightPlacementForDesign, keyShareOfLevels,
} from '../src/design-lighting.js';
import { LIGHTS } from '../src/gl-model.js';
import { ROOM_DESIGNS, DESIGN_IDS, isPlanned, resolveDesign } from '../src/room-design.js';
import { DESIGN_PALETTES } from '../src/design-finish.js';
import { MATERIAL_PRESETS } from '../src/materials.js';
import { createLargeUTable, createConferenceErgoChair, createPrompter } from '../src/furniture-assets.js';
import { FURNITURE_CONTRACTS } from '../src/furniture-contracts.js';
import { layoutRoom, defaultOptions } from '../src/room-presets.js';
import { computeConfig } from '../src/engine.js';
import { MODELS } from '../src/models.js';

const LC = 'largeConference';
const P = lightingPreset('conferenceSoft');
const ROOM = { W: 16, H: 3.9, D: 12 };
const glSrc = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');
const litSrc = readFileSync(new URL('../src/design-lighting.js', import.meta.url), 'utf8');
const camSrc = readFileSync(new URL('../src/design-camera.js', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const lay = (W, D, seats, over = {}) => layoutRoom('meeting',
  { ...defaultOptions('meeting'), tableShape: 'u', seats, rug: false, plant: false, credenza: false, ...over },
  { W, D, ledBottom: 1000, design: LC });

// ── A. 프리셋 · 범위 ────────────────────────────────────────────────────────

test('① 대회의실이 제 조명 프리셋을 쓴다', () => {
  assert.equal(ROOM_DESIGNS[LC].lighting, 'conferenceSoft');
  assert.equal(resolveDesign(LC).lighting, 'conferenceSoft');
  assert.ok(P, '프리셋이 없다');
  assert.equal(P.id, 'conferenceSoft');
  assert.equal(lightingForDesign(LC), P);
  // 임원 것을 물려받은 것이 아니다.
  assert.notEqual(P, LIGHTING_PRESETS.executiveSoft);
  assert.notEqual(P, LIGHTING_PRESETS.corporateSoft);
});

test('⑤ 조명 프리셋이 **그 공간에만** 붙는다', () => {
  for (const id of DESIGN_IDS) {
    // 상황실은 PHASE 5-d.3 에서 제 조명(controlTechnical)을 갖게 됐다.
    //   교육장도 PHASE 7-b 에서 제 조명(trainingSoft)을 갖게 됐다.
    //   아이디에이션도 PHASE 8-2a 에서 제 조명(ideationSoft)을 갖게 됐다.
    if (['corporateMeeting', 'executiveBoardroom', LC, 'controlRoom', 'trainingRoom',
      'ideationRoom'].includes(id)) continue;
    assert.equal(lightingForDesign(id), null, `${id} 에 조명이 붙었다`);
    assert.equal(shadowSettingsForDesign(id), null, id);
    assert.equal(fillLightPlacementForDesign(id, ROOM), null, id);
  }
  for (const id of [null, undefined, '', '없는디자인', 0, {}]) {
    assert.equal(lightingForDesign(id), null, String(id));
    assert.equal(fillLightPlacementForDesign(id, ROOM), null, String(id));
  }
});

test('② 대기업 조명이 한 값도 바뀌지 않았다', () => {
  const c = LIGHTING_PRESETS.corporateSoft;
  assert.deepEqual({ ...c.scale }, { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 });
  assert.deepEqual({ ...c.shadow }, { radius: 9, bias: -0.0004, normalBias: 0.035 });
  assert.deepEqual({ ...c.keyPos }, { x: 0.36, y: 2.9, z: 0.95 });
  assert.deepEqual({ ...c.keyTarget }, { x: 0.5, y: 0.15, z: 0.42 });
  assert.equal(c.fillPos, undefined, '대기업이 보조광 자리를 갖게 됐다');
});

test('③ 임원 조명이 한 값도 바뀌지 않았다', () => {
  const e = LIGHTING_PRESETS.executiveSoft;
  assert.deepEqual({ ...e.scale }, { hemi: 1.05, ceiling: 0.30, key: 1.00, fill: 2.00, ledSpill: 1.00 });
  assert.deepEqual({ ...e.shadow }, { radius: 10, bias: -0.00035, normalBias: 0.032 });
  assert.equal(e.keyPos, undefined, '임원은 주광 자리를 정하지 않는다(실측 근거)');
  assert.equal(e.fillPos, undefined, '임원이 보조광 자리를 갖게 됐다');
  assert.equal(keyLightPlacementForDesign('executiveBoardroom', ROOM), null);
  assert.equal(fillLightPlacementForDesign('executiveBoardroom', ROOM), null);
});

test('④ 조명을 정하지 않은 공간은 세기가 그대로다', () => {
  const base = { hemi: 1, ceiling: 1, key: 1, fill: 1, ledSpill: 1 };
  for (const id of [null, undefined, '없는디자인']) {
    assert.deepEqual(applyDesignLighting(base, id), base, String(id));
  }
  // 대회의실은 실제로 바뀐다.
  const lv = applyDesignLighting(base, LC);
  assert.notDeepEqual(lv, base);
  for (const r of LIGHT_ROLES) assert.equal(lv[r], P.scale[r], r);
});

test('⑤-2 배수가 안전 범위 안이고, 절대 세기가 상한을 넘지 않는다', () => {
  for (const [id, pr] of Object.entries(LIGHTING_PRESETS)) {
    for (const r of LIGHT_ROLES) {
      const k = pr.scale[r];
      assert.equal(typeof k, 'number', `${id}.${r}`);
      assert.ok(k >= SCALE_RANGE.min && k <= SCALE_RANGE.max, `${id}.${r} 배수 ${k} 가 범위 밖`);
      const abs = LIGHTS[r] * k;
      assert.ok(abs <= MAX_ABS_INTENSITY, `${id}.${r} 절대 세기 ${abs.toFixed(3)} > ${MAX_ABS_INTENSITY}`);
    }
  }
  // 대회의실 환경광은 상한 바로 아래다(2.183 ≤ 2.2) — 1.20 은 넘었다.
  assert.ok(LIGHTS.hemi * P.scale.hemi <= MAX_ABS_INTENSITY);
  assert.ok(LIGHTS.hemi * 1.20 > MAX_ABS_INTENSITY, '상한이 의미 없는 값이 됐다');
});

// ── B. 이 프리셋이 무엇을 하는가(실측에서 고른 방향) ────────────────────────

test('⑥ 천장등을 줄이고 보조광·환경광을 올린다 — 실측에서 고른 방향', () => {
  // 천장등은 **벽에 0을 주고 바닥·상판에만** 준다(실측). 그래서 이것만 크게 줄인다.
  assert.ok(P.scale.ceiling < 0.5, `천장등 ${P.scale.ceiling} — 바닥·상판이 안 내려간다`);
  assert.ok(P.scale.ceiling < LIGHTING_PRESETS.executiveSoft.scale.ceiling, '임원보다 더 줄여야 한다');
  // 옆벽을 올리는 두 빛은 올린다.
  assert.ok(P.scale.hemi > 1, '환경광을 올리지 않았다');
  assert.ok(P.scale.fill > 1, '보조광을 올리지 않았다');
  assert.ok(P.scale.hemi > LIGHTING_PRESETS.executiveSoft.scale.hemi, '넓은 방인데 임원보다 어둡다');
  // 보조광은 **최대로 올리지 않는다** — 날개 모니터 화면이 함께 밝아진다(법선이 옆벽과 같다).
  assert.ok(P.scale.fill < LIGHTING_PRESETS.executiveSoft.scale.fill,
    '보조광을 임원만큼 올리면 모니터 화면이 날아간다(실측)');
  // 주광은 정면벽 전담이라 조금만 낮춘다 — 없애면 의자 형태가 평평해진다.
  assert.ok(P.scale.key > 0.85 && P.scale.key < 1, `주광 ${P.scale.key}`);
  assert.equal(P.scale.ledSpill, 1.00, 'LED 번짐은 건드리지 않는다');
});

test('⑦ 보조광을 **거의 눕힌다** — 위를 보는 면(프롬프터)을 피하려고', () => {
  const f = fillLightPlacementForDesign(LC, ROOM);
  assert.ok(f, '대회의실이 보조광 자리를 정하지 않았다');
  const dx = f.target.x - f.position.x, dy = f.target.y - f.position.y, dz = f.target.z - f.position.z;
  const len = Math.hypot(dx, dy, dz);
  // 진행 방향이 거의 수평이어야 한다(세로 성분이 아주 작다).
  assert.ok(Math.abs(dy) / len < 0.10, `보조광 기울기 ${(Math.abs(dy) / len).toFixed(3)} — 위를 보는 면을 때린다`);
  // 옆으로(±X) 가로지르는 빛이다 — 세워진 벽을 밝히는 방향.
  assert.ok(Math.abs(dx) / len > 0.9, '보조광이 옆벽을 향하지 않는다');
  // 방 크기에 대한 비율이라 방이 커져도 같은 방향에서 온다.
  const big = fillLightPlacementForDesign(LC, { W: 32, H: 7.8, D: 24 });
  assert.equal(big.position.x / 32, f.position.x / 16);
  assert.equal(big.position.z / 24, f.position.z / 12);
  // 주광 자리는 정하지 않는다(임원과 같은 이유).
  assert.equal(keyLightPlacementForDesign(LC, ROOM), null);
});

test('⑧ 그림자 — 넓고 부드럽게, 만드는 조명은 하나뿐', () => {
  assert.equal(MAX_SHADOW_CASTERS, 1);
  const sh = shadowSettingsForDesign(LC);
  assert.ok(sh);
  assert.ok(sh.radius > LIGHTING_PRESETS.executiveSoft.shadow.radius, '물건이 더 많은 방인데 덜 뭉갠다');
  assert.ok(sh.radius >= 10 && sh.radius <= 16, `흐림 반경 ${sh.radius}`);
  assert.ok(sh.bias < 0 && sh.bias > -0.001, '자기 그림자 방지값이 범위 밖');
  assert.ok(sh.normalBias > 0 && sh.normalBias < 0.06);
  // 렌더러에서 그림자를 만드는 조명은 **주광 하나뿐**이다.
  assert.equal((glSrc.match(/\.castShadow = true/g) || []).length, 1, '그림자를 만드는 조명이 둘 이상이다');
  assert.match(glSrc, /key\.castShadow = true/);
  // 그림자 범위는 방 크기를 따라간다(깊은 방에서 잘리지 않게).
  assert.match(glSrc, /const half = Math\.max\(room\.W, room\.D\) \* 0\.75 \+ room\.H;/);
  // 주광 비중이 과하지 않다 = 그림자가 검은 얼룩이 되지 않는다.
  const lv = applyDesignLighting({ ...LIGHTS }, LC);
  assert.ok(keyShareOfLevels(lv) < 0.35, `주광 비중 ${keyShareOfLevels(lv).toFixed(3)}`);
});

// ── C. 전역 렌더러 · 화각 동결 ─────────────────────────────────────────────

test('⑦⑧⑨ 전역 렌더러(톤 매핑·노출·색공간)를 건드리지 않았다', () => {
  assert.ok(!/toneMapping|toneMappingExposure|outputColorSpace/.test(litSrc), '조명 층이 전역 설정을 건드린다');
  // 렌더러에서도 노출·톤 매핑을 공간별로 바꾸지 않는다.
  assert.equal((glSrc.match(/toneMappingExposure\s*=/g) || []).length, 0, '노출을 코드에서 바꾼다');
  assert.equal((glSrc.match(/renderer\.toneMapping\s*=/g) || []).length, 0, '톤 매핑을 코드에서 바꾼다');
  assert.ok(!/EffectComposer|UnrealBloom|SSAO|postprocessing/.test(glSrc), '후처리가 들어왔다');
});

test('⑱ 조명 층이 화각을 건드리지 않았다', () => {
  // 대회의실 화각은 **이 단계 뒤(PHASE 4-d.3)** 에 켜졌다. 조명 층은 그것을 읽지 않는다.
  assert.equal(ROOM_DESIGNS[LC].camera, 'conferenceProposal');
  assert.ok(!/design-camera/.test(litSrc), '조명 층이 화각 모듈을 읽는다');
  // 화각 모듈은 거꾸로 조명을 읽지 않는다 — 두 층이 서로 물리면 한쪽을 고칠 때 다른 쪽이 흔들린다.
  assert.ok(!/design-lighting|design-finish/.test(camSrc), '화각 모듈이 조명·마감을 읽는다');
});

// ── D. 재질 · 형상 · 배치 동결 ─────────────────────────────────────────────

test('⑩⑪ 마감(conferenceBright)과 정식 재질 13종이 그대로다', () => {
  const p = DESIGN_PALETTES.conferenceBright;
  assert.equal(p.wallFront, '#f3f1ed');
  assert.equal(p.wallSide, '#ece9e4');
  assert.equal(p.wallAccent, '#e4e0d9');
  assert.equal(p.floor, '#c0c1c0');
  assert.equal(p.conferenceTop, '#e2ddd1');
  assert.equal(p.conferenceBase, '#3a3f46');
  assert.equal(p.monitorBody, '#262b31');
  assert.equal(p.screen, '#181f2a');
  assert.equal(p.rug, '#c4c5c3');
  assert.equal(Object.keys(MATERIAL_PRESETS).length, 13);
  // 조명 문제를 재질로 보정하지 않았다 — 조명 층이 마감을 읽지도 않는다.
  assert.ok(!/design-finish|DESIGN_PALETTES/.test(litSrc), '조명 층이 마감을 건드린다');
});

test('⑫~⑯ 의자·테이블·모니터·프롬퍼터 형상과 자리가 그대로다', () => {
  assert.equal(createConferenceErgoChair().length, 13);
  const r = lay(16000, 12000, 30);
  const S = createLargeUTable(r.items.filter(i => i.type === 'table'));
  assert.equal(S.outerW, 12000);
  assert.equal(S.outerD, 6500);
  assert.equal(S.surfaceY, 740);
  assert.equal(S.topThk, 25);
  assert.equal(S.supports.length, 11);
  assert.equal(S.rotY, 0);
  assert.equal(r.items.filter(i => i.type === 'monitor').length, 30);
  const pr = r.items.filter(i => i.type === 'prompter');
  assert.equal(pr.length, 1);
  assert.equal(pr[0].x, 8000);
  assert.equal(pr[0].z, 7650);
  assert.equal(createPrompter()[2].tiltX, FURNITURE_CONTRACTS.prompter.dimensions.tiltDeg);
  assert.equal(r.capacity, 30);
});

// ── E. 여섯 가지 배치 모두 유효 ────────────────────────────────────────────

test('⑲~㉔ U·보트·사각 × 가로·세로 여섯 가지가 모두 선다', () => {
  const CASES = [
    ['u', 'across', 16000, 12000], ['u', 'along', 10000, 18000],
    ['boat', 'across', 16000, 12000], ['boat', 'along', 10000, 18000],
    ['rect', 'across', 16000, 12000], ['rect', 'along', 10000, 18000],
  ];
  for (const [shape, dir, W, D] of CASES) {
    const r = lay(W, D, 40, { tableShape: shape, tableDir: dir });
    assert.ok(r.capacity > 0, `${shape}/${dir}: 정원 0`);
    assert.ok(r.items.some(i => i.type === 'table'), `${shape}/${dir}: 테이블이 없다`);
    assert.ok(r.items.filter(i => i.type === 'chair').length > 0, `${shape}/${dir}: 의자가 없다`);
    // 조명은 **배치 방향과 무관**하다 — 같은 프리셋·같은 그림자 설정이다(§16).
    assert.equal(lightingForDesign(LC), P);
    assert.equal(shadowSettingsForDesign(LC), P.shadow);
  }
  // 방 크기가 달라도 프리셋은 같고, 보조광 자리만 방 비율로 따라간다.
  for (const room of [{ W: 12, H: 3.6, D: 9 }, { W: 14, H: 3.8, D: 10 }, ROOM,
    { W: 10, H: 3.8, D: 18 }, { W: 12, H: 3.8, D: 16 }]) {
    const f = fillLightPlacementForDesign(LC, room);
    assert.ok(f && Number.isFinite(f.position.x) && Number.isFinite(f.target.z), JSON.stringify(room));
  }
});

// ── F. 무회귀 ──────────────────────────────────────────────────────────────

test('㉘㉙㉚ 대기업·임원·다른 용도의 배치가 그대로다', () => {
  for (const [W, D] of [[8000, 7000], [11000, 9000]]) {
    const a = layoutRoom('meeting', defaultOptions('meeting'), { W, D, ledBottom: 1000 });
    const b = layoutRoom('meeting', defaultOptions('meeting'),
      { W, D, ledBottom: 1000, design: 'corporateMeeting' });
    assert.deepEqual(b.items, a.items);
  }
  for (const t of ['classroom', 'hall_m', 'control', 'ideation']) {
    const a = layoutRoom(t, defaultOptions(t), { W: 14000, D: 16000, ledBottom: 1000 });
    const b = layoutRoom(t, defaultOptions(t), { W: 14000, D: 16000, ledBottom: 1000, design: LC });
    assert.deepEqual(b.items, a.items, t);
  }
});

test('㉛㉜ 계산기·가격표 무회귀', () => {
  const m = MODELS.find(x => x.id === 'MP012F');
  const r = computeConfig(m, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.resW, 4480);
  assert.equal(r.maxW, 6132);
  assert.match(appSrc, /await import\('\.\/prices\.local\.js\?v=\d+'\)\)\.PRICES; \} catch \{ PRICES = null; \}/);
  assert.equal(existsSync(new URL('../src/prices.local.js', import.meta.url)), false);
});

test('기준 값 고정 — conferenceSoft', () => {
  assert.deepEqual({ ...P.scale }, { hemi: 1.18, ceiling: 0.28, key: 0.92, fill: 1.30, ledSpill: 1.00 });
  assert.deepEqual({ ...P.shadow }, { radius: 12, bias: -0.00035, normalBias: 0.030 });
  assert.deepEqual({ ...P.fillPos }, { x: 1.45, y: 0.62, z: 0.55 });
  assert.deepEqual({ ...P.fillTarget }, { x: 0.5, y: 0.52, z: 0.5 });
  assert.equal(P.keyPos, undefined);
});
