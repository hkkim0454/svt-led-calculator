// tools/lock-doc.mjs — 제안서 PDF 를 비밀번호로 잠가 src/catalogs/ 에 올릴 파일(…pdf.lock)을 만든다.
//
//   DOC_PASSWORD='(비밀번호)' node tools/lock-doc.mjs 원본.pdf src/catalogs/이름.pdf.lock
//
// 비밀번호는 **환경 변수로만** 받는다(명령 기록·저장소에 남지 않게). 저장소 어디에도 적지 않는다.
// 잠근 뒤 같은 비밀번호로 다시 풀어 원본과 바이트 단위로 같은지 확인하고 끝낸다.
import { readFileSync, writeFileSync } from 'node:fs';
import { lockBytes, unlockBytes } from '../src/doc-lock.js';

const [src, out] = process.argv.slice(2);
const pw = process.env.DOC_PASSWORD;
if (!src || !out || !pw) {
  console.error('사용법: DOC_PASSWORD=… node tools/lock-doc.mjs 원본.pdf src/catalogs/이름.pdf.lock');
  process.exit(1);
}
const plain = new Uint8Array(readFileSync(src));
if (String.fromCharCode(...plain.slice(0, 4)) !== '%PDF') { console.error('PDF 파일이 아닙니다:', src); process.exit(1); }
const locked = await lockBytes(plain, pw);
const back = await unlockBytes(locked, pw);
if (back.length !== plain.length || back.some((v, i) => v !== plain[i])) { console.error('되풀기 검증 실패'); process.exit(1); }
writeFileSync(out, locked);
console.log(`잠금 완료 ${out} (${plain.length.toLocaleString()} → ${locked.length.toLocaleString()} bytes, 되풀기 일치)`);
