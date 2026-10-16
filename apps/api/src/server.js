import { configuration } from './config.js';
import { buildApp } from './app.js';
const config=configuration();
const app=await buildApp({config,logger:{level:'info',redact:['req.headers','req.body','res.headers','password','token','csrf']}});
try { await app.listen({host:'127.0.0.1',port:config.port}); }
catch { app.log.error('API failed to start; check configuration and port availability.');process.exitCode=1;await app.close(); }
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await app.close();process.exitCode=0;});
