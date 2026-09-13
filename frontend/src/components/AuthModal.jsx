import { useState } from "react";
import { authApi } from "../services/api";

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isSignup, setIsSignup] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let result;
      if (isSignup) {
        if (!fullName.trim()) {
          throw new Error("Please enter your full name.");
        }
        result = await authApi.signup(fullName.trim(), email.trim(), password);
      } else {
        result = await authApi.login(email.trim(), password);
      }

      if (result?.success && result?.data?.user) {
        onAuthSuccess(result.data.user);
        onClose();
      } else {
        throw new Error(result?.message || "Authentication failed.");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="auth-header">
          <div className="auth-emblem">🚆</div>
          <h2>{isSignup ? "Create Railway Account" : "Sign In to Railway Portal"}</h2>
          <p>
            {isSignup
              ? "Access live train tracking, set destination arrival alarms & save journeys"
              : "Welcome back! Enter your details to track trains & manage alarms"}
          </p>
        </div>

        {error && (
          <div className="auth-error-banner">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {isSignup && (
            <div className="auth-field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required={isSignup}
              />
            </div>
          )}

          <div className="auth-field">
            <label>Email Address</label>
            <input
              type="email"
              placeholder="e.g. passenger@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? "Please wait..." : isSignup ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="auth-footer-toggle">
          {isSignup ? (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                className="toggle-link"
                onClick={() => {
                  setIsSignup(false);
                  setError(null);
                }}
              >
                Sign In
              </button>
            </p>
          ) : (
            <p>
              Don't have an account yet?{" "}
              <button
                type="button"
                className="toggle-link"
                onClick={() => {
                  setIsSignup(true);
                  setError(null);
                }}
              >
                Create Account
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
