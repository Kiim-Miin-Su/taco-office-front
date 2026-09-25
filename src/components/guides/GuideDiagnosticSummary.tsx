/** @file-guide
 * 목적: 학생 안내에서 관리자와 강사가 함께 보는 진단 요약과 §44 진단 점수 카드 셋을 한 모양으로 표시한다.
 * 책임/재사용: 생성 DTO의 기록 문구를 그대로 보여 주며 점수·영역을 화면에서 추정하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { GuideDiagnostic, LeadDiag, TeacherGuideDiag } from '@/api/types';

type Diagnostic = GuideDiagnostic | TeacherGuideDiag;

/**
 * §44 진단 카드 셋 — 「영어 62 · 수학 71 · 인터뷰 58」 (g4 §44-2 · DQ1 「점수만 저장」).
 * 값은 서버가 준 상담 진단의 최신 줄 그대로이고, 적지 않은 과목은 「—」다 — 0 점을 짓지 않는다.
 * 레벨은 담당자가 고른 낱말(서버 levelLabel)만 적는다. 항목별 잘함·중간·못함은 저장하지 않는 값이라 두지 않는다.
 */
export function GuideScoreCards({ scores }: { scores: LeadDiag | null | undefined }) {
  if (!scores) return null;
  const cards: Array<[string, number | null | undefined]> = [
    ['영어', scores.english],
    ['수학', scores.math],
    ['인터뷰', scores.interview],
  ];
  return (
    <div role="group" aria-label="진단 점수" className="mb-3">
      <div className="grid grid-cols-3 gap-2">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-card p-3 text-center">
            <div className="text-[11px] font-bold text-fg-subtle">{label}</div>
            <div className="mt-1 text-[22px] font-bold text-fg">{value ?? '—'}</div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-fg-subtle">
        {[scores.takenOn ? `${scores.takenOn} 진단고사` : '진단고사', scores.levelLabel ? `레벨 ${scores.levelLabel}` : null,
          scores.byName ? `${scores.byName} 기록` : null].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

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
