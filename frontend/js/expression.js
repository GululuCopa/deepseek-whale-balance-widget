// 小鲸鱼余额挂件 · 表情状态机模块
//
// 负责鲸鱼的表情状态（普通/生气/失落/害羞）切换、空闲计时、
// 以及点击处理（连点检测、主状态点击序列）。
// 依赖：core.js（DSW.flags/DSW.C）、dom.js（DSW.dom）、bubble.js（DSW.bubble）、
//       balance.js（DSW.balance）、widget-config.js（DSW.widgetConfig）。

window.DSW = window.DSW || {};

(function (DSW) {
  "use strict";

  if (DSW.expression) return;

  var C = DSW.C;
  var flags = DSW.flags;
  var state = DSW.state;

  // 失落状态内置语录（固定 18 条，不可被用户查看或修改）。
  var LONELY_LINES = [
    "主人不理我，好寂寞…",
    "喵…都不看本鲸一眼…",
    "等了你好久好久…",
    "尾巴都垂下来了…",
    "罐头不香了吗…",
    "你忘了本鲸在这里了吗…",
    "太阳落山了，你还没来…",
    "连呼噜都没力气…",
    "本鲸趴门口等了好久…",
    "你鼠标路过也不摸我…",
    "喵…本鲸心里空空的…",
    "窗台好冷，主人不在…",
    "我给空气翻肚皮…",
    "本鲸叫了三声，没人应…",
    "你的影子都走了…",
    "本鲸的人生突然好灰暗…",
    "你连本鲸尾巴尖都没碰过…",
    "主人…本鲸还在等你回家呢。",
  ];

  // 切换鲸鱼图片。
  function setIcon(src) {
    DSW.dom.img.src = src;
  }

  function getBaseIcon() {
    return flags.exhaustedMode ? C.IMG_EXHAUSTED : C.IMG_URL;
  }

  function getPressIcon() {
    return C.IMG_URL_PRESS;
  }

  function syncVisualState() {
    if (!DSW.dom || !DSW.dom.img) return;
    if (flags.mood === "angry") {
      setIcon(C.IMG_ANGRY);
      return;
    }
    if (flags.mood === "disappointed") {
      setIcon(C.IMG_DISAPPOINTED);
      return;
    }
    if (flags.mood === "shy") {
      setIcon(C.IMG_SHY);
      return;
    }
    if (flags.pressing) {
      setIcon(getPressIcon());
      return;
    }
    setIcon(getBaseIcon());
  }

  function clearBlinkTimers() {
    if (flags.blinkTimer) {
      clearTimeout(flags.blinkTimer);
      flags.blinkTimer = null;
    }
    if (flags.blinkFrameTimer) {
      clearTimeout(flags.blinkFrameTimer);
      flags.blinkFrameTimer = null;
    }
  }

  function isBlinkFrame(src) {
    return (
      src === C.IMG_HALF_CLOSED_EYES ||
      src === C.IMG_CLOSE_EYES ||
      src === C.IMG_HALF_OPEN_EYES
    );
  }

  function isBlinkAllowed() {
    return (
      flags.mood === "normal" &&
      !flags.exhaustedMode &&
      !flags.pressing &&
      !!DSW.dom.img &&
      DSW.dom.img.getAttribute("src") === C.IMG_URL
    );
  }

  function cancelBlink(restoreIcon) {
    var active = !!(flags.blinking || flags.blinkTimer || flags.blinkFrameTimer);
    clearBlinkTimers();
    flags.blinking = false;
    if (restoreIcon && active) syncVisualState();
  }

  function scheduleNextBlink() {
    cancelBlink(false);
    if (flags.mood !== "normal" || flags.exhaustedMode || flags.pressing) return;
    var min = Math.max(1, Number(flags.blinkIntervalMinSec) || 4);
    var max = Math.max(min, Number(flags.blinkIntervalMaxSec) || 6);
    var delay = Math.round((min + Math.random() * (max - min)) * 1000);
    flags.blinkTimer = setTimeout(function () {
      flags.blinkTimer = null;
      startBlink();
    }, delay);
  }

  function startBlink() {
    if (!isBlinkAllowed()) {
      scheduleNextBlink();
      return;
    }
    flags.blinking = true;
    setIcon(C.IMG_HALF_CLOSED_EYES);
    flags.blinkFrameTimer = setTimeout(function () {
      if (!flags.blinking || flags.mood !== "normal" || flags.exhaustedMode || flags.pressing) {
        cancelBlink(true);
        return;
      }
      setIcon(C.IMG_CLOSE_EYES);
      flags.blinkFrameTimer = setTimeout(function () {
        if (
          !flags.blinking ||
          flags.mood !== "normal" ||
          flags.exhaustedMode ||
          flags.pressing
        ) {
          cancelBlink(true);
          return;
        }
        setIcon(C.IMG_HALF_OPEN_EYES);
        flags.blinkFrameTimer = setTimeout(function () {
          flags.blinkFrameTimer = null;
          flags.blinking = false;
          syncVisualState();
          scheduleNextBlink();
        }, C.BLINK_HALF_OPEN_MS);
      }, C.BLINK_CLOSE_MS);
    }, C.BLINK_HALF_CLOSED_MS);
  }

  // 清除表情相关计时器（生气/失落轮播）。
  function clearMoodTimers() {
    if (flags.moodTimer) {
      clearTimeout(flags.moodTimer);
      flags.moodTimer = null;
    }
    if (flags.lonelyCarouselTimer) {
      clearInterval(flags.lonelyCarouselTimer);
      flags.lonelyCarouselTimer = null;
    }
  }

  // 清除悬浮计时器。
  function clearHoverTimer() {
    if (flags.hoverTimer) {
      clearTimeout(flags.hoverTimer);
      flags.hoverTimer = null;
    }
    flags.isHovering = false;
  }

  // 重置空闲计时（超时进入失落）。
  function resetIdle() {
    if (flags.idleTimer) {
      clearTimeout(flags.idleTimer);
      flags.idleTimer = null;
    }
    if (flags.mood === "disappointed" || flags.mood === "exhausted") return;
    flags.idleTimer = setTimeout(function () {
      flags.idleTimer = null;
      enterDisappointed();
    }, C.IDLE_TO_DISAPPOINTED_MS);
  }

  // 以台词气泡展示心情提示。
  function showMoodBubble(text) {
    DSW.bubble.showDialogueLine(text);
  }

  // 重置主状态下的点击序列计数。
  function resetWhaleClickSequence() {
    flags.lastWhaleClickAt = 0;
    flags.whaleClickStep = 0;
  }

  // 仅在 normal + main.png 主状态下启用新的点击序列。
  function isMainClickSequenceState() {
    var src = DSW.dom.img && DSW.dom.img.getAttribute("src");
    return (
      flags.mood === "normal" &&
      !flags.exhaustedMode &&
      !flags.pressing &&
      (src === C.IMG_URL || isBlinkFrame(src))
    );
  }

  function isExhaustedModeActive() {
    return !!flags.exhaustedMode;
  }

  function enterExhausted() {
    if (flags.exhaustedMode && flags.mood === "exhausted") {
      syncVisualState();
      if (DSW.widgetConfig && DSW.widgetConfig.syncExhaustedPromptSchedule) {
        DSW.widgetConfig.syncExhaustedPromptSchedule();
      }
      return;
    }
    cancelBlink(false);
    clearHoverTimer();
    clearMoodTimers();
    if (flags.idleTimer) {
      clearTimeout(flags.idleTimer);
      flags.idleTimer = null;
    }
    flags.exhaustedMode = true;
    flags.mood = "exhausted";
    flags.clickLog = [];
    resetWhaleClickSequence();
    syncVisualState();
    DSW.widgetConfig.scheduleNextDialogue();
    if (DSW.widgetConfig && DSW.widgetConfig.syncExhaustedPromptSchedule) {
      DSW.widgetConfig.syncExhaustedPromptSchedule();
    }
  }

  function exitExhausted() {
    if (!flags.exhaustedMode) return;
    flags.exhaustedMode = false;
    flags.mood = "normal";
    flags.clickLog = [];
    resetWhaleClickSequence();
    if (DSW.widgetConfig && DSW.widgetConfig.syncExhaustedPromptSchedule) {
      DSW.widgetConfig.syncExhaustedPromptSchedule();
    }
    syncVisualState();
    DSW.widgetConfig.scheduleNextDialogue();
    resetIdle();
    scheduleNextBlink();
  }

  function syncExhaustedMode() {
    if (!flags.exhaustedModeEnabled) {
      exitExhausted();
      return;
    }
    var balance = Number(state.balance);
    if (!isFinite(balance)) return;
    if (!flags.exhaustedMode && balance < flags.exhaustedBalanceThreshold) {
      enterExhausted();
      return;
    }
    if (flags.exhaustedMode && balance > flags.exhaustedBalanceThreshold) {
      exitExhausted();
    }
  }

  function handleWidgetConfigChange() {
    syncExhaustedMode();
    if (flags.exhaustedMode) {
      cancelBlink(true);
      return;
    }
    if (flags.mood === "normal" && !flags.pressing) {
      syncVisualState();
      scheduleNextBlink();
      resetIdle();
      return;
    }
    cancelBlink(false);
  }

  // 进入生气状态：暂停台词、切图并给出警告气泡。
  function enterAngry() {
    if (flags.exhaustedMode) return;
    flags.mood = "angry";
    cancelBlink(false);
    clearHoverTimer();
    clearMoodTimers();
    DSW.widgetConfig.pauseDialogue();
    setIcon(C.IMG_ANGRY);
    showMoodBubble("你再摸人家就生气了喵 (╬ Ò﹏Ó)");
    flags.moodTimer = setTimeout(function () {
      flags.moodTimer = null;
      exitAngry();
    }, C.ANGRY_DURATION_MS);
    flags.clickLog = [];
    resetWhaleClickSequence();
  }

  // 离开生气状态后恢复默认外观与台词调度。
  function exitAngry() {
    if (flags.mood !== "angry") return;
    flags.mood = "normal";
    clearHoverTimer();
    syncVisualState();
    resetWhaleClickSequence();
    DSW.widgetConfig.scheduleNextDialogue();
    resetIdle();
    scheduleNextBlink();
  }

  // 长时间无交互后进入失落状态，并开始轮播内置语录。
  function enterDisappointed() {
    if (flags.mood === "disappointed" || flags.exhaustedMode) return;
    flags.mood = "disappointed";
    cancelBlink(false);
    clearHoverTimer();
    clearMoodTimers();
    DSW.widgetConfig.pauseDialogue();
    setIcon(C.IMG_DISAPPOINTED);
    showMoodBubble("鲸鲸没人要了喵 (╥﹏╥)");
    flags.lonelyCarouselTimer = setInterval(function () {
      const line =
        LONELY_LINES[Math.floor(Math.random() * LONELY_LINES.length)];
      showMoodBubble(line);
    }, C.LONELY_CAROUSEL_MS);
    flags.clickLog = [];
    resetWhaleClickSequence();
  }

  // 用户重新交互后退出失落状态，短暂展示回弹图标。
  function exitDisappointed() {
    if (flags.mood !== "disappointed") return;
    flags.mood = "normal";
    clearMoodTimers();
    clearHoverTimer();
    setIcon(getPressIcon());
    showMoodBubble("你终于想起本鲸了喵 (=￣ω￣=)");
    resetWhaleClickSequence();
    DSW.widgetConfig.scheduleNextDialogue();
    resetIdle();
    flags.moodTimer = setTimeout(function () {
      flags.moodTimer = null;
      if (flags.mood === "normal") {
        syncVisualState();
        scheduleNextBlink();
      }
    }, C.DISAPPOINTED_RELEASE_MS);
  }

  // 持续悬浮触发害羞状态。
  function enterShy() {
    if (flags.mood !== "normal" || flags.exhaustedMode) return;
    flags.mood = "shy";
    cancelBlink(false);
    clearHoverTimer();
    clearMoodTimers();
    resetWhaleClickSequence();
    DSW.widgetConfig.pauseDialogue();
    setIcon(C.IMG_SHY);
    showMoodBubble("主人摸本鲸头了喵 (≧◡≦)♡");
    flags.moodTimer = setTimeout(function () {
      flags.moodTimer = null;
      exitShy(false);
    }, C.SHY_DURATION_MS);
  }

  // 退出害羞状态时，根据是否被打断决定恢复到按压图或默认图。
  function exitShy(interrupted) {
    if (flags.mood !== "shy") return;
    flags.mood = "normal";
    clearMoodTimers();
    clearHoverTimer();
    if (interrupted) {
      setIcon(getPressIcon());
    } else {
      syncVisualState();
    }
    resetWhaleClickSequence();
    DSW.widgetConfig.scheduleNextDialogue();
    resetIdle();
    if (!interrupted) scheduleNextBlink();
  }

  // 处理鲸鱼本体点击（连点检测 + 双击时间气泡 + 单点余额气泡）。
  function showBalanceOnSequenceStart(now) {
    DSW.bubble.showBubble();
    DSW.balance.refresh(true);
    flags.lastWhaleClickAt = now;
    flags.whaleClickStep = 1;
  }

  // 处理鲸鱼本体点击（连点检测 + 主状态点击序列）。
  function handleWhaleClick() {
    const now = Date.now();
    resetIdle();

    if (flags.exhaustedMode) {
      resetWhaleClickSequence();
      DSW.bubble.showBubble();
      DSW.balance.refresh(true);
      return;
    }

    // 高频连点检测：连续 ≥12 次且相邻间隔 ≤0.5s。
    if (
      flags.clickLog.length &&
      now - flags.clickLog[flags.clickLog.length - 1] > C.HIGH_FREQ_GAP_MS
    ) {
      flags.clickLog = [];
    }
    flags.clickLog.push(now);
    while (flags.clickLog.length && now - flags.clickLog[0] > C.HIGH_FREQ_WINDOW_MS) {
      flags.clickLog.shift();
    }
    if (
      flags.clickLog.length >= C.HIGH_FREQ_WARN_COUNT &&
      flags.clickLog.length < C.HIGH_FREQ_COUNT
    ) {
      showMoodBubble("你再摸人家就生气了喵 (╬ Ò﹏Ó)");
      return;
    }
    if (flags.clickLog.length >= C.HIGH_FREQ_COUNT) {
      flags.clickLog = [];
      enterAngry();
      return;
    }

    if (!isMainClickSequenceState()) {
      resetWhaleClickSequence();
      DSW.bubble.showBubble();
      DSW.balance.refresh(true);
      return;
    }

    if (
      !flags.lastWhaleClickAt ||
      now - flags.lastWhaleClickAt > C.DOUBLE_CLICK_MS
    ) {
      resetWhaleClickSequence();
    }

    if (flags.whaleClickStep === 0) {
      showBalanceOnSequenceStart(now);
      return;
    }

    if (flags.whaleClickStep === 1) {
      const line = DSW.widgetConfig.pickRandomDialogueLine();
      if (!line || Math.random() < 0.5) {
        DSW.bubble.showTimeBubble();
        resetWhaleClickSequence();
        return;
      }
      DSW.widgetConfig.pauseDialogue();
      DSW.bubble.showDialogueLine(line);
      flags.lastWhaleClickAt = now;
      flags.whaleClickStep = 2;
      return;
    }

    DSW.bubble.showTimeBubble();
    resetWhaleClickSequence();
  }

  DSW.expression = {
    setIcon: setIcon,
    clearMoodTimers: clearMoodTimers,
    clearHoverTimer: clearHoverTimer,
    resetIdle: resetIdle,
    showMoodBubble: showMoodBubble,
    getBaseIcon: getBaseIcon,
    getPressIcon: getPressIcon,
    syncVisualState: syncVisualState,
    cancelBlink: cancelBlink,
    scheduleNextBlink: scheduleNextBlink,
    isExhaustedModeActive: isExhaustedModeActive,
    enterExhausted: enterExhausted,
    exitExhausted: exitExhausted,
    syncExhaustedMode: syncExhaustedMode,
    handleWidgetConfigChange: handleWidgetConfigChange,
    enterAngry: enterAngry,
    exitAngry: exitAngry,
    enterDisappointed: enterDisappointed,
    exitDisappointed: exitDisappointed,
    enterShy: enterShy,
    exitShy: exitShy,
    resetWhaleClickSequence: resetWhaleClickSequence,
    isMainClickSequenceState: isMainClickSequenceState,
    handleWhaleClick: handleWhaleClick,
  };
})(window.DSW);
