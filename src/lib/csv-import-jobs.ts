import { randomUUID } from "crypto";
import { runAdminCsvImport, type CsvImportProgress, type CsvImportResult } from "@/lib/admin-csv-import";

type JobStatus = "running" | "done" | "failed";

export type CsvImportJob = {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  progress: CsvImportProgress;
  logs: string[];
  result?: CsvImportResult;
  error?: string;
};

const jobs = new Map<string, CsvImportJob>();

export function getCsvImportJob(id: string) {
  return jobs.get(id) ?? null;
}

export function startCsvImportJob(input: { csv: string; fallbackPlanId?: string | null }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const job: CsvImportJob = {
    id,
    status: "running",
    createdAt: now,
    updatedAt: now,
    progress: { total: 0, processed: 0, success: 0, skipped: 0, failed: 0, message: "任务已创建" },
    logs: [],
  };
  jobs.set(id, job);

  void runAdminCsvImport(input, (p) => {
    const current = jobs.get(id);
    if (!current) return;
    current.progress = p;
    current.updatedAt = new Date().toISOString();
    if (p.message) {
      current.logs.push(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${p.message}`);
      if (current.logs.length > 300) current.logs = current.logs.slice(-300);
    }
  })
    .then((result) => {
      const current = jobs.get(id);
      if (!current) return;
      current.status = "done";
      current.result = result;
      current.updatedAt = new Date().toISOString();
    })
    .catch((e: any) => {
      const current = jobs.get(id);
      if (!current) return;
      current.status = "failed";
      current.error = e?.message ?? String(e);
      current.updatedAt = new Date().toISOString();
      current.logs.push(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 任务失败：${current.error}`);
    });

  return id;
}
