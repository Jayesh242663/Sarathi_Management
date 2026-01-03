import { useMemo, useState, Fragment } from 'react';
import { Briefcase, Globe2, IndianRupee, TrendingUp, ChevronDown, Plus, DollarSign, Calendar, CreditCard, MessageSquare, MapPin, Building2, X, Edit2, Save } from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate, getInitials } from '../../utils/formatters';
import { COURSES } from '../../utils/constants';
import { PlacementService } from '../../services/apiService';
import './PlacementsPage.css';

const PlacementsPage = () => {
  const { getPlacementsByBatch, students, currentBatch, addPlacementInstallment, updatePlacementCosts } = useStudents();
  const { canEdit } = useAuth();
  const placements = getPlacementsByBatch();
  const [expandedId, setExpandedId] = useState(null);
  const [formState, setFormState] = useState({});
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [editingCosts, setEditingCosts] = useState(null);
  const [costForm, setCostForm] = useState({ companyCosting: '', myCosting: '' });

  const PLACEMENT_BANKS = [{ value: 'tgsb', label: 'TGSB' }];
  const getPlacementBankLabel = (value) => {
    const label = PLACEMENT_BANKS.find((b) => b.value === value)?.label;
    if (label) return label;
    const legacy = {
      hdfc_1_shmt: 'HDFC-1 (SHMT)',
      india_overseas: 'India Overseas',
      hdfc_sss: 'HDFC (SSS)',
    };
    return legacy[value] || 'N/A';
  };

  const placementsWithStudent = useMemo(() => {
    return placements.map((placement) => {
      const student = students.find((s) => s.id === placement.studentId);
      const totalPaid = (placement.installments || []).reduce((sum, inst) => sum + (inst.amount || 0), 0);
      const remainingAmount = (placement.myCosting || 0) - totalPaid;
      const isPlaceholder = !placement.company || placement.companyCosting <= 1;

      return {
        ...placement,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown Student',
        studentEmail: student?.email,
        courseLabel: COURSES.find((c) => c.value === student?.course)?.label || student?.course || 'N/A',
        installments: placement.installments || [],
        totalPaid,
        remainingAmount,
        isPlaceholder,
        collectionPercent: placement.myCosting ? Math.min(100, Math.round((totalPaid / placement.myCosting) * 100)) : 0,
      };
    });
  }, [placements, students]);

  const totals = useMemo(() => {
    const stats = placementsWithStudent.reduce(
      (acc, placement) => {
        if (!placement.isPlaceholder) {
          acc.company += placement.companyCosting || 0;
          acc.my += placement.myCosting || 0;
          acc.remaining += placement.remainingAmount || 0;
          acc.totalInstallments += (placement.installments || []).length;
          acc.totalPaid += placement.totalPaid || 0;
        }
        return acc;
      },
      { company: 0, my: 0, remaining: 0, totalInstallments: 0, totalPaid: 0 }
    );
    
    // Calculate collection percentage
    stats.collectionPercentage = stats.my > 0 ? Math.round((stats.totalPaid / stats.my) * 100) : 0;
    
    return stats;
  }, [placementsWithStudent]);

  const currentBatchLabel = currentBatch === 'all' ? 'All Batches' : currentBatch;

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getForm = (placementId) => formState[placementId] || { amount: '', date: '', method: 'cash', bankMoneyReceived: 'tgsb', country: '', remarks: '' };

  const updateForm = (placementId, key, value) => {
    setFormState((prev) => ({
      ...prev,
      [placementId]: {
        ...getForm(placementId),
        [key]: value,
      },
    }));
  };

  const handleEditCosts = (placement) => {
    setEditingCosts(placement.id);
    setCostForm({
      companyCosting: placement.companyCosting || '',
      myCosting: placement.myCosting || '',
    });
  };

  const handleSaveCosts = async (placementId) => {
    const companyCosting = Number(costForm.companyCosting);
    const myCosting = Number(costForm.myCosting);
    
    if (!companyCosting || companyCosting <= 0 || !myCosting || myCosting <= 0) {
      alert('Please enter valid amounts for both Company Costing and My Costing');
      return;
    }

    try {
      await updatePlacementCosts(placementId, { companyCosting, myCosting });
      setEditingCosts(null);
      setCostForm({ companyCosting: '', myCosting: '' });
    } catch (error) {
      console.error('Error updating costs:', error);
      alert(error.message || 'Failed to update costs. Please try again.');
    }
  };

  const handleCancelEditCosts = () => {
    setEditingCosts(null);
    setCostForm({ companyCosting: '', myCosting: '' });
  };

  const handleAddInstallment = async (placementId) => {
    const currentForm = getForm(placementId);
    const amountValue = Number(currentForm.amount);
    
    if (!amountValue || amountValue <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    console.log('Adding installment:', { placementId, currentForm, amountValue });
    
    try {
      await addPlacementInstallment(placementId, {
        amount: amountValue,
        date: currentForm.date || new Date().toISOString(),
        method: currentForm.method || 'cash',
        bankMoneyReceived: currentForm.bankMoneyReceived || 'tgsb',
        country: currentForm.country || '',
        remarks: currentForm.remarks || '',
      });

      // Keep country for subsequent payments, clear other fields
      setFormState((prev) => ({
        ...prev,
        [placementId]: { 
          amount: '', 
          date: '', 
          method: 'cash', 
          bankMoneyReceived: 'tgsb', 
          country: currentForm.country, 
          remarks: '' 
        },
      }));
    } catch (error) {
      console.error('Error adding installment:', error);
      alert(error.message || 'Failed to add installment. Please try again.');
    }
  };

  const formatMethod = (method) => {
    if (!method) return 'Unknown';
    return method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const handleInstallmentClick = (placement, installment) => {
    setSelectedInstallment({ placement, installment });
  };

  const closeInstallmentDetail = () => setSelectedInstallment(null);

  return (
    <>
    <div className="placements-page">
      {/* Header */}
      <div className="placements-header">
        <div className="placements-header-text">
          <h1>Placements</h1>
          <p>
            {currentBatch === 'all' 
              ? "Showing placements for all batches" 
              : `Batch ${currentBatch} International Placements`}
          </p>
        </div>
      </div>

      <div className="placements-stats">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Briefcase />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Placements</p>
            <p className="stat-value">{placementsWithStudent.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <IndianRupee />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Paid</p>
            <p className="stat-value green">{formatCurrency(totals.totalPaid)}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange">
            <TrendingUp />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Remaining</p>
            <p className="stat-value orange">{formatCurrency(totals.remaining)}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">
            <CreditCard />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Installments</p>
            <p className="stat-value">{totals.totalInstallments}</p>
          </div>
        </div>
      </div>

      <div className="placements-table-card">
        <div className="table-wrapper">
          <table className="placements-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Country</th>
                <th>Company Costing</th>
                <th>My Costing</th>
                <th>Paid / Remaining</th>
                <th>Placement Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {placementsWithStudent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <p className="empty-text">No placements found for this batch.</p>
                    <p className="empty-subtext">Try selecting another batch to view its placements.</p>
                  </td>
                </tr>
              ) : (
                placementsWithStudent.map((placement) => (
                  <Fragment key={placement.id}>
                    <tr>
                    <td data-label="Student">
                      <div className="student-cell">
                        <div className="student-avatar">{getInitials(placement.studentName)}</div>
                        <div className="student-info">
                          <p className="student-name">{placement.studentName}</p>
                          <p className="student-email">{placement.studentEmail || 'Email not available'}</p>
                        </div>
                      </div>
                    </td>
                    <td data-label="Country">
                      <span className="country-chip">{placement.country || '-'}</span>
                    </td>
                    <td data-label="Company Costing" className="number">
                      {editingCosts === placement.id ? (
                        <input
                          type="number"
                          className="cost-input"
                          value={costForm.companyCosting}
                          onChange={(e) => setCostForm({...costForm, companyCosting: e.target.value})}
                          placeholder="Company Cost"
                        />
                      ) : (
                        placement.isPlaceholder ? (
                          <span className="placeholder-text">Not set</span>
                        ) : (
                          formatCurrency(placement.companyCosting)
                        )
                      )}
                    </td>
                    <td data-label="My Costing" className="number">
                      {editingCosts === placement.id ? (
                        <input
                          type="number"
                          className="cost-input"
                          value={costForm.myCosting}
                          onChange={(e) => setCostForm({...costForm, myCosting: e.target.value})}
                          placeholder="My Cost"
                        />
                      ) : (
                        placement.isPlaceholder ? (
                          <span className="placeholder-text">Not set</span>
                        ) : (
                          formatCurrency(placement.myCosting)
                        )
                      )}
                    </td>
                    <td data-label="Paid / Remaining" className="number">
                      {placement.isPlaceholder ? (
                        <span className="placeholder-text">-</span>
                      ) : (
                        <div className="payment-status">
                          <span className="paid-amount">{formatCurrency(placement.totalPaid)}</span>
                          <span className="separator">/</span>
                          <span className={`remaining-amount ${placement.remainingAmount > 0 ? 'pending' : 'complete'}`}>
                            {formatCurrency(placement.remainingAmount)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td data-label="Placement Date">{formatDate(placement.placementDate)}</td>
                    <td data-label="Actions" className="text-right">
                      {editingCosts === placement.id ? (
                        <div className="edit-actions">
                          <button className="btn-save" onClick={() => handleSaveCosts(placement.id)} title="Save">
                            <Save size={16} />
                          </button>
                          <button className="btn-cancel" onClick={handleCancelEditCosts} title="Cancel">
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="action-buttons">
                          {canEdit() && placement.isPlaceholder && (
                            <button className="btn-edit-costs" onClick={() => handleEditCosts(placement)} title="Set Costs">
                              <Edit2 size={16} /> Set Costs
                            </button>
                          )}
                          {!placement.isPlaceholder && (
                            <button
                              className={`installment-toggle ${expandedId === placement.id ? 'open' : ''}`}
                              onClick={() => toggleExpand(placement.id)}
                              aria-expanded={expandedId === placement.id}
                              aria-label={`View installments for ${placement.studentName}`}
                            >
                              <span className="installment-count">{placement.installments.length} installments</span>
                              <ChevronDown />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandedId === placement.id && (
                    <tr className="installments-row">
                      <td colSpan={7}>
                        <div className="installments-card">
                          <div className="installments-header">
                            <p>{placement.studentName} · {placement.installments.length} installments</p>
                          </div>
                          <div className="installments-list">
                            {placement.installments.length === 0 ? (
                              <p className="installment-empty">No installments recorded</p>
                            ) : (
                              placement.installments.map((inst) => (
                                <button
                                  type="button"
                                  className="installment-item actionable"
                                  key={inst.id}
                                  onClick={() => handleInstallmentClick(placement, inst)}
                                >
                                  <div>
                                    <p className="installment-amount">{formatCurrency(inst.amount)}</p>
                                    <p className="installment-date">{formatDate(inst.date)}</p>
                                    {inst.remarks && <p className="installment-remarks">{inst.remarks}</p>}
                                  </div>
                                  <span className="installment-method">{formatMethod(inst.method)}</span>
                                </button>
                              ))
                            )}
                          </div>
                          {canEdit() && (
                            <div className="add-installment">
                              <div className="add-installment-header">
                                <Plus size={18} />
                                <span>Add New Installment</span>
                              </div>
                              <div className="add-installment-fields">
                                {placement.installments.length === 0 && (
                                  <div className="form-group">
                                    <label className="form-label">
                                      <MapPin size={16} />
                                      Country (first payment)
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g., USA, Canada"
                                      value={getForm(placement.id).country}
                                      onChange={(e) => updateForm(placement.id, 'country', e.target.value)}
                                    />
                                  </div>
                                )}
                                <div className="form-group">
                                  <label className="form-label">
                                    <DollarSign size={16} />
                                    Amount *
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0.00"
                                    value={getForm(placement.id).amount}
                                    onChange={(e) => updateForm(placement.id, 'amount', e.target.value)}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">
                                    <Calendar size={16} />
                                    Payment Date
                                  </label>
                                  <input
                                    type="date"
                                    value={getForm(placement.id).date}
                                    onChange={(e) => updateForm(placement.id, 'date', e.target.value)}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">
                                    <CreditCard size={16} />
                                    Payment Method
                                  </label>
                                  <select
                                    value={getForm(placement.id).method}
                                    onChange={(e) => updateForm(placement.id, 'method', e.target.value)}
                                  >
                                    <option value="cash">Cash</option>
                                    <option value="upi">UPI</option>
                                    <option value="card">Card</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="cheque">Cheque</option>
                                  </select>
                                </div>
                                {(getForm(placement.id).method === 'bank_transfer' || getForm(placement.id).method === 'upi' || getForm(placement.id).method === 'card' || getForm(placement.id).method === 'cheque') && (
                                  <div className="form-group">
                                    <label className="form-label">
                                      <Building2 size={16} />
                                      Bank Account
                                    </label>
                                    <select
                                      value={getForm(placement.id).bankMoneyReceived}
                                      onChange={(e) => updateForm(placement.id, 'bankMoneyReceived', e.target.value)}
                                      className="bank-select"
                                    >
                                      {PLACEMENT_BANKS.map((bank) => (
                                        <option key={bank.value} value={bank.value}>
                                          {bank.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <div className="form-group full-width">
                                  <label className="form-label">
                                    <MessageSquare size={16} />
                                    Remarks
                                  </label>
                                  <textarea
                                    placeholder="Add any notes or remarks (optional)"
                                    value={getForm(placement.id).remarks}
                                    onChange={(e) => updateForm(placement.id, 'remarks', e.target.value)}
                                    className="remarks-textarea"
                                    rows="2"
                                  />
                                </div>
                              </div>
                              <button
                                className="add-installment-btn"
                                onClick={() => handleAddInstallment(placement.id)}
                                aria-label={`Add installment for ${placement.studentName}`}
                              >
                                <Plus size={16} />
                                Add installment
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="placements-cards">
          {placementsWithStudent.length === 0 ? (
            <div className="placement-card empty-card">
              <p className="empty-text">No placements found for this batch.</p>
              <p className="empty-subtext">Try selecting another batch to view its placements.</p>
            </div>
          ) : (
            placementsWithStudent.map((placement) => (
              <div className="placement-card" key={placement.id}>
                <div className="placement-card-header">
                  <div className="placement-card-student">
                    <div className="student-avatar">{getInitials(placement.studentName)}</div>
                    <div className="placement-card-meta">
                      <p className="student-name">{placement.studentName}</p>
                      <p className="student-email">{placement.studentEmail || 'Email not available'}</p>
                    </div>
                  </div>
                  <div className="placement-card-badges">
                    <span className="course-chip">{placement.courseLabel}</span>
                    <span className="country-chip">{placement.country || '-'}</span>
                    <span className="date-chip">{formatDate(placement.placementDate)}</span>
                  </div>
                </div>

                <div className="placement-card-body">
                  <div className="placement-card-grid two-by-two">
                    <div className="placement-card-stat">
                      <span className="label">Company Costing</span>
                      {editingCosts === placement.id ? (
                        <input
                          type="number"
                          className="cost-input"
                          value={costForm.companyCosting}
                          onChange={(e) => setCostForm({ ...costForm, companyCosting: e.target.value })}
                          placeholder="Company Cost"
                        />
                      ) : (
                        <span className="value">{placement.isPlaceholder ? 'Not set' : formatCurrency(placement.companyCosting)}</span>
                      )}
                    </div>
                    <div className="placement-card-stat">
                      <span className="label">My Costing</span>
                      {editingCosts === placement.id ? (
                        <input
                          type="number"
                          className="cost-input"
                          value={costForm.myCosting}
                          onChange={(e) => setCostForm({ ...costForm, myCosting: e.target.value })}
                          placeholder="My Cost"
                        />
                      ) : (
                        <span className="value">{placement.isPlaceholder ? 'Not set' : formatCurrency(placement.myCosting)}</span>
                      )}
                    </div>
                    <div className="placement-card-stat">
                      <span className="label">Paid</span>
                      <span className="value paid">{placement.isPlaceholder ? '-' : formatCurrency(placement.totalPaid)}</span>
                    </div>
                    <div className="placement-card-stat">
                      <span className="label">Remaining</span>
                      <span className={`value remaining ${placement.remainingAmount > 0 ? 'pending' : 'complete'}`}>
                        {placement.isPlaceholder ? '-' : formatCurrency(placement.remainingAmount)}
                      </span>
                    </div>
                  </div>
                  <div className="placement-card-row inline">
                    <span className="label">Installments</span>
                    <span className="value">{placement.installments.length}</span>
                  </div>
                </div>

                <div className="placement-card-actions">
                  {editingCosts === placement.id ? (
                    <>
                      <button className="btn-save" onClick={() => handleSaveCosts(placement.id)} title="Save">
                        <Save size={16} />
                        Save
                      </button>
                      <button className="btn-cancel" onClick={handleCancelEditCosts} title="Cancel">
                        <X size={16} />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {canEdit() && placement.isPlaceholder && (
                        <button className="btn-edit-costs" onClick={() => handleEditCosts(placement)} title="Set Costs">
                          <Edit2 size={16} /> Set Costs
                        </button>
                      )}
                      {!placement.isPlaceholder && (
                        <button
                          className={`installment-toggle ${expandedId === placement.id ? 'open' : ''}`}
                          onClick={() => toggleExpand(placement.id)}
                          aria-expanded={expandedId === placement.id}
                          aria-label={`View installments for ${placement.studentName}`}
                        >
                          <span className="installment-count">{placement.installments.length} installments</span>
                          <ChevronDown />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {expandedId === placement.id && (
                  <div className="installments-card mobile">
                    <div className="installments-header">
                      <p>{placement.studentName} · {placement.installments.length} installments</p>
                    </div>
                    <div className="installments-list">
                      {placement.installments.length === 0 ? (
                        <p className="installment-empty">No installments recorded</p>
                      ) : (
                        placement.installments.map((inst) => (
                          <button
                            type="button"
                            className="installment-item actionable"
                            key={inst.id}
                            onClick={() => handleInstallmentClick(placement, inst)}
                          >
                            <div>
                              <p className="installment-amount">{formatCurrency(inst.amount)}</p>
                              <p className="installment-date">{formatDate(inst.date)}</p>
                              {inst.remarks && <p className="installment-remarks">{inst.remarks}</p>}
                            </div>
                            <span className="installment-method">{formatMethod(inst.method)}</span>
                          </button>
                        ))
                      )}
                    </div>
                    {canEdit() && (
                      <div className="add-installment">
                        <div className="add-installment-header">
                          <Plus size={18} />
                          <span>Add New Installment</span>
                        </div>
                        <div className="add-installment-fields">
                          {placement.installments.length === 0 && (
                            <div className="form-group">
                              <label className="form-label">
                                <MapPin size={16} />
                                Country (first payment)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g., USA, Canada"
                                value={getForm(placement.id).country}
                                onChange={(e) => updateForm(placement.id, 'country', e.target.value)}
                              />
                            </div>
                          )}
                          <div className="form-group">
                            <label className="form-label">
                              <DollarSign size={16} />
                              Amount *
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="0.00"
                              value={getForm(placement.id).amount}
                              onChange={(e) => updateForm(placement.id, 'amount', e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">
                              <Calendar size={16} />
                              Payment Date
                            </label>
                            <input
                              type="date"
                              value={getForm(placement.id).date}
                              onChange={(e) => updateForm(placement.id, 'date', e.target.value)}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">
                              <CreditCard size={16} />
                              Payment Method
                            </label>
                            <select
                              value={getForm(placement.id).method}
                              onChange={(e) => updateForm(placement.id, 'method', e.target.value)}
                            >
                              <option value="cash">Cash</option>
                              <option value="upi">UPI</option>
                              <option value="card">Card</option>
                              <option value="bank_transfer">Bank Transfer</option>
                              <option value="cheque">Cheque</option>
                            </select>
                          </div>
                          {(getForm(placement.id).method === 'bank_transfer' || getForm(placement.id).method === 'upi' || getForm(placement.id).method === 'card' || getForm(placement.id).method === 'cheque') && (
                            <div className="form-group">
                              <label className="form-label">
                                <Building2 size={16} />
                                Bank Account
                              </label>
                              <select
                                value={getForm(placement.id).bankMoneyReceived}
                                onChange={(e) => updateForm(placement.id, 'bankMoneyReceived', e.target.value)}
                                className="bank-select"
                              >
                                {PLACEMENT_BANKS.map((bank) => (
                                  <option key={bank.value} value={bank.value}>
                                    {bank.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className="form-group full-width">
                            <label className="form-label">
                              <MessageSquare size={16} />
                              Remarks
                            </label>
                            <textarea
                              placeholder="Add any notes or remarks (optional)"
                              value={getForm(placement.id).remarks}
                              onChange={(e) => updateForm(placement.id, 'remarks', e.target.value)}
                              className="remarks-textarea"
                              rows="2"
                            />
                          </div>
                        </div>
                        <button
                          className="add-installment-btn"
                          onClick={() => handleAddInstallment(placement.id)}
                          aria-label={`Add installment for ${placement.studentName}`}
                        >
                          <Plus size={16} />
                          Add installment
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>

    {selectedInstallment && (
      <div className="installment-detail-overlay" role="dialog" aria-modal="true">
        <div className="installment-detail-card">
          <div className="installment-detail-header">
            <div>
              <p className="installment-detail-title">{selectedInstallment.placement.studentName}</p>
              <p className="installment-detail-subtitle">Installment details</p>
            </div>
            <button className="installment-detail-close" onClick={closeInstallmentDetail} aria-label="Close details">
              <X size={18} />
            </button>
          </div>

          <div className="installment-detail-grid">
            <div className="installment-detail-row">
              <span className="installment-detail-label">Amount</span>
              <span className="installment-detail-value">{formatCurrency(selectedInstallment.installment.amount)}</span>
            </div>
            <div className="installment-detail-row">
              <span className="installment-detail-label">Date</span>
              <span className="installment-detail-value">{formatDate(selectedInstallment.installment.date)}</span>
            </div>
            <div className="installment-detail-row">
              <span className="installment-detail-label">Payment Method</span>
              <span className="installment-detail-value">{formatMethod(selectedInstallment.installment.method)}</span>
            </div>
            <div className="installment-detail-row">
              <span className="installment-detail-label">Course</span>
              <span className="installment-detail-value">{selectedInstallment.placement.courseLabel}</span>
            </div>
            {selectedInstallment.installment.bankMoneyReceived && (
              <div className="installment-detail-row">
                <span className="installment-detail-label">Bank</span>
                <span className="installment-detail-value">
                  {getPlacementBankLabel(selectedInstallment.installment.bankMoneyReceived)}
                </span>
              </div>
            )}
            {selectedInstallment.installment.remarks && (
              <div className="installment-detail-row full">
                <span className="installment-detail-label">Remarks</span>
                <span className="installment-detail-value remarks">{selectedInstallment.installment.remarks}</span>
              </div>
            )}
            <div className="installment-detail-row full">
              <span className="installment-detail-label">Placement</span>
              <span className="installment-detail-value">{selectedInstallment.placement.country} • {formatCurrency(selectedInstallment.placement.myCosting)}</span>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default PlacementsPage;
