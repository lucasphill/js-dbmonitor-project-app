'use strict';
const { validateSsmImportPatch } = require('./profile-validation.cjs');
const MESSAGES = {
  SSM_IMPORT_INVALID_INPUT: 'Texto de importação inválido.',
  SSM_IMPORT_INVALID_SYNTAX: 'Sintaxe do comando SSM inválida.',
  SSM_IMPORT_UNSUPPORTED_COMMAND: 'Comando SSM não suportado.',
  SSM_IMPORT_UNSAFE_CONTENT: 'O comando contém conteúdo não permitido.',
};
function fail(code = 'SSM_IMPORT_INVALID_SYNTAX') {
  const error = new Error(MESSAGES[code]); error.code = code; throw error;
}
const unsupported = () => fail('SSM_IMPORT_UNSUPPORTED_COMMAND');

// Keep quoting intact until the relevant argument grammar reads it. JSON's
// quotes must not be stripped by a shell-like tokenizer.
function tokenize(text) {
  const tokens = []; let current = '', quote = null, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i+1] && (quote === '"' || quote === null) && ['"','\\'].includes(text[i+1])) {
      current += ch + text[++i]; continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') { if (--depth < 0) fail(); }
    if (/\s/.test(ch) && depth === 0) {
      if (current) { tokens.push(current); current = ''; }
    } else current += ch;
  }
  if (quote || depth) fail();
  if (current) tokens.push(current);
  return tokens;
}
function literal(raw) {
  let result='', quote=null;
  for (let i=0;i<raw.length;i++) {
    const ch=raw[i];
    if (ch==='\\') {
      if (quote!=="'" && ['"',"'",'\\'].includes(raw[i+1])) {result+=raw[++i];continue;}
      fail();
    }
    if (quote) {if(ch===quote)quote=null;else result+=ch;}
    else if(ch==='"'||ch==="'")quote=ch;
    else result+=ch;
  }
  if(quote)fail(); return result;
}
function unwrapped(raw) {
  // Only unwrap a delimiter that encloses the entire parameter argument.
  if (raw[0] === "'" && raw.at(-1) === "'" && !raw.slice(1,-1).includes("'")) return raw.slice(1,-1);
  if (raw[0] === '"' && raw.at(-1) === '"') {
    let closes = -1;
    for(let i=1;i<raw.length;i++) {if(raw[i]==='\\'){i++;continue;}if(raw[i]==='"'){closes=i;break;}}
    if(closes===raw.length-1) return literal(raw);
  }
  return raw;
}
const PARAMS = {host:'host',portNumber:'port',localPortNumber:'ssmLocalPort'};
function jsonParameters(text) {
  let pos=0; const result={}; const seen=new Set();
  const ws=()=>{while(/\s/.test(text[pos]??'') && pos<text.length)pos++;};
  const char=(value)=>{ws();if(text[pos++]!==value)fail();};
  const string=()=>{
    ws();if(text[pos]!=='"')fail();const start=pos++;
    while(pos<text.length){if(text[pos]==='\\'){pos+=2;continue;}if(text[pos++]==='"'){try{return JSON.parse(text.slice(start,pos));}catch{fail();}}}
    fail();
  };
  char('{'); ws();
  if(text[pos]!=='}') {
    while(true) {
      const key=string(); if(seen.has(key))fail();seen.add(key);
      if(!Object.hasOwn(PARAMS,key))unsupported();char(':');ws();
      let value;
      if(text[pos]==='[') {char('[');value=string();char(']');}
      else value=string();
      result[PARAMS[key]]=value;ws();
      if(text[pos]===','){pos++;continue;}break;
    }
  }
  char('}');ws();if(pos!==text.length)fail();return result;
}
function shorthandParameters(text) {
  const chunks=[];let start=0,quote=null,depth=0;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(ch==='\\' && quote!=="'" && ['"',"'",'\\'].includes(text[i+1])){i++;continue;}
    if(quote){if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='[')depth++;
    if(ch===']')depth--;
    if(ch===','&&depth===0){chunks.push(text.slice(start,i));start=i+1;}
  }
  if(quote||depth)fail(); chunks.push(text.slice(start));
  const result={},seen=new Set();
  for(const chunk of chunks) {
    const eq=chunk.indexOf('=');if(eq<1)fail();
    const key=chunk.slice(0,eq).trim();if(seen.has(key))fail();seen.add(key);
    if(!Object.hasOwn(PARAMS,key))unsupported();
    let raw=chunk.slice(eq+1).trim();if(!raw)fail();
    if(raw.startsWith('[')) {if(!raw.endsWith(']'))fail();raw=raw.slice(1,-1).trim();if(!raw)fail();}
    // A list may contain only one literal; commas outside quotes are invalid.
    let quote=null;
    for(let i=0;i<raw.length;i++) {
      if(raw[i]==='\\'&&quote!=="'"&&['"',"'",'\\'].includes(raw[i+1])){i++;continue;}
      if(quote){if(raw[i]===quote)quote=null;continue;}
      if(raw[i]==='"'||raw[i]==="'")quote=raw[i];
      else if(/[\s,\[\]{}]/.test(raw[i]))fail();
    }
    if(quote)fail();result[PARAMS[key]]=literal(raw);
  }
  return result;
}
function parameters(raw) {
  const text=unwrapped(raw);
  if(/^fileb?:\/\//i.test(text))unsupported();
  return text.startsWith('{') ? jsonParameters(text) : shorthandParameters(text);
}
function parseSsmCommand(input) {
  if(typeof input!=='string'||!input.trim()||Buffer.byteLength(input,'utf8')>16384||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input)||/\r(?!\n)/.test(input))fail('SSM_IMPORT_INVALID_INPUT');
  // Prohibited markers stay prohibited even inside quotes or escaped literals.
  if(/[;|&<>$%]/.test(input)||/--(?:aws-)?(?:access-key|secret|session-token)|AWS_(?:ACCESS_KEY|SECRET|SESSION_TOKEN)/i.test(input))fail('SSM_IMPORT_UNSAFE_CONTENT');
  let normalized='',quote=null;
  for(let i=0;i<input.length;i++) {
    const ch=input[i];
    if(!quote&&(ch==='\\'||ch==='`')&&(input[i+1]==='\n'||input.slice(i+1,i+3)==='\r\n')) {i+=input[i+1]==='\r'?2:1;normalized+=' ';continue;}
    if(ch==='`')fail('SSM_IMPORT_UNSAFE_CONTENT');
    if(ch==='\n'||ch==='\r') {
      // Trailing/leading whitespace is harmless; a new command line is not.
      if(normalized.trim()&&input.slice(i).trim())fail();
      normalized+=' ';continue;
    }
    if(ch==='\\'&&input[i+1]&&(quote==='"'||quote===null)&&['"','\\'].includes(input[i+1])) {normalized+=ch+input[++i];continue;}
    if(quote){if(ch===quote)quote=null;}else if(ch==='"'||ch==="'")quote=ch;
    normalized+=ch;
  }
  const tokens=tokenize(normalized);
  if(!['aws','aws.exe'].includes(tokens[0])||tokens[1]!=='ssm'||tokens[2]!=='start-session')unsupported();
  const opts={},allowed=new Set(['region','target','profile','document-name','parameters']);
  for(let i=3;i<tokens.length;i++) {
    const match=/^--([a-z-]+)(?:=(.*))?$/.exec(tokens[i]);if(!match)fail();
    const name=match[1];if(!allowed.has(name))unsupported();if(Object.hasOwn(opts,name))fail();
    const raw=match[2]!==undefined?match[2]:tokens[++i];
    if(raw===undefined||raw===''||raw.startsWith('--'))fail();
    opts[name]=name==='parameters'?parameters(raw):literal(raw);
  }
  if(opts['document-name']!=='AWS-StartPortForwardingSessionToRemoteHost')unsupported();
  const patch={};
  for(const [key,field] of [['region','awsRegion'],['target','ssmTarget'],['profile','awsProfile']]) if(Object.hasOwn(opts,key))patch[field]=opts[key];
  if(opts.parameters)Object.assign(patch,opts.parameters);
  for(const field of ['port','ssmLocalPort']) if(Object.hasOwn(patch,field)) {
    if(!/^\d+$/.test(patch[field])) {const error=new Error(field==='port'?'Porta inválida':'Porta local inválida');error.code='INVALID_INPUT';throw error;}
    patch[field]=Number(patch[field]);
  }
  const validated=validateSsmImportPatch(patch);
  return {patch:validated,presentFields:Object.keys(validated),missingFields:['host','awsRegion','ssmTarget'].filter(field=>!Object.hasOwn(validated,field))};
}
module.exports={parseSsmCommand};
