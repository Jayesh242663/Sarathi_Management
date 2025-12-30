import { createContext, useContext, useState, useEffect } from 'react';
import { getFromStorage, setToStorage, removeFromStorage, STORAGE_KEYS } from '../utils/storage';
import { DEFAULT_ADMIN } from '../utils/constants';
import apiService, { setLogoutHandler } from '../services/apiService';

const AuthContext = createContext(null);
const SUPER_ADMIN_EMAILS = ['jayeshchanne9@gmail.com'];

const normalizeRole = (email, role) => (
  email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase()) ? 'administrator' : role
);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Logout function - defined first so it can be used in useEffect
  const logout = async () => {
    try {
      const token = getFromStorage(STORAGE_KEYS.AUTH_TOKEN);
      if (token) {
        await apiService.post('/auth/logout', {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      removeFromStorage(STORAGE_KEYS.USER);
      removeFromStorage(STORAGE_KEYS.AUTH_TOKEN);
      removeFromStorage(STORAGE_KEYS.REFRESH_TOKEN);
    }
  };

  useEffect(() => {
    // Register logout handler with apiService
    setLogoutHandler(logout);

    // Check for existing session - PERSISTENT LOGIN
    const storedUser = getFromStorage(STORAGE_KEYS.USER);
    const storedToken = getFromStorage(STORAGE_KEYS.AUTH_TOKEN);
    
    if (storedUser && storedToken) {
      // Restore user immediately for persistent login
      setUser(storedUser);
      
      // Verify session in background (non-blocking)
      // Only logout if token is definitively invalid (401)
      verifySession(storedToken).catch(() => {
        // Silent fail - keep user logged in even if verification fails
        // Token refresh will handle expired tokens automatically
      });
    }
    setLoading(false);
  }, []);

  const verifySession = async (token) => {
    try {
      const response = await apiService.get('/auth/session', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.user) {
        const userData = {
          ...response.user,
          role: normalizeRole(response.user.email, response.user.role || 'auditor'),
        };
        setUser(userData);
        setToStorage(STORAGE_KEYS.USER, userData);
      }
    } catch (error) {
      // Only logout for definitive auth failures (401)
      // Network errors or server issues should not log user out
      if (error?.response?.status === 401 || error?.status === 401) {
        console.error('Session invalid (401), logging out');
        logout();
      } else {
        // For other errors (network, 500, etc.), keep user logged in
        // The automatic token refresh will handle expired tokens
        console.warn('Session verification failed (non-auth error), keeping user logged in:', error.message);
      }
    }
  };

  const login = async (email, password) => {
    try {
      console.log('[AuthContext] Attempting login with email:', email);
      // Try API login first
      const response = await apiService.post('/auth/login', { email, password });
      
      console.log('[AuthContext] Login response:', response);
      
      if (response && response.success && response.user) {
        const userData = {
          id: response.user.id,
          email: response.user.email,
          name: response.user.fullName || response.user.email,
          role: normalizeRole(response.user.email, response.user.role || 'auditor'),
          loginTime: new Date().toISOString(),
        };
        
        console.log('[AuthContext] Setting user:', userData);
        setUser(userData);
        setToStorage(STORAGE_KEYS.USER, userData);
        setToStorage(STORAGE_KEYS.AUTH_TOKEN, response.accessToken);
        
        // Store refresh token for automatic token refresh
        if (response.session?.refresh_token) {
          setToStorage(STORAGE_KEYS.REFRESH_TOKEN, response.session.refresh_token);
        }
        
        console.log('[AuthContext] Login successful');
        return { success: true };
      }
      
      console.log('[AuthContext] Invalid response format:', response);
      return { success: false, error: 'Invalid email or password' };
    } catch (error) {
      console.error('[AuthContext] Login error:', error);
      console.error('[AuthContext] Error details:', error.message, error.response?.data);
      
      // Fallback to demo login
      if (email === DEFAULT_ADMIN.email && password === DEFAULT_ADMIN.password) {
        console.log('[AuthContext] Using demo credentials');
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
