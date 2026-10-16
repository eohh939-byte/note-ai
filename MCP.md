# 整理能力 · MCP Server

把 note-ai 的「文本整理」能力封成一个标准 MCP server，让 WorkBuddy（或任何 MCP 客户端）在对话里直接调用。

## 它做什么

只暴露一个工具：

| 工具 | 输入 | 输出 |
|---|---|---|
| `organize_note` | `text`（原始文本） | 结构化 Markdown 笔记（摘要 + 多级标题 + 要点列表 + 末尾 `tags:` 行） |

**无状态**：不读、不写你的笔记库，纯粹是「文本进 → 结构化文本出」。所以不用动浏览器存储，也不引入后端数据库。

## 为什么这样设计

1. **Prompt 只有一份。** 调用逻辑抽到 `lib/llm.ts`，Web 端 `/api/organize` 和 MCP server 共用同一个函数、同一份 `lib/prompt.ts`。否则改 Prompt 时两边必然漂移——这是这类项目最常见的坑。
2. **不靠 Agent。** 整理是「输入 → 结构化输出」，一次 LLM 调用就够。上 Agent 只会把调用量翻几倍，成本失控且难验收。
3. **配置复用 `.env.local`。** MCP server 启动时自己读 `note-ai/.env.local`，模型和 key 只需维护一处，不用在 `mcp.json` 里再配一遍。

## 文件

| 文件 | 作用 |
|---|---|
| `mcp/server.ts` | MCP server 本体（stdio 传输） |
| `mcp/package.json` | 标记 `type: module`，让 tsx 按 ESM 解析 |
| `lib/llm.ts` | `organizeText()` —— Web 端与 MCP 共用的调用实现 |
| `lib/prompt.ts` | 整理 Prompt（唯一来源） |

## 配置模型

编辑 `note-ai/.env.local`：

```
OPENAI_BASE_URL=http://localhost:3001/v1
OPENAI_API_KEY=你的真实 key
ORGANIZE_MODEL=deepseek-chat
```

## 接入 WorkBuddy

已写入 `~/.workbuddy/mcp.json`：

```json
"note-ai-organizer": {
  "type": "stdio",
  "command": "C:\\Users\\Administrator\\.workbuddy\\binaries\\node\\versions\\22.22.2\\node.exe",
  "args": [
    "D:\\.workbuddy\\2026-10-13-19-46-11\\note-ai\\node_modules\\tsx\\dist\\cli.mjs",
    "D:\\.workbuddy\\2026-10-13-19-46-11\\note-ai\\mcp\\server.ts"
  ],
  "timeout": 120,
  "disabled": false
}
```

**改完必须重启 WorkBuddy** 才会加载（MCP 工具在会话启动时加载）。重启后工具列表里会出现
`mcp__note-ai-organizer__organize_note`，对话里直接说「帮我把这段整理成笔记」就会调用它。

## 验证 server 本体

不用等 WorkBuddy 重启，可单独冒烟测试（发一次 MCP 握手）：

```bash
cd note-ai
node node_modules/tsx/dist/cli.mjs mcp/server.ts
# 另开一个终端发 JSON-RPC，或用 SDK 的 inspector
```

正常会返回 `serverInfo.name = note-ai-organizer`，`tools/list` 里能看到 `organize_note`。

## 依赖

```bash
npm install   # 已含 @modelcontextprotocol/sdk 与 tsx
```

## 后续可加（按优先级）

1. `organize_file` —— 直接传文件路径，server 读文件再整理（省得手动粘贴长文本）
2. 接笔记库 —— 需要给 note-ai 加后端存储，属于架构升级，别急
3. 评估集跑通 —— 用 `eval/samples` 里的样本过一遍，先量化整理质量再谈优化
