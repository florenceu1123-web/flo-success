import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "flo-success — 전자임용 유사·변형 문제 생성기",
  description: "전자임용 기출 이미지를 업로드하면 AI가 유사 / 변형 문제를 자동 생성합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-blue-950">{children}</body>
    </html>
  );
}
