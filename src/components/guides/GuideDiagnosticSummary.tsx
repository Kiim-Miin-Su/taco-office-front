/** @file-guide
 * 목적: 학생 안내에서 관리자와 강사가 함께 보는 진단 요약을 한 모양으로 표시한다.
 * 책임/재사용: 생성 DTO의 기록 문구를 그대로 보여 주며 점수·영역을 화면에서 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { GuideDiagnostic, TeacherGuideDiag } from '@/api/types';

type Diagnostic = GuideDiagnostic | TeacherGuideDiag;

export function GuideDiagnosticSummary({ diagnostic }: { diagnostic: Diagnostic | null | undefined }) {
  if (!diagnostic) {
    return <p className="px-1 py-5 text-center text-[13px] text-fg-subtle">아직 진단 기록이 없습니다.</p>;
  }

  return (
    <dl className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
      <div className="rounded-lg border border-blue/30 bg-blue/5 p-3 md:col-span-2">
        <dt className="font-bold text-blue">현재 수준</dt>
        <dd className="mt-1 leading-relaxed text-fg">{diagnostic.levelSummary}</dd>
      </div>
      {diagnostic.strengths ? (
        <div className="rounded-lg border border-green/30 bg-green/5 p-3">
          <dt className="font-bold text-green">잘하는 것</dt>
          <dd className="mt-1 leading-relaxed text-fg">{diagnostic.strengths}</dd>
        </div>
      ) : null}
      {diagnostic.weaknesses ? (
        <div className="rounded-lg border border-red/30 bg-red/5 p-3">
          <dt className="font-bold text-red">보완할 것</dt>
          <dd className="mt-1 leading-relaxed text-fg">{diagnostic.weaknesses}</dd>
        </div>
      ) : null}
      {diagnostic.curriculum ? (
        <div className="rounded-lg bg-inset p-3 md:col-span-2">
          <dt className="font-bold text-fg">권장 커리큘럼</dt>
          <dd className="mt-1 leading-relaxed text-fg">{diagnostic.curriculum}</dd>
        </div>
      ) : null}
    </dl>
  );
}
