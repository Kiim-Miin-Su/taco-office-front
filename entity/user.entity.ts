export const UserStatus = {
  active: "active",
  inactive: "inactive",
  suspended: "suspended",
} as const;

// TODO: make detail
export type StaffRole = "CEO" | "CFO" | "CTO" | "Staff" | "Instructor";

export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

export const UserRole = {
  admin: "admin",
  staff: "staff",
  student: "student",
  parent: "parent",
  instructor: "instructor",
  guest: "guest",
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export type User = {
  id: number;
  username: string;
  userRole: UserRoleType;
  staffRole?: StaffRole;
  status: UserStatusType;
  email?: string;
  phone?: string;
};

// FIXME: delete after test
export const DemoUser: User = {
  id: 123,
  username: "김사과",
  userRole: UserRole.admin,
  staffRole: "CTO",
  status: UserStatus.active,
} as const;
