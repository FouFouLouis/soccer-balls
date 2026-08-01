/* ============================================================
   CL BALL ARCHIVE — renderer
   Reads data.yaml and builds the whole page from it.
   No content lives in the HTML: edit data.yaml, reload, done.
   ============================================================ */

const DATA_URL = "data.yaml";

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

/* ---------- section renderers ---------- */

function renderHeader(site) {
  const header = el("header", "site-header");
  const nav = (site.nav || [])
    .map((label, i) =>
      `<a href="#" class="${i === 0 ? "active" : ""}">${esc(label)}</a>`
    )
    .join("");
  header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="#">${esc(site.brand)}</a>
      <nav class="site-nav" aria-label="Main">${nav}</nav>
    </div>`;
  return header;
}

function renderMasthead(site) {
  const section = el("section", "masthead");
  const badge = site.partner_badge
    ? `<aside class="partner-badge">
         ${esc(site.partner_badge.label)}
         <strong>${esc(site.partner_badge.value)}</strong>
       </aside>`
    : "";
  section.innerHTML = `
    <div class="wrap">
      <div>
        <h1>${esc(site.title_line_1)}<span class="accent">${esc(site.title_line_2)}</span></h1>
        <p class="intro">${esc(site.intro)}</p>
      </div>
      ${badge}
    </div>`;
  return section;
}

function renderEraBanner(title) {
  return el("div", "era-banner", `<span>${esc(title)}</span>`);
}

// layout: hero -> context card on the left, one big featured ball on the right
function renderHeroEra(era) {
  const section = el("section", "era-section");
  section.id = era.id || "";
  section.appendChild(renderEraBanner(era.title));

  const ball = era.featured_ball || {};
  const hero = el("div", "era-hero");
  hero.innerHTML = `
    <div class="context-card">
      <span class="kicker">Era Context</span>
      <p>${esc(era.context)}</p>
    </div>
    <figure class="hero-ball">
      <img src="${esc(ball.image)}" alt="${esc(ball.name)}" loading="lazy" />
      <figcaption>
        <div class="name">${esc(ball.name)}</div>
        <div class="sub">${esc(ball.subtitle)}</div>
      </figcaption>
    </figure>`;
  section.appendChild(hero);
  return section;
}

function renderBallCard(ball) {
  const badgeClass = ball.highlight ? "stage-badge highlight" : "stage-badge";
  const specs = (ball.specs || [])
    .map(
      (s) => `
      <div class="spec">
        <span class="label">${esc(s.label)}</span>
        <span class="value">${esc(s.value)}</span>
      </div>`
    )
    .join("");

  return `
    <article class="ball-card">
      <div class="media">
        <span class="${badgeClass}">${esc(ball.stage)}</span>
        <img src="${esc(ball.image)}" alt="${esc(ball.name)}" loading="lazy" />
      </div>
      <div class="body">
        <h3>${esc(ball.name)}</h3>
        <p>${esc(ball.description)}</p>
      </div>
      ${specs ? `<div class="specs">${specs}</div>` : ""}
    </article>`;
}

function renderYear(yearEntry) {
  const block = el("section", "year-block");
  block.id = `year-${yearEntry.year}`;

  const header = el("div", "year-header", `<h2>${esc(yearEntry.year)}</h2>`);
  block.appendChild(header);

  const balls = yearEntry.balls || [];
  const grid = el("div", "ball-grid", balls.map(renderBallCard).join(""));
  grid.dataset.count = String(balls.length); // drives 1/2/3-column layout
  block.appendChild(grid);

  return block;
}

// layout: years -> era banner followed by one section per year
function renderYearsEra(era) {
  const section = el("section", "era-section");
  section.id = era.id || "";
  section.appendChild(renderEraBanner(era.title));
  (era.years || []).forEach((y) => section.appendChild(renderYear(y)));
  return section;
}

function renderSummary(summary) {
  if (!summary) return null;
  const section = el("section", "tech-summary");
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
    <div class="wrap">
      <h2>${esc(summary.title)}</h2>
      <div class="grid">${items}</div>
    </div>`;
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

/* ---------- page assembly ---------- */

function renderPage(data) {
  const app = document.getElementById("app");
  app.innerHTML = "";

  app.appendChild(renderHeader(data.site || {}));
  app.appendChild(renderMasthead(data.site || {}));

  const main = el("main", "wrap");
  (data.eras || []).forEach((era) => {
    main.appendChild(era.layout === "hero" ? renderHeroEra(era) : renderYearsEra(era));
  });
  app.appendChild(main);

  const summary = renderSummary(data.summary);
  if (summary) app.appendChild(summary);

  app.appendChild(renderFooter(data.site || {}, data.footer));
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

async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${DATA_URL}`);
    const text = await res.text();
    const data = jsyaml.load(text);
    renderPage(data);
  } catch (err) {
    console.error(err);
    renderError(err);
  }
}

init();
