import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ResetOnboardingForm } from "@/components/reset-onboarding-form";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminApi } from "@/lib/api";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatShortId
} from "@/lib/format";

type UserDetailPageProps = {
  params: {
    userId: string;
  };
  searchParams?: {
    type?: string;
    startDate?: string;
    endDate?: string;
  };
};

type UserDetailResponse = {
  user: {
    id: string;
    waNumber: string;
    name: string | null;
    currency: string;
    monthlyBudget: number | null;
    registrationStatus: string;
    onboardingStatus: string;
    onboardingStep: string;
    onboardingCompletedAt: string | null;
    createdAt: string;
    transactionCount: number;
    messageCount: number;
    savingsGoalTarget: number | null;
    savingsGoalProgress: number | null;
  };
  monthlySummary: {
    income: number;
    expense: number;
    saving: number;
    net: number;
  };
  topExpenseCategories: Array<{
    category: string;
    amount: number;
  }>;
  reminderPreference: {
    budgetEnabled: boolean;
    weeklyEnabled: boolean;
    weeklyReviewEnabled: boolean;
    recurringEnabled: boolean;
    cashflowEnabled: boolean;
    goalEnabled: boolean;
    monthlyClosingEnabled: boolean;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    minIntervalHours: number;
    maxPerDay: number;
    snoozedUntil: string | null;
    updatedAt: string;
  } | null;
  reminderEvents: Array<{
    id: string;
    reminderType: string;
    marker: string;
    sentAt: string;
  }>;
  onboardingHistory: Array<{
    id: string;
    stepKey: string;
    questionKey: string;
    isCompleted: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  transactions: Array<{
    id: string;
    type: "INCOME" | "EXPENSE" | "SAVING";
    amount: number;
    category: string;
    merchant: string | null;
    note: string | null;
    occurredAt: string;
    source: "TEXT" | "OCR";
    createdAt: string;
  }>;
};

const getRegistrationTone = (registrationStatus: string, onboardingStep: string) => {
  const status = registrationStatus.toLowerCase();
  const step = onboardingStep.toLowerCase();

  if (status.includes("complete") || step.includes("complete")) {
    return "success" as const;
  }

  if (status.includes("progress") || step !== "wait_register") {
    return "warning" as const;
  }

  return "neutral" as const;
};

const buildDetailQuery = (params: UserDetailPageProps["searchParams"]) => {
  const query = new URLSearchParams();
  if (params?.type) query.set("type", params.type);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  const text = query.toString();
  return text ? `?${text}` : "";
};

const getReminderStatus = (
  preference: UserDetailResponse["reminderPreference"]
) => {
  if (!preference) {
    return "NOT SET";
  }

  if (preference.snoozedUntil && new Date(preference.snoozedUntil) > new Date()) {
    return "SNOOZED";
  }

  const enabledCount = [
    preference.budgetEnabled,
    preference.weeklyEnabled,
    preference.weeklyReviewEnabled,
    preference.recurringEnabled,
    preference.cashflowEnabled,
    preference.goalEnabled,
    preference.monthlyClosingEnabled
  ].filter(Boolean).length;

  return enabledCount > 0 ? "ACTIVE" : "OFF";
};

const getAmountClass = (type: "INCOME" | "EXPENSE" | "SAVING") =>
  type === "INCOME" ? "amount-positive" : "amount-negative";

export default async function UserDetailPage({
  params,
  searchParams
}: UserDetailPageProps) {
  let data: UserDetailResponse;

  try {
    data = await fetchAdminApi<UserDetailResponse>(
      `/api/admin/users/${params.userId}${buildDetailQuery(searchParams)}`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      notFound();
    }
    throw error;
  }

  const { user } = data;
  const reminderStatus = getReminderStatus(data.reminderPreference);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="User Detail"
        title={user.name ?? "Unnamed user"}
        description="Profil user, status onboarding, target tabungan, reminder, dan riwayat transaksi user ini."
        actions={
          <div className="inline">
            <Link className="button button-secondary" href="/users">
              Back to Users
            </Link>
            <ResetOnboardingForm userId={user.id} />
          </div>
        }
      />

      <div className="stats-grid">
        <StatCard
          label="Income This Month"
          value={formatCurrency(data.monthlySummary.income, user.currency)}
          hint="Pemasukan bulan berjalan"
          tone="success"
        />
        <StatCard
          label="Expense This Month"
          value={formatCurrency(data.monthlySummary.expense, user.currency)}
          hint="Pengeluaran bulan berjalan"
          tone="warning"
        />
        <StatCard
          label="Net This Month"
          value={formatCurrency(data.monthlySummary.net, user.currency)}
          hint="Income dikurangi expense dan saving"
          tone="accent"
        />
        <StatCard
          label="Transactions"
          value={formatCompactNumber(user.transactionCount)}
          hint="Total transaksi tersimpan"
        />
      </div>

      <SectionCard
        title="User Profile"
        description="Data utama yang dipakai untuk audit akun dan konteks finansial user."
      >
        <div className="detail-grid">
          <div>
            <span className="detail-label">WhatsApp</span>
            <strong className="mono">{user.waNumber}</strong>
          </div>
          <div>
            <span className="detail-label">User ID</span>
            <strong className="mono" title={user.id}>
              {formatShortId(user.id, 14)}
            </strong>
          </div>
          <div>
            <span className="detail-label">Registration</span>
            <StatusBadge
              label={user.registrationStatus}
              tone={getRegistrationTone(user.registrationStatus, user.onboardingStep)}
            />
          </div>
          <div>
            <span className="detail-label">Onboarding</span>
            <StatusBadge
              label={user.onboardingStatus}
              tone={user.onboardingStatus === "COMPLETED" ? "success" : "warning"}
            />
          </div>
          <div>
            <span className="detail-label">Reminder</span>
            <StatusBadge
              label={reminderStatus}
              tone={
                reminderStatus === "ACTIVE"
                  ? "success"
                  : reminderStatus === "SNOOZED"
                    ? "warning"
                    : "neutral"
              }
            />
          </div>
          <div>
            <span className="detail-label">Monthly Budget</span>
            <strong>{formatCurrency(user.monthlyBudget ?? 0, user.currency)}</strong>
          </div>
          <div>
            <span className="detail-label">Messages</span>
            <strong>{formatCompactNumber(user.messageCount)}</strong>
          </div>
          <div>
            <span className="detail-label">Created</span>
            <strong>{formatDateTime(user.createdAt)}</strong>
          </div>
          <div>
            <span className="detail-label">Savings Target</span>
            <strong>{formatCurrency(user.savingsGoalTarget ?? 0, user.currency)}</strong>
          </div>
          <div>
            <span className="detail-label">Savings Progress</span>
            <strong>{formatCurrency(user.savingsGoalProgress ?? 0, user.currency)}</strong>
          </div>
        </div>
      </SectionCard>

      <div className="split-grid">
        <SectionCard
          title="Top Expense Categories"
          description="Kategori pengeluaran terbesar bulan berjalan."
        >
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.topExpenseCategories.length ? (
                  data.topExpenseCategories.map((item) => (
                    <tr key={item.category}>
                      <td>{item.category}</td>
                      <td className="amount-negative">
                        {formatCurrency(item.amount, user.currency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="empty-state">
                      Belum ada expense bulan ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Reminder Preferences"
          description="Preferensi reminder user dan pengiriman terakhir."
        >
          {data.reminderPreference ? (
            <div className="detail-grid detail-grid-tight">
              <div>
                <span className="detail-label">Enabled Features</span>
                <strong>
                  {
                    [
                      data.reminderPreference.budgetEnabled,
                      data.reminderPreference.weeklyEnabled,
                      data.reminderPreference.weeklyReviewEnabled,
                      data.reminderPreference.recurringEnabled,
                      data.reminderPreference.cashflowEnabled,
                      data.reminderPreference.goalEnabled,
                      data.reminderPreference.monthlyClosingEnabled
                    ].filter(Boolean).length
                  }
                </strong>
              </div>
              <div>
                <span className="detail-label">Max Per Day</span>
                <strong>{data.reminderPreference.maxPerDay}</strong>
              </div>
              <div>
                <span className="detail-label">Min Interval</span>
                <strong>{data.reminderPreference.minIntervalHours} jam</strong>
              </div>
              <div>
                <span className="detail-label">Quiet Hours</span>
                <strong>
                  {data.reminderPreference.quietHoursStart ?? "-"}-
                  {data.reminderPreference.quietHoursEnd ?? "-"}
                </strong>
              </div>
            </div>
          ) : (
            <p className="empty-state">User belum punya reminder preference.</p>
          )}

          <div className="table-shell spaced-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Marker</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {data.reminderEvents.length ? (
                  data.reminderEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{event.reminderType}</td>
                      <td>{event.marker}</td>
                      <td>{formatDateTime(event.sentAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="empty-state">
                      Belum ada reminder terkirim.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Onboarding History"
        description="Riwayat step onboarding terakhir untuk support dan debug alur setup user."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Question</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.onboardingHistory.length ? (
                data.onboardingHistory.map((session) => (
                  <tr key={session.id}>
                    <td>{session.stepKey}</td>
                    <td>{session.questionKey}</td>
                    <td>
                      <StatusBadge
                        label={session.isCompleted ? "COMPLETED" : "OPEN"}
                        tone={session.isCompleted ? "success" : "warning"}
                      />
                    </td>
                    <td>{formatDateTime(session.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="empty-state">
                    Belum ada riwayat onboarding.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="User Transactions"
        description="Transaksi terbaru user ini. Filter hanya mempersempit data yang ditampilkan."
      >
        <form method="get" className="filter-bar filter-bar-compact">
          <div className="field-stack">
            <label htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={searchParams?.type ?? ""}>
              <option value="">All Types</option>
              <option value="INCOME">INCOME</option>
              <option value="EXPENSE">EXPENSE</option>
              <option value="SAVING">SAVING</option>
            </select>
          </div>
          <div className="field-stack">
            <label htmlFor="startDate">Start Date</label>
            <input
              id="startDate"
              type="date"
              name="startDate"
              defaultValue={searchParams?.startDate ?? ""}
            />
          </div>
          <div className="field-stack">
            <label htmlFor="endDate">End Date</label>
            <input
              id="endDate"
              type="date"
              name="endDate"
              defaultValue={searchParams?.endDate ?? ""}
            />
          </div>
          <div className="field-stack">
            <label>&nbsp;</label>
            <button type="submit" className="button">
              Apply Filters
            </button>
          </div>
        </form>

        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Category</th>
                <th>Merchant</th>
                <th>Source</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.length ? (
                data.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <div className="stack">
                        <strong>{formatDateTime(tx.occurredAt)}</strong>
                        <span className="muted mono" title={tx.id}>
                          {formatShortId(tx.id, 10)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        label={tx.type}
                        tone={
                          tx.type === "INCOME"
                            ? "success"
                            : tx.type === "EXPENSE"
                              ? "warning"
                              : "accent"
                        }
                      />
                    </td>
                    <td className={getAmountClass(tx.type)}>
                      {formatCurrency(tx.amount, user.currency)}
                    </td>
                    <td>{tx.category}</td>
                    <td>{tx.merchant ?? "-"}</td>
                    <td>
                      <StatusBadge
                        label={tx.source}
                        tone={tx.source === "OCR" ? "accent" : "neutral"}
                      />
                    </td>
                    <td>{tx.note ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-state">
                    Belum ada transaksi yang cocok dengan filter ini.
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
