import fs from 'node:fs';
const scriptPath = 'scripts/deploy/aws-deployment.sh';
const runbookPath = 'docs/deployment/runbook.md';
const script = fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
const inputs = `# AWS deployment runbook

## 1. Required inputs

- Expected 12-digit AWS account ID.
- AWS region \`eu-west-1\`.
- GitHub repository in \`owner/name\` form and its immutable repository ID.
- AWS administrator credentials in CloudShell and GitHub repository-administrator access.
- MongoDB Atlas administrator access for the retained NAT EIP allowlist.
- OpenAI key, environment-scoped MongoDB URI, and Basic-auth password when storing secrets.

## 2. Complete CloudShell script

Paste this complete script into a mode-\`700\` file in AWS CloudShell. It embeds the reviewed Terraform setup resources and does not require a repository checkout.

\`\`\`bash
`;
const suffix = `
\`\`\`

## 3. Preview and apply examples

Preview the full one-time setup from CloudShell:

\`\`\`bash
./aws-deployment.sh --action setup --account-id 123456789012 --region eu-west-1 \\
  --repository karpishe-experiments/agentic-poc --repository-id 1304721239
\`\`\`

Apply only after reviewing the preview and Terraform plan:

\`\`\`bash
./aws-deployment.sh --action setup --account-id 123456789012 --region eu-west-1 \\
  --repository karpishe-experiments/agentic-poc --repository-id 1304721239 --apply
\`\`\`

After Atlas access is configured and the configuration PR is merged:

\`\`\`bash
./aws-deployment.sh --action finalize --account-id 123456789012 --region eu-west-1 \\
  --repository karpishe-experiments/agentic-poc --repository-id 1304721239 --apply
\`\`\`

## 4. Expected results and recovery notes

Preview performs discovery and Terraform planning and reports \`exists\`, \`would create\`, or \`would update\`. Apply creates or updates compatible resources, verifies sanitized state, and reports \`created\` or \`updated\`. Setup advances through one reviewed checkpoint at a time: bootstrap, shared, staging, production, and GitHub configuration. Run preview and then apply for each checkpoint. This preserves the exact checksum-bound reviewed plan between invocations. Services remain at desired count zero until a release workflow deploys an immutable image digest.

Setup is additive. It does not delete resources or roll back automatically. It stops on account or region mismatch, incompatible OIDC configuration, destructive Terraform changes, retained NAT EIP replacement, or ambiguous ownership. Temporary Terraform files use mode \`600\` and are removed on exit. Setup checkpoints and Terraform state remain in AWS.

If setup stops, rerun preview with the same arguments. Reviewed plans are stored with mode \`600\` under \`~/.kids-booklet-deployment/<account>/<project>/plans\`; apply rejects a changed script, plan, or plan JSON. Inspect the reported checkpoint and drift before using \`--apply\`. Never remove the S3 operation lock manually. For failed GitHub operations, verify that the workflow and maintenance task stopped, then use **Maintenance -> Resume**. Explicit backup, restore, application rollback, and guarded staging reset remain GitHub maintenance operations; database restore is never automatic.

Before first staging activation, allow the retained NAT EIP in Atlas, use separate database users, migrate and verify local staging assets, prove transaction support and S3 access, and rehearse backup and restore. Local validation does not prove AWS, Atlas, CloudFront, or OIDC behavior.
`;
const expected = inputs + script + suffix;
if (process.argv.includes('--check')) {
  const actual = fs.readFileSync(runbookPath, 'utf8').replace(/\r\n/g, '\n');
  if (actual !== expected) { console.error('Deployment runbook script is out of sync.'); process.exit(1); }
} else fs.writeFileSync(runbookPath, expected);

