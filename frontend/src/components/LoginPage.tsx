import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Landmark,
  LoaderCircle,
  Lock,
  Mail,
  Shield,
  Sparkles,
} from "lucide-react";
import React, { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

interface LoginPageProps {
  onNavigateSignup: () => void;
}

export function LoginPage({ onNavigateSignup }: LoginPageProps) {
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError("Please enter your official email address.");
      return;
    }
    if (!password) {
      setValidationError("Please enter your account password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmedEmail, password);
    } catch {
      // Error handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillDemoCredentials = () => {
    setEmail("reviewer@mplads.gov.in");
    setPassword("Reviewer@1234");
    setValidationError(null);
    clearError();
  };

  const displayError = validationError || error;

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Institutional Government Header */}
        <header className="auth-card__header">
          <div className="auth-card__emblem" aria-hidden="true">
            <Landmark size={24} strokeWidth={2} />
          </div>
          <span className="auth-card__dept">
            MINISTRY OF STATISTICS & PROGRAMME IMPLEMENTATION
          </span>
          <h1 className="auth-card__title">MPLADS Review Workbench</h1>
          <p className="auth-card__subtitle">
            Institutional Audit Decision-Support & Anomaly Investigation System
          </p>
        </header>

        {/* Core Philosophy Tag */}
        <div className="auth-philosophy-badge">
          <Shield size={14} strokeWidth={2} />
          <span>Restricted Government Audit Access · Authorized Personnel Only</span>
        </div>

        {/* Error Notification */}
        {displayError ? (
          <div className="auth-error-banner" role="alert">
            <AlertCircle size={16} strokeWidth={2} />
            <span>{displayError}</span>
          </div>
        ) : null}

        {/* Login Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">
              Official Email Address
            </label>
            <div className="input-wrap">
              <Mail className="input-icon" size={16} strokeWidth={2} />
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="officer@mplads.gov.in"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="login-password" className="form-label">
                Password
              </label>
            </div>
            <div className="input-wrap">
              <Lock className="input-icon" size={16} strokeWidth={2} />
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="button button--auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="spin" size={16} strokeWidth={2} />
                <span>Authenticating Officer…</span>
              </>
            ) : (
              <>
                <span>Sign In to Audit Workbench</span>
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Fill Button */}
        <div className="auth-demo-assist">
          <button
            type="button"
            className="demo-fill-btn"
            onClick={handleFillDemoCredentials}
          >
            <Sparkles size={14} strokeWidth={2} />
            <span>Fill Demo Officer (<code>reviewer@mplads.gov.in</code>)</span>
          </button>
        </div>

        {/* Navigation to Sign Up */}
        <footer className="auth-card__footer">
          <p>
            Need a new reviewer account?{" "}
            <button
              type="button"
              className="auth-link-btn"
              onClick={onNavigateSignup}
            >
              Create Official Account
            </button>
          </p>
        </footer>
      </div>

      <div className="auth-page__footer">
        <p>© 2026 Ministry of Statistics and Programme Implementation (MoSPI) · SIH 2026</p>
      </div>
    </div>
  );
}
