import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalOrderDetailClient } from "./order-detail-client";

export default async function PortalOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const { id } = await params;
  return <PortalOrderDetailClient orderId={id} />;
}
