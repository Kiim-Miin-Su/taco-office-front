/** @file-guide
 * 목적: 문의 핵심정보 편집기가 LeadPatch 외 필드를 보내지 않고 nullable 칸을 비우는지 검증한다.
 * 책임/재사용: 실제 컴포넌트를 렌더하고 Query hook만 대역한다.
 */
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '@/api/types';
import { LeadCoreEditor } from './LeadCoreEditor';

const mutate = vi.fn();
vi.mock('@/api/queries', () => ({
  useMeta: () => ({ data: { staff: [{ id: 2, name: '새 담당', canAdminPage: true }, { id: 3, name: '강사', canAdminPage: false }] } }),
  usePatchLead: () => ({ mutate, isPending: false, isError: false, error: null }),
}));

const lead = {
  id: 7, name: '수정 전', grade: 'G9', school: '전고', source: 'phone', sourceLabel: '전화', ownerId: 1, ownerName: '전 담당',
  stage: 'first', stopAt: null, reason: null, createdAt: '2026-09-01', ageDays: 1, nextStages: [], touches: [],
} as Lead;
const sources = [{ key: 'none', label: '경로 없음', count: 0 }, { key: 'phone', label: '전화', count: 1 }, { key: 'referral', label: '소개', count: 0 }];

describe('LeadCoreEditor', () => {
  beforeEach(() => mutate.mockReset());
  it('이름·학년·학교·유입·담당만 보내고 빈 학교를 null로 바꾼다', () => {
    const view = render(<LeadCoreEditor lead={lead} sources={sources} />);
    fireEvent.click(view.getByRole('button', { name: '고치기' }));
    fireEvent.change(view.getByLabelText('이름'), { target: { value: '수정 후' } });
    fireEvent.change(view.getByLabelText('학년'), { target: { value: 'G11' } });
    fireEvent.change(view.getByLabelText('학교'), { target: { value: '' } });
    fireEvent.change(view.getByLabelText('유입 경로'), { target: { value: 'referral' } });
    fireEvent.change(view.getByLabelText('담당'), { target: { value: '2' } });
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, name: '수정 후', grade: 'G11', school: null, source: 'referral', ownerId: 2 }, expect.any(Object));
  });

  it('한 칸만 바꾸면 그 필드만 보내고 강사도 담당 후보로 유지한다', () => {
    const view = render(<LeadCoreEditor lead={lead} sources={sources} />);
    fireEvent.click(view.getByRole('button', { name: '고치기' }));
    expect(view.getByRole('option', { name: '강사' })).toBeTruthy();
    fireEvent.change(view.getByLabelText('학교'), { target: { value: '새 학교' } });
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, school: '새 학교' }, expect.any(Object));
  });
});
