"use client";

import { useEffect, useRef } from "react";
import { BlockNoteViewRaw, useCreateBlockNote } from "@blocknote/react";
import "@blocknote/react/style.css";

type Block = any;

export default function Editor({
  blocksToLoad,
  activeId,
  onContentChange,
}: {
  blocksToLoad: Block[] | null;
  activeId: string | null;
  onContentChange: (id: string | null, blocks: Block[]) => void;
}) {
  const editor = useCreateBlockNote();
  // 记录「已加载到编辑器」的内容签名，避免重复 replace
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!blocksToLoad) return;
    const sig = activeId + "::" + JSON.stringify(blocksToLoad).length;
    if (loadedRef.current === sig) return;
    editor.replaceBlocks(editor.document, blocksToLoad as any);
    loadedRef.current = sig;
  }, [blocksToLoad, activeId, editor]);

  return (
    <BlockNoteViewRaw
      editor={editor}
      theme="light"
      formattingToolbar
      slashMenu
      sideMenu
      linkToolbar
      tableHandles
      onChange={() => onContentChange(activeId, editor.document)}
    />
  );
}
