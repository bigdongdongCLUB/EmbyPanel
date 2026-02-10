import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalClient } from "./portal-client";

export default async function PortalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session as any)?.role;
  if (role === "ADMIN") redirect("/admin");

  return <PortalClient />;
}
