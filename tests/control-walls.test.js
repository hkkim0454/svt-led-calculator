// control-walls.test.js — 상황실 벽 구성(유리 파티션 + 왼쪽 흡음벽) 회귀 테스트. (PHASE 5-d.2)
// ─────────────────────────────────────────────────────────────────────────────
// 여기서 지키는 것.
//   ① **방 껍데기를 대신하지 않는가** — 기본으로 꺼져 있는 오른쪽 벽을 켜서 때우지 않는가.
//   ② **자리가 근거 있는가** — 장식 수치가 아니라 방 크기·가구 여유에서 나오는가.
//   ③ **운용 구역을 침범하지 않는가** — 가구·AV와 0mm도 겹치지 않고 여유가 실제로 있는가.
//   ④ **유리 정책이 유리에만 걸리는가** — 다른 반투명 재질이 따라 바뀌지 않는가.
//   ⑤ **다른 공간이 흔들리지 않는가** — 회의실 3종의 벽 마감이 한 값도 달라지지 않는가.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  controlWallPlan, wantsControlWalls, operatorZoneRight, halfWidthOf, partitionClearance,
  GLASS_THK, GLASS_Z_FROM, GLASS_MIN_LENGTH, BRIEF_ZONE_MIN, BRIEF_ZONE_MAX, FRAME,
  OPERATOR_CLEAR, ACOUSTIC_WALL_SIDE, WALL_PLAN_IDS, CONTROL_WALL_PLAN, NON_OPERATION_TYPES,
} from '../src/control-walls.js';
import { FURNITURE, layoutRoom } from '../src/room-presets.js';
import { ROOM_DESIGNS, isPlanned } from '../src/room-design.js';
import { roomFinishForDesign, DESIGN_PALETTES } from '../src/design-finish.js';
import {
  MATERIAL_IDS, MATERIAL_PRESETS, materialParams, renderSemantics, resolveMaterialId,
} from '../src/materials.js';
import { buildGLModel, ACCENT_WALL_SIDE } from '../src/gl-model.js';

const CR = 'controlRoom';
const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

// 대표 방 3종 + 극단값. 실제로 화면에서 고를 수 있는 범위다.
const ROOMS = [
  ['컴팩트', 8000, 7000], ['중형', 12000, 10000],
  ['대형', 16000, 14000], ['초대형', 20000, 16000],
];
const BASE = { consoleRows: 2, perRow: 4, tiers: 1, riserH: 200, tierStartRow: 0, backTable: true, plant: false };
const OPTS = [
  ['기본', {}], ['단 2', { tiers: 2 }], ['단 3', { tiers: 3, riserH: 300 }],
  ['콘솔 최대', { perRow: 12, consoleRows: 8 }], ['콘솔 1대', { perRow: 1, consoleRows: 1 }],
  ['뒤 테이블 없음', { backTable: false }], ['화분', { plant: true }],
];

function scene(W, D, extra = {}, H = 3400) {
  const lay = layoutRoom('control', { ...BASE, ...extra }, { W, D, design: CR });
  const plan = controlWallPlan({ W, D, H, design: CR, items: lay.items });
  return { lay, plan, W, D, H };
}

// 상대 휘도(0~255). 색이 '어둡다/밝다'를 눈이 아니라 수치로 본다.
function lum(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

// ── ① 순수성과 소속 ─────────────────────────────────────────────────────────

test('① 계획 모듈은 순수하다 — Three.js 도, DOM 도 쓰지 않는다', () => {
  const s = src('control-walls.js');
  assert.equal(/\bthree\b/i.test(s.replace(/\/\/.*$/gm, '')), false, 'Three.js 를 끌어들였다');
  for (const bad of ['document', 'window', 'canvas']) {
    assert.equal(new RegExp(`\\b${bad}\\.`).test(s), false, `${bad} 를 쓴다`);
  }
});

test('② 어느 공간이 이 벽 구성을 쓰는지는 디자인이 정한다 — 목록을 두 곳에 적지 않는다', () => {
  assert.equal(wantsControlWalls(CR), true);
  for (const other of ['corporateMeeting', 'executiveBoardroom', 'largeConference', null, undefined, '없는디자인']) {
    assert.equal(wantsControlWalls(other), false, String(other));
  }
  // 판정의 근거는 `room-design.js` 의 wallTreatment 하나다(계획 이름을 하드코딩한 공간 목록이 없다).
  assert.equal(ROOM_DESIGNS[CR].wallTreatment, CONTROL_WALL_PLAN);
  assert.ok(WALL_PLAN_IDS.includes(CONTROL_WALL_PLAN), '계획 이름이 실재 목록에 없다');
  assert.equal(/CONTROL_WALL_DESIGNS/.test(src('control-walls.js')), false, '공간 목록을 또 만들었다');
});

test('③ 상황실이 아닌 공간에는 파티션이 하나도 생기지 않는다', () => {
  for (const [type, design] of [['meeting', 'corporateMeeting'], ['meeting', 'executiveBoardroom'],
    ['meeting', 'largeConference'], ['classroom', null], ['hall_m', null], ['ideation', null]]) {
    const lay = layoutRoom(type, {}, { W: 14000, D: 12000, design });
    const plan = controlWallPlan({ W: 14000, D: 12000, H: 3400, design, items: lay.items });
    assert.deepEqual([...plan.partitions], [], `${type}/${design}`);
    assert.equal(plan.glass, null);
    assert.equal(plan.acousticSide, null, '상황실이 아닌데 흡음 벽을 지정했다');
  }
});

// ── ② 자리와 치수의 근거 ────────────────────────────────────────────────────

test('④ 치수가 전부 기존 상수에서 나온다 — 장식 수치를 새로 만들지 않았다', () => {
  assert.equal(BRIEF_ZONE_MIN, FURNITURE.aisleW, '브리핑 구역 최소폭이 통로 폭과 다르다');
  assert.equal(BRIEF_ZONE_MAX, FURNITURE.aisleW * 2);
  assert.equal(OPERATOR_CLEAR, FURNITURE.wallClear, '운용 여유가 벽 여유와 다르다');
  assert.equal(GLASS_Z_FROM, FURNITURE.frontClear, '파티션 시작이 LED 앞 여유와 다르다');
  assert.equal(GLASS_MIN_LENGTH, FURNITURE.consolePitchZ);
  assert.equal(GLASS_THK, 12, '실제 강화유리 파티션 두께(12mm)가 아니다');
});

test('⑤ 유리는 항상 방 안에 있다 — 벽을 뚫거나 방 밖으로 나가지 않는다', () => {
  for (const [name, W, D] of ROOMS) {
    for (const [tag, extra] of OPTS) {
      const { plan, H } = scene(W, D, extra);
      const g = plan.glass;
      if (!g) continue;
      assert.ok(g.x - g.w / 2 > 0 && g.x + g.w / 2 < W, `${name}/${tag}: 좌우 벽을 뚫었다`);
      assert.ok(g.z - g.d / 2 >= 0 && g.z + g.d / 2 <= D, `${name}/${tag}: 앞뒤 벽을 뚫었다`);
      assert.equal(g.y, 0, `${name}/${tag}: 바닥에서 시작하지 않는다`);
      assert.equal(g.h, H, `${name}/${tag}: 높이가 방 높이와 다르다`);
    }
  }
});

test('⑥ LED 벽 앞 여유 구역에는 들어오지 않고, 반대쪽 끝은 뒷벽에 닿는다', () => {
  for (const [name, W, D] of ROOMS) {
    const { plan } = scene(W, D);
    const g = plan.glass;
    if (!g) continue;
    assert.equal(g.z - g.d / 2, FURNITURE.frontClear, `${name}: 시작이 LED 앞 여유와 다르다`);
    assert.equal(g.z + g.d / 2, D, `${name}: 끝이 뒷벽에 닿지 않는다(떠 있는 판이 된다)`);
  }
});

test('⑦ 필요 이상으로 방 안쪽까지 들어오지 않는다 — 브리핑 구역 폭에 상한이 있다', () => {
  for (const [name, W, D] of ROOMS) {
    const { plan } = scene(W, D);
    if (!plan.glass) continue;
    const strip = W - (plan.glass.x - GLASS_THK / 2);          // 유리 표면 ~ 오른쪽 벽
    assert.ok(strip >= BRIEF_ZONE_MIN, `${name}: 브리핑 구역이 통로보다 좁다`);
    assert.ok(strip <= BRIEF_ZONE_MAX, `${name}: 브리핑 구역이 ${strip}mm 로 상한을 넘었다`);
  }
  // 방을 아무리 키워도 상한에서 멈춘다 = 유리가 계속 안쪽으로 밀려 들어오지 않는다.
  const huge = scene(30000, 24000);
  assert.equal(30000 - (huge.plan.glass.x - GLASS_THK / 2), BRIEF_ZONE_MAX);
});

test('⑧ 방이 넓어지면 유리도 같이 오른쪽으로 간다 — 크기 변화에 안정적이다', () => {
  let prev = -Infinity;
  for (const W of [12000, 13000, 14000, 16000, 18000, 20000, 24000]) {
    const { plan } = scene(W, 14000);
    assert.ok(plan.glass, `${W}: 파티션이 사라졌다`);
    assert.ok(plan.glass.x > prev, `${W}: 방을 넓혔는데 유리가 안쪽으로 들어왔다`);
    prev = plan.glass.x;
  }
});

test('⑨ 자리가 없으면 억지로 세우지 않고, 그 이유를 남긴다', () => {
  const tight = scene(8000, 7000);                       // 콘솔이 방 폭을 거의 채운다
  assert.equal(tight.plan.glass, null, '좁은 방에 억지로 세웠다');
  assert.ok(tight.plan.notes.some(n => n.includes('오른쪽에 남는 폭')), '이유를 남기지 않았다');

  const shallow = scene(16000, 4000);                    // 깊이가 짧다
  assert.equal(shallow.plan.glass, null);
  assert.ok(shallow.plan.notes.some(n => n.includes('방 깊이')), '이유를 남기지 않았다');

  // 콘솔을 최대로 채우면 방이 아무리 커도 세우지 않는다(운용 구역이 우선이다).
  const packed = scene(20000, 16000, { perRow: 12, consoleRows: 8 });
  assert.equal(packed.plan.glass, null, '콘솔을 방 끝까지 채웠는데도 유리를 세웠다');

  // 치수를 모르면 아무것도 만들지 않는다(추정값을 지어내지 않는다).
  for (const bad of [{ W: 0, D: 10000, H: 3400 }, { W: 12000, D: 0, H: 3400 }, { W: 12000, D: 10000, H: 0 }, {}]) {
    assert.equal(controlWallPlan({ ...bad, design: CR, items: [] }).glass, null, JSON.stringify(bad));
  }
});

// ── ③ 운용 구역 침범 0 ──────────────────────────────────────────────────────

test('⑩ 가구·AV와 한 번도 겹치지 않는다 — 방 크기 × 옵션 전수 검사', () => {
  let checked = 0;
  for (const [name, W, D] of ROOMS) {
    for (const [tag, extra] of OPTS) {
      const { lay, plan } = scene(W, D, extra);
      const g = plan.glass;
      if (!g) continue;
      checked++;
      for (const it of lay.items) {
        if (NON_OPERATION_TYPES.includes(it.type)) continue;
        const half = halfWidthOf(it);
        assert.notEqual(half, null, `${name}/${tag}: ${it.type} 의 폭을 모른다`);
        const gap = Math.abs(it.x - g.x) - half - g.w / 2;
        assert.ok(gap > 0, `${name}/${tag}: ${it.type}(x=${it.x}) 와 ${Math.round(-gap)}mm 겹친다`);
      }
    }
  }
  assert.ok(checked >= 8, `실제로 검사한 구성이 ${checked}개뿐이다`);
});

test('⑪ 운용 구역에서 최소 800mm(벽 여유와 같은 값) 떨어져 선다', () => {
  for (const [name, W, D] of ROOMS) {
    for (const [tag, extra] of OPTS) {
      const { lay, plan } = scene(W, D, extra);
      if (!plan.glass) continue;
      const near = partitionClearance(plan, lay.items);
      assert.ok(near.gap >= OPERATOR_CLEAR - 1e-9,
        `${name}/${tag}: 여유가 ${Math.round(near.gap)}mm 뿐이다(${near.item.type})`);
      // 유리 표면 기준으로도 운용 구역 오른쪽 끝보다 바깥이어야 한다.
      assert.ok(plan.glass.x - GLASS_THK / 2 >= plan.operatorRight + OPERATOR_CLEAR - 1e-9,
        `${name}/${tag}: 운용 구역을 파고들었다`);
    }
  }
});

test('⑫ 화분·러그는 운용 구역으로 세지 않지만, 유리와 겹치지도 않는다', () => {
  const { lay, plan } = scene(16000, 14000, { plant: true });
  const plant = lay.items.find(i => i.type === 'plant');
  assert.ok(plant, '화분이 놓이지 않았다');
  assert.ok(plant.x > plan.glass.x, '화분이 운용 구역 쪽에 남았다(브리핑 구역에 있어야 한다)');
  assert.ok(plant.x - 400 > plan.glass.x + GLASS_THK / 2, '화분이 유리에 닿는다');
  // 화분을 켜고 꺼도 유리 자리는 그대로다 — 장식이 파티션을 밀지 않는다.
  assert.equal(plan.glass.x, scene(16000, 14000).plan.glass.x);
});

test('⑬ 폭을 모르는 항목은 추정하지 않는다 — 계산에서 빼고 사실을 남긴다', () => {
  assert.equal(halfWidthOf({ type: '알수없음', x: 100 }), null);
  assert.equal(halfWidthOf(null), null);
  assert.equal(halfWidthOf({ type: 'chair', x: 0 }), 310, '의자 폭이 계약(620mm)과 다르다');
  const r = operatorZoneRight([{ type: '알수없음', x: 9999 }, { type: 'console', x: 1000, w: 1800 }]);
  assert.equal(r.right, 1900, '모르는 항목을 넣어 계산했다');
  assert.deepEqual([...r.unknown], ['알수없음']);
  const plan = controlWallPlan({ W: 16000, D: 14000, H: 3400, design: CR, items: [{ type: '알수없음', x: 1000 }] });
  assert.ok(plan.notes.some(n => n.includes('폭을 알 수 없는')), '사실을 남기지 않았다');
});

test('⑭ 배치를 한 자리도 바꾸지 않는다 — 계획은 읽기만 한다', () => {
  const lay = layoutRoom('control', BASE, { W: 16000, D: 14000, design: CR });
  const before = JSON.stringify(lay.items);
  controlWallPlan({ W: 16000, D: 14000, H: 3400, design: CR, items: lay.items });
  assert.equal(JSON.stringify(lay.items), before, '배치 항목이 바뀌었다');
  // 같은 입력이면 같은 결과다(실행할 때마다 달라지지 않는다).
  const a = controlWallPlan({ W: 16000, D: 14000, H: 3400, design: CR, items: lay.items });
  const b = controlWallPlan({ W: 16000, D: 14000, H: 3400, design: CR, items: lay.items });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('⑮ 콘솔·의자·AV 배치는 PHASE 5-d.2 에서 한 자리도 움직이지 않았다', () => {
  // 기준값은 PHASE 5-c 에서 실측해 고정한 값이다(16 × 14m, 기본 옵션).
  const lay = layoutRoom('control', BASE, { W: 16000, D: 14000, design: CR });
  const n = t => lay.items.filter(i => i.type === t).length;
  assert.equal(n('console'), 8);
  assert.equal(n('chair'), 8 + 8);          // 콘솔 뒤 8 + 뒤 테이블 8
  assert.equal(n('monitor'), 16);
  assert.equal(n('keyboard'), 8);
  const c0 = lay.items.find(i => i.type === 'console');
  assert.deepEqual({ x: c0.x, z: c0.z, w: c0.w, d: c0.d }, { x: 5000, z: 3050, w: 1800, d: 900 });
});

// ── ④ 유리 재질 정책 ────────────────────────────────────────────────────────

test('⑯ 유리 정책이 오너 결정 그대로다 — 깊이 기록만 끄고 깊이 검사는 켜 둔다', () => {
  const p = materialParams('glassPartition');
  assert.equal(p.transparent, true);
  assert.equal(p.opacity, 0.16);
  assert.equal(p.roughness, 0.08);
  assert.equal(p.metalness, 0);
  assert.equal(p.doubleSided, true);
  assert.equal(p.depthWrite, false, '깊이 기록을 끄지 않으면 유리 뒤가 지워진다');
  assert.equal('depthTest' in p, false, '깊이 검사는 기본값(켜짐) 그대로 두어야 한다');
  const sem = renderSemantics('glassPartition');
  assert.equal(sem.castsShadow, false);
  assert.equal(sem.receivesShadow, false);
  assert.equal(sem.renderClass, 'transparent');
  assert.equal(sem.renderOrderHint, 2);
});

test('⑰ 깊이 기록 정책은 **유리에만** 걸린다 — 다른 재질은 한 값도 달라지지 않는다', () => {
  for (const id of MATERIAL_IDS) {
    const p = materialParams(id);
    if (id === 'glassPartition') continue;
    assert.equal('depthWrite' in p, false, `${id}: 유리 정책이 번졌다`);
  }
  // 프리셋 표에서도 이 표시를 단 재질은 유리뿐이다.
  const flagged = Object.entries(MATERIAL_PRESETS).filter(([, v]) => v.depthWrite === false).map(([k]) => k);
  assert.deepEqual(flagged, ['glassPartition']);
  // **조건의 모양까지 고정한다.** 지금은 반투명 재질이 유리 하나뿐이라, 조건을
  //   'transparent 이면 depthWrite 를 끈다'로 바꿔도 결과가 같아 눈에 띄지 않는다.
  //   그대로 두면 나중에 반투명 재질이 하나만 늘어도 이 정책이 조용히 번진다.
  const code = src('materials.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/if \(p\.depthWrite === false\) out\.depthWrite = false;/.test(code),
    '깊이 기록 정책이 재질별 표시가 아니라 다른 조건으로 걸려 있다');
  //   깊이 기록을 끄는 자리는 **그 한 줄뿐**이어야 한다(다른 조건으로 또 끄지 않는다).
  assert.equal((code.match(/out\.depthWrite = false/g) || []).length, 1,
    '깊이 기록을 끄는 자리가 여러 곳이다');
});

test('⑱ 정식 재질은 13종 그대로다 — 새 재질을 만들지 않았다', () => {
  assert.equal(MATERIAL_IDS.length, 13);
  assert.ok(MATERIAL_IDS.includes('glassPartition'));
  assert.ok(MATERIAL_IDS.includes('acousticPanel'));
});

test('⑲ 어댑터가 깊이 기록만 옮긴다 — 깊이 검사에는 손대지 않는다', () => {
  // 주석을 걷어낸 **실제 코드**만 본다(설명 문장에 단어가 나오는 것은 동작이 아니다).
  const code = src('materials-gl.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/base\.depthWrite = false/.test(code), '어댑터가 깊이 기록을 옮기지 않는다');
  assert.equal(/depthTest/.test(code), false, '어댑터가 깊이 검사를 건드린다');
});

// ── ⑤ 왼쪽 흡음 벽 ──────────────────────────────────────────────────────────

test('⑳ 흡음 마감은 **왼쪽 벽 안쪽 면**에만 붙는다 — 새 벽 형상을 만들지 않았다', () => {
  assert.equal(ACOUSTIC_WALL_SIDE, 'left');
  assert.equal(ACCENT_WALL_SIDE, 'left', '포인트 벽이 왼쪽에서 옮겨 갔다');
  const room = roomFinishForDesign(CR);
  assert.equal(room.wallAccent.canonical, 'acousticPanel');
  // 나머지 벽은 그대로 도장 벽이다 — 특히 **LED 벽(wallFront)에는 붙이지 않는다**(오너 지침 §3).
  assert.equal(room.wallFront.canonical, 'paintedWall', 'LED 벽에 흡음 패널을 붙였다');
  assert.equal(room.wallSide.canonical, 'paintedWall');
  assert.equal(room.baseboard.canonical, 'paintedWall');
  for (const role of Object.keys(room)) {
    assert.notEqual(room[role].canonical, 'glassPartition', `${role}: 유리를 벽 마감으로 붙였다`);
  }
});

test('㉑ 흡음 벽 색이 §6 을 지킨다 — 검정 위 검정도, 새하얀 벽도 아니다', () => {
  const P = DESIGN_PALETTES.controlPalette;
  const wall = lum(P.wallAccent);
  assert.ok(wall > lum(P.consoleBase) + 25, `콘솔 하부(${P.consoleBase})와 뭉친다`);
  assert.ok(wall < lum(P.floor) - 20, `바닥(${P.floor})보다 어둡지 않아 '다크 구역'으로 읽히지 않는다`);
  assert.ok(wall < lum(P.wallSide) - 80, '오른쪽 벽과 구분되지 않는다');
  assert.ok(wall > 40, '거의 검정이라 형태가 죽는다');
});

test('㉒ 다른 공간의 벽 마감은 한 값도 달라지지 않았다', () => {
  // 기준값은 PHASE 5-d.1 병합 시점의 실제 값이다.
  const fixed = {
    corporateMeeting: { wallFront: '#f1efea', wallSide: '#eae7e1', wallAccent: '#e5e1da', accentMat: 'paintedWall' },
    executiveBoardroom: { wallFront: '#f4f1ec', wallSide: '#eeeae3', wallAccent: '#e3ded4', accentMat: 'acousticPanel' },
    largeConference: { wallFront: '#f3f1ed', wallSide: '#ece9e4', wallAccent: '#e4e0d9', accentMat: 'paintedWall' },
  };
  for (const [id, want] of Object.entries(fixed)) {
    const r = roomFinishForDesign(id);
    assert.equal(r.wallFront.color, want.wallFront, `${id}.wallFront`);
    assert.equal(r.wallSide.color, want.wallSide, `${id}.wallSide`);
    assert.equal(r.wallAccent.color, want.wallAccent, `${id}.wallAccent`);
    assert.equal(r.wallAccent.canonical, want.accentMat, `${id}.wallAccent 재질`);
  }
});

// ── ⑥ 렌더러 계약 ──────────────────────────────────────────────────────────

test('㉓ 3D 모델이 파티션을 m 단위로 싣는다 — 여기서 자리를 정하지 않는다', () => {
  const lay = layoutRoom('control', BASE, { W: 16000, D: 14000, design: CR });
  const led = { marginW: 1000, mount: 1000, w: 6000, h: 2000, depth: 60, cols: 4, rows: 4 };
  const m = buildGLModel({ space: { W: 16000, H: 3400, D: 14000 }, led, items: lay.items, design: CR, roomType: 'control' });
  // 유리 1장 + 프레임 3개(바닥 트랙 · 상부 헤드레일 · 끝 포스트).
  assert.deepEqual(m.partitions.map(p => p.id),
    ['controlGlassPartition', 'controlGlassTrack', 'controlGlassHead', 'controlGlassPost']);
  const g = m.partitions[0];
  const mm = controlWallPlan({ W: 16000, D: 14000, H: 3400, design: CR, items: lay.items }).glass;
  for (const k of ['x', 'y', 'z', 'w', 'd', 'h']) {
    assert.ok(Math.abs(g[k] - mm[k] / 1000) < 1e-9, `${k}: mm → m 환산이 맞지 않는다`);
  }
  assert.equal(g.material, 'glassPartition');
  assert.equal(g.id, 'controlGlassPartition');
});

test('㉔ 회의실 3종에는 파티션이 실리지 않는다 — 다른 공간의 씬이 그대로다', () => {
  const led = { marginW: 1000, mount: 1000, w: 6000, h: 2000, depth: 60, cols: 4, rows: 4 };
  for (const design of ['corporateMeeting', 'executiveBoardroom', 'largeConference', null]) {
    const lay = layoutRoom('meeting', {}, { W: 14000, D: 12000, design });
    const m = buildGLModel({ space: { W: 14000, H: 3400, D: 12000 }, led, items: lay.items, design, roomType: 'meeting' });
    assert.deepEqual([...m.partitions], [], String(design));
  }
});

test('㉕ 파티션은 벽 토글과 무관하다 — 오른쪽 벽을 몰래 켜지 않는다', () => {
  const lay = layoutRoom('control', BASE, { W: 16000, D: 14000, design: CR });
  const led = { marginW: 1000, mount: 1000, w: 6000, h: 2000, depth: 60, cols: 4, rows: 4 };
  const m = buildGLModel({ space: { W: 16000, H: 3400, D: 14000 }, led, items: lay.items, design: CR, roomType: 'control' });
  assert.equal(m.show.walls.right, false, '오른쪽 벽이 저절로 켜졌다');
  assert.equal(m.show.walls.left, true);
  assert.equal(m.show.walls.front, true);
  assert.equal(m.show.walls.back, false);
  // 오른쪽 벽을 꺼도 파티션은 그대로 선다(벽을 대신하는 물건이 아니라는 뜻).
  const off = buildGLModel({ space: { W: 16000, H: 3400, D: 14000 }, led, items: lay.items, design: CR,
    roomType: 'control', show: { walls: { right: false, left: false } } });
  assert.equal(off.partitions.length, 4);
});

test('㉖ 렌더러가 파티션을 벽이 아니라 별도 물건으로 세운다', () => {
  const s = src('render3d-gl.js');
  assert.ok(/for \(const part of model\.partitions/.test(s), '렌더러가 파티션을 읽지 않는다');
  // 벽 이름(wallRight)을 파티션 코드에서 건드리지 않는다.
  const at = s.indexOf('for (const part of model.partitions');
  const block = s.slice(at, at + 900);
  assert.equal(/wallRight|wallOn\.right/.test(block), false, '파티션이 오른쪽 벽을 대신하려 한다');
  // 그림자·그리기 순서는 재질이 정한 의미를 그대로 쓴다(숫자를 손으로 적지 않는다).
  assert.ok(/mats\.semantics\(matName\)/.test(s), '재질 의미를 쓰지 않는다');
  assert.ok(/renderOrder = sem\.renderOrderHint/.test(s));
});

test('㉗ 그림자 일괄 지정이 재질의 뜻을 덮어쓰지 않는다', () => {
  const s = src('render3d-gl.js');
  assert.ok(/own \? own\.cast : true/.test(s), '재질이 정한 그림자 설정이 덮어쓰인다');
  assert.ok(/own \? own\.receive : true/.test(s));
});

// ── ⑦ 단계 경계 ────────────────────────────────────────────────────────────

test('㉘ 조명·화각·소품은 그대로 planned 다 — 상태도 승급하지 않았다', () => {
  const d = ROOM_DESIGNS[CR];
  assert.ok(isPlanned(d.lighting), '조명을 건드렸다 (PHASE 5-d.3)');
  assert.ok(isPlanned(d.camera), '화각을 건드렸다 (PHASE 5-d.4)');
  assert.ok(isPlanned(d.accessories));
  assert.equal(d.status, 'planned', '릴리스 판정은 PHASE 5-e 의 몫이다');
});

test('㉙ 유리 파티션은 가구가 아니다 — 가구 배치·라우팅에 섞이지 않았다', () => {
  const lay = layoutRoom('control', BASE, { W: 16000, D: 14000, design: CR });
  for (const it of lay.items) {
    assert.notEqual(it.type, 'partition', '파티션이 가구 배치에 섞였다');
    assert.notEqual(it.asset, 'glassPartition');
  }
  assert.equal(/partition/i.test(src('room-presets.js')), false, '배치 계산이 파티션을 안다');
  assert.equal(/partition/i.test(src('furniture-routing.js')), false, '가구 라우팅이 파티션을 안다');
});

test('㉚ 브리핑 구역 서술이 유리 오른쪽을 정확히 가리킨다', () => {
  const { plan, W, D } = scene(16000, 14000);
  const z = plan.zone;
  assert.equal(z.xFrom, plan.glass.x + GLASS_THK / 2);
  assert.equal(z.xTo, W);
  assert.equal(z.zFrom, FURNITURE.frontClear);
  assert.equal(z.zTo, D);
  assert.equal(z.w, z.xTo - z.xFrom, '구역 폭이 실제 범위와 맞지 않는다');
  assert.ok(z.w >= BRIEF_ZONE_MIN - GLASS_THK);
});


// ── ⑧ 유리를 잡아 주는 프레임 ───────────────────────────────────────────────

test('㉛ 프레임이 유리와 같은 자리에 선다 — 자리를 따로 정하지 않는다', () => {
  const { plan } = scene(16000, 14000);
  const g = plan.glass;
  assert.equal(plan.frames.length, 3, '바닥 트랙 · 상부 헤드레일 · 끝 포스트 셋이어야 한다');
  for (const f of plan.frames) {
    assert.equal(f.x, g.x, `${f.id}: 유리와 다른 x 에 섰다`);
    assert.equal(f.role, 'partitionFrame');
    assert.equal(f.material, 'darkGraphite', '기존 재질이 아닌 것을 썼다');
  }
  const [track, head, post] = plan.frames;
  assert.equal(track.y, 0, '바닥 트랙이 바닥에 있지 않다');
  assert.equal(head.y + head.h, g.h, '헤드레일이 천장에 닿지 않는다');
  assert.equal(track.d, g.d, '트랙 길이가 유리와 다르다');
  assert.equal(post.h, g.h, '포스트가 바닥에서 천장까지 서지 않는다');
  // 포스트는 **열린 쪽(LED 쪽) 끝**을 마감한다 — 거기가 브리핑 구역 출입구다.
  assert.equal(post.z - post.d / 2, g.z - g.d / 2, '포스트가 유리 끝에 있지 않다');
});

test('㉜ 프레임 마감은 콘솔 하부에서 빌려 온다 — 새 색을 고르지 않는다', () => {
  assert.equal(FRAME.finishRole, 'consoleBase');
  const { plan } = scene(16000, 14000);
  for (const f of plan.frames) assert.equal(f.finishRole, 'consoleBase');
  // 렌더러도 그렇게 읽는다.
  const s2 = src('render3d-gl.js');
  assert.ok(/consoleFinishForDesign\(model\.design\)/.test(s2), '렌더러가 콘솔 마감을 빌려 오지 않는다');
  assert.ok(/part\.finishRole \? conFin\?\.\[part\.finishRole\]/.test(s2));
});

test('㉝ 프레임도 가구와 겹치지 않는다', () => {
  for (const [name, W, D] of ROOMS) {
    const { lay, plan } = scene(W, D);
    if (!plan.glass) continue;
    for (const f of plan.frames) {
      for (const it of lay.items) {
        if (NON_OPERATION_TYPES.includes(it.type)) continue;
        const half = halfWidthOf(it);
        if (half === null) continue;
        assert.ok(Math.abs(it.x - f.x) - half - f.w / 2 > 0,
          `${name}: ${f.id} 가 ${it.type} 와 겹친다`);
      }
    }
  }
});

test('㉞ 파티션이 없으면 프레임도 없다', () => {
  const { plan } = scene(8000, 7000);
  assert.equal(plan.glass, null);
  assert.deepEqual([...plan.frames], []);
  assert.deepEqual([...plan.partitions], []);
});
