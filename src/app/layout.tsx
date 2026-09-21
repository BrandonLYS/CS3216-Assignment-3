import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "@/shared/analytics/provider";
import { siteUrl } from "@/shared/lib/site-url";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "PrismPM", template: "%s · PrismPM" },
  description: "Project management with a memory.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <PostHogProvider>
        <body className="flex min-h-full flex-col">{children}</body>
      </PostHogProvider>
    </html>
  );
}
