/** @file-guide
 * 목적: 계약 작업 전 핵심정보 편집기가 ConsultingPatch 계약만 보내고 서버 canEdit을 따르는지 검증한다.
 * 책임/재사용: 실제 컴포넌트를 렌더하고 Query hook만 대역한다.
 */
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsultingDetail } from '@/api/types';
import { ConsultingCoreEditor } from './ConsultingCoreEditor';

const mutate = vi.fn();
vi.mock('@/api/queries', () => ({
  useMeta: () => ({ data: {
    students: [{ id: 10, name: '학생1', tag: null, label: '학생1' }, { id: 11, name: '학생2', tag: null, label: '학생2' }],
    staff: [{ id: 2, name: '담당1', canAdminPage: true }, { id: 3, name: '담당2', canAdminPage: true }],
  } }),
  useUpdateConsultingCore: () => ({ mutate, isPending: false, isError: false, error: null }),
}));

const detail = {
  id: 5, studentIds: [10], studentNames: ['학생1'], requester: 'mother', ownerId: 2, ownerName: '담당1', amount: 800000,
  sessions: 4, startOn: '2026-10-01', endOn: '2026-12-31', capabilities: { canEdit: true },
} as ConsultingDetail;

describe('ConsultingCoreEditor', () => {
  beforeEach(() => mutate.mockReset());
  it('학생·요청자·담당·금액·회차·기간만 PATCH 한다', () => {
    const view = render(<ConsultingCoreEditor detail={detail} />);
    fireEvent.click(view.getByRole('button', { name: '고치기' }));
    fireEvent.click(view.getByRole('button', { name: '학생2' }));
    fireEvent.change(view.getByLabelText('요청자'), { target: { value: 'father' } });
    fireEvent.change(view.getByLabelText('담당'), { target: { value: '3' } });
    fireEvent.change(view.getByLabelText('금액'), { target: { value: '900000' } });
    fireEvent.change(view.getByLabelText('약정 회차'), { target: { value: '6' } });
    fireEvent.change(view.getByLabelText('시작'), { target: { value: '2026-10-02' } });
    fireEvent.change(view.getByLabelText('종료'), { target: { value: '2027-01-15' } });
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    expect(mutate).toHaveBeenCalledWith({ consId: 5, studentIds: [10, 11], requester: 'father', ownerId: 3, amount: 900000, sessions: 6, startOn: '2026-10-02', endOn: '2027-01-15' }, expect.any(Object));
  });

  it('서버 canEdit=false면 편집기를 세우지 않는다', () => {
    const view = render(<ConsultingCoreEditor detail={{ ...detail, capabilities: { ...detail.capabilities, canEdit: false } }} />);
    expect(view.queryByRole('button', { name: '고치기' })).toBeNull();
  });

  it('한 칸만 바꾸면 오래된 다른 입력값을 다시 보내지 않는다', () => {
    const view = render(<ConsultingCoreEditor detail={detail} />);
    fireEvent.click(view.getByRole('button', { name: '고치기' }));
    fireEvent.change(view.getByLabelText('약정 회차'), { target: { value: '5' } });
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    expect(mutate).toHaveBeenCalledWith({ consId: 5, sessions: 5 }, expect.any(Object));
  });
});
