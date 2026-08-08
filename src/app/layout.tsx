import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// icon.png / apple-icon.png sit beside this file, so Next picks them up by
// convention and emits the <link> tags — they are the college crest, derived
// from public/erplogo.png. Declared here as well so the intent is greppable.
export const metadata: Metadata = {
  title: "JEC ERP",
  description: "Jeppiaar Engineering College ERP",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

// Without this the app had NO viewport meta tag, so a phone assumed a ~980px
// desktop page and scaled the whole thing down to fit — every `sm:`/`md:`
// breakpoint evaluated against 980px, so the mobile layouts never engaged and
// the UI rendered as a shrunken desktop page. `width=device-width` is what makes
// the media queries see the real screen.
//
// initialScale is pinned to 1 but zoom is deliberately NOT disabled: this is a
// records system people read register numbers and marks off, and taking
// pinch-zoom away from anyone who needs it fails WCAG 1.4.4.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
