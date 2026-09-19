import { cn } from "@/lib/utils";

/** The rounded paper card every data table sits in, with an optional footer bar. */
export function TableCard({
  children,
  footer,
  className,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[20px] border bg-card shadow-card",
        className,
      )}
    >
      {children}
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-table-head/60 px-4 py-3">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
