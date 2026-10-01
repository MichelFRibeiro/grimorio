/**
 * Carrega o .env da raiz do projeto SEM sobrescrever variáveis já definidas.
 * Precisa ser importado antes de db.js, porque o pool Postgres é decidido
 * na primeira chamada a getPool() e os testes removem DATABASE_URL antes
 * de qualquer import do servidor.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

export function loadEnvFile(filePath = envPath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const envContent = fs.readFileSync(filePath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  } catch (e) {
    console.warn('Não foi possível ler o arquivo .env:', e.message);
  }
}

loadEnvFile();
