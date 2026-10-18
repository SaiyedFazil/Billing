import { ArrowRight, PackageCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { StockBadge } from "@/components/custom/StockBadge";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { thumbnailUrl } from "@/lib/storage";
import { PARAM_BY_FILTER, STOCK_FILTER_PARAM } from "@/lib/utils/stock";
import type { StockAlerts } from "@/types/stock.types";

/**
 * Tracked items running low or out, so a shift starts with what to reorder.
 * Both roles see it; only the owner gets the link, because the Items page is
 * owner-only.
 */
export function StockAlertsCard({
  alerts,
  canManage,
}: {
  alerts: StockAlerts;
  canManage: boolean;
}) {
  const needAttention = alerts.low + alerts.out;

  return (
    <section className="flex flex-col gap-5 rounded-[20px] border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Stock alerts</h2>
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {needAttention === 0
              ? `${alerts.trackedCount} tracked`
              : `${alerts.low} low · ${alerts.out} out`}
          </p>
        </div>
        {canManage && needAttention > 0 ? (
          <Link
            // The most urgent group: out of stock if any, otherwise low.
            href={`${ADMIN_ROUTES.items}?${STOCK_FILTER_PARAM}=${
              PARAM_BY_FILTER[alerts.out > 0 ? "OUT" : "LOW"]
            }`}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-brand-soft"
          >
            View all
            <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>

      {needAttention === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success-ink">
            <PackageCheck className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            All stock levels are healthy.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {alerts.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted font-heading text-sm font-bold text-foreground/70">
                {item.imageUrl ? (
                  <Image
                    src={thumbnailUrl(item.imageUrl, 72)}
                    alt=""
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                ) : (
                  item.name.charAt(0)
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.categoryName}
                </p>
              </div>
              <StockBadge level={{ ...item, trackStock: true }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
