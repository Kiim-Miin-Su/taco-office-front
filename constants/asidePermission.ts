import { UserRole, UserRoleType } from "@/entity/user.entity";

export const ASIDE_PERMISSIONS = {
  dashboardRead: "dashboard:read",
  attendanceRead: "attendance:read",
  studentsRead: "students:read",
  instructorsRead: "instructors:read",
  staffRead: "staff:read",
  roadmapRead: "roadmap:read",
  classesRead: "classes:read",
  scheduleRead: "schedule:read",
  homeworkRead: "homework:read",
  usersManage: "users:manage",
} as const;

export type AsidePermission =
  (typeof ASIDE_PERMISSIONS)[keyof typeof ASIDE_PERMISSIONS];

const {
  dashboardRead,
  attendanceRead,
  studentsRead,
  instructorsRead,
  staffRead,
  roadmapRead,
  classesRead,
  scheduleRead,
  homeworkRead,
  usersManage,
} = ASIDE_PERMISSIONS; // 구조 분해 할당

export const ROLE_ASIDE_PERMISSIONS = {
  // 객체의 key를 변수/표현식으로 쓸 때 [UserRole.Super] == "super"
  [UserRole.super]: [
    dashboardRead,
    attendanceRead,
    studentsRead,
    instructorsRead,
    staffRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
    usersManage,
  ],
  [UserRole.staff]: [
    dashboardRead,
    attendanceRead,
    studentsRead,
    instructorsRead,
    staffRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
  ],
  [UserRole.instructor]: [
    dashboardRead,
    attendanceRead,
    studentsRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
  ],
  [UserRole.student]: [
    dashboardRead,
    attendanceRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
  ],
  [UserRole.parent]: [
    dashboardRead,
    attendanceRead,
    studentsRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
  ],
  [UserRole.guest]: [dashboardRead, roadmapRead, classesRead, scheduleRead], // TODO: make it when who's guest
} as const satisfies Record<UserRoleType, readonly AsidePermission[]>;

export function getAsidePermissionsByRole(
  role: UserRoleType,
): readonly AsidePermission[] {
  return ROLE_ASIDE_PERMISSIONS[role];
}
