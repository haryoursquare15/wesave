import type { ReactNode } from "react";

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="premium-profile-section at-settings-section space-y-2" data-section={title.toLowerCase().replace(/[^a-z]+/g, "-")}>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {title}
      </h2>
      <div className="premium-settings-list bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border">
        {children}
      </div>
    </section>
  );
}
