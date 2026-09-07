/** 강사 캘린더와 리포트 목록이 같은 상세 조회·작성·내보내기 흐름을 사용한다. */
'use client';

import { useReportDetail } from '@/api/queries';
import type { ReportDetail } from '@/api/types';
import { Banner, Drawer } from '../ui';
import { ReportEditor } from './ReportForm';
import { ReportExportPanel } from './ReportExportPanel';

export function ReportDetailDrawer({ selection, onClose }: {
  selection: Pick<ReportDetail, 'serId' | 'onDate'> | null;
  onClose: () => void;
}) {
  const detail = useReportDetail(selection?.serId, selection?.onDate);
  const data = detail.data;
  return (
    <Drawer open={selection !== null} onClose={onClose} width={720}
      title={data?.canReview ? '리포트 검토' : data?.canEdit ? '리포트 작성' : '리포트 상세'}
      sub={data ? `${data.date} · ${data.subjectName} · ${data.teacherName ?? '담당 강사 없음'}` : undefined}>
      {detail.isLoading ? (
        <Banner tone="neutral">불러오는 중…</Banner>
      ) : detail.isError && !data ? (
        <Banner tone="danger">리포트 상세를 불러오지 못했습니다.</Banner>
      ) : data ? (
        <div key={`${data.id}:${data.state}:${data.submittedAt ?? ''}`}>
          {detail.isError ? (
            <Banner tone="warning">최신 상태를 다시 확인하지 못했습니다. 작성 중인 내용은 유지됩니다.</Banner>
          ) : null}
          <ReportEditor detail={data} subject={data.subjectName} />
          <ReportExportPanel detail={data} />
        </div>
      ) : null}
    </Drawer>
  );
}
