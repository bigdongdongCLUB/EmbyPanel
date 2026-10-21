export function hasUnresolvedPlaybackPenalty(
  settings: Array<{ key: string; valueJson: unknown }>, serverId: string, userId: string,
) {
  const state = settings.find((row) => row.key === "anomaly_penalty_state")?.valueJson;
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const entry = (state as Record<string, { penaltyActive?: boolean }>)[`${serverId}:${userId}`];
    if (entry?.penaltyActive) return true;
  }
  const records = settings.find((row) => row.key === "anomaly_penalty_records")?.valueJson;
  // An elapsed timer is not proof of a successful unban. Leave recovery to the unban job.
  return Array.isArray(records) && records.some((record) => record &&
    record.embyServerId === serverId && record.userId === userId &&
    ["PENDING", "FAILED_UNBAN"].includes(record.status));
}
