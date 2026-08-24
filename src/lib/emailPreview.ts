/**
 * Admin-side preview renderer for outbound Vestara emails.
 *
 * This mirrors the real server-side shell that every email is rendered with
 * (`supabase/functions/_shared/email-templates/email-shell.tsx`) so what an
 * admin sees before sending a bulk mail matches what the recipient receives.
 * Presentation only — it never sends anything.
 */

export const EMAIL_BRAND = {
  navy: "#0B2C5F",
  green: "#6CC24A",
  gold: "#F5B921",
  ink: "#132239",
  body: "#4a5568",
  muted: "#98a7bd",
  border: "#e3e9f2",
  surface: "#f6f9fc",
  page: "#eef3f9",
};

export const EMAIL_APP_URL = "https://vestara.ng";
export const EMAIL_LOGO_URL =
  "https://vestara.ng/__l5e/assets-v1/0a3456da-5bb0-466e-8e36-0d625b8dfc63/vestara-logo-email.png";
export const EMAIL_COMPANY_ADDRESS = "Vestara Technologies, Lagos, Nigeria";
export const EMAIL_SUPPORT = "support@vestara.ng";

const SOCIALS = [
  { label: "X", href: "https://x.com/vestara_ng" },
  { label: "IG", href: "https://instagram.com/vestara.ng" },
  { label: "in", href: "https://www.linkedin.com/company/vestara" },
  { label: "FB", href: "https://facebook.com/vestara.ng" },
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Same emphasis rule the server template uses: bold money, refs and codes. */
const MONEY_OR_REF =
  /(NGN\s?[\d,]+(?:\.\d{2})?|₦\s?[\d,]+(?:\.\d{2})?|vestara-[a-z0-9-]+|[A-Z]{3,}-[A-Z0-9]{4,})/g;

const emphasise = (line: string) =>
  escapeHtml(line).replace(MONEY_OR_REF, "<strong>$1</strong>");

export interface EmailPreviewOptions {
  title: string;
  message: string;
  greetingName?: string;
  actionUrl?: string;
  actionLabel?: string;
  signOff?: string;
  securityNotice?: boolean;
  showAppBadges?: boolean;
  unsubscribeUrl?: string;
}

/**
 * Renders the same structure as the live email shell: logo header, greeting,
 * scannable body paragraphs, single CTA, sign-off, security notice and footer.
 * Table-based markup only, so it renders the same in Outlook and older clients.
 */
export function buildEmailPreviewHtml({
  title,
  message,
  greetingName = "John",
  actionUrl,
  actionLabel,
  signOff = "Thank you for banking with Vestara.",
  securityNotice = true,
  showAppBadges = false,
  unsubscribeUrl,
}: EmailPreviewOptions): string {
  const paragraphs = (message || "Your message here...")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${EMAIL_BRAND.body};">${block
          .split("\n")
          .map(emphasise)
          .join("<br/>")}</p>`
    )
    .join("");

  const cta =
    actionUrl && actionLabel
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 6px;">
           <tr><td align="center" bgcolor="${EMAIL_BRAND.navy}" style="border-radius:10px;">
             <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(actionLabel)}</a>
           </td></tr>
         </table>`
      : "";

  const security = securityNotice
    ? `<tr><td style="background-color:#fdf7e8;border-top:1px solid ${EMAIL_BRAND.border};padding:20px 28px;">
         <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:bold;color:#8a6a12;">Your security matters</p>
         <p style="margin:0;font-size:13px;line-height:1.65;color:#6b5a2a;">Vestara will <strong>never</strong> ask for your PIN, password, OTP or BVN by phone call, email, SMS or social media. If anyone asks, it is a scam — end the conversation and report it to <a href="mailto:${EMAIL_SUPPORT}" style="color:#8a6a12;">${EMAIL_SUPPORT}</a>.</p>
       </td></tr>`
    : "";

  const badges = showAppBadges
    ? `<tr><td align="center" style="padding:4px 0 2px;">
         <a href="${EMAIL_APP_URL}/download" style="display:inline-block;margin:0 6px;padding:9px 14px;border:1px solid #2c5088;border-radius:8px;color:#ffffff;font-size:11px;text-decoration:none;">Get it on Google Play</a>
         <a href="${EMAIL_APP_URL}/download" style="display:inline-block;margin:0 6px;padding:9px 14px;border:1px solid #2c5088;border-radius:8px;color:#ffffff;font-size:11px;text-decoration:none;">Download on the App Store</a>
       </td></tr>`
    : "";

  const socials = SOCIALS.map(
    (s) =>
      `<td align="center" style="padding:0 6px;"><a href="${s.href}" style="display:inline-block;width:28px;height:28px;line-height:28px;border-radius:14px;background-color:#123straight;color:#ffffff;font-size:11px;font-weight:bold;text-decoration:none;">${s.label}</a></td>`
  )
    .join("")
    .replace(/#123straight/g, "#123a6b");

  const unsubscribe = unsubscribeUrl
    ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:${EMAIL_BRAND.green};text-decoration:none;">Unsubscribe</a>&nbsp; |&nbsp; `
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:24px 0;background-color:${EMAIL_BRAND.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid ${EMAIL_BRAND.border};border-radius:14px;overflow:hidden;">

  <tr><td style="padding:20px 24px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
      <td width="56" valign="middle"><img src="${EMAIL_LOGO_URL}" alt="Vestara" width="48" height="48" style="display:block;border-radius:24px;" /></td>
      <td valign="middle">
        <div style="font-size:20px;font-weight:bold;color:${EMAIL_BRAND.navy};line-height:1.1;">Vestara</div>
        <div style="font-size:10px;font-weight:bold;color:${EMAIL_BRAND.green};margin-top:2px;">Grow Your Money Smarter</div>
      </td>
      <td valign="middle" align="right"><a href="${EMAIL_APP_URL}/support" style="font-size:12px;font-weight:bold;color:${EMAIL_BRAND.navy};text-decoration:none;">Help Centre</a></td>
    </tr></table>
  </td></tr>

  <tr><td style="height:5px;line-height:5px;font-size:1px;background-color:${EMAIL_BRAND.navy};background:linear-gradient(90deg,${EMAIL_BRAND.green} 0%,${EMAIL_BRAND.navy} 60%,${EMAIL_BRAND.gold} 100%);">&nbsp;</td></tr>

  <tr><td style="padding:28px 28px 32px;">
    <p style="margin:0 0 14px;font-size:15px;font-weight:bold;color:${EMAIL_BRAND.ink};">Hello ${escapeHtml(greetingName)},</p>
    <h1 style="margin:0 0 16px;font-size:21px;font-weight:bold;color:${EMAIL_BRAND.ink};">${escapeHtml(title || "Subject line")}</h1>
    ${paragraphs}
    ${cta}
    ${signOff ? `<p style="margin:22px 0 4px;font-size:15px;line-height:1.7;color:${EMAIL_BRAND.body};">${escapeHtml(signOff)}</p><p style="margin:0;font-size:15px;font-weight:bold;color:${EMAIL_BRAND.navy};">— The Vestara Team</p>` : ""}
  </td></tr>

  ${security}

  <tr><td style="background-color:${EMAIL_BRAND.navy};padding:28px 26px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
      <td width="50%" valign="top" style="padding-right:16px;">
        <div style="font-size:18px;font-weight:bold;color:#ffffff;">Vestara</div>
        <div style="font-size:10px;font-weight:bold;color:${EMAIL_BRAND.green};margin:2px 0 12px;">Grow Your Money Smarter</div>
        <div style="font-size:12px;line-height:1.6;color:#c3d0e2;">Making everyday payments, savings and group finance simple, secure and convenient.</div>
        <div style="font-size:11px;line-height:1.6;color:#8ea3c2;margin-top:12px;">${EMAIL_COMPANY_ADDRESS}</div>
      </td>
      <td width="50%" valign="top">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:${EMAIL_BRAND.green};margin-bottom:10px;">Quick Links</div>
        <div style="margin-bottom:8px;"><a href="${EMAIL_APP_URL}/wallet" style="color:#ffffff;font-size:13px;text-decoration:none;">Pay a Bill</a></div>
        <div style="margin-bottom:8px;"><a href="${EMAIL_APP_URL}/wallet" style="color:#ffffff;font-size:13px;text-decoration:none;">Airtime &amp; Data</a></div>
        <div style="margin-bottom:8px;"><a href="${EMAIL_APP_URL}/splitpay" style="color:#ffffff;font-size:13px;text-decoration:none;">Split Bill</a></div>
        <div style="margin-bottom:8px;"><a href="${EMAIL_APP_URL}/support" style="color:#ffffff;font-size:13px;text-decoration:none;">Help Centre</a></div>
      </td>
    </tr></table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
      <tr><td align="center"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>${socials}</tr></table></td></tr>
      ${badges}
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #1c4076;margin-top:20px;">
      <tr><td align="center" style="padding:16px 0 22px;">
        <div style="font-size:11px;color:#93a6c2;line-height:1.7;">Secure&nbsp; •&nbsp; Fast&nbsp; •&nbsp; Reliable</div>
        <div style="font-size:11px;color:#93a6c2;line-height:1.7;">© ${new Date().getFullYear()} Vestara. All rights reserved.</div>
        <div style="font-size:11px;color:#93a6c2;line-height:1.7;">You're receiving this email because you have a Vestara account.</div>
        <div style="font-size:11px;color:#93a6c2;line-height:1.7;">${unsubscribe}<a href="${EMAIL_APP_URL}/privacy-policy" style="color:${EMAIL_BRAND.green};text-decoration:none;">Privacy Policy</a>&nbsp; |&nbsp; <a href="${EMAIL_APP_URL}/terms" style="color:${EMAIL_BRAND.green};text-decoration:none;">Terms &amp; Conditions</a></div>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** Default copy the bulk "Group Join Reminder" template sends. */
export const GROUP_REMINDER_PREVIEW = {
  title: "Your savings group is waiting for you!",
  message:
    "You signed up for Vestara but haven't joined a savings group yet.\n\nSave together with trusted members, receive your lump-sum payout when it's your turn, and build your Vestara credit score with every on-time contribution. Joining is completely free.\n\nIt only takes a minute to create or join a group.",
  actionUrl: `${EMAIL_APP_URL}/groups`,
  actionLabel: "View groups",
};
