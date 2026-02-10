"use client";

import { useState } from "react";

import {
  Zap,
  Bell,
  ChevronRight,
  TrendingUp,
  Activity,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Plus,
  ExternalLink,
  Key,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// Sample data
const apiKeys = [
  { id: 1, name: "Production", key: "sk_prod_xxxxxxxxxxxxxxxxxxxxx", lastUsed: "2 hours ago", status: "active" },
  { id: 2, name: "Development", key: "sk_dev_xxxxxxxxxxxxxxxxxxxxx", lastUsed: "5 mins ago", status: "active" },
  { id: 3, name: "Testing", key: "sk_test_xxxxxxxxxxxxxxxxxxxxx", lastUsed: "1 day ago", status: "inactive" },
];

const subscriptions = [
  { name: "AI Vision API", plan: "Pro", calls: 185000, limit: 250000, nextBilling: "Jan 15, 2026" },
  { name: "Data Processing API", plan: "Basic", calls: 42000, limit: 50000, nextBilling: "Jan 15, 2026" },
];

const recentActivity = [
  { action: "API call", endpoint: "/v1/vision/analyze", status: "success", time: "2 mins ago" },
  { action: "API call", endpoint: "/v1/data/transform", status: "success", time: "5 mins ago" },
  { action: "API call", endpoint: "/v1/vision/detect", status: "error", time: "8 mins ago" },
  { action: "Key rotated", endpoint: "Production key", status: "info", time: "1 hour ago" },
  { action: "API call", endpoint: "/v1/data/batch", status: "success", time: "2 hours ago" },
];

export default function OverviewPage() {
  const t = useTranslations("OverviewPage");
  const [showKey, setShowKey] = useState<number | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm">
            <Bell className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              window.location.href = "/packages";
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("add_api")}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t("stats.total_api_calls"),
            value: "2.4M",
            change: "+12%",
            icon: Activity,
            color: "from-blue-500 to-cyan-500",
          },
          {
            label: t("stats.active_subscriptions"),
            value: "3",
            change: "+1",
            icon: Zap,
            color: "from-primary to-primary/70",
          },
          {
            label: t("stats.success_rate"),
            value: "99.8%",
            change: "+0.2%",
            icon: TrendingUp,
            color: "from-green-500 to-emerald-500",
          },
          {
            label: t("stats.avg_response_time"),
            value: "45ms",
            change: "-5ms",
            icon: Clock,
            color: "from-purple-500 to-pink-500",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-muted-foreground mb-1 text-sm">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-accent mt-1 text-xs">
                    {stat.change} {t("stats.this_month")}
                  </p>
                </div>
                <div
                  className={`h-10 w-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}
                >
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Subscriptions & Usage */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("subscriptions.title")}</CardTitle>
                  <CardDescription>{t("subscriptions.description")}</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    window.location.href = "/packages";
                  }}
                >
                  {t("subscriptions.view_all")}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {subscriptions.map((sub) => (
                <div key={sub.name} className="bg-muted/50 rounded-xl p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{sub.name}</h4>
                      <p className="text-muted-foreground text-sm">
                        {sub.plan} {t("subscriptions.plan")} • {t("subscriptions.renews")} {sub.nextBilling}
                      </p>
                    </div>
                    <Badge variant="outline">{sub.plan}</Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("subscriptions.api_calls")}</span>
                      <span>
                        {sub.calls.toLocaleString()} / {sub.limit.toLocaleString()}
                      </span>
                    </div>
                    <Progress value={(sub.calls / sub.limit) * 100} className="h-2" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t("api_keys.title")}</CardTitle>
                  <CardDescription>{t("api_keys.description")}</CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  {t("api_keys.new_key")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div key={key.id} className="bg-muted/50 flex items-center justify-between rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
                        <Key className="text-primary h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{key.name}</span>
                          <Badge variant={key.status === "active" ? "default" : "secondary"} className="text-xs">
                            {key.status === "active" ? t("api_keys.active") : t("api_keys.inactive")}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground font-mono text-xs">
                          {showKey === key.id ? key.key : key.key.slice(0, 12) + "••••••••••••"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                      >
                        {showKey === key.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(key.key)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>{t("activity.title")}</CardTitle>
              <CardDescription>{t("activity.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={`${activity.endpoint}-${activity.time}`} className="flex items-start gap-3">
                    <div
                      className={`mt-2 h-2 w-2 rounded-full ${
                        activity.status === "success"
                          ? "bg-accent"
                          : activity.status === "error"
                            ? "bg-destructive"
                            : "bg-primary"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{activity.endpoint}</p>
                      <p className="text-muted-foreground text-xs">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>{t("quick_links.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: t("quick_links.api_documentation"), path: "/docs" },
                { name: t("quick_links.support_center"), path: "/support" },
                { name: t("quick_links.status_page"), path: "/status" },
                { name: t("quick_links.billing_history"), path: "/dashboard/billing" },
              ].map((link) => (
                <button
                  key={link.name}
                  type="button"
                  onClick={() => {
                    window.location.href = link.path;
                  }}
                  className="hover:bg-muted flex w-full items-center justify-between rounded-lg p-3 text-left transition-colors"
                >
                  <span className="text-sm">{link.name}</span>
                  <ExternalLink className="text-muted-foreground h-4 w-4" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
