/** @file-guide
 * 목적: DesignSystemDialog.tsx — DesignSystemDialogProps, DesignSystemDialog (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
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
 *
 * **창 틀은 공용 `WideDialog`** 다 (85-3) — 원문 컷은 머리 오른쪽 끝에 「×」가 있고 바닥 단추 줄이 없다.
 * 확인창용 `Dialog` 는 머리 「×」도 본문 스크롤도 없어서 바닥 「닫기」를 달고 본문 안에서 따로 스크롤하고 있었다.
 */
'use client';
import { useMemo, useState } from 'react';
import usage from '@/lib/component-usage.json';
import {
  CONTRAST_ADJUSTED, GALLERY, TOKEN_COLORS, TOKEN_LAYOUT, TOKEN_SIZES,
  cssVarValue, tokensAsCss, tokensAsJson, type TokenRow,
} from '@/lib/design-system';
import {
  Banner, Board, Button, Chip, Column, Input, Label, Panel, Segmented,
  StatCard, Table, cn,
} from '@/components/ui';
import { WideDialog } from '@/components/ui/WideDialog';
import { BoardMarks } from '@/components/board/BoardViews';
import type { CheckMark } from '@/api/types';

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

/**
 * 「색과 크기를 바꾸면 화면 전체가 바로 바뀝니다」 (85-2) — 그 말을 **참으로** 만든다.
 *
 * 바꾸는 곳은 문서 뿌리의 CSS 변수 **하나**다(`--primary` …). 화면의 모든 색·투명도 수식이 그 변수에서
 * 나오므로(tailwind `withAlpha` 가 `rgb(from var(--x) …)` 다) 창을 닫으면 온 화면이 바뀐 값으로 보인다.
 * 값의 정본은 계속 `styles/tokens.css` 다 — **저장하지 않는다.** 어디에 저장할지는 정해지지 않았다
 * (브라우저 한정인지, 모두에게인지 — 결정 대기). 그래서 새로 고치면 처음 값으로 돌아가고, 「처음으로」가 바로 되돌린다.
 */
function setToken(key: string, value: string | null) {
  if (typeof document === 'undefined') return;
  if (value === null) document.documentElement.style.removeProperty(`--${key}`);
  else document.documentElement.style.setProperty(`--${key}`, value);
}

/** `<input type="color">` 는 소문자 여섯 자리만 받는다 — 읽은 값이 그 모양이 아니면 바꾸는 칸을 세우지 않는다 */
const asHex = (v: string): string | null => (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);
/** 크기 토큰은 `12px` 모양일 때만 숫자로 바꾼다 */
const asPx = (v: string): number | null => (/^\d+px$/.test(v) ? Number(v.slice(0, -2)) : null);

type Edit = (key: string, value: string) => void;

function ColorRow({ row, value, onEdit }: { row: TokenRow; value: string; onEdit: Edit }) {
  const hex = asHex(value);
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
      {/* 견본을 누르면 색을 고른다 — 컷의 모양(견본 + 이름 + 값) 그대로 두고 견본이 입력칸이 된다 */}
      <label className="relative h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-line" style={{ background: `var(--${row.key})` }}>
        {hex ? (
          <input
            type="color"
            aria-label={`${row.name} 바꾸기`}
            value={hex}
            onChange={(e) => onEdit(row.key, e.currentTarget.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        ) : null}
      </label>
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

function SizeRow({ row, value, onEdit }: { row: TokenRow; value: string; onEdit: Edit }) {
  const px = asPx(value);
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
      {px !== null ? (
        <input
          type="number"
          min={0}
          max={400}
          aria-label={`${row.name} 바꾸기`}
          value={px}
          onChange={(e) => { const n = e.currentTarget.valueAsNumber; if (Number.isInteger(n) && n >= 0) onEdit(row.key, `${n}px`); }}
          className="w-20 shrink-0 rounded-md border border-line bg-card px-2 py-1 text-right font-mono text-[11.5px]"
        />
      ) : <code className="shrink-0 rounded-md bg-inset px-2 py-1 font-mono text-[11.5px]">{value || '—'}</code>}
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

/** 표시 마크 견본 세 상태 — 됐다 · 안 됐다 · 해당 없음 (원본 §86 카드 한 줄 「됐는지 · 안 됐는지 · 해당 없음」) */
const MARK_SAMPLES: Array<{ mark: CheckMark; word: string }> = [
  { mark: { key: 'book', done: true, na: false }, word: '교재' },
  { mark: { key: 'guide', done: false, na: false }, word: '안내' },
  { mark: { key: 'zoom', done: false, na: true }, word: '해당 없음' },
];

/**
 * 표 견본 — 원본 §86 은 상태 칸에 **「● 완료 · ● 대기」**(점 + 색 글자)를 적는다 (86-5).
 * 리포트 상태 낱말(승인 · 승인 대기)을 빌려 오면 견본이 한 화면의 업무 낱말을 말하게 된다.
 */
const SAMPLE_ROWS = [
  { id: 1, who: '고은성', what: 'MAP Reading', done: true },
  { id: 2, who: '민제인', what: 'Writing', done: false },
];
const SAMPLE_COLS: Array<Column<(typeof SAMPLE_ROWS)[number]>> = [
  { key: 'w', head: '학생', cell: (r) => r.who },
  { key: 'x', head: '과목', cell: (r) => r.what },
  {
    key: 's', head: '상태', width: 100,
    // 상태 배지 견본과 같은 공용 점 모양(`Chip` dot · 86-2) — 표 안에서 따로 그리지 않는다
    cell: (r) => <Chip tone={r.done ? 'success' : 'warning'} styleKind="dot">{r.done ? '완료' : '대기'}</Chip>,
  },
];

export function DesignSystemDialog({ open, onClose }: DesignSystemDialogProps) {
  const [pane, setPane] = useState<Pane>('color');
  const [sample, setSample] = useState('하루만');
  /** 이 창에서 바꾼 값 — 화면에만 있다(저장하지 않는다 · 85-2). 키 → 새 값 */
  const [edited, setEdited] = useState<Record<string, string>>({});
  const valueOf = (key: string) => edited[key] ?? cssVarValue(key);
  const edit: Edit = (key, value) => { setToken(key, value); setEdited((prev) => ({ ...prev, [key]: value })); };
  const reset = () => { for (const key of Object.keys(edited)) setToken(key, null); setEdited({}); };
  const editedCount = Object.keys(edited).length;
  const counts = useMemo(
    () => ({ color: TOKEN_COLORS.length, size: TOKEN_SIZES.length + TOKEN_LAYOUT.length, parts: GALLERY.length }),
    [],
  );

  return (
    <WideDialog
      open={open} onClose={onClose} width={1180}
      title="디자인 · 컴포넌트"
      sub="색과 크기를 바꾸면 화면 전체가 바로 바뀝니다"
      actions={(
        <>
          {/* 바꾼 것이 있을 때만 선다 — 쉬는 모양은 원문 컷 그대로다 */}
          {editedCount > 0 ? (
            <>
              <span className="text-[11.5px] text-fg-subtle">바꾼 것 {editedCount} · 이 화면에만 · 저장하지 않습니다</span>
              <Button size="sm" onClick={reset}>처음으로</Button>
            </>
          ) : null}
          <Button size="sm" onClick={() => download('tokens.css', tokensAsCss(ALL_TOKENS), 'text/css')}>
            CSS 내보내기
          </Button>
          <Button size="sm" onClick={() => download('tokens.json', tokensAsJson(ALL_TOKENS), 'application/json')}>
            토큰 JSON
          </Button>
        </>
      )}
    >
      {/* 스크롤은 창의 본문이 한다 — 안에서 한 번 더 스크롤하지 않는다 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
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
                {TOKEN_COLORS.map((r) => <ColorRow key={r.key} row={r} value={valueOf(r.key)} onEdit={edit} />)}
              </ul>
              <Banner tone="neutral" className="mt-3">
                <b>기본 색 · 보라 · 초록 · 주황</b> 넷은 작은 글자에서 대비 4.5:1 을 맞추려고
                명세서 컷보다 어둡게 잡았습니다 (2026-09-10). 나머지 다섯은 컷 값 그대로입니다.
                Figma 의 <b>TACO v2 · Spec Foundations</b> 도 이미 이 값이라, 지금 갈리는 것은 <b>컷 하나</b>뿐입니다.
              </Banner>
            </>
          ) : pane === 'size' ? (
            <>
              <h3 className="mb-2 text-[12px] font-bold text-fg-subtle">쓰는 값</h3>
              <ul className="space-y-2">{TOKEN_SIZES.map((r) => <SizeRow key={r.key} row={r} value={valueOf(r.key)} onEdit={edit} />)}</ul>
              <h3 className="mb-2 mt-4 text-[12px] font-bold text-fg-subtle">화면 틀</h3>
              <ul className="space-y-2">{TOKEN_LAYOUT.map((r) => <SizeRow key={r.key} row={r} value={valueOf(r.key)} onEdit={edit} />)}</ul>
              <Banner tone="info" className="mt-3">
                명세서는 이 갈래를 <b>「5개」</b>라 적었는데 지금 토큰은 여덟입니다 —
                어느 다섯이 정본인지 확인이 필요합니다.
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
                {/* 원본 §86 상태 배지 = 점 + 색 글자(「● 완료」) — 알약이 아니다 (86-2) */}
                <div className="flex flex-wrap gap-3">
                  <Chip tone="success" styleKind="dot">완료</Chip>
                  <Chip tone="warning" styleKind="dot">대기</Chip>
                  <Chip tone="danger" styleKind="dot">지연</Chip>
                  <Chip tone="info" styleKind="dot">진행</Chip>
                  <Chip tone="purple" styleKind="dot">컨설팅</Chip>
                </div>
              </Part>
              <Part k="mark">
                {/* 원본 §86 견본은 **세 상태와 그 뜻**이다 — 「✓ 교재 · ! 안내 · – 해당 없음」 (86-3).
                    글리프는 현황판이 쓰는 그 부품(`BoardMarks` 기호 모양)을 그대로 쓴다 */}
                <div className="flex flex-wrap items-center gap-4">
                  {MARK_SAMPLES.map(({ mark, word }) => (
                    <span key={mark.key} className="inline-flex items-center gap-1.5 text-[12px] text-fg-2">
                      <BoardMarks variant="symbols" marks={[mark]} />{word}
                    </span>
                  ))}
                </div>
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
                  {/* 원본 §86 요약 카드 견본은 초록 · 분홍 옅은 바탕이다(공용 `fill`). 숫자 위/라벨 아래 모양은 확인 필요(86-7) */}
                  <StatCard label="다 됐음" value="6/49" tone="success" fill />
                  <StatCard label="교재 안 됨" value="42" tone="danger" fill />
                  <StatCard label="휴강" value="0" />
                </div>
              </Part>
              <Part k="banner">
                {/* 원본 §86 알림 상자 = 굵은 색 제목 + 점 목록 (86-4) */}
                <Banner tone="success" title="✓ 겹치는 것이 없습니다" items={['스케줄에 컨설팅 3일로 들어갑니다']} />
                <Banner tone="danger" className="mt-2" title="⛔ 2곳이 겹칩니다" items={['08-21 16:00 MAP Reading']} />
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
    </WideDialog>
  );
}
