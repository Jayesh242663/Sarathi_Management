import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, UserPlus, Mail, Lock, KeyRound, Users2 } from 'lucide-react';
import Toast from '../../components/ui/Toast';
import { AdminService } from '../../services/apiService';
import { useAuth } from '../../context/AuthContext';
import './SuperAdminSetup.css';

const initialForm = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'administrator',
};

const roleCopy = {
  administrator: 'Full access to create users, manage roles, and edit institute data.',
  auditor: 'Read-only access for oversight without modification rights.',
};

const SuperAdminSetup = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const isAdmin = useMemo(() => user?.role === 'administrator', [user]);

  useEffect(() => {
    if (!isAdmin) return;
    const handleAuthError = async (err) => {
      if (err?.response?.status === 401) {
        setError('Session expired. Please sign in again.');
        await logout();
        navigate('/login');
        return true;
      }
      return false;
    };

    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const response = await AdminService.listUsers();
        setUsers(response.users || []);
      } catch (err) {
        const handled = await handleAuthError(err);
        if (!handled) {
          setError(err.message || 'Failed to load users');
        }
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [isAdmin, logout, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.email || !form.password) {
      setError('Email and password are required');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        role: form.role,
      };

      const response = await AdminService.createUser(payload);
      setSuccess('User created successfully');
      setForm(initialForm);
      if (response?.user) {
        setUsers((prev) => [response.user, ...prev]);
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        setError('Session expired. Please sign in again.');
        await logout();
        navigate('/login');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to create user');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="super-admin-page">
      <Toast message={error} type="error" onClose={() => setError('')} />
      <Toast message={success} type="success" onClose={() => setSuccess('')} />

      <div className="super-admin-grid">
        <section className="super-admin-card card">
          <header className="card-header">
            <div className="card-title">
              <ShieldCheck />
              <div>
                <p className="eyebrow">Privileged access</p>
                <h2>Manage platform users</h2>
              </div>
            </div>
            <span className="pill">Signed in as {user?.email}</span>
          </header>

          <p className="card-subtitle">
            Only administrators can create new accounts. Use your trusted email (jayeshchanne9@gmail.com) to stay in control.
          </p>

          <hr className="card-divider" />

          <form className="user-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Full name</label>
              <div className="input">
                <UserPlus size={18} />
                <input
                  type="text"
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="Priya Sharma"
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="field">
              <label>Email</label>
              <div className="input">
                <Mail size={18} />
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="user@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label>Password</label>
                <div className="input">
                  <Lock size={18} />
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label>Confirm password</label>
                <div className="input">
                  <KeyRound size={18} />
                  <input
                    type="password"
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label>Role / privileges</label>
              <div className="role-select">
                <select name="role" value={form.role} onChange={handleChange}>
                  <option value="administrator">Administrator (full access)</option>
                  <option value="auditor">Auditor (read only)</option>
                </select>
                <p className="role-copy">{roleCopy[form.role]}</p>
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating user...' : 'Create user'}
            </button>
          </form>
        </section>

        <section className="super-admin-card card">
          <header className="card-header">
            <div className="card-title">
              <Users2 />
              <div>
                <p className="eyebrow">Current users</p>
                <h2>Role directory</h2>
              </div>
            </div>
          </header>

          <hr className="card-divider" />

          {loadingUsers ? (
            <p className="muted">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="muted">No users found yet.</p>
          ) : (
            <ul className="user-list">
              {users.map((u) => (
                <li key={u.id} className="user-row">
                  <div>
                    <p className="user-name">{u.full_name || u.fullName || 'Unnamed user'}</p>
                    <p className="user-meta">{u.id}</p>
                  </div>
                  <span className={`pill ${u.role === 'administrator' ? 'pill-success' : 'pill-info'}`}>
                    {u.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default SuperAdminSetup;
