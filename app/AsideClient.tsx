"use client";

import Aside from "@/components/aside/Aside";
import { DemoUser } from "@/entity/user.entity";

export default function AsideClient() {
  return <Aside user={DemoUser} />; // FIXME this is a const user
}
