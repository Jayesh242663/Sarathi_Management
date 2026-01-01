import { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { ResponsiveContainer } from 'recharts';

const MeasuredResponsiveContainer = ({ children, style = {}, minHeight = 220, minWidth = 0, ...props }) => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: null, height: null });
  const resizeTimeoutRef = useRef(null);

  // Debounced resize handler to prevent excessive re-renders
  const debouncedMeasure = useCallback((rect) => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      setSize({ 
        width: rect.width > 0 ? rect.width : null, 
        height: rect.height > 0 ? rect.height : null 
      });
    }, 10);
  }, []);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(el);
      
      // Account for padding when calculating available space
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
      
      const availableWidth = rect.width - paddingLeft - paddingRight;
      const availableHeight = rect.height - paddingTop - paddingBottom;
      
      return {
        width: availableWidth > 0 ? availableWidth : rect.width,
        height: availableHeight > 0 ? availableHeight : rect.height
      };
    };
    
    // Immediate measurement on mount for instant sizing
    const initialMeasure = measure();
    setSize({ 
      width: initialMeasure.width > 0 ? initialMeasure.width : null, 
      height: initialMeasure.height > 0 ? initialMeasure.height : null 
    });
    
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        debouncedMeasure(rect);
      }
    });
    
    ro.observe(el);
    
    return () => {
      ro.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [debouncedMeasure]);

  // If we didn't get measurements yet, provide fallbacks to avoid zero/negative sizes
  const width = size.width || '100%';
  const height = size.height || props.height || minHeight;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight, minWidth, boxSizing: 'border-box', ...style }}>
      <ResponsiveContainer width={width} height={height} {...props}>
        {children}
      </ResponsiveContainer>
    </div>
  );
};

export default MeasuredResponsiveContainer;
