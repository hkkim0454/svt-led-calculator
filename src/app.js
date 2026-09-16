// app.js — UI controller. Pure calculation lives in engine.js; data in models.js.
import { computeConfig, computeQuote, cabinetResolution, DEFAULTS, spareRateForSeries, frameClearanceMm } from './engine.js?v=276';
import { MODELS } from './models.js?v=276';
import { PROCESSORS } from './processor-data.js?v=276';
import { processorRequirements, inputsCapacity, outputCapacity, outputCapacity2k } from './processor-limits.js?v=276';
import { rankProcessors, validateBuild } from './processor-validator.js?v=276';
import { CONFIG_DEFAULTS, normalizeConfig, makeRecord, normalizeRecords, exportBundle, parseImport, mergeRecords } from './config.js?v=276';
import { listShared, uploadShared, deleteShared, listCases, addCases, deleteCase, updateCase } from './share-remote.js?v=276';
import { parseCasesText, normalizeDate } from './cases.js?v=276';
import { SIGNAGE_MODELS } from './signage-data.js?v=276';
// 3D(아이소메트릭) 미리보기 — 좌표·가구 배치·그리기. 계산(배열·스펙)은 engine.js 그대로 쓴다.
import { CUBE_VIEWS, DEFAULT_CUBE_VIEW, cubeView } from './scene3d.js?v=383';
import { ROOM_TYPES, DEFAULT_ROOM_TYPE, roomType, defaultOptions, normalizeOptions, autoDepthForType, layoutRoom, personSpot } from './room-presets.js?v=383';
import { createViewerGL } from './render3d-gl.js?v=383';
import { buildGLModel, CAMERA_PRESETS, DEFAULT_PRESET, cameraPreset } from './gl-model.js?v=383';

// 가격표 출처(우선순위): ① 이 브라우저 저장값(localStorage, '가격표 불러오기'로 저장) →
//   ② prices.local.js(사내 로컬 실행 시). 가격은 저장소·공개웹에 없으며, 브라우저에만 저장된다.
//   공개 방문자는 저장값이 없어 06에 가격이 뜨지 않는다.
const PRICES_KEY = 'svtled_prices_v1';
let PRICES = null;
function readStoredPrices() { try { const s = localStorage.getItem(PRICES_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
PRICES = readStoredPrices();
if (!PRICES) { try { PRICES = (await import('./prices.local.js?v=182')).PRICES; } catch { PRICES = null; } }

// 사용자가 고른 가격표 파일(prices.local.js 등)을 읽어 브라우저에 저장한다. 파일은 업로드되지 않고 로컬에서만 처리.
async function importPriceFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let prices = null;
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      prices = JSON.parse(trimmed);                    // 순수 JSON도 허용
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try { prices = (await import(/* @vite-ignore */ url)).PRICES; } finally { URL.revokeObjectURL(url); }
    }
    if (!prices || typeof prices !== 'object' || !prices.panels) throw new Error('가격표 형식이 아닙니다(PRICES.panels 없음).');
    PRICES = prices;
    indirectDisabled = null;   // 새 가격표의 기본 on/off로 재초기화
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
    renderAll();
    alert('가격표를 불러왔습니다. 이 브라우저에 저장되어 다음에 열 때도 자동으로 표시됩니다.');
  } catch (e) {
    alert('가격표 파일을 읽지 못했습니다.\nprices.local.js 파일이 맞는지 확인하세요.\n\n(' + e.message + ')');
  }
}
function clearStoredPrices() {
  if (!confirm('이 브라우저에 저장된 가격표를 삭제할까요? (파일 원본은 그대로 남습니다)')) return;
  localStorage.removeItem(PRICES_KEY); PRICES = null; indirectDisabled = null; renderAll();
}

// 간접비 항목 on/off 상태(화면 체크박스). null = 가격표 기준(enabled:false)으로 초기화 필요.
let indirectDisabled = null;
// 간접비 상세 펼침 상태(기본 닫힘). 재렌더 시에도 유지.
let indirectOpen = false;
function ensureIndirectDefaults() {
  if (indirectDisabled) return;
  indirectDisabled = new Set((PRICES?.indirect?.items || []).filter(i => i.enabled === false).map(i => i.name));
}

// Sales lines shown by default. Marketing name (label) -> internal series code.
const LINE_NAMES = { MP: 'MPF', MM: 'MMF', IF: 'IFR', IFM: 'IFR-M', IE: 'IEA', IEE: 'IEA-E' };
// 기본 노출 라인 + 기본 표시 순서 (IFR → IFR-M → IEA → IEA-E → MMF → MPF).
const SALES_LINES = ['IF', 'IFM', 'IE', 'IEE', 'MM', 'MP'];

// 기본 모델 목록: 라인을 SALES_LINES 순서로 배치한다. 같은 라인 내부(피치 순)와
// 사용자 커스텀 정렬(▲▼)·JSON 불러오기 순서는 stable sort 로 그대로 보존된다.
const lineRank = s => { const i = SALES_LINES.indexOf(s); return i < 0 ? SALES_LINES.length : i; };
const defaultModels = () => structuredClone(MODELS).sort((a, b) => lineRank(a.series) - lineRank(b.series));

// 앞으로 기본 선택 모델 = IFR-M(IF015R-M). 목록에 없으면 첫 모델로 대체.
const DEFAULT_MODEL_ID = 'IF015RM';
const pickDefaultId = list => (list.find(m => m.id === DEFAULT_MODEL_ID)?.id) ?? list[0]?.id ?? null;

let models = defaultModels();
let selectedId = pickDefaultId(models);
let mode = 'ledsize';  // 기본 = 자동 채움(LED 설치 크기, 비우면 벽면). 'manual' = 배열 직접 지정.
let editingId = null;
let signalMode = 'off'; // 'off' | 'fhd' | 'uhd' — signal-region overlay on the preview
// 사용자가 직접 선택한 CS4B 여부(비-MMF 모델용). MMF는 항상 CS4B 필수이므로 체크박스를 강제한다.
let userCS4B = false;
// 예비율 입력칸 자동 표시: 모델·공간에 맞는 예비 비율(%)을 자동 기입한다.
//   spareEdited=false → 자동(엔진은 시리즈 규칙 사용, 칸은 환산 %를 표시).
//   spareEdited=true  → 사용자가 직접 입력한 %가 우선.
let spareEdited = false;
let spareModelId = null;   // 모델 전환 감지(전환 시 자동 모드로 복귀)
// 삼성 판매 정책(2026-07-24): 앞으로 P0.8~P1.8 제품만 판매. 이 범위 밖은 기본 화면에서 숨김.
const MIN_PITCH = 0.8;
const MAX_PITCH = 1.8;
const pitchOk = m => m.pitch >= MIN_PITCH - 1e-9 && m.pitch <= MAX_PITCH + 1e-9;
// 화면 노출 대상: 판매범위(P0.8~1.8) 안이거나, 사용자가 라이브러리에서 불러온/직접 추가한 모델(_show).
const shown = m => pitchOk(m) || m._show === true;
let visibleLines = new Set(SALES_LINES);

const $ = s => document.querySelector(s);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
// 벽면 크기 입력(#spaceW/#spaceH)은 m 단위로 받는다. 내부 계산·저장·공유는 모두 mm이므로 읽을 때 ×1000 환산.
//   (반대로 화면에 되쓸 때는 c.spaceW/1000 — applyConfig 참조.)
const spaceWmm = () => num($('#spaceW').value) * 1000;
const spaceHmm = () => num($('#spaceH').value) * 1000;
// 공간 깊이(앞뒤)는 3D 뷰에서만 쓴다. 비워두면 0 → 공간 타입별 자동값(autoDepthForType).
const spaceDmm = () => num($('#spaceD')?.value) * 1000;
const fmt = (n, d = 0) => (isFinite(n) && n != null) ? n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
// 피치 표기: 최대 소수 2자리, 끝자리 0은 생략 (1.5→"1.5", 1.25→"1.25", 1.5625→"1.56").
const fmtPitch = p => (p != null && isFinite(p)) ? p.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
// mm → m 표기: 최대 소수 3자리, 끝자리 0은 생략 (3840→"3.84", 4000→"4").
const fmtMeters = mm => (isFinite(mm) ? (mm / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : '—');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => 'm' + Math.random().toString(36).slice(2, 8);

// Data-reliability badge (3 levels): verified / derived / needs-verification.
function statusBadge(m) {
  if (m.dataStatus === 'verified') return '<span class="chk">✓ 검증</span>';
  if (m.dataStatus === 'needs-verification') return '<span class="todo">확인 필요</span>';
  return '<span class="derived">파생</span>';
}

function sboxText(v) { return v == null ? '—' : (v === 0 ? '내장' : fmt(v)); }

const lineLabel = s => LINE_NAMES[s] ?? (s || '기타');
// 모델명을 여러 표기로 인식한다: 제품코드(MM015F), 라인+코드(MMF015), 시리즈+코드(MM015) 등.
//   설치 사례에 사용자가 다양하게 적어도 실제 모델을 찾아내기 위함(대소문자·공백·기호 무시).
const normName = s => String(s ?? '').toUpperCase().replace(/[\s._\-]/g, '');
function findModelByName(raw) {
  const q0 = String(raw ?? '').trim(); if (!q0) return null;
  const q = normName(q0);
  const digits = m => (String(m.name).match(/\d+/) || [''])[0];
  // 1) 별칭 정확 일치: 제품코드(MM015F)·id·라인+코드(MMF015)·시리즈+코드(MM015)
  let m = models.find(mm => [mm.name, mm.id, lineLabel(mm.series) + digits(mm), mm.series + digits(mm)]
    .map(normName).includes(q));
  if (m) return m;
  // 2) 라인 + 피치 표기(예: "MMF P1.5", "IFR 1.5"): 라인 일치 후보 중 피치가 가장 가까운 모델.
  const pm = /(\d+(?:\.\d+)?)/.exec(q0);
  const letters = q.replace(/[^A-Z]/g, '').replace(/P$/, '');   // 숫자 제거→라인힌트, 끝의 P 제거
  if (pm && letters) {
    const pitch = parseFloat(pm[1]);
    const lineOk = mm => normName(lineLabel(mm.series)) === letters || normName(mm.series) === letters;
    let best = null, bd = Infinity;
    for (const mm of models) if (lineOk(mm)) { const d = Math.abs(mm.pitch - pitch); if (d < bd) { bd = d; best = mm; } }
    if (best && bd <= 0.2) return best;
  }
  return null;
}
function familiesInOrder() { const seen = []; for (const m of models) if (shown(m) && !seen.includes(m.series)) seen.push(m.series); return seen; }
const visibleModels = () => models.filter(m => visibleLines.has(m.series) && shown(m));
function ensureSelectionVisible() {
  const vis = visibleModels();
  if (!vis.some(m => m.id === selectedId)) selectedId = vis[0]?.id ?? null;
}

function renderFilters() {
  const el = $('#lineFilter'); if (!el) return;
  el.innerHTML = familiesInOrder().map(s => {
    const on = visibleLines.has(s);
    const n = models.filter(m => m.series === s && shown(m)).length;
    return `<label class="lineChip${on ? ' on' : ''}"><input type="checkbox" data-line="${esc(s)}"${on ? ' checked' : ''}/>${esc(lineLabel(s))}<span class="cnt">${n}</span></label>`;
  }).join('');
}

// 예비율(%) → 소수 비율. 자동 모드(미편집)면 null 반환 → 엔진이 시리즈 기본율 사용
// (IFR·IEA·MMF 5%, MPF 7%). 사용자가 직접 입력하면 그 비율이 우선.
function spareRateOpt() {
  if (!spareEdited) return null;
  const el = $('#spareRate');
  if (!el || el.value === '') return null;
  return Math.max(0, num(el.value)) / 100;
}

// 시리즈 기본 예비율(%). 칸에 자동 표시용. IFR·IEA·MMF 5% · MPF 7%.
function effectiveSparePct(m) {
  return +(spareRateForSeries(m.series) * 100).toFixed(2);
}

// 예비율 칸을 시리즈 기본율로 자동 채운다. 모델이 바뀌면 자동 모드로 복귀.
function syncSpareRate() {
  const el = $('#spareRate'); if (!el) return;
  const m = models.find(x => x.id === selectedId); if (!m) return;
  if (selectedId !== spareModelId) { spareEdited = false; spareModelId = selectedId; }
  if (!spareEdited) { el.value = String(effectiveSparePct(m)); el.placeholder = ''; }
}

// 선택 모델이 MMF면 CS4B 체크박스를 강제 체크+비활성(필수), 그 외에는 사용자 선택값을 따른다.
function syncCS4B() {
  const m = models.find(x => x.id === selectedId);
  const isMMF = m && m.series === 'MM';
  const cb = $('#useCS4B'); if (!cb) return;
  cb.checked = isMMF ? true : userCS4B;
  cb.disabled = !!isMMF;
  cb.closest('.checkline')?.classList.toggle('locked', !!isMMF);
}

// 예비 SBOX 수량(대). 빈칸이면 기본 1대, 값을 넣으면 그 수(0 이상 정수).
function sboxSparesOpt() {
  const el = $('#sboxSpare');
  if (!el || el.value === '') return 1;
  return Math.max(0, Math.floor(num(el.value)));
}

function opts() {
  const redundancy = $('#redundancy')?.checked ?? false;
  const cs4b = $('#useCS4B')?.checked ?? false;
  const gbicFB = $('#gbicFB')?.checked ?? false;
  const spareRate = spareRateOpt();
  const sboxSpares = sboxSparesOpt();
  const baseHeight = num($('#baseHeight')?.value);   // 바닥에서 LED 아래까지(mm)
  const common = { redundancy, cs4b, gbicFB, spareRate, sboxSpares, baseHeight };
  // 배열 직접 지정: 입력칸엔 요청값을 그대로 두되(확장 안내용), 계산·미리보기는 공간에 들어가는 최대치로 제한.
  if (mode === 'manual') { const f = ledManualFit(); return { mode: 'manual', cols: f ? f.cols : num($('#manCols').value), rows: f ? f.rows : num($('#manRows').value), ...common }; }
  // 자동 채움: ② LED 설치 크기(비우면 벽면 = 세로는 하단 높이 위)에 캐비닛을 채운다.
  const lw = num($('#ledW')?.value) || spaceWmm();
  const lh = num($('#ledH')?.value) || Math.max(0, spaceHmm() - baseHeight);
  return { mode: 'ledsize', ledW: lw, ledH: lh, ...common };
}

function renderModelList() {
  const el = $('#modelList'); el.innerHTML = '';
  const vis = visibleModels();
  if (vis.length === 0) { el.innerHTML = '<div class="previewEmpty">표시할 라인이 없습니다. 위에서 제품 라인을 선택하세요.</div>'; return; }
  vis.forEach((m, i) => {
    const row = document.createElement('div');
    row.dataset.id = m.id;
    row.className = 'modelRow' + ((!svCode && m.id === selectedId) ? ' sel' : '');   // 사이니지 모드면 LED 선택 하이라이트 해제
    row.title = '클릭하여 이 모델 적용';
    row.innerHTML = `
      <div class="mvcol">
        <button class="tiny ghost mv" data-act="up" data-id="${m.id}" title="위로"${i === 0 ? ' disabled' : ''}>▲</button>
        <button class="tiny ghost mv" data-act="down" data-id="${m.id}" title="아래로"${i === vis.length - 1 ? ' disabled' : ''}>▼</button>
      </div>
      <div class="minfo">
        <div class="mname">${esc(m.name)} ${statusBadge(m)}</div>
        <div class="mmeta">${esc(lineLabel(m.series))} · ${fmt(m.cabW,1)}×${fmt(m.cabH,1)}mm · P${fmtPitch(m.pitch)}</div>
      </div>
      <div class="acts">
        <button class="tiny ghost" data-act="edit" data-id="${m.id}">편집</button>
        <button class="tiny ghost danger" data-act="del" data-id="${m.id}">삭제</button>
      </div>`;
    el.appendChild(row);
  });
}

// Reorder within the visible list; reflected in the master models[] array.
// Order persists via 데이터 저장/불러오기(JSON) — consistent with the rest of the library.
function moveModel(id, dir) {
  const vis = visibleModels();
  const vi = vis.findIndex(m => m.id === id), tj = vi + dir;
  if (vi < 0 || tj < 0 || tj >= vis.length) return;
  const a = models.indexOf(vis[vi]), b = models.indexOf(vis[tj]);
  [models[a], models[b]] = [models[b], models[a]];
  renderAll();
}

// 03 미리보기 표시 토글(사람/눈높이선/바닥 그리드/치수). 기본 전부 켜짐.
const pvShow = { person: true, eye: true, grid: true, dims: true, cellgrid: true, handle: true };

// ── 3D(아이소메트릭) 뷰 상태 ────────────────────────────────────────────────
//   pvView   : '2d' = 기존 정면 뷰, '3d' = 큐브 시점 아이소메트릭 뷰
//   roomTypeId/roomOpts : 공간 타입(회의실·강의실·강당·상황실)과 그 옵션(테이블 모양·좌석 수 등)
//   pv3dShow : 3D 뷰 전용 표시 토글
let pvView = '2d';
let roomTypeId = DEFAULT_ROOM_TYPE;
let roomOpts = defaultOptions(DEFAULT_ROOM_TYPE);
let cubeViewId = DEFAULT_CUBE_VIEW;   // (구 Canvas 뷰의 시점 id — 구성 저장 호환용으로만 남긴다)
let presetId = DEFAULT_PRESET;        // 3D 카메라 시점 프리셋
let customViews = [];                 // 사용자가 저장한 시점(구성과 함께 저장된다)
let viewEditMode = false;             // 시점 편집 모드 — 켜면 '+'(저장)와 '×'(삭제)가 보인다
const pv3dShow = {
  person: true, dims: true, grid: true, accentWall: true,
  // 벽 4면을 각각 켜고 끈다. 기본은 LED 벽 + 왼쪽 2면 —
  //   카메라 쪽 벽이 없어야 방 안이 들여다보인다(컷어웨이).
  walls: { front: true, back: false, left: true, right: false },
};
let viewer3d = null;   // createViewerGL() 인스턴스(3D 뷰를 처음 열 때 만든다)
let gl3dFailed = false;   // WebGL을 쓸 수 없는 환경인지(한 번 실패하면 다시 시도하지 않는다)
// 사람(스케일 기준 인물): 실사 사진(연예인, 실제 키) + 의상형 실루엣(남/여, 회색 PNG).
//   hMM=키(mm, 실제 인물 키). 모두 photo=내장 이미지(img/people/<file>). 커스텀 업로드 시 그 항목만 대체(세션 한정).
//   같은 인물의 다른 의상은 별도 항목이되 personId 공유, variantId로 구분(이사 지침 2026-09-15).
//   이미지는 인물 실제 영역(머리~발끝)으로 크롭된 투명 PNG → 키 스케일링이 실제 신장과 일치, 발끝=무대 바닥.
//   실루엣도 회색/투명 원본 그대로 사용(재색칠·추가 opacity 금지). 남 173 / 여 160cm 기준.
const PEOPLE = {
  // ── 실사 인물 ──
  'go-youn-jung_01':   { label: '고윤정 · 연두 가디건',   kind: 'photo', hMM: 1630, personId: 'go-youn-jung',   variantId: '01', file: 'go-youn-jung_01.png' },
  'go-youn-jung_02':   { label: '고윤정 · 반팔/치마',     kind: 'photo', hMM: 1630, personId: 'go-youn-jung',   variantId: '02', file: 'go-youn-jung_02.png' },
  'park-bo-gum_01':    { label: '박보검 · 베이지 재킷',   kind: 'photo', hMM: 1820, personId: 'park-bo-gum',    variantId: '01', file: 'park-bo-gum_01.png' },
  'byeon-woo-seok_01': { label: '변우석 · 화이트 턱시도', kind: 'photo', hMM: 1890, personId: 'byeon-woo-seok', variantId: '01', file: 'byeon-woo-seok_01.png' },
  'o-se-hun_01':       { label: '오세훈 · 아이보리 니트', kind: 'photo', hMM: 1830, personId: 'o-se-hun',       variantId: '01', file: 'o-se-hun_01.png' },
  'o-se-hun_02':       { label: '오세훈 · 회색 정장',     kind: 'photo', hMM: 1830, personId: 'o-se-hun',       variantId: '02', file: 'o-se-hun_02.png' },
  // ── 의상형 실루엣(남 173 / 여 160cm) ──
  'silhouette-male-01':   { label: '남성 · 캐주얼 정장',   kind: 'photo', hMM: 1730, personId: 'silhouette-male',   variantId: '01', file: 'silhouette-male-01.png' },
  'silhouette-male-02':   { label: '남성 · 캐주얼',        kind: 'photo', hMM: 1730, personId: 'silhouette-male',   variantId: '02', file: 'silhouette-male-02.png' },
  'silhouette-male-03':   { label: '남성 · 비즈니스 정장', kind: 'photo', hMM: 1730, personId: 'silhouette-male',   variantId: '03', file: 'silhouette-male-03.png' },
  'silhouette-female-01': { label: '여성 · 가디건',        kind: 'photo', hMM: 1600, personId: 'silhouette-female', variantId: '01', file: 'silhouette-female-01.png' },
  'silhouette-female-02': { label: '여성 · 캐주얼',        kind: 'photo', hMM: 1600, personId: 'silhouette-female', variantId: '02', file: 'silhouette-female-02.png' },
  'silhouette-female-03': { label: '여성 · 비즈니스 정장', kind: 'photo', hMM: 1600, personId: 'silhouette-female', variantId: '03', file: 'silhouette-female-03.png' },
};
let pvPerson = 'go-youn-jung_01';  // 현재 선택 인물 키(PEOPLE의 키). 기본값은 목록 첫 항목.
const pvPersonImg = {};            // 커스텀 업로드(키=인물키) dataURL. 있으면 내장 이미지 대신 사용(세션 한정).
// 내장 이미지 경로. photo 항목은 file 필드 사용. 이미지 로드 실패는 콘솔에 파일명 명시(조용한 대체 금지).
const personBuiltinSrc = p => `img/people/${(PEOPLE[p] && PEOPLE[p].file) || p + '.png'}`;
let pvImage = null;    // LED 화면에 넣을 이미지(data URL). 세션 한정(구성 저장엔 미포함).
let pvImgAspect = null; // 이미지 가로/세로 비(로드 시 계산).
let pvImgMode = 'width'; // 'width'=가로 고정(가로 꽉·상하 이동) / 'height'=세로 고정(세로 꽉·좌우 이동).
let pvImgPanY = 0.5;    // 세로 넘침 시 크롭 위치(0=위, 1=아래) — 가로 고정 모드.
let pvImgPanX = 0.5;    // 가로 넘침 시 크롭 위치(0=좌, 1=우) — 세로 고정 모드.
let pvLedGeom = null;   // 최근 렌더 LED 로컬 px {mode, lw, lh, iw, ih, range} — 드래그 팬 계산용.
let pvHeightDrag = null; // ↕ 손잡이 드래그용 {pxPerMm, maxBaseMM} — renderPreview가 매번 갱신.
let svCode = null;      // 03 미리보기에 표시할 사이니지 modelCode(있으면 LED 대신 사이니지 방을 그림). null=LED.
let svPortrait = false; // 단독형 사이니지 세로(90° 회전) 설치 여부(이사 요청 2026-09-15). 비디오월엔 미적용.
let syncSignageCard = () => {};   // 10 사이니지 카드 재렌더(setupSignage에서 실제 함수로 대입).
// 현재 03 미리보기에 비디오월이 선택돼 있는지(패널 격자 필수 판정 등에 사용).
function vwSelected() {
  if (!svCode) return false;
  const m = SIGNAGE_MODELS.find(x => x.modelCode === svCode);
  return !!m && m.category === 'video_wall';
}

// 배열을 공간 밖으로 넓혀 확장할 때 확보할 좌우 여백(각 변, mm). 이사 요청 2026-09-14: 좌우 500~600mm 고정.
const EXPAND_SIDE_MARGIN_MM = 500;
const LED_EXPAND_BOTTOM_MM = 800;   // LED 배열 직접 지정 확장 시 하단(바닥~디스플레이) 높이 = 800mm 고정(이사 요청 2026-09-15, 기존 500)
const LED_EXPAND_TOP_MM = 100;      // 상단(디스플레이 위~공간 위) 여백

// 사이니지 배치 계산(공용): 요청 장수(reqN×reqM)를 공간 안에 들어가는 최대치(N×M)로 자동 제한하고,
//   요청대로 두려면 필요한 공간(needW×needH mm, 좌우 여백 고정·화면 하단 높이 유지)을 함께 돌려준다.
//   renderPreview(3D 배치)와 사이니지 요약(안내·확장 버튼)이 같은 값을 쓰도록 한 곳에서 계산한다.
function computeSvFit() {
  const m = svCode ? SIGNAGE_MODELS.find(x => x.modelCode === svCode) : null;
  if (!m) return null;
  const isVW = m.category === 'video_wall';
  // 세로 설치(svPortrait): 패널 가로·세로를 맞바꿔 90° 회전 표시(이사 요청 2026-09-15).
  //   단독형·비디오월 모두 적용(비디오월은 각 패널이 세로로 회전, 배열 N×M은 그대로).
  const portrait = svPortrait;
  const pw = portrait ? m.physical.heightMm : m.physical.widthMm;
  const ph = portrait ? m.physical.widthMm : m.physical.heightMm;
  const bh = Math.max(0, num($('#baseHeight')?.value));
  const reqN = isVW ? Math.max(1, Math.min(30, Math.floor(num($('#svCols')?.value) || 1))) : 1;
  const reqM = isVW ? Math.max(1, Math.min(30, Math.floor(num($('#svRows')?.value) || 1))) : 1;
  if (pw == null || ph == null) return { m, isVW, pw: null, ph: null, reqN, reqM, N: reqN, M: reqM, over: false };
  const sW = spaceWmm(), sH = spaceHmm();
  const maxN = Math.floor(sW / pw), maxM = Math.floor(Math.max(0, sH - bh) / ph);
  const N = isVW ? Math.min(reqN, Math.max(1, maxN)) : 1;   // 최소 1장은 표시(패널이 공간보다 커도)
  const M = isVW ? Math.min(reqM, Math.max(1, maxM)) : 1;
  const over = isVW && (N < reqN || M < reqM || maxN < 1 || maxM < 1);   // 패널 1장도 안 들어가는 경우 포함
  const needW = reqN * pw + 2 * EXPAND_SIDE_MARGIN_MM;      // 좌우 여백 고정
  const needH = bh + reqM * ph;                            // 화면 하단 높이(bh)는 그대로 유지, 위로만 확장
  return { m, isVW, pw, ph, reqN, reqM, N, M, maxN, maxM, over, needW, needH, bh };
}

// LED '배열 직접 지정' 계산(공용): 요청 열·행을 공간에 들어가는 최대치로 제한하고, 요청대로 두려면
//   필요한 공간(needW×needH mm)을 함께 돌려준다. opts()·clampManualArray()·확장 안내가 공유.
function ledManualFit() {
  if (mode !== 'manual') return null;
  const m = models.find(x => x.id === selectedId);
  if (!m) return null;
  const bh = Math.max(0, num($('#baseHeight')?.value));
  const fit = computeConfig(m, spaceWmm(), spaceHmm(), { mode: 'fill', baseHeight: bh });
  const maxC = fit.cols || 0, maxR = fit.rows || 0;
  const reqC = Math.max(0, Math.floor(num($('#manCols')?.value) || 0));
  const reqR = Math.max(0, Math.floor(num($('#manRows')?.value) || 0));
  const cols = maxC > 0 ? Math.min(reqC, maxC) : reqC;
  const rows = maxR > 0 ? Math.min(reqR, maxR) : reqR;
  const over = (maxC > 0 && reqC > maxC) || (maxR > 0 && reqR > maxR);
  // 확장 시 여백(이사 요청 2026-09-14): 좌우 각 500 · 하단 500 · 상단 100.
  //   하단 여백은 '디스플레이 하단 높이'(newBase)로 설정하고, 세로 공간 = 하단 500 + 배열 + 상단 100.
  //   미리보기는 LED를 하단 높이에 맞춰 배치(centered=가로만)하므로 이 값이 그대로 500/100 여백이 된다.
  const needW = reqC * m.cabW + 2 * EXPAND_SIDE_MARGIN_MM;                  // 좌우 여백 각 500
  const needH = LED_EXPAND_BOTTOM_MM + reqR * m.cabH + LED_EXPAND_TOP_MM;  // 하단 500 + 배열 + 상단 100
  const newBase = LED_EXPAND_BOTTOM_MM;                                    // 디스플레이 하단 높이 = 500
  return { m, reqC, reqR, maxC, maxR, cols, rows, over, needW, needH, bh, newBase };
}

// 확장 버튼: 공간확정 여부를 물어(confirm) 승인하면 01 설치 공간(가로·세로)을 필요한 크기로 바꾼다.
//   0.1 m 단위로 올림. 화면 하단 높이는 건드리지 않는다.
// 공간 확대 확인 — 세련된 모달 팝업(네이티브 confirm 대체, 이사 요청 2026-09-14). LED 배열 직접 지정·비디오월 공통.
function expandSpaceTo(needW, needH, opts = {}) {
  const wM = Math.ceil(needW / 100) / 10, hM = Math.ceil(needH / 100) / 10;   // mm → m, 0.1 m 올림
  const baseMm = opts.baseHeightMm;   // 지정 시 '디스플레이 하단 높이'도 함께 설정(LED 배열 직접 지정)
  const note = opts.note || `좌우 여백 각 ${EXPAND_SIDE_MARGIN_MM}mm 확보 · 화면 하단 높이 유지`;
  let el = document.querySelector('#expandPop');
  if (!el) {
    el = document.createElement('div'); el.id = 'expandPop'; el.hidden = true; document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-xpclose]')) { el.hidden = true; return; }
      if (e.target.closest('[data-xpok]')) {
        const wEl = $('#spaceW'), hEl = $('#spaceH'), bEl = $('#baseHeight');
        if (wEl) wEl.value = el.dataset.w; if (hEl) hEl.value = el.dataset.h;
        if (bEl && el.dataset.base !== '') bEl.value = el.dataset.base;   // 하단 높이 자동 설정(있을 때만)
        el.hidden = true; setLedMax(); renderAll(); syncSignageCard();
      }
    });
  }
  el.dataset.w = wM.toFixed(1); el.dataset.h = hM.toFixed(1);
  el.dataset.base = (baseMm != null) ? String(Math.round(baseMm)) : '';
  el.innerHTML = `<div class="xpCard" role="dialog" aria-modal="true" aria-label="공간 확대">
      <div class="xpIcon" aria-hidden="true">⤢</div>
      <div class="xpTitle">설치 공간을 넓힐까요?</div>
      <div class="xpBody">요청하신 배열이 현재 공간을 넘어섭니다.<br>설치 공간을 <b>가로 ${wM.toFixed(1)} m × 세로 ${hM.toFixed(1)} m</b> 로 넓혀<br>배열을 그대로 배치합니다.</div>
      <div class="xpNote">${note}</div>
      <div class="xpBtns"><button type="button" class="xpBtn ghost" data-xpclose>취소</button><button type="button" class="xpBtn primary" data-xpok>공간 넓히고 확장</button></div>
    </div>`;
  el.hidden = false;
}

// 미리보기를 CSS 3D 1점 투시로 그린다(원근감 스펙 2026-09-12). 치수 값·계산은 engine 결과 그대로 쓰고
//   위치만 3D 화면에 맞춰 투영한다. 벽 크기·모델·배열이 바뀌어도 동적으로 맞는다(고정 좌표 없음).
// 지금 미리보기에 그릴 대상(모델 또는 사이니지)과 배열 결과를 구한다.
//   정면 뷰(renderPreview)와 3D 뷰(renderPreview3D)가 똑같은 값을 쓰도록 한 곳에서만 계산한다.
//   반환: { m, r, svMode, svSizeInfo, name, error }  — error가 있으면 그릴 수 없는 상태.
function resolvePreviewTarget() {
  const sW = spaceWmm(), sH = spaceHmm();
  // 사이니지가 선택돼 있으면(svCode) LED 대신 3D 방 안에 사이니지를 그린다.
  //   합성 r(캐비닛 배열과 같은 형태의 벽 정보)을 만들어 기존 렌더를 그대로 재사용한다.
  //   단독형=1×1, 비디오월=가로 N×세로 M(패널). 이미지 넣기·검은 테두리 등 LED 기능이 그대로 적용된다.
  const svf = svCode ? computeSvFit() : null;
  const svm = svf ? svf.m : null;
  if (svm) {
    const isVW = svf.isVW;
    const N = svf.N, M = svf.M;   // 공간에 들어가는 최대치로 제한된 장수(초과분은 잘림 — 이사 요청)
    const pw = svf.pw, ph = svf.ph;
    // 인치 표기: 비디오월은 개별 화면 인치(데이터), 단독형은 모델명(예 QM55C→55)에서, 없으면 cm→inch 환산(표시 전용).
    let inch = null;
    if (isVW) inch = svm.display.screenSizeInch;
    else if (svm.model && /(\d+)/.test(svm.model)) inch = parseInt(svm.model.match(/(\d+)/)[1], 10);
    else if (svm.display.screenSizeCm != null) inch = Math.round(svm.display.screenSizeCm / 2.54);
    // 비디오월 전체(N×M 배열) 대각 인치 — 우상단 라벨에 '개별"(전체")'로 병기(이사 요청 2026-09-14).
    const totInch = (isVW && pw != null && ph != null) ? Math.round(Math.sqrt((N * pw) ** 2 + (M * ph) ** 2) / 25.4) : null;
    const nm = svm.model || ('삼성 ' + svm.display.screenSizeInch + '형');
    const name = isVW ? `${nm} · 비디오월 ${N}×${M}` : `${nm} · 단독형`;
    if (pw == null || ph == null) return { name, error: '이 사이니지는 외형(mm) 데이터가 없어 미리보기를 표시할 수 없습니다.' };
    const totalW = N * pw, totalH = M * ph;
    return {
      m: null, svMode: true, name,
      svSizeInfo: { isVW, inch, N, M, totInch },
      r: {
        fits: true, total: N * M, cols: N, rows: M,
        actualW: totalW, actualH: totalH, marginW: Math.max(0, (sW - totalW) / 2),
        resW: isVW ? 1920 * N : (svm.display.resolution.width || 0),
        resH: isVW ? 1080 * M : (svm.display.resolution.height || 0),
      },
    };
  }
  const m = models.find(x => x.id === selectedId);
  if (!m) return { name: '—', error: '모델을 선택하세요' };
  const r = computeConfig(m, sW, sH, opts());
  if (!r.fits) return { m, name: m.name, error: '이 공간에는 캐비닛이 들어가지 않습니다.' };
  return { m, r, svMode: false, svSizeInfo: null, name: m.name };
}

function renderPreview() {
  // 3D 뷰가 켜져 있으면 캔버스 렌더러가 대신 그린다(정면 뷰 로직은 그대로 둔다).
  if (pvView === '3d') return renderPreview3D();
  const stage = $('#stage');
  const sW = spaceWmm(), sH = spaceHmm();
  const t = resolvePreviewTarget();
  $('#pvModelName').textContent = t.name;
  if (t.error) { stage.innerHTML = `<div class="previewEmpty">${esc(t.error)}</div>`; return; }
  const { m, r, svMode, svSizeInfo } = t;

  const mmL = v => fmt(Math.round(v)) + 'mm';
  const mL = v => fmt(Math.round(v) / 1000, v % 1000 === 0 ? 0 : 3) + ' m';   // m 표기(3.500 m)
  const person = PEOPLE[pvPerson] || PEOPLE['go-youn-jung_01'];
  const personHMM = person.hMM;   // 선택 인물 키(mm)
  const baseH = num($('#baseHeight').value);
  const mount = Math.min(Math.max(0, baseH), Math.max(0, sH - r.actualH));   // 바닥에서 LED 아래까지(mm)
  const topGapMM = Math.max(0, Math.round(sH - mount - r.actualH));          // LED 위 남는 높이(mm)

  // ── 가상 캔버스(고정 좌표계) + 실크기 맞춤 스케일 (v2 보완) ────────────────────────
  const CW = 1000, CH = 470;
  const fit = (stage.clientWidth || CW) / CW;   // stage 실폭에 맞춰 통째 축소(먼저 계산 — 라벨 좌표에 곱함)
  const depthMM = Math.min(Math.max(Math.round(sW * 0.85), 4500), 12000);   // 방 깊이(가정)
  const camMM = Math.max(depthMM + 2000, sW * 0.9, 6000);   // 카메라 거리(폭도 반영, v2 2-2)
  const fFront = camMM / (2 * camMM - depthMM);             // 방 앞면 투영배율(P=ZW, camMM 반영)
  const S = Math.min((CW * 0.99) / (sW * fFront), (CH * 0.97) / (sH * fFront));   // px per mm
  const px = mm => mm * S;
  const SWp = px(sW), SHp = px(sH), Dp = px(depthMM);
  // 카메라 눈높이: 기본 1.6 m이되, 방이 높으면(≥3.2 m) 방 높이의 절반까지 올려 천장/바닥이 균형 있게
  //   보이도록(이사 요청: 천장이 너무 많이 보이던 문제). ※ 눈높이 기준선(1.6/1.2 m 표시)은 별개로 유지.
  const camEyeMM = Math.min(sH * 0.9, Math.max(1600, sH * 0.5));
  const vEye = SHp - px(camEyeMM);
  const ZW = px(camMM), P = ZW;
  const CX = CW / 2, CY = CH / 2;
  // 씬 좌표(u,v,d) → 캔버스 px. 오버레이는 스케일 캔버스 '안'에 두어 3D와 항상 같은 좌표계(정렬 보장).
  //   라벨이 캔버스 축소에 줄지 않도록 글자만 CSS에서 1/fit로 역보정(v2 1-1 B안 — fit 타이밍에 안 흔들림).
  const proj = (u, v, d = 0) => { const f = P / (P + ZW - d); return { x: CX + (u - SWp / 2) * f, y: CY + (v - vEye) * f }; };

  // LED 월(정면벽 로컬 좌표, px)
  const Lx = px(r.marginW), Ly = px(topGapMM), Lw = px(r.actualW), Lh = px(r.actualH);
  const rowHp = Lh / Math.max(1, r.rows), colWp = Lw / Math.max(1, r.cols);
  const cellPx = Math.min(colWp, rowHp);
  const gap = Math.max(1, cellPx * 0.02);                   // 배열 많을 때 gap이 셀을 잡아먹지 않게(v2 2-3)

  // 사람: 벽에서 3.5 m, 캐비닛(LED) 왼쪽 모서리에서 항상 500 mm 왼쪽에 배치(이사 요청). LED를 가리지 않게.
  const personD = Math.min(px(3500), Dp * 0.45);
  const personX = Math.max(px(150), Lx - px(500));          // LED 왼쪽 모서리(Lx)에서 500 mm 왼쪽(최소 벽에서 0.15 m)
  const personFf = P / (P + ZW - personD);                  // 사람 깊이 투영배율(3D 자동 축소)

  // ── 줌인(이사 요청: 20% 이상 크게) + 라벨 화면 안 clamp 준비 ─────────────────
  //   방+오버레이가 모두 rs3Canvas 안이라, 캔버스에 zoom(scale)+이동만 주면 정렬이 유지된다.
  const personLbl = proj(personX, SHp, personD);
  const topDimGap = px(300);                      // 캐비닛 위 300mm(우측 세로선 +300mm과 균형, 이사 요청 2026-09-13)
  const topDimV = Ly - topDimGap;                 // 상단 가로 치수선 높이
  const dFront = Dp;                               // 벽 치수선을 방 '맨 앞 모서리'(가로=앞 바닥, 세로=앞 좌측)에(이사 요청). 라벨은 clamp로 화면 안 유지.
  const yTopC = Math.min(proj(0, 0, Dp).y, proj(Lx, topDimV, 0).y) - 8;   // 콘텐츠 세로 범위(캔버스 좌표)
  const yBotC = Math.max(proj(0, SHp, Dp).y, personLbl.y + 20) + 8;
  const contentH = Math.max(1, yBotC - yTopC);
  // 전체 뷰 약 30% 확대(이사 요청: 20% 이상 크게)하되, 초광폭 LED(예: 가로 50m)는 좌우가 프레임 밖으로
  //   잘리지 않게 ZOOM을 자동 축소해 전부 보이게 한다(이사 요청 2026-09-16). LED 평면(d=0) 좌우 끝이
  //   프레임(CW) 안에 들어오는 최대 배율로 캡 — 정상 비율 벽은 1.30 그대로 유지된다.
  const fLed = P / (P + ZW);                                          // LED 평면(d=0) 투영배율(≈0.5)
  const ledHalfX = Math.max(Math.abs((Lx - SWp / 2) * fLed), Math.abs((Lx + Lw - SWp / 2) * fLed), 1);
  const ZOOM = Math.max(0.5, Math.min(1.30, (CW * 0.98) / (2 * ledHalfX)));   // LED 폭이 프레임에 다 들어오게
  const effFit = fit * ZOOM;                      // 화면 실제 배율(라벨 폰트는 --fit=effFit로 고정 보정)
  const tx = (CW * fit) / 2 - CX * effFit;        // 방 중앙을 프레임 가로 중앙에
  const frameH = Math.round(Math.min(CH * fit, contentH * effFit));
  const ty = frameH / 2 - ((yTopC + yBotC) / 2) * effFit;   // 콘텐츠 세로 중심을 프레임 중앙에
  const canvasT = `translate(${tx}px, ${ty}px) scale(${effFit})`;
  // 프레임(화면) 안에 해당하는 캔버스 좌표 범위 → 치수 라벨이 밖으로 안 나가게 clamp.
  const frameW = CW * fit;
  const visL = (0 - tx) / effFit, visR = (frameW - tx) / effFit;
  const visT = (0 - ty) / effFit, visB = (frameH - ty) / effFit;
  //   여백은 '화면 px' 기준(effFit로 환산) — 줌·기기에 상관없이 라벨 pill이 프레임 밖으로 안 나가게.
  const clx = x => { const p = 26 / effFit; return Math.max(visL + p, Math.min(visR - p, x)); };
  const cly = y => { const p = 18 / effFit; return Math.max(visT + p, Math.min(visB - p, y)); };
  // 벽 세로(높이) 치수선: 방 전체 높이가 화면에 다 들어오도록 깊이 배율(fH)을 잡아 위·아래 끝(눈금)이 보이게(이사 요청).
  //   f(깊이)가 클수록 세로 span이 커짐 → 위·아래가 화면 안에 들어오는 최대 f를 선택(단, 0.5~fFront).
  const padH = 40 / effFit;   // 아래 여유를 키워 바닥(가로 치수선)을 조금 뒤로(위로) 당김(이사 요청)
  const fH = Math.max(0.5, Math.min(fFront, (CY - visT - padH) / vEye, (visB - padH - CY) / (SHp - vEye)));
  // 벽공간 치수선(가로·세로)을 방 좌측 모서리(u=0)에 붙여 천장·바닥 모서리선·벽면과 만나게(이사 요청).
  //   u=0이면 위·아래 끝이 좌측 천장·바닥 모서리선 위에 정확히 놓임.
  //   깊이(fWall): 세로가 화면에 들어오고(fH) 좌·우 코너가 화면 안(가로)에 오도록 제한.
  const fWallFit = (CX - visL - 20 / effFit) / Math.max(1, SWp / 2);   // 좌·우 코너를 화면 안(가장자리 20px 여유)에
  const fWall = Math.max(0.5, Math.min(fH, fWallFit));
  const dWall = P + ZW - P / fWall;
  // 사람을 '벽 공간 치수선(dWall)'보다 30cm 안쪽(뒤)에 세워 앞으로 튀어나오지 않게(이사 요청: 눈높이가 어색).
  //   → 벽과 치수선 사이에 위치. 눈높이선·라벨·사람 모두 이 깊이(personDeff)를 공유해 정렬 유지.
  // 사람을 LED(벽)에서 100mm 앞에 세우되, 화면 픽셀 기준 최소 48px 앞을 보장(작은 공간에서 px(100)이
  //   LED translateZ(10px)에 근접해 사람이 LED에 가려 잘리던 문제 해결 — 이사 요청 2026-09-15. 항상 최전면).
  const personDeff = Math.max(px(100), 48);
  const personFoot = proj(personX, SHp, personDeff);

  let cells = ''; for (let i = 0; i < Math.min(r.total, 2000); i++) cells += '<i></i>';

  // 신호 오버레이(FHD/UHD) — LED 좌상단 기준 실제 신호 크기(px). 정면벽 자식.
  let sigHTML = '';
  if (signalMode !== 'off' && r.resW > 0 && r.resH > 0) {
    const sig = [];
    if (signalMode === 'fhd' || signalMode === 'both') sig.push({ bw: 1920, bh: 1080, label: 'FHD', cls: 'fhd' });
    if (signalMode === 'uhd' || signalMode === 'both') sig.push({ bw: 3840, bh: 2160, label: 'UHD', cls: 'uhd' });
    for (const g of sig) {
      const nC = Math.ceil(r.resW / g.bw), nR = Math.ceil(r.resH / g.bh);
      const twP = (g.bw / r.resW) * Lw, thP = (g.bh / r.resH) * Lh;
      for (let rr = 0; rr < nR; rr++) for (let cc = 0; cc < nC; cc++) {
        const tag = (cc === 0 && rr === 0) ? `<span class="rs3SigTag">${g.label}</span>` : '';
        sigHTML += `<div class="rs3Sig ${g.cls}" style="left:${Lx + cc * twP}px;top:${Ly + rr * thP}px;width:${twP}px;height:${thP}px">${tag}</div>`;
      }
    }
  }

  // 캐비닛 번호(2D 오버레이) — 열=맨 윗줄 칸, 행=맨 왼쪽 칸. 둘 다 칸의 '가운데'에 정렬(이사 요청).
  const dNum = Math.min(px(20), Dp * 0.02);
  let numHTML = '';
  // 단독형 사이니지(단일 패널)는 '1' 같은 갯수 번호를 표시하지 않는다(이사 요청 2026-09-14). LED·비디오월은 유지.
  if (!(svMode && svSizeInfo && !svSizeInfo.isVW)) {
    const c0 = proj(Lx + colWp * 0.5, Ly + rowHp * 0.5, dNum), c1 = proj(Lx + colWp * 1.5, Ly + rowHp * 0.5, dNum);
    const spCol = Math.abs(c1.x - c0.x), stepC = spCol >= 22 ? 1 : Math.max(1, Math.ceil(22 / Math.max(1, spCol)));
    for (let c = 0; c < r.cols; c++) {
      if (stepC > 1 && c % stepC !== 0 && c !== r.cols - 1) continue;
      const p = proj(Lx + colWp * (c + 0.5), Ly + rowHp * 0.5, dNum);   // 윗줄 칸 가운데
      numHTML += `<span class="rs3Num col" style="left:${p.x}px;top:${p.y}px">${c + 1}</span>`;
    }
    // 행 번호: 맨 왼쪽 칸 가운데. 단, 첫 행(ri=0)은 좌상단에서 열 번호 '1'과 겹쳐 '1 1'로 보이므로 생략.
    //   → 좌상단 '1' 하나가 가로·세로 1을 겸함(왼쪽은 1,2,3,4로 읽힘). (이사 요청)
    const rowU = Lx + colWp * 0.5;
    const r0 = proj(rowU, Ly + rowHp * 0.5, dNum), r1 = proj(rowU, Ly + rowHp * 1.5, dNum);
    const spRow = Math.abs(r1.y - r0.y), stepR = spRow >= 22 ? 1 : Math.max(1, Math.ceil(22 / Math.max(1, spRow)));
    for (let ri = 1; ri < r.rows; ri++) {
      if (stepR > 1 && ri % stepR !== 0 && ri !== r.rows - 1) continue;
      const p = proj(rowU, Ly + rowHp * (ri + 0.5), dNum);
      numHTML += `<span class="rs3Num col" style="left:${p.x}px;top:${p.y}px">${ri + 1}</span>`;
    }
  }

  // 눈높이선: 사람 눈높이(1.6/1.2 m)를 사람 깊이(personDeff) 기준 '수평 점선'으로 그림.
  //   사람이 좌측이라 라벨은 사람과 안 겹치게 반대편(오른쪽 끝)에 우측 정렬로 배치.(이사 요청)
  let eyeLines = '';
  for (const g of [{ mm: 1600, t: '눈높이(서) 1.6 m' }, { mm: 1200, t: '눈높이(앉) 1.2 m' }]) {
    if (g.mm > sH) continue;
    const v = SHp - px(g.mm);
    const eyeY = proj(personX, v, personDeff).y;                     // 눈높이 화면 y(수평선, 사람 깊이=personDeff)
    const xL = Math.max(visL + 6, proj(0, v, personDeff).x);         // 왼쪽 끝(왼쪽 벽 부근, 화면 안)
    const xR = Math.min(visR - 6, proj(SWp, v, personDeff).x);       // 오른쪽 끝(오른쪽 벽 부근, 화면 안)
    eyeLines += `<div class="rs3Eye" style="left:${xL}px;top:${eyeY}px;width:${Math.max(0, xR - xL)}px"></div>`
      + `<span class="rs3EyeLbl r" style="left:${xR}px;top:${cly(eyeY)}px">${g.t}</span>`;
  }

  // 방 모서리(구조 edge)를 2D 오버레이 선으로. 깊이 4모서리 + 뒷벽 둘레 4변.
  const edgeSeg = (u1, v1, d1, u2, v2, d2) => {
    const a = proj(u1, v1, d1), b = proj(u2, v2, d2);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const ew = (0.4 / effFit).toFixed(3);   // 화면상 0.4px 고정(아주 가늘게, 캔버스가 effFit로 확대되므로 역보정)
    return `<div class="rs3Edge" style="left:${a.x}px;top:${a.y}px;width:${len}px;border-top-width:${ew}px;transform:rotate(${ang}deg)"></div>`;
  };
  const roomEdges =
    edgeSeg(0, 0, 0, 0, 0, Dp) + edgeSeg(SWp, 0, 0, SWp, 0, Dp)
    + edgeSeg(0, SHp, 0, 0, SHp, Dp) + edgeSeg(SWp, SHp, 0, SWp, SHp, Dp)
    + edgeSeg(0, 0, 0, SWp, 0, 0) + edgeSeg(0, SHp, 0, SWp, SHp, 0)
    + edgeSeg(0, 0, 0, 0, SHp, 0) + edgeSeg(SWp, 0, 0, SWp, SHp, 0);

  const gridMM = 1200;   // 바닥 그리드 간격(이사 요청 2026-09-13: 600 타일의 2배 = 1200mm)

  // ── 바닥 그리드: CSS 텍스처 대신 2D 투영선으로 직접(원근 아티팩트 제거, 이사 요청 2026-09-13) ──
  //   바닥면(v=SHp)에 600mm 간격 선. 앞쪽으로 선이 프레임 밖(visB)으로 나가면 중단(과도한 몰림 방지).
  //   먼 쪽(뒷벽=작은 d)은 흐리게, 앞쪽은 진하게.
  let floorGrid = '';
  {
    const gp = px(gridMM);
    const gseg = (u1, d1, u2, d2, op) => {
      const a = proj(u1, SHp, d1), b = proj(u2, SHp, d2);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      const w = (0.5 / effFit).toFixed(3);
      return `<div class="rs3GridLn" style="left:${a.x}px;top:${a.y}px;width:${len}px;border-top-width:${w}px;opacity:${op.toFixed(2)};transform:rotate(${ang}deg)"></div>`;
    };
    let dEnd = 0;
    const ds = [];
    for (let d = 0; d <= Dp + 0.5; d += gp) {
      ds.push(d); dEnd = d;
      if (proj(0, SHp, d).y > visB) break;   // 앞쪽(프레임 아래)으로 나가면 중단
    }
    dEnd = Math.min(dEnd, Dp);
    for (const d of ds) {                     // 가로선(폭 방향): 먼 쪽 흐림
      if (d > dEnd + 0.5) continue;
      floorGrid += gseg(0, d, SWp, d, 0.12 + 0.5 * (d / (dEnd || 1)));
    }
    for (let u = 0; u <= SWp + 0.5; u += gp) { // 세로선(깊이 방향)
      const uu = Math.min(u, SWp);
      floorGrid += gseg(uu, 0, uu, dEnd, 0.28);
    }
  }

  // ── 2D 치수 오버레이 ──
  const dims = [];
  const dlw = (0.49 / effFit).toFixed(3);   // 치수선 두께 화면상 0.49px(0.7→30% 더 축소, 이사 요청 2026-09-13)
  //   치수선은 그대로 두고, 라벨(글자)만 화면(프레임) 안으로 clamp → 줌해도 글자가 안 잘림.
  const hDim = (u1, u2, v, d, label, cls = '') => {
    const a = proj(u1, v, d), b = proj(u2, v, d);
    const x = Math.min(a.x, b.x), w = Math.abs(b.x - a.x);
    dims.push(`<div class="rs3Dln h" style="left:${x}px;top:${a.y}px;width:${w}px;border-top-width:${dlw}px"></div>`
      + `<div class="rs3Dlbl ${cls}" style="left:${clx((a.x + b.x) / 2)}px;top:${cly(a.y)}px">${label}</div>`);
  };
  const vDim = (u, v1, v2, d, label, cls = '') => {
    const a = proj(u, v1, d), b = proj(u, v2, d);
    const y = Math.min(a.y, b.y), h = Math.abs(b.y - a.y);
    dims.push(`<div class="rs3Dln v" style="left:${a.x}px;top:${y}px;height:${h}px;border-left-width:${dlw}px"></div>`
      + `<div class="rs3Dlbl vlbl ${cls}" style="left:${clx(a.x)}px;top:${cly((a.y + b.y) / 2)}px">${label}</div>`);
  };
  const pt = (u, v, d, label, cls = '') => { const p = proj(u, v, d); dims.push(`<div class="rs3Dlbl ${cls}" style="left:${clx(p.x)}px;top:${cly(p.y)}px">${label}</div>`); };

  // 상단 가로 치수선(LED 가로) + 좌우 여백 — 같은 좌우 선상(topDimV)에 한 줄로(이사 요청).
  hDim(Lx, Lx + Lw, topDimV, 0, mmL(r.actualW), 'key');
  vDim(Lx + Lw + px(300), Ly, Ly + Lh, 0, mmL(r.actualH), 'key');
  if (mount > 0) {
    if (topGapMM > 40) vDim(Lx + Lw + px(300), 0, Ly, 0, mmL(topGapMM), 'sub');
    vDim(Lx + Lw + px(300), Ly + Lh, SHp, 0, mmL(mount), 'sub');
  }
  if (r.marginW > 40) {
    hDim(0, Lx, topDimV, 0, mmL(r.marginW), 'sub');            // 좌 여백(벽 왼쪽~LED 왼쪽) — mm(벽공간만 m, 나머지 mm)
    hDim(Lx + Lw, SWp, topDimV, 0, mmL(r.marginW), 'sub');     // 우 여백(LED 오른쪽~벽 오른쪽) — mm
  }
  // 벽 크기(가로·세로): 방 좌측 모서리(u=0)에서 시작 → 세로선은 좌측 천장·바닥 모서리선과,
  //   가로선은 바닥 좌·우 모서리선과 만나고, 좌하단에서 L자로 코너가 맞물림(이사 요청).
  hDim(0, SWp, SHp, dWall, mL(sW), 'sub');
  vDim(0, 0, SHp, dWall, mL(sH), 'sub');
  // 캐비닛 수 라벨은 LED만. 사이니지는 중앙 '장' 표기 대신 우상단 인치 라벨(아래 svSizeHTML)로 표시(이사 요청 2026-09-14).
  //   위치: 중앙 → '왼쪽 하단' 안쪽(넓은 벽에서 중앙이 화면을 가리지 않게, 이사 요청 2026-09-14). 좌하단 앵커.
  if (!svMode) {
    // 완성된 디스플레이(LED) 우측하단 안쪽 코너. translate(-100%,-100%)로 우하단 앵커 → 라벨은 앵커 왼쪽·위로 그려짐.
    //   우측/하단 프레임을 넘지 않도록 앵커를 프레임 안쪽으로 추가 clamp(넉넉한 여유, 이사 요청 2026-09-16).
    const bx = Math.min(clx(Lx + Lw - px(60)), visR - 34 / effFit);
    const by = Math.min(cly(Ly + Lh - px(60)), visB - 22 / effFit);
    dims.push(`<div class="rs3Dlbl count br" style="left:${bx}px;top:${by}px">${r.cols} × ${r.rows} = ${r.total} 캐비닛</div>`);
  }

  const faceStyle = `left:0;top:0;width:${SWp}px;height:${SHp}px`;
  const sceneT = `translate3d(${-SWp / 2}px, ${-vEye}px, ${-ZW}px)`;
  // 사이니지(단독형·비디오월)는 LED 캐비닛(픽셀 매트릭스)이 아니라 예전 LED 디자인의 '그라데이션 블록'으로 그린다(이사 요청 2026-09-14).
  // 비디오월은 패널 사이 베젤(격자)이 물리적 필수 → '패널 격자'를 꺼도 항상 표시(noCellGrid 미적용, 이사 요청 2026-09-15).
  const vwActive = svMode && !!(svSizeInfo && svSizeInfo.isVW);
  const cls = [pvShow.person ? '' : 'noPerson', pvShow.eye ? '' : 'noEye', pvShow.grid ? '' : 'noGrid', pvShow.dims ? '' : 'noDims', (pvShow.cellgrid || vwActive) ? '' : 'noCellGrid', svMode ? 'svPanel' : ''].filter(Boolean).join(' ');
  // 깊이 단서(mm 환산, v2 2-3): AO 1.5 m, 바닥 글로우 4 m, LED 글로우 0.6/0.1 m.
  // 검은 테두리(베젤) + 그 뒤로 퍼지는 파란 네온 글로우(유지). ※ 인라인이라 CSS보다 우선.
  const ledGlow = `box-shadow:0 0 0 2px #050608,0 0 ${px(600)}px ${px(100)}px rgba(47,127,246,.35),0 24px 40px -18px rgba(10,20,60,.5)`;
  // LED 화면 내용: 이미지가 있으면 (가로 고정)가로 꽉·상하 이동 / (세로 고정)세로 꽉·좌우 이동. 넘침=크롭/모자람=검정.
  //   LED 격자 ON이면 이미지 위에 캐비닛 격자선 오버레이. 이미지 없으면 파란 글로우.
  let ledExtra;
  if (pvImage) {
    const asp = pvImgAspect || (Lw / Lh);
    let iw, ih, left, top, range;
    if (pvImgMode === 'height') {
      // 세로 고정: 세로를 꽉 채우고 가로는 좌우로 이동(pvImgPanX).
      ih = Lh; iw = Lh * asp; range = iw - Lw;             // range>0: 가로 넘침(크롭), <0: 모자람(검정)
      left = (range > 0) ? (-range * pvImgPanX) : ((Lw - iw) * pvImgPanX); top = 0;
    } else {
      // 가로 고정: 가로를 꽉 채우고 세로는 위아래로 이동(pvImgPanY).
      iw = Lw; ih = Lw / asp; range = ih - Lh;             // range>0: 세로 넘침(크롭), <0: 모자람(검정)
      left = 0; top = (range > 0) ? (-range * pvImgPanY) : ((Lh - ih) * pvImgPanY);
    }
    pvLedGeom = { mode: pvImgMode, lw: Lw, lh: Lh, iw, ih, range };
    const ov = pvShow.cellgrid
      ? `<div class="rs3LedGridOv" style="background-size:${(Lw / r.cols).toFixed(2)}px ${(Lh / r.rows).toFixed(2)}px"></div>` : '';
    ledExtra = `<img class="rs3LedImg" src="${pvImage}" draggable="false" style="width:${iw.toFixed(1)}px;height:${ih.toFixed(1)}px;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px"/>${ov}`;
  } else {
    pvLedGeom = null;
    ledExtra = '<div class="rs3Glow"></div>';
  }

  // ↕ 손잡이(디스플레이를 위아래로 드래그해 하단 높이 조정). 화면 픽셀→mm 환산값과 상한을 저장.
  //   proj의 정면벽(d=0) 세로 배율 = 0.5, 화면 px = 캔버스 px × effFit → 화면 px/mm = 0.5 × S × effFit.
  pvHeightDrag = { pxPerMm: 0.5 * S * effFit, maxBaseMM: Math.max(0, Math.round(sH - r.actualH)) };
  // ↕ 손잡이는 우측 벽면 끝(공간 오른쪽 가장자리) 디스플레이 세로 중앙에 배치(이사 요청 2026-09-14).
  const hcp = proj(SWp, Ly + Lh / 2, 0);
  const heightHandleHTML = pvShow.handle
    ? `<button type="button" class="rs3HeightHandle" data-hhandle title="위아래로 끌어 하단 높이 조정" style="left:${clx(hcp.x)}px;top:${cly(hcp.y)}px">↕</button>`
    : '';   // '↕ 이동' 토글 끄면 손잡이 숨김(캡처 시 깔끔 — 치수는 그대로, 이사 요청 2026-09-14)

  // 사이니지 우상단 인치 라벨(흰색, 폰트 크기는 패널 가로에 비례). 비디오월은 배열·장수도 작게 함께 표기(제안).
  let svSizeHTML = '';
  if (svSizeInfo && svSizeInfo.inch != null) {
    // 인치 라벨 크기는 '개별 패널' 폭 기준(비디오월도 단독형과 동일 크기). 배열·장수 표기는 제거(이사 요청 2026-09-14).
    const perPanelW = Lw / (svSizeInfo.isVW ? Math.max(1, svSizeInfo.N) : 1);
    const pad = perPanelW * 0.03, fs = Math.max(9, perPanelW * 0.06);
    // 비디오월 다판(N×M>1)이면 '개별"(전체")' 병기, 단독형·1판은 개별 인치만.
    const label = (svSizeInfo.isVW && svSizeInfo.totInch != null && svSizeInfo.N * svSizeInfo.M > 1)
      ? `${svSizeInfo.inch}"(${svSizeInfo.totInch}")`
      : `${svSizeInfo.inch}"`;
    svSizeHTML = `<div class="rs3SvSize" style="right:${pad}px;top:${pad}px;font-size:${fs}px">${label}</div>`;
  }

  stage.innerHTML = `<div class="rs3Frame ${cls}" style="height:${frameH}px;--fit:${effFit}">
    <div class="rs3Canvas" style="width:${CW}px;height:${CH}px;transform:${canvasT};">
      <div class="rs3Persp" style="perspective:${P}px;perspective-origin:50% 50%">
        <div class="rs3Scene" style="transform:${sceneT}">
          <div class="rs3Face ceil" style="left:0;top:0;width:${SWp}px;height:${Dp}px"></div>
          <div class="rs3Face floor" style="left:0;top:${SHp}px;width:${SWp}px;height:${Dp}px">
            <div class="rs3Ao" style="height:${px(1500)}px"></div>
            <div class="rs3FloorGlow" style="left:${Lx}px;width:${Lw}px;height:${px(4000)}px"></div>
          </div>
          <div class="rs3Face wallL" style="left:0;top:0;width:${Dp}px;height:${SHp}px"></div>
          <div class="rs3Face wallR" style="left:${SWp}px;top:0;width:${Dp}px;height:${SHp}px"></div>
          <div class="rs3Face front" style="${faceStyle}">
            <div class="rs3Led" style="left:${Lx}px;top:${Ly}px;width:${Lw}px;height:${Lh}px;${ledGlow}">
              <div class="rs3Grid" style="grid-template-columns:repeat(${r.cols},1fr);grid-template-rows:repeat(${r.rows},1fr);gap:${gap}px;padding:${gap}px">${cells}</div>
              ${ledExtra}
              ${svSizeHTML}
            </div>
            ${sigHTML}
          </div>
          <div class="rs3Person ${pvPerson}" style="left:${personX}px;top:${SHp - px(personHMM)}px;height:${px(personHMM)}px;transform:translate(-50%,0) translateZ(${personDeff}px)">${pvPersonImg[pvPerson] ? `<img class="rs3PersonImg" src="${pvPersonImg[pvPerson]}" alt="사람" draggable="false"/>` : `<img class="rs3PersonImg" src="${personBuiltinSrc(pvPerson)}" alt="${esc(person.label || '사람')}" draggable="false" onerror="console.error('[사람 이미지 누락] '+this.src+' — 파일이 없어 표시 실패');this.style.outline='2px dashed #E5484D'"/>`}</div>
        </div>
      </div>
      <div class="rs3GridLayer">${floorGrid}</div>
      <div class="rs3EdgeLayer">${roomEdges}</div>
      <div class="rs3EyeLayer">${eyeLines}</div>
      <div class="rs3Overlay">
        ${dims.join('')}
        ${numHTML}
        ${heightHandleHTML}
        <div class="rs3Dlbl person" style="left:${clx(personFoot.x)}px;top:${cly(personFoot.y + 14)}px;transform:translate(-50%,-50%)">키 ${+(personHMM / 10).toFixed(1)} cm</div>
      </div>
    </div>
  </div>`;
}

// ── 3D(아이소메트릭) 미리보기 ───────────────────────────────────────────────
// 방을 '컷어웨이'(카메라 쪽 벽을 잘라낸 모형)로 그리고, 공간 타입에 맞는 가구를 놓는다.
// LED 크기·배열·여백은 정면 뷰와 같은 engine 결과(resolvePreviewTarget)를 그대로 쓴다.

// 화면에 넣은 이미지(dataURL)를 캔버스에 그릴 수 있는 Image 객체로 바꿔 캐시한다.
let pv3dImg = null, pv3dImgSrc = null;
function led3dImage() {
  if (!pvImage) { pv3dImg = null; pv3dImgSrc = null; return null; }
  if (pv3dImgSrc !== pvImage) {
    pv3dImgSrc = pvImage;
    pv3dImg = new Image();
    pv3dImg.onload = () => { if (pvView === '3d') renderPreview3D(); };   // 다 읽히면 다시 그리기
    pv3dImg.src = pvImage;
  }
  return pv3dImg;
}

// 3D 뷰에 세울 사람 이미지. 정면 뷰와 같은 인물(pvPerson)을 쓰고, 직접 올린 사진이 있으면 그것을 쓴다.
let pv3dPersonImg = null, pv3dPersonSrc = null;
function person3dImage() {
  const src = pvPersonImg[pvPerson] || personBuiltinSrc(pvPerson);
  if (pv3dPersonSrc !== src) {
    pv3dPersonSrc = src;
    pv3dPersonImg = new Image();
    pv3dPersonImg.onload = () => { if (pvView === '3d') renderPreview3D(); };   // 다 읽히면 다시 그리기
    pv3dPersonImg.onerror = () => console.error('[사람 이미지 누락] ' + src);
    pv3dPersonImg.src = src;
  }
  return pv3dPersonImg;
}

function renderPreview3D() {
  const host = $('#stage3d'), canvas = $('#cv3d'), stage = $('#stage');
  if (!host || !canvas) return;
  const t = resolvePreviewTarget();
  $('#pvModelName').textContent = t.name;
  if (t.error) {   // 그릴 수 없으면 정면 뷰와 같은 안내 문구를 보여준다
    host.hidden = true; stage.hidden = false;
    stage.innerHTML = `<div class="previewEmpty">${esc(t.error)}</div>`;
    return;
  }
  stage.hidden = true; host.hidden = false;
  const { m, r } = t;

  const sW = spaceWmm(), sH = spaceHmm();
  const D = spaceDmm() || autoDepthForType(roomTypeId, sW);          // 깊이 입력이 없으면 타입별 자동
  const baseH = num($('#baseHeight').value);
  const mount = Math.min(Math.max(0, baseH), Math.max(0, sH - r.actualH));   // 바닥 ~ LED 아래
  const lay = layoutRoom(roomTypeId, roomOpts, { W: sW, D, ledBottom: mount });

  // 3D 뷰어는 처음 열 때 한 번만 만든다. WebGL을 못 쓰는 환경이면 정면 뷰 안내로 되돌린다.
  if (!viewer3d && !gl3dFailed) {
    viewer3d = createViewerGL(canvas, {
      onError: e => { gl3dFailed = true; console.error('[3D] WebGL 초기화 실패 —', e); },
    });
    if (!viewer3d) gl3dFailed = true;
    // 자동 검증(헤드리스 브라우저)에서 카메라 상태를 읽기 위한 손잡이.
    //   읽기 전용 정보만 노출한다 — 화면 동작에는 영향이 없다.
    if (viewer3d) window.__svtViewer3d = viewer3d;
  }
  if (!viewer3d) {
    host.hidden = true; stage.hidden = false;
    stage.innerHTML = '<div class="previewEmpty">이 브라우저에서는 3D 뷰(WebGL)를 쓸 수 없습니다. 정면 뷰를 이용해 주세요.</div>';
    return;
  }

  // 계산 결과를 '읽기만' 해서 넘긴다 — 크기·배열·하단 높이 모두 engine / room-presets 값 그대로.
  viewer3d.setModel(buildGLModel({
    space: { W: sW, H: sH, D, wallThk: num($('#wallThk')?.value) },
    led: {
      w: r.actualW, h: r.actualH, marginW: r.marginW, mount,
      cols: r.cols, rows: r.rows, depth: (m && m.depth) || 60,
    },
    items: lay.items,
    show: { ...pv3dShow },
    roomType: roomTypeId,   // 바닥 마감(카펫/비닐)을 공간 타입에서 고른다
    person: personFor3D(r, mount, sW, D, lay.items),
  }));

  // 배치 결과 안내 — 실제 놓인 좌석 수와, 방이 좁아 줄였을 때의 알림.
  //   좌석 수는 room-presets가 낸 값을 그대로 보여준다(여기서 새로 세지 않는다).
  syncSizeProxy();
  const note = $('#room3dNote');
  if (note) {
    const seats = lay.placed.seats ?? lay.placed.chairs ?? lay.placed.consoles ?? 0;
    const rowInfo = (lay.placed.rows && lay.placed.perRow)
      ? `${lay.placed.perRow}석 × ${lay.placed.rows}줄` : '';
    note.textContent = [
      seats ? `배치 ${seats}석${rowInfo ? ` (${rowInfo})` : ''}` : '',
      ...lay.notes,
      '끌기=회전 · 휠=확대 · ‘맞춤’=시점 복귀',
    ].filter(Boolean).join(' · ');
  }
}

// 시점 프리셋 선택칸을 채운다(기존 '시점' 선택칸을 그대로 쓴다 — 새 UI를 만들지 않는다).
function syncPresetSel() {
  const sel = $('#cubeView'); if (!sel) return;
  const want = CAMERA_PRESETS.map(p => p.id).join(',');
  if (sel.dataset.filled !== want) {
    sel.innerHTML = CAMERA_PRESETS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
    sel.dataset.filled = want;
  }
  if (viewer3d) presetId = viewer3d.getPreset();
  sel.value = presetId;
  syncPresetButtons();
}

// 아직 동작하지 않는 3D 조작 버튼은 숨긴다.
//   (마크업은 그대로 두고 표시만 끈다 — 기능이 붙으면 이 함수에서 한 줄씩 지우면 된다.)
//   STEP 2에서 시점 선택칸과 ◀ ▶ 는 되살렸다. 남은 것은 사람·치수·격자·포인트 벽·PNG.
// ── 3D 작업 영역 — 왼쪽 설정 패널 ───────────────────────────────────────────
// 패널 안의 컨트롤은 **새로 만들지 않고 pv3dBar 의 것을 옮겨 담는다**(appendChild는
// 노드를 '이동'시킨다). 그래서 상태도, 이벤트 연결도 그대로 유지된다 — 중복 상태가 없다.
// 3D 뷰를 떠날 때 원래 자리로 되돌린다.
let inspectorBuilt = false;

function inspectorSection(title) {
  const sec = document.createElement('div');
  sec.className = 'pv3dSec';
  const h = document.createElement('span');
  h.className = 'pv3dSecTitle';
  h.textContent = title;
  sec.appendChild(h);
  const row = document.createElement('div');
  row.className = 'pv3dRow';
  sec.appendChild(row);
  sec.body = row;
  return sec;
}

// 공간 크기 W × H × D — 01 카드의 입력칸을 그대로 쓰되, 패널에서도 고칠 수 있게
//   '대리 입력칸'을 둔다. 값은 언제나 01 카드가 원본이다(여기 따로 저장하지 않는다).
function buildSizeProxy() {
  const box = document.createElement('div');
  box.className = 'pv3dSize';
  for (const [id, label] of [['spaceW', 'W (m)'], ['spaceH', 'H (m)'], ['spaceD', 'D (m)']]) {
    const lab = document.createElement('label');
    const t = document.createElement('span'); t.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = '0.1'; inp.min = '0';
    inp.dataset.proxy = id;
    if (id === 'spaceD') inp.placeholder = '자동';
    inp.addEventListener('input', () => {
      const src = $('#' + id); if (!src) return;
      src.value = inp.value;                                   // 원본에 그대로 옮긴다
      src.dispatchEvent(new Event('input', { bubbles: true })); // 원래 핸들러가 계산을 돌린다
    });
    lab.append(t, inp);
    box.appendChild(lab);
  }
  return box;
}

// 벽 4면 켜고 끄기 — 어느 벽을 보여줄지 직접 고른다.
//   (카메라 쪽 벽까지 켜면 방 안이 안 보이므로 기본은 2면만 켜 둔다)
function buildWallToggles() {
  const box = document.createElement('div');
  box.className = 'pv3dWalls';
  const lab = document.createElement('span');
  lab.className = 'pv3dWallsLab';
  lab.textContent = '벽면';
  box.appendChild(lab);
  for (const [key, text, title] of [
    ['front', '앞', 'LED가 붙은 벽'],
    ['back', '뒤', '반대편 벽'],
    ['left', '좌', '왼쪽 벽'],
    ['right', '우', '오른쪽 벽'],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pvTog pv3dWallBtn' + (pv3dShow.walls[key] ? ' on' : '');
    b.dataset.t3dwall = key;
    b.title = title;
    b.textContent = text;
    box.appendChild(b);
  }
  return box;
}

// 벽 두께(mm) — 3D 뷰 전용 표시 설정. 방 안쪽 치수(W×H×D)는 건드리지 않는다.
function buildWallThkField() {
  const lab = document.createElement('label');
  lab.className = 'pv3dField';
  const t = document.createElement('span'); t.textContent = '벽 두께 (mm)';
  const inp = document.createElement('input');
  inp.type = 'number'; inp.id = 'wallThk'; inp.min = '0'; inp.max = '600'; inp.step = '10';
  inp.value = String(CONFIG_DEFAULTS.wallThk);
  inp.title = '벽은 방 바깥쪽으로 두꺼워집니다 — 안쪽 공간 크기는 그대로입니다';
  inp.addEventListener('input', () => renderPreview());
  lab.append(t, inp);
  return lab;
}

// 대리 입력칸을 원본 값에 맞춘다(01 카드에서 바꿨을 때 따라오도록).
function syncSizeProxy() {
  for (const inp of document.querySelectorAll('.pv3dSize input[data-proxy]')) {
    const src = $('#' + inp.dataset.proxy);
    if (src && document.activeElement !== inp) inp.value = src.value;
  }
}

function buildInspector() {
  const box = $('#pv3dInspector'); if (!box || inspectorBuilt) return;
  const bar = $('#pv3dBar');
  const presetBar = $('#pv3dPresetBar'), tools = $('#pv3dTools');

  // [공간 설정] 공간 타입 + 공간 크기
  const s1 = inspectorSection('공간 설정');
  const typeField = $('#roomType')?.closest('.pv3dField');
  if (typeField) s1.body.appendChild(typeField);     // 이동(복제 아님)
  s1.body.appendChild(buildSizeProxy());
  s1.body.appendChild(buildWallThkField());

  // [좌석 설정] 타입별 옵션(줄 수·줄당 좌석·통로 등) — renderRoomOptions가 채우는 그릇
  const s2 = inspectorSection('좌석 설정');
  const opts = $('#roomOpts');
  if (opts) s2.body.appendChild(opts);

  // [설치 요소] 무대는 좌석 옵션 안에 있으므로 renderRoomOptions가 옮겨 준다.
  const s3 = inspectorSection('설치 요소');
  s3.id = 'pv3dElements';
  s3.body.appendChild(buildWallToggles());
  for (const sel of ['[data-t3d="person"]', '#person3dSel', '[data-t3d="dims"]',
                     '[data-t3d="grid"]', '[data-t3d="accentWall"]']) {
    const el = bar?.querySelector(sel);
    if (el) s3.body.appendChild(el);
  }

  // 좁은 화면에서 패널을 접었다 펴는 버튼(넓은 화면에서는 CSS가 숨긴다).
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pv3dPanelToggle';
  toggle.textContent = '공간·좌석 설정';
  toggle.addEventListener('click', () => {
    $('#stage3d')?.classList.toggle('pv3dOpenPanel');
    viewer3d?.resize();   // 패널 높이가 바뀌면 캔버스 크기도 다시 잡는다
  });
  box.appendChild(toggle);

  box.append(s1, s2, s3);

  // 시점 프리셋 — 캔버스 아래 가운데. 기존 선택칸(#cubeView)은 숨기고 값만 공유한다.
  if (presetBar) {
    renderPresetBar();
    presetBar.addEventListener('click', e => {
      // 편집 토글 — 켜면 '＋'(현재 화면 저장)와 저장한 시점의 '×'(삭제)가 보인다
      if (e.target.closest('[data-viewedit]')) {
        viewEditMode = !viewEditMode;
        renderPresetBar();
        return;
      }
      // ＋ — 지금 보이는 화면을 그대로 저장
      if (e.target.closest('[data-viewadd]')) { saveCurrentView(); return; }
      // × — 저장한 시점 삭제
      const del = e.target.closest('[data-viewdel]');
      if (del) {
        customViews = customViews.filter(v => v.id !== del.dataset.viewdel);
        if (presetId === del.dataset.viewdel) presetId = DEFAULT_PRESET;
        renderPresetBar(); saveLastSession();
        return;
      }
      const btn = e.target.closest('button[data-preset]'); if (!btn) return;
      const id = btn.dataset.preset;
      const saved = customViews.find(v => v.id === id);
      if (saved) { presetId = id; viewer3d?.applyPose(saved); renderPresetBar(); }
      else { presetId = cameraPreset(id).id; viewer3d?.setPreset(presetId); syncPresetSel(); }
    });
  }
  // 보조 도구 — 캔버스 오른쪽 위
  if (tools) for (const id of ['#btn3dReset', '#btn3dPng']) {
    const el = bar?.querySelector(id);
    if (el) tools.appendChild(el);
  }
  // '초기화'는 기본 시점(실내)으로 돌아가는 버튼 — '맞춤'(지금 시점 재정렬)과 역할이 다르다.
  if (tools && !$('#btn3dHome')) {
    const home = document.createElement('button');
    home.type = 'button'; home.id = 'btn3dHome'; home.className = 'tiny ghost';
    home.title = '기본 시점(실내)으로 돌아가기';
    home.textContent = '초기화';
    home.addEventListener('click', () => { viewer3d?.resetView(); syncPresetSel(); });
    tools.insertBefore(home, tools.firstChild);
  }

  // 배치 안내(좌석 수·자동 축소)는 패널 맨 아래에
  const note = $('#room3dNote');
  if (note) box.appendChild(note);

  inspectorBuilt = true;
}

// 시점 막대를 다시 그린다 — 기본 6종 + 저장한 시점 + 편집 토글(+ 추가/삭제).
function renderPresetBar() {
  const bar = $('#pv3dPresetBar'); if (!bar) return;
  const esc2 = t => esc(String(t));
  let html = CAMERA_PRESETS
    .map(p => `<button type="button" data-preset="${p.id}">${esc2(p.label)}</button>`).join('');
  if (customViews.length) {
    html += '<span class="pv3dPresetSep"></span>';
    html += customViews.map(v => `<button type="button" class="saved" data-preset="${esc2(v.id)}">`
      + `${esc2(v.label)}`
      + (viewEditMode ? `<i class="pv3dDel" data-viewdel="${esc2(v.id)}" title="이 시점 삭제">×</i>` : '')
      + '</button>').join('');
  }
  html += '<span class="pv3dPresetSep"></span>';
  html += `<button type="button" class="pv3dEdit${viewEditMode ? ' on' : ''}" data-viewedit`
    + ' title="시점 저장/삭제 켜기">시점 저장</button>';
  if (viewEditMode) {
    html += '<button type="button" class="pv3dAdd" data-viewadd title="지금 보이는 화면을 시점으로 저장">＋</button>';
  }
  bar.innerHTML = html;
  syncPresetButtons();
}

// 지금 보이는 화면을 그대로 시점으로 저장한다(구성과 함께 저장되어 다음에도 남는다).
function saveCurrentView() {
  const pose = viewer3d?.getPose();
  if (!pose) { alert('먼저 3D 뷰를 표시한 뒤 저장하세요.'); return; }
  if (customViews.length >= 24) { alert('저장한 시점은 최대 24개까지입니다. 하나 지우고 다시 저장하세요.'); return; }
  const base = `${roomType(roomTypeId).label} 시점`;
  let n = customViews.length + 1;
  while (customViews.some(v => v.label === `${base} ${n}`)) n++;
  const id = 'cv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  customViews.push({ id, label: `${base} ${n}`, ...pose });
  presetId = id;
  renderPresetBar();
  saveLastSession();
}

// 프리셋 버튼의 선택 표시를 현재 시점에 맞춘다.
function syncPresetButtons() {
  for (const b of document.querySelectorAll('#pv3dPresetBar button[data-preset]')) {
    b.classList.toggle('on', b.dataset.preset === presetId);
  }
}

function applyStagedUi() {
  const show = (el, on) => { if (el) el.hidden = !on; };
  buildInspector();
  // 3D에서는 위쪽 가로 막대를 쓰지 않는다 — 컨트롤은 전부 왼쪽 패널·캔버스 위로 옮겨 갔다.
  //   안내 문구(#room3dNote)만 막대에 남겨 보여 준다.
  show($('#pv3dBar'), false);
  show($('[data-t3d="person"]'), true);     // 사람 — STEP 6
  show($('#person3dSel'), true);
  show($('#btn3dPng'), true);              // PNG 저장 — FINAL STEP
  syncPerson3dSel();
  syncSizeProxy();
  renderPresetBar();
}

// 3D에 세울 사람 — 정면 뷰와 같은 인물·같은 키를 쓴다(pvPerson · PEOPLE).
//   자리는 room-presets 의 personSpot 이 정한다(LED 옆 빈 곳). 여기서 새로 정하지 않는다.
function personFor3D(r, mount, sW, D, items) {
  if (!pv3dShow.person) return null;
  const who = PEOPLE[pvPerson] || PEOPLE['go-youn-jung_01'];
  const spot = personSpot({ W: sW, D }, { x: r.marginW, w: r.actualW, h: r.actualH, y: mount }, items);
  return { x: spot.x, z: spot.z, heightMm: who.hMM, img: person3dImage() };
}

// 공간 타입 선택 + 그 타입의 옵션 입력칸을 그린다(타입마다 옵션이 다르므로 매번 새로 만든다).
function renderRoomOptions() {
  const sel = $('#roomType'); if (!sel) return;
  if (!sel.options.length) sel.innerHTML = ROOM_TYPES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
  sel.value = roomTypeId;
  const box = $('#roomOpts'); if (!box) return;
  box.innerHTML = roomType(roomTypeId).options.map(o => {
    const v = roomOpts[o.key];
    if (o.type === 'toggle') {
      return `<button type="button" class="pvTog${v ? ' on' : ''}" data-ropt="${o.key}"><span class="dot"></span>${esc(o.label)}</button>`;
    }
    if (o.type === 'number') {
      return `<label class="pv3dField"><span>${esc(o.label)}</span><input type="number" data-ropt="${o.key}" min="${o.min}" max="${o.max}" step="1" value="${v}"/></label>`;
    }
    const opts = o.choices.map(c => `<option value="${c.value}"${c.value === v ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
    return `<label class="pv3dField"><span>${esc(o.label)}</span><select data-ropt="${o.key}">${opts}</select></label>`;
  }).join('');
}

// 3D 뷰의 인물 선택 상자를 채운다(정면 뷰의 목록·선택값을 그대로 공유).
function syncPerson3dSel() {
  const sel = $('#person3dSel'); if (!sel) return;
  if (!sel.options.length) {
    sel.innerHTML = Object.entries(PEOPLE)
      .map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  }
  sel.value = pvPerson;
  sel.disabled = !pv3dShow.person;
}


// 정면 뷰 ↔ 3D 뷰 전환. 2D 전용 컨트롤(신호·사람 토글)은 3D에서 숨긴다.
function setPreviewView(v) {
  pvView = (v === '3d') ? '3d' : '2d';
  $('#pvViewMode')?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === pvView));
  const is3d = pvView === '3d';
  if ($('#pv3dBar')) $('#pv3dBar').hidden = !is3d;
  // 3D에서도 'Fullscreen'은 쓸 수 있어야 한다 — 막대는 남기고 2D 전용 버튼만 숨긴다.
  if ($('#pvToggles')) {
    $('#pvToggles').hidden = false;
    for (const el of $('#pvToggles').children) {
      const keep = el.dataset.act === 'zoom';   // Fullscreen 버튼
      el.hidden = is3d && !keep;
    }
  }
  if ($('#signalMode')) $('#signalMode').hidden = is3d;
  if (!is3d && $('#stage3d')) { $('#stage3d').hidden = true; $('#stage').hidden = false; }
  if (is3d) { renderRoomOptions(); applyStagedUi(); syncPresetSel(); }
  renderPreview();
}

$('#pvViewMode')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-view]'); if (!b) return;
  setPreviewView(b.dataset.view);
});

$('#person3dSel')?.addEventListener('change', () => {
  pvPerson = $('#person3dSel').value;   // 정면 뷰와 같은 값을 쓰므로 양쪽에 함께 반영된다
  syncPvToggles();
  renderPreview();
});

$('#roomType')?.addEventListener('change', () => {
  roomTypeId = roomType($('#roomType').value).id;
  roomOpts = defaultOptions(roomTypeId);   // 타입이 바뀌면 그 타입의 기본 옵션으로
  renderRoomOptions(); renderPreview();
});

// 옵션 — 토글은 클릭, 숫자·선택은 input. 숫자 입력 중에는 다시 그리지 않아야(포커스 유지) 하므로
//   목록 재생성(renderRoomOptions)은 change 때만 한다.
$('#roomOpts')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-ropt]'); if (!b) return;
  roomOpts = normalizeOptions(roomTypeId, { ...roomOpts, [b.dataset.ropt]: !roomOpts[b.dataset.ropt] });
  b.classList.toggle('on', !!roomOpts[b.dataset.ropt]);
  renderPreview();
});
$('#roomOpts')?.addEventListener('input', e => {
  const el = e.target.closest('input[data-ropt],select[data-ropt]'); if (!el) return;
  const raw = el.tagName === 'INPUT' ? num(el.value) : el.value;
  roomOpts = normalizeOptions(roomTypeId, { ...roomOpts, [el.dataset.ropt]: raw });
  renderPreview();
});
$('#roomOpts')?.addEventListener('change', () => renderRoomOptions());

// 벽면 4개 토글.
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-t3dwall]'); if (!b) return;
  const k = b.dataset.t3dwall;
  pv3dShow.walls[k] = !pv3dShow.walls[k];
  b.classList.toggle('on', pv3dShow.walls[k]);
  renderPreview();
});

// 3D 표시 토글(사람·치수·바닥 격자·포인트 벽).
//   버튼은 왼쪽 패널로 '옮겨' 가므로(STEP 5) 특정 부모에 위임하면 끊긴다.
//   문서 전체에 걸어 두면 어디로 옮겨도 계속 동작한다.
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-t3d]'); if (!b) return;
  const k = b.dataset.t3d;
  pv3dShow[k] = !pv3dShow[k];
  b.classList.toggle('on', pv3dShow[k]);
  if (k === 'person') syncPerson3dSel();
  renderPreview();
});

// 큐브 시점 — 좌우 한 칸씩 돌리거나 목록에서 고른다(자유 회전은 없음).
// 시점 프리셋 — 목록에서 고르거나 ◀ ▶ 로 한 칸씩 돈다. '맞춤'은 지금 프리셋 자리로 되돌린다.
//   (PNG 저장은 다음 단계에서 붙인다.)
$('#btn3dRotL')?.addEventListener('click', () => { viewer3d?.stepPreset(-1); syncPresetSel(); });
$('#btn3dRotR')?.addEventListener('click', () => { viewer3d?.stepPreset(1); syncPresetSel(); });
$('#cubeView')?.addEventListener('change', () => {
  presetId = cameraPreset($('#cubeView').value).id;
  viewer3d?.setPreset(presetId);
});
$('#btn3dReset')?.addEventListener('click', () => viewer3d?.fitView());
$('#btn3dPng')?.addEventListener('click', () => {
  const url = viewer3d?.toPNG(3);   // 제안서·인쇄용 3배 해상도
  if (!url) { alert('먼저 3D 뷰를 표시한 뒤 저장하세요.'); return; }
  // 큰 PNG는 data URL 대신 Blob으로 내보낸다 — 파일 이름이 확실히 적용되고 메모리도 덜 쓴다.
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'image/png' }));
  const a = document.createElement('a');
  const name = ($('#pvModelName')?.textContent || 'LED').trim().replace(/[^\w가-힣.-]+/g, '_');
  a.href = blobUrl;
  a.download = `3D_${name}_${roomType(roomTypeId).label}_${cameraPreset(presetId).label}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
});

// 하단 높이(바닥에서 LED 아래까지)를 입력하면 세로 구성(바닥 여백·LED 세로·위 남는 높이)을 표시.
//   위 남는 높이 = 세로 공간 − 하단 높이 − LED 세로. 음수면(공간 초과) 경고를 빨간색으로 보여준다.
function updateVSplit(r, sH) {
  const el = $('#vSplitInfo'); if (!el) return;
  const baseH = num($('#baseHeight').value);
  if (!(baseH > 0)) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const mm = v => fmt(Math.round(v)) + 'mm';
  const ledH = (r && r.fits) ? (r.actualH || 0) : 0;
  if (!ledH) {   // 하단 높이가 너무 높아 남는 세로 공간에 캐비닛이 한 줄도 안 들어감
    el.style.color = 'var(--danger)';
    el.innerHTML = `⚠️ 하단 높이(${mm(baseH)})가 너무 높아 이 세로 공간에 LED가 들어가지 않습니다.`;
    return;
  }
  const top = sH - baseH - ledH;
  if (top < -1) {   // 수동 배열에서 행 수를 크게 지정한 경우(자동 채움에선 발생하지 않음)
    el.style.color = 'var(--danger)';
    el.innerHTML = `⚠️ 바닥 여백(${mm(baseH)}) + LED 세로(${mm(ledH)})가 세로 공간(${mm(sH)})을 <b>${mm(-top)}</b> 넘습니다. 행 수나 하단 높이를 줄이세요.`;
  } else {
    el.style.color = '';
    el.innerHTML = `바닥 여백 <b>${mm(baseH)}</b> · LED 세로 <b>${mm(ledH)}</b> · 위 남는 높이 <b>${mm(top)}</b> <span style="opacity:.7">(자동 채움 시 행 수 자동 조정)</span>`;
  }
}
// 사이니지(단독형·비디오월) 산출 스펙 — svCode가 있으면 04 칸을 LED 대신 사이니지 스펙으로 채운다.
//   표시 전용(계산·정합성 무관). 확인 안 된 값은 '—'. 비디오월은 배열(N×M) 합산 값도 함께 보여준다.
function renderSignageReadout(box) {
  const m = SIGNAGE_MODELS.find(x => x.modelCode === svCode);
  if (!m) { box.innerHTML = ''; return; }
  const f = computeSvFit();                       // 공간에 맞춘 N×M
  const isVW = m.category === 'video_wall';
  const N = f ? f.N : 1, M = f ? f.M : 1, panels = N * M;
  const d = m.display, p = m.physical, io = m.io;
  const nz = v => (v == null ? '—' : v);          // 0은 유효값(그대로), null만 '—'
  // 화면 크기 인치: 비디오월=개별 화면 인치(데이터), 단독형=모델명(QH115FX→115)에서, 없으면 cm→inch 환산.
  let svInch = null;
  if (isVW) svInch = d.screenSizeInch;
  else if (m.model && /(\d+)/.test(m.model)) svInch = parseInt(m.model.match(/(\d+)/)[1], 10);
  else if (d.screenSizeCm != null) svInch = Math.round(d.screenSizeCm / 2.54);
  const sizeLabel = isVW
    ? (svInch != null ? `${svInch}"` : '—')
    : (svInch != null ? `${svInch}"${d.screenSizeCm != null ? ` (${d.screenSizeCm}cm)` : ''}` : (d.screenSizeCm != null ? `${d.screenSizeCm} cm` : '—'));
  const resLabel = (d.resolution?.width != null) ? `${d.resolution.label || ''} ${fmt(d.resolution.width)}×${fmt(d.resolution.height)}`.trim() : '—';
  // 입출력 단자: 커넥터별 칩으로 정리(정신없던 한 줄 나열 대신). In/Out 중 확인된 값만, 미확인 커넥터는 생략.
  const ioPair = (inV, outV) => { const a = []; if (inV != null) a.push(`In ${inV}`); if (outV != null) a.push(`Out ${outV}`); return a.join(' · '); };
  const ioChips = [];
  if (io.hdmiIn != null || io.hdmiOut != null) ioChips.push(['HDMI', ioPair(io.hdmiIn, io.hdmiOut)]);
  if (io.displayPortIn != null || io.displayPortOut != null) ioChips.push(['DP', ioPair(io.displayPortIn, io.displayPortOut)]);
  if (io.dviIn != null) ioChips.push(['DVI', `In ${io.dviIn}`]);
  if (io.usb != null) ioChips.push(['USB', String(io.usb)]);
  if (io.rs232In != null || io.rs232Out != null) ioChips.push(['RS232', ioPair(io.rs232In, io.rs232Out)]);
  if (io.rj45 != null) ioChips.push(['LAN(RJ45)', String(io.rj45)]);
  const ioHTML = ioChips.length
    ? `<div class="metric ioFull"><div class="k">입출력 단자</div><div class="ioRow">${ioChips.map(([k, v]) => `<span class="ioChip"><b>${k}</b>${v ? ' ' + esc(v) : ''}</span>`).join('')}</div></div>`
    : `<div class="metric ioFull"><div class="k">입출력 단자</div><div class="v">—</div></div>`;
  const cells = [];
  if (isVW) {
    const totW = (p.widthMm != null) ? p.widthMm * N : null;
    const totH = (p.heightMm != null) ? p.heightMm * M : null;
    const totKg = (p.weightKg != null) ? p.weightKg * panels : null;
    cells.push(
      { k: '구성', v: `비디오월 ${N} × ${M}`, u: `= ${panels}장`, hero: true },
      { k: '개별 화면', v: sizeLabel, u: '' },
      { k: '개별 해상도', v: resLabel, u: 'px' },
      { k: '전체 해상도', v: (d.resolution?.width != null) ? `${fmt(d.resolution.width * N)} × ${fmt(d.resolution.height * M)}` : '—', u: 'px' },
      { k: '전체 크기', v: (totW != null) ? `${fmt(totW)} × ${fmt(totH)}` : '—', u: 'mm' },
      { k: '개별 패널(가로x세로x깊이)', v: (p.widthMm != null) ? `${fmt(p.widthMm)}×${fmt(p.heightMm)}×${nz(p.depthMm)}` : '—', u: 'mm' },
      { k: '총 중량', v: (totKg != null) ? fmt(totKg, 1) : '—', u: 'kg' },
      { k: '베젤(Bezel-to-Bezel)', v: nz(m.videoWall?.bezelMm), u: 'mm' },
    );
  } else {
    cells.push(
      { k: '모델', v: esc(m.model || m.modelCode), u: '', hero: true },
      { k: '화면 크기', v: sizeLabel, u: '' },
      { k: '해상도', v: resLabel, u: 'px' },
      { k: '외형(가로x세로x깊이)', v: (p.widthMm != null) ? `${fmt(p.widthMm)}×${fmt(p.heightMm)}×${nz(p.depthMm)}` : '—', u: 'mm' },
      { k: '무게', v: nz(p.weightKg == null ? null : fmt(p.weightKg, 1)), u: 'kg' },
      { k: 'VESA', v: nz(p.vesaMm), u: '' },
    );
  }
  // 소비전력: typical=공식 On Mode. maxW 있으면 표기, 없으면 Sleep 전력 병기.
  const pw = m.power || {};
  const powerVal = (pw.maxW != null)
    ? `${nz(pw.typicalW)} / ${pw.maxW}`
    : (pw.sleepW != null ? `${nz(pw.typicalW)} / ${pw.sleepW}` : `${nz(pw.typicalW)}`);
  const powerUnit = (pw.maxW != null) ? 'W (On/최대)' : (pw.sleepW != null ? 'W (On/Sleep)' : 'W (On)');
  cells.push(
    { k: '밝기', v: nz(d.brightnessNit), u: 'nit' },
    { k: '명암비', v: nz(d.contrastRatio), u: '' },
    { k: '응답속도', v: nz(d.responseTimeMs), u: 'ms' },
    { k: '소비전력', v: powerVal, u: powerUnit },
  );
  // 핵심 추가 항목 — 확인된 값만 표시(없으면 칸 생략).
  const wireless = [m.features?.wifi ? 'Wi-Fi' : null, m.features?.bluetooth ? 'BT' : null, m.features?.ir ? 'IR' : null].filter(Boolean).join(' · ');
  const addIf = (k, v, u) => { if (v != null && v !== '') cells.push({ k, v, u: u || '' }); };
  addIf('패널', d.panelType, '');
  addIf('베젤', p.bezelMm, 'mm');
  if (isVW) addIf('개별 베젤', m.videoWall?.individualBezelMm, 'mm');   // 비디오월: 패널 한 대 테두리
  addIf('SoC/OS', m.features?.soc, '');
  // 콘텐츠 플랫폼: MagicINFO/VXT 지원(둘 다면 둘 다). 둘 다 '미지원(false)' 확인 시 안내.
  const mi = m.features?.magicInfo, vx = m.features?.vxt;
  const platform = (mi === false && vx === false)
    ? '미지원 (외장 셋탑박스 필요)'
    : [mi ? 'MagicINFO' : null, vx ? 'VXT' : null].filter(Boolean).join(' · ');
  addIf('콘텐츠 플랫폼', platform, '');
  addIf('사용시간', m.operation?.ratedUsage, '');
  addIf('무선/제어', wireless, '');
  cells.push({ k: '모델코드', v: esc(m.modelCode), u: '' });
  // 출처(있으면): 사양 근거 URL을 클릭 링크로.
  const srcs = Array.isArray(m.sourceUrls) ? m.sourceUrls.filter(Boolean) : [];
  const srcHTML = srcs.length
    ? `<div class="metric ioFull"><div class="k">출처</div><div class="srcRow">${srcs.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">공식자료 ${i + 1}</a>`).join('')}</div></div>`
    : '';
  box.innerHTML = cells.map(c => `<div class="metric${c.hero ? ' hero' : ''}"><div class="k">${c.k}</div><div class="v">${c.v}<span class="u">${c.u || ''}</span></div></div>`).join('') + ioHTML + srcHTML;
}

function renderReadout() {
  const box = $('#readout'), nt = $('#notices'); nt.innerHTML = '';
  box.classList.toggle('svSpec', !!svCode);   // 사이니지 스펙만 글자 20% 축소(이사 요청 2026-09-14)
  if (svCode) { renderSignageReadout(box); const vs = $('#vSplitInfo'); if (vs) vs.hidden = true; return; }
  const m = models.find(x => x.id === selectedId);
  if (!m) { box.innerHTML = ''; const vs = $('#vSplitInfo'); if (vs) vs.hidden = true; return; }
  const sW = spaceWmm(), sH = spaceHmm();
  const r = computeConfig(m, sW, sH, opts());
  updateVSplit(r, sH);
  // 화면(Screen) 배열은 항상 표시: 자동 채움·LED 크기 지정 모드에선 계산된 열·행을 입력칸에 반영한다.
  if (mode !== 'manual') { const mc = $('#manCols'), mr = $('#manRows'); if (mc) mc.value = r.cols || 0; if (mr) mr.value = r.rows || 0; }
  const aspect = r.actualH > 0 ? r.actualW / r.actualH : 0;
  // 소수 1자리까지 표기하되 .0이면 정수로(예: 32.0→"32", 21.33→"21.3"). 화면비 x:9·가로 N개에 사용.
  const trim1 = n => (isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '—');
  // 소수 3자리까지 표기하되 뒤의 0은 생략(예: 3.840→"3.84", 4.000→"4"). 실제 모듈 크기(m)에 사용.
  const trim3 = n => (isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : '—');
  // Signal-region counts (matches the FHD/UHD preview overlay) — always show both.
  const hasRes = r.resW > 0 && r.resH > 0;
  const fhd = hasRes ? { c: Math.ceil(r.resW / 1920), r: Math.ceil(r.resH / 1080) } : null;
  const uhd = hasRes ? { c: Math.ceil(r.resW / 3840), r: Math.ceil(r.resH / 2160) } : null;
  const cells = [
    { k: '실제 모듈 크기', v: `${trim3(r.actualW / 1000)} × ${trim3(r.actualH / 1000)}`, u: 'm', hero: true },
    { k: '대각', v: fmt(r.diagIn, 1), u: "'" },
    { k: '캐비닛 배열', v: `${r.cols} × ${r.rows}`, u: `= ${r.total} + 예비 ${r.spares} = ${r.totalWithSpares}` },
    { k: '전체 해상도', v: `${fmt(r.resW)} × ${fmt(r.resH)}`, u: 'px' },
    { k: '16:9 최대 해상도', v: `${fmt(r.res169W)} × ${fmt(r.res169H)}`, u: `px (${fmt(r.diag169In, 1)}")` },
    ...(fhd ? [{ k: 'FHD 신호 영역', v: `${fhd.c} × ${fhd.r}`, u: `= ${fhd.c * fhd.r}개` }] : []),
    ...(uhd ? [{ k: 'UHD 신호 영역', v: `${uhd.c} × ${uhd.r}`, u: `= ${uhd.c * uhd.r}개` }] : []),
    { k: '밝기 (최대)', v: fmt(r.brightnessMax), u: 'nit' },
    { k: '총 중량', v: fmt(r.weightKg, 1), u: 'kg' },
    { k: '최대 소비전력', v: fmt(r.maxW == null ? NaN : r.maxW / 1000, 2), u: 'kW' },
    { k: '평균 소비전력', v: fmt(r.typW == null ? NaN : r.typW / 1000, 2), u: 'kW' },
    { k: '발열 (최대)', v: fmt(r.heatMaxBTU == null ? NaN : r.heatMaxBTU / 1000, 1), u: 'kBTU/h' },
    { k: `SBOX${r.controller ? ` (${esc(r.controller)})` : ''}`, v: sboxText(r.sbox), u: (r.sbox > 0 ? `대 + 예비 ${r.sboxSpares} = ${r.sboxWithSpares}${r.redundancy ? ' · 이중화' : ''}` : '') },
    { k: 'Gbic', v: r.gbic ? fmt(r.gbic * 2) : '<span class="vdash">—</span>', u: r.gbic ? `EA (SBOX ${fmt(r.gbic)} + LED ${fmt(r.gbic)})` : '' },
    { k: '총 화소수', v: fmt(r.pixels / 1e6, 1), u: 'MP' },
    { k: '면적', v: fmt(r.areaM2, 2), u: 'm²' },
    { k: '화면비', v: `${trim1(aspect * 9)}:9`, u: `(16:9 가로 ${trim1(aspect * 9 / 16)}개)` },
    { k: '권장 시청거리', v: fmt(r.bdm25M, 1), u: 'm · BDM(세로x5)' },
    { k: '최대 시청거리', v: fmt(r.bdm30M, 1), u: 'm · BDM(세로x6)' },
  ];
  box.innerHTML = cells.map(c => `<div class="metric${c.hero ? ' hero' : ''}"><div class="k">${c.k}</div><div class="v">${c.v}<span class="u">${c.u || ''}</span></div></div>`).join('');

  if (!r.fits) nt.innerHTML = `<div class="notice warn">⚠ 지정 조건으로 캐비닛이 배치되지 않습니다.</div>`;
  else if (r.deadW > 0.5 || r.deadH > 0.5) nt.innerHTML = `<div class="notice info">여백 — 가로 ${fmt(r.deadW)}mm · 세로 ${fmt(r.deadH)}mm (센터 정렬 시 각 ${fmt(r.marginW)}/${fmt(r.marginH)}mm).</div>`;
  if (r.fits && !r.is169 && r.res169W > 0) nt.innerHTML += `<div class="notice info">16:9가 아닌 구성(슈퍼와이드 등)입니다. 16:9 콘텐츠 최대 해상도는 ${fmt(r.res169W)} × ${fmt(r.res169H)} px입니다.</div>`;
  if (r.maxW == null) nt.innerHTML += `<div class="notice warn">⚠ 이 모델은 중량·전력 데이터시트 값이 없어 해당 지표를 산출할 수 없습니다.</div>`;
  if (r.fits && r.sbox == null && !m.integratedController) nt.innerHTML += `<div class="notice warn">⚠ 이 모델은 컨트롤러(SBOX) 입력 용량 정보가 없어 SBOX 수량을 산출할 수 없습니다.</div>`;
  // 배열 직접 지정에서 요청 배열이 공간을 넘으면: 03 미리보기 위 바(#ledFitBar)에 비디오월과 같은 위치로 안내·확장 버튼 표시(이사 요청 2026-09-15).
  const d = cabinetResolution(m);
  if (Math.abs(m.cabW / m.pitch - d.resW) > 1 || Math.abs(m.cabH / m.pitch - d.resH) > 1)
    nt.innerHTML += `<div class="notice warn">⚠ 정합성: 크기÷피치와 입력 해상도가 다릅니다.</div>`;
}

// 05 비디오 프로세서 — 04 산출값 + 사용자 요구를 engine에 넘겨 제품별 판정·추천을 그린다(계산 없음).
let vpOut4kEdited = false;   // '필요 4K 출력 수'를 사용자가 직접 기입했는지(비우면 자동값 복귀)
const VP_MODE_FLAGS = {
  split:    {},
  fade:     { fadeRequired: true },
  seamless: { seamlessSwitching: true, trueABRequired: true, previewProgramRequired: true, fadeRequired: true },
  show:     { seamlessSwitching: true, trueABRequired: true, previewProgramRequired: true, fadeRequired: true, advancedTransitionRequired: true },
};
function vpReqOpts() {
  const flags = VP_MODE_FLAGS[$('#vpMode')?.value] ?? {};
  return {
    independent4kInputs: num($('#vpIn4k')?.value),
    independent2kInputs: num($('#vpIn2k')?.value),
    simultaneous4kLayers: num($('#vpLayers4k')?.value),
    application: $('#vpApp')?.value ?? 'other',
    genlockRequired: $('#vpGenlock')?.checked ?? false,
    hdrRequired: $('#vpHdr')?.checked ?? false,
    tenBitRequired: $('#vp10bit')?.checked ?? false,
    externalControlRequired: $('#vpCtrl')?.checked ?? false,
    ...flags,
  };
}
const VP_BADGE_CLASS = { '권장': 'rec', '적합': 'ok', '조건부 적합': 'cond', '한계 구성': 'edge', '부적합': 'no' };
function vpCheckHTML(c) {
  const cls = c.ok === true ? 'ok' : (c.ok === false ? 'no' : 'unk');
  const icon = c.ok === true ? '✓' : (c.ok === false ? '✗' : '?');
  const isNum = typeof c.need === 'number' || typeof c.have === 'number';
  const val = isNum
    ? `필요 ${c.need ?? '—'} / 지원 ${c.have ?? '확인 필요'}${c.unit || ''}`
    : `${c.have}`;
  return `<li class="vc ${cls}"><span class="ic">${icon}</span><span class="cn">${esc(c.name)}</span><span class="cv">${esc(String(val))}</span></li>`;
}
// 입출력 정보(팝업으로 보여줄 값)가 있는 제품인지. 커넥터 수량(HDMI/DP/SDI) 또는
//   최대 독립 입력(4K/2K)·최대 출력(4K/2K) 중 하나라도 있으면 대상. (Aquilon RS 등 카드형 포함, 이사 요청)
function procHasFixedPorts(p) {
  const i = p.inputs || {}, o = p.outputs || {}, s = p.slots || {};
  return ['hdmi14', 'hdmi20', 'dp12', 'sdi3g', 'sdi12g'].some(k => i[k] != null)
    || i.maxIndependent4k != null || i.maxIndependent2k != null
    || o.maxIndependent4kOutputs != null || o.maxIndependent4kPgm != null || o.maxActiveOutputs != null || o.maxIndependent2k != null
    // 카드(슬롯)형 제품(NovaStar H 등): 입출력 커넥터 값이 없어도 슬롯 수로 용량을 유도해 팝업을 띄운다.
    || s.maxInputBoards != null || s.maxOutputBoards != null;
}
// 제품군별 '카드당 4K 채널' 표시 문구(이사 지정 2026-09-15). 수치는 데이터(proc.cards)에서 오고 문구만 고른다.
//   side: 'in'|'out'. 채널 수 미상이면 '미상'(1채널 가정 금지).
function cardChannelPhrase(p, perCard, side) {
  const fam = p.family, mfr = p.manufacturer;
  if (mfr === 'Analog Way' && fam === 'Aquilon') return side === 'in' ? '카드당 독립 4K 최대 4채널' : '카드당 4K 최대 4채널';
  if (mfr === 'Colorlight' && fam === 'Universe') return 'HDMI 카드당 4K 최대 2채널';
  if (mfr === 'Colorlight' && fam === 'X100 Pro') return '4K 카드당 1채널';
  if (mfr === 'NovaStar' && fam === 'H') return '4K 카드당 1채널';
  if (perCard != null) return `카드당 4K ${perCard}채널`;   // 표 밖 제품: 데이터 있으면 일반 문구
  return '카드당 채널 미상';                                 // 없으면 미상(추정 금지)
}
// 고정형 입력 커넥터 종류·수량 문구(요청 2026-09-15). 데이터에 있는 커넥터만, 없으면 null(미상).
const CONNECTOR_LABELS = [
  ['hdmi20', 'HDMI 2.0'], ['dp12', 'DP 1.2'], ['hdmi14', 'HDMI 1.4'],
  ['sdi12g', '12G-SDI'], ['sdi3g', '3G-SDI'], ['comboHdmi14Sdi3g', 'HDMI1.4/3G-SDI 겸용'],
];
// 커넥터 칩 목록(종류 라벨은 작게 · 개수는 크게). 0/null 커넥터는 렌더 안 함.
function connChipsHTML(pairs, cls = '') {
  return pairs.filter(([, n]) => n != null && n > 0)
    .map(([label, n]) => `<span class="connChip ${cls}"><span class="cLbl">${esc(label)}</span><span class="cCnt">×${n}</span></span>`).join('');
}
// 슬롯 사용 상태 시각화. reqCards(사용 카드)·slots(전체 슬롯). 넘치면 부족(빨강). 색+텍스트 함께 제공.
function slotVizHTML(reqCards, slots) {
  if (slots == null || reqCards == null) return '';
  const cap = Math.max(slots, reqCards, 0);
  let blocks = '';
  for (let i = 0; i < cap; i++) {
    const cls = (i < slots) ? (i < reqCards ? 'used' : 'free') : 'short';   // 물리슬롯 내: 사용/여유, 초과분: 부족
    blocks += `<span class="slotBlk ${cls}"></span>`;
  }
  const used = Math.min(reqCards, slots), free = Math.max(0, slots - reqCards), short = Math.max(0, reqCards - slots);
  const legend = `사용 ${used}` + (short > 0 ? ` · <b class="vpShort">부족 ${short}</b>` : ` · 여유 ${free}`);
  return `<div class="vpSlotViz" aria-hidden="true">${blocks}</div><div class="vpSlotLegend">${legend}</div>`;
}
// 슬롯형 카드의 한쪽(입력/출력) 영역. 계산값은 cardPlan에서 오고 여기선 표시만.
function slotSideHTML(side, p, need, reqCards, slots, perCard) {
  const kLabel = side === 'in' ? '입력' : '출력';
  const reqTxt = !(need > 0) ? '필요 <b>0</b>장 <span class="muted-note">(요구 없음)</span>'
    : (reqCards != null ? `필요 <b>${reqCards}</b>장` : '필요 <b>미상</b>');
  const slotTxt = (slots != null) ? `전체 <b>${slots}</b>슬롯` : '전체 슬롯 <b>미상</b>';
  const chan = cardChannelPhrase(p, perCard, side);
  let remTxt, remCls = '';
  if (slots == null || reqCards == null) remTxt = `남는 ${kLabel} 슬롯 <span class="muted-note">미상</span>`;
  else {
    const rem = slots - reqCards;
    if (rem < 0) { remTxt = `<b class="vpShort">${kLabel} 슬롯 ${-rem}개 부족</b>`; remCls = 'short'; }
    else { remTxt = `남는 ${kLabel} 슬롯 <b>${rem}</b>개`; remCls = rem >= 2 ? 'ok' : 'warn'; }
  }
  return `<div class="vpCardCol">
    <h5 class="vpColHd">${kLabel} 카드</h5>
    <div class="vpColLine">${reqTxt} / ${slotTxt}</div>
    <div class="vpColChan">${esc(chan)}</div>
    <div class="vpColRem ${remCls}">${remTxt}</div>
    ${slotVizHTML(reqCards, slots)}
  </div>`;
}
// 슬롯형(customizable) 제품 카드 본문 — 입력/출력 2열 + 슬롯 시각화 + 상태 칩.
function vpSlotCardHTML(item) {
  const p = item.proc, cp = item.cardPlan;
  const inS = slotSideHTML('in', p, cp.needIn, cp.reqInCards, cp.inSlots, cp.inPerCard);
  const outS = slotSideHTML('out', p, cp.needOut, cp.reqOutCards, cp.outSlots, cp.outPerCard);
  const inRem = (cp.inSlots != null && cp.reqInCards != null) ? cp.inSlots - cp.reqInCards : null;
  const outRem = (cp.outSlots != null && cp.reqOutCards != null) ? cp.outSlots - cp.reqOutCards : null;
  const short = (inRem != null && inRem < 0) || (outRem != null && outRem < 0);
  const remChip = (label, rem) => rem == null ? `<span class="vpChip unk">${label} 미상</span>`
    : (rem >= 0 ? `<span class="vpChip ok">${label} 여유 ${rem}</span>` : `<span class="vpChip no">${label} ${-rem} 부족</span>`);
  const statusChip = short ? '<span class="vpChip no">슬롯 부족</span>' : '<span class="vpChip ok">구성 가능</span>';
  const note = p.slotNote ? `<div class="ioNote">${esc(p.slotNote)}</div>` : '';
  return `<div class="vpCards">
    <div class="vpCardGrid">${inS}${outS}</div>
    <div class="vpChips">${statusChip}${remChip('입력', inRem)}${remChip('출력', outRem)}</div>
    ${note}
  </div>`;
}
// 고정형(preconfigured) 제품 카드 본문 — 입력 커넥터 구성 + 입출력 수량.
function vpFixedCardHTML(item) {
  const p = item.proc, i = p.inputs || {}, o = p.outputs || {};
  // [입력] 커넥터 종류·수(합=4K 입력 채널). HDMI1.4/겸용은 데이터에 있으면 표시(Midra 등), RS는 없음.
  const inChips = connChipsHTML(CONNECTOR_LABELS.map(([k, label]) => [label, i[k]]));
  const inGroup = `<div class="ioGroup"><div class="ioHd">입력</div>${inChips
    ? `<div class="connRow">${inChips}</div>`
    : '<div class="muted-note">커넥터 구성 미상 (데이터시트 값 필요)</div>'}</div>`;
  // [출력] Active Output(≠PGM). activeConnector 있으면 종류 표시(RS=HDMI 2.0), 없으면 'Active 출력'.
  const act = o.maxActiveOutputs, pgm = o.maxIndependent4kPgm;
  const outGroup = act != null ? `<div class="ioGroup"><div class="ioHd">출력 <span class="ioSub">Active Output</span></div>
    <div class="connRow"><span class="connChip"><span class="cLbl">${esc(o.activeConnector || 'Active 출력')}</span><span class="cCnt">×${act}</span></span></div>
    ${pgm != null ? `<div class="ioExtra">4K PGM <b>${pgm}</b> <span class="muted-note">(Active와 별개)</span></div>` : ''}</div>` : '';
  // [멀티뷰어] 전용 출력(Active에 합산 금지). 있을 때만.
  const mv = o.dedicatedMultiviewer;
  const mvGroup = (mv != null && mv > 0)
    ? `<div class="ioGroup"><div class="ioHd">멀티뷰어 <span class="ioSub">Dedicated</span></div>
      <div class="connRow"><span class="connChip mv"><span class="cLbl">${esc(o.activeConnector || 'HDMI 2.0')}</span><span class="cCnt">×${mv}</span></span></div></div>`
    : '';
  const note = p.fieldSwappableCards
    ? '<div class="ioNote">프리컨피규어드 기본 장착 카드 기준이며, 실제 구성은 I/O 카드 교체에 따라 달라질 수 있습니다.</div>'
    : '';
  return `<div class="vpFixed">${inGroup}${outGroup}${mvGroup}${note}</div>`;
}
// Edge-Blending(와이드 캔버스) 지원 표시값. 판단 불가(전부 null)면 null → 행 미표시.
//   여러 출력을 이어 하나의 넓은 화면으로 결합하는 기능. 결합 가능 출력 수(maxCanvasOutputs)가 전체 출력보다 적을 수 있음.
function edgeBlendingText(p) {
  const c = p.canvas || {}, m = p.modes || {}, o = p.outputs || {};
  const yes = m.edgeBlending === true || c.multiOutputCanvas === true;
  const no = m.edgeBlending === false || c.multiOutputCanvas === false;
  if (yes) {
    const mc = c.maxCanvasOutputs, total = o.maxActiveOutputs;
    if (mc != null) return (total != null && total !== mc) ? `지원 (최대 ${mc}출력 / 전체 ${total})` : `지원 (최대 ${mc}출력)`;
    return '지원';
  }
  if (no) return '미지원';
  return null;   // 미상 → 행 표시 안 함
}
// 상세 사양(접기) — 물리 입력/Active 출력/PGM·스크린/믹싱·분할 레이어/윈도우/Edge-Blending을 서로 구분. Active≠PGM≠레이어.
function vpDetailHTML(item) {
  const p = item.proc, i = p.inputs || {}, o = p.outputs || {}, L = p.layers || {};
  const v = (x) => (x != null ? x : '<span class="muted-note">미상</span>');
  const eb = edgeBlendingText(p);   // Edge-Blending(와이드 캔버스) 지원 여부
  // core=항상 표시(미상 포함), opt=값 있을 때만(N/A 개념 노이즈 방지). 개념 구분 유지(Active≠PGM, 윈도우≠레이어, 슬롯≠채널).
  const specs = [
    ['물리 4K 입력 채널', i.maxIndependent4k, true],
    ['물리 2K 입력 채널', i.maxIndependent2k, false],
    ['4K Active 출력', o.maxActiveOutputs, true],
    ['2K 출력', o.maxIndependent2k, false],
    ['4K PGM / 스크린', o.maxIndependent4kPgm, true],
    ['믹싱 레이어', L.mixing4k, false],
    ['분할 레이어', L.split4k, false],
    ['4K 레이어(전역)', L.global4k, false],
    ['2K 레이어(전역)', L.global2k, false],
    ['총 윈도우', L.maxWindows, true],
  ];
  let specList = specs.filter(([, val, always]) => always || val != null)
    .map(([n, val]) => `<li class="vSpec"><span class="cn">${n}</span><span class="cv">${v(val)}</span></li>`).join('');
  // Edge-Blending(와이드 캔버스) — 판단 가능할 때만 행 추가. 지원=파랑, 미지원=회색.
  if (eb) {
    const cls = eb === '미지원' ? 'muted-note' : '';
    specList += `<li class="vSpec"><span class="cn">Edge-Blending(와이드 캔버스)</span><span class="cv ${cls}">${esc(eb)}</span></li>`;
  }
  const checks = item.checks?.length ? item.checks.map(vpCheckHTML).join('') : '';
  return `<details class="vpDetail"><summary>상세 사양 보기</summary>
    <ul class="vpSpecList">${specList}</ul>
    ${checks ? `<div class="vpDetailSub">요구 대비 판정</div><ul class="vpChecksList">${checks}</ul>` : ''}
  </details>`;
}
// 조건부 적합 카드의 설명 블록 — item.checks에서 '확인 필요'(ok===null)인 항목만 문장으로 조립(추정 금지).
function vpCondNoteHTML(item) {
  if (item.label !== '조건부 적합') return '';
  const unknowns = (item.checks || []).filter(c => c.ok === null).map(c => c.name);
  if (!unknowns.length) return '';
  return `<div class="vpCondNote">${esc(unknowns.join(' · '))} 지원 여부가 공식 사양에 없어 추정하지 않았습니다. 그 외 입력 · 출력 · 레이어 요구는 모두 충족합니다.</div>`;
}
function vpItemHTML(item, rank) {
  const p = item.proc;
  const needsVer = p.verification?.status !== 'official';
  const cp = item.cardPlan;
  // 형태: preconfigured=고정형(커넥터), customizable=슬롯형(카드 구성). 없으면 cardPlan로 보조.
  const isSlot = p.configurationType === 'customizable' || (p.configurationType == null && cp?.cardBased);
  const bodyMain = !cp ? '' : (isSlot ? vpSlotCardHTML(item) : vpFixedCardHTML(item));
  // 포트 고정형 제품은 이름을 누르면 포트별 입출력 수량 팝업(이사 요청).
  const fixed = procHasFixedPorts(p);
  const nameAttr = fixed ? ` class="vpName vpNameClickable" data-portproc="${esc(p.id)}" role="button" tabindex="0" title="포트별 입출력 수량 보기"` : ' class="vpName"';
  const rankHTML = rank ? `<span class="vpRank">${rank}</span>` : '';
  // 제품 전면 사진 플레이트(있는 제품만). 클릭 시 앞/뒤 이미지 팝업(openProcImgPopup) 재사용.
  const hasImg = PROC_IMG_IDS.has(p.id);
  const plateHTML = hasImg ? `<div class="vpPlate">
      <div class="vpPlateBox" data-procimg="${esc(p.id)}" role="button" tabindex="0" title="제품 앞·뒤 이미지 크게 보기"><img src="${procImgSrc(p.id, 'front')}" alt="${esc(p.manufacturer)} ${esc(p.model)} 전면" draggable="false"/></div>
      <div class="vpPlateCap"><span class="t">전면 패널</span><span class="s">클릭하면 앞 · 뒤 확대</span></div>
    </div>` : '';
  return `<div class="vpItem ${VP_BADGE_CLASS[item.label] || ''}">
    <div class="vpHead">
      ${rankHTML}
      <span class="vpBadge">${item.label}</span>
      <span${nameAttr}>${esc(p.manufacturer)} · ${esc(p.model)}${fixed ? ' <span class="vpPortHint">포트 ⌄</span>' : ''}</span>
      ${hasImg ? `<button type="button" class="vpImgBtn" data-procimg="${esc(p.id)}" title="제품 앞/뒤 이미지 보기">이미지</button>` : ''}
      ${needsVer ? '<span class="vpVer" title="일부 사양이 공식 확인 전입니다">확인 필요 사양 포함</span>' : ''}
    </div>
    ${plateHTML}
    ${vpCondNoteHTML(item)}
    ${bodyMain}
    ${vpDetailHTML(item)}
  </div>`;
}
// 포트별 입출력 수량 팝업. index.html 마크업을 건드리지 않게 동적으로 생성.
// 프로세서 제품 사진(앞/뒤)이 있는 모델 id. 파일: src/img/processors/<id>-front|back.jpg (이사 제공 이미지).
const PROC_IMG_IDS = new Set([
  'ns-h2', 'ns-h5', 'ns-h9', 'ns-h15', 'ns-h20',
  'cl-universe-u6max', 'cl-universe-u9max', 'cl-x100pro-2u', 'cl-x100pro-4u', 'cl-x100pro-7u',
  'aw-midra-pulse-4k', 'aw-midra-eikos-4k', 'aw-alta-zenith-100', 'aw-alta-zenith-200',
  'aw-aquilon-rsalpha', 'aw-aquilon-rs1', 'aw-aquilon-rs2', 'aw-aquilon-rs3', 'aw-aquilon-rs4', 'aw-aquilon-rs5', 'aw-aquilon-rs6', 'aw-aquilon-cmini', 'aw-aquilon-cmax',
  'aw-aquilon-c', 'aw-aquilon-cplus', 'cl-x100pro-11u',   // 신규 3종(사양 확인중, 이미지만)
]);
// 사양 확인중(GPT Work 의뢰) — 자동추천엔 안 나오고 05 하단에 '이미지만' 노출.
//   Aquilon C·C+(2026-09-15)·X100 Pro 11U(2026-09-15) 사양 정식 등록 완료 → 목록에서 제외. 현재 대기 없음.
const SPEC_PENDING_IDS = new Set();
const procImgSrc = (id, side) => `img/processors/${id}-${side}.jpg`;

// 프로세서 제품 이미지(앞/뒤) 뷰어 팝업. index.html을 건드리지 않게 동적 생성(포트 팝업과 동일 패턴).
function openProcImgPopup(id, side = 'front') {
  if (!PROC_IMG_IDS.has(id)) return;
  if (side !== 'front' && side !== 'back') side = 'front';
  const p = PROCESSORS.find(x => x.id === id);
  const title = p ? `${p.manufacturer} · ${p.model}` : id;
  let el = document.querySelector('#procImgPop');
  if (!el) {
    el = document.createElement('div'); el.id = 'procImgPop'; el.hidden = true; document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-piclose]')) { el.hidden = true; return; }
      const t = e.target.closest('[data-piside]');
      if (t) {
        el.querySelectorAll('[data-piside]').forEach(b => b.classList.toggle('on', b === t));
        const im = el.querySelector('#procImgImg');
        if (im) im.src = procImgSrc(el.dataset.pid, t.dataset.piside);
      }
    });
    // 원형 돋보기(확대 렌즈) — 이미지 위에서 커서를 따라 해당 부분을 확대해 보여준다(이사 요청 2026-09-15).
    const LOUPE = 160, ZOOM = 3.1;   // 돋보기 원 160px(133→160, 1.2배 확대 이사 요청 2026-09-16) · 배율 3.1
    const moveLoupe = e => {
      const img = el.querySelector('#procImgImg'), loupe = el.querySelector('#procLoupe');
      if (!img || !loupe || !img.complete || !img.naturalWidth) return;
      const r = img.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { loupe.hidden = true; return; }
      const x = e.clientX - r.left, y = e.clientY - r.top;
      loupe.hidden = false;
      loupe.style.left = (x - LOUPE / 2) + 'px';
      loupe.style.top = (y - LOUPE / 2) + 'px';
      loupe.style.backgroundImage = `url("${img.src}")`;
      loupe.style.backgroundSize = (r.width * ZOOM) + 'px ' + (r.height * ZOOM) + 'px';
      loupe.style.backgroundPosition = `${LOUPE / 2 - x * ZOOM}px ${LOUPE / 2 - y * ZOOM}px`;
    };
    const hideLoupe = () => { const l = el.querySelector('#procLoupe'); if (l) l.hidden = true; };
    el.addEventListener('pointermove', moveLoupe);
    ['pointerleave', 'pointerup', 'pointercancel'].forEach(ev => el.addEventListener(ev, hideLoupe));
  }
  el.dataset.pid = id;
  el.innerHTML = `<div class="procImgCard" role="dialog" aria-modal="true" aria-label="${esc(title)} 제품 이미지">
      <div class="procImgHead">
        <div class="procImgTitle">${esc(title)}</div>
        <div class="procImgTabs"><button type="button" class="tiny${side === 'front' ? ' on' : ''}" data-piside="front">앞면</button><button type="button" class="tiny${side === 'back' ? ' on' : ''}" data-piside="back">뒷면</button></div>
        <button type="button" class="ppClose" data-piclose aria-label="닫기">✕</button>
      </div>
      <div class="procImgBody"><div class="procImgZoom" id="procImgZoom" title="마우스를 올리면 원형 돋보기로 확대됩니다"><img id="procImgImg" src="${procImgSrc(id, side)}" alt="${esc(title)} 제품 이미지" draggable="false"/><div class="procLoupe" id="procLoupe" hidden></div></div></div>
    </div>`;
  el.hidden = false;
}

function openPortPopup(id) {
  const p = PROCESSORS.find(x => x.id === id);
  if (!p) return;
  const nn = v => (v == null ? '<span class="muted-note">—</span>' : `<b>${v}</b>개`);
  const row = (label, v) => `<tr><td>${esc(label)}</td><td class="pp-n">${nn(v)}</td></tr>`;
  const rowAssumed = (label, v, assumed) => `<tr><td>${esc(label)}${assumed ? ' <span class="muted-note">(카드 기준 추정)</span>' : ''}</td><td class="pp-n">${nn(v)}</td></tr>`;
  // 커넥터별 수량(고정형: Pulse/Eikos/Alta)이 있으면 그걸, 없으면 최대 독립 입력(카드형: Aquilon RS)을 보여줌.
  const connRows = [['HDMI 1.4', p.inputs.hdmi14], ['HDMI 2.0', p.inputs.hdmi20], ['DisplayPort 1.2', p.inputs.dp12], ['3G-SDI', p.inputs.sdi3g], ['12G-SDI', p.inputs.sdi12g], ['HDMI 1.4 / 3G-SDI 겸용', p.inputs.comboHdmi14Sdi3g]]
    .filter(([, v]) => v != null);
  const indepRows = [['독립 입력 · 4K', p.inputs.maxIndependent4k], ['독립 입력 · 2K', p.inputs.maxIndependent2k]]
    .filter(([, v]) => v != null);
  // 카드(슬롯)형 제품(NovaStar H 등): 커넥터·독립입력 값이 없으면 슬롯 수로 용량을 유도해 표시.
  const s = p.slots || {};
  const isCardBased = connRows.length === 0 && indepRows.length === 0 && (s.maxInputBoards != null || s.maxOutputBoards != null);
  const inCap = isCardBased ? inputsCapacity(p) : null;
  const outCap = isCardBased ? outputCapacity(p) : null;
  const outCap2k = isCardBased ? outputCapacity2k(p) : null;

  let inTitle, inRows, inHTML;
  if (isCardBased) {
    inTitle = '입력 (카드 기준)';
    inRows = [];
    if (s.maxInputBoards != null) inRows.push(rowAssumed('입력 카드(보드)', s.maxInputBoards, false));
    if (inCap.max4k != null) inRows.push(rowAssumed('독립 입력 · 4K', inCap.max4k, inCap.assumed4k));
    if (inCap.max2k != null) inRows.push(rowAssumed('독립 입력 · 2K', inCap.max2k, inCap.assumed2k));
    inHTML = inRows.length ? inRows.join('') : `<tr><td colspan="2" class="muted-note">확인 필요(데이터시트 미확보)</td></tr>`;
  } else {
    inRows = connRows.length ? connRows : indepRows;
    inTitle = connRows.length ? '입력 포트' : '입력 (최대)';
    inHTML = inRows.length ? inRows.map(([l, v]) => row(l, v)).join('') : `<tr><td colspan="2" class="muted-note">확인 필요(데이터시트 미확보)</td></tr>`;
  }

  let outTitle = '출력', outHTML;
  if (isCardBased) {
    const outRows = [];
    if (s.maxOutputBoards != null) outRows.push(rowAssumed('출력 카드(보드)', s.maxOutputBoards, false));
    if (outCap.value != null) outRows.push(rowAssumed('독립 4K 출력', outCap.value, outCap.assumed));
    if (outCap2k.value != null) outRows.push(rowAssumed('독립 2K 출력', outCap2k.value, false));
    outTitle = '출력 (카드 기준)';
    outHTML = outRows.length ? outRows.join('') : `<tr><td colspan="2" class="muted-note">확인 필요</td></tr>`;
  } else {
    const outRows = [['Active 출력', p.outputs.maxActiveOutputs], ['독립 4K 출력', p.outputs.maxIndependent4kOutputs], ['4K PGM 출력', p.outputs.maxIndependent4kPgm], ['2K 출력', p.outputs.maxIndependent2k]].filter(([, v]) => v != null);
    outHTML = outRows.length ? outRows.map(([l, v]) => row(l, v)).join('') : `<tr><td colspan="2" class="muted-note">확인 필요</td></tr>`;
  }
  // 커넥터를 보여줄 때만 독립 입력 최대를 참고로 덧붙임(카드형은 이미 위에 표시됨).
  const showIndepNote = connRows.length && (p.inputs.maxIndependent4k != null || p.inputs.maxIndependent2k != null);
  const needsVer = p.verification?.status !== 'official';
  const hasImg = PROC_IMG_IDS.has(id);   // 제품 이미지가 있으면 포트 팝업에 함께 표시(이사 요청 2026-09-14)
  let el = document.querySelector('#portPop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'portPop';
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-portclose]')) { el.hidden = true; return; }
      // 팝업 안 제품 이미지 앞/뒤 전환(data-ppside).
      const t = e.target.closest('[data-ppside]');
      if (t) {
        el.querySelectorAll('[data-ppside]').forEach(b => b.classList.toggle('on', b === t));
        const im = el.querySelector('#ppImgImg');
        if (im) im.src = procImgSrc(el.dataset.pid, t.dataset.ppside);
        return;
      }
      // 이미지를 누르면 큰 뷰어로 확대(현재 보고 있는 앞/뒤 면 유지, 이사 요청 2026-09-14).
      if (e.target.closest('[data-ppzoom]')) {
        const cur = el.querySelector('[data-ppside].on')?.dataset.ppside || 'front';
        openProcImgPopup(el.dataset.pid, cur);
      }
    });
  }
  el.dataset.pid = id;
  const imgSecHTML = hasImg ? `<div class="ppImgSec">
      <div class="ppImgTabs"><button type="button" class="tiny on" data-ppside="front">앞면</button><button type="button" class="tiny" data-ppside="back">뒷면</button></div>
      <div class="ppImgWrap" data-ppzoom role="button" tabindex="0" title="클릭하면 크게 보기"><img id="ppImgImg" src="${procImgSrc(id, 'front')}" alt="${esc(p.manufacturer)} ${esc(p.model)} 제품 이미지" draggable="false"/><span class="ppZoomHint" aria-hidden="true">⤢ 크게</span></div>
    </div>` : '';
  el.innerHTML = `<div class="portPopCard${hasImg ? ' ppWithImg' : ''}" role="dialog" aria-modal="true" aria-label="포트별 입출력 수량">
    <div class="ppHead">
      <div class="ppTitle">${esc(p.manufacturer)} · ${esc(p.model)}</div>
      <button type="button" class="ppClose" data-portclose aria-label="닫기">✕</button>
    </div>
    <div class="ppBody">
      ${imgSecHTML}
      <div class="ppPorts">
        <div class="ppSec"><div class="ppSecTitle">${inTitle}</div><table class="ppTable">${inHTML}</table>
          ${showIndepNote
            ? `<div class="ppNote">독립 입력 최대 · 4K ${p.inputs.maxIndependent4k ?? '—'} / 2K ${p.inputs.maxIndependent2k ?? '—'}</div>` : ''}
        </div>
        <div class="ppSec"><div class="ppSecTitle">${outTitle}</div><table class="ppTable">${outHTML}</table></div>
      </div>
    </div>
    ${needsVer ? '<div class="ppVer">※ 일부 값은 공식 확인 전이라 “—(확인 필요)”로 표시됩니다.</div>' : ''}
  </div>`;
  el.hidden = false;
}
// 등급 레전드 바 — 결과 목록 위에 등급별 개수(권장/적합/조건부/한계/부적합)를 색 스와치와 함께 표시.
//   개수는 rankProcessors 결과 전체에서 집계(부적합 포함). 순위 정렬은 rankProcessors가 담당.
function vpLegendHTML(ranked) {
  const order = [['권장', 'rec'], ['적합', 'ok'], ['조건부', 'cond'], ['한계', 'edge'], ['부적합', 'no']];
  const counts = {};
  for (const x of ranked) { const c = VP_BADGE_CLASS[x.label] || ''; counts[c] = (counts[c] || 0) + 1; }
  const items = order.filter(([, c]) => counts[c])
    .map(([short, c]) => `<span class="vpLegItem"><span class="vpLegSw" style="background:var(--vp-${c})"></span>${short} ${counts[c]}</span>`).join('');
  return items ? `<div class="vpLegend">${items}</div>` : '';
}
function renderProcessors() {
  const auto = $('#vpAuto'), out = $('#vpResult');
  if (!auto || !out) return;
  { const pill = $('#vpAutoPill'); if (pill) pill.textContent = '자동 추천'; }
  if (svCode) { auto.innerHTML = '<div class="previewEmpty">삼성 LCD 사이니지에는 해당 없습니다 (비디오 프로세서는 LED 전용).</div>'; out.innerHTML = ''; const b = $('#vpBuildResult'); if (b) b.innerHTML = ''; return; }
  const m = models.find(x => x.id === selectedId);
  if (!m) { auto.innerHTML = '<div class="previewEmpty">모델을 선택하면 추천이 표시됩니다.</div>'; out.innerHTML = ''; return; }
  const sW = spaceWmm(), sH = spaceHmm();
  const r = computeConfig(m, sW, sH, opts());
  if (!r.fits || !(r.resW > 0)) { auto.innerHTML = '<div class="previewEmpty">배열이 없어 추천을 계산할 수 없습니다.</div>'; out.innerHTML = ''; return; }
  const o = vpReqOpts();
  // 필요 4K 출력 수: 사용자가 기입하면 그 값, 안 했으면 자동값을 칸에 표시(비우면 자동).
  const autoReq = processorRequirements(r);
  const out4kEl = $('#vpOut4k');
  if (out4kEl && !vpOut4kEdited) out4kEl.value = autoReq.required4kOutputs ?? '';
  if (vpOut4kEdited) { const v = num(out4kEl?.value); if (v > 0) o.required4kOutputs = v; }
  const req = processorRequirements(r, o);
  const out4kAuto = req.required4kOutputs === autoReq.required4kOutputs;
  // #vpOut4k 자동/직접 입력 상태에 따라 필드 스타일(점선 '자동' vs 실선) 전환.
  const out4kField = $('#vpOut4kField');
  if (out4kField) out4kField.classList.toggle('isAuto', !vpOut4kEdited);
  // STEP 1 — 04 산출값 스탯 타일 3개.
  const modelName = m.name || m.id;
  auto.innerHTML = `<div class="vpStatGrid">
    <div class="vpStat">
      <div class="vpStatLab">전체 해상도</div>
      <div class="vpStatVal">${fmt(r.resW)}<span class="x">×</span>${fmt(r.resH)}</div>
      <div class="vpStatSub">${esc(modelName)} · ${r.cols} × ${r.rows} 캐비닛</div>
    </div>
    <div class="vpStat accent${out4kAuto ? '' : ' manual'}">
      <div class="vpStatLab">필요 4K 출력 <span class="vpStatTag">${out4kAuto ? '자동' : '직접 입력'}</span></div>
      <div class="vpStatVal">${req.required4kOutputs ?? '—'}<span class="u"> 개</span></div>
      <div class="vpStatSub">4K 캔버스 ${req.required4kOutputs ?? '—'}장 결합</div>
    </div>
    <div class="vpStat">
      <div class="vpStatLab">필요 2K 출력</div>
      <div class="vpStatVal">${req.required2kOutputs ?? '—'}<span class="u"> 개</span></div>
      <div class="vpStatSub">2K 분할 환산</div>
    </div>
  </div>`;
  const ranked = rankProcessors(PROCESSORS, req);
  const good = ranked.filter(x => x.label !== '부적합');
  const bad = ranked.filter(x => x.label === '부적합');
  const pill = $('#vpAutoPill'); if (pill) pill.textContent = `자동 추천 · ${good.length}종`;
  // 사양 확인중 신규 모델 — 자동추천엔 안 들어가지만 이미지만 볼 수 있게 하단에 별도 표시.
  const pend = PROCESSORS.filter(p => SPEC_PENDING_IDS.has(p.id));
  const pendHTML = pend.length ? `<details class="vpPending"><summary>신규 · 사양 확인중 ${pend.length}종 (이미지만 보기)</summary>`
    + pend.map(p => `<div class="vpPendItem"><span class="vpPendName">${esc(p.manufacturer)} · ${esc(p.model)}</span>`
      + `${PROC_IMG_IDS.has(p.id) ? `<button type="button" class="vpImgBtn" data-procimg="${esc(p.id)}" title="제품 앞/뒤 이미지 보기">이미지</button>` : ''}`
      + `<span class="vpVer" title="사양은 확인 후 반영됩니다">사양 확인중</span></div>`).join('') + `</details>` : '';
  // STEP 3 — 등급 레전드 + 순위 순 평면 리스트(부적합은 하단 접이식 행).
  out.innerHTML =
    vpLegendHTML(ranked)
    + (good.length ? good.map((it, i) => vpItemHTML(it, i + 1)).join('')
      : '<div class="notice warn">지금 요구 조건을 만족하는 프로세서가 없습니다. 입력 수·레이어 수·운용 방식을 조정해 보세요.</div>')
    + (bad.length ? `<details class="vpFail"><summary>부적합 ${bad.length}종 보기 <span class="vpFailSub">출력 수 · 레이어 부족</span></summary>${bad.map(it => vpItemHTML(it)).join('')}</details>` : '')
    + pendHTML;
  renderBuild(req, ranked);
}

// 08 데이터 흐름(IG): 화면을 S-Box 입력 영역(제품별 지원 해상도, 현재 4K)으로 나눠 담당 캐비닛을 보여준다.
//   계산은 engine.js의 r.ig(igLayout) 결과만 사용 — 여기선 표시만 한다(중복 계산 금지).
function dfTopProcessorName(r) {
  try {
    const ranked = rankProcessors(PROCESSORS, processorRequirements(r));
    const best = ranked.find(x => x.label !== '부적합');
    return best ? `${best.proc.manufacturer} · ${best.proc.model}` : null;
  } catch { return null; }
}
// ── 삼성 공식 도면 스타일 SVG (P18 Power Flow / P19 Data Flow) ────────────────
function fxCellSize(cols, rows) {
  return Math.max(16, Math.min(44, Math.floor(980 / Math.max(1, cols)), Math.floor(300 / Math.max(1, rows))));
}
// P19 Data Flow(Front View): 캐비닛 격자 + 신호 그룹(빨간 테두리) + 뱀형(serpentine) 영상/통신 배선 + 시작점(파란 점).
//   layout = 신호 영역 레이아웃(CS4B는 GBIC 1920×2160, 그 외는 S-Box 4K). labelPrefix = 라벨 접두사.
function dataFlowSVG(r, layout, labelPrefix) {
  const ig = layout; if (!ig || !ig.regions.length) return '';
  // CS4B 계열(광지빅)에서 광 이중화(Gbic 포워드/백워드, gbicFB) 또는 SBOX 이중화면 각 신호 그룹을
  //   양끝에서 급전(Primary ● / Redundant ▬)하는 광 I/G 이중화로 표시.
  //   (삼성 MM015F P23/25 Data Flow Diagram: 같은 데이터 체인을 Primary·Redundant 두 끝에서 급전.)
  const dual = !!(r.gbic != null && (r.gbicFB || r.redundancy));
  const cs = fxCellSize(r.cols, r.rows), W = r.cols * cs, H = r.rows * cs;
  const cx = c => c * cs + cs / 2, cy = k => k * cs + cs / 2;
  const io = Math.max(5, cs * 0.34);
  let cells = '', cables = '', groups = '', labels = '';
  for (let rr = 0; rr < r.rows; rr++) for (let c = 0; c < r.cols; c++) {
    cells += `<rect class="fxCell" x="${c * cs}" y="${rr * cs}" width="${cs}" height="${cs}"/>`
      + `<rect class="fxIo" x="${(c * cs + (cs - io) / 2).toFixed(1)}" y="${(rr * cs + (cs - io) / 2).toFixed(1)}" width="${io.toFixed(1)}" height="${io.toFixed(1)}"/>`;
  }
  let sboxIdx = 0;
  for (const rg of ig.regions) {
    if (rg.colStart == null) continue;
    sboxIdx++;
    const x0 = rg.colStart * cs, y0 = rg.rowStart * cs, w = (rg.colEnd - rg.colStart + 1) * cs, h = (rg.rowEnd - rg.rowStart + 1) * cs;
    const regCols = rg.colEnd - rg.colStart + 1;
    const pts = [];
    for (let ri = rg.rowStart; ri <= rg.rowEnd; ri++) {
      const cc = []; for (let c = rg.colStart; c <= rg.colEnd; c++) cc.push(c);
      if ((ri - rg.rowStart) % 2 === 1) cc.reverse();
      for (const c of cc) pts.push([cx(c), cy(ri)]);
    }
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const rr0 = Math.max(4, cs * 0.18);
    cables += `<path class="fxCable" d="${d}"/><circle class="fxStart" cx="${pts[0][0].toFixed(1)}" cy="${pts[0][1].toFixed(1)}" r="${rr0.toFixed(1)}"/>`;
    // 이중화: 체인 반대쪽 끝에 Redundant(예비) 급전점(빨간 사각)을 표시.
    //   1캐비닛 영역은 Primary와 끝점이 겹치므로 살짝 좌상단으로 옮겨 둘 다 보이게 한다.
    if (dual) {
      const e = pts[pts.length - 1], sq = Math.max(6, cs * 0.30);
      const off = (pts.length === 1) ? cs * 0.24 : 0;
      cables += `<rect class="fxRedundant" x="${(e[0] - off - sq / 2).toFixed(1)}" y="${(e[1] - off - sq / 2).toFixed(1)}" width="${sq.toFixed(1)}" height="${sq.toFixed(1)}"/>`;
    }
    groups += `<rect class="fxGroup" x="${x0 + 1}" y="${y0 + 1}" width="${w - 2}" height="${h - 2}"/>`;
    // 영역 하단 라벨. GBIC 모드면 'SBOX#<s>-<p> · GBIC #<n> · 열범위'(s=S-Box 번호, p=출력포트).
    //   CS4B 1 S-Box = 4포트(Primary 1·2 + Redundant 3·4). GBIC 1개 = 1920×2160 = S-Box 출력포트 1개.
    //   좁은 영역엔 안 들어가므로 길이 순으로 줄여 영역 폭에 맞춘다.
    const fsz = Math.max(6, Math.min(10, cs * 0.32));
    const colTxt = regCols > 1 ? `${rg.colStart + 1}~${rg.colEnd + 1}열` : `${rg.colStart + 1}열`;
    let cands;
    if (labelPrefix === 'GBIC') {
      const sboxColsTotal = Math.max(1, Math.ceil(r.resW / 3840));   // S-Box 4K(3840×2160) 격자
      const sboxCol = Math.floor(rg.px0 / 3840), sboxRow = Math.floor(rg.py0 / 2160);
      const sboxNo = sboxRow * sboxColsTotal + sboxCol + 1;
      const port = Math.floor((rg.px0 - sboxCol * 3840) / 1920) + 1;   // S-Box 안에서의 출력 포트(1·2 Primary)
      cands = [`SBOX#${sboxNo}-${port} · GBIC #${sboxIdx} · ${colTxt}`, `SBOX#${sboxNo}-${port} · GBIC #${sboxIdx}`, `SBOX#${sboxNo}-${port}`, `#${sboxIdx}`];
    } else {
      cands = [`${labelPrefix} #${sboxIdx} · ${colTxt}`, `${labelPrefix} #${sboxIdx}`, `#${sboxIdx}`];
    }
    const charW = fsz * 0.56, avail = w - 6;
    const lbl = cands.find(c => c.length * charW + 8 <= avail) || cands[cands.length - 1];
    const lx = x0 + w / 2, ly = y0 + h - Math.max(2, cs * 0.14);
    const lw = Math.min(avail, lbl.length * charW + 8), lh = fsz + 4;
    labels += `<rect class="fxLblBg" x="${(lx - lw / 2).toFixed(1)}" y="${(ly - lh + 2).toFixed(1)}" width="${lw.toFixed(1)}" height="${lh.toFixed(1)}" rx="2"/>`
      + `<text class="fxLbl" x="${lx.toFixed(1)}" y="${(ly - 1).toFixed(1)}" font-size="${fsz.toFixed(1)}">${esc(lbl)}</text>`;
  }
  return `<div class="fxWrap"><svg class="fx" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${cells}${cables}${groups}${labels}</svg></div>`;
}
// P18 Power Flow(Rear View): 캐비닛 격자 + 열별 데이지체인(길이 perDaisy) — 상단 파란 사각(라우팅 종단),
//   세로 인터커넥트 케이블, 캐비닛별 회색 I/O, 하단 파란 꺾쇠(∧, 주 전원 입력).
function powerFlowSVG(r, perDaisy) {
  const cs = fxCellSize(r.cols, r.rows), W = r.cols * cs, H = r.rows * cs;
  const cx = c => c * cs + cs / 2;
  const io = Math.max(4, cs * 0.28), L = (perDaisy && perDaisy > 0) ? perDaisy : r.rows;
  let cells = '', wires = '';
  for (let rr = 0; rr < r.rows; rr++) for (let c = 0; c < r.cols; c++)
    cells += `<rect class="fxCell" x="${c * cs}" y="${rr * cs}" width="${cs}" height="${cs}"/>`;
  for (let c = 0; c < r.cols; c++) {
    const x = cx(c);
    for (let rs = 0; rs < r.rows; rs += L) {
      const re = Math.min(rs + L - 1, r.rows - 1);
      for (let k = rs; k <= re; k++)
        wires += `<rect class="fxIo" x="${(x - io / 2).toFixed(1)}" y="${(k * cs + cs / 2 - io / 2).toFixed(1)}" width="${io.toFixed(1)}" height="${io.toFixed(1)}"/>`;
      const yTop = rs * cs + cs * 0.30, yBot = re * cs + cs * 0.78;
      wires += `<line class="pxLine" x1="${x}" y1="${yTop.toFixed(1)}" x2="${x}" y2="${yBot.toFixed(1)}"/>`;
      const sq = Math.max(7, cs * 0.32);
      wires += `<rect class="pxEnd" x="${(x - sq / 2).toFixed(1)}" y="${(rs * cs + cs * 0.14).toFixed(1)}" width="${sq.toFixed(1)}" height="${sq.toFixed(1)}"/>`;
      const ch = Math.max(6, cs * 0.26), yb = re * cs + cs * 0.86;
      wires += `<path class="pxChev" d="M ${(x - ch).toFixed(1)} ${yb.toFixed(1)} L ${x} ${(yb - ch).toFixed(1)} L ${(x + ch).toFixed(1)} ${yb.toFixed(1)}"/>`;
    }
  }
  return `<div class="fxWrap"><svg class="fx" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${cells}${wires}</svg></div>`;
}
function dfLegendHTML(dual, groupTerm) {
  // dual=true(CS4B 광지빅+이중화): Primary(주)·Redundant(예비) 급전점을 함께 안내.
  const primary = dual ? 'Primary Data Link (주 광 급전)' : 'Primary Video Cable Input (주 영상 입력)';
  const redundant = dual ? '<i><span class="k-redsq"></span>Redundant Data Link (예비 광 급전 · 광 I/G 이중화)</i>' : '';
  return `<div class="fxLegend">
  <i><span class="k-dot"></span>${primary}</i>
  ${redundant}
  <i><span class="k-io"></span>Video &amp; Communication Input (영상·통신 입력)</i>
  <i><span class="k-line"></span>Video &amp; Communication Cables (영상·통신 케이블)</i>
  <i><span class="k-grp"></span>${esc(groupTerm)} 신호 그룹</i>
</div>`;
}
const PW_LEGEND = `<div class="fxLegend">
  <i><span class="k-line"></span>Power Interconnect Cable (전원 연결 케이블)</i>
  <i><span class="k-io"></span>Power Cable Input/Output (전원 입·출력)</i>
  <i><span class="k-sq"></span>Primary Cable Routing End Point (배선 종단)</i>
  <i><span class="k-chev">∧</span>Primary Power Cable Input (주 전원 입력)</i>
</div>`;

function renderDataFlow() {
  const host = $('#dfDiagram'); if (!host) return;
  if (svCode) { host.innerHTML = '<div class="previewEmpty">삼성 LCD 사이니지에는 해당 없습니다 (데이터 흐름·전원 구성은 LED 전용).</div>'; return; }
  const m = models.find(x => x.id === selectedId);
  if (!m) { host.innerHTML = '<div class="previewEmpty">모델을 선택하면 표시됩니다.</div>'; return; }
  const r = computeConfig(m, spaceWmm(), spaceHmm(), opts());
  if (!r.fits || !r.ig) { host.innerHTML = '<div class="previewEmpty">배열이 없어 데이터 흐름을 계산할 수 없습니다.</div>'; return; }
  const ig = r.ig;
  if (ig.integrated) { host.innerHTML = '<div class="notice">이 모델은 통합 컨트롤러라 별도 S-Box(신호 그룹)가 필요 없습니다.</div>'; return; }
  if (ig.boxes == null || !ig.regions.length) { host.innerHTML = '<div class="notice warn">S-Box 지원 해상도 데이터가 없어 신호 구성을 표시할 수 없습니다.</div>'; return; }
  const proc = dfTopProcessorName(r);
  // CS4B 계열 컨트롤러(광지빅 사용)면 S-Box → 광지빅(GBIC) → LED 경로를 흐름에 표시.
  const gbicNode = (r.gbic != null)
    ? `<span class="dfArrow">→</span><span class="dfNode gbic">광지빅(GBIC) ${fmt(r.gbic)} SET${r.gbicFB ? ' <em class="muted-note">+광 이중화</em>' : ''}</span>`
    : '';
  const ctrlLbl = r.controller ? ` <em class="muted-note">${esc(r.controller)}</em>` : '';
  const flow = `<div class="dfFlow">
    <span class="dfNode">영상 소스</span><span class="dfArrow">→</span>
    <span class="dfNode proc">${proc ? esc(proc) : '프로세서'}<em class="muted-note"> (05 추천)</em></span><span class="dfArrow">→</span>
    <span class="dfNode sbox">S-Box ${ig.boxes}대${ctrlLbl}${r.redundancy ? ' <em class="muted-note">+이중화</em>' : ''}</span>${gbicNode}<span class="dfArrow">→</span>
    <span class="dfNode led">LED ${r.cols}×${r.rows}</span>
  </div>`;
  // 삼성 Data Flow Diagram(Front View) 스타일: 캐비닛 격자 + 신호 그룹(빨간 테두리) + 뱀형 배선.
  //   신호 그룹 단위: CS4B 광지빅=GBIC(1920×2160), 광 미사용(비-CS4B)=IG FHD(1920×1080), 그 외=S-Box 4K.
  const useGbic = !!(r.igGbic && r.igGbic.regions.length);
  const useFhd = !useGbic && !!(r.igFhd && r.igFhd.regions.length);
  const layout = useGbic ? r.igGbic : (useFhd ? r.igFhd : ig);
  const groupTerm = useGbic ? 'GBIC' : (useFhd ? 'IG' : 'S-Box');
  const dual = !!(r.gbic != null && (r.gbicFB || r.redundancy));
  const dualTitle = dual ? ' · 광 I/G 이중화 (Primary/Redundant)' : '';
  const dualNote = dual
    ? ` · <b>광 I/G 이중화</b>: 각 그룹을 <span style="color:#2b2f8f">Primary(●)</span>·<span style="color:#e2001a">Redundant(▬)</span> 양끝에서 급전 — 한쪽 광선로 장애 시 반대쪽에서 계속 표시`
    : '';
  // CS4B S-Box 출력 포트 안내: 1 S-Box = GBIC 2개(=출력 4포트), Primary 1·2 + Redundant 3·4.
  const portNote = (useGbic && dual)
    ? ` · <b>S-Box 출력 포트</b>: Primary 1·2 + Redundant 3·4 (라벨 <code>SBOX#s-p</code> = S-Box s의 p번 포트)`
    : (useGbic ? ` · 라벨 <code>SBOX#s-p</code> = S-Box s의 p번 출력 포트(GBIC 1개=1920×2160)` : '');
  const titleUnit = useGbic ? `광지빅(GBIC) ${layout.regions.length} SET`
    : useFhd ? `신호 입력 그룹(IG) ${layout.regions.length}개 · 1920×1080`
      : `S-Box ${ig.boxes}대`;
  const capNote = useGbic
    ? `전체 <b>${fmt(r.resW)}×${fmt(r.resH)}</b>px · GBIC 1개 = <b>${fmt(layout.capW)}×${fmt(layout.capH)}</b>px(CS4B 광지빅 단위) · 빨간 그룹 = GBIC 담당 캐비닛, 파란 선 = 영상·통신 배선 경로`
    : useFhd
      ? `전체 <b>${fmt(r.resW)}×${fmt(r.resH)}</b>px · IG 1개 = <b>${fmt(layout.capW)}×${fmt(layout.capH)}</b>px(광 미사용 컨트롤러 신호 단위) · 빨간 그룹 = IG 담당 캐비닛, 파란 선 = 영상·통신 배선 경로`
      : `전체 <b>${fmt(r.resW)}×${fmt(r.resH)}</b>px · S-Box 1대 = 최대 <b>${fmt(ig.capW)}×${fmt(ig.capH)}</b>px(${esc(ig.controller || '컨트롤러')}) · 빨간 그룹 = S-Box 담당 캐비닛, 파란 선 = 영상·통신 배선 경로`;
  host.innerHTML = flow
    + `<div class="fxTitle">Data Flow Diagram (Front View) — ${titleUnit}${dualTitle}</div>`
    + dataFlowSVG(r, layout, groupTerm)
    + dfLegendHTML(dual, groupTerm)
    + `<div class="dfLegend">${capNote}${dualNote}${portNote}</div>`;
}

// 09 전원 구성: 삼성 데이터시트 알고리즘(회로당=⌊V×A×0.8/Wcab⌋, 회로수=⌈총/회로당⌉). r.power만 사용.
function renderPower() {
  const host = $('#pwPanel'); if (!host) return;
  const m = models.find(x => x.id === selectedId);
  if (!m) { host.innerHTML = '<div class="previewEmpty">모델을 선택하면 표시됩니다.</div>'; return; }
  const r = computeConfig(m, spaceWmm(), spaceHmm(), opts());
  if (!r.fits) { host.innerHTML = '<div class="previewEmpty">배열이 없어 전원 구성을 계산할 수 없습니다.</div>'; return; }
  if (!r.power) { host.innerHTML = '<div class="notice warn">이 모델은 캐비닛 최대전력(W) 데이터시트 값이 없어 전원 구성을 산출할 수 없습니다.</div>'; return; }
  const p = r.power;
  const kw = v => v == null ? '—' : fmt(v / 1000, 2);
  const rows = p.rows.map(x => {
    return `<tr class="${x.primary ? 'pw230' : ''}">
      <td class="pwV">${esc(x.label)}${x.primary ? ' <span class="pwTag">주 사용</span>' : ''}</td>
      <td>${x.cabinetsPerCircuit ?? '—'} 대</td>
      <td><b>${x.circuits ?? '—'}</b> 회로</td>
      <td>${x.cabinetsPerDaisyChain ?? '—'} 대</td>
      <td>${x.daisyChains ?? '—'} 줄</td>
    </tr>`;
  }).join('');
  // 삼성 Power Flow Diagram(Rear View) 스타일: 열별 데이지체인(주 사용 230V 20A 기준) 도면.
  const primaryRow = p.rows.find(x => x.primary) || p.rows.find(x => x.cabinetsPerDaisyChain != null);
  const perDaisy = primaryRow?.cabinetsPerDaisyChain ?? null;
  const flowHTML = `<div class="fxTitle">Power Flow Diagram (Rear View) — ${esc(primaryRow?.label || '230V')} · 데이지체인 ${perDaisy ?? '—'}대</div>`
    + powerFlowSVG(r, perDaisy) + PW_LEGEND;
  host.innerHTML = flowHTML + `
    <div class="pwSummary">
      <span>총 캐비닛 <b>${fmt(p.total)}</b>대</span>
      <span>캐비닛당 최대 <b>${fmt(p.perCabinetW)}</b>W</span>
      <span>총 최대전력 <b>${kw(r.maxW)}</b>kW</span>
      <span>연속부하 여유 <b>${Math.round(p.derate * 100)}%</b></span>
    </div>
    <div class="tableWrap"><table class="pwTable">
      <thead><tr><th>전압 / 차단기</th><th>회로당 캐비닛</th><th>필요 회로</th><th>데이지체인당</th><th>데이지체인</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="pwNote">회로당 캐비닛 = ⌊전압 × 차단기A × ${Math.round(p.derate * 100)}% ÷ 캐비닛최대W⌋, 필요 회로 = ⌈총 캐비닛 ÷ 회로당⌉.
      데이지체인당 = ⌊전압 × ${p.chainAmps}A ÷ 캐비닛최대W⌋. (삼성 IF015R-M 데이터시트 알고리즘 · 230V 국내 기준)</div>`;
}

// 05 '내 장비 구성으로 검증': 사용자가 계획한 카드 수가 이 LED에 충분한지 확인.
let vpBuildProcInit = false;
function renderBuild(req, ranked) {
  const sel = $('#vpBuildProc'), out = $('#vpBuildResult');
  if (!sel || !out) return;
  if (!vpBuildProcInit) {   // 드롭다운을 제품 목록으로 1회 채운다.
    sel.innerHTML = PROCESSORS.map(p => `<option value="${p.id}">${esc(p.manufacturer)} · ${esc(p.model)}</option>`).join('');
    // 기본값: 현재 최상위 추천 제품
    if (ranked && ranked[0]) sel.value = ranked[0].proc.id;
    vpBuildProcInit = true;
  }
  const proc = PROCESSORS.find(p => p.id === sel.value) ?? PROCESSORS[0];
  const build = {
    out4kCards: $('#vpBuildOut4k')?.value.trim() ? num($('#vpBuildOut4k').value) : null,
    in4kPorts: $('#vpBuildIn4k')?.value.trim() ? num($('#vpBuildIn4k').value) : null,
    in2kPorts: $('#vpBuildIn2k')?.value.trim() ? num($('#vpBuildIn2k').value) : null,
  };
  if (build.out4kCards == null && build.in4kPorts == null && build.in2kPorts == null) {
    out.innerHTML = '<div class="hint">카드 수를 입력하면 이 구성이 충분한지 판정합니다.</div>';
    return;
  }
  const v = validateBuild(proc, req, build);
  const label = v.verdict === 'PASS' ? '충분' : v.verdict === 'FAIL' ? '부족/초과' : '확인 필요';
  const cls = v.verdict === 'PASS' ? 'ok' : v.verdict === 'FAIL' ? 'no' : 'cond';
  out.innerHTML = `<div class="vpItem ${cls}">
    <div class="vpHead"><span class="vpBadge">${label}</span><span class="vpName">${esc(proc.manufacturer)} · ${esc(proc.model)} — 내 구성</span></div>
    <ul class="vpChecksList">${v.checks.map(vpCheckHTML).join('')}</ul>
  </div>`;
}

// 06 비교표 LED용 헤더(사이니지 표시 후 되돌릴 때 사용).
const LED_CMP_HEAD = '<th>모델</th><th>Pitch</th><th>배열</th><th>대각 (")</th><th>LED 크기 (m)</th><th>SBOX(Gbic)</th><th>해상도 (px)</th><th>16:9 해상도 (px)</th><th>최대전력 (kW)</th><th>중량 (kg)</th><th>밝기 (nit)</th><th>여백 (mm)</th>';

// 사이니지 선택 시 06 모델별 비교에 해당 종류(단독형/비디오월) 제품 리스트를 보여준다(이사 요청 2026-09-14).
function renderCompareSignage(head) {
  const sel = SIGNAGE_MODELS.find(m => m.modelCode === svCode);
  const cat = sel ? sel.category : 'standalone_signage';
  if (head) head.innerHTML = '<th>모델</th><th>화면</th><th>해상도</th><th>밝기 (nit)</th><th>명암비</th><th>크기 (mm)</th><th>무게 (kg)</th><th>소비전력 (W)</th><th>패널</th>';
  const body = $('#cmpBody'); body.innerHTML = '';
  const nz = v => v == null ? '—' : v;
  for (const m of SIGNAGE_MODELS.filter(x => x.category === cat)) {
    const d = m.display, p = m.physical;
    let inch = (m.category === 'video_wall') ? d.screenSizeInch
      : (m.model && /(\d+)/.test(m.model) ? parseInt(m.model.match(/(\d+)/)[1], 10) : null);
    const name = (m.category === 'video_wall') ? `삼성 ${nz(d.screenSizeInch)}형` : (m.model || m.modelCode);
    const size = (p.widthMm != null) ? `${fmt(p.widthMm)}×${fmt(p.heightMm)}×${nz(p.depthMm)}` : '—';
    const res = (d.resolution?.width != null) ? `${d.resolution.label || ''} ${fmt(d.resolution.width)}×${fmt(d.resolution.height)}`.trim() : '—';
    const tr = document.createElement('tr');
    tr.className = 'rowbtn' + (m.modelCode === svCode ? ' pick' : '');
    tr.dataset.svpick = m.modelCode;
    tr.innerHTML = `
      <td class="name">${esc(name)} <span class="muted-note">${esc(m.modelCode)}</span></td>
      <td>${inch != null ? inch + '"' : '—'}</td>
      <td>${res}</td>
      <td>${nz(d.brightnessNit)}</td>
      <td>${nz(d.contrastRatio)}</td>
      <td>${size}</td>
      <td>${p.weightKg != null ? fmt(p.weightKg, 1) : '—'}</td>
      <td>${nz(m.power?.typicalW)}</td>
      <td>${nz(d.panelType)}</td>`;
    body.appendChild(tr);
  }
}

function renderCompare() {
  const head = document.querySelector('#cmpTable thead tr');
  if (svCode) { renderCompareSignage(head); return; }
  if (head) head.innerHTML = LED_CMP_HEAD;
  const sW = spaceWmm(), sH = spaceHmm();
  // 메인 산출과 동일한 opts() 사용(이사 요청 2026-09-15): 배열 직접 지정 시 그 배열을, 자동 채움 시 ② LED
  //   설치 크기(비우면 벽면)를 대상으로 각 모델을 계산한다. 기존엔 항상 벽공간(fill)이라 지정 크기·중량이 어긋났음.
  const o = opts();
  const rows = visibleModels().map(m => ({ m, r: computeConfig(m, sW, sH, o) }));
  const body = $('#cmpBody'); body.innerHTML = '';
  for (const { m, r } of rows) {
    const tr = document.createElement('tr');
    tr.className = 'rowbtn' + (m.id === selectedId ? ' pick' : '') + (!r.fits ? ' nofit' : '');
    tr.dataset.id = m.id;
    tr.innerHTML = `
      <td class="name">${esc(m.name)}</td>
      <td>${fmtPitch(m.pitch)}</td>
      <td>${r.fits ? `${r.cols}×${r.rows}` : '—'}</td>
      <td>${r.fits ? fmt(r.diagIn, 1) : '—'}</td>
      <td>${r.fits ? `${fmtMeters(r.actualW)}×${fmtMeters(r.actualH)}` : '—'}</td>
      <td>${r.fits ? sboxText(r.sbox) + (r.gbic != null ? `(${fmt(r.gbic * 2)})` : '') : '—'}</td>
      <td>${r.fits ? `${fmt(r.resW)}×${fmt(r.resH)}` : '—'}</td>
      <td>${r.fits ? `${fmt(r.res169W)}×${fmt(r.res169H)}` : '—'}</td>
      <td>${r.maxW == null ? '—' : fmt(r.maxW / 1000, 2)}</td>
      <td>${fmt(r.weightKg, 1)}</td>
      <td>${fmt(r.brightnessMax)}</td>
      <td>${r.fits ? `${fmt(r.deadW)}/${fmt(r.deadH)}` : '—'}</td>`;
    body.appendChild(tr);
  }
}

// 06 원가/견적 — 가격표가 이 브라우저에 있을 때만 표를 그린다. 없으면 '가격표 불러오기' 안내만 표시.
function renderQuote() {
  const card = $('#quoteCard');
  if (!card) return;
  const box = $('#quoteBody');
  const etcRow = $('#etcRow');
  const clearBtn = $('#btnPriceClear');
  const hwLine = $('#highWorkLine');
  if (!PRICES) {
    if (etcRow) etcRow.hidden = true;
    if (hwLine) hwLine.hidden = true;
    if (clearBtn) clearBtn.hidden = true;
    box.innerHTML = '<div class="previewEmpty">사내 전용 — 위 <b>‘가격표 불러오기’</b> 버튼으로 가격표 파일(prices.local.js)을 한 번 불러오면 원가·견적이 여기에 표시됩니다.<br>불러온 값은 이 브라우저에 저장되어 다음에 열 때도 자동으로 나타납니다. (공개 방문자에겐 표시되지 않습니다.)</div>';
    return;
  }
  if (etcRow) etcRow.hidden = false;
  if (hwLine) hwLine.hidden = false;
  if (clearBtn) clearBtn.hidden = false;
  ensureIndirectDefaults();
  const m = models.find(x => x.id === selectedId);
  if (!m) { box.innerHTML = ''; return; }
  const sW = spaceWmm(), sH = spaceHmm();
  const r = computeConfig(m, sW, sH, opts());
  const etc = { cost: num($('#etcCost')?.value), sell: num($('#etcSell')?.value) };
  const highWork = $('#highWork')?.checked ?? false;
  const q = computeQuote(m, r, PRICES, { etc, highWork, indirectDisabled: Array.from(indirectDisabled) });
  if (!q) { box.innerHTML = '<div class="previewEmpty">이 공간에는 캐비닛이 들어가지 않습니다.</div>'; return; }

  const won = v => v == null ? '<span class="vdash">—</span>' : fmt(v);
  const qn = v => v == null ? '—' : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const rows = q.lines.map(l => {
    const mg = (l.sell > 0 && l.cost != null) ? ((l.sell - l.cost) / l.sell * 100) : null;
    return `<tr>
      <td class="name">${esc(l.label)}${l.note ? ` <span class="muted-note">${esc(l.note)}</span>` : ''}</td>
      <td>${qn(l.qty)} ${esc(l.unit)}</td>
      <td>${won(l.unitCost)}</td>
      <td>${won(l.cost)}</td>
      <td>${won(l.unitSell)}</td>
      <td>${won(l.sell)}</td>
      <td>${mg == null ? '—' : fmt(mg, 1) + '%'}</td>
    </tr>`;
  }).join('');
  const totMg = q.totalSell > 0 ? (q.totalSell - q.totalCost) / q.totalSell * 100 : 0;
  const ind = q.indirect;
  // 간접비 상세 표(견적에만 가산). 기준(baseKind) 라벨 매핑.
  const baseLabel = { labor: '노무비', direct: '직접비', special: '직접비+간접노무+안전' };
  const indirectBlock = ind ? `
    <div class="indirectWrap">
      <details class="indirectDetails"${indirectOpen ? ' open' : ''}>
        <summary class="indSummary">
          <span class="indTitle">간접비 합계</span>
          <span class="indAmt">${fmt(ind.total)}</span>
          <span class="muted-note indHint">표준품셈 · 견적에만 가산 · 클릭하여 항목 펼치기/접기</span>
        </summary>
        <table class="quoteTable indTable"><thead><tr>
          <th>포함</th><th>항목</th><th>기준</th><th>요율</th><th>금액</th>
        </tr></thead><tbody>
          ${ind.lines.map(l => `<tr class="${l.included ? '' : 'off'}">
            <td class="indck"><input type="checkbox" class="indChk" data-ind="${esc(l.name)}"${l.included ? ' checked' : ''}/></td>
            <td class="name">${esc(l.name)}</td><td>${baseLabel[l.baseKind] || '-'}</td><td>${fmt(l.pct, 3)}%</td>
            <td>${l.included ? fmt(l.amount) : '<span class="vdash">—</span>'}</td></tr>`).join('')}
        </tbody></table>
      </details>
    </div>` : '';
  box.innerHTML = `
    <table id="quoteTable"><thead><tr>
      <th>품목</th><th>수량</th><th>원가단가</th><th>원가금액</th><th>견적단가</th><th>견적금액</th><th>마진</th>
    </tr></thead><tbody>${rows}</tbody>
    <tfoot><tr class="qtot">
      <td>직접비 합계</td><td></td><td></td><td>${fmt(q.directCost)}</td><td></td><td>${fmt(q.directSell)}</td><td></td>
    </tr></tfoot></table>
    ${indirectBlock}
    <table class="quoteTable grandTable"><tbody>
      <tr class="qtot"><td class="costLbl">총 원가</td><td class="amt costAmt">${fmt(q.totalCost)}</td></tr>
      <tr class="qtot"><td class="sellLbl">총 견적 (직접비 + 간접비)</td><td class="amt sellAmt">${fmt(q.totalSell)}</td></tr>
      <tr class="qprofit"><td>마진액 · 마진율</td><td class="amt">${fmt(q.totalSell - q.totalCost)} · ${fmt(totMg, 1)}%</td></tr>
    </tbody></table>
    <div class="quoteNote">
      금액=공급가(VAT 별도). 패널은 예비 포함 수량. 간접비는 원가 기준으로 산출해 견적에만 가산(요율은 가격표에서 조정). ${q.incomplete ? '<b class="warnText">일부 품목은 단가 미설정(—)이라 합계에서 빠졌습니다.</b> ' : ''}
      프레임·지그·케이블 등 기타 자재는 아래 칸에 직접 입력하세요.
    </div>`;
  // 간접비 펼침 상태를 사용자 조작에 맞춰 기억(재렌더 후에도 유지).
  box.querySelector('.indirectDetails')?.addEventListener('toggle', e => { indirectOpen = e.target.open; });
}

// 사이니지 선택 상태를 화면에 동기화한다: (1) 02 선택 버튼(단독형/비디오월) 실제 선택을 색상(on) 표시,
//   (2) 01 ② LED 설치 크기 입력 비활성화(디스플레이 하단 높이는 유지 — 이사 요청 2026-09-14).
function syncSignageMode() {
  const svm = svCode ? SIGNAGE_MODELS.find(x => x.modelCode === svCode) : null;
  $('#svPickStandalone')?.classList.toggle('on', svm?.category === 'standalone_signage');
  $('#svPickVideoWall')?.classList.toggle('on', svm?.category === 'video_wall');
  const on = !!svm;
  $('#ledBox')?.classList.toggle('svDisabled', on);
  $('#ledSizeLabel')?.classList.toggle('svDisabled', on);
  ['ledW', 'ledH'].forEach(id => { const e = $('#' + id); if (e) e.disabled = on; });
  // 사이니지 선택 시 LED 전용 05(비디오 프로세서)·08(데이터 흐름) 카드 비활성화 + 자동 접힘(이사 요청 2026-09-14).
  const vp = $('#vpCard'), df = $('#dfpwCard');
  if (vp) { vp.classList.toggle('svDisabled', on); if (on) vp.open = false; }
  if (df) { df.classList.toggle('svDisabled', on); if (on) df.open = false; }
  // 세로 돌리기 버튼: 사이니지(단독형·비디오월) 선택 시에만 표시. LED에선 숨김·세로 해제.
  const rb = $('#pvRotateBtn');
  if (rb) {
    rb.hidden = !on;
    if (!on) svPortrait = false;
    rb.classList.toggle('on', on && svPortrait);
    rb.textContent = svPortrait ? '⟲ 가로로' : '⟳ 세로로';
  }
}
// LED '배열 직접 지정' 요약 + 확장 안내 — 03 미리보기 위 바(비디오월과 동일 형태·위치, 이사 요청 2026-09-15).
function renderLedFitBar() {
  const bar = $('#ledFitBar'); if (!bar) return;
  const m = (!svCode && mode === 'manual') ? models.find(x => x.id === selectedId) : null;
  if (!m) { bar.hidden = true; bar.innerHTML = ''; return; }
  const r = computeConfig(m, spaceWmm(), spaceHmm(), opts());   // 배치(초과분 제한) 결과
  const lf = ledManualFit();
  bar.hidden = false;
  const head = `<span class="svField">배열 직접 지정</span>`;
  const summary = `<span class="svSummary">`
    + `<span>배열 <b>${r.cols}×${r.rows}</b> = ${r.total}캐비닛</span>`
    + `<span>전체 <b>${fmt(r.actualW)}×${fmt(r.actualH)}</b>mm</span>`
    + `<span>해상도 <b>${r.resW > 0 ? fmt(r.resW) + '×' + fmt(r.resH) : '—'}</b></span>`
    + `<span>무게 <b>${r.weightKg != null ? fmt(r.weightKg, 1) + 'kg' : '—'}</b></span>`
    + `</span>`;
  const expand = (lf && lf.over)
    ? `<span class="notice warn fitExpand">요청 <b>${lf.reqC}×${lf.reqR}</b> 은(는) 공간을 넘어 <b>${lf.cols}×${lf.rows}</b> 로 맞췄습니다. `
      + `<button type="button" class="tiny primary" data-expand="led">공간 넓혀 ${lf.reqC}×${lf.reqR} 로 확장</button></span>`
    : '';
  bar.innerHTML = head + summary + expand;
}
function renderAll() { ensureSelectionVisible(); clampManualArray(); clampBaseHeight(); syncCS4B(); syncSpareRate(); renderFilters(); renderModelList(); renderPreview(); renderReadout(); renderProcessors(); renderCompare(); renderQuote(); renderDataFlow(); renderPower(); syncSignageMode(); syncSignageCard(); renderLedFitBar(); saveLastSession(); }

/* events */
// LED 설치 크기(②)는 벽면을 넘을 수 없다. 하단 높이를 지정하면 세로 = 벽면−하단높이까지만.
//   (그 위로는 캐비닛을 더 쌓을 수 없으므로) 입력값을 그 한계로 제한하고 max 속성도 맞춘다.
// LED 크기 입력칸의 max 속성만 갱신(값은 절대 건드리지 않음).
//   벽면·하단 높이를 편집할 때 이걸 쓴다 → LED 세로가 편집 중 0으로 눌러붙던 버그 방지.
function setLedMax() {
  const maxW = Math.max(0, spaceWmm());
  const maxH = Math.max(0, spaceHmm() - num($('#baseHeight').value));
  const wEl = $('#ledW'), hEl = $('#ledH');
  if (wEl) wEl.max = maxW;
  if (hEl) hEl.max = maxH;
}
// LED 크기를 '직접' 입력할 때만 벽면 한계로 값을 제한한다.
//   maxH가 0(하단 높이 ≥ 벽 세로)일 땐 값을 0으로 만들지 않는다(=0은 '벽면 전체 채움' 뜻이라 혼동 방지).
function clampLedInputs() {
  setLedMax();
  const maxW = Math.max(0, spaceWmm());
  const maxH = Math.max(0, spaceHmm() - num($('#baseHeight').value));
  const wEl = $('#ledW'), hEl = $('#ledH');
  if (wEl && maxW > 0 && num(wEl.value) > maxW) wEl.value = maxW;
  if (hEl && maxH > 0 && num(hEl.value) > maxH) hEl.value = maxH;
}
// 하단 높이는 'LED가 벽면 안에 들어오는 최대치'(= 벽 세로 − LED 세로)까지만 허용한다.
//   그 이상 올리면 입력칸에서 그 최대치로 되돌린다 → 미리보기 LED가 가운데로 튀지 않고 최고 위치를 유지.
function clampBaseHeight() {
  const el = $('#baseHeight'); if (!el) return;
  const sH = spaceHmm();
  let actualH = 0;
  if (svCode) {
    // 사이니지: 하단 높이 상한은 사이니지 패널(총 세로) 기준(이사 확인 2026-09-14: LED 기준으로 잘못 제한되던 버그).
    const f = computeSvFit();
    if (!f || f.ph == null) { el.removeAttribute('max'); return; }
    actualH = f.M * f.ph;
  } else {
    const m = models.find(x => x.id === selectedId); if (!m) return;
    const r = computeConfig(m, spaceWmm(), sH, opts());
    if (!r.fits || !(r.actualH > 0)) { el.removeAttribute('max'); return; }
    actualH = r.actualH;
  }
  const maxBase = Math.max(0, Math.round(sH - actualH));
  el.max = maxBase;
  if (num(el.value) > maxBase) el.value = maxBase;
}
// 배열 직접 지정에서 벽면(설치 공간)을 넘는 캐비닛은 자동으로 잘라낸다(넘치는 열·행 삭제).
//   최대 = 자동 채움(벽면−하단높이, 구조틀 여백 반영)의 열·행. 그 이하로 입력값을 제한하고 max도 맞춘다.
function clampManualArray() {
  if (mode !== 'manual') return;
  // 스테퍼(▲) 상한을 걸지 않는다 — 공간보다 크게 올릴 수 있어야 '공간 넓혀 확장' 안내가 뜬다(이사 요청 2026-09-15).
  //   미리보기·계산은 opts()에서 공간 최대치로 제한하므로 배열 자체는 공간을 넘지 않고, 초과분은 확장 안내로 처리.
  const cEl = $('#manCols'), rEl = $('#manRows');
  if (cEl) cEl.removeAttribute('max');
  if (rEl) rEl.removeAttribute('max');
}
// 벽면·하단 높이 편집: LED 입력칸의 max만 갱신하고 값은 보존(편집 중 LED 세로가 0으로 눌러붙지 않게).
['spaceW', 'spaceH', 'baseHeight'].forEach(id => $('#' + id)?.addEventListener('input', () => { setLedMax(); renderAll(); }));
// 공간 깊이는 3D 뷰에서만 쓰이므로 미리보기만 다시 그린다(스펙·견적 계산에는 영향 없음).
$('#spaceD')?.addEventListener('input', renderPreview);
// LED 크기 직접 입력: 벽면 한계로 값 제한.
['ledW', 'ledH'].forEach(id => $('#' + id)?.addEventListener('input', () => { clampLedInputs(); renderAll(); }));
$('#sboxSpare')?.addEventListener('input', renderAll);
// 05 비디오 프로세서 입력 — 05 결과만 다시 그린다(다른 산출엔 영향 없음).
['vpIn4k', 'vpIn2k', 'vpLayers4k'].forEach(id => $('#' + id)?.addEventListener('input', renderProcessors));
['vpMode', 'vpApp'].forEach(id => $('#' + id)?.addEventListener('change', renderProcessors));
['vpGenlock', 'vpHdr', 'vp10bit', 'vpCtrl'].forEach(id => $('#' + id)?.addEventListener('change', renderProcessors));
// 필요 4K 출력 수: 직접 기입하면 그 값 사용, 비우면 자동값으로 복귀.
$('#vpOut4k')?.addEventListener('input', () => { vpOut4kEdited = $('#vpOut4k').value.trim() !== ''; renderProcessors(); });
// 내 장비 구성 검증: 입력/선택 시 다시 판정.
['vpBuildOut4k', 'vpBuildIn4k', 'vpBuildIn2k'].forEach(id => $('#' + id)?.addEventListener('input', renderProcessors));
$('#vpBuildProc')?.addEventListener('change', renderProcessors);
// 포트 고정형 프로세서 이름 클릭/엔터 → 포트별 입출력 수량 팝업. Esc로 닫기.
document.addEventListener('click', e => { const t = e.target.closest('[data-portproc]'); if (t) openPortPopup(t.dataset.portproc); });
// 프로세서 카드 '이미지' 버튼 → 제품 앞/뒤 이미지 뷰어 팝업.
document.addEventListener('click', e => { const t = e.target.closest('[data-procimg]'); if (t) openProcImgPopup(t.dataset.procimg); });
// ↕ 손잡이: 03 미리보기의 디스플레이를 위아래로 끌어 '디스플레이 하단 높이'를 조정(LED·단독형·비디오월 공통).
(function setupHeightDrag() {
  let dragging = false, startY = 0, startBase = 0, pxPerMm = 1;
  document.addEventListener('pointerdown', e => {
    const h = e.target.closest('[data-hhandle]'); if (!h || !pvHeightDrag) return;
    dragging = true; startY = e.clientY; startBase = num($('#baseHeight')?.value) || 0;
    pxPerMm = pvHeightDrag.pxPerMm || 1;
    e.preventDefault(); try { h.setPointerCapture(e.pointerId); } catch {}
  });
  document.addEventListener('pointermove', e => {
    if (!dragging) return;
    const maxB = (pvHeightDrag?.maxBaseMM) || 0;   // 위로 끌면 하단 높이 증가(화면 y 감소)
    let nb = startBase + (startY - e.clientY) / pxPerMm;
    nb = Math.max(0, Math.min(maxB, Math.round(nb)));
    const el = $('#baseHeight'); if (el) el.value = nb;
    setLedMax(); renderPreview();
  });
  const end = () => { if (dragging) { dragging = false; renderAll(); } };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();
// 공간 넓혀 확장(LED 배열 직접 지정 / 사이니지 비디오월 공용). 확인창 후 01 공간을 필요한 크기로 확정.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-expand]'); if (!b) return;
  if (b.dataset.expand === 'sv') {
    const f = computeSvFit();
    if (f && f.over) expandSpaceTo(f.needW, f.needH);   // 사이니지 비디오월: 기존 규칙(좌우 500·하단 높이 유지)
  } else {
    const f = ledManualFit();   // LED 배열 직접 지정: 좌우·하단 500 / 상단 100 + 하단 높이 500 자동
    if (f && f.over) expandSpaceTo(f.needW, f.needH, {
      baseHeightMm: f.newBase,
      note: `좌우·하단 여백 ${EXPAND_SIDE_MARGIN_MM}mm · 상단 ${LED_EXPAND_TOP_MM}mm · 디스플레이 하단 높이 ${LED_EXPAND_BOTTOM_MM}mm 로 설정`,
    });
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { ['#portPop', '#procImgPop', '#svPickPop', '#expandPop'].forEach(sel => { const el = document.querySelector(sel); if (el && !el.hidden) el.hidden = true; }); }
  else if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('[data-portproc]')) { e.preventDefault(); openPortPopup(e.target.dataset.portproc); }
});
setLedMax();   // 초기 max 속성 설정
const EDGE_MARGIN = 100;   // 설치 공간 가장자리 여유(mm, 각 변) — 사례 등록/불러오기 등에서 사용
// 화면(Screen) 배열 열·행을 직접 입력하면 '배열 직접 지정' 모드로 전환한다(벽면은 선언값 그대로 유지 → 여백 표시).
['manCols', 'manRows'].forEach(id => $('#' + id).addEventListener('input', () => {
  if (mode !== 'manual') {
    mode = 'manual';
    $('#fitMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.mode === 'manual'));
    $('#ledBox').hidden = true;
  }
  renderAll();
}));
// 예비율 칸: 값을 지우면 자동 모드로 복귀(환산 % 다시 표시), 숫자를 넣으면 그 값이 우선.
$('#spareRate').addEventListener('input', () => { spareEdited = $('#spareRate').value !== ''; renderAll(); });
$('#redundancy').addEventListener('change', renderAll);
$('#gbicFB').addEventListener('change', renderAll);
['etcCost', 'etcSell'].forEach(id => $('#' + id)?.addEventListener('input', renderQuote));
$('#highWork')?.addEventListener('change', renderQuote);
$('#quoteBody')?.addEventListener('change', e => {
  const cb = e.target.closest('.indChk'); if (!cb) return;
  if (!indirectDisabled) indirectDisabled = new Set();
  if (cb.checked) indirectDisabled.delete(cb.dataset.ind); else indirectDisabled.add(cb.dataset.ind);
  renderQuote();
});
$('#btnPriceLoad')?.addEventListener('click', () => $('#priceFile')?.click());
$('#priceFile')?.addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; importPriceFile(f); });
$('#btnPriceClear')?.addEventListener('click', clearStoredPrices);
$('#useCS4B').addEventListener('change', () => { userCS4B = $('#useCS4B').checked; renderAll(); });
$('#signalMode').addEventListener('click', e => {
  const b = e.target.closest('button[data-sig]'); if (!b) return;
  signalMode = b.dataset.sig;
  $('#signalMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderPreview(); renderReadout();
});
// 08 데이터 흐름 · 전원 구성 전환 토글(기본 = 데이터). 버튼에 따라 해당 패널만 표시.
$('#dfpwSeg')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-dfpw]'); if (!b) return;
  const showPower = b.dataset.dfpw === 'power';
  $('#dfpwSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  const df = $('#dfDiagram'), pw = $('#pwPanel');
  if (df) df.hidden = showPower;
  if (pw) pw.hidden = !showPower;
});
// 03 미리보기 표시 토글(사람/눈높이선/바닥 그리드/치수). 버튼 표시를 실제 상태와 일치시킨다.
//   눈높이선은 사람에 종속 — 사람이 꺼지면 눈높이선도 꺼진 것으로 표시(비활성)하고 클릭도 막는다.
function syncPvToggles() {
  const set = (tog, on, dim) => {
    const b = document.querySelector(`#pvToggles button[data-tog="${tog}"]`); if (!b) return;
    b.classList.toggle('on', !!on);
    b.classList.toggle('pvTogDim', !!dim);
  };
  set('person', pvShow.person);
  set('grid', pvShow.grid);
  set('dims', pvShow.dims);
  // 비디오월이면 패널(베젤) 격자 필수 → 강제 on + 흐리게(끄기 불가). 그 외엔 pvShow.cellgrid 그대로.
  const vwSel = vwSelected();
  set('cellgrid', vwSel || pvShow.cellgrid, vwSel);
  { const cg = document.querySelector('#pvToggles button[data-tog="cellgrid"]'); if (cg) cg.title = vwSel ? '비디오월은 패널(베젤) 격자를 끌 수 없습니다' : ''; }
  set('handle', pvShow.handle);       // ↕ 이동 손잡이(끄면 캡처 시 안 찍힘)
  set('eye', pvShow.eye && pvShow.person, !pvShow.person);   // 사람 꺼지면 눈높이선 버튼도 꺼짐 표시
  const ib = $('#pvImgBtn');
  if (ib) { ib.classList.toggle('on', !!pvImage); ib.textContent = pvImage ? '이미지 제거' : '이미지 넣기'; }
  // 사람 선택(실사) + 커스텀 사진 버튼 상태 동기화.
  const psx = $('#pvPersonSel'); if (psx) psx.value = pvPerson;
  const pb = $('#pvPersonImgBtn');
  if (pb) {
    const has = !!pvPersonImg[pvPerson];
    pb.classList.toggle('on', has);
    pb.textContent = has ? '사진 되돌리기' : '사진 바꾸기';
    pb.classList.toggle('pvTogDim', !pvShow.person);   // 사람 꺼져 있으면 흐리게(참고용)
  }
}
$('#pvToggles')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-tog]'); if (!b) return;
  const key = b.dataset.tog;
  if (key === 'eye' && !pvShow.person) return;   // 사람 꺼진 상태에선 눈높이선 버튼 동작 안 함
  if (key === 'cellgrid' && vwSelected()) return;   // 비디오월은 패널 격자 끄기 불가
  pvShow[key] = !pvShow[key];
  syncPvToggles();
  renderPreview();
});
// LED 화면 이미지 넣기/제거: 이미지가 있으면 클릭 시 제거, 없으면 방식 선택 팝업 → 파일 선택.
$('#pvImgBtn')?.addEventListener('click', () => {
  if (pvImage) { pvImage = null; syncPvToggles(); renderPreview(); }
  else openImgModePopup();
});
// 세로 돌리기: 사이니지 패널을 90° 회전(세로 설치). 단독형·비디오월 공통. 다시 누르면 가로로.
$('#pvRotateBtn')?.addEventListener('click', () => { svPortrait = !svPortrait; renderAll(); });
// 사람 선택(실사 3종: 남 정장·남 무대·여). 선택 시 사진·키 라벨(남173/여165)이 바뀐다.
$('#pvPersonSel')?.addEventListener('change', e => {
  pvPerson = PEOPLE[e.target.value] ? e.target.value : 'go-youn-jung_01';
  syncPvToggles(); renderPreview();
});
// 커스텀 사진 바꾸기/되돌리기(선택 인물별). 있으면 내장 사진으로 되돌리고, 없으면 파일 선택 → 선택 인물 키에 맞춰 표시.
$('#pvPersonImgBtn')?.addEventListener('click', () => {
  if (pvPersonImg[pvPerson]) { pvPersonImg[pvPerson] = null; syncPvToggles(); renderPreview(); }
  else $('#pvPersonFile')?.click();
});
$('#pvPersonFile')?.addEventListener('change', e => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { pvPersonImg[pvPerson] = rd.result; if (!pvShow.person) pvShow.person = true; syncPvToggles(); renderPreview(); };
  rd.readAsDataURL(f);
});
// 이미지 넣기 방식(가로 고정 / 세로 고정) 선택 팝업. index.html 마크업을 건드리지 않게 동적 생성.
function openImgModePopup() {
  let el = document.querySelector('#imgModePop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'imgModePop';
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-imgclose]')) { el.hidden = true; return; }
      const b = e.target.closest('[data-imgmode]');
      if (b) { pvImgMode = b.dataset.imgmode; el.hidden = true; $('#pvImgFile')?.click(); }
    });
  }
  el.innerHTML = `<div class="imgModeCard" role="dialog" aria-modal="true" aria-label="이미지 넣기 방식 선택">
    <div class="imgModeHead"><div class="imgModeTitle">이미지 넣기 방식</div>
      <button type="button" class="ppClose" data-imgclose aria-label="닫기">✕</button></div>
    <div class="imgModeBody">
      <button type="button" class="imgModeOpt" data-imgmode="width">
        <div class="imgModeIco"><span class="imgModeBox wide"></span></div>
        <div class="imgModeTxt"><b>가로 고정 올리기</b><span>가로를 꽉 채우고 위·아래로 이동</span></div>
      </button>
      <button type="button" class="imgModeOpt" data-imgmode="height">
        <div class="imgModeIco"><span class="imgModeBox tall"></span></div>
        <div class="imgModeTxt"><b>세로 고정 올리기</b><span>세로를 꽉 채우고 좌·우로 이동</span></div>
      </button>
    </div>
  </div>`;
  el.hidden = false;
}
$('#pvImgFile')?.addEventListener('change', e => {
  const f = e.target.files?.[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      pvImgAspect = (im.naturalWidth > 0 && im.naturalHeight > 0) ? im.naturalWidth / im.naturalHeight : null;
      pvImage = rd.result; pvImgPanY = 0.5; pvImgPanX = 0.5; pvShow.cellgrid = false;   // 이미지 넣으면 격자 기본 OFF
      syncPvToggles(); renderPreview();
    };
    im.onerror = () => { pvImgAspect = null; pvImage = rd.result; pvImgPanY = 0.5; pvImgPanX = 0.5; pvShow.cellgrid = false; syncPvToggles(); renderPreview(); };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
  e.target.value = '';   // 같은 파일 다시 선택 가능하게 초기화
});
// 이미지 위치(팬) 드래그 — #stage에 위임(재렌더돼도 유지). LED 로컬↔화면 px는 rect로 환산.
//   가로 고정=세로(상하) 드래그, 세로 고정=가로(좌우) 드래그. 넘침(range>0)=크롭, 모자람(<0)=검정 슬라이드.
(function pvImagePan() {
  const stage = $('#stage'); if (!stage) return;
  let d = null;
  stage.addEventListener('pointerdown', e => {
    const img = e.target.closest?.('.rs3LedImg'); if (!img || !pvImage || !pvLedGeom) return;
    const g = pvLedGeom; if (Math.abs(g.range) < 1) return;   // 넘침/모자람 없으면 이동 불필요
    const led = img.closest('.rs3Led'); const rect = led.getBoundingClientRect();
    const overflow = g.range > 0;
    const horiz = g.mode === 'height';
    // 세로 고정=가로 위치(left) 조정, 가로 고정=세로 위치(top) 조정.
    const minmaxLo = overflow ? -g.range : 0;
    const minmaxHi = overflow ? 0 : (horiz ? (g.lw - g.iw) : (g.lh - g.ih));
    const start = overflow
      ? (-g.range * (horiz ? pvImgPanX : pvImgPanY))
      : ((horiz ? (g.lw - g.iw) : (g.lh - g.ih)) * (horiz ? pvImgPanX : pvImgPanY));
    const scale = horiz ? (g.lw / rect.width) : (g.lh / rect.height);
    d = { horiz, x: e.clientX, y: e.clientY, base: start, scale, min: minmaxLo, max: minmaxHi, img, cur: start };
    try { img.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
  stage.addEventListener('pointermove', e => {
    if (!d) return;
    const delta = (d.horiz ? (e.clientX - d.x) : (e.clientY - d.y)) * d.scale;
    let v = Math.max(d.min, Math.min(d.max, d.base + delta));
    d.cur = v; d.img.style[d.horiz ? 'left' : 'top'] = v.toFixed(1) + 'px';
  });
  const end = () => {
    if (!d || !pvLedGeom) { d = null; return; }
    const g = pvLedGeom, horiz = d.horiz;
    const span = (g.range > 0) ? g.range : (horiz ? (g.lw - g.iw) : (g.lh - g.ih));
    const frac = span ? Math.max(0, Math.min(1, (g.range > 0 ? -d.cur / g.range : d.cur / span))) : 0.5;
    if (horiz) pvImgPanX = frac; else pvImgPanY = frac;
    d = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
})();
syncPvToggles();

// ── 03 미리보기 '크게 보기'(전체화면 팝업) ─────────────────────────────
//   머리줄(토글·신호)+미리보기(#stage)를 팝업으로 옮겨 담아 그대로 크게 보여주고,
//   닫으면 원래 카드로 되돌린다. renderPreview는 #stage 실폭에 맞춰 자동 확대되므로 팝업에선 크게 그려짐.
(function setupPreviewZoom() {
  const toggles = $('#pvToggles');
  const card = document.querySelector('.previewCard');
  if (!toggles || !card) return;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pvTog pvZoomBtn'; btn.dataset.act = 'zoom';
  btn.title = '미리보기 크게 보기(전체화면)'; btn.innerHTML = '⛶ Fullscreen';
  toggles.appendChild(btn);

  let overlay = null;
  const head = () => document.querySelector('.pvHeadRow');
  // 지금 보고 있는 미리보기(정면 뷰 또는 3D 작업영역)를 팝업으로 옮긴다.
  const stageEl = () => document.querySelector(pvView === '3d' ? '#stage3d' : '#stage');
  let moved = null;   // 팝업으로 옮겨 둔 요소 — 닫을 때 그대로 되돌린다
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'pvZoom'; overlay.hidden = true;
    overlay.innerHTML = '<div class="pvZoomInner" role="dialog" aria-modal="true" aria-label="배열 미리보기 크게 보기">'
      + '<div class="pvZoomHead"><span class="pvZoomTitle">배열 미리보기</span>'
      + '<button class="pvZoomClose" type="button" aria-label="닫기">✕</button></div>'
      + '<div class="pvZoomBody"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.pvZoomClose')) closeZoom(); });
  }
  function onKey(e) { if (e.key === 'Escape') closeZoom(); }
  function openZoom() {
    if (overlay && !overlay.hidden) return;
    ensureOverlay();
    const body = overlay.querySelector('.pvZoomBody');
    moved = stageEl();
    body.appendChild(head()); body.appendChild(moved);        // 머리줄+미리보기를 팝업으로 이동
    overlay.hidden = false; document.body.classList.add('pvZoomOpen');
    document.addEventListener('keydown', onKey);
    renderPreview();
    viewer3d?.resize();   // 3D면 캔버스가 커졌으니 다시 맞춘다
  }
  function closeZoom() {
    if (!overlay || overlay.hidden) return;
    card.appendChild(head());
    if (moved) card.appendChild(moved);                       // 옮겨 둔 그대로 되돌림
    moved = null;
    overlay.hidden = true; document.body.classList.remove('pvZoomOpen');
    document.removeEventListener('keydown', onKey);
    renderPreview();
    viewer3d?.resize();
  }
  btn.addEventListener('click', openZoom);
})();

$('#lineFilter').addEventListener('change', e => {
  const cb = e.target.closest('input[data-line]'); if (!cb) return;
  if (cb.checked) visibleLines.add(cb.dataset.line); else visibleLines.delete(cb.dataset.line);
  renderAll();
});
$('#fitMode').addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]'); if (!b) return;
  mode = b.dataset.mode;
  $('#fitMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  // '배열 직접 지정'이면 열·행 표시·LED 크기(②) 숨김, '자동 채움'이면 반대.
  $('#manualBox').hidden = mode !== 'manual';
  $('#ledBox').hidden = mode === 'manual';
  $('#ledSizeLabel').hidden = mode === 'manual';
  renderAll();
});
$('#modelList').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (b) {
    const { id, act } = b.dataset;
    if (act === 'up') return moveModel(id, -1);
    if (act === 'down') return moveModel(id, 1);
    if (act === 'edit') return openEdit(id);
    if (act === 'del') {
      if (models.length <= 1) return alert('최소 1개 모델은 남겨야 합니다.');
      models = models.filter(m => m.id !== id);
      if (selectedId === id) selectedId = models[0].id;
      return renderAll();
    }
    return;
  }
  // click anywhere else on the row -> select and calculate this model
  const row = e.target.closest('.modelRow[data-id]');
  if (row) { selectedId = row.dataset.id; svCode = null; renderAll(); syncSignageCard(); }   // LED 모델 선택 시 03을 LED로 되돌림
});
$('#cmpBody').addEventListener('click', e => {
  const svtr = e.target.closest('tr[data-svpick]');
  if (svtr) { svCode = svtr.dataset.svpick; svPortrait = false; renderAll(); document.querySelector('.previewCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  selectedId = tr.dataset.id; renderAll();
});
$('#btnAddModel').addEventListener('click', () => openEdit(null));
$('#btnResetModels').addEventListener('click', () => {
  if (confirm('모든 모델을 기본값으로 되돌립니다. 계속할까요?')) { models = defaultModels(); selectedId = pickDefaultId(models); visibleLines = new Set(SALES_LINES); renderAll(); }
});

const dlg = $('#dlg');
function openEdit(id) {
  editingId = id;
  const m = id ? models.find(x => x.id === id)
    : { name: '신규 모델', series: '', pitch: 2.5, cabW: 960, cabH: 540, depth: 79.5, resW: '', resH: '', weight: '', maxPower: '', brightnessPeak: 1000, maxInputW: '', maxInputH: '' };
  $('#dlgTitle').textContent = id ? '모델 편집' : '모델 추가';
  const set = (f, v) => $('#' + f).value = (v == null ? '' : v);
  set('e_name', m.name); set('e_series', m.series); set('e_pitch', m.pitch);
  set('e_cabW', m.cabW); set('e_cabH', m.cabH); set('e_depth', m.depth);
  set('e_resW', m.resW); set('e_resH', m.resH); set('e_weight', m.weight);
  set('e_maxP', m.maxPower); set('e_nit', m.brightnessPeak);
  set('e_inW', m.maxInputW); set('e_inH', m.maxInputH);
  dlg.showModal();
}
$('#dlgClose').addEventListener('click', () => dlg.close());
$('#dlgCancel').addEventListener('click', () => dlg.close());
$('#dlgSave').addEventListener('click', () => {
  const pitch = num($('#e_pitch').value), cabW = num($('#e_cabW').value), cabH = num($('#e_cabH').value);
  if (cabW <= 0 || cabH <= 0) return alert('캐비닛 크기는 0보다 커야 합니다.');
  const orEmpty = v => v === '' ? null : num(v);
  let resW = orEmpty($('#e_resW').value), resH = orEmpty($('#e_resH').value);
  if (resW == null && pitch > 0) resW = Math.round(cabW / pitch);
  if (resH == null && pitch > 0) resH = Math.round(cabH / pitch);
  const data = {
    name: $('#e_name').value || '이름없음', series: $('#e_series').value,
    pitch, cabW, cabH, depth: orEmpty($('#e_depth').value),
    resW, resH, weight: orEmpty($('#e_weight').value), maxPower: orEmpty($('#e_maxP').value),
    maxInputW: orEmpty($('#e_inW').value), maxInputH: orEmpty($('#e_inH').value),
    brightnessPeak: orEmpty($('#e_nit').value), dataStatus: 'needs-verification',
  };
  if (editingId) Object.assign(models.find(x => x.id === editingId), data);
  else { const nm = { id: uid(), ...data, _show: true }; models.push(nm); selectedId = nm.id; visibleLines.add(nm.series); }
  dlg.close(); renderAll();
});

/* 라이브러리에서 불러오기 — 판매범위 밖이라 숨겨진 기존 모델을 골라 바로 추가·선택한다. */
const loadDlg = $('#loadDlg');
function renderLoadList() {
  const el = $('#loadList');
  const hidden = models.filter(m => !shown(m)).sort((a, b) => (lineRank(a.series) - lineRank(b.series)) || (a.pitch - b.pitch));
  if (!hidden.length) { el.innerHTML = '<div class="previewEmpty">불러올 숨김 모델이 없습니다. (기본 모델이 모두 표시 중)</div>'; return; }
  el.innerHTML = hidden.map(m => `
    <div class="loadRow" data-load="${m.id}" title="눌러서 추가">
      <div class="minfo">
        <div class="mname">${esc(m.name)} ${statusBadge(m)}</div>
        <div class="mmeta">${esc(lineLabel(m.series))} · ${fmt(m.cabW, 1)}×${fmt(m.cabH, 1)}mm · P${fmtPitch(m.pitch)}</div>
      </div>
      <button class="tiny primary" data-load="${m.id}">추가</button>
    </div>`).join('');
}
function loadModel(id) {
  const m = models.find(x => x.id === id); if (!m) return;
  m._show = true;                 // 숨김 해제 → 목록/비교표에 노출
  visibleLines.add(m.series);     // 해당 라인 필터도 켠다
  selectedId = id;                // 바로 선택·적용
  loadDlg.close(); renderAll();
}
$('#btnLoadModel').addEventListener('click', () => { renderLoadList(); loadDlg.showModal(); });
$('#loadClose').addEventListener('click', () => loadDlg.close());
$('#loadCancel').addEventListener('click', () => loadDlg.close());
$('#loadList').addEventListener('click', e => {
  const el = e.target.closest('[data-load]'); if (!el) return;
  loadModel(el.dataset.load);
});

/* ─── 구성(설정) 저장/불러오기 — 이 브라우저에 이름 붙여 저장(localStorage) ───
   화면의 모든 입력·선택(공간·배열·옵션·선택 모델 등)을 한 건으로 저장했다가 그대로 복원한다.
   가격표(prices.local.js)와 가격은 여기에 포함하지 않는다(별도 저장). 규격은 config.js. */
const CONFIG_KEY = 'svtled_configs_v1';
// 새로고침/재접속 시 직전 상태 자동 복원 — 값이 바뀔 때마다 이 브라우저에 조용히 저장(이름 저장과 별개).
const LAST_KEY = 'svtled_last_v1';
function saveLastSession() { try { localStorage.setItem(LAST_KEY, JSON.stringify(gatherConfig())); } catch { } }
function restoreLastSession() { try { const s = localStorage.getItem(LAST_KEY); if (s) { applyConfig(JSON.parse(s)); return true; } } catch { } return false; }
function readConfigs() { try { return normalizeRecords(JSON.parse(localStorage.getItem(CONFIG_KEY) || '[]')); } catch { return []; } }
function writeConfigs(list) { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(list)); } catch (e) { alert('구성을 저장하지 못했습니다(브라우저 저장공간 문제).\n' + e.message); } }

// 현재 화면의 모든 입력·선택을 하나의 구성 객체로 모은다.
function gatherConfig() {
  const m = models.find(x => x.id === selectedId) || null;
  return {
    spaceW: spaceWmm(), spaceH: spaceHmm(), spaceD: spaceDmm(),
    roomType: roomTypeId, roomOpts: { ...roomOpts },
    wallThk: num($('#wallThk')?.value) || CONFIG_DEFAULTS.wallThk,
    customViews: customViews.map(v => ({ ...v })),
    baseHeight: num($('#baseHeight').value), ledW: num($('#ledW').value), ledH: num($('#ledH').value),
    mode, manCols: num($('#manCols').value), manRows: num($('#manRows').value),
    redundancy: $('#redundancy').checked, cs4b: userCS4B, gbicFB: $('#gbicFB').checked,
    highWork: $('#highWork')?.checked ?? false,
    spareRate: $('#spareRate').value, spareEdited,
    sboxSpare: num($('#sboxSpare').value),
    signalMode, selectedId,
    selectedModel: m ? structuredClone(m) : null,
    etcCost: num($('#etcCost')?.value), etcSell: num($('#etcSell')?.value),
    visibleLines: [...visibleLines],
    indirectDisabled: indirectDisabled ? [...indirectDisabled] : null,
  };
}

// 저장된 구성 하나를 화면에 복원한다.
function applyConfig(raw) {
  const c = normalizeConfig(raw);
  // 직접 추가한 커스텀 모델 복원: 현재 목록에 없고 스냅샷이 있으면 목록에 되살린다.
  if (c.selectedId && !models.some(m => m.id === c.selectedId) && c.selectedModel) {
    models.push({ ...c.selectedModel, _show: true });
  }
  $('#spaceW').value = c.spaceW / 1000; $('#spaceH').value = c.spaceH / 1000;   // 저장은 mm, 화면 입력은 m
  if ($('#spaceD')) $('#spaceD').value = c.spaceD > 0 ? c.spaceD / 1000 : '';    // 0 = 비움(자동)
  roomTypeId = roomType(c.roomType).id;
  roomOpts = normalizeOptions(roomTypeId, c.roomOpts);
  if ($('#wallThk')) $('#wallThk').value = c.wallThk;
  customViews = Array.isArray(c.customViews) ? c.customViews.map(v => ({ ...v })) : [];
  renderPresetBar();
  renderRoomOptions();
  $('#baseHeight').value = c.baseHeight; $('#ledW').value = c.ledW; $('#ledH').value = c.ledH;
  $('#manCols').value = c.manCols; $('#manRows').value = c.manRows;
  $('#sboxSpare').value = c.sboxSpare;
  $('#spareRate').value = c.spareRate;
  if ($('#etcCost')) $('#etcCost').value = c.etcCost;
  if ($('#etcSell')) $('#etcSell').value = c.etcSell;
  $('#redundancy').checked = c.redundancy;
  $('#gbicFB').checked = c.gbicFB;
  if ($('#highWork')) $('#highWork').checked = c.highWork;
  $('#useCS4B').checked = c.cs4b;
  userCS4B = c.cs4b;
  spareEdited = c.spareEdited;
  mode = (c.mode === 'fill') ? 'ledsize' : c.mode;   // 옛 '자동 채움(벽면)'은 '자동 채움(LED 크기, 비우면 벽면)'으로
  signalMode = c.signalMode;
  if (Array.isArray(c.visibleLines)) visibleLines = new Set(c.visibleLines);
  if (Array.isArray(c.indirectDisabled)) indirectDisabled = new Set(c.indirectDisabled);
  if (c.selectedId && models.some(m => m.id === c.selectedId)) selectedId = c.selectedId;
  spareModelId = selectedId; // 모델 전환 자동복귀가 복원된 예비율을 지우지 않도록 맞춰둔다.
  $('#fitMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('#manualBox').hidden = mode !== 'manual';
  $('#ledBox').hidden = mode === 'manual';
  $('#ledSizeLabel').hidden = mode === 'manual';
  $('#signalMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.sig === signalMode));
  setLedMax();   // 불러온 값 기준으로 LED 입력칸 max 갱신(값은 보존)
  renderAll();
}

// 목록 표시용 짧은 요약: 모델 · 공간 · 배열.
function configSummary(d) {
  const c = normalizeConfig(d);
  const model = c.selectedModel?.name || c.selectedId || '—';
  const arr = c.mode === 'manual' ? `${c.manCols}×${c.manRows}` : '자동';
  return `${esc(model)} · ${c.spaceW / 1000}×${c.spaceH / 1000}m · ${arr}`;
}

// 현재 화면에 불러와 있는 구성 이름(있으면 '덮어쓰기 저장'의 대상). 새로 만들면 null.
let currentConfigName = null;
// 현재 구성 이름을 지정하고 상단 배지에 표시(없으면 숨김).
function setCurrentConfig(name) {
  currentConfigName = name || null;
  const el = $('#currentCfgTag');
  if (el) { el.hidden = !currentConfigName; el.textContent = currentConfigName ? `📄 현재 구성: ${currentConfigName}` : ''; }
}

// 이름으로 저장(같은 이름 있으면 덮어씀). 저장 후 그 이름을 '현재 구성'으로 기억한다.
function persistConfig(name) {
  const list = readConfigs();
  const idx = list.findIndex(r => r.name === name);
  const rec = makeRecord(name, gatherConfig());
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  writeConfigs(normalizeRecords(list));
  setCurrentConfig(name);
  renderConfigList();
}

function saveCurrentConfig() {
  const m = models.find(x => x.id === selectedId);
  // 기본 이름 제안: 모델명_열X행 (예: IF015R_4X4). 배열 수량은 현재 설정으로 산출.
  let suggested = m?.name || '구성';
  if (m) {
    const r = computeConfig(m, spaceWmm(), spaceHmm(), opts());
    if (r && r.cols > 0 && r.rows > 0) suggested = `${m.name}_${r.cols}X${r.rows}`;
  }
  // 불러온 구성(로컬·공유함·링크)이 있으면: 덮어쓰기 저장 / 다른 이름으로 저장 선택.
  //   공유함에서 불러온 구성은 로컬 목록에 없어도 이 선택을 제공한다(덮어쓰기 = 내 목록에 같은 이름으로 저장).
  if (currentConfigName) {
    const overwrite = confirm(`수정한 내용을 저장합니다.\n\n[확인] '${currentConfigName}'에 그대로 덮어쓰기\n[취소] 다른 이름으로 저장`);
    if (overwrite) { persistConfig(currentConfigName); alert(`'${currentConfigName}' 구성에 저장했습니다.`); return; }
    suggested = `${currentConfigName} (수정본)`;   // 취소 → 새 이름 저장(기본 제안)
  }
  const name = (prompt('구성 이름을 입력하세요.', suggested) || '').trim();
  if (!name) return;
  if (name !== currentConfigName && readConfigs().some(r => r.name === name)
      && !confirm(`이미 '${name}' 이름의 구성이 있습니다. 덮어쓸까요?`)) return;
  persistConfig(name);
  alert(`'${name}' 구성을 저장했습니다.`);
}

const cfgDlg = $('#cfgDlg');
function renderConfigList() {
  const el = $('#cfgList'); if (!el) return;
  const list = readConfigs();
  if (!list.length) { el.innerHTML = '<div class="previewEmpty">저장된 구성이 없습니다. 먼저 <b>‘구성 저장’</b>으로 현재 설정을 저장하세요.</div>'; return; }
  el.innerHTML = list.map(r => {
    const when = new Date(r.savedAt).toLocaleString('ko-KR');
    return `<div class="cfgRow" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0">
      <div style="min-width:0">
        <div class="mname">${esc(r.name)}</div>
        <div class="hint">${configSummary(r.data)} · ${esc(when)}</div>
      </div>
      <div style="display:flex;gap:6px;flex:0 0 auto">
        <button class="tiny primary" data-cfg-load="${esc(r.name)}">불러오기</button>
        <button class="tiny ghost" data-cfg-share="${esc(r.name)}" title="공유 링크를 만들어 복사(상대는 링크를 열어 바로 불러옴)">공유</button>
        <button class="tiny ghost" data-cfg-del="${esc(r.name)}">삭제</button>
      </div>
    </div>`;
  }).join('');
}

// ─── 구성 링크로 공유 ───
//   '공유'를 누르면 그 구성을 담은 링크를 만들어 복사한다. 상대가 링크를 열면(이 사이트로 접속)
//   그 구성이 자동으로 불러와지고 내 목록에도 저장된다. 데이터는 URL의 # 뒤(해시)에 담아
//   서버로 전송되지 않는다. 가격 정보는 구성에 포함되지 않으므로 링크에도 없다.
// 유니코드(한글) 안전 base64url 인코딩/디코딩.
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
// 구성 레코드들로 공유 링크(현재 사이트 주소 + #share=...)를 만든다.
function buildShareLink(records) {
  const payload = JSON.stringify(exportBundle(records));
  return location.origin + location.pathname + '#share=' + b64urlEncode(payload);
}
// 구성 하나를 공유: 링크 생성 → 클립보드 복사(막히면 직접 복사 안내).
async function shareConfig(name) {
  const rec = readConfigs().find(r => r.name === name);
  if (!rec) return;
  const link = buildShareLink([rec]);
  try {
    await navigator.clipboard.writeText(link);
    alert('공유 링크가 복사되었습니다.\n카톡·메일에 붙여넣어 보내면, 상대가 링크를 열어 이 구성을 바로 불러올 수 있습니다.');
  } catch {
    prompt('아래 링크를 복사(Ctrl+C)해 전달하세요:', link);
  }
}
// 페이지 진입 시 #share= 링크를 처리: 공유 구성을 내 목록에 합치고 바로 불러온다.
function handleSharedLink() {
  const m = /[#&]share=([^&]+)/.exec(location.hash || '');
  if (!m) return;
  // 링크는 한 번만 처리하고 주소에서 지운다(새로고침 시 반복 방지).
  history.replaceState(null, '', location.origin + location.pathname + location.search);
  let records = [];
  try { records = parseImport(JSON.parse(b64urlDecode(m[1]))); } catch { records = []; }
  if (!records.length) { alert('공유 링크를 읽지 못했습니다. 링크가 중간에 잘렸을 수 있어요. 다시 받아 열어보세요.'); return; }
  const { list, added } = mergeRecords(readConfigs(), records);
  writeConfigs(list);
  applyConfig(records[0].data);       // 받은 구성을 바로 화면에 적용
  setCurrentConfig(records[0].name);
  const extra = added > 1 ? ` (외 ${added - 1}개도 내 목록에 추가됨)` : '';
  alert(`공유된 구성 '${records[0].name}'을(를) 불러왔습니다.${extra}\n내 목록에도 저장되어 다음에 또 열 수 있습니다.`);
}
// 구성 초기화: 확인 팝업 후 화면 입력을 기본값으로 되돌린다(저장된 구성 목록·가격표는 그대로).
function resetConfig() {
  if (!confirm('구성을 초기화할까요?\n현재 화면의 입력값(공간·배열·옵션)이 기본값으로 되돌아갑니다.\n저장된 구성 목록은 지워지지 않습니다.')) return;
  svCode = null;            // 사이니지 모드 해제(선택 시 초기화가 안 먹던 문제 수정, 2026-09-14)
  const sc = $('#svCols'), sr = $('#svRows'); if (sc) sc.value = 1; if (sr) sr.value = 1;
  selectedId = pickDefaultId(models);
  applyConfig({});          // 모든 입력을 normalizeConfig 기본값(8×3.4m 등)으로
  setCurrentConfig(null);   // 상단 '현재 구성' 배지 해제
  syncSignageCard();        // 사이니지 컨트롤바 숨김 반영
}
$('#btnConfigReset')?.addEventListener('click', resetConfig);
$('#btnConfigSave')?.addEventListener('click', saveCurrentConfig);
$('#btnConfigLoad')?.addEventListener('click', () => { renderConfigList(); cfgDlg?.showModal(); });
$('#cfgClose')?.addEventListener('click', () => cfgDlg.close());
$('#cfgCancel')?.addEventListener('click', () => cfgDlg.close());
$('#cfgList')?.addEventListener('click', e => {
  const loadBtn = e.target.closest('[data-cfg-load]');
  const shareBtn = e.target.closest('[data-cfg-share]');
  const delBtn = e.target.closest('[data-cfg-del]');
  if (loadBtn) {
    const rec = readConfigs().find(r => r.name === loadBtn.dataset.cfgLoad);
    if (rec) { applyConfig(rec.data); setCurrentConfig(rec.name); cfgDlg.close(); }
    return;
  }
  if (shareBtn) { shareConfig(shareBtn.dataset.cfgShare); return; }
  if (delBtn) {
    const name = delBtn.dataset.cfgDel;
    if (!confirm(`'${name}' 구성을 삭제할까요?`)) return;
    writeConfigs(readConfigs().filter(r => r.name !== name));
    renderConfigList();
  }
});

/* ─── 회사 공유함 (Supabase) — 공유함 비밀번호로 잠금(설치 사례와 동일 방식) ───
   비밀번호는 서버(RLS)에만 있고 앱엔 없다. 사용자가 입력한 값만 x-team-code 헤더로 전달.
   틀리면 못 들어오고, 조회 성공(1건 이상)했을 때만 비번을 저장(검증)한다. */
const SHARE_KEY = 'svtled_share_code';
const NAME_KEY = 'svtled_display_name';
let sharedRowsCache = [];
let shareCode = '';    // 공유함 비밀번호(세션). 검증되면 localStorage에도 저장.

// 공유함 비번을 확보(대소문자 구분). 저장은 renderSharedList가 조회 성공 시에만 한다.
function ensureShareCode(forceNew) {
  if (!forceNew && !shareCode) shareCode = localStorage.getItem(SHARE_KEY) || '';
  if (forceNew || !shareCode) shareCode = (prompt('설계 프로젝트 비밀번호를 입력하세요 (대소문자 구분):', '') || '').trim();
  return shareCode;
}

function getDisplayName() {
  let n = localStorage.getItem(NAME_KEY) || '';
  if (!n) {
    n = (prompt('설계 프로젝트에 표시할 이름(올린 사람)을 입력하세요:', '') || '').trim();
    if (n) localStorage.setItem(NAME_KEY, n);
  }
  return n;
}

const sharedDlg = $('#sharedDlg');
async function openSharedLib() {
  if (!ensureShareCode()) return;
  sharedDlg?.showModal();
  await renderSharedList();
}
async function renderSharedList() {
  const el = $('#sharedList'); if (!el) return;
  el.innerHTML = '<div class="previewEmpty">불러오는 중…</div>';
  try {
    const rows = await listShared(shareCode);
    if (!rows.length) {
      // 비었거나 비번 틀림 → 저장하지 않고 다시 입력 유도(맞는 비번이면 첫 구성 올리기 가능).
      localStorage.removeItem(SHARE_KEY);
      sharedRowsCache = [];
      el.innerHTML = '<div class="previewEmpty">🔒 <b>비밀번호가 다르거나</b> 설계 프로젝트가 비어 있습니다.<br>'
        + '맞는 비번이면 아래 <b>현재 구성 올리기</b>로 첫 구성을 올리세요.<br>'
        + '<button class="tiny primary" id="btnShareRetryPass" style="margin-top:8px">비밀번호 다시 입력</button></div>';
      $('#btnShareRetryPass')?.addEventListener('click', () => { if (ensureShareCode(true)) renderSharedList(); });
      return;
    }
    localStorage.setItem(SHARE_KEY, shareCode);   // 조회 성공 → 검증된 비번 저장
    sharedRowsCache = rows;
    el.innerHTML = rows.map(r => {
      const when = r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : '';
      const who = r.updated_by ? esc(r.updated_by) + ' · ' : '';
      const sub = r.summary || configSummary(r.data);
      return `<div class="cfgRow" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0">
        <div style="min-width:0">
          <div class="mname">${esc(r.name)}</div>
          <div class="hint">${esc(sub)} · ${who}${esc(when)}</div>
        </div>
        <div style="display:flex;gap:6px;flex:0 0 auto">
          <button class="tiny primary" data-sh-load="${esc(String(r.id))}">불러오기</button>
          <button class="tiny ghost" data-sh-del="${esc(String(r.id))}">삭제</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="previewEmpty">설계 프로젝트를 불러오지 못했습니다.<br>(${esc(e.message)})<br>인터넷 연결을 확인하세요.</div>`;
  }
}
async function uploadCurrentToShared() {
  const m = models.find(x => x.id === selectedId);
  let suggested = currentConfigName || m?.name || '구성';
  if (!currentConfigName && m) {
    const r = computeConfig(m, spaceWmm(), spaceHmm(), opts());
    if (r && r.cols > 0 && r.rows > 0) suggested = `${m.name}_${r.cols}X${r.rows}`;
  }
  const name = (prompt('설계 프로젝트에 올릴 이름:', suggested) || '').trim();
  if (!name) return;
  const cfg = gatherConfig();
  try {
    await uploadShared(shareCode, { name, summary: configSummary(cfg), data: cfg, updated_by: getDisplayName() });
    await renderSharedList();
    alert(`'${name}' 구성을 설계 프로젝트에 올렸습니다. 전 직원이 볼 수 있습니다.`);
  } catch (e) {
    alert('설계 프로젝트에 올리지 못했습니다.\n' + e.message);
  }
}
$('#btnSharedLib')?.addEventListener('click', openSharedLib);
$('#sharedClose')?.addEventListener('click', () => sharedDlg.close());
$('#sharedCancel')?.addEventListener('click', () => sharedDlg.close());
$('#btnSharedUpload')?.addEventListener('click', uploadCurrentToShared);
$('#btnSharedRefresh')?.addEventListener('click', renderSharedList);
$('#btnSharedPass')?.addEventListener('click', () => { if (ensureShareCode(true)) renderSharedList(); });
$('#sharedList')?.addEventListener('click', async e => {
  const loadBtn = e.target.closest('[data-sh-load]');
  const delBtn = e.target.closest('[data-sh-del]');
  if (loadBtn) {
    const rec = sharedRowsCache.find(r => String(r.id) === loadBtn.dataset.shLoad);
    if (rec) { applyConfig(rec.data); setCurrentConfig(rec.name); sharedDlg.close(); }
    return;
  }
  if (delBtn) {
    const rec = sharedRowsCache.find(r => String(r.id) === delBtn.dataset.shDel);
    if (!rec || !confirm(`설계 프로젝트에서 '${rec.name}'을(를) 삭제할까요? (모든 직원에게서 사라집니다)`)) return;
    try { await deleteShared(shareCode, rec.id); await renderSharedList(); }
    catch (err) { alert('삭제하지 못했습니다.\n' + err.message); }
  }
});

/* ─── 설치 사례집 (install_cases) — 보기 비번으로 열람, 등록/삭제는 관리자 비번 ───
   과거 실제 설치 건을 모아두고, 지금 고른 모델·배열과 맞는 사례를 먼저 보여준다. */
const CASE_VIEW_KEY = 'svtled_case_view';
const CASE_ADMIN_KEY = 'svtled_case_admin';
let caseRowsCache = [];
let caseSearch = '';     // 설치 사례 검색어(건명·장소·모델·메모).
let caseYear = 'all';    // 연도 필터('all' | 'YYYY' | '미지정').
let caseViewCode = '';   // 현재 세션 보기 비번. 검증(사례 조회 성공) 시에만 localStorage에 저장한다.

// 보기 비번을 확보한다(대소문자 구분). 저장된 값을 쓰거나, 없으면/forceNew면 입력받는다.
// 저장은 여기서 하지 않고, renderCaseList가 조회에 성공(사례 1건 이상)했을 때만 저장한다.
function ensureCaseViewCode(forceNew) {
  if (!forceNew && !caseViewCode) caseViewCode = localStorage.getItem(CASE_VIEW_KEY) || '';
  if (forceNew || !caseViewCode) caseViewCode = (prompt('설치 사례 보기 비밀번호를 입력하세요 (대소문자 구분):', '') || '').trim();
  return caseViewCode;
}
function getCaseAdminCode(forceNew) {
  let c = forceNew ? '' : (localStorage.getItem(CASE_ADMIN_KEY) || '');
  if (!c) { c = (prompt('설치 사례 등록(관리자) 비밀번호를 입력하세요:', '') || '').trim(); if (c) localStorage.setItem(CASE_ADMIN_KEY, c); }
  return c;
}

// 현재 화면의 선택 모델·배열(열/행)을 구한다(사례 매칭·등록용).
function currentModelArray() {
  const m = models.find(x => x.id === selectedId);
  if (!m) return { m: null, cols: 0, rows: 0 };
  const r = computeConfig(m, spaceWmm(), spaceHmm(), opts());
  return { m, cols: r.cols || 0, rows: r.rows || 0 };
}
// 사례의 해상도 표기(모델+배열로 자동 계산). 모델을 못 찾으면 빈 문자열.
function caseResolution(c) {
  const m = findModelByName(c.model_name);
  if (!m || !c.cols || !c.rows || m.resW == null || m.resH == null) return '';
  return ` · ${fmt(m.resW * c.cols)}×${fmt(m.resH * c.rows)}px`;
}
// 사례 → 화면 적용용 구성. 모델 스냅샷이 담긴 data가 있으면 그대로, 없으면 모델명으로 찾아 합성.
// 불러올 때 기본 하단 높이(바닥에서 LED 아래까지, mm). 벽 세로는 이 높이 위에 배열이 다 들어가게 잡는다.
const CASE_BASE_HEIGHT = 1000;
function caseToConfig(c) {
  // 스냅샷(data)이 있으면 그 값을 기준으로, 없으면 열·행에서 구성한다.
  const stored = (c.data && typeof c.data === 'object' && c.data.selectedId) ? { ...c.data } : null;
  const m = (stored ? models.find(x => x.id === stored.selectedId) : null) || findModelByName(c.model_name);
  const cols = (stored ? stored.manCols : c.cols) || 0;
  const rows = (stored ? stored.manRows : c.rows) || 0;
  const cfg = stored || {};
  cfg.mode = 'manual'; cfg.manCols = cols; cfg.manRows = rows;
  // 하단 높이 1000mm 기준으로 벽을 넉넉히 잡아 배열이 잘리지 않게 한다.
  //   가로 = 열×캐비닛 + 구조틀 여백(양쪽) + 가장자리 여유. 세로 = 하단높이 + 행×캐비닛 + 구조틀 + 여유.
  //   기존에 저장된 벽이 더 크면 그대로 둔다(max).
  const clr = m ? frameClearanceMm(m.series) : 30;
  cfg.baseHeight = CASE_BASE_HEIGHT;
  // 가로 캐비닛이 6을 넘는 넓은 배열은 벽을 좌우 1.5m씩 넉넉히 잡아 불러온다(그 외엔 기본 가장자리 여유).
  const sideMar = cols > 6 ? 1500 : EDGE_MARGIN;
  if (m && cols) cfg.spaceW = Math.max(num(cfg.spaceW), Math.round(cols * m.cabW + 2 * clr + 2 * sideMar));
  if (m && rows) cfg.spaceH = Math.max(num(cfg.spaceH), Math.round(CASE_BASE_HEIGHT + rows * m.cabH + 2 * clr + 2 * EDGE_MARGIN));
  if (m) { cfg.selectedId = m.id; cfg.selectedModel = { ...m }; }
  return cfg;
}

const casesDlg = $('#casesDlg');
async function openCases() {
  if (!ensureCaseViewCode()) return;
  casesDlg?.showModal();
  await renderCaseList();
}
async function renderCaseList() {
  const el = $('#caseList'); if (!el) return;
  el.innerHTML = '<div class="previewEmpty">불러오는 중…</div>';
  try {
    const rows = await listCases(caseViewCode);
    if (!rows.length) {
      // 비었거나 비번 틀림 → 저장하지 않고(틀린 비번을 기억하지 않도록) 다시 입력 유도.
      localStorage.removeItem(CASE_VIEW_KEY);
      caseRowsCache = [];
      el.innerHTML = '<div class="previewEmpty">🔒 <b>비밀번호가 다르거나</b> 아직 등록된 사례가 없습니다.<br>'
        + '<button class="tiny primary" id="btnCaseRetryPass" style="margin-top:8px">비밀번호 다시 입력</button></div>';
      $('#btnCaseRetryPass')?.addEventListener('click', () => { if (ensureCaseViewCode(true)) renderCaseList(); });
      const yf = $('#caseYearFilter'); if (yf) yf.innerHTML = '';
      return;
    }
    localStorage.setItem(CASE_VIEW_KEY, caseViewCode);   // 조회 성공 → 검증된 비번으로 저장
    // 같은 모델끼리 모이도록 '모델명' 기준으로 정렬(같은 모델 안에서는 배열 작은 순 → 최신순).
    // 표기가 달라도(MMF015·MM015F 등) 같은 모델로 묶이게 실제 모델명으로 정렬한다.
    const modelKey = c => (findModelByName(c.model_name)?.name || c.model_name || 'zzz');
    rows.sort((a, b) =>
      modelKey(a).localeCompare(modelKey(b), 'ko') ||
      (a.cols || 0) - (b.cols || 0) || (a.rows || 0) - (b.rows || 0) ||
      String(b.created_at).localeCompare(String(a.created_at)));
    caseRowsCache = rows;
    renderCaseYearChips();
    renderCaseRows();
  } catch (e) {
    el.innerHTML = `<div class="previewEmpty">설치 사례를 불러오지 못했습니다.<br>(${esc(e.message)})<br>인터넷 연결·보기 비밀번호를 확인하세요.</div>`;
  }
}
// 설치일에서 연도(YYYY) 추출. 날짜가 없으면 '미지정'.
function caseYearOf(c) { const m = /^(\d{4})/.exec(String(c.install_date || '')); return m ? m[1] : '미지정'; }
// 검색어 일치(건명·장소·모델명·메모·배열). 빈 검색어는 항상 통과.
function caseMatchesSearch(c, q) {
  if (!q) return true;
  const model = findModelByName(c.model_name)?.name || c.model_name || '';
  return [c.name, c.site, c.memo, model, `${c.cols}×${c.rows}`]
    .some(x => String(x || '').toLowerCase().includes(q));
}
// 연도 필터 칩(전체 + 데이터에 있는 연도, 최신순 + 미지정).
function renderCaseYearChips() {
  const el = $('#caseYearFilter'); if (!el) return;
  const years = [...new Set(caseRowsCache.map(caseYearOf))];
  const known = years.filter(y => y !== '미지정').sort((a, b) => b.localeCompare(a));
  const ordered = [...known, ...(years.includes('미지정') ? ['미지정'] : [])];
  if (caseYear !== 'all' && !ordered.includes(caseYear)) caseYear = 'all';   // 사라진 연도면 전체로
  const chip = (val, label) => `<button class="tiny ${caseYear === val ? 'primary' : 'ghost'}" data-case-year="${esc(val)}">${esc(label)}</button>`;
  el.innerHTML = chip('all', '전체') + ordered.map(y => chip(y, y === '미지정' ? '미지정' : y + '년')).join('');
}
// 캐시된 사례를 검색·연도로 걸러 목록을 그린다(서버 재조회 없음).
function renderCaseRows() {
  const el = $('#caseList'); if (!el) return;
  const q = caseSearch.trim().toLowerCase();
  const cur = currentModelArray();
  const sameModel = c => cur.m && findModelByName(c.model_name)?.id === cur.m.id;
  const list = caseRowsCache.filter(c =>
    (caseYear === 'all' || caseYearOf(c) === caseYear) && caseMatchesSearch(c, q));
  if (!list.length) { el.innerHTML = '<div class="previewEmpty">조건에 맞는 사례가 없습니다.</div>'; return; }
  el.innerHTML = list.map(c => {
    const match = (sameModel(c) && c.cols === cur.cols && c.rows === cur.rows)
      ? ' <span class="chk">지금 배열과 일치</span>' : '';
    // 표기 순서: 모델명 · 캐비넷(열×행) · 건명(설치장소). 건명이 없으면 사례명으로 대체.
    const modelDisp = esc((findModelByName(c.model_name)?.name) || c.model_name || '—');
    const arr = `${c.cols || '?'}×${c.rows || '?'}`;
    const proj = esc(c.site || c.name || '');
    const title = `${modelDisp} ${arr}${proj ? ` · ${proj}` : ''}`;
    const resTxt = caseResolution(c).replace(/^ · /, '');
    const meta = [c.install_date, resTxt, c.memo].filter(Boolean).map(esc).join(' · ') || '&nbsp;';
    return `<div class="cfgRow" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0">
      <div style="min-width:0"><div class="mname">${title}${match}</div><div class="hint">${meta}</div></div>
      <div style="display:flex;gap:6px;flex:0 0 auto">
        <button class="tiny primary" data-case-load="${esc(String(c.id))}">불러오기</button>
        <button class="tiny" data-case-edit="${esc(String(c.id))}">수정</button>
        <button class="tiny ghost" data-case-del="${esc(String(c.id))}">삭제</button>
      </div>
    </div>`;
  }).join('');
}
// ── 중복 사례 판정 ──────────────────────────────────────────────
// 중복 기준: 설치장소 · 모델 · 배열(열×행)이 모두 같으면 중복으로 본다(오너 결정).
// 표기가 달라도(MMF015·MM015F) 같은 모델로 묶이게 실제 모델 id로 비교. 대소문자·앞뒤공백 무시.
const caseModelId = c => String(findModelByName(c.model_name)?.id || c.model_name || '').trim().toLowerCase();
const caseSiteKey = c => String(c.site || '').trim().toLowerCase();
function isDupCase(c, existing) {
  const site = caseSiteKey(c), model = caseModelId(c), arr = `${c.cols || ''}x${c.rows || ''}`;
  return (existing || []).some(e =>
    caseSiteKey(e) === site && caseModelId(e) === model && `${e.cols || ''}x${e.rows || ''}` === arr);
}
// 서버의 최신 목록을 가져와 중복 검사에 쓴다(실패하면 화면 캐시로 대체).
async function existingCasesForDupCheck() {
  try { return await listCases(caseViewCode); } catch { return caseRowsCache; }
}

// 현재 구성을 단건 사례로 등록.
async function registerCurrentCase() {
  const admin = getCaseAdminCode(); if (!admin) return;
  const { m, cols, rows } = currentModelArray();
  if (!m) { alert('모델을 먼저 선택하세요.'); return; }
  const name = (prompt('사례명:', `${m.name} ${cols}×${rows}`) || '').trim(); if (!name) return;
  const site = (prompt('설치장소/고객 (선택):', '') || '').trim();
  const install_date = normalizeDate(prompt('설치일 YYYY-MM-DD (선택):', '') || '');
  const memo = (prompt('메모 (선택):', '') || '').trim();
  const rec = {
    name, site: site || null, install_date, memo: memo || null,
    model_name: m.name, cols, rows,
    space_w: spaceWmm() || null, space_h: spaceHmm() || null,
    data: gatherConfig(), created_by: localStorage.getItem(NAME_KEY) || null,
  };
  // 중복 검사 — 같은 사례가 이미 있으면 등록하지 않고 팝업으로 알린다.
  if (isDupCase(rec, await existingCasesForDupCheck())) {
    alert(`이미 같은 설치 사례가 있습니다.\n(설치장소·모델·배열이 모두 동일)\n\n중복이라 등록하지 않았습니다.`);
    return;
  }
  try { await addCases(admin, [rec]); await renderCaseList(); alert(`'${name}' 사례를 등록했습니다.`); }
  catch (e) { alert('사례 등록에 실패했습니다.\n' + e.message); }
}
// 기존 사례 수정. 사례명·장소·날짜·메모를 고치고, 원하면 모델·배열도 현재 화면 구성으로 교체.
async function editCase(c) {
  const admin = getCaseAdminCode(); if (!admin) return;
  const name = (prompt('사례명:', c.name || '') || '').trim(); if (!name) return;
  const site = (prompt('설치장소/고객 (선택):', c.site || '') || '').trim();
  const install_date = normalizeDate(prompt('설치일 YYYY-MM-DD (선택):', c.install_date || '') || '');
  const memo = (prompt('메모 (선택):', c.memo || '') || '').trim();
  const patch = { name, site: site || null, install_date, memo: memo || null };
  // 모델·배열이 틀린 경우 현재 화면 구성으로 통째 교체(선택).
  const { m, cols, rows } = currentModelArray();
  if (m && confirm(`모델·배열을 지금 화면 구성(${m.name} ${cols}×${rows})으로 교체할까요?\n[확인] 모델·배열까지 교체   [취소] 사례명·장소·날짜·메모만 수정`)) {
    patch.model_name = m.name; patch.cols = cols; patch.rows = rows;
    patch.space_w = spaceWmm() || null; patch.space_h = spaceHmm() || null;
    patch.data = gatherConfig();
  }
  try { await updateCase(admin, c.id, patch, caseViewCode); await renderCaseList(); alert(`'${name}' 사례를 수정했습니다.`); }
  catch (e) { localStorage.removeItem(CASE_ADMIN_KEY); alert('수정하지 못했습니다.\n' + e.message + '\n\n(등록 비밀번호를 다시 입력받겠습니다.)'); }
}
// 파싱된 사례들을 모델 해석·공간/스냅샷 보강 후 서버에 일괄 등록(등록 비번 필요).
async function registerParsedCases(parsed, { clearPaste } = {}) {
  if (!parsed.length) { alert('사례를 찾지 못했습니다.\n(설치장소 · 설치일 · 모델 · 열 · 행 · 메모 순)'); return; }
  const admin = getCaseAdminCode(); if (!admin) return;
  const createdBy = localStorage.getItem(NAME_KEY) || null;
  const unknown = [];
  const mapped = parsed.map(c => {
    const m = findModelByName(c.model_name);   // 여러 표기(MMF015·MM015F 등) 인식
    if (c.model_name && !m) unknown.push(c.model_name);
    const space_w = (m && c.cols) ? Math.round(c.cols * m.cabW + 2 * EDGE_MARGIN) : null;
    const space_h = (m && c.rows) ? Math.round(c.rows * m.cabH + 2 * EDGE_MARGIN) : null;
    const data = m ? { mode: 'manual', manCols: c.cols, manRows: c.rows, spaceW: space_w, spaceH: space_h, selectedId: m.id, selectedModel: { ...m } } : null;
    return { name: c.name, site: c.site || null, install_date: c.install_date, memo: c.memo || null,
      model_name: m ? m.name : (c.model_name || null), cols: c.cols, rows: c.rows, space_w, space_h, data, created_by: createdBy };
  });
  // 중복 제거 — 기존 목록과 겹치거나, 이번 묶음 안에서 서로 겹치는 건은 제외한다.
  const existing = await existingCasesForDupCheck();
  const seen = [], dups = [];
  const rows = mapped.filter(r => {
    if (isDupCase(r, existing) || isDupCase(r, seen)) { dups.push(r.name); return false; }
    seen.push(r); return true;
  });
  const dupList = [...new Set(dups)];
  const dupMsg = dupList.length ? `\n\n⚠️ 이미 있는(중복) ${dups.length}건은 제외했습니다:\n- ${dupList.slice(0, 10).join('\n- ')}${dupList.length > 10 ? '\n  …외 ' + (dupList.length - 10) + '건' : ''}` : '';
  if (!rows.length) { alert(`추가할 새 사례가 없습니다. 모두 이미 등록된 중복입니다.${dupMsg}`); return; }
  const warn = unknown.length ? `\n\n⚠️ 인식 못한 모델명: ${[...new Set(unknown)].join(', ')}\n(그대로 등록하면 불러올 때 모델이 안 잡힙니다. 취소하고 모델명을 확인하는 걸 권장합니다.)` : '';
  if (!confirm(`${rows.length}건의 설치 사례를 등록할까요?${warn}${dupMsg}`)) return;
  try {
    await addCases(admin, rows);
    if (clearPaste && $('#casePaste')) $('#casePaste').value = '';
    await renderCaseList();
    alert(`${rows.length}건을 등록했습니다.${dupList.length ? ` (중복 ${dups.length}건 제외)` : ''}`);
  } catch (e) { alert('일괄 등록에 실패했습니다.\n' + e.message); }
}
// 엑셀 붙여넣기(탭) 일괄 등록.
async function bulkRegisterCases() {
  await registerParsedCases(parseCasesText($('#casePaste')?.value || ''), { clearPaste: true });
}
// CSV 파일에서 일괄 등록.
async function importCasesCsv(file) {
  if (!file) return;
  try {
    const text = await file.text();   // UTF-8로 읽음 → CSV는 'CSV UTF-8'로 저장해야 한글이 안 깨짐
    await registerParsedCases(parseCasesText(text));
  } catch (e) { alert('CSV 파일을 읽지 못했습니다.\n' + e.message); }
}
$('#btnCases')?.addEventListener('click', openCases);
$('#casesClose')?.addEventListener('click', () => casesDlg.close());
$('#casesCancel')?.addEventListener('click', () => casesDlg.close());
$('#btnCaseRefresh')?.addEventListener('click', renderCaseList);
$('#btnCaseViewPass')?.addEventListener('click', () => { if (ensureCaseViewCode(true)) renderCaseList(); });
// 검색어 입력 → 목록만 다시 필터(서버 재조회 없음).
$('#caseSearch')?.addEventListener('input', e => { caseSearch = e.target.value || ''; renderCaseRows(); });
// 연도 칩 클릭 → 그 연도로 필터.
$('#caseYearFilter')?.addEventListener('click', e => {
  const b = e.target.closest('[data-case-year]'); if (!b) return;
  caseYear = b.dataset.caseYear; renderCaseYearChips(); renderCaseRows();
});
$('#btnCaseAddCurrent')?.addEventListener('click', registerCurrentCase);
$('#btnCaseBulk')?.addEventListener('click', bulkRegisterCases);
$('#btnCaseCsv')?.addEventListener('click', () => $('#caseCsvFile')?.click());
$('#caseCsvFile')?.addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; importCasesCsv(f); });
$('#caseList')?.addEventListener('click', async e => {
  const loadBtn = e.target.closest('[data-case-load]');
  const editBtn = e.target.closest('[data-case-edit]');
  const delBtn = e.target.closest('[data-case-del]');
  if (loadBtn) {
    const c = caseRowsCache.find(r => String(r.id) === loadBtn.dataset.caseLoad);
    if (c) { applyConfig(caseToConfig(c)); setCurrentConfig(c.name); casesDlg.close(); }
    return;
  }
  if (editBtn) {
    const c = caseRowsCache.find(r => String(r.id) === editBtn.dataset.caseEdit);
    if (c) await editCase(c);
    return;
  }
  if (delBtn) {
    const c = caseRowsCache.find(r => String(r.id) === delBtn.dataset.caseDel);
    if (!c) return;
    const admin = getCaseAdminCode(); if (!admin) return;
    if (!confirm(`설치 사례 '${c.name}'을(를) 삭제할까요? (모든 직원에게서 사라집니다)`)) return;
    try { await deleteCase(admin, c.id, caseViewCode); await renderCaseList(); }
    catch (err) { localStorage.removeItem(CASE_ADMIN_KEY); alert('삭제하지 못했습니다.\n' + err.message + '\n\n(등록 비밀번호를 다시 입력받겠습니다.)'); }
  }
});

window.addEventListener('resize', renderPreview);

// 미리보기는 '칸의 실제 폭'(#stage.clientWidth)에 맞춰 그림을 통째로 축소한다.
//   그런데 window의 resize는 폭이 바뀌는 모든 경우에 오지 않는다 —
//   모바일 주소창 접힘·화면 회전·글꼴 늦게 로딩·옆 카드 높이 변화·브라우저 확대 등.
//   그때 그림이 '이전 폭 기준'으로 남아 프레임 밖으로 삐져나오거나 잘려 보인다.
//   칸 자체의 크기를 지켜보면 원인이 무엇이든 확실히 다시 그린다.
(function watchStageWidth() {
  const stage = $('#stage');
  if (!stage || typeof ResizeObserver === 'undefined') return;
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    if (stage.hidden) return;                       // 3D 뷰를 보는 중이면 할 일 없음
    const w = Math.round(stage.clientWidth);
    // 높이만 바뀐 경우는 무시한다 — 다시 그린 결과로 높이가 바뀌므로 무한 반복이 된다.
    if (!w || w === lastW) return;
    lastW = w;
    renderPreview();
  });
  ro.observe(stage);
})();

// 인쇄 시 03 미리보기를 A4 폭(styles.css의 body.printing 고정폭)에 맞춰 다시 그린다.
// beforeprint에서 클래스 추가 후 재렌더 → 화면 폭과 무관하게 그림이 페이지 안에 들어온다.
window.addEventListener('beforeprint', () => { document.body.classList.add('printing'); renderPreview(); });
window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); renderPreview(); });

if (!restoreLastSession()) renderAll();   // 직전 상태 복원(있으면 applyConfig가 렌더까지 수행), 없으면 기본 렌더.
handleSharedLink();   // 공유 링크(#share=)로 들어온 경우 그 구성을 불러온다(자동복원보다 우선).

// ── 10 사이니지 배치 (삼성 LCD 사이니지: 단독형 / 비디오월) ──────────────────────
//   signage-data.js를 읽어 공간(가로·세로)에 실제 크기로 배치해 보여준다(표시 전용).
//   비디오월은 가로 N × 세로 M 장으로 이어붙여 크기를 키운다. LED 계산·프로세서 로직과 무관.
(function setupSignage() {
  const bar = $('#svBar'), summary = $('#svSummary'), arrCtl = $('#svArrayCtl'), picked = $('#svPicked');
  if (!bar) return;
  // svCode 는 모듈 전역(렌더프리뷰와 공유). 실제 3D 배치는 renderPreview가 그린다(여기선 컨트롤바+요약만).

  const svLabel = (m) => (m.category === 'video_wall')
    ? `삼성 ${m.display.screenSizeInch}형 · 베젤 ${m.videoWall.bezelMm}mm · ${m.display.brightnessNit}nit`
    : `${m.model} · 화면 ${m.display.screenSizeCm}cm · ${m.display.resolution.label}`;

  // 03 미리보기 위 컨트롤바(선택 모델·장수·요약)를 갱신한다. 3D 벽 자체는 renderPreview()가 그린다.
  function render() {
    const m = svCode ? SIGNAGE_MODELS.find(x => x.modelCode === svCode) : null;
    if (!m) { bar.hidden = true; return; }   // LED 모드 — 바 숨김
    bar.hidden = false;
    const isVW = m.category === 'video_wall';
    picked.innerHTML = `${isVW ? '비디오월' : '단독형'} · <b>${esc(m.modelCode)}</b> <span class="muted-note">${esc(svLabel(m))}</span>`
      + ` <button type="button" class="tiny ghost" id="svRepick">다시 선택</button>`
      + ` <button type="button" class="tiny ghost" id="svClear">LED로</button>`;
    $('#svRepick')?.addEventListener('click', () => openSvPick(m.category));
    $('#svClear')?.addEventListener('click', () => { svCode = null; renderAll(); });
    if (arrCtl) arrCtl.hidden = !isVW;
    // 요약(3D는 renderPreview가 그림). 단독형 외형 미확인이면 안내.
    if (m.physical.widthMm == null || m.physical.heightMm == null) {
      summary.innerHTML = `<span class="notice warn">외형(mm) 데이터가 없어 실제 크기 배치를 표시할 수 없습니다.</span>`;
      return;
    }
    const f = computeSvFit();                         // 공간에 맞춘 N×M(초과분 제한) + 확장 필요 공간
    const N = f.N, M = f.M;
    const totalW = N * m.physical.widthMm, totalH = M * m.physical.heightMm;
    const weightKg = (m.physical.weightKg != null) ? m.physical.weightKg * N * M : null;
    const resW = (m.display.resolution.width != null) ? m.display.resolution.width * (isVW ? N : 1) : null;
    const resH = (m.display.resolution.height != null) ? m.display.resolution.height * (isVW ? M : 1) : null;
    summary.innerHTML =
      `<span>${isVW ? `배열 <b>${N}×${M}</b> = ${N * M}장` : '단독형 1장'}</span>`
      + `<span>전체 <b>${fmt(totalW)}×${fmt(totalH)}</b>mm</span>`
      + `<span>해상도 <b>${resW != null ? fmt(resW) + '×' + fmt(resH) : '—'}</b></span>`
      + `<span>무게 <b>${weightKg != null ? fmt(weightKg, 1) + 'kg' : '—'}</b></span>`
      + (f.over ? ` <span class="notice warn fitExpand">`
        + ((N < f.reqN || M < f.reqM) ? `요청 <b>${f.reqN}×${f.reqM}</b> 은(는) 공간을 넘어 <b>${N}×${M}</b> 로 맞췄습니다. ` : `패널이 현재 공간보다 큽니다. `)
        + `<button type="button" class="tiny primary" data-expand="sv">공간 넓혀 ${f.reqN}×${f.reqM} 로 확장</button></span>` : '');
  }

  // 02 모델 라이브러리 → 사이니지 선택 팝업(동적 생성). 종류별 모델 목록에서 고른다.
  const svRow = (m) => `<button type="button" class="svPickItem" data-svpick="${esc(m.modelCode)}">`
    + `<span class="svPickName">${esc(m.category === 'video_wall' ? '삼성 ' + m.display.screenSizeInch + '형' : m.model)}</span>`
    + `<span class="svPickSpec">${esc(svLabel(m))}</span>`
    + `<span class="svPickCode">${esc(m.modelCode)}</span></button>`;
  function openSvPick(category) {
    let el = document.querySelector('#svPickPop');
    if (!el) {
      el = document.createElement('div'); el.id = 'svPickPop'; el.hidden = true; document.body.appendChild(el);
      el.addEventListener('click', e => {
        if (e.target === el || e.target.closest('[data-svclose]')) { el.hidden = true; return; }
        const it = e.target.closest('[data-svpick]');
        if (it) { svCode = it.dataset.svpick; svPortrait = false; el.hidden = true; renderAll(); document.querySelector('.previewCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    }
    const list = SIGNAGE_MODELS.filter(m => m.category === category);
    const title = category === 'video_wall' ? '비디오월 모델 선택' : '단독형 모델 선택';
    let body;
    if (category === 'standalone_signage') {
      const grp = fam => list.filter(m => m.family === fam).map(svRow).join('');
      body = `<div class="svPickGrp">QHC</div>${grp('QHC')}<div class="svPickGrp">QMC</div>${grp('QMC')}`;
    } else {
      const grp = pg => list.filter(m => m.productGroup === pg).map(svRow).join('');
      body = `<div class="svPickGrp">VM · 500nit</div>${grp('VM_500nit')}<div class="svPickGrp">VH · 700nit</div>${grp('VH_700nit')}`;
    }
    el.innerHTML = `<div class="svPickCard" role="dialog" aria-modal="true" aria-label="${esc(title)}">`
      + `<div class="svPickHead"><div class="svPickTitle">${esc(title)}</div><button type="button" class="ppClose" data-svclose aria-label="닫기">✕</button></div>`
      + `<div class="svPickBody">${body}</div></div>`;
    el.hidden = false;
  }

  $('#svPickStandalone')?.addEventListener('click', () => openSvPick('standalone_signage'));
  $('#svPickVideoWall')?.addEventListener('click', () => openSvPick('video_wall'));
  ['svCols', 'svRows'].forEach(id => $('#' + id)?.addEventListener('input', () => { render(); renderPreview(); renderReadout(); }));
  ['spaceW', 'spaceH'].forEach(id => $('#' + id)?.addEventListener('input', render));
  syncSignageCard = render;   // 모듈 전역에 노출(LED 모델 선택 시 바 갱신용)
  render();
})();
