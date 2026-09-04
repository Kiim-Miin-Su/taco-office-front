import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportDeliveryQueue as Queue, ReportDetail } from '@/api/types';
import * as queries from '@/api/queries';
import * as reportExport from '@/lib/report-export';
import { ReportDeliveryQueue } from './ReportDeliveryQueue';

vi.mock('@/api/queries', () => ({
  useReportDelivery: vi.fn(),
  useReportDeliverySend: vi.fn(),
}));

const report = (id: number, studentId: number, studentName: string): ReportDetail => ({
  id, serId: id + 100, date: '2026-09-04', onDate: '2026-09-04', startMin: 960,
  subKey: 'ap-chem', kindKey: 'class', teacherId: 3, teacherName: '강사', state: 'ok', written: true,
  students: [{ id: studentId, name: studentName, grade: '고2', deliver: true }],
  minutesSinceEnd: 30, penalty: 0,
  body: { content: '수업', progress: '42p', homework: '43p' },
  fields: [
    { key: 'content', label: '③ 수업 내용', hint: '', min: 1, max: 2000 },
    { key: 'progress', label: '④ 진도', hint: '', min: 1, max: 2000 },
    { key: 'homework', label: '⑤ 과제', hint: '', min: 1, max: 2000 },
  ],
  canEdit: false, canReview: false, canExport: true, canDeliver: true,
  exportFiles: [{
    studentId,
    fileName: `20260904_${studentName}_고2_AP Chemistry_16:00.png`,
    plainText: `${studentName} 서버 본문`,
  }],
  subjectName: 'AP Chemistry', lang: 'ko', writtenAt: '2026-09-04T08:00:00Z',
  submittedAt: '2026-09-04T08:00:00Z', reviewedAt: '2026-09-04T09:00:00Z', rejectReason: null,
});

const first = report(11, 21, '학생A');
const second = report(12, 22, '학생B');
const blocked = report(13, 23, '학생C');

const queue: Queue = {
  onDate: '2026-09-04', total: 3, remaining: 2, blocked: 1,
  students: [
    { student: first.students[0], reports: [first], canSend: true, blockedCount: 0, lastSendId: null, lastSentAt: null },
    { student: second.students[0], reports: [second], canSend: true, blockedCount: 0, lastSendId: null, lastSentAt: null },
    { student: blocked.students[0], reports: [blocked], canSend: false, blockedCount: 1, lastSendId: null, lastSentAt: null },
  ],
};

describe('ReportDeliveryQueue — 학생 단위 계약 재사용', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    vi.mocked(queries.useReportDelivery).mockReturnValue({ data: queue, isLoading: false, isError: false } as never);
    vi.mocked(queries.useReportDeliverySend).mockReturnValue({ mutateAsync, isPending: false } as never);
    mutateAsync.mockReset();
    vi.spyOn(reportExport, 'renderReportPng').mockResolvedValue('data:image/png;base64,iVBORw0KGgo=');
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
  });

  it('미승인 학생은 선택하지 않고 PNG를 학생별 요청으로 순차 전송한다', async () => {
    mutateAsync.mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error('second failed'));
    const view = render(<ReportDeliveryQueue onOpenReport={vi.fn()} />);

    expect((view.getByRole('checkbox', { name: /학생C/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(view.getByRole('button', { name: '전체 선택' }));
    fireEvent.click(view.getByRole('button', { name: '2명 보내기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
      requestKey: '00000000-0000-4000-8000-000000000001',
      onDate: '2026-09-04',
      studentId: 21,
      files: [{ repId: 11, fileName: '20260904_학생A_고2_AP Chemistry_16:00.png' }],
    });
    expect(mutateAsync.mock.calls[1]?.[0]).toMatchObject({ studentId: 22 });
    expect(mutateAsync.mock.calls[0]?.[0]).not.toBeInstanceOf(Array);
    expect(await view.findByText('1명까지 저장했습니다. 나머지는 이력을 확인한 뒤 다시 시도해 주세요.'))
      .toBeTruthy();
  });
});
