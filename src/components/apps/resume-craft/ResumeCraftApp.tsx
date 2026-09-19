/**
 * ResumeCraft Pro - Production Resume & CV Builder Application
 * Demonstrates multi-app isolation on the same GitHub Encrypted Storage SDK (`app_id = resume_craft`).
 */

import React, { useState, useEffect } from "react";
import { CentralDataClient } from "../../../sdk/CentralDataClient";
import { FileText, Briefcase, GraduationCap, Award, RefreshCw, Plus, Trash2, CheckCircle2, ShieldCheck, Download } from "lucide-react";

interface ResumeProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  targetRole: string;
  summary: string;
  updatedAt: string;
}

interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  duration: string;
  highlights: string;
}

interface EducationItem {
  id: string;
  degree: string;
  institution: string;
  year: string;
}

export const ResumeCraftApp: React.FC<{ sdk: CentralDataClient }> = ({ sdk }) => {
  const [activeTab, setActiveTab] = useState<"profile" | "experience" | "education" | "preview">("profile");

  const [profile, setProfile] = useState<ResumeProfile>({
    id: "main_resume",
    fullName: "Aarav Sharma",
    email: "aarav.sharma@example.com",
    phone: "+91 98765 43210",
    targetRole: "Senior Full Stack Engineer",
    summary: "Passionate engineer specialized in decentralized systems, browser security, and modern web applications.",
    updatedAt: new Date().toISOString(),
  });

  const [experiences, setExperiences] = useState<ExperienceItem[]>([]);
  const [education, setEducation] = useState<EducationItem[]>([]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState("");

  // New Inputs
  const [expCompany, setExpCompany] = useState("");
  const [expRole, setExpRole] = useState("");
  const [expDuration, setExpDuration] = useState("");
  const [expHighlights, setExpHighlights] = useState("");

  const [eduDegree, setEduDegree] = useState("");
  const [eduInst, setEduInst] = useState("");
  const [eduYear, setEduYear] = useState("");

  useEffect(() => {
    loadData();
  }, [sdk.authManager.isLoggedIn()]);

  const loadData = async () => {
    if (!sdk.authManager.isLoggedIn()) return;
    try {
      const pList = await sdk.getAppRecords<ResumeProfile>("resume_craft", "resumes");
      const xList = await sdk.getAppRecords<ExperienceItem>("resume_craft", "experience");
      const eList = await sdk.getAppRecords<EducationItem>("resume_craft", "education");

      if (pList.length > 0) setProfile(pList[0]);
      setExperiences(xList);
      setEducation(eList);
    } catch (err: any) {
      console.error("Error loading ResumeCraft data:", err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await sdk.saveAppRecord("resume_craft", "resumes", profile);
    setSyncStatusMsg("Resume Profile Saved Locally!");
    setTimeout(() => setSyncStatusMsg(""), 3000);
  };

  const handleAddExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expCompany || !expRole) return;

    const exp: ExperienceItem = {
      id: `exp_${Date.now()}`,
      company: expCompany,
      role: expRole,
      duration: expDuration,
      highlights: expHighlights,
    };

    await sdk.saveAppRecord("resume_craft", "experience", exp);
    setExpCompany("");
    setExpRole("");
    setExpDuration("");
    setExpHighlights("");
    await loadData();
  };

  const handleDeleteExperience = async (id: string) => {
    await sdk.deleteAppRecord("resume_craft", "experience", id);
    await loadData();
  };

  const handleAddEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eduDegree || !eduInst) return;

    const edu: EducationItem = {
      id: `edu_${Date.now()}`,
      degree: eduDegree,
      institution: eduInst,
      year: eduYear,
    };

    await sdk.saveAppRecord("resume_craft", "education", edu);
    setEduDegree("");
    setEduInst("");
    setEduYear("");
    await loadData();
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg("Encrypting ResumeCraft dataset & pushing to GitHub...");
    try {
      const res = await sdk.syncApp("resume_craft");
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
        <ShieldCheck className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
        <h3 className="text-xl font-bold text-stone-100 mb-2">Vault Key Locked</h3>
        <p className="text-stone-400 text-sm max-w-md mx-auto mb-4">
          Please register or log in using the Auth panel in the top header to unlock your encrypted ResumeCraft dataset.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-stone-950 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-r from-indigo-950/40 via-stone-900 to-stone-950 border-b border-stone-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
              app_id: resume_craft
            </span>
            <span className="px-2.5 py-0.5 text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Isolated & Encrypted
            </span>
          </div>
          <h2 className="text-2xl font-bold text-stone-100 mt-2">ResumeCraft Pro</h2>
          <p className="text-stone-400 text-xs">Encrypted CV Builder & Career Document Management System</p>
        </div>

        <button
          onClick={handleTriggerSync}
          disabled={isSyncing}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg flex items-center gap-2 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync Encrypted CV"}
        </button>
      </div>

      {syncStatusMsg && (
        <div className="px-6 py-2.5 bg-indigo-500/10 border-b border-indigo-500/20 text-indigo-300 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          {syncStatusMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-stone-800 bg-stone-900/50">
        <button
          onClick={() => setActiveTab("profile")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "profile"
              ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <FileText className="w-4 h-4" /> Personal Details
        </button>
        <button
          onClick={() => setActiveTab("experience")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "experience"
              ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Briefcase className="w-4 h-4" /> Experience ({experiences.length})
        </button>
        <button
          onClick={() => setActiveTab("education")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "education"
              ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <GraduationCap className="w-4 h-4" /> Education ({education.length})
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={`flex-1 py-3 px-4 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition ${
            activeTab === "preview"
              ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
              : "border-transparent text-stone-400 hover:text-stone-200"
          }`}
        >
          <Award className="w-4 h-4" /> Resume Preview
        </button>
      </div>

      <div className="p-6">
        {/* PROFILE TAB */}
        {activeTab === "profile" && (
          <form onSubmit={handleSaveProfile} className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-stone-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Target Job Title</label>
                <input
                  type="text"
                  value={profile.targetRole}
                  onChange={(e) => setProfile({ ...profile, targetRole: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Phone</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">Professional Summary</label>
              <textarea
                rows={4}
                value={profile.summary}
                onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition"
            >
              Save Profile Changes
            </button>
          </form>
        )}

        {/* EXPERIENCE TAB */}
        {activeTab === "experience" && (
          <div className="space-y-6">
            <form onSubmit={handleAddExperience} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200">Add Work Experience</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Company Name *"
                  value={expCompany}
                  onChange={(e) => setExpCompany(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Job Title / Role *"
                  value={expRole}
                  onChange={(e) => setExpRole(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Duration (e.g., 2022 - Present)"
                  value={expDuration}
                  onChange={(e) => setExpDuration(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <input
                type="text"
                placeholder="Key Accomplishments / Responsibilities"
                value={expHighlights}
                onChange={(e) => setExpHighlights(e.target.value)}
                className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition"
              >
                Add Experience
              </button>
            </form>

            <div className="space-y-3">
              {experiences.map((x) => (
                <div key={x.id} className="p-4 bg-stone-900/50 border border-stone-800 rounded-xl flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-stone-100">{x.role}</h4>
                    <p className="text-xs text-indigo-400">{x.company} • {x.duration}</p>
                    <p className="text-xs text-stone-400 mt-2">{x.highlights}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteExperience(x.id)}
                    className="p-1 text-stone-500 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EDUCATION TAB */}
        {activeTab === "education" && (
          <div className="space-y-6">
            <form onSubmit={handleAddEducation} className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-stone-200">Add Education History</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Degree / Qualification *"
                  value={eduDegree}
                  onChange={(e) => setEduDegree(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Institution / University *"
                  value={eduInst}
                  onChange={(e) => setEduInst(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Year (e.g., 2018 - 2022)"
                  value={eduYear}
                  onChange={(e) => setEduYear(e.target.value)}
                  className="px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-xs text-stone-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition"
              >
                Add Education
              </button>
            </form>

            <div className="space-y-3">
              {education.map((e) => (
                <div key={e.id} className="p-4 bg-stone-900/50 border border-stone-800 rounded-xl">
                  <h4 className="text-sm font-bold text-stone-100">{e.degree}</h4>
                  <p className="text-xs text-indigo-400">{e.institution} • {e.year}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PREVIEW TAB */}
        {activeTab === "preview" && (
          <div className="p-8 bg-stone-900 border border-stone-800 rounded-2xl max-w-3xl mx-auto space-y-6 text-stone-200">
            <div className="border-b border-stone-700 pb-6">
              <h1 className="text-3xl font-extrabold text-stone-100">{profile.fullName}</h1>
              <p className="text-indigo-400 font-medium text-sm mt-1">{profile.targetRole}</p>
              <div className="flex flex-wrap gap-4 text-xs text-stone-400 mt-3 font-mono">
                <span>{profile.email}</span>
                <span>•</span>
                <span>{profile.phone}</span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-stone-400 mb-2">Professional Summary</h3>
              <p className="text-xs leading-relaxed text-stone-300">{profile.summary}</p>
            </div>

            {experiences.length > 0 && (
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-stone-400 mb-3">Work Experience</h3>
                <div className="space-y-4">
                  {experiences.map((x) => (
                    <div key={x.id}>
                      <div className="flex justify-between items-baseline">
                        <h4 className="text-sm font-bold text-stone-100">{x.role}</h4>
                        <span className="text-xs text-stone-500 font-mono">{x.duration}</span>
                      </div>
                      <p className="text-xs text-indigo-400">{x.company}</p>
                      <p className="text-xs text-stone-400 mt-1">{x.highlights}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {education.length > 0 && (
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-stone-400 mb-3">Education</h3>
                <div className="space-y-3">
                  {education.map((e) => (
                    <div key={e.id}>
                      <div className="flex justify-between items-baseline">
                        <h4 className="text-sm font-bold text-stone-100">{e.degree}</h4>
                        <span className="text-xs text-stone-500 font-mono">{e.year}</span>
                      </div>
                      <p className="text-xs text-indigo-400">{e.institution}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
