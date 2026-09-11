/** @file-guide
 * 목적: ScheduleSidebar.tsx — ScheduleSidebar (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §07 좌측 사이드바 — 도구 다섯·KST 안내·프로그램/과목 집계·표 나누기·«사이드 접기».
 * 집계는 화면이 이미 읽은 bounding 조회를 그대로 세며(§4 GET 0회), 새 조회를 만들지 않는다.
 * 자동 연계·가능 시간은 원본에 있으나 대응 기능이 아직 없어 비활성으로 표기한다.
 */
'use client';
import { useMemo } from 'react';
import { CalendarClock, ChevronsLeft, History, Link2, Plus, UserPlus } from 'lucide-react';
import type { Meta, Occurrence } from '@/api/types';
import { useWorkspace } from '@/store/useWorkspace';

const GROUP_LABEL: Record<'lesson' | 'intake' | 'meeting', string> = { lesson: '수업', intake: '상담·진단', meeting: '회의' };

function CountRow({ color, name, count }: { color: string; name: string; count: number }) {
  return (
    <li className="flex items-center gap-2 px-1 py-0.5 text-[12px]">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg">{name}</span>
      <span className="font-bold text-fg-subtle">{count}</span>
    </li>
  );
}

export function ScheduleSidebar({ meta, items, canEdit, splitOn, onCreate, onHistory, onSplit }: {
  meta?: Meta;
  items: Occurrence[];
  canEdit: boolean;
  splitOn: boolean;
  onCreate: () => void;
  onHistory: () => void;
  onSplit: () => void;
}) {
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar);
  const { kindCounts, subCounts } = useMemo(() => {
    const kind = new Map<string, number>();
    const sub = new Map<string, number>();
    for (const o of items) {
      kind.set(o.kindKey, (kind.get(o.kindKey) ?? 0) + 1);
      if (o.subKey) sub.set(o.subKey, (sub.get(o.subKey) ?? 0) + 1);
    }
    return { kindCounts: kind, subCounts: sub };
  }, [items]);

  const groups = useMemo(() => {
    const out: Array<{ grp: 'lesson' | 'intake' | 'meeting'; total: number; kinds: NonNullable<Meta['kinds']> }> = [];
    for (const grp of ['lesson', 'intake', 'meeting'] as const) {
      const kinds = (meta?.kinds ?? []).filter((k) => k.grp === grp);
      if (!kinds.length) continue;
      out.push({ grp, total: kinds.reduce((n, k) => n + (kindCounts.get(k.key) ?? 0), 0), kinds });
    }
    return out;
  }, [meta, kindCounts]);

  const subs = useMemo(() => (meta?.subs ?? []).filter((s) => (subCounts.get(s.key) ?? 0) > 0), [meta, subCounts]);

  return (
    <div className="flex h-full w-[190px] flex-col gap-3 overflow-y-auto p-3">
      <div className="flex flex-col gap-1.5">
        <button type="button" onClick={onCreate} disabled={!canEdit}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-[12px] font-bold text-white disabled:opacity-40">
          <Plus size={14} aria-hidden />일정 추가
        </button>
        <button type="button" disabled title="자동 연계 — 준비 중"
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-inset text-[12px] font-bold text-fg-subtle opacity-40">
          <Link2 size={14} aria-hidden />자동 연계
        </button>
        <button type="button" disabled title="가능 시간 — 준비 중"
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-inset text-[12px] font-bold text-fg-subtle opacity-40">
          <CalendarClock size={14} aria-hidden />가능 시간
        </button>
        <button type="button" onClick={onHistory}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-[12px] font-bold text-fg hover:bg-inset">
          <History size={14} aria-hidden />변경 이력
        </button>
        <a href="/intake"
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-[12px] font-bold text-fg hover:bg-inset">
          <UserPlus size={14} aria-hidden />신규 학생 등록
        </a>
      </div>

      <div className="rounded-lg border border-line bg-inset px-2.5 py-2 text-[11px] leading-relaxed text-fg-subtle">
        <b className="text-fg">서울 KST 고정</b>
        <br />관리자 화면은 항상 한국 시간
      </div>

      <div className="min-h-0">
        {groups.map(({ grp, total, kinds }) => (
          <section key={grp} className="mb-2">
            <h3 className="flex items-center px-1 py-1 text-[11px] font-bold text-fg-subtle">
              {GROUP_LABEL[grp]}<span className="ml-auto">{total}</span>
            </h3>
            <ul>{kinds.map((k) => <CountRow key={k.key} color={k.color} name={k.name} count={kindCounts.get(k.key) ?? 0} />)}</ul>
          </section>
        ))}
        {subs.length ? (
          <section className="mb-2">
            <h3 className="flex items-center px-1 py-1 text-[11px] font-bold text-fg-subtle">
              과목<span className="ml-auto">{subs.reduce((n, s) => n + (subCounts.get(s.key) ?? 0), 0)}</span>
            </h3>
            <ul>{subs.map((s) => <CountRow key={s.key} color={s.color} name={s.name} count={subCounts.get(s.key) ?? 0} />)}</ul>
          </section>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-1.5">
        <button type="button" onClick={onSplit}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-[12px] font-bold text-fg hover:bg-inset">
          {splitOn ? '분할 해제' : '표 나누기'}
        </button>
        <button type="button" onClick={toggleSidebar} aria-label="사이드 접기"
          className="flex h-9 items-center justify-center gap-1 rounded-lg border border-line bg-card text-[12px] font-bold text-fg-subtle hover:bg-inset">
          <ChevronsLeft size={14} aria-hidden />사이드 접기
        </button>
      </div>
    </div>
  );
}
