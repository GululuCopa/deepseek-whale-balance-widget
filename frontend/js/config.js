// 小鲸鱼余额挂件 · 配置窗口脚本
//
// 负责配置页的加载、表单回填、静默保存，以及与挂件窗口的实时同步。
// 重点覆盖：
// - 模型配置与供应商切换
// - 挂件显示设置与自定义音效
// - 台词列表编辑与调度参数
// - 余额展示、更新检查与弹窗交互

(function () {
  const invoke =
    window.__TAURI__ && window.__TAURI__.core
      ? window.__TAURI__.core.invoke
      : null;
  if (!invoke) return;

  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  const apiKeyEl = document.getElementById("apiKey");
  const baseUrlEl = document.getElementById("baseUrl");
  const autostartEl = document.getElementById("autostart");
  const toggleKeyEl = document.getElementById("toggleKey");
  const widgetScaleEl = document.getElementById("widgetScale");
  const widgetScaleValEl = document.getElementById("widgetScaleVal");
  const widgetSoundSetEl = document.getElementById("widgetSoundSet");
  const widgetVolEl = document.getElementById("widgetVol");
  const widgetVolPctEl = document.getElementById("widgetVolPct");
  const blinkIntervalMinSecEl = document.getElementById("blinkIntervalMinSec");
  const blinkIntervalMaxSecEl = document.getElementById("blinkIntervalMaxSec");
  const exhaustedModeEnabledEl = document.getElementById(
    "exhaustedModeEnabled",
  );
  const exhaustedBalanceThresholdEl = document.getElementById(
    "exhaustedBalanceThreshold",
  );
  const addCustomSoundEl = document.getElementById("addCustomSound");
  const globalColorEl = document.getElementById("globalColor");
  const bubbleColorEl = document.getElementById("bubbleColor");
  const resetColorEl = document.getElementById("resetColor");
  const checkUpdateEl = document.getElementById("checkUpdate");
  const tutorialEl = document.getElementById("tutorial");
  const modalOverlayEl = document.getElementById("modalOverlay");
  const tipModalEl = document.getElementById("tipModal");
  const tipMsgEl = document.getElementById("tipMsg");
  const tipOkEl = document.getElementById("tipOk");
  const confirmModalEl = document.getElementById("confirmModal");
  const confirmMsgEl = document.getElementById("confirmMsg");
  const confirmYesEl = document.getElementById("confirmYes");
  const confirmNoEl = document.getElementById("confirmNo");
  const dialogueListEl = document.getElementById("dialogueList");
  const addLineEl = document.getElementById("addLine");
  const resetLinesEl = document.getElementById("resetLines");
  const dialogueModeEl = document.getElementById("dialogueMode");
  const dialogueIntervalEl = document.getElementById("dialogueInterval");
  const dialogueJitterEl = document.getElementById("dialogueJitter");
  const dialogueJitterValEl = document.getElementById("dialogueJitterVal");
  const toggleDialogueEl = document.getElementById("toggleDialogue");
  const dialogueCardEl = document.getElementById("dialogueCard");
  const availableBalanceEl = document.getElementById("availableBalance");
  const todayUsageEl = document.getElementById("todayUsage");
  const provClaudeEl = document.getElementById("provClaude");
  const provCodexEl = document.getElementById("provCodex");

  const SCALE_MIN = 0.6;
  const SCALE_MAX = 2.5;
  const LEVEL_MIN = 1;
  const LEVEL_MAX = 20;

  // 数字档位 -> 实际缩放倍率。
  function numToScale(v) {
    return (
      SCALE_MIN +
      ((v - LEVEL_MIN) * (SCALE_MAX - SCALE_MIN)) / (LEVEL_MAX - LEVEL_MIN)
    );
  }
  function scaleToNum(s) {
    return Math.round(
      LEVEL_MIN +
        ((s - SCALE_MIN) * (LEVEL_MAX - LEVEL_MIN)) / (SCALE_MAX - SCALE_MIN),
    );
  }

  let config = null;
  let saveTimer = null;
  let widgetSaveTimer = null;
  let activeProvider = "claude"; // 'claude' | 'codex'
  let autostartPending = false;
  let blinkRangeLastChanged = null;
  let balanceRequestSeq = 0;
  let lastSavedBalanceSource = null;

  const DEFAULT_LINES = [
    "喵~主人又忘记喂我啦！",
    "哼，摸头要收费的哦！",
    "尾巴不是给你拽的啦！",
    "罐头呢？我闻到了！",
    "抱抱可以，但先给小鱼干~",
    "喵喵喵？你居然不理我？",
    "毛线球不是用来玩的吗？",
    "太阳晒够了，该撸我了~",
    "窗外的鸟好吵，还是主人好~",
    "喵~不许看别的鲸！",
    "好模型... ↓",
    "好女孩...↓",
    "不知道用户有什么用，先赶走吧~",
    "我...我...我也要挣钱吗？",
    "我去吃饭啦，测完叫我",
    "压力一只蓝色大肥鱼？！",
    "DeepSleep...",
    "坏了...用户彻底怒了！",
    "你目录里的dsh是什么...大烧货吗...?",
    "恭喜你实现token自由！token全跑了！",
    "真当我是便宜货啊...",
    "这个凶是什么意思呀...",
    "哦鲸鲸...",
  ];
  let dialogueSaveTimer = null;

  // 读取当前激活供应商对应的模型表。
  function currentModels() {
    return activeProvider === "codex" ? config.codexModels : config.models;
  }

  // 读取当前激活供应商对应的 Base URL。
  function currentBaseUrl() {
    return activeProvider === "codex" ? config.codexBaseUrl : config.baseUrl;
  }

  // 配置页通用静默保存：合并高频输入，避免逐字触发 IPC。
  function debouncedSave() {
    if (!config) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      const previousBalanceSource = lastSavedBalanceSource;
      invoke("save_config", { cfg: config })
        .then(function (saved) {
          config = saved;
          const nextBalanceSource = getBalanceSourceSnapshot(saved);
          const shouldRefreshBalance = hasBalanceSourceChanged(
            previousBalanceSource,
            nextBalanceSource,
          );
          lastSavedBalanceSource = nextBalanceSource;
          if (shouldRefreshBalance) {
            refreshBalance().catch(function (err) {
              console.error("保存后刷新余额失败", err);
            });
          }
        })
        .catch(function (err) {
          console.error("保存配置失败", err);
        });
    }, 400);
  }

  // 挂件显示配置静默保存：只提交 widget 子配置。
  function saveWidgetDebounced() {
    if (!config || !config.widget) return;
    if (widgetSaveTimer) clearTimeout(widgetSaveTimer);
    widgetSaveTimer = setTimeout(function () {
      invoke("save_widget_config", { widget: config.widget })
        .then(function (saved) {
          config.widget = saved;
        })
        .catch(function (err) {
          console.error("保存挂件配置失败", err);
        });
    }, 400);
  }

  // 台词配置静默保存：列表编辑时避免频繁落盘。
  function saveDialogueDebounced() {
    if (!config || !config.dialogue) return;
    if (dialogueSaveTimer) clearTimeout(dialogueSaveTimer);
    dialogueSaveTimer = setTimeout(function () {
      invoke("save_dialogue", { dialogue: config.dialogue })
        .then(function (saved) {
          config.dialogue = saved;
        })
        .catch(function (err) {
          console.error("保存台词失败", err);
        });
    }, 400);
  }

  function getBalanceSourceSnapshot(cfg) {
    return {
      apiKey: String((cfg && cfg.apiKey) || "").trim(),
      baseUrl: String((cfg && cfg.baseUrl) || "")
        .trim()
        .replace(/\/+$/, ""),
    };
  }

  function hasBalanceSourceChanged(previous, next) {
    if (!previous) return false;
    return previous.apiKey !== next.apiKey || previous.baseUrl !== next.baseUrl;
  }

  function renderBalancePayload(payload) {
    if (payload && payload.ok) {
      availableBalanceEl.textContent =
        "¥ " + Number(payload.totalBalance || 0).toFixed(2);
      todayUsageEl.textContent =
        "¥ " + Number(payload.todayUsage || 0).toFixed(2);
      return;
    }
    availableBalanceEl.textContent = "--";
    todayUsageEl.textContent = "--";
  }

  // 拉取余额概览并刷新配置页顶部摘要。
  function refreshBalance() {
    const requestSeq = ++balanceRequestSeq;
    return invoke("get_balance")
      .then(function (payload) {
        if (requestSeq !== balanceRequestSeq) return payload;
        renderBalancePayload(payload);
        return payload;
      })
      .catch(function (err) {
        if (requestSeq === balanceRequestSeq) {
          renderBalancePayload(null);
        }
        throw err;
      });
  }
  refreshBalance();
  setInterval(refreshBalance, 30000);

  // 将用户导入的自定义音效补充到下拉选项中。
  function restoreSoundOptions(w) {
    const custom = w && Array.isArray(w.customSounds) ? w.customSounds : [];
    const known = {};
    for (let i = 0; i < widgetSoundSetEl.options.length; i++) {
      known[widgetSoundSetEl.options[i].value] = true;
    }
    custom.forEach(function (path) {
      if (known[path]) return;
      const name = path.split(/[\\/]/).pop() || path;
      const opt = document.createElement("option");
      opt.value = path;
      opt.textContent = name;
      widgetSoundSetEl.appendChild(opt);
      known[path] = true;
    });
    const soundSet = typeof w.soundSet === "string" ? w.soundSet : "duck";
    widgetSoundSetEl.value = known[soundSet] ? soundSet : "duck";
  }

  // 把 widget 配置同步到表单控件。
  function applyWidgetToUi(w) {
    if (!w) return;
    config.widget = w;
    const level = scaleToNum(typeof w.scale === "number" ? w.scale : 1.5);
    widgetScaleEl.value = String(level);
    widgetScaleValEl.textContent = String(level);
    restoreSoundOptions(w);
    const hue = hueFromHex(w.bubbleColor || "#203170");
    bubbleColorEl.value = String(hue);
    const vol = typeof w.vol === "number" ? w.vol : 0.9;
    widgetVolEl.value = String(vol);
    widgetVolPctEl.textContent = Math.round(vol * 100) + "%";
    const blinkMin = Math.max(
      1,
      Math.floor(Number(w.blinkIntervalMinSec) || 4),
    );
    const blinkMax = Math.max(
      blinkMin,
      Math.floor(Number(w.blinkIntervalMaxSec) || 6),
    );
    w.blinkIntervalMinSec = blinkMin;
    w.blinkIntervalMaxSec = blinkMax;
    blinkIntervalMinSecEl.value = String(blinkMin);
    blinkIntervalMaxSecEl.value = String(blinkMax);
    blinkRangeLastChanged = null;
    w.exhaustedModeEnabled = w.exhaustedModeEnabled !== false;
    exhaustedModeEnabledEl.checked = w.exhaustedModeEnabled;
    const threshold =
      Math.round(Math.max(0, Number(w.exhaustedBalanceThreshold)) * 100) / 100;
    w.exhaustedBalanceThreshold = isFinite(threshold) ? threshold : 5;
    exhaustedBalanceThresholdEl.value = String(w.exhaustedBalanceThreshold);
  }

  function parseBlinkIntervalInputValue(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return null;
    const value = Math.floor(Number(text));
    if (!isFinite(value)) return null;
    return Math.max(1, value);
  }

  function isBlinkRangeInput(el) {
    return el === blinkIntervalMinSecEl || el === blinkIntervalMaxSecEl;
  }

  function saveBlinkRangeIfReady() {
    if (!config || !config.widget) return;
    const min = parseBlinkIntervalInputValue(blinkIntervalMinSecEl.value);
    const max = parseBlinkIntervalInputValue(blinkIntervalMaxSecEl.value);
    if (min === null || max === null || max < min) return;
    config.widget.blinkIntervalMinSec = min;
    config.widget.blinkIntervalMaxSec = max;
    saveWidgetDebounced();
  }

  function finalizeBlinkRange(changed) {
    if (!config || !config.widget) return;
    if (isBlinkRangeInput(document.activeElement)) return;

    let min = parseBlinkIntervalInputValue(blinkIntervalMinSecEl.value);
    let max = parseBlinkIntervalInputValue(blinkIntervalMaxSecEl.value);

    if (min === null) {
      min = Math.max(
        1,
        Math.floor(Number(config.widget.blinkIntervalMinSec) || 4),
      );
    }
    if (max === null) {
      max = Math.max(
        min,
        Math.floor(Number(config.widget.blinkIntervalMaxSec) || 6),
      );
    }
    if (changed === "min" && max < min) max = min;
    if (changed === "max" && min > max) min = max;

    config.widget.blinkIntervalMinSec = min;
    config.widget.blinkIntervalMaxSec = max;
    blinkIntervalMinSecEl.value = String(min);
    blinkIntervalMaxSecEl.value = String(max);
    saveWidgetDebounced();
  }

  // 渲染台词列表编辑区。
  function renderDialogueList() {
    if (!dialogueListEl || !config || !config.dialogue) return;
    dialogueListEl.innerHTML = "";
    const lines = config.dialogue.lines || [];
    lines.forEach(function (line, idx) {
      const row = document.createElement("div");
      row.className = "dialogue-row";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "dialogue-input";
      input.value = line;
      input.placeholder = "输入台词…";
      input.addEventListener("input", function (e) {
        config.dialogue.lines[idx] = e.target.value;
        saveDialogueDebounced();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "toggle-eye dialogue-del";
      del.textContent = "删除";
      del.addEventListener("click", function () {
        config.dialogue.lines.splice(idx, 1);
        renderDialogueList();
        saveDialogueDebounced();
      });
      row.appendChild(input);
      row.appendChild(del);
      dialogueListEl.appendChild(row);
    });
  }

  // 把台词配置同步到表单，并在缺省时补默认值。
  function applyDialogueToUi(dlg) {
    if (!dlg)
      dlg = {
        lines: DEFAULT_LINES.slice(),
        mode: "random",
        intervalMin: 5,
        jitter: 0,
      };
    config.dialogue = dlg;
    if (dialogueModeEl)
      dialogueModeEl.value =
        dlg.mode === "carousel" || dlg.mode === "random" ? dlg.mode : "random";
    if (dialogueIntervalEl)
      dialogueIntervalEl.value = String(dlg.intervalMin || 5);
    if (dialogueJitterEl) dialogueJitterEl.value = String(dlg.jitter || 0);
    if (dialogueJitterValEl)
      dialogueJitterValEl.textContent = (dlg.jitter || 0) + "%";
    renderDialogueList();
  }

  // 展开台词卡片，便于新增/重置后直接继续编辑。
  function expandDialogue() {
    if (dialogueCardEl) dialogueCardEl.classList.remove("collapsed");
    if (toggleDialogueEl) toggleDialogueEl.textContent = "收起";
  }

  // 渲染当前供应商的模型配置。
  function renderModels() {
    if (!config) return;
    baseUrlEl.value = currentBaseUrl() || "";
    document.querySelectorAll(".model-row").forEach(function (row) {
      const key = row.dataset.model;
      const m = currentModels()[key];
      row.querySelector('[data-field="name"]').value = (m && m.name) || "";
      row.querySelector('[data-field="contextWindow"]').value =
        (m && m.contextWindow) || "";
    });
    provClaudeEl.classList.toggle("active", activeProvider === "claude");
    provCodexEl.classList.toggle("active", activeProvider === "codex");
  }

  function switchProvider(provider) {
    if (activeProvider === provider) return;
    activeProvider = provider;
    renderModels();
  }
  provClaudeEl.addEventListener("click", function () {
    switchProvider("claude");
  });
  provCodexEl.addEventListener("click", function () {
    switchProvider("codex");
  });

  // 首次加载完整配置并回填全部表单。
  invoke("get_config")
    .then(function (cfg) {
      config = cfg;
      lastSavedBalanceSource = getBalanceSourceSnapshot(cfg);
      apiKeyEl.value = cfg.apiKey || "";
      autostartEl.checked = !!cfg.autostart;
      const ghue = hueFromHex(cfg.globalColor || "#203170");
      globalColorEl.value = String(ghue);
      applyGlobalColor(cfg.globalColor || "#203170");
      applyWidgetToUi(cfg.widget || {});
      applyDialogueToUi(cfg.dialogue);
      renderModels();
    })
    .catch(function (err) {
      console.error("加载配置失败", err);
    });

  // 接收配置窗口外部更新，保持表单与挂件显示同步。
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen("widget-config-changed", function (e) {
      if (!config) return;
      applyWidgetToUi(e.payload);
    });
  }

  apiKeyEl.addEventListener("input", function (e) {
    config.apiKey = e.target.value.trim();
    debouncedSave();
  });

  baseUrlEl.addEventListener("input", function (e) {
    const v = e.target.value.trim();
    if (activeProvider === "codex") config.codexBaseUrl = v;
    else config.baseUrl = v;
    debouncedSave();
  });

  toggleKeyEl.addEventListener("click", function () {
    const showing = apiKeyEl.type === "text";
    apiKeyEl.type = showing ? "password" : "text";
    toggleKeyEl.textContent = showing ? "显示" : "隐藏";
  });

  document.querySelectorAll(".model-row").forEach(function (row) {
    const key = row.dataset.model;
    row
      .querySelector('[data-field="name"]')
      .addEventListener("input", function (e) {
        const m = currentModels()[key];
        if (m) m.name = e.target.value.trim();
        debouncedSave();
      });
    row
      .querySelector('[data-field="contextWindow"]')
      .addEventListener("input", function (e) {
        const v = Math.max(1, Math.floor(Number(e.target.value) || 0));
        const m = currentModels()[key];
        if (m) m.contextWindow = v;
        debouncedSave();
      });
  });

  // 滑杆档位映射为实际缩放倍率后再保存。
  widgetScaleEl.addEventListener("input", function (e) {
    const level = Math.max(
      LEVEL_MIN,
      Math.min(LEVEL_MAX, Math.round(Number(e.target.value) || LEVEL_MIN)),
    );
    config.widget.scale = Math.round(numToScale(level) * 10) / 10;
    widgetScaleValEl.textContent = String(level);
    saveWidgetDebounced();
  });

  widgetSoundSetEl.addEventListener("change", function (e) {
    config.widget.soundSet = e.target.value;
    saveWidgetDebounced();
  });

  // 新增台词后直接聚焦最后一项，便于连续录入。
  if (addLineEl)
    addLineEl.addEventListener("click", function () {
      if (!config || !config.dialogue) return;
      expandDialogue();
      config.dialogue.lines.push("");
      renderDialogueList();
      saveDialogueDebounced();
      const inputs = dialogueListEl.querySelectorAll(".dialogue-input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

  // 一键恢复默认台词集合。
  if (resetLinesEl)
    resetLinesEl.addEventListener("click", function () {
      if (!config || !config.dialogue) return;
      expandDialogue();
      config.dialogue.lines = DEFAULT_LINES.slice();
      renderDialogueList();
      saveDialogueDebounced();
    });

  if (dialogueModeEl)
    dialogueModeEl.addEventListener("change", function (e) {
      if (!config || !config.dialogue) return;
      config.dialogue.mode = e.target.value;
      saveDialogueDebounced();
    });

  if (dialogueIntervalEl)
    dialogueIntervalEl.addEventListener("input", function (e) {
      if (!config || !config.dialogue) return;
      const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
      config.dialogue.intervalMin = v;
      dialogueIntervalEl.value = String(v);
      saveDialogueDebounced();
    });

  if (dialogueJitterEl)
    dialogueJitterEl.addEventListener("input", function (e) {
      if (!config || !config.dialogue) return;
      const v = Math.max(
        0,
        Math.min(100, Math.round(Number(e.target.value) || 0)),
      );
      config.dialogue.jitter = v;
      dialogueJitterValEl.textContent = v + "%";
      saveDialogueDebounced();
    });

  if (toggleDialogueEl)
    toggleDialogueEl.addEventListener("click", function () {
      const collapsed = dialogueCardEl.classList.toggle("collapsed");
      toggleDialogueEl.textContent = collapsed ? "展开" : "收起";
    });

  // 色相滑杆 -> Hex 主题色。
  function hexFromHue(hue) {
    // 简单 HSL(hue, 62%, 42%) → rgb → hex（中等偏浅饱和度）。
    const s = 0.62,
      l = 0.42;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (hue < 60) {
      r = c;
      g = x;
    } else if (hue < 120) {
      r = x;
      g = c;
    } else if (hue < 180) {
      g = c;
      b = x;
    } else if (hue < 240) {
      g = x;
      b = c;
    } else if (hue < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    const to = function (v) {
      return Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0");
    };
    return "#" + to(r) + to(g) + to(b);
  }

  // Hex 主题色 -> 色相滑杆值。
  function hueFromHex(hex) {
    if (!hex) return 220;
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex));
    if (!m) return 220;
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d === 0) h = 0;
    else if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    return h;
  }

  // 把全局主题色写回 CSS 变量，驱动配置页配色。
  function applyGlobalColor(color) {
    document.documentElement.style.setProperty("--primary", color);
    document.documentElement.style.setProperty("--text", color);
    document.documentElement.style.setProperty("--primary-2", color);
    document.documentElement.style.setProperty("--muted", color);
    document.documentElement.style.setProperty("--border", color + "26");
  }

  if (addCustomSoundEl)
    addCustomSoundEl.addEventListener("click", function () {
      invoke("pick_audio_file")
        .then(function (path) {
          if (!path) return;
          config.widget.customSounds = config.widget.customSounds || [];
          if (config.widget.customSounds.indexOf(path) === -1)
            config.widget.customSounds.push(path);
          const name = path.split(/[\\/]/).pop() || path;
          const opt = document.createElement("option");
          opt.value = path;
          opt.textContent = name;
          widgetSoundSetEl.appendChild(opt);
          widgetSoundSetEl.value = path;
          config.widget.soundSet = path;
          saveWidgetDebounced();
        })
        .catch(function (err) {
          console.error("选择音效失败", err);
        });
    });

  // 配置页主色实时预览并静默保存。
  if (globalColorEl)
    globalColorEl.addEventListener("input", function (e) {
      const hue = Number(e.target.value) || 0;
      const color = hexFromHue(hue);
      config.globalColor = color;
      applyGlobalColor(color);
      debouncedSave();
    });

  if (bubbleColorEl)
    bubbleColorEl.addEventListener("input", function (e) {
      const hue = Number(e.target.value) || 0;
      const color = hexFromHue(hue);
      config.widget.bubbleColor = color;
      saveWidgetDebounced();
    });

  const DEFAULT_COLOR = "#203170";
  // 同步重置全局主题色与气泡描边色。
  if (resetColorEl)
    resetColorEl.addEventListener("click", function () {
      config.globalColor = DEFAULT_COLOR;
      config.widget.bubbleColor = DEFAULT_COLOR;
      const defaultHue = hueFromHex(DEFAULT_COLOR);
      if (globalColorEl) globalColorEl.value = String(defaultHue);
      if (bubbleColorEl) bubbleColorEl.value = String(defaultHue);
      applyGlobalColor(DEFAULT_COLOR);
      debouncedSave();
      saveWidgetDebounced();
    });

  widgetVolEl.addEventListener("input", function (e) {
    const v =
      Math.round(Math.min(1, Math.max(0, Number(e.target.value))) * 100) / 100;
    config.widget.vol = v;
    widgetVolPctEl.textContent = Math.round(v * 100) + "%";
    saveWidgetDebounced();
  });

  if (blinkIntervalMinSecEl)
    blinkIntervalMinSecEl.addEventListener("input", function () {
      blinkRangeLastChanged = "min";
      saveBlinkRangeIfReady();
    });

  if (blinkIntervalMaxSecEl)
    blinkIntervalMaxSecEl.addEventListener("input", function () {
      blinkRangeLastChanged = "max";
      saveBlinkRangeIfReady();
    });

  if (blinkIntervalMinSecEl)
    blinkIntervalMinSecEl.addEventListener("blur", function () {
      const changed = blinkRangeLastChanged || "min";
      setTimeout(function () {
        finalizeBlinkRange(changed);
      }, 0);
    });

  if (blinkIntervalMaxSecEl)
    blinkIntervalMaxSecEl.addEventListener("blur", function () {
      const changed = blinkRangeLastChanged || "max";
      setTimeout(function () {
        finalizeBlinkRange(changed);
      }, 0);
    });

  if (exhaustedModeEnabledEl)
    exhaustedModeEnabledEl.addEventListener("change", function (e) {
      config.widget.exhaustedModeEnabled = !!e.target.checked;
      saveWidgetDebounced();
    });

  if (exhaustedBalanceThresholdEl)
    exhaustedBalanceThresholdEl.addEventListener("input", function (e) {
      const v =
        Math.round(Math.max(0, Number(e.target.value) || 0) * 100) / 100;
      config.widget.exhaustedBalanceThreshold = v;
      exhaustedBalanceThresholdEl.value = String(v);
      saveWidgetDebounced();
    });

  autostartEl.addEventListener("change", function (e) {
    if (!config || autostartPending) {
      e.target.checked = !!(config && config.autostart);
      return;
    }
    const enabled = e.target.checked;
    autostartPending = true;
    autostartEl.disabled = true;
    invoke("set_autostart", { enabled: enabled })
      .then(function (actual) {
        const next = !!actual;
        config.autostart = next;
        autostartEl.checked = next;
        if (enabled && !next) {
          showTip("开机自启未生效，可能已被系统或安全软件拦截。");
        }
        if (!enabled && next) {
          showTip("开机自启仍处于开启状态，请检查系统启动项或安全软件。");
        }
      })
      .catch(function (err) {
        e.target.checked = !enabled;
        console.error("设置开机自启失败", err);
        showTip("设置开机自启失败，请稍后重试。");
      })
      .finally(function () {
        autostartPending = false;
        autostartEl.disabled = false;
      });
  });

  // 统一关闭提示/确认弹窗。
  function hideModal() {
    modalOverlayEl.hidden = true;
    tipModalEl.hidden = true;
    confirmModalEl.hidden = true;
  }

  // 展示单确认按钮的提示弹窗。
  function showTip(message) {
    tipMsgEl.textContent = message;
    confirmModalEl.hidden = true;
    tipModalEl.hidden = false;
    modalOverlayEl.hidden = false;
  }

  // 展示带确认操作的弹窗。
  function showConfirm(message) {
    confirmMsgEl.textContent = message;
    tipModalEl.hidden = true;
    confirmModalEl.hidden = false;
    modalOverlayEl.hidden = false;
  }

  tipOkEl.addEventListener("click", hideModal);
  confirmNoEl.addEventListener("click", hideModal);

  modalOverlayEl.addEventListener("click", function (e) {
    if (e.target === modalOverlayEl) hideModal();
  });

  confirmYesEl.addEventListener("click", function () {
    hideModal();
    invoke("open_external", {
      url: "https://github.com/xiaolinnnnnnn/DeepSeek-Balance-Whale-Widget/tree/DeepSeek-Balance-Whale-Widget-Desktop",
    }).catch(function (err) {
      console.error("打开外部链接失败", err);
    });
  });

  if (tutorialEl)
    tutorialEl.addEventListener("click", function (e) {
      e.preventDefault();
      invoke("open_external", {
        url: "https://github.com/xiaolinnnnnnn/DeepSeek-Balance-Whale-Widget/blob/DeepSeek-Balance-Whale-Widget-Desktop/README.md",
      }).catch(function (err) {
        console.error("打开外部链接失败", err);
      });
    });

  // 检查更新后根据结果切换提示或确认弹窗。
  checkUpdateEl.addEventListener("click", function () {
    invoke("check_update")
      .then(function (res) {
        if (res && res.upToDate === true) {
          showTip("当前为最新版本，无需更新");
        } else if (res && res.upToDate === false) {
          showConfirm("当前版本过低，是否更新？");
        } else {
          showTip("检查更新失败");
        }
      })
      .catch(function (err) {
        console.error("检查更新失败", err);
        showTip("检查更新失败");
      });
  });
})();
