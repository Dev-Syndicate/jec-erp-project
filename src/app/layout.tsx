import type { Metadata, Viewport } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/query-provider";

// Poppins is not a variable font, so the weights have to be named up front —
// only what is declared here downloads, and a weight used in markup but missing
// from this list gets synthesised (faked) by the browser. These three are the
// full set the app uses: font-normal, font-medium and font-semibold. Add the
// matching entry here before reaching for font-bold or font-light in markup.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Poppins ships no monospace companion, and the fixed-width faces matter here:
// register numbers, period codes and the eyebrow labels all rely on even
// advance widths to line up in tables. Geist Mono stays for those.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JEC ERP",
  description: "Jeppiaar Engineering College ERP",
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
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
