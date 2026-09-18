// furniture-contracts.test.js — 기업 AV 가구 계약 회귀 테스트 (PHASE 1-c).
// 핵심 규칙
//   (1) 계약은 **런타임 카탈로그와 완전히 분리**된다 — 없는 도형이 '있는 자산'이 되지 않는다.
//   (2) 기존 가구 자산은 하나도 바뀌지 않는다.
//   (3) 디자인이 적어 둔 가구 이름 중 **떠 있는 이름이 하나도 없다.**
//   (4) 계약의 부품 이름이 마감 표(PART_FINISH)와 맞물린다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_CONTRACTS, CONTRACT_IDS, CONTRACT_STATUS, CONTRACT_CATEGORIES,
  INSTANCING_MODES, CONTRACT_ROOMS,
  furnitureContract, hasFurnitureContract, contractAssetIds, contractsForRoom, finishPartFor,
} from '../src/furniture-contracts.js';
import {
  FURNITURE_ASSETS, DIMS, assetFor, assetParts, assetKey,
} from '../src/furniture-assets.js';
import { PART_FINISH, PART_MATERIAL, finishForPart } from '../src/materials.js';
import { ROOM_DESIGNS, DESIGN_IDS, isPlanned } from '../src/room-design.js';

const CHAIRS = ['corporateChair', 'executiveChair', 'conferenceErgoChair', 'taskChair'];
const SURFACES = ['corporateTable', 'boardroomTable', 'largeUTable', 'curvedConsole'];
const AV = ['avCredenza', 'personalMonitor', 'prompter', 'consoleMonitor', 'keyboard'];

// ── A·B·C. 정체성과 치수 ────────────────────────────────────────────────────

test('계약 13종 — 요청한 자산이 모두 있고 id가 겹치지 않는다', () => {
  assert.deepEqual([...CONTRACT_IDS], [...CHAIRS, ...SURFACES, ...AV]);
  assert.equal(CONTRACT_IDS.length, 13);
  assert.equal(new Set(CONTRACT_IDS).size, 13, 'id가 겹친다');
  for (const id of CONTRACT_IDS) {
    const c = FURNITURE_CONTRACTS[id];
    assert.equal(c.id, id, `${id}: id가 열쇠와 다르다`);
    assert.ok(c.label, `${id}: 라벨 필요`);
    assert.ok(CONTRACT_CATEGORIES.includes(c.category), `${id}: 갈래 ${c.category}`);
    assert.ok(c.family, `${id}: family 필요`);
    assert.ok(Object.values(CONTRACT_STATUS).includes(c.status), `${id}: 상태 ${c.status}`);
    assert.ok(INSTANCING_MODES.includes(c.instancing), `${id}: 반복 성격 ${c.instancing}`);
    assert.ok(Number.isInteger(c.phase) && c.phase >= 1, `${id}: 단계 ${c.phase}`);
    assert.ok(c.rooms.length > 0, `${id}: 쓰이는 공간이 없다`);
    for (const r of c.rooms) {
      assert.ok(CONTRACT_ROOMS.includes(r), `${id}: 없는 공간 ${r}`);
      assert.ok(DESIGN_IDS.includes(r), `${id}: 디자인에 없는 공간 ${r}`);
    }
  }
});

test('치수 — 전부 mm 단위의 양수이고 현실적인 범위 안이다', () => {
  for (const id of CONTRACT_IDS) {
    const d = FURNITURE_CONTRACTS[id].dimensions;
    if (d === null) continue;                       // 기존 자산이 치수를 갖고 있는 경우
    for (const [k, v] of Object.entries(d)) {
      assert.ok(Number.isFinite(v) && v > 0, `${id}.${k}: ${v}`);
      // mm 단위 확인 — m(예: 0.45)이나 cm(예: 45)로 잘못 적으면 여기서 걸린다.
      //   각도(tiltDeg)·개수(monitorRow)·인치(nominalInches)는 길이가 아니라 예외다.
      if (/Deg$|Row$|Inches$/.test(k)) continue;
      assert.ok(v >= 20, `${id}.${k}=${v} — mm 라면 너무 작다(m·cm 로 적지 않았는지)`);
      assert.ok(v <= 9000, `${id}.${k}=${v} — 가구 치수로 너무 크다`);
    }
  }
});

// ── D. 의자 4종 ─────────────────────────────────────────────────────────────

test('의자 4종 — 실제 사무가구 범위 안이고 발자국이 있다', () => {
  for (const id of CHAIRS) {
    const c = FURNITURE_CONTRACTS[id];
    const d = c.dimensions;
    assert.equal(c.category, 'chair', id);
    assert.equal(c.instancing, 'instanced', `${id}: 의자는 여러 개 깔린다`);
    // 좌석고는 사람 다리 길이가 정한다 — 공간이 달라도 크게 다를 수 없다.
    assert.ok(d.seatTop >= 430 && d.seatTop <= 480, `${id}: 좌석고 ${d.seatTop}`);
    assert.ok(d.seatW >= 450 && d.seatW <= 560, `${id}: 좌판 폭 ${d.seatW}`);
    assert.ok(d.seatD >= 430 && d.seatD <= 520, `${id}: 좌판 깊이 ${d.seatD}`);
    assert.ok(d.overallW >= 600 && d.overallW <= 740, `${id}: 전체 폭 ${d.overallW}`);
    assert.ok(d.overallD >= 600 && d.overallD <= 760, `${id}: 전체 깊이 ${d.overallD}`);
    assert.ok(d.overallH >= 950 && d.overallH <= 1320, `${id}: 전체 높이 ${d.overallH}`);
    // 5발 받침은 전체 폭을 넘지 않는다(넘으면 옆 의자와 부딪힌다).
    assert.ok(d.casterBase <= d.overallW, `${id}: 받침 ${d.casterBase} > 전체 폭 ${d.overallW}`);
    // 발자국은 전체 치수와 같아야 한다 — 둘이 어긋나면 배치가 겹친다.
    assert.deepEqual({ ...c.footprint }, { w: d.overallW, d: d.overallD },
      `${id}: 발자국이 전체 치수와 다르다`);
  }
  // 오너가 지정한 범위 — 대기업 회의용.
  const co = FURNITURE_CONTRACTS.corporateChair.dimensions;
  assert.ok(co.seatTop >= 440 && co.seatTop <= 460, `corporateChair 좌석고 ${co.seatTop}`);
  assert.ok(co.overallW >= 630 && co.overallW <= 680, `corporateChair 폭 ${co.overallW}`);
  assert.ok(co.overallH >= 980 && co.overallH <= 1080, `corporateChair 높이 ${co.overallH}`);
  assert.ok(!FURNITURE_CONTRACTS.corporateChair.parts.includes('chairHeadrest'),
    'corporateChair 에는 헤드레스트가 없다');
  // 오너가 지정한 범위 — 임원용.
  const ex = FURNITURE_CONTRACTS.executiveChair.dimensions;
  assert.ok(ex.overallW >= 650 && ex.overallW <= 720, `executiveChair 폭 ${ex.overallW}`);
  assert.ok(ex.overallH >= 1150 && ex.overallH <= 1300, `executiveChair 높이 ${ex.overallH}`);
  assert.ok(FURNITURE_CONTRACTS.executiveChair.parts.includes('chairHeadrest'),
    'executiveChair 에는 헤드레스트가 있다');
});

test('의자 4종 — 실루엣이 서로 구분된다(하나로 합쳐지지 않았다)', () => {
  // **멀리서도 갈려야 한다.** 임원 의자는 헤드레스트만큼 확실히 더 높다.
  const H = id => FURNITURE_CONTRACTS[id].dimensions.overallH;
  assert.ok(H('executiveChair') - H('corporateChair') >= 150,
    '임원 의자가 회의용과 높이로 구분되지 않는다');
  assert.ok(H('taskChair') <= H('corporateChair'), '운용자 의자는 회의용보다 크지 않다');
  // 네 의자의 치수 묶음이 전부 서로 달라야 한다 — 같으면 사실상 한 자산이다.
  const sigs = CHAIRS.map(id => JSON.stringify(FURNITURE_CONTRACTS[id].dimensions));
  assert.equal(new Set(sigs).size, 4, '치수가 같은 의자가 있다 — 이름만 다른 셈이다');
  // 계열(family)도 용도에 맞게 갈라 둔다.
  assert.equal(FURNITURE_CONTRACTS.executiveChair.family, 'executiveHighBack');
  assert.equal(FURNITURE_CONTRACTS.taskChair.family, 'operatorTask');
});

// ── E·F. 테이블/콘솔과 반복 성격 ────────────────────────────────────────────

test('테이블·콘솔 4종 — 크기가 방에 따라 정해지는 자산으로 표시된다', () => {
  for (const id of SURFACES) {
    const c = FURNITURE_CONTRACTS[id];
    const d = c.dimensions;
    assert.ok(['sized', 'custom'].includes(c.instancing), `${id}: ${c.instancing}`);
    // 크기가 방마다 다르므로 **고정 발자국을 갖지 않는다.** 대신 최소 치수를 준다.
    assert.equal(c.footprint, null, `${id}: 고정 발자국을 가지면 안 된다`);
    assert.ok(d.minWidth > 0 && d.minDepth > 0, `${id}: 최소 치수가 없다`);
    // 작업면 높이는 사무가구 표준 범위.
    assert.ok(d.surfaceY >= 720 && d.surfaceY <= 750, `${id}: 작업면 ${d.surfaceY}`);
    assert.ok(d.topThk <= 45, `${id}: 상판이 두껍다 ${d.topThk}`);
  }
  // 앉는 의자와 작업면이 맞물린다 — 좌석 윗면에서 250~330mm 위(무릎 여유).
  const gap = (t, ch) => FURNITURE_CONTRACTS[t].dimensions.surfaceY - FURNITURE_CONTRACTS[ch].dimensions.seatTop;
  for (const [t, ch] of [['corporateTable', 'corporateChair'], ['boardroomTable', 'executiveChair'],
    ['largeUTable', 'conferenceErgoChair'], ['curvedConsole', 'taskChair']]) {
    assert.ok(gap(t, ch) >= 250 && gap(t, ch) <= 330, `${t} ↔ ${ch}: 무릎 여유 ${gap(t, ch)}mm`);
  }
  // 임원 테이블과 대회의실 테이블은 **다른 자산**이다(크게 늘린 것이 아니다).
  assert.notEqual(FURNITURE_CONTRACTS.boardroomTable.family, FURNITURE_CONTRACTS.largeUTable.family);
  assert.ok(FURNITURE_CONTRACTS.largeUTable.dimensions.minWidth
    > FURNITURE_CONTRACTS.boardroomTable.dimensions.minWidth, '대회의실이 더 커야 한다');
});

test('반복 성격 — 여러 개 깔리는 자산은 전부 instanced 로 표시된다', () => {
  const REPEATED = [...CHAIRS, 'personalMonitor', 'consoleMonitor', 'keyboard'];
  for (const id of REPEATED) {
    assert.equal(FURNITURE_CONTRACTS[id].instancing, 'instanced', `${id}: 그리기 호출이 폭증한다`);
    assert.ok(FURNITURE_CONTRACTS[id].footprint, `${id}: 반복 배치에는 발자국이 필요하다`);
  }
  // 아주 작은 물건은 부품을 쪼개지 않는다 — 쪼개면 그리기 호출이 그대로 배가 된다.
  assert.equal(FURNITURE_CONTRACTS.keyboard.parts.length, 1, '키보드는 부품 1종이어야 한다');
});

// ── G. AV 장비 ──────────────────────────────────────────────────────────────

test('AV 장비 — 화면 크기를 지어내지 않고 인치만 적는다', () => {
  for (const id of ['personalMonitor', 'prompter', 'consoleMonitor']) {
    const d = FURNITURE_CONTRACTS[id].dimensions;
    // 실제 가로·세로는 monitors.js 의 panelSize() 가 낸다 — 여기서 픽셀 크기를 짓지 않는다.
    assert.ok(d.nominalInches >= 15 && d.nominalInches <= 40, `${id}: ${d.nominalInches}인치`);
    assert.ok(!('panelW' in d) && !('panelH' in d),
      `${id}: 화면 실제 크기를 계약에 적으면 기준이 둘로 갈라진다`);
    assert.ok(FURNITURE_CONTRACTS[id].parts.includes('screen'), `${id}: 화면 부품이 없다`);
  }
  // 콘솔용이 개인용보다 크다.
  assert.ok(FURNITURE_CONTRACTS.consoleMonitor.dimensions.nominalInches
    > FURNITURE_CONTRACTS.personalMonitor.dimensions.nominalInches);
});

test('avCredenza — 이미 있는 자산이고, 치수를 두 번 적지 않는다', () => {
  const c = FURNITURE_CONTRACTS.avCredenza;
  assert.equal(c.status, CONTRACT_STATUS.EXISTING);
  assert.equal(c.sourceAsset, 'avCredenza');
  // **치수를 다시 적지 않는다** — 유일한 기준은 DIMS.avCredenza 다.
  assert.equal(c.dimensions, null, '치수를 두 곳에 적으면 언젠가 어긋난다');
  assert.equal(c.parts, null);
  // 가리키는 런타임 자산이 실제로 있어야 한다.
  assert.ok(FURNITURE_ASSETS[c.sourceAsset], '가리키는 런타임 자산이 없다');
  assert.ok(DIMS.avCredenza, '기존 치수가 사라졌다');
  // '이미 있는 것'은 이 하나뿐이고, 나머지는 전부 아직 도형이 없다.
  const existing = CONTRACT_IDS.filter(id => FURNITURE_CONTRACTS[id].status === CONTRACT_STATUS.EXISTING);
  assert.deepEqual(existing, ['avCredenza'], '계약보다 먼저 있던 자산은 AV 수납장뿐이다');
  // 계약대로 실제 도형까지 만든 것들(PHASE 2-a·2-b·3-a·3-b·4-a·4-b·4-c·5-a).
  const built = CONTRACT_IDS.filter(id => FURNITURE_CONTRACTS[id].status === CONTRACT_STATUS.IMPLEMENTED);
  assert.deepEqual(built, ['corporateChair', 'executiveChair', 'conferenceErgoChair', 'taskChair',
    'corporateTable', 'boardroomTable', 'largeUTable', 'curvedConsole', 'personalMonitor', 'prompter']);
  const BUILT_IDS = ['avCredenza', 'corporateChair', 'executiveChair', 'conferenceErgoChair',
    'taskChair', 'corporateTable', 'boardroomTable', 'largeUTable', 'curvedConsole',
    'personalMonitor', 'prompter'];
  for (const id of CONTRACT_IDS.filter(x => !BUILT_IDS.includes(x))) {
    assert.equal(FURNITURE_CONTRACTS[id].status, CONTRACT_STATUS.CONTRACT_READY, id);
  }
});

// ── H. 마감 표와의 계약 ─────────────────────────────────────────────────────

test('마감 계약 — 부품 이름이 PART_FINISH 와 맞물린다', () => {
  for (const id of CONTRACT_IDS) {
    const c = FURNITURE_CONTRACTS[id];
    if (!c.parts) continue;                         // 기존 자산은 부품을 스스로 정한다
    // 부품 목록과 마감표의 열쇠가 정확히 일치해야 한다(빠뜨린 부품이 없게).
    assert.deepEqual(Object.keys(c.finishParts).sort(), [...c.parts].sort(),
      `${id}: 부품 목록과 마감 지정이 어긋난다`);
    for (const part of c.parts) {
      const finish = finishPartFor(id, part);
      if (finish === null) continue;                // 새 마감 표를 타지 않는다(기존 동작)
      // 가리키는 마감은 **반드시 실재해야** 한다 — 없으면 조용히 기본 재질로 빠진다.
      assert.ok(PART_FINISH[finish], `${id}/${part}: 없는 마감 ${finish}`);
      assert.ok(finishForPart(finish), `${id}/${part}: 마감 ${finish} 가 풀리지 않는다`);
    }
  }
  // 헤드레스트는 **새 재질을 만들지 않고** 방석 마감을 빌려 쓴다.
  assert.equal(finishPartFor('executiveChair', 'chairHeadrest'), 'chairCushion');
  assert.ok(!PART_FINISH.chairHeadrest, '헤드레스트용 마감을 새로 만들면 안 된다');
  // 화면은 실내 마감재가 아니다 — 새 마감 표를 타지 않는다.
  assert.equal(finishPartFor('personalMonitor', 'screen'), null);
  assert.equal(finishPartFor('prompter', 'screen'), null);
  // 모르는 것은 전부 null = 지금 하던 대로.
  assert.equal(finishPartFor('corporateChair', '없는부품'), null);
  assert.equal(finishPartFor('없는자산', 'chairFrame'), null);
  assert.equal(finishPartFor('avCredenza', 'credenzaBody'), null);
});

test('마감 계약 — 기존 부품 이름을 가로채지 않는다', () => {
  // 계약이 새 마감을 지정한 부품 이름이 **기존 가구 부품 이름과 겹치면** 안 된다.
  //   겹치면 PHASE 2에서 이 표를 연결하는 순간 기존 가구의 재질이 바뀐다.
  for (const id of CONTRACT_IDS) {
    const c = FURNITURE_CONTRACTS[id];
    if (!c.finishParts) continue;
    for (const [part, finish] of Object.entries(c.finishParts)) {
      if (finish === null) continue;                // 기존 경로를 그대로 쓰겠다는 뜻이라 무관
      assert.ok(!PART_MATERIAL[part], `${id}: 새 마감이 기존 부품 ${part} 을 가로챈다`);
    }
  }
});

// ── I·J·K. 런타임과의 분리 ─────────────────────────────────────────────────

test('런타임 분리 — 계약이 런타임 카탈로그에 들어가지 않는다', () => {
  // **이것이 PHASE 1-c 의 안전장치다.** 도형이 없는 자산이 런타임 카탈로그에 있으면
  //   배치가 그 이름을 가리켰을 때 렌더러가 '있는 자산'으로 오해한다.
  const BUILT = new Set([CONTRACT_STATUS.EXISTING, CONTRACT_STATUS.IMPLEMENTED]);
  for (const id of CONTRACT_IDS) {
    if (BUILT.has(FURNITURE_CONTRACTS[id].status)) continue;
    assert.equal(FURNITURE_ASSETS[id], undefined, `${id}: 도형도 없이 런타임 카탈로그에 들어갔다`);
  }
  // 반대 방향 — 계약이 있는지와 런타임 자산이 있는지는 별개 질문이다.
  //   임원 의자는 PHASE 3-a 에서 만들어졌으므로 이제 **둘 다** 있다.
  assert.equal(hasFurnitureContract('executiveChair'), true);
  assert.ok(FURNITURE_ASSETS.executiveChair, '임원 의자는 PHASE 3-a 에서 만들어졌다');
  // 임원 U 테이블도 PHASE 3-b 에서 만들어졌다 — 이제 둘 다 있다.
  assert.equal(hasFurnitureContract('boardroomTable'), true);
  assert.ok(FURNITURE_ASSETS.boardroomTable, '임원 U 테이블은 PHASE 3-b 에서 만들어졌다');
  // 아직 안 만든 것으로 같은 질문을 한다 — 계약만 있고 도형은 없어야 한다.
  assert.equal(hasFurnitureContract('largeUTable'), true);
  assert.ok(FURNITURE_ASSETS.largeUTable, '대회의실 U 테이블은 PHASE 4-b 에서 만들어졌다');
  // 운용자 의자는 PHASE 5-a 에서 만들어졌다 — 이제 둘 다 있다.
  assert.equal(hasFurnitureContract('taskChair'), true);
  assert.ok(FURNITURE_ASSETS.taskChair, '운용자 의자는 PHASE 5-a 에서 만들어졌다');
  // 곡선 콘솔은 PHASE 5-b 에서 만들어졌다 — 이제 둘 다 있다.
  assert.equal(hasFurnitureContract('curvedConsole'), true);
  assert.ok(FURNITURE_ASSETS.curvedConsole, '곡선 콘솔은 PHASE 5-b 에서 만들어졌다');
  // 아직 안 만든 것으로 같은 질문을 한다 — 계약만 있고 도형은 없어야 한다.
  assert.equal(hasFurnitureContract('consoleMonitor'), true);
  assert.equal(FURNITURE_ASSETS.consoleMonitor, undefined, 'PHASE 5 전까지는 도형이 없다');
  assert.equal(hasFurnitureContract('conferenceChair'), false, '기존 자산은 계약 대상이 아니다');
  assert.ok(FURNITURE_ASSETS.conferenceChair, '기존 자산은 그대로 있다');
  // 런타임에도 있는 계약 = 만들었다고 표시된 것들뿐이다(PHASE 2-a: 의자 하나가 늘었다).
  const overlap = CONTRACT_IDS.filter(id => FURNITURE_ASSETS[id]);
  assert.deepEqual(overlap, ['corporateChair', 'executiveChair', 'conferenceErgoChair', 'taskChair',
    'corporateTable', 'boardroomTable', 'largeUTable', 'curvedConsole', 'avCredenza',
    'personalMonitor', 'prompter']);
  for (const id of overlap) {
    assert.ok(BUILT.has(FURNITURE_CONTRACTS[id].status), `${id}: 런타임에 있는데 '아직 없음'으로 적혀 있다`);
  }
});

test('기존 가구 무변경 — 카탈로그·치수·부품·묶음 열쇠가 그대로다', () => {
  // 런타임 자산 목록. **기존 것은 순서까지 그대로**이고 새로 만든 것만 제자리에 끼어든다.
  assert.deepEqual(Object.keys(FURNITURE_ASSETS), [
    'conferenceChair', 'corporateChair', 'executiveChair', 'conferenceErgoChair', 'taskChair',
    'auditoriumChair', 'trainingChair', 'trainingDesk',
    'controlConsole', 'curvedConsole', 'podium', 'avCredenza', 'highTable', 'stool', 'loungeChair', 'collabTable',
    'seatedPerson', 'mobileStand', 'conferenceTable', 'corporateTable', 'boardroomTable',
    'largeUTable', 'personalMonitor', 'prompter',
  ]);
  // 배치 type → 자산 대응이 그대로다(새 계약이 끼어들지 않았다).
  assert.equal(assetFor({ type: 'chair' }), 'conferenceChair');
  assert.equal(assetFor({ type: 'table' }), 'conferenceTable');
  assert.equal(assetFor({ type: 'console' }), 'controlConsole');
  assert.equal(assetFor({ type: 'seat' }), 'auditoriumChair');
  assert.equal(assetFor({ type: 'credenza' }), 'avCredenza');
  // **계약 이름을 가리켜도 런타임 자산이 없으므로 기존 fallback 이 그대로 작동한다.**
  //   조용히 엉뚱한 가구가 되지 않는다.
  for (const id of CONTRACT_IDS.filter(x => !FURNITURE_ASSETS[x])) {
    assert.equal(assetFor({ type: 'chair', asset: id }), 'conferenceChair',
      `${id}: 없는 자산을 가리키면 기존 의자로 되돌아가야 한다`);
  }
  assert.equal(assetKey({ type: 'chair' }), 'conferenceChair');
  // 임원 의자는 이제 실재하므로 제 이름으로 묶인다(아직 없는 계약 이름은 여전히 기존 의자로).
  assert.equal(assetKey({ type: 'chair', asset: 'executiveChair' }), 'executiveChair');
  assert.equal(assetKey({ type: 'chair', asset: 'consoleMonitor' }), 'conferenceChair');
  // 기존 의자 부품 수·좌석고가 그대로다.
  assert.equal(assetParts({ type: 'chair' }).length, 9);
  assert.equal(DIMS.conferenceChair.seatTop, 450);
  assert.equal(DIMS.avCredenza.h, 700);
});

// ── L·M. 순수성과 불변성 ────────────────────────────────────────────────────

test('순수 유지 — 계약 파일은 아무것도 import 하지 않는다', () => {
  const src = readFileSync(new URL('../src/furniture-contracts.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(src), false, 'furniture-contracts.js 는 독립이어야 한다');
  assert.equal(/\bTHREE\b|document\.|canvas/i.test(src.replace(/\/\/.*$/gm, '')), false,
    'Three.js·DOM 을 쓰면 Node 에서 검사할 수 없다');
});

test('불변 데이터 — 계약 표를 밖에서 고칠 수 없다', () => {
  const frozen = (v, path) => {
    if (!v || typeof v !== 'object') return;
    assert.ok(Object.isFrozen(v), `${path} 가 얼어 있지 않다`);
    for (const [k, x] of Object.entries(v)) frozen(x, `${path}.${k}`);
  };
  frozen(FURNITURE_CONTRACTS, 'FURNITURE_CONTRACTS');
  assert.ok(Object.isFrozen(CONTRACT_IDS) && Object.isFrozen(CONTRACT_STATUS));
  assert.ok(Object.isFrozen(contractsForRoom('corporateMeeting')));
});

test('조회 API — 없는 이름은 전부 null/false 로 답한다', () => {
  assert.equal(furnitureContract('corporateChair').id, 'corporateChair');
  for (const bad of ['없는자산', '', null, undefined, 0, 'CorporateChair']) {
    assert.equal(furnitureContract(bad), null, String(bad));
    assert.equal(hasFurnitureContract(bad), false, String(bad));
  }
  assert.deepEqual(contractAssetIds(), CONTRACT_IDS);
  assert.deepEqual(contractsForRoom('corporateMeeting').map(c => c.id),
    ['corporateChair', 'corporateTable', 'avCredenza']);
  assert.deepEqual(contractsForRoom('controlRoom').map(c => c.id),
    ['taskChair', 'curvedConsole', 'consoleMonitor', 'keyboard']);
  assert.deepEqual(contractsForRoom('없는공간').map(c => c.id), []);
  // 네 공간이 **서로 다른 가구**를 쓴다 — 이것이 이번 단계의 목적이다.
  const chairOf = room => contractsForRoom(room).filter(c => c.category === 'chair').map(c => c.id);
  assert.deepEqual(chairOf('corporateMeeting'), ['corporateChair']);
  assert.deepEqual(chairOf('executiveBoardroom'), ['executiveChair']);
  assert.deepEqual(chairOf('largeConference'), ['conferenceErgoChair']);
  assert.deepEqual(chairOf('controlRoom'), ['taskChair']);
});

// ── G(요구사항 32). 디자인이 적어 둔 이름 계약 ──────────────────────────────

test('가구 이름 계약 — 디자인이 가리키는 가구 이름에 떠 있는 것이 하나도 없다', () => {
  // 디자인 선언의 `furniture` 칸에 적힌 이름은 PHASE 2 이후 그대로 쓰인다.
  //   그때 "그런 가구 없음"이 되면 조용히 기존 의자로 빠진다 — 지금 막아 둔다.
  const names = [];
  const walk = v => {
    if (!v) return;
    if (isPlanned(v)) { names.push(v.planned); return; }
    if (typeof v === 'string') { names.push(v); return; }
    if (typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  for (const id of DESIGN_IDS) walk(ROOM_DESIGNS[id].furniture);
  assert.ok(names.length >= 11, `검사할 가구 이름이 너무 적다 (${names.length})`);

  for (const n of names) {
    const runtime = !!FURNITURE_ASSETS[n];
    const contract = hasFurnitureContract(n);
    assert.ok(runtime || contract,
      `디자인이 가리키는 가구 '${n}' 이 런타임 자산도 계약도 아니다 — 떠 있는 이름`);
  }
  // 오너가 지정한 이름이 전부 들어 있는지 개별 확인.
  for (const n of ['executiveChair', 'boardroomTable', 'avCredenza',
    'conferenceErgoChair', 'largeUTable', 'personalMonitor', 'prompter',
    'taskChair', 'curvedConsole', 'consoleMonitor', 'keyboard']) {
    assert.ok(names.includes(n), `디자인 선언에 ${n} 이 없다`);
    assert.ok(FURNITURE_ASSETS[n] || hasFurnitureContract(n), `${n}: 해석되지 않는다`);
  }
});

test('대기업 회의실 — 가구·마감·조명·화각을 정하고 벽 구성·소품은 그대로다(PHASE 2-d.2)', () => {
  const f = ROOM_DESIGNS.corporateMeeting.furniture;
  assert.deepEqual({ ...f }, { chair: 'corporateChair', table: 'corporateTable' });
  // `planned(...)` 가 아니라 **맨 문자열** — 실제로 만들었다는 뜻이다.
  assert.equal(typeof f.chair, 'string');
  assert.equal(typeof f.table, 'string');
  assert.ok(FURNITURE_ASSETS.corporateChair && FURNITURE_ASSETS.corporateTable, '도형이 실제로 있다');
  // 벽 구성·소품은 여전히 INHERIT = 기존 그대로.
  for (const k of ['wallTreatment', 'accessories']) {
    assert.equal(ROOM_DESIGNS.corporateMeeting[k], null, `${k} 는 아직 건드리지 않는다`);
  }
});
