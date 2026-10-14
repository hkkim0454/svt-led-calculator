// monitors.test.js — LED 옆 보조 모니터 배치 회귀 테스트.
// 핵심 규칙: (1) 제품 스펙을 지어내지 않는다(대각 인치 → 16:9는 순수 기하)
//            (2) 자리가 없으면 걸지 않고 이유를 알린다 (3) LED를 가리지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONITOR_INCHES, MONITOR_SIDES, BEZEL_MM, panelSize, sideMonitorLayout,
  MONITOR_INCH_MIN, MONITOR_INCH_MAX, normalizeInches,
} from '../src/monitors.js';
import { normalizeOptions } from '../src/room-presets.js';

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

test('추천 인치·위치 목록', () => {
  // 이 목록은 **입력칸에 띄우는 추천**이지 고를 수 있는 값의 제한이 아니다.
  assert.deepEqual([...MONITOR_INCHES], [32, 43, 50, 55, 65, 75, 86, 98, 110]);
  assert.deepEqual([...MONITOR_SIDES], ['none', 'left', 'right', 'both']);
  // 추천 목록은 전부 입력 허용 범위 안이고, 작은 값부터 차례로 커진다.
  for (const n of MONITOR_INCHES) {
    assert.ok(n >= MONITOR_INCH_MIN && n <= MONITOR_INCH_MAX, `${n}인치가 허용 범위 밖이다`);
  }
  assert.deepEqual([...MONITOR_INCHES], [...MONITOR_INCHES].sort((a, b) => a - b));
});

test('추천 목록에 없는 인치도 그대로 계산된다', () => {
  // 현장 규격은 제조사·연식마다 다르다. 목록 밖 크기도 16:9 기하로 계산되어야 한다.
  for (const inch of [37, 52, 58, 77, 88, 105, 115]) {
    const p = panelSize(inch);
    assert.ok(Math.abs(Math.hypot(p.w, p.h) - inch * 25.4) < 0.5, `${inch}인치 대각이 틀리다`);
    assert.ok(Math.abs(p.w / p.h - 16 / 9) < 1e-9, `${inch}인치가 16:9가 아니다`);
  }
  // 목록 밖 크기로도 실제 배치가 된다(추천 목록이 배치를 막지 않는다).
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

test('옵션 검증 — 인치가 목록이 아니라 범위로 관리된다', () => {
  const opt = v => normalizeOptions('meeting', { sideMonitorIn: v }).sideMonitorIn;
  // 예전에는 목록에 없으면 55로 되돌렸다. 이제는 범위 안이면 그대로 쓴다.
  assert.equal(opt(52), 52);
  assert.equal(opt(110), 110);
  assert.equal(opt('86'), 86);
  // 범위 밖은 잘린다.
  assert.equal(opt(5), MONITOR_INCH_MIN);
  assert.equal(opt(500), MONITOR_INCH_MAX);
  // 값이 없으면 기본 55.
  assert.equal(normalizeOptions('meeting', {}).sideMonitorIn, 55);
  // 예전 저장본에 남아 있던 문자열 '49'(옛 목록 값)도 숫자로 살아남는다.
  assert.equal(opt('49'), 49);
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
