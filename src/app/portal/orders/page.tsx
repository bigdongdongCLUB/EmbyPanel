import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalOrdersClient } from "./orders-client";

export default async function PortalOrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PortalOrdersClient />;
}
