"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AppConfirmHost } from "./app-confirm-host";
import { AppToastHost } from "./app-toast-host";
import { FaviconSync } from "./favicon-sync";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <FaviconSync />
      {children}
      <AppToastHost />
      <AppConfirmHost />
    </SessionProvider>
  );
}
