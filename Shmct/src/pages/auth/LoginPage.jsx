import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Toast from '../../components/ui/Toast';
import './LoginPage.css';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showForgotDialog, setShowForgotDialog] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const { register, handleSubmit, formState: { errors }, setValue } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    try {
      const result = await login(data.email, data.password);
      if (result && result.success) {
        navigate(from, { replace: true });
      } else {
        setError(result?.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Toast message={error} type="error" onClose={() => setError('')} />

      {/* Card */}
      <div className={`login-card ${mounted ? 'login-card-visible' : ''}`}>

        {/* Header */}
        <div className="login-header">
          <div className="login-avatar">
            <User size={32} />
          </div>
          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="login-form">
          <div className="login-field">
            <label htmlFor="email" className="login-label">Email</label>
            <input
              {...register('email')}
              type="email"
              className={`login-input ${errors.email ? 'login-input-error' : ''}`}
              placeholder="Your email"
              autoComplete="email"
              id="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && <span id="email-error" className="login-error" aria-live="polite">{errors.email.message}</span>}
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">Password</label>
            <div className="login-input-wrapper">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                className={`login-input ${errors.password ? 'login-input-error' : ''}`}
                placeholder="••••••••"
                autoComplete="current-password"
                id="password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="login-toggle-pw"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <span id="password-error" className="login-error" aria-live="polite">{errors.password.message}</span>}
          </div>

          <div className="login-actions">
            <label className="remember">
              <input type="checkbox" {...register('remember')} />
              <span>Remember me</span>
            </label>
            <button type="button" className="forgot-link" onClick={() => setShowForgotDialog(true)}>Forgot password?</button>
          </div>

          <button type="submit" disabled={isLoading} className="login-btn login-btn-primary login-btn-block">
            {isLoading ? (
              <span className="login-spinner" />
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>

      </div>

      {/* Forgot Password Dialog */}
      {showForgotDialog && (
        <div className="dialog-overlay" onClick={() => setShowForgotDialog(false)}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <h2 className="dialog-title">Password Reset</h2>
            <p className="dialog-message">
              Please contact the administrator to reset your password.
            </p>
            <button 
              className="dialog-btn"
              onClick={() => setShowForgotDialog(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
            
