---
title: Billing
description: What Identizen Cloud bills (active devices per month, on the period's peak), the exact active-device definition, the two billing modes (by card through Stripe, or by invoice under an enterprise agreement), standard versus dedicated, the Billing page, who sees what, and why on-prem is licensed rather than metered.
---

Identizen Cloud is billed monthly per **active device**, by card through Stripe or by invoice. An active device is a phone (or other device key) on your tenant index that was used in the last 30 days. There is no per-seat or per-login charge, and no charge for members who have not enrolled a phone. On-prem installs are not metered at all; they run under a [licence](/enterprise/on-prem/) with a seat count.

## What counts as an active device

A device is active when its row on the tenant index has status `active` **and** it was used in the last 30 days, which means at least one of:

- its `last_seen_at` is inside the window (the phone drained its inbox, approved a login, or otherwise called the index);
- a session was created for the device inside the window;
- the device itself was registered inside the window.

Disabled and revoked devices never count, whatever their timestamps. Every device on the tenant index counts, managed or not: a member's personal phone that is not enrolled as a managed device is billed like an enrolled one when it signs in to your sites, and a contractor's phone on a non-workforce site counts while it is in use. This is a different count from the `devices` quota on **Status**, which counts managed devices only.

## How a period is billed

Once a day the index counts the tenant's active devices and reports the figure for that day to Identizen, which keeps one figure per tenant and day. Reporting the same day twice is a no-op and a corrected count replaces that day's figure. A period is billed on the **peak** of its daily counts, so a burst of enrolments is paid for once, not on every day it lasts, and devices that go quiet stop counting 30 days after their last use.

The plan sets the device quota the peak is measured against:

| Plan        | Device quota | What else it means                                                                                                            |
| ----------- | :----------: | ----------------------------------------------------------------------------------------------------------------------------- |
| `standard`  |    2 000     | Members 500, SSO apps 20, SCIM tokens 5, webhooks 5 ([quotas](/enterprise/compliance/#status-and-quotas))                     |
| `dedicated` |    20 000    | Members 5 000, SSO apps 100, SCIM tokens 20, webhooks 20; the tenant's own database and higher limits, chosen at provisioning |

Quotas are ceilings on what the index will create, not a price band; Identizen can raise any of them for a tenant.

## Two billing modes

Identizen chooses the mode for your account when billing is set up; the Billing page is the same in both.

| Mode      | Who                              | How it works                                                                                                                                                                                                                                                                                                             |
| --------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stripe`  | Medium and smaller organisations | A card on file with Stripe and a metered monthly subscription. Each day's count is set on the subscription; the period is the subscription's and is billed on its peak. Invoices come from Stripe, with a link to the hosted invoice page (PDF and receipt), and owners change the card on Stripe's hosted page.         |
| `invoice` | Enterprise agreements            | A billing contact instead of a card. At month end Identizen raises an invoice from the calendar month's peak and records it in its own ledger, numbered `IDZ-<YYYY>-<NNNN>`, with status `issued`, `paid` or `void` and a **View** link when a document is attached. There is no payment method to manage on the portal. |

Both modes show the same invoice list on the Billing page: number, period, the active-device peak the amount was computed from, amount and currency, status, issue and due dates, when it was paid, and a link where there is a document. Stripe's `draft` and `open` invoices appear as `issued`.

## The Billing page

**Billing** in the portal shows:

- the plan, the mode and the account status (`trialing`, `active`, `past_due`, `canceled`, or `suspended` for an invoice-mode account Identizen has paused), the billing contact, and the current billing period;
- active devices: the count right now, the period's peak (what the period will be billed on), and the plan's device quota;
- the invoices, newest first (Stripe's last 12 in `stripe` mode; the ledger in `invoice` mode);
- in `stripe` mode, **Manage payment method** for owners, which opens Stripe's hosted billing portal in a single-use session and returns you to the Billing page when you are done; in `invoice` mode, a note that invoices are issued by Identizen.

The payment method, where there is one, is entered and changed on Stripe's page only. Identizen holds no card data, only Stripe's identifiers and its own invoice ledger, and the tenant index holds nothing about billing beyond the daily count it reports.

Until Identizen has set billing up for the tenant, the page says **Billing is set up by Identizen** and asks you to contact us for the billing contact; there is nothing else to do. On-prem installs show the same notice permanently, because there is no metered account behind them.

## Who sees what

| Role                  | Billing page | Manage payment method      |
| --------------------- | :----------: | -------------------------- |
| `owner`               |     yes      | yes, in `stripe` mode only |
| `admin`               |     yes      | no                         |
| `helpdesk`, `auditor` |      no      | no                         |

Opening the payment-method page is recorded as the admin action `billing.portal_link`. Setting billing up, changes to the account, invoices raised and their status changes, and every Stripe subscription status change are audited on Identizen's side.

## Over the API

`GET /orgs/billing` and `POST /orgs/billing/portal-link`, with the response shape for both modes, are on the [Operations API](/enterprise/api/operations/#billing) reference.
