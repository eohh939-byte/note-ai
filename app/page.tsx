"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { markdownToBlocks } from "@/lib/markdown";
import CanvasEditor from "./CanvasEditor";
import {
  getNotes,
  saveNote,
  loadNote,
  deleteNote,
  type StoredNote,
  type CanvasItem,
} from "@/lib/storage";

const Editor = dynamic(() => import("./Editor"), { ssr: false });

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function deriveTitle(blocks: any[]): string {
  const firstText = (blocks?.[0]?.content ?? [])
    .map((c: any) => (typeof c === "string" ? c : c?.text ?? ""))
    .join("");
  const t = (firstText || "未命名笔记").trim().slice(0, 24);
  return t;
}

export default function Page() {
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [blocksToLoad, setBlocksToLoad] = useState<any[] | null>(null);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [view, setView] = useState<"doc" | "canvas">("doc");
  const [showModal, setShowModal] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshNotes = useCallback(async () => {
    setNotes(await getNotes());
  }, []);

  useEffect(() => {
    refreshNotes();
  }, [refreshNotes]);

  // 统一持久化：合并已有笔记的 blocks / canvasItems，避免互相覆盖
  const saveActive = useCallback(
    async (patch: Partial<StoredNote>) => {
      if (!activeId) return;
      const existing =
        (await loadNote(activeId)) ??
        ({
          id: activeId,
          title: "未命名笔记",
          blocks: [{ type: "paragraph", content: "" }],
          canvasItems: [],
          updatedAt: Date.now(),
        } as StoredNote);
      const merged: StoredNote = {
        id: activeId,
        title: patch.title ?? existing.title ?? "未命名笔记",
        blocks: patch.blocks ?? existing.blocks ?? [{ type: "paragraph", content: "" }],
        canvasItems: patch.canvasItems ?? existing.canvasItems ?? [],
        updatedAt: Date.now(),
      };
      await saveNote(merged);
      refreshNotes();
    },
    [activeId, refreshNotes]
  );

  const handleCanvasChange = useCallback(
    (id: string | null, items: CanvasItem[]) => {
      if (!id) return;
      setCanvasItems(items);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveActive({ canvasItems: items }), 800);
    },
    [saveActive]
  );

  // 编辑器内容变化 -> 防抖自动保存
  const handleContentChange = useCallback(
    (id: string | null, blocks: any[]) => {
      if (!id) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveActive({ blocks, title: deriveTitle(blocks) });
      }, 800);
    },
    [saveActive]
  );

  async function createNote() {
    const id = newId();
    const blocks = [{ type: "paragraph", content: "" }];
    const note: StoredNote = {
      id,
      title: "未命名笔记",
      blocks,
      canvasItems: [],
      updatedAt: Date.now(),
    };
    await saveNote(note);
    setActiveId(id);
    setBlocksToLoad(blocks);
    setCanvasItems([]);
    refreshNotes();
  }

  async function openNote(id: string) {
    const note = await loadNote(id);
    if (!note) return;
    setActiveId(id);
    setBlocksToLoad(note.blocks ?? [{ type: "paragraph", content: "" }]);
    setCanvasItems(note.canvasItems ?? []);
  }

  async function removeNote(id: string) {
    await deleteNote(id);
    if (activeId === id) {
      setActiveId(null);
      setBlocksToLoad(null);
    }
    refreshNotes();
  }

  async function runOrganize() {
    if (!raw.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "整理失败");
      const blocks = await markdownToBlocks(data.markdown);
      const id = activeId || newId();
      if (!activeId) {
        setActiveId(id);
        await saveNote({
          id,
          title: deriveTitle(blocks),
          blocks,
          canvasItems: [],
          updatedAt: Date.now(),
        });
      } else {
        await saveActive({ blocks, title: deriveTitle(blocks) });
      }
      setBlocksToLoad(blocks);
      setView("doc");
      refreshNotes();
      setShowModal(false);
      setRaw("");
      flash("已整理并写入笔记");
    } catch (e: any) {
      flash("出错：" + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-800">
      {/* 侧栏：笔记列表 */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <div className="font-semibold text-lg">智记</div>
          <div className="text-xs text-slate-400">AI 笔记整理本</div>
        </div>
        <div className="p-2">
          <button
            onClick={createNote}
            className="w-full rounded-lg bg-slate-900 text-white text-sm py-2"
          >
            + 新建笔记
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {notes.map((n) => (
            <div
              key={n.id}
              className={`group flex items-center justify-between rounded-md px-2 py-2 cursor-pointer text-sm ${
                n.id === activeId ? "bg-slate-200" : "hover:bg-slate-100"
              }`}
              onClick={() => openNote(n.id)}
            >
              <span className="truncate">{n.title}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-slate-400 px-1"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNote(n.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="text-xs text-slate-400 p-2">还没有笔记</div>
          )}
        </div>
      </aside>

      {/* 主区：编辑器 */}
      <main className="flex-1 flex flex-col">
        <div className="h-14 border-b border-slate-200 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {activeId ? (
              <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
                <button
                  onClick={() => setView("doc")}
                  className={
                    view === "doc"
                      ? "bg-slate-900 text-white px-3 py-1.5"
                      : "px-3 py-1.5 text-slate-600"
                  }
                >
                  文档
                </button>
                <button
                  onClick={() => setView("canvas")}
                  className={
                    view === "canvas"
                      ? "bg-slate-900 text-white px-3 py-1.5"
                      : "px-3 py-1.5 text-slate-600"
                  }
                >
                  画布
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-400">点击「新建笔记」开始</div>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            disabled={!activeId}
            className="rounded-lg bg-slate-900 text-white text-sm px-4 py-2 disabled:opacity-40"
          >
            粘贴文本并整理
          </button>
        </div>
        <div className="flex-1 overflow-y-auto editor-shell">
          {activeId ? (
            view === "canvas" ? (
              <CanvasEditor
                items={canvasItems}
                onChange={(items) => handleCanvasChange(activeId, items)}
              />
            ) : (
              <Editor
                blocksToLoad={blocksToLoad}
                activeId={activeId}
                onContentChange={handleContentChange}
              />
            )
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              从左侧新建或选择一篇笔记
            </div>
          )}
        </div>
      </main>

      {/* 整理弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl p-4 shadow-xl">
            <div className="font-medium mb-2">粘贴原始文本，让 AI 整理成结构化笔记</div>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="w-full h-64 border border-slate-300 rounded-lg p-3 text-sm resize-none"
              placeholder="把随手记 / 课堂笔记 / 网页剪藏 / 会议记录 粘进来…"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                onClick={runOrganize}
                disabled={busy}
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm disabled:opacity-40"
              >
                {busy ? "整理中…" : "开始整理"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-full z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
