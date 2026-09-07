/**
 * 토큰이 한 곳에만 있는지 확인한다 (D-R41).
 *
 * 색을 두 벌로 만드는 실수는 조용하다 — 화면은 멀쩡히 뜨고 명세서와만 어긋난다.
 * 그래서 파일을 직접 읽어 대조한다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Segmented';
import { KIND_KEYS, SUB_KEYS, calendarEventColor, kindVar, subVar, type CalendarCodeLookup } from './tokens';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const tokens = read('src/styles/tokens.css');
const tw = read('tailwind.config.ts');
const root = tokens.match(/:root\s*\{([^}]+)\}/s)?.[1] ?? '';
const teacher = tokens.match(/\[data-ui=['"]teacher['"]\]\s*\{([^}]+)\}/s)?.[1] ?? '';
const declarations = (css: string) => Object.fromEntries(
  Array.from(css.matchAll(/--([\w-]+):\s*([^;]+);/g), ([, name, value]) => [name, value.trim()]),
);

describe('관리자 §85 기본 9색과 강사 테마 경계', () => {
  it.each(Object.entries({
    primary: '#946F57', violet: '#8B7594', green: '#5D7B65', amber: '#9B7038', red: '#8E4A45',
    fg: '#2A2320', 'fg-subtle': '#615650', line: '#E3D9D3', bg: '#F6F3F1',
  }))('기본 --%s는 원본 %s다', (name, color) => {
    expect(declarations(root)[name]).toBe(color);
  });

  it('원본에 별도 값이 없는 중간 단계는 의미 토큰을 재사용한다', () => {
    expect(declarations(root)).toMatchObject({
      inset: 'var(--bg)', 'line-2': 'var(--line)', 'fg-2': 'var(--fg-subtle)',
    });
  });

  it('강사의 기존 바탕·글자·상태색은 셸 범위에서 유지하고 primary만 blue를 참조한다', () => {
    expect(declarations(teacher)).toMatchObject({
      bg: '#F4F6FA', card: '#FFFFFF', inset: '#F8FAFC', line: '#E5EAF1', 'line-2': '#D8E0EA',
      fg: '#0F172A', 'fg-2': '#334155', 'fg-subtle': '#64748B', primary: 'var(--blue)',
      red: '#E11D48', green: '#15803D', amber: '#B45309', violet: '#7C3AED',
    });
    expect(Object.keys(declarations(teacher)).some((name) => /^(kind|sub)-/.test(name))).toBe(false);
  });

  it('예정 상태의 blue는 유지하고 primary도 같은 투명도 매핑을 사용한다', () => {
    expect(declarations(root).blue).toBe('#2563EB');
    expect(declarations(teacher).blue).toBeUndefined();
    expect(tw).toContain("primary: withAlpha('primary')");
  });

  it('공용 primary 버튼과 활성 탭은 blue 대신 primary 의미를 소비한다', () => {
    const button = renderToStaticMarkup(createElement(Button, { variant: 'primary' }, '저장'));
    expect(button).toContain('bg-primary');
    expect(button).toContain('border-primary');
    expect(button).not.toContain('bg-blue');
    const tabs = renderToStaticMarkup(createElement(Tabs, {
      options: [{ value: 'active', label: '활성' }], value: 'active', onChange: () => undefined,
    }));
    expect(tabs).toContain('border-primary text-primary');
    expect(tabs).not.toContain('border-blue');
  });

  it('셸이 서버 canAdminPage로 테마를 결정하며 별도 역할 판정을 만들지 않는다', () => {
    const shell = read('src/components/shell/AppShell.tsx');
    expect(shell).toContain("data-ui={me?.canAdminPage ? 'admin' : 'teacher'}");
    // body에서 계산된 관리자 글자색을 그대로 상속하지 않고 셸 범위의 --fg를 다시 읽는다.
    expect(shell).toMatch(/['"][^'"]*bg-bg text-fg['"]/);
  });
});

describe('색 29개 — 명세서 v2 §85·§86', () => {
  it('KIND 8종 · SUB 21종', () => {
    expect(KIND_KEYS).toHaveLength(8);
    expect(SUB_KEYS).toHaveLength(21);
  });

  it('tokens.css 에 29개가 모두 있다', () => {
    KIND_KEYS.forEach((k) => expect(tokens).toContain(`--kind-${k}:`));
    SUB_KEYS.forEach((k) => expect(tokens).toContain(`--sub-${k}:`));
  });

  it('v2 값이다 — v1 의 밝은 값이 남아 있지 않다', () => {
    // v1 → v2 에서 29색이 전부 어두워졌다 (MERGE-2026-08-27.md)
    expect(tokens).toContain('--kind-class: #4A5461'); // v1 은 #5A6472
    expect(tokens).toContain('--sub-map-read: #A85764'); // v1 은 #C4707C
    expect(tokens).not.toContain('#5A6472');
    expect(tokens).not.toContain('#C4707C');
  });

  it('관리자 기본색 교정이 KIND 8종과 SUB 21종의 값을 바꾸지 않는다', () => {
    expect(Object.fromEntries(Object.entries(declarations(root)).filter(([name]) => /^(kind|sub)-/.test(name))))
      .toEqual({
        'kind-class': '#4A5461', 'kind-mock': '#BC7855', 'kind-gpa': '#816BB0', 'kind-study': '#59988B',
        'kind-consult': '#52969C', 'kind-diagx': '#6F798A', 'kind-consulting': '#AC6287', 'kind-meeting': '#736CAE',
        'sub-map-read': '#A85764', 'sub-map-math': '#B57046', 'sub-sat-read': '#4A827B', 'sub-sat-math': '#9C7A38',
        'sub-writing': '#736CAE', 'sub-vocab': '#6F8F52', 'sub-ap-chem': '#5677A5', 'sub-interview': '#AC6287',
        'sub-read-lab': '#568A9F', 'sub-study-room': '#59988B', 'sub-gpa-care': '#816BB0', 'sub-mock-sat': '#BE8551',
        'sub-mock-map': '#8D6B48', 'sub-diag': '#6F798A', 'sub-intake': '#52969C', 'sub-admissions': '#955675',
        'sub-mt-pl': '#6E6098', 'sub-mt-cs': '#477785', 'sub-mt-mk': '#9A5B71', 'sub-mt-dv': '#546FA2', 'sub-mt-pg': '#856C4A',
      });
  });
});

describe('Tailwind 는 읽기만 한다', () => {
  it('config 에 색 값(#rrggbb)이 없다', () => {
    const hex = tw.match(/#[0-9a-fA-F]{6}/g);
    expect(hex).toBeNull();
  });

  it('29개 키를 전부 var() 로 매핑한다', () => {
    KIND_KEYS.forEach((k) => expect(tw).toContain(`v('kind-${k}')`));
    SUB_KEYS.forEach((k) => expect(tw).toContain(`v('sub-${k}')`));
  });

  it('상태 색 CSS 변수에 Tailwind 투명도가 적용된다', () => {
    ['blue', 'red', 'green', 'amber', 'violet'].forEach((name) =>
      expect(tw).toContain(`withAlpha('${name}')`),
    );
    expect(tw).toContain('rgb(from ${v(name)} r g b / <alpha-value>)');
  });
});

describe('공통 셸 치수 — Figma Shell/Sidebar', () => {
  it('Expanded와 Rail 폭을 tokens.css 한 곳에 둔다', () => {
    expect(tokens).toContain('--side-w: 240px');
    expect(tokens).toContain('--side-rail-w: 56px');
  });
});

describe('원본 공통 헤더 — §07·§34', () => {
  it('9색 primary와 별개인 헤더 실측색을 CSS 한 곳에서 정의한다', () => {
    expect(declarations(root)).toMatchObject({
      header: '#332B27', 'header-active': '#4A403B', 'header-line': '#413936',
      'header-tool': '#16202E', 'header-tool-line': '#2B3648',
      'header-home': '#1D4ED8', 'header-approval': '#3B2F12',
    });
  });

  it('헤더 높이는 같은 토큰을 읽고 셸/본문은 별도 스크롤 경계를 갖는다', () => {
    const layout = read('src/components/shell/AppShell.module.css');
    expect(declarations(root)['top-h']).toBe('50px');
    expect(layout).toContain('min-height: var(--top-h)');
    expect(layout).toContain('height: 100dvh');
    expect(layout).toContain('overflow: auto');
  });
});

describe('런타임 주입 — 캘린더 블록이 쓰는 것', () => {
  it('키를 var() 문자열로 바꿔 준다', () => {
    expect(kindVar('gpa')).toBe('var(--kind-gpa)');
    expect(subVar('mt-pg')).toBe('var(--sub-mt-pg)');
  });
});

describe('관리자 일정색 — Meta 우선과 안전한 기존 토큰 fallback', () => {
  it('밝은 사용자 과목색이 본문 글자 대비를 낮추지 않는다', () => {
    const blockCss = read('src/components/cal/EventBlock.module.css');
    expect(blockCss).toMatch(/\n\s*color:\s*var\(--fg\);/);
    expect(blockCss).not.toMatch(/\n\s*color:\s*color-mix/);
  });
  const codes: CalendarCodeLookup = {
    subs: new Map([
      ['writing', { key: 'writing', name: 'Writing', color: '#123456' }],
      ['new-sub', { key: 'new-sub', name: '새 과목', color: '#aB12Cd' }],
    ]),
    kinds: new Map([
      ['class', { key: 'class', name: '수업', color: '#654321', cap: 4, grp: 'lesson', rep: true }],
      ['new-kind', { key: 'new-kind', name: '새 종류', color: '#13579B', cap: 1, grp: 'lesson', rep: false }],
    ]),
  };

  it('사용자 Meta 과목색을 기본 CSS 색보다 우선하고 새 코드도 수용한다', () => {
    expect(calendarEventColor({ subKey: 'writing', kindKey: 'class' }, codes)).toBe('#123456');
    expect(calendarEventColor({ subKey: 'new-sub', kindKey: 'class' }, codes)).toBe('#aB12Cd');
    expect(calendarEventColor({ kindKey: 'new-kind' }, codes)).toBe('#13579B');
  });

  it.each(['', '#fff', 'red', 'url(x)', '#123456;', 'var(--red)'])('잘못된 과목색 %s는 기존 SUB 토큰으로 복구한다', (color) => {
    const invalid = { ...codes, subs: new Map([['writing', { key: 'writing', name: 'Writing', color }]]) };
    expect(calendarEventColor({ subKey: 'writing', kindKey: 'class' }, invalid)).toBe('var(--sub-writing)');
  });

  it('과목 메타가 없으면 알려진 SUB 토큰, 알 수 없는 과목이면 KIND API 색을 사용한다', () => {
    expect(calendarEventColor({ subKey: 'ap-chem', kindKey: 'class' }, codes)).toBe('var(--sub-ap-chem)');
    expect(calendarEventColor({ subKey: 'unknown', kindKey: 'class' }, codes)).toBe('#654321');
    expect(calendarEventColor({ subKey: null, kindKey: 'class' }, codes)).toBe('#654321');
  });

  it('종류 API도 없거나 잘못됐으면 알려진 KIND 토큰 또는 중립색으로 복구한다', () => {
    const invalid = { ...codes, kinds: new Map([['class', { ...codes.kinds.get('class')!, color: 'invalid' }]]) };
    expect(calendarEventColor({ kindKey: 'class' }, invalid)).toBe('var(--kind-class)');
    expect(calendarEventColor({ kindKey: 'meeting' }, invalid)).toBe('var(--kind-meeting)');
    expect(calendarEventColor({ subKey: 'unknown', kindKey: 'unknown' }, invalid)).toBe('var(--fg-subtle)');
  });
});
