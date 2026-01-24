import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './context/AuthContext';
import { StudentProvider } from './context/StudentContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';
import ScrollToTop from './components/layout/ScrollToTop';

// Route-level code splitting
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const StudentList = lazy(() => import('./pages/students/StudentList'));
const StudentForm = lazy(() => import('./pages/students/StudentForm'));
const StudentDetail = lazy(() => import('./pages/students/StudentDetail'));
const FeesPage = lazy(() => import('./pages/fees/FeesPage'));
const ExpensesPage = lazy(() => import('./pages/expenses/ExpensesPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const AuditPage = lazy(() => import('./pages/audit/AuditPage'));
const PlacementsPage = lazy(() => import('./pages/placements/PlacementsPage'));
const SuperAdminSetup = lazy(() => import('./pages/admin/SuperAdminSetup'));

function App() {
  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <StudentProvider>
          <Suspense fallback={<div style={{padding:'2rem', color:'#fff'}}>Loading...</div>}>
            <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Dashboard />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/students"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <StudentList />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/students/new"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <StudentForm />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/students/:id"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <StudentDetail />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/students/:id/edit"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <StudentForm />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/fees"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <FeesPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/expenses"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <ExpensesPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <ReportsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/placements"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <PlacementsPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/audit"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <AuditPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/super-admin"
              element={
                <ProtectedRoute allowedRoles={['administrator']}>
                  <MainLayout>
                    <SuperAdminSetup />
                  </MainLayout>
                </ProtectedRoute>
              }
            />
            
            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </StudentProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
