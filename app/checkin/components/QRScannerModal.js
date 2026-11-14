'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, X, Camera, AlertCircle, Wifi } from 'lucide-react';
import liff from '@line/liff';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess, onNfcSuccess }) {
  const [scanning, setScanning] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [manualCode, setManualCode] = useState('');

  const handleSuccess = (code) => {
    const clean = (code || '').trim();
    if (!clean) return;

    // Check if scanned QR or URL contains nfc_token
    if (clean.includes('nfc_token=')) {
      try {
        const url = new URL(clean.startsWith('http') ? clean : `https://inthehaus.local/?${clean}`);
        const nfcToken = url.searchParams.get('nfc_token');
        const nfcStation = url.searchParams.get('nfc_station') || 'BAR_PUNCH';
        if (nfcToken && onNfcSuccess) {
          onNfcSuccess({ nfcToken, nfcStation });
          onClose();
          return;
        }
      } catch (e) {}
    }

    if (clean.toUpperCase().startsWith('NFC_') && onNfcSuccess) {
      onNfcSuccess({ nfcToken: clean.toUpperCase(), nfcStation: 'SHOP_NFC' });
      onClose();
      return;
    }

    onScanSuccess(clean);
    onClose();
  };

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
      } else {
        setErrorMsg('คุณสามารถแตะแผ่น NFC ที่เคาน์เตอร์ หรือกรอกรหัส Token จากหน้าจอ POS ด้านล่าง');
      }
    } catch (err) {
      console.warn("LIFF Scan Code error/unsupported:", err);
      setErrorMsg("สามารถกรอกรหัส Token จากหน้าจอแท็บเล็ต หรือแตะแผ่น NFC แทนได้ทันที");
    }
    setScanning(false);
  };

  const startWebNfcScan = async () => {
    setErrorMsg('');
    if (typeof window === 'undefined' || !('NDEFReader' in window)) {
      setErrorMsg('เบราว์เซอร์นี้ไม่รองรับการสแกน NFC ในหน้าเว็บโดยตรง แนะนำให้นำโทรศัพท์แตะแผ่น NFC จากหน้าจอหลักของเครื่องเพื่อเปิดลิงก์อัตโนมัติ');
      return;
    }

    try {
      setNfcScanning(true);
      const ndef = new window.NDEFReader();
      await ndef.scan();
      ndef.onreading = (event) => {
        const decoder = new TextDecoder();
        for (const record of event.message.records) {
          const text = decoder.decode(record.data);
          if (text) {
            setNfcScanning(false);
            handleSuccess(text);
            return;
          }
        }
      };
    } catch (err) {
      setNfcScanning(false);
      setErrorMsg('ไม่สามารถเปิดตัวอ่าน NFC ได้: ' + (err.message || 'กรุณาเปิด NFC ในเครื่อง'));
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setErrorMsg('');
      setManualCode('');
      setNfcScanning(false);
    }
  }, [isOpen]);

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
        className="fixed inset-0 bg-rams-ink/60 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          className="bg-rams-panel border-2 border-rams-rule w-full max-w-sm rounded-sm p-6 shadow-[0_4px_0_0_var(--color-rams-rule)] text-rams-ink space-y-5 relative"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 bg-rams-bg border border-rams-rule-light hover:border-rams-rule rounded-sm flex items-center justify-center text-rams-ink-muted hover:text-rams-ink transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="text-center space-y-1.5 pt-1">
            <div className="w-12 h-12 bg-rams-orange text-rams-panel rounded-sm flex items-center justify-center mx-auto border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)]">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="text-base font-mono font-bold text-rams-ink uppercase tracking-wide pt-1">
              ยืนยันพิกัดร้าน (NFC / QR)
            </h3>
            <p className="text-xs text-rams-ink-muted leading-relaxed">
              ใช้ในกรณีสัญญาณ GPS ในอาคารคลาดเคลื่อน แตะแผ่น NFC ที่บาร์หรือสแกน QR จากจอ POS
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={tryLiffScan}
              className="w-full bg-rams-orange hover:bg-rams-orange-active text-rams-panel font-mono font-bold py-3 rounded-sm border border-rams-rule flex items-center justify-center gap-2 text-xs shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] active:shadow-none transition cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>{scanning ? 'กำลังเปิดกล้อง...' : 'สแกน QR ผ่านกล้อง LINE'}</span>
            </button>

            <button
              type="button"
              onClick={startWebNfcScan}
              className="w-full bg-rams-bg hover:bg-rams-panel text-rams-ink font-mono font-bold py-2.5 rounded-sm border border-rams-rule flex items-center justify-center gap-2 text-xs active:translate-y-[1px] transition cursor-pointer"
            >
              <Wifi className="w-4 h-4 rotate-90 text-rams-orange" />
              <span>{nfcScanning ? 'นำหลังเครื่องแตะแผ่น NFC...' : 'แตะอ่านแผ่น NFC (Android Web NFC)'}</span>
            </button>

            <div className="relative flex py-1.5 items-center">
              <div className="flex-grow border-t border-rams-rule-light"></div>
              <span className="flex-shrink mx-3 text-[10px] font-mono text-rams-ink-muted font-bold uppercase">
                หรือกรอกรหัส Token บนจอร้าน
              </span>
              <div className="flex-grow border-t border-rams-rule-light"></div>
            </div>

            {/* Manual Token Form */}
            <form onSubmit={handleManualSubmit} className="space-y-2">
              <input
                type="text"
                placeholder="เช่น ITH_XXXX หรือ NFC_BAR_..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full bg-rams-bg border border-rams-rule-light focus:border-rams-rule rounded-sm px-4 py-2.5 text-xs text-center font-mono font-bold text-rams-ink placeholder-rams-ink-muted/60 uppercase outline-none transition"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="w-full bg-rams-ink hover:bg-neutral-800 disabled:opacity-40 text-rams-panel font-mono font-bold py-2.5 rounded-sm border border-rams-rule text-xs transition cursor-pointer"
              >
                ยืนยันรหัสพิกัดร้าน
              </button>
            </form>
          </div>

          {errorMsg && (
            <div className="text-[11px] font-mono text-rams-ink bg-rams-amber/15 border border-rams-amber p-2.5 rounded-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rams-orange mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
