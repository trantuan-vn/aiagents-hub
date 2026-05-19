import { Star } from "lucide-react";

export function StarDisplay({ count }: { count?: number }) {
  const n = count ?? 0;
  return (
    <span className="inline-flex gap-0.5 text-amber-500">
      {[1, 2, 3, 4, 5].map((level) => (
        <Star key={`star-${level}`} className={`h-3.5 w-3.5 ${level <= n ? "fill-current" : "opacity-25"}`} />
      ))}
    </span>
  );
}
