import { PortalDocDetailClient } from "./portal-doc-detail-client";

export default async function PortalDocDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PortalDocDetailClient id={id} />;
}
