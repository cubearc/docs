import {instrumentSeries} from '../../src/instruments/registry.mjs';

// Instrument regression suites deliberately use explicit execution; first-use
// automatic execution is covered separately by persistent-workbench.e2e.mjs.
export async function manualExecution(page) {
  const control=page.getByLabel('Automatic updates',{exact:true});
  await page.locator('#playground-heading').waitFor({timeout:45000});
  if(await control.isVisible()&&await control.isChecked())await control.uncheck();
}
export async function loadCoreExample(page,{wait=true}={}) {
  const load=page.locator('#load-core-example');
  if(!await load.isVisible())await page.getByText('About this tool',{exact:true}).click();
  await load.click();
  if(wait)await page.getByText('Core example loaded.',{exact:true}).waitFor();
}
export async function selectInstrument(page,kind) {
  const descriptor=instrumentSeries.find(row=>row.kind===kind);
  if(await page.locator('#toggle-tools').isVisible())await page.locator('#toggle-tools').click();
  await page.locator('#tool-search').fill(descriptor.operations[0]);
  await page.locator('.sidebar-tool[data-tool]').first().click();
  await manualExecution(page);
  const action=page.locator('#instrument-action, #tool-action');
  if(await action.count()&&await action.inputValue()!==descriptor.operations[0])await action.selectOption(descriptor.operations[0]);
  if(descriptor.profile){
    const parameters=page.locator('#instrument-tab-parameters');
    if(await parameters.count())await parameters.click();
    await page.locator('#playground-options-profile').selectOption(descriptor.profile);
    await page.locator('#instrument-tab-visual').click();
  }
  await page.locator(`[data-instrument="${kind}"]`).waitFor();
}
export async function navigateActivity(page,name) {
  if(await page.locator('#toggle-tools').isVisible()&&!await page.locator('#tool-search').isVisible())await page.locator('#toggle-tools').click();
  await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:name==='Playground'?'Multidecoder':name,exact:true}).click();
}
