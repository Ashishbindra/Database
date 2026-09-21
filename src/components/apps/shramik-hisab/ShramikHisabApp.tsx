/**
 * Shramik Hisab Pro - Production Laborer & Daily Expense Ledger Application
 * Powered by GitHub Encrypted Storage SDK with strict per-user data isolation.
 */

import React, { useState, useEffect } from "react";
import { CentralDataClient } from "../../../sdk/CentralDataClient";
import { CryptoManager } from "../../../sdk/crypto/CryptoManager";
import {
  Users,
  Calendar,
  DollarSign,
  Receipt,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Lock,
  Unlock,
  LogOut,
  User,
  Clock,
  DownloadCloud,
  AlertCircle,
  TrendingUp,
  CreditCard,
  Key,
  ChevronRight,
  ShieldAlert,
  ArrowRightLeft,
  FileSpreadsheet,
} from "lucide-react";

interface Worker {
  id: string;
  name: string;
  phone: string;
  dailyWage: number;
  skill: string;
  aadhaarNumber?: string;
  createdAt: string;
  isWorkerLoginEnabled?: boolean;
  workerPasswordHash?: string;
  workerSaltHex?: string;
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

export const ShramikHisabApp: React.FC<{
  sdk: CentralDataClient;
  onAuthStateChanged?: () => void;
}> = ({ sdk, onAuthStateChanged }) => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "workers" | "attendance" | "payments" | "expenses" | "account">("dashboard");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState("");
  const [syncErrorMsg, setSyncErrorMsg] = useState("");

  // In-app Auth State (when user is locked out)
  const [authMode, setAuthMode] = useState<"LOGIN" | "REGISTER" | "RECOVER" | "WORKER">("LOGIN");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [registeredWords, setRegisteredWords] = useState<string[] | null>(null);

  // Filter Date for Attendance
  const [selectedAttDate, setSelectedAttDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // New Form Inputs
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerPhone, setNewWorkerPhone] = useState("");
  const [newWorkerWage, setNewWorkerWage] = useState("850");
  const [newWorkerSkill, setNewWorkerSkill] = useState("Mason / Karigar");
  const [newWorkerAadhaar, setNewWorkerAadhaar] = useState("");

  const [expenseCat, setExpenseCat] = useState("Cement & Material");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDesc, setExpenseDesc] = useState("");

  const [payWorkerId, setPayWorkerId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payType, setPayType] = useState<"WAGE_PAYMENT" | "ADVANCE">("WAGE_PAYMENT");
  const [payNotes, setPayNotes] = useState("");

  const [workerLoginId, setWorkerLoginId] = useState("");
  const [workerLoginPassword, setWorkerLoginPassword] = useState("");
  const [workerSession, setWorkerSession] = useState<any>(null);
  const [newWorkerLoginEnabled, setNewWorkerLoginEnabled] = useState(false);
  const [newWorkerPassword, setNewWorkerPassword] = useState("");

  const handleWorkerLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const session = await sdk.workerLogin(workerLoginId.trim(), workerLoginPassword);
      setWorkerSession(session);
      setAuthSuccess(`Logged in successfully as worker ${session.authenticatedWorkerId}`);
    } catch (err: any) {
      setAuthError(`Worker Login Failed: ${err.message}`);
    }
  };

  const isLoggedIn = sdk.authManager.isLoggedIn();
  const profile = sdk.authManager.getCurrentProfile();

  useEffect(() => {
    loadData();
  }, [isLoggedIn, profile?.userId]);

  const loadData = async () => {
    if (!sdk.authManager.isLoggedIn()) {
      setWorkers([]);
      setAttendance([]);
      setPayments([]);
      setExpenses([]);
      setPendingCount(0);
      return;
    }

    try {
      const activeUserId = sdk.keyManager.getActiveUserId();
      const [wList, aList, pList, eList, pending] = await Promise.all([
        sdk.getAppRecords<Worker>("shramik_hisab", "workers"),
        sdk.getAppRecords<Attendance>("shramik_hisab", "attendance"),
        sdk.getAppRecords<Payment>("shramik_hisab", "payments"),
        sdk.getAppRecords<Expense>("shramik_hisab", "expenses"),
        sdk.localDb.getPendingSyncQueue("shramik_hisab", activeUserId),
      ]);

      setWorkers(wList || []);
      setAttendance(aList || []);
      setPayments(pList || []);
      setExpenses(eList || []);
      setPendingCount(pending ? pending.length : 0);
    } catch (err: any) {
      console.error("Error loading Shramik Hisab data:", err);
    }
  };

  // --- AUTH HANDLERS ---
  const handleInAppRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    try {
      const res = await sdk.authManager.register(authUsername, authPassword);
      setRegisteredWords(res.recoveryWords);
      setAuthSuccess("Registration successful! Account & encryption keys initialized.");
      if (onAuthStateChanged) onAuthStateChanged();
      await loadData();
    } catch (err: any) {
      setAuthError(err.message || "Registration failed.");
    }
  };

  const handleInAppLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    try {
      await sdk.authManager.login(authUsername, authPassword);
      setAuthSuccess("Vault unlocked! Session active.");
      if (onAuthStateChanged) onAuthStateChanged();
      await loadData();
    } catch (err: any) {
      setAuthError(err.message || "Login failed.");
    }
  };

  const handleInAppRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    const words = recoveryPhrase.trim().split(/\s+/);
    if (words.length !== 24) {
      setAuthError("Please provide all 24 words of your BIP-39 recovery phrase.");
      return;
    }

    try {
      await sdk.authManager.recoverWithPhrase(authUsername, words, authPassword || undefined);
      setAuthSuccess("Account recovered and vault unlocked!");
      if (onAuthStateChanged) onAuthStateChanged();
      await loadData();
    } catch (err: any) {
      setAuthError(err.message || "Recovery failed.");
    }
  };

  const handleInAppLogout = async () => {
    await sdk.authManager.logout();
    setRegisteredWords(null);
    setAuthSuccess("");
    setAuthError("");
    if (onAuthStateChanged) onAuthStateChanged();
    await loadData();
  };

  const handleQuickSwitchUser = async (username: string, pass: string) => {
    setAuthError("");
    setAuthSuccess("");
    try {
      // If currently logged in, logout first
      if (sdk.authManager.isLoggedIn()) {
        await sdk.authManager.logout();
      }
      await sdk.authManager.login(username, pass);
      setAuthSuccess(`Switched to user '${username}'`);
      if (onAuthStateChanged) onAuthStateChanged();
      await loadData();
    } catch (err: any) {
      // If user doesn't exist, register them
      try {
        const res = await sdk.authManager.register(username, pass);
        setRegisteredWords(res.recoveryWords);
        setAuthSuccess(`Created & logged into user '${username}'`);
        if (onAuthStateChanged) onAuthStateChanged();
        await loadData();
      } catch (regErr: any) {
        setAuthError(`Quick login failed: ${err.message}`);
      }
    }
  };

  // --- RECORD HANDLERS ---
  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim()) return;

    let workerPasswordHash: string | undefined = undefined;
    let workerSaltHex: string | undefined = undefined;
    const workerId = `wrk_${Date.now()}`;

    if (newWorkerLoginEnabled && newWorkerPassword.trim()) {
      workerSaltHex = CryptoManager.bytesToHex(CryptoManager.getRandomBytes(16));
      workerPasswordHash = await CryptoManager.deriveAuthProofHash(newWorkerPassword.trim(), workerSaltHex);
    }

    const worker: Worker = {
      id: workerId,
      name: newWorkerName.trim(),
      phone: newWorkerPhone.trim(),
      dailyWage: parseFloat(newWorkerWage) || 850,
      skill: newWorkerSkill,
      aadhaarNumber: newWorkerAadhaar.trim() || undefined,
      createdAt: new Date().toISOString(),
      isWorkerLoginEnabled: newWorkerLoginEnabled,
      workerPasswordHash,
      workerSaltHex,
    };

    await sdk.saveAppRecord("shramik_hisab", "workers", worker);
    setNewWorkerName("");
    setNewWorkerPhone("");
    setNewWorkerAadhaar("");
    setNewWorkerLoginEnabled(false);
    setNewWorkerPassword("");
    await loadData();
  };

  const handleDeleteWorker = async (id: string) => {
    if (confirm("Are you sure you want to remove this laborer?")) {
      await sdk.deleteAppRecord("shramik_hisab", "workers", id);
      await loadData();
    }
  };

  const handleLogAttendance = async (workerId: string, status: Attendance["status"], overtimeHours?: number) => {
    const attRecord: Attendance = {
      id: `att_${workerId}_${selectedAttDate}`,
      workerId,
      date: selectedAttDate,
      status,
      overtimeHours: status === "OVERTIME" ? overtimeHours || 2 : undefined,
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
      notes: payNotes.trim() || undefined,
    };

    await sdk.saveAppRecord("shramik_hisab", "payments", payment);
    setPayAmount("");
    setPayNotes("");
    await loadData();
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAmount) return;

    const exp: Expense = {
      id: `exp_${Date.now()}`,
      category: expenseCat,
      amount: parseFloat(expenseAmount),
      description: expenseDesc.trim(),
      date: new Date().toISOString().split("T")[0],
    };

    await sdk.saveAppRecord("shramik_hisab", "expenses", exp);
    setExpenseAmount("");
    setExpenseDesc("");
    await loadData();
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg("Encrypting state & synchronizing with GitHub...");
    setSyncErrorMsg("");
    try {
      const res = await sdk.syncApp("shramik_hisab");
      setSyncStatusMsg(`Sync Complete! Pushed: ${res.pushedCount}, Pulled: ${res.pulledCount}`);
      await loadData();
    } catch (err: any) {
      setSyncErrorMsg(`Sync Failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(""), 5000);
    }
  };

  const handleRestoreFromCloud = async () => {
    setIsRestoring(true);
    setSyncStatusMsg("Restoring encrypted ledger from GitHub...");
    setSyncErrorMsg("");
    try {
      const count = await sdk.restoreFromCloud("shramik_hisab");
      setSyncStatusMsg(`Restoration Complete! Retrieved ${count} records from GitHub.`);
      await loadData();
    } catch (err: any) {
      setSyncErrorMsg(`Restore Failed: ${err.message}`);
    } finally {
      setIsRestoring(false);
      setTimeout(() => setSyncStatusMsg(""), 5000);
    }
  };

  // Financial calculations
  const getWorkerStats = (workerId: string, dailyWage: number) => {
    const wAtt = attendance.filter((a) => a.workerId === workerId);
    let totalEarned = 0;
    let daysPresent = 0;
    let daysHalf = 0;
    let daysOvertime = 0;

    wAtt.forEach((a) => {
      if (a.status === "PRESENT") {
        totalEarned += dailyWage;
        daysPresent += 1;
      } else if (a.status === "HALF_DAY") {
        totalEarned += dailyWage * 0.5;
        daysHalf += 1;
      } else if (a.status === "OVERTIME") {
        const otRate = (dailyWage / 8) * 1.5;
        totalEarned += dailyWage + (a.overtimeHours || 2) * otRate;
        daysOvertime += 1;
      }
    });

    const wPay = payments.filter((p) => p.workerId === workerId);
    let totalPaid = 0;
    let totalAdvances = 0;

    wPay.forEach((p) => {
      totalPaid += p.amount;
      if (p.type === "ADVANCE") totalAdvances += p.amount;
    });

    return {
      totalEarned: Math.round(totalEarned),
      totalPaid: Math.round(totalPaid),
      totalAdvances: Math.round(totalAdvances),
      balance: Math.round(totalEarned - totalPaid),
      daysPresent,
      daysHalf,
      daysOvertime,
    };
  };

  const totalWorkers = workers.length;
  let totalWagesEarned = 0;
  let totalPaymentsDisbursed = 0;
  let totalOutstandingBalance = 0;

  workers.forEach((w) => {
    const s = getWorkerStats(w.id, w.dailyWage);
    totalWagesEarned += s.totalEarned;
    totalPaymentsDisbursed += s.totalPaid;
    totalOutstandingBalance += s.balance;
  });

  const totalSiteExpenses = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  // --- RENDER LOCKED / AUTHENTICATION VIEW ---
  if (!isLoggedIn) {
    return (
      <div className="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl p-6 sm:p-10 max-w-2xl mx-auto my-6 text-stone-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/5">
            <Lock className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-900 border border-stone-800 rounded-full text-xs font-mono text-amber-400 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            app_id: shramik_hisab
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-100">Shramik Hisab Pro</h2>
          <p className="text-stone-400 text-sm mt-1">
            Zero-Knowledge Encrypted Labor & Expense Ledger
          </p>
          <p className="text-stone-500 text-xs mt-2 max-w-md mx-auto">
            Please log in or create an account to unlock your isolated labor records. Each contractor has a completely separate, encrypted database.
          </p>
        </div>

        {/* Auth Mode Switcher */}
        <div className="flex bg-stone-900 border border-stone-800 p-1 rounded-xl mb-6 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setAuthMode("LOGIN");
              setAuthError("");
            }}
            className={`flex-1 py-2 rounded-lg transition ${
              authMode === "LOGIN" ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("REGISTER");
              setAuthError("");
            }}
            className={`flex-1 py-2 rounded-lg transition ${
              authMode === "REGISTER" ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Register New User
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("RECOVER");
              setAuthError("");
            }}
            className={`flex-1 py-2 rounded-lg transition ${
              authMode === "RECOVER" ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            24-Word Recovery
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("WORKER");
              setAuthError("");
            }}
            className={`flex-1 py-2 rounded-lg transition ${
              authMode === "WORKER" ? "bg-amber-500 text-stone-950 font-bold" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            Worker Login
          </button>
        </div>

        {/* Error / Success Alerts */}
        {authError && (
          <div className="p-3 mb-4 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{authError}</span>
          </div>
        )}
        {authSuccess && (
          <div className="p-3 mb-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{authSuccess}</span>
          </div>
        )}

        {/* REGISTER WORDS MODAL */}
        {registeredWords && (
          <div className="p-4 mb-6 bg-amber-950/30 border border-amber-800/50 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
              <Key className="w-4 h-4" /> Save Your 24-Word BIP-39 Recovery Phrase:
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 p-3 bg-stone-950/80 rounded-lg border border-amber-900/30 text-[11px] font-mono text-amber-200">
              {registeredWords.map((word, i) => (
                <div key={i} className="truncate">
                  <span className="text-stone-500 text-[10px] mr-1">{i + 1}.</span>
                  {word}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRegisteredWords(null)}
              className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs rounded-lg transition"
            >
              I Have Saved My Recovery Phrase
            </button>
          </div>
        )}

        {/* LOGIN FORM */}
        {authMode === "LOGIN" && (
          <form onSubmit={handleInAppLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Contractor / User Name</label>
              <input
                type="text"
                required
                placeholder="e.g. ramesh_contractor"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Vault Password</label>
              <input
                type="password"
                required
                placeholder="Enter password (min 6 chars)"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2"
            >
              <Unlock className="w-4 h-4" /> Unlock Shramik Hisab Vault
            </button>
          </form>
        )}

        {/* REGISTER FORM */}
        {authMode === "REGISTER" && (
          <form onSubmit={handleInAppRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">New Contractor Name</label>
              <input
                type="text"
                required
                placeholder="e.g. suresh_builder"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Master Password</label>
              <input
                type="password"
                required
                placeholder="Create secure password (min 6 chars)"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <p className="text-[11px] text-stone-500">
              Registration generates a 256-bit cryptographic AES key on your device. Your password never leaves your browser in plain text.
            </p>
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Encrypted User Account
            </button>
          </form>
        )}

        {/* RECOVER FORM */}
        {authMode === "RECOVER" && (
          <form onSubmit={handleInAppRecover} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Contractor / User Name</label>
              <input
                type="text"
                required
                placeholder="Enter your account username"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">24-Word Recovery Phrase</label>
              <textarea
                required
                rows={3}
                placeholder="Enter 24 words separated by spaces..."
                value={recoveryPhrase}
                onChange={(e) => setRecoveryPhrase(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs font-mono text-amber-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">New Password (Optional)</label>
              <input
                type="password"
                placeholder="Leave blank to retain current password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" /> Recover Vault & Log In
            </button>
          </form>
        )}

        {/* WORKER LOGIN FORM */}
        {authMode === "WORKER" && !workerSession && (
          <form onSubmit={handleWorkerLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Worker ID</label>
              <input
                type="text"
                required
                placeholder="e.g. wrk_123456"
                value={workerLoginId}
                onChange={(e) => setWorkerLoginId(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">Worker Password</label>
              <input
                type="password"
                required
                placeholder="Enter worker password"
                value={workerLoginPassword}
                onChange={(e) => setWorkerLoginPassword(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" /> Log In as Laborer (No Owner Required)
            </button>
          </form>
        )}

        {/* WORKER SESSION SUCCESS VIEW */}
        {authMode === "WORKER" && workerSession && (
          <div className="p-5 bg-stone-900 border border-amber-500/30 rounded-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-stone-100">Worker Portal Active</h3>
            <p className="text-xs text-stone-400">
              Authenticated Worker ID: <span className="font-mono text-amber-400">{workerSession.authenticatedWorkerId}</span>
            </p>
            <p className="text-xs text-stone-400">
              Owner Opaque User ID: <span className="font-mono text-stone-300">{workerSession.opaqueUserId}</span>
            </p>
            <div className="p-3 bg-stone-950 rounded-lg border border-stone-800 text-xs text-stone-300">
              Global Worker Authentication verified successfully via Vault API without owner session.
            </div>
            <button
              onClick={() => setWorkerSession(null)}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-lg transition"
            >
              Log Out Worker Session
            </button>
          </div>
        )}

        {/* One-Click Quick User Preset Switcher */}
        <div className="mt-8 pt-6 border-t border-stone-800/80">
          <div className="flex items-center justify-between text-xs text-stone-400 mb-3">
            <span className="font-semibold text-stone-300 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" /> One-Click User Isolation Test Presets:
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickSwitchUser("contractor_ramesh", "RameshPass123!")}
              className="p-2.5 bg-stone-900 hover:bg-stone-800/80 border border-stone-800 rounded-lg text-left text-xs transition"
            >
              <div className="font-semibold text-amber-300 flex items-center justify-between">
                <span>User A: Contractor Ramesh</span>
                <ChevronRight className="w-3.5 h-3.5 text-stone-500" />
              </div>
              <p className="text-[10px] text-stone-400 mt-0.5 font-mono">user: contractor_ramesh</p>
            </button>
            <button
              type="button"
              onClick={() => handleQuickSwitchUser("builder_suresh", "SureshPass123!")}
              className="p-2.5 bg-stone-900 hover:bg-stone-800/80 border border-stone-800 rounded-lg text-left text-xs transition"
            >
              <div className="font-semibold text-amber-300 flex items-center justify-between">
                <span>User B: Builder Suresh</span>
                <ChevronRight className="w-3.5 h-3.5 text-stone-500" />
              </div>
              <p className="text-[10px] text-stone-400 mt-0.5 font-mono">user: builder_suresh</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER AUTHENTICATED SHRAMIK HISAB PRO APP ---
  return (
    <div className="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Top Header Banner with Real-time User Identity */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-950/40 via-stone-900 to-stone-950 border-b border-stone-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
              appId: shramik_hisab
            </span>
            <span className="px-2.5 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> AES-256-GCM
            </span>
            {pendingCount > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" /> {pendingCount} Pending Local
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-100 mt-2 flex items-center gap-2">
            Shramik Hisab Pro
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-400 mt-1">
            <span className="flex items-center gap-1.5 text-stone-200">
              <User className="w-3.5 h-3.5 text-amber-400" />
              Contractor: <strong className="text-amber-300">{profile?.username || "Active User"}</strong>
            </span>
            <span className="text-stone-600">•</span>
            <span className="font-mono text-[11px] text-stone-500">
              UID: {profile?.userId ? `${profile.userId.slice(0, 10)}...` : "u_anon"}
            </span>
          </div>
        </div>

        {/* Sync & Account Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing || isRestoring}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-lg flex items-center gap-1.5 transition disabled:opacity-50 shadow-md shadow-amber-500/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync to GitHub"}
          </button>
          <button
            onClick={handleRestoreFromCloud}
            disabled={isSyncing || isRestoring}
            className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs rounded-lg flex items-center gap-1.5 transition disabled:opacity-50 border border-stone-700"
          >
            <DownloadCloud className={`w-3.5 h-3.5 ${isRestoring ? "animate-spin" : ""}`} />
            {isRestoring ? "Restoring..." : "Restore Cloud"}
          </button>
          <button
            onClick={handleInAppLogout}
            title="Lock Vault & Revoke Session"
            className="px-3 py-2 bg-stone-900 hover:bg-red-950/40 text-stone-400 hover:text-red-400 border border-stone-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatusMsg && (
        <div className="px-6 py-2.5 bg-emerald-950/30 border-b border-emerald-800/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {syncStatusMsg}
        </div>
      )}
      {syncErrorMsg && (
        <div className="px-6 py-2.5 bg-red-950/30 border-b border-red-800/40 text-red-300 text-xs font-mono flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
          {syncErrorMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-stone-800 bg-stone-900/50 scrollbar-none">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === "dashboard"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Overview
        </button>
        <button
          onClick={() => setActiveTab("workers")}
          className={`py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === "workers"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Users className="w-4 h-4" /> Laborers ({workers.length})
        </button>
        <button
          onClick={() => setActiveTab("attendance")}
          className={`py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === "attendance"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Calendar className="w-4 h-4" /> Daily Attendance
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === "payments"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <DollarSign className="w-4 h-4" /> Payments / Advances
        </button>
        <button
          onClick={() => setActiveTab("expenses")}
          className={`py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === "expenses"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Receipt className="w-4 h-4" /> Site Expenses
        </button>
        <button
          onClick={() => setActiveTab("account")}
          className={`py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === "account"
              ? "border-amber-500 text-amber-400 bg-amber-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Key className="w-4 h-4" /> User Isolation & Account
        </button>
      </div>

      {/* TAB CONTENTS */}
      <div className="p-4 sm:p-6">
        {/* DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl">
                <div className="flex items-center justify-between text-stone-400 text-xs mb-2">
                  <span>Active Laborers</span>
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-stone-100">{totalWorkers}</div>
                <p className="text-[11px] text-stone-500 mt-1">Scoped to {profile?.username}</p>
              </div>

              <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl">
                <div className="flex items-center justify-between text-stone-400 text-xs mb-2">
                  <span>Total Wages Earned</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400">₹{totalWagesEarned.toLocaleString()}</div>
                <p className="text-[11px] text-stone-500 mt-1">From recorded roll calls</p>
              </div>

              <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl">
                <div className="flex items-center justify-between text-stone-400 text-xs mb-2">
                  <span>Net Balance Due</span>
                  <CreditCard className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-amber-300">₹{totalOutstandingBalance.toLocaleString()}</div>
                <p className="text-[11px] text-stone-500 mt-1">After advances (₹{totalPaymentsDisbursed.toLocaleString()})</p>
              </div>

              <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl">
                <div className="flex items-center justify-between text-stone-400 text-xs mb-2">
                  <span>Site Materials & Expenses</span>
                  <Receipt className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-cyan-300">₹{totalSiteExpenses.toLocaleString()}</div>
                <p className="text-[11px] text-stone-500 mt-1">{expenses.length} expense items</p>
              </div>
            </div>

            {/* Quick Summary Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Laborer Balances Preview */}
              <div className="p-4 bg-stone-900/60 border border-stone-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase font-mono text-stone-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-400" /> Laborer Balances
                  </h4>
                  <button
                    onClick={() => setActiveTab("workers")}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center"
                  >
                    View all <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {workers.length === 0 ? (
                  <p className="text-xs text-stone-500 py-4 text-center">No laborers registered for this contractor.</p>
                ) : (
                  <div className="space-y-2">
                    {workers.slice(0, 4).map((w) => {
                      const st = getWorkerStats(w.id, w.dailyWage);
                      return (
                        <div key={w.id} className="p-2.5 bg-stone-950 rounded-lg flex items-center justify-between text-xs">
                          <div>
                            <span className="font-medium text-stone-200">{w.name}</span>
                            <span className="text-[10px] text-stone-500 ml-2 font-mono">{w.skill}</span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-amber-300 font-semibold">₹{st.balance}</span>
                            <span className="text-[10px] text-stone-500 block">due</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Site Expenses Preview */}
              <div className="p-4 bg-stone-900/60 border border-stone-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase font-mono text-stone-300 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-amber-400" /> Recent Site Expenses
                  </h4>
                  <button
                    onClick={() => setActiveTab("expenses")}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center"
                  >
                    View all <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {expenses.length === 0 ? (
                  <p className="text-xs text-stone-500 py-4 text-center">No site expenses recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {expenses.slice(0, 4).map((e) => (
                      <div key={e.id} className="p-2.5 bg-stone-950 rounded-lg flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-amber-300">{e.category}</span>
                          <span className="text-[10px] text-stone-500 ml-2">{e.description || e.date}</span>
                        </div>
                        <div className="font-mono text-stone-100 font-semibold">
                          ₹{e.amount}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* WORKERS TAB */}
        {activeTab === "workers" && (
          <div className="space-y-6">
            {/* Add Worker Form */}
            <form onSubmit={handleAddWorker} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-400" /> Register Laborer for Contractor ({profile?.username})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Laborer Name *"
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
                  <option value="Carpenter">Carpenter</option>
                  <option value="Supervisor">Supervisor</option>
                </select>
                <input
                  type="number"
                  placeholder="Daily Wage (₹)"
                  value={newWorkerWage}
                  onChange={(e) => setNewWorkerWage(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-lg transition shadow-md shadow-amber-500/10"
                >
                  Add Laborer
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-stone-800 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newWorkerLoginEnabled}
                    onChange={(e) => setNewWorkerLoginEnabled(e.target.checked)}
                    className="rounded bg-stone-950 border-stone-800 text-amber-500 focus:ring-0"
                  />
                  <span>Enable Worker Portal Login (Global Auth Index)</span>
                </label>
                {newWorkerLoginEnabled && (
                  <input
                    type="password"
                    required={newWorkerLoginEnabled}
                    placeholder="Set Worker Portal Password"
                    value={newWorkerPassword}
                    onChange={(e) => setNewWorkerPassword(e.target.value)}
                    className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                  />
                )}
              </div>
            </form>

            {/* Workers Table */}
            <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-900/30">
              <table className="w-full text-left text-xs text-stone-300">
                <thead className="bg-stone-900 text-stone-400 uppercase font-mono text-[10px] border-b border-stone-800">
                  <tr>
                    <th className="p-3">Laborer Name</th>
                    <th className="p-3">Skill / Category</th>
                    <th className="p-3">Daily Wage</th>
                    <th className="p-3">Attendance Days</th>
                    <th className="p-3">Total Earned</th>
                    <th className="p-3">Paid / Advances</th>
                    <th className="p-3">Balance Due</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {workers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-stone-500">
                        No laborers registered for {profile?.username}. Add your first worker above.
                      </td>
                    </tr>
                  ) : (
                    workers.map((w) => {
                      const stats = getWorkerStats(w.id, w.dailyWage);
                      return (
                        <tr key={w.id} className="hover:bg-stone-800/30 transition">
                          <td className="p-3 font-medium text-stone-100">
                            <div>{w.name}</div>
                            {w.phone && <span className="text-[10px] text-stone-500 font-mono">{w.phone}</span>}
                          </td>
                          <td className="p-3 text-stone-400">{w.skill}</td>
                          <td className="p-3 font-mono text-amber-400">₹{w.dailyWage}</td>
                          <td className="p-3 font-mono text-stone-300">
                            {stats.daysPresent}P / {stats.daysHalf}H / {stats.daysOvertime}OT
                          </td>
                          <td className="p-3 font-mono text-emerald-400 font-semibold">₹{stats.totalEarned}</td>
                          <td className="p-3 font-mono text-stone-300">₹{stats.totalPaid}</td>
                          <td className="p-3 font-mono font-bold text-amber-300">₹{stats.balance}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteWorker(w.id)}
                              title="Delete Worker"
                              className="p-1.5 text-stone-500 hover:text-red-400 transition rounded hover:bg-stone-800"
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
            <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-200">Daily Attendance Roll Call</h3>
                <p className="text-xs text-stone-400">Punch daily work status for each laborer</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400 font-mono">Roll Date:</span>
                <input
                  type="date"
                  value={selectedAttDate}
                  onChange={(e) => setSelectedAttDate(e.target.value)}
                  className="px-3 py-1.5 bg-stone-950 border border-stone-800 rounded-lg text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {workers.length === 0 ? (
              <div className="p-8 text-center bg-stone-900/30 border border-stone-800 rounded-xl text-stone-500 text-xs">
                No laborers registered yet. Please add workers in the Laborers tab first.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {workers.map((w) => {
                  const currentAtt = attendance.find((a) => a.workerId === w.id && a.date === selectedAttDate);

                  return (
                    <div key={w.id} className="p-4 bg-stone-900 border border-stone-800 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div>
                        <h4 className="text-sm font-medium text-stone-100">{w.name}</h4>
                        <p className="text-xs text-stone-400">{w.skill} • ₹{w.dailyWage}/day</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleLogAttendance(w.id, "PRESENT")}
                          className={`px-3 py-1 text-xs font-mono rounded transition ${
                            currentAtt?.status === "PRESENT"
                              ? "bg-emerald-500 text-stone-950 font-bold shadow-md shadow-emerald-500/20"
                              : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                          }`}
                        >
                          Present
                        </button>
                        <button
                          onClick={() => handleLogAttendance(w.id, "HALF_DAY")}
                          className={`px-3 py-1 text-xs font-mono rounded transition ${
                            currentAtt?.status === "HALF_DAY"
                              ? "bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-500/20"
                              : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                          }`}
                        >
                          Half (½)
                        </button>
                        <button
                          onClick={() => handleLogAttendance(w.id, "OVERTIME", 2)}
                          className={`px-3 py-1 text-xs font-mono rounded transition ${
                            currentAtt?.status === "OVERTIME"
                              ? "bg-purple-500 text-stone-100 font-bold shadow-md shadow-purple-500/20"
                              : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                          }`}
                        >
                          OT (+2h)
                        </button>
                        <button
                          onClick={() => handleLogAttendance(w.id, "ABSENT")}
                          className={`px-3 py-1 text-xs font-mono rounded transition ${
                            currentAtt?.status === "ABSENT"
                              ? "bg-red-500 text-stone-100 font-bold shadow-md shadow-red-500/20"
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
            )}
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === "payments" && (
          <div className="space-y-6">
            <form onSubmit={handleAddPayment} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" /> Record Wage Payment / Advance
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <select
                  required
                  value={payWorkerId}
                  onChange={(e) => setPayWorkerId(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select Laborer *</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.skill})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  required
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
                <input
                  type="text"
                  placeholder="Notes (e.g. Festival advance)"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-lg transition shadow-md shadow-amber-500/10"
                >
                  Disburse
                </button>
              </div>
            </form>

            <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-900/30">
              <table className="w-full text-left text-xs text-stone-300">
                <thead className="bg-stone-900 text-stone-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Laborer</th>
                    <th className="p-3">Payment Type</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3 font-mono text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-stone-500">
                        No payments recorded for {profile?.username}.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => {
                      const w = workers.find((x) => x.id === p.workerId);
                      return (
                        <tr key={p.id} className="hover:bg-stone-800/30 transition">
                          <td className="p-3 text-stone-400 font-mono">{p.date}</td>
                          <td className="p-3 font-medium text-stone-100">{w?.name || p.workerId}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                p.type === "ADVANCE"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}
                            >
                              {p.type === "ADVANCE" ? "CASH ADVANCE" : "WAGE DISBURSED"}
                            </span>
                          </td>
                          <td className="p-3 text-stone-400">{p.notes || "-"}</td>
                          <td className="p-3 font-mono font-bold text-amber-400 text-right">₹{p.amount}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* EXPENSES TAB */}
        {activeTab === "expenses" && (
          <div className="space-y-6">
            <form onSubmit={handleAddExpense} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" /> Record Site / Material Expense
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={expenseCat}
                  onChange={(e) => setExpenseCat(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="Cement & Material">Cement & Material</option>
                  <option value="Bricks & Sand">Bricks & Sand</option>
                  <option value="Steel & TMT Bars">Steel & TMT Bars</option>
                  <option value="Tools & Hardware">Tools & Hardware</option>
                  <option value="Transport & Fuel">Transport & Fuel</option>
                  <option value="Chai & Snacks">Chai & Snacks</option>
                  <option value="Equipment Rental">Equipment Rental</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
                <input
                  type="number"
                  required
                  placeholder="Amount (₹) *"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  placeholder="Description / Supplier / Bill No"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-xs rounded-lg transition shadow-md shadow-amber-500/10"
                >
                  Save Expense
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
                    <th className="p-3 font-mono text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-stone-500">
                        No expenses logged for {profile?.username}.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e) => (
                      <tr key={e.id} className="hover:bg-stone-800/30 transition">
                        <td className="p-3 text-stone-400 font-mono">{e.date}</td>
                        <td className="p-3 font-medium text-amber-300">{e.category}</td>
                        <td className="p-3 text-stone-300">{e.description || "-"}</td>
                        <td className="p-3 font-mono font-bold text-amber-400 text-right">₹{e.amount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ACCOUNT & USER ISOLATION TAB */}
        {activeTab === "account" && (
          <div className="space-y-6">
            <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <h3 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" /> Active Cryptographic Session
                </h3>
                <span className="px-2.5 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                  SESSION_ACTIVE
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3 bg-stone-950 rounded-lg border border-stone-800">
                  <span className="text-stone-500 block text-[10px]">USERNAME</span>
                  <span className="text-amber-300 font-bold">{profile?.username}</span>
                </div>
                <div className="p-3 bg-stone-950 rounded-lg border border-stone-800">
                  <span className="text-stone-500 block text-[10px]">OPAQUE USER ID</span>
                  <span className="text-stone-300">{profile?.userId}</span>
                </div>
                <div className="p-3 bg-stone-950 rounded-lg border border-stone-800">
                  <span className="text-stone-500 block text-[10px]">APPLICATION ID</span>
                  <span className="text-amber-400">shramik_hisab</span>
                </div>
                <div className="p-3 bg-stone-950 rounded-lg border border-stone-800">
                  <span className="text-stone-500 block text-[10px]">STORAGE LOCATION</span>
                  <span className="text-stone-300">data/users/{profile?.userId?.slice(0, 12)}.../vault/shramik_hisab/</span>
                </div>
              </div>

              <div className="p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-lg text-xs text-amber-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" /> Strict Multi-User Data Isolation Guarantee
                </div>
                <p className="text-[11px] text-stone-400">
                  All labor records, attendance sheets, and financial ledgers are encrypted with your unique, client-derived AES-256-GCM DEK. User A can never decrypt or access User B's records.
                </p>
              </div>
            </div>

            {/* Quick Switch User */}
            <div className="p-5 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-amber-400" /> Switch Account / Test Another Contractor
              </h3>
              <p className="text-xs text-stone-400">
                Log into another contractor profile to verify strict data isolation (User A ≠ User B).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleQuickSwitchUser("contractor_ramesh", "RameshPass123!")}
                  className="p-3 bg-stone-950 hover:bg-stone-800 border border-stone-800 rounded-lg text-left text-xs transition"
                >
                  <div className="font-semibold text-amber-300 flex items-center justify-between">
                    <span>Switch to Contractor Ramesh</span>
                    <ChevronRight className="w-4 h-4 text-stone-500" />
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1 font-mono">user: contractor_ramesh</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSwitchUser("builder_suresh", "SureshPass123!")}
                  className="p-3 bg-stone-950 hover:bg-stone-800 border border-stone-800 rounded-lg text-left text-xs transition"
                >
                  <div className="font-semibold text-amber-300 flex items-center justify-between">
                    <span>Switch to Builder Suresh</span>
                    <ChevronRight className="w-4 h-4 text-stone-500" />
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1 font-mono">user: builder_suresh</p>
                </button>
              </div>
            </div>

            {/* Safe Logout Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleInAppLogout}
                className="w-full py-3 bg-stone-900 hover:bg-red-950/40 text-stone-300 hover:text-red-400 border border-stone-800 hover:border-red-800/50 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <LogOut className="w-4 h-4" /> Lock Vault & Sign Out of {profile?.username}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
