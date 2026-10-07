/** @file-guide
 * 목적: 관리자 A32·강사 T25·Figma 공통 출하 기준의 사용자 표시 글자 최소 12px를 소스에서 지킨다.
 * 책임/재사용: 제품 TSX의 명시적 10px/11px 글자 클래스만 검사하며, 렌더 잘림·겹침은 화면 품질 하네스가 맡는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const PRODUCT_ROOTS = ['src/app', 'src/components'];
const EXPLICIT_TEXT_SIZE = /text-\[([0-9]+(?:\.[0-9]+)?)px\]|font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g;

function productFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return productFiles(path);
    return entry.isFile() && path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : [];
  });
}

it('keeps every explicit product text size at 12px or larger', () => {
  const violations = PRODUCT_ROOTS.flatMap(productFiles).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return Array.from(source.matchAll(EXPLICIT_TEXT_SIZE))
      .filter((match) => Number(match[1] ?? match[2]) < 12)
      .map((match) => `${file}:${match.index}:${match[0]}`);
  });

  expect(violations).toEqual([]);
});
