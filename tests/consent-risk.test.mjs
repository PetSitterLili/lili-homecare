import assert from 'node:assert/strict';
import {fresh,normalize,publicBlocks,tasks} from '../docs/workspace-model.mjs';
// The one-time consent correction UI was retired after the owner confirmed completion.
// Keep tests for the stored authorization fields and private risk markers.
const f=fresh();f.clientRisk={status:'blacklist',note:'PRIVATE TEST'};f.media={status:'yes',note:'需審閱',decisionEditedAt:'2026-11-26',legacyConsentFixedAt:'2026-11-26'};
const g=normalize(f);
assert(g.clientRisk.status==='blacklist'&&g.clientRisk.note==='PRIVATE TEST','risk persists');
assert(!JSON.stringify(publicBlocks(f)).includes('PRIVATE TEST'),'private excludes public blocks');
assert(!JSON.stringify(tasks(f)).includes('PRIVATE TEST'),'private excludes tasks');
assert(g.media.status==='yes'&&g.media.note==='需審閱','consent preserved');
assert(g.media.decisionEditedAt==='2026-11-26'&&g.media.legacyConsentFixedAt==='2026-11-26','historical markers preserved');
assert(normalize(fresh()).clientRisk.status==='normal','normal default');
