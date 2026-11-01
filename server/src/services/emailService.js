import nodemailer from "nodemailer";
import AppError from "../utils/AppError.js";

export async function sendPasswordResetEmail(email, otp) {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !from || Boolean(user) !== Boolean(password))
    throw new AppError(
      "Password reset email is not configured. Set the SMTP server values.",
      503,
      "PASSWORD_RESET_EMAIL_NOT_CONFIGURED",
    );

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    ...(user ? { auth: { user, pass: password } } : {}),
  });

  await transport.sendMail({
    from,
    to: email,
    subject: "Your Divine Vikas password reset code",
    text: [
      "DIVINE VIKAS",
      "",
      "Reset your password",
      "",
      `Your password reset code is ${otp}.`,
      "",
      "Enter this code on the password reset page. It expires in 10 minutes.",
      "If you did not request this code, you can ignore this email.",
      "",
      "Divine Vikas",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Your Divine Vikas password reset code</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f5f3ed;font-family:Arial,Helvetica,sans-serif;color:#252923">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Your password reset code expires in 10 minutes.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f3ed">
      <tr>
        <td align="center" style="padding:40px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e8e5dc;border-radius:12px">
            <tr>
              <td style="padding:32px 36px 24px;border-bottom:1px solid #eeece6">
                <p style="margin:0;color:#58664d;font-size:13px;font-weight:bold;letter-spacing:2px">DIVINE VIKAS</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 36px">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#252923">Reset your password</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#555a52">Use the code below to continue. It is valid for 10 minutes.</p>
                <div style="padding:18px 16px;background-color:#f5f3ed;border-radius:8px;text-align:center">
                  <p style="margin:0;color:#252923;font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p>
                </div>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#555a52">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px;border-top:1px solid #eeece6">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#777b73">This is an automated account security message from Divine Vikas. Please do not reply to this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  });
}