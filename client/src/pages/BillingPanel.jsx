import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useProductStore } from '../store/productStore';
import StylusPad from '../components/StylusPad/StylusPad';
import VoicePad from '../components/VoicePad/VoicePad';
import BillTable from '../components/BillTable/BillTable';
import PrintBill from '../components/PrintBill/PrintBill';
import RecentBillsModal from '../components/RecentBills/RecentBillsModal';

const BillingPanel = () => {
  const { user, logout } = useAuthStore();
  const { fetchProducts } = useProductStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [recentModalOpen, setRecentModalOpen] = useState(false);
  const headerRef = useRef(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
    } else {
      // Load products for fuzzy search when panel opens
      fetchProducts();
    }
  }, [user, navigate, fetchProducts]);

  useEffect(() => {
    const handler = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <>
      {/* Hide the main UI when printing, PrintBill takes over */}
      <div className="billing-layout">
        <header className="billing-header" ref={headerRef}>
          <div className="brand">
            <h2>AutoBilling Store</h2>
            <span className="operator-badge">Operator: {user?.name}</span>
          </div>

          {/* Mobile menu trigger */}
          <div className="mobile-menu-trigger">
            <button className="menu-toggle-btn" onClick={() => setMenuOpen(!menuOpen)}>
              Menu <span className="caret">▾</span>
            </button>
          </div>

          <div className={`header-actions ${menuOpen ? 'open' : ''}`}>
            <span className="mobile-operator-badge">👤 Operator: {user?.name}</span>
            <div className="mobile-menu-divider"></div>
            <button 
              onClick={() => { setMenuOpen(false); setRecentModalOpen(true); }}
              className="btn-secondary"
            >
              🔍 Recent Bills
            </button>
            {(user?.role === 'admin' || user?.role === 'operator') && (
              <button 
                onClick={() => { setMenuOpen(false); navigate('/admin'); }} 
                className="btn-secondary"
              >
                {user?.role === 'admin' ? '⚙️ Admin Panel' : '🔤 Abbr Mappings'}
              </button>
            )}
            <button 
              onClick={() => { setMenuOpen(false); logout(); }} 
              className="btn-danger"
            >
              🚪 Logout
            </button>
          </div>
        </header>

        <main className="billing-content">
          <div className="left-pane">
            <StylusPad />
            {/* <VoicePad /> */}
          </div>
          <div className="right-pane">
            <BillTable />
          </div>
        </main>
      </div>

      <RecentBillsModal isOpen={recentModalOpen} onClose={() => setRecentModalOpen(false)} />

      {/* Hidden by default, visible only in @media print */}
      <PrintBill />
    </>
  );
};

export default BillingPanel;
