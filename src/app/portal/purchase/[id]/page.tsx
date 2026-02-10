import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalPurchaseDetailClient } from "./purchase-detail-client";

export default async function PortalPurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;
  return <PortalPurchaseDetailClient planId={id} />;
}
