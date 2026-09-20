// ideation-foundation.test.js — 아이디에이션 V1 기반 + P1 수정 (PHASE 8-2a, DEC-135).
//
// 이 단계가 고친 것은 네 가지다.
//   ① 디자인 층을 만들었다(`ideationRoom`) — 그것이 없으면 조명·화각을 **걸 자리가 없다**.
//   ② 작은 방에서 구역끼리 파고들던 것을 고쳤다(가로 8.5m 미만).
//   ③ 아이디에이션 전용 상판 두 값을 내렸다(조명으로는 덮이지 않는 재질 문제).
//   ④ 전용 조명(`ideationSoft`)으로 천장 클리핑을 없앴다.
//
// 이 단계가 **하지 않은 것**도 같이 고정한다 — 카메라·소품·AV·팔레트·렌더러 전역은 그대로다.
//   8-2a 가 조명/재질/배치를, 8-2b 가 구도를 따로 증명할 수 있어야 하기 때문이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_DESIGNS, DESIGN_IDS, DESIGN_STATUS, INHERIT, DEFAULT_DESIGN_BY_ROOM_TYPE,
  defaultDesignFor, designsFor, normalizeDesign, resolveDesign, isPlanned, roomDesign, NEUTRAL_DESIGN,
} from '../src/room-design.js';
import { layoutRoom, defaultOptions, roomType, ROOM_TYPES } from '../src/room-presets.js';
import { MATERIAL_IDS, moodFor, floorFinishFor, MOODS } from '../src/materials.js';
import { LIGHTING_PRESETS, lightingForDesign, shadowSettingsForDesign,
  keyLightPlacementForDesign, fillLightPlacementForDesign, LIGHT_ROLES } from '../src/design-lighting.js';
import { roomFinishForDesign, designPalette, DESIGN_PALETTES } from '../src/design-finish.js';
import { FURNITURE_COLORS, DIMS, FURNITURE_ASSETS } from '../src/furniture-assets.js';
import { CAPTURE_CASES, caseById } from '../../svt-led-calculator/qa/capture-cases.js';
import { CAPTURE_STEPS } from '../../svt-led-calculator/qa/capture-state.js';

const 옵션 = () => defaultOptions('ideation');
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

// ── ① 디자인 등록 ────────────────────────────────────────────────────────────

test('① 아이디에이션의 기본 디자인은 ideationRoom 이다', () => {
  assert.equal(DEFAULT_DESIGN_BY_ROOM_TYPE.ideation, 'ideationRoom');
  assert.equal(defaultDesignFor('ideation'), 'ideationRoom');
  assert.equal(ROOM_DESIGNS.ideationRoom.roomType, 'ideation');
  // 고를 것이 하나뿐이라 화면은 선택칸을 그리지 않는다(상황실·교육장과 같은 규칙).
  assert.deepEqual(designsFor('ideation').map(d => d.id), ['ideationRoom']);
});

test('② 엉뚱하거나 오래된 값도 ideationRoom 으로 떨어진다', () => {
  for (const v of [undefined, null, '', 0, false, 'zzz', 'ideation', 'IdeationRoom']) {
    assert.equal(normalizeDesign(v, 'ideation'), 'ideationRoom', String(v));
  }
});

test('③ 다른 방의 디자인이 아이디에이션으로 새어 들지 않는다', () => {
  for (const id of DESIGN_IDS) {
    const got = normalizeDesign(id, 'ideation');
    if (id === 'ideationRoom') { assert.equal(got, 'ideationRoom'); continue; }
    assert.equal(got, 'ideationRoom', `${id} 가 아이디에이션에 그대로 남았다`);
  }
  // 반대 방향도 막혀 있어야 한다 — 아이디에이션 디자인이 남의 방에 붙으면 안 된다.
  assert.equal(normalizeDesign('ideationRoom', 'meeting'), 'corporateMeeting');
  assert.equal(normalizeDesign('ideationRoom', 'classroom'), 'trainingRoom');
  assert.equal(normalizeDesign('ideationRoom', 'control'), 'controlRoom');
  assert.equal(normalizeDesign('ideationRoom', 'hall_m'), null);
});

test('④ 아직 ready 가 아니다 — 화각(8-2b)과 릴리스 게이트(8-2c)가 남아 있다', () => {
  assert.equal(ROOM_DESIGNS.ideationRoom.status, DESIGN_STATUS.PLANNED);
  assert.equal(ROOM_DESIGNS.ideationRoom.phase, 8);
});

// ── ② 조명 ──────────────────────────────────────────────────────────────────

test('⑤ 전용 조명 ideationSoft 가 걸린다 — 값까지 고정', () => {
  const p = lightingForDesign('ideationRoom');
  assert.ok(p, '아이디에이션에 조명이 걸리지 않았다');
  assert.equal(p.id, 'ideationSoft');
  assert.deepEqual({ ...p.scale },
    { hemi: 0.84, ceiling: 1.00, key: 1.05, fill: 1.60, ledSpill: 1.00 });
  // 배수는 다섯 역할에 빠짐없이 있어야 한다(빠지면 그 조명만 조용히 기준값으로 돈다).
  for (const r of LIGHT_ROLES) assert.equal(typeof p.scale[r], 'number', r);
  assert.deepEqual({ ...shadowSettingsForDesign('ideationRoom') },
    { radius: 7, bias: -0.00035, normalBias: 0.030 });
  // **자리는 정하지 않았다** — 세기만 바꾼다(임원·대회의실·교육장에서 배운 대로).
  const room = { W: 9, H: 3.2, D: 8 };
  assert.equal(keyLightPlacementForDesign('ideationRoom', room), null);
  assert.equal(fillLightPlacementForDesign('ideationRoom', room), null);
});

test('⑥ 카메라는 PHASE 8-2b 에서 전용으로 켜졌다 — 일반 카메라표 자체는 그대로다', () => {
  // 8-2a 에서는 planned 였고, 8-2b 에서 전용 화각 'ideationProposal' 로 바뀌었다.
  assert.equal(isPlanned(ROOM_DESIGNS.ideationRoom.camera), false, '화각이 아직 planned 로 남아 있다');
  assert.equal(ROOM_DESIGNS.ideationRoom.camera, 'ideationProposal');
  assert.equal(resolveDesign('ideationRoom').camera, 'ideationProposal');
  // 전용 화각은 '가로채기'일 뿐이라, 모든 방이 함께 쓰는 일반 카메라표는 한 값도 바뀌지 않았다.
  assert.match(src('gl-model.js'), /interior: \{ eye: 1\.75, look: 1\.85, yaw: 12,\s+fov: 42,/);
  assert.match(src('gl-model.js'), /'corner-l': \{ eye: 2\.20, look: 1\.45, yaw: -28, fov: 40,/);
  assert.match(src('gl-model.js'), /export const FOV_DEG = 40;/);
});

// ── ③ 팔레트를 만들지 않았다 ────────────────────────────────────────────────

test('⑦ 정식 재질은 13종 그대로다', () => {
  assert.equal(MATERIAL_IDS.length, 13);
});

test('⑧ 넓은 전용 팔레트를 만들지 않았다 — 정한 것은 조명 하나뿐', () => {
  const d = ROOM_DESIGNS.ideationRoom;
  for (const f of ['furniture', 'palette', 'materials', 'wallTreatment', 'accessories']) {
    assert.equal(d[f], INHERIT, `${f} 가 INHERIT 가 아니다`);
  }
  assert.equal(designPalette('ideationRoom'), null, '아이디에이션 팔레트가 생겼다');
  assert.equal(roomFinishForDesign('ideationRoom'), null, '아이디에이션 마감이 생겼다');
  // 팔레트 등록부는 다섯 벌 그대로다.
  assert.deepEqual(Object.keys(DESIGN_PALETTES),
    ['corporateNeutral', 'executiveBright', 'conferenceBright', 'trainingNeutral', 'controlPalette']);
});

test('⑨ 상판 두 값만 내렸다 — 아이디에이션 전용이라 다른 방에 닿지 않는다', () => {
  assert.equal(FURNITURE_COLORS.highTop, '#ded9cf');
  assert.equal(FURNITURE_COLORS.collabTop, '#ded9cf');
  // 예전 값이 어디에도 남아 있으면 안 된다(다른 색이 같은 값을 쓰지 않는다는 뜻이기도 하다).
  assert.equal(src('furniture-assets.js').includes("'#efe9df'"), false, '옛 상판 색이 남아 있다');
  // 다리·받침 같은 이웃 값은 건드리지 않았다.
  assert.equal(FURNITURE_COLORS.highLeg, '#aeb8c4');
  assert.equal(FURNITURE_COLORS.collabLeg, '#aeb8c4');
  // 다른 방의 상판은 그대로다.
  assert.equal(FURNITURE_COLORS.tableTop, '#ece6db');
  assert.equal(FURNITURE_COLORS.deskTop, '#efeae1');
  assert.equal(FURNITURE_COLORS.consoleTop, '#f3f6f9');
});

// ── ④ 가구·AV·소품은 그대로 ─────────────────────────────────────────────────

test('⑩ 새 가구 자산을 만들지 않았다', () => {
  for (const k of ['highTable', 'stool', 'collabTable', 'loungeChair', 'mobileStand']) {
    assert.ok(DIMS[k], `${k} 치수가 사라졌다`);
  }
  assert.equal(FURNITURE_ASSETS.ideationTable, undefined, '새 아이디에이션 가구가 생겼다');
  // 치수도 그대로다 — '맞춰 넣으려고' 가구를 줄이지 않았다.
  assert.equal(DIMS.collabTable.dia, 1100);
  assert.deepEqual([DIMS.loungeChair.seatW, DIMS.loungeChair.seatD], [640, 620]);
  assert.equal(DIMS.stool.seatR, 190);
  assert.equal(DIMS.highTable.surfaceY, 1050);
});

test('⑪ AV 는 한 값도 바뀌지 않았다', () => {
  assert.deepEqual({ ...DIMS.mobileStand },
    { baseW: 760, baseD: 560, baseH: 70, poleW: 110, panelY: 1280,
      panelW: 1150, panelH: 660, panelThk: 65 });
  assert.equal(FURNITURE_COLORS.standPanel, '#1b2532');
  assert.equal(ROOM_DESIGNS.ideationRoom.furniture, INHERIT, 'AV 를 디자인에서 새로 정했다');
});

test('⑫ 소품 기본값이 그대로다 — 화분·사람·러그 (DEC-126)', () => {
  const o = 옵션();
  assert.equal(o.plant, true);
  assert.equal(o.rug, true);
  assert.equal(ROOM_DESIGNS.ideationRoom.accessories, INHERIT, '소품을 디자인에서 새로 정했다');
  // 사람은 방 옵션이 아니라 3D 표시 토글이다 — 기본 켬이고 저장된다.
  assert.match(src('app.js'), /data-t3d="person"/);
  // 옵션 일곱 칸이 그대로다.
  assert.deepEqual(roomType('ideation').options.map(x => x.key),
    ['highTables', 'stools', 'collabTables', 'lounge', 'mobileStand', 'rug', 'plant']);
});

test('⑬ 바닥 마감과 분위기는 그대로다 — 조명만 바꿨다', () => {
  assert.equal(floorFinishFor('ideation'), 'vinylFloor');
  assert.equal(moodFor('ideation'), 'bright');
  assert.deepEqual({ ...MOODS.bright }, { id: 'bright', label: '밝고 개방적', light: 1.14, wallMix: 0.45 });
});

// ── ⑤ 배치 안전 규칙 ────────────────────────────────────────────────────────

// 실제 자산 발자국으로 겹침을 본다. 회전한 물건은 축 정렬 상자가 겹침을 부풀리므로
//   **돌아간 사각형**과 **원**을 구분해서 잰다(배치 코드가 쓰는 판정과 같은 모양).
const 도형 = it => {
  if (it.type === 'highTable') return { x: it.x, z: it.z, hw: it.w / 2, hd: it.d / 2, rot: 0 };
  const S = { stool: { disc: 190 }, collabTable: { disc: 550 }, plant: { disc: 225 },
    lounge: { hw: 320, hd: 360, dz: 50 }, mobileStand: { hw: 575, hd: 280 } }[it.type];
  if (!S) return null;
  if (S.disc) return { x: it.x, z: it.z, disc: S.disc };
  const a = (it.rotY || 0) * Math.PI / 180;
  return { x: it.x + (S.dz || 0) * Math.sin(a), z: it.z + (S.dz || 0) * Math.cos(a),
    hw: S.hw, hd: S.hd, rot: a };
};
const 모서리 = S => {
  const c = Math.cos(S.rot), s = Math.sin(S.rot), out = [];
  for (const sx of [-S.hw, S.hw]) for (const sz of [-S.hd, S.hd]) out.push([S.x + sx * c + sz * s, S.z - sx * s + sz * c]);
  return out;
};
function 겹치나(A, B) {
  if (A.disc && B.disc) return Math.hypot(A.x - B.x, A.z - B.z) < A.disc + B.disc;
  if (A.disc || B.disc) {
    const [box, cir] = A.disc ? [B, A] : [A, B];
    const dx = cir.x - box.x, dz = cir.z - box.z, c = Math.cos(box.rot), s = Math.sin(box.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const qx = Math.max(-box.hw, Math.min(box.hw, lx)), qz = Math.max(-box.hd, Math.min(box.hd, lz));
    return Math.hypot(lx - qx, lz - qz) < cir.disc;
  }
  const pa = 모서리(A), pb = 모서리(B);
  for (const S of [A, B]) {
    const c = Math.cos(S.rot), s = Math.sin(S.rot);
    for (const [ux, uz] of [[c, -s], [s, c]]) {
      const 폭 = p => p.reduce((r, q) => { const v = q[0] * ux + q[1] * uz;
        return [Math.min(r[0], v), Math.max(r[1], v)]; }, [Infinity, -Infinity]);
      const [a0, a1] = 폭(pa), [b0, b1] = 폭(pb);
      if (Math.min(a1, b1) - Math.max(a0, b0) <= 0) return false;
    }
  }
  return true;
}
/** 구역이 다른 물건끼리 겹치는 짝을 센다(같은 테이블에 딸린 의자는 붙어 있는 것이 정상). */
function 겹침수(res) {
  const 구역 = new Map();
  let z = -1;
  for (const it of res.items) {
    if (it.type === 'highTable' || it.type === 'collabTable') z++;
    if (it.type === 'mobileStand' || it.type === 'plant') z = -100 - 구역.size;
    구역.set(it, z);
  }
  const 물건 = res.items.filter(i => i.type !== 'rug').map(i => [i, 도형(i)]).filter(([, s]) => s);
  let n = 0;
  for (let a = 0; a < 물건.length; a++) {
    for (let b = a + 1; b < 물건.length; b++) {
      if (구역.get(물건[a][0]) === 구역.get(물건[b][0]) && 구역.get(물건[a][0]) >= 0) continue;
      if (겹치나(물건[a][1], 물건[b][1])) n++;
    }
  }
  return n;
}

test('⑭ 도달 가능한 모든 방 크기에서 가구가 서로 파고들지 않는다', () => {
  // PHASE 8-1 은 8.5m 미만에서 실제 간섭이 있다고 쟀다(6 × 5.7m 에서 309mm).
  //   제품은 가로 0.5m 까지 입력을 받으므로 사용자가 도달할 수 있는 결함이었다.
  for (let w = 4; w <= 16; w += 0.5) {
    const W = Math.round(w * 1000), D = Math.max(5000, Math.round(w * 950));
    assert.equal(겹침수(layoutRoom('ideation', 옵션(), { W, D })), 0, `${w}m 에서 겹친다`);
  }
  // 최대 구성도 마찬가지다.
  const 최대 = { highTables: 3, stools: 8, collabTables: 4, lounge: true,
    mobileStand: true, rug: true, plant: true };
  for (let w = 4; w <= 16; w += 1) {
    const W = Math.round(w * 1000), D = Math.max(5000, Math.round(w * 950));
    assert.equal(겹침수(layoutRoom('ideation', 최대, { W, D })), 0, `최대 구성 ${w}m 에서 겹친다`);
  }
});

test('⑮ 경계에서 규칙이 실제로 일한다 — 좁으면 줄이고, 그 사실을 알린다', () => {
  // 좁은 방: 요청보다 적게 놓이고 **그 사실이 안내에 남는다**(조용히 숨기지 않는다).
  const 좁은 = layoutRoom('ideation', 옵션(), { W: 5000, D: 5000 });
  assert.ok(좁은.placed.collabTables < 2, '좁은 방인데 협업 구역이 그대로다');
  assert.ok(좁은.notes.some(n => n.includes('놓지 못했습니다')), '줄었다는 안내가 없다');
  assert.equal(좁은.capacity, 좁은.placed.stools + 좁은.placed.lounge, '정원이 실제 좌석과 다르다');
  // 중간 방: 자리를 옮겨서 **가구를 지키고**, 옮겼다는 사실을 알린다.
  const 중간 = layoutRoom('ideation', 옵션(), { W: 8000, D: 7600 });
  assert.equal(중간.placed.collabTables, 2, '옮기면 들어가는데 빼 버렸다');
  assert.equal(중간.placed.chairs, 10);
  assert.ok(중간.notes.some(n => n.includes('자리를 옮겼습니다')), '옮겼다는 안내가 없다');
});

test('⑯ 기본 9m 배치 — PHASE 8-2b.1 에서 협업·라운지·러그만 다시 열었다', () => {
  // 하이 테이블·스툴·화분은 8-2a 그대로다. 협업 두 덩이가 LED 쪽으로 내려왔고, 이동식
  //   디스플레이는 기존 안전 규칙대로 0.9m 뒤로 비켜섰다(같은 모서리에 그대로 있다).
  const r = layoutRoom('ideation', 옵션(), { W: 9000, D: 8000 });
  assert.deepEqual(r.items.map(i => [i.type, Math.round(i.x), Math.round(i.z), Math.round(i.rotY || 0)]), [
    ['highTable', 2700, 3360, 0],
    ['stool', 2390, 2480, 161],
    ['stool', 2390, 4240, 19],
    ['stool', 3010, 2480, 199],
    ['stool', 3010, 4240, 341],
    ['collabTable', 5080, 2087, 0],
    ['lounge', 5615, 3013, 330],
    ['lounge', 5615, 1160, 210],
    ['lounge', 4010, 2087, 90],
    ['rug', 5080, 2087, 0],
    ['collabTable', 6950, 2250, 0],
    ['lounge', 6415, 3177, 30],
    ['lounge', 6415, 1323, 150],
    ['lounge', 8020, 2250, 270],
    ['mobileStand', 7500, 3400, -35],
    ['plant', 8500, 7500, 0],
  ]);
  assert.deepEqual(r.placed, { highTables: 1, stools: 4, collabTables: 2, lounge: 6, chairs: 10 });
  assert.equal(r.capacity, 10);
  // 개수·정원은 그대로이고, 자리를 옮겼다는 사실은 안내로 드러난다(숨기지 않는다).
  assert.deepEqual(r.notes, ['가구가 겹치지 않도록 2개 구역의 자리를 옮겼습니다.']);
});

test('⑰ 가로 8.5m 이상에서 개수·정원이 흔들리지 않는다 — 옮긴 사실은 안내로 드러난다', () => {
  for (const [W, D] of [[8500, 8070], [10000, 9500], [12000, 11400], [14000, 13300], [16000, 15200]]) {
    const r = layoutRoom('ideation', 옵션(), { W, D });
    assert.deepEqual(r.placed, { highTables: 1, stools: 4, collabTables: 2, lounge: 6, chairs: 10 },
      `${W}×${D} 에서 놓인 개수가 달라졌다`);
    // 빠진 구역은 없어야 한다 — 옮기기만 한다.
    assert.equal(r.notes.some(n => /놓지 못했습니다/.test(n)), false, `${W}×${D} 에서 구역이 빠졌다`);
  }
  // 아주 넓은 방에서는 아무것도 옮길 필요가 없다.
  assert.deepEqual(layoutRoom('ideation', 옵션(), { W: 16000, D: 15200 }).notes, []);
});

// ── ⑥ 건드리지 않은 것 ──────────────────────────────────────────────────────

test('⑱ 렌더러 전역이 그대로다 — 톤매핑·노출·색공간을 건드리지 않았다', () => {
  const s = src('render3d-gl.js');
  assert.match(s, /renderer\.outputColorSpace = THREE\.SRGBColorSpace;/);
  assert.equal(/renderer\.toneMapping\s*=/.test(s), false, '톤매핑을 건드렸다');
  assert.equal(/toneMappingExposure/.test(s), false, '노출을 건드렸다');
  assert.match(s, /renderer\.shadowMap\.type = THREE\.PCFSoftShadowMap;/);
});

test('⑲ 릴리스된 다섯 공간의 계약이 그대로다', () => {
  for (const id of ['corporateMeeting', 'executiveBoardroom', 'largeConference',
    'trainingRoom', 'controlRoom']) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.READY, id);
  }
  assert.deepEqual({ ...LIGHTING_PRESETS.trainingSoft.scale },
    { hemi: 0.88, ceiling: 1.08, key: 1.05, fill: 1.50, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.controlTechnical.scale },
    { hemi: 0.58, ceiling: 0.22, key: 0.98, fill: 2.00, ledSpill: 1.00 });
  assert.deepEqual({ ...LIGHTING_PRESETS.corporateSoft.scale },
    { hemi: 0.82, ceiling: 0.36, key: 0.88, fill: 1.90, ledSpill: 1.00 });
  assert.equal(ROOM_DESIGNS.trainingRoom.camera, 'trainingProposal');
  assert.equal(ROOM_DESIGNS.controlRoom.camera, 'controlProposal');
});

test('⑳ 강당은 디자인도 조명도 없이 그대로다', () => {
  for (const t of ['hall_s', 'hall_m', 'hall_l']) {
    assert.equal(defaultDesignFor(t), null, t);
    assert.deepEqual(designsFor(t).map(d => d.id), [], t);
    assert.equal(normalizeDesign(undefined, t), null, t);
    assert.equal(roomDesign(normalizeDesign(undefined, t)), NEUTRAL_DESIGN, t);
    assert.equal(moodFor(t), 'office', t);
    assert.equal(floorFinishFor(t), 'carpetTile', t);
  }
  assert.equal(ROOM_TYPES.length, 7, '공간 타입 수가 달라졌다');
});

test('㉑ 결정적 촬영 계약이 그대로다', () => {
  // 치수가 LED 보다 먼저다 — 하단 높이의 상한이 '벽 높이 − LED 높이' 이기 때문이다(DEC-133).
  assert.ok(CAPTURE_STEPS.indexOf('dimensions') < CAPTURE_STEPS.indexOf('ledState'));
  assert.ok(CAPTURE_STEPS.indexOf('settle') < CAPTURE_STEPS.indexOf('assertState'));
  assert.ok(CAPTURE_STEPS.indexOf('assertState') < CAPTURE_STEPS.indexOf('capture'));
  // 아이디에이션 컷이 남아 있고 대표 방(9 × 3.2 × 8m)을 쓴다.
  const c = caseById('ideation-interior');
  assert.ok(c, '아이디에이션 컷이 사라졌다');
  assert.deepEqual([c.widthMm, c.heightMm, c.depthMm], [9000, 3200, 8000]);
  // 천장 낮은 교육장 컷도 남아 있어야 한다 — 하단 높이를 자르는 유일한 칸이다.
  assert.ok(caseById('training-compact-interior'), '낮은 천장 컷이 사라졌다');
  assert.equal(CAPTURE_CASES.length, 19);
});

test('㉒ 조명 프리셋 여섯 벌 — 아이디에이션이 맨 뒤에 붙었다', () => {
  assert.deepEqual(Object.keys(LIGHTING_PRESETS),
    ['corporateSoft', 'executiveSoft', 'conferenceSoft', 'trainingSoft', 'controlTechnical',
      'ideationSoft']);
  // 광원 개수·그림자 광원 구조는 그대로다(세기만 바꿨다).
  assert.match(src('gl-model.js'), /export const LIGHTS = Object\.freeze\(\{/);
  assert.match(src('gl-model.js'), /hemi: 1\.85,/);
  assert.match(src('gl-model.js'), /ceiling: 1\.15,/);
  assert.match(src('gl-model.js'), /key: 1\.15,/);
  assert.match(src('gl-model.js'), /fill: 0\.40,/);
  assert.match(src('gl-model.js'), /ledSpill: 0\.55,/);
});
