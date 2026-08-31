'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, X, Camera, RefreshCw, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import liff from '@line/liff';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [scannedCode, setScannedCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setManualCode('');
      tryLiffScan();
    }
  }, [isOpen]);

  const tryLiffScan = async () => {
    setScanning(true);
    setErrorMsg('');
    try {
      if (typeof liff !== 'undefined' && liff.isInClient && liff.isInClient() && liff.scanCodeV2) {
        const result = await liff.scanCodeV2();
        if (result && result.value) {
          handleSuccess(result.value);
          return;
        }
      }
    } catch (err) {
      console.warn("LIFF Scan Code error/unsupported:", err);
      // If LIFF native scan is not enabled, let user enter token or use camera fallback
      setErrorMsg("ระบบสแกนอัตโนมัติใน LINE ต้องการการกรอกรหัส หรือสแกนผ่านกล้อง");
    }
    setScanning(false);
  };

  const handleSuccess = (code) => {
    const clean = (code || '').trim();
    if (!clean) return;
    onScanSuccess(clean);
    onClose();
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccess(manualCode);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-slate-900 border border-indigo-900/40 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-slate-100 space-y-5 relative"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-slate-800 p-2 rounded-full text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="text-center space-y-1.5 pt-2">
            <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/30">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-white">สแกน Dynamic QR หน้าร้าน</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              สแกน QR Code ที่หน้าจอแท็บเล็ต/POS เพื่อยืนยันการอยู่ที่ร้าน
            </p>
          </div>

          {/* Quick Rescan Button */}
          <div className="space-y-3">
            <button
              onClick={tryLiffScan}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-indigo-600/30 transition active:scale-[0.99]"
            >
              <Camera className="w-4 h-4" />
              <span>เปิดกล้องสแกน QR ผ่าน LINE</span>
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] text-slate-500 font-bold uppercase">หรือระบุรหัส Token</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* Manual Token Form */}
            <form onSubmit={handleManualSubmit} className="space-y-2">
              <input
                type="text"
                placeholder="เช่น ITH_XXXX..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-center font-mono font-bold text-white placeholder-slate-600 uppercase outline-none transition"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold py-2.5 rounded-xl text-xs transition active:scale-[0.99]"
              >
                ยืนยันรหัส
              </button>
            </form>
          </div>

          {errorMsg && (
            <div className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
