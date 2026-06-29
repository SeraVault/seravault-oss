/**
 * Verify Email Token Edge Function
 * Verifies email using token from verification link
 * Called when user clicks verification link
 */

import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
import { createSupabaseAdminClient } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return handleCorsPreflightResponse(requestOrigin);
  }

  if (req.method !== 'POST') {
    return corsErrorResponse('Method not allowed', 405, requestOrigin);
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return corsErrorResponse('Token is required', 400, requestOrigin);
    }

    console.log(`🔍 Verifying email token: ${token.substring(0, 10)}...`);

    const supabase = createSupabaseAdminClient();

    // Get token document
    const { data: tokenData, error: fetchError } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchError || !tokenData) {
      console.error('Token not found:', fetchError);
      return corsErrorResponse(
        'Invalid or expired verification token',
        404,
        requestOrigin
      );
    }

    // Check if already verified
    if (tokenData.verified) {
      return corsErrorResponse('Email already verified', 409, requestOrigin);
    }

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);
    if (now > expiresAt) {
      return corsErrorResponse(
        'Verification token has expired',
        410,
        requestOrigin
      );
    }

    // Mark token as verified
    const { error: updateTokenError } = await supabase
      .from('email_verifications')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
      })
      .eq('token', token);

    if (updateTokenError) {
      console.error('Error updating token:', updateTokenError);
      throw new Error('Failed to verify token');
    }

    // Update user's email_verified status in auth.users
    const { error: updateUserError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      {
        email_confirm: true,
      }
    );

    if (updateUserError) {
      console.error('Error updating user auth:', updateUserError);
      // Don't throw - the token is marked verified, this is a bonus update
    }

    // Update user profile in users table
    const { error: updateProfileError } = await supabase
      .from('users')
      .update({
        email_verified: true,
      })
      .eq('uid', tokenData.user_id);

    if (updateProfileError) {
      console.error('Error updating user profile:', updateProfileError);
      // Don't throw - the token is marked verified
    }

    console.log(`✅ Email verified for user ${tokenData.user_id}`);

    return corsResponse(
      {
        success: true,
        message: 'Email verified successfully',
        userId: tokenData.user_id,
      },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('[VerifyEmailToken] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to verify email';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
