import { useMemo, useState, useEffect } from 'react';
import { Edit, Trash2, Search, Filter, ChevronUp, ChevronDown, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { BANK_MONEY_RECEIVED } from '../../utils/constants';
import './Expenses.css';

const PAYMENT_METHODS_MAP = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
};

const TRANSACTION_TYPE_BADGE = {
  debit: { label: 'Debit', color: 'red' },
  credit: { label: 'Credit', color: 'green' },
};

const SELF_TRANSACTION_NAMES_MAP = {
  priti_personal: 'Priti Personal',
  sushant_personal: 'Sushant Personal',
};

const mapExpenseFromSupabase = (expense) => ({
  id: expense.id,
  name: expense.name,
  date: expense.date,
  amount: expense.amount,
  paymentMethod: expense.payment_method,
  bankMoneyReceived: expense.bank_money_received,
  chequeNumber: expense.cheque_number,
  transactionType: expense.transaction_type,
  remarks: expense.remarks,
  isSelfTransaction: expense.is_self_transaction,
  batchId: expense.batch_id,
  createdAt: expense.created_at,
  updatedAt: expense.updated_at,
});

const ExpensesTable = ({ expenses, onEdit, onDelete, loading, isAuditor = false }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all');
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];
  const [maxPageButtons, setMaxPageButtons] = useState(7);
  const [showFilters, setShowFilters] = useState(false);
  
  // Additional filter states
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [selfTransactionFilter, setSelfTransactionFilter] = useState('all');
  const [bankFilter, setBankFilter] = useState('all');
  const [datePreset, setDatePreset] = useState('all');

  // Utility functions for date presets
  const getDateRange = (preset) => {
    const today = new Date();
    const startOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };
    const endOfDay = (date) => {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    switch (preset) {
      case 'today':
        return {
          from: startOfDay(today).toISOString().split('T')[0],
          to: endOfDay(today).toISOString().split('T')[0]
        };
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          from: startOfDay(yesterday).toISOString().split('T')[0],
          to: endOfDay(yesterday).toISOString().split('T')[0]
        };
      case 'this_week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        return {
          from: startOfDay(startOfWeek).toISOString().split('T')[0],
          to: endOfDay(today).toISOString().split('T')[0]
        };
      case 'last_week':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        return {
          from: startOfDay(lastWeekStart).toISOString().split('T')[0],
          to: endOfDay(lastWeekEnd).toISOString().split('T')[0]
        };
      case 'this_month':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          from: startOfDay(startOfMonth).toISOString().split('T')[0],
          to: endOfDay(today).toISOString().split('T')[0]
        };
      case 'last_month':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          from: startOfDay(lastMonthStart).toISOString().split('T')[0],
          to: endOfDay(lastMonthEnd).toISOString().split('T')[0]
        };
      case 'this_year':
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        return {
          from: startOfDay(startOfYear).toISOString().split('T')[0],
          to: endOfDay(today).toISOString().split('T')[0]
        };
      default:
        return { from: '', to: '' };
    }
  };

  const handleDatePresetChange = (preset) => {
    setDatePreset(preset);
    if (preset === 'all' || preset === 'custom') {
      if (preset === 'all') {
        setDateFrom('');
        setDateTo('');
      }
    } else {
      const range = getDateRange(preset);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
    setCurrentPage(1);
  };

  // Update datePreset to 'custom' when manual date inputs change
  const handleDateFromChange = (value) => {
    setDateFrom(value);
    if (datePreset !== 'custom' && datePreset !== 'all') {
      setDatePreset('custom');
    }
    setCurrentPage(1);
  };

  const handleDateToChange = (value) => {
    setDateTo(value);
    if (datePreset !== 'custom' && datePreset !== 'all') {
      setDatePreset('custom');
    }
    setCurrentPage(1);
  };

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    // Data may already be mapped by parent or might be raw from Supabase
    // Ensure all expenses are properly mapped
    const ensureMapped = (expense) => {
      // If already mapped (has camelCase properties), return as-is
      if (expense.transactionType !== undefined) {
        return expense;
      }
      // If raw from Supabase (snake_case), map it
      return mapExpenseFromSupabase(expense);
    };
    
    const mappedExpenses = (expenses || []).map(ensureMapped);
    
    return mappedExpenses.filter((expense) => {
      // Search filter
      const matchesSearch =
        (expense.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (expense.remarks || '').toLowerCase().includes(searchQuery.toLowerCase());

      // Transaction type filter
      const matchesType = typeFilter === 'all' || expense.transactionType === typeFilter;
      
      // Payment method filter
      const matchesPaymentMethod =
        paymentMethodFilter === 'all' || expense.paymentMethod === paymentMethodFilter;

      // Date range filter
      const expenseDate = new Date(expense.date);
      const matchesDateFrom = !dateFrom || expenseDate >= new Date(dateFrom);
      const matchesDateTo = !dateTo || expenseDate <= new Date(dateTo);
      
      // Amount range filter
      const matchesAmountMin = !amountMin || expense.amount >= Number(amountMin);
      const matchesAmountMax = !amountMax || expense.amount <= Number(amountMax);
      
      // Self transaction filter
      const matchesSelfTransaction = 
        selfTransactionFilter === 'all' ||
        (selfTransactionFilter === 'self' && expense.isSelfTransaction) ||
        (selfTransactionFilter === 'business' && !expense.isSelfTransaction);
      
      // Bank filter
      const matchesBank = 
        bankFilter === 'all' || 
        expense.bankMoneyReceived === bankFilter;

      return matchesSearch && 
             matchesType && 
             matchesPaymentMethod && 
             matchesDateFrom && 
             matchesDateTo && 
             matchesAmountMin && 
             matchesAmountMax && 
             matchesSelfTransaction &&
             matchesBank;
    });
  }, [expenses, searchQuery, typeFilter, paymentMethodFilter, dateFrom, dateTo, amountMin, amountMax, selfTransactionFilter, bankFilter]);

  // Sorted expenses
  const sortedExpenses = useMemo(() => {
    const sorted = [...filteredExpenses];

    sorted.sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === 'date') {
        aValue = new Date(a.date);
        bValue = new Date(b.date);
      } else if (sortField === 'amount') {
        aValue = Number(a.amount);
        bValue = Number(b.amount);
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      
      // When primary sort values are equal, use created_at as secondary sort
      // This ensures consistent ordering for transactions on the same date
      if (aValue.getTime && bValue.getTime && aValue.getTime() === bValue.getTime()) {
        const aCreated = new Date(a.createdAt);
        const bCreated = new Date(b.createdAt);
        return sortOrder === 'asc' ? aCreated - bCreated : bCreated - aCreated;
      }
      
      return 0;
    });

    return sorted;
  }, [filteredExpenses, sortField, sortOrder]);

  // Paginated expenses
  const totalPages = Math.ceil(sortedExpenses.length / itemsPerPage);
  // Keep currentPage within bounds when data or page size changes
  useEffect(() => {
    if (totalPages === 0) {
      setCurrentPage(1);
    } else if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // Responsive: adjust how many page buttons to show based on viewport width
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w <= 480) setMaxPageButtons(3);
      else if (w <= 768) setMaxPageButtons(5);
      else setMaxPageButtons(7);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const paginatedExpenses = useMemo(() => {
    return sortedExpenses.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [sortedExpenses, currentPage, itemsPerPage]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Compute visible page numbers with ellipses
  const getVisiblePageNumbers = (total, current, maxButtons = 7) => {
    if (total <= maxButtons) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [];
    const siblingCount = 1; // pages to show on each side of current
    const left = Math.max(2, current - siblingCount);
    const right = Math.min(total - 1, current + siblingCount);

    pages.push(1);
    if (left > 2) pages.push('left-ellipsis');

    for (let p = left; p <= right; p++) pages.push(p);

    if (right < total - 1) pages.push('right-ellipsis');
    pages.push(total);
    return pages;
  };

  const getSelfTransactionLabel = (value) => {
    return SELF_TRANSACTION_NAMES_MAP[value] || value;
  };

  const getBankLabel = (value) => {
    return BANK_MONEY_RECEIVED.find((bank) => bank.value === value)?.label || value;
  };

  const getPaymentMethodDisplay = (expense) => {
    const methodLabel = PAYMENT_METHODS_MAP[expense.paymentMethod] || expense.paymentMethod;
    if ((expense.paymentMethod === 'bank_transfer' || expense.paymentMethod === 'upi' || expense.paymentMethod === 'card') && expense.bankMoneyReceived) {
      return `${methodLabel} - ${getBankLabel(expense.bankMoneyReceived)}`;
    }
    if (expense.paymentMethod === 'cheque' && expense.chequeNumber) {
      return `${methodLabel} (${expense.chequeNumber})`;
    }
    return methodLabel;
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (paymentMethodFilter !== 'all') count++;
    if (selfTransactionFilter !== 'all') count++;
    if (bankFilter !== 'all') count++;
    if (dateFrom || dateTo) count++;
    if (amountMin || amountMax) count++;
    return count;
  }, [typeFilter, paymentMethodFilter, selfTransactionFilter, bankFilter, dateFrom, dateTo, amountMin, amountMax]);

  // Get active filter chips
  const activeFilters = useMemo(() => {
    const filters = [];
    if (searchQuery) filters.push({ type: 'search', label: `Search: "${searchQuery}"`, value: searchQuery });
    if (typeFilter !== 'all') filters.push({ type: 'transactionType', label: `Type: ${typeFilter === 'debit' ? 'Debit' : 'Credit'}`, value: typeFilter });
    if (paymentMethodFilter !== 'all') filters.push({ type: 'paymentMethod', label: `Payment: ${PAYMENT_METHODS_MAP[paymentMethodFilter]}`, value: paymentMethodFilter });
    if (selfTransactionFilter !== 'all') filters.push({ type: 'selfTransaction', label: `Category: ${selfTransactionFilter === 'self' ? 'Personal' : 'Business'}`, value: selfTransactionFilter });
    if (bankFilter !== 'all') filters.push({ type: 'bank', label: `Bank: ${BANK_MONEY_RECEIVED.find(b => b.value === bankFilter)?.label}`, value: bankFilter });
    if (dateFrom && dateTo) filters.push({ type: 'dateRange', label: `Date: ${dateFrom} to ${dateTo}`, value: `${dateFrom}-${dateTo}` });
    else if (dateFrom) filters.push({ type: 'dateFrom', label: `From: ${dateFrom}`, value: dateFrom });
    else if (dateTo) filters.push({ type: 'dateTo', label: `To: ${dateTo}`, value: dateTo });
    if (amountMin && amountMax) filters.push({ type: 'amountRange', label: `Amount: ₹${amountMin} - ₹${amountMax}`, value: `${amountMin}-${amountMax}` });
    else if (amountMin) filters.push({ type: 'amountMin', label: `Min: ₹${amountMin}`, value: amountMin });
    else if (amountMax) filters.push({ type: 'amountMax', label: `Max: ₹${amountMax}`, value: amountMax });
    return filters;
  }, [searchQuery, typeFilter, paymentMethodFilter, selfTransactionFilter, bankFilter, dateFrom, dateTo, amountMin, amountMax]);

  const removeFilter = (filterType) => {
    switch (filterType) {
      case 'search':
        setSearchQuery('');
        break;
      case 'transactionType':
        setTypeFilter('all');
        break;
      case 'paymentMethod':
        setPaymentMethodFilter('all');
        break;
      case 'selfTransaction':
        setSelfTransactionFilter('all');
        break;
      case 'bank':
        setBankFilter('all');
        break;
      case 'dateRange':
      case 'dateFrom':
        setDateFrom('');
        if (filterType === 'dateRange') setDateTo('');
        setDatePreset('all');
        break;
      case 'dateTo':
        setDateTo('');
        setDatePreset('all');
        break;
      case 'amountRange':
      case 'amountMin':
        setAmountMin('');
        if (filterType === 'amountRange') setAmountMax('');
        break;
      case 'amountMax':
        setAmountMax('');
        break;
    }
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="expenses-table-container">
        <div className="skeleton-loader">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    );
  }

  return (
    <div className="expenses-table-container">
      {/* Search and Filter Bar */}
      <div className="expenses-search-bar">
        <div className="expenses-search-input-group">
          <Search className="w-5 h-5" />
          <input
            type="text"
            placeholder="Search by vendor, description..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="expenses-search-input"
          />
        </div>

        <div className="expenses-filter-actions">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="expenses-filter-toggle"
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="expenses-filter-badge">{activeFilterCount}</span>
            )}
          </button>

          {(activeFilterCount > 0 || searchQuery) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setPaymentMethodFilter('all');
                setSelfTransactionFilter('all');
                setBankFilter('all');
                setDateFrom('');
                setDateTo('');
                setDatePreset('all');
                setAmountMin('');
                setAmountMax('');
                setCurrentPage(1);
              }}
              className="expenses-clear-all-btn"
              title="Clear all filters and search"
            >
              <X className="w-4 h-4" />
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="expenses-filter-panel">
          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Transaction Type</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
            >
              <option value="all">All Types</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </div>

          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Payment Method</label>
            <select
              value={paymentMethodFilter}
              onChange={(e) => {
                setPaymentMethodFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
            >
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Transaction Category</label>
            <select
              value={selfTransactionFilter}
              onChange={(e) => {
                setSelfTransactionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
            >
              <option value="all">All Transactions</option>
              <option value="business">Business Only</option>
              <option value="self">Personal/Self Only</option>
            </select>
          </div>

          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Bank Account</label>
            <select
              value={bankFilter}
              onChange={(e) => {
                setBankFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
            >
              <option value="all">All Banks</option>
              {BANK_MONEY_RECEIVED.map((bank) => (
                <option key={bank.value} value={bank.value}>
                  {bank.label}
                </option>
              ))}
            </select>
          </div>

          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Date Range</label>
            <select
              value={datePreset}
              onChange={(e) => handleDatePresetChange(e.target.value)}
              className="expenses-filter-select"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {(datePreset === 'custom' || dateFrom || dateTo) && (
            <>
              <div className="expenses-filter-group">
                <label className="expenses-filter-label">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => handleDateFromChange(e.target.value)}
                  className="expenses-filter-select"
                />
              </div>

              <div className="expenses-filter-group">
                <label className="expenses-filter-label">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => handleDateToChange(e.target.value)}
                  className="expenses-filter-select"
                />
              </div>
            </>
          )}

          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Amount Min</label>
            <input
              type="number"
              placeholder="Min amount"
              value={amountMin}
              onChange={(e) => {
                setAmountMin(e.target.value);
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
              min="0"
            />
          </div>

          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Amount Max</label>
            <input
              type="number"
              placeholder="Max amount"
              value={amountMax}
              onChange={(e) => {
                setAmountMax(e.target.value);
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
              min="0"
            />
          </div>

          <div className="expenses-filter-group">
            <label className="expenses-filter-label">Items per Page</label>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active Filters & Results Count */}
      {(activeFilters.length > 0 || searchQuery) && (
        <div className="expenses-active-filters">
          <div className="expenses-filter-chips">
            {activeFilters.map((filter, index) => (
              <div key={`${filter.type}-${index}`} className="expenses-filter-chip">
                <span className="filter-chip-label">{filter.label}</span>
                <button
                  onClick={() => removeFilter(filter.type)}
                  className="filter-chip-remove"
                  title="Remove filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="expenses-results-count">
            <span className="results-count-text">
              Showing <strong>{filteredExpenses.length}</strong> of <strong>{expenses?.length || 0}</strong> expenses
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="expenses-table-wrapper">
        <table className="expenses-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('date')} className="sortable-header">
                <div className="header-content">
                  Date
                  {renderSortIcon('date')}
                </div>
              </th>
              <th>Vendor / Name</th>
              <th onClick={() => handleSort('amount')} className="sortable-header">
                <div className="header-content">
                  Amount
                  {renderSortIcon('amount')}
                </div>
              </th>
              <th>Payment Method</th>
              <th>Type</th>
              <th>Remarks</th>
              {!isAuditor && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedExpenses.length > 0 ? (
              paginatedExpenses.map((expense) => {
                const badge = TRANSACTION_TYPE_BADGE[expense.transactionType] || { label: 'Unknown', color: 'gray' };
                const displayName = expense.isSelfTransaction
                  ? getSelfTransactionLabel(expense.name)
                  : expense.name;

                return (
                  <tr key={expense.id} className="expenses-table-row">
                    <td data-label="Date" className="date-cell">
                      {formatDate(expense.date)}
                    </td>
                    <td data-label="Vendor / Name" className="vendor-cell">
                      <div className="vendor-info">
                        {displayName}
                        {expense.isSelfTransaction && (
                          <span className="self-transaction-badge">Self</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Amount" className="amount-cell">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td data-label="Payment Method">
                      {getPaymentMethodDisplay(expense)}
                    </td>
                    <td data-label="Type">
                      <span className={`transaction-type-badge ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td data-label="Remarks" className="remarks-cell">
                      <span className="remarks-text">{expense.remarks || '-'}</span>
                    </td>
                    {!isAuditor && (
                      <td data-label="Actions" className="actions-cell">
                        <div className="action-buttons">
                          <button
                            onClick={() => onEdit(expense)}
                            className="action-btn edit-btn"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDelete(expense.id)}
                            className="action-btn delete-btn"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={isAuditor ? 6 : 7} className="empty-state">
                  <div className="empty-message">No expenses found</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="expenses-pagination">
          <div className="pagination-info">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
            {Math.min(currentPage * itemsPerPage, sortedExpenses.length)} of{' '}
            {sortedExpenses.length} expenses
          </div>

          <div className="pagination-buttons">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="pagination-btn minimalist"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {getVisiblePageNumbers(totalPages, currentPage, maxPageButtons).map((p, idx) => {
              if (p === 'left-ellipsis' || p === 'right-ellipsis') {
                return (
                  <span key={`ellipses-${idx}`} className="pagination-ellipsis">•</span>
                );
              }
              return (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`pagination-page-btn minimalist ${currentPage === p ? 'active' : ''}`}
                  aria-label={`Go to page ${p}`}
                >
                  {p}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="pagination-btn minimalist"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Compact items-per-page selector */}
            <div className="pagination-extra minimalist-extra">
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="pagination-select minimalist-select"
                aria-label="Items per page"
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

              <div className="pagination-current">
                {currentPage} / {totalPages}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesTable;
