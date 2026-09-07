import type { ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { permissions, unwritten, reports, detail, delivery, history } = vi.hoisted(() => ({
  permissions: { canCrudAll: false, canApprove: false },
  unwritten: vi.fn(), reports: vi.fn(), detail: vi.fn(), delivery: vi.fn(), history: vi.fn(),
}));
vi.mock('@/store/useSession', () => ({
  useCan: (name: keyof typeof permissions) => permissions[name],
}));
vi.mock('@/api/queries', () => ({
  useMeta: () => ({ data: { subs: [] } }),
  useUnwritten: unwritten,
  useReports: reports,
  useReportDetail: detail,
}));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/shell/RequireAuth', () => ({ RequireAuth: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/report/ReportDeliveryQueue', () => ({ ReportDeliveryQueue: delivery }));
vi.mock('@/components/report/ReportDeliveryHistory', () => ({ ReportDeliveryHistory: history }));
vi.mock('@/components/report/ReportForm', () => ({ ReportEditor: () => null }));
vi.mock('@/components/report/ReportExportPanel', () => ({ ReportExportPanel: () => null }));

import ReportsPage from './page';

describe('리포트 하위 탭 권한', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.canCrudAll = false;
    permissions.canApprove = false;
    unwritten.mockReturnValue({ data: { total: 0, byTeacher: [], items: [] }, isLoading: false, isError: false });
    reports.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false });
    detail.mockReturnValue({});
    delivery.mockReturnValue(<div>발송 화면</div>);
    history.mockReturnValue(<div>이력 화면</div>);
  });

  it('강사에게 발송·발송 이력 탭과 해당 컴포넌트를 노출하지 않는다', () => {
    const view = render(<ReportsPage />);
    expect(view.queryByRole('button', { name: '어제 보내기' })).toBeNull();
    expect(view.queryByRole('button', { name: '보낸 내역' })).toBeNull();
    expect(view.queryByRole('button', { name: '승인 대기' })).toBeNull();
    expect(delivery).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '반려됨' }));
    expect(reports).toHaveBeenCalledWith({ state: 'rej' }, true);
  });

  it('매니저는 발송과 이력을 열 수 있고 숨겨진 목록 쿼리는 실행하지 않는다', () => {
    permissions.canCrudAll = true;
    permissions.canApprove = true;
    const view = render(<ReportsPage />);
    fireEvent.click(view.getByRole('button', { name: '반려됨' }));
    fireEvent.click(view.getByRole('button', { name: '어제 보내기' }));
    expect(view.getByText('발송 화면')).toBeTruthy();
    expect(unwritten).toHaveBeenLastCalledWith(undefined, false);
    expect(reports.mock.calls.slice(-2)).toEqual([[{ state: 'rej' }, false], [{ state: 'wait' }, false]]);
    fireEvent.click(view.getByRole('button', { name: '보낸 내역' }));
    expect(view.getByText('이력 화면')).toBeTruthy();
  });

  it('발송 화면에서 권한을 잃으면 즉시 허용된 목록으로 돌아간다', () => {
    permissions.canCrudAll = true;
    const view = render(<ReportsPage />);
    fireEvent.click(view.getByRole('button', { name: '어제 보내기' }));
    permissions.canCrudAll = false;
    view.rerender(<ReportsPage />);
    expect(view.queryByText('발송 화면')).toBeNull();
    expect(view.queryByRole('button', { name: '어제 보내기' })).toBeNull();
    expect(unwritten).toHaveBeenLastCalledWith(undefined, true);
  });

  it('승인 예외 권한은 승인 큐만 열고 발송 권한을 열지 않는다', () => {
    permissions.canApprove = true;
    const view = render(<ReportsPage />);
    expect(view.queryByRole('button', { name: '어제 보내기' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '승인 대기' }));
    expect(reports).toHaveBeenLastCalledWith({ state: 'wait' }, true);
    permissions.canApprove = false;
    view.rerender(<ReportsPage />);
    expect(view.queryByRole('button', { name: '승인 대기' })).toBeNull();
    expect(view.queryByText('승인 대기 리포트가 없습니다')).toBeNull();
    expect(reports).toHaveBeenLastCalledWith({ state: 'wait' }, false);
  });

  it('승인 큐에서 상세를 연 뒤 권한을 잃으면 상세 조회도 비활성화한다', () => {
    permissions.canApprove = true;
    reports.mockImplementation(({ state }: { state: string }) => ({
      data: { items: state === 'wait' ? [{
        id: 80, serId: 8, onDate: '2026-09-07', date: '2026-09-07', startMin: 600,
        students: [], state: 'wait', minutesSinceEnd: 30, penalty: 0,
      }] : [] },
      isLoading: false, isError: false,
    }));
    const view = render(<ReportsPage />);
    fireEvent.click(view.getByRole('button', { name: '승인 대기' }));
    fireEvent.click(view.getByText('2026-09-07'));
    expect(detail).toHaveBeenLastCalledWith(8, '2026-09-07');
    permissions.canApprove = false;
    view.rerender(<ReportsPage />);
    expect(detail).toHaveBeenLastCalledWith(undefined, undefined);
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
