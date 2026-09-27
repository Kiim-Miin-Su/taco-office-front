/** @file-guide
 * 목적: 개발명세서 §30의 계약 5단계 상세와 해당 CRUD를 한 도메인 컴포넌트로 제공한다.
 * 책임/재사용: 서버 detail/capability와 공용 Query·File·Dialog를 조립한다. 단계·금액·전달 성공을 프론트에서 추론하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { GuardianSendDialog } from '@/components/guardians/GuardianSendDialog';
import { Banner, Button, Chip, Dialog, Panel, QueryState, Segmented, Select, Textarea } from '@/components/ui';
import { WideDialog } from '@/components/ui/WideDialog';
import { fileUploadBody } from '@/lib/file-upload';
import { CONSULTING_CONTRACT_STEPS, CONSULTING_SHARES, CONSULTING_STAGE_BY_KEY } from '@/lib/consulting';
import { won } from '@/lib/money';
import { ConsultingContractStepper } from './ConsultingContractStepper';
import { ConsultingActivity } from './ConsultingActivity';
import { ConsultingCloseDialog } from './ConsultingCloseDialog';
import { ConsultingFileDropzone } from './ConsultingFileDropzone';
import { ConsultingSessionDialog } from './ConsultingSessionDialog';

const MAX_FILES = 10;
/**
 * 상세 3탭 — 원본 슬라이드 26 「카드 클릭 → 상세 3탭(계약/진행/종료)」 (30-01).
 * 탭은 **보기**만 바꾼다. 건의 단계를 옮기는 것은 서버 전이(수납 → 진행 · 종료 확정)뿐이다.
 */
type DetailTab = ConsultingDetail['stage'];
const STAGES: Array<{ value: DetailTab; label: string }> = [
  { value: 'contract', label: '1 · 계약' },
  { value: 'running', label: '2 · 진행' },
  { value: 'done', label: '3 · 종료' },
];
const FILE_ROLE_VIEW: Record<ConsultingFile['role'], { label: string; tone: 'info' | 'neutral' }> = {
  draft: { label: '초안', tone: 'info' },
  revision: { label: '수정본', tone: 'neutral' },
  signed: { label: '서명본', tone: 'neutral' },
  // 항목 파일(N-63)은 §31 항목 줄에 선다 — 계약 절에는 오지 않지만 낱말 표는 역할 넷을 다 갖는다
  item: { label: '항목 파일', tone: 'neutral' },
};

/**
 * 공개 범위 — 원본 §30·§31 은 **한 줄 배너**다: 칩 「수납만 공개」 + 뜻 「금액만 보이고 내용은 숨깁니다」 + 「공개 범위 바꾸기」(누르면 고르는 칸이 열린다 · 30-06).
 * 늘 펼쳐진 판과 개발 설명 한 줄(「즉시 반영하며 실패하면 되돌립니다」)을 걷었다. 뜻은 서버 낱말(`shareMeaning` · 슬라이드 32)이다.
 * 고른 직후(낙관 갱신) 서버 뜻이 아직 옛 범위의 것이면 뜻을 비워 둔다 — 칩과 뜻이 다른 범위를 말하지 않게.
 */
function ShareEditor({ detail, meta }: { detail: ConsultingDetail; meta?: Meta }) {
  const update = useUpdateConsultingShare();
  const updateLock = useRef(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<ConsultingShareUpdate['share']>(detail.share);
  const [pickedStaffIds, setPickedStaffIds] = useState<number[]>(detail.pickedStaffIds);
  const staff = meta?.staff.filter((item) => item.canAdminPage) ?? [];
  /**
   * 「비공개」는 대표만 **지정**한다(§76 · S4 · 서버 403 `CONS_PRIVATE_FORBIDDEN`).
   * 이미 비공개인 건은 그 칸을 그대로 두어야 지금 값이 선택된 채로 보인다 — 빼면 아무것도 안 눌린 것처럼 된다.
   * 거기서 다른 범위로 옮기는 것은 막지 않는다(막는 것은 **지정** 하나다 · D-R44).
   */
  const canPrivate = detail.capabilities.canSetPrivate || detail.share === 'private';
  const options = (Object.entries(CONSULTING_SHARES) as Array<[ConsultingShareUpdate['share'], { label: string }]>)
    .filter(([value]) => value !== 'private' || canPrivate)
    .map(([value, item]) => ({ value, label: item.label }));
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
  const shareView = CONSULTING_SHARES[detail.share];
  const meaning = detail.shareLabel === shareView?.label ? detail.shareMeaning : null;
  return (
    <div className="rounded-lg border border-amber/25 bg-amber/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={shareView?.tone ?? 'neutral'} styleKind="solid">{shareView?.label ?? detail.share}</Chip>
        {meaning ? <span className="text-[12.5px] text-fg-2">{meaning}</span> : null}
        {detail.capabilities.canChangeShare ? (
          <Button size="sm" className="ml-auto" aria-expanded={open} onClick={() => setOpen((v) => !v)}>공개 범위 바꾸기</Button>
        ) : null}
      </div>
      {open && detail.capabilities.canChangeShare ? (
        <div className="mt-2">
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
        </div>
      ) : null}
      {update.isError ? <Banner tone="danger" className="mt-2">{apiMessage(update.error)}</Banner> : null}
    </div>
  );
}

/**
 * 계약 절 머리 (30-08) — 원본 §30 의 ①~⑤ 는 테두리 판이 아니라 **한 열로 쌓인 절 머리**(「① 계약서 준비 [올림]」 + 가는 선)다.
 * 오른쪽에는 그 절의 단추(「+ 의견」)가, 이름 옆에는 사실로 말할 수 있는 상태 칩만 선다.
 */
function StepSection({ title, chip, right, sub, children }: { title: string; chip?: string | null; right?: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <h3 className="text-[12.5px] font-bold text-fg-2">{title}</h3>
          {chip ? <Chip tone="success" size="compact">{chip}</Chip> : null}
          {sub ? <span className="text-[11px] text-fg-subtle">{sub}</span> : null}
        </span>
        {right}
      </header>
      {children}
    </section>
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
    // 「올림」은 올린 계약서가 있다는 사실이다. 개수 한도는 다 찼을 때만 말한다(원본 머리에는 없다)
    <StepSection title="① 계약서 준비" chip={detail.contractFiles.length ? '올림' : null}
      sub={totalFiles >= MAX_FILES ? `계약서+서명본 합계 · ${totalFiles}/${MAX_FILES}` : null}>
      <div className="mb-3"><ConsultingFileDropzone label="+ 파일 고르기" hint="여기로 끌어다 놓아도 됩니다 · 여러 파일 가능" multiple
        disabled={!detail.capabilities.canAddContractFile || add.isPending || totalFiles >= MAX_FILES} onFiles={(files) => void upload(files)} /></div>
      {detail.contractFiles.length === 0 ? <p className="text-[12px] text-fg-subtle">올린 계약서가 없습니다.</p> : (
        <ul className="divide-y divide-line">
          {detail.contractFiles.map((file) => <li key={file.id} className="flex flex-wrap items-center gap-2 py-2 text-[12px]">
            <Chip tone={FILE_ROLE_VIEW[file.role].tone}>{FILE_ROLE_VIEW[file.role].label}</Chip>
            <span className="min-w-0 grow truncate font-bold">{file.name}</span>
            {/* 크기 · 올린 날 · 올린 사람 — 원본 §30 파일 줄 「94KB · 2026-08-20 · Grace」 (30-09) */}
            <span className="text-fg-subtle">{Math.ceil(file.bytes / 1024)}KB · {file.uploadedAt.slice(0, 10)} · {file.uploadedByName}</span>
            <FileDownloadButton id={file.id} label="계약서" />
            <Button size="sm" variant="danger" disabled={!detail.capabilities.canRemoveContractFile || remove.isPending}
              onClick={() => remove.mutate({ consId: detail.id, fileId: file.id })}>빼기</Button>
          </li>)}
        </ul>
      )}
      {issue ? <Banner tone="danger" className="mt-2">{issue}</Banner> : null}
      {add.isError || remove.isError ? <Banner tone="danger" className="mt-2">{apiMessage(add.error ?? remove.error)}</Banner> : null}
    </StepSection>
  );
}

/** 의견 시각 「08-20 21:40」 — 서버의 KST ISO 에서 달-일 시:분만 (원본 §30 카드). 모양이 다르면 받은 그대로 */
const feedbackAtLabel = (at: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at) ? at.slice(5, 16).replace('T', ' ') : at);

function FeedbackSection({ detail }: { detail: ConsultingDetail }) {
  const add = useAddConsultingFeedback();
  const resolve = useResolveConsultingFeedback();
  const [body, setBody] = useState('');
  /* 원본 §30 (30-10) — 적는 칸은 평소 숨어 있고 「+ 의견」을 누르면 열린다. 의견 카드는 호박 바탕 · 쓴 사람은 강조색 · 시각 */
  const [writing, setWriting] = useState(false);
  const submit = () => add.mutate({ consId: detail.id, body: body.trim() }, { onSuccess: () => { setBody(''); setWriting(false); } });
  return (
    <StepSection title={`② 피드백 ${detail.feedback.length}`} right={writing ? null : (
      <Button size="sm" variant="primary" disabled={!detail.capabilities.canAddFeedback} onClick={() => setWriting(true)}>+ 의견</Button>
    )}>
      {writing ? (
        <div className="mb-3">
          <Textarea aria-label="계약 피드백" value={body} onChange={(event) => setBody(event.currentTarget.value)} placeholder="수정 의견을 적어 주세요" maxLength={2000} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" disabled={add.isPending || body.trim().length === 0} onClick={submit}>{add.isPending ? '올리는 중…' : '올리기'}</Button>
            <Button size="sm" variant="ghost" disabled={add.isPending} onClick={() => { setWriting(false); setBody(''); }}>취소</Button>
          </div>
        </div>
      ) : null}
      {detail.feedback.length === 0 ? <p className="text-[12px] text-fg-subtle">등록된 의견이 없습니다.</p> : (
        <ul className="space-y-2">
          {detail.feedback.map((item) => <li key={item.id} className="rounded-lg border border-amber/30 bg-amber/5 p-3 text-[12px]">
            <div className="flex flex-wrap items-center gap-2"><b className="text-amber">{item.createdByName}</b><span className="text-fg-subtle">{feedbackAtLabel(item.createdAt)}</span>{item.resolved ? <Chip tone="success">수정 완료</Chip> : null}</div>
            <p className="mt-2 whitespace-pre-wrap font-bold text-fg">{item.body}</p>
            {!item.resolved ? <Button className="mt-2" size="sm" variant="primary" disabled={!detail.capabilities.canResolveFeedback || resolve.isPending}
              onClick={() => resolve.mutate({ consId: detail.id, feedbackId: item.id })}>고친 것 알리기</Button> : null}
          </li>)}
        </ul>
      )}
      {add.isError || resolve.isError ? <Banner tone="danger" className="mt-2">{apiMessage(add.error ?? resolve.error)}</Banner> : null}
    </StepSection>
  );
}

/**
 * ③ 학부모께 전달 — 원본 §30 「계약서 전달하기」 주버튼 (30-12 · N-77 채택).
 * 보호자 선택 발송 창(DQ3)을 열고 계약서를 **메일에** 붙인다 — 문자에는 붙지 않는다 · 서명 링크는 만들지 않는다(서명본은 스캔 등록).
 * 본문은 담당이 적는다(화면 · 서버가 짓지 않는다). 메일이 **실제로 나가야** 서버가 「전달」 단계로 넘긴다 — 화면은 결과를 짓지 않는다.
 * 학생이 여럿이면 받는 학생(그 보호자)을 고른다. 「전달 완료 기록」은 시스템 밖에서 건넨 전달을 적는 둘째 단추로 남는다.
 */
function ContractSend({ detail }: { detail: ConsultingDetail }) {
  const students = detail.studentIds.map((sid, i) => ({ id: sid, name: detail.studentNames[i] ?? '' }));
  const [pick, setPick] = useState<number | null>(students[0]?.id ?? null);
  const [sendOpen, setSendOpen] = useState(false);
  const student = students.find((s) => s.id === pick) ?? students[0] ?? null;
  // 기본으로 붙는 것은 가장 최근에 올린 계약서다(피드백을 반영한 판) — 창에서 바꿀 수 있다
  const attachments = detail.contractFiles.map((f, i, all) => ({ id: f.id, name: f.name, bytes: f.bytes, checked: i === all.length - 1 }));
  return <>
    <div className="flex flex-wrap items-center gap-2">
      {students.length > 1 ? (
        <Select aria-label="받는 학생" className="w-auto" value={pick ?? ''} onChange={(e) => setPick(Number(e.target.value))}>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      ) : null}
      <Button variant="primary" disabled={!detail.capabilities.canSendContract || student === null} onClick={() => setSendOpen(true)}>계약서 전달하기</Button>
    </div>
    {sendOpen && student ? (
      <GuardianSendDialog open student={student} title={`계약서 전달하기 — ${student.name}`} defaultBody=""
        attachments={attachments} onClose={() => setSendOpen(false)} />
    ) : null}
  </>;
}

function ContractActions({ detail, onOpenAccounting }: { detail: ConsultingDetail; onOpenAccounting: () => void }) {
  const deliver = useDeliverConsultingContract();
  const signed = useAddConsultingSignedFile();
  const [signedIssue, setSignedIssue] = useState<string | null>(null);
  const totalFiles = detail.contractFiles.length + detail.signedFiles.length;
  const sending = detail.capabilities.externalParentSendSupported;
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
  // ③ · ④ · ⑤ 도 한 열로 쌓는다 (30-08)
  return <div className="flex flex-col gap-4">
    {/* 원본 §30 ③ 은 한 줄 설명 없이 「계약서 전달하기」 주버튼 하나다 (30-12) — 전달 방식이 없을 때만 까닭을 적는다 */}
    <StepSection title="③ 학부모께 전달" sub={sending ? null : detail.capabilities.externalParentSendReason ?? '외부 발송 수신처 정책이 확정되지 않았습니다.'}>
      {detail.delivery ? <Banner tone="success" className="mb-2">{detail.delivery.deliveredAt} · {detail.delivery.deliveredByName} 전달 기록</Banner> : null}
      <div className="flex flex-wrap items-center gap-2">
        {sending ? <ContractSend detail={detail} /> : null}
        {!detail.delivery || detail.capabilities.canDeliver ? (
          <Button variant={sending ? 'secondary' : 'primary'} disabled={!detail.capabilities.canDeliver || deliver.isPending}
            title="보내지 않고 전달했다는 사실만 기록합니다(직접 건넨 경우)"
            onClick={() => deliver.mutate(detail.id)}>{deliver.isPending ? '기록 중…' : detail.delivery ? '다시 전달 완료 기록' : '전달 완료 기록'}</Button>
        ) : null}
      </div>
      {deliver.isError ? <Banner tone="danger" className="mt-2">{apiMessage(deliver.error)}</Banner> : null}
    </StepSection>
    <StepSection title="④ 학부모 서명">
      {/* 전달 전에는 원본 §30 그대로 「전달 먼저 해주세요」 — 흐린 파일 칸 대신 무엇을 먼저 할지 말한다 (30-13) */}
      {!detail.delivery ? (
        <Button disabled title="③ 학부모께 전달을 먼저 기록해야 서명본을 받을 수 있습니다">전달 먼저 해주세요</Button>
      ) : (
        <ConsultingFileDropzone label="서명본 고르기" hint="여기로 끌어다 놓아도 됩니다" disabled={!detail.capabilities.canAddSignedFile || signed.isPending || totalFiles >= MAX_FILES}
          onFiles={(files) => void uploadSigned(files)} />
      )}
      <div className="mt-2 flex flex-wrap gap-2">{detail.signedFiles.map((file) => <FileDownloadButton key={file.id} id={file.id} label={file.name} />)}</div>
      {signedIssue ? <Banner tone="danger" className="mt-2">{signedIssue}</Banner> : null}
      {signed.isError ? <Banner tone="danger" className="mt-2">{apiMessage(signed.error)}</Banner> : null}
    </StepSection>
    <StepSection title="⑤ 수납" sub={`받은 돈 ${won(detail.payment.paid)} · 남은 돈 ${won(detail.payment.due)}`}>
      <Button variant="primary" disabled={!detail.capabilities.canAddPayment && !detail.capabilities.canCreateInvoice}
        title={!detail.capabilities.canAddPayment && !detail.capabilities.canCreateInvoice ? '대표의 회계 권한이 필요합니다' : undefined}
        onClick={onOpenAccounting}>수납·청구서 열기</Button>
      {detail.payment.invoiceId ? <p className="mt-2 text-[11px] text-fg-subtle">청구서 #{detail.payment.invoiceId} 연결됨</p> : null}
    </StepSection>
  </div>;
}

function WorkflowContent({ detail, summary, onClose, onOpenAccounting }: { detail: ConsultingDetail; summary?: Consulting; onClose: () => void; onOpenAccounting: () => void }) {
  const meta = useMeta(detail.capabilities.canChangeShare);
  const archive = useArchiveConsulting();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 기본 탭은 서버가 준 지금 단계다. 다른 건을 열거나 서버가 단계를 옮기면 그 단계로 다시 맞춘다 */
  const [tab, setTab] = useState<DetailTab>(detail.stage);
  useEffect(() => { setTab(detail.stage); }, [detail.id, detail.stage]);
  const step = Math.max(0, Math.min(CONSULTING_CONTRACT_STEPS.length, detail.contractStep ?? 0));
  return <>
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {/* 「회차」는 서버의 「한 회차」(오늘 이하)다 — 앞으로 잡아 둔 날짜는 세지 않는다 (C95 · N-18) */}
      {/* 「받은 돈」은 호박색이다 — 원본 §30 요약 타일 (30-15) */}
      {[['계약 금액', won(detail.amount), ''], ['받은 돈', won(detail.payment.paid), 'text-amber'], ['회차', `${detail.sessionsDone} / ${detail.sessions ?? '—'}회${detail.sessionsPlanned ? ` · 잡힌 ${detail.sessionsPlanned}` : ''}`, ''], ['종료', detail.stage === 'done' && detail.closedByName ? `${detail.endOn ?? '—'} · ${detail.closedByName}` : detail.endOn ?? '—', '']].map(([label, value, tone]) => (
        <div key={label} className="rounded-lg bg-inset p-3"><p className="text-[10px] font-bold text-fg-subtle">{label}</p><p className={`mt-1 text-[15px] font-bold ${tone}`}>{value}</p></div>
      ))}
    </div>
    {!detail.typeCapability.defaultItemsSupported ? <Banner tone="warning" className="mb-4">{detail.typeCapability.reason ?? '이 유형의 기본 진행 항목은 아직 확정되지 않았습니다.'}</Banner> : null}
    {!detail.typeCapability.scheduleCreationSupported ? <Banner tone="warning" className="mb-4">{detail.typeCapability.scheduleCreationReason ?? '스케줄 자동 생성 정책이 아직 확정되지 않았습니다.'}</Banner> : null}
    {notice ? <Banner tone="success" className="mb-4">{notice}</Banner> : null}
    {/* 공개 범위는 세 탭 공통이다 — 원본 §30 · §31 모두 탭 위에 있다 */}
    <div className="mb-4"><ShareEditor detail={detail} meta={meta.data} /></div>
    <Segmented<DetailTab> className="mb-4" ariaLabel="상세 단계" options={STAGES} value={tab} onChange={setTab} />
    {tab === 'contract' ? (
      <div className="space-y-3">
        {/* 5단계 스테퍼 — 낱말은 서버의 contractSteps (30-07) */}
        <div className="rounded-lg bg-inset p-3">
          <ConsultingContractStepper steps={detail.contractSteps} current={step} complete={detail.stage !== 'contract'} />
        </div>
        <ContractFileSection detail={detail} />
        <FeedbackSection detail={detail} />
        <ContractActions detail={detail} onOpenAccounting={onOpenAccounting} />
      </div>
    ) : tab === 'running' ? (
      // 진행 항목 · 회차는 목록 응답(summary)의 서버 projection 이다 — 막 만든 건처럼 아직 목록에 없으면 기다린다
      summary
        ? <ConsultingActivity item={summary} detail={detail} onAddSession={() => setSessionOpen(true)} />
        : <p className="rounded-lg bg-inset p-4 text-[12px] text-fg-subtle">진행 항목과 회차 기록을 불러오는 중입니다.</p>
    ) : (
      // 종료 — 원본 §26 「종료 · 마무리하고 안내」. 서는지와 막힌 이유는 서버가 정한다 (N-18 채택 · I-95 · 30-14 종료 진입을 이 탭으로)
      <Panel title="종료">
        {detail.stage === 'done' ? (
          <>
            <p className="text-[12.5px] font-bold text-fg">종료일 {detail.endOn ?? '—'} · 처리 {detail.closedByName ?? '—'}</p>
            {/* 예외 종료로 닫은 건은 그 사유를 함께 보인다 — 감사 원장의 그 줄 (N-18-a) */}
            {detail.closeReason ? <p className="mt-1 text-[12px] text-fg-2">예외 종료 · 사유 {detail.closeReason}</p> : null}
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {detail.capabilities.canClose || !detail.capabilities.canCloseException ? (
              <Button variant="secondary" disabled={!detail.capabilities.canClose} title={detail.capabilities.closeBlockedReason ?? undefined} onClick={() => setCloseOpen(true)}>컨설팅 종료</Button>
            ) : (
              // 필수 항목 · 약정 회차가 남아 막혔고 승인 권한이 있다 — 사유를 적고 승인하는 예외 종료 (N-18-a · 서버 값)
              <Button variant="danger" onClick={() => setCloseOpen(true)}>예외 종료</Button>
            )}
            {detail.capabilities.closeBlockedReason ? <span className="text-[12px] text-fg-subtle">{detail.capabilities.closeBlockedReason}</span> : null}
          </div>
        )}
      </Panel>
    )}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
      {/* 원본 §30 바닥 「지우기」 — 동작은 보관(소프트 삭제) 그대로다 (30-14). 받은 돈 · 전환 청구서 · 회차가 있으면 서버가 막는다(PB-11) */}
      <span className="flex flex-wrap items-center gap-2">
        {/* 원문 바닥 「지우기」는 테두리 단추 · 빨간 글자다(채움 아님 · W11 재대조) — 확인 창의 「지우기」만 채움 */}
        <Button variant="secondary" className="text-red" disabled={!detail.capabilities.canArchive || archive.isPending}
          title={detail.capabilities.archiveBlockedReason ?? undefined} onClick={() => setConfirmArchive(true)}>지우기</Button>
        {detail.capabilities.archiveBlockedReason ? <span className="text-[11px] text-fg-subtle">{detail.capabilities.archiveBlockedReason}</span> : null}
      </span>
      <Button onClick={onClose}>닫기</Button>
    </div>
    <ConsultingSessionDialog open={sessionOpen} detail={detail} onClose={() => setSessionOpen(false)}
      onDone={(r) => setNotice(`회차 ${r.rows.length}건 잡음 — 새 회차 ${r.created} · 연결 ${r.linked} · 회차 ${r.sessionsDone} / 약정 ${r.sessions ?? '—'}`)} />
    <ConsultingCloseDialog open={closeOpen} detail={detail} onClose={() => setCloseOpen(false)}
      onDone={(r) => setNotice(`${r.exception ? '예외 종료' : '종료'} — 학부모 안내 ${r.parentNotices}명 · 종료일 ${r.endOn ?? '—'}`)} />
    <Dialog open={confirmArchive} onClose={() => setConfirmArchive(false)} title="이 컨설팅을 지울까요?" footer={<>
      <Button onClick={() => setConfirmArchive(false)}>취소</Button>
      <Button variant="danger" disabled={archive.isPending} onClick={() => archive.mutate(detail.id, { onSuccess: onClose })}>지우기</Button>
    </>}>
      <p className="text-[12px] text-fg-2">목록에서는 사라지지만 서버의 감사 기록과 연결 데이터는 보존됩니다.</p>
      {archive.isError ? <Banner tone="danger" className="mt-2">{apiMessage(archive.error)}</Banner> : null}
    </Dialog>
  </>;
}

/**
 * 창 틀은 공용 `WideDialog` 다 — 컨설팅 전용 틀(`ConsultingWorkflowDialog`)이 같은 일을 한 벌 더 하고 있었다(가운데 큰 창 · 본문 스크롤 ·
 * 초점 가두기). 머리의 닫기는 원문대로 「×」 하나다(29-01 · 30 · 31).
 * 제목 옆 단계 칩은 단계색이다(계약 파랑 · 진행 보라 · 30-05). 부제 끝의 「N일 지남」은 목록이 센 값(`ageDays`)을 그대로 쓴다(30-04).
 */
export function ConsultingContractWorkflow({ consId, summary, onClose, onOpenAccounting }: { consId: number; summary?: Consulting; onClose: () => void; onOpenAccounting: () => void }) {
  const query = useConsultingDetail(consId);
  const detail = query.data;
  const requester = detail?.requester === 'mother' ? '어머니' : detail?.requester === 'father' ? '아버지' : '요청자 미정';
  const stageView = detail ? CONSULTING_STAGE_BY_KEY[detail.stage] : undefined;
  return (
    <WideDialog
      open
      onClose={onClose}
      title={detail ? `${detail.studentNames.join(' · ') || '학생 미정'} 컨설팅` : '컨설팅 계약'}
      head={detail ? <><Chip tone="purple">{detail.consTypeLabel}</Chip><Chip tone={stageView?.tone ?? 'info'}>{stageView?.label ?? detail.stage}</Chip></> : null}
      sub={detail
        ? `${requester} · 담당 ${detail.ownerName ?? '미정'} · ${detail.startOn ?? '시작 미정'} ~ ${detail.endOn ?? '종료 미정'}${summary?.ageDays != null ? ` · ${summary.ageDays}일 지남` : ''}`
        : '계약서 → 피드백 → 전달 → 서명 → 수납'}
    >
      <QueryState query={query}>{(item) => <WorkflowContent detail={item} summary={summary} onClose={onClose} onOpenAccounting={onOpenAccounting} />}</QueryState>
    </WideDialog>
  );
}
