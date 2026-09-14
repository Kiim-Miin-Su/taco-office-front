/** @file-guide
 * 목적: 공용 Segmented/Tabs의 선택·비활성 접근성 계약을 검증한다.
 * 책임/재사용: 업무 규칙 없이 공용 컴포넌트의 버튼 의미와 이벤트 차단만 시험한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Segmented, Tabs } from './Segmented';

const options = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
] as const;

describe('Segmented 접근성 상태', () => {
  it('선택 상태를 aria-pressed로 알리고 disabled이면 변경을 호출하지 않는다', () => {
    const onChange = vi.fn();
    const view = render(<Segmented options={[...options]} value="day" onChange={onChange} disabled />);
    expect(view.getByRole('button', { name: '일간' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(view.getByRole('button', { name: '주간' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Tabs도 기존 button 역할을 유지하면서 선택 상태를 알린다', () => {
    const view = render(<Tabs options={[...options]} value="week" onChange={vi.fn()} />);
    expect(view.getByRole('button', { name: '주간' }).getAttribute('aria-pressed')).toBe('true');
  });
});
