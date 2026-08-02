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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Every ball image is a button that opens the zoom viewer. The
// button carries the accessible name, so the <img> inside it is
// marked decorative — otherwise screen readers say it twice.
// Edition and season ride along so the viewer can name what is on
// screen without having to look the ball up again.
function zoomTrigger(src, name, edition, season) {
  if (!src) return "";
  return `
    <button class="zoomable" type="button"
            data-zoom-src="${esc(src)}" data-zoom-name="${esc(name)}"
            data-zoom-edition="${esc(edition || "")}"
            data-zoom-season="${esc(season || "")}"
            aria-label="Enlarge the image of ${esc(name)}">
      <img src="${esc(src)}" alt="" loading="lazy" />
      <span class="zoomable__badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
          <path d="M10.5 7.5v6M7.5 10.5h6" />
        </svg>
      </span>
    </button>`;
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
        ${zoomTrigger(ball.image, ball.name, ball.subtitle)}
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

// `season` is not shown in the entry — the year heading above already
// carries it. It is passed through for the zoom viewer, which opens
// away from that heading and has to say which season it belongs to.
function renderBall(ball, season) {
  const badgeClass = ball.highlight ? "badge badge--highlight" : "badge";
  const badge = ball.stage
    ? `<span class="${badgeClass}">${esc(ball.stage)}</span>`
    : "";
  const figure = ball.image
    ? `<figure class="ball__figure">
         ${zoomTrigger(ball.image, ball.name, ball.stage, season)}
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
    <ol class="ball-list">
      ${balls.map((ball) => renderBall(ball, yearEntry.year)).join("")}
    </ol>`;
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

/* ---------- image zoom viewer ----------
   One viewer for the whole page, built on first use.

   Every gesture has a keyboard and a button equivalent: phones
   pinch, laptops scroll or double-click, and neither is required —
   the toolbar alone drives the whole thing. That is what keeps it
   usable on a trackpad-less desktop, on a phone, and with a screen
   reader, rather than only on the device it was designed on.

   Pointer Events give one code path for mouse, touch and pen
   instead of three, and are supported by every engine we target
   (Safari 13+, Chrome, Firefox, Edge). */

const ZOOM_MIN = 1;
const ZOOM_MAX = 8; // hard ceiling, in case a file is enormous
// How far past its own pixels a photo may be blown up. Beyond this
// the zoom stops showing more detail and starts showing the pixels,
// so the depth available is a property of each file, not a constant.
// Measured in CSS pixels: a 2x screen is left to its own upscaling.
const MAX_NATIVE = 1.3;
const ZOOM_STEP = 1.5; // buttons, keyboard, double-click
const TAP_SLOP = 10; // px of travel still counted as a tap, not a drag
const DOUBLE_TAP_MS = 300;
const PAN_KEY_STEP = 60;

let viewer = null;

function buildViewer() {
  const root = el("div", "viewer");
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Image viewer");
  root.innerHTML = `
    <div class="viewer__head">
      <p class="viewer__edition"></p>
    </div>
    <div class="viewer__stage">
      <div class="viewer__frame" aria-hidden="true"></div>
      <img class="viewer__img" alt="" draggable="false" />
    </div>
    <div class="viewer__bar">
      <p class="viewer__hint">Click, scroll or pinch to zoom · drag to move</p>
      <div class="viewer__tools">
        <button class="viewer__btn" type="button" data-act="out"
                aria-label="Zoom out">&minus;</button>
        <span class="viewer__level" aria-hidden="true">100%</span>
        <button class="viewer__btn" type="button" data-act="in"
                aria-label="Zoom in">+</button>
        <button class="viewer__btn" type="button" data-act="reset">Reset</button>
        <button class="viewer__btn viewer__btn--strong" type="button"
                data-act="close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(root);

  const stage = root.querySelector(".viewer__stage");
  const frame = root.querySelector(".viewer__frame");
  const img = root.querySelector(".viewer__img");
  const head = root.querySelector(".viewer__head");
  const captionEdition = root.querySelector(".viewer__edition");
  const level = root.querySelector(".viewer__level");
  const inButton = root.querySelector('[data-act="in"]');
  const outButton = root.querySelector('[data-act="out"]');
  const closeButton = root.querySelector('[data-act="close"]');

  const pointers = new Map();
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let pinch = null; // reference transform captured when the 2nd finger lands
  let drag = null;
  let lastTap = 0;
  let opener = null;
  let scrollY = 0;

  /* Both ends of the zoom range come from the file that is actually
     loaded, not from a constant: a 2000px press photo and a 600px
     placeholder deserve very different treatment.

     offsetWidth/Height are layout values, unaffected by the transform
     we are about to write, so reading them here is not a feedback
     loop. CSS max-width/max-height only ever shrink the element, so
     the box is never bigger than the file behind it. */
  // Width of the mount around the photograph, proportional to the
  // stage: 22px of mat around a phone screen would swallow the
  // picture. The same figure drives the fit below and the frame in
  // apply(), so they cannot drift apart.
  function matWidth() {
    return Math.round(clamp(stage.clientWidth / 60, 10, 22));
  }

  function metrics() {
    const boxW = img.offsetWidth;
    const boxH = img.offsetHeight;
    if (!boxW || !boxH) return { base: 1, maxZoom: 1, boxW: 0, boxH: 0 };

    // The scale at which the picture is shown at MAX_NATIVE times its
    // own pixels — the point where zooming further only reveals
    // blur, so it is where we stop.
    const ceiling = (MAX_NATIVE * (img.naturalWidth || boxW)) / boxW;

    // The stage has to hold the mount, not just the photograph: the
    // mat on each side plus as much again of dark room around it,
    // otherwise the frame is flush with the edges and stops reading
    // as a frame at all.
    const room = 4 * matWidth();
    const contain = Math.min(
      Math.max(1, stage.clientWidth - room) / boxW,
      Math.max(1, stage.clientHeight - room) / boxH
    );

    // 100 % shows everything — unless fitting the stage would mean
    // blowing a small file up past its own resolution, in which case
    // the file wins and the picture simply opens smaller.
    const base = Math.min(contain, ceiling);
    return {
      base,
      maxZoom: clamp(ceiling / base, ZOOM_MIN, ZOOM_MAX),
      boxW,
      boxH,
    };
  }

  function apply(smooth) {
    const { base, maxZoom, boxW, boxH } = metrics();
    scale = clamp(scale, ZOOM_MIN, maxZoom);
    const shown = scale * base;

    const overflowX = Math.max(0, (boxW * shown - stage.clientWidth) / 2);
    const overflowY = Math.max(0, (boxH * shown - stage.clientHeight) / 2);
    tx = clamp(tx, -overflowX, overflowX);
    ty = clamp(ty, -overflowY, overflowY);

    img.style.transition = smooth ? "transform 160ms ease" : "none";
    // `base` cancels out of the anchoring maths in zoomFrom, which
    // works in ratios, so it only ever appears here.
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${shown})`;

    // The frame is a mount around the photograph: an ivory mat, a
    // brass line at its outer edge. It is not scaled by the zoom, so
    // the lines stay hairlines and the mat keeps its width instead of
    // ballooning. Its rectangle is derived from the numbers above
    // rather than measured — no extra layout flush per frame.
    const shownW = boxW * shown;
    const shownH = boxH * shown;
    const mat = matWidth();

    frame.hidden = !boxW;
    frame.style.transition = smooth
      ? "transform 160ms ease, width 160ms ease, height 160ms ease"
      : "none";
    frame.style.setProperty("--mat", `${mat}px`);
    frame.style.width = `${shownW + 2 * mat + 2}px`;
    frame.style.height = `${shownH + 2 * mat + 2}px`;
    frame.style.transform = `translate(${
      (stage.clientWidth - shownW) / 2 + tx - mat - 1
    }px, ${(stage.clientHeight - shownH) / 2 + ty - mat - 1}px)`;

    // A disabled + button and a MAX marker say why the zoom stopped.
    // Without them a low-resolution photo just feels broken.
    const atMax = scale >= maxZoom - 0.001;
    level.textContent = `${Math.round(scale * 100)}%${atMax ? " · max" : ""}`;
    inButton.disabled = atMax;
    outButton.disabled = scale <= ZOOM_MIN + 0.001;

    stage.classList.toggle("is-zoomed", scale > ZOOM_MIN);
    if (scale > ZOOM_MIN) root.classList.add("has-zoomed");
  }

  // Stage coordinates, measured from the stage centre — the origin
  // the transform itself uses.
  function stagePoint(clientX, clientY) {
    const box = stage.getBoundingClientRect();
    return [clientX - box.left - box.width / 2, clientY - box.top - box.height / 2];
  }

  // Capturing the pointer on the stage retargets every subsequent
  // pointer event to the stage, so event.target can never tell us
  // whether a tap landed on the picture. Ask the geometry instead —
  // getBoundingClientRect already accounts for the transform.
  function onImage(clientX, clientY) {
    const r = img.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right &&
           clientY >= r.top && clientY <= r.bottom;
  }

  // Re-scale so that the content point sitting under (fromX, fromY)
  // in the reference transform ends up under (toX, toY). Anchoring
  // the zoom on the pointer is what makes it feel direct instead of
  // having to chase the image afterwards.
  function zoomFrom(ref, next, fromX, fromY, toX, toY, smooth) {
    // Clamped here and not only in apply(): the pan offsets below are
    // derived from the scale, so they have to use the final one.
    scale = clamp(next, ZOOM_MIN, metrics().maxZoom);
    tx = toX - (scale * (fromX - ref.tx)) / ref.scale;
    ty = toY - (scale * (fromY - ref.ty)) / ref.scale;
    if (scale === ZOOM_MIN) {
      tx = 0;
      ty = 0;
    }
    apply(smooth);
  }

  // Zoom on the stage centre: what the buttons and the keyboard use.
  function stepZoom(factor) {
    zoomFrom({ scale, tx, ty }, scale * factor, 0, 0, 0, 0, true);
  }

  function toggleZoomAt(clientX, clientY) {
    const [px, py] = stagePoint(clientX, clientY);
    const target = scale > ZOOM_MIN ? ZOOM_MIN : ZOOM_STEP * 2;
    zoomFrom({ scale, tx, ty }, target, px, py, px, py, true);
  }

  /* --- wheel and trackpad --- */

  stage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      // Firefox reports line- and page-based deltas; normalise to px.
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      // A ctrl-modified wheel event is a trackpad pinch, which sends
      // much smaller deltas and needs a stronger response.
      const intensity = event.ctrlKey ? 0.012 : 0.0022;
      const [px, py] = stagePoint(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * unit * intensity);
      zoomFrom({ scale, tx, ty }, scale * factor, px, py, px, py, false);
    },
    { passive: false }
  );

  /* --- pointers: drag to pan, two fingers to pinch --- */

  stage.addEventListener("pointerdown", (event) => {
    // A primary pointer means a fresh gesture, so nothing else can
    // legitimately still be down. Anything left in the map is a
    // pointerup we never received — an interrupted gesture, a finger
    // leaving the window — and it would wedge us in pinch mode.
    if (event.isPrimary) pointers.clear();

    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const [mx, my] = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, tx, ty, mx, my };
      drag = null;
      return;
    }
    drag = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
  });

  stage.addEventListener("pointermove", (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const [mx, my] = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      // Zooming and panning in one move: the pinch centre may travel
      // while the fingers spread, and the image has to follow it.
      zoomFrom(pinch, pinch.scale * (dist / pinch.dist), pinch.mx, pinch.my, mx, my, false);
      return;
    }

    if (!drag || scale === ZOOM_MIN) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > TAP_SLOP) drag.moved = true;
    tx = drag.tx + dx;
    ty = drag.ty + dy;
    stage.classList.add("is-panning");
    apply(false);
  });

  function releasePointer(event) {
    pointers.delete(event.pointerId);
    if (stage.hasPointerCapture(event.pointerId)) {
      stage.releasePointerCapture(event.pointerId);
    }
    stage.classList.remove("is-panning");
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      // One finger lifted out of a pinch: hand over to a pan from
      // wherever the remaining finger is, so the image doesn't jump.
      const [remaining] = [...pointers.values()];
      drag = { x: remaining.x, y: remaining.y, tx, ty, moved: true };
    }
  }

  stage.addEventListener("pointerup", (event) => {
    const wasTap = pointers.size === 1 && drag && !drag.moved;
    const hitImage = onImage(event.clientX, event.clientY);
    releasePointer(event);
    if (!wasTap) return;

    const now = Date.now();
    if (hitImage) {
      // A single tap toggles the zoom — no waiting on a timer, so it
      // responds immediately. The second tap of a quick double-tap is
      // swallowed: phones zoom pictures by double-tapping, and acting
      // on both taps would undo the zoom as soon as it appeared.
      if (now - lastTap >= DOUBLE_TAP_MS) {
        toggleZoomAt(event.clientX, event.clientY);
      }
      lastTap = now;
      return;
    }
    // Tapping the backdrop dismisses, the way every viewer does.
    close();
  });

  stage.addEventListener("pointercancel", releasePointer);

  /* --- toolbar --- */

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const actions = {
      in: () => stepZoom(ZOOM_STEP),
      out: () => stepZoom(1 / ZOOM_STEP),
      reset: () => zoomFrom({ scale, tx, ty }, ZOOM_MIN, 0, 0, 0, 0, true),
      close,
    };
    (actions[button.dataset.act] || (() => {}))();
  });

  /* --- keyboard --- */

  function trapFocus(event) {
    const items = root.querySelectorAll("button");
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function pan(dx, dy) {
    if (scale === ZOOM_MIN) return;
    tx += dx;
    ty += dy;
    apply(true);
  }

  function onKeydown(event) {
    if (root.hidden) return;
    const keys = {
      Escape: close,
      "+": () => stepZoom(ZOOM_STEP),
      "=": () => stepZoom(ZOOM_STEP),
      "-": () => stepZoom(1 / ZOOM_STEP),
      _: () => stepZoom(1 / ZOOM_STEP),
      0: () => zoomFrom({ scale, tx, ty }, ZOOM_MIN, 0, 0, 0, 0, true),
      ArrowLeft: () => pan(PAN_KEY_STEP, 0),
      ArrowRight: () => pan(-PAN_KEY_STEP, 0),
      ArrowUp: () => pan(0, PAN_KEY_STEP),
      ArrowDown: () => pan(0, -PAN_KEY_STEP),
    };
    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  document.addEventListener("keydown", onKeydown);

  // A late layout change (rotation, resize, image finally decoded)
  // can leave the image panned outside its own bounds.
  addEventListener("resize", () => {
    if (!root.hidden) apply(false);
  });
  img.addEventListener("load", () => {
    if (!root.hidden) apply(false);
  });

  /* --- scroll lock ---
     position:fixed rather than overflow:hidden, which iOS Safari
     ignores on <body>. The offset keeps the page from jumping to
     the top while the viewer is open. */

  function lockScroll() {
    scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add("is-locked");
  }

  function unlockScroll() {
    document.body.classList.remove("is-locked");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
  }

  /* --- open / close --- */

  function open({ zoomSrc, zoomName, zoomEdition, zoomSeason }, trigger) {
    opener = trigger || null;
    img.src = zoomSrc;

    // Season and edition read as one line: "2026 · Special Edition".
    // Written as text, not markup, so nothing here needs escaping.
    const edition = [zoomSeason, zoomEdition].filter(Boolean).join(" · ");
    captionEdition.textContent = edition;
    // The name is not printed anywhere in the viewer — the band above
    // the picture identifies it — but it stays in the accessible name
    // so a screen reader still announces which ball was opened.
    // No band at all rather than an empty one, if a ball carries
    // neither a stage nor a subtitle.
    head.hidden = !edition;
    root.setAttribute(
      "aria-label",
      [`Image viewer`, zoomName, edition].filter(Boolean).join(" — ")
    );
    scale = ZOOM_MIN;
    tx = 0;
    ty = 0;
    lastTap = 0;
    root.classList.remove("has-zoomed");
    root.hidden = false;
    lockScroll();
    apply(false);
    closeButton.focus();
  }

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    pointers.clear();
    pinch = null;
    drag = null;
    unlockScroll();
    if (opener) opener.focus();
    opener = null;
    img.removeAttribute("src");
  }

  return { open };
}

// Delegated, so it covers every ball without a listener per image.
function setupZoom() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-zoom-src]");
    if (!trigger) return;
    if (!viewer) viewer = buildViewer();
    viewer.open(trigger.dataset, trigger);
  });
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
  setupZoom();
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
