import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminApi } from "@/lib/api";
import {
  formatCompactNumber,
  formatDateTime,
  formatPercent,
} from "@/lib/format";

type ObservabilityResponse = {
  days: number;
  since: string;
  totalObserved: number;
  ambiguityCount: number;
  semanticRewriteCount: number;
  fallbackCount: number;
  topCommands: Array<{ value: string; count: number }>;
  topHandlers: Array<{ value: string; count: number }>;
  topFallbackStages: Array<{ value: string; count: number }>;
  latestAmbiguous: Array<{
    id: string;
    rawText: string;
    effectiveText: string;
    commandKind: string;
    topModule: string | null;
    resolutionKind: string;
    resolutionSource: string | null;
    handledBy: string;
    fallbackStage: string | null;
    createdAt: string;
  }>;
};

export default async function ObservabilityPage() {
  const data = await fetchAdminApi<ObservabilityResponse>(
    "/api/admin/observability",
  );
  const ambiguityRate =
    data.totalObserved > 0
      ? (data.ambiguityCount / data.totalObserved) * 100
      : 0;
  const fallbackRate =
    data.totalObserved > 0
      ? (data.fallbackCount / data.totalObserved) * 100
      : 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Routing Quality"
        title="Observability"
        description={`Coverage ${data.days} hari terakhir sejak ${formatDateTime(data.since)} untuk ambiguity, semantic rewrite, fallback, dan handler routing.`}
      />

      <div className="stats-grid">
        <StatCard
          label="Observed Messages"
          value={formatCompactNumber(data.totalObserved)}
          tone="accent"
        />
        <StatCard
          label="Ambiguity"
          value={formatCompactNumber(data.ambiguityCount)}
          hint={formatPercent(ambiguityRate)}
          tone="warning"
        />
        <StatCard
          label="Semantic Rewrite"
          value={formatCompactNumber(data.semanticRewriteCount)}
          hint="Normalisasi bahasa natural"
          tone="success"
        />
        <StatCard
          label="Fallback"
          value={formatCompactNumber(data.fallbackCount)}
          hint={formatPercent(fallbackRate)}
        />
      </div>

      <SectionCard
        title="Routing Summary"
        description="Angka ini membantu lihat apakah bot banyak menebak, banyak rewrite, atau sering jatuh ke fallback."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Observed</td>
                <td>{formatCompactNumber(data.totalObserved)}</td>
              </tr>
              <tr>
                <td>Ambiguity Count</td>
                <td>{formatCompactNumber(data.ambiguityCount)}</td>
              </tr>
              <tr>
                <td>Semantic Rewrite Count</td>
                <td>{formatCompactNumber(data.semanticRewriteCount)}</td>
              </tr>
              <tr>
                <td>Fallback Count</td>
                <td>{formatCompactNumber(data.fallbackCount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Top Commands"
        description="Intent yang paling sering masuk ke routing layer."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Command</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.topCommands.length ? (
                data.topCommands.map((item) => (
                  <tr key={item.value}>
                    <td>{item.value}</td>
                    <td>{item.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="empty-state">
                    Belum ada data command yang tercatat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Top Handlers"
        description="Handler akhir yang paling sering mengeksekusi request user."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Handler</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.topHandlers.length ? (
                data.topHandlers.map((item) => (
                  <tr key={item.value}>
                    <td>{item.value}</td>
                    <td>{item.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="empty-state">
                    Belum ada data handler yang tercatat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Fallback Stages"
        description="Tahap fallback yang paling sering aktif saat route utama tidak cukup yakin."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.topFallbackStages.length ? (
                data.topFallbackStages.map((item) => (
                  <tr key={item.value}>
                    <td>{item.value}</td>
                    <td>{item.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="empty-state">
                    Belum ada fallback yang tercatat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Latest Ambiguous Queries"
        description="Sampel query yang memerlukan rewrite, memory resolution, atau fallback clarification."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Raw</th>
                <th>Effective</th>
                <th>Route</th>
                <th>Resolution</th>
                <th>Handler</th>
              </tr>
            </thead>
            <tbody>
              {data.latestAmbiguous.length ? (
                data.latestAmbiguous.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{item.rawText}</td>
                    <td>{item.effectiveText}</td>
                    <td>
                      <div className="stack">
                        <strong>{item.commandKind}</strong>
                        {item.topModule ? (
                          <StatusBadge label={item.topModule} tone="accent" />
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {item.resolutionKind}
                      {item.resolutionSource
                        ? ` (${item.resolutionSource})`
                        : ""}
                    </td>
                    <td>
                      {item.handledBy}
                      {item.fallbackStage ? ` / ${item.fallbackStage}` : ""}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-state">
                    Belum ada query ambigu yang tercatat.
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
