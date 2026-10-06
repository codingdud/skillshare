import { readConfiguration, objectValue, type ConfigObject } from './native-config.js';
import { harnessId, type HarnessId } from './harnesses.js';
import { inspectNativePackage, type NativePackage } from './native.js';
import type { AssetKind } from './asset-modules.js';
export type NativeContribution = { releaseId: string; kind: AssetKind; package: NativePackage };
export type CompositionConflict = {
  file: string;
  pointer: string;
  message: string;
  releases: string[];
};
export type CompositionResolution = { file: string; pointer: string; releaseId: string };
export type ComposedPackage = {
  files: { path: string; content: string }[];
  folders: string[];
  conflicts: CompositionConflict[];
  diagnostics: string[];
  provenance: { releaseId: string; kind: AssetKind; entrypoint: string }[];
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const equivalent = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => equivalent(v, b[i]));
  if (objectValue(a) && objectValue(b))
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((k) => k in b && equivalent(a[k], b[k]))
    );
  return false;
};
const pointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
export function composeNativePackages(
  profile: HarnessId,
  parts: NativeContribution[],
  resolutions: CompositionResolution[] = [],
): ComposedPackage {
  const files = new Map<
    string,
    { path: string; content: string; releaseId: string; config?: ConfigObject }
  >();
  const owners = new Map<string, string[]>(),
    conflicts: CompositionConflict[] = [],
    diagnostics: string[] = [];
  const folders = new Set<string>();
  const choice = new Map(
    resolutions.map((r) => [r.file.toLowerCase() + '#' + r.pointer, r.releaseId]),
  );
  const provenance: ComposedPackage['provenance'] = [];
  for (const part of parts) {
    const pkg = part.package;
    if (harnessId(pkg.platform) !== profile) {
      diagnostics.push('Release ' + part.releaseId + ' targets a different harness.');
      continue;
    }
    const issues = inspectNativePackage(pkg, part.kind).filter((i) => i.severity === 'error');
    if (issues.length) {
      diagnostics.push(...issues.map((i) => i.path + ': ' + i.message));
      continue;
    }
    provenance.push({ releaseId: part.releaseId, kind: part.kind, entrypoint: pkg.entrypoint });
    for (const dir of pkg.folders ?? []) folders.add(dir);
    for (const f of pkg.files) {
      const key = f.path.toLowerCase(),
        previous = files.get(key);
      const config =
        ['mcp', 'hook', 'settings'].includes(part.kind) && f.path === pkg.entrypoint
          ? readConfiguration(f.content)
          : undefined;
      if (!previous) {
        files.set(key, {
          ...f,
          releaseId: part.releaseId,
          config: config ? clone(config) : undefined,
        });
        if (config)
          for (const section of Object.keys(config)) {
            if (section === 'mcpServers' || section === 'servers') {
              for (const server of Object.keys(config[section] as ConfigObject))
                owners.set(key + '#/' + section + '/' + pointer(server), [part.releaseId]);
            } else owners.set(key + '#/' + pointer(section), [part.releaseId]);
          }
        continue;
      }
      if (!config || !previous.config) {
        conflicts.push({
          file: f.path,
          pointer: '',
          message:
            'Two assets contain this file. Rename it in a draft or remove a release from this export.',
          releases: [previous.releaseId, part.releaseId],
        });
        continue;
      }
      const assign = (
        section: string,
        value: unknown,
        p: string,
        target: ConfigObject,
        name: string,
      ) => {
        const ownKey = key + '#' + p,
          origin = owners.get(ownKey) ?? [previous.releaseId];
        if (!(name in target)) {
          target[name] = clone(value);
          owners.set(ownKey, [part.releaseId]);
          return;
        }
        if (equivalent(target[name], value)) {
          owners.set(ownKey, [...origin, part.releaseId]);
          return;
        }
        const selected = choice.get(ownKey);
        if (selected === part.releaseId) {
          target[name] = clone(value);
          owners.set(ownKey, [part.releaseId]);
          return;
        }
        if (selected && origin.includes(selected)) return;
        if (
          selected &&
          parts.some((candidate) => {
            if (
              candidate.releaseId !== selected ||
              !['mcp', 'hook', 'settings'].includes(candidate.kind)
            )
              return false;
            const entry = candidate.package.files.find(
              (file) =>
                file.path.toLowerCase() === key && file.path === candidate.package.entrypoint,
            );
            if (!entry) return false;
            try {
              let v: unknown = readConfiguration(entry.content);
              for (const segment of p
                .slice(1)
                .split('/')
                .map((k) => k.replaceAll('~1', '/').replaceAll('~0', '~'))) {
                if (!objectValue(v) || !(segment in v)) return false;
                v = v[segment];
              }
              return true;
            } catch {
              return false;
            }
          })
        )
          return;
        conflicts.push({
          file: f.path,
          pointer: p,
          message: 'Different values for ' + section + '. Choose a release to keep.',
          releases: [...origin, part.releaseId],
        });
      };
      for (const [section, value] of Object.entries(config)) {
        if ((section === 'mcpServers' || section === 'servers') && objectValue(value)) {
          if (!objectValue(previous.config[section])) previous.config[section] = {};
          for (const [server, definition] of Object.entries(value))
            assign(
              server,
              definition,
              '/' + section + '/' + pointer(server),
              previous.config[section] as ConfigObject,
              server,
            );
        } else if (section === 'hooks' && objectValue(value)) {
          if (!objectValue(previous.config.hooks)) previous.config.hooks = {};
          const hooks = previous.config.hooks as ConfigObject;
          for (const [event, groups] of Object.entries(value)) {
            if (!Array.isArray(groups)) throw new Error('Invalid hook contribution.');
            const current = hooks[event];
            hooks[event] = [...(Array.isArray(current) ? current : []), ...clone(groups)];
          }
        } else assign(section, value, '/' + pointer(section), previous.config, section);
      }
      previous.content = JSON.stringify(previous.config, null, 2) + '\n';
    }
  }
  for (const [key, f] of files)
    if (
      [...files.keys()].some(
        (other) => other !== key && (other.startsWith(key + '/') || key.startsWith(other + '/')),
      ) ||
      [...folders].some((d) => d.toLowerCase() === key || d.toLowerCase().startsWith(key + '/'))
    )
      conflicts.push({
        file: f.path,
        pointer: '',
        message: 'A file conflicts with a directory.',
        releases: [f.releaseId],
      });
  return {
    files: [...files.values()].map(({ path, content }) => ({ path, content })),
    folders: [...folders].sort(),
    conflicts,
    diagnostics,
    provenance,
  };
}
