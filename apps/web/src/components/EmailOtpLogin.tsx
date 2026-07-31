import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

interface EmailOtpLoginProps {
  email: string;
  otp: string;
  codeSent: boolean;
  isSubmitting: boolean;
  onEmailChange: (email: string) => void;
  onOtpChange: (otp: string) => void;
  onRequestCode: () => void | Promise<void>;
  onSignIn: () => void | Promise<void>;
  onBack: () => void;
}

export function EmailOtpLogin({
  email,
  otp,
  codeSent,
  isSubmitting,
  onEmailChange,
  onOtpChange,
  onRequestCode,
  onSignIn,
  onBack,
}: EmailOtpLoginProps) {
  const { t } = useTranslation();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (codeSent) {
      void onSignIn();
    } else {
      void onRequestCode();
    }
  }

  return (
    <>
      <p style={{ marginTop: -6, marginBottom: 6, fontWeight: 700 }}>
        {t("auth.emailOtpPrompt")}
      </p>
      <p style={{ ...styles.muted, marginTop: 0, marginBottom: 14 }}>
        {codeSent
          ? t("auth.emailOtpSent", { email })
          : t("auth.emailOtpDescription")}
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        {codeSent ? null : (
          <input
            style={styles.input}
            aria-label={t("auth.email")}
            placeholder={t("auth.email")}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        )}
        {codeSent ? (
          <input
            style={styles.otpInput}
            aria-label={t("auth.emailOtpCode")}
            placeholder={t("auth.emailOtpCode")}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(event) =>
              onOtpChange(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        ) : null}
        <button
          style={styles.primary}
          type="submit"
          disabled={isSubmitting || (codeSent && otp.length !== 6)}
        >
          {isSubmitting
            ? t("auth.processing")
            : codeSent
              ? t("auth.emailOtpSignIn")
              : t("auth.emailOtpRequest")}
        </button>
      </form>
      {codeSent ? (
        <button
          type="button"
          style={{ ...styles.ghost, width: "100%", marginTop: 8 }}
          disabled={isSubmitting}
          onClick={() => void onRequestCode()}
        >
          {t("auth.emailOtpResend")}
        </button>
      ) : null}
      <button
        type="button"
        style={{ ...styles.ghost, width: "100%", marginTop: 8 }}
        disabled={isSubmitting}
        onClick={onBack}
      >
        {t("auth.emailOtpBack")}
      </button>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  muted: { color: "var(--muted)", fontSize: 12, lineHeight: 1.6 },
  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "inherit",
    fontSize: 14,
  },
  otpInput: {
    padding: "12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "inherit",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "0.18em",
    textAlign: "center",
  },
  primary: {
    border: 0,
    borderRadius: 10,
    padding: "9px 16px",
    background: "linear-gradient(135deg,var(--accent),var(--accent-ink))",
    color: "#fff",
    fontWeight: 700,
    boxShadow: "0 4px 14px var(--accent-weak)",
  },
  ghost: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "9px 14px",
    background: "var(--surface)",
    color: "inherit",
  },
};
