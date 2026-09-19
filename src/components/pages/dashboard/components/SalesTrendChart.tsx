"use client";

import {
  Bar,
  BarChart,
  type BarShapeProps,
  CartesianGrid,
  Rectangle,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatINR } from "@/lib/utils/money";

const CHART_CONFIG = {
  net: { label: "Sales", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Axis labels only ("₹4k") — never fed back into an amount. */
function compactRupees(value: number): string {
  if (value >= 100_000) {
    return `₹${(value / 100_000).toFixed(value % 100_000 === 0 ? 0 : 1)}L`;
  }
  if (value >= 1_000) {
    return `₹${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  }
  return `₹${value}`;
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-[3px] ${className}`} />
      {label}
    </span>
  );
}

export function SalesTrendChart({
  data,
}: {
  // Recharts plots numerically, so amounts are converted to numbers at this
  // boundary only. They are never summed back into a stored amount.
  data: Array<{ label: string; net: number; isToday: boolean }>;
}) {
  return (
    <section className="bg-card shadow-card flex flex-col gap-5 rounded-[20px] border p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-bold">Last 7 days</h2>
          <p className="text-muted-foreground text-[13px]">Net sales per day</p>
        </div>
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <LegendSwatch className="bg-chart-1" label="Today" />
          <LegendSwatch className="bg-chart-5" label="Earlier" />
        </div>
      </div>

      <ChartContainer config={CHART_CONFIG} className="h-72 w-full">
        <BarChart data={data} accessibilityLayer margin={{ top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={compactRupees}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)" }}
            content={
              <ChartTooltipContent
                formatter={(value) => formatINR(String(value))}
              />
            }
          />
          <Bar
            dataKey="net"
            radius={[10, 10, 4, 4]}
            maxBarSize={48}
            shape={(props: BarShapeProps) => (
              <Rectangle
                {...props}
                fill={
                  (props.payload as { isToday?: boolean }).isToday
                    ? "var(--chart-1)"
                    : "var(--chart-5)"
                }
              />
            )}
          />
        </BarChart>
      </ChartContainer>
    </section>
  );
}
