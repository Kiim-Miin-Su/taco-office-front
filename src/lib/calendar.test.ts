/** @file-guide
 * 목적: calendar.test.ts (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { describe, it, expect } from 'vitest';
import {
  addDays, boundingRange, boundsOf, clampSplitRatio, mondayOf, monthBounds, monthGrid, splitPanes, step,
  teacherSchedule, timeRange, todayKst, unsplitPanes, updatePane, weekDays,
} from './calendar';
import type { Occurrence } from '@/api/types';

describe('강사 캘린더 기본 오늘 목록 (§8·§9)', () => {
  const occurrence = (serId: number, date: string, startMin = 600, extra: Partial<Occurrence> = {}): Occurrence => ({
    serId, date, onDate: date, startMin, endMin: startMin + 60, kindKey: 'class',
    mode: 'offline', canceled: false, hasException: false, recurring: true,
    repState: 'plan', written: false, attendanceMode: 'unavailable', attendance: null, students: [], ...extra,
  });

  it('오늘과 다음 7일을 실제 날짜·시작 시각순으로 나누고 원본을 바꾸지 않는다', () => {
    const items = [
      occurrence(2, '2026-09-07', 900), occurrence(7, '2026-09-14'),
      occurrence(1, '2026-09-07', 600), occurrence(8, '2026-09-15'),
      occurrence(0, '2026-09-06'), occurrence(3, '2026-09-08', 900),
      occurrence(4, '2026-09-08', 600, { onDate: '2026-09-01' }),
    ];
    const result = teacherSchedule(items, '2026-09-07');
    expect(result.today.map((o) => o.serId)).toEqual([1, 2]);
    expect(result.upcoming.map((o) => o.serId)).toEqual([4, 3, 7]);
    expect(items.map((o) => o.serId)).toEqual([2, 7, 1, 8, 0, 3, 4]);
    expect(result.today[0]).toBe(items[2]);
  });

  it('취소·휴강과 출결 취소는 목록에 남기되 건수·시수에서 제외한다', () => {
    const result = teacherSchedule([
      occurrence(1, '2026-09-07', 600, { endMin: 690 }),
      occurrence(2, '2026-09-07', 900, { canceled: true }),
      occurrence(3, '2026-09-07', 960, { attendance: {
        id: 1, result: 'canceled', reason: 'academy', countsForPay: false,
        confirmedBy: 1, confirmedByName: '관리자', confirmedAt: '2026-09-07T10:00:00Z',
      } }),
    ], '2026-09-07');
    expect(result.today).toHaveLength(3);
    expect(result.todayCount).toBe(1);
    expect(result.todayMinutes).toBe(90);
  });

  it('빈 응답과 월말·KST 자정 경계를 처리한다', () => {
    expect(teacherSchedule([], '2026-09-30')).toMatchObject({ today: [], upcoming: [], todayCount: 0, todayMinutes: 0 });
    const result = teacherSchedule([occurrence(1, '2026-10-07'), occurrence(2, '2026-10-08')], '2026-09-30');
    expect(result.upcoming.map((o) => o.serId)).toEqual([1]);
    expect(todayKst(Date.parse('2026-09-07T14:59:59Z'))).toBe('2026-09-07');
    expect(todayKst(Date.parse('2026-09-07T15:00:00Z'))).toBe('2026-09-08');
  });
});

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

  it('00시와 24시 인접 수업도 당일 안에서 최소 6시간을 확보한다', () => {
    expect(timeRange([{ startMin: 0, endMin: 60 }])).toEqual({ from: 0, to: 360 });
    expect(timeRange([{ startMin: 1380, endMin: 1440 }])).toEqual({ from: 1080, to: 1440 });
    expect(timeRange([{ startMin: 1430, endMin: 1440 }])).toEqual({ from: 1080, to: 1440 });
    for (let startMin = 0; startMin <= 1425; startMin += 15) {
      for (let duration = 15; duration <= 480 && startMin + duration <= 1440; duration += 15) {
        const endMin = startMin + duration;
        const { from, to } = timeRange([{ startMin, endMin }]);
        expect(from).toBeGreaterThanOrEqual(0);
        expect(from).toBeLessThanOrEqual(startMin);
        expect(to).toBeGreaterThanOrEqual(endMin);
        expect(to).toBeLessThanOrEqual(1440);
        expect(to - from).toBeGreaterThanOrEqual(360);
        expect(from % 60).toBe(0);
        expect(to % 60).toBe(0);
      }
    }
  });

  it('비정상 시간은 정상 수업의 표시 범위를 오염시키지 않고 모두 무효면 기존 기본 범위를 쓴다', () => {
    const invalid = [
      { startMin: Number.NaN, endMin: 660 }, { startMin: 600, endMin: Infinity },
      { startMin: -Infinity, endMin: 660 }, { startMin: -15, endMin: 60 },
      { startMin: 1380, endMin: 1455 }, { startMin: 660, endMin: 600 },
    ];
    expect(timeRange(invalid)).toEqual(timeRange([]));
    const valid = [{ startMin: 600, endMin: 660 }];
    expect(timeRange([...invalid, ...valid])).toEqual(timeRange(valid));
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
  resizePatch, selectOccurrenceKeys, selectedOccurrences, slotStartMin, snap15,
} from './calendar';

describe('드래그 산수 (§5)', () => {
  it('15분 스냅 — 스냅은 15, 셀은 30 (§2.5)', () => {
    expect(snap15(7)).toBe(0);
    expect(snap15(8)).toBe(15);
    expect(snap15(52)).toBe(45);
    expect(minutesFromPx(56)).toBe(60); // 시간당 56px
    expect(minutesFromPx(14)).toBe(15);
  });

  it('드롭한 30분 슬롯과 블록 상단 좌표로 시작 시각을 계산하고 15분 스냅한다', () => {
    expect(slotStartMin(600, 100, 28, 115)).toBe(615); // 1px 장식 오차 포함
    expect(slotStartMin(600, 100, 56, 129)).toBe(615); // 다른 표의 슬롯 밀도
    expect(slotStartMin(900, 100, 28, 115)).toBe(915); // 다른 표의 시간 범위
    expect(slotStartMin(600, -200, 28, -185)).toBe(615); // 스크롤 뒤에도 같은 상대 좌표
  });

  it('좌표 변환은 음수/24시 초과를 clamp하지 않고 시간 검증층에 넘긴다', () => {
    expect(slotStartMin(0, 100, 28, 86)).toBe(-15);
    expect(slotStartMin(1410, 100, 28, 142)).toBe(1455);
  });

  it('좌표나 슬롯 높이가 무효면 시작 시각을 만들지 않는다', () => {
    const args = [600, 100, 28, 114] as const;
    for (const invalid of [Number.NaN, Infinity, -Infinity]) {
      for (let index = 0; index < args.length; index += 1) {
        const input: [number, number, number, number] = [...args];
        input[index] = invalid;
        expect(slotStartMin(...input)).toBeNull();
      }
    }
    expect(slotStartMin(600, 100, 0, 114)).toBeNull();
    expect(slotStartMin(600, 100, -28, 114)).toBeNull();
    expect(slotStartMin(600, -Number.MAX_VALUE, 28, Number.MAX_VALUE)).toBeNull();
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

  it('공용 시간 방어는 NaN/Infinity와 분 단위가 아닌 숫자를 거절한다', () => {
    for (const invalid of [Number.NaN, Infinity, -Infinity, 600.5]) {
      expect(lessonTimeIssue(invalid, 660)).not.toBeNull();
      expect(lessonTimeIssue(600, invalid)).not.toBeNull();
    }
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

  it('단일 이동은 길이를 유지하며 자정을 넘으면 날짜·자원 변경도 함께 거절한다', () => {
    const o = { date: '2026-09-01', startMin: 600, endMin: 690, roomId: 1 };
    expect(movePatch(o, { startMin: 1350 })).toEqual({ startMin: 1350, endMin: 1440 });
    expect(movePatch(o, { startMin: 0 })).toEqual({ startMin: 0, endMin: 90 });
    for (const startMin of [-15, 1365, 1440, Number.NaN, Infinity, -Infinity]) {
      expect(movePatch(o, { startMin, date: '2026-09-02', roomId: 2 })).toBeNull();
    }
    expect(movePatch({ ...o, endMin: Number.NaN }, { startMin: 615 })).toBeNull();
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

  it('단일·다중 이동은 같은 시간 경계를 따르고 무효 항목이 하나라도 있으면 전체 거절한다', () => {
    const source = items[0];
    for (const startMin of [0, 615, 1380]) {
      const patch = movePatch(source, { startMin });
      const placed = movePlacements([source], source, source.date, startMin);
      expect(placed?.[0]).toMatchObject(patch!);
      expect(placed?.map((o) => o.endMin - o.startMin)).toEqual([source.endMin - source.startMin]);
    }
    for (const startMin of [-15, 1395, Number.NaN, Infinity, -Infinity]) {
      expect(movePatch(source, { startMin })).toBeNull();
      expect(movePlacements([source], source, source.date, startMin)).toBeNull();
    }
    expect(movePlacements(items, source, source.date, 1380)).toBeNull();
    expect(movePlacements([...items, { ...source, endMin: Number.NaN }], source, source.date, 615)).toBeNull();
  });
});
