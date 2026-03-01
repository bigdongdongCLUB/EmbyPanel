# EmbyPanel 一键部署（Linux/VPS）

> 推荐：Ubuntu 22.04+ / Debian 12+ / CentOS Stream 9+

## 1) 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/install.sh | bash
```

可选参数（通过环境变量传入）：

```bash
APP_DIR=/opt/embypanel BRANCH=main APP_URL=http://你的域名或IP:3000 \
  curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/install.sh | bash
```

安装脚本会自动：
- 安装 Docker / Compose（若未安装）
- 拉取仓库代码（已安装则走升级流程）
- 交互询问安装目录、Web/PostgreSQL/Redis 端口、NEXTAUTH_URL（回车沿用默认/旧配置）
- 生成或更新 `.env`（升级保留已有密钥）
- 启动 Postgres / Redis / Web / Worker
- 执行 `prisma migrate deploy`
- 写入安装缓存：`/var/lib/embypanel-installer/install.env`

## 2) 一键升级

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/upgrade.sh | bash
```

也可以指定路径：

```bash
APP_DIR=/opt/embypanel BRANCH=main \
  curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/upgrade.sh | bash
```

## 3) 一键卸载（中文询问式）

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/uninstall.sh | bash
```

卸载脚本会自动从安装缓存读取安装目录（无需手动输入目录），并提供 3 种模式：
- 仅停止服务（保留数据和配置）
- 停止服务并删除数据（删除数据库/Redis 数据，保留配置）
- 完全卸载（删除全部文件、数据和缓存）

## 4) 常用运维命令

```bash
cd /opt/embypanel

docker compose ps
docker compose logs -f web
docker compose logs -f worker
```

## 5) 注意事项

- 首次安装后请检查 `/opt/embypanel/.env` 中 `NEXTAUTH_URL` 是否为你的实际访问地址。
- 如需开启 HTTPS，建议在前面加 Nginx/Caddy 反代。
- 数据目录默认在：`/opt/embypanel/data/`
- 文档图片上传目录：`/opt/embypanel/data/uploads`（安装脚本会自动创建并设置权限）。

## 6) Nginx 必配：/uploads 静态映射（避免文档图片 404）

如果你使用 Nginx 反向代理，请在站点 `server {}` 中加入以下配置：

```nginx
location /uploads/ {
    alias /opt/embypanel/data/uploads/;
    access_log off;
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
    try_files $uri =404;
}
```

说明：
- 文档编辑器上传图片后会生成 `/uploads/docs/...` 路径；
- 未配置该映射时，图片请求会被转发到 Next 路由，可能返回 404。

## 7) 快速排查（上传成功但图片不显示）

```bash
cd /opt/embypanel

# 文件是否落盘
ls -l ./data/uploads/docs/$(date +%Y)/$(date +%m)

# Nginx 静态映射是否生效（替换为实际文件）
curl -I https://你的域名/uploads/docs/2026/03/xxx.png
```

期望结果：HTTP 200，`Content-Type: image/*`。
