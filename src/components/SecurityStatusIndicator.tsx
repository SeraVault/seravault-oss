import React, { useState, useEffect, useCallback } from 'react';
import { Box, IconButton, Tooltip, Typography, Fade, useTheme, useMediaQuery } from '@mui/material';
import { Security, SecurityOutlined, LockOutlined, MoreTime, LockOpen } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { usePassphrase } from '../auth/PassphraseContext';
import { useAuth } from '../auth/AuthContext';
import { secureStorage } from '../utils/secureStorage';

const SecurityStatusIndicator: React.FC = () => {
  const { t } = useTranslation();
  const { privateKey, clearPrivateKey, requestUnlock } = usePassphrase();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [justExtended, setJustExtended] = useState(false);

  const updateTimeRemaining = useCallback(() => {
    if (!privateKey) { setTimeRemaining(0); return; }
    const storageKey = `privateKey_${user?.uid}`;
    setTimeRemaining(secureStorage.getTimeUntilExpiration(storageKey));
  }, [privateKey, user?.uid]);

  const handleExtend = useCallback(() => {
    if (!user?.uid) return;
    secureStorage.extendSession(`privateKey_${user.uid}`);
    updateTimeRemaining();
    setJustExtended(true);
    setTimeout(() => setJustExtended(false), 2000);
  }, [user?.uid, updateTimeRemaining]);

  useEffect(() => {
    if (!privateKey) { setTimeRemaining(0); return; }
    updateTimeRemaining();
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => setTimeout(updateTimeRemaining, 10);
    activityEvents.forEach(e => document.addEventListener(e, handleActivity, { passive: true }));
    const interval = setInterval(updateTimeRemaining, 1000);
    return () => {
      activityEvents.forEach(e => document.removeEventListener(e, handleActivity));
      clearInterval(interval);
    };
  }, [privateKey, updateTimeRemaining]);

  if (!user) return null;

  const totalSeconds = Math.max(0, Math.floor(timeRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const timeLabel = totalSeconds < 60
    ? `${seconds}s`
    : `${minutes}m ${String(seconds).padStart(2, '0')}s`;

  const isWarning = timeRemaining > 0 && timeRemaining < 5 * 60 * 1000;
  const isCritical = timeRemaining > 0 && timeRemaining < 90 * 1000;

  const bgColor = isCritical ? 'rgba(244, 67, 54, 0.2)'
    : isWarning ? 'rgba(255, 152, 0, 0.2)'
    : 'rgba(76, 175, 80, 0.15)';
  const borderColor = isCritical ? 'rgba(244, 67, 54, 0.5)'
    : isWarning ? 'rgba(255, 152, 0, 0.5)'
    : 'rgba(76, 175, 80, 0.3)';
  const iconColor = isCritical ? '#f44336' : isWarning ? '#ffa726' : '#66bb6a';

  if (privateKey) {
    // Mobile: icon-only lock button — tap to lock the session
    if (isMobile) {
      return (
        <Tooltip title={t('security.lockNow', '🔒 Lock now')}>
          <IconButton
            size="small"
            onClick={clearPrivateKey}
            sx={{
              color: iconColor,
              backgroundColor: bgColor,
              border: `1px solid ${borderColor}`,
              borderRadius: '50%',
              p: '4px',
              '&:hover': { backgroundColor: borderColor },
            }}
            aria-label={t('security.sessionActiveTapToLock', 'Session active – tap to lock')}
          >
            <LockOpen sx={{ fontSize: '18px' }} />
          </IconButton>
        </Tooltip>
      );
    }

    return (
      <Tooltip title={t('security.unlockedTooltip', '🔓 Session active • {{time}} idle timeout remaining • Resets on activity', { time: timeLabel })}>
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          backgroundColor: bgColor,
          padding: '4px 8px',
          borderRadius: '16px',
          border: `1px solid ${borderColor}`,
          cursor: 'default',
          transition: 'background-color 0.5s, border-color 0.5s',
        }}>
          <Security sx={{ color: iconColor, fontSize: '16px', transition: 'color 0.5s' }} />
          <Typography
            variant="caption"
            sx={{
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '0.8rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              minWidth: '42px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {timeLabel}
          </Typography>

          {/* Extend button — visible in warning/critical states */}
          <Fade in={isWarning || isCritical}>
            <Tooltip title={justExtended
              ? t('security.extended', '✅ Session extended')
              : t('security.extend', 'Extend session')
            }>
              <IconButton
                size="small"
                onClick={handleExtend}
                sx={{
                  color: justExtended ? '#66bb6a' : iconColor,
                  padding: '2px',
                  transition: 'color 0.3s',
                  '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
                }}
                aria-label={t('security.extendSession', 'Extend session')}
              >
                <MoreTime fontSize="small" />
              </IconButton>
            </Tooltip>
          </Fade>

          {/* Lock button */}
          <Tooltip title={t('security.lockNow', '🔒 Lock now')}>
            <IconButton
              size="small"
              onClick={clearPrivateKey}
              sx={{
                color: 'rgba(255,255,255,0.8)',
                padding: '2px',
                '&:hover': { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.1)' },
              }}
            >
              <SecurityOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Tooltip>
    );
  } else {
    // Key is locked - show red indicator with unlock button
    // Mobile: icon-only lock button
    if (isMobile) {
      return (
        <Tooltip title={t('security.lockedTooltip', '🔒 Locked – tap to unlock')}>
          <IconButton
            size="small"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); requestUnlock(); }}
            sx={{
              color: '#f44336',
              backgroundColor: 'rgba(244, 67, 54, 0.15)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              borderRadius: '50%',
              p: '4px',
              '&:hover': { backgroundColor: 'rgba(244, 67, 54, 0.25)' },
            }}
            aria-label={t('security.lockedTapToUnlock', 'Locked – tap to unlock')}
          >
            <LockOutlined sx={{ fontSize: '18px' }} />
          </IconButton>
        </Tooltip>
      );
    }

    return (
      <Tooltip title={t('security.lockedTooltip', '🔒 Private key is locked • Click to unlock and access encrypted files')}>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            backgroundColor: 'rgba(244, 67, 54, 0.15)',
            padding: '4px 8px',
            borderRadius: '16px',
            border: '1px solid rgba(244, 67, 54, 0.3)',
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: 'rgba(244, 67, 54, 0.25)',
              borderColor: 'rgba(244, 67, 54, 0.5)',
            },
            '&:active': {
              backgroundColor: 'rgba(244, 67, 54, 0.35)',
            },
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            requestUnlock();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              requestUnlock();
            }
          }}
        >
          <LockOutlined sx={{ color: '#f44336', fontSize: '16px' }} />
          <Typography 
            variant="caption" 
            sx={{ 
              color: '#ffffff', 
              fontWeight: 'bold',
              fontSize: '0.8rem',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {t('security.locked', 'Locked')}
          </Typography>
        </Box>
      </Tooltip>
    );
  }
};

export default SecurityStatusIndicator;