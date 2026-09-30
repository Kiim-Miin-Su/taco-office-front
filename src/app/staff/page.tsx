/** @file-guide
 * 목적: page.tsx — 관리자 강사 목록: 최신 등록순 표·검색·선택·상태 변경·Excel용 CSV.
 * 책임/재사용: 생성 DTO와 공용 셸/표를 쓴다. 서버 권한·급여 가림은 API가 판정하며 삭제 정책은 별도 결정까지 연결하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { components } from '@/api/schema';
import { api, apiMessage, getSessionGeneration } from '@/api/client';
import { sessionQueryKey } from '@/api/queries';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { Banner, Button, Checkbox, Chip, Input, Label, LinkButton, PageHeader, Panel, Select, Table, type Column } from '@/components/ui';
import { staffDirectoryCsv } from '@/lib/staff-directory-csv';
import { todayKst } from '@/lib/calendar';
import { useSession } from '@/store/useSession';

type Directory = components['schemas']['StaffDirectoryDto'];
type Row = components['schemas']['StaffDirectoryRowDto'];
type State = 'all' | 'active' | 'inactive';

function downloadSelected(rows: readonly Row[]) {
  const blob = new Blob([staffDirectoryCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `staff-directory-${todayKst()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StaffDirectoryPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const viewerId = useSession((s) => s.me?.id ?? 'anonymous');
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<number, Row>>(new Map());
  const [result, setResult] = useState<string | null>(null);
  const key = sessionQueryKey(['staff-directory', 'list', page, state, search] as const, viewerId);
  // 상세도 staff-directory 앞자락을 쓴다. 낙관 변경은 현재 사용자의 목록에만 적용한다.
  const listQueries = { predicate: (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] === 'staff-directory' && query.queryKey[1] === 'list' && query.queryKey.at(-1) === viewerId };
  const listing = useQuery<Directory>({
    queryKey: key,
    queryFn: async () => (await api.get<Directory>('/drawer/staff-directory', { params: { page, state, search } })).data,
    enabled: viewerId !== 'anonymous',
  });
  const rows = listing.data?.items ?? [];
  const picked = [...selected.values()];
  const pickedIds = new Set(selected.keys());
  const pageAllSelected = rows.length > 0 && rows.every((row) => pickedIds.has(row.id));
  const totalPages = Math.max(1, Math.ceil((listing.data?.total ?? 0) / (listing.data?.pageSize ?? 10)));
  const firstPage = Math.min(Math.max(1, page - 3), Math.max(1, totalPages - 6));
  const pageNumbers = Array.from({ length: Math.min(7, totalPages) }, (_, index) => firstPage + index);

  const bulkStatus = useMutation({
    mutationFn: async ({ target, active }: { target: readonly Row[]; active: boolean }) => {
      const succeeded = Array<boolean>(target.length).fill(false);
      const generation = getSessionGeneration();
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, target.length) }, async () => {
        while (next < target.length) {
          // 대기 중 세션이 바뀐 행을 새 계정의 권한으로 보내지 않는다.
          if (useSession.getState().me?.id !== viewerId || getSessionGeneration() !== generation) break;
          const index = next++;
          try {
            await api.patch(`/drawer/staff/${target[index].id}/active`, { active });
            succeeded[index] = true;
          } catch { /* 해당 행만 실패로 두고 다음 행을 처리한다. */ }
        }
      }));
      return {
        succeeded: target.filter((_, index) => succeeded[index]).map((row) => row.id),
        failed: target.filter((_, index) => !succeeded[index]).map((row) => row.id),
      };
    },
    onMutate: async ({ target, active }) => {
      await qc.cancelQueries(listQueries);
      if (useSession.getState().me?.id === viewerId) {
        const ids = new Set(target.map((row) => row.id));
        qc.setQueriesData<Directory>(listQueries, (old) => old && ({
          ...old, items: old.items.map((row) => ids.has(row.id) ? { ...row, active } : row),
        }));
      }
      setResult(null);
      return { target };
    },
    onSuccess: ({ succeeded, failed }, _variables, context) => {
      if (useSession.getState().me?.id !== viewerId) return;
      if (failed.length) {
        const previous = new Map(context.target.map((row) => [row.id, row.active]));
        const failedIds = new Set(failed);
        qc.setQueriesData<Directory>(listQueries, (old) => old && ({
          ...old, items: old.items.map((row) => failedIds.has(row.id) ? { ...row, active: previous.get(row.id) ?? row.active } : row),
        }));
      }
      setSelected((old) => {
        const next = new Map(old);
        for (const id of succeeded) next.delete(id);
        return next;
      });
      setResult(`${succeeded.length}명 변경 완료${failed.length ? ` · ${failed.length}명 실패: 권한·현재 상태를 확인해 주세요` : ''}`);
    },
    onError: (error, _variables, context) => {
      if (useSession.getState().me?.id !== viewerId) return;
      const previous = new Map(context?.target.map((row) => [row.id, row.active]));
      qc.setQueriesData<Directory>(listQueries, (old) => old && ({
        ...old, items: old.items.map((row) => previous.has(row.id) ? { ...row, active: previous.get(row.id)! } : row),
      }));
      setResult(apiMessage(error));
    },
    onSettled: () => { if (useSession.getState().me?.id === viewerId) void qc.invalidateQueries(listQueries); },
  });

  const columns: Array<Column<Row>> = [
    {
      key: 'select', head: <Checkbox aria-label="이 페이지 강사 모두 선택" checked={pageAllSelected}
        onChange={(event) => {
          const checked = event.currentTarget.checked;
          setSelected((old) => {
            const next = new Map(old);
            for (const row of rows) { if (checked) next.set(row.id, row); else next.delete(row.id); }
            return next;
          });
        }} />, width: 50,
      cell: (row) => <span onClick={(event) => event.stopPropagation()}>
        <Checkbox aria-label={`${row.name} 선택`} checked={pickedIds.has(row.id)} onChange={(event) => {
          const checked = event.currentTarget.checked;
          setSelected((old) => {
            const next = new Map(old);
            if (checked) next.set(row.id, row); else next.delete(row.id);
            return next;
          });
        }} />
      </span>,
    },
    { key: 'name', head: '한글 이름', cell: (row) => <LinkButton href={`/staff/${row.id}`} variant="ghost" size="sm" onClick={(event) => event.stopPropagation()}>{row.name}</LinkButton> },
    { key: 'english', head: '영문명', cell: (row) => row.englishName ?? <span className="text-fg-subtle">미등록</span> },
    { key: 'title', head: '직함', cell: (row) => row.title ?? '—' },
    { key: 'status', head: '상태', cell: (row) => <Chip tone={row.active ? 'success' : 'neutral'}>{row.active ? '사용 중' : '사용 중지'}</Chip> },
    { key: 'hired', head: '입사일', cell: (row) => row.hiredOn ?? '—' },
    { key: 'registered', head: '등록일', cell: (row) => row.createdAt.replace('T', ' ').slice(0, 16) },
  ];

  return <RequireAuth><AppShell>
    <PageHeader title="강사" sub="최신 등록 순 · 이름과 상태로 찾고 상세 이력을 봅니다" />
    <Panel title="강사 목록" sub={listing.data ? `전체 ${listing.data.total}명 · ${page}/${totalPages}페이지` : '불러오는 중…'}>
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault(); setSearch(searchDraft.trim()); setPage(1); setResult(null);
      }}>
        <div className="min-w-48 flex-1"><Label htmlFor="staff-search">이름 검색</Label>
          <Input id="staff-search" value={searchDraft} maxLength={80} onChange={(event) => setSearchDraft(event.currentTarget.value)} placeholder="강사 이름" />
        </div>
        <div className="w-36"><Label htmlFor="staff-state">상태</Label>
          <Select id="staff-state" value={state} onChange={(event) => { setState(event.currentTarget.value as State); setPage(1); setResult(null); }}>
            <option value="all">전체</option><option value="active">사용 중</option><option value="inactive">사용 중지</option>
          </Select>
        </div>
        <Button type="submit">검색</Button>
      </form>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-fg-subtle">선택 {picked.length}명</span>
        <Button size="sm" disabled={!picked.length || bulkStatus.isPending} onClick={() => bulkStatus.mutate({ target: picked, active: true })}>다시 사용</Button>
        <Button size="sm" disabled={!picked.length || bulkStatus.isPending} onClick={() => bulkStatus.mutate({ target: picked, active: false })}>사용 중지</Button>
        <Button size="sm" disabled={!picked.length || bulkStatus.isPending} onClick={() => downloadSelected(picked)}>Excel용 CSV</Button>
        {bulkStatus.isPending ? <span role="status" className="text-[12px] text-fg-subtle">변경 중…</span> : null}
      </div>
      {result ? <Banner tone={result.includes('실패') ? 'warning' : 'success'} className="mb-3">{result}</Banner> : null}
      {listing.isError ? <Banner tone="danger" className="mb-3">{apiMessage(listing.error)}</Banner> : null}
      <div className="overflow-x-auto"><Table columns={columns} rows={rows} rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/staff/${row.id}`)} empty={listing.isLoading ? '강사를 불러오는 중…' : '조건에 맞는 강사가 없습니다'} />
      </div>
      <nav aria-label="강사 목록 페이지" className="mt-4 flex flex-wrap gap-1">
        {pageNumbers.map((number) => <Button key={number} size="sm" variant={number === page ? 'primary' : 'secondary'}
          aria-current={number === page ? 'page' : undefined} onClick={() => setPage(number)}>{number}</Button>)}
      </nav>
    </Panel>
  </AppShell></RequireAuth>;
}
