import { useState, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

// ─── COLORS ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#0b0d14",
  surface: "#13161f",
  surface2: "#1a1d2a",
  surface3: "#1f2233",
  border: "#252836",
  borderHover: "#353849",
  accent: "#4ade80",
  accentBg: "#4ade8012",
  accentBorder: "#4ade8030",
  blue: "#60a5fa",
  blueBg: "#60a5fa12",
  blueBorder: "#60a5fa30",
  amber: "#fbbf24",
  amberBg: "#fbbf2412",
  red: "#f87171",
  redBg: "#f8717112",
  text: "#e2e8f0",
  dim: "#94a3b8",
  muted: "#4a5568",
  mutedLight: "#64748b",
};

// ─── INDEXEDDB ───────────────────────────────────────────────────────────────
const DB_NAME = "InventoryDB";
const DB_VERSION = 1;
const STORE_FILES = "files";
const STORE_META = "meta";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FILES))
        db.createObjectStore(STORE_FILES, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_META))
        db.createObjectStore(STORE_META, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSaveFile(meta, rows) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FILES, STORE_META], "readwrite");
    tx.objectStore(STORE_FILES).put({ id: meta.id, rows });
    tx.objectStore(STORE_META).put(meta);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbLoadRows(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, "readonly");
    const req = tx.objectStore(STORE_FILES).get(id);
    req.onsuccess = () => resolve(req.result?.rows || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbListMeta() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDeleteFile(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_FILES, STORE_META], "readwrite");
    tx.objectStore(STORE_FILES).delete(id);
    tx.objectStore(STORE_META).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function normalizeRows(rows) {
  return rows.map((r) => {
    const keys = Object.keys(r);
    const get = (patterns) => {
      const k = keys.find((k) =>
        patterns.some((p) => k.toLowerCase().includes(p.toLowerCase()))
      );
      return k ? String(r[k]).trim() : "";
    };
    return {
      maHang: get(["mã hàng","ma hang","mahang","item code","itemcode","code","sku"]),
      tenHang: get(["tên hàng","ten hang","tenhang","product name","name","product"]),
      chiNhanh: get(["chi nhánh","chi nhanh","chinhanh","branch"]),
      tinhThanh: get(["tỉnh thành","tinh thanh","tỉnh","tinh","province","city"]),
      maKho: get(["mã kho","ma kho","makho","warehouse"]),
      dvt: get(["đvt","dvt","unit","đơn vị","don vi"]),
      cuoiKy: get(["cuối kỳ","cuoi ky","cuoiky","tồn","ton kho","quantity","qty","số lượng"]),
    };
  });
}

function parseQty(v) {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function fmtNum(n) {
  return n.toLocaleString("vi-VN");
}

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parseCodes(text) {
  return [...new Set(
    text.split(/[\n,;，、\s]+/).map(c => c.trim().toUpperCase()).filter(Boolean)
  )];
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const s = {
  app: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Mono','Courier New',monospace", fontSize:13 },

  // Layout
  layout: { display:"flex", minHeight:"100vh" },
  sidebar: { width:260, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0 },
  sidebarHeader: { padding:"18px 16px 12px", borderBottom:`1px solid ${C.border}` },
  sidebarTitle: { fontSize:10, letterSpacing:"0.15em", textTransform:"uppercase", color:C.accent, fontWeight:700, display:"flex", alignItems:"center", gap:8 },
  dot: { width:7, height:7, borderRadius:"50%", background:C.accent, boxShadow:`0 0 6px ${C.accent}` },
  sidebarBody: { flex:1, overflowY:"auto", padding:"8px 0" },
  sidebarFooter: { padding:"12px 16px", borderTop:`1px solid ${C.border}` },
  main: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  topbar: { borderBottom:`1px solid ${C.border}`, padding:"14px 28px", display:"flex", alignItems:"center", gap:12, background:C.surface, flexShrink:0 },
  content: { flex:1, overflowY:"auto", padding:"24px 28px" },

  // File items
  fileItem: (active) => ({
    padding:"10px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10,
    background: active ? C.accentBg : "transparent",
    borderLeft: `2px solid ${active ? C.accent : "transparent"}`,
    transition:"all 0.15s",
  }),
  fileIcon: { fontSize:16, flexShrink:0 },
  fileName: (active) => ({ fontSize:11, color: active ? C.accent : C.dim, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }),
  fileMeta: { fontSize:10, color:C.muted, marginTop:2 },

  // Tab
  tabs: { display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, marginBottom:24 },
  tab: (active) => ({
    padding:"10px 20px", fontSize:11, letterSpacing:"0.06em", cursor:"pointer",
    color: active ? C.accent : C.mutedLight,
    borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
    background:"transparent", border:"none", fontFamily:"inherit",
    transition:"all 0.15s", textTransform:"uppercase",
  }),

  // Upload
  dropzone: (active) => ({
    border:`2px dashed ${active ? C.accent : C.border}`,
    borderRadius:10, padding:"40px 24px", textAlign:"center", cursor:"pointer",
    background: active ? C.accentBg : C.surface, transition:"all 0.2s", marginBottom:20,
  }),

  // Search panel
  panel: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:20, marginBottom:20 },
  label: { fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:C.mutedLight, marginBottom:8, display:"block" },
  textarea: {
    width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:6,
    padding:"11px 13px", color:C.text, fontFamily:"'DM Mono',monospace", fontSize:12,
    resize:"vertical", minHeight:72, outline:"none", boxSizing:"border-box", lineHeight:1.7,
  },
  select: {
    background:C.bg, border:`1px solid ${C.border}`, borderRadius:6,
    padding:"8px 12px", color:C.text, fontFamily:"inherit", fontSize:12, outline:"none",
  },
  filterRow: { display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" },
  hint: { fontSize:10, color:C.muted, marginTop:5 },
  btnRow: { display:"flex", gap:8, marginTop:14, flexWrap:"wrap" },
  btnP: (disabled) => ({
    background: disabled ? C.muted : C.accent, color:"#0b0d14",
    border:"none", borderRadius:6, padding:"9px 18px", fontSize:11,
    fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase",
    cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit", flexShrink:0,
  }),
  btnS: {
    background:"transparent", color:C.mutedLight, border:`1px solid ${C.border}`,
    borderRadius:6, padding:"9px 14px", fontSize:11, cursor:"pointer", fontFamily:"inherit",
  },
  btnDanger: {
    background:"transparent", color:C.red, border:`1px solid ${C.redBg}`,
    borderRadius:6, padding:"7px 12px", fontSize:10, cursor:"pointer", fontFamily:"inherit",
  },

  // Result headers
  resHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  resTitle: { fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:C.mutedLight },
  badge: (color="accent") => ({
    background: C[color+"Bg"] || C.accentBg,
    color: C[color] || C.accent,
    border:`1px solid ${C[color+"Border"] || C.accentBorder}`,
    borderRadius:4, padding:"2px 9px", fontSize:10,
  }),

  // Cards
  card: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:10, overflow:"hidden" },
  cardHead: { padding:"10px 15px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, background:C.surface2 },
  codeTag: { background:C.accentBg, color:C.accent, borderRadius:4, padding:"2px 9px", fontSize:11, fontWeight:700, flexShrink:0 },
  prodName: { fontSize:12, flex:1, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },

  // Table
  table: { width:"100%", borderCollapse:"collapse", fontSize:11 },
  th: { textAlign:"left", padding:"7px 15px", color:C.mutedLight, fontSize:10, letterSpacing:"0.08em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, fontWeight:400 },
  td: { padding:"8px 15px", borderBottom:`1px solid ${C.border}18`, color:C.dim },
  tdNum: { padding:"8px 15px", borderBottom:`1px solid ${C.border}18`, color:C.text, fontWeight:700, textAlign:"right" },

  // Coverage
  coverageCard: (full) => ({
    background: full ? C.accentBg : C.redBg,
    border:`1px solid ${full ? C.accentBorder : C.redBg}`,
    borderRadius:8, padding:"12px 15px", marginBottom:8, display:"flex", alignItems:"center", gap:10,
  }),
  coverageName: { flex:1, fontSize:12, color:C.text },
  coverageBar: { display:"flex", gap:3, alignItems:"center" },
  coverageDot: (has) => ({ width:8, height:8, borderRadius:"50%", background: has ? C.accent : C.muted }),

  // Empty
  empty: { textAlign:"center", padding:"60px 24px", color:C.muted, fontSize:12 },
  emptyIcon: { fontSize:32, marginBottom:10 },

  // Modal
  modalOverlay: { position:"fixed", inset:0, background:"#00000080", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 },
  modal: { background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12, padding:28, width:360, maxWidth:"90vw" },
  modalTitle: { fontSize:12, color:C.text, fontWeight:700, marginBottom:16 },
  input: {
    width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:6,
    padding:"9px 12px", color:C.text, fontFamily:"inherit", fontSize:12, outline:"none", boxSizing:"border-box",
  },
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={s.modalOverlay} onClick={onCancel}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalTitle}>⚠ Xác nhận</div>
        <div style={{ fontSize:12, color:C.dim, marginBottom:20 }}>{message}</div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button style={s.btnS} onClick={onCancel}>Hủy</button>
          <button style={{ ...s.btnP(false), background:C.red }} onClick={onConfirm}>Xóa</button>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = C.accent }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background:C.border, borderRadius:3, height:4, width:80, overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:"100%", background:color, transition:"width 0.3s" }} />
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // File management
  const [fileList, setFileList] = useState([]); // [{id, name, rowCount, uploadedAt, sizeBytes}]
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeRows, setActiveRows] = useState([]);
  const [loadingFile, setLoadingFile] = useState(null); // id of file being loaded
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // id to delete
  const fileRef = useRef();

  // Tab: "lookup" | "coverage"
  const [tab, setTab] = useState("lookup");

  // Lookup tab
  const [query, setQuery] = useState("");
  const [filterProvince, setFilterProvince] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [results, setResults] = useState(null);

  // Coverage tab
  const [coverageQuery, setCoverageQuery] = useState("");
  const [coverageResults, setCoverageResults] = useState(null);
  const [coverageMinQty, setCoverageMinQty] = useState(0);

  // Load file list on mount
  useEffect(() => {
    dbListMeta().then(list => {
      const sorted = list.sort((a, b) => b.uploadedAt - a.uploadedAt);
      setFileList(sorted);
    }).catch(console.error);
  }, []);

  // Derived: unique provinces & branches from active file
  const provinces = [...new Set(activeRows.map(r => r.tinhThanh).filter(Boolean))].sort();
  const branches = [...new Set(activeRows.map(r => r.chiNhanh).filter(Boolean))].sort((a, b) =>
    isNaN(a) || isNaN(b) ? a.localeCompare(b) : Number(a) - Number(b)
  );

  // Filter activeRows
  const filteredRows = activeRows.filter(r =>
    (!filterProvince || r.tinhThanh === filterProvince) &&
    (!filterBranch || r.chiNhanh === filterBranch)
  );

  // Upload file
  const handleUpload = useCallback(async (file) => {
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const rows = normalizeRows(raw);
        const id = `file_${Date.now()}`;
        const meta = {
          id,
          name: file.name,
          rowCount: rows.length,
          uploadedAt: Date.now(),
          sizeBytes: file.size,
        };
        await dbSaveFile(meta, rows);
        setFileList(prev => [meta, ...prev]);
        // Auto-select
        setActiveFileId(id);
        setActiveRows(rows);
        setResults(null);
        setCoverageResults(null);
      } catch (err) {
        alert("Không đọc được file. Vui lòng dùng .xlsx hoặc .xls\n" + err.message);
      }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Select file
  const selectFile = useCallback(async (id) => {
    if (id === activeFileId) return;
    setLoadingFile(id);
    try {
      const rows = await dbLoadRows(id);
      setActiveFileId(id);
      setActiveRows(rows);
      setResults(null);
      setCoverageResults(null);
      setFilterProvince("");
      setFilterBranch("");
    } catch (err) {
      alert("Lỗi tải file: " + err.message);
    }
    setLoadingFile(null);
  }, [activeFileId]);

  // Delete file
  const deleteFile = useCallback(async (id) => {
    await dbDeleteFile(id);
    setFileList(prev => prev.filter(f => f.id !== id));
    if (activeFileId === id) {
      setActiveFileId(null);
      setActiveRows([]);
      setResults(null);
      setCoverageResults(null);
    }
    setDeleteConfirm(null);
  }, [activeFileId]);

  // Lookup search
  const doSearch = () => {
    if (!activeRows.length || !query.trim()) return;
    const codes = parseCodes(query);
    const map = {};
    codes.forEach(code => {
      map[code] = filteredRows.filter(r => r.maHang.toUpperCase() === code);
    });
    setResults({ codes, map });
  };

  // Coverage check
  const doCoverage = () => {
    if (!activeRows.length || !coverageQuery.trim()) return;
    const codes = parseCodes(coverageQuery);
    const minQty = Number(coverageMinQty) || 0;

    // For each branch, check which codes it has (with qty > minQty)
    const branchMap = {}; // branchKey -> { chiNhanh, tinhThanh, codeSet }
    activeRows.forEach(r => {
      const key = r.chiNhanh + "||" + r.tinhThanh;
      if (!branchMap[key]) branchMap[key] = { chiNhanh: r.chiNhanh, tinhThanh: r.tinhThanh, codeSet: new Set() };
      const qty = parseQty(r.cuoiKy);
      if (codes.includes(r.maHang.toUpperCase()) && qty > minQty) {
        branchMap[key].codeSet.add(r.maHang.toUpperCase());
      }
    });

    // Apply filter
    const filtered = Object.values(branchMap).filter(b =>
      (!filterProvince || b.tinhThanh === filterProvince) &&
      (!filterBranch || b.chiNhanh === filterBranch)
    );

    // Sort: full coverage first, then by count desc
    const rows = filtered.map(b => ({
      ...b,
      hasAll: codes.every(c => b.codeSet.has(c)),
      count: codes.filter(c => b.codeSet.has(c)).length,
      codes: codes,
    })).sort((a, b) => b.count - a.count || a.chiNhanh.localeCompare(b.chiNhanh));

    setCoverageResults({ codes, rows });
  };

  const activeFile = fileList.find(f => f.id === activeFileId);
  const foundCount = results ? results.codes.filter(c => results.map[c].length > 0).length : 0;
  const fullCoverageCount = coverageResults ? coverageResults.rows.filter(r => r.hasAll).length : 0;

  return (
    <div style={s.app}>
      <div style={s.layout}>

        {/* ── SIDEBAR ── */}
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.sidebarTitle}>
              <div style={s.dot} />
              Kho dữ liệu
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>
              {fileList.length} file · Lưu trong trình duyệt
            </div>
          </div>

          <div style={s.sidebarBody}>
            {fileList.length === 0 && (
              <div style={{ padding:"24px 16px", textAlign:"center", color:C.muted, fontSize:11 }}>
                Chưa có file nào<br />
                <span style={{ fontSize:10 }}>Upload file để bắt đầu</span>
              </div>
            )}
            {fileList.map(f => (
              <div key={f.id} style={s.fileItem(f.id === activeFileId)} onClick={() => selectFile(f.id)}>
                <span style={s.fileIcon}>
                  {loadingFile === f.id ? "⏳" : f.id === activeFileId ? "📗" : "📄"}
                </span>
                <div style={{ flex:1, overflow:"hidden" }}>
                  <div style={s.fileName(f.id === activeFileId)}>
                    {f.name.replace(/\.(xlsx|xls)$/i, "")}
                  </div>
                  <div style={s.fileMeta}>
                    {f.rowCount.toLocaleString()} dòng · {fmtSize(f.sizeBytes)}
                  </div>
                  <div style={{ ...s.fileMeta, fontSize:9 }}>
                    {new Date(f.uploadedAt).toLocaleDateString("vi-VN")}
                  </div>
                </div>
                <button
                  style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:14, padding:"2px 4px", flexShrink:0 }}
                  onClick={e => { e.stopPropagation(); setDeleteConfirm(f.id); }}
                  title="Xóa file"
                >×</button>
              </div>
            ))}
          </div>

          <div style={s.sidebarFooter}>
            <div
              style={{ ...s.dropzone(dragging), padding:"16px 12px", marginBottom:0, borderRadius:8 }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleUpload(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current.click()}
            >
              <div style={{ fontSize:18, marginBottom:4 }}>📂</div>
              <div style={{ fontSize:10, color:C.dim, lineHeight:1.6 }}>
                {uploading ? "Đang xử lý..." : (
                  <><span style={{ color:C.text }}>Thêm file Excel</span><br />kéo thả hoặc click</>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }}
                onChange={e => handleUpload(e.target.files[0])} />
            </div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={s.main}>
          {/* Topbar */}
          <div style={s.topbar}>
            <span style={{ fontSize:10, color:C.mutedLight, letterSpacing:"0.1em", textTransform:"uppercase" }}>
              Tra cứu tồn kho
            </span>
            {activeFile && (
              <>
                <span style={{ color:C.muted, fontSize:10 }}>·</span>
                <span style={{ fontSize:11, color:C.accent }}>{activeFile.name}</span>
                <span style={{ fontSize:10, color:C.muted }}>
                  {activeRows.length.toLocaleString()} dòng
                </span>
              </>
            )}
          </div>

          <div style={s.content}>
            {!activeFileId ? (
              <div style={s.empty}>
                <div style={s.emptyIcon}>👈</div>
                <div>Chọn file từ danh sách bên trái<br />
                  <span style={{ fontSize:11, color:C.muted }}>hoặc upload file mới để bắt đầu</span>
                </div>
              </div>
            ) : (
              <>
                {/* Tabs */}
                <div style={s.tabs}>
                  <button style={s.tab(tab === "lookup")} onClick={() => setTab("lookup")}>
                    🔍 Tra cứu mã hàng
                  </button>
                  <button style={s.tab(tab === "coverage")} onClick={() => setTab("coverage")}>
                    🗺 Kiểm tra chi nhánh
                  </button>
                </div>

                {/* ── TAB: LOOKUP ── */}
                {tab === "lookup" && (
                  <>
                    <div style={s.panel}>
                      <label style={s.label}>Nhập mã hàng cần tra cứu</label>
                      <textarea
                        style={s.textarea}
                        placeholder={"933936\n933942, 933951\n934020"}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.ctrlKey && e.key === "Enter") doSearch(); }}
                      />
                      <div style={s.hint}>Phân cách bằng Enter, dấu phẩy, hoặc khoảng trắng · Ctrl+Enter để tra</div>

                      {/* Filters */}
                      <div style={{ ...s.filterRow, marginTop:12 }}>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc tỉnh thành</label>
                          <select style={s.select} value={filterProvince} onChange={e => setFilterProvince(e.target.value)}>
                            <option value="">Tất cả tỉnh thành</option>
                            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc chi nhánh</label>
                          <select style={s.select} value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                            <option value="">Tất cả chi nhánh</option>
                            {branches.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        {(filterProvince || filterBranch) && (
                          <div style={{ display:"flex", alignItems:"flex-end" }}>
                            <button style={s.btnS} onClick={() => { setFilterProvince(""); setFilterBranch(""); }}>
                              ✕ Bỏ lọc
                            </button>
                          </div>
                        )}
                      </div>

                      <div style={s.btnRow}>
                        <button style={s.btnP(!query.trim())} onClick={doSearch} disabled={!query.trim()}>
                          🔍 Tra cứu
                        </button>
                        {results && (
                          <button style={s.btnS} onClick={() => { setQuery(""); setResults(null); }}>
                            Xóa kết quả
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Results */}
                    {results && (
                      <>
                        <div style={s.resHeader}>
                          <span style={s.resTitle}>
                            {results.codes.length} mã · {filterProvince || filterBranch ? "đã lọc" : "tất cả chi nhánh"}
                          </span>
                          <span style={s.badge(foundCount === results.codes.length ? "accent" : "amber")}>
                            {foundCount}/{results.codes.length} mã có tồn kho
                          </span>
                        </div>

                        {results.codes.map(code => {
                          const rows = results.map[code];
                          const name = rows[0]?.tenHang || "—";
                          const total = rows.reduce((sum, r) => sum + parseQty(r.cuoiKy), 0);
                          return (
                            <div key={code} style={s.card}>
                              <div style={s.cardHead}>
                                <span style={s.codeTag}>{code}</span>
                                <span style={s.prodName}>{name}</span>
                                {rows.length > 0 && (
                                  <span style={{ fontSize:10, color:C.mutedLight, flexShrink:0 }}>
                                    {rows.length} chi nhánh
                                  </span>
                                )}
                              </div>
                              {rows.length === 0 ? (
                                <div style={{ padding:"11px 15px", fontSize:11, color:C.red }}>
                                  ⚠ Không tìm thấy{filterProvince || filterBranch ? " trong phạm vi lọc" : ""}
                                </div>
                              ) : (
                                <table style={s.table}>
                                  <thead>
                                    <tr>
                                      <th style={s.th}>Chi nhánh</th>
                                      <th style={s.th}>Tỉnh thành</th>
                                      <th style={s.th}>Mã kho</th>
                                      <th style={s.th}>ĐVT</th>
                                      <th style={{ ...s.th, textAlign:"right" }}>Cuối kỳ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r, i) => (
                                      <tr key={i}>
                                        <td style={s.td}>{r.chiNhanh || "—"}</td>
                                        <td style={s.td}>{r.tinhThanh || "—"}</td>
                                        <td style={s.td}>{r.maKho || "—"}</td>
                                        <td style={s.td}>{r.dvt || "—"}</td>
                                        <td style={s.tdNum}>{fmtNum(parseQty(r.cuoiKy))}</td>
                                      </tr>
                                    ))}
                                    {rows.length > 1 && (
                                      <tr style={{ background:C.surface2 }}>
                                        <td style={{ ...s.td, color:C.accent, fontWeight:700 }} colSpan={4}>Tổng tồn kho</td>
                                        <td style={{ ...s.tdNum, color:C.accent }}>{fmtNum(total)}</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {!results && (
                      <div style={s.empty}>
                        <div style={s.emptyIcon}>🔍</div>
                        Nhập mã hàng và nhấn Tra cứu
                      </div>
                    )}
                  </>
                )}

                {/* ── TAB: COVERAGE ── */}
                {tab === "coverage" && (
                  <>
                    <div style={s.panel}>
                      <label style={s.label}>Danh sách mã hàng cần kiểm tra</label>
                      <textarea
                        style={s.textarea}
                        placeholder={"Nhập các mã cần kiểm tra, ví dụ:\n933936\n933942\n933951"}
                        value={coverageQuery}
                        onChange={e => setCoverageQuery(e.target.value)}
                        onKeyDown={e => { if (e.ctrlKey && e.key === "Enter") doCoverage(); }}
                      />
                      <div style={s.hint}>
                        Tìm chi nhánh nào tồn đủ TẤT CẢ các mã trên
                      </div>

                      <div style={{ ...s.filterRow, marginTop:12 }}>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Tồn tối thiểu</label>
                          <input
                            type="number"
                            style={{ ...s.select, width:100 }}
                            value={coverageMinQty}
                            min={0}
                            onChange={e => setCoverageMinQty(e.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc tỉnh thành</label>
                          <select style={s.select} value={filterProvince} onChange={e => setFilterProvince(e.target.value)}>
                            <option value="">Tất cả tỉnh thành</option>
                            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ ...s.label, marginBottom:4 }}>Lọc chi nhánh</label>
                          <select style={s.select} value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
                            <option value="">Tất cả chi nhánh</option>
                            {branches.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                      </div>

                      <div style={s.btnRow}>
                        <button style={s.btnP(!coverageQuery.trim())} onClick={doCoverage} disabled={!coverageQuery.trim()}>
                          🗺 Kiểm tra
                        </button>
                        {coverageResults && (
                          <button style={s.btnS} onClick={() => setCoverageResults(null)}>
                            Xóa kết quả
                          </button>
                        )}
                      </div>
                    </div>

                    {coverageResults && (
                      <>
                        <div style={s.resHeader}>
                          <span style={s.resTitle}>
                            {coverageResults.rows.length} chi nhánh · {coverageResults.codes.length} mã kiểm tra
                          </span>
                          <div style={{ display:"flex", gap:8 }}>
                            <span style={s.badge("accent")}>✅ {fullCoverageCount} đủ hàng</span>
                            <span style={s.badge("red")}>
                              ⚠ {coverageResults.rows.length - fullCoverageCount} thiếu hàng
                            </span>
                          </div>
                        </div>

                        {/* Codes legend */}
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                          {coverageResults.codes.map(c => (
                            <span key={c} style={{ ...s.badge("blue"), fontSize:10 }}>{c}</span>
                          ))}
                        </div>

                        {coverageResults.rows.map((r, i) => (
                          <div key={i} style={s.coverageCard(r.hasAll)}>
                            <div style={{ fontSize:16 }}>{r.hasAll ? "✅" : "⚠"}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                                <span style={{ fontWeight:700, color: r.hasAll ? C.accent : C.text, fontSize:12 }}>
                                  Chi nhánh {r.chiNhanh}
                                </span>
                                <span style={{ fontSize:10, color:C.mutedLight }}>{r.tinhThanh}</span>
                              </div>
                              {/* Per-code dots */}
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                {r.codes.map(c => (
                                  <span key={c} style={{
                                    fontSize:10, padding:"1px 6px", borderRadius:3,
                                    background: r.codeSet.has(c) ? C.accentBg : C.redBg,
                                    color: r.codeSet.has(c) ? C.accent : C.red,
                                  }}>
                                    {r.codeSet.has(c) ? "✓" : "✗"} {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div style={{ textAlign:"right", flexShrink:0 }}>
                              <div style={{ fontSize:13, fontWeight:700, color: r.hasAll ? C.accent : C.red }}>
                                {r.count}/{r.codes.length}
                              </div>
                              <ProgressBar value={r.count} max={r.codes.length} color={r.hasAll ? C.accent : C.amber} />
                            </div>
                          </div>
                        ))}

                        {coverageResults.rows.length === 0 && (
                          <div style={s.empty}>Không có chi nhánh nào khớp điều kiện lọc</div>
                        )}
                      </>
                    )}

                    {!coverageResults && (
                      <div style={s.empty}>
                        <div style={s.emptyIcon}>🗺</div>
                        Nhập danh sách mã hàng và nhấn Kiểm tra<br />
                        <span style={{ fontSize:11, color:C.muted }}>
                          Hệ thống sẽ cho biết chi nhánh nào tồn đủ tất cả mã
                        </span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <ConfirmModal
          message={`Xóa file "${fileList.find(f => f.id === deleteConfirm)?.name}"?\nDữ liệu sẽ được giải phóng khỏi bộ nhớ trình duyệt.`}
          onConfirm={() => deleteFile(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
