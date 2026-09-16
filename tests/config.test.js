import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_VERSION, CONFIG_DEFAULTS, normalizeConfig, makeRecord, normalizeRecords,
  EXPORT_APP, exportBundle, parseImport, uniqueName, mergeRecords } from '../src/config.js';

test('정상 구성은 값이 그대로 왕복(roundtrip)된다', () => {
  const cfg = {
    spaceW: 6000, spaceH: 3400, baseHeight: 800, ledW: 3200, ledH: 1800,
    spaceD: 7000, roomType: 'classroom', roomOpts: { rows: 5, cols: 4, aisle: true },
    mode: 'manual', manCols: 8, manRows: 6,
    redundancy: true, cs4b: true, gbicFB: false, highWork: true,
    spareRate: '7', spareEdited: true, sboxSpare: 2, signalMode: 'uhd',
    selectedId: 'IF015RM', selectedModel: { id: 'IF015RM', name: 'IF015R-M' },
    etcCost: 500000, etcSell: 700000, visibleLines: ['IF', 'MM'], indirectDisabled: ['연금보험료'],
  };
  const out = normalizeConfig(cfg);
  assert.deepEqual(out, cfg);
});

test('누락 항목은 기본값으로 채워진다', () => {
  const out = normalizeConfig({ spaceW: 5000 });
  assert.equal(out.spaceW, 5000);
  assert.equal(out.spaceH, CONFIG_DEFAULTS.spaceH);
  assert.equal(out.mode, 'fill');
  assert.equal(out.signalMode, 'off');
  assert.equal(out.spareRate, '');
  assert.equal(out.selectedId, null);
});

test('잘못된 타입/값은 무시하고 기본값으로', () => {
  const out = normalizeConfig({ mode: 'ZZZ', signalMode: 42, redundancy: 'yes', sboxSpare: 'abc', visibleLines: 'IF' });
  assert.equal(out.mode, 'fill');
  assert.equal(out.signalMode, 'off');
  assert.equal(out.redundancy, false);   // 문자열 'yes'는 boolean 아님 → 기본값
  assert.equal(out.sboxSpare, 1);         // 'abc'는 숫자 아님 → 기본값
  assert.equal(out.visibleLines, null);   // 배열 아님 → 기본값(null=현재 유지)
});

test('object 아닌 입력은 전부 기본값', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    const out = normalizeConfig(bad);
    assert.equal(out.spaceW, CONFIG_DEFAULTS.spaceW);
    assert.equal(out.mode, CONFIG_DEFAULTS.mode);
  }
});

test('숫자 문자열은 숫자로 강제(공간·수량)', () => {
  const out = normalizeConfig({ spaceW: '6000', manCols: '8', etcCost: '500000' });
  assert.equal(out.spaceW, 6000);
  assert.equal(out.manCols, 8);
  assert.equal(out.etcCost, 500000);
});

test('알 수 없는 항목은 결과에서 제거된다', () => {
  const out = normalizeConfig({ spaceW: 4000, __hack: 1, price: 999 });
  assert.equal('__hack' in out, false);
  assert.equal('price' in out, false);
});

test('makeRecord: 버전·이름·정규화된 data 를 포함', () => {
  const rec = makeRecord('롯데타워 로비', { spaceW: 5000 }, '2026-09-08T00:00:00.000Z');
  assert.equal(rec.v, CONFIG_VERSION);
  assert.equal(rec.name, '롯데타워 로비');
  assert.equal(rec.savedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(rec.data.spaceW, 5000);
  assert.equal(rec.data.mode, 'fill'); // 정규화로 기본값 채움
});

test('normalizeRecords: 배열 정리·정규화·최신순 정렬', () => {
  const list = [
    { name: 'A', savedAt: '2026-09-01T00:00:00.000Z', data: { spaceW: 1000 } },
    { name: 'B', savedAt: '2026-09-08T00:00:00.000Z', data: { spaceW: 2000 } },
    { nope: true },                 // name 없음 → 제거
    'garbage',                      // object 아님 → 제거
  ];
  const out = normalizeRecords(list);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'B');   // 최신 저장 먼저
  assert.equal(out[1].name, 'A');
  assert.equal(out[0].data.spaceW, 2000);
});

test('normalizeRecords: 배열 아닌 입력은 빈 배열', () => {
  assert.deepEqual(normalizeRecords(null), []);
  assert.deepEqual(normalizeRecords({}), []);
});

/* ─── 파일 내보내기/가져오기(공유) ─── */

test('exportBundle→parseImport 왕복: 레코드 보존', () => {
  const recs = [makeRecord('A', { spaceW: 1000 }, '2026-09-01T00:00:00.000Z'),
                makeRecord('B', { spaceW: 2000 }, '2026-09-08T00:00:00.000Z')];
  const bundle = exportBundle(recs);
  assert.equal(bundle.app, EXPORT_APP);
  assert.equal(bundle.v, CONFIG_VERSION);
  const back = parseImport(bundle);
  assert.equal(back.length, 2);
  assert.deepEqual(back.map(r => r.name).sort(), ['A', 'B']);
  assert.equal(back.find(r => r.name === 'A').data.spaceW, 1000);
});

test('parseImport: 여러 형식 관대하게 처리', () => {
  // 단일 레코드
  assert.equal(parseImport({ name: 'X', data: { spaceW: 1 } }).length, 1);
  // 레코드 배열
  assert.equal(parseImport([{ name: 'X', data: {} }, { name: 'Y', data: {} }]).length, 2);
  // 원시 구성 객체(설정 키 보유)
  const p = parseImport({ spaceW: 5000, mode: 'manual' });
  assert.equal(p.length, 1);
  assert.equal(p[0].data.spaceW, 5000);
  assert.equal(p[0].data.mode, 'manual');
  // 인식 불가
  assert.deepEqual(parseImport(null), []);
  assert.deepEqual(parseImport(42), []);
  assert.deepEqual(parseImport({ hello: 'world' }), []);
});

test('uniqueName: 충돌 시 번호 부여', () => {
  assert.equal(uniqueName('A', []), 'A');
  assert.equal(uniqueName('A', ['A']), 'A (2)');
  assert.equal(uniqueName('A', ['A', 'A (2)']), 'A (3)');
});

test('mergeRecords: 덮어쓰지 않고 이름 충돌은 개명', () => {
  const existing = [makeRecord('공용', { spaceW: 100 }, '2026-09-01T00:00:00.000Z')];
  const incoming = [makeRecord('공용', { spaceW: 200 }), makeRecord('신규', { spaceW: 300 })];
  const { list, added, renamed } = mergeRecords(existing, incoming);
  assert.equal(added, 2);
  assert.equal(renamed, 1);              // '공용' 충돌 → 개명
  assert.equal(list.length, 3);
  const names = list.map(r => r.name).sort();
  assert.deepEqual(names, ['공용', '공용 (2)', '신규']);
  // 원본 '공용'(100)은 그대로 남고, 가져온 것은 '공용 (2)'(200)
  assert.equal(list.find(r => r.name === '공용').data.spaceW, 100);
  assert.equal(list.find(r => r.name === '공용 (2)').data.spaceW, 200);
});

test('3D 뷰 값(공간 깊이·공간 타입·옵션)도 저장·복원된다', () => {
  const out = normalizeConfig({ spaceD: 9000, roomType: 'hall_m', roomOpts: { rows: 8, stage: false } });
  assert.equal(out.spaceD, 9000);
  assert.equal(out.roomType, 'hall_m');
  assert.deepEqual(out.roomOpts, { rows: 8, stage: false });
});

test('3D 뷰 값이 없거나 잘못되면 기본값(깊이 0=자동)', () => {
  const out = normalizeConfig({ spaceD: 'abc', roomType: 42, roomOpts: ['x'] });
  assert.equal(out.spaceD, 0);                    // 0 = 비움 → 공간 타입별 자동
  assert.equal(out.roomType, CONFIG_DEFAULTS.roomType);
  assert.equal(out.roomOpts, null);               // 배열은 옵션 객체가 아님
});
