import { useTranslation } from "react-i18next";

interface AuthVerificationNoticeProps {
  email: string;
  resent: boolean;
  isResending: boolean;
  onResend: () => void;
}

export function AuthVerificationNotice({
  email,
  resent,
  isResending,
  onResend,
}: AuthVerificationNoticeProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      style={{
        marginTop: 12,
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--surface-2)",
      }}
    >
      <b>{t("auth.checkEmailTitle")}</b>
      <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.5 }}>
        {resent
          ? t("auth.verificationResent", { email })
          : t("auth.verificationSent", { email })}
      </p>
      <p style={{ ...noticeMutedStyle, margin: "0 0 10px" }}>
        {t("auth.checkSpam")}
      </p>
      <button
        type="button"
        disabled={isResending}
        onClick={onResend}
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "7px 11px",
          background: "var(--surface)",
          color: "inherit",
          fontWeight: 600,
        }}
      >
        {isResending ? t("auth.resending") : t("auth.resend")}
      </button>
    </div>
  );
}

const noticeMutedStyle = {
  color: "var(--muted)",
  fontSize: 12,
} as const;
