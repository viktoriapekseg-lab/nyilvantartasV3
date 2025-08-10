import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const envOk = Boolean(url && key);
export const supabase = envOk ? createClient(url, key) : (null as any);

export type Partner = { id: string; name: string; contact?: string; note?: string };
export type CrateType = { id: string; label: string; archived?: boolean };
export type Movement = { id: string; partner_id: string; direction: 'out'|'in'; crate_type_id: string; qty: number; date: string; note?: string; driver_name?: string; created_at?: string };

export async function loadAll(){
  if(!envOk) throw new Error('ENV_MISSING');
  const [p,c,m] = await Promise.all([
    supabase.from('partners').select('*').order('name'),
    supabase.from('crate_types').select('*').order('id'),
    supabase.from('movements').select('*').order('created_at', { ascending:false }),
  ]);
  if(p.error) throw p.error; if(c.error) throw c.error; if(m.error) throw m.error;
  return { partners: p.data as Partner[], crateTypes: c.data as CrateType[], movements: m.data as Movement[] };
}

export const addPartner = (row: Omit<Partner,'id'> & Partial<Pick<Partner,'id'>>) => supabase.from('partners').insert(row).select('*').single();
export const deletePartner = (id: string) => supabase.from('partners').delete().eq('id', id);
export const addCrateType = (row: CrateType) => supabase.from('crate_types').insert(row).select('*').single();
export const setCrateTypeArchived = (id: string, archived: boolean) => supabase.from('crate_types').update({ archived }).eq('id', id);
export const deleteCrateType = (id: string) => supabase.from('crate_types').delete().eq('id', id);
export const addMovement = (row: Omit<Movement,'id'|'created_at'>) => supabase.from('movements').insert(row).select('*').single();
export const deleteMovement = (id: string) => supabase.from('movements').delete().eq('id', id);


// --- added by patch ---
export const updatePartner = (id: string, patch: any) =>
  supabase.from('partners').update(patch).eq('id', id).select('*').single();
