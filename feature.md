# SSH 客户端项目需求文档（可直接用于 AI 开发）

## 项目名称

KTerminal

* DevSSH
* TerminalHub
* OpenSSH Manager
* Terminal Gateway

---

# 1. 项目目标

开发一个跨平台 SSH 客户端。

核心理念：

```text
软件负责管理服务器与连接，
真正执行终端操作时调用系统终端或用户配置的终端。
```

与传统 SSH 工具不同：

* 不重点实现 Terminal Emulator
* 而是实现：

  * Server Management
  * SSH Session Management
  * Terminal Launcher
  * Automation

---

# 2. 产品定位

本项目是：

```text
Server Manager + SSH Launcher + Automation Platform
```

目标用户：

* 开发者
* 运维工程师
* DevOps
* SRE
* Linux 用户

---

# 3. 技术栈要求

## 桌面框架

推荐：

* Tauri + Rust + React

原因：

* 小体积
* 原生性能
* 易调用系统终端
* 安全性更高

---

## 前端

### 必须

* React
* TypeScript
* TailwindCSS

### 推荐

* Zustand
* React Query
* shadcn/ui

---

## 后端

### Tauri Backend

* Rust

### SSH

推荐：

* openssh
  或
* russh

---

## 数据库

必须：

* SQLite

ORM：

* Prisma
  或
* Diesel

---

# 4. 核心架构

---

# 4.1 架构设计

```text
+-------------------+
| React UI          |
+-------------------+
         |
         v
+-------------------+
| Tauri Commands    |
+-------------------+
         |
         v
+-------------------+
| Rust Core         |
|                   |
| - SSH Manager     |
| - TerminalManager |
| - ConfigManager   |
| - ScriptManager   |
+-------------------+
         |
         v
+-------------------+
| SQLite            |
+-------------------+
```

---

# 4.2 模块划分

## UI 模块

* Server List
* Server Detail
* Search
* Terminal Profiles
* Settings
* Script Center

---

## Core 模块

### SSHManager

负责：

* SSH 参数生成
* SSH Session 启动
* SSH Config 读取
* Port Forward

---

### TerminalManager

负责：

* 检测系统终端
* 调用终端
* 拼接启动命令
* Terminal Profile

---

### ConfigManager

负责：

* 配置加载
* 配置保存
* 加密

---

### ScriptManager

负责：

* 命令片段
* 批量执行
* 自动化脚本

---

# 5. 功能需求

---

# 5.1 服务器管理

---

## 功能

### 新增服务器

字段：

| 字段                | 类型               |
| ----------------- | ---------------- |
| id                | uuid             |
| name              | string           |
| host              | string           |
| port              | number           |
| username          | string           |
| authType          | password/key     |
| password          | encrypted string |
| privateKeyPath    | string           |
| passphrase        | encrypted string |
| groupId           | uuid             |
| tags              | string[]         |
| description       | text             |
| terminalProfileId | uuid             |
| startupCommand    | text             |
| encoding          | utf8/gbk         |
| createdAt         | datetime         |
| updatedAt         | datetime         |

---

## 支持功能

* 新增
* 编辑
* 删除
* 克隆
* 收藏
* 最近连接

---

# 5.2 分组管理

支持：

* 树形结构
* 拖拽
* 折叠
* 排序

数据结构：

```json
{
  "id": "uuid",
  "name": "Production",
  "parentId": null
}
```

---

# 5.3 搜索

支持：

* 名称搜索
* Host 搜索
* Tag 搜索
* 模糊搜索

快捷键：

```text
Ctrl + K
```

---

# 5.4 SSH 功能

---

## 支持认证

* Password
* Private Key
* SSH Agent

---

## 支持参数

| 功能            | 支持  |
| ------------- | --- |
| Jump Host     | YES |
| KeepAlive     | YES |
| Compression   | YES |
| Agent Forward | YES |
| Port Forward  | YES |

---

## SSH 命令生成

示例：

```bash
ssh user@host -p 22
```

带私钥：

```bash
ssh -i ~/.ssh/id_rsa user@host
```

Jump Host：

```bash
ssh -J jump@jumpHost target@host
```

---

# 5.5 Terminal Manager

这是系统核心。

---

# 5.5.1 Terminal Profile

Terminal Profile 数据结构：

```json
{
  "id": "uuid",
  "name": "PowerShell",
  "platform": "windows",
  "command": "powershell.exe",
  "argsTemplate": [
    "-NoExit",
    "-Command",
    "{{SSH_COMMAND}}"
  ]
}
```

---

# 5.5.2 支持终端

## Windows

支持：

* PowerShell
* Windows Terminal
* CMD
* WezTerm

---

## Linux

支持：

* bash
* zsh
* gnome-terminal
* kitty
* alacritty

---

## macOS

支持：

* Terminal.app
* iTerm2

---

# 5.5.3 终端启动流程

```text
用户点击服务器
    ↓
读取服务器配置
    ↓
生成 SSH 命令
    ↓
读取 Terminal Profile
    ↓
替换模板变量
    ↓
调用系统终端
```

---

# 5.5.4 模板变量

支持：

| 变量              | 说明        |
| --------------- | --------- |
| {{HOST}}        | 主机        |
| {{PORT}}        | 端口        |
| {{USER}}        | 用户        |
| {{SSH_COMMAND}} | 完整 SSH 命令 |

---

# 5.6 SFTP（第二阶段）

支持：

* 上传
* 下载
* 删除
* 重命名
* 拖拽

---

# 5.7 命令片段

数据结构：

```json
{
  "id": "uuid",
  "name": "Restart Nginx",
  "content": "systemctl restart nginx"
}
```

---

# 5.8 批量执行

支持：

* 多服务器执行
* 并发
* 超时
* 失败重试

---

# 5.9 日志系统

记录：

* 登录历史
* 执行历史
* 错误日志

---

# 6. 数据库设计

---

# 6.1 servers

```sql
CREATE TABLE servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT,
  password TEXT,
  private_key_path TEXT,
  passphrase TEXT,
  group_id TEXT,
  description TEXT,
  terminal_profile_id TEXT,
  startup_command TEXT,
  encoding TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

---

# 6.2 groups

```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT
);
```

---

# 6.3 terminal_profiles

```sql
CREATE TABLE terminal_profiles (
  id TEXT PRIMARY KEY,
  name TEXT,
  platform TEXT,
  command TEXT,
  args_template TEXT
);
```

---

# 6.4 scripts

```sql
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  name TEXT,
  content TEXT
);
```

---

# 7. 安全要求

---

# 7.1 密码加密

必须：

* 不允许明文保存密码

推荐：

## Windows

DPAPI

## macOS

Keychain

## Linux

Secret Service

---

# 7.2 主密码

支持：

* 设置 Master Password
* 启动时解锁

---

# 8. UI 需求

---

# 8.1 主界面

布局：

```text
+-----------------------------------+
| Toolbar                           |
+-----------+-----------------------+
| ServerTree| ServerDetail          |
|           |                       |
|           |                       |
+-----------+-----------------------+
```

---

# 8.2 ServerTree

支持：

* 拖拽
* 搜索
* 右键菜单
* 收藏

---

# 8.3 快捷键

| 功能           | 快捷键    |
| ------------ | ------ |
| Quick Search | Ctrl+K |
| New Server   | Ctrl+N |
| Connect      | Enter  |

---

# 9. 配置文件

路径：

## Windows

```text
%APPDATA%/devssh
```

## Linux

```text
~/.config/devssh
```

## macOS

```text
~/Library/Application Support/devssh
```

---

# 10. MVP 范围（第一版）

第一版必须实现：

## 必做

* Server CRUD
* Group CRUD
* Search
* Terminal Profiles
* SSH Command Generator
* Terminal Launch
* SQLite Persistence

---

## 不做

* SFTP
* Docker
* Kubernetes
* 插件系统
* AI 功能

---

# 11. 非功能要求

---

## 性能

* 启动时间 < 2 秒
* 支持 5000+ Server
* 搜索 < 100ms

---

## 跨平台

必须支持：

* Windows
* Linux
* macOS

---

## 离线能力

必须：

* 完全离线可用

---

# 12. 开发阶段

---

# Phase 1

基础功能：

* UI
* SQLite
* Server CRUD
* Terminal Launch

---

# Phase 2

增强：

* SFTP
* Batch Execute
* Script Center

---

# Phase 3

高级：

* Docker
* Kubernetes
* Plugin System

---

# 13. AI 开发要求

生成代码时要求：

---

## 前端

* 使用 TypeScript
* 所有组件必须拆分
* 不允许单文件过大
* 使用 hooks
* 使用 Zustand 管理状态

---

## Rust

* 模块化
* 不允许单文件超过 500 行
* 使用 Result 错误处理
* 使用 serde

---

## 数据库

* 所有 SQL 必须 migration 化
* 不允许动态拼接 SQL

---

# 14. 未来扩展

预留：

* Plugin API
* Cloud Sync
* Team Collaboration
* SSH Gateway
* Web Version
* AI Assistant

---

# 15. 核心差异化

本产品核心：

```text
Terminal Abstraction Layer
```

即：

```text
Server -> SSH Builder -> Terminal Adapter -> Real Terminal
```

而不是：

```text
自己实现 Terminal Emulator
```

这是整个项目最重要的设计理念。
