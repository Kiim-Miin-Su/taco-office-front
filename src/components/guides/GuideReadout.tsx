/** @file-guide
 * 목적: 안내 본문과 작성·발송·확인 시각을 관리자/수신 화면에서 같은 읽기 표시로 재사용한다.
 * 책임/재사용: Guide의 좁은 표시 필드만 받는다. 교재·진단·권한·선택·쓰기·쿼리는 호출자가 소유한다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

import type { Guide } from '@/api/types';

export function GuideBody({ body }: Pick<Guide, 'body'>) {
  return (
    <div className="mt-3 rounded-lg bg-inset p-3">
      <div className="text-[11px] font-bold text-fg-subtle">안내 본문</div>
      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg">
        {body ?? '작성된 안내가 없습니다.'}
      </p>
    </div>
  );
}

type Timeline = Pick<Guide,
  'createdAt' | 'createdByName' | 'sentAt' | 'sentByName' | 'acknowledgedAt' | 'acknowledgedByName' | 'acknowledgedAfterSeconds'>;

export function GuideTimeline({ guide }: { guide: Timeline }) {
  return (
    <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
      <span>
        작성 {guide.createdAt.slice(0, 16).replace('T', ' ')}
        {guide.createdByName ? ` · ${guide.createdByName}` : ''}
      </span>
      <span>
        발송 {guide.sentAt ? guide.sentAt.slice(0, 16).replace('T', ' ') : '—'}
        {guide.sentByName ? ` · ${guide.sentByName}` : ''}
      </span>
      <span>
        강사 확인 {guide.acknowledgedAt ? guide.acknowledgedAt.slice(0, 16).replace('T', ' ') : '—'}
        {guide.acknowledgedByName ? ` · ${guide.acknowledgedByName}` : ''}
      </span>
      <span>
        확인 소요 <b>{guide.acknowledgedAfterSeconds !== null
          ? `${Math.floor(guide.acknowledgedAfterSeconds / 60)}분 ${guide.acknowledgedAfterSeconds % 60}초` : '—'}</b>
      </span>
    </footer>
  );
}
