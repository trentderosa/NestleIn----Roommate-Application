import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NestleIn",
    template: "%s · NestleIn",
  },
  description: "Make shared living feel a little more together.",
};

export const viewport: Viewport = {
  themeColor: "#fff8f1",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} antialiased`}>
      <body>
        <AppShell>{children}</AppShell>
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast:
                "!rounded-2xl !border-border !bg-white !font-sans !text-plum !shadow-lift",
              description: "!text-plum-soft",
              actionButton: "!rounded-full !bg-plum !text-cream",
            },
          }}
        />
      </body>
    </html>
  );
}
