/** @file-guide
 * 목적: §50 리포트 전문 — 어제 보내기 큐에서 「전문 보기」로 연 리포트를 공용 Dialog 에 미리보기+내보내기만으로 보인다.
 * 책임/재사용: 공용 Dialog 와 ReportExportPanel(ReportPreview·복사·PNG)을 재사용한다. 작성·검토 입력은 싣지 않는다 — 그것은 ReportDetailDrawer 몫이다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import type { ReportDetail } from '@/api/types';
import { Button, Dialog } from '../ui';
import { ReportExportPanel } from './ReportExportPanel';

/**
 * 원본 §50 은 가운데 **모달** 「리포트 전문」에 학부모 문서만 싣고 아래에 「글자로 복사 · PNG로 저장」과 「닫기」를 둔다.
 * 발송 큐가 이미 가진 같은 조회 스냅숏(ReportDetail)을 그대로 그린다 — 보낼 PNG 와 같은 본문이다.
 * 학생 묶음 전문(하루치 한 문서)은 파일 이름 결정(N-60)과 함께 정할 일이라 여기서는 수업 한 건 그대로다.
 */
export function ReportFullTextDialog({ report, studentId, onClose }: {
  report: ReportDetail | null;
  studentId?: number;
  onClose: () => void;
}) {
  return (
    <Dialog open={report !== null} onClose={onClose} width={760} title="리포트 전문" footer={<Button onClick={onClose}>닫기</Button>}>
      {report ? (
        <div className="max-h-[70vh] overflow-y-auto">
          <ReportExportPanel key={`${report.id}:${studentId ?? ''}`} detail={report} initialStudentId={studentId} showHistory={false} />
        </div>
      ) : null}
    </Dialog>
  );
}
