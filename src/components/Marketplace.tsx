"use client";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import Link from "next/link";
import {
  commission as platformCommission,
  expectedValue,
  suggestedPrice,
} from "@/lib/money";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Search,
  ShoppingBag,
  Heart,
  UserRound,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Package,
  ChevronRight,
  Plus,
  Minus,
  X,
  Star,
  Menu,
  Check,
  ExternalLink,
  Layers,
  Store,
  SlidersHorizontal,
  LogOut,
  Bell,
  Truck,
  Lock,
  Compass,
} from "lucide-react";
const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n / 100,
  );
const date = (s: string) => new Date(s).toLocaleString("pt-BR");
async function api(path: string, body?: unknown, method = "POST") {
  const res = await fetch(
    "/api/" + path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Não foi possível concluir");
  return data;
}
type Item = Record<string, any>;
type CartLine = {
  id: string;
  kind: "listing" | "campaign";
  title: string;
  price: number;
  quantity: number;
  image: string;
  seller: string;
  version?: number;
  stockToken?: string;
};
function useData(path: string) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    api(path)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
function Status({ data, error }: { data: any; error: string }) {
  return error ? (
    <div className="empty error" role="alert">
      {error}
    </div>
  ) : data === null ? (
    <div className="loading" role="status">
      <span />
      Carregando sua próxima descoberta…
    </div>
  ) : null;
}
function Empty({
  text = "Nada por aqui ainda.",
  children,
}: {
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Compass size={38} />
      <h3>{text}</h3>
      {children}
    </div>
  );
}
function Form({
  children,
  onSubmit,
  label = "Salvar",
  className = "",
}: {
  children: React.ReactNode;
  onSubmit: (data: FormData) => Promise<any>;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const d = await onSubmit(new FormData(form));
      setMessage(d?.message || "Salvo com sucesso.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={"form " + className}>
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <button disabled={busy} className="button primary">
        {busy ? "Aguarde…" : label}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function Field({
  name,
  label,
  type = "text",
  value,
  required = true,
  ...rest
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  [k: string]: any;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        {...rest}
      />
    </label>
  );
}
function Select({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: string[];
  value?: string;
}) {
  return (
    <label className="field">
      {label}
      <select name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
const val = (f: FormData, k: string) => String(f.get(k) || "");
const num = (f: FormData, k: string) => Number(f.get(k));
async function upload(file: File): Promise<string> {
  if (!file.size) throw new Error("Selecione uma imagem");
  if (file.size > 1_000_000) throw new Error("Use uma imagem de até 1 MB");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid =
    (file.type === "image/png" && bytes[0] === 137 && bytes[1] === 80) ||
    (file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) ||
    (file.type === "image/webp" &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF");
  if (!valid) throw new Error("Formato de imagem inválido");
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
export default function Marketplace() {
  return (
    <Suspense fallback={<div className="loading">Preparando a coleção…</div>}>
      <App />
    </Suspense>
  );
}
function App() {
  const path = usePathname(),
    router = useRouter(),
    params = useSearchParams();
  const { data: session, reload: reloadSession } = useData("session");
  const [cart, setCart] = useState<CartLine[]>([]),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState(""),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem("nexo-cart") || "[]"));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("nexo-cart", JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const user = session?.user;
  const action = async (fn: () => Promise<any>, message = "Pronto!") => {
    try {
      await fn();
      setToast(message);
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  function add(item: CartLine) {
    setCart((c) => {
      const old = c.find((i) => i.id === item.id);
      return old
        ? c.map((i) =>
            i.id === item.id
              ? { ...i, quantity: Math.min(20, i.quantity + 1) }
              : i,
          )
        : [...c, item];
    });
    setToast("Adicionado à sua coleção de descobertas.");
  }
  function addListing(l: Item) {
    add({
      id: l.id,
      kind: "listing",
      title: l.title,
      price: l.price,
      quantity: 1,
      image: l.photos?.[0] || l.art,
      seller: l.seller_name || "Vendedor",
    });
  }
  async function favorite(id: string) {
    await action(
      () => api("favorites", { listingId: id }),
      "Favoritos atualizados.",
    );
  }
  const common = { user, action, add, addListing, favorite };
  let content: React.ReactNode;
  if (path === "/") content = <Home {...common} />;
  else if (path === "/explorar") content = <Explore {...common} />;
  else if (path.startsWith("/produto/"))
    content = <Product id={path.split("/")[2]} {...common} />;
  else if (path.startsWith("/vendedor/"))
    content = <SellerProfile id={path.split("/")[2]} {...common} />;
  else if (path === "/carrinho")
    content = (
      <Cart cart={cart} setCart={setCart} user={user} router={router} />
    );
  else if (path === "/conta")
    content = (
      <Account
        mode={session?.mode}
        user={user}
        reload={reloadSession}
        token={params.get("verify") || params.get("reset")}
        kind={params.has("verify") ? "verify" : "reset"}
      />
    );
  else if (path === "/favoritos") content = <Favorites {...common} />;
  else if (path === "/pedidos") content = <Orders user={user} />;
  else if (path.startsWith("/pedido/"))
    content = <Order id={path.split("/")[2]} user={user} action={action} />;
  else if (path === "/afiliados") content = <Affiliates action={action} />;
  else if (path === "/boosters") content = <Boosters {...common} />;
  else if (path === "/vender") content = <SellerDashboard {...common} />;
  else if (path === "/admin") content = <Admin user={user} action={action} />;
  else
    content = (
      <Empty text="Essa página ainda não faz parte da coleção.">
        <Link href="/">Voltar ao início</Link>
      </Empty>
    );
  return (
    <>
      <div className="demo-bar">
        <span className="demo-dot" />
        AMBIENTE DE DEMONSTRAÇÃO{" "}
        <span className="demo-extra">
          · Produtos fictícios, sem cobrança ou envio real
        </span>
        <Link href="/conta">
          Conhecer o sandbox <ArrowUpRight size={12} />
        </Link>
      </div>
      <header className="header">
        <div className="container head-main">
          <Link className="logo" href="/" aria-label="Nexo TCG início">
            <span className="logo-mark">n</span>
            {session?.siteName || "Nexo TCG"}
            <span className="logo-dot">β</span>
          </Link>
          <form className="search" action="/explorar">
            <Search size={19} />
            <input
              name="q"
              placeholder="Qual carta falta na sua coleção?"
              aria-label="Buscar cartas e colecionáveis"
              defaultValue={params.get("q") || ""}
            />
            <kbd>↵</kbd>
          </form>
          <div className="header-actions">
            <Link href="/favoritos" aria-label="Favoritos">
              <Heart size={21} />
            </Link>
            <Link href="/conta" className="account-link">
              <UserRound size={21} />
              <span>
                {user ? user.name.split(" ")[0] : "Entrar"}
                <small>{user ? "Minha conta" : "ou criar conta"}</small>
              </span>
            </Link>
            <Link
              href="/carrinho"
              className="bag"
              aria-label={`Carrinho com ${cart.reduce((s, i) => s + i.quantity, 0)} itens`}
            >
              <ShoppingBag size={22} />
              <b>{cart.reduce((s, i) => s + i.quantity, 0)}</b>
            </Link>
            <button
              className="icon mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Abrir navegação"
            >
              <Menu />
            </button>
          </div>
        </div>
        <div className={"nav-wrap " + (menu ? "open" : "")}>
          <nav className="container nav">
            <Link
              className={path === "/explorar" ? "active" : ""}
              href="/explorar"
            >
              <Layers size={16} /> Explorar coleção
            </Link>
            <Link href="/explorar?franchise=Pokémon">Pokémon</Link>
            <Link href="/explorar?franchise=One+Piece">One Piece</Link>
            <Link href="/explorar?franchise=Yu-Gi-Oh!">Yu-Gi-Oh!</Link>
            <Link href="/explorar?type=Figure">Colecionáveis</Link>
            <Link
              href="/boosters"
              className={path === "/boosters" ? "active" : ""}
            >
              Boosters <span className="tiny-tag">DEMO</span>
            </Link>
            <Link href="/afiliados">
              Achados parceiros <ArrowUpRight size={13} />
            </Link>
            <Link href="/vender" className="sell-link">
              <Plus size={16} /> Quero vender
            </Link>
          </nav>
        </div>
      </header>
      <main>{content}</main>
      <footer>
        <div className="container footer-grid">
          <div>
            <Link href="/" className="logo">
              <span className="logo-mark">n</span>
              {session?.siteName || "Nexo TCG"}
            </Link>
            <p>
              Histórias que cabem na sua coleção.
              <br />
              Conexões que vão além das cartas.
            </p>
            <span className="muted small">
              Identidade provisória · Projeto em desenvolvimento
            </span>
          </div>
          <div>
            <h4>Descubra</h4>
            <Link href="/explorar">Catálogo de cartas</Link>
            <Link href="/boosters">Boosters personalizados</Link>
            <Link href="/afiliados">Ofertas de parceiros</Link>
          </div>
          <div>
            <h4>Sua jornada</h4>
            <Link href="/pedidos">Meus pedidos e boosters</Link>
            <Link href="/favoritos">Lista de desejos</Link>
            <Link href="/vender">Central do vendedor</Link>
            {user?.role === "admin" && <Link href="/admin">Administração</Link>}
          </div>
          <div>
            <h4>Feito para colecionadores</h4>
            <p>
              Marketplace interno: comissão de 5% sobre produtos. Frete
              separado.
            </p>
            <p>
              Links parceiros podem gerar comissão de afiliado, sem custo
              adicional.
            </p>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Nexo TCG · Demonstração</span>
          <span>Português (BR) · R$ BRL</span>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
function ProductCard({
  item,
  addListing,
  favorite,
}: {
  item: Item;
  addListing: (i: Item) => void;
  favorite: (id: string) => void;
}) {
  return (
    <article className="product-card">
      <div className="product-image">
        <Link href={"/produto/" + item.id}>
          <img
            src={item.photos?.[0] || item.art}
            alt={`Imagem do anúncio de demonstração: ${item.title}`}
            loading="lazy"
          />
        </Link>
        <span className="condition">{item.condition}</span>
        <button
          className="favorite"
          aria-label={"Favoritar " + item.title}
          onClick={() => favorite(item.id)}
        >
          <Heart size={17} />
        </button>
        <span className="image-caption">ARTE DEMO · NEXO ORIGINALS</span>
      </div>
      <div className="product-info">
        <div className="eyebrow">
          {item.franchise || "Colecionável"}{" "}
          <span>· {item.language || "PT-BR"}</span>
        </div>
        <Link className="product-title" href={"/produto/" + item.id}>
          {item.title}
        </Link>
        <p>
          {item.collection || "Coleção Nexo"}
          {item.code ? " · " + item.code : ""}
        </p>
        <div className="product-meta">
          <span>
            <Store size={12} />
            {item.seller_name}
          </span>
          <span>{item.stock} un.</span>
        </div>
        <div className="product-bottom">
          <strong>{brl(item.price)}</strong>
          <button
            className="add-button"
            onClick={() => addListing(item)}
            disabled={!item.stock}
            aria-label={"Adicionar " + item.title + " ao carrinho"}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
function Home(props: any) {
  const { data, error } = useData("catalog");
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <span className="pill">
            <span /> O SEU UNIVERSO DE COLECIONÁVEIS
          </span>
          <h1>
            Pequenas cartas.
            <br />
            Grandes <em>conexões.</em>
          </h1>
          <p>
            Encontre aquela carta especial, descubra novos universos e dê o
            próximo passo na sua coleção.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/explorar">
              Explorar a coleção <ArrowUpRight size={18} />
            </Link>
            <Link href="/vender" className="text-button">
              Começar a vender <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-note">
            <span className="mini-cards">
              <i>N</i>
              <i>E</i>
              <i>X</i>
            </span>
            <span>
              De colecionador para colecionador.
              <br />
              <strong>Seu próximo achado começa aqui.</strong>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="spark spark-one">✧</span>
          <span className="spark spark-two">✦</span>
          <img
            className="hero-card back"
            src="/art/samurai.svg"
            alt="Arte original Samurai"
          />
          <img
            className="hero-card front"
            src="/art/aurora.svg"
            alt="Arte original Dragão da Aurora"
          />
          <span className="floating-label">
            <Sparkles size={18} />
            <span>
              A próxima descoberta
              <br />
              <b>pode ser sua.</b>
            </span>
          </span>
          <span className="art-disclaimer">
            Cartas ilustrativas · personagens originais
          </span>
        </div>
      </section>
      <div className="container trust-strip">
        <div>
          <ShieldCheck />
          <span>
            <b>Transparência em cada compra</b>
            <small>Ofertas, condições e vendedores à vista</small>
          </span>
        </div>
        <div>
          <Layers />
          <span>
            <b>Uma coleção, muitos universos</b>
            <small>Cartas, figures e achados especiais</small>
          </span>
        </div>
        <div>
          <Package />
          <span>
            <b>Feito para quem coleciona</b>
            <small>Do primeiro card à peça que faltava</small>
          </span>
        </div>
      </div>
      <section className="container section universes">
        <div className="section-heading">
          <div>
            <span className="eyebrow accent">
              ENCONTRE SUA PRÓXIMA HISTÓRIA
            </span>
            <h2>Qual é o seu universo?</h2>
          </div>
          <Link href="/explorar">
            Ver todos <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="universe-grid">
          {[
            ["Pokémon", "O início de toda jornada", "P", "yellow"],
            ["One Piece", "Sua próxima grande aventura", "O", "red"],
            ["Yu-Gi-Oh!", "É hora do seu próximo duelo", "Y", "purple"],
            ["Naruto", "Um novo caminho ninja", "N", "orange"],
            ["Dragon Ball", "Eleve sua coleção", "D", "green"],
          ].map(([name, desc, letter, color]) => (
            <Link
              key={name}
              className={"universe " + color}
              href={"/explorar?franchise=" + encodeURIComponent(name)}
            >
              <span className="universe-symbol">
                {letter}
                <span>✦</span>
              </span>
              <div>
                <b>{name}</b>
                <small>{desc}</small>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow accent">
              O PRÓXIMO DESTAQUE DA SUA PASTA
            </span>
            <h2>
              Descobertas que valem o espaço{" "}
              <span className="live-badge">Catálogo demo</span>
            </h2>
          </div>
          <Link href="/explorar">
            Explorar tudo <ArrowUpRight size={16} />
          </Link>
        </div>
        <Status data={data} error={error} />
        {data && (
          <div className="product-grid">
            {data
              .filter(
                (item: Item, index: number, all: Item[]) =>
                  all.findIndex((x) => x.edition_id === item.edition_id) ===
                  index,
              )
              .sort((a: Item, b: Item) => b.price - a.price)
              .slice(0, 4)
              .map((item: Item) => (
                <ProductCard key={item.id} item={item} {...props} />
              ))}
          </div>
        )}
      </section>
      <section className="container section">
        <div className="booster-banner">
          <div>
            <span className="eyebrow">UM PACOTE. NOVAS POSSIBILIDADES.</span>
            <h2>
              A emoção de descobrir.
              <br />
              Do seu jeito.
            </h2>
            <p>
              Conheça os boosters personalizados: composição transparente e
              abertura carta por carta no site.
            </p>
            <Link className="button light" href="/boosters">
              Descobrir boosters <Sparkles size={18} />
            </Link>
            <small>Experiência sandbox · sem compra ou envio real</small>
          </div>
          <div className="pack-art">
            <span>NEXO</span>
            <Sparkles size={60} />
            <b>COSMOS</b>
            <small>6 CARTAS · DEMONSTRAÇÃO</small>
          </div>
          <span className="banner-star">✧</span>
        </div>
      </section>
      <section className="container community">
        <span className="eyebrow accent">SUA COLEÇÃO TEM HISTÓRIA</span>
        <h2>
          Algumas cartas merecem
          <br />
          encontrar um novo colecionador.
        </h2>
        <p>
          Abra sua vitrine, publique seus exemplares e faça parte desse
          universo.
          <br />
          Comissão de 5% nos produtos vendidos. Sem comissão sobre o frete.
        </p>
        <Link href="/vender" className="button outline">
          Criar minha vitrine <ArrowUpRight size={18} />
        </Link>
      </section>
    </>
  );
}
function Explore(props: any) {
  const p = useSearchParams(),
    router = useRouter();
  const q = p.toString();
  const { data, error } = useData("catalog?" + q);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(q);
    value ? next.set(key, value) : next.delete(key);
    router.push("/explorar?" + next.toString());
  }
  return (
    <div className="container page">
      <Breadcrumb label="Explorar coleção" />
      <div className="page-title">
        <div>
          <span className="eyebrow accent">
            PARA CADA COLECIONADOR, UMA DESCOBERTA
          </span>
          <h1>Explore seu universo.</h1>
          <p>
            Encontre cartas e colecionáveis. Todos os produtos atuais são
            fictícios.
          </p>
        </div>
        <span className="count">{data?.length || 0} ofertas demo</span>
      </div>
      <div className="catalog-layout">
        <aside className="filters">
          <h3>
            <SlidersHorizontal size={17} /> Filtrar coleção
          </h3>
          <label>
            Franquia
            <select
              value={p.get("franchise") || ""}
              onChange={(e) => filter("franchise", e.target.value)}
            >
              <option value="">Todos os universos</option>
              {[
                "Pokémon",
                "One Piece",
                "Yu-Gi-Oh!",
                "Naruto",
                "Dragon Ball",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Tipo de produto
            <select
              value={p.get("type") || ""}
              onChange={(e) => filter("type", e.target.value)}
            >
              <option value="">Todos os tipos</option>
              {[
                "Carta avulsa",
                "Lote",
                "Deck",
                "Produto lacrado",
                "Figure",
                "Pelúcia",
                "Acessório",
                "Outro",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Conservação
            <select
              value={p.get("condition") || ""}
              onChange={(e) => filter("condition", e.target.value)}
            >
              <option value="">Todas as condições</option>
              {["NM", "LP", "MP", "HP", "DMG", "Novo", "Usado"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => router.push("/explorar")}
          >
            Limpar filtros <X size={14} />
          </button>
          <div className="filter-note">
            <ShieldCheck />
            <b>Compare o mesmo exemplar</b>
            <p>Edição, idioma, acabamento e condição fazem diferença.</p>
          </div>
        </aside>
        <div>
          <div className="catalog-toolbar">
            <span>
              {p.get("q")
                ? "Busca: “" + p.get("q") + "”"
                : "Todas as descobertas"}
            </span>
            <select
              aria-label="Ordenar ofertas"
              value={p.get("sort") || "recent"}
              onChange={(e) => filter("sort", e.target.value)}
            >
              <option value="recent">Mais recentes</option>
              <option value="price">Menor preço</option>
              <option value="expensive">Maior preço</option>
            </select>
          </div>
          <Status data={data} error={error} />
          {data?.length === 0 ? (
            <Empty text="Ainda não encontramos esse achado.">
              <button onClick={() => router.push("/explorar")}>
                Ver toda a coleção
              </button>
            </Empty>
          ) : (
            <div className="product-grid three">
              {data?.map((item: Item) => (
                <ProductCard key={item.id} item={item} {...props} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function Breadcrumb({ label }: { label: string }) {
  return (
    <div className="breadcrumb">
      <Link href="/">Início</Link>
      <ChevronRight size={12} />
      <span>{label}</span>
    </div>
  );
}
function Product({ id, ...props }: any) {
  const { data, error } = useData("product/" + id);
  if (!data)
    return (
      <div className="container page">
        <Status data={data} error={error} />
      </div>
    );
  const l = data.listing;
  return (
    <div className="container page">
      <Breadcrumb label={l.title} />
      <div className="detail-grid">
        <div className="detail-art">
          <img src={l.photos[0]} alt={l.title} />
          <span>Exemplar de demonstração · arte original</span>
        </div>
        <div className="detail-info">
          <span className="eyebrow accent">
            {l.franchise} / {l.collection}
          </span>
          <h1>{l.title}</h1>
          <div className="chips">
            {[l.code, l.rarity, l.language, l.finish, l.condition, l.grading]
              .filter(Boolean)
              .map((t: string) => (
                <span key={t}>{t}</span>
              ))}
          </div>
          <p>{l.description}</p>
          <Link href={"/vendedor/" + l.seller_id} className="seller-chip">
            <span className="avatar">{l.seller_name[0]}</span>
            <div>
              Vendido por <b>{l.seller_name}</b>
            </div>
            <ChevronRight size={16} />
          </Link>
          <div className="price-box">
            <span>Preço do exemplar</span>
            <strong>{brl(l.price)}</strong>
            <small>
              {l.stock} unidades disponíveis · frete calculado por vendedor
            </small>
            <button
              className="button primary"
              disabled={!l.stock}
              onClick={() => props.addListing(l)}
            >
              <ShoppingBag size={18} />
              Adicionar ao carrinho
            </button>
            <button
              className="text-button"
              onClick={() => props.favorite(l.id)}
            >
              <Heart size={16} />
              Salvar na lista de desejos
            </button>
          </div>
          <p className="notice">
            <ShieldCheck size={18} /> Sandbox: sem cobrança real. A confirmação
            é feita no servidor.
          </p>
        </div>
      </div>
      <section className="section">
        <h2>Compare ofertas deste exemplar</h2>
        <p className="muted">
          Mesma edição, idioma, acabamento, conservação e graduação.
        </p>
        <div className="panel">
          {data.offers.map((o: Item) => (
            <div className="offer-row" key={o.id}>
              <Link href={"/vendedor/" + o.seller_id}>
                <Store size={17} />
                {o.seller_name}
              </Link>
              <span>{o.stock} unidades</span>
              <strong>{brl(o.price)}</strong>
              <Link className="button outline" href={"/produto/" + o.id}>
                Ver oferta
              </Link>
            </div>
          ))}
        </div>
      </section>
      <Form
        label="Enviar denúncia"
        className="panel compact"
        onSubmit={async (f) => {
          const file = f.get("evidence") as File;
          return api("reports", {
            listingId: l.id,
            reason: val(f, "reason"),
            evidence: file?.size ? [await upload(file)] : [],
          });
        }}
      >
        <h3>Encontrou um problema neste anúncio?</h3>
        <Field name="reason" label="Descreva o problema" minLength={10} />
        <Field
          name="evidence"
          label="Evidência (opcional, até 1 MB)"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required={false}
        />
      </Form>
    </div>
  );
}
function Favorites(props: any) {
  const { data, error } = useData("favorites");
  return (
    <div className="container page">
      <Breadcrumb label="Lista de desejos" />
      <h1>Os seus próximos achados.</h1>
      <Status data={data} error={error} />
      {data?.length === 0 ? (
        <Empty text="Sua lista está esperando uma descoberta.">
          <Link href="/explorar">Explorar catálogo</Link>
        </Empty>
      ) : (
        <div className="product-grid">
          {data?.map((item: Item) => (
            <ProductCard key={item.id} item={item} {...props} />
          ))}
        </div>
      )}
    </div>
  );
}
function SellerProfile({ id, ...props }: any) {
  const { data, error } = useData("seller/" + id);
  return (
    <div className="container page">
      <Status data={data} error={error} />
      {data && (
        <>
          <div className="profile-hero">
            <span className="avatar large">
              {data.seller.avatar ? (
                <img src={data.seller.avatar} alt="Avatar do vendedor" />
              ) : (
                data.seller.name[0]
              )}
            </span>
            <div>
              <span className="eyebrow accent">VITRINE DO COLECIONADOR</span>
              <h1>{data.seller.name}</h1>
              <p>{data.seller.bio}</p>
              <span>
                {data.reviews.length
                  ? `${data.reviews.length} avaliações de compras entregues`
                  : "Ainda sem avaliações de compras concluídas"}
              </span>
            </div>
          </div>
          <h2>Na vitrine</h2>
          <div className="product-grid">
            {data.listings.map((item: Item) => (
              <ProductCard key={item.id} item={item} {...props} />
            ))}
          </div>
          <h2 className="section">Avaliações</h2>
          {data.reviews.length ? (
            data.reviews.map((r: Item, i: number) => (
              <article className="panel" key={i}>
                <b>
                  {r.name} · {r.rating}/5 <Star size={13} />
                </b>
                <p>{r.body}</p>
              </article>
            ))
          ) : (
            <Empty text="A reputação começa com a primeira entrega." />
          )}
        </>
      )}
    </div>
  );
}
function Cart({ cart, setCart, user, router }: any) {
  const { data: account } = useData("account");
  const [key] = useState(() => crypto.randomUUID());
  return (
    <div className="container page">
      <Breadcrumb label="Carrinho" />
      <h1>Sua próxima coleção começa aqui.</h1>
      <p className="muted">
        Checkout sandbox · frete demonstrativo de R$ 15 por vendedor · nenhuma
        cobrança real
      </p>
      {!cart.length ? (
        <Empty text="Seu carrinho ainda está vazio.">
          <Link href="/explorar" className="button primary">
            Encontrar meu próximo achado
          </Link>
        </Empty>
      ) : (
        <div className="checkout-grid">
          <div>
            {[...new Set<string>(cart.map((i: CartLine) => i.seller))].map(
              (seller) => (
                <section className="panel cart-seller" key={seller}>
                  <h3>
                    <Store size={17} />
                    {seller}
                  </h3>
                  {cart
                    .filter((i: CartLine) => i.seller === seller)
                    .map((i: CartLine) => (
                      <div className="cart-row" key={i.id}>
                        <img src={i.image} alt={i.title} />
                        <div>
                          <b>{i.title}</b>
                          <small>
                            {i.kind === "campaign"
                              ? "Booster sandbox"
                              : "Oferta interna"}
                          </small>
                          <strong>{brl(i.price)}</strong>
                        </div>
                        <div className="quantity">
                          <button
                            aria-label="Diminuir quantidade"
                            onClick={() =>
                              setCart(
                                cart.map((x: CartLine) =>
                                  x.id === i.id
                                    ? {
                                        ...x,
                                        quantity: Math.max(1, x.quantity - 1),
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <Minus size={13} />
                          </button>
                          {i.quantity}
                          <button
                            aria-label="Aumentar quantidade"
                            onClick={() =>
                              setCart(
                                cart.map((x: CartLine) =>
                                  x.id === i.id
                                    ? {
                                        ...x,
                                        quantity: Math.min(20, x.quantity + 1),
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <button
                          className="icon"
                          aria-label="Remover item"
                          onClick={() =>
                            setCart(cart.filter((x: CartLine) => x.id !== i.id))
                          }
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  <p className="small muted">
                    <Truck size={14} />
                    Uma remessa · frete demonstrativo R$ 15,00
                  </p>
                </section>
              ),
            )}
          </div>
          <aside className="panel summary">
            <h2>Resumo da descoberta</h2>
            <div className="sum-row">
              <span>Produtos</span>
              <b>
                {brl(
                  cart.reduce(
                    (s: number, i: CartLine) => s + i.price * i.quantity,
                    0,
                  ),
                )}
              </b>
            </div>
            <div className="sum-row">
              <span>Frete estimado</span>
              <b>
                {brl(new Set(cart.map((i: CartLine) => i.seller)).size * 1500)}
              </b>
            </div>
            <p className="small muted">
              O servidor valida novamente preços e estoque. Reserva por 15
              minutos.
            </p>
            {user ? (
              <Form
                label="Reservar e ir ao pagamento"
                onSubmit={async (f) => {
                  const order = await api("checkout", {
                    items: cart.map((i: CartLine) => ({
                      [i.kind === "listing" ? "listingId" : "campaignId"]: i.id,
                      quantity: i.quantity,
                      version: i.version,
                      expectedPrice: i.price,
                      stockToken: i.stockToken,
                    })),
                    key,
                    addressId: val(f, "address"),
                    method: val(f, "method"),
                  });
                  setCart([]);
                  router.push("/pedido/" + order.id);
                }}
              >
                <label className="field">
                  Entregar em
                  <select name="address" required>
                    <option value="">Selecione um endereço</option>
                    {account?.addresses.map((a: Item) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.data.city}
                      </option>
                    ))}
                  </select>
                </label>
                <Link href="/conta" className="small">
                  Gerenciar endereços
                </Link>
                <Select
                  name="method"
                  label="Forma de pagamento (simulada)"
                  options={["pix", "card"]}
                />
                <label className="checkbox">
                  <input type="checkbox" required />
                  Entendo que esta é uma compra de demonstração.
                </label>
              </Form>
            ) : (
              <Link href="/conta" className="button primary">
                Entrar para continuar
              </Link>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
function Account({ user, reload, token, kind, mode: appMode }: any) {
  const [mode, setMode] = useState("login");
  const { data, reload: refresh } = useData("account");
  useEffect(() => {
    if (user) refresh();
  }, [user?.id]);
  if (token)
    return (
      <div className="container page narrow">
        <h1>{kind === "verify" ? "Verificar e-mail" : "Nova senha"}</h1>
        <Form
          label="Confirmar"
          onSubmit={(f) =>
            api("auth/token", {
              token,
              kind,
              password: val(f, "password") || undefined,
            })
          }
        >
          {kind === "reset" && (
            <Field
              name="password"
              label="Nova senha"
              type="password"
              minLength={10}
            />
          )}
        </Form>
      </div>
    );
  if (!user)
    return (
      <div className="container page auth-grid">
        <div className="auth-story">
          <span className="eyebrow accent">BEM-VINDO AO SEU UNIVERSO</span>
          <h1>
            Toda coleção
            <br />
            começa com
            <br />
            <em>uma conexão.</em>
          </h1>
          <img src="/art/kitsune.svg" alt="Carta original Kitsune" />
        </div>
        <div className="panel auth-panel">
          <div className="tabs">
            {[
              ["login", "Entrar"],
              ["register", "Criar conta"],
              ["recover", "Recuperar"],
            ].map(([key, label]) => (
              <button
                className={mode === key ? "selected" : ""}
                key={key}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <h2>
            {mode === "login"
              ? "Bom ter você por aqui."
              : mode === "register"
                ? "Sua coleção tem um novo lugar."
                : "Vamos recuperar seu acesso."}
          </h2>
          <Form
            key={mode}
            label={
              mode === "login"
                ? "Entrar na minha conta"
                : mode === "register"
                  ? "Criar minha conta"
                  : "Enviar link"
            }
            onSubmit={async (f) => {
              const result = await api("auth/" + mode, {
                email: val(f, "email"),
                password: val(f, "password"),
                name: val(f, "name"),
              });
              if (mode === "login") reload();
              return result;
            }}
          >
            {mode === "register" && (
              <Field
                name="name"
                label="Como quer ser chamado?"
                autoComplete="name"
              />
            )}
            <Field
              name="email"
              label="E-mail"
              type="email"
              autoComplete="email"
            />
            {mode !== "recover" && (
              <Field
                name="password"
                label="Senha"
                type="password"
                minLength={mode === "register" ? 10 : 1}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
              />
            )}
          </Form>
          {appMode === "demo" && (
            <div className="demo-login">
              <b>Experimente com uma conta demo</b>
              <p>
                Senha de todas as contas: <code>NexoDemo2026!</code>
              </p>
              <div>
                {[
                  ["colecionador", "Comprador"],
                  ["loja", "Vendedor"],
                  ["admin", "Admin"],
                ].map(([email, label]) => (
                  <button
                    key={email}
                    className="button outline"
                    onClick={async () => {
                      try {
                        await api("auth/login", {
                          email: email + "@nexo.test",
                          password: "NexoDemo2026!",
                        });
                        reload();
                      } catch (e) {
                        alert((e as Error).message);
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small>
                Contas de desenvolvimento. Nunca use dados pessoais reais.
              </small>
            </div>
          )}
        </div>
      </div>
    );
  return (
    <div className="container page">
      <div className="page-title">
        <div>
          <span className="eyebrow accent">SEU ESPAÇO NO NEXO</span>
          <h1>Olá, {user.name}.</h1>
          <p>
            {user.email} · {user.role} ·{" "}
            {user.verified
              ? "E-mail verificado"
              : "E-mail pendente de verificação"}
          </p>
        </div>
        <button
          className="button outline"
          onClick={async () => {
            await api("auth/logout", {});
            reload();
          }}
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
      <div className="account-grid">
        <section className="panel">
          <h2>Sua identidade pública</h2>
          <Form
            onSubmit={async (f) => {
              const file = f.get("avatar") as File;
              const r = await api(
                "account",
                {
                  name: val(f, "name"),
                  bio: val(f, "bio"),
                  avatar: file?.size ? await upload(file) : undefined,
                },
                "PATCH",
              );
              reload();
              return r;
            }}
          >
            <Field name="name" label="Nome de exibição" value={user.name} />
            <Field
              name="bio"
              label="Sobre sua coleção"
              value={data?.profile?.bio || ""}
              required={false}
            />
            <Field
              name="avatar"
              label="Avatar próprio ou autorizado (até 1 MB)"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required={false}
            />
          </Form>
          <p className="notice">Documentos e endereços ficam privados.</p>
          {!user.verified && (
            <button
              className="button outline"
              onClick={async () => {
                await api("auth/resend", {});
                alert("Verificação enviada. No demo, consulte .data/outbox.");
              }}
            >
              Reenviar verificação
            </button>
          )}
          <Link className="button outline" href={"/vendedor/" + user.id}>
            Ver perfil público <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="panel">
          <h2>Endereços de entrega</h2>
          {data?.addresses.map((a: Item) => (
            <p key={a.id}>
              <b>{a.label}</b>
              <br />
              {a.data.street}, {a.data.number} · {a.data.city}/{a.data.state}
            </p>
          ))}
          <details>
            <summary>Adicionar endereço</summary>
            <Form
              onSubmit={async (f) => {
                const r = await api("addresses", Object.fromEntries(f));
                refresh();
                return r;
              }}
            >
              <Field name="label" label="Nome do endereço" />
              <Field name="recipient" label="Destinatário" />
              <Field name="street" label="Rua" />
              <div className="form-row">
                <Field name="number" label="Número" />
                <Field name="zip" label="CEP (8 números)" pattern="[0-9]{8}" />
              </div>
              <div className="form-row">
                <Field name="city" label="Cidade" />
                <Field name="state" label="UF" minLength={2} maxLength={2} />
              </div>
            </Form>
          </details>
        </section>
        <section className="panel">
          <h2>
            <Bell size={19} /> Atualizações
          </h2>
          <button
            className="text-button"
            onClick={async () => {
              await api("notifications/read", {});
              refresh();
            }}
          >
            Marcar notificações como lidas
          </button>
          {data?.notifications.length ? (
            data.notifications.map((n: Item) => (
              <div className="notification" key={n.id}>
                {n.body}
                <small>{date(n.created_at)}</small>
              </div>
            ))
          ) : (
            <p className="muted">Suas novidades de pedidos aparecerão aqui.</p>
          )}
          <Link href="/pedidos" className="button outline">
            Meus pedidos e boosters
          </Link>
        </section>
        <section className="panel">
          <h2>Abra sua vitrine</h2>
          <p>
            Compradores também podem vender. No sandbox, use apenas dados
            fictícios.
          </p>
          {user.role === "user" ? (
            <Form
              label="Ativar vendedor sandbox"
              onSubmit={async (f) => {
                const r = await api("seller/activate", {
                  legalName: val(f, "legalName"),
                  document: val(f, "document"),
                });
                reload();
                return r;
              }}
            >
              <Field name="legalName" label="Nome legal fictício" />
              <Field
                name="document"
                label="CPF/CNPJ fictício (11 ou 14 dígitos)"
                pattern="[0-9]{11}|[0-9]{14}"
              />
            </Form>
          ) : (
            <Link className="button primary" href="/vender">
              Central do vendedor <ArrowRight size={16} />
            </Link>
          )}
          {user.role === "admin" && (
            <Link href="/admin" className="button outline">
              Painel administrativo
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
function Orders({ user }: any) {
  const { data, error } = useData("orders");
  return (
    <div className="container page">
      <Breadcrumb label="Meus pedidos" />
      <h1>Da descoberta à sua coleção.</h1>
      <p>Pedidos, boosters e envios. Operações atuais são de demonstração.</p>
      <Status data={data} error={error} />
      {data?.length === 0 ? (
        <Empty text="Sua primeira descoberta está esperando.">
          <Link href="/explorar">Explorar coleção</Link>
        </Empty>
      ) : (
        data?.map((o: Item) => (
          <Link href={"/pedido/" + o.id} className="panel order-row" key={o.id}>
            <Package />
            <div>
              <b>Pedido #{o.id.slice(0, 8)}</b>
              <small>
                {date(o.created_at)} ·{" "}
                {o.perspective === "buyer" ? "Sua compra" : "Sua venda"}
              </small>
            </div>
            <span className="badge">{statusLabel(o.status)}</span>
            <strong>{brl(o.total)}</strong>
            <ChevronRight size={17} />
          </Link>
        ))
      )}
    </div>
  );
}
const statusLabel = (s: string) =>
  ({
    pending: "Aguardando pagamento",
    paid: "Pago · sandbox",
    expired: "Reserva expirada",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    partially_refunded: "Reembolso parcial",
    late_payment: "Pagamento tardio · estornado",
    preparing: "Em separação",
    shipped: "Postado",
    delivered: "Entregue",
  })[s] || s;
function Order({ id, user, action }: any) {
  const { data, error, reload } = useData("orders/" + id);
  if (!data)
    return (
      <div className="container page">
        <Status data={data} error={error} />
      </div>
    );
  const { order: o, items, results, suborders, messages } = data;
  const isBuyer = o.buyer_id === user?.id;
  const paid = ["paid", "partially_refunded", "refunded"].includes(o.status);
  return (
    <div className="container page">
      <Breadcrumb label={"Pedido #" + id.slice(0, 8)} />
      <div className="page-title">
        <div>
          <span className="eyebrow accent">
            CADA DESCOBERTA, UMA NOVA HISTÓRIA
          </span>
          <h1>Pedido #{id.slice(0, 8)}</h1>
          <p>{date(o.created_at)}</p>
        </div>
        <span className="badge">{statusLabel(o.status)}</span>
      </div>
      <div className="checkout-grid">
        <div>
          <section className="panel">
            <h2>Seus itens</h2>
            {items.map((i: Item) => (
              <div className="order-item" key={i.id}>
                <div>
                  <b>{i.snapshot.title}</b>
                  {user?.role === "admin" && (
                    <small>ID para reembolso: {i.id}</small>
                  )}
                  <small>
                    {i.quantity} × {brl(i.unit_price)} · {i.seller_name}
                  </small>
                  <small>
                    {statusLabel(i.shipment_status)}{" "}
                    {i.tracking ? " · " + i.tracking : ""}
                  </small>
                </div>
                <strong>{brl(i.subtotal)}</strong>
              </div>
            ))}
            {suborders.map((s: Item) => (
              <div className="shipping" key={s.id}>
                <p>
                  <Truck size={16} />
                  Remessa #{s.id} · {statusLabel(s.status)}{" "}
                  {s.tracking && "· " + s.tracking}
                </p>
                {!isBuyer && (
                  <Form
                    label="Atualizar envio sandbox"
                    onSubmit={async (f) => {
                      const r = await api("shipments", {
                        suborderId: s.id,
                        status: val(f, "status"),
                        tracking: val(f, "tracking"),
                      });
                      reload();
                      return r;
                    }}
                  >
                    <Select
                      name="status"
                      label="Situação"
                      options={["preparing", "shipped"]}
                    />
                    <Field
                      name="tracking"
                      label="Rastreio ou referência de separação"
                      value={s.tracking || ""}
                    />
                  </Form>
                )}
              </div>
            ))}
            {isBuyer && paid && (
              <button
                className="button outline"
                onClick={() =>
                  action(async () => {
                    await api("delivery", { orderId: id });
                    reload();
                  }, "Entrega confirmada.")
                }
              >
                Confirmar recebimento de todas as remessas
              </button>
            )}
          </section>
          {paid && results.length > 0 && (
            <section className="panel reveal-panel">
              <span className="eyebrow accent">
                SEU BOOSTER, SUA DESCOBERTA
              </span>
              <h2>
                {isBuyer
                  ? "O universo está nas suas mãos."
                  : "Lista exata para separação"}
              </h2>
              <p>
                Cartas atribuídas pelo servidor. Reabrir nunca altera o
                resultado.
              </p>
              {isBuyer && (
                <button
                  className="button outline"
                  onClick={() =>
                    action(async () => {
                      await api("boosters/reveal", {
                        resultId: results[0].id,
                        all: true,
                      });
                      reload();
                    }, "Todas as cartas reveladas.")
                  }
                >
                  Pular animação e revelar todas
                </button>
              )}
              <div className="reveal-grid">
                {results.map((r: Item) => (
                  <button
                    key={r.id}
                    className={
                      "reveal-card " +
                      (r.revealed || !isBuyer ? "revealed" : "")
                    }
                    disabled={!isBuyer || r.revealed}
                    onClick={() =>
                      action(async () => {
                        await api("boosters/reveal", { resultId: r.id });
                        reload();
                      }, "Carta revelada.")
                    }
                    aria-label={
                      r.revealed ? r.snapshot.name : "Revelar próxima carta"
                    }
                  >
                    {r.revealed || !isBuyer ? (
                      <>
                        <img
                          src={r.snapshot.photo || r.snapshot.art}
                          alt={r.snapshot.name}
                        />
                        <b>{r.snapshot.name}</b>
                        <small>
                          {r.snapshot.condition} · {r.snapshot.rarity}
                        </small>
                      </>
                    ) : (
                      <>
                        <span className="card-back">
                          n<Sparkles size={30} />
                        </span>
                        <b>Clique para revelar</b>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <h2>Conversa do pedido</h2>
            <p className="small muted">
              Visível para comprador, vendedores deste pedido e administração.
            </p>
            {messages.map((m: Item) => (
              <div
                className={"message " + (m.author_id === user?.id ? "own" : "")}
                key={m.id}
              >
                <b>{m.name}</b>
                <p>{m.body}</p>
                <small>{date(m.created_at)}</small>
              </div>
            ))}
            <Form
              label="Enviar mensagem"
              onSubmit={async (f) => {
                const r = await api("messages", {
                  orderId: id,
                  body: val(f, "body"),
                });
                reload();
                return r;
              }}
            >
              <Field name="body" label="Sua mensagem" maxLength={2000} />
            </Form>
          </section>
        </div>
        <aside>
          <section className="panel summary">
            <h2>Resumo do pedido</h2>
            <div className="sum-row">
              <span>Produtos</span>
              <b>{brl(o.subtotal)}</b>
            </div>
            <div className="sum-row">
              <span>Frete</span>
              <b>{brl(o.shipping)}</b>
            </div>
            <div className="sum-row total">
              <span>Total</span>
              <b>{brl(o.total)}</b>
            </div>
            <p className="small muted">
              Comissão de {brl(o.commission)} incluída nos produtos e descontada
              do vendedor. Taxa de pagamento sandbox: R$ 0,00.
            </p>
            {o.refunded > 0 && <p>Reembolsado: {brl(o.refunded)}</p>}
            {o.status === "pending" && isBuyer && (
              <div className="sandbox-payment">
                <b>
                  <Lock size={16} /> Simulador de pagamento
                </b>
                <p>
                  Reserva válida até {date(o.expires_at)}. Não informe cartão
                  nem realize Pix.
                </p>
                <button
                  className="button primary"
                  onClick={() =>
                    action(async () => {
                      await api("payments/simulate", {
                        orderId: id,
                        status: "approved",
                      });
                      reload();
                    }, "Pagamento sandbox confirmado.")
                  }
                >
                  Simular pagamento aprovado
                </button>
                <button
                  className="button outline"
                  onClick={() =>
                    action(async () => {
                      await api("payments/simulate", {
                        orderId: id,
                        status: "failed",
                      });
                      reload();
                    }, "Compra cancelada; estoque liberado.")
                  }
                >
                  Simular falha / cancelar
                </button>
              </div>
            )}
            <h4>Endereço registrado</h4>
            <p>
              {o.address_snapshot.recipient}
              <br />
              {o.address_snapshot.street}, {o.address_snapshot.number}
              <br />
              {o.address_snapshot.city}/{o.address_snapshot.state}
            </p>
          </section>
          {isBuyer && (
            <section className="panel">
              <details>
                <summary>Informar um problema</summary>
                <Form
                  label="Abrir disputa"
                  onSubmit={async (f) => {
                    const file = f.get("evidence") as File;
                    return api("reports", {
                      orderId: id,
                      reason: val(f, "reason"),
                      evidence: file?.size ? [await upload(file)] : [],
                    });
                  }}
                >
                  <Field
                    name="reason"
                    label="O que aconteceu?"
                    minLength={10}
                  />
                  <Field
                    name="evidence"
                    label="Foto de evidência (opcional)"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    required={false}
                  />
                </Form>
              </details>
              {suborders.map(
                (s: Item) =>
                  s.status === "delivered" && (
                    <details key={s.id}>
                      <summary>
                        Avaliar vendedor #{s.seller_id.slice(0, 8)}
                      </summary>
                      <Form
                        label="Publicar avaliação"
                        onSubmit={(f) =>
                          api("reviews", {
                            orderId: id,
                            sellerId: s.seller_id,
                            rating: num(f, "rating"),
                            body: val(f, "body"),
                          })
                        }
                      >
                        <Select
                          name="rating"
                          label="Nota"
                          options={["5", "4", "3", "2", "1"]}
                        />
                        <Field
                          name="body"
                          label="Conte como foi"
                          required={false}
                        />
                      </Form>
                    </details>
                  ),
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
function Affiliates({ action }: any) {
  const { data, error } = useData("affiliates");
  return (
    <div className="container page">
      <Breadcrumb label="Achados parceiros" />
      <div className="page-title">
        <div>
          <span className="eyebrow accent">ALÉM DO NOSSO UNIVERSO</span>
          <h1>Achados de parceiros.</h1>
          <p>
            Ofertas externas, escolhidas manualmente. A compra acontece na
            plataforma indicada.
          </p>
        </div>
        <ExternalLink size={36} />
      </div>
      <div className="notice">
        Links de afiliado podem gerar comissão para o Nexo. Preço e
        disponibilidade devem ser confirmados na loja de destino. Ofertas
        externas não entram no carrinho.
      </div>
      <Status data={data} error={error} />
      {data?.length === 0 ? (
        <Empty text="Novos achados estão a caminho.">
          <p>Ainda não há links de afiliado autorizados publicados.</p>
        </Empty>
      ) : (
        <div className="product-grid">
          {data?.map((a: Item) => (
            <article className="panel affiliate-card" key={a.id}>
              <img src={a.image} alt={a.title} />
              <span className="eyebrow accent">
                {a.platform} · LINK DE AFILIADO
              </span>
              <h2>{a.title}</h2>
              <p>{a.description}</p>
              <p>
                {a.external_seller} · {a.franchise}
              </p>
              {a.reference_price && (
                <strong>
                  {brl(a.reference_price)} <small>referência</small>
                </strong>
              )}
              <small>Atualizado em {date(a.updated_at)}</small>
              <a
                className="button primary"
                href={a.url}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                onClick={() => {
                  api("affiliates/click", { id: a.id }).catch(() => {});
                }}
              >
                Comprar na {a.platform}
                <ArrowUpRight size={16} />
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
function Boosters({ add }: any) {
  const { data, error } = useData("boosters");
  return (
    <div className="container page">
      <Breadcrumb label="Boosters personalizados" />
      <div className="booster-banner small-banner">
        <div>
          <span className="eyebrow">DESCOBERTAS EM CADA PACOTE</span>
          <h1>Abra novas possibilidades.</h1>
          <p>
            Composição garantida, estoque exclusivo e revelação no site.
            <br />
            Experiência de demonstração, sem cobrança ou envio real.
          </p>
        </div>
        <Sparkles size={80} />
      </div>
      <div className="notice">
        <ShieldCheck size={20} />
        Venda real de boosters desativada até validação jurídica e aceitação
        expressa do provedor de pagamentos. Nenhuma promessa de retorno
        financeiro.
      </div>
      <Status data={data} error={error} />
      <div className="booster-grid">
        {data?.map((c: Item) => (
          <article className="panel booster-product" key={c.id}>
            <div className="pack-stage">
              <div className="pack-art">
                <span>NEXO</span>
                <Sparkles size={54} />
                <b>{c.title.replace("Booster ", "").toUpperCase()}</b>
                <small>DEMONSTRAÇÃO</small>
              </div>
            </div>
            <div>
              <span className="eyebrow accent">{c.seller_name} · SANDBOX</span>
              <h2>{c.title}</h2>
              <p>{c.description}</p>
              <h4>O que vem no seu pacote</h4>
              {c.groups.map((r: Item) => (
                <div className="sum-row" key={r.group}>
                  <span>
                    {r.count} × grupo {r.group}
                  </span>
                  <b>{r.stock} no estoque</b>
                </div>
              ))}
              <p className="small">
                Seleção uniforme sem reposição dentro de cada grupo.
                Probabilidade de cada unidade disponível: quantidade do grupo no
                pacote ÷ unidades disponíveis no grupo, antes da reserva.
              </p>
              <p className="notice">
                {c.expected === null
                  ? "Sem referência confiável: não é possível estimar valor médio. Valores declarados pelo vendedor não são cotação."
                  : `Valor médio estimado: ${brl(c.expected)}. Não é garantia de valor recebido nem lucro.`}
              </p>
              <span className="small">
                Versão {c.version} · até {c.capacity} pacotes com o estoque
                atual
              </span>
              <div className="product-bottom">
                <strong>{brl(c.price)}</strong>
                <button
                  className="button primary"
                  disabled={!c.capacity}
                  onClick={() =>
                    add({
                      id: c.id,
                      kind: "campaign",
                      title: c.title,
                      price: c.price,
                      quantity: 1,
                      image: "/art/eclipse.svg",
                      seller: c.seller_name,
                      version: c.version,
                      stockToken: c.stockToken,
                    })
                  }
                >
                  Experimentar booster <Plus size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <Link className="button outline" href="/pedidos">
        Meus boosters e resultados <ArrowRight size={16} />
      </Link>
    </div>
  );
}
function SellerDashboard({ user, action }: any) {
  const [tab, setTab] = useState("listings"),
    [editing, setEditing] = useState<Item | null>(null);
  const { data: listings, error, reload } = useData("listings");
  const { data: editions } = useData("editions");
  const { data: campaigns, reload: refreshCampaigns } = useData("campaigns");
  const { data: ledger } = useData("ledger");
  if (!user)
    return (
      <div className="container page">
        <Empty text="Entre para abrir sua vitrine.">
          <Link className="button primary" href="/conta">
            Entrar ou criar conta
          </Link>
        </Empty>
      </div>
    );
  if (user.role === "user")
    return (
      <div className="container page">
        <Empty text="Vamos preparar sua vitrine?">
          <Link href="/conta" className="button primary">
            Ativar vendedor sandbox
          </Link>
        </Empty>
      </div>
    );
  return (
    <div className="container page">
      <Breadcrumb label="Central do vendedor" />
      <div className="page-title">
        <div>
          <span className="eyebrow accent">
            DE COLECIONADOR PARA COLECIONADOR
          </span>
          <h1>Sua vitrine, novas conexões.</h1>
          <p>
            Comissão de 5% sobre produtos. Frete separado. Todas as operações
            são sandbox.
          </p>
        </div>
        {!user.verified && (
          <button
            className="button outline"
            onClick={async () => {
              await api("auth/resend", {});
              alert("Verificação enviada. No demo, consulte .data/outbox.");
            }}
          >
            Reenviar verificação
          </button>
        )}
        <Link className="button outline" href={"/vendedor/" + user.id}>
          Ver minha vitrine <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="tabs">
        {[
          ["listings", "Meus anúncios"],
          ["new", "Criar anúncio"],
          ["boosters", "Meus boosters"],
          ["ledger", "Extrato sandbox"],
        ].map(([k, l]) => (
          <button
            className={tab === k ? "selected" : ""}
            key={k}
            onClick={() => {
              if (k === "new") setEditing(null);
              setTab(k);
            }}
          >
            {l}
          </button>
        ))}
        <Link href="/pedidos">Pedidos e envios ↗</Link>
      </div>
      {tab === "listings" && (
        <>
          <Status data={listings} error={error} />
          {listings?.length === 0 && (
            <Empty text="Seu primeiro anúncio está a um passo." />
          )}
          {listings?.map((l: Item) => (
            <div className="panel listing-row" key={l.id}>
              <img src={l.photos[0]} alt={l.title} />
              <div>
                <h3>{l.title}</h3>
                <small>
                  {l.stock} unidades livres · {l.status} · {brl(l.price)}
                </small>
              </div>
              <button
                className="button outline"
                onClick={() => {
                  setEditing(l);
                  setTab("new");
                }}
              >
                Editar / pausar / encerrar
              </button>
            </div>
          ))}
        </>
      )}
      {tab === "new" && (
        <div className="panel narrow">
          <h2>
            {editing ? "Editar anúncio" : "Conte a história do seu exemplar"}
          </h2>
          <p>
            Use fotos próprias do produto real ou ilustrações autorizadas.
            Valores em centavos.
          </p>
          <Form
            key={editing?.id || "new"}
            label="Salvar anúncio"
            onSubmit={async (f) => {
              const file = f.get("photo") as File;
              const photo = file?.size
                ? await upload(file)
                : editing?.photos[0] || val(f, "demoArt");
              const r = await api(
                "listings",
                {
                  id: editing?.id,
                  editionId: val(f, "editionId"),
                  title: val(f, "title"),
                  description: val(f, "description"),
                  condition: val(f, "condition"),
                  grading: val(f, "grading"),
                  price: num(f, "price"),
                  stock: num(f, "stock"),
                  status: val(f, "status"),
                  photos: [photo],
                },
                editing ? "PATCH" : "POST",
              );
              reload();
              return r;
            }}
          >
            <label className="field">
              Carta, edição e variante
              <select name="editionId" defaultValue={editing?.edition_id}>
                {editions?.map((e: Item) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.collection} · {e.code} · {e.language} ·{" "}
                    {e.finish}
                  </option>
                ))}
              </select>
            </label>
            <Field
              name="title"
              label="Título do anúncio"
              value={editing?.title}
            />
            <label className="field">
              Descrição
              <textarea
                name="description"
                required
                minLength={10}
                maxLength={3000}
                defaultValue={editing?.description}
              />
            </label>
            <div className="form-row">
              <Select
                name="condition"
                label="Conservação"
                options={["NM", "LP", "MP", "HP", "DMG", "Novo", "Usado"]}
                value={editing?.condition}
              />
              <Field
                name="grading"
                label="Graduação / certificadora"
                value={editing?.grading}
                required={false}
              />
            </div>
            <div className="form-row">
              <Field
                name="price"
                label="Preço em centavos (10000 = R$ 100)"
                type="number"
                min={1}
                step={1}
                value={editing?.price}
              />
              <Field
                name="stock"
                label="Quantidade disponível"
                type="number"
                min={0}
                step={1}
                value={editing?.stock ?? 1}
              />
            </div>
            <Select
              name="status"
              label="Situação"
              options={["active", "paused", "closed"]}
              value={editing?.status}
            />
            <Field
              name="photo"
              label="Foto do exemplar (até 1 MB)"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required={false}
            />
            <Select
              name="demoArt"
              label="Ou arte autorizada de demonstração"
              options={[
                "/art/aurora.svg",
                "/art/samurai.svg",
                "/art/kitsune.svg",
                "/art/eclipse.svg",
                "/art/mecha.svg",
              ]}
            />
            <label className="checkbox">
              <input type="checkbox" required />
              Tenho autorização para usar a imagem e confirmo a quantidade
              física.
            </label>
          </Form>
        </div>
      )}
      {tab === "boosters" && (
        <>
          <div className="notice">
            Estoque exclusivo da campanha. Não cadastre a mesma unidade física
            em outro anúncio. A composição publicada é preservada.
          </div>
          {campaigns?.map((c: Item) => (
            <div className="panel listing-row" key={c.id}>
              <Sparkles />
              <div>
                <h3>{c.title}</h3>
                <p>
                  {c.status} · versão {c.version} · {c.inventory.length}{" "}
                  unidades físicas
                </p>
                <small>
                  {c.rules
                    .map((r: Item) => `${r.count} ${r.group}`)
                    .join(" + ")}
                </small>
              </div>
            </div>
          ))}
          <CampaignEditor
            editions={editions || []}
            onSaved={refreshCampaigns}
          />
        </>
      )}
      {tab === "ledger" && (
        <section className="panel">
          <h2>Extrato demonstrativo</h2>
          <p>
            Registros contábeis, sem saldo sacável ou custódia própria.
            Disponibilidade real dependerá da conciliação e liquidação do
            provedor.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Situação</th>
                  <th>Produtos</th>
                  <th>Comissão</th>
                  <th>Estorno produto / comissão</th>
                  <th>Líquido produtos</th>
                </tr>
              </thead>
              <tbody>
                {ledger?.map((l: Item) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={"/pedido/" + l.order_id}>
                        {l.order_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>
                      {statusLabel(l.payment_status)} ·{" "}
                      {l.status === "delivered"
                        ? "Entrega concluída; liquidação não confirmada"
                        : "Pendente de liquidação"}
                    </td>
                    <td>{brl(l.subtotal)}</td>
                    <td>{brl(l.commission)}</td>
                    <td>
                      {brl(l.refunded)} / {brl(l.commission_reversed)}
                    </td>
                    <td>
                      {brl(
                        l.subtotal -
                          l.commission -
                          l.refunded +
                          l.commission_reversed,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledger?.length === 0 && (
            <Empty text="Nenhum lançamento sandbox ainda." />
          )}
          <p className="small">
            Frete por remessa: R$ 15 demonstrativos. Taxas sandbox: R$ 0,00,
            separadas da comissão.
          </p>
        </section>
      )}
    </div>
  );
}
function CampaignEditor({
  editions,
  onSaved,
}: {
  editions: Item[];
  onSaved: () => void;
}) {
  const [inventory, setInventory] = useState([
    {
      editionId: "forest-pt",
      group: "comum",
      quantity: 10,
      condition: "NM",
      photo: "/art/forest.svg",
      declaredValue: 1000,
      referenceValue: null as number | null,
      referenceSource: null as string | null,
      referenceDate: null as string | null,
    },
    {
      editionId: "kitsune-pt",
      group: "rara",
      quantity: 2,
      condition: "NM",
      photo: "/art/kitsune.svg",
      declaredValue: 5000,
      referenceValue: null as number | null,
      referenceSource: null as string | null,
      referenceDate: null as string | null,
    },
  ]);
  const [common, setCommon] = useState(5),
    [rare, setRare] = useState(1),
    [price, setPrice] = useState(3990),
    [preview, setPreview] = useState(false);
  const rules = [
    { group: "comum", count: common },
    { group: "rara", count: rare },
  ];
  const count = Math.min(
    ...rules.map((r) =>
      Math.floor(
        inventory
          .filter((i) => i.group === r.group)
          .reduce((s, i) => s + i.quantity, 0) / r.count,
      ),
    ),
  );
  const expected = expectedValue(
    rules,
    inventory.flatMap((i) =>
      Array.from(
        { length: i.quantity > 0 ? Math.min(i.quantity, 100) : 0 },
        () => ({ group_name: i.group, reference_value: i.referenceValue }),
      ),
    ),
  );
  function update(index: number, key: string, value: any) {
    setInventory((v) =>
      v.map((x, i) => (i === index ? { ...x, [key]: value } : x)),
    );
    setPreview(false);
  }
  return (
    <section className="panel">
      <h2>Crie um booster de demonstração</h2>
      <p>
        Garantias por grupo, unidades físicas exclusivas e preço confirmado por
        você.
      </p>
      <Form
        label="Salvar campanha sandbox"
        onSubmit={async (f) => {
          if (!preview)
            throw new Error("Visualize a simulação antes de salvar.");
          const r = await api("campaigns", {
            title: val(f, "title"),
            description: val(f, "description"),
            price,
            rules,
            inventory,
            publish: val(f, "publish") === "on",
          });
          onSaved();
          return {
            message: `Campanha salva. Capacidade: ${r.capacity} pacotes.`,
          };
        }}
      >
        <div className="form-row">
          <Field name="title" label="Nome do booster" />
          <Field
            name="description"
            label="Descrição e condições"
            minLength={10}
          />
        </div>
        <div className="form-row">
          <label className="field">
            Comuns por pacote
            <input
              type="number"
              min={1}
              max={20}
              value={common}
              onChange={(e) => {
                setCommon(Number(e.target.value));
                setPreview(false);
              }}
            />
          </label>
          <label className="field">
            Raras por pacote
            <input
              type="number"
              min={1}
              max={20}
              value={rare}
              onChange={(e) => {
                setRare(Number(e.target.value));
                setPreview(false);
              }}
            />
          </label>
          <label className="field">
            Preço confirmado em centavos
            <input
              type="number"
              min={1}
              step={1}
              value={price}
              onChange={(e) => {
                setPrice(Number(e.target.value));
                setPreview(false);
              }}
            />
          </label>
        </div>
        <h3>Estoque físico exclusivo</h3>
        {inventory.map((i, n) => (
          <div className="inventory-line" key={n}>
            <label className="field">
              Edição
              <select
                value={i.editionId}
                onChange={(e) => update(n, "editionId", e.target.value)}
              >
                {editions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.code}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label className="field">
                Grupo
                <select
                  value={i.group}
                  onChange={(e) => update(n, "group", e.target.value)}
                >
                  <option>comum</option>
                  <option>rara</option>
                </select>
              </label>
              <label className="field">
                Quantidade real
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={i.quantity}
                  onChange={(e) =>
                    update(n, "quantity", Number(e.target.value))
                  }
                />
              </label>
              <label className="field">
                Conservação
                <select
                  value={i.condition}
                  onChange={(e) => update(n, "condition", e.target.value)}
                >
                  {["NM", "LP", "MP", "HP", "DMG"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Valor declarado (centavos)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={i.declaredValue}
                  onChange={(e) =>
                    update(n, "declaredValue", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Referência (centavos, opcional)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={i.referenceValue ?? ""}
                  onChange={(e) =>
                    update(
                      n,
                      "referenceValue",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </label>
              <label className="field">
                Fonte da referência
                <input
                  value={i.referenceSource || ""}
                  onChange={(e) =>
                    update(n, "referenceSource", e.target.value || null)
                  }
                />
              </label>
              <label className="field">
                Data da referência
                <input
                  type="date"
                  value={i.referenceDate || ""}
                  onChange={(e) =>
                    update(n, "referenceDate", e.target.value || null)
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                Foto própria ou autorizada
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    try {
                      if (e.target.files?.[0])
                        update(n, "photo", await upload(e.target.files[0]));
                    } catch (err) {
                      alert((err as Error).message);
                    }
                  }}
                />
              </label>
              <img
                className="inventory-thumb"
                src={i.photo}
                alt="Foto da unidade"
              />
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setInventory((v) => v.filter((_, idx) => idx !== n));
                  setPreview(false);
                }}
              >
                Remover linha
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="button outline"
          onClick={() => {
            setInventory((v) => [...v, { ...v[0], quantity: 1 }]);
            setPreview(false);
          }}
          disabled={!inventory.length}
        >
          Adicionar carta <Plus size={16} />
        </button>
        <button
          type="button"
          className="button outline"
          onClick={() => setPreview(true)}
        >
          Simular configuração sem compra
        </button>
        {preview && (
          <div className="simulation">
            <b>SIMULAÇÃO · {Math.max(0, count)} pacotes possíveis</b>
            <p>
              Garantia: {common} comuns + {rare} raras, selecionadas
              uniformemente sem reposição.
            </p>
            <p>
              Média esperada:{" "}
              {expected === null ? "sem referência confiável" : brl(expected)}.
              Sugestão de preço:{" "}
              {expected === null
                ? "indisponível sem referências completas"
                : brl(suggestedPrice(expected))}
              .
            </p>
            <p>
              Preço confirmado: {brl(price)} · Comissão:{" "}
              {brl(
                platformCommission(
                  Number.isInteger(price) && price >= 0 ? price : 0,
                ),
              )}{" "}
              · Recebimento estimado:{" "}
              {brl(
                price -
                  platformCommission(
                    Number.isInteger(price) && price >= 0 ? price : 0,
                  ),
              )}
              , antes de taxas reais. Taxa sandbox: zero.
            </p>
            <small>
              Média não garante valor recebido e não representa custo ou lucro.
              A simulação não reserva estoque.
            </small>
          </div>
        )}
        <label className="checkbox">
          <input type="checkbox" name="publish" />
          Publicar em demonstração
        </label>
        <label className="checkbox">
          <input type="checkbox" required />
          Confirmo o preço e a exclusividade física do estoque.
        </label>
      </Form>
    </section>
  );
}
function Admin({ user, action }: any) {
  const [section, setSection] = useState("metrics");
  const { data, error, reload } = useData("admin/" + section);
  if (user?.role !== "admin")
    return (
      <div className="container page">
        <Empty text="Área restrita à administração.">
          <Link href="/conta">Entrar com conta autorizada</Link>
        </Empty>
      </div>
    );
  return (
    <div className="container page">
      <Breadcrumb label="Administração" />
      <h1>Cuidando de cada conexão.</h1>
      <p>
        Painel de demonstração. Ações sensíveis autorizadas no servidor e
        auditadas.
      </p>
      <div className="tabs admin-tabs">
        {[
          ["metrics", "Visão geral"],
          ["users", "Usuários"],
          ["catalog", "Catálogo"],
          ["listings", "Moderação"],
          ["affiliates", "Afiliados"],
          ["campaigns", "Boosters"],
          ["orders", "Pedidos"],
          ["payments", "Pagamentos"],
          ["reconcile", "Conciliação"],
          ["refunds", "Reembolsos"],
          ["disputes", "Disputas"],
          ["audit", "Auditoria"],
        ].map(([k, l]) => (
          <button
            className={section === k ? "selected" : ""}
            onClick={() => setSection(k)}
            key={k}
          >
            {l}
          </button>
        ))}
      </div>
      <Status data={data} error={error} />
      {section === "metrics" && data && (
        <>
          <div className="metric-grid">
            <div className="panel">
              <small>Vendas internas sandbox</small>
              <strong>{data.internal[0].orders}</strong>
              <span>{brl(data.internal[0].products)} em produtos</span>
            </div>
            <div className="panel">
              <small>Comissões internas registradas</small>
              <strong>{brl(data.internal[0].commission)}</strong>
              <span>Estornos discriminados no extrato</span>
            </div>
            <div className="panel">
              <small>Cliques externos</small>
              <strong>{data.external[0].clicks}</strong>
              <span>Nenhuma conversão externa confirmada</span>
            </div>
          </div>
          <p className="notice">{data.note}</p>
        </>
      )}
      {Array.isArray(data) && (
        <div>
          {data.length === 0 && <Empty text="Nenhum registro nesta seção." />}
          {data.map((r: Item, i: number) => (
            <article className="panel admin-record" key={r.id || i}>
              <div>
                <h3>{r.name || r.title || r.action || r.id}</h3>
                <p className="small muted">
                  {r.id} {r.created_at && "· " + date(r.created_at)}
                </p>
                {section === "users" && (
                  <p>
                    {r.email} · {r.role} · {r.suspended ? "Suspenso" : "Ativo"}
                  </p>
                )}
                {section === "listings" && (
                  <p>
                    {brl(r.price)} · {r.stock} unidades · {r.status}
                  </p>
                )}
                {section === "orders" && (
                  <>
                    <p>
                      {statusLabel(r.status)} · {brl(r.total)} · Comissão{" "}
                      {brl(r.commission)}
                    </p>
                    <Link href={"/pedido/" + r.id}>Abrir pedido</Link>
                  </>
                )}
                {section === "affiliates" && (
                  <p>
                    {r.platform} · {r.active ? "Publicado" : "Inativo"} ·{" "}
                    {r.url}
                  </p>
                )}
                {section === "campaigns" && (
                  <p>
                    {r.status} · versão {r.version} · {JSON.stringify(r.rules)}
                  </p>
                )}
                {section === "disputes" && (
                  <>
                    <p>
                      {r.reason} · {r.status}
                    </p>
                    {r.evidence?.map((url: string, n: number) => (
                      <img
                        className="inventory-thumb"
                        src={url}
                        alt="Evidência"
                        key={n}
                      />
                    ))}
                  </>
                )}
                {[
                  "audit",
                  "payments",
                  "refunds",
                  "catalog",
                  "reconcile",
                ].includes(section) && <pre>{JSON.stringify(r, null, 2)}</pre>}
              </div>
              <div className="record-actions">
                {section === "users" && r.id !== user.id && (
                  <Form
                    label="Atualizar acesso"
                    onSubmit={async (f) => {
                      const result = await api("admin/users", {
                        id: r.id,
                        role: val(f, "role"),
                        suspended: val(f, "suspended") === "on",
                      });
                      reload();
                      return result;
                    }}
                  >
                    <Select
                      name="role"
                      label="Permissão"
                      options={["user", "seller", "admin"]}
                      value={r.role}
                    />
                    <label className="checkbox">
                      <input
                        name="suspended"
                        type="checkbox"
                        defaultChecked={r.suspended}
                      />
                      Suspender
                    </label>
                  </Form>
                )}
                {section === "listings" && (
                  <Form
                    label="Aplicar moderação"
                    onSubmit={async (f) => {
                      const result = await api("admin/listings", {
                        id: r.id,
                        status: val(f, "status"),
                      });
                      reload();
                      return result;
                    }}
                  >
                    <Select
                      name="status"
                      label="Situação"
                      options={["active", "paused", "closed", "pending"]}
                      value={r.status}
                    />
                  </Form>
                )}
                {section === "campaigns" && (
                  <button
                    className="button outline"
                    onClick={() =>
                      action(async () => {
                        await api("admin/campaigns", {
                          id: r.id,
                          status: r.status === "active" ? "paused" : "active",
                        });
                        reload();
                      }, "Campanha atualizada.")
                    }
                  >
                    {r.status === "active" ? "Pausar" : "Ativar"}
                  </button>
                )}
                {section === "disputes" && (
                  <Form
                    label="Atualizar disputa"
                    onSubmit={async (f) => {
                      const result = await api("admin/disputes", {
                        id: r.id,
                        status: val(f, "status"),
                      });
                      reload();
                      return result;
                    }}
                  >
                    <Select
                      name="status"
                      label="Situação"
                      options={["open", "reviewing", "resolved"]}
                      value={r.status}
                    />
                  </Form>
                )}
                {section === "affiliates" && (
                  <details>
                    <summary>Editar oferta</summary>
                    <AffiliateForm existing={r} reload={reload} />
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {section === "affiliates" && (
        <section className="panel">
          <h2>Cadastrar oferta autorizada</h2>
          <AffiliateForm reload={reload} />
        </section>
      )}
      {section === "catalog" && (
        <section className="panel">
          <h2>Nova identidade de carta e edição</h2>
          <Form
            label="Adicionar ao catálogo"
            onSubmit={async (f) => {
              const result = await api("admin/catalog", Object.fromEntries(f));
              reload();
              return result;
            }}
          >
            <div className="form-row">
              <Field name="name" label="Nome da carta / produto" />
              <Field name="franchise" label="Franquia" />
              <Select
                name="productType"
                label="Tipo"
                options={[
                  "Carta avulsa",
                  "Lote",
                  "Deck",
                  "Produto lacrado",
                  "Figure",
                  "Pelúcia",
                  "Acessório",
                  "Outro",
                ]}
              />
            </div>
            <div className="form-row">
              <Field name="collection" label="Coleção" />
              <Field name="code" label="Número / código" />
              <Field name="rarity" label="Raridade" />
            </div>
            <div className="form-row">
              <Field name="language" label="Idioma" value="Português" />
              <Field name="finish" label="Acabamento" />
              <Select
                name="art"
                label="Ilustração original demo"
                options={[
                  "/art/aurora.svg",
                  "/art/sakura.svg",
                  "/art/forest.svg",
                ]}
              />
            </div>
          </Form>
        </section>
      )}
      {section === "refunds" && (
        <section className="panel">
          <h2>Reembolso de produto sandbox</h2>
          <p>
            Use o ID do item exibido no pedido ao administrador. Comissão
            revertida proporcionalmente.
          </p>
          <Form
            label="Registrar reembolso sandbox"
            onSubmit={async (f) => {
              const result = await api(
                val(f, "scope") === "frete" ? "refunds/shipping" : "refunds",
                {
                  [val(f, "scope") === "frete" ? "suborderId" : "itemId"]: val(
                    f,
                    "itemId",
                  ),
                  amount: num(f, "amount"),
                  key: val(f, "key"),
                },
              );
              reload();
              return result;
            }}
          >
            <Select
              name="scope"
              label="Tipo de estorno"
              options={["produto", "frete"]}
            />
            <Field name="itemId" label="ID do item ou da remessa" />
            <Field
              name="amount"
              label="Valor em centavos"
              type="number"
              min={1}
              step={1}
            />
            <Field
              name="key"
              label="Chave única de idempotência"
              value={crypto.randomUUID()}
            />
          </Form>
        </section>
      )}
    </div>
  );
}
function AffiliateForm({
  existing: a,
  reload,
}: {
  existing?: Item;
  reload: () => void;
}) {
  return (
    <Form
      label="Salvar oferta de afiliado"
      onSubmit={async (f) => {
        const file = f.get("photo") as File;
        const result = await api("admin/affiliates", {
          id: a?.id,
          title: val(f, "title"),
          description: val(f, "description"),
          franchise: val(f, "franchise"),
          category: val(f, "category"),
          platform: val(f, "platform"),
          externalSeller: val(f, "externalSeller"),
          url: val(f, "url"),
          image: file?.size
            ? await upload(file)
            : a?.image || "/art/sakura.svg",
          referencePrice: val(f, "referencePrice")
            ? num(f, "referencePrice")
            : null,
          active: val(f, "active") === "on",
        });
        reload();
        return result;
      }}
    >
      <div className="form-row">
        <Field name="title" label="Produto" value={a?.title} />
        <Field
          name="franchise"
          label="Franquia / personagem"
          value={a?.franchise}
        />
        <Field name="category" label="Categoria" value={a?.category} />
      </div>
      <Field name="description" label="Descrição" value={a?.description} />
      <div className="form-row">
        <Select
          name="platform"
          label="Plataforma"
          options={["Shopee", "Mercado Livre"]}
          value={a?.platform}
        />
        <Field
          name="externalSeller"
          label="Vendedor externo"
          value={a?.external_seller}
        />
      </div>
      <Field
        name="url"
        label="Link autorizado de afiliado (HTTPS)"
        type="url"
        value={a?.url}
      />
      <Field
        name="referencePrice"
        label="Preço de referência em centavos (opcional)"
        type="number"
        min={0}
        step={1}
        required={false}
        value={a?.reference_price ?? ""}
      />
      <Field
        name="photo"
        label="Imagem própria ou autorizada (até 1 MB)"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        required={false}
      />
      <label className="checkbox">
        <input type="checkbox" name="active" defaultChecked={a?.active} />
        Publicar oferta
      </label>
      <label className="checkbox">
        <input type="checkbox" required />
        Confirmo autorização do link e da imagem.
      </label>
    </Form>
  );
}
