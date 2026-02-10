"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AppToastHost } from "./app-toast-host";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <AppToastHost />
    </SessionProvider>
  );
}
