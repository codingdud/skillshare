import {
  inspectHarnessTree,
  readFrontmatter,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryPage,
  type HarnessDiscoveryQuery,
  type HarnessTreeFile,
} from '@skillshare/contracts';

export type DiscoverySnapshot = {
  id: string;
  name: string;
  description: string;
  visibility: HarnessDiscoveryItem['visibility'];
  ownerName: string;
  ownerId: string;
  releaseId: string;
  version: string;
  files: HarnessTreeFile[];
  updatedAt: string | Date;
};

/** Discovery derives identities from an authorized, immutable repository snapshot. */
export function discoverSnapshots(
  snapshots: DiscoverySnapshot[],
  query: HarnessDiscoveryQuery,
): HarnessDiscoveryPage {
  const candidates: { item: HarnessDiscoveryItem; text: string }[] = [];
  const availableRuntimes = new Set<string>();
  for (const snapshot of snapshots) {
    const components = inspectHarnessTree(snapshot.files).components;
    const runtimes = [...new Set(components.map((component) => component.runtime))].sort();
    runtimes.forEach((runtime) => availableRuntimes.add(runtime));
    const common = {
      harnessId: snapshot.id,
      harnessName: snapshot.name,
      releaseId: snapshot.releaseId,
      version: snapshot.version,
      ownerName: snapshot.ownerName,
      ownerId: snapshot.ownerId,
      visibility: snapshot.visibility,
      updatedAt: new Date(snapshot.updatedAt).toISOString(),
      fileCount: snapshot.files.length,
    };
    const nativeItems = components.map((component) => {
      const source = snapshot.files.find((file) => file.path === component.path)?.content ?? '';
      let metadata: Record<string, unknown> = {};
      if (component.kind === 'skill' || component.kind === 'agent') {
        try {
          metadata = readFrontmatter(source);
        } catch {
          // Imported plain Markdown remains discoverable through its native path.
        }
      }
      const item: HarnessDiscoveryItem = {
        ...common,
        id: JSON.stringify([snapshot.id, component.kind, component.path, component.name]),
        type: component.kind,
        path: component.path,
        name: typeof metadata.name === 'string' ? metadata.name : component.name,
        summary: typeof metadata.description === 'string' ? metadata.description : component.detail,
        runtimes: [component.runtime],
        components: [],
      };
      return { item, text: source };
    });
    const item: HarnessDiscoveryItem = {
      ...common,
      id: snapshot.id,
      type: 'harness',
      name: snapshot.name,
      summary: snapshot.description,
      path: null,
      runtimes,
      components: nativeItems.map(({ item }) => ({
        type: item.type,
        name: item.name,
        path: item.path!,
      })),
    };
    // All groups by Harness; type-specific searches open the matching native file.
    if (query.type === 'all' || query.type === 'harness')
      candidates.push({
        item,
        text: snapshot.files.map((file) => file.path + '\n' + file.content).join('\n'),
      });
    else candidates.push(...nativeItems.filter(({ item }) => item.type === query.type));
  }
  const words = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked = candidates.flatMap(({ item, text }) => {
    if (query.runtime && !item.runtimes.includes(query.runtime)) return [];
    const title = item.name.toLowerCase();
    const meta = [item.summary, item.harnessName, item.path ?? '', ...item.runtimes]
      .join(' ')
      .toLowerCase();
    const body = text.toLowerCase();
    if (!words.every((word) => title.includes(word) || meta.includes(word) || body.includes(word)))
      return [];
    const score = words.reduce(
      (sum, word) => sum + (title.includes(word) ? 40 : meta.includes(word) ? 10 : 1),
      title === query.q.toLowerCase() && words.length ? 100 : 0,
    );
    return [{ item, score }];
  });
  ranked.sort(
    (a, b) =>
      (query.sort === 'relevant' ? b.score - a.score : 0) ||
      b.item.updatedAt.localeCompare(a.item.updatedAt) ||
      a.item.id.localeCompare(b.item.id),
  );
  const total = ranked.length;
  const pageSize = 20;
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
  return {
    items: ranked.slice((page - 1) * pageSize, page * pageSize).map(({ item }) => item),
    total,
    page,
    pageSize,
    runtimes: [...availableRuntimes].sort(),
  };
}
