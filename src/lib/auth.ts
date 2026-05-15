import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";
import { clearLoginRiskOnSuccess, getLoginRiskStatus, recordLoginFailure } from "@/lib/login-risk";

const PANEL_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const PANEL_SESSION_MAX_AGE_MS = PANEL_SESSION_MAX_AGE_SECONDS * 1000;

type AuthorizedUser = {
  id: string;
  username: string;
  email?: string;
  name?: string;
  role: string;
};

type PanelToken = {
  userId?: string;
  role?: string;
  username?: string;
  panelLoginAt?: number;
};

type PanelSession = {
  role?: string;
  username?: string;
};

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: PANEL_SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: PANEL_SESSION_MAX_AGE_SECONDS,
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.toString().trim();
        const password = credentials?.password?.toString() ?? "";
        if (!username || !password) return null;

        const risk = await getLoginRiskStatus(username);
        if (risk.locked) return null;

        const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
        if (!user) {
          await recordLoginFailure(username);
          return null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          await recordLoginFailure(username);
          return null;
        }

        await clearLoginRiskOnSuccess(username);

        // Backfill sync password for old users created before this field existed.
        if (!user.syncPasswordEnc || !user.syncPasswordIv || !user.syncPasswordTag) {
          try {
            const enc = encryptSyncPassword(password);
            await prisma.user.update({
              where: { id: user.id },
              data: {
                syncPasswordEnc: enc.enc,
                syncPasswordIv: enc.iv,
                syncPasswordTag: enc.tag,
              },
            });
          } catch {
            // best-effort only
          }
        }

        return {
          id: user.id,
          username: user.username,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          role: user.role,
        } satisfies AuthorizedUser;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const panelToken = token as PanelToken;
      if (user) {
        const authorizedUser = user as AuthorizedUser;
        panelToken.userId = authorizedUser.id;
        panelToken.role = authorizedUser.role;
        panelToken.username = authorizedUser.username;
        panelToken.panelLoginAt = Date.now();
        return token;
      }

      // Existing JWTs created before this rule get a fresh 30-day window from
      // their first validation after deployment, then expire absolutely.
      if (!panelToken.panelLoginAt) {
        panelToken.panelLoginAt = Date.now();
        return token;
      }

      if (Date.now() - Number(panelToken.panelLoginAt) > PANEL_SESSION_MAX_AGE_MS) {
        throw new Error("panel_session_expired");
      }

      if (panelToken.userId || panelToken.username) {
        const dbUser = await prisma.user.findFirst({
          where: panelToken.userId
            ? { id: panelToken.userId }
            : { username: { equals: panelToken.username, mode: "insensitive" } },
          select: { id: true, role: true, username: true, sessionInvalidatedAt: true },
        });

        if (!dbUser) throw new Error("panel_session_invalid");

        panelToken.userId = dbUser.id;
        panelToken.role = dbUser.role;
        panelToken.username = dbUser.username;

        const invalidatedAtMs = dbUser.sessionInvalidatedAt?.getTime() ?? 0;
        if (invalidatedAtMs > Number(panelToken.panelLoginAt)) {
          throw new Error("panel_session_invalidated");
        }
      }

      return token;
    },
    async session({ session, token }) {
      const panelToken = token as PanelToken;
      (session as PanelSession).role = panelToken.role;
      (session as PanelSession).username = panelToken.username;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
