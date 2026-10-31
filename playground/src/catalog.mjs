/** Join explicit editorial presentation with canonical contracts and real capabilities. */
export function toolsFor(contracts, presentation, runtime) {
  if (presentation.format_version !== 1) throw new Error('Unsupported presentation format. Reload the complete site.');
  const direct = new Map(runtime.executors.map(entry => [entry.operation, entry]));
  const pipelines = new Map(runtime.pipelineAdapters.map(entry => [entry.operation, entry]));
  const families = new Map();
  for (const contract of contracts) {
    const entry = presentation.operations[contract.operation];
    const tool = presentation.tools?.[entry?.tool_id];
    const category = presentation.categories[contract.category];
    if (!entry?.display_name || !entry.summary || !tool?.display_name || !tool.summary || !category) {
      throw new Error(`Missing explicit presentation for ${contract.operation}`);
    }
    if (!families.has(entry.tool_id)) families.set(entry.tool_id, {
      key: entry.tool_id, title: tool.display_name, description: tool.summary,
      aliases: tool.aliases ?? [], legacyToolIds: tool.legacy_tool_ids ?? [],
      category: contract.category, categoryTitle: category, actions: [],
    });
    const family = families.get(entry.tool_id);
    if (family.category !== contract.category) throw new Error('Presentation groups different categories.');
    family.actions.push({ id: contract.operation, title: entry.display_name, description: entry.summary,
      aliases: entry.aliases ?? [], contract,
      direct: direct.get(contract.operation), pipeline: pipelines.get(contract.operation),
      available: direct.has(contract.operation) || pipelines.has(contract.operation),
      unavailableReason: direct.has(contract.operation) || pipelines.has(contract.operation) ? null
        : 'This operation is documented in Cube. No executable binding is available in this browser runtime.',
    });
  }
  return [...families.values()].sort((left, right) => left.title.localeCompare(right.title));
}

export function migrateFavorites(favorites, tools) {
  return [...new Set(favorites.flatMap(key => {
    const replacements = tools.filter(tool => tool.legacyToolIds.includes(key)).map(tool => tool.key);
    return replacements.length ? replacements : [key];
  }))];
}

export function searchTools(tools, { query = '', category = '', favoritesOnly = false, favorites = [] } = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return tools.filter(tool => {
    const text = `${tool.title} ${tool.description} ${tool.aliases.join(' ')} ${tool.actions.map(action => `${action.id} ${action.title} ${action.description} ${action.aliases.join(' ')}`).join(' ')}`.toLocaleLowerCase();
    return (!category || tool.category === category) && terms.every(term => text.includes(term)) &&
      (!favoritesOnly || favorites.includes(tool.key) || tool.actions.some(action => favorites.includes(action.id)));
  });
}
