import { buttonVariants } from "./ui/button";
import { Skeleton, SkeletonText } from "./ui/skeleton";

export function AccountUsageSkeleton({ featured = false }: { featured?: boolean }) {
  const metric = (key: number) => <div className="account-usage-metric" key={key}>
    <span className="usage-preview-label"><SkeletonText width={featured ? "12ch" : key === 0 ? "6ch" : "7ch"} /></span>
    <strong><SkeletonText width="3ch" /><span className="usage-preview-unit"><SkeletonText width="4ch" /></span></strong>
    <span className="usage-preview-plot"><Skeleton className="usage-preview-track" /></span>
  </div>;

  if (featured) return <div className="account-usage-metrics antigravity-featured" aria-hidden="true">
    {[0, 1].map(column => <div className="antigravity-featured-model" key={column}>
      <div className="account-usage-preview"><div className="account-usage-metrics">{metric(column)}</div></div>
    </div>)}
  </div>;

  return <div className="account-usage-preview" aria-hidden="true">
    <div className="account-usage-metrics">{[0, 1].map(metric)}</div>
  </div>;
}

/** Match the home cards while account identities and limits are loading. */
export function LoadingSkeleton({ count = 1, provider = "codex", initial = true }: {
  count?: number;
  provider?: "codex" | "antigravity";
  initial?: boolean;
}) {
  const hasEmail = provider === "codex";
  const action = buttonVariants({ size: "icon-sm", variant: "ghost" });
  return <div className="workspace-account-list" role="status" aria-label={initial ? "Loading" : "Loading accounts"}>
    {Array.from({ length: count }, (_, row) => <div className="workspace-account account-card" aria-hidden="true" key={row}>
      <div className="workspace-account-row">
        <div className="workspace-account-info account-identity">
          <Skeleton className="account-monogram" />
          <div className="account-identity-copy">
            <div className="workspace-account-title">
              <span className="row-title"><SkeletonText width="9ch" /></span>
              <Skeleton className="plan-badge"><span>Plan</span></Skeleton>
            </div>
            {hasEmail ? <div className="account-secondary-meta"><span className="workspace-account-email"><SkeletonText width="16ch" /></span></div> : null}
          </div>
        </div>
        <div className="workspace-account-actions">
          <Skeleton className={action} />
          {count > 1 ? <Skeleton className={action} /> : null}
        </div>
      </div>
      <AccountUsageSkeleton featured={provider === "antigravity"} />
    </div>)}
  </div>;
}
