'use strict';
// One-click, opt-in Cloudflare Quick Tunnel for RAMpage's localhost-only web library.
// Cloudflare URL is PUBLIC; existing RAMpage password/session/CSRF protect metadata.
// Tunnel is volatile and dies when RAMpage exits, no account or router access needed.
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const URL_PATTERN = /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/i;
class RemoteQuickTunnel {
  constructor({ exePath, getLocalUrl, spawnProcess=spawn, timeoutMs=45000, log=()=>{} }) {
    if (!exePath || typeof getLocalUrl !== 'function') throw Error('Quick Tunnel requires binary and local URL');
    this.exePath=exePath; this.getLocalUrl=getLocalUrl; this.spawnProcess=spawnProcess;
    this.timeoutMs=timeoutMs; this.log=log; this.process=null;this.url=null;this.connecting=null;
  }
  status() { return { connected:!!this.url&&!!this.process, connecting:!!this.connecting,
    url:this.process?this.url:null, available:fs.existsSync(this.exePath) }; }
  async start() {
    if (this.connecting) return this.connecting;
    if (this.process && this.url) return this.status();
    const local=this.getLocalUrl();
    if (!local || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(local)) throw Error('Enable the password-protected web library first');
    if (!fs.existsSync(this.exePath)) throw Error('Cloudflare tunnel component missing from RAMpage installation. Reinstall this version.');
    // NEVER bind RAMpage itself to the LAN or a public interface.
    const child=this.spawnProcess(this.exePath, ['tunnel','--no-autoupdate','--url',local.slice(0,-1)],
      {windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NO_AUTOUPDATE:'true'}});
    this.process=child;this.url=null;
    this.connecting=new Promise((resolve,reject)=>{
      let settled=false,logs='';
      const fail=(err)=>{
        if (settled) return;
        settled=true;clearTimeout(timer);
        if (this.process===child){this.process=null;this.url=null;}
        try{child.kill()}catch{}
        reject(err instanceof Error ? err : Error(String(err)));
      };
      const accept=(data)=>{
        logs=(logs+String(data)).slice(-10000);
        const match=logs.match(URL_PATTERN);
        if (match && !settled){
          settled=true;clearTimeout(timer);
          this.url=match[0];
          this.log('Remote library temporary HTTPS link ready (password required)');
          resolve(this.status());
        }
      };
      const timer=setTimeout(()=>fail(Error('Secure link could not connect. Check Internet access or firewall settings.')),this.timeoutMs);
      child.stdout?.on('data',accept);child.stderr?.on('data',accept);
      child.once('error',err=>fail(Error('Unable to start secure tunnel: '+err.message)));
      child.once('exit',(code)=>{
        const wasReady=settled && !!this.url;
        if(this.process===child){this.process=null;this.url=null;}
        if(!settled)fail(Error('Secure tunnel exited before its URL was ready (code '+code+').'));
        else if(wasReady)this.log('Remote library secure link disconnected');
      });
    }).finally(()=>{this.connecting=null;});
    return this.connecting;
  }
  stop(){
    const child=this.process;this.process=null;this.url=null;
    if(child)try{child.kill()}catch{}
    this.log('Remote library temporary tunnel stopped');
    return this.status();
  }
}
module.exports={RemoteQuickTunnel,URL_PATTERN};
