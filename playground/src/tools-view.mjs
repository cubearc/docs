import { h, button, notify, replace } from './dom.mjs';
import { searchTools } from './catalog.mjs';
import { toolLink } from './tool-route.mjs';

export function mountTools(container, context) {
  const { runtime, state, navigate, useTool, addStep, saveFavorites } = context;
  const page = state.catalog;
  const list = h('div', { class: 'tool-list' });
  const detail = h('aside', { class: 'tool-detail panel', 'aria-label': 'Selected tool', tabindex: -1 });
  const grid = h('div', { class: 'catalog-grid' });
  const count = h('p', { class: 'tool-count', role: 'status' });
  const query = h('input', { id: 'tool-search', class: 'catalog-search', type: 'search', value: page.query, placeholder: 'Search tools by name or what you want to do…', onInput: event => { page.query = event.target.value; page.shown = 50; renderList(); } });
  const categories = Object.entries(runtime.presentation.categories).sort((a, b) => a[1].localeCompare(b[1]));
  const rail = h('aside', { class: 'category-rail', 'aria-label': 'Tool categories' });
  const mobileFavorites = button('Favorites', () => { page.favoritesOnly = !page.favoritesOnly; renderCategories(); renderList(); });
  const categorySelect = h('select', { id: 'tool-category', onChange: event => { page.category = event.target.value; page.shown = 50; renderList(); renderCategories(); } },
    h('option', { value: '' }, 'All categories'), categories.map(([key, label]) => h('option', { value: key, selected: page.category === key }, label)));
  function category(key) { page.category = key; page.favoritesOnly = false; page.shown = 50; categorySelect.value = key; renderCategories(); renderList(); }
  function renderCategories() {
    mobileFavorites.textContent = page.favoritesOnly ? 'Show all tools' : 'Favorites';
    mobileFavorites.setAttribute('aria-pressed', String(page.favoritesOnly));
    rail.replaceChildren(button('All tools', () => category(''), { 'aria-pressed': String(!page.category && !page.favoritesOnly) }),
      button('Favorites', () => { page.favoritesOnly = !page.favoritesOnly; renderCategories(); renderList(); }, { 'aria-pressed': String(page.favoritesOnly) }),
      h('p', { class: 'small muted separator' }, 'Categories'),
      ...categories.map(([key, title]) => button(title, () => category(key), { 'aria-pressed': String(page.category === key) })));
  }
  function favorite(tool) {
    const index = state.favorites.indexOf(tool.key);
    if (index >= 0) state.favorites.splice(index, 1); else state.favorites.push(tool.key);
    saveFavorites(); renderList();
  }
  function select(tool) {
    page.listScroll = scrollY; page.listFocus = tool.key;
    page.tool = tool.key; page.routeError = '';
    page.action = tool.actions.find(action => action.id.endsWith(`.${state.playground.mode.toLowerCase()}`))?.id ?? tool.actions[0].id;
    page.detailOpen = true;
    grid.classList.add('catalog-mobile-open');
    history.pushState(null, '', toolLink(tool.actions.find(action => action.id === page.action)));
    renderList(); renderDetail(); detail.focus();
  }
  function renderList() {
    const tools = searchTools(runtime.tools, { query: page.query, category: page.category, favoritesOnly: page.favoritesOnly, favorites: state.favorites });
    count.textContent = `${tools.length} tools · ${runtime.catalog.operations.length} canonical operations`;
    const visible = tools.slice(0, page.shown);
    replace(list, count, visible.map(tool => h('div', { class: `tool-row${page.tool === tool.key ? ' selected' : ''}` },
      button(h('span', {}, h('strong', {}, tool.title), h('span', {}, tool.description)), () => select(tool), { class: 'tool-select', 'data-tool': tool.key }),
      button(h('span', { 'aria-hidden': 'true' }, state.favorites.includes(tool.key) ? '★' : '☆'), () => favorite(tool), { class: 'favorite', id: `favorite-${tool.key}`, 'aria-label': `Favorite ${tool.title}`, 'aria-pressed': String(state.favorites.includes(tool.key)) }))),
      tools.length > visible.length ? button(`Show ${Math.min(50, tools.length - visible.length)} more tools`, () => { page.shown += 50; renderList(); }, { class: 'spacer' }) : null,
      !tools.length ? h('div', { class: 'empty-state' }, 'No matching tools. Try another name or category.') : null);
  }
  function renderDetail() {
    const tool = runtime.tools.find(tool => tool.key === page.tool);
    if (!tool) { detail.replaceChildren(h('h2', {}, page.routeError ? 'Tool link unavailable' : 'Choose a tool'), h('p', { class: page.routeError ? 'warning' : 'muted' }, page.routeError || 'Select a tool to see its explanation, example and available actions.'), page.routeError ? button('Return to All tools', () => navigate('tools')) : h('span')); return; }
    const action = tool.actions.find(action => action.id === page.action) ?? tool.actions[0];
    const example = h('section', { 'aria-label': 'Core reference example', class: 'tool-family-example' });
    const exactContract = h('pre', { role: 'region', tabindex: 0, 'aria-label': 'Exact operation contract' }, 'Loading the exact contract…');
    const contractIdentity = h('p', { class: 'small muted' });
    async function loadDetails() {
      replace(example, h('p', { role: 'status', class: 'small muted' }, 'Loading the reference example…'));
      try {
        const data = await runtime.toolDetails(action);
        if (!example.isConnected) return;
        const values = (field, title) => Object.entries(data.example[field]).map(([name, value]) => h('div', {},
          h('p', { class: 'small muted' }, `${title} · ${name}`), h('div', { class: 'viewer' }, h('pre', { role: 'region', tabindex: 0, 'aria-label': `Example ${field === 'inputs' ? 'input' : field === 'outputs' ? 'output' : 'parameter'} ${name}` }, value))));
        replace(example, h('h3', {}, 'Example'), values('inputs', 'Input'),
          Object.keys(data.example.parameters).length ? h('details', {}, h('summary', {}, 'Example options'), values('parameters', 'Option')) : null,
          values('outputs', 'Expected output'),
          h('p', { class: 'small muted' }, 'Synthetic known-answer values from Core conformance. Byte objects use exact Base64; these are reference values, not results from your input or evidence of browser availability.'));
        exactContract.textContent = data.contract_json;
        contractIdentity.textContent = `Contract SHA-256: ${data.contract_sha256}`;
      } catch (error) {
        if (!example.isConnected) return;
        replace(example, h('p', { class: 'warning', role: 'alert' }, error.message), button('Retry reference details', loadDetails));
        exactContract.textContent = 'The exact contract could not be loaded. Retry the reference details or download the complete catalog.';
      }
    }

    replace(detail, button('← Back to tools', () => { grid.classList.remove('catalog-mobile-open'); page.restoreList = true; page.detailOpen = false; navigate('tools'); }, { class: 'detail-back' }),
      h('span', { class: 'small muted' }, tool.categoryTitle), h('h2', {}, tool.title),
      tool.actions.length > 1 ? h('div', { class: 'field' }, h('label', { for: 'tool-action' }, 'Action'), h('select', { id: 'tool-action', class: 'action-select', onChange: event => { page.action = event.target.value; page.routeError = ''; history.pushState(null, '', toolLink(tool.actions.find(row => row.id === page.action))); renderDetail(); } }, tool.actions.map(row => h('option', { value: row.id, selected: row.id === action.id }, row.title)))) : null,
      page.routeError ? h('div', {}, h('p', { class: 'warning', role: 'alert' }, page.routeError), button('Open current version', () => { page.routeError = ''; history.pushState(null, '', toolLink(action)); renderDetail(); })) : null,
      h('p', {}, action.description), h('span', { class: 'tag' }, action.available ? 'Available locally' : 'Documentation only'),
      example,
      h('details', { class: 'tool-family-example' }, h('summary', {}, 'Example from the Core documentation'), h('p', { class: 'small muted' }, 'This command-line example explains the operation. It does not establish browser availability.'), h('div', { class: 'viewer' }, h('pre', {}, action.contract.example))),
      !action.available ? h('p', { class: 'warning' }, action.unavailableReason) : null,
      button('Use tool', () => useTool(action), { class: 'primary', disabled: !action.available || Boolean(page.routeError) }),
      button('Add to pipeline', () => { if (action.pipeline) addStep(action); else notify('This operation has no supported linear pipeline adapter. You can use its direct tool action.'); }, { class: 'wide spacer', disabled: !action.pipeline || Boolean(page.routeError) }),
      !action.pipeline && action.available ? h('p', { class: 'small muted' }, 'Available as an individual tool. It cannot be added to the current linear pipeline model.') : null,
      h('p', {}, h('a', { href: `../cube/reference/operations/${encodeURIComponent(action.contract.category)}/${encodeURIComponent(action.id)}.html` }, 'Learn how it works')),
      h('details', {}, h('summary', {}, 'Technical details'), h('p', { class: 'small' }, h('code', {}, action.id), ` · operation version ${action.contract.operation_version}`),
        h('p', { class: 'small' }, action.contract.description),
        h('p', { class: 'small muted' }, `Inputs: ${action.contract.inputs.map(port => port.name).join(', ')}. Outputs: ${action.contract.outputs.map(port => port.name).join(', ')}.`),
        h('p', { class: 'small muted' }, `SDK ${runtime.sdk.build.sdkVersion} · Core ${runtime.sdk.build.coreRevision} · catalog SHA-256 ${runtime.sdk.build.catalogSha256}`),
        h('p', { class: 'small muted' }, 'The contract defines Core schemas and operation limits. The SDK and this Playground also enforce their own bounded runtime/input/retained-data limits; see Runtime details.'),
        contractIdentity, h('div', { class: 'viewer' }, exactContract),
        h('a', { href: `./tool-details/${encodeURIComponent(action.id)}.json`, download: `${action.id}.json` }, 'Download this exact contract and reference example'),
        h('p', {}, h('a', { href: './catalog.json', download: 'cube-catalog.json' }, 'Download the exact complete contract catalog'))));
    loadDetails();
  }
  renderCategories();
  if (page.detailOpen) grid.classList.add('catalog-mobile-open');
  grid.append(rail, list, detail);
  container.replaceChildren(h('div', { class: 'catalog-head' }, h('div', { class: 'heading' }, h('h1', {}, 'All tools'), h('p', {}, 'Find the right tool for your next step.')), h('div', {}, h('label', { for: 'tool-search' }, 'Search tools'), query)),
    h('div', { class: 'category-selector' }, h('label', { for: 'tool-category' }, 'Category'), categorySelect,
      mobileFavorites), grid);
  renderList(); renderDetail();
}
