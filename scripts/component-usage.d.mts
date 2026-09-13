/** @file-guide
 * 목적: component-usage.d.ts (config)
 * 책임/재사용: 기존 런타임/빌드/검사 설정을 유지한다. 의존성·배포·비밀값 변경은 별도 근거와 검증 없이는 추가하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** `component-usage.mjs` 는 빌드에 들어가지 않는 검사 도구다 — 회귀가 부를 만큼만 적는다. */
export declare const COUNTED: Record<string, readonly string[]>;
export declare function files(dir?: string): string[];
export declare function count(): Record<string, number>;
