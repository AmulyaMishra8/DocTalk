import { forwardRef, type InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

// A labelled input that shows its validation error underneath. Works with
// react-hook-form's register() because it forwards the ref and props.
export const FormField = forwardRef<HTMLInputElement, Props>(function FormField(
  { label, error, ...props },
  ref,
) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input ref={ref} className={`field-input ${error ? "field-input--error" : ""}`} {...props} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
});
