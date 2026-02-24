"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AppConfirmHost } from "./app-confirm-host";
import { AppToastHost } from "./app-toast-host";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <AppToastHost />
      <AppConfirmHost />
    </SessionProvider>
  );
}
