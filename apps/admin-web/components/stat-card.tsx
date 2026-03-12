type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "accent" | "success" | "warning";
};

export function StatCard({ label, value, hint, tone = "neutral" }: StatCardProps) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </article>
  );
}
