import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { PortalProfileModalClient } from "./profile-modal-client";
import { PortalFrameClient } from "./frame-client";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session as any)?.role ?? "USER";
  const username = (session as any)?.username ?? "user";

  return (
    <>
      <PortalFrameClient username={username} role={role}>
        {children}
      </PortalFrameClient>
      <PortalProfileModalClient />
    </>
  );
}
