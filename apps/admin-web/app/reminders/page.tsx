import Link from "next/link";
import { EditReminderTemplateDialog } from "@/components/edit-reminder-template-dialog";
import { PageHeader } from "@/components/page-header";
import { ResendOutboundForm } from "@/components/resend-outbound-form";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { fetchAdminApi } from "@/lib/api";
import { formatCompactNumber, formatDateTime } from "@/lib/format";

type RemindersResponse = {
  summary: {
    sentOutboundMessages: number;
    failedOutboundMessages: number;
    reminderTemplates: number;
  };
  recentFailures: Array<{
    id: string;
    userId: string;
    userName: string | null;
    waNumber: string;
    messageText: string;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  reminders: Array<{
    id: string;
    templateKey: string;
    title: string;
    reminderType: string;
    messageText: string;
    entities: Array<{
      token: string;
      source: string;
    }>;
    isActive: boolean;
    updatedAt: string;
  }>;
};

export default async function RemindersPage() {
  const data = await fetchAdminApi<RemindersResponse>("/api/admin/reminders");

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Reminder Operations"
        title="Reminders"
        description="Pantau reminder yang berhasil dan gagal terkirim, lalu edit isi reminder atau queue ulang pesan gagal."
      />

      <div className="stats-grid stats-grid-compact">
        <StatCard
          label="Sent To Users"
          value={formatCompactNumber(data.summary.sentOutboundMessages)}
          hint="Outbound berhasil terkirim ke user"
          tone="success"
        />
        <StatCard
          label="Failed To Users"
          value={formatCompactNumber(data.summary.failedOutboundMessages)}
          hint="Outbound gagal terkirim ke user"
          tone="warning"
        />
        <StatCard
          label="Reminder Items"
          value={formatCompactNumber(data.summary.reminderTemplates)}
          hint="Template reminder di database"
          tone="accent"
        />
      </div>

      <SectionCard
        title="Failed Messages"
        description="Pesan yang gagal terkirim ke user. Resend akan memasukkan ulang pesan ke outbound queue."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Message</th>
                <th>Error</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.recentFailures.length ? (
                data.recentFailures.map((failure) => (
                  <tr key={failure.id}>
                    <td>
                      <div className="stack">
                        <Link href={`/users/${failure.userId}`}>
                          <strong>{failure.userName ?? "Unnamed user"}</strong>
                        </Link>
                        <span className="mono">{failure.waNumber}</span>
                      </div>
                    </td>
                    <td className="message-cell">{failure.messageText}</td>
                    <td>{failure.errorMessage ?? "Unknown error"}</td>
                    <td>{formatDateTime(failure.updatedAt)}</td>
                    <td>
                      <ResendOutboundForm outboundMessageId={failure.id} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Tidak ada pesan gagal saat ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Reminder Messages"
        description="Template isi reminder dari database. Ubah teksnya bila perlu."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reminder</th>
                <th>Message</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.reminders.length ? (
                data.reminders.map((reminder) => (
                  <tr key={reminder.id}>
                    <td>
                      <div className="stack">
                        <strong>{reminder.title}</strong>
                        <StatusBadge label={reminder.reminderType} tone="accent" />
                      </div>
                    </td>
                    <td className="message-cell">
                      <div className="message-preview">{reminder.messageText}</div>
                    </td>
                    <td>
                      <StatusBadge
                        label={reminder.isActive ? "ACTIVE" : "OFF"}
                        tone={reminder.isActive ? "success" : "neutral"}
                      />
                    </td>
                    <td>{formatDateTime(reminder.updatedAt)}</td>
                    <td>
                      <EditReminderTemplateDialog
                        reminderTemplateId={reminder.id}
                        title={reminder.title}
                        reminderType={reminder.reminderType}
                        messageText={reminder.messageText}
                        entities={reminder.entities}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Belum ada template reminder.
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
