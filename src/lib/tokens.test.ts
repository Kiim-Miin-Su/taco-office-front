/**
 * 토큰이 한 곳에만 있는지 확인한다 (D-R41).
 *
 * 색을 두 벌로 만드는 실수는 조용하다 — 화면은 멀쩡히 뜨고 명세서와만 어긋난다.
 * 그래서 파일을 직접 읽어 대조한다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KIND_KEYS, SUB_KEYS, kindVar, subVar } from './tokens';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const tokens = read('src/styles/tokens.css');
const tw = read('tailwind.config.ts');

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
});

describe('런타임 주입 — 캘린더 블록이 쓰는 것', () => {
  it('키를 var() 문자열로 바꿔 준다', () => {
    expect(kindVar('gpa')).toBe('var(--kind-gpa)');
    expect(subVar('mt-pg')).toBe('var(--sub-mt-pg)');
  });
});
