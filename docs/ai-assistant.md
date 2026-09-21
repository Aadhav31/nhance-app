# Ask Nhance

Ask Nhance is a company-scoped assistant available to signed-in admin, manager, accounts and supervisor users with the Core module enabled. Team Chat remains separate.

## Capabilities

- Guide a user through the current module and link to permitted pages.
- Search equipment, projects, clients, invoices, job cards, daily logs and hire contracts where the user's role and enabled modules allow access.
- Verify invoice fields, line arithmetic, balances and billing evidence, and calculate a hire usage estimate from the same calculation routine as Usage Billing. These checks are advisory; they do not certify tax or legal compliance.
- Prepare letters, emails, reports, checklists and plans as private drafts. The user can review, copy, download or explicitly save the draft. Saving does not send or file it.
- Link invoice results to the exact invoice and usage billing checks to the selected deployment and month.

The assistant cannot send messages, approve requests, issue invoices or mutate business records. Those actions remain in their respective modules and existing permission flows. Only the user's question, recent conversation messages and records returned by permitted tools are sent to the AI provider; responses are requested with `store: false`. Conversations and drafts are stored in the app's Supabase database under user and company row policies.

## Deployment

1. Apply `supabase/migrations/20260921153342_contextual_ai_assistant.sql` (already applied to the connected production project).
2. Set `OPENAI_API_KEY` as a server-side Vercel environment variable in Production and Preview; never use a `VITE_` prefix. Redeploy after adding it.
3. Optionally set `OPENAI_MODEL` (default `gpt-5.6-sol`). Ensure the API account has access to the selected model and billing enabled.

Until the key is configured, the assistant panel explains that administrator setup is needed. The rest of Nhance continues to work. Each user is limited to 40 messages per hour. The assistant's API verifies the session, company, role and module for every request; it uses a user JWT rather than a database service key.

## Verification

Run `node --test tests/assistantTools.test.js`, targeted ESLint and `npm run build`. Test the authenticated UI using a real permitted account after the API key is configured; mock responses do not prove live model behavior.
