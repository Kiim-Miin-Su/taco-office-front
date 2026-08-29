/**
 * Report/Section · Form/Report Dev · UI/Counted Textarea — 리포트 **5칸 고정** (D-R40).
 *
 * 칸을 늘리거나 순서를 바꾸지 않는다. 수업 종류·과목에 따라 갈리지도 않는다 —
 * 학부모가 매번 같은 자리에서 같은 것을 찾게 하기 위한 규칙이다.
 */
'use client';
import { CountedTextarea, Label, Panel } from '../ui';

/** 순서가 곧 규칙이다. 배열을 재정렬하면 D-R40 을 깨는 것이다. */
export const REPORT_FIELDS = [
  { key: 'progress', label: '① 진도', hint: '어디까지 나갔는가', min: 10 },
  { key: 'understanding', label: '② 이해도', hint: '무엇을 알고 무엇을 못했는가', min: 40 },
  { key: 'attitude', label: '③ 태도', hint: '수업 중 태도', min: 10 },
  { key: 'homework', label: '④ 과제', hint: '무엇을 해 와야 하는가', min: 10 },
  { key: 'note', label: '⑤ 특이사항', hint: '없으면 「없음」', min: 0 },
] as const;

export type ReportBody = Record<(typeof REPORT_FIELDS)[number]['key'], string>;

export const emptyReport = (): ReportBody =>
  Object.fromEntries(REPORT_FIELDS.map((f) => [f.key, ''])) as ReportBody;

export function ReportForm({ value, onChange, readOnly }: {
  value: ReportBody; onChange: (v: ReportBody) => void; readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {REPORT_FIELDS.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`rep-${f.key}`} hint={f.min ? `${f.min}자 이상` : undefined}>
            {f.label} <span className="font-normal text-fg-subtle">— {f.hint}</span>
          </Label>
          {readOnly ? (
            <p className="whitespace-pre-wrap rounded-lg border border-line bg-inset p-3 text-[12.5px] leading-relaxed text-fg">
              {value[f.key] || '—'}
            </p>
          ) : (
            <CountedTextarea
              id={`rep-${f.key}`}
              value={value[f.key]}
              min={f.min}
              onChange={(v) => onChange({ ...value, [f.key]: v })}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * 학부모에게 나가는 전문 (§50).
 * PNG 파일 이름은 **서버가 정한다** — 두 곳에서 만들면 규칙이 갈린다 (D-R33).
 */
export function ReportPreview({ studentName, grade, date, subject, startTime, body }: {
  studentName: string; grade?: string | null; date: string; subject: string; startTime: string; body: ReportBody;
}) {
  return (
    <Panel title="학부모가 받는 화면" sub="칸도 순서도 바뀌지 않습니다.">
      <div className="overflow-hidden rounded-lg border border-line-2">
        <header className="bg-fg px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[16px] font-bold text-white">{studentName}</span>
            <span className="text-[11px] text-line-2">{grade}</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-line-2">티엔아카데미 · {date}</div>
        </header>
        <div className="flex items-center gap-3 bg-inset px-4 py-2 text-[11.5px]">
          <span className="font-bold text-fg">{date}</span>
          <span className="font-bold text-blue">{subject}</span>
          <span className="text-fg-subtle">{startTime}</span>
        </div>
        <div className="flex flex-col gap-3 p-4">
          {REPORT_FIELDS.map((f) => (
            <div key={f.key} className="border-l-2 border-blue pl-3">
              <div className="text-[11px] font-bold text-fg">{f.label.replace(/^[①②③④⑤]\s*/, '')}</div>
              <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg-2">{body[f.key] || '—'}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
