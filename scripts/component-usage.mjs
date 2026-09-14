/** @file-guide
 * 목적: component-usage.mjs — COUNTED, files, count (script)
 * 책임/재사용: 검사/생성/실행 도구의 책임만 소유한다. 대상 경로와 실행 권한을 확인하고 실패를 성공으로 기록하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §86 컴포넌트 갤러리의 「N회 씀」을 **세는 자리 하나**.
 *
 * 원문 컷은 카드마다 「371회 씀」 같은 숫자를 달고 있다. 그 숫자를 손으로 적으면
 * 적은 그날부터 틀리기 시작한다 — 그리고 틀린 줄 아무도 모른다.
 * 그래서 **소스에서 센다.** 화면은 이 파일이 만든 JSON 을 그리기만 한다 (D-R37 과 같은 판단).
 *
 * 세는 법: `src/**` 의 `.tsx` 에서 여는 태그 `<Name` 을 센다.
 *   · 시험(`*.test.tsx`)은 빼고 센다 — 시험이 많이 쓴다고 화면에서 많이 쓰는 것이 아니다.
 *   · 갤러리 자기 자신도 뺀다 — 본보기로 한 번씩 쓴 것이 숫자를 올리면 안 된다.
 *
 * 갱신: `npm run usage:gen`. 오래됐는지는 `component-usage.test.ts` 가 다시 세어 본다.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(SRC, 'lib/component-usage.json');

/** 갤러리가 보여 주는 컴포넌트 → 소스에서 찾을 여는 태그들 */
export const COUNTED = {
  button: ['Button', 'LinkButton'],
  badge: ['Chip', 'StatusBadge'],
  mark: ['BoardMarks'],
  input: ['Input', 'Select', 'Textarea', 'Checkbox', 'CountedTextarea'],
  field: ['Label'],
  stat: ['StatCard'],
  banner: ['Banner'],
  table: ['Table'],
  panel: ['Panel', 'PageHeader'],
  board: ['Board'],
  overlay: ['Drawer', 'Dialog'],
  tabs: ['Tabs', 'Segmented', 'TabCards'],
};

/** 갤러리 자신은 분모에서 뺀다 — 본보기로 쓴 한 번이 숫자를 올리면 안 된다 */
const SKIP = /(\.test\.tsx$)|(components\/design\/)/;

export function files(dir = SRC) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.tsx') && !SKIP.test(relative(ROOT, p))) out.push(p);
  }
  return out.sort();
}

export function count() {
  const texts = files().map((f) => readFileSync(f, 'utf8'));
  const counts = {};
  for (const [key, tags] of Object.entries(COUNTED)) {
    let n = 0;
    for (const tag of tags) {
      // 여는 태그만 — `</Button>` 과 `ButtonProps` 는 안 센다
      const re = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
      for (const t of texts) n += (t.match(re) || []).length;
    }
    counts[key] = n;
  }
  return counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const counts = count();
  writeFileSync(OUT, `${JSON.stringify({ version: 1, counts }, null, 2)}\n`);
  console.log(
    `component-usage.json — ${Object.keys(counts).length}종 · 합계 ${Object.values(counts).reduce((a, b) => a + b, 0)}회`,
  );
}
