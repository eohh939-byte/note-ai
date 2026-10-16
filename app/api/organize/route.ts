import { NextRequest, NextResponse } from "next/server";
import { organizeText } from "@/lib/llm";

// 单次 LLM 调用：原始文本 -> 结构化 Markdown。
// 与 MCP server 共用 lib/llm.ts 的实现，Prompt 全局只有一份（lib/prompt.ts）。

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "缺少 text" }, { status: 400 });
  }

  try {
    const markdown = await organizeText(text);
    return NextResponse.json({ markdown });
  } catch (e: any) {
    return NextResponse.json(
      { error: `调用异常: ${e?.message ?? String(e)}` },
      { status: 502 }
    );
  }
}
