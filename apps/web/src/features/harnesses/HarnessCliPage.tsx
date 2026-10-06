import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { Field, PageTitle } from '../../components/ui';
export function HarnessCliPage() {
  const { id } = useParams(),
    [profile, setProfile] = useState('claude-code');
  return (
    <>
      <PageTitle
        title="Use this Harness in your codebase"
        description="Authenticate through your browser, bind native files, and pull reviewed releases."
        action={
          <Link className="btn btn-secondary" to={'/harnesses/' + id + '/edit'}>
            Back to Harness
          </Link>
        }
      />
      <section className="panel p-6 max-w-3xl">
        <p>
          Install SkillSync CLI from npm as @skillsync/cli, then use the short command sks in your
          codebase.
        </p>
        <Field label="Runtime profile">
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="claude-code">Claude Code</option>
            <option value="gemini-cli">Gemini CLI</option>
            <option value="copilot-vscode">Copilot VS Code</option>
            <option value="copilot-cli">Copilot CLI</option>
            <option value="copilot-cloud">Copilot cloud</option>
          </select>
        </Field>
        <p>Install a published release:</p>
        <pre className="overflow-auto p-4 my-4">
          <code>
            {'npm install --save-dev @skillsync/cli\nnpx sks setup --server ' +
              (import.meta.env.DEV
                ? window.location.protocol + '//' + window.location.hostname + ':4000'
                : window.location.origin) +
              '\nnpx sks add ' +
              id +
              ' --profile ' +
              profile +
              ' --dry-run\nnpx sks add ' +
              id +
              ' --profile ' +
              profile +
              ' --yes\nnpx sks pull --version <version> --dry-run\nnpx sks pull --version <version> --yes'}
          </code>
        </pre>
        <p>
          Owners and editors can upload existing local files with add --link-only, then push. Use
          pull --draft for working files. Pulls preserve local-only edits; conflicts stop writes.
          Existing unrelated GitHub files are preserved.
        </p>
        <h2 className="text-lg font-semibold mt-6">Git bridge</h2>
        <p>
          Harness ID: <code>{id}</code>. Native files from a committed Git tree become a change
          proposal. Export writes a new branch from an exact Harness release without changing your
          checkout.
        </p>
        <pre className="overflow-auto p-4 my-4">
          <code>
            {
              'npx sks git import --ref HEAD --dry-run\nnpx sks git import --ref HEAD --yes\nnpx sks git export --version <version> --branch skillsync/release --dry-run\nnpx sks git export --version <version> --branch skillsync/release --yes'
            }
          </code>
        </pre>
        <p>
          Use --allow-delete only after reviewing removals. Merge proposals in{' '}
          <Link to={'/harnesses/' + id + '/changes'}>Changes & access</Link>; publishing remains a
          separate review.
        </p>
        <p className="mt-4">
          MCP, hooks, and permissions affect native runtime behavior. Review the dry-run and
          configuration contents before applying.{' '}
          <Link to="/devices">Manage connected devices</Link>.
        </p>
      </section>
    </>
  );
}
