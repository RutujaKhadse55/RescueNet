import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';

export const DrillBanner: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="drill-banner" role="alert" aria-live="assertive" id="drill-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <AlertTriangle size={18} />
        <span>{t.drillBannerText}</span>
      </div>
      <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>{t.drillBannerSub}</span>
    </div>
  );
};
