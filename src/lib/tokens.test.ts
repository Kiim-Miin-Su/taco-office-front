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
import { KIND_KEYS, SUB_KEYS, kindVar, subVar } from './tokens';

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
    expect(shell).toContain('className="min-h-screen bg-bg text-fg"');
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

describe('런타임 주입 — 캘린더 블록이 쓰는 것', () => {
  it('키를 var() 문자열로 바꿔 준다', () => {
    expect(kindVar('gpa')).toBe('var(--kind-gpa)');
    expect(subVar('mt-pg')).toBe('var(--sub-mt-pg)');
  });
});
