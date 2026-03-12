import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_VALUE } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "Finance Bot Admin",
  description: "Admin panel for monitoring finance bot system"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  const isLoggedIn = session === ADMIN_SESSION_VALUE;

  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        {isLoggedIn ? (
          <div className="app-shell">
            <AdminNav />
            <main className="app-main">{children}</main>
          </div>
        ) : null}
        {!isLoggedIn ? <main className="auth-main">{children}</main> : null}
      </body>
    </html>
  );
}
