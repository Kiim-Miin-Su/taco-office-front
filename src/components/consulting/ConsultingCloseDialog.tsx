/** @file-guide
 * 목적: ConsultingCloseDialog.tsx — ConsultingCloseDialog (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 컨설팅 종료 — 원본 §26 「종료 · 마무리하고 안내」 (C95 · 테스트 시나리오 I-95).
 *
 * 종료할 수 있는가는 서버가 정한다(N-18 채택 「필수 항목 + 약정 회차 후 명시 종료」 — `capabilities.canClose` · `closeBlockedReason`).
 * 이 창은 문구 틀(§43 「문구 관리」의 `gtpl`)과 한 줄을 고르고 **미리 보기**로 안내문·회차 수를 받은 뒤에만 「종료 확정」이 선다.
 * 안내문은 학생마다 학부모 안내 행으로 남는다(발송처는 N-42) — 화면이 문장을 만들지 않는다 (D-R18).
 */
'use client';
import { useEffect, useId, useState } from 'react';
import { Banner, Button, Chip, Dialog, Input, Label, Select } from '../ui';
import { apiMessage } from '@/api/client';
import { useCloseConsulting, useGuideTemplates } from '@/api/queries';
import type { ConsClose, ConsCloseResult, ConsultingDetail } from '@/api/types';

export interface ConsultingCloseDialogProps {
  open: boolean;
  detail: ConsultingDetail;
  onClose: () => void;
  onDone?: (result: ConsCloseResult) => void;
}

export function ConsultingCloseDialog({ open, detail, onClose, onDone }: ConsultingCloseDialogProps) {
  const id = useId();
  const templates = useGuideTemplates(open);
  const write = useCloseConsulting();
  const [templateId, setTemplateId] = useState('');
  const [memo, setMemo] = useState('');
  const [preview, setPreview] = useState<ConsCloseResult | null>(null);
  const [previewOf, setPreviewOf] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTemplateId(''); setMemo(''); setPreview(null); setPreviewOf(''); setErr(null);
  }, [open, detail.id]);

  const body: ConsClose = { ...(templateId ? { templateId: Number(templateId) } : {}), ...(memo.trim() ? { memo: memo.trim() } : {}) };
  const bodyKey = JSON.stringify(body);
  const pending = write.isPending;
  const canPreview = detail.capabilities.canClose && !pending;
  const canApply = canPreview && preview !== null && previewOf === bodyKey;

  const run = (kind: 'preview' | 'apply') => {
    setErr(null);
    write.mutate({ consId: detail.id, kind, body }, {
      onSuccess: (r) => {
        if (kind === 'preview') { setPreview(r); setPreviewOf(bodyKey); }
        else { onDone?.(r); onClose(); }
      },
      onError: (e) => { setPreview(null); setErr(apiMessage(e)); },
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`컨설팅 종료 — ${detail.studentNames.join(' · ') || '학생 미정'}`}
      width={560}
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>취소 (Esc)</Button>
          <Button type="button" variant="secondary" onClick={() => run('preview')} disabled={!canPreview}>{pending ? '서버에 묻는 중…' : '미리 보기'}</Button>
          <Button type="button" variant="danger" onClick={() => run('apply')} disabled={!canApply} title={!canApply ? '먼저 미리 봅니다' : undefined}>종료 확정</Button>
        </>
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]">
        <Chip tone="info" size="compact">회차 {detail.sessionsDone} / 약정 {detail.sessions ?? '—'}</Chip>
        <Chip tone={detail.requiredLeft ? 'warning' : 'success'} size="compact">필수 항목 남음 {detail.requiredLeft}</Chip>
        {detail.sessionsPlanned ? <Chip tone="warning" size="compact">잡힌 날짜 {detail.sessionsPlanned}</Chip> : null}
      </div>
      {!detail.capabilities.canClose ? (
        <Banner tone="warning" className="mb-3">{detail.capabilities.closeBlockedReason ?? '지금은 종료할 수 없습니다'}</Banner>
      ) : (
        <p className="mb-3 text-[12px] text-fg-subtle">종료하면 단계가 「종료」가 되고 종료일이 오늘로 적히며 학생마다 학부모 안내 한 줄이 남습니다. 되돌릴 수 없습니다.</p>
      )}
      <div className="grid gap-3">
        <div>
          <Label htmlFor={`${id}-tpl`} hint="§43 문구 관리의 틀 — 없으면 서버 기본 문장">안내 문구 틀</Label>
          <Select id={`${id}-tpl`} value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!detail.capabilities.canClose}>
            <option value="">기본 문장</option>
            {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-memo`}>안내문 뒤에 붙는 한 줄 (선택)</Label>
          <Input id={`${id}-memo`} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} disabled={!detail.capabilities.canClose} placeholder="그동안 수고 많으셨습니다" />
        </div>
      </div>
      {err ? <Banner tone="danger" className="mt-3">{err}</Banner> : null}
      {preview ? (
        <div className="mt-3 rounded-lg border border-line bg-inset p-3" aria-label="종료 미리보기">
          <p className="text-[12px] font-bold">학부모 안내 · {preview.parentNotices}명 · 종료일 {preview.endOn ?? '—'} · 회차 {preview.sessionsDone}{preview.sessions ? ` / ${preview.sessions}` : ''}</p>
          <blockquote className="mt-2 whitespace-pre-wrap rounded border border-line bg-card p-2 text-[12px]">{preview.noticeBody}</blockquote>
          {preview.notified ? <p className="mt-2 text-[11px] text-fg-subtle">담당에게 알림이 갑니다.</p> : null}
        </div>
      ) : null}
    </Dialog>
  );
}
