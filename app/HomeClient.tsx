"use client";

import Aside from "@/components/aside/Aside";
import { DEMO_PERMISSIONS } from "@/constants/navigation";

export default function HomeClient() {
  return <Aside permissions={DEMO_PERMISSIONS} />;
}
