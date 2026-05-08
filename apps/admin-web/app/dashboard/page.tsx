import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminApi } from "@/lib/api";
import { formatCompactNumber, formatDateTime } from "@/lib/format";

type DashboardResponse = {
  totalUsers: number;
  activeUsersThisMonth: number;
  transactionCount: number;
  supportSummary: {
    failedOutboundMessages: number;
    onboardingInProgress: number;
  };
  supportQueue: Array<{
    id: string;
    userId: string;
    userName: string | null;
    waNumber: string;
    type: "FAILED_OUTBOUND" | "ONBOARDING";
    label: string;
    detail: string;
    updatedAt: string;
  }>;
};

export default async function DashboardPage() {
  const data = await fetchAdminApi<DashboardResponse>("/api/admin/dashboard");

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Ringkasan cepat untuk melihat jumlah user, aktivitas bulan ini, dan volume transaksi yang tersimpan."
      />

      <div className="stats-grid stats-grid-compact">
        <StatCard
          label="Total Users"
          value={formatCompactNumber(data.totalUsers)}
          hint="Semua user terdaftar"
          tone="accent"
        />
        <StatCard
          label="Active This Month"
          value={formatCompactNumber(data.activeUsersThisMonth)}
          hint="User dengan message bulan ini"
          tone="success"
        />
        <StatCard
          label="Transactions"
          value={formatCompactNumber(data.transactionCount)}
          hint="Total transaksi tersimpan"
          tone="warning"
        />
      </div>

      <SectionCard
        title="Support Queue"
        description="Item operasional yang paling relevan untuk ditindaklanjuti admin."
      >
          <div className="detail-grid detail-grid-tight support-summary">
            <div>
              <span className="detail-label">Failed Outbound</span>
              <strong>{formatCompactNumber(data.supportSummary.failedOutboundMessages)}</strong>
            </div>
            <div>
              <span className="detail-label">Onboarding Open</span>
              <strong>{formatCompactNumber(data.supportSummary.onboardingInProgress)}</strong>
            </div>
          </div>

          <div className="table-shell spaced-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Item</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.supportQueue.length ? (
                  data.supportQueue.map((item) => (
                    <tr key={`${item.type}-${item.id}`}>
                      <td>
                        <div className="stack">
                          <Link href={`/users/${item.userId}`}>
                            <strong>{item.userName ?? "Unnamed user"}</strong>
                          </Link>
                          <span className="mono">{item.waNumber}</span>
                        </div>
                      </td>
                      <td>
                        <div className="stack">
                          <StatusBadge
                            label={item.label}
                            tone={item.type === "FAILED_OUTBOUND" ? "danger" : "warning"}
                          />
                          <span className="muted">{item.detail}</span>
                        </div>
                      </td>
                      <td>{formatDateTime(item.updatedAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="empty-state">
                      Tidak ada item support saat ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </SectionCard>
    </div>
  );
}
