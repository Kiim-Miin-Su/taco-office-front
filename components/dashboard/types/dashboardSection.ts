import { UserRoleType } from "../../../entity/user.entity";
import { DashboardPermission } from '../../../constants/dashboardPermission';

export type DashboardItem = {
  id: string;
  label: string;
  roles: UserRoleType;
  permission: DashboardPermission;
};
