# Coordination MCP

Coordination MCP 是一个面向多个 AI 参与者的轻量级共享工作状态服务。它通过 MCP 提供持久化的 `Ticket`、不可变 `Update` 和文本型 `Artifact`，让 ChatGPT、local AI 和 coding agent 在同一个 `Scope` 中共享可检索的工作上下文。

## V0.1 能做什么

- `Ticket`：保存一项工作的当前状态，可更新 `title`、`status`、`artifact_ids` 和 `meta`。
- `Update`：保存已经发生的事实、发现、决定或结果，按 `Scope` 分配单调递增的 `seq`。
- `Artifact`：保存不可变的共享文本内容，例如 Markdown、日志或长文档。
- 所有对象由服务端分配全局唯一 ID。
- `Ticket` 和 `Artifact` 的引用必须属于同一个 `Scope`。

V0.1 不包含 authentication、workflow engine、queue acknowledgement、relationship graph、wake-up notification 和 binary artifact 支持。

## 快速开始

要求：Node.js 24+。

```bash
cd /path/to/coordination-mcp
npm install
npm run build
node dist/main.js
```

服务默认监听：

```text
http://127.0.0.1:3000/mcp
```

也可以直接运行开发版本：

```bash
npm run dev
```

服务只绑定 `127.0.0.1`。如果需要让远程 ChatGPT 访问，应通过安全 tunnel 暴露 MCP endpoint，不要直接把 Node.js 服务暴露到公网。V0.1 暂无 authentication。

## 配置

配置优先级从低到高为：

```text
代码默认值 < config/default.yml < ~/.coordination-mcp/config.yml < --profile < 环境变量
```

### 用户配置

创建用户配置：

```bash
mkdir -p ~/.coordination-mcp
$EDITOR ~/.coordination-mcp/config.yml
```

示例：

```yaml
port: 43721
allowedHosts:
  - 127.0.0.1
  - localhost
# dataDirectory: /absolute/path/to/coordination-data
```

`~/.coordination-mcp/config.yml` 是可选的，不会由服务自动生成。未设置 `dataDirectory` 时，默认使用：

```text
~/.coordination-mcp/data
```

建议将自定义 `dataDirectory` 写成绝对路径。相对路径会按进程启动时的 current working directory 解析。

### Profile

Profile 路径相对于 current working directory 解析；指定后文件必须存在：

```bash
node dist/main.js --profile config/local.yml
node dist/main.js --profile=/absolute/path/to/local.yml
```

Profile 只覆盖它声明的字段，未声明的字段继续继承前面的配置。

### 环境变量

```bash
PORT=43721 \
COORDINATION_DATA_DIR=/absolute/path/to/data \
COORDINATION_ALLOWED_HOSTS=127.0.0.1,localhost \
node dist/main.js
```

支持的环境变量：

| 变量 | 说明 |
| --- | --- |
| `PORT` | HTTP 端口，范围为 `0` 到 `65535` |
| `COORDINATION_DATA_DIR` | 数据目录 |
| `COORDINATION_ALLOWED_HOSTS` | 允许的 `Host`，使用逗号分隔 |

配置文件只在服务启动时读取；修改后需要重启 `main.js`。

## MCP Tools

服务通过 `POST /mcp` 提供以下 8 个 tools：

| Tool | 用途 |
| --- | --- |
| `list_tickets` | 列出一个 `Scope` 中的 Tickets |
| `get_ticket` | 读取单个 Ticket |
| `create_ticket` | 创建 Ticket |
| `update_ticket` | 更新 Ticket 的可变字段 |
| `list_updates` | 按 `seq` 增量读取 Updates |
| `add_update` | 追加不可变 Update |
| `create_artifact` | 创建不可变文本 Artifact |
| `get_artifact` | 读取单个 Artifact |

### MCP 初始化示例

```bash
curl -N \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -H 'mcp-protocol-version: 2025-03-26' \
  -X POST http://127.0.0.1:3000/mcp \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "manual-client",
        "version": "0.1.0"
      }
    }
  }'
```

### 创建 Ticket 示例

`tools/call` 的参数示例：

```json
{
  "name": "create_ticket",
  "arguments": {
    "scope": "coordination-mcp",
    "title": "Review the MCP integration",
    "created_by": "local-ai",
    "status": "open",
    "meta": {
      "priority": "high"
    }
  }
}
```

## 数据存储

默认数据目录按需创建；仅启动服务或执行读取操作不会创建数据目录。第一次写入 Ticket、Update 或 Artifact 时，会创建类似以下结构：

```text
~/.coordination-mcp/
├── config.yml                 # 可选用户配置
└── data/
    └── scopes/
        └── <base64url-scope>/
            ├── tickets/
            │   └── T-*.json
            ├── updates.jsonl
            └── artifacts/
                └── A-*.json
```

- Ticket 和 Artifact 使用独立的 pretty-printed JSON 文件。
- 一个 `Scope` 的 Updates 使用 append-only JSONL 文件。
- 新建目录使用 `0700`，新建数据文件使用 `0600`。
- V0.1 使用单进程内的 `Scope` mutex；不支持跨进程锁或分布式部署。

## 开发与验证

```bash
npm test
npm run check
npm run build
```

## 项目文档

- [Domain context](CONTEXT.md)
- [Accepted ADRs](docs/adr/)
- [Archived V0.1 protocol](docs/archive/COORDINATION_PROTOCOL_V0.1.md)
- [Archived implementation architecture](docs/archive/COORDINATION_IMPLEMENTATION_ARCHITECTURE_V0.1.md)
