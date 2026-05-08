import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SectionCard({ title, description, actions, children }: SectionCardProps) {
  return (
    <section className="surface">
      <div className="surface-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="surface-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
