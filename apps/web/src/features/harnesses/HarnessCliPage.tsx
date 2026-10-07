import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { Field, PageTitle } from '../../components/ui';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';
const inlineCode = 'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground';

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-sm leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}

export function HarnessCliPage() {
  const { id } = useParams(),
    [profile, setProfile] = useState('claude-code');
  const server = import.meta.env.DEV
    ? window.location.protocol + '//' + window.location.hostname + ':4000'
    : window.location.origin;
  return (
    <>
      <PageTitle
        title="Use this Harness in your codebase"
        description="Authenticate through your browser, bind native files, and pull reviewed releases."
        action={
          <Link
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-10 px-4')}
            to={'/harnesses/' + id + '/edit'}
          >
            Back to Harness
          </Link>
        }
      />
      <div className="grid max-w-3xl gap-6">
        <Card data-testid="cli-install">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              <h2>Install</h2>
            </CardTitle>
            <CardDescription>
              Install SkillSync CLI from npm as <code className={inlineCode}>@skillsync/cli</code>,
              then use the short command <code className={inlineCode}>sks</code> in your codebase.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Runtime profile">
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="h-10 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="claude-code">Claude Code</option>
                <option value="gemini-cli">Gemini CLI</option>
                <option value="copilot-vscode">Copilot VS Code</option>
                <option value="copilot-cli">Copilot CLI</option>
                <option value="copilot-cloud">Copilot cloud</option>
              </select>
            </Field>
            <p className="text-sm text-muted-foreground">Install a published release:</p>
            <CodeBlock>
              {'npm install --save-dev @skillsync/cli\nnpx sks setup --server ' +
                server +
                '\nnpx sks add ' +
                id +
                ' --profile ' +
                profile +
                ' --dry-run\nnpx sks add ' +
                id +
                ' --profile ' +
                profile +
                ' --yes\nnpx sks pull --version <version> --dry-run\nnpx sks pull --version <version> --yes'}
            </CodeBlock>
            <p className="text-sm text-muted-foreground">
              Owners and editors can upload existing local files with add --link-only, then push.
              Use pull --draft for working files. Pulls preserve local-only edits; conflicts stop
              writes. Existing unrelated GitHub files are preserved.
            </p>
          </CardContent>
        </Card>
        <Card data-testid="cli-git-bridge">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              <h2>Git bridge</h2>
            </CardTitle>
            <CardDescription>
              Harness ID: <code className={inlineCode}>{id}</code>. Native files from a committed
              Git tree become a change proposal. Export writes a new branch from an exact Harness
              release without changing your checkout.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CodeBlock>
              {
                'npx sks git import --ref HEAD --dry-run\nnpx sks git import --ref HEAD --yes\nnpx sks git export --version <version> --branch skillsync/release --dry-run\nnpx sks git export --version <version> --branch skillsync/release --yes'
              }
            </CodeBlock>
            <p className="text-sm text-muted-foreground">
              Use --allow-delete only after reviewing removals. Merge proposals in{' '}
              <Link className={linkClass} to={'/harnesses/' + id + '/changes'}>
                Changes & access
              </Link>
              ; publishing remains a separate review.
            </p>
            <p className="text-sm text-muted-foreground">
              MCP, hooks, and permissions affect native runtime behavior. Review the dry-run and
              configuration contents before applying.{' '}
              <Link className={linkClass} to="/devices">
                Manage connected devices
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
