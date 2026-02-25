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
- 拉取仓库代码
- 生成 `.env`（随机安全密钥）
- 启动 Postgres / Redis / Web / Worker
- 执行 `prisma migrate deploy`

## 2) 一键升级

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/upgrade.sh | bash
```

也可以指定路径：

```bash
APP_DIR=/opt/embypanel BRANCH=main \
  curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/upgrade.sh | bash
```

## 3) 常用运维命令

```bash
cd /opt/embypanel

docker compose ps
docker compose logs -f web
docker compose logs -f worker
```

## 4) 注意事项

- 首次安装后请检查 `/opt/embypanel/.env` 中 `NEXTAUTH_URL` 是否为你的实际访问地址。
- 如需开启 HTTPS，建议在前面加 Nginx/Caddy 反代。
- 数据目录默认在：`/opt/embypanel/data/`
