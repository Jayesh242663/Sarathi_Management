import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  FileText, 
  X, 
  LogOut,
  Calendar,
  Plus,
  Trash2,
  ClipboardList,
  Briefcase,
  ShieldCheck,
  Menu,
  ChevronLeft,
  ChevronRight,
  Wallet
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStudents } from '../../context/StudentContext';
import { BatchService } from '../../services/apiService';
import './Sidebar.css';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/students', label: 'Students', icon: Users },
  { path: '/fees', label: 'Fees & Payments', icon: CreditCard },
  { path: '/expenses', label: 'Expenses', icon: Wallet },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/placements', label: 'Placements', icon: Briefcase },
  { path: '/audit', label: 'Audit Log', icon: ClipboardList },
  { path: '/admin/super-admin', label: 'User Management', icon: ShieldCheck, roles: ['administrator'] },
];

const Sidebar = ({ isOpen, onClose, isCollapsed, onToggleCollapse, onMenuClick }) => {
  const { logout, user } = useAuth();
  const { currentBatch, setCurrentBatch, customBatches, addCustomBatch, removeCustomBatch, batches, loadSupabaseData } = useStudents();
  const navigate = useNavigate();
  
  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [newBatchStart, setNewBatchStart] = useState('');
  const [batchError, setBatchError] = useState('');
  const [isAddingBatch, setIsAddingBatch] = useState(false);
  
  // Convert Supabase batches to dropdown format
  const supabaseBatches = (batches || []).map((b) => ({
    value: b.batch_name,
    label: b.batch_name,
  }));
  
  // Combine Supabase batches with custom batches, avoiding duplicates
  const allBatches = [...supabaseBatches];
  customBatches.forEach((cb) => {
    if (!allBatches.some((b) => b.value === cb.value)) {
      allBatches.push(cb);
    }
  });
  
  // Sort batches by year (descending)
  allBatches.sort((a, b) => {
    const yearA = parseInt(a.value.split('-')[0]);
    const yearB = parseInt(b.value.split('-')[0]);
    return yearB - yearA;
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBatchChange = (e) => {
    setCurrentBatch(e.target.value);
  };
  
  const handleAddBatch = async () => {
    setBatchError('');
    const year = parseInt(newBatchStart);
    
    if (!year || isNaN(year) || year < 2000 || year > 2100) {
      setBatchError('Please enter a valid year (2000-2100)');
      return;
    }
    
    const batchValue = `${year}-${(year + 1).toString().slice(-2)}`;
    
    // Check if batch already exists
    if (allBatches.some((b) => b.value === batchValue)) {
      setBatchError('This batch already exists');
      return;
    }
    
    try {
      setIsAddingBatch(true);
      
      // Create batch in Supabase
      await BatchService.create({
        batch_name: batchValue,
        start_year: year,
        end_year: year + 1,
        is_active: true
      });
      
      // Reload data from Supabase to get the new batch
      await loadSupabaseData();
      
      // Set as current batch
      setCurrentBatch(batchValue);
      
      setNewBatchStart('');
      setShowAddBatchModal(false);
    } catch (error) {
      console.error('Failed to add batch:', error);
      setBatchError(error.message || 'Failed to add batch. Please try again.');
    } finally {
      setIsAddingBatch(false);
    }
  };
  
  const isCustomBatch = (batchValue) => {
    return customBatches.some((b) => b.value === batchValue);
  };

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        {/* Logo */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <h1>SHMCT<span>®</span></h1>
          </div>
          <div className="sidebar-header-buttons">
            <button onClick={onToggleCollapse} className="sidebar-collapse-btn" title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
            </button>
            <button onClick={onClose} className="sidebar-close">
              <X />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {/* Batch Selector */}
          <div className="sidebar-batch-selector">
            <div className="batch-selector-label">
              <Calendar />
              <span>Academic Batch</span>
              <button 
                className="add-batch-btn"
                onClick={() => setShowAddBatchModal(true)}
                title="Add new batch"
              >
                <Plus size={14} />
              </button>
            </div>
            <select 
              value={currentBatch || 'all'} 
              onChange={handleBatchChange}
              className="batch-select"
            >
              <option value="all">All Batches</option>
              {allBatches.length === 0 && (
                <option disabled>No batches available - Add one using + button</option>
              )}
              {allBatches.map((batch) => (
                <option key={batch.value} value={batch.value}>
                  {batch.label}
                </option>
              ))}
            </select>
            {/* Show delete button for custom batches */}
            {isCustomBatch(currentBatch) && (
              <button 
                className="remove-batch-btn"
                onClick={() => {
                  removeCustomBatch(currentBatch);
                  setCurrentBatch('all');
                }}
                title="Remove this custom batch"
              >
                <Trash2 size={14} />
                <span>Remove batch</span>
              </button>
            )}
          </div>
          
          {navItems
            .filter((item) => !item.roles || item.roles.includes(user?.role))
            .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => 
                `sidebar-nav-link ${isActive ? 'active' : ''}`
              }
            >
              <item.icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="sidebar-footer-btn logout">
            <LogOut />
            <span>Logout</span>
          </button>
        </div>
      </aside>
      
      {/* Add Batch Modal */}
      {showAddBatchModal && (
        <div className="batch-modal-overlay" onClick={() => setShowAddBatchModal(false)}>
          <div className="batch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="batch-modal-header">
              <h3>Add New Batch</h3>
              <button onClick={() => setShowAddBatchModal(false)} className="batch-modal-close">
                <X size={18} />
              </button>
            </div>
            <div className="batch-modal-body">
              <label className="batch-modal-label">
                Enter starting year
                <span className="batch-modal-hint">e.g., 2026 for batch 2026-27</span>
              </label>
              <input
                type="number"
                placeholder="2026"
                value={newBatchStart}
                onChange={(e) => setNewBatchStart(e.target.value)}
                className="batch-modal-input"
                min="2000"
                max="2100"
                disabled={isAddingBatch}
              />
              {batchError && <p className="batch-modal-error">{batchError}</p>}
            </div>
            <div className="batch-modal-footer">
              <button 
                className="batch-modal-btn cancel"
                onClick={() => setShowAddBatchModal(false)}
                disabled={isAddingBatch}
              >
                Cancel
              </button>
              <button 
                className="batch-modal-btn confirm"
                onClick={handleAddBatch}
                disabled={isAddingBatch}
              >
                {isAddingBatch ? 'Adding...' : 'Add Batch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
