import { useMemo, useState } from 'react';
import { Edit, Trash2, Search, Filter, ChevronUp, ChevronDown } from 'lucide-react';
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
  const [showFilters, setShowFilters] = useState(false);

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
      const matchesSearch =
        (expense.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (expense.remarks || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === 'all' || expense.transactionType === typeFilter;
      const matchesPaymentMethod =
        paymentMethodFilter === 'all' || expense.paymentMethod === paymentMethodFilter;

      return matchesSearch && matchesType && matchesPaymentMethod;
    });
  }, [expenses, searchQuery, typeFilter, paymentMethodFilter]);

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
      return 0;
    });

    return sorted;
  }, [filteredExpenses, sortField, sortOrder]);

  // Paginated expenses
  const totalPages = Math.ceil(sortedExpenses.length / itemsPerPage);
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

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="expenses-filter-toggle"
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
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
            <label className="expenses-filter-label">Items per Page</label>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="expenses-filter-select"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
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
              className="pagination-btn"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`pagination-page-btn ${currentPage === page ? 'active' : ''}`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesTable;
