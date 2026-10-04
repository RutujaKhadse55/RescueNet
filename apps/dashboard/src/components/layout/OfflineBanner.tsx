import React from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

export const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="offline-banner" role="alert" aria-live="polite" id="offline-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <WifiOff size={18} />
        <span>{t.offlineBannerText}</span>
      </div>
    </div>
  );
};
