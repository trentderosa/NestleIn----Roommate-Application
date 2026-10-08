"use client";

import { startFresh } from "@/components/error-screen";

/**
 * Last resort: errors in the root layout itself. This replaces the whole
 * document, so global styles and fonts aren't available; styles are inline.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const button: React.CSSProperties = {
    height: 48,
    padding: "0 24px",
    borderRadius: 999,
    border: "none",
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer",
  };
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#fff8f1",
          color: "#3b1f3f",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <title>Something went wrong · NestleIn</title>
        <main role="alert" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>Something got tangled</h1>
          <p style={{ color: "#6b5170", margin: "0 0 24px" }}>
            NestleIn couldn&apos;t load. Reload to try again, or start fresh with the demo house (your
            current data is kept as a backup on this device).
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ ...button, background: "#3b1f3f", color: "#fff8f1" }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => {
                startFresh();
                window.location.reload();
              }}
              style={{ ...button, background: "#ffffff", color: "#3b1f3f", boxShadow: "0 1px 4px rgb(59 31 63 / .15)" }}
            >
              Start fresh
            </button>
          </div>
          {error.digest && <p style={{ fontSize: 12, color: "#6b5170", marginTop: 24 }}>Error {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
