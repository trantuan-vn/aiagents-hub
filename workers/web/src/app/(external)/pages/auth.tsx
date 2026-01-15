"use client";

import { useState, useEffect } from "react";

import { Zap, Mail, Lock, User, ArrowRight, Github, Chrome } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    setIsSignUp(searchParams.get("mode") === "signup");
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Auth logic will be implemented with Supabase
    console.log("Auth submitted:", { email, password, name, isSignUp });
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel - Form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <Link to="/" className="mb-8 flex items-center gap-2">
            <div className="from-primary to-accent flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br">
              <Zap className="text-primary-foreground h-5 w-5" />
            </div>
            <span className="text-xl font-bold">
              API<span className="text-primary">Hub</span>
            </span>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="mb-2 text-2xl font-bold">{isSignUp ? "Create your account" : "Welcome back"}</h1>
            <p className="text-muted-foreground">
              {isSignUp ? "Start building with powerful APIs today" : "Sign in to access your dashboard"}
            </p>
          </div>

          {/* OAuth Buttons */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full">
              <Chrome className="mr-2 h-4 w-4" />
              Google
            </Button>
            <Button variant="outline" className="w-full">
              <Github className="mr-2 h-4 w-4" />
              GitHub
            </Button>
          </div>

          <div className="relative mb-6">
            <Separator />
            <span className="bg-background text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 text-xs">
              or continue with email
            </span>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {!isSignUp && (
                  <Link to="/forgot-password" className="text-primary text-xs hover:underline">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Button variant="default" className="w-full" type="submit">
              {isSignUp ? "Create Account" : "Sign In"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {/* Toggle */}
          <p className="text-muted-foreground mt-6 text-center text-sm">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary font-medium hover:underline">
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
      </div>

      {/* Right Panel - Decorative */}
      <div className="from-primary/10 via-background to-accent/10 relative hidden flex-1 items-center justify-center overflow-hidden bg-gradient-to-br p-8 lg:flex">
        <div className="bg-grid absolute inset-0 opacity-30" />
        <div className="bg-primary/20 absolute top-1/4 right-1/4 h-96 w-96 rounded-full blur-3xl" />
        <div className="bg-accent/20 absolute bottom-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-md text-center">
          <div className="from-primary to-accent mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br shadow-2xl">
            <Zap className="text-primary-foreground h-10 w-10" />
          </div>
          <h2 className="mb-4 text-3xl font-bold">
            Power Your Apps with <span className="gradient-text">Enterprise APIs</span>
          </h2>
          <p className="text-muted-foreground">
            Join 10,000+ developers building with our reliable, scalable API infrastructure. Get started in minutes with
            our comprehensive documentation.
          </p>

          {/* Feature list */}
          <div className="mt-8 space-y-3">
            {["99.9% uptime guarantee", "Global CDN distribution", "24/7 dedicated support"].map((feature) => (
              <div key={feature} className="flex items-center justify-center gap-2 text-sm">
                <div className="bg-accent/20 flex h-5 w-5 items-center justify-center rounded-full">
                  <div className="bg-accent h-2 w-2 rounded-full" />
                </div>
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
