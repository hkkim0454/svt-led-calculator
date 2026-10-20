// monitors.test.js — LED 옆 보조 모니터 배치 회귀 테스트.
// 핵심 규칙: (1) 제품 스펙을 지어내지 않는다(대각 인치 → 16:9는 순수 기하)
//            (2) 자리가 없으면 걸지 않고 이유를 알린다 (3) LED를 가리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONITOR_INCHES, MONITOR_SIDES, BEZEL_MM, panelSize, sideMonitorLayout,
  MONITOR_INCH_MIN, MONITOR_INCH_MAX, normalizeInches, frontMonitorBoxes,
} from '../src/monitors.js';
import { normalizeOptions, optionsForDesign } from '../src/room-presets.js';
import { readFileSync } from 'node:fs';

const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const htmlSrc = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');

test('인치 → 크기 — 16:9 기하가 맞다', () => {
  const p = panelSize(55);
  // 대각 55인치 = 1,397mm. 16:9면 가로 1,218 · 세로 685.
  assert.ok(Math.abs(Math.hypot(p.w, p.h) - 55 * 25.4) < 0.5, '대각이 인치와 맞아야 한다');
  assert.ok(Math.abs(p.w / p.h - 16 / 9) < 1e-9, '16:9');
  assert.equal(Math.round(p.w), 1218);
  assert.equal(Math.round(p.h), 685);
  // 테두리 포함 바깥 크기는 화면보다 양쪽 베젤만큼 크다.
  assert.equal(Math.round(p.panelW - p.w), BEZEL_MM * 2);
  assert.equal(Math.round(p.panelH - p.h), BEZEL_MM * 2);
  // 인치가 커지면 크기도 비례해 커진다.
  assert.ok(panelSize(98).w > panelSize(43).w * 2);
  // 이상한 값에도 무너지지 않는다.
  assert.ok(panelSize(0).w > 0 && panelSize('abc').w > 0);
});

test('고를 수 있는 인치·위치 목록', () => {
  // 삼성 사이니지 규격 7종만 고른다(QMC 50~98 + QH115FX 115).
  assert.deepEqual([...MONITOR_INCHES], [50, 55, 65, 75, 85, 98, 115]);
  assert.deepEqual([...MONITOR_SIDES], ['none', 'left', 'right', 'both']);
  // 목록은 전부 허용 범위 안이고, 작은 값부터 차례로 커진다.
  for (const n of MONITOR_INCHES) {
    assert.ok(n >= MONITOR_INCH_MIN && n <= MONITOR_INCH_MAX, `${n}인치가 허용 범위 밖이다`);
  }
  assert.deepEqual([...MONITOR_INCHES], [...MONITOR_INCHES].sort((a, b) => a - b));
});

test('목록에 없는 인치도 계산 함수는 그대로 계산한다', () => {
  // 현장 규격은 제조사·연식마다 다르다. 목록 밖 크기도 16:9 기하로 계산되어야 한다.
  for (const inch of [37, 52, 58, 77, 88, 105, 115]) {
    const p = panelSize(inch);
    assert.ok(Math.abs(Math.hypot(p.w, p.h) - inch * 25.4) < 0.5, `${inch}인치 대각이 틀리다`);
    assert.ok(Math.abs(p.w / p.h - 16 / 9) < 1e-9, `${inch}인치가 16:9가 아니다`);
  }
  // 목록 밖 크기로도 배치 계산은 된다(목록은 화면의 선택칸만 제한한다).
  const res = sideMonitorLayout({
    roomW: 12000, ledX: 3500, ledW: 5000, ledCY: 2100, side: 'left', inches: 52,
  });
  assert.equal(res.monitors.length, 1);
  assert.equal(res.monitors[0].inches, 52);
});

test('인치 다듬기 — 범위 밖·엉뚱한 값을 안전하게 되돌린다', () => {
  assert.equal(normalizeInches(55), 55);
  assert.equal(normalizeInches('65'), 65);      // 저장본의 문자열도 받는다
  assert.equal(normalizeInches(52.4), 52);      // 소수는 반올림
  assert.equal(normalizeInches(5), MONITOR_INCH_MIN);    // 너무 작으면 최소값으로
  assert.equal(normalizeInches(9999), MONITOR_INCH_MAX); // 너무 크면 최대값으로
  assert.equal(normalizeInches(0), 55);         // 0·음수·빈값은 기본값으로
  assert.equal(normalizeInches(-10), 55);
  assert.equal(normalizeInches('abc'), 55);
  assert.equal(normalizeInches(undefined), 55);
});

test('옵션 검증 — 인치는 목록의 값만 받는다', () => {
  const opt = v => normalizeOptions('meeting', { sideMonitorIn: v }).sideMonitorIn;
  // 화면의 선택칸은 값을 문자열로 넘긴다. 목록에 있으면 그대로 쓴다.
  for (const n of MONITOR_INCHES) assert.equal(opt(String(n)), String(n));
  // 목록에 없는 값·엉뚱한 값은 기본 55로 되돌린다.
  assert.equal(opt('52'), '55');
  assert.equal(opt('43'), '55');
  assert.equal(opt('abc'), '55');
  assert.equal(normalizeOptions('meeting', {}).sideMonitorIn, '55');
  // 선택칸의 항목은 목록과 같은 7개뿐이다.
  const sel = optionsForDesign('meeting', null).find(o => o.key === 'sideMonitorIn');
  assert.equal(sel.type, 'select');
  assert.deepEqual(sel.choices.map(c => c.value), MONITOR_INCHES.map(String));
});

const ROOM = { roomW: 12000, ledX: 3500, ledW: 5000, ledCY: 2100 };

test('배치 — 남은 자리 한가운데에 걸리고 LED와 겹치지 않는다', () => {
  const { monitors, notes } = sideMonitorLayout({ ...ROOM, side: 'both', inches: 55 });
  assert.equal(monitors.length, 2);
  assert.equal(notes.length, 0);
  const [l, r] = monitors.sort((a, b) => a.x - b.x);
  assert.equal(l.side, 'left'); assert.equal(r.side, 'right');
  assert.equal(l.x, 1750, '왼쪽 여백 3,500의 한가운데');
  assert.equal(r.x, 10250, '오른쪽 여백 3,500의 한가운데');
  // LED(3,500~8,500)와 겹치지 않는다.
  for (const m of monitors) {
    assert.ok(m.x + m.panelW / 2 <= ROOM.ledX || m.x - m.panelW / 2 >= ROOM.ledX + ROOM.ledW,
      `${m.side} 모니터가 LED를 가린다`);
    // 벽 밖으로도 나가지 않는다.
    assert.ok(m.x - m.panelW / 2 >= 0 && m.x + m.panelW / 2 <= ROOM.roomW);
    // 높이는 LED와 같은 중심.
    assert.equal(m.y, ROOM.ledCY);
    assert.equal(m.inches, 55);
  }
});

test('배치 — 한쪽만 고르면 한 대만', () => {
  assert.equal(sideMonitorLayout({ ...ROOM, side: 'left', inches: 55 }).monitors.length, 1);
  assert.equal(sideMonitorLayout({ ...ROOM, side: 'right', inches: 55 }).monitors[0].side, 'right');
  assert.equal(sideMonitorLayout({ ...ROOM, side: 'none', inches: 55 }).monitors.length, 0);
  assert.equal(sideMonitorLayout({ ...ROOM, side: '없는값', inches: 55 }).monitors.length, 0);
  assert.equal(sideMonitorLayout().monitors.length, 0, '아무것도 안 줘도 무너지지 않는다');
});

test('배치 — 자리가 없으면 걸지 않고 이유를 알린다(억지로 끼우지 않는다)', () => {
  const tight = sideMonitorLayout({ roomW: 6000, ledX: 1000, ledW: 4000, ledCY: 2100, side: 'both', inches: 75 });
  assert.equal(tight.monitors.length, 0);
  assert.equal(tight.notes.length, 2);
  for (const n of tight.notes) {
    assert.ok(n.includes('75인치') && n.includes('여백'), n);
  }
  // 한쪽만 자리가 있으면 그쪽만 걸린다.
  const lop = sideMonitorLayout({ roomW: 12000, ledX: 800, ledW: 5000, ledCY: 2100, side: 'both', inches: 65 });
  assert.equal(lop.monitors.length, 1);
  assert.equal(lop.monitors[0].side, 'right');
  assert.equal(lop.notes.length, 1);
  assert.ok(lop.notes[0].includes('왼쪽'));
});

test('배치 — 인치를 키우면 어느 순간 못 걸게 된다(조용히 겹치지 않는다)', () => {
  let lastOk = 0;
  for (const inch of MONITOR_INCHES) {
    const res = sideMonitorLayout({ ...ROOM, side: 'left', inches: inch });
    if (res.monitors.length) {
      lastOk = inch;
      const m = res.monitors[0];
      assert.ok(m.x + m.panelW / 2 <= ROOM.ledX, `${inch}인치가 LED를 침범한다`);
    } else {
      assert.ok(res.notes.length === 1, `${inch}인치: 못 걸었으면 이유가 있어야 한다`);
    }
  }
  assert.ok(lastOk > 0, '이 방 크기에서는 적어도 하나는 걸려야 한다');
});

// ── 정면 뷰에도 같은 모니터 (오너 요청 2026-10-19) ─────────────────────────
// 3D 에만 있던 LED 옆 모니터를 정면 뷰에도 그린다. 자리는 **같은 계산 하나**에서 나오고,
//   정면 뷰는 그 결과를 벽 왼쪽 위 기준 좌표로 바꿔 그릴 뿐이다.

test('정면 뷰 좌표 — 3D 결과를 벽 왼쪽 위 기준으로만 바꾼다(mm 까지 같다)', () => {
  const wallH = 3400;
  const sm = sideMonitorLayout({ roomW: 8000, ledX: 2080, ledW: 3840, ledCY: 1000 + 1080, side: 'both', inches: 55 });
  const boxes = frontMonitorBoxes(sm.monitors, wallH);
  assert.equal(boxes.length, 2);
  boxes.forEach((b, i) => {
    const mn = sm.monitors[i];
    assert.equal(b.side, mn.side);
    assert.equal(b.inches, 55);
    // 사각형 중심이 3D 중심과 같고, 크기는 테두리 포함 바깥 크기다.
    assert.ok(Math.abs(b.left + b.w / 2 - mn.x) < 1e-9, '가로 중심');
    assert.ok(Math.abs(wallH - (b.top + b.h / 2) - mn.y) < 1e-9, '세로 중심(바닥 기준 높이)');
    assert.equal(b.w, mn.panelW);
    assert.equal(b.h, mn.panelH);
    assert.ok(Math.abs(b.bezel - BEZEL_MM) < 1e-9, '화면까지 안쪽 여백 = 테두리');
  });
  // 기준 수치 — 8m 벽(높이 3.4m) · LED 3,840×2,160 가운데 · 하단 1,000: 좌 417~1,663 · 우 6,337~7,583, 위에서 964.
  assert.deepEqual(boxes.map(b => [Math.round(b.left), Math.round(b.left + b.w), Math.round(b.top)]),
    [[417, 1663, 964], [6337, 7583, 964]]);
  // 걸 수 없으면 그릴 것도 없다.
  assert.deepEqual(frontMonitorBoxes([], wallH), []);
  assert.deepEqual(frontMonitorBoxes(undefined, wallH), []);
});

test('정면 뷰와 3D 가 **같은 호출 하나**로 모니터 자리를 정한다', () => {
  // sideMonitorLayout 은 app.js 에서 한 곳(sideMonitorsFor)에서만 부른다.
  assert.equal((appSrc.match(/sideMonitorLayout\(/g) || []).length, 1, 'sideMonitorLayout 을 두 곳에서 부른다');
  assert.match(appSrc, /function sideMonitorsFor\(r, mount, sW\) \{\n  return sideMonitorLayout\(\{/);
  // 두 뷰가 모두 그 함수를 쓴다(정면 뷰 1 + 3D 1).
  assert.equal((appSrc.match(/const sm = sideMonitorsFor\(r, mount, sW\);/g) || []).length, 2);
  // 정면 뷰는 벽 좌표 변환 함수를 거쳐 정면 벽에 그린다.
  assert.match(appSrc, /frontMonitorBoxes\(sm\.monitors, sH\)/);
  assert.match(appSrc, /\$\{sigHTML\}\n            \$\{monHTML\}/);
});

test('정면 뷰 도구 줄의 모니터 칸 — 회의실 옵션 표에서 읽고, 3D 와 같은 값을 쓴다', () => {
  // 칸 자리는 정면 뷰 도구 줄(#pvToggles) 안이다. 안내 줄도 따로 있다.
  const tog = htmlSrc.slice(htmlSrc.indexOf('id="pvToggles"'), htmlSrc.indexOf('id="pvImgFile"'));
  assert.match(tog, /<span class="pvMonCtl" id="pvMonCtl" hidden/, '도구 줄에 모니터 칸이 없다');
  assert.match(htmlSrc, /<div class="svBar" id="pvMonNote" hidden><\/div>/, '안내 줄이 없다');
  // 칸 목록은 옵션 표에서 읽는다(용도 이름을 코드에 적지 않는다) — 회의실에만 그 옵션이 있다.
  assert.match(appSrc, /optionsForDesign\(roomTypeId, designId\)\.filter\(o => FRONT_MON_KEYS\.includes\(o\.key\)\)/);
  assert.match(appSrc, /const FRONT_MON_KEYS = Object\.freeze\(\['sideMonitor', 'sideMonitorIn'\]\);/);
  for (const t of ['meeting']) {
    const keys = optionsForDesign(t, null).map(o => o.key);
    assert.ok(keys.includes('sideMonitor') && keys.includes('sideMonitorIn'), `${t} 에 모니터 옵션이 없다`);
  }
  for (const t of ['classroom', 'hall_s', 'hall_m', 'hall_l', 'control', 'ideation']) {
    assert.ok(!optionsForDesign(t, null).some(o => o.key === 'sideMonitor'), `${t} 에 모니터 옵션이 생겼다`);
  }
  // 값은 3D 옵션 칸과 같은 길(normalizeOptions → roomOpts)로 고치고 저장한다.
  assert.match(appSrc, /\$\('#pvMonCtl'\)\?\.addEventListener\('input', e => \{\n  const el = e\.target\.closest\('\[data-fmon\]'\); if \(!el\) return;\n  const raw = el\.tagName === 'INPUT' \? num\(el\.value\) : el\.value;\n  roomOpts = normalizeOptions\(roomTypeId, \{ \.\.\.roomOpts, \[el\.dataset\.fmon\]: raw \}\);\n  renderPreview\(\); saveLastSession\(\);/);
  // 3D 뷰에서는 정면 칸·안내 줄을 숨긴다(3D 는 자기 칸과 안내 줄을 쓴다).
  assert.match(appSrc, /box\.hidden = pvView === '3d' \|\| !opts\.length;/);
  assert.match(appSrc, /const show = pvView !== '3d' && notes\.length > 0;/);
});
