# DSH 小鲸鱼余额挂件（DeepSeek Balance Whale Widget）

DeepSeek Harness（DSH）Web 界面右下角的常驻余额挂件：本地小鲸鱼气泡图 + DeepSeek API 余额，每次打开界面自动启用。

## 特性

- 🐋 常驻自启：随 DSH Web 界面每次打开自动出现（静态宿主插件 + profile 补丁热更新）
- 💰 余额：60 秒自动刷新 + 点击手动刷新；余额变化时数字**滚动动画**；瞬时网络抖动自动沿用最近余额不报错
- 🖱️ 拖拽 + **四边四分之一吸附**（左/右/上/下，角落可组合）
- 🔄 左吸附时整体**水平镜像翻转**（文字同步反向、带动画）
- 🧸 **按压 Q 弹**玩偶效果（按压时底部坐标不变）
- 🎚️ 悬停显示大小调节按钮（0.6–1.4 倍，尺寸记忆）
- 📐 随浏览器窗口自动缩放；文字位置/字号与图片联动

## 安装（推荐：交给你的 AI）

把整个 `dsh-whale-widget` 文件夹放进 DSH 工作区，然后对 AI 说：

> 请把工作区 `dsh-whale-widget` 文件夹里的 `whale-balance.mjs` 和 `DSniang02.png` 安装到本机 DSH 的 Web profile 目录（Windows 一般为 `%USERPROFILE%\.dsh\profiles\web\`，其他为 `$DSH_HOME/profiles/web/`）：复制两个文件进去，把 `cordis.patch.yml` 模板里的 insert 行合并进同目录的 `cordis.patch.yml`；完成后 curl 验证 `/dsh-whale/image.png` 与 `/dsh-whale/balance.json` 返回 200，并提醒我刷新页面。写入 profile 目录（工作区之外）需要文件权限时请批准。

## 安装（手动）

1. 配置 DSH 凭据 `DEEPSEEK_API_KEY`。
2. 把 `whale-balance.mjs` 和 `DSniang02.png` 放进 `profiles/web/`。
3. 把 `cordis.patch.yml` 模板中的 insert 行合并进同目录的 `cordis.patch.yml`。
4. 保存即热生效（无需重启）；F5 刷新页面。

## 验证

```bash
curl http://127.0.0.1:3080/dsh-whale/image.png     # 200 image/png
curl http://127.0.0.1:3080/dsh-whale/balance.json   # 200 {"ok":true,...}
```

## 更新

替换 `whale-balance.mjs` 后，把补丁行的 `?v=` 数字 +1（ESM 缓存需破缓存），保存即热更新。

## 文档

- `INSTALL.md` —— 完整安装/排错说明（含给 AI 的安装提示词）
- `whale-widget-prompt.md` —— 完整规格与生成/维护提示词（几何、色号、动画参数、踩坑记录）

## 隐私

插件不含任何密钥；API Key 运行时从 DSH 凭据服务读取。请勿上传 `.credentials.yaml`、`settings.yaml`、`sessions` 等敏感文件。
