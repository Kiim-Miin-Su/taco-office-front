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

  it('A-01 — 학부모 · 연락처(서버의 보이는 모양으로 편다) · 원하는 것을 보여 주고, 바꾼 칸만 보내며 비우면 null', () => {
    const withParent = { ...lead, parentRelation: '어머니', parentPhone: '01012345678', parentPhoneDisplay: '010-1234-5678', want: 'MAP Reading' } as Lead;
    const view = render(<LeadCoreEditor lead={withParent} sources={sources} />);
    expect(view.getByText('학부모 어머니 · 010-1234-5678 · 원하는 것 MAP Reading')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: '고치기' }));
    expect((view.getByLabelText('연락처') as HTMLInputElement).value).toBe('010-1234-5678');
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    // 아무것도 안 바꿨으면 보내지 않는다 — 보이는 모양을 숫자로 바꿔 되보내지 않는다
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole('button', { name: '고치기' }));
    fireEvent.change(view.getByLabelText('연락처'), { target: { value: '010-2222-3333' } });
    fireEvent.change(view.getByLabelText('원하는 것'), { target: { value: '' } });
    fireEvent.click(view.getByRole('button', { name: '저장' }));
    expect(mutate).toHaveBeenCalledWith({ id: 7, parentPhone: '010-2222-3333', want: null }, expect.any(Object));
  });

  it('A-01 — 칸이 비어 있던 옛 건은 「—」 · 「연락처 없음」', () => {
    const view = render(<LeadCoreEditor lead={lead} sources={sources} />);
    expect(view.getByText('학부모 — · 연락처 없음 · 원하는 것 —')).toBeTruthy();
  });
});
