import type { Config } from 'tailwindcss';

/**
 * Tailwind — **색을 정의하지 않는다.** src/styles/tokens.css 의 변수를 읽기만 한다.
 *
 * 대표 결정 (D-R41): "스타일: 전역 - CSS Modules, 컴포넌트 - tailwind"
 * 두 벌이 되지 않게 선을 긋는다 (docs/contracts/STACK.md §2.2):
 *   토큰 → tokens.css 한 곳
 *   전역 · 레이아웃 → *.module.css
 *   컴포넌트 낱개 → Tailwind 유틸리티
 *
 * 이 파일은 dbml 처럼 생성물이다 — 색을 늘리려면 tokens.css 를 먼저 고친다.
 */
const v = (name: string) => `var(--${name})`;

/** CSS 변수 색에도 `bg-blue/10` 같은 Tailwind 투명도 수식이 실제로 적용되게 한다. */
const withAlpha = (name: string) => `rgb(from ${v(name)} r g b / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), card: v('card'), inset: v('inset'),
        line: { DEFAULT: v('line'), 2: v('line-2') },
        fg: { DEFAULT: v('fg'), 2: v('fg-2'), subtle: v('fg-subtle') },
        blue: withAlpha('blue'), red: withAlpha('red'), green: withAlpha('green'),
        amber: withAlpha('amber'), violet: withAlpha('violet'),
        /** 수업 종류 8종 — 명세서 v2 §85 */
        kind: {
          'class': v('kind-class'),
          'mock': v('kind-mock'),
          'gpa': v('kind-gpa'),
          'study': v('kind-study'),
          'consult': v('kind-consult'),
          'diagx': v('kind-diagx'),
          'consulting': v('kind-consulting'),
          'meeting': v('kind-meeting'),
        },
        /** 과목 21종 — 명세서 v2 §86 */
        sub: {
          'map-read': v('sub-map-read'),
          'map-math': v('sub-map-math'),
          'sat-read': v('sub-sat-read'),
          'sat-math': v('sub-sat-math'),
          'writing': v('sub-writing'),
          'vocab': v('sub-vocab'),
          'ap-chem': v('sub-ap-chem'),
          'interview': v('sub-interview'),
          'read-lab': v('sub-read-lab'),
          'study-room': v('sub-study-room'),
          'gpa-care': v('sub-gpa-care'),
          'mock-sat': v('sub-mock-sat'),
          'mock-map': v('sub-mock-map'),
          'diag': v('sub-diag'),
          'intake': v('sub-intake'),
          'admissions': v('sub-admissions'),
          'mt-pl': v('sub-mt-pl'),
          'mt-cs': v('sub-mt-cs'),
          'mt-mk': v('sub-mt-mk'),
          'mt-dv': v('sub-mt-dv'),
          'mt-pg': v('sub-mt-pg'),
        },
      },
      borderRadius: { sm: v('r-sm'), md: v('r-md') },
      spacing: { gap: v('gap'), pad: v('pad') },
      fontFamily: { sans: [v('f-sans')], mono: [v('f-mono')] },
    },
  },
  plugins: [],
} satisfies Config;
