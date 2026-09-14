/** @file-guide
 * 목적: §29 시작 폼이 생성 DTO만 보내고 10종·복수 학생·지정 공개를 보존하는지 검증한다.
 * 책임/재사용: 실제 ConsultingStartForm을 렌더하며 서버 단계나 기본 항목을 테스트 fixture로 발명하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConsultingCreate, Meta } from '@/api/types';
import { ConsultingStartForm } from './ConsultingStartForm';

const meta = {
  kinds: [], subs: [], rooms: [], zaccs: [], invTypes: [],
  staff: [
    { id: 2, name: '김민수', role: 'admin', canAdminPage: true, canGpaPack: true },
    { id: 3, name: '김범준', role: 'manager', canAdminPage: true, canGpaPack: true },
    { id: 6, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false },
  ],
  students: [
    { id: 10, name: '고은성', grade: 'G12' },
    { id: 11, name: '강라율', grade: 'G11' },
  ],
} satisfies Meta;

describe('ConsultingStartForm', () => {
  it('원본 10종을 보이고 DTO 외 단계·기본 항목을 보내지 않는다', () => {
    const submit = vi.fn<(body: ConsultingCreate) => void>();
    const view = render(<ConsultingStartForm meta={meta} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    expect(view.getAllByRole('button', { pressed: false }).filter((button) => button.textContent?.includes('학교') || button.textContent?.includes('지도')).length).toBeGreaterThan(0);
    expect(view.getByRole('button', { name: '국제학교 지원', pressed: true })).toBeTruthy();
    expect(view.getByRole('button', { name: '비자·서류' })).toBeTruthy();

    fireEvent.click(view.getByRole('button', { name: '에세이 지도' }));
    fireEvent.click(view.getByRole('button', { name: '고은성' }));
    fireEvent.click(view.getByRole('button', { name: '강라율' }));
    fireEvent.click(view.getByRole('button', { name: '아버지' }));
    fireEvent.change(view.getByLabelText('담당 *'), { target: { value: '3' } });
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '800000' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '6' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-09-21' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-10-20' } });
    fireEvent.click(view.getByRole('button', { name: '지정 공개' }));
    fireEvent.click(view.getByRole('button', { name: '김민수' }));
    fireEvent.click(view.getByRole('button', { name: '시작하기' }));

    expect(submit).toHaveBeenCalledWith({
      consType: 'essay', studentIds: [10, 11], requester: 'father', ownerId: 3,
      amount: 800000, sessions: 6, startOn: '2026-09-21', endOn: '2026-10-20',
      share: 'picked', pickedStaffIds: [2],
    });
    expect(Object.keys(submit.mock.calls[0][0]).sort()).not.toContain('stage');
    expect(Object.keys(submit.mock.calls[0][0]).sort()).not.toContain('items');
  });

  it('학생·날짜 순서·지정 공개 대상을 제출 전에 막는다', () => {
    const submit = vi.fn();
    const view = render(<ConsultingStartForm meta={meta} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-10-20' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-09-21' } });
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(view.getByText('학생을 한 명 이상 선택해 주세요.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('날짜 순서와 지정 공개 대상을 각각 막는다', () => {
    const submit = vi.fn();
    const view = render(<ConsultingStartForm meta={meta} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.click(view.getByRole('button', { name: '고은성' }));
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-10-20' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-09-21' } });
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(view.getByText('시작일과 종료일을 올바른 순서로 입력해 주세요.')).toBeTruthy();

    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-11-20' } });
    fireEvent.click(view.getByRole('button', { name: '지정 공개' }));
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(view.getByText('지정 공개 대상을 한 명 이상 선택해 주세요.')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('전체 공개에서는 선택 대상 필드를 보내지 않고 관리자·매니저도 금액을 입력한다', () => {
    const submit = vi.fn<(body: ConsultingCreate) => void>();
    const view = render(<ConsultingStartForm meta={meta} pending={false} onCancel={vi.fn()} onSubmit={submit} />);
    fireEvent.click(view.getByRole('button', { name: '고은성' }));
    fireEvent.change(view.getByLabelText('담당 *'), { target: { value: '3' } });
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '900000' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '4' } });
    fireEvent.change(view.getByLabelText('시작 *'), { target: { value: '2026-09-21' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-10-20' } });
    fireEvent.submit(view.container.querySelector('form') as HTMLFormElement);
    expect(submit.mock.calls[0][0].amount).toBe(900000);
    expect(submit.mock.calls[0][0]).not.toHaveProperty('pickedStaffIds');
  });
});
