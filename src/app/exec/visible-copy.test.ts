/** @file-guide
 * 목적: 회계 · 운영 · 대표 보고 · GPA · 디자인 화면의 **사용자에게 보이는 글**에 내부 결정 코드·절 번호가 없는지 지킨다.
 * 책임/재사용: 소스를 TypeScript 파서로 읽어 JSX 글자와 문자열 값만 본다 — 주석(개발자용 근거)은 보지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/*
 * 「(D-R39)」「(A-D5 …)」「(O-148)」「원문 §54」「(N-12)」 같은 낱말은 **우리가 결정을 찾아가는 색인**이지
 * 대표·매니저가 읽을 말이 아니다. 화면에 찍히면 읽는 사람은 뜻 모를 암호를 보거나, 더 나쁘게는
 * 「§14 승인 서랍」처럼 **없는 이름**을 찾아 헤맨다. 근거는 주석에 남기고 화면에는 사람의 말만 둔다.
 *
 * 렌더해서 보는 시험은 화면마다 한 상태만 본다 — 조건부 배너·툴팁·placeholder 는 빠지기 쉽다.
 * 그래서 이 시험은 **소스의 글자 전부**를 본다. 서버가 내려보내는 문장(오류 메시지 등)은 여기서 못 본다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const DIRS = ['src/components/accounting', 'src/components/ops', 'src/components/design', 'src/components/exec'];
const FILES = [
  'src/app/accounting/page.tsx', 'src/app/ops/page.tsx', 'src/app/exec/page.tsx', 'src/app/gpa/page.tsx',
  'src/components/data/GpaPointCard.tsx', 'src/components/ui/WideDialog.tsx',
  ...DIRS.flatMap((d) => readdirSync(d)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    // 상담 입구(Lead*)는 이 묶음이 아니다 — 그 화면의 시험이 따로 지킨다
    .filter((f) => !f.startsWith('Lead'))
    .map((f) => join(d, f))),
];

/** 결정 코드 · 절 번호 — 사람이 읽을 글에 있으면 안 되는 모양 */
const CODE = /§\s?\d|\bD-R\d+|\bA-D\d+|\bA-\d+\b|\bO-\d{2,}|\bN-\d+|\bH-\d+\b/;

function visibleStrings(file: string): Array<{ line: number; text: string }> {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Array<{ line: number; text: string }> = [];
  const visit = (n: ts.Node) => {
    let text: string | null = null;
    if (ts.isJsxText(n)) text = n.getText();
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      // import 경로는 글이 아니다
      if (!ts.isImportDeclaration(n.parent)) text = n.text;
    } else if (ts.isTemplateExpression(n)) text = n.getText();
    if (text !== null && text.trim() !== '') out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

it('보이는 글에 결정 코드·절 번호가 없다 — 근거는 주석에만 둔다', () => {
  expect(FILES.length).toBeGreaterThan(20);
  const hits = FILES.flatMap((f) => visibleStrings(f)
    .filter((s) => CODE.test(s.text))
    .map((s) => `${f}:${s.line} ${s.text.trim().replace(/\s+/g, ' ').slice(0, 80)}`));
  expect(hits).toEqual([]);
});

it('검사기 자체가 코드를 잡는다 — 비어 있다고 통과로 읽지 않는다', () => {
  for (const bad of ['(D-R39)', '(A-D5 간이 5분류)', '(O-148)', '원문 §54 의', '(N-12)', '(A-4)', '(H-81)']) {
    expect(CODE.test(bad), bad).toBe(true);
  }
  for (const ok of ['26년 9월 23일 수요일', '09-21 ~ 09-27', '배정 10p', 'G9', '₩1,365,000']) {
    expect(CODE.test(ok), ok).toBe(false);
  }
});
