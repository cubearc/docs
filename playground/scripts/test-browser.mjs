import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile,open} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const engine=process.env.BROWSER_ENGINE ?? 'chromium';
if(!['chromium','firefox','webkit'].includes(engine))throw new Error('Choose chromium, firefox or webkit.');
const diagnosticOptions=['PLAYGROUND_SOURCE_OVERRIDES','PLAYGROUND_SOURCE_MEDIA','PLAYGROUND_SOURCE_MECHANISMS','INSTRUMENT_SOURCE','MECHANISM_SOURCE','MEDIA_CASE'];
if(diagnosticOptions.some(name=>process.env[name]))throw new Error('Run individual tests for source overrides or case filters. This runner checks the complete built application.');
const build=JSON.parse(await readFile(join(root,'dist/build-report.json'),'utf8'));
const reportPath=resolve(process.env.PLAYGROUND_A11Y_REPORT ?? join(root,'test-results',engine,'report.json'));
const evidenceRoot=resolve(process.env.PLAYGROUND_EVIDENCE ?? join(dirname(reportPath),'screenshots'));
const suites=(await readdir(join(root,'tests'))).filter(name=>name.endsWith('.e2e.mjs')).sort();
const report={formatVersion:1,browser:engine,build,sourceOverrides:false,suites:[],passed:false};
await mkdir(dirname(reportPath),{recursive:true});
for(const name of suites){
 const suite=name.slice(0,-'.e2e.mjs'.length);
 const folder=join(`${reportPath}.parts`,suite);
 const screenshotFolder=join(evidenceRoot,suite);
 await mkdir(folder,{recursive:true});await mkdir(screenshotFolder,{recursive:true});
 const log=join(folder,'test.log'),accessibilityPath=join(folder,'a11y.json');
 const output=await open(log,'w');
 const started=new Date().toISOString();
 const child=spawn(process.execPath,['--test',join(root,'tests',name)],{cwd:root,env:{...process.env,BROWSER_ENGINE:engine,PLAYGROUND_EVIDENCE:screenshotFolder,PLAYGROUND_A11Y_REPORT:accessibilityPath},stdio:['ignore',output.fd,output.fd]});
 const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 await output.close();
 let accessibility=null,reportError;
 try{accessibility=JSON.parse(await readFile(accessibilityPath,'utf8'));}catch(error){if(error.code!=='ENOENT')reportError=error.message;}
 const passed=exitCode===0&&!reportError;
 report.suites.push({suite,exitCode,passed,started,finished:new Date().toISOString(),log,screenshots:screenshotFolder,accessibility,...(reportError?{reportError}:{})});
 report.passed=report.suites.length===suites.length&&report.suites.every(row=>row.passed);
 await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(`${engine}: ${suite} ${passed?'PASS':'FAIL'} (${log})`);
 if(!passed)console.error((await readFile(log,'utf8')).slice(-20000));
}
if(!report.passed)process.exitCode=1;
