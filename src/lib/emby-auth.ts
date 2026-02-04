import { decryptString } from "@/lib/crypto";

export function getEmbyApiKeyForServer(server: {
  apiKey: string | null;
  apiKeyEnc: string | null;
  apiKeyIv: string | null;
  apiKeyTag: string | null;
}) {
  if (server.apiKeyEnc && server.apiKeyIv && server.apiKeyTag) {
    return decryptString({ enc: server.apiKeyEnc, iv: server.apiKeyIv, tag: server.apiKeyTag });
  }
  return server.apiKey ?? "";
}
