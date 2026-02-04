import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, 
  User,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';
import logo from '../../assets/favicon.png';


const Navbar = ({ onMenuClick, onToggleCollapse, sidebarCollapsed }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Get page title based on route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/admin')) return 'User Management';
    if (path.startsWith('/students')) return 'Students';
    if (path.startsWith('/fees')) return 'Fees';
    if (path.startsWith('/reports')) return 'Reports';
    if (path.startsWith('/placements')) return 'Placements';
    return 'Dashboard';
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <button onClick={onMenuClick} className="navbar-menu-btn">
          <Menu />
        </button>

        <button onClick={onToggleCollapse} className="navbar-collapse-btn" title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
        </button>
        
        {/* Brand Logo - Mobile */}
        <div className="navbar-brand-mobile">
          <div className="navbar-brand-icon">
            <img
              src={logo}
              alt="SHMCT Logo"
              className="navbar-logo"
            />
          </div>
          <span>SHMCT</span>
        </div>

        {/* Page Title & Breadcrumb */}
        <div className="navbar-page-info">
          <h2 className="navbar-page-title">{getPageTitle()}</h2>
          <p className="navbar-page-subtitle">Manage your institute efficiently</p>
        </div>
      </div>

      <div className="navbar-right">
        {/* User Menu */}
        <div className="navbar-user">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="navbar-user-btn"
            aria-label="User menu"
            title={`${user?.name || 'User'} - ${user?.role === 'administrator' ? 'Administrator' : user?.role === 'auditor' ? 'Auditor' : 'User'}`}
          >
            <div className="navbar-user-avatar">
              {user?.name ? user.name.charAt(0).toUpperCase() : <User />}
            </div>
            <div className="navbar-user-info">
              <p className="navbar-user-name">
                {user?.name || user?.email?.split('@')[0] || 'Account User'}
              </p>
              <p className="navbar-user-role">
                {user?.role === 'administrator' ? 'System Administrator' : user?.role === 'auditor' ? 'Auditor Access' : 'User Account'}
              </p>
            </div>
            <span className={`navbar-user-chevron ${showUserMenu ? 'open' : ''}`}>
              <ChevronDown />
            </span>
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <>
              <div 
                className="navbar-dropdown-overlay" 
                onClick={() => setShowUserMenu(false)}
              />
              <div className="navbar-dropdown">
                <div className="navbar-dropdown-header">
                  <div className="navbar-dropdown-avatar">
                    {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
                  </div>
                  <div className="navbar-dropdown-info">
                    <p className="name">{user?.role === 'administrator' ? 'System Administrator' : user?.role === 'auditor' ? 'Auditor Access' : 'User Account'}</p>
                    <p className="email">{user?.email || 'user@shmct.com'}</p>
                    <p className="role-badge">
                      {user?.name || 'Account User'}
                    </p>
                  </div>
                </div>
                <div className="navbar-dropdown-divider" />
                <div className="navbar-dropdown-menu">
                  {user?.role === 'administrator' && (
                    <button 
                      onClick={() => {
                        navigate('/admin/super-admin');
                        setShowUserMenu(false);
                      }} 
                      className="navbar-dropdown-item"
                      title="Manage users and roles"
                    >
                      <ShieldCheck size={18} />
                      <span>User Management</span>
                    </button>
                  )}
                  <button onClick={handleLogout} className="navbar-dropdown-item logout">
                    <LogOut />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
