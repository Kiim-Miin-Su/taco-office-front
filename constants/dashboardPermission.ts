import { UserRole, UserRoleType } from "@/entity/user.entity";

// TODO: add detail
export const DASHBOARD_PERMISSIONS = {
  introRead: "intro:read",
  attendanceRead: "attendance:read",
  attendanceManage: "attendance:manage",
  memberRead: "member:read",
  memberManage: "member:manage",
  examRead: "exam:read",
  examManage: "exam:manage",
  financeRead: "finance:read",
} as const;

export type DashboardPermission =
  (typeof DASHBOARD_PERMISSIONS)[keyof typeof DASHBOARD_PERMISSIONS];

const {
  introRead,
  attendanceRead,
  attendanceManage,
  memberRead,
  memberManage,
  examRead,
  examManage,
  financeRead,
} = DASHBOARD_PERMISSIONS;

export const ROLE_DASHBOARD_PERMISSIONS = {
  [UserRole.admin]: [
    introRead,
    attendanceRead,
    attendanceManage,
    memberRead,
    memberManage,
    examRead,
    examManage,
    financeRead,
  ],
  [UserRole.staff]: [
    introRead,
    attendanceRead,
    attendanceManage,
    memberRead,
    memberManage,
    examRead,
    examManage,
    // financeRead,
  ],
  [UserRole.instructor]: [
    introRead,
    attendanceRead,
    attendanceManage,
    memberRead,
    // memberManage,
    examRead,
    examManage,
  ],
  [UserRole.student]: [
    introRead,
    attendanceRead,
    // attendanceManage,
    // memberRead,
    // memberManage,
    examRead,
    // examManage,
  ],
  [UserRole.parent]: [
    introRead,
    attendanceRead,
    // attendanceManage,
    // memberRead,
    // memberManage,
    examRead,
    // examManage,
  ],
  [UserRole.guest]: [
    introRead,
    // attendanceRead,
    // attendanceManage,
    // memberRead,
    // memberManage,
    // examRead,
    // examManage,
  ],
} as const satisfies Record<UserRoleType, readonly DashboardPermission[]>

export function getDashboardPermissionsByRole(role: UserRoleType): readonly DashboardPermission[] {
  return ROLE_DASHBOARD_PERMISSIONS[role];
}
