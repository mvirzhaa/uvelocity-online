import 'dotenv/config';
import {createApplication} from './index.js';
process.env.NODE_ENV='development';
const application=await createApplication({development:true});
const port=Number(process.env.PORT||3000);
await application.listen(port);
console.log(`UVelocity development server: ${process.env.APP_ORIGIN||'http://localhost:'+port}`);
let closing=false;
async function stop(){if(closing)return;closing=true;await application.close();process.exitCode=0;}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
