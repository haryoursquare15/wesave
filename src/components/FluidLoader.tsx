/** Presentation-only; callers own every loading condition and redirect. */
export function FluidLoader() {
  return (
    <div className="fluid-loader" role="status" aria-live="polite" aria-label="Syncing your data">
      <div className="fluid-loader-stage" aria-hidden="true">
        <div className="fluid-loader-ring" />
        <div className="fluid-loader-ring fluid-loader-ring-delayed" />
        <div className="fluid-loader-glow" />
        <div className="fluid-loader-orbit fluid-loader-orbit-a">
          <div className="fluid-loader-blob fluid-loader-blob-a" />
        </div>
        <div className="fluid-loader-orbit fluid-loader-orbit-b">
          <div className="fluid-loader-blob fluid-loader-blob-b" />
        </div>
        <div className="fluid-loader-highlight" />
      </div>
      <div className="fluid-loader-copy" aria-hidden="true">
        <p className="text-xl font-semibold text-foreground">Syncing your data</p>
        <p className="mt-2 text-sm text-muted-foreground">Just a moment, almost there</p>
        <div className="fluid-loader-dots"><span /><span /><span /></div>
      </div>
    </div>
  );
}