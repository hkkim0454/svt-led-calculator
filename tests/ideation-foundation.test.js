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
import { layoutRoom, defaultOptions, roomType, ROOM_TYPES, FURNITURE } from '../src/room-presets.js';
import { MATERIAL_IDS, moodFor, floorFinishFor, MOODS } from '../src/materials.js';
import { LIGHTING_PRESETS, lightingForDesign, shadowSettingsForDesign,
  keyLightPlacementForDesign, fillLightPlacementForDesign, LIGHT_ROLES } from '../src/design-lighting.js';
import { roomFinishForDesign, designPalette, DESIGN_PALETTES } from '../src/design-finish.js';
import { FURNITURE_COLORS, DIMS, FURNITURE_ASSETS, assetParts } from '../src/furniture-assets.js';
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
  assert.equal(normalizeDesign('ideationRoom', 'hall_m'), 'auditoriumMedium');
});

test('④ 릴리스 게이트를 통과해 ready 다 — 화각(8-2b) · 전경 교정(8-2c.1) · 게이트(8-2c RERUN #2)', () => {
  assert.equal(ROOM_DESIGNS.ideationRoom.status, DESIGN_STATUS.READY);
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

// 배치 코드가 쓰는 판정과 **같은 모양**으로 겹침을 본다. 회전한 물건은 축 정렬 상자가
//   겹침을 부풀리므로 **돌아간 사각형**과 **원**을 구분한다.
//   돌리는 방향은 렌더러와 같다 — 물건 기준 (lx, lz) → 세계 (lx·cos − lz·sin, lx·sin + lz·cos).
const 도형 = it => {
  if (it.type === 'highTable') {
    return { x: it.x, z: it.z, hw: it.w / 2 + 8.8, hd: it.d / 2 + 8.8, rot: 0 };
  }
  const S = { stool: { disc: 190 }, collabTable: { disc: 550 }, plant: { disc: 225 },
    lounge: { hw: 415, hd: 395, dz: 54 }, mobileStand: { hw: 575, hd: 280 } }[it.type];
  if (!S) return null;
  if (S.disc) return { x: it.x, z: it.z, disc: S.disc };
  const a = (it.rotY || 0) * Math.PI / 180;
  return { x: it.x - (S.dz || 0) * Math.sin(a), z: it.z + (S.dz || 0) * Math.cos(a),
    hw: S.hw, hd: S.hd, rot: a };
};
const 모서리 = S => {
  const c = Math.cos(S.rot), s = Math.sin(S.rot), out = [];
  for (const sx of [-S.hw, S.hw]) for (const sz of [-S.hd, S.hd]) out.push([S.x + sx * c - sz * s, S.z + sx * s + sz * c]);
  return out;
};
function 겹치나(A, B) {
  if (A.disc && B.disc) return Math.hypot(A.x - B.x, A.z - B.z) < A.disc + B.disc;
  if (A.disc || B.disc) {
    const [box, cir] = A.disc ? [B, A] : [A, B];
    const dx = cir.x - box.x, dz = cir.z - box.z, c = Math.cos(box.rot), s = Math.sin(box.rot);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;   // 세계 → 물건 기준(위 규칙의 역)
    const qx = Math.max(-box.hw, Math.min(box.hw, lx)), qz = Math.max(-box.hd, Math.min(box.hd, lz));
    return Math.hypot(lx - qx, lz - qz) < cir.disc;
  }
  const pa = 모서리(A), pb = 모서리(B);
  for (const S of [A, B]) {
    const c = Math.cos(S.rot), s = Math.sin(S.rot);
    for (const [ux, uz] of [[c, s], [-s, c]]) {
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

// 위의 ⑭ 는 배치 코드가 쓰는 **판정용 도형**과 같은 모양으로 잰다. 그것만으로는
//   판정용 도형 자체가 실제 가구보다 작게 잡혀 있어도 알 수 없다. 그래서 아래 ⑭-2 는
//   **자산 빌더가 돌려주는 실제 부품**을 평면에 눕혀 껍질을 만들고 분리축 정리로 다시 잰다.
//   두 검사는 서로를 대신하지 못하므로 둘 다 둔다.
//
// **둥근 부품을 어떻게 재는가 — PHASE 8-2b.1 HOLD-2 에서 바로잡은 부분.**
//   렌더러가 만드는 것은 `THREE.CylinderGeometry(r, r, h, seg)` 이고 꼭짓점이 반지름 r 인
//   원 **위에** 놓인다. 즉 실제로 그려지는 다각형은 그 원 **안쪽**에 들어간다. 따라서
//   **반지름 r 인 원이 정확한 바깥 경계**다. 예전에는 이 자리에 원보다 8.24% 큰 외접
//   팔각형(r ÷ cos(π/8))을 썼는데, 그러면 스툴(r 190)이 205.7 로, 화분(r 195.5)이 318.2 로
//   부풀어 **있지도 않은 겹침**이 최대 16.9mm 까지 만들어졌다. 여기서는 64각형으로 원을
//   감싼다 — 바깥으로 0.12%(r=190 에서 0.23mm)만 넉넉하다.

/** 원을 감싸는 64각형. 바깥 오차 0.12%. */
function 원점(cx, cz, r, n = 64) {
  const k = r / Math.cos(Math.PI / n), out = [];
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    out.push([cx + Math.sin(a) * k, cz + Math.cos(a) * k]);
  }
  return out;
}

/** 부품 하나가 평면에서 차지하는 점들. */
function 부품점(p) {
  if (p.shape === 'cyl') return 원점(p.dx, p.dz, p.r);
  if (p.shape === 'star') return 원점(p.dx, p.dz, p.w / 2);
  if (p.shape === 'sph') return 원점(p.dx, p.dz, p.r ?? (p.w ?? 0) / 2);
  // 상자·휜 판·테이퍼 — 기울기(tiltX)와 휨(sag)은 깊이를 늘린다.
  const w = p.w ?? 0;
  const d = (p.d ?? 0) + (p.sag ?? 0)
    + (p.tiltX ? Math.abs(Math.sin(p.tiltX * Math.PI / 180)) * (p.h ?? 0) : 0);
  const out = [];
  for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) out.push([p.dx + sx, p.dz + sz]);
  return out;
}

/** 화분은 자산 등록표에 없고 렌더러가 직접 만든다(furniture-gl.js `plantMesh`).
 *  기둥 반지름 `potR` 170 · 잎은 프로필 최대 1.15 배 → 실제 최대 반지름 195.5. */
const 화분반지름 = DIMS.plant.potR * 1.15;

/** 점들의 볼록 껍질(모노톤 체인). */
function 껍질(점들) {
  const p = [...점들].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const 반 = src => {
    const h = [];
    for (const q of src) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...반(p), ...반([...p].reverse())];
}

/** 배치 항목 → 세계 좌표 볼록 껍질. 자산이 없으면 배치가 준 크기로 사각형을 쓴다. */
function 발자국(it) {
  const parts = assetParts(it);
  let pts = parts && parts.length ? parts.flatMap(부품점) : null;
  if ((!pts || !pts.length) && it.type === 'plant') pts = 원점(0, 0, 화분반지름);
  if (!pts || !pts.length) {
    const w = it.w || 450, d = it.d || 450;
    pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  }
  // 렌더러와 같은 방향으로 돌린다(furniture-gl.js 는 `rotation.y = -rotY` 를 쓴다).
  const a = (it.rotY || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  return 껍질(pts.map(([x, z]) => [it.x + x * c - z * sn, it.z + x * sn + z * c]));
}

/** 두 볼록 다각형이 파고든 깊이(mm). 0 이면 떨어져 있다. */
function 파고든깊이(P, Q) {
  let 최소 = Infinity;
  for (const S of [P, Q]) {
    for (let i = 0; i < S.length; i++) {
      const a = S[i], b = S[(i + 1) % S.length];
      const ux = -(b[1] - a[1]), uz = b[0] - a[0];
      const len = Math.hypot(ux, uz);
      if (len < 1e-9) continue;
      const nx = ux / len, nz = uz / len;
      const 폭 = poly => poly.reduce((r, q) => {
        const v = q[0] * nx + q[1] * nz;
        return [Math.min(r[0], v), Math.max(r[1], v)];
      }, [Infinity, -Infinity]);
      const [p0, p1] = 폭(P), [q0, q1] = 폭(Q);
      const 겹 = Math.min(p1, q1) - Math.max(p0, q0);
      if (겹 <= 0) return 0;
      최소 = Math.min(최소, 겹);
    }
  }
  return 최소 === Infinity ? 0 : 최소;
}

/** 같은 구역(테이블 + 그 의자)끼리는 붙어 있는 것이 정상이므로 빼고 센다. */
function 구역표(res) {
  const m = new Map();
  let z = -1;
  for (const it of res.items) {
    if (it.type === 'highTable' || it.type === 'collabTable') z++;
    if (it.type === 'mobileStand' || it.type === 'plant') z = -100 - m.size;
    m.set(it, z);
  }
  return m;
}

/** 실제 자산 껍질로 재서 가장 깊이 파고든 짝. */
function 실제겹침(res) {
  const 구역 = 구역표(res);
  const 물건 = res.items.filter(i => i.type !== 'rug').map(i => [i, 발자국(i)]);
  let 최악 = { 깊이: 0, 이름: '' };
  for (let a = 0; a < 물건.length; a++) {
    for (let b = a + 1; b < 물건.length; b++) {
      if (구역.get(물건[a][0]) === 구역.get(물건[b][0]) && 구역.get(물건[a][0]) >= 0) continue;
      const d = 파고든깊이(물건[a][1], 물건[b][1]);
      if (d > 최악.깊이) 최악 = { 깊이: d, 이름: `${물건[a][0].type}↔${물건[b][0].type}` };
    }
  }
  return 최악;
}

/** 검사 ⑭ 와 같은 방 목록(가로 4~16m, 깊이 = 가로 × 0.95). */
function 방목록() {
  const out = [];
  for (let w = 4; w <= 16; w += 0.5) {
    const W = Math.round(w * 1000);
    out.push([W, Math.max(5000, Math.round(W * 0.95))]);
  }
  return out;
}

/** 깊이 비율까지 넓힌 방 목록 — 앞뒤로 얕거나 깊은 방을 함께 본다. */
function 넓은방목록() {
  const out = [];
  for (let w = 4; w <= 16; w += 0.5) {
    for (const 비 of [0.70, 0.80, 0.90, 0.95, 1.00, 1.15, 1.30]) {
      const W = Math.round(w * 1000);
      out.push([W, Math.max(5000, Math.round(W * 비))]);
    }
  }
  return out;
}

const 최대옵션 = { highTables: 3, stools: 8, collabTables: 4, lounge: true,
  mobileStand: true, rug: true, plant: true };

test('⑭-2 실제 자산 껍질로 다시 재도 파고들지 않는다 — 350개 방 · 기본과 최대 구성', () => {
  // PHASE 8-2b.1 HOLD-2 의 권위 판정이다. 배치 코드가 쓰는 근사 도형이 아니라
  //   **렌더러가 실제로 그리는 부품**을 평면에 눕혀 잰다. 사용자가 고를 수 있는 최대 구성
  //   (하이 테이블 3 · 스툴 8 · 협업 4)까지 포함하고, 깊이 비율도 0.70~1.30 으로 넓힌다.
  for (const [W, D] of 넓은방목록()) {
    for (const [무엇, o] of [['기본', 옵션()], ['최대', 최대옵션]]) {
      const 최악 = 실제겹침(layoutRoom('ideation', o, { W, D }));
      assert.equal(최악.깊이, 0,
        `${무엇} 구성 ${W}×${D} 에서 ${최악.이름} 이 ${최악.깊이.toFixed(1)}mm 파고든다`);
    }
  }
});

test('⑭-4 가구가 LED 를 침범하지 않는다 — 낮은 자리도 캐비닛 깊이를 크게 넘어선다', () => {
  // LED 캐비닛은 앞벽에서 최대 200mm 남짓 튀어나온다(모델 기본값 60mm). 가구는 그보다
  //   훨씬 앞(=LED 에서 먼 쪽)에 있어야 한다. 키 큰 가구는 LED 앞 여유 규칙까지 지킨다.
  const 큰것 = new Set(['highTable', 'stool', 'mobileStand', 'plant']);
  for (const [W, D] of 넓은방목록()) {
    for (const [무엇, o] of [['기본', 옵션()], ['최대', 최대옵션]]) {
      const 앞여유 = Math.max(FURNITURE.frontClear, D * 0.18);
      for (const it of layoutRoom('ideation', o, { W, D }).items) {
        if (it.type === 'rug') continue;
        const z = Math.min(...발자국(it).map(pt => pt[1]));
        assert.ok(z >= 500,
          `${무엇} ${W}×${D}: ${it.type} 앞면이 z ${z.toFixed(1)} 로 LED 에 너무 가깝다`);
        if (큰것.has(it.type)) {
          assert.ok(z >= 앞여유 - 1e-6,
            `${무엇} ${W}×${D}: ${it.type} 이 LED 앞 여유 ${Math.round(앞여유)} 를 침범한다(z ${z.toFixed(1)})`);
        }
      }
    }
  }
});

test('⑭-3 가구가 방 밖으로 나가지 않는다 — 실제 자산 껍질 기준', () => {
  for (const [W, D] of 넓은방목록()) {
    for (const [무엇, o] of [['기본', 옵션()], ['최대', 최대옵션]]) {
      for (const it of layoutRoom('ideation', o, { W, D }).items) {
        if (it.type === 'rug') continue;             // 러그는 바닥에 눕는 것이라 뺀다
        for (const [x, z] of 발자국(it)) {
          assert.ok(x >= -1e-6 && x <= W + 1e-6,
            `${무엇} ${W}×${D}: ${it.type} 이 가로로 방을 벗어난다(x ${x.toFixed(1)})`);
          assert.ok(z >= -1e-6 && z <= D + 1e-6,
            `${무엇} ${W}×${D}: ${it.type} 이 앞뒤로 방을 벗어난다(z ${z.toFixed(1)})`);
        }
      }
    }
  }
});

test('⑮-2 가로 9m 이상 기본 구성에서 협업 구역이 하이 테이블 구역보다 앞(LED 쪽)에 선다', () => {
  // PHASE 8-2b.1 의 핵심 규칙이다. 이 순서가 뒤집히면 제안 카메라가 다시 협업 테이블
  //   2m 앞에 서게 되고, PHASE 8-2c 가 HOLD 로 잡은 '전경 장애물' 문제가 그대로 돌아온다.
  //
  // **범위를 8.5m 이상 기본 구성으로 잡은 까닭.** 그보다 좁은 방과 최대 구성(하이 테이블 3 ·
  //   스툴 8)에서는 하이 테이블 구역이 앞자리를 다 써 버려 협업 구역이 들어갈 자리가 없고,
  //   그때는 기존 안전 규칙대로 뒤로 물러선다(측정: 350개 방 중 기본 구성 24개 · 최대 구성
  //   88개가 그렇게 물러선다. 기본 구성 위반은 전부 가로 8.5m 이하다).
  //   PHASE 8-2b.1 HOLD-2 에서 라운지 판정 도형이 실측대로 커지면서(가로 640 → 830)
  //   8.5m 방에서는 두 덩이가 하이 테이블 앞에 나란히 설 자리가 없어졌다. 그래서 경계가
  //   8.5m 에서 9m 로 한 칸 올라갔다.
  //
  // **PHASE 8-2c.1 에서 이 규칙의 위치가 바뀌었다.** 하이 테이블을 방 한가운데(가로 0.50)로
  //   옮기면서 가운데 앞자리가 막혔고, 그만큼 협업 구역이 뒤로 밀리는 방이 105개 중 6개
  //   생겼다(PHASE 8-2b.1 은 0개였다). 다만 이 순서는 '전경이 막히는가'를 대신 재는
  //   **간접 지표**일 뿐이고, 진짜 계약은 화면 아래 띠 점유를 직접 재는
  //   `tests/ideation-camera.test.js` 의 ㉞ 다. 그 여섯 방을 ㉞ 잣대로 다시 재 보면 최악이
  //   56.0%(10500×7350 기본·실내, 이동식 디스플레이)로 상한 60% 안에 있다. 그래서 여기서는
  //   **위반하는 방의 목록을 통째로 못박는 방식**으로 바꾼다. 목록이 자라면 바로 걸린다.
  const 허용위반 = [
    '9500×9025', '9500×9500', '10000×9000', '10000×9500', '10500×7350', '11500×8050',
  ];
  let 잰방 = 0;
  const 위반 = [];
  for (const [W, D] of 넓은방목록()) {
    if (W < 9000) continue;
    const r = layoutRoom('ideation', 옵션(), { W, D });
    const 뒤끝 = types => {
      const g = r.items.filter(i => types.includes(i.type));
      return g.length ? Math.max(...g.map(i => i.z + (i.d > 0 ? i.d / 2 : 320))) : null;
    };
    const 협업 = 뒤끝(['collabTable', 'lounge']), 하이 = 뒤끝(['highTable', 'stool']);
    if (협업 === null || 하이 === null) continue;     // 한쪽이 안 놓인 방은 견줄 것이 없다
    잰방++;
    if (!(협업 < 하이)) 위반.push(`${W}×${D}`);
  }
  assert.ok(잰방 >= 100, `견준 방이 ${잰방}개뿐이다 — 검사가 헐겁다`);
  assert.deepEqual(위반, 허용위반,
    `협업이 하이 테이블보다 뒤에 서는 방 목록이 바뀌었다: ${위반.join(', ')}`);

  // 좁은 방과 최대 구성까지 포함해 **규칙을 지키는 방의 수**도 함께 고정한다. 위의 엄격한
  //   검사만으로는 8.5m 미만이나 최대 구성에서 협업 구역이 통째로 뒤로 밀려도 알 수 없다.
  //   기준선 비교 — PHASE 8-2b 에서는 275개 방 중 **0개**가 협업을 앞에 세웠고, PHASE 8-2b.1
  //   에서는 **198개**다. 이 수가 줄면 이 단계가 고친 것이 되돌아가고 있다는 뜻이다.
  let 전체 = 0, 앞선방 = 0;
  for (const [W, D] of 넓은방목록()) {
    for (const o of [옵션(), 최대옵션]) {
      const r = layoutRoom('ideation', o, { W, D });
      const 뒤끝 = types => {
        const g = r.items.filter(i => types.includes(i.type));
        return g.length ? Math.max(...g.map(i => i.z + (i.d > 0 ? i.d / 2 : 320))) : null;
      };
      const 협업 = 뒤끝(['collabTable', 'lounge']), 하이 = 뒤끝(['highTable', 'stool']);
      if (협업 === null || 하이 === null) continue;
      전체++;
      if (협업 < 하이) 앞선방++;
    }
  }
  //   PHASE 8-2c.1 에서 두 수가 함께 움직였다. 하이 테이블이 가운데로 가면서 좁은 방에서도
  //   두 구역이 모두 들어가는 경우가 늘어 **견준 방이 265 → 276개**가 되었고, 그 대신 협업이
  //   앞에 서는 방은 **177 → 156개**로 줄었다. 줄어든 몫은 위에서 목록으로 못박은 여섯 방과
  //   같은 까닭이며, 전경 점유는 ㉞ 가 직접 지킨다.
  assert.equal(전체, 276, `견준 방이 ${전체}개다 — 방 목록이 바뀌었다`);
  assert.equal(앞선방, 156,
    `협업이 앞에 선 방이 ${앞선방}개다(기대 156 · PHASE 8-2b 는 0개였다)`);
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

test('⑮-3 놓았다고 센 수와 실제로 놓인 물건 수가 같다 — 숨은 가구가 없다', () => {
  // 화면에 그릴 목록(`items`)과 사용자에게 보고하는 수(`placed`)가 어긋나면, 상태에는
  //   있는데 화면에는 없는 가구가 생긴다. 350개 방 × 두 구성에서 둘이 같은지 본다.
  for (const [W, D] of 넓은방목록()) {
    for (const [무엇, o] of [['기본', 옵션()], ['최대', 최대옵션]]) {
      const r = layoutRoom('ideation', o, { W, D });
      const 센다 = t => r.items.filter(i => i.type === t).length;
      assert.equal(r.placed.highTables, 센다('highTable'), `${무엇} ${W}×${D} 하이 테이블 수`);
      assert.equal(r.placed.stools, 센다('stool'), `${무엇} ${W}×${D} 스툴 수`);
      assert.equal(r.placed.collabTables, 센다('collabTable'), `${무엇} ${W}×${D} 협업 테이블 수`);
      assert.equal(r.placed.lounge, 센다('lounge'), `${무엇} ${W}×${D} 라운지 수`);
      assert.equal(r.placed.chairs, 센다('stool') + 센다('lounge'), `${무엇} ${W}×${D} 의자 합계`);
      assert.equal(r.capacity, r.placed.stools + r.placed.lounge, `${무엇} ${W}×${D} 정원`);
    }
  }
});

test('⑮-4 최대 구성을 넣을 수 없는 방은 수량을 줄이고 그 사실을 안내한다', () => {
  // 사용자가 최대 구성을 골라도, 물리적으로 안 들어가면 **겹쳐 놓지 않고 줄인다.**
  //   줄인 사실은 반드시 안내로 남아야 한다(조용히 숨기지 않는다).
  for (const [W, D] of 넓은방목록()) {
    const r = layoutRoom('ideation', 최대옵션, { W, D });
    const 줄었나 = r.placed.highTables < 최대옵션.highTables
      || r.placed.collabTables < 최대옵션.collabTables;
    if (줄었나) {
      assert.ok(r.notes.some(n => n.includes('놓지 못했습니다')),
        `${W}×${D}: 수량이 줄었는데 안내가 없다 — ${JSON.stringify(r.placed)}`);
    }
  }
  // 작은 방에서는 실제로 줄어든다(검사가 헛돌지 않는다는 확인).
  const 작은 = layoutRoom('ideation', 최대옵션, { W: 5000, D: 5000 });
  assert.ok(작은.placed.collabTables < 4 && 작은.placed.highTables < 3, '작은 방인데 다 들어갔다');
  assert.ok(작은.notes.some(n => n.includes('놓지 못했습니다')), '줄었다는 안내가 없다');
  // 아주 넓은 방에서는 요청대로 다 들어간다.
  const 넓은 = layoutRoom('ideation', 최대옵션, { W: 16000, D: 15200 });
  assert.deepEqual(넓은.placed,
    { highTables: 3, stools: 24, collabTables: 4, lounge: 12, chairs: 36 });
  assert.equal(넓은.notes.some(n => n.includes('놓지 못했습니다')), false);
});

test('⑯ 기본 9m 배치 — 전경 가림 교정까지 함께 고정한다', () => {
  // 하이 테이블·스툴·화분은 8-2a 그대로다. 협업 두 덩이가 LED 쪽으로 내려왔고, 이동식
  //   디스플레이는 기존 안전 규칙대로 뒤로 비켜섰다(같은 모서리에 그대로 있다).
  // PHASE 8-2b.1 HOLD-2 에서 판정 도형을 화면 실측으로 키우고 회전 방향을 렌더러와 맞췄고,
  //   PHASE 8-2c.1 에서 **하이 테이블이 방 가운데(x 4500)로** 옮겨 갔다. 제안 카메라가 서는
  //   가로 비율 0.30 을 비우기 위해서다. 협업 두 덩이는 그 좌우로 갈라섰다.
  //   개수·정원·안내는 그대로다.
  const r = layoutRoom('ideation', 옵션(), { W: 9000, D: 8000 });
  assert.deepEqual(r.items.map(i => [i.type, Math.round(i.x), Math.round(i.z), Math.round(i.rotY || 0)]), [
    ['highTable', 4500, 3360, 0],
    ['stool', 4190, 2480, 161],
    ['stool', 4190, 4240, 19],
    ['stool', 4810, 2480, 199],
    ['stool', 4810, 4240, 341],
    ['collabTable', 2190, 2087, 0],
    ['lounge', 2725, 3013, 330],
    ['lounge', 2725, 1160, 210],
    ['lounge', 1120, 2087, 90],
    ['rug', 2190, 2087, 0],
    ['collabTable', 6250, 3350, 0],
    ['lounge', 5715, 4277, 30],
    ['lounge', 5715, 2423, 150],
    ['lounge', 7320, 3350, 270],
    ['mobileStand', 7100, 2500, -35],
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

test('⑳ 강당 디자인이 화면에 보내는 것은 조명뿐이다 (PHASE 9-d.1 에서 갱신)', () => {
  // PHASE 9-a 는 자리만 만들었고(전부 INHERIT/planned), PHASE 9-d.1 이 **조명 한 항목**을
  //   실제로 채웠다. 나머지 여섯 항목은 여전히 '디자인 없음'과 한 값도 다르지 않다 —
  //   가구·팔레트·재질·벽 마감·화각·소품은 뒤 단계의 몫이다.
  const 중립 = resolveDesign(null);
  for (const [t, id] of [['hall_s', 'auditoriumSmall'], ['hall_m', 'auditoriumMedium'],
    ['hall_l', 'auditoriumLarge']]) {
    assert.equal(defaultDesignFor(t), id, t);
    assert.deepEqual(designsFor(t).map(d => d.id), [id], t);
    assert.equal(normalizeDesign(undefined, t), id, t);
    // **핵심** — 해석 결과의 일곱 가지 표현 항목이 '디자인 없음'과 한 값도 다르지 않다.
    const 해석 = resolveDesign(id);
    for (const k of ['furniture', 'palette', 'materials', 'wallTreatment',
      'camera', 'accessories']) {
      assert.equal(해석[k], 중립[k], `${id}.${k} 가 화면에 값을 보낸다`);
    }
    // 조명만 값이 있다 — 그리고 그 값은 강당 전용 프리셋 이름이다(다른 공간 것이 아니다).
    assert.equal(해석.lighting, 'auditoriumStage', `${id}: 조명이 강당 전용이 아니다`);
    assert.equal(roomDesign(id).status, DESIGN_STATUS.PLANNED, `${id}: ready 로 올라갔다`);
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
      'ideationSoft', 'auditoriumStage']);
  // 광원 개수·그림자 광원 구조는 그대로다(세기만 바꿨다).
  assert.match(src('gl-model.js'), /export const LIGHTS = Object\.freeze\(\{/);
  assert.match(src('gl-model.js'), /hemi: 1\.85,/);
  assert.match(src('gl-model.js'), /ceiling: 1\.15,/);
  assert.match(src('gl-model.js'), /key: 1\.15,/);
  assert.match(src('gl-model.js'), /fill: 0\.40,/);
  assert.match(src('gl-model.js'), /ledSpill: 0\.55,/);
});
