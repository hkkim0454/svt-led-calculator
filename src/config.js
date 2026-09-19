// config.js — '구성(설정) 저장/불러오기'의 데이터 규격 + 검증/이관 로직 (순수 함수, DOM 없음).
// ─────────────────────────────────────────────────────────────────────────────
// 화면의 입력값(공간·배열·옵션·선택 모델 등)을 하나의 '구성' 객체로 다루기 위한 스키마.
// app.js 는 화면값을 이 규격의 평범한 객체로 모아 저장하고, 불러올 때 normalizeConfig()로
// 통과시켜 안전하게 복원한다(누락 항목은 기본값, 잘못된 타입은 무시). 계산은 하지 않는다.
// 가격표(prices.local.js)와 가격 데이터는 구성에 포함하지 않는다(별도 저장).
// ─────────────────────────────────────────────────────────────────────────────

// 저장 포맷 버전. 스키마가 바뀌면 올리고, 필요 시 migrate()에서 옛 버전을 이관한다.
export const CONFIG_VERSION = 1;

// 항목이 없을 때 채우는 기본값(초기 화면 상태와 동일한 성격의 값).
export const CONFIG_DEFAULTS = Object.freeze({
  spaceW: 8000,
  spaceH: 3400,
  spaceD: 0,             // 공간 깊이(mm). 0 = 비움(공간 타입별 자동) — 3D 뷰 전용
  roomType: 'meeting',   // 3D 뷰 공간 타입(회의실·강의실·강당·상황실)
  roomOpts: null,        // 그 타입의 옵션(테이블 모양·좌석 수 등). null = 타입 기본값
  // 3D 뷰 공간 디자인(대기업 회의실·임원 회의실·대회의실). null = 그 타입의 기본 디자인.
  //   **여기서는 문자열인지만 본다** — 어떤 디자인이 실재하는지는 room-design.js가 안다
  //   (이 파일이 가구·마감 규칙을 알 필요는 없다. roomOpts와 같은 방침이다).
  roomDesign: null,
  wallThk: 100,          // 벽 두께(mm) — 3D 뷰 전용. 방 안쪽 치수(W×H×D)는 그대로 둔다
  customViews: null,     // 3D 뷰에서 사용자가 저장한 시점 목록. null = 없음
  // 3D 뷰에 세우는 축척 기준 인물(서 있는 사람)을 보일지. **기본은 켬**이다 —
  //   릴리스된 네 공간의 동결 화면이 이 사람을 포함한 상태이므로(PHASE 6-0 감사, DEC-126),
  //   항목이 없는 옛 저장값도 반드시 켠 상태로 복원되어야 예전 화면이 그대로 나온다.
  person3d: true,
  baseHeight: 1000,      // 바닥에서 LED 아래까지(mm)
  ledW: 4000,            // 'LED 크기 지정' 모드의 LED 가로(mm)
  ledH: 2300,            // 'LED 크기 지정' 모드의 LED 세로(mm)
  mode: 'fill',          // 'fill'(자동 채움) | 'ledsize'(LED 크기 지정) | 'manual'(직접 지정)
  manCols: 0,
  manRows: 0,
  redundancy: false,     // SBOX 이중화
  cs4b: false,           // 사용자 선택 CS4B(광전송). MMF는 화면에서 항상 강제됨
  gbicFB: false,         // Gbic 포워드/백워드(광 이중화)
  highWork: false,       // 고소작업 할증
  spareRate: '',         // 예비율 입력칸 문자열. ''(빈칸) = 자동(시리즈 기본율)
  spareEdited: false,    // 사용자가 예비율을 직접 입력했는지
  sboxSpare: 1,          // 예비 SBOX 수량
  signalMode: 'off',     // 'off' | 'fhd' | 'uhd' | 'both'
  selectedId: null,      // 선택한 모델 id
  selectedModel: null,   // 선택 모델 스냅샷(직접 추가한 커스텀 모델도 복원되도록)
  etcCost: 0,            // 기타 자재 원가
  etcSell: 0,            // 기타 자재 견적
  visibleLines: null,    // 라인 필터(문자열 배열). null = 현재 상태 유지
  indirectDisabled: null,// 꺼진 간접비 항목명(배열). null = 가격표 기준 초기화 유지
});

const VALID_MODES = new Set(['fill', 'ledsize', 'manual']);
const VALID_SIGNALS = new Set(['off', 'fhd', 'uhd', 'both']);

const asBool = (v, d) => (typeof v === 'boolean' ? v : d);
const asStr = (v, d) => (typeof v === 'string' ? v : d);
const asNum = (v, d) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return d;
};
const asStrArray = (v, d) => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : d);

// 잘못됐거나 오래된 저장 데이터를 현재 스키마의 안전한 구성 객체로 변환한다.
// - object 가 아니면 전부 기본값.
// - 각 항목은 타입이 맞을 때만 쓰고, 아니면 기본값으로 채운다.
// - 알 수 없는 항목은 버린다(결과에 포함하지 않음).
export function normalizeConfig(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const D = CONFIG_DEFAULTS;
  const mode = VALID_MODES.has(r.mode) ? r.mode : D.mode;
  const signalMode = VALID_SIGNALS.has(r.signalMode) ? r.signalMode : D.signalMode;
  const selectedModel = (r.selectedModel && typeof r.selectedModel === 'object') ? r.selectedModel : D.selectedModel;
  return {
    spaceW: asNum(r.spaceW, D.spaceW),
    spaceH: asNum(r.spaceH, D.spaceH),
    spaceD: asNum(r.spaceD, D.spaceD),
    roomType: asStr(r.roomType, D.roomType),
    // 옵션은 타입마다 항목이 달라 여기서는 '객체면 그대로' 두고, 화면에서 타입 스키마로 정리한다
    //   (room-presets.js의 normalizeOptions). 이 파일이 가구 규칙을 알 필요는 없다.
    roomOpts: (r.roomOpts && typeof r.roomOpts === 'object' && !Array.isArray(r.roomOpts)) ? { ...r.roomOpts } : D.roomOpts,
    // 모르는 값·빈 값은 그대로 null로 둔다 → 화면이 normalizeDesign()으로 그 타입의 기본 디자인으로 떨어뜨린다.
    roomDesign: asStr(r.roomDesign, D.roomDesign),
    wallThk: asNum(r.wallThk, D.wallThk),
    // 저장된 시점은 형태만 확인하고 그대로 둔다(카메라 좌표의 의미는 3D 뷰가 안다).
    customViews: Array.isArray(r.customViews)
      ? r.customViews.filter(v => v && typeof v === 'object'
          && Array.isArray(v.position) && v.position.length === 3
          && Array.isArray(v.target) && v.target.length === 3)
        .slice(0, 24).map(v => ({ ...v }))
      : D.customViews,
    // 항목이 없으면(예전 저장값) 기본값 true 로 떨어진다 — 릴리스된 동작 그대로다.
    person3d: asBool(r.person3d, D.person3d),
    baseHeight: asNum(r.baseHeight, D.baseHeight),
    ledW: asNum(r.ledW, D.ledW),
    ledH: asNum(r.ledH, D.ledH),
    mode,
    manCols: asNum(r.manCols, D.manCols),
    manRows: asNum(r.manRows, D.manRows),
    redundancy: asBool(r.redundancy, D.redundancy),
    cs4b: asBool(r.cs4b, D.cs4b),
    gbicFB: asBool(r.gbicFB, D.gbicFB),
    highWork: asBool(r.highWork, D.highWork),
    spareRate: asStr(r.spareRate, D.spareRate),
    spareEdited: asBool(r.spareEdited, D.spareEdited),
    sboxSpare: asNum(r.sboxSpare, D.sboxSpare),
    signalMode,
    selectedId: (typeof r.selectedId === 'string' ? r.selectedId : D.selectedId),
    selectedModel,
    etcCost: asNum(r.etcCost, D.etcCost),
    etcSell: asNum(r.etcSell, D.etcSell),
    visibleLines: asStrArray(r.visibleLines, D.visibleLines),
    indirectDisabled: asStrArray(r.indirectDisabled, D.indirectDisabled),
  };
}

// 저장 항목(레코드) 한 건을 감싼다: { v, name, savedAt, data }.
export function makeRecord(name, config, savedAt = new Date().toISOString()) {
  return { v: CONFIG_VERSION, name: String(name || '이름없음'), savedAt, data: normalizeConfig(config) };
}

// 저장 목록(배열)을 안전하게 정리한다: 배열이 아니면 [], 각 레코드는 정규화, 최신 저장 우선 정렬.
export function normalizeRecords(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .filter(x => x && typeof x === 'object' && typeof x.name === 'string')
    .map(x => makeRecord(x.name, x.data, typeof x.savedAt === 'string' ? x.savedAt : undefined))
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

// ─── 파일 내보내기/가져오기(공유) ───────────────────────────────────────────
// 내보낸 파일임을 표시하는 앱 태그. 가져올 때 형식 확인·안내에 쓴다.
export const EXPORT_APP = 'svt-led-config';

// 구성 레코드들을 공유용 묶음(bundle) 객체로 만든다. 파일로 저장할 내용.
export function exportBundle(records, exportedAt = new Date().toISOString()) {
  return { app: EXPORT_APP, v: CONFIG_VERSION, kind: 'bundle', exportedAt, records: normalizeRecords(records) };
}

// 가져온(파싱된) 임의 객체를 구성 레코드 배열로 관대하게 변환한다.
// 지원 형식: 묶음({records:[...]}), 레코드 배열, 단일 레코드({name,data}),
//   data만 있는 객체, 원시 구성 객체(spaceW 등). 인식 불가 시 빈 배열.
export function parseImport(raw) {
  if (Array.isArray(raw)) return normalizeRecords(raw);
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.records)) return normalizeRecords(raw.records);
    if (typeof raw.name === 'string') return [makeRecord(raw.name, raw.data ?? raw, typeof raw.savedAt === 'string' ? raw.savedAt : undefined)];
    if (raw.data && typeof raw.data === 'object') return [makeRecord('가져온 구성', raw.data)];
    // 원시 구성 객체로 보이면(설정 키가 하나라도 있으면) 단일 구성으로 취급.
    const keys = Object.keys(CONFIG_DEFAULTS);
    if (keys.some(k => k in raw)) return [makeRecord('가져온 구성', raw)];
  }
  return [];
}

// 이름 충돌을 피해 고유한 이름을 만든다: 'A' → 'A (2)' → 'A (3)' …
export function uniqueName(name, existingNames) {
  const taken = new Set(existingNames);
  const base = String(name || '이름없음');
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10000; i++) {
    const cand = `${base} (${i})`;
    if (!taken.has(cand)) return cand;
  }
  return `${base} (${Date.now()})`;
}

// 기존 목록에 가져온 레코드들을 합친다(덮어쓰지 않고 이름 충돌은 자동 개명).
// 반환: { list: 합쳐진 목록(정리·정렬됨), added: 추가 수, renamed: 개명 수 }.
export function mergeRecords(existing, incoming) {
  const list = normalizeRecords(existing);
  const names = list.map(r => r.name);
  let added = 0, renamed = 0;
  for (const rec of normalizeRecords(incoming)) {
    const nm = uniqueName(rec.name, names);
    if (nm !== rec.name) renamed++;
    names.push(nm);
    list.push({ ...rec, name: nm });
    added++;
  }
  return { list: normalizeRecords(list), added, renamed };
}
