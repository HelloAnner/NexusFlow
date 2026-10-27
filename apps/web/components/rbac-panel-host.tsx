"use client";

import { useEffect, useRef } from "react";
import { mountRbacPanel, type RbacAdapter, type RbacPanelHandle } from "@/lib/rbac/panel";

/** React 宿主：面板本身与 Portal / Northline / DocuMind 共用。 */
export function RbacPanelHost({ adapter, readOnly = false }: { adapter: RbacAdapter; readOnly?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<RbacPanelHandle | null>(null);

  useEffect(() => {
    if (!host.current) return;
    panel.current = mountRbacPanel(host.current, { adapter, readOnly });
    return () => {
      panel.current?.destroy();
      panel.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} style={{ height: "100%", minHeight: 560 }} />;
}
