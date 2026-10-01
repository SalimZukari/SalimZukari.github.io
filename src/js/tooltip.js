// Shared floating tooltip for every chart. One fixed-position div, placed in
// viewport coordinates, so it lands next to the pointer at any scroll
// position. Hover, keyboard focus and touch all go through bindTip().
// No dependencies: bindTip() only needs an object with a d3-style .on().

const OFFSET = 14;
let anchor = null; // the element the visible tip belongs to

function tipEl() {
  let el = document.querySelector(".bar-hover-tip");
  if (!el) {
    el = document.createElement("div");
    el.className = "bar-hover-tip";
    el.setAttribute("role", "tooltip");
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Viewport point to attach the tip to. Pointer events carry clientX/Y; focus
 * events (keyboard Tab) and keyboard-triggered clicks don't, so fall back to
 * the right edge of the element itself.
 */
export function tipPosition(event) {
  if (event && Number.isFinite(event.clientX) && (event.clientX || event.clientY)) {
    return { x: event.clientX, y: event.clientY };
  }
  const target = event && (event.currentTarget || event.target);
  if (target && target.getBoundingClientRect) {
    const r = target.getBoundingClientRect();
    return { x: r.right, y: r.top + r.height / 2 };
  }
  return { x: 0, y: 0 };
}

function place(tip, { x, y }, above) {
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = x + OFFSET;
  let top = above ? y - OFFSET - h : y + OFFSET;
  // keep it on screen: flip to the other side of the pointer rather than clip
  if (left + w > window.innerWidth - 4) left = Math.max(4, x - OFFSET - w);
  if (top + h > window.innerHeight - 4) top = y - OFFSET - h;
  if (top < 4) top = y + OFFSET;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

export function showTip(html, event) {
  const tip = tipEl();
  tip.innerHTML = html;
  tip.style.display = "block";
  anchor = (event && event.currentTarget) || null;
  // a finger covers whatever is below-right of it, so put touch tips above
  place(tip, tipPosition(event), event && event.pointerType === "touch");
}

export function hideTip() {
  const tip = document.querySelector(".bar-hover-tip");
  if (tip) tip.style.display = "none";
  anchor = null;
}

/** Write into a persistent readout panel (the .w4-readout pattern). */
export function setReadout(el, html) {
  if (el) el.innerHTML = html;
}

/**
 * Bind the tooltip to a d3 selection. Shows on hover, keyboard focus and
 * touch (pointerenter fires on a tap too); hides on mouse leave and blur.
 * A touch "leave" fires as soon as the finger lifts, so touch tips stay until
 * the next tap elsewhere. Listeners are namespaced so callers keep their own.
 * @param selection d3 selection
 * @param {(d:any) => string} html
 * @param {{ onShow?: Function, onHide?: Function }} hooks called as (event, d) with this = element
 */
export function bindTip(selection, html, { onShow, onHide } = {}) {
  selection
    .on("pointerenter.tip focus.tip", function (event, d) {
      showTip(html(d), event);
      if (onShow) onShow.call(this, event, d);
    })
    .on("pointerleave.tip blur.tip", function (event, d) {
      if (event.type === "pointerleave" && event.pointerType === "touch") return;
      hideTip();
      if (onHide) onHide.call(this, event, d);
    });
  return selection;
}

// follow a mouse/pen pointer while the tip is up (touch tips stay put)
document.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  const tip = document.querySelector(".bar-hover-tip");
  if (tip && tip.style.display === "block") place(tip, { x: e.clientX, y: e.clientY }, false);
});
// tapping or clicking anywhere else dismisses it
document.addEventListener("pointerdown", (e) => {
  if (anchor && !anchor.contains(e.target)) hideTip();
});
// a fixed tip would detach from its mark once the page scrolls: drop a hover
// tip, but re-pin a keyboard-focus tip (Tab scrolls the focused mark into view)
window.addEventListener("scroll", () => {
  if (!anchor) return;
  if (anchor === document.activeElement) place(tipEl(), tipPosition({ currentTarget: anchor }), false);
  else hideTip();
}, { passive: true });
