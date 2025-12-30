import { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';
import './Toast.css';

const Toast = ({ message, type = 'error', duration = 4000, onClose = () => {} }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (!message) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    setIsLeaving(false);

    const timer = setTimeout(() => {
      handleClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300);
  };

  if (!message || !isVisible) return null;

  const icons = {
    error: <AlertCircle size={18} />,
    success: <CheckCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <div className={`toast toast-${type} ${isLeaving ? 'toast-leaving' : 'toast-entering'}`}>
      <div className="toast-icon">{icons[type]}</div>
      <div className="toast-content">
        <span className="toast-message">{message}</span>
      </div>
      <button type="button" onClick={handleClose} className="toast-close" aria-label="Dismiss">
        <X size={14} />
      </button>
      <div className="toast-progress" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
};

export default Toast;
