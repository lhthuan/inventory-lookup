import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const C = {
  bg: "#0f1117",
  surface: "#1a1d27",
  surface2: "#1e2130",
  border: "#2a2d3a",
  accent: "#4ade80",
  accentBg: "#4ade8015",
  text: "#e2e8f0",
  muted: "#64748b",
  dim: "#94a3b8",
  danger: "#f87171",
};

const s = {
  app: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Mono','Courier New',monospace" },
  header: { borderBottom:`1px solid ${C.border}`, padding:"18px 32px", display:"flex", alignItems:"center", gap:12, background:C.surface },
  dot: { width:9, height:9, borderRadius:"50%", background:C.accent, boxShadow:`0 0 8px ${C.accent}` },
  title: { fontSize:12, letterSpacing:"0.15em", textTransform:"uppercase", color:C.accent, fontWeight:700 },
  sub: { marginLeft:"auto", fontSize:11, color:C.muted },
  main: { maxWidth:960, margin:"0 auto", padding:"32px 24px" },
  dropzone: (active) => ({
    border:`2px dashed ${active ? C.accent : C.border}`,
    borderRadius:8, padding:"44px 24px", textAlign:"center", cursor:"pointer",
    background: active ? C.accentBg : C.surface, transition:"all 0.2s", marginBottom:24,
  }),
  successBar: {
    display:"flex", alignItems:"center", gap:12, marginBottom:24,
    background:C.accentBg, border:`1px solid ${C.accent}33`,
    borderRadius:8, padding:"11px 16px", fontSize:12,
  },
  searchBox: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:20, marginBottom:24 },
  label: { fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:C.muted, marginBottom:8, display:"block" },
  textarea: {
    width:"100%", background:C.bg, border:`1px solid ${C.border}`, borderRadius:6,
    padding:"12px 14px", color:C.text, fontFamily:"'DM Mono',monospace", fontSize:13,
    resize:"vertical", minHeight:72, outline:"none", boxSizing:"border-box", lineHeight:1.7,
  },
  hint: { fontSize:11, color:C.muted, marginTop:6 },
  btnRow: { display:"flex", gap:10, marginTop:14 },
  btnP: (disabled) => ({
    background: disabled ? C.muted : C.accent, color:"#0f1117",
    border:"none", borderRadius:6, padding:"9px 20px", fontSize:11,
    fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase",
    cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit",
  }),
  btnS: {
    background:"transparent", color:C.muted, border:`1px solid ${C.border}`,
    borderRadius:6, padding:"9px 16px", fontSize:11, cursor:"pointer", fontFamily:"inherit",
  },
  resHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 },
  resTitle: { fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color:C.muted },
  badge: { background:C.accentBg, color:C.accent, border:`1px solid ${C.accent}33`, borderRadius:4, padding:"2px 9px", fontSize:11 },
  card: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:12, overflow:"hidden" },
  cardHead: { padding:"11px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10, background:C.surface2 },
  codeTag: { background:C.accentBg, color:C.accent, borderRadius:4, padding:"2px 9px", fontSize:12, fontWeight:700 },
  prodName: { fontSize:13, flex:1, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:520 },
  branchCount: { fontSize:11, color:C.muted, whiteSpace:"nowrap" },
  table: { width:"100%", borderCollapse:"collapse", fontSize:12 },
  th: { textAlign:"left", padding:"7px 16px", color:C.muted, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, fontWeight:400 },
  td: { padding:"8px 16px", borderBottom:`1px solid ${C.border}22`, color:C.dim },
  tdR: { padding:"8px 16px", borderBottom:`1px solid ${C.border}22`, color:C.text, fontWeight:700, textAlign:"right" },
  notFound: { padding:"12px 16px", fontSize:12, color:C.danger },
  totalRow: { background:C.surface2 },
  empty: { textAlign:"center", padding:"60px 24px", color:C.muted, fontSize:12 },
};

function normalizeRows(rows) {
  return rows.map((r) => {
    const keys = Object.keys(r);
    const get = (patterns) => {
      const k = keys.find((k) => patterns.some((p) => k.toLowerCase().includes(p.toLowerCase())));
      return k ? String(r[k]).trim() : "";
    };
    return {
      maHang: get(["mã hàng","ma hang","mahang","item","code","sku"]),
      tenHang: get(["tên hàng","ten hang","tenhang","name","product"]),
      chiNhanh: get(["chi nhánh","chi nhanh","chinhanh","branch"]),
      tinhThanh: get(["tỉnh","tinh","province","city","thành"]),
      maKho: get(["mã kho","ma kho","makho","warehouse"]),
      dvt: get(["đvt","dvt","unit","đơn vị"]),
      cuoiKy: get(["cuối kỳ","cuoi ky","cuoiky","tồn","ton","quantity","qty","số lượng"]),
    };
  });
}

function parseQty(v) {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function App() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const loadFile = useCallback((file) => {
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const rows = normalizeRows(raw);
        setData({ rows, fileName: file.name, rowCount: rows.length });
        setResults(null);
      } catch {
        alert("Không đọc được file. Vui lòng dùng .xlsx hoặc .xls");
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const search = () => {
    if (!data || !query.trim()) return;
    const codes = [...new Set(
      query.split(/[\n,;，、\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
    )];
    const map = {};
    codes.forEach((code) => {
      map[code] = data.rows.filter((r) => r.maHang.toUpperCase() === code);
    });
    setResults({ codes, map });
  };

  const found = results ? results.codes.filter((c) => results.map[c].length > 0).length : 0;

  return (
    <div style={s.app}>
      <div style={s.header}>
        <div style={s.dot} />
        <span style={s.title}>Tra cứu tồn kho</span>
        <span style={s.sub}>{data ? `${data.rowCount.toLocaleString()} dòng · ${data.fileName}` : "Chưa tải file"}</span>
      </div>

      <div style={s.main}>
        {/* Upload */}
        {!data ? (
          <div
            style={s.dropzone(dragging)}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current.click()}
          >
            <div style={{ fontSize:28, marginBottom:10 }}>📂</div>
            <div style={{ fontSize:13, color:C.dim, lineHeight:1.7 }}>
              {loading ? "Đang đọc file..." : (
                <><strong style={{ color:C.text }}>Kéo thả file Excel vào đây</strong><br />
                hoặc click để chọn · .xlsx · .xls<br />
                <span style={{ fontSize:11, color:C.muted }}>Hỗ trợ file lớn 700k+ dòng</span></>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:"none" }}
              onChange={(e) => loadFile(e.target.files[0])} />
          </div>
        ) : (
          <div style={s.successBar}>
            <span>✅</span>
            <span style={{ color:C.accent, fontWeight:700 }}>{data.fileName}</span>
            <span style={{ color:C.muted }}>{data.rowCount.toLocaleString()} dòng đã tải</span>
            <span style={{ marginLeft:"auto", cursor:"pointer", color:C.muted, fontSize:11 }}
              onClick={() => { setData(null); setResults(null); }}>✕ Đổi file</span>
          </div>
        )}

        {/* Search */}
        <div style={s.searchBox}>
          <label style={s.label}>Mã hàng cần tra cứu</label>
          <textarea
            style={s.textarea}
            placeholder={"933936\n933942, 933951\n934020"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.ctrlKey && e.key === "Enter") search(); }}
          />
          <div style={s.hint}>Phân cách bằng Enter, dấu phẩy, hoặc khoảng trắng · Ctrl+Enter để tra cứu</div>
          <div style={s.btnRow}>
            <button style={s.btnP(!data || !query.trim())} onClick={search} disabled={!data || !query.trim()}>
              🔍 Tra cứu
            </button>
            {results && <button style={s.btnS} onClick={() => { setQuery(""); setResults(null); }}>Xóa</button>}
          </div>
        </div>

        {/* Results */}
        {results && (
          <>
            <div style={s.resHeader}>
              <span style={s.resTitle}>Kết quả tra cứu</span>
              <span style={s.badge}>{found}/{results.codes.length} mã có tồn kho</span>
            </div>
            {results.codes.map((code) => {
              const rows = results.map[code];
              const name = rows[0]?.tenHang || "—";
              const total = rows.reduce((sum, r) => sum + parseQty(r.cuoiKy), 0);
              return (
                <div key={code} style={s.card}>
                  <div style={s.cardHead}>
                    <span style={s.codeTag}>{code}</span>
                    <span style={s.prodName}>{name}</span>
                    {rows.length > 0 && <span style={s.branchCount}>{rows.length} chi nhánh</span>}
                  </div>
                  {rows.length === 0 ? (
                    <div style={s.notFound}>⚠ Không tìm thấy mã hàng này trong file</div>
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
                            <td style={s.tdR}>{parseQty(r.cuoiKy).toLocaleString("vi-VN")}</td>
                          </tr>
                        ))}
                        {rows.length > 1 && (
                          <tr style={s.totalRow}>
                            <td style={{ ...s.td, color:C.accent, fontWeight:700 }} colSpan={4}>Tổng tồn kho</td>
                            <td style={{ ...s.tdR, color:C.accent }}>{total.toLocaleString("vi-VN")}</td>
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

        {!results && data && <div style={s.empty}>Nhập mã hàng và nhấn Tra cứu</div>}
      </div>
    </div>
  );
}