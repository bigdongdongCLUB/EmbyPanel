import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminFrameClient } from "./frame-client";
import pkg from "../../../package.json";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role;
  if (role !== "ADMIN") redirect("/portal");

  const username = (session as any)?.username ?? (session as any)?.user?.name ?? "admin";

  const row = await prisma.appSetting.findUnique({ where: { key: "site_basic" } });
  const value = (row?.valueJson as any) ?? {};
  const siteName = value.siteName || "EmbyPanel";
  const siteLogoDataUrl = value.siteLogoDataUrl ?? null;

  const appVersion = `v${pkg.version}`;

  return (
    <AdminFrameClient username={username} siteName={siteName} siteLogoDataUrl={siteLogoDataUrl} appVersion={appVersion}>
      {children}
    </AdminFrameClient>
  );
}
