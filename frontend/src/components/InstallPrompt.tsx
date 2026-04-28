import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      // Show again after 3 days
      if (Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after a short delay so user can see the app first
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS Safari (no beforeinstallprompt support)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isInStandaloneMode) {
      setTimeout(() => setShowPrompt(true), 2000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowPrompt(false);
      setIsClosing(false);
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    }, 300);
  };

  if (isInstalled || !showPrompt) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${isClosing ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 -top-screen bg-black/20 backdrop-blur-sm" onClick={handleDismiss} />

      {/* Popup */}
      <div className="relative bg-white rounded-t-3xl shadow-2xl p-6 mx-auto max-w-lg">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />

        {/* App icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-2xl shadow-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #075e54, #25d366)' }}>
            <svg viewBox="0 0 24 24" className="w-9 h-9" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.16-1.34A9.86 9.86 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.67 0-3.24-.51-4.55-1.38l-.32-.19-3.31.87.88-3.22-.21-.33A7.93 7.93 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
            </svg>
          </div>
        </div>

        {/* Title and description */}
        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Install SmartComm</h3>
        <p className="text-sm text-gray-500 text-center mb-5">
          Get the full experience! Install SmartComm on your home screen for quick access and a native app feel.
        </p>

        {/* Features */}
        <div className="flex justify-center gap-6 mb-6">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <Smartphone size={18} className="text-emerald-600" />
            </div>
            <span className="text-[10px] text-gray-500">Native Feel</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Download size={18} className="text-blue-600" />
            </div>
            <span className="text-[10px] text-gray-500">Quick Access</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span className="text-[10px] text-gray-500">Offline Ready</span>
          </div>
        </div>

        {isIOS ? (
          /* iOS instructions */
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-700 text-center">
              Tap <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-gray-200 rounded text-xs font-medium">
                <svg viewBox="0 0 24 24" className="w-4 h-4 mr-1" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                  <polyline points="16,6 12,2 8,6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Share
              </span> then <span className="font-semibold">"Add to Home Screen"</span>
            </p>
          </div>
        ) : (
          /* Install button */
          <button
            onClick={handleInstall}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm shadow-lg transition-all active:scale-[0.98] hover:shadow-xl"
            style={{ background: 'linear-gradient(135deg, #075e54, #128c7e)' }}
          >
            <span className="flex items-center justify-center gap-2">
              <Download size={18} />
              Install App
            </span>
          </button>
        )}

        {/* Not now link */}
        <button
          onClick={handleDismiss}
          className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
