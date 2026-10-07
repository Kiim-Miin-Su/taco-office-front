/** @file-guide
 * 목적: StudentReactivationSection.tsx — 권위 withdrawn 후보 검색·미리보기·재활성화 저장 흐름을 소유한다.
 * 책임/재사용: 생성 OpenAPI 타입과 공용 학생 query/mutation·UI를 재사용하고 신규 학생 등록 입력은 소유하지 않는다.
 * 검증/작업 지침: docs/sprint/TBO-55/features/BOC-03D3A-STUDENT-REACTIVATION-POLICY-2026-10-07.md · docs/AGENT.md
 */
'use client';
import { useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useStudentReactivate,
  useStudentReactivationCandidates,
  useStudentReactivationPreview,
  type StudentReactivation,
  type StudentReactivationCandidate,
  type StudentReactivationPreview,
  type StudentReactivationResult,
} from '@/api/students';
import { todayKst } from '@/lib/calendar';
import type { StudentRegistrationSource } from '@/lib/student-registration-route';
import { Banner, Button, Chip, Input, Label, Select, Textarea } from '@/components/ui';

export function StudentReactivationSection({ entrySource, leadId }: { entrySource: StudentRegistrationSource; leadId: number | null }) {
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const candidates = useStudentReactivationCandidates({ q: query, page: 1 });
  const previewMutation = useStudentReactivationPreview();
  const saveMutation = useStudentReactivate();
  const [selected, setSelected] = useState<StudentReactivationCandidate | null>(null);
  const [reactivateOn, setReactivateOn] = useState(todayKst());
  const [channel, setChannel] = useState<StudentReactivation['consultation']['channel']>('phone');
  const [content, setContent] = useState('');
  const [nextOn, setNextOn] = useState('');
  const [prepared, setPrepared] = useState<{ body: StudentReactivation; preview: StudentReactivationPreview } | null>(null);
  const [saved, setSaved] = useState<StudentReactivationResult | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const pending = previewMutation.isPending || saveMutation.isPending;

  const resetDecision = () => { setPrepared(null); setSaved(null); setIssue(null); };
  const edit = <T,>(setter: (value: T) => void, value: T) => { setter(value); resetDecision(); };
  const select = (candidate: StudentReactivationCandidate) => {
    if (!candidate.reactivatable) return;
    setSelected(candidate); resetDecision();
  };
  const build = (requestKey: string): StudentReactivation | null => {
    if (!selected) { setIssue('재활성화할 퇴원 학생을 선택해 주세요.'); return null; }
    if (!reactivateOn) { setIssue('재활성화일을 선택해 주세요.'); return null; }
    if (!content.trim()) { setIssue('새 상담 내용을 입력해 주세요.'); return null; }
    const fromIntake = entrySource === 'intake' && leadId !== null;
    return {
      requestKey,
      studentId: selected.studentId,
      expectedProfileVersion: selected.profileVersion,
      entrySource: fromIntake ? 'intake' : 'students',
      leadId: fromIntake ? leadId : null,
      reactivateOn,
      consultation: { channel, content: content.trim(), nextOn: nextOn || null },
    };
  };
  const preview = async () => {
    resetDecision();
    const body = build(globalThis.crypto.randomUUID());
    if (!body) return;
    try {
      const result = await previewMutation.mutateAsync({ studentId: body.studentId, body });
      setPrepared({ body, preview: result });
    } catch (error) { setIssue(apiMessage(error)); }
  };
  const save = async () => {
    if (!prepared) return;
    setIssue(null);
    try {
      setSaved(await saveMutation.mutateAsync({ studentId: prepared.body.studentId, body: prepared.body }));
    } catch (error) {
      setPrepared(null);
      setIssue(apiMessage(error));
    }
  };
  const search = () => {
    const next = draftQuery.trim();
    setSelected(null); resetDecision();
    if (next === query) void candidates.refetch();
    else setQuery(next);
  };

  /*
   * BOC-03D-03b 권고안 채택(2026-10-07): 화면도 서버의 withdrawn 후보와 profileVersion만 사용한다.
   * preview는 쓰기 0이며 같은 requestKey/body를 실제 저장에 재사용한다. 휴원·수강·명단으로 상태를 추정하지 않는다.
   */
  return (
    <section aria-label="기존 학생 재활성화" className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <h2 className="text-[14px] font-bold text-fg">기존 학생 재활성화</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-2">
        퇴원 학생의 같은 STU ID를 유지하고 새 상담 기록을 연결합니다. 신규 학생·수업·청구·교재·안내·첫 수업 할 일은 만들지 않습니다.
      </p>
      <Banner tone="neutral" className="mt-4">명시적으로 퇴원 처리된 학생만 선택할 수 있습니다. 상태가 확인되지 않는 기존 학생은 관리자 확인 뒤 처리합니다.</Banner>

      <form className="mt-4 flex flex-col gap-4" onSubmit={event => { event.preventDefault(); search(); }}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div><Label htmlFor="reactivation-student-search">퇴원 학생 검색</Label><Input id="reactivation-student-search" type="search" value={draftQuery} onChange={event => setDraftQuery(event.target.value)} placeholder="이름·영문명" disabled={pending} /></div>
          <div className="flex items-end"><Button type="submit" className="max-sm:min-h-11" disabled={pending}>{candidates.isFetching ? '검색 중…' : '검색'}</Button></div>
        </div>
      </form>

      {candidates.isError ? <Banner tone="danger" className="mt-3">{apiMessage(candidates.error)}</Banner> : null}
      {candidates.data ? <div aria-label="재활성화 후보" className="mt-3 flex flex-col gap-2">
        {candidates.data.items.length === 0 ? <p className="text-[12px] text-fg-subtle">검색 결과가 없습니다.</p> : candidates.data.items.map(candidate => (
          <button key={candidate.studentId} type="button" disabled={!candidate.reactivatable || pending}
            aria-pressed={selected?.studentId === candidate.studentId} onClick={() => select(candidate)}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line bg-card px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary">
            <span><b className="text-[13px]">{candidate.name}</b><span className="ml-2 text-[12px] text-fg-subtle">STU #{candidate.studentId}{candidate.gradeLabel ? ` · ${candidate.gradeLabel}` : ''}{candidate.schoolLabel ? ` · ${candidate.schoolLabel}` : ''}</span></span>
            <Chip tone={candidate.reactivatable ? 'orange' : 'neutral'} size="compact">{candidate.reactivatable ? `퇴원 ${candidate.withdrawnOn ?? ''}`.trim() : candidate.status === 'active' ? '재원 중' : '상태 확인 필요'}</Chip>
          </button>
        ))}
      </div> : null}

      {selected ? <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-inset p-3">
        <p className="text-[12px]"><b>{selected.name} · STU #{selected.studentId}</b>의 최신 학생 정보를 확인했습니다.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><Label htmlFor="reactivation-on">재활성화일 *</Label><Input id="reactivation-on" type="date" value={reactivateOn} disabled={pending} onChange={event => edit(setReactivateOn, event.target.value)} /></div>
          <div><Label htmlFor="reactivation-channel">상담 채널 *</Label><Select id="reactivation-channel" value={channel} disabled={pending} onChange={event => edit(setChannel, event.target.value as typeof channel)}><option value="visit">방문</option><option value="phone">전화</option><option value="kakao">카카오</option><option value="other">기타</option></Select></div>
          <div className="md:col-span-2"><Label htmlFor="reactivation-content" hint={`${content.length} / 2000`}>새 상담 내용 *</Label><Textarea id="reactivation-content" value={content} maxLength={2000} disabled={pending} onChange={event => edit(setContent, event.target.value)} /></div>
          <div><Label htmlFor="reactivation-next-on">다음 상담일</Label><Input id="reactivation-next-on" type="date" value={nextOn} disabled={pending} onChange={event => edit(setNextOn, event.target.value)} /></div>
        </div>
        {prepared && !saved ? <Banner tone="info">미리보기 완료 · 수업·청구 등 추가 생성 없이 같은 학생으로 저장합니다.</Banner> : null}
        {saved ? <Banner tone="success"><span role="status">{selected.name} 학생을 재활성화했습니다. STU #{saved.studentId}</span></Banner> : null}
        {issue ? <Banner tone="danger">{issue}</Banner> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="max-sm:min-h-11" onClick={preview} disabled={pending || Boolean(saved)}>{previewMutation.isPending ? '확인 중…' : '저장 전 미리보기'}</Button>
          <Button className="max-sm:min-h-11" variant="primary" onClick={save} disabled={!prepared || pending || Boolean(saved)}>{saveMutation.isPending ? '저장 중…' : '재활성화 저장'}</Button>
        </div>
      </div> : null}
    </section>
  );
}
