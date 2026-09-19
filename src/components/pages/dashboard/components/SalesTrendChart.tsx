"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function SalesTrendChart({
  data,
}: {
  // Recharts plots numerically, so amounts are converted to numbers at this
  // boundary only. They are never summed back into a stored amount.
  data: Array<{ label: string; net: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 7 days</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CHART_CONFIG} className="h-64 w-full">
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={80}
              tickFormatter={(value: number) => formatINR(String(value))}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatINR(String(value))}
                />
              }
            />
            <Bar dataKey="net" fill="var(--color-net)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
