'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = process.argv[2]; if(!root)throw Error('Missing official app root');
const specs = [
 ['remote-library.js',["constructor({ dataDir","this.port=port","requireSession(req)","/api/hydra/draft/status","/api/hydra/index","this.checkOrigin(req)","async handle", "async route"]],
 ['remote/index.html',["client.js","hydra-game-tools","</body>"]],
 ['remote/client.js',["async function init(){","async function openEditor(","function openEditor(","hydraTools.hidden","state.csrf","function call("]],
 ['main.js',["getHydraIndex: (query)","hydraDraftEnabled:"]],
];
for(const [file,terms] of specs) {
 const text=fs.readFileSync(path.join(root,'src',file),'utf8').replace(/\r\n/g,'\n');
 console.log('\nFILE',file,'SIZE',text.length);
 for(const term of terms) {
  const p=text.indexOf(term);
  console.log('ANCHOR',JSON.stringify(term),p,'COUNT',text.split(term).length-1);
  if(p!==-1) console.log(text.slice(Math.max(0,p-220),p+700));
 }
}
