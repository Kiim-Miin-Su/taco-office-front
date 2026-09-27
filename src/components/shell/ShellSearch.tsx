/** @file-guide
 * 목적: ShellSearch.tsx — ShellSearch, shellSearchResults (component)
 * 책임/재사용: 관리자 머리줄 「검색 ⌘K」 창. 찾는 대상은 **보는 사람이 이미 볼 수 있는 것**뿐이다 — 화면은 navigation.ts 의 권한 판정(canAccessNavItem), 학생은 GET /meta 의 서버 투영(관리 화면 사용자에게만 학생 목록이 온다)을 그대로 쓴다. 새 조회·새 권한 판정을 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원문 머리줄(§07~ 모든 컷)의 「🔍 검색 ⌘K」. 눌렀을 때의 창은 원문에 없어 D-R44 「원문 기반 유리한 방향」으로
 * **가장 좁게** 지었다: ① 화면 이름(업무 탭 + URL 로만 여는 관리 화면) ② 학생 이름 → 그 학생 시간표(§10 · `?studentId=`).
 * 서버에 새 검색 경로를 두지 않았다 — 검색이 권한을 넓히는 통로가 되지 않게, 이미 받은 목록 안에서만 거른다.
 */
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Me, Meta } from '@/api/types';
import { useMeta } from '@/api/queries';
import { Dialog } from '@/components/ui';
import { SearchField } from '@/components/ui/SearchField';
import { ADMIN_NAV_ITEMS, canAccessNavItem } from './navigation';

export type ShellSearchHit = { key: string; group: '화면' | '학생'; label: string; sub?: string; href: string };

/** 결과 한 묶음에 보이는 최대 줄 — 이름이 흔한 글자면 목록이 창을 넘친다 */
const PER_GROUP = 8;

/** 검색 결과 — 순수 함수(시험이 같은 함수를 부른다). 빈 검색어면 결과 없음 */
export function shellSearchResults(query: string, me: Me | null, students: Meta['students'] | undefined): ShellSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const screens = ADMIN_NAV_ITEMS
    .filter((item) => canAccessNavItem(item, me) && item.label.toLowerCase().includes(q))
    .slice(0, PER_GROUP)
    .map((item): ShellSearchHit => ({ key: `screen:${item.href}`, group: '화면', label: item.label, href: item.href }));
  const people = (students ?? [])
    .filter((s) => s.name.toLowerCase().includes(q))
    .slice(0, PER_GROUP)
    .map((s): ShellSearchHit => ({
      key: `student:${s.id}`, group: '학생', label: s.name,
      sub: [s.grade, s.school].filter(Boolean).join(' · ') || undefined,
      href: `/schedule?studentId=${s.id}`,
    }));
  return [...screens, ...people];
}

export function ShellSearch({ open, onClose, me }: { open: boolean; onClose: () => void; me: Me | null }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Dialog가 닫히면 SearchField만 내려가므로 부모 query를 함께 비우지 않으면
  // 재열 때 빈 입력 아래에 이전 결과가 남는다(P-157).
  useEffect(() => { if (!open) setQuery(''); }, [open]);
  // 코드표는 셸 밖 화면들도 이미 30분 캐시로 들고 있다 — 창이 열렸을 때만 읽는다
  const meta = useMeta(open).data;
  const hits = useMemo(() => shellSearchResults(query, me, meta?.students), [query, me, meta?.students]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <Dialog open={open} onClose={onClose} title="검색" sub="화면 이름 · 학생 이름" width={560} closeX>
      <SearchField label="검색어" placeholder="예: 회계, 강태윤" onQueryChange={setQuery} debounceMs={120} controls="shell-search-results" />
      <div id="shell-search-results" className="mt-3 max-h-[60dvh] overflow-y-auto">
        {query.trim() && hits.length === 0 ? (
          <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">맞는 화면이나 학생이 없습니다.</p>
        ) : null}
        {(['화면', '학생'] as const).map((group) => {
          const rows = hits.filter((hit) => hit.group === group);
          if (!rows.length) return null;
          return (
            <section key={group} className="mb-3" aria-label={group}>
              <h3 className="px-1 pb-1 text-[11px] font-bold text-fg-subtle">{group}</h3>
              <ul className="flex flex-col gap-1">
                {rows.map((hit) => (
                  <li key={hit.key}>
                    <button type="button" onClick={() => go(hit.href)}
                      className="flex w-full items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-left text-[13px] hover:bg-inset">
                      <b className="text-fg">{hit.label}</b>
                      {hit.sub ? <span className="text-[12px] text-fg-subtle">{hit.sub}</span> : null}
                      <span aria-hidden className="ml-auto text-fg-subtle">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
