import { describe, it, expect } from 'vitest';
import { addDays, boundsOf, mondayOf, monthGrid, step, timeRange, weekDays } from './calendar';

describe('달력 계산 — 다섯 보기가 같은 함수를 쓴다', () => {
  it('주는 월요일에서 시작한다', () => {
    expect(mondayOf('2026-08-30')).toBe('2026-08-24'); // 8/30 은 일요일
    expect(mondayOf('2026-08-31')).toBe('2026-08-31'); // 월요일은 자기 자신
    expect(weekDays('2026-08-30')).toHaveLength(7);
    expect(weekDays('2026-08-30')[0]).toBe('2026-08-24');
  });

  it('달 격자는 주 단위로 딱 떨어진다', () => {
    const g = monthGrid('2026-08-15');
    expect(g.length % 7).toBe(0);
    expect(g).toContain('2026-08-01');
    expect(g).toContain('2026-08-31');
  });

  it('학생별·선생님별은 주간과 같은 범위를 쓴다 — 다시 읽지 않게', () => {
    const w = boundsOf('week', '2026-08-30');
    expect(boundsOf('student', '2026-08-30')).toEqual(w);
    expect(boundsOf('teacher', '2026-08-30')).toEqual(w);
  });

  it('보기마다 한 걸음의 크기가 다르다', () => {
    expect(step('day', '2026-08-30', 1)).toBe('2026-08-31');
    expect(step('week', '2026-08-30', 1)).toBe('2026-09-06');
    expect(step('month', '2026-08-30', 1)).toBe('2026-09-01');
    expect(step('month', '2026-01-15', -1)).toBe('2025-12-01');
  });

  it('시간 범위는 좁히되 6시간은 남긴다 (§10)', () => {
    const tight = timeRange([{ startMin: 600, endMin: 660 }]);
    expect(tight.to - tight.from).toBeGreaterThanOrEqual(360);
    const wide = timeRange([{ startMin: 540, endMin: 600 }, { startMin: 1200, endMin: 1260 }]);
    expect(wide.from).toBeLessThanOrEqual(540);
    expect(wide.to).toBeGreaterThanOrEqual(1260);
  });

  it('날짜 더하기가 월을 넘는다', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
