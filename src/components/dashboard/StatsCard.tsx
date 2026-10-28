import { cn } from "@/src/lib/utils";
import { Card } from "@/src/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: { value: number; positive: boolean };
  className?: string;
  accent?: "primary" | "accent" | "purple" | "blue";
}

const accentColors = {
  primary: "from-primary-500 to-primary-600",
  accent: "from-accent-500 to-accent-600",
  purple: "from-purple-500 to-purple-600",
  blue: "from-blue-500 to-blue-600",
};

export function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
  accent = "primary",
}: StatsCardProps) {
  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {/* Accent bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1 bg-gradient-to-r",
          accentColors[accent]
        )}
      />

      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-3xl font-bold text-gray-900 tracking-tight">
              {value}
            </p>
            {description && (
              <p className="text-sm text-gray-500">{description}</p>
            )}
          </div>
          {icon && (
            <div
              className={cn(
                "p-2 rounded-lg bg-gradient-to-br",
                accentColors[accent]
              )}
            >
              <div className="text-white w-5 h-5">{icon}</div>
            </div>
          )}
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1">
            <svg
              className={cn(
                "w-4 h-4",
                trend.positive ? "text-green-500" : "text-red-500"
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={
                  trend.positive
                    ? "M5 10l7-7m0 0l7 7m-7-7v18"
                    : "M19 14l-7 7m0 0l-7-7m7 7V3"
                }
              />
            </svg>
            <span
              className={cn(
                "text-sm font-medium",
                trend.positive ? "text-green-600" : "text-red-600"
              )}
            >
              {Math.abs(trend.value)}%
            </span>
            <span className="text-sm text-gray-500">vs last month</span>
          </div>
        )}
      </div>
    </Card>
  );
}
