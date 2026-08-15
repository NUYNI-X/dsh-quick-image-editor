# dsh-quick-image-editor

DeepSeek Harness（DSH）Web 快捷图片编辑插件。

在输入框上传图片后，点击待发送图片缩略图打开「原图预览」灯箱，插件会在灯箱内挂载快捷编辑工具条，并把编辑结果替换为该张待发送图片。用户本机原始文件不会被读取或写回。

## 功能

- 仅作用于输入框中未发送的图片；历史消息图片不受影响
- 90° 左转 / 右转
- 自由裁剪 + 1:1 / 4:3 / 16:9 比例预设
- 自由画笔：8 色 + 自定义颜色，2 / 4 / 8 / 12 px
- 几何形状：直线、箭头、矩形、圆形/椭圆、多边形（点击加点，点击首点 / 双击 / Enter 闭合）
- 形状支持实线 / 虚线，只描边不填充
- 撤销 / 重做 / 重置（50 步上限）
- 保存并替换待发送图片；本机原图不受影响
- GIF 编辑前提示，导出为静态 PNG 首帧
- 大图自动归一化：最长边 ≤ 4096px、总像素 ≤ 16MP、文件 ≤ 4.5MiB
- 与官方流程隔离：识别失败或服务缺失时完全不介入

## 安装（当前部署方式）

本插件为 DSH 静态 bundle 插件（host 空壳 + client 半身）。

1. 将 `plugin/` 下的四件套复制到 DSH profile：

   ```bash
   DSH_HOME=~/.dsh
   PROFILE=$DSH_HOME/profiles/web
   mkdir -p "$PROFILE/node_modules/dsh-quick-image-editor"
   cp -r plugin/. "$PROFILE/node_modules/dsh-quick-image-editor/"
   ```

2. 在 `$PROFILE/package.json` 的 `dependencies` 中增加：

   ```json
   "dsh-quick-image-editor": "file:./node_modules/dsh-quick-image-editor"
   ```

3. 在 `$PROFILE/cordis.patch.yml` 中增加用户补丁行（保存后 HMR 生效，无需重启 DSH）：

   ```yaml
   - insert:
       - id: quick-image-editor
         name: 'dsh-quick-image-editor'
   ```

4. 验证：

   ```bash
   dsh --profile web --dump-config
   ```

   树中应出现 `quick-image-editor` 行。然后刷新 Web GUI 页面。

> 也可以把包名加入 `dsh.profile.bundles` 并移除上述用户补丁行，重启 DSH 后生效；两种方式不要同时插入同一 id 行。

## 停用

在 `cordis.patch.yml` 增加：

```yaml
- id: quick-image-editor
  disabled: true
```

刷新页面即可。

## 文件结构

```
plugin/
├── package.json          # dsh.bundle + dsh.client 声明
├── cordis.patch.yml      # bundle 补丁模板
└── lib/
    ├── index.js          # host 面（空 apply）
    └── client.js         # 浏览器编辑器全部逻辑
```

## 文档

完整需求、技术方案、验收标准与实施记录见 [PROJECT.md](PROJECT.md)。
