/**
 * Merge class names, filtering out falsy values
 */
export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ");
}

/**
 * Format a date to a human-readable string
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a date to a relative time string (e.g., "2 hours ago")
 */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(date);
}

/**
 * Format duration in seconds to a human-readable string
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Get a color class for a candidate status
 */
export function getStatusColor(
  status: string
): { bg: string; text: string; dot: string } {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    NEW: { bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" },
    SCREENING: {
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      dot: "bg-yellow-500",
    },
    INTERVIEWING: {
      bg: "bg-purple-100",
      text: "text-purple-800",
      dot: "bg-purple-500",
    },
    OFFERED: {
      bg: "bg-indigo-100",
      text: "text-indigo-800",
      dot: "bg-indigo-500",
    },
    HIRED: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
    REJECTED: {
      bg: "bg-red-100",
      text: "text-red-800",
      dot: "bg-red-500",
    },
    ACTIVE: {
      bg: "bg-green-100",
      text: "text-green-800",
      dot: "bg-green-500",
    },
    CLOSED: {
      bg: "bg-gray-100",
      text: "text-gray-800",
      dot: "bg-gray-500",
    },
    DRAFT: {
      bg: "bg-orange-100",
      text: "text-orange-800",
      dot: "bg-orange-500",
    },
    COMPLETED: {
      bg: "bg-green-100",
      text: "text-green-800",
      dot: "bg-green-500",
    },
    FAILED: { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
    SCHEDULED: {
      bg: "bg-blue-100",
      text: "text-blue-800",
      dot: "bg-blue-500",
    },
    IN_PROGRESS: {
      bg: "bg-yellow-100",
      text: "text-yellow-800",
      dot: "bg-yellow-500",
    },
    APPLIED: { bg: "bg-blue-100", text: "text-blue-800", dot: "bg-blue-500" },
    AI_REVIEWED: {
      bg: "bg-purple-100",
      text: "text-purple-800",
      dot: "bg-purple-500",
    },
    INTERVIEW_APPROVED: {
      bg: "bg-indigo-100",
      text: "text-indigo-800",
      dot: "bg-indigo-500",
    },
    INTERVIEW_INVITED: {
      bg: "bg-cyan-100",
      text: "text-cyan-800",
      dot: "bg-cyan-500",
    },
    INTERVIEW_COMPLETED: {
      bg: "bg-teal-100",
      text: "text-teal-800",
      dot: "bg-teal-500",
    },
    STRONG_YES: { bg: "bg-green-100", text: "text-green-800", dot: "bg-green-500" },
    YES: { bg: "bg-lime-100", text: "text-lime-800", dot: "bg-lime-500" },
    MAYBE: { bg: "bg-yellow-100", text: "text-yellow-800", dot: "bg-yellow-500" },
    NO: { bg: "bg-red-100", text: "text-red-800", dot: "bg-red-500" },
  };
  return (
    colors[status] ?? {
      bg: "bg-gray-100",
      text: "text-gray-800",
      dot: "bg-gray-500",
    }
  );
}
