<div align="center">

# EmbyPanel

**🎯 专业的 Emby 管理系统**

基于 Next.js 打造 · 用户门户 + 管理后台双界面架构 · 高效管理订阅、用户与运维流程

<img width="3060" height="1570" alt="ScreenShot_2026-02-26_140841_827" src="https://github.com/user-attachments/assets/d2edef28-0868-4510-8229-62ee292433c0" />

</div>

---

## 🎯 项目说明

**EmbyPanel** 是一个面向 Emby 服务器的专业管理面板系统，用于集中管理订阅、账号、服务器与运营流程。

项目最初基于 [LinkEmby](https://github.com/linkemby/linkemby-deploy) 思路进行重新设计与实现。  
由于原项目更新节奏较慢，部分功能无法满足个人需求，因此借助 AI 从零重构，形成当前版本。

> ⚠️ 仍然推荐优先了解原项目  
> 本项目为个人需求驱动版本，持续迭代中。

---

## 📋 系统要求

- **操作系统**：Linux (Ubuntu 20.04+、Debian 11+、CentOS 8+)
- **内存**：最低 2GB，推荐 4GB+
- **磁盘**：最低 10GB 可用空间

## 🧠 技术架构

- **前端框架**：Next.js
- **数据库**：PostgreSQL
- **缓存系统**：Redis
- **任务调度**：Cron 服务
- **部署方式**：Docker + Docker Compose
- **AI 协助开发**：openclaw（ChatGPT-5.3-codx）

---

## 📞 联系我

| 类型 | 信息 |
|------|------|
| Telegram | https://t.me/bigdongdong |
| TG 群组 | https://t.me/bigdongdongGroup |
| 邮箱 | boss@bigdongdong.com |

> ❗ 本人不提供技术支持  
> 欢迎提交 Issue、功能建议或 BUG 反馈
---

## ✨ 核心功能

<table>
<tr>
<td width="50%" valign="top">

### 🖥️ Emby 服务器管理

- ✅ **多服务器编排** - 集中管理多台 Emby 服务器
- 🔄 **差异对比** - 一键对比服务器用户与系统用户差异
- 📥 **快速导入** - 批量导入 Emby 服务器现有用户
- 💚 **健康监控** - 实时监控服务器运行状态

</td>
<td width="50%" valign="top">

### 📅 订阅管理

- 🎁 **灵活计划** - 支持试用 / 日 / 月 / 季 / 年等多种订阅
- 🌐 **多服务器关联** - 订阅可关联多个 Emby 服务器
- 🤖 **自动化开通** - 购买后自动创建账号、同步密码与权限
- ⏰ **到期管理** - 订阅过期自动禁用所有关联账户

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 👥 用户管理

- 📥 **批量导入** - 支持从CSV表格或Emby服务器批量导入
- ⚡ **批量操作** - 批量删除账号、分配订阅时间
- 🔐 **自助服务** - 用户自助注册、找回密码

</td>
<td width="50%" valign="top">

### 💳 支付管理 （未测试）

- 💰 **易支付集成** - 支持支付宝 / 微信支付
- 📊 **订单追踪** - 完整的订单流转与收入统计
- 🛒 **自助购买** - 用户自助下单、续费

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📧 邮件通知

- ⚙️ **SMTP 配置** - 灵活配置邮件服务器
- ✉️ **账户验证** - 注册、找回密码邮箱验证
- 🔔 **到期提醒** - 自动发送续费与到期通知

</td>
<td width="50%" valign="top">

### 🛠️ 运营工具

- 📚 **监控系统** - 统计监控服务器情况
- 📢 **异常监管** - 对于异常多播用户监管并处罚
- 🎫 **公告系统** - 可发布公告提醒

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🎟️ 卡密系统

- 🎁 **双类型卡密** - 支持余额充值卡与订阅激活卡
- 📦 **批量生成** - 一键批量生成卡密，支持自定义前缀和标签
- 🔐 **安全兑换** - 用户自助兑换，自动验证和激活
- 📈 **使用统计** - 实时追踪卡密使用情况和兑换历史

</td>
<td width="50%" valign="top">

### 🎬 点播功能

- 🔍 **TMDB 集成** - 对接 TMDB API，海量影视资源检索
- 📺 **影视点播** - 支持电影和电视剧点播请求
- 🎯 **新入库显示** - 用户首页显示新入库内容
- 🔄 **状态追踪** - 完整的审批流程和状态管理

</td>
</tr>
</table>

</details>

---

## 🚀 快速开始

### 一键安装/升级

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/install.sh | bash
```
<details>
<summary>📋 安装脚本将自动完成以下操作（点击展开）</summary>

- ✅ 检测系统环境（Docker、Docker Compose）
- ✅ 下载所需的配置文件
- ✅ 交互式配置访问 URL、端口等参数
- ✅ 拉取 Docker 镜像
- ✅ 启动所有服务

</details>

### 卸载

运行卸载脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/uninstall.sh | bash
```
<details>
<summary>📋 卸载选项说明（点击展开）</summary>

卸载脚本提供三种卸载选项：

1. **仅停止服务** - 保留所有数据和配置文件
2. **停止服务并删除数据** - 删除数据库、Redis 等数据，但保留配置文件
3. **完全卸载** - 删除所有文件、数据和缓存

> 💡 卸载脚本会自动从缓存读取安装目录，无需手动指定

</details>

---

## 📦 包含的服务

| 服务           | 说明             | 默认端口 |
| ------------ | -------------- | ---- |
| **Embypanel** | 主应用程序          | 3000 |
| **postgres** | PostgreSQL 数据库 | 5432 |
| **redis**    | Redis 缓存       | 6379 |
| **cron**     | 定时任务服务         | -    |

---


## 🔒 安全建议

1. 使用 HTTPS：在生产环境中通过反向代理（Nginx / Caddy）配置 SSL
2. 防火墙配置：只开放必要端口（如 80、443）
3. 定期备份：设置自动备份任务
4. 更新镜像：定期运行升级脚本获取最新安全补丁

---

## ⚠️ 使用声明

- Embypanel 仅用于合法管理自有或经授权的 Emby 服务器账户。
- 本项目不包含任何媒体资源，也不提供盗版内容或第三方资源获取渠道。
- 部署与使用者需遵守所在地法律法规，严禁将本项目用于任何违法或侵权行为。
