import { describe, it, expect } from 'vitest';
import {
  addDays, boundingRange, boundsOf, clampSplitRatio, mondayOf, monthBounds, monthGrid, splitPanes, step,
  timeRange, unsplitPanes, updatePane, weekDays,
} from './calendar';

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

  it('월 집계는 달력 격자와 달리 해당 월 날짜만 쓴다', () => {
    expect(monthBounds('2026-02-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02-15')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
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

describe('분할 표 상태 (§4)', () => {
  const base = { view: 'week' as const, date: '2026-08-20', personId: null };

  it('현재 표를 그대로 복제하고 한쪽 수정은 다른 쪽에 번지지 않는다', () => {
    const split = splitPanes(base);
    expect(split).toEqual([base, base]);
    expect(split[0]).not.toBe(split[1]);
    const changed = updatePane(split, 1, { view: 'teacher', personId: 12 });
    expect(changed[0]).toEqual(base);
    expect(changed[1]).toMatchObject({ view: 'teacher', personId: 12 });
  });

  it('분할 해제는 focus 표를 남기고 두 표의 범위는 한 bounding range로 합친다', () => {
    const panes = updatePane(splitPanes(base), 1, { view: 'month', date: '2026-09-15' });
    expect(boundingRange(panes)).toEqual({ from: '2026-08-17', to: '2026-10-04' });
    expect(unsplitPanes(panes, 1)).toEqual([{ view: 'month', date: '2026-09-15', personId: null }]);
  });

  it('divider는 화면 비율이 아니라 실제 152px 최소 폭으로 제한한다', () => {
    expect(clampSplitRatio(0.01, 1_000)).toBe(0.152);
    expect(clampSplitRatio(0.99, 1_000)).toBe(0.848);
    expect(clampSplitRatio(0.2, 2_000)).toBe(0.2);
    expect(clampSplitRatio(Number.NaN, 1_000)).toBe(0.5);
  });
});

/* ── TBO-41 상호작용 산수 ─────────────────────────────────────────── */
import {
  clampEnd, lessonTimeIssue, minutesFromPx, movePatch, movePlacements, occurrenceKey, overlapClusters, relativePlacements,
  resizePatch, selectOccurrenceKeys, selectedOccurrences, snap15,
} from './calendar';

describe('드래그 산수 (§5)', () => {
  it('15분 스냅 — 스냅은 15, 셀은 30 (§2.5)', () => {
    expect(snap15(7)).toBe(0);
    expect(snap15(8)).toBe(15);
    expect(snap15(52)).toBe(45);
    expect(minutesFromPx(56)).toBe(60); // 시간당 56px
    expect(minutesFromPx(14)).toBe(15);
  });

  it('길이 제약 10~480분 (§5)', () => {
    expect(clampEnd(600, 605)).toBe(610);   // 최소 10분
    expect(clampEnd(600, 2000)).toBe(1080); // 최대 480분
    expect(clampEnd(1400, 1439)).toBe(1439 < 1410 ? 1410 : 1439) // 자정 상한과 최소 10분
  });

  it('폼도 같은 시각 방어 함수를 쓴다', () => {
    expect(lessonTimeIssue(600, 610)).toBeNull();
    expect(lessonTimeIssue(600, 605)).toContain('10분');
    expect(lessonTimeIssue(1380, 1450)).toContain('같은 날');
  });

  it('movePatch — 바뀐 필드만 싣고, 안 바뀌면 null (§5A.1 「바뀐 필드만 채운다」)', () => {
    const o = { date: '2026-09-01', startMin: 600, endMin: 690, teacherId: 7, roomId: 1 };
    expect(movePatch(o, { date: '2026-09-01', startMin: 600 })).toBeNull();
    expect(movePatch(o, { startMin: 615 })).toEqual({ startMin: 615, endMin: 705 }); // 길이 90분 유지
    expect(movePatch(o, { date: '2026-09-02' })).toEqual({ date: '2026-09-02' });
    expect(movePatch(o, { roomId: 2 })).toEqual({ roomId: 2 });
    expect(movePatch(o, { teacherId: null })).toEqual({ teacherId: null });
    // 강의실 축으로 옮길 때 강사는 건드리지 않는다 (§4.4 — 축이 무엇을 바꾸는지)
    expect(movePatch(o, { roomId: 1 })).toBeNull();
  });

  it('resizePatch — 끝만 바뀌고 스냅·제약을 통과한다 (C-3)', () => {
    expect(resizePatch({ startMin: 600, endMin: 660 }, 28)).toEqual({ endMin: 690 });
    expect(resizePatch({ startMin: 600, endMin: 660 }, 0)).toBeNull();
    expect(resizePatch({ startMin: 600, endMin: 660 }, -1000)).toEqual({ endMin: 610 });
  });

  it('겹침 묶음 — N등분 대신 +N 으로 접기 위한 재료 (§4.5)', () => {
    const c = overlapClusters([
      { startMin: 600, endMin: 660 },
      { startMin: 630, endMin: 700 },
      { startMin: 700, endMin: 760 },
    ]);
    expect(c.length).toBe(2);
    expect(c[0].length).toBe(2);
    expect(c[1].length).toBe(1);
  });
});

describe('선택·클립보드 산수 (§5.2)', () => {
  const items = [
    { serId: 1, onDate: '2026-08-19', date: '2026-08-19', startMin: 600, endMin: 660 },
    { serId: 2, onDate: '2026-08-19', date: '2026-08-19', startMin: 780, endMin: 840 },
    { serId: 1, onDate: '2026-08-24', date: '2026-08-24', startMin: 600, endMin: 690 },
  ];

  it('같은 SER라도 onDate가 다르면 다른 회차이고, 분할 표 복제본은 같은 키다', () => {
    expect(occurrenceKey(items[0])).toBe('1|2026-08-19');
    const duplicateView = { ...items[0], date: '2026-08-20' };
    expect(occurrenceKey(duplicateView)).toBe('1|2026-08-19');
    expect(occurrenceKey(items[2])).not.toBe(occurrenceKey(items[0]));
  });

  it('단일·개별 토글·범위 선택이 한 함수에서 계산된다', () => {
    const one = selectOccurrenceKeys(items, [], items[0], 'single');
    expect(one).toEqual(['1|2026-08-19']);
    const many = selectOccurrenceKeys(items, one, items[2], 'range');
    expect(many).toEqual(['1|2026-08-19', '2|2026-08-19', '1|2026-08-24']);
    expect(selectOccurrenceKeys(items, many, items[1], 'toggle')).toEqual([
      '1|2026-08-19', '1|2026-08-24',
    ]);
    expect(selectedOccurrences(items, many)).toEqual(items);
  });

  it('다중 붙여넣기는 첫 건 대비 날짜·시각·길이를 유지한다', () => {
    const placed = relativePlacements(items, '2026-09-07', 540);
    expect(placed.map((x) => ({ date: x.date, startMin: x.startMin, endMin: x.endMin }))).toEqual([
      { date: '2026-09-07', startMin: 540, endMin: 600 },
      { date: '2026-09-07', startMin: 720, endMin: 780 },
      { date: '2026-09-12', startMin: 540, endMin: 630 },
    ]);
  });

  it('다중 이동은 잡은 회차의 delta를 전체에 적용하고 자정을 넘으면 거절한다', () => {
    const moved = movePlacements(items, items[1], '2026-08-20', 810);
    expect(moved?.map((x) => ({ date: x.date, startMin: x.startMin }))).toEqual([
      { date: '2026-08-20', startMin: 630 },
      { date: '2026-08-20', startMin: 810 },
      { date: '2026-08-25', startMin: 630 },
    ]);
    expect(movePlacements(items, items[0], '2026-08-19', -15)).toBeNull();
  });
});
