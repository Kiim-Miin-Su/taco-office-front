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
 * 원문 §60 확인 필요 카드의 「보류」 — W11 · N-29 ③ 채택: **담당 답변의 한 종류**다(`kind: 'hold'`). 칩은 원문 둘 그대로라
 * 보류한 카드는 「확인 필요」로 남고 「고쳐야 할 것 N건」에서 빠지지 않는다 — 「고친 것 알리기」가 푼다. 보류는 코멘트마다 한 번(서버 `held`).
 *
 * **x5 (잔여 물결 · g6 60-3~60-8)** — 카드 머리는 한 줄(상태 · 채널 · 제목 ··· 시각), 글 블록은 이름(대표 주황 · 담당 초록) +
 * 본문이고 **시각은 답에만**, 고치기 단추는 **바닥 단추 줄**로(자기 코멘트는 「코멘트 고치기」 · 자기 답은 「답 고치기」),
 * 머리 띠는 두 줄 · 「+ 코멘트 남기기」·「고친 것 알리기」는 갈색 주 단추, 카드 왼쪽 굵은 상태 띠(고쳤습니다 초록 · 확인 필요 빨강).
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

/**
 * 글 블록 — 원문 §60: 이름(대표 코멘트 주황 · 담당 답 초록) + 본문. 「대표 코멘트」/「담당자 답변」 낱말은 색이 대신하고
 * (낱말은 읽는 사람을 위해 `aria-label` 로 남긴다), **시각은 답에만** 적는다 — 코멘트 시각은 카드 머리 시각과 같다 (60-4).
 */
function PostBlock({ post }: { post: MfbPost }) {
  const isComment = post.kind === 'comment';
  // 보류(N-29 ③)는 담당의 답이지만 고친 것이 아니다 — 초록(고친 답) 대신 회색 블록에 「보류」 칩(서버 낱말)을 단다
  const isHold = post.kind === 'hold';
  const look = isComment ? 'border-orange bg-orange/5' : isHold ? 'border-line-2 bg-inset' : 'border-green bg-green/5';
  return (
    <div aria-label={post.kindLabel} className={`border-l-2 px-3 py-2 ${look}`}>
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${isComment ? 'text-orange' : isHold ? 'text-fg-2' : 'text-green'}`}>
        {post.byName ?? '—'}
        {isHold ? <Chip size="compact">{post.kindLabel}</Chip> : null}
      </span>
      <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-fg">{post.body}</p>
      {isComment ? null : <span className="mt-1 block text-[10.5px] italic text-fg-subtle">{shortAt(post.at)}</span>}
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
  /** 담당 답의 갈래 — 「고친 것 알리기」(reply) · 「보류」(hold) */
  const [replyKind, setReplyKind] = useState<'reply' | 'hold'>('reply');
  const [editing, setEditing] = useState<MfbPost | null>(null);
  const [draft, setDraft] = useState('');

  const close = () => {
    setOpenComment(false); setReplyMkt(null); setReplyKind('reply'); setEditing(null);
    setBody(''); setDraft(''); setMktId('');
    comment.reset(); reply.reset(); edit.reset();
  };

  return (
    <>
      {/* 원문 §60 머리 띠 — 두 줄(굵은 「고쳐야 할 것 N건」 + 설명) · 오른쪽 갈색 주 단추 (60-6). 숫자와 문장은 규칙 그대로다 */}
      <Banner tone={needsFix > 0 ? 'danger' : 'neutral'} className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <b className="text-[14px]">고쳐야 할 것 {needsFix}건</b>
            <span className="text-[12px] text-fg-2">
              대표가 코멘트를 남기면 <b>관리자 전원</b>에게 알림이 갑니다
            </span>
          </span>
          {canComment ? (
            <Button variant="primary" onClick={() => { close(); setOpenComment(true); }}>+ 코멘트 남기기</Button>
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
          // 고치는 것은 **자기 글**뿐이다(서버 NOT_AUTHOR) — 코멘트와 답은 이름이 다른 단추다 (60-5)
          const mine = (kind: string) => (viewerId === null ? undefined
            : [...t.posts].reverse().find((p) => p.kind === kind && p.byId === viewerId));
          const myComment = mine('comment');
          // 자기 답 — 보류 한 줄도 자기 글이라 고칠 수 있다(서버 editPost 는 갈래를 가리지 않는다)
          const myReply = mine('reply') ?? mine('hold');
          const startEdit = (p: MfbPost) => { close(); setEditing(p); setDraft(p.body); };
          return (
            <Panel
              key={t.mktId}
              /* 카드 왼쪽 굵은 상태 띠 — 고쳤습니다 초록 · 확인 필요 빨강 (60-8) */
              className={`border-l-4 ${t.state === 'fixed' ? 'border-l-green' : 'border-l-red'}`}
              /* 머리는 한 줄 — 상태 · 채널 · 제목 ··· 시각 (60-3). 담당은 답 블록의 이름이 말한다 */
              title={(
                <span className="flex flex-wrap items-center gap-2">
                  <Chip tone={STATE_TONE[t.state] ?? 'neutral'} styleKind="solid">{t.stateLabel}</Chip>
                  <Chip tone="info" styleKind="solid">{t.channelLabel}</Chip>
                  <span className="font-bold">{t.name}</span>
                </span>
              )}
              right={<span className="text-[11px] text-fg-subtle">{shortAt(t.at)}</span>}
            >
              <div className="flex flex-col gap-2">
                {t.posts.map((p) => <PostBlock key={p.id} post={p} />)}
                {t.state === 'needs_fix' && !t.held ? (
                  <div className="rounded bg-bg-2 px-3 py-2 text-[12px] text-fg-subtle">아직 답이 없습니다</div>
                ) : null}
              </div>

              {editingHere ? (
                <div className="mt-3">
                  <Label htmlFor="mfb-edit">{editingHere.kind === 'comment' ? '코멘트 고치기' : '답 고치기'}</Label>
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
                  <Label htmlFor="mfb-reply" hint={replyKind === 'hold' ? '왜 미루는지 한 줄 — 카드는 「확인 필요」로 남습니다' : undefined}>
                    {replyKind === 'hold' ? '보류' : '고친 것 알리기'}
                  </Label>
                  <Textarea id="mfb-reply" rows={3} maxLength={1000} value={draft}
                    onChange={(e) => setDraft(e.target.value)} />
                  {reply.isError ? <Banner tone="danger" className="mt-2">{apiMessage(reply.error)}</Banner> : null}
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={close}>취소</Button>
                    <Button size="sm" disabled={reply.isPending || draft.trim() === ''}
                      onClick={() => reply.mutate(
                        { mktId: t.mktId, parentId: lastComment.id, body: draft.trim(), ...(replyKind === 'hold' ? { kind: 'hold' as const } : {}) },
                        { onSuccess: close },
                      )}>
                      {replyKind === 'hold' ? '보류하기' : '알리기'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {/* 바닥 단추 줄 — 「URL · 답 고치기」 / 「URL · 고친 것 알리기(주 단추) · 보류」 (60-5 · 60-6 · N-29 ③) */}
              <div className="mt-3 flex flex-wrap gap-2">
                {t.url ? (
                  <a href={t.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">URL</Button>
                  </a>
                ) : null}
                {myComment && !editingHere ? (
                  <Button size="sm" variant="secondary" onClick={() => startEdit(myComment)}>코멘트 고치기</Button>
                ) : null}
                {myReply && !editingHere ? (
                  <Button size="sm" variant="secondary" onClick={() => startEdit(myReply)}>답 고치기</Button>
                ) : null}
                {/* 답은 담당자만 쓴다 — 서버도 같은 판정으로 막는다 (NOT_OWNER) */}
                {t.canReply && lastComment && t.state === 'needs_fix' && !answering ? (
                  <Button size="sm" variant="primary" onClick={() => { close(); setReplyMkt(t.mktId); setDraft(''); }}>
                    고친 것 알리기
                  </Button>
                ) : null}
                {/* 보류는 코멘트마다 한 번 — 이미 보류했으면 서지 않는다(서버도 409 MFB_ALREADY_HELD) */}
                {t.canReply && lastComment && t.state === 'needs_fix' && !t.held && !answering ? (
                  <Button size="sm" variant="secondary" onClick={() => { close(); setReplyMkt(t.mktId); setReplyKind('hold'); setDraft(''); }}>
                    보류
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
