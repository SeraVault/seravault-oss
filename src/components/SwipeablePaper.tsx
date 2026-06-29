import React, { useRef, forwardRef } from 'react';
import { Paper, Box } from '@mui/material';
import type { PaperProps } from '@mui/material';

/**
 * Drop-in replacement for MUI Paper used as the Dialog PaperComponent.
 * On mobile (touch devices) a downward swipe from the dialog title / drag-handle
 * area triggers an Escape keydown event, which causes MUI Dialog to call onClose.
 *
 * The swipe is intentionally limited to the top 64 px of the dialog so it does
 * not interfere with scrollable content inside DialogContent.
 */

const SWIPE_THRESHOLD_PX = 100;
const SWIPE_ORIGIN_MAX_Y = 64; // px from top of paper where a swipe may start

const SwipeablePaper = forwardRef<HTMLDivElement, PaperProps>((props, ref) => {
  const { children, ...rest } = props;

  const domRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);
  const deltaRef = useRef(0);

  const setRef = (node: HTMLDivElement | null) => {
    domRef.current = node;
    if (typeof ref === 'function') {
      ref(node);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!domRef.current) return;
    const rect = domRef.current.getBoundingClientRect();
    const relativeY = e.touches[0].clientY - rect.top;
    // Only initiate swipe-to-close from the top area (drag handle / title)
    if (relativeY > SWIPE_ORIGIN_MAX_Y) return;
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    dragging.current = false;
    deltaRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || startX.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    const dx = e.touches[0].clientX - startX.current;
    // Only track a clearly downward gesture
    if (dy > 0 && Math.abs(dy) > Math.abs(dx) + 5) {
      dragging.current = true;
      deltaRef.current = dy;
      if (domRef.current) {
        domRef.current.style.transform = `translateY(${dy}px)`;
        domRef.current.style.transition = 'none';
      }
    }
  };

  const handleTouchEnd = () => {
    if (dragging.current && deltaRef.current > SWIPE_THRESHOLD_PX) {
      // Reset visual state immediately, then dispatch Escape so MUI closes the dialog
      if (domRef.current) {
        domRef.current.style.transform = '';
        domRef.current.style.transition = '';
      }
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    } else if (domRef.current) {
      // Spring back
      domRef.current.style.transition = 'transform 0.3s ease';
      domRef.current.style.transform = '';
      const el = domRef.current;
      el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
    }
    startY.current = null;
    startX.current = null;
    dragging.current = false;
    deltaRef.current = 0;
  };

  return (
    <Paper
      {...rest}
      ref={setRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drag-handle pill — only visible on mobile */}
      <Box
        aria-hidden
        sx={{
          display: { xs: 'flex', sm: 'none' },
          justifyContent: 'center',
          pt: 1,
          pb: 0,
          pointerEvents: 'none',
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: 2,
            bgcolor: 'action.disabled',
          }}
        />
      </Box>
      {children}
    </Paper>
  );
});

SwipeablePaper.displayName = 'SwipeablePaper';

export default SwipeablePaper;
