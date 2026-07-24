import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicMenu, computeOpenStatus, type PublicMenuResponse } from '@/lib/digital-menu';
import { fmtBRL } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Search, Clock, MapPin, Phone, Instagram } from 'lucide-react';

export default function CardapioPublico() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-menu', slug],
    queryFn: () => fetchPublicMenu(slug),
    staleTime: 30_000,
  });
  const [q, setQ] = useState('');

  const status = useMemo(() => computeOpenStatus(data?.hours), [data]);

  useEffect(() => {
    if (data?.company?.name) {
      document.title = `${data.company.name} · Cardápio`;
    }
  }, [data]);

  useEffect(() => {
    const primary = data?.company?.primary_color;
    if (!primary) return;
    document.documentElement.style.setProperty('--menu-brand', primary);
    return () => { document.documentElement.style.removeProperty('--menu-brand'); };
  }, [data]);

  if (isLoading) {
    return <div className="min-h-screen bg-neutral-50 grid place-items-center text-neutral-500">Carregando cardápio…</div>;
  }
  if (error || !data?.found) {
    return <FullMessage title="Cardápio não encontrado" msg="Verifique o link e tente novamente." />;
  }
  if (!data.available) {
    return <FullMessage title="Cardápio indisponível" msg="Este estabelecimento não está disponibilizando o cardápio digital no momento." logo={data.company?.logo_url ?? null} />;
  }

  const filtered = filterMenu(data, q);
  const brand = data.company?.primary_color ?? '#111827';

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <MenuHeader data={data} status={status} brand={brand} />

      <div className="mx-auto max-w-3xl px-4 pb-24">
        <div className="sticky top-0 z-20 -mx-4 bg-neutral-50/95 px-4 py-3 backdrop-blur border-b border-neutral-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar no cardápio…"
              className="pl-9 h-11 bg-white border-neutral-200"
            />
          </div>
          {filtered.length > 0 && (
            <nav className="mt-3 flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
              {filtered.map((c) => (
                <a key={c.id} href={`#cat-${c.id}`}
                   className="whitespace-nowrap rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400">
                  {c.name}
                </a>
              ))}
            </nav>
          )}
        </div>

        {!status.open && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Fechado agora. {status.next ? `Abrimos ${status.next}.` : 'Sem horário previsto de abertura.'}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="mt-16 text-center text-neutral-500">Nenhum item encontrado.</div>
        ) : (
          filtered.map((c) => (
            <section key={c.id} id={`cat-${c.id}`} className="mt-8 scroll-mt-32">
              <h2 className="text-lg font-semibold tracking-tight">{c.name}</h2>
              {c.description && <p className="text-sm text-neutral-500 mt-0.5">{c.description}</p>}
              <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
                {c.items.map((it) => (
                  <li key={it.id} className={`flex gap-3 p-3 ${it.sold_out ? 'opacity-60' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-medium leading-tight">{it.name}</h3>
                        {it.featured && !it.sold_out && (
                          <span className="text-[10px] uppercase tracking-wider text-white rounded px-1.5 py-0.5"
                                style={{ background: brand }}>Destaque</span>
                        )}
                      </div>
                      {it.description && (
                        <p className="mt-1 text-sm text-neutral-600 line-clamp-2">{it.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: brand }}>{fmtBRL(it.price)}</span>
                        {it.sold_out && <span className="text-[11px] text-neutral-500 uppercase tracking-wider">Esgotado</span>}
                      </div>
                    </div>
                    {it.image_url && (
                      <img src={it.image_url} alt={it.name} loading="lazy"
                           className="h-20 w-20 flex-shrink-0 rounded-lg object-cover bg-neutral-100" />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <footer className="mt-16 text-center text-xs text-neutral-400">
          Powered by <Link to="/" className="underline">MesaChef</Link>
        </footer>
      </div>
    </div>
  );
}

function MenuHeader({ data, status, brand }: {
  data: PublicMenuResponse; status: { open: boolean; next: string | null }; brand: string;
}) {
  const s = data.settings ?? {};
  const c = data.company!;
  return (
    <header className="relative">
      <div className="h-40 w-full" style={{ background: s.cover_url ? `url(${s.cover_url}) center/cover` : `linear-gradient(180deg, ${brand}, ${brand}dd)` }} />
      <div className="mx-auto max-w-3xl px-4">
        <div className="-mt-10 flex items-end gap-4">
          <div className="h-20 w-20 flex-shrink-0 rounded-2xl border-4 border-neutral-50 bg-white shadow-sm grid place-items-center overflow-hidden">
            {c.logo_url ? (
              <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-neutral-400">{c.name?.[0]}</span>
            )}
          </div>
          <div className="pb-2 min-w-0">
            <h1 className="text-xl font-semibold truncate">{c.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${status.open ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.open ? 'bg-emerald-500' : 'bg-neutral-500'}`} />
                {status.open ? 'Aberto agora' : 'Fechado'}
              </span>
              {s.avg_prep_min ? <span className="text-neutral-500 inline-flex items-center gap-1"><Clock className="h-3 w-3" />~{s.avg_prep_min} min</span> : null}
            </div>
          </div>
        </div>

        {s.presentation && (
          <p className="mt-4 text-sm text-neutral-700 leading-relaxed">{s.presentation}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
          {s.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.address}</span>}
          {s.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
          {s.instagram && <a className="inline-flex items-center gap-1 hover:underline" href={`https://instagram.com/${s.instagram.replace('@', '')}`} target="_blank" rel="noreferrer"><Instagram className="h-3 w-3" />@{s.instagram.replace('@', '')}</a>}
        </div>
      </div>
    </header>
  );
}

function FullMessage({ title, msg, logo }: { title: string; msg: string; logo?: string | null }) {
  return (
    <div className="min-h-screen bg-neutral-50 grid place-items-center px-6">
      <div className="text-center max-w-sm">
        {logo && <img src={logo} className="mx-auto mb-4 h-16 w-16 rounded-xl object-cover" alt="" />}
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600">{msg}</p>
      </div>
    </div>
  );
}

function filterMenu(data: PublicMenuResponse, q: string) {
  const cats = data.categories ?? [];
  const query = q.trim().toLowerCase();
  if (!query) return cats;
  return cats
    .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(query) || (i.description ?? '').toLowerCase().includes(query)) }))
    .filter((c) => c.items.length > 0);
}
