import { Link } from "react-router-dom";

// The logo mark, fixed to the top-left on every page. Links back to home.
// The image is served from packages/web/public/logo.png.
export function BrandHeader() {
  return (
    <Link to="/" className="brand" aria-label="Home">
      <img src="/logo.png" alt="Amulya Mishra" />
    </Link>
  );
}
