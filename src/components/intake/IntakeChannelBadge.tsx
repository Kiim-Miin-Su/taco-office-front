/** @file-guide
 * 목적: IntakeChannelBadge.tsx — IntakeChannelBadge (component) · §23·§24 카드 오른쪽 위 · 필터 칩 앞 유입 경로 글자 배지.
 * 책임/재사용: 서버의 유입 경로 키·낱말을 받아 글자 한 자와 색만 정한다. 경로 판정·낱말은 서버(`LeadDto.source`·`sourceLabel`)가 쥔다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원본 §23·§24 카드의 오른쪽 위는 **유입 경로 글자 배지**다(K · T · B · I · R · W · 경로마다 색 · 23-13 · 23-06).
 * 제품은 그 자리에 접수 경과 「N일」을 적고 있었다(원문에 없는 값). 낱말은 서버 것이라 배지의 이름(보조기기 · title)도 서버 낱말이다.
 * 글자는 표시 기호일 뿐 저장값이 아니다 — 모르는 경로는 배지를 세우지 않는다.
 */
import { Chip, type Tone } from '@/components/ui';

const MARK: Readonly<Record<string, { letter: string; tone: Tone }>> = {
  kakao: { letter: 'K', tone: 'warning' },
  phone: { letter: 'T', tone: 'info' },
  blog: { letter: 'B', tone: 'success' },
  instagram: { letter: 'I', tone: 'danger' },
  referral: { letter: 'R', tone: 'purple' },
  walkin: { letter: 'W', tone: 'neutral' },
};

/**
 * `decorative` — 필터 칩 앞(23-06)처럼 **옆에 낱말이 이미 있는** 자리. 배지는 보조기기에서 숨기고(aria-hidden) 칩 이름은 낱말만 읽힌다.
 */
export function IntakeChannelBadge({ source, label, decorative = false }: { source?: string | null; label?: string | null; decorative?: boolean }) {
  const mark = source ? MARK[source] : undefined;
  if (!mark) return null;
  if (decorative) {
    return (
      <span aria-hidden className="shrink-0">
        <Chip tone={mark.tone} styleKind="solid" size="compact">{mark.letter}</Chip>
      </span>
    );
  }
  return (
    <span role="img" aria-label={`유입 경로 ${label ?? ''}`.trim()} title={label ?? undefined} className="shrink-0">
      <Chip tone={mark.tone} styleKind="solid" size="compact">{mark.letter}</Chip>
    </span>
  );
}
