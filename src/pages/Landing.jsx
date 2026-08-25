import React, { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const LOGO_URL = import.meta.env.VITE_LOGO_URL || "/logo.png";

const FEATURES = [
  { title: "Title, description & tags", body: "Generates YouTube-ready title, description and tags from raw news notes." },
  { title: "Webpage article", body: "Writes a matching article version of the same story for your website." },
  { title: "Publish to YouTube", body: "Uploads the finished video once you've approved it." },
];

function Logo() {
  return <img src={LOGO_URL} alt="Studio logo" className="logo-img" />;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.87 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.85.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export default function Landing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/auth/login`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.login_url) {
        throw new Error(data.detail || "Could not start Google sign-in.");
      }

      window.location.href = data.login_url;
    } catch (err) {
      setError(err.message || "Could not reach the server.");
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar topbar-3col">
        <Logo />
        <h1 className="app-name">YouTube Publisher</h1>
        <button className="google-btn" onClick={signIn} disabled={loading}>
          <GoogleIcon />
          {loading ? "Signing in…" : "Sign in with Google"}
        </button>
      </header>

      <main className="landing-body">
        {error && <p className="error-message" role="alert">{error}</p>}
        <h2 className="landing-heading">What it does</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
