import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalPurchaseClient } from "./purchase-client";

export default async function PortalPurchasePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <PortalPurchaseClient />;
}
