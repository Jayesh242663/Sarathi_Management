import { useState, useMemo } from 'react';
import { Plus, TrendingDown, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { useStudents } from '../../context/StudentContext';
import { useAuth } from '../../context/AuthContext';
import ExpenseForm from './ExpenseForm';
import ExpensesTable from './ExpensesTable';
import { formatCurrency } from '../../utils/formatters';
import './Expenses.css';

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

const ExpensesPage = () => {
  const { expenses, deleteExpense, currentBatch, batches } = useStudents();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const isAuditor = user?.role === 'auditor';

  // Get batch-filtered expenses
  const batchExpenses = useMemo(() => {
    // Map Supabase data to component format
    const mappedExpenses = (expenses || []).map(mapExpenseFromSupabase);
    
    if (currentBatch === 'all') {
      return mappedExpenses;
    }
    
    // Convert batch name to batch ID
    const batchObj = batches.find((b) => b.batch_name === currentBatch);
    const batchId = batchObj ? batchObj.id : null;
    
    if (!batchId) return [];
    return mappedExpenses.filter((exp) => exp.batchId === batchId);
  }, [expenses, currentBatch, batches]);

  // Calculate statistics
  const stats = useMemo(() => {
    const debitExpenses = batchExpenses.filter((exp) => exp.transactionType === 'debit');
    const creditExpenses = batchExpenses.filter((exp) => exp.transactionType === 'credit');

    const totalDebit = debitExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalCredit = creditExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netAmount = totalDebit - totalCredit;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyExpenses = batchExpenses.filter((exp) => {
      const expDate = new Date(exp.date);
      return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
    });
    const monthlyTotal = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    return {
      totalDebit,
      totalCredit,
      netAmount,
      monthlyTotal,
      transactionCount: batchExpenses.length,
    };
  }, [batchExpenses]);

  const handleEdit = (expense) => {
    setSelectedExpense(expense);
    setShowForm(true);
  };

  const handleDelete = (expenseId) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      deleteExpense(expenseId);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedExpense(null);
  };

  const handleSubmitSuccess = () => {
    setShowForm(false);
    setSelectedExpense(null);
  };

  return (
    <div className="expenses-page">
      {/* Page Header */}
      <div className="expenses-page-header">
        <div className="expenses-header-content">
          <h1 className="expenses-page-title">Expenses Management</h1>
          <p className="expenses-page-subtitle">
            Track and manage all business transactions and personal expenses
          </p>
        </div>
        {!isAuditor && (
          <button
            onClick={() => {
              setSelectedExpense(null);
              setShowForm(true);
            }}
            className="expenses-btn-add"
          >
            <Plus className="w-5 h-5" />
            Add Expense
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="expenses-stats-grid">
        <div className="expenses-stat-card">
          <div className="expenses-stat-content">
            <div className="expenses-stat-icon red">
              <TrendingDown />
            </div>
            <div>
              <p className="expenses-stat-label">Total Debits</p>
              <p className="expenses-stat-value red">{formatCurrency(stats.totalDebit)}</p>
            </div>
          </div>
        </div>

        <div className="expenses-stat-card">
          <div className="expenses-stat-content">
            <div className="expenses-stat-icon green">
              <TrendingUp />
            </div>
            <div>
              <p className="expenses-stat-label">Total Credits</p>
              <p className="expenses-stat-value green">{formatCurrency(stats.totalCredit)}</p>
            </div>
          </div>
        </div>

        <div className="expenses-stat-card">
          <div className="expenses-stat-content">
            <div className="expenses-stat-icon blue">
              <DollarSign />
            </div>
            <div>
              <p className="expenses-stat-label">Net Amount</p>
              <p className="expenses-stat-value blue">{formatCurrency(stats.netAmount)}</p>
            </div>
          </div>
        </div>

        <div className="expenses-stat-card">
          <div className="expenses-stat-content">
            <div className="expenses-stat-icon purple">
              <Calendar />
            </div>
            <div>
              <p className="expenses-stat-label">This Month</p>
              <p className="expenses-stat-value purple">{formatCurrency(stats.monthlyTotal)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="expenses-section">
        <div className="expenses-section-header">
          <h2 className="expenses-section-title">Transaction History</h2>
        </div>
        <ExpensesTable
          expenses={batchExpenses}
          onEdit={handleEdit}
          onDelete={handleDelete}
          loading={loading}
          isAuditor={isAuditor}
        />
      </div>

      {/* Expense Form Modal */}
      {showForm && !isAuditor && (
        <ExpenseForm
          onClose={handleFormClose}
          expense={selectedExpense}
          onSubmitSuccess={handleSubmitSuccess}
        />
      )}
    </div>
  );
};

export default ExpensesPage;
