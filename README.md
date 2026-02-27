<div align="center">

# 🚀 EmbyPanel

### 专业级 Emby 订阅与运维管理系统

基于 **Next.js** 构建 · 双界面架构（用户门户 + 管理后台）  
自动化账号开通 · 多服务器编排 · 完整订阅与运营体系

<img width="3060" height="1570" alt="ScreenShot" src="https://github.com/user-attachments/assets/d2edef28-0868-4510-8229-62ee292433c0" />

</div>

---

# 📌 项目简介

**EmbyPanel** 是一个面向 Emby 服务器的专业管理面板系统，  
用于集中管理订阅、账号、服务器与运营流程。

项目最初基于 [LinkEmby](https://github.com/linkemby/linkemby-deploy) 思路进行重新设计与实现。  
由于原项目更新节奏较慢，部分功能无法满足个人需求，因此借助 AI 从零重构，形成当前版本。

> ⚠️ 仍然推荐优先了解原项目  
> 本项目为个人需求驱动版本，持续迭代中。

---

# 🧠 技术架构

- **前端框架**：Next.js
- **数据库**：PostgreSQL
- **缓存系统**：Redis
- **任务调度**：Cron 服务
- **部署方式**：Docker + Docker Compose
- **AI 协助开发**：openclaw（ChatGPT-5.3-codx）

架构设计目标：

- 模块解耦
- 自动化流程
- 高可扩展
- 面向 SaaS 场景设计

---

# ✨ 核心功能

## 🖥 Emby 服务器管理

- 多服务器集中管理
- 服务器用户与系统用户差异对比
- 一键批量导入 Emby 现有用户
- 实时健康监控与状态检测

---

## 📅 订阅管理系统

- 支持试用 / 日 / 月 / 季 / 年等订阅模型
- 支持一个订阅关联多个 Emby 服务器
- 自动创建账号 + 权限同步
- 订阅到期自动禁用账户
- 支持续费、升级、延长时间

---

## 👥 用户管理

- CSV 批量导入
- 批量删除账号
- 批量分配订阅
- 用户自助注册
- 找回密码系统
- 统一权限控制

---

## 🎟 卡密系统

- 支持余额充值卡
- 支持订阅激活卡
- 批量生成卡密（自定义前缀 / 标签）
- 自动验证与兑换
- 使用记录与统计追踪

---

## 🎬 点播系统

- 集成 TMDB API
- 支持电影 / 剧集点播
- 审批流程管理
- 首页展示新入库内容
- 状态流转追踪

---

## 💳 支付系统（测试阶段）

- 易支付接口集成（支付宝 / 微信）
- 订单流转管理
- 自动开通订阅
- 收入统计功能

---

## 📧 邮件通知系统

- SMTP 自定义配置
- 注册验证邮件
- 找回密码邮件
- 到期提醒通知

---

## 🛠 运营工具

- 服务器运行状态监控
- 异常用户监管
- 公告系统
- 基础数据统计

---

# 🚀 快速开始

## 一键安装 / 升级

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/install.sh | bash
```

安装脚本自动完成：

- 检测系统环境（Docker / Compose）
- 下载配置文件
- 交互式配置访问参数
- 拉取镜像
- 启动全部服务

---

## 卸载

```bash
curl -fsSL https://raw.githubusercontent.com/bigdongdongCLUB/EmbyPanel/main/scripts/uninstall.sh | bash
```

支持三种卸载模式：

1. 仅停止服务（保留数据）
2. 删除数据但保留配置文件
3. 完全卸载（删除所有文件与缓存）

---

# 📦 服务组件

| 服务 | 说明 | 默认端口 |
|------|------|----------|
| Embypanel | 主应用程序 | 3000 |
| PostgreSQL | 数据库 | 5432 |
| Redis | 缓存 | 6379 |
| Cron | 定时任务服务 | - |

---

# 🖥 系统要求

- Ubuntu 20.04+
- Debian 11+
- CentOS 8+
- 最低 2GB 内存（推荐 4GB+）
- 至少 10GB 可用磁盘空间

---

# 🔒 安全建议

- 生产环境请使用 HTTPS（Nginx / Caddy 反向代理）
- 仅开放必要端口（如 80 / 443）
- 定期备份数据库
- 定期更新镜像获取安全补丁

---

# ⚠️ 合规声明

- 本项目仅用于合法管理自有或授权 Emby 服务器账户
- 不包含任何媒体资源
- 严禁用于非法传播或侵权行为
- 使用者需自行承担法律责任

---

# 📞 联系方式

| 类型 | 信息 |
|------|------|
| Telegram | https://t.me/bigdongdong |
| TG 群组 | https://t.me/bigdongdongGroup |
| 邮箱 | boss@bigdongdong.com |

> ❗ 本人不提供技术支持  
> 欢迎提交 Issue、功能建议或 BUG 反馈

---

# ⭐ 项目定位

EmbyPanel 目标是成为：

> 面向 Emby 运维与订阅管理的专业自动化控制台系统

如果你有更好的想法或希望一起优化架构，欢迎交流。
