import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type HealthResponse = {
  dbStatus: "healthy" | "down";
  reportingStatus: "healthy" | "down";
  botHeartbeat: {
    status: "healthy" | "stale" | "down";
    lastSeenAt: string | null;
  };
  checkedAt: string;
};

const getHealthTone = (status: string) => {
  if (status === "healthy") return "success" as const;
  if (status === "stale") return "warning" as const;
  return "danger" as const;
};

export default async function HealthPage() {
  const data = await fetchAdminApi<HealthResponse>("/api/admin/health");

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Runtime Status"
        title="System Health"
        description="Quick view untuk database, reporting service, dan heartbeat bot sebelum investigasi lebih dalam."
      />

      <div className="stats-grid">
        <StatCard
          label="Database"
          value={data.dbStatus}
          hint="Status koneksi utama"
          tone={data.dbStatus === "healthy" ? "success" : "warning"}
        />
        <StatCard
          label="Reporting"
          value={data.reportingStatus}
          hint="PDF dan reporting pipeline"
          tone={data.reportingStatus === "healthy" ? "success" : "warning"}
        />
        <StatCard
          label="Bot Heartbeat"
          value={data.botHeartbeat.status}
          hint={
            data.botHeartbeat.lastSeenAt
              ? formatDateTime(data.botHeartbeat.lastSeenAt)
              : "Belum ada heartbeat"
          }
          tone={data.botHeartbeat.status === "healthy" ? "success" : "warning"}
        />
        <StatCard
          label="Last Check"
          value={formatDateTime(data.checkedAt)}
          hint="Snapshot health terakhir"
        />
      </div>

      <SectionCard
        title="Component Status"
        description="Kalau salah satu komponen turun, gunakan tabel ini sebagai titik awal isolasi masalah."
      >
        <div className="table-shell">
          <table className="data-table">
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
                  <StatusBadge
                    label={data.dbStatus}
                    tone={getHealthTone(data.dbStatus)}
                  />
                </td>
                <td>-</td>
              </tr>
              <tr>
                <td>Reporting Service</td>
                <td>
                  <StatusBadge
                    label={data.reportingStatus}
                    tone={getHealthTone(data.reportingStatus)}
                  />
                </td>
                <td>-</td>
              </tr>
              <tr>
                <td>Bot Heartbeat</td>
                <td>
                  <StatusBadge
                    label={data.botHeartbeat.status}
                    tone={getHealthTone(data.botHeartbeat.status)}
                  />
                </td>
                <td>{formatDateTime(data.botHeartbeat.lastSeenAt)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
