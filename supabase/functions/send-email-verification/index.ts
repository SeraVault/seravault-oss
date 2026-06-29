/**
 * Send Email Verification Edge Function
 * Sends custom email verification link to user
 * Called from frontend after user signup
 */

import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
import { getAuthenticatedUser, createSupabaseAdminClient } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email.ts';
import { crypto } from 'jsr:@std/crypto@1.0.3';

/**
 * Generate a secure random token
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
    const { userId, email, displayName, language = 'en' } = await req.json();

    // Verify user can only send verification for their own account
    if (user.id !== userId) {
      return corsErrorResponse(
        'Can only send verification for own account',
        403,
        requestOrigin
      );
    }

    console.log(`📧 Sending verification email to ${email} (${language})`);

    const supabase = createSupabaseAdminClient();

    // Generate verification token (24 hour expiry)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token in database
    const { error: insertError } = await supabase
      .from('email_verifications')
      .insert({
        token,
        user_id: userId,
        email,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        verified: false,
      });

    if (insertError) {
      console.error('Error storing verification token:', insertError);
      throw new Error('Failed to create verification token');
    }

    // Generate verification link
    const appUrl = Deno.env.get('APP_URL') || 'https://app.seravault.com';
    const verificationLink = `${appUrl}/verify-email?token=${token}`;

    // Determine email subject based on language
    const subjects: Record<string, string> = {
      es: 'Verifica tu correo electrónico - SeraVault',
      fr: 'Vérifiez votre e-mail - SeraVault',
      de: 'Verifizieren Sie Ihre E-Mail - SeraVault',
      en: 'Verify Your Email - SeraVault',
    };
    const subject = subjects[language] || subjects.en;

    // Create email HTML
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to SeraVault!</h2>
        <p>Hello ${displayName || email},</p>
        <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}"
             style="background-color: #4F46E5; color: white; padding: 12px 24px;
                    text-decoration: none; border-radius: 6px; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationLink}</p>
        <p>This link will expire in 24 hours.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          If you didn't create a SeraVault account, you can safely ignore this email.
        </p>
      </div>
    `;

    // Send email
    await sendEmail({
      to: email,
      subject,
      html,
    });

    console.log(`✅ Verification email sent to ${email}`);

    return corsResponse(
      {
        success: true,
        message: 'Verification email sent',
      },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('[SendEmailVerification] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to send verification email';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
