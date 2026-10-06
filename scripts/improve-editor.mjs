import { readFile, writeFile } from 'node:fs/promises';
const path = 'apps/web/src/features/editor/EditorPage.tsx';
let text = await readFile(path, 'utf8');
text = text.replace('useSearchParams}', 'useSearchParams,useBlocker}');
text = text.replace(
  'const baseline=useRef(JSON.stringify(blankContent));',
  "const [tagText,setTagText]=useState('');const baseline=useRef(JSON.stringify(blankContent));const lastFailed=useRef('');const latestSave=useRef<()=>Promise<Asset|null>>(async()=>null);const blocker=useBlocker(()=>JSON.stringify(content)!==baseline.current); ",
);
text = text.replace(
  'setContent(a.content);setProjectId',
  "setContent(a.content);setTagText(a.content.tags.join(', '));setProjectId",
);
text = text.replace(
  "setSaveStatus('Save failed — edits retained');",
  "lastFailed.current=JSON.stringify(content);setSaveStatus('Save failed — edits retained');",
);
text = text.replace(
  'if(id&&existing.loading)return',
  'latestSave.current=save;useEffect(()=>{const snapshot=JSON.stringify(content);if(!asset||busy||snapshot===baseline.current||snapshot===lastFailed.current||!contentSchema.safeParse(content).success)return;const timer=setTimeout(()=>{void latestSave.current();},1200);return()=>clearTimeout(timer);},[content,asset,busy]);\n if(id&&existing.loading)return',
);
text = text.replace(
  'return <><Link to="/workspace"',
  'return <>{blocker.state===\'blocked\'&&<div className="panel p-5 mb-5" role="alert"><h3>You have unsaved changes</h3><p className="my-3 text-slate-500">Stay here to save your draft, or discard the unsaved changes and leave.</p><Button onClick={()=>blocker.reset()}>Keep editing</Button><Button variant="ghost" onClick={()=>blocker.proceed()}>Discard and leave</Button></div>}<Link to="/workspace"',
);
text = text.replace(
  "value={content.tags.join(', ')} onChange={e=>set('tags',e.target.value.split(',').map(t=>t.trim()).filter(Boolean))}",
  "value={tagText} onChange={e=>{setTagText(e.target.value);set('tags',e.target.value.split(',').map(t=>t.trim()).filter(Boolean));}}",
);
text = text.replace(
  'Save your draft before leaving.',
  'Valid changes to existing drafts save automatically. Save a new draft once to enable autosave.',
);
text = text.replace('stages:[]}),[projectId', 'stages:[]}),[projectId');
await writeFile(path, text);
