/** @file-guide
 * 목적: page.tsx — PhrasesPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 문구 관리 — **§43 머리의 「문구 관리」가 가는 자리**.
 *
 * 이 화면은 원본 61컷에 없다. §43 머리에 단추만 있고 목적지가 없었다 —
 * `/zoom`·`/programs` 와 같은 경우이고, 같은 대표 결정(2026-09-12)으로 신설했다.
 *
 * **틀은 안내와 끊어져 있다.** 안내를 쓸 때 본문을 **복사해** 넣고, 그 뒤로 틀을 고쳐도
 * 이미 쓴 안내는 안 바뀐다 — 보낸 말이 나중에 달라지면 안 되기 때문이다.
 * (`guide` 표에 `gtpl_id` 가 없는 것이 그 뜻이다.)
 *
 * **지우기를 두지 않는다.** 원문에 지우는 자리가 없고, 끄는 자리도 없다 —
 * 없는 동작을 지어내지 않는다 (`/programs` 의 프로그램과 같은 결).
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Input, Label, PageHeader, Panel, Table, Textarea, type Column } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useCreateGuideTemplate, useGuideTemplates, usePatchGuideTemplate } from '@/api/queries';
import type { GuideTemplate } from '@/api/types';

const EMPTY = { name: '', body: '' };

export default function PhrasesPage() {
  const q = useGuideTemplates();
  const create = useCreateGuideTemplate();
  const patch = usePatchGuideTemplate();
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<GuideTemplate | null>(null);

  const cols: Array<Column<GuideTemplate>> = [
    { key: 'n', head: '이름', width: 200, cell: (r) => <span className="font-bold">{r.name}</span> },
    {
      key: 'b', head: '문구', cell: (r) => (
        <span className="line-clamp-2 whitespace-pre-wrap text-fg-subtle">{r.body}</span>
      ),
    },
    {
      key: 'x', head: '', width: 80,
      cell: (r) => <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>고치기</Button>,
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <PageHeader
          title="문구 관리"
          sub="안내를 쓸 때 꺼내 쓰는 문구 틀입니다. 틀을 고쳐도 이미 쓴 안내는 바뀌지 않습니다."
        />

        <Banner tone="info" className="mb-4">
          안내를 만들 때 <b>본문을 복사해</b> 넣습니다. 그래서 여기서 문구를 고쳐도
          <b> 이미 보낸 안내의 말은 그대로</b>입니다 — 학부모가 받은 말이 나중에 달라지면 안 되기 때문입니다.
        </Banner>

        <Panel className="mb-4" title="문구 추가">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="p-name">이름</Label>
              <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="첫 수업 안내" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="p-body">문구</Label>
              <Textarea id="p-body" rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
          </div>
          {create.isError ? <Banner tone="danger" className="mt-3">{apiMessage(create.error)}</Banner> : null}
          <div className="mt-3 flex justify-end">
            <Button
              disabled={create.isPending || form.name.trim() === '' || form.body.trim() === ''}
              onClick={() => create.mutate(
                { name: form.name.trim(), body: form.body },
                { onSuccess: () => setForm({ ...EMPTY }) },
              )}
            >
              만들기
            </Button>
          </div>
        </Panel>

        {editing ? (
          <Panel className="mb-4" title={`「${editing.name}」 고치기`} sub="이미 쓴 안내는 바뀌지 않습니다">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="e-name">이름</Label>
                <Input id="e-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="e-body">문구</Label>
                <Textarea id="e-body" rows={4} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              </div>
            </div>
            {patch.isError ? <Banner tone="danger" className="mt-3">{apiMessage(patch.error)}</Banner> : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>취소</Button>
              <Button
                disabled={patch.isPending || editing.name.trim() === '' || editing.body.trim() === ''}
                onClick={() => patch.mutate(
                  { id: editing.id, name: editing.name.trim(), body: editing.body },
                  { onSuccess: () => setEditing(null) },
                )}
              >
                저장
              </Button>
            </div>
          </Panel>
        ) : null}

        <Panel title={`문구 ${q.data?.length ?? 0}개`}>
          <Table
            columns={cols}
            rows={q.data ?? []}
            rowKey={(r) => r.id}
            empty={q.isLoading ? '불러오는 중…' : '문구가 없습니다'}
          />
        </Panel>
      </AppShell>
    </RequireAuth>
  );
}
