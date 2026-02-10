import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalEmbyServicesClient } from "./services-client";

export default async function PortalEmbyServicesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PortalEmbyServicesClient />;
}
