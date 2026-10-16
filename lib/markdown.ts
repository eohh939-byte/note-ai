// 极简 Markdown -> BlockNote blocks 转换器（仅覆盖「整理」Prompt 产出的结构）
// 不依赖 @blocknote/markdown（该包在 registry 中不存在），版本无关、稳定可控。

export type InlineText = {
  type: "text";
  text: string;
  styles: Record<string, never>;
};

export type Block = {
  type: string;
  props?: Record<string, any>;
  content: InlineText[];
};

function toInline(s: string): InlineText[] {
  const t = s.trim();
  if (!t) return [];
  return [{ type: "text", text: t, styles: {} }];
}

export async function markdownToBlocks(md: string): Promise<Block[]> {
  const lines = (md || "").split(/\r?\n/);
  const blocks: Block[] = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue; // 跳过空行
    if (/^tags:/i.test(line.trim())) continue; // 丢弃 tags 行（已在 Prompt 约定）

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      const level = m[1].length; // 1~3
      blocks.push({ type: "heading", props: { level }, content: toInline(m[2]) });
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      blocks.push({ type: "bulletListItem", content: toInline(m[1]) });
    } else if ((m = line.match(/^\d+\.\s+(.*)$/))) {
      blocks.push({ type: "numberedListItem", content: toInline(m[1]) });
    } else if ((m = line.match(/^>\s+(.*)$/))) {
      blocks.push({ type: "paragraph", content: toInline(m[1]) });
    } else {
      blocks.push({ type: "paragraph", content: toInline(line) });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", content: toInline("（空笔记）") });
  }
  return blocks;
}
