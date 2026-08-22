// 小鲸鱼余额挂件 · 气泡交互模块
//
// 负责气泡的显示/隐藏、三行文字切换、提示文字淡入淡出、
// 随机台词与时间气泡等交互逻辑。
// 依赖：core.js（DSW.state/DSW.flags/DSW.C）、dom.js（DSW.dom）、
//       widget-config.js（DSW.widgetConfig，运行时调用）、balance.js（DSW.balance，运行时调用）。

window.DSW = window.DSW || {};

(function (DSW) {
  "use strict";

  if (DSW.bubble) return;

  var C = DSW.C;
  var flags = DSW.flags;

  // 气泡三行文字对应的样式 class。
  var BUBBLE_STYLE_CLASS = {
    A: "dshwv-label",
    B: "dshwv-amount",
    P: "dshwv-period",
    C: "dshwv-hint",
  };

  // 生成单行居中的三行气泡结构。
  function singleCenter(style, text, color, wrap) {
    return [null, { t: text, s: style, c: color || "", w: !!wrap }, null];
  }

  // 将三行台词应用到气泡文字节点。
  function applyBubbleLines(lines) {
    const els = [DSW.dom.labelEl, DSW.dom.amountEl, DSW.dom.hintEl];
    for (let i = 0; i < 3; i++) {
      const el = els[i];
      const ln = lines && lines[i];
      if (ln) {
        el.style.display = "";
        el.className =
          (BUBBLE_STYLE_CLASS[ln.s] || "dshwv-label") +
          (ln.w ? " dshwv-wrap" : "");
        el.textContent = ln.t;
        el.style.color = ln.c || "";
      } else {
        el.style.display = "none";
        el.textContent = "";
        el.style.color = "";
      }
    }
  }

  // 设置提示行文字（气泡展示时淡入淡出切换）。
  function setHint(text) {
    if (text === flags.lastHintText) return;
    flags.lastHintText = text;
    if (flags.hintFadeTimer) {
      clearTimeout(flags.hintFadeTimer);
      flags.hintFadeTimer = null;
    }
    if (!flags.bubbleShown) {
      DSW.dom.hintEl.textContent = text;
      return;
    }
    DSW.dom.hintEl.style.transition = "opacity .18s ease";
    DSW.dom.hintEl.style.opacity = "0";
    flags.hintFadeTimer = setTimeout(function () {
      flags.hintFadeTimer = null;
      DSW.dom.hintEl.textContent = text;
      DSW.dom.hintEl.style.opacity = "1";
      setTimeout(function () {
        DSW.dom.hintEl.style.transition = "";
        DSW.dom.hintEl.style.opacity = "";
      }, 220);
    }, 190);
  }

  // 气泡文字淡出 → 应用新内容 → 淡入。
  function swapBubbleContent(applyFn) {
    if (flags.bubbleSwapTimer) {
      clearTimeout(flags.bubbleSwapTimer);
      flags.bubbleSwapTimer = null;
    }
    DSW.dom.textBox.style.transition = "opacity .18s ease";
    DSW.dom.textBox.style.opacity = "0";
    flags.bubbleSwapTimer = setTimeout(function () {
      flags.bubbleSwapTimer = null;
      applyFn();
      DSW.dom.textBox.style.opacity = "1";
      setTimeout(function () {
        DSW.dom.textBox.style.transition = "";
        DSW.dom.textBox.style.opacity = "";
      }, 220);
    }, 190);
  }

  // 恢复默认的余额三行内容。
  function restoreBubbleLines() {
    if (flags.bubbleSwapTimer) {
      clearTimeout(flags.bubbleSwapTimer);
      flags.bubbleSwapTimer = null;
    }
    if (flags.hintFadeTimer) {
      clearTimeout(flags.hintFadeTimer);
      flags.hintFadeTimer = null;
    }
    flags.lastHintText = null;
    DSW.dom.textBox.style.transition = "";
    DSW.dom.textBox.style.opacity = "";
    DSW.dom.labelEl.style.display = "";
    DSW.dom.labelEl.className = "dshwv-label";
    DSW.dom.labelEl.textContent = "DeepSeek 余额";
    DSW.dom.labelEl.style.color = "";
    DSW.dom.amountEl.style.display = "";
    DSW.dom.amountEl.className = "dshwv-amount";
    DSW.dom.amountEl.style.color = "";
    DSW.dom.hintEl.style.display = "";
    DSW.dom.hintEl.className = "dshwv-hint";
    DSW.dom.hintEl.style.color = "";
    DSW.balance.render();
  }

  // 展示余额气泡。
  function showBubble() {
    if (flags.bubbleTimer) {
      clearTimeout(flags.bubbleTimer);
      flags.bubbleTimer = null;
    }
    flags.clickBubbleActive = true;
    DSW.widgetConfig.pauseDialogue();
    flags.bubbleShown = true;
    flags.bubbleRandomActive = false;
    restoreBubbleLines();
    DSW.dom.bubbleBox.classList.add("dshwv-bubble-open");
    flags.bubbleTimer = setTimeout(hideBubble, C.BUBBLE_MS);
  }

  // 隐藏气泡。
  function hideBubble() {
    if (flags.bubbleTimer) {
      clearTimeout(flags.bubbleTimer);
      flags.bubbleTimer = null;
    }
    if (flags.bubbleSwapTimer) {
      clearTimeout(flags.bubbleSwapTimer);
      flags.bubbleSwapTimer = null;
    }
    if (flags.hintFadeTimer) {
      clearTimeout(flags.hintFadeTimer);
      flags.hintFadeTimer = null;
    }
    DSW.dom.textBox.style.transition = "";
    DSW.dom.textBox.style.opacity = "";
    DSW.dom.hintEl.style.transition = "";
    DSW.dom.hintEl.style.opacity = "";
    flags.bubbleRandomActive = false;
    flags.bubbleRandomLines = null;
    flags.bubbleShown = false;
    flags.clickBubbleActive = false;
    DSW.dom.bubbleBox.classList.remove("dshwv-bubble-open");
  }

  // 展示一条台词（居中样式）。
  function showDialogueLine(line) {
    flags.clickBubbleActive = false;
    const lines = singleCenter("A", line, "", true);
    flags.bubbleRandomActive = true;
    flags.bubbleRandomLines = lines;
    if (flags.bubbleShown) {
      swapBubbleContent(function () {
        applyBubbleLines(lines);
      });
    } else {
      flags.bubbleShown = true;
      DSW.dom.bubbleBox.classList.add("dshwv-bubble-open");
      applyBubbleLines(lines);
    }
    if (flags.bubbleTimer) {
      clearTimeout(flags.bubbleTimer);
      flags.bubbleTimer = null;
    }
    // 台词气泡使用单独时长，避免与余额气泡互相覆盖。
    flags.bubbleTimer = setTimeout(hideBubble, C.DIALOGUE_SHOW_MS);
  }

  // 展示高峰/空闲时间气泡。
  function showTimeBubble() {
    const peak = DSW.state.isPeak;
    const lines = [
      { t: "当前时间", s: "A", c: "" },
      {
        t: peak ? "高峰时间" : "空闲时间",
        s: "P",
        c: peak ? "#e0433f" : "#2fa24c",
      },
      null,
    ];
    flags.clickBubbleActive = true;
    DSW.widgetConfig.pauseDialogue();
    flags.bubbleRandomActive = true;
    flags.bubbleRandomLines = lines;
    flags.bubbleShown = true;
    DSW.dom.bubbleBox.classList.add("dshwv-bubble-open");
    applyBubbleLines(lines);
    if (flags.bubbleTimer) {
      clearTimeout(flags.bubbleTimer);
      flags.bubbleTimer = null;
    }
    flags.bubbleTimer = setTimeout(hideBubble, C.BUBBLE_MS);
  }

  DSW.bubble = {
    showBubble: showBubble,
    hideBubble: hideBubble,
    swapBubbleContent: swapBubbleContent,
    applyBubbleLines: applyBubbleLines,
    restoreBubbleLines: restoreBubbleLines,
    setHint: setHint,
    showDialogueLine: showDialogueLine,
    showTimeBubble: showTimeBubble,
  };
})(window.DSW);
