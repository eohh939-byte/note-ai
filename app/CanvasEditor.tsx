"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasFragment, CanvasItem } from "@/lib/storage";

type Props = {
  items: CanvasItem[];
  onChange: (items: CanvasItem[]) => void;
};

let _seq = 0;
function genId() {
  return "c" + Date.now().toString(36) + (_seq++).toString(36);
}

// —— 五只龙泡泡角色（轮流出场）——
const DRAGONS = [
  { src: "/dragons/dragon1.png", color: "#E8A33D", name: "饭饭" },
  { src: "/dragons/dragon2.png", color: "#5B6FD6", name: "蓝蓝" },
  { src: "/dragons/dragon3.png", color: "#8A8578", name: "铲铲" },
  { src: "/dragons/dragon4.png", color: "#3AA08F", name: "卷卷" },
  { src: "/dragons/dragon5.png", color: "#E2582B", name: "红红" },
];
function dragonOf(it: CanvasItem): number {
  if (typeof it.dragon === "number") return it.dragon;
  // 旧数据：按 id 哈希稳定分配一只龙
  let h = 0;
  for (const c of it.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % DRAGONS.length;
}
// 全局轮流计数器：每新建一只龙泡泡换下一只龙
let _dragonSeq = 0;
function nextDragon() {
  return _dragonSeq++ % DRAGONS.length;
}

// —— 长条对话气泡尺寸 ——
const STRIP_MIN_W = 170; // 初始长条最小宽
const STRIP_MAX_W = 340; // 超出后换行，高度自适应
const BUBBLE_MIN_H = 46;
const BUBBLE_MAX_H = 480; // 缩放手柄垂直方向可达的最大高度
const AVATAR = 62;

// 拖近到「边缘间距 < 此值」即视为融合
const FUSE_GAP = 30;
// 长按融合泡泡多久直接拆开
const LONG_PRESS_MS = 1000;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
// 兼容旧 string[] 片段，统一成 {text, dragon}
function normalizeFrags(it: CanvasItem): CanvasFragment[] {
  if (!it.fragments || it.fragments.length === 0) return [];
  return it.fragments.map((f, i) =>
    typeof f === "string"
      ? { text: f, dragon: (dragonOf(it) + i + 1) % DRAGONS.length }
      : f
  );
}

type Gesture =
  | { kind: "create"; sx: number; sy: number; moved: boolean }
  | {
      kind: "move";
      id: string;
      ox: number;
      oy: number;
      sx: number;
      sy: number;
      moved: boolean;
      lpTimer?: ReturnType<typeof setTimeout>;
    }
  | { kind: "resize"; id: string; startW: number; startH: number; sx: number; sy: number }
  | null;

export default function CanvasEditor({ items, onChange }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>(null);
  const itemsRef = useRef<CanvasItem[]>(items);
  itemsRef.current = items;
  const elRefs = useRef(new Map<string, HTMLDivElement>()); // 泡泡根节点，实时量尺寸

  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [fusePair, setFusePair] = useState<{ dragId: string; targetId: string } | null>(null);
  const [armingId, setArmingId] = useState<string | null>(null); // 长按拆开蓄力中
  const [mode, setMode] = useState<"normal" | "merge">("normal"); // 合并模式：开启后拖动靠近才融合
  const [expandId, setExpandId] = useState<string | null>(null); // 拆分/排列模式：展开某融合泡泡的片段

  function toLocal(e: { clientX: number; clientY: number }) {
    const r = surfaceRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function surfaceSize() {
    const r = surfaceRef.current!.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  // 泡泡在画布坐标系里的实时矩形（含头像），用于融合检测 / 越界钳制
  function localRect(id: string) {
    const el = elRefs.current.get(id);
    const sr = surfaceRef.current!.getBoundingClientRect();
    if (!el) {
      const it = itemsRef.current.find((i) => i.id === id);
      const w = (it?.w || STRIP_MIN_W) + AVATAR + 6;
      return { x: it?.x ?? 0, y: it?.y ?? 0, w, h: BUBBLE_MIN_H + 16 };
    }
    const r = el.getBoundingClientRect();
    return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height };
  }

  // 新建龙泡泡后聚焦其文本区
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById("cvt-" + focusId) as HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    setFocusId(null);
  }, [focusId, items]);

  // 进入画布时聚焦表面，使 Ctrl+A 立即可用
  useEffect(() => {
    surfaceRef.current?.focus();
  }, []);

  function addBox(x: number, y: number, minW?: number) {
    const { w: sw, h: sh } = surfaceSize();
    const id = genId();
    const estW = (minW || STRIP_MIN_W) + AVATAR + 6;
    const box: CanvasItem = {
      id,
      x: clamp(x, 0, Math.max(0, sw - estW)),
      y: clamp(y, 0, Math.max(0, sh - (BUBBLE_MIN_H + 20))),
      w: minW || STRIP_MIN_W,
      text: "",
      dragon: nextDragon(), // 轮流出场
    };
    onChange([...itemsRef.current, box]);
    setFocusId(id);
  }

  // 离场动画后真正删除
  function animateRemove(ids: string[]) {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    if (ids.includes(expandId ?? "")) setExpandId(null);
    setLeaving((p) => new Set([...p, ...ids]));
    setTimeout(() => {
      onChange(itemsRef.current.filter((it) => !idSet.has(it.id)));
      setLeaving((p) => {
        const n = new Set(p);
        ids.forEach((i) => n.delete(i));
        return n;
      });
    }, 200);
  }

  // —— 融合：把 dragged 收进 host。以「合并到的龙泡泡（host）」为框，龙不变 ——
  function fuseInto(dragId: string, hostId: string) {
    const dragged = itemsRef.current.find((i) => i.id === dragId);
    const host = itemsRef.current.find((i) => i.id === hostId);
    if (!dragged || !host || dragId === hostId) return;
    const dFrag = normalizeFrags(dragged);
    const hFrag = normalizeFrags(host);
    const draggedFrags: CanvasFragment[] = dFrag.length
      ? dFrag
      : [{ text: dragged.text || "（空）", dragon: dragonOf(dragged) }];
    const hostFrags: CanvasFragment[] = hFrag.length
      ? hFrag
      : [{ text: host.text || "（空）", dragon: dragonOf(host) }];
    const fragments = [...hostFrags, ...draggedFrags];
    const mergedText = fragments.map((f) => f.text).join("\n\n");
    // dragged 缩小吸入 host，host 保持自己的龙与框
    setLeaving(new Set([dragId]));
    setFusePair(null);
    setTimeout(() => {
      onChange(
        itemsRef.current
          .filter((i) => i.id !== dragId)
          .map((i) => (i.id === hostId ? { ...i, text: mergedText, fragments } : i))
      );
      setLeaving(new Set());
    }, 220);
  }

  // —— 拆开：长按融合泡泡，片段（各自的龙）整齐拉开成独立龙泡泡 ——
  function splitBubble(id: string) {
    setArmingId(null);
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it) return;
    const frags = normalizeFrags(it);
    if (frags.length < 2) return;
    const { w: sw, h: sh } = surfaceSize();
    const n = frags.length;
    const bw = STRIP_MIN_W + AVATAR + 6; // 估算单只龙泡泡宽
    const bh = BUBBLE_MIN_H + 24;
    const gap = 24;
    const perRow = Math.max(1, Math.floor((sw - 16) / (bw + gap)));
    const cols = Math.min(n, perRow);
    const rows = Math.ceil(n / cols);
    const totalW = cols * bw + (cols - 1) * gap;
    const totalH = rows * bh + (rows - 1) * gap;
    let startX = it.x + bw / 2 - totalW / 2;
    let startY = it.y + bh / 2 - totalH / 2;
    startX = clamp(startX, 8, Math.max(8, sw - totalW - 8));
    startY = clamp(startY, 8, Math.max(8, sh - totalH - 8));
    const newItems: CanvasItem[] = frags.map((f, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      return {
        id: genId(),
        x: startX + c * (bw + gap),
        y: startY + r * (bh + gap),
        w: STRIP_MIN_W,
        text: f.text,
        dragon: f.dragon, // 拆开还原各自原来的龙
      };
    });
    setLeaving(new Set([id]));
    gesture.current = null;
    setExpandId(null); // 融合泡泡被拆开，展开面板失效
    setTimeout(() => {
      onChange([...itemsRef.current.filter((i) => i.id !== id), ...newItems]);
      setLeaving(new Set());
    }, 220);
  }

  // —— 拆出单条片段：把融合泡泡里的某一片段单独拉成一只龙泡泡，其余留在原泡 ——
  function splitOne(id: string, fragIndex: number) {
    const it = itemsRef.current.find((i) => i.id === id);
    if (!it) return;
    const frags = normalizeFrags(it);
    if (fragIndex < 0 || fragIndex >= frags.length) return;
    const target = frags[fragIndex];
    const rest = frags.filter((_, i) => i !== fragIndex);
    const { w: sw, h: sh } = surfaceSize();
    // 新独立龙泡泡：摆在原泡右下方一点
    const newItem: CanvasItem = {
      id: genId(),
      x: clamp(it.x + (it.w || STRIP_MIN_W) + AVATAR + 24, 8, Math.max(8, sw - (STRIP_MIN_W + AVATAR + 6) - 8)),
      y: clamp(it.y + 28, 8, Math.max(8, sh - (BUBBLE_MIN_H + 24))),
      w: STRIP_MIN_W,
      text: target.text,
      dragon: target.dragon,
    };
    let updatedHost: CanvasItem;
    if (rest.length === 0) {
      // 拆光了：直接删掉原泡
      setLeaving(new Set([id]));
      setExpandId(null);
      setTimeout(() => {
        onChange([...itemsRef.current.filter((i) => i.id !== id), newItem]);
        setLeaving(new Set());
      }, 200);
      return;
    } else if (rest.length === 1) {
      // 只剩一条：还原成普通龙泡泡（去掉 fragments）
      updatedHost = { ...it, text: rest[0].text, fragments: undefined, dragon: rest[0].dragon };
    } else {
      // 仍 ≥2：继续作为融合泡泡，保留剩余片段
      updatedHost = { ...it, text: rest.map((f) => f.text).join("\n\n"), fragments: rest };
    }
    onChange(itemsRef.current.map((i) => (i.id === id ? updatedHost : i)).concat(newItem));
  }

  // 两个泡泡的实时边缘间距
  function edgeGap(a: ReturnType<typeof localRect>, b: ReturnType<typeof localRect>) {
    const gx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const gy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return Math.hypot(gx, gy);
  }

  function onSurfacePointerDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return; // 点在泡泡上不触发
    if (!e.isPrimary) return;
    if (expandId) {
      setExpandId(null); // 点击空白先收起拆分/排列面板
      return;
    }
    const { x, y } = toLocal(e);
    gesture.current = { kind: "create", sx: x, sy: y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onSurfacePointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const { x, y } = toLocal(e);
    const { w: sw, h: sh } = surfaceSize();
    if (g.kind === "create") {
      const dx = x - g.sx;
      const dy = y - g.sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
      if (g.moved) {
        setPreview({
          x: Math.min(g.sx, x),
          y: Math.min(g.sy, y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        });
      }
    } else if (g.kind === "move") {
      const dx = x - g.sx;
      const dy = y - g.sy;
      if (!g.moved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        g.moved = true;
        setArmingId(null);
        if (g.lpTimer) {
          clearTimeout(g.lpTimer);
          g.lpTimer = undefined;
        }
      }
      const me = localRect(g.id);
      const nx = clamp(g.ox + dx, 0, Math.max(0, sw - me.w));
      const ny = clamp(g.oy + dy, 0, Math.max(0, sh - me.h));
      onChange(itemsRef.current.map((it) => (it.id === g.id ? { ...it, x: nx, y: ny } : it)));
      // 仅在「合并模式」下，实时探测融合目标（用移动后的坐标）
      if (mode === "merge") {
        const meAfter = { ...me, x: nx, y: ny };
        let bestId: string | null = null;
        let bestGap = FUSE_GAP;
        for (const other of itemsRef.current) {
          if (other.id === g.id) continue;
          const gap = edgeGap(meAfter, localRect(other.id));
          if (gap <= bestGap) {
            bestGap = gap;
            bestId = other.id;
          }
        }
        setFusePair(bestId ? { dragId: g.id, targetId: bestId } : null);
      } else {
        setFusePair(null);
      }
    } else if (g.kind === "resize") {
      // 二维缩放：水平改宽度、垂直改高度，永远不会触发合并；首次缩放即锁定为「固定尺寸」模式
      const dx = x - g.sx;
      const dy = y - g.sy;
      const newW = clamp(g.startW + dx, STRIP_MIN_W, STRIP_MAX_W);
      const newH = clamp(g.startH + dy, BUBBLE_MIN_H, BUBBLE_MAX_H);
      onChange(
        itemsRef.current.map((it) =>
          it.id === g.id ? { ...it, w: newW, h: newH, sized: true } : it
        )
      );
    }
  }

  function onSurfacePointerUp(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setFusePair(null);
    if (!g) return;
    if (g.kind === "create") {
      const { x, y } = toLocal(e);
      setPreview(null);
      if (g.moved) {
        const w = Math.abs(x - g.sx);
        const h = Math.abs(y - g.sy);
        if (w > 24 && h > 24) {
          // 框选：框宽作为长条气泡的最小宽度提示
          addBox(Math.min(g.sx, x), Math.min(g.sy, y), clamp(w - AVATAR - 6, 120, STRIP_MAX_W));
          return;
        }
      }
      addBox(g.sx, g.sy);
    }
  }

  function onItemPointerDown(e: React.PointerEvent, it: CanvasItem) {
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.dataset.nodrag) return; // 文本区/按钮不触发移动
    e.stopPropagation();
    if (!e.isPrimary) return;
    const { x, y } = toLocal(e);
    // 融合泡泡：长按 1 秒直接拆开
    const lpTimer =
      it.fragments && it.fragments.length >= 2
        ? setTimeout(() => {
            splitBubble(it.id);
          }, LONG_PRESS_MS)
        : undefined;
    if (lpTimer) setArmingId(it.id);
    gesture.current = { kind: "move", id: it.id, ox: it.x, oy: it.y, sx: x, sy: y, moved: false, lpTimer };
    setDraggingId(it.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onItemPointerUp(e: React.PointerEvent, it: CanvasItem) {
    const g = gesture.current;
    gesture.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setDraggingId(null);
    setFusePair(null);
    setArmingId(null);
    if (!g) return;
    if (g.kind === "move") {
      if (g.lpTimer) clearTimeout(g.lpTimer);
      if (!g.moved) {
        setFocusId(it.id); // 纯点击 → 聚焦文本区编辑
      } else if (mode === "merge" && fusePair && fusePair.dragId === it.id) {
        fuseInto(it.id, fusePair.targetId); // 合并模式下松手即融合进目标龙泡泡
      }
    }
    // resize 手势在 onSurfacePointerMove 已完成宽度更新，这里仅收尾
  }

  // 拖动手柄调整单个龙泡泡尺寸（二维缩放：同时改宽与高），绝不触发合并
  function onResizeDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    if (!e.isPrimary) return;
    const it = itemsRef.current.find((i) => i.id === id);
    const r = localRect(id);
    // 以文本框「实际渲染尺寸」为起点，避免未手动缩放时长条自适应宽度造成的跳变
    const ta = document.getElementById("cvt-" + id) as HTMLTextAreaElement | null;
    const startW = ta ? ta.offsetWidth : it?.w || STRIP_MIN_W;
    const startH = ta ? ta.offsetHeight : it?.h || r.h;
    const { x, y } = toLocal(e);
    setFusePair(null); // 缩放手势期间强制清掉融合连线，避免与融合冲突
    gesture.current = { kind: "resize", id, startW, startH, sx: x, sy: y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // 点数字徽标：展开 / 收起某融合泡泡的拆分·排列面板
  function toggleExpand(id: string) {
    setExpandId((cur) => (cur === id ? null : id));
  }

  function onSurfaceKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
      const active = document.activeElement;
      if (active && active.tagName === "TEXTAREA") return; // 编辑中仍是全选
      e.preventDefault();
      const { w: sw, h: sh } = surfaceSize();
      addBox(
        sw / 2 - (STRIP_MIN_W + AVATAR) / 2 + (Math.random() * 40 - 20),
        sh / 2 - BUBBLE_MIN_H / 2 + (Math.random() * 40 - 20)
      );
    }
  }

  function updateText(id: string, text: string) {
    onChange(itemsRef.current.map((it) => (it.id === id ? { ...it, text } : it)));
  }

  // 融合连线两端中心
  const fuseLine =
    fusePair &&
    (() => {
      const a = localRect(fusePair.dragId);
      const b = localRect(fusePair.targetId);
      return {
        x1: a.x + a.w / 2,
        y1: a.y + a.h / 2,
        x2: b.x + b.w / 2,
        y2: b.y + b.h / 2,
      };
    })();

  return (
    <div
      ref={surfaceRef}
      tabIndex={0}
      onPointerDown={onSurfacePointerDown}
      onPointerMove={onSurfacePointerMove}
      onPointerUp={onSurfacePointerUp}
      onKeyDown={onSurfaceKeyDown}
      className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:22px_22px] outline-none"
      style={{ touchAction: "none" }}
    >
      <style>{`
        .bubble {
          transition: left .3s cubic-bezier(.34,1.4,.5,1),
                      top .3s cubic-bezier(.34,1.4,.5,1),
                      transform .18s cubic-bezier(.34,1.4,.5,1),
                      box-shadow .2s ease;
          animation: bubbleIn .32s cubic-bezier(.34,1.56,.64,1) both;
        }
        .bubble.dragging { transform: scale(1.05); z-index: 30 !important; }
        .bubble.dragging .bub-body { box-shadow: 0 14px 30px rgba(31,41,55,.24); }
        .bubble.fusing { transform: scale(1.14) !important; z-index: 26 !important; }
        .bubble.fusing .bub-body { box-shadow: 0 0 0 4px rgba(99,102,241,.45), 0 12px 30px rgba(99,102,241,.30) !important; }
        .bubble.arming { transform: scale(1.06); }
        .bubble.arming .bub-body { box-shadow: 0 0 0 3px rgba(99,102,241,.35), 0 10px 26px rgba(31,41,55,.20); }
        .bubble.leaving { animation: bubbleOut .2s ease forwards; pointer-events: none; }
        .bub-body { transition: box-shadow .2s ease, transform .2s ease; box-shadow: 0 5px 14px rgba(31,41,55,.10); }
        .avatar { transition: transform .18s cubic-bezier(.34,1.56,.64,1); }
        .bubble.dragging .avatar { transform: scale(1.12) rotate(-6deg); }
        @keyframes bubbleIn { from { transform: scale(.35); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes bubbleOut { from { transform: scale(1); opacity: 1; } to { transform: scale(.3); opacity: 0; } }
        .fuse-line { stroke: #6366f1; stroke-width: 3; stroke-dasharray: 7 6; animation: dashmove .5s linear infinite; opacity: .8; }
        @keyframes dashmove { to { stroke-dashoffset: -26; } }
      `}</style>

      {/* 融合连线 */}
      {fuseLine && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 20 }}>
          <line className="fuse-line" x1={fuseLine.x1} y1={fuseLine.y1} x2={fuseLine.x2} y2={fuseLine.y2} />
        </svg>
      )}

      {/* 隐藏量宽镜：与 textarea 同字体，测量单行文本宽 */}
      <span
        ref={(el) => {
          (window as unknown as { __dmirror?: HTMLSpanElement }).__dmirror = el ?? undefined;
        }}
        className="absolute invisible whitespace-nowrap text-sm"
        aria-hidden
      />

      {/* 合并模式开关：开启后拖动靠近才会融合；平时拖动只移动、缩放不合并 */}
      <button
        onClick={() => setMode((m) => (m === "normal" ? "merge" : "normal"))}
        className={`absolute top-3 right-3 z-40 select-none rounded-full px-3 py-1.5 text-xs font-medium shadow transition-colors ${
          mode === "merge"
            ? "bg-indigo-500 text-white hover:bg-indigo-600"
            : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
        }`}
        title="开启后拖动一只龙泡泡靠近另一只才会融合；关闭时拖动只移动、缩放绝不合并"
      >
        {mode === "merge" ? "✓ 合并模式（开）" : "合并模式（关）"}
      </button>

      {/* 空态提示 */}
      {items.length === 0 && !preview && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400 text-sm text-center px-6 leading-relaxed">
          点空白处 / Ctrl+A 冒出一只龙泡泡（五只龙轮流出场）
          <br />
          拖动即可移动排序 · 拖右下角手柄可缩放（同时改宽和高，绝不会合并）
          <br />
          打开右上角<b>「合并模式」</b>后，拖近另一只龙泡泡放大连线，松手即融合进它（以它为框）
          <br />
          点融合泡泡上的<b>数字徽标</b>展开「拆分 / 排列」面板：可逐条「拆出」或全部拆开 · 长按融合泡泡 1 秒也可拆开 · ✕ 删除
        </div>
      )}

      {items.map((it) => {
        const isLeaving = leaving.has(it.id);
        const isDrag = draggingId === it.id;
        const isFusing = fusePair && (fusePair.dragId === it.id || fusePair.targetId === it.id);
        const isArming = armingId === it.id;
        return (
          <DragonBubble
            key={it.id}
            it={it}
            isDrag={isDrag}
            isFusing={!!isFusing}
            isArming={isArming}
            isLeaving={isLeaving}
            registerEl={(el) => {
              if (el) elRefs.current.set(it.id, el);
              else elRefs.current.delete(it.id);
            }}
            onPointerDown={(e) => onItemPointerDown(e, it)}
            onPointerUp={(e) => onItemPointerUp(e, it)}
            onDelete={() => animateRemove([it.id])}
            onTextChange={(t) => updateText(it.id, t)}
            onResizeDown={onResizeDown}
            expandId={expandId}
            onToggleExpand={toggleExpand}
            onSplitOne={splitOne}
            onSplitAll={(id) => splitBubble(id)}
            focusId={focusId === it.id}
          />
        );
      })}

      {/* 框选预览 */}
      {preview && (
        <div
          className="absolute border-2 border-dashed border-slate-400 bg-slate-400/10 pointer-events-none rounded-xl"
          style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h }}
        />
      )}
    </div>
  );
}

// —— 单只龙泡泡：龙头像 + 长条对话气泡（宽高自适应内容）——
function DragonBubble({
  it,
  isDrag,
  isFusing,
  isArming,
  isLeaving,
  registerEl,
  onPointerDown,
  onPointerUp,
  onDelete,
  onTextChange,
  onResizeDown,
  expandId,
  onToggleExpand,
  onSplitOne,
  onSplitAll,
  focusId,
}: {
  it: CanvasItem;
  isDrag: boolean;
  isFusing: boolean;
  isArming: boolean;
  isLeaving: boolean;
  registerEl: (el: HTMLDivElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDelete: () => void;
  onTextChange: (t: string) => void;
  onResizeDown: (e: React.PointerEvent, id: string) => void;
  expandId: string | null;
  onToggleExpand: (id: string) => void;
  onSplitOne: (id: string, idx: number) => void;
  onSplitAll: (id: string) => void;
  focusId: boolean;
}) {
  const dIdx = dragonOf(it);
  const dragon = DRAGONS[dIdx];
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [dim, setDim] = useState<{ w: number; h: number }>({
    w: it.w || STRIP_MIN_W,
    h: BUBBLE_MIN_H,
  });

  // 宽高两种模式：
  //  - 未手动缩放(sized=false)：长条自适应——宽度跟随文字单行宽（上限 340），高度随内容撑开
  //  - 已手动缩放(sized=true)：固定尺寸——宽度=it.w（文字换行），高度=it.h（内容内滚）
  useLayoutEffect(() => {
    const ta = taRef.current;
    const mirror = (window as unknown as { __dmirror?: HTMLSpanElement }).__dmirror;
    if (!ta) return;
    if (it.sized) {
      const w = it.w || STRIP_MIN_W;
      const h = clamp(it.h || BUBBLE_MIN_H, BUBBLE_MIN_H, BUBBLE_MAX_H);
      ta.style.width = w + "px";
      ta.style.height = h + "px";
      ta.style.overflowY = "auto";
      setDim((p) => (p.w === w && p.h === h ? p : { w, h }));
      return;
    }
    if (!mirror) return;
    mirror.textContent = it.text || "";
    const textW = mirror.offsetWidth;
    const w = clamp(textW + 30, STRIP_MIN_W, STRIP_MAX_W);
    ta.style.width = w + "px";
    ta.style.height = "auto";
    ta.style.overflowY = "hidden";
    const h = Math.max(BUBBLE_MIN_H, ta.scrollHeight);
    ta.style.height = h + "px";
    setDim((p) => (p.w === w && p.h === h ? p : { w, h }));
  }, [it.text, it.w, it.h, it.sized]);

  // 外部请求聚焦（新建 / 点击泡泡）
  useEffect(() => {
    if (focusId && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(
        taRef.current.value.length,
        taRef.current.value.length
      );
    }
  }, [focusId]);

  const fused = (() => {
    if (!it.fragments || it.fragments.length < 2) return false;
    return true;
  })();

  return (
    <div
      ref={registerEl}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className={`bubble absolute flex items-end select-none ${isDrag ? "dragging" : ""} ${
        isFusing ? "fusing" : ""
      } ${isArming ? "arming" : ""} ${isLeaving ? "leaving" : ""}`}
      style={{ left: it.x, top: it.y, zIndex: 10 }}
    >
      {/* 龙头像（左侧，朝向气泡说话） */}
      <div className="relative shrink-0" style={{ width: AVATAR, height: AVATAR }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dragon.src}
          alt={dragon.name}
          draggable={false}
          className="avatar w-full h-full object-contain drop-shadow-[0_3px_6px_rgba(31,41,55,0.18)] cursor-move"
        />
        {fused && (
          <button
            data-nodrag
            onClick={() => onToggleExpand(it.id)}
            className={`absolute -top-2 -right-2 w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow ${
              expandId === it.id ? "bg-indigo-700 ring-2 ring-indigo-300" : "bg-indigo-500 hover:bg-indigo-600"
            }`}
            title={expandId === it.id ? "收起片段（点空白也可收起）" : "点开：拆分 / 排列模式"}
          >
            {expandId === it.id ? "−" : it.fragments!.length}
          </button>
        )}
      </div>
      {/* 长条对话气泡（白底 + 龙主题色描边，左尾指向龙） */}
      <div
        className="bub-body relative mb-1 rounded-2xl rounded-bl-md bg-white cursor-move"
        style={{ border: `2.5px solid ${dragon.color}`, padding: 2 }}
      >
        {/* 左下尾巴 */}
        <div
          className="absolute w-3 h-3 bg-white rotate-45"
          style={{
            left: -6,
            bottom: 10,
            borderLeft: `2.5px solid ${dragon.color}`,
            borderBottom: `2.5px solid ${dragon.color}`,
          }}
        />
        <textarea
          ref={taRef}
          id={"cvt-" + it.id}
          value={it.text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="输入内容…"
          rows={1}
          spellCheck={false}
          className="resize-none border-0 outline-none bg-transparent px-2.5 py-1.5 text-sm text-slate-800 leading-snug overflow-hidden"
          style={{ width: dim.w, height: dim.h }}
        />
        {/* 删除 */}
        <button
          data-nodrag
          onClick={onDelete}
          className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-slate-500 text-white text-[11px] leading-none flex items-center justify-center shadow hover:bg-rose-600"
          title="删除"
        >
          ✕
        </button>
        {/* 缩放手柄：右下角拖动，同时改宽和高（二维缩放），永不合并 */}
        <div
          data-nodrag
          onPointerDown={(e) => onResizeDown(e, it.id)}
          className="absolute -bottom-2.5 -right-2.5 w-7 h-7 rounded-full bg-white border-2 border-slate-400 shadow-md cursor-nwse-resize flex items-center justify-center touch-none hover:border-indigo-500 hover:scale-110 transition-transform"
          title="拖动调整大小（同时改宽度和高度，绝不会合并）"
        >
          <span className="block w-3 h-3 border-b-2 border-r-2 border-slate-500 rotate-45 -mt-0.5 -ml-0.5" />
        </div>
      </div>

      {/* 拆分 / 排列面板：展开融合泡泡的片段，可逐条拆出或全部拆开 */}
      {expandId === it.id && (() => {
        const frags = normalizeFrags(it);
        return (
          <div
            data-nodrag
            className="absolute left-0 top-full mt-2 z-40 w-[260px] rounded-2xl border border-slate-200 bg-white/95 shadow-xl p-2.5 backdrop-blur"
          >
            <div className="mb-1.5 flex items-center justify-between px-0.5">
              <span className="text-[11px] font-semibold text-slate-500">片段（{frags.length}）· 排列预览</span>
              <button
                data-nodrag
                onClick={() => onToggleExpand(it.id)}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                收起
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[240px] overflow-auto">
              {frags.map((f, idx) => {
                const d = DRAGONS[f.dragon % DRAGONS.length];
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-xl border px-2 py-1.5"
                    style={{ borderColor: d.color + "66", background: d.color + "0d" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.src} alt={d.name} className="w-6 h-6 object-contain shrink-0" draggable={false} />
                    <span className="flex-1 text-[12px] text-slate-700 line-clamp-2 leading-snug break-words">
                      {f.text || "（空）"}
                    </span>
                    <button
                      data-nodrag
                      onClick={() => onSplitOne(it.id, idx)}
                      className="shrink-0 rounded-md bg-indigo-500 px-1.5 py-0.5 text-[10px] text-white hover:bg-indigo-600"
                      title="把这条拆成独立龙泡泡"
                    >
                      拆出
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              data-nodrag
              onClick={() => onSplitAll(it.id)}
              className="mt-2 w-full rounded-xl bg-slate-800 py-1.5 text-[12px] font-medium text-white hover:bg-slate-700"
              title="全部拆开成独立龙泡泡"
            >
              全部拆开
            </button>
          </div>
        );
      })()}
    </div>
  );
}
