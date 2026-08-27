// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'src/api/schema.d.ts'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          // D-R41 — 색은 tokens.css 한 곳에서만 정의한다.
          // .tsx 안의 #rrggbb 는 토큰을 두 벌로 만든다.
          selector: "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/]",
          message:
            '색을 여기 적지 마세요. src/styles/tokens.css 에 토큰을 만들고 Tailwind 의 kind-*/sub-* 로 쓰세요 (D-R41).',
        },
        {
          // D-R39 — 권한 판정은 서버가 내려준 플래그를 읽기만 한다.
          selector: "BinaryExpression[operator=/^[=!]==?$/] > MemberExpression[property.name='role']",
          message:
            "role 을 직접 비교하지 마세요. /auth/me 가 내려준 canAdminPage / canCrudAll / canSeeProfit 을 쓰세요 (D-R39).",
        },
      ],
    },
  },
);
