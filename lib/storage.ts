// 本地优先存储：用 idb-keyval 把笔记存在浏览器 IndexedDB。
// MVP 不强制账号、不同步；后续要同步时，只需把这里换成「本地 + 后端」双写即可。

import { get, set, keys, del } from "idb-keyval";

export type CanvasFragment = { text: string; dragon: number }; // 片段 + 所属龙（拆开时还原）

export type CanvasItem = {
  id: string;
  x: number; // 相对画布左上角
  y: number;
  w: number; // 龙泡泡气泡体宽度。未手动缩放(sized=false)时作为最小宽度、文字更宽会自动撑开；手动缩放后(sized=true)即固定宽度（文字换行）
  h?: number; // 手动高度（缩放手柄垂直方向控制）；未设置时高度随内容自适应
  sized?: boolean; // 是否已手动缩放：true=固定宽高（文字换行/内滚），false=长条自适应
  text: string;
  color?: string; // 兼容旧数据；龙泡泡配色由龙决定
  dragon?: number; // 0-4，对应五只龙泡泡角色；旧数据渲染时按 id 轮流分配
  fragments?: CanvasFragment[] | string[]; // 融合片段；string[] 为旧格式，渲染时补 dragon
};

export type StoredNote = {
  id: string;
  title: string;
  blocks: unknown[]; // BlockNote 文档块
  canvasItems?: CanvasItem[]; // 画布模式的自由文本框
  updatedAt: number;
};

const PREFIX = "note:";

function noteKey(id: string) {
  return PREFIX + id;
}

export async function getNotes(): Promise<StoredNote[]> {
  const allKeys = (await keys()) as string[];
  const noteKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith(PREFIX));
  const notes = await Promise.all(noteKeys.map((k) => get<StoredNote>(k)));
  return (notes.filter(Boolean) as StoredNote[]).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}

export async function loadNote(id: string): Promise<StoredNote | undefined> {
  return get<StoredNote>(noteKey(id));
}

export async function saveNote(note: StoredNote): Promise<void> {
  await set(noteKey(note.id), note);
}

export async function deleteNote(id: string): Promise<void> {
  await del(noteKey(id));
}
