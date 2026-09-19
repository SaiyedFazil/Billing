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
    <div className="bg-card/60 flex flex-col items-center gap-2 rounded-[20px] border border-dashed px-6 py-14 text-center">
      <span className="bg-brand-soft text-primary mb-2 flex size-12 items-center justify-center rounded-2xl">
        <Icon className="size-5" />
      </span>
      <p className="font-heading text-lg font-bold">{title}</p>
      {description ? (
        <p className="text-muted-foreground max-w-sm text-sm text-pretty">
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-3">{action}</div> : null}
    </div>
  );
}
