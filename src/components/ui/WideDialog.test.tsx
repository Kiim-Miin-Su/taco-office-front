/** @file-guide
 * 목적: WideDialog 의 창 모양(가운데 · 최대 폭 · 머리 × 하나 · 바닥 고정 줄)과 키보드·초점 회귀.
 * 책임/재사용: 실제 공용 WideDialog 를 렌더하고 접근성 경계만 시험한다(업무 판정 없음).
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { useState } from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WideDialog } from './WideDialog';

function Fixture({ width }: { width?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>보고서 열기</button>
      <WideDialog
        open={open} onClose={() => setOpen(false)} width={width}
        title="기획 보고서" head={<span>검토 요청</span>} sub="홍지승 작성"
        actions={<button type="button">내보내기</button>}
        footer={<button type="button">최종 승인</button>}
      >
        <p>본문</p>
      </WideDialog>
    </>
  );
}

afterEach(() => { cleanup(); document.body.style.overflow = ''; });

it('가운데 큰 창으로 열리고(기본 최대 1480px) 제목·머리 칩·부제·바닥 줄이 제자리에 선다', () => {
  const v = render(<Fixture />);
  fireEvent.click(v.getByRole('button', { name: '보고서 열기' }));
  const dialog = v.getByRole('dialog', { name: '기획 보고서' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.style.maxWidth).toBe('1480px');
  const heading = within(dialog).getByRole('heading', { name: '기획 보고서' });
  expect(heading.parentElement!.textContent).toContain('검토 요청');
  expect(within(dialog).getByText('홍지승 작성')).toBeTruthy();
  // 바닥 줄은 본문 밖(footer)에 고정된다 — 본문을 스크롤해도 따라 흐르지 않는다
  expect(within(dialog).getByRole('button', { name: '최종 승인' }).closest('footer')).toBeTruthy();
  expect(within(dialog).getByText('본문').closest('footer')).toBeNull();
});

it('닫기는 머리의 × 하나이고 보조기기에는 「닫기」로 읽힌다 — 누르면 닫히고 초점이 연 단추로 돌아간다', () => {
  const v = render(<Fixture />);
  const opener = v.getByRole('button', { name: '보고서 열기' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = v.getByRole('dialog');
  const close = within(dialog).getAllByRole('button', { name: '닫기' });
  expect(close).toHaveLength(1);
  expect(close[0].textContent).toBe('×');
  // 머리 오른쪽 단추(actions)는 × 앞에 선다
  expect(close[0].previousElementSibling?.textContent).toBe('내보내기');
  fireEvent.click(close[0]);
  expect(v.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it('Escape 로 닫고 body 스크롤 잠금을 푼다 — Dialog 와 같은 키보드 규칙(useDialogA11y)이다', () => {
  const v = render(<Fixture width={1180} />);
  fireEvent.click(v.getByRole('button', { name: '보고서 열기' }));
  expect(v.getByRole('dialog').style.maxWidth).toBe('1180px');
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(v.queryByRole('dialog')).toBeNull();
  expect(document.body.style.overflow).toBe('');
});
