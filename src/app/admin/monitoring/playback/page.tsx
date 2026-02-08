import { redirect } from "next/navigation";

export default async function PlaybackStatsPage() {
  redirect("/admin/monitoring");
}
