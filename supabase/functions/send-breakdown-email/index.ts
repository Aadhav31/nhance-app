// Supabase Edge Function — send-breakdown-email
// Sends Gmail SMTP alerts to every contact in the breakdown notify_chain.
// Env vars required (set in Supabase Dashboard → Edge Functions → Secrets):
//   GMAIL_USER         — sender Gmail address  e.g. alerts@yourcompany.com
//   GMAIL_APP_PASSWORD — 16-char Google App Password (not your login password)

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Contact {
  level: number;
  role: string;
  name: string;
  phone?: string;
  email?: string;
}

interface BreakdownPayload {
  equipmentName: string;
  breakdownCause?: string;
  reportedAt?: string;
  companyName?: string;
  chain: Contact[];          // full notify_chain from breakdown_alerts
  alertId?: string;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: BreakdownPayload = await req.json();
    const { equipmentName, breakdownCause, reportedAt, companyName, chain } = payload;

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPass) {
      console.error("Email not configured — set GMAIL_USER and GMAIL_APP_PASSWORD in Supabase secrets");
      return new Response(
        JSON.stringify({ error: "Email not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter to contacts who have an email address
    const recipients = (chain || []).filter((c) => c.email && c.email.includes("@"));

    if (!recipients.length) {
      return new Response(
        JSON.stringify({ message: "No email recipients in notify chain — add email addresses to project contacts" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reportedTime = reportedAt
      ? new Date(reportedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const subject = `🚨 BREAKDOWN — ${equipmentName}${companyName ? ` | ${companyName}` : ""}`;

    // Build escalation chain summary for the email body
    const chainSummary = (chain || [])
      .map((c) => `  Level ${c.level} — ${c.role}: ${c.name}${c.phone ? ` (${c.phone})` : ""}`)
      .join("\n");

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto;">

    <!-- Header -->
    <div style="background: #dc2626; border-radius: 12px 12px 0 0; padding: 20px 24px;">
      <h1 style="margin: 0; color: white; font-size: 20px; letter-spacing: 1px;">🚨 BREAKDOWN ALERT</h1>
      <p style="margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">${companyName || "Nhance"} · Immediate Action Required</p>
    </div>

    <!-- Body -->
    <div style="background: #1e293b; border-radius: 0 0 12px 12px; padding: 24px;">

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px; width: 140px;">Equipment</td>
          <td style="padding: 8px 0; color: #f1f5f9; font-size: 14px; font-weight: bold;">${equipmentName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Reported at</td>
          <td style="padding: 8px 0; color: #f1f5f9; font-size: 14px;">${reportedTime} IST</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px; vertical-align: top;">Cause</td>
          <td style="padding: 8px 0; color: #fca5a5; font-size: 14px;">${breakdownCause || "Not specified"}</td>
        </tr>
      </table>

      <div style="background: #dc262620; border: 1px solid #dc262650; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px; color: #fca5a5; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Escalation Chain</p>
        ${(chain || []).map((c) => `
          <div style="display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #ffffff10;">
            <span style="background: #dc2626; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; flex-shrink: 0;">${c.level}</span>
            <span style="color: #94a3b8; font-size: 12px; width: 130px;">${c.role}</span>
            <span style="color: #e2e8f0; font-size: 13px; font-weight: 500;">${c.name}${c.phone ? ` · ${c.phone}` : ""}</span>
          </div>
        `).join("")}
      </div>

      <p style="color: #64748b; font-size: 12px; margin: 0;">
        This is an automated alert from <strong style="color: #94a3b8;">Nhance</strong>.
        Open the app dashboard to acknowledge and track this breakdown.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const textBody = `
BREAKDOWN ALERT — ${equipmentName}
${"=".repeat(50)}

Equipment : ${equipmentName}
Reported  : ${reportedTime} IST
Cause     : ${breakdownCause || "Not specified"}
Company   : ${companyName || "—"}

ESCALATION CHAIN:
${chainSummary || "  (No contacts configured)"}

Please acknowledge this alert on the Nhance dashboard immediately.
    `.trim();

    // Connect to Gmail SMTP
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailPass,
        },
      },
    });

    const results: { email: string; status: "sent" | "failed"; error?: string }[] = [];

    for (const recipient of recipients) {
      try {
        await client.send({
          from: `Nhance Alerts <${gmailUser}>`,
          to: `${recipient.name} <${recipient.email}>`,
          subject,
          html: htmlBody,
          content: textBody,
        });
        results.push({ email: recipient.email!, status: "sent" });
        console.log(`Email sent to ${recipient.email}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ email: recipient.email!, status: "failed", error: msg });
        console.error(`Failed to send to ${recipient.email}:`, msg);
      }
    }

    await client.close();

    const sentCount = results.filter((r) => r.status === "sent").length;
    console.log(`Breakdown email: ${sentCount}/${results.length} sent for ${equipmentName}`);

    return new Response(
      JSON.stringify({ sent: sentCount, total: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-breakdown-email error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
