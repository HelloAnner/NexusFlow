"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { invalidateSessionCache, resetApiSession, subscribeSession } from "@/lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const offSession = subscribeSession(() => { void client.cancelQueries(); client.clear(); });
    const offAuth = useAuth.subscribe((next, previous) => {
      if (next.user?.id !== previous.user?.id || next.user?.role !== previous.user?.role) {
        if (next.user) invalidateSessionCache(); else resetApiSession();
      }
    });
    return () => { offSession(); offAuth(); };
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
