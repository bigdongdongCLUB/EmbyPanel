import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PortalProfileModalClient } from "./profile-modal-client";
import { PortalFrameClient } from "./frame-client";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role ?? "USER";
  const username = (session as any)?.username ?? "user";

  const siteRow = await prisma.appSetting.findUnique({ where: { key: "site_basic" } });
  const site = (siteRow?.valueJson as any) ?? {};
  const siteName = site.siteName || "EmbyPanel";
  const siteLogoDataUrl = site.siteLogoDataUrl ?? null;

  return (
    <>
      <PortalFrameClient username={username} role={role} siteName={siteName} siteLogoDataUrl={siteLogoDataUrl}>
        {children}
      </PortalFrameClient>
      <PortalProfileModalClient />
    </>
  );
}
