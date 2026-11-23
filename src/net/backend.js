// Supabase backend: player identity (ID + secret), friends, rooms, invites via SECURITY DEFINER RPCs.
// The publishable key is safe to ship in the client: tables are RLS-locked and every RPC checks the player secret.
import { createClient } from '@supabase/supabase-js';
import { getProfile, saveProfile } from '../core/save.js';
import { bus } from '../core/util.js';

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://jygztbziluxcfwmeuhnj.supabase.co';
export const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_KEY || 'sb_publishable_Q4PK0rozKFi_mLBLR2bV5Q_6acpeJc1';

let client = null;
export function supabase() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 40 } } });
  return client;
}

async function rpc(fn, args) {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message || String(error));
  return data;
}

export const backend = {
  configured: !!(SUPABASE_URL && SUPABASE_KEY),
  status: 'menu',
  room: '',
  last: null,

  async ensurePlayer() {
    const p = getProfile();
    if (p.online.id && p.online.secret) return p.online;
    const r = await rpc('mh_register', { p_name: p.name });
    p.online.id = r.id; p.online.secret = r.secret;
    saveProfile(true);
    bus.emit('online:id', r.id);
    return p.online;
  },
  creds() { const p = getProfile(); return { p_id: p.online.id, p_secret: p.online.secret }; },

  async heartbeat() {
    await this.ensurePlayer();
    const p = getProfile();
    const data = await rpc('mh_heartbeat', { ...this.creds(), p_status: this.status, p_room: this.room || '', p_name: p.name, p_skin: p.skin });
    this.last = data;
    for (const inv of data.invites || []) bus.emit('invite', inv);
    bus.emit('friends', data);
    return data;
  },
  async addFriend(id) { await this.ensurePlayer(); return rpc('mh_friend_request', { ...this.creds(), p_target: id }); },
  async respondFriend(id, accept) { return rpc('mh_friend_respond', { ...this.creds(), p_other: id, p_accept: accept }); },
  async removeFriend(id) { return rpc('mh_friend_remove', { ...this.creds(), p_other: id }); },
  async createRoom(mission) { await this.ensurePlayer(); return rpc('mh_room_create', { ...this.creds(), p_mission: mission }); },
  async joinRoom(code) { await this.ensurePlayer(); return rpc('mh_room_join', { ...this.creds(), p_code: code }); },
  async updateRoom(code, mission, state) { return rpc('mh_room_update', { ...this.creds(), p_code: code, p_mission: mission || '', p_state: state || '' }); },
  async leaveRoom(code) { return rpc('mh_room_leave', { ...this.creds(), p_code: code }); },
  async invite(to, room) { return rpc('mh_invite', { ...this.creds(), p_to: to, p_room: room }); },
  async rename() { return this.heartbeat(); },

  // background presence loop (online status + invites)
  startLoop() {
    if (!this.configured || this._loop) return;
    const tick = async () => { try { await this.heartbeat(); } catch (e) { /* offline */ } };
    tick();
    this._loop = setInterval(tick, 12000);
  },
};
