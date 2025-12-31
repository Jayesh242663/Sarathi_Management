import { useRef, useState, useLayoutEffect } from 'react';
import { ResponsiveContainer } from 'recharts';

const MeasuredResponsiveContainer = ({ children, style = {}, minHeight = 220, minWidth = 0, ...props }) => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: null, height: null });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ width: r.width > 0 ? r.width : null, height: r.height > 0 ? r.height : null });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // If we didn't get measurements yet, provide fallbacks to avoid zero/negative sizes
  const width = size.width || '100%';
  const height = size.height || props.height || minHeight;

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minHeight, minWidth, boxSizing: 'border-box' }}>
      <ResponsiveContainer width={width} height={height} {...props} style={{ width: '100%', height: '100%' }}>
        {children}
      </ResponsiveContainer>
    </div>
  );
};

export default MeasuredResponsiveContainer;
