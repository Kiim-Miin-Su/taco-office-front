/** @file-guide
 * 목적: ReportWriterGuide.tsx — ReportWriterGuide, REPORT_WRITER_RULES, REPORT_OBSERVATION_EXAMPLES (component)
 * 책임/재사용: 강사 덱 slide 19 작성 양식 아래 「학부모님이 직접 읽는 리포트입니다」 안내 상자 — 쓰는 사람에게 보이는 고정 문구(원문 그대로)만 그린다.
 *   학부모에게 나가는 글이 아니고 입력을 짓거나 고치지 않는다(판정 · 저장 없음). 부르는 쪽(ReportEditor)이 강사 표면 · 쓸 수 있는 글에서만 세운다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import { AlertTriangle } from 'lucide-react';

/** 강사 덱 slide 19 노란 상자 네 줄 — 낱말 그대로 */
export const REPORT_WRITER_RULES = [
  { rule: '잘한 점과 가능성을 앞에 두세요.', detail: '어려웠던 부분은 앞으로의 계획으로 바꿔 씁니다.' },
  { rule: '단정하는 표현을 빼 주세요.', detail: '"부족합니다", "못합니다", "낮습니다" → "지금부터 채워 나가면 좋을 부분입니다"' },
  { rule: '아이를 규정하거나 다른 아이와 비교하지 마세요.', detail: '성격 · 타고난 능력 · 등급 · 합격 가능성은 쓰지 않습니다.' },
  { rule: '그래도 사실은 빠뜨리지 마세요.', detail: '점수와 관찰 내용은 모두 들어가야 합니다. 좋게 쓰되 없는 이야기를 만들지 않습니다.' },
] as const;

/** 같은 상자 아래 「확정형 표현을 관찰형으로 바꿔 주세요」 세 줄 — 낱말 그대로 */
export const REPORT_OBSERVATION_EXAMPLES = [
  { from: '수학이 부족합니다', to: '계산 과정에서 연습이 더 필요해 보입니다' },
  { from: '집중을 못 합니다', to: '20분이 지나며 집중이 흔들리는 모습이었습니다' },
  { from: '이 점수면 어렵습니다', to: '지금부터 준비하면 채워 나갈 수 있는 구간입니다' },
] as const;

export function ReportWriterGuide() {
  return (
    <section aria-labelledby="report-writer-guide-title" className="rounded-xl border border-amber/60 bg-amber/10 p-4">
      <h3 id="report-writer-guide-title" className="flex items-center gap-1.5 text-[13px] font-bold text-fg">
        <AlertTriangle size={14} aria-hidden />학부모님이 직접 읽는 리포트입니다
      </h3>
      <ol className="mt-2.5 flex list-decimal flex-col gap-2 pl-5">
        {REPORT_WRITER_RULES.map((item) => (
          <li key={item.rule} className="text-[12.5px] font-bold text-fg">
            {item.rule}
            <span className="mt-0.5 block text-[11.5px] font-normal text-fg-2">{item.detail}</span>
          </li>
        ))}
      </ol>
      {/* 원문의 어두운 붉은 상자 — 새 색을 만들지 않고 토큰을 섞는다(Button hover 와 같은 방식) */}
      <div className="mt-3 rounded-lg bg-[color-mix(in_srgb,var(--red)_55%,var(--fg))] px-4 py-3 text-white">
        <p className="text-[12.5px] font-bold">확정형 표현을 관찰형으로 바꿔 주세요</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-[12px]">
          {REPORT_OBSERVATION_EXAMPLES.map((example) => (
            <li key={example.from}>
              <s className="text-white/80">{example.from}</s>
              <span aria-hidden> → </span>
              <span className="sr-only"> 대신 </span>
              <b>{example.to}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
