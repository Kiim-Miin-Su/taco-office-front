import { UserRole } from "../../../entity/user.entity";

import { ASIDE_PERMISSIONS, type AsidePermission } from "../../../constants/asidePermission";

export type NavigationIcon =
  | "dashboard"
  | "attendance"
  | "students"
  | "instructors"
  | "staff"
  | "roadmap"
  | "classes"
  | "schedule"
  | "homework"
  | "users";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: NavigationIcon;
  permission: AsidePermission;
};

export type NavigationSection = {
  id: string;
  label: string;
  items: readonly NavigationItem[];
};

export const NAVIGATION_SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/",
        icon: "dashboard",
        permission: ASIDE_PERMISSIONS.dashboardRead,
      },
      {
        id: "attendance",
        label: "Attendance",
        href: "/attendance",
        icon: "attendance",
        permission: ASIDE_PERMISSIONS.attendanceRead,
      },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      {
        id: "students",
        label: "Students",
        href: "/students",
        icon: "students",
        permission: ASIDE_PERMISSIONS.studentsRead,
      },
      {
        id: "instructors",
        label: "Instructors",
        href: "/instructors",
        icon: "instructors",
        permission: ASIDE_PERMISSIONS.instructorsRead,
      },
      {
        id: "staff",
        label: "Staff",
        href: "/staff",
        icon: "staff",
        permission: ASIDE_PERMISSIONS.staffRead,
      },
    ],
  },
  {
    id: "academic",
    label: "Academic",
    items: [
      {
        id: "roadmap",
        label: "Roadmap",
        href: "/roadmap",
        icon: "roadmap",
        permission: ASIDE_PERMISSIONS.roadmapRead,
      },
      {
        id: "classes",
        label: "Classes",
        href: "/classes",
        icon: "classes",
        permission: ASIDE_PERMISSIONS.classesRead,
      },
      {
        id: "schedule",
        label: "Schedule",
        href: "/schedule",
        icon: "schedule",
        permission: ASIDE_PERMISSIONS.scheduleRead,
      },
      {
        id: "homework",
        label: "Homework",
        href: "/homework",
        icon: "homework",
        permission: ASIDE_PERMISSIONS.homeworkRead,
      },
    ],
  },
  {
    id: "management",
    label: "Management",
    items: [
      {
        id: "users",
        label: "Users",
        href: "/management/users",
        icon: "users",
        permission: ASIDE_PERMISSIONS.usersManage,
      },
    ],
  },
] as const satisfies readonly NavigationSection[]; // check structure of NavigationSection[]

// Replace this preview fixture with permissions from the authenticated session.
export const DEMO_USER = UserRole.super; // FIXME: !delete after dev
