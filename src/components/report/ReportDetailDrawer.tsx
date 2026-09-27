/** @file-guide
 * 목적: ReportDetailDrawer.tsx — ReportDetailDrawer, ReportDetailPane, ReportSelection (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** 강사 캘린더와 리포트 목록이 같은 상세 조회·작성·내보내기 흐름을 사용한다. */
'use client';

import { useReportDetail } from '@/api/queries';
import { ApiError } from '@/api/client';
import type { ReportDetail } from '@/api/types';
import { KO_DOW, dowOf } from '@/lib/calendar';
import { reportTimeLabel } from '@/lib/report-export';
import { Banner, Button, Drawer, StatusBadge } from '../ui';
import { ReportEditor } from './ReportForm';
import { ReportExportPanel } from './ReportExportPanel';

export type ReportSelection = Pick<ReportDetail, 'serId' | 'onDate'> & { studentId?: number };

/** 상세 조회 한 벌 — 서랍과 강사 작성 칸(덱 18 오른쪽)이 같은 판정을 쓴다 */
function useSelectedReport(selection: ReportSelection | null) {
  const detail = useReportDetail(selection?.serId, selection?.onDate);
  // 통신 실패와 접근 상실은 다르다. 서버가 접근을 거절한 상세를 이전 캐시로 노출하지 않는다.
  const inaccessible = detail.error instanceof ApiError && [403, 404].includes(detail.error.status);
  return { detail, data: inaccessible ? undefined : detail.data };
}

function ReportDetailBody({ detail, data, studentId }: {
  detail: ReturnType<typeof useReportDetail>;
  data: ReportDetail | undefined;
  studentId?: number;
}) {
  return detail.isLoading ? (
    <Banner tone="neutral">불러오는 중…</Banner>
  ) : detail.isError && !data ? (
    <Banner tone="danger">리포트 상세를 불러오지 못했습니다.</Banner>
  ) : data ? (
    <div key={`${data.id}:${data.state}:${data.submittedAt ?? ''}:${studentId ?? ''}`}>
      {detail.isError ? (
        <Banner tone="warning">최신 상태를 다시 확인하지 못했습니다. 작성 중인 내용은 유지됩니다.</Banner>
      ) : null}
      <ReportEditor detail={data} subject={data.subjectName} />
      <ReportExportPanel detail={data} initialStudentId={studentId} />
    </div>
  ) : null;
}

export function ReportDetailDrawer({ selection, onClose }: {
  selection: ReportSelection | null;
  onClose: () => void;
}) {
  const { detail, data } = useSelectedReport(selection);
  return (
    <Drawer open={selection !== null} onClose={onClose} width={720}
      title={data?.canReview ? '리포트 검토' : data?.canEdit ? '리포트 작성' : '리포트 상세'}
      sub={data ? `${data.date} · ${data.subjectName} · ${data.teacherName ?? '담당 강사 없음'}` : undefined}>
      <ReportDetailBody detail={detail} data={data} studentId={selection?.studentId} />
    </Drawer>
  );
}

/** 덱 머리의 날짜 — 「2026년 8월 25일 (화)」 */
const paneDate = (iso: string): string => `${iso.slice(0, 4)}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일 (${KO_DOW[dowOf(iso)]})`;

/**
 * 강사 덱 slide 18·19 오른쪽 — 목록 옆에 펼친 작성 칸(7-3 ④). 머리(학생 · 과목 / 날짜 · 시각 / 상태)만 이 칸의 것이고
 * 조회 · 편집 · 내보내기는 서랍과 한 벌이다(ReportDetailBody). 좁은 화면에서는 「‹ 목록」으로 목록에 돌아간다.
 */
export function ReportDetailPane({ selection, onBack }: {
  selection: ReportSelection;
  onBack?: () => void;
}) {
  const { detail, data } = useSelectedReport(selection);
  const students = data?.students.map((student) => student.name).join(' · ') || '학생 없음';
  return (
    <section aria-label={data ? `${students} · ${data.subjectName} 리포트` : '리포트'} className="rounded-xl border border-line bg-card">
      <header className="flex flex-wrap items-start gap-2 border-b border-line px-4 py-3">
        {onBack ? <Button size="sm" className="lg:hidden" onClick={onBack}>‹ 목록</Button> : null}
        <div className="min-w-0 grow">
          <h2 className="truncate text-[16px] font-bold text-fg">{data ? `${students} · ${data.subjectName}` : '리포트'}</h2>
          {data ? <p className="mt-0.5 text-[12px] text-fg-subtle">{`${paneDate(data.date)} ${reportTimeLabel(data)}`}</p> : null}
        </div>
        {data ? <StatusBadge state={data.state} /> : null}
      </header>
      <div className="p-4">
        <ReportDetailBody detail={detail} data={data} studentId={selection.studentId} />
      </div>
    </section>
  );
}
