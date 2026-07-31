-- Optional email-code two-factor auth for admin/staff logins.
ALTER TABLE admin_users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0;

INSERT INTO email_templates (key, name, subject, body) VALUES
(
  'login_code',
  'Admin login code',
  'Your {{store.name}} login code',
  '<h1>Your login code</h1>
<p>{{#if name}}Hi {{name}},{{/if}}</p>
<p>Enter this code to finish signing in to {{store.name}}. It expires in 10 minutes and can only be used once.</p>
<p style="font-size:1.85rem;font-weight:700;letter-spacing:0.18em;margin:1.25rem 0;">{{code}}</p>
<p>If you weren''t trying to sign in, someone may have your password — change it as soon as you can.</p>'
);
