import { PageHeader } from "@/components/page-header";
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

type TransactionsPageProps = {
  searchParams?: {
    userId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  };
};

type TransactionsResponse = {
  transactions: Array<{
    id: string;
    userId: string;
    waNumber: string;
    type: "INCOME" | "EXPENSE";
    amount: number;
    category: string;
    merchant: string | null;
    note: string | null;
    occurredAt: string;
    source: "TEXT" | "OCR";
    createdAt: string;
  }>;
};

const buildQueryString = (params: TransactionsPageProps["searchParams"]) => {
  const query = new URLSearchParams();
  if (params?.userId) query.set("userId", params.userId);
  if (params?.type) query.set("type", params.type);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);
  const text = query.toString();
  return text ? `?${text}` : "";
};

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const query = buildQueryString(searchParams);
  const data = await fetchAdminApi<TransactionsResponse>(`/api/admin/transactions${query}`);

  const incomeTotal = data.transactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenseTotal = data.transactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const ocrCount = data.transactions.filter((transaction) => transaction.source === "OCR").length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Cashflow Ledger"
        title="Transactions"
        description="Audit semua transaksi hasil chat dan OCR, lengkap dengan filter waktu, tipe, merchant, dan sumber input."
      />

      <div className="stats-grid">
        <StatCard
          label="Rows Loaded"
          value={formatCompactNumber(data.transactions.length)}
          hint="Maksimum 500 transaksi terbaru"
          tone="accent"
        />
        <StatCard
          label="Income"
          value={formatCurrency(incomeTotal)}
          hint="Total pemasukan pada hasil filter"
          tone="success"
        />
        <StatCard
          label="Expense"
          value={formatCurrency(expenseTotal)}
          hint="Total pengeluaran pada hasil filter"
          tone="warning"
        />
        <StatCard
          label="OCR Sources"
          value={formatCompactNumber(ocrCount)}
          hint="Transaksi dari image ingestion"
        />
      </div>

      <SectionCard
        title="Filter & Activity Feed"
        description="Filter ini tidak mengubah data, hanya mempersempit audit transaksi yang ditampilkan."
      >
        <form method="get" className="filter-bar">
          <div className="field-stack">
            <label htmlFor="userId">User ID</label>
            <input
              id="userId"
              type="text"
              name="userId"
              placeholder="Filter by user ID"
              defaultValue={searchParams?.userId ?? ""}
            />
          </div>
          <div className="field-stack">
            <label htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue={searchParams?.type ?? ""}>
              <option value="">All Types</option>
              <option value="INCOME">INCOME</option>
              <option value="EXPENSE">EXPENSE</option>
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
                <th>User</th>
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
                      <div className="stack">
                        <strong>{tx.waNumber}</strong>
                        <span className="muted mono">{formatShortId(tx.userId, 10)}</span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        label={tx.type}
                        tone={tx.type === "INCOME" ? "success" : "warning"}
                      />
                    </td>
                    <td className={tx.type === "INCOME" ? "amount-positive" : "amount-negative"}>
                      {formatCurrency(tx.amount)}
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
                  <td colSpan={8} className="empty-state">
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
