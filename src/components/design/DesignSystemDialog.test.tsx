/** @file-guide
 * 목적: §85·§86 디자인 시스템 — 값은 토큰 한 곳에서만 온다 (C60).
 * 책임/재사용: 실제 DesignSystemDialog 를 쓰고 열림 상태만 props 로 준다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import usage from '@/lib/component-usage.json';
import { DesignSystemDialog } from './DesignSystemDialog';

afterEach(cleanup);

const open = () => render(<DesignSystemDialog open onClose={vi.fn()} />);

it('창 제목과 부제는 원문 컷 그대로다 — 이것은 라우트가 아니라 창이다', () => {
  const v = open();
  expect(v.getByText('디자인 · 컴포넌트')).toBeTruthy();
  expect(v.getByText('색과 크기를 바꾸면 화면 전체가 바로 바뀝니다')).toBeTruthy();
  expect(v.getByRole('button', { name: 'CSS 내보내기' })).toBeTruthy();
  expect(v.getByRole('button', { name: '토큰 JSON' })).toBeTruthy();
});

it('색 아홉 줄 — 이름과 쓰임새가 원문 컷 그대로다', () => {
  const v = open();
  for (const [name, use] of [
    ['기본 색', '버튼 · 강조 · 링크'], ['보라', '컨설팅 · GPA'], ['초록', '완료 · 정상'],
    ['주황', '주의 · 대기'], ['빨강', '안 됨 · 지연 · 지우기'], ['글자', '제목과 본문'],
    ['흐린 글자', '설명 · 보조'], ['선', '카드 테두리 · 구분선'], ['바탕', '화면 배경'],
  ] as const) {
    expect(v.getByText(name), name).toBeTruthy();
    expect(v.getByText(use), use).toBeTruthy();
  }
});

it('이 화면 파일에는 색 값이 한 개도 없다 — 토큰이 두 벌이 되면 안 된다 (D-R41)', () => {
  for (const f of ['src/components/design/DesignSystemDialog.tsx', 'src/lib/design-system.ts']) {
    expect(readFileSync(f, 'utf8'), f).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  }
});

it('값은 실행 중에 CSS 변수를 읽는다 — 못 읽으면 「—」이고 0 이나 빈칸이 아니다', () => {
  // jsdom 은 :root 변수를 안 준다 — 그래서 여기서 「—」가 나오는 것이 맞는 동작이다
  const v = open();
  expect(v.getAllByText('—').length).toBeGreaterThan(0);
});

it('대비를 보강한 넷에 그 표시를 달고, 왜인지 화면이 말한다', () => {
  const v = open();
  expect(v.getAllByText('대비 보강')).toHaveLength(4);
  expect(v.getByText(/대비 4.5:1 을 맞추려고/)).toBeTruthy();
});

it('크기 갈래는 원문이 「5개」인데 지금 여덟이라는 것을 숨기지 않는다 (N-34)', () => {
  const v = open();
  fireEvent.click(v.getByRole('button', { name: /크기 · 모양/ }));
  expect(v.getByText('쓰는 값')).toBeTruthy();
  expect(v.getByText('화면 틀')).toBeTruthy();
  expect(v.getByText(/지금 토큰은 여덟입니다/)).toBeTruthy();
});

it('컴포넌트 갤러리는 열두 장이고 「N회 씀」은 세어 둔 값을 그린다', () => {
  const v = open();
  fireEvent.click(v.getByRole('button', { name: /컴포넌트/ }));
  for (const name of ['버튼', '상태 배지', '표시 마크', '입력칸', '입력 묶음', '요약 카드',
    '알림 상자', '표', '구역 제목', '주별 칸', '서랍 · 대화상자', '갈래']) {
    expect(v.getAllByText(name).length, name).toBeGreaterThan(0);
  }
  /*
   * 「N회 씀」은 **그 카드 안에서** 찾는다. 두 컴포넌트의 횟수가 우연히 같아지면
   * 화면 전체에서 찾을 때 「여럿이 걸렸다」로 빨개진다 — 실제로 button 과 badge 가 같은 날 그랬다.
   * 세어 둔 값이 맞는지를 보는 시험이지 값이 서로 다른지를 보는 시험이 아니다.
   */
  const usedIn = (name: string) => {
    const card = v.getAllByText(name)[0].closest('article, li, section, div[class*="rounded"]')!;
    return within(card as HTMLElement).getByText(/\d+회 씀/).textContent;
  };
  expect(usedIn('버튼')).toBe(`${usage.counts.button}회 씀`);
  expect(usedIn('입력 묶음')).toBe(`${usage.counts.field}회 씀`);
});

it('갈래 단추는 개수를 달고 있다 — 색 9 · 크기 8 · 컴포넌트 12', () => {
  const v = open();
  const text = (name: string) =>
    v.getByRole('button', { name: new RegExp(name) }).textContent?.replace(/\s+/g, ' ') ?? '';
  expect(text('색')).toContain('9개');
  expect(text('크기 · 모양')).toContain('8개');
  expect(text('컴포넌트')).toContain('12개');
});

it('닫혀 있으면 아무것도 그리지 않는다', () => {
  const v = render(<DesignSystemDialog open={false} onClose={vi.fn()} />);
  expect(v.queryByText('디자인 · 컴포넌트')).toBeNull();
});
