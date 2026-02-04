import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  INTERNAL_JOBS_SECRET: z.string().min(1).optional(),
});

export const env = schema.parse(process.env);
