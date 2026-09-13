/** @file-guide
 * 목적: DesignSystemDialog.tsx — DesignSystemDialogProps, DesignSystemDialog (component)
 * 책임/재사용: 기존 UI 프리미티브/도메인 훅을 조합하고 표시 상태만 소유한다. 권한·정산 판정과 서버 진실을 재구현하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * §85 디자인 토큰 · §86 컴포넌트 갤러리 — 「디자인 · 컴포넌트」 창.
 *
 * 원문 컷에서 이것은 **라우트가 아니라 창**이다. 머리의 「디자인」을 누르면 어느 화면 위로든
 * 뜬다 — 「색과 크기를 바꾸면 화면 전체가 바로 바뀝니다」라는 부제가 그 뜻이다.
 *
 * **이 화면은 색을 하나도 들고 있지 않다.** 값은 `styles/tokens.css` 한 곳에만 있고(D-R41),
 * 여기서는 실행 중에 그 변수를 읽어 보여 준다. 여기에 hex 를 적으면 토큰이 두 벌이 되고,
 * 하필 「토큰은 하나다」라고 주장하는 화면이 그 증거가 된다.
 *
 * **「N회 씀」도 손으로 적지 않는다** — `scripts/component-usage.mjs` 가 소스를 세고,
 * 회귀가 다시 세어 오래됐는지 본다. 손으로 적은 숫자는 적은 그날부터 틀리기 시작한다.
 */
'use client';
import { useMemo, useState } from 'react';
import usage from '@/lib/component-usage.json';
import {
  CONTRAST_ADJUSTED, GALLERY, TOKEN_COLORS, TOKEN_LAYOUT, TOKEN_SIZES,
  cssVarValue, tokensAsCss, tokensAsJson, type TokenRow,
} from '@/lib/design-system';
import {
  Banner, Board, Button, Chip, Column, Dialog, Input, Label, Panel, Segmented,
  StatCard, StatusBadge, Table, cn,
} from '@/components/ui';
import { BoardMarks } from '@/components/board/BoardViews';

export interface DesignSystemDialogProps {
  open: boolean;
  onClose: () => void;
}

type Pane = 'color' | 'size' | 'parts';

const ALL_TOKENS = [TOKEN_COLORS, TOKEN_SIZES, TOKEN_LAYOUT];

/** 브라우저에서 파일 하나를 내려 준다 — 내보낸 값은 지금 화면이 쓰는 값이다 */
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ColorRow({ row }: { row: TokenRow }) {
  const value = cssVarValue(row.key);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
      <span
        aria-hidden
        className="h-10 w-10 shrink-0 rounded-lg border border-line"
        style={{ background: `var(--${row.key})` }}
      />
      <span className="min-w-0 grow">
        <span className="block text-[13.5px] font-bold">{row.name}</span>
        <span className="block text-[11.5px] text-fg-subtle">{row.use}</span>
      </span>
      {CONTRAST_ADJUSTED.includes(row.key)
        ? <Chip tone="warning">대비 보강</Chip>
        : null}
      <code className="shrink-0 rounded-md bg-inset px-2 py-1 font-mono text-[11.5px] uppercase">
        {value || '—'}
      </code>
    </li>
  );
}

function SizeRow({ row }: { row: TokenRow }) {
  const value = cssVarValue(row.key);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
      <span
        aria-hidden
        className="h-10 w-10 shrink-0 border border-line bg-primary/20"
        style={{ borderRadius: `var(--${row.key})` }}
      />
      <span className="min-w-0 grow">
        <span className="block text-[13.5px] font-bold">{row.name}</span>
        <span className="block text-[11.5px] text-fg-subtle">{row.use}</span>
      </span>
      <code className="shrink-0 rounded-md bg-inset px-2 py-1 font-mono text-[11.5px]">{value || '—'}</code>
    </li>
  );
}

/** 갤러리 카드 한 장 — 제목 · 한 줄 · 「N회 씀」 · 실물 본보기 */
function Part({ k, children }: { k: string; children: React.ReactNode }) {
  const row = GALLERY.find((g) => g.key === k)!;
  const n = (usage.counts as Record<string, number>)[k];
  return (
    <section className="rounded-xl border border-line bg-card">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-[13.5px] font-bold">{row.name}</h3>
        <p className="min-w-0 grow truncate text-[11.5px] text-fg-subtle">{row.sub}</p>
        <span className="shrink-0 rounded-md bg-inset px-2 py-1 text-[11px] font-bold text-fg-subtle">
          {n}회 씀
        </span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const SAMPLE_ROWS = [
  { id: 1, who: '고은성', what: 'MAP Reading', state: 'ok' },
  { id: 2, who: '민제인', what: 'Writing', state: 'wait' },
];
const SAMPLE_COLS: Array<Column<(typeof SAMPLE_ROWS)[number]>> = [
  { key: 'w', head: '학생', cell: (r) => r.who },
  { key: 'x', head: '과목', cell: (r) => r.what },
  { key: 's', head: '상태', width: 100, cell: (r) => <StatusBadge state={r.state} /> },
];

export function DesignSystemDialog({ open, onClose }: DesignSystemDialogProps) {
  const [pane, setPane] = useState<Pane>('color');
  const [sample, setSample] = useState('하루만');
  const counts = useMemo(
    () => ({ color: TOKEN_COLORS.length, size: TOKEN_SIZES.length + TOKEN_LAYOUT.length, parts: GALLERY.length }),
    [],
  );

  return (
    <Dialog
      open={open} onClose={onClose} width={1180}
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span className="grow">
            <span className="block">디자인 · 컴포넌트</span>
            <span className="block text-[12px] font-normal text-fg-subtle">
              색과 크기를 바꾸면 화면 전체가 바로 바뀝니다
            </span>
          </span>
          <Button size="sm" onClick={() => download('tokens.css', tokensAsCss(ALL_TOKENS), 'text/css')}>
            CSS 내보내기
          </Button>
          <Button size="sm" onClick={() => download('tokens.json', tokensAsJson(ALL_TOKENS), 'application/json')}>
            토큰 JSON
          </Button>
        </span>
      }
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="grid max-h-[70dvh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="디자인 시스템 갈래" className="flex gap-2 sm:flex-col">
          {([
            ['color', '색', counts.color],
            ['size', '크기 · 모양', counts.size],
            ['parts', '컴포넌트', counts.parts],
          ] as const).map(([v, label, n]) => (
            <button
              key={v} type="button" aria-pressed={pane === v} onClick={() => setPane(v)}
              className={cn(
                'rounded-lg px-4 py-3 text-left transition-colors',
                pane === v ? 'bg-header text-card' : 'bg-card text-fg hover:bg-inset',
              )}
            >
              <span className="block text-[13.5px] font-bold">{label}</span>
              <span className={cn('block text-[11.5px]', pane === v ? 'text-card/70' : 'text-fg-subtle')}>{n}개</span>
            </button>
          ))}
        </nav>

        <div>
          {pane === 'color' ? (
            <>
              <ul className="space-y-2">
                {TOKEN_COLORS.map((r) => <ColorRow key={r.key} row={r} />)}
              </ul>
              <Banner tone="neutral" className="mt-3">
                <b>기본 색 · 보라 · 초록 · 주황</b> 넷은 작은 글자에서 대비 4.5:1 을 맞추려고
                명세서 §85 컷보다 어둡게 잡았습니다 (2026-09-10). 나머지 다섯은 컷 값 그대로입니다.
                Figma 의 <b>TACO v2 · Spec Foundations</b> 도 이미 이 값이라, 지금 갈리는 것은 <b>컷 하나</b>뿐입니다.
              </Banner>
            </>
          ) : pane === 'size' ? (
            <>
              <h3 className="mb-2 text-[12px] font-bold text-fg-subtle">쓰는 값</h3>
              <ul className="space-y-2">{TOKEN_SIZES.map((r) => <SizeRow key={r.key} row={r} />)}</ul>
              <h3 className="mb-2 mt-4 text-[12px] font-bold text-fg-subtle">화면 틀</h3>
              <ul className="space-y-2">{TOKEN_LAYOUT.map((r) => <SizeRow key={r.key} row={r} />)}</ul>
              <Banner tone="info" className="mt-3">
                원문 §85 는 이 갈래를 <b>「5개」</b>라 적었는데 지금 토큰은 여덟입니다 —
                어느 다섯이 정본인지 확인이 필요합니다 (N-34).
              </Banner>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Part k="button">
                <div className="flex flex-wrap gap-2">
                  <Button>기본</Button>
                  <Button variant="primary">강조</Button>
                  <Button size="sm">작게</Button>
                  <Button variant="danger">지우기</Button>
                  <Button disabled>못 누름</Button>
                </div>
              </Part>
              <Part k="badge">
                <div className="flex flex-wrap gap-2">
                  <Chip tone="success">완료</Chip>
                  <Chip tone="warning">대기</Chip>
                  <Chip tone="danger">지연</Chip>
                  <Chip tone="info">진행</Chip>
                  <Chip tone="purple">컨설팅</Chip>
                </div>
              </Part>
              <Part k="mark">
                <BoardMarks marks={[
                  { key: 'book', done: true, na: false },
                  { key: 'guide', done: false, na: false },
                  { key: 'zoom', done: false, na: true },
                  { key: 'report', done: false, na: true },
                ]} />
              </Part>
              <Part k="input">
                <Input placeholder="이름을 넣어주세요" aria-label="본보기 입력칸" />
                <div className="mt-3 flex justify-end">
                  <Segmented
                    value={sample} onChange={setSample}
                    options={[
                      { value: '하루만', label: '하루만' },
                      { value: '기간', label: '기간' },
                      { value: '날짜 고르기', label: '날짜 고르기' },
                    ]}
                  />
                </div>
              </Part>
              <Part k="field">
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
                  <div>
                    <Label htmlFor="ds-stu">학생 *</Label>
                    <Input id="ds-stu" defaultValue="고은성" />
                  </div>
                  <div>
                    <Label htmlFor="ds-grade">학년</Label>
                    <Input id="ds-grade" defaultValue="G9" />
                  </div>
                </div>
              </Part>
              <Part k="stat">
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="다 됐음" value="6/49" tone="success" />
                  <StatCard label="교재 안 됨" value="42" tone="danger" />
                  <StatCard label="휴강" value="0" />
                </div>
              </Part>
              <Part k="banner">
                <Banner tone="success">겹치는 것이 없습니다</Banner>
                <Banner tone="danger" className="mt-2">2곳이 겹칩니다 — 08-21 16:00 MAP Reading</Banner>
              </Part>
              <Part k="table">
                <Table columns={SAMPLE_COLS} rows={SAMPLE_ROWS} rowKey={(r) => r.id} />
              </Part>
              <Part k="panel">
                <Panel title="구역 제목" sub="화면 안을 나눕니다">
                  <p className="p-3 text-[12px] text-fg-subtle">패널 안에 들어가는 내용입니다.</p>
                </Panel>
              </Part>
              <Part k="board">
                <Board
                  columns={[
                    { key: 'mon', label: '월', tone: 'info', items: [{ id: 1, t: 'MAP Reading' }] },
                    { key: 'tue', label: '화', tone: 'purple', items: [{ id: 2, t: 'Writing' }] },
                  ]}
                  itemKey={(x) => x.id}
                  renderCard={(x) => <span className="text-[12px] font-bold">{x.t}</span>}
                />
              </Part>
              <Part k="overlay">
                <p className="text-[12px] text-fg-subtle">
                  이 창 자체가 대화상자입니다. 서랍은 오른쪽에서 밀려 나옵니다 — 컨설팅 회계의 「열기」가 그 모양입니다.
                </p>
              </Part>
              <Part k="tabs">
                <Segmented
                  value={sample} onChange={setSample}
                  options={[{ value: '하루만', label: '일' }, { value: '기간', label: '주' }, { value: '날짜 고르기', label: '월' }]}
                />
              </Part>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
