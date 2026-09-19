/**
 * Shramik Hisab Pro - Production Laborer & Daily Expense Ledger Application
 * Uses CentralDataClient SDK for zero-cost, end-to-end encrypted storage on GitHub.
 */

import React, { useState, useEffect } from "react";
import { CentralDataClient } from "../../../sdk/CentralDataClient";
import { Users, Calendar, DollarSign, Receipt, RefreshCw, Plus, Trash2, CheckCircle2, ShieldCheck } from "lucide-react";

interface Worker {
  id: string;
  name: string;
  phone: string;
  dailyWage: number;
  skill: string;
  aadhaarNumber?: string;
  createdAt: string;
}

interface Attendance {
  id: string;
  workerId: string;
  date: string;
  status: "PRESENT" | "HALF_DAY" | "ABSENT" | "OVERTIME";
  overtimeHours?: number;
}

interface Payment {
  id: string;
  workerId: string;
  date: string;
  amount: number;
  type: "WAGE_PAYMENT" | "ADVANCE";
  notes?: string;
}

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
}

export const ShramikHisabApp: React.FC<{ sdk: CentralDataClient }> = ({ sdk }) => {
  const [activeTab, setActiveTab] = useState<"workers" | "attendance" | "payments" | "expenses">("workers");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState("");

  // New Form Inputs
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerPhone, setNewWorkerPhone] = useState("");
  const [newWorkerWage, setNewWorkerWage] = useState("800");
  const [newWorkerSkill, setNewWorkerSkill] = useState("Mason / Karigar");

  const [expenseCat, setExpenseCat] = useState("Cement & Material");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");

  const [payWorkerId, setPayWorkerId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payType, setPayType] = useState<"WAGE_PAYMENT" | "ADVANCE">("WAGE_PAYMENT");

  useEffect(() => {
    loadData();
  }, [sdk.authManager.isLoggedIn()]);

  const loadData = async () => {
    if (!sdk.authManager.isLoggedIn()) return;
    try {
      const wList = await sdk.getAppRecords<Worker>("shramik_hisab", "workers");
      const aList = await sdk.getAppRecords<Attendance>("shramik_hisab", "attendance");
      const pList = await sdk.getAppRecords<Payment>("shramik_hisab", "payments");
      const eList = await sdk.getAppRecords<Expense>("shramik_hisab", "expenses");

      setWorkers(wList);
      setAttendance(aList);
      setPayments(pList);
      setExpenses(eList);
    } catch (err: any) {
      console.error("Error loading Shramik Hisab data:", err);
    }
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName) return;

    const worker: Worker = {
      id: `wrk_${Date.now()}`,
      name: newWorkerName,
      phone: newWorkerPhone,
      dailyWage: parseFloat(newWorkerWage) || 800,
      skill: newWorkerSkill,
      createdAt: new Date().toISOString(),
    };

    await sdk.saveAppRecord("shramik_hisab", "workers", worker);
    setNewWorkerName("");
    setNewWorkerPhone("");
    await loadData();
  };

  const handleDeleteWorker = async (id: string) => {
    await sdk.deleteAppRecord("shramik_hisab", "workers", id);
    await loadData();
  };

  const handleLogAttendance = async (workerId: string, status: Attendance["status"]) => {
    const today = new Date().toISOString().split("T")[0];
    const attRecord: Attendance = {
      id: `att_${workerId}_${today}`,
      workerId,
      date: today,
      status,
    };

    await sdk.saveAppRecord("shramik_hisab", "attendance", attRecord);
    await loadData();
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payWorkerId || !payAmount) return;

    const payment: Payment = {
      id: `pay_${Date.now()}`,
      workerId: payWorkerId,
      date: new Date().toISOString().split("T")[0],
      amount: parseFloat(payAmount),
      type: payType,
    };

    await sdk.saveAppRecord("shramik_hisab", "payments", payment);
    setPayAmount("");
    await loadData();
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAmount) return;

    const exp: Expense = {
      id: `exp_${Date.now()}`,
      category: expenseCat,
      amount: parseFloat(expenseAmount),
      description: expenseDesc,
      date: new Date().toISOString().split("T")[0],
    };

    await sdk.saveAppRecord("shramik_hisab", "expenses", exp);
    setExpenseAmount("");
    setExpenseDesc("");
    await loadData();
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg("Encrypting local records & pushing to GitHub...");
    try {
      const res = await sdk.syncApp("shramik_hisab");
      setSyncStatusMsg(`Sync Complete! Pushed: ${res.pushedCount}, Pulled: ${res.pulledCount}`);
      await loadData();
    } catch (err: any) {
      setSyncStatusMsg(`Sync Failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(""), 4000);
    }
  };

  if (!sdk.authManager.isLoggedIn()) {
    return (
      <div className="p-8 text-center bg-stone-900 border border-stone-800 rounded-xl text-stone-300">
        <ShieldCheck className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h3 className="text-xl font-bold text-stone-100 mb-2">Vault Key Locked</h3>
        <p className="text-stone-400 text-sm max-w-md mx-auto mb-4">
          Please register or log in using the Auth panel in the top header to unlock your encrypted Shramik Hisab dataset.
        </p>
      </div>
    );
  }

  // Calculate worker balances
  const getWorkerStats = (workerId: string, dailyWage: number) => {
    const wAtt = attendance.filter((a) => a.workerId === workerId);
    let totalEarned = 0;
    wAtt.forEach((a) => {
      if (a.status === "PRESENT") totalEarned += dailyWage;
      if (a.status === "HALF_DAY") totalEarned += dailyWage * 0.5;
      if (a.status === "OVERTIME") totalEarned += dailyWage + 200;
    });

    const wPay = payments.filter((p) => p.workerId === workerId);
    let totalPaid = 0;
    wPay.forEach((p) => (totalPaid += p.amount));

    return { totalEarned, totalPaid, balance: totalEarned - totalPaid };
  };

  return (
    <div className="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-r from-amber-950/40 via-stone-900 to-stone-950 border-b border-stone-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
              app_id: shramik_hisab
            </span>
            <span className="px-2.5 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Encrypted
            </span>
          </div>
          <h2 className="text-2xl font-bold text-stone-100 mt-2">Shramik Hisab Pro</h2>
          <p className="text-stone-400 text-xs">Labour Attendance, Payment Ledger & Daily Expense Manager</p>
        </div>

        <button
          onClick={handleTriggerSync}
          disabled={isSyncing}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-sm rounded-lg flex items-center gap-2 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing to GitHub..." : "Sync Encrypted Data"}
        </button>
      </div>

      {syncStatusMsg && (
        <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-amber-400" />
          {syncStatusMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-800 bg-stone-900/50">
        <button
          onClick={() => setActiveTab("workers")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "workers"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Users className="w-4 h-4" /> Workers ({workers.length})
        </button>
        <button
          onClick={() => setActiveTab("attendance")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "attendance"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Calendar className="w-4 h-4" /> Daily Attendance
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "payments"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <DollarSign className="w-4 h-4" /> Payments / Advances
        </button>
        <button
          onClick={() => setActiveTab("expenses")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "expenses"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Receipt className="w-4 h-4" /> Site Expenses
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-6">
        {/* WORKERS TAB */}
        {activeTab === "workers" && (
          <div className="space-y-6">
            {/* Add Worker Form */}
            <form onSubmit={handleAddWorker} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" /> Register New Laborer
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Worker Name *"
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={newWorkerPhone}
                  onChange={(e) => setNewWorkerPhone(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                <select
                  value={newWorkerSkill}
                  onChange={(e) => setNewWorkerSkill(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="Mason / Karigar">Mason / Karigar</option>
                  <option value="Helper / Mazdoor">Helper / Mazdoor</option>
                  <option value="Electrician">Electrician</option>
                  <option value="Plumber">Plumber</option>
                  <option value="Painter">Painter</option>
                  <option value="Supervisor">Supervisor</option>
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Daily Wage (₹)"
                    value={newWorkerWage}
                    onChange={(e) => setNewWorkerWage(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-lg whitespace-nowrap transition"
                  >
                    Add
                  </button>
                </div>
              </div>
            </form>

            {/* Workers Table */}
            <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-900/30">
              <table className="w-full text-left text-xs text-stone-300">
                <thead className="bg-stone-900 text-stone-400 uppercase font-mono text-[10px] border-b border-stone-800">
                  <tr>
                    <th className="p-3">Worker Name</th>
                    <th className="p-3">Skill / Category</th>
                    <th className="p-3">Daily Wage</th>
                    <th className="p-3">Total Earned</th>
                    <th className="p-3">Paid / Advances</th>
                    <th className="p-3">Balance Due</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {workers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-stone-500">
                        No workers added yet. Add a worker above.
                      </td>
                    </tr>
                  ) : (
                    workers.map((w) => {
                      const stats = getWorkerStats(w.id, w.dailyWage);
                      return (
                        <tr key={w.id} className="hover:bg-stone-800/30">
                          <td className="p-3 font-medium text-stone-100">{w.name}</td>
                          <td className="p-3 text-stone-400">{w.skill}</td>
                          <td className="p-3 font-mono text-amber-400">₹{w.dailyWage}</td>
                          <td className="p-3 font-mono text-emerald-400">₹{stats.totalEarned}</td>
                          <td className="p-3 font-mono text-stone-300">₹{stats.totalPaid}</td>
                          <td className="p-3 font-mono font-bold text-amber-300">₹{stats.balance}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteWorker(w.id)}
                              className="p-1 text-stone-500 hover:text-red-400 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ATTENDANCE TAB */}
        {activeTab === "attendance" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-stone-200">Today's Attendance ({new Date().toLocaleDateString()})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workers.map((w) => {
                const today = new Date().toISOString().split("T")[0];
                const currentAtt = attendance.find((a) => a.workerId === w.id && a.date === today);

                return (
                  <div key={w.id} className="p-4 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-stone-100">{w.name}</h4>
                      <p className="text-xs text-stone-400">{w.skill} • ₹{w.dailyWage}/day</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleLogAttendance(w.id, "PRESENT")}
                        className={`px-2.5 py-1 text-xs font-mono rounded ${
                          currentAtt?.status === "PRESENT"
                            ? "bg-emerald-500 text-stone-950 font-bold"
                            : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                        }`}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => handleLogAttendance(w.id, "HALF_DAY")}
                        className={`px-2.5 py-1 text-xs font-mono rounded ${
                          currentAtt?.status === "HALF_DAY"
                            ? "bg-amber-500 text-stone-950 font-bold"
                            : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                        }`}
                      >
                        Half
                      </button>
                      <button
                        onClick={() => handleLogAttendance(w.id, "ABSENT")}
                        className={`px-2.5 py-1 text-xs font-mono rounded ${
                          currentAtt?.status === "ABSENT"
                            ? "bg-red-500 text-stone-950 font-bold"
                            : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                        }`}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === "payments" && (
          <div className="space-y-6">
            <form onSubmit={handleAddPayment} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200">Record Payment / Advance</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  value={payWorkerId}
                  onChange={(e) => setPayWorkerId(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select Worker *</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount (₹) *"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <select
                  value={payType}
                  onChange={(e) => setPayType(e.target.value as any)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="WAGE_PAYMENT">Wage Payment</option>
                  <option value="ADVANCE">Cash Advance</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-lg transition"
                >
                  Record Payment
                </button>
              </div>
            </form>

            <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-900/30">
              <table className="w-full text-left text-xs text-stone-300">
                <thead className="bg-stone-900 text-stone-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Worker</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 font-mono">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {payments.map((p) => {
                    const w = workers.find((x) => x.id === p.workerId);
                    return (
                      <tr key={p.id}>
                        <td className="p-3 text-stone-400">{p.date}</td>
                        <td className="p-3 font-medium text-stone-100">{w?.name || p.workerId}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              p.type === "ADVANCE" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {p.type}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-amber-400">₹{p.amount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* EXPENSES TAB */}
        {activeTab === "expenses" && (
          <div className="space-y-6">
            <form onSubmit={handleAddExpense} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200">Add Site / Material Expense</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  value={expenseCat}
                  onChange={(e) => setExpenseCat(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="Cement & Material">Cement & Material</option>
                  <option value="Bricks & Sand">Bricks & Sand</option>
                  <option value="Tools & Hardware">Tools & Hardware</option>
                  <option value="Transport & Fuel">Transport & Fuel</option>
                  <option value="Chai & Snacks">Chai & Snacks</option>
                </select>
                <input
                  type="number"
                  placeholder="Amount (₹) *"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-lg transition"
                >
                  Add Expense
                </button>
              </div>
            </form>

            <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-900/30">
              <table className="w-full text-left text-xs text-stone-300">
                <thead className="bg-stone-900 text-stone-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 font-mono">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="p-3 text-stone-400">{e.date}</td>
                      <td className="p-3 font-medium text-amber-300">{e.category}</td>
                      <td className="p-3 text-stone-300">{e.description || "-"}</td>
                      <td className="p-3 font-mono font-bold text-amber-400">₹{e.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
