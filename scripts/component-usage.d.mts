/** @file-guide
 * 목적: component-usage.d.mts (script)
 * 책임/재사용: 검사/생성/실행 도구의 책임만 소유한다. 대상 경로와 실행 권한을 확인하고 실패를 성공으로 기록하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/** `component-usage.mjs` 는 빌드에 들어가지 않는 검사 도구다 — 회귀가 부를 만큼만 적는다. */
export declare const COUNTED: Record<string, readonly string[]>;
export declare function files(dir?: string): string[];
export declare function count(): Record<string, number>;
