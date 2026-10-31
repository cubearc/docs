/** Presentation joins canonical contracts with actual runtime capabilities. */
export function toolsFor(contracts, presentation, runtime) {
  const direct = new Map(runtime.executors.map(entry => [entry.operation, entry]));
  const pipelines = new Map(runtime.pipelineAdapters.map(entry => [entry.operation, entry]));
  const families = new Map();
  for (const contract of contracts) {
    const title = presentation.operations[contract.operation];
    const category = presentation.categories[contract.category];
    if (!title || !category) throw new Error(`Missing canonical presentation naming for ${contract.operation}`);
    const key = contract.operation.replace(/\.(encode|decode)$/, '');
    if (!families.has(key)) families.set(key, []);
    families.get(key).push({
      id: contract.operation, title, contract,
      direct: direct.get(contract.operation), pipeline: pipelines.get(contract.operation),
      available: direct.has(contract.operation) || pipelines.has(contract.operation),
      unavailableReason: direct.has(contract.operation) || pipelines.has(contract.operation) ? null
        : 'This operation is documented in Cube. No executable binding is available in this browser runtime.',
    });
  }
  return Array.from(families, ([family, actions]) => ({
    key: actions.length > 1 ? family : actions[0].id,
    title: actions.length > 1 ? actions[0].title.replace(/^(Encode|Decode)( with)? /, '') : actions[0].title,
    description: actions.length > 1
      ? `Encode or decode data with ${actions[0].title.replace(/^(Encode|Decode)( with)? /, '')}.`
      : actions[0].contract.description,
    category: actions[0].contract.category,
    categoryTitle: presentation.categories[actions[0].contract.category],
    actions,
  })).sort((left, right) => left.title.localeCompare(right.title));
}

export function searchTools(tools, { query = '', category = '', favoritesOnly = false, favorites = [] } = {}) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return tools.filter(tool => {
    const text = `${tool.title} ${tool.description} ${tool.actions.map(action => `${action.id} ${action.title}`).join(' ')}`.toLocaleLowerCase();
    return (!category || tool.category === category) && terms.every(term => text.includes(term)) &&
      (!favoritesOnly || favorites.includes(tool.key) || tool.actions.some(action => favorites.includes(action.id)));
  });
}
