"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  AuthShell,
  AuthHeader,
  AuthInput,
  AuthDivider,
  AuthError,
  GoldenButton,
  GoogleButton,
} from "@/components/auth/AuthShell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeader
        title="Welcome back"
        subtitle="Sign in to manage your properties"
      />
      <form onSubmit={handleLogin} className="space-y-4">
        <AuthInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <AuthInput
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />

        {error && <AuthError message={error} />}

        <GoldenButton type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </GoldenButton>
      </form>

      <AuthDivider />

      <GoogleButton onClick={handleGoogle} disabled={googleLoading}>
        {googleLoading ? "Redirecting..." : "Google"}
      </GoogleButton>

      <div
        className="mt-6 text-center text-[13px]"
        style={{ color: "rgba(168,191,174,0.6)" }}
      >
        New to Koast?{" "}
        <Link
          href="/signup"
          className="font-semibold transition-colors"
          style={{ color: "var(--golden)" }}
        >
          Create an account
        </Link>
      </div>
    </AuthShell>
  );
}
