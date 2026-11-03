"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  ShoppingBag,
  Heart,
  UserRound,
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Plus,
  Menu,
  X,
  Layers,
  Package,
  Sparkles,
  Store,
  SlidersHorizontal,
  Flame,
  Zap,
  Swords,
  Star,
  ShieldCheck,
} from "lucide-react";
const games = [
  { name: "Pokémon", note: "Cartas e coleções", icon: Zap, tone: "amber" },
  {
    name: "One Piece",
    note: "Encontre seu próximo deck",
    icon: Swords,
    tone: "red",
  },
  {
    name: "Yu-Gi-Oh!",
    note: "Prepare seu próximo duelo",
    icon: Layers,
    tone: "purple",
  },
  {
    name: "Naruto",
    note: "Explore o universo ninja",
    icon: Flame,
    tone: "orange",
  },
  {
    name: "Dragon Ball",
    note: "Cartas e colecionáveis",
    icon: Star,
    tone: "blue",
  },
];
const products = [
  ["Carta avulsa", "Cartas avulsas"],
  ["Deck", "Decks"],
  ["Lote", "Lotes de cartas"],
  ["Produto lacrado", "Produtos lacrados"],
];
const collectibles = [
  ["Figure", "Figures e miniaturas"],
  ["Pelúcia", "Pelúcias"],
  ["Acessório", "Acessórios"],
  ["Outro", "Outros colecionáveis"],
];
const typeURL = (type: string) => "/explorar?type=" + encodeURIComponent(type);
export { games, typeURL };
export default function SiteHeader({
  name,
  user,
  count,
}: {
  name: string;
  user: any;
  count: number;
}) {
  const path = usePathname(),
    params = useSearchParams();
  const query = params.toString();
  const [dropdown, setDropdown] = useState<string | null>(null),
    [mobile, setMobile] = useState(false);
  const header = useRef<HTMLElement>(null),
    drawer = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setDropdown(null);
    drawer.current?.close();
    setMobile(false);
  }, [path, query]);
  useEffect(() => {
    if (!dropdown) return;
    function outside(e: PointerEvent) {
      if (!header.current?.contains(e.target as Node)) setDropdown(null);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDropdown(null);
        document.getElementById("nav-" + dropdown)?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [dropdown]);
  useEffect(() => {
    if (!mobile) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [mobile]);
  const close = () => {
    drawer.current?.close();
    setMobile(false);
    trigger.current?.focus();
  };
  const brand = (
    <>
      <span className="brand-emblem">
        <Layers size={25} />
      </span>
      <span className="brand-name">
        {name === "Nexo TCG" ? (
          <>
            nexo<span>TCG</span>
          </>
        ) : (
          name
        )}
      </span>
    </>
  );
  return (
    <>
      <div className="demo-bar">
        <span className="demo-dot" />
        <b>Demonstração</b>
        <span>Explore a experiência. Sem cobrança ou envio real.</span>
        <Link href="/conta">
          Testar uma conta <ArrowRight size={13} />
        </Link>
      </div>
      <header className="site-header" ref={header}>
        <div className="container utility-bar">
          <span>O ponto de encontro de quem coleciona.</span>
          <div>
            <Link href="/pedidos">Meus pedidos</Link>
            <Link href="/vender">
              Central do vendedor <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
        <div className="container main-header">
          <button
            ref={trigger}
            className="mobile-nav-trigger"
            aria-label="Abrir menu"
            aria-expanded={mobile}
            aria-controls="mobile-navigation"
            onClick={() => {
              setDropdown(null);
              drawer.current?.showModal();
              setMobile(true);
            }}
          >
            <Menu size={25} />
          </button>
          <Link href="/" className="brand" aria-label={name + " início"}>
            {brand}
          </Link>
          <form action="/explorar" className="site-search" role="search">
            <Search size={20} />
            <input
              key={params.get("q") || ""}
              name="q"
              aria-label="Buscar cartas e colecionáveis"
              placeholder="Busque uma carta, coleção ou personagem"
              defaultValue={params.get("q") || ""}
            />
            <button type="submit" aria-label="Buscar">
              <ArrowRight size={20} />
            </button>
          </form>
          <div className="site-actions">
            <Link
              href="/favoritos"
              className="header-favorites"
              aria-label="Favoritos"
            >
              <Heart size={21} />
            </Link>
            <Link href="/conta" className="header-account">
              <UserRound size={23} />
              <span>
                {user ? user.name.split(" ")[0] : "Entrar"}
                <small>{user ? "Minha conta" : "Crie sua conta"}</small>
              </span>
            </Link>
            <Link
              href="/carrinho"
              className="header-cart"
              aria-label={`Carrinho com ${count} itens`}
            >
              <ShoppingBag size={23} />
              <span>{count}</span>
            </Link>
          </div>
        </div>
        <div className="desktop-navigation">
          <nav
            className="container primary-navigation"
            aria-label="Navegação principal"
          >
            <Link
              href="/explorar"
              className={
                "all-products " + (path === "/explorar" ? "is-active" : "")
              }
            >
              <SlidersHorizontal size={17} />
              Explorar catálogo
            </Link>
            <div className="nav-item">
              <button
                id="nav-cards"
                aria-expanded={dropdown === "cards"}
                aria-controls="menu-cards"
                className={dropdown === "cards" ? "is-active" : ""}
                onClick={() =>
                  setDropdown(dropdown === "cards" ? null : "cards")
                }
              >
                Cartas TCG <ChevronDown size={14} />
              </button>
              {dropdown === "cards" && (
                <div className="mega-menu" id="menu-cards">
                  <div className="mega-games">
                    <span className="menu-label">ESCOLHA SEU UNIVERSO</span>
                    {games.map((g) => (
                      <Link
                        key={g.name}
                        href={
                          "/explorar?franchise=" + encodeURIComponent(g.name)
                        }
                      >
                        <span className={"game-icon " + g.tone}>
                          <g.icon size={20} />
                        </span>
                        <span>
                          <b>{g.name}</b>
                          <small>{g.note}</small>
                        </span>
                        <ChevronRight size={14} />
                      </Link>
                    ))}
                  </div>
                  <div className="mega-types">
                    <span className="menu-label">COMO VOCÊ COLECIONA?</span>
                    {products.map(([type, label]) => (
                      <Link href={typeURL(type)} key={type}>
                        {label}
                        <ArrowUpRight size={14} />
                      </Link>
                    ))}
                    <Link href="/explorar" className="menu-all">
                      Ver todas as cartas <ArrowRight size={14} />
                    </Link>
                    <div className="menu-tip">
                      <ShieldCheck size={20} />
                      <p>
                        Compare a mesma edição,
                        <br />
                        idioma e conservação.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="nav-item">
              <button
                id="nav-collectibles"
                aria-expanded={dropdown === "collectibles"}
                aria-controls="menu-collectibles"
                className={dropdown === "collectibles" ? "is-active" : ""}
                onClick={() =>
                  setDropdown(
                    dropdown === "collectibles" ? null : "collectibles",
                  )
                }
              >
                Colecionáveis <ChevronDown size={14} />
              </button>
              {dropdown === "collectibles" && (
                <div className="small-menu" id="menu-collectibles">
                  <span className="menu-label">ALÉM DAS CARTAS</span>
                  {collectibles.map(([type, label]) => (
                    <Link key={type} href={typeURL(type)}>
                      <Package size={17} />
                      {label}
                      <ChevronRight size={14} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/boosters"
              className={path === "/boosters" ? "is-active" : ""}
            >
              <Sparkles size={16} />
              Boosters<span className="nav-demo">DEMO</span>
            </Link>
            <Link
              href="/afiliados"
              className={path === "/afiliados" ? "is-active" : ""}
            >
              Achados parceiros
              <ArrowUpRight size={13} />
            </Link>
            <Link href="/vender" className="nav-sell">
              <Plus size={17} />
              Anunciar produto
            </Link>
          </nav>
        </div>
      </header>
      <dialog
        ref={drawer}
        id="mobile-navigation"
        className="mobile-drawer"
        aria-labelledby="drawer-title"
        onClose={() => setMobile(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="drawer-top">
          <Link className="brand" href="/" onClick={close}>
            {brand}
          </Link>
          <button aria-label="Fechar menu" className="icon" onClick={close}>
            <X size={24} />
          </button>
        </div>
        <div className="drawer-content">
          <h2 id="drawer-title">
            Seu próximo achado
            <br />
            começa por aqui.
          </h2>
          <nav aria-label="Menu para celular">
            <Link className="drawer-explore" href="/explorar">
              <SlidersHorizontal size={18} />
              Explorar todo o catálogo
              <ArrowRight size={17} />
            </Link>
            <span className="menu-label">CARTAS POR UNIVERSO</span>
            {games.map((g) => (
              <Link
                className="drawer-game"
                href={"/explorar?franchise=" + encodeURIComponent(g.name)}
                key={g.name}
              >
                <span className={"game-icon " + g.tone}>
                  <g.icon size={19} />
                </span>
                {g.name}
                <ChevronRight size={15} />
              </Link>
            ))}
            <details>
              <summary>
                Tipos de produto
                <ChevronDown size={16} />
              </summary>
              {[...products, ...collectibles].map(([type, label]) => (
                <Link className="drawer-sub" href={typeURL(type)} key={type}>
                  {label}
                  <ChevronRight size={14} />
                </Link>
              ))}
            </details>
            <div className="drawer-links">
              <Link href="/boosters">
                <Sparkles size={18} />
                Boosters personalizados <span className="nav-demo">DEMO</span>
              </Link>
              <Link href="/afiliados">
                <ArrowUpRight size={18} />
                Achados parceiros
              </Link>
              <Link href="/favoritos">
                <Heart size={18} />
                Minha lista de desejos
              </Link>
              <Link href="/pedidos">
                <Package size={18} />
                Meus pedidos e boosters
              </Link>
              <Link href="/conta">
                <UserRound size={18} />
                {user ? "Minha conta" : "Entrar ou criar conta"}
              </Link>
              {user?.role === "admin" && (
                <Link href="/admin">
                  <ShieldCheck size={18} />
                  Administração
                </Link>
              )}
            </div>
            <Link href="/vender" className="button primary drawer-sell">
              <Store size={18} />
              Quero vender no Nexo
              <ArrowRight size={17} />
            </Link>
          </nav>
          <p className="drawer-note">
            Ambiente de demonstração. Nenhuma compra gera cobrança real.
          </p>
        </div>
      </dialog>
    </>
  );
}
