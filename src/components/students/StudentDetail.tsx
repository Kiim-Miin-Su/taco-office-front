/** @file-guide
 * 목적: StudentDetail.tsx — 학생 기본정보·보호자·수강 사실·제한된 감사 metadata 조회
 * 책임/재사용: 생성 DTO/학생 읽기 훅/공용 Table·Tabs·KST 표시를 재사용한다. 전체 변경값·기간이력·금융 정보는 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useState } from 'react';
import { ApiError } from '@/api/client';
import { useStudentRead, useStudentReadAllowed, type StudentRead } from '@/api/students';
import { Banner, LinkButton, PageHeader, Panel, QueryState, Table, Tabs, type Column } from '@/components/ui';
import { kstDateTime } from '@/lib/calendar';

type DetailTab = 'profile' | 'history' | 'schedule';
const guardianColumns: Column<StudentRead['guardians'][number]>[] = [
  { key: 'name', head: '보호자', cell: row => row.name },
  { key: 'relation', head: '관계', cell: row => row.relation || '미상' },
  { key: 'primary', head: '주보호자', cell: row => row.isPrimary ? '예' : '아니오' },
  { key: 'active', head: '연결 상태', cell: row => row.active ? '활성' : '비활성' },
];
const enrollmentColumns: Column<StudentRead['enrollments'][number]>[] = [
  { key: 'kind', head: '수업 종류', cell: row => row.kindName },
  { key: 'subject', head: '과목', cell: row => row.subjectName ?? '미상' },
  { key: 'sessions', head: '등록 회차', cell: row => row.sessions ?? '미상' },
  { key: 'startedOn', head: '시작일', cell: row => row.startedOn ?? '미상' },
  { key: 'endedOn', head: '종료일', cell: row => row.endedOn ?? '종료일 미기록' },
];
const entityLabels = { STU: '학생', LEAD: '상담', GUARDIAN: '보호자' } as const;
const historyColumns: Column<StudentRead['history'][number]>[] = [
  { key: 'at', head: '기록 시각 (KST)', cell: row => kstDateTime(row.at) ?? '미상' },
  { key: 'entity', head: '대상', cell: row => `${entityLabels[row.entity]} #${row.entityId}` },
  { key: 'action', head: '행위', cell: row => row.actionLabel },
  { key: 'actor', head: '기록된 작업자', cell: row => `${row.actorName ?? '이름 미상'} (#${row.actorId})` },
];

function Profile({ data }: { data: StudentRead }) {
  const facts = [
    ['학교', data.school], ['학년', data.grade], ['성별', data.genderLabel],
    ['목표 시험', data.targetExam], ['지도 구분', data.guidance], ['언어', data.lang],
    ['기존 등록 시작일', data.startedOn], ['학생 DB 생성일 (KST)', kstDateTime(data.createdAt)],
  ];
  return <>
    <Panel title="현재 학생 정보" sub="미상값은 추정하지 않습니다. 생성 시각과 등록 시작일은 서로 다른 DB 값입니다.">
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">{facts.map(([label, value]) => <div key={label}><dt className="text-fg-subtle">{label}</dt><dd className="mt-1 break-words font-medium text-fg">{value || '미상'}</dd></div>)}</dl>
    </Panel>
    <Panel title={`보호자 ${data.guardianTotal}명`} sub={`기존 연결 기록 최대${data.historyLimit}건 · 연락처는 이 화면에서 노출하지 않습니다.`}>
      <Table columns={guardianColumns} rows={data.guardians} rowKey={row => row.id} empty="연결된 보호자가 없습니다." />
    </Panel>
    <Panel title={`수강 기록 ${data.enrollmentTotal}건`} sub={`기존 ENR 시작일 내림차순 최대${data.historyLimit}건 · 종료일 미기록을 현재 재원 상태로 판정하지 않습니다.`}>
      <div className="overflow-x-auto"><Table columns={enrollmentColumns} rows={data.enrollments} rowKey={row => row.id} empty="수강 기록이 없습니다." className="min-w-[480px]" /></div>
    </Panel>
  </>;
}

export function StudentDetail({ studentId }: { studentId: number | null }) {
  const allowed = useStudentReadAllowed();
  const query = useStudentRead(studentId);
  const [tab, setTab] = useState<DetailTab>('profile');
  if (!allowed) return <Banner tone="warning">학생 상세를 조회할 권한이 없습니다.</Banner>;
  if (studentId === null || !Number.isSafeInteger(studentId) || studentId <= 0) return <Banner tone="warning">잘못된 학생 주소입니다. <LinkButton href="/students" size="sm">학생 목록</LinkButton></Banner>;
  if (query.error instanceof ApiError && query.error.status === 404) return <Banner tone="warning">학생을 찾을 수 없습니다. <LinkButton href="/students" size="sm">학생 목록</LinkButton></Banner>;
  return <QueryState query={query}>{data => <div className="flex flex-col gap-4">
    <PageHeader title={data.label} sub={`학생 #${data.id}`} right={<LinkButton href="/students" size="sm">학생 목록</LinkButton>} />
    <Tabs<DetailTab> ariaLabel="학생 상세 보기" value={tab} onChange={setTab} options={[{ value: 'profile', label: '기본 정보' }, { value: 'history', label: '기록' }, { value: 'schedule', label: '시간표' }]} />
    {tab === 'profile' && <Profile data={data} />}
    {tab === 'history' && <>
      <Banner tone="warning" title="전체 CRUD 변경 이력은 아직 제공하지 않습니다.">학생·연결 상담·보호자의 기존 감사에서 누가, 언제, 어떤 행위를 했는지만 표시합니다. 변경 전후 값, 학교·학년 유효기간, 결제·진단 등 전체 이력은 포함하지 않습니다. 작업자 이름은 현재 직원 이름입니다.</Banner>
      <Panel title={`기존 감사 ${data.historyTotal}건`} sub={`기록 시각 내림차순 · 최근${data.historyLimit}건`}>
        <div className="overflow-x-auto"><Table columns={historyColumns} rows={data.history} rowKey={row => row.id} className="min-w-[540px]" empty="연결된 감사 기록이 없습니다. 변경이 없었다는 뜻은 아닙니다." /></div>
      </Panel>
    </>}
    {tab === 'schedule' && <Panel title="학생 시간표" sub="현재는 공용 시간표의 학생 보기를 엽니다. 상세 화면 안에 시간표를 표시하는 기능은 후속 작업입니다."><LinkButton href={`/schedule?studentId=${data.id}`}>학생 시간표 열기</LinkButton></Panel>}
  </div>}</QueryState>;
}
