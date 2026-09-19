import { Inbox, type LucideIcon } from "lucide-react";

export function TableEmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed bg-card/60 px-6 py-14 text-center">
      <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <Icon className="size-5" />
      </span>
      <p className="font-heading text-lg font-bold">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-3">{action}</div> : null}
    </div>
  );
}
