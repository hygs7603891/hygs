import { readFileSync, existsSync } from 'fs';
import path from 'path';

// 从本地 provider_keys.json 导入真实 provider key 到 FreeLLMAPI 的 api_keys 表。
// 复用服务端 crypto + ENCRYPTION_KEY，确保加密密钥与运行时一致。
// 路由层按 `platform` 实时查 api_keys，插入后无需重启服务即可生效（与 keyless 哨兵同理）。

async function main() {
  // 1) 必须先注入 ENCRYPTION_KEY 再 import crypto，否则加密密钥不一致
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
  const db = initDb();

  const file = process.argv[2] || './provider_keys.json';
  if (!existsSync(file)) {
    console.error('KEY FILE NOT FOUND:', file);
    console.error('请先创建该文件，格式见 provider_keys.json.example');
    process.exit(1);
  }
  const keys: Array<{ platform: string; key: string; base_url?: string | null }> =
    JSON.parse(readFileSync(file, 'utf8'));

  // 校验 platform 是否在 catalog 里（避免拼错平台名导致插了也路由不到）
  const known = new Set(
    db.prepare('select distinct platform from models').all().map((r: any) => r.platform)
  );

  let inserted = 0, updated = 0, skipped = 0;
  for (const { platform, key, base_url } of keys) {
    if (!platform || !key) { console.log('skip (empty):', JSON.stringify({ platform, key: key ? '***' : '' })); skipped++; continue; }
    if (!known.has(platform)) {
      console.log('WARN platform not in catalog, skip:', platform, '(catalog has: ' + [...known].join(', ') + ')');
      skipped++; continue;
    }
    const { encrypted, iv, authTag } = encrypt(key);
    const existing = db.prepare('select id from api_keys where platform = ?').get(platform);
    if (existing) {
      db.prepare(
        `UPDATE api_keys SET encrypted_key=?, iv=?, auth_tag=?, status='unknown', enabled=1, base_url=?, last_health_error=NULL WHERE platform=?`
      ).run(encrypted, iv, authTag, base_url ?? null, platform);
      console.log('UPDATED  ', platform);
      updated++;
    } else {
      db.prepare(
        `INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, base_url, proxy_encrypted, proxy_iv, proxy_auth_tag)
         VALUES (?, ?, ?, ?, ?, 'unknown', 1, ?, NULL, NULL, NULL)`
      ).run(platform, `${platform} (imported)`, encrypted, iv, authTag, base_url ?? null);
      console.log('INSERTED ', platform);
      inserted++;
    }
  }
  console.log(`\nDONE. inserted=${inserted} updated=${updated} skipped=${skipped}`);

  // 汇总当前可路由模型数
  const routable = db.prepare(
    `select count(*) c from models m where exists(select 1 from api_keys k where k.platform=m.platform and k.enabled=1)`
  ).get().c;
  console.log('可路由模型总数 =', routable);
}

main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
