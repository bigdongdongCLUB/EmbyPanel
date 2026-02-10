import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalProfileClient } from "./profile-client";

export default async function PortalProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PortalProfileClient />;
}
