/** @file-guide
 * 목적: Overlay.test.tsx (test)
 * 책임/재사용: 기존 대상 함수를 import하여 정상/거절/경계 회귀를 검증한다. 테스트 안에 제품 규칙을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { fireEvent, render, within } from '@testing-library/react';
import { useState } from 'react';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { describe, expect, it, vi } from 'vitest';
import config from '../../../tailwind.config';
import { Dialog, Drawer } from './Overlay';

/**
 * 렌더된 클래스를 **실제 tailwind 설정으로** 빌드해 본다.
 * 클래스 이름만 보면 통과하지만, 설정이 그 수식을 못 만들면 CSS 규칙이 아예 안 생긴다 —
 * `bg-fg/30` 이 그랬다(스크림 computed `rgba(0,0,0,0)` · g2 대조 C-6).
 */
async function utilitiesFor(classes: string[]): Promise<string> {
  const out = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });
  return out.css;
}
const escapeClass = (name: string) => name.replace(/[/.:]/g, (c) => `\\\\\\${c}`);
const scrimOf = (dialog: HTMLElement) => dialog.parentElement?.querySelector<HTMLElement>(':scope > [aria-hidden="true"]');

describe('Overlay 접근성 이름', () => {
  it('공용 Drawer와 Dialog 제목을 dialog의 접근성 이름으로 연결한다', () => {
    const view = render(
      <>
        <Drawer open onClose={() => undefined} title="수업 상세">내용</Drawer>
        <Dialog open onClose={() => undefined} title="명단 변경 후 준비할 일">내용</Dialog>
      </>,
    );

    expect(view.getByRole('dialog', { name: '수업 상세' })).toBeTruthy();
    expect(view.getByRole('dialog', { name: '명단 변경 후 준비할 일' })).toBeTruthy();
  });
});

describe('Overlay 스크림 — fg 투명도가 실제 CSS 로 나온다', () => {
  it('Dialog·Drawer 스크림의 bg-fg/N 이 투명도를 가진 배경색 규칙으로 빌드된다', async () => {
    const view = render(
      <>
        <Drawer open onClose={() => undefined} title="수업 상세">내용</Drawer>
        <Dialog open onClose={() => undefined} title="확인">내용</Dialog>
      </>,
    );
    const scrims = [
      scrimOf(view.getByRole('dialog', { name: '수업 상세' })),
      scrimOf(view.getByRole('dialog', { name: '확인' })),
    ];
    const fills = scrims.map((scrim) => {
      const fill = scrim?.className.split(' ').find((c) => c.startsWith('bg-fg/'));
      expect(fill, '스크림에 bg-fg/N 클래스가 있어야 한다').toBeTruthy();
      return fill!;
    });
    expect(fills).toEqual(['bg-fg/25', 'bg-fg/30']);

    const css = await utilitiesFor(fills);
    for (const fill of fills) {
      const alpha = Number(fill.split('/')[1]) / 100;
      // 규칙이 아예 없으면(설정이 투명도를 못 붙이면) 스크림은 투명이다
      expect(css).toMatch(new RegExp(`\\.${escapeClass(fill)}\\s*\\{[^}]*background-color:\\s*rgb\\(from var\\(--fg\\) r g b / ${alpha}\\)`));
    }
  });

  it('Dialog 스크림은 원문처럼 흐림도 함께 건다', () => {
    const view = render(<Dialog open onClose={() => undefined} title="변경 요청">내용</Dialog>);
    expect(scrimOf(view.getByRole('dialog', { name: '변경 요청' }))?.className).toContain('backdrop-blur-sm');
  });

  it('수식 없는 text-fg·bg-fg 는 투명도 1 로 빌드된다 — 같은 --fg 토큰을 읽는다', async () => {
    const css = await utilitiesFor(['bg-fg', 'text-fg']);
    expect(css).toMatch(/\.bg-fg\s*\{[^}]*--tw-bg-opacity:\s*1;[^}]*background-color:\s*rgb\(from var\(--fg\) r g b \/ var\(--tw-bg-opacity(?:, 1)?\)\)/);
    expect(css).toMatch(/\.text-fg\s*\{[^}]*--tw-text-opacity:\s*1;[^}]*color:\s*rgb\(from var\(--fg\) r g b \/ var\(--tw-text-opacity(?:, 1)?\)\)/);
  });
});

describe('Drawer docked — 탭 02 서랍의 자리 (g2 C-1)', () => {
  it('docked 는 뷰포트가 아니라 부모 칸을 채우고 스크림 없이 투명 클릭 받이만 둔다', () => {
    const close = vi.fn();
    const view = render(<Drawer open docked onClose={close} title="승인 대기함">내용</Drawer>);
    const dialog = view.getByRole('dialog', { name: '승인 대기함' });
    const root = dialog.parentElement!;
    expect(root.className).toContain('absolute');
    expect(root.className).not.toContain('fixed');
    const scrim = scrimOf(dialog)!;
    expect(scrim.className).toContain('bg-transparent');
    expect(scrim.className).not.toMatch(/bg-fg/);
    // 머리줄·레일이 살아 있는 비모달 패널이다
    expect(dialog.getAttribute('aria-modal')).toBeNull();
    fireEvent.click(scrim);
    expect(close).toHaveBeenCalledOnce();
  });

  it('docked 여도 Escape 로 닫힌다 — 기존 키보드 동작 유지', () => {
    const close = vi.fn();
    render(<Drawer open docked onClose={close} title="알림">내용</Drawer>);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('기본 Drawer 는 예전처럼 화면 전체를 덮는 모달이다 (수업 상세 §12)', () => {
    const view = render(<Drawer open onClose={() => undefined} title="수업 상세">내용</Drawer>);
    const dialog = view.getByRole('dialog', { name: '수업 상세' });
    expect(dialog.parentElement!.className).toContain('fixed');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});

/**
 * g2 대조 C-4 · 공용 부품 — 원문 서랍 머리는 **어두운 바 + 흰 제목 + 오른쪽 ×** 이고, 부제가 없다.
 * 닫기는 글자 단추가 아니라 × 하나이며 보조기기에는 「닫기」로 읽힌다(WideDialog 와 같은 이름).
 */
describe('Drawer 머리 — × 닫기와 어두운 변형 (g2 C-4)', () => {
  it('닫기는 글자가 아니라 × 하나이고 보조기기에는 「닫기」로 읽힌다', () => {
    const close = vi.fn();
    const view = render(<Drawer open onClose={close} title="수업 상세">내용</Drawer>);
    const dialog = view.getByRole('dialog', { name: '수업 상세' });
    const buttons = within(dialog).getAllByRole('button', { name: '닫기' });
    expect(buttons).toHaveLength(1);
    // 눈에 보이는 「닫기」 글자는 없다 — 원문 머리는 × 아이콘이다
    expect(within(dialog).queryByText('닫기')).toBeNull();
    fireEvent.click(buttons[0]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('headerTone="dark" 는 머리줄 색 바탕에 흰 제목이다 — 기본은 예전처럼 흰 바탕이다', () => {
    const dark = render(<Drawer open docked headerTone="dark" onClose={() => undefined} title="승인 대기함">내용</Drawer>);
    const head = within(dark.getByRole('dialog', { name: '승인 대기함' })).getByRole('heading', { name: '승인 대기함' });
    expect(head.className).toContain('text-white');
    expect(head.closest('header')!.className).toContain('bg-header');
    dark.unmount();
    const light = render(<Drawer open onClose={() => undefined} title="수업 상세">내용</Drawer>);
    const lightHead = within(light.getByRole('dialog', { name: '수업 상세' })).getByRole('heading', { name: '수업 상세' });
    expect(lightHead.closest('header')!.className).not.toContain('bg-header');
  });
});

/** 공용 부품 — `Drawer` 는 열려도 초점을 옮기지 않았다. 키보드 사용자는 열린 서랍을 찾아 헤맸다. */
describe('Drawer 초점 — 열면 서랍으로, 닫으면 연 자리로', () => {
  function Fixture({ auto = false }: { auto?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>서랍 열기</button>
        <Drawer open={open} docked onClose={() => setOpen(false)} title="알림">
          {auto ? <input aria-label="사유" autoFocus /> : <p>본문</p>}
        </Drawer>
      </>
    );
  }

  it('열리면 초점이 서랍 판으로 가고, 닫히면 연 단추로 돌아온다', () => {
    const view = render(<Fixture />);
    const opener = view.getByRole('button', { name: '서랍 열기' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = view.getByRole('dialog', { name: '알림' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(view.queryByRole('dialog', { name: '알림' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('안에서 이미 초점을 가진 칸(autoFocus)이 있으면 빼앗지 않는다', () => {
    const view = render(<Fixture auto />);
    fireEvent.click(view.getByRole('button', { name: '서랍 열기' }));
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: '사유' }));
  });
});

/**
 * 공용 부품 — 원문 §19 · §75 · §76 창 머리는 「제목 + 부제 + 오른쪽 ×」이고 아래에 선이 있다.
 * 바닥 줄은 **윗선 + 옅은 바탕**으로 본문과 갈린다(g2 대조 75-7 — 모든 창 공통).
 * ×는 부르는 쪽이 켤 때만 선다 — 바닥에 「닫기」가 이미 있는 창과 이름이 겹치지 않게 「창 닫기」로 읽힌다.
 */
describe('Dialog 머리 × · 부제 · 바닥 줄 (공용 · g2 75-7)', () => {
  it('closeX 를 켜면 머리 오른쪽에 × 가 서고 누르면 닫힌다 — 부제가 제목 아래에 선다', () => {
    const close = vi.fn();
    const view = render(
      <Dialog open onClose={close} title="결재 흐름" sub="지금 4건 대기" closeX
        footer={<button type="button" onClick={close}>닫기</button>}>내용</Dialog>,
    );
    const dialog = view.getByRole('dialog', { name: '결재 흐름' });
    expect(within(dialog).getByText('지금 4건 대기')).toBeTruthy();
    // 바닥의 「닫기」와 머리의 × 는 이름이 다르다 — 한 창에 같은 이름 둘을 두지 않는다
    expect(within(dialog).getAllByRole('button', { name: '닫기' })).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: '창 닫기' }));
    expect(close).toHaveBeenCalledOnce();
    // 머리는 선으로 본문과 갈린다
    const head = within(dialog).getByRole('heading', { name: '결재 흐름' }).closest('[data-dialog-head]');
    expect(head?.className).toContain('border-b');
  });

  it('closeX 를 안 켜면 × 가 없다 — 기존 확인창은 그대로다', () => {
    const view = render(<Dialog open onClose={() => undefined} title="확인">내용</Dialog>);
    expect(within(view.getByRole('dialog', { name: '확인' })).queryByRole('button', { name: '창 닫기' })).toBeNull();
  });

  /*
   * W11 실브라우저 QA(W11-D-1) — 구성원 「수정」 창(권한 예외 다섯 줄)이 1280×900 에서 화면보다 길어져 「저장」이 화면 밖으로 밀렸다.
   * 가운데 창은 `fixed` 라 페이지를 굴려도 따라오지 않는다 — 창이 **화면 높이를 넘지 않고 본문만 굴러야** 바닥 줄이 늘 보인다(WideDialog 와 같은 틀).
   * jsdom 은 크기를 재지 못하므로 틀(높이 한도 · 본문 굴림 · 머리 · 바닥 줄 고정)을 본다.
   */
  it('창이 화면보다 길면 본문만 구르고 머리 · 바닥 줄은 늘 보인다 (W11-D-1)', () => {
    const view = render(
      <Dialog open onClose={() => undefined} title="긴 창" sub="부제" closeX footer={<button type="button">저장</button>}>
        <p>본문</p>
      </Dialog>,
    );
    const dialog = view.getByRole('dialog', { name: '긴 창' });
    expect(dialog.className).toContain('max-h-[calc(100dvh-3rem)]');
    expect(dialog.className).toContain('flex-col');
    const body = within(dialog).getByText('본문').parentElement!;
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');
    expect(within(dialog).getByRole('heading', { name: '긴 창' }).closest('[data-dialog-head]')?.className).toContain('shrink-0');
    expect(within(dialog).getByRole('button', { name: '저장' }).parentElement!.className).toContain('shrink-0');
  });

  it('바닥 줄은 윗선과 옅은 바탕으로 본문과 갈린다', () => {
    const view = render(<Dialog open onClose={() => undefined} title="확인" footer={<button type="button">확인</button>}>내용</Dialog>);
    const foot = within(view.getByRole('dialog', { name: '확인' })).getByRole('button', { name: '확인' }).parentElement!;
    expect(foot.className).toContain('border-t');
    expect(foot.className).toContain('bg-inset');
  });
});
