import type { Metadata } from "next";
import "@/src/app/globals.css";
import { TRPCReactProvider } from "@/src/trpc/client";
import Provider from "@/src/lib/provider";

export const metadata: Metadata = {
  title: "AI Recruiter - Voice Agent Dashboard",
  description:
    "Intelligent voice-based candidate screening and recruitment automation powered by AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Provider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </Provider>
      </body>
    </html>
  );
}
