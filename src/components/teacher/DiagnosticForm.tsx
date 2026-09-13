/** @file-guide
 * 목적: DiagnosticForm.tsx — DiagnosticFormProps, REPORT_PRINCIPLES, DiagnosticForm (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 진단 리포트 작성 — 강사 원문 슬라이드 20 「04 진단 리포트 · 신규 학생 첫 수업」.
 *
 * 원문이 준 칸은 두 줄이다 — 「현재 수준 · 강점과 약점」과 「권장 커리큘럼」.
 * 강점과 약점은 표(`diag`)가 이미 갈라 두었으므로 화면도 갈라 받는다 — 한 칸에 몰면
 * 나중에 「약점만 모아 보기」를 할 수 없다.
 *
 * **글자 수 하한을 두지 않는다.** 원문은 일반(30자↑)·그룹(60자↑) 리포트에만 하한을 적었고
 * 진단에는 안 적었다. 없는 규칙을 화면이 만들면 원문에 없는 거절이 생긴다 (D-R44).
 * 대신 **모든 리포트의 원칙**(슬라이드 20 「공통」)을 폼 위에 그대로 적어 둔다.
 *
 * 담당 판정도 화면이 하지 않는다 — 남의 학생이면 서버가 404 로 돌려보낸다 (D-R39).
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreateDiagnostic } from '@/api/queries';
import { Banner, Button, CountedTextarea, Label } from '@/components/ui';

export interface DiagnosticFormProps {
  studentId: number;
  studentName: string;
  /** 이 학생의 이번 주 회차 하나 — 「어느 수업에서 봤는가」. 없으면 안 붙인다 */
  serId?: number | null;
  onDone?: () => void;
  onCancel?: () => void;
}

/** 슬라이드 20 「공통 — 모든 리포트의 원칙」 세 줄 그대로 */
export const REPORT_PRINCIPLES = [
  '사실만 씁니다.',
  '관찰하지 않은 것을 추측하지 않습니다.',
  '학생이 한 것과 강사가 도운 것을 나눕니다.',
] as const;

export function DiagnosticForm({ studentId, studentName, serId, onDone, onCancel }: DiagnosticFormProps) {
  const [levelSummary, setLevel] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const write = useCreateDiagnostic();

  const submit = () => {
    write.mutate(
      {
        studentId,
        levelSummary: levelSummary.trim(),
        strengths: strengths.trim() || undefined,
        weaknesses: weaknesses.trim() || undefined,
        curriculum: curriculum.trim() || undefined,
        serId: serId ?? undefined,
      },
      { onSuccess: () => onDone?.() },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Banner tone="neutral">
        <b>{studentName}</b> 학생의 진단 리포트입니다. 모든 리포트의 원칙 —{' '}
        {REPORT_PRINCIPLES.join(' ')}
      </Banner>

      <div>
        <Label htmlFor="diag-level">현재 수준 *</Label>
        <CountedTextarea
          id="diag-level" max={2000} value={levelSummary} onChange={setLevel}
          placeholder="지금 어느 수준인지 — 본 것만 적습니다"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="diag-strong">강점</Label>
          <CountedTextarea
            id="diag-strong" max={2000} value={strengths} onChange={setStrengths}
            placeholder="학생이 스스로 한 것"
          />
        </div>
        <div>
          <Label htmlFor="diag-weak">약점</Label>
          <CountedTextarea
            id="diag-weak" max={2000} value={weaknesses} onChange={setWeaknesses}
            placeholder="도움이 있어야 되던 것"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="diag-curri">권장 커리큘럼</Label>
        <CountedTextarea
          id="diag-curri" max={2000} value={curriculum} onChange={setCurriculum}
          placeholder="무엇을 얼마나 — 다음 재진단 시점까지"
        />
      </div>

      {write.isError ? <Banner tone="danger">{apiMessage(write.error)}</Banner> : null}

      <div className="flex justify-end gap-2">
        {onCancel ? <Button onClick={onCancel}>취소</Button> : null}
        <Button variant="primary" disabled={write.isPending || !levelSummary.trim()} onClick={submit}>
          {write.isPending ? '저장 중…' : '진단 저장'}
        </Button>
      </div>
      <p className="text-[11px] text-fg-subtle">
        저장한 진단은 고치지 않고 쌓입니다 — 그때의 판단이 사라지면 안 되기 때문입니다. 화면에는 늘 최신 한 건이 보입니다.
      </p>
    </div>
  );
}
