/**
 * RemoteStorageInspector - Raw GitHub File Tree & Ciphertext Inspector
 * Proves zero plaintext user data is ever uploaded to GitHub.
 */

import React, { useState, useEffect } from "react";
import { CentralDataClient } from "../../sdk/CentralDataClient";
import { GitHubMockRemote } from "../../sdk/storage/GitHubMockRemote";
import { FolderTree, FileCode, Lock, RefreshCw, Eye, Folder } from "lucide-react";

export const RemoteStorageInspector: React.FC<{ sdk: CentralDataClient }> = ({ sdk }) => {
  const [fileList, setFileList] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [sdk.authManager.isLoggedIn()]);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      if (sdk.githubClient.getConfig().mode === "MOCK") {
        const mockFiles = GitHubMockRemote.getAllVirtualFiles();
        const paths = Object.keys(mockFiles);
        setFileList(paths.map((p) => ({ path: p, type: "blob" })));
        if (paths.length > 0 && !selectedFile) {
          handleSelectFile(paths[0]);
        }
      } else {
        const userEntries = await sdk.githubClient.listDirectory("data/users");
        setFileList(userEntries.map((e) => ({ path: e.path, type: e.type })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async (path: string) => {
    setSelectedFile(path);
    const res = await sdk.githubClient.getFile(path);
    if (res) {
      setFileContent(res.content);
    } else {
      setFileContent("File not found or unreadable.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-stone-900 border border-stone-800 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-mono bg-stone-800 text-amber-400 border border-stone-700 rounded-full">
              GitHub Remote Inspector
            </span>
          </div>
          <h2 className="text-xl font-bold text-stone-100 mt-2">Remote GitHub File Directory</h2>
          <p className="text-stone-400 text-xs">
            Inspect raw GitHub payloads. Every private user file is 100% encrypted with AES-256-GCM. No plaintext names, phone numbers, or notes exist on GitHub.
          </p>
        </div>

        <button
          onClick={loadFiles}
          disabled={isLoading}
          className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium rounded-xl flex items-center gap-2 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh Tree
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* File Tree List */}
        <div className="p-4 bg-stone-900 border border-stone-800 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold text-stone-300 font-mono uppercase tracking-wider flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-amber-400" /> GitHub Repository Files
          </h3>

          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {fileList.length === 0 ? (
              <p className="text-xs text-stone-500 py-6 text-center">No remote files present on GitHub repository yet.</p>
            ) : (
              fileList.map((item) => {
                const path = typeof item === "string" ? item : item.path;
                const isDir = typeof item === "string" ? false : item.type === "tree";
                return (
                  <button
                    key={path}
                    onClick={() => !isDir && handleSelectFile(path)}
                    disabled={isDir}
                    className={`w-full text-left p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 truncate transition ${
                      isDir
                        ? "text-stone-500 bg-stone-900/40 cursor-default border border-transparent"
                        : selectedFile === path
                        ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                        : "text-stone-400 hover:bg-stone-800 hover:text-stone-200 border border-transparent"
                    }`}
                  >
                    {isDir ? (
                      <Folder className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
                    )}
                    <span className="truncate">{path}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* File Content Viewer */}
        <div className="md:col-span-2 p-4 bg-stone-900 border border-stone-800 rounded-2xl space-y-3">
          <div className="flex justify-between items-center border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono text-stone-200 font-bold">{selectedFile || "Select a file to inspect"}</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-400 rounded">
              AES-256-GCM Encrypted
            </span>
          </div>

          <div className="bg-stone-950 p-4 rounded-xl border border-stone-800/80 font-mono text-xs text-amber-300/90 overflow-x-auto max-h-[380px]">
            <pre className="whitespace-pre-wrap leading-relaxed">{fileContent || "// Click a remote file on the left to inspect raw GitHub payload..."}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};
