import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";

// ─── BUILD INFO ──────────────────────────────────────────────────────────────
const BUILD_DATE = new Date().toLocaleDateString("vi-VN", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
const VERSION = "1.3.0";

// ─── COLORS (Light ERP Theme) ─────────────────────────────────────────────────
const C = {
  bg:           "#f0f2f5",
  surface:      "#ffffff",
  surface2:     "#f5f7fa",
  surface3:     "#eaecf0",
  border:       "#ced4da",
  borderLight:  "#e9ecef",
  headerBg:     "#1e3a5f",
  headerText:   "#ffffff",
  sidebarBg:    "#1e3a5f",
  sidebarText:  "#b8cde0",
  sidebarActive:"#ffffff",
  sidebarActiveBg:"#2d5490",
  accent:       "#0d7a4e",
  accentBg:     "#e6f4ee",
  accentBorder: "#7dc5a0",
  blue:         "#1a6fba",
  blueBg:       "#e8f1fb",
  blueBorder:   "#8cbde8",
  amber:        "#92400e",
  amberBg:      "#fef3c7",
  amberBorder:  "#fcd34d",
  red:          "#b91c1c",
  redBg:        "#fee2e2",
  redBorder:    "#fca5a5",
  text:         "#1a2332",
  dim:          "#4a5568",
  muted:        "#9aa5b4",
  mutedLight:   "#6b7a8d",
};

// ─── INDEXEDDB ───────────────────────────────────────────────────────────────
const DB_NAME = "InventoryDB", DB_VER = 1, ST_FILES = "files", ST_META = "meta";
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(ST_FILES)) db.createObjectStore(ST_FILES, { keyPath:"id" });
      if (!db.objectStoreNames.contains(ST_META))  db.createObjectStore(ST_META,  { keyPath:"id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
async function dbSave(meta, rows) {
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction([ST_FILES,ST_META],"readwrite");
    tx.objectStore(ST_FILES).put({id:meta.id,rows});
    tx.objectStore(ST_META).put(meta);
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
  });
}
async function dbLoad(id) {
  const db = await openDB();
  return new Promise((res,rej) => {
    const r = db.transaction(ST_FILES,"readonly").objectStore(ST_FILES).get(id);
    r.onsuccess=()=>res(r.result?.rows||[]); r.onerror=()=>rej(r.error);
  });
}
async function dbListMeta() {
  const db = await openDB();
  return new Promise((res,rej) => {
    const r = db.transaction(ST_META,"readonly").objectStore(ST_META).getAll();
    r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((res,rej) => {
    const tx = db.transaction([ST_FILES,ST_META],"readwrite");
    tx.objectStore(ST_FILES).delete(id); tx.objectStore(ST_META).delete(id);
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
  });
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function normalizeRows(rows) {
  return rows.map(r => {
    const keys = Object.keys(r);
    const get = ps => { const k=keys.find(k=>ps.some(p=>k.toLowerCase().includes(p.toLowerCase()))); return k?String(r[k]).trim():""; };
    return {
      maHang:   get(["mã hàng","ma hang","mahang","item code","itemcode","code","sku"]),
      tenHang:  get(["tên hàng","ten hang","tenhang","product name","name","product"]),
      chiNhanh: get(["chi nhánh","chi nhanh","chinhanh","branch"]),
      tinhThanh:get(["tỉnh thành","tinh thanh","tỉnh","tinh","province","city"]),
      maKho:    get(["mã kho","ma kho","makho","warehouse"]),
      dvt:      get(["đvt","dvt","unit","đơn vị","don vi"]),
      cuoiKy:   get(["cuối kỳ","cuoi ky","cuoiky","tồn","ton kho","quantity","qty","số lượng"]),
    };
  });
}
const parseQty = v => { const n=parseFloat(String(v).replace(/[^0-9.-]/g,"")); return isNaN(n)?0:n; };
const fmtNum  = n => n.toLocaleString("vi-VN");
const fmtSize = b => b<1024*1024?`${(b/1024).toFixed(0)} KB`:`${(b/1024/1024).toFixed(1)} MB`;
const parseCodes = t => [...new Set(t.split(/[\n,;，、\s]+/).map(c=>c.trim().toUpperCase()).filter(Boolean))];

// ─── STYLES ──────────────────────────────────────────────────────────────────
const s = {
  app:     { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Segoe UI','Tahoma',Arial,sans-serif", fontSize:13, display:"flex", flexDirection:"column" },
  layout:  { display:"flex", flex:1 },
  sidebar: { width:260, background:C.sidebarBg, borderRight:`1px solid #16304f`, display:"flex", flexDirection:"column", flexShrink:0 },
  sbHead:  { padding:"18px 16px 12px", borderBottom:"1px solid #16304f" },
  sbTitle: { fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"#7ecfab", fontWeight:700, display:"flex", alignItems:"center", gap:8 },
  dot:     { width:7, height:7, borderRadius:"50%", background:"#7ecfab" },
  sbBody:  { flex:1, overflowY:"auto", padding:"8px 0", background:C.sidebarBg },
  sbFoot:  { padding:"12px 16px", borderTop:"1px solid #16304f", background:C.sidebarBg },
  main:    { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar:  { borderBottom:`1px solid ${C.border}`, padding:"12px 28px", display:"flex", alignItems:"center", gap:12, background:C.headerBg, flexShrink:0, color:C.headerText },
  content: { flex:1, overflowY:"auto", padding:"20px 28px" },
  fileItem:(a)=>({ padding:"9px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, background:a?C.sidebarActiveBg:"transparent", borderLeft:`3px solid ${a?"#7ecfab":"transparent"}`, transition:"all 0.15s" }),
  fileName:(a)=>({ fontSize:12, color:a?C.sidebarActive:C.sidebarText, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }),
  fileMeta:{ fontSize:10, color:"#7a9bbf", marginTop:2 },
  tabs:    { display:"flex", borderBottom:`2px solid ${C.border}`, marginBottom:20, background:C.surface, borderRadius:"8px 8px 0 0", padding:"0 8px" },
  tab:     (a)=>({ padding:"10px 20px", fontSize:12, fontWeight:a?700:400, cursor:"pointer", color:a?C.accent:C.dim, borderBottom:`2px solid ${a?C.accent:"transparent"}`, background:"transparent", border:"none", fontFamily:"inherit", transition:"all 0.15s" }),
  dropzone:(a)=>({ border:`2px dashed ${a?C.accent:C.border}`, borderRadius:10, padding:"40px 24px", textAlign:"center", cursor:"pointer", background:a?C.accentBg:C.surface, transition:"all 0.2s", marginBottom:20 }),
  panel:   { background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:20, marginBottom:16, boxShadow:"0 1px 4px #00000012" },
  label:   { fontSize:11, fontWeight:600, color:C.dim, marginBottom:6, display:"block" },
  textarea:{ width:"100%", background:"#f9fafb", border:`1px solid ${C.border}`, borderRadius:5, padding:"8px 12px", color:C.text, fontFamily:"inherit", fontSize:13, resize:"vertical", minHeight:60, outline:"none", boxSizing:"border-box", lineHeight:1.7 },
  select:  { background:"#f9fafb", border:`1px solid ${C.border}`, borderRadius:5, padding:"7px 10px", color:C.text, fontFamily:"inherit", fontSize:12, outline:"none" },
  filterRow:{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"flex-end" },
  hint:    { fontSize:11, color:C.muted, marginTop:5 },
  btnRow:  { display:"flex", gap:8, marginTop:14, flexWrap:"wrap" },
  btnP:    (d)=>({ background:d?"#adb5bd":C.accent, color:"#ffffff", border:"none", borderRadius:5, padding:"8px 20px", fontSize:12, fontWeight:600, cursor:d?"not-allowed":"pointer", fontFamily:"inherit", flexShrink:0, boxShadow:d?"none":"0 2px 4px #0d7a4e44" }),
  btnS:    { background:"#f0f2f5", color:C.dim, border:`1px solid ${C.border}`, borderRadius:5, padding:"8px 14px", fontSize:12, cursor:"pointer", fontFamily:"inherit" },
  resHeader:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  resTitle: { fontSize:12, fontWeight:600, color:C.dim },
  badge:   (c="accent")=>({ background:C[c+"Bg"]||C.accentBg, color:C[c]||C.accent, border:`1px solid ${C[c+"Border"]||C.accentBorder}`, borderRadius:4, padding:"2px 9px", fontSize:11, fontWeight:600 }),
  card:    { background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, marginBottom:10, overflow:"hidden", boxShadow:"0 1px 4px #00000010" },
  cardHead:{ padding:"9px 15px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, background:C.surface2 },
  codeTag: { background:C.accentBg, color:C.accent, borderRadius:3, padding:"2px 8px", fontSize:11, fontWeight:700, flexShrink:0, border:`1px solid ${C.accentBorder}` },
  prodName:{ fontSize:12, flex:1, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  table:   { width:"100%", borderCollapse:"collapse", fontSize:11 },
  th:      { textAlign:"left", padding:"8px 15px", color:C.dim, fontSize:11, fontWeight:600, borderBottom:`1px solid ${C.border}`, userSelect:"none", background:C.surface2 },
  thSort:  { cursor:"pointer" },
  td:      { padding:"8px 15px", borderBottom:`1px solid ${C.borderLight}`, color:C.text },
  tdNum:   { padding:"8px 15px", borderBottom:`1px solid ${C.borderLight}`, color:C.text, fontWeight:700, textAlign:"right" },
  tdInput: { padding:"4px 8px", borderBottom:`1px solid ${C.border}18` },
  numInput:{ background:"#f9fafb", border:`1px solid ${C.border}`, borderRadius:4, padding:"5px 8px", color:C.text, fontFamily:"inherit", fontSize:12, width:90, textAlign:"right", outline:"none" },
  coverageCard:(f)=>({ background:f?C.accentBg:C.redBg, border:`1px solid ${f?C.accentBorder:C.redBorder}`, borderRadius:6, padding:"10px 15px", marginBottom:8, display:"flex", alignItems:"center", gap:10, boxShadow:"0 1px 3px #00000010" }),
  empty:   { textAlign:"center", padding:"60px 24px", color:C.muted, fontSize:13 },
  emptyIcon:{ fontSize:36, marginBottom:12 },
  modalOverlay:{ position:"fixed", inset:0, background:"#00000050", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
  modal:   { background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:28, width:360, maxWidth:"90vw", boxShadow:"0 8px 32px #00000030" },
  // Autocomplete
  searchWrap:{ position:"relative", marginBottom:10 },
  searchInput:{ width:"100%", background:"#f9fafb", border:`1px solid ${C.border}`, borderRadius:5, padding:"9px 36px 9px 13px", color:C.text, fontFamily:"inherit", fontSize:13, outline:"none", boxSizing:"border-box" },
  searchIcon:{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", color:C.mutedLight, fontSize:14, pointerEvents:"none" },
  dropdown:{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:50, background:C.surface, border:`1px solid ${C.border}`, borderRadius:6, maxHeight:240, overflowY:"auto", boxShadow:"0 4px 20px #00000022" },
  dropItem:(h)=>({ padding:"8px 13px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, background:h?C.accentBg:"transparent", borderBottom:`1px solid ${C.borderLight}` }),
  dropCode:{ fontSize:12, fontWeight:700, color:C.accent, flexShrink:0, minWidth:72 },
  dropName:{ fontSize:12, color:C.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  dropAdded:{ fontSize:10, color:C.mutedLight },
  dropEmpty:{ padding:"14px", fontSize:11, color:C.muted, textAlign:"center" },
};

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={s.modalOverlay} onClick={onCancel}>
      <div style={s.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:12, color:C.text, fontWeight:700, marginBottom:16 }}>⚠ Xác nhận</div>
        <div style={{ fontSize:12, color:C.dim, marginBottom:20 }}>{message}</div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button style={s.btnS} onClick={onCancel}>Hủy</button>
          <button style={{ ...s.btnP(false), background:C.red }} onClick={onConfirm}>Xóa</button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color=C.accent }) {
  const pct = max?Math.round(value/max*100):0;
  return <div style={{ background:C.border, borderRadius:3, height:4, width:80, overflow:"hidden" }}><div style={{ width:`${pct}%`, height:"100%", background:color, transition:"width 0.3s" }}/></div>;
}

// ─── PRODUCT SEARCH AUTOCOMPLETE ─────────────────────────────────────────────
function ProductSearch({ rows, addedCodes, onAdd }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hiIdx, setHiIdx] = useState(0);
  const inputRef = useRef();
  const dropRef  = useRef();

  const catalog = useMemo(() => {
    const map = {};
    rows.forEach(r => { if (r.maHang && !map[r.maHang]) map[r.maHang] = { tenHang:r.tenHang, dvt:r.dvt }; });
    return Object.entries(map).map(([maHang,{tenHang,dvt}]) => ({ maHang, tenHang, dvt }));
  }, [rows]);

  const suggestions = useMemo(() => {
    if (!text.trim()) return [];
    const q = text.trim().toLowerCase();
    return catalog.filter(p => p.tenHang.toLowerCase().includes(q) || p.maHang.toLowerCase().includes(q)).slice(0,40);
  }, [text, catalog]);

  useEffect(() => { setHiIdx(0); }, [suggestions]);

  useEffect(() => {
    const h = e => { if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const add = (p) => {
    if (addedCodes.has(p.maHang)) return;
    onAdd(p);
    setText("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const hl = (str, q) => {
    const idx = str.toLowerCase().indexOf(q.toLowerCase());
    if (idx===-1) return str;
    return <>{str.slice(0,idx)}<span style={{color:C.accent,fontWeight:700}}>{str.slice(idx,idx+q.length)}</span>{str.slice(idx+q.length)}</>;
  };

  const handleKey = e => {
    if (!open||!suggestions.length) return;
    if (e.key==="ArrowDown"){e.preventDefault();setHiIdx(i=>Math.min(i+1,suggestions.length-1));}
    if (e.key==="ArrowUp")  {e.preventDefault();setHiIdx(i=>Math.max(i-1,0));}
    if (e.key==="Enter")    {e.preventDefault();if(suggestions[hiIdx])add(suggestions[hiIdx]);}
    if (e.key==="Escape")   setOpen(false);
  };

  return (
    <div style={s.searchWrap}>
      <input ref={inputRef} style={s.searchInput}
        placeholder="Gõ tên hoặc mã hàng để thêm vào danh sách..."
        value={text}
        onChange={e=>{setText(e.target.value);setOpen(true);}}
        onFocus={()=>{if(text)setOpen(true);}}
        onKeyDown={handleKey}
      />
      <span style={s.searchIcon}>⌕</span>
      {open && text.trim() && (
        <div ref={dropRef} style={s.dropdown}>
          {suggestions.length===0
            ? <div style={s.dropEmpty}>Không tìm thấy sản phẩm</div>
            : suggestions.map((p,i) => (
              <div key={p.maHang} style={s.dropItem(i===hiIdx)}
                onMouseEnter={()=>setHiIdx(i)}
                onMouseDown={e=>{e.preventDefault();add(p);}}>
                <span style={s.dropCode}>{hl(p.maHang,text)}</span>
                <span style={s.dropName}>{hl(p.tenHang,text)}</span>
                {addedCodes.has(p.maHang) && <span style={s.dropAdded}>✓ đã thêm</span>}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─── PRODUCT INPUT TABLE ──────────────────────────────────────────────────────
// items: [{maHang, tenHang, dvt, needQty}]
function ProductInputTable({ items, onChange }) {
  if (items.length === 0) return null;

  const setQty = (maHang, val) => {
    onChange(items.map(it => it.maHang===maHang ? {...it, needQty: val} : it));
  };
  const remove = (maHang) => onChange(items.filter(it => it.maHang !== maHang));

  return (
    <div style={{ marginTop:12, border:`1px solid ${C.border}`, borderRadius:8, overflow:"hidden" }}>
      <table style={s.table}>
        <thead>
          <tr style={{ background:C.surface2, borderBottom:`1px solid ${C.border}` }}>
            <th style={s.th}>Mã hàng</th>
            <th style={s.th}>Tên hàng</th>
            <th style={s.th}>ĐVT</th>
            <th style={{ ...s.th, textAlign:"right" }}>Số lượng cần</th>
            <th style={{ ...s.th, width:32 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.maHang} style={{ background: i%2===0?C.surface:"#f8fafc" }}>
              <td style={s.td}><span style={s.codeTag}>{it.maHang}</span></td>
              <td style={{ ...s.td, maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{it.tenHang||"—"}</td>
              <td style={s.td}>{it.dvt||"—"}</td>
              <td style={s.tdInput}>
                <div style={{ display:"flex", justifyContent:"flex-end" }}>
                  <input
                    type="number" min={0} style={s.numInput}
                    value={it.needQty ?? ""}
                    placeholder="0"
                    onChange={e => setQty(it.maHang, e.target.value===''?'':Number(e.target.value))}
                  />
                </div>
              </td>
              <td style={{ ...s.td, textAlign:"center", padding:"4px 8px" }}>
                <span style={{ cursor:"pointer", color:C.muted, fontSize:14 }} onClick={()=>remove(it.maHang)}>×</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── SORTABLE TABLE ───────────────────────────────────────────────────────────
const COLS = [
  { key:"chiNhanh",  label:"Chi nhánh",  num:false },
  { key:"tinhThanh", label:"Tỉnh thành", num:false },
  { key:"maKho",     label:"Mã kho",     num:false },
  { key:"dvt",       label:"ĐVT",        num:false },
  { key:"cuoiKy",    label:"Cuối kỳ",    num:true  },
];

function SortableResultTable({ rows, needQty }) {
  const [sortKey, setSortKey] = useState("cuoiKy");
  const [sortDir, setSortDir] = useState("desc");

  const toggleSort = (key) => {
    if (sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc");
    else { setSortKey(key); setSortDir(COLS.find(c=>c.key===key)?.num ? "desc":"asc"); }
  };

  const sorted = useMemo(() => {
    const col = COLS.find(c=>c.key===sortKey);
    return [...rows].sort((a,b) => {
      const av = col?.num ? parseQty(a[sortKey]) : String(a[sortKey]||"");
      const bv = col?.num ? parseQty(b[sortKey]) : String(b[sortKey]||"");
      const cmp = typeof av==="number" ? av-bv : av.localeCompare(bv);
      return sortDir==="asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const arrow = (key) => {
    if (sortKey!==key) return <span style={{ opacity:0.25, marginLeft:4 }}>↕</span>;
    return <span style={{ color:C.accent, marginLeft:4 }}>{sortDir==="asc"?"↑":"↓"}</span>;
  };

  const thS = (key) => ({
    ...s.th, ...s.thSort,
    color: sortKey===key ? C.accent : C.dim,
    background: sortKey===key ? C.accentBg : C.surface2,
  });

  return (
    <table style={s.table}>
      <thead>
        <tr>
          {COLS.map(c => (
            <th key={c.key}
              style={{ ...thS(c.key), textAlign: c.num?"right":"left" }}
              onClick={()=>toggleSort(c.key)}>
              {c.label}{arrow(c.key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r,i) => {
          const qty = parseQty(r.cuoiKy);
          const meetsReq = needQty == null || needQty === '' || qty >= Number(needQty);
          return (
            <tr key={i} style={{ opacity: meetsReq ? 1 : 0.45 }}>
              <td style={s.td}>{r.chiNhanh||"—"}</td>
              <td style={s.td}>{r.tinhThanh||"—"}</td>
              <td style={s.td}>{r.maKho||"—"}</td>
              <td style={s.td}>{r.dvt||"—"}</td>
              <td style={{ ...s.tdNum, color: meetsReq ? C.accent : C.red }}>
                {fmtNum(qty)}
                {!meetsReq && <span style={{ fontSize:9, color:C.red, marginLeft:4 }}>▼</span>}
              </td>
            </tr>
          );
        })}
        {rows.length > 1 && (
          <tr style={{ background:C.surface2 }}>
            <td style={{ ...s.td, color:C.accent, fontWeight:700 }} colSpan={4}>Tổng tồn kho</td>
            <td style={{ ...s.tdNum, color:C.accent }}>{fmtNum(rows.reduce((s,r)=>s+parseQty(r.cuoiKy),0))}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [fileList, setFileList]       = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeRows, setActiveRows]   = useState([]);
  const [loadingFile, setLoadingFile] = useState(null);
  const [uploading, setUploading]     = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const fileRef = useRef();
  const [tab, setTab] = useState("lookup");

  // Lookup: items = [{maHang,tenHang,dvt,needQty}]
  const [lookupItems, setLookupItems] = useState([]);
  const [filterProvince, setFilterProvince] = useState("");
  const [filterBranch, setFilterBranch]     = useState("");
  const [results, setResults]   = useState(null);

  // Coverage: items = [{maHang,tenHang,dvt,needQty}]
  const [coverItems, setCoverItems]   = useState([]);
  const [coverageResults, setCoverageResults] = useState(null);

  useEffect(() => {
    dbListMeta().then(l => setFileList(l.sort((a,b)=>b.uploadedAt-a.uploadedAt))).catch(console.error);
  }, []);

  const provinces = useMemo(() => [...new Set(activeRows.map(r=>r.tinhThanh).filter(Boolean))].sort(), [activeRows]);
  const branches  = useMemo(() => [...new Set(activeRows.map(r=>r.chiNhanh).filter(Boolean))].sort((a,b)=>isNaN(a)||isNaN(b)?a.localeCompare(b):Number(a)-Number(b)), [activeRows]);

  const filteredRows = useMemo(() => activeRows.filter(r=>
    (!filterProvince||r.tinhThanh===filterProvince)&&(!filterBranch||r.chiNhanh===filterBranch)
  ), [activeRows, filterProvince, filterBranch]);

  // Build catalog from rows for dvt lookup
  const catalog = useMemo(() => {
    const map = {};
    activeRows.forEach(r => { if (r.maHang && !map[r.maHang]) map[r.maHang] = { tenHang:r.tenHang, dvt:r.dvt }; });
    return map;
  }, [activeRows]);

  const handleUpload = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const wb = XLSX.read(e.target.result, { type:"array" });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" });
        const rows = normalizeRows(raw);
        const id = `file_${Date.now()}`;
        const meta = { id, name:file.name, rowCount:rows.length, uploadedAt:Date.now(), sizeBytes:file.size };
        await dbSave(meta, rows);
        setFileList(prev => [meta,...prev]);
        setActiveFileId(id); setActiveRows(rows);
        setResults(null); setCoverageResults(null);
        setLookupItems([]); setCoverItems([]);
      } catch(err) { alert("Không đọc được file\n"+err.message); }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const selectFile = useCallback(async (id) => {
    if (id===activeFileId) return;
    setLoadingFile(id);
    try {
      const rows = await dbLoad(id);
      setActiveFileId(id); setActiveRows(rows);
      setResults(null); setCoverageResults(null);
      setLookupItems([]); setCoverItems([]);
      setFilterProvince(""); setFilterBranch("");
    } catch(err) { alert("Lỗi: "+err.message); }
    setLoadingFile(null);
  }, [activeFileId]);

  const deleteFile = useCallback(async (id) => {
    await dbDelete(id);
    setFileList(prev => prev.filter(f=>f.id!==id));
    if (activeFileId===id) { setActiveFileId(null); setActiveRows([]); setResults(null); setCoverageResults(null); }
    setDeleteConfirm(null);
  }, [activeFileId]);

  // Add product to lookup
  const addLookupItem = (p) => {
    if (lookupItems.find(it=>it.maHang===p.maHang)) return;
    setLookupItems(prev => [...prev, { maHang:p.maHang, tenHang:p.tenHang, dvt:p.dvt, needQty:'' }]);
  };
  // Also handle manual code entry textarea
  const [manualQuery, setManualQuery] = useState("");
  const addManualCodes = () => {
    const codes = parseCodes(manualQuery);
    const toAdd = codes.filter(c => !lookupItems.find(it=>it.maHang===c));
    const newItems = toAdd.map(c => {
      const info = catalog[c] || { tenHang:"", dvt:"" };
      return { maHang:c, tenHang:info.tenHang, dvt:info.dvt, needQty:'' };
    });
    setLookupItems(prev => [...prev, ...newItems]);
    setManualQuery("");
  };

  const addCoverItem = (p) => {
    if (coverItems.find(it=>it.maHang===p.maHang)) return;
    setCoverItems(prev => [...prev, { maHang:p.maHang, tenHang:p.tenHang, dvt:p.dvt, needQty:'' }]);
  };
  const [coverManual, setCoverManual] = useState("");
  const addCoverManual = () => {
    const codes = parseCodes(coverManual);
    const toAdd = codes.filter(c => !coverItems.find(it=>it.maHang===c));
    const newItems = toAdd.map(c => {
      const info = catalog[c] || { tenHang:"", dvt:"" };
      return { maHang:c, tenHang:info.tenHang, dvt:info.dvt, needQty:'' };
    });
    setCoverItems(prev => [...prev, ...newItems]);
    setCoverManual("");
  };

  // Search
  const doSearch = () => {
    if (!activeRows.length || lookupItems.length===0) return;
    const map = {};
    lookupItems.forEach(it => {
      map[it.maHang] = {
        rows: filteredRows.filter(r => r.maHang.toUpperCase()===it.maHang),
        needQty: it.needQty,
        tenHang: it.tenHang,
        dvt: it.dvt,
      };
    });
    setResults({ items: lookupItems, map });
  };

  // Coverage
  const doCoverage = () => {
    if (!activeRows.length || coverItems.length===0) return;
    // per item threshold
    const thresholds = {}; // maHang -> needQty
    coverItems.forEach(it => { thresholds[it.maHang] = it.needQty==='' ? 0 : Number(it.needQty); });
    const codes = coverItems.map(it=>it.maHang);

    const branchMap = {};
    activeRows.forEach(r => {
      const key = r.chiNhanh+"||"+r.tinhThanh;
      if (!branchMap[key]) branchMap[key] = { chiNhanh:r.chiNhanh, tinhThanh:r.tinhThanh, qtyMap:{} };
      const code = r.maHang.toUpperCase();
      if (codes.includes(code)) {
        const qty = parseQty(r.cuoiKy);
        branchMap[key].qtyMap[code] = (branchMap[key].qtyMap[code]||0) + qty;
      }
    });

    const filtered = Object.values(branchMap).filter(b =>
      (!filterProvince||b.tinhThanh===filterProvince)&&(!filterBranch||b.chiNhanh===filterBranch)
    );

    const rows = filtered.map(b => {
      const codeStatus = codes.map(c => ({
        code: c,
        qty: b.qtyMap[c]||0,
        needed: thresholds[c]||0,
        ok: (b.qtyMap[c]||0) >= (thresholds[c]||0),
        info: coverItems.find(it=>it.maHang===c),
      }));
      const count = codeStatus.filter(cs=>cs.ok).length;
      return { ...b, codeStatus, count, hasAll: count===codes.length };
    }).sort((a,b) => b.count-a.count || a.chiNhanh.localeCompare(b.chiNhanh));

    setCoverageResults({ codes, rows, items:coverItems });
  };

  const activeFile = fileList.find(f=>f.id===activeFileId);
  const lookupAddedCodes = useMemo(()=>new Set(lookupItems.map(it=>it.maHang)), [lookupItems]);
  const coverAddedCodes  = useMemo(()=>new Set(coverItems.map(it=>it.maHang)), [coverItems]);
  const foundCount = results ? Object.values(results.map).filter(v=>v.rows.length>0).length : 0;
  const fullCoverageCount = coverageResults?.rows.filter(r=>r.hasAll).length||0;

  return (
    <div style={s.app}>
      <div style={s.layout}>

        {/* ── SIDEBAR ── */}
        <div style={s.sidebar}>
          <div style={s.sbHead}>
            <div style={s.sbTitle}><div style={s.dot}/>Kho dữ liệu</div>
            <div style={{ fontSize:10, color:"#7a9bbf", marginTop:4 }}>{fileList.length} file · Lưu trong trình duyệt</div>
          </div>
          <div style={s.sbBody}>
            {fileList.length===0 && <div style={{ padding:"24px 16px", textAlign:"center", color:"#7a9bbf", fontSize:11 }}>Chưa có file nào</div>}
            {fileList.map(f=>(
              <div key={f.id} style={s.fileItem(f.id===activeFileId)} onClick={()=>selectFile(f.id)}>
                <span style={{ fontSize:16 }}>{loadingFile===f.id?"⏳":f.id===activeFileId?"📗":"📄"}</span>
                <div style={{ flex:1, overflow:"hidden" }}>
                  <div style={s.fileName(f.id===activeFileId)}>{f.name.replace(/\.(xlsx|xls)$/i,"")}</div>
                  <div style={s.fileMeta}>{f.rowCount.toLocaleString()} dòng · {fmtSize(f.sizeBytes)}</div>
                  <div style={{ ...s.fileMeta, fontSize:9 }}>{new Date(f.uploadedAt).toLocaleDateString("vi-VN")}</div>
                </div>
                <button style={{ background:"none", border:"none", cursor:"pointer", color:"#7a9bbf", fontSize:14, padding:"2px 4px" }}
                  onClick={e=>{e.stopPropagation();setDeleteConfirm(f.id);}}>×</button>
              </div>
            ))}
          </div>
          <div style={s.sbFoot}>
            <div style={{ border:`2px dashed ${dragging?"#7ecfab":"#2d5490"}`, borderRadius:8, padding:"16px 12px", marginBottom:0, textAlign:"center", cursor:"pointer", background:dragging?"#1a4a7a":"#1a3257", transition:"all 0.2s" }}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={e=>{e.preventDefault();setDragging(false);handleUpload(e.dataTransfer.files[0]);}}
              onClick={()=>fileRef.current.click()}>
              <div style={{ fontSize:18, marginBottom:4 }}>📂</div>
              <div style={{ fontSize:10, color:C.dim, lineHeight:1.6 }}>
                {uploading?<span style={{color:"#7ecfab"}}>Đang xử lý...</span>:<><span style={{color:"#c8e8ff", fontWeight:600}}>Thêm file Excel</span><br/><span style={{color:"#7a9bbf"}}>kéo thả hoặc click</span></>}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }} onChange={e=>handleUpload(e.target.files[0])}/>
            </div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={s.main}>
          <div style={s.topbar}>
            <span style={{ fontSize:12, fontWeight:700, color:"#7ecfab", letterSpacing:"0.08em", textTransform:"uppercase" }}>📦 Tra cứu tồn kho</span>
            {activeFile && <>
              <span style={{ color:"#7a9bbf", fontSize:12 }}>·</span>
              <span style={{ fontSize:12, color:"#c8e8ff", fontWeight:600 }}>{activeFile.name}</span>
              <span style={{ fontSize:11, color:"#7a9bbf" }}>{activeRows.length.toLocaleString()} dòng</span>
            </>}
          </div>

          <div style={s.content}>
            {!activeFileId ? (
              <div style={s.empty}><div style={s.emptyIcon}>👈</div><div>Chọn file từ danh sách bên trái<br/><span style={{fontSize:11,color:C.muted}}>hoặc upload file mới để bắt đầu</span></div></div>
            ) : (
              <>
                <div style={s.tabs}>
                  <button style={s.tab(tab==="lookup")} onClick={()=>setTab("lookup")}>🔍 Tra cứu mã hàng</button>
                  <button style={s.tab(tab==="coverage")} onClick={()=>setTab("coverage")}>🗺 Kiểm tra chi nhánh</button>
                </div>

                {/* ═══ TAB: LOOKUP ═══ */}
                {tab==="lookup" && (
                  <>
                    <div style={s.panel}>
                      <label style={s.label}>Tìm theo tên hàng / mã hàng</label>
                      <ProductSearch rows={activeRows} addedCodes={lookupAddedCodes} onAdd={addLookupItem}/>

                      {/* Manual code entry */}
                      <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                        <textarea style={{ ...s.textarea, flex:1, minHeight:44, resize:"none" }}
                          placeholder="Hoặc nhập mã thẳng: 933936, 933942..."
                          value={manualQuery}
                          onChange={e=>setManualQuery(e.target.value)}
                          onKeyDown={e=>{if(e.ctrlKey&&e.key==="Enter")addManualCodes();}}
                        />
                        <button style={{ ...s.btnS, whiteSpace:"nowrap", alignSelf:"stretch" }} onClick={addManualCodes} disabled={!manualQuery.trim()}>
                          + Thêm
                        </button>
                      </div>
                      <div style={s.hint}>Ctrl+Enter để thêm nhanh</div>

                      {/* Product input table */}
                      <ProductInputTable items={lookupItems} onChange={setLookupItems}/>

                      {/* Filters */}
                      <div style={{ ...s.filterRow, marginTop:16 }}>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc tỉnh thành</label>
                          <select style={s.select} value={filterProvince} onChange={e=>setFilterProvince(e.target.value)}>
                            <option value="">Tất cả tỉnh thành</option>
                            {provinces.map(p=><option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc chi nhánh</label>
                          <select style={s.select} value={filterBranch} onChange={e=>setFilterBranch(e.target.value)}>
                            <option value="">Tất cả chi nhánh</option>
                            {branches.map(b=><option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        {(filterProvince||filterBranch) && (
                          <button style={{ ...s.btnS, alignSelf:"flex-end" }} onClick={()=>{setFilterProvince("");setFilterBranch("");}}>✕ Bỏ lọc</button>
                        )}
                      </div>

                      <div style={s.btnRow}>
                        <button style={s.btnP(lookupItems.length===0)} onClick={doSearch} disabled={lookupItems.length===0}>
                          🔍 Tra cứu
                        </button>
                        {results && <button style={s.btnS} onClick={()=>{setLookupItems([]);setResults(null);setManualQuery("");}}>Xóa tất cả</button>}
                      </div>
                    </div>

                    {/* Results */}
                    {results && (
                      <>
                        <div style={s.resHeader}>
                          <span style={s.resTitle}>{results.items.length} mã · {filterProvince||filterBranch?"đã lọc":"tất cả chi nhánh"}</span>
                          <span style={s.badge(foundCount===results.items.length?"accent":"amber")}>
                            {foundCount}/{results.items.length} mã có tồn kho
                          </span>
                        </div>

                        {results.items.map(it => {
                          const { rows, needQty } = results.map[it.maHang];
                          const hasNeed = needQty!=='' && needQty!=null;
                          const qualifiedRows = hasNeed ? rows.filter(r=>parseQty(r.cuoiKy)>=Number(needQty)) : rows;
                          return (
                            <div key={it.maHang} style={s.card}>
                              <div style={s.cardHead}>
                                <span style={s.codeTag}>{it.maHang}</span>
                                <span style={s.prodName}>{it.tenHang||"—"}</span>
                                {hasNeed && (
                                  <span style={{ ...s.badge("amber"), fontSize:10, flexShrink:0 }}>
                                    cần ≥ {fmtNum(Number(needQty))} {it.dvt}
                                  </span>
                                )}
                                <span style={{ fontSize:10, color:C.mutedLight, flexShrink:0, marginLeft:4 }}>
                                  {hasNeed ? `${qualifiedRows.length}/${rows.length} CN đủ hàng` : `${rows.length} chi nhánh`}
                                </span>
                              </div>
                              {rows.length===0 ? (
                                <div style={{ padding:"11px 15px", fontSize:11, color:C.red }}>⚠ Không tìm thấy{filterProvince||filterBranch?" trong phạm vi lọc":""}</div>
                              ) : (
                                <SortableResultTable rows={rows} needQty={hasNeed?needQty:null}/>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {!results && <div style={s.empty}><div style={s.emptyIcon}>🔍</div>Thêm mã hàng và nhấn Tra cứu</div>}
                  </>
                )}

                {/* ═══ TAB: COVERAGE ═══ */}
                {tab==="coverage" && (
                  <>
                    <div style={s.panel}>
                      <label style={s.label}>Thêm mã hàng cần kiểm tra</label>
                      <ProductSearch rows={activeRows} addedCodes={coverAddedCodes} onAdd={addCoverItem}/>

                      <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                        <textarea style={{ ...s.textarea, flex:1, minHeight:44, resize:"none" }}
                          placeholder="Hoặc nhập mã thẳng: 933936, 933942..."
                          value={coverManual}
                          onChange={e=>setCoverManual(e.target.value)}
                          onKeyDown={e=>{if(e.ctrlKey&&e.key==="Enter")addCoverManual();}}
                        />
                        <button style={{ ...s.btnS, whiteSpace:"nowrap", alignSelf:"stretch" }} onClick={addCoverManual} disabled={!coverManual.trim()}>
                          + Thêm
                        </button>
                      </div>
                      <div style={s.hint}>Nhập số lượng cần → chỉ tính chi nhánh tồn ≥ số lượng đó</div>

                      <ProductInputTable items={coverItems} onChange={setCoverItems}/>

                      {/* Filters */}
                      <div style={{ ...s.filterRow, marginTop:16 }}>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc tỉnh thành</label>
                          <select style={s.select} value={filterProvince} onChange={e=>setFilterProvince(e.target.value)}>
                            <option value="">Tất cả tỉnh thành</option>
                            {provinces.map(p=><option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc chi nhánh</label>
                          <select style={s.select} value={filterBranch} onChange={e=>setFilterBranch(e.target.value)}>
                            <option value="">Tất cả chi nhánh</option>
                            {branches.map(b=><option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        {(filterProvince||filterBranch) && (
                          <button style={{ ...s.btnS, alignSelf:"flex-end" }} onClick={()=>{setFilterProvince("");setFilterBranch("");}}>✕ Bỏ lọc</button>
                        )}
                      </div>

                      <div style={s.btnRow}>
                        <button style={s.btnP(coverItems.length===0)} onClick={doCoverage} disabled={coverItems.length===0}>
                          🗺 Kiểm tra
                        </button>
                        {coverageResults && <button style={s.btnS} onClick={()=>{setCoverItems([]);setCoverageResults(null);setCoverManual("");}}>Xóa tất cả</button>}
                      </div>
                    </div>

                    {coverageResults && (
                      <>
                        <div style={s.resHeader}>
                          <span style={s.resTitle}>{coverageResults.rows.length} chi nhánh · {coverageResults.codes.length} mã</span>
                          <div style={{ display:"flex", gap:8 }}>
                            <span style={s.badge("accent")}>✅ {fullCoverageCount} đủ hàng</span>
                            <span style={s.badge("red")}>⚠ {coverageResults.rows.length-fullCoverageCount} thiếu</span>
                          </div>
                        </div>

                        {/* Code legend with qty+dvt */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                          {coverageResults.items.map(it => (
                            <span key={it.maHang} style={{ ...s.badge("blue"), display:"flex", gap:4, alignItems:"center", padding:"3px 9px" }}>
                              <span style={{ fontWeight:700 }}>{it.maHang}</span>
                              {it.tenHang && <span style={{ color:C.dim, fontSize:10 }}>{it.tenHang.length>20?it.tenHang.slice(0,20)+"…":it.tenHang}</span>}
                              {(it.needQty!==''&&it.needQty!=null) && (
                                <span style={{ background:C.amberBg, color:C.amber, borderRadius:3, padding:"0 5px", fontSize:10 }}>
                                  ≥{fmtNum(Number(it.needQty))} {it.dvt}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>

                        {coverageResults.rows.map((r,i) => (
                          <div key={i} style={s.coverageCard(r.hasAll)}>
                            <div style={{ fontSize:16 }}>{r.hasAll?"✅":"⚠"}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                                <span style={{ fontWeight:700, color:r.hasAll?C.accent:C.red, fontSize:12, fontWeight:700 }}>Chi nhánh {r.chiNhanh}</span>
                                <span style={{ fontSize:10, color:C.mutedLight }}>{r.tinhThanh}</span>
                              </div>
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                {r.codeStatus.map(cs => (
                                  <span key={cs.code} style={{
                                    fontSize:10, padding:"2px 8px", borderRadius:4,
                                    background: cs.ok?C.accentBg:C.redBg,
                                    border:`1px solid ${cs.ok?C.accentBorder:C.redBorder}`,
                                    color: cs.ok?C.accent:C.red,
                                    display:"flex", alignItems:"center", gap:4,
                                  }}>
                                    <span>{cs.ok?"✓":"✗"} {cs.code}</span>
                                    <span style={{ opacity:0.8 }}>
                                      {fmtNum(cs.qty)}{cs.info?.dvt?" "+cs.info.dvt:""}
                                      {cs.needed>0&&<span style={{ opacity:0.6 }}>/{fmtNum(cs.needed)}</span>}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div style={{ textAlign:"right", flexShrink:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:r.hasAll?C.accent:C.red }}>{r.count}/{r.codeStatus.length}</div>
                              <ProgressBar value={r.count} max={r.codeStatus.length} color={r.hasAll?C.accent:C.amber}/>
                            </div>
                          </div>
                        ))}
                        {coverageResults.rows.length===0 && <div style={s.empty}>Không có chi nhánh nào khớp điều kiện lọc</div>}
                      </>
                    )}

                    {!coverageResults && (
                      <div style={s.empty}>
                        <div style={s.emptyIcon}>🗺</div>
                        Thêm mã hàng và nhấn Kiểm tra<br/>
                        <span style={{ fontSize:11, color:C.muted }}>Tìm chi nhánh tồn đủ tất cả mã theo số lượng yêu cầu</span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {deleteConfirm && (
        <ConfirmModal
          message={`Xóa file "${fileList.find(f=>f.id===deleteConfirm)?.name}"?\nDữ liệu sẽ được giải phóng khỏi bộ nhớ trình duyệt.`}
          onConfirm={()=>deleteFile(deleteConfirm)}
          onCancel={()=>setDeleteConfirm(null)}
        />
      )}

      {/* ── FOOTER ── */}
      <div style={{ background:C.headerBg, borderTop:"1px solid #16304f", padding:"8px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ fontSize:10, color:"#7a9bbf" }}>
          <span style={{ color:"#7ecfab", fontWeight:700 }}>ECM Team</span> · TrungSon Pharma
        </div>
        <div style={{ fontSize:10, color:"#7a9bbf", display:"flex", gap:16 }}>
          <span>Build: <span style={{ color:"#c8e8ff" }}>{BUILD_DATE}</span></span>
          <span>Version <span style={{ color:"#c8e8ff", fontWeight:700 }}>v{VERSION}</span></span>
          <span style={{ color:"#4a6a8a" }}>© 2026 TrungSon Pharma</span>
        </div>
      </div>
    </div>
  );
}
