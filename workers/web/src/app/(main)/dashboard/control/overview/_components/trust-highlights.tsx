"use client";

import { Shield, Zap, Scale, Plug, Globe } from "lucide-react";

interface TrustHighlight {
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  descKey: string;
}

const HIGHLIGHTS: TrustHighlight[] = [
  { icon: Zap, titleKey: "lightning_fast", descKey: "lightning_fast_desc" },
  { icon: Shield, titleKey: "enterprise_security", descKey: "enterprise_security_desc" },
  { icon: Scale, titleKey: "flexible_scaling", descKey: "flexible_scaling_desc" },
  { icon: Plug, titleKey: "easy_integration", descKey: "easy_integration_desc" },
  { icon: Globe, titleKey: "global_reach", descKey: "global_reach_desc" },
];

interface TrustHighlightsProps {
  t: (key: string) => string;
}

export function TrustHighlights({ t }: TrustHighlightsProps) {
  return (
    <div className="bg-muted/30 rounded-xl border p-4 md:p-6">
      <p className="text-muted-foreground mb-4 text-center text-sm font-medium">{t("trust.subtitle")}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {HIGHLIGHTS.map(({ icon: Icon, titleKey, descKey }) => (
          <div
            key={titleKey}
            className="hover:bg-background/80 group flex flex-col items-center gap-2 rounded-lg p-4 text-center transition-colors"
          >
            <div className="bg-primary/10 group-hover:bg-primary/20 flex h-10 w-10 items-center justify-center rounded-lg transition-colors">
              <Icon className="text-primary h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">{t(`trust.${titleKey}`)}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{t(`trust.${descKey}`)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
