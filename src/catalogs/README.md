# catalogs — 제품 매뉴얼 · 카탈로그 · 제안서 PDF

제품 정보 팝업(ⓘ)과 **제품 자료실**이 여는 파일을 둔다.
목록은 `src/product-docs.js` 의 `PRODUCT_DOCS` · `SIGNAGE_DOCS` · `DOC_LIBRARY` 에 적는다(파일만 넣으면 화면에 나오지 않는다).

## 꼭 지킬 것

- 배포 사이트(GitHub Pages)는 **공개 사이트**다. 주소를 아는 누구나 이 폴더의 파일을 받을 수 있다.
  **제조사가 공개한 자료**, 또는 **제조사의 게시 동의를 오너가 확인한 자료**만 넣는다.
  가격표·견적·계약·내부 문서는 넣지 않는다.
- '무단 복제·배포 금지' 문구가 있는 자료는 오너가 동의 사실을 확인한 뒤에만 넣고, 그 확인을
  `docs/audit.md` 에 남긴다. 팝업에는 자료의 저작권 안내 문구(`notice`)를 함께 보여 준다.

## 제안서는 암호화해서 넣는다 (DEC-163)

- **매뉴얼(제품가이드)** 은 PDF 그대로 넣는다(비밀번호 없이 열린다).
- **제안서** 는 원본 PDF 를 넣지 않는다. 비밀번호로 암호화한 `…pdf.lock` 만 넣는다.
  ```
  DOC_PASSWORD='(비밀번호)' node tools/lock-doc.mjs 원본.pdf src/catalogs/이름.pdf.lock
  ```
  화면에서 비밀번호를 넣으면 브라우저 안에서만 풀어 보여 준다(`src/doc-lock.js`).
- **비밀번호는 저장소 어디에도 적지 않는다**(코드·문서·검사·PR·커밋). 바꿀 때는 제안서 전부를 새 비밀번호로 다시 잠근다.

## 지금 들어 있는 자료

| 파일 | 내용 | 종류 | 근거 |
|---|---|---|---|
| `samsung-led-indoor-guide.pdf` | 삼성 LED 사이니지 실내용 제품가이드(MMF·IFR·IEA, 7쪽) | 매뉴얼 | 오너가 삼성 동의를 확인(2026-10-04, DEC-160) |
| `samsung-lcd-standalone-guide.pdf` | 삼성 LCD 사이니지 단독형 제품가이드(47쪽) | 매뉴얼 | 오너 지시(2026-10-04, DEC-163) |
| `samsung-lcd-qh115fx-guide.pdf` | 삼성 LCD 사이니지 단독형 QHFX 115형(2쪽) | 매뉴얼 | 같음 |
| `samsung-lcd-videowall-guide.pdf` | 삼성 LCD 비디오월 제품가이드(18쪽) | 매뉴얼 | 같음 |
| `samsung-led-mpf-proposal.pdf.lock` | 삼성 스마트 LED 사이니지 MPF 시리즈(18쪽) | 제안서 · 🔒 | 같음 |
| `samsung-led-mmf-proposal.pdf.lock` | 삼성 스마트 LED 사이니지 MMF 시리즈(14쪽) | 제안서 · 🔒 | 같음 |
| `samsung-lcd-spatial-proposal.pdf.lock` | 삼성 스페이셜 사이니지(20쪽) | 제안서 · 🔒 | 같음 |
- 파일 하나는 수십 MB 이하로 둔다(저장소와 화면이 무거워진다).

## 파일 이름

`제조사-라인-종류-판.pdf` — 소문자·하이픈만 쓴다.

- 예) `samsung-mpf-catalog-2026.pdf`, `samsung-mm012f-s-datasheet-2026.pdf`
