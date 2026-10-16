/** @file-guide
 * 목적: §47 주간 묶음의 학부모 전문 — 한 학생 한 주 리포트와 총평을 PNG 한 장·글자로 내보낸다(p7 결정 2026-10-16 「주간 PNG 새로 구현」).
 * 책임/재사용: 일별 §50 과 같은 Dialog·ReportPreview·downloadReportPng·copyReportText를 쓴다. 파일 이름·보낼 본문·칸 이름은 서버 값이다(D-R18 · D-R39).
 *   관리자 코멘트·강사 특이사항은 서버 묶음(WeeklyBundleDto)에 처음부터 없으므로 이 문서에 들어갈 길이 없다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */
'use client';

import { useRef, useState } from 'react';
import type { WeeklyBundle, WeeklyBundleList } from '@/api/types';
import { copyReportText, downloadReportPng, reportTimeLabel } from '@/lib/report-export';
import { Banner, Button, Dialog } from '../ui';
import { ReportPreview, type ReportPreviewBlock } from './ReportForm';

type ExportMessage = { tone: 'success' | 'danger'; text: string };

/**
 * 서버가 보낼 수 있다고 한 묶음(pngFileName · plainText 가 선 묶음)만 연다. 수업 블록은 그 주 리포트를 수업 차례대로,
 * 칸 이름은 서버 `fields`(보낼 본문 reportPlainText 와 같은 표), 끝 칸은 서버 `summaryLabel`(「총평」).
 */
export function WeeklyReportExportDialog({ bundle, list, onClose }: {
  bundle: WeeklyBundle;
  list: Pick<WeeklyBundleList, 'label' | 'fields' | 'summaryLabel'>;
  onClose: () => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'png' | 'copy' | null>(null);
  const [message, setMessage] = useState<ExportMessage | null>(null);
  const fields = list.fields.map(({ key, label }) => ({ key, label }));
  const blocks: ReportPreviewBlock[] = bundle.lessons.map((lesson) => ({
    key: String(lesson.repId), date: lesson.date, subject: lesson.subjectName, timeLabel: reportTimeLabel(lesson),
    teacherName: lesson.teacherName, fields,
    body: { content: lesson.body?.content ?? '', progress: lesson.body?.progress ?? '', homework: lesson.body?.homework ?? '' },
  }));
  const sub = [bundle.studentName, bundle.grade, `${list.label} 수업 ${bundle.lessons.length}건`].filter(Boolean).join(' · ');
  const ready = bundle.pngFileName !== null && bundle.plainText !== null;

  const copyText = async () => {
    if (!bundle.plainText) return;
    setBusy('copy');
    setMessage(null);
    try {
      await copyReportText(bundle.plainText);
      setMessage({ tone: 'success', text: '주간 리포트 본문을 복사했습니다.' });
    } catch {
      setMessage({ tone: 'danger', text: '본문을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  const savePng = async () => {
    if (!node.current || !bundle.pngFileName) return;
    setBusy('png');
    setMessage(null);
    try {
      await downloadReportPng(node.current, bundle.pngFileName);
      setMessage({ tone: 'success', text: `${bundle.pngFileName} 저장을 시작했습니다.` });
    } catch {
      setMessage({ tone: 'danger', text: 'PNG를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={760}
      title={`주간 리포트 전문 — ${bundle.studentName}`}
      sub={sub}
      closeX
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button disabled={busy !== null || !ready} onClick={() => void copyText()}>
              <span aria-hidden>📋</span>글자로 복사
            </Button>
            <Button disabled={busy !== null || !ready} onClick={() => void savePng()}>
              <span aria-hidden>🖼</span>PNG로 저장
            </Button>
          </div>
          <Button onClick={onClose}>닫기</Button>
        </div>
      )}
    >
      <div className="flex max-h-[64vh] flex-col gap-3 overflow-y-auto">
        <ReportPreview ref={node} bare studentName={bundle.studentName} grade={bundle.grade} blocks={blocks}
          closing={bundle.summary ? { label: list.summaryLabel, text: bundle.summary.text } : null} />
        {message ? <Banner tone={message.tone}><span aria-live="polite">{message.text}</span></Banner> : null}
      </div>
    </Dialog>
  );
}
