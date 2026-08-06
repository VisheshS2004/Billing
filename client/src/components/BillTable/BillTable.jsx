import { useBillStore } from '../../store/billStore';
import { useProductStore } from '../../store/productStore';
import { Trash2 } from 'lucide-react';
import axiosClient from '../../api/axiosClient';

const BillTable = () => {
  const { 
    billId, customerName, setCustomerName, 
    priceType, setPriceType, 
    items, updateQty, removeItem, 
    subtotal, grandTotal, hasPricelessItem, clearBill, loadBill,
    updateItemQuality, updateItemPacketSize
  } = useBillStore();

  const { products } = useProductStore();

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

  const handlePrint = async () => {
    try {
      const payload = {
        customerName: customerName || 'Cash',
        priceType,
        items,
        subtotal,
        grandTotal,
        hasPricelessItem
      };

      let response;
      if (billId) {
        response = await axiosClient.put(`/bills/${billId}`, payload);
      } else {
        response = await axiosClient.post('/bills', payload);
      }

      if (response.data.success) {
        loadBill(response.data.data);
      }
    } catch (error) {
      console.error('Failed to save bill:', error);
    }
    window.print();
  };

  return (
    <div className="bill-table-container">
      <div className="bill-header-inputs">
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginBottom: '2px',
          fontWeight: '500'
        }}>
          <span>
            📄 Current Bill {billId ? <span style={{ color: '#10b981', fontWeight: 'bold' }}>(Editing Saved Bill)</span> : ''}
          </span>
          <span>{new Date().toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
          })}</span>
        </div>
        <input 
          type="text" 
          placeholder="Customer Name (Optional)" 
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="customer-input"
        />
        <div className="price-toggle">
          <button 
            className={priceType === 'retail' ? 'active retail' : ''}
            onClick={() => setPriceType('retail')}
          >
            101
          </button>
          <button 
            className={priceType === 'wholesale' ? 'active wholesale' : ''}
            onClick={() => setPriceType('wholesale')}
          >
            102
          </button>
        </div>
      </div>

      <div className="table-scroll-area">
        <table className="live-bill">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Rate (₹)</th>
              <th>Total (₹)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const rate = priceType === 'retail' ? item.priceRetail : item.priceWholesale;
              const hasNoPrice = rate == null;
              return (
                <tr key={item._id} style={hasNoPrice ? { background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b' } : {}}>
                  <td>{idx + 1}</td>
                  <td>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      {item.name}
                      {hasNoPrice && <span style={{ fontSize: '10px', color: '#f59e0b', marginLeft: '6px' }}>⚠ No Price</span>}
                      {!hasNoPrice && <span className="unit-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}> ({item.unit})</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                      {getQualityOptions(item.name).length > 0 && (
                        <select
                          value={item.quality || ''}
                          onChange={e => updateItemQuality(item._id, e.target.value)}
                          style={{
                            padding: '1px 4px', fontSize: '10px',
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                            borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          <option value="">No Quality</option>
                          {getQualityOptions(item.name).map(q => (
                            <option key={q} value={q}>Qual: {q}</option>
                          ))}
                        </select>
                      )}
                      {getPacketSizeOptions(item.name).length > 0 && (
                        <select
                          value={item.packetSize || ''}
                          onChange={e => updateItemPacketSize(item._id, e.target.value)}
                          style={{
                            padding: '1px 4px', fontSize: '10px',
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
                            borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          <option value="">No Pack</option>
                          {getPacketSizeOptions(item.name).map(sz => (
                            <option key={sz} value={sz}>Pack: {sz}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                  <td>
                    <input 
                      type="number" 
                      min="1" 
                      value={item.qty} 
                      onChange={(e) => updateQty(item._id, Number(e.target.value))}
                      className="qty-input"
                    />
                  </td>
                  <td>{hasNoPrice ? <span style={{color:'#f59e0b'}}>—</span> : `₹${rate}`}</td>
                  <td>{hasNoPrice ? <span style={{color:'#f59e0b'}}>—</span> : `₹${rate * item.qty}`}</td>
                  <td>
                    <button onClick={() => removeItem(item._id)} className="icon-btn text-danger">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bill-summary">
        {hasPricelessItem ? (
          <div className="priceless-warning">
            ⚠ Some items have no price. Total cannot be calculated.
            <br />
            <span style={{ fontSize: '11px', opacity: 0.7 }}>Set prices in Admin Panel or remove the item.</span>
          </div>
        ) : (
          <>
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>₹ {subtotal}</span>
            </div>
            <div className="summary-row grand-total">
              <span>Grand Total:</span>
              <span>₹ {grandTotal}</span>
            </div>
          </>
        )}
      </div>

      <div className="bill-actions">
        <button className="btn-danger" onClick={() => {
          if(window.confirm('Clear entire bill?')) clearBill();
        }}>New Bill</button>
        <button className="btn-primary" onClick={handlePrint} disabled={items.length === 0}>
          Save & Print Bill
        </button>
      </div>
    </div>
  );
};

export default BillTable;
