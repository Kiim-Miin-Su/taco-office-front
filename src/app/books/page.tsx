/** @file-guide
 * 목적: 개발명세서 §38~§41과 최신 수정사항의 교재 화면 다섯 갈래를 한 route에서 조립한다.
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
import { MaterialRequestBoard } from '@/components/materials/MaterialRequests';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { WorkSummaryBar } from '@/components/shell/WorkSummaryBar';
import { Banner, Button, TabCards } from '@/components/ui';
import { useSession } from '@/store/useSession';
import { positiveQueryId } from '@/lib/url-state';

type BookTab = 'progress' | 'tracking' | 'shelf' | 'requests' | 'history';

function tabFromQuery(value: string | null, hasTrackingTarget: boolean): BookTab {
  if (value === 'tracking' || value === 'shelf' || value === 'requests' || value === 'history') return value;
  if (value === null && hasTrackingTarget) return 'tracking';
  return 'progress';
}

export default function BooksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookCreateRequest, setBookCreateRequest] = useState(0);
  const [issueCreateRequest, setIssueCreateRequest] = useState(0);
  const canGpaPack = useSession((state) => state.me?.canGpaPack === true);
  const hasTrackingTarget = searchParams.get('create') === 'issue' || searchParams.has('studentId');
  const queryTab = tabFromQuery(searchParams.get('tab'), hasTrackingTarget);
  const focusPackId = queryTab === 'requests' ? positiveQueryId(searchParams.get('pack')) : null;
  const deepIssueCreate = queryTab === 'tracking' && searchParams.get('create') === 'issue';
  const rawStudentId = searchParams.get('studentId');
  const requestedStudentId = positiveQueryId(rawStudentId);
  const targetRequested = queryTab === 'tracking'
    && (rawStudentId !== null || deepIssueCreate)
    && issueCreateRequest === 0;
  const [tab, setTab] = useState<BookTab>(queryTab);
  useEffect(() => setTab(queryTab), [queryTab]);
  const selectTab = (next: BookTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'progress') params.delete('tab');
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
      value: 'progress' as const,
      label: '진행도',
      sub: `${tracking.data?.books?.length ?? 0}종`,
    },
    {
      value: 'tracking' as const,
      label: '트래킹 보드',
      sub: `${tracking.data?.students.length ?? 0}명`,
      badge: tracking.data?.students.length,
    },
    { value: 'shelf' as const, label: '서가', sub: `${books.data?.items.length ?? 0}종` },
    { value: 'requests' as const, label: '자료 요청', sub: '강사 요청' },
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
              + 배정
            </Button>
          </div>
        </div>
        <div className="mb-3">
          <WorkSummaryBar summary={drawer.data?.workSummary} />
        </div>

        {tab === 'progress' ? (
          <BookTracking view="progress" showCreateAction={false} />
        ) : null}
        {tab === 'tracking' ? (
          <BookTracking
            view="tracking"
            createRequest={issueCreateRequest + (deepIssueCreate ? 1 : 0)}
            showCreateAction={false}
            requestedStudentId={requestedStudentId}
            targetRequested={targetRequested}
          />
        ) : null}
        {tab === 'shelf' ? <BookShelf createRequest={bookCreateRequest} showCreateAction={false} /> : null}
        {tab === 'history' ? <BookHistory /> : null}
        {tab === 'requests' ? (
          <div className="space-y-4">
            <MaterialRequestBoard />
            {canGpaPack ? (
              <details open={focusPackId !== null} className="rounded-xl border border-line bg-card p-4">
                <summary className="h-11 cursor-pointer py-2 text-[13px] font-bold text-fg">
                  과거 자료 전달 · {packs.data?.items.length ?? 0}건 · 진행 중 {pendingPacks}건
                </summary>
                <div className="mt-3 border-t border-line pt-4">
                  <Banner tone="warning" className="mb-3">
                    이 영역은 과거 자료 전달 기록입니다. 새 강사 자료요청과 상태·이력을 합치지 않습니다.
                  </Banner>
                  <BookPacks focusPackId={focusPackId} />
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </AppShell>
    </RequireAuth>
  );
}
