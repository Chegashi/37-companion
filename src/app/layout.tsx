import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/component/shell/AppShell";
import { ContextProvider } from "@/component/context/context";
import { ThemeProvider } from "@/component/context/ThemeContext";

export const metadata: Metadata = {
  title: "37 Companion",
  description:
    "An open-source tracker for 42 network and 1337 students: holy graph, RNCP planner, level calculator, eval sheets and campus tools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-mode="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = JSON.parse(localStorage.getItem('37c-theme') || '{}');
                  document.documentElement.dataset.mode = t.darkMode === false ? 'light' : 'dark';
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ContextProvider>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </ContextProvider>
      </body>
    </html>
  );
}
