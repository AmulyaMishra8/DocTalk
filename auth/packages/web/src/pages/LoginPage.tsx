import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { loginSchema, type LoginInput } from "@auth/shared";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { AuthLayout } from "../components/AuthLayout";
import { FormField } from "../components/FormField";
import { Alert } from "../components/Alert";
import { SocialButtons } from "../components/SocialButtons";

export function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  // If an OAuth attempt bounced back with ?error=, show a friendly message.
  const oauthError = params.get("error")
    ? "Social login didn't complete. Please try again."
    : "";
  const [formError, setFormError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setFormError("");
    try {
      const res = await authApi.login(values);
      if (res.status === "mfaRequired") {
        // Password ok — go finish with the 6-digit code.
        navigate("/mfa", { state: { mfaToken: res.mfaToken } });
        return;
      }
      await refresh();
      navigate("/");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account"
      footer={
        <>
          No account? <Link to="/register">Create one</Link>
        </>
      }
    >
      <Alert kind="error">{formError || oauthError}</Alert>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="row-between mt-16">
          <span />
          <Link to="/forgot-password" className="muted">
            Forgot password?
          </Link>
        </div>
        <button className="btn mt-16" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="divider"><span>or</span></div>
      <SocialButtons />
    </AuthLayout>
  );
}
