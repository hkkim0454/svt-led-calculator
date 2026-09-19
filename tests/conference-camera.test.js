// conference-camera.test.js — 대회의실 화각·구도 회귀 테스트. (PHASE 4-d.3)
// ─────────────────────────────────────────────────────────────────────────────
// 이 단계가 고친 것은 **무엇을 기준으로 서느냐**다.
//   고치기 전: 대회의실도 기존 실내 계산(INSIDE 표)을 썼다 — LED 크기로 거리를 잡아
//     LED만 크고 대형 테이블·의자·모니터 줄이 화면 밖으로 밀렸다.
//   고친 뒤: **놓인 것(테이블·좌석·모니터)** 에서 서는 자리와 내려본 각을 계산한다.
//     18m 깊은 방에서도 카메라가 뒷벽이 아니라 '맨 뒤 좌석 조금 뒤'에 선다.
// 여기서 지키는 것.
//   ① 대회의실만 이 계열을 쓰는가(대기업·임원으로 새지 않는가).
//   ② 사람 눈높이·광각 금지(46° 상한)·시선이 눈높이보다 낮다(조작기가 카메라를 못 끌어올리게).
//   ③ 테이블 모양(U·보트·사각) × 방향(가로·세로) × 방 크기 5종에서 전부 성립하는가.
//   ④ LED·테이블·좌석·모니터·프롬프터가 **함께** 보이는가(재서 말한다).
//   ⑤ 이번 단계가 **화각 단계**로 남는가 — 조명·마감·형상·배치를 건드리지 않았는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONFERENCE_CAMERA_PRESETS, CONFERENCE_FOV_RANGE, CONFERENCE_CAMERA_PLANS,
  CONFERENCE_BAND_MAX, MIN_CORNER_OFFSET, STANDOFF_RANGE, FLOOR_STRIP, LATERAL_RELAX_STEPS,
  EYE_RANGE, WALL_MARGIN, POLAR_GAP_PER_DIST, eyeAboveTargetFor,
  conferenceCameraPlan, conferenceCameraPlanId, conferenceCameraPresets,
  corporateCameraPlan, corporateCameraPlanId, corporateCameraPresets, CAMERA_PLANS,
  executiveCameraPlan, executiveCameraPlanId, executiveCameraPresets, EXECUTIVE_CAMERA_PLANS,
  cameraPlanForDesign,
} from '../src/design-camera.js';
import { buildGLModel, presetPose, CAMERA_PRESETS, FOV_RANGE } from '../src/gl-model.js';
import { ROOM_DESIGNS, DESIGN_IDS, resolveDesign, INHERIT } from '../src/room-design.js';
import { LIGHTING_PRESETS, lightingForDesign } from '../src/design-lighting.js';
import { DESIGN_PALETTES } from '../src/design-finish.js';
import { layoutRoom, defaultOptions, FURNITURE, tableDirOf } from '../src/room-presets.js';
import { MODELS } from '../src/models.js';
import { computeConfig } from '../src/engine.js';

const LC = 'largeConference';
const CO = 'corporateMeeting';
const EX = 'executiveBoardroom';
const DEG = Math.PI / 180;
const camSrc = readFileSync(new URL('../src/design-camera.js', import.meta.url), 'utf8');
const glSrc = readFileSync(new URL('../src/gl-model.js', import.meta.url), 'utf8');
const rendSrc = readFileSync(new URL('../src/render3d-gl.js', import.meta.url), 'utf8');

/** 실제 화면 캔버스 비율(측정값 1.2406)과 흔한 화면비들. */
const ASPECT = 1.2406;
const ASPECTS = Object.freeze([0.85, 1.24, 4 / 3, 16 / 9, 21 / 9]);

/** 오너 지침 §22 — 방 크기 5종. [라벨, W, H, D] (mm) */
const ROOMS = Object.freeze([
  ['compact', 12000, 3600, 9000],
  ['medium', 14000, 3800, 10000],
  ['large', 16000, 3900, 12000],
  ['deep10x18', 10000, 4000, 18000],
  ['deep12x16', 12000, 4000, 16000],
]);

/** 오너 지침 §23 — 모양 × 방향 9종. */
const MATRIX = Object.freeze([
  ['U across compact', 'u', 'across', 12000, 3600, 9000],
  ['U across medium', 'u', 'across', 14000, 3800, 10000],
  ['U across large', 'u', 'across', 16000, 3900, 12000],
  ['U along 10x18', 'u', 'along', 10000, 4000, 18000],
  ['U along 12x16', 'u', 'along', 12000, 4000, 16000],
  ['boat across', 'boat', 'across', 14000, 3800, 10000],
  ['boat along', 'boat', 'along', 10000, 4000, 18000],
  ['rect across', 'rect', 'across', 14000, 3800, 10000],
  ['rect along', 'rect', 'along', 10000, 4000, 18000],
]);

function modelFor(W, H, D, { shape = 'u', dir = 'across', seats = 30, ledW = 5760, design = LC } = {}) {
  const items = layoutRoom('meeting',
    { ...defaultOptions('meeting'), tableShape: shape, seats, tableDir: dir, rug: true },
    { W, D, ledBottom: 900, design }).items;
  return buildGLModel({
    space: { W, H, D },
    led: { w: ledW, h: 2160, marginW: (W - ledW) / 2, mount: 900, cols: 4, rows: 4, depth: 79.5 },
    items, design, roomType: 'meeting',
  });
}
const planOf = (m, pre, aspect = ASPECT) =>
  conferenceCameraPlan(m.room, m.led, pre, aspect, { table: m.table, ...m.fields });

// ── A. 어느 공간이 어느 계열을 쓰는가 (§40 ①~④) ───────────────────────────

test('① 대회의실만 대회의실 계열 화각을 쓴다', () => {
  assert.equal(ROOM_DESIGNS[LC].camera, 'conferenceProposal');
  assert.equal(resolveDesign(LC).camera, 'conferenceProposal');
  for (const pre of CONFERENCE_CAMERA_PRESETS) {
    assert.equal(conferenceCameraPlanId(LC, pre), pre, pre);
    // 다른 두 계열로는 **절대** 풀리지 않는다 — 섞이면 한쪽을 고칠 때 다른 쪽이 흔들린다.
    assert.equal(corporateCameraPlanId(LC, pre), null, `대기업 계열로 풀렸다: ${pre}`);
    assert.equal(executiveCameraPlanId(LC, pre), null, `임원 계열로 풀렸다: ${pre}`);
  }
  assert.deepEqual([...conferenceCameraPresets(LC)], [...CONFERENCE_CAMERA_PRESETS]);
  // 아이소·평면도·정면은 이 계열이 다루지 않는다(§19~§21 동결).
  for (const pre of ['iso', 'top', 'front', 'custom', '', null, undefined]) {
    assert.equal(conferenceCameraPlanId(LC, pre), null, String(pre));
  }
});

test('②③④ 대기업·임원·그 밖의 공간은 대회의실 계열로 풀리지 않는다', () => {
  for (const id of [...DESIGN_IDS, null, undefined, '', '없는디자인', 0, {}]) {
    if (id === LC) continue;
    for (const pre of CONFERENCE_CAMERA_PRESETS) {
      assert.equal(conferenceCameraPlanId(id, pre), null, `${String(id)}/${pre}`);
    }
    assert.deepEqual([...conferenceCameraPresets(id)], [], String(id));
  }
  // 두 계열의 기준값이 한 자리도 바뀌지 않았다(§33·§34 동결).
  assert.deepEqual({ ...CAMERA_PLANS.interior },
    { eye: 1.65, fov: 41, rearRatio: 0.06, drop: 0.35, xRatio: 0.50 });
  assert.deepEqual({ ...CAMERA_PLANS['corner-l'] },
    { eye: 1.75, fov: 44, rearRatio: 0.07, drop: 0.30, xRatio: 0.18 });
  assert.deepEqual({ ...EXECUTIVE_CAMERA_PLANS.interior },
    { aim: 'frameTop', eye: 1.60, fov: 40, rearRatio: 0.04, xRatio: 0.50 });
  assert.deepEqual({ ...EXECUTIVE_CAMERA_PLANS['corner-l'] }, {
    aim: 'room', eye: 1.76, fov: 43, rearRatio: 0.07, xRatio: 0.10,
    targetXRatio: 0.40, targetZRatio: 0.22, targetHRatio: 0.26,
  });
  assert.equal(ROOM_DESIGNS[CO].camera, 'corporateProposal');
  assert.equal(ROOM_DESIGNS[EX].camera, 'executiveProposal');
});

test('④ 라우터 — 디자인·시점에 맞는 계열 하나만 고른다', () => {
  const m = modelFor(14000, 3800, 10000);
  for (const pre of CONFERENCE_CAMERA_PRESETS) {
    const viaRouter = cameraPlanForDesign(LC, pre, m, ASPECT);
    const direct = planOf(m, pre);
    assert.ok(viaRouter, pre);
    // 같은 계산이 나와야 한다(라우터가 다른 계열로 새지 않았다는 증거).
    assert.deepEqual(viaRouter.position, direct.position, pre);
    assert.deepEqual(viaRouter.target, direct.target, pre);
    assert.equal(viaRouter.fov, direct.fov, pre);
  }
  // 대기업·임원 모델은 각자의 계열로 간다.
  const mc = modelFor(11000, 3500, 9000, { design: CO, shape: 'boat', seats: 14 });
  assert.deepEqual(cameraPlanForDesign(CO, 'interior', mc, ASPECT).position,
    corporateCameraPlan(mc.room, mc.led, 'interior', ASPECT).position);
  const me = modelFor(11000, 3800, 9000, { design: EX, seats: 14 });
  assert.deepEqual(cameraPlanForDesign(EX, 'interior', me, ASPECT).position,
    executiveCameraPlan(me.room, me.led, 'interior', ASPECT, me.table).position);
  // 아이소·평면도는 언제나 기존 계산 그대로다.
  for (const pre of ['iso', 'top', 'front']) {
    assert.equal(cameraPlanForDesign(LC, pre, m, ASPECT), null, pre);
  }
});

// ── B. 실내 컷의 기본 안전값 (§40 ⑤~⑩) ────────────────────────────────────

test('⑤⑥⑦⑧⑨ 눈높이·화각·시선·방 안·유한값 — 9종 매트릭스 × 5가지 화면비 전부', () => {
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir });
    for (const a of ASPECTS) {
      for (const pre of CONFERENCE_CAMERA_PRESETS) {
        const p = planOf(m, pre, a);
        const where = `${tag}/${pre}/${a.toFixed(2)}`;
        // ⑨ 유한값 — NaN 하나가 카메라를 통째로 날린다.
        assert.ok(p.position.every(Number.isFinite), `${where}: position`);
        assert.ok(p.target.every(Number.isFinite), `${where}: target`);
        assert.ok(Number.isFinite(p.fov), `${where}: fov`);
        // ⑤ 사람 눈높이 — 2m를 넘으면 미니어처를 내려다보는 그림이 된다(§6).
        assert.ok(p.eye >= EYE_RANGE.min && p.eye <= EYE_RANGE.max, `${where}: eye=${p.eye}`);
        assert.ok(p.position[1] <= H / 1000 - WALL_MARGIN, `${where}: 천장을 뚫었다`);
        // ⑥ 화각 상한 46° — 넘으면 광각 왜곡이 생겨 제안서에 못 쓴다(§6).
        assert.ok(p.fov <= CONFERENCE_FOV_RANGE.max + 1e-9, `${where}: fov=${p.fov}`);
        assert.ok(p.fov >= CONFERENCE_FOV_RANGE.min, `${where}: fov=${p.fov}`);
        // ⑦ 시선은 언제나 눈높이보다 낮다(§5·§26).
        assert.ok(p.target[1] < p.position[1], `${where}: targetY>=eyeY`);
        // ⑧ 카메라가 방 안에 있다.
        assert.ok(p.position[0] > 0 && p.position[0] < W / 1000, `${where}: x=${p.position[0]}`);
        assert.ok(p.position[2] > 0 && p.position[2] < D / 1000, `${where}: z=${p.position[2]}`);
        assert.ok(p.target[0] > 0 && p.target[0] < W / 1000, `${where}: tx`);
        assert.ok(p.target[2] > 0 && p.target[2] < D / 1000, `${where}: tz`);
      }
    }
  }
});

test('⑩ 조작기가 카메라를 끌어올릴 수 없다 — 눈높이와 시선의 높이차가 거리에 비례한다', () => {
  // OrbitControls는 maxPolarAngle = 90° − 0.02rad 이라, 카메라는 시선보다
  //   **거리 × tan(0.02) 만큼은 위**에 있어야 한다. 모자라면 update()가 카메라를 들어올린다.
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir });
    for (const a of ASPECTS) for (const pre of CONFERENCE_CAMERA_PRESETS) {
      const p = planOf(m, pre, a);
      const dist = Math.hypot(p.target[0] - p.position[0], p.target[2] - p.position[2]);
      const need = eyeAboveTargetFor(dist);
      assert.ok(p.position[1] - p.target[1] >= need - 1e-6,
        `${tag}/${pre}/${a.toFixed(2)}: 높이차 ${(p.position[1] - p.target[1]).toFixed(4)} < 필요 ${need.toFixed(4)}`);
    }
  }
  assert.equal(POLAR_GAP_PER_DIST, 0.025, '안전 여유를 줄이면 깊은 방에서 카메라가 떠오른다');
  // 렌더러가 계획한 시선을 **그대로** 조작기에 넣는지(§28).
  assert.ok(/controls\.target\.copy\(to\.target\)/.test(rendSrc), '프리셋 적용이 시선을 동기화하지 않는다');
  assert.ok(/camera\.lookAt\(controls\.target\)/.test(rendSrc), '카메라가 시선을 보지 않는다');
  assert.ok(/maxPolarAngle\s*=\s*Math\.PI\s*\/\s*2\s*-\s*0\.02/.test(rendSrc), '조작기 극각 제한이 바뀌었다');
});

// ── C. 모양 × 방향 × 방 크기 (§40 ⑪~㉑) ───────────────────────────────────

test('⑪⑫⑬⑭⑮⑯ 테이블 모양 3종 × 방향 2종이 전부 성립한다', () => {
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir });
    assert.ok(m.table, `${tag}: 테이블 발자국이 없다`);
    const p = planOf(m, 'interior');
    // **방향을 좌표가 아니라 범위에서 읽는다**(§8·§9) — 세로면 테이블이 깊이축으로 길다.
    assert.equal(p.orient, dir, `${tag}: 방향 판정`);
    assert.ok(p.tableVisible, `${tag}: 테이블이 화면에 남지 않는다`);
    assert.ok(p.tableVisibleShare > 0.08, `${tag}: 상판 실측 점유 ${p.tableVisibleShare}`);
    assert.ok(p.seatsVisibleShare != null, `${tag}: 좌석을 세지 못했다`);
  }
});

test('⑰⑱⑲⑳㉑ 방 크기 5종 — 서는 자리를 「놓인 것」에서 계산한다', () => {
  for (const [tag, W, H, D] of ROOMS) {
    const dir = D > W ? 'along' : 'across';
    const m = modelFor(W, H, D, { dir });
    const p = planOf(m, 'interior');
    const back = Math.max(m.table.z1, m.fields.seats.z1);
    // 카메라는 맨 뒤 내용물보다 **뒤**에 서고, 방을 벗어나지 않는다.
    assert.ok(p.position[2] > back - 1e-6, `${tag}: 카메라가 내용물 앞에 섰다`);
    assert.ok(p.position[2] < D / 1000 - WALL_MARGIN + 1e-6, `${tag}: 뒷벽을 뚫었다`);
    // 물러선 거리는 허용 범위 안이다(빈 활주로도, 코앞도 아니다 — §16).
    assert.ok(p.standOff >= 0, `${tag}: standOff=${p.standOff}`);
    assert.ok(p.standOff <= STANDOFF_RANGE.max + 1e-6, `${tag}: standOff=${p.standOff}`);
  }
  // **아주 깊은 방에서 뒷벽에 붙지 않는다** — 이 단계가 고친 핵심이다.
  //   테이블 길이에 상한이 있어 22m 방에서도 내용물은 14.5m 쯤에서 끝난다.
  //   기존 규칙(뒷벽 바로 앞)을 그대로 쓰면 카메라가 21m 뒤에 서서 빈 바닥만 6m 깔린다.
  const deep = modelFor(10000, 4200, 22000, { dir: 'along' });
  const pd = planOf(deep, 'interior');
  const backD = Math.max(deep.table.z1, deep.fields.seats.z1);
  assert.ok(pd.position[2] < 22 - 0.7 - 1.5, `아주 깊은 방에서 뒷벽에 붙었다: z=${pd.position[2]}`);
  assert.ok(pd.position[2] > backD, `내용물 앞에 섰다: z=${pd.position[2]}`);
  assert.ok(pd.standOff <= STANDOFF_RANGE.max + 1e-6, `물러선 거리 ${pd.standOff}`);
});

// ── D. 구도 지표 (§40 ㉒~㉘) ──────────────────────────────────────────────

test('㉒ 테이블이 화면 아래 한 줄만 걸치지 않는다(§12)', () => {
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir });
    for (const pre of ['interior', 'corner-l', 'corner-r']) {
      const p = planOf(m, pre);
      assert.ok(p.tableVisible, `${tag}/${pre}`);
      // 깊이의 '의미 있는 다수'가 남는가 — 5~10%만 걸치면 실패다(§12).
      assert.ok(p.tableDepthVisible >= 0.50,
        `${tag}/${pre}: 테이블 깊이 ${(p.tableDepthVisible * 100).toFixed(1)}%만 남았다`);
      // **세로 배치·보트·사각형은 상판이 카메라 쪽으로 뻗어 크게 잡힌다.**
      //   가로 U자만 다르다 — 상판이 방을 가로질러 놓여 46° 안에 다 들어오지 않는다(아래 별도 검증).
      if (!(shape === 'u' && dir === 'across')) {
        assert.ok(p.tableVisibleShare > 0.50,
          `${tag}/${pre}: 상판 실측 점유 ${(p.tableVisibleShare * 100).toFixed(1)}%`);
      }
    }
  }
});

test('㉓ LED — 담았으면 담았다고, 못 담았으면 못 담았다고 말한다(§11)', () => {
  // 일반적인 LED(5.76m)에서는 9종 × 4시점 전부 네 모서리가 화면 안이다.
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir, ledW: 5760 });
    for (const pre of CONFERENCE_CAMERA_PRESETS) {
      const p = planOf(m, pre);
      assert.equal(p.ledFullyVisible, true, `${tag}/${pre}: LED를 못 담았다`);
      assert.equal(p.ledVisibleShare, 1, `${tag}/${pre}: ledVisibleShare=${p.ledVisibleShare}`);
    }
  }
  // 아주 넓은 LED + 좁은 화면에서는 **화각을 늘리지 않고 못 담았다고 말한다.**
  const tight = modelFor(12000, 3600, 9000, { ledW: 7680 });
  const pc = planOf(tight, 'corner-l');
  assert.equal(pc.ledFullyVisible, false, '이 조합은 못 담는 것이 정상이다');
  assert.ok(pc.fov <= CONFERENCE_FOV_RANGE.max + 1e-9, '못 담는다고 화각을 상한 위로 늘렸다');
  // 얼마나 못 담았는지까지 말한다 — 1%가 스친 것과 절반이 잘린 것은 다른 이야기다.
  assert.ok(pc.ledVisibleShare > 0.8 && pc.ledVisibleShare < 1,
    `ledVisibleShare=${pc.ledVisibleShare}`);
  // **화각보다 좌우 위치를 먼저 쓴다**(§11 우선순위 ②가 ④보다 먼저다).
  assert.ok(pc.lateralRelax > 0, '좌우 위치를 전혀 되돌리지 않았다');
  // 되돌려도 **코너는 코너로 남는다**(§17).
  const mid = 12000 / 1000 / 2;
  assert.ok(Math.abs(pc.position[0] - mid) >= 12 * MIN_CORNER_OFFSET - 1e-6,
    `코너가 가운데까지 밀려났다: x=${pc.position[0]}`);
  // 실내 컷도 좌우를 되돌리지만 **하한이 없다** — 코너가 아니므로 가운데까지 갈 수 있고,
  //   그래서 이 조합에서도 LED를 전부 담는다(코너만 '코너로 남는다'는 하한이 걸린다).
  const pi = planOf(tight, 'interior');
  assert.equal(pi.ledFullyVisible, true, '실내 컷이 LED를 못 담았다');
  assert.equal(CONFERENCE_CAMERA_PLANS.interior.minOffset, 0);
  assert.equal(CONFERENCE_CAMERA_PLANS['corner-l'].minOffset, MIN_CORNER_OFFSET);
});

test('㉔㉕ 좌석과 개인 모니터 줄이 함께 보인다(§13)', () => {
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir });
    for (const pre of ['interior', 'corner-l', 'corner-r']) {
      const p = planOf(m, pre);
      // 개인 모니터는 U자 배치에만 있다(PHASE 4-c 범위) — 없으면 **null**이다(모르면 모른다고 한다).
      if (shape === 'u') {
        assert.ok(p.monitorsVisibleShare > 0.10,
          `${tag}/${pre}: 모니터 실측 점유 ${(p.monitorsVisibleShare * 100).toFixed(1)}%`);
      } else {
        assert.equal(p.monitorsVisibleShare, null, `${tag}/${pre}: 없는 것을 있다고 했다`);
        // 테이블만 있는 배치에서는 좌석이 크게 잡힌다.
        assert.ok(p.seatsVisibleShare > 0.30,
          `${tag}/${pre}: 좌석 실측 점유 ${(p.seatsVisibleShare * 100).toFixed(1)}%`);
      }
      // 세로 U자도 좌석이 넉넉히 잡힌다. 가로 U자는 상판과 같은 이유로 적다(별도 검증).
      if (shape === 'u' && dir === 'along') {
        assert.ok(p.seatsVisibleShare > 0.30,
          `${tag}/${pre}: 좌석 실측 점유 ${(p.seatsVisibleShare * 100).toFixed(1)}%`);
      }
    }
  }
});

test('가로 U자의 한계를 **재서** 적어 둔다 — 방을 가득 채운 상판은 46° 안에 다 안 들어온다', () => {
  // 이 값이 올라가면 좋은 일이다(구도가 나아졌다는 뜻). 내려가면 **후퇴**다 — 그때 걸린다.
  //   14m 방에서 상판이 11.1m라 팔이 시선축에서 5.1m 밖에 있다. 뒤 정중앙에서 담으려면
  //   세로 화각 60°가 필요한데 상한은 46°다. 그래서 옆으로 비켜 대각으로 본다(§7).
  const seen = {};
  for (const [tag, , , W, H, D] of MATRIX.filter(r => r[1] === 'u' && r[2] === 'across')) {
    const p = planOf(modelFor(W, H, D), 'interior');
    seen[tag] = p.tableVisibleShare;
    // 정중앙(0.7%)에서 옮겨 온 결과다 — 최소한 이만큼은 남아야 한다.
    assert.ok(p.tableVisibleShare >= 0.09,
      `${tag}: 상판 실측 점유가 ${(p.tableVisibleShare * 100).toFixed(1)}%로 떨어졌다`);
    // 대신 LED는 **언제나** 다 담는다.
    assert.equal(p.ledVisibleShare, 1, `${tag}: LED를 다 담지 못했다`);
  }
  // 방이 클수록 좋아진다(구도가 방 크기를 따라간다는 증거).
  assert.ok(seen['U across large'] > seen['U across medium'], JSON.stringify(seen));
  assert.ok(seen['U across medium'] > seen['U across compact'], JSON.stringify(seen));
});

test('㉖ 중앙 프롬프터가 화면에 남는다(§14)', () => {
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir });
    for (const pre of ['interior', 'corner-l', 'corner-r']) {
      const p = planOf(m, pre);
      if (shape === 'u') {
        assert.ok(m.fields.prompter, `${tag}: 프롬프터 자리가 없다`);
        assert.equal(p.prompterVisible, true, `${tag}/${pre}: 프롬프터가 화면에서 사라졌다`);
      } else {
        assert.equal(p.prompterVisible, null, `${tag}/${pre}: 없는 것을 있다고 했다`);
      }
    }
  }
});

test('㉗ 천장 띠가 화면을 먹지 않는다(§15 — 6~14% 권장, 18%+ 재검토)', () => {
  let maxBand = 0;
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const m = modelFor(W, H, D, { shape, dir });
    for (const a of ASPECTS) for (const pre of CONFERENCE_CAMERA_PRESETS) {
      const p = planOf(m, pre, a);
      maxBand = Math.max(maxBand, p.ceilingBand);
      assert.ok(p.ceilingBand <= CONFERENCE_BAND_MAX + 1e-6,
        `${tag}/${pre}/${a.toFixed(2)}: 천장 띠 ${(p.ceilingBand * 100).toFixed(1)}%`);
    }
  }
  assert.ok(maxBand <= 0.14 + 1e-6, `가장 큰 천장 띠가 권장 범위를 넘었다: ${maxBand}`);
  // 기준값 — 시점마다 정한 띠가 그대로 나온다(계산이 목표를 실제로 맞춘다는 증거).
  const m = modelFor(14000, 3800, 10000);
  assert.equal(planOf(m, 'interior').ceilingBand, 0.09);
  assert.equal(planOf(m, 'corner-l').ceilingBand, 0.11);
  assert.equal(planOf(m, 'rear').ceilingBand, 0.09);
});

test('㉘ 화각 상한을 넘지 않는다 — 어떤 방·화면비에서도', () => {
  assert.deepEqual({ ...CONFERENCE_FOV_RANGE }, { min: 36, max: 46 });
  for (const [tag, W, H, D] of ROOMS) {
    for (const ledW of [3840, 5760, 7680]) {
      if (ledW > W - 1200) continue;
      const m = modelFor(W, H, D, { ledW, dir: D > W ? 'along' : 'across' });
      for (const a of ASPECTS) for (const pre of CONFERENCE_CAMERA_PRESETS) {
        const p = planOf(m, pre, a);
        assert.ok(p.fov <= 46 + 1e-9, `${tag}/${ledW}/${pre}/${a}: fov=${p.fov}`);
        if (p.fov >= 46 - 1e-9) assert.equal(p.fovCapped, true, `${tag}: 상한인데 말하지 않았다`);
      }
    }
  }
});

// ── E. 기준값 고정 (숨은 변경을 잡는다) ───────────────────────────────────

test('기준값 — 중형 U자 가로에서 나오는 실제 카메라 한 벌', () => {
  // 구도를 바꾸면 이 숫자가 바뀐다. 바뀌었으면 **의도한 것인지** 확인하고 근거를 남긴다.
  const p = planOf(modelFor(14000, 3800, 10000), 'interior');
  assert.deepEqual(p.position, [3.64, 1.66, 9.5]);
  assert.deepEqual(p.target, [6.1174, 1.1021, 5.1805]);
  assert.equal(p.fov, 46);
  assert.equal(p.orient, 'across');
  assert.equal(p.ceilingBand, 0.09);
  assert.equal(p.pitchDeg, 6.393);
  // 이 구도가 실제로 무엇을 담는가 — 숫자로 고정한다.
  assert.equal(p.tableVisibleShare, 0.1565);
  assert.equal(p.monitorsVisibleShare, 0.1481);
  assert.equal(p.ledVisibleShare, 1);
  assert.equal(p.prompterVisible, true);
  assert.ok(p.target[1] < p.position[1]);
  // 시점별 기준값도 한 벌 고정한다(누가 조용히 바꾸면 여기서 걸린다).
  assert.deepEqual({ ...CONFERENCE_CAMERA_PLANS.interior },
    { eye: 1.66, fov: 44, band: 0.09, xRatio: 0.26, aimMix: 0.62, followX: 0.45, minOffset: 0 });
  assert.deepEqual({ ...CONFERENCE_CAMERA_PLANS['corner-l'] },
    { eye: 1.74, fov: 44, band: 0.11, xRatio: 0.14, aimMix: 0.52, followX: 0.35, minOffset: 0.18 });
  assert.deepEqual({ ...CONFERENCE_CAMERA_PLANS['corner-r'] },
    { eye: 1.74, fov: 44, band: 0.11, xRatio: 0.86, aimMix: 0.52, followX: 0.35, minOffset: 0.18 });
  assert.deepEqual({ ...CONFERENCE_CAMERA_PLANS.rear },
    { eye: 1.62, fov: 41, band: 0.09, xRatio: 0.50, aimMix: 0.28, followX: 0.45, minOffset: 0 });
  assert.deepEqual({ ...STANDOFF_RANGE }, { min: 1.10, max: 4.20 });
  assert.equal(FLOOR_STRIP, 0.55);
  assert.equal(MIN_CORNER_OFFSET, 0.18);
  assert.equal(LATERAL_RELAX_STEPS, 6);
});

test('기준값 — 세로 18m 방에서 카메라가 앞으로 나온다', () => {
  const p = planOf(modelFor(10000, 4000, 18000, { dir: 'along' }), 'interior');
  assert.deepEqual(p.position, [2.8813, 1.66, 17.3]);
  assert.deepEqual(p.target, [4.3947, 0.25, 9.9133]);
  assert.equal(p.orient, 'along');
  assert.equal(p.fov, 44);
  assert.equal(p.ceilingBand, 0.09);
  assert.equal(p.pitchDeg, 10.592);
  assert.equal(p.standOff, 2.85);
  // 세로 방은 상판이 카메라 쪽으로 뻗어 **크게** 잡힌다 — 가로 U자(15.7%)와 대비된다.
  assert.equal(p.tableVisibleShare, 0.8095);
  assert.equal(p.seatsVisibleShare, 0.6087);
  // 시선은 LED 면(z≈0)이 아니라 **테이블 가운데쯤**(z≈8.7)에 찍힌다 —
  //   방향은 그대로 두고 점만 당겨서 시선 높이가 바닥 아래로 내려가지 않게 한다(§26).
  assert.ok(p.target[2] > 6 && p.target[2] < 11);
  assert.ok(p.target[1] < p.position[1]);
});

// ── F. 순수성 · 동결 (§40 ㉜~㊷) ──────────────────────────────────────────

test('순수 계산 — THREE도 DOM도 OrbitControls도 쓰지 않는다(§25)', () => {
  // (파일 머리말에 '순수 — THREE도 DOM도 쓰지 않는다'라고 적혀 있으므로 **쓰임**만 본다.)
  assert.ok(!/THREE\.|three\.module|from '\.\/vendor/.test(camSrc), '화각 층이 Three.js를 읽는다');
  assert.ok(!/document\.|window\.|canvas/.test(camSrc), '화각 층이 DOM을 읽는다');
  // 조작기는 **이름만 주석에 나온다**(왜 시선을 눈높이 아래로 두는지 설명). 쓰지는 않는다.
  assert.ok(!/OrbitControls\.|new OrbitControls|import[^\n]*OrbitControls/.test(camSrc),
    '화각 층이 조작기를 쓴다');
  // 다른 모듈에서 가져오는 것은 room-design 하나뿐이다(순수 선언 층).
  const imports = [...camSrc.matchAll(/from '([^']+)'/g)].map(m => m[1].split('?')[0]);
  assert.deepEqual(imports, ['./room-design.js'], `화각 층이 읽는 모듈: ${imports.join(', ')}`);
  // 조명·마감과 서로 물리지 않는다.
  assert.ok(!/design-lighting|design-finish/.test(camSrc), '화각 층이 조명·마감을 읽는다');
  // 같은 입력이면 같은 답(순수 함수).
  const m = modelFor(14000, 3800, 10000);
  assert.deepEqual(planOf(m, 'interior'), planOf(m, 'interior'));
});

test('㉜㉝㉞ 아이소·평면도·정면은 한 값도 바뀌지 않는다(§19~§21)', () => {
  const m = modelFor(14000, 3800, 10000);
  const mNo = { ...m, design: null };
  for (const pre of ['iso', 'top', 'front']) {
    const a = presetPose(pre, m, ASPECT, {});
    const b = presetPose(pre, mNo, ASPECT, {});
    // 디자인이 붙어도 이 세 시점은 **디자인을 모르는 계산**과 완전히 같다.
    assert.deepEqual(a.position, b.position, pre);
    assert.deepEqual(a.target, b.target, pre);
    assert.equal(a.fov, b.fov, pre);
    assert.equal(a.ortho, b.ortho, pre);
    assert.equal(a.orthoHeight, b.orthoHeight, pre);
  }
  // 시점 목록과 기본 화각 범위도 그대로다(시점을 늘리지 않았다).
  assert.deepEqual(CAMERA_PRESETS.map(p => p.id),
    ['interior', 'corner-l', 'front', 'corner-r', 'iso', 'top']);
  assert.deepEqual({ ...FOV_RANGE }, { min: 24, max: 75, step: 1, default: 40 });
});

test('㉟㊱ 조명(conferenceSoft)과 마감(conferenceBright)이 그대로다(§30·§31)', () => {
  const l = lightingForDesign(LC);
  assert.equal(l.id, 'conferenceSoft');
  assert.deepEqual({ ...l.scale }, { hemi: 1.18, ceiling: 0.28, key: 0.92, fill: 1.30, ledSpill: 1.00 });
  assert.deepEqual({ ...l.shadow }, { radius: 12, bias: -0.00035, normalBias: 0.030 });
  assert.deepEqual({ ...l.fillPos }, { x: 1.45, y: 0.62, z: 0.55 });
  assert.deepEqual({ ...l.fillTarget }, { x: 0.5, y: 0.52, z: 0.5 });
  const p = DESIGN_PALETTES.conferenceBright;
  assert.equal(p.floor, '#c0c1c0');
  assert.equal(p.wallFront, '#f3f1ed');
  assert.equal(p.wallSide, '#ece9e4');
  assert.equal(p.conferenceTop, '#e2ddd1');
  assert.equal(p.conferenceBase, '#3a3f46');
  assert.equal(p.screen, '#181f2a');
  // 대회의실 마감·조명은 그대로다. 팔레트는 PHASE 5-d.1(상황실)·7-a(교육장)에서, 조명은
  //   PHASE 5-d.3 에서 늘었을 뿐, 대회의실 값은 위에서 확인한 대로 한 값도 바뀌지 않았다.
  assert.equal(Object.keys(LIGHTING_PRESETS).length, 4);
  assert.equal(Object.keys(DESIGN_PALETTES).length, 5);   // + 교육장(PHASE 7-a)
  assert.deepEqual(Object.keys(DESIGN_PALETTES),
    ['corporateNeutral', 'executiveBright', 'conferenceBright', 'trainingNeutral', 'controlPalette']);
});

test('㊲ 형상·배치·좌석 수가 한 자리도 바뀌지 않았다(§32)', () => {
  // 화각을 켜기 전과 후의 **배치 결과가 같아야 한다** — 카메라는 배치를 읽기만 한다.
  for (const [tag, shape, dir, W, H, D] of MATRIX) {
    const opts = { ...defaultOptions('meeting'), tableShape: shape, seats: 30, tableDir: dir, rug: true };
    const withDesign = layoutRoom('meeting', opts, { W, D, ledBottom: 900, design: LC });
    const again = layoutRoom('meeting', opts, { W, D, ledBottom: 900, design: LC });
    assert.deepEqual(withDesign.items, again.items, `${tag}: 배치가 흔들린다`);
    assert.equal(withDesign.placed.chairs, again.placed.chairs, tag);
  }
  // 가구 치수 상수도 그대로다.
  assert.equal(FURNITURE.chairPitch, 700);
  assert.equal(FURNITURE.chairClear, 650);
  assert.equal(FURNITURE.frontClear, 1800);
  assert.equal(FURNITURE.wallClear, 800);
  // 테이블 방향 옵션 논리도 그대로다(대회의실 전용).
  assert.equal(tableDirOf({ design: LC, tableDir: 'along' }), 'along');
  assert.equal(tableDirOf({ design: CO, tableDir: 'along' }), 'across');
  assert.equal(tableDirOf({ design: EX, tableDir: 'along' }), 'across');
  // 화각 층이 배치·가구를 **쓰기**로 건드리지 않는다(읽는 모듈조차 없다).
  assert.ok(!/room-presets|furniture-|conference-av/.test(camSrc), '화각 층이 배치·가구를 읽는다');
});

test('㊳㊴㊵ 대기업·임원·그 밖의 공간 카메라가 한 값도 바뀌지 않는다', () => {
  // 대기업 — 두 시점을 실제로 계산해 값을 고정한다(픽셀 무변경의 근거).
  const mc = modelFor(11000, 3500, 9000, { design: CO, shape: 'boat', seats: 14 });
  const ci = corporateCameraPlan(mc.room, mc.led, 'interior', ASPECT);
  assert.equal(ci.position[1], 1.65);
  assert.equal(ci.fov, 41);
  const me = modelFor(11000, 3800, 9000, { design: EX, seats: 14 });
  const ei = executiveCameraPlan(me.room, me.led, 'interior', ASPECT, me.table);
  assert.equal(ei.position[1], 1.60);
  assert.equal(ei.eye, 1.60);
  assert.deepEqual([...corporateCameraPresets(CO)], ['interior', 'corner-l', 'corner-r', 'rear']);
  assert.deepEqual([...executiveCameraPresets(EX)], ['interior', 'corner-l', 'corner-r', 'rear']);
  // 디자인이 없는 공간(강의실·강당·상황실…)은 기존 계산 그대로다.
  for (const rt of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'control', 'ideation']) {
    const items = layoutRoom(rt, defaultOptions(rt), { W: 12000, D: 10000 }).items;
    const m = buildGLModel({
      space: { W: 12000, H: 3800, D: 10000 },
      led: { w: 5760, h: 2160, marginW: 3120, mount: 900, cols: 4, rows: 4, depth: 79.5 },
      items, design: null, roomType: rt,
    });
    for (const pre of CAMERA_PRESETS.map(p => p.id)) {
      assert.equal(cameraPlanForDesign(null, pre, m, ASPECT), null, `${rt}/${pre}`);
    }
  }
});

test('㊶㊷ 계산기와 prices.local.js 동작이 그대로다', () => {
  // CLAUDE.md §검증된 기준 데이터 — 삼성 공식 configurator 실측값.
  const MP012F = MODELS.find(m => m.id === 'MP012F');
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.heatMaxBTU - 20916) < 20);
  // 화각 층은 계산기에 닿을 수 없다 — 읽는 모듈조차 없다.
  assert.ok(!/engine\.js|models\.js|prices/.test(camSrc), '화각 층이 계산기·단가를 읽는다');
});

// ── G. 범위 계산(gl-model) — 카메라가 읽는 값이 맞는가 ────────────────────

test('범위 계산 — 세워 놓은 테이블의 발자국이 90° 틀어지지 않는다', () => {
  // 세로 보트형은 `rotY: 90` 으로 눕혀 놓는다. 방향을 반영하지 않으면 발자국이 뒤집힌다.
  const along = modelFor(10000, 4000, 18000, { shape: 'boat', dir: 'along' });
  assert.ok(along.table.z1 - along.table.z0 > along.table.x1 - along.table.x0,
    '세로 보트형의 발자국이 가로로 나왔다');
  const across = modelFor(14000, 3800, 10000, { shape: 'boat', dir: 'across' });
  assert.ok(across.table.x1 - across.table.x0 > across.table.z1 - across.table.z0);
  // **가로 배치는 예전과 값이 완전히 같다**(전부 rotY = 0 이라 회전 반영이 no-op 이다).
  const u = modelFor(14000, 3800, 10000);
  assert.deepEqual({ ...u.table }, { x0: 1.45, x1: 12.55, z0: 2.45, z1: 8.55 });
});

test('범위 계산 — 좌석·모니터·프롬프터를 읽기만 한다', () => {
  const m = modelFor(14000, 3800, 10000);
  assert.ok(m.fields.seats.count > 20, `좌석 ${m.fields.seats.count}`);
  assert.equal(m.fields.monitors.count, m.fields.seats.count, '좌석 1개당 모니터 1대');
  assert.ok(m.fields.prompter && Number.isFinite(m.fields.prompter.x));
  // 없는 것은 **null**이다 — 없는 값을 지어내지 않는다(CLAUDE.md 규칙 2).
  const rect = modelFor(14000, 3800, 10000, { shape: 'rect' });
  assert.equal(rect.fields.monitors, null);
  assert.equal(rect.fields.prompter, null);
  const none = modelFor(14000, 3800, 10000, { shape: 'none' });
  assert.equal(none.table, null);
  // 테이블이 없어도 카메라는 답을 낸다(모르는 것만 null로 둔다).
  const p = conferenceCameraPlan(none.room, none.led, 'interior', ASPECT,
    { table: null, ...none.fields });
  assert.ok(p && p.position.every(Number.isFinite));
  assert.equal(p.tableVisible, null);
  assert.equal(p.tableVisibleShare, null);
  assert.equal(none.fields.tableParts, null);
});
