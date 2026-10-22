import type { ReactNode } from "react";

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="premium-profile-section at-settings-section vm-settings-group" data-section={title.toLowerCase().replace(/[^a-z]+/g, "-")}>
      <div className="vm-settings-heading">
        <h2>{title}</h2>
      </div>
      <div className="premium-settings-list vm-settings-list">{children}</div>
    </section>
  );
}
