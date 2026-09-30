/** @file-guide
 * 목적: StudentDirectory.tsx — 현재 등록된 학생의 최신10명·검색·학년·페이지 읽기 화면
 * 책임/재사용: 공용 Table/QueryState/입력과 학생 생성계약을 사용한다. LEAD·재원상태·국가·일괄쓰기 완료를 주장하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStudentDirectory, useStudentReadAllowed, type StudentDirectoryRow } from '@/api/students';
import { Banner, Button, Input, Label, PageHeader, QueryState, Select, Table, type Column } from '@/components/ui';
import { kstDateTime } from '@/lib/calendar';

const columns: Column<StudentDirectoryRow>[] = [
  { key: 'name', head: '학생명', cell: row => <Link href={`/students/${row.id}`} onClick={event => event.stopPropagation()} className="font-bold text-primary underline underline-offset-2">{row.label}</Link> },
  { key: 'guardians', head: '보호자명', cell: row => row.guardianNames.join(', ') || '미등록' },
  { key: 'school', head: '학교', cell: row => row.school || '미상' },
  { key: 'grade', head: '학년', cell: row => row.grade || '미상' },
  { key: 'gender', head: '성별', cell: row => row.genderLabel || '미상' },
  { key: 'createdAt', head: '학생 DB 생성일 (KST)', cell: row => kstDateTime(row.createdAt) ?? '미상' },
];

export function StudentDirectory() {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [q, setQuery] = useState('');
  const [grade, setGrade] = useState('');
  const [page, setPage] = useState(1);
  const allowed = useStudentReadAllowed();
  const query = useStudentDirectory({ q: q || undefined, grade: grade || undefined, page });
  if (!allowed) return <Banner tone="warning">학생 목록을 조회할 권한이 없습니다.</Banner>;
  return <div className="flex flex-col gap-4">
    <PageHeader title="학생" sub="학생 DB 생성일 내림차순 · 같은 시각은 학생 ID 내림차순 · 한 페이지10명" />
    <Banner tone="neutral">현재 학생으로 등록된 기록만 조회합니다. 상담 중인 리드 통합 검색, 재원 상태·거주 국가 필터와 일괄 작업은 아직 제공하지 않습니다.</Banner>
    <form aria-label="학생 검색" className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setPage(1); }}>
      <div className="min-w-0 flex-1"><Label htmlFor="student-query">이름·학교·학년 검색</Label><Input id="student-query" type="search" maxLength={80} value={draft} onChange={event => setDraft(event.target.value)} /></div>
      <div><Label htmlFor="student-grade">학년</Label><Select id="student-grade" value={grade} onChange={event => { setGrade(event.target.value); setPage(1); }}>
        <option value="">전체 학년</option>
        {(query.data?.grades ?? []).map(value => <option key={value} value={value}>{value}</option>)}
      </Select></div>
      <Button type="submit" variant="primary">검색</Button>
      <Button onClick={() => { setDraft(''); setQuery(''); setGrade(''); setPage(1); }}>초기화</Button>
    </form>
    <QueryState query={query}>{data => <>
      <div className="overflow-x-auto"><Table columns={columns} rows={data.items} rowKey={row => row.id} onRowClick={row => router.push(`/students/${row.id}`)} empty="조건에 맞는 학생이 없습니다." className="min-w-[640px]" /></div>
      <nav aria-label="학생 목록 페이지" className="flex flex-wrap items-center justify-between gap-3 text-xs text-fg-subtle">
        <span>총 {data.total}명 · {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}페이지</span>
        <div className="flex gap-2"><Button size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>이전</Button><Button size="sm" disabled={page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>다음</Button></div>
      </nav>
    </>}</QueryState>
  </div>;
}
