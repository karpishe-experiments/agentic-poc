import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const scriptPath = path.join(root, 'scripts/deploy/aws-deployment.sh');
const files = fs.readdirSync(path.join(root, 'infra/terraform'), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.includes('.tfstate') && !entry.name.endsWith('.tfplan'))
  .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .filter((name) => !name.includes('/.terraform/'))
  .sort();
files.push('infra/config/deployment.env.example');
const lines = ['# BEGIN EMBEDDED_TERRAFORM', 'materialize_embedded_terraform() {', '  local workspace manifest', '  STANDALONE=true', '  command -v base64 >/dev/null || die "Required command is unavailable: base64"', '  command -v sha256sum >/dev/null || die "Required command is unavailable: sha256sum"', '  workspace="$(mktemp -d)"; chmod 700 "$workspace"; TEMP_WORKSPACE="$workspace"', '  manifest="$workspace/manifest.sha256"; : > "$manifest"; chmod 600 "$manifest"'];
for (const name of files) {
  const bytes = fs.readFileSync(path.join(root, name));
  const encoded = bytes.toString('base64');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  lines.push(`  mkdir -p "$workspace/${path.posix.dirname(name)}"`);
  lines.push(`  printf '%s' '${encoded}' | base64 -d > "$workspace/${name}"`);
  lines.push(`  chmod 600 "$workspace/${name}"`);
  lines.push(`  printf '%s  %s\\n' '${hash}' '${name}' >> "$manifest"`);
}
lines.push('  (cd "$workspace" && sha256sum -c manifest.sha256 >/dev/null) || die "Embedded Terraform checksum verification failed"', '  DEPLOY_ROOT="$workspace"', '  DEPLOY_CONFIG="$workspace/infra/config/deployment.env"', '  cp "$workspace/infra/config/deployment.env.example" "$DEPLOY_CONFIG"', '  chmod 600 "$DEPLOY_CONFIG"', '}', '# END EMBEDDED_TERRAFORM');
let source = fs.readFileSync(scriptPath, 'utf8');
const block = lines.join('\n');
if (source.includes('# BEGIN EMBEDDED_TERRAFORM')) source = source.replace(/# BEGIN EMBEDDED_TERRAFORM[\s\S]*?# END EMBEDDED_TERRAFORM/, block);
else source = source.replace('umask 077', `umask 077\n\nTEMP_WORKSPACE=''\ncleanup() { [[ -z "$TEMP_WORKSPACE" ]] || rm -rf -- "$TEMP_WORKSPACE"; }\ntrap cleanup EXIT\n\n${block}`);
if (process.argv.includes('--check')) {
  const actual = fs.readFileSync(scriptPath, 'utf8');
  if (actual !== source) { console.error('Embedded Terraform bundle is out of sync.'); process.exit(1); }
} else fs.writeFileSync(scriptPath, source);

