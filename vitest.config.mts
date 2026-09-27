/** @file-guide
 * 목적: vitest.config.mts (config)
 * 책임/재사용: 기존 런타임/빌드/검사 설정을 유지한다. 의존성·배포·비밀값 변경은 별도 근거와 검증 없이는 추가하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Node 25 부터 Web Storage 가 기본으로 켜져 globalThis.localStorage · sessionStorage 가 먼저 있다(--localstorage-file 이 없으면
// 26 은 undefined · 25 는 메서드 없는 객체). vitest 2 의 jsdom 환경은 Node 가 이미 가진 이름을 덮지 않아 window.localStorage 가
// jsdom 것이 아니게 된다 — 그럴 때만 시험 작업자(forks)에서 Node 쪽 Web Storage 를 끈다. 제품 · 빌드에는 영향이 없다.
// Node 22 는 그 이름이 없어 인자를 더하지 않는다(22.0 ~ 22.3 은 이 인자를 모른다). 이름만 보고 값은 읽지 않는다(읽으면 경고가 난다).
const nodeWebStorageArgv = 'localStorage' in globalThis ? ['--no-experimental-webstorage'] : [];

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    poolOptions: { forks: { execArgv: nodeWebStorageArgv } },
  },
});
