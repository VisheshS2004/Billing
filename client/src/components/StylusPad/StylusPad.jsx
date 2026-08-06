import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import axiosClient from '../../api/axiosClient';
import { useProductStore } from '../../store/productStore';
import { useBillStore } from '../../store/billStore';

const STATUS_STYLE = {
  high: { bg: '#064e3b', border: '#10b981', icon: '✓', color: '#34d399' },
  medium: { bg: '#451a03', border: '#f59e0b', icon: '⚠', color: '#fbbf24' },
  low: { bg: '#450a0a', border: '#ef4444', icon: '✗', color: '#f87171' },
};

// ─── Parse fractional quantities: "2½" → 2.5, "½" → 0.5 ─────────────────
function parseQty(qtyOrRaw, fallbackRaw = '') {
  if (qtyOrRaw === null || qtyOrRaw === undefined || qtyOrRaw === '') return 1;
  let s = String(qtyOrRaw).trim();
  s = s.replace(/^\d+\.(?!\d)\s*/, ''); // only strip list markers like '1. ', not decimals like '2.5'
  
  const FRAC = { '½': 0.5, '⅓': 1/3, '⅔': 2/3, '¼': 0.25, '¾': 0.75,
                 '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
                 '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

  let targetString = s;
  const numValue = Number(s);
  
  if (!isNaN(numValue) && fallbackRaw) {
    const rawStr = String(fallbackRaw).trim().replace(/^\d+\.(?!\d)\s*/, '');
    if (/[\u00BC-\u00BE\u2150-\u215E]|\d+\/\d+/.test(rawStr)) {
       targetString = rawStr; 
    } else {
       return numValue;
    }
  } else if (!isNaN(numValue)) {
    return numValue;
  }
  
  const mixed = targetString.match(/(\d+)?\s*([\u00BC-\u00BE\u2150-\u215E])/);
  if (mixed) { const w = mixed[1] ? parseInt(mixed[1]) : 0; return w + (FRAC[mixed[2]] || 0); }
  
  const slash = targetString.match(/(?:(\d+)\s+)?(\d+)\/(\d+)/);
  if (slash) {
    const w = slash[1] ? parseInt(slash[1]) : 0;
    return w + parseInt(slash[2]) / parseInt(slash[3]);
  }
  
  return parseFloat(targetString) || 1;
}

// ─── Pro-rate price for gm/ml sub-unit quantities ─────────────────────────
// e.g. product is kg @ ₹100, qty = 500 gm → linePrice = 100 × 0.5 = ₹50
function computeLinePrice(product, qty, scannedUnit) {
  if (!product) return null;
  const price = product.priceRetail;
  if (price == null) return null;
  const pUnit = product.unit;
  const q = parseFloat(qty) || 0;
  // Weight conversion
  if (pUnit === 'kg' && scannedUnit === 'gm') return +(price * q / 1000).toFixed(2);
  // Volume conversion
  if (pUnit === 'litre' && scannedUnit === 'ml') return +(price * q / 1000).toFixed(2);
  // Same unit or no conversion needed
  return +(price * q).toFixed(2);
}

// All valid units (must match server/models/Product.js)
const VALID_UNITS = [
  'kg', 'gm', 'katta',
  'litre', 'ml',
  'piece', 'dozen', 'patty', 'set',
  'packet', 'box', 'carton', 'bottle', 'tin', 'bag', 'ladi', 'teen',
  'M', 'cane',
];

// ─── Transliterate Roman → Devanagari ────────────────────────────────────
async function transliterateToHindi(text) {
  if (!text || /^[\u0900-\u097F\s]+$/.test(text)) return text;
  try {
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`;
    const res = await fetch(url);
    const data = await res.json();
    return data[1]?.[0]?.[1]?.[0] || text;
  } catch { return text; }
}

// ─── Inline Name Editor with live transliteration + dropdown ─────────────
function NameEditor({ value, onSelect, products }) {
  const [inputVal, setInputVal] = useState(value);

  useEffect(() => {
    setInputVal(value);
  }, [value]);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  const fuse = useMemo(() => new Fuse(products, {
    keys: ['name'], threshold: 0.45, ignoreLocation: true, minMatchCharLength: 1,
  }), [products]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setInputVal(val);
    setSuggestions([]);
    if (!val.trim()) { setOpen(false); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const searchTerm = await transliterateToHindi(val.trim());
        const results = fuse.search(searchTerm).slice(0, 6).map(r => r.item);
        setSuggestions(results);
        setOpen(results.length > 0);
      } finally { setBusy(false); }
    }, 300);
  };

  const pick = (product) => {
    setInputVal(product.name);
    setSuggestions([]);
    setOpen(false);
    onSelect(product);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input
        value={inputVal}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        style={{
          width: '100%', padding: '3px 6px', fontSize: '13px', fontWeight: '600',
          background: 'var(--bg)', border: '1px solid var(--border-strong)',
          borderRadius: '6px', color: 'var(--text-primary)', boxSizing: 'border-box',
        }}
        placeholder="Item name..."
      />
      {busy && (
        <span style={{ position: 'absolute', right: '6px', top: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>…</span>
      )}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          overflow: 'hidden', marginTop: '2px',
        }}>
          {suggestions.map((p, i) => (
            <div
              key={p._id || i}
              onMouseDown={() => pick(p)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                {p.name}
                {p.quality && ` (Qual: ${p.quality})`}
                {p.packetSize && ` (${p.packetSize})`}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {p.unit}{p.mrp ? ` · MRP ₹${p.mrp}` : ''} · ₹{p.priceRetail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Scanner Component ───────────────────────────────────────────────
const StylusPad = () => {
  const cameraInputRef = useRef(null);

  const [status, setStatus] = useState('ready');
  const [errorMsg, setErrorMsg] = useState('');
  const [editableItems, setEditableItems] = useState([]);
  const [showScanPanel, setShowScanPanel] = useState(false);
  const [transcriptionSrc, setTranscriptionSrc] = useState('');

  const { products } = useProductStore();
  const { 
    addItem, addCustomItem, setCustomerName,
    loadedItemsToVerify, setLoadedItemsToVerify
  } = useBillStore();

  // Load items from database bill for editing in StylusPad
  useEffect(() => {
    if (loadedItemsToVerify && loadedItemsToVerify.length > 0) {
      const editable = loadedItemsToVerify.map((item, index) => {
        const product = item.isCustom ? null : {
          _id: item._id,
          name: item.name,
          unit: item.unit,
          priceRetail: item.priceRetail,
          priceWholesale: item.priceWholesale,
          mrp: item.mrp || item.priceRetail,
          quality: item.quality || '',
          packetSize: item.packetSize || ''
        };

        return {
          id: `stylus_loaded_${Date.now()}_${index}_${Math.random()}`,
          raw: item.name,
          scannedAbbr: item.name,
          editName: item.name,
          editQty: item.qty,
          editUnit: item.unit,
          editMrp: item.priceRetail || '',
          selectedProduct: product,
          status: 'high',
          confidence: 1.0,
          warnings: [],
          isManual: true
        };
      });

      setEditableItems(editable);
      setShowScanPanel(true);
      setStatus('ready');
      setLoadedItemsToVerify([]);
    }
  }, [loadedItemsToVerify, setLoadedItemsToVerify]);

  // Build fuse index for re-matching
  const fuse = useMemo(() => new Fuse(products, {
    keys: ['name'], threshold: 0.45, ignoreLocation: true, minMatchCharLength: 1,
  }), [products]);

  // ─── Re-match product when unit, MRP, quality, or packet size changes ───
  const rematchByHints = (index, nameHint, unit, mrp, quality, packetSize) => {
    if (!nameHint || products.length === 0) return;

    let candidates = fuse.search(nameHint).map(r => r.item);

    // Narrow down by exact name match if available
    const exactName = candidates.filter(p => p.name.toLowerCase() === nameHint.toLowerCase());
    if (exactName.length > 0) candidates = exactName;

    if (candidates.length === 0) {
      updateItem(index, { selectedProduct: null });
      return;
    }

    // Filter by quality if specified
    if (quality !== undefined) {
      const byQual = candidates.filter(p => (p.quality || '') === quality);
      if (byQual.length > 0) candidates = byQual;
    }

    // Filter by packetSize if specified
    if (packetSize !== undefined) {
      const byPack = candidates.filter(p => (p.packetSize || '') === packetSize);
      if (byPack.length > 0) candidates = byPack;
    }

    // Filter by unit if chosen
    if (unit) {
      const byUnit = candidates.filter(p => p.unit === unit);
      if (byUnit.length > 0) candidates = byUnit;
    }

    // Further filter by MRP if provided
    if (mrp !== '' && mrp !== null && Number(mrp) > 0) {
      const byMrp = candidates.filter(p => p.mrp === Number(mrp));
      if (byMrp.length > 0) candidates = byMrp;
    }

    const matchedProduct = candidates[0] || null;

    updateItem(index, {
      selectedProduct: matchedProduct,
      editUnit: matchedProduct?.unit || unit,
      editMrp: matchedProduct?.mrp != null ? matchedProduct.mrp : mrp,
      quality: matchedProduct?.quality || '',
      packetSize: matchedProduct?.packetSize || '',
      status: matchedProduct ? 'high' : 'medium'
    });
  };

  // ─── Compress image ───────────────────────────────────────────────────────
  const compressImage = (file) => new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });

  // ─── Scan handler ─────────────────────────────────────────────────────────
  const handlePhotoSelected = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setStatus('scanning');
    setEditableItems([]);
    setShowScanPanel(false);

    try {
      const base64 = await compressImage(file);
      if (!base64) throw new Error('Could not read image file');

      const { data } = await axiosClient.post('/ocr', {
        imageBase64: base64, mode: 'list',
      }, { timeout: 60000 });

      if (!data.success) throw new Error(data.message || 'OCR failed');
      setTranscriptionSrc(data.transcriptionSource || '');

      if (!data.items || data.items.length === 0) {
        setEditableItems([]); setShowScanPanel(true); setStatus('ready');
        return;
      }

      // Filter out common header lines and empty noise
      const cleanList = data.items.filter(item => {
        const rawName = item.parsed?.item || item.raw || '';
        const cleaned = rawName.replace(/^(name|customer|customer name|naam|नाम)[:\-\s]+/i, '').trim().toLowerCase();
        const isHeader = /^(list|item|grocery|bill|invoice|date|no|sr\s*no|particulars|quantity|price|total|सामान|सूची|विवरण|मात्रा|मूल्य|दर|rupees|total\s*amount)$/i.test(cleaned);
        return !isHeader && cleaned.length > 0;
      });

      let finalItems = cleanList;
      const firstItem = cleanList[0];
      if (firstItem) {
        const rawName = firstItem.parsed?.item || firstItem.raw || '';
        // Clean up common prefixes like "Name:", "Customer:", "Naam:", "नाम:"
        const cleanedName = rawName.replace(/^(name|customer|customer name|naam|नाम)[:\-\s]+/i, '').trim();
        if (cleanedName) {
          setCustomerName(cleanedName);
        }
        // Exclude the customer name from the scanned products list
        finalItems = cleanList.slice(1);
      }

      const editable = finalItems.map((item, index) => {
        const parsedName = item.parsed?.item || item.raw || '';
        return {
          ...item,
          id: `stylus_${Date.now()}_${index}_${Math.random()}`,
          scannedAbbr: parsedName,
          editName: item.matched?.product?.name || parsedName,
          editQty: parseQty(item.parsed?.qty ?? 1, item.raw),
          editUnit: item.matched?.product?.unit || item.parsed?.unit || '',
          editMrp: item.parsed?.mrp ?? '',
          selectedProduct: item.matched?.product || null,
          quality: item.matched?.product?.quality || '',
          packetSize: item.matched?.product?.packetSize || '',
        };
      });

      setEditableItems(editable);
      setShowScanPanel(true);
      setStatus('ready');

    } catch (err) {
      console.error('Photo scan failed:', err);
      setStatus('error');
      setErrorMsg(err.response?.data?.message || err.message || 'Unknown error');
      setTimeout(() => { setStatus('ready'); setErrorMsg(''); }, 6000);
    }
  }, [products]);

  // ─── Generic field updater ────────────────────────────────────────────────
  const updateItem = (index, patch) => {
    setEditableItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  // ─── Unit change → re-match immediately ───────────────────────────────────
  const handleUnitChange = (index, newUnit) => {
    const item = editableItems[index];
    updateItem(index, { editUnit: newUnit });
    rematchByHints(index, item.editName, newUnit, item.editMrp, item.quality, item.packetSize);
  };

  // ─── MRP change → re-match on blur (after typing is done) ────────────────
  const handleMrpChange = (index, newMrp) => {
    updateItem(index, { editMrp: newMrp });
  };
  const handleMrpBlur = (index) => {
    const item = editableItems[index];
    rematchByHints(index, item.editName, item.editUnit, item.editMrp, item.quality, item.packetSize);
  };

  // ─── Quality / Packet Size change → re-match immediately ───────────────────
  const handleQualityChange = (index, newQuality) => {
    const item = editableItems[index];
    rematchByHints(index, item.editName, item.editUnit, item.editMrp, newQuality, item.packetSize);
  };
  const handlePacketSizeChange = (index, newPacketSize) => {
    const item = editableItems[index];
    rematchByHints(index, item.editName, item.editUnit, item.editMrp, item.quality, newPacketSize);
  };

  // ─── Helpers to fetch alternative options for dropdowns ────────────────────
  const getQualityOptions = (productName) => {
    if (!productName) return [];
    const matches = products.filter(p => p.name.toLowerCase() === productName.toLowerCase());
    const quals = [...new Set(matches.map(p => p.quality || ''))].filter(Boolean);
    return quals;
  };
  const getPacketSizeOptions = (productName) => {
    if (!productName) return [];
    const matches = products.filter(p => p.name.toLowerCase() === productName.toLowerCase());
    const sizes = [...new Set(matches.map(p => p.packetSize || ''))].filter(Boolean);
    return sizes;
  };

  // ─── Product selected from name dropdown ──────────────────────────────────
  const handleProductSelect = (index, product) => {
    updateItem(index, {
      editName: product.name,
      editUnit: product.unit || editableItems[index].editUnit,
      editMrp: product.mrp != null ? product.mrp : editableItems[index].editMrp,
      selectedProduct: product,
      quality: product.quality || '',
      packetSize: product.packetSize || '',
    });
  };

  const handleMapAbbreviation = async (index) => {
    const item = editableItems[index];
    const abbrKey = (item.scannedAbbr || item.editName || '').trim();
    const fullName = item.selectedProduct?.name;

    if (!abbrKey || !fullName) {
      alert('Please select a database product for this item first!');
      return;
    }

    try {
      const response = await axiosClient.post('/abbreviations', {
        abbr: abbrKey,
        fullName: fullName
      });
      if (response.data.success) {
        updateItem(index, { isAbbrMapped: true });
        alert(`Successfully mapped "${abbrKey}" to "${fullName}"!`);
      }
    } catch (error) {
      console.error('Failed to map abbreviation:', error);
      alert(error.response?.data?.message || 'Failed to map abbreviation.');
    }
  };

  // ─── Add a blank manual row ───────────────────────────────────────────────
  const addManualRow = () => {
    setEditableItems(prev => [
      ...prev,
      {
        id: `manual_${Date.now()}_${Math.random()}`,
        raw: '', editName: '', editQty: 1, editUnit: '', editMrp: '',
        selectedProduct: null, status: 'medium', confidence: 0.5,
        warnings: [], isManual: true,
      },
    ]);
  };

  // ─── Delete a row ────────────────────────────────────────────────────────
  const deleteRow = (index) => {
    setEditableItems(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Add to bill ──────────────────────────────────────────────────────────
  const addAllScannedItems = () => {
    editableItems.forEach(item => {
      let qty = parseQty(item.editQty);
      const sUnit = item.editUnit?.toLowerCase();
      const pUnit = item.selectedProduct?.unit?.toLowerCase();
      if (sUnit === 'gm' && pUnit === 'kg') qty = qty / 1000;
      if (sUnit === 'ml' && pUnit === 'litre') qty = qty / 1000;

      if (item.selectedProduct) addItem(item.selectedProduct, qty);
      else if (item.editName) addCustomItem(item.editName || item.raw, qty);
    });
    setEditableItems([]); setShowScanPanel(false);
  };

  const addHighConfidenceOnly = () => {
    editableItems.filter(it => it.status !== 'low').forEach(item => {
      let qty = parseQty(item.editQty);
      const sUnit = item.editUnit?.toLowerCase();
      const pUnit = item.selectedProduct?.unit?.toLowerCase();
      if (sUnit === 'gm' && pUnit === 'kg') qty = qty / 1000;
      if (sUnit === 'ml' && pUnit === 'litre') qty = qty / 1000;

      if (item.selectedProduct) addItem(item.selectedProduct, qty);
      else if (item.editName) addCustomItem(item.editName || item.raw, qty);
    });
    setEditableItems([]); setShowScanPanel(false);
  };

  const resetScanner = () => {
    setEditableItems([]); setShowScanPanel(false);
    setStatus('ready'); setErrorMsg('');
  };

  const highCount = editableItems.filter(i => i.status === 'high').length;
  const mediumCount = editableItems.filter(i => i.status === 'medium').length;
  const lowCount = editableItems.filter(i => i.status === 'low').length;

  return (
    <div className="stylus-pad-container" style={{ minHeight: 'auto' }}>

      {/* ── Header ── */}
      <div className="pad-header">
        <div>
          <h3>List Scanner</h3>
          <span className="pad-status">
            {status === 'scanning' ? '📷 Scanning...'
              : status === 'error' ? `❌ ${errorMsg}`
                : '📷 Upload a list image to scan'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            ref={cameraInputRef} type="file" accept="image/*"
            capture="environment" style={{ display: 'none' }}
            onChange={handlePhotoSelected}
          />
          <button
            className="btn-primary"
            onClick={() => cameraInputRef.current?.click()}
            disabled={status === 'scanning'}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📷 Scan List
          </button>
          {showScanPanel && <button className="btn-secondary" onClick={resetScanner}>Clear</button>}
        </div>
      </div>

      {/* ── Scanning spinner ── */}
      {status === 'scanning' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '14px', padding: '48px 24px',
          background: 'var(--bg-elevated)', borderRadius: '12px',
          border: '1px solid var(--border-strong)', marginTop: '16px',
        }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            border: '3px solid rgba(99,102,241,0.25)', borderTop: '3px solid #6366f1',
            animation: 'spin 1s linear infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px',
          }}>📷</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '17px' }}>
            स्कैन हो रहा है...
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', lineHeight: 1.6 }}>
            Gemini Vision AI processing your list<br />
            <span style={{ color: '#6366f1' }}>Preprocessing → OCR → Parse → Match → Score</span>
          </div>
        </div>
      )}

      {/* ── Results panel ── */}
      {showScanPanel && editableItems.length > 0 && (
        <div className="scan-result-box" style={{ marginTop: '16px' }}>

          {/* Summary header */}
          <div className="scan-result-header">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontWeight: '600' }}>
                📋 {editableItems.length} items found
                {transcriptionSrc && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>
                    via {transcriptionSrc}
                  </span>
                )}
              </span>
              <span style={{ fontSize: '12px', display: 'flex', gap: '10px' }}>
                <span style={{ color: '#34d399' }}>✓ {highCount} high</span>
                {mediumCount > 0 && <span style={{ color: '#fbbf24' }}>⚠ {mediumCount} medium</span>}
                {lowCount > 0 && <span style={{ color: '#f87171' }}>✗ {lowCount} low</span>}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {lowCount > 0 && (
                <button className="btn-secondary" style={{ fontSize: '12px', padding: '5px 10px' }}
                  onClick={addHighConfidenceOnly}>✓ Add Verified Only</button>
              )}
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}
                onClick={addAllScannedItems}>✅ Add All to Bill</button>
            </div>
          </div>

          {/* ── Column labels ── */}
          <div className="verification-header-grid" style={{
            padding: '6px 10px 2px',
            fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '0.05em'
          }}>
            <span />
            <span>Item Name</span>
            <span>MRP (₹)</span>
            <span>Qty</span>
            <span>Unit</span>
            <span style={{ textAlign: 'right' }}>Total ₹</span>
            <span />
          </div>

          {/* ── Editable rows ── */}
          <div className="scan-items-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {editableItems.map((item, i) => {
              const st = STATUS_STYLE[item.status] || STATUS_STYLE.medium;
              const product = item.selectedProduct;
              const lineTotal = computeLinePrice(product, item.editQty, item.editUnit);

              return (
                <div key={item.id} style={{
                  borderLeft: `3px solid ${st.border}`,
                  background: st.bg + '33',
                  padding: '8px 10px', borderRadius: '8px',
                  display: 'flex', flexDirection: 'column', gap: '6px',
                }}>

                  {/* ── Grid Row ── */}
                  <div className="verification-row-grid">
                    {/* Status icon */}
                    <span style={{ color: st.color, fontSize: '14px' }}>{st.icon}</span>

                    {/* Name with live dropdown */}
                    <NameEditor
                      value={item.editName}
                      products={products}
                      onSelect={(p) => handleProductSelect(i, p)}
                    />

                    {/* MRP — numeric, re-match on blur */}
                    <input
                      type="number"
                      min="0" step="0.01"
                      value={item.editMrp}
                      onChange={e => handleMrpChange(i, e.target.value)}
                      onBlur={() => handleMrpBlur(i)}
                      placeholder="—"
                      style={{
                        padding: '3px 6px', fontSize: '12px',
                        background: 'var(--bg)', border: '1px solid var(--border-strong)',
                        borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center',
                        width: '100%', boxSizing: 'border-box',
                      }}
                    />

                    {/* Qty */}
                    <input
                      type="number" min="0.1" step="0.5"
                      value={item.editQty}
                      onChange={e => updateItem(i, { editQty: e.target.value })}
                      style={{
                        padding: '3px 6px', fontSize: '13px', fontWeight: '600',
                        background: 'var(--bg)', border: '1px solid var(--border-strong)',
                        borderRadius: '6px', color: 'var(--text-primary)', textAlign: 'center',
                        width: '100%', boxSizing: 'border-box',
                      }}
                    />

                    {/* Unit — dropdown */}
                    <select
                      value={item.editUnit}
                      onChange={e => handleUnitChange(i, e.target.value)}
                      style={{
                        padding: '3px 4px', fontSize: '12px',
                        background: 'var(--bg)', border: '1px solid var(--border-strong)',
                        borderRadius: '6px', color: 'var(--text-primary)',
                        width: '100%', boxSizing: 'border-box', cursor: 'pointer',
                      }}
                    >
                      <option value="">— unit —</option>
                      <optgroup label="Weight">
                        {['kg', 'gm', 'katta'].map(u => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                      <optgroup label="Volume">
                        {['litre', 'ml'].map(u => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                      <optgroup label="Count">
                        {['piece', 'dozen', 'patty', 'set'].map(u => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                      <optgroup label="Packaging">
                        {['packet', 'box', 'carton', 'bottle', 'tin', 'bag', 'ladi', 'teen'].map(u => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                      <optgroup label="Other">
                        {['M', 'cane'].map(u => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                    </select>

                    {/* Line total — computed from qty × price with unit conversion */}
                    <div style={{ textAlign: 'right', fontSize: '13px' }}>
                      {product && lineTotal != null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                          <span style={{ color: '#10b981', fontWeight: '700' }}>₹{lineTotal}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                            @₹{product.priceRetail}/{product.unit}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '12px' }}>no price</span>
                      )}
                    </div>

                    {/* Delete row */}
                    <button
                      onClick={() => deleteRow(i)}
                      title="Remove this item"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#ef4444', fontSize: '14px', padding: '0', lineHeight: 1,
                      }}
                    >✕</button>
                  </div>

                  {/* ── Meta: raw OCR + confidence + warnings + Verify Button ── */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', paddingLeft: '20px', alignItems: 'center' }}>
                    {!item.isManual && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        "{item.raw}"
                      </span>
                    )}
                    {!item.isManual && (
                      <span style={{
                        fontSize: '11px', padding: '1px 6px', borderRadius: '10px',
                        background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                      }}>
                        {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                    
                    {/* Quality selector */}
                    {getQualityOptions(item.editName).length > 0 && (
                      <select
                        value={item.quality || ''}
                        onChange={e => handleQualityChange(i, e.target.value)}
                        style={{
                          padding: '2px 6px', fontSize: '11px',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                          borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        <option value="">No Quality</option>
                        {getQualityOptions(item.editName).map(q => (
                          <option key={q} value={q}>Qual: {q}</option>
                        ))}
                      </select>
                    )}

                    {/* Packet size selector */}
                    {getPacketSizeOptions(item.editName).length > 0 && (
                      <select
                        value={item.packetSize || ''}
                        onChange={e => handlePacketSizeChange(i, e.target.value)}
                        style={{
                          padding: '2px 6px', fontSize: '11px',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                          borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        <option value="">No Pack</option>
                        {getPacketSizeOptions(item.editName).map(sz => (
                          <option key={sz} value={sz}>Pack: {sz}</option>
                        ))}
                      </select>
                    )}

                     {item.status !== 'high' && (
                      <button
                        onClick={() => updateItem(i, { status: 'high' })}
                        style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                          background: '#064e3b', border: '1px solid #10b981', color: '#34d399',
                          cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center'
                        }}
                      >
                        ✓ Verify
                      </button>
                    )}

                    {item.selectedProduct && (item.scannedAbbr || item.editName) && (
                      <button
                        onClick={() => handleMapAbbreviation(i)}
                        disabled={item.isAbbrMapped}
                        style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                          background: item.isAbbrMapped ? '#064e3b' : 'rgba(99,102,241,0.15)',
                          border: item.isAbbrMapped ? '1px solid #10b981' : '1px solid #818cf8',
                          color: item.isAbbrMapped ? '#34d399' : '#818cf8',
                          cursor: item.isAbbrMapped ? 'default' : 'pointer',
                          fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '3px'
                        }}
                      >
                        {item.isAbbrMapped ? '✓ Abbr Mapped!' : `🔗 Map Abbr: "${item.scannedAbbr || item.editName}" ➔ "${item.selectedProduct.name}"`}
                      </button>
                    )}

                    {!item.selectedProduct && (item.scannedAbbr || item.editName) && (
                      <button
                        disabled
                        title="Search & select a database product in the input field above first, then map it!"
                        style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                          color: 'var(--text-muted)', cursor: 'not-allowed',
                          fontWeight: 'bold', display: 'inline-flex', alignItems: 'center'
                        }}
                      >
                        🔗 Map Abbreviation (Select product first)
                      </button>
                    )}
                    {item.warnings?.map((w, wi) => (
                      <span key={wi} style={{
                        fontSize: '10px', color: '#fbbf24',
                        background: '#451a0355', padding: '1px 5px', borderRadius: '8px',
                      }}>⚠ {w}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Add Item button ── */}
          <button
            onClick={addManualRow}
            style={{
              width: '100%', marginTop: '6px',
              padding: '8px', border: '1px dashed var(--border-strong)',
              borderRadius: '8px', background: 'transparent',
              color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            ＋ Add missed item
          </button>

          <button className="btn-secondary"
            style={{ width: '100%', marginTop: '10px', fontSize: '12px' }}
            onClick={resetScanner}>✕ Dismiss</button>
        </div>
      )}

      {/* ── No items found ── */}
      {showScanPanel && editableItems.length === 0 && (
        <div className="scan-result-box" style={{ marginTop: '16px' }}>
          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
            📷 No items could be extracted.<br />
            <span style={{ fontSize: '12px' }}>
              Make sure the list is clearly visible, well-lit, one item per line.
            </span>
          </div>
          <button className="btn-secondary" style={{ width: '100%', fontSize: '12px' }}
            onClick={resetScanner}>✕ Dismiss</button>
        </div>
      )}
    </div>
  );
};

export default StylusPad;
