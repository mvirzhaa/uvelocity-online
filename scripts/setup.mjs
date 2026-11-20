import {randomBytes} from 'node:crypto';
import {writeFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';

// Safe first-run configuration: preserves existing files and never prints secrets.
const args=process.argv.slice(2);
if(args.includes('--help')){
 console.log('UVelocity setup\n  node scripts/setup.mjs [--origin http://localhost:3000] [--output .env]\nCreates a new configuration file without replacing an existing file.');
 process.exit(0);
}
function option(name,fallback){const index=args.indexOf(name);if(index<0)return fallback;if(!args[index+1]||args[index+1].startsWith('--'))throw new Error('Missing value for '+name);return args[index+1];}
for(let i=0;i<args.length;i++){if(!['--origin','--output'].includes(args[i]))throw new Error('Unknown option: '+args[i]);i++;}
const origin=new URL(option('--origin','http://localhost:3000'));
if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Origin must be an HTTP(S) address without a path, credentials, query, or fragment.');
const target=path.resolve(option('--output','.env'));
try{await access(target,constants.F_OK);console.error('Configuration already exists. It was preserved. Edit it directly, or choose a new --output path.');process.exit(1);}catch(error){if(error.code!=='ENOENT')throw error;}
const secret=randomBytes(32).toString('hex'),https=origin.protocol==='https:',local=['localhost','127.0.0.1','[::1]'].includes(origin.hostname),port=Number(origin.port||3000);
const values=[
 '# Generated for UVelocity. Keep this file private; it contains database credentials.',
 'NODE_ENV=production',
 'APP_ORIGIN='+origin.origin,
 'ALLOWED_ORIGINS='+origin.origin,
 'PUBLIC_HOST='+origin.hostname,
 'PORT=3000',
 'PUBLIC_PORT='+(https?3000:port),
 'BIND_ADDRESS='+(https||local?'127.0.0.1':'0.0.0.0'),
 'POSTGRES_USER=uvelocity',
 'POSTGRES_DB=uvelocity',
 'POSTGRES_PASSWORD='+secret,
 'DATABASE_URL=postgresql://uvelocity:'+secret+'@127.0.0.1:5432/uvelocity',
 'COOKIE_SECURE='+String(https),
 'TRUST_PROXY='+(https?'1':'0'),
 ''
];
await writeFile(target,values.join('\n'),{flag:'wx',mode:0o600});
console.log('UVelocity configuration created for '+origin.origin+'.');
console.log('Next: docker compose up --build -d');
console.log('Then: docker compose exec app node dist/server/scripts/admin-create.js');
if(https)console.log('For the supplied HTTPS proxy: docker compose -f compose.yaml -f compose.https.yaml up --build -d');
