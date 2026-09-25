/** @file-guide
 * 목적: lesson-name.ts — useLessonName (hook)
 * 책임/재사용: 강사 화면이 수업 한 줄의 이름을 코드표(`GET /meta` subs·kinds)의 낱말로 적게 한다. 판정·데이터 사본을 두지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useMeta } from '@/api/queries';

type LessonKeys = { title?: string | null; subKey?: string | null; kindKey?: string | null };

/**
 * 강사 홈·수업 히스토리·수업 안내가 `l.title ?? l.subKey ?? l.kindKey` 로 **코드값**(`map-read` · `class`)을 찍고 있었다 (QA 0925).
 * 이름은 서버 코드표 한 곳에서 온다(D-R18) — 강사에게도 `/meta` 의 subs·kinds 이름은 내려간다(학생 명단만 빠진다 · 보안 0925).
 * 코드표를 아직 못 받았거나 표에 없는 키면 코드를 보이지 않고 「수업」이라 적는다 — 코드값은 사람의 낱말이 아니다.
 */
export function useLessonName(): (lesson: LessonKeys) => string {
  const meta = useMeta();
  const subs = meta.data?.subs;
  const kinds = meta.data?.kinds;
  return (lesson) =>
    lesson.title
    ?? (lesson.subKey ? subs?.find((sub) => sub.key === lesson.subKey)?.name : undefined)
    ?? (lesson.kindKey ? kinds?.find((kind) => kind.key === lesson.kindKey)?.name : undefined)
    ?? '수업';
}
