const express = require("express");
const WebTorrent = require("webtorrent");
const path = require("path");
const app = express();
const client = new WebTorrent();
app.use(express.static(path.join(__dirname,"public")));
app.use(express.json({limit:"2mb"}));

let active = null;
app.post("/api/torrent", (req,res)=>{
  const magnet = (req.body && req.body.magnet || "").trim();
  if(!magnet.startsWith("magnet:?")) return res.status(400).json({error:"Invalid magnet link"});
  if(active) { try{client.remove(active.infoHash,()=>{});}catch(e){} active=null; }
  try {
    active=client.add(magnet, t=>{
      res.json({infoHash:t.infoHash,name:t.name,files:t.files.map((f,i)=>({id:i,name:f.name,length:f.length}))});
    });
    active.on("error",err=>console.error("torrent:",err.message));
  } catch(e){res.status(500).json({error:e.message});}
});
app.post("/api/stop",(req,res)=>{if(active){try{client.remove(active.infoHash,()=>{});}catch(e){} active=null;}res.json({ok:true});});
app.get("/api/status", (req,res)=>{
  if(!active) return res.json({active:false});
  res.json({active:true,name:active.name,progress:active.progress,downloaded:active.downloaded,
    downloadSpeed:active.downloadSpeed,uploadSpeed:active.uploadSpeed,numPeers:active.numPeers,
    files:active.files.map((f,i)=>({id:i,name:f.name,length:f.length}))});
});
app.get("/stream/:id", (req,res)=>{
  if(!active) return res.status(404).send("No active torrent");
  const file=active.files[Number(req.params.id)];
  if(!file) return res.status(404).send("File not found");
  const range=req.headers.range;
  if(!range) {
    res.setHeader("Content-Length",file.length);
    res.setHeader("Content-Type",mime(file.name));
    return file.createReadStream().pipe(res);
  }
  const m=/bytes=(\d*)-(\d*)/.exec(range);
  if(!m) return res.status(416).end();
  let start=m[1]?parseInt(m[1],10):0;
  let end=m[2]?parseInt(m[2],10):file.length-1;
  end=Math.min(end,file.length-1);
  if(start>end||start>=file.length) return res.status(416).end();
  res.status(206);
  res.setHeader("Accept-Ranges","bytes");
  res.setHeader("Content-Range",`bytes ${start}-${end}/${file.length}`);
  res.setHeader("Content-Length",end-start+1);
  res.setHeader("Content-Type",mime(file.name));
  file.createReadStream({start,end}).pipe(res);
});
function mime(n){const e=path.extname(n).toLowerCase();return ({".mp4":"video/mp4",".m4v":"video/mp4",".webm":"video/webm",".mov":"video/quicktime",".ogv":"video/ogg",".mkv":"video/x-matroska",".mp3":"audio/mpeg"})[e]||"application/octet-stream";}
const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`Stream player listening on http://localhost:${port}`));
process.on("SIGINT",()=>{client.destroy(()=>process.exit());});
