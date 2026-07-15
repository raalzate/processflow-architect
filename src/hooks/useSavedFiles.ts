import { useCallback, useState } from "react";
import type { SavedFile } from "@/lib/types";
import {
  STORAGE_SAVED_FILES,
  STORAGE_LAST_FILE_ID,
} from "@/lib/graph-constants";

export function useSavedFiles(initial: SavedFile[] = []) {
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_FILES);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SavedFile[];
      if (parsed && typeof parsed === "object") return [parsed as SavedFile];
      return initial;
    } catch {
      return initial;
    }
  });

  const [currentFileId, setCurrentFileId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_LAST_FILE_ID);
    } catch {
      return null;
    }
  });

  const saveFilesToStorage = useCallback((files: SavedFile[]) => {
    setSavedFiles(files);
    try {
      // Safe stringify to avoid errors with circular refs or non-serializable values
      const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (_key: string, value: any) => {
          if (typeof value === "function") return undefined;
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }
          return value;
        };
      };
      const json = JSON.stringify(files, getCircularReplacer());
      localStorage.setItem(STORAGE_SAVED_FILES, json);
      // small debug trace to help diagnose persistence issues
      // (kept as console.debug so it doesn't clutter production logs)
      console.debug("Saved files to localStorage", { count: files.length });
    } catch (e) {
      console.error("Error saving files to localStorage", e);
    }
  }, []);

  const addFile = useCallback((file: SavedFile) => {
    const next = [...savedFiles, file];
    saveFilesToStorage(next);
    setCurrentFileId(file.id);
    try {
      localStorage.setItem(STORAGE_LAST_FILE_ID, file.id);
    } catch (e) {
      console.error("Error saving last file id", e);
    }
  }, [savedFiles, saveFilesToStorage]);

  const deleteFile = useCallback((id: string) => {
    const next = savedFiles.filter((f) => f.id !== id);
    saveFilesToStorage(next);
    if (currentFileId === id) {
      setCurrentFileId(null);
      try {
        localStorage.removeItem(STORAGE_LAST_FILE_ID);
      } catch (e) {
        console.error("Error removing last file id", e);
      }
    }
  }, [savedFiles, saveFilesToStorage, currentFileId]);

  const selectFile = useCallback((id: string | null) => {
    setCurrentFileId(id);
    try {
      if (id) localStorage.setItem(STORAGE_LAST_FILE_ID, id);
      else localStorage.removeItem(STORAGE_LAST_FILE_ID);
    } catch (e) {
      console.error("Error setting last file id", e);
    }
  }, []);

  return {
    savedFiles,
    setSavedFiles: saveFilesToStorage,
    currentFileId,
    setCurrentFileId: selectFile,
    addFile,
    deleteFile,
  };
}
