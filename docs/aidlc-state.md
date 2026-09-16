# AI-DLC State Tracking

## Project Information

- **Project Name**: LED Wall Configurator (사내 캐비닛 자동 배치·스펙 산출 도구)
- **Project Type**: Greenfield
- **Start Date**: 2026-07-23
- **Current Phase**: INCEPTION
- **Current Stage**: Requirements Analysis 완료 · Application Design 진행(프로토타입 검증) · Units Generation 승인 대기
- **Project Owner**: 김현규 (서울영상테크 SI사업본부)
- **Last Updated**: 2026-09-16

## Objectives and Scope

### Objective

사용자가 설치 공간(가로·세로)만 입력하면 LED 캐비닛 모델별로 공간을 최대한 채운 배열을 자동 계산하고, 크기·해상도·무게·밝기·소비전력·수량(BOM)을 산출·비교하는 사내 견적/설계 보조 웹 도구. 삼성 공식 configurator의 핵심 계산 흐름을 참조하되 사내 다모델 비교에 최적화한다.

### In Scope

- 공간 치수 입력 → 모델별 최대 충진(cols/rows) 자동 계산
- 산출 지표: 실제 크기, 총 해상도·화소수, 대각(inch), 면적(m²), 총 중량, 밝기, 최대·평균 소비전력, 발열(BTU), 여백(dead space)
- 모델별 비교 테이블(같은 공간에 대해 전 모델 동시 비교)
- 캐비닛 배열 시각 미리보기 (정면 뷰 + 3D 투시 뷰)
- 3D 공간 렌더 — 공간 타입 프리셋(회의실·강의실·소/중/대강당·상황실)과 가구 옵션으로 설치 이미지 생성, PNG 내보내기 (DEC-056 → DEC-059 비주얼 개선 → DEC-060 미세 보정, 2026-09-16)
- 3D = **Corporate AV Space Visualizer** — 고객 제안서에 쓸 수 있는 기업 AV 공간 시각화. 용도(roomType, 계산)와 **디자인 프리셋(design, 표현)을 분리**해 대기업 회의실 · 임원 회의실 · 대회의실 · 상황실을 서로 다른 공간으로 만든다 (DEC-087, 2026-09-16). 사진 수준 렌더링이 아니라 Semi-realistic 건축 시각화가 목표
- 모델 스펙 라이브러리 편집(CRUD) 및 JSON import/export
- BOM 산출(캐비닛 + 스페어, S-Box, Jig 등 부자재)
- 인쇄/PDF·엑셀 내보내기

### Out of Scope

- 삼성 공식 configurator의 대체 또는 재배포(본 도구는 사내 보조용, 공식 견적은 삼성·설치 파트너 확인 필요)
- 실시간 삼성 가격/재고/납기 연동
- 곡면(Curved) 배열 정밀 계산 — 1차 범위 제외, 후속 검토
- 콘텐츠 시뮬레이션, 조도/시야각 시뮬레이션
- 사진 수준의 사실적 렌더링(재질·조명·그림자 시뮬레이션) — 현재 3D 뷰는 도형 기반 건축 투시도

## Execution Plan Summary

- **Stages to Execute**: Requirements Analysis → User Stories → Workflow Planning → Application Design → Units Generation → (Construction) Functional Design → Code Generation → Build & Test → (Operations) 사내 배포
- **Stages to Skip**: Reverse Engineering (N/A — Greenfield, 기존 코드 없음). Infrastructure Design은 경량화(단일 HTML/서버리스)로 축소 수행.
- **Units of Work**:
  - **U1** — 충진·스펙 계산 엔진(순수 함수 + 단위 테스트)
  - **U2** — 모델 라이브러리 관리(CRUD, JSON import/export, 스펙 정합성 검증)
  - **U3** — UI(입력폼, 배열 미리보기, 산출 readout, 모델별 비교표)
  - **U4** — 출력(BOM 산출, 인쇄/PDF, 엑셀 내보내기)

## Workspace State

- **Existing Code**: 프로토타입 1종 — `led-configurator.html` (단일 파일, vanilla JS)
- **Reverse Engineering Needed**: No (Greenfield)
- **Programming Languages**: HTML, CSS, JavaScript (vanilla, 빌드리스)
- **Build System**: 없음(단일 HTML). 규모 확대 시 Vite 검토
- **Project Structure**: 확인 필요 — 저장소(Git) 전환 여부 미정
- **Workspace Root**: 확인 필요
- **Application Code Directory**: 확인 필요 (제안: `/src`)
- **Documentation Directory**: `/docs` (aidlc-state.md, audit.md, SPEC.md)

## Confirmed Technology Stack

- **Frontend**: HTML + CSS + Vanilla JS (단일 파일, 외부 의존성 0)
- **Backend**: N/A — 클라이언트 전용(1차)
- **Data Store**: JSON 파일(모델 라이브러리 import/export). 브라우저 스토리지 미사용
- **Authentication**: N/A (사내 오프라인 파일 배포 전제)
- **Integration / Real-time**: N/A
- **Testing**: Node 기반 순수함수 단위 테스트(계산 로직) — 자동화 확정 예정
- **Deployment**: 정적 파일 사내 공유 또는 사내 웹 호스팅 — 확인 필요

## Code Location Rules

- **Application Code**: `/src` (또는 단일 `index.html`)
- **Documentation**: `/docs`
- **Tests**: `/tests`
- **Generated Artifacts**: `/dist` 또는 `/outputs`
- **Structure Rules**: 계산 엔진(engine)·모델 데이터(JSON)·UI를 분리한다. 스펙 데이터는 코드에 하드코딩하지 않는다.

## Constraints and Assumptions

### Constraints

- 삼성 실제 스펙은 공식 데이터시트/공식 configurator 확인값으로만 확정한다(임의 추정 금지).
- 본 도구는 사내 견적/설계 보조용이며, 공식 견적은 삼성 또는 설치 파트너 확인이 필요하다(삼성 도구 고지사항과 동일).
- 개인정보·비밀정보(비밀번호·토큰·가격계약 등)는 저장하지 않는다.

### Assumptions

- 1차 대상은 평면(Flat) 캐비닛형(The Wall MP/IW, IF/IE 시리즈 등).
- 최대 충진 = 각 축 floor 배수. **단, 삼성 Fit-to-wall은 세로 축에서 더 보수적으로 관측됨 → 규칙 확인 필요(Q1).**
- 평균 소비전력 ≈ 최대 × **0.53** (삼성 MP012F 실측 기준; 기존 0.35 가정 폐기).
- 스페어 캐비닛 ≈ 총량의 약 10%(올림). — 실제 규칙 확인 필요.

## Deployment / Server Environment

- **Purpose**: 사내 견적/설계 보조 도구 배포
- **Environment Name**: 확인 필요
- **Status**: 미구축(프로토타입 로컬 실행 단계)
- **Compute Specification**: N/A (클라이언트 브라우저에서 실행)
- **Operating System**: N/A
- **Network**: 사내(오프라인 파일 실행 가능)
- **Runtime / Middleware**: 웹 브라우저
- **Deployment Method**: 정적 파일 배포(사내 공유 폴더 또는 사내 웹)
- **Backup / Recovery**: 모델 라이브러리 JSON을 Git으로 버전 관리
- **Monitoring / Logging**: N/A (1차)
- **Open Questions**: 사내 웹 호스팅 vs 파일 배포 방식 결정 필요

## Extension Configuration

| Extension | Enabled | Mode | Decided At | Notes |
|---|---|---|---|---|
| Reverse Engineering | No | N/A | INCEPTION | Greenfield, 기존 코드 없음 |
| PDF / Excel Export | Yes | 산출물 | CONSTRUCTION(예정) | 삼성 도구 동일 기능 참조 |
| Model Data Import | Yes | JSON | CONSTRUCTION(예정) | 데이터시트 실측값 반영용 |

## Stage Progress

### INCEPTION PHASE

- [x] Workspace Detection
- [ ] Reverse Engineering  <!-- N/A — Greenfield -->
- [x] Requirements Analysis
- [ ] User Stories
- [ ] Workflow Planning
- [ ] Application Design  <!-- 프로토타입으로 부분 검증, 미확정 -->
- [ ] Units Generation  <!-- U1~U4 정의됨, 승인 대기 -->

### CONSTRUCTION PHASE

| Unit | Functional Design | NFR Requirements | NFR Design | Infrastructure | Code Generation | Build & Test |
|---|---|---|---|---|---|---|
| U1 계산 엔진 | Not Started | Not Started | N/A | N/A | In Progress | Not Started |
| U2 모델 라이브러리 | Not Started | Not Started | N/A | N/A | In Progress | Not Started |
| U3 UI | Not Started | Not Started | N/A | N/A | In Progress | Not Started |
| U4 출력/BOM | Not Started | Not Started | N/A | N/A | Not Started | Not Started |

- [ ] Functional Design
- [ ] NFR Requirements
- [ ] NFR Design
- [ ] Infrastructure Design
- [ ] Code Generation  <!-- 프로토타입 v0.1 존재, 정식 착수 전 -->
- [ ] Build and Test

### OPERATIONS PHASE

- [ ] Deployment
- [ ] Monitoring  <!-- N/A 예정 (클라이언트 전용) -->
- [ ] Backup and Recovery
- [ ] Operations Handover

## Current Verification Status

- **Build**: N/A (빌드리스 단일 HTML)
- **Automated Tests**: `node:test` 자동화 **392/392 통과(2026-09-16)** — 가구 에셋 카탈로그·재질 라이브러리·방 껍데기·조명 회귀 포함(`tests/furniture-assets.test.js`, `tests/materials.test.js`, `tests/gl-model.test.js`, `tests/room-design.test.js`). S-Box 영역 타일(가로·세로)·이중화·평균전력·null 전파·16:9 최대해상도 포함.
- **Integration Tests**: N/A
- **Security Checks**: 외부 의존성 0, 개인정보 미수집 → 저위험. 정식 점검 미수행
- **Acceptance Review**: 프로토타입 v0.1 오너 리뷰 대기

## Risks and Open Items

| ID | Type | Description | Owner | Due Date | Status | Resolution Condition |
|---|---|---|---|---|---|---|
| Q1 | Question | Fit-to-wall 세로 충진 규칙이 순수 floor와 다름(관측: 3.4m 벽에 6행=2.721m, 7행=3.175m도 물리적으로 가능). 삼성 클리어런스/여백 규칙 확인 필요 | 김현규 | 확인 필요 | Open | 세로 충진 규칙을 SPEC.md에 문서화 |
| R1 | Risk | 스펙 데이터 정확도 — 임의값 사용 시 견적 오류 위험 | 김현규 | 확인 필요 | Open | 전 모델 데이터시트 실측값 확정 |
| Q2 | Question | 대상 시리즈 범위(Flat 전용 vs Curved 포함) | 김현규 | 확인 필요 | Open | 범위 확정 |
| D1 | Dependency | 삼성 공식 스펙 시트/부자재 규칙(스페어율, S-Box 대수 규칙) 확보 | 김현규 | 확인 필요 | Partly Resolved | S-Box 대수 규칙 영역 타일 방식으로 확정(2026-07-24, DEC-006 — 데이터시트 스터디 + 삼성 검증). 스페어율·Jig 규칙은 미확정 |

## Next Actions

| Priority | Action | Owner | Due Date | Completion Criteria |
|---|---|---|---|---|
| P1 | SPEC.md 확정(계산 공식·데이터 스키마·엣지케이스·세로 충진 규칙) | 김현규 / AI | 확인 필요 | 오너 승인 |
| P2 | 프로토타입 스펙 데이터를 실측값으로 교체 + 평균전력 계수 0.53 반영 | AI | 확인 필요 | MP012F/6×3.4m 결과가 삼성 도구와 일치 |
| P3 | 계산 엔진 순수함수 분리 + 자동 테스트 작성 | AI | 확인 필요 | 테스트 전부 통과 |
| P4 | BOM 규칙(스페어율·S-Box 대수·회로 계산) 정의 | 김현규 / AI | 확인 필요 | BOM 산출이 삼성 도구와 일치 |
| P5 | (로드맵, DEC-017) 연출 시뮬레이션 + 프로세서 자동 추천 + 견적 연동. 착수 전 SPEC 필요: ① 프로세서 제품별 최대 레이어·분할·입력해상도 표(오너 제공 예정) ② 분할 창 시인성 하한(≈65인치 대각) ③ 추천 규칙 | 김현규 / AI | 오너 데이터 대기 | 프로세서 표 확보 → 추천 엔진 규칙 SPEC 승인 |
| P5-1 | **Video Processor Selector 1차(엔진+데이터+테스트)** — DEC-018. `processors.js`·`engine.js`(processorRequirements/validateProcessor/validateOutputCardLayers/rankProcessors)·`tests/processor.test.js` | AI | **완료(2026-09-12)** | 87/87 테스트 통과, 화면 무변경 |
| P5-2 | Video Processor Selector 2차 — '05 비디오 프로세서' UI(요구 입력 + PASS/CONDITIONAL/FAIL·등급·근거 표시). 기존 id/data-* 불변, 05 신설·06/07 재번호 | AI | **완료(2026-09-12, v169)** | 헤드리스 렌더 확인(제품 20개, 권장 6·조건부 14), 기존 id 보존 |
| P5-3 | 미확인 프로세서 스펙(NovaStar H·Colorlight PDF) 확정 → `verification.status='official'` 갱신 | 김현규 / AI | 진행 중 | **1차 반영 완료(2026-09-12, v170, DEC-019):** NovaStar H 7모델·U6 Max official, U9/U15 partial_official. 남은 확인: NovaStar 독립입력·4K출력 수, U9/U15 I/O·per-board |
| P5-4 | 05 화면에 레이어 배치(카드별) 입력 추가 — NovaStar/Universe 카드 예산·cross-output 정밀 판정용. **엔진 지원 완료(DEC-021, `perOutputCardDemand` 배열)**, UI 미노출 | 김현규 / AI | 검토 | 이사 요청 시 |
| P5-5 | 05 화면 제조사별 의미·판정 이유 표시(자료문서 §24·§25) — 노바 "카드당 4×4K", X100 "독립4K 8/8·윈도우 16/64", AW "믹싱/분할" 등. DEC-021 2차 | AI | 진행 예정 | 이사 확인 |
| P5-6 | **프로세서 코드 3분할** — `processor-data.js`(데이터)·`processor-limits.js`(용량·한계)·`processor-validator.js`(판정)로 분리, engine.js는 LED 코어 전용. DEC-030 | AI | **완료(2026-09-12, v183)** | 무동작-변경 리팩터, 115/115 통과·헤드리스 로드 무오류 |
| P8-1 | **Corporate AV Space Visualizer PHASE 1-a — 디자인 프리셋 골격** — 신규 `src/room-design.js`에 디자인 4종 + `layoutVariant` 선언. 화면 무변경, 기존 파일 무수정. DEC-087 | AI | **완료(2026-09-16)** | 392/392 통과(기존 계산 무변경·불변 데이터 테스트 포함), 브라우저에서 파일 미로드·장면 동일 확인 |
| P8-2 | PHASE 1-b — 팔레트 통합 + 재질 7종 → 12종 확장(CarpetTileDark·NeutralLaminate·DarkGraphite·BlackEquipment·GlassPartition·AcousticPanel) + 부품별 마감 예외표 | AI | **오너 승인 대기** | 기존 7종 수치 불변, 화면 무변경 |
| P8-3 | PHASE 1-c — `assetFor(item, design)` 경로 + 디자인 선택 UI. 예전 세션은 corporateMeeting으로 복원 | AI | 대기 | 디자인 선택 칸 외 화면 무변경 |
| P8-4 | PHASE 1-d — 카메라 `rear`(대표 좌석 뒤 제안 렌더 시점) 추가 + 디자인별 화각(회의실 40~46°, 임원 34~40°) | AI | 대기 | 기존 시점 6종 무회귀 |
| P8-5 | PHASE 2 — Corporate Meeting Room 완성(Aeron 계열 메시 회전의자·얇은 상판 테이블·팔레트·조명·Interior/Rear 카메라). 중단된 의자 작업이 여기로 흡수됨 | AI | 대기 | 치수 범위 단위 테스트 + 3시점 브라우저 검증 |
| P8-6 | PHASE 3~5 — Executive Boardroom → Large Conference Room → Operation/Control Room | AI | 대기 | 단계별 오너 승인 |
| P7-3 | **3D 오너 요청 기능 6건** — 객석 착석 인원 + LED 시야각 시뮬 · 3D LED 화면 이미지 · 단차 시작 줄 + 상황실 단차 · 평면도 원근 + 화각 조절 · LED 옆 보조 모니터 · 표현 방식(심플/실사). DEC-079~084 | AI | **완료(2026-09-16, v389)** | 371/371 통과, 기능별 브라우저 검증 |
| P7-2 | **3D Interior Realism STEP 2~8 + 최종 점검** — 방 껍데기(걸레받이·천장·바닥/격자 분리) · 재질 7종 · 조명/접촉 그림자 · 회의실(AV 수납장) · 강당(무대 디테일) · 강의실(2인용 테이블·강사 영역) · 아이디에이션 공간 신설. DEC-071~078 | AI | **완료(2026-09-16, v383)** | 338/338 통과, 브라우저 27항목 전수 통과, 계산·정면 뷰 무회귀 |
| P7-1 | **3D Interior Realism STEP 1 — 가구 에셋 시스템** — 형상 정의를 순수 모듈 `src/furniture-assets.js`로 분리, V1 자산 5종(강당 객석·회의 회전의자·회의 테이블·강의 책상·강의 의자) 실제 비율 적용. DEC-070 | AI | **완료(2026-09-16, v376)** | 308/308 통과. 384석에서 그리기 호출 28개 고정, 배치 계산 무변경 |
| P6-1 | **03 미리보기 CSS 3D 원근** — 방 5면 1점 투시·바닥 그리드·LED월·신호·사람·눈높이선, 2D 치수 오버레이(값 유지·동적 투영), 표시 토글 4개. DEC-033 | 김현규(디자인)/AI | **완료(2026-09-12, v186)** | 이사 디자인 핸드오프 반영. 다중 크기·토글·FHD 헤드리스 검증, 115/115 |

## Notes

삼성 공식 도구(display-configurator.biz.samsung.com) 직접 검증(2026-07-23): MP012F(P1.26, 캐비닛 806.4×453.6×49.4mm, 9.2kg, 최대 146W/평균 77W, 640×360, 1800/1000nit, 3840Hz, OVD 4.4m)을 6×3.4m 벽에 Fit-to-wall → **7×6=42캐비닛**, 5.644×2.721m, 15.362m², 246.679", 386.4kg, 해상도 4480×2160, 최대 6132W/평균 3234W, 발열 최대 20916/평균 11046 BTU. BOM: 캐비닛 42+스페어 4=46(LH012MPFAAA), S-Box SBB-CS4BPGS 2+스페어 1, Jig CY-WJFPWP 3. 프로토타입 v0.1은 동일 조건에서 7×7로 계산(세로 규칙 차이) → P2/Q1로 조정 예정.

**2026-07-24 (DEC-006) 반영:** S-Box 데이터시트 스터디(CS4B/SNOWAAE 매뉴얼)로 박스당 최대 4K 확인 후 산출 규칙을 **영역 타일** `ceil(resW/3840)×ceil(resH/2160)`(이중화 ×2)로 확정. SBB-CS4B=SBB-CS4BPGS(동일 제품)·SBB-SNOWAAE 공통 4K(SNOWAAE 8K는 보수 운용으로 4K 제한). CS4B 호환 라인 IFR·IEA에 컨트롤러 용량 반영, MMF 등은 미상(null 유지). Outdoor(IB) 시리즈 단종으로 모델 라이브러리에서 삭제. 슈퍼와이드(>16:9) 배열에 16:9 최대 콘텐츠 해상도 산출 추가. `tests/engine.test.js` 10→14종 확장, 전부 통과. 삼성 42캐비닛(4480×2160)→2대 검증 유지.

**2026-07-24 (DEC-008·009·010) 반영:** (1) 밝기 표시를 peak → **"최대"(운영 최대)**로 변경 — `brightnessMax = brightnessReduced ?? brightnessPeak`(예: MPF 1000/IFR 800/IEA 500/MMF 600 nit). (2) 기본 노출 피치를 **P0.8~P1.8**로 한정(삼성 판매 정책) — IF020R(2.0)·IF025R/IE025A(2.5)·IF040R(4.0)은 데이터 보존한 채 기본 숨김. (3) MMF에 **MM009F(P0.9375, 640×360)·MM012F(P1.25, 480×270)** 추가 — 삼성 MMF 세일즈 시트(slide 13) 기준. 밝기 최대 600 nit, 최대전력 85.8W·92.7W(=W/㎡ × 캐비닛 0.2025㎡, MM015F 467→94.6 동일 산식 재현), 부품 LH009MMFRGS·LH012MMFRGS. weight/typical은 시트에 없어 null(데이터시트 필요). `tests/engine.test.js` 14→16종, 전부 통과.
