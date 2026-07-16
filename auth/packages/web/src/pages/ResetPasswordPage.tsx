import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams } from "react-router-dom";
import { passwordSchema } from "@auth/shared";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { AuthLayout } from "../components/AuthLayout";
import { FormField } from "../components/FormField";
import { Alert } from "../components/Alert";

// Only the password is entered here; the token comes from the URL.
const formSchema = z.object({ password: passwordSchema });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setFormError("");
    try {
      await authApi.resetPassword(token, values.password);
      setDone(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/login">Back to sign in</Link>}>
      {done ? (
        <Alert kind="success">Password updated. You can sign in with it now.</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Alert kind="error">{formError}</Alert>
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <button className="btn mt-16" disabled={isSubmitting || !token}>
            {isSubmitting ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
