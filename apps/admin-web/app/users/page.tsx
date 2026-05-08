import { DeleteUserForm } from "@/components/delete-user-form";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminApi } from "@/lib/api";
import Link from "next/link";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatShortId
} from "@/lib/format";

type UsersResponse = {
  users: Array<{
    id: string;
    waNumber: string;
    name: string | null;
    currency: string;
    monthlyBudget: number | null;
    registrationStatus: string;
    onboardingStep: string;
    createdAt: string;
    transactionCount: number;
    messageCount: number;
    savingsGoalTarget: number | null;
    savingsGoalProgress: number | null;
  }>;
};

const getRegistrationTone = (registrationStatus: string, onboardingStep: string) => {
  const status = registrationStatus.toLowerCase();
  const step = onboardingStep.toLowerCase();

  if (status.includes("complete") || step.includes("complete")) {
    return "success" as const;
  }

  if (status.includes("progress") || step !== "not_started") {
    return "warning" as const;
  }

  return "neutral" as const;
};

export default async function UsersPage() {
  const data = await fetchAdminApi<UsersResponse>("/api/admin/users");

  const trackedTransactions = data.users.reduce((sum, user) => sum + user.transactionCount, 0);
  const activeGoals = data.users.filter((user) => (user.savingsGoalTarget ?? 0) > 0).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="User Operations"
        title="Users"
        description="Direktori user WhatsApp, status onboarding, budget dasar, dan target tabungan yang sedang aktif."
      />

      <div className="stats-grid">
        <StatCard
          label="Total Users"
          value={formatCompactNumber(data.users.length)}
          hint="Auto-registered dari percakapan WhatsApp"
          tone="accent"
        />
        <StatCard
          label="Onboarding Complete"
          value={formatCompactNumber(
            data.users.filter(
              (user) =>
                user.registrationStatus.toLowerCase().includes("complete") ||
                user.onboardingStep.toLowerCase().includes("complete")
            ).length
          )}
          hint="User yang sudah selesai setup"
          tone="success"
        />
        <StatCard
          label="Tracked Transactions"
          value={formatCompactNumber(trackedTransactions)}
          hint="Akumulasi transaksi yang tersimpan"
        />
        <StatCard
          label="Users With Goals"
          value={formatCompactNumber(activeGoals)}
          hint="Punya target tabungan aktif"
          tone="warning"
        />
      </div>

      <SectionCard
        title="User Directory"
        description="Dipakai untuk audit user base, onboarding, budget, dan performa adopsi fitur utama."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Profile</th>
                <th>Journey</th>
                <th>Activity</th>
                <th>Savings Goal</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="stack">
                      <strong>{user.name ?? "Unnamed user"}</strong>
                      <span className="mono">{user.waNumber}</span>
                      <span className="muted mono" title={user.id}>
                        {formatShortId(user.id, 10)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="stack">
                      <span>{user.currency}</span>
                      <span className="muted">
                        Budget {formatCurrency(user.monthlyBudget ?? 0, user.currency)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="stack">
                      <StatusBadge
                        label={user.registrationStatus}
                        tone={getRegistrationTone(user.registrationStatus, user.onboardingStep)}
                      />
                      <span className="muted">Step: {user.onboardingStep}</span>
                    </div>
                  </td>
                  <td>
                    <div className="stack">
                      <strong>{formatCompactNumber(user.transactionCount)} transaksi</strong>
                      <span className="muted">{formatCompactNumber(user.messageCount)} messages</span>
                    </div>
                  </td>
                  <td>
                    <div className="stack">
                      <strong>{formatCurrency(user.savingsGoalTarget ?? 0)}</strong>
                      <span className="muted">
                        Progress {formatCurrency(user.savingsGoalProgress ?? 0)}
                      </span>
                    </div>
                  </td>
                  <td>{formatDateTime(user.createdAt)}</td>
                  <td>
                    <div className="stack">
                      <Link className="button button-compact" href={`/users/${user.id}`}>
                        Detail
                      </Link>
                      <DeleteUserForm userId={user.id} />
                    </div>
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
