import { useState, useMemo } from 'react';
import { Plus, TrendingDown, TrendingUp, BarChart3, PiggyBank, Wallet } from 'lucide-react';
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
  const { expenses, deleteExpense } = useStudents();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const isAuditor = user?.role === 'auditor';

  // Use all expenses (no batch filtering) to show every transaction
  const allExpenses = useMemo(() => {
    return (expenses || []).map(mapExpenseFromSupabase);
  }, [expenses]);

  // Calculate statistics
  const stats = useMemo(() => {
    const debitExpenses = allExpenses.filter((exp) => exp.transactionType === 'debit');
    const creditExpenses = allExpenses.filter((exp) => exp.transactionType === 'credit');

    const totalDebit = debitExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalCredit = creditExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const netAmount = totalDebit - totalCredit;

    // Business Income = Credit transactions (money coming in)
    const businessIncome = totalCredit;
    
    // Business Expenses = Debit transactions (money going out)
    const businessExpenses = totalDebit;
    
    // Business Profit = Income - Expenses
    const businessProfit = businessIncome - businessExpenses;
    
    // Owner Withdrawals = Debit transactions from self/owner transactions
    const ownerWithdrawals = debitExpenses
      .filter((exp) => exp.isSelfTransaction)
      .reduce((sum, exp) => sum + exp.amount, 0);
    
    // Calculate breakdown by owner
    const pritiWithdrawals = debitExpenses
      .filter((exp) => exp.isSelfTransaction && exp.name === 'priti_personal')
      .reduce((sum, exp) => sum + exp.amount, 0);
    const sushantWithdrawals = debitExpenses
      .filter((exp) => exp.isSelfTransaction && exp.name === 'sushant_personal')
      .reduce((sum, exp) => sum + exp.amount, 0);
    const ownerBreakdown = {
      priti: pritiWithdrawals,
      sushant: sushantWithdrawals
    };
    
    // Cash in Hand = Net cash transactions (cash credits - cash debits)
    const cashCredits = creditExpenses
      .filter((exp) => exp.paymentMethod === 'cash')
      .reduce((sum, exp) => sum + exp.amount, 0);
    const cashDebits = debitExpenses
      .filter((exp) => exp.paymentMethod === 'cash')
      .reduce((sum, exp) => sum + exp.amount, 0);
    const cashInHand = cashCredits - cashDebits;
    
    // Bank Balance = Net bank transactions (all non-cash credits - non-cash debits)
    const bankCredits = creditExpenses
      .filter((exp) => exp.paymentMethod !== 'cash')
      .reduce((sum, exp) => sum + exp.amount, 0);
    const bankDebits = debitExpenses
      .filter((exp) => exp.paymentMethod !== 'cash')
      .reduce((sum, exp) => sum + exp.amount, 0);
    const bankBalance = bankCredits - bankDebits;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyDebits = allExpenses.filter((exp) => {
      const expDate = new Date(exp.date);
      return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear && exp.transactionType === 'debit';
    });
    const monthlyCredits = allExpenses.filter((exp) => {
      const expDate = new Date(exp.date);
      return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear && exp.transactionType === 'credit';
    });
    const monthlyDebitTotal = monthlyDebits.reduce((sum, exp) => sum + exp.amount, 0);
    const monthlyCreditTotal = monthlyCredits.reduce((sum, exp) => sum + exp.amount, 0);
    const monthlyTotal = monthlyDebitTotal - monthlyCreditTotal;

    return {
      totalDebit,
      totalCredit,
      netAmount,
      monthlyTotal,
      transactionCount: allExpenses.length,
      // New metrics for enhanced dashboard
      businessIncome,
      businessExpenses,
      businessProfit,
      ownerWithdrawals,
      ownerBreakdown,
      cashInHand,
      bankBalance,
    };
  }, [allExpenses]);

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

      {/* Stats Cards - Row 1: Business Metrics */}
      <div className="expenses-stats-section">
        <h3 className="expenses-stats-section-title">Business Overview</h3>
        <div className="expenses-stats-grid">
          {/* Business Income */}
          <div className="expenses-stat-card">
            <div className="expenses-stat-content">
              <div className="expenses-stat-icon green">
                <TrendingUp />
              </div>
              <div>
                <p className="expenses-stat-label">Business Income</p>
                <p className="expenses-stat-value green">{formatCurrency(stats.businessIncome)}</p>
              </div>
            </div>
          </div>

          {/* Business Expenses */}
          <div className="expenses-stat-card">
            <div className="expenses-stat-content">
              <div className="expenses-stat-icon red">
                <TrendingDown />
              </div>
              <div>
                <p className="expenses-stat-label">Business Expenses</p>
                <p className="expenses-stat-value red">{formatCurrency(stats.businessExpenses)}</p>
              </div>
            </div>
          </div>

          {/* Business Profit */}
          <div className="expenses-stat-card">
            <div className="expenses-stat-content">
              <div className={`expenses-stat-icon ${stats.businessProfit >= 0 ? 'green' : 'red'}`}>
                <BarChart3 />
              </div>
              <div>
                <p className="expenses-stat-label">Business Profit</p>
                <p className={`expenses-stat-value ${stats.businessProfit >= 0 ? 'green' : 'red'}`}>
                  {formatCurrency(stats.businessProfit)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards - Row 2: Owner & Bank Metrics */}
      <div className="expenses-stats-section">
        <h3 className="expenses-stats-section-title">Cash Management</h3>
        <div className="expenses-stats-grid">
          {/* Owner Withdrawals */}
          <div className="expenses-stat-card expenses-stat-card-tooltip">
            <div className="expenses-stat-content">
              <div className="expenses-stat-icon blue">
                <Wallet />
              </div>
              <div>
                <p className="expenses-stat-label">Owner Withdrawals</p>
                <p className="expenses-stat-value blue">{formatCurrency(stats.ownerWithdrawals)}</p>
              </div>
            </div>
            {/* Tooltip */}
            <div className="expenses-stat-tooltip">
              <div className="expenses-tooltip-header">Owner Breakdown</div>
              <div className="expenses-tooltip-row">
                <span className="expenses-tooltip-label">Priti Personal:</span>
                <span className="expenses-tooltip-value">{formatCurrency(stats.ownerBreakdown.priti)}</span>
              </div>
              <div className="expenses-tooltip-row">
                <span className="expenses-tooltip-label">Sushant Personal:</span>
                <span className="expenses-tooltip-value">{formatCurrency(stats.ownerBreakdown.sushant)}</span>
              </div>
            </div>
          </div>

          {/* Cash in Hand */}
          <div className="expenses-stat-card">
            <div className="expenses-stat-content">
              <div className={`expenses-stat-icon ${stats.cashInHand >= 0 ? 'green' : 'red'}`}>
                <Wallet />
              </div>
              <div>
                <p className="expenses-stat-label">Cash in Hand</p>
                <p className={`expenses-stat-value ${stats.cashInHand >= 0 ? 'green' : 'red'}`}>
                  {formatCurrency(stats.cashInHand)}
                </p>
              </div>
            </div>
          </div>

          {/* Bank Balance */}
          <div className="expenses-stat-card">
            <div className="expenses-stat-content">
              <div className={`expenses-stat-icon ${stats.bankBalance >= 0 ? 'green' : 'red'}`}>
                <PiggyBank />
              </div>
              <div>
                <p className="expenses-stat-label">Bank Balance</p>
                <p className={`expenses-stat-value ${stats.bankBalance >= 0 ? 'green' : 'red'}`}>
                  {formatCurrency(stats.bankBalance)}
                </p>
              </div>
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
          expenses={allExpenses}
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
