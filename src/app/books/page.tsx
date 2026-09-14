/** @file-guide
 * 목적: 개발명세서 §38~§41 교재 화면 네 갈래를 한 route에서 조립한다.
 * 책임/재사용: 탭 선택만 소유하고, 서버 상태·CRUD는 books 도메인 컴포넌트와 Query 캐시를 재사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 탭 06 교재 — §38 학생별 트래킹 · §39 서가 · §40 이력 · §41 자료 전달.
 * 관리자 route이므로 전역 RouteAccess가 본문 hook을 mount하기 전에 `canAdminPage && canCrudAll`로 차단한다.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useBooks, useBookHistory, useBookPacks, useBookTracking, useDrawer } from '@/api/queries';
import { BookPacks } from '@/components/books/BookPacks';
import { BookShelf } from '@/components/books/BookShelf';
import { BookTracking } from '@/components/books/BookTracking';
import { BookHistory } from '@/components/books/BookVersions';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { WorkSummaryBar } from '@/components/shell/WorkSummaryBar';
import { Button, TabCards } from '@/components/ui';
import { useSession } from '@/store/useSession';
import { positiveQueryId } from '@/lib/url-state';

type BookTab = 'tracking' | 'shelf' | 'requests' | 'history';

function tabFromQuery(value: string | null, canGpaPack: boolean): BookTab {
  if (value === 'shelf' || value === 'history') return value;
  if (value === 'requests' && canGpaPack) return value;
  return 'tracking';
}

export default function BooksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookCreateRequest, setBookCreateRequest] = useState(0);
  const [issueCreateRequest, setIssueCreateRequest] = useState(0);
  const canGpaPack = useSession((state) => state.me?.canGpaPack === true);
  const queryTab = tabFromQuery(searchParams.get('tab'), canGpaPack);
  const focusPackId = queryTab === 'requests' ? positiveQueryId(searchParams.get('pack')) : null;
  const [tab, setTab] = useState<BookTab>(queryTab);
  useEffect(() => setTab(queryTab), [queryTab]);
  const selectTab = (next: BookTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'tracking') params.delete('tab');
    else params.set('tab', next);
    const query = params.toString();
    router.replace(query ? `/books?${query}` : '/books', { scroll: false });
  };
  const books = useBooks();
  const tracking = useBookTracking();
  const packs = useBookPacks(canGpaPack);
  const history = useBookHistory();
  const drawer = useDrawer();
  const pendingPacks = packs.data?.items.filter((pack) => pack.state !== 'received').length ?? 0;
  const nowCount = drawer.data?.workSummary.now;
  const tabs = [
    {
      value: 'tracking' as const,
      label: '트래킹 보드',
      sub: `${tracking.data?.students.length ?? 0}명`,
      badge: tracking.data?.students.length,
    },
    { value: 'shelf' as const, label: '서가', sub: `${books.data?.items.length ?? 0}종` },
    ...(canGpaPack
      ? [{ value: 'requests' as const, label: '자료 요청', sub: `${packs.data?.items.length ?? 0}건`, badge: pendingPacks }]
      : []),
    { value: 'history' as const, label: '이력', sub: `${history.data?.total ?? 0}건` },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="mb-3 flex flex-wrap items-start gap-4">
          <div className="min-w-[255px]">
            <h1 className="text-[20px] font-bold text-fg">교재</h1>
            <p className="mt-1 text-[12px] text-fg-subtle">학생마다 어디까지 갔는지 한 줄로 봅니다</p>
          </div>
          <TabCards<BookTab> label="교재 업무" options={tabs} value={tab} onChange={selectTab} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              aria-label={nowCount == null ? '경고 불러오는 중' : `경고 ${nowCount}`}
              onClick={() => selectTab('shelf')}
            >
              <AlertTriangle size={15} aria-hidden />
              {nowCount ?? '—'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                selectTab('shelf');
                setBookCreateRequest((value) => value + 1);
              }}
            >
              + 교재
            </Button>
            <Button
              onClick={() => {
                selectTab('tracking');
                setIssueCreateRequest((value) => value + 1);
              }}
            >
              + 배부
            </Button>
          </div>
        </div>
        <div className="mb-3">
          <WorkSummaryBar summary={drawer.data?.workSummary} />
        </div>

        {tab === 'tracking' ? <BookTracking createRequest={issueCreateRequest} showCreateAction={false} /> : null}
        {tab === 'shelf' ? <BookShelf createRequest={bookCreateRequest} showCreateAction={false} /> : null}
        {tab === 'history' ? <BookHistory /> : null}
        {tab === 'requests' && canGpaPack ? <BookPacks focusPackId={focusPackId} /> : null}
      </AppShell>
    </RequireAuth>
  );
}
