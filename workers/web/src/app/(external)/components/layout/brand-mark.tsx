import { Bot } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn("group flex items-center gap-2", className)}>
      <div className="relative">
        <div className="from-primary to-accent flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg transition-shadow duration-300 group-hover:shadow-xl">
          <Bot className="text-primary-foreground h-5 w-5" />
        </div>
        <div className="from-primary to-accent absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-50" />
      </div>
      <span className="text-xl font-bold tracking-tight">
        {compact ? (
          <>
            AI<span className="text-primary">Hub</span>
          </>
        ) : (
          <>
            AI Agents<span className="text-primary"> Hub</span>
          </>
        )}
      </span>
    </Link>
  );
}
