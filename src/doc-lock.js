// doc-lock.js — 비밀번호로 잠근 자료(PDF)를 브라우저에서 여는 도구. DOM 없음 · 브라우저·Node 공용.
//
// 배포 사이트(GitHub Pages)와 저장소는 **공개**다. 화면에 비밀번호 창만 띄우면 파일 주소를 아는 누구나
//   그대로 내려받을 수 있다. 그래서 삼성 자료는 **파일 자체를 암호화해서** 올리고(…pdf.lock),
//   비밀번호를 넣은 사람의 브라우저 안에서만 풀어 보여 준다(삼성 제품가이드 · 제안서 전부, DEC-163 · DEC-164).
//
// 방식: PBKDF2-SHA256(비밀번호 → 키) + AES-256-GCM. 브라우저 내장 Web Crypto 만 쓴다(외부 라이브러리 없음).
//   GCM 은 내용이 한 글자라도 바뀌었거나 비밀번호가 틀리면 풀기에 실패한다 — 틀린 비밀번호로 깨진 PDF 가
//   열리는 일이 없다.
//
// 파일 모양(앞에서부터)
//   'SVTLOCK1'(8바이트) · 반복 횟수(4바이트, 빅엔디언) · salt(16) · iv(12) · 암호문(+ GCM 태그 16)
//
// ⚠ 비밀번호는 저장소 어디에도 적지 않는다(코드·문서·검사·PR). 잠그는 도구(tools/lock-doc.mjs)도
//   비밀번호를 환경 변수로만 받는다.

export const LOCK_MAGIC = 'SVTLOCK1';
export const LOCK_ITERATIONS = 600000;
const HEAD = 8 + 4 + 16 + 12;

const subtle = () => {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new Error('이 브라우저는 암호 해제(Web Crypto)를 지원하지 않습니다. https 주소로 열어 주세요.');
  return s;
};
const enc = new TextEncoder();

async function deriveKey(password, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** 앞 8바이트가 잠금 표식인가. */
export function isLocked(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < HEAD) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== LOCK_MAGIC.charCodeAt(i)) return false;
  return true;
}

/** 잠그기 — 저장소에 올리기 전에 한 번만 쓴다(tools/lock-doc.mjs). */
export async function lockBytes(plain, password, { iterations = LOCK_ITERATIONS } = {}) {
  if (!password) throw new Error('비밀번호가 비어 있습니다.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  const out = new Uint8Array(HEAD + ct.length);
  for (let i = 0; i < 8; i++) out[i] = LOCK_MAGIC.charCodeAt(i);
  new DataView(out.buffer).setUint32(8, iterations, false);
  out.set(salt, 12); out.set(iv, 28); out.set(ct, HEAD);
  return out;
}

/** 비밀번호가 틀렸을 때 던지는 오류. 화면은 이것만 '비밀번호가 맞지 않습니다'로 바꿔 보여 준다. */
export class WrongPasswordError extends Error {
  constructor() { super('비밀번호가 맞지 않습니다.'); this.name = 'WrongPasswordError'; }
}

/** 풀기 — 틀린 비밀번호·손상된 파일이면 WrongPasswordError. */
export async function unlockBytes(locked, password) {
  const b = locked instanceof Uint8Array ? locked : new Uint8Array(locked);
  if (!isLocked(b)) throw new Error('잠긴 자료 파일이 아닙니다.');
  const iterations = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(8, false);
  const key = await deriveKey(password, b.slice(12, 28), iterations);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: b.slice(28, 40) }, key, b.slice(HEAD)));
  } catch {
    throw new WrongPasswordError();
  }
}
