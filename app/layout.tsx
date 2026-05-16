import { ThemeProvider } from "@/components/theme-provider";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Maqro Calculator",
  description: "Tune your macros, plan your meals, and track your progress.",
  // Tell iOS Safari this can be added to the home screen and run in
  // standalone mode. Combined with theme-color below, this gives the
  // installed-PWA experience a native feel.
  appleWebApp: {
    capable: true,
    title: "Maqro",
    statusBarStyle: "black-translucent",
  },
  // Stop iOS from auto-linking strings that look like phone numbers
  // (random numbers in macros / portions were rendering as tel: links).
  formatDetection: { telephone: false },
};

/** Viewport + theme-color live in their own export per Next.js 14+.
 *  `viewportFit: "cover"` is the load-bearing bit — it's what lets
 *  `env(safe-area-inset-*)` resolve to actual pixel values on iPhones
 *  with a notch / home indicator. Without it the OS pads the layout
 *  for us and every safe-area utility we sprinkle around becomes a
 *  no-op. `maximumScale` is omitted on purpose — locking zoom is an
 *  a11y regression. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
