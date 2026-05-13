"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateReminderTemplateAction } from "@/app/reminders/actions";

type TemplateEntity = {
  token: string;
  source: string;
};

type ReminderTemplateDialogProps = {
  reminderTemplateId: string;
  title: string;
  reminderType: string;
  messageText: string;
  entities: TemplateEntity[];
};

const reminderTypeOptions = [
  { value: "weekly_review", label: "Review mingguan" },
  { value: "monthly_closing", label: "Closing bulanan" },
  { value: "cashflow_buffer", label: "Cashflow buffer" },
  { value: "recurring_due", label: "Tagihan berulang" },
  { value: "goal_off_track", label: "Goal off track" },
  { value: "goal_reached", label: "Goal tercapai" },
  { value: "weekly_spike", label: "Pengeluaran naik" },
  { value: "daily_digest", label: "Digest harian" }
];

const entitySourceOptions = [
  { value: "user_name", label: "Nama user" },
  { value: "wa_number", label: "Nomor WhatsApp" },
  { value: "payday", label: "Tanggal gajian" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "net", label: "Net cashflow" },
  { value: "transaction_count", label: "Jumlah transaksi" },
  { value: "top_category", label: "Kategori terbesar" },
  { value: "month", label: "Bulan" },
  { value: "date", label: "Tanggal" },
  { value: "goal_name", label: "Nama goal" },
  { value: "remaining_amount", label: "Sisa target" },
  { value: "eta", label: "Estimasi waktu" },
  { value: "label", label: "Nama tagihan" },
  { value: "bucket", label: "Bucket/kategori" },
  { value: "due_label", label: "Jatuh tempo" },
  { value: "average_amount", label: "Rata-rata nominal" },
  { value: "custom", label: "Custom/manual" }
];

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="button">
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

const getNextEntityToken = (entities: TemplateEntity[]) => {
  const usedNumbers = new Set(
    entities
      .map((entity) => entity.token.match(/^\(\{(\d+)\}\)$/)?.[1])
      .filter(Boolean)
      .map(Number)
  );

  let next = 1;
  while (usedNumbers.has(next)) next += 1;
  return `({${next}})`;
};

export function EditReminderTemplateDialog({
  reminderTemplateId,
  title,
  reminderType,
  messageText,
  entities
}: ReminderTemplateDialogProps) {
  const [open, setOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftReminderType, setDraftReminderType] = useState(reminderType);
  const [draftMessageText, setDraftMessageText] = useState(messageText);
  const [draftEntities, setDraftEntities] = useState<TemplateEntity[]>(entities);

  const entitiesJson = useMemo(
    () => JSON.stringify(draftEntities),
    [draftEntities]
  );

  const addEntity = () => {
    const token = getNextEntityToken(draftEntities);
    setDraftEntities((current) => [
      ...current,
      { token, source: entitySourceOptions[0].value }
    ]);
    setDraftMessageText((current) => (current ? `${current} ${token}` : token));
  };

  const updateEntitySource = (token: string, source: string) => {
    setDraftEntities((current) =>
      current.map((entity) =>
        entity.token === token ? { ...entity, source } : entity
      )
    );
  };

  const removeEntity = (token: string) => {
    setDraftEntities((current) => current.filter((entity) => entity.token !== token));
  };

  const dialogTitle = `Edit ${title}`;

  return (
    <>
      <button
        type="button"
        className="icon-button"
        aria-label={dialogTitle}
        title={dialogTitle}
        onClick={() => setOpen(true)}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>

      {open ? (
        <div className="modal-backdrop" role="presentation">
          <div
            aria-modal="true"
            className="modal-panel modal-panel-wide"
            role="dialog"
            aria-labelledby={`reminder-template-${reminderTemplateId ?? "new"}`}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Reminder Template</p>
                <h2 id={`reminder-template-${reminderTemplateId ?? "new"}`}>
                  {dialogTitle}
                </h2>
                <p className="muted">
                  Pakai token seperti <span className="mono">({"{"}1{"}"})</span>, lalu pilih sumber datanya di entity mapping. Penanda sistem dibuat otomatis.
                </p>
              </div>
              <button
                type="button"
                className="icon-button icon-button-muted"
                aria-label="Close"
                title="Close"
                onClick={() => setOpen(false)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <form action={updateReminderTemplateAction} className="modal-form">
              <input
                type="hidden"
                name="reminderTemplateId"
                value={reminderTemplateId}
              />
              <input type="hidden" name="entitiesJson" value={entitiesJson} />

              <div className="template-form-grid">
                <div className="field-stack">
                  <label htmlFor={`title-${reminderTemplateId ?? "new"}`}>Title</label>
                  <input
                    id={`title-${reminderTemplateId ?? "new"}`}
                    name="title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    required
                  />
                </div>
                <div className="field-stack">
                  <label htmlFor={`type-${reminderTemplateId ?? "new"}`}>Kategori</label>
                  <input type="hidden" name="reminderType" value={draftReminderType} />
                  <select
                    id={`type-${reminderTemplateId ?? "new"}`}
                    value={draftReminderType}
                    disabled
                    required
                  >
                    <option value="" disabled>
                      Pilih kategori
                    </option>
                    {reminderTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field-stack">
                <div className="field-label-row">
                  <label htmlFor={`message-${reminderTemplateId ?? "new"}`}>Message</label>
                  <button type="button" className="button button-compact" onClick={addEntity}>
                    Add Entity
                  </button>
                </div>
                <textarea
                  id={`message-${reminderTemplateId ?? "new"}`}
                  name="messageText"
                  value={draftMessageText}
                  onChange={(event) => setDraftMessageText(event.target.value)}
                  rows={8}
                  required
                />
              </div>

              <div className="entity-map">
                <div className="entity-map-header">
                  <h3>Entity Mapping</h3>
                  <p className="muted">
                    Pilih data untuk mengganti token saat reminder dibuat.
                  </p>
                </div>
                {draftEntities.length ? (
                  <div className="entity-list">
                    {draftEntities.map((entity) => (
                      <div className="entity-row" key={entity.token}>
                        <span className="entity-token mono">{entity.token}</span>
                        <select
                          value={entity.source}
                          onChange={(event) =>
                            updateEntitySource(entity.token, event.target.value)
                          }
                          aria-label={`Source for ${entity.token}`}
                        >
                          {entitySourceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="icon-button icon-button-muted"
                          aria-label={`Remove ${entity.token}`}
                          title={`Remove ${entity.token}`}
                          onClick={() => removeEntity(entity.token)}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            width="17"
                            height="17"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                          >
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">Belum ada entity.</p>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <SaveButton />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
