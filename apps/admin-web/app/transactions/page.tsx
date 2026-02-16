import { fetchAdminApi } from "@/lib/api";

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
  return (
    <section className="card">
      <h1>Transactions</h1>
      <form method="get" className="inline" style={{ marginBottom: 12 }}>
        <input
          type="text"
          name="userId"
          placeholder="User ID"
          defaultValue={searchParams?.userId ?? ""}
        />
        <select name="type" defaultValue={searchParams?.type ?? ""}>
          <option value="">All Types</option>
          <option value="INCOME">INCOME</option>
          <option value="EXPENSE">EXPENSE</option>
        </select>
        <input type="date" name="startDate" defaultValue={searchParams?.startDate ?? ""} />
        <input type="date" name="endDate" defaultValue={searchParams?.endDate ?? ""} />
        <button type="submit">Apply</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Occurred At</th>
            <th>WhatsApp</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Merchant</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {data.transactions.map((tx) => (
            <tr key={tx.id}>
              <td>{new Date(tx.occurredAt).toLocaleString()}</td>
              <td>{tx.waNumber}</td>
              <td>{tx.type}</td>
              <td>{tx.amount.toFixed(2)}</td>
              <td>{tx.category}</td>
              <td>{tx.merchant ?? "-"}</td>
              <td>{tx.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
