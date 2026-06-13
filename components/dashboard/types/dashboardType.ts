import { UserRoleType } from "../../../entity/user.entity";
import { DashboardPermission } from "../../../constants/dashboardPermission";

export type DashboardOptions = "";

export type DashboardItem = {
  id: string;
  label: string;
  permission: DashboardPermission;
};

export type DashboardItems = {
  id: string;
  label: string;
  roles: UserRoleType;
  options: DashboardPermission[];
  items: readonly DashboardItem[];
};

export const DASHBOARD_SECTIONS = [{}];
