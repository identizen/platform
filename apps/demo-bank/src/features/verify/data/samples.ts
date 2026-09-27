/**
 * Two messages to try on /verify. The first is a real alert registered on the Fromenance demo
 * tenant at send time, addressed to the demo recipient. The second is a lure that copies it: the
 * code was never issued (it still passes the checksum, so the extractor picks it up), the link
 * moved to a look-alike domain, and the call to action was rewritten the way lures are.
 */

export const DEMO_VERIFY_CODE = 'KX73-PQ9G';
export const DEMO_RECIPIENT = 'jane.doe@example.com';
export const LURE_CODE = 'QF29-TH40';

export const REGISTERED_ALERT = `JT Merlin Bank

We noticed a card transaction

Hi Jane,

A purchase of $412.90 at ACME ELECTRONICS was made with your JT Merlin Bank Visa ending in 4471 on September 24 at 10:42 AM.

If this was you, no action is needed. If you do not recognize this transaction, review it in the app or call the number on the back of your card.

Review this transaction: https://www.jtmerlin.com/app/alerts/tx/98812?utm=email

Thank you,
JT Merlin Bank Fraud Team

Not sure this email is from JT Merlin Bank? Forward it to verify@jtmerlin.com or enter code ${DEMO_VERIFY_CODE} at jtmerlin.com/verify. Reference: ${DEMO_VERIFY_CODE}

JT Merlin Bank, Member FDIC. 1 Merlin Plaza, Wilmington, DE 19801. Privacy: https://www.jtmerlin.com/privacy`;

export const LURE = `JT Merlin Bank

Urgent: your card has been temporarily restricted

Hi Jane,

A purchase of $412.90 at ACME ELECTRONICS was attempted with your JT Merlin Bank Visa ending in 4471 on September 24 at 10:42 AM and has been placed on hold.

To avoid permanent suspension of your card, confirm your identity within 24 hours.

Confirm your identity now: https://jtmerlin-secure.com/login?ref=8812

Thank you,
JT Merlin Bank Fraud Team

Not sure this email is from JT Merlin Bank? Forward it to verify@jtmerlin.com or enter code ${LURE_CODE} at jtmerlin.com/verify. Reference: ${LURE_CODE}

JT Merlin Bank, Member FDIC. 1 Merlin Plaza, Wilmington, DE 19801.`;
