"use client";

/**
 * Replaces the root layout entirely when it fails, so it cannot use Tailwind
 * classes or any component — inline styles only.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          The app could not start
        </h1>
        <p style={{ color: "#666", fontSize: "0.875rem" }}>
          Reload the page. If this keeps happening, contact whoever set this up
          {error.digest ? ` and quote ${error.digest}` : ""}.
        </p>
        <a href="/bill" style={{ textDecoration: "underline" }}>
          Back to billing
        </a>
      </body>
    </html>
  );
}
