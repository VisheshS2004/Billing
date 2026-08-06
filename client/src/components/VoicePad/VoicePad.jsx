import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import axiosClient from '../../api/axiosClient';
import { useProductStore } from '../../store/productStore';
import { useBillStore } from '../../store/billStore';

/* ─── Re-use the same status style as StylusPad ─────────────────────────── */
const STATUS_STYLE = {
  high: { bg: '#064e3b', border: '#10b981', icon: '✓', color: '#34d399' },
  medium: { bg: '#451a03', border: '#f59e0b', icon: '⚠', color: '#fbbf24' },
  low: { bg: '#450a0a', border: '#ef4444', icon: '✗', color: '#f87171' },
};

/* ─── Parse fractional quantities: "1.2½" → 2.5, "½" → 0.5 ────────────────── */
function parseQty(qtyOrRaw, fallbackRaw = '') {
  if (qtyOrRaw === null || qtyOrRaw === undefined || qtyOrRaw === '') return 1;
  let s = String(qtyOrRaw).trim();
  s = s.replace(/^\d+\.(?!\d)\s*/, ''); // only strip list markers like '1. ', not decimals like '2.5'
  
  const FRAC = { '½': 0.5, '⅓': 1/3, '⅔': 2/3, '¼': 0.25, '¾': 0.75,
                 '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
                 '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

  let targetString = s;
  const numValue = Number(s);
  
  // If AI gave us a plain number but the raw text contains a fraction, override it
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

/* ─── Pro-rate price for gm/ml sub-unit quantities ───────────────────────── */
function computeLinePrice(product, qty, scannedUnit) {
  if (!product) return null;
  const price = product.priceRetail;
  if (price == null) return null;
  const pUnit = product.unit;
  const q     = parseFloat(qty) || 0;
  if (pUnit === 'kg'    && scannedUnit === 'gm')  return +(price * q / 1000).toFixed(2);
  if (pUnit === 'litre' && scannedUnit === 'ml')  return +(price * q / 1000).toFixed(2);
  return +(price * q).toFixed(2);
}

/* ─── Transliterate Roman → Devanagari (same helper as StylusPad) ─────────*/
async function transliterateToHindi(text) {
  if (!text || /^[\u0900-\u097F\s]+$/.test(text)) return text;
  try {
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`;
    const res = await fetch(url);
    const data = await res.json();
    return data[1]?.[0]?.[1]?.[0] || text;
  } catch { return text; }
}

/* ─── Inline Name Editor (same as StylusPad's NameEditor) ───────────────── */
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

/* ─── Valid units (same list as StylusPad) ───────────────────────────────── */
const VALID_UNITS = [
  'kg', 'gm', 'katta',
  'litre', 'ml',
  'piece', 'dozen', 'patty', 'set',
  'packet', 'box', 'carton', 'bottle', 'tin', 'bag', 'ladi', 'teen',
  'M', 'cane',
];

/* ═══════════════════════════════════════════════════════════════════════════
   VoicePad — Main Component
   ═══════════════════════════════════════════════════════════════════════════ */
const VoicePad = () => {
  /* ── State ───────────────────────────────────────────────────────────────*/
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [editableItems, setEditableItems] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [itemChips, setItemChips] = useState([]);
  const [nextFlash, setNextFlash] = useState(false);

  /* ── Refs ────────────────────────────────────────────────────────────────*/
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const segmentsRef = useRef([]);

  /* ── Stores ──────────────────────────────────────────────────────────────*/
  const { products } = useProductStore();
  const { addItem, addCustomItem } = useBillStore();

  /* ── Fuse index for client-side re-matching ──────────────────────────────*/
  const fuse = useMemo(() => new Fuse(products, {
    keys: ['name'], threshold: 0.45, ignoreLocation: true, minMatchCharLength: 1,
  }), [products]);

  /* ── Check MediaRecorder support ────────────────────────────────────────*/
  const mediaSupported = typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  /* ── Blob → base64 helper ────────────────────────────────────────────────*/
  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  /* ── Start a fresh MediaRecorder on the existing stream ──────────────────*/
  const startNewRecording = useCallback(() => {
    if (!streamRef.current) return;
    audioChunksRef.current = [];

    // Prefer opus/webm for smallest file; fall back to whatever browser supports
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

    const mr = new MediaRecorder(streamRef.current, { mimeType });
    mr.ondataavailable = (e) => {
      if (e.data?.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorderRef.current = mr;
    mr.start(200);  // collect a chunk every 200ms so data is ready on stop
  }, []);

  /* ── Stop MediaRecorder, return a Blob promise ───────────────────────────*/
  const collectAudio = useCallback(() => new Promise((resolve) => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') {
      console.warn('[Whisper] collectAudio called but MediaRecorder is missing or inactive');
      resolve(null);
      return;
    }

    const chunks = [...audioChunksRef.current];
    mr.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      const mimeType = mr.mimeType || 'audio/webm';
      resolve(new Blob(chunks, { type: mimeType }));
    };
    try {
      mr.stop();
    } catch (err) {
      console.error('[Whisper] Error stopping MediaRecorder:', err);
      resolve(null);
    }
  }), []);

  /* ── Transcribe one audio Blob via /api/whisper ──────────────────────────*/
  const transcribeBlob = useCallback(async (blob) => {
    if (!blob) {
      console.warn('[Whisper] No audio blob collected');
      return '';
    }
    console.log(`[Whisper] Collected audio blob: ${blob.size} bytes (${blob.type})`);
    if (blob.size < 100) {
      console.warn('[Whisper] Audio blob too small, ignoring');
      return ''; // silence / too short
    }
    const dataUrl = await blobToBase64(blob);
    const b64 = dataUrl.split(',')[1];
    const mimeType = blob.type.split(';')[0] || 'audio/webm';
    console.log(`[Whisper] Sending ${b64.length} chars to /api/whisper`);
    try {
      const { data } = await axiosClient.post('/whisper', { audioBase64: b64, mimeType }, { timeout: 20000 });
      console.log(`[Whisper] Received transcript: "${data.text}" (${data.source})`);
      return data.text?.trim() || '';
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.message;
      console.error('[Whisper] API call failed:', serverMsg);
      throw err;
    }
  }, []);

  /* ── Next Item — stop recording, transcribe, start fresh ─────────────────*/
  const nextItem = useCallback(async () => {
    if (!mediaRecorderRef.current || isTranscribing) return;

    setIsTranscribing(true);
    setNextFlash(true);
    setTimeout(() => setNextFlash(false), 400);

    try {
      const blob = await collectAudio();
      const text = await transcribeBlob(blob);

      if (text) {
        const label = text.length > 35 ? text.slice(0, 33) + '…' : text;
        setItemChips(prev => [...prev, { id: Date.now(), label }]);
        segmentsRef.current = [...segmentsRef.current, text];
      }
    } catch (err) {
      console.warn('[Whisper] nextItem transcription failed:', err.message);
    }

    setIsTranscribing(false);
    startNewRecording();  // fresh recording for next item
  }, [isTranscribing, collectAudio, transcribeBlob, startNewRecording]);

  /* ── Start listening ─────────────────────────────────────────────────────*/
  const startListening = useCallback(async () => {
    if (!mediaSupported) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,  // Whisper works best at 16kHz
        },
      });
      streamRef.current = stream;
      segmentsRef.current = [];
      audioChunksRef.current = [];

      setItemChips([]);
      setEditableItems([]);
      setShowPanel(false);
      setErrorMsg('');
      setIsPaused(false);

      startNewRecording();
      setIsListening(true);
      setStatus('listening');
    } catch (err) {
      setStatus('error');
      setErrorMsg('Could not access microphone: ' + err.message);
    }
  }, [mediaSupported, startNewRecording]);

  /* ── Stop listening + collect final audio + send transcript to Gemini ────*/
  const stopListening = useCallback(async () => {
    setIsListening(false);
    setIsPaused(false);
    setIsTranscribing(true);

    try {
      // Transcribe the last item
      const blob = await collectAudio();
      const lastText = await transcribeBlob(blob);

      if (lastText) {
        setItemChips(prev => [...prev, { id: Date.now(), label: lastText.length > 35 ? lastText.slice(0, 33) + '…' : lastText }]);
        segmentsRef.current = [...segmentsRef.current, lastText];
      }
    } catch (err) {
      console.warn('[Whisper] final transcription failed:', err.message);
    } finally {
      // Stop microphone stream
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    setIsTranscribing(false);

    const transcript = segmentsRef.current.join(' | ');
    segmentsRef.current = [];

    if (!transcript.trim()) {
      setStatus('idle');
      return;
    }

    // ── Send full transcript to Gemini for parsing (unchanged) ──────────────
    setStatus('processing');
    try {
      const { data } = await axiosClient.post('/voice', { transcript }, { timeout: 45000 });
      if (!data.success) throw new Error(data.message || 'Voice parse failed');

      if (!data.items || data.items.length === 0) {
        setEditableItems([]);
        setShowPanel(true);
        setStatus('done');
        return;
      }

      // ── Client-side fuzzy match: transliterate name if Roman script, then Fuse ──
      const editable = await Promise.all(data.items.map(async (item, index) => {
        const rawHint = item.parsed?.item || item.raw || '';
        // If Gemini returned a Roman/English name, convert to Hindi first
        const nameHint = await transliterateToHindi(rawHint);
        let selectedProduct = null;

        if (nameHint && products.length > 0) {
          const candidates = fuse.search(nameHint).map(r => r.item);
          if (candidates.length > 0) {
            // Narrow by MRP if available
            const mrp = item.parsed?.mrp;
            if (mrp) {
              const byMrp = candidates.filter(p => p.mrp === mrp);
              selectedProduct = byMrp[0] || candidates[0];
            } else {
              selectedProduct = candidates[0];
            }
          }
        }

        // Recalculate confidence/status with match
        const hasMatch = !!selectedProduct;
        const confidence = hasMatch ? 0.82 : 0.45;
        const itemStatus = hasMatch ? 'high' : 'medium';

        return {
          ...item,
          id: `voice_${Date.now()}_${index}_${Math.random()}`,
          editName: selectedProduct?.name || nameHint || rawHint,
          editQty: parseQty(item.parsed?.qty ?? 1, item.raw),
          editUnit: selectedProduct?.unit || item.parsed?.unit || '',
          editMrp: item.parsed?.mrp ?? '',
          selectedProduct,
          confidence,
          status: itemStatus,
        };
      }));

      setEditableItems(editable);
      setShowPanel(true);
      setStatus('done');

    } catch (err) {
      console.error('Voice processing failed:', err);
      setStatus('error');
      setErrorMsg(err.response?.data?.message || err.message || 'Unknown error');
      setTimeout(() => { setStatus('idle'); setErrorMsg(''); }, 6000);
    }
  }, [products, fuse, collectAudio, transcribeBlob]);

  /* ── Pause mic (talk to customer) ────────────────────────────────────────*/
  const pauseMic = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === 'recording') {
      if (typeof mr.pause === 'function') {
        mr.pause();   // Chrome supports MediaRecorder.pause()
      } else {
        // Fallback: stop without transcribing (discard partial audio since last chip)
        mr.onstop = null;
        mr.stop();
      }
    }
    setIsPaused(true);
    setStatus('paused');
  }, []);

  /* ── Resume mic (back to billing) ────────────────────────────────────────*/
  const resumeMic = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr?.state === 'paused') {
      mr.resume();  // resume existing recording from where we left off
    } else {
      startNewRecording();  // start fresh (was stopped)
    }
    setIsPaused(false);
    setStatus('listening');
  }, [startNewRecording]);

  // ─── Re-match product when unit or MRP changes ─────────────────────────
  const rematchByHints = (index, nameHint, unit, mrp) => {
    if (!nameHint || products.length === 0) return;

    let candidates = fuse.search(nameHint).map(r => r.item);
    if (candidates.length === 0) {
      updateItem(index, { selectedProduct: null });
      return;
    }

    if (unit) {
      const byUnit = candidates.filter(p => p.unit === unit);
      if (byUnit.length > 0) candidates = byUnit;
    }

    if (mrp !== '' && mrp !== null && Number(mrp) > 0) {
      const byMrp = candidates.filter(p => p.mrp === Number(mrp));
      if (byMrp.length > 0) candidates = byMrp;
    }

    updateItem(index, { selectedProduct: candidates[0] || null });
  };

  // ─── Generic field updater ────────────────────────────────────────────────
  const updateItem = (index, patch) => {
    setEditableItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };

  // ─── Unit change → re-match immediately ───────────────────────────────────
  const handleUnitChange = (index, newUnit) => {
    const item = editableItems[index];
    updateItem(index, { editUnit: newUnit });
    rematchByHints(index, item.editName, newUnit, item.editMrp);
  };

  // ─── MRP change → re-match on blur (after typing is done) ────────────────
  const handleMrpChange = (index, newMrp) => {
    updateItem(index, { editMrp: newMrp });
  };
  const handleMrpBlur = (index) => {
    const item = editableItems[index];
    rematchByHints(index, item.editName, item.editUnit, item.editMrp);
  };

  // ─── Product selected from name dropdown ──────────────────────────────────
  const handleProductSelect = (index, product) => {
    updateItem(index, {
      editName: product.name,
      editUnit: product.unit || editableItems[index].editUnit,
      editMrp: product.mrp != null ? product.mrp : editableItems[index].editMrp,
      selectedProduct: product,
    });
  };

  /* ── Add all to bill ─────────────────────────────────────────────────────*/
  const addAllItems = () => {
    editableItems.forEach(item => {
      let qty = parseQty(item.editQty) || 1;
      const sUnit = item.editUnit?.toLowerCase();
      const pUnit = item.selectedProduct?.unit?.toLowerCase();
      if (sUnit === 'gm' && pUnit === 'kg') qty = qty / 1000;
      if (sUnit === 'ml' && pUnit === 'litre') qty = qty / 1000;

      if (item.selectedProduct) addItem(item.selectedProduct, qty);
      else addCustomItem(item.editName || item.raw || 'Unknown', qty);
    });
    resetPanel();
  };

  const deleteRow = (index) => {
    setEditableItems(prev => prev.filter((_, i) => i !== index));
  };

  const addManualRow = () => {
    setEditableItems(prev => [
      ...prev,
      {
        id: `manual_${Date.now()}_${Math.random()}`,
        raw: 'Manual Entry',
        isManual: true,
        editName: '',
        editQty: 1,
        editUnit: '',
        editMrp: '',
        selectedProduct: null,
        confidence: 1,
        status: 'high'
      }
    ]);
  };

  const addHighConfidenceOnly = () => {
    editableItems.filter(it => it.status !== 'low').forEach(item => {
      let qty = parseQty(item.editQty) || 1;
      const sUnit = item.editUnit?.toLowerCase();
      const pUnit = item.selectedProduct?.unit?.toLowerCase();
      if (sUnit === 'gm' && pUnit === 'kg') qty = qty / 1000;
      if (sUnit === 'ml' && pUnit === 'litre') qty = qty / 1000;

      if (item.selectedProduct) addItem(item.selectedProduct, qty);
      else addCustomItem(item.editName || item.raw || 'Unknown', qty);
    });
    resetPanel();
  };

  const resetPanel = () => {
    setEditableItems([]);
    setShowPanel(false);
    setItemChips([]);
    setIsPaused(false);
    segmentsRef.current = [];
    audioChunksRef.current = [];
    setStatus('idle');
    setErrorMsg('');
  };

  /* ── Stats ───────────────────────────────────────────────────────────────*/
  const highCount = editableItems.filter(i => i.status === 'high').length;
  const mediumCount = editableItems.filter(i => i.status === 'medium').length;
  const lowCount = editableItems.filter(i => i.status === 'low').length;

  /* ── Cleanup on unmount ──────────────────────────────────────────────────*/
  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop(); } catch (_) { }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  /* ── Not supported banner ────────────────────────────────────────────────*/
  if (!mediaSupported) {
    return (
      <div className="stylus-pad-container" style={{ minHeight: 'auto' }}>
        <div className="pad-header"><h3>🎙️ Voice Input</h3></div>
        <div style={{
          padding: '16px', background: '#450a0a33',
          border: '1px solid #ef4444', borderRadius: '8px', marginTop: '12px',
          color: '#f87171', fontSize: '13px',
        }}>
          ⚠️ Your browser does not support MediaRecorder.<br />
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
            Use Google Chrome or Microsoft Edge for voice input.
          </span>
        </div>
      </div>
    );
  }


  /* ─────────────────────────────────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="stylus-pad-container" style={{ minHeight: 'auto' }}>

      {/* ── Header ── */}
      <div className="pad-header">
        <div>
          <h3>🎙️ Voice Input</h3>
          <span className="pad-status">
            {status === 'listening' ? '🔴 Listening... speak your full list'
              : status === 'paused' ? '🟡 Mic paused — talk to customer, then Resume'
                : status === 'processing' ? '⏳ Gemini is parsing your list...'
                  : status === 'error' ? `❌ ${errorMsg}`
                    : status === 'done' ? '✅ Done — review below'
                      : 'Press Start, speak the full list, then press Stop'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!isListening && status !== 'processing' && (
            <button
              className="btn-primary"
              onClick={startListening}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🎙️ Start Speaking
            </button>
          )}
          {isListening && (
            <>
              {/* ── Next Item button — only when mic is active ── */}
              {!isPaused && (
                <button
                  onClick={nextItem}
                  title="Press after speaking each item"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 18px', border: 'none', borderRadius: '8px',
                    background: nextFlash ? '#16a34a' : '#0f766e',
                    color: '#fff', fontWeight: '700', cursor: 'pointer', fontSize: '14px',
                    transition: 'background 0.15s ease',
                    boxShadow: nextFlash ? '0 0 0 6px rgba(22,163,74,0.35)' : 'none',
                  }}
                >
                  ➕ Next Item
                </button>
              )}

              {/* ── Pause / Resume mic button ── */}
              {!isPaused ? (
                <button
                  onClick={pauseMic}
                  title="Pause mic to talk to customer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', border: 'none', borderRadius: '8px',
                    background: '#92400e', color: '#fef3c7', fontWeight: '700',
                    cursor: 'pointer', fontSize: '14px',
                    transition: 'background 0.15s ease',
                  }}
                >
                  🔇 Pause
                </button>
              ) : (
                <button
                  onClick={resumeMic}
                  title="Resume mic to continue billing"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', border: 'none', borderRadius: '8px',
                    background: '#d97706', color: '#fff', fontWeight: '800',
                    cursor: 'pointer', fontSize: '14px',
                    animation: 'pulse-amber 1.2s ease-in-out infinite',
                  }}
                >
                  🎙️ Resume
                </button>
              )}

              {/* ── Done button ── */}
              <button
                onClick={stopListening}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', border: 'none', borderRadius: '8px',
                  background: '#dc2626', color: '#fff', fontWeight: '700',
                  cursor: 'pointer', fontSize: '14px',
                  animation: 'pulse-red 1.5s ease-in-out infinite',
                }}
              >
                ⏹ Done
              </button>
            </>
          )}
          {showPanel && (
            <button className="btn-secondary" onClick={resetPanel}>Clear</button>
          )}
        </div>
      </div>

      {/* ── Animation styles ── */}
      <style>{`
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); }
          50%       { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
        }
        @keyframes pulse-amber {
          0%, 100% { box-shadow: 0 0 0 0 rgba(217,119,6,0.6); }
          50%       { box-shadow: 0 0 0 10px rgba(217,119,6,0); }
        }
        @keyframes voice-wave {
          0%, 100% { transform: scaleY(0.4); }
          50%       { transform: scaleY(1.0); }
        }
        @keyframes chip-pop {
          0%   { transform: scale(0.7); opacity: 0; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* ── Live transcript box ── */}
      {(isListening || itemChips.length > 0) && status !== 'processing' && (
        <div style={{
          marginTop: '14px', padding: '14px 16px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
          borderRadius: '10px', minHeight: '60px',
        }}>
          {/* Animated mic wave when listening */}
          {isListening && !isPaused && !isTranscribing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '10px' }}>
              {[0.1, 0.3, 0.5, 0.7, 0.9, 0.7, 0.5, 0.3].map((delay, i) => (
                <div key={i} style={{
                  width: '3px', height: '20px', background: '#6366f1', borderRadius: '2px',
                  animation: `voice-wave 0.8s ease-in-out ${delay}s infinite`,
                }} />
              ))}
              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6366f1', fontWeight: '600' }}>
                RECORDING
              </span>
              {itemChips.length > 0 && (
                <span style={{ marginLeft: '10px', fontSize: '11px', color: '#10b981' }}>
                  {itemChips.length} item{itemChips.length > 1 ? 's' : ''} locked
                </span>
              )}
            </div>
          )}

          {/* Transcribing indicator */}
          {isTranscribing && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
              padding: '6px 12px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)',
            }}>
              <div style={{ width: '12px', height: '12px', border: '2px solid #6366f1', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '11px', color: '#6366f1', fontWeight: '600' }}>TRANSCRIBING...</span>
            </div>
          )}

          {/* Paused indicator */}
          {isListening && isPaused && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
              padding: '6px 12px', borderRadius: '8px',
              background: '#451a03', border: '1px solid #d97706',
            }}>
              <span style={{ fontSize: '16px' }}>🔇</span>
              <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '700' }}>MIC PAUSED</span>
              <span style={{ fontSize: '11px', color: '#d97706' }}>— Talk to customer, then press Resume</span>
              {itemChips.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#10b981' }}>
                  {itemChips.length} item{itemChips.length > 1 ? 's' : ''} saved
                </span>
              )}
            </div>
          )}

          {/* ── Confirmed item chips (one per Next Item press) ── */}
          {itemChips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {itemChips.map((chip, idx) => (
                <div key={chip.id} style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '3px 10px', borderRadius: '20px',
                  background: '#064e3b', border: '1px solid #10b981',
                  fontSize: '12px', color: '#34d399', fontWeight: '600',
                  animation: 'chip-pop 0.25s ease-out',
                }}>
                  <span style={{
                    fontSize: '10px', color: '#6ee7b7',
                    background: '#065f46', borderRadius: '50%',
                    width: '16px', height: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{idx + 1}</span>
                  {chip.label}
                </div>
              ))}

              {/* Current item being spoken (not yet confirmed) */}
              {isListening && !isPaused && !isTranscribing && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '3px 10px', borderRadius: '20px',
                  background: 'var(--bg)', border: '1px dashed #6366f1',
                  fontSize: '12px', color: '#818cf8', fontWeight: '500',
                }}>
                  <span style={{ fontSize: '10px' }}>#{itemChips.length + 1}</span>
                  …listening
                </div>
              )}
            </div>
          )}

          {itemChips.length === 0 && isListening && !isTranscribing && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Speak item 1... then press <strong style={{ color: '#0d9488' }}>➕ Next Item</strong> to transcribe it
            </p>
          )}
        </div>
      )}

      {/* ── Processing spinner ── */}
      {status === 'processing' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '14px', padding: '40px 24px',
          background: 'var(--bg-elevated)', borderRadius: '12px',
          border: '1px solid var(--border-strong)', marginTop: '16px',
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            border: '3px solid rgba(99,102,241,0.25)', borderTop: '3px solid #6366f1',
            animation: 'spin 1s linear infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px',
          }}>🎙️</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '16px' }}>
            Gemini is understanding your list...
          </div>
          <div style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '8px 14px',
            fontSize: '12px', color: 'var(--text-muted)', maxWidth: '320px', textAlign: 'center',
          }}>
            {segmentsRef.current.length} items recorded...
          </div>
        </div>
      )}

      {/* ── Results panel (identical to StylusPad's scan-result-box) ── */}
      {showPanel && editableItems.length > 0 && (
        <div className="scan-result-box" style={{ marginTop: '16px' }}>

          {/* Summary header */}
          <div className="scan-result-header">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontWeight: '600' }}>
                🎙️ {editableItems.length} items heard
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>
                  via Voice + Gemini
                </span>
              </span>
              <span style={{ fontSize: '12px', display: 'flex', gap: '10px' }}>
                <span style={{ color: '#34d399' }}>✓ {highCount} matched</span>
                {mediumCount > 0 && <span style={{ color: '#fbbf24' }}>⚠ {mediumCount} unmatched</span>}
                {lowCount > 0 && <span style={{ color: '#f87171' }}>✗ {lowCount} low</span>}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {lowCount > 0 && (
                <button className="btn-secondary" style={{ fontSize: '12px', padding: '5px 10px' }}
                  onClick={addHighConfidenceOnly}>✓ Add Matched Only</button>
              )}
              <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}
                onClick={addAllItems}>✅ Add All to Bill</button>
            </div>
          </div>

          {/* Column labels */}
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

          {/* Editable rows */}
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

                  {/* Editable row */}
                  <div className="verification-row-grid">
                    {/* Status icon */}
                    <span style={{ color: st.color, fontSize: '14px' }}>{st.icon}</span>

                    {/* Name with live dropdown */}
                    <NameEditor
                      value={item.editName}
                      products={products}
                      onSelect={(p) => handleProductSelect(i, p)}
                    />

                    {/* MRP */}
                    <input
                      type="number" min="0" step="0.01"
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

                    {/* Unit dropdown */}
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
                        {['packet', 'box', 'carton', 'bottle', 'tin', 'bag', 'ladi', 'teen'].map(u =>
                          <option key={u} value={u}>{u}</option>
                        )}
                      </optgroup>
                      <optgroup label="Other">
                        {['M', 'cane'].map(u => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                    </select>

                    {/* Line total */}
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

                  {/* Raw transcript + confidence badge + Verify Button */}
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
            onClick={resetPanel}>✕ Dismiss</button>
        </div>
      )}

      {/* ── No items found ── */}
      {showPanel && editableItems.length === 0 && (
        <div className="scan-result-box" style={{ marginTop: '16px' }}>
          <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
            🎙️ No items could be detected.<br />
            <span style={{ fontSize: '12px' }}>
              Try speaking clearly: "chips 10 vale 2 ladi, parle g 5 ke 10"
            </span>
          </div>
          <button className="btn-secondary" style={{ width: '100%', fontSize: '12px' }}
            onClick={resetPanel}>✕ Dismiss</button>
        </div>
      )}
    </div>
  );
};

export default VoicePad;
