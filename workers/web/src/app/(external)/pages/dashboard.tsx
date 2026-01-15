"use client";
/* eslint-disable max-lines */

import { useState } from "react";

import {
  Zap,
  BarChart3,
  Key,
  CreditCard,
  Settings,
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
} from "lucide-react";
import { Link } from "react-router-dom";

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

const Dashboard = () => {
  const [showKey, setShowKey] = useState<number | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Sidebar */}
      <aside className="bg-card border-border fixed top-0 bottom-0 left-0 hidden w-64 border-r p-4 lg:block">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <div className="from-primary to-accent flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br">
            <Zap className="text-primary-foreground h-4 w-4" />
          </div>
          <span className="text-lg font-bold">
            API<span className="text-primary">Hub</span>
          </span>
        </Link>

        <nav className="space-y-1">
          {[
            { name: "Overview", icon: BarChart3, path: "/dashboard", active: true },
            { name: "API Keys", icon: Key, path: "/dashboard/keys", active: false },
            { name: "Billing", icon: CreditCard, path: "/dashboard/billing", active: false },
            { name: "Notifications", icon: Bell, path: "/dashboard/notifications", active: false },
            { name: "Settings", icon: Settings, path: "/dashboard/settings", active: false },
          ].map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                item.active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="absolute right-4 bottom-4 left-4">
          <Card className="from-primary/10 to-accent/10 border-primary/20 bg-gradient-to-br">
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-medium">Need Help?</p>
              <p className="text-muted-foreground mb-3 text-xs">Chat with our AI assistant for quick support.</p>
              <Link to="/support">
                <Button variant="outline" size="sm" className="w-full">
                  Open Chat
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </aside>

      {/* Main Content */}
      <main className="p-6 lg:ml-64 lg:p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back! Here&apos;s your API overview.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <Bell className="h-4 w-4" />
            </Button>
            <Link to="/packages">
              <Button variant="default" size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Add API
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Total API Calls",
              value: "2.4M",
              change: "+12%",
              icon: Activity,
              color: "from-blue-500 to-cyan-500",
            },
            { label: "Active Subscriptions", value: "3", change: "+1", icon: Zap, color: "from-primary to-primary/70" },
            {
              label: "Success Rate",
              value: "99.8%",
              change: "+0.2%",
              icon: TrendingUp,
              color: "from-green-500 to-emerald-500",
            },
            {
              label: "Avg Response Time",
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
                    <p className="text-accent mt-1 text-xs">{stat.change} this month</p>
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
                    <CardTitle>Active Subscriptions</CardTitle>
                    <CardDescription>Your current API packages and usage</CardDescription>
                  </div>
                  <Link to="/packages">
                    <Button variant="ghost" size="sm">
                      View all
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {subscriptions.map((sub) => (
                  <div key={sub.name} className="bg-muted/50 rounded-xl p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{sub.name}</h4>
                        <p className="text-muted-foreground text-sm">
                          {sub.plan} Plan • Renews {sub.nextBilling}
                        </p>
                      </div>
                      <Badge variant="outline">{sub.plan}</Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">API Calls</span>
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
                    <CardTitle>API Keys</CardTitle>
                    <CardDescription>Manage your API authentication keys</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    New Key
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
                              {key.status}
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
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest API calls and events</CardDescription>
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
                <CardTitle>Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { name: "API Documentation", path: "/docs" },
                  { name: "Support Center", path: "/support" },
                  { name: "Status Page", path: "/status" },
                  { name: "Billing History", path: "/dashboard/billing" },
                ].map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    className="hover:bg-muted flex items-center justify-between rounded-lg p-3 transition-colors"
                  >
                    <span className="text-sm">{link.name}</span>
                    <ExternalLink className="text-muted-foreground h-4 w-4" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
