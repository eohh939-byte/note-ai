import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { organizeText } from "../lib/llm";

// 复用 note-ai/.env.local：让 MCP server 与 Web 端共用同一份模型配置，
// 用户只需维护一个文件，不用在 mcp.json 里再配一遍 key。
function loadEnvFile() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

const server = new McpServer({
  name: "note-ai-organizer",
  version: "0.1.0",
});

// 注意：SDK 1.32 起 `tool()` 已标记 @deprecated，统一用 registerTool。
server.registerTool(
  "organize_note",
  {
    title: "整理笔记",
    description:
      "把一段杂乱的原始文本（随手记 / 课堂笔记 / 网页剪藏 / 会议记录）整理成结构化 Markdown 笔记：一句话摘要 + 多级标题 + 要点列表 + 末尾 tags 标签行。严格保留原文信息，不编造原文没有的事实。",
    inputSchema: { text: z.string().describe("要整理的原始文本") },
  },
  async ({ text }) => {
    try {
      const markdown = await organizeText(text);
      return { content: [{ type: "text", text: markdown }] };
    } catch (e: any) {
      return {
        content: [
          { type: "text", text: "整理失败：" + (e?.message ?? String(e)) },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
