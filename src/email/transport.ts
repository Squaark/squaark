import { getAllSettings } from '../db/queries/admin';
import type { EmailSettings, EmailTransport } from './types';
import { consoleTransport } from './transports/console';
import { createSmtpTransport } from './transports/smtp';
import { createResendTransport } from './transports/resend';
import { createDirectTransport } from './transports/direct';

export function getEmailSettings(): EmailSettings {
  const s = getAllSettings();
  return {
    provider: s.email_provider || 'console',
    fromName: s.email_from_name || s.store_name || 'Store',
    fromAddress: s.email_from_address || s.store_email || '',
    smtpHost: s.smtp_host || '',
    smtpPort: parseInt(s.smtp_port || '587', 10),
    smtpUser: s.smtp_user || '',
    smtpPass: s.smtp_pass || '',
    smtpSecure: s.smtp_secure === '1',
    resendApiKey: s.resend_api_key || '',
  };
}

export function getActiveTransport(settings: EmailSettings = getEmailSettings()): EmailTransport {
  switch (settings.provider) {
    case 'smtp':
      return createSmtpTransport(settings);
    case 'resend':
      return createResendTransport(settings);
    case 'direct':
      return createDirectTransport(settings);
    default:
      return consoleTransport;
  }
}
