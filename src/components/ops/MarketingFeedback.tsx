/** @file-guide
 * 목적: MarketingFeedback.tsx — MarketingFeedback (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §60 대표 피드백.
 *
 * 「고쳤습니다 / 확인 필요」와 머리의 「고쳐야 할 것 N건」을 **화면이 세지 않는다.**
 * 코멘트와 답의 시각을 견주는 식으로 만들면 카드의 칩과 머리의 숫자가 갈린다 (D-R37 · D-R39).
 * 여기서 하는 일은 서버가 준 `state` · `stateLabel` · `feedbackNeedsFix` 를 **그리는 것뿐**이다.
 *
 * 원문 §60 의 「보류」 단추는 만들지 않았다 — 누른 뒤 카드가 어떤 칩을 다는지 원문이
 * 보여 주지 않는다. 없는 상태를 지어내는 대신 결정 요청으로 올렸다 (N-29).
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Chip, Label, Panel, Select, Textarea } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useMfbComment, useMfbEdit, useMfbReply } from '@/api/queries';
import type { Marketing, MfbPost, MfbThread } from '@/api/types';

/** 칩 색은 서버가 준 코드값에서 고른다 — 낱말 자체는 서버가 만든 stateLabel 이다 (D-R18) */
const STATE_TONE: Record<string, 'success' | 'danger'> = { fixed: 'success', needs_fix: 'danger' };

/** `2026-08-20T21:15:00+09:00` → `08-20 21:15`. 시각을 만드는 곳은 서버이고 여기서는 자르기만 한다 */
const shortAt = (at: string): string => `${at.slice(5, 10)} ${at.slice(11, 16)}`;

function PostBlock({ post, onEdit }: { post: MfbPost; onEdit?: () => void }) {
  const isComment = post.kind === 'comment';
  return (
    <div className={`border-l-2 px-3 py-2 ${isComment ? 'border-amber bg-amber/10' : 'border-green bg-green/10'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[11px] font-bold ${isComment ? 'text-amber' : 'text-green'}`}>
          {post.byName ?? '—'}
        </span>
        <span className="text-[10.5px] text-fg-subtle">{post.kindLabel}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-fg">{post.body}</p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10.5px] italic text-fg-subtle">{shortAt(post.at)}</span>
        {onEdit ? (
          <button type="button" className="text-[11px] text-fg-subtle underline" onClick={onEdit}>답 고치기</button>
        ) : null}
      </div>
    </div>
  );
}

export function MarketingFeedback({
  threads, needsFix, canComment, viewerId, marketing,
}: {
  threads: MfbThread[];
  needsFix: number;
  canComment: boolean;
  viewerId: number | null;
  marketing: Marketing[];
}) {
  const comment = useMfbComment();
  const reply = useMfbReply();
  const edit = useMfbEdit();

  const [openComment, setOpenComment] = useState(false);
  const [mktId, setMktId] = useState('');
  const [body, setBody] = useState('');
  const [replyMkt, setReplyMkt] = useState<number | null>(null);
  const [editing, setEditing] = useState<MfbPost | null>(null);
  const [draft, setDraft] = useState('');

  const close = () => {
    setOpenComment(false); setReplyMkt(null); setEditing(null);
    setBody(''); setDraft(''); setMktId('');
    comment.reset(); reply.reset(); edit.reset();
  };

  return (
    <>
      {/* 원문 §60 머리 띠 — 숫자와 문장은 규칙 그대로다 */}
      <Banner tone={needsFix > 0 ? 'danger' : 'neutral'} className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <b>고쳐야 할 것 {needsFix}건</b>
            <span className="ml-2 text-[12px] text-fg-2">
              대표가 코멘트를 남기면 <b>관리자 전원</b>에게 알림이 갑니다
            </span>
          </span>
          {canComment ? (
            <Button size="sm" onClick={() => { close(); setOpenComment(true); }}>+ 코멘트 남기기</Button>
          ) : null}
        </div>
      </Banner>

      {openComment ? (
        <Panel className="mb-3" title="대표 코멘트" sub="관리자 전원에게 알림이 갑니다">
          <Label htmlFor="mfb-mkt">어느 활동에</Label>
          <Select id="mfb-mkt" value={mktId} onChange={(e) => setMktId(e.target.value)}>
            <option value="">활동 고르기</option>
            {marketing.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <div className="mt-3">
            <Label htmlFor="mfb-body">코멘트</Label>
            <Textarea id="mfb-body" rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {comment.isError ? <Banner tone="danger" className="mt-3">{apiMessage(comment.error)}</Banner> : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>취소</Button>
            <Button
              disabled={comment.isPending || !mktId || body.trim() === ''}
              onClick={() => comment.mutate({ mktId: Number(mktId), body: body.trim() }, { onSuccess: close })}
            >
              남기기
            </Button>
          </div>
        </Panel>
      ) : null}

      {threads.length === 0 ? (
        <Panel title="대표 피드백">
          <p className="p-1 text-[12.5px] text-fg-subtle">아직 코멘트가 없습니다</p>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-3">
        {threads.map((t) => {
          const lastComment = [...t.posts].reverse().find((p) => p.kind === 'comment');
          const answering = replyMkt === t.mktId;
          const editingHere = editing && t.posts.some((p) => p.id === editing.id) ? editing : null;
          return (
            <Panel
              key={t.mktId}
              title={(
                <span className="flex flex-wrap items-center gap-2">
                  <Chip tone={STATE_TONE[t.state] ?? 'neutral'} styleKind="solid">{t.stateLabel}</Chip>
                  <Chip tone="info">{t.channelLabel}</Chip>
                  <span className="font-bold">{t.name}</span>
                </span>
              )}
              sub={`${t.itemLabel}${t.byName ? ` · 담당 ${t.byName}` : ' · 담당 없음'}`}
              right={<span className="text-[11px] text-fg-subtle">{shortAt(t.at)}</span>}
            >
              <div className="flex flex-col gap-2">
                {t.posts.map((p) => (
                  <PostBlock
                    key={p.id}
                    post={p}
                    onEdit={viewerId !== null && p.byId === viewerId
                      ? () => { close(); setEditing(p); setDraft(p.body); }
                      : undefined}
                  />
                ))}
                {t.state === 'needs_fix' ? (
                  <div className="rounded bg-bg-2 px-3 py-2 text-[12px] text-fg-subtle">아직 답이 없습니다</div>
                ) : null}
              </div>

              {editingHere ? (
                <div className="mt-3">
                  <Label htmlFor="mfb-edit">답 고치기</Label>
                  <Textarea id="mfb-edit" rows={3} maxLength={1000} value={draft}
                    onChange={(e) => setDraft(e.target.value)} />
                  {edit.isError ? <Banner tone="danger" className="mt-2">{apiMessage(edit.error)}</Banner> : null}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={close}>취소</Button>
                    <Button size="sm" disabled={edit.isPending || draft.trim() === ''}
                      onClick={() => edit.mutate({ id: editingHere.id, body: draft.trim() }, { onSuccess: close })}>
                      고치기
                    </Button>
                  </div>
                </div>
              ) : null}

              {answering && lastComment ? (
                <div className="mt-3">
                  <Label htmlFor="mfb-reply">고친 것 알리기</Label>
                  <Textarea id="mfb-reply" rows={3} maxLength={1000} value={draft}
                    onChange={(e) => setDraft(e.target.value)} />
                  {reply.isError ? <Banner tone="danger" className="mt-2">{apiMessage(reply.error)}</Banner> : null}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={close}>취소</Button>
                    <Button size="sm" disabled={reply.isPending || draft.trim() === ''}
                      onClick={() => reply.mutate(
                        { mktId: t.mktId, parentId: lastComment.id, body: draft.trim() },
                        { onSuccess: close },
                      )}>
                      알리기
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {t.url ? (
                  <a href={t.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">URL</Button>
                  </a>
                ) : null}
                {/* 답은 담당자만 쓴다 — 서버도 같은 판정으로 막는다 (NOT_OWNER) */}
                {t.canReply && lastComment && t.state === 'needs_fix' && !answering ? (
                  <Button size="sm" onClick={() => { close(); setReplyMkt(t.mktId); setDraft(''); }}>
                    고친 것 알리기
                  </Button>
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
