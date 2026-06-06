export enum UserRole {
  Super = "super",
  Staff = "staff",
  Student = "student",
  Parent = "parent",
  Instructor = "instructor",
}

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
  [UserRole.Super]: [
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
  [UserRole.Staff]: [
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
  [UserRole.Instructor]: [
    dashboardRead,
    attendanceRead,
    studentsRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
  ],
  [UserRole.Student]: [
    dashboardRead,
    attendanceRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
  ],
  [UserRole.Parent]: [
    dashboardRead,
    attendanceRead,
    studentsRead,
    roadmapRead,
    classesRead,
    scheduleRead,
    homeworkRead,
  ],
} as const satisfies Record<UserRole, readonly AsidePermission[]>;

export function getAsidePermissionsByRole(role: UserRole) {
  return ROLE_ASIDE_PERMISSIONS[role];
}
