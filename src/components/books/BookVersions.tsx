/** @file-guide
 * 목적: BookVersions.tsx — BookVersionBadge, BookVersionAdder, BookHistory (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §39 판 배지 · §40 이력.
 *
 * **「더 나중 판이 있다」를 화면이 판정하지 않는다.** 서버가 `hasNewer` 한 칸으로 말한다 —
 * 화면이 `edition !== latestEdition` 을 다시 적으면 카드 배지와 머리 띠가 갈린다 (D-R39).
 * 원본 §39 가 그 둘을 같은 화면에 나란히 두고 있어 갈리면 바로 보인다.
 *
 * §40 이력에는 **쓰는 자리가 없다.** 배부·업로드·교체·안내가 남긴 것을 읽기만 한다.
 */
'use client';
import { useState } from 'react';
import { Banner, Button, Chip, Input, Label, Panel } from '@/components/ui';
import { apiMessage } from '@/api/client';
import { useAddBookVersion, useBookHistory, useUseBookVersion } from '@/api/queries';
import type { Book } from '@/api/types';

/** 판 배지 — ⇧ 는 「더 나중 판이 있다」는 서버 판정 하나만 본다 */
export function BookVersionBadge({ book }: { book: Book }) {
  const use = useUseBookVersion();
  if (!book.edition) return <span className="text-[11px] text-fg-subtle">판 없음</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Chip size="compact" tone={book.hasNewer ? 'warning' : 'neutral'}>{book.edition}</Chip>
      {book.hasNewer && book.latestVersId ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={use.isPending}
          title={`${book.latestEdition ?? ''} 로 바꿉니다`}
          onClick={() => use.mutate(book.latestVersId as number)}
        >
          ⇧ {book.latestEdition}
        </Button>
      ) : null}
    </span>
  );
}

/** §39 「+ 판 올리기」 */
export function BookVersionAdder({ book, onClose }: { book: Book; onClose: () => void }) {
  const add = useAddBookVersion();
  const [edition, setEdition] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  // 「언제부터 쓰는가」가 없으면 올린 판이 곧바로 지금 판이 되어 ⇧ 가 뜰 일이 없다 —
  // 그러면 원본 §39 의 「판 버튼을 눌러 바꿉니다」 갈래가 화면에서 닿지 않는다
  const [fromDate, setFromDate] = useState('');

  return (
    <Panel className="mb-4" title={`새 판 올리기 — ${book.title}`} sub="「언제부터」를 비우면 오늘부터 씁니다. 올린 판은 이력에 남습니다">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Label htmlFor="v-ed">판 이름</Label>
          <Input id="v-ed" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="v2026.08" />
        </div>
        <div>
          <Label htmlFor="v-from">언제부터</Label>
          <Input id="v-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label htmlFor="v-url">파일 주소</Label>
          <Input id="v-url" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="/files/12 — 비우면 파일 없는 판입니다" />
        </div>
      </div>
      {add.isError ? <Banner tone="danger" className="mt-3">{apiMessage(add.error)}</Banner> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button
          disabled={add.isPending || edition.trim() === ''}
          onClick={() => add.mutate(
            {
              libId: book.id, edition: edition.trim(),
              ...(fileUrl.trim() ? { fileUrl: fileUrl.trim() } : {}),
              ...(fromDate ? { fromDate } : {}),   // 비우면 오늘부터 — 판정은 서버가 한다
            },
            { onSuccess: onClose },
          )}
        >
          올리기
        </Button>
      </div>
    </Panel>
  );
}

/** §40 이력 — 읽기만 한다 */
export function BookHistory() {
  const q = useBookHistory();
  const [chip, setChip] = useState<string | null>(null);
  const rows = (q.data ?? []).filter((r) => chip === null || r.action === chip);
  // 칩 이름도 서버가 준 낱말이다 — 화면에 코드표를 다시 적지 않는다 (D-R18)
  const chips = [...new Map((q.data ?? []).map((r) => [r.action, r.actionLabel])).entries()];

  return (
    <Panel title={`이력 ${q.data?.length ?? 0}건`} sub="배부 · 업로드 · 교체 · 안내가 남긴 것입니다. 여기서 쓰지는 않습니다">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setChip(null)}>
          <Chip tone={chip === null ? 'info' : 'neutral'} styleKind={chip === null ? 'solid' : 'soft'}>전체</Chip>
        </button>
        {chips.map(([a, label]) => (
          <button key={a} type="button" onClick={() => setChip(a)}>
            <Chip tone={chip === a ? 'info' : 'neutral'} styleKind={chip === a ? 'solid' : 'soft'}>{label}</Chip>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-1 py-8 text-center text-[12px] text-fg-subtle">
          {q.isLoading ? '불러오는 중…' : '이력이 없습니다'}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-2 text-[12px]">
              <span className="w-36 shrink-0 text-fg-subtle">{r.at.slice(0, 16).replace('T', ' ')}</span>
              <Chip size="compact">{r.actionLabel}</Chip>
              <span className="font-bold text-fg">{r.subject ?? '—'}</span>
              <span className="ml-auto text-fg-subtle">{r.byName ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
