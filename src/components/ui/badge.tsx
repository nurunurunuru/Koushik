import { cn, getStatusColor } from "@/src/lib/utils";

interface BadgeProps {
  status: string;
  className?: string;
  dot?: boolean;
}

export function Badge({ status, className, dot = true }: BadgeProps) {
  const colors = getStatusColor(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
        colors.bg,
        colors.text,
        className
      )}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full", colors.dot)} />
      )}
      {status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ")}
    </span>
  );
}
