/* A small presentation layer over mdBook's native navigation and search. */
(() => {
  "use strict";
  const main = document.querySelector("main");
  const sidebar = document.getElementById("mdbook-sidebar");
  if (!main || !sidebar) return;
  const base = new URL(typeof path_to_root === "string" ? path_to_root || "./" : "./", location.href);
  const href = path => new URL(path, base).href;
  const relative = location.pathname.slice(base.pathname.length);
  const product = ["cube", "play", "recipes"].find(name => relative.startsWith(name + "/")) || "";
  const names = { cube: "Cube", play: "Cube Play", recipes: "Recipes" };
  const icon = (path, className = "") => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  const searchIcon = icon("m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z");
  const menuIcon = icon("M4 6h16M4 12h16M4 18h16");
  const moonIcon = icon("M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z");
  const cubeIcon = icon("m12 2 9 5v10l-9 5-9-5V7l9-5Zm-9 5 9 5 9-5M12 12v10");
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  let searchOrigin;
  const openSearch = () => {
    searchOrigin = document.activeElement.closest("button") || header.querySelector(innerWidth < 1080 ? ".docs-mobile-search" : ".docs-sidebar-search") || search;
    if (innerWidth < 1080 && document.documentElement.classList.contains("sidebar-visible")) toggleSidebar();
    const wrapper = document.getElementById("mdbook-search-wrapper");
    if (wrapper.classList.contains("hidden")) document.getElementById("mdbook-search-toggle").click();
    document.getElementById("mdbook-searchbar").focus();
  };
  const toggleSidebar = () => {
    document.getElementById("mdbook-sidebar-toggle").click();
    if (innerWidth < 1080) {
      if (document.documentElement.classList.contains("sidebar-visible")) search.focus();
      else header.querySelector(".docs-menu").focus();
    }
  };
  const header = element("header", "docs-header");
  header.innerHTML = `
    <button type="button" class="docs-icon-button docs-menu" aria-label="Open navigation" aria-controls="mdbook-sidebar" aria-expanded="false">${menuIcon}</button>
    <a class="docs-brand" href="${href("index.html")}" aria-label="CubeArc documentation home">${cubeIcon}<span class="docs-wordmark">CubeArc</span><span class="docs-brand-label">Docs</span></a>
    <nav aria-label="Products">${Object.entries(names).map(([key, label]) => `<a href="${href(key + "/index.html")}"${product === key ? ' aria-current="true"' : ""}>${label}</a>`).join("")}</nav>
    <div class="docs-header-actions">
      <button type="button" class="docs-icon-button docs-mobile-search" aria-label="Search documentation">${searchIcon}</button>
      <a class="docs-repository" href="https://github.com/cubearc">GitHub ↗</a>
      <button type="button" class="docs-icon-button docs-theme" aria-label="Use dark theme">${moonIcon}</button>
    </div>`;
  document.body.prepend(header);
  const skip = element("a", "docs-skip", "Skip to content");
  skip.href = "#docs-main";
  main.id = "docs-main";
  main.tabIndex = -1;
  document.body.prepend(skip);
  const backdrop = element("button", "docs-backdrop");
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close navigation");
  document.body.append(backdrop);
  header.querySelector(".docs-menu").addEventListener("click", toggleSidebar);
  backdrop.addEventListener("click", toggleSidebar);
  header.querySelector(".docs-mobile-search").addEventListener("click", openSearch);

  const search = element("button", "docs-sidebar-search");
  search.type = "button";
  search.setAttribute("aria-label", "Search documentation");
  search.innerHTML = searchIcon + "<span>Search documentation</span><kbd>⌘ K</kbd>";
  search.addEventListener("click", openSearch);
  sidebar.prepend(search);
  const label = element("div", "docs-sidebar-label", names[product] || "Documentation");
  search.after(label);
  const footer = element("div", "docs-sidebar-footer");
  footer.innerHTML = `<a href="${href("contributing/index.html")}">Contribute to the docs ↗</a><a href="https://github.com/cubearc/${product || "docs"}">GitHub repository ↗</a>`;
  sidebar.append(footer);
  const filterSidebar = () => {
    const chapter = sidebar.querySelector(".chapter");
    if (!chapter) return false;
    for (const item of chapter.children) {
      const link = item.querySelector(":scope > .chapter-link-wrapper > a");
      if (!link) continue;
      const target = new URL(link.href);
      const page = target.pathname.slice(base.pathname.length);
      const group = Object.keys(names).find(name => page.startsWith(name + "/"));
      if (product) item.hidden = group !== product;
      else if (relative.startsWith("contributing/")) item.hidden = !page.startsWith("contributing/");
      else {
        item.hidden = page === "index.html" || page === "versions.html";
        const children = item.querySelector(":scope > ol");
        if (children) children.style.display = "none";
        const toggle = item.querySelector(":scope > .chapter-link-wrapper > .chapter-fold-toggle");
        if (toggle) toggle.hidden = true;
      }
    }
    for (const toggle of chapter.querySelectorAll(".chapter-fold-toggle")) {
      const title = toggle.previousElementSibling.textContent;
      toggle.setAttribute("role", "button");
      toggle.setAttribute("tabindex", "0");
      toggle.setAttribute("aria-label", "Toggle " + title);
      const expanded = () => toggle.setAttribute("aria-expanded", String(toggle.closest("li").classList.contains("expanded")));
      expanded();
      toggle.addEventListener("click", expanded);
      toggle.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle.click();
        }
      });
    }
    return true;
  };
  if (!filterSidebar()) {
    const observer = new MutationObserver(() => {
      if (filterSidebar()) observer.disconnect();
    });
    observer.observe(sidebar, { childList: true, subtree: true });
  }
  const syncState = () => {
    const visible = document.documentElement.classList.contains("sidebar-visible");
    const dark = !document.documentElement.classList.contains("light") && !document.documentElement.classList.contains("rust");
    header.querySelector(".docs-menu").setAttribute("aria-expanded", String(visible));
    header.querySelector(".docs-menu").setAttribute("aria-label", visible && innerWidth < 1080 ? "Close navigation" : "Open navigation");
    header.querySelector(".docs-theme").setAttribute("aria-label", dark ? "Use light theme" : "Use dark theme");
    for (const control of sidebar.querySelectorAll("a,button")) {
      if (visible && control.getAttribute("role") === "button") control.setAttribute("tabindex", "0");
      else if (visible) control.removeAttribute("tabindex");
      else control.setAttribute("tabindex", "-1");
    }
  };
  header.querySelector(".docs-theme").addEventListener("click", () => {
    const dark = !document.documentElement.classList.contains("light") && !document.documentElement.classList.contains("rust");
    document.getElementById(dark ? "mdbook-theme-light" : "mdbook-theme-navy").click();
  });
  new MutationObserver(syncState).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  if (innerWidth >= 1080 && !document.documentElement.classList.contains("sidebar-visible")) {
    document.getElementById("mdbook-sidebar-toggle").click();
  }
  matchMedia("(min-width: 1080px)").addEventListener("change", event => {
    if (event.matches !== document.documentElement.classList.contains("sidebar-visible")) {
      document.getElementById("mdbook-sidebar-toggle").click();
    }
    syncState();
  });
  syncState();
  const searchWrapper = document.getElementById("mdbook-search-wrapper");
  const closeSearch = () => {
    if (searchWrapper.classList.contains("hidden")) return;
    document.getElementById("mdbook-search-toggle").click();
    const url = new URL(location.href);
    url.searchParams.delete("search");
    history.replaceState(null, "", url);
    if (searchOrigin?.isConnected && searchOrigin.checkVisibility()) searchOrigin.focus();
    else header.querySelector(".docs-mobile-search").focus();
  };
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
    if (event.key === "Escape" && !searchWrapper.classList.contains("hidden")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSearch();
    } else if (event.key === "Escape" && innerWidth < 1080 && document.documentElement.classList.contains("sidebar-visible")) toggleSidebar();
  }, true);
  const searchbar = document.getElementById("mdbook-searchbar");
  searchbar.setAttribute("placeholder", "Search guides, concepts, operations…");
  searchbar.setAttribute("aria-label", "Search documentation");
  const close = element("button", "docs-search-close");
  close.type = "button";
  close.setAttribute("aria-label", "Close search");
  close.innerHTML = icon("m6 6 12 12M6 18 18 6");
  close.addEventListener("click", closeSearch);
  searchbar.after(close);
  const searchBackdrop = element("button", "docs-search-backdrop");
  searchBackdrop.type = "button";
  searchBackdrop.tabIndex = -1;
  searchBackdrop.setAttribute("aria-label", "Close search");
  searchBackdrop.addEventListener("click", closeSearch);
  document.body.append(searchBackdrop);
  const syncSearch = () => document.documentElement.classList.toggle("docs-search-open", !searchWrapper.classList.contains("hidden"));
  new MutationObserver(syncSearch).observe(searchWrapper, { attributes: true, attributeFilter: ["class"] });
  syncSearch();

  const context = element("div", "docs-context");
  const breadcrumb = element("div", "docs-breadcrumb");
  if (product) {
    const root = element("a", "", names[product]);
    root.href = href(product + "/index.html");
    breadcrumb.append(root);
    const section = relative.split("/")[1];
    const sections = { guides: "Guides", interfaces: "Interfaces", concepts: "Concepts", reference: "Reference" };
    if (sections[section]) breadcrumb.append(element("span", "", "/ " + sections[section]));
  } else breadcrumb.append(element("span", "", relative.startsWith("contributing/") ? "Contributing" : "Documentation"));
  const version = element("a", "docs-version", "Source");
  version.href = href("versions.html");
  version.setAttribute("aria-label", "Documented source versions");
  context.append(breadcrumb, version);
  main.prepend(context);
  if (!relative || relative === "index.html") main.classList.add("docs-home");

  const source = [...main.querySelectorAll("a")].find(link => link.textContent === "Edit source");
  if (source) source.closest("p").classList.add("docs-source-note");
  const headings = [...main.querySelectorAll("h2[id], h3[id]")].filter(heading => !heading.closest("details"));
  const rail = element("aside", "docs-rail");
  rail.setAttribute("aria-label", "On this page");
  rail.append(element("p", "docs-rail-title", headings.length ? "On this page" : "Page resources"));
  const toc = element("nav", "docs-toc");
  toc.setAttribute("aria-label", "Page sections");
  for (const heading of headings) {
    const link = element("a", "", heading.textContent);
    link.href = "#" + heading.id;
    link.dataset.level = heading.tagName.slice(1);
    toc.append(link);
  }
  if (headings.length) rail.append(toc);
  const tools = element("div", "docs-page-tools");
  const issue = element("a", "", "Report an issue ↗");
  issue.href = "https://github.com/cubearc/docs/issues/new";
  tools.append(issue);
  if (source) {
    const view = element("a", "", "View page source ↗");
    view.href = source.href;
    tools.append(view);
  }
  rail.append(tools);
  document.body.append(rail);
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const current = entries.find(entry => entry.isIntersecting);
      if (!current) return;
      for (const link of toc.querySelectorAll("a")) link.classList.toggle("is-active", link.hash.slice(1) === current.target.id);
    }, { rootMargin: "-100px 0px -65% 0px" });
    headings.forEach(heading => observer.observe(heading));
  }
})();
