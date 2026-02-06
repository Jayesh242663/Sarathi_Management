// Backend API service for SHMCT
// This service handles all backend API calls using Supabase as the database

import { getFromStorage, setToStorage, removeFromStorage, STORAGE_KEYS } from '../utils/storage';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const nativeFetch = globalThis.fetch.bind(globalThis);
const CSRF_HEADER = 'x-csrf-token';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let csrfTokenCache = null;
let csrfTokenPromise = null;

// Token refresh state
let isRefreshing = false;
let refreshSubscribers = [];
let authInvalid = false;

export function resetAuthInvalid() {
  authInvalid = false;
}

// Subscribe to token refresh
function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback);
}

// Notify all subscribers when token is refreshed
function onTokenRefreshed(token) {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
}

// Logout handler (will be set by AuthContext)
let logoutHandler = null;
export function setLogoutHandler(handler) {
  logoutHandler = handler;
}

// Initialize headers with authentication
function getHeaders() {
  const token = getFromStorage(STORAGE_KEYS.AUTH_TOKEN);
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

async function loadCsrfToken() {
  if (csrfTokenCache) return csrfTokenCache;
  if (csrfTokenPromise) return csrfTokenPromise;

  csrfTokenPromise = nativeFetch(`${API_BASE}/csrf-token`, {
    method: 'GET',
    headers: getHeaders(),
    credentials: 'include'
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json();
      return data?.csrfToken || null;
    })
    .catch(() => null)
    .finally(() => {
      csrfTokenPromise = null;
    });

  csrfTokenCache = await csrfTokenPromise;
  return csrfTokenCache;
}

async function apiFetch(url, options = {}, retry = false) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...getHeaders(), ...(options.headers || {}) };
  const finalOptions = {
    ...options,
    headers,
    credentials: 'include'
  };

  if (WRITE_METHODS.has(method)) {
    const csrfToken = await loadCsrfToken();
    if (csrfToken) headers[CSRF_HEADER] = csrfToken;
  }

  const response = await nativeFetch(url, finalOptions);
  if (!retry && WRITE_METHODS.has(method) && response.status === 403) {
    csrfTokenCache = null;
    await loadCsrfToken();
    return apiFetch(url, options, true);
  }

  return response;
}

const fetch = apiFetch;

// Handle 401 errors and attempt token refresh
async function handleUnauthorized(originalRequest) {
  if (authInvalid) {
    if (logoutHandler) {
      logoutHandler();
    }
    throw new Error('Session expired. Please login again.');
  }

  const refreshToken = getFromStorage(STORAGE_KEYS.REFRESH_TOKEN);
  
  if (!refreshToken) {
    authInvalid = true;
    // No refresh token, logout
    if (logoutHandler) {
      logoutHandler();
    }
    throw new Error('Session expired. Please login again.');
  }

  if (!isRefreshing) {
    isRefreshing = true;
    
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      const newToken = data.accessToken;
      const newRefreshToken = data.session?.refresh_token;

      // Update stored tokens
      setToStorage(STORAGE_KEYS.AUTH_TOKEN, newToken);
      if (newRefreshToken) {
        setToStorage(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);
      }

      authInvalid = false;
      isRefreshing = false;
      onTokenRefreshed(newToken);

      // Retry original request with new token
      return originalRequest(newToken);
    } catch (error) {
      authInvalid = true;
      isRefreshing = false;
      // Refresh failed, logout
      if (logoutHandler) {
        logoutHandler();
      }
      throw new Error('Session expired. Please login again.');
    }
  } else {
    // Wait for token refresh to complete
    return new Promise((resolve, reject) => {
      subscribeTokenRefresh((token) => {
        resolve(originalRequest(token));
      });
    });
  }
}

// Enhanced fetch wrapper with retry logic
async function fetchWithRetry(url, options = {}) {
  try {
    const response = await fetch(url, options);
    
    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Retry with refreshed token
      return await handleUnauthorized(async (newToken) => {
        const newOptions = {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`
          }
        };
        const retryResponse = await fetch(url, newOptions);
        if (!retryResponse.ok && retryResponse.status !== 401) {
          throw new Error(`Request failed: ${retryResponse.statusText}`);
        }
        return retryResponse;
      });
    }
    
    return response;
  } catch (error) {
    throw error;
  }
}

// =====================================================
// STUDENT OPERATIONS
// =====================================================

export const StudentService = {
  async getAll(batchId) {
    const response = await fetch(`${API_BASE}/students?batchId=${batchId}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch students');
    return response.json();
  },

  async getById(id) {
    const response = await fetch(`${API_BASE}/students/${id}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch student');
    return response.json();
  },

  async create(studentData) {
    const response = await fetchWithRetry(`${API_BASE}/students`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(studentData)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || errorData.message || 'Failed to create student');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  },

  async update(id, studentData) {
    const response = await fetch(`${API_BASE}/students/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(studentData)
    });
    if (!response.ok) throw new Error('Failed to update student');
    return response.json();
  },

  async delete(id) {
    const response = await fetch(`${API_BASE}/students/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to delete student');
    return response.json();
  }
};

// =====================================================
// PAYMENT OPERATIONS
// =====================================================

export const PaymentService = {
  async getByStudent(studentId, batchId) {
    const response = await fetch(
      `${API_BASE}/payments?studentId=${studentId}&batchId=${batchId}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch payments');
    return response.json();
  },

  async getByBatch(batchId) {
    const response = await fetch(
      `${API_BASE}/payments?batchId=${batchId}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch payments');
    return response.json();
  },

  async create(paymentData) {
    const response = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(paymentData)
    });
    if (!response.ok) throw new Error('Failed to create payment');
    return response.json();
  },

  async update(id, paymentData) {
    const response = await fetch(`${API_BASE}/payments/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(paymentData)
    });
    if (!response.ok) throw new Error('Failed to update payment');
    return response.json();
  }
};

// =====================================================
// PLACEMENT OPERATIONS
// =====================================================

export const PlacementService = {
  async getByBatch(batchId) {
    const response = await fetch(
      `${API_BASE}/placements?batchId=${batchId}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch placements');
    return response.json();
  },

  async getById(id) {
    const response = await fetch(`${API_BASE}/placements/${id}`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch placement');
    return response.json();
  },

  async create(placementData) {
    const response = await fetch(`${API_BASE}/placements`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(placementData)
    });
    if (!response.ok) throw new Error('Failed to create placement');
    return response.json();
  },

  async update(id, placementData) {
    const response = await fetch(`${API_BASE}/placements/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(placementData)
    });
    if (!response.ok) throw new Error('Failed to update placement');
    return response.json();
  }
};

// =====================================================
// PLACEMENT INSTALLMENT OPERATIONS
// =====================================================

export const PlacementInstallmentService = {
  async getByPlacement(placementId) {
    const response = await fetch(
      `${API_BASE}/placement-installments?placementId=${placementId}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch installments');
    return response.json();
  },

  async create(installmentData) {
    const response = await fetch(`${API_BASE}/placement-installments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(installmentData)
    });
    if (!response.ok) throw new Error('Failed to create installment');
    return response.json();
  },

  async update(id, installmentData) {
    const response = await fetch(`${API_BASE}/placement-installments/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(installmentData)
    });
    if (!response.ok) throw new Error('Failed to update installment');
    return response.json();
  }
};

// =====================================================
// AUDIT LOG OPERATIONS
// =====================================================

export const AuditService = {
  async getByBatch(batchId, filters = {}) {
    const params = new URLSearchParams({ batchId, ...filters });
    const response = await fetch(
      `${API_BASE}/audit-logs?${params}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch audit logs');
    return response.json();
  },

  async getFinancialLedger(batchId, filters = {}) {
    const params = new URLSearchParams({ batchId, ...filters });
    const response = await fetch(
      `${API_BASE}/audit-logs/ledger?${params}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch ledger');
    return response.json();
  }
};

// =====================================================
// ANALYTICS/STATISTICS OPERATIONS
// =====================================================

export const AnalyticsService = {
  async getDashboardStats(batchId) {
    const response = await fetch(
      `${API_BASE}/analytics/dashboard?batchId=${batchId}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch dashboard stats');
    return response.json();
  },

  async getPaymentAnalytics(batchId, dateRange = 'month') {
    const response = await fetch(
      `${API_BASE}/analytics/payments?batchId=${batchId}&range=${dateRange}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch payment analytics');
    return response.json();
  },

  async getPlacementAnalytics(batchId) {
    const response = await fetch(
      `${API_BASE}/analytics/placements?batchId=${batchId}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch placement analytics');
    return response.json();
  },

  async getRevenueReport(batchId, startDate, endDate) {
    const params = new URLSearchParams({ batchId, startDate, endDate });
    const response = await fetch(
      `${API_BASE}/analytics/revenue?${params}`,
      { headers: getHeaders() }
    );
    if (!response.ok) throw new Error('Failed to fetch revenue report');
    return response.json();
  }
};

// =====================================================
// BATCH OPERATIONS
// =====================================================

export const BatchService = {
  async getAll() {
    const response = await fetch(`${API_BASE}/batches`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch batches');
    return response.json();
  },

  async create(batchData) {
    const response = await fetch(`${API_BASE}/batches`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(batchData)
    });
    if (!response.ok) throw new Error('Failed to create batch');
    return response.json();
  }
};

// =====================================================
// COURSE OPERATIONS
// =====================================================

export const CourseService = {
  async getAll() {
    const response = await fetch(`${API_BASE}/courses`, {
      headers: getHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch courses');
    return response.json();
  }
};

// =====================================================
// ADMIN OPERATIONS
// =====================================================

export const AdminService = {
  async ensureSuperAdmin(email) {
    const response = await fetch(`${API_BASE}/auth/super-admin`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Failed to set super admin');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  },

  async listUsers() {
    const response = await fetch(`${API_BASE}/auth/users`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Failed to load users');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  },

  async createUser(userData) {
    const response = await fetch(`${API_BASE}/auth/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Failed to create user');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  },

  async updateUserRole(userId, role) {
    const response = await fetch(`${API_BASE}/auth/users/${userId}/role`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ role }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Failed to update role');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  }
};

// =====================================================
// GENERIC HTTP METHODS
// =====================================================

const HttpClient = {
  async get(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers: getHeaders(),
      ...options,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Request failed');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  },

  async post(endpoint, data = {}, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
      ...options,
    });
    if (!response.ok) {
      if (endpoint === '/auth/refresh') {
        authInvalid = true;
        removeFromStorage(STORAGE_KEYS.AUTH_TOKEN);
        removeFromStorage(STORAGE_KEYS.REFRESH_TOKEN);
        removeFromStorage(STORAGE_KEYS.USER);
        if (logoutHandler) {
          logoutHandler();
        }
      }
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Request failed');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  },

  async put(endpoint, data = {}, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
      ...options,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Request failed');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  },

  async delete(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders(),
      ...options,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Request failed');
      error.response = { status: response.status, data: errorData };
      throw error;
    }
    return response.json();
  }
};

export default {
  ...HttpClient,
  StudentService,
  PaymentService,
  PlacementService,
  PlacementInstallmentService,
  AuditService,
  AnalyticsService,
  BatchService,
  CourseService,
  AdminService
};
