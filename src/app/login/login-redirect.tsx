"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LoginRedirect() {
  const { status, data } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    const role = (data as any)?.role;
    router.replace(role === "ADMIN" ? "/admin" : "/portal");
    router.refresh();
  }, [status, data, router]);

  return null;
}
