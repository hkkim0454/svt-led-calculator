// product-docs.js — 제품별 **자료** 목록(카탈로그·데이터시트 PDF, 공식 페이지, 제품 사진). DOM 없음.
//
// 스펙 수치는 여기 적지 않는다 — models.js 가 단일 출처다(두 곳에 적으면 언젠가 서로 달라진다).
// 이 파일은 '어떤 자료가 어디 있는가'만 안다. 제품 정보 팝업(app.js)이 읽어서 보여 준다.
//
// ⚠ 배포 사이트(GitHub Pages)는 **공개 사이트**다. 주소를 아는 누구나 볼 수 있으므로
//   제조사가 공개한 카탈로그·데이터시트만 올린다. 가격표·견적·계약·내부 문서는 올리지 않는다.
//
// 항목 모양 (키 = models.js 의 id)
//   catalog   { file, title, edition, page }  file 은 src/ 기준 상대 경로(catalogs/…pdf),
//                                             page 는 그 모델이 실린 첫 쪽(없으면 1)
//   datasheet { file, title, edition, page }  같은 모양
//   officialUrl  제조사 공식 제품 페이지(https). 확인된 주소만 적는다 — 추측해서 채우지 않는다.
//   images    [{ file, label }]                제품 사진(정면·측면·후면·설치 예 등)
//   catalog/datasheet 의 notice 는 자료에 붙은 저작권 안내 문구다. 팝업이 그대로 보여 준다.
//
// 오너가 PDF 를 보내 주면 src/catalogs/ 에 넣고 여기에 한 줄을 더한다(2026-10-03, DEC-159).

export const DOCS_DIR = 'catalogs/';

// 삼성전자 제품가이드(LED 사이니지 실내용, 7쪽) — 오너가 2026-10-04 '삼성 동의를 받음'을 확인하고 게시를 지시했다(DEC-160).
//   실린 모델만 연결한다(부품 코드로 대조). page = 그 시리즈 사양 쪽.
const SAMSUNG_NOTICE = '삼성전자 자료입니다. 삼성전자의 동의 없이 제3자에게 복제·배포할 수 없습니다.';
const LED_GUIDE = Object.freeze({ file: 'catalogs/samsung-led-indoor-guide.pdf', title: '삼성 LED 사이니지 실내용 제품가이드', notice: SAMSUNG_NOTICE });
const guide = page => Object.freeze({ catalog: Object.freeze({ ...LED_GUIDE, page }) });

export const PRODUCT_DOCS = Object.freeze({
  // MMF 시리즈(LH009/012/015MMFRGS) — 3쪽
  MM009F: guide(3), MM012F: guide(3), MM015F: guide(3),
  // IFR 시리즈(LH015/025/040IFRCLS) — 5쪽. P2.0(IF020R)은 이 자료에 없다.
  IF015R: guide(5), IF025R: guide(5), IF040R: guide(5),
  // IEA(LH015IEACLS) — 7쪽. P2.0·2.5·4.0 은 이 자료에 없다.
  IE015A: guide(7),
});

const EMPTY = Object.freeze({ catalog: null, datasheet: null, officialUrl: null, images: Object.freeze([]) });

/** 그 제품의 자료. 등록이 없으면 빈 묶음(전부 null·빈 목록)이다. */
export function docsFor(id) {
  const d = PRODUCT_DOCS[id];
  if (!d) return EMPTY;
  return {
    catalog: d.catalog || null,
    datasheet: d.datasheet || null,
    officialUrl: d.officialUrl || null,
    images: Array.isArray(d.images) ? d.images : [],
  };
}

/** PDF 를 특정 쪽부터 여는 주소. 브라우저 내장 PDF 보기가 `#page=N` 을 따른다. */
export function docViewUrl(doc) {
  if (!doc?.file) return null;
  const page = Math.max(1, Math.round(Number(doc.page) || 1));
  return page > 1 ? `${doc.file}#page=${page}` : doc.file;
}

/** 수치를 어디서 확인했는가 — models.js 의 dataStatus 를 사람이 읽는 말로. */
export const DATA_STATUS_TEXT = Object.freeze({
  verified: Object.freeze({ label: '✓ 삼성 도구 검증', text: '삼성 공식 configurator 결과와 수치를 대조해 일치를 확인한 모델입니다.' }),
  derived: Object.freeze({ label: '파생', text: '제조사 사양서·브로셔 값을 옮긴 모델입니다. 삼성 configurator 와는 아직 대조하지 않았습니다.' }),
  'needs-verification': Object.freeze({ label: '확인 필요', text: '일부 수치가 비어 있거나 출처 확인이 남은 모델입니다. 비어 있는 값은 — 로 표시합니다.' }),
});

const num = (v, d = 0) => (v == null || !Number.isFinite(Number(v)) ? null
  : Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d }));
const dash = v => (v == null || v === '' ? '—' : v);

/**
 * LED 모델의 스펙 표 한 줄씩. **값이 없으면 지어내지 않고 '—'** 다(가짜 스펙 금지).
 * @returns {{ kpi: Array<{k,v}>, rows: Array<{k,v}> }}
 */
export function ledSpecRows(m) {
  if (!m) return { kpi: [], rows: [] };
  const pair = (a, b, unit) => (a == null && b == null ? '—' : `${dash(a)} / ${dash(b)}${unit}`);
  return {
    kpi: [
      { k: '픽셀 피치', v: m.pitch != null ? `${num(m.pitch, 4)}mm` : '—' },
      { k: '캐비닛 해상도', v: m.resW && m.resH ? `${m.resW}×${m.resH}` : '—' },
      { k: '밝기 (최대 / 보정)', v: pair(num(m.brightnessPeak), num(m.brightnessReduced), ' nit') },
      { k: '무게', v: m.weight != null ? `${num(m.weight, 1)}kg` : '—' },
    ],
    rows: [
      { k: '캐비닛 크기 (W×H×D)', v: `${dash(num(m.cabW, 2))} × ${dash(num(m.cabH, 2))} × ${dash(num(m.depth, 2))} mm` },
      { k: '소비전력 (최대 / 평균)', v: pair(num(m.maxPower, 1), num(m.typicalPower, 1), ' W') },
      { k: '주사율', v: m.refreshHz ? `${num(m.refreshHz)} Hz` : '—' },
      { k: '권장 시청 거리', v: m.ovd_m != null ? `${num(m.ovd_m, 1)} m` : '—' },
      { k: '컨트롤러 (S-Box)', v: m.sbox ? `${m.sbox}${m.maxInputW && m.maxInputH ? ` · 최대 입력 ${m.maxInputW}×${m.maxInputH}` : ''}` : '—' },
      { k: '부품 코드', v: dash(m.cabinetPart) },
    ],
  };
}
