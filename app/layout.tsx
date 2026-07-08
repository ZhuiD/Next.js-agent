import './globals.css';
import type { Metadata } from 'next';
import AuthSessionProvider from '@/component/session-provider';

export const metadata: Metadata = {
  title: 'GitTrendInsight Agent',
  description:
    '基于 GitHub Trending 的趋势洞察智能体：输入自然语言，AI 自动抓取、分析并生成中文报告。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="h-dvh overflow-hidden bg-zinc-50 text-zinc-900 antialiased">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
