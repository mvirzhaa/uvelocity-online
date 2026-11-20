import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createPool } from '../server/db/pool.js';
import { AccountService } from '../server/services/accounts.js';

// Explicit operator action only. There is no seeded or hardcoded admin account.
// Non-interactive deployments should provide ADMIN_EMAIL, ADMIN_DISPLAY_NAME and
// ADMIN_PASSWORD through their secret manager; the password is never printed.
let email=process.env.ADMIN_EMAIL,displayName=process.env.ADMIN_DISPLAY_NAME,password=process.env.ADMIN_PASSWORD;
if ((!email||!displayName||!password)&&stdin.isTTY) {
  const prompt=createInterface({input:stdin,output:stdout});
  try {
    email??=await prompt.question('Admin email: ');
    displayName??=await prompt.question('Admin display name: ');
  } finally {prompt.close();}
  if (!password) {
    stdout.write('Admin password (12–128 characters, hidden): ');
    stdin.setRawMode(true);stdin.resume();
    password=await new Promise<string>((resolve,reject)=>{
      let value='';
      const onData=(chunk:Buffer)=>{
        for(const character of chunk.toString('utf8')) {
          if(character==='\r'||character==='\n') {cleanup();resolve(value);return;}
          if(character==='\u0003') {cleanup();reject(new Error('Cancelled.'));return;}
          if(character==='\u007f'||character==='\b')value=Array.from(value).slice(0,-1).join('');
          else if(character>=' ')value+=character;
        }
      };
      const cleanup=()=>{stdin.off('data',onData);stdin.setRawMode(false);stdin.pause();stdout.write('\n');};
      stdin.on('data',onData);
    });
  }
}
if (!email||!displayName||!password) throw new Error('Set ADMIN_EMAIL, ADMIN_DISPLAY_NAME and ADMIN_PASSWORD, or run this command in an interactive terminal.');
const pool=createPool();
try {
  const admin=await new AccountService(pool).createAdmin({email,displayName,password});
  console.info(`Administrator created: ${admin.id} (${admin.email}). Sign in through the normal login screen.`);
} catch(error) {console.error(error instanceof Error?error.message:'Administrator creation failed.');process.exitCode=1;}
finally {password=undefined;delete process.env.ADMIN_PASSWORD;await pool.end();}
