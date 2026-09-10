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
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { Chip, type ChipStyle, type Tone } from '@/components/ui/Chip';
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

// CSS/SSR 기반 색 회귀다. 브라우저 픽셀·임의 className·모든 부모 배경을 검증한 것은 아니다.
// WCAG 2.2 SC 1.4.3: 작은 글자 4.5:1, 반올림 금지. 비활성 버튼은 별도 경계로 검사한다.
type Colors = Record<string, string>;
const rgb = (colors: Colors, name: string): number[] => {
  if (name === 'white') return [255, 255, 255];
  const value = colors[name];
  if (!value) throw new Error(`없는 색 토큰: ${name}`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias) return rgb(colors, alias[1]);
  if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`측정하지 못하는 색: ${value}`);
  return [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
};
const composite = (foreground: number[], background: number[], opacity: number) =>
  foreground.map((channel, i) => channel * opacity + background[i] * (1 - opacity));
const luminance = (color: number[]) => color.reduce((sum, channel, i) => {
  const s = channel / 255;
  const linear = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  return sum + linear * [0.2126, 0.7152, 0.0722][i];
}, 0);
const contrast = (a: number[], b: number[]) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
const classNames = (markup: string) => {
  const match = markup.match(/class="([^"]+)"/);
  if (!match) throw new Error('렌더된 class 없음');
  return match[1].split(' ');
};
const renderedContrast = (markup: string, colors: Colors, surface: number[], hover = false) => {
  const classes = classNames(markup);
  const foreground = classes.find((name) => /^text-(white|fg(?:-2|-subtle)?|primary|blue|red|green|amber|violet)$/.test(name));
  if (!foreground) throw new Error('측정할 글자색 없음');
  const hoverBackground = hover ? classes.find((name) => name.startsWith('hover:bg-'))?.slice(6) : undefined;
  const background = hoverBackground ?? classes.find((name) => name.startsWith('bg-'));
  let fill = surface;
  if (background) {
    const mixed = background.match(/^bg-\[color-mix\(in_srgb,var\(--([\w-]+)\)_(\d+)%,var\(--([\w-]+)\)\)\]$/);
    if (mixed) {
      fill = composite(rgb(colors, mixed[1]), rgb(colors, mixed[3]), Number(mixed[2]) / 100);
    } else {
      const [name, alpha = '100'] = background.slice(3).split('/');
      fill = composite(rgb(colors, name), surface, Number(alpha) / 100);
    }
  }
  // 기존 hover:opacity-90처럼 부모 바탕과 글자/배경이 함께 합성되는 회귀를 놓치지 않는다.
  const alpha = hover ? classes.find((name) => /^hover:opacity-\d+$/.test(name))?.split('-').at(-1) : undefined;
  const opacity = alpha ? Number(alpha) / 100 : 1;
  return contrast(composite(rgb(colors, foreground.slice(5)), surface, opacity), composite(fill, surface, opacity));
};
const themes: Array<[string, Colors]> = [
  ['admin', declarations(root)],
  ['teacher', { ...declarations(root), ...declarations(teacher) }],
];
const surfaces = (colors: Colors): Array<[string, number[]]> => [
  ...['card', 'bg', 'inset'].map((name): [string, number[]] => [name, rgb(colors, name)]),
  ['blue/5 on card', composite(rgb(colors, 'blue'), rgb(colors, 'card'), 0.05)],
  ['blue/5 on bg', composite(rgb(colors, 'blue'), rgb(colors, 'bg'), 0.05)],
];
const buttonVariants: ButtonVariant[] = ['primary', 'dark', 'secondary', 'danger', 'success', 'ghost'];
const chipTones: Tone[] = ['neutral', 'info', 'success', 'warning', 'danger', 'purple'];
const chipStyles: ChipStyle[] = ['outline', 'soft', 'solid'];

describe('공용 Button/Chip 작은 글자 대비 — 표준 바탕과 5% 알림 바탕', () => {
  it('측정식의 흑백 기준과 4.50 반올림 오판을 검증한다', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBe(21);
    expect(contrast([148, 111, 87], [255, 255, 255])).toBeLessThan(4.5);
  });

  it.each(themes.flatMap(([theme, colors]) => buttonVariants.map((variant) => ({ theme, colors, variant }))))(
    '$theme Button/$variant 기본·hover는 4.5 이상이다', ({ theme, colors, variant }) => {
      const markup = renderToStaticMarkup(createElement(Button, { variant }, '저장'));
      for (const [surface, background] of surfaces(colors)) {
        for (const hover of [false, true]) {
          expect(renderedContrast(markup, colors, background, hover), `${theme}/${variant}/${surface}/hover=${hover}`)
            .toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it.each(themes.flatMap(([theme, colors]) => chipTones.flatMap((tone) => chipStyles.map((styleKind) => ({ theme, colors, tone, styleKind })))))(
    '$theme Chip/$tone/$styleKind는 4.5 이상이다', ({ theme, colors, tone, styleKind }) => {
      const markup = renderToStaticMarkup(createElement(Chip, { tone, styleKind, children: '상태' }));
      for (const [surface, background] of surfaces(colors)) {
        expect(renderedContrast(markup, colors, background), `${theme}/${tone}/${styleKind}/${surface}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(themes)('%s의 키보드 focus 표식은 표준 바탕과 3:1 이상이다', (_theme, colors) => {
    for (const variant of buttonVariants) {
      const markup = renderToStaticMarkup(createElement(Button, { variant }, '저장'));
      expect(classNames(markup)).toEqual(expect.arrayContaining([
        'focus-visible:outline', 'focus-visible:outline-2', 'focus-visible:outline-offset-2', 'focus-visible:outline-fg',
      ]));
    }
    for (const [, background] of surfaces(colors)) expect(contrast(rgb(colors, 'fg'), background)).toBeGreaterThanOrEqual(3);
  });

  it('disabled는 native 비활성 속성을 유지하며 활성 대비 통과로 집계하지 않는다', () => {
    const markup = renderToStaticMarkup(createElement(Button, { variant: 'primary', disabled: true }, '저장'));
    expect(markup).toContain('disabled=""');
    expect(classNames(markup)).toContain('disabled:opacity-40');
  });
});

describe('관리자 §85 색상 계열·접근성 교정과 강사 테마 경계', () => {
  it.each(Object.entries({
    primary: '#83624D', violet: '#6C5B72', green: '#4D6654', amber: '#7D5A2D', red: '#8E4A45',
    fg: '#2A2320', 'fg-subtle': '#615650', line: '#E3D9D3', bg: '#F6F3F1',
  }))('기본 --%s는 최신 접근성 교정값 %s다', (name, color) => {
    expect(declarations(root)[name]).toBe(color);
  });

  it('원본에 별도 값이 없는 중간 단계는 의미 토큰을 재사용한다', () => {
    expect(declarations(root)).toMatchObject({
      inset: 'var(--bg)', 'line-2': 'var(--line)', 'fg-2': 'var(--fg-subtle)',
    });
  });

  it('강사의 바탕·글자는 유지하고 상태색 대비는 셸 범위에서 보강하며 primary는 blue를 참조한다', () => {
    expect(declarations(teacher)).toMatchObject({
      bg: '#F4F6FA', card: '#FFFFFF', inset: '#F8FAFC', line: '#E5EAF1', 'line-2': '#D8E0EA',
      fg: '#0F172A', 'fg-2': '#334155', 'fg-subtle': '#64748B', primary: 'var(--blue)',
      red: '#BC183C', green: '#127036', amber: '#9E4908', violet: '#7537E1',
    });
    expect(Object.keys(declarations(teacher)).some((name) => /^(kind|sub)-/.test(name))).toBe(false);
  });

  it('예정 상태의 blue는 공용 대비 교정값이며 primary도 같은 투명도 매핑을 사용한다', () => {
    expect(declarations(root).blue).toBe('#2157D0');
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
