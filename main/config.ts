import { app } from 'electron';
import path from 'path';
import serve from "electron-serve";

export const isDev = !app.isPackaged;

export const appServe = serve({
  directory: path.join(__dirname, "..", "out") // Ajusta ".." según tu estructura de build
});

export function getResourcePath() {
  return isDev ? process.cwd() : process.resourcesPath;
}