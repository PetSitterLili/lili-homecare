import assert from 'node:assert/strict';
import {bookingPriority} from '../docs/workspace-model.mjs';
for(const [d,t,n] of [['2026-11-29','2026-11-27',0],['2026-11-30','2026-11-27',1],['2026-12-01','2026-11-27',2],['2027-01-01','2026-11-27',3],['','2026-11-27',4],['2027-01-03','2026-12-28',0],['2027-01-04','2026-12-28',2],['2026-11-30','2026-11-30',0],['2026-12-06','2026-11-30',0],['2026-12-07','2026-11-30',2]])assert.equal(bookingPriority(d,t),n,d+' '+t);
console.log('booking priority boundaries OK');
