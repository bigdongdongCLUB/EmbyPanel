import { prisma } from "@/lib/db";

export type DocArticle = {
  id: string;
  title: string;
  content: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

const KEY = "docs_articles_v1";

export async function listDocs(): Promise<DocArticle[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const arr = Array.isArray((row?.valueJson as any)?.items) ? ((row?.valueJson as any).items as any[]) : [];
  return arr
    .map((x) => ({
      id: String(x?.id || ""),
      title: String(x?.title || ""),
      content: String(x?.content || ""),
      published: !!x?.published,
      createdAt: String(x?.createdAt || new Date().toISOString()),
      updatedAt: String(x?.updatedAt || new Date().toISOString()),
    }))
    .filter((x) => x.id && x.title)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function saveDocs(items: DocArticle[]) {
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, valueJson: { items } as any },
    update: { valueJson: { items } as any },
  });
}
