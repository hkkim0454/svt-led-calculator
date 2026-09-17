# AI-DLC State Tracking

## Project Information

- **Project Name**: LED Wall Configurator (사내 캐비닛 자동 배치·스펙 산출 도구)
- **Project Type**: Greenfield
- **Start Date**: 2026-07-23
- **Current Phase**: INCEPTION
- **Current Stage**: Requirements Analysis 완료 · Application Design 진행(프로토타입 검증) · Units Generation 승인 대기
- **Project Owner**: 김현규 (서울영상테크 SI사업본부)
- **Last Updated**: 2026-09-17

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
- **Automated Tests**: `node:test` 자동화 **447/447 통과(2026-09-16)** — 가구 에셋 카탈로그·재질 라이브러리·방 껍데기·조명 회귀 포함(`tests/furniture-assets.test.js`, `tests/materials.test.js`, `tests/gl-model.test.js`, `tests/room-design.test.js`). S-Box 영역 타일(가로·세로)·이중화·평균전력·null 전파·16:9 최대해상도 포함.
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
| P8-1.1 | **PHASE 1-a.1 — 디자인 fallback 격리** — 용도별 기본 디자인 표(`DEFAULT_DESIGN_BY_ROOM_TYPE`) 도입, 비지원 용도는 '디자인 없음'(`NEUTRAL_DESIGN`), 전역 `DEFAULT_DESIGN` 삭제. DEC-088 | AI | **완료(2026-09-16)** | 393/393 통과, 회귀 테스트 역검증(옛 동작 복원 시 3건 실패), 화면 무변경 |
| P8-2 | **PHASE 1-b — 재질 아키텍처 기반** — 기존 7종 보존 + 신규 6종 = 정식 13종, 의미 별칭(rename 금지), `PART_FINISH` 레지스트리, 역할 어휘. 화면 미연결. DEC-089 | AI | **완료(2026-09-16)** | 403/403 통과, 5개 공간 픽셀 차이 0, 회귀 테스트 역검증 |
| P8-2.1 | **PHASE 1-b.1 — 재질 어댑터 계약** — 어댑터가 별칭을 정식 id로 해석(캐시 열쇠 포함), 재질 값 ↔ 물체 성질 분리(`materialParams`/`renderSemantics`), `paintedWallWhite` 별칭 추가, 3D 모듈 캐시 버전 v391→v399 정렬. DEC-090 | AI | **완료(2026-09-16)** | 408/408 통과, 5개 공간 픽셀 차이 0, 별칭 캐시 분리 역검증 |
| P8-3 | **PHASE 1-c — 가구 계약 기반** — 신규 `src/furniture-contracts.js`에 기업 AV 가구 13종 명세. 런타임 카탈로그와 완전 분리, 의자 4종 독립, 마감 계약 일치. DEC-091 | AI | **완료(2026-09-16)** | 425/425 통과, 5개 공간 픽셀 차이 0, 역검증 3종 |
| P8-3.1 | **PHASE 1-d — 디자인 인지 가구 라우팅** — 신규 `src/furniture-routing.js`. 요청 ↔ 실제를 분리, 갈래 안전 대체, 구현 여부는 런타임만 판정. 렌더러 미연결. DEC-092 | AI | **완료(2026-09-16)** | 439/439 통과, 5개 공간 픽셀 차이 0, 역검증 4종 |
| P8-3.2 | 디자인 선택 UI + 렌더러 라우터 연결 | AI | 대기 | 디자인 선택 칸 외 화면 무변경 |
| P8-4 | PHASE 1-d — 카메라 `rear`(대표 좌석 뒤 제안 렌더 시점) 추가 + 디자인별 화각(회의실 40~46°, 임원 34~40°) | AI | 대기 | 기존 시점 6종 무회귀 |
| P8-5 | **PHASE 2-a — 대기업 회의용 인체공학 의자** — 5발 캐스터 받침·휜 메시 등받이·어깨 가로대. 런타임 자산 등록 + 라우터 실연결(라우터 코드 수정 0). DEC-093 | AI | **완료(2026-09-16, v402)** | 447/447 통과, 회의실만 픽셀 변경·나머지 4개 공간 0, 그리기 호출 36→39 |
| P8-5.1 | **PHASE 2-b — 대기업 회의 테이블** — 얇은 상판 25mm + T형 받침 + 보트형 6% 부풀림. 받침은 좌석 간격(700)을 피해 350의 홀수 배수에만. 계약 범위 밖(작은 조각·원형·U자형)은 기존 테이블이 맡는다. 라우터 코드 수정 0. DEC-094 | AI | **완료(2026-09-16, v404)** | 459/459 통과, 회의실만 픽셀 변경(테이블 자리에 한정)·나머지 4개 공간 0, 그리기 호출 39→39 |
| P8-5.1a | **PHASE 2-b.1 — 보트형 부풀림 6% → 8%** — 멀리서 사각형으로 읽히던 문제 해결. 공식·끝단 폭·받침·마감 전부 그대로, 비율 상수 하나만 변경. DEC-095 | AI | **완료(2026-09-16, v405)** | 459/459 통과, 회의실 321px만 변경·나머지 4개 공간 0, 삼각형·그리기 호출 변화 0 |
| P8-5.1b | **PHASE 2-c — 회의실 공간 마감** — 바닥(카펫 중간 회색)·벽(따뜻한 오프화이트)·AV 수납장(다크 AV 장비). 정식 재질 13종 그대로 두고 **색만 디자인이 정한다**(새 순수 모듈 `design-finish.js`). 러그도 바닥 계열로 맞춤. 조명·노출·카메라는 그대로. DEC-096 | AI | **완료(2026-09-16, v411)** | 473/473 통과, 회의실만 픽셀 변경·나머지 4개 공간 0, 삼각형·그리기 호출 변화 0, 물체 형상·좌표 변화 0건 |
| P8-5.1c | **PHASE 2-d.1 — 회의실 조명·노출·그림자** — 상판이 하얗게 날아가던 문제 해결. 천장등을 가장 많이 줄이고(위를 보는 면만 때린다) 보조광만 올려(세워진 면을 밝힌다) 벽을 지켰다. 전역 노출·톤매핑·기준 조명값은 손대지 않음. 조명 개수 5개 그대로. 카메라 완전 동결. DEC-097 | AI | **완료(2026-09-16, v412)** | 487/487 통과, 상판 251.9→227.4(포화 해소·따뜻한 색 복원), 회의실만 픽셀 변경·나머지 4개 공간 0, 물체·카메라·재질 동결 검증 변화 0건, 성능 동일 |
| P8-5.2 | **PHASE 2-d.2 — 카메라 프리셋 · Interior 프레이밍** — 기준을 LED에서 방으로. 뒷벽 앞 눈높이 1.65m에서 LED 중심보다 낮은 곳을 본다. OrbitControls가 카메라를 끌어올리던 구조적 제약을 찾아 거리 비례 높이차로 해결. 아이소·평면도·정면은 투영행렬까지 동일. Rear View는 계산만 준비(UI 없음). DEC-098 | AI | **완료(2026-09-16, v413)** | 502/502 통과, 테이블 화면 점유 10~23%·LED 프레임 안 100%, 다른 4개 공간 카메라·픽셀 완전 동일, 물체·재질 변화 0건 |
| P8-5.3 | **PHASE 2-e — 대기업 회의실 V1 최종 검수(Release Gate)** — 방 3종 + 와이드 LED · 시점 5종 캡처 12장을 오너 제공 실제 제안 렌더 기준으로 대조. **P0 0건 · P1 0건 → 코드 수정 없음**(문서만). DEC-099 | AI | **APPROVED(2026-09-17, v413)** | 실내 시점에서 LED가 언제나 최대 요소(37.8~51.9%), 날아간 픽셀 0%, 동결 지표 전부 일치. **PHASE 3 임원 회의실의 시각 기준선으로 사용 가능** |
| P9-1 | **PHASE 3-a — 임원 하이백 의자** — 헤드레스트 + 허리 470→어깨 340으로 연속으로 좁아지는 등받이(새 도형 `taperedBack`). 회의용 의자보다 200.9mm 높다. 새 정식 재질 없음(헤드레스트는 방석 마감 별칭). 라우터 코드 수정 0. DEC-100 | AI | **완료(2026-09-17, v414)** | 515/515 통과, **대기업 회의실 pixel diff 0**, 좌석 20개까지 그리기 호출 증가 없음, boardroomTable 은 아직 미구현 |
| P9-2 | **PHASE 3-b — 임원 회의실 대형 U 테이블** — 배치가 주는 직사각형 **세 조각**을 그대로 세우지 않고, 합쳐진 테두리만 읽어 **이음매 없는 U자 한 덩어리**로 만든다(새 도형 `uTop`). 앞 끝 반지름 450 = 띠 폭의 절반 → 날개 끝이 정확한 반원. 안쪽 오목 모서리 300으로 메워 '세 장을 붙인 느낌'을 없앤다. 하부는 짙은 그라파이트 **판형 블레이드**(무릎에서 570mm 안쪽). 배치·의자는 한 줄도 건드리지 않았다. DEC-101 | AI | **완료(2026-09-17, v415)** | 542/542 통과, **대기업 회의실 20컷 pixel diff 0**(U자 배치 포함), 상판 실측 8100×4500×30·윗면 745로 계약·배치와 정확히 일치, 그리기 호출 51→48 |
| P9-3 | **PHASE 3-c — 임원 회의실 마감(벽·바닥·테이블·AV 수납장)** — '임원실이니 어둡게'가 아니라 **더 밝고 더 정제되게**. 새 팔레트 `executiveBright`가 대기업 팔레트와 같은 자리끼리 한 단씩만 움직인다(같은 회사의 윗층). 흰 수납장 → 짙은 차콜 AV 가구, 푸른 회색 바닥 → 중성 밝은 회색, 포인트 벽은 색이 아니라 **질감**(흡음 패널)으로만. 정식 재질 13종 유지. DEC-102 | AI | **완료(2026-09-17, v416)** | 564/564 통과, **대기업 회의실 20컷 pixel diff 0**, 삼각형·Mesh·그리기 호출·셰이더 수 전부 불변(순수 마감 패스), 상판 날아간 픽셀 0% |
| P9-4 | **PHASE 3-d.1 — 임원 회의실 조명·그림자** — 문제는 밝기가 아니라 **면의 순서**였다(바닥이 벽보다 밝았다). 천장등을 줄이고(0.30) 보조광을 올려(2.00) 바닥만 내리고 벽은 올린다. 주광 자리는 옮기면 반대로 움직여 **정하지 않았다**(실측 근거). 재질·형상·화각·전역 노출 전부 동결. DEC-103 | AI | **완료(2026-09-17, v417)** | 582/582 통과, 정면벽 214→220 · 바닥 215→200(벽이 20 밝다) · 옆벽 178→196, 날아감·뭉갬 0%, 삼각형·Mesh·호출·셰이더 전부 불변, 대기업 20컷 pixel diff 0 |
| P9-5 | **PHASE 3-d.2 — 임원 회의실 화각·제안서 구도** — 문제는 '카메라가 높다'가 아니라 **화면의 남는 세로를 위로 버리고 있었다**는 것. 시선을 '화면 위 가장자리가 천장선에 오도록' 계산해(aim frameTop) 그 여유를 바닥·테이블로 보낸다. 코너 시점이 U자 담당(시선을 카메라 쪽으로 당겨 의자를 남긴다). 계산기는 대기업과 **하나**를 공유하고 기준값·상한만 다르다. DEC-104 | AI | **완료(2026-09-17, v418)** | 600/600 통과, 실내 테이블 0%→13.1%·빈 공간 80%→0.9%, 코너 테이블 20.2%·의자 3.8%, 방 3종 전부 LED 8/8·화각 ≤43°, 조작기 상승 0, 대기업 20컷·임원 아이소 pixel diff 0 |
| P9-6 | **PHASE 3-e — 임원 회의실 V1 최종 검수(Release Gate)** — 방 3종 × 시점 6종 18컷 + 근접·와이드 LED·대기업 비교를 픽셀 귀속·투영 bbox·밝기 분포로 판정. **P0 0건 · P1 0건 → 코드 수정 없음**(문서만). 알려진 한계 3건(중형 실내 U자 가독성 · 와이드 LED 44° 상한 · 사내 가격표 404)은 설계된 동작으로 문서화. DEC-105 | AI | **RELEASE READY(2026-09-17, v418)** | JS 오류 0 · 날아감/뭉갬 0.0% · 방 밖 가구 0건 · 의자↔받침 겹침 0건 · 모든 시점 LED 8/8 · 화각 ≤43° · 600/600 통과 · 측정 잡음 0. **Executive Boardroom V1 동결** |
| P10-1 | **PHASE 4-a — 대회의실용 인체공학 의자** — 셋 중 가장 낮고 좁되 **축소판이 아니다**: 뒤판·어깨 가로대 없이 세로 레일 두 개가 메시를 잡는다. 둥글림이 밀어내는 양을 미리 빼 화면 실측이 계약 안에 들어오게 했다(임원 의자의 겹침 P2를 되풀이하지 않는다). 라우터 코드 수정 0. DEC-106 | AI | **완료(2026-09-17, v419)** | 617/617 통과, 실측 623.3×596.2×1006.7(계약 650×660×1010 안쪽), 좌석 간격 여유 76.7mm·겹침 0건, 좌석 8~40에서 InstancedMesh 13 고정, 의자당 삼각형 3,720(최소), **대기업 20컷·임원 5컷 pixel diff 0** |
| P10-2 | **PHASE 4-b — 대회의실 대형 U 테이블 + 20석 벽 해제** — 20석에서 막히던 원인은 도형이 아니라 **배치의 크기 상한 두 숫자**(9,000 × 4,500)였다. 전역으로 올리면 임원 테이블이 같이 바뀌므로 **디자인별 상한표**를 두고 대회의실만 12,000 × 6,500으로 올렸다. 테이블은 임원 것의 확대판이 아니다 — 얇은 상판(25) · 각진 U(앞 180·안쪽 120·뒤 60) · **가는 기둥 + ㄷ자 긴 보**. U자 테두리 판독은 `uTableBounds` 하나로 합쳤고 라우터 수정 0. DEC-107 | AI | **완료(2026-09-17, v421)** | 651/651 통과, 정원 22/27/30석(소·중·대), 상판 윗면 740.00·밑면 715.00·접지 0.00 실측, 의자↔받침 겹침 0건(최소 여유 275mm), 좌석 18~30에서 InstancedMesh 20 고정, **대기업 20컷·임원 5컷·다섯 공간 pixel diff 0** |
| P10-3 | **PHASE 4-c — 개인 모니터·중앙 프롬프터** — 크기를 지어내지 않았다: 계약의 인치만 받아 기존 `panelSize()` 하나로 환산한다(LED 옆 모니터와 같은 함수). 자리는 **의자에서 파생**한다 — 의자가 보는 방향으로 상판 안쪽 250mm에 놓고 화면이 그 의자를 되바라본다(세 변 방향이 저절로 갈린다). 프롬프터는 U자 가운데 **바닥에 서는 기둥형**이고, 꼭대기 952mm로 LED 시선을 막지 않는다. 새 순수 모듈 `conference-av.js`. 라우터 수정 0. DEC-108 | AI | **완료(2026-09-17, v422)** | 680/680 통과, 18/24/30석 = 모니터 18/24/30대 + 프롬프터 1대, 받침 밑면 740.00·프롬프터 접지 0.00 실측, 이웃 여유 140.7mm·겹침 0건, 상판 밖으로 나간 부품 0개, 좌석이 늘어도 InstancedMesh 28 고정, **대기업 20컷·임원 5컷·다섯 공간 pixel diff 0** |
| P10-4 | **PHASE 4-d.1 — 대회의실 전용 마감** — 새 틀을 만들지 않고 팔레트 `conferenceBright` 한 벌만 더했다. 핵심 결정은 색이 아니라 **부품 이름 분리**(`corporateTop`·`tableBase` → `conferenceTop`·`conferenceBase`) — 안 나누면 대회의실을 꾸미는 순간 대기업 테이블·강의용 책상이 같이 바뀐다. 색은 **순서**로 정했다: 벽 > 상판 > 바닥. AV 마감 경로(`avFinishForDesign`)를 새로 열어 모니터·프롬프터를 그 공간에서만 갈아 끼운다. 정식 재질 13종 유지(별칭 `lightAsh` 하나만 추가). DEC-109 | AI | **완료(2026-09-17, v423)** | 700/700 통과, 구조(InstancedMesh 28·Mesh 14·삼각형 134,910·호출 46·재질 24) **마감 전후 동일**, 수납장 204.8→46.8·테이블 하부 117.5→53.8·바닥 235.8→210.6, LED 37.5 > 모니터 화면 36.5(우선순위 유지), 날아감·뭉갬 0.0%, **대기업 20컷·임원 5컷·다섯 공간 pixel diff 0** |
| P10-5 | **테이블 방향 옵션(가로/세로) — 대회의실 전용**(오너 요청, PHASE 번호 아님). 숫자를 먼저 재 보니 '세로 U자 + 앞날개 비움'은 좌석이 늘지 않아(22→21) **역할을 나눴다**: U자 세로 = 세로형 도면 대응·중앙 동선/AV 공간, 보트·사각형 세로 = 좌석 효율(20→26석). U자는 도형을 새로 깎지 않고 조각을 −90° 돌려 **기존 판독기**에 넣고 덩어리만 돌려 세운다. 모니터는 의자 방향에서 파생돼 코드 없이 따라 돈다. 옵션은 화면 노출·적용 **이중으로** 대회의실에만 건다. 자동은 미포함. DEC-110 | AI | **완료(2026-09-17, v424)** | 714/714 통과, 옛 구현과 **67,425 조합 대조 차이 0**, 대기업 20컷·임원 5컷·다섯 공간 pixel diff 0, 세로 U자 23석(앞날개 0석)·보트 세로 26석 |
| P10-6 | **PHASE 4-d.2 — 대회의실 조명·그림자** — 배수를 짐작하지 않고 **조명을 하나씩 꺼 가며** 어느 빛이 어느 면에 닿는지 실측해서 골랐다(천장등은 벽에 0·바닥/상판에 32, 환경광은 정면벽보다 옆벽에 더). 실패를 두 번 만났다: 보조광을 2.00까지 올리니 프롬퍼터 화면이 82→108, 눕히니 날개 모니터 화면이 33→51. **옆벽과 날개 모니터는 법선이 같아 한 빛으로 못 가른다** → 보조광 1.30 + 방향 없는 환경광 1.18로 채웠다. 프리셋에 **보조광 자리**를 새로 두되 정하지 않은 공간은 기존 자리 그대로. DEC-111 | AI | **완료(2026-09-17, v425)** | 731/731 통과, 옆벽 179 → **197**(아홉 배치 전부) · 벽차이 16~22% → 11~16% · 프롬퍼터 화면 79.8 → **48.3** · 바닥/상판이 벽 아래로 · 날아감·뭉갬 0.00% · 조명 5/그림자 1 · 구조 전후 동일 · **대기업 20컷·임원 5컷·다섯 공간 pixel diff 0** |
| P10-7 | **PHASE 4-d.3 — 대회의실 전용 화각** — 서는 자리를 벽이 아니라 **놓인 것**에서 계산한다(맨 뒤 좌석 + 바닥이 보이기 시작하는 거리, 네 번 수렴). 천장 띠를 먼저 정하고 내려본 각을 역산(임원 `frameTop` = 띠 0인 경우, 식 하나를 공유). 시선점은 방향을 유지한 채 앞으로 당겨 깊은 방에서 바닥 아래로 내려가지 않게. 가로/세로는 테이블 발자국의 긴 축으로 자동 판정. **검수 중 구도 지표가 틀린 것을 발견해 교체**(감싸는 상자 → 조각 위 점 표본) — 그 결과 뒤 정중앙이 가로 U자에서 성립하지 않음이 드러나 3/4 구도로 이동. DEC-112 | AI | **완료(2026-09-17, v426)** | 755/755 통과, 상판 실측 점유 0.7% → **15.7%**(중형)·19.1%(대형)·**55~100%**(세로/보트/사각), LED 수용 **9종×4시점 100%**, 천장 띠 9~11%(권장 6~14%), 조작기 카메라 들림 **0**(실측), 화면비 5종·크기 7종 전부 유한·점프 0·화각 ≤46°, **대기업 20컷·임원 5컷·다섯 공간 pixel diff 0 · 대회의실 아이소/평면/정면 pixel diff 0** |
| P8-6 | PHASE 3~5 — Executive Boardroom → Large Conference Room → Operation/Control Room | AI | 대기 | 단계별 오너 승인 |
| P7-3 | **3D 오너 요청 기능 6건** — 객석 착석 인원 + LED 시야각 시뮬 · 3D LED 화면 이미지 · 단차 시작 줄 + 상황실 단차 · 평면도 원근 + 화각 조절 · LED 옆 보조 모니터 · 표현 방식(심플/실사). DEC-079~084 | AI | **완료(2026-09-16, v389)** | 371/371 통과, 기능별 브라우저 검증 |
| P7-2 | **3D Interior Realism STEP 2~8 + 최종 점검** — 방 껍데기(걸레받이·천장·바닥/격자 분리) · 재질 7종 · 조명/접촉 그림자 · 회의실(AV 수납장) · 강당(무대 디테일) · 강의실(2인용 테이블·강사 영역) · 아이디에이션 공간 신설. DEC-071~078 | AI | **완료(2026-09-16, v383)** | 338/338 통과, 브라우저 27항목 전수 통과, 계산·정면 뷰 무회귀 |
| P7-1 | **3D Interior Realism STEP 1 — 가구 에셋 시스템** — 형상 정의를 순수 모듈 `src/furniture-assets.js`로 분리, V1 자산 5종(강당 객석·회의 회전의자·회의 테이블·강의 책상·강의 의자) 실제 비율 적용. DEC-070 | AI | **완료(2026-09-16, v376)** | 308/308 통과. 384석에서 그리기 호출 28개 고정, 배치 계산 무변경 |
| P6-1 | **03 미리보기 CSS 3D 원근** — 방 5면 1점 투시·바닥 그리드·LED월·신호·사람·눈높이선, 2D 치수 오버레이(값 유지·동적 투영), 표시 토글 4개. DEC-033 | 김현규(디자인)/AI | **완료(2026-09-12, v186)** | 이사 디자인 핸드오프 반영. 다중 크기·토글·FHD 헤드리스 검증, 115/115 |

## Notes

삼성 공식 도구(display-configurator.biz.samsung.com) 직접 검증(2026-07-23): MP012F(P1.26, 캐비닛 806.4×453.6×49.4mm, 9.2kg, 최대 146W/평균 77W, 640×360, 1800/1000nit, 3840Hz, OVD 4.4m)을 6×3.4m 벽에 Fit-to-wall → **7×6=42캐비닛**, 5.644×2.721m, 15.362m², 246.679", 386.4kg, 해상도 4480×2160, 최대 6132W/평균 3234W, 발열 최대 20916/평균 11046 BTU. BOM: 캐비닛 42+스페어 4=46(LH012MPFAAA), S-Box SBB-CS4BPGS 2+스페어 1, Jig CY-WJFPWP 3. 프로토타입 v0.1은 동일 조건에서 7×7로 계산(세로 규칙 차이) → P2/Q1로 조정 예정.

**2026-07-24 (DEC-006) 반영:** S-Box 데이터시트 스터디(CS4B/SNOWAAE 매뉴얼)로 박스당 최대 4K 확인 후 산출 규칙을 **영역 타일** `ceil(resW/3840)×ceil(resH/2160)`(이중화 ×2)로 확정. SBB-CS4B=SBB-CS4BPGS(동일 제품)·SBB-SNOWAAE 공통 4K(SNOWAAE 8K는 보수 운용으로 4K 제한). CS4B 호환 라인 IFR·IEA에 컨트롤러 용량 반영, MMF 등은 미상(null 유지). Outdoor(IB) 시리즈 단종으로 모델 라이브러리에서 삭제. 슈퍼와이드(>16:9) 배열에 16:9 최대 콘텐츠 해상도 산출 추가. `tests/engine.test.js` 10→14종 확장, 전부 통과. 삼성 42캐비닛(4480×2160)→2대 검증 유지.

**2026-07-24 (DEC-008·009·010) 반영:** (1) 밝기 표시를 peak → **"최대"(운영 최대)**로 변경 — `brightnessMax = brightnessReduced ?? brightnessPeak`(예: MPF 1000/IFR 800/IEA 500/MMF 600 nit). (2) 기본 노출 피치를 **P0.8~P1.8**로 한정(삼성 판매 정책) — IF020R(2.0)·IF025R/IE025A(2.5)·IF040R(4.0)은 데이터 보존한 채 기본 숨김. (3) MMF에 **MM009F(P0.9375, 640×360)·MM012F(P1.25, 480×270)** 추가 — 삼성 MMF 세일즈 시트(slide 13) 기준. 밝기 최대 600 nit, 최대전력 85.8W·92.7W(=W/㎡ × 캐비닛 0.2025㎡, MM015F 467→94.6 동일 산식 재현), 부품 LH009MMFRGS·LH012MMFRGS. weight/typical은 시트에 없어 null(데이터시트 필요). `tests/engine.test.js` 14→16종, 전부 통과.
