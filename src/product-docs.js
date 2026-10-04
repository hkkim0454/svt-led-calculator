// product-docs.js — 제품별 **자료** 목록(카탈로그·데이터시트·제안서 PDF, 공식 페이지, 제품 사진). DOM 없음.
//
// 스펙 수치는 여기 적지 않는다 — models.js 가 단일 출처다(두 곳에 적으면 언젠가 서로 달라진다).
// 이 파일은 '어떤 자료가 어디 있는가'만 안다. 제품 정보 팝업과 제품 자료실(app.js)이 읽어서 보여 준다.
//
// ⚠ 배포 사이트(GitHub Pages)와 저장소는 **공개**다. 주소를 아는 누구나 볼 수 있으므로
//   가격표·견적·계약·내부 문서는 올리지 않는다. 삼성 **제품가이드와 제안서는 전부 비밀번호로 암호화한
//   파일(…pdf.lock)만** 올린다(doc-lock.js · tools/lock-doc.mjs, DEC-163 · DEC-164). 원본 PDF 는 올리지 않는다.
//
// 항목 모양 (키 = models.js 의 id)
//   catalog   { file, title, page, notice, locked }   제품가이드·카탈로그. file 은 src/ 기준 상대 경로(catalogs/…pdf 또는 …pdf.lock),
//                                             page 는 그 모델이 실린 첫 쪽(없으면 1)
//   datasheet { … }                           같은 모양
//   proposal  { …, locked: true }             제안서 — 파일은 catalogs/…pdf.lock(암호화). 비밀번호를 넣어야 열린다
//   officialUrl  제조사 공식 제품 페이지(https). 확인된 주소만 적는다 — 추측해서 채우지 않는다.
//   images    [{ file, label }]                제품 사진. catalogs/ 안의 파일이거나 삼성 공식 이미지 서버 주소(링크만, 복사 안 함)
//   notice 는 자료에 붙은 저작권 안내 문구다. 팝업이 그대로 보여 준다.
//
// 오너가 PDF 를 보내 주면 src/catalogs/ 에 넣고 여기에 한 줄을 더한다(2026-10-03, DEC-159).

export const DOCS_DIR = 'catalogs/';

// 삼성 자료 게시 — 오너가 '삼성 동의를 받음'을 확인하고 게시를 지시했다(DEC-160 · DEC-163).
const SAMSUNG_NOTICE = '삼성전자 자료입니다. 삼성전자의 동의 없이 제3자에게 복제·배포할 수 없습니다.';
const doc = (file, title, extra = {}) => Object.freeze({ file: DOCS_DIR + file, title, notice: SAMSUNG_NOTICE, ...extra });
const at = (d, page) => Object.freeze({ ...d, page });

// ── 제품가이드 — 암호화 파일. 비밀번호를 넣어야 열린다(오너 지시 2026-10-04, DEC-164) ──
const LED_GUIDE = doc('samsung-led-indoor-guide.pdf.lock', '삼성 LED 사이니지 실내용 제품가이드', { kind: 'guide', locked: true, pages: 7 });
const LCD_STANDALONE = doc('samsung-lcd-standalone-guide.pdf.lock', '삼성 LCD 사이니지 단독형 제품가이드', { kind: 'guide', locked: true, pages: 47 });
const LCD_QH115 = doc('samsung-lcd-qh115fx-guide.pdf.lock', '삼성 LCD 사이니지 단독형 QHFX(115형) 제품가이드', { kind: 'guide', locked: true, pages: 2 });
const LCD_VIDEOWALL = doc('samsung-lcd-videowall-guide.pdf.lock', '삼성 LCD 비디오월 제품가이드', { kind: 'guide', locked: true, pages: 18 });
// ── 제안서 — 암호화 파일. 비밀번호를 넣어야 열린다(DEC-163) ──
const MPF_PROPOSAL = doc('samsung-led-mpf-proposal.pdf.lock', '삼성 스마트 LED 사이니지 MPF 시리즈 제안서', { kind: 'proposal', locked: true, pages: 18 });
const MMF_PROPOSAL = doc('samsung-led-mmf-proposal.pdf.lock', '삼성 스마트 LED 사이니지 MMF 시리즈 제안서', { kind: 'proposal', locked: true, pages: 14 });
const SPATIAL_PROPOSAL = doc('samsung-lcd-spatial-proposal.pdf.lock', '삼성 스페이셜 사이니지 제안서', { kind: 'proposal', locked: true, pages: 20 });

// MPF 제품 사진 — 삼성 미국 공식 제품 페이지의 사진을 **링크**한다(파일을 저장소에 복사하지 않는다).
//   오너 지시(2026-10-04): 공식 페이지에서는 이미지만 쓴다. 주소가 바뀌면 그 사진만 비어 보인다.
const SS_IMG = 'https://images.samsung.com/is/image/samsung/p6pim/us/';
const ssImg = (path, label) => Object.freeze({ file: `${SS_IMG}${path}?$product-details-jpg$`, label });
const mpfA = (sku, n) => `${sku}/gallery/us-led-signage-${sku}-mpf-the-wall-premium-indoor-led-display-black-${n}`;
const mpfImages = (sku, [front, persp, back, dim]) => Object.freeze([
  ssImg(mpfA(sku, front), '정면'), ssImg(mpfA(sku, persp), '사선'), ssImg(mpfA(sku, back), '후면'), ssImg(mpfA(sku, dim), '치수')]);
const mpf012 = n => `lh012mpfaaa-go/gallery/us-mpf-571024-lh012mpfaaa-go-${n}`;

export const PRODUCT_DOCS = Object.freeze({
  // MMF 시리즈(LH009/012/015MMFRGS) — 제품가이드 3쪽 · 제안서 13쪽(사양)
  MM009F: { catalog: at(LED_GUIDE, 3), proposal: at(MMF_PROPOSAL, 13) },
  MM012F: { catalog: at(LED_GUIDE, 3), proposal: at(MMF_PROPOSAL, 13) },
  MM015F: { catalog: at(LED_GUIDE, 3), proposal: at(MMF_PROPOSAL, 13) },
  // IFR 시리즈(LH015/025/040IFRCLS) — 5쪽. P2.0(IF020R)은 이 자료에 없다.
  IF015R: { catalog: at(LED_GUIDE, 5) }, IF025R: { catalog: at(LED_GUIDE, 5) }, IF040R: { catalog: at(LED_GUIDE, 5) },
  // IEA(LH015IEACLS) — 7쪽. P2.0·2.5·4.0 은 이 자료에 없다.
  IE015A: { catalog: at(LED_GUIDE, 7) },
  // MPF 시리즈(LH008/012/016MPFAAA) — 제안서 17쪽(사양) · 공식 페이지 사진
  MP008F: { proposal: at(MPF_PROPOSAL, 17), images: mpfImages('lh008mpfaaa-go', [550079002, 550079008, 550079010, 550079006]) },
  MP012F: { proposal: at(MPF_PROPOSAL, 17), images: Object.freeze([
    ssImg(mpf012(550063999), '정면'), ssImg(mpf012(550063987), '사선'), ssImg(mpf012(550063986), '후면'), ssImg(mpf012(550063988), '측면')]) },
  MP016F: { proposal: at(MPF_PROPOSAL, 17), images: mpfImages('lh016mpfaaa-go', [550079043, 550079049, 550079051, 550079047]) },
});

// LCD 사이니지(signage-data.js 의 modelCode) — 제품가이드의 그 모델이 실린 쪽(모델 코드로 대조, 2026-10-04).
const sv = (d, page) => Object.freeze({ manual: at(d, page) });
export const SIGNAGE_DOCS = Object.freeze({
  // QMC 10쪽 · QHC 12쪽 (단독형 제품가이드)
  ...Object.fromEntries(['LH32QMCEBGCXKR', 'LH43QMCEBGCXKR', 'LH50QMCEBGCXKR', 'LH55QMCEBGCXKR', 'LH65QMCEBGCXKR',
    'LH75QMCEBGCXKR', 'LH85QMCEBGCXKR', 'LH98QMCEBGCXKR'].map(c => [c, sv(LCD_STANDALONE, 10)])),
  ...Object.fromEntries(['LH43QHCEBGCXKR', 'LH50QHCEBGCXKR', 'LH55QHCEBGCXKR', 'LH65QHCEBGCXKR', 'LH75QHCEBGCXKR']
    .map(c => [c, sv(LCD_STANDALONE, 12)])),
  LH115QHFEBGXKR: sv(LCD_QH115, 1),
  // 비디오월 — 베젤 3.5mm(VMB-U) 10쪽 · 1.74mm(E) 5쪽 · 0.88mm(R) 15쪽
  LH46VMBUBGBXKR: sv(LCD_VIDEOWALL, 10), LH55VMBUBGBXKR: sv(LCD_VIDEOWALL, 10),
  LH55VMHEBGBXKR: sv(LCD_VIDEOWALL, 5), LH55VHHEBGBXKR: sv(LCD_VIDEOWALL, 5),
  LH55VMCRBGBXKR: sv(LCD_VIDEOWALL, 15), LH55VHCRBGBXKR: sv(LCD_VIDEOWALL, 15),
});

/** 제품 자료실 — 올린 자료 전부(제품가이드 · 제안서). 전부 비밀번호를 넣어야 열린다. */
export const DOC_LIBRARY = Object.freeze([
  { group: 'LED', for: 'MMF · IFR · IEA 시리즈', doc: LED_GUIDE },
  { group: 'LED', for: 'MPF 시리즈(MP008F · MP012F · MP016F)', doc: MPF_PROPOSAL },
  { group: 'LED', for: 'MMF 시리즈(MM009F · MM012F · MM015F)', doc: MMF_PROPOSAL },
  { group: 'LCD', for: '단독형 QMC · QHC 외', doc: LCD_STANDALONE },
  { group: 'LCD', for: '단독형 QH115FX(115형)', doc: LCD_QH115 },
  { group: 'LCD', for: '비디오월 VM · VH 시리즈', doc: LCD_VIDEOWALL },
  { group: 'LCD', for: '스페이셜 사이니지', doc: SPATIAL_PROPOSAL },
].map(Object.freeze));

/** 이 자료는 비밀번호로 잠겨 있는가. */
export const DOC_KIND_LABEL = Object.freeze({ guide: '제품가이드', proposal: '제안서' });
export const isLockedDoc = d => !!(d && d.locked);

const EMPTY = Object.freeze({ catalog: null, datasheet: null, proposal: null, officialUrl: null, images: Object.freeze([]) });

/** 그 제품의 자료. 등록이 없으면 빈 묶음(전부 null·빈 목록)이다. */
export function docsFor(id) {
  const d = PRODUCT_DOCS[id];
  if (!d) return EMPTY;
  return {
    catalog: d.catalog || null,
    datasheet: d.datasheet || null,
    proposal: d.proposal || null,
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
