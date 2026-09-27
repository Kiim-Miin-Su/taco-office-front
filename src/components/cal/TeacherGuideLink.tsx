/** @file-guide
 * 목적: TeacherGuideLink.tsx — TeacherGuideLink (component)
 * 책임/재사용: 기존 components/ui와 도메인 selector/hook을 재사용한다. 공유 상태는 상위 소유자에 두고 서버 업무 판정을 복제하지 않는다.
 * 검증/작업 지침: docs/contracts/FILE-GUIDE.md · docs/AGENT.md · docs/CLAUDE.md
 */

/**
 * 원문 §11 개인 도구줄 「안내 N」 — N-100 채택(대표 위임 2026-09-26 · W11).
 *
 * N 은 **그 강사에게 보냈는데 강사가 아직 확인하지 않은 안내 수**다(S4 상태 「보냄」). 세는 곳은 서버 한 곳이고
 * 화면은 받은 수를 그리기만 한다(D-R37). 누르면 이미 있는 수업 안내 화면으로 간다 — 새 목적지를 만들지 않는다.
 * 수를 아직 모르면(읽는 중 · 실패) 숫자를 지어내지 않고 「안내」만 적는다.
 */
import { LinkButton } from '../ui';
import { useScheduleTeacherGuides } from '@/api/queries';

export function TeacherGuideLink({ teacherId }: { teacherId: number }) {
  const q = useScheduleTeacherGuides(teacherId);
  const n = q.data?.unconfirmed;
  return (
    <LinkButton size="sm" href="/guides"
      title={n === undefined
        ? '수업 안내로 갑니다'
        : `이 강사에게 보냈는데 아직 확인하지 않은 안내 ${n}건 — 수업 안내로 갑니다`}>
      안내{n === undefined ? '' : ` ${n}`}
    </LinkButton>
  );
}
