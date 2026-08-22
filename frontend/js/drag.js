// 小鲸鱼余额挂件 · 拖拽/吸附模块
//
// 负责鲸鱼的拖拽移动（通过 IPC 移动窗口）、松开后的吸附与点击判定。
// 依赖：core.js（DSW.invoke/DSW.state/DSW.flags/DSW.C）、dom.js（DSW.dom）、
//       hit-test.js（DSW.hit）、expression.js（DSW.expression）、audio.js（DSW.audio）、
//       widget-config.js（DSW.widgetConfig）、main.js（DSW.express，运行时调用）。

window.DSW = window.DSW || {};

(function (DSW) {
  "use strict";

  if (DSW.drag) return;

  var C = DSW.C;
  var state = DSW.state;
  var flags = DSW.flags;

  // 仅在点击鲸鱼本体时进入拖拽，气泡区域不响应。
  function onDocPointerDown(e) {
    if (e.target && e.target.closest) {
      if (e.target.closest(".dshwv-bubble")) return;
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!DSW.hit.isWhaleHit(e)) return;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}

    DSW.expression.resetIdle();
    DSW.expression.clearHoverTimer();

    flags.drag = {
      active: true,
      startSX: e.screenX,
      startSY: e.screenY,
      grabDX: e.screenX - window.screenX,
      grabDY: e.screenY - window.screenY,
      moved: false,
    };
    DSW.dom.root.classList.add("dshwv-dragging");

    if (flags.mood === "disappointed") {
      DSW.expression.setIcon(C.IMG_URL_PRESS);
    } else if (flags.mood === "angry") {
      DSW.dom.body.style.transform = C.SQUISH;
    } else {
      if (flags.mood === "shy") {
        flags.mood = "normal";
        DSW.expression.clearMoodTimers();
        DSW.widgetConfig.scheduleNextDialogue();
      }
      DSW.audio.pressDown();
    }

    document.addEventListener("pointermove", onDocPointerMove, true);
    document.addEventListener("pointerup", onDocPointerUp, true);
    document.addEventListener("pointercancel", onDocPointerCancel, true);
    document.addEventListener("click", onDocClickStopper, true);
  }

  // 拖拽过程中通过后端更新窗口位置。
  function onDocPointerMove(e) {
    if (!flags.drag || !flags.drag.active) return;
    const dx = e.screenX - flags.drag.startSX;
    const dy = e.screenY - flags.drag.startSY;
    if (dx * dx + dy * dy >= C.CLICK_SQ) flags.drag.moved = true;
    if (flags.drag.moved && DSW.invoke && flags.mood !== "angry") {
      DSW.invoke("set_window_position", {
        x: e.screenX - flags.drag.grabDX,
        y: e.screenY - flags.drag.grabDY,
      }).catch(function () {});
    }
  }

  function onDocPointerUp(e) {
    endDrag(true);
  }
  function onDocPointerCancel() {
    endDrag(false);
  }
  function onDocClickStopper(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch (err) {}
  }
  document.addEventListener("pointerdown", onDocPointerDown, true);

  // 拖拽结束后请求后端吸附，并同步左右/上下位置状态。
  function snapAfterDrag() {
    if (flags.drag.moved && DSW.invoke) {
      DSW.invoke("snap_window")
        .then(function (snap) {
          if (snap.h === "left") state.h = "left";
          else if (snap.h === "right") state.h = "right";
          else state.h = "none";
          if (snap.v === "top") state.v = "top";
          else if (snap.v === "bottom") state.v = "bottom";
          else state.v = "none";
          DSW.express();
        })
        .catch(function () {});
    }
  }

  // 结束拖拽后按当前表情状态决定点击、吸附和表情恢复逻辑。
  function endDrag(clickAllowed) {
    if (!flags.drag || !flags.drag.active) return;
    flags.drag.active = false;
    document.removeEventListener("pointermove", onDocPointerMove, true);
    document.removeEventListener("pointerup", onDocPointerUp, true);
    document.removeEventListener("pointercancel", onDocPointerCancel, true);
    document.removeEventListener("click", onDocClickStopper, true);
    DSW.dom.root.classList.remove("dshwv-dragging");

    if (flags.mood === "disappointed") {
      if (flags.drag.moved) snapAfterDrag();
      if (clickAllowed || flags.drag.moved) DSW.expression.exitDisappointed();
      return;
    }

    if (flags.mood === "angry") {
      if (clickAllowed && !flags.drag.moved)
        DSW.expression.showMoodBubble("再也不理你了喵 (｀へ´*)");
      DSW.dom.body.style.transform = "scaleY(1) scaleX(1)";
      return;
    }

    DSW.audio.pressUp();
    if (clickAllowed && !flags.drag.moved) {
      DSW.expression.handleWhaleClick();
      return;
    }
    if (flags.drag.moved) snapAfterDrag();
  }

  DSW.drag = {
    onDocPointerDown: onDocPointerDown,
    onDocPointerMove: onDocPointerMove,
    onDocPointerUp: onDocPointerUp,
    onDocPointerCancel: onDocPointerCancel,
    onDocClickStopper: onDocClickStopper,
    snapAfterDrag: snapAfterDrag,
    endDrag: endDrag,
  };
})(window.DSW);
