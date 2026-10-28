import type { Metadata } from "next";
import { BRAND_ICON_URL } from "@/components/brand-icon";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "NexusFlow",
  description: "企业项目管理综合系统",
  icons: {
    icon: { url: BRAND_ICON_URL, type: "image/svg+xml" },
    shortcut: BRAND_ICON_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <Providers>
            <>{children}</>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
