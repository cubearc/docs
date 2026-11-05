/** Exact canonical links, with unversioned family links retained as aliases. */
export function toolLink(action) {
  return `#/tools/${encodeURIComponent(action.id)}/${encodeURIComponent(action.contract.operation_version)}`;
}

export function resolveToolLink(hash, tools, mode = 'Decode') {
  const [, section, encodedKey, encodedVersion, ...extra] = hash.split('/');
  if (section !== 'tools' || !encodedKey) return { detailOpen: false, routeError: '' };
  let key; let version;
  try {
    key = decodeURIComponent(encodedKey);
    version = encodedVersion === undefined ? null : decodeURIComponent(encodedVersion);
  } catch { return { detailOpen: true, tool: null, action: null, routeError: 'This tool link is malformed. Return to All tools to choose an operation.' }; }
  const legacy = tools.filter(tool => tool.legacyToolIds?.includes(key));
  const tool = tools.find(tool => tool.actions.some(action => action.id === key)) ?? tools.find(tool => tool.key === key)
    ?? legacy.find(tool => tool.actions.some(action => action.id.endsWith(`.${mode.toLowerCase()}`))) ?? legacy[0];
  if (!tool || extra.length) return { detailOpen: true, tool: null, action: null, routeError: 'This tool link is not in the current catalog. Return to All tools to choose an operation.' };
  const action = tool.actions.find(action => action.id === key) ?? tool.actions.find(action => action.id.endsWith(`.${mode.toLowerCase()}`)) ?? tool.actions[0];
  return {
    detailOpen: true, tool: tool.key, action: action.id,
    routeError: version !== null && version !== String(action.contract.operation_version)
      ? `This link requests operation version ${version}. This catalog provides version ${action.contract.operation_version}. Choose the current version to use this tool.` : '',
  };
}

/** Routes carry navigation only, never user input or sensitive options. */
export function resolveWorkspaceRoute(hash,tools,mode='Decode') {
  if(hash && !hash.startsWith('#/'))return null;
  const [,section,key]=hash.split('/');
  if(section==='pipelines')return {activity:'pipelines',action:null,routeError:''};
  if(['tools','tool'].includes(section)&&key){
    const route=resolveToolLink(hash.replace(/^#\/tool\//,'#/tools/'),tools,mode);
    const action=tools.flatMap(tool=>tool.actions).find(action=>action.id===route.action)??null;
    return {activity:'playground',action,routeError:route.routeError};
  }
  if(!section||section==='playground'||section==='tools')return {activity:'playground',action:null,routeError:'',search:section==='tools'};
  return {activity:'playground',action:null,routeError:'This workspace link is unavailable. Select a tool or open Multidecoder.'};
}
