"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Check } from "lucide-react";
import {
  AuthShell,
  AuthHeader,
  AuthInput,
  AuthDivider,
  AuthError,
  GoldenButton,
  GoogleButton,
} from "@/components/auth/AuthShell";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
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

  if (success) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center mb-5"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              backgroundColor: "rgba(26,122,90,0.15)",
              color: "var(--lagoon)",
            }}
          >
            <Check size={26} strokeWidth={2.5} />
          </div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.01em",
            }}
          >
            Check your email
          </h1>
          <p
            className="mt-2"
            style={{ fontSize: 13, color: "rgba(168,191,174,0.7)" }}
          >
            We sent a confirmation link to{" "}
            <span style={{ color: "var(--golden)", fontWeight: 600 }}>{email}</span>
          </p>
          <Link
            href="/login"
            className="mt-6 font-semibold transition-colors text-[13px]"
            style={{ color: "var(--golden)" }}
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeader
        title="Create your account"
        subtitle="Start managing your properties in minutes"
      />
      <form onSubmit={handleSignup} className="space-y-4">
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
          placeholder="Min 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />

        {error && <AuthError message={error} />}

        <GoldenButton type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
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
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold transition-colors"
          style={{ color: "var(--golden)" }}
        >
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
