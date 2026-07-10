import { useEffect, useState } from "react";
import { LangToggle, useLang } from "./i18n";

export interface NavLink {
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  soon?: boolean;
}

export interface NavCta {
  label: string;
  href?: string;
  onClick?: () => void;
}

/* navbar única para landing e jogo: logo, links, idioma e CTA,
   com menu hamburguer no mobile */
export default function Navbar({
  links,
  cta,
}: {
  links: NavLink[];
  cta?: NavCta;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  // fecha o menu ao trocar de rota e trava o scroll enquanto aberto
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);

  function renderLink(l: NavLink) {
    if (l.soon) {
      return (
        <span className="nav-soon" key={l.label}>
          {l.label}
          <small className="mono">{t.nav.soon}</small>
        </span>
      );
    }
    if (l.href) {
      return (
        <a
          key={l.label}
          href={l.href}
          className={l.active ? "active" : ""}
          aria-current={l.active ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          {l.label}
        </a>
      );
    }
    return (
      <button
        key={l.label}
        className="nav-link-btn"
        onClick={() => {
          setOpen(false);
          l.onClick?.();
        }}
      >
        {l.label}
      </button>
    );
  }

  const ctaEl = cta ? (
    cta.href ? (
      <a className="btn primary small" href={cta.href}>
        {cta.label}
      </a>
    ) : (
      <button
        className="btn primary small nav-cta-btn"
        onClick={() => {
          setOpen(false);
          cta.onClick?.();
        }}
      >
        {cta.label}
      </button>
    )
  ) : null;

  return (
    <nav className="topbar">
      <a className="logo" href="#/" aria-label="Hi-Lo">
        Hi-<span className="accent">Lo</span>
      </a>

      <div className="topbar-links">{links.map(renderLink)}</div>

      <div className="topbar-actions">
        <LangToggle />
        {ctaEl}
        <button
          className={`nav-burger ${open ? "open" : ""}`}
          aria-label={t.nav.menuAria}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className={`topbar-menu ${open ? "open" : ""}`}>
        {links.map(renderLink)}
        {ctaEl}
      </div>
    </nav>
  );
}
