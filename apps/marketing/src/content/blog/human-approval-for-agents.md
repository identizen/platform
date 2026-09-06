---
title: Human approval for agents
description: Agents act with your credentials and nobody can prove you agreed to any specific action. The fix is not a new protocol. It is a phone, a piece of text, and a signature.
date: 2026-09-06
author: George Rios
---

Give an agent access to your systems and you have given it your authority. It can move money, deploy code, and grant roles with the same rights you have, and when something goes wrong there is no record that says whether you approved it. The approval button, if there is one, lives in the same chat window the agent controls.

Every agent framework has noticed this. Most answer it with a confirmation prompt. That prompt is the problem.

## Why a prompt in the chat is not consent

An agent can be prompt-injected. It reads a web page, an email, a document, and somewhere in that text is an instruction it should not follow. If the approval step is a message in the agent's own conversation, the injected instruction can shape what you see, and the agent can press its own button. The person is in the loop only in the sense that they are watching.

Consent has to happen somewhere the agent cannot reach, about text the agent did not write, and it has to leave a record the agent cannot forge.

## Identizen already has the primitive

The approval step we built for wire transfers is exactly that. A site's server composes a short piece of text describing what it is about to do. The index pushes it to the person's phone. The phone shows it. The person approves with their fingerprint or face, and the phone signs an assertion whose hash covers that text. The server verifies the result before it acts.

Point that at an agent and the pieces line up:

1. The agent calls a tool: purchase five hundred units from a vendor.
2. Your application's policy says purchases over a threshold need a human.
3. Your server composes the text from the order it is about to place, not from anything the agent said.
4. The person's phone shows it. They approve or they do not.
5. Your server acts on the signed result, and only on that.

In code it is one call at the boundary:

```ts
const v = await idz.verify({
  sub: agent.owner.idzSub,
  reason: `Let ${agent.name} buy ${order.qty} units from ${order.vendor} for ${money(order.total)}?`,
});
const done = await idz.waitForVerification(v.verification_id);
if (done.status !== 'approved') return { ok: false };
return vendor.placeOrder(order);
```

There is no agent SDK here and no new protocol. It is the same Verification API that approves a bank wire.

## Four rules that make it hold

**The agent never writes the prompt.** The server composes the text from the action it will execute. An injected agent can ask for one thing, but the person approves what the server will do.

**Approval happens off the agent's screen.** The request goes to a phone the agent cannot see, and there is no button the agent can press for the person.

**There is a record.** The assertion names the site, the person, the action text, and the moment. The index verifies both signatures and writes an audit event, and the webhook that reports the result is signed with the index's published key.

**You set the boundary, not the agent.** Decide which actions need a human: amounts, destinations, roles, deletions. Everything under the line runs. Everything over it waits for a phone.

## What comes next, and what does not

Approving every action is not sustainable for an agent that does fifty things an hour. The next step is scoped standing grants: a person signs, once, that this agent may take this class of action up to this limit until this time, the agent gets its own key under the person's identity, and each action carries the grant. That is on the roadmap and will be specified in the protocol before it ships. We would rather say so than pretend it exists.

What does not come next is Identizen becoming an agent platform. It is an identity system that agents can use. The value is precisely that it is the same phone, the same key, and the same signature that already guards a person's bank transfer.

The tool-boundary pattern, the flow, and the rules are on the [agent authorization page](https://identizen.com/agent-authorization/), and the API is in the [Verification API reference](https://docs.identizen.com/reference/verification-api/).
