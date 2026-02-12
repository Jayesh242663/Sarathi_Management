import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  BookOpen, 
  Search, 
  Calendar, 
  Download,
  Printer,
  IndianRupee,
  TrendingUp,
  ArrowRightLeft,
  Trash2,
  CheckSquare,
  Square
} from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { AuditService } from '../../services/apiService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import './AuditPage.css';

const AuditPage = () => {
  const { getAuditLog, auditLog } = useStudents();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortOption, setSortOption] = useState('date-newest'); // date-newest, date-oldest, name-asc, name-desc
  const [highlightedId, setHighlightedId] = useState(null);
  const rowRefs = useRef({});
  
  // Selection state for bulk delete
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Filter audit log based on current filters - Default to FINANCIAL RECORDS ONLY
  const [showAllEntries, setShowAllEntries] = useState(false);

  // Handle navigation from receipt item with highlight
  useEffect(() => {
    if (location.state?.highlightPaymentId) {
      const targetId = location.state.highlightPaymentId;
      // Find the audit entry by matching payment ID in entity_id
      const targetEntry = auditLog.find((entry) =>
        entry.entityType === 'PAYMENT' && entry.entityId === targetId
      );

      if (targetEntry) {
        setHighlightedId(targetEntry.id);
      }

      // Clear navigation state
      window.history.replaceState({}, document.title);
    }
  }, [location.state, auditLog]);

  const filteredAuditLog = useMemo(() => {
    let filters = {};
    
    if (actionFilter !== 'all') {
      filters.action = actionFilter;
    }
    if (dateRange.start) {
      filters.startDate = dateRange.start;
    }
    if (dateRange.end) {
      filters.endDate = dateRange.end;
    }
    if (searchTerm) {
      filters.search = searchTerm;
    }
    
    // Get all audit logs matching the filters
    const allLogs = getAuditLog(filters);

    if (showAllEntries) {
      return allLogs;
    }

    // Financial-only view
    const financialLogs = allLogs.filter(entry => (
      entry.entityType === 'PAYMENT' ||
      entry.action === 'PAYMENT' ||
      entry.action === 'PLACEMENT_PAYMENT' ||
      entry.action === 'COMPANY_PAYMENT_DEBIT' ||
      entry.action === 'REFUND' ||
      entry.action === 'ADJUSTMENT' ||
      entry.action === 'SCHOLARSHIP' ||
      entry.action === 'DISCOUNT'
    ));
    return financialLogs;
  }, [getAuditLog, searchTerm, actionFilter, dateRange, showAllEntries, auditLog.length]);

  // Calculate running balance and totals
  const ledgerData = useMemo(() => {
    // Opening balance removed
    const openingBalance = 0;
    let runningBalance = 0;
    let totalCredits = 0;
    let totalDebits = 0;

    // Sort by timestamp ascending for running balance calculation
    let sortedLog = [...filteredAuditLog].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    const entries = sortedLog.map((entry, index) => {
      const isCredit = entry.action === 'PAYMENT' || entry.action === 'RECEIPT' || entry.action === 'PLACEMENT_PAYMENT';
      const isDebit = entry.action === 'REFUND' || entry.action === 'ADJUSTMENT' || 
                      entry.action === 'SCHOLARSHIP' || entry.action === 'DISCOUNT' ||
                      entry.action === 'COMPANY_PAYMENT_DEBIT';
      const amount = entry.amount || entry.details?.amount || 0;
      
      if (isCredit) {
        totalCredits += amount;
        runningBalance += amount;
      } else if (isDebit) {
        totalDebits += amount;
        runningBalance -= amount;
      }
      
      return {
        ...entry,
        serialNo: index + 1,
        credit: isCredit ? amount : null,
        debit: isDebit ? amount : null,
        balance: Math.max(0, runningBalance), // Prevent negative display
      };
    });

    // Apply sort option to display order (but maintain running balance based on chronological order)
    let displayEntries = [...entries.reverse()]; // Reverse to show newest first by default
    
    if (sortOption === 'date-oldest') {
      displayEntries = displayEntries.reverse(); // Oldest first
    } else if (sortOption === 'name-asc') {
      displayEntries = displayEntries.sort((a, b) => 
        (a.entityName || '').localeCompare(b.entityName || '')
      );
    } else if (sortOption === 'name-desc') {
      displayEntries = displayEntries.sort((a, b) => 
        (b.entityName || '').localeCompare(a.entityName || '')
      );
    }

    return {
      entries: displayEntries,
      totalCredits,
      totalDebits,
      openingBalance,
      closingBalance: Math.max(0, runningBalance),
    };
  }, [filteredAuditLog, sortOption]);

  // Scroll to highlighted row after it's rendered
  useEffect(() => {
    if (highlightedId) {
      // Wait for DOM to update with filtered/sorted data
      setTimeout(() => {
        const rowElement = rowRefs.current[highlightedId];
        if (rowElement) {
          rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);

      // Remove highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedId(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [highlightedId, ledgerData.entries]);

  const handleExportCSV = () => {
    const headers = ['Sr. No.', 'Date', 'Voucher No.', 'Particulars', 'Type', 'Method/Bank', 'Remarks', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs.)'];
    
    // No opening balance row
    const rows = [];
    
    // Add transaction rows
    const paymentMethods = {
      cash: 'Cash',
      upi: 'UPI',
      card: 'Card',
      bank_transfer: 'Bank Transfer',
      cheque: 'Cheque',
    };
    const bankAccounts = {
      hdfc_1_shmt: 'HDFC-1 (SHMT)',
      hdfc_sss: 'HDFC (SSS)',
      india_overseas: 'India Overseas',
      tgsb: 'TGSB',
    };
    
    ledgerData.entries.forEach((entry) => {
      const txnType = getTransactionType(entry.action);
      let methodBank = '-';
      if (entry.details?.paymentMethod) {
        methodBank = paymentMethods[entry.details.paymentMethod] || entry.details.paymentMethod;
        // Show bank account only for UPI, Card, Bank Transfer, and Cheque
        const bankShowMethods = ['upi', 'card', 'bank_transfer', 'cheque'];
        if (entry.details.bankMoneyReceived && bankShowMethods.includes(entry.details.paymentMethod)) {
          methodBank += ' / ' + (bankAccounts[entry.details.bankMoneyReceived] || entry.details.bankMoneyReceived);
        }
      }
      
      rows.push([
        entry.serialNo,
        formatDate(entry.timestamp),
        entry.details?.receiptNumber || entry.details?.voucherNumber || '-',
        entry.entityName || '-',
        txnType.label,
        methodBank,
        `${getTransactionNarration(entry)}${entry.details?.remarks ? ' | ' + entry.details.remarks : ''}`,
        entry.debit ? entry.debit : '',
        entry.credit ? entry.credit : '',
        entry.balance,
      ]);
    });
    
    // Add totals row
    rows.push([
      '',
      '',
      '',
      'TOTAL',
      '',
      '',
      '',
      ledgerData.totalDebits > 0 ? ledgerData.totalDebits : '',
      ledgerData.totalCredits,
      ledgerData.closingBalance,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const resetFilters = () => {
    setSearchTerm('');
    setActionFilter('all');
    setDateRange({ start: '', end: '' });
    setSortOption('date-newest');
  };

  const getTransactionNarration = (entry) => {
    const paymentMethods = {
      cash: 'Cash',
      upi: 'UPI/Online Transfer',
      card: 'Card Payment',
      bank_transfer: 'NEFT/RTGS',
      cheque: 'Cheque',
    };

    const bankAccounts = {
      hdfc_1_shmt: 'HDFC-1 (SHMT)',
      hdfc_sss: 'HDFC (SSS)',
      india_overseas: 'India Overseas',
      tgsb: 'TGSB',
    };

    switch (entry.action) {
      case 'PAYMENT':
      case 'RECEIPT':
      case 'PLACEMENT_PAYMENT':
        const method = paymentMethods[entry.details?.paymentMethod] || entry.details?.paymentMethod || 'N/A';
        // Show bank account only for UPI, Card, Bank Transfer, and Cheque
        const bankShowMethods = ['upi', 'card', 'bank_transfer', 'cheque'];
        const bank = entry.details?.bankMoneyReceived && bankShowMethods.includes(entry.details?.paymentMethod) ? ` [${bankAccounts[entry.details.bankMoneyReceived] || 'Bank Account'}]` : '';
        const remarks = entry.details?.remarks ? `Remark: ${entry.details.remarks}` : (entry.action === 'PLACEMENT_PAYMENT' ? 'Placement fee collection' : 'Fee collection');
        return `Being ${(entry.action === 'PLACEMENT_PAYMENT') ? 'placement fee' : 'fee'} collection received by ${method}${bank} - ${remarks}`;
      case 'COMPANY_PAYMENT_DEBIT':
        const companyMethod = paymentMethods[entry.details?.paymentMethod] || entry.details?.paymentMethod || 'N/A';
        const companyBankShowMethods = ['upi', 'card', 'bank_transfer', 'cheque'];
        const companyBank = entry.details?.bankMoneyReceived && companyBankShowMethods.includes(entry.details?.paymentMethod) ? ` [${bankAccounts[entry.details.bankMoneyReceived] || 'Bank Account'}]` : '';
        const companyCheque = entry.details?.chequeNumber ? ` (Cheque #${entry.details.chequeNumber})` : '';
        const companyRemarks = entry.details?.remarks ? `Remark: ${entry.details.remarks}` : 'Company placement payment';
        const studentName = entry.details?.studentName || entry.entityName?.split(' - ')[0] || 'Student';
        return `Being payment to company for ${studentName}'s placement via ${companyMethod}${companyBank}${companyCheque} - ${companyRemarks}`;
      case 'REFUND':
        return `Being refund processed - ${entry.details?.reason || 'Fee refund'} via ${paymentMethods[entry.details?.refundMethod] || 'Bank Transfer'}`;
      case 'SCHOLARSHIP':
        return `Being scholarship/financial aid granted - ${entry.details?.scholarshipName || 'Merit scholarship'} (${entry.details?.percentage || '50'}% waiver)`;
      case 'ADJUSTMENT':
        return `Being fee adjustment entry - ${entry.details?.reason || 'Account correction/rectification'}`;
      case 'DISCOUNT':
        return `Being discount allowed - ${entry.details?.discountType || 'Special concession'} (${entry.details?.reason || 'Early payment'})`;
      case 'CREATE':
        const course = entry.details?.course?.replace(/_/g, ' ').toUpperCase() || 'Course';
        return `Being new student admission - ${course} programme (${entry.details?.batch || '2023-24'})`;
      case 'UPDATE':
        const fields = entry.details?.updatedFields?.join(', ') || 'General update';
        return `Being student record amendment - Updated: ${fields}`;
      case 'DELETE':
        return `Being student record removed - Reason: ${entry.details?.reason || 'Administrative decision'}`;
      default:
        return entry.details?.remarks || 'General entry';
    }
  };

  const getTransactionType = (action) => {
    switch (action) {
      case 'PAYMENT':
      case 'RECEIPT': return { label: 'Receipt', class: 'receipt' };
      case 'PLACEMENT_PAYMENT': return { label: 'Placement Receipt', class: 'placement-receipt' };
      case 'COMPANY_PAYMENT_DEBIT': return { label: 'Company Payment', class: 'company-payment' };
      case 'REFUND': return { label: 'Refund', class: 'refund' };
      case 'SCHOLARSHIP': return { label: 'Scholarship', class: 'scholarship' };
      case 'ADJUSTMENT': return { label: 'Adjustment', class: 'adjustment' };
      case 'DISCOUNT': return { label: 'Discount', class: 'discount' };
      case 'CREATE': return { label: 'Entry', class: 'entry' };
      case 'UPDATE': return { label: 'Amendment', class: 'amendment' };
      case 'DELETE': return { label: 'Removal', class: 'removal' };
      default: return { label: 'Misc', class: 'misc' };
    }
  };

  const formatLedgerDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(ledgerData.entries.map(entry => entry.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    setIsDeleting(true);
    try {
      await AuditService.bulkDelete(selectedIds);
      
      // Refresh the audit log data
      window.location.reload(); // Simple refresh, or you can update context
      
      setSelectedIds([]);
      setShowDeleteModal(false);
      alert(`Successfully deleted ${selectedIds.length} audit log entries`);
    } catch (error) {
      console.error('Failed to delete audit logs:', error);
      alert(`Failed to delete audit logs: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="ledger-page">
      {/* Header - Match Placements header */}
      <div className="placements-header">
        <div className="placements-header-text">
          <h1>General Ledger</h1>
          <p>Complete financial record across all batches</p>
        </div>
      </div>

      <div className="ledger-actions no-print" style={{ marginBottom: '1rem' }}>
        {selectedIds.length > 0 && (
          <button 
            className="ledger-btn delete-btn" 
            onClick={() => setShowDeleteModal(true)}
            style={{ 
              backgroundColor: '#dc3545', 
              color: 'white',
              marginRight: '0.5rem'
            }}
          >
            <Trash2 size={16} />
            Delete Selected ({selectedIds.length})
          </button>
        )}
        <button className="ledger-btn" onClick={handleExportCSV} disabled={ledgerData.entries.length === 0}>
          <Download size={16} />
          Export
        </button>
        <button className="ledger-btn" onClick={handlePrint}>
          <Printer size={16} />
          Print
        </button>
      </div>

      {/* Summary Cards - Like account summary */}
      <div className="ledger-summary">
        <div className="summary-card opening">
          <div className="summary-icon">
            <ArrowRightLeft size={20} />
          </div>
          <div className="summary-content">
            <span className="summary-label">Total Entries</span>
            <span className="summary-value">{filteredAuditLog.length}</span>
          </div>
        </div>
        <div className="summary-card credit">
          <div className="summary-icon">
            <TrendingUp size={20} />
          </div>
          <div className="summary-content">
            <span className="summary-label">Total Receipts (Cr.)</span>
            <span className="summary-value">{formatCurrency(ledgerData.totalCredits)}</span>
          </div>
        </div>
        <div className="summary-card debit">
          <div className="summary-icon">
            <ArrowRightLeft size={20} />
          </div>
          <div className="summary-content">
            <span className="summary-label">Total Debits (Dr.)</span>
            <span className="summary-value">{formatCurrency(ledgerData.totalDebits)}</span>
          </div>
        </div>
        <div className="summary-card balance">
          <div className="summary-icon">
            <IndianRupee size={20} />
          </div>
          <div className="summary-content">
            <span className="summary-label">Closing Balance</span>
            <span className="summary-value">{formatCurrency(ledgerData.closingBalance)}</span>
          </div>
        </div>
      </div>

      {/* Filters - Styled like form fields */}
      <div className="ledger-filters no-print">
        <div className="filter-row">
          <div className="filter-field search-field">
            <label>Search Particulars</label>
            <div className="input-with-icon">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by name or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="filter-field">
            <label>From Date</label>
            <div className="input-with-icon">
              <Calendar size={16} />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
              />
            </div>
          </div>

          <div className="filter-field">
            <label>To Date</label>
            <div className="input-with-icon">
              <Calendar size={16} />
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
              />
            </div>
          </div>

          <div className="filter-field">
            <label>Sort By</label>
            <select 
              value={sortOption} 
              onChange={(e) => setSortOption(e.target.value)}
            >
              <option value="date-newest">Date (Latest First)</option>
              <option value="date-oldest">Date (Oldest First)</option>
              <option value="name-asc">Student Name (A-Z)</option>
              <option value="name-desc">Student Name (Z-A)</option>
            </select>
          </div>

          <div className="filter-field">
            <label>Show</label>
            <select value={showAllEntries ? 'all' : 'financial'} onChange={(e) => setShowAllEntries(e.target.value === 'all')}>
              <option value="all">All entries</option>
              <option value="financial">Financial only</option>
            </select>
          </div>

          <button className="filter-reset-btn" onClick={resetFilters}>
            Reset
          </button>
        </div>
      </div>

      {/* Ledger Table - Classic accounting format */}
      <div className="ledger-book">
        <div className="ledger-page-edge"></div>
        
        {ledgerData.entries.length === 0 ? (
          <div className="ledger-empty">
            <BookOpen size={48} />
            <h3>No Entries Found</h3>
            <p>Transactions will appear here as they are recorded.</p>
          </div>
        ) : (
          <>
            {/* Desktop Ledger Table */}
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="col-select no-print">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === ledgerData.entries.length && ledgerData.entries.length > 0}
                      onChange={handleSelectAll}
                      title="Select all"
                    />
                  </th>
                  <th className="col-serial">Sr.<br/>No.</th>
                  <th className="col-date">Date</th>
                  <th className="col-voucher">Voucher/<br/>Receipt No.</th>
                  <th className="col-particulars">Particulars</th>
                  <th className="col-type">Type</th>
                  <th className="col-method">Method /<br/>Bank</th>
                  <th className="col-remarks">Remarks</th>
                  <th className="col-debit">Debit<br/>(₹)</th>
                  <th className="col-credit">Credit<br/>(₹)</th>
                  <th className="col-balance">Balance<br/>(₹)</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening balance removed */}
                {ledgerData.entries.map((entry, index) => {
                  const txnType = getTransactionType(entry.action);
                  const isHighlighted = entry.id === highlightedId;
                  const isSelected = selectedIds.includes(entry.id);
                  return (
                    <tr
                      key={entry.id}
                      ref={(el) => (rowRefs.current[entry.id] = el)}
                      className={`${index % 2 === 0 ? 'even-row' : 'odd-row'} ${
                        isHighlighted ? 'highlighted-row' : ''
                      } ${isSelected ? 'selected-row' : ''}`}
                    >
                      <td className="col-select no-print">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(entry.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="col-serial">{entry.serialNo}</td>
                      <td className="col-date">{formatLedgerDate(entry.timestamp)}</td>
                      <td className="col-voucher">
                        {entry.details?.receiptNumber || entry.details?.enrollmentNumber || '-'}
                      </td>
                      <td className="col-particulars">
                        <span className="particulars-name">{entry.entityName || '-'}</span>
                      </td>
                      <td className="col-type">
                        <span className={`txn-type ${txnType.class}`}>{txnType.label}</span>
                      </td>
                      <td className="col-method">
                        {entry.details?.paymentMethod ? (
                          <div className="method-cell">
                            <span className="method-name">
                              {{
                                cash: 'Cash',
                                upi: 'UPI',
                                card: 'Card',
                                bank_transfer: 'Bank Transfer',
                                cheque: 'Cheque',
                              }[entry.details.paymentMethod] || entry.details.paymentMethod}
                            </span>
                            {entry.details.bankMoneyReceived && ['upi', 'card', 'bank_transfer', 'cheque'].includes(entry.details.paymentMethod) && (
                              <span className="bank-name">
                                {{
                                  hdfc_1_shmt: 'HDFC-1 (SHMT)',
                                  hdfc_sss: 'HDFC (SSS)',
                                  india_overseas: 'India Overseas',
                                  tgsb: 'TGSB'
                                }[entry.details.bankMoneyReceived] || entry.details.bankMoneyReceived}
                              </span>
                            )}
                          </div>
                        ) : entry.details?.refundMethod ? (
                          <span className="method-name">Refund</span>
                        ) : '-'}
                      </td>
                      <td className="col-remarks">
                        <span>
                          {`${getTransactionNarration(entry)}${entry.details?.remarks ? ' | ' + entry.details.remarks : ''}`}
                        </span>
                      </td>
                      <td className="col-debit">
                        {entry.debit ? (
                          <span className="debit-amount">{formatCurrency(entry.debit)}</span>
                        ) : '-'}
                      </td>
                      <td className="col-credit">
                        {entry.credit ? (
                          <span className="credit-amount">{formatCurrency(entry.credit)}</span>
                        ) : '-'}
                      </td>
                      <td className="col-balance">
                        <span className="balance-amount">{formatCurrency(entry.balance)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td className="no-print"></td>
                  <td colSpan="7" className="totals-label">Total</td>
                  <td className="col-debit total-cell">
                    {ledgerData.totalDebits > 0 ? (
                      <span className="debit-amount">{formatCurrency(ledgerData.totalDebits)}</span>
                    ) : '-'}
                  </td>
                  <td className="col-credit total-cell">
                    <span className="credit-amount">{formatCurrency(ledgerData.totalCredits)}</span>
                  </td>
                  <td className="col-balance total-cell">
                    <span className="balance-amount">{formatCurrency(ledgerData.closingBalance)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Mobile Ledger Cards */}
            <div className="ledger-cards">
              {ledgerData.entries.map((entry) => {
                const txnType = getTransactionType(entry.action);
                const isHighlighted = entry.id === highlightedId;
                const isSelected = selectedIds.includes(entry.id);
                return (
                  <div
                    key={entry.id}
                    ref={(el) => (rowRefs.current[entry.id] = el)}
                    className={`ledger-card ${isHighlighted ? 'highlighted-card' : ''} ${isSelected ? 'selected-card' : ''}`}
                  >
                    <div className="card-header">
                      <div className="card-select no-print">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(entry.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="card-serial">#{entry.serialNo}</div>
                      <div className="card-date">{formatLedgerDate(entry.timestamp)}</div>
                      <span className={`txn-type ${txnType.class}`}>{txnType.label}</span>
                    </div>
                    
                    <div className="card-particulars">
                      <strong>{entry.entityName || '-'}</strong>
                    </div>
                    
                    <div className="card-narration">
                      {getTransactionNarration(entry)}
                    </div>

                    {entry.details?.receiptNumber && (
                      <div className="card-voucher">
                        Voucher: {entry.details.receiptNumber}
                      </div>
                    )}
                    
                    {entry.details?.paymentMethod && (
                      <div className="card-method">
                        <span className="card-method-label">Method:</span>
                        <span className="card-method-value">
                          {{
                            cash: 'Cash',
                            upi: 'UPI',
                            card: 'Card',
                            bank_transfer: 'Bank Transfer',
                            cheque: 'Cheque',
                          }[entry.details.paymentMethod] || entry.details.paymentMethod}
                        </span>
                        {entry.details.bankMoneyReceived && ['upi', 'card', 'bank_transfer', 'cheque'].includes(entry.details.paymentMethod) && (
                          <span className="card-bank-badge">
                            {{
                              hdfc_1_shmt: 'HDFC-1 (SHMT)',
                              hdfc_sss: 'HDFC (SSS)',
                              india_overseas: 'India Overseas',
                              tgsb: 'TGSB'
                            }[entry.details.bankMoneyReceived] || entry.details.bankMoneyReceived}
                          </span>
                        )}
                      </div>
                    )}
                    
                    <div className="card-amounts">
                      {entry.debit && (
                        <div className="amount-item debit">
                          <span className="amount-label">Debit</span>
                          <span className="amount-value debit-amount">{formatCurrency(entry.debit)}</span>
                        </div>
                      )}
                      {entry.credit && (
                        <div className="amount-item credit">
                          <span className="amount-label">Credit</span>
                          <span className="amount-value credit-amount">{formatCurrency(entry.credit)}</span>
                        </div>
                      )}
                      <div className="amount-item balance">
                        <span className="amount-label">Balance</span>
                        <span className="amount-value balance-amount">{formatCurrency(entry.balance)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mobile Totals Card */}
              <div className="ledger-card totals-card">
                <div className="card-header">
                  <strong>Closing Summary</strong>
                </div>
                <div className="card-amounts">
                  {ledgerData.totalDebits > 0 && (
                    <div className="amount-item">
                      <span className="amount-label">Total Debit</span>
                      <span className="amount-value debit-amount">{formatCurrency(ledgerData.totalDebits)}</span>
                    </div>
                  )}
                  <div className="amount-item">
                    <span className="amount-label">Total Credit</span>
                    <span className="amount-value credit-amount">{formatCurrency(ledgerData.totalCredits)}</span>
                  </div>
                  <div className="amount-item">
                    <span className="amount-label">Closing Balance</span>
                    <span className="amount-value balance-amount">{formatCurrency(ledgerData.closingBalance)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="ledger-footer no-print">
        <p>Showing {ledgerData.entries.length} of {auditLog.length} entries</p>
        <p className="generated-on">Generated on: {new Date().toLocaleDateString('en-IN', { 
          day: '2-digit', 
          month: 'long', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</p>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Deletion</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{selectedIds.length}</strong> audit log {selectedIds.length === 1 ? 'entry' : 'entries'}?</p>
              <p style={{ color: '#dc3545', marginTop: '0.5rem' }}>
                ⚠️ This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button 
                className="modal-btn cancel-btn" 
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className="modal-btn delete-confirm-btn" 
                onClick={handleBulkDelete}
                disabled={isDeleting}
                style={{ 
                  backgroundColor: '#dc3545', 
                  color: 'white',
                  opacity: isDeleting ? 0.6 : 1 
                }}
              >
                {isDeleting ? 'Deleting...' : `Delete ${selectedIds.length} ${selectedIds.length === 1 ? 'Entry' : 'Entries'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditPage;
