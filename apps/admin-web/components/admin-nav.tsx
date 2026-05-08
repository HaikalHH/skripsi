"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", description: "Operational overview" },
  { href: "/users", label: "Users", description: "User base & onboarding" },
  { href: "/reminders", label: "Reminders", description: "Reminder delivery" },
  // {
  //   href: "/health",
  //   label: "System Health",
  //   description: "Infra & bot status",
  // },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <div className="sidebar-brand">
        <div>
          <p className="eyebrow">Finance Bot</p>
          <h1>Control Room</h1>
        </div>
      </div>

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
        <form action="/logout" method="post">
          <button type="submit" className="button button-logout button-block">
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}
