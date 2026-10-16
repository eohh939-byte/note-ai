// 整理能力的核心实现：原始文本 -> 结构化 Markdown。
// Web 端（/api/organize）与 MCP server 共用同一份调用逻辑和同一份 Prompt，
// 避免「改了 Web 端 Prompt、MCP 还是旧的」这种漂移。

import { buildOrganizeMessages } from "./prompt";

export async function organizeText(text: string): Promise<string> {
  const base = process.env.OPENAI_BASE_URL || "http://localhost:3001/v1";
  const apiKey = process.env.OPENAI_API_KEY || "EMPTY";
  const model = process.env.ORGANIZE_MODEL || "deepseek-chat";

  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildOrganizeMessages(text),
      temperature: 0.2,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`上游模型调用失败: ${upstream.status} ${detail}`);
  }

  const data = await upstream.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
