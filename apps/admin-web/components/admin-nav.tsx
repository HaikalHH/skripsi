"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/users", label: "Users", description: "User base & onboarding" },
  { href: "/transactions", label: "Transactions", description: "Cashflow activity" },
  { href: "/subscriptions", label: "Subscriptions", description: "Plan & access control" },
  { href: "/observability", label: "Observability", description: "Intent routing quality" },
  { href: "/health", label: "System Health", description: "Infra & bot status" }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">AF</div>
        <div>
          <p className="eyebrow">Finance Bot</p>
          <h1>Control Room</h1>
        </div>
      </div>

      <p className="sidebar-copy">
        Internal workspace untuk monitor user, cashflow, reminder, dan kualitas routing AI.
      </p>

      <nav className="sidebar-nav" aria-label="Admin navigation">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "sidebar-link active" : "sidebar-link"}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footnote">
          <span className="status-dot" />
          Admin session aktif
        </div>
        <form action="/logout" method="post">
          <button type="submit" className="button button-danger button-block">
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}
