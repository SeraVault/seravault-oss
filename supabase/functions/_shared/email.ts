/**
 * Email service for Supabase Edge Functions
 * Uses Resend for email delivery
 */

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

/**
 * Send email using Resend
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY environment variable not set');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: options.from || 'SeraVault <noreply@seravault.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.replyTo,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
}

/**
 * Send email with template
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  subject: string,
  variables: Record<string, string>
): Promise<void> {
  // Load template from file system
  const templatePath = `../templates/${templateName}.html`;

  try {
    let template = await Deno.readTextFile(templatePath);

    // Replace variables in template
    for (const [key, value] of Object.entries(variables)) {
      template = template.replaceAll(`{{${key}}}`, value);
    }

    await sendEmail({
      to,
      subject,
      html: template,
    });
  } catch (error) {
    console.error(`Failed to load email template: ${templateName}`, error);
    throw new Error(`Email template not found: ${templateName}`);
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format storage size for emails
 */
export function formatStorageSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);

  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }

  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}
