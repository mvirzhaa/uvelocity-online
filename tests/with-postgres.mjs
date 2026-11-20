/** Runs real native PostgreSQL and all test children inside one network namespace. */
import EmbeddedPostgres from 'embedded-postgres';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const directory=await mkdtemp(path.join(os.tmpdir(),'uvelocity-pg-'));
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const password=randomBytes(32).toString('hex');
const postgres=new EmbeddedPostgres({databaseDir:path.join(directory,'data'),user:'uvelocity_tests',password,port,authMethod:'scram-sha-256',persistent:false,autoRehydrateSymlinks:true,postgresFlags:['-c','listen_addresses=127.0.0.1','-c','unix_socket_directories='],onLog:()=>{},onError:(error)=>{if(String(error).includes('FATAL'))console.error(String(error));}});
let code=1;
try{
 await postgres.initialise();await postgres.start();await postgres.createDatabase('uvelocity_tests');
 const connection=`postgresql://uvelocity_tests:${password}@127.0.0.1:${port}/uvelocity_tests`;
 const args=process.argv.slice(2);if(!args.length)throw new Error('Pass a node script or --test files.');
 code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx',...args],{stdio:'inherit',env:{...process.env,DATABASE_URL:connection,TEST_DATABASE_URL:connection,NODE_ENV:'test',COOKIE_SECURE:'false'}});child.once('error',reject);child.once('exit',(status)=>resolve(status??1));});
}finally{await postgres.stop().catch(()=>{});await rm(directory,{recursive:true,force:true});}
process.exitCode=code;
