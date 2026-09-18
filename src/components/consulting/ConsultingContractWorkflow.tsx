/** @file-guide
 * 목적: 개발명세서 §30의 계약 5단계 상세와 해당 CRUD를 한 도메인 컴포넌트로 제공한다.
 * 책임/재사용: 서버 detail/capability와 공용 Query·File·Dialog를 조립한다. 단계·금액·전달 성공을 프론트에서 추론하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useEffect, useRef, useState } from 'react';
import { apiMessage } from '@/api/client';
import {
  useAddConsultingContractFile,
  useAddConsultingFeedback,
  useAddConsultingSignedFile,
  useArchiveConsulting,
  useConsultingDetail,
  useDeliverConsultingContract,
  useMeta,
  useRemoveConsultingContractFile,
  useResolveConsultingFeedback,
  useUpdateConsultingShare,
} from '@/api/queries';
import type { Consulting, ConsultingDetail, ConsultingFile, ConsultingShareUpdate, Meta } from '@/api/types';
import { FileDownloadButton } from '@/components/files/FileDownloadButton';
import { Banner, Button, Chip, Dialog, Panel, QueryState, Segmented, Textarea } from '@/components/ui';
import { fileUploadBody } from '@/lib/file-upload';
import { CONSULTING_CONTRACT_STEPS, CONSULTING_SHARES } from '@/lib/consulting';
import { won } from '@/lib/money';
import { ConsultingProgress } from './ConsultingProgress';
import { ConsultingWorkflowDialog } from './ConsultingWorkflowDialog';
import { ConsultingActivity } from './ConsultingActivity';
import { ConsultingCloseDialog } from './ConsultingCloseDialog';
import { ConsultingFileDropzone } from './ConsultingFileDropzone';
import { ConsultingSessionDialog } from './ConsultingSessionDialog';

const MAX_FILES = 10;
const STAGES = [
  { value: 'contract', label: '1 · 계약' },
  { value: 'running', label: '2 · 진행' },
  { value: 'done', label: '3 · 종료' },
] as const;
const FILE_ROLE_VIEW: Record<ConsultingFile['role'], { label: string; tone: 'info' | 'neutral' }> = {
  draft: { label: '초안', tone: 'info' },
  revision: { label: '수정본', tone: 'neutral' },
  signed: { label: '서명본', tone: 'neutral' },
};

function ShareEditor({ detail, meta }: { detail: ConsultingDetail; meta?: Meta }) {
  const update = useUpdateConsultingShare();
  const updateLock = useRef(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [share, setShare] = useState<ConsultingShareUpdate['share']>(detail.share);
  const [pickedStaffIds, setPickedStaffIds] = useState<number[]>(detail.pickedStaffIds);
  const staff = meta?.staff.filter((item) => item.canAdminPage) ?? [];
  const options = (Object.entries(CONSULTING_SHARES) as Array<[ConsultingShareUpdate['share'], { label: string }]>).map(([value, item]) => ({
    value,
    label: item.label,
  }));
  useEffect(() => {
    setShare(detail.share);
    setPickedStaffIds(detail.pickedStaffIds);
  }, [detail.id, detail.share, detail.pickedStaffIds]);
  const disabled = !detail.capabilities.canChangeShare || update.isPending || updatePending;
  const save = async (nextShare: ConsultingShareUpdate['share'], nextPicked: number[] = []) => {
    if (disabled || updateLock.current) return;
    updateLock.current = true;
    setUpdatePending(true);
    setShare(nextShare);
    if (nextShare !== 'picked') setPickedStaffIds([]);
    try {
      await update.mutateAsync({ consId: detail.id, share: nextShare, ...(nextShare === 'picked' ? { pickedStaffIds: nextPicked } : {}) });
    } catch { /* mutation error and rollback are rendered/reconciled by the shared query hook */ }
    finally {
      updateLock.current = false;
      setUpdatePending(false);
    }
  };
  return (
    <Panel
      title="공개 범위"
      sub="공개 범위만 즉시 반영하며 실패하면 원래 값으로 되돌립니다."
      right={<Chip tone={CONSULTING_SHARES[detail.share]?.tone ?? 'neutral'}>{CONSULTING_SHARES[detail.share]?.label ?? detail.share}</Chip>}
    >
      <Segmented
        className="max-w-full flex-wrap"
        options={options}
        value={share}
        disabled={disabled}
        onChange={(value) => value === 'picked' ? setShare(value) : void save(value)}
      />
      {share === 'picked' ? (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {staff.map((item) => {
              const selected = pickedStaffIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => setPickedStaffIds((current) => selected ? current.filter((id) => id !== item.id) : [...current, item.id])}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-40 ${selected ? 'border-blue bg-blue text-white' : 'border-line bg-card text-fg'}`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
          <Button className="mt-2" size="sm" variant="primary" disabled={disabled || pickedStaffIds.length === 0}
            onClick={() => void save('picked', pickedStaffIds)}>지정 공개 적용</Button>
        </div>
      ) : null}
      {update.isError ? <Banner tone="danger" className="mt-2">{apiMessage(update.error)}</Banner> : null}
    </Panel>
  );
}

function ContractFileSection({ detail }: { detail: ConsultingDetail }) {
  const add = useAddConsultingContractFile();
  const remove = useRemoveConsultingContractFile();
  const [issue, setIssue] = useState<string | null>(null);
  const totalFiles = detail.contractFiles.length + detail.signedFiles.length;
  const upload = async (files: File[]) => {
    if (totalFiles + files.length > MAX_FILES) {
      setIssue(`계약서와 서명본은 합쳐서 최대 ${MAX_FILES}개까지 올릴 수 있습니다.`);
      return;
    }
    setIssue(null);
    try {
      for (const file of files) {
        const { name, base64 } = await fileUploadBody(file, 'cons-contract');
        await add.mutateAsync({ consId: detail.id, name, base64 });
      }
    } catch { /* mutation error is rendered below; keep the event promise handled */ }
  };
  return (
    <Panel title="① 계약서 준비" sub={`계약서+서명본 합계 · ${totalFiles}/${MAX_FILES}`}>
      <div className="mb-3"><ConsultingFileDropzone label="+ 파일 고르기" hint="여기로 끌어다 놓아도 됩니다 · 여러 파일 가능" multiple
        disabled={!detail.capabilities.canAddContractFile || add.isPending || totalFiles >= MAX_FILES} onFiles={(files) => void upload(files)} /></div>
      {detail.contractFiles.length === 0 ? <p className="text-[12px] text-fg-subtle">올린 계약서가 없습니다.</p> : (
        <ul className="divide-y divide-line">
          {detail.contractFiles.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-2 py-2 text-[12px]">
            <Chip tone={FILE_ROLE_VIEW[file.role].tone}>{FILE_ROLE_VIEW[file.role].label}</Chip>
            <span className="min-w-0 grow truncate font-bold">{file.name}</span>
            <span className="text-fg-subtle">{Math.ceil(file.bytes / 1024)}KB · {file.uploadedByName}</span>
            <FileDownloadButton id={file.id} label="계약서" />
            <Button size="sm" variant="danger" disabled={!detail.capabilities.canRemoveContractFile || remove.isPending}
              onClick={() => remove.mutate({ consId: detail.id, fileId: file.id })}>빼기</Button>
          </li>)}
        </ul>
      )}
      {issue ? <Banner tone="danger" className="mt-2">{issue}</Banner> : null}
      {add.isError || remove.isError ? <Banner tone="danger" className="mt-2">{apiMessage(add.error ?? remove.error)}</Banner> : null}
    </Panel>
  );
}

function FeedbackSection({ detail }: { detail: ConsultingDetail }) {
  const add = useAddConsultingFeedback();
  const resolve = useResolveConsultingFeedback();
  const [body, setBody] = useState('');
  return (
    <Panel title={`② 피드백 ${detail.feedback.length}`} right={<Button size="sm" variant="primary" disabled={!detail.capabilities.canAddFeedback || add.isPending || body.trim().length === 0}
      onClick={() => add.mutate({ consId: detail.id, body: body.trim() }, { onSuccess: () => setBody('') })}>+ 의견</Button>}>
      <Textarea aria-label="계약 피드백" value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder="수정 의견을 적어 주세요" maxLength={2000} />
      {detail.feedback.length === 0 ? <p className="mt-3 text-[12px] text-fg-subtle">등록된 의견이 없습니다.</p> : (
        <ul className="mt-3 space-y-2">
          {detail.feedback.map((item) => <li key={item.id} className="rounded-lg border border-line bg-inset p-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-2"><b>{item.createdByName}</b><span className="text-fg-subtle">{item.createdAt}</span>{item.resolved ? <Chip tone="success">수정 완료</Chip> : null}</div>
            <p className="mt-2 whitespace-pre-wrap">{item.body}</p>
            {!item.resolved ? <Button className="mt-2" size="sm" disabled={!detail.capabilities.canResolveFeedback || resolve.isPending}
              onClick={() => resolve.mutate({ consId: detail.id, feedbackId: item.id })}>수정 완료 알리기</Button> : null}
          </li>)}
        </ul>
      )}
      {add.isError || resolve.isError ? <Banner tone="danger" className="mt-2">{apiMessage(add.error ?? resolve.error)}</Banner> : null}
    </Panel>
  );
}

function ContractActions({ detail, onOpenAccounting }: { detail: ConsultingDetail; onOpenAccounting: () => void }) {
  const deliver = useDeliverConsultingContract();
  const signed = useAddConsultingSignedFile();
  const [signedIssue, setSignedIssue] = useState<string | null>(null);
  const totalFiles = detail.contractFiles.length + detail.signedFiles.length;
  const uploadSigned = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (totalFiles >= MAX_FILES) { setSignedIssue(`계약서와 서명본은 합쳐서 최대 ${MAX_FILES}개까지 올릴 수 있습니다.`); return; }
    setSignedIssue(null);
    try {
      const { name, base64 } = await fileUploadBody(file, 'cons-contract');
      await signed.mutateAsync({ consId: detail.id, name, base64 });
    } catch { /* mutation error is rendered below; keep the event promise handled */ }
  };
  return <div className="grid gap-3 lg:grid-cols-3">
    <Panel title="③ 학부모께 전달" sub={detail.capabilities.externalParentSendSupported
      ? '서버가 허용한 외부 전달을 기록합니다.'
      : detail.capabilities.externalParentSendReason ?? '외부 발송 수신처 정책이 확정되지 않았습니다.'}>
      {detail.delivery ? <Banner tone="success">{detail.delivery.deliveredAt} · {detail.delivery.deliveredByName} 전달 기록</Banner> : null}
      {!detail.delivery || detail.capabilities.canDeliver ? (
        <Button variant="primary" disabled={!detail.capabilities.canDeliver || deliver.isPending}
          className={detail.delivery ? 'mt-2' : undefined}
          title={!detail.capabilities.externalParentSendSupported ? '외부 발송 성공이 아니라 전달 완료 사실만 기록합니다' : undefined}
          onClick={() => deliver.mutate(detail.id)}>{deliver.isPending ? '기록 중…' : detail.delivery ? '다시 전달 완료 기록' : '전달 완료 기록'}</Button>
      ) : null}
      {deliver.isError ? <Banner tone="danger" className="mt-2">{apiMessage(deliver.error)}</Banner> : null}
    </Panel>
    <Panel title="④ 학부모 서명" sub="전달 기록 뒤 받은 서명본을 등록합니다.">
      <ConsultingFileDropzone label="서명본 고르기" hint="여기로 끌어다 놓아도 됩니다" disabled={!detail.capabilities.canAddSignedFile || signed.isPending || totalFiles >= MAX_FILES}
        onFiles={(files) => void uploadSigned(files)} />
      <div className="mt-2 flex flex-wrap gap-2">{detail.signedFiles.map((file) => <FileDownloadButton key={file.id} id={file.id} label={file.name} />)}</div>
      {signedIssue ? <Banner tone="danger" className="mt-2">{signedIssue}</Banner> : null}
      {signed.isError ? <Banner tone="danger" className="mt-2">{apiMessage(signed.error)}</Banner> : null}
    </Panel>
    <Panel title="⑤ 수납" sub={`받은 돈 ${won(detail.payment.paid)} · 남은 돈 ${won(detail.payment.due)}`}>
      <Button variant="primary" disabled={!detail.capabilities.canAddPayment && !detail.capabilities.canCreateInvoice}
        title={!detail.capabilities.canAddPayment && !detail.capabilities.canCreateInvoice ? '대표의 회계 권한이 필요합니다' : undefined}
        onClick={onOpenAccounting}>수납·청구서 열기</Button>
      {detail.payment.invoiceId ? <p className="mt-2 text-[11px] text-fg-subtle">청구서 #{detail.payment.invoiceId} 연결됨</p> : null}
    </Panel>
  </div>;
}

function WorkflowContent({ detail, summary, onClose, onOpenAccounting }: { detail: ConsultingDetail; summary?: Consulting; onClose: () => void; onOpenAccounting: () => void }) {
  const meta = useMeta(detail.capabilities.canChangeShare);
  const archive = useArchiveConsulting();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const step = Math.max(0, Math.min(CONSULTING_CONTRACT_STEPS.length, detail.contractStep ?? 0));
  return <>
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {/* 「회차」는 서버의 「한 회차」(오늘 이하)다 — 앞으로 잡아 둔 날짜는 세지 않는다 (C95 · N-18) */}
      {[['계약 금액', won(detail.amount)], ['받은 돈', won(detail.payment.paid)], ['회차', `${detail.sessionsDone} / ${detail.sessions ?? '—'}회${detail.sessionsPlanned ? ` · 잡힌 ${detail.sessionsPlanned}` : ''}`], ['종료', detail.stage === 'done' && detail.closedByName ? `${detail.endOn ?? '—'} · ${detail.closedByName}` : detail.endOn ?? '—']].map(([label, value]) => (
        <div key={label} className="rounded-lg bg-inset p-3"><p className="text-[10px] font-bold text-fg-subtle">{label}</p><p className="mt-1 text-[15px] font-bold">{value}</p></div>
      ))}
    </div>
    <ol className="mb-4 grid grid-cols-3 overflow-hidden rounded-lg bg-inset p-1 text-[12px] font-bold">
      {STAGES.map((item) => {
        const active = detail.stage === item.value;
        const complete = detail.stage === 'done' || detail.stage === 'running' && item.value === 'contract';
        return <li key={item.value} aria-current={active ? 'step' : undefined}
          className={`rounded-md px-3 py-2 ${active ? 'bg-fg text-white' : complete ? 'text-fg' : 'text-fg-subtle'}`}>{item.label}</li>;
      })}
    </ol>
    <div className="mb-4 rounded-lg bg-inset p-3">
      <ConsultingProgress segmented value={step} max={CONSULTING_CONTRACT_STEPS.length} label={`계약 ${step}/${CONSULTING_CONTRACT_STEPS.length}`} />
      <ol className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px] font-bold text-fg-subtle">
        {CONSULTING_CONTRACT_STEPS.map((label, index) => <li key={label} className={index < step ? 'text-fg' : ''}>{index + 1}. {label}</li>)}
      </ol>
    </div>
    {!detail.typeCapability.defaultItemsSupported ? <Banner tone="warning" className="mb-4">{detail.typeCapability.reason ?? '이 유형의 기본 진행 항목은 아직 확정되지 않았습니다.'}</Banner> : null}
    {!detail.typeCapability.scheduleCreationSupported ? <Banner tone="warning" className="mb-4">{detail.typeCapability.scheduleCreationReason ?? '스케줄 자동 생성 정책이 아직 확정되지 않았습니다.'}</Banner> : null}
    {notice ? <Banner tone="success" className="mb-4">{notice}</Banner> : null}
    <div className="space-y-3">
      <ShareEditor detail={detail} meta={meta.data} />
      <ContractFileSection detail={detail} />
      <FeedbackSection detail={detail} />
      <ContractActions detail={detail} onOpenAccounting={onOpenAccounting} />
      {summary ? <ConsultingActivity item={summary} detail={detail} onAddSession={() => setSessionOpen(true)} /> : null}
    </div>
    <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
      <Button variant="danger" disabled={!detail.capabilities.canArchive || archive.isPending} onClick={() => setConfirmArchive(true)}>보관 삭제</Button>
      <div className="flex gap-2">
        {/* 종료 — 원본 §26 「종료 · 마무리하고 안내」. 서는지도 서버가 정한다(N-18 채택 · I-95) — 막힌 이유는 title 에 */}
        {detail.stage !== 'done' ? (
          <Button variant="secondary" disabled={!detail.capabilities.canClose} title={detail.capabilities.closeBlockedReason ?? undefined} onClick={() => setCloseOpen(true)}>컨설팅 종료</Button>
        ) : null}
        <Button onClick={onClose}>닫기</Button>
      </div>
    </div>
    <ConsultingSessionDialog open={sessionOpen} detail={detail} onClose={() => setSessionOpen(false)}
      onDone={(r) => setNotice(`회차 ${r.rows.length}건 잡음 — 새 회차 ${r.created} · 연결 ${r.linked} · 회차 ${r.sessionsDone} / 약정 ${r.sessions ?? '—'}`)} />
    <ConsultingCloseDialog open={closeOpen} detail={detail} onClose={() => setCloseOpen(false)}
      onDone={(r) => setNotice(`종료 — 학부모 안내 ${r.parentNotices}명 · 종료일 ${r.endOn ?? '—'}`)} />
    <Dialog open={confirmArchive} onClose={() => setConfirmArchive(false)} title="이 컨설팅을 보관할까요?" footer={<>
      <Button onClick={() => setConfirmArchive(false)}>취소</Button>
      <Button variant="danger" disabled={archive.isPending} onClick={() => archive.mutate(detail.id, { onSuccess: onClose })}>보관 삭제</Button>
    </>}>
      <p className="text-[12px] text-fg-2">목록에서는 사라지지만 서버의 감사 기록과 연결 데이터는 보존됩니다.</p>
      {archive.isError ? <Banner tone="danger" className="mt-2">{apiMessage(archive.error)}</Banner> : null}
    </Dialog>
  </>;
}

export function ConsultingContractWorkflow({ consId, summary, onClose, onOpenAccounting }: { consId: number; summary?: Consulting; onClose: () => void; onOpenAccounting: () => void }) {
  const query = useConsultingDetail(consId);
  const detail = query.data;
  const requester = detail?.requester === 'mother' ? '어머니' : detail?.requester === 'father' ? '아버지' : '요청자 미정';
  return (
    <ConsultingWorkflowDialog
      open
      onClose={onClose}
      title={detail ? <span className="inline-flex flex-wrap items-center gap-2"><span>{detail.studentNames.join(' · ') || '학생 미정'} 컨설팅</span><Chip tone="purple">{detail.consTypeLabel}</Chip><Chip tone="info">{detail.stage === 'contract' ? '계약' : detail.stage === 'running' ? '진행' : '종료'}</Chip></span> : '컨설팅 계약'}
      sub={detail ? `${requester} · 담당 ${detail.ownerName ?? '미정'} · ${detail.startOn ?? '시작 미정'} ~ ${detail.endOn ?? '종료 미정'}` : '계약서 → 피드백 → 전달 → 서명 → 수납'}
    >
      <QueryState query={query}>{(item) => <WorkflowContent detail={item} summary={summary} onClose={onClose} onOpenAccounting={onOpenAccounting} />}</QueryState>
    </ConsultingWorkflowDialog>
  );
}
