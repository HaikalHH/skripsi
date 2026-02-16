import { fetchAdminApi } from "@/lib/api";

type HealthResponse = {
  dbStatus: "healthy" | "down";
  reportingStatus: "healthy" | "down";
  botHeartbeat: {
    status: "healthy" | "stale" | "down";
    lastSeenAt: string | null;
  };
  checkedAt: string;
};

const badgeClass = (status: string) => {
  if (status === "healthy") return "badge badge-green";
  if (status === "stale") return "badge badge-yellow";
  return "badge badge-red";
};

export default async function HealthPage() {
  const data = await fetchAdminApi<HealthResponse>("/api/admin/health");
  return (
    <section className="card">
      <h1>System Health</h1>
      <p>Last check: {new Date(data.checkedAt).toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Status</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Database</td>
            <td>
              <span className={badgeClass(data.dbStatus)}>{data.dbStatus}</span>
            </td>
            <td>-</td>
          </tr>
          <tr>
            <td>Reporting Service</td>
            <td>
              <span className={badgeClass(data.reportingStatus)}>{data.reportingStatus}</span>
            </td>
            <td>-</td>
          </tr>
          <tr>
            <td>Bot Heartbeat</td>
            <td>
              <span className={badgeClass(data.botHeartbeat.status)}>{data.botHeartbeat.status}</span>
            </td>
            <td>{data.botHeartbeat.lastSeenAt ? new Date(data.botHeartbeat.lastSeenAt).toLocaleString() : "-"}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
