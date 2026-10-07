/** @file-guide
 * 목적: StudentRegistrationForm.test.tsx — BOC-03a 신규 학생 15절 초안과 BOC-03D-03b 재활성화 HTTP 흐름을 회귀한다.
 * 책임/재사용: 실제 화면/useMeta/세션을 사용하고 HTTP adapter만 대역으로 둔다. 실제 DB·브라우저 저장 완료는 별도 증거로 검증한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import type { Me } from '@/api/types';
import { useSession } from '@/store/useSession';
import { StudentRegistrationForm } from './StudentRegistrationForm';

const me: Me = { id: 3, name: '매니저', role: 'manager', roleLabel: '매니저', title: null,
  canAdminPage: true, canCrudAll: true, canSeeProfit: false, canCrudAttendance: false,
  canMoney: false, canWage: false, canApprove: false, canHide: false, canGpaPack: false };
const meta = {
  kinds: [], subs: [], rooms: [], zaccs: [], staff: [], students: [], invTypes: [], cancelReasons: [], cancelTreats: [], lateReportTiers: [], teacherPolicies: [],
  genders: [{ key: 'female', label: '여' }, { key: 'male', label: '남' }],
  educationGrades: [
    { value: 'G5', system: 'US', systemLabel: '미국 Grade', optionLabel: 'G5 (= Y6)', equivalenceHint: '= Y6 · 초5', listLabel: 'G5 · Y6', sort: 5 },
    { value: 'Y6', system: 'GB', systemLabel: '영국 Year', optionLabel: 'Y6 (= G5)', equivalenceHint: '= G5 · 초5', listLabel: 'G5 · Y6', sort: 5 },
  ],
};
const populatedMeta = {
  ...meta,
  staff: [
    { id: 2, name: '김민선', role: 'manager', canAdminPage: true, canGpaPack: true, title: '매니저' },
    { id: 7, name: '박서윤', role: 'teacher', canAdminPage: false, canGpaPack: false, title: null },
  ],
  students: [
    { id: 1, name: '김하린', grade: 'G5', school: 'SIS', gender: 'female', tag: 'G5', label: '김하린 · G5' },
    { id: 2, name: '이도윤', grade: 'G8', school: null, gender: 'male', tag: null, label: '이도윤' },
  ],
};
const registrationOptions = {
  countries: [
    { code: 'KR', label: '대한민국', timezones: [{ timezone: 'Asia/Seoul', label: '한국 표준시', representative: true }] },
    { code: 'US', label: '미국', timezones: [
      { timezone: 'America/New_York', label: '미 동부', representative: true },
      { timezone: 'America/Los_Angeles', label: '미 서부', representative: false },
    ] },
  ],
  educationGrades: [
    { educationSystem: 'KR', code: 'E6', label: '초등학교 6학년', sort: 6 },
    { educationSystem: 'US', code: 'G5', label: 'Grade 5', sort: 5 },
  ],
  guardianRelations: [
    { key: 'mother', label: '어머니' }, { key: 'father', label: '아버지' },
    { key: 'aunt', label: '이모님' }, { key: 'driver', label: '기사님' }, { key: 'other', label: '기타' },
  ],
  sources: [
    { key: 'kakao', label: '카카오' }, { key: 'phone', label: '전화' }, { key: 'blog', label: '블로그' },
    { key: 'instagram', label: '인스타그램' }, { key: 'referral', label: '소개' }, { key: 'walkin', label: '방문' },
  ],
};
const originalAdapter = api.defaults.adapter;
const clients: QueryClient[] = [];
let requests: InternalAxiosRequestConfig[];
let responseMeta: typeof meta | typeof populatedMeta;
let reactivationSaveConflict: boolean;
let consultingSaveFailures: number;
const consultingList = {
  items: [], canSeeAmounts: false, canSetPrivate: false, stages: [], studentCount: 0,
  shares: [
    { key: 'all', label: '전체 공개', meaning: '관리자 누구나 봅니다' },
    { key: 'money_only', label: '수납만 공개', meaning: '금액만 보이고 내용은 숨깁니다' },
    { key: 'picked', label: '지정 공개', meaning: '고른 사람만 봅니다' },
    { key: 'private', label: '전체 비공개', meaning: '담당자와 대표만 봅니다' },
  ],
  types: [{ key: 'admissions', label: '국제학교 지원' }],
  requesters: [{ key: 'mother', label: '어머니' }, { key: 'father', label: '아버지' }],
};
const reactivationCandidates = {
  items: [
    { studentId: 17, name: '김퇴원', englishName: 'Rest', gradeLabel: 'G5', schoolLabel: 'SIS', status: 'withdrawn', reactivatable: true, blockedCode: null, profileVersion: '0', lastConsultationAt: null, withdrawnOn: '2026-10-06' },
    { studentId: 18, name: '이확인', englishName: null, gradeLabel: null, schoolLabel: null, status: 'unknown', reactivatable: false, blockedCode: 'STATUS_UNKNOWN', profileVersion: '0', lastConsultationAt: null, withdrawnOn: null },
  ],
  total: 2, page: 1, pageSize: 10,
};

beforeEach(() => {
  requests = [];
  responseMeta = meta;
  reactivationSaveConflict = false;
  consultingSaveFailures = 0;
  useSession.getState().signIn('student-registration-fixture', me);
  api.defaults.adapter = async config => {
    requests.push(config);
    if (config.url === '/students/options') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: registrationOptions };
    }
    if (config.url === '/students/schools' && config.method === 'get') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: [] };
    }
    if (config.url === '/students/schools' && config.method === 'post') {
      return { config, status: 201, statusText: 'Created', headers: {}, data: { id: 91, name: '새 학교', countryCode: null, countryLabel: null, region: null, campus: null } };
    }
    if (config.url === '/students/preview') {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) as { requestKey: string } : config.data as { requestKey: string };
      return { config, status: 200, statusText: 'OK', headers: {}, data: {
        saved: false, requestKey: body.requestKey, studentId: null, profileVersion: null,
        summary: { schoolPeriods: 0, gradePeriods: 1, residencePeriods: 1, textPeriods: 0, studentContacts: 0, guardians: 1, siblingLinks: 0, assignees: 0 },
      } };
    }
    if (config.url === '/students' && config.method === 'post') {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) as { requestKey: string } : config.data as { requestKey: string };
      responseMeta = {
        ...populatedMeta,
        students: [...populatedMeta.students, {
          id: 101, name: '김신규', grade: 'E6', school: null, gender: 'female', tag: null, label: '김신규',
        }],
      };
      return { config, status: 201, statusText: 'Created', headers: {}, data: {
        saved: true, replayed: false, requestKey: body.requestKey, studentId: 101, profileVersion: '1', createdAt: '2026-10-07T09:00:00.000Z',
        summary: { schoolPeriods: 0, gradePeriods: 1, residencePeriods: 1, textPeriods: 0, studentContacts: 0, guardians: 1, siblingLinks: 0, assignees: 0 },
      } };
    }
    if (config.url === '/consulting' && config.method === 'get') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: consultingList };
    }
    if (config.url === '/consulting' && config.method === 'post') {
      if (consultingSaveFailures > 0) {
        consultingSaveFailures -= 1;
        throw new AxiosError('consulting failed', 'ERR_BAD_REQUEST', config, undefined, {
          config, status: 409, statusText: 'Conflict', headers: {},
          data: { code: 'CONSULTING_CREATE_FAILED', message: '컨설팅 저장에 실패했습니다. 다시 시도해 주세요' },
        });
      }
      return { config, status: 201, statusText: 'Created', headers: {}, data: { id: 301 } };
    }
    if (config.url === '/students/reactivation-candidates') {
      return { config, status: 200, statusText: 'OK', headers: {}, data: reactivationCandidates };
    }
    if (config.url === '/students/17/reactivate/preview') {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) as { requestKey: string } : config.data as { requestKey: string };
      return { config, status: 200, statusText: 'OK', headers: {}, data: {
        saved: false, requestKey: body.requestKey, studentId: 17, profileVersion: '1', consultationId: null,
        effects: { studentCreated: false, enrollmentCreated: false, lessonCreated: false, invoiceCreated: false, bookCreated: false, guideCreated: false, firstLessonTaskCreated: false },
      } };
    }
    if (config.url === '/students/17/reactivate') {
      if (reactivationSaveConflict) {
        throw new AxiosError('conflict', 'ERR_BAD_REQUEST', config, undefined, {
          config, status: 409, statusText: 'Conflict', headers: {},
          data: { code: 'STUDENT_PROFILE_VERSION_CONFLICT', message: '학생 정보가 변경되었습니다. 후보를 다시 조회한 뒤 재시도해 주세요' },
        });
      }
      const body = typeof config.data === 'string' ? JSON.parse(config.data) as { requestKey: string } : config.data as { requestKey: string };
      return { config, status: 201, statusText: 'Created', headers: {}, data: {
        saved: true, requestKey: body.requestKey, studentId: 17, profileVersion: '1', consultationId: 31,
        replayed: false, reactivatedAt: '2026-10-07T09:00:00.000Z',
        effects: { studentCreated: false, enrollmentCreated: false, lessonCreated: false, invoiceCreated: false, bookCreated: false, guideCreated: false, firstLessonTaskCreated: false },
      } };
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data: responseMeta };
  };
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear());
  api.defaults.adapter = originalAdapter; useSession.getState().signOut(); vi.restoreAllMocks();
});
function setup(props: Parameters<typeof StudentRegistrationForm>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<StudentRegistrationForm {...props} />, { wrapper });
}
async function waitForInitialQueries() {
  await waitFor(() => expect(requests.filter(request => request.url === '/meta' || request.url === '/students/options')).toHaveLength(2));
}

describe('BOC-03a 학생 신규 등록 초안', () => {
  it('15절을 원문 순서로 그리고 실제 입력에 배열 경로를 붙인다', async () => {
    const view = setup();
    await waitForInitialQueries();
    expect(requests.map(request => request.url)).toEqual(expect.arrayContaining(['/meta', '/students/options']));
    const headings = view.getAllByRole('heading', { level: 2 }).map(node => node.textContent);
    expect(headings).toEqual([
      '1. 초기 이력', '2. 이름', '3. 성별', '4. 학교', '5. 교육체계와 학년',
      '6. 학생 연락수단', '7. 거주 국가와 시간대', '8. 생년월일', '9. 시민권', '10. 보호자',
      '11. 현금영수증', '12. 형제·자매', '13. 알게 된 경로', '14. 담당자', '15. 기타',
    ]);
    expect(view.getByLabelText('학생 이름').getAttribute('data-field-path')).toBe('name');
    expect(view.getByLabelText('보호자 1 연락처 1 값').getAttribute('data-field-path')).toBe('guardians[0].contacts[0].value');
    const paths = [...view.container.querySelectorAll<HTMLElement>('[data-field-path]')].map(node => node.dataset.fieldPath);
    expect(paths).toHaveLength(29);
    expect(new Set(paths).size).toBe(paths.length);
    expect(view.getByRole('button', { name: '학생 등록' }).hasAttribute('disabled')).toBe(true);
    for (const name of ['입력 검토', '저장 전 미리보기', '학생 등록']) {
      expect(view.getByRole('button', { name }).className).toContain('max-sm:min-h-11');
    }
    expect(view.queryByText(/등록되었습니다/)).toBeNull();
  });

  it('빈 초안을 검토하면 필수 오류를 절별로 보여 주고 쓰기 요청은 만들지 않는다', async () => {
    const view = setup();
    await waitForInitialQueries();
    fireEvent.click(view.getByRole('button', { name: '입력 검토' }));
    expect(view.getByText('학생 이름을 입력해 주세요.')).toBeTruthy();
    expect(view.getByText('성별을 선택해 주세요.')).toBeTruthy();
    expect(view.getByText('교육체계와 학년을 선택해 주세요.')).toBeTruthy();
    expect(view.getByText('거주 국가를 선택해 주세요.')).toBeTruthy();
    expect(view.getByText('보호자 관계를 선택해 주세요.')).toBeTruthy();
    expect(view.getByText('보호자 연락처를 입력해 주세요.')).toBeTruthy();
    expect(requests.filter(request => request.method !== 'get')).toHaveLength(0);
  });

  it('보호자와 연락처를 반복 추가·제거해도 최소 한 행과 index 경로를 유지한다', async () => {
    const view = setup();
    await waitForInitialQueries();
    fireEvent.click(view.getByRole('button', { name: '+ 보호자 추가' }));
    expect(view.getByLabelText('보호자 2 관계').getAttribute('data-field-path')).toBe('guardians[1].relation');
    fireEvent.click(view.getByRole('button', { name: '보호자 1 연락처 추가' }));
    expect(view.getByLabelText('보호자 1 연락처 2 값').getAttribute('data-field-path')).toBe('guardians[0].contacts[1].value');
    expect(view.container.querySelectorAll('[data-field-path]')).toHaveLength(38);
    fireEvent.click(view.getByRole('button', { name: '보호자 1 연락처 2 제거' }));
    expect(view.queryByLabelText('보호자 1 연락처 2 값')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: '보호자 2 제거' }));
    expect(view.queryByLabelText('보호자 2 관계')).toBeNull();
    expect(view.container.querySelectorAll('[data-field-path]')).toHaveLength(29);
    expect(view.getByRole('button', { name: '보호자 1 제거' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByRole('button', { name: '보호자 1 연락처 1 제거' }).hasAttribute('disabled')).toBe(true);
  });

  it('선택 입력인 학생 연락처는 마지막 행도 제거해 다시 0개로 만들 수 있다', async () => {
    const view = setup();
    await waitForInitialQueries();
    fireEvent.click(view.getByRole('button', { name: '+ 학생 연락수단 추가' }));
    const remove = view.getByRole('button', { name: '학생 연락처 1 제거' });
    expect(remove.hasAttribute('disabled')).toBe(false);
    fireEvent.click(remove);
    expect(view.queryByLabelText('학생 연락처 1 값')).toBeNull();
    expect(view.getByRole('button', { name: '+ 학생 연락수단 추가' })).toBeTruthy();
  });

  it('화면 검토와 동일한 requestKey·body로 preview한 뒤 신규 학생을 저장한다', async () => {
    const view = setup();
    await waitForInitialQueries();
    fireEvent.change(view.getByLabelText('학생 이름'), { target: { value: '김신규' } });
    fireEvent.change(view.getByLabelText('성별'), { target: { value: 'female' } });
    fireEvent.change(view.getByLabelText('교육체계'), { target: { value: 'KR' } });
    fireEvent.change(view.getByLabelText('학년'), { target: { value: 'E6' } });
    fireEvent.change(view.container.querySelector('#residence-country')!, { target: { value: 'KR' } });
    fireEvent.change(view.getByLabelText('보호자 1 관계'), { target: { value: 'mother' } });
    fireEvent.change(view.getByLabelText('보호자 1 연락처 1 값'), { target: { value: '010-1111-2222' } });

    fireEvent.click(view.getByRole('button', { name: '저장 전 미리보기' }));
    await waitFor(() => expect(view.getByText(/미리보기 완료/)).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: '학생 등록' }));
    await waitFor(() => expect(view.getByText('김신규 학생을 등록했습니다.')).toBeTruthy());

    const writes = requests.filter(request => request.method === 'post' && request.url !== '/students/schools');
    expect(writes.map(request => request.url)).toEqual(['/students/preview', '/students']);
    const bodies = writes.map(request => typeof request.data === 'string'
      ? JSON.parse(request.data) as Record<string, unknown>
      : request.data as Record<string, unknown>);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toMatchObject({
      entrySource: 'students', leadId: null, name: '김신규', gender: 'female',
      gradeHistory: [{ educationSystem: 'KR', gradeCode: 'E6' }],
      residenceHistory: [{ countryCode: 'KR', timezone: 'Asia/Seoul' }],
      guardians: [{ relation: 'mother', contacts: [{ kind: 'phone', value: '010-1111-2222' }] }],
    });
    expect(typeof bodies[0].requestKey).toBe('string');
  });

  it('학생 등록을 먼저 확정하고 선택 컨설팅 실패 시 같은 초안만 재시도한다', async () => {
    consultingSaveFailures = 1;
    const view = setup();
    await waitForInitialQueries();
    fireEvent.change(view.getByLabelText('학생 이름'), { target: { value: '김신규' } });
    fireEvent.change(view.getByLabelText('성별'), { target: { value: 'female' } });
    fireEvent.change(view.getByLabelText('교육체계'), { target: { value: 'KR' } });
    fireEvent.change(view.getByLabelText('학년'), { target: { value: 'E6' } });
    fireEvent.change(view.container.querySelector('#residence-country')!, { target: { value: 'KR' } });
    fireEvent.change(view.getByLabelText('보호자 1 관계'), { target: { value: 'mother' } });
    fireEvent.change(view.getByLabelText('보호자 1 연락처 1 값'), { target: { value: '010-1111-2222' } });
    fireEvent.click(view.getByRole('button', { name: '저장 전 미리보기' }));
    await waitFor(() => expect(view.getByText(/미리보기 완료/)).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: '학생 등록' }));
    await waitFor(() => expect(view.getByText('김신규 학생을 등록했습니다.')).toBeTruthy());

    fireEvent.click(view.getByRole('button', { name: '이어서 컨설팅 시작' }));
    await waitFor(() => expect(view.getByRole('dialog', { name: '등록 후 컨설팅 시작' })).toBeTruthy());
    await waitFor(() => expect(view.getByRole('button', { name: '김신규', pressed: true })).toBeTruthy());
    fireEvent.change(view.getByLabelText('금액 *'), { target: { value: '800000' } });
    fireEvent.change(view.getByLabelText('회차 *'), { target: { value: '6' } });
    fireEvent.change(view.getByLabelText('종료 *'), { target: { value: '2026-12-31' } });
    fireEvent.click(view.getByRole('button', { name: '시작하기' }));

    await waitFor(() => expect(view.getByText('컨설팅 저장에 실패했습니다. 다시 시도해 주세요')).toBeTruthy());
    expect(view.getByText('김신규 학생을 등록했습니다.')).toBeTruthy();
    expect(view.getByRole('link', { name: '학생 상세 보기' }).getAttribute('href')).toBe('/students/101');
    expect((view.getByLabelText('금액 *') as HTMLInputElement).value).toBe('800000');
    expect((view.getByLabelText('회차 *') as HTMLInputElement).value).toBe('6');
    expect((view.getByLabelText('종료 *') as HTMLInputElement).value).toBe('2026-12-31');

    fireEvent.click(view.getByRole('button', { name: '시작하기' }));
    await waitFor(() => expect(view.getByRole('link', { name: '생성한 컨설팅 보기' })).toBeTruthy());
    expect(view.getByRole('link', { name: '생성한 컨설팅 보기' }).getAttribute('href')).toBe('/consulting?id=301&studentId=101');
    const studentWrites = requests.filter(request => request.method === 'post' && request.url === '/students');
    const consultingWrites = requests.filter(request => request.method === 'post' && request.url === '/consulting');
    expect(studentWrites).toHaveLength(1);
    expect(consultingWrites).toHaveLength(2);
    const consultingBodies = consultingWrites.map(request => typeof request.data === 'string'
      ? JSON.parse(request.data) as Record<string, unknown>
      : request.data as Record<string, unknown>);
    expect(consultingBodies[1]).toEqual(consultingBodies[0]);
    expect(consultingBodies[0]).toMatchObject({ studentIds: [101], amount: 800000, sessions: 6 });
  });

  it('출발 경로를 표시하고 withdrawn 후보만 같은 STU·새 상담으로 preview 뒤 저장하며 신규 입력을 보존한다', async () => {
    const view = setup({ source: 'intake', leadId: 18 });
    await waitForInitialQueries();
    expect(view.getByText('상담 #18에서 시작했습니다.')).toBeTruthy();
    fireEvent.change(view.getByLabelText('학생 이름'), { target: { value: '김학생' } });
    fireEvent.click(view.getByRole('button', { name: '기존 학생 재활성화' }));
    expect(view.queryByText(/현재는 입력 구조와 검증을 준비하는 단계입니다/)).toBeNull();
    expect(view.getByText(/같은 STU ID/)).toBeTruthy();
    expect(view.getByText(/신규 학생·수업·청구·교재·안내·첫 수업 할 일은 만들지 않습니다/)).toBeTruthy();
    await waitFor(() => expect(view.getByRole('button', { name: /김퇴원/ })).toBeTruthy());
    expect(view.getByRole('button', { name: /이확인/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(view.getByRole('button', { name: /김퇴원/ }));
    expect(view.getByRole('button', { name: '재활성화 저장' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(view.getByLabelText('새 상담 내용 *'), { target: { value: '  복귀 상담 완료  ' } });
    fireEvent.click(view.getByRole('button', { name: '저장 전 미리보기' }));
    await waitFor(() => expect(view.getByText(/미리보기 완료/)).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: '재활성화 저장' }));
    await waitFor(() => expect(view.getByRole('status').textContent).toContain('김퇴원 학생을 재활성화했습니다'));
    const writes = requests.filter(request => request.method === 'post');
    expect(writes.map(request => request.url)).toEqual(['/students/17/reactivate/preview', '/students/17/reactivate']);
    const bodies = writes.map(request => typeof request.data === 'string' ? JSON.parse(request.data) as Record<string, unknown> : request.data as Record<string, unknown>);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toMatchObject({ studentId: 17, expectedProfileVersion: '0', entrySource: 'intake', leadId: 18,
      consultation: { channel: 'phone', content: '복귀 상담 완료', nextOn: null } });
    fireEvent.click(view.getByRole('button', { name: '신규 학생' }));
    expect((view.getByLabelText('학생 이름') as HTMLInputElement).value).toBe('김학생');
  });

  it('미래 생일·잘못된 email·복수 주보호자를 검토하되 다른 입력은 보존한다', async () => {
    const view = setup();
    await waitForInitialQueries();
    fireEvent.change(view.getByLabelText('학생 이름'), { target: { value: '김학생' } });
    fireEvent.change(view.getByLabelText('생년월일'), { target: { value: '2999-01-01' } });
    fireEvent.change(view.getByLabelText('보호자 1 관계'), { target: { value: 'mother' } });
    fireEvent.change(view.getByLabelText('보호자 1 연락처 1 종류'), { target: { value: 'email' } });
    fireEvent.change(view.getByLabelText('보호자 1 연락처 1 값'), { target: { value: 'wrong-email' } });
    fireEvent.click(view.getByLabelText('보호자 1 주보호자'));
    fireEvent.click(view.getByRole('button', { name: '+ 보호자 추가' }));
    fireEvent.change(view.getByLabelText('보호자 2 관계'), { target: { value: 'father' } });
    fireEvent.change(view.getByLabelText('보호자 2 연락처 1 값'), { target: { value: '010-2222-3333' } });
    fireEvent.click(view.getByLabelText('보호자 2 주보호자'));
    fireEvent.click(view.getByRole('button', { name: '입력 검토' }));
    expect(view.getByText('생년월일은 오늘보다 늦을 수 없습니다.')).toBeTruthy();
    expect(view.getByText('이메일 형식을 확인해 주세요.')).toBeTruthy();
    expect(view.getByText('주보호자는 한 명만 선택할 수 있습니다.')).toBeTruthy();
    expect((view.getByLabelText('학생 이름') as HTMLInputElement).value).toBe('김학생');
  });

  it('재활성화 409는 성공으로 표시하지 않고 상담 초안을 보존한 채 다시 preview하게 한다', async () => {
    reactivationSaveConflict = true;
    const view = setup();
    fireEvent.click(view.getByRole('button', { name: '기존 학생 재활성화' }));
    await waitFor(() => expect(view.getByRole('button', { name: /김퇴원/ })).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: /김퇴원/ }));
    fireEvent.change(view.getByLabelText('새 상담 내용 *'), { target: { value: '충돌해도 남을 상담 초안' } });
    fireEvent.click(view.getByRole('button', { name: '저장 전 미리보기' }));
    await waitFor(() => expect(view.getByText(/미리보기 완료/)).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: '재활성화 저장' }));
    await waitFor(() => expect(view.getByText('학생 정보가 변경되었습니다. 후보를 다시 조회한 뒤 재시도해 주세요')).toBeTruthy());
    expect((view.getByLabelText('새 상담 내용 *') as HTMLTextAreaElement).value).toBe('충돌해도 남을 상담 초안');
    expect(view.queryByRole('status')).toBeNull();
    expect(view.getByRole('button', { name: '재활성화 저장' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByRole('button', { name: '저장 전 미리보기' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(view.getByRole('button', { name: '검색' }));
    await waitFor(() => expect(requests.filter(request => request.url === '/students/reactivation-candidates')).toHaveLength(2));
    expect(view.queryByLabelText('새 상담 내용 *')).toBeNull();
  });

  it('권한 없는 계정은 폼과 meta 요청을 모두 열지 않는다', async () => {
    useSession.getState().setMe({ ...me, role: 'teacher', canAdminPage: false, canCrudAll: false });
    const view = setup();
    expect(view.getByText('학생 등록을 준비할 권한이 없습니다.')).toBeTruthy();
    expect(view.queryByRole('heading', { name: '2. 이름' })).toBeNull();
    await act(async () => {});
    expect(requests).toHaveLength(0);
  });

  it('기본 레이아웃은 좁은 폭 1열이며 보호자 묶음의 controls가 고정 폭을 강제하지 않는다', async () => {
    const view = setup();
    await waitForInitialQueries();
    const section = view.getByRole('region', { name: '학생 보호자 입력' });
    const grid = within(section).getByTestId('guardian-fields-0');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).not.toMatch(/min-w-\[/);
  });

  it('활성 담당자와 서버 표시 형제를 검색·복수 선택하고 중복 없이 제거한다', async () => {
    responseMeta = populatedMeta;
    const view = setup();
    await waitForInitialQueries();

    fireEvent.change(view.getByLabelText('담당자 검색'), { target: { value: '김' } });
    fireEvent.click(view.getByRole('button', { name: '담당자 김민선 선택' }));
    expect(view.getByText('김민선 · 매니저')).toBeTruthy();
    expect(view.queryByRole('button', { name: '담당자 김민선 선택' })).toBeNull();

    fireEvent.change(view.getByLabelText('형제·자매 검색'), { target: { value: '김하' } });
    fireEvent.click(view.getByRole('button', { name: '형제·자매 김하린 · G5 선택' }));
    expect(view.getByText('김하린 · G5')).toBeTruthy();
    expect(view.queryByRole('button', { name: '형제·자매 김하린 · G5 선택' })).toBeNull();

    fireEvent.click(view.getByRole('button', { name: '담당자 김민선 제거' }));
    fireEvent.click(view.getByRole('button', { name: '형제·자매 김하린 · G5 제거' }));
    expect(view.queryByText('김민선 · 매니저')).toBeNull();
    expect(view.queryByText('김하린 · G5')).toBeNull();
    expect(requests.filter(request => request.method !== 'get')).toHaveLength(0);
  });

  it('학교 기간의 연·월·일 정밀도와 종료 없음을 보존하고 겹침을 숨기지 않는다', async () => {
    const view = setup();
    await waitForInitialQueries();

    fireEvent.change(view.getByLabelText('학교 1 이름'), { target: { value: 'A 학교' } });
    fireEvent.change(view.getByLabelText('학교 1 시작 정밀도'), { target: { value: 'year' } });
    fireEvent.change(view.getByLabelText('학교 1 시작'), { target: { value: '2020' } });
    fireEvent.click(view.getByLabelText('학교 1 종료일 있음'));
    fireEvent.change(view.getByLabelText('학교 1 종료 정밀도'), { target: { value: 'year' } });
    fireEvent.change(view.getByLabelText('학교 1 종료'), { target: { value: '2021' } });
    fireEvent.click(view.getByRole('button', { name: '+ 학교 이력 추가' }));
    fireEvent.change(view.getByLabelText('학교 2 이름'), { target: { value: 'B 학교' } });
    fireEvent.change(view.getByLabelText('학교 2 시작 정밀도'), { target: { value: 'year' } });
    fireEvent.change(view.getByLabelText('학교 2 시작'), { target: { value: '2021' } });
    fireEvent.click(view.getByLabelText('학교 2 종료일 있음'));
    fireEvent.change(view.getByLabelText('학교 2 종료 정밀도'), { target: { value: 'year' } });
    fireEvent.change(view.getByLabelText('학교 2 종료'), { target: { value: '2023' } });
    fireEvent.click(view.getByRole('button', { name: '입력 검토' }));

    expect(view.getByText(/학교 이력 1과 2의 포함 기간이 겹칩니다/)).toBeTruthy();
    expect((view.getByLabelText('학교 1 이름') as HTMLInputElement).value).toBe('A 학교');
    expect((view.getByLabelText('학교 2 이름') as HTMLInputElement).value).toBe('B 학교');
    expect(requests.filter(request => request.method !== 'get')).toHaveLength(0);
  });

  it('종료가 시작보다 앞선 기간은 거절하고 다른 초안을 보존한다', async () => {
    const view = setup();
    await waitForInitialQueries();
    fireEvent.change(view.getByLabelText('학생 이름'), { target: { value: '보존 학생' } });
    fireEvent.change(view.getByLabelText('학교 1 이름'), { target: { value: '기간 학교' } });
    fireEvent.change(view.getByLabelText('학교 1 시작'), { target: { value: '2026-10-10' } });
    fireEvent.click(view.getByLabelText('학교 1 종료일 있음'));
    fireEvent.change(view.getByLabelText('학교 1 종료'), { target: { value: '2026-10-09' } });
    fireEvent.click(view.getByRole('button', { name: '입력 검토' }));
    expect(view.getAllByText('종료일은 시작일보다 앞설 수 없습니다').length).toBeGreaterThan(0);
    expect((view.getByLabelText('학생 이름') as HTMLInputElement).value).toBe('보존 학생');
    expect((view.getByLabelText('학교 1 이름') as HTMLInputElement).value).toBe('기간 학교');
  });

  it('선택지가 비면 빈 상태를 보이고 403이면 권한 상태와 초안 보존을 알린다', async () => {
    const empty = setup();
    await waitForInitialQueries();
    expect(empty.getByText('선택 가능한 담당자가 없습니다.')).toBeTruthy();
    expect(empty.getByText('선택 가능한 형제·자매가 없습니다.')).toBeTruthy();
    empty.unmount();
    clients.splice(0).forEach(client => client.clear());
    requests = [];
    api.defaults.adapter = async config => {
      requests.push(config);
      throw new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, undefined, {
        config, status: 403, statusText: 'Forbidden', headers: {}, data: { code: 'FORBIDDEN', message: 'forbidden' },
      });
    };
    const denied = setup();
    fireEvent.change(denied.getByLabelText('학생 이름'), { target: { value: '권한 오류에도 보존' } });
    await waitFor(() => expect(denied.getByText('등록 선택지를 볼 권한이 없습니다. 작성한 초안은 유지됩니다.')).toBeTruthy());
    expect((denied.getByLabelText('학생 이름') as HTMLInputElement).value).toBe('권한 오류에도 보존');
    expect(requests.filter(request => request.method !== 'get')).toHaveLength(0);
  });
});
