import { readFile, writeFile } from 'node:fs/promises';
const fixes = [
  [
    'apps/web/src/components/Layout.tsx',
    '<X size={16}/></button>}</div>;',
    '<X size={16}/></button></div>}</div>;',
  ],
  [
    'apps/web/src/features/workspace/WorkspacePage.tsx',
    'Explore the library</Link>}/>}</>;}',
    'Explore the library</Link>}/>}</div>}</>;}',
  ],
];
for (const [file, before, after] of fixes) {
  const content = await readFile(file, 'utf8');
  if (content.includes(before)) await writeFile(file, content.replace(before, after));
}
