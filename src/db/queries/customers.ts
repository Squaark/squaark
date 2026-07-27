import { query, queryOne, execute } from '../connection';

export interface CustomerRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  created_at: string;
  email_verified: number;
  verification_token: string | null;
  verification_token_expires: string | null;
  reset_token: string | null;
  reset_token_expires: string | null;
}

export function findCustomerByEmail(email: string): CustomerRow | null {
  return queryOne<CustomerRow>(
    'SELECT * FROM customers WHERE lower(email) = lower(?)',
    [email],
  );
}

export function findCustomerById(id: string): CustomerRow | null {
  return queryOne<CustomerRow>('SELECT * FROM customers WHERE id = ?', [id]);
}

export function findCustomerByVerificationToken(token: string): CustomerRow | null {
  return queryOne<CustomerRow>('SELECT * FROM customers WHERE verification_token = ?', [token]);
}

export function createCustomer(
  id: string,
  email: string,
  passwordHash: string,
  firstName: string,
  lastName: string,
  verificationToken: string,
  verificationTokenExpires: string,
): void {
  execute(
    `INSERT INTO customers (id, email, password_hash, first_name, last_name, email_verified, verification_token, verification_token_expires)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim(), verificationToken, verificationTokenExpires],
  );
}

export function deleteCustomer(id: string): void {
  execute('DELETE FROM customers WHERE id = ?', [id]);
}

export function markCustomerEmailVerified(id: string): void {
  execute(
    `UPDATE customers SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?`,
    [id],
  );
}

export function setCustomerVerificationToken(id: string, token: string, expiresAt: string): void {
  execute(
    'UPDATE customers SET verification_token = ?, verification_token_expires = ? WHERE id = ?',
    [token, expiresAt, id],
  );
}

export function setCustomerResetToken(id: string, token: string, expiresAt: string): void {
  execute(
    'UPDATE customers SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
    [token, expiresAt, id],
  );
}

export function findCustomerByResetToken(token: string): CustomerRow | null {
  return queryOne<CustomerRow>('SELECT * FROM customers WHERE reset_token = ?', [token]);
}

/**
 * Sets a new password hash and clears the reset token in one statement.
 * A successful password reset also confirms control of the email, so
 * email_verified is set too — this doubles as a verification path for a
 * customer who never clicked their original verification link.
 */
export function updateCustomerPassword(id: string, passwordHash: string): void {
  execute(
    `UPDATE customers
     SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL,
         email_verified = 1, verification_token = NULL, verification_token_expires = NULL,
         updated_at = datetime('now')
     WHERE id = ?`,
    [passwordHash, id],
  );
}
