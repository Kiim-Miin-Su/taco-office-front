export const UserStatus = {
  active: "active",
  inactive: "inactive",
  suspended: "suspended",
} as const;

export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

export const UserRole = {
  super: "super",
  staff: "staff",
  student: "student",
  parent: "parent",
  instructor: "instructor",
  guest: "guest",
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export interface User {
  id: number;
  username: string;
  role: UserRoleType;
  status: UserStatusType;
  email?: string;
  phone?: string;
}

// FIXME: delete after test
export const DemoUser: User = {
  id: 123,
  username: "김사과",
  role: UserRole.super,
  status: UserStatus.active,
};
