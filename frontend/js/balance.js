// 小鲸鱼余额挂件 · 余额刷新/动画/渲染模块
//
// 负责余额格式化、数值滚动动画、气泡内容渲染与余额拉取刷新。
// 依赖：core.js（DSW.invoke/DSW.state/DSW.flags/DSW.C）、dom.js（DSW.dom）、
//       bubble.js（DSW.bubble）。

window.DSW = window.DSW || {};

(function (DSW) {
  "use strict";

  if (DSW.balance) return;

  var C = DSW.C;
  var state = DSW.state;
  var flags = DSW.flags;

  // 数值夹取到 [lo, hi] 区间。
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // 余额格式化。
  function fmt(balance, currency) {
    const num = Number(balance);
    const fixed = isFinite(num) ? num.toFixed(2) : "--";
    return currency === "CNY" ? "¥ " + fixed : fixed + " " + currency;
  }

  // 余额滚动动画：沿用平滑缓出曲线。
  function animateAmount(from, to, currency, duration) {
    if (flags.animId) cancelAnimationFrame(flags.animId);
    if (from === null || !isFinite(from)) from = to;
    if (from === to) {
      flags.shown = to;
      DSW.dom.amountEl.textContent = fmt(to, currency);
      return;
    }
    let startTime = null;
    function step(ts) {
      if (startTime === null) startTime = ts;
      const t = Math.min(1, (ts - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = from + (to - from) * eased;
      DSW.dom.amountEl.textContent = fmt(val, currency);
      if (t < 1) flags.animId = requestAnimationFrame(step);
      else {
        flags.animId = null;
        flags.shown = to;
        DSW.dom.amountEl.textContent = fmt(to, currency);
      }
    }
    flags.animId = requestAnimationFrame(step);
  }

  // 渲染当前余额/用量到气泡。
  function render() {
    let amount, hint;
    if (state.status === "error") {
      amount = flags.shown !== null ? fmt(flags.shown, state.currency) : "--";
      hint = state.message ? state.message.slice(0, 14) : "获取失败 · 点击重试";
    } else if (state.balance === null) {
      amount = flags.shown !== null ? fmt(flags.shown, state.currency) : "…";
      hint = "加载中…";
    } else {
      amount =
        flags.shown !== null
          ? fmt(flags.shown, state.currency)
          : fmt(state.balance, state.currency);
      hint =
        "今日已用 " +
        (state.todayUsage !== null && state.todayUsage !== undefined
          ? fmt(state.todayUsage, state.currency)
          : "--");
    }
    DSW.dom.amountEl.textContent = amount;
    if (flags.bubbleRandomActive && flags.bubbleRandomLines)
      DSW.bubble.applyBubbleLines(flags.bubbleRandomLines);
    else DSW.bubble.setHint(hint);
  }

  // 拉取余额并刷新显示。
  function refresh(manual) {
    if (flags.busy) {
      if (manual) flags.pendingBalanceRefresh = true;
      return;
    }
    flags.busy = true;
    flags.pendingBalanceRefresh = false;
    if (flags.animDelayTimer) {
      clearTimeout(flags.animDelayTimer);
      flags.animDelayTimer = null;
    }
    if (manual || state.balance === null) {
      state.status = "loading";
      render();
    }

    if (!DSW.invoke) {
      flags.busy = false;
      return;
    }
    DSW.invoke("get_balance")
      .then(function (data) {
        if (data && data.ok) {
          const nb = Number(data.totalBalance);
          const nc = String(data.currency || "CNY");
          const changed =
            state.balance !== null &&
            (nb !== state.balance || nc !== state.currency);
          const currencyChanged =
            state.currency !== null && nc !== state.currency;
          state.balance = nb;
          state.currency = nc;
          state.message = "";
          state.todayUsage =
            data.todayUsage !== undefined ? data.todayUsage : null;
          state.isPeak = !!data.isPeak;
          if (DSW.expression && DSW.expression.syncExhaustedMode) {
            DSW.expression.syncExhaustedMode();
          }
          // 自动轮询下若余额变化，先展示气泡再执行数字滚动。
          if (changed && !currencyChanged) {
            if (!manual) {
              DSW.bubble.showBubble();
              state.status = "changing";
              if (flags.animDelayTimer) clearTimeout(flags.animDelayTimer);
              flags.animDelayTimer = setTimeout(function () {
                flags.animDelayTimer = null;
                animateAmount(flags.shown, nb, nc, C.ANIM_MS);
              }, 300);
              if (flags.settleTimer) clearTimeout(flags.settleTimer);
              flags.settleTimer = setTimeout(function () {
                flags.settleTimer = null;
                if (state.status === "changing") {
                  state.status = "ok";
                  render();
                }
              }, C.CHANGE_MS + 300);
            } else {
              animateAmount(flags.shown, nb, nc, C.ANIM_MS);
              state.status = "ok";
              render();
            }
          } else {
            if (flags.animId === null) flags.shown = nb;
            state.status = "ok";
            render();
          }
        } else {
          state.status = "error";
          state.message = data && data.error ? String(data.error) : "获取失败";
          render();
        }
      })
      .catch(function () {
        state.status = "error";
        state.message = "获取失败";
        render();
      })
      .finally(function () {
        flags.busy = false;
        if (flags.pendingBalanceRefresh) {
          refresh(true);
        }
      });
  }

  DSW.balance = {
    fmt: fmt,
    clamp: clamp,
    animateAmount: animateAmount,
    render: render,
    refresh: refresh,
  };
})(window.DSW);
