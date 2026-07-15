import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import util from 'util';
import { isDev } from './config';

export function setupProdLogger() {
  if (isDev) return;

  const logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFilePath = path.join(logDir, `app_${new Date().toISOString().slice(0, 10)}.log`);
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;

  const logToFile = (level: string, ...args: any[]) => {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}]: ${args.map(a => typeof a === 'object' ? util.inspect(a, { depth: 5 }) : String(a)).join(' ')}\n`;
    logStream.write(logLine);

    if (level === 'error') originalConsoleError.apply(console, args);
    else if (level === 'warn') originalConsoleWarn.apply(console, args);
    else originalConsoleLog.apply(console, args);
  };

  console.log = (...args) => logToFile('info', ...args);
  console.error = (...args) => logToFile('error', ...args);
  console.warn = (...args) => logToFile('warn', ...args);

  console.log('✅ Logger de producción inicializado:', logFilePath);
}