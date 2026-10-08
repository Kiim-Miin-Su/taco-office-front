/** @file-guide
 * 목적: §38의 여섯 통계·강사 요청·교재 배정 준비·진도 회수 입력이 최신 화면 계약과 연결되는지 검증한다.
 * 책임/재사용: 실제 컴포넌트와 Query hook을 쓰고 HTTP 어댑터만 fixture로 바꾼다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { BookTracking } from './BookTracking';

const me = {
  id: 2,
  name: '김민수',
  role: 'admin',
  roleLabel: '관리자',
  title: '관리자',
  canAdminPage: true,
  canCrudAll: true,
  canSeeProfit: false,
  canCrudAttendance: true,
  canMoney: false,
  canWage: true,
  canApprove: true,
  canHide: false,
  canGpaPack: true,
} satisfies Me;
const original = api.defaults.adapter;
let mutation: { url?: string; body?: unknown } = {};
afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
  useSession.getState().signOut();
  mutation = {};
});

/** 배정 창의 진단 한 줄 fixture — 학생 3 은 진단이 있고, 그 밖의 학생은 없다 */
const DIAG = {
  id: 1, leadId: 8, english: 32, math: null, interview: 58, takenOn: '2026-08-20', level: 'foundation', levelLabel: 'Foundation',
  byId: 2, byName: '김민수', at: '2026-08-20T10:00:00+09:00',
};

function setup({
  withoutIssuedBooks = false,
  withReissueCandidate = false,
  componentProps,
}: {
  withoutIssuedBooks?: boolean;
  withReissueCandidate?: boolean;
  componentProps?: ComponentProps<typeof BookTracking>;
} = {}) {
  useSession.getState().signIn('fixture', me);
  api.defaults.adapter = (async (config: { url?: string; method?: string; data?: string }) => {
    const diag = /^\/books\/students\/(\d+)\/latest-diag$/.exec(config.url ?? '');
    if (config.method === 'get' && diag) {
      const studentId = Number(diag[1]);
      return { config, status: 200, statusText: 'OK', headers: {}, data: { studentId, diag: studentId === 3 ? DIAG : null } };
    }
    if (config.method !== 'get') {
      mutation = { url: config.url, body: JSON.parse(config.data ?? '{}') };
      return {
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { id: 10, libId: 4, studentId: 3, state: 'ok', stateLabel: '배부 완료' },
      };
    }
    const data =
      config.url === '/books/tracking'
        ? {
            students: [
              {
                id: 3,
                name: '고은성',
                grade: 'G12',
                teacherName: '김재훈',
                nextLesson: '2026-09-14 16:00',
                todoLabel: '확인 필요',
                todos: withoutIssuedBooks ? [] : [
                  { key: 'guide_missing', label: '안내 없음', count: 1 },
                  { key: 'teacher_request', label: '강사 요청', count: 1 },
                ],
                issues: withoutIssuedBooks ? [] : [
                  {
                    id: 10,
                    version: 1,
                    libId: 4,
                    studentId: 3,
                    state: 'ok',
                    stateLabel: '배부 완료',
                    progressPage: 20,
                    progressPercent: 20,
                    progressHistory: [{
                      id: 90, repId: 77, lessonOn: '2026-09-13', progressFromPage: 16, progressToPage: 20,
                      homeworkFromPage: 21, homeworkToPage: 24, homeworkAmount: '짝수 문제', repVersion: 1,
                    }],
                  },
                  {
                    id: 12,
                    version: 1,
                    libId: 5,
                    studentId: 3,
                    state: 'ok',
                    stateLabel: '배부 완료',
                    progressPage: 60,
                    progressPercent: 75,
                    progressHistory: [],
                  },
                  { id: 11, version: 1, libId: 4, studentId: 3, state: 'wait', stateLabel: '승인 대기', edition: 'v1', form: 'print', formLabel: '실물 책', progressHistory: [] },
                ],
                reissueCandidates: withReissueCandidate ? [{
                  id: 30, version: 1, libId: 6, studentId: 3, state: 'canceled', stateLabel: '취소',
                  endedReason: '학부모 요청', endedBy: 2, endedByName: '김민수', endedAt: '2026-09-27T01:00:00.000Z',
                  progressHistory: [],
                }] : [],
              },
            ],
            books: withoutIssuedBooks ? [] : [
              {
                libId: 4,
                title: 'SAT Reading',
                level: 'Master',
                studentCount: 1,
                minPercent: 20,
                maxPercent: 20,
                averagePercent: 20,
                pages: 100,
                stalledCount: 1,
                homeworkPages28d: 4,
                students: [{
                  studentId: 3, name: '고은성', progressPage: 20, percent: 20, elapsedDays: 1,
                  lastProgressOn: '2026-09-13', stalledDays: 15, stalled: true, homeworkPages28d: 4,
                }],
              },
            ],
            states: ['학생', '승인 대기', '전달 대기', '수업 임박', '강사 요청', '정상'].map((label, index) => ({
              key: String(index),
              label,
              count: index === 4 ? 1 : 0,
            })),
            teacherRequests: [{ id: 7, requesterName: '김재훈', studentName: '고은성', message: '다 풀었습니다' }],
            issueForms: [{ key: 'pdf', label: 'PDF' }, { key: 'print', label: '실물 책' }],
          }
        : config.url === '/books/assignment-options'
          ? {
              contexts: [
                { teacherId: 7, teacherName: '김재훈', subKey: 'reading', subName: 'Reading', studentId: 3, studentName: '고은성', grade: 'G12' },
                { teacherId: 7, teacherName: '김재훈', subKey: 'reading', subName: 'Reading', studentId: 9, studentName: '한지우', grade: 'G5' },
                { teacherId: 7, teacherName: '김재훈', subKey: 'math', subName: 'Math', studentId: 3, studentName: '고은성', grade: 'G12' },
                { teacherId: 2, teacherName: '김민수', subKey: 'reading', subName: 'Reading', studentId: 3, studentName: '고은성', grade: 'G12' },
              ],
            }
        : config.url === '/books'
          ? {
              items: [
                { id: 4, versId: 104, edition: 'v1', code: 'SAT', title: 'SAT Reading', subKey: 'reading', bookLevel: 'master', level: 'Master', levelLabel: 'Master', gradeFrom: 9, gradeTo: 12, pages: 100, hasNewer: false, hasFile: true, issueCount: 1 },
                { id: 7, versId: 107, edition: 'v1', code: 'READ-F', title: 'Reading Foundation', subKey: 'reading', bookLevel: 'foundation', level: 'Foundation', levelLabel: 'Foundation', gradeFrom: 9, gradeTo: 12, pages: 96, hasNewer: false, hasFile: true, issueCount: 0 },
                { id: 5, versId: 105, edition: 'v1', code: 'WR', title: 'Writing', subKey: 'writing', bookLevel: 'foundation', gradeFrom: 4, gradeTo: 8, pages: 80, hasNewer: false, hasFile: true, issueCount: 1 },
                { id: 6, versId: 106, edition: 'v1', code: 'MATH', title: 'Math Practice', subKey: 'math', bookLevel: 'practice', gradeFrom: 9, gradeTo: 12, pages: 120, hasNewer: false, hasFile: true, issueCount: 1 },
              ],
              bySub: {},
              newerCount: 0,
              noFileCount: 0,
              levels: [],
              grades: [],
            }
          : {
              kinds: [],
              subs: [
                { key: 'reading', name: 'Reading', color: '#315efb' },
                { key: 'writing', name: 'Writing', color: '#16a34a' },
                { key: 'math', name: 'Math', color: '#f97316' },
              ],
              rooms: [],
              zaccs: [],
              invTypes: [],
              staff: [
                { id: 7, name: '김재훈', role: 'teacher', canAdminPage: false, canGpaPack: false },
                { id: 2, name: '김민수', role: 'admin', canAdminPage: true, canGpaPack: true },
              ],
              students: [
                { id: 3, name: '고은성', grade: 'G12', label: '고은성 · G12' },
                { id: 9, name: '한지우', grade: 'G5', label: '한지우 · G5' },
              ],
            };
    return { config, status: 200, statusText: 'OK', headers: {}, data };
  }) as never;
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <BookTracking {...componentProps} />
    </QueryClientProvider>,
  );
}

it('학생 허브 배부 deep link는 meta의 정확한 학생을 미리 고르고 복귀 경로를 보존한다', async () => {
  const view = setup({ componentProps: { createRequest: 1, requestedStudentId: 9, targetRequested: true } });
  await view.findByText('교재 배정 준비');
  expect((view.getByLabelText('학생') as HTMLSelectElement).value).toBe('9');
  expect(view.getByRole('link', { name: '학생 허브로 돌아가기' }).getAttribute('href')).toBe('/students/9?tab=books');
});

it('학생 허브 배부 deep link의 학생이 없으면 첫 학생을 고르거나 생성 폼을 열지 않는다', async () => {
  const view = setup({ componentProps: { createRequest: 1, requestedStudentId: 999, targetRequested: true } });
  await view.findByText(/요청한 학생을 찾을 수 없습니다/);
  expect(view.queryByText('교재 배정 준비')).toBeNull();
  expect(view.queryByRole('button', { name: '저장 준비 중' })).toBeNull();
  expect(view.getByRole('link', { name: '학생 목록으로 돌아가기' }).getAttribute('href')).toBe('/students');
  expect(mutation).toEqual({});
});

it('학생 허브의 교재 트래킹 링크는 exact 학생 행만 펼친다', async () => {
  const view = setup({ componentProps: { requestedStudentId: 3, targetRequested: true } });
  const toggle = await view.findByRole('button', { name: '고은성 접기' });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(view.queryByText('교재 배부')).toBeNull();
});

it('원본 여섯 통계와 DB 강사 요청을 표시한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getAllByText('강사 요청').length).toBeGreaterThanOrEqual(1));
  expect(view.getByText('고은성 다 풀었습니다')).toBeTruthy();
  expect(view.getAllByText('SAT Reading').length).toBeGreaterThanOrEqual(2);
});

it('안내 미발송 학생을 먼저 알리고 학년 묶음과 exact 안내 이동을 제공한다', async () => {
  const view = setup({ componentProps: { view: 'tracking' } });
  expect(await view.findByText(/교재 안내가 안 나간 학생 1명/)).toBeTruthy();
  expect(view.getAllByText('G12').length).toBeGreaterThanOrEqual(2);
  fireEvent.click(view.getByRole('button', { name: '고은성 자세히 펼치기' }));
  expect(view.getByRole('link', { name: '교재 안내 보내기' }).getAttribute('href'))
    .toBe('/guides?tab=students&studentId=3');
});

it('학생은 있지만 배부 교재가 0종이면 빈 진도율 격자 대신 맥락 있는 안내를 표시한다 (P-156)', async () => {
  const view = setup({ withoutIssuedBooks: true });
  expect(await view.findByText('학생에게 배부된 교재가 없어 진도율을 표시할 수 없습니다.')).toBeTruthy();
  expect(view.queryByTestId('book-progress-card')).toBeNull();
});

it('진행도 보기는 리포트 원장의 진도·14일 정체·최근 28일 숙제를 같은 값으로 표시한다', async () => {
  const view = setup({ componentProps: { view: 'progress' } });
  expect(await view.findByRole('heading', { name: /교재별 진행도/ })).toBeTruthy();
  expect(view.getByText(/숙제는 최근 28일의 쪽 범위를 합산합니다/)).toBeTruthy();
  expect(view.getByTestId('book-progress-card')).toBeTruthy();
  expect(view.getByText('2주 멈춤 1명')).toBeTruthy();
  expect(view.getByText('최근 28일 숙제 4쪽')).toBeTruthy();
  expect(view.getByText('15일 멈춤')).toBeTruthy();
  expect(view.queryByRole('button', { name: '고은성 펼치기' })).toBeNull();
  expect(view.queryByText('강사 교재 변경 요청 1건')).toBeNull();
});

it('트래킹 상세는 리포트에 저장한 진도·숙제 쪽 범위와 분량을 그대로 표시한다', async () => {
  const view = setup({ componentProps: { view: 'tracking' } });
  fireEvent.click(await view.findByRole('button', { name: '고은성 펼치기' }));
  expect(view.getByLabelText('고은성 SAT Reading 진행 이력')).toBeTruthy();
  expect(view.getByText(/2026-09-13 · 진도 p.16–20 · 숙제 p.21–24 · 짝수 문제/)).toBeTruthy();
});

it('트래킹 보기는 학생·배부 업무만 표시하고 진행도 카드를 중복하지 않는다', async () => {
  const view = setup({ componentProps: { view: 'tracking' } });
  expect(await view.findByRole('button', { name: '고은성 펼치기' })).toBeTruthy();
  expect(view.getByText('강사 교재 변경 요청 1건')).toBeTruthy();
  expect(view.queryByRole('heading', { name: /교재별 진행도/ })).toBeNull();
  expect(view.queryByTestId('book-progress-card')).toBeNull();
});

it('진도 입력은 페이지 숫자만 DTO로 보내고 퍼센트는 보내지 않는다', async () => {
  const view = setup();
  await waitFor(() => view.getByRole('button', { name: '고은성 펼치기' }));
  const toggle = view.getByRole('button', { name: '고은성 펼치기' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(view.getByRole('button', { name: '고은성 접기' }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.change(view.getByLabelText('고은성 SAT Reading 진도 쪽수'), { target: { value: '55' } });
  fireEvent.click(view.getByRole('button', { name: '고은성 SAT Reading 진도 저장' }));
  await waitFor(() => expect(mutation.url).toBe('/books/issues/10/progress'));
  expect(mutation.body).toEqual({ progressPage: 55, expectedVersion: 1 });
});

it('승인 대기는 공용 전이 hook으로 auto 상태만 보낸다', async () => {
  const view = setup();
  await waitFor(() => view.getByRole('button', { name: '고은성 펼치기' }));
  fireEvent.click(view.getByRole('button', { name: '고은성 펼치기' }));
  fireEvent.click(view.getByRole('button', { name: '고은성 SAT Reading 승인' }));
  await waitFor(() => expect(mutation.url).toBe('/books/issues/11/state'));
  expect(mutation.body).toEqual({ state: 'auto', expectedVersion: 1 });
});

it('승인·전달 대기는 사유가 있어야 취소·반려하고 종료 사유를 같이 보낸다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '고은성 펼치기' }));
  const reject = view.getByRole('button', { name: '고은성 SAT Reading 반려' });
  expect((reject as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('고은성 SAT Reading 종료 사유'), { target: { value: '  교재 재선정  ' } });
  expect((reject as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(reject);
  await waitFor(() => expect(mutation.url).toBe('/books/issues/11/state'));
  expect(mutation.body).toEqual({ state: 'rejected', reason: '교재 재선정', expectedVersion: 1 });
});

it('종료된 교재의 재배정은 학생·교재를 고정하고 같은 수업 문맥과 계보를 새 writer에 보낸다', async () => {
  const view = setup({ withReissueCandidate: true });
  fireEvent.click(await view.findByRole('button', { name: '고은성 펼치기' }));
  expect(view.getByText('학부모 요청 · 김민수')).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: '고은성 Math Practice 재배부' }));
  expect(view.getByText('교재 재배정 준비')).toBeTruthy();
  await view.findByRole('option', { name: '김재훈' });
  expect((view.getByLabelText('학생') as HTMLSelectElement).disabled).toBe(true);
  expect((view.getByLabelText('교재') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('강사'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'math' } });
  expect((view.getByLabelText('교재') as HTMLSelectElement).value).toBe('6');
  const submit = view.getByRole('button', { name: '배정 요청' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(mutation.url).toBe('/books/assignments'));
  expect(mutation.body).toMatchObject({ libId: 6, versId: 106, studentId: 3, teacherId: 7, subKey: 'math', reissuedFrom: 30 });
  expect((mutation.body as { requestKey: string }).requestKey).toMatch(/^[0-9a-f-]{36}$/);
});

it('학생 한 줄의 진도는 각 교재와 짝지어 표시한다', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('75%')).toBeTruthy());
  expect(view.getAllByTitle('SAT Reading')[0].textContent).toContain('20%');
  expect(view.getByTitle('Writing').textContent).toContain('75%');
});

/**
 * §38-3 · §38-4 · §38-5 — 레벨 글자 사각은 §39 서가와 같은 색(M 초록 · P 주황 · F 빨강 — 공용 bookLevelPresentation),
 * 열 이름은 「진도」(교재 이름을 다시 적지 않는다), 다음 수업 둘째 줄은 시각이 아니라 날짜.
 */
it('레벨 사각은 서가와 같은 색이고, 열 이름은 「진도」, 다음 수업 둘째 줄은 날짜다 (§38)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('75%')).toBeTruthy());
  const marker = view.getAllByText('M').find((el) => el.getAttribute('data-level-marker') !== null)!;
  expect(marker.className).toContain('bg-green');
  expect(view.getByText('진도')).toBeTruthy();
  expect(view.queryByText('교재별 진도')).toBeNull();
  expect(view.getByText('09-14')).toBeTruthy();
});

/** §38-6 — 머리 여섯 칸 색 윗줄(검정 · 호박 · 청록 · 빨강 · 보라 · 초록), 0 인 칸 흐림, 「정상」 초록 채움 */
it('머리 칸은 자리별 색 윗줄이고 0 인 칸은 흐리며 「정상」은 초록 채움이다 (§38-6)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getAllByText('전달 대기').length).toBeGreaterThanOrEqual(1));
  const headBox = (label: string) => view.getAllByText(label)
    .map((el) => el.parentElement as HTMLElement)
    .find((box) => box.className.includes('border-t-[3px]'))!;
  expect(headBox('전달 대기').className).toContain('border-t-teal/40');
  expect(headBox('강사 요청').className).toContain('border-t-violet');
  expect(headBox('강사 요청').className).not.toContain('border-t-violet/40');
  expect(headBox('정상').className).toContain('bg-green/10');
  expect(headBox('정상').className).toContain('border-t-green');
  expect(headBox('정상').className).not.toContain('border-t-green/40');
});

/**
 * g4 §38-7 — 원문 「교재별 진도율」 카드: 제목줄 = 레벨 배지 + 제목 + 오른쪽 「1명」, 막대 오른쪽 큰 %,
 * 막대 위 평균 표시선, 레벨색 왼쪽 띠, 넓은 화면 3열. 수는 서버 값 그대로(평균·범위·학생별).
 */
it('교재별 진도율 카드는 레벨 배지 · 오른쪽 인원 · 큰 % · 평균 표시선 · 레벨색 띠다 (§38-7)', async () => {
  const view = setup();
  const card = await view.findByTestId('book-progress-card');
  expect(card.className).toContain('border-l-4');
  expect(card.className).toContain('border-l-green');
  const head = card.querySelector('header') as HTMLElement;
  expect(head.querySelector('[data-level-marker]')?.textContent).toBe('M');
  expect(head.textContent).toContain('SAT Reading');
  expect(head.textContent).toContain('1명');
  expect(card.querySelector('[data-progress-average]')?.textContent).toBe('20%');
  expect((card.querySelector('[data-average-mark]') as HTMLElement).style.left).toBe('20%');
  expect(card.parentElement?.className).toContain('xl:grid-cols-3');
});

it('최신 배정 창은 실제 수업의 강사·과목을 먼저 고르고 학생 학년·현재 판까지 새 writer에 보낸다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 배정' }));
  expect(view.getByText('교재 배정 준비')).toBeTruthy();
  await view.findByRole('option', { name: '김재훈' });
  expect(view.queryByLabelText('초기 상태')).toBeNull();
  expect((view.getByLabelText('학생') as HTMLSelectElement).disabled).toBe(true);
  fireEvent.change(view.getByLabelText('강사'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'reading' } });
  expect((view.getByLabelText('학생') as HTMLSelectElement).disabled).toBe(false);
  expect(view.queryByTestId('issue-diag')).toBeNull();
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '3' } });
  await waitFor(() => expect(view.getByTestId('issue-diag').textContent).toContain('영어 32 · 수학 — · 인터뷰 58 · 레벨 Foundation · 2026-08-20 진단고사'));
  expect([...(view.getByLabelText('교재') as HTMLSelectElement).options].map((option) => option.textContent))
    .toEqual(['선택', '기초 · Reading Foundation', '심화 · SAT Reading']);
  fireEvent.change(view.getByLabelText('교재'), { target: { value: '4' } });
  const submit = view.getByRole('button', { name: '배정 요청' }) as HTMLButtonElement;
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(mutation.url).toBe('/books/assignments'));
  expect(mutation.body).toMatchObject({ libId: 4, versId: 104, studentId: 3, teacherId: 7, subKey: 'reading' });
  expect((mutation.body as { requestKey: string }).requestKey).toMatch(/^[0-9a-f-]{36}$/);
});

it('진단이 없는 학생은 없다고 적고 학년·과목에 맞는 교재가 없으면 선택지를 열지 않는다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 배정' }));
  await view.findByRole('option', { name: '김재훈' });
  fireEvent.change(view.getByLabelText('강사'), { target: { value: '7' } });
  fireEvent.change(view.getByLabelText('과목'), { target: { value: 'reading' } });
  fireEvent.change(view.getByLabelText('학생'), { target: { value: '9' } });
  await waitFor(() => expect(view.getByTestId('issue-diag').textContent).toContain('상담 진단 기록이 없습니다'));
  expect(view.getByText('G5과 이 과목에 맞는 교재가 없습니다.')).toBeTruthy();
  expect([...(view.getByLabelText('교재') as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(['선택']);
  expect(mutation).toEqual({});
});

/**
 * 7-3 §38-2(W11 A' · 리드 채택) — 교재 칸 아래 형태 칩 「PDF」 · 「실물 책」은 배부 줄의 것이다.
 * 승인 대기 요청 줄에도 서고(컷 이유찬 · 이하린), 낱말은 서버 formLabel · 배부 창 선택지는 서버 issueForms 그대로.
 */
it('형태 칩은 서버 낱말 그대로 승인 대기 요청 줄에 서고 최신 배정 창 선택지도 유지한다 (§38-2)', async () => {
  const view = setup();
  await waitFor(() => expect(view.getByText('75%')).toBeTruthy());
  const chip = view.container.querySelector('[data-issue-form]') as HTMLElement;
  expect(chip.textContent).toBe('실물 책');
  expect((chip.firstElementChild as HTMLElement).className).toContain('bg-orange');
  // 형태를 안 고른 배부 줄에는 칩이 없다
  expect(view.container.querySelectorAll('[data-issue-form]').length).toBe(1);
  fireEvent.click(view.getByRole('button', { name: '+ 배정' }));
  expect([...(view.getByLabelText('형태') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['—', 'PDF', '실물 책']);
  fireEvent.change(view.getByLabelText('형태'), { target: { value: 'pdf' } });
  expect((view.getByRole('button', { name: '배정 요청' }) as HTMLButtonElement).disabled).toBe(true);
  expect(mutation).toEqual({});
});

it('최신 배정 창은 상태·배부일·초기 진도 입력을 제거하고 실제 수업 문맥 writer만 안내한다', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '+ 배정' }));
  expect(view.queryByLabelText('초기 상태')).toBeNull();
  expect(view.queryByLabelText('배부일')).toBeNull();
  expect(view.queryByLabelText('초기 진도 쪽수')).toBeNull();
  expect(view.getByText(/실제 수업의 강사·과목·학생 조합만/)).toBeTruthy();
  expect((view.getByRole('button', { name: '배정 요청' }) as HTMLButtonElement).disabled).toBe(true);
  expect(mutation).toEqual({});
});

it('회수는 사용자가 고른 회수일을 기존 return 계약으로 보낸다 (E-55)', async () => {
  const view = setup();
  fireEvent.click(await view.findByRole('button', { name: '고은성 펼치기' }));
  fireEvent.change(view.getByLabelText('고은성 SAT Reading 회수일'), { target: { value: '2026-09-21' } });
  fireEvent.click(view.getByRole('button', { name: '고은성 SAT Reading 회수' }));
  await waitFor(() => expect(mutation.url).toBe('/books/issues/10/return'));
  expect(mutation.body).toEqual({ returnedOn: '2026-09-21', expectedVersion: 1 });
});
