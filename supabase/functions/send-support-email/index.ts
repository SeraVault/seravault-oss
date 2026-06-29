/**
 * Send Support Email Edge Function
 * Sends support request from authenticated subscribed users
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(requestOrigin);
  }

  if (req.method !== 'POST') {
    return corsErrorResponse('Method not allowed', 405, requestOrigin);
  }

  try {
    const user = await getAuthenticatedUser(req);
    const { subject, message, userName } = await req.json();

    if (!subject || !message) {
      return corsErrorResponse(
        'Subject and message are required',
        400,
        requestOrigin
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);


    const { data: userRecord } = await supabase
      .from('users')
      .select('display_name, email')
      .eq('uid', user.id)
      .maybeSingle();

    const displayName =
      userName || userRecord?.display_name || user.email || 'User';
    const email = userRecord?.email || user.email || 'no-email@seravault.com';

    // Email to admin
    const adminHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1976d2; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .user-info { background: white; padding: 15px; margin: 20px 0; border-left: 4px solid #1976d2; }
          .message-content { background: white; padding: 20px; margin: 20px 0; border: 1px solid #ddd; border-radius: 4px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🔐 SeraVault Support Request</h2>
          </div>
          <div class="content">
            <div class="user-info">
              <h3>User Information</h3>
              <p><strong>Name:</strong> ${displayName}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>User ID:</strong> ${user.id}</p>
            </div>

            <div class="message-content">
              <h3>Subject: ${subject}</h3>
              <p>${message.replace(/\n/g, '<br>')}</p>
            </div>

            <div class="footer">
              <p>Reply directly to: ${email}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: 'admin@seravault.com',
      subject: `[SeraVault Support] ${subject}`,
      html: adminHtml,
      replyTo: email,
    });

    // Confirmation to user
    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .message { background: white; padding: 20px; margin: 20px 0; border-radius: 4px; }
          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>✅ Support Request Received</h2>
          </div>
          <div class="content">
            <div class="message">
              <p>Hi ${displayName},</p>
              <p>Thank you for contacting SeraVault support.</p>
              <p><strong>Subject:</strong> ${subject}</p>
              <p>We'll respond within 24-48 hours at: <strong>${email}</strong></p>
            </div>
            <div class="footer">
              <p>© 2025 SeraVault</p>
              <p><a href="https://www.seravault.com">www.seravault.com</a></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: email,
      subject: 'SeraVault Support - We received your message',
      html: confirmationHtml,
    });

    console.log(`✅ Support email sent from ${email} (${user.id})`);

    return corsResponse(
      {
        success: true,
        message: 'Support email sent successfully',
      },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('[SendSupportEmail] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to send support email';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
