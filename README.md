<p align="center">
  <img style="width: 200px;height: 200px; margin: auto;" src="https://usesend.com/logo-squircle.png" alt="useSend Logo">
</p>

<p align="center" style="margin-top: 20px">
  <p align="center">
  The Open Source sending infrastructure — <strong>moSend fork</strong>.
  <br>
    <a href="https://usesend.com"><strong>Upstream useSend »</strong></a>
    <br />
    <br />
    <a href="https://discord.gg/BU8n8pJv8S">Discord</a>
    .
    <a href="https://usesend.com">Website</a>
    ·
    <a href="https://github.com/Moshipp-Dev/moSend/issues">Issues</a>
  </p>
</p>

<p align="center">
   <a href="https://discord.gg/BU8n8pJv8S"><img src="https://img.shields.io/badge/Discord-usesend-%235865F2" alt="Join useSend on Discord"></a>
   <a href="https://github.com/usesend/usesend/stargazers"><img src="https://img.shields.io/github/stars/usesend%2Fusesend" alt="GitHub Stars"></a>
   <a href="https://github.com/usesend/usesend/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-purple" alt="License"></a>
   <a href="https://hub.docker.com/r/usesend/usesend"><img alt="Docker Automated build" src="https://img.shields.io/docker/pulls/usesend/usesend"></a>
</p>

## About this project

As most of email products out there, useSend also uses Amazon SES under the hood to send emails. We provide an open and alternative way to send emails reliably and cheaply with a great dashboard. You can also use useSend manage contacts and send bulk emails(newsletter, product updates etc). We will take care of the subscriptions.

Currently we only support emails, but we plan to expand to other sending protocols like SMS, push notification and even whatsapp.

We are currently in beta!

> **moSend fork** — This repository extends the upstream `usesend/usesend` project with additional features. See [moSend-specific changes](#mosend-specific-changes) below.

## Features

- [x] Add domains
- [x] Transactional Mails
- [x] Rest API
- [x] Dashboard (Delivered, opened, clicked, bounced)
- [x] Marketing email
- [x] SMTP support
- [x] **SMTP attachment forwarding** _(moSend)_
- [x] **Attachment filenames visible in email detail panel** _(moSend)_
- [x] Schedule API
- [x] Webhook support
- [ ] Inbound email
- [ ] BYO AWS credentials

## moSend-specific changes

This fork adds the following on top of the upstream `usesend/usesend` codebase:

### 1. SMTP attachments end-to-end

The standalone SMTP relay server (`apps/smtp-server`) previously discarded attachments received over SMTP — it only forwarded `to / from / subject / text / html / replyTo` to the useSend public API. This fork extracts attachments parsed by `mailparser`, encodes them as base64, and includes them in the payload sent to `/api/v1/emails`, so emails sent through the SMTP relay are delivered with their attachments intact.

- **File:** `apps/smtp-server/src/server.ts` — extracts `parsed.attachments` from `mailparser`, filters by `att.content instanceof Buffer` and `att.size <= 10 MB`, caps at the 10 attachment limit enforced by the public API schema, and converts each buffer with `.toString('base64')`.
- **Startup banner:** the SMTP server now advertises `usesend-smtp/1.1.0 attachment-support` on connection, so the deployed version can be verified without reading the container logs.

### 2. Attachment filenames preserved after send

The outbound email pipeline in `apps/web` previously nulled the `Email.attachments` column immediately after handing the MIME message to SES, which meant attachment information was permanently lost from the dashboard history. This fork keeps the `filename` values (without the base64 content) so the list of files that was sent with each email remains queryable.

- **File:** `apps/web/src/server/service/email-queue-service.ts` — after `sendRawEmail` succeeds, the update writes a filename-only JSON instead of `null`:
  ```ts
  const attachmentMeta =
    attachments.length > 0
      ? JSON.stringify(attachments.map((a) => ({ filename: a.filename })))
      : null;
  ```
- Storage impact is minimal: only the filenames are persisted, never the file content.

### 3. Attachment list in the dashboard email detail panel

The email detail sheet (opened when you click an email in the dashboard list) now shows an **Attachments** section listing each filename with a paperclip icon. Only appears when there is attachment metadata — older emails that predate the change and emails sent without attachments are unaffected.

- **File (query):** `apps/web/src/server/api/routers/email.ts` — `attachments: true` added to the `getEmail` select.
- **File (UI):** `apps/web/src/app/(dashboard)/emails/email-details.tsx` — renders the filename list using `Paperclip` from `lucide-react`.

### 4. Deployment notes

If you self-host the SMTP relay on a platform that does rolling updates (e.g. EasyPanel with `zeroDowntime: true`), make sure **zero-downtime is disabled for the SMTP service**. SMTP servers bind fixed TCP ports (465, 587) which cannot be held by two containers simultaneously, so a rolling update will always fail health-check and roll back to the old container. With zero-downtime off the old container stops first and the new one starts cleanly.

## Community and Next Steps 🎯

We're currently working on opening useSend for public beta.

- Check out the first source code release in this repository and test it.
- Tell us what you think in the [Discussions](https://github.com/usesend/usesend/discussions).
- Join the [Discord server](https://discord.gg/BU8n8pJv8S) for any questions and getting to know to other community members.
- ⭐ the repository to help us raise awareness.
- Spread the word on Twitter.
- Fix or create [issues](https://github.com/usesend/usesend/issues), that are needed for the first production release.

## Tech Stack

- [Next.js](https://nextjs.org/) - Framework
- [Prisma](https://www.prisma.io/) - ORM
- [Tailwind](https://tailwindcss.com/) - CSS
- [shadcn/ui](https://ui.shadcn.com/) - Component Library
- [NextAuth.js](https://next-auth.js.org/) - Authentication
- [tRPC](https://trpc.io/) - API
- [hono](https://hono.dev/) - Public API
- [Redis](https://redis.io/) - Queue

### Email editor

Check out the editor code for [here](https://github.com/usesend/usesend/tree/main/packages/email-editor). Editor is possible only because of the amazing tools and libraries.

- [jsx-email](https://jsx.email/) - converts editor content to html
- [maily.to](https://maily.to/) - useSend email editor is greatly inspired from maily.to
- [tiptap](https://tiptap.dev/) - editor core

## Local Development

Follow our detailed guide to run useSend locally

[https://docs.usesend.com/get-started/local](https://docs.usesend.com/get-started/local)

## Docker

We provide a Docker container for useSend, which is published on both DockerHub and GitHub Container Registry.

DockerHub: [https://hub.docker.com/r/usesend/usesend](https://hub.docker.com/r/usesend/usesend)

GitHub Container Registry: [https://ghcr.io/usesend/usesend](https://ghcr.io/usesend/usesend)

You can pull the Docker image from either of these registries and run it with your preferred container hosting provider.

Please note that you will need to provide environment variables for connecting to the database, redis, aws and so forth.

For detailed instructions on how to configure and run the Docker container, please refer to the Docker [Docker README](./docker/README.md) in the docker directory.

## Self Hosting

Checkout the [self-hosting guide](https://docs.usesend.com/self-hosting/overview) to learn how to run useSend on your own infrastructure.

## Self Hosting with Railway

Railway provides the quickest way to spin up useSend. Read the [Railway self-hosting guide](https://docs.usesend.com/self-hosting/railway) or deploy directly:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.com/deploy/usesend?utm_medium=integration&utm_source=docs&utm_campaign=usesend)

## Star History

<a href="https://star-history.com/#usesend/usesend&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=usesend/usesend&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=usesend/usesend&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=usesend/usesend&type=Date" />
 </picture>
</a>

## Sponsors

We are grateful for the support of our sponsors.

<a href="https://coderabbit.ai/?utm_source=useSend.com" target="_blank">
  <img src="https://usesend.com/coderabbit-wordmark.png" alt="coderabbit.ai" style="width:200px;height:100px;">
</a>

### Other Sponsors

<a href="https://doras.to/?utm_source=useSend.com" target="_blank">
  <img src="https://cdn.doras.to/doras/assets/05c5db48-cfba-49d7-82a1-5b4a3751aa40/49ca4647-65ed-412e-95c6-c475633d62af.png" alt="doras.to" style="width:60px;height:60px;">
</a>

<a href="https://github.com/anaclumos" target="_blank">
  <img src="https://avatars.githubusercontent.com/u/31657298?v=4" alt="anaclumos" style="width:60px;height:60px;">
</a>

<a href="https://github.com/miguilimzero" target="_blank">
  <img src="https://avatars.githubusercontent.com/u/35383529?v=4" alt="miguilimzero" style="width:60px;height:60px;">
</a>

<a href="https://x.com/tebayoso" target="_blank">
  <img src="https://pbs.twimg.com/profile_images/1931051879007391744/5KhqgxUp_400x400.jpg" alt="tebayoso" style="width:60px;height:60px;">
</a>
