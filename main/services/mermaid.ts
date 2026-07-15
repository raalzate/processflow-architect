import path from 'path';
import { execFile } from 'child_process';
import { isDev, getResourcePath } from '../config';

export function getMmdcPath() {
  const mermaidCliDir = "node_modules";
  
  if (!isDev) {
    return path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      mermaidCliDir,
      "@mermaid-js",
      "mermaid-cli",
      "src",
      "cli.js"
    );
  }

  return path.join(process.cwd(), mermaidCliDir, "@mermaid-js", "mermaid-cli", "src", "cli.js");
}

export function runMermaid(input: string, output: string) {
  const mmdcPath = getMmdcPath();
  return new Promise((resolve, reject) => {
    execFile(
      mmdcPath,
      ["-i", input, "-o", output, "--backgroundColor", "white"],
      (err, stdout, stderr) => {
        if (err) return reject(new Error(err.message + " command => " + mmdcPath));
        resolve(stdout || mmdcPath);
      }
    );
  });
}