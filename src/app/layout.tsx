import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const ui = Inter({ variable: "--font-ui", subsets: ["latin"] });
const reading = Source_Serif_4({ variable: "--font-reading", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reading English News",
  description: "어제 인기 있었던 영어 기사를 읽고 단어와 문장을 모아요.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${ui.variable} ${reading.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
