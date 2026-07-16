// A small inline banner for success / error messages on forms.
export function Alert({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  if (!children) return null;
  return <div className={`alert alert--${kind}`}>{children}</div>;
}
