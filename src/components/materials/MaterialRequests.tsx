/** @file-guide
 * 목적: 최신 수정사항의 일반 강사 자료요청 입력과 관리자 처리 보드를 GPAPACK과 분리해 표현한다.
 * 책임/재사용: Front 초안·상태 어휘·계약 잠금만 소유한다. DTO/API·파일·이력 writer가 생기기 전 서버 성공을 만들지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useEffect, useState } from 'react';
import { Banner, Button, Chip, Input, Label, Panel, Select, Textarea } from '@/components/ui';

type MaterialRequestKind = 'book_pdf' | 'worksheet' | 'test_paper' | 'other';

export interface MaterialRequestStudent {
  id: number;
  label: string;
}

const MATERIAL_REQUEST_KINDS: ReadonlyArray<{ key: MaterialRequestKind; label: string }> = [
  { key: 'book_pdf', label: '교재 PDF' },
  { key: 'worksheet', label: '워크시트' },
  { key: 'test_paper', label: '시험지' },
  { key: 'other', label: '그 밖의 자료' },
];

const MATERIAL_REQUEST_STATES = [
  { key: 'received', label: '접수', tone: 'warning' },
  { key: 'preparing', label: '준비 중', tone: 'info' },
  { key: 'delivered', label: '전달 완료', tone: 'success' },
  { key: 'rejected', label: '반려', tone: 'danger' },
] as const;

/** 강사가 입력하는 일반 자료요청 초안. 현재 계약으로 보낼 수 없으므로 버튼은 항상 잠긴다. */
export function MaterialRequestDraft({
  viewerId,
  students,
  studentsLoading = false,
  studentsUnavailable = false,
}: {
  viewerId: number | null;
  students: readonly MaterialRequestStudent[];
  studentsLoading?: boolean;
  studentsUnavailable?: boolean;
}) {
  const [kind, setKind] = useState<MaterialRequestKind | ''>('');
  const [studentId, setStudentId] = useState('');
  const [neededOn, setNeededOn] = useState('');
  const [body, setBody] = useState('');
  const ready = Boolean(kind && studentId && neededOn && body.trim());
  const rosterBlocked = studentsLoading || studentsUnavailable || students.length === 0;

  // 로그인 사용자가 바뀌면 이전 강사의 화면 초안을 남기지 않는다.
  useEffect(() => {
    setKind('');
    setStudentId('');
    setNeededOn('');
    setBody('');
  }, [viewerId]);

  // 주 이동·담당 변경으로 후보에서 빠진 학생 id를 hidden 값으로 계속 들고 있지 않는다.
  useEffect(() => {
    if (studentId && !students.some((student) => String(student.id) === studentId)) setStudentId('');
  }, [studentId, students]);

  return (
    <div id="material-request" className="mb-4 scroll-mt-4">
      <Panel title="자료 요청" sub="교재 PDF · 워크시트 · 시험지 · 그 밖의 자료를 관리자에게 요청합니다">
        <Banner tone="warning" title="자료요청 저장 기능 연결 전" className="mb-3">
          과거 자료 전달이나 교재 변경 요청으로 보내지 않습니다. 요청 상태·반려 사유·전달 파일·알림·이력이 함께 연결될 때까지 초안만 입력할 수 있습니다.
        </Banner>
        {studentsLoading ? (
          <Banner tone="info" className="mb-3">이번 주 담당 학생을 불러오는 중입니다.</Banner>
        ) : rosterBlocked ? (
          <Banner tone="warning" className="mb-3">전체 담당 학생 선택 기능을 준비 중입니다.</Banner>
        ) : (
          <p className="mb-3 text-[11px] text-fg-subtle">
            현재 주 담당 학생만 초안 후보입니다. 전체 담당 학생 목록은 저장 기능과 함께 연결합니다.
          </p>
        )}
        <form onSubmit={(event) => event.preventDefault()}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="material-request-kind">자료 종류 *</Label>
              <Select id="material-request-kind" required value={kind}
                onChange={(event) => setKind(event.currentTarget.value as MaterialRequestKind | '')}>
                <option value="">선택</option>
                {MATERIAL_REQUEST_KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </Select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="material-request-student">학생 *</Label>
              <Select id="material-request-student" required disabled={rosterBlocked} value={studentId}
                onChange={(event) => setStudentId(event.currentTarget.value)}>
                <option value="">선택</option>
                {students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}
              </Select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="material-request-needed-on">필요한 날 *</Label>
              <Input id="material-request-needed-on" type="date" required value={neededOn}
                onChange={(event) => setNeededOn(event.currentTarget.value)} />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <Label htmlFor="material-request-body" hint={`${body.length} / 2000자`}>요청 내용 *</Label>
              <Textarea id="material-request-body" required maxLength={2000} value={body}
                placeholder="필요한 범위·목적·형식을 적어 주세요."
                onChange={(event) => setBody(event.currentTarget.value)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-fg-subtle">
              {ready ? '초안 입력 완료 · 저장 기능 연결 대기' : '종류·학생·필요일·요청 내용을 입력해 주세요.'}
            </span>
            <Button type="submit" className="ml-auto min-h-11" disabled
              title="자료요청 저장과 처리 흐름이 연결되면 활성화">
              요청 계약 준비 중
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

/** 관리자가 접수→준비→전달/반려를 처리할 보드의 Front 경계. 서버 목록이 없으므로 건수를 꾸미지 않는다. */
export function MaterialRequestBoard() {
  return (
    <Panel title="강사 자료 요청 보드" sub="강사 요청을 접수하고 준비·전달·반려 이력을 관리합니다">
      <div className="mb-3 flex flex-wrap gap-2" aria-label="자료 요청 상태">
        {MATERIAL_REQUEST_STATES.map((state) => (
          <span key={state.key} data-testid="material-request-state">
            <Chip tone={state.tone}>{state.label}</Chip>
          </span>
        ))}
      </div>
      <Banner tone="warning" title="일반 자료요청 목록 준비 중">
        요청자·학생·필요한 날·종류·내용을 읽고, 준비 시작 · 반려 사유 · 전달 파일 · 완료 이력과 승인 대기함 · 강사 들어온 것 알림을 같은 요청에 저장할 기능이 필요합니다.
      </Banner>
      <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-6 text-center text-[12px] text-fg-subtle">
        서버 목록이 연결되기 전에는 요청 건수나 처리 완료 상태를 표시하지 않습니다.
      </p>
    </Panel>
  );
}
