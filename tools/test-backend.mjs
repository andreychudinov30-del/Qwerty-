// End-to-end check of the Supabase backend: identities, friends, rooms, invites, realtime broadcast/presence.
import { createClient } from '@supabase/supabase-js';
const URL = 'https://jygztbziluxcfwmeuhnj.supabase.co', KEY = 'sb_publishable_Q4PK0rozKFi_mLBLR2bV5Q_6acpeJc1';
const mk = () => createClient(URL, KEY, { auth: { persistSession: false } });
const A = mk(), B = mk();
const rpc = async (c, fn, args) => { const { data, error } = await c.rpc(fn, args); if (error) throw new Error(fn + ': ' + error.message); return data; };
const a = await rpc(A, 'mh_register', { p_name: 'TestA' });
const b = await rpc(B, 'mh_register', { p_name: 'TestB' });
console.log('registered', a.id, b.id);
const ca = { p_id: a.id, p_secret: a.secret }, cb = { p_id: b.id, p_secret: b.secret };
try { await rpc(A, 'mh_heartbeat', { p_id: a.id, p_secret: 'wrong', p_status: 'menu', p_room: '', p_name: 'x', p_skin: 'x' }); console.log('FAIL: bad secret accepted'); } catch (e) { console.log('bad secret rejected ✓'); }
console.log('request', await rpc(A, 'mh_friend_request', { ...ca, p_target: b.id }));
let hb = await rpc(B, 'mh_heartbeat', { ...cb, p_status: 'menu', p_room: '', p_name: 'TestB', p_skin: 'stalker' });
console.log('B requests', JSON.stringify(hb.requests));
await rpc(B, 'mh_friend_respond', { ...cb, p_other: a.id, p_accept: true });
hb = await rpc(A, 'mh_heartbeat', { ...ca, p_status: 'lobby', p_room: '', p_name: 'TestA', p_skin: 'rescuer' });
console.log('A friends', JSON.stringify(hb.friends));
const room = await rpc(A, 'mh_room_create', { ...ca, p_mission: 'c1m1' });
console.log('room', room);
await rpc(A, 'mh_invite', { ...ca, p_to: b.id, p_room: room.code });
hb = await rpc(B, 'mh_heartbeat', { ...cb, p_status: 'menu', p_room: '', p_name: 'TestB', p_skin: 'stalker' });
console.log('B invites', JSON.stringify(hb.invites));
const joined = await rpc(B, 'mh_room_join', { ...cb, p_code: room.code });
console.log('joined', JSON.stringify(joined));
// realtime
const got = [];
const chA = A.channel('mh-room-' + room.code, { config: { broadcast: { self: false }, presence: { key: a.id } } });
const chB = B.channel('mh-room-' + room.code, { config: { broadcast: { self: false }, presence: { key: b.id } } });
chB.on('broadcast', { event: 'st' }, ({ payload }) => got.push(payload));
let presence = null;
chA.on('presence', { event: 'sync' }, () => { presence = Object.keys(chA.presenceState()); });
const sub = (ch, who) => new Promise((res, rej) => { ch.subscribe(async (st) => { if (st === 'SUBSCRIBED') { await ch.track({ id: who }); res(); } else if (st !== 'CLOSED') console.log(who, st); }); setTimeout(() => rej(new Error('subscribe timeout ' + who)), 15000); });
await sub(chA, a.id); await sub(chB, b.id);
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 5; i++) { await chA.send({ type: 'broadcast', event: 'st', payload: { i, x: i * 0.5 } }); await new Promise((r) => setTimeout(r, 120)); }
await new Promise((r) => setTimeout(r, 2000));
console.log('broadcast received by B:', got.length, '/ 5', 'presence seen by A:', presence);
await rpc(A, 'mh_room_leave', { ...ca, p_code: room.code });
await rpc(A, 'mh_friend_remove', { ...ca, p_other: b.id });
await A.removeAllChannels(); await B.removeAllChannels();
process.exit(got.length >= 4 ? 0 : 1);
