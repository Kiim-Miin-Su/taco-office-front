/** @file-guide
 * 목적: ClipboardBar.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipboardBar } from './ClipboardBar';

afterEach(cleanup);

describe('앱 내부 클립보드 띠 (§5.2)', () => {
  it('비어 있으면 아무것도 그리지 않는다 — 0건 띠가 서면 누를 것이 없는 단추가 생긴다', () => {
    const { container } = render(<ClipboardBar count={0} cut={false} onClear={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('복사와 잘라내기를 같은 띠가 다른 낱말로 말한다', () => {
    const { rerender } = render(<ClipboardBar count={1} cut={false} onClear={vi.fn()} />);
    expect(screen.getByText('1건 복사됨')).toBeTruthy();
    rerender(<ClipboardBar count={3} cut onClear={vi.fn()} />);
    expect(screen.getByText('3건 잘라내기됨')).toBeTruthy();
    // 잘라내기여도 안내는 같다 — 원본은 붙여넣기가 성공할 때까지 남는다
    expect(screen.getByText(/붙일 빈 칸을 먼저 고르세요/)).toBeTruthy();
  });

  it('상태 띠라 role=status 로 읽히고, 취소는 누른 쪽에 맡긴다', () => {
    const onClear = vi.fn();
    render(<ClipboardBar count={2} cut={false} onClear={onClear} />);
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Esc 취소' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('대상 전에는 붙여넣기 단추를 막고, 대상이 생기면 시각을 말하며 실행한다', () => {
    const onPaste = vi.fn();
    const { rerender } = render(<ClipboardBar count={1} cut={false} target={null} onPaste={onPaste} onClear={vi.fn()} />);
    expect((screen.getByRole('button', { name: '붙여넣기' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ClipboardBar count={1} cut={false} target="9/3 (목) · 13:30" onPaste={onPaste} onClear={vi.fn()} />);
    expect(screen.getByText(/붙일 곳 9\/3 \(목\) · 13:30/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '붙여넣기' }));
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it('저장 중이면 대상이 있어도 두 번 붙이지 못하게 한다', () => {
    const onPaste = vi.fn();
    render(<ClipboardBar count={1} cut={false} target="9/3 (목) · 13:30" pasteDisabled pasteBusy onPaste={onPaste} onClear={vi.fn()} />);
    const button = screen.getByRole('button', { name: '저장 중…' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onPaste).not.toHaveBeenCalled();
  });
});
