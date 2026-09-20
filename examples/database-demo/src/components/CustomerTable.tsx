import React from "react";
import {
  Edit3,
  Trash2,
  Phone,
  Mail,
  Calendar,
  Sparkles,
  Loader2,
  Users,
  Search,
} from "lucide-react";
import { CustomerRecord } from "../types";

interface CustomerTableProps {
  records: CustomerRecord[];
  isLoading: boolean;
  onEdit: (record: CustomerRecord) => void;
  onDelete: (record: CustomerRecord) => void;
  onAddNew: () => void;
  filterValue: string;
}

export const CustomerTable: React.FC<CustomerTableProps> = ({
  records,
  isLoading,
  onEdit,
  onDelete,
  onAddNew,
  filterValue,
}) => {
  const getTierBadge = (tier?: string) => {
    switch (tier) {
      case "Enterprise":
        return "bg-purple-500/10 border-purple-500/30 text-purple-300";
      case "Premium":
        return "bg-amber-500/10 border-amber-500/30 text-amber-300";
      default:
        return "bg-sky-500/10 border-sky-500/30 text-sky-300";
    }
  };

  if (isLoading && records.length === 0) {
    return (
      <div
        id="loading-table-state"
        className="bg-slate-900/60 border border-slate-800 rounded-2xl p-16 flex flex-col items-center justify-center text-center"
      >
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-200">Decrypting and loading customer records...</p>
        <p className="text-xs text-slate-500 mt-1">Retrieving encrypted commits from GitHub storage via REST API</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div
        id="empty-table-state"
        className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-16 flex flex-col items-center justify-center text-center"
      >
        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4">
          {filterValue ? <Search className="w-6 h-6" /> : <Users className="w-6 h-6" />}
        </div>
        <h3 className="text-base font-semibold text-slate-100">
          {filterValue ? "No matching customers found" : "No customer records in this collection"}
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed">
          {filterValue
            ? `No records found matching "${filterValue}". Try adjusting your filter term.`
            : "Start by creating your first customer record. It will be encrypted with AES-GCM-256 and committed securely."}
        </p>
        {!filterValue && (
          <button
            id="empty-state-add-button"
            onClick={onAddNew}
            className="mt-5 px-4 py-2 text-xs font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-xl transition-colors flex items-center gap-2 shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            <span>Create First Customer</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-sm">
      <div className="overflow-x-auto">
        <table id="customers-table" className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3.5 px-5">Customer</th>
              <th className="py-3.5 px-5">Contact Details</th>
              <th className="py-3.5 px-5">Tier</th>
              <th className="py-3.5 px-5">Commit SHA / ID</th>
              <th className="py-3.5 px-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-sm">
            {records.map((record) => {
              const { data, recordId, sha } = record;
              return (
                <tr
                  key={recordId}
                  id={`customer-row-${recordId}`}
                  className="hover:bg-slate-800/30 transition-colors group"
                >
                  {/* Name & Notes */}
                  <td className="py-4 px-5">
                    <div className="font-medium text-slate-100">{data.name}</div>
                    {data.notes && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{data.notes}</div>
                    )}
                  </td>

                  {/* Contact Info */}
                  <td className="py-4 px-5">
                    <div className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{data.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{data.phone}</span>
                      </div>
                    </div>
                  </td>

                  {/* Tier */}
                  <td className="py-4 px-5">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getTierBadge(
                        data.tier
                      )}`}
                    >
                      {data.tier || "Standard"}
                    </span>
                  </td>

                  {/* Commit SHA / Record ID */}
                  <td className="py-4 px-5">
                    <div className="flex flex-col font-mono text-[11px] text-slate-400">
                      <span className="text-slate-300 truncate max-w-[140px]" title={recordId}>
                        ID: {recordId}
                      </span>
                      <span className="text-slate-500 truncate max-w-[140px]" title={sha}>
                        SHA: {sha ? sha.substring(0, 8) : "none"}
                      </span>
                    </div>
                  </td>

                  {/* Action Buttons */}
                  <td className="py-4 px-5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        id={`edit-customer-${recordId}`}
                        onClick={() => onEdit(record)}
                        title="Edit Customer"
                        className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        id={`delete-customer-${recordId}`}
                        onClick={() => onDelete(record)}
                        title="Delete Customer"
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
