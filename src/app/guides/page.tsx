/** @file-guide
 * 목적: page.tsx — 개발명세서 v2 §43~§45 수업 안내 라우트의 탭과 공용 작업 버튼을 조립한다.
 * 책임/재사용: 화면 선택만 소유하고 데이터·업무 판정·세부 상호작용은 GuidesTodo/GuideHistory/GuideStudents에 위임한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';

import { useState } from 'react';
import { useGuides } from '@/api/queries';
import { GuideHistory } from '@/components/guides/GuideHistory';
import { GuideStudents } from '@/components/guides/GuideStudents';
import { GuidesTodo } from '@/components/guides/GuidesTodo';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Button, LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { QueryState } from '@/components/ui/QueryState';
import { TabCards } from '@/components/ui/TabCards';

type GuidePageTab = 'todo' | 'history' | 'students';

export default function GuidesPage() {
  const [tab, setTab] = useState<GuidePageTab>('todo');
  const guides = useGuides();

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="수업 안내"
          sub="한 번 신규·강사 교체 · 매번 온라인 줌 계정"
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <LinkButton href="/zoom" size="sm">
                줌 계정 관리
              </LinkButton>
              <LinkButton href="/phrases" size="sm">
                문구 관리
              </LinkButton>
              <LinkButton href="/schedule" size="sm">
                + 수업 추가
              </LinkButton>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setTab('todo');
                  requestAnimationFrame(() => document.getElementById('guide-once')?.scrollIntoView({ behavior: 'smooth' }));
                }}
              >
                + 안내 작성
              </Button>
            </div>
          }
        />

        <TabCards<GuidePageTab>
          className="mb-4"
          label="수업 안내 화면"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'todo', label: '할 일', sub: '한 번 + 매번', badge: guides.data?.todoCount },
            { value: 'history', label: '이력', sub: '기간별 기록' },
            { value: 'students', label: '학생별', sub: '최신 안내' },
          ]}
        />

        {tab === 'todo' ? (
          <QueryState query={guides} isEmpty={() => false}>
            {(data) => <GuidesTodo data={data} />}
          </QueryState>
        ) : tab === 'history' ? (
          <GuideHistory />
        ) : (
          <GuideStudents />
        )}
      </AppShell>
    </RequireAuth>
  );
}
