import { createContext, useContext, useState, useEffect } from 'react';
import { getFromStorage, setToStorage, removeFromStorage, STORAGE_KEYS } from '../utils/storage';
import { DEFAULT_ADMIN } from '../utils/constants';
import apiService, { setLogoutHandler, resetAuthInvalid } from '../services/apiService';

const AuthContext = createContext(null);

// Role normalization - use role from backend (server-determined)
const normalizeRole = (email, role) => role;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuthState = () => {
    setUser(null);
    removeFromStorage(STORAGE_KEYS.USER);
    // NOTE: Tokens are stored in httpOnly cookies (set by server)
    // They are automatically cleared when logout endpoint is called
  };

  // Logout function - defined first so it can be used in useEffect
  const logout = async () => {
    try {
      // Call logout endpoint which clears httpOnly cookies server-side
      await apiService.post('/auth/logout', {});
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuthState();
    }
  };

  const forceLogout = () => {
    clearAuthState();
    setLoading(false);
  };

  // Helper function to decode JWT and get expiration time
  const getTokenExpiration = (token) => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      // Decode the payload
      const decoded = JSON.parse(atob(parts[1]));
      return decoded.exp ? decoded.exp * 1000 : null; // Convert to milliseconds
    } catch (error) {
      console.error('Failed to decode token:', error);
      return null;
    }
  };

  // Helper function to check if token is expired or about to expire
  const isTokenExpiredOrExpiring = (token, bufferMinutes = 5) => {
    const expTime = getTokenExpiration(token);
    if (!expTime) return true;
    
    const now = Date.now();
    const bufferMs = bufferMinutes * 60 * 1000;
    return expTime <= (now + bufferMs);
  };

  useEffect(() => {
    // Register logout handler with apiService
    setLogoutHandler(logout);

    // Check for existing session - PERSISTENT LOGIN
    const initializeAuth = async () => {
      const storedUser = getFromStorage(STORAGE_KEYS.USER);
      
      if (storedUser) {
        // httpOnly cookies are automatically sent by browser
        // No need to check token expiration - server handles it
        setUser(storedUser);
        
        // Verify session in background (non-blocking)
        verifySession().catch(() => {
          // Silent fail - keep user logged in
        });
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const verifySession = async () => {
    try {
      // httpOnly cookies are automatically sent by browser
      const response = await apiService.get('/auth/session');
      if (response.user) {
        const userData = {
          id: response.user.id,
          email: response.user.email,
          name: response.user.fullName || response.user.name || response.user.email,
          role: normalizeRole(response.user.email, response.user.role || 'auditor'),
        };
        setUser(userData);
        setToStorage(STORAGE_KEYS.USER, userData);
      }
    } catch (error) {
      if (error?.response?.status === 401 || error?.status === 401) {
        console.error('Session invalid (401), logging out');
        forceLogout();
      } else {
        console.warn('Session verification failed, keeping user logged in:', error.message);
      }
    }
  };

  const login = async (email, password) => {
    try {
      // Try API login first
      const response = await apiService.post('/auth/login', { email, password });
      
      if (response && response.success && response.user) {
        const userData = {
          id: response.user.id,
          email: response.user.email,
          name: response.user.fullName || response.user.email,
          role: normalizeRole(response.user.email, response.user.role || 'auditor'),
          loginTime: new Date().toISOString(),
        };
        
        setUser(userData);
        setToStorage(STORAGE_KEYS.USER, userData);
        // NOTE: Tokens are now in httpOnly cookies, not localStorage
        
        resetAuthInvalid();
        return { success: true };
      }
      
      return { success: false, error: 'Invalid email or password' };
    } catch (error) {
      console.error('[AuthContext] Login error:', error);
      console.error('[AuthContext] Error details:', error.message, error.response?.data);
      
      // Fallback to demo login
      if (email === DEFAULT_ADMIN.email && password === DEFAULT_ADMIN.password) {
        const userData = {
          id: '1',
          email: DEFAULT_ADMIN.email,
          name: DEFAULT_ADMIN.name,
          role: DEFAULT_ADMIN.role,
          loginTime: new Date().toISOString(),
        };
        setUser(userData);
        setToStorage(STORAGE_KEYS.USER, userData);
        return { success: true };
      }

      return { 
        success: false, 
        error: error.response?.data?.error || error.message || 'Login failed. Please try again.' 
      };
    }
  };

  // Helper functions for role checking
  const isAdmin = () => user?.role === 'administrator';
  const isAuditor = () => user?.role === 'auditor';
  const hasRole = (role) => user?.role === role;
  const canEdit = () => user?.role === 'administrator';
  const canView = () => !!user; // All authenticated users can view

  const value = {
    user,
    login,
    logout,
    loading,
    isAuthenticated: !!user,
    isAdmin,
    isAuditor,
    hasRole,
    canEdit,
    canView,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
