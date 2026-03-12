import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminApi } from "@/lib/api";
import { formatCompactNumber, formatDateTime } from "@/lib/format";
import { updateSubscriptionStatusAction } from "./actions";

type SubscriptionsResponse = {
  subscriptions: Array<{
    id: string;
    userId: string;
    waNumber: string;
    status: "TRIAL" | "ACTIVE" | "INACTIVE";
    createdAt: string;
    updatedAt: string;
  }>;
};

const getStatusTone = (status: string) => {
  if (status === "ACTIVE") return "success" as const;
  if (status === "TRIAL") return "accent" as const;
  if (status === "INACTIVE") return "warning" as const;
  return "neutral" as const;
};

export default async function SubscriptionsPage() {
  const data = await fetchAdminApi<SubscriptionsResponse>("/api/admin/subscriptions");

  const trialCount = data.subscriptions.filter((item) => item.status === "TRIAL").length;
  const activeCount = data.subscriptions.filter((item) => item.status === "ACTIVE").length;
  const inactiveCount = data.subscriptions.filter((item) => item.status === "INACTIVE").length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Access Control"
        title="Subscriptions"
        description="Kelola status akses user untuk trial, active, dan inactive tanpa harus masuk ke database langsung."
      />

      <div className="stats-grid">
        <StatCard label="Total Records" value={formatCompactNumber(data.subscriptions.length)} />
        <StatCard
          label="Trial"
          value={formatCompactNumber(trialCount)}
          hint="Masih dalam masa trial"
          tone="accent"
        />
        <StatCard
          label="Active"
          value={formatCompactNumber(activeCount)}
          hint="Akses penuh aktif"
          tone="success"
        />
        <StatCard
          label="Inactive"
          value={formatCompactNumber(inactiveCount)}
          hint="Butuh reactivation"
          tone="warning"
        />
      </div>

      <SectionCard
        title="Subscription Console"
        description="Update status langsung dari panel admin untuk kebutuhan demo, support, atau audit internal."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>WhatsApp</th>
                <th>Status</th>
                <th>Updated At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.subscriptions.map((item) => (
                <tr key={item.id}>
                  <td>{item.waNumber}</td>
                  <td>
                    <StatusBadge label={item.status} tone={getStatusTone(item.status)} />
                  </td>
                  <td>{formatDateTime(item.updatedAt)}</td>
                  <td>
                    <form action={updateSubscriptionStatusAction} className="inline-form">
                      <input type="hidden" name="subscriptionId" value={item.id} />
                      <select name="status" defaultValue={item.status}>
                        <option value="TRIAL">TRIAL</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                      </select>
                      <button type="submit" className="button">
                        Update
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
