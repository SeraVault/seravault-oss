/**
 * Send Sales Inquiry Edge Function
 * Public endpoint for enterprise sales inquiries
 */

import {
  corsResponse,
  corsErrorResponse,
  handleCorsPreflightResponse,
} from '../_shared/cors.ts';
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
    const { name, email, company, message } = await req.json();

    // Validation
    if (!name || !email || !message) {
      return corsErrorResponse(
        'Name, email, and message are required',
        400,
        requestOrigin
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return corsErrorResponse('Invalid email address', 400, requestOrigin);
    }

    const subject = `New Enterprise Sales Inquiry from ${name}`;
    const html = `
      <h2>New Sales Inquiry</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Company:</strong> ${company || 'Not provided'}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `;

    await sendEmail({
      to: 'sales@seravault.com',
      subject,
      html,
      replyTo: email,
    });

    console.log(`✅ Sales inquiry sent from ${email}`);

    return corsResponse(
      { success: true, message: 'Inquiry sent successfully' },
      200,
      requestOrigin
    );
  } catch (error) {
    console.error('[SendSalesInquiry] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to send inquiry';
    return corsErrorResponse(errorMessage, 500, requestOrigin);
  }
});
