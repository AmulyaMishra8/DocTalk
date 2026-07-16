import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@auth/shared";
import { authApi } from "../api/auth";
import { AuthLayout } from "../components/AuthLayout";
import { FormField } from "../components/FormField";
import { Alert } from "../components/Alert";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput) {
    await authApi.forgotPassword(values.email).catch(() => {});
    setSent(true); // always show the same message (no email enumeration)
  }

  return (
    <AuthLayout
      title="Reset password"
      subtitle="We'll email you a reset link"
      footer={<Link to="/login">Back to sign in</Link>}
    >
      {sent ? (
        <Alert kind="success">If that email exists, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <button className="btn mt-16" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
