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
