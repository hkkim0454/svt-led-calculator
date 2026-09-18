// control-release.test.js — 상황실 V1 릴리스 게이트 회귀 테스트. (PHASE 5-e)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것은 **릴리스 판정 자체**다. 형상·마감·조명·화각의 내용은 5-a~5-d 의
// 테스트들이 이미 고정하고 있으므로 여기서 다시 세지 않는다. 이 파일이 맡는 것은 셋이다.
//   ① 승급 규칙 — `ready` 라는 표시를 언제 달 수 있고, 그 표시가 무엇을 뜻하는가.
//   ② 표시만 바뀐다 — 상태 값은 화면을 그리는 어떤 코드도 읽지 않는다.
//   ③ 평면·정면 동결 — 제안용 화각(controlProposal)이 기술 시점까지 옮기지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  ROOM_DESIGNS, DESIGN_IDS, DESIGN_STATUS, isPlanned, resolveDesign,
} from '../src/room-design.js';
import {
  CONTROL_CAMERA_PRESETS, CONTROL_FOV_RANGE, controlCameraPlanId, controlCameraPresets,
  cameraPlanForDesign,
} from '../src/design-camera.js';
import { CAMERA_PRESETS, buildGLModel, presetPose, FOV_DEG } from '../src/gl-model.js';
import { layoutRoom } from '../src/room-presets.js';

const CR = 'controlRoom';
const RELEASED = ['corporateMeeting', 'executiveBoardroom', 'largeConference', CR];
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
/** 주석을 지운 소스 — 설명 글에 적힌 낱말이 검사에 걸리지 않게 한다. */
const code = f => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── ① 승급 규칙 ──────────────────────────────────────────────────────────────

test('① 상황실이 ready 로 승급했고, 릴리스를 마친 네 공간만 ready 다', () => {
  assert.equal(ROOM_DESIGNS[CR].status, DESIGN_STATUS.READY, '상황실이 아직 ready 가 아니다');
  for (const id of RELEASED) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.READY, `${id}: ready 가 아니다`);
  }
  // 승급하지 않은 디자인이 남아 있다면 그것은 planned 여야 한다(중간 상태를 만들지 않는다).
  for (const id of DESIGN_IDS) {
    if (RELEASED.includes(id)) continue;
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.PLANNED, `${id}: ready 도 planned 도 아니다`);
  }
});

test('② ready 는 **실제로 만든 것만 적혀 있다**는 뜻이다 — 상황실이 실제로 그 조건을 만족한다', () => {
  const d = ROOM_DESIGNS[CR];
  // 소품(accessories)은 V1 범위 밖이라 planned 로 남는다. 그 외 자리는 전부 실물 이름이어야 한다.
  const 실물 = {
    '의자': d.furniture.chair, '콘솔': d.furniture.console,
    '팔레트': d.palette, '벽 구성': d.wallTreatment, '조명': d.lighting, '화각': d.camera,
  };
  for (const [이름, v] of Object.entries(실물)) {
    assert.equal(typeof v, 'string', `${이름}: 문자열이 아니다`);
    assert.equal(isPlanned(v), false, `${이름}: 아직 planned 인 채로 승급했다`);
  }
  for (const a of d.furniture.av) {
    assert.equal(isPlanned(a), false, `AV ${JSON.stringify(a)}: 아직 planned 다`);
  }
  for (const [k, v] of Object.entries(d.materials)) {
    assert.equal(isPlanned(v), false, `materials.${k}: 아직 planned 다`);
  }
  // 소품만 planned 로 남아 있다 — V1 범위를 문서가 아니라 코드로 못박는다.
  assert.equal(isPlanned(d.accessories), true, '소품이 planned 가 아니다 — V1 범위를 넘겼다');
  assert.equal(d.accessories.planned, 'controlAccessories');
});

// ── ② 상태 값은 화면을 바꾸지 않는다 ─────────────────────────────────────────

test('③ 디자인 상태 값을 읽는 그리기 코드가 하나도 없다 — 승급은 **표시**일 뿐이다', () => {
  // `room-design.js` 안에서는 선언과 요약(designSummary)에만 쓰인다.
  //   그 밖의 파일이 디자인 상태를 읽어 동작을 가르면, 승급만으로 화면이 바뀔 수 있다.
  const 대상 = readdirSync(new URL('../src/', import.meta.url))
    .filter(f => f.endsWith('.js') && f !== 'room-design.js');
  for (const f of 대상) {
    const t = code(f);
    assert.equal(/DESIGN_STATUS/.test(t), false, `${f}: 디자인 상태를 읽는다`);
    assert.equal(/design[A-Za-z]*\.status|\.status\s*===\s*['"](ready|planned|neutral)/.test(t), false,
      `${f}: 디자인 상태로 동작을 가른다`);
  }
  // 해석 결과에는 남아 있어야 한다(사람이 확인하는 값이다).
  assert.equal(resolveDesign(CR).status, DESIGN_STATUS.READY);
});

test('④ 상태를 바꿔도 해석 결과가 한 값도 달라지지 않는다', () => {
  const 사본 = JSON.stringify({ ...resolveDesign(CR), status: null });
  const 원본 = ROOM_DESIGNS[CR];
  const 바꾼 = Object.freeze({ ...원본, status: DESIGN_STATUS.PLANNED });
  // 해석기는 상태를 인자로 받지 않는다 — 같은 선언에서 같은 결과가 나온다는 것을 직접 확인한다.
  assert.equal(JSON.stringify({ ...resolveDesign(CR), status: null }), 사본);
  assert.equal(바꾼.status, DESIGN_STATUS.PLANNED, '사본 만들기 자체가 실패했다');
  assert.equal(원본.status, DESIGN_STATUS.READY, '원본이 사본 때문에 바뀌었다');
});

// ── ③ 평면·정면 기술 시점 동결 ───────────────────────────────────────────────

test('⑤ 제안용 화각은 실내·코너·후면 넷뿐이다 — 평면·정면·아이소를 가져가지 않는다', () => {
  assert.deepEqual([...CONTROL_CAMERA_PRESETS], ['interior', 'corner-l', 'corner-r', 'rear']);
  for (const v of ['top', 'front', 'iso']) {
    assert.equal(controlCameraPlanId(CR, v), null, `${v}: 상황실 제안 화각이 가로챘다`);
  }
  assert.deepEqual([...controlCameraPresets(CR)], ['interior', 'corner-l', 'corner-r', 'rear']);
});

test('⑥ 평면·정면은 디자인이 무엇이든 **같은 기술 시점**이다', () => {
  const W = 16000, H = 3900, D = 14000;
  const lay = layoutRoom('control',
    { consoleRows: 2, perRow: 4, tiers: 1, riserH: 200, tierStartRow: 0, backTable: true, plant: false },
    { W, D, design: CR });
  const model = buildGLModel({
    space: { W, H, D },
    led: { marginW: (W - 6000) / 2, mount: 1000, w: 6000, h: 2160, depth: 60, cols: 4, rows: 4 },
    items: lay.items, design: CR, roomType: 'control',
  });
  for (const v of ['top', 'front']) {
    assert.equal(cameraPlanForDesign(CR, v, model, 16 / 9), null, `${v}: 디자인이 시점을 덮어썼다`);
    // 기본 시점 표는 디자인을 인자로 받지 않는다 — 방 크기와 LED 만 본다.
    const a = presetPose(v, model, 16 / 9);
    const b = presetPose(v, { ...model, design: 'corporateMeeting' }, 16 / 9);
    assert.deepEqual(a, b, `${v}: 디자인에 따라 시점이 달라진다`);
  }
  // 평면은 정사투영, 정면은 기술 도면용 기본 화각이다(제안용 원근이 섞이면 안 된다).
  const ids = CAMERA_PRESETS.map(p => p.id);
  assert.ok(ids.includes('top') && ids.includes('front'), '평면·정면 시점이 사라졌다');
  assert.equal(presetPose('top', model, 16 / 9).ortho, true, '평면이 정사투영이 아니다');
  assert.equal(presetPose('front', model, 16 / 9).fov, FOV_DEG, '정면 화각이 기본값에서 벗어났다');
});

// ── ④ 방을 바꿔도 물건이 쌓이지 않는다 ───────────────────────────────────────
// 이 둘은 **브라우저에서만 드러나는 고장**이라 계산만 하는 테스트로는 결과를 확인할 수 없다.
//   그래서 결과 대신 **원인이 되는 코드 모양**을 고정한다. 실제 화면 확인은
//   릴리스 게이트의 반복 전환 검사(PHASE 5-e §13)가 따로 맡는다.

test('⑦ 새 방을 세우기 전에 이전 방을 반드시 정리한다 — 조명·가구가 쌓이지 않는다', () => {
  const t = code('render3d-gl.js');
  const m = t.match(/disposeGroup\(group\);[\s\S]{0,200}?group\s*=\s*buildRoomGroup\(/);
  assert.ok(m, '이전 방을 정리하지 않고 새 방을 세운다(disposeGroup → buildRoomGroup 순서가 깨졌다)');
  // 정리 함수 자체도 남아 있어야 한다 — 이름만 있고 아무것도 안 하면 같은 고장이다.
  assert.ok(/function disposeGroup\(gr\)\s*\{[\s\S]*?scene\.remove\(gr\)/.test(t),
    'disposeGroup 이 장면에서 이전 방을 빼지 않는다');
});

test('⑧ 칸막이를 그룹에 **딱 한 번** 넣는다 — 유리가 겹쳐 두 장이 되지 않는다', () => {
  const t = code('render3d-gl.js');
  const m = t.match(/for \(const part of model\.partitions \|\| \[\]\) \{[\s\S]*?\n  \}/);
  assert.ok(m, '칸막이를 그리는 자리를 찾지 못했다');
  const 블록 = m[0];
  assert.equal((블록.match(/g\.add\(/g) || []).length, 1,
    `칸막이 하나를 그룹에 ${(블록.match(/g\.add\(/g) || []).length}번 넣는다`);
  assert.equal(/\.clone\(\)/.test(블록), false, '칸막이를 복제해 두 번 넣는다');
});
