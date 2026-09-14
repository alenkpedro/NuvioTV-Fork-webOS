// SPDX-License-Identifier: GPL-3.0-only
// Profile-scoped, durable item mutations. No snapshot replacement or provider writes.
export const mutationId = (kind, key) => `${kind}:${key}`;
const episodeIdentity=v=>v?.episode?JSON.stringify([v.type,v.meta.id,v.episode.season,v.episode.episode]):null;
const episodeBase=v=>`progress:episode:${episodeIdentity(v)}`;
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
export function fingerprint(kind, value) {
  if (!value || (kind === 'watched' && !value.value)) return 'null';
  if (kind === 'library') return JSON.stringify([true, value.addedAt || 0]);
  if (kind === 'watched') return JSON.stringify([true, value.updated || 0]);
  return JSON.stringify([Math.round(value.time*1000),Math.round(value.duration*1000),value.updated || 0]);
}
export function enqueue(state, kind, key, value, {legacy=false}={}) {
  if (!state.activeProfile) return;
  state.outbox ||= {}; state.syncBases ||= {};
  const id=mutationId(kind,key);let old=state.outbox[id];
  if(kind==='progress' && episodeIdentity(value)) for(const [otherId,other] of Object.entries(state.outbox)) {
    if(otherId!==id && other.kind===kind && episodeIdentity(other.value)===episodeIdentity(value)) {old ||= other;delete state.outbox[otherId];}
  }
  if (!old && Object.keys(state.outbox).length >= 3000) throw Error('Fila cheia: sincronize as 3.000 alterações pendentes antes de adicionar outras.');
  state.outboxRevision=(state.outboxRevision || 0)+1;
  state.outbox[id]={kind,key,value:clone(value),revision:state.outboxRevision,base:old?.base ?? (legacy?'unknown':state.syncBases[id] ?? (kind==='progress' && episodeIdentity(value)?state.syncBases[episodeBase(value)]:undefined) ?? 'unknown')};
}
export function initializeOutbox(state) {
  if (!state.activeProfile || state.outboxInitialized) return;
  for (const [key,value] of Object.entries(state.progress)) if(value.origin !== 'nuvio') enqueue(state,'progress',key,value,{legacy:true});
  for (const [key,value] of Object.entries(state.watchedOverrides || {})) enqueue(state,'watched',key,value,{legacy:true});
  for (const [key,value] of Object.entries(state.librarySync ? state.libraryOverrides || {} : {...state.library,...state.libraryOverrides})) enqueue(state,'library',key,value,{legacy:true});
  state.outboxInitialized=true;
}
export function observeSnapshot(state, kind, values) {
  state.syncBases ||= {};
  for (const id of Object.keys(state.syncBases)) if(id.startsWith(`${kind}:`)) delete state.syncBases[id];
  // A successful full pull establishes absence as well as presence.
  state.syncKnown ||= {}; state.syncKnown[kind]=true;
  for(const [key,value] of Object.entries(values)) {
    state.syncBases[mutationId(kind,key)]=fingerprint(kind,value);
    if(kind==='progress' && episodeIdentity(value))state.syncBases[episodeBase(value)]=fingerprint(kind,value);
  }
}
export function enqueueKnown(state,kind,key,value) {
  const id=mutationId(kind,key);
  if(state.syncKnown?.[kind] && !Object.hasOwn(state.syncBases || {},id)) (state.syncBases ||= {})[id]=kind==='progress' && episodeIdentity(value)?state.syncBases[episodeBase(value)] ?? 'null':'null';
  enqueue(state,kind,key,value);
}
function applyRemote(state, op, remote) {
  const {kind,key}=op;
  if(kind==='progress') {
    if(remote) state.progress[key]={...remote,id:op.value?.id || remote.id,meta:{...remote.meta,...op.value?.meta},origin:'nuvio'}; else delete state.progress[key];
    state.progress=Object.fromEntries(Object.entries(state.progress).sort((a,b)=>b[1].updated-a[1].updated).slice(0,100));
  }
  if(kind==='library') { delete state.libraryOverrides?.[key]; if(remote) state.library[key]=remote; else delete state.library[key]; }
  if(kind==='watched') {
    delete state.watchedOverrides?.[key]; state.watchedRecords ||= {};
    if(remote?.value) state.watchedRecords[key]={...remote,origin:'nuvio'}; else delete state.watchedRecords[key];
    const item=remote || op.value;
    if(item?.season == null) { const titleKey=JSON.stringify([item.type,item.id]); if(remote?.value) state.watched[titleKey]=true; else delete state.watched[titleKey]; }
  }
  delete state.historyConflicts?.[mutationId(kind,key)];
}
export function resolveQueuedChoice(state,kind,key,remote,useRemote) {
  const id=mutationId(kind,key), op=state.outbox?.[id]; if(!op)return;
  if(useRemote) { applyRemote(state,op,remote); delete state.outbox[id]; }
  else {
    const value=clone(op.value);
    if(value && kind!=='library') value.updated=Date.now();
    state.outboxRevision=(state.outboxRevision || 0)+1;
    state.outbox[id]={...op,value,revision:state.outboxRevision,base:fingerprint(kind,remote)};
    delete state.outbox[id].conflict;
    if(kind==='progress' && value) state.progress[key]=value;
    if(kind==='watched' && value) { state.watchedOverrides[key]=value;state.watchedRecords[key]=value; }
  }
}
export function resolveOutbound(state,id,useRemote,revision) {
  const op=state.outbox?.[id];
  if(!op?.conflict || op.revision!==revision) throw Error('A alteração mudou. Atualize a tela antes de escolher.');
  resolveQueuedChoice(state,op.kind,op.key,op.conflict.remote,useRemote);
}
export function syncSummary(state) {
  const ops=Object.values(state.outbox || {}), conflicts=ops.filter(o=>o.conflict).length;
  if(!state.activeProfile)return 'Entre em um perfil para sincronizar com o Nuvio.';
  return `${ops.length} alteração(ões) pendente(s)${conflicts?` · ${conflicts} conflito(s) para revisar`:''}. ${state.outboxStatus?.error || (state.outboxStatus?.at?'Último envio confirmado: '+new Date(state.outboxStatus.at).toLocaleString('pt-BR'):'Envio automático ao Nuvio quando houver conexão.')}`;
}
export async function flushOutbox({state,account,access,signal,persist,isCurrent,clientId,limit=20}) {
  const check=()=>{if(signal.aborted || !isCurrent() || account.user?.id!==access.userId)throw new DOMException('Cancelado','AbortError');};
  check(); if(!Object.keys(state.outbox || {}).length)return {sent:0};
  // Complete preflight before any write; a failed page leaves the entire queue intact.
  const [library,history]=await Promise.all([account.library(access.id,signal),account.history(access.id,signal)]);check();
  const snapshots={library,progress:history.progress,watched:history.watched};
  for(const [kind,values] of Object.entries(snapshots))observeSnapshot(state,kind,values);
  if(!persist())throw Error('Não foi possível salvar a fila. O envio foi pausado.');
  let sent=0;
  for(const [id,op] of Object.entries(state.outbox)) {
    check(); if(sent>=limit)break;
    if(state.outbox[id]?.revision!==op.revision)continue;
    const remote=snapshots[op.kind][op.key] || (op.kind==='progress' && episodeIdentity(op.value)?Object.values(snapshots.progress).find(v=>episodeIdentity(v)===episodeIdentity(op.value)):null) || null;
    const actual=fingerprint(op.kind,remote), desired=fingerprint(op.kind,op.value);
    const same=actual===desired || (op.kind==='library' && Boolean(remote)===Boolean(op.value)) || (op.kind==='watched' && remote?.value && op.value?.value && remote.updated>=op.value.updated);
    if(!same) {
      const changed=op.base!==actual;
      const localNewer=op.base!=='unknown' && op.kind==='progress' && remote && op.value?.updated>=remote.updated;
      if(changed && !localNewer) {
        state.outbox[id]={...op,conflict:{remote:clone(remote)}};continue;
      }
      delete op.conflict;
      if(!persist())throw Error('Não foi possível salvar a fila. O envio foi pausado.');
      await account.mutate(access.id,op,clientId,signal,access.userId);check();sent++;
    }
    // A playback save during a request must remain pending for the next cycle.
    if(state.outbox[id]?.revision===op.revision) {
      applyRemote(state,op,same?remote:op.value);
      delete state.outbox[id];state.syncBases[id]=same?actual:desired;
      state.outboxStatus={at:Date.now()};
      if(!persist())throw Error('Confirmação recebida, mas não foi possível salvá-la. A fila será conferida novamente.');
    } else if(!same && state.outbox[id]) {
      // Rebase a newer local edit on our acknowledged write; never delete it.
      state.outbox[id].base=desired;
      if(!persist())throw Error('Não foi possível salvar a fila após o envio.');
    }
  }
  persist();return {sent};
}
