/** @file-guide
 * 목적: 공용 학년 선택기의 세 체계 그룹·대응 안내·계약 전 쓰기 잠금·legacy 필터를 검증한다.
 * 책임/재사용: 실제 EducationGradeSelect를 렌더한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { EducationGradeSource } from '@/lib/education-grades';
import { EducationGradeSelect } from './EducationGradeSelect';

const source = {
  educationGrades: [
    { value: 'G5', system: 'US', systemLabel: '미국 Grade', optionLabel: 'G5 (= Y6)', equivalenceHint: '= Y6 · 초5', listLabel: 'G5 · Y6', sort: 5 },
    { value: 'Y6', system: 'GB', systemLabel: '영국 Year', optionLabel: 'Y6 (= G5)', equivalenceHint: '= G5 · 초5', listLabel: 'Y6 · G5', sort: 5 },
    { value: '초5', system: 'KR', systemLabel: '한국 학년', optionLabel: '초5 (= G5 · Y6)', equivalenceHint: '= G5 · Y6', listLabel: '초5 · G5 · Y6', sort: 5 },
  ],
} satisfies EducationGradeSource;

it('세 체계 그룹과 서버 문구를 보이고 선택값을 그대로 돌려준다', () => {
  const onChange = vi.fn();
  const view = render(<EducationGradeSelect ariaLabel="학년" source={source} value="Y6" onChange={onChange} />);
  expect(view.getByRole('group', { name: '미국 Grade' })).toBeTruthy();
  expect(view.getByRole('option', { name: '초5 (= G5 · Y6)' })).toBeTruthy();
  expect(view.getByRole('status').textContent).toBe('= G5 · 초5');
  fireEvent.change(view.getByLabelText('학년'), { target: { value: '초5' } });
  expect(onChange).toHaveBeenCalledWith('초5');
});

it('계약 전 신규 입력은 잠그고 기존값을 추정 변환하지 않는다', () => {
  const view = render(<EducationGradeSelect ariaLabel="학년" source={{}} value="9학년" onChange={vi.fn()} />);
  expect((view.getByLabelText('학년') as HTMLSelectElement).disabled).toBe(true);
  expect(view.getByRole('option', { name: '9학년 · 기존 값' })).toBeTruthy();
  expect(view.getByRole('status').textContent).toContain('자동 변환하지 않습니다');
});

it('학생 목록의 서버 literal 필터는 신형 projection 전에도 그대로 유지한다', () => {
  const view = render(<EducationGradeSelect ariaLabel="학년" source={{}} legacyValues={['G10', 'G9']} value="" emptyLabel="전체 학년" showContractState={false} onChange={vi.fn()} />);
  expect((view.getByLabelText('학년') as HTMLSelectElement).disabled).toBe(false);
  expect(view.getAllByRole('option').map((item) => item.textContent)).toEqual(['전체 학년', 'G10', 'G9']);
  expect(view.queryByRole('status')).toBeNull();
});
