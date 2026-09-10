/** @file-guide
 * 목적: ReportDetailDrawer.tsx — ReportDetailDrawer (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** 강사 캘린더와 리포트 목록이 같은 상세 조회·작성·내보내기 흐름을 사용한다. */
'use client';

import { useReportDetail } from '@/api/queries';
import { ApiError } from '@/api/client';
import type { ReportDetail } from '@/api/types';
import { Banner, Drawer } from '../ui';
import { ReportEditor } from './ReportForm';
import { ReportExportPanel } from './ReportExportPanel';

export function ReportDetailDrawer({ selection, onClose }: {
  selection: Pick<ReportDetail, 'serId' | 'onDate'> | null;
  onClose: () => void;
}) {
  const detail = useReportDetail(selection?.serId, selection?.onDate);
  // 통신 실패와 접근 상실은 다르다. 서버가 접근을 거절한 상세를 이전 캐시로 노출하지 않는다.
  const inaccessible = detail.error instanceof ApiError && [403, 404].includes(detail.error.status);
  const data = inaccessible ? undefined : detail.data;
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
