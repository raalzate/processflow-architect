import { useCallback, useState } from "react";
import type { SavedFile } from "@/lib/types";
import {
  STORAGE_SAVED_FILES,
  STORAGE_LAST_FILE_ID,
  STORAGE_ORG_FILTER,
} from "@/lib/graph-constants";
import { ORG_TODAS, type OrgFilter } from "@/lib/project-orgs";

export function useSavedFiles(initial: SavedFile[] = []) {
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_FILES);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      // Los proyectos de antes de las organizaciones no tienen `orgId`, y uno con
      // basura ahí no puede volverse una organización fantasma: se normaliza al leer.
      const sanear = (f: SavedFile): SavedFile =>
        typeof f?.orgId === "string" && f.orgId.trim() ? { ...f, orgId: f.orgId.trim() } : { ...f, orgId: undefined };
      if (Array.isArray(parsed)) return (parsed as SavedFile[]).map(sanear);
      if (parsed && typeof parsed === "object") return [sanear(parsed as SavedFile)];
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

  // Filtro de organización del header. Es estado de VISTA: se persiste para que la
  // app abra donde el humano la dejó, y no mueve ni renombra nada.
  const [orgFilter, setOrgFilterState] = useState<OrgFilter>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ORG_FILTER);
      if (raw === null) return ORG_TODAS;
      return raw === "" ? null : (raw as OrgFilter);
    } catch {
      return ORG_TODAS;
    }
  });

  const setOrgFilter = useCallback((filtro: OrgFilter) => {
    setOrgFilterState(filtro);
    try {
      localStorage.setItem(STORAGE_ORG_FILTER, filtro === null ? "" : filtro);
    } catch (e) {
      console.error("Error saving org filter", e);
    }
  }, []);

  /** Mueve un proyecto a otra organización (o lo saca de todas, con `null`). */
  const setFileOrg = useCallback(
    (id: string, orgId: string | null) => {
      saveFilesToStorage(
        savedFiles.map((f) => (f.id === id ? { ...f, orgId: orgId ?? undefined } : f))
      );
    },
    [savedFiles, saveFilesToStorage]
  );

  return {
    savedFiles,
    setSavedFiles: saveFilesToStorage,
    currentFileId,
    setCurrentFileId: selectFile,
    addFile,
    deleteFile,
    orgFilter,
    setOrgFilter,
    setFileOrg,
  };
}
