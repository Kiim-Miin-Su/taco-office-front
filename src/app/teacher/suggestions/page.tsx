/** @file-guide
 * 목적: page.tsx — TeacherSuggestionsPage (route)
 * 책임/재사용: 기존 셸/도메인 컴포넌트를 조립하고 화면 선택·초안만 소유한다. API DTO는 생성 타입, 서버 데이터는 Query 캐시를 사용한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 건의 사항 — 강사 덱 §33~34 · Figma 「건의 사항 · 작성 가능/월 한도 소진」(8075:48321·8075:48161).
 * 분류 4종은 D-11, 상태 3종은 D-12 확정값. **월 3회 쿼터는 서버가 센다** — 화면은
 * canPost 플래그와 SUGGESTION_QUOTA_EXCEEDED 코드를 소비만 한다 (등록은 낙관 갱신 없음).
 */
'use client';
import { useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { RequireAuth } from '@/components/shell/RequireAuth';
import { ApiError } from '@/api/client';
import { Button, Chip, PageHeader, Panel, QueryState, type Tone } from '@/components/ui';
import { useCreateTeacherSuggestion, useTeacherSuggestions } from '@/api/queries';
import type { TeacherSuggestion, TeacherSuggestionCreate } from '@/api/types';
import { md } from '@/components/teacher/format';

/** D-11 분류 4종 — 라벨·부제는 덱 §33 그대로 */
const CATS = [
  { key: 'lesson', label: '수업 관련', sub: '교재 · 진행 · 학생' },
  { key: 'pay', label: '시급 관련', sub: '정산 · 보강' },
  { key: 'schedule', label: '스케줄 관련', sub: '시간 · 요일 · 이동' },
  { key: 'etc', label: '기타', sub: '그 밖의 이야기' },
] as const;
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.key, c.label]));

/** D-12 상태 3종 — 표기만, 판정은 서버 값 */
const STATE: Record<string, { label: string; tone: Tone } | undefined> = {
  open: { label: '접수됨', tone: 'info' },
  reviewing: { label: '확인 중', tone: 'warning' },
  done: { label: '답변 완료', tone: 'success' },
};

function SuggestionCard({ s }: { s: TeacherSuggestion }) {
  const st = STATE[s.state];
  return (
    <li className="border-b border-line py-4 first:pt-1 last:border-b-0">
      <div className="flex items-center gap-2">
        <Chip size="compact" tone="neutral">{CAT_LABEL[s.category] ?? s.category}</Chip>
        <span className="text-[12px] text-fg-subtle">{md(s.createdOn)}</span>
        {st ? <span className="ml-auto"><Chip size="compact" tone={st.tone}>{st.label}</Chip></span> : null}
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-fg">{s.body}</p>
      {s.reply ? (
        <div className="mt-3 rounded-lg border border-green/40 bg-green/5 px-3 py-2.5">
          <div className="text-[11.5px] font-bold text-fg-subtle">
            관리자 {s.replyBy ?? ''}{s.replyOn ? ` · ${md(s.replyOn)}` : ''}
          </div>
          <p className="mt-1 text-[13px] font-bold leading-relaxed text-fg">{s.reply}</p>
        </div>
      ) : null}
    </li>
  );
}

export default function TeacherSuggestionsPage() {
  const q = useTeacherSuggestions();
  const create = useCreateTeacherSuggestion();
  const [category, setCategory] = useState<TeacherSuggestionCreate['category'] | null>(null);
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  const submit = (canPost: boolean) => {
    if (!canPost || !category || !body.trim() || create.isPending) return;
    setNotice(null);
    create.mutate(
      { category, body: body.trim() },
      {
        onSuccess: () => {
          setCategory(null); setBody('');
          setNotice({ tone: 'success', text: '건의를 접수했습니다. 관리자가 확인 후 답변드립니다.' });
        },
        onError: (e) => {
          // 규약: 산발 try/catch 대신 서버 오류 코드로 분기 — 쿼터는 서버 판정이 정본
          if (e instanceof ApiError && e.code === 'SUGGESTION_QUOTA_EXCEEDED') {
            setNotice({ tone: 'danger', text: e.message });
          } else {
            setNotice({ tone: 'danger', text: e instanceof ApiError ? e.message : '등록하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' });
          }
        },
      },
    );
  };

  return (
    <RequireAuth>
      <AppShell>
        <QueryState query={q} isEmpty={() => false}>
          {(d) => {
            const spent = !d.canPost;
            return (
              <>
                <PageHeader title="건의 사항" sub={`${Number(d.yearMonth.slice(5, 7))}월 사용 ${d.used}/${d.limit} · 내가 보낸 건의 ${d.items.length}건`} />
                <div className="mt-3 flex flex-col gap-4 lg:flex-row">
                  <div className="w-full shrink-0 lg:w-[480px]">
                    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${spent ? 'border-red/50 bg-red/5' : 'border-line bg-inset'}`}>
                      <b className={`text-[20px] leading-none ${spent ? 'text-red' : 'text-fg'}`}>{d.used}<span className="text-[12px] text-fg-subtle">/{d.limit}</span></b>
                      <div className="min-w-0 grow">
                        <div className="text-[13px] font-bold text-fg">{Number(d.yearMonth.slice(5, 7))}월 건의 사용</div>
                        <div className="text-[12px] text-fg-subtle">
                          {spent ? '이번 달 한도를 모두 사용했습니다. 다음 달에 다시 남길 수 있습니다.' : `이번 달 ${d.remaining}회 더 남길 수 있습니다.`}
                        </div>
                      </div>
                      <div className="flex gap-1" aria-hidden>
                        {Array.from({ length: d.limit }, (_, i) => (
                          <span key={i} className={`h-2 w-6 rounded-full ${i < d.used ? 'bg-primary' : 'bg-line'}`} />
                        ))}
                      </div>
                    </div>

                    <Panel className="mt-4" title="건의 사항 남기기" sub="분류를 고르고 편하게 적어 주세요. 관리자가 확인 후 답변드립니다.">
                      <div className="text-[12px] font-bold text-fg">어떤 이야기인가요</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {CATS.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            disabled={spent}
                            onClick={() => setCategory(c.key)}
                            aria-pressed={category === c.key}
                            className={`rounded-lg border px-3 py-2.5 text-left disabled:opacity-50 ${category === c.key ? 'border-primary bg-primary/5' : 'border-line bg-card'}`}
                          >
                            <div className="text-[13px] font-bold text-fg">{c.label}</div>
                            <div className="mt-0.5 text-[11px] text-fg-subtle">{c.sub}</div>
                          </button>
                        ))}
                      </div>
                      <label className="mt-3 block text-[12px] font-bold text-fg" htmlFor="sg-body">내용</label>
                      <textarea
                        id="sg-body"
                        value={body}
                        disabled={spent}
                        onChange={(e) => setBody(e.target.value)}
                        maxLength={2000}
                        rows={5}
                        placeholder="예) 목요일 수업을 한 시간 앞당길 수 있을지 여쭙고 싶습니다."
                        className="mt-1.5 w-full resize-y rounded-lg border border-line bg-card px-3 py-2.5 text-[13px] text-fg placeholder:text-fg-subtle disabled:opacity-50"
                      />
                      {notice ? (
                        <p className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] font-bold ${notice.tone === 'success' ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`} role="status">
                          {notice.text}
                        </p>
                      ) : null}
                      <Button
                        className="mt-3 w-full"
                        variant="primary"
                        disabled={spent || !category || !body.trim() || create.isPending}
                        onClick={() => submit(d.canPost)}
                      >
                        {create.isPending ? '보내는 중…' : spent ? '이번 달 한도를 모두 사용했습니다' : '건의 사항 보내기'}
                      </Button>
                      <p className="mt-3 text-[11px] leading-relaxed text-fg-subtle">
                        시급·정산 관련 문의는 관리자만 확인하며 다른 강사에게 공개되지 않습니다.
                        급한 일은 건의 사항 대신 관리자에게 직접 연락 주세요.
                      </p>
                    </Panel>
                  </div>

                  <div className="min-w-0 grow">
                    <Panel title={`내가 보낸 건의 · ${d.items.length}건`}>
                      {d.items.length === 0
                        ? <p className="px-1 py-6 text-center text-[13px] text-fg-subtle">아직 보낸 건의가 없습니다.</p>
                        : <ul>{d.items.map((s) => <SuggestionCard key={s.id} s={s} />)}</ul>}
                    </Panel>
                  </div>
                </div>
              </>
            );
          }}
        </QueryState>
      </AppShell>
    </RequireAuth>
  );
}
