// ============================================================================
// notify-prayer-request — Supabase Edge Function (Deno)
// ============================================================================
//
// Sends the church an email when a new prayer request is inserted.
//
// INVOKED BY a Supabase Database Webhook on INSERT into public.prayer_requests,
// NOT by the browser. That matters:
//   • it fires even if the visitor closes the tab the instant they submit;
//   • a malicious client cannot suppress it by skipping a second call;
//   • the anon key never needs permission to invoke functions or send mail.
//
// SECRETS (set with `supabase secrets set NAME=value`):
//   RESEND_API_KEY        — from resend.com
//   NOTIFY_WEBHOOK_SECRET — any long random string; must match the
//                           x-webhook-secret header configured on the webhook
//   NOTIFY_FROM_EMAIL     — verified sender, e.g. "noreply@hillsofglory.org"
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy:
//   supabase functions deploy notify-prayer-request --no-verify-jwt
//
// --no-verify-jwt is required: the webhook is not an authenticated user. The
// shared secret below is what actually authenticates the caller, so the
// function is NOT open to the internet.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

interface PrayerRequest {
  id: string;
  visitor_name: string | null;
  request_text: string | null;
  date_submitted: string | null;
  notified_at: string | null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // --- 1. Authenticate the caller ---------------------------------------
  // Without this the function is a public endpoint that emails the church on
  // demand — a spam relay. Compare against the secret configured on the
  // webhook.
  const expectedSecret = Deno.env.get('NOTIFY_WEBHOOK_SECRET');
  if (!expectedSecret) {
    console.error('NOTIFY_WEBHOOK_SECRET is not set; refusing to run.');
    return json({ error: 'Server misconfigured' }, 500);
  }
  if (req.headers.get('x-webhook-secret') !== expectedSecret) {
    console.warn('Rejected call with a bad or missing x-webhook-secret.');
    return json({ error: 'Unauthorized' }, 401);
  }

  // --- 2. Read the inserted row ----------------------------------------
  // Supabase webhooks post { type, table, record, old_record, schema }.
  let record: PrayerRequest | undefined;
  try {
    const payload = await req.json();
    record = payload?.record;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!record?.id) {
    return json({ error: 'No record in payload' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // --- 3. Should we send at all? ---------------------------------------
  const { data: settings, error: settingsError } = await supabase
    .from('notification_settings')
    .select('prayer_notify_enabled, prayer_notify_email')
    .eq('id', SINGLETON_ID)
    .maybeSingle();

  if (settingsError) {
    console.error('Could not read notification_settings:', settingsError.message);
    return json({ error: 'Settings unavailable' }, 500);
  }
  if (!settings?.prayer_notify_enabled) {
    return json({ skipped: 'notifications disabled' });
  }
  const recipient = (settings.prayer_notify_email ?? '').trim();
  if (!recipient) {
    console.warn('Notifications enabled but no recipient configured.');
    return json({ skipped: 'no recipient configured' });
  }

  // --- 4. Idempotency ---------------------------------------------------
  // Re-read the row rather than trusting the payload: a replayed webhook
  // carries the ORIGINAL record, whose notified_at was null at insert time.
  const { data: current, error: readError } = await supabase
    .from('prayer_requests')
    .select('id, visitor_name, request_text, date_submitted, notified_at')
    .eq('id', record.id)
    .maybeSingle();

  if (readError) {
    console.error('Could not re-read request:', readError.message);
    return json({ error: 'Lookup failed' }, 500);
  }
  if (!current) {
    return json({ skipped: 'request no longer exists' });
  }
  if (current.notified_at) {
    return json({ skipped: 'already notified' });
  }

  // --- 5. Send ----------------------------------------------------------
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFY_FROM_EMAIL');
  if (!apiKey || !from) {
    console.error('RESEND_API_KEY or NOTIFY_FROM_EMAIL is not set.');
    return json({ error: 'Mailer not configured' }, 500);
  }

  const name = current.visitor_name || 'Someone';
  const submitted = current.date_submitted
    ? new Date(current.date_submitted).toUTCString()
    : 'just now';

  // The body is visitor-supplied text going into an HTML email — escape it.
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.6;color:#1C1917;">
      <h2 style="margin:0 0 4px;font-size:18px;">New prayer request</h2>
      <p style="margin:0 0 16px;color:#78716C;font-size:13px;">${escapeHtml(submitted)}</p>
      <p style="margin:0 0 4px;"><strong>From:</strong> ${escapeHtml(name)}</p>
      <div style="margin-top:12px;padding:14px 16px;background:#F5EDE2;border-left:3px solid #2D5A03;border-radius:6px;white-space:pre-wrap;">${escapeHtml(current.request_text)}</div>
      <p style="margin-top:20px;font-size:12px;color:#78716C;">
        Sent automatically by the Hills of Glory website. Manage notifications in the admin dashboard.
      </p>
    </div>
  `;

  const text = `New prayer request\n${submitted}\n\nFrom: ${name}\n\n${current.request_text ?? ''}\n`;

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: `Prayer request from ${name}`,
      html,
      text,
      reply_to: from,
    }),
  });

  if (!send.ok) {
    const detail = await send.text();
    console.error('Resend rejected the message:', send.status, detail);
    // 5xx tells the webhook this failed, so notified_at stays null and the
    // request can be retried or picked up by the backfill query in the README.
    return json({ error: 'Send failed', status: send.status }, 502);
  }

  // --- 6. Stamp it ------------------------------------------------------
  const { error: stampError } = await supabase
    .from('prayer_requests')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', current.id)
    .is('notified_at', null);

  if (stampError) {
    // The email went out; only the bookkeeping failed. Log loudly — a later
    // retry would send a duplicate.
    console.error('Email sent but notified_at not stamped:', stampError.message);
  }

  return json({ sent: true, id: current.id });
});
