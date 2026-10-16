# 智记 · AI 笔记整理本（MVP 脚手架）

基于大模型的笔记整理本：**Notion 式块编辑器 + 单次 LLM 调用整理 + 本地优先存储**。
一套 Web 代码同时跑电脑（鼠标/键盘）和平板（触屏），可"添加到主屏幕"当 App 用。

## 技术选型（为什么）
- **Next.js + BlockNote**：Notion 式块编辑器开箱即用，斜杠菜单、拖拽、触屏/键盘都适配。
- **单次 LLM 调用**（`/api/organize`）：文本 → 结构化 Markdown，便宜、快、可控，MVP 足够。
- **本地优先（IndexedDB / idb-keyval）**：不强制账号，先跑通价值闭环；后续再接后端同步。
- **Markdown 作为中间格式**：模型只吐 Markdown，由 `@blocknote/markdown` 转成块，
  从根本上避免"模型吐半截 JSON 解析失败"的坑。

## 运行
```bash
cp .env.example .env.local   # 填上你的模型网关地址和 key
npm install
npm run dev                  # 打开 http://localhost:3000
```
平板访问：电脑和平板在同一局域网，平板浏览器打开 `http://<电脑IP>:3000`，
点浏览器"添加到主屏幕"即可全屏当 App。

## 接入模型
编辑 `.env.local`：
- `OPENAI_BASE_URL`：默认 `http://localhost:3001/v1`（你的 new-api 网关）。
  也可改成 Dify / SenseNova / DeepSeek 官方 OpenAI 兼容地址。
- `OPENAI_API_KEY`：网关 key。
- `ORGANIZE_MODEL`：网关里实际可用的模型名（如 `deepseek-chat`）。

## 目录
```
app/
  layout.tsx          全屏 PWA 壳 + 引入 BlockNote 样式
  page.tsx            主界面：侧栏列表 + 编辑器 + 整理弹窗
  api/organize/route.ts  单次 LLM 调用，文本→Markdown
lib/
  prompt.ts           v1 整理 Prompt（核心资产，先调这里）
  storage.ts          IndexedDB 本地存储
public/manifest.json  PWA 清单
eval/                 评估集设计 + 示例样本
```

## 下一步（按优先级）
1. **评估集**：往 `eval/samples` 塞 20 条你的真实样本，跑 baseline 看整理质量。
2. **Prompt 迭代**：先改 `lib/prompt.ts`，别急着改架构。
3. **多模态**：上传图片/PDF → 先 OCR/视觉模型转文本 → 走同一条整理链路。
4. **同步**：本地写 + 后端（FastAPI + 账号）双写，真多端一致。
5. **进阶（后期才考虑）**：跨笔记语义检索、自动关联——那才是 Agent 的用武之地。
