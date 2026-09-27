/** @file-guide
 * 목적: GpaRequestButton.tsx — GpaRequestButton (component · 강사 캘린더의 「GPA 회차 요청」)
 * 책임/재사용: 기존 useCreateSettingRequest(POST /teacher/requests) · useTeacherGpaRequestOptions 와 ui Dialog 를 재사용한다. 고를 수 있는 회차 · 명단 · 서비스는 서버가 준 것만 그린다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 강사 GPA 회차 → 「GPA 회차 요청」(학생 · 서비스 · 시각) (N-99 채택 · W11) — REQ(gpa_request) 한 줄을 올린다.
 *
 * - 고를 수 있는 회차는 서버가 **요청 쓰기와 같은 판정**으로 고른 것(내 GPA 수업 · 휴강 아님 · 열린 사이클 안)이고,
 *   학생은 그 회차의 그날 명단, 서비스는 규정표다. 화면은 거르지 않는다 — 시각도 회차에서 서버가 다시 읽는다.
 * - 승인은 관리자가 §14 에서 하고, 승인하면 그 내용으로 GPA 기록이 한 줄 생긴다. 결과는 알림으로 온다.
 */
'use client';
import { useId, useState } from 'react';
import { apiMessage } from '@/api/client';
import { useCreateSettingRequest, useTeacherGpaRequestOptions } from '@/api/queries';
import type { TeacherGpaOccurrence } from '@/api/types';
import { Banner, Button, Dialog, Label, Select, Textarea } from '@/components/ui';
import { hm, md } from './format';
import { useLessonName } from './lesson-name';

const occKey = (o: Pick<TeacherGpaOccurrence, 'serId' | 'onDate'>) => `${o.serId}|${o.onDate}`;

export function GpaRequestButton({ className }: { className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const options = useTeacherGpaRequestOptions(open);
  const ask = useCreateSettingRequest();
  const lessonName = useLessonName();
  const [occ, setOcc] = useState('');
  const [studentId, setStudentId] = useState('');
  const [svcKey, setSvcKey] = useState('');
  const [reason, setReason] = useState('');

  const close = () => { setOpen(false); setOcc(''); setStudentId(''); setSvcKey(''); setReason(''); ask.reset(); };
  const occurrences = options.data?.occurrences ?? [];
  const picked = occurrences.find((o) => occKey(o) === occ);
  const ready = Boolean(picked && studentId && svcKey) && !ask.isPending;
  const submit = () => {
    if (!ready || !picked) return;
    ask.mutate({
      reqType: 'gpa_request', serId: picked.serId, onDate: picked.onDate, studentId: Number(studentId), svcKey,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    }, { onSuccess: close });
  };

  return (
    <>
      <Button size="sm" className={className} onClick={() => setOpen(true)}>GPA 회차 요청</Button>
      <Dialog
        open={open} onClose={close} title="GPA 회차 요청" closeX
        sub="관리자 승인 뒤 GPA 기록에 들어갑니다 · 결과는 알림으로 옵니다"
        footer={(
          <>
            <Button onClick={close} disabled={ask.isPending}>취소</Button>
            <Button variant="primary" disabled={!ready} onClick={submit}>{ask.isPending ? '올리는 중…' : '요청 올리기'}</Button>
          </>
        )}
      >
        {options.isLoading ? <p className="py-4 text-center text-[12.5px] text-fg-subtle">읽는 중…</p> : null}
        {options.isError ? <Banner tone="danger">{apiMessage(options.error)}</Banner> : null}
        {options.data && occurrences.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-fg-subtle">
            요청할 수 있는 GPA 회차가 없습니다 — 열린 GPA 사이클 안의 내 GPA 수업 회차만 고를 수 있습니다.
          </p>
        ) : null}
        {options.data && occurrences.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor={`${id}-occ`}>회차</Label>
              <Select id={`${id}-occ`} value={occ} disabled={ask.isPending}
                onChange={(e) => { setOcc(e.target.value); setStudentId(''); }}>
                <option value="">선택</option>
                {occurrences.map((o) => (
                  <option key={occKey(o)} value={occKey(o)}>
                    {md(o.onDate)} {hm(o.startMin)}–{hm(o.endMin)} · {lessonName(o)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-stu`}>학생</Label>
              <Select id={`${id}-stu`} value={studentId} disabled={!picked || ask.isPending} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{picked ? '선택' : '회차를 먼저 고르세요'}</option>
                {(picked?.students ?? []).map((st) => <option key={st.id} value={String(st.id)}>{st.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-svc`}>서비스</Label>
              <Select id={`${id}-svc`} value={svcKey} disabled={ask.isPending} onChange={(e) => setSvcKey(e.target.value)}>
                <option value="">선택</option>
                {options.data.services.map((svc) => <option key={svc.key} value={svc.key}>{svc.name} · {svc.point}p</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-reason`} hint="선택">사유</Label>
              <Textarea id={`${id}-reason`} value={reason} maxLength={500} rows={2} disabled={ask.isPending}
                onChange={(e) => setReason(e.target.value)} />
            </div>
            {ask.isError ? <Banner tone="danger">{apiMessage(ask.error)}</Banner> : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
