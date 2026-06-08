export const DASHBOARD_PERMISSIONS = {
  attendanceRead: "attendance:read",
  attendanceManage: "attendance:manage",
  memberRead: "member:read",
  memberManage: "member:manage",
  examRead: "exam:read",
  financeRead: "finance:read",
} as const;

export type DashboardPermission =
  (typeof DASHBOARD_PERMISSIONS)[keyof typeof DASHBOARD_PERMISSIONS];
