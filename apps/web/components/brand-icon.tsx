"use client";

import { useEffect, useRef } from "react";

export const BRAND_ICON_URL = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/favicon.svg?v=3`;

// 眼睛跟随指针：把指针方向归一化后乘到最大位移上。4 个 viewBox 单位 ≈ idle peek 摆动幅度，
// 两者视觉重量一致；90px 外就到满幅，近处则缓缓偏过去。
function eyeAim(clientX: number, clientY: number, rect: DOMRect) {
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const dist = Math.hypot(dx, dy) || 1;
  const reach = Math.min(dist / 90, 1) * 4;
  return { x: (dx / dist) * reach, y: (dy / dist) * reach };
}

// Grok 风格 blob，与 public/favicon.svg 同形同色；内联渲染以便 hero/busy 时 CSS 驱动眼睛与摆动动画。
const EYES =
  '<g transform="rotate(-24 30 24)"><g class="eyes"><rect x="21" y="15" width="6.5" height="12" rx="3.25" fill="#fff"/><rect x="32" y="12" width="5.5" height="9" rx="2.75" fill="#fff" opacity=".88"/></g></g>';

const BLOB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" data-brand="nexusflow">' +
  '<defs><linearGradient id="bg-nf" x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#FFAB4A"/><stop offset="1" stop-color="#F0532B"/></linearGradient></defs>' +
  '<path fill="url(#bg-nf)" d="M24 9c13-6 29 0 32 15 3 16-7 31-23 32-15 1-27-9-25-25 1-11 6-18 16-22Z"/>' +
  EYES +
  "</svg>";

export function BrandIcon({ size = 36, hero = false, busy = false, decorative = false }: { size?: number; hero?: boolean; busy?: boolean; decorative?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  // 只给 hero / busy 这类会被注视的大眼睛挂监听，侧边栏徽标这种小图标不参与，
  // 不然每帧几十次 getBoundingClientRect 白花钱。
  const tracking = hero || busy;

  useEffect(() => {
    const el = ref.current;
    if (!el || !tracking) return;
    let frame = 0;
    const reset = () => {
      el.classList.remove("eye-tracking");
      el.style.removeProperty("--eye-x");
      el.style.removeProperty("--eye-y");
    };
    const onMove = (event: PointerEvent) => {
      const { clientX, clientY } = event;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { x, y } = eyeAim(clientX, clientY, el.getBoundingClientRect());
        el.style.setProperty("--eye-x", `${x.toFixed(2)}px`);
        el.style.setProperty("--eye-y", `${y.toFixed(2)}px`);
        el.classList.add("eye-tracking");
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("pointerleave", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("pointerleave", reset);
    };
  }, [tracking]);

  return (
    <span
      ref={ref}
      className={["nf-brand-icon", hero ? "brand-hero" : "", busy ? "busy" : ""].filter(Boolean).join(" ")}
      style={{ display: "block", flexShrink: 0, width: size, height: size }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "NexusFlow"}
      dangerouslySetInnerHTML={{ __html: BLOB_SVG }}
    />
  );
}
