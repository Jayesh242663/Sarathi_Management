import React from 'react';
import './Skeleton.css';

const Skeleton = ({ rows = 3, variant = 'text', width = '100%' }) => {
  const items = Array.from({ length: rows });
  return (
    <div className={`skeleton-group skeleton-${variant}`}>
      {items.map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton" style={{ width }} />
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
