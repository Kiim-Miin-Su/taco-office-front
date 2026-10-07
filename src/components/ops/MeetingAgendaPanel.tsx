/** @file-guide
 * 목적: BO-Q13 사전 안건 입력·잠금·충돌 재조회·속기록 초안 가져오기 화면을 생성 계약으로 표현한다.
 * 책임/재사용: API 경로를 직접 만들지 않고 상위가 제공한 생성 query/mutation 함수만 호출한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';
import { useEffect, useState } from 'react';
import { ApiError, apiMessage } from '@/api/client';
import type { MeetingAgenda, MeetingAgendaImport, MeetingAgendaImportResult, MeetingAgendaWrite } from '@/api/types';
import { Banner, Button, Label, Textarea } from '@/components/ui';

type SaveAgenda = (body: MeetingAgendaWrite) => Promise<MeetingAgenda>;
type ImportAgenda = (body: MeetingAgendaImport) => Promise<MeetingAgendaImportResult>;
type ReloadAgenda = () => Promise<MeetingAgenda | null>;

export interface MeetingAgendaPanelProps {
  agenda?: MeetingAgenda | null;
  /** 안건이 아직 없을 때 새로 쓸 수 있는 actor인가. 최종 판정은 저장 API가 다시 한다. */
  canPrepare: boolean;
  saveAgenda?: SaveAgenda;
  importAgenda?: ImportAgenda;
  reloadAgenda?: ReloadAgenda;
  onUseMinutesDraft: (draft: string) => void;
}

const isVersionConflict = (error: unknown) => error instanceof ApiError
  ? error.status === 409 && error.code === 'MEETING_AGENDA_VERSION_CONFLICT'
  : (error as { response?: { status?: number; data?: { code?: string } } })?.response?.status === 409
    && (error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'MEETING_AGENDA_VERSION_CONFLICT';

const savedAt = (value: string) => value.slice(0, 16).replace('T', ' ');

/**
 * BO-Q13 권고안 채택 지점(2026-10-07 사용자 확정).
 * 같은 meetingId의 minutes와 섞지 않는 별도 versioned agenda를 사용하고, 시작 시 잠그며,
 * 현재 version을 명시한 「안건 가져오기」만 속기록의 미저장 초안을 만든다.
 * 정책 변경 시 docs/decisions/PLANNING-REQUIRED.md#bo-q13과 DTO/service/migration 주석을 함께 수정한다.
 */
export function MeetingAgendaPanel({
  agenda, canPrepare, saveAgenda, importAgenda, reloadAgenda, onUseMinutesDraft,
}: MeetingAgendaPanelProps) {
  const [current, setCurrent] = useState<MeetingAgenda | null>(agenda ?? null);
  const [draft, setDraft] = useState(agenda?.content ?? '');
  const [busy, setBusy] = useState<'save' | 'import' | 'reload' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [imported, setImported] = useState(false);

  useEffect(() => {
    setCurrent(agenda ?? null);
    setDraft(agenda?.content ?? '');
    setError(null);
    setSaved(false);
    setImported(false);
  }, [agenda]);

  const actorCanEdit = current?.canEdit ?? canPrepare;
  const writerReady = Boolean(saveAgenda);
  const readOnly = !actorCanEdit || !writerReady;
  const unchanged = draft === (current?.content ?? '');
  const invalid = draft.trim() === '' || draft.length > 8000;
  const conflict = isVersionConflict(error);

  const save = async () => {
    if (!saveAgenda || readOnly || invalid || unchanged) return;
    setBusy('save'); setError(null); setSaved(false);
    try {
      const next = await saveAgenda({ content: draft, expectedVersion: current?.version ?? null });
      setCurrent(next); setDraft(next.content); setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  const reload = async () => {
    if (!reloadAgenda) return;
    setBusy('reload');
    try {
      const next = await reloadAgenda();
      setCurrent(next); setDraft(next?.content ?? ''); setError(null); setSaved(false); setImported(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  const importToMinutes = async () => {
    if (!current || !current.canImportToMinutes || !importAgenda) return;
    setBusy('import'); setError(null); setImported(false);
    try {
      const result = await importAgenda({ expectedVersion: current.version });
      // BO-Q13은 자동 저장을 금지한다. 서버가 saved=false로 준 초안만 사용자가 확인할 속기록 입력 칸으로 옮긴다.
      if (result.saved !== false) throw new Error('안건 가져오기 결과가 미저장 초안이 아닙니다');
      onUseMinutesDraft(result.minutesDraft);
      setImported(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="meeting-agenda-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id="meeting-agenda-title" className="text-[13px] font-bold text-fg">사전 안건</h3>
          <p className="text-[12px] text-fg-subtle">회의 전에 정할 내용을 적고, 회의가 시작되면 읽기만 합니다.</p>
        </div>
        <span className="text-[12px] text-fg-subtle">{draft.length}/8,000자</span>
      </div>

      {!writerReady && actorCanEdit ? (
        <Banner tone="neutral">사전 안건 저장 기능을 연결하는 중입니다. 지금은 저장된 내용만 확인할 수 있습니다.</Banner>
      ) : null}
      {current?.locked ? (
        <Banner tone="warning">{current.editBlockedReason ?? '회의가 시작되어 사전 안건을 고칠 수 없습니다.'}</Banner>
      ) : null}
      {!actorCanEdit && !current?.locked && current?.editBlockedReason ? (
        <Banner tone="neutral">{current.editBlockedReason}</Banner>
      ) : null}
      {conflict ? (
        <Banner tone="warning">
          <div className="flex flex-wrap items-center gap-2">
            <span>다른 사람이 먼저 안건을 고쳤습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요.</span>
            {reloadAgenda ? <Button size="sm" variant="secondary" disabled={busy !== null} onClick={reload}>최신 안건 다시 불러오기</Button> : null}
          </div>
        </Banner>
      ) : error ? <Banner tone="danger">{apiMessage(error)}</Banner> : null}
      {saved ? <Banner tone="success"><p role="status">사전 안건을 저장했습니다.</p></Banner> : null}
      {imported ? <Banner tone="success"><p role="status">사전 안건을 속기록 초안으로 가져왔습니다. 확인한 뒤 저장해 주세요.</p></Banner> : null}

      <div>
        <Label htmlFor="meeting-agenda-content">안건 내용 <span className="text-red">*</span></Label>
        <Textarea id="meeting-agenda-content" aria-label="사전 안건 내용" rows={9} maxLength={8000}
          value={draft} readOnly={readOnly} onChange={(event) => { setDraft(event.target.value); setSaved(false); }} />
      </div>

      {current ? (
        <p className="text-[12px] text-fg-subtle">
          처음 작성 {savedAt(current.createdAt)} · {current.createdByName} · 마지막 수정 {savedAt(current.updatedAt)} · {current.updatedByName}
        </p>
      ) : <p className="text-[12px] text-fg-subtle">아직 저장한 사전 안건이 없습니다.</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={!current?.canImportToMinutes || !importAgenda || busy !== null}
          title={!importAgenda ? '속기록 초안 가져오기 기능을 연결하는 중입니다' : undefined}
          onClick={importToMinutes}>{busy === 'import' ? '가져오는 중…' : '안건 가져오기'}</Button>
        {actorCanEdit ? (
          <Button disabled={!writerReady || busy !== null || invalid || unchanged} onClick={save}>
            {busy === 'save' ? '저장하는 중…' : '사전 안건 저장'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
