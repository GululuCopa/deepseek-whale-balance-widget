import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { riceLevelFromUrl, loadRice, fetchAlertConfig } from './rice-host.js'

// Package root: lib/index.js -> package root. Keeps the bundle relocatable
// when installed as a normal DSH npm plugin (node_modules or a local link).
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// DSH home: used for the widget size/usage memory files, since node_modules may
// be read-only or cleaned on update.
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// Whale image: package-relative first, legacy absolute paths as fallback.
const IMAGE_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'DSniang1.png'),
  path.join(PACKAGE_ROOT, 'assets', 'DSniang02.png'),
  'D:/TestBox/deepseek/DSniang1.png',
  'D:/TestBox/deepseek/DSniang02.png',
  'D:/TestBox/deepseek/skin/DSniang02.png',
]

// Size memory file: prefer writable DSH home locations, then legacy fallbacks.
const SIZE_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-size.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-size.json'),
  'D:/TestBox/deepseek/.dshw-size.json',
  'D:/TestBox/deepseek/skin/.dshw-size.json',
]

// Usage ledger file (小鲸鱼记账 mode): same policy as the size file.
const USAGE_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-usage.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-usage.json'),
  'D:/TestBox/deepseek/.dshw-usage.json',
  'D:/TestBox/deepseek/skin/.dshw-usage.json',
]

// Sound assets: package-relative first (ship Ya1/Ya2/D1/D2.mp3 in assets/ for
// sounds out of the box), legacy paths as fallback.
const SOUND_SETS = {
  duck: {
    press: [path.join(PACKAGE_ROOT, 'assets', 'Ya1.mp3'), 'D:/TestBox/deepseek/skin/Ya1.mp3'],
    release: [path.join(PACKAGE_ROOT, 'assets', 'Ya2.mp3'), 'D:/TestBox/deepseek/skin/Ya2.mp3'],
  },
  fx1: {
    press: [path.join(PACKAGE_ROOT, 'assets', 'D1.mp3'), 'D:/TestBox/deepseek/skin/D1.mp3'],
    release: [path.join(PACKAGE_ROOT, 'assets', 'D2.mp3'), 'D:/TestBox/deepseek/skin/D2.mp3'],
  },
}
function soundSetFromUrl(url) {
  try {
    const q = String(url || '').split('?')[1] || ''
    const m = /(?:^|&)set=([^&]+)/.exec(q)
    return m ? decodeURIComponent(m[1]) : ''
  } catch (err) { return '' }
}
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000

// —— 多账户/多供应商（模型）支持 ——
// 用户可配置多个「账户」（模型供应商），挂件逐个拉取余额/用量并展示
// 5 小时、每周等统计窗口。优先适配：opencode-go（OpenCode Go 订阅）、
// zai（Z.AI GLM Coding Plan）、grok（xAI 预付费）。DeepSeek API 计费
// 统计（余额 + 今日已用 + 每轮消耗）原样保留。
const PROVIDERS_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-providers.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-providers.json'),
]
// opencode CLI 的 auth.json：本机已登录 opencode 时可直接复用其中的
// opencode-go / zai / zai-coding-plan 密钥（免去重复配置凭据）。
const OPENCODE_AUTH_FILE = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json')
const OPENCODE_GO_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
// OpenCode Go 官方用量接口对 UA 敏感（社区反馈非浏览器 UA 可能被边缘拦截，
// 见 issue #63）：统一带浏览器 UA + Authorization/x-api-key 双认证头
// （实测 Bearer 单独即可，两者都带无副作用）。
const OPENCODE_GO_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const ZAI_MONITOR_QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit'
const ZAI_SUBSCRIPTION_URL = 'https://api.z.ai/api/biz/subscription/list'
const ZAI_MODEL_USAGE_URL = 'https://api.z.ai/api/monitor/usage/model-usage'
const XAI_MGMT_API = 'https://management-api.x.ai'
// —— Grok OAuth（Grok Build / SuperGrok 订阅账户）支持 ——
// open-grok-build / dsh-coding-subscription-oauth 插件用 device-code 流登录后，
// 把 OAuth 登录态维护在 $DSH_HOME/.grok-build-auth.json。挂件复用这份登录态，
// 经 Grok CLI 消费代理（cli-chat-proxy.grok.com）拉订阅用量窗口（周/月百分比、
// 预付费余额），让「走 OAuth 而非 API provider」的 Grok 账户也能上挂件。
// 公共客户端 id 与 opencode 官方 xai.ts 一致；refresh 不需要 client secret。
const GROK_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const GROK_OAUTH_TOKEN_URL = 'https://auth.x.ai/oauth2/token'
const GROK_PROXY_URL = 'https://cli-chat-proxy.grok.com/v1'
// 登录态文件候选（grok 账户配置里的 oauthAuthFile 可覆盖，见 getGrokOAuthAccessToken）
const GROK_OAUTH_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.grok-build-auth.json'),
  path.join(os.homedir(), '.dsh', '.grok-build-auth.json'),
]
// 订阅类账户（opencode-go/zai/grok）的用量缓存 TTL；DeepSeek 沿用 25s。
const ACCOUNT_TTL_MS = 60000
const DEFAULT_PROVIDERS = {
  version: 1,
  accounts: [
    { id: 'deepseek', kind: 'deepseek', name: 'DeepSeek', enabled: true },
    { id: 'opencode-go', kind: 'opencode-go', name: 'OpenCode Go', enabled: true, keyCreds: ['OPENCODE_GO_API_KEY'], keyFile: 'opencode-go' },
    { id: 'zai', kind: 'zai', name: 'Z.AI', enabled: true, keyCreds: ['ZAI_API_KEY'], keyFile: 'zai-coding-plan', keyFileAlt: 'zai' },
    { id: 'grok', kind: 'grok', name: 'Grok', enabled: true, keyCreds: ['XAI_MGMT_API_KEY'], teamId: '', oauthAuthFile: '' },
  ],
  primaryId: 'deepseek',
}
// 本地会话事件账本里按供应商分桶时，先用 DSH 事件 source.provider 路由名、
// 再用模型名推断供应商。source.provider 形如 deepseek-official / zai /
// opencode-go / xai（grok）；识别不了时回落到模型名字符串匹配（如 grok-4.6）。
function providerForSource(provider, model) {
  const p = String(provider || '').toLowerCase()
  if (p === 'opencode-go') return 'opencode-go'
  if (p.indexOf('deepseek') !== -1) return 'deepseek'
  if (p.indexOf('zai') !== -1 || p.indexOf('zhipu') !== -1 || p.indexOf('glm') !== -1) return 'zai'
  if (p.indexOf('grok') !== -1 || p.indexOf('xai') !== -1 || p.indexOf('x-ai') !== -1) return 'grok'
  const m = String(model || '').toLowerCase()
  if (m.indexOf('grok') !== -1 || m.indexOf('xai') !== -1 || m.indexOf('x-ai') !== -1) return 'grok'
  if (m.indexOf('glm') !== -1 || m.indexOf('zai') !== -1 || m.indexOf('zhipu') !== -1) return 'zai'
  if (m.indexOf('deepseek') !== -1) return 'deepseek'
  if (m.indexOf('opencode/') === 0) return 'opencode-go'
  return null
}
// Z.AI quota/limit 的 unit 枚举 → 时间单位（官方订阅页内部接口的约定值）。
// unit=3 小时、unit=4 天、unit=5 月、unit=6 周、unit=7 年；number 为倍数。
const ZAI_UNIT_NAMES = { 3: 'hour', 4: 'day', 5: 'month', 6: 'week', 7: 'year' }
function zaiWindowMeta(limit) {
  const u = Number(limit && limit.unit) || 0
  const n = Number(limit && limit.number) || 1
  return { name: ZAI_UNIT_NAMES[u] || ('u' + u), count: n }
}
function zaiWindowSlot(limit) {
  // 把一条 TOKENS/CREDIT 限额归入一个展示档位：≤1 天 → 5小时档；
  // 2~14 天 → 每周档；更长 → 每月档。TIME_LIMIT（网页搜索次数）单列。
  const { name, count } = zaiWindowMeta(limit)
  if (name === 'hour' && count <= 24) return 'hours5'
  if (name === 'day' && count <= 1) return 'hours5'
  if (name === 'week' && count <= 2) return 'week'
  if (name === 'day' && count >= 2 && count <= 14) return 'week'
  return 'month'
}
const RUA_GIF_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'rua.gif'),
  'D:/TestBox/deepseek/skin/rua.gif',
  'D:/TestBox/deepseek/rua.gif',
]
// DeepSeek CNY prices per million tokens: [空闲时段价, 高峰时段价].
// 高峰时段：工作日 9:00–12:00 和 14:00–18:00（北京时间）；2026-08-23 起周末全天谷价。
// Adjust here if DeepSeek changes pricing.
const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]
const BASE_PRICE = { hit: [0.05, 0.1], miss: [1.5, 3.0], out: [4.5, 9.0] }
// deepseek-v4-pro 为 flash 的 3 倍价（官方 2026-08-17 生效）；vision-exp 与 flash 同价
const PRO_PRICE = { hit: [0.15, 0.3], miss: [4.5, 9.0], out: [13.5, 27.0] }
const PRICING = {
  'deepseek-v4-flash-vision-exp': BASE_PRICE,
  'deepseek-v4-flash': BASE_PRICE,
  'deepseek-v4-pro': PRO_PRICE,
  'deepseek-chat': BASE_PRICE,
  'deepseek-reasoner': BASE_PRICE,
  _default: BASE_PRICE,
}
function priceFor(model) {
  const m = String(model || '').toLowerCase()
  for (const key of Object.keys(PRICING)) {
    if (key === '_default') continue
    if (m.indexOf(key) !== -1) return PRICING[key]
  }
  return PRICING._default
}
// bucket time is an epoch second; derive the Beijing local hour to pick peak vs off-peak price.
// 2026-08-23 起（北京时间）周末（周六/周日）全天按谷价；生效时刻之前的历史
// 分桶仍按旧规则计价，所以周末判定带生效分界。
const WEEKEND_VALLEY_FROM_SEC = Math.floor(Date.UTC(2026, 7, 22, 16, 0, 0) / 1000) // = 北京时间 2026-08-23 00:00
function isPeakTime(timeSec) {
  if (!isFinite(Number(timeSec))) return false
  const n = Number(timeSec)
  const bj = new Date(n * 1000 + 8 * 3600 * 1000)
  if (n >= WEEKEND_VALLEY_FROM_SEC) {
    const dow = bj.getUTCDay() // 0=周日 6=周六（bj 按 UTC 读即为北京日历日）
    if (dow === 0 || dow === 6) return false
  }
  const hour = bj.getUTCHours()
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true
  }
  return false
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

const WIDGET_JS = `(function () {
if (window.__dshWhaleWidget) return
window.__dshWhaleWidget = true

var MIN_SCALE = 0.6
var MAX_SCALE = 2.5
var STEP = 0.1
var CLICK_SQ = 9
var REFRESH_MS = 60000
var CHANGE_MS = 900
var ANIM_MS = 700
var BUBBLE_MS = 5000
var FETCH_TIMEOUT_MS = 25000
var BALANCE_URL = '/dsh-whale/balance.json'
var SIZE_URL = '/dsh-whale/size.json'
var PLATFORM_ALERT_URL = '/dsh-whale/alert.json'
var IMG_URL = '/dsh-whale/image.png?v=2'
var GIF_URL = '/dsh-whale/rua.gif'

var css = [
  '.dshwv-root{position:fixed;right:0;bottom:0;--dshw-scale:1;--dshw-base:clamp(122px,calc(min(250px,min(100vw,100vh) * 0.28) * var(--dshw-scale)),625px);width:var(--dshw-base);height:var(--dshw-base);pointer-events:none;user-select:none;-webkit-user-select:none;z-index:9999;font-family:inherit;transition:left .16s ease,top .16s ease,transform .3s ease}',
  '.dshwv-root.dshwv-left{transform:scaleX(-1)}',
  '.dshwv-root.dshwv-dragging{cursor:grabbing;transition:none}',
  '.dshwv-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}',
  '.dshwv-img{position:absolute;right:0;bottom:0;width:59.45%;height:59.45%;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none}',
  '.dshwv-bubble{position:absolute;left:0;top:0;width:100%;aspect-ratio:1026/700;pointer-events:none;z-index:1;--dshw-u:calc(var(--dshw-base) / 1026)}',
  '.dshwv-bubble svg{display:block;width:100%;height:100%;pointer-events:none}',
  '.dshwv-bubble svg path,.dshwv-bubble svg ellipse{pointer-events:none;cursor:pointer}',
  '.dshwv-bubble.dshwv-bubble-open svg path,.dshwv-bubble.dshwv-bubble-open svg ellipse{pointer-events:visiblePainted}',
  '.dshwv-bubble .dshwv-bshape,.dshwv-bubble .dshwv-b1,.dshwv-bubble .dshwv-b2{opacity:0;transform:scale(.7);transform-box:fill-box;transform-origin:50% 50%;transition:opacity .2s ease,transform .2s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape,.dshwv-bubble.dshwv-bubble-open .dshwv-b1,.dshwv-bubble.dshwv-bubble-open .dshwv-b2{opacity:1;transform:none}',
  '.dshwv-gif{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);max-width:calc(var(--dshw-u) * 560);max-height:calc(var(--dshw-u) * 400);display:none;opacity:0;transition:opacity .2s ease;pointer-events:none;-webkit-user-drag:none;user-select:none;object-fit:contain}',
  '.dshwv-root.dshwv-left .dshwv-gif{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-gif{opacity:1}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b2{transition-delay:0s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b1{transition-delay:.13s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape{transition-delay:.26s}',
  '.dshwv-bubble .dshwv-bshape{transition-delay:.1s}',
  '.dshwv-bubble .dshwv-b1{transition-delay:.2s}',
  '.dshwv-bubble .dshwv-b2{transition-delay:.3s}',
  '.dshwv-text{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);text-align:center;color:#536ba9;line-height:1.15;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .16s ease,transform .3s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-text{opacity:1;transition:opacity .16s ease .36s,transform .3s ease}',
  '.dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-label{font-size:calc(var(--dshw-u) * 66);font-weight:600;letter-spacing:.06em}',
  '.dshwv-amount{font-size:calc(var(--dshw-u) * 128);font-weight:800;line-height:1.05}',
  '.dshwv-period{font-size:calc(var(--dshw-u) * 104);font-weight:800;line-height:1.05}',
  '.dshwv-wrap{white-space:normal;max-width:calc(var(--dshw-u) * 560);line-height:1.2}',
  '.dshwv-hint{font-size:calc(var(--dshw-u) * 56);color:#9fb0d9;letter-spacing:.02em;margin-top:calc(var(--dshw-u) * 9);min-height:calc(var(--dshw-u) * 64);line-height:1.15}',
  '.dshwv-menu-btn{position:absolute;top:calc(40.55% + 4px);right:4px;width:26px;height:26px;border:none;border-radius:6px;background:rgba(32,49,112,.85);cursor:pointer;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:0;z-index:2;opacity:0;transition:opacity .15s ease}',
  '.dshwv-menu-btn.dshwv-menu-btn-visible{opacity:1}',
  '.dshwv-menu-btn span{display:block;width:14px;height:2px;background:#fff;border-radius:1px}',
  '.dshwv-menu-btn:hover{background:#203170}',
  '.dshwv-menu{position:fixed;min-width:196px;background:rgba(255,255,255,.92);border:1px solid rgba(32,49,112,.35);border-radius:10px;padding:10px 12px;opacity:0;transform:scale(.92) translateY(-4px);transform-origin:top right;transition:opacity .18s ease,transform .2s cubic-bezier(.34,1.56,.64,1);pointer-events:none;z-index:10000;box-shadow:0 6px 18px rgba(0,0,0,.18);color-scheme:light}',
  '.dshwv-menu.dshwv-menu-open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto}',
  '.dshwv-menu-row{display:flex;align-items:center;gap:8px;margin:5px 0;color:#203170;font-size:12px;white-space:nowrap}',
  '.dshwv-range{flex:1;min-width:0;accent-color:#203170}',
  '.dshwv-number{width:44px;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff;box-sizing:border-box}',
  '.dshwv-number:disabled{opacity:.4;background:rgba(32,49,112,.06);cursor:not-allowed}',
  '.dshwv-sound{flex:1;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:3px 0;cursor:pointer}',
  '.dshwv-sound:hover{background:rgba(32,49,112,.16)}',
  '.dshwv-check{width:16px;height:16px;accent-color:#203170;cursor:pointer;flex:0 0 auto}',
  '.dshwv-menu-sep{height:1px;background:rgba(32,49,112,.25);margin:6px 0}',
  '.dshwv-volpct{width:44px;text-align:right;color:#203170;font-size:12px}',
  // 白饭图标（Issue #34）：鲸鱼左侧底部，随根翻转镜像
  '.dshwv-rice{position:absolute;left:20%;bottom:0%;width:29%;height:auto;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none;opacity:0;transition:opacity .25s ease;filter:drop-shadow(0 0 calc(var(--dshw-u) * 8) rgba(32,49,112,.12))}',
  '.dshwv-rice.dshwv-rice-on{opacity:1}'
].join('\\n')

var styleEl = document.createElement('style')
styleEl.textContent = css
document.head.appendChild(styleEl)

var root = document.createElement('div')
root.className = 'dshwv-root'

var img = document.createElement('img')
img.className = 'dshwv-img'
img.src = IMG_URL
img.alt = 'DeepSeek 余额'
img.draggable = false

var menuBtn = document.createElement('button')
menuBtn.type = 'button'
menuBtn.className = 'dshwv-menu-btn'
menuBtn.title = '菜单'
menuBtn.innerHTML = '<span></span><span></span><span></span>'
menuBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu() })

var menuBox = document.createElement('div')
menuBox.className = 'dshwv-menu'
function menuLabel(text) {
  var s = document.createElement('span')
  s.textContent = text
  return s
}
function menuRow() {
  var r = document.createElement('div')
  r.className = 'dshwv-menu-row'
  return r
}
var scaleInput = document.createElement('input')
scaleInput.type = 'range'
scaleInput.min = String(MIN_SCALE)
scaleInput.max = String(MAX_SCALE)
scaleInput.step = '0.1'
scaleInput.className = 'dshwv-range'
scaleInput.value = '1.5'
var scaleNumber = document.createElement('input')
scaleNumber.type = 'number'
scaleNumber.min = '1'
scaleNumber.max = '20'
scaleNumber.step = '1'
scaleNumber.className = 'dshwv-number'
scaleNumber.value = '10'
scaleInput.addEventListener('pointerdown', function () { root.style.transition = 'none' })
scaleInput.addEventListener('input', function () { setScale(scaleInput.value) })
scaleInput.addEventListener('change', function () { root.style.transition = '' })
scaleNumber.addEventListener('focus', function () { root.style.transition = 'none' })
scaleNumber.addEventListener('blur', function () { root.style.transition = '' })
scaleNumber.addEventListener('input', function () {
  var v = Math.round(Number(scaleNumber.value))
  var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19
  setScale(s)
})
scaleNumber.addEventListener('change', function () {
  var v = Math.round(Number(scaleNumber.value))
  var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19
  setScale(s)
  root.style.transition = ''
})
var soundSelect = document.createElement('select')
soundSelect.className = 'dshwv-sound'
function soundOpt(value, label) {
  var o = document.createElement('option')
  o.value = value
  o.textContent = label
  return o
}
soundSelect.appendChild(soundOpt('duck', '小黄鸭'))
soundSelect.appendChild(soundOpt('fx1', '音效1'))
soundSelect.addEventListener('change', function () { setSoundSet(soundSelect.value) })
var usageSelect = document.createElement('select')
usageSelect.className = 'dshwv-sound'
usageSelect.appendChild(soundOpt('ledger', '小鲸鱼记账 (推荐)'))
usageSelect.appendChild(soundOpt('token', '实时·令牌 (用法：去问dsh)'))
usageSelect.addEventListener('change', function () { setUsageMode(usageSelect.value) })
var peakSelect = document.createElement('select')
peakSelect.className = 'dshwv-sound'
peakSelect.appendChild(soundOpt('default', '默认'))
peakSelect.appendChild(soundOpt('liangwen', '梁文峰谷'))
peakSelect.appendChild(soundOpt('qiangqiang', '!?强强?!'))
peakSelect.addEventListener('change', function () { setPeakMode(peakSelect.value) })
var bubbleToggle = document.createElement('input')
bubbleToggle.type = 'checkbox'
bubbleToggle.className = 'dshwv-check'
bubbleToggle.checked = true
bubbleToggle.title = '开启/关闭思考气泡'
bubbleToggle.addEventListener('change', function () { setBubbleOn(bubbleToggle.checked) })
var turnCostToggle = document.createElement('input')
turnCostToggle.type = 'checkbox'
turnCostToggle.className = 'dshwv-check'
turnCostToggle.checked = true
turnCostToggle.title = '每轮对话结束后自动显示本轮消耗金额'
turnCostToggle.addEventListener('change', function () { setTurnCostOn(turnCostToggle.checked) })
var turnCostCloseInput = document.createElement('input')
turnCostCloseInput.type = 'number'
turnCostCloseInput.min = '0'
turnCostCloseInput.step = '1'
turnCostCloseInput.className = 'dshwv-number'
turnCostCloseInput.value = '5'
turnCostCloseInput.disabled = false // 跟随「每轮消耗提示」开关
turnCostCloseInput.title = '填 0 表示不自动关闭，需手动点击关闭'
turnCostCloseInput.addEventListener('input', function () { setTurnCostClose(turnCostCloseInput.value) })
turnCostCloseInput.addEventListener('change', function () { setTurnCostClose(turnCostCloseInput.value) })
var scrollGapToggle = document.createElement('input')
scrollGapToggle.type = 'checkbox'
scrollGapToggle.className = 'dshwv-check'
scrollGapToggle.checked = false
scrollGapToggle.title = '开启后挂件右侧按设定像素避开滚动条；关闭则贴边（盖住滚动条）'
scrollGapToggle.addEventListener('change', function () { setScrollGapOn(scrollGapToggle.checked) })
var scrollGapInput = document.createElement('input')
scrollGapInput.type = 'number'
scrollGapInput.min = '0'
scrollGapInput.step = '1'
scrollGapInput.className = 'dshwv-number'
scrollGapInput.value = '17'
scrollGapInput.disabled = true // 默认避让关 → 宽度不可修改，勾选后启用
scrollGapInput.title = '避让滚动条的像素宽度，填 0 表示贴边'
scrollGapInput.addEventListener('input', function () { setScrollGapPx(scrollGapInput.value) })
scrollGapInput.addEventListener('change', function () { setScrollGapPx(scrollGapInput.value) })
var row1 = menuRow()
row1.appendChild(menuLabel('大小'))
row1.appendChild(scaleInput)
row1.appendChild(scaleNumber)
var row2 = menuRow()
row2.appendChild(menuLabel('音效'))
row2.appendChild(soundSelect)
var volInput = document.createElement('input')
volInput.type = 'range'
volInput.min = '0'
volInput.max = '1'
volInput.step = '0.05'
volInput.className = 'dshwv-range'
volInput.value = '0.9'
var volPct = document.createElement('span')
volPct.className = 'dshwv-volpct'
volPct.textContent = '90%'
volInput.addEventListener('input', function () { setVol(volInput.value) })
var row3 = menuRow()
row3.appendChild(menuLabel('音量'))
row3.appendChild(volInput)
row3.appendChild(volPct)
var row4 = menuRow()
row4.appendChild(menuLabel('用量'))
row4.appendChild(usageSelect)
var row5 = menuRow()
row5.appendChild(menuLabel('峰谷'))
row5.appendChild(peakSelect)
var accountSelect = document.createElement('select')
accountSelect.className = 'dshwv-sound'
accountSelect.title = '选择挂件显示的模型账户'
accountSelect.addEventListener('change', function () { selectAccount(accountSelect.value, true); render(); refresh(true) })
var accountCycleToggle = document.createElement('input')
accountCycleToggle.type = 'checkbox'
accountCycleToggle.className = 'dshwv-check'
accountCycleToggle.checked = true
accountCycleToggle.title = '关闭「跟随模型」后，点击鲸鱼切换下一个账户；跟随开启时点击鲸鱼展示当前会话模型的额度'
accountCycleToggle.addEventListener('change', function () { setAccountCycleOn(accountCycleToggle.checked) })
var rowAcct = menuRow()
rowAcct.appendChild(menuLabel('账户'))
rowAcct.appendChild(accountSelect)
rowAcct.appendChild(accountCycleToggle)
var followToggle = document.createElement('input')
followToggle.type = 'checkbox'
followToggle.className = 'dshwv-check'
followToggle.checked = true
followToggle.title = '跟随当前对话所用模型自动切换账户'
followToggle.addEventListener('change', function () { setFollowOn(followToggle.checked) })
var rowFollow = menuRow()
rowFollow.appendChild(menuLabel('跟随模型'))
rowFollow.appendChild(followToggle)
var row6 = menuRow()
row6.appendChild(menuLabel('气泡'))
row6.appendChild(bubbleToggle)
var menuSep1 = document.createElement('div')
menuSep1.className = 'dshwv-menu-sep'
var row7 = menuRow()
row7.appendChild(menuLabel('每轮消耗提示'))
row7.appendChild(turnCostToggle)
row7.appendChild(menuLabel('自动关闭'))
row7.appendChild(turnCostCloseInput)
row7.appendChild(menuLabel('秒'))
var row9 = menuRow()
row9.appendChild(menuLabel('避让滚动条'))
row9.appendChild(scrollGapToggle)
row9.appendChild(menuLabel('宽度'))
row9.appendChild(scrollGapInput)
row9.appendChild(menuLabel('px'))
// 余额底线（白饭图标档位判定用，Issue #34）
var thresholdInput = document.createElement('input')
thresholdInput.type = 'number'
thresholdInput.min = '0'
thresholdInput.max = '999'
thresholdInput.step = '1'
thresholdInput.className = 'dshwv-number'
thresholdInput.value = '10'
thresholdInput.title = '余额底线（¥），低于此值显示空碗；低于 2 倍显示半碗；填 0 恒满碗'
thresholdInput.addEventListener('input', function () { setThreshold(thresholdInput.value) })
thresholdInput.addEventListener('change', function () { setThreshold(thresholdInput.value) })
var row10 = menuRow()
row10.appendChild(menuLabel('余额底线'))
row10.appendChild(thresholdInput)
row10.appendChild(menuLabel('¥'))
// 手动开关「使用平台预警阈值」（开启后读平台值填入底线并锁定输入框）
var platformAlertToggle = document.createElement('input')
platformAlertToggle.type = 'checkbox'
platformAlertToggle.className = 'dshwv-check'
platformAlertToggle.checked = false
platformAlertToggle.title = '开启后自动读取 DeepSeek 平台余额预警设置，填入「余额底线」并锁定'
platformAlertToggle.addEventListener('change', function () { toggleUsePlatformAlert(platformAlertToggle.checked) })
var row11 = menuRow()
row11.appendChild(menuLabel('使用平台预警阈值'))
row11.appendChild(platformAlertToggle)
menuBox.appendChild(row1)
menuBox.appendChild(row2)
menuBox.appendChild(row3)
menuBox.appendChild(row4)
menuBox.appendChild(row5)
menuBox.appendChild(rowAcct)
menuBox.appendChild(rowFollow)
menuBox.appendChild(row6)
menuBox.appendChild(row7)
menuBox.appendChild(menuSep1)
menuBox.appendChild(row9)
menuBox.appendChild(row10)
menuBox.appendChild(row11)

var textBox = document.createElement('div')
textBox.className = 'dshwv-text'
var labelEl = document.createElement('div')
labelEl.className = 'dshwv-label'
labelEl.textContent = 'DeepSeek 余额'
var amountEl = document.createElement('div')
amountEl.className = 'dshwv-amount'
var hintEl = document.createElement('div')
hintEl.className = 'dshwv-hint'
textBox.appendChild(labelEl)
textBox.appendChild(amountEl)
textBox.appendChild(hintEl)

var bubbleBox = document.createElement('div')
bubbleBox.className = 'dshwv-bubble'
bubbleBox.innerHTML = '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
  '<path class="dshwv-bshape" fill="#FFFFFF" stroke="#203170" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/>' +
  '<ellipse class="dshwv-b1" cx="352" cy="561" rx="37.5" ry="26" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '<ellipse class="dshwv-b2" cx="442" cy="646" rx="24.5" ry="18" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '</svg>'
var gifEl = document.createElement('img')
gifEl.className = 'dshwv-gif'
gifEl.src = GIF_URL
gifEl.alt = ''
gifEl.draggable = false
bubbleBox.appendChild(gifEl)
var gifFailed = false
gifEl.onerror = function () { gifFailed = true }
bubbleBox.appendChild(textBox)
bubbleBox.addEventListener('click', function (e) {
  e.stopPropagation()
  if (!bubbleShown) return
  if (costBubbleActive) {
    // 消耗金额泡泡：点击关闭（确认）
    hideCostBubble()
    return
  }
  if (bubbleRandomActive) {
    // 再次点击：关闭
    hideBubble()
  } else {
    // 首次点击：切到随机台词段，并重置自动关闭计时——
    // 保证第二段台词有完整停留时间（否则第 4 秒点击只看到 0.5 秒）
    bubbleRandomActive = true
    bubbleRandomLines = pickRandomLines()
    swapBubbleContent(function () { applyBubbleLines(bubbleRandomLines) })
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
    bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
  }
})

var body = document.createElement('div')
body.className = 'dshwv-body'
body.appendChild(img)
// 白饭图标（Issue #34）：鲸鱼左侧底部，三态显示余额充裕度
var riceImg = document.createElement('img')
riceImg.className = 'dshwv-rice'
riceImg.alt = '余额饭量'
riceImg.draggable = false
body.appendChild(riceImg)
body.appendChild(bubbleBox)
root.appendChild(body)
root.appendChild(menuBtn)
document.body.appendChild(root)
document.body.appendChild(menuBox)

// Position model: the widget is ALWAYS expressed in left/top px (so edge snaps
// animate smoothly via the CSS transition on both sides — switching to
// right/auto cannot transition and flashes). The anchor info (h/v + offsets)
// lives in state and is used by settle() to recompute coordinates on window
// resize and size changes, keeping the widget glued to its anchored edge.
var state = {
  scale: 1.5,
  h: 'right',
  hOff: 0,
  v: 'bottom',
  vOff: 0,
  left: 0,
  top: 0,
  balance: null,
  currency: null,
  todayUsage: null,
  isPeak: false,
  accounts: [],
  accountId: null,
  primaryId: null,
  status: 'loading',
  message: '',
  currentProvider: null,
  currentModel: null
}
// 白饭状态（Issue #34）：threshold=余额底线（¥，0=关闭恒满碗）；riceLevel='full'|'half'|'empty'
var balanceThreshold = 10
var riceLevel = null
// 手动开关：是否使用平台预警阈值（开启后读 alert.json 填入底线并锁定输入框）
var usePlatformAlert = false
var busy = false
var settleTimer = null
var animDelayTimer = null
var drag = null
var shown = null
var animId = null
var bubbleShown = false
var bubbleTimer = null
var bubbleRandomActive = false
var bubbleRandomLines = null
var BUBBLE_STYLE_CLASS = { A: 'dshwv-label', B: 'dshwv-amount', P: 'dshwv-period', C: 'dshwv-hint' }
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function singleCenter(style, text, color, wrap) { return [null, { t: text, s: style, c: color || '', w: !!wrap }, null] }
function buildGroup1() {
  var acct = currentAccount()
  if (acct && acct.kind !== 'deepseek') {
    // 非 DeepSeek 账户：直接展示该账户的余额/用量窗口摘要
    return [
      { t: accountLabel(acct), s: 'A', c: '' },
      { t: accountAmount(acct), s: 'P', c: '' },
      { t: accountHint(acct), s: 'C', c: '' },
    ]
  }
  var peak = !!state.isPeak
  var offText = '空闲时段'
  var peakText = '高峰时段'
  if (peakMode === 'liangwen') {
    offText = '梁文谷'
    peakText = '梁文峰'
  } else if (peakMode === 'qiangqiang') {
    offText = '!?谷谷?!'
    peakText = '!?峰峰?!'
  }
  return [
    { t: '当前时间段为:', s: 'A', c: '' },
    { t: peak ? peakText : offText, s: 'P', c: peak ? '#e0433f' : '#2fa24c' },
    { t: '今日已用 ' + fmt(state.todayUsage, state.currency), s: 'C', c: '' },
  ]
}
var RANDOM_GROUPS = [
  { w: 45, lines: buildGroup1 },
  { w: 7, lines: function () { return singleCenter('B', pickOne(['好模型... ↓', '好女孩...↓'])) } },
  { w: 7, lines: function () { return singleCenter('A', pickOne(['不知道用户有什么用，先赶走吧~', '我...我...我也要挣钱吗？', '我去吃饭啦，测完叫我', '压力一只蓝色大肥鱼？！', 'DeepSleep...', '坏了...用户彻底怒了！']), '', true) } },
  { w: 10, lines: function () { return { gif: true } } },
  { w: 3, lines: function () { return singleCenter('A', pickOne(['你目录里的dsh是什么...大烧货吗...?', '恭喜你实现token自由！token全跑了！', '真当我是便宜货啊...']), '', true) } },
  { w: 1, lines: function () { return singleCenter('B', '哦鲸鲸... ') } },
]
function pickRandomLines() {
  var total = 0
  for (var i = 0; i < RANDOM_GROUPS.length; i++) total += RANDOM_GROUPS[i].w
  var r = Math.random() * total
  for (var i = 0; i < RANDOM_GROUPS.length; i++) {
    r -= RANDOM_GROUPS[i].w
    if (r < 0) return RANDOM_GROUPS[i].lines()
  }
  return RANDOM_GROUPS[RANDOM_GROUPS.length - 1].lines()
}
function applyBubbleLines(lines) {
  if (lines && lines.gif) {
    // gif 台词组：只显示 gif，隐藏三行文字（display 必须显式覆盖 CSS 的 none）
    if (gifFailed) {
      // gif 加载失败/路由缺失：降级为文字台词，避免空白白色气泡
      lines = singleCenter('A', pickOne(['gif 加载失败了...', '今天没有动图给你看~', '呜呜 动图不见了...']), '', true)
    } else {
      if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
      gifEl.style.display = 'block'
      gifEl.style.opacity = ''
      labelEl.style.display = 'none'
      amountEl.style.display = 'none'
      hintEl.style.display = 'none'
      return
    }
  }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  var els = [labelEl, amountEl, hintEl]
  for (var i = 0; i < 3; i++) {
    var el = els[i]
    var ln = lines && lines[i]
    if (ln) {
      el.style.display = ''
      el.className = (BUBBLE_STYLE_CLASS[ln.s] || 'dshwv-label') + (ln.w ? ' dshwv-wrap' : '')
      el.textContent = ln.t
      el.style.color = ln.c || ''
    } else {
      el.style.display = 'none'
      el.textContent = ''
      el.style.color = ''
    }
  }
}
var bubbleSwapTimer = null
var hintFadeTimer = null
var gifFadeTimer = null
var lastHintText = null
function setHint(text) {
  // 首次/恢复（lastHintText===null）时直接写文本，不做淡出淡入——否则
  // 气泡打开或按压重开时会先淡出再淡入，造成「消失一下又出现」。
  // 只有气泡打开期间的内容变化（加载中→今日已用）才走动画。
  if (text === lastHintText) return
  var first = lastHintText === null
  lastHintText = text
  // 长提示（多账户窗口摘要）允许换行
  hintEl.classList.toggle('dshwv-wrap', text.length > 15)
  if (first || !bubbleShown) {
    hintEl.textContent = text
    return
  }
  hintEl.style.transition = 'opacity .18s ease'
  hintEl.style.opacity = '0'
  hintFadeTimer = setTimeout(function () {
    hintFadeTimer = null
    hintEl.textContent = text
    hintEl.style.opacity = '1'
    setTimeout(function () {
      hintEl.style.transition = ''
      hintEl.style.opacity = ''
    }, 220)
  }, 190)
}
function swapBubbleContent(applyFn) {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  textBox.style.transition = 'opacity .18s ease'
  textBox.style.opacity = '0'
  bubbleSwapTimer = setTimeout(function () {
    bubbleSwapTimer = null
    applyFn()
    textBox.style.opacity = '1'
    setTimeout(function () {
      textBox.style.transition = ''
      textBox.style.opacity = ''
    }, 220)
  }, 190)
}
function restoreBubbleLines() {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  lastHintText = null
  textBox.style.transition = ''
  textBox.style.opacity = ''
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = accountLabel(currentAccount())
  labelEl.style.color = ''
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  amountEl.style.color = ''
  hintEl.style.display = ''
  hintEl.className = 'dshwv-hint'
  hintEl.style.color = ''
  render()
}
function showBubble() {
  if (!bubbleOn) return
  // 消耗金额泡泡显示期间，余额变动不再弹出普通泡泡
  if (costBubbleActive) return
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  bubbleShown = true
  bubbleRandomActive = false
  restoreBubbleLines()
  bubbleBox.classList.add('dshwv-bubble-open')
  // 默认展示当前内容；点击气泡切到随机台词段；总时长 5 秒自动关闭
  bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
}
function hideBubble() {
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  textBox.style.transition = ''
  textBox.style.opacity = ''
  hintEl.style.transition = ''
  hintEl.style.opacity = ''
  bubbleRandomActive = false
  bubbleRandomLines = null
  bubbleShown = false
  // 只销毁 gif 显示；三行文字保持现状让气泡自然淡出——不能在关闭瞬间
  // 恢复成余额内容（否则随机台词界面会闪现余额）。文字恢复交给下次
  // showBubble() 的 restoreBubbleLines()（那时气泡隐藏，恢复过程不可见）。
  bubbleBox.classList.remove('dshwv-bubble-open')
  // gif 靠 CSS opacity 过渡淡出；display:none 会跳过过渡，须等淡出完成再隐藏
  gifFadeTimer = setTimeout(function () {
    gifFadeTimer = null
    gifEl.style.display = 'none'
  }, 240)
}

// —— 每轮对话消耗金额泡泡 ——
var costBubbleTimer = null
function showCostBubble(amount) {
  if (!bubbleOn || !turnCostOn) return
  if (costBubbleTimer) { clearTimeout(costBubbleTimer); costBubbleTimer = null }
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  // 取消进行中的余额数字滚动与延迟计时器，避免竞态覆盖成本金额
  if (animId) { cancelAnimationFrame(animId); animId = null }
  if (animDelayTimer) { clearTimeout(animDelayTimer); animDelayTimer = null }
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
  costBubbleActive = true
  bubbleRandomActive = false
  bubbleShown = true
  lastHintText = null
  // 样式：第一行 A（标签），第二行 B（红色金额），居中两行
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = '上一轮对话消耗:'
  labelEl.style.color = ''
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  amountEl.textContent = '¥ ' + (isFinite(amount) ? Number(amount).toFixed(2) : '--')
  amountEl.style.color = '#e0433f'
  hintEl.style.display = 'none'
  hintEl.textContent = ''
  hintEl.style.color = ''
  textBox.style.transition = ''
  textBox.style.opacity = ''
  bubbleBox.classList.add('dshwv-bubble-open')
  if (turnCostCloseMs > 0) {
    costBubbleTimer = setTimeout(hideCostBubble, turnCostCloseMs)
  }
}
function hideCostBubble() {
  if (costBubbleTimer) { clearTimeout(costBubbleTimer); costBubbleTimer = null }
  costBubbleActive = false
  hideBubble()
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function viewport() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 1280,
    h: window.innerHeight || document.documentElement.clientHeight || 800
  }
}
function rightGap() {
  // 开关关闭：贴边（不避让滚动条）
  if (!scrollGapOn) return 0
  // 开启：用用户填写的像素；填 0 也贴边
  return scrollGapPx > 0 ? scrollGapPx : 0
}
function fmt(balance, currency) {
  var num = Number(balance)
  var fixed = isFinite(num) ? num.toFixed(2) : '--'
  return currency === 'CNY' ? '¥ ' + fixed : fixed + ' ' + currency
}
// —— 多账户展示 ——
function fmtTok(n) {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}
function fmtPct(v) {
  var n = Number(v)
  if (!isFinite(n)) return '--'
  n = Math.max(0, Math.min(100, n))
  if (n >= 100) return '100%'
  if (n >= 10) return Math.round(n) + '%'
  return (Math.round(n * 10) / 10) + '%'
}
function enabledAccounts() {
  return state.accounts.filter(function (a) { return a && a.enabled !== false })
}
function currentAccount() {
  for (var i = 0; i < state.accounts.length; i++) {
    var a = state.accounts[i]
    if (a && a.id === state.accountId && a.enabled !== false) return a
  }
  return null
}
function primaryWindow(a) {
  if (!a || !a.windows) return null
  var w = a.windows
  // 套餐窗口优先：周配额 → 月配额 → 5h 速率窗。
  // 5h 即使是 0% 也是合法值，若排在最前会把 OpenCode Go / Z.AI 的大数字钉在 0%，
  // 切换套餐时看起来像没切。周/月才是订阅套餐本身。
  if (w.week && w.week.percent !== null && w.week.percent !== undefined) return w.week
  if (w.month && w.month.percent !== null && w.month.percent !== undefined) return w.month
  if (w.hours5 && w.hours5.percent !== null && w.hours5.percent !== undefined) return w.hours5
  return null
}
function accountLabel(a) {
  if (!a) return 'DeepSeek 余额'
  if (a.kind === 'deepseek') return (a.name || 'DeepSeek') + ' 余额'
  var name = a.name || a.id
  var planName = a.plan && a.plan.name ? String(a.plan.name) : ''
  if (planName && name && planName.toLowerCase() !== String(name).toLowerCase()) return name + ' · ' + planName
  return name
}
function accountAmount(a) {
  if (a && a.ok && a.balance !== null && a.balance !== undefined) return fmt(a.balance, a.currency || 'CNY')
  if (a && a.ok) {
    var w = primaryWindow(a)
    if (w) return fmtPct(w.percent)
  }
  return '--'
}
function accountHint(a) {
  if (!a) return '加载中…'
  var loc = a.local
  var l5 = !!(loc && loc.hours5 && loc.hours5.tokens > 0)
  var lw = !!(loc && loc.week && loc.week.tokens > 0)
  var lt = !!(loc && loc.today && loc.today.tokens > 0)
  if (!a.ok) {
    // 拉取失败也展示本机账本用量（如 Grok 未配密钥/team_id 时仍能看到使用量）
    var err = a.error ? String(a.error).slice(0, 14) : '获取失败'
    var lps = []
    // DeepSeek 展示只保留余额 + 今日已用：失败时不附 5h/周/今日 token 用量
    if (a.kind !== 'deepseek') {
      if (l5) lps.push('5h ' + fmtTok(loc.hours5.tokens))
      if (lw) lps.push('周 ' + fmtTok(loc.week.tokens))
      if (lt) lps.push('今日 ' + fmtTok(loc.today.tokens))
    }
    return lps.length ? err + ' · ' + lps.join(' · ') : err
  }
  var parts = []
  if (a.balance !== null && a.balance !== undefined && a.todayUsage !== null && a.todayUsage !== undefined) {
    parts.push('今日已用 ' + fmt(a.todayUsage, a.currency || 'CNY'))
  }
  var w = a.windows
  var hasW5 = !!(w && w.hours5 && w.hours5.percent !== null && w.hours5.percent !== undefined)
  var hasWk = !!(w && w.week && w.week.percent !== null && w.week.percent !== undefined)
  var hasMo = !!(w && w.month && w.month.percent !== null && w.month.percent !== undefined)
  if (hasW5) parts.push('5h ' + fmtPct(w.hours5.percent))
  if (hasWk) parts.push('周 ' + fmtPct(w.week.percent))
  if (hasMo) parts.push('月 ' + fmtPct(w.month.percent))
  // Z.AI：周 token / 调用次数是套餐页原样字段，跟百分比一起切
  if (a.kind === 'zai' && w) {
    if (w.weekTokens) parts.push(fmtTok(w.weekTokens))
    if (w.weekCalls) parts.push(w.weekCalls + '次')
  }
  // DeepSeek 展示只保留余额 + 今日已用：本机账本的 5h/周/今日 token 不上屏
  if (a.kind !== 'deepseek') {
    if (!hasW5 && l5) parts.push('5h ' + fmtTok(loc.hours5.tokens))
    if (!hasWk && lw) parts.push('周 ' + fmtTok(loc.week.tokens))
    if (lt) parts.push('今日 ' + fmtTok(loc.today.tokens))
  }
  return parts.length ? parts.join(' · ') : '暂无用量数据'
}
function selectAccount(id, persist) {
  var list = enabledAccounts()
  if (!list.length) {
    state.accountId = null
    return null
  }
  var next = null
  if (id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { next = list[i].id; break }
    }
  }
  // 未指定时优先保持当前选中账户（刷新后不跳回主账户）
  if (!next) {
    for (var k = 0; k < list.length; k++) {
      if (list[k].id === state.accountId) { next = state.accountId; break }
    }
  }
  if (!next && typeof state.primaryId === 'string') {
    for (var j = 0; j < list.length; j++) {
      if (list[j].id === state.primaryId) { next = state.primaryId; break }
    }
  }
  if (!next) next = list[0].id
  if (next !== state.accountId) {
    state.accountId = next
    state.balance = null
    state.currency = null
    state.todayUsage = null
    shown = null
    if (animId) { cancelAnimationFrame(animId); animId = null }
  }
  if (persist) {
    // 手动指定账户 = 退出「跟随当前模型」（尊重用户的显式选择）
    followOn = false
    followToggle.checked = false
    try { localStorage.setItem('dshw-account', next) } catch (err) {}
  }
  accountSelect.value = next
  return next
}
function followCurrentModel() {
  if (!followOn) return
  var prov = state.currentProvider
  if (!prov) return
  var acct = null
  for (var i = 0; i < state.accounts.length; i++) {
    var a = state.accounts[i]
    if (a && a.enabled !== false && a.kind === prov) { acct = a; break }
  }
  if (!acct || state.accountId === acct.id) return
  selectAccount(acct.id, false)
  render()
  // 切账户后立即拉取一次最新数据：展示的额度紧跟当前会话所用模型
  refresh(false)
}
function cycleAccount() {
  var list = enabledAccounts()
  if (list.length < 2) return
  var idx = -1
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === state.accountId) { idx = i; break }
  }
  selectAccount(list[(idx + 1) % list.length].id, true)
}
function accountOptionLabel(a) {
  var name = accountLabel(a)
  if (!a.ok) return name + ' · ' + (a.error ? String(a.error).slice(0, 10) : '失败')
  if (a.balance !== null && a.balance !== undefined) return name + ' · ' + fmt(a.balance, a.currency || 'CNY')
  var w = primaryWindow(a)
  return name + (w ? ' · ' + fmtPct(w.percent) : '')
}
function buildAccountSelect() {
  while (accountSelect.firstChild) accountSelect.removeChild(accountSelect.firstChild)
  var list = enabledAccounts()
  if (!list.length) {
    accountSelect.appendChild(soundOpt('', '（无账户）'))
    accountSelect.disabled = true
    return
  }
  accountSelect.disabled = false
  for (var i = 0; i < list.length; i++) {
    var o = document.createElement('option')
    o.value = list[i].id
    o.textContent = accountOptionLabel(list[i])
    accountSelect.appendChild(o)
  }
  if (state.accountId) accountSelect.value = state.accountId
}
function animateAmount(from, to, currency, duration) {
  // 消耗金额泡泡显示期间，余额数字滚动不触碰金额行
  if (costBubbleActive) return
  if (animId) cancelAnimationFrame(animId)
  if (from === null || !isFinite(from)) from = to
  if (from === to) {
    shown = to
    amountEl.textContent = fmt(to, currency)
    return
  }
  var startTime = null
  function step(ts) {
    // 帧级保护：成本泡泡出现后立即停止滚动，避免后续帧把余额写进金额行
    if (costBubbleActive) {
      animId = null
      return
    }
    if (startTime === null) startTime = ts
    var t = Math.min(1, (ts - startTime) / duration)
    var eased = 1 - Math.pow(1 - t, 3)
    var val = from + (to - from) * eased
    amountEl.textContent = fmt(val, currency)
    if (t < 1) {
      animId = requestAnimationFrame(step)
    } else {
      animId = null
      shown = to
      amountEl.textContent = fmt(to, currency)
    }
  }
  animId = requestAnimationFrame(step)
}
// 白饭档位判定（Issue #34）：跟当前展示账户同源。
// 有货币余额：>= 2*底线满碗；>= 底线半碗；否则空碗（底线 0=恒满碗；可改用平台预警阈值）。
// 订阅窗口（OpenCode Go / Z.AI / Grok）：按主窗口剩余配额——>50% 满碗；>25% 半碗；否则空碗。
// 用量 51% → 剩余 49% → 半碗（不再因订阅账户没有 CNY 余额而钉死满碗）。
function riceLevelFromBalance(num) {
  var thr = balanceThreshold
  if (usePlatformAlert && platformAlertData && isFinite(Number(platformAlertData.alertBound)) && Number(platformAlertData.alertBound) > 0) {
    thr = Number(platformAlertData.alertBound)
  }
  if (!(thr > 0)) return 'full'
  if (num >= thr * 2) return 'full'
  if (num >= thr) return 'half'
  return 'empty'
}
function riceLevelFromUsedPct(usedPct) {
  var used = Number(usedPct)
  if (!isFinite(used)) return null
  var remaining = 100 - Math.max(0, Math.min(100, used))
  if (remaining > 50) return 'full'
  if (remaining > 25) return 'half'
  return 'empty'
}
function computeRiceLevel() {
  var acct = currentAccount()
  if (acct && acct.ok) {
    if (acct.balance !== null && acct.balance !== undefined && isFinite(Number(acct.balance))) {
      return riceLevelFromBalance(Number(acct.balance))
    }
    var w = primaryWindow(acct)
    if (w && w.percent !== null && w.percent !== undefined) {
      var fromPct = riceLevelFromUsedPct(w.percent)
      if (fromPct) return fromPct
    }
  }
  if (state.balance !== null && state.balance !== undefined && isFinite(Number(state.balance))) {
    return riceLevelFromBalance(Number(state.balance))
  }
  return riceLevel || 'full'
}
function updateRice() {
  var level = computeRiceLevel()
  if (level === riceLevel && riceImg.src.indexOf(level) !== -1) return
  // 淡出 → 换图 → 加载完成后淡入
  riceImg.classList.remove('dshwv-rice-on')
  var next = level
  riceImg.onload = function () {
    riceImg.onload = null
    riceLevel = next
    riceImg.classList.add('dshwv-rice-on')
  }
  riceImg.onerror = function () {
    // 图片缺失：仅记录档位，保持隐藏避免显示破图
    riceImg.onerror = null
    riceLevel = next
  }
  riceImg.src = '/dsh-whale/rice.png?level=' + level
}
// 初始化：等首次图片加载完成后显示（若无余额数据也默认展示满碗，避免空白）
riceImg.onload = function () {
  riceImg.onload = null
  riceLevel = 'full'
  riceImg.classList.add('dshwv-rice-on')
}
function render() {
  // 白饭跟账户额度走，不吃消耗泡泡的早退——否则 turn/end 把用量顶到半碗时
  // 泡泡挡住换图，关闭后又没有二次 render，碗会一直停在满的。
  updateRice()
  // 消耗金额泡泡显示期间，余额渲染不覆盖其内容（金额行/标题行/提示行）
  if (costBubbleActive) return
  var acct = currentAccount()
  var amount, hint
  if (state.status === 'error') {
    amount = shown !== null ? fmt(shown, state.currency) : '--'
    hint = state.message ? state.message.slice(0, 14) : '获取失败 · 点击重试'
  } else if (!acct || !acct.ok) {
    amount = state.status === 'loading' ? '…' : '--'
    hint = state.status === 'loading' ? '加载中…' : (acct && acct.error ? String(acct.error).slice(0, 14) : '获取失败 · 点击重试')
  } else {
    amount = accountAmount(acct)
    // DeepSeek 余额沿用数字滚动动画（shown 由 animateAmount 驱动）
    if (acct.kind === 'deepseek' && shown !== null) amount = fmt(shown, state.currency)
    hint = accountHint(acct)
  }
  labelEl.textContent = accountLabel(acct)
  amountEl.textContent = amount
  if (bubbleRandomActive && bubbleRandomLines) {
    applyBubbleLines(bubbleRandomLines)
  } else {
    setHint(hint)
  }
}
function express() {
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = state.left + 'px'
  root.style.top = state.top + 'px'
  root.classList.toggle('dshwv-left', state.h === 'left')
}
function settle() {
  var vp = viewport()
  var w = root.offsetWidth || root.getBoundingClientRect().width || 0
  var h = root.offsetHeight || root.getBoundingClientRect().height || 0
  if (drag && drag.active) {
    // mid-drag resize: keep the pointer-follow position, just clamp into view
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()))
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
    express()
    return
  }
  if (state.h === 'right') {
    state.left = Math.max(0, vp.w - w - state.hOff - rightGap())
  } else if (state.h === 'left') {
    state.left = state.hOff
  } else {
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()))
  }  if (state.v === 'bottom') {
    state.top = Math.max(0, vp.h - h - state.vOff)
  } else if (state.v === 'top') {
    state.top = state.vOff
  } else {
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
  }
  express()
}
function refresh(manual) {
  if (busy) return
  busy = true
  if (animDelayTimer) { clearTimeout(animDelayTimer); animDelayTimer = null }
  if (manual) { state.status = 'loading'; render() }
  var ctrl = null
  var timer = null
  try {
    ctrl = new AbortController()
    timer = setTimeout(function () { try { ctrl.abort() } catch (err) {} }, FETCH_TIMEOUT_MS)
  } catch (err) {}
  fetch(BALANCE_URL, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (data && data.ok) {
        state.primaryId = data.primaryId || state.primaryId
        state.accounts = Array.isArray(data.accounts) ? data.accounts : []
        buildAccountSelect()
        selectAccount(null, false)
        // 账户列表就绪后立即按当前会话模型对齐一次（SSE sync 可能先于余额接口到达）
        followCurrentModel()
        var acct = currentAccount()
        if (!acct) {
          state.status = 'error'
          state.message = '没有启用的账户'
          render()
          return
        }
        if (!acct.ok) {
          state.status = 'error'
          state.message = acct.error || '获取失败'
          render()
          return
        }
        state.message = ''
        state.todayUsage = acct.todayUsage !== undefined ? acct.todayUsage : null
        state.isPeak = !!acct.isPeak
        if (acct.balance !== null && acct.balance !== undefined) {
          var nb = Number(acct.balance)
          var nc = String(acct.currency || 'CNY')
          var changed = state.balance !== null && (nb !== state.balance || nc !== state.currency)
          var currencyChanged = state.currency !== null && nc !== state.currency
          state.balance = nb
          state.currency = nc
          if (changed && !currencyChanged) {
            if (!manual) {
              showBubble()
              state.status = 'changing'
              // balance-change bubble: wait 0.3s after it floats out, then roll the number
              if (animDelayTimer) clearTimeout(animDelayTimer)
              animDelayTimer = setTimeout(function () {
                animDelayTimer = null
                animateAmount(shown, nb, nc, ANIM_MS)
              }, 300)
              if (settleTimer) clearTimeout(settleTimer)
              settleTimer = setTimeout(function () {
                settleTimer = null
                if (state.status === 'changing') { state.status = 'ok'; render() }
              }, CHANGE_MS + 300)
            } else {
              animateAmount(shown, nb, nc, ANIM_MS)
              state.status = 'ok'
              render()
            }
          } else {
            if (animId === null) shown = nb
            state.status = 'ok'
            render()
          }
        } else {
          // 订阅类账户（百分比窗口）没有货币余额：直接渲染，不做滚动动画
          state.balance = null
          state.currency = acct.currency || null
          if (animId) { cancelAnimationFrame(animId); animId = null }
          shown = null
          state.status = 'ok'
          render()
        }
      } else {
        state.status = 'error'
        state.message = (data && data.error) ? String(data.error) : '获取失败'
        render()
      }
    })
    .catch(function () {
      state.status = 'error'
      state.message = '获取失败'
      render()
    })
    .finally(function () {
      busy = false
      if (timer) clearTimeout(timer)
    })
}
var soundOn = true
var soundVol = 0.9
var soundSet = 'duck'
var usageMode = 'ledger'
var peakMode = 'default'
var bubbleOn = true
var turnCostOn = true
var turnCostCloseMs = 5000
var costBubbleActive = false
var scrollGapOn = false
var scrollGapPx = 17
var accountCycleOn = true
var followOn = true
function saveConfig() {
  try {
    fetch(SIZE_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: state.scale, sound: soundOn, vol: soundVol, soundSet: soundSet, usageMode: usageMode, peakMode: peakMode, bubbleOn: bubbleOn, turnCostOn: turnCostOn, turnCostCloseMs: turnCostCloseMs, scrollGapOn: scrollGapOn, scrollGapPx: scrollGapPx, accountCycleOn: accountCycleOn, followOn: followOn, threshold: balanceThreshold, usePlatformAlert: usePlatformAlert }) })
    // 锚点位置记忆：记录相对边框的离边距离，窗口 resize 后保持（localStorage）。
    // v:2 = 净距离格式（剥离避让距离），v:1 旧格式含避让距离，恢复时废弃旧格式。
    var vp = viewport()
    var w = root.offsetWidth || root.getBoundingClientRect().width || 0
    var h = root.offsetHeight || root.getBoundingClientRect().height || 0
    var leftDist = state.left
    var rightDist = vp.w - state.left - w
    var topDist = state.top
    var bottomDist = vp.h - state.top - h
    var hAnchor = leftDist <= rightDist ? 'left' : 'right'
    var hDistRaw = Math.round(Math.min(leftDist, rightDist))
    var hDist = hAnchor === 'right' && scrollGapOn ? Math.max(0, hDistRaw - rightGap()) : hDistRaw
    localStorage.setItem('dshw-pos', JSON.stringify({
      v: 2,
      hAnchor: hAnchor,
      hDist: hDist,
      vAnchor: topDist <= bottomDist ? 'top' : 'bottom',
      vDist: Math.round(Math.min(topDist, bottomDist))
    }))
  } catch (err) {}
}
function setUsageMode(v) {
  usageMode = v === 'token' ? 'token' : 'ledger'
  usageSelect.value = usageMode
  saveConfig()
  refresh(false)
}
function setPeakMode(v) {
  peakMode = v === 'liangwen' || v === 'qiangqiang' ? v : 'default'
  peakSelect.value = peakMode
  saveConfig()
}
function setBubbleOn(v) {
  bubbleOn = !!v
  bubbleToggle.checked = bubbleOn
  saveConfig()
  // 必须走 hideCostBubble：残留的 costBubbleActive 会让 render()/showBubble() 永久早退
  if (!bubbleOn) hideCostBubble()
}
function setTurnCostOn(v) {
  turnCostOn = !!v
  turnCostToggle.checked = turnCostOn
  turnCostCloseInput.disabled = !turnCostOn
  saveConfig()
  if (!turnCostOn) hideCostBubble()
}
function setTurnCostClose(v) {
  if (!turnCostOn) return
  var n = Math.max(0, Math.round(Number(v) || 0))
  turnCostCloseMs = n * 1000
  turnCostCloseInput.value = String(n)
  saveConfig()
}
function setScrollGapOn(v) {
  scrollGapOn = !!v
  scrollGapToggle.checked = scrollGapOn
  scrollGapInput.disabled = !scrollGapOn
  saveConfig()
  settle()
}
function setScrollGapPx(v) {
  if (!scrollGapOn) return
  var n = Math.max(0, Math.round(Number(v) || 0))
  scrollGapPx = n
  scrollGapInput.value = String(n)
  saveConfig()
  settle()
}
function setAccountCycleOn(v) {
  accountCycleOn = !!v
  accountCycleToggle.checked = accountCycleOn
  saveConfig()
}
function setFollowOn(v) {
  followOn = !!v
  followToggle.checked = followOn
  saveConfig()
  if (followOn) followCurrentModel()
}
function setThreshold(v) {
  // 使用平台预警阈值期间输入框已锁定，这里是双保险
  if (usePlatformAlert) return
  var n = Math.max(0, Math.round(Number(v) || 0))
  balanceThreshold = n
  thresholdInput.value = String(n)
  saveConfig()
  updateRice()
}
// —— 「使用平台预警阈值」手动开关（Issue #34）——
// 平台阈值读取状态：null=未拉取 / {enabled, alertBound}=已拉取 / fetchError=拉取失败
var platformAlertData = null
var platformAlertFetching = false
// 锁定/解锁底线输入框：锁定 → 显示平台值 + disabled；解锁 → 恢复手动编辑
function applyPlatformLock() {
  var locked = usePlatformAlert && platformAlertData && isFinite(Number(platformAlertData.alertBound)) && Number(platformAlertData.alertBound) > 0
  thresholdInput.disabled = locked
  if (locked) {
    var bound = Math.round(Number(platformAlertData.alertBound) * 100) / 100
    thresholdInput.value = String(bound)
    thresholdInput.title = '已锁定：正在使用平台预警阈值 ¥' + bound + '（来自 DeepSeek 平台设置）；关闭上方开关后可手动修改'
  } else {
    thresholdInput.value = String(balanceThreshold)
    thresholdInput.title = '余额底线（¥），低于此值显示空碗；低于 2 倍显示半碗；填 0 恒满碗'
  }
}
// 拉取平台余额预警配置并应用（开启开关时调用；失败保持输入框开放）
function fetchPlatformAlert() {
  if (platformAlertFetching) return
  platformAlertFetching = true
  thresholdInput.title = '正在读取平台预警阈值…'
  fetch(PLATFORM_ALERT_URL, { cache: 'no-store' })
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (d && d.ok && isFinite(Number(d.alertBound))) {
        platformAlertData = { enabled: d.enabled !== false, alertBound: Number(d.alertBound) }
      } else {
        platformAlertData = null
      }
      applyPlatformLock()
      updateRice()
    })
    .catch(function () { platformAlertData = null; applyPlatformLock() })
    .finally(function () { platformAlertFetching = false })
}
function toggleUsePlatformAlert(checked) {
  usePlatformAlert = !!checked
  platformAlertToggle.checked = usePlatformAlert
  saveConfig()
  if (usePlatformAlert) {
    fetchPlatformAlert()
  } else {
    // 关闭：解锁输入框，恢复手动底线
    platformAlertData = null
    applyPlatformLock()
    updateRice()
  }
}
function scaleToDisplay(s) {
  return Math.round((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19)) + 1
}
function setScale(v) {
  var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10
  // 缩放测量需要 left/top 立即到位：临时禁用过渡（滚轮/数字框路径没有
  // 滑块 pointerdown 的 transition:none，否则 r2 测的是过渡起点导致错锚点）
  var prevTrans = root.style.transition
  root.style.transition = 'none'
  var rect = root.getBoundingClientRect()
  // fixed point: the whale's corner — bottom-right when unflipped, bottom-left
  // when flipped. Growing extends the widget up-left / up-right from that
  // corner; shrinking pulls it back toward the corner. The whale always hugs
  // its corner while scaling.
  var fx = state.h === 'left' ? rect.left : rect.right
  var fy = rect.bottom
  state.scale = next
  root.style.setProperty('--dshw-scale', String(next))
  scaleInput.value = String(next)
  scaleNumber.value = String(scaleToDisplay(next))
  saveConfig()
  // keep the corner fixed while resizing; the position correction applies
  // instantly because the caller disables the transition for the whole drag
  var r2 = root.getBoundingClientRect()
  var vp = viewport()
  if (state.h === 'left') {
    state.left = Math.min(Math.max(fx, 0), Math.max(0, vp.w - r2.width))
  } else {
    state.left = Math.min(Math.max(fx - r2.width, 0), Math.max(0, vp.w - r2.width))
  }
  state.top = Math.min(Math.max(fy - r2.height, 0), Math.max(0, vp.h - r2.height))
  express()
  // 恢复过渡必须延迟到下一帧：本帧 left/top 已在 none 下设置并提交，
  // 立即恢复会让浏览器对「刚改过的 left/top」重新评估并播放过渡动画
  // （翻转时叠加 transform .3s 更明显，表现为抽搐）。
  requestAnimationFrame(function () {
    root.style.transition = prevTrans
  })
}
function setVol(v) {
  var next = Math.round(Math.min(1, Math.max(0, Number(v))) * 100) / 100
  soundVol = next
  soundOn = next > 0
  volInput.value = String(next)
  volPct.textContent = Math.round(next * 100) + '%'
  try {
    if (pressAudio) pressAudio.volume = next
    if (releaseAudio) releaseAudio.volume = next
  } catch (err) {}
  saveConfig()
}
function setSoundSet(v) {
  soundSet = v === 'fx1' ? 'fx1' : 'duck'
  soundSelect.value = soundSet
  applySoundSet()
  saveConfig()
}
var SQUISH = 'scaleY(0.88) scaleX(1.05)'
var pressAudio = null
var releaseAudio = null
var pressing = false
var pressEnded = false
var releasePlayed = false
var releaseTimer = null
function applySoundSet() {
  try {
    pressAudio = new Audio('/dsh-whale/sound/press.mp3?set=' + soundSet)
    pressAudio.preload = 'auto'
    pressAudio.volume = soundVol
    releaseAudio = new Audio('/dsh-whale/sound/release.mp3?set=' + soundSet)
    releaseAudio.preload = 'auto'
    releaseAudio.volume = soundVol
  } catch (err) {}
}
function playPress() {
  if (!pressAudio || !soundOn) return
  try {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null }
    if (releaseAudio) {
      releaseAudio.pause()
      releaseAudio.currentTime = 0
    }
    pressEnded = false
    releasePlayed = false
    pressAudio.onended = function () {
      pressEnded = true
      // fallback (duration unknown): click → Ya2 right after Ya1 ends
      if (!pressing && !releasePlayed) playRelease()
      // hold: still pressed → wait for pressUp()
    }
    pressAudio.currentTime = 0
    var p = pressAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function playRelease() {
  if (releasePlayed || !releaseAudio || !soundOn) return
  releasePlayed = true
  try {
    releaseAudio.currentTime = 0
    var p = releaseAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function pressDown() {
  body.style.transform = SQUISH
  pressing = true
  playPress()
}
function pressUp() {
  body.style.transform = 'scaleY(1) scaleX(1)'
  pressing = false
  if (pressEnded) {
    // hold (or released after Ya1 finished) → Ya2 now
    playRelease()
    return
  }
  // click: start Ya2 in the last 100ms of Ya1's playback
  var durKnown = false
  var remainMs = 0
  try {
    var dur = pressAudio ? pressAudio.duration : 0
    if (isFinite(dur) && dur > 0) {
      durKnown = true
      remainMs = (dur - pressAudio.currentTime) * 1000
    }
  } catch (err) {}
  if (durKnown) {
    releaseTimer = setTimeout(function () {
      releaseTimer = null
      playRelease()
    }, Math.max(0, remainMs - 100))
  }
  // duration unknown → pressAudio.onended fallback plays Ya2 after Ya1 ends
}
var menuOpen = false
function toggleMenu() {
  menuOpen = !menuOpen
  if (menuOpen) positionMenu()
  menuBox.classList.toggle('dshwv-menu-open', menuOpen)
  if (menuOpen) menuBtn.classList.add('dshwv-menu-btn-visible')
}
function closeMenu() {
  menuOpen = false
  menuBox.classList.remove('dshwv-menu-open')
  root.style.transition = ''
  snapCheck()
}
function snapCheck() {
  var rect = root.getBoundingClientRect()
  var vp = viewport()
  var w = rect.width, h = rect.height
  var left = rect.left, top = rect.top
  var centerX = left + w / 2
  var centerY = top + h / 2
  var moved = false
  if (centerX < vp.w / 4) {
    state.h = 'left'
    state.hOff = 0
    left = 0
    moved = true
  } else if (centerX > vp.w * 3 / 4) {
    state.h = 'right'
    state.hOff = 0
    left = vp.w - w - rightGap()
    moved = true
  } else {
    state.h = null
    state.hOff = left
  }
  if (centerY < vp.h / 4) {
    state.v = 'top'
    state.vOff = 0
    top = 0
    moved = true
  } else {
    state.v = 'bottom'
    state.vOff = Math.max(0, vp.h - top - h)
  }
  if (moved) {
    state.left = left
    state.top = top
    settle()
  }
}
function positionMenu() {
  try {
    var r = root.getBoundingClientRect()
    var b = menuBtn.getBoundingClientRect()
    var vp = viewport()
    var onLeft = r.left + r.width / 2 < vp.w / 2
    // the menu appears ABOVE the button, anchored to its side:
    // right side → menu bottom-right aligns with the button's top-right;
    // left side → menu bottom-left aligns with the button's top-left
    if (onLeft) {
      menuBox.style.left = b.left + 'px'
      menuBox.style.right = 'auto'
      menuBox.style.transformOrigin = 'bottom left'
    } else {
      menuBox.style.right = (vp.w - b.right) + 'px'
      menuBox.style.left = 'auto'
      menuBox.style.transformOrigin = 'bottom right'
    }
    menuBox.style.bottom = (vp.h - b.top) + 'px'
    menuBox.style.top = 'auto'
  } catch (err) {}
}

var hitCanvas = null
var hitReady = false
function setupHitTest() {
  try {
    hitCanvas = document.createElement('canvas')
    hitCanvas.width = 610
    hitCanvas.height = 610
    var probe = new Image()
    probe.onload = function () {
      try {
        // 拉伸到 610×610 与 isWhaleHit 的坐标映射对齐；不指定尺寸会按原图大小绘制，
        // 回退到非 610×610 素材（如 DSniang02.png）时命中区域会错位
        hitCanvas.getContext('2d').drawImage(probe, 0, 0, 610, 610)
        hitReady = true
      } catch (err) {}
    }
    probe.onerror = function () {}
    probe.src = IMG_URL
  } catch (err) {}
}
function isWhaleHit(e) {
  if (!hitCanvas || !hitReady) return true
  try {
    var r = img.getBoundingClientRect()
    if (!r || r.width <= 0 || r.height <= 0) return false
    var lx = (e.clientX - r.left) / r.width * 610
    var ly = (e.clientY - r.top) / r.height * 610
    if (lx < 0 || ly < 0 || lx >= 610 || ly >= 610) return false
    if (state.h === 'left') lx = 610 - lx
    var data = hitCanvas.getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data
    return data[3] > 10
  } catch (err) {
    return true
  }
}
function onDocPointerDown(e) {
  if (e.target && e.target.closest) {
    if (e.target.closest('.dshwv-bubble') || e.target.closest('.dshwv-menu') || e.target.closest('.dshwv-menu-btn')) return
  }
  if (menuOpen) {
    closeMenu()
    return
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return
  if (!isWhaleHit(e)) return
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
  var vp = viewport()
  var rect = root.getBoundingClientRect()
  drag = { active: true, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, w: rect.width, h: rect.height, moved: false, vp: vp }
  root.classList.add('dshwv-dragging')
  pressDown()
  setWidgetCursor('grabbing')
  document.addEventListener('pointermove', onDocPointerMove, true)
  document.addEventListener('pointerup', onDocPointerUp, true)
  document.addEventListener('pointercancel', onDocPointerCancel, true)
}
function onDocPointerMove(e) {
  if (!drag || !drag.active) return
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  if (dx * dx + dy * dy >= CLICK_SQ) drag.moved = true
  // Keep the pre-drag flip orientation while dragging (state.h/v stay as they
  // were); on release endDrag() recomputes the anchors and settle() flips the
  // class with a smooth transition instead of reverting instantly.
  state.left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  state.top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  express()
}
function onDocPointerUp(e) {
  // 拦截鲸鱼区域内的 pointerup：防止下方元素（如文件行）监听 pointerup 穿透误触发
  try { if (isWhaleHit(e)) { e.preventDefault(); e.stopPropagation() } } catch (err) {}
  endDrag(e, true)
}
function onDocPointerCancel(e) { endDrag(e, false) }
function onDocClickStopper(e) {
  // 只在鲸鱼命中区域拦截 click（保持透明区 pass-through）。
  // 持久注册（不随 endDrag 移除）——click 在 pointerup 之后派发，
  // 若在 endDrag 移除会导致 click 穿透到下方元素（如误打开文件）。
  if (!isWhaleHit(e)) return
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
}
document.addEventListener('pointerdown', onDocPointerDown, true)
document.addEventListener('click', onDocClickStopper, true)

var widgetCursor = ''
function setWidgetCursor(v) {
  if (v !== widgetCursor) {
    widgetCursor = v
    try { document.body.style.cursor = v } catch (err) {}
  }
}
function onDocPointerMoveCursor(e) {
  if (drag && drag.active) { setWidgetCursor('grabbing'); return }
  var el = null
  try { el = document.elementFromPoint(e.clientX, e.clientY) } catch (err) {}
  if (el && el.closest && (el.closest('.dshwv-bubble') || el.closest('.dshwv-menu') || el.closest('.dshwv-menu-btn'))) {
    setWidgetCursor('')
    menuBtn.classList.add('dshwv-menu-btn-visible')
    return
  }
  var over = isWhaleHit(e)
  setWidgetCursor(over ? 'grab' : '')
  menuBtn.classList.toggle('dshwv-menu-btn-visible', over || menuOpen)
}
document.addEventListener('pointermove', onDocPointerMoveCursor, true)

function endDrag(e, clickAllowed) {
  if (!drag || !drag.active) return
  drag.active = false
  document.removeEventListener('pointermove', onDocPointerMove, true)
  document.removeEventListener('pointerup', onDocPointerUp, true)
  document.removeEventListener('pointercancel', onDocPointerCancel, true)
  pressUp()
  root.classList.remove('dshwv-dragging')
  setWidgetCursor(isWhaleHit(e) ? 'grab' : '')
  if (clickAllowed && !drag.moved) {
    // 点击鲸鱼：优先展示「当前会话所用模型」的账户额度并立即刷新最新数据；
    // 不再默认轮换账户——轮换只在用户关闭「跟随模型」后按「点击切换账户」开关生效
    if (followOn) {
      followCurrentModel()
    } else if (accountCycleOn && enabledAccounts().length > 1) {
      cycleAccount()
    }
    showBubble()
    refresh(true)
    return
  }
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  var left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  var top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  var centerX = left + drag.w / 2
  var centerY = top + drag.h / 2
  if (centerX < drag.vp.w / 4) {
    state.h = 'left'
    state.hOff = 0
  } else if (centerX > drag.vp.w * 3 / 4) {
    state.h = 'right'
    state.hOff = 0
  } else {
    state.h = null
    state.hOff = left
  }
  if (centerY < drag.vp.h / 4) {
    state.v = 'top'
    state.vOff = 0
  } else if (centerY > drag.vp.h * 3 / 4) {
    state.v = 'bottom'
    state.vOff = 0
  } else {
    state.v = null
    state.vOff = top
  }
  state.left = left
  state.top = top
  settle()
  // 拖拽结束立即保存锚点位置（否则刷新/关闭后位置回退到上次改菜单时）
  saveConfig()
}
// 窗口尺寸变化时：自由位置的鲸鱼按相对边框锚点重算（保持离边距离，窗口恢复原状即回原位）；
// 贴边吸附的鲸鱼走 settle()（保持贴边）
function applyAnchorPos() {
  try {
    var a = JSON.parse(localStorage.getItem('dshw-pos') || 'null')
    if (!a || a.v !== 2 || (a.hAnchor !== 'left' && a.hAnchor !== 'right') || typeof a.hDist !== 'number' ||
        (a.vAnchor !== 'top' && a.vAnchor !== 'bottom') || typeof a.vDist !== 'number') return false
    var vp = viewport()
    var w = root.offsetWidth || root.getBoundingClientRect().width || 0
    var h = root.offsetHeight || root.getBoundingClientRect().height || 0
    // 与加载恢复一致：锚点存净距离，右锚点按当前避让开关叠加
    var effectiveRightDist = a.hAnchor === 'right' ? a.hDist + (scrollGapOn ? rightGap() : 0) : a.hDist
    var l = a.hAnchor === 'left' ? a.hDist : vp.w - effectiveRightDist - w
    var t = a.vAnchor === 'top' ? a.vDist : vp.h - a.vDist - h
    state.left = clamp(l, 0, Math.max(0, vp.w - w))
    state.top = clamp(t, 0, Math.max(0, vp.h - h))
    state.h = a.hAnchor
    state.hOff = 0
    state.v = a.vAnchor
    state.vOff = 0
    express()
    return true
  } catch (err) { return false }
}
window.addEventListener('resize', function () {
  if (state.h === null && state.v === null && applyAnchorPos()) return
  settle()
})

var rect0 = root.getBoundingClientRect()
state.left = rect0.left
state.top = rect0.top
express()
render()
applySoundSet()
setupHitTest()
fetch(SIZE_URL, { cache: 'no-store' })
  .then(function (r) { return r.json() })
  .then(function (d) {
    if (d && typeof d.scale === 'number' && d.scale >= MIN_SCALE - 0.1 && d.scale <= MAX_SCALE + 0.1) {
      state.scale = d.scale
      root.style.setProperty('--dshw-scale', String(d.scale))
      scaleInput.value = String(d.scale)
      scaleNumber.value = String(scaleToDisplay(d.scale))
      settle()
    }
    if (d && typeof d.vol === 'number') {
      soundVol = d.vol
      soundOn = soundVol > 0
      volInput.value = String(soundVol)
      volPct.textContent = Math.round(soundVol * 100) + '%'
      try {
        if (pressAudio) pressAudio.volume = soundVol
        if (releaseAudio) releaseAudio.volume = soundVol
      } catch (err) {}
    }
    if (d && typeof d.soundSet === 'string') {
      soundSet = d.soundSet === 'fx1' ? 'fx1' : 'duck'
      soundSelect.value = soundSet
      applySoundSet()
    }
    if (d && typeof d.usageMode === 'string') {
      usageMode = d.usageMode === 'token' ? 'token' : 'ledger'
      usageSelect.value = usageMode
    }
    if (d && typeof d.peakMode === 'string') {
      peakMode = d.peakMode === 'liangwen' || d.peakMode === 'qiangqiang' ? d.peakMode : 'default'
      peakSelect.value = peakMode
    }
    if (d && typeof d.bubbleOn === 'boolean') {
      bubbleOn = d.bubbleOn
      bubbleToggle.checked = bubbleOn
    }
    if (d && typeof d.turnCostOn === 'boolean') {
      turnCostOn = d.turnCostOn
      turnCostToggle.checked = turnCostOn
      turnCostCloseInput.disabled = !turnCostOn
    }
    if (d && typeof d.turnCostCloseMs === 'number') {
      turnCostCloseMs = d.turnCostCloseMs > 0 ? d.turnCostCloseMs : 0
      turnCostCloseInput.value = String(Math.round(turnCostCloseMs / 1000))
    }
    if (d && typeof d.scrollGapOn === 'boolean') {
      scrollGapOn = d.scrollGapOn
      scrollGapToggle.checked = scrollGapOn
      scrollGapInput.disabled = !scrollGapOn
    }
    if (d && typeof d.scrollGapPx === 'number') {
      scrollGapPx = d.scrollGapPx > 0 ? Math.round(d.scrollGapPx) : 0
      scrollGapInput.value = String(scrollGapPx)
    }
    if (d && typeof d.accountCycleOn === 'boolean') {
      accountCycleOn = d.accountCycleOn
      accountCycleToggle.checked = accountCycleOn
    }
    if (d && typeof d.followOn === 'boolean') {
      followOn = d.followOn
      followToggle.checked = followOn
    }
    if (d && typeof d.threshold === 'number' && isFinite(d.threshold) && d.threshold >= 0) {
      balanceThreshold = d.threshold
      thresholdInput.value = String(balanceThreshold)
    }
    if (d && typeof d.usePlatformAlert === 'boolean') {
      usePlatformAlert = d.usePlatformAlert
      platformAlertToggle.checked = usePlatformAlert
      // 上次开启过平台预警：页面加载后拉取平台值并锁定输入框
      if (usePlatformAlert) fetchPlatformAlert()
    }
    // 相对边框恢复（localStorage 锚点）：窗口变化后保持离边距离。
    // 仅认 v:2 净距离格式；旧格式（含避让距离）废弃，挂件保持默认右下角吸附。
    // 恢复时还原吸附状态（hAnchor/vAnchor → state.h/v），避免挂件变自由位置
    // 导致避让调节不实时（settle 自由分支只 clamp 不重算位置）。
    try {
      var a = JSON.parse(localStorage.getItem('dshw-pos') || 'null')
      if (a && a.v === 2 && (a.hAnchor === 'left' || a.hAnchor === 'right') && typeof a.hDist === 'number' &&
          (a.vAnchor === 'top' || a.vAnchor === 'bottom') && typeof a.vDist === 'number') {
        var vpA = viewport()
        var wA = root.offsetWidth || root.getBoundingClientRect().width || 0
        var hA = root.offsetHeight || root.getBoundingClientRect().height || 0
        // 锚点存的是净距离：右锚点按当前避让开关叠加避让距离
        var effectiveRightDist = a.hAnchor === 'right' ? a.hDist + (scrollGapOn ? rightGap() : 0) : a.hDist
        var lA = a.hAnchor === 'left' ? a.hDist : vpA.w - effectiveRightDist - wA
        var tA = a.vAnchor === 'top' ? a.vDist : vpA.h - a.vDist - hA
        state.left = clamp(lA, 0, Math.max(0, vpA.w - wA))
        state.top = clamp(tA, 0, Math.max(0, vpA.h - hA))
        // 按锚点还原吸附状态（贴边锚点 → 吸附；自由位锚点 → 自由）
        state.h = a.hAnchor
        state.hOff = 0
        state.v = a.vAnchor
        state.vOff = 0
        settle()
      }
    } catch (err) {}
    // 记住上次选中的账户（跨会话）；无效时 selectAccount 会回落到 primaryId
    try {
      var savedAcct = localStorage.getItem('dshw-account')
      if (savedAcct) state.accountId = savedAcct
    } catch (err) {}
    refresh(false)
  })
  .catch(function () { refresh(false) })
setInterval(function () { refresh(false) }, REFRESH_MS)

// —— 每轮对话消耗 + 跟随当前模型：SSE 事件流（宿主实时推送，不再 1s 轮询）——
// /dsh-whale/events 连接时先下发 sync（当前模型 + 最近一轮 seq，只对齐不弹旧轮次），
// 之后模型变化推送 model、每轮结算推送 turn；断线由 EventSource 自动重连并重新 sync。
var EVENTS_URL = '/dsh-whale/events'
var lastCostSeq = 0
var lastCostAligned = false
function applyModelInfo(d) {
  state.currentProvider = (d && typeof d.currentProvider === 'string' && d.currentProvider) ? d.currentProvider : null
  state.currentModel = (d && typeof d.currentModel === 'string' && d.currentModel) ? d.currentModel : null
  followCurrentModel()
}
function connectEvents() {
  var es = null
  try { es = new EventSource(EVENTS_URL) } catch (err) { return }
  es.addEventListener('sync', function (ev) {
    try {
      var d = JSON.parse(ev.data)
      applyModelInfo(d)
      // 连接/重连同步：只对齐 seq，不弹历史轮次
      if (typeof d.seq === 'number') lastCostSeq = d.seq
      lastCostAligned = true
    } catch (err) {}
  })
  es.addEventListener('model', function (ev) {
    try { applyModelInfo(JSON.parse(ev.data)) } catch (err) {}
  })
  es.addEventListener('turn', function (ev) {
    try {
      var d = JSON.parse(ev.data)
      if (!d || typeof d.seq !== 'number') return
      if (!lastCostAligned) { lastCostSeq = d.seq; lastCostAligned = true; return }
      if (d.seq > lastCostSeq) {
        lastCostSeq = d.seq
        if (d.turn !== null && d.amount !== null) showCostBubble(Number(d.amount))
      }
    } catch (err) {}
  })
  es.onerror = function () {
    // 断线/服务器重启：EventSource 自带退避重连，重连后 sync 重新对齐，无需额外处理
  }
}
connectEvents()
})()`


const name = 'whale-balance-widget'
const inject = ['webServer', 'credentials']

function apply(ctx) {
    let imageBytes = null
    let balanceCache = null
    let balanceInFlight = null
    let gifBytes = null
    // 多账户：每账户独立的用量缓存（DeepSeek 主余额缓存仍走 balanceCache/25s）
    const accountCaches = new Map() // accountId -> { at, payload }
    const accountInflight = new Map() // accountId -> Promise（防止多标签页轮询时并发拉取同一账户）
    // 每轮对话消耗统计：按 (session.id, turn) 分桶聚合，完成后写入 lastTurn。
    // 用 Map 分桶避免主会话与子代理（spawn/fork）并行时串账。
    let turnAggs = new Map() // sessionId -> { turn, cost, tokens, lastTs }
    let lastTurn = null // { turn, amount, tokens, ts }
    let lastTurnSeq = 0
    // 最近一条 assistant/message 的模型与供应商（挂件「跟随当前对话模型」用）
    let currentModel = null // { model, provider, ts }
    const disposers = []

    // —— 本地用量事件账本：为每个供应商累计 5 小时/每周/今日 窗口（会话事件粒度）。
    // 订阅类供应商（opencode-go/zai/grok）没有统一计费余额接口时，靠它兜底；
    // DeepSeek 之外只记 token 数与调用次数，不做金额换算（各供应商定价不同）。
    function recordUsageEvent(provider, tokens, ts) {
      if (!provider || !(tokens > 0)) return
      const led = readUsageLedger()
      led.events = Array.isArray(led.events) ? led.events : []
      led.events.push({ t: ts || Date.now(), p: provider, k: Math.round(tokens) })
      // 保留 35 天、最多 4000 条
      const cutoff = Date.now() - 35 * 86400 * 1000
      led.events = led.events.filter((e) => e && typeof e.t === 'number' && e.t >= cutoff).slice(-4000)
      writeUsageLedger(led)
    }
    function computeLocalWindows(providerId) {
      const led = readUsageLedger()
      const evs = Array.isArray(led.events) ? led.events.filter((e) => e && e.p === providerId) : []
      const now = Date.now()
      const h5 = now - 5 * 3600 * 1000
      const monday = new Date()
      const dow = (monday.getDay() + 6) % 7 // 0=周一
      monday.setHours(0, 0, 0, 0)
      monday.setDate(monday.getDate() - dow)
      const weekStart = monday.getTime()
      const dayStart = new Date()
      dayStart.setHours(0, 0, 0, 0)
      const d0 = dayStart.getTime()
      const win = (from) => {
        const hit = evs.filter((e) => e.t >= from)
        let tokens = 0
        for (const e of hit) tokens += Number(e.k) || 0
        return { tokens, calls: hit.length }
      }
      return { hours5: win(h5), week: win(weekStart), today: win(d0), totalEvents: evs.length }
    }

    function finalizeTurn(sessionId) {
      const agg = turnAggs.get(sessionId)
      if (agg && agg.cost > 0) {
        lastTurn = { turn: agg.turn, amount: agg.cost, tokens: agg.tokens, ts: agg.lastTs }
        lastTurnSeq++
        broadcastTurnEvent()
      }
      if (agg && agg.provider && agg.tokens > 0) {
        recordUsageEvent(agg.provider, agg.tokens, agg.lastTs)
      }
      turnAggs.delete(sessionId)
    }
    // 监听会话事件流：assistant/message 携带每步真实 usage，按 (session,turn) 聚合；
    // turn/end 时结算该会话本轮并写入 lastTurn
    function handleSessionEvent(sessionId, event, session) {
      try {
        const type = event && event.type
        const d = event && event.data
        if (!d || typeof d !== 'object') return
        if (type === 'turn/end') {
          finalizeTurn(sessionId)
          return
        }
        if (type !== 'assistant/message') return
        // 先记录当前模型（跟随展示用）：无 usage 的空内容消息也带模型信息。
        // 只认主会话：子代理（session.header.origin==='subagent'）并行跑其他
        // 模型时不得抢走当前页面会话对应的账户展示。
        const src = d.message && d.message.source ? d.message.source : null
        const model = src && src.model ? String(src.model) : ''
        const prov = providerForSource(src && src.provider ? String(src.provider) : '', model)
        const isSubagent = !!(session && session.header && session.header.origin === 'subagent')
        if (prov && !isSubagent) {
          const prevM = currentModel ? currentModel.model : null
          const prevP = currentModel ? currentModel.provider : null
          currentModel = { model: model || null, provider: prov, ts: Date.now() }
          // 模型/供应商变化 → SSE 实时推给浏览器（挂件立即切换账户）
          if ((model || null) !== prevM || prov !== prevP) broadcastModelEvent()
        }
        const turn = Number(d.turn)
        const usage = d.usage
        if (!usage || typeof usage !== 'object' || !isFinite(turn)) return
        let agg = turnAggs.get(sessionId)
        if (!agg || agg.turn !== turn) {
          if (agg) finalizeTurn(sessionId)
          agg = { turn, cost: 0, tokens: 0, lastTs: Date.now(), provider: null }
          turnAggs.set(sessionId, agg)
        }
        const input = Number(usage.inputTokens) || 0
        const cache = Number(usage.cacheReadTokens) || 0
        const output = Number(usage.outputTokens) || 0
        const reasoning = Number(usage.reasoningTokens) || 0
        agg.tokens += input + cache + output + reasoning
        // 定价换算（CNY/百万 token；缓存命中=输入价，其余按各自档位）。
        // 只有 DeepSeek（或无法识别的模型，按 DeepSeek 计价兜底）才做金额换算；
        // 其他供应商的 token 只进用量账本，不做 CNY 金额（各供应商定价不同）。
        if (prov && !agg.provider) agg.provider = prov
        if (!prov || prov === 'deepseek') {
          const p = priceFor(model)
          const off = isPeakTime(Math.floor(Date.now() / 1000)) ? 1 : 0
          agg.cost += (cache / 1e6) * p.hit[off] + (input / 1e6) * p.miss[off] + ((output + reasoning) / 1e6) * p.out[off]
        }
        agg.lastTs = Date.now()
      } catch (err) {}
    }

    // 监听所有会话的追加事件；按会话 id 分桶，turn/end 时结算该会话本轮
    disposers.push(ctx.on('session/event', (session, event) => {
      const sid = session && session.id ? session.id : 'default'
      handleSessionEvent(sid, event, session)
    }))
    // 会话销毁时清理残留聚合，避免内存泄漏
    disposers.push(ctx.on('session/disposed', (session) => {
      if (session && session.id) turnAggs.delete(session.id)
    }))

    function loadGif() {
      if (gifBytes) return gifBytes
      for (const p of RUA_GIF_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            gifBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('rua gif not found')
    }

    function loadImage() {
      if (imageBytes) return imageBytes
      for (const p of IMAGE_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            imageBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('whale image not found')
    }

    function pickBalanceInfo(infos) {
      if (!Array.isArray(infos) || infos.length === 0) return null
      const num = (x) => (x && x.total_balance !== undefined ? Number(x.total_balance) : NaN)
      return (
        infos.find((x) => x && x.currency === 'CNY' && num(x) > 0) ||
        infos.find((x) => num(x) > 0) ||
        infos.find((x) => x && x.currency === 'CNY') ||
        infos[0]
      )
    }

    async function fetchBalance() {
      let cred
      try {
        cred = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
      } catch (err) {
        return { ok: false, code: 'NO_KEY', error: '凭据读取失败: ' + String((err && err.message) || err).slice(0, 160) }
      }
      if (!cred) {
        // 兜底：复用 opencode CLI 登录态里的 deepseek 密钥（与 zai/opencode-go 同策略）
        const fromAuth = readOpencodeAuthKey('deepseek')
        if (fromAuth) cred = { value: fromAuth }
      }
      if (!cred) {
        return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY' }
      }
      let lastErr = null
      for (let attempt = 0; attempt < 2; attempt++) {
        let res
        try {
          res = await fetch(BALANCE_URL, {
            headers: { Authorization: 'Bearer ' + cred.value },
            signal: AbortSignal.timeout(20000),
          })
        } catch (err) {
          lastErr = err
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        if (!res.ok) {
          lastErr = new Error('HTTP ' + res.status)
          if (res.status < 500) break
          if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
          continue
        }
        let data
        try {
          data = await res.json()
        } catch (err) {
          return { ok: false, code: 'PARSE', error: '余额接口返回不是合法 JSON' }
        }
        const info = pickBalanceInfo(data && data.balance_infos)
        if (!info || info.total_balance === undefined) {
          return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
        }
        return {
          ok: true,
          totalBalance: Number(info.total_balance),
          currency: String(info.currency || 'CNY'),
          updatedAt: new Date().toISOString(),
        }
      }
      const transient = !(lastErr && /^HTTP 4\d\d/.test(lastErr.message))
      return {
        ok: false,
        code: 'HTTP',
        transient: transient,
        error: '余额接口请求失败: ' + String((lastErr && lastErr.message) || lastErr).slice(0, 200),
      }
    }

    async function fetchUsage() {
      let cred
      try {
        cred = await ctx.credentials.resolve('DEEPSEEK_PLATFORM_TOKEN')
      } catch (err) {
        return { error: 'platform cred resolve failed' }
      }
      if (!cred) return { error: 'no platform token' }
      const token = String(cred.value).replace(/^Bearer\s+/i, '')
      try {
        const now = new Date()
        const tz = -now.getTimezoneOffset() * 60
        const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
        const end = start + 86400
        const url = 'https://platform.deepseek.com/api/v0/usage/by_api_key/amount?start=' + start + '&end=' + end + '&tz=' + tz
        const res = await fetch(url, {
          headers: { Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) return { error: 'http ' + res.status }
        const data = await res.json()
        const u = computeTodayUsage(data)
        if (u && isFinite(u.amount)) return { amount: u.amount, tokens: u.tokens }
        return { error: 'no usage' }
      } catch (err) {
        return { error: String((err && err.message) || err) }
      }
    }

    function computeTodayUsage(data) {
      // data.data.biz_data.series[]: [{model, buckets:[{time, usage:{RESPONSE_TOKEN, PROMPT_CACHE_HIT_TOKEN, PROMPT_CACHE_MISS_TOKEN}}]}]
      let d = data
      if (d && d.data && d.data.biz_data && Array.isArray(d.data.biz_data.series)) d = d.data.biz_data
      else if (d && d.data && Array.isArray(d.data.series)) d = d.data
      const series = Array.isArray(d.series) ? d.series : null
      if (!series || series.length === 0) return null
      let cost = 0
      let tokens = 0
      let found = false
      for (const s of series) {
        if (!s || typeof s !== 'object') continue
        const p = priceFor(s.model)
        const buckets = Array.isArray(s.buckets) ? s.buckets : []
        for (const b of buckets) {
          const u = b && b.usage
          if (!u || typeof u !== 'object') continue
          const hit = Number(u.PROMPT_CACHE_HIT_TOKEN) || 0
          const miss = Number(u.PROMPT_CACHE_MISS_TOKEN) || 0
          const out = Number(u.RESPONSE_TOKEN) || 0
          if (hit + miss + out === 0) continue
          found = true
          tokens += hit + miss + out
          const pi = isPeakTime(b.time) ? 1 : 0
          cost += (hit / 1e6) * p.hit[pi] + (miss / 1e6) * p.miss[pi] + (out / 1e6) * p.out[pi]
        }
      }
      return found ? { amount: cost, tokens: tokens } : null
    }

    // ==================== 多账户 / 多供应商支持 ====================
    function readProviders() {
      for (const p of PROVIDERS_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && parsed.accounts && Array.isArray(parsed.accounts)) return parsed
        } catch (err) {}
      }
      return JSON.parse(JSON.stringify(DEFAULT_PROVIDERS))
    }
    function writeProviders(cfg) {
      const body = JSON.stringify({ version: 1, ...cfg, updatedAt: new Date().toISOString() }, null, 2)
      for (const p of PROVIDERS_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return true
        } catch (err) {}
      }
      return false
    }
    function mergeProvidersDefaults(cfg) {
      const base = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS))
      const known = new Map(base.accounts.map((a) => [a.id, a]))
      const accounts = Array.isArray(cfg.accounts) ? cfg.accounts
        .filter((a) => a && typeof a.id === 'string')
        .map((a) => ({ ...(known.get(a.id) || {}), ...a })) : []
      for (const a of base.accounts) {
        if (!accounts.some((x) => x.id === a.id)) accounts.push(a)
      }
      return { ...base, ...cfg, accounts, primaryId: typeof cfg.primaryId === 'string' ? cfg.primaryId : base.primaryId }
    }
    // 读 opencode CLI 的本地登录态：auth.json 里存有 opencode-go / zai / zai-coding-plan 的密钥
    function readOpencodeAuthKey(fileKey, altKey) {
      try {
        const parsed = JSON.parse(fs.readFileSync(OPENCODE_AUTH_FILE, 'utf8'))
        const entry = (parsed && parsed[fileKey]) || (altKey && parsed && parsed[altKey])
        if (entry && typeof entry.key === 'string' && entry.key) return entry.key
      } catch (err) {}
      return null
    }
    async function resolveAccountKey(acct) {
      const creds = Array.isArray(acct.keyCreds) ? acct.keyCreds : []
      for (const name of creds) {
        try {
          const c = await ctx.credentials.resolve(name)
          if (c && c.value) return String(c.value)
        } catch (err) {}
      }
      if (acct.keyFile) {
        const k = readOpencodeAuthKey(acct.keyFile, acct.keyFileAlt)
        if (k) return k
      }
      return null
    }
    function normPct(x) {
      const n = Number(x)
      return isFinite(n) ? Math.max(0, Math.min(100, n)) : null
    }

    async function fetchOpenCodeGoAccount(acct, key) {
      let res
      try {
        res = await fetch(OPENCODE_GO_USAGE_URL, {
          headers: {
            Authorization: 'Bearer ' + key,
            'x-api-key': key,
            Accept: 'application/json',
            'User-Agent': OPENCODE_GO_UA,
          },
          signal: AbortSignal.timeout(15000),
        })
      } catch (err) {
        return { ok: false, transient: true, error: 'OpenCode Go 接口请求失败: ' + String((err && err.message) || err).slice(0, 120) }
      }
      if (!res.ok) return { ok: false, transient: res.status >= 500, error: 'OpenCode Go HTTP ' + res.status }
      let data
      try { data = await res.json() } catch (err) { return { ok: false, error: 'OpenCode Go 返回异常' } }
      // 官方错误体：{type:'error', error:{type,message}}（HTTP 200 时也可能携带，
      // 如 key 失效）；提取真实错误信息而不是报「结构异常」。
      if (data && data.error) {
        const e = data.error
        const msg = typeof e === 'string' ? e : ((e && (e.message || e.type)) || '接口返回错误')
        return { ok: false, code: 'API', error: 'OpenCode Go: ' + String(msg).slice(0, 100) }
      }
      const u = data && data.usage
      if (!u) return { ok: false, error: 'OpenCode Go 用量结构异常' }
      const win = (w) => (w && typeof w === 'object' ? {
        percent: normPct(w.percent),
        status: typeof w.status === 'string' ? w.status : null,
        resetsAt: typeof w.resetsAt === 'string' ? w.resetsAt : null,
      } : null)
      return {
        ok: true,
        data: {
          windows: {
            hours5: win(u.rolling),
            week: win(u.weekly),
            month: win(u.monthly),
          },
          subscribedAt: typeof data.subscribedAt === 'string' ? data.subscribedAt : null,
        },
      }
    }

    async function fetchZaiAccount(acct, key) {
      const headers = { Authorization: 'Bearer ' + key, 'Accept-Language': 'en-US,en' }
      const get = async (url) => {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return await res.json()
      }
      let quota = null
      let plan = null
      let week = null
      const quotaP = get(ZAI_MONITOR_QUOTA_URL).then((d) => { quota = d && d.data ? d.data : null }).catch(() => {})
      const planP = get(ZAI_SUBSCRIPTION_URL).then((d) => { plan = (d && d.data && d.data[0]) || null }).catch(() => {})
      await Promise.all([quotaP, planP])
      if (!quota) {
        return { ok: false, transient: false, error: 'Z.AI 用量接口不可用（请确认 API Key 属于 GLM Coding Plan 账户）' }
      }
      const windows = { hours5: null, week: null, month: null, searches: null }
      const limits = Array.isArray(quota.limits) ? quota.limits : []
      for (const l of limits) {
        if (!l || typeof l !== 'object') continue
        const type = String(l.type || '')
        const slot = type === 'TIME_LIMIT' ? 'searches' : zaiWindowSlot(l)
        if (!windows[slot]) {
          windows[slot] = {
            percent: normPct(l.percentage),
            usage: Number(l.usage) || Number(l.currentValue) || null,
            limit: Number(l.limit) || Number(l.number) || null,
            remaining: Number(l.remaining) || null,
            resetsAt: l.nextResetTime ? new Date(Number(l.nextResetTime)).toISOString() : null,
            unit: zaiWindowMeta(l).name,
            type: type,
          }
        }
      }
      // 7 天用量（token 与调用次数）：从 model-usage 小时桶汇总
      const now = new Date()
      const fmt = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
        ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0')
      const end = now
      const start7 = new Date(now.getTime() - 7 * 86400 * 1000)
      try {
        const d = await get(ZAI_MODEL_USAGE_URL + '?startTime=' + encodeURIComponent(fmt(start7)) + '&endTime=' + encodeURIComponent(fmt(end)))
        const dd = d && d.data
        const tu = dd && dd.totalUsage
        if (tu) {
          week = {
            tokens: Number(tu.totalTokensUsage) || 0,
            calls: Number(tu.totalModelCallCount) || 0,
            models: Array.isArray(tu.modelSummaryList) ? tu.modelSummaryList.slice(0, 6).map((m) => ({ name: m.modelName, tokens: m.totalTokens })) : null,
          }
        }
      } catch (err) {}
      return {
        ok: true,
        data: {
          windows,
          week,
          plan: plan ? { name: plan.productName || plan.planName || null, status: plan.status || null, valid: plan.valid || null, renewTime: plan.nextRenewTime || null } : null,
          level: typeof quota.level === 'string' ? quota.level : null,
        },
      }
    }

    // —— Grok OAuth 登录态：读取 / 过期续期 / 原子写回 ——
    // 与 open-grok-build（dsh-coding-subscription-oauth）插件共享同一个文件：
    // 结构 {version, credential:{type,access,refresh,expires(ms)}}。续期用官方
    // xAI token 端点（refresh_token grant + 公共 client_id，无 secret；xAI 会
    // 轮换 refresh_token，响应缺省时沿用旧值）。写回必须原子（写前重读合并、
    // tmp+rename、0600），避免与插件并发写时互相覆盖对方的字段。
    let grokOAuthRefreshInflight = null // 单飞：并发观测只续期一次
    function readGrokOAuthFile(acct) {
      const candidates = []
      if (typeof acct.oauthAuthFile === 'string' && acct.oauthAuthFile.trim()) {
        candidates.push(acct.oauthAuthFile.trim())
      }
      for (const p of GROK_OAUTH_FILE_CANDIDATES) candidates.push(p)
      for (const p of candidates) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          const cred = parsed && parsed.credential
          if (cred && typeof cred.access === 'string' && cred.access) return { file: p, doc: parsed, cred }
        } catch (err) {}
      }
      return null
    }
    function writeGrokOAuthFile(file, doc) {
      try {
        let merged = doc
        try {
          const cur = JSON.parse(fs.readFileSync(file, 'utf8'))
          merged = { ...cur, ...doc, credential: { ...(cur.credential || {}), ...doc.credential } }
        } catch (err) {}
        const tmp = file + '.tmp-' + process.pid
        fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), { mode: 0o600 })
        fs.renameSync(tmp, file)
        try { fs.chmodSync(file, 0o600) } catch (err) {}
        return true
      } catch (err) {
        return false
      }
    }
    async function refreshGrokOAuth(refreshToken) {
      const res = await fetch(GROK_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: GROK_OAUTH_CLIENT_ID,
          refresh_token: refreshToken,
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) throw new Error('token endpoint HTTP ' + res.status)
      const tok = await res.json()
      if (!tok || typeof tok.access_token !== 'string' || !tok.access_token) {
        throw new Error('token endpoint 无 access_token')
      }
      const expiresIn = Number.isFinite(tok.expires_in) && tok.expires_in > 0 ? tok.expires_in : 3600
      return {
        access: tok.access_token,
        // xAI 可能轮换 refresh_token；响应没带时沿用旧值
        refresh: typeof tok.refresh_token === 'string' && tok.refresh_token ? tok.refresh_token : refreshToken,
        expires: Date.now() + expiresIn * 1000,
      }
    }
    async function getGrokOAuthAccessToken(acct) {
      const found = readGrokOAuthFile(acct)
      if (!found) return null
      const { file, doc, cred } = found
      // 距过期 > 60 秒：直接复用（不碰文件，也不打印/落盘任何令牌明文）
      const expires = Number(cred.expires)
      if (Number.isFinite(expires) && expires - Date.now() > 60000) return cred.access
      // 过期：refresh_token 续期。单飞防止多标签页同时轮换令牌互相作废。
      if (!grokOAuthRefreshInflight) {
        grokOAuthRefreshInflight = (async () => {
          const fresh = await refreshGrokOAuth(String(cred.refresh || ''))
          writeGrokOAuthFile(file, { ...doc, credential: { ...cred, ...fresh } })
          return fresh.access
        })().finally(() => {
          grokOAuthRefreshInflight = null
        })
      }
      return grokOAuthRefreshInflight
    }

    async function fetchGrokAccount(acct, key) {
      const teamId = String(acct.teamId || '').trim()
      // ① 官方管理 API 路径（预付费余额）：需要 Management API Key + team_id
      if (teamId && key) {
        const headers = { Authorization: 'Bearer ' + key }
        const get = async (p) => {
          const res = await fetch(XAI_MGMT_API + p, { headers, signal: AbortSignal.timeout(15000) })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          return await res.json()
        }
        const pick = (obj, keys) => {
          for (const k of keys) {
            if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k]
          }
          return null
        }
        let balance = null
        let info = null
        let transient = true
        try {
          const d = await get('/v1/billing/teams/' + encodeURIComponent(teamId) + '/prepaid/balance')
          const data = (d && d.data) || d
          balance = pick(data, ['balance', 'creditBalance', 'prepaidBalance', 'credits', 'amount', 'balance_cents', 'credit_balance_cents'])
          if (typeof balance === 'object' && balance !== null) {
            balance = pick(balance, ['balance', 'credits', 'amount', 'available', 'total', 'balance_cents', 'credit_balance_cents'])
          }
          transient = false
        } catch (err) {
          const msg = String((err && err.message) || err)
          transient = !/^HTTP 4\d\d/.test(msg)
          try {
            const d2 = await get('/v1/billing/teams/' + encodeURIComponent(teamId) + '/billing-info')
            const data = (d2 && d2.data) || d2
            info = data || null
            balance = pick(data, ['balance', 'creditBalance', 'prepaidBalance', 'credits', 'amount'])
            if (typeof balance === 'object' && balance !== null) balance = pick(balance, ['balance', 'credits', 'amount', 'available', 'total'])
            if (balance !== null) transient = false
          } catch (err2) {}
          if (balance === null) {
            return { ok: false, transient, code: transient ? 'HTTP' : 'NO_AUTH', error: 'Grok 管理接口失败: ' + msg.slice(0, 120) + '（需要 Management API Key + team_id）' }
          }
        }
        return {
          ok: true,
          data: {
            balance: Number(balance),
            currency: 'USD',
            billingInfo: info,
            source: 'management-api',
          },
        }
      }
      // ② Grok OAuth 订阅路径：复用本机 grok-build 插件登录态，拉订阅用量窗口。
      //    该 token 打不了 management-api.x.ai（只认 console 签发的 key），
      //    但能打 Grok CLI 消费代理的 billing 端点（周/月百分比 + 预付费余额）。
      let token = null
      try {
        token = await getGrokOAuthAccessToken(acct)
      } catch (err) {
        return { ok: false, code: 'OAUTH_ERR', transient: true, error: 'Grok 登录态续期失败: ' + String((err && err.message) || err).slice(0, 100) }
      }
      if (!token) {
        return { ok: false, code: 'NO_AUTH', transient: false, error: '未登录 Grok（无 OAuth 登录态；配置 XAI_MGMT_API_KEY + teamId 可查预付费余额）' }
      }
      try {
        const H = { Authorization: 'Bearer ' + token, Accept: 'application/json' }
        const getJson = async (p) => {
          const res = await fetch(GROK_PROXY_URL + p, { headers: H, signal: AbortSignal.timeout(15000) })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          return await res.json()
        }
        // 周用量窗口来自 /billing?format=credits，月度窗口来自 /billing（并行）
        const [credits, monthly] = await Promise.all([
          getJson('/billing?format=credits').catch(() => null),
          getJson('/billing').catch(() => null),
        ])
        let week = null
        let month = null
        let balance = null
        let planName = null
        if (credits && credits.config) {
          const c = credits.config
          const period = c.currentPeriod || {}
          // 周用量百分比：优先 GrokBuild 产品自身的百分比（该订阅账户主产品），
          // 缺省回落到聚合 creditUsagePercent
          let pct = null
          const pu = Array.isArray(c.productUsage) ? c.productUsage : []
          const gb = pu.find((x) => x && String(x.product) === 'GrokBuild')
          const other = pu.find((x) => x && x.product && String(x.product) !== 'GrokBuild')
          if (gb && Number.isFinite(Number(gb.usagePercent))) pct = Number(gb.usagePercent)
          if (pct === null && c.creditUsagePercent !== undefined && Number.isFinite(Number(c.creditUsagePercent))) {
            pct = Number(c.creditUsagePercent)
          }
          // 套餐名随产品切换：GrokBuild 周套餐 / SuperGrok 等其他产品
          if (gb) planName = 'GrokBuild'
          else if (other && other.product) planName = String(other.product)
          const end = typeof period.end === 'string' ? period.end : (typeof c.billingPeriodEnd === 'string' ? c.billingPeriodEnd : null)
          if (pct !== null) {
            week = { percent: normPct(pct), status: null, resetsAt: end ? new Date(end).toISOString() : null }
          }
          // 预付费余额：val 单位为美分（与 pi-grok / open-grok-build 一致），>0 才展示
          const prepaid = c.prepaidBalance && Number.isFinite(Number(c.prepaidBalance.val)) ? Number(c.prepaidBalance.val) : 0
          if (prepaid > 0) balance = prepaid / 100
        }
        if (monthly && monthly.config) {
          const c = monthly.config
          const limit = c.monthlyLimit && Number.isFinite(Number(c.monthlyLimit.val)) ? Number(c.monthlyLimit.val) : 0
          const used = c.used && Number.isFinite(Number(c.used.val)) ? Number(c.used.val) : 0
          const end = typeof c.billingPeriodEnd === 'string' ? c.billingPeriodEnd : null
          // limit=0 表示无月度套餐（GrokBuild 周配额用户常态），不展示月度窗口
          if (limit > 0) {
            month = { percent: normPct((used / limit) * 100), status: null, resetsAt: end ? new Date(end).toISOString() : null }
            if (!planName) planName = 'Monthly'
          }
        }
        if (!week && !month && balance === null) {
          return { ok: false, code: 'SHAPE', transient: true, error: 'Grok 订阅接口返回异常（无用量窗口）' }
        }
        return {
          ok: true,
          data: {
            balance,
            currency: balance !== null ? 'USD' : null,
            windows: { hours5: null, week, month },
            plan: planName ? { name: planName } : null,
            source: 'oauth',
          },
        }
      } catch (err) {
        const msg = String((err && err.message) || err)
        // 代理端点异常：报错 + 本机账本兜底展示（前端已有该降级路径），不打扰用户
        return { ok: false, code: 'HTTP', transient: !/^HTTP 4\d\d/.test(msg), error: 'Grok 订阅接口失败: ' + msg.slice(0, 120) }
      }
    }

    async function fetchAccount(acct) {
      const cached = accountCaches.get(acct.id)
      const now = Date.now()
      if (cached && now - cached.at < ACCOUNT_TTL_MS) return cached.payload
      const inflight = accountInflight.get(acct.id)
      if (inflight) return inflight
      const p = (async () => {
        const key = await resolveAccountKey(acct)
        // grok 不需要密钥也能走 OAuth 登录态路径（key 为 null 时由 fetchGrokAccount 内部路由）
        if (acct.kind === 'grok') return await fetchGrokAccount(acct, key)
        if (!key) return { ok: false, code: 'NO_KEY', error: '未配置密钥' }
        if (acct.kind === 'opencode-go') return await fetchOpenCodeGoAccount(acct, key)
        if (acct.kind === 'zai') return await fetchZaiAccount(acct, key)
        return { ok: false, code: 'UNKNOWN_KIND', error: '未知账户类型: ' + acct.kind }
      })().then((payload) => {
        accountCaches.set(acct.id, { at: now, payload })
        return payload
      }).finally(() => {
        accountInflight.delete(acct.id)
      })
      accountInflight.set(acct.id, p)
      return p
    }

    function accountErrorText(acct, payload) {
      if (!payload) return ''
      if (payload.ok) return ''
      if (payload.code === 'NO_KEY') return '未配置密钥'
      if (payload.code === 'NO_TEAM') return '未配置 team_id'
      if (payload.code === 'NO_AUTH') return '未登录 Grok'
      if (payload.code === 'OAUTH_ERR') return 'Grok 登录失效'
      return String(payload.error || '获取失败').slice(0, 24)
    }

    // 首次运行时把默认账户配置落到磁盘，方便用户直接编辑（添加/停用账户、填 Grok teamId）
    function ensureProvidersFile() {
      for (const p of PROVIDERS_FILE_CANDIDATES) {
        try {
          if (fs.existsSync(p)) return
        } catch (err) {}
      }
      try {
        const first = PROVIDERS_FILE_CANDIDATES[0]
        fs.mkdirSync(path.dirname(first), { recursive: true })
        fs.writeFileSync(first, JSON.stringify(DEFAULT_PROVIDERS, null, 2), 'utf8')
      } catch (err) {}
    }
    function getProvidersConfig() {
      ensureProvidersFile()
      return mergeProvidersDefaults(readProviders())
    }
    // 把单个账户组装成挂件展示用的统一结构：余额/币种 + 远程用量窗口
    // （5 小时/每周/每月）+ 本机事件账本的 5h/周/今日 token 统计。
    async function buildAccountPayload(acct) {
      const local = computeLocalWindows(acct.id)
      if (acct.kind === 'deepseek') {
        const p = await getBalance()
        if (!p.ok) {
          return {
            id: acct.id, name: acct.name || 'DeepSeek', kind: 'deepseek', enabled: true, ok: false,
            error: String(p.error || '获取失败'), code: p.code || null,
            balance: null, currency: null, todayUsage: null, isPeak: null, usageMode: null, windows: null, local,
          }
        }
        return {
          id: acct.id, name: acct.name || 'DeepSeek', kind: 'deepseek', enabled: true, ok: true, error: null, code: null,
          balance: Number(p.totalBalance), currency: String(p.currency || 'CNY'),
          todayUsage: p.todayUsage !== undefined ? p.todayUsage : null,
          isPeak: !!p.isPeak, usageMode: p.usageMode || null,
          windows: null, local,
        }
      }
      const p = await fetchAccount(acct)
      if (!p.ok) {
        return {
          id: acct.id, name: acct.name, kind: acct.kind, enabled: true, ok: false,
          error: accountErrorText(acct, p), code: p.code || null,
          balance: null, currency: null, todayUsage: null, isPeak: null, usageMode: null, windows: null, local,
        }
      }
      const d = p.data || {}
      let windows = null
      if (acct.kind === 'opencode-go' && d.windows) {
        windows = {
          hours5: d.windows.hours5 || null,
          week: d.windows.week || null,
          month: d.windows.month || null,
        }
      }
      if (acct.kind === 'grok' && d.windows) {
        windows = {
          hours5: (d.windows && d.windows.hours5) || null,
          week: (d.windows && d.windows.week) || null,
          month: (d.windows && d.windows.month) || null,
        }
      }
      if (acct.kind === 'zai') {
        windows = {
          hours5: (d.windows && d.windows.hours5) || null,
          week: (d.windows && d.windows.week) || null,
          month: (d.windows && d.windows.month) || null,
          searches: (d.windows && d.windows.searches) || null,
        }
        if (d.week) {
          windows.weekTokens = Number(d.week.tokens) || 0
          windows.weekCalls = Number(d.week.calls) || 0
        }
      }
      const hasBalance = d.balance !== null && d.balance !== undefined && isFinite(Number(d.balance))
      return {
        id: acct.id, name: acct.name, kind: acct.kind, enabled: true, ok: true, error: null, code: null,
        balance: hasBalance ? Number(d.balance) : null,
        currency: hasBalance ? (d.currency || 'USD') : null,
        todayUsage: null, isPeak: null, usageMode: null,
        windows, local,
        plan: d.plan || null,
        level: d.level || null,
      }
    }
    // 聚合所有启用账户：DeepSeek 沿用原余额/今日已用逻辑；其余账户拉取各自
    // 订阅用量窗口（5 小时/每周/每月），并附本机事件账本的 5h/周/今日 token 统计。
    async function getAggregatePayload() {
      const cfg = getProvidersConfig()
      const accounts = (Array.isArray(cfg.accounts) ? cfg.accounts : []).filter((a) => a && a.enabled !== false)
      const list = await Promise.all(accounts.map((a) => buildAccountPayload(a).catch((err) => ({
        id: a.id, name: a.name || a.id, kind: a.kind, enabled: true, ok: false,
        error: String((err && err.message) || err).slice(0, 40), code: 'ERROR',
        balance: null, currency: null, todayUsage: null, isPeak: null, usageMode: null, windows: null,
        local: computeLocalWindows(a.id),
      }))))
      const primary = list.find((a) => a.id === cfg.primaryId) || list.find((a) => a.ok && a.balance !== null) || list[0] || null
      return {
        ok: true,
        primaryId: primary ? primary.id : null,
        accounts: list,
        // 顶层字段镜像主账户，兼容旧版挂件与主账户余额展示
        totalBalance: primary && primary.balance !== null ? primary.balance : null,
        currency: primary && primary.currency ? primary.currency : 'CNY',
        todayUsage: primary && primary.todayUsage !== undefined ? primary.todayUsage : null,
        isPeak: primary ? !!primary.isPeak : false,
        usageMode: primary && primary.usageMode ? primary.usageMode : null,
      }
    }

    function todayKey() {
      const d = new Date()
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    }
    function readUsageLedger() {
      for (const p of USAGE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed === 'object' && typeof parsed.date === 'string') return parsed
        } catch (err) {}
      }
      return { date: todayKey(), lastBalance: null, todayUsage: 0, history: {} }
    }
    function writeUsageLedger(led) {
      const body = JSON.stringify(led)
      for (const p of USAGE_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return true
        } catch (err) {}
      }
      return false
    }
    // 记账模式：每次观测到余额后，用余额正差值累计当天用量（跨天自动归零并归档）。
    // 币种感知：观测币种与上次不同时只重置基准、不记差值——数值跳变来自币种
    // 切换而非真实消费（[0] 选币时代 CNY/USD 随机切换曾记出巨额假账，见 #13）。
    function recordLedgerUsage(currentBalance, currency) {
      const t = todayKey()
      let led = readUsageLedger()
      const cur = String(currency || '')
      const currencyChanged =
        typeof led.lastCurrency === 'string' && led.lastCurrency !== '' &&
        cur !== '' && led.lastCurrency !== cur
      if (led.date !== t) {
        if (led.date && typeof led.todayUsage === 'number') {
          led.history = led.history || {}
          led.history[led.date] = led.todayUsage
        }
        led.date = t
        led.lastBalance = currentBalance
        led.lastCurrency = cur
        led.todayUsage = 0
      } else if (currencyChanged) {
        // 币种切换：只换基准，不把差值记成消费
        led.lastBalance = currentBalance
        led.lastCurrency = cur
      } else {
        const prev = typeof led.lastBalance === 'number' ? led.lastBalance : currentBalance
        // 长时间未观测（挂件停用/断网 >12h）时只重置基准，不把缺口记成当天消费
        const lastSeen = typeof led.lastSeenTs === 'number' ? led.lastSeenTs : 0
        const gapOk = lastSeen > 0 ? Date.now() - lastSeen < 12 * 3600 * 1000 : true
        if (typeof prev === 'number' && typeof currentBalance === 'number' && currentBalance < prev && gapOk) {
          led.todayUsage = (typeof led.todayUsage === 'number' ? led.todayUsage : 0) + (prev - currentBalance)
        }
        led.lastBalance = currentBalance
        led.lastCurrency = cur
      }
      led.lastSeenTs = Date.now()
      const keys = Object.keys(led.history || {}).sort()
      while (keys.length > 30) {
        delete led.history[keys.shift()]
      }
      writeUsageLedger(led)
      return led
    }
    function normalizeUsageMode(m) {
      return m === 'token' ? 'token' : 'ledger'
    }

    async function getBalancePayload() {
      const payload = await fetchBalance()
      if (!payload.ok) return payload
      // 无论哪种模式，都先把余额观测记入账本（自动累积「鲸鱼记账」数据）
      const led = recordLedgerUsage(Number(payload.totalBalance), payload.currency)
      const cfg = readSizeConfig() || {}
      const mode = normalizeUsageMode(cfg.usageMode)
      const full = { ...payload }
      full.isPeak = isPeakTime(Math.floor(Date.now() / 1000))
      if (mode === 'ledger') {
        full.todayUsage = led.todayUsage
        full.usageMode = 'ledger'
        return full
      }
      // token：尝试平台令牌实时计算
      let cred = null
      try {
        cred = await ctx.credentials.resolve('DEEPSEEK_PLATFORM_TOKEN')
      } catch (err) {}
      if (cred) {
        const u = await fetchUsage()
        if (u && u.amount !== undefined) {
          full.todayUsage = u.amount
          full.usageMode = 'token'
          return full
        }
      }
      // 无令牌或令牌失败：回落记账模式
      full.todayUsage = led.todayUsage
      full.usageMode = 'ledger'
      return full
    }

    function getBalance() {
      const now = Date.now()
      if (balanceCache && now - balanceCache.at < BALANCE_TTL_MS) {
        return Promise.resolve(balanceCache.payload)
      }
      if (balanceInFlight) return balanceInFlight
      balanceInFlight = getBalancePayload()
        .then((payload) => {
          if (payload.ok) {
            balanceCache = { at: now, payload }
            return payload
          }
          if (payload.transient && balanceCache) {
            // transient network/API blip: keep serving the last known balance
            return { ...balanceCache.payload, stale: true, error: payload.error }
          }
          if (!payload.transient) console.error('[whale-balance]', payload.code, payload.error)
          return payload
        })
        .catch((err) => ({
          ok: false,
          code: 'ERROR',
          error: '余额服务异常: ' + String((err && err.message) || err).slice(0, 200),
        }))
        .finally(() => {
          balanceInFlight = null
        })
      return balanceInFlight
    }

    function readSizeConfig() {
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed.scale === 'number') {
            return {
              scale: parsed.scale,
              sound: parsed.sound !== false,
              vol: typeof parsed.vol === 'number' ? parsed.vol : 0.9,
              soundSet: parsed.soundSet === 'fx1' ? 'fx1' : 'duck',
              usageMode: normalizeUsageMode(parsed.usageMode),
              peakMode: parsed.peakMode === 'liangwen' || parsed.peakMode === 'qiangqiang' ? parsed.peakMode : 'default',
              bubbleOn: parsed.bubbleOn !== false,
              turnCostOn: parsed.turnCostOn !== false,
              turnCostCloseMs: typeof parsed.turnCostCloseMs === 'number' ? parsed.turnCostCloseMs : 5000,
              scrollGapOn: parsed.scrollGapOn === true,
              scrollGapPx: typeof parsed.scrollGapPx === 'number' ? Math.round(parsed.scrollGapPx) : 17,
              accountCycleOn: parsed.accountCycleOn !== false,
              followOn: parsed.followOn !== false,
              // 余额底线（白饭图标档位判定用，¥；0=关闭恒满碗）与平台预警手动开关
              threshold: typeof parsed.threshold === 'number' && isFinite(parsed.threshold) ? Math.max(0, parsed.threshold) : 10,
              usePlatformAlert: parsed.usePlatformAlert === true,
            }
          }
        } catch (err) {}
      }
      return null
    }

    function writeSizeConfig(scale, sound, vol, soundSet, usageMode, peakMode, bubbleOn, turnCostOn, turnCostCloseMs, scrollGapOn, scrollGapPx, accountCycleOn, followOn, threshold, usePlatformAlert) {
      const um = normalizeUsageMode(usageMode)
      const pm = peakMode === 'liangwen' || peakMode === 'qiangqiang' ? peakMode : 'default'
      const bo = bubbleOn !== false
      const tco = turnCostOn !== false
      const tcc = typeof turnCostCloseMs === 'number' ? (turnCostCloseMs > 0 ? turnCostCloseMs : 0) : 5000
      const sgo = scrollGapOn === true
      const sgp = typeof scrollGapPx === 'number' && scrollGapPx > 0 ? Math.round(scrollGapPx) : 0
      const aco = accountCycleOn !== false
      const fo = followOn !== false
      const thr = typeof threshold === 'number' && isFinite(threshold) ? Math.max(0, threshold) : 10
      const upa = usePlatformAlert === true
      const body = JSON.stringify({
        scale: scale,
        sound: sound !== false,
        vol: typeof vol === 'number' ? vol : 0.9,
        soundSet: soundSet === 'fx1' ? 'fx1' : 'duck',
        usageMode: um,
        peakMode: pm,
        bubbleOn: bo,
        turnCostOn: tco,
        turnCostCloseMs: tcc,
        scrollGapOn: sgo,
        scrollGapPx: sgp,
        accountCycleOn: aco,
        followOn: fo,
        threshold: thr,
        usePlatformAlert: upa,
        updatedAt: new Date().toISOString(),
      })
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return {
            ok: true,
            scale: scale,
            sound: sound !== false,
            vol: typeof vol === 'number' ? vol : 0.9,
            soundSet: soundSet === 'fx1' ? 'fx1' : 'duck',
            usageMode: um,
            peakMode: pm,
            bubbleOn: bo,
            turnCostOn: tco,
            turnCostCloseMs: tcc,
            scrollGapOn: sgo,
            scrollGapPx: sgp,
            accountCycleOn: aco,
            followOn: fo,
            threshold: thr,
            usePlatformAlert: upa,
          }
        } catch (err) {}
      }
      return { ok: false, error: '无法持久化挂件尺寸' }
    }

    function readBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (c) => {
          size += c.length
          if (size > 8192) {
            reject(new Error('body too large'))
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/image.png',
      handler: (req, res) => {
        try {
          const bytes = loadImage()
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('whale image unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/rua.gif',
      handler: (req, res) => {
        try {
          const bytes = loadGif()
          res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('rua gif unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    // 白饭图标（Issue #34）：?level=full|half|empty，缺省 full；读取失败 404
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/rice.png',
      handler: (req, res) => {
        try {
          const level = riceLevelFromUrl(req.url)
          const bytes = loadRice(level)
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('rice image unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/balance.json',
      handler: async (req, res) => {
        try {
          const payload = await getAggregatePayload()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    // 平台余额预警阈值（Issue #34：白饭图标档位参照），60 秒内存缓存。
    // 防御性注册：若其他插件/PR（如 #32 投喂）已注册同路径，则静默跳过而非抛错——
    // 两个实现返回结构一致（{ok, enabled, alertBound}），任意一个生效均可。
    try {
      disposers.push(ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-whale/alert.json',
        handler: async (req, res) => {
          try {
            const payload = await fetchAlertConfig(ctx)
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify(payload))
          } catch (err) {
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String((err && err.message) || err).slice(0, 200) }))
          }
        },
      }))
    } catch (err) {
      // 路径已被占用：交由已注册的实现处理，本插件无需重复注册
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/last-turn.json',
      handler: (req, res) => {
        // 返回最近一轮已完成的对话消耗；seq 递增供前端判断「新的一轮」。
        // currentModel/currentProvider：最近一条 assistant/message 的模型，
        // 供挂件「跟随当前对话模型」自动切换展示账户。
        const base = lastTurn
          ? { ok: true, seq: lastTurnSeq, turn: lastTurn.turn, amount: lastTurn.amount, tokens: lastTurn.tokens, ts: lastTurn.ts }
          : { ok: true, seq: 0, turn: null, amount: null, tokens: null, ts: null }
        const payload = {
          ...base,
          currentModel: currentModel ? currentModel.model : null,
          currentProvider: currentModel ? currentModel.provider : null,
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(payload))
      },
    }))

    // —— SSE 事件流：宿主把「当前模型变化」与「每轮消耗结算」实时推给浏览器。
    // 挂件据此即时切换展示账户 / 弹消耗泡泡，取代原先 1s 轮询 last-turn.json ——
    const sseClients = new Set()
    function sseFrame(event, payload) {
      const data = JSON.stringify(payload)
      for (const res of Array.from(sseClients)) {
        try {
          res.write('event: ' + event + '\ndata: ' + data + '\n\n')
        } catch (err) {
          sseClients.delete(res)
        }
      }
    }
    function broadcastModelEvent() {
      sseFrame('model', {
        currentModel: currentModel ? currentModel.model : null,
        currentProvider: currentModel ? currentModel.provider : null,
      })
    }
    function broadcastTurnEvent() {
      sseFrame('turn', {
        seq: lastTurnSeq,
        turn: lastTurn ? lastTurn.turn : null,
        amount: lastTurn ? lastTurn.amount : null,
        tokens: lastTurn ? lastTurn.tokens : null,
        ts: lastTurn ? lastTurn.ts : null,
      })
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/events',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        })
        const keepAlive = setInterval(() => {
          // 心跳注释帧（EventSource 忽略）：保持长连接不被中间层/超时掐断
          try { res.write(': hb\n\n') } catch (err) { cleanup() }
        }, 25000)
        if (keepAlive && typeof keepAlive.unref === 'function') keepAlive.unref()
        const cleanup = () => {
          clearInterval(keepAlive)
          sseClients.delete(res)
          try { res.end() } catch (err) {}
        }
        sseClients.add(res)
        // 连接即同步：当前模型 + 最近一轮 seq（前端只对齐、不弹旧轮次）
        res.write('event: sync\ndata: ' + JSON.stringify({
          seq: lastTurnSeq,
          turn: lastTurn ? lastTurn.turn : null,
          amount: lastTurn ? lastTurn.amount : null,
          tokens: lastTurn ? lastTurn.tokens : null,
          ts: lastTurn ? lastTurn.ts : null,
          currentModel: currentModel ? currentModel.model : null,
          currentProvider: currentModel ? currentModel.provider : null,
        }) + '\n\n')
        req.on('close', cleanup)
        req.on('error', cleanup)
        if (res && typeof res.on === 'function') res.on('close', cleanup)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/size.json',
      handler: async (req, res) => {
        if (req.method === 'PUT' || req.method === 'POST') {
          try {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            const scale = typeof parsed.scale === 'number' ? parsed.scale : null
            if (scale === null) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'missing scale' }))
              return
            }
            // 用量模式变化时让余额缓存失效，下次请求立即按新模式计算
            if (typeof parsed.usageMode === 'string') {
              const old = readSizeConfig()
              if (!old || normalizeUsageMode(old.usageMode) !== normalizeUsageMode(parsed.usageMode)) {
                balanceCache = null
              }
            }
            const result = writeSizeConfig(scale, parsed.sound !== false, parsed.vol, parsed.soundSet, parsed.usageMode, parsed.peakMode, parsed.bubbleOn, parsed.turnCostOn, parsed.turnCostCloseMs, parsed.scrollGapOn, parsed.scrollGapPx, parsed.accountCycleOn, parsed.followOn, parsed.threshold, parsed.usePlatformAlert)
            res.writeHead(result.ok ? 200 : 500, JSON_HEADERS)
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
          }
          return
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(readSizeConfig() || {}))
      },
    }))

    // 账户配置读写：GET 返回合并默认值的账户列表；PUT 保存自定义
    // （添加/移除/启停账户、改 primaryId、填 grok.teamId 等）。
    // 配置里只存凭据名称与 opencode keyFile 引用，不含任何密钥明文。
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/providers.json',
      handler: async (req, res) => {
        try {
          if (req.method === 'PUT' || req.method === 'POST') {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            const cfg = readProviders()
            if (Array.isArray(parsed.accounts)) cfg.accounts = parsed.accounts
            if (typeof parsed.primaryId === 'string') cfg.primaryId = parsed.primaryId
            if (!writeProviders(cfg)) {
              res.writeHead(500, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: '无法持久化账户配置' }))
              return
            }
            accountCaches.clear()
            res.writeHead(200, JSON_HEADERS)
            res.end(JSON.stringify({ ok: true, config: mergeProvidersDefaults(cfg) }))
            return
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(getProvidersConfig()))
        } catch (err) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
        }
      },
    }))

    function loadSound(candidates) {
      for (const p of candidates) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) return bytes
        } catch (err) {}
      }
      return null
    }

    function serveSound(req, res, candidates) {
      const bytes = loadSound(candidates)
      if (!bytes) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('sound unavailable')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.length),
      })
      res.end(bytes)
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/sound/press.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        serveSound(req, res, set.press)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/sound/release.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        serveSound(req, res, set.release)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/widget.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(WIDGET_JS)
      },
    }))

    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf('/dsh-whale/widget.js') !== -1) return html
      const tag = '<script defer src="/dsh-whale/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }))

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
      // 断开全部 SSE 长连接（插件卸载/重启时避免悬挂连接）
      for (const res of Array.from(sseClients)) {
        try { res.end() } catch (err) {}
      }
      sseClients.clear()
    })
}

export { name, inject, apply }
