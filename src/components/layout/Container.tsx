import { cn } from "@/lib/utils";

/** The page frame beside the sidebar: max width, gutters and vertical rhythm. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-330 px-4 py-6 sm:px-6 lg:px-10 lg:py-9",
        className,
      )}
    >
      {children}
    </div>
  );
}
