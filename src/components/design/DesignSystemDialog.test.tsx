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

// 바꾼 토큰은 브라우저 저장소에 남는다(§85 · N-78) — 시험끼리 새지 않게 비운다
afterEach(() => { cleanup(); try { window.localStorage.clear(); } catch { /* 저장소가 없는 환경 */ } });

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

it('상태 배지는 점 + 색 글자, 알림 상자는 굵은 색 제목 + 점 목록이다 (86-2 · 86-4)', () => {
  const v = open();
  fireEvent.click(v.getByRole('button', { name: /컴포넌트/ }));
  // 배지 견본과 표 상태 칸이 같은 공용 점 모양을 쓴다 — 알약(rounded-full)이 아니다
  for (const badge of v.getAllByText('완료')) {
    expect(badge.className).toContain('text-green');
    expect(badge.className).not.toContain('rounded-full');
    expect(badge.querySelector('[aria-hidden]')?.className).toContain('bg-green');
  }
  const ok = v.getByText('✓ 겹치는 것이 없습니다');
  expect(ok.className).toContain('text-green');
  expect(v.getByText('스케줄에 컨설팅 3일로 들어갑니다').tagName).toBe('LI');
  expect(v.getByText('⛔ 2곳이 겹칩니다').className).toContain('text-red');
  expect(v.getByText('08-21 16:00 MAP Reading').tagName).toBe('LI');
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

/*
 * 원문 §85 컷은 머리 오른쪽 끝에 「×」 닫기가 있고 바닥 단추 줄이 없다 (85-3).
 * 제품은 바닥 「닫기」만 있고 × 가 없었다. 닫는 자리는 하나다.
 */
it('머리 오른쪽에 × 닫기가 있고 바닥 「닫기」 단추는 없다 — 누르면 닫는다 (85-3)', () => {
  const onClose = vi.fn();
  const v = render(<DesignSystemDialog open onClose={onClose} />);
  const dialog = v.getByRole('dialog', { name: /디자인 · 컴포넌트/ });
  const close = within(dialog).getAllByRole('button', { name: '닫기' });
  expect(close).toHaveLength(1);
  expect(close[0].textContent).toBe('×');
  fireEvent.click(close[0]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('창의 설명 문구에 절 번호·결정 코드를 적지 않는다', () => {
  const v = open();
  expect(v.container.ownerDocument.body.textContent ?? '').not.toMatch(/§\s?\d|N-\d|D-R\d/);
  fireEvent.click(v.getByRole('button', { name: /크기 · 모양/ }));
  expect(v.container.ownerDocument.body.textContent ?? '').not.toMatch(/§\s?\d|N-\d|D-R\d/);
});

/*
 * 85-2 — 부제 「색과 크기를 바꾸면 화면 전체가 바로 바뀝니다」가 **참이어야 한다.**
 * 바꾸는 곳은 문서 뿌리의 CSS 변수 하나이고, 바꾼 것만 이 브라우저에 저장한다(원문 §85 「localStorage에 저장」) — 「처음으로」가 되돌린다.
 */
it('견본에서 색을 고르면 문서 뿌리의 변수가 바뀌고, 「처음으로」가 되돌린다 (85-2)', () => {
  const root = document.documentElement;
  root.style.setProperty('--primary', '#83624D');
  try {
    const v = open();
    // 쉬는 모양은 컷 그대로 — 바꾼 것이 없으면 「처음으로」도 없다
    expect(v.queryByRole('button', { name: '처음으로' })).toBeNull();
    const pick = v.getByLabelText('기본 색 바꾸기') as HTMLInputElement;
    expect(pick.type).toBe('color');
    expect(pick.value).toBe('#83624d');
    fireEvent.change(pick, { target: { value: '#112233' } });
    expect(root.style.getPropertyValue('--primary')).toBe('#112233');
    expect(v.getByText('#112233')).toBeTruthy();
    expect(v.getByText(/바꾼 것 1 · 이 브라우저에 저장됨/)).toBeTruthy();
    fireEvent.click(v.getByRole('button', { name: '처음으로' }));
    // 되돌리면 뿌리에 적은 값을 지운다 — 값의 정본은 tokens.css 다
    expect(root.style.getPropertyValue('--primary')).toBe('');
    expect(v.queryByRole('button', { name: '처음으로' })).toBeNull();
  } finally {
    root.style.removeProperty('--primary');
  }
});

it('크기도 바꾼다 — 「12px」 모양의 값만 숫자 칸이 된다 (85-2)', () => {
  const root = document.documentElement;
  root.style.setProperty('--r-md', '12px');
  try {
    const v = open();
    fireEvent.click(v.getByRole('button', { name: /크기 · 모양/ }));
    const input = v.getByLabelText('모서리 (크게) 바꾸기') as HTMLInputElement;
    expect(input.value).toBe('12');
    fireEvent.change(input, { target: { value: '20' } });
    expect(root.style.getPropertyValue('--r-md')).toBe('20px');
    fireEvent.click(v.getByRole('button', { name: '처음으로' }));
    expect(root.style.getPropertyValue('--r-md')).toBe('');
  } finally {
    root.style.removeProperty('--r-md');
  }
});

/*
 * N-78 · 원문 §85 슬라이드 글 — 「컬러 피커·슬라이더로 즉시 반영. **localStorage에 저장.**」 · 데이터 「UISET(변경분만)」 ·
 * 규칙 「변경한 값만 저장합니다. '처음으로'는 UISET를 비웁니다.」 — 저장처는 원문이 말한다(D-R44). 값의 정본은 tokens.css 그대로다.
 */
it('바꾼 값만 이 브라우저에 저장되고 다시 열면 그대로 선다 — 「처음으로」가 저장분을 비운다 (85-2 · N-78)', () => {
  const root = document.documentElement;
  root.style.setProperty('--primary', '#83624D');
  try {
    const v = open();
    fireEvent.change(v.getByLabelText('기본 색 바꾸기'), { target: { value: '#112233' } });
    expect(JSON.parse(window.localStorage.getItem('taco.design.uiset') ?? '{}')).toEqual({ primary: '#112233' });
    cleanup();
    // 새로 고친 셈 — 뿌리에 적힌 값이 사라지고 창은 닫힌 채 셸에 다시 붙는다
    root.style.removeProperty('--primary');
    render(<DesignSystemDialog open={false} onClose={vi.fn()} />);
    expect(root.style.getPropertyValue('--primary')).toBe('#112233');
    cleanup();
    const again = open();
    expect(again.getByText(/바꾼 것 1 · 이 브라우저에 저장됨/)).toBeTruthy();
    fireEvent.click(again.getByRole('button', { name: '처음으로' }));
    expect(window.localStorage.getItem('taco.design.uiset')).toBeNull();
    expect(root.style.getPropertyValue('--primary')).toBe('');
  } finally {
    root.style.removeProperty('--primary');
  }
});

it('저장분이 깨졌거나 모르는 칸·모양이면 쓰지 않는다 — 아는 토큰의 색·px 값만 뿌리에 적는다', () => {
  const root = document.documentElement;
  try {
    window.localStorage.setItem('taco.design.uiset', JSON.stringify({ primary: 'red; background: url(x)', nope: '#000000', 'r-md': '20px' }));
    render(<DesignSystemDialog open={false} onClose={vi.fn()} />);
    expect(root.style.getPropertyValue('--primary')).toBe('');
    expect(root.style.getPropertyValue('--nope')).toBe('');
    expect(root.style.getPropertyValue('--r-md')).toBe('20px');
    cleanup();
    root.style.removeProperty('--r-md');
    window.localStorage.setItem('taco.design.uiset', '{깨진');
    expect(() => render(<DesignSystemDialog open={false} onClose={vi.fn()} />)).not.toThrow();
  } finally {
    root.style.removeProperty('--r-md');
  }
});

/*
 * 원본 §86 컷 — 「N회 씀」은 표시 마크 · 요약 카드 · 주별 칸 세 장에는 **없다**(86-6 · D-R44). 나머지 일곱 장에는 있고,
 * 컷에서 잘린 둘(서랍 · 대화상자 / 갈래)은 우리가 채운 것이라 센 값을 그대로 둔다.
 */
it('「N회 씀」은 원본 컷대로 — 표시 마크 · 요약 카드 · 주별 칸에는 없다 (86-6)', () => {
  const v = open();
  fireEvent.click(v.getByRole('button', { name: /컴포넌트/ }));
  // 카드 머리는 h3 이다 — 「구역 제목」 견본 안의 패널 제목(h2)과 헷갈리지 않게 층을 짚는다
  const card = (name: string) => v.getByRole('heading', { name, level: 3 }).closest('section')!;
  for (const name of ['표시 마크', '요약 카드', '주별 칸']) expect(card(name).textContent, name).not.toMatch(/\d+회 씀/);
  for (const name of ['버튼', '상태 배지', '입력칸', '입력 묶음', '알림 상자', '표', '구역 제목']) {
    expect(card(name).textContent, name).toMatch(/\d+회 씀/);
  }
});

/*
 * 원본 §86 요약 카드 견본 — **숫자가 위, 라벨이 아래**이고 「6/49」의 분모는 작다(86-7). §82 머리 다섯 칸(「56p / 배정」)도 같은
 * 모양이다. §69~§71 머리와 §82 선택 학생 미니 지표는 라벨이 위다 — 컷마다 그 모양을 따른다(공용 `StatCard` 의 `valueFirst`).
 */
it('요약 카드 견본은 숫자가 위 · 라벨이 아래이고 분모가 작다 (86-7)', () => {
  const v = open();
  fireEvent.click(v.getByRole('button', { name: /컴포넌트/ }));
  const sample = v.getByRole('heading', { name: '요약 카드', level: 3 }).closest('section')!;
  const done = within(sample).getByText('다 됐음');
  // 라벨 칸 바로 앞 형제가 값 칸이다 — 숫자가 위
  expect(done.previousElementSibling?.textContent).toBe('6/49');
  expect(done.previousElementSibling?.querySelector('small')?.textContent).toBe('/49');
});

/*
 * 원본 §86 표 견본 — 과목 · 상태 칸은 가운데 맞춤이다(W11 D 재대조). 견본은 공용 `Table` 의 맞춤(align)을 그대로 쓴다 —
 * 슬라이드 86 「견본은 실제 클래스를 그대로 씁니다 — 별도 스타일 없음」.
 */
it('표 견본은 과목 · 상태 칸이 가운데 맞춤이다 — 공용 표의 맞춤 그대로', () => {
  const v = open();
  fireEvent.click(v.getByRole('button', { name: /컴포넌트/ }));
  const table = v.getByRole('heading', { name: '표', level: 3 }).closest('section')!;
  expect(within(table).getByText('고은성').closest('td')?.className).toContain('text-left');
  expect(within(table).getByText('MAP Reading').closest('td')?.className).toContain('text-center');
  expect(within(table).getByText('대기').closest('td')?.className).toContain('text-center');
});

/*
 * tailwind 는 `withAlpha` 로 묶은 색(글자 · 기본 색 · 상태 색 …)에만 `/NN` 투명도를 만든다. `card` · `inset` · `line` · `bg` 는
 * 변수 그대로라 `text-card/70` 같은 조각은 **만들어지지 않고 조용히 빠진다** — 고른 갈래의 개수가 흐려지지 않았던 까닭이다(W11 D).
 */
it('이 창은 만들어지지 않는 투명도 조각(`card` · `inset` · `line` · `bg` 뒤의 /NN)을 쓰지 않는다', () => {
  const src = readFileSync('src/components/design/DesignSystemDialog.tsx', 'utf8');
  expect(src).not.toMatch(/\b(?:text|bg|border)-(?:card|inset|line|bg)\/\[?[\d.]+\]?/);
});
