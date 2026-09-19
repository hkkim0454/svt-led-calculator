// capture.mjs — 시각 회귀 촬영기. (PHASE 8-0, DEC-133)
// ─────────────────────────────────────────────────────────────────────────────
// QA 전용이다. `src/` 는 이 파일을 모르고, `npm test` 도 이 파일을 돌리지 않는다
//   (저장소 규칙: 검사는 Node 내장만 쓴다. Playwright 는 개발용 도구다).
//
// 쓰는 법
//   node qa/capture.mjs --port 5180 --out /tmp/shots.json                 # 목록 순서
//   node qa/capture.mjs --port 5180 --order reverse  --out /tmp/rev.json  # 뒤집어서
//   node qa/capture.mjs --port 5180 --order shuffle --seed 20260919 ...   # 고정 씨앗 섞기
//   node qa/capture.mjs --port 5180 --fresh-page --out /tmp/fresh.json    # 컷마다 새 페이지
//
// **한 컷의 그림은 그 컷의 명세만으로 정해진다.** 앞 컷이 무엇이었는지, 몇 번째인지,
//   새로고침을 했는지와 무관하다. 그 약속을 지키려고 매 컷마다 상태를 처음부터 세운다.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { CAPTURE_CASES, caseById, CAPTURE_IDS } from './capture-cases.js';
import { capturePlan, normalizeCaseSpec, stateMismatches, fingerprint, shuffledOrder,
  CAPTURE_STEPS } from './capture-state.js';

const CHROME = process.env.QA_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * Playwright 를 찾아 온다. **저장소의 의존성으로 넣지 않는다**(오너 지침: 빌드리스 유지,
 *   검사는 Node 내장만). 개발 기계에 설치된 것을 그대로 빌려 쓰고, 없으면 분명히 알린다.
 *   `QA_PLAYWRIGHT` 로 경로를 직접 지정할 수도 있다.
 */
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const 후보 = [process.env.QA_PLAYWRIGHT, 'playwright',
    '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const c of 후보) {
    try { return require(c); } catch { /* 다음 후보 */ }
  }
  throw new Error('Playwright 를 찾지 못했다. 설치하거나 QA_PLAYWRIGHT 로 경로를 알려 달라 '
    + `(찾아본 곳: ${후보.join(', ')})`);
}
/** 장면이 멈췄다고 보는 기준 — 연속 세 프레임 동안 그림이 그대로일 때.
 *   왜 세 프레임인가: 조작기(OrbitControls)가 관성(dampingFactor 0.08)으로 몇 프레임 더
 *   움직이므로 한 프레임만 보면 이르다. 그리기 반복문은 움직임이 있을 때만 다시 그리므로,
 *   세 프레임 연속으로 같은 그림이면 더 이상 바뀔 것이 없다는 뜻이다. 시간을 재지 않고
 *   **화면이 멈췄는지**를 직접 보므로 기계가 느려도 결과가 같다. */
const STABLE_FRAMES = 3;
const SETTLE_TIMEOUT_MS = 20000;

function args(argv) {
  const o = { port: 5180, out: null, order: 'list', seed: 20260919, freshPage: false, only: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--order') o.order = argv[++i];
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--fresh-page') o.freshPage = true;
    else if (a === '--only') o.only = argv[++i].split(',');
  }
  return o;
}

function orderedCases({ order, seed, only }) {
  let ids = [...CAPTURE_IDS];
  if (order === 'reverse') ids.reverse();
  else if (order === 'shuffle') ids = shuffledOrder(ids, seed);
  else if (order !== 'list') throw new Error(`모르는 순서: ${order}`);
  if (only) ids = ids.filter(id => only.includes(id));
  return ids.map(id => caseById(id));
}

// ── 브라우저 쪽에서 도는 조각들 ─────────────────────────────────────────────
//   `page.evaluate` 로 넘기므로 이 함수들은 문자열로 직렬화된다. 바깥 변수를 쓰지 않는다.

const setField = ([sel, value]) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
};

const readRuntime = async () => {
  const q = s => document.querySelector(s);
  // 디자인 선택칸은 고를 것이 하나뿐이면 숨는다(상황실·교육장). 그때 `value` 는 빈 문자열이라
  //   화면이 실제로 쓰는 디자인과 다르다. 그래서 제품의 정상화 함수로 직접 풀어 본다.
  let 해석된디자인 = null;
  try {
    const R = await import('/room-design.js');
    해석된디자인 = R.normalizeDesign((q('#roomDesign') && q('#roomDesign').value) || undefined,
      q('#roomType') && q('#roomType').value);
  } catch { /* 모듈을 못 읽으면 선택칸 값만 쓴다 */ }
  const V = window.__svtViewer3d;
  const I = V && V._internals;
  const options = {};
  document.querySelectorAll('#roomOpts [data-ropt]').forEach(el => {
    options[el.dataset.ropt] = el.tagName === 'BUTTON' ? el.classList.contains('on') : el.value;
  });
  const cv = q('#cv3d');
  let fov = null, ledScreenY = null, lights = 0, casters = 0;
  if (I) {
    fov = I.camera.isPerspectiveCamera ? +I.camera.fov.toFixed(3) : null;
    I.scene.traverse(o => {
      if (String(o.name || '') === 'ledScreen') ledScreenY = +o.position.y.toFixed(4);
      if (o.isLight) { lights++; if (o.castShadow) casters++; }
    });
  }
  return {
    roomType: q('#roomType') && q('#roomType').value,
    design: 해석된디자인 || (q('#roomDesign') && q('#roomDesign').value) || null,
    widthMm: Math.round(Number(q('#spaceW').value) * 1000),
    heightMm: Math.round(Number(q('#spaceH').value) * 1000),
    depthMm: Math.round(Number(q('#spaceD').value) * 1000),
    model: (q('.modelRow.sel') && q('.modelRow.sel').dataset.id) || null,
    ledWmm: Number(q('#ledW').value),
    ledHmm: Number(q('#ledH').value),
    ledBaseMm: Number(q('#baseHeight').value),
    view: (V && V.getView && V.getView().preset) || null,
    person3d: !!(q('[data-t3d="person"]') && q('[data-t3d="person"]').classList.contains('on')),
    options,
    canvasWidth: cv ? cv.width : null,
    canvasHeight: cv ? cv.height : null,
    dpr: window.devicePixelRatio,
    fov, ledScreenY, lights, casters,
  };
};

/** 캔버스 그림의 해시와 16×16 타일 해시. 같은 그림이면 같은 값이 나온다. */
const readPixels = () => {
  const { renderer } = window.__svtViewer3d._internals;
  const cv = renderer.domElement;
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const TX = 16, TY = 16, tw = Math.ceil(c.width / TX), th = Math.ceil(c.height / TY);
  const tiles = new Uint32Array(TX * TY).fill(2166136261);
  let all = 2166136261;
  for (let y = 0; y < c.height; y++) {
    const ty = Math.min(TY - 1, (y / th) | 0);
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4, tx = Math.min(TX - 1, (x / tw) | 0), t = ty * TX + tx;
      for (let k = 0; k < 3; k++) { all = ((all ^ d[i + k]) * 16777619) >>> 0; tiles[t] = ((tiles[t] ^ d[i + k]) * 16777619) >>> 0; }
    }
  }
  return { hash: all >>> 0, tiles: Array.from(tiles), width: c.width, height: c.height };
};

/** 연속 N 프레임 동안 그림이 같은지 본다. 시간이 아니라 **변화 없음**을 기준으로 삼는다. */
const framesStable = async ([need]) => {
  const { renderer } = window.__svtViewer3d._internals;
  const snap = () => {
    const cv = renderer.domElement;
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 40) h = ((h ^ d[i]) * 16777619) >>> 0;   // 성긴 표본으로 충분하다
    return h >>> 0;
  };
  const wait = () => new Promise(r => requestAnimationFrame(() => r()));
  let last = snap(), same = 0;
  for (let i = 0; i < 240 && same < need; i++) {
    await wait();
    const h = snap();
    same = (h === last) ? same + 1 : 0;
    last = h;
  }
  return { stable: same >= need,
    shadowPending: !!renderer.shadowMap.needsUpdate,
    animating: !!window.__svtViewer3d.getView().animating };
};

// ── 컷 하나를 세우는 절차 ───────────────────────────────────────────────────

/**
 * 컷 명세대로 앱 상태를 **처음부터** 세운다. 앞 컷의 상태를 읽지 않는다.
 * @returns {{runtime:object, mismatches:string[], settle:object}}
 */
export async function applyCanonicalCaptureState(page, spec, opts = {}) {
  const plan = capturePlan(spec);
  const s = normalizeCaseSpec(spec);
  const base = opts.baseUrl || `http://localhost:${opts.port || 5180}/`;
  let settle = null;

  for (const step of plan) {
    switch (step.step) {
      case 'resetBrowserState': {
        // 저장된 값(LED 하단 높이·공간 타입·소품 …)을 지우고 앱을 처음 상태로 띄운다.
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* 비공개 창 */ } });
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('.modelList > *');
        break;
      }
      case 'enterViewer': {
        await page.setViewportSize({ width: step.viewport.width, height: step.viewport.height });
        await page.click('#pvViewMode button[data-view="3d"]');
        await page.waitForFunction(() => !!window.__svtViewer3d, null, { timeout: 15000 });
        break;
      }
      case 'selectModel': {
        const ok = await page.evaluate(id => {
          const row = document.querySelector(`.modelRow[data-id="${id}"]`);
          if (!row) return false;
          row.click();
          return true;
        }, step.model);
        if (!ok) throw new Error(`${s.id}: LED 제품 ${step.model} 을 고를 수 없다`);
        break;
      }
      case 'roomType':
        await page.selectOption('#roomType', step.roomType);
        break;
      case 'dimensions':
        // 치수를 먼저 정해야 LED 하단 높이의 상한이 정해진다.
        await page.evaluate(setField, ['#spaceW', step.widthMm / 1000]);
        await page.evaluate(setField, ['#spaceH', step.heightMm / 1000]);
        await page.evaluate(setField, ['#spaceD', step.depthMm / 1000]);
        break;
      case 'ledState':
        await page.evaluate(setField, ['#ledW', step.ledWmm]);
        await page.evaluate(setField, ['#ledH', step.ledHmm]);
        // **이번 단계의 핵심** — 앞 컷이 남긴 값을 쓰지 않고 컷마다 다시 넣는다.
        await page.evaluate(setField, ['#baseHeight', step.ledBaseMm]);
        break;
      case 'design':
        if (step.design) {
          await page.evaluate(id => {
            const sel = document.querySelector('#roomDesign');
            if (sel && [...sel.options].some(o => o.value === id)) {
              sel.value = id;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, step.design);
        }
        break;
      case 'roomOptions':
        await page.evaluate(wanted => {
          for (const [key, value] of Object.entries(wanted)) {
            const el = document.querySelector(`#roomOpts [data-ropt="${key}"]`);
            if (!el) continue;
            if (el.tagName === 'BUTTON') {
              if (el.classList.contains('on') !== !!value) el.click();
            } else {
              el.value = String(value);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, step.options);
        break;
      case 'accessories':
        await page.evaluate(on => {
          const b = document.querySelector('[data-t3d="person"]');
          if (b && b.classList.contains('on') !== !!on) b.click();
        }, step.person3d);
        break;
      case 'view':
        await page.evaluate(v => window.__svtViewer3d.setPreset(v, { animate: false }), step.view);
        break;
      case 'settle': {
        await page.waitForFunction(() => !window.__svtViewer3d.getView().animating, null, { timeout: SETTLE_TIMEOUT_MS });
        await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
        settle = await page.evaluate(framesStable, [STABLE_FRAMES]);
        if (!settle.stable) throw new Error(`${s.id}: 화면이 멈추지 않았다`);
        break;
      }
      case 'assertState': {
        const runtime = await page.evaluate(readRuntime);
        // 하단 높이는 제품이 자를 수 있으므로 **자른 뒤의 값**과 견준다.
        const ledActualHmm = runtime.ledScreenY != null
          ? Math.round((runtime.ledScreenY * 1000 - runtime.ledBaseMm) * 2) : null;
        const bad = stateMismatches(spec, runtime, ledActualHmm);
        if (bad.length) throw new Error(`${s.id}: 요청과 실제가 다르다 — ${bad.join(' / ')}`);
        break;
      }
      default: break;
    }
  }
  const runtime = await page.evaluate(readRuntime);
  const ledActualHmm = runtime.ledScreenY != null
    ? Math.round((runtime.ledScreenY * 1000 - runtime.ledBaseMm) * 2) : null;
  return { runtime, mismatches: stateMismatches(spec, runtime, ledActualHmm), settle };
}

async function main() {
  const o = args(process.argv);
  const cases = orderedCases(o);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({
    viewport: { ...CAPTURE_CASES[0].viewport || { width: 1280, height: 900 } },
    deviceScaleFactor: 1,
  });
  const out = { order: o.order, seed: o.seed, freshPage: o.freshPage, shots: {}, errors: [] };
  let page = o.freshPage ? null : await ctx.newPage();
  if (page) page.on('pageerror', e => out.errors.push(e.message));

  for (const spec of cases) {
    if (o.freshPage) { if (page) await page.close(); page = await ctx.newPage(); page.on('pageerror', e => out.errors.push(e.message)); }
    const { runtime, settle } = await applyCanonicalCaptureState(page, spec, { port: o.port });
    const px = await page.evaluate(readPixels);
    out.shots[spec.id] = {
      fingerprint: fingerprint(runtime), hash: px.hash, tiles: px.tiles,
      width: px.width, height: px.height, settle,
    };
    console.log(`${spec.id.padEnd(28)} ${px.hash} ${fingerprint(runtime)}`);
  }
  if (page) await page.close();
  await browser.close();
  if (o.out) writeFileSync(o.out, JSON.stringify(out, null, 1));
  console.log(`컷 ${Object.keys(out.shots).length}개 · 순서 ${o.order}${o.order === 'shuffle' ? '(씨앗 ' + o.seed + ')' : ''}` +
    `${o.freshPage ? ' · 컷마다 새 페이지' : ''} · JS 오류 ${out.errors.length}`);
}

export { CAPTURE_STEPS };
if (import.meta.url === `file://${process.argv[1]}`) await main();
