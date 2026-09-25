/** @file-guide
 * 목적: ScreenHeader.tsx — ScreenHeader (component)
 * 책임/재사용: 화면 머리 한 곳. 강사 표면에서는 셸 머리줄(Teacher/Header 의 h1)이 이미 화면 이름을 말하므로 제목을 다시 세우지 않고 부제·오른쪽 도구만 그린다. 관리 화면은 공용 PageHeader 그대로다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 덱 화면(slide 8·11·15·18·25·29·34)의 본문 첫 줄은 제목이 아니라 내용이다 — 화면 이름은 머리줄 「홈 › 불가 시간」 자리에 한 번만 있다.
 * 전에는 머리줄 「불가 시간」 바로 아래에 같은 낱말의 h1 이 또 섰다(wave 5 남김 · 강사 화면 일곱 전부).
 * 판정은 역할 낱말이 아니라 서버 플래그 한 곳(useTeacherSurface — canAdminPage 가 아닌 로그인)이다 (D-R39).
 * `/reports` 처럼 관리 화면과 나눠 쓰는 화면도 이것 하나로 갈린다 — 관리 화면 셸에는 머리줄 제목이 없어 PageHeader 가 그대로 선다.
 */
'use client';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';
import { useTeacherSurface } from './teacher-surface';

export function ScreenHeader({ title, sub, right }: {
  /** 관리 화면에서만 보이는 h1 — 강사 표면에서는 셸 머리줄이 같은 이름을 말한다 */
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  const teacherSurface = useTeacherSurface();
  if (!teacherSurface) return <PageHeader title={title} sub={sub} right={right} />;
  // 강사 표면 — 부제·도구가 없으면 줄 자체를 세우지 않는다(빈 여백이 본문을 밀어내지 않게)
  if (!sub && !right) return null;
  return (
    <div data-screen-header="" className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      {sub ? <p className="min-w-0 text-[12px] text-fg-subtle">{sub}</p> : null}
      {right ? <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}
