"use client";

import { Suspense, useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Card, CardHeader, CardContent, CardFooter } from "@/src/components/ui/card";

// useSearchParams needs a Suspense boundary in the Next.js app router.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const [role, setRole] = useState<"CANDIDATE" | "ADMIN">(
    searchParams.get("role") === "admin" ? "ADMIN" : "CANDIDATE"
  );
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", adminCode: "" });
  const isAdmin = role === "ADMIN";
  const [error, setError] = useState("");

  const register = useMutation(
    trpc.auth.register.mutationOptions({
      onSuccess: async () => {
        const result = await signIn("credentials", {
          email: form.email,
          password: form.password,
          redirect: false,
        });
        if (result?.error) {
          setError("Account created, but sign-in failed. Please try logging in.");
          router.push("/login");
          return;
        }
        router.push(isAdmin ? "/dashboard" : "/portal/jobs");
        router.refresh();
      },
      onError: (err) => {
        setError(err.message || "Something went wrong.");
      },
    })
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    register.mutate({ ...form, adminCode: isAdmin ? form.adminCode : undefined, role });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="text-sm text-gray-500 mt-1">
              {isAdmin
                ? "Post jobs and screen candidates with AI"
                : "Apply to jobs and track your interviews"}
            </p>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-gray-100" role="tablist" aria-label="Account type">
              {(
                [
                  { value: "CANDIDATE", label: "I'm a Candidate" },
                  { value: "ADMIN", label: "I'm a Recruiter (Admin)" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={role === opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    role === opt.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <Input
              label="Full name"
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Email"
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label="Phone (optional)"
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              label="Password"
              id="password"
              type="password"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
            {isAdmin && (
              <Input
                label="Admin signup code"
                id="adminCode"
                type="password"
                placeholder="Ask the platform owner for this code"
                value={form.adminCode}
                onChange={(e) => setForm({ ...form, adminCode: e.target.value })}
                required
              />
            )}
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" isLoading={register.isPending}>
              {isAdmin ? "Create Admin Account" : "Create Account"}
            </Button>
            <p className="text-sm text-gray-500 text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-primary-600 font-medium hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
