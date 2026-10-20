// engine.js — LED Wall Configurator calculation engine (pure functions).
// No DOM, no side effects. Importable from both browser (ESM) and Node (--test).
// All formulas verified against Samsung official configurator (MP012F, 2026-07-23).

export const WATT_TO_BTU = 3.412142;   // W -> BTU/hr
export const MM_PER_INCH = 25.4;
export const RATIO_169 = 16 / 9;

/**
 * BDM 기준 최대 시청거리(m). 화면 세로(IH, Image Height)를 기준으로, 표시할 객체(글자)가
 * 화면 세로의 %EH를 차지할 때 가독 한계가 되는 가장 먼 시청자(FV) 거리.
 *   FV = IH × 200 × (%EH/100) = IH × 2 × %EH   → %EH 2.5%면 FV = IH × 5.
 * imageHeightMm: 화면 세로(mm), ehPercent: %EH(퍼센트). 유효하지 않으면 0.
 */
export function bdmFarViewerM(imageHeightMm, ehPercent) {
  if (!(imageHeightMm > 0) || !(ehPercent > 0)) return 0;
  return (imageHeightMm / 1000) * 2 * ehPercent;
}

/** Largest 16:9 resolution (in whole pixels) that fits inside w x h. */
export function fit169(w, h) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  return (w / h >= RATIO_169)
    ? { w: Math.round(h * RATIO_169), h }   // wider than 16:9 -> height-limited
    : { w, h: Math.round(w / RATIO_169) };  // taller than 16:9 -> width-limited
}

export const DEFAULTS = Object.freeze({
  powerFactor: 0.527,  // typical = max * powerFactor (Samsung MP012F: 3234/6132 = 0.5274)
  spareRate: 0.05,     // fallback spare rate when a series has no entry (see SPARE_RATES)
  edgeClearanceMm: 0,  // per-edge clearance subtracted before fill (VERTICAL FILL RULE PENDING — see SPEC Q1)
});

// 예비 캐비닛 비율(시리즈별, 올림): IFR·IEA·MMF 5% · MPF 7% (오너 지침 2026-08-19, IFR/IEA 5%로 재조정).
export const SPARE_RATES = Object.freeze({ IF: 0.05, IFM: 0.05, IE: 0.05, MM: 0.05, MP: 0.07 });

// LED 구조틀 여백(좌우상하 각 변, mm): IFR·IFR-M·IEA 30mm · MMF·MPF 50mm (오너 확인 2026-09-10).
//   구조물을 세울 때 필요한 가장자리 여유. 자동 채움 시 이 값을 빼고 캐비닛 수를 계산한다.
export const FRAME_CLEARANCE = Object.freeze({ IF: 30, IFM: 30, IE: 30, MM: 50, MP: 50 });
/** 시리즈별 구조틀 여백(각 변 mm). 미등록 시리즈는 30mm. */
export function frameClearanceMm(series) {
  return FRAME_CLEARANCE[series] ?? 30;
}
/** 모델 시리즈의 기본 예비율(소수). 미등록 시리즈는 DEFAULTS.spareRate로 대체. */
export function spareRateForSeries(series) {
  return SPARE_RATES[series] ?? DEFAULTS.spareRate;
}
/**
 * 예비 캐비닛 수 = 올림(설치수량 × 예비율).
 * opts.spareRate(사용자 지정 비율)가 있으면 그 값을, 없으면 시리즈 기본율을 쓴다.
 */
export function spareCount(series, total, opts = {}) {
  if (!(total > 0)) return 0;
  const rate = opts.spareRate ?? spareRateForSeries(series);
  return Math.ceil(total * rate - 1e-9);
}

/** Resolution per cabinet: explicit if provided, else derived from size / pitch. */
export function cabinetResolution(model) {
  const resW = model.resW ?? Math.round(model.cabW / model.pitch);
  const resH = model.resH ?? Math.round(model.cabH / model.pitch);
  return { resW, resH };
}

/**
 * SBOX (controller) count by width/height region tiling:
 *   ceil(resW / capW) * ceil(resH / capH)
 * where cap is one box's max output resolution. Redundancy doubles it.
 * Integrated-controller models need none (return 0). Unknown capacity -> null (no fake numbers).
 * Rule confirmed by owner + datasheet (SBB-CS4B = model code SBB-CS4BPGS, and SBB-SNOWAAE
 * limited to 4K): both boxes cap at 3840x2160. Verified vs Samsung: MP012F 42 cabinets
 * (4480x2160) -> ceil(4480/3840)*ceil(2160/2160) = 2 units.
 */
export function sboxCount(model, resW, resH, opts = {}) {
  if (model.integratedController) return 0;
  const capW = model.maxInputW, capH = model.maxInputH;
  if (capW == null || capH == null || !(resW > 0) || !(resH > 0)) return null;
  const base = Math.ceil(resW / capW) * Math.ceil(resH / capH);
  return opts.redundancy ? base * 2 : base;
}

// 광 지빅(GBIC, 광 컨버터) 신호 영역 단위: SBB-CS4B는 1920x2160 영역마다 1 SET 필요.
export const GBIC_REGION_W = 1920, GBIC_REGION_H = 2160;

/**
 * 광 지빅(GBIC) SET 수량. SBB-CS4B로 설계할 때만 사용:
 * 1920x2160 신호 영역마다 1 SET(SBOX측 1개 + LED측 1개 = 2개)이 필요하다.
 *   SET 수 = ceil(resW/1920) * ceil(resH/2160)
 * SBOX 이중화 시 신호 경로도 2배가 되므로 ×2. 해상도를 알 수 없으면 null(해당 없음).
 * (실제 부품: Exatek EXA-40G-QSFP-LR4 등 40G QSFP 싱글모드 광모듈.)
 */
export function gbicSets(resW, resH, opts = {}) {
  if (!(resW > 0) || !(resH > 0)) return null;
  const base = Math.ceil(resW / GBIC_REGION_W) * Math.ceil(resH / GBIC_REGION_H);
  return opts.redundancy ? base * 2 : base;
}

/**
 * IG(신호 입력 그룹) · 데이터 흐름 레이아웃.
 * 화면(resW×resH)을 S-Box 1대가 담당하는 입력 영역(모델별 지원 해상도 capW×capH, 현재 전 제품 4K)으로
 * 나누고, 각 영역이 담당하는 캐비닛 열/행 범위를 매핑한다(캐비닛 '중심' 픽셀이 속한 영역에 배정 → 온전한
 * 캐비닛 단위 그룹). S-Box 대수 규칙(sboxCount)과 같은 타일 방식이라 정합성 일치.
 *   영역 격자 = ceil(resW/capW) × ceil(resH/capH). 이중화(redundancy)는 신호 영역 수를 늘리지 않으므로
 *   여기서는 기본(백업 제외) 영역 맵만 반환한다. 통합 컨트롤러 모델은 boxes=0.
 * 값을 알 수 없으면 null(가짜 수치 금지).
 */
// 화면(resW×resH)을 capW×capH 입력 영역으로 나눠 각 영역이 담당하는 캐비닛 열/행을 매핑하는 공용 타일러.
//   캐비닛 '중심' 픽셀이 속한 영역에 배정(온전한 캐비닛 단위 그룹). igLayout(S-Box)·gbicLayout(광지빅) 공용.
function tileWall(cRW, cRH, resW, resH, cols, rows, capW, capH) {
  const regCols = Math.ceil(resW / capW), regRows = Math.ceil(resH / capH);
  const regions = [];
  for (let rr = 0; rr < regRows; rr++) {
    for (let rc = 0; rc < regCols; rc++) {
      const px0 = rc * capW, py0 = rr * capH;
      const px1 = Math.min((rc + 1) * capW, resW), py1 = Math.min((rr + 1) * capH, resH);
      const cabCols = [], cabRows = [];
      for (let c = 0; c < cols; c++) { const cx = (c + 0.5) * cRW; if (cx >= px0 && cx < px1) cabCols.push(c); }
      for (let r = 0; r < rows; r++) { const cy = (r + 0.5) * cRH; if (cy >= py0 && cy < py1) cabRows.push(r); }
      regions.push({
        index: rr * regCols + rc, regCol: rc, regRow: rr,
        px0, py0, px1, py1, pxW: px1 - px0, pxH: py1 - py0,
        colStart: cabCols.length ? cabCols[0] : null, colEnd: cabCols.length ? cabCols[cabCols.length - 1] : null,
        rowStart: cabRows.length ? cabRows[0] : null, rowEnd: cabRows.length ? cabRows[cabRows.length - 1] : null,
        cabinetCols: cabCols.length, cabinetRows: cabRows.length, cabinets: cabCols.length * cabRows.length,
      });
    }
  }
  return { regCols, regRows, regions };
}

export function igLayout(model, resW, resH, cols, rows) {
  if (model.integratedController) return { integrated: true, boxes: 0, regCols: 0, regRows: 0, capW: null, capH: null, controller: model.sbox ?? null, regions: [] };
  const capW = model.maxInputW, capH = model.maxInputH;
  if (capW == null || capH == null || !(resW > 0) || !(resH > 0) || !(cols > 0) || !(rows > 0)) return null;
  const { resW: cRW, resH: cRH } = cabinetResolution(model);
  if (!(cRW > 0) || !(cRH > 0)) return null;
  const { regCols, regRows, regions } = tileWall(cRW, cRH, resW, resH, cols, rows, capW, capH);
  return { integrated: false, boxes: regCols * regRows, regCols, regRows, capW, capH, controller: model.sbox ?? null, regions };
}

/**
 * 광 지빅(GBIC) 신호 영역 레이아웃. CS4B 계열은 1920×2160 px마다 GBIC 1 SET을 쓰므로,
 * 데이터 흐름 도면의 신호 그룹은 S-Box(4K)가 아니라 이 GBIC 격자(1920×2160)로 나눈다.
 * 반환: { regCols, regRows, sets, capW, capH, regions } (통합 컨트롤러·해상도 미확인이면 null).
 */
export function gbicLayout(model, resW, resH, cols, rows) {
  if (model.integratedController) return null;
  const { resW: cRW, resH: cRH } = cabinetResolution(model);
  if (!(cRW > 0) || !(cRH > 0) || !(resW > 0) || !(resH > 0) || !(cols > 0) || !(rows > 0)) return null;
  const { regCols, regRows, regions } = tileWall(cRW, cRH, resW, resH, cols, rows, GBIC_REGION_W, GBIC_REGION_H);
  return { regCols, regRows, sets: regCols * regRows, capW: GBIC_REGION_W, capH: GBIC_REGION_H, regions };
}

// 광 미사용(동선) 컨트롤러(IFR-M CS4FPGS·IFR/IEA SNOWJMU 등, 즉 비-CS4B)의 IG(신호 입력 그룹) 단위 = FHD 1920×1080.
//   (CS4B 광지빅은 1920×2160, 광 미사용은 1920×1080 — 이사 지침 2026-09-14.)
export const IG_FHD_W = 1920, IG_FHD_H = 1080;
export function fhdLayout(model, resW, resH, cols, rows) {
  if (model.integratedController) return null;
  const { resW: cRW, resH: cRH } = cabinetResolution(model);
  if (!(cRW > 0) || !(cRH > 0) || !(resW > 0) || !(resH > 0) || !(cols > 0) || !(rows > 0)) return null;
  const { regCols, regRows, regions } = tileWall(cRW, cRH, resW, resH, cols, rows, IG_FHD_W, IG_FHD_H);
  return { regCols, regRows, units: regCols * regRows, capW: IG_FHD_W, capH: IG_FHD_H, regions };
}

// ── 전원 구성(회로/데이지체인) — Samsung IF015R-M 데이터시트 알고리즘(이사 제공, 2026) ──────
// 연속부하 80% 여유. 회로당 캐비닛 = ⌊전압 × 차단기A × 0.8 / 캐비닛최대W⌋, 회로 수 = ⌈총/회로당⌉.
//   데이터시트 검증(캐비닛 190W): 110V20A→9/회로, 208V20A→17, 230V13A→12, 230V16A→15.
export const POWER_DERATE = 0.8;
// 전원 데이지체인(전원 인터커넥트 케이블) 전류 예산(A). 데이터시트 보정값:
//   ⌊전압 × 3.9 / 캐비닛W⌋ → 110V→2, 208V→4, 230V→4 (190W 기준 일치). engineeringRule(모델별 케이블
//   정격에 따라 다를 수 있어 정확값은 모델 데이터시트 필요). 0 이하가 되면 null.
export const POWER_CHAIN_AMPS = 3.9;
// 표준 회로 옵션. 국내 시공은 230V 20A 차단기를 주로 사용(이사 지침) → primary로 맨 앞.
//   16A/13A는 데이터시트(유럽 기준) 참고용으로 함께 표시.
export const POWER_CIRCUIT_OPTIONS = Object.freeze([
  { id: '230v20a', label: '230V 20A', voltage: 230, amps: 20, primary: true },
  { id: '230v16a', label: '230V 16A', voltage: 230, amps: 16 },
  { id: '230v13a', label: '230V 13A', voltage: 230, amps: 13 },
  { id: '208v20a', label: '208V 20A', voltage: 208, amps: 20 },
  { id: '110v20a', label: '110V 20A', voltage: 110, amps: 20 },
]);

/**
 * 전원 구성 산출. 캐비닛 최대전력(model.maxPower, W/대)과 총 캐비닛 수로 전압·차단기별
 * 회로 수/회로당 캐비닛/데이지체인 수를 계산한다. maxPower 미확인이면 null(가짜 수치 금지).
 * 반환: { perCabinetW, total, derate, chainAmps, rows:[{id,label,voltage,amps,cabinetsPerCircuit,circuits,cabinetsPerDaisyChain,daisyChains}] }
 */
export function powerConfig(model, total, opts = {}) {
  const Wcab = model?.maxPower;
  if (Wcab == null || !(Wcab > 0) || !(total > 0)) return null;
  const derate = opts.derate ?? POWER_DERATE;
  const chainAmps = opts.chainAmps ?? POWER_CHAIN_AMPS;
  const options = opts.options ?? POWER_CIRCUIT_OPTIONS;
  const rows = options.map(o => {
    const perCircuit = Math.floor(o.voltage * o.amps * derate / Wcab);
    const perDaisy = Math.floor(o.voltage * chainAmps / Wcab);
    return {
      id: o.id, label: o.label, voltage: o.voltage, amps: o.amps, primary: !!o.primary,
      cabinetsPerCircuit: perCircuit > 0 ? perCircuit : null,
      circuits: perCircuit > 0 ? Math.ceil(total / perCircuit) : null,
      cabinetsPerDaisyChain: perDaisy > 0 ? perDaisy : null,
      daisyChains: perDaisy > 0 ? Math.ceil(total / perDaisy) : null,
    };
  });
  return { perCabinetW: Wcab, total, derate, chainAmps, rows };
}

/**
 * Decide how many cabinets fit.
 * mode 'fill'   -> floor((space - 2*clearance) / cabinet) on each axis (pure max-fill)
 * mode 'manual' -> caller-supplied cols/rows
 * NOTE: Samsung "Fit to wall" was observed to be more conservative vertically than pure floor.
 *       Until that rule is confirmed (SPEC Q1), 'fill' uses pure floor; adjust edgeClearanceMm to approximate.
 */
export function fitCabinets(model, spaceW, spaceH, opts = {}) {
  const mode = opts.mode ?? 'fill';
  const clr = opts.edgeClearanceMm ?? frameClearanceMm(model.series);   // 구조틀 여백(시리즈별)
  let cols, rows;
  if (mode === 'manual') {
    cols = Math.max(0, Math.floor(opts.cols ?? 0));
    rows = Math.max(0, Math.floor(opts.rows ?? 0));
  } else {
    cols = Math.max(0, Math.floor((spaceW - 2 * clr) / model.cabW));
    rows = Math.max(0, Math.floor((spaceH - 2 * clr) / model.cabH));
  }
  return { cols, rows, fits: cols >= 1 && rows >= 1 };
}

/** Full spec readout for a given model + space + options. */
export function computeConfig(model, spaceW, spaceH, opts = {}) {
  const pf = opts.powerFactor ?? DEFAULTS.powerFactor;
  // 하단 높이(바닥에서 LED 아래까지, mm): 세로 공간에서 이만큼 빼고 남는 높이에 캐비닛을 채운다.
  //   baseHeight=0(기본)이면 기존과 동일. 자동 채움일 때 rows가 그만큼 줄어든다(수동 배열은 영향 없음).
  const mode = opts.mode ?? 'fill';
  const baseHeight = Math.max(0, opts.baseHeight || 0);
  // 채움 대상 크기: 'fill'=벽면(세로는 하단 높이 제외), 'ledsize'=사용자가 지정한 LED 크기, 'manual'=열/행.
  //   'ledsize'는 fill 규칙으로 LED 가로/세로 안에 캐비닛을 채운다(하단 높이는 위치용이라 빼지 않음).
  let fitW = spaceW, fitH = Math.max(0, spaceH - baseHeight), fitOpts = opts;
  if (mode === 'ledsize') { fitW = Math.max(0, opts.ledW || 0); fitH = Math.max(0, opts.ledH || 0); fitOpts = { ...opts, mode: 'fill' }; }
  const { cols, rows, fits } = fitCabinets(model, fitW, fitH, fitOpts);
  const total = cols * rows;
  // 예비 캐비닛 — 시리즈 규칙(MMF 5%·MPF 7% 비율, IFR/IEA 3×3당 1대) 또는 사용자 지정 비율(opts.spareRate).
  const spares = spareCount(model.series, total, opts);
  const totalWithSpares = total + spares;
  const { resW: cRW, resH: cRH } = cabinetResolution(model);

  const actualW = cols * model.cabW;         // mm
  const actualH = rows * model.cabH;         // mm
  const areaM2  = (actualW / 1000) * (actualH / 1000);
  const diagIn  = Math.sqrt(actualW ** 2 + actualH ** 2) / MM_PER_INCH;
  const resW = cols * cRW, resH = rows * cRH, pixels = resW * resH;

  const hasWeight = model.weight != null;
  const hasPower  = model.maxPower != null;
  const weightKg  = hasWeight ? total * model.weight : null;
  const maxW      = hasPower ? total * model.maxPower : null;
  // Prefer a per-model measured typical power; otherwise derive from the global power factor.
  const typW      = model.typicalPower != null ? total * model.typicalPower
                    : (hasPower ? maxW * pf : null);
  const heatMaxBTU = maxW != null ? maxW * WATT_TO_BTU : null;
  const heatTypBTU = typW != null ? typW * WATT_TO_BTU : null;

  const redundancy = opts.redundancy ?? false;
  const sbox = sboxCount(model, resW, resH, { redundancy });
  // 예비 SBOX: 산출 대수(sbox>0)일 때만. 기본 1대, opts.sboxSpares로 직접 지정(0 이상 정수).
  const sboxSpares = (sbox > 0) ? Math.max(0, Math.floor(opts.sboxSpares ?? 1)) : 0;
  const sboxWithSpares = (sbox != null) ? sbox + sboxSpares : null;
  // 'CS4B(광전송)로 설계' 선택 시 컨트롤러 표시를 SBB-CS4B로 바꾼다(기본은 모델 지정 컨트롤러).
  // 단, 모델 기본 컨트롤러가 이미 CS4B 계열(MMF의 SBB-CS4BPGS 등)이면 그대로 둔다(다운그레이드 방지).
  const cs4b = opts.cs4b ?? false;
  const nativeCS4B = typeof model.sbox === 'string' && model.sbox.includes('CS4B');
  const controller = (cs4b && !nativeCS4B) ? 'SBB-CS4B' : (model.sbox ?? null);
  // 광 지빅(GBIC)은 CS4B 계열 컨트롤러에서만 필요: MMF(기본 SBB-CS4BPGS)는 자동, 그 외 라인은
  // 'CS4B(광전송)' 선택 시. 1920x2160 신호 영역마다 1 SET.
  // Gbic 수량 2배 조건: SBOX 이중화(redundancy) 또는 Gbic 포워드/백워드(gbicFB) 중 하나라도 켜지면 ×2.
  const gbicFB = opts.gbicFB ?? false;
  const usesCS4B = typeof controller === 'string' && controller.includes('CS4B');
  const gbic = usesCS4B ? gbicSets(resW, resH, { redundancy: redundancy || gbicFB }) : null;

  // Largest 16:9 resolution that fits inside the panel's output resolution.
  // For a super-wide wall (wider than 16:9) the full height is used and the width is
  // limited to height*16/9; for a taller-than-16:9 wall the width is the limit.
  const { w: res169W, h: res169H } = fit169(resW, resH);
  const is169 = resH > 0 && Math.abs(resW / resH - RATIO_169) < 0.001;
  // 16:9 최대 영역의 물리 대각(인치): 해당 픽셀 영역 × 픽셀피치 기준.
  const diag169In = (res169W > 0 && res169H > 0)
    ? Math.sqrt((res169W * model.pitch) ** 2 + (res169H * model.pitch) ** 2) / MM_PER_INCH
    : 0;

  // IG(신호 입력 그룹)·데이터 흐름 레이아웃 — S-Box 입력 영역 ↔ 캐비닛 매핑(별도 계통도 표시용).
  const ig = fits ? igLayout(model, resW, resH, cols, rows) : null;
  // 광 지빅(GBIC) 신호 영역 — CS4B 계열은 1920×2160마다 GBIC. 데이터 흐름 도면 신호 그룹의 실제 단위.
  const igGbic = (fits && usesCS4B) ? gbicLayout(model, resW, resH, cols, rows) : null;
  // 광 미사용(비-CS4B) 컨트롤러의 IG(신호 입력 그룹) = FHD 1920×1080. 데이터 흐름 도면 신호 그룹 단위.
  const igFhd = (fits && !usesCS4B && !model.integratedController) ? fhdLayout(model, resW, resH, cols, rows) : null;
  // 전원 구성(회로/데이지체인) — 데이터시트 알고리즘. maxPower 없으면 null.
  const power = (fits && total > 0) ? powerConfig(model, total, opts) : null;

  const deadW = Math.max(0, spaceW - actualW);
  const deadH = Math.max(0, spaceH - baseHeight - actualH);   // 벽면 대비 위 남는 세로(하단 높이 제외 후)

  // BDM 시청거리(m): %EH 2.5% → 세로×5(권장), %EH 3% → 세로×6(최대).
  const bdm25M = bdmFarViewerM(actualH, 2.5);
  const bdm30M = bdmFarViewerM(actualH, 3);

  return {
    cols, rows, fits, total, spares, totalWithSpares,
    actualW, actualH, areaM2, diagIn, bdm25M, bdm30M,
    resW, resH, pixels,
    res169W, res169H, is169, diag169In,
    weightKg, maxW, typW, heatMaxBTU, heatTypBTU,
    sbox, sboxSpares, sboxWithSpares, gbic, controller, redundancy, gbicFB,
    ig, igGbic, igFhd, power,
    deadW, deadH, baseHeight,
    marginW: deadW / 2, marginH: deadH / 2, // centered mount
    brightnessPeak: model.brightnessPeak ?? null,
    // "최대"(운영 최대) 밝기. 모델에 reduced 값이 있으면 그 값, 없으면 peak 값을 최대로 사용한다.
    brightnessMax: (model.brightnessReduced ?? model.brightnessPeak) ?? null,
  };
}

/**
 * 원가/견적가 산출 (품목별). 실제 단가(prices)는 인자로만 받는다 — engine.js엔 가격을 하드코딩하지 않는다.
 * prices 구조는 prices.example.js 참고. prices가 없으면(공개 배포 등) null 반환 → UI에서 06 카드 숨김.
 *
 * config: computeConfig() 결과. opts.etc = { cost, sell } 기타자재 수동 입력(선택).
 * 각 라인: { label, qty, unit, unitCost, unitSell, cost, sell, note }. cost/sell는 단가 없으면 null.
 * 반환: { lines, totalCost, totalSell, margin, incomplete }  (incomplete = 단가 미설정 항목 존재)
 */
export function computeQuote(model, config, prices, opts = {}) {
  if (!prices || !config || !config.fits) return null;
  const lines = [];
  const add = (label, qty, unit, uc, us, note) => {
    if (!(qty > 0)) return;
    const cost = uc != null ? qty * uc : null;
    const sell = us != null ? qty * us : null;
    lines.push({ label, qty, unit, unitCost: uc ?? null, unitSell: us ?? null, cost, sell, note: note ?? '' });
  };

  // 1) LED 패널 — 예비 포함 총 캐비닛 수 기준(실제 구매/견적 수량과 일치).
  const p = prices.panels?.[model.id] ?? null;
  add(`LED 패널 · ${model.name}`, config.totalWithSpares, 'EA', p?.cost ?? null, p?.sell ?? null, '예비 포함');

  // 2) S-BOX(컨트롤러) — 산출 대수(이중화 반영) + 예비 SBOX.
  if (config.sbox > 0 && config.controller) {
    const s = prices.sbox?.[config.controller] ?? null;
    const qty = config.sboxWithSpares ?? config.sbox;
    const note = config.sboxSpares > 0 ? `예비 ${config.sboxSpares} 포함` : '';
    add(`S-BOX · ${config.controller}`, qty, 'EA', s?.cost ?? null, s?.sell ?? null, note);
  }

  // 3) Gbic 광모듈 — EA = SET×2 (SBOX측+LED측). CS4B 설계일 때만 config.gbic 존재.
  if (config.gbic > 0 && prices.gbic) {
    add('Gbic 광모듈', config.gbic * 2, 'EA', prices.gbic.cost ?? null, prices.gbic.sell ?? null, 'SET×2');
  }

  // 4) 설치 인건비 — 면적(㎡) × ㎡단가. 고소작업(opts.highWork) 시 할증배수(highWorkMultiplier) 적용.
  //    간접비 산출의 '노무비' 기준으로 쓰기 위해 설치 원가금액을 laborCost로 보관한다.
  let laborCost = 0;
  if (config.areaM2 > 0 && prices.install) {
    const mult = (opts.highWork && prices.install.highWorkMultiplier > 0) ? prices.install.highWorkMultiplier : 1;
    const uc = prices.install.costPerM2 != null ? prices.install.costPerM2 * mult : null;
    const us = prices.install.sellPerM2 != null ? prices.install.sellPerM2 * mult : null;
    add('설치 인건비' + (mult > 1 ? ' · 고소작업' : ''), config.areaM2, '㎡', uc, us, mult > 1 ? `고소 할증 ×${mult}` : '');
    laborCost = uc != null ? config.areaM2 * uc : 0;
  }

  // 5) 기타 자재(프레임·지그·케이블 등) — 수량규칙 미정, 수동 입력 lump.
  const etc = opts.etc;
  if (etc && ((etc.cost ?? 0) > 0 || (etc.sell ?? 0) > 0)) {
    add('기타 자재 (프레임·지그·케이블 등)', 1, '식', etc.cost ?? null, etc.sell ?? null, '수동 입력');
  }

  const sum = k => lines.reduce((a, l) => a + (l[k] ?? 0), 0);
  const directCost = sum('cost'), directSell = sum('sell');

  // 간접비(표준품셈 방식) — 원가 기준(노무비=설치 원가, 직접비=총 원가)으로 산출해 '견적'에만 가산.
  // 요율/항목은 prices.indirect.items 에서 설정(오너 지침 2026-08-19). 없으면 간접비 미적용.
  // opts.indirectDisabled: 화면 체크박스로 끈 항목명 배열(있으면 그것이 포함/제외의 기준).
  const indirect = prices.indirect ? computeIndirect(laborCost, directCost, prices.indirect, opts.indirectDisabled) : null;
  const indirectTotal = indirect?.total ?? 0;

  const totalCost = directCost;                 // 간접비는 견적에만 → 원가 총액 불변
  const totalSell = directSell + indirectTotal; // 견적 = 직접 견적 + 간접비
  const incomplete = lines.some(l => l.unitSell == null || l.unitCost == null);
  return {
    lines, directCost, directSell, indirect,
    totalCost, totalSell,
    margin: totalSell > 0 ? (totalSell - totalCost) / totalSell : 0,
    incomplete,
  };
}

/**
 * 간접비(표준품셈) 산출. base 종류:
 *   'labor'   → 노무비(직접노무비) 대비
 *   'direct'  → 직접비 대비
 *   'special' → (직접비 + 간접노무비 + 산업안전보건관리비) 대비  (공과잡비용)
 * items는 순서대로 계산되며 'special'은 앞서 계산된(그리고 포함된) 간접노무비·산업안전보건관리비 금액을 참조한다.
 * 포함 여부: disabled 배열이 주어지면 그 목록에 없는 항목만 포함(화면 체크박스 기준). 없으면 item.enabled!==false.
 * 제외 항목은 total과 공과잡비 base 계산에서 모두 빠진다.
 * 반환: { lines:[{name,pct,baseKind,base,amount,included}], total }  (cfg 없으면 null)
 */
export function computeIndirect(labor, direct, cfg, disabled) {
  if (!cfg || !Array.isArray(cfg.items) || cfg.items.length === 0) return null;
  const off = disabled != null
    ? new Set(disabled)
    : new Set(cfg.items.filter(i => i.enabled === false).map(i => i.name));
  const by = {};  // 포함된 항목의 금액(공과잡비 base용). 제외 항목은 0.
  const lines = cfg.items.map(it => {
    const included = !off.has(it.name);
    const base = it.base === 'labor' ? labor
      : it.base === 'direct' ? direct
      : it.base === 'special' ? (direct + (by['간접노무비'] || 0) + (by['산업안전보건관리비'] || 0))
      : 0;
    const amount = base * (Number(it.pct) || 0) / 100;
    by[it.name] = included ? amount : 0;
    return { name: it.name, pct: Number(it.pct) || 0, baseKind: it.base, base, amount, included };
  });
  const total = lines.reduce((a, l) => a + (l.included ? l.amount : 0), 0);
  return { lines, total };
}

/**
 * Bill of materials. Spare rule: ceil(total * spareRate). SBOX quantity uses the
 * confirmed rule (see sboxCount) when total pixels are supplied via opts.pixels.
 * Jig quantity rule is still model-specific and undefined — returned as null.
 */
export function bom(model, total, opts = {}) {
  const spares = spareCount(model.series, total, opts);
  const sboxQty = (opts.resW != null && opts.resH != null) ? sboxCount(model, opts.resW, opts.resH, opts) : null;
  return {
    cabinetPart: model.cabinetPart ?? null,
    cabinets: total,
    spares,
    totalCabinets: total + spares,
    sbox: model.sbox ?? null,
    sboxQty,
    jitQty: null,    // TODO(SPEC:BOM): define Jig count rule
  };
}

// LED 가로 위치 — 앞벽 위에서 LED 를 좌우로 옮긴다(오너 요청 2026-10-19).
//   offset 은 '가운데에서 몇 mm' 이고 + 가 오른쪽(방 안에서 LED 벽을 바라본 기준)이다.
//   벽 밖으로 나가지 않게 [-여백/2, +여백/2] 로 자른다. 계산 결과(캐비닛·해상도·전력)는 바꾸지 않고
//   **위치만** 정한다. offset 0 이면 computeConfig 의 marginW(가운데 정렬)와 같다.
export function ledPlacement(wallW, ledW, offset = 0) {
  const free = Math.max(0, (Number(wallW) || 0) - (Number(ledW) || 0));
  const half = free / 2;
  const raw = Number(offset);
  const off = Number.isFinite(raw) ? Math.min(half, Math.max(-half, raw)) : 0;
  const left = half + off;
  return { left, right: free - left, offset: off, maxOffset: half };
}
