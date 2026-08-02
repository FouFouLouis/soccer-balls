/* ============================================================
   CL BALL ARCHIVE — renderer
   Reads data.yaml and builds the whole page from it.
   No content lives in the HTML: edit data.yaml, reload, done.

   The data format is unchanged: same site / eras / summary /
   footer keys, same ball fields. Only the presentation moved to
   a reference-article layout (contents sidebar + article).
   ============================================================ */

const DATA_URL = "data.yaml";
const MOBILE_TOC = "(max-width: 940px)";

/* ---------- helpers ---------- */

// Escape user-provided strings before injecting into HTML.
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

// "THE ADIDAS STAR ERA (2001–2024)" -> "the-adidas-star-era-2001-2024"
function slug(value) {
  return (
    String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

const hex = '<span class="hex" aria-hidden="true"></span>';

function permalink(id) {
  return `<a class="permalink" href="#${esc(id)}"
             aria-label="Permalink to this section">#</a>`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/* ---------- ids & outline ----------
   Ids are derived once here and reused by both the article and
   the contents list, so every entry is guaranteed to link to a
   section that exists. */

function eraId(era) {
  return slug(era.id || era.title);
}

function seasonId(era, yearEntry) {
  return `${eraId(era)}-season-${slug(yearEntry.year)}`;
}

function buildOutline(data) {
  const entries = (data.eras || []).map((era) => ({
    id: eraId(era),
    label: era.title,
    children: (era.years || []).map((yearEntry) => ({
      id: seasonId(era, yearEntry),
      label: yearEntry.year,
      children: [],
    })),
  }));

  if (data.summary) {
    entries.push({
      id: slug(data.summary.title),
      label: data.summary.title,
      children: [],
    });
  }
  return entries;
}

// Figures shown in the quick-facts box, counted from the data
// itself so they can never drift out of date.
function collectStats(data) {
  const eras = data.eras || [];
  let balls = 0;
  let seasons = 0;

  eras.forEach((era) => {
    if (era.featured_ball) balls += 1;
    (era.years || []).forEach((yearEntry) => {
      seasons += 1;
      balls += (yearEntry.balls || []).length;
    });
  });

  return { eras: eras.length, balls, seasons };
}

/* ---------- section renderers ---------- */

function renderHeader(site) {
  const header = el("header", "site-header");
  const nav = (site.nav || [])
    .map(
      (label, i) =>
        `<a href="#" class="${i === 0 ? "active" : ""}">${esc(label)}</a>`
    )
    .join("");
  header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="#top">${hex}${esc(site.brand)}</a>
      <nav class="site-nav" aria-label="Sections">${nav}</nav>
    </div>`;
  return header;
}

function renderInfobox(site, stats, lastUpdated) {
  const rows = [];

  if (site.partner_badge) {
    rows.push([site.partner_badge.label, site.partner_badge.value]);
  }
  rows.push(["Balls documented", stats.balls]);
  rows.push(["Seasons listed", stats.seasons]);
  rows.push(["Periods covered", stats.eras]);
  if (lastUpdated) rows.push(["Last updated", lastUpdated]);

  const body = rows
    .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`)
    .join("");

  return `
    <aside class="infobox" aria-labelledby="quick-facts">
      <h2 class="infobox__title" id="quick-facts">Quick facts</h2>
      <dl>${body}</dl>
    </aside>`;
}

function renderMasthead(site, stats, lastUpdated) {
  const section = el("section", "masthead");
  section.innerHTML = `
    <div class="wrap">
      <div class="masthead__text">
        <p class="eyebrow">Reference archive</p>
        <h1>
          ${esc(site.title_line_1)}<span class="accent">${esc(site.title_line_2)}</span>
        </h1>
        <p class="lede">${esc(site.intro)}</p>
      </div>
      ${renderInfobox(site, stats, lastUpdated)}
    </div>`;
  return section;
}

function renderTocItems(entries) {
  return entries
    .map(
      (entry) => `
      <li>
        <a href="#${esc(entry.id)}">${esc(entry.label)}</a>
        ${
          entry.children.length
            ? `<ol class="toc__sublist">${renderTocItems(entry.children)}</ol>`
            : ""
        }
      </li>`
    )
    .join("");
}

function renderToc(outline) {
  const nav = el("nav", "toc");
  nav.setAttribute("aria-labelledby", "toc-title");
  nav.innerHTML = `
    <div class="toc__head">
      <h2 class="toc__title" id="toc-title">Contents</h2>
      <button class="toc__toggle" type="button"
              aria-expanded="false" aria-controls="toc-list">Show</button>
    </div>
    <ol class="toc__list" id="toc-list">${renderTocItems(outline)}</ol>`;
  return nav;
}

function renderFeatured(ball) {
  return `
    <figure class="featured">
      <div class="featured__media">
        <img src="${esc(ball.image)}" alt="${esc(ball.name)}" loading="lazy" />
      </div>
      <figcaption>
        <span class="featured__label">Featured ball</span>
        <span class="featured__name">${esc(ball.name)}</span>
        <span class="featured__sub">${esc(ball.subtitle)}</span>
      </figcaption>
    </figure>`;
}

function renderSpecs(specs) {
  if (!specs || !specs.length) return "";
  const rows = specs
    .map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`)
    .join("");
  return `<dl class="specs">${rows}</dl>`;
}

function renderBall(ball) {
  const badgeClass = ball.highlight ? "badge badge--highlight" : "badge";
  const badge = ball.stage
    ? `<span class="${badgeClass}">${esc(ball.stage)}</span>`
    : "";
  const figure = ball.image
    ? `<figure class="ball__figure">
         <img src="${esc(ball.image)}" alt="${esc(ball.name)}" loading="lazy" />
       </figure>`
    : "";

  return `
    <li>
      <article class="ball">
        ${figure}
        <div class="ball__body">
          <div class="ball__head">
            <h4 class="ball__name">${esc(ball.name)}</h4>
            ${badge}
          </div>
          <p class="ball__text">${esc(ball.description)}</p>
          ${renderSpecs(ball.specs)}
        </div>
      </article>
    </li>`;
}

function renderSeason(era, yearEntry) {
  const id = seasonId(era, yearEntry);
  const balls = yearEntry.balls || [];
  const section = el("section", "season");
  section.id = id;
  section.setAttribute("aria-labelledby", `${id}-title`);
  section.innerHTML = `
    <h3 class="season__title" id="${id}-title">
      <span class="season__year">${esc(yearEntry.year)}</span>
      <span class="season__count">${plural(balls.length, "ball")}</span>
      ${permalink(id)}
    </h3>
    <ol class="ball-list">${balls.map(renderBall).join("")}</ol>`;
  return section;
}

function renderEra(era) {
  const id = eraId(era);
  const section = el("section", "era");
  section.id = id;
  section.setAttribute("aria-labelledby", `${id}-title`);

  section.innerHTML = `
    <div class="era__head">
      <h2 class="era__title" id="${id}-title">
        ${hex}<span>${esc(era.title)}</span>${permalink(id)}
      </h2>
    </div>
    ${era.context ? `<p class="era__context">${esc(era.context)}</p>` : ""}
    ${era.featured_ball ? renderFeatured(era.featured_ball) : ""}`;

  (era.years || []).forEach((yearEntry) =>
    section.appendChild(renderSeason(era, yearEntry))
  );

  section.appendChild(
    el("p", "to-top", '<a href="#top">&uarr; Back to top</a>')
  );
  return section;
}

function renderSummary(summary) {
  if (!summary) return null;
  const id = slug(summary.title);
  const section = el("section", "summary-section");
  section.id = id;
  section.setAttribute("aria-labelledby", `${id}-title`);

  const items = (summary.items || [])
    .map(
      (item) => `
      <div>
        <h3>${esc(item.heading)}</h3>
        <p>${esc(item.text)}</p>
      </div>`
    )
    .join("");

  section.innerHTML = `
    <h2 id="${id}-title">${hex}<span>${esc(summary.title)}</span></h2>
    <div class="summary-grid">${items}</div>`;
  return section;
}

function renderFooter(site, footer) {
  const node = el("footer", "site-footer");
  const links = ((footer && footer.links) || [])
    .map((label) => `<a href="#">${esc(label)}</a>`)
    .join("");
  node.innerHTML = `
    <div class="wrap">
      <span class="brand-small">${esc(site.brand)}</span>
      <nav aria-label="Footer">${links}</nav>
      <span>${esc(footer ? footer.copyright : "")}</span>
    </div>`;
  return node;
}

/* ---------- behaviour ---------- */

// Highlights the contents entry for the section being read.
function setupScrollSpy() {
  const targets = Array.from(
    document.querySelectorAll('.toc__list a[href^="#"]')
  )
    .map((link) => ({ link, section: document.getElementById(link.hash.slice(1)) }))
    .filter((target) => target.section);

  if (!targets.length) return;

  const headerHeight =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--header-h")
    ) || 56;

  let queued = false;

  function update() {
    queued = false;
    // The current section is the last one whose top has scrolled
    // past the header. Targets are in document order.
    let current = targets[0];
    for (const target of targets) {
      if (target.section.getBoundingClientRect().top <= headerHeight + 24) {
        current = target;
      } else {
        break;
      }
    }
    targets.forEach(({ link }) => {
      if (link === current.link) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  update();
}

// On narrow screens the contents list collapses behind a button.
function setupTocToggle() {
  const toc = document.querySelector(".toc");
  const button = toc && toc.querySelector(".toc__toggle");
  if (!toc || !button) return;

  function setOpen(open) {
    toc.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "Hide" : "Show";
  }

  button.addEventListener("click", () =>
    setOpen(!toc.classList.contains("is-open"))
  );

  // Following a link should get out of the way again.
  toc.querySelectorAll(".toc__list a").forEach((link) =>
    link.addEventListener("click", () => {
      if (matchMedia(MOBILE_TOC).matches) setOpen(false);
    })
  );
}

/* ---------- page assembly ---------- */

function renderPage(data, lastUpdated) {
  const app = document.getElementById("app");
  const site = data.site || {};
  app.innerHTML = "";

  app.appendChild(renderHeader(site));
  app.appendChild(renderMasthead(site, collectStats(data), lastUpdated));

  const layout = el("div", "layout wrap");
  layout.appendChild(renderToc(buildOutline(data)));

  const article = el("main", "article");
  article.id = "article";
  (data.eras || []).forEach((era) => article.appendChild(renderEra(era)));

  const summary = renderSummary(data.summary);
  if (summary) article.appendChild(summary);

  layout.appendChild(article);
  app.appendChild(layout);

  app.appendChild(renderFooter(site, data.footer));

  setupTocToggle();
  setupScrollSpy();
}

function renderError(err) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="load-error">
      <p><strong>COULD NOT LOAD data.yaml</strong></p>
      <p style="margin-top:0.75rem">${esc(err.message)}</p>
      <p style="margin-top:0.75rem">
        If you opened index.html directly from disk, the browser blocks the
        fetch. Serve the folder instead:<br /><br />
        <code>python3 -m http.server 8000</code><br />
        then open <code>http://localhost:8000</code>.
      </p>
    </div>`;
}

// Reference pages state when they were last revised; the server
// already tells us, so no need for a field in data.yaml.
function readLastModified(res) {
  const header = res.headers.get("last-modified");
  if (!header) return "";
  const date = new Date(header);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${DATA_URL}`);
    const text = await res.text();
    const data = jsyaml.load(text);
    renderPage(data, readLastModified(res));
  } catch (err) {
    console.error(err);
    renderError(err);
  }
}

init();
