/** @file-guide
 * 목적: TeacherTodayHero.tsx — TeacherTodayHero, useTeacherClock (component)
 * 책임/재사용: 강사 홈·캘린더가 함께 쓰는 「오늘」 머리 띠. 날짜·건수·시수는 부르는 쪽이 서버 값으로 넘기고, 시각은 강사 본인 시간대(GET /teacher/shell timezone·tzLabel)로만 그린다. 시간대 표·오프셋 사본을 두지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 덱 slide 8 hero — 「25 / 화요일 | 2026년 8월 25일 · 오늘 수업 3건 · 시수 5.5시간 | 18:40 / Seoul · UTC+9 기준」.
 * 전에는 홈이 이 자리에 이번 주 요약을, 캘린더가 「서울 · KST (UTC+9) 기준」을 **글자로 박아** 적었다 —
 * 해외 강사(staff.tz)에게도 서울 시각을 보였다. 시각은 서버가 준 IANA 이름으로만 계산하고 낱말(tzLabel)도 서버 것이다.
 * 시간대를 아직 못 받았으면 시각을 지어내지 않고 비워 둔다(머리줄과 같은 규칙).
 */
'use client';
import { useEffect, useState } from 'react';
import { useTeacherShell } from '@/api/queries';
import { hours } from './format';
import { useTeacherSurface } from './teacher-surface';

const DOW_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const;

/** 1분마다 다시 그리는 지금 시각(ms) — 분이 바뀌는 순간에 맞춘다 */
function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(timer);
  }, []);
  return now;
}

/** 'HH:MM' — 서버가 준 IANA 시간대로. 런타임이 모르는 이름이면 null(지어내지 않는다) */
export function clockIn(timezone: string, at: number): string | null {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  } catch {
    return null;
  }
}

/** 강사 본인 시간대의 지금 시각과 서버 낱말 — 셸 머리줄과 같은 질의 키라 요청이 늘지 않는다 */
export function useTeacherClock(): { time: string | null; tzLabel: string | null } {
  const teacherSurface = useTeacherSurface();
  const shell = useTeacherShell(teacherSurface).data;
  const now = useMinuteNow();
  if (!shell) return { time: null, tzLabel: null };
  return { time: clockIn(shell.timezone, now), tzLabel: shell.tzLabel };
}

export function TeacherTodayHero({ date, lessons, minutes }: {
  /** 'YYYY-MM-DD' — 서버 기준일(홈 todayDate · 캘린더 조회 기준일) */
  date: string;
  /** 오늘 열린 수업 수·시수(분) — 서버 값 또는 같은 서버 목록에서 나온 값. 모르면 null(불러오는 중) */
  lessons: number | null;
  minutes: number | null;
}) {
  const { time, tzLabel } = useTeacherClock();
  const day = Number(date.slice(8, 10));
  const dow = DOW_LONG[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
  return (
    <header data-teacher-hero="" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-fg px-5 py-5 text-white sm:px-6">
      <div className="flex shrink-0 flex-col items-start">
        <span className="text-[40px] font-bold leading-none tabular-nums">{day}</span>
        <span className="mt-1 text-[12px] text-line-2">{dow}</span>
      </div>
      <div className="min-w-0 flex-1 basis-40 border-l border-white/20 pl-4">
        <p className="text-[16px] font-bold">{Number(date.slice(0, 4))}년 {Number(date.slice(5, 7))}월 {day}일</p>
        <p className="mt-1.5 text-[12px] text-line-2">
          {lessons === null || minutes === null
            ? '오늘 수업을 확인하고 있습니다.'
            : `오늘 수업 ${lessons}건 · 시수 ${hours(minutes)}시간`}
        </p>
      </div>
      {time ? (
        <div data-teacher-clock="" className="ml-auto text-right">
          <p className="text-[24px] font-bold leading-none tabular-nums">{time}</p>
          {tzLabel ? <p className="mt-1.5 text-[11px] text-line-2">{tzLabel} 기준</p> : null}
        </div>
      ) : null}
    </header>
  );
}
