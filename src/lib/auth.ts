import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { encryptSyncPassword } from "@/lib/user-secrets";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
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

        const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
        if (!user) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

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
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).role = (user as any).role;
        (token as any).username = (user as any).username;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).role = (token as any).role;
      (session as any).username = (token as any).username;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
