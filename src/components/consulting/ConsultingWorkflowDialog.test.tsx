/** @file-guide
 * 목적: ConsultingWorkflowDialog의 키보드·스크롤·focus return 회귀를 검증한다.
 * 책임/재사용: 실제 공용 모달을 렌더하고 접근성 경계만 시험한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsultingWorkflowDialog } from './ConsultingWorkflowDialog';

function Fixture() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>계약 열기</button>
    <ConsultingWorkflowDialog open={open} onClose={() => setOpen(false)} title="계약 상세">
      <button type="button" data-dialog-autofocus>첫 동작</button>
      <button type="button">마지막 동작</button>
    </ConsultingWorkflowDialog>
  </>;
}

afterEach(() => { document.body.style.overflow = ''; });

describe('ConsultingWorkflowDialog', () => {
  it('열릴 때 첫 동작에 초점을 두고 body 스크롤을 잠근 뒤 닫으면 호출 버튼으로 돌려보낸다', () => {
    const view = render(<Fixture />);
    const opener = view.getByRole('button', { name: '계약 열기' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(view.getByRole('button', { name: '첫 동작' }));
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(view.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab과 Shift+Tab이 모달 밖으로 나가지 않는다', () => {
    const view = render(<Fixture />);
    fireEvent.click(view.getByRole('button', { name: '계약 열기' }));
    const initial = view.getByRole('button', { name: '첫 동작' });
    const first = view.getByRole('button', { name: '닫기' });
    const last = view.getByRole('button', { name: '마지막 동작' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(initial).toBeTruthy();
  });
});
