# DSH 小鲸鱼余额挂件（DeepSeek Balance Whale Widget）

![DSH 小鲸鱼余额挂件](assets/DSH2.png)

DeepSeek Harness（DSH）Web 界面右下角的常驻余额挂件：小鲸鱼气泡图 + 多模型账户余额（DeepSeek / OpenCode Go / Z.AI / Grok）+ 5 小时、每周用量窗口 + 今日已用 + 每轮对话消耗统计，每次打开界面自动启用。本项目是标准 DSH 插件包，可通过 `dsh plugin` 安装/卸载。

> ⚠️ **本项目为魔改（fork）版本**，基于开源项目 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) 二次开发：在原项目基础之上增加了多模型账户（OpenCode Go / Z.AI / Grok）、白饭余额图标（Issue #34）、跟随模型展示等大量扩展功能。上游原始项目请访问 <https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget>，MIT License 延续原项目。

## 特性

- 🐋 **常驻自启**：随 DSH Web 界面每次打开自动出现（标准 DSH bundle 插件）
- 💰 **余额**：60 秒自动刷新 + 点击鲸鱼手动刷新；余额变化时数字**滚动动画**；瞬时网络抖动自动沿用最近余额不报错
- 📊 **今日已用**：两种模式任选（见下），显示今日消耗金额
  - **小鲸鱼记账（推荐，免令牌）**：不需要任何会话令牌，鲸鱼娘每次观测余额后用余额差值自动记账（`.dshw-usage.json`，跨天自动归零归档）
  - **实时·令牌**：填入平台会话令牌后直接调用平台用量接口，按**峰谷定价**（工作日高峰 9:00–12:00 与 14:00–18:00，其余空闲；2026-08-23 起周末全天按谷价）实时换算今日已用
- 🌐 **多模型账户（多供应商）**：一个挂件同时追踪 DeepSeek（API 计费）、OpenCode Go（订阅窗口）、Z.AI GLM Coding Plan（订阅窗口）、Grok（预付费余额）；菜单「账户」下拉切换账户、点击鲸鱼直接展示当前会话模型的账户额度，展示各账户 5 小时 / 每周 / 每月用量窗口；DeepSeek 的余额、今日已用、每轮消耗统计原样保留
- 🎯 **跟随当前对话所用模型**（默认开启，**事件推送、非轮询**）：宿主经 SSE（`/dsh-whale/events`）实时推送**主会话**所用模型，挂件即时切换到对应供应商账户并拉取最新额度（子代理/后台会话用的模型不会抢走展示）；手动在下拉里选账户会退出跟随（尊重显式选择），再勾选菜单「跟随模型」即可恢复
- 💬 **每轮对话消耗统计**：监听本机会话事件，每轮对话结束后弹出本轮消耗金额（精确 usage，非估算）
  - 菜单可开关「每轮对话后自动显示消耗金额」；「自动关闭时间」可自定义秒数（填 0 表示不自动关闭）
  - 消耗金额泡泡显示期间，余额变动不弹普通泡泡
- 🍚 **白饭余额图标**（Issue #34）：鲸鱼左侧底部常驻白饭图标，三态直观反映当前账户充裕度（跟随展示账户切换）
  - **DeepSeek / 预付费余额**：余额 ≥ **2×底线** → 满碗；**底线** ≤ 余额 < 2×底线 → 半碗；余额 < 底线 → 空碗
  - **订阅窗口**（OpenCode Go / Z.AI / Grok）：按当前套餐主窗口**剩余配额**——剩余 >50% 满碗；>25% 半碗；否则空碗（用量 51% → 半碗）
  - 底线来源两种，菜单自由切换（只作用于有货币余额的账户）：
  - **手动「余额底线」**（默认 ¥10，填 0 恒满碗）：默认方式，直接输入
  - **「使用平台预警阈值」开关**：开启后自动读取 DeepSeek 平台余额预警设置（需 `DEEPSEEK_PLATFORM_TOKEN`），填入底线并锁定，白饭档位跟随平台设置；关闭恢复手动
- 🖱️ **拖拽 + 四边四分之一吸附**（左/右/上/下，角落可组合）
- 🔄 左吸附时整体**水平镜像翻转**（文字同步反向、带动画）
- 🧸 **按压 Q 弹**玩偶效果（按压时底部坐标不变）
- 🎚️ **汉堡菜单**（悬停鲸鱼右上角出现）：大小滑块（0.6–2.5 倍）、音效切换（小黄鸭 / 音效1）、音量调节、用量模式、峰谷提示文案（默认 / 梁文峰谷 / !?强强?!）、账户选择与点击轮换开关、跟随模型开关、气泡开关、每轮消耗开关与自动关闭时间、余额底线
- 🔊 **音效**：按压/松手音效（可选包内 mp3，缺失时静默降级）
- 💬 **随机台词**：点击气泡切换随机台词段（加权随机，含峰谷提示/今日已用/gif 动图/卖萌吐槽），再点一次关闭；气泡总显示 5 秒自动收起
- 📐 随浏览器窗口自动缩放；文字位置/字号与图片联动

## 目录结构

```text
dsh-whale-widget/
├── package.json          # DSH bundle 插件元数据
├── README.md             # 本文件
├── cordis.patch.yml      # 插件挂载声明
├── lib/
│   └── index.js          # 宿主侧插件本体
├── assets/
│   ├── DSH2.png          # README 顶部展示图
│   ├── DSniang1.png      # 小鲸鱼本体（cut-out，气泡由代码绘制）
│   ├── DSniang02.png     # 备用整图（兼容旧版手动安装路径）
│   ├── rua.gif           # 随机台词 gif（可选）
│   ├── Ya1.mp3 / Ya2.mp3 # 小黄鸭音效（可选）
│   ├── D1.mp3 / D2.mp3   # 音效1（可选）
│   └── rice/             # 白饭余额图标（Issue #34）
│       ├── full.png      # 满满一碗大白饭
│       ├── half.png      # 半碗大白饭
│       └── empty.png     # 空碗
└── whale-widget-prompt.md # 完整规格/维护提示词
```

## 安装

### 方式 A：直接从 GitHub 安装（推荐）

无需本地克隆，一条命令安装：

```powershell
dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
```

说明：

- 装完后插件会出现在 DSH 的**插件管理页面**里，之后可以直接在页面里更新，无需再手动执行命令
- 网络环境需要代理时，先设置代理环境变量再执行：
  ```powershell
  $env:http_proxy="http://<ip>:<port>"; $env:https_proxy="http://<ip>:<port>"; $env:all_proxy="socks5://<ip>:<port>"; dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
  ```
- 安装完成后重启 `dsh web`，再 F5 刷新浏览器

### 方式 B：本地安装（从当前仓库）

在**仓库根目录**（`DeepSeek-Balance-Whale-Widget`，即 `package.json` 所在目录）执行：

```powershell
dsh plugin --profile web add link:.
```

说明：

- `dsh plugin` 会把参数转发给 pnpm，并在成功后自动把 `dsh-whale-widget` 加入 `dsh.profile.bundles`
- **`link:.` 表示链接当前目录**（仓库根目录本身就是插件包）。如果你复制了仓库到别处，用绝对路径：
  ```powershell
  dsh plugin --profile web add link:D:\你的路径\DeepSeek-Balance-Whale-Widget
  ```
- ⚠️ 不要用 `link:.\dsh-whale-widget`——仓库里**没有** `dsh-whale-widget/` 子目录，这样会安装成普通依赖而非插件，重启后挂件不出现
- 安装完成后重启 `dsh web`，再 F5 刷新浏览器
- **如果之后移动了源码目录**，必须重新执行一次 `dsh plugin --profile web add link:.<新路径>`。若提示已存在/冲突，先 `dsh plugin --profile web remove dsh-whale-widget` 再重新 add

### 方式 C：发布到 npm 后安装

```powershell
dsh plugin --profile web add dsh-whale-widget
```

### 给 AI 的安装说明（用 dsh 辅助安装时，直接复制给 AI）

如果你希望让另一个 DSH / AI 助手帮你安装，把下面这段发给它即可：

```
请帮我安装插件 dsh-whale-widget，来源是 GitHub 仓库 MeteorNOX/DeepSeek-Balance-Whale-Widget。

步骤：
1. 确保 pnpm 可用（没有就先：npm install -g pnpm）
2. 在 Web profile 安装（任选一种来源）：
   首选，直接从 GitHub 安装（无需本地克隆，装完可在插件管理页面里更新）：
     dsh plugin --profile web add github:MeteorNOX/DeepSeek-Balance-Whale-Widget
   或从本地仓库链接安装（例如本地克隆的仓库根目录）：
     dsh plugin --profile web add link:.<仓库绝对路径>
   （注意：仓库根目录就是插件包，不要写成 link:.\dsh-whale-widget 这种带子目录的路径）
3. 如果报 pnpm 阻止构建脚本（allowBuilds 相关），在 C:\Users\<用户名>\.dsh\profiles\web\pnpm-workspace.yaml 的 allowBuilds 下加对应的包 key，然后重跑
4. 重启 dsh web，然后 F5 刷新浏览器

安装后验证：
- dsh --profile web --dump-config 应该能看到 dsh-whale-widget 在 bundles 里
- curl http://127.0.0.1:3080/dsh-whale/balance.json 应返回 200 JSON（含 totalBalance）
- curl http://127.0.0.1:3080/dsh-whale/widget.js 应返回 200 JS

另外请检查 DSH 凭据里是否配置了 DEEPSEEK_API_KEY（没有就提示用户配置；DEEPSEEK_PLATFORM_TOKEN 可选，不配也能用默认的记账模式）。
```

### 关于令牌（安装后必读）

> **默认不需要任何令牌。** 安装后只需配置 `DEEPSEEK_API_KEY`（拉取余额必需），「今日已用」会自动使用默认的**小鲸鱼记账**模式（余额差值本地记账），开箱即用。
>
> 「实时·令牌」模式用到的 `DEEPSEEK_PLATFORM_TOKEN`（DeepSeek 平台网页会话令牌）是**可选的**，仅在你想要更精确的实时用量换算时才需要配置。获取方式见下方「用量模式使用教程」。

## 卸载

```powershell
dsh plugin --profile web remove dsh-whale-widget
```

## 从旧手动安装升级

如果你之前按旧方式手动安装过（复制 `whale-balance.mjs` + 改 `cordis.patch.yml`），先清理：

```powershell
$web = "$env:USERPROFILE\.dsh\profiles\web"

Remove-Item "$web\whale-balance.mjs" -ErrorAction SilentlyContinue
Remove-Item "$web\whale-balance.cjs" -ErrorAction SilentlyContinue
Remove-Item "$web\DSniang1.png" -ErrorAction SilentlyContinue
Remove-Item "$web\DSniang02.png" -ErrorAction SilentlyContinue
```

然后编辑 `$web\cordis.patch.yml`，删除这段旧补丁：

```yaml
- insert:
    - id: whale-balance-widget
      name: ./whale-balance.mjs?v=1
```

如果里面只有这段，直接改成：

```yaml
[]
```

清理后再执行上面的安装命令。

## 用量模式使用教程

### 必需的凭据

- **`DEEPSEEK_API_KEY`**（必需）：DeepSeek API 密钥，用于拉取余额（`api.deepseek.com/user/balance`）。在 DSH 凭据服务中配置即可（`dsh` 的凭据管理界面 / `.dsh/.credentials.yaml`）。

### 两种用量模式

挂件的「今日已用」有两种模式，在**菜单 → 用量**中选择：

**① 小鲸鱼记账（推荐，默认）—— 完全不需要额外配置**

鲸鱼娘自己用**余额差值**记账：每次观测到余额下降就把差值累加到当天用量，跨天自动归零归档（保留 30 天）；观测币种发生变化时只重置基准、不记差值（防止多币种账户切换污染账本）。只要配好了 `DEEPSEEK_API_KEY` 就能用，**开箱即用**。

- 账本文件：`$DSH_HOME/.dshw-usage.json`（自动生成）
- 优点：零配置、免令牌
- 说明：依赖「观测到的余额下降」累计，若 DSH 关闭期间有消耗会漏记；要精确请用令牌模式

**② 实时·令牌（可选）—— 需要 `DEEPSEEK_PLATFORM_TOKEN`**

鲸鱼娘直接调用 DeepSeek 平台用量接口，按**峰谷定价**实时换算今日已用，**精确到每小时的 token 用量**。

**令牌在哪获取：**
1. 浏览器打开并登录 **https://platform.deepseek.com**
2. 按 **F12** 打开开发者工具 → 切到 **Network（网络）** 标签
3. 在平台页面点击「用量」或刷新页面，找到名为 `usage/by_api_key/amount` 的请求
4. 点开该请求 → **Request Headers（请求标头）** → 复制 `Authorization` 的值（形如 `Bearer eyJ...` 的一长串）
5. 把整段值（含 `Bearer` 前缀或只要后面的 token 部分均可）配置为 DSH 凭据 `DEEPSEEK_PLATFORM_TOKEN`：
   ```powershell
   # 在 DSH 凭据服务中设置，例如编辑 $env:USERPROFILE\.dsh\.credentials.yaml
   # DEEPSEEK_PLATFORM_TOKEN: <你复制的令牌>
   ```
6. 重启 `dsh web`，在**菜单 → 用量**里选择「实时·令牌」

**说明：**
- ⚠️ **令牌非必需**：不配置时挂件自动使用默认的「小鲸鱼记账」模式，功能不受影响
- 该令牌是 DeepSeek **平台网页的会话令牌**（不是 `sk-` 开头的 API key），仅在登录平台网页时有效；重新登录后可能需要重新获取
- 接口不返回金额，只返回 token 分桶，挂件会按内置峰谷定价表换算成金额；定价表在 `lib/index.js` 顶部 `PRICING` 常量，DeepSeek 调价时可自行修改

### 每轮对话消耗（无需任何凭据）

「每轮对话消耗统计」直接监听 DSH 本机会话事件，按模型真实 usage 换算金额（与今日已用同一套峰谷定价表），**不需要** `DEEPSEEK_PLATFORM_TOKEN`。

## 多模型账户（多供应商）

挂件除 DeepSeek API 计费外，还能同时追踪多个模型供应商账户：

| 账户 | 数据来源 | 展示 |
| --- | --- | --- |
| DeepSeek | `api.deepseek.com/user/balance` + 平台用量接口 | 余额 + 今日已用（记账/令牌两模式）+ 峰谷提示 + 每轮消耗 |
| OpenCode Go | `opencode.ai/zen/go/v1/usage`（订阅用量窗口） | 主数字 = 周配额；提示行 5 小时 / 每周 / 每月百分比 |
| Z.AI（GLM Coding Plan） | `api.z.ai` monitor/biz 接口（配额窗口 + 每周用量） | 标题带套餐名；主数字 = 周配额；提示行 5h/周 + 周 token 与调用次数 |
| Grok（Grok Build / SuperGrok / 预付费） | OAuth 走 `cli-chat-proxy.grok.com` 订阅窗口；有 Management API Key + team_id 时走预付费余额 | 标题带产品名（如 GrokBuild）；周套餐显示周百分比，月套餐显示月百分比，预付费显示 USD 余额 |

DeepSeek 之外的订阅类账户没有统一计费余额接口时，挂件还会用**本机事件账本兜底**：按供应商分桶累计 5 小时 / 每周 / 今日的 token 数与调用次数（各供应商定价不同，只记 token 不换算金额）。

### 账户配置文件

首次运行时自动生成 `$DSH_HOME/.dshw-providers.json`（默认 DeepSeek + OpenCode Go + Z.AI + Grok 全部启用），可直接编辑：

```json
{
  "version": 1,
  "accounts": [
    { "id": "deepseek", "kind": "deepseek", "name": "DeepSeek", "enabled": true },
    { "id": "opencode-go", "kind": "opencode-go", "name": "OpenCode Go", "enabled": true, "keyCreds": ["OPENCODE_GO_API_KEY"], "keyFile": "opencode-go" },
    { "id": "zai", "kind": "zai", "name": "Z.AI", "enabled": true, "keyCreds": ["ZAI_API_KEY"], "keyFile": "zai-coding-plan", "keyFileAlt": "zai" },
    { "id": "grok", "kind": "grok", "name": "Grok", "enabled": true, "keyCreds": ["XAI_MGMT_API_KEY"], "teamId": "" }
  ],
  "primaryId": "deepseek"
}
```

- `enabled: false` 停用账户（挂件不展示、不拉取）；`primaryId` 指定默认展示账户
- Grok 默认启用：未配置密钥/team_id 时也能展示**本机事件账本**累计的 5 小时 / 每周 / 今日 token 用量（跟随当前模型对话自动累积）
- 配置文件里只存凭据名称与引用，**不含任何密钥明文**；修改后重启 `dsh web` 生效

### 凭据来源（自动探测，按优先级）

1. **DSH 凭据服务**：`keyCreds` 里列出的凭据名（`ZAI_API_KEY`、`OPENCODE_GO_API_KEY`、`XAI_MGMT_API_KEY`、`DEEPSEEK_API_KEY`），在 DSH 凭据管理界面 / `.dsh/.credentials.yaml` 配置
2. **opencode CLI 登录态复用**：opencode-go / zai 账户若本机已登录 opencode，自动复用 `~/.local/share/opencode/auth.json` 里的 `opencode-go` / `zai-coding-plan` / `zai` 密钥，免重复配置；`DEEPSEEK_API_KEY` 未在 DSH 凭据中配置时，同样会兜底复用 auth.json 里的 `deepseek` 密钥
3. **Grok 需要 team_id**：在配置文件里把 `grok.teamId` 填为 xAI 管理后台的 team id（需要 xAI Management API Key）后即可展示预付费余额（USD）；未配置时挂件仍会展示本机事件账本的 token 用量

### 前端操作

- 菜单「**账户**」下拉直接切换展示账户；**点击鲸鱼**展示**当前会话所用模型**的账户额度并立即刷新（跟随模型开启时的默认行为）；关闭「跟随模型」并勾选「点击鲸鱼切换下一个账户」后，点击鲸鱼才在启用账户间轮换（选择持久化到浏览器 localStorage，刷新后保持）
- 勾选「**跟随模型**」（默认开启）后，挂件随**当前对话所用模型**自动切换到对应账户——模型由宿主经 SSE 实时推送（**无需轮询**），且只跟随**主会话**（子代理/后台会话不干扰）；每次切换模型，挂件立即切到对应账户并刷新该账户最新额度；手动在下拉里选账户会自动关闭跟随（不覆盖你手动选过的账户）
- 订阅类账户气泡**随套餐切换**：大数字优先展示周/月套餐配额（不是 5h 速率窗，避免 5h=0% 把主数字钉死）；提示行列出全部窗口（如 `5h 0% · 周 37% · 月 27%`）；zai 标题带套餐名，并额外显示周 token 数与调用次数；Grok 标题带产品名（GrokBuild / SuperGrok 等）
- DeepSeek 账户保持原有展示：余额数字滚动、今日已用、峰谷提示、每轮消耗金额，不受多账户模式影响；**不展示** 5 小时/每周 token 用量（这些窗口只属于订阅类账户）

### 账户配置端点

- `GET /dsh-whale/providers.json` → 返回合并默认值后的账户配置
- `PUT /dsh-whale/providers.json` → 保存自定义配置（body 为 `{"accounts": [...], "primaryId": "..."}`）

## 验证

```powershell
dsh --profile web --dump-config | Select-String -Pattern "whale"

curl http://127.0.0.1:3080/dsh-whale/image.png
curl http://127.0.0.1:3080/dsh-whale/balance.json
curl http://127.0.0.1:3080/dsh-whale/size.json
curl http://127.0.0.1:3080/dsh-whale/last-turn.json
curl http://127.0.0.1:3080/dsh-whale/providers.json
curl -N http://127.0.0.1:3080/dsh-whale/events
curl http://127.0.0.1:3080/dsh-whale/rice.png?level=full
curl http://127.0.0.1:3080/dsh-whale/alert.json
```

- `/dsh-whale/image.png` → 200 `image/png`
- `/dsh-whale/balance.json` → 200，含 `{"ok":true,"primaryId":...,"accounts":[...],"totalBalance":...,"currency":"CNY","todayUsage":...}`（多账户聚合结果）
- `/dsh-whale/size.json` → GET 返回配置；PUT 写入
- `/dsh-whale/last-turn.json` → 200，含最近一轮对话消耗 `{seq, turn, amount, tokens}`（保留兼容端点；挂件本体已改用事件流）
- `/dsh-whale/events` → SSE 事件流（长连接，Ctrl+C 断开）：连接即下发 `sync`（当前模型 + 最近一轮 seq），随后模型变化推送 `model`、每轮结算推送 `turn`——挂件跟随模型与消耗泡泡都由它驱动，**不再轮询**
- `/dsh-whale/providers.json` → 200，含账户列表（GET 读取 / PUT 保存）
- `/dsh-whale/rice.png?level=full|half|empty` → 200 `image/png`
- `/dsh-whale/alert.json` → 200 JSON（平台预警阈值；未配置令牌返回 `{ok:false, code:'NO_TOKEN'}`）
- 浏览器 F5 后右下角出现挂件

## 常见问题

- **挂件不出现**：确认 `dsh plugin add` 成功；`dsh --profile web --dump-config` 里能看到 `dsh-whale-widget`；重启 `dsh web` 后 F5。
- **图片不显示**：确认 `assets/DSniang1.png` 在插件包内，且没有把旧文件放在 profile 里占用了同名路由。
- **余额报「未配置 DEEPSEEK_API_KEY」**：去 DSH 配置凭据。
- **今日已用显示 --**：记账模式下需要先跑一次余额观测（60 秒内自动完成）；令牌模式需要配置 `DEEPSEEK_PLATFORM_TOKEN`。
- **每轮消耗不显示**：确认菜单「每轮对话后自动显示消耗金额」已勾选；一轮对话必须完整结束（turn/end）才会结算。
- **非 DeepSeek 账户显示「获取失败 / 未配置密钥」**：在 DSH 凭据里配置对应 `keyCreds`（`ZAI_API_KEY` / `OPENCODE_GO_API_KEY` / `XAI_MGMT_API_KEY`），或本机登录 opencode 复用其 auth.json；Grok 还需在 `.dshw-providers.json` 填 `grok.teamId`（Grok 默认已启用，未配置时展示本机账本 token 用量）。
- **挂件没有跟随当前模型切换账户**：确认菜单「跟随模型」已勾选；之前手动选过账户会自动退出跟随，重新勾选即恢复。跟随依据是**主会话**所用模型（子代理/后台会话不影响），由 SSE 实时推送；挂件没有收到模型事件时保持当前账户不变。点击鲸鱼只展示当前会话模型的账户额度、不轮换账户；要点击轮换请先关闭「跟随模型」再勾选「点击鲸鱼切换下一个账户」。
- **不想要某个账户**：编辑 `.dshw-providers.json` 把该账户 `enabled` 改为 `false`，或直接删除该账户对象。
- **没有声音**：确认 `assets/*.mp3` 在包内；若不想带音效文件，静默降级为无声音。
- **本地开发改了代码不生效**：使用 `link:` 安装时，修改源码后重启 `dsh web`（ESM 模块缓存）；如果用已发布版本，需要 `npm publish` 新版本后 `dsh plugin --profile web update dsh-whale-widget`。
- **自定义图片**：气泡由代码绘制（SVG），鲸鱼本体为 cut-out PNG，放在右下角 59.45%；换图需保证透明背景 cut-out，否则按 `whale-widget-prompt.md` 调整几何参数。

## 开发与维护

完整规格、视觉参数、架构结论和生成提示词见 `whale-widget-prompt.md`。修改文字位置、颜色、动画、吸附逻辑、台词组或定价表时参考该文件。

## 许可证

本项目基于 **MIT License** 开源，详见 [LICENSE](LICENSE)。
