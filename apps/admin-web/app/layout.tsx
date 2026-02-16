import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import "./globals.css";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_VALUE } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Finance Bot Admin",
  description: "Admin panel for monitoring finance bot system"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  const isLoggedIn = session === ADMIN_SESSION_VALUE;

  return (
    <html lang="en">
      <body>
        {isLoggedIn ? (
          <nav>
            <Link href="/users">Users</Link>
            <Link href="/transactions">Transactions</Link>
            <Link href="/subscriptions">Subscriptions</Link>
            <Link href="/health">System Health</Link>
            <form action="/logout" method="post" style={{ marginLeft: "auto" }}>
              <button type="submit" className="danger">
                Logout
              </button>
            </form>
          </nav>
        ) : null}
        <main>{children}</main>
      </body>
    </html>
  );
}
