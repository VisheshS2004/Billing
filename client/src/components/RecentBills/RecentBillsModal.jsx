import { useState, useEffect } from 'react';
import { useBillStore } from '../../store/billStore';
import axiosClient from '../../api/axiosClient';

const RecentBillsModal = ({ isOpen, onClose }) => {
  const [bills, setBills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const { loadBill } = useBillStore();

  useEffect(() => {
    if (isOpen) {
      fetchBills();
    }
  }, [isOpen, searchTerm]);

  const fetchBills = async () => {
    setLoading(true);
    try {
      const url = searchTerm 
        ? `/bills?search=${encodeURIComponent(searchTerm)}`
        : '/bills';
      const { data } = await axiosClient.get(url);
      if (data.success) {
        setBills(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (bill) => {
    loadBill(bill, true);
    onClose();
  };

  const handlePrint = (bill) => {
    loadBill(bill, false);
    onClose();
    setTimeout(() => {
      window.print();
    }, 150);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: '16px',
      backdropFilter: 'blur(5px)'
    }}>
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
        borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '80dvh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>
            Recent Bills (24 Hours)
          </h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: '18px', cursor: 'pointer', padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div style={{ padding: '12px' }}>
          <input
            type="text"
            placeholder="Search by customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border-strong)', background: 'var(--bg)',
              color: 'var(--text-primary)', fontSize: '14px', outline: 'none'
            }}
          />
        </div>

        {/* Bills List */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px',
          display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
              Loading bills...
            </div>
          ) : bills.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
              No bills found in the last 24 hours.
            </div>
          ) : (
            bills.map((bill) => {
              const dateStr = new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true
              });
              const dateDay = new Date(bill.createdAt).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short'
              });

              return (
                <div 
                  key={bill._id}
                  style={{
                    border: '1px solid var(--border)', borderRadius: '8px',
                    padding: '12px', background: 'rgba(255,255,255,0.02)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1, marginRight: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '600', fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {bill.customerName || 'Cash'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {dateDay}, {dateStr}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      By: {bill.operatorName} · {bill.items.length} items
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--accent)' }}>
                      ₹{bill.grandTotal != null ? bill.grandTotal : 'Pending'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleEdit(bill)}
                      style={{
                        padding: '6px 12px', background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-strong)', borderRadius: '6px',
                        color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handlePrint(bill)}
                      style={{
                        padding: '6px 12px', background: 'var(--accent)',
                        border: 'none', borderRadius: '6px',
                        color: 'white', fontSize: '12px', cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Print
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default RecentBillsModal;
