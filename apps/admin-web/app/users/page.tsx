import { fetchAdminApi } from "@/lib/api";

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
    subscriptionStatus: string;
    savingsGoalTarget: number | null;
    savingsGoalProgress: number | null;
  }>;
};

export default async function UsersPage() {
  const data = await fetchAdminApi<UsersResponse>("/api/admin/users");
  return (
    <section className="card">
      <h1>Users</h1>
      <p>Auto-registered users from WhatsApp messages.</p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>WhatsApp</th>
            <th>Profile</th>
            <th>Registration</th>
            <th>Subscription</th>
            <th>Transactions</th>
            <th>Messages</th>
            <th>Savings Goal</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.users.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.waNumber}</td>
              <td>
                {(user.name ?? "-")} / {user.currency} / budget {user.monthlyBudget ?? 0}
              </td>
              <td>
                {user.registrationStatus} ({user.onboardingStep})
              </td>
              <td>{user.subscriptionStatus}</td>
              <td>{user.transactionCount}</td>
              <td>{user.messageCount}</td>
              <td>
                {user.savingsGoalProgress ?? 0} / {user.savingsGoalTarget ?? 0}
              </td>
              <td>{new Date(user.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
