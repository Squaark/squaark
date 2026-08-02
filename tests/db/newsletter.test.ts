import { describe, it, expect } from 'vitest';
import {
  addSubscriber, unsubscribeEmail, listSubscribedEmails, countSubscribers, listSubscribers,
  createBroadcast, markBroadcastSending, completeBroadcast, findBroadcastById,
} from '../../src/db/queries/newsletter';

describe('newsletter subscribers', () => {
  it('adds a subscriber, normalising the email, and dedupes case-insensitively', () => {
    expect(addSubscriber('  Alice@Example.com ')).toBe('added');
    expect(addSubscriber('alice@example.com')).toBe('already');
    const emails = listSubscribedEmails();
    expect(emails).toContain('alice@example.com');
    expect(emails.filter((e) => e === 'alice@example.com')).toHaveLength(1);
  });

  it('unsubscribes and then re-subscribes the same email', () => {
    addSubscriber('bob@example.com');
    unsubscribeEmail('bob@example.com');
    expect(listSubscribedEmails()).not.toContain('bob@example.com');
    expect(countSubscribers('unsubscribed')).toBeGreaterThanOrEqual(1);

    expect(addSubscriber('BOB@example.com')).toBe('resubscribed');
    expect(listSubscribedEmails()).toContain('bob@example.com');
    const row = listSubscribers().find((s) => s.email === 'bob@example.com');
    expect(row?.status).toBe('subscribed');
    expect(row?.unsubscribed_at).toBeNull();
  });

  it('excludes unsubscribed emails from the send list', () => {
    addSubscriber('carol@example.com');
    unsubscribeEmail('carol@example.com');
    expect(listSubscribedEmails()).not.toContain('carol@example.com');
  });
});

describe('newsletter broadcasts', () => {
  it('records status transitions and final counts', () => {
    const id = createBroadcast('Hello', '<p>Hi</p>', 3);
    expect(findBroadcastById(id)?.status).toBe('draft');

    markBroadcastSending(id);
    expect(findBroadcastById(id)?.status).toBe('sending');

    completeBroadcast(id, 3, 0);
    const done = findBroadcastById(id)!;
    expect(done.status).toBe('sent');
    expect(done.sent_count).toBe(3);
    expect(done.sent_at).not.toBeNull();
  });

  it('marks a broadcast failed when every send fails', () => {
    const id = createBroadcast('Oops', '<p>x</p>', 2);
    completeBroadcast(id, 0, 2);
    expect(findBroadcastById(id)?.status).toBe('failed');
  });
});
