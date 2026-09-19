export const REPORT_ROUTES = {
  dashboard: "/dashboard",
  sales: "/reports/sales",
  items: "/reports/items",
  bills: "/bills",
  bill: (billId: string) => `/bills/${billId}`,
  print: (billId: string) => `/print/${billId}`,
} as const;
