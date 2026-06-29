import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Typography,
  Collapse,
  IconButton,
} from '@mui/material';
import {
  Smartphone,
  Computer,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { getBiometricCapabilities } from '../utils/biometricAuth';

const DeviceCapabilityInfo: React.FC = () => {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<{
    available: boolean;
    type: string;
    supportsResidentKeys: boolean;
  }>({ available: false, type: 'none', supportsResidentKeys: false });
  const [deviceInfo, setDeviceInfo] = useState<{
    platform: string;
    browser: string;
    mobile: boolean;
  }>({ platform: 'Unknown', browser: 'Unknown', mobile: false });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const detectCapabilities = async () => {
      const caps = await getBiometricCapabilities();
      setCapabilities(caps);
      
      // Detect device info
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
      
      let platform = 'Desktop';
      let browser = 'Unknown';
      
      if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
        platform = userAgent.includes('iphone') ? 'iPhone' : 'iPad';
        browser = userAgent.includes('safari') ? 'Safari' : 'Browser';
      } else if (userAgent.includes('android')) {
        platform = 'Android';
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
      } else if (userAgent.includes('windows')) {
        platform = 'Windows';
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('edge')) browser = 'Edge';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
      } else if (userAgent.includes('mac')) {
        platform = 'macOS';
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('safari')) browser = 'Safari';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
      } else if (userAgent.includes('linux')) {
        platform = 'Linux';
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
        else if (userAgent.includes('edge')) browser = 'Edge';
      }
      
      // Fallback browser detection if not already detected
      if (browser === 'Unknown') {
        if (userAgent.includes('chrome')) browser = 'Chrome';
        else if (userAgent.includes('firefox')) browser = 'Firefox';
        else if (userAgent.includes('edge')) browser = 'Edge';
        else if (userAgent.includes('safari')) browser = 'Safari';
      }
      
      setDeviceInfo({ platform, browser, mobile });
    };

    detectCapabilities();
  }, []);

  const getRecommendation = () => {
    if (capabilities.available) {
      return {
        severity: 'success' as const,
        message: t('profile.deviceSupportsAuth', `✅ Your ${deviceInfo.platform} device supports biometric authentication with ${capabilities.type}`, { platform: deviceInfo.platform, type: capabilities.type }),
        action: t('profile.enableBiometricLogin', 'You can enable biometric login for faster access to your encrypted files.'),
      };
    }

    if (deviceInfo.mobile) {
      return {
        severity: 'warning' as const,
        message: t('profile.biometricNotAvailable', `⚠️ Biometric authentication not available on ${deviceInfo.platform} ${deviceInfo.browser}`, { platform: deviceInfo.platform, browser: deviceInfo.browser }),
        action: t('profile.tryDifferentBrowser', 'Try using Safari on iOS or Chrome on Android for biometric support.'),
      };
    }

    return {
      severity: 'info' as const,
      message: t('profile.desktopDetected', `💻 Desktop detected (${deviceInfo.platform} ${deviceInfo.browser})`, { platform: deviceInfo.platform, browser: deviceInfo.browser }),
      action: t('profile.biometricAvailableOn', 'Biometric authentication is available on Windows (Hello), macOS (Touch ID), Linux (fingerprint readers), and mobile devices.'),
    };
  };

  const getSupportedDevices = () => [
    { icon: <Smartphone />, name: t('profile.iphoneIpad', 'iPhone/iPad'), requirement: t('profile.safariTouchId', 'Safari + Touch ID/Face ID') },
    { icon: <Smartphone />, name: t('profile.android', 'Android'), requirement: t('profile.chromeFingerprintFace', 'Chrome/Edge + Fingerprint/Face') },
    { icon: <Computer />, name: t('profile.windows', 'Windows'), requirement: t('profile.chromeWindowsHello', 'Chrome/Edge + Windows Hello') },
    { icon: <Computer />, name: t('profile.macos', 'macOS'), requirement: t('profile.chromeTouchId', 'Chrome/Safari + Touch ID') },
    { icon: <Computer />, name: t('profile.linux', 'Linux'), requirement: t('profile.chromeFirefoxFingerprint', 'Chrome/Firefox + Fingerprint reader') },
  ];

  const recommendation = getRecommendation();

  return (
    <Box>
      <Alert severity={recommendation.severity} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {recommendation.message}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {recommendation.action}
          </Typography>
          
          {!capabilities.available && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2">
                {t('profile.stillUsePassphrase', "Don't worry - you can still use your passphrase securely")}
              </Typography>
              <IconButton 
                size="small" 
                onClick={() => setExpanded(!expanded)}
                sx={{ ml: 'auto' }}
              >
                {expanded ? <ExpandLess /> : <ExpandMore />}
              </IconButton>
            </Box>
          )}
        </Box>
      </Alert>

      <Collapse in={expanded}>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>{t('profile.supportedDevicesBrowsers', 'Supported Devices & Browsers:')}</strong>
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {getSupportedDevices().map((device, index) => (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {device.icon}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {device.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {device.requirement}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Typography variant="body2" sx={{ mt: 2 }}>
            <strong>{t('profile.note', 'Note:')}</strong> {t('profile.biometricBackupNote', 'Even on supported devices, you can always use your passphrase as backup. Biometric authentication is an optional convenience feature.')}
          </Typography>
        </Alert>
      </Collapse>
    </Box>
  );
};

export default DeviceCapabilityInfo;