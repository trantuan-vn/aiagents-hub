import { Star } from "lucide-react";

export function StarDisplay({ count, size = "sm" }: { count?: number; size?: "sm" | "md" }) {
  const n = Math.min(5, Math.max(0, Math.round(count ?? 0)));
  const iconClass = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((level) => (
        <Star key={`star-${level}`} className={`${iconClass} ${level <= n ? "fill-current" : "opacity-25"}`} />
      ))}
    </span>
  );
}
