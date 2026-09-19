"use client";

import { AppErrorScreen } from "@/components/custom/AppErrorScreen";

export default function AppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorScreen {...props} />;
}
