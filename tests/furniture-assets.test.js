// furniture-assets.test.js — 가구 에셋 카탈로그 회귀 테스트.
// 핵심 규칙: (1) 실제 가구 비율을 벗어나지 않는다 (2) 부품이 바닥을 뚫지 않는다
//            (3) 배치 결과(room-presets)와 자산이 빠짐없이 연결된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FURNITURE_ASSETS, FURNITURE_COLORS, DIMS, V1_ASSET_IDS,
  assetFor, assetParts, assetKey,
  createConferenceChair, createAuditoriumChair, createTrainingChair,
  createTrainingDesk, createConferenceTable, createAvCredenza,
} from '../src/furniture-assets.js';
import { layoutRoom, ROOM_TYPES, defaultOptions } from '../src/room-presets.js';

// 부품 하나가 차지하는 y 구간 [아래, 위]. 기울기가 있으면 회전 후 높이로 계산한다.
function yRange(p) {
  const a = Math.abs((p.tiltX || 0) * Math.PI / 180);
  const h = p.shape === 'cyl' ? p.h : p.h;
  const d = p.shape === 'cyl' ? p.r * 2 : p.d;
  const half = (h * Math.cos(a) + d * Math.sin(a)) / 2;
  return [p.y - half, p.y + half];
}

function assertSaneParts(parts, label) {
  assert.ok(Array.isArray(parts) && parts.length > 0, `${label}: 부품이 있어야 한다`);
  for (const p of parts) {
    assert.ok(FURNITURE_COLORS[p.kind], `${label}: 색이 없는 부품 kind=${p.kind}`);
    assert.ok(['box', 'cyl'].includes(p.shape), `${label}: 원시 도형은 box/cyl만`);
    const nums = p.shape === 'cyl' ? [p.r, p.h] : [p.w, p.h, p.d];
    for (const n of [...nums, p.dx, p.y, p.dz]) {
      assert.ok(Number.isFinite(n), `${label}: 숫자가 아닌 치수 (kind=${p.kind})`);
    }
    for (const n of nums) assert.ok(n > 0, `${label}: 0 이하 치수 (kind=${p.kind})`);
    assert.ok(yRange(p)[0] >= -1, `${label}: 부품이 바닥을 뚫는다 (kind=${p.kind})`);
  }
}

test('V1 가구 자산 — 4종(+강의용 의자)이 카탈로그에 모두 있다', () => {
  for (const id of V1_ASSET_IDS) {
    const a = FURNITURE_ASSETS[id];
    assert.ok(a, `${id} 자산이 없다`);
    assert.ok(a.label, `${id}: 라벨이 필요하다`);
    assert.equal(a.id, id);
    assert.ok(typeof a.build === 'function' || typeof a.spec === 'function', `${id}: 생성 함수가 필요하다`);
  }
  assert.deepEqual(V1_ASSET_IDS.slice(0, 4),
    ['auditoriumChair', 'conferenceChair', 'conferenceTable', 'trainingDesk']);
});

test('회의용 회전의자 — 좌석고·폭·깊이가 실제 범위(430~470 / 450~520 / 430~500) 안에 있다', () => {
  const S = DIMS.conferenceChair;
  assert.ok(S.seatTop >= 430 && S.seatTop <= 470, `좌석고 ${S.seatTop}`);
  assert.ok(S.seatW >= 450 && S.seatW <= 520, `좌판 폭 ${S.seatW}`);
  assert.ok(S.seatD >= 430 && S.seatD <= 500, `좌판 깊이 ${S.seatD}`);
  assert.ok(S.seatThk >= 50, `좌판 두께가 너무 얇다 ${S.seatThk}`);
  assert.ok(S.backTilt > 0, '등받이는 뒤로 젖혀져 있어야 한다');
  assertSaneParts(createConferenceChair(), 'conferenceChair');
});

test('회의용 회전의자 — 좌판 위에 등받이가 있고, 팔걸이가 좌석 피치(700mm)를 넘지 않는다', () => {
  const S = DIMS.conferenceChair;
  const parts = createConferenceChair();
  const seat = parts.find(p => p.kind === 'chairSeat');
  const back = parts.find(p => p.kind === 'chairBack');
  assert.ok(yRange(back)[0] > yRange(seat)[1] - 1, '등받이 아래가 좌판 위에 있어야 한다');
  assert.ok(Math.abs(back.tiltX) === S.backTilt);

  const widest = Math.max(...parts.filter(p => p.shape === 'box')
    .map(p => Math.abs(p.dx) + p.w / 2)) * 2;
  assert.ok(widest <= 700, `의자 폭 ${widest}mm 가 좌석 간격 700mm 를 넘는다`);
});

test('강당 고정 객석 — 좌석 피치 550mm 안에 들어가고 등받이가 실제 높이다', () => {
  const S = DIMS.auditoriumChair;
  const parts = createAuditoriumChair();
  assertSaneParts(parts, 'auditoriumChair');
  const widest = Math.max(...parts.map(p => Math.abs(p.dx) + p.w / 2)) * 2;
  assert.ok(widest <= 550, `객석 폭 ${widest}mm 가 좌석 피치 550mm 를 넘는다`);
  assert.ok(S.backTopY >= 900 && S.backTopY <= 1150, `등받이 상단 ${S.backTopY}`);
  assert.ok(S.backTilt >= 12, '극장 의자는 사무 의자보다 더 젖혀진다');
  const depth = Math.max(...parts.map(p => Math.abs(p.dz) + p.d / 2)) * 2;
  assert.ok(depth <= 950, `객석 깊이 ${depth}mm 가 앞뒤 간격 950mm 를 넘는다`);
});

test('강의용 의자 — 4다리이고 팔걸이가 없다', () => {
  const parts = createTrainingChair();
  assertSaneParts(parts, 'trainingChair');
  const legs = parts.filter(p => p.kind === 'seatFrame' && p.y < DIMS.trainingChair.seatTop / 2);
  assert.equal(legs.length, 4, '다리는 4개');
  assert.equal(parts.filter(p => p.kind.endsWith('Arm')).length, 0, '팔걸이 없음');
  const S = DIMS.trainingChair;
  assert.ok(S.seatTop >= 430 && S.seatTop <= 470, `좌석고 ${S.seatTop}`);
});

test('강의용 책상 — 상판이 얇고(≤30mm) 높이가 720~750이며 다리 4개 + 가림판이 있다', () => {
  const S = DIMS.trainingDesk;
  assert.ok(S.topThk <= 30, `상판 두께 ${S.topThk}`);
  assert.ok(S.surfaceY >= 720 && S.surfaceY <= 750, `책상 높이 ${S.surfaceY}`);
  const parts = createTrainingDesk(1400, 600);
  assertSaneParts(parts, 'trainingDesk');
  assert.equal(parts.filter(p => p.kind === 'deskLeg').length, 4);
  assert.equal(parts.filter(p => p.kind === 'deskPanel').length, 1);
  const top = parts.find(p => p.kind === 'deskTop');
  assert.equal(yRange(top)[1], S.surfaceY, '상판 윗면이 정확히 책상 높이여야 한다');
  // 부품이 책상 크기를 벗어나지 않는다.
  for (const p of parts) {
    assert.ok(Math.abs(p.dx) + p.w / 2 <= 1400 / 2 + 1, `가로 초과 ${p.kind}`);
    assert.ok(Math.abs(p.dz) + p.d / 2 <= 600 / 2 + 1, `깊이 초과 ${p.kind}`);
  }
});

test('회의 테이블 — 상판(얇음) + 다리/받침 구조이고 높이가 720~750이다', () => {
  for (const shape of ['rect', 'boat', 'round']) {
    const S = createConferenceTable({ shape, w: 2800, d: 1300 });
    assert.equal(S.shape, shape);
    assert.ok(S.surfaceY >= 720 && S.surfaceY <= 750, `${shape}: 높이 ${S.surfaceY}`);
    assert.ok(S.topThk <= 40, `${shape}: 상판이 두껍다 ${S.topThk}`);
    assert.equal(S.topBottom, S.surfaceY - S.topThk);
    if (shape === 'round') {
      assert.ok(S.post && S.foot, 'round: 기둥 + 받침');
      assert.ok(S.post.y1 === S.topBottom, 'round: 기둥이 상판 아래까지 닿는다');
      assert.equal(S.legs.length, 0);
    } else {
      assert.equal(S.legs.length, 2, `${shape}: T형 받침 2개`);
      assert.ok(S.beam, `${shape}: 보강대`);
      for (const leg of S.legs) {
        assert.ok(leg.post.y1 === S.topBottom, '기둥이 상판 아래까지 닿는다');
        assert.ok(Math.abs(leg.dx) + leg.foot.w / 2 <= 2800 / 2, '받침이 상판 밖으로 나가지 않는다');
      }
    }
  }
  // 아주 작은 테이블이라도 무너지지 않는다.
  const tiny = createConferenceTable({ shape: 'rect', w: 100, d: 100 });
  assert.ok(tiny.w >= 400 && tiny.d >= 400, '최소 크기로 보정');
});

test('자산 연결 — 배치 type이 빠짐없이 자산으로 이어진다', () => {
  assert.equal(assetFor({ type: 'seat' }), 'auditoriumChair');
  assert.equal(assetFor({ type: 'chair' }), 'conferenceChair');
  assert.equal(assetFor({ type: 'chair', asset: 'trainingChair' }), 'trainingChair');
  assert.equal(assetFor({ type: 'desk' }), 'trainingDesk');
  assert.equal(assetFor({ type: 'table' }), 'conferenceTable');
  assert.equal(assetFor({ type: 'rug' }), null);
  // 없는 자산 이름은 무시하고 type으로 되돌아간다(가짜 자산 금지).
  assert.equal(assetFor({ type: 'chair', asset: '없는자산' }), 'conferenceChair');
  // 테이블은 부품 목록이 아니라 구성 명세로 만든다.
  assert.equal(assetParts({ type: 'table' }), null);
  assert.equal(assetKey({ type: 'table', w: 1, d: 1 }), null);
});

test('InstancedMesh 묶음 열쇠 — 같은 의자는 한 묶음, 크기가 다른 책상은 따로', () => {
  assert.equal(assetKey({ type: 'seat', x: 0, z: 0 }), assetKey({ type: 'seat', x: 9, z: 9 }));
  assert.equal(assetKey({ type: 'chair' }), 'conferenceChair');
  assert.equal(assetKey({ type: 'chair', asset: 'trainingChair' }), 'trainingChair');
  assert.notEqual(assetKey({ type: 'chair' }), assetKey({ type: 'chair', asset: 'trainingChair' }));
  assert.equal(assetKey({ type: 'desk', w: 1400, d: 600 }), 'trainingDesk:1400x600');
  assert.notEqual(assetKey({ type: 'desk', w: 1400, d: 600 }), assetKey({ type: 'desk', w: 1600, d: 600 }));
});

test('배치 결과 연결 — 6개 공간 타입의 모든 물건이 자산이나 단품으로 처리된다', () => {
  const SINGLES = new Set(['table', 'plant', 'rug', 'riser', 'stage']);
  for (const t of ROOM_TYPES) {
    const res = layoutRoom(t.id, defaultOptions(t.id), { W: 12000, D: 14000 });
    assert.ok(res.items.length > 0, `${t.id}: 배치가 비었다`);
    for (const it of res.items) {
      if (SINGLES.has(it.type)) continue;
      const parts = assetParts(it);
      assert.ok(parts, `${t.id}: ${it.type} 을(를) 세울 자산이 없다`);
      assertSaneParts(parts, `${t.id}/${it.type}`);
    }
  }
});

test('강의실 — 책상 뒤 의자는 강의용 의자 자산을 쓴다', () => {
  const res = layoutRoom('classroom', defaultOptions('classroom'), { W: 10000, D: 12000 });
  const chairs = res.items.filter(i => i.type === 'chair');
  assert.ok(chairs.length > 0);
  for (const c of chairs) assert.equal(assetFor(c), 'trainingChair');
  // 회의실 의자는 그대로 회전의자.
  const meet = layoutRoom('meeting', defaultOptions('meeting'), { W: 8000, D: 7000 });
  for (const c of meet.items.filter(i => i.type === 'chair')) {
    assert.equal(assetFor(c), 'conferenceChair');
  }
});

test('그리기 호출 수 — 좌석이 늘어도 부품 종류 수만큼만 늘어난다', () => {
  const small = layoutRoom('hall_s', { ...defaultOptions('hall_s'), rows: 4, seatsPerRow: 8 }, { W: 14000, D: 16000 });
  const big = layoutRoom('hall_l', { ...defaultOptions('hall_l'), rows: 20, seatsPerRow: 40 }, { W: 30000, D: 34000 });
  const seatsSmall = small.items.filter(i => i.type === 'seat').length;
  const seatsBig = big.items.filter(i => i.type === 'seat').length;
  assert.ok(seatsBig > seatsSmall * 4, '큰 강당이 훨씬 많아야 의미 있는 비교가 된다');
  // 좌석 수와 무관하게 부품 종류(=InstancedMesh 개수)는 같다.
  assert.equal(assetParts(small.items.find(i => i.type === 'seat')).length,
    assetParts(big.items.find(i => i.type === 'seat')).length);
  assert.ok(createAuditoriumChair().length <= 8, '객석 부품이 8종을 넘으면 그리기 호출이 늘어난다');
});


// ── 회의실 프리셋(STEP 5) ───────────────────────────────────────────────────

test('AV 수납장 — 낮고 단순하며 LED를 가리지 않는 높이(700mm)', () => {
  const parts = createAvCredenza(1800, 450);
  assertSaneParts(parts, 'avCredenza');
  assert.ok(parts.length <= 6, '장식 가구가 아니므로 부품이 적어야 한다');
  const top = Math.max(...parts.map(p => yRange(p)[1]));
  assert.equal(Math.round(top), DIMS.avCredenza.h, '전체 높이가 설계값과 같다');
  assert.ok(top < 900, 'LED 하단(기본 1,000mm)보다 낮아야 한다');
  // 굽(토킥)은 몸통보다 안쪽으로 들어가 있어야 한다 — 바닥에 붙은 상자로 보이지 않게.
  const toe = parts.find(p => p.kind === 'credenzaToe');
  const body = parts.find(p => p.kind === 'credenzaBody');
  assert.ok(toe.w < body.w && toe.d < body.d, '굽이 몸통보다 작아야 한다');
  // 문 2짝이 몸통 폭 안에 들어간다.
  const doors = parts.filter(p => p.kind === 'credenzaDoor');
  assert.equal(doors.length, 2);
  for (const d of doors) assert.ok(Math.abs(d.dx) + d.w / 2 <= body.w / 2, '문이 몸통 밖으로 나간다');
  assert.equal(assetFor({ type: 'credenza' }), 'avCredenza');
});
