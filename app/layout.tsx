import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, Open_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
});

// CMU's web headline face is Source Serif Pro (cmu.edu loads it via Typekit);
// Source Serif 4 is its open-source successor on Google Fonts. Used by the
// landing page so it matches the university's own site.
const sourceSerif = Source_Serif_4({
  variable: "--font-brand-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SCS Learn",
  description: "Take a real Carnegie Mellon course — free, live, and on your schedule.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${openSans.variable} ${bricolage.variable} ${inter.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
