import { readFileSync } from 'fs';
import path from 'path';

async function main() {
  // 1) 必须在 crypto 模块求值前注入 ENCRYPTION_KEY，否则会用与本服务不同的密钥加密
  const envText = readFileSync(path.resolve('.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k === 'ENCRYPTION_KEY') process.env.ENCRYPTION_KEY = v;
  }

  const { encrypt } = await import('./server/src/lib/crypto.ts');
  const { initDb } = await import('./server/src/db/index.ts');
  const { resolveProvider } = await import('./server/src/providers/index.ts');

  const db = initDb(); // 初始化单例（dev 模式只校验 migrations，不重跑）
  const distinct: string[] = db.prepare('select distinct platform from models').all().map((r: any) => r.platform);

  let inserted = 0;
  for (const p of distinct) {
    const prov: any = resolveProvider(p as any);
    if (!prov || prov.keyless !== true) continue; // 仅处理 keyless 平台
    const existing = db.prepare('select id from api_keys where platform = ?').get(p);
    if (existing) {
      console.log('skip (already has row):', p);
      continue;
    }
    // 与服务端 keyless 流程一致：存 'no-key' 哨兵，上游匿名访问
    const { encrypted, iv, authTag } = encrypt('no-key');
    const res = db.prepare(
      `INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, proxy_encrypted, proxy_iv, proxy_auth_tag)
       VALUES (?, ?, ?, ?, ?, 'unknown', 1, NULL, NULL, NULL)`
    ).run(p, `${p} (keyless sentinel)`, encrypted, iv, authTag);
    console.log('INSERTED keyless sentinel for', p, '-> api_keys.id =', Number(res.lastInsertRowid));
    inserted++;
  }
  console.log('DONE. inserted =', inserted);
}

main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
