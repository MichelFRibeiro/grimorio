import https from 'node:https';
import http from 'node:http';

let keepAliveInterval = null;

/**
 * Inicializa a estratégia de auto-ping para manter o servidor ativo no plano gratuito do Render.
 * O Render desliga instâncias gratuitas após 15 minutos sem tráfego de entrada.
 * Este serviço envia uma requisição HTTP/HTTPS para o endpoint `/api/health` a cada 10 minutos.
 */
export function initKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  // Identifica a URL pública da aplicação
  const externalUrl = process.env.RENDER_EXTERNAL_URL ||
    process.env.APP_URL ||
    process.env.SELF_PING_URL ||
    (process.env.RENDER_SERVICE_NAME ? `https://${process.env.RENDER_SERVICE_NAME}.onrender.com` : null);

  // Intervalo em minutos (padrão: 10 minutos para ficar bem abaixo do limite de 15 min do Render)
  const intervalMinutes = parseInt(process.env.KEEP_ALIVE_INTERVAL_MINUTES, 10) || 10;
  const intervalMs = intervalMinutes * 60 * 1000;

  if (!externalUrl) {
    console.log('ℹ️ [KeepAlive] RENDER_EXTERNAL_URL / APP_URL não definidos.');
    console.log('ℹ️ [KeepAlive] Em ambiente local (localhost), o KeepAlive não é necessário.');
    console.log('ℹ️ [KeepAlive] No Render, RENDER_EXTERNAL_URL é injetado automaticamente ou você pode adicionar a variável APP_URL nas configurações do serviço.');
    return;
  }

  const pingUrl = externalUrl.endsWith('/')
    ? `${externalUrl}api/health`
    : `${externalUrl}/api/health`;

  console.log(`🛡️ [KeepAlive] Sistema Anti-Sleep ativado! Ping a cada ${intervalMinutes} minutos em: ${pingUrl}`);

  const executePing = () => {
    try {
      const isHttps = pingUrl.startsWith('https:');
      const client = isHttps ? https : http;

      const req = client.get(pingUrl, { timeout: 15000 }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          const now = new Date().toLocaleTimeString('pt-BR');
          if (res.statusCode >= 200 && res.statusCode < 400) {
            console.log(`⏰ [KeepAlive] [${now}] Auto-ping bem-sucedido (${res.statusCode}) - Servidor mantido acordado!`);
          } else {
            console.warn(`⚠️ [KeepAlive] [${now}] Auto-ping retornou status ${res.statusCode}`);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        console.warn('⚠️ [KeepAlive] Timeout no auto-ping (> 15 segundos)');
      });

      req.on('error', (err) => {
        console.warn(`⚠️ [KeepAlive] Falha ao enviar auto-ping: ${err.message}`);
      });
    } catch (err) {
      console.warn(`⚠️ [KeepAlive] Exceção durante auto-ping: ${err.message}`);
    }
  };

  // Primeiro ping após 25 segundos para garantir que o servidor já concluiu o boot
  setTimeout(executePing, 25 * 1000);

  // Pings recorrentes a cada 10 minutos
  keepAliveInterval = setInterval(executePing, intervalMs);
}
