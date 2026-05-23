import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { getSiteUrl, siteDescription, siteName, siteTitle } from "../src/lib/siteRoutes";
import "./globals.css";

const themeInitScript = `
(() => {
  try {
    const key = "opendocs-theme";
    const stored = window.localStorage.getItem(key);
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const theme = stored === "dark" || stored === "light" ? stored : system;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: siteName,
  title: {
    default: siteTitle,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    "open-source document manager",
    "client-side PDF editor",
    "scan to PDF",
    "merge PDFs",
    "PDF editor",
    "convert documents",
  ],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    siteName,
    type: "website",
    url: getSiteUrl(),
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Script id="opendocs-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </body>
    </html>
  );
}
