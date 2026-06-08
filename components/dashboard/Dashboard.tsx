"use client";

import { DashboardItem } from "./types/dashboardType";
import {
  DashboardPermission,
  getDashboardPermissionsByRole,
} from "../../constants/dashboardPermission";
import { User } from "../../entity/user.entity";

type DashboardProps = {
  user: Pick<User, "role" | "username">;
};

export default function Dashboard({ user }: DashboardProps) {
  const permissionSet = new Set<DashboardPermission>( // type
    getDashboardPermissionsByRole(user.role), // permissions[]
  );
  // const visibleOptions = TODO
}
