// 小鲸鱼余额挂件 · 核心模块
//
// 负责：
// - 全局命名空间 window.DSW 的初始化与一次性执行守卫（DSW.__init）
// - Tauri IPC 封装（DSW.invoke）
// - 全局常量（DSW.C）
// - 共享状态（DSW.state）与共享标记（DSW.flags）
//
// 本文件为其余所有模块的基础，必须最先加载。

window.DSW = window.DSW || {};

(function (DSW) {
  "use strict";

  // 一次性执行守卫：防止脚本被重复引入时二次初始化。
  if (DSW.__init) return;
  DSW.__init = true;

  // Tauri IPC 入口（withGlobalTauri 注入的全局 API）。
  DSW.invoke =
    window.__TAURI__ && window.__TAURI__.core
      ? window.__TAURI__.core.invoke
      : null;

  // —— 常量 ——
  DSW.C = {
    MIN_SCALE: 0.6,
    MAX_SCALE: 2.5,
    REFRESH_MS: 60000,
    CHANGE_MS: 900,
    ANIM_MS: 700,
    BUBBLE_MS: 5000,
    CLICK_SQ: 9, // 位移平方阈值：> 3px 判定为拖动

    IMG_URL: "../assets/images/main.png",
    IMG_URL_PRESS: "../assets/images/stroking.png",
    IMG_ANGRY: "../assets/images/angry.png",
    IMG_DISAPPOINTED: "../assets/images/disappointed.png",
    IMG_SHY: "../assets/images/shy.png",
    IMG_EXHAUSTED: "../assets/images/exhausted.png",
    IMG_HALF_CLOSED_EYES: "../assets/images/half_closed_eyes.png",
    IMG_CLOSE_EYES: "../assets/images/close_eyes.png",
    IMG_HALF_OPEN_EYES: "../assets/images/half_open_eyes.png",

    SOUND_SETS: {
      duck: {
        press: "../assets/audio/duck-press.mp3",
        release: "../assets/audio/duck-release.mp3",
      },
      fx1: {
        press: "../assets/audio/fx1-press.mp3",
        release: "../assets/audio/fx1-release.mp3",
      },
    },

    // —— 表情状态机常量 ——
    ANGRY_DURATION_MS: 5000,
    IDLE_TO_DISAPPOINTED_MS: 3 * 60 * 1000,
    HOVER_TO_SHY_MS: 1500,
    SHY_DURATION_MS: 10000,
    LONELY_CAROUSEL_MS: 30000,
    HIGH_FREQ_WINDOW_MS: 10000,
    HIGH_FREQ_GAP_MS: 500,
    HIGH_FREQ_COUNT: 18,
    HIGH_FREQ_WARN_COUNT: 5,
    DISAPPOINTED_RELEASE_MS: 300,

    DOUBLE_CLICK_MS: 1500,
    DIALOGUE_SHOW_MS: 4000,
    BLINK_HALF_CLOSED_MS: 70,
    BLINK_CLOSE_MS: 150,
    BLINK_HALF_OPEN_MS: 70,
    EXHAUSTED_PROMPT_INTERVAL_MS: 10000,

    SQUISH: "scaleY(0.88) scaleX(1.05)",
  };

  // —— 共享状态 ——
  // 记录可序列化的显示/业务状态，供多个模块直接复用。
  DSW.state = {
    scale: 1.5,
    h: "right",
    v: "bottom",
    balance: null,
    currency: null,
    todayUsage: null,
    isPeak: false,
    status: "loading",
    message: "",
  };

  // —— 共享标记（含各 timer 句柄与运行时开关） ——
  // 记录运行时临时状态，避免模块之间各自维护重复 timer/flag。
  DSW.flags = {
    // 刷新/动画
    busy: false,
    pendingBalanceRefresh: false,
    settleTimer: null,
    animDelayTimer: null,
    shown: null,
    animId: null,

    // 气泡
    bubbleShown: false,
    bubbleTimer: null,
    bubbleRandomActive: false,
    bubbleRandomLines: null,
    bubbleSwapTimer: null,
    hintFadeTimer: null,
    lastHintText: null,

    // 表情状态机
    mood: "normal", // 'normal' | 'angry' | 'disappointed' | 'shy' | 'exhausted'
    idleTimer: null,
    hoverTimer: null,
    moodTimer: null,
    lonelyCarouselTimer: null,
    clickLog: [],
    isHovering: false,
    blinkTimer: null,
    blinkFrameTimer: null,
    blinking: false,
    blinkIntervalMinSec: 4,
    blinkIntervalMaxSec: 6,
    exhaustedModeEnabled: true,
    exhaustedBalanceThreshold: 5,
    exhaustedMode: false,
    exhaustedPromptTimer: null,
    exhaustedPromptIndex: 0,

    // 拖拽
    drag: null,

    // 显示配置
    soundOn: true,
    soundVol: 0.9,
    soundSet: "duck",
    bubbleColor: "#203170",
    customSounds: [],
    dialogueLines: [],
    dialogueMode: "random",
    dialogueIntervalMin: 5,
    dialogueJitter: 0,
    dialogueIndex: 0,
    dialogueTimer: null,
    lastWhaleClickAt: 0,
    whaleClickStep: 0,
    clickBubbleActive: false,

    // 音效
    pressAudio: null,
    releaseAudio: null,
    pressing: false,
    pressEnded: false,
    releasePlayed: false,
    releaseTimer: null,
    singleFileSound: false,

    // 鼠标穿透
    clickThrough: null,
  };
})(window.DSW);
