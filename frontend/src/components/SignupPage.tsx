import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Landmark,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import React, { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

interface SignupPageProps {
  onNavigateLogin: () => void;
}

export function SignupPage({ onNavigateLogin }: SignupPageProps) {
  const { signup, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const hasLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError("Please enter your official email address.");
      return;
    }
    if (!hasLength) {
      setValidationError("Password must be at least 8 characters long.");
      return;
    }
    if (!hasLetter || !hasNumber) {
      setValidationError("Password must contain both letters and numbers.");
      return;
    }
    if (password !== confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(trimmedEmail, password);
    } catch {
      // Error handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
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
          <h1 className="auth-card__title">Create Reviewer Account</h1>
          <p className="auth-card__subtitle">
            Register new credentials for the MPLADS Review & Anomaly Workbench
          </p>
        </header>

        {/* Security Framing */}
        <div className="auth-philosophy-badge">
          <ShieldCheck size={14} strokeWidth={2} />
          <span>Institutional Registration · Role: Ministry / Nodal Auditor</span>
        </div>

        {/* Error Notification */}
        {displayError ? (
          <div className="auth-error-banner" role="alert">
            <AlertCircle size={16} strokeWidth={2} />
            <span>{displayError}</span>
          </div>
        ) : null}

        {/* Signup Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="signup-email" className="form-label">
              Official Email Address
            </label>
            <div className="input-wrap">
              <Mail className="input-icon" size={16} strokeWidth={2} />
              <input
                id="signup-email"
                type="email"
                className="form-input"
                placeholder="auditor@mplads.gov.in"
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
            <label htmlFor="signup-password" className="form-label">
              Password
            </label>
            <div className="input-wrap">
              <Lock className="input-icon" size={16} strokeWidth={2} />
              <input
                id="signup-password"
                type="password"
                className="form-input"
                placeholder="Create strong password"
                autoComplete="new-password"
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

          <div className="form-group">
            <label htmlFor="signup-confirm-password" className="form-label">
              Confirm Password
            </label>
            <div className="input-wrap">
              <Lock className="input-icon" size={16} strokeWidth={2} />
              <input
                id="signup-confirm-password"
                type="password"
                className="form-input"
                placeholder="Re-enter password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          {/* Real-time Password Security Criteria */}
          <div className="password-rules-card">
            <span className="password-rules-title">Password Security Requirements:</span>
            <ul className="password-rules-list">
              <li className={hasLength ? "rule-met" : "rule-unmet"}>
                {hasLength ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                <span>At least 8 characters long</span>
              </li>
              <li className={hasLetter ? "rule-met" : "rule-unmet"}>
                {hasLetter ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                <span>Contains letters (A–Z)</span>
              </li>
              <li className={hasNumber ? "rule-met" : "rule-unmet"}>
                {hasNumber ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                <span>Contains numbers (0–9)</span>
              </li>
              {confirmPassword.length > 0 ? (
                <li className={passwordsMatch ? "rule-met" : "rule-unmet"}>
                  {passwordsMatch ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                  <span>Passwords match</span>
                </li>
              ) : null}
            </ul>
          </div>

          <button
            type="submit"
            className="button button--auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="spin" size={16} strokeWidth={2} />
                <span>Creating Officer Account…</span>
              </>
            ) : (
              <>
                <span>Complete Registration & Open Workbench</span>
                <ArrowRight size={16} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        {/* Navigation to Sign In */}
        <footer className="auth-card__footer">
          <p>
            Already have an officer account?{" "}
            <button
              type="button"
              className="auth-link-btn"
              onClick={onNavigateLogin}
            >
              Sign In Instead
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
