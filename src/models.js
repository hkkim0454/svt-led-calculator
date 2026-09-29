// models.js — LED cabinet model library.
// Source: Samsung official configurator (display-configurator.biz.samsung.com), observed 2026-07-23.
//   pitch, cabinet dimensions (W x H x depth), peak/reduced brightness, refresh, OVD  = OBSERVED
//   resolution                                                                        = OBSERVED / derived (size / pitch)
//   weight, maxPower, typicalPower (per cabinet)                                       = DATASHEET REQUIRED unless verified
//   maxInputW/H = controller (SBOX) max input pixels; used for SBOX count.
// Fill weight/power from official datasheets before using for quotes.
//
// dataStatus:
//   'verified'           = cabinet + power figures cross-checked against the Samsung tool
//   'derived'            = dimensions observed; power/weight derived or missing (needs datasheet)
//   'needs-verification' = values still uncertain, confirm before use
//
// SBOX capacity note: all supported controllers (SBB-SNOWAAE / SBB-SNOWJMU / SBB-CS4B(=CS4BPGS))
//   cap at 3840x2160 (4K). Confirmed by Samsung's own output (MP012F 42 cabinets = 4480x2160 -> 2 SBOX).
//   Default controller per line: MPF=SBB-SNOWAAE(또는 CS4B), IFR/IEA=SBB-SNOWJMU(필요시 CS4B), MMF=SBB-CS4BPGS.
//   maxInputW/H null이면 SBOX는 "—"로 표시(가짜 수치 금지).

export const MODELS = [
  // ---- The Wall — LED Indoor (MP series, cabinet 806.4 x 453.6) ----
  { id: 'MP008F', name: 'MP008F', category: 'LED Indoor (The Wall)', series: 'MP',
    pitch: 0.84, cabW: 806.4, cabH: 453.6, depth: 49.4, resW: 960, resH: 540,
    brightnessPeak: 1800, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 2.9,
    weight: 9.2, maxPower: 122, typicalPower: 64, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH008MPFAAA', dataStatus: 'verified' }, // MPF 컨트롤러 CS4BPGS(CS4B 광지빅) — 이사 지침/삼성 검증. SNOWAAE도 가능

  { id: 'MP012F', name: 'MP012F', category: 'LED Indoor (The Wall)', series: 'MP',
    pitch: 1.26, cabW: 806.4, cabH: 453.6, depth: 49.4, resW: 640, resH: 360,
    brightnessPeak: 1800, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 4.4,
    weight: 9.2, maxPower: 146, typicalPower: 77, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH012MPFAAA', dataStatus: 'verified' }, // MPF 컨트롤러 CS4BPGS(CS4B 광지빅) — 삼성 공식 검증 S-Box=CS4BPGS

  // CONFIRMED via Samsung US MPF datasheet (LH016MPFAAA), 2026-07-24.
  { id: 'MP016F', name: 'MP016F', category: 'LED Indoor (The Wall)', series: 'MP',
    pitch: 1.68, cabW: 806.4, cabH: 453.6, depth: 49.4, resW: 480, resH: 270,
    brightnessPeak: 1600, brightnessReduced: 1200, refreshHz: 3840, ovd_m: 5.8,
    weight: 9.2, maxPower: 161, typicalPower: 68, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH016MPFAAA', dataStatus: 'verified' }, // MPF 컨트롤러 CS4BPGS(CS4B 광지빅) — 이사 지침

  // (The Wall IW series removed 2026-07-24 — discontinued, superseded by MPF.)

  // ---- IF series (indoor flat, cabinet 960 x 540) — IFR. 기본 컨트롤러 SBB-SNOWJMU(주 설계), 필요시 SBB-CS4B ----
  // IF015R CONFIRMED via full Samsung datasheet: 11.8kg, max 360W (694 W/m²), typ 117W (226 W/m²),
  // brightness 1600/800 (peak/max). IF025R power from summary sheet; weight/typ pending its full sheet.
  { id: 'IF015R', name: 'IF015R', category: 'Indoor', series: 'IF',
    pitch: 1.5, cabW: 960, cabH: 540, depth: 79.5, resW: 640, resH: 360,
    brightnessPeak: 1600, brightnessReduced: 800, refreshHz: 3840, ovd_m: 5.2,
    weight: 11.8, maxPower: 360, typicalPower: 117, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH015IFRCLS', dataStatus: 'verified' }, // IFR 기본 컨트롤러 SNOWJMU (필요시 CS4B)
  // IF020R 전력·부품번호: IFR 브로셔(2022) 기준(최대 260W/평균 87W). 무게는 null 유지 —
  //   IFR 브로셔가 전 모델을 12.4kg로 일괄표기(IF015R 실측 11.8과 불일치)라 신뢰 낮음, 실측 확보 시 입력.
  { id: 'IF020R', name: 'IF020R', category: 'Indoor', series: 'IF',
    pitch: 2.0, cabW: 960, cabH: 540, depth: 79.5, resW: 480, resH: 270,
    brightnessPeak: 1600, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 7.0,
    weight: null, maxPower: 260, typicalPower: 87, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH020IFRCLS', dataStatus: 'derived' },
  { id: 'IF025R', name: 'IF025R', category: 'Indoor', series: 'IF',
    pitch: 2.5, cabW: 960, cabH: 540, depth: 79.5, resW: 384, resH: 216,
    brightnessPeak: 2000, brightnessReduced: 1000, refreshHz: 3240, ovd_m: 8.6,
    weight: 12.4, maxPower: 260, typicalPower: 87, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH025IFRCLS', dataStatus: 'verified' }, // verified vs Samsung export 10x5: 620kg/50, 13000W, typ 4350W
  // IF040R 전력·부품번호: IFR 브로셔 기준(최대 260W/평균 87W). 무게 null 유지(위 IF020R 주석과 동일 사유).
  { id: 'IF040R', name: 'IF040R', category: 'Indoor', series: 'IF',
    pitch: 4.0, cabW: 960, cabH: 540, depth: 79.5, resW: 240, resH: 135,
    brightnessPeak: 1500, brightnessReduced: 900, refreshHz: 3840, ovd_m: 13.8,
    weight: null, maxPower: 260, typicalPower: 87, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH040IFRCLS', dataStatus: 'derived' },

  // ---- IFR-M series (IFR 후속, 신규 운영) — MIP1010 다이오드로 저전력·고휘도·광시야각(170°). ----
  //   기본 컨트롤러 SBB-CS4FPGS(CS4F, 동선 전송 → Gbic 불필요). '광전송으로 설계' 선택 시 SBB-CS4B(Gbic 자동).
  //   삼성 IFR-M 스펙시트(2026) 기준.
  { id: 'IF015RM', name: 'IF015R-M', category: 'Indoor', series: 'IFM',
    pitch: 1.5, cabW: 960, cabH: 540, depth: 79.5, resW: 640, resH: 360,
    brightnessPeak: 1700, brightnessReduced: 1000, refreshHz: 3840, ovd_m: 5.2,
    weight: 11.8, maxPower: 190, typicalPower: 105, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4FPGS', cabinetPart: 'LH015IFRILS', dataStatus: 'verified' }, // 190W/105W, 1700/1000nit, MIP1010. 기본 CS4F(동선)/광선택시 CS4B (기존 IFR 대비 저전력·고휘도)

  // ---- IE series (indoor, cabinet 960 x 540) — IEA. 기본 컨트롤러 SBB-SNOWJMU(주 설계), 필요시 SBB-CS4B ----
  // IE015A CONFIRMED via full Samsung datasheet: 11.8kg, max 190W (367 W/m²), typ 105W (203 W/m²), 1000/500 nit.
  { id: 'IE015A', name: 'IE015A', category: 'Indoor', series: 'IE',
    pitch: 1.5, cabW: 960, cabH: 540, depth: 79.5, resW: 640, resH: 360,
    brightnessPeak: 1000, brightnessReduced: 500, refreshHz: 3840, ovd_m: 5.2,
    weight: 11.8, maxPower: 190, typicalPower: 105, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH015IEACLS', dataStatus: 'verified' },
  // IE020A: 삼성 IEA 브로셔(2022) 실측 — 무게 12.4, 최대 190W/평균 105W, 1000/500 nit.
  { id: 'IE020A', name: 'IE020A', category: 'Indoor', series: 'IE',
    pitch: 2.0, cabW: 960, cabH: 540, depth: 79.5, resW: 480, resH: 270,
    brightnessPeak: 1000, brightnessReduced: 500, refreshHz: 3840, ovd_m: 7.0,
    weight: 12.4, maxPower: 190, typicalPower: 105, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH020IEACLS', dataStatus: 'verified' },
  { id: 'IE025A', name: 'IE025A', category: 'Indoor', series: 'IE',
    pitch: 2.5, cabW: 960, cabH: 540, depth: 79.5, resW: 384, resH: 216,
    brightnessPeak: 1000, brightnessReduced: 500, refreshHz: 3840, ovd_m: 8.6,
    weight: 10.8, maxPower: 180, typicalPower: 60, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH025IEACLS', dataStatus: 'verified' }, // verified vs Samsung export 10x10: 1080kg/100, 18000W, typ 6000W
  // IE040A: 삼성 IEA 브로셔 실측 — 무게 10.8, 최대 180W/평균 60W, 800/500 nit.
  { id: 'IE040A', name: 'IE040A', category: 'Indoor', series: 'IE',
    pitch: 4.0, cabW: 960, cabH: 540, depth: 79.5, resW: 240, resH: 135,
    brightnessPeak: 800, brightnessReduced: 500, refreshHz: 3840, ovd_m: 13.8,
    weight: 10.8, maxPower: 180, typicalPower: 60, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-SNOWJMU', cabinetPart: 'LH040IEACLS', dataStatus: 'verified' },

  // ---- IEA-E series (IEA 후속, cabinet 960 x 540) — 기본 컨트롤러 SBB-CS4FPGS(CS4F, 동선 전송). ----
  //   삼성 IEA-E 사양시트(2026-09-10, "Before finalizing spec"=잠정). IEA 대비 평균전력↑(127W)·명암비/HDR10+ 개선.
  //   밝기 Peak는 확정 전(-)→null, 상시(Max) 600nit. Visual Refresh N/A. 확정 시 dataStatus 'verified'로 갱신.
  //   2026-09-29 통합 LED 사양서(IEA/IFR/MMF/MPF/S-Box 시트, '신규 운영') 반영: IE015A-E 무게 11.8→12.4kg,
  //   IE020A-E 신규. 삼성 configurator 대조 전이므로 'derived' 유지. ovd_m은 같은 피치 IEA 값.
  { id: 'IE015AE', name: 'IE015A-E', category: 'Indoor', series: 'IEE',
    pitch: 1.5, cabW: 960, cabH: 540, depth: 79.5, resW: 640, resH: 360,
    brightnessPeak: null, brightnessReduced: 600, refreshHz: 3840, ovd_m: 5.2,
    weight: 12.4, maxPower: 190, typicalPower: 127, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4FPGS', cabinetPart: 'LH015IEAELS', dataStatus: 'derived' }, // IEA-E. 367/244 W/m². CS4F 동선 컨트롤러
  { id: 'IE020AE', name: 'IE020A-E', category: 'Indoor', series: 'IEE',
    pitch: 2.0, cabW: 960, cabH: 540, depth: 79.5, resW: 480, resH: 270,
    brightnessPeak: null, brightnessReduced: 600, refreshHz: 3840, ovd_m: 7.0,
    weight: 12.4, maxPower: 177, typicalPower: 118, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4FPGS', cabinetPart: 'LH020IEAELS', dataStatus: 'derived' }, // IEA-E. 341/228 W/m², SMD 1515 GOB. CS4F 동선 컨트롤러

  // ---- MM series (MMF, cabinet 600 x 337.5) ----
  // MM009F/012F/015F CONFIRMED via Samsung configurator export (2026-07-24) — 밝기 최대 600 nit.
  //   무게 5.1kg/캐비닛 공통. 최대전력/평균전력(W/캐비닛): 009F 94.6/37, 012F 92.8/41.5, 015F 94.6/37.
  //   (주의: 이전 세일즈 시트의 009F 423.47 W/m^2 → 85.8W 는 오류였고, 공식 export 기준 94.6W 로 정정.)
  { id: 'MM009F', name: 'MM009F', category: 'Indoor', series: 'MM',
    pitch: 0.9375, cabW: 600, cabH: 337.5, depth: 49.8, resW: 640, resH: 360,
    brightnessPeak: 600, brightnessReduced: null, refreshHz: 3840, ovd_m: 3.2,
    weight: 5.1, maxPower: 94.6, typicalPower: 37, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH009MMFRGS', dataStatus: 'verified' }, // export 12x6: 367.2kg/72, 6811.2W, typ 2664W
  { id: 'MM012F', name: 'MM012F', category: 'Indoor', series: 'MM',
    pitch: 1.25, cabW: 600, cabH: 337.5, depth: 49.8, resW: 480, resH: 270,
    brightnessPeak: 600, brightnessReduced: null, refreshHz: 3840, ovd_m: 4.3,
    weight: 5.1, maxPower: 92.8, typicalPower: 41.5, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH012MMFRGS', dataStatus: 'verified' }, // export 8x8: 326.4kg/64, 5939.2W, typ 2656W

  // CONFIRMED via Samsung datasheet QZ-MM015F (The Wall M / MMF), controller CS4B.
  { id: 'MM015F', name: 'MM015F', category: 'Indoor', series: 'MM',
    pitch: 1.5625, cabW: 600, cabH: 337.5, depth: 49.8, resW: 384, resH: 216,
    brightnessPeak: 600, brightnessReduced: null, refreshHz: 3840, ovd_m: 5.4,
    weight: 5.1, maxPower: 94.6, typicalPower: 37, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH015MMFRGS', dataStatus: 'verified' }, // cross-checked vs Samsung export (10x10)

  // ---- MMF-S (MMF 후속, cabinet 600 x 337.5 x 49.5) — MMF 라인(series 'MM')에 포함, 컨트롤러 CS4B(광). ----
  //   2026-09-29 통합 LED 사양서 MMF 시트 '신규 운영'. 밝기 800/600nit(Peak/Max), Visual Refresh 7,680Hz.
  //   같은 시트의 MM009F 전력이 configurator 검증값과 달라 이 시트는 미검증 → 'derived'. ovd_m은 같은 피치 MMF 값.
  { id: 'MM012FS', name: 'MM012F-S', category: 'Indoor', series: 'MM',
    pitch: 1.25, cabW: 600, cabH: 337.5, depth: 49.5, resW: 480, resH: 270,
    brightnessPeak: 800, brightnessReduced: 600, refreshHz: 3840, ovd_m: 4.3,
    weight: 5.2, maxPower: 89, typicalPower: 59, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH012MMFYGS', dataStatus: 'derived' }, // 439/291 W/m²
  { id: 'MM015FS', name: 'MM015F-S', category: 'Indoor', series: 'MM',
    pitch: 1.5625, cabW: 600, cabH: 337.5, depth: 49.5, resW: 384, resH: 216,
    brightnessPeak: 800, brightnessReduced: 600, refreshHz: 3840, ovd_m: 5.4,
    weight: 5.2, maxPower: 83, typicalPower: 55, maxInputW: 3840, maxInputH: 2160,
    sbox: 'SBB-CS4BPGS', cabinetPart: 'LH015MMFYGS', dataStatus: 'derived' }, // 408/271 W/m²

  // (Outdoor IB series removed 2026-07-24 — discontinued by Samsung.)
];
