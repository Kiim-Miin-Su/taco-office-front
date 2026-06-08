import {
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Map,
  Presentation,
  Users,
  type LucideIcon,
} from "lucide-react";

import { NavigationIcon } from "@/components/aside/types/navigationSection";

export const MenuIcons: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  attendance: CalendarCheck2,
  students: GraduationCap,
  instructors: Presentation,
  staff: BriefcaseBusiness,
  roadmap: Map,
  classes: BookOpen,
  schedule: CalendarDays,
  homework: ClipboardList,
  users: Users,
};
