'use client';
/* Brand v2 · NFC / QR location fallback. Text only. Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        transition={{ duration: 0.16 }}
        className="brand-v2 !bg-charcoal/50 fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="bg-cream text-charcoal border border-charcoal w-full max-w-sm"
        >
          <div className="bg-plum text-cream flex items-stretch">
            <div className="flex-1 px-4 py-3">
              <h3 id="qr-modal-title" className="font-head text-2xl">ยืนยันพิกัดร้าน</h3>
              <p className="font-num text-xs tracking-[0.12em] text-on-plum-2">NFC · QR</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-w-16 px-4 border-l border-plum-3 text-base font-semibold hover:bg-plum-2 transition-colors duration-150"
            >
              ปิด
            </button>
          </div>

          <div className="p-4 flex flex-col gap-3">
            <p className="text-base text-subtle">
              ใช้เมื่อ GPS ในร้านคลาดเคลื่อน แตะแผ่น NFC ที่บาร์ หรือสแกน QR จากจอ POS
            </p>

            <button
              type="button"
              onClick={tryLiffScan}
              className="w-full min-h-14 bg-charcoal hover:bg-charcoal-2 text-cream text-lg font-semibold transition-colors duration-150"
            >
              {scanning ? 'กำลังเปิดกล้อง…' : 'สแกน QR ด้วยกล้อง LINE'}
            </button>

            <button
              type="button"
              onClick={startWebNfcScan}
              className="w-full min-h-12 bg-plum hover:bg-plum-2 text-cream text-base font-semibold transition-colors duration-150"
            >
              {nfcScanning ? 'นำหลังเครื่องแตะแผ่น NFC…' : 'แตะอ่านแผ่น NFC (Android)'}
            </button>

            <form onSubmit={handleManualSubmit} className="border-t border-rule pt-3 flex flex-col gap-2">
              <label htmlFor="qr-manual-token" className="text-sm font-semibold text-neutral">
                หรือกรอกรหัส Token จากจอร้าน
              </label>
              <input
                id="qr-manual-token"
                type="text"
                placeholder="ITH_XXXX หรือ NFC_BAR_..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoCapitalize="characters"
                className="w-full min-h-12 bg-cream border border-charcoal px-4 text-base text-center font-num text-charcoal placeholder:text-neutral uppercase outline-none focus-visible:border-plum"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="w-full min-h-12 bg-cream hover:bg-paper-2 border border-charcoal disabled:border-rule disabled:text-neutral text-charcoal text-base font-semibold transition-colors duration-150"
              >
                ยืนยันรหัส
              </button>
            </form>

            {errorMsg && (
              <p role="status" className="border border-plum bg-paper-2 px-4 py-3 text-base text-charcoal">
                {errorMsg}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
