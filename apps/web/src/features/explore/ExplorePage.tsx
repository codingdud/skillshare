import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowRight,
  FolderGit2,
} from 'lucide-react';
import { assetModules, harnessDiscoveryKinds } from '@skillshare/contracts';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { fetchDiscovery, setQuery } from './exploreSlice';
import { HarnessResult } from '../harnesses/HarnessResult';
import { ErrorBox, Loading, Empty, Button } from '../../components/ui';
export function ExplorePage() {
  const [params, setParams] = useSearchParams(),
    dispatch = useAppDispatch();
  const results = useAppSelector((s) => s.explore),
    user = useAppSelector((s) => s.auth.user);
  const q = params.get('q') ?? '',
    rawType = params.get('type') ?? 'all';
  const type =
    rawType === 'all' ||
    harnessDiscoveryKinds.includes(rawType as (typeof harnessDiscoveryKinds)[number])
      ? rawType
      : 'all';
  const runtime = params.get('runtime') ?? '';
  const query = new URLSearchParams({
    q,
    type,
    runtime,
    sort: params.get('sort') ?? 'relevant',
    page: params.get('page') ?? '1',
  }).toString();
  const [input, setInput] = useState(q),
    [filters, setFilters] = useState(false);
  useEffect(() => {
    setInput(q);
    dispatch(setQuery(query));
    const pending = dispatch(fetchDiscovery(query));
    return () => pending.abort();
  }, [query, q, user?.id, dispatch]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete('page');
    next.delete('stage');
    next.delete('grouped');
    setParams(next);
  }
  return (
    <>
      <div className="explore-heading">
        <div className="eyebrow">
          <span className="status-dot" />
          THE OPEN TOOLKIT FOR AI BUILDERS
        </div>
        <h1>
          Build on what <span>works.</span>
        </h1>
        <p>Discover Harnesses and the agents, skills, and configuration files they contain.</p>
      </div>
      <form
        className="hero-search"
        onSubmit={(event) => {
          event.preventDefault();
          filter('q', input);
        }}
      >
        <Search size={22} />
        <input
          aria-label="Search by task, agent, skill, or tag"
          placeholder="Search Harnesses or their native files"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <Button type="submit">
          Search
          <ArrowRight size={16} />
        </Button>
      </form>
      <div className="suggestions">
        <span>Try searching</span>
        {['acceptance criteria', 'code review', 'sprint planning'].map((value) => (
          <button key={value} onClick={() => filter('q', value)}>
            {value}
            <ArrowUpRight size={12} />
          </button>
        ))}
      </div>
      <div className="discovery-layout">
        <section className="min-w-0">
          <div className="result-toolbar">
            <div className="type-tabs" aria-label="File type">
              {[
                ['all', 'All'],
                ...harnessDiscoveryKinds.map((kind) => [
                  kind,
                  kind === 'harness' ? 'Harnesses' : assetModules[kind].plural,
                ]),
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={type === value ? 'selected' : ''}
                  onClick={() => filter('type', value!)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className={'filter-button ' + (filters ? 'selected' : '')}
              onClick={() => setFilters(!filters)}
              aria-expanded={filters}
            >
              <SlidersHorizontal size={16} />
              Filters
            </button>
          </div>
          {filters && (
            <div className="filter-panel">
              <label>
                Runtime
                <select
                  aria-label="Runtime filter"
                  value={runtime}
                  onChange={(event) => filter('runtime', event.target.value)}
                >
                  <option value="">All runtimes</option>
                  {results.runtimes.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <Button variant="ghost" onClick={() => setParams({})}>
                Clear filters
              </Button>
            </div>
          )}
          <div className="results-heading">
            <p>
              <strong>{results.total}</strong>{' '}
              {q
                ? 'matching results'
                : type === 'all' || type === 'harness'
                  ? 'Harnesses to explore'
                  : 'native components to explore'}
            </p>
            <label>
              Sort by{' '}
              <select
                aria-label="Sort results"
                value={params.get('sort') ?? 'relevant'}
                onChange={(event) => filter('sort', event.target.value)}
              >
                <option value="relevant">Most relevant</option>
                <option value="recent">Recently published</option>
              </select>
            </label>
          </div>
          {results.status === 'loading' ? (
            <Loading />
          ) : results.error ? (
            <ErrorBox message={results.error} retry={() => dispatch(fetchDiscovery(query))} />
          ) : results.items.length ? (
            <div className="asset-list">
              {results.items.map((item) => (
                <HarnessResult key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <Empty
              title="No matching Harness releases"
              description={
                q || runtime
                  ? 'Try another task or remove a filter.'
                  : 'Publish a Harness release to make its native files discoverable.'
              }
              action={
                <Button variant="secondary" onClick={() => setParams({})}>
                  Clear search and filters
                </Button>
              }
            />
          )}
          {results.total > results.pageSize && (
            <div className="pagination">
              <Button
                variant="secondary"
                disabled={results.page === 1}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(results.page - 1));
                  setParams(next);
                }}
              >
                Previous
              </Button>
              <span>
                Page {results.page} of {Math.ceil(results.total / results.pageSize)}
              </span>
              <Button
                variant="secondary"
                disabled={results.page * results.pageSize >= results.total}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('page', String(results.page + 1));
                  setParams(next);
                }}
              >
                Next
              </Button>
            </div>
          )}
        </section>
        <aside className="discovery-aside">
          <div className="aside-heading">
            <FolderGit2 size={17} />
            <h3>Files stay together.</h3>
          </div>
          <p className="aside-copy">
            Every result belongs to a Harness and an exact published release. Open a native file in
            its repository to inspect the surrounding skills, agents, and configuration.
          </p>
          <div className="aside-divider" />
          <p className="aside-fine">
            Draft changes appear after publication. MCP connections and hook commands are
            configuration files; SkillShare does not execute them.
          </p>
        </aside>
      </div>
    </>
  );
}
