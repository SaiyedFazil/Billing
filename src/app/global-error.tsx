"use client";

/**
 * Replaces the root layout entirely when it fails, so it cannot use Tailwind
 * classes or any component — inline styles only. Colours are the Ember tokens
 * from globals.css, copied as literals.
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
          margin: 0,
          fontFamily: "system-ui, 'Segoe UI', sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#faf7f2",
          color: "#1c1917",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0 }}>
          The app could not start
        </h1>
        <p style={{ color: "#6f665e", fontSize: "0.9375rem", margin: 0 }}>
          Reload the page. If this keeps happening, contact whoever set this up
          {error.digest ? ` and quote ${error.digest}` : ""}.
        </p>
        {/* A plain <a>: the router may be what failed. */}
        <a
          href="/bill"
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem 1.25rem",
            borderRadius: "0.75rem",
            background: "#d1431b",
            color: "#ffffff",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to billing
        </a>
      </body>
    </html>
  );
}
