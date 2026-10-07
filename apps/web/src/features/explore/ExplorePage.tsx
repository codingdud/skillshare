import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, ArrowRight } from 'lucide-react';
import {
  assetModules,
  harnessDiscoveryKinds,
  type HarnessDiscoveryItem,
  type HarnessDiscoveryPage,
} from '@skillshare/contracts';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { fetchDiscovery, setQuery } from './exploreSlice';
import { HarnessResult } from '../harnesses/HarnessResult';
import { ErrorBox, Loading, Empty } from '../../components/ui';
import { UnderlineNav } from '../../components/UnderlineNav';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useResource } from '../../lib/useResource';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const nativeSelect =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';
const landingCount = 6;

function Section({
  title,
  description,
  items,
  all,
}: {
  title: string;
  description: string;
  items: HarnessDiscoveryItem[];
  all: string;
}) {
  const id = 'explore-' + title.toLowerCase().replace(/\W+/g, '-');
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id={id} className="text-lg font-semibold tracking-tight text-heading">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1.5">
          <Link to={all} aria-label={`Show all ${title.toLowerCase()}`}>
            Show all
            <ArrowRight size={14} />
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <HarnessResult key={item.id} item={item} compact />
        ))}
      </div>
    </section>
  );
}

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
  const sort = params.get('sort') ?? '';
  const query = new URLSearchParams({
    q,
    type,
    runtime,
    sort: sort || 'relevant',
    page: params.get('page') ?? '1',
  }).toString();
  const landing = !q && !runtime && !sort && type === 'all' && (params.get('page') ?? '1') === '1';
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [filters, setFilters] = useState(false);
  const recent = useResource<HarnessDiscoveryPage>(
    landing ? '/harnesses/discover?q=&type=all&runtime=&sort=recent&page=1' : null,
  );
  useEffect(() => {
    dispatch(setQuery(query));
    const pending = dispatch(fetchDiscovery(query));
    return () => pending.abort();
  }, [query, q, user?.id, dispatch]);
  useEffect(() => {
    if (desktop) setFilters(false);
  }, [desktop]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    next.delete('page');
    next.delete('stage');
    next.delete('grouped');
    setParams(next);
  }
  function goPage(page: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  }
  function tabLink(value: string) {
    const next = new URLSearchParams(params);
    value === 'all' ? next.delete('type') : next.set('type', value);
    next.delete('page');
    const search = next.toString();
    return search ? '/?' + search : '/';
  }
  const pages = Math.max(1, Math.ceil(results.total / results.pageSize));
  const tabs = [
    { value: 'all', label: 'All' },
    ...harnessDiscoveryKinds.map((kind) => ({
      value: kind as string,
      label: kind === 'harness' ? 'Harnesses' : assetModules[kind].plural,
    })),
  ];
  const featured = results.items.slice(0, landingCount);
  const featuredIds = new Set(featured.map((item) => item.id));
  const latest = (recent.data?.items ?? [])
    .filter((item) => !featuredIds.has(item.id))
    .slice(0, landingCount);
  const hasFilters = !!(q || runtime || sort || type !== 'all');

  const filterPanel = (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="explore-runtime">Runtime</Label>
        <select
          id="explore-runtime"
          aria-label="Runtime filter"
          className={nativeSelect}
          value={runtime}
          onChange={(event) => filter('runtime', event.target.value)}
        >
          <option value="">All runtimes</option>
          {results.runtimes.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="explore-sort">Sort by</Label>
        <select
          id="explore-sort"
          aria-label="Sort results"
          className={nativeSelect}
          value={sort || 'relevant'}
          onChange={(event) => filter('sort', event.target.value)}
        >
          <option value="relevant">Most relevant</option>
          <option value="recent">Recently published</option>
          <option value="rating">Highest rated</option>
        </select>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="justify-start px-0 hover:bg-transparent hover:underline"
        disabled={!hasFilters}
        onClick={() => setParams({})}
      >
        Clear filters
      </Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="sr-only">Explore</h1>
      <div className="flex items-center justify-between gap-3 border-b">
        <UnderlineNav
          label="File type"
          className="-mb-px min-w-0"
          items={tabs.map(({ value, label }) => ({
            to: tabLink(value),
            label,
            active: type === value,
          }))}
        />
        {!landing && !desktop && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-1 shrink-0"
            aria-expanded={filters}
            onClick={() => setFilters(true)}
          >
            <SlidersHorizontal size={16} />
            Filters
          </Button>
        )}
      </div>
      {landing ? (
        <div className="mt-8 grid gap-10">
          {results.status === 'loading' ? (
            <Loading />
          ) : results.error ? (
            <ErrorBox message={results.error} retry={() => dispatch(fetchDiscovery(query))} />
          ) : featured.length ? (
            <>
              <Section
                title="Featured"
                description="The most relevant Harness releases to start from."
                items={featured}
                all="/?sort=relevant"
              />
              {latest.length > 0 && (
                <Section
                  title="Recently published"
                  description="Fresh releases from the community."
                  items={latest}
                  all="/?sort=recent"
                />
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Every result belongs to a Harness and an exact published release. MCP connections and
                hook commands are configuration files; SkillShare does not execute them.
              </p>
            </>
          ) : (
            <Empty
              title="No matching Harness releases"
              description="Publish a Harness release to make its native files discoverable."
            />
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          {desktop && (
            <aside
              aria-label="Filters"
              className="h-fit lg:sticky lg:top-32"
            >
              <h2 className="mb-4 text-sm font-semibold text-heading">Filters</h2>
              {filterPanel}
            </aside>
          )}
          <section className="min-w-0">
            <div className="mb-4 border-b pb-3">
              <p className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">{results.total}</strong>{' '}
                {q
                  ? 'matching results'
                  : type === 'all' || type === 'harness'
                    ? 'Harnesses to explore'
                    : 'native components to explore'}
              </p>
            </div>
            {results.status === 'loading' ? (
              <Loading />
            ) : results.error ? (
              <ErrorBox message={results.error} retry={() => dispatch(fetchDiscovery(query))} />
            ) : results.items.length ? (
              <div className="grid gap-4">
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
                  <Button type="button" variant="outline" onClick={() => setParams({})}>
                    Clear search and filters
                  </Button>
                }
              />
            )}
            {results.total > results.pageSize && (
              <Pagination className="mt-8">
                <PaginationContent className="gap-4">
                  <PaginationItem>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={results.page === 1}
                      onClick={() => goPage(results.page - 1)}
                    >
                      Previous
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <span className="text-sm text-muted-foreground">
                      Page {results.page} of {pages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={results.page * results.pageSize >= results.total}
                      onClick={() => goPage(results.page + 1)}
                    >
                      Next
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </section>
        </div>
      )}
      <Sheet open={filters && !desktop} onOpenChange={setFilters}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto">
          <SheetHeader className="border-b">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription className="sr-only">Filter and sort results</SheetDescription>
          </SheetHeader>
          <div className="p-4">{filterPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
