// training-release.test.js — 교육장 V1 릴리스 게이트. (PHASE 7-c, DEC-131)
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일은 **릴리스 판정을 값으로 고정한다.** 상황실이 PHASE 5-e 에서 그랬듯,
//   승급 뒤에 무엇이 달라지면 안 되는지를 한 곳에 모아 둔다.
//   승급 자체는 `status` 한 줄이지만, 그 한 줄이 뜻하는 것은
//   "여기 적힌 값들이 앞으로 함부로 바뀌지 않는다"는 약속이다.
//
// 릴리스 판정의 뜻 — `ready` 는 '보기 좋다'가 아니라 **'적힌 것이 전부 실재하고,
//   릴리스 게이트에서 잰 값이 이것'** 이라는 뜻이다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ROOM_DESIGNS, DESIGN_STATUS, DESIGN_IDS, DEFAULT_DESIGN_BY_ROOM_TYPE,
  normalizeDesign, roomDesign, isPlanned } from '../src/room-design.js';
import { trainingFinishForDesign } from '../src/design-finish.js';
import { LIGHTING_PRESETS, lightingForDesign, shadowSettingsForDesign,
  keyLightPlacementForDesign, fillLightPlacementForDesign } from '../src/design-lighting.js';
import { TRAINING_CAMERA_PLANS, TRAINING_FOV_RANGE, TRAINING_CAMERA_PRESETS,
  cameraPlanForDesign, EYE_RANGE, WALL_MARGIN } from '../src/design-camera.js';
import { MATERIAL_IDS, resolveMaterialId } from '../src/materials.js';
import { layoutRoom, defaultOptions, ROOM_TYPES } from '../src/room-presets.js';
import { buildGLModel, presetPose, settledPose, CAMERA_PRESETS, FOV_DEG, TOP_PITCH_DEG } from '../src/gl-model.js';
import { MODELS } from '../src/models.js';
import { computeConfig } from '../src/engine.js';

const TR = 'trainingRoom';
const 릴리스 = ['corporateMeeting', 'executiveBoardroom', 'largeConference', 'controlRoom', TR];
const ASP = 574 / 563;   // 실제 캔버스 비율
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const code = f => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ROOMS = [['Compact', 8000, 3000, 7000], ['Default', 12000, 3400, 10000], ['Large', 18000, 3600, 14000]];

function 모델(W, H, D) {
  const lay = layoutRoom('classroom', defaultOptions('classroom'), { W, D, design: TR });
  return { lay, m: buildGLModel({
    space: { W, H, D },
    led: { marginW: (W - 4000) / 2, mount: 1000, w: 4000, h: 2300, depth: 60, cols: 4, rows: 4 },
    items: lay.items, roomType: 'classroom', design: TR }) };
}

// ── ① 승급 ──────────────────────────────────────────────────────────────────

test('① 교육장이 ready 로 승급했고, 릴리스한 다섯 공간만 ready 다', () => {
  assert.equal(ROOM_DESIGNS[TR].status, DESIGN_STATUS.READY, '교육장이 아직 ready 가 아니다');
  for (const id of 릴리스) assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.READY, `${id}: ready 가 아니다`);
  for (const id of DESIGN_IDS) {
    if (릴리스.includes(id)) continue;
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.PLANNED, `${id}: 중간 상태가 생겼다`);
  }
});

test('② ready 는 **적힌 것이 전부 실재한다**는 뜻이다 — 교육장이 그 조건을 만족한다', () => {
  const d = ROOM_DESIGNS[TR];
  // 소품은 계약상 INHERIT 이고, 그 밖의 자리는 planned placeholder 가 남아 있으면 안 된다.
  for (const k of ['palette', 'lighting', 'camera', 'layoutVariant']) {
    assert.equal(isPlanned(d[k]), false, `${k}: 아직 planned 다`);
    assert.equal(typeof d[k], 'string', `${k}: 실물 이름이 아니다`);
  }
  assert.equal(d.palette, 'trainingNeutral');
  assert.equal(d.lighting, 'trainingSoft');
  assert.equal(d.camera, 'trainingProposal');
  assert.equal(d.layoutVariant, 'training-grid');
  assert.ok(Object.isFrozen(d));
});

test('③ 강의실의 기본 디자인은 교육장이고, 잘못된 값도 교육장으로 정상화된다', () => {
  assert.equal(DEFAULT_DESIGN_BY_ROOM_TYPE.classroom, TR);
  for (const v of ['', 'nope', 'controlRoom', 42, null, undefined, {}, [], 'TRAININGROOM', ' trainingRoom ', TR]) {
    assert.equal(normalizeDesign(v, 'classroom'), TR, `${JSON.stringify(v)} 가 교육장으로 떨어지지 않는다`);
  }
});

// ── ② 마감 · 조명 · 화각 동결 ───────────────────────────────────────────────

test('④ 마감 `trainingNeutral` 이 PHASE 7-a 값 그대로다', () => {
  const f = trainingFinishForDesign(TR);
  const 기대 = {
    deskTop: ['neutralLaminate', '#d7d3cc'], deskLeg: ['darkGraphite', '#454a51'],
    deskRail: ['darkGraphite', '#454a51'], deskPanel: ['paintedWallWhite', '#c0c3c6'],
    chairSeat: ['fabricChair', '#8f9499'], chairBack: ['fabricChair', '#8f9499'],
    seatFrame: ['darkGraphite', '#4a4f56'], podium: ['paintedWallWhite', '#dedbd5'],
    podiumTop: ['neutralLaminate', '#d7d3cc'],
  };
  for (const [part, [mat, color]] of Object.entries(기대)) {
    assert.equal(f[part].material, mat, `${part}: 재질이 달라졌다`);
    assert.equal(f[part].color, color, `${part}: 색이 달라졌다`);
    assert.ok(MATERIAL_IDS.includes(f[part].canonical), `${part}: 정식 재질이 아니다`);
  }
  // 옛 민트·파스텔 색이 되살아나면 안 된다.
  const 색들 = Object.values(f).map(v => v.color);
  for (const 금지 of ['#cbdad7', '#cedbdb', '#ffffff']) {
    assert.equal(색들.includes(금지), false, `옛 마감 ${금지} 가 되살아났다`);
  }
});

test('⑤ 정식 재질은 13종 그대로이고, 교육장 배분이 전부 그 안에서 풀린다', () => {
  assert.equal(MATERIAL_IDS.length, 13, '정식 재질 수가 달라졌다');
  assert.deepEqual([...MATERIAL_IDS], ['paintedWall', 'carpetTile', 'vinylFloor', 'woodTable', 'metalFrame',
    'fabricChair', 'stageSurface', 'carpetTileDark', 'neutralLaminate', 'darkGraphite', 'blackEquipment',
    'glassPartition', 'acousticPanel']);
  for (const [part, name] of Object.entries(ROOM_DESIGNS[TR].materials)) {
    const c = resolveMaterialId(name);
    assert.ok(MATERIAL_IDS.includes(c), `${part}(${name}): 정식 재질로 풀리지 않는다`);
  }
  assert.equal(ROOM_DESIGNS[TR].materials.floor, 'carpetTile');
  assert.equal(resolveMaterialId(ROOM_DESIGNS[TR].materials.wall), 'paintedWall');
  assert.equal(ROOM_DESIGNS[TR].materials.deskTop, 'neutralLaminate');
  assert.equal(ROOM_DESIGNS[TR].materials.deskBase, 'darkGraphite');
  assert.equal(ROOM_DESIGNS[TR].materials.chair, 'fabricChair');
  assert.equal(ROOM_DESIGNS[TR].materials.chairFrame, 'darkGraphite');
});

test('⑥ 조명 `trainingSoft` 가 승인값 그대로이고, 그림자를 만드는 조명은 하나뿐이다', () => {
  const l = lightingForDesign(TR);
  assert.equal(l.id, 'trainingSoft');
  assert.deepEqual({ ...l.scale }, { hemi: 0.88, ceiling: 1.08, key: 1.05, fill: 1.50, ledSpill: 1.00 });
  assert.deepEqual({ ...shadowSettingsForDesign(TR) }, { radius: 8, bias: -0.00035, normalBias: 0.030 });
  // 조명은 **세기만** 바꾼다 — 자리를 정하지 않는다.
  assert.equal(keyLightPlacementForDesign(TR, { W: 12, H: 3.4, D: 10 }), null);
  assert.equal(fillLightPlacementForDesign(TR, { W: 12, H: 3.4, D: 10 }), null);
  // 그림자를 만드는 조명은 렌더러에서 주광 하나뿐이다.
  const gl = code('render3d-gl.js');
  assert.equal((gl.match(/castShadow = true/g) || []).length, 1, '그림자를 만드는 조명이 늘었다');
  assert.ok(/key\.castShadow = true/.test(gl), '주광이 그림자를 만들지 않는다');
});

test('⑦ 화각 `trainingProposal` — 하드 게이트 44° 와 기준값이 그대로다', () => {
  assert.deepEqual({ ...TRAINING_FOV_RANGE }, { min: 36, max: 44 });
  assert.deepEqual(JSON.parse(JSON.stringify(TRAINING_CAMERA_PLANS)), {
    interior: { eye: 1.66, fov: 42, band: 0.14, xRatio: 0.50, aimMix: 0.16 },
    'corner-l': { eye: 1.70, fov: 43, band: 0.12, xRatio: 0.26, aimMix: 0.30 },
    'corner-r': { eye: 1.70, fov: 43, band: 0.12, xRatio: 0.74, aimMix: 0.30 },
  });
  assert.deepEqual([...TRAINING_CAMERA_PRESETS], ['interior', 'corner-l', 'corner-r']);
});

test('⑧ 대표 화각 행렬 — 세 방 × 세 시점이 42 / 43 / 43 이고 LED 가 온전하다', () => {
  const 행렬 = { interior: 42, 'corner-l': 43, 'corner-r': 43 };
  for (const [tag, W, H, D] of ROOMS) {
    const { m } = 모델(W, H, D);
    for (const v of TRAINING_CAMERA_PRESETS) {
      const p = cameraPlanForDesign(TR, v, m, ASP);
      assert.equal(p.fov, 행렬[v], `${tag}/${v}: 화각이 달라졌다(${p.fov})`);
      assert.ok(p.fov <= 44 + 1e-9, `${tag}/${v}: 하드 게이트를 넘겼다`);
      assert.equal(p.ledVisibleShare, 1, `${tag}/${v}: LED 가 잘렸다`);
      assert.equal(p.remedy, 'base', `${tag}/${v}: 승인된 자리에서 수단이 돌았다`);
      // 사람 눈높이 · 시선은 눈보다 아래 · 방 안 · 벽에서 떨어져 있다.
      assert.ok(p.position[1] >= EYE_RANGE.min && p.position[1] <= EYE_RANGE.max, `${tag}/${v}: 눈높이`);
      assert.ok(p.target[1] < p.position[1], `${tag}/${v}: 시선이 눈보다 높다`);
      assert.ok(p.wallClearance >= WALL_MARGIN - 1e-6, `${tag}/${v}: 벽에 붙었다`);
      assert.ok(p.rearClearance >= 0, `${tag}/${v}: 카메라가 가구 안이다`);
      // 선언한 눈높이가 그대로 화면 눈높이다(조작기가 끌어올리지 못한다).
      const pose = presetPose(v, m, ASP, { fov: 40, topPerspective: true });
      assert.deepEqual(settledPose(pose).position, pose.position, `${tag}/${v}: 조작기가 카메라를 옮긴다`);
    }
  }
});

// ── ③ 배치 · 강사 구역 ──────────────────────────────────────────────────────

test('⑨ 배치 지문이 PHASE 7-a 승인 상태 그대로다', () => {
  const 기대 = {
    Compact: { desks: 7, chairs: 7, capacity: 6, placed: { desks: 6, chairs: 6, cols: 3, rows: 2, perDesk: 1 } },
    Default: { desks: 17, chairs: 17, capacity: 20, placed: { desks: 16, chairs: 16, cols: 4, rows: 4, perDesk: 1 } },
    Large: { desks: 17, chairs: 17, capacity: 56, placed: { desks: 16, chairs: 16, cols: 4, rows: 4, perDesk: 1 } },
  };
  for (const [tag, W, H, D] of ROOMS) {
    const { lay } = 모델(W, H, D);
    const desks = lay.items.filter(i => i.type === 'desk');
    const chairs = lay.items.filter(i => i.type === 'chair');
    assert.equal(desks.length, 기대[tag].desks, `${tag}: 책상 수`);
    assert.equal(chairs.length, 기대[tag].chairs, `${tag}: 의자 수`);
    assert.equal(lay.capacity, 기대[tag].capacity, `${tag}: 정원`);
    assert.deepEqual(lay.placed, 기대[tag].placed, `${tag}: 배치 결과`);
    // 교탁·강사 책상·강사 의자가 모두 있고, 화분은 기본 꺼짐이다.
    assert.ok(lay.items.some(i => i.type === 'podium'), `${tag}: 교탁이 없다`);
    assert.equal(lay.items.filter(i => i.type === 'plant').length, 0, `${tag}: 화분이 켜졌다`);
    // 책상 블록의 가운데가 방 가운데다(학생 가구를 옆으로 밀지 않았다).
    const 학생 = desks.slice().sort((a, b) => a.z - b.z).slice(1);
    const cx = (Math.min(...학생.map(i => i.x)) + Math.max(...학생.map(i => i.x))) / 2;
    assert.ok(Math.abs(cx - W / 2) < 1e-6, `${tag}: 학생 책상 블록이 가운데가 아니다`);
  }
});

test('⑩ 강사 의자 보정이 그대로다 — 중심 z 325mm, 앞벽 여유는 양수다', () => {
  for (const [tag, W, H, D] of ROOMS) {
    const { lay } = 모델(W, H, D);
    const 강사의자 = lay.items.filter(i => i.type === 'chair').sort((a, b) => a.z - b.z)[0];
    assert.equal(강사의자.z, 325, `${tag}: 강사 의자가 움직였다`);
    // 자산 발자국(앞뒤 450mm)의 절반을 빼도 앞벽에서 떨어져 있다.
    assert.ok(강사의자.z - 225 > 0, `${tag}: 강사 의자가 앞벽을 파고든다`);
  }
  // 보정은 짐작한 숫자가 아니라 기존 상수에서 나온다.
  const rp = code('room-presets.js');
  assert.ok(/Math\.max\(F\.chairClear \/ 2, iz - 750\)/.test(rp), '강사 의자 보정식이 달라졌다');
});

test('⑪ LED 형상·시점 목록은 그대로다', () => {
  const { m } = 모델(12000, 3400, 10000);
  assert.deepEqual([m.led.w, m.led.h, m.led.depth], [4, 2.3, 0.06]);
  assert.equal(m.led.y, 1);
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id), ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top']);
});

// ── ④ 건드리지 않은 것 ──────────────────────────────────────────────────────

test('⑫ 평면·정면·아이소는 교육장에서도 기술 시점 그대로다', () => {
  const { m } = 모델(12000, 3400, 10000);
  for (const v of ['top', 'front', 'iso']) {
    assert.equal(cameraPlanForDesign(TR, v, m, ASP), null, `${v}: 디자인이 가로챘다`);
    const a = presetPose(v, m, ASP, { fov: 40 });
    const b = presetPose(v, { ...m, design: 'corporateMeeting' }, ASP, { fov: 40 });
    assert.deepEqual(a, b, `${v}: 디자인에 따라 달라진다`);
  }
  assert.equal(TOP_PITCH_DEG, 58);
  assert.equal(FOV_DEG, 40);
  assert.equal(presetPose('top', 모델(12000, 3400, 10000).m, ASP, { fov: 40 }).ortho, true);
  assert.equal(presetPose('front', 모델(12000, 3400, 10000).m, ASP, { fov: 40 }).fov, FOV_DEG);
});

test('⑬ 릴리스된 네 공간의 조명이 한 값도 바뀌지 않았다', () => {
  assert.deepEqual({ ...LIGHTING_PRESETS.corporateSoft.scale },
    { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.executiveSoft.scale },
    { hemi: 1.05, ceiling: 0.30, key: 1.00, fill: 2.00, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.conferenceSoft.scale },
    { hemi: 1.18, ceiling: 0.28, key: 0.92, fill: 1.30, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.controlTechnical.scale },
    { hemi: 0.58, ceiling: 0.22, key: 0.98, fill: 2.00, ledSpill: 1.00 });
  assert.deepEqual(Object.keys(LIGHTING_PRESETS),
    ['corporateSoft', 'executiveSoft', 'conferenceSoft', 'trainingSoft', 'controlTechnical',
      'ideationSoft']);
});

test('⑭ 강당·아이디에이션 배치가 그대로다', () => {
  const 강당 = ROOM_TYPES.find(t => t.id === 'hall_m');
  assert.ok(강당, '중강당이 없다');
  const rp = code('room-presets.js');
  assert.ok(/seatPitchX: 550, seatPitchZ: 950,/.test(rp), '강당 좌석 간격이 달라졌다');
  const 아이디 = ROOM_TYPES.find(t => t.id === 'ideation');
  const ht = 아이디.options.find(o => o.key === 'highTables');
  assert.equal(ht.default, 1, '아이디에이션 하이 테이블 기본값이 달라졌다');
  assert.equal(아이디.options.find(o => o.key === 'lounge').default, true);
});

test('⑮ 소품 계약(DEC-126)이 그대로다', () => {
  assert.equal(defaultOptions('classroom').plant, false, '강의실 화분 기본값이 달라졌다');
  assert.equal(defaultOptions('meeting').plant, true);
  assert.equal(defaultOptions('control').plant, false);
  assert.equal(defaultOptions('ideation').plant, true);
  // 서 있는 사람은 저장되는 값이다 — 화면이 실제로 저장을 호출한다.
  const app = code('app.js');
  assert.ok(/person3d: pv3dShow\.person/.test(app), '사람 표시가 저장되지 않는다');
  assert.ok(/pv3dShow\.person = c\.person3d/.test(app), '사람 표시가 복원되지 않는다');
  // 소품 전용 그룹이나 플래너를 만들지 않았다(계약대로 기존 구조만 쓴다).
  for (const f of ['render3d-gl.js', 'furniture-gl.js', 'room-presets.js']) {
    assert.equal(/accessoriesGroup|accessoryPlanner/.test(code(f)), false, `${f}: 소품 전용 구조가 생겼다`);
  }
});

// ── ⑤ 계산기 · 가격표는 이 단계와 무관하다 ──────────────────────────────────

test('⑯ 삼성 정합성 기준값(MP012F 7×6)이 그대로다', () => {
  const MP012F = MODELS.find(m => m.id === 'MP012F');
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.resW, 4480);
  assert.equal(r.resH, 2160);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.weightKg - 386.4) < 0.1, `weight=${r.weightKg}`);
});

test('⑰ 가격표는 저장소에 없고, 없어도 화면이 동작한다', () => {
  const app = src('app.js');
  assert.ok(/try \{ PRICES = \(await import\('\.\/prices\.local\.js/.test(app.replace(/\s+/g, ' ')),
    '가격표를 try 없이 읽는다');
  assert.ok(/catch \{ PRICES = null; \}/.test(app.replace(/\s+/g, ' ')), '가격표가 없을 때 처리가 없다');
  // 저장소에 가격 파일이 들어오면 안 된다(오너 지침 §5).
  let 있음 = true;
  try { readFileSync(new URL('../src/prices.local.js', import.meta.url)); } catch { 있음 = false; }
  assert.equal(있음, false, '가격표 파일이 저장소에 들어왔다');
});

test('⑱ 상태 승급은 화면이 쓰는 값에 영향을 주지 않는다', () => {
  // 디자인의 `status` 는 기록용이다 — 마감·조명·화각·가구 해석 어디에도 쓰이지 않는다.
  //   (`furniture-routing.js` 의 `contractStatus` 는 **가구 계약**의 상태이고 디자인 상태가 아니다.)
  for (const f of ['design-finish.js', 'design-lighting.js', 'design-camera.js', 'render3d-gl.js',
    'furniture-routing.js', 'app.js']) {
    assert.equal(/DESIGN_STATUS|roomDesign\([^)]*\)\.status|design\.status/.test(code(f)), false,
      `${f}: 렌더 경로가 디자인 상태를 읽는다`);
  }
  // 상태만 바꾼 사본으로도 해석 결과가 같다.
  const 원본 = roomDesign(TR);
  const 사본 = Object.freeze({ ...원본, status: DESIGN_STATUS.PLANNED });
  assert.equal(사본.status, DESIGN_STATUS.PLANNED, '사본 만들기가 실패했다');
  assert.equal(사본.palette, 원본.palette);
  assert.equal(사본.lighting, 원본.lighting);
  assert.equal(사본.camera, 원본.camera);
  assert.deepEqual(사본.materials, 원본.materials);
});
