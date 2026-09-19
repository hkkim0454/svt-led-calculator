// accessories-contract.test.js — 릴리스된 소품(화분·서 있는 사람)의 계약. (PHASE 6-a, DEC-126)
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 6-0 감사에서 드러난 사실이 이 파일의 출발점이다.
//   **화분과 사람은 '앞으로 넣을 것'이 아니라 이미 들어 있고, 릴리스된 화면의 일부다.**
//   회의실 3종은 화분이 기본으로 켜져 있고, 서 있는 사람은 네 공간 모두 켜져 있다.
//   그래서 오너는 (2026-09-19, DEC-126) **지금의 기본값 자체를 동결 V1 의 일부로** 확정했다.
//
// 여기서 지키는 것.
//   ① 기본값 고정 — 이 값이 바뀌면 릴리스된 네 공간의 동결 화면이 바뀐다.
//   ② 옛 저장값 복원 — 항목이 없던 시절 저장한 구성도 반드시 '사람 켬'으로 돌아온다.
//   ③ 소품이 건축을 밀지 않는다 — 화분은 좌석·유리 파티션·카메라를 움직이지 못한다.
//   ④ 범위 — 이번 단계는 이름과 저장만 더한다. 새 소품·새 재질·새 토글을 만들지 않았다.
//
// "default OFF" 규칙은 **앞으로 새로 더하는 소품에만** 적용한다. 이미 릴리스된 소품을
//   소급해서 끄면 동결 픽셀이 깨지므로, 그것은 이 파일이 막는 대상이다.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { ROOM_TYPES, defaultOptions, normalizeOptions, layoutRoom, PERSON_BLOCKING, personSpot }
  from '../src/room-presets.js';
import { CONFIG_DEFAULTS, normalizeConfig } from '../src/config.js';
import { MATERIAL_IDS, PART_MATERIAL } from '../src/materials.js';
import { ROOM_DESIGNS, DESIGN_STATUS, isPlanned } from '../src/room-design.js';
import { NON_OPERATION_TYPES, controlWallPlan } from '../src/control-walls.js';
import { FURNITURE_ASSETS } from '../src/furniture-assets.js';

const src = f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
/** 주석을 지운 소스 — 설명 글에 적힌 낱말이 검사에 걸리지 않게 한다. */
const code = f => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── ① 릴리스된 기본값 ────────────────────────────────────────────────────────

test('① 화분 기본값이 릴리스된 그대로다 — 이 값이 동결 V1 화면을 정한다', () => {
  // 회의실 = 대기업·임원·대회의실 세 디자인이 함께 쓰는 용도다. 셋 다 화분이 켜져 있다.
  assert.equal(defaultOptions('meeting').plant, true, '회의실 화분이 꺼졌다 — 동결 화면이 바뀐다');
  // 상황실은 관제 공간이라 꺼져 있다.
  assert.equal(defaultOptions('control').plant, false, '상황실 화분이 켜졌다 — 동결 화면이 바뀐다');
  // 나머지 용도도 지금 값을 그대로 지킨다.
  assert.equal(defaultOptions('classroom').plant, false);
  assert.equal(defaultOptions('ideation').plant, true);
  for (const id of ['hall_s', 'hall_m', 'hall_l']) {
    assert.equal(defaultOptions(id).plant, false, `${id}: 강당 화분 기본값이 바뀌었다`);
  }
});

test('② 서 있는 사람은 기본으로 켜져 있다 — 네 공간 모두 이 상태로 릴리스됐다', () => {
  assert.equal(CONFIG_DEFAULTS.person3d, true, '축척 인물 기본값이 꺼졌다 — 동결 화면이 바뀐다');
  // 화면 표시 상태의 출발값도 같아야 한다(둘이 어긋나면 첫 화면과 저장본이 달라진다).
  const app = code('app.js');
  assert.ok(/const pv3dShow\s*=\s*\{[\s\S]{0,200}?person:\s*true/.test(app),
    'app.js 의 3D 표시 출발값에서 사람이 켜져 있지 않다');
  // 화면의 토글 버튼도 켠 상태로 시작한다.
  assert.ok(/class="pvTog on"\s+data-t3d="person"/.test(src('index.html')),
    '사람 토글 버튼이 꺼진 채로 시작한다');
});

// ── ② 옛 저장값 복원 ─────────────────────────────────────────────────────────

test('③ 항목이 없던 시절의 저장값도 **사람 켬**으로 복원된다', () => {
  // PHASE 6-a 이전에 저장한 구성에는 person3d 칸이 아예 없다.
  assert.equal(normalizeConfig({ spaceW: 6000 }).person3d, true, '옛 저장값이 사람을 끈 채로 복원된다');
  assert.equal(normalizeConfig({}).person3d, true);
  assert.equal(normalizeConfig(null).person3d, true);
  // 값이 아닌 것이 들어와도 릴리스된 동작(켬)으로 떨어진다.
  for (const v of ['false', 0, 1, null, undefined, {}, []]) {
    assert.equal(normalizeConfig({ person3d: v }).person3d, true, `${JSON.stringify(v)}: 켬으로 떨어지지 않는다`);
  }
  // 사용자가 **일부러 끈 것**은 그대로 지킨다.
  assert.equal(normalizeConfig({ person3d: false }).person3d, false, '끈 선택이 되살아난다');
});

test('④ 화면이 저장·복원을 실제로 연결한다 — 규격만 있고 쓰지 않으면 소용없다', () => {
  const app = code('app.js');
  assert.ok(/person3d:\s*pv3dShow\.person/.test(app), 'gatherConfig 가 사람 상태를 담지 않는다');
  assert.ok(/pv3dShow\.person\s*=\s*c\.person3d/.test(app), 'applyConfig 가 사람 상태를 되돌리지 않는다');
  assert.ok(/data-t3d="person"[\s\S]{0,80}?classList\.toggle\('on'/.test(app),
    '복원할 때 버튼 표시가 같이 바뀌지 않는다');
  // **토글을 눌렀을 때 실제로 저장되어야 한다.** 규격·복원만 있고 저장을 부르지 않으면
  //   껐다가 새로고침했을 때 도로 켜진다(첫 QA 에서 실제로 그랬다).
  const h = app.match(/button\[data-t3d\][\s\S]*?\n\}\);/);
  assert.ok(h, '3D 토글 처리 자리를 찾지 못했다');
  assert.ok(/k === 'person'[\s\S]{0,120}?saveLastSession\(\)/.test(h[0]),
    '사람 토글을 눌러도 저장되지 않는다');
});

// ── ③ 소품은 건축을 밀지 않는다 ──────────────────────────────────────────────

test('⑤ 화분은 좌석을 줄이지 않고, 가구가 다 놓인 뒤에 들어간다', () => {
  for (const [type, design] of [['meeting', 'corporateMeeting'], ['meeting', 'largeConference'], ['control', 'controlRoom']]) {
    const base = { ...defaultOptions(type), plant: false };
    const withPlant = { ...defaultOptions(type), plant: true };
    const a = layoutRoom(type, base, { W: 14000, D: 12000, design });
    const b = layoutRoom(type, withPlant, { W: 14000, D: 12000, design });
    const 셈 = items => items.filter(i => i.type !== 'plant').length;
    assert.equal(셈(b.items), 셈(a.items), `${design}: 화분이 다른 가구 수를 바꿨다`);
    // 화분 말고는 좌표가 한 개도 달라지지 않는다.
    const 좌표 = items => JSON.stringify(items.filter(i => i.type !== 'plant')
      .map(i => [i.type, i.x, i.z, i.y || 0, i.rotY || 0]));
    assert.equal(좌표(b.items), 좌표(a.items), `${design}: 화분이 다른 가구를 밀었다`);
    assert.equal(b.items.filter(i => i.type === 'plant').length, 1, `${design}: 화분이 1개가 아니다`);
  }
});

test('⑥ 화분은 상황실 유리 파티션을 밀지 못한다', () => {
  const W = 16000, D = 14000, H = 3900;
  const 없이 = layoutRoom('control', { ...defaultOptions('control'), plant: false }, { W, D, design: 'controlRoom' });
  const 함께 = layoutRoom('control', { ...defaultOptions('control'), plant: true }, { W, D, design: 'controlRoom' });
  const plan = items => controlWallPlan({ W, D, H, design: 'controlRoom', items });
  const a = plan(없이.items), b = plan(함께.items);
  assert.equal(JSON.stringify(b.partitions), JSON.stringify(a.partitions), '화분이 칸막이를 움직였다');
  // 그 이유가 우연이 아니라 규칙이라는 것을 함께 고정한다.
  assert.ok(NON_OPERATION_TYPES.includes('plant'), '화분이 운용 구역 계산에서 빠지지 않는다');
});

test('⑦ 카메라는 소품을 아예 보지 않는다 — 소품 때문에 구도가 흔들릴 수 없다', () => {
  // 구도를 잡을 때 읽는 배치 항목 종류를 고정한다. 여기에 소품이 들어오면 카메라가 따라 움직인다.
  const t = code('gl-model.js');
  const m = t.match(/function framingFields\(items\)[\s\S]*?\n}/);
  assert.ok(m, '구도 항목을 모으는 자리를 찾지 못했다');
  assert.equal(/'plant'|"plant"|'person'|"person"|'seated'|"seated"/.test(m[0]), false,
    '카메라가 소품을 구도 대상으로 읽는다');
});

test('⑧ 사람은 가구를 뚫고 서지 않는다 — 화분도 피한다', () => {
  assert.ok(PERSON_BLOCKING.has('plant'), '사람이 화분을 피하지 않는다');
  const lay = layoutRoom('meeting', defaultOptions('meeting'), { W: 10000, D: 10000, design: 'corporateMeeting' });
  const spot = personSpot({ W: 10000, D: 10000 }, { x: 2000, w: 6000 }, lay.items);
  for (const it of lay.items) {
    if (!PERSON_BLOCKING.has(it.type)) continue;
    const hw = (it.w || 700) / 2 + 450, hd = (it.d || 700) / 2 + 450;
    assert.ok(Math.abs(it.x - spot.x) >= hw || Math.abs(it.z - spot.z) >= hd,
      `사람이 ${it.type} 위에 섰다`);
  }
});

// ── ④ 이번 단계의 범위 ───────────────────────────────────────────────────────

test('⑨ 화분 부품에 이름이 있다 — 검사 도구가 화분을 셀 수 있다', () => {
  const t = code('furniture-gl.js');
  const m = t.match(/function plantMesh\(mat, geoCache\)[\s\S]*?\n}/);
  assert.ok(m, '화분을 만드는 자리를 찾지 못했다');
  assert.ok(/pot\.name\s*=\s*'plantPot'/.test(m[0]), '화분 몸통에 이름이 없다');
  assert.ok(/leaf\.name\s*=\s*'plantLeaf'/.test(m[0]), '잎에 이름이 없다');
  // 이름은 **부품 종류 이름 그대로**여야 한다 — 색·재질 대응표가 쓰는 이름과 같아야
  //   나중에 마감을 갈아 끼울 때 이름이 두 벌로 갈리지 않는다.
  assert.equal(PART_MATERIAL.plantPot, 'paintedWall', '화분 몸통 재질 대응이 바뀌었다');
  // 그림자 예외 목록에 걸리는 이름을 쓰면 화면이 달라진다 — 걸리지 않는 것을 확인한다.
  const gl = code('render3d-gl.js');
  const no = gl.match(/const NO_CAST = new Set\(\[[^\]]*\]\);\s*const NO_RECEIVE = new Set\(\[[^\]]*\]\);/);
  assert.ok(no, '그림자 예외 목록을 찾지 못했다');
  assert.equal(/plant/.test(no[0]), false, '화분 이름이 그림자 예외 목록에 걸린다 — 화면이 달라진다');
});

test('⑩ 이번 단계는 소품을 **더하지 않았다** — 새 자산·새 재질·새 토글이 없다', () => {
  // 정식 재질은 13종 그대로다.
  assert.equal(MATERIAL_IDS.length, 13, `정식 재질이 ${MATERIAL_IDS.length}종이 됐다`);
  // 소품 자산을 새로 등록하지 않았다. 지금 있는 인물 자산은 강당용 착석 인원 하나뿐이다.
  //   `personalMonitor` 는 개인 모니터(AV 장비)라 인물이 아니다 — 이름만 보고 세지 않는다.
  const 사람자산 = Object.keys(FURNITURE_ASSETS)
    .filter(k => /person|people|human|figure|avatar/i.test(k) && !/^personal/.test(k));
  assert.deepEqual(사람자산, ['seatedPerson'], `인물 자산이 늘었다: ${사람자산.join(', ')}`);
  const 소품자산 = Object.keys(FURNITURE_ASSETS).filter(k => /plant|decor|prop|accessor/i.test(k));
  assert.deepEqual(소품자산, [], `소품 자산이 늘었다: ${소품자산.join(', ')}`);
  // 새 화면 토글을 만들지 않았다 — 소품 관련 토글은 기존 둘(방 옵션 화분 · 3D 사람)뿐이다.
  const html = src('index.html');
  const t3d = [...html.matchAll(/data-t3d="([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual([...new Set(t3d)], ['accentWall', 'ceiling', 'dims', 'grid', 'person', 'viewAngle'],
    '3D 표시 토글 구성이 바뀌었다');
});

test('⑪ 디자인의 `accessories` 칸은 계속 잠들어 있다 — 이번 단계에서 켜지 않았다', () => {
  // 이 칸을 읽는 그리기 코드가 여전히 한 곳도 없어야 한다.
  const 대상 = readdirSync(new URL('../src/', import.meta.url))
    .filter(f => f.endsWith('.js') && f !== 'room-design.js');
  for (const f of 대상) {
    assert.equal(/accessor/i.test(code(f)), false, `${f}: 소품 선언을 읽기 시작했다`);
  }
  // 소품을 정하지 않은 세 디자인은 계속 planned 표시다.
  for (const id of ['executiveBoardroom', 'largeConference', 'controlRoom']) {
    assert.equal(isPlanned(ROOM_DESIGNS[id].accessories), true, `${id}: 소품이 planned 가 아니다`);
  }
  // 릴리스된 네 공간의 상태는 그대로 ready 다.
  for (const id of ['corporateMeeting', 'executiveBoardroom', 'largeConference', 'controlRoom']) {
    assert.equal(ROOM_DESIGNS[id].status, DESIGN_STATUS.READY, `${id}: 상태가 바뀌었다`);
  }
});

test('⑫ 소품 배치는 이번 단계에서 한 값도 바뀌지 않았다', () => {
  // 화분은 예전 그대로 **뒤쪽 오른쪽 모서리 한 자리**다(자리를 고르는 계획기를 만들지 않았다).
  const t = code('room-presets.js');
  assert.ok(/items\.push\(\{ type: 'plant', x: W - FURNITURE\.wallClear \/ 1\.6, z: D - FURNITURE\.wallClear \/ 1\.6, rotY: 0 \}\)/.test(t),
    '화분 자리 계산이 달라졌다');
  // 실제 좌표로도 확인한다(식만 보면 상수가 바뀐 것을 놓친다).
  const lay = layoutRoom('meeting', defaultOptions('meeting'), { W: 10000, D: 10000, design: 'corporateMeeting' });
  const plant = lay.items.find(i => i.type === 'plant');
  assert.deepEqual([plant.x, plant.z, plant.rotY], [9500, 9500, 0], '화분 좌표가 달라졌다');
  // 소품 계획기를 만들지 않았다.
  const 파일 = readdirSync(new URL('../src/', import.meta.url));
  assert.equal(파일.some(f => /accessor/i.test(f)), false, '소품 모듈이 생겼다');
});

test('⑬ 옵션 정규화가 화분 값을 잃지 않는다 — 저장·복원을 오가도 그대로다', () => {
  for (const type of ROOM_TYPES.map(t => t.id)) {
    const d = defaultOptions(type);
    if (!('plant' in d)) continue;
    assert.equal(normalizeOptions(type, { ...d, plant: true }).plant, true, `${type}: 켠 화분이 꺼진다`);
    assert.equal(normalizeOptions(type, { ...d, plant: false }).plant, false, `${type}: 끈 화분이 켜진다`);
    // 값이 없으면 그 용도의 기본값으로 떨어진다(릴리스된 동작).
    assert.equal(normalizeOptions(type, {}).plant, d.plant, `${type}: 빈 값이 기본값으로 안 간다`);
  }
});
