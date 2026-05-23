import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/useAuth";
import client from "../api/client";
import Button from "../components/shared/Button";
import { ROUTES } from "../lib/constants";
import "./Landing.css";

const features = [
  {
    icon: "/lock-key-duotone.svg",
    title: "No rejection",
    body: "Neither of you ever sees what the other said no to. Only matches surface.",
  },
  {
    icon: "/moon-stars-duotone.svg",
    title: "Blind matching",
    body: "Both swipe independently. A match only appears when you both say yes.",
  },
  {
    icon: "/users-duotone.svg",
    title: "Just you two",
    body: "Fully private. No ads, no strangers, no data harvesting.",
  },
];

export default function Landing() {
  const [mode, setMode] = useState(null); // null = hero, 'login' = form, 'forgot' = reset
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { login, socialLogin, loading, logoutReason } = useAuth();
  const [socialLoading, setSocialLoading] = useState(null);
  const [resetStep, setResetStep] = useState(0); // 0=email, 1=code+new pw
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  }

  async function handleSocial(provider, fn) {
    setSocialLoading(provider);
    setError('');
    try {
      await fn();
    } catch (err) {
      if (err?.message) setError(err.message);
    } finally {
      setSocialLoading(null);
    }
  }

  function handleGoogleLogin() {
    if (!window.google?.accounts?.id) {
      setError('Google sign-in not available. Try refreshing.');
      return;
    }
    handleSocial('google', () => new Promise((resolve, reject) => {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        cancel_on_tap_outside: true,
        callback: async ({ credential }) => {
          try { await socialLogin('google', credential); resolve(); }
          catch (e) { reject(e); }
        },
      });
      window.google.accounts.id.prompt((n) => {
        if (n.isNotDisplayed() || n.isSkippedMoment()) {
          reject(new Error('Google sign-in was blocked by your browser. Try disabling extensions or use email login.'));
        }
      });
    }));
  }

  function handleAppleLogin() {
    handleSocial('apple', () => new Promise((resolve, reject) => {
      function doLogin() {
        window.AppleID.auth.init({
          clientId: import.meta.env.VITE_APPLE_WEB_SERVICE_ID || '',
          scope: 'name email',
          redirectURI: window.location.origin,
          usePopup: true,
        });
        window.AppleID.auth.signIn().then((resp) => {
          const name = resp.user?.name
            ? `${resp.user.name.firstName || ''} ${resp.user.name.lastName || ''}`.trim()
            : '';
          socialLogin('apple', resp.authorization.id_token, name).then(resolve).catch(reject);
        }).catch((e) => {
          if (e?.error === 'popup_closed_by_user') resolve();
          else reject(new Error('Apple sign-in failed.'));
        });
      }
      if (window.AppleID) { doLogin(); return; }
      const script = document.createElement('script');
      script.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
      script.onload = doLogin;
      script.onerror = () => reject(new Error('Failed to load Apple SDK.'));
      document.head.appendChild(script);
    }));
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setResetLoading(true);
    try {
      if (resetStep === 0) {
        await client.post("/auth/forgot-password", { email: resetEmail });
        setResetStep(1);
        setSuccess("Check your email for a reset code.");
      } else {
        await client.post("/auth/reset-password", { email: resetEmail, code: resetCode, new_password: newPassword });
        setSuccess("Password updated. You can now sign in.");
        setTimeout(() => { setMode("login"); setSuccess(""); }, 2000);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
    setResetLoading(false);
  }

  function openForm() {
    setMode("login");
    setError("");
    setSuccess("");
    setUsername("");
    setPassword("");
  }

  function openForgot() {
    setMode("forgot");
    setError("");
    setSuccess("");
    setResetStep(0);
    setResetEmail("");
    setResetCode("");
    setNewPassword("");
  }

  return (
    <main className="landing">
      {/* Atmospheric orbs */}
      <div className="landing-orb landing-orb-1" />
      <div className="landing-orb landing-orb-2" />
      <div className="landing-orb landing-orb-3" />

      {logoutReason === 'another_device' && (
        <motion.div
          className="landing-kicked-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          You were logged out because your account was signed in on another device.
        </motion.div>
      )}

      {/* ── BRAND — always visible, centered on top ── */}
      <div className="landing-brand">
        <img src="/venn_hori.png" alt="Venn" className="landing-logo-svg" />
        <p className="landing-tagline">Find your overlap.</p>
      </div>

      {/* ── CONTENT — animates between hero and form ── */}
      <AnimatePresence mode="wait">
        {mode === null ? (
          <motion.div
            key="hero"
            className="landing-below-brand"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="landing-features">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  className="landing-feature"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <img src={f.icon} alt={f.title} className="landing-feature-icon" />
                  <div>
                    <p className="landing-feature-title">{f.title}</p>
                    <p className="landing-feature-body">{f.body}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="landing-cta"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
            >
              <Button variant="primary" size="lg" fullWidth onClick={openForm}>
                Sign in
              </Button>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            className="landing-below-brand landing-form-view"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.5 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 400) setMode(null);
            }}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <button className="landing-back" onClick={() => setMode(null)}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              back
            </button>

            <h1 className="landing-heading">Log in to Venn</h1>
            <p className="landing-subtitle">Welcome back</p>

            <form className="landing-form" onSubmit={handleSubmit}>
                <div className="landing-field">
                  <label className="landing-label">Email</label>
                  <input
                    className="landing-input"
                    type="email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your@email.com..."
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="landing-field">
                  <label className="landing-label">Password</label>
                  <input
                    className="landing-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Keep it secret..."
                    required
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <motion.p className="landing-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                    {error}
                  </motion.p>
                )}

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  Sign in
                </Button>
            </form>

            <button className="landing-forgot" onClick={openForgot}>Forgot password?</button>

            <div className="landing-social-divider"><span>or continue with</span></div>

            <div className="landing-social-buttons">
              <button
                type="button"
                className="landing-social-btn"
                onClick={handleGoogleLogin}
                disabled={!!socialLoading}
                aria-label="Sign in with Google"
              >
                {socialLoading === 'google' ? (
                  <span className="landing-social-spinner" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                <span>Google</span>
              </button>

              <button
                type="button"
                className="landing-social-btn"
                onClick={handleAppleLogin}
                disabled={!!socialLoading}
                aria-label="Sign in with Apple"
              >
                {socialLoading === 'apple' ? (
                  <span className="landing-social-spinner" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                )}
                <span>Apple</span>
              </button>

            </div>

            <p className="landing-terms">
              By signing in, you agree to our{" "}
              <a href="/terms">Terms</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </motion.div>
        )}

        {mode === "forgot" && (
          <motion.div
            key="forgot"
            className="landing-below-brand landing-form-view"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.5 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80 || info.velocity.x > 400) setMode(null);
            }}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <button className="landing-back" onClick={() => setMode("login")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              back
            </button>

            <h1 className="landing-heading">Reset password</h1>
            <p className="landing-subtitle">{resetStep === 0 ? "Enter your email to receive a reset code." : "Enter the code and your new password."}</p>

            <form className="landing-form" onSubmit={handleForgotSubmit}>
              {resetStep === 0 ? (
                <div className="landing-field">
                  <label className="landing-label">Email</label>
                  <input
                    className="landing-input"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="your@email.com..."
                    required
                    autoComplete="email"
                  />
                </div>
              ) : (
                <>
                  <div className="landing-field">
                    <label className="landing-label">Reset code</label>
                    <input
                      className="landing-input"
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="6-digit code..."
                      required
                      autoComplete="one-time-code"
                    />
                  </div>
                  <div className="landing-field">
                    <label className="landing-label">New password</label>
                    <input
                      className="landing-input"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters..."
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}

              {error && (
                <motion.p className="landing-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  {error}
                </motion.p>
              )}
              {success && (
                <motion.p className="landing-success" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  {success}
                </motion.p>
              )}

              <Button type="submit" variant="primary" size="lg" fullWidth loading={resetLoading}>
                {resetStep === 0 ? "Send reset code" : "Update password"}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="landing-footer">
        <div className="landing-footer-links">
          <span>© 2026 Kern Studio</span>
          <span className="landing-footer-dot">·</span>
          <a href="/impressum" className="landing-footer-link">Impressum</a>
        </div>
        <div className="landing-footer-social">
          <a
            href="https://www.instagram.com/kernstudio.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-footer-icon"
            aria-label="Instagram"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61590415018284"
            target="_blank"
            rel="noopener noreferrer"
            className="landing-footer-icon"
            aria-label="Facebook"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
            </svg>
          </a>
          <a href="#" className="landing-footer-icon" aria-label="App Store">
            <svg width="20" height="20" viewBox="0 0 814 1000" fill="currentColor">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.3-81.4-105.6-207.8-105.6-328.6 0-193.1 125.3-295.6 248.7-295.6 65.5 0 120.1 43.1 161.2 43.1 39.2 0 100.2-45.7 174.5-45.7 28.2 0 129.6 2.6 196.8 99.7zM554.1 159.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.9 32.4-54.4 83.7-54.4 135.5 0 7.8.6 15.7 1.3 18.2 2.6.6 6.4 1.3 10.8 1.3 45.3 0 102.5-30.4 138.2-71.4z" />
            </svg>
          </a>
          <a href="#" className="landing-footer-icon" aria-label="Google Play">
            <svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor">
              <path d="M48 59.49v393a4.33 4.33 0 0 0 7.37 3.07L260 256 55.37 56.42A4.33 4.33 0 0 0 48 59.49zM345.8 174L89.22 32.64l-.16-.09c-4.42-2.4-8.62 3.58-5 7.06L285.19 231.93zm0 164L285.19 280.07 84.07 472.39c-3.64 3.48.56 9.46 5 7.06l.16-.09zM400.32 243.16L348.59 214l-56.51 42L348.59 298l51.73-29.16a16.42 16.42 0 0 0 0-25.68z" />
            </svg>
          </a>
        </div>
      </footer>
    </main>
  );
}
