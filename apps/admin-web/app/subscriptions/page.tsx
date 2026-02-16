import { fetchAdminApi } from "@/lib/api";
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

export default async function SubscriptionsPage() {
  const data = await fetchAdminApi<SubscriptionsResponse>("/api/admin/subscriptions");
  return (
    <section className="card">
      <h1>Subscriptions</h1>
      <p>Stub MVP for subscription management.</p>
      <table>
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
              <td>{item.status}</td>
              <td>{new Date(item.updatedAt).toLocaleString()}</td>
              <td>
                <form action={updateSubscriptionStatusAction} className="inline">
                  <input type="hidden" name="subscriptionId" value={item.id} />
                  <select name="status" defaultValue={item.status}>
                    <option value="TRIAL">TRIAL</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                  <button type="submit">Update</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
