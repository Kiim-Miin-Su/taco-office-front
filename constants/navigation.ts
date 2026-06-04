export const PERMISSIONS = {
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

// 뒤에 :read는 왜 붙인겨?

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]; // (all type of PERMISSIONS)[ALL KEY] = | val1 | val2 | ...

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
  permission: Permission;
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
        permission: PERMISSIONS.dashboardRead,
      },
      {
        id: "attendance",
        label: "Attendance",
        href: "/attendance",
        icon: "attendance",
        permission: PERMISSIONS.attendanceRead,
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
        permission: PERMISSIONS.studentsRead,
      },
      {
        id: "instructors",
        label: "Instructors",
        href: "/instructors",
        icon: "instructors",
        permission: PERMISSIONS.instructorsRead,
      },
      {
        id: "staff",
        label: "Staff",
        href: "/staff",
        icon: "staff",
        permission: PERMISSIONS.staffRead,
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
        permission: PERMISSIONS.roadmapRead,
      },
      {
        id: "classes",
        label: "Classes",
        href: "/classes",
        icon: "classes",
        permission: PERMISSIONS.classesRead,
      },
      {
        id: "schedule",
        label: "Schedule",
        href: "/schedule",
        icon: "schedule",
        permission: PERMISSIONS.scheduleRead,
      },
      {
        id: "homework",
        label: "Homework",
        href: "/homework",
        icon: "homework",
        permission: PERMISSIONS.homeworkRead,
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
        permission: PERMISSIONS.usersManage,
      },
    ],
  },
] as const satisfies readonly NavigationSection[]; // check structure of NavigationSection[]

// Replace this preview fixture with permissions from the authenticated session.
export const DEMO_PERMISSIONS = Object.values(PERMISSIONS) as Permission[]; // array of Permissions value
