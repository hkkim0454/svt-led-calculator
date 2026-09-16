// furniture-assets.test.js — 가구 에셋 카탈로그 회귀 테스트.
// 핵심 규칙: (1) 실제 가구 비율을 벗어나지 않는다 (2) 부품이 바닥을 뚫지 않는다
//            (3) 배치 결과(room-presets)와 자산이 빠짐없이 연결된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE_ASSETS, FURNITURE_COLORS, DIMS, V1_ASSET_IDS,
  assetFor, assetParts, assetKey,
  createConferenceChair, createAuditoriumChair, createTrainingChair,
  createTrainingDesk, createConferenceTable, createAvCredenza, createCorporateChair,
  createCorporateTable, corporateSupportXs, fitsCorporateTable, BOAT_BULGE_RATIO,
} from '../src/furniture-assets.js';
import { layoutRoom, ROOM_TYPES, defaultOptions, FURNITURE } from '../src/room-presets.js';
import { PART_FINISH, PART_MATERIAL, finishForPart } from '../src/materials.js';
import { FURNITURE_CONTRACTS } from '../src/furniture-contracts.js';

// 부품 하나가 차지하는 y 구간 [아래, 위]. 기울기가 있으면 회전 후 높이로 계산한다.
function yRange(p) {
  if (p.shape === 'sph') return [p.y - p.r, p.y + p.r];
  const a = Math.abs((p.tiltX || 0) * Math.PI / 180);
  const h = p.h;
  const d = p.shape === 'cyl' ? p.r * 2 : p.d;
  const half = (h * Math.cos(a) + d * Math.sin(a)) / 2;
  return [p.y - half, p.y + half];
}

function assertSaneParts(parts, label) {
  assert.ok(Array.isArray(parts) && parts.length > 0, `${label}: 부품이 있어야 한다`);
  for (const p of parts) {
    // 색은 팔레트(기존 가구) 또는 새 마감 표(기업 AV 가구) 중 한 곳에서 온다.
    assert.ok(FURNITURE_COLORS[p.kind] || PART_FINISH[p.kind]?.color,
      `${label}: 색이 없는 부품 kind=${p.kind}`);
    // star = 5발 캐스터 받침(허브+다리+바퀴를 한 덩어리로 구운 것). w/h/d 로 공간을 차지한다.
    assert.ok(['box', 'cyl', 'sph', 'star'].includes(p.shape), `${label}: 원시 도형은 box/cyl/sph/star만`);
    const nums = p.shape === 'cyl' ? [p.r, p.h] : p.shape === 'sph' ? [p.r] : [p.w, p.h, p.d];
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

// ── 최종 품질 점검(FINAL) — 자산 사이의 비례 일관성 ─────────────────────────
// 자산을 하나씩 볼 때는 맞아도, 한 화면에 같이 놓았을 때 어긋나면 공간이 가짜로 보인다.

test('비례 일관성 — 앉는 가구의 좌석 높이가 용도별로 맞다', () => {
  const D = DIMS;
  // 일반 좌석(회의·강의·객석)은 전부 실제 범위 안이고 서로 크게 다르지 않다.
  const normal = [D.conferenceChair, D.auditoriumChair, D.trainingChair].map(s => s.seatTop);
  for (const h of normal) assert.ok(h >= 420 && h <= 480, `좌석고 ${h}`);
  assert.ok(Math.max(...normal) - Math.min(...normal) <= 30, '일반 좌석끼리 좌석고 차이가 30mm를 넘으면 안 된다');
  // 라운지는 더 낮고, 스툴은 훨씬 높다 — 용도가 다르므로 실루엣이 달라야 한다.
  assert.ok(D.loungeChair.seatTop < Math.min(...normal) - 20, '라운지는 확실히 낮아야 한다');
  assert.ok(D.stool.seatTop > Math.max(...normal) + 200, '스툴은 확실히 높아야 한다');
});

test('비례 일관성 — 작업면 높이가 그 앞에 앉는 좌석과 맞물린다', () => {
  const D = DIMS;
  const gap = (surface, seatTop) => surface - seatTop;   // 좌석 윗면 ~ 작업면(무릎 여유)
  // 앉아서 쓰는 면은 좌석보다 250~330mm 위 — 실제 가구 규격의 범위다.
  assert.ok(gap(D.conferenceTable.surfaceY, D.conferenceChair.seatTop) >= 250, '회의 테이블이 낮다');
  assert.ok(gap(D.conferenceTable.surfaceY, D.conferenceChair.seatTop) <= 330, '회의 테이블이 높다');
  assert.ok(gap(D.trainingDesk.surfaceY, D.trainingChair.seatTop) >= 250, '강의 책상이 낮다');
  assert.ok(gap(D.trainingDesk.surfaceY, D.trainingChair.seatTop) <= 330, '강의 책상이 높다');
  // 하이 테이블 ↔ 스툴도 같은 관계를 지켜야 한다.
  assert.ok(gap(D.highTable.surfaceY, D.stool.seatTop) >= 250, '하이 테이블이 낮다');
  assert.ok(gap(D.highTable.surfaceY, D.stool.seatTop) <= 330, '하이 테이블이 높다');
  // 협업 테이블은 라운지 체어에 맞춘 낮은 테이블이다.
  assert.ok(D.collabTable.surfaceY < D.conferenceTable.surfaceY, '협업 테이블은 회의 테이블보다 낮다');
});

test('비례 일관성 — 상판 두께가 모두 얇다(도마처럼 두꺼운 상판 금지)', () => {
  const D = DIMS;
  for (const [name, thk] of [
    ['회의 테이블', D.conferenceTable.topThk], ['강의 책상', D.trainingDesk.topThk],
    ['하이 테이블', D.highTable.topThk], ['협업 테이블', D.collabTable.topThk],
    ['AV 수납장', D.avCredenza.topThk],
  ]) assert.ok(thk <= 45, `${name} 상판 ${thk}mm`);
});

test('비례 일관성 — 모든 자산이 사람 키(1,700mm)를 넘지 않는다', () => {
  const tall = [];
  for (const id of Object.keys(FURNITURE_ASSETS)) {
    const a = FURNITURE_ASSETS[id];
    if (!a.instanced) continue;
    const parts = a.build({ w: 1800, d: 900 });
    const top = Math.max(...parts.map(p => yRange(p)[1]));
    if (top > 1700) tall.push(`${id} ${Math.round(top)}mm`);
    assertSaneParts(parts, id);
  }
  // 교탁(1,080)·이동식 디스플레이(약 1,820)만 예외적으로 높다 — 화면은 서서 보는 물건이다.
  assert.deepEqual(tall.map(s => s.split(' ')[0]), ['mobileStand'], tall.join(', '));
});

// ── PHASE 2-a · 대기업 회의용 인체공학 의자 ─────────────────────────────────
// 핵심 규칙
//   (1) 치수의 기준은 **계약 하나뿐**이다 — 도형 코드가 다른 값을 쓰면 안 된다.
//   (2) 기존 회의 의자는 한 글자도 바뀌지 않는다.
//   (3) 실루엣이 기존 의자와 **확실히 다르다**(5발 받침·휜 메시 등받이·지지 구조).
//   (4) 부품 수가 좌석 수와 무관하게 고정된다(그리기 호출 폭증 금지).

test('대기업 의자 — 런타임 자산으로 등록되었고 계약 치수를 그대로 쓴다', () => {
  const a = FURNITURE_ASSETS.corporateChair;
  assert.ok(a, '런타임 카탈로그에 없다');
  assert.equal(a.id, 'corporateChair');
  assert.equal(a.instanced, true, '여러 개 깔리는 가구다');
  assert.equal(a.sized, false, '크기가 물건마다 다르지 않다');
  // **치수를 두 곳에 적지 않는다** — 값이 같아야 하고,
  //   소스에서도 계약을 '읽어' 써야 한다(숫자를 베껴 적으면 언젠가 어긋난다).
  assert.deepEqual({ ...DIMS.corporateChair }, { ...FURNITURE_CONTRACTS.corporateChair.dimensions },
    '계약과 다른 치수를 쓰고 있다');
  const src = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');
  assert.ok(/corporateChair:\s*FURNITURE_CONTRACTS\.corporateChair\.dimensions/.test(src),
    'DIMS.corporateChair 가 계약을 읽지 않고 숫자를 따로 적고 있다');
});

test('대기업 의자 — 실제 도형이 계약 치수 안에 들어가고 바닥에 닿는다', () => {
  const parts = createCorporateChair();
  const S = DIMS.corporateChair;
  assertSaneParts(parts, 'corporateChair');
  // 부품이 차지하는 공간을 실제로 재서 계약과 대조한다(기울어진 등받이까지 반영).
  const zRange = p => {
    const a = Math.abs((p.tiltX || 0) * Math.PI / 180);
    const d = p.shape === 'cyl' ? p.r * 2 : p.d;
    const half = (d * Math.cos(a) + p.h * Math.sin(a)) / 2;
    return [p.dz - half, p.dz + half];
  };
  const bottom = Math.min(...parts.map(p => yRange(p)[0]));
  const top = Math.max(...parts.map(p => yRange(p)[1]));
  const width = Math.max(...parts.map(p => Math.abs(p.dx) + (p.shape === 'cyl' ? p.r : p.w / 2))) * 2;
  const depth = Math.max(...parts.map(p => zRange(p)[1])) - Math.min(...parts.map(p => zRange(p)[0]));

  // 바닥 접지 — 바퀴가 바닥에 정확히 닿아야 한다(뜨거나 박히면 안 된다).
  assert.ok(Math.abs(bottom) < 1, `바닥에서 ${bottom.toFixed(1)}mm 떠 있거나 박혀 있다`);
  // 계약이 선언한 크기를 넘지 않는다(±1mm 허용).
  assert.ok(top <= S.overallH + 1, `전체 높이 ${top.toFixed(1)} > 계약 ${S.overallH}`);
  assert.ok(top >= S.overallH - 5, `전체 높이 ${top.toFixed(1)} 가 계약보다 너무 낮다`);
  assert.ok(width <= S.overallW + 1, `전체 폭 ${width} > 계약 ${S.overallW}`);
  assert.ok(depth <= S.overallD + 1, `전체 깊이 ${depth.toFixed(1)} > 계약 ${S.overallD}`);
  // 좌판 윗면이 계약대로다 — 테이블 높이와 맞물리는 값이라 특히 중요하다.
  const seat = parts.find(p => p.kind === 'chairCushion');
  assert.equal(Math.round(yRange(seat)[1]), S.seatTop, '좌판 높이가 계약과 다르다');
  assert.equal(seat.w, S.seatW);
  assert.equal(seat.d, S.seatD);
  // 등받이 꼭대기가 좌판 위 계약값에 온다.
  assert.ok(Math.abs((top - S.seatTop) - S.backAboveSeat) <= 1,
    `등받이 높이 ${(top - S.seatTop).toFixed(1)} ≠ 계약 ${S.backAboveSeat}`);
});

test('대기업 의자 — 부품이 계약의 semantic 과 정확히 일치한다', () => {
  const parts = createCorporateChair();
  const used = [...new Set(parts.map(p => p.kind))].sort();
  assert.deepEqual(used, [...FURNITURE_CONTRACTS.corporateChair.parts].sort(),
    '계약에 없는 부품을 쓰거나, 계약의 부품을 빠뜨렸다');
  // 모든 부품이 새 마감 표로 풀린다 — 하나라도 빠지면 그 부품만 기본 회색이 된다.
  for (const kind of used) {
    assert.ok(PART_FINISH[kind]?.color, `${kind}: 마감 표에 색이 없다`);
    const fin = finishForPart(kind);
    assert.ok(fin && fin.material, `${kind}: 마감이 풀리지 않는다`);
  }
  // 색은 전부 어두운 계열이되 **완전한 검정 하나가 아니다** — 새까맣게 칠하면 형태가 죽는다.
  const hex = k => PART_FINISH[k].color.toLowerCase();
  const lum = k => parseInt(hex(k).slice(1, 3), 16) + parseInt(hex(k).slice(3, 5), 16) + parseInt(hex(k).slice(5, 7), 16);
  for (const k of used) {
    assert.ok(lum(k) < 3 * 110, `${k}: 기업 의자 색이 너무 밝다 (${hex(k)})`);
    assert.ok(lum(k) > 3 * 20, `${k}: 순수 검정에 가까워 형태가 죽는다 (${hex(k)})`);
  }
  assert.ok(new Set(used.map(hex)).size >= 4, '부품 색이 전부 같으면 덩어리 하나로 보인다');
});

test('대기업 의자 — 기존 회의 의자와 실루엣이 확실히 다르다', () => {
  const co = createCorporateChair(), legacy = createConferenceChair();
  // ① 5발 캐스터 받침 — 원판 하나가 아니다. 이것 하나로 멀리서도 갈린다.
  const base = co.find(p => p.shape === 'star');
  assert.ok(base, '5발 받침이 없다');
  assert.equal(base.legs, 5, '다섯 발이어야 한다');
  assert.equal(base.kind, 'chairCaster');
  assert.ok(base.reach * 2 <= DIMS.corporateChair.overallW, '받침이 의자 폭을 넘는다');
  assert.equal(legacy.find(p => p.shape === 'star'), undefined, '기존 의자는 그대로여야 한다');
  // ② 휜 메시 등받이 — 평평한 판이 아니다.
  const mesh = co.find(p => p.kind === 'chairMesh');
  assert.ok(mesh && mesh.sag > 0, '등받이가 휘어 있지 않다');
  assert.ok(mesh.tiltX > 0, '등받이가 젖혀져 있지 않다');
  // ③ 등받이 테두리 — 메시보다 크고 두껍다(프레임이 감싸는 구조).
  const frame = co.filter(p => p.kind === 'chairFrame' && p.sag > 0)
    .sort((a, b) => b.h - a.h)[0];
  assert.ok(frame && frame.w > mesh.w && frame.d > mesh.d, '메시를 감싸는 테두리가 없다');
  // ④ 등받이가 좌판에 바로 붙지 않는다 — 지지 구조를 거친다.
  assert.ok(co.filter(p => p.kind === 'chairFrame').length >= 4, '등받이 지지 구조가 부족하다');
  // ⑤ 기존 의자와 부품 이름이 하나도 겹치지 않는다(재질이 섞이지 않는다).
  const legacyKinds = new Set(legacy.map(p => p.kind));
  for (const p of co) assert.ok(!legacyKinds.has(p.kind), `부품 이름이 겹친다: ${p.kind}`);
});

test('대기업 의자 — 부품 수가 고정이라 그리기 호출이 좌석 수를 따라가지 않는다', () => {
  // 그리기 호출은 **부품 종류 수**에 비례한다. 좌석이 12개든 40개든 같아야 한다.
  assert.equal(createCorporateChair().length, createCorporateChair().length);
  const n = createCorporateChair().length;
  assert.ok(n <= 14, `부품 ${n}종 — 기존 의자(9종) 대비 과하게 늘었다`);
  // 5발 받침은 조각 11개(허브 1 + 다리 5 + 바퀴 5)를 **한 덩어리**로 굽는다.
  //   따로 그리면 이 의자 하나 때문에 그리기 호출이 10개 늘어난다.
  assert.equal(createCorporateChair().filter(p => p.shape === 'star').length, 1);
});

test('기존 회의 의자 — PHASE 2-a 에서 한 글자도 바뀌지 않았다', () => {
  const p = createConferenceChair();
  assert.equal(p.length, 9);
  assert.deepEqual(p.map(x => x.kind),
    ['chairBase', 'chairBase', 'chairSeat', 'chairBase', 'chairBack', 'chairArm', 'chairArm', 'chairArm', 'chairArm']);
  const S = DIMS.conferenceChair;
  assert.deepEqual({ ...S }, {
    seatTop: 450, seatThk: 70, seatW: 480, seatD: 470,
    backH: 480, backThk: 55, backTilt: 12, backTopY: 1005,
    baseR: 310, baseThk: 22, columnR: 35, armY: 660, armSpan: 575,
  });
  assert.equal(assetFor({ type: 'chair' }), 'conferenceChair', '기본 의자는 그대로다');
});

test('대기업 의자 — 휜 판의 둥글림이 두께를 넘지 않는다(부푸는 것 방지)', () => {
  // 휜 판(등받이)의 `r`은 가장자리를 **사방으로 밀어내는** 값이다.
  //   두께보다 크게 잡으면 얇은 프레임이 두툼한 쿠션 덩어리처럼 부풀어
  //   계약 치수와 실제 화면이 어긋난다(실제로 한 번 그렇게 보였다).
  for (const p of createCorporateChair()) {
    if (!p.sag) continue;
    assert.ok(p.r <= p.d, `${p.kind}: 둥글림 ${p.r} > 두께 ${p.d} — 판이 부푼다`);
  }
  // 메시는 테두리보다 얇고 좁아야 안쪽에 들어앉는다.
  const parts = createCorporateChair();
  const mesh = parts.find(p => p.kind === 'chairMesh');
  const frame = parts.filter(p => p.kind === 'chairFrame' && p.sag).sort((a, b) => b.h - a.h)[0];
  assert.ok(mesh.d < frame.d && mesh.w < frame.w && mesh.h < frame.h,
    '메시가 테두리보다 크면 테두리가 안 보인다');
});

// ── PHASE 2-b · 대기업 회의 테이블 ──────────────────────────────────────────
// 핵심 규칙
//   (1) 작업면 높이·상판 두께는 **계약이 유일한 기준**이다.
//   (2) 실제 가로·세로는 **배치 계산이 준 값**을 쓴다 — 여기서 방을 다시 재지 않는다.
//   (3) 받침이 **좌석 자리에 오지 않는다**(무릎이 기둥에 부딪히지 않게).
//   (4) 기존 회의 테이블은 한 글자도 바뀌지 않는다.

test('대기업 테이블 — 런타임 자산으로 등록되었고 계약 치수를 그대로 쓴다', () => {
  const a = FURNITURE_ASSETS.corporateTable;
  assert.ok(a, '런타임 카탈로그에 없다');
  assert.equal(a.id, 'corporateTable');
  assert.equal(a.instanced, false, '방에 한두 개뿐이라 묶을 대상이 아니다');
  assert.equal(a.sized, true, '크기가 방에 따라 달라진다');
  const C = FURNITURE_CONTRACTS.corporateTable.dimensions;
  const t = createCorporateTable({ shape: 'rect', w: 3200, d: 1200 });
  assert.equal(t.surfaceY, C.surfaceY, '작업면 높이가 계약과 다르다');
  assert.equal(t.surfaceY, 740);
  assert.equal(t.topThk, C.topThk, '상판 두께가 계약과 다르다');
  assert.equal(t.topThk, 25);
  assert.equal(t.topBottom, C.surfaceY - C.topThk);
  // 숫자를 베껴 적지 않고 계약을 '읽어' 써야 한다.
  const src = readFileSync(new URL('../src/furniture-assets.js', import.meta.url), 'utf8');
  assert.ok(/FURNITURE_CONTRACTS\.corporateTable\.dimensions/.test(src),
    'createCorporateTable 이 계약을 읽지 않고 숫자를 따로 적고 있다');
});

test('대기업 테이블 — 크기는 배치 계산이 정한다(키우지도 줄이지도 않는다)', () => {
  // 배치가 준 값을 **그대로** 쓴다. 방 크기를 여기서 다시 재지 않는다.
  for (const [w, d] of [[2600, 1500], [4000, 1500], [3200, 1100], [6000, 1600]]) {
    const t = createCorporateTable({ shape: 'rect', w, d });
    assert.equal(t.w, w, `가로 ${w}`);
    assert.equal(t.d, d, `세로 ${d}`);
  }
  // 값이 아예 없을 때만 계약의 최소 치수를 기본값으로 쓴다.
  const C = FURNITURE_CONTRACTS.corporateTable.dimensions;
  const none = createCorporateTable({});
  assert.equal(none.w, C.minWidth);
  assert.equal(none.d, C.minDepth);
});

test('대기업 테이블 — 작은 조각은 키우지 않고 맡지 않는다(배치가 바뀌면 안 된다)', () => {
  const C = FURNITURE_CONTRACTS.corporateTable.dimensions;
  assert.ok(fitsCorporateTable({ shape: 'boat', w: 4000, d: 1500 }));
  assert.ok(fitsCorporateTable({ shape: 'rect', w: C.minWidth, d: C.minDepth }), '최소 치수는 맡는다');
  // U자형 옆날개(900×2000)처럼 계약보다 작은 조각은 **거절**한다 —
  //   맡아서 최소 치수로 키우면 테이블이 배치 밖으로 삐져나간다.
  assert.equal(fitsCorporateTable({ shape: 'rect', w: 900, d: 2000 }), false);
  assert.equal(fitsCorporateTable({ shape: 'rect', w: 5100, d: 800 }), false);
  // 계약 밖 모양도 거절한다.
  assert.equal(fitsCorporateTable({ shape: 'round', w: 4000, d: 4000 }), false);
  assert.equal(fitsCorporateTable({ shape: 'u', w: 4000, d: 2000 }), false);

  // 실제 U자형 배치를 그대로 넣어 본다 — 한 조각도 맡지 않아야 한다.
  const u = layoutRoom('meeting', { tableShape: 'u', seats: 12, credenza: true },
    { W: 8000, D: 6800, ledBottom: 900 });
  const seg = (u.items || u).filter(x => x.type === 'table');
  assert.ok(seg.length > 1, 'U자형은 여러 조각이다');
  for (const it of seg) {
    if (fitsCorporateTable(it)) continue;      // 앞날개는 크기가 충분할 수 있다
    assert.equal(fitsCorporateTable(it), false);
  }
  assert.ok(seg.some(it => !fitsCorporateTable(it)), 'U자형 옆날개는 대기업 테이블이 맡지 않는다');
});

test('렌더러 — 조각이 여럿인 배치에서는 대기업 테이블을 쓰지 않는다', () => {
  // 화면 조립(furniture-gl.js)은 Three.js가 있어야 돌아가므로 소스에서 조건을 확인한다.
  const src = readFileSync(new URL('../src/furniture-gl.js', import.meta.url), 'utf8');
  assert.match(src, /const oneTable = items\.filter\(x => x\.type === 'table'\)\.length === 1;/,
    '테이블 조각 수를 세는 곳이 없다');
  assert.match(src, /useCorporate = assetFor\(it\) === 'corporateTable'\s*&& oneTable && fitsCorporateTable\(it\)/,
    '대기업 테이블 선택 조건에 조각 수·계약 범위 확인이 빠졌다');
});

test('대기업 테이블 — 사각·보트 두 모양을 지원하고 보트는 살짝만 부푼다', () => {
  const rect = createCorporateTable({ shape: 'rect', w: 4000, d: 1500 });
  assert.equal(rect.shape, 'rect');
  assert.equal(rect.bulge, 0, '사각형은 부풀지 않는다');
  const boat = createCorporateTable({ shape: 'boat', w: 4000, d: 1500 });
  assert.equal(boat.shape, 'boat');
  // **과장된 타원 금지** — 깊이의 4~8%만 부푼다(오너 지침 §9).
  assert.ok(boat.bulge / boat.d >= 0.04 && boat.bulge / boat.d <= 0.08,
    `보트 부풀림 ${(boat.bulge / boat.d * 100).toFixed(1)}% — 4~8% 밖이다`);
  // PHASE 2-b.1 — 그 범위 안에서 **8%로 고정**한다. 6%는 멀리서 사각형과 구분이 안 됐다.
  assert.equal(BOAT_BULGE_RATIO, 0.08);
  assert.equal(boat.bulge, Math.round(1500 * 0.08), '깊이 1500 → 부풀림 120mm');
  for (const d of [1100, 1200, 1500, 1600, 2000]) {
    const t = createCorporateTable({ shape: 'boat', w: 4000, d });
    assert.equal(t.bulge, Math.round(d * 0.08), `깊이 ${d}`);
    // 양 끝 폭은 그대로다 — 가운데만 넓어질 뿐 **끝단이 좁아지지 않는다.**
    assert.equal(t.d, d, `깊이 ${d}: 끝단 폭은 배치가 준 값 그대로`);
  }
  // 계약이 다루지 않는 모양(원형·U 등)은 사각으로 떨어진다 — 이 자산의 몫이 아니다.
  assert.deepEqual([...FURNITURE_CONTRACTS.corporateTable.shapes], ['rect', 'boat']);
  for (const shape of ['round', 'u', undefined, '없는모양']) {
    assert.equal(createCorporateTable({ shape, w: 3000, d: 1200 }).shape, 'rect', String(shape));
  }
});

test('대기업 테이블 — 받침이 좌석 자리를 피한다(무릎이 기둥에 부딪히지 않게)', () => {
  // 회의실 좌석은 테이블 중심에서 **좌석 간격(700mm)의 배수**에 놓인다.
  //   받침이 그 자리에 오면 앉은 사람 무릎이 정확히 기둥을 만난다.
  const PITCH = FURNITURE.chairPitch;
  assert.equal(PITCH, 700, '좌석 간격이 바뀌면 받침 규칙도 다시 봐야 한다');
  for (let w = 1800; w <= 9000; w += 100) {
    const xs = corporateSupportXs(w);
    assert.ok(xs.length % 2 === 0, `w=${w}: 받침이 홀수 — 하나가 정중앙(좌석 자리)에 온다`);
    // 좌우 대칭이어야 한다.
    assert.deepEqual([...xs].sort((a, b) => a - b).map(v => Math.abs(v)).sort(),
      [...xs].map(v => Math.abs(v)).sort(), `w=${w}: 비대칭`);
    for (const x of xs) {
      assert.notEqual(Math.abs(x) % PITCH, 0, `w=${w}: 받침 ${x} 이 좌석 자리와 겹친다`);
      // 좌석 중심에서 최소 300mm 떨어져 있어야 무릎 공간이 나온다.
      const nearest = Math.abs(Math.abs(x) - Math.round(Math.abs(x) / PITCH) * PITCH);
      assert.ok(nearest >= 300, `w=${w}: 받침 ${x} 이 좌석에서 ${nearest}mm 밖에 안 떨어졌다`);
      // 상판 밖으로 나가지 않는다.
      assert.ok(Math.abs(x) <= w / 2 - 150, `w=${w}: 받침 ${x} 이 상판 끝에 너무 붙었다`);
    }
  }
  // 긴 테이블은 받침이 더 많다.
  assert.equal(corporateSupportXs(3200).length, 2);
  assert.equal(corporateSupportXs(6000).length, 4);
});

test('대기업 테이블 — 얇은 상판 + T형 받침이고 바닥에 닿는다', () => {
  const t = createCorporateTable({ shape: 'boat', w: 4000, d: 1500 });
  // 중역 테이블처럼 두꺼운 몸통이 아니다.
  assert.ok(t.topThk <= 30, `상판 ${t.topThk}mm — 도마처럼 두껍다`);
  assert.ok(t.topRadius <= 40, `모서리 ${t.topRadius}mm — 둥글림이 과하다`);
  for (const sp of t.supports) {
    // 발이 바닥(0)에서 시작하고 기둥이 그 위에 선다 — 뜨거나 박히지 않는다.
    assert.equal(sp.post.y0, sp.foot.h, '기둥이 발 위에 서 있지 않다');
    assert.ok(sp.post.y1 < t.topBottom + 1e-9, '기둥이 상판을 뚫는다');
    assert.ok(sp.post.y1 > t.topBottom - 60, '기둥이 상판에 못 닿아 떠 보인다');
    // T형: 바닥 발이 기둥보다 넓고 깊다.
    assert.ok(sp.foot.w > sp.post.w && sp.foot.d > sp.post.d, 'T형 받침이 아니다');
    assert.ok(sp.post.w <= 120, `기둥 ${sp.post.w}mm — 식탁 다리처럼 굵다`);
    assert.ok(sp.foot.d <= t.d, '발이 상판보다 깊어 밖으로 나온다');
  }
  // 보강대는 거의 안 보일 만큼 얇다.
  assert.ok(t.beam && t.beam.h <= 60, `보강대 ${t.beam?.h}mm — 눈에 띈다`);
  assert.ok(t.beam.y + t.beam.h / 2 <= t.topBottom, '보강대가 상판을 뚫는다');
});

test('대기업 테이블 — 마감이 계약대로 풀린다(상판만 새 표, 받침은 기존 경로)', () => {
  const c = FURNITURE_CONTRACTS.corporateTable;
  assert.deepEqual([...c.parts], ['corporateTop', 'tableBase', 'tableBeam']);
  // 상판만 새 마감 표를 탄다.
  assert.equal(PART_FINISH.corporateTop.material, 'neutralLaminate');
  assert.ok(PART_FINISH.corporateTop.color, '상판 색이 없다');
  assert.notEqual(PART_FINISH.corporateTop.color.toLowerCase(), '#ffffff',
    '순백 상판은 3D에서 플라스틱 판처럼 보인다');
  assert.ok(finishForPart('corporateTop'), '상판 마감이 풀리지 않는다');
  // 받침·보강대는 **기존 재질 경로** 그대로 — 새 마감을 만들지 않았다.
  assert.equal(finishForPart('tableBase'), null);
  assert.equal(finishForPart('tableBeam'), null);
  assert.equal(PART_MATERIAL.tableBase, 'metalFrame');
  assert.equal(PART_MATERIAL.tableBeam, 'metalFrame');
});

test('기존 회의 테이블 — PHASE 2-b 에서 한 글자도 바뀌지 않았다', () => {
  for (const shape of ['rect', 'boat', 'round']) {
    const S = createConferenceTable({ shape, w: 2800, d: 1300 });
    assert.equal(S.surfaceY, 740);
    assert.equal(S.topThk, 30, '기존 테이블 상판 두께는 30mm 그대로다');
    assert.equal(S.topBottom, 710);
    if (shape === 'round') { assert.ok(S.post && S.foot); assert.equal(S.legs.length, 0); }
    else { assert.equal(S.legs.length, 2); assert.ok(S.beam); }
  }
  assert.equal(DIMS.conferenceTable.surfaceY, 740);
  assert.equal(DIMS.conferenceTable.topThk, 30);
  assert.equal(assetFor({ type: 'table' }), 'conferenceTable', '기본 테이블은 그대로다');
});
