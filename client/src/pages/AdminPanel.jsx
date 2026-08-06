import { useState, useEffect, useRef, useMemo } from 'react';
import Fuse from 'fuse.js';
import { useAuthStore } from '../store/authStore';
import { useProductStore } from '../store/productStore';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';

const AdminPanel = () => {
  const { user, logout } = useAuthStore();
  const { products, fetchProducts, addProduct, updateProduct, deleteProduct, loading, error } = useProductStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(user?.role === 'operator' ? 'abbreviations' : 'products');
  const [operators, setOperators] = useState([]);
  const [apiError, setApiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [pName, setPName]           = useState('');
  const [pUnit, setPUnit]           = useState('kg');
  const [pRetail, setPRetail]       = useState('');
  const [pWholesale, setPWholesale] = useState('');
  const [pPurchase, setPPurchase]   = useState('');
  const [pMrp, setPMrp]             = useState('');
  const [pQuality, setPQuality]     = useState('');
  const [pPacketSize, setPPacketSize] = useState('');
  const [productSearch, setProductSearch] = useState('');
  // Transliterated Hindi term actually used for Fuse matching
  const [productSearchHindi, setProductSearchHindi] = useState('');
  const [productSearchBusy,  setProductSearchBusy]  = useState(false);
  const productSearchDebounce = useRef(null);

  // ── Product name transliteration state ──
  const [pNameSuggestions, setPNameSuggestions] = useState([]);
  const [pNameOpen, setPNameOpen] = useState(false);
  const [pNameBusy, setPNameBusy] = useState(false);
  const pNameDebounce = useRef(null);
  const pNameWrap     = useRef(null);
  const sidebarRef    = useRef(null);

  const [showOperatorForm, setShowOperatorForm] = useState(false);
  const [oName, setOName] = useState('');
  const [oEmail, setOEmail] = useState('');
  const [oPassword, setOPassword] = useState('');

  // ── Abbreviations state ──────────────────────────────────────────────────
  const [abbreviations,       setAbbreviations]       = useState([]);
  const [abbrSearch,          setAbbrSearch]          = useState('');
  const [showAbbrForm,        setShowAbbrForm]        = useState(false);
  const [aAbbr,               setAAbbr]               = useState('');
  const [aFullName,           setAFullName]           = useState('');  // final value stored
  const [aFullNameInput,      setAFullNameInput]      = useState('');  // what user types
  const [aFullNameSuggestions,setAFullNameSuggestions]= useState([]);
  const [aFullNameOpen,       setAFullNameOpen]       = useState(false);
  const [aFullNameBusy,       setAFullNameBusy]       = useState(false);
  const aFullNameDebounce = useRef(null);
  const aFullNameWrap     = useRef(null);

  // Fuse index over products for the fullName search
  const productFuse = useMemo(() => new Fuse(products, {
    keys: ['name'], threshold: 0.45, ignoreLocation: true, minMatchCharLength: 1,
  }), [products]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (aFullNameWrap.current && !aFullNameWrap.current.contains(e.target))
        setAFullNameOpen(false);
      if (pNameWrap.current && !pNameWrap.current.contains(e.target))
        setPNameOpen(false);
      if (sidebarRef.current && !sidebarRef.current.contains(e.target))
        setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Transliterate Roman → Hindi (single best result, used for Abbreviations)
  const transliterateHindi = async (text) => {
    if (!text || /^[\u0900-\u097F\s]+$/.test(text)) return text;
    try {
      const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8`;
      const res = await fetch(url);
      const data = await res.json();
      return data[1]?.[0]?.[1]?.[0] || text;
    } catch { return text; }
  };

  // Fetch top 5 transliterations for Product Name creation
  const fetchTransliterationList = async (text) => {
    if (!text || /^[\u0900-\u097F\s]+$/.test(text)) return [];
    try {
      const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=hi-t-i0-und&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8`;
      const res = await fetch(url);
      const data = await res.json();
      return data[1]?.[0]?.[1] || [];
    } catch { return []; }
  };

  // Handler for the product-list search box: transliterates Roman input to Hindi,
  // then stores the Hindi term in productSearchHindi for Fuse matching.
  const handleProductSearchChange = (val) => {
    setProductSearch(val);
    clearTimeout(productSearchDebounce.current);

    if (!val.trim()) {
      setProductSearchHindi('');
      return;
    }

    // If already Hindi script, use as-is (no API call needed)
    if (/^[\u0900-\u097F\s]+$/.test(val.trim())) {
      setProductSearchHindi(val.trim());
      return;
    }

    // Roman script → transliterate to Hindi then search
    setProductSearchBusy(true);
    productSearchDebounce.current = setTimeout(async () => {
      try {
        const hindi = await transliterateHindi(val.trim());
        setProductSearchHindi(hindi);
      } finally {
        setProductSearchBusy(false);
      }
    }, 300);
  };

  // Live handler for pName input
  const handlePNameInput = (val) => {
    setPName(val);
    setPNameSuggestions([]);
    if (!val.trim() || /^[\u0900-\u097F\s]+$/.test(val)) {
      setPNameOpen(false);
      return;
    }

    clearTimeout(pNameDebounce.current);
    pNameDebounce.current = setTimeout(async () => {
      setPNameBusy(true);
      try {
        const results = await fetchTransliterationList(val.trim());
        setPNameSuggestions(results);
        setPNameOpen(results.length > 0);
      } finally { setPNameBusy(false); }
    }, 280);
  };

  // Live handler for fullName input
  const handleFullNameInput = (val) => {
    setAFullNameInput(val);
    setAFullNameSuggestions([]);
    if (!val.trim()) { setAFullNameOpen(false); return; }

    clearTimeout(aFullNameDebounce.current);
    aFullNameDebounce.current = setTimeout(async () => {
      setAFullNameBusy(true);
      try {
        const hindi = await transliterateHindi(val.trim());
        const results = productFuse.search(hindi).slice(0, 7).map(r => r.item);
        setAFullNameSuggestions(results);
        setAFullNameOpen(results.length > 0);
      } finally { setAFullNameBusy(false); }
    }, 280);
  };

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'operator')) { navigate('/'); }
    else {
      fetchProducts();
      if (user.role === 'admin') {
        fetchOperators();
      }
      fetchAbbreviations();
      if (user.role === 'operator') {
        setActiveTab('abbreviations');
      }
    }
  }, [user, navigate, fetchProducts]);

  const fetchOperators = async () => {
    try {
      const res = await axiosClient.get('/operators');
      setOperators(res.data.data);
      setApiError('');
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setApiError('Failed to load operators: ' + msg);
      console.error(err);
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: pName,
      unit: pUnit,
      priceRetail:    Number(pRetail),
      priceWholesale: Number(pWholesale),
      pricePurchase:  Number(pPurchase) || 0,
      mrp:            pMrp !== '' ? Number(pMrp) : null,
      quality:        pQuality,
      packetSize:     pPacketSize,
    };
    setSaving(true);
    setApiError('');
    try {
      if (editingProduct) { await updateProduct(editingProduct._id, data); }
      else { await addProduct(data); }
      setShowProductForm(false); setEditingProduct(null);
      setPName(''); setPNameSuggestions([]); setPUnit('kg'); setPRetail(''); setPWholesale('');
      setPPurchase(''); setPMrp(''); setPQuality(''); setPPacketSize('');
    } catch(err) {
      const msg = err.response?.data?.message || err.message;
      setApiError('Failed to save product: ' + msg);
    } finally { setSaving(false); }
  };

  const editProduct = (p) => {
    setEditingProduct(p);
    setPName(p.name);         setPUnit(p.unit);
    setPRetail(p.priceRetail); setPWholesale(p.priceWholesale);
    setPPurchase(p.pricePurchase || ''); setPMrp(p.mrp || '');
    setPQuality(p.quality || ''); setPPacketSize(p.packetSize || '');
    setShowProductForm(true);
  };

  const handleOperatorSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setApiError('');
    try {
      await axiosClient.post('/operators', { name: oName, email: oEmail, password: oPassword });
      setShowOperatorForm(false); setOName(''); setOEmail(''); setOPassword('');
      fetchOperators();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      setApiError('Failed to create operator: ' + msg);
    } finally { setSaving(false); }
  };

  const toggleOperator = async (id) => {
    try { await axiosClient.patch(`/operators/${id}/toggle`); fetchOperators(); }
    catch (err) { console.error(err); }
  };

  const deleteOperator = async (id) => {
    if (window.confirm('Delete this operator?')) {
      try { await axiosClient.delete(`/operators/${id}`); fetchOperators(); }
      catch (err) { console.error(err); }
    }
  };

  // ── Abbreviation handlers ────────────────────────────────────────────────
  const fetchAbbreviations = async () => {
    try {
      const res = await axiosClient.get('/abbreviations');
      setAbbreviations(res.data.data);
    } catch (err) { console.error(err); }
  };

  const handleAbbrSubmit = async (e) => {
    e.preventDefault();
    if (!aFullName) {
      setApiError('Please select a product from the suggestion list');
      return;
    }
    setSaving(true); setApiError('');
    try {
      await axiosClient.post('/abbreviations', { abbr: aAbbr, fullName: aFullName });
      setShowAbbrForm(false);
      setAAbbr(''); setAFullName(''); setAFullNameInput(''); setAFullNameSuggestions([]);
      fetchAbbreviations();
    } catch (err) {
      setApiError(err.response?.data?.message || err.message);
    } finally { setSaving(false); }
  };

  const deleteAbbr = async (id) => {
    if (window.confirm('Remove this abbreviation mapping?')) {
      try { await axiosClient.delete(`/abbreviations/${id}`); fetchAbbreviations(); }
      catch (err) { console.error(err); }
    }
  };

  return (
    <div className="admin-layout">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar" ref={sidebarRef}>
        <div className="sidebar-brand">
          <h2>⚡ AutoBilling</h2>
          <p className="sidebar-subtitle">{user?.role === 'admin' ? 'Admin Dashboard' : 'Operator Dashboard'}</p>
        </div>

        {/* Mobile menu toggle */}
        <div className="mobile-menu-trigger">
          <button className="menu-toggle-btn" onClick={() => setMenuOpen(!menuOpen)}>
            {activeTab === 'products' && '📦 Products'}
            {activeTab === 'operators' && '👤 Operators'}
            {activeTab === 'abbreviations' && '🔤 Abbreviations'}
            <span className="caret"> ▾</span>
          </button>
        </div>

        <nav className={menuOpen ? 'open' : ''}>
          {user?.role === 'admin' && (
            <button 
              className={`nav-item ${activeTab === 'products' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('products'); setMenuOpen(false); }}
            >
              <span className="nav-icon">📦</span> Products
            </button>
          )}
          {user?.role === 'admin' && (
            <button 
              className={`nav-item ${activeTab === 'operators' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('operators'); setMenuOpen(false); }}
            >
              <span className="nav-icon">👤</span> Operators
            </button>
          )}
          <button 
            className={`nav-item ${activeTab === 'abbreviations' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('abbreviations'); setMenuOpen(false); }}
          >
            <span className="nav-icon">🔤</span> Abbreviations
          </button>
          
          <div className="mobile-menu-divider"></div>
          
          <button 
            onClick={() => { setMenuOpen(false); navigate('/billing'); }} 
            className="nav-item btn-link"
          >
            <span className="nav-icon">🧾</span> Go to Billing
          </button>
          <button 
            onClick={() => { setMenuOpen(false); logout(); }} 
            className="nav-item btn-link danger"
          >
            <span className="nav-icon">🚪</span> Logout
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button onClick={() => navigate('/billing')} className="btn-secondary" style={{ width: '100%' }}>
            🧾 Go to Billing
          </button>
          <button onClick={logout} className="btn-danger" style={{ width: '100%' }}>
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="admin-content">

        {/* ── Error Banner ── */}
        {(apiError || error) && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
            color: '#ef4444', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span>⚠️ {apiError || error}</span>
            <button onClick={() => setApiError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '18px' }}>✕</button>
          </div>
        )}

        {/* ── Loading Indicator ── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            ⏳ Loading...
          </div>
        )}

        {/* ─── Products Tab ─── */}
        {activeTab === 'products' && (
          <div>
            <div className="content-header">
              <div>
                <h3>Products Database</h3>
                <p>{products.length} products registered</p>
              </div>
              <button className="btn-primary" onClick={() => {
                setEditingProduct(null);
                setPName(''); setPUnit('kg'); setPRetail(''); setPWholesale('');
                setPPurchase(''); setPMrp(''); setPQuality(''); setPPacketSize('');
                setShowProductForm(!showProductForm);
              }}>
                {showProductForm ? '✕ Cancel' : '+ Add Product'}
              </button>
            </div>

            {/* ── Search Box ── */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '12px', top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '15px'
                }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search in English or Hindi... (e.g. besan, haldi, चावल)"
                  value={productSearch}
                  onChange={e => handleProductSearchChange(e.target.value)}
                  style={{
                    width: '100%', padding: '9px 12px 9px 36px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
                {/* Transliterating spinner / result badge */}
                {productSearch && !productSearchBusy && productSearchHindi && productSearchHindi !== productSearch && (
                  <span style={{
                    position: 'absolute', right: productSearch ? '32px' : '10px', top: '50%',
                    transform: 'translateY(-50%)', fontSize: '12px', color: '#818cf8',
                    background: 'rgba(99,102,241,0.15)', padding: '2px 7px',
                    borderRadius: '12px', fontWeight: '600', pointerEvents: 'none',
                  }}>→ {productSearchHindi}</span>
                )}
                {productSearchBusy && (
                  <span style={{
                    position: 'absolute', right: '34px', top: '50%',
                    transform: 'translateY(-50%)', fontSize: '11px', color: '#818cf8',
                  }}>हिं…</span>
                )}
                {productSearch && (
                  <button
                    onClick={() => { setProductSearch(''); setProductSearchHindi(''); }}
                    style={{
                      position: 'absolute', right: '10px', top: '50%',
                      transform: 'translateY(-50%)', background: 'none',
                      border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px'
                    }}
                  >✕</button>
                )}
              </div>
            </div>

            {showProductForm && (
              <div className="admin-form-card">
                <h4>{editingProduct ? '✏️ Edit Product' : '+ New Product'}</h4>
                <form onSubmit={handleProductSubmit}>
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>

                    {/* Row 1 */}
                    <div className="form-field">
                      <label>Product Name (English / Hinglish)</label>
                      <div ref={pNameWrap} style={{ position: 'relative' }}>
                        <input
                          placeholder="e.g. chawal, aata, sarso tel"
                          value={pName}
                          onChange={e => handlePNameInput(e.target.value)}
                          onFocus={() => pNameSuggestions.length > 0 && setPNameOpen(true)}
                          required
                          style={{ width: '100%', boxSizing: 'border-box' }}
                        />
                        {pNameBusy && (
                          <span style={{
                            position: 'absolute', right: '10px', top: '50%',
                            transform: 'translateY(-50%)', fontSize: '11px', color: '#818cf8',
                          }}>⟳</span>
                        )}
                        {/* Transliteration suggestions dropdown */}
                        {pNameOpen && pNameSuggestions.length > 0 && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                            borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            overflow: 'hidden', marginTop: '3px',
                          }}>
                            <div style={{
                              padding: '6px 10px', fontSize: '10px', color: '#818cf8',
                              fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em',
                              borderBottom: '1px solid var(--border)',
                            }}>Select Hindi Name</div>
                            {pNameSuggestions.map((suggestion, i) => (
                              <div
                                key={i}
                                onMouseDown={() => {
                                  setPName(suggestion);
                                  setPNameOpen(false);
                                  setPNameSuggestions([]);
                                }}
                                style={{
                                  padding: '9px 12px', cursor: 'pointer', fontSize: '13px',
                                  borderBottom: i < pNameSuggestions.length - 1 ? '1px solid var(--border)' : 'none',
                                  transition: 'background 0.12s', color: 'var(--text-primary)', fontWeight: '600'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.12)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                {suggestion}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="form-field">
                      <label>Unit</label>
                      <select value={pUnit} onChange={e => setPUnit(e.target.value)}>
                        <optgroup label="Weight">
                          <option value="kg">kg</option>
                          <option value="gm">gm</option>
                          <option value="katta">katta (बोरा)</option>
                        </optgroup>
                        <optgroup label="Volume">
                          <option value="litre">litre</option>
                          <option value="ml">ml</option>
                        </optgroup>
                        <optgroup label="Count">
                          <option value="piece">piece</option>
                          <option value="dozen">dozen</option>
                          <option value="patty">patty (पत्ती)</option>
                          <option value="set">set</option>
                        </optgroup>
                        <optgroup label="Packaging">
                          <option value="packet">packet</option>
                          <option value="box">box</option>
                          <option value="carton">carton</option>
                          <option value="bottle">bottle</option>
                          <option value="tin">tin</option>
                          <option value="bag">bag</option>
                          <option value="ladi">ladi (लड़ी)</option>
                          <option value="teen">teen (टीन)</option>
                        </optgroup>
                        <optgroup label="Other">
                          <option value="M">M</option>
                          <option value="cane">cane</option>
                        </optgroup>
                      </select>
                    </div>
                    <div className="form-field">
                      <label>MRP (₹) <span style={{color:'var(--text-muted)',fontWeight:400,fontSize:'11px'}}>optional</span></label>
                      <input type="number" min="0" step="0.01" placeholder="Leave blank if none" value={pMrp} onChange={e => setPMrp(e.target.value)} />
                    </div>

                    {/* Row 2 */}
                    <div className="form-field">
                      <label>Purchase Price (₹) <span style={{color:'var(--text-muted)',fontWeight:400,fontSize:'11px'}}>Cost price</span></label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={pPurchase} onChange={e => setPPurchase(e.target.value)} />
                    </div>
                    <div className="form-field">
                      <label>Wholesale Price (₹)</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={pWholesale} onChange={e => setPWholesale(e.target.value)} required />
                    </div>
                    <div className="form-field">
                      <label>Retail Price (₹)</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={pRetail} onChange={e => setPRetail(e.target.value)} required />
                    </div>

                    {/* Row 3: Quality & Packet Size */}
                    <div className="form-field">
                      <label>Quality</label>
                      <select value={pQuality} onChange={e => setPQuality(e.target.value)}>
                        <option value="">No Quality Spec</option>
                        <option value="I">I</option>
                        <option value="II">II</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Packet Size</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 500gm, 1kg, 2litre" 
                        value={pPacketSize} 
                        onChange={e => setPPacketSize(e.target.value)} 
                      />
                    </div>
                    <div className="form-field" style={{ visibility: 'hidden' }}>
                      <label>&nbsp;</label>
                      <input type="text" disabled />
                    </div>

                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowProductForm(false)}>Cancel</button>
                    <button type="submit" className="btn-primary" style={{ padding: '10px 24px' }} disabled={saving}>
                      {saving ? 'Saving...' : editingProduct ? '✓ Update Product' : '+ Save Product'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="data-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product Name</th>
                    <th>Unit</th>
                    <th>MRP (₹)</th>
                    <th>Purchase (₹)</th>
                    <th>Wholesale (₹)</th>
                    <th>Retail (₹)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Use Fuse for transliterated search; fall back to plain list when empty
                    let filtered;
                    if (!productSearchHindi.trim()) {
                      filtered = products;  // show all when search is empty
                    } else {
                      filtered = productFuse.search(productSearchHindi).map(r => r.item);
                    }
                    if (filtered.length === 0) return (
                      <tr><td colSpan={8}>
                        <div className="empty-state">
                          <div className="empty-icon">🔍</div>
                          <p>{productSearch
                            ? `No products match "${productSearch}"${productSearchHindi && productSearchHindi !== productSearch ? ` (searched as "${productSearchHindi}")` : ''}`
                            : 'No products yet. Add your first product above.'}</p>
                        </div>
                      </td></tr>
                    );
                    return filtered.map((p, i) => (
                      <tr key={p._id}>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>
                          {p.name}
                          {(p.quality || p.packetSize) && (
                            <span style={{
                              fontSize: '11px', color: 'var(--text-muted)',
                              marginLeft: '6px', fontWeight: 'normal',
                              background: 'var(--bg-elevated)', padding: '2px 6px',
                              borderRadius: '4px', border: '1px solid var(--border)'
                            }}>
                              {[
                                p.quality ? `Qual: ${p.quality}` : null,
                                p.packetSize ? `Pack: ${p.packetSize}` : null
                              ].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </td>
                        <td><span className="result-unit">{p.unit}</span></td>
                        <td>
                          {p.mrp ? <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>₹{p.mrp}</span> : <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>—</span>}
                        </td>
                        <td>
                          {p.pricePurchase ? <span style={{ color: '#fb923c', fontSize: '13px' }}>₹{p.pricePurchase}</span> : <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>—</span>}
                        </td>
                        <td><span className="price-cell price-wholesale">₹{p.priceWholesale}</span></td>
                        <td><span className="price-cell price-retail">₹{p.priceRetail}</span></td>
                        <td>
                          <button className="action-btn" onClick={() => editProduct(p)}>Edit</button>
                          <button className="action-btn delete" onClick={() => { if (window.confirm('Delete product?')) deleteProduct(p._id); }}>Delete</button>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Operators Tab ─── */}
        {activeTab === 'operators' && (
          <div>
            <div className="content-header">
              <div>
                <h3>Operator Accounts</h3>
                <p>{operators.length} operators registered</p>
              </div>
              <button className="btn-primary" onClick={() => setShowOperatorForm(!showOperatorForm)}>
                {showOperatorForm ? '✕ Cancel' : '+ Create Operator'}
              </button>
            </div>

            {showOperatorForm && (
              <div className="admin-form-card">
                <h4>👤 New Operator Account</h4>
                <form onSubmit={handleOperatorSubmit}>
                  <div className="form-grid" style={{ gridTemplateColumns: '2fr 2fr 2fr auto' }}>
                    <div className="form-field">
                      <label>Full Name</label>
                      <input placeholder="e.g. Rahul Kumar" value={oName} onChange={e => setOName(e.target.value)} required />
                    </div>
                    <div className="form-field">
                      <label>Email Address</label>
                      <input type="email" placeholder="operator@shop.com" value={oEmail} onChange={e => setOEmail(e.target.value)} required />
                    </div>
                    <div className="form-field">
                      <label>Temporary Password</label>
                      <input type="password" placeholder="••••••••" value={oPassword} onChange={e => setOPassword(e.target.value)} required />
                    </div>
                    <div className="form-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px' }}>Create</button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            <div className="data-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {operators.length === 0 && (
                    <tr><td colSpan={4}>
                      <div className="empty-state">
                        <div className="empty-icon">👤</div>
                        <p>No operators yet. Create one above.</p>
                      </div>
                    </td></tr>
                  )}
                  {operators.map(o => (
                    <tr key={o._id}>
                      <td style={{ fontWeight: 500 }}>{o.name}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{o.email}</td>
                      <td>
                        <span className={`status-badge ${o.isActive ? 'active' : 'inactive'}`}>
                          {o.isActive ? '● Active' : '● Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className={`action-btn ${o.isActive ? 'delete' : ''}`} onClick={() => toggleOperator(o._id)}>
                          {o.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="action-btn delete" onClick={() => deleteOperator(o._id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Abbreviations Tab ─── */}
        {activeTab === 'abbreviations' && (
          <div>
            <div className="content-header">
              <div>
                <h3>Abbreviation Mappings</h3>
                <p>{abbreviations.length} mappings — expands shorthand during OCR scanning</p>
              </div>
              <button className="btn-primary" onClick={() => {
                setAAbbr(''); setAFullName('');
                setShowAbbrForm(!showAbbrForm);
              }}>
                {showAbbrForm ? '✕ Cancel' : '+ Add Mapping'}
              </button>
            </div>

            <div style={{
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: '10px', padding: '12px 16px', marginBottom: '16px',
              fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7,
            }}>
              <strong style={{ color: '#818cf8' }}>How it works:</strong>{' '}
              When scanning a handwritten list, any written word that matches an abbreviation below
              is automatically expanded before product matching.<br/>
              Example: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px' }}>c.p 5×10</code>
              {' '}→{' '}
              <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '4px' }}>Clinic Plus 5×10</code>
            </div>

            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
              <input
                type="text" placeholder="Search abbreviations..."
                value={abbrSearch} onChange={e => setAbbrSearch(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px 9px 36px',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)', fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
              {abbrSearch && (
                <button onClick={() => setAbbrSearch('')} style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px',
                }}>✕</button>
              )}
            </div>

            {showAbbrForm && (
              <div className="admin-form-card">
                <h4>+ New Abbreviation Mapping</h4>
                <form onSubmit={handleAbbrSubmit}>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 2fr auto' }}>

                    {/* Abbreviation field — can be Hindi or English, stored as-is */}
                    <div className="form-field">
                      <label>
                        Abbreviation
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11px', marginLeft: '6px' }}>
                          Hindi or English
                        </span>
                      </label>
                      <input
                        value={aAbbr}
                        onChange={e => setAAbbr(e.target.value)}
                        placeholder="e.g. c.p  or  स.त"
                        required
                        style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                      />
                    </div>

                    {/* Full Name field — live transliterate + product search dropdown */}
                    <div className="form-field">
                      <label>
                        Full Product Name (Hindi in DB)
                        <span style={{ color: '#818cf8', fontWeight: 400, fontSize: '11px', marginLeft: '6px' }}>
                          type English → converts to Hindi
                        </span>
                      </label>
                      <div ref={aFullNameWrap} style={{ position: 'relative' }}>
                        <input
                          value={aFullNameInput}
                          onChange={e => handleFullNameInput(e.target.value)}
                          onFocus={() => aFullNameSuggestions.length > 0 && setAFullNameOpen(true)}
                          placeholder="Type product name... e.g. clinic plus, chana"
                          required={!aFullName}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            borderColor: aFullName ? '#10b981' : undefined,
                          }}
                        />
                        {/* Busy spinner */}
                        {aFullNameBusy && (
                          <span style={{
                            position: 'absolute', right: '10px', top: '50%',
                            transform: 'translateY(-50%)', fontSize: '11px', color: '#818cf8',
                          }}>⟳</span>
                        )}
                        {/* Selected indicator */}
                        {aFullName && !aFullNameBusy && (
                          <span style={{
                            position: 'absolute', right: '10px', top: '50%',
                            transform: 'translateY(-50%)', fontSize: '13px', color: '#10b981',
                          }}>✓</span>
                        )}
                        {/* Dropdown suggestions */}
                        {aFullNameOpen && aFullNameSuggestions.length > 0 && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                            borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            overflow: 'hidden', marginTop: '3px',
                          }}>
                            <div style={{
                              padding: '6px 10px', fontSize: '10px', color: '#818cf8',
                              fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em',
                              borderBottom: '1px solid var(--border)',
                            }}>Select product from database</div>
                            {aFullNameSuggestions.map((p, i) => (
                              <div
                                key={p._id || i}
                                onMouseDown={() => {
                                  setAFullName(p.name);
                                  setAFullNameInput(p.name);
                                  setAFullNameOpen(false);
                                  setAFullNameSuggestions([]);
                                }}
                                style={{
                                  padding: '9px 12px', cursor: 'pointer', fontSize: '13px',
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  borderBottom: i < aFullNameSuggestions.length - 1 ? '1px solid var(--border)' : 'none',
                                  transition: 'background 0.12s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.12)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{p.name}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {p.unit}{p.mrp != null ? ` · MRP ₹${p.mrp}` : ''} · ₹{p.priceRetail}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Show selected product name */}
                      {aFullName && (
                        <div style={{ marginTop: '5px', fontSize: '12px', color: '#10b981', display: 'flex', justifyContent: 'space-between' }}>
                          <span>✓ Selected: <strong>{aFullName}</strong></span>
                          <button
                            type="button"
                            onClick={() => { setAFullName(''); setAFullNameInput(''); }}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                          >✕ Clear</button>
                        </div>
                      )}
                    </div>

                    <div className="form-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px' }} disabled={saving || !aFullName}>
                        {saving ? 'Saving...' : '+ Add'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            <div className="data-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Abbreviation (written)</th>
                    <th style={{ textAlign: 'center' }}>→</th>
                    <th>Full Product Name (in DB)</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = abbreviations.filter(a =>
                      a.abbr.includes(abbrSearch.toLowerCase()) ||
                      a.fullName.toLowerCase().includes(abbrSearch.toLowerCase())
                    );
                    if (filtered.length === 0) return (
                      <tr><td colSpan={6}>
                        <div className="empty-state">
                          <div className="empty-icon">🔤</div>
                          <p>{abbrSearch ? `No mappings match "${abbrSearch}"` : 'No abbreviations yet. Add your first mapping above.'}</p>
                        </div>
                      </td></tr>
                    );
                    return filtered.map((a, idx) => (
                      <tr key={a._id}>
                        <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{idx + 1}</td>
                        <td>
                          <code style={{
                            background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                            padding: '2px 8px', borderRadius: '5px',
                            fontSize: '14px', fontWeight: '700', letterSpacing: '0.05em',
                          }}>{a.abbr}</code>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '18px' }}>→</td>
                        <td style={{ fontWeight: '600' }}>{a.fullName}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                          {new Date(a.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td>
                          <button className="action-btn delete" onClick={() => deleteAbbr(a._id)}>Delete</button>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;
