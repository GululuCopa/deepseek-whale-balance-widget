// 小鲸鱼余额挂件 · 初始化编排模块
//
// 在所有模块就绪后执行初始化：窗口尺寸同步、镜像翻转、首屏渲染、
// 音效/命中测试初始化、读取配置、订阅配置变更事件、快捷缩放与定时刷新。
// 依赖：其余全部模块（本文件最后加载）。

window.DSW = window.DSW || {};

(function (DSW) {
  "use strict";

  if (DSW.main) return;

  var C = DSW.C;
  var state = DSW.state;

  // 更新镜像翻转（左吸附时整体水平翻转）。
  DSW.express = function () {
    DSW.dom.root.classList.toggle("dshwv-left", state.h === "left");
  };

  // 窗口驱动缩放：--dshw-base 跟随窗口实际尺寸。
  function syncBaseFromWindow() {
    DSW.dom.root.style.setProperty("--dshw-base", (window.innerWidth || 375) + "px");
  }
  if (typeof ResizeObserver !== "undefined") {
    const baseObserver = new ResizeObserver(syncBaseFromWindow);
    baseObserver.observe(document.body);
  } else {
    window.addEventListener("resize", syncBaseFromWindow);
  }

  // 首屏初始化顺序：尺寸 -> 朝向 -> 渲染 -> 音效/命中测试 -> 空闲计时。
  syncBaseFromWindow();
  DSW.express();
  DSW.balance.render();
  DSW.audio.applySoundSet();
  DSW.hit.setupHitTest();
  DSW.expression.resetIdle();

  // 读取挂件显示配置（尺寸/音效/音量/用量模式）。
  if (DSW.invoke) {
    DSW.invoke("get_config")
      .then(function (cfg) {
        const pos = cfg && cfg.widgetPosition ? cfg.widgetPosition : null;
        if (pos && (pos.h === "left" || pos.h === "right" || pos.h === "none")) {
          state.h = pos.h;
          DSW.express();
        }
        const w = cfg && cfg.widget ? cfg.widget : null;
        if (w) {
          DSW.widgetConfig.applyWidgetConfig(w);
        }
        if (cfg && cfg.dialogue) DSW.widgetConfig.applyDialogueConfig(cfg.dialogue);
        DSW.balance.refresh(false);
      })
      .catch(function () {
        DSW.balance.refresh(false);
      });
  }

  // 监听来自配置窗口的显示设置变更并实时应用。
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen("widget-config-changed", function (e) {
      DSW.widgetConfig.applyWidgetConfig(e.payload);
    });
  }

  // 监听台词配置变更并实时应用。
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen("dialogue-changed", function (e) {
      DSW.widgetConfig.applyDialogueConfig(e.payload);
    });
  }

  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen("balance-refresh-requested", function () {
      DSW.balance.refresh(true);
    });
  }

  // Ctrl+滚轮快捷缩放（鼠标悬浮鲸鱼本体时）。
  document.addEventListener(
    "wheel",
    function (e) {
      if (!e.ctrlKey) return;
      if (!DSW.hit.isWhaleHit(e)) return;
      try {
        e.preventDefault();
      } catch (err) {}
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const next =
        Math.round(
          Math.min(C.MAX_SCALE, Math.max(C.MIN_SCALE, state.scale + delta)) * 10,
        ) / 10;
      if (next === state.scale) return;
      DSW.widgetConfig.applyScale(next);
      DSW.widgetConfig.saveConfig();
    },
    { passive: false },
  );

  // 全局禁用浏览器默认右键菜单。
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  setInterval(function () {
    DSW.balance.refresh(false);
  }, C.REFRESH_MS);

  DSW.main = {
    syncBaseFromWindow: syncBaseFromWindow,
  };
})(window.DSW);
