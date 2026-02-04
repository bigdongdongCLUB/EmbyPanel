import { decryptString, encryptString } from "@/lib/crypto";

export function encryptSyncPassword(password: string) {
  return encryptString(password);
}

export function getSyncPassword(user: {
  syncPasswordEnc: string | null;
  syncPasswordIv: string | null;
  syncPasswordTag: string | null;
}) {
  if (!user.syncPasswordEnc || !user.syncPasswordIv || !user.syncPasswordTag) return null;
  return decryptString({ enc: user.syncPasswordEnc, iv: user.syncPasswordIv, tag: user.syncPasswordTag });
}
