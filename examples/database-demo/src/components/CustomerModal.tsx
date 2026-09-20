import React, { useState, useEffect } from "react";
import { X, Save, User, Mail, Phone, Tag, AlignLeft, Loader2 } from "lucide-react";
import { Customer, CustomerRecord } from "../types";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Customer, recordId?: string, expectedSha?: string) => Promise<void>;
  editingRecord: CustomerRecord | null;
  isLoading: boolean;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingRecord,
  isLoading,
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState<"Standard" | "Premium" | "Enterprise">("Standard");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (editingRecord) {
      setName(editingRecord.data.name || "");
      setEmail(editingRecord.data.email || "");
      setPhone(editingRecord.data.phone || "");
      setTier(editingRecord.data.tier || "Standard");
      setNotes(editingRecord.data.notes || "");
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setTier("Standard");
      setNotes("");
    }
    setFormError("");
  }, [editingRecord, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Customer Name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setFormError("A valid Email address is required.");
      return;
    }
    if (!phone.trim()) {
      setFormError("Phone number is required.");
      return;
    }

    setFormError("");
    const customerPayload: Customer = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      tier,
      notes: notes.trim(),
      updatedAt: new Date().toISOString(),
      createdAt: editingRecord?.data.createdAt || new Date().toISOString(),
    };

    try {
      await onSave(
        customerPayload,
        editingRecord?.recordId,
        editingRecord?.sha
      );
      onClose();
    } catch (err: any) {
      setFormError(err.message || "Failed to save customer record.");
    }
  };

  return (
    <div
      id="customer-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        id="customer-modal-container"
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <User className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-slate-100 text-base">
              {editingRecord ? "Edit Customer Record" : "Add New Customer"}
            </h3>
          </div>
          <button
            id="close-modal-button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
              {formError}
            </div>
          )}

          {editingRecord && (
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1">
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>Record ID: {editingRecord.recordId}</span>
                <span>SHA: {editingRecord.sha.substring(0, 10)}...</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" /> Full Name *
            </label>
            <input
              id="customer-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              required
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Email Address *
              </label>
              <input
                id="customer-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone Number *
              </label>
              <input
                id="customer-phone-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-1234"
                required
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" /> Customer Tier
            </label>
            <select
              id="customer-tier-select"
              value={tier}
              onChange={(e) => setTier(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="Standard">Standard</option>
              <option value="Premium">Premium</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-slate-400" /> Notes (Optional)
            </label>
            <textarea
              id="customer-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional client details or custom notes..."
              rows={3}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              id="cancel-customer-button"
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              id="save-customer-button"
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-sm font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center gap-2 shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Encrypting & Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{editingRecord ? "Update Customer" : "Save Customer"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
