import React, { useEffect, useMemo, useState, useRef } from 'react';
import { envOk, loadAll, addPartner, deletePartner, addCrateType, setCrateTypeArchived, deleteCrateType, addMovement, deleteMovement, updatePartner, type Partner as P, type CrateType as C, type Movement as M } from './lib/db';

type UserRole = 'admin' | 'driver';
type User = { name: string; role: UserRole };
const USERS_BY_PIN: Record<string, User> = {
  '0717': { name: 'Admin', role: 'admin' },
  '111111': { name: 'Ákos', role: 'driver' },
  '222222': { name: 'Gyuri', role: 'driver' },
  '333333': { name: 'Vasárnapi', role: 'driver' },
};
function validatePin(pin: string): User | null { return USERS_BY_PIN[pin] ?? null; }

type Movement = Omit<M,'created_at'> & { created_at?: string };
type Partner = P; type CrateType = C;

const SELECT_ALL = '__ALL__';

function csvEscape(v:any){ return '"' + String(v ?? '').replace(/"/g,'""') + '"'; }
function toCSV(rows: Record<string,string|number>[]) { if(!rows.length) return ''; const headers = Object.keys(rows[0]); return [headers.map(csvEscape).join(','), ...rows.map(r=> headers.map(h=> csvEscape(r[h])).join(',')).join('\n')].join('\n'); }
function formatCrateTypeLabel(map:Record<string,CrateType>, id:string){ return map[id]?.label ?? `${id} (törölt)`; }
function computeBalances(movements:Movement[]){ const map=new Map<string,number>(); for(const m of movements){ const key=`${m.partner_id}|${m.crate_type_id}`; const sign=m.direction==='out'?1:-1; const prev=map.get(key)||0; const next=prev+sign*(Number.isFinite(m.qty as number)? (m.qty as number):0); map.set(key,next);} return map; }
function movementMatchesFilters(m:{partner_id:string; crate_type_id:string; date?: string}, fp:string, ft:string, from:string, to:string, pb:Record<string,Partner>, cb:Record<string,CrateType>){
  const partnerOk = !fp || (pb[fp]? m.partner_id===fp : true);
  const typeOk = !ft || (cb[ft]? m.crate_type_id===ft : true);
  const fromOk = !from || (m.date ?? '') >= from;
  const toOk = !to || (m.date ?? '') <= to;
  return partnerOk && typeOk && fromOk && toOk;
}

export default function App(){
  const [user, setUser] = useState<User|null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [crateTypes, setCrateTypes] = useState<CrateType[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  useEffect(()=>{ if(!user) return; if(!envOk){ setError('ENV_MISSING'); return; } (async()=>{ try{ setLoading(true); const { partners, crateTypes, movements } = await loadAll(); setPartners(partners); setCrateTypes(crateTypes); setMovements(movements as any); setError(null); } catch(e:any){ setError(e?.message||String(e)); } finally{ setLoading(false); } })(); }, [user]);

  const balances = useMemo(()=> computeBalances(movements), [movements]);
  const partnersById = useMemo(()=> Object.fromEntries(partners.map(p=> [p.id,p])), [partners]);
  const crateTypesById = useMemo(()=> Object.fromEntries(crateTypes.map(c=> [c.id,c])), [crateTypes]);

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {!user ? <Login onLogin={setUser}/> : (
          <>
            <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold">Ládanyilvántartó</h1>
                <div className="text-sm text-gray-500">Bejelentkezve: <span className="font-medium">{user.name}</span> ({user.role==='admin'?'Admin':'Sofőr'})</div>
              </div>
              <div className="flex gap-2 flex-col sm:flex-row">
                <button className="btn btn-secondary" onClick={()=> exportCSV(partners, crateTypes, movements)}>Export</button>
                <button className="btn btn-danger" onClick={()=> setUser(null)}>Kijelentkezés</button>
              </div>
            </header>

            {!envOk ? <SetupNeeded/> : loading ? (
              <div className="card"><div className="card-content">Betöltés…</div></div>
            ) : error ? (
              <div className="card"><div className="card-content" style={{color:'#dc2626'}}>Hiba: {error}</div></div>
            ) : (
              <Tabs tabs={[
                {key:'movements',label:'Mozgások'},
                {key:'balances',label:'Egyenlegek'},
                ...(user.role==='admin'?[{key:'partners',label:'Partnerek'}]:[]),
                ...(user.role==='admin'?[{key:'settings',label:'Beállítások'}]:[]),
              ]} render={(k)=>{
                switch(k){
                  case 'movements': return <><MovementEntry user={user} partners={partners} crateTypes={crateTypes} onAdd={async (row)=>{ const res=await addMovement(row as any); if(res.error){ alert(res.error.message); return; } setMovements(s=> [res.data as any, ...s]); }}/><MovementTable user={user} movements={movements} partnersById={partnersById} crateTypesById={crateTypesById} onDelete={async (id)=>{ const r=await deleteMovement(id); if(r.error){ alert(r.error.message); return; } setMovements(s=> s.filter(x=> x.id!==id)); }}/></>;
                  case 'balances': return <BalancesTable balances={balances} partnersById={partnersById} crateTypes={crateTypes}/>;
                  case 'partners': return <PartnersCard partners={partners} setPartners={setPartners} />;
                  case 'settings': return <SettingsCard crateTypes={crateTypes} setCrateTypes={setCrateTypes} movements={movements} />;
                  default: return null;
                }
              }}/>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: User)=> void }){
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string|null>(null);
  const submit = ()=> { const u = validatePin(pin.trim()); if(!u){ setErr('Hibás PIN.'); return; } onLogin(u); };
  return <div className="min-h-[60vh] grid place-items-center">
    <form className="card" style={{maxWidth:480,width:'100%'}} onSubmit={(e)=>{ e.preventDefault(); submit(); }}>
      <div className="card-header"><div className="card-title">Belépés PIN-kóddal</div></div>
      <div className="card-content grid gap-3">
        <div>
          <label className="label">PIN</label>
          <input
            className="input"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            name="pin"
            value={pin}
            onChange={e=> setPin(e.target.value.replace(/\D/g,''))}
            placeholder="PIN megadása"
            onKeyDown={(e)=>{ if(e.key==='Enter') submit(); }}
          />
        </div>
        {err && <div style={{color:'#dc2626', fontSize:12}}>{err}</div>}
        <div className="flex justify-end">
          <button type="submit" className="btn btn-tiffany w-full sm:w-auto">Belépés</button>
        </div>
      </div>
    </form>
  </div>;
}

function SetupNeeded(){
  return <div className="card">
    <div className="card-header"><div className="card-title">Beállítás szükséges (Supabase)</div></div>
    <div className="card-content" style={{display:'grid',gap:8,fontSize:14}}>
      <p>Állítsd be a környezeti változókat a Vercelben, majd redeploy:</p>
      <ul style={{margin:'0 0 0 18px'}}>
        <li><code>VITE_SUPABASE_URL</code></li>
        <li><code>VITE_SUPABASE_ANON_KEY</code></li>
      </ul>
      <p>Táblák létrehozása: lásd a csomagban lévő <code>schema.sql</code>-t.</p>
      <p>Ha kész, frissítsd az oldalt.</p>
    </div>
  </div>;
}


function Tabs({tabs, render}:{tabs:{key:string,label:string}[]; render:(k:string)=>React.ReactNode}){
  const [active,setActive]=useState(tabs[0]?.key ?? 'movements');

  return <div>
    {/* Csak a tab gombsor legyen csúsztatható mobilon */}
    <div className="flex gap-2 bg-[#eef2f7] p-1.5 rounded-lg mb-3 overflow-x-auto no-scrollbar snap-x md:snap-none">
      {tabs.map(t=> (
        <button
          key={t.key}
          className={`btn ${active===t.key?'btn-secondary':''} snap-center shrink-0`}
          onClick={()=> setActive(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
    {/* Tartalom – nem vált tabot swipe-ra */}
    <div>
      {render(active)}
    </div>
  </div>;
}

}

function MovementEntry({ user, partners, crateTypes, onAdd }:{ user: User; partners: Partner[]; crateTypes: CrateType[]; onAdd: (row: Omit<Movement,'id'|'created_at'>)=> void | Promise<void>; }){
  const activeCrateTypes = useMemo(()=> crateTypes.filter(c=> !c.archived), [crateTypes]);
  const [partnerId, setPartnerId] = useState<string>(partners[0]?.id || '');
  const [direction, setDirection] = useState<Movement['direction']>('out');
  const [crateTypeId, setCrateTypeId] = useState<string>(activeCrateTypes[0]?.id || '');
  const [qty, setQty] = useState<string>('1');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [note, setNote] = useState<string>('');

  useEffect(()=>{ if(!partnerId && partners[0]) setPartnerId(partners[0].id); }, [partners, partnerId]);
  useEffect(()=>{ if(crateTypeId && !activeCrateTypes.some(c=> c.id===crateTypeId)) setCrateTypeId(''); }, [activeCrateTypes, crateTypeId]);

  return <div className="card mb-4">
    <div className="card-header"><div className="card-title">Új mozgás – {user.name}</div></div>
    <div className="card-content grid gap-3 grid-cols-1 md:grid-cols-6">
      <div className="md:col-span-2">
        <label className="label">Partner</label>
        <select className="select" value={partnerId} onChange={e=> setPartnerId(e.target.value)}>
          <option value="" disabled>Válassz partnert</option>
          {partners.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Irány</label>
        <select className="select" value={direction} onChange={e=> setDirection(e.target.value as Movement['direction'])}>
          <option value="out">Kiadás</option>
          <option value="in">Visszahozatal</option>
        </select>
      </div>
      <div>
        <label className="label">Típus</label>
        <select className="select" value={crateTypeId} onChange={e=> setCrateTypeId(e.target.value)}>
          <option value="" disabled>{activeCrateTypes.length? 'Válassz ládatípust' : 'Nincs aktív ládatípus'}</option>
          {activeCrateTypes.map(c=> <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Mennyiség</label>
        <input className="input" type="number" min={1} value={qty} onChange={e=> setQty(e.target.value)}/>
      </div>
      <div>
        <label className="label">Dátum</label>
        <input className="input" type="date" value={date} onChange={e=> setDate(e.target.value)}/>
      </div>
      <div className="md:col-span-6">
        <label className="label">Megjegyzés</label>
        <textarea className="textarea" rows={3} value={note} onChange={e=> setNote(e.target.value)} placeholder="pl. bizonylatszám"/>
      </div>
      <div className="md:col-span-6 flex justify-end">
        <button className="btn btn-invert w-full md:w-auto" onClick={async ()=>{
          if(!partnerId) return alert('Válassz partnert!'); 
          if(!crateTypeId) return alert('Válassz ládatípust!');
          const v = parseInt(qty,10); 
          if(!Number.isFinite(v)||v<=0) return alert('Adj meg érvényes mennyiséget!');
          await onAdd({ partner_id: partnerId, direction, crate_type_id: crateTypeId, qty: v, date, note, driver_name: user.name });
          setQty('1'); setNote('');
        }}>Rögzítés</button>
      </div>
    </div>
  </div>;
}

function MovementTable({ user, movements, partnersById, crateTypesById, onDelete }:{ user:User; movements:Movement[]; partnersById:Record<string,Partner>; crateTypesById:Record<string,CrateType>; onDelete:(id:string)=> void | Promise<void> }){
  const [filterPartner, setFilterPartner] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [showCount, setShowCount] = useState<number>(10);

  const filtered = useMemo(()=> movements.filter(m=> movementMatchesFilters(m, filterPartner, filterType, fromDate, toDate, partnersById, crateTypesById)), [movements, filterPartner, filterType, fromDate, toDate, partnersById, crateTypesById]);
  const visible = filtered.slice(0, showCount);

  // reset paging when filters change
  useEffect(()=>{ setShowCount(10); }, [filterPartner, filterType, fromDate, toDate]);

  return <div className="card">
    <div className="card-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="card-title">Rögzített mozgások</div>
      <div className="flex gap-2 flex-col sm:flex-row w-full sm:w-auto">
        <div>
          <label className="label">Partner</label>
          <select className="select" value={filterPartner || SELECT_ALL} onChange={e=> setFilterPartner(e.target.value===SELECT_ALL? '' : e.target.value)}>
            <option value={SELECT_ALL}>(Összes partner)</option>
            {Object.values(partnersById).map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Típus</label>
          <select className="select" value={filterType || SELECT_ALL} onChange={e=> setFilterType(e.target.value===SELECT_ALL? '' : e.target.value)}>
            <option value={SELECT_ALL}>(Összes típus)</option>
            {Object.values(crateTypesById).map(c=> <option key={c.id} value={c.id}>{c.label}{c.archived? ' (archív)': ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Dátumtól</label>
          <input className="input" type="date" value={fromDate} onChange={e=> setFromDate(e.target.value)}/>
        </div>
        <div>
          <label className="label">Dátumig</label>
          <input className="input" type="date" value={toDate} onChange={e=> setToDate(e.target.value)}/>
        </div>
        {(filterPartner||filterType||fromDate||toDate) && <button className="btn btn-secondary" onClick={()=>{ setFilterPartner(''); setFilterType(''); setFromDate(''); setToDate(''); }}>Szűrők törlése</button>}
      </div>
    </div>
    <div className="card-content">
      <div style={{overflow:'auto'}}>
        <table className="table">
          <thead>
            <tr>
              <th>Dátum</th>
              <th className="hidden sm:table-cell">Sofőr</th>
              <th>Partner</th>
              <th>Irány</th>
              <th>Típus</th>
              <th>Mennyiség</th>
              <th className="hidden sm:table-cell">Megjegyzés</th>
              <th style={{textAlign:'right'}}>Művelet</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(m=> (
              <tr key={m.id}>
                <td>{m.date}</td>
                <td className="hidden sm:table-cell">{m.driver_name||'–'}</td>
                <td>{partnersById[m.partner_id]?.name||'?'}</td>
                <td>{m.direction==='out'?'Kiadás':'Visszahozatal'}</td>
                <td>{formatCrateTypeLabel(crateTypesById, m.crate_type_id)}</td>
                <td>{m.qty}</td>
                <td className="hidden sm:table-cell" title={m.note} style={{maxWidth:380,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.note}</td>
                <td style={{textAlign:'right'}}>{user.role==='admin' && <button className="btn" onClick={()=> onDelete(m.id)}>Törlés</button>}</td>
              </tr>
            ))}
            {visible.length===0 && <tr><td colSpan={8} style={{textAlign:'center',color:'#6b7280',fontSize:13}}>Nincs találat.</td></tr>}
          </tbody>
        </table>
      </div>
      {showCount < filtered.length && (
        <div className="flex justify-center mt-3">
          <button className="btn" onClick={()=> setShowCount(s=> Math.min(s+20, filtered.length))}>Tovább</button>
        </div>
      )}
    </div>
  </div>;
}

function PartnersCard({ partners, setPartners }:{ partners: Partner[]; setPartners: React.Dispatch<React.SetStateAction<Partner[]>> }){
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');

  const [editId, setEditId] = useState<string|null>(null);
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editNote, setEditNote] = useState('');

  const startEdit = (p: Partner)=>{ setEditId(p.id); setEditName(p.name); setEditContact(p.contact||''); setEditNote(p.note||''); };
  const saveEdit = async ()=>{
    if(!editId) return;
    if(!editName.trim()) return alert('A partner neve kötelező.');
    const r:any = await updatePartner(editId, { name: editName.trim(), contact: editContact.trim()||null, note: editNote.trim()||null } as any);
    if(r.error){ alert(r.error.message); return; }
    const updated = r.data ?? (r as any).data;
    setPartners(s=> s.map(x=> x.id===editId ? updated : x));
    setEditId(null);
  };

  const add = async ()=>{
    if(!name.trim()) return alert('A partner neve kötelező.');
    const r:any = await addPartner({ name: name.trim(), contact: contact.trim()||undefined, note: note.trim()||undefined } as any);
    if(r.error){ alert(r.error.message); return; }
    setPartners(s=> [...s, r.data as any]); setOpenNew(false); setName(''); setContact(''); setNote('');
  };

  const remove = async (id:string)=>{
    if(!confirm('Biztosan törlöd a partnert?')) return;
    const r:any = await deletePartner(id); if(r.error){ alert(r.error.message); return; }
    setPartners(s=> s.filter(p=> p.id!==id));
  };

  return <div className="card">
    <div className="card-header flex items-center justify-between">
      <div className="card-title">Partnerek</div>
      {!openNew && <button className="btn" onClick={()=> setOpenNew(true)}>Új partner</button>}
    </div>

    <div className="card-content">
      {/* Új partner */}
      {openNew && <div className="dialog-overlay"><div className="dialog-content">
        <div className="card-title" style={{marginBottom:8}}>Új partner</div>
        <div className="grid gap-3 grid-cols-1">
          <div><label className="label">Név *</label><input className="input" value={name} onChange={e=> setName(e.target.value)}/></div>
          <div><label className="label">Elérhetőség</label><input className="input" value={contact} onChange={e=> setContact(e.target.value)} placeholder="telefon / email"/></div>
          <div><label className="label">Megjegyzés</label><textarea className="textarea" rows={3} value={note} onChange={e=> setNote(e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-2 mt-2"><button className="btn btn-secondary" onClick={()=> setOpenNew(false)}>Mégse</button><button className="btn" onClick={add}>Mentés</button></div>
      </div></div>}

      {/* Szerkesztés */}
      {editId && <div className="dialog-overlay"><div className="dialog-content">
        <div className="card-title" style={{marginBottom:8}}>Partner szerkesztése</div>
        <div className="grid gap-3 grid-cols-1">
          <div><label className="label">Név *</label><input className="input" value={editName} onChange={e=> setEditName(e.target.value)}/></div>
          <div><label className="label">Elérhetőség</label><input className="input" value={editContact} onChange={e=> setEditContact(e.target.value)}/></div>
          <div><label className="label">Megjegyzés</label><textarea className="textarea" rows={3} value={editNote} onChange={e=> setEditNote(e.target.value)}/></div>
        </div>
        <div className="flex justify-end gap-2 mt-2"><button className="btn btn-secondary" onClick={()=> setEditId(null)}>Mégse</button><button className="btn" onClick={saveEdit}>Mentés</button></div>
      </div></div>}

      <div style={{overflow:'auto', marginTop:16}}>
        <table className="table">
          <thead><tr><th>Név</th><th className="hidden sm:table-cell">Elérhetőség</th><th className="hidden sm:table-cell">Megjegyzés</th><th style={{textAlign:'right'}}>Művelet</th></tr></thead>
        
          <tbody>
            {partners.map(p=> (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="hidden sm:table-cell">{p.contact}</td>
                <td className="hidden sm:table-cell" title={p.note} style={{maxWidth:380,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.note}</td>
                <td style={{textAlign:'right'}}>
                  <button className="btn" onClick={()=> startEdit(p)}>Szerkesztés</button>
                  <button className="btn" onClick={()=> remove(p.id)}>Törlés</button>
                </td>
              </tr>
            ))}
            {partners.length===0 && <tr><td colSpan={4} style={{textAlign:'center',color:'#6b7280',fontSize:13}}>Még nincs partner.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function SettingsCard({ crateTypes, setCrateTypes, movements }:{ crateTypes: CrateType[]; setCrateTypes: React.Dispatch<React.SetStateAction<CrateType[]>>; movements: Movement[] }){
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const addType = async ()=>{
    const cleanId = id.trim().toUpperCase(); if(!cleanId) return alert('Azonosító kötelező');
    if(crateTypes.some(c=> c.id===cleanId)) return alert('Már létezik ilyen azonosító');
    const r = await addCrateType({ id: cleanId, label: label.trim()||cleanId, archived:false } as any);
    if(r.error){ alert(r.error.message); return; }
    setCrateTypes(s=> [...s, r.data as any]); setId(''); setLabel('');
  };
  const toggleArchive = async (rid:string, makeArchived:boolean)=>{
    const r = await setCrateTypeArchived(rid, makeArchived); if(r.error){ alert(r.error.message); return; }
    setCrateTypes(s=> s.map(c=> c.id===rid? { ...c, archived: makeArchived } : c));
  };
  const removeType = async (rid:string)=>{
    const usedCount = movements.filter(m=> m.crate_type_id===rid).length;
    const msg = usedCount>0 ? `Erre a típusra ${usedCount} mozgás hivatkozik. Végleg törlöd?` : 'Biztosan törlöd?';
    if(!confirm(msg)) return;
    const r = await deleteCrateType(rid); if(r.error){ alert(r.error.message); return; }
    setCrateTypes(s=> s.filter(c=> c.id!==rid));
  };
  return <div className="card">
    <div className="card-header"><div className="card-title">Ládatípusok</div></div>
    <div className="card-content">
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <div><label className="label">Azonosító *</label><input className="input" value={id} onChange={e=> setId(e.target.value)} placeholder="pl. M10"/></div>
        <div><label className="label">Megnevezés</label><input className="input" value={label} onChange={e=> setLabel(e.target.value)} placeholder="pl. M10 – kicsi láda"/></div>
        <div className="flex items-end"><button className="btn w-full md:w-auto" onClick={addType}>Hozzáadás</button></div>
      </div>
      <div style={{overflow:'auto', marginTop:16}}>
        <table className="table">
          <thead><tr><th>Azonosító</th><th className="hidden sm:table-cell">Megnevezés</th><th>Státusz</th><th style={{textAlign:'right'}}>Művelet</th></tr></thead>
          <tbody>
            {crateTypes.map(c=> <tr key={c.id}><td>{c.id}</td><td className="hidden sm:table-cell">{c.label}</td><td>{c.archived? 'Archivált' : 'Aktív'}</td><td style={{textAlign:'right'}}>
              {c.archived ? <button className="btn btn-secondary" onClick={()=> toggleArchive(c.id, false)}>Visszaállít</button> : <button className="btn btn-secondary" onClick={()=> toggleArchive(c.id, true)}>Archivál</button>}
              <button className="btn" onClick={()=> removeType(c.id)}>Törlés</button>
            </td></tr>)}
            {crateTypes.length===0 && <tr><td colSpan={4} style={{textAlign:'center',color:'#6b7280',fontSize:13}}>Nincs típus.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function BalancesTable({ balances, partnersById, crateTypes }:{ balances:Map<string,number>; partnersById:Record<string,Partner>; crateTypes:CrateType[] }){
  const rows = useMemo(()=>{ const out:{partnerId:string;partnerName:string;sums:Record<string,number>;total:number}[]=[]; for(const p of Object.values(partnersById)){ const sums:Record<string,number>={}; let total=0; for(const ct of crateTypes){ const key=`${p.id}|${ct.id}`; const v=balances.get(key)||0; sums[ct.id]=v; total+=v; } out.push({partnerId:p.id, partnerName:p.name, sums, total}); } out.sort((a,b)=> b.total-a.total); return out; }, [balances, partnersById, crateTypes]);
  return <div className="card">
    <div className="card-header"><div className="card-title">Aktuális egyenlegek</div></div>
    <div className="card-content">
      <div style={{overflow:'auto'}}>
        <table className="table">
          <thead><tr><th>Partner</th>{crateTypes.map(ct=> <th key={ct.id} className="hidden md:table-cell">{ct.label}</th>)}<th>Összesen</th></tr></thead>
          <tbody>
            {rows.map(r=> <tr key={r.partnerId}><td>{r.partnerName}</td>{crateTypes.map(ct=> <td key={ct.id} className="hidden md:table-cell">{r.sums[ct.id]}</td>)}<td style={{fontWeight:600}}>{r.total}</td></tr>)}
            {rows.length===0 && <tr><td colSpan={crateTypes.length+2} style={{textAlign:'center',color:'#6b7280',fontSize:13}}>Nincs partner / mozgás.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

function exportCSV(partners: Partner[], crateTypes: CrateType[], movements: Movement[]){
  const pMap = Object.fromEntries(partners.map(p=> [p.id,p]));
  const cMap = Object.fromEntries(crateTypes.map(c=> [c.id,c]));
  const rows = movements.map(m=> ({ date:m.date, partner: pMap[m.partner_id]?.name || m.partner_id, direction: m.direction, crateType: cMap[m.crate_type_id]?.label || m.crate_type_id, qty: m.qty, note: m.note||'', driver: m.driver_name||'' }));
  const csv = toCSV(rows); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `ladanyilvantarto_export_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}
