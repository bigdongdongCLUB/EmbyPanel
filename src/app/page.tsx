import Link from "next/link";

export default function HomePage() {
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold">EmbyPanel</h1>
      <p className="text-gray-600 mt-2">MVP: 用户门户 + 管理后台（开发中）</p>

      <div className="mt-6 space-y-2">
        <Link className="underline" href="/login">
          登录
        </Link>
        <div>
          <Link className="underline" href="/admin">
            管理后台
          </Link>
          <span className="text-sm text-gray-500">（需要 ADMIN 权限；后续加）</span>
        </div>
      </div>
    </main>
  );
}
