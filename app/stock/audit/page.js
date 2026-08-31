'use client';

import React, { useState, useEffect } from 'react';
import { Package, Save, RefreshCw, CheckCircle, AlertCircle, Search, Sparkles } from 'lucide-react';
import liff from '@line/liff';

export default function StockAuditPage() {
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

  const fetchItems = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch('/api/stock/items');
      const json = await res.json();
      if (json.success) {
        const list = json.data || json.items || [];
        setItems(list);
      } else {
        setErrorMsg(json.error || "Failed to load inventory items.");
      }
    } catch {
      setErrorMsg("Failed to connect to stock inventory service.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const prof = await liff.getProfile();
          setProfile(prof);
        } else {
          // Dev Fallback
          setProfile({ displayName: 'Staff (Dev Mode)' });
        }
        fetchItems();
      } catch (err) {
        console.error('LIFF Init error', err);
        setProfile({ displayName: 'Staff' });
        fetchItems();
      }
    };
    initLiff();
  }, [LIFF_ID]);

  const handleInputChange = (id, value) => {
    setCounts(prev => ({ ...prev, [id]: value }));
  };

  const filteredItems = items.filter(i => {
    if (i.is_active === false) return false;
    if (!searchQuery.trim()) return true;
    return i.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           i.category?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const diffCount = Object.keys(counts).filter(id => {
    const item = items.find(i => String(i.id) === String(id));
    if (!item) return false;
    const val = counts[id];
    return val !== '' && val !== undefined && Number(val) !== Number(item.current_quantity);
  }).length;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg("");
    
    // Prepare payload
    const payloadCounts = items.map(item => ({
      id: item.id,
      name: item.name,
      expected: item.current_quantity,
      actual: counts[item.id] !== undefined && counts[item.id] !== '' ? Number(counts[item.id]) : item.current_quantity
    }));

    try {
      const res = await fetch('/api/stock/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: profile?.displayName || 'Staff',
          counts: payloadCounts
        })
      });
      
      const json = await res.json();
      if (json.success) {
        setSuccess(true);
        if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
           setTimeout(() => liff.closeWindow(), 3000);
        }
      } else {
        setErrorMsg(json.error || "Failed to submit audit.");
      }
    } catch {
      setErrorMsg("Network error submitting audit. Please check your connection.");
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="relative mb-6">
          <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
            <CheckCircle className="w-12 h-12 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
          </div>
          <Sparkles className="w-6 h-6 text-amber-400 absolute -top-1 -right-1 animate-bounce" />
        </div>
        <h1 className="text-2xl font-black mb-2 text-center text-white">อัปเดตสต็อกเรียบร้อย!</h1>
        <p className="text-neutral-400 text-xs text-center max-w-sm mb-8 leading-relaxed">
          ขอบคุณทีมงานที่ดำเนินการนับและตรวจสอบสต็อกระบบครับ<br/>
          รายงานสรุปผลต่างถูกส่งเข้ากลุ่ม LINE เรียบร้อยแล้ว
        </p>
        <button 
          onClick={() => {
            if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient()) {
              liff.closeWindow();
            } else {
              setSuccess(false);
              fetchItems();
            }
          }} 
          className="w-full max-w-xs bg-neutral-900 border border-neutral-800 py-3.5 rounded-2xl font-bold text-sm text-neutral-300 hover:bg-neutral-800 transition shadow-lg"
        >
          {typeof liff !== 'undefined' && liff.isInClient && liff.isInClient() ? 'ปิดหน้าต่าง' : 'นับสต็อกรอบใหม่'}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans pb-32">
      {/* Header */}
      <div className="sticky top-0 bg-neutral-950/85 backdrop-blur-md border-b border-neutral-800/60 p-4 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-pink-500 to-orange-400 rounded-xl shadow-lg shadow-pink-500/20">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-base leading-tight tracking-tight">Stock Audit & Count</h1>
            <p className="text-[11px] text-neutral-400 font-medium">{profile?.displayName || 'Loading...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {diffCount > 0 && (
            <span className="text-[10px] font-black bg-pink-500/20 text-pink-400 border border-pink-500/30 px-2.5 py-1 rounded-full">
              แก้ {diffCount} รายการ
            </span>
          )}
          <button 
            onClick={fetchItems} 
            disabled={loading} 
            className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 transition active:scale-95 text-neutral-300"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อวัตถุดิบ / สินค้า..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-900/90 border border-neutral-800 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 rounded-2xl pl-10 pr-4 py-3 text-xs text-white placeholder-neutral-500 outline-none transition-all shadow-inner"
          />
        </div>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex gap-3 text-red-400 items-start">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-pink-500" />
            <p className="text-neutral-400 text-xs font-medium">กำลังโหลดรายการวัตถุดิบและสต็อกล่าสุด...</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex justify-between items-center px-1">
              <p className="text-[11px] text-neutral-400 font-medium">
                พบทั้งหมด {filteredItems.length} รายการ (กรอกเฉพาะยอดที่ต่างจากระบบ)
              </p>
            </div>

            {filteredItems.map(item => {
              const currentCount = counts[item.id];
              const hasChanged = currentCount !== undefined && currentCount !== '' && Number(currentCount) !== Number(item.current_quantity);

              return (
                <div 
                  key={item.id} 
                  className={`bg-neutral-900/60 backdrop-blur-sm border rounded-2xl p-3.5 flex items-center justify-between gap-3 transition-all ${
                    hasChanged ? 'border-pink-500/40 bg-pink-500/5 shadow-md shadow-pink-500/5' : 'border-neutral-800/70 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white truncate">{item.name}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1">
                      <span className="bg-neutral-800 px-2 py-0.5 rounded-md font-mono text-neutral-300">
                        ในระบบ: {item.current_quantity}
                      </span>
                      <span>หน่วย: {item.unit || 'หน่วย'}</span>
                    </div>
                  </div>

                  <div className="w-24 shrink-0 relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder={item.current_quantity.toString()}
                      value={counts[item.id] !== undefined ? counts[item.id] : ''}
                      onChange={(e) => handleInputChange(item.id, e.target.value)}
                      className={`w-full bg-neutral-950 border rounded-xl px-3 py-2 text-center font-bold text-sm text-white placeholder-neutral-600 outline-none transition-all ${
                        hasChanged ? 'border-pink-500 text-pink-400 ring-1 ring-pink-500/30' : 'border-neutral-700 focus:border-pink-500'
                      }`}
                    />
                  </div>
                </div>
              );
            })}

            {filteredItems.length === 0 && !loading && (
              <div className="text-center py-16 bg-neutral-900/30 rounded-2xl border border-neutral-800/50">
                <Package className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                <p className="text-xs text-neutral-400">ไม่พบรายการสินค้าที่ค้นหา</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-neutral-950 via-neutral-950/90 to-transparent z-50 pointer-events-none">
        <div className="max-w-2xl mx-auto">
          <button 
            onClick={handleSubmit}
            disabled={loading || submitting || items.length === 0}
            className="pointer-events-auto w-full bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 text-white font-extrabold py-4 rounded-2xl shadow-[0_0_30px_rgba(236,72,153,0.35)] flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            <span className="text-sm tracking-wide">
              {submitting ? 'กำลังบันทึกยอด...' : diffCount > 0 ? `ยืนยันการนับสต็อก (ปรับปรุง ${diffCount} รายการ)` : 'ยืนยันการนับสต็อก (ยอดตรง 100%)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
