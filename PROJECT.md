# 快捷图片编辑（Quick Image Editor）— DSH 插件项目文档

> 文档版本：v0.4（已实施）
> 更新日期：2026-08-16
> 状态：插件已按静态 bundle 形态实现并热挂载到运行中的 DSH，核心流程已通过 headless Chrome 实测；见 §11 实施记录。
> 目标运行环境：DeepSeek Harness（DSH）Web 客户端，`web` profile，GUI `http://127.0.0.1:3080`
> 插件形态：标准 bundle 插件（host 空壳 + client 半身），包名暂定 `dsh-quick-image-editor`

---

## 1. 需求一句话

在 DSH Web 对话框上传图片后，点击待发送图片缩略图打开原图预览时，在预览界面提供快捷编辑工具：基础旋转、裁剪、多色画笔、几何形状画笔（多边形、圆形等），编辑结果替换该张待发送图片，使最终发给模型的是编辑后的图。

---

## 2. 当前决策与默认项

> 本文档按以下结论/默认假设编写；状态为「待用户确认」的条目会在文末「待确认问题」中再次列出。

| 编号 | 结论/默认假设 | 状态 |
| --- | --- | --- |
| A1 | 目标平台是本机 DSH Web GUI（`http://127.0.0.1:3080`），不是 chat.deepseek.com 网页。 | 已确认 |
| A2 | 编辑对象只限**输入框待发送草稿图片**（已选择、未发送）。会话历史中已发送的图片不在 MVP 范围。 | 已确认 |
| A3 | 入口复用官方交互：点击输入框图片缩略图 → 官方「原图预览」灯箱打开 → 本插件在灯箱内叠加编辑工具条。不改动文件选择器本身。 | 已确认 |
| A4 | 点击「保存」后**只替换 DSH 输入框中的待发送附件**；本机磁盘上的原始图片文件完全不动。编辑器内可撤销/重置，保存后待发送草稿为编辑版。 | 已确认 |
| A5 | 旋转只做 90° 左转/右转；不做任意角度、不做水平/垂直翻转。 | 已确认 |
| A6 | 裁剪支持自由框选 + 1:1 / 4:3 / 16:9 比例预设（用户未提出异议，按此执行）。 | 默认 |
| A7 | 几何形状集合：直线、箭头、矩形、圆形/椭圆、多边形；**只描边不填充**；线型支持**实线/虚线**。 | 已确认 |
| A8 | 输出格式尽量保持原格式：PNG/WebP 无损或近无损，JPEG quality 0.92 起逐步压缩；GIF 编辑后输出静态 PNG 首帧并提示用户。 | 已确认 |
| A9 | 图像处理全部在浏览器端 Canvas 完成，host 半身不参与。为保证多模态模型兼容与浏览器内存安全，输出统一归一化：最长边 ≤ 4096 px、总像素 ≤ 16 MP、文件 ≤ 4.5 MiB；超限原图先等比缩放再编辑（详见 §5.6）。 | 已定 |
| A10 | 插件形态采用**静态 bundle 常驻**（用户已确认）；理由与动态 Cordis 原型对比见 §5.9。 | 已确认 |
| A11 | 暂不提供设置开关，默认启用；需要时可后续加 `settings.general.item` 开关。 | 默认 |

---

## 3. 功能需求

### 3.1 入口与识别

- FR-1 用户在输入框选择/拖入图片后，点击图片缩略图，官方 `ImageLightbox`（「原图预览」）正常打开。
- FR-2 插件必须识别出当前灯箱显示的是**待发送草稿图片**（通过 `img.src` 匹配 `conversation` 服务中的 `previewUrl`）。
  - 匹配成功：在灯箱内渲染编辑工具条。
  - 匹配失败（例如历史图片灯箱）：不渲染，保持官方行为。
- FR-3 插件失效/服务不可用时，不得破坏官方图片选择、预览、发送流程。

### 3.2 编辑工具条

灯箱内（建议底部居中悬浮，暗色半透明，符合 DSH 主题）提供：

| 区域 | 控件 |
| --- | --- |
| 模式 | 选择 / 旋转 / 裁剪 / 画笔 / 形状 |
| 旋转 | 左转 90°、右转 90°（进入旋转模式后即时应用） |
| 裁剪 | 进入裁剪模式，拖拽框选，显示九宫格或四角手柄，确认/取消 |
| 画笔 | 自由绘制，颜色 × 8 + 自定义取色器，笔宽 2/4/8/12 px |
| 形状 | 直线、箭头、矩形、圆形/椭圆、多边形（点击加点，双击/Enter 闭合）；线型切换：实线/虚线 |
| 编辑 | 撤销、重做、重置 |
| 提交 | 保存到待发送图片、取消编辑 |

- FR-4 工具条只允许出现在草稿图片灯箱中，且同一时间只处理一张图。
- FR-5 所有快捷键不得与官方冲突；MVP 可不做快捷键，Escape 保持官方「关闭灯箱」语义。
- FR-6 暗色/亮色主题都要可读，颜色使用 DSH Theme token（`--dsw-alias-*`），不硬编码主题色；画笔颜色本身可为固定色板。

### 3.3 旋转

- FR-7 每次旋转严格 90°（左/右），图片内容与画布同时旋转，不产生空白边。
- FR-8 旋转可进入撤销栈。
- FR-9 不改变导出分辨率（90° 旋转仅交换宽高）。

### 3.4 裁剪

- FR-10 裁剪通过拖拽创建选区，可拖拽边缘/四角调整，选区外遮罩变暗。
- FR-11 比例预设：自由、1:1、4:3、16:9；切换预设时保持当前选区尽量贴近。
- FR-12 「确认裁剪」把裁剪提交为一步历史操作；「取消」回到裁剪前的画面与状态。
- FR-13 裁剪后的画布尺寸 = 选区对应的原始像素区域（按显示缩放比例换算），不放大。

### 3.5 画笔

- FR-14 自由画笔：按下拖动绘制，支持平滑（取点插值）。
- FR-15 默认色板：红、橙、黄、绿、蓝、紫、黑、白；另有自定义颜色。
- FR-16 笔宽 2/4/8/12 px；显示当前颜色与笔宽状态。
- FR-17 一笔（pointerdown 到 pointerup）为一步撤销单元。

### 3.6 几何形状画笔

- FR-18 形状工具集合：直线、箭头、矩形、圆形/椭圆、多边形。
- FR-19 矩形/圆形：按下拖拽预览；按住 Shift 锁定正方形/正圆。
- FR-20 多边形：单击添加顶点，移动时预览当前边；双击或 Enter 闭合；闭合后作为一步撤销单元；Esc 取消未闭合多边形。
- FR-21 只描边**不填充**（已确认），使用当前画笔颜色与笔宽。
- FR-21.1 线型支持**实线/虚线**，对直线、箭头、矩形、圆/椭圆、多边形统一生效；自由画笔保持实线。
- FR-22 所有形状在绘制过程中有实时预览，闭合后进入撤销栈。

### 3.7 撤销/重做/重置

- FR-23 撤销栈上限 50 步，覆盖旋转、裁剪、画笔一笔、形状一个。
- FR-24 重做在产生新编辑后清空。
- FR-25 重置丢弃本次进入编辑器后的全部修改，回到原始草稿图。

### 3.8 保存与替换

- FR-26 点击「保存到待发送图片」：
  1. 把当前编辑结果导出为 Blob/File；
  2. 替换该草稿附件描述符的 `file` 与 `previewUrl`；
  3. 刷新输入框缩略图与当前灯箱预览；
  4. 提示「已替换待发送图片」。
- FR-27 替换后的文件立即参与后续发送：发送逻辑读取的必须是被替换后的 `file`。
- FR-28 **只替换 DSH 输入框中的待发送附件，不读取/写回用户本机原图文件**；用户硬盘上的原始图片保持原样。
- FR-29 未保存直接关闭灯箱/取消编辑：丢弃本次修改，待发送图片保持原样。
- FR-30 输出必须同时满足 DSH 准入与多模态模型兼容目标：单张 ≤ 4.5 MiB、最长边 ≤ 4096 px、总像素 ≤ 16 MP（详见 §5.6）；超限先自动等比缩放，并给出明确提示。

### 3.9 兼容性

- FR-31 支持 DSH 当前准入格式：PNG、JPEG、WebP、GIF。
- FR-32 GIF：浏览器 Canvas 只能输出静态帧，进入编辑前弹提示「GIF 将被转为静态 PNG」（用户已确认接受）。
- FR-33 按 EXIF orientation 正确解码（优先 `createImageBitmap(file, { imageOrientation: "from-image" })`），导出后不再保留 EXIF。
- FR-34 为兼顾多模态模型兼容与浏览器内存安全，超过 §5.6 归一化上限的原图在进入编辑前等比缩放；编辑器内所见即最终导出尺寸，并在缩放时明确提示用户。

---

## 4. 已探明的 DSH 关键事实（执行会话可直接引用）

> 以下事实来自当前本机部署（2026-08，`DSH_PROFILE=web`）的包源码与实际运行配置。执行前仍建议用 `cordis_inspect_*` 复核一遍。

### 4.1 环境与 profile

| 项 | 值 |
| --- | --- |
| GUI | `http://127.0.0.1:3080`，注入 `window.__DSH_BOOT__` |
| DSH_PROFILE | `web` |
| DSH 进程 | WSL/Linux：`node /home/lin/deepseek-harness/node_modules/.bin/dsh web` |
| DSH_HOME | `/home/lin/.dsh` |
| profile 目录 | `/home/lin/.dsh/profiles/web/` |
| 用户补丁层 | `/home/lin/.dsh/profiles/web/cordis.patch.yml`（保存后 HMR） |
| profile 包清单 | `/home/lin/.dsh/profiles/web/package.json`（已加入依赖；未加入 bundles，见 §6） |
| 已有本地插件先例 | `dsh-doodle-theme`（纯 client 样式）、`dsh-skm-settings`（host 半 + client 半） |
| 插件包锚点 | `/home/lin/.dsh/profiles/web/node_modules/<包名>/` |

### 4.2 待发送图片从选择到发送的链路（已从打包产物核对）

1. `@deepseek-ai/dsh-client-ui-conversation` 注册 root 服务 `conversation`（`ConversationController`）。
2. 选图后调用 `conversation.createDraftImages(files)`，为每个 `File` 生成：
   ```js
   { kind: "image", id: crypto.randomUUID(), previewUrl: URL.createObjectURL(file), file }
   ```
   并存入 `conversation.draftAttachments`（`Map<id, descriptor>`）。
3. 输入框状态只保存 `imageIds`；缩略图栏 `AttachmentRail` 通过 `draftImages(ids)` 取回描述符。
4. 点击缩略图 → 打开 `@deepseek-ai/dsh-client-ui-attachment` 的 `ImageLightbox`，`img.src` 即 `previewUrl`。
5. 发送时 `sendSession()` 调 `conversation.draftImages(imageIds)` 再 `serializeImages(files)` 转 base64 提交。
   **因此：在发送前替换描述符中的 `file`/`previewUrl`，即可让模型收到编辑后的图片。**

### 4.3 官方灯箱没有扩展槽，只能走 DOM 增强

`ImageLightbox` 组件渲染到 `document.body`：

```jsx
<div role="dialog" aria-modal="true" aria-label="原图预览 / Original image preview">
  <div class="mask" />
  <img class="image" src={previewUrl} />
  <button class="close" />
</div>
```

- 没有任何 slot/action props 可供插件加按钮。
- CSS Modules 类名是哈希（本版本 `_backdrop_18d3q_1`、`_image_18d3q_20` 等），**不可硬编码**。
- 稳定识别建议：
  1. `document.querySelectorAll('[role="dialog"][aria-modal="true"]')`；
  2. 过滤出含一个 `img`（`src` 为 `blob:`）和关闭按钮的结构；
  3. 再以 `img.src` 反查 `conversation.draftAttachments`，命中才是草稿图。
- 实施时必须对官方 DOM 变化做防御：识别失败就完全不介入。

### 4.4 可复用的服务与模块

| 能力 | 来源 | 用途 |
| --- | --- | --- |
| `ctx.get("conversation")` | `ui-conversation` 注册的 root 服务 | 读写草稿附件描述符 |
| `conversation.draftAttachments` | `Map<id, descriptor>` | 用 `previewUrl` 反查草稿附件 |
| `conversation.createDraftImages(files)` | 服务方法 | 需要新附件时创建 |
| `conversation.releaseDraftImage(id)` | 服务方法 | 释放不再使用的附件 |
| `conversation.input.shells` | `Map<sessionId, SessionInputShell>` | 找到图片所属会话并触发输入区刷新 |
| `shell.snapshot.imageIds` / `shell.imageIds` / `shell.publish()` | `SessionInputShell` | 替换后刷新 React 输入状态 |
| `require("react")` | 静态 client bundle 的模块表 | 可选，编辑器 UI 也可纯 DOM/Canvas |
| Theme token | `--dsw-alias-*` | 工具条配色 |

> 注意：`draftAttachments`、`shells`、`imageIds`、`publish()` 属于打包产物中的公开字段/方法，但不是官方对外类型。实现时要写成「探测到才用」，拿不到就禁用插件并告警，不能抛异常打断对话页面。

### 4.5 图片准入限制（host 默认值）

| 限制 | 默认 |
| --- | --- |
| 支持格式 | PNG、JPEG、WebP、GIF |
| 单张字节上限 | 5 MiB |
| 单张像素上限 | 40,000,000 px |
| 单消息图片数 | 20 |
| 单消息图片总字节 | 100 MiB |

---

## 5. 技术方案

### 5.1 总体架构

```
用户点击草稿缩略图
        │
        ▼
官方 ImageLightbox（body portal）
        │  MutationObserver 识别 + previewUrl 匹配
        ▼
本插件编辑器（覆盖/替换官方 img 为 canvas）
        │  Canvas 编辑：旋转 / 裁剪 / 画笔 / 形状
        ▼
导出 Blob → 替换 conversation 草稿描述符
        │  shell.imageIds = shell.imageIds.slice(); shell.publish()
        ▼
输入框缩略图与灯箱显示编辑后的图片；发送时携带新文件
```

- 图像编辑全部在浏览器端完成。
- host 半身不需要图像处理，只作为 bundle 行让 client 半身被扫描加载（与 `dsh-doodle-theme` 相同）。
- 二期可选：host 半身注册私有路由，用 `sharp` 做大图/高质量处理；交互层仍在前端。

### 5.2 插件包结构

```
quick-image-editor/
├── PROJECT.md               # 本文档
└── plugin/                  # 权威插件包副本（与运行包保持一致）
    ├── package.json
    ├── cordis.patch.yml
    └── lib/
        ├── index.js         # host 面（空 apply）
        └── client.js        # client 面（编辑器全部逻辑）
```

### 5.3 文件模板

#### `plugin/package.json`

```json
{
  "name": "dsh-quick-image-editor",
  "version": "0.1.0",
  "private": true,
  "description": "Quick image editor for pending draft images in DSH web composer",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-conversation"
      ]
    }
  }
}
```

要点：
- `dsh.bundle` 让本包成为合法 bundle 层。
- `dsh.client.inject` 保证 `runtime` 与 `ui-conversation` 先于本插件就绪（后者提供 `conversation` 服务）。
- `immediately: true` 启动即加载，工具条才能随时接管灯箱。

#### `plugin/cordis.patch.yml`

```yaml
# dsh-quick-image-editor bundle layer: inserts its own host-tree row.
# client-modules scans dsh.client and wires the browser half into boot graph.
- insert:
    - id: quick-image-editor
      name: 'dsh-quick-image-editor'
```

#### `plugin/lib/index.js`

```js
// Host face: no host-side processing in MVP.
export const name = "dsh-quick-image-editor"
export function apply(ctx) {}
```

#### `plugin/lib/client.js`（骨架）

```js
window.__ModuleLoader__.load({
  id: "dsh-quick-image-editor",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

    const QIE_CSS = `/* 工具条样式，全部以 [data-qie-editor] 作用域，使用 --dsw-alias-* token */`

    function findDraftByPreviewUrl(conversation, src) {
      for (const attachment of conversation.draftAttachments.values()) {
        if (attachment.previewUrl === src) return attachment
      }
      return undefined
    }

    function findShellForImage(conversation, attachmentId) {
      for (const shell of conversation.input.shells.values()) {
        if (shell.snapshot.imageIds.indexOf(attachmentId) >= 0) return shell
      }
      return undefined
    }

    function apply(ctx) {
      const conversation = ctx.get("conversation")
      if (!conversation || !conversation.draftAttachments || !conversation.input) return

      const style = document.createElement("style")
      style.dataset.plugin = "dsh-quick-image-editor"
      style.textContent = QIE_CSS
      document.head.appendChild(style)

      const observer = new MutationObserver(/* 识别灯箱并挂载编辑器 */)
      observer.observe(document.body, { childList: true, subtree: true })

      ctx.effect(() => () => {
        observer.disconnect()
        style.remove()
        // 关闭所有仍打开的编辑器、撤销所有 DOM 注入与 object URL
      })
    }

    exports.inject = ["conversation"]
    exports.apply = apply
    exports.name = "dsh-quick-image-editor"
    return module.exports
  }
})
```

> 客户端代码规则沿用 DSH 静态插件惯例：纯 JavaScript（不写 TS/JSX），可用 `document`；所有副作用必须挂在 `ctx.effect` 的 disposer 上，插件 stop/update 时全量回收。

### 5.4 编辑器渲染模型

建议单画布 + 双数据层：

1. **底图（base）**：由原始 `File` 解码得到，承载旋转、裁剪后的结果。
   - 旋转/裁剪作为「底图操作序列」存储；撤销时从原始 bitmap 重放剩余操作。
   - 显示缩放与画布分辨率分离：屏幕绘制按容器缩放，导出按实际像素。
2. **标注层（vector）**：画笔与形状保存为矢量命令数组（`{tool, color, width, points}`）。
   - 每次视口变化重绘，保证清晰。
   - 保存时把底图 + 标注层合成到输出 canvas。
3. **历史栈**：底图操作和标注命令统一为可撤销步骤，上限 50。

MVP 输入处理用 Pointer Events（同时覆盖鼠标/触控/笔），必要时带 `setPointerCapture`。

### 5.5 导出与替换草稿（核心时序）

```js
async function saveToDraft(conversation, attachment, canvas) {
  const blob = await exportBlob(canvas, attachment.file)   // 内部执行 5.6 的归一化
  if (blob.size > 4.5 * 1024 * 1024) return { error: "too-large" }

  const nextFile = new File([blob], editedName(attachment.file.name, blob.type), {
    type: blob.type,
    lastModified: Date.now(),
  })
  const nextUrl = URL.createObjectURL(nextFile)
  const oldUrl = attachment.previewUrl

  // 1) 替换 descriptor：发送路径 serializeImages(file) 会读取新 file
  attachment.file = nextFile
  attachment.previewUrl = nextUrl

  // 2) 登记新 URL，避免旧 URL 泄漏
  if (conversation.createdImageUrls) {
    conversation.createdImageUrls.add(nextUrl)
  }

  // 3) 让 React 重新计算 rail 与 lightbox：
  //    shell.imageIds 需要换成新数组引用，否则 useMemo([input.imageIds]) 不会重算
  const shell = findShellForImage(conversation, attachment.id)
  if (shell && Array.isArray(shell.imageIds)) {
    shell.imageIds = shell.imageIds.slice()
    if (typeof shell.publish === "function") shell.publish()
  }

  // 4) 等 React 用新 URL 渲染后再释放旧 URL
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (oldUrl && oldUrl !== nextUrl) URL.revokeObjectURL(oldUrl)
  }))

  return { ok: true, nextUrl }
}
```

> 若实测发现直接改 descriptor 不稳，备选方案：`createDraftImages([nextFile])` 生成新描述符，手动改回旧 id 放入 `draftAttachments`，再刷新 `shell.imageIds`；效果相同，但必须同步维护 `createdImageUrls`。

### 5.6 解码、归一化与导出策略

#### 5.6.1 为什么把输出上限定为 4096 px / 16 MP / 4.5 MiB

用户要求「在确保兼容多模态模型的前提下自行决定」。综合以下约束，MVP 采用**一次性归一化**策略：

- DSH host 准入：单张 ≤ 5 MiB、≤ 40 MP；格式 PNG/JPEG/WebP/GIF。
- 常见多模态模型/视觉 API 对图片尺寸比 DSH host 更敏感；把长边压到 4096 px、总像素压到 16 MP 是非常稳妥的兼容区间。
- 浏览器 Canvas 内存安全：16 MP RGBA 约 64 MiB/层，底图 + 编辑画布可控制在可接受范围。
- 预留 0.5 MiB 余量（4.5 MiB）避免编码器误差撞上 5 MiB 准入上限。

规则：
1. **不放大**：原图长边和像素都低于上限时，保持原分辨率编辑/导出（旋转、裁剪自然改变宽高除外）。
2. **超限先缩放再编辑**：原图长边 > 4096 px 或总像素 > 16 MP 时，进入编辑前等比缩放到同时满足两项上限，并提示「图片已缩放至 …」。
3. **文件大小兜底**：导出后若 > 4.5 MiB，按「降 JPEG/WebP 质量 → 继续等比缩小长边」循环，直到 ≤ 4.5 MiB；PNG 无法靠质量压缩时改走降分辨率或提示改存 JPEG/WebP。
4. 以上处理只作用于待发送草稿，不回写用户原图。

#### 5.6.2 解码与导出

| 场景 | 处理 |
| --- | --- |
| 解码 | `createImageBitmap(file, { imageOrientation: "from-image" })`；不支持时退回 `HTMLImageElement` |
| PNG 原图 | `canvas.toBlob("image/png")` |
| JPEG 原图 | `canvas.toBlob("image/jpeg", 0.92)`，超 4.5 MiB 时逐级降质量 |
| WebP 原图 | `canvas.toBlob("image/webp", 0.92)`，超限同样降质量 |
| GIF 原图 | 编辑前提示，导出 `image/png` 静态首帧（已确认接受） |
| 命名 | `原名.edited.png/jpg/webp`，扩展名匹配 MIME |
| 超限 | 按 5.6.1 规则缩放/压缩，直到 ≤ 4.5 MiB；仍失败则明确报错且不替换草稿 |

### 5.7 灯箱 DOM 增强

- 用 `MutationObserver` 监听 `document.body` 子树新增节点。
- 灯箱出现后：确认是草稿图 → 在灯箱 `backdrop` 内注入 `[data-qie-editor]` 工具条；进入编辑模式时把官方 `img` 隐藏，插入等尺寸 canvas。
- 关闭灯箱：`MutationObserver` 检测节点移除，或在 `close` 按钮事件捕获阶段挂清理；编辑器销毁、未保存修改丢弃。
- 所有注入元素与监听器都必须可回收；插件 stop 后官方灯箱行为完全恢复。

### 5.8 主题与 Doodle 主题共存

- 工具条根节点使用 `[data-qie-editor]` 前缀，样式只作用于插件 DOM。
- 涂鸦主题会全局给 `button/input` 加边框、圆角和 hover 动画；工具条 CSS 需显式覆盖（`animation: none`、固定圆角），并且**不要给容器加常驻 `transform`**（DSH Tooltip fixed 定位会错位，这是既有坑）。
- 颜色、背景、边框优先引用 `--dsw-alias-*` token。

### 5.9 插件形态对比：静态 bundle 常驻 vs 动态 Cordis 原型

> 用户要求先讲解区别再做决定，因此本节保留两种路线对比。当前文档其余章节按推荐路线（静态 bundle）编写。

| 维度 | 静态 bundle 常驻插件 | 动态 Cordis 原型 |
| --- | --- | --- |
| 是什么 | 把插件包放到 `profiles\web\node_modules\` 并登记到 `dsh.profile.bundles`，作为常驻 bundle 随 DSH 启动加载 | 在某个会话里用 `cordis_define`/`cordis_run` 临时定义并运行的插件 |
| 生命周期 | 重启后仍在；HMR/刷新后生效 | 只活在当前 DSH 进程内存里，**进程重启即消失** |
| 改代码成本 | 改包文件 → 刷新页面（必要时重启） | 会话内直接改、直接跑，验证速度快 |
| 能做什么 | 静态 client 包可用 `document`/Canvas/MutationObserver，能做 DOM 注入、图像编辑等重交互 | 动态 client 半身有沙箱限制：**不能直接碰 `document`/`window`**，只能用 React 闭包、`styles.insert`、slots 等受控能力；网络/文件必须走 host 半 |
| 适合场景 | 最终交付、长期使用、需要操作官方 DOM 的插件（本插件属于这类） | 快速验证设置页、菜单、slot 等不需要碰 DOM 的功能原型 |
| 本插件适配度 | **适配**：编辑器必须操作官方灯箱 DOM 和 Canvas | **不适合**：无法往官方灯箱里挂载编辑器 DOM |
| 先例 | 本机 `dsh-doodle-theme`、`dsh-skm-settings` | `cordis-plugin-development` skill 路线 |

结论：**已确认采用静态 bundle 常驻插件**。动态原型路线做不了「在官方灯箱里挂编辑器」这个核心动作；即使先做动态原型，也只能验证工具栏状态机，最终还是要迁回静态包，反而多一次迁移。

---

## 6. 挂载与维护

### 6.1 实际采用的方式（已生效，无需重启 DSH）

为避免中断运行中的 DSH 会话，本插件没有走 `dsh.profile.bundles`（那需要重启），而是用**用户补丁层插入行**实现等价挂载：

1. workspace 四件套在 `plugin/`（模板见 §5.3）。
2. 复制到运行位置：
   `/home/lin/.dsh/profiles/web/node_modules/dsh-quick-image-editor/`
3. `profile/package.json` 的 `dependencies` 增加：
   `"dsh-quick-image-editor": "file:./node_modules/dsh-quick-image-editor"`。
   （只加依赖，不加入 `bundles`，避免和用户补丁行重复插入。）
4. `cordis.patch.yml` 顶层数组写入：
   ```yaml
   - insert:
       - id: quick-image-editor
         name: 'dsh-quick-image-editor'
   ```
   保存后 HMR 立即生效；`client-modules` 会增量扫描新行并注入 boot graph。
5. 刷新页面后即可使用；插件行在 `cordis.patch.yml` 中持久存在，DSH 重启后仍会加载。

### 6.2 以后如果改回标准 bundle 注册

若希望完全按 bundle 列表管理，需要：
1. 把 `"dsh-quick-image-editor"` 追加进 `dsh.profile.bundles`；
2. 删除 `cordis.patch.yml` 中的上述 `insert` 行（否则重启后会重复插入同 id 行）；
3. 重启 DSH。

### 6.3 日常改代码

- 只改 `lib/client.js`：同步到 profile `node_modules` 后，HMR 会重新哈希；刷新页面加载新 rev。
- 改了 `package.json` / `cordis.patch.yml` / 新增依赖：先 `dsh --profile web --dump-config` 验证，必要时重启。

### 6.4 停用/卸载

- 临时停用：在 `cordis.patch.yml` 加：
  ```yaml
  - id: quick-image-editor
    disabled: true
  ```
  刷新页面即可。
- 卸载：删除用户补丁行、`node_modules/dsh-quick-image-editor/`、`package.json` 依赖条目；重启后彻底移除。

---

## 7. 验收标准

- [ ] 上传 PNG/JPEG/WebP 到输入框，点击缩略图，官方灯箱出现且工具条只出现在草稿图灯箱上。
- [ ] 打开历史消息图片灯箱，不出现编辑工具条。
- [ ] 旋转 90° 左/右各 10 次结果正确，无黑边，可撤销。
- [ ] 裁剪自由框选与三种比例预设均可用；确认后画面正确，取消后无变化。
- [ ] 画笔颜色、笔宽可切换；一笔一撤销；撤销/重做/重置行为正确。
- [ ] 直线、箭头、矩形、圆、多边形均可画；实线/虚线切换生效；多边形可加顶点、预览、闭合、Esc 取消；形状不填充。
- [ ] 编辑保存后：输入框缩略图、灯箱原图、最终发送给模型的内容都是编辑后的图；用户本机原图文件保持不变。
- [ ] 保存后移除该图片，无 object URL 报错/明显泄漏；插件 stop 后官方灯箱恢复原样。
- [ ] GIF 进入编辑有「将转为静态 PNG」提示，导出为 PNG。
- [ ] 输出最长边 ≤ 4096 px、总像素 ≤ 16 MP；导出 > 4.5 MiB 时自动压缩/缩放，最终不超过 5 MiB DSH 准入上限。
- [ ] 暗色/亮色主题可读，与 Doodle 主题同时启用不破版。
- [ ] 插件加载失败或 `conversation` 服务缺失时，官方选图/预览/发送流程不受影响。

---

## 8. 主要风险与坑

1. **官方灯箱没有扩展点**：本方案是 DOM 增强，依赖当前 `ImageLightbox` 结构。类名哈希、文案、结构随版本变化都可能失配；识别必须多条件 + 失败不介入。
2. **触碰 conversation 服务内部字段**：`draftAttachments`/`shells`/`imageIds` 不是正式对外 API，升级后可能失效；访问前探测，失效时安全降级。
3. **React memo 陷阱**：替换 descriptor 后必须给 `shell.imageIds` 换数组引用并 `publish()`，否则缩略图栏不刷新。
4. **object URL 生命周期**：旧 `previewUrl` 不能立即 revoke，否则 React 未重渲染完会闪断；延迟释放或统一由插件在 stop 时回收。
5. **大图内存**：已通过 4096 px / 16 MP 归一化上限控制；实现时仍需在解码后立即检查尺寸，先缩放再建编辑画布，避免瞬时大画布。
6. **GIF 动图**：Canvas 只能处理静态首帧，必须提前告知。
7. **EXIF 方向**：不按 orientation 解码会得到旋转错误的底图；导出后 EXIF 丢失可接受，但需在文档说明。
8. **Doodle 主题 CSS 冲突**：全局按钮/输入框规则会打到工具条；需要作用域覆盖，避免 transform 容器坑。
9. **只改 profile 与 workspace**：不改 DSH 安装目录、shipped agent-presets。

---

## 9. 实施顺序建议

| 阶段 | 内容 | 出口条件 |
| --- | --- | --- |
| P0 | 静态插件骨架 + 灯箱识别 + 只读工具条 | 草稿灯箱出现工具条，历史灯箱不出现 |
| P1 | 底图解码、90° 旋转、裁剪 | 两项操作正确、可撤销 |
| P2 | 画笔 + 形状（含实线/虚线） | 全部形状可画、可撤销、虚线生效 |
| P3 | 导出替换草稿、刷新缩略图 | 发送模型收到编辑后图片 |
| P4 | 兜底：GIF 提示、4.5 MiB/4096 px/16 MP 归一化、stop 清理 | 通过 §7 验收 |
| P5（可选） | 设置开关、另存副本等增强 | 视后续需要 |

---

## 10. 待确认问题（仅剩，不回复则按当前默认执行）

1. **裁剪预设**：自由裁剪 + 1:1 / 4:3 / 16:9 三种比例预设是否保留？（当前默认：保留）
2. **设置开关**：默认启用即可，还是需要在设置页提供开关/默认画笔颜色等配置？（当前默认：默认启用，不做开关）
3. **虚线范围**：虚线当前只作用于形状与直线/箭头，自由画笔保持实线；如果画笔也要虚线请说明。（当前默认：画笔保持实线）

---

## 11. 实施记录（2026-08-16）

### 11.1 已交付文件

| 文件 | 说明 |
| --- | --- |
| `plugin/package.json` | 包 `dsh-quick-image-editor`，`dsh.bundle` + `dsh.client` 双声明 |
| `plugin/cordis.patch.yml` | bundle 补丁模板（当前运行环境实际由用户补丁层插入行，见 §6） |
| `plugin/lib/index.js` | host 面空 `apply` |
| `plugin/lib/client.js` | 全部编辑逻辑：灯箱识别、Canvas 编辑器、保存替换、GIF/大图归一化 |
| `/home/lin/.dsh/profiles/web/node_modules/dsh-quick-image-editor/` | 运行中的插件包（与 workspace 内容一致） |
| `/home/lin/.dsh/profiles/web/cordis.patch.yml` | 已加入 `quick-image-editor` insert 行 |
| `/home/lin/.dsh/profiles/web/package.json` | 已加入 `dsh-quick-image-editor` 依赖 |
| 备份 | `cordis.patch.yml.bak-qie`、`package.json.bak-qie` |

### 11.2 实测结果（headless Chrome + 合成拖拽上传）

| 项目 | 结果 |
| --- | --- |
| boot graph 注入与插件加载 | ✅ 页面刷新后出现 `dsh-quick-image-editor`，无 console/page error |
| 草稿灯箱识别 | ✅ 点击待发送缩略图后出现工具条和 Canvas（320×200 原图） |
| 90° 旋转 | ✅ CW 后画布 200×320，舞台比例同步修正 |
| 自由画笔 | ✅ 描边写入 overlay；撤销后清空；重做恢复 |
| 裁剪 | ✅ 自由选区与 1:1 / 4:3 / 16:9 比例预设；确认后画布裁为 80×128；1:1 实测裁为 60×60 |
| 保存替换 | ✅ 灯箱原图与输入框缩略图 URL 同步换成新 blob；导出尺寸与画布一致；状态提示正确 |
| 虚线形状 | ✅ 矩形虚线描边生效 |
| 多边形 | ✅ 点击加点、点击首点闭合；撤销/重做正确 |
| 取消编辑 / 重置 | ✅ 取消后缩略图保持原图、可重新进入编辑；重置恢复原始画布尺寸并清空历史 |
| GIF 提示 | ✅ 显示「GIF 将被转为静态 PNG 首帧」且常驻不消失 |
| 大图归一化 | ✅ 5000×200 PNG 进入编辑前缩放为 4096×164，状态提示正确 |
| Escape 行为 | ✅ 有裁剪选区时第一次 Esc 仅取消选区、灯箱不关闭；第二次 Esc 关闭灯箱 |

### 11.3 已知边界与待办

- 尚未在真实发送路径上做端到端验收（替换后的 `file` 已确认参与发送序列化，理论路径正确；如需可再发送一张测试图验证）。
- 历史消息灯箱不挂工具条（已由 `draftAttachments` 匹配逻辑保证，未单独回归）。
- 裁剪自由选区、比例预设和四角手柄已实现；自动化验证覆盖自由选区与 1:1 预设，四角手柄建议再人工过一遍。
- 形状填充、任意角度旋转、设置开关均按确认结果不做。
