import { cn } from "@/lib/utils";

/**
 * The title block every page opens with: optional eyebrow, a display-face
 * title, one line of context, and the page's primary actions on the right.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  leading,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  /** Sits left of the title, e.g. a back button. */
  leading?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-brand-ink text-xs font-semibold tracking-[0.08em] uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-heading flex flex-wrap items-center gap-3 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[34px]">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground max-w-2xl text-[15px] text-pretty">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
